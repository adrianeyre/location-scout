import type { Locator, Page } from "@playwright/test";

import { drawnColour, expect, test } from "./fixtures";
import { arrived } from "./sale-markers";

/**
 * The Green space Layer against the recorded Overpass answer for NG17 1AA's
 * 0.5 mile Search Area (`overpass-ng17-1aa.json`): 6 parks, 3 playgrounds and
 * 4 woods reach into it, each with its outline, and the nearest park, which
 * OpenStreetMap names nothing, is 104 m away.
 */
const NG17_GREEN_SPACES = 6 + 3 + 4;

/** The colour `layer-styles.ts` draws green spaces' outlines in. */
const GREEN_SPACE_COLOUR = "#4d7c0f";

const searchNg17 = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);
};

const greenSpaceToggle = (page: Page) =>
  page.getByRole("checkbox", { name: "Green space" });

/** What the Green space Layer's toggle says about it. */
const greenSpaceStatus = (page: Page) =>
  page.locator("#layer-green-space-status");

/** Every cluster and point of the Green space Layer on the map. */
const greenSpaceMarkers = (map: Locator) =>
  map.locator(
    '.feature-cluster[data-layer="green-space"], .feature-marker[data-layer="green-space"]',
  );

/** Switches every other Layer off, so none of their markers or shapes hide Green space's. */
const onlyGreenSpace = async (page: Page) => {
  for (const name of [
    "Crime",
    "Planning",
    "Amenities",
    "Schools",
    "Transport",
    "Property",
  ]) {
    await page.getByRole("checkbox", { name }).uncheck();
  }
};

/**
 * Where green spaces' outlines are drawn. The Layer's markers and its icon
 * over the map are their colour too, so they are painted over first.
 */
const drawnOutlines = (page: Page, map: Locator) =>
  drawnColour(page, map, GREEN_SPACE_COLOUR, [
    greenSpaceMarkers(map),
    page.getByRole("group", { name: "Layers" }),
  ]);

/**
 * The point marker labelled `label`, zooming in on the Location, which is in
 * the middle of the map, until there is one.
 */
const markerLabelled = async (map: Locator, label: string) => {
  const marker = map.locator(
    `.feature-marker[data-layer="green-space"][aria-label="${label}"]`,
  );
  await expect(async () => {
    if ((await marker.count()) === 0) {
      // MapLibre zooms in one level, around the middle, on "=".
      await map.locator("canvas").press("Equal");
    }
    await expect(marker).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return marker;
};

/** Opens the marker's popup and returns it. */
const openPopup = async (page: Page, marker: Locator) => {
  await marker.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toBeVisible();
  await expect(
    popup.getByRole("heading", { name: "Green space" }),
  ).toBeVisible();
  return popup;
};

test("the Overview gives NG17 1AA's nearest park and its count of each type of green space", async ({
  page,
}) => {
  await searchNg17(page);

  await expect(greenSpaceToggle(page)).toBeChecked();
  await expect(greenSpaceStatus(page)).toHaveText(
    `${String(NG17_GREEN_SPACES)} green spaces`,
  );
  const greenSpace = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Green space" });
  await expect(greenSpace).toContainText("Nearest park: Unnamed park, 100 m.");
  await expect(greenSpace).toContainText(
    `${String(NG17_GREEN_SPACES)} green spaces mapped in the Search Area.`,
  );
  const table = greenSpace.getByRole("table", {
    name: "Green space in the Search Area",
  });
  await expect(table.getByRole("row")).toHaveCount(1 + 4);
  for (const name of [
    "Type In the Search Area",
    "Parks 6",
    "Playgrounds 3",
    "Nature reserves 0",
    "Woods 4",
  ]) {
    await expect(table.getByRole("row", { name, exact: true })).toBeVisible();
  }
  await expect(greenSpace).toContainText(
    "Green space comes from OpenStreetMap, which volunteers map",
  );
});

test("green spaces are drawn as shapes, each with a marker whose popup names it and says how far it is", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await onlyGreenSpace(page);
  await arrived(page, map);

  // The outlines are drawn around the Location.
  await expect(async () => {
    expect((await drawnOutlines(page, map))?.pixels).toBeGreaterThan(500);
  }).toPass({ timeout: 15_000 });

  // Each marker is looked for by zooming in on the Location, so the furthest
  // first, before zooming in far enough to split the nearer ones apart
  // pushes it out of view.
  const gardens = await openPopup(
    page,
    await markerLabelled(
      map,
      "St Mary's Memorial Gardens, Park, 350 m from the Location",
    ),
  );
  await expect(gardens.locator("li > strong")).toHaveText([
    "St Mary's Memorial Gardens",
  ]);
  await expect(gardens).toContainText("Park");
  await expect(gardens).toContainText("OpenStreetMap tag: leisure=park");
  await expect(gardens).toContainText(
    "Marked where it comes nearest the Location",
  );
  await expect(gardens).toContainText("350 m from the Location");

  const nearest = await openPopup(
    page,
    await markerLabelled(map, "Unnamed park, Park, 100 m from the Location"),
  );
  await expect(nearest.locator("li > strong")).toHaveText(["Unnamed park"]);
  await expect(nearest).toContainText("100 m from the Location");

  // Clicking markers opened their popups; it did not move the Location.
  await expect(page).toHaveURL(
    /\?lat=53\.123664&lng=-1\.264078&radius=0\.5&hidden=crime,planning,amenities,schools,transport,property$/,
  );
});

test("toggling the Green space Layer hides its markers and shapes, and the URL keeps it", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await onlyGreenSpace(page);
  await expect(async () => {
    expect(await drawnOutlines(page, map)).not.toBeNull();
  }).toPass({ timeout: 15_000 });

  await greenSpaceToggle(page).uncheck();

  await expect(greenSpaceMarkers(map)).toHaveCount(0);
  await expect(page).toHaveURL(
    /&hidden=crime,planning,amenities,schools,transport,green-space,property$/,
  );
  await expect(async () => {
    expect(await drawnOutlines(page, map)).toBeNull();
  }).toPass({ timeout: 5_000 });
  // Its statistics stay in the Overview and its toggle.
  await expect(greenSpaceStatus(page)).toHaveText(
    `${String(NG17_GREEN_SPACES)} green spaces`,
  );

  await greenSpaceToggle(page).check();

  await expect(async () => {
    expect(await drawnOutlines(page, map)).not.toBeNull();
  }).toPass({ timeout: 5_000 });
  await expect(greenSpaceMarkers(map)).not.toHaveCount(0);
});

test("with Overpass failing, the Green space Layer reads Unavailable and the rest of the page still works", async ({
  page,
}) => {
  // The fixture-backed API has no Overpass recording for this Search Area in
  // Mansfield, so the query fails as an unreachable one would.
  await page.goto("/?lat=53.1431&lng=-1.1982&radius=0.5");
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });

  await expect(greenSpaceStatus(page)).toHaveText("Unavailable");
  await expect(
    overview.getByRole("region", { name: "Green space" }),
  ).toContainText("Unavailable. Overpass API didn't answer");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    greenSpaceMarkers(page.getByTestId("search-area-map")),
  ).toHaveCount(0);
  await expect(overview).toContainText("NG18 1JJ");
});
