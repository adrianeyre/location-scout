import { expect, test } from "./fixtures";

/**
 * These run against an API with nothing prepared, as a fresh clone is before
 * `pnpm data:prepare` (PRD FR-6.6): the app still runs, and says to run it.
 */

test("without prepared data, the app runs, loads the Search Area, and says to run pnpm data:prepare", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  const section = overview.getByRole("region", { name: "Land Coverage Area" });
  await expect(section).toContainText(
    "Not prepared. Run pnpm data:prepare to find the council the Location is in and prepare its land data.",
  );
  await expect(section.locator("code")).toHaveText("pnpm data:prepare");

  // Everything that needs no prepared data still loads.
  await expect(
    overview.getByRole("region", { name: "Local geography" }),
  ).toContainText("Ashfield");
  await expect(
    overview.getByRole("region", { name: "Amenities" }),
  ).toContainText("197 amenities mapped in the Search Area.");
});

test("without prepared data, /api/coverage says nothing is prepared", async ({
  page,
}) => {
  const response = await page.request.get("/api/coverage");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({
    status: "not-prepared",
    preparedAt: null,
    datasets: [],
    landCoverageAreas: [],
  });
});
