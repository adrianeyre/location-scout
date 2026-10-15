import type { Page, Route } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  HIGH_PAVEMENT,
  NG17,
  ONLY_PROPERTY,
  arrived,
  saleMarker,
} from "./sale-markers";

/**
 * The optional Street View panel (PRD FR-2.13), against the API started with
 * `GOOGLE_MAPS_API_KEY`, and the very same frontend as every other test.
 * Google's script is stubbed in the browser (`stubGoogleMaps`), so no test
 * reaches Google: its Street View service finds a panorama 20 m south of
 * wherever it is asked, and its panorama only says which one it shows.
 */
/** The key the API on port 8801 is started with (`playwright.config.ts`). */
const TEST_KEY = "AIzaSy_location_scout_test";

const GOOGLE_MAPS_SCRIPT = /^https:\/\/maps\.googleapis\.com\/maps\/api\/js\?/;

/** What the stubbed Google script was asked for, and asked to show. */
interface StubbedGoogle {
  requests: {
    location: { lat: number; lng: number };
    radius: number;
    preference: string;
    sources: string[];
  }[];
  panoramas: { pano: string; pov: { heading: number; pitch: number } }[];
}

/**
 * Answers Google's script with a stand-in for its `streetView` library, as
 * its script calls back the page once loaded. Returns the URLs it was
 * loaded from.
 */
const stubGoogleMaps = async (page: Page) => {
  const loaded: string[] = [];
  await page.route(GOOGLE_MAPS_SCRIPT, (route: Route) => {
    const url = new URL(route.request().url());
    loaded.push(url.href);
    const callback = url.searchParams.get("callback") ?? "";
    return route.fulfill({
      contentType: "text/javascript",
      body: `(() => {
        const stubbed = { requests: [], panoramas: [] };
        window.stubbedGoogle = stubbed;
        class StreetViewService {
          getPanorama(request) {
            stubbed.requests.push(JSON.parse(JSON.stringify(request)));
            const { lat, lng } = request.location;
            return Promise.resolve({ data: { location: {
              pano: "stubbed-pano",
              latLng: { lat: () => lat - 0.00018, lng: () => lng },
            } } });
          }
        }
        class StreetViewPanorama {
          constructor(container, options) {
            stubbed.panoramas.push({ pano: options.pano, pov: options.pov });
            container.textContent = "Google's panorama " + options.pano;
          }
        }
        window.google = { maps: { importLibrary: (name) =>
          name === "streetView"
            ? Promise.resolve({
                StreetViewService,
                StreetViewPanorama,
                StreetViewPreference: { NEAREST: "nearest" },
                StreetViewSource: { OUTDOOR: "outdoor" },
              })
            : Promise.reject(new Error(name)),
        } };
        window[${JSON.stringify(callback)}]();
      })();`,
    });
  });
  return loaded;
};

const stubbed = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { stubbedGoogle: StubbedGoogle }).stubbedGoogle,
  );

const overview = (page: Page) =>
  page.getByRole("complementary", { name: "Location Overview" });

const streetViewPanel = (page: Page) =>
  page.getByRole("region", { name: "Street View", exact: true });

test("Street View opens at the Location with the key, loading Google's script only once it is opened", async ({
  page,
}) => {
  const loaded = await stubGoogleMaps(page);
  const streetView = page.waitForResponse((response) =>
    response.url().endsWith("/api/street-view"),
  );
  await page.goto(NG17);

  expect(await (await streetView).json()).toEqual({
    enabled: true,
    apiKey: TEST_KEY,
  });
  const open = page.getByRole("button", {
    name: "Street View at the Location",
  });
  await expect(open).toBeVisible();
  await expect(overview(page)).toContainText("Sutton Central & New Cross");
  // Nothing is loaded from Google, and charged, until it is opened.
  expect(loaded).toEqual([]);
  await expect(streetViewPanel(page)).toHaveCount(0);

  await open.click();

  const panel = streetViewPanel(page);
  await expect(
    panel.getByRole("heading", { name: "Street View" }),
  ).toBeVisible();
  await expect(panel).toContainText("The Location");
  await expect(
    panel.getByRole("region", { name: "Street View panorama" }),
  ).toHaveText("Google's panorama stubbed-pano");
  await expect(panel).toContainText(
    "From Google's nearest panorama, 20 m away, facing it.",
  );
  expect(loaded).toHaveLength(1);
  const script = new URL(loaded[0] ?? "");
  expect(script.searchParams.get("key")).toBe(TEST_KEY);
  expect(script.searchParams.get("loading")).toBe("async");
  const google = await stubbed(page);
  // In development React runs the panel's effect twice, and lets the first
  // go before it makes a panorama, so it may look twice, at the same point.
  expect(google.requests.length).toBeGreaterThan(0);
  for (const request of google.requests) {
    expect(request).toEqual({
      location: { lat: 53.123664, lng: -1.264078 },
      radius: 100,
      preference: "nearest",
      sources: ["outdoor"],
    });
  }
  // Only one panorama is made, the one Google is asked for.
  // Taken south of the Location, it faces north, towards it.
  expect(google.panoramas).toEqual([
    { pano: "stubbed-pano", pov: { heading: 0, pitch: 0 } },
  ]);

  await panel.getByRole("button", { name: "Close Street View" }).click();
  await expect(streetViewPanel(page)).toHaveCount(0);
  // Opening it again loads Google's script no more.
  await open.click();
  await expect(streetViewPanel(page)).toContainText("20 m away");
  expect(loaded).toHaveLength(1);
});

test("the Street View panel shows Google's attribution, as written, with its terms (PRD FR-10.1a)", async ({
  page,
}) => {
  await stubGoogleMaps(page);
  await page.goto(NG17);
  await page
    .getByRole("button", { name: "Street View at the Location" })
    .click();

  const credit = streetViewPanel(page).locator(".street-view-attribution");
  await expect(credit).toBeVisible();
  await expect(credit).toHaveText("Street View imagery: Google Maps. Terms");
  await expect(credit).toHaveAttribute("translate", "no");
  await expect(credit.getByRole("link", { name: "Terms" })).toHaveAttribute(
    "href",
    "https://www.google.com/intl/en-GB_ALL/help/terms_maps/",
  );
});

test("Street View opens at a sale clicked on the map, from its popup, without moving the Location", async ({
  page,
}) => {
  await stubGoogleMaps(page);
  await page.goto(ONLY_PROPERTY);
  const map = page.getByTestId("search-area-map");
  await expect(overview(page)).toContainText("24 sales in the Search Area");
  await arrived(page, map);

  // 88 High Pavement, alone in NG17 1BT, sold for £173,000.
  const marker = await saleMarker(map, HIGH_PAVEMENT);
  await marker.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(popup).toContainText("88 HIGH PAVEMENT");

  await popup.getByRole("button", { name: "Street View here" }).click();

  const panel = streetViewPanel(page);
  await expect(panel).toContainText("Property: £173,000, Sold on 29 May 2026");
  await expect(panel).toContainText(
    "From Google's nearest panorama, 20 m away, facing it.",
  );
  const [request] = (await stubbed(page)).requests;
  const location = request?.location ?? { lat: 0, lng: 0 };
  // The sale is placed at its postcode, NG17 1BT, not at the Location.
  expect(location.lat).not.toBe(53.123664);
  expect(location.lng).not.toBe(-1.264078);
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5&/);
});
