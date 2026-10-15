import type { Page, Route } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Ownership Categories (PRD FR-5.4a) against the API's prepared-data
 * fixture, which `pnpm data:prepare` made with a key for HM Land Registry's
 * CCOD and OCOD. Their titles are made up (title numbers beginning ZZ),
 * naming buildings OpenStreetMap maps in the recordings: an overseas
 * company's title names Metal Craft Group, whose INSPIRE Index Polygon is 9 m
 * from Sutton Parkway's 48.2 acre farm field. No title is matched to the
 * polygons Ashfield's Land Parcels are on, so all four Land Opportunities
 * across Ashfield are other registered, indicatively.
 */

const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

const STATEMENT =
  "Information produced by HM Land Registry. © Crown copyright 2026. UK and overseas companies that own property in England and Wales, as at 2 October 2026.";

const METAL_CRAFT =
  "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE): title ZZ200001, Limited Company or Public Limited Company (overseas companies data), Company-owned (indicative), 10 m away";

const landPanel = (page: Page) =>
  page.getByRole("complementary", { name: "Land Opportunities" });

const listed = (page: Page) =>
  landPanel(page)
    .getByRole("list", { name: "Land Opportunities" })
    .getByRole("button")
    .locator("strong");

const openLandPanel = async (page: Page) => {
  await page.goto(SUTTON_PARKWAY);
  await expect(page.locator("#layer-land-status")).toHaveText(
    "1 Land Opportunity",
  );
  await page.getByRole("tab", { name: "Land" }).click();
  await expect(listed(page)).toHaveText(["48.2 acres (19.5 ha)"]);
};

test("the Overview counts Sutton Parkway's Land Opportunities by indicative Ownership Category", async ({
  page,
}) => {
  await page.goto(SUTTON_PARKWAY);

  const section = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Land", exact: true });
  await expect(
    section
      .getByRole("list", { name: "By Ownership Category" })
      .getByRole("listitem"),
  ).toHaveText([
    "Company-owned: 0",
    "Council or public-body owned: 0",
    "Other registered: 1",
    "Possibly Unregistered: 0",
  ]);
  await expect(section).toContainText("Ownership Categories are indicative.");
});

