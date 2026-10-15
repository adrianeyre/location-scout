import type { Locator, Page, Route } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The Land Layer and the Land panel against the API's prepared-data fixture,
 * whose Land Parcels `pnpm data:prepare` built from the land recordings of 9
 * October 2026: Ashfield, the one Land Coverage Area, has five, in the three
 * small boxes the recordings cover. Sutton Parkway's 0.25 mile Search Area
 * reaches into one, a 48.2 acre farm field; across Ashfield, four meet
 * FR-5.3's default filters: the field, two fields of 6.6 and 6.4 acres and a
 * patch of grass of 0.17 acre; a fifth, 0.05 acre, is too small.
 */

const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

/** Every other Layer switched off the map, so nothing covers a Land Opportunity. */
const ONLY_LAND = `${SUTTON_PARKWAY}&hidden=crime,planning,amenities,schools,transport,green-space,property,demographics`;

const WORDING =
  "Our data suggests this parcel warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner.";

const landPanel = (page: Page) =>
  page.getByRole("complementary", { name: "Land Opportunities" });

/** The Land Opportunities the Land panel lists, by what their buttons say first. */
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

/** Looks across the whole of Ashfield, and waits for its four. */
const acrossAshfield = async (page: Page) => {
  await landPanel(page).getByLabel("Across Ashfield").check();
  await expect(listed(page)).toHaveCount(4);
};

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

test("Sutton Parkway's Search Area has a Land Opportunity, drawn on the map, counted in the Overview with FR-5.7's wording", async ({
  page,
}) => {
  await page.goto(SUTTON_PARKWAY);

  await expect(page.getByRole("checkbox", { name: "Land" })).toBeChecked();
  await expect(page.locator("#layer-land-status")).toHaveText(
    "1 Land Opportunity",
  );
  const section = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Land", exact: true });
  await expect(section).toContainText(
    "Land Opportunities1 in the Search Area, of 1 Land Parcel",
  );
  await expect(section).toContainText("Total area19.52 ha");
  await expect(section).toContainText("Possibly Unregistered0");
  await expect(section).toContainText("Estimated capacityAbout 351 homes");
  await expect(section).toContainText(WORDING);
  await expect(section).toContainText(
    "INSPIRE Index Polygons cover only registered freehold titles.",
  );
});

test("a Land Opportunity's popup gives its tags, the INSPIRE Index Polygons that overlap it, HM Land Registry's ownership checks and FR-5.7's wording", async ({
  page,
}) => {
  await page.goto(ONLY_LAND);
  const map = page.getByRole("region", { name: "Map" });

  const marker = await markerOf(map, /^Land Opportunity: 48\.2 acres/);
  await marker.click();

  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup.getByRole("heading", { name: "Land" })).toBeVisible();
  await expect(popup).toContainText("Land Opportunity: 48.2 acres (19.5 ha)");
  await expect(popup).toContainText("Farmland");
  await expect(popup).toContainText("INSPIRE Index Polygons cover 73% of it");
  await expect(popup).toContainText("Nearest road 10 m away");
  await expect(popup).toContainText("Flood zone 1");
  await expect(popup).toContainText("Room for about 351 homes, estimated");
  // PlanIt has no recording for Sutton Parkway, so its Planning Applications
  // are unavailable.
  await expect(popup).toContainText(
    "Nearby development activity unavailable: PlanIt didn't answer.",
  );
  await expect(
    popup.getByRole("list", { name: "INSPIRE Index Polygons that overlap it" }),
  ).toContainText("INSPIRE ID 64151457: 72% of it");
  await expect(
    popup.getByRole("link", { name: "Search the register" }),
  ).toHaveAttribute(
    "href",
    "https://www.gov.uk/search-property-information-land-registry",
  );
  await expect(
    popup.getByRole("link", { name: "Search the index map" }),
  ).toHaveAttribute(
    "href",
    "https://www.gov.uk/get-information-about-property-and-land/search-the-index-map",
  );
  await expect(popup).toContainText(WORDING);
});

/**
 * Answers the Land Layer as the API does where PlanIt has Planning
 * Applications near the field, which it has no recording of at Sutton
 * Parkway: a major scheme of 120 homes approved on it, made up, numbered
 * ZZ… as no council's are, and one refused.
 */
