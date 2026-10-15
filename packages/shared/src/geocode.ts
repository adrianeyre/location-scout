import { isLocation, type Location } from "./search-area";

/**
 * How a search was matched (PRD FR-1.1, FR-1.2): as a postcode with
 * postcodes.io, or as a free-text address with Nominatim.
 */
export const GEOCODE_MATCH_KINDS = ["postcode", "address"] as const;

export type GeocodeMatchKind = (typeof GEOCODE_MATCH_KINDS)[number];

/** One Location that what the user typed may mean. */
export interface GeocodeCandidate {
  kind: GeocodeMatchKind;
  /**
   * How to name it to the user: the postcode as postcodes.io formats it, for
   * example "NG17 1AA", or the address as Nominatim gives it.
   */
  label: string;
  location: Location;
}

/**
 * The body of `GET /api/geocode?q=`: what the user typed and the Locations it
 * may mean, best first. There is always at least one. A postcode has exactly
 * one; an address may have several, for the user to pick from (FR-1.2).
 */
export interface GeocodeResponse {
  query: string;
  candidates: GeocodeCandidate[];
}

const isGeocodeMatchKind = (value: unknown): value is GeocodeMatchKind =>
  GEOCODE_MATCH_KINDS.some((kind) => kind === value);

export const isGeocodeCandidate = (value: unknown): value is GeocodeCandidate =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  isGeocodeMatchKind(value.kind) &&
  "label" in value &&
  typeof value.label === "string" &&
  "location" in value &&
  isLocation(value.location);

export const isGeocodeResponse = (value: unknown): value is GeocodeResponse =>
  typeof value === "object" &&
  value !== null &&
  "query" in value &&
  typeof value.query === "string" &&
  "candidates" in value &&
  Array.isArray(value.candidates) &&
  value.candidates.length > 0 &&
  value.candidates.every(isGeocodeCandidate);
