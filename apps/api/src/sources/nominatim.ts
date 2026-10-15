import type { GeocodeCandidate } from "@location-scout/shared";

import {
  DAY_MS,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import { createRateLimiter, type RateLimiter } from "./rate-limiter";

/** Nominatim (OSMF public): address search (PRD §6.17). Free, no key. */
export const nominatim: DataSource = {
  id: "nominatim",
  name: "Nominatim",
  // Geocoding is cached for 7 days (PRD NFR-1.4).
  cacheTtlMs: 7 * DAY_MS,
};

const SEARCH_URL = "https://nominatim.openstreetmap.org/search";

/** The most candidates offered for one address. */
export const MAX_CANDIDATES = 5;

/** Nominatim's usage policy allows at most one request a second (NFR-1.5). */
export const NOMINATIM_INTERVAL_MS = 1000;

/**
 * The one limiter for every Nominatim request this process makes, however many
 * apps it creates, so the limit holds across the whole process.
 */
export const NOMINATIM_LIMITER = createRateLimiter(NOMINATIM_INTERVAL_MS);

export class NominatimError extends Error {
  override name = "NominatimError";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Every result is in Great Britain, so the country adds nothing. */
const withoutCountry = (displayName: string) =>
  displayName.replace(/,\s*United Kingdom$/, "");

const toCandidate = (place: unknown): GeocodeCandidate | null => {
  if (!isRecord(place)) return null;
  const { display_name: label, lat, lon } = place;
  if (typeof label !== "string" || typeof lat !== "string") return null;
  if (typeof lon !== "string") return null;
  const location = { lat: Number(lat), lng: Number(lon) };
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return null;
  }
  return { kind: "address", label: withoutCountry(label), location };
};

/**
 * Maps a raw Nominatim `GET /search?format=jsonv2` response to the candidates
 * it offers, best first. No match is an empty list.
 */
export const mapSearchResponse = (
  status: number,
  body: unknown,
): GeocodeCandidate[] => {
  if (status !== 200 || !Array.isArray(body)) {
    throw new NominatimError(
      `Nominatim answered ${String(status)} without a list of places`,
    );
  }
  return body
    .map(toCandidate)
    .filter((candidate) => candidate !== null)
    .slice(0, MAX_CANDIDATES);
};

/** One spelling per search, so the cache and Nominatim see one request. */
export const normaliseAddressQuery = (query: string) =>
  query.trim().replace(/\s+/g, " ").toLowerCase();

/** The Nominatim search for an address, limited to Great Britain (FR-1.2). */
export const searchUrl = (query: string) =>
  `${SEARCH_URL}?${new URLSearchParams({
    q: normaliseAddressQuery(query),
    format: "jsonv2",
    countrycodes: "gb",
    limit: String(MAX_CANDIDATES),
  }).toString()}`;

export interface NominatimOptions {
  /** Identifies the app and a contact, as Nominatim's usage policy requires. */
  userAgent: string;
  limiter: RateLimiter;
}

/**
 * Searches Nominatim for a free-text address. A repeated search within 7 days
 * is answered from the cache without waiting for a turn; a new one waits for
 * its turn under the 1 request a second limit, inside the 8-second timeout.
 */
export const searchAddress = (
  query: string,
  callSource: CallSource,
  { userAgent, limiter }: NominatimOptions,
): Promise<SourceResult<GeocodeCandidate[]>> => {
  const url = searchUrl(query);
  return callSource(nominatim, url, async ({ fetch, signal }) => {
    await limiter.wait(signal);
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "accept-language": "en-GB",
        "user-agent": userAgent,
      },
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    // Addresses are current, not a period of records.
    return { data: mapSearchResponse(response.status, body), period: null };
  });
};