const withApplicationsNearTheField = async (route: Route) => {
  const response = await route.fetch();
  const body = (await response.json()) as {
    features: Record<string, unknown>[];
  };
  await route.fulfill({
    response,
    json: {
      ...body,
      features: body.features.map((feature) => ({
        ...feature,
        nearbyPlanningApplications: {
          status: "ok",
          provider: "PlanIt",
          withinMetres: 500,
          found: {
            count: 2,
            approved: 1,
            major: 1,
            estimatedHomes: 120,
            highlighted: [
              {
                id: "Ashfield/ZZ/2025/0001",
                reference: "ZZ/2025/0001",
                address: "Land at Sutton Parkway",
                description: "Erection of 120 dwellings",
                status: "approved",
                applicationType: "major",
                receivedOn: "2025-05-01",
                estimatedHomes: 120,
                distanceMetres: 0,
              },
            ],
          },
        },
      })),
    },
  });
};

test("a Land Opportunity's popup and the Land panel give its nearby development activity: the Planning Applications within 500 m, with the approved and major ones", async ({
  page,
}) => {
  await page.route(/\/api\/area\/land\?/, withApplicationsNearTheField);
  await page.goto(ONLY_LAND);
  const map = page.getByRole("region", { name: "Map" });

  const marker = await markerOf(map, /^Land Opportunity: 48\.2 acres/);
  await marker.click();

  const summary =
    "Nearby development activity: 2 Planning Applications within 500 m in the Search Area, 1 approved and 1 major, for about 120 new homes approved or pending, estimated";
  const listing =
    "Land at Sutton Parkway: Erection of 120 dwellings (approved, major application, about 120 new homes, estimated), on this land";
  const name =
    "Approved and major Planning Applications within 500 m, nearest first";
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toContainText(summary);
  await expect(popup.getByRole("list", { name })).toHaveText(listing);
  await expect(popup).toContainText(
    "Nearby development activity counts the Planning Applications received in the Search Area in the last 3 years, so none beyond its edge.",
  );

  await page.getByRole("tab", { name: "Land" }).click();
  await landPanel(page)
    .getByRole("button", { name: /^48\.2 acres/ })
    .click();
  const chosen = landPanel(page).getByRole("region", {
    name: "Land Opportunity: 48.2 acres (19.5 ha)",
  });
  await expect(chosen).toContainText(summary);
  await expect(chosen.getByRole("list", { name })).toHaveText(listing);
});

test("the Land panel lists them with FR-5.7's wording, and finds them across the whole of Ashfield in under 3 seconds", async ({
  page,
}) => {
  await openLandPanel(page);
  await expect(landPanel(page)).toContainText(WORDING);
  await expect(landPanel(page)).toContainText(
    "INSPIRE Index Polygons cover only registered freehold titles.",
  );

  const started = Date.now();
  await acrossAshfield(page);
  expect(Date.now() - started).toBeLessThan(3_000);

  await expect(listed(page)).toHaveText([
    "48.2 acres (19.5 ha)",
    "6.63 acres (2.68 ha)",
    "6.37 acres (2.58 ha)",
    "0.166 acres (0.067 ha)",
  ]);
  await expect(landPanel(page)).toContainText(
    "4 Land Opportunities across Ashfield, of 5 Land Parcels: 24.85 ha in all, 0 Possibly Unregistered, room for about 446 homes, estimated.",
  );
  await expect(page.locator("#layer-land-status")).toHaveText(
    "4 Land Opportunities",
  );
});

test("/api/land searches the whole of Ashfield in under 3 seconds", async ({
  page,
}) => {
  const started = Date.now();
  const response = await page.request.get(
    "/api/land?lat=53.1145&lng=-1.246&radius=0.25&scope=land-coverage-area",
  );
  const took = Date.now() - started;

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    layer: "land",
    status: "ok",
    scope: "land-coverage-area",
    landCoverageAreas: [{ code: "E07000170", name: "Ashfield" }],
    statistics: { parcels: 5, count: 4 },
  });
  expect(took).toBeLessThan(3_000);
});

