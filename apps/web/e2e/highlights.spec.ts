import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * The Highlights against the fixture-backed API, in the General Scout Mode.
 * NG17 1AA's 0.5 mile Search Area has a recording for every Layer they read:
 * 224 crimes a year per 1,000 of the 9,052 residents the prepared fixture
 * estimates, up 5.9%; a conservation area over the Location;
 * all 13 types of amenity; 58 bus stops; a park 104 m away; and the median
 * price up 13.8% on a year before. Sutton Parkway's 0.25 mile Search Area has
 * no crime or planning recording.
 */

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

const highlightsSection = (page: Page) =>
  overview(page).getByRole("region", { name: "What you need to know" });

const highlights = (page: Page) =>
  highlightsSection(page)
    .getByRole("list", { name: "Highlights" })
    .getByRole("button");

const highlight = (page: Page, text: string) =>
  highlights(page).filter({ hasText: text });

const CONSERVATION_AREA =
  "Location is inside a conservation area: Sutton in Ashfield Church and Market Place";

test("NG17 1AA's Highlights open the Location Overview, Concerns first, each naming its Layer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(highlights(page)).toHaveText([
    "Concern: High crime: 224 crimes a year per 1,000 residents Crime",
    "Watch: Crime up 5.9% year on year Crime",
    `Watch: ${CONSERVATION_AREA} Planning`,
    "Good: All 13 types of amenity in the Search Area Amenities",
    "Good: 58 bus stops in the Search Area Transport",
    "Good: Park 100 m away Green space",
    "Good: Median price up 13.8% on a year before Property",
  ]);
  // Above the Location's details, its scores and each Layer's statistics.
  await expect(overview(page).locator("h2 + section")).toHaveAccessibleName(
    "What you need to know",
  );
  await expect(highlightsSection(page)).not.toContainText("Left out");
});

test("clicking a Highlight focuses its Layer: on the map, in the Layers panel and in the Overview", async ({
  page,
}) => {
  await page.goto("/?lat=53.123664&lng=-1.264078&radius=0.5&hidden=planning");
  const toggle = page.getByRole("checkbox", { name: "Planning" });
  const map = page.getByTestId("search-area-map");
  const markers = map.locator('.feature-marker[data-layer="planning"]');
  await expect(toggle).not.toBeChecked();
  await expect(markers).toHaveCount(0);

  await highlight(page, CONSERVATION_AREA).click();

  await expect(toggle).toBeChecked();
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);
  await expect(markers.first()).toBeVisible();
  await expect(
    page.locator(".layer-toggle").filter({ has: toggle }),
  ).toHaveAttribute("data-focused");
  await expect(page.locator(".layer-toggle[data-focused]")).toHaveCount(1);
  const planning = overview(page).getByRole("region", { name: "Planning" });
  await expect(planning).toBeFocused();
  await expect(planning).toBeInViewport();
});

test("a Highlight focuses its Layer by keyboard too", async ({ page }) => {
  await page.goto("/?lat=53.123664&lng=-1.264078&radius=0.5");
  const park = highlight(page, "Park 100 m away");
  await expect(park).toBeVisible();

  await park.focus();
  await page.keyboard.press("Enter");

  const greenSpace = overview(page).getByRole("region", {
    name: "Green space",
  });
  await expect(greenSpace).toBeFocused();
  await expect(greenSpace).toBeInViewport();
  await expect(
    page
      .locator(".layer-toggle")
      .filter({ has: page.getByRole("checkbox", { name: "Green space" }) }),
  ).toHaveAttribute("data-focused");
});

test("with the Crime and Planning Layers unavailable, their Highlights are left out, and the Overview says so", async ({
  page,
}) => {
  await page.goto("/?lat=53.1145&lng=-1.246&radius=0.25");

  await expect(highlights(page)).toHaveText([
    "Watch: No convenience store or supermarket in the Search Area Amenities",
    "Watch: No GP, pharmacy or other healthcare in the Search Area Amenities",
    "Watch: Quiet market: 1 sale in the last 12 months Property",
    "Good: Railway station 50 m away: Sutton Parkway Transport",
    "Good: Park 100 m away Green space",
  ]);
  await expect(highlightsSection(page)).toContainText(
    "Left out: anything from the Crime and Planning Layers, which are unavailable.",
  );
});
