import { drawnCircle, expect, test, visibleMap } from "./fixtures";

/** Space `SearchAreaMap` keeps between the circle and the map's edges. */
const FIT_PADDING = 40;

test("a postcode search shows its Location and Search Area circle on the map", async ({
  page,
}) => {
  await page.goto("/");
  const map = page.getByTestId("search-area-map");
  await expect(map.locator("canvas")).toBeVisible();
  expect(await drawnCircle(page, map)).toBeNull();

  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  await expect(overview).toContainText("NG17 1AA");
  await expect(overview).toContainText("53.12366, -1.26408");
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);

  const marker = map.locator(".location-marker");
  await expect(marker).toBeVisible();

  // The map flies to the Search Area and fits the circle inside it.
  const mapBox = await map.boundingBox();
  if (!mapBox) throw new Error("The map has no size");
  // In the part of the map the panel leaves.
  const visible = await visibleMap(page, map);
  const fitted = Math.min(visible.width, visible.height) - 2 * FIT_PADDING;

  await expect(async () => {
    const circle = await drawnCircle(page, map);
    expect(circle).not.toBeNull();
    if (!circle) return;
    expect(circle.pixels).toBeGreaterThan(fitted);
    expect(Math.abs(circle.width - circle.height)).toBeLessThanOrEqual(4);
    expect(Math.abs(circle.width - fitted)).toBeLessThanOrEqual(fitted * 0.05);
    expect(Math.abs(circle.centre.x - visible.width / 2)).toBeLessThanOrEqual(
      3,
    );
    expect(Math.abs(circle.centre.y - visible.height / 2)).toBeLessThanOrEqual(
      3,
    );

    // The Location marker stands on the circle's centre.
    const markerBox = await marker.boundingBox();
    if (!markerBox) throw new Error("The Location marker has no size");
    const markerX = markerBox.x + markerBox.width / 2 - mapBox.x;
    expect(Math.abs(markerX - circle.centre.x)).toBeLessThanOrEqual(3);
    expect(markerBox.y - mapBox.y).toBeLessThan(circle.centre.y);
    expect(markerBox.y + markerBox.height - mapBox.y).toBeGreaterThan(
      circle.centre.y,
    );
  }).toPass({ timeout: 15_000 });
});
