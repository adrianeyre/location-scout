import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * The weight sliders against the fixture-backed API (PRD FR-4.4). NG17 1AA's
 * 0.5 mile Search Area scores Safety 0, Amenities 100, Schools 87, Transport
 * 88, Green space 100, Property activity 40, Development activity 54 and
 * Planning freedom 80, for a Location Score of 62 with the General Scout
 * Mode's weights: 25, 15, 10, 15, 10, 10, 5 and 10.
 */

const NG17_1AA = "/?lat=53.123664&lng=-1.264078&radius=0.5";

const scoresSection = (page: Page) =>
  page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Scores beta" });

const locationScore = (page: Page) =>
  scoresSection(page).locator("summary").first();

const weightsToggle = (page: Page) =>
  scoresSection(page).getByRole("button", { name: /^Weights: / });

const slider = (page: Page, name: string) =>
  scoresSection(page).getByRole("slider", { name });

const sliders = (page: Page) =>
  scoresSection(page)
    .getByRole("group", {
      name: "Each category's weight in the Location Score",
    })
    .getByRole("slider");

/** Each slider's per cent, in the order they are shown. */
const sliderValues = (page: Page) =>
  sliders(page).evaluateAll((inputs) =>
    inputs.map((input) => Number((input as HTMLInputElement).value)),
  );

const resetButton = (page: Page) =>
  scoresSection(page).getByRole("button", { name: "Reset to default" });

const DEFAULTS = [25, 15, 10, 15, 10, 10, 5, 10];

/** Counts the requests for scores from now on. */
const countScoreRequests = (page: Page) => {
  const requests = { count: 0 };
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/scores") requests.count += 1;
  });
  return requests;
};

test("moving one slider rebalances the others to total 100%, and the Location Score follows at once", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await expect(locationScore(page)).toHaveText("Location Score 62/100 beta");
  await expect(weightsToggle(page)).toHaveText(
    "Weights: the General Scout Mode's defaults",
  );
  const scoreRequests = countScoreRequests(page);

  await weightsToggle(page).click();

  await expect(weightsToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(sliders(page)).toHaveCount(8);
  expect(await sliderValues(page)).toEqual(DEFAULTS);
  await expect(resetButton(page)).toBeDisabled();

  await slider(page, "Safety").fill("40");

  // The others share 60% in proportion: 15, 10, 15, 10, 10, 5 and 10 of 75.
  await expect
    .poll(() => sliderValues(page))
    .toEqual([40, 12, 8, 12, 8, 8, 4, 8]);
  // (0×40 + 100×12 + 87×8 + 88×12 + 100×8 + 40×8 + 54×4 + 80×8) ÷ 100
  // = 49.28
  await expect(locationScore(page)).toHaveText("Location Score 49/100 beta");
  await expect(slider(page, "Safety")).toHaveAttribute("aria-valuetext", "40%");
  await expect(weightsToggle(page)).toHaveText("Weights: your own");

  // By keyboard, a step at a time, still totalling 100%.
  await slider(page, "Planning freedom").focus();
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(slider(page, "Planning freedom")).toHaveValue("13");
  const values = await sliderValues(page);
  expect(values.reduce((sum, value) => sum + value, 0)).toBe(100);

  // Taking every weight, Transport alone makes the Location Score.
  await slider(page, "Transport").focus();
  await page.keyboard.press("End");
  expect(await sliderValues(page)).toEqual([0, 0, 0, 100, 0, 0, 0, 0]);
  await expect(locationScore(page)).toHaveText("Location Score 88/100 beta");

  await locationScore(page).click();
  await expect(
    scoresSection(page).getByRole("table", {
      name: "How the Location Score is weighed, with your own weights for the General Scout Mode",
    }),
  ).toBeVisible();
  // The Category Scores are weighed again where they are: none loads again.
  expect(scoreRequests.count).toBe(0);
});

test("Reset to default restores the Scout Mode's default weights", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await expect(locationScore(page)).toHaveText("Location Score 62/100 beta");
  await weightsToggle(page).click();
  await slider(page, "Amenities").fill("70");
  await expect(locationScore(page)).not.toHaveText(
    "Location Score 62/100 beta",
  );
  await expect(page).toHaveURL(/[?&]weights=/);

  await resetButton(page).click();

  await expect(locationScore(page)).toHaveText("Location Score 62/100 beta");
  expect(await sliderValues(page)).toEqual(DEFAULTS);
  await expect(weightsToggle(page)).toHaveText(
    "Weights: the General Scout Mode's defaults",
  );
  await expect(resetButton(page)).toBeDisabled();
  await expect(page).not.toHaveURL(/[?&]weights=/);
  await locationScore(page).click();
  await expect(
    scoresSection(page).getByRole("table", {
      name: "How the Location Score is weighed, with the General Scout Mode's weights",
    }),
  ).toBeVisible();
});

test("custom weights survive a reload", async ({ page }) => {
  await page.goto(`${NG17_1AA}&mode=development`);
  // (0×5 + 100×5 + 87×5 + 88×10 + 100×5 + 40×15 + 54×25 + 80×30) ÷ 100
  // = 66.65
  await expect(locationScore(page)).toHaveText("Location Score 67/100 beta");
  await weightsToggle(page).click();
  // Development's 5, 5, 5, 10, 5, 15, 25 and 30.
  expect(await sliderValues(page)).toEqual([5, 5, 5, 10, 5, 15, 25, 30]);

  await slider(page, "Planning freedom").fill("70");
  // The others share 30% in proportion: 5, 5, 5, 10, 5, 15 and 25 of 70.
  await expect
    .poll(() => sliderValues(page))
    .toEqual([2, 2, 2, 4, 2, 7, 11, 70]);
  // (0×2 + 100×2 + 87×2 + 88×4 + 100×2 + 40×7 + 54×11 + 80×70) ÷ 100
  // = 74
  await expect(locationScore(page)).toHaveText("Location Score 74/100 beta");
  await expect(page).toHaveURL(
    /[?&]mode=development&weights=safety:2,amenities:2,schools:2,transport:4,green-space:2,property-activity:7,development-activity:11,planning-freedom:70(&|$)/,
  );

  await page.reload();

  await expect(locationScore(page)).toHaveText("Location Score 74/100 beta");
  await expect(page.getByLabel("Scout Mode")).toHaveValue("development");
  await expect(weightsToggle(page)).toHaveText("Weights: your own");
  await expect(sliders(page)).toHaveCount(8);
  expect(await sliderValues(page)).toEqual([2, 2, 2, 4, 2, 7, 11, 70]);
  await expect(resetButton(page)).toBeEnabled();
});
