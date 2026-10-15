import type { Locator, Page } from "@playwright/test";

import { drawnCircle, expect, test, visibleMap } from "./fixtures";

/**
 * The Crime Layer against the recorded data.police.uk answers for NG17 1AA's
 * 0.5 mile Search Area: 185 crimes in August 2026, at 62 points
 * (`police-ng17-1aa-2026-08.json`), and each of the 23 months before.
 */
const NG17_CRIMES = 185;

const NG17_URL = /\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/;

const searchNg17 = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(NG17_URL);
};

const crimeToggle = (page: Page) =>
  page.getByRole("checkbox", { name: "Crime" });

/** What the Crime Layer's toggle says about it. */
const crimeStatus = (page: Page) => page.locator("#layer-crime-status");

/** Every cluster and point of the Crime Layer on the map. */
const crimeMarkers = (map: Locator) =>
  map.locator(
    '.feature-cluster[data-layer="crime"], .feature-marker[data-layer="crime"]',
  );

/** How many crimes the markers on the map hold between them. */
const crimesOnMap = async (map: Locator) => {
  const counts = await crimeMarkers(map).evaluateAll((markers) =>
    markers.map((marker) => Number((marker as HTMLElement).dataset.count)),
  );
  return counts.reduce((sum, count) => sum + count, 0);
};

/**
 * The one of `markers` nearest the middle of the map, clear of the map's
 * controls and edges, or `null` if there is none.
 */
const nearestCentre = async (map: Locator, markers: Locator) => {
  const box = await map.boundingBox();
  if (!box) throw new Error("The map has no size");
  // The middle of the part of the map the panel leaves.
  const visible = await visibleMap(map.page(), map);
  const centre = {
    x: box.x + visible.width / 2,
    y: box.y + visible.height / 2,
  };
  const distances = await markers.evaluateAll(
    (elements, { x, y }) =>
      elements.map((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        return Math.hypot(left + width / 2 - x, top + height / 2 - y);
      }),
    centre,
  );
  if (distances.length === 0) return null;
  return markers.nth(distances.indexOf(Math.min(...distances)));
};