test("a Land Opportunity's popup gives its Ownership Category as indicative, the title matched beside it with its address, and HM Land Registry's statement", async ({
  page,
}) => {
  await page.goto(SUTTON_PARKWAY);
  const map = page.getByRole("region", { name: "Map" });
  const marker = map
    .locator('.feature-marker[data-layer="land"]')
    .and(map.getByRole("button", { name: /^Land Opportunity: 48\.2 acres/ }));
  await expect(async () => {
    if ((await marker.count()) === 0) {
      await map.locator("canvas").press("Equal");
    }
    await expect(marker).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  // By keyboard, as another Layer's cluster may lie over it.
  await marker.press("Enter");

  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toContainText(
    "Ownership Category: Other registered (indicative)",
  );
  await expect(
    popup
      .getByRole("list", {
        name: "Company and council titles matched in and around it by address, indicative",
      })
      .getByRole("listitem"),
  ).toHaveText([METAL_CRAFT]);
  await expect(popup).toContainText(STATEMENT);
});

test("choosing a Land Opportunity in the Land panel gives its Ownership Category, the title matched around it, and credits CCOD and OCOD", async ({
  page,
}) => {
  await openLandPanel(page);

  await landPanel(page)
    .getByRole("button", { name: /^48\.2 acres/ })
    .click();

  const chosen = landPanel(page).getByRole("region", {
    name: "Land Opportunity: 48.2 acres (19.5 ha)",
  });
  await expect(chosen).toContainText(
    "Ownership Category Other registered (indicative)",
  );
  await expect(
    chosen
      .getByRole("list", { name: "Titles matched in and around it" })
      .getByRole("listitem"),
  ).toHaveText([METAL_CRAFT]);
  await expect(chosen).toContainText(STATEMENT);
  await expect(chosen).toContainText("Ownership Categories are indicative.");
  // Its licence's statements, with links to its conditions, at the panel's foot.
  for (const dataset of ["ccod", "ocod"]) {
    await expect(
      landPanel(page).locator(
        `a[href="https://use-land-property-data.service.gov.uk/datasets/${dataset}/licence/view"]`,
      ),
    ).toHaveText("Conditions of use");
  }
  await expect(landPanel(page)).toContainText(
    "UK companies that own property in England and Wales: Information produced by HM Land Registry. © Crown copyright 2026. Conditions of use.",
  );
});

test("the Land panel filters Land Opportunities by Ownership Category across Ashfield", async ({
  page,
}) => {
  await openLandPanel(page);
  const panel = landPanel(page);
  await panel.getByLabel("Across Ashfield").check();
  await expect(listed(page)).toHaveCount(4);
  for (const button of await panel
    .getByRole("list", { name: "Land Opportunities" })
    .getByRole("button")
    .all()) {
    await expect(button).toHaveAttribute(
      "data-ownership-category",
      "other-registered",
    );
  }

  await panel.getByLabel("Company-owned").check();
  await panel.getByLabel("Council or public-body owned").check();
  await expect(panel).toContainText(
    "0 Land Opportunities across Ashfield, of 5 Land Parcels",
  );

  await panel.getByLabel("Other registered").check();
  await expect(listed(page)).toHaveCount(4);
  await panel.getByLabel("Company-owned").uncheck();
  await panel.getByLabel("Council or public-body owned").uncheck();
  await panel.getByLabel("Possibly Unregistered", { exact: true }).check();
  await expect(listed(page)).toHaveCount(4);
  await panel.getByLabel("Other registered").uncheck();
  await expect(panel).toContainText("0 Land Opportunities across Ashfield");

  await panel.getByRole("button", { name: "Reset to the defaults" }).click();
  await expect(listed(page)).toHaveText(["48.2 acres (19.5 ha)"]);
});

test("/api/land/{parcelId} gives the polygon around the field an overseas company's title is matched to, company-owned", async ({
  page,
}) => {
  const response = await page.request.get("/api/land/E07000170-2");

  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    inspirePolygons: { inspireId: string; ownershipCategory: string }[];
  };
  expect(
    body.inspirePolygons.map(({ inspireId, ownershipCategory }) => [
      inspireId,
      ownershipCategory,
    ]),
  ).toEqual([
    ["64151457", "other-registered"],
    ["64151706", "other-registered"],
    ["64152606", "other-registered"],
    ["25709295", "company"],
  ]);
});

/**
 * Answers as the API does for land prepared without LAND_REGISTRY_DATA_API_KEY:
 * no Land Parcel or INSPIRE Index Polygon has an Ownership Category, none
 * lists a title, and CCOD and OCOD aren't among the prepared datasets.
 */
const withoutTitles = async (route: Route) => {
  const response = await route.fetch();
  const body = (await response.json()) as Record<string, unknown>;
  const uncategorised = (parcel: Record<string, unknown>) => ({
    ...parcel,
    ownershipCategory: null,
    matchedTitles: [],
    inspirePolygons: (parcel.inspirePolygons as object[]).map((polygon) => ({
      ...polygon,
      ownershipCategory: null,
    })),
  });
  const changed = Array.isArray(body.features)
    ? {
        ...body,
        features: (body.features as Record<string, unknown>[]).map(
          uncategorised,
        ),
        statistics: body.statistics && {
          ...body.statistics,
          ownershipCategories: null,
        },
      }
    : Array.isArray(body.datasets)
      ? {
          ...body,
          datasets: (body.datasets as { id: string }[]).filter(
            ({ id }) => id !== "ccod" && id !== "ocod",
          ),
        }
      : body;
  await route.fulfill({ response, json: changed });
};

test("without CCOD and OCOD, Land Opportunities are only Possibly Unregistered or registered, saying how to add Ownership Categories", async ({
  page,
}) => {
  await page.route(/\/api\/(area\/land|land|coverage)\?/, withoutTitles);
  await page.route(/\/api\/coverage$/, withoutTitles);
  await page.goto(SUTTON_PARKWAY);

  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  await expect(
    overview.getByRole("region", { name: "Land", exact: true }),
  ).toContainText(
    "Ownership Categories, indicativeNot prepared, so land is only Possibly Unregistered or registered. Set LAND_REGISTRY_DATA_API_KEY in .env and run pnpm data:prepare to add them from HM Land Registry's CCOD and OCOD.",
  );
  await expect(
    overview.getByRole("region", { name: "Land Coverage Area" }),
  ).toContainText(
    "Ownership Categories aren't prepared, so its land is only Possibly Unregistered or registered.",
  );

  await page.getByRole("tab", { name: "Land" }).click();
  await expect(listed(page)).toHaveText(["48.2 acres (19.5 ha)"]);
  await expect(
    landPanel(page).getByRole("list", { name: "Land Opportunities" }),
  ).toContainText("Farmland, road 10 m, about 351 homes");
  await expect(landPanel(page).getByLabel("Company-owned")).toHaveCount(0);
  await expect(landPanel(page)).not.toContainText("Information produced by");
});
