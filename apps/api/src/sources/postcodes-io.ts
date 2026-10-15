import {
  distanceMetres,
  type LocalGeography,
  type Location,
  type SearchArea,
} from "@location-scout/shared";

import {
  DAY_MS,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";

/** postcodes.io: postcode lookup (PRD §6.17). Free, no key. */
export const postcodesIo: DataSource = {
  id: "postcodes-io",
  name: "postcodes.io",
  // Geocoding is cached for 7 days (PRD NFR-1.4).
  cacheTtlMs: 7 * DAY_MS,
};

const BASE_URL = "https://api.postcodes.io";

/**
 * What postcodes.io records about a postcode: the country it is in (PRD
 * FR-1.5) and the local geography it names (FR-1.8).
 */
export interface PostcodeRecord {
  postcode: string;
  country: string;
  geography: LocalGeography;
}

export type PostcodeLookup =
  | ({ kind: "found"; location: Location } & PostcodeRecord)
  | { kind: "not-found" };

/**
 * The postcode nearest a Location, or `none-nearby` when there is no postcode
 * within `NEAREST_POSTCODE_RADIUS_METRES`: out at sea, or outside the UK.
 */
export type NearestPostcode =
  ({ kind: "found" } & PostcodeRecord) | { kind: "none-nearby" };

/** The furthest postcodes.io looks for a nearby postcode: the most it allows. */
export const NEAREST_POSTCODE_RADIUS_METRES = 2000;

export class PostcodesIoError extends Error {
  override name = "PostcodesIoError";
}

/**
 * How far a searched postcode may be from the Location and still be the
 * postcode there. Both carry postcodes.io's six decimal places, so they match.
 */
const AT_LOCATION_METRES = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** A name postcodes.io gives, or `null` where it gives none. */
const nameOf = (value: unknown) => (typeof value === "string" ? value : null);

/** Reads one postcode's record from a postcodes.io result. */
const mapPostcodeRecord = (result: Record<string, unknown>): PostcodeRecord => {
  const { postcode, country } = result;
  if (typeof postcode !== "string" || typeof country !== "string") {
    throw new PostcodesIoError(
      "postcodes.io result has no postcode or country",
    );
  }
  return {
    postcode,
    country,
    geography: {
      postcode,
      ward: nameOf(result.admin_ward),
      lsoa: nameOf(result.lsoa),
      msoa: nameOf(result.msoa),
      localAuthority: nameOf(result.admin_district),
      parliamentaryConstituency: nameOf(result.parliamentary_constituency),
    },
  };
};

/** Maps a raw postcodes.io `GET /postcodes/{postcode}` response. */
export const mapPostcodeResponse = (
  status: number,
  body: unknown,
): PostcodeLookup => {
  if (status === 404) return { kind: "not-found" };
  if (status !== 200 || !isRecord(body) || !isRecord(body.result)) {
    throw new PostcodesIoError(
      `postcodes.io answered ${String(status)} without a result`,
    );
  }
  const record = mapPostcodeRecord(body.result);
  const { latitude, longitude } = body.result;
  // A few real postcodes (for example some PO boxes) have no grid reference,
  // so there is no Location to show.
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { kind: "not-found" };
  }
  return {
    kind: "found",
    location: { lat: latitude, lng: longitude },
    ...record,
  };
};

/**
 * Maps a raw postcodes.io reverse lookup, `GET /postcodes?lon=&lat=&limit=1`,
 * whose results come nearest first.
 */
export const mapNearestResponse = (
  status: number,
  body: unknown,
): NearestPostcode => {
  if (status !== 200 || !isRecord(body) || !("result" in body)) {
    throw new PostcodesIoError(
      `postcodes.io answered ${String(status)} without a result`,
    );
  }
  // postcodes.io answers `null` rather than an empty list when none are near.
  if (body.result === null) return { kind: "none-nearby" };
  const results: unknown = body.result;
  if (!Array.isArray(results)) {
    throw new PostcodesIoError("postcodes.io result is not a list");
  }
  const nearest: unknown = results[0];
  if (nearest === undefined) return { kind: "none-nearby" };
  if (!isRecord(nearest)) {
    throw new PostcodesIoError("postcodes.io result is not a postcode");
  }
  return { kind: "found", ...mapPostcodeRecord(nearest) };
};

export const lookupPostcode = (
  postcode: string,
  callSource: CallSource,
): Promise<SourceResult<PostcodeLookup>> => {
  const url = `${BASE_URL}/postcodes/${encodeURIComponent(postcode)}`;
  return callSource(postcodesIo, url, async ({ fetch, signal }) => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    // Postcode data is current, not a period of records.
    return { data: mapPostcodeResponse(response.status, body), period: null };
  });
};

