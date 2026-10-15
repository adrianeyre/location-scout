import { expect, test } from "./fixtures";

/**
 * Against an API with nothing prepared, as a fresh clone is before `pnpm
 * data:prepare` (PRD FR-6.6): the Schools Layer and its score say to run it.
 */

test("without prepared data, the Schools Layer says to run pnpm data:prepare, its score is left out, and the other Layers still load", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.locator("#layer-schools-status")).toHaveText(
    "Not prepared",
  );
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  await expect(overview.getByRole("region", { name: "Schools" })).toContainText(
    "Not prepared. Run pnpm data:prepare to show this Layer.",
  );
  await expect(
    overview.getByRole("region", { name: "Amenities" }),
  ).toContainText("197 amenities");

  const scores = overview.getByRole("region", { name: "Scores beta" });
  // (0×25 + 100×15 + 88×15 + 100×10 + 40×10 + 54×5 + 80×10) ÷ 90 = 58.8
  await expect(scores.locator("summary").first()).toHaveText(
    "Location Score 59/100 beta",
  );
  await expect(scores.locator(".score-left-out")).toHaveText(
    "Schools Not prepared: the Schools Layer is not prepared, so it is left out of the Location Score.",
  );
  await expect(scores.locator(".scores-left-out")).toHaveText(
    "Left out: Schools (the Schools Layer is not prepared). The Location Score weighs the other categories, their weights renormalised to make up 100%.",
  );
});
