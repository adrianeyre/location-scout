import {
  test as base,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

/** The base map's tiles: the one thing the page may fetch from elsewhere. */
const BASE_MAP_TILES = /^https:\/\/tile\.openstreetmap\.org\//;

/** A transparent 1×1 PNG, answered for every base map tile. */
const BLANK_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/**
 * Every end-to-end test runs offline. Base map tiles are answered with a blank
 * tile. Any other request that leaves the frontend's own origin is blocked and
 * fails the test: the frontend talks only to our backend (ADR 0001), which
 * answers from recorded fixtures (PRD NFR-3.3). The one exception, Google's
 * script for the optional Street View panel (PRD FR-2.13), is stubbed by the
 * tests that open it, with a `page.route`, which comes before this one.
 */
export const test = base.extend<{ blockedRequests: string[] }>({
  blockedRequests: [
    async ({ context, baseURL }, use) => {
      const blocked: string[] = [];
      await context.route(
        (url) => url.origin !== baseURL,
        (route) => {
          const url = route.request().url();
          if (BASE_MAP_TILES.test(url)) {
            return route.fulfill({
              contentType: "image/png",
              body: BLANK_TILE,
            });
          }
          blocked.push(url);
          return route.abort("blockedbyclient");
        },
      );
      await use(blocked);
      expect(
        blocked,
        "requests the page sent somewhere other than our backend",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Pixels of one colour drawn on the map, in pixels from the map's top left. */
export interface DrawnColour {
  /** How many pixels are the colour. */
  pixels: number;
  centre: { x: number; y: number };
  width: number;
  height: number;
}

/** The Search Area circle as drawn on the map. */
export type DrawnCircle = DrawnColour;

/**
 * The part of the map the side panel leaves uncovered, from its top left:
 * all of it but a panel along its right, or a sheet along its foot.
 */
export const visibleMap = async (page: Page, map: Locator) => {
  const box = await map.boundingBox();
  if (!box) throw new Error("The map has no size");
  const panel = page.locator("#side-panel");
  const over = (await panel.isVisible()) ? await panel.boundingBox() : null;
  const covers =
    over !== null &&
    over.x < box.x + box.width &&
    over.y < box.y + box.height &&
    over.y + over.height > box.y;
  if (covers && over.width >= box.width * 0.9) {
    return { width: box.width, height: over.y - box.y, boxWidth: box.width };
  }
  if (covers && over.x > box.x + box.width / 2) {
    return { width: over.x - box.x, height: box.height, boxWidth: box.width };
  }
  return { width: box.width, height: box.height, boxWidth: box.width };
};

/** The colour `SearchAreaMap` draws the Search Area outline in. */
const SEARCH_AREA_OUTLINE = "#1565c0";

/**
 * Finds the pixels of `colour`, such as `#1565c0`, in a screenshot of the map.
 * MapLibre draws shapes on a canvas, so their outlines' pixels are the only
 * evidence they are there. Anything in `masks`, such as markers of the same
 * colour, is painted over first. Returns `null` if no pixel is the colour.
 */
export const drawnColour = async (
  page: Page,
  map: Locator,
  colour: string,
  masks: Locator[] = [],
): Promise<DrawnColour | null> => {
  // Only what can be seen beside the panel floating over the map.
  const visible = await visibleMap(page, map);
  const screenshot = await map.screenshot({
    animations: "disabled",
    // What floats over the map, such as the side panel, isn't drawn on it.
    mask: [...masks, page.locator("[data-covers-map]")],
    maskColor: "#ffffff",
  });
  const rgb = {
    r: parseInt(colour.slice(1, 3), 16),
    g: parseInt(colour.slice(3, 5), 16),
    b: parseInt(colour.slice(5, 7), 16),
  };
  return page.evaluate(
    async ({ png, colour, visible }) => {
      const image = await createImageBitmap(
        new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))]),
      );
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No 2D canvas to read the screenshot");
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);

      let pixels = 0;
      let [left, right, top, bottom] = [
        Infinity,
        -Infinity,
        Infinity,
        -Infinity,
      ];
      for (let i = 0; i < data.length; i += 4) {
        const distance =
          Math.abs((data[i] ?? 0) - colour.r) +
          Math.abs((data[i + 1] ?? 0) - colour.g) +
          Math.abs((data[i + 2] ?? 0) - colour.b);
        if (distance > 30) continue;
        const x = (i / 4) % image.width;
        const y = Math.floor(i / 4 / image.width);
        // The screenshot is in device pixels; the visible part in CSS ones.
        const scale = image.width / visible.boxWidth;
        if (x >= visible.width * scale || y >= visible.height * scale) {
          continue;
        }
        pixels += 1;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      return pixels === 0
        ? null
        : {
            pixels,
            centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
            width: right - left,
            height: bottom - top,
          };
    },
    { png: screenshot.toString("base64"), colour: rgb, visible },
  );
};

/**
 * Finds the Search Area circle in a screenshot of the map, by the colour of
 * its outline. Returns `null` if it isn't drawn.
 */
export const drawnCircle = (page: Page, map: Locator) =>
  drawnColour(page, map, SEARCH_AREA_OUTLINE);
