import { expect, test } from "./fixtures";
import {
  HIGH_PAVEMENT,
  ONLY_PROPERTY,
  arrived,
  saleMarker,
} from "./sale-markers";

/**
 * Without `GOOGLE_MAPS_API_KEY`, as every API but
 * `*.google-maps.spec.ts`'s runs, the Street View panel is hidden and
 * nothing is loaded from Google (PRD FR-2.13): the README explains how to
 * switch it on.
 */
test("without GOOGLE_MAPS_API_KEY no Street View is offered, and no Google script is loaded", async ({
  page,
}) => {
  const fromGoogle: string[] = [];
  page.on("request", (request) => {
    if (/google/i.test(new URL(request.url()).hostname)) {
      fromGoogle.push(request.url());
    }
  });
  const streetView = page.waitForResponse((response) =>
    response.url().endsWith("/api/street-view"),
  );
  await page.goto(ONLY_PROPERTY);

  expect(await (await streetView).json()).toEqual({ enabled: false });
  const overview = page.getByRole("complementary", {
    name: "Location Overview",
  });
  await expect(overview).toContainText("Sutton Central & New Cross");
  await expect(
    overview.getByRole("region", { name: "Property" }),
  ).toContainText("24 sales in the Search Area");
  await expect(page.getByText("Street View")).toHaveCount(0);

  // A Feature's popup offers it no more than the map does.
  const map = page.getByTestId("search-area-map");
  await arrived(page, map);
  await (await saleMarker(map, HIGH_PAVEMENT)).click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toBeVisible();
  await expect(popup).not.toContainText("Street View");

  expect(fromGoogle).toEqual([]);
  expect(
    await page.evaluate(() => ({
      scripts: [...document.scripts]
        .map(({ src }) => src)
        .filter((src) => src.includes("google")),
      google: "google" in window,
    })),
  ).toEqual({ scripts: [], google: false });
});
