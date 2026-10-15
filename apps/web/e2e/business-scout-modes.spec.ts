import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * The Retail and Business Scout Modes against the fixture-backed API. In NG17
 * 1AA's 0.5 mile Search Area, Safety is 0, Amenities 100, Transport 88,
 * Planning freedom 80 and Green space 100, as in every mode. Footfall proxy
 * is 81: 131 shops, 14 offices and 58 bus stops, but no railway station, a
 * weighted count of 203 of 250. Demand is 30: the prepared fixture estimates
 * 9,052 residents, whose income is 11.8% below the median of its MSOAs, and
 * PlanIt's Planning Applications propose 50 homes approved or pending, about
 * 120 more residents.
 * Competition depends on the mode's competitors among the 197 amenities
 * recorded for it, per 1,000 of those residents.
 */

const NG17_1AA = "/?lat=53.123664&lng=-1.264078&radius=0.5";

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

const scoresSection = (page: Page) =>
  overview(page).getByRole("region", { name: "Scores beta" });

const modeSelect = (page: Page) => page.getByLabel("Scout Mode");

const summaries = (page: Page) => scoresSection(page).locator("summary");

/** The markers the Scout Mode stars on the map: its competitors, clustered or not. */
const starred = (page: Page) =>
  page
    .getByTestId("search-area-map")
    .locator('[data-layer="amenities"][data-highlighted]');

/** How many competitors the starred markers hold between them. */
const starredCount = async (page: Page) =>
  (
    await starred(page).evaluateAll((markers) =>
      markers.map((marker) => Number(marker.dataset.count)),
    )
  ).reduce((sum, count) => sum + count, 0);

/**
 * The rows of a Category Score's breakdown, as the text of their cells, each
 * input without the rule beneath it.
 */
const breakdownRows = (table: Locator) =>
  table.getByRole("row").evaluateAll((rows) =>
    rows.map((row) =>
      [...row.querySelectorAll("th, td")].map((cell) => {
        const copy = cell.cloneNode(true) as Element;
        copy.querySelector(".score-rule")?.remove();
        return copy.textContent;
      }),
    ),
  );

