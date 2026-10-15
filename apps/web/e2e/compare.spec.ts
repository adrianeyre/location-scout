import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * Comparing Saved Locations (PRD FR-7.3, NFR-3.2) against the
 * fixture-backed API. NG17 1AA's 0.5 mile Search Area has a recording for
 * every Layer: a Location Score of 62 in the General Scout Mode and 60 in
 * Investment. Sutton Parkway's 0.25 mile Search Area has none of
 * data.police.uk, planning.data.gov.uk or PlanIt, so leaves Safety,
 * Development activity and Planning freedom out of its 53 in General and 38
 * in Investment. Anywhere else only the prepared Layers have figures, so
 * NG17 1AA's 0.25 and 1 mile Search Areas are weighed from Schools alone.
 */

const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

const comparePanel = (page: Page) =>
  page.getByRole("complementary", { name: "Compare Saved Locations" });

const table = (page: Page) => comparePanel(page).getByRole("table");

const checkbox = (page: Page, name: string) =>
  comparePanel(page).getByRole("checkbox", { name, exact: true });

/** The comparison's column headings: each Saved Location's name and Search Area. */
const columnHeadings = (page: Page) => table(page).locator("thead th");

/** The cells of the row headed `name`. */
const row = (page: Page, name: string) =>
  table(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name, exact: true }) })
    .getByRole("cell");

const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Save this Search Area" });

test("saves two Search Areas, compares them side by side, and compares them again in another Scout Mode", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("tab", { name: "Saved" }).click();
  await expect(
    page.getByText(
      "Saves 0.5 mile around NG17 1AA, in the General Scout Mode, with its default weights.",
    ),
  ).toBeVisible();
  await saveButton(page).click();

  await page.goto(SUTTON_PARKWAY);
  await page.getByRole("tab", { name: "Saved" }).click();
  await expect(
    page.getByText(
      "Saves 0.25 mile around 53.114500, -1.246000, in the General Scout Mode, with its default weights.",
    ),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Sutton Parkway");
  await saveButton(page).click();
  await expect(
    page.getByRole("list", { name: "Saved Locations" }).getByRole("heading"),
  ).toHaveText(["NG17 1AA", "Sutton Parkway"]);

  await page.getByRole("tab", { name: "Compare" }).click();
  await checkbox(page, "NG17 1AA").check();
  await expect(comparePanel(page).getByRole("status")).toHaveText(
    "Choose another to compare it with.",
  );
  await checkbox(page, "Sutton Parkway").check();
  await expect(comparePanel(page).getByRole("status")).toHaveText(
    "Comparing 2 Saved Locations.",
  );

  await expect(table(page).locator("caption")).toHaveText(
    "Compared in the General Scout Mode, with its default weights",
  );
  await expect(columnHeadings(page)).toHaveText([
    "NG17 1AA 0.5 mile around NG17 1AA",
    "Sutton Parkway 0.25 mile around 53.114500, -1.246000",
  ]);
  await expect(row(page, "Location Score")).toHaveText([
    "62 ★ Best",
    "53 (5 of 8 Category Scores)",
  ]);
  await expect(row(page, "Safety")).toHaveText(["0", "Unavailable"]);
  await expect(row(page, "Amenities").first()).toHaveText("100 ★ Best");
  await expect(row(page, "Schools")).toHaveText(["87 ★ Best", "86"]);
  await expect(row(page, "Highlights").nth(1)).toContainText(
    "Good: Railway station 50 m away: Sutton Parkway",
  );
  await expect(row(page, "Nearest railway station")).toHaveText([
    "1.6 km",
    "50 m ★ Best",
  ]);
  await expect(row(page, "Nearest park")).toHaveText(["100 m", "100 m"]);
  await expect(row(page, "Planning Applications, last 3 years")).toHaveText([
    "126",
    "Unavailable",
  ]);
  // A 0.5 and a 0.25 mile Search Area: counts of what is in them aren't judged.
  await expect(row(page, "Bus stops")).toHaveText(["58", "5"]);
  await expect(
    comparePanel(page).getByText(/^These Search Areas differ in size/),
  ).toBeVisible();
  await expect(comparePanel(page)).toContainText(
    "Our data suggests this parcel warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner.",
  );

  // Every column is weighed again in the Scout Mode chosen above.
  await page.getByLabel("Scout Mode").selectOption("Investment");
  await expect(table(page).locator("caption")).toHaveText(
    "Compared in the Investment Scout Mode, with its default weights",
  );
  await expect(row(page, "Location Score")).toHaveText([
    "60 ★ Best",
    "38 (5 of 8 Category Scores)",
  ]);
  await expect(row(page, "Highlights").first()).not.toContainText(
    "Park 100 m away",
  );
  await expect(page).toHaveURL(/[?&]mode=investment(&|$)/);
});

