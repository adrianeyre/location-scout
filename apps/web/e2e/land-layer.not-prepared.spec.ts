import { expect, test } from "./fixtures";

/**
 * Against an API with nothing prepared, as a fresh clone is before `pnpm
 * data:prepare` (PRD FR-6.6): the Land Layer and the Land panel say to run
 * it, and every other Layer still loads.
 */

test("without prepared data, the Land Layer and the Land panel say to run pnpm data:prepare, and the other Layers still load", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.locator("#layer-land-status")).toHaveText("Not prepared");
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  await expect(
    overview.getByRole("region", { name: "Land", exact: true }),
  ).toContainText("Not prepared. Run pnpm data:prepare to show this Layer.");
  await expect(
    overview.getByRole("region", { name: "Amenities" }),
  ).toContainText("197 amenities");

  await page.getByRole("tab", { name: "Land" }).click();
  await expect(
    page.getByRole("complementary", { name: "Land Opportunities" }),
  ).toContainText(
    "Not prepared. Run pnpm data:prepare to prepare the Land Coverage Areas' Land Parcels.",
  );
});
