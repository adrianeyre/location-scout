import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { arrived } from "./sale-markers";

/**
 * The Property Layer's Energy Performance Certificates (PRD FR-2.6), against
 * the API started with `EPC_API_KEY`, and the very same frontend as every
 * other test. The EPC API's answers for the 100 postcodes in NG17 1AA's 0.5
 * mile Search Area (`epc-ng17-1aa.json`) are made up in its published
 * schema, as no GOV.UK One Login account was to hand: 36 certificates of 35
 * homes in the 17 postcodes with sales, one for every house sold from 9
 * October 2025 but 9 Kensington Close. Price Paid's sales are its
 * recordings, as in `property-layer.spec.ts`.
 */
const NG17 = "/?lat=53.123664&lng=-1.264078&radius=0.5";

/** Every other Layer switched off the map, so nothing covers a sale. */
const ONLY_PROPERTY = `${NG17}&hidden=crime,planning,amenities,schools,transport,green-space,land,demographics`;

const propertyOverview = (page: Page) =>
  page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Property" });

/** The EPCs' part of the Property Layer's statistics. */
const epcOverview = (page: Page) =>
  propertyOverview(page).locator(".property-epc");

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

test("the Overview gives the homes by EPC rating in NG17 1AA's postcodes and the sales' price per m², from the made-up certificates", async ({
  page,
}) => {
  await page.goto(NG17);

  const epc = epcOverview(page);
  await expect(
    epc.getByRole("heading", { name: "Energy Performance Certificates" }),
  ).toBeVisible();
  await expect(epc).toContainText(
    "35 homes in the 100 postcodes searched have an EPC.",
  );
  const table = epc.getByRole("table", { name: "Homes by EPC rating" });
  const expected = [
    "Rating Homes Share",
    "A 0 0%",
    "B 4 11%",
    "C 10 29%",
    "D 12 34%",
    "E 6 17%",
    "F 2 6%",
    "G 1 3%",
  ];
  await expect(table.getByRole("row")).toHaveCount(expected.length);
  for (const row of expected) {
    await expect(
      table.getByRole("row", { name: row, exact: true }),
    ).toBeVisible();
  }
  // 97 Silk Street's certificate gives a floor area of 0, so it has no price per m².
  await expect(epc).toContainText(
    "19 of 20 sales of houses and flats matched to an EPC. Price per m², from the 18 sales with a floor area: a median of £1,894 and a mean of £1,904.",
  );
  // The sales are still there, as without a key.
  await expect(propertyOverview(page)).toContainText(
    "24 sales in the Search Area from 9 October 2025 to 8 October 2026",
  );
});

test("the Overview credits the EPC data as its licence asks (PRD FR-10.1a)", async ({
  page,
}) => {
  await page.goto(NG17);

  const credit = epcOverview(page).locator(".layer-attribution");
  await expect(credit).toHaveText(
    "Energy Performance Certificate data from MHCLG's Get energy performance of buildings data, licensed under the Open Government Licence v3.0.",
  );
  await expect(
    credit.getByRole("link", {
      name: "Get energy performance of buildings data",
    }),
  ).toHaveAttribute(
    "href",
    "https://get-energy-performance-data.communities.gov.uk/",
  );
  await expect(
    credit.getByRole("link", { name: "Open Government Licence v3.0" }),
  ).toHaveAttribute(
    "href",
    "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  );
});

test("a sale's popup gives its EPC rating, the rating it could reach, its floor area and price per m², credited, and never the certificate's address", async ({
  page,
}) => {
  await page.goto(ONLY_PROPERTY);
  const map = page.getByTestId("search-area-map");
  await expect(epcOverview(page)).toContainText("35 homes");
  await arrived(page, map);

  // 88 High Pavement, alone in NG17 1BT, sold for £173,000; its made-up
  // certificate of 14 March 2019 gives band D, potential B and 92 m².
  const highPavement = await markerLabelled(
    map,
    "£173,000, Sold on 29 May 2026, 140 m from the Location",
  );
  await highPavement.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toBeVisible();

  await expect(
    popup.locator(
      "li > span:not(.feature-popup-item-note):not(.feature-popup-sublist-name)",
    ),
  ).toHaveText([
    "Sold on 29 May 2026",
    "Detached house, freehold",
    "Not a new build",
    "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD, NG17 1BT",
    "EPC rating D, could be B (14 March 2019)",
    "Floor area 92 m²: £1,880 per m²",
  ]);
  await expect(popup.locator(".feature-popup-item-note")).toHaveText(
    "Energy Performance Certificate data from MHCLG's Get energy performance of buildings data, licensed under the Open Government Licence v3.0.",
  );
  // The certificate is lodged as "88 High Pavement"; only Price Paid's
  // address, in capitals, is shown.
  await expect(popup).not.toContainText("88 High Pavement");
});

test("a sale of other property says nothing about EPCs, which the register of homes doesn't cover", async ({
  page,
}) => {
  await page.goto(ONLY_PROPERTY);
  const map = page.getByTestId("search-area-map");
  await expect(epcOverview(page)).toContainText("35 homes");
  await arrived(page, map);

  const brookStreet = await markerLabelled(
    map,
    "£141,000, Sold on 16 February 2026, 40 m from the Location",
  );
  await brookStreet.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toContainText("Other property, freehold");
  await expect(popup).not.toContainText("EPC");
});
