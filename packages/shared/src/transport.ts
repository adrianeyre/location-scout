import { isFeature, type Feature } from "./feature";
import type { Position } from "./planning";
import {
  isSourceReport,
  isSourceStatus,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/** The kinds of facility the Transport Layer shows, each at a point (PRD FR-2.4). */
export const TRANSPORT_FACILITY_TYPES = [
  "railway-station",
  "bus-stop",
  "car-park",
  "ev-charger",
] as const;

/** The kinds of route the Transport Layer shows, each drawn as lines (FR-2.4). */
export const TRANSPORT_ROUTE_TYPES = ["footpath", "cycle-route"] as const;

/** Every kind of Feature the Transport Layer shows (PRD FR-2.4). */
export const TRANSPORT_TYPES = [
  ...TRANSPORT_FACILITY_TYPES,
  ...TRANSPORT_ROUTE_TYPES,
] as const;

export type TransportFacilityType = (typeof TRANSPORT_FACILITY_TYPES)[number];
export type TransportRouteType = (typeof TRANSPORT_ROUTE_TYPES)[number];
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const isTransportFacilityType = (
  value: unknown,
): value is TransportFacilityType =>
  TRANSPORT_FACILITY_TYPES.some((type) => type === value);

export const isTransportRouteType = (
  value: unknown,
): value is TransportRouteType =>
  TRANSPORT_ROUTE_TYPES.some((type) => type === value);

export const isTransportType = (value: unknown): value is TransportType =>
  TRANSPORT_TYPES.some((type) => type === value);

/**
 * Routes inside the Search Area, as a GeoJSON MultiLineString: lines, each at
 * least two positions.
 */
export interface RouteShape {
  type: "MultiLineString";
  coordinates: Position[][];
}

/**
 * A railway station, bus stop, car park or EV charger in the Search Area (PRD
 * FR-2.4): one OpenStreetMap element, placed at its point or, if it is mapped
 * as an outline, its middle.
 */
export interface TransportFacilityFeature extends Feature {
  type: TransportFacilityType;
  /** Its name in OpenStreetMap, for example "Portland Square", or `null` if it has none. */
  name: string | null;
  /** The OpenStreetMap tag that made it this type, for example `highway=bus_stop`. */
  osmTag: string;
  shape: null;
  lengthMetres: null;
}

/**
 * All the footpaths, or all the cycle routes, in the Search Area (PRD
 * FR-2.4). OpenStreetMap maps them as many short ways, so all of each type
 * are joined into one Feature, cut off at the Search Area's edge. Its
 * `location` is the point of its lines nearest the Location, and
 * `distanceMetres` how far that is.
 */
export interface TransportRouteFeature extends Feature {
  type: TransportRouteType;
  name: null;
  osmTag: null;
  /** Its lines inside the Search Area. */
  shape: RouteShape;
  /** How long its lines inside the Search Area are, end to end. */
  lengthMetres: number;
}

/** One Feature of the Transport Layer: a facility, or footpaths or cycle routes. */
export type TransportFeature = TransportFacilityFeature | TransportRouteFeature;

/** How many facilities of one type are in the Search Area. */
export interface TransportFacilityCount {
  type: TransportFacilityType;
  count: number;
}

/** How long the routes of one type inside the Search Area are, end to end. */
export interface TransportRouteLength {
  type: TransportRouteType;
  lengthMetres: number;
}

/** The railway station nearest the Location, which may be outside the Search Area. */
export interface NearestStation {
  id: string;
  name: string | null;
  distanceMetres: number;
  /** Whether it is inside the Search Area, and so a Feature of the Layer. */
  inSearchArea: boolean;
}

/** The Transport Layer's statistics for the Location Overview (FR-2.4). */
export interface TransportStatistics {
  /** Every type of facility, in the order of `TRANSPORT_FACILITY_TYPES`, even with none. */
  facilities: TransportFacilityCount[];
  /** Every type of route, in the order of `TRANSPORT_ROUTE_TYPES`, even with none. */
  routes: TransportRouteLength[];
  /** The nearest railway station within `stationSearchMetres`, or `null` if there is none that close. */
  nearestStation: NearestStation | null;
  /** How far from the Location the nearest railway station is looked for. */
  stationSearchMetres: number;
}

/**
 * The body of `GET /api/area/transport`: the railway stations, bus stops, car
 * parks, EV chargers, footpaths and cycle routes in the Search Area, from
 * OpenStreetMap through the Overpass API, with their counts, the distance to
 * the nearest railway station and the length of footpath and cycle route
 * (PRD FR-2.4). If Overpass is unavailable, `status` says so, and there are
 * no Features and no statistics (NFR-1.2).
 */
export interface TransportLayerResponse {
  layer: "transport";
  status: SourceStatus;
  /** The Data Sources behind the Layer, and how each answered. */
  sources: SourceReport[];
  features: TransportFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: TransportStatistics | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isMetres = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isName = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n));

const isLine = (value: unknown): value is Position[] =>
  Array.isArray(value) && value.length >= 2 && value.every(isPosition);

export const isRouteShape = (value: unknown): value is RouteShape =>
  isRecord(value) &&
  value.type === "MultiLineString" &&
  Array.isArray(value.coordinates) &&
  value.coordinates.length >= 1 &&
  value.coordinates.every(isLine);

export const isTransportFacilityFeature = (
  value: unknown,
): value is TransportFacilityFeature =>
  isFeature(value) &&
  isRecord(value) &&
  isTransportFacilityType(value.type) &&
  isName(value.name) &&
  typeof value.osmTag === "string" &&
  value.shape === null &&
  value.lengthMetres === null;

export const isTransportRouteFeature = (
  value: unknown,
): value is TransportRouteFeature =>
  isFeature(value) &&
  isRecord(value) &&
  isTransportRouteType(value.type) &&
  value.name === null &&
  value.osmTag === null &&
  isRouteShape(value.shape) &&
  isMetres(value.lengthMetres);

export const isTransportFeature = (value: unknown): value is TransportFeature =>
  isTransportFacilityFeature(value) || isTransportRouteFeature(value);

const isTransportFacilityCount = (
  value: unknown,
): value is TransportFacilityCount =>
  isRecord(value) &&
  isTransportFacilityType(value.type) &&
  isCount(value.count);

const isTransportRouteLength = (
  value: unknown,
): value is TransportRouteLength =>
  isRecord(value) &&
  isTransportRouteType(value.type) &&
  isMetres(value.lengthMetres);

const isNearestStation = (value: unknown): value is NearestStation =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isName(value.name) &&
  isMetres(value.distanceMetres) &&
  typeof value.inSearchArea === "boolean";

export const isTransportStatistics = (
  value: unknown,
): value is TransportStatistics =>
  isRecord(value) &&
  Array.isArray(value.facilities) &&
  value.facilities.every(isTransportFacilityCount) &&
  Array.isArray(value.routes) &&
  value.routes.every(isTransportRouteLength) &&
  (value.nearestStation === null || isNearestStation(value.nearestStation)) &&
  isMetres(value.stationSearchMetres);

export const isTransportLayerResponse = (
  value: unknown,
): value is TransportLayerResponse =>
  isRecord(value) &&
  value.layer === "transport" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  Array.isArray(value.features) &&
  value.features.every(isTransportFeature) &&
  (value.statistics === null || isTransportStatistics(value.statistics));