/** Finds the postcode nearest a Location, to learn its country and local geography. */
export const nearestPostcode = (
  { lat, lng }: Location,
  callSource: CallSource,
): Promise<SourceResult<NearestPostcode>> => {
  const url = `${BASE_URL}/postcodes?${new URLSearchParams({
    lon: String(lng),
    lat: String(lat),
    radius: String(NEAREST_POSTCODE_RADIUS_METRES),
    limit: "1",
  }).toString()}`;
  return callSource(postcodesIo, url, async ({ fetch, signal }) => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return { data: mapNearestResponse(response.status, body), period: null };
  });
};

/**
 * The postcode that describes a Location. Several postcodes can share one
 * point, so a postcode the user searched for is preferred if it is at the
 * Location (PRD FR-1.8). Otherwise, for a map click, an address or a shared
 * URL, it is the postcode nearest the Location. A searched postcode's lookup
 * is usually still cached from the search, so it costs no call.
 */
export const postcodeAt = async (
  location: Location,
  searched: string | null,
  callSource: CallSource,
): Promise<SourceResult<NearestPostcode>> => {
  if (searched !== null) {
    const lookup = await lookupPostcode(searched, callSource);
    if (
      lookup.status === "ok" &&
      lookup.data.kind === "found" &&
      distanceMetres(lookup.data.location, location) <= AT_LOCATION_METRES
    ) {
      const { postcode, country, geography } = lookup.data;
      return {
        ...lookup,
        data: { kind: "found", postcode, country, geography },
      };
    }
  }
  return nearestPostcode(location, callSource);
};

/** The most postcodes postcodes.io gives for one point (PRD §6.17). */
export const POSTCODES_LIMIT = 100;

/** A postcode inside a Search Area, at its middle. */
export interface PostcodeInSearchArea {
  postcode: string;
  location: Location;
  /** How far its middle is from the Location, in metres. */
  distanceMetres: number;
}

/**
 * The postcodes inside a Search Area, nearest first. postcodes.io gives at
 * most `POSTCODES_LIMIT`, so if it gave that many, the Search Area may have
 * more, further out (PRD FR-2.8).
 */
export interface PostcodesInSearchArea {
  postcodes: PostcodeInSearchArea[];
  truncated: boolean;
}

/** postcodes.io's reverse lookup of every postcode whose middle is in the Search Area. */
export const postcodesInSearchAreaUrl = ({
  location,
  searchRadius,
}: SearchArea) =>
  `${BASE_URL}/postcodes?${new URLSearchParams({
    lon: String(location.lng),
    lat: String(location.lat),
    radius: String(Math.round(searchRadius.metres)),
    limit: String(POSTCODES_LIMIT),
  }).toString()}`;

/**
 * Maps a raw postcodes.io reverse lookup of a Search Area, nearest first, to
 * its postcodes and how far each is from the Location. A postcode without a
 * point, which postcodes.io should never give here, is left out.
 */
export const mapPostcodesInSearchArea = (
  status: number,
  body: unknown,
  from: Location,
): PostcodesInSearchArea => {
  if (status !== 200 || !isRecord(body) || !("result" in body)) {
    throw new PostcodesIoError(
      `postcodes.io answered ${String(status)} without a result`,
    );
  }
  // postcodes.io answers `null` rather than an empty list when none are near.
  const results: unknown = body.result ?? [];
  if (!Array.isArray(results)) {
    throw new PostcodesIoError("postcodes.io result is not a list");
  }
  const postcodes = results.flatMap((result: unknown) => {
    if (!isRecord(result)) return [];
    const { postcode, latitude, longitude } = result;
    if (
      typeof postcode !== "string" ||
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return [];
    }
    const location = { lat: latitude, lng: longitude };
    return [
      {
        postcode,
        location,
        distanceMetres: Math.round(distanceMetres(from, location)),
      },
    ];
  });
  return { postcodes, truncated: results.length >= POSTCODES_LIMIT };
};

/** Finds the postcodes inside a Search Area, nearest first, up to `POSTCODES_LIMIT`. */
export const postcodesInSearchArea = (
  area: SearchArea,
  callSource: CallSource,
): Promise<SourceResult<PostcodesInSearchArea>> => {
  const url = postcodesInSearchAreaUrl(area);
  return callSource(postcodesIo, url, async ({ fetch, signal }) => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return {
      data: mapPostcodesInSearchArea(response.status, body, area.location),
      period: null,
    };
  });
};
