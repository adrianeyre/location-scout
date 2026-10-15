import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Without `EPC_API_KEY`, as every API but `*.epc.spec.ts`'s runs, EPCs
 * aren't looked for, and nothing about them is shown (PRD FR-2.6): the
 * README explains how to switch them on.
 */
const NG17 = "/?lat=53.123664&lng=-1.264078&radius=0.5";

const propertyOverview = (page: Page) =>
  page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Property" });

test("without EPC_API_KEY the Property Layer shows no EPC ratings, price per m² or EPC attribution, and asks the API for none", async ({
  page,
}) => {
  const property = page.waitForResponse((response) =>
    response.url().includes("/api/area/property?"),
  );
  await page.goto(NG17);

  const body = (await (await property).json()) as {
    epc: unknown;
    features: { epc: unknown }[];
  };
  expect(body.epc).toBeNull();
  expect(body.features.every(({ epc }) => epc === null)).toBe(true);

  const overview = propertyOverview(page);
  await expect(overview).toContainText(
    "24 sales in the Search Area from 9 October 2025 to 8 October 2026",
  );
  await expect(overview).toContainText(
    "Contains HM Land Registry data © Crown copyright",
  );
  await expect(overview).not.toContainText("Energy Performance");
  await expect(overview).not.toContainText("EPC");
  await expect(overview).not.toContainText("per m²");
  await expect(overview.locator(".property-epc")).toHaveCount(0);
});
