import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { arrived } from "./sale-markers";

/**
 * The Property Layer against the recordings for NG17 1AA's 0.5 mile Search
 * Area, as they stood on 8 October 2026: postcodes.io gives its limit of 100
 * postcodes, the furthest 430 m away (`postcodes-io-ng17-1aa-search-area.json`),
 * and Price Paid has 24 sales in them from 9 October 2025
 * (`land-registry-ng17-1aa.json`), every sale at their addresses since 1995
 * (`land-registry-ng17-1aa-history.json`), and the sales in the same postcodes
 * a year and five years before (`land-registry-ng17-1aa-year-before.json` and
 * `land-registry-ng17-1aa-five-years-before.json`).
 */
const NG17_SALES = 24;

const PERIOD = "9 October 2025 to 8 October 2026";

const searchNg17 = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);
};

const propertyToggle = (page: Page) =>
  page.getByRole("checkbox", { name: "Property" });

/** What the Property Layer's toggle says about it. */
const propertyStatus = (page: Page) => page.locator("#layer-property-status");

const propertyOverview = (page: Page) =>
  page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Property" });

/** Every cluster and point of the Property Layer on the map. */
const propertyMarkers = (map: Locator) =>
  map.locator(
    '.feature-cluster[data-layer="property"], .feature-marker[data-layer="property"]',
  );

/** Switches every other Layer off, so none of their markers hide Property's. */
const onlyProperty = async (page: Page) => {
  for (const name of [
    "Crime",
    "Planning",
    "Amenities",
    "Schools",
    "Transport",
    "Green space",
  ]) {
    await page.getByRole("checkbox", { name }).uncheck();
  }
};

/**
 * The point marker labelled `label`, zooming in on the Location, which is in
 * the middle of the map, until there is one.
 */
