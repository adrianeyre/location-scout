import type { Locator, Page } from "@playwright/test";

import { drawnColour, expect, test } from "./fixtures";

/**
 * The Planning Layer against the recorded planning.data.gov.uk answer for
 * NG17 1AA's 0.5 mile Search Area (`planning-data-ng17-1aa.json`): the
 * Sutton in Ashfield Church and Market Place conservation area, which the
 * Location is inside, and 8 listed buildings.
 */
const NG17_CONSTRAINTS = 9;

const CONSERVATION_AREA = "Sutton in Ashfield Church and Market Place";

/** The colour `layer-styles.ts` draws a conservation area's outline in. */
const CONSERVATION_AREA_COLOUR = "#6a1b9a";

const searchNg17 = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);
};

const planningToggle = (page: Page) =>
  page.getByRole("checkbox", { name: "Planning" });

/** What the Planning Layer's toggle says about it. */
const planningStatus = (page: Page) => page.locator("#layer-planning-status");

/** Every cluster and point of the Planning Layer on the map. */
const planningMarkers = (map: Locator) =>
  map.locator(
    '.feature-cluster[data-layer="planning"], .feature-marker[data-layer="planning"]',
  );

/**
 * Where the conservation area's outline is drawn. The Planning Layer's
 * markers and its icon over the map are its colour too, so they are painted
 * over first.
 */
const drawnConservationArea = (page: Page, map: Locator) =>
  drawnColour(page, map, CONSERVATION_AREA_COLOUR, [
    planningMarkers(map),
    page.getByRole("group", { name: "Layers" }),
  ]);

/**
 * The point marker whose label starts with `name`, zooming in on the
 * Location, which is in the middle of the map, until there is one.
 */
const markerNamed = async (map: Locator, name: string) => {
  const marker = map.locator(
    `.feature-marker[data-layer="planning"][aria-label^="${name}"]`,
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

test("the Overview counts NG17 1AA's Planning Constraints per type, and says the Location is inside the conservation area", async ({
  page,
}) => {
  await searchNg17(page);

  await expect(planningToggle(page)).toBeChecked();
  await expect(planningStatus(page)).toHaveText(
    `${String(NG17_CONSTRAINTS)} planning constraints`,
  );
  const planning = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Planning" });
  await expect(planning).toContainText(
    `Location is inside: ${CONSERVATION_AREA} (conservation area).`,
  );
  const table = planning.getByRole("table", {
    name: "Planning Constraints in the Search Area",
  });
  await expect(table.getByRole("row")).toHaveCount(1 + 5);
  for (const name of [
    "Type In the Search Area Location inside",
    "Conservation areas 1 Yes",
    "Listed buildings 8 No",
    "Article 4 directions 0 No",
    "Tree preservation zones 0 No",
    "Flood zones 0 No",
  ]) {
    await expect(table.getByRole("row", { name, exact: true })).toBeVisible();
  }
  await expect(planning).toContainText(
    "Planning Constraints come from planning.data.gov.uk",
  );
});

test("the conservation area is drawn as a shape, and its popup and a listed building's name each one", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  // So no crime or sale is drawn over a Planning Constraint.
  await page.getByRole("checkbox", { name: "Crime" }).uncheck();
  await page.getByRole("checkbox", { name: "Property" }).uncheck();

  // Once the map has flown to the Search Area, the conservation area's
  // outline is drawn around the Location.
  await expect(async () => {
    const drawn = await drawnConservationArea(page, map);
    expect(drawn?.pixels).toBeGreaterThan(100);
  }).toPass({ timeout: 15_000 });

  // Its marker is at the Location, which it covers.
  const area = await markerNamed(map, CONSERVATION_AREA);
  await expect(area).toHaveAccessibleName(
    `${CONSERVATION_AREA}, Conservation area, 0 m from the Location`,
  );
  await area.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Planning" })).toBeVisible();
  await expect(popup.locator("li > strong")).toHaveText([CONSERVATION_AREA]);
  await expect(popup).toContainText("Conservation area");
  await expect(popup).toContainText("The Location is inside it");
  await expect(popup).toContainText("0 m from the Location");

  // A listed building nearby is a point of its own.
  await page.getByRole("button", { name: "Close popup" }).click();
  const listed = await markerNamed(map, "HUNTER'S BAR");
  await listed.click();
  await expect(popup.locator("li > strong")).toHaveText(["HUNTER'S BAR"]);
  await expect(popup).toContainText("Listed building, grade II");
  await expect(popup).toContainText("150 m from the Location");

  // Clicking a marker opened its popup; it did not move the Location.
  await expect(page).toHaveURL(
    /\?lat=53\.123664&lng=-1\.264078&radius=0\.5&hidden=crime,property$/,
  );
});

test("toggling the Planning Layer hides its shapes and markers, and the URL keeps it", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await expect(async () => {
    expect(await drawnConservationArea(page, map)).not.toBeNull();
  }).toPass({ timeout: 15_000 });

  await planningToggle(page).uncheck();

  await expect(planningMarkers(map)).toHaveCount(0);
  await expect(page).toHaveURL(/&hidden=planning$/);
  await expect(async () => {
    expect(await drawnConservationArea(page, map)).toBeNull();
  }).toPass({ timeout: 5_000 });
  // Its statistics stay in the Overview and its toggle.
  await expect(planningStatus(page)).toHaveText(
    `${String(NG17_CONSTRAINTS)} planning constraints`,
  );

  await planningToggle(page).check();

  await expect(async () => {
    expect(await drawnConservationArea(page, map)).not.toBeNull();
  }).toPass({ timeout: 5_000 });
  await expect(planningMarkers(map)).not.toHaveCount(0);
});

test("with planning.data.gov.uk failing, the Planning Layer reads Unavailable and the rest of the page still works", async ({
  page,
}) => {
  // The fixture-backed API has no planning.data.gov.uk recording for this
  // Search Area in Mansfield, so the call fails as an unreachable one would.
  await page.goto("/?lat=53.1431&lng=-1.1982&radius=0.5");
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });

  await expect(planningStatus(page)).toHaveText("Unavailable");
  await expect(
    overview.getByRole("region", { name: "Planning" }),
  ).toContainText("Unavailable. planning.data.gov.uk didn't answer");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    planningMarkers(page.getByTestId("search-area-map")),
  ).toHaveCount(0);
  await expect(overview).toContainText("NG18 1JJ");
});
