import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_MAPS_SCRIPT,
  GoogleMapsError,
  KEY_REFUSED,
  SCRIPT_FAILED,
  bearingDegrees,
  googleMapsScriptUrl,
  loadStreetView,
  onKeyRefused,
  resetGoogleMapsForTests,
  type StreetViewLibrary,
} from "./google-maps";

/** Google's script tags on the page. */
const scripts = () => [
  ...document.querySelectorAll<HTMLScriptElement>(
    `script[src^="${GOOGLE_MAPS_SCRIPT}"]`,
  ),
];

/** A stand-in for the `streetView` library Google's script gives. */
const LIBRARY = {
  StreetViewPanorama: vi.fn(),
  StreetViewService: vi.fn(),
  StreetViewPreference: { NEAREST: "nearest" },
  StreetViewSource: { OUTDOOR: "outdoor" },
} as unknown as StreetViewLibrary;

/** As Google's script does once it has loaded: calls back the page. */
const scriptLoads = (importLibrary = vi.fn(() => Promise.resolve(LIBRARY))) => {
  window.google = { maps: { importLibrary } };
  const callback = new URL(scripts()[0]?.src ?? "").searchParams.get(
    "callback",
  );
  (window as unknown as Record<string, () => void>)[callback ?? ""]?.();
  return importLibrary;
};

afterEach(() => {
  resetGoogleMapsForTests();
});

describe("googleMapsScriptUrl", () => {
  it("asks Google for its Maps JavaScript API with the key, loaded asynchronously, in British English", () => {
    const url = new URL(googleMapsScriptUrl("AIzaSyTestKey"));

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://maps.googleapis.com/maps/api/js",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: "AIzaSyTestKey",
      loading: "async",
      callback: "__locationScoutGoogleMapsLoaded",
      v: "weekly",
      language: "en-GB",
      region: "GB",
    });
  });
});

describe("loadStreetView", () => {
  it("loads nothing from Google until it is asked", () => {
    expect(scripts()).toEqual([]);
    expect(window.google).toBeUndefined();
  });

  it("adds Google's script once, however often it is asked, and gives its streetView library", async () => {
    const first = loadStreetView("AIzaSyTestKey");
    const second = loadStreetView("AIzaSyTestKey");

    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]?.src).toBe(googleMapsScriptUrl("AIzaSyTestKey"));
    expect(scripts()[0]?.async).toBe(true);
    const importLibrary = scriptLoads();

    await expect(first).resolves.toBe(LIBRARY);
    await expect(second).resolves.toBe(LIBRARY);
    expect(importLibrary).toHaveBeenCalledExactlyOnceWith("streetView");
  });

  it("fails if the script can't be loaded, and tries again when next asked", async () => {
    const loading = loadStreetView("AIzaSyTestKey");
    scripts()[0]?.dispatchEvent(new Event("error"));

    await expect(loading).rejects.toEqual(new GoogleMapsError(SCRIPT_FAILED));
    expect(scripts()).toEqual([]);

    const again = loadStreetView("AIzaSyTestKey");
    expect(scripts()).toHaveLength(1);
    scriptLoads();
    await expect(again).resolves.toBe(LIBRARY);
  });

  it("fails if Google's script can't give its streetView library", async () => {
    const loading = loadStreetView("AIzaSyTestKey");
    scriptLoads(vi.fn(() => Promise.reject(new Error("no library"))));

    await expect(loading).rejects.toEqual(new GoogleMapsError(SCRIPT_FAILED));
  });
});

describe("onKeyRefused", () => {
  it("is told when Google refuses the key, as its script says through gm_authFailure", async () => {
    const refused = vi.fn();
    const stop = onKeyRefused(refused);
    const loading = loadStreetView("AIzaSyWrongKey");
    scriptLoads();
    await loading;
    expect(refused).not.toHaveBeenCalled();

    window.gm_authFailure?.();

    expect(refused).toHaveBeenCalledOnce();
    stop();
    window.gm_authFailure?.();
    expect(refused).toHaveBeenCalledOnce();
  });

  it("is told at once if Google has already refused it", () => {
    void loadStreetView("AIzaSyWrongKey");
    window.gm_authFailure?.();
    const refused = vi.fn();

    onKeyRefused(refused);

    expect(refused).toHaveBeenCalledOnce();
  });

  it("says what to check", () => {
    expect(KEY_REFUSED).toBe(
      "Google refused GOOGLE_MAPS_API_KEY. Check it is a key for the Maps JavaScript API that allows this page, then restart the API.",
    );
  });
});

describe("bearingDegrees", () => {
  const here = { lat: 53.123664, lng: -1.264078 };

  it.each([
    ["north", { lat: 53.124664, lng: -1.264078 }, 0],
    ["east", { lat: 53.123664, lng: -1.263078 }, 90],
    ["south", { lat: 53.122664, lng: -1.264078 }, 180],
    ["west", { lat: 53.123664, lng: -1.265078 }, 270],
  ])("faces %s towards a point due %s", (_direction, there, degrees) => {
    expect(bearingDegrees(here, there)).toBeCloseTo(degrees, 1);
  });

  it("faces north-east towards a point north-east of it", () => {
    const bearing = bearingDegrees(here, { lat: 53.124264, lng: -1.263078 });
    expect(bearing).toBeGreaterThan(0);
    expect(bearing).toBeLessThan(90);
  });
});
