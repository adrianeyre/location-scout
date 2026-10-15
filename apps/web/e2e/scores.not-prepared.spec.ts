import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * The scores against an API with nothing prepared, as a fresh clone is before
 * `pnpm data:prepare` (PRD FR-6.6). With no estimate of NG17 1AA's residents,
 * Safety and Competition count per km² of its 0.5 mile Search Area, 2.03 km²,
 * and Demand is left out of the Location Score.
 */

const NG17_1AA = "/?lat=53.123664&lng=-1.264078&radius=0.5";

const scoresSection = (page: Page) =>
  page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Scores beta" });

/** The expandable score named `name`. */
const score = (page: Page, name: string) =>
  scoresSection(page)
    .locator("details")
    .filter({ has: page.locator("summary .score-name", { hasText: name }) });

/** The first row of a score's breakdown, as the text of its cells. */
const firstRowOf = (page: Page, name: string) =>
  scoresSection(page)
    .getByRole("table", { name: `How the ${name} score is reached` })
    .getByRole("row")
    .nth(1)
    .locator("th, td")
    .allTextContents();

test("without prepared data, Safety and Competition count per km², and Demand is left out of the Location Score", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&mode=business-cafe`);

  await expect(scoresSection(page).locator("summary")).toHaveText([
    // (0×10 + 100×5 + 88×15 + 80×5 + 55×25 + 81×20) ÷ 80 = 65.2
    "Location Score 65/100 beta",
    "Safety 0/100 beta",
    "Amenities 100/100 beta",
    "Transport 88/100 beta",
    "Planning freedom 80/100 beta",
    "Competition 55/100 beta",
    "Footfall proxy 81/100 beta",
  ]);
  await expect(scoresSection(page).locator(".score-left-out")).toHaveText(
    "Demand Not prepared: the Demographics Layer is not prepared, so it is left out of the Location Score.",
  );
  await expect(scoresSection(page).locator(".scores-left-out")).toHaveText(
    "Left out: Demand (the Demographics Layer is not prepared). The Location Score weighs the other categories, their weights renormalised to make up 100%.",
  );

  await score(page, "Safety").locator("summary").click();
  expect(await firstRowOf(page, "Safety")).toEqual([
    "Crimes a year per km²120 or fewer: 90 points, falling in proportion to 0 at 800 or more. That is 30 and 200 per 1,000 residents, taking 4,000 residents per km², as the Demographics Layer has no estimate of the Search Area's residents. From 2,024 crimes in the last 12 months over the Search Area's 2.03 km².",
    "995 per km²",
    "0",
  ]);

  await score(page, "Competition").locator("summary").click();
  expect(await firstRowOf(page, "Competition")).toEqual([
    "Competitors (cafés) per km²0 or fewer: 100 points, falling in proportion to 0 at 12 or more. That is 0 and 3 per 1,000 residents, taking 4,000 residents per km², as the Demographics Layer has no estimate of the Search Area's residents. From 11 cafés over the Search Area's 2.03 km².",
    "5.4 per km²",
    "54.9",
  ]);
});

test("without prepared data, the crime Highlight counts per km²", async ({
  page,
}) => {
  await page.goto(NG17_1AA);

  await expect(
    page
      .getByRole("region", { name: "What you need to know" })
      .getByRole("list", { name: "Highlights" })
      .locator(".highlight-text")
      .first(),
  ).toHaveText("High crime: 995 crimes a year per km²");
});