test("the Crime Layer shows NG17 1AA's crimes clustered, and a popup gives a crime's category, month and distance", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  // So no Planning Application is drawn over a crime.
  await page.getByRole("checkbox", { name: "Planning" }).uncheck();

  await expect(crimeToggle(page)).toBeChecked();
  await expect(crimeStatus(page)).toHaveText(`${String(NG17_CRIMES)} crimes`);

  // Once the map has flown to the Search Area, every crime is on it, in
  // several clusters rather than one heap.
  const clusters = map.locator('.feature-cluster[data-layer="crime"]');
  await expect(async () => {
    expect(await crimesOnMap(map)).toBe(NG17_CRIMES);
    expect(await clusters.count()).toBeGreaterThan(5);
  }).toPass({ timeout: 15_000 });
  await expect(clusters.first()).toHaveAccessibleName(
    /^\d+ crimes clustered: zoom in$/,
  );

  // Clicking a cluster zooms in until it splits into points.
  const points = map.locator('.feature-marker[data-layer="crime"]');
  await expect(async () => {
    if ((await points.count()) === 0) {
      await (await nearestCentre(map, clusters))?.click();
    }
    await expect(points.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const point = await nearestCentre(map, points);
  if (!point) throw new Error("No crime is shown as a point");

  const label = (await point.getAttribute("aria-label")) ?? "";
  const distance = /(\d+ m|\d+\.\d km) from the Location$/.exec(label)?.[0];
  expect(distance).toBeDefined();
  await point.click();

  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Crime" })).toBeVisible();
  const [category] = await popup.locator("li > strong").allTextContents();
  expect(category).toMatch(
    /^(Anti-social behaviour|Bicycle theft|Burglary|Criminal damage and arson|Drugs|Other theft|Possession of weapons|Public order|Robbery|Shoplifting|Theft from the person|Vehicle crime|Violence and sexual offences|Other crime)$/,
  );
  await expect(popup).toContainText("August 2026");
  await expect(popup).toContainText(distance ?? "");
  await expect(popup).toContainText("approximate");

  // The click opened the popup; it did not move the Location.
  await expect(page).toHaveURL(
    /\?lat=53\.123664&lng=-1\.264078&radius=0\.5&hidden=planning$/,
  );

  // The Overview counts the same crimes by category, as text.
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  const crime = overview.getByRole("region", { name: "Crime" });
  await expect(crime).toContainText(
    `${String(NG17_CRIMES)} crimes reported in the Search Area in August 2026`,
  );
  await expect(
    crime.getByRole("row", { name: "Violence and sexual offences 43" }),
  ).toBeVisible();
  await expect(crime).toContainText(
    "Police crime locations are deliberately approximate",
  );
});

test("the Overview gives NG17 1AA's crimes over the last 12 months, and the change on the 12 before, overall and per category", async ({
  page,
}) => {
  // From the 24 recordings up to August 2026, `police-ng17-1aa-*.json`.
  await searchNg17(page);
  const crime = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Crime" });

  await expect(crime).toContainText(
    "2,024 crimes reported in the Search Area from September 2025 to August 2026: up 5.9% on the 12 months before (1,912).",
  );
  const table = crime.getByRole("table", {
    name: "Crimes by category, September 2025 to August 2026, against the 12 months before",
  });
  await expect(table.getByRole("row")).toHaveCount(14 + 2);
  for (const name of [
    "Category Last 12 months 12 months before Change",
    "Violence and sexual offences 558 509 +9.6%",
    "Shoplifting 374 304 +23%",
    "Anti-social behaviour 339 408 -16.9%",
    "Theft from the person 19 10 +90%",
    "All crimes 2,024 1,912 +5.9%",
  ]) {
    await expect(table.getByRole("row", { name, exact: true })).toBeVisible();
  }
  await expect(crime).not.toContainText("incomplete");
});

test("toggling the Crime Layer hides and shows it, and the URL keeps it", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await expect(async () => {
    expect(await crimesOnMap(map)).toBe(NG17_CRIMES);
  }).toPass({ timeout: 15_000 });

  await crimeToggle(page).uncheck();

  await expect(crimeMarkers(map)).toHaveCount(0);
  await expect(page).toHaveURL(
    /\?lat=53\.123664&lng=-1\.264078&radius=0\.5&hidden=crime$/,
  );
  // Its statistics stay in the Overview and its toggle.
  await expect(crimeStatus(page)).toHaveText(`${String(NG17_CRIMES)} crimes`);

  // A reload, or a shared link, opens with the Layer hidden.
  await page.reload();
  await expect(crimeStatus(page)).toHaveText(`${String(NG17_CRIMES)} crimes`);
  await expect(crimeToggle(page)).not.toBeChecked();
  await expect(crimeMarkers(map)).toHaveCount(0);

  await crimeToggle(page).check();

  await expect(page).toHaveURL(NG17_URL);
  await expect(async () => {
    expect(await crimesOnMap(map)).toBe(NG17_CRIMES);
  }).toPass({ timeout: 15_000 });

  // Back returns to the Layer hidden.
  await page.goBack();
  await expect(page).toHaveURL(/&hidden=crime$/);
  await expect(crimeToggle(page)).not.toBeChecked();
  await expect(crimeMarkers(map)).toHaveCount(0);
});

test("with data.police.uk failing, the Crime Layer reads Unavailable and the page still works", async ({
  page,
}) => {
  // The fixture-backed API has no police recording for this Search Area in
  // Mansfield, so the call fails as an unreachable data.police.uk would.
  await page.goto("/?lat=53.1431&lng=-1.1982&radius=0.5");
  const map = page.getByTestId("search-area-map");
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });

  await expect(crimeStatus(page)).toHaveText("Unavailable");
  await expect(overview.getByRole("region", { name: "Crime" })).toContainText(
    "Unavailable. data.police.uk didn't answer",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(crimeMarkers(map)).toHaveCount(0);

  // The rest of the Search Area is still shown.
  await expect(overview).toContainText("NG18 1JJ");
  await expect(overview).toContainText("Mansfield");
  await expect(async () => {
    expect(await drawnCircle(page, map)).not.toBeNull();
  }).toPass({ timeout: 15_000 });

  // And the next search works as usual.
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(crimeStatus(page)).toHaveText(`${String(NG17_CRIMES)} crimes`);
});
