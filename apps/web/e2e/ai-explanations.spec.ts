import { expect, test } from "./fixtures";

/**
 * Without `ANTHROPIC_API_KEY`, as every API but `*.anthropic.spec.ts`'s
 * runs, AI Explanations are off (ADR 0005): no Explain button is shown
 * anywhere, and nothing is asked of a model. The README explains how to
 * switch them on.
 */
test("without ANTHROPIC_API_KEY no Explain button is offered, on the Overview, a Category Score or a Land Opportunity, and nothing asks for an explanation", async ({
  page,
}) => {
  const explanations: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/explain"))
      explanations.push(request.url());
  });
  const status = page.waitForResponse((response) =>
    response.url().endsWith("/api/explain"),
  );
  await page.goto("/?lat=53.1145&lng=-1.246&radius=0.25");

  expect(await (await status).json()).toEqual({ enabled: false });
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  await expect(
    overview.getByRole("region", { name: "Scores beta" }),
  ).toContainText("Green space");
  await overview.locator("details.score summary").first().click();
  await expect(page.getByRole("button", { name: /^Explain/ })).toHaveCount(0);

  await page.getByRole("tab", { name: "Land" }).click();
  const landPanel = page.getByRole("complementary", {
    name: "Land Opportunities",
  });
  await landPanel.getByRole("button", { name: /^48\.2 acres/ }).click();
  await expect(
    landPanel.getByRole("region", {
      name: "Land Opportunity: 48.2 acres (19.5 ha)",
    }),
  ).toContainText("Check its ownership with HM Land Registry");
  await expect(page.getByRole("button", { name: /^Explain/ })).toHaveCount(0);
  await expect(page.getByText("AI Explanation")).toHaveCount(0);
  expect(explanations).toEqual([]);
});