/** Five Saved Locations, as the app keeps them in local storage. */
const FIVE_SAVED = {
  format: "location-scout.saved-locations",
  version: 1,
  savedLocations: [
    ["Market", 53.123664, -1.264078, 0.5, "NG17 1AA"],
    ["Station", 53.1145, -1.246, 0.25, null],
    ["Quarter mile", 53.123664, -1.264078, 0.25, null],
    ["A mile", 53.123664, -1.264078, 1, null],
    ["Mansfield", 53.1427, -1.1985, 0.5, null],
  ].map(([name, lat, lng, radius, postcode]) => ({
    id: `e2e-${String(name)}`,
    name,
    savedAt: "2026-10-09T09:15:00.000Z",
    location: { lat, lng },
    radius,
    mode: "general",
    weights: null,
    found: postcode === null ? null : { kind: "postcode", label: postcode },
  })),
};

test("compares 2, 3 and then 4 Saved Locations, and no more than 4", async ({
  page,
}) => {
  // A bare page, with Saved Locations put in local storage, loads no Search Area.
  await page.goto("/");
  await page.evaluate((saved) => {
    window.localStorage.setItem(
      "location-scout.saved-locations",
      JSON.stringify(saved),
    );
  }, FIVE_SAVED);
  await page.reload();
  await page.getByRole("tab", { name: "Compare" }).click();

  await checkbox(page, "Market").check();
  await checkbox(page, "Station").check();
  await expect(row(page, "Location Score")).toHaveText([
    "62 ★ Best",
    "53 (5 of 8 Category Scores)",
  ]);

  await checkbox(page, "Quarter mile").check();
  await expect(comparePanel(page).getByRole("status")).toHaveText(
    "Comparing 3 Saved Locations.",
  );
  await expect(columnHeadings(page)).toHaveText([
    "Market 0.5 mile around NG17 1AA",
    "Station 0.25 mile around 53.114500, -1.246000",
    "Quarter mile 0.25 mile around 53.123664, -1.264078",
  ]);
  await expect(row(page, "Location Score")).toHaveText([
    "62",
    "53 (5 of 8 Category Scores)",
    "87 (1 of 8 Category Scores) ★ Best",
  ]);
  await expect(row(page, "Estimated residents")).toHaveText([
    "9,052",
    "294",
    "1,955",
  ]);

  await checkbox(page, "A mile").check();
  await expect(comparePanel(page).getByRole("status")).toHaveText(
    "Comparing 4 Saved Locations, as many as fit side by side: untick one to compare another.",
  );
  await expect(columnHeadings(page)).toHaveCount(4);
  await expect(row(page, "Location Score")).toHaveText([
    "62",
    "53 (5 of 8 Category Scores)",
    "87 (1 of 8 Category Scores) ★ Best",
    "87 (1 of 8 Category Scores) ★ Best",
  ]);
  await expect(row(page, "Nearest primary school")).toHaveText([
    "520 m ★ Best",
    "950 m",
    "520 m ★ Best",
    "520 m ★ Best",
  ]);
  await expect(checkbox(page, "Mansfield")).toBeDisabled();

  // Unticking one makes room for another.
  await checkbox(page, "Station").uncheck();
  await expect(checkbox(page, "Mansfield")).toBeEnabled();
  await expect(columnHeadings(page)).toHaveCount(3);
});
