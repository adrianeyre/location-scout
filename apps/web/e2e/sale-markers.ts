import type { Locator, Page } from "@playwright/test";

import { drawnCircle, expect, visibleMap } from "./fixtures";

/** NG17 1AA's 0.5 mile Search Area. */
export const NG17 = "/?lat=53.123664&lng=-1.264078&radius=0.5";

/** NG17 1AA's, with every Layer but Property off the map, so nothing covers a sale. */
export const ONLY_PROPERTY = `${NG17}&hidden=crime,planning,amenities,schools,transport,green-space,land,demographics`;

/** 88 High Pavement's marker, alone in NG17 1BT, as Price Paid's recording gives it. */
export const HIGH_PAVEMENT =
  "£173,000, Sold on 29 May 2026, 140 m from the Location";

/** Space `SearchAreaMap` keeps between the Search Area circle and the map's edges. */
const FIT_PADDING = 40;

/**
 * Waits until the map has flown to the Search Area: its circle is drawn in
 * the middle of the part of the map the panel leaves, fitted inside it.
 * Zooming any earlier would stop the flight short of the Location.
 */
export const arrived = async (page: Page, map: Locator) => {
  const visible = await visibleMap(page, map);
  const fitted = Math.min(visible.width, visible.height) - 2 * FIT_PADDING;
  await expect(async () => {
    const circle = await drawnCircle(page, map);
    expect(circle).not.toBeNull();
    if (!circle) return;
    expect(Math.abs(circle.width - fitted)).toBeLessThanOrEqual(fitted * 0.05);
    expect(Math.abs(circle.centre.x - visible.width / 2)).toBeLessThanOrEqual(
      3,
    );
    expect(Math.abs(circle.centre.y - visible.height / 2)).toBeLessThanOrEqual(
      3,
    );
  }).toPass({ timeout: 15_000 });
};

/**
 * The sale's marker labelled `label`, zooming in on the Location, which is
 * in the middle of the map, until there is one.
 */
export const saleMarker = async (map: Locator, label: string) => {
  const marker = map.locator(
    `.feature-marker[data-layer="property"][aria-label="${label}"]`,
  );
  await expect(async () => {
    if ((await marker.count()) === 0) {
      // MapLibre zooms in one level, around the middle, on "=".
      await map.locator("canvas").press("Equal");
    }
    await expect(marker).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return marker;
};
