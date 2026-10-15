import { expect, test } from "./fixtures";

/**
 * Against an API with nothing prepared, as a fresh clone is before `pnpm
 * data:prepare` (PRD FR-6.6): the Demographics Layer says to run it.
 */

test("without prepared data, the Demographics Layer says to run pnpm data:prepare, and the other Layers still load", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.locator("#layer-demographics-status")).toHaveText(
    "Not prepared",
  );
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  const section = overview.getByRole("region", { name: "Demographics" });
  await expect(section).toContainText(
    "Not prepared. Run pnpm data:prepare to show this Layer.",
  );
  await expect(page.getByLabel("Shade output areas by")).toHaveCount(0);
  await expect(
    overview.getByRole("region", { name: "Green space" }),
  ).toContainText("13 green spaces mapped in the Search Area.");
});

test("without prepared data, /api/area/demographics says it is not prepared", async ({
  page,
}) => {
  const response = await page.request.get(
    "/api/area/demographics?lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA",
  );

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    layer: "demographics",
    status: "not-prepared",
    features: [],
    statistics: null,
  });
});
