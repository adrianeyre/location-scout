import {
  DEFAULT_SCOUT_MODE,
  DEFAULT_SEARCH_RADIUS_MILES,
  LAYER_IDS,
  isLocation,
  isScoutModeId,
  isSearchRadiusMiles,
  type LayerId,
  type Location,
  type ScoutModeId,
  type SearchRadiusMiles,
} from "@location-scout/shared";

import { formatWeights, parseWeights, type CustomWeights } from "./weights";

/**
 * The view kept in the page URL (PRD FR-1.7), so a search can be bookmarked,
 * shared and restored on reload, for example
 * `?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment&hidden=crime`.
 *
 * To keep more of the view in the URL, add a field here, read it in
 * `readUrlState` with a fallback for a missing or invalid value, and write it
 * in `writeUrlState`.
 */
export interface UrlState {
  /** The Location, or `null` before one has been chosen. */
  location: Location | null;
  radius: SearchRadiusMiles;
  /**
   * The Scout Mode (PRD FR-4.1). Any id is read from the URL: the modes are
   * config, so only the backend's list says which exist, and one it doesn't
   * have is put back to General once that list arrives.
   */
  mode: ScoutModeId;
  /**
   * The user's own weights for the Scout Mode (PRD FR-4.4), or `null` for its
   * defaults. Kept so a Saved Location can keep them. Any that total 100% are
   * read from the URL; ones that don't suit the mode are put back to its
   * defaults once the backend's modes arrive.
   */
  weights: CustomWeights | null;
  /**
   * The Layers the user has switched off, in `LAYER_IDS` order. Every other
   * Layer is visible, so a URL without `hidden` shows them all.
   */
  hidden: LayerId[];
}

/** Six decimal places is about 10 cm: the precision postcodes.io gives. */
const COORDINATE_DECIMALS = 6;

const roundCoordinate = (degrees: number) =>
  Number(degrees.toFixed(COORDINATE_DECIMALS));

const formatCoordinate = (degrees: number) => String(roundCoordinate(degrees));

/**
 * A Location as precise as the URL keeps it, so a map click loads the same
 * Search Area as reloading its URL.
 */
export const roundLocation = ({ lat, lng }: Location): Location => ({
  lat: roundCoordinate(lat),
  lng: roundCoordinate(lng),
});

/** A number parameter, or `NaN` if it is missing or blank. */
const numberParam = (params: URLSearchParams, name: string) => {
  const raw = params.get(name)?.trim();
  return raw ? Number(raw) : Number.NaN;
};

/** The Layers named in `hidden`, in `LAYER_IDS` order. Unknown names are dropped. */
export const hiddenLayers = (names: Iterable<string>): LayerId[] => {
  const named = new Set(names);
  return LAYER_IDS.filter((id) => named.has(id));
};

/** Reads the view from a URL's query string. Anything invalid falls back to its default. */
export const readUrlState = (search: string): UrlState => {
  const params = new URLSearchParams(search);
  const location = {
    lat: numberParam(params, "lat"),
    lng: numberParam(params, "lng"),
  };
  const radius = numberParam(params, "radius");
  const mode = params.get("mode")?.trim();
  return {
    location: isLocation(location) ? location : null,
    radius: isSearchRadiusMiles(radius) ? radius : DEFAULT_SEARCH_RADIUS_MILES,
    mode: isScoutModeId(mode) ? mode : DEFAULT_SCOUT_MODE,
    weights: parseWeights(params.get("weights")),
    hidden: hiddenLayers(params.get("hidden")?.split(",") ?? []),
  };
};

const OWN_PARAMS = new Set([
  "lat",
  "lng",
  "radius",
  "mode",
  "weights",
  "hidden",
]);

/**
 * The query string for a view, starting with `?`. Its own parameters come
 * first, always in the same order. Others are kept after them. `mode` is left
 * out for General, the default, `weights` for the mode's default weights, and
 * `hidden` when every Layer is visible.
 */
export const writeUrlState = (state: UrlState, search: string): string => {
  const params = new URLSearchParams();
  if (state.location) {
    params.set("lat", formatCoordinate(state.location.lat));
    params.set("lng", formatCoordinate(state.location.lng));
  }
  params.set("radius", String(state.radius));
  if (state.mode !== DEFAULT_SCOUT_MODE) params.set("mode", state.mode);
  if (state.weights) params.set("weights", formatWeights(state.weights));
  const hidden = hiddenLayers(state.hidden);
  if (hidden.length > 0) params.set("hidden", hidden.join(","));
  for (const [name, value] of new URLSearchParams(search)) {
    if (!OWN_PARAMS.has(name)) params.append(name, value);
  }
  // Commas and colons need no escaping in a query string, and read better
  // left alone.
  return `?${params.toString().replaceAll("%2C", ",").replaceAll("%3A", ":")}`;
};
