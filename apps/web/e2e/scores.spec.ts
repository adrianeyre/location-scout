import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * The scores against the fixture-backed API. NG17 1AA's 0.5 mile Search Area
 * has a recording for every Layer the scores use: 2,024 crimes in the last 12
 * months for the 9,052 residents the prepared fixture estimates, up 5.9%; all
 * 13 types of amenity; Croft Primary School 519 m away, with no overall
 * grade, and Sutton Community Academy 232 m away, with a report card, in the
 * prepared Schools Layer; Sutton Parkway
 * 1,628 m away and 58 bus stops; a park 104 m away and 13 green spaces; 24
 * sales; PlanIt's 126 Planning Applications, 2 of them major; and a
 * conservation area over the Location. Sutton Parkway's 0.25 mile Search
 * Area has no crime, planning or PlanIt recording, so those Layers, and its
 * Planning Applications, are unavailable there.
 */

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

const scoresSection = (page: Page) =>
  overview(page).getByRole("region", { name: "Scores beta" });

/** The expandable score named `name`. */
const score = (page: Page, name: string) =>
  scoresSection(page)
    .locator("details")
    .filter({ has: page.locator("summary .score-name", { hasText: name }) });

/** Each row of a table, as the text of its cells. */
const rowsOf = async (page: Page, caption: string) =>
  scoresSection(page)
    .getByRole("table", { name: caption })
    .getByRole("row")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
      ),
    );

test("NG17 1AA's Location Score and each Category Score are labelled beta", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  const summaries = scoresSection(page).locator("summary");
  await expect(summaries).toHaveText([
    "Location Score 62/100 beta",
    "Safety 0/100 beta",
    "Amenities 100/100 beta",
    "Schools 87/100 beta",
    "Transport 88/100 beta",
    "Green space 100/100 beta",
    "Property activity 40/100 beta",
    "Development activity 54/100 beta",
    "Planning freedom 80/100 beta",
  ]);
  await expect(scoresSection(page)).not.toContainText("Left out");
});

test("each score expands, by keyboard, to its inputs, thresholds and points", async ({
  page,
}) => {
  await page.goto("/?lat=53.123664&lng=-1.264078&radius=0.5");
  const safety = score(page, "Safety");
  await expect(safety).toHaveCount(1);
  await expect(safety.getByRole("table")).toBeHidden();

  await safety.locator("summary").focus();
  await page.keyboard.press("Enter");

  await expect(safety.getByRole("table")).toBeVisible();
  expect(await rowsOf(page, "How the Safety score is reached")).toEqual([
    ["Input and rule", "Figure", "Points"],
    [
      "Crimes a year per 1,000 residents30 or fewer: 90 points, falling in proportion to 0 at 200 or more. From 2,024 crimes in the last 12 months for the Search Area's estimated 9,052 residents.",
      "223.6 per 1,000 residents",
      "0",
    ],
    [
      "Year-on-year change in crimeA fall of more than 10%: +10 points. A rise of more than 10%: −10 points.",
      "+5.9%",
      "0",
    ],
    ["Safety score", "0"],
  ]);

  const planning = score(page, "Planning freedom");
  await planning.locator("summary").click();
  expect(
    await rowsOf(page, "How the Planning freedom score is reached"),
  ).toEqual([
    ["Input and rule", "Figure", "Points"],
    [
      "Starting score100 points, less a penalty for each type of Planning Constraint the Location is inside.",
      "–",
      "100",
    ],
    [
      "Flood zone the Location is insideZone 3: −40 points. Zone 2: −20 points. Only the highest counts.",
      "–",
      "0",
    ],
    ["Location inside a conservation area−20 points if so.", "Yes", "−20"],
    ["Location inside a listed building−20 points if so.", "No", "0"],
    ["Location inside an Article 4 direction−15 points if so.", "No", "0"],
    ["Location inside a tree preservation zone−5 points if so.", "No", "0"],
    ["Planning freedom score", "80"],
  ]);

  const ofstedRule =
    "Up to 17.5 points, in proportion to its share. An overall grade earns Outstanding 100%, Good 75%, Requires improvement 25%, Inadequate 0%. Without one, the mean of the areas graded counts, a report card's Exceptional 100%, Strong standard 90%, Expected standard 75%, Needs attention 25%, Urgent improvement 0%. Safeguarding not found effective earns 0%.";
  await score(page, "Schools").locator("summary").click();
  expect(await rowsOf(page, "How the Schools score is reached")).toEqual([
    ["Input and rule", "Figure", "Points"],
    [
      "Distance to the nearest primary school800 m or less: 40 points, falling in proportion to 0 at 2.4 km or more.",
      "520 m",
      "40",
    ],
    [
      `Latest Ofsted judgement of the nearest primary school${ofstedRule} Croft Primary School: No overall grade, so the mean of the 5 areas graded in its graded inspection of 28 January 2025.`,
      "55% share",
      "9.6",
    ],
    [
      "Distance to the nearest secondary school2 km or less: 25 points, falling in proportion to 0 at 6 km or more.",
      "230 m",
      "25",
    ],
    [
      `Latest Ofsted judgement of the nearest secondary school${ofstedRule} Sutton Community Academy: No overall grade, so the mean of the 7 areas graded in its report card of 21 April 2026.`,
      "67.9% share",
      "11.9",
    ],
    ["Schools score", "87"],
  ]);

  const weighted =
    "100 points at a weighted count of 250 or more. It indicates change, not quality.";
  await score(page, "Development activity").locator("summary").click();
  expect(
    await rowsOf(page, "How the Development activity score is reached"),
  ).toEqual([
    ["Input and rule", "Figure", "Points"],
    [
      `Major Planning Applications in the Search Area in the last 3 yearsEach counts 5 towards the weighted count: 2 points each. ${weighted}`,
      "2",
      "4",
    ],
    [
      `Other Planning Applications in the Search Area in the last 3 yearsEach counts 1 towards the weighted count: 0.4 points each. ${weighted}`,
      "124",
      "49.6",
    ],
    ["Development activity score", "54"],
  ]);

  await score(page, "Location Score").locator("summary").click();
  expect(
    await rowsOf(
      page,
      "How the Location Score is weighed, with the General Scout Mode's weights",
    ),
  ).toEqual([
    ["Category", "Score", "Weight", "Share", "Points"],
    ["Safety", "0", "25", "25%", "0"],
    ["Amenities", "100", "15", "15%", "15"],
    ["Schools", "87", "10", "10%", "8.7"],
    ["Transport", "88", "15", "15%", "13.2"],
    ["Green space", "100", "10", "10%", "10"],
    ["Property activity", "40", "10", "10%", "4"],
    ["Development activity", "54", "5", "5%", "2.7"],
    ["Planning freedom", "80", "10", "10%", "8"],
    ["Location Score", "62"],
  ]);
});

