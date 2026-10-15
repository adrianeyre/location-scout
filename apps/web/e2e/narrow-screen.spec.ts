import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { MAIN_VIEWS } from "./main-views";

/*
 * A phone's width, 375 px (PRD FR-9.2): the map fills the screen under the
 * header, the panel a bottom sheet over its foot, and on every main view nothing scrolls sideways, neither the page nor anything
 * in it. Only what MapLibre clips to the map, such as markers beyond its
 * edge, may lie past the right of the screen.
 */

test.use({ viewport: { width: 375, height: 740 } });

/**
 * What scrolls sideways or reaches past the right of the screen, each as its
 * tag and class and how far, so a failure says where.
 */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const width = window.innerWidth;
    const found: string[] = [];
    const page = document.documentElement.scrollWidth - width;
    if (page > 0) found.push(`the page, by ${String(page)} px`);
    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`;
    /** Inside something that clips it, as the map clips its markers. */
    const clipped = (element: Element) => {
      for (let up = element.parentElement; up; up = up.parentElement) {
        const { overflowX } = getComputedStyle(up);
        if (overflowX === "hidden" || overflowX === "clip") return true;
      }
      return false;
    };
    for (const element of document.body.querySelectorAll("*")) {
      const { overflowX } = getComputedStyle(element);
      const by = element.scrollWidth - element.clientWidth;
      if ((overflowX === "auto" || overflowX === "scroll") && by > 0) {
        found.push(`${describe(element)} scrolls by ${String(by)} px`);
      }
      const { width: shown, right } = element.getBoundingClientRect();
      if (shown > 0 && right > width + 0.5 && !clipped(element)) {
        found.push(
          `${describe(element)} reaches ${String(Math.round(right - width))} px past`,
        );
      }
    }
    return found;
  });

for (const view of MAIN_VIEWS) {
  test(`nothing scrolls sideways at 375 px wide on ${view.name}`, async ({
    page,
  }) => {
    await view.open(page);
    expect(await sideways(page)).toEqual([]);
  });
}

test("at 375 px wide the map fills the screen under the header, with the panel a sheet over its foot that rises and lowers, and the header's controls each on the screen", async ({
  page,
}) => {
  await page.goto("/?lat=53.123664&lng=-1.264078&radius=0.5");
  await expect(
    page.getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();

  const mapBox = page.getByTestId("search-area-map");
  const map = await mapBox.boundingBox();
  const header = await page.locator(".app-header").boundingBox();
  const layers = page.getByRole("group", { name: "Layers" });
  const sheet = page.locator(".side-panel");
  const panel = await sheet.boundingBox();
  if (!map || !header || !panel) throw new Error("Not laid out");
  // The map from under the header to the foot of the screen.
  expect(map.width).toBe(375);
  expect(map.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  expect(Math.abs(map.y + map.height - 740)).toBeLessThanOrEqual(1);
  // The sheet across the map's foot, half raised.
  expect(panel.width).toBe(375);
  expect(
    Math.abs(panel.y + panel.height - (map.y + map.height)),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(panel.height - map.height / 2)).toBeLessThanOrEqual(2);
  // The Layers start folded over the map's top, clear of the sheet.
  await expect(
    layers.getByRole("button", { name: "Show the Layers" }),
  ).toBeVisible();
  const folded = await layers.boundingBox();
  expect(folded?.y).toBeGreaterThanOrEqual(map.y);
  expect((folded?.y ?? 0) + (folded?.height ?? 0)).toBeLessThanOrEqual(panel.y);

  // Its handle raises it fully, then lowers it to its tabs, by press alone.
  await page
    .getByRole("button", { name: "Panel half raised. Raise it" })
    .click();
  await expect(async () => {
    const raised = await sheet.boundingBox();
    expect(Math.abs((raised?.y ?? 0) - map.y)).toBeLessThanOrEqual(1);
  }).toPass();
  await page
    .getByRole("button", { name: "Panel fully raised. Lower it" })
    .click();
  await expect(async () => {
    const lowered = await sheet.boundingBox();
    expect(lowered?.height).toBe(144);
  }).toPass();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeInViewport();

  for (const control of [
    page.getByLabel("Postcode or address"),
    page.getByRole("button", { name: "Search", exact: true }),
    page.getByLabel("Search Radius"),
    page.getByLabel("Scout Mode"),
    page.getByRole("button", { name: "Dashboard" }),
    page.getByRole("button", { name: "Settings" }),
  ]) {
    const box = await control.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
  }
  expect(await sideways(page)).toEqual([]);
});

test("at 375 px wide a map popup stays within the map", async ({ page }) => {
  const popupView = MAIN_VIEWS.find(({ name }) => name === "a map popup");
  await popupView?.open(page);
  const map = await page.getByTestId("search-area-map").boundingBox();
  const popup = await page.locator(".maplibregl-popup-content").boundingBox();
  expect(popup?.x).toBeGreaterThanOrEqual(map?.x ?? 0);
  expect((popup?.x ?? 0) + (popup?.width ?? 0)).toBeLessThanOrEqual(
    (map?.x ?? 0) + (map?.width ?? 0),
  );
});
