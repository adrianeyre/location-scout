import type { Location } from "@location-scout/shared";

/*
 * Google's Maps JavaScript API, for the optional Street View panel (PRD
 * FR-2.13). It is the one thing the frontend loads from anywhere but our
 * backend: Google's Street View runs only in a browser, from Google's
 * script, with the key in the page. The script is loaded only once the
 * user opens the panel, with the key `/api/street-view` gives, and never
 * without one.
 */

/** Where Google's script is loaded from. */
export const GOOGLE_MAPS_SCRIPT = "https://maps.googleapis.com/maps/api/js";

/** The global function Google's script calls once it has loaded. */
const LOADED_CALLBACK = "__locationScoutGoogleMapsLoaded";

/** A latitude and longitude as Google gives them. */
interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}

/** A Street View panorama Google found near a point. */
export interface PanoramaFound {
  data: {
    location?: {
      /** The panorama's id, which the panel shows it by. */
      pano: string;
      /** Where it was taken. */
      latLng?: GoogleLatLng;
    };
  };
}

export interface PanoramaOptions {
  pano: string;
  /** Which way it faces: `heading` in degrees clockwise from north. */
  pov: { heading: number; pitch: number };
  visible: boolean;
  /** Off: the panel is on a desktop, which has no motion to follow. */
  motionTracking: boolean;
}

/** The parts of Google's `streetView` library the panel uses. */
export interface StreetViewLibrary {
  StreetViewPanorama: new (
    container: HTMLElement,
    options: PanoramaOptions,
  ) => unknown;
  StreetViewService: new () => {
    getPanorama: (request: {
      location: Location;
      radius: number;
      preference: string;
      sources: string[];
    }) => Promise<PanoramaFound>;
  };
  StreetViewPreference: { NEAREST: string };
  StreetViewSource: { OUTDOOR: string };
}

declare global {
  interface Window {
    google?: {
      maps: {
        importLibrary: (name: "streetView") => Promise<StreetViewLibrary>;
      };
    };
    /** Called by Google's script when it refuses the key. */
    gm_authFailure?: () => void;
    [LOADED_CALLBACK]?: (() => void) | undefined;
  }
}

/** Google's script couldn't be loaded, or refused the key. */
export class GoogleMapsError extends Error {
  override name = "GoogleMapsError";
}

export const SCRIPT_FAILED =
  "Google's Street View couldn't be loaded. Check this computer is online, then try again.";

export const KEY_REFUSED =
  "Google refused GOOGLE_MAPS_API_KEY. Check it is a key for the Maps JavaScript API that allows this page, then restart the API.";

/** The script's URL, with the key and in British English. */
export const googleMapsScriptUrl = (apiKey: string) =>
  `${GOOGLE_MAPS_SCRIPT}?${new URLSearchParams({
    key: apiKey,
    loading: "async",
    callback: LOADED_CALLBACK,
    v: "weekly",
    language: "en-GB",
    region: "GB",
  }).toString()}`;

let loading: Promise<StreetViewLibrary> | null = null;
let keyRefused = false;
const refusalListeners = new Set<() => void>();

/**
 * Loads Google's script once, the first time it is asked for, and its
 * `streetView` library. If the script fails to load, the next call tries
 * again.
 */
export const loadStreetView = (apiKey: string): Promise<StreetViewLibrary> => {
  loading ??= new Promise<StreetViewLibrary>((resolve, reject) => {
    const script = document.createElement("script");
    window[LOADED_CALLBACK] = () => {
      const maps = window.google?.maps;
      if (!maps) {
        reject(new GoogleMapsError(SCRIPT_FAILED));
        return;
      }
      maps.importLibrary("streetView").then(resolve, () => {
        reject(new GoogleMapsError(SCRIPT_FAILED));
      });
    };
    window.gm_authFailure = () => {
      keyRefused = true;
      for (const listener of refusalListeners) listener();
    };
    script.src = googleMapsScriptUrl(apiKey);
    script.async = true;
    script.addEventListener("error", () => {
      script.remove();
      loading = null;
      reject(new GoogleMapsError(SCRIPT_FAILED));
    });
    document.head.append(script);
  });
  return loading;
};

/**
 * Calls `listener` if Google refuses the key, which it says only once its
 * script has loaded, or at once if it already has. Returns a function that
 * stops listening.
 */
export const onKeyRefused = (listener: () => void) => {
  if (keyRefused) listener();
  refusalListeners.add(listener);
  return () => {
    refusalListeners.delete(listener);
  };
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The compass bearing from one point to another, in degrees clockwise from
 * north, so a panorama taken a little way off faces what it was opened at.
 */
export const bearingDegrees = (from: Location, to: Location) => {
  const dLng = toRadians(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRadians(to.lat));
  const x =
    Math.cos(toRadians(from.lat)) * Math.sin(toRadians(to.lat)) -
    Math.sin(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

/** Forgets the script, for tests that load it again. */
export const resetGoogleMapsForTests = () => {
  loading = null;
  keyRefused = false;
  refusalListeners.clear();
  delete window.google;
  delete window.gm_authFailure;
  window[LOADED_CALLBACK] = undefined;
  for (const script of document.querySelectorAll(
    `script[src^="${GOOGLE_MAPS_SCRIPT}"]`,
  )) {
    script.remove();
  }
};