test("every order and filter changes what the Land panel finds", async ({
  page,
}) => {
  await openLandPanel(page);
  await acrossAshfield(page);
  const panel = landPanel(page);
  const order = panel.getByLabel("Order");

  await order.selectOption("Nearest a road first");
  await expect(listed(page)).toHaveText([
    "0.166 acres (0.067 ha)",
    "6.37 acres (2.58 ha)",
    "48.2 acres (19.5 ha)",
    "6.63 acres (2.68 ha)",
  ]);
  await order.selectOption("Most homes first");
  await expect(listed(page).first()).toHaveText("48.2 acres (19.5 ha)");
  await order.selectOption("Largest first");

  const smallest = panel.getByLabel("Smallest area, in acres");
  await smallest.fill("10");
  await expect(listed(page)).toHaveText(["48.2 acres (19.5 ha)"]);
  await smallest.fill("0");
  await expect(listed(page)).toHaveCount(5);
  await smallest.fill("0.1");
  await expect(listed(page)).toHaveCount(4);

  const largest = panel.getByLabel("Largest area, in acres");
  await largest.fill("10");
  await expect(listed(page)).toHaveText([
    "6.63 acres (2.68 ha)",
    "6.37 acres (2.58 ha)",
    "0.166 acres (0.067 ha)",
  ]);
  await largest.fill("");
  await expect(listed(page)).toHaveCount(4);

  const road = panel.getByLabel("Furthest from a road");
  await road.selectOption("10 m");
  await expect(listed(page)).toHaveText([
    "48.2 acres (19.5 ha)",
    "6.37 acres (2.58 ha)",
    "0.166 acres (0.067 ha)",
  ]);
  await road.selectOption("Any distance");
  await expect(listed(page)).toHaveCount(4);
  await road.selectOption("50 m");

  // None of Ashfield's recorded land is in a flood zone, in a Planning
  // Constraint or on a listed building's outline, so these keep all four.
  await panel
    .getByLabel("Highest flood zone")
    .selectOption("1 only: not in flood zone 2 or 3");
  await panel.getByLabel("Flood zones").check();
  await panel.getByLabel("Conservation areas").check();
  await panel
    .getByLabel("Leave out land on a listed building's outline")
    .uncheck();
  await expect(listed(page)).toHaveCount(4);

  // All of it is mostly covered by INSPIRE Index Polygons.
  await panel.getByLabel("Possibly Unregistered only").check();
  await expect(panel).toContainText(
    "0 Land Opportunities across Ashfield, of 5 Land Parcels",
  );
  await expect(page.locator("#layer-land-status")).toHaveText(
    "None in this Land Coverage Area",
  );

  await panel.getByRole("button", { name: "Reset to the defaults" }).click();
  await expect(listed(page)).toHaveText(["48.2 acres (19.5 ha)"]);
  await expect(panel.getByLabel("In the Search Area")).toBeChecked();
});

test("choosing a Land Opportunity shows the INSPIRE Index Polygons that overlap it and HM Land Registry's ownership checks", async ({
  page,
}) => {
  await openLandPanel(page);

  await landPanel(page)
    .getByRole("button", { name: /^48\.2 acres/ })
    .click();

  const chosen = landPanel(page).getByRole("region", {
    name: "Land Opportunity: 48.2 acres (19.5 ha)",
  });
  await expect(chosen).toContainText(WORDING);
  await expect(chosen.getByRole("list", { name: "Its tags" })).toContainText(
    "INSPIRE Index Polygons cover 73% of it",
  );
  await expect(
    chosen
      .getByRole("list", { name: "INSPIRE Index Polygons that overlap it" })
      .getByRole("listitem"),
  ).toHaveText([
    "INSPIRE ID 64151457: 72% of it, Other registered (indicative)",
    "INSPIRE ID 64151706: under 1% of it, Other registered (indicative)",
    "INSPIRE ID 64152606: under 1% of it, Other registered (indicative)",
  ]);
  await expect(
    chosen.getByRole("link", {
      name: "HM Land Registry: Search the index map",
    }),
  ).toHaveAttribute(
    "href",
    "https://www.gov.uk/get-information-about-property-and-land/search-the-index-map",
  );
  // The panel credits the INSPIRE Index Polygons as HM Land Registry requires.
  await expect(landPanel(page)).toContainText("Ordnance Survey AC0000851063.");
});

test("the Development Scout Mode highlights the Land Layer", async ({
  page,
}) => {
  await page.goto(`${SUTTON_PARKWAY}&mode=development`);

  const toggle = page.locator(".layer-toggle", {
    has: page.locator("#layer-land"),
  });
  await expect(toggle).toHaveAttribute("data-highlighted");
  await expect(toggle).toContainText("★ Development");
  await page.getByRole("tab", { name: "Land" }).click();
  await expect(landPanel(page)).toContainText("★ Development");
});

test("outside every Land Coverage Area, the Land Layer says Land data not prepared for this area", async ({
  page,
}) => {
  await page.goto("/?lat=53.1435&lng=-1.1985&radius=0.5");

  await expect(page.locator("#layer-land-status")).toHaveText(
    "Land data not prepared for this area",
  );
  await expect(
    page
      .getByRole("complementary", { name: "Location Overview" })
      .getByRole("region", { name: "Land", exact: true }),
  ).toContainText(
    'Land data not prepared for this area. Add Mansfield with pnpm data:prepare --area "Mansfield".',
  );
  await page.getByRole("tab", { name: "Land" }).click();
  await expect(landPanel(page)).toContainText(
    'Land data not prepared for this area. Add Mansfield with pnpm data:prepare --area "Mansfield".',
  );
});