const markerLabelled = async (map: Locator, label: string) => {
  const marker = map.locator(
    `.feature-marker[data-layer="property"][aria-label="${label}"]`,
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
  await expect(popup.getByRole("heading", { name: "Property" })).toBeVisible();
  return popup;
};

test("the Overview gives NG17 1AA's sales' count, median and mean by property type, tenure and new build, as recorded", async ({
  page,
}) => {
  await searchNg17(page);

  await expect(propertyToggle(page)).toBeChecked();
  await expect(propertyStatus(page)).toHaveText(`${String(NG17_SALES)} sales`);
  const property = propertyOverview(page);
  await expect(property).toContainText(
    `${String(NG17_SALES)} sales in the Search Area from ${PERIOD}: a median price of £182,000 and a mean of £187,000.`,
  );

  const rows = async (name: string, expected: string[]) => {
    const table = property.getByRole("table", { name: `${name}, ${PERIOD}` });
    await expect(table.getByRole("row")).toHaveCount(expected.length);
    for (const row of expected) {
      await expect(
        table.getByRole("row", { name: row, exact: true }),
      ).toBeVisible();
    }
  };
  await rows("Sales by property type", [
    "Property type Sales Median Mean",
    "Detached houses 8 £242,500 £241,813",
    "Semi-detached houses 6 £172,000 £162,333",
    "Terraced houses 6 £146,000 £155,750",
    "Flats and maisonettes 0 None None",
    "Other property 4 £160,500 £161,250",
  ]);
  await rows("Sales by tenure", [
    "Tenure Sales Median Mean",
    "Freehold 24 £182,000 £187,000",
    "Leasehold 0 None None",
  ]);
  await rows("Sales of new builds", [
    "New build Sales Median Mean",
    "New builds 0 None None",
    "Not new builds 24 £182,000 £187,000",
  ]);
});

test("the Overview gives the change in NG17 1AA's median price from a year and five years before, as recorded", async ({
  page,
}) => {
  await searchNg17(page);

  const table = propertyOverview(page).getByRole("table", {
    name: "Change in median price, in the same postcodes",
  });
  const expected = [
    "12 months Sales Median Change since",
    `Last 12 months, ${PERIOD} 24 £182,000`,
    "A year before, 9 October 2024 to 8 October 2025 54 £160,000 +13.8%",
    "Five years before, 9 October 2020 to 8 October 2021 39 £150,000 +21.3%",
  ];
  await expect(table.getByRole("row")).toHaveCount(expected.length);
  for (const row of expected) {
    await expect(
      table.getByRole("row", { name: row, exact: true }),
    ).toBeVisible();
  }
});

test("NG17 1AA's Search Area has more than postcodes.io's 100 postcodes, so the Overview says it was cut short", async ({
  page,
}) => {
  await searchNg17(page);

  await expect(propertyOverview(page)).toContainText(
    "Search Area cut short. postcodes.io gives at most 100 postcodes, and gave that many, so the Search Area may have more. Only sales in the 100 postcodes nearest the Location, up to 430 m away, are counted.",
  );
});

test("Sutton Parkway's 0.25 mile Search Area has 7 postcodes, all of it, so nothing is cut short", async ({
  page,
}) => {
  await page.goto("/?lat=53.1145&lng=-1.246&radius=0.25");

  const property = propertyOverview(page);
  await expect(property).toContainText(
    `1 sale in the Search Area from ${PERIOD}: a median price of £150,000 and a mean of £150,000.`,
  );
  await expect(property).not.toContainText("cut short");
});

test("the Overview shows HM Land Registry's Price Paid attribution, with the conditions on its address data", async ({
  page,
}) => {
  await searchNg17(page);

  const property = propertyOverview(page);
  await expect(property).toContainText(
    "Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0.",
  );
  await expect(
    property.getByRole("link", { name: "Open Government Licence v3.0" }),
  ).toHaveAttribute(
    "href",
    "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  );
  await expect(property).toContainText(
    "Royal Mail and Ordnance Survey permit its use for personal and/or non-commercial use, and to display for the purpose of providing residential property price information services.",
  );
});

test("a sale is labelled with its price on the map, and its popup gives price, date, type, tenure and new build", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await onlyProperty(page);
  await arrived(page, map);

  // The nearest sale, alone in its postcode, is found by zooming in on the
  // Location. (Several sales in one postcode, labelled from the lowest price
  // to the highest, are all further out, so they leave the view before their
  // cluster splits apart; feature-markers.test.ts covers their label.)
  const brookStreet = await markerLabelled(
    map,
    "£141,000, Sold on 16 February 2026, 40 m from the Location",
  );
  await expect(brookStreet.locator(".feature-marker-label")).toHaveText(
    "£141k",
  );
  const popup = await openPopup(page, brookStreet);
  await expect(popup.locator("li > *")).toHaveText([
    "£141,000",
    "Sold on 16 February 2026",
    "Other property, freehold",
    "Not a new build",
    "6 BROOK STREET, SUTTON-IN-ASHFIELD, NG17 1AL",
    "No other sale at this address since 1995",
  ]);
  await expect(popup).toContainText("40 m from the Location");
  await expect(popup).toContainText(
    "Placed at the middle of its postcode: Price Paid gives no closer location.",
  );

  // Clicking the marker opened its popup; it did not move the Location.
  await expect(page).toHaveURL(
    /\?lat=53\.123664&lng=-1\.264078&radius=0\.5&hidden=crime,planning,amenities,schools,transport,green-space$/,
  );
});

test("a sale's popup lists every sale at its address since 1995, with the change from the sale before", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await onlyProperty(page);
  await arrived(page, map);

  // 88 High Pavement, alone in NG17 1BT, sold for £183,500 in 2024 and
  // £173,000 in 2026 (land-registry-ng17-1aa-history.json).
  const highPavement = await markerLabelled(
    map,
    "£173,000, Sold on 29 May 2026, 140 m from the Location",
  );
  const popup = await openPopup(page, highPavement);

  await expect(popup).toContainText(
    "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD, NG17 1BT",
  );
  await expect(
    popup.getByRole("list", { name: "Every sale at this address since 1995" }),
  ).toBeVisible();
  await expect(
    popup
      .getByRole("list", { name: "Every sale at this address since 1995" })
      .getByRole("listitem"),
  ).toHaveText([
    "29 May 2026: £173,000, -5.7%, this sale",
    "6 October 2024: £183,500",
  ]);
});

test("toggling the Property Layer hides its markers, and the URL keeps it", async ({
  page,
}) => {
  await searchNg17(page);
  const map = page.getByTestId("search-area-map");
  await expect(propertyMarkers(map)).not.toHaveCount(0);

  await propertyToggle(page).uncheck();

  await expect(propertyMarkers(map)).toHaveCount(0);
  await expect(page).toHaveURL(/&hidden=property$/);
  // Its statistics stay in the Overview and its toggle.
  await expect(propertyStatus(page)).toHaveText(`${String(NG17_SALES)} sales`);
  await expect(propertyOverview(page)).toContainText("Detached houses");

  await propertyToggle(page).check();

  await expect(propertyMarkers(map)).not.toHaveCount(0);
});

test("with postcodes.io unable to give the postcodes, the Property Layer reads Unavailable and the rest of the page still works", async ({
  page,
}) => {
  // The fixture-backed API has no recording of the postcodes in this Search
  // Area in Mansfield, so the lookup fails as an unreachable one would.
  await page.goto("/?lat=53.1431&lng=-1.1982&radius=0.5");
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });

  await expect(propertyStatus(page)).toHaveText("Unavailable");
  await expect(
    overview.getByRole("region", { name: "Property" }),
  ).toContainText("Unavailable. postcodes.io didn't answer");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    propertyMarkers(page.getByTestId("search-area-map")),
  ).toHaveCount(0);
  await expect(overview).toContainText("NG18 1JJ");
});
