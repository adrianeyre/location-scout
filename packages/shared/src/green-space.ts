import { isFeature, type Feature } from "./feature";
import { isConstraintShape, type ConstraintShape } from "./planning";
import {
  isSourceReport,
  isSourceStatus,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/** The kinds of green space the Green space Layer shows (PRD FR-2.5). */
export const GREEN_SPACE_TYPES = [
  "park",
  "playground",
  "nature-reserve",
  "wood",
] as const;

export type GreenSpaceType = (typeof GREEN_SPACE_TYPES)[number];

export const isGreenSpaceType = (value: unknown): value is GreenSpaceType =>
  GREEN_SPACE_TYPES.some((type) => type === value);

/**
 * One park, playground, nature reserve or wood that OpenStreetMap maps in the
 * Search Area (PRD FR-2.5). Its `location` is where the map marks it: the
 * point of its outline nearest the Location, which is the Location itself if
 * the Location is inside it, or its own point if OpenStreetMap maps it only
 * as a point. `distanceMetres` is how far that is.
 */
export interface GreenSpaceFeature extends Feature {
  type: GreenSpaceType;
  /** Its name in OpenStreetMap, for example "Sutton Lawn", or `null` if it has none. */
  name: string | null;
  /** The OpenStreetMap tag that made it this type, for example `leisure=park`. */
  osmTag: string;
  /** Whether the Location sits inside it. */
  coversLocation: boolean;
  /**
   * Its outline, the same GeoJSON MultiPolygon as a Planning Constraint's, or
   * `null` for one OpenStreetMap maps only as a point.
   */
  shape: ConstraintShape | null;
}

/** How many green spaces of one type are in the Search Area. */
export interface GreenSpaceCount {
  type: GreenSpaceType;
  count: number;
}

/** The park nearest the Location, which may be outside the Search Area. */
export interface NearestPark {
  id: string;
  name: string | null;
  /** How far the nearest point of it is: 0 if the Location is inside it. */
  distanceMetres: number;
  /** Whether it is inside the Search Area, and so a Feature of the Layer. */
  inSearchArea: boolean;
  /** Whether the Location sits inside it. */
  coversLocation: boolean;
}

/** The Green space Layer's statistics for the Location Overview (FR-2.5). */
export interface GreenSpaceStatistics {
  /** Green spaces of every type together. */
  total: number;
  /** Every type, in the order of `GREEN_SPACE_TYPES`, even with none. */
  byType: GreenSpaceCount[];
  /** The nearest park within `parkSearchMetres`, or `null` if there is none that close. */
  nearestPark: NearestPark | null;
  /** How far from the Location the nearest park is looked for. */
  parkSearchMetres: number;
}

/**
 * The body of `GET /api/area/green-space`: the parks, playgrounds, nature
 * reserves and woods in the Search Area, from OpenStreetMap through the
 * Overpass API, with their count and the distance to the nearest park (PRD
 * FR-2.5). If Overpass is unavailable, `status` says so, and there are no
 * Features and no statistics (NFR-1.2).
 */
export interface GreenSpaceLayerResponse {
  layer: "green-space";
  status: SourceStatus;
  /** The Data Sources behind the Layer, and how each answered. */
  sources: SourceReport[];
  features: GreenSpaceFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: GreenSpaceStatistics | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isMetres = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isName = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

export const isGreenSpaceFeature = (
  value: unknown,
): value is GreenSpaceFeature =>
  isFeature(value) &&
  isRecord(value) &&
  isGreenSpaceType(value.type) &&
  isName(value.name) &&
  typeof value.osmTag === "string" &&
  typeof value.coversLocation === "boolean" &&
  (value.shape === null || isConstraintShape(value.shape));

const isGreenSpaceCount = (value: unknown): value is GreenSpaceCount =>
  isRecord(value) && isGreenSpaceType(value.type) && isCount(value.count);

const isNearestPark = (value: unknown): value is NearestPark =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isName(value.name) &&
  isMetres(value.distanceMetres) &&
  typeof value.inSearchArea === "boolean" &&
  typeof value.coversLocation === "boolean";

export const isGreenSpaceStatistics = (
  value: unknown,
): value is GreenSpaceStatistics =>
  isRecord(value) &&
  isCount(value.total) &&
  Array.isArray(value.byType) &&
  value.byType.every(isGreenSpaceCount) &&
  (value.nearestPark === null || isNearestPark(value.nearestPark)) &&
  isMetres(value.parkSearchMetres);

export const isGreenSpaceLayerResponse = (
  value: unknown,
): value is GreenSpaceLayerResponse =>
  isRecord(value) &&
  value.layer === "green-space" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  Array.isArray(value.features) &&
  value.features.every(isGreenSpaceFeature) &&
  (value.statistics === null || isGreenSpaceStatistics(value.statistics));
