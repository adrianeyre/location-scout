import { isFeature, type Feature } from "./feature";
import {
  isSourceReport,
  isSourceStatus,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/**
 * The kinds of amenity the Amenities Layer shows (PRD FR-2.3). Each Feature
 * has exactly one: a café that also sells cakes to take away is a café, and
 * `shop` holds every shop that isn't a convenience store, supermarket or
 * hairdresser.
 */
export const AMENITY_TYPES = [
  "shop",
  "convenience-store",
  "cafe",
  "restaurant",
  "takeaway",
  "pub",
  "supermarket",
  "gym",
  "hairdresser",
  "dentist",
  "nursery",
  "healthcare",
  "office",
] as const;

export type AmenityType = (typeof AMENITY_TYPES)[number];

export const isAmenityType = (value: unknown): value is AmenityType =>
  AMENITY_TYPES.some((type) => type === value);

/**
 * One amenity mapped in OpenStreetMap inside the Search Area (PRD FR-2.3). One
 * mapped as an outline, such as a supermarket's building, is placed at its middle.
 */
export interface AmenityFeature extends Feature {
  type: AmenityType;
  /** Its name in OpenStreetMap, for example "Costa", or `null` if it has none. */
  name: string | null;
  /** The OpenStreetMap tag that made it this type, for example `shop=bakery`. */
  osmTag: string;
}

/** The amenity of one type nearest the Location. */
export interface NearestAmenity {
  id: string;
  name: string | null;
  distanceMetres: number;
}

/** How many amenities of one type are in the Search Area, and the nearest. */
export interface AmenityCount {
  type: AmenityType;
  count: number;
  /** `null` if there are none. */
  nearest: NearestAmenity | null;
}

/** The Amenities Layer's statistics for the Location Overview (FR-2.3). */
export interface AmenityStatistics {
  /** Amenities of every type together. */
  total: number;
  /** Every type, in the order of `AMENITY_TYPES`, even with none. */
  byType: AmenityCount[];
}

/**
 * The body of `GET /api/area/amenities`: the amenities in the Search Area,
 * from OpenStreetMap through the Overpass API, with their count and the
 * nearest of each type (PRD FR-2.3). If Overpass is unavailable, `status` says
 * so, and there are no Features and no statistics (NFR-1.2).
 */
export interface AmenitiesLayerResponse {
  layer: "amenities";
  status: SourceStatus;
  /** The Data Sources behind the Layer, and how each answered. */
  sources: SourceReport[];
  features: AmenityFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: AmenityStatistics | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isName = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

export const isAmenityFeature = (value: unknown): value is AmenityFeature =>
  isFeature(value) &&
  isRecord(value) &&
  isAmenityType(value.type) &&
  isName(value.name) &&
  typeof value.osmTag === "string";

const isNearestAmenity = (value: unknown): value is NearestAmenity =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isName(value.name) &&
  typeof value.distanceMetres === "number" &&
  Number.isFinite(value.distanceMetres) &&
  value.distanceMetres >= 0;

const isAmenityCount = (value: unknown): value is AmenityCount =>
  isRecord(value) &&
  isAmenityType(value.type) &&
  isCount(value.count) &&
  (value.nearest === null || isNearestAmenity(value.nearest));

export const isAmenityStatistics = (
  value: unknown,
): value is AmenityStatistics =>
  isRecord(value) &&
  isCount(value.total) &&
  Array.isArray(value.byType) &&
  value.byType.every(isAmenityCount);

export const isAmenitiesLayerResponse = (
  value: unknown,
): value is AmenitiesLayerResponse =>
  isRecord(value) &&
  value.layer === "amenities" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  Array.isArray(value.features) &&
  value.features.every(isAmenityFeature) &&
  (value.statistics === null || isAmenityStatistics(value.statistics));
