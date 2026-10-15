import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * The README's screenshots, taken from the fixture-backed app, so they show
 * recorded data and never call a live Data Source. Skipped unless asked for:
 *
 *   README_SCREENSHOTS=1 pnpm --filter @location-scout/web test:e2e readme-screenshots --project=chromium
 *
 * The base map's tiles are blank offline, so only what Location Scout draws
 * is shown on the map.
 */
test.skip(!process.env.README_SCREENSHOTS, "Set README_SCREENSHOTS=1");

const OUT = "../../docs/screenshots";
const NG17 = "/?lat=53.123664&lng=-1.264078&radius=0.5";
const SUTTON_PARKWAY = "/?lat=53.1145&lng=-1.246&radius=0.25";

const withAppearance = (page: Page, mode: string, theme = "scout") =>
  page.addInitScript((kept) => {
    localStorage.setItem("location-scout:appearance", kept);
  }, JSON.stringify({ mode, theme }));

const loaded = async (page: Page) => {
  await expect(
    page.getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();
  // The map flies to the Search Area, then draws its Layers' markers apart.
  await page.waitForTimeout(6000);
};

test.use({ viewport: { width: 1440, height: 900 } });

test("the Location Overview, light", async ({ page }) => {
  await withAppearance(page, "light");
  await page.goto(NG17);
  await loaded(page);
  await page.screenshot({ path: `${OUT}/overview-light.png` });
});

test("the scores, dark", async ({ page }) => {
  await withAppearance(page, "dark");
  await page.goto(NG17);
  await loaded(page);
  await page
    .getByRole("region", { name: "Scores beta" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/scores-dark.png` });
});

test("the Land panel", async ({ page }) => {
  await withAppearance(page, "light", "forest");
  await page.goto(SUTTON_PARKWAY);
  await loaded(page);
  await page.getByRole("tab", { name: "Land" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/land-panel.png` });
});

test("Settings: mode and theme", async ({ page }) => {
  await withAppearance(page, "dark", "heather");
  await page.goto(NG17);
  await loaded(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/settings.png` });
});

test("a policy dialog", async ({ page }) => {
  await withAppearance(page, "light", "ocean");
  await page.goto(NG17);
  await loaded(page);
  await page.getByRole("button", { name: "Accessibility" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/accessibility-statement.png` });
});

test("the Dashboard", async ({ page }) => {
  await withAppearance(page, "light");
  await page.goto(`${NG17}&view=dashboard`);
  await expect(page.locator(".gauge")).toContainText("62/100");
  await expect(page.locator(".dashboard [aria-busy]")).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/dashboard.png` });
});

test("the Dashboard, a Widget being dragged", async ({ page }) => {
  await withAppearance(page, "light");
  await page.goto(`${NG17}&view=dashboard`);
  await expect(page.locator(".dashboard [aria-busy]")).toHaveCount(0);
  await page.waitForTimeout(400);
  const dashboard = page.getByRole("main", { name: "Dashboard" });
  const from = await dashboard
    .getByRole("region", { name: "Amenities", exact: true })
    .locator(".card-head h3")
    .boundingBox();
  const to = await dashboard
    .getByRole("region", { name: "Category Scores beta" })
    .boundingBox();
  if (!from || !to) throw new Error("The Widgets aren't drawn");
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(to.x + 40, to.y + 20, { steps: 15 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/dashboard-dragging.png` });
  await page.mouse.up();
});

test("on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withAppearance(page, "light");
  await page.goto(NG17);
  await loaded(page);
  await page.screenshot({ path: `${OUT}/phone.png` });
});
