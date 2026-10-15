import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Nearby land sales (PRD FR-5.4b) against the fixture-backed API: Sutton
 * Parkway's 0.25 mile Search Area has one Land Opportunity, a 48.2 acre farm
 * field, and the 494 postcodes within 1 mile of it in the prepared-data
 * fixture are those Price Paid's recording was asked for, as if on 8 October
 * 2026. It has 76 sales of property of type "Other" in them from 9 October
 * 2021, for a median of £207,000: shops, pubs, industrial units, a
 * supermarket and a college, and one sale plainly of land, Plot D on
 * Sidings Road. Price Paid has no recording for the land around any other
 * Land Opportunity, so theirs are unavailable.
 */

const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

const SALES_LIST =
  "Land sales within 1 mile since 9 October 2021, newest first, indicative: may not be land";

const SUMMARY =
  "76 land sales within 1 mile since 9 October 2021, indicative: may not be land. Median £207,000.";

/** HM Land Registry's attribution for Price Paid, in 2026 (PRD FR-10.3). */
const PRICE_PAID_CREDIT =
  "Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0. Price Paid Data contains address data";

const landPanel = (page: Page) =>
  page.getByRole("complementary", { name: "Land Opportunities" });

const landOverview = (page: Page) =>
  page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Land", exact: true });

