import {
  isApiErrorResponse,
  isAreaResponse,
  isCoverageResponse,
  isExplainEvent,
  isExplainStatusResponse,
  isGeocodeResponse,
  isHighlightsResponse,
  isLandLayerResponse,
  isLandParcelResponse,
  isLayerResponse,
  isModesResponse,
  isScoresResponse,
  isStreetViewResponse,
  type AreaResponse,
  type CoverageResponse,
  type ExplainEvent,
  type ExplainRequest,
  type ExplainStatusResponse,
  type GeocodeResponse,
  type HighlightsResponse,
  type LandFilters,
  type LandLayerResponse,
  type LandParcelResponse,
  type LandScope,
  type LandSort,
  type LayerResponse,
  type Location,
  type ModesResponse,
  type ScoresResponse,
  type ScoutModeId,
  type SearchRadiusMiles,
  type StreetViewResponse,
  type ServedLayerId,
} from "@location-scout/shared";

/** The frontend's only way to get data: our own backend under /api (ADR 0001). */

export type ApiResult<T> =
  { ok: true; body: T } | { ok: false; message: string };

export const BACKEND_DOWN =
  "The backend is not answering. Start it with pnpm dev.";

const getJson = async <T>(
  url: string,
  isBody: (value: unknown) => value is T,
  signal: AbortSignal,
): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    return { ok: false, message: BACKEND_DOWN };
  }
  const body: unknown = await response.json().catch(() => null);
  // A newer search replaced this one while its body was arriving.
  signal.throwIfAborted();
  if (response.ok && isBody(body)) return { ok: true, body };
  if (isApiErrorResponse(body)) return { ok: false, message: body.error };
  return { ok: false, message: BACKEND_DOWN };
};

export const getGeocode = (query: string, signal: AbortSignal) =>
  getJson<GeocodeResponse>(
    `/api/geocode?${new URLSearchParams({ q: query }).toString()}`,
    isGeocodeResponse,
    signal,
  );

/**
 * The query that places a Search Area, for `/api/area`, each Layer, the
 * scores and the Highlights.
 */
const areaQuery = (
  location: Location,
  radius: SearchRadiusMiles,
  postcode: string | null,
) =>
  new URLSearchParams({
    lat: String(location.lat),
    lng: String(location.lng),
    radius: String(radius),
    ...(postcode === null ? {} : { postcode }),
  }).toString();

/**
 * `postcode` is the postcode the user searched for, if they did. It names the
 * Location's local geography; without it the backend uses the nearest postcode.
 * The Layers' Data Sources are left to each Layer's own request, so the
 * Search Area answers without waiting for the slowest of them (PRD NFR-2.3).
 */
export const getArea = (
  location: Location,
  radius: SearchRadiusMiles,
  postcode: string | null,
  signal: AbortSignal,
) =>
  getJson<AreaResponse>(
    `/api/area?${areaQuery(location, radius, postcode)}&sources=false`,
    isAreaResponse,
    signal,
  );

/** One Layer's Features and statistics for a Search Area, loaded on its own. */
export const getLayer = (
  layer: ServedLayerId,
  location: Location,
  radius: SearchRadiusMiles,
  postcode: string | null,
  signal: AbortSignal,
) =>
  getJson<LayerResponse>(
    `/api/area/${layer}?${areaQuery(location, radius, postcode)}`,
    isLayerResponse,
    signal,
  );

/** Where Land Opportunities are looked for, which of them, and in what order (PRD FR-5.1). */
export interface LandSearch {
  scope: LandScope;
  sort: LandSort;
  filters: LandFilters;
}

/** A Land Opportunity search's query: only what differs from `/api/land`'s defaults is left to them. */
const landQuery = ({ scope, sort, filters }: LandSearch) => {
  const query = new URLSearchParams({
    scope,
    sort,
    minAcres: String(filters.minAcres),
    maxRoadMetres:
      filters.maxRoadMetres === null ? "any" : String(filters.maxRoadMetres),
    maxFloodZone: String(filters.maxFloodZone),
    possiblyUnregisteredOnly: String(filters.possiblyUnregisteredOnly),
    excludeListedBuildingOutlines: String(
      filters.excludeListedBuildingOutlines,
    ),
  });
  if (filters.maxAcres !== null)
    query.set("maxAcres", String(filters.maxAcres));
  if (filters.excludeConstraints.length > 0) {
    query.set("excludeConstraints", filters.excludeConstraints.join(","));
  }
  if (filters.ownershipCategories.length > 0) {
    query.set("ownershipCategories", filters.ownershipCategories.join(","));
  }
  return query.toString();
};

