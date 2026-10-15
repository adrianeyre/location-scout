import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * The Scout Modes against the fixture-backed API. NG17 1AA's 0.5 mile Search
 * Area has a recording for every Layer the scores read, and the prepared
 * fixture the Schools Layer: Safety 0, Amenities 100, Schools 87, Transport
 * 88, Green space 100, Property activity 40, Development activity 54 and
 * Planning freedom 80. Each mode weighs those into its own Location Score.
 */

const NG17_1AA = "/?lat=53.123664&lng=-1.264078&radius=0.5";

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

const scoresSection = (page: Page) =>
  overview(page).getByRole("region", { name: "Scores beta" });

const modeSelect = (page: Page) => page.getByLabel("Scout Mode");

const summaries = (page: Page) => scoresSection(page).locator("summary");

const highlights = (page: Page) =>
  overview(page)
    .getByRole("region", { name: "What you need to know" })
    .getByRole("list", { name: "Highlights" })
    .locator(".highlight-text");

/** Each row of the Location Score's breakdown, as the text of its cells. */
const locationRows = async (page: Page, mode: string) =>
  scoresSection(page)
    .getByRole("table", {
      name: `How the Location Score is weighed, with the ${mode} Scout Mode's weights`,
    })
    .getByRole("row")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
      ),
    );

const CATEGORY_SCORES = [
  "Safety 0/100 beta",
  "Amenities 100/100 beta",
  "Schools 87/100 beta",
  "Transport 88/100 beta",
  "Green space 100/100 beta",
  "Property activity 40/100 beta",
  "Development activity 54/100 beta",
  "Planning freedom 80/100 beta",
];

test("switching Scout Mode weighs the Location Score and its breakdown again, keeping the mode in the URL", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(modeSelect(page)).toHaveValue("general");
  await expect(modeSelect(page).locator("option")).toHaveText([
    "General",
    "Homebuyer",
    "Buy-to-let",
    "Investment",
    "Development",
    "Retail",
    "Business: Café",
    "Business: Restaurant",
    "Business: Takeaway",
    "Business: Gym",
    "Business: Hairdresser",
    "Business: Convenience store",
    "Business: Dental practice",
    "Business: Nursery",
  ]);
  await expect(summaries(page)).toHaveText([
    "Location Score 62/100 beta",
    ...CATEGORY_SCORES,
  ]);

  await modeSelect(page).selectOption({ label: "Development" });

  // (0×5 + 100×5 + 87×5 + 88×10 + 100×5 + 40×15 + 54×25 + 80×30) ÷ 100
  // = 66.65
  await expect(summaries(page)).toHaveText([
    "Location Score 67/100 beta",
    ...CATEGORY_SCORES,
  ]);
  await expect(page).toHaveURL(/[?&]mode=development(&|$)/);
  await expect(scoresSection(page).locator(".scores-mode")).toHaveText(
    "Development Scout Mode: Could I build here?",
  );
  await summaries(page).first().click();
  expect(await locationRows(page, "Development")).toEqual([
    ["Category", "Score", "Weight", "Share", "Points"],
    ["Safety", "0", "5", "5%", "0"],
    ["Amenities", "100", "5", "5%", "5"],
    ["Schools", "87", "5", "5%", "4.4"],
    ["Transport", "88", "10", "10%", "8.8"],
    ["Green space", "100", "5", "5%", "5"],
    ["Property activity", "40", "15", "15%", "6"],
    ["Development activity", "54", "25", "25%", "13.5"],
    ["Planning freedom", "80", "30", "30%", "24"],
    ["Location Score", "67"],
  ]);
});

test("each Scout Mode gives NG17 1AA its own Location Score", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  const locationScore = summaries(page).first();
  await expect(locationScore).toHaveText("Location Score 62/100 beta");

  for (const [mode, score] of [
    // (0×25 + 100×15 + 87×20 + 88×15 + 100×15 + 40×5 + 80×5) ÷ 100 = 66.6
    ["Homebuyer", 67],
    // (0×15 + 100×10 + 87×10 + 88×25 + 100×5 + 40×25 + 54×5 + 80×5) ÷ 100
    // = 62.4
    ["Buy-to-let", 62],
    // (0×10 + 100×10 + 87×5 + 88×15 + 100×5 + 40×25 + 54×25 + 80×5) ÷ 100
    // = 60.05
    ["Investment", 60],
    ["Development", 67],
    ["General", 62],
  ] as const) {
    await modeSelect(page).selectOption({ label: mode });
    await expect(locationScore).toHaveText(
      `Location Score ${String(score)}/100 beta`,
    );
  }
});

