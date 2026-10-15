import type { Locator, Page } from "@playwright/test";

import { drawnColour, expect, test } from "./fixtures";
import { arrived } from "./sale-markers";

/**
 * The Transport Layer against the recorded Overpass answers
 * (`overpass-ng17-1aa.json` and `overpass-sutton-parkway.json`). NG17 1AA's
 * 0.5 mile Search Area has 58 bus stops, 33 car parks, an EV charger,
 * footpaths and cycle routes, but no railway station: the nearest, Sutton
 * Parkway, is 1,628 m away. A 0.25 mile Search Area 50 m from Sutton Parkway
 * has the station in it.
 */
const NG17_TRANSPORT = 58 + 33 + 1 + 2;

/** Sutton Parkway's 0.25 mile Search Area, as a shared URL opens it. */
const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

/** The colours `layer-styles.ts` draws footpaths' and cycle routes' lines in. */
const FOOTPATH_COLOUR = "#5d4037";
const CYCLE_ROUTE_COLOUR = "#00695c";

const searchNg17 = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);
};

const transportToggle = (page: Page) =>
  page.getByRole("checkbox", { name: "Transport" });

/** What the Transport Layer's toggle says about it. */
const transportStatus = (page: Page) => page.locator("#layer-transport-status");

/** Every cluster and point of the Transport Layer on the map. */
const transportMarkers = (map: Locator) =>
  map.locator(
    '.feature-cluster[data-layer="transport"], .feature-marker[data-layer="transport"]',
  );

/** Switches every other Layer off, so none of their markers or shapes hide Transport's. */
const onlyTransport = async (page: Page) => {
  for (const name of [
    "Crime",
    "Planning",
    "Amenities",
    "Schools",
    "Green space",
    "Property",
  ]) {
    await page.getByRole("checkbox", { name }).uncheck();
  }
};

/**
 * Where lines of `colour` are drawn. The Transport Layer's markers and its
 * icon over the map are the cycle routes' colour too, so they are painted
 * over first.
 */
const drawnLines = (page: Page, map: Locator, colour: string) =>
  drawnColour(page, map, colour, [
    transportMarkers(map),
    page.getByRole("group", { name: "Layers" }),
  ]);

/**
 * The point marker labelled `label`, zooming in on the Location, which is in
 * the middle of the map, until there is one.
 */
const markerLabelled = async (map: Locator, label: string) => {
  const marker = map.locator(
    `.feature-marker[data-layer="transport"][aria-label="${label}"]`,
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
  await expect(popup.getByRole("heading", { name: "Transport" })).toBeVisible();
  return popup;
};

test("the Overview gives NG17 1AA's nearest railway station, its counts and its km of footpath and cycle route", async ({
  page,
}) => {
  await searchNg17(page);

  await expect(transportToggle(page)).toBeChecked();
  await expect(transportStatus(page)).toHaveText(
    `${String(NG17_TRANSPORT)} transport Features`,
  );
  const transport = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Transport" });
  await expect(transport).toContainText(
    "Nearest railway station: Sutton Parkway, 1.6 km, outside the Search Area.",
  );
  const table = transport.getByRole("table", {
    name: "Transport in the Search Area",
  });
  await expect(table.getByRole("row")).toHaveCount(1 + 6);
  for (const name of [
    "Type In the Search Area",
    "Railway stations 0",
    "Bus stops 58",
    "Car parks 33",
    "EV chargers 1",
    "Footpaths 9.1 km",
    "Cycle routes 2.9 km",
  ]) {
    await expect(table.getByRole("row", { name, exact: true })).toBeVisible();
  }
  await expect(transport).toContainText(
    "Transport comes from OpenStreetMap, which volunteers map",
  );
});

test("bus stops, car parks and EV chargers have markers, and footpaths and cycle routes are drawn as lines with a marker each", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await onlyTransport(page);
  await arrived(page, map);

  // Both kinds of route are drawn around the Location.
  await expect(async () => {
    expect(
      (await drawnLines(page, map, FOOTPATH_COLOUR))?.pixels,
    ).toBeGreaterThan(500);
    expect(
      (await drawnLines(page, map, CYCLE_ROUTE_COLOUR))?.pixels,
    ).toBeGreaterThan(100);
  }).toPass({ timeout: 15_000 });

  // Each marker is looked for by zooming in on the Location, so the furthest
  // first, before zooming in far enough to split the nearer ones apart
  // pushes it out of view.
  const stop = await openPopup(
    page,
    await markerLabelled(map, "Church Hill, Bus stop, 210 m from the Location"),
  );
  await expect(stop.locator("li > strong")).toHaveText(["Church Hill"]);
  await expect(stop).toContainText("Bus stop");
  await expect(stop).toContainText("OpenStreetMap tag: highway=bus_stop");

  for (const label of [
    "Cycle routes, 2.9 km in the Search Area, 170 m from the Location",
    "Unnamed EV charger, EV charger, 110 m from the Location",
    "Unnamed car park, Car park, 80 m from the Location",
  ]) {
    await expect(await markerLabelled(map, label)).toBeVisible();
  }

  const footpaths = await openPopup(
    page,
    await markerLabelled(
      map,
      "Footpaths, 9.1 km in the Search Area, 40 m from the Location",
    ),
  );
  await expect(footpaths.locator("li > strong")).toHaveText(["Footpaths"]);
  await expect(footpaths).toContainText("9.1 km in the Search Area");
  await expect(footpaths).toContainText("40 m from the Location");

  // Clicking markers opened their popups; it did not move the Location.
  await expect(page).toHaveURL(
    /\?lat=53\.123664&lng=-1\.264078&radius=0\.5&hidden=crime,planning,amenities,schools,green-space,property$/,
  );
});