/** The Land Opportunity's marker, zooming in on the Location until there is one. */
const markerOf = async (map: Locator, label: RegExp) => {
  const marker = map
    .locator('.feature-marker[data-layer="land"]')
    .and(map.getByRole("button", { name: label }));
  await expect(async () => {
    if ((await marker.count()) === 0) {
      // MapLibre zooms in one level, around the middle, on "=".
      await map.locator("canvas").press("Equal");
    }
    await expect(marker).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return marker;
};

/** The newest 10 of the field's land sales, with how far each is from it. */
const NEWEST = [
  "£100,000 on 14 July 2026: 44 HARCOURT STREET, NOTTINGHAM, NG17 8DD, 1.5 km away",
  "£380,000 on 28 May 2026: UNIT 3, DRAKEHOUSE COURT, HAMILTON ROAD, SUTTON-IN-ASHFIELD, NG17 5ES, 980 m away",
  "£250,000 on 28 April 2026: 2B OUTRAM STREET, SUTTON-IN-ASHFIELD, NG17 4AX, 1.5 km away",
  "£152,000 on 27 March 2026: 45 TOM STIMPSON WAY, SUTTON-IN-ASHFIELD, NG17 4PN, 1.5 km away",
  "£152,000 on 27 March 2026: 45 TOM STIMPSON WAY, SUTTON-IN-ASHFIELD, NG17 4PN, 1.5 km away",
  "£180,000 on 6 January 2026: 2 OUTRAM STREET, SUTTON-IN-ASHFIELD, NG17 4AX, 1.5 km away",
  "£214,000 on 22 December 2025: 8 CHATSWORTH STREET, SUTTON-IN-ASHFIELD, NG17 4GG, 1.6 km away",
  "£160,000 on 19 December 2025: A S D FABRICATIONS, BYRON AVENUE, NOTTINGHAM, NG17 7LA, 290 m away",
  "£193,500 on 19 November 2025: 92 LOWMOOR ROAD, NOTTINGHAM, NG17 7BJ, 1.2 km away",
  "£74,000 on 17 October 2025: 39 FOREST STREET, SUTTON-IN-ASHFIELD, NG17 1DA, 1.5 km away",
];

test("a Land Opportunity's popup lists the newest land sales within 1 mile of it, with price and date, marked indicative: may not be land", async ({
  page,
}) => {
  // With the Demographics Layer off, no output area's cluster covers it.
  await page.goto(`${SUTTON_PARKWAY}&hidden=demographics`);
  const map = page.getByRole("region", { name: "Map" });

  const marker = await markerOf(map, /^Land Opportunity: 48\.2 acres/);
  await marker.click();

  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toContainText(SUMMARY);
  await expect(
    popup.getByRole("list", { name: SALES_LIST }).getByRole("listitem"),
  ).toHaveText([...NEWEST, "and 66 more, older"]);
  await expect(popup).toContainText(
    "most may not be land. Each is placed at the middle of its postcode",
  );
  await expect(popup).toContainText(PRICE_PAID_CREDIT);
});

test("the Overview counts the land sales within 1 mile of the Search Area's Land Opportunities, with their median, and credits Price Paid", async ({
  page,
}) => {
  await page.goto(SUTTON_PARKWAY);

  const section = landOverview(page);
  await expect(section).toContainText(
    `Nearby land sales, indicative${SUMMARY}`,
  );
  // One Land Opportunity: each is as far from it as from the nearest.
  await expect(
    section.getByRole("list", { name: SALES_LIST }).getByRole("listitem"),
  ).toHaveText([
    ...NEWEST.map((sale) =>
      sale.replace(/ away$/, " from the nearest Land Opportunity"),
    ),
    "and 66 more, older",
  ]);
  await expect(section).toContainText(PRICE_PAID_CREDIT);
});

test("choosing the field in the Land panel lists every land sale within 1 mile of it, Plot D on Sidings Road among them", async ({
  page,
}) => {
  await page.goto(SUTTON_PARKWAY);
  await page.getByRole("tab", { name: "Land" }).click();
  await expect(landPanel(page)).toContainText(`Nearby land sales: ${SUMMARY}`);

  await landPanel(page)
    .getByRole("button", { name: /^48\.2 acres/ })
    .click();

  const chosen = landPanel(page).getByRole("region", {
    name: "Land Opportunity: 48.2 acres (19.5 ha)",
  });
  const sales = chosen
    .getByRole("list", { name: SALES_LIST })
    .getByRole("listitem");
  await expect(sales).toHaveCount(76);
  await expect(sales.first()).toHaveText(NEWEST[0] ?? "");
  await expect(sales.last()).toHaveText(
    "£103,000 on 15 October 2021: 69 ST MICHAELS STREET, SUTTON-IN-ASHFIELD, NG17 4GN, 1.6 km away",
  );
  await expect(sales.filter({ hasText: "PLOT D, SIDINGS ROAD" })).toHaveText([
    "£110,000 on 11 February 2022: PLOT D, SIDINGS ROAD, NOTTINGHAM, NG17 7JZ, 480 m away",
  ]);
  await expect(chosen).toContainText(SUMMARY);
  await expect(chosen).toContainText(PRICE_PAID_CREDIT);
});

test("across Ashfield, land sales are found for the Land Opportunity chosen, and are unavailable where Price Paid doesn't answer", async ({
  page,
}) => {
  await page.goto(SUTTON_PARKWAY);
  await page.getByRole("tab", { name: "Land" }).click();
  await landPanel(page).getByLabel("Across Ashfield").check();
  await expect(
    landPanel(page)
      .getByRole("list", { name: "Land Opportunities" })
      .getByRole("button"),
  ).toHaveCount(4);
  await expect(landPanel(page)).toContainText(
    "Nearby land sales: Land sales within 1 mile are found for the Land Opportunities in the Search Area, and for the one chosen in the Land panel.",
  );

  await landPanel(page)
    .getByRole("button", { name: /^6\.63 acres/ })
    .click();

  const chosen = landPanel(page).getByRole("region", {
    name: "Land Opportunity: 6.63 acres (2.68 ha)",
  });
  await expect(chosen).toContainText(
    "Land sales within 1 mile unavailable: HM Land Registry's Price Paid didn't answer.",
  );
  // The rest of it still shows.
  await expect(
    chosen.getByRole("list", {
      name: "INSPIRE Index Polygons that overlap it",
    }),
  ).toBeVisible();
});

test("/api/area/land gives each Land Opportunity in the Search Area, and its statistics, the land sales within 1 mile", async ({
  page,
}) => {
  const response = await page.request.get(
    "/api/area/land?lat=53.1145&lng=-1.246&radius=0.25",
  );

  expect(response.ok()).toBe(true);
  const sales = {
    status: "ok",
    period: { from: "2021-10-09", to: "2026-10-08" },
    found: { count: 76, medianPrice: 207000 },
  };
  expect(await response.json()).toMatchObject({
    status: "ok",
    sources: [
      { id: "land-parcels", status: "ok" },
      { id: "postcodes", status: "ok" },
      { id: "land-registry", status: "ok" },
    ],
    features: [{ id: "E07000170-2", nearbyLandSales: sales }],
    statistics: { nearbyLandSales: sales },
  });
});