test("each Business and Retail Scout Mode weighs Demand, Competition and Footfall proxy into NG17 1AA's Location Score", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&mode=business-cafe`);

  // Green space and Property activity count for nothing in a café's mode.
  // 11 cafés, 1.2 per 1,000 residents, the nearest 110 m away:
  // (0×10 + 100×5 + 88×15 + 80×5 + 30×20 + 59×25 + 81×20) ÷ 100 = 59.15
  await expect(summaries(page)).toHaveText([
    "Location Score 59/100 beta",
    "Safety 0/100 beta",
    "Amenities 100/100 beta",
    "Transport 88/100 beta",
    "Planning freedom 80/100 beta",
    "Demand 30/100 beta",
    "Competition 59/100 beta",
    "Footfall proxy 81/100 beta",
  ]);
  await expect(scoresSection(page).locator(".scores-mode")).toHaveText(
    "Business: Café Scout Mode: Could I open a café here?",
  );

  const locationScore = summaries(page).first();
  for (const [mode, score, competition] of [
    // 131 shops, 14.5 per 1,000 residents, one 43 m away:
    // (0×10 + 100×5 + 88×20 + 80×5 + 30×25 + 18×10 + 81×25) ÷ 100 = 56.15
    ["Retail", 56, 18],
    // 5 restaurants, 0.55 per 1,000 residents, one 40 m away:
    // (… + 30×20 + 72×20 + 81×20) ÷ 100 = 63.8
    ["Business: Restaurant", 64, 72],
    // 17 takeaways, 1.9 per 1,000, one 58 m away:
    // (0×5 + 88×10 + 80×5 + 30×30 + 43×25 + 81×25) ÷ 100 = 52.8
    ["Business: Takeaway", 53, 43],
    // 2 gyms, 0.22 per 1,000:
    // (0×10 + 100×5 + 88×20 + 80×5 + 30×25 + 78×20 + 81×15) ÷ 100 = 61.9
    ["Business: Gym", 62, 78],
    // 17 hairdressers, 1.9 per 1,000, one 73 m away:
    // (0×10 + 88×15 + 80×5 + 30×30 + 27×25 + 81×15) ÷ 100 = 45.1
    ["Business: Hairdresser", 45, 27],
    // 10 convenience stores, 1.1 per 1,000, the nearest 141 m away:
    // (0×10 + 88×10 + 80×5 + 30×35 + 45×30 + 81×10) ÷ 100 = 44.9
    ["Business: Convenience store", 45, 45],
    // 1 dentist, and no Footfall proxy: (0×10 + 88×20 + 80×5 + 30×40 + 89×25) ÷ 100
    ["Business: Dental practice", 56, 89],
    // 2 nurseries, and Schools 87:
    // (0×20 + 87×10 + 88×10 + 100×10 + 30×25 + 78×25) ÷ 100 = 54.5
    ["Business: Nursery", 55, 78],
    ["Business: Café", 59, 59],
  ] as const) {
    await modeSelect(page).selectOption({ label: mode });
    await expect(locationScore).toHaveText(
      `Location Score ${String(score)}/100 beta`,
    );
    await expect(summaries(page).filter({ hasText: "Competition" })).toHaveText(
      `Competition ${String(competition)}/100 beta`,
    );
  }

  await modeSelect(page).selectOption({ label: "General" });

  await expect(locationScore).toHaveText("Location Score 62/100 beta");
  await expect(summaries(page).filter({ hasText: "Competition" })).toHaveCount(
    0,
  );
  await expect(summaries(page).filter({ hasText: "Footfall" })).toHaveCount(0);
  await expect(summaries(page).filter({ hasText: "Demand" })).toHaveCount(0);
});

test("Demand, Competition and Footfall proxy expand to their breakdowns", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&mode=business-restaurant`);

  await summaries(page).filter({ hasText: "Competition" }).click();
  const competition = scoresSection(page).getByRole("table", {
    name: "How the Competition score is reached",
  });
  expect(await breakdownRows(competition)).toEqual([
    ["Input and rule", "Figure", "Points"],
    [
      "Competitors (restaurants) per 1,000 residents",
      "0.6 per 1,000 residents",
      "81.6",
    ],
    ["Distance to the nearest competitor", "40 m", "−10"],
    ["Competition score", "72"],
  ]);
  await expect(competition).toContainText(
    "0 or fewer: 100 points, falling in proportion to 0 at 3 or more. From 5 restaurants for the Search Area's estimated 9,052 residents.",
  );

  await summaries(page).filter({ hasText: "Demand" }).click();
  const demand = scoresSection(page).getByRole("table", {
    name: "How the Demand score is reached",
  });
  expect(await breakdownRows(demand)).toEqual([
    ["Input and rule", "Figure", "Points"],
    ["Estimated residents of the Search Area", "9,052", "33.9"],
    ["Household income against the England median", "-11.8%", "−5.9"],
    ["Estimated new residents from Planning Applications", "120", "1.8"],
    ["Demand score", "30"],
  ]);
  await expect(demand).toContainText(
    "The Search Area's MSOAs average £38,890 a year, and England's median MSOA £44,091.",
  );
  await expect(demand).toContainText(
    "15 points at 1,000 new residents or more, in proportion below. Estimated from the 50 new homes the approved and pending Planning Applications received in the Search Area in the last 3 years propose, at 2.4 residents a home.",
  );

  await summaries(page).filter({ hasText: "Footfall proxy" }).click();
  const footfall = scoresSection(page).getByRole("table", {
    name: "How the Footfall proxy score is reached",
  });
  expect(await breakdownRows(footfall)).toEqual([
    ["Input and rule", "Figure", "Points"],
    ["Shops in the Search Area", "131", "52.4"],
    ["Offices in the Search Area", "14", "5.6"],
    ["Bus stops in the Search Area", "58", "23.2"],
    ["Railway stations in the Search Area", "0", "0"],
    ["Footfall proxy score", "81"],
  ]);
});