test("each Scout Mode gives its own Highlights", async ({ page }) => {
  await page.goto(NG17_1AA);
  await expect(highlights(page)).toHaveCount(7);

  await modeSelect(page).selectOption({ label: "Homebuyer" });

  // A buyer isn't told rising prices are good news.
  await expect(highlights(page)).toHaveText([
    "High crime: 224 crimes a year per 1,000 residents",
    "Crime up 5.9% year on year",
    "Location is inside a conservation area: Sutton in Ashfield Church and Market Place",
    "All 13 types of amenity in the Search Area",
    "58 bus stops in the Search Area",
    "Park 100 m away",
  ]);

  await modeSelect(page).selectOption({ label: "Development" });

  // A developer is told about the market, not about amenities or parks.
  await expect(highlights(page)).toHaveText([
    "High crime: 224 crimes a year per 1,000 residents",
    "Crime up 5.9% year on year",
    "Location is inside a conservation area: Sutton in Ashfield Church and Market Place",
    "58 bus stops in the Search Area",
    "Median price up 13.8% on a year before",
  ]);
});

test("Investment and Development highlight the Layers PRD FR-4.3a names", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&mode=investment`);
  const toggles = page.getByRole("group", { name: "Layers" });
  const highlighted = toggles.locator(".layer-toggle[data-highlighted] label");

  // Planning for its Planning Applications; Property for its sales and price change.
  await expect(highlighted).toHaveText(["Planning", "Property"]);
  await expect(toggles.getByText("★ Investment", { exact: true })).toHaveCount(
    2,
  );
  for (const name of ["Planning", "Property"]) {
    await expect(
      overview(page)
        .getByRole("region", { name })
        .getByText("Highlighted by the Investment Scout Mode"),
    ).toBeAttached();
  }
  await expect(
    overview(page)
      .getByRole("region", { name: "Crime" })
      .getByText("Highlighted by the Investment Scout Mode"),
  ).toHaveCount(0);

  await modeSelect(page).selectOption({ label: "Development" });

  // Planning for its Planning Constraints and Applications; Land for its
  // Land Opportunities.
  await expect(highlighted).toHaveText(["Planning", "Land"]);
  await expect(toggles.getByText("★ Development", { exact: true })).toHaveCount(
    2,
  );
  await expect(
    overview(page)
      .getByRole("region", { name: "Land", exact: true })
      .getByText("Highlighted by the Development Scout Mode"),
  ).toBeAttached();

  await modeSelect(page).selectOption({ label: "General" });

  await expect(highlighted).toHaveCount(0);
});

test("a shared URL opens in its Scout Mode, and Back returns to the one before", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&mode=homebuyer`);
  await expect(modeSelect(page)).toHaveValue("homebuyer");
  await expect(summaries(page).first()).toHaveText(
    "Location Score 67/100 beta",
  );

  await modeSelect(page).selectOption({ label: "Investment" });
  await expect(summaries(page).first()).toHaveText(
    "Location Score 60/100 beta",
  );
  await page.goBack();

  await expect(modeSelect(page)).toHaveValue("homebuyer");
  await expect(summaries(page).first()).toHaveText(
    "Location Score 67/100 beta",
  );
  await expect(page).toHaveURL(/[?&]mode=homebuyer(&|$)/);
});

test("a URL naming a Scout Mode that doesn't exist opens in General", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&mode=business-florist`);

  await expect(modeSelect(page)).toHaveValue("general");
  await expect(page).not.toHaveURL(/mode=/);
  await expect(summaries(page).first()).toHaveText(
    "Location Score 62/100 beta",
  );
  await expect(highlights(page)).toHaveCount(7);
});