test("with the Crime and Planning Layers and PlanIt unavailable, Safety, Development activity and Planning freedom are left out, and the Location Score says so", async ({
  page,
}) => {
  // The fixture-backed API has no data.police.uk, planning.data.gov.uk or
  // PlanIt recording for Sutton Parkway, so those calls fail.
  await page.goto("/?lat=53.1145&lng=-1.246&radius=0.25");

  await expect(scoresSection(page).locator("summary")).toHaveText([
    "Location Score 53/100 beta",
    "Amenities 13/100 beta",
    // Leamington Primary and Nursery Academy 947 m away, Good, and Sutton
    // Community Academy 1,420 m away, outside its Search Area.
    "Schools 86/100 beta",
    "Transport 80/100 beta",
    "Green space 91/100 beta",
    "Property activity 2/100 beta",
  ]);
  await expect(scoresSection(page)).toContainText(
    "Left out: Safety (the Crime Layer is unavailable), Development activity (the Planning Layer's Planning Applications are unavailable) and Planning freedom (the Planning Layer is unavailable). The Location Score weighs the other categories, their weights renormalised to make up 100%.",
  );
  await expect(scoresSection(page)).toContainText(
    "Development activity Unavailable: the Planning Layer's Planning Applications are unavailable, so it is left out of the Location Score.",
  );
  await expect(scoresSection(page)).toContainText(
    "Safety Unavailable: the Crime Layer is unavailable, so it is left out of the Location Score.",
  );
  await expect(scoresSection(page)).toContainText(
    "Planning freedom Unavailable: the Planning Layer is unavailable, so it is left out of the Location Score.",
  );

  await score(page, "Location Score").locator("summary").click();
  expect(
    await rowsOf(
      page,
      "How the Location Score is weighed, with the General Scout Mode's weights",
    ),
  ).toEqual([
    ["Category", "Score", "Weight", "Share", "Points"],
    ["Amenities", "13", "15", "25%", "3.3"],
    ["Schools", "86", "10", "16.7%", "14.3"],
    ["Transport", "80", "15", "25%", "20"],
    ["Green space", "91", "10", "16.7%", "15.2"],
    ["Property activity", "2", "10", "16.7%", "0.3"],
    ["Location Score", "53"],
  ]);
});
