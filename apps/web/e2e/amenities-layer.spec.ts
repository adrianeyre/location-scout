import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The Amenities Layer against the recorded Overpass answer for NG17 1AA's 0.5
 * mile Search Area (`overpass-ng17-1aa.json`): 197 amenities, once the vacant
 * shops are left out, in Sutton-in-Ashfield's town centre.
 */
const NG17_AMENITIES = 197;

const searchNg17 = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);
};

const amenitiesToggle = (page: Page) =>
  page.getByRole("checkbox", { name: "Amenities" });

/** What the Amenities Layer's toggle says about it. */
const amenitiesStatus = (page: Page) => page.locator("#layer-amenities-status");

/** Every cluster and point of the Amenities Layer on the map. */
const amenityMarkers = (map: Locator) =>
  map.locator(
    '.feature-cluster[data-layer="amenities"], .feature-marker[data-layer="amenities"]',
  );

/**
 * The point marker whose label starts with `name`, zooming in on the
 * Location, which is in the middle of the map, until there is one.
 */
const markerNamed = async (map: Locator, name: string) => {
  const marker = map.locator(
    `.feature-marker[data-layer="amenities"][aria-label^="${name}"]`,
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

test("the Overview counts NG17 1AA's amenities per type, with the nearest of each", async ({
  page,
}) => {
  await searchNg17(page);

  await expect(amenitiesToggle(page)).toBeChecked();
  await expect(amenitiesStatus(page)).toHaveText(
    `${String(NG17_AMENITIES)} amenities`,
  );
  const amenities = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Amenities" });
  await expect(amenities).toContainText(
    `${String(NG17_AMENITIES)} amenities mapped in the Search Area.`,
  );
  const table = amenities.getByRole("table", {
    name: "Amenities in the Search Area, and the nearest of each",
  });
  await expect(table.getByRole("row")).toHaveCount(1 + 13);
  for (const name of [
    "Type In the Search Area Nearest",
    "Other shops 100 Premier E Cigs, 40 m",
    "Convenience stores 10 Friend Mini Market, 140 m",
    "Cafés 11 Costa, 110 m",
    "Restaurants 5 Kera Dine, 40 m",
    "Takeaways 17 Sea Fish, 60 m",
    "Pubs 8 Devonshire Arms, 190 m",
    "Supermarkets 4 Heron Foods, 220 m",
    "Gyms 2 Kickstart Gym, 370 m",
    "Hairdressers 17 Styles Barbers Shop, 70 m",
    "Dentists 1 Bupa Dental Care, 170 m",
    "Nurseries 2 The Learning Tree Nursery, 550 m",
    "Healthcare 6 Boots, 180 m",
    "Offices 14 Hopkins Solicitors, 50 m",
  ]) {
    await expect(table.getByRole("row", { name, exact: true })).toBeVisible();
  }
  await expect(amenities).toContainText(
    "Amenities come from OpenStreetMap, which volunteers map",
  );
});

test("an amenity's marker and popup give its name, type and distance from the Location", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  // So no other Layer's marker is drawn over an amenity.
  await page.getByRole("checkbox", { name: "Crime" }).uncheck();
  await page.getByRole("checkbox", { name: "Planning" }).uncheck();
  await page.getByRole("checkbox", { name: "Schools" }).uncheck();
  await page.getByRole("checkbox", { name: "Transport" }).uncheck();
  await page.getByRole("checkbox", { name: "Green space" }).uncheck();
  await page.getByRole("checkbox", { name: "Property" }).uncheck();
  // Markers are redrawn when the map stops moving, so once the map has flown
  // to the Search Area its amenities are split into several clusters.
  await expect
    .poll(() => amenityMarkers(map).count(), { timeout: 15_000 })
    .toBeGreaterThan(1);

  const pub = await markerNamed(map, "Devonshire Arms");
  await expect(pub).toHaveAccessibleName(
    "Devonshire Arms, Pub, 190 m from the Location",
  );
  await pub.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Amenities" })).toBeVisible();
  await expect(popup.locator("li > strong")).toHaveText(["Devonshire Arms"]);
  await expect(popup).toContainText("Pub");
  await expect(popup).toContainText("OpenStreetMap tag: amenity=pub");
  await expect(popup).toContainText("190 m from the Location");

  // Clicking a marker opened its popup; it did not move the Location.
  await expect(page).toHaveURL(
    /\?lat=53\.123664&lng=-1\.264078&radius=0\.5&hidden=crime,planning,schools,transport,green-space,property$/,
  );
});

test("toggling the Amenities Layer hides its markers, and the URL keeps it", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await expect(amenityMarkers(map)).not.toHaveCount(0);

  await amenitiesToggle(page).uncheck();

  await expect(amenityMarkers(map)).toHaveCount(0);
  await expect(page).toHaveURL(/&hidden=amenities$/);
  // Its statistics stay in the Overview and its toggle.
  await expect(amenitiesStatus(page)).toHaveText(
    `${String(NG17_AMENITIES)} amenities`,
  );

  await amenitiesToggle(page).check();

  await expect(amenityMarkers(map)).not.toHaveCount(0);
});

test("with Overpass failing, the Amenities Layer reads Unavailable and the rest of the page still works", async ({
  page,
}) => {
  // The fixture-backed API has no Overpass recording for this Search Area in
  // Mansfield, so the query fails as an unreachable one would.
  await page.goto("/?lat=53.1431&lng=-1.1982&radius=0.5");
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });

  await expect(amenitiesStatus(page)).toHaveText("Unavailable");
  await expect(
    overview.getByRole("region", { name: "Amenities" }),
  ).toContainText("Unavailable. Overpass API didn't answer");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(amenityMarkers(page.getByTestId("search-area-map"))).toHaveCount(
    0,
  );
  await expect(overview).toContainText("NG18 1JJ");
});