test("each Business and Retail Scout Mode stars its competitors on the map and names the nearest", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&mode=business-cafe`);
  const amenities = overview(page).getByRole("region", { name: "Amenities" });

  // NG17 1AA's 11 cafés, starred apart from its other 186 amenities.
  await expect.poll(() => starredCount(page)).toBe(11);
  await expect(amenities.locator(".competitors")).toHaveText(
    "Competitors in the Business: Café Scout Mode (cafés): 11 in the Search Area, the nearest Costa, 110 m away. Each is starred on the map.",
  );
  const toggles = page.getByRole("group", { name: "Layers" });
  await expect(
    toggles.locator(".layer-toggle[data-highlighted] label"),
  ).toHaveText(["Amenities"]);
  await expect(
    toggles.getByText("★ Business: Café", { exact: true }),
  ).toBeVisible();
  await expect(
    amenities.getByText("Highlighted by the Business: Café Scout Mode"),
  ).toBeAttached();

  for (const [mode, count] of [
    ["Business: Gym", 2],
    ["Business: Restaurant", 5],
    // Any shop=*: 100 other shops, 10 convenience stores, 4 supermarkets and
    // 17 hairdressers.
    ["Retail", 131],
    ["Business: Nursery", 2],
  ] as const) {
    await modeSelect(page).selectOption({ label: mode });
    await expect.poll(() => starredCount(page)).toBe(count);
  }

  await modeSelect(page).selectOption({ label: "General" });

  await expect(starred(page)).toHaveCount(0);
  await expect(amenities.locator(".competitors")).toHaveCount(0);
  await expect(toggles.locator(".layer-toggle[data-highlighted]")).toHaveCount(
    0,
  );
});

test("a competitor's marker and popup say it is one", async ({ page }) => {
  await page.goto(`${NG17_1AA}&mode=business-cafe`);
  const map = page.getByTestId("search-area-map");
  const costa = map.locator(
    '.feature-marker[data-highlighted][aria-label^="Competitor: Costa, Café"]',
  );

  // So no other Layer's marker is drawn over a café.
  for (const name of [
    "Crime",
    "Planning",
    "Schools",
    "Transport",
    "Green space",
    "Property",
  ]) {
    await page.getByRole("checkbox", { name }).uncheck();
  }
  // Markers are redrawn when the map stops moving, so once the map has flown
  // to the Search Area the cafés are split into several markers.
  await expect
    .poll(() => starred(page).count(), { timeout: 15_000 })
    .toBeGreaterThan(1);

  // Zoom in on the Location, in the middle of the map, until Costa is apart.
  await expect(async () => {
    if ((await costa.count()) === 0) {
      await map.locator("canvas").press("Equal");
    }
    await expect(costa).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(costa).toHaveAttribute(
    "aria-label",
    "Competitor: Costa, Café, 110 m from the Location",
  );
  await costa.click();

  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup.locator(".feature-popup-highlight")).toHaveText(
    "★ Competitor in the Business: Café Scout Mode",
  );
  await expect(popup.locator("li > strong")).toHaveText(["Costa"]);
});

test("the header stays in one row at 1280 px with the longest Scout Mode chosen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(NG17_1AA);
  await expect(modeSelect(page)).toBeEnabled();
  const header = page.getByRole("banner");
  const oneRow = (await header.boundingBox())?.height;

  await modeSelect(page).selectOption({ label: "Business: Convenience store" });

  await expect(modeSelect(page)).toHaveAttribute(
    "title",
    "Business: Convenience store",
  );
  expect((await header.boundingBox())?.height).toBe(oneRow);
});