test("a railway station in the Search Area has a marker, and is the nearest", async ({
  page,
}) => {
  await page.goto(SUTTON_PARKWAY);
  const map = page.getByTestId("search-area-map");
  await onlyTransport(page);
  await arrived(page, map);

  const transport = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Transport" });
  await expect(transport).toContainText(
    "Nearest railway station: Sutton Parkway, 50 m.",
  );
  await expect(
    transport.getByRole("row", { name: "Railway stations 1", exact: true }),
  ).toBeVisible();

  const station = await markerLabelled(
    map,
    "Sutton Parkway, Railway station, 50 m from the Location",
  );
  const popup = await openPopup(page, station);
  await expect(popup.locator("li > strong")).toHaveText(["Sutton Parkway"]);
  await expect(popup).toContainText("Railway station");
  await expect(popup).toContainText("OpenStreetMap tag: railway=station");
  await expect(popup).toContainText("50 m from the Location");
});

test("toggling the Transport Layer hides its markers and lines, and the URL keeps it", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await onlyTransport(page);
  await expect(async () => {
    expect(await drawnLines(page, map, FOOTPATH_COLOUR)).not.toBeNull();
  }).toPass({ timeout: 15_000 });

  await transportToggle(page).uncheck();

  await expect(transportMarkers(map)).toHaveCount(0);
  await expect(page).toHaveURL(
    /&hidden=crime,planning,amenities,schools,transport,green-space,property$/,
  );
  await expect(async () => {
    expect(await drawnLines(page, map, FOOTPATH_COLOUR)).toBeNull();
  }).toPass({ timeout: 5_000 });
  // Its statistics stay in the Overview and its toggle.
  await expect(transportStatus(page)).toHaveText(
    `${String(NG17_TRANSPORT)} transport Features`,
  );

  await transportToggle(page).check();

  await expect(async () => {
    expect(await drawnLines(page, map, FOOTPATH_COLOUR)).not.toBeNull();
  }).toPass({ timeout: 5_000 });
  await expect(transportMarkers(map)).not.toHaveCount(0);
});

test("with Overpass failing, the Transport Layer reads Unavailable and the rest of the page still works", async ({
  page,
}) => {
  // The fixture-backed API has no Overpass recording for this Search Area in
  // Mansfield, so the query fails as an unreachable one would.
  await page.goto("/?lat=53.1431&lng=-1.1982&radius=0.5");
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });

  await expect(transportStatus(page)).toHaveText("Unavailable");
  await expect(
    overview.getByRole("region", { name: "Transport" }),
  ).toContainText("Unavailable. Overpass API didn't answer");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    transportMarkers(page.getByTestId("search-area-map")),
  ).toHaveCount(0);
  await expect(overview).toContainText("NG18 1JJ");
});