/**
 * The Land Opportunities in the Search Area, or across each Land Coverage
 * Area it reaches into, that meet the filters, in the order chosen (PRD
 * FR-5.1, FR-5.5).
 */
export const getLand = (
  location: Location,
  radius: SearchRadiusMiles,
  postcode: string | null,
  search: LandSearch,
  signal: AbortSignal,
) =>
  getJson<LandLayerResponse>(
    `/api/land?${areaQuery(location, radius, postcode)}&${landQuery(search)}`,
    isLandLayerResponse,
    signal,
  );

/** One Land Parcel, with the INSPIRE Index Polygons that overlap it (PRD FR-5.6). */
export const getLandParcel = (id: string, signal: AbortSignal) =>
  getJson<LandParcelResponse>(
    `/api/land/${encodeURIComponent(id)}`,
    isLandParcelResponse,
    signal,
  );

/**
 * What `pnpm data:prepare` has prepared: the England-wide datasets and the
 * Land Coverage Areas, with their dates (PRD FR-6.5).
 */
export const getCoverage = (signal: AbortSignal) =>
  getJson<CoverageResponse>("/api/coverage", isCoverageResponse, signal);

/**
 * Whether the optional Street View panel is on, with the key Google's script
 * is loaded with if it is (PRD FR-2.13).
 */
export const getStreetView = (signal: AbortSignal) =>
  getJson<StreetViewResponse>("/api/street-view", isStreetViewResponse, signal);

/** The query that names the Scout Mode the scores and Highlights are in. */
const modeQuery = (mode: ScoutModeId) =>
  new URLSearchParams({ mode }).toString();

/** Every Scout Mode the user can pick from, with its weights (PRD FR-4.1). */
export const getModes = (signal: AbortSignal) =>
  getJson<ModesResponse>("/api/modes", isModesResponse, signal);

/**
 * The Search Area's Category Scores, and its Location Score weighed by the
 * Scout Mode. The backend scores them once every Layer they need has loaded,
 * so they arrive last.
 */
export const getScores = (
  location: Location,
  radius: SearchRadiusMiles,
  postcode: string | null,
  mode: ScoutModeId,
  signal: AbortSignal,
) =>
  getJson<ScoresResponse>(
    `/api/scores?${areaQuery(location, radius, postcode)}&${modeQuery(mode)}`,
    isScoresResponse,
    signal,
  );

/**
 * The Search Area's Highlights in the Scout Mode. Like the scores, they
 * arrive once every Layer they read has loaded.
 */
export const getHighlights = (
  location: Location,
  radius: SearchRadiusMiles,
  postcode: string | null,
  mode: ScoutModeId,
  signal: AbortSignal,
) =>
  getJson<HighlightsResponse>(
    `/api/highlights?${areaQuery(location, radius, postcode)}&${modeQuery(mode)}`,
    isHighlightsResponse,
    signal,
  );

/**
 * Whether AI Explanations are on, which they are only with
 * `ANTHROPIC_API_KEY`, and the questions they offer (PRD FR-11.1, FR-11.3).
 */
export const getExplainStatus = (signal: AbortSignal) =>
  getJson<ExplainStatusResponse>(
    "/api/explain",
    isExplainStatusResponse,
    signal,
  );

/** The events in a server-sent event stream's text so far, and what is left of it. */
const eventsIn = (text: string): { events: unknown[]; rest: string } => {
  const parts = text.split("\n\n");
  const rest = parts.pop() ?? "";
  const events = parts.flatMap((part) =>
    part
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line): unknown => JSON.parse(line.slice("data: ".length))),
  );
  return { events, rest };
};

/**
 * Asks for an AI Explanation (PRD FR-11.4), handing each part of it to
 * `onEvent` as it is written: its text, then `done` or `error`. Resolves
 * once the answer is finished, or to why none could be asked for.
 */
export const streamExplanation = async (
  request: ExplainRequest,
  signal: AbortSignal,
  onEvent: (event: ExplainEvent) => void,
): Promise<ApiResult<null>> => {
  let response: Response;
  try {
    response = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return { ok: false, message: BACKEND_DOWN };
  }
  if (!response.ok || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    signal.throwIfAborted();
    return {
      ok: false,
      message: isApiErrorResponse(body) ? body.error : BACKEND_DOWN,
    };
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const { events, rest } = eventsIn(text + value);
    text = rest;
    for (const event of events) if (isExplainEvent(event)) onEvent(event);
  }
  return { ok: true, body: null };
};
