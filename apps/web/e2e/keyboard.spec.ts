import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * Every control by keyboard alone (PRD FR-9.5): nothing here is clicked or
 * filled. Each control is reached with Tab, as a person would, and worked
 * with the keys a person would press. NG17 1AA's 0.5 mile Search Area has a
 * recording for every Layer, with a Location Score of 62 in the General
 * Scout Mode, whose default weights are Safety 25%, Amenities 15%, Schools
 * 10%, Transport 15%, Green space 10%, Property activity 10%, Development
 * activity 5% and Planning freedom 10%.
 */

const NG17_1AA = "/?lat=53.123664&lng=-1.264078&radius=0.5";

/** Presses Tab until `target` has the focus, failing if it never does. */
const tabTo = async (page: Page, target: Locator, most = 80) => {
  for (let presses = 0; presses < most; presses += 1) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
};

/**
 * Tabs to "Skip past the map" and follows it to the Layers, as a person
 * would rather than Tab through every marker on the map.
 */
const pastTheMap = async (page: Page) => {
  await tabTo(page, page.getByRole("link", { name: "Skip past the map" }));
  await expect(
    page.getByRole("link", { name: "Skip past the map" }),
  ).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Layers" })).toBeFocused();
};

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

const scoresSection = (page: Page) =>
  overview(page).getByRole("region", { name: "Scores beta" });

const locationScore = (page: Page) =>
  scoresSection(page).locator("summary").first();

test("searches for a postcode by keyboard alone", async ({ page }) => {
  await page.goto("/");
  await tabTo(page, page.getByLabel("Postcode or address"));
  await page.keyboard.type("NG17 1AA");
  await page.keyboard.press("Enter");

  await expect(overview(page)).toContainText("NG17 1AA");
  await expect(locationScore(page)).toHaveText("Location Score 62/100 beta");
  await expect(page).toHaveURL(/[?&]lat=53\.123664&lng=-1\.264078/);
});

test("searches for an address and chooses one of the places it matches by keyboard alone", async ({
  page,
}) => {
  await page.goto("/");
  await tabTo(page, page.getByLabel("Postcode or address"));
  await page.keyboard.type("12 High Street, Sutton-in-Ashfield");
  await page.keyboard.press("Enter");

  const candidates = page.getByRole("region", { name: "Choose an address" });
  const choice = candidates.getByRole("button", { name: /NG17 1DH/ });
  await tabTo(page, choice);
  await page.keyboard.press("Enter");

  await expect(candidates).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]lat=53\.1241\d*&lng=-1\.2621\d*/);
  await expect(
    overview(page).getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();
});

test("switches a Layer off and on again by keyboard alone", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await expect(page.locator("#layer-crime-status")).not.toHaveText("Loading…");
  const crime = page.getByRole("checkbox", { name: "Crime" });
  await pastTheMap(page);
  // Past the button that folds the Layers away, to the first of them.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Hide the Layers" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(crime).toBeFocused();

  await page.keyboard.press("Space");
  await expect(crime).not.toBeChecked();
  await expect(page).toHaveURL(/[?&]hidden=crime(&|$)/);
  await expect(page.locator('[data-layer="crime"]')).toHaveCount(0);

  await page.keyboard.press("Space");
  await expect(crime).toBeChecked();
  await expect(page).not.toHaveURL(/hidden=/);
  await expect(page.locator('[data-layer="crime"]').first()).toBeVisible();
});

test("chooses a Scout Mode, which reweighs the scores, and a Search Radius by keyboard alone", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await expect(locationScore(page)).toHaveText("Location Score 62/100 beta");
  const scoutMode = page.getByLabel("Scout Mode");
  await tabTo(page, scoutMode);

  // General, Homebuyer, Buy-to-let, then Investment.
  await page.keyboard.press("ArrowDown");
  await expect(scoutMode).toHaveValue("homebuyer");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(scoutMode).toHaveValue("investment");
  await expect(page).toHaveURL(/[?&]mode=investment(&|$)/);
  await expect(locationScore(page)).toHaveText("Location Score 60/100 beta");

  // Back to the Search Radius, and from 0.5 mile to 1 mile.
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByLabel("Search Radius")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/[?&]radius=1(&|$)/);
  await expect(page.getByLabel("Search Radius")).toHaveValue("1");
});

test("moves the weight sliders and resets them by keyboard alone", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await expect(locationScore(page)).toHaveText("Location Score 62/100 beta");
  const toggle = scoresSection(page).getByRole("button", {
    name: /^Weights: /,
  });
  await pastTheMap(page);
  await tabTo(page, toggle);
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const safety = scoresSection(page).getByRole("slider", { name: "Safety" });
  await page.keyboard.press("Tab");
  await expect(safety).toBeFocused();
  await expect(safety).toHaveAttribute("aria-valuetext", "25%");

  await page.keyboard.press("ArrowRight");
  await expect(safety).toHaveAttribute("aria-valuetext", "26%");
  await expect(toggle).toHaveText("Weights: your own");
  await expect(page).toHaveURL(/[?&]weights=safety:26,/);

  // All of it on Safety, whose score is 0, then none of it.
  await page.keyboard.press("End");
  await expect(safety).toHaveAttribute("aria-valuetext", "100%");
  await expect(locationScore(page)).toHaveText("Location Score 0/100 beta");
  await page.keyboard.press("Home");
  await expect(safety).toHaveAttribute("aria-valuetext", "0%");

  const reset = scoresSection(page).getByRole("button", {
    name: "Reset to default",
  });
  await tabTo(page, reset);
  await page.keyboard.press("Enter");
  await expect(safety).toHaveAttribute("aria-valuetext", "25%");
  await expect(locationScore(page)).toHaveText("Location Score 62/100 beta");
  await expect(page).not.toHaveURL(/weights=/);
});

test("moves between the panel's tabs with the arrow keys, Home and End", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  const tab = (name: string) => page.getByRole("tab", { name });
  await pastTheMap(page);
  await tabTo(page, tab("Overview"));

  await page.keyboard.press("ArrowRight");
  await expect(tab("Land")).toBeFocused();
  await expect(tab("Land")).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("complementary", { name: "Land Opportunities" }),
  ).toBeVisible();

  await page.keyboard.press("End");
  await expect(tab("Compare")).toBeFocused();
  await expect(tab("Compare")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tab("Overview")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Compare")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tab("Overview")).toBeFocused();
  await expect(overview(page)).toBeVisible();
});

test("opens a Feature's popup from its marker, and Escape closes it back to the marker", async ({
  page,
}) => {
  await page.goto(
    `${NG17_1AA}&hidden=crime,planning,schools,transport,green-space,property,land,demographics`,
  );
  const marker = page
    .getByTestId("search-area-map")
    .locator('.feature-marker[data-layer="amenities"]')
    .first();
  await tabTo(page, marker);
  const name = await marker.getAttribute("aria-label");
  await page.keyboard.press("Enter");

  const popup = page.locator(".maplibregl-popup");
  await expect(popup.locator(".feature-popup")).toContainText(
    name?.split(",")[0] ?? "",
  );
  // The popup has the focus, so Tab goes on inside it.
  await expect(popup.locator(":focus")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(marker).toBeFocused();
});
