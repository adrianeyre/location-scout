import { isFeature, type Feature } from "./feature";
import { isDate } from "./property";
import {
  isDataPeriod,
  isSourceReport,
  isSourceStatus,
  type DataPeriod,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/** The kinds of Planning Constraint the Planning Layer shows (PRD FR-2.2). */
export const PLANNING_CONSTRAINT_TYPES = [
  "conservation-area",
  "listed-building",
  "article-4-direction",
  "tree-preservation-zone",
  "flood-zone",
] as const;

export type PlanningConstraintType = (typeof PLANNING_CONSTRAINT_TYPES)[number];

export const isPlanningConstraintType = (
  value: unknown,
): value is PlanningConstraintType =>
  PLANNING_CONSTRAINT_TYPES.some((type) => type === value);

/** A position in GeoJSON order: `[lng, lat]`. */
export type Position = [number, number];

/**
 * The outline of a Planning Constraint, as a GeoJSON MultiPolygon: polygons,
 * each an outer ring followed by any holes, each ring closed.
 */
export interface ConstraintShape {
  type: "MultiPolygon";
  coordinates: Position[][][];
}

/**
 * One Planning Constraint that intersects the Search Area (PRD FR-2.2). Its
 * `location` is where the map marks it: a listed building's own point, or
 * otherwise the point of its shape nearest the Location, which is the Location
 * itself if the Location is inside it. `distanceMetres` is how far that is.
 */
export interface PlanningConstraintFeature extends Feature {
  type: PlanningConstraintType;
  /**
   * Its name, for example "Sutton in Ashfield Church and Market Place". A flood
   * zone is named by its zone: "Flood zone 3".
   */
  name: string;
  /** A listed building's grade, for example "II*", or `null`. */
  grade: string | null;
  /** Whether the Location sits inside it. */
  coversLocation: boolean;
  /** Its outline, or `null` for one known only as a point, as listed buildings are. */
  shape: ConstraintShape | null;
}

/** How many Planning Constraints of one type intersect the Search Area. */
export interface PlanningConstraintCount {
  type: PlanningConstraintType;
  count: number;
  /** Whether the Location sits inside any of them. */
  coversLocation: boolean;
}

/** A Planning Constraint the Location sits inside. */
export interface PlanningConstraintName {
  type: PlanningConstraintType;
  name: string;
}

/** The Planning Layer's statistics for the Location Overview (FR-2.2). */
export interface PlanningStatistics {
  /** Every type, in the order of `PLANNING_CONSTRAINT_TYPES`, even with none. */
  byType: PlanningConstraintCount[];
  /** The Planning Constraints the Location sits inside, by type. */
  coveringLocation: PlanningConstraintName[];
}

/**
 * Where a Planning Application has got to (PRD FR-2.2): `pending` while it
 * waits for a decision, here or from the government or another authority it
 * was referred to; `approved`, with or without conditions; `refused`;
 * `withdrawn` before a decision; or `other`, when no decision was made or
 * its status isn't known.
 */
export const PLANNING_APPLICATION_STATUSES = [
  "pending",
  "approved",
  "refused",
  "withdrawn",
  "other",
] as const;

export type PlanningApplicationStatus =
  (typeof PLANNING_APPLICATION_STATUSES)[number];

export const isPlanningApplicationStatus = (
  value: unknown,
): value is PlanningApplicationStatus =>
  PLANNING_APPLICATION_STATUSES.some((status) => status === value);

/**
 * The kind of development a Planning Application is for (PRD FR-2.2): a
 * `householder` application, to alter or extend a house; a `major` one, a
 * large scheme; or a `minor` one, anything else.
 */
export const PLANNING_APPLICATION_TYPES = [
  "householder",
  "minor",
  "major",
] as const;

export type PlanningApplicationType =
  (typeof PLANNING_APPLICATION_TYPES)[number];

export const isPlanningApplicationType = (
  value: unknown,
): value is PlanningApplicationType =>
  PLANNING_APPLICATION_TYPES.some((type) => type === value);

/** How far back the Planning Layer's Planning Applications go (PRD FR-2.2). */
export const PLANNING_APPLICATION_RULES = { years: 3 } as const;

/**
 * How the homes Planning Applications would bring are estimated (PRD
 * FR-2.2): the homes each one's description proposes, counted where it is
 * approved or pending, each bringing `residentsPerHome` residents. A
 * housing scheme of `majorHomes` or more is a major one, as planning law
 * counts them. Everything derived from them is labelled "estimated".
 */
export const ESTIMATED_HOUSING_RULES = {
  residentsPerHome: 2.4,
  statuses: ["approved", "pending"],
  majorHomes: 10,
} as const satisfies {
  residentsPerHome: number;
  statuses: readonly PlanningApplicationStatus[];
  majorHomes: number;
};

/** The residents `homes` would bring, estimated: "about N × 2.4". */
export const estimatedResidents = (homes: number) =>
  Math.round(homes * ESTIMATED_HOUSING_RULES.residentsPerHome);

/** Whether the homes of a Planning Application with `status` are counted: approved or pending. */
export const countsHomes = (status: PlanningApplicationStatus) =>
  ESTIMATED_HOUSING_RULES.statuses.some((counted) => counted === status);

/**
 * One Planning Application in the Search Area (PRD FR-2.2), at the point
 * its provider gives it. Where the council gave no point, that is the middle
 * of its postcode, and it is `approximate`.
 */
export interface PlanningApplicationFeature extends Feature {
  /** Its provider's name for it, unique across the UK: "Ashfield/V/2025/0320". */
  id: string;
  /** The council's reference for it: "V/2025/0320". */
  reference: string;
  /** The planning authority that handles it: "Ashfield". */
  authority: string;
  /** What it proposes, as the council describes it. */
  description: string;
  address: string | null;
  postcode: string | null;
  status: PlanningApplicationStatus;
  applicationType: PlanningApplicationType;
  /** The council's own name for its type: "Full Planning Application", or `null`. */
  councilType: string | null;
  /** The day it was received or validated, whichever came first, ISO 8601. */
  receivedOn: string;
  /** The day it was decided, or `null` if it hasn't been. */
  decidedOn: string | null;
  /** Whether it is placed at the middle of its postcode, the council having given no point. */
  approximate: boolean;
  /** The application on the council's own website, or `null`. */
  url: string | null;
  /** The application on its provider's website, or `null`. */
  providerUrl: string | null;
  /**
   * The new homes its description proposes, estimated (PRD FR-2.2): "erection
   * of 86 dwellings" is 86. `null` if it proposes none, or doesn't say how
   * many.
   */
  estimatedHomes: number | null;
  /**
   * Its potential impact, estimated by a fixed rule from its homes, status
   * and type: "Potential impact, estimated: 6 new homes, about 14 more
   * residents, if it is approved and built."
   */
  impact: string;
}

/** How many Planning Applications have one status. */
export interface PlanningApplicationStatusCount {
  status: PlanningApplicationStatus;
  count: number;
}

/** How many Planning Applications are of one type. */
export interface PlanningApplicationTypeCount {
  type: PlanningApplicationType;
  count: number;
}

/**
 * The homes the Planning Applications in the Search Area would bring, and
 * the residents they would bring, estimated from their descriptions (PRD
 * FR-2.2): "N homes approved or pending → about N × 2.4 extra residents".
 */
export interface EstimatedHousing {
  /** The homes approved applications propose. */
  approved: number;
  /** The homes pending applications propose. */
  pending: number;
  /** Approved and pending together. */
  homes: number;
  /** The residents they would bring: `homes` × 2.4, to the nearest whole one. */
  residents: number;
  /** How many approved or pending applications propose them. */
  applications: number;
  /**
   * How many approved or pending applications propose homes without saying
   * how many, so are not counted.
   */
  unstated: number;
}

/** The Planning Applications' statistics for the Location Overview (PRD FR-2.2). */
export interface PlanningApplicationStatistics {
  /** How many are in the Search Area, and given as Features. */
  count: number;
  /**
   * How many its provider has in the Search Area: more than `count` if it
   * gave only the newest. `null` if it gave as many as it gives at once and
   * doesn't say how many it has, so it may have more.
   */
  total: number | null;
  /** How many are placed at the middle of their postcode. */
  approximate: number;
  /** Every status, in the order of `PLANNING_APPLICATION_STATUSES`, even with none. */
  byStatus: PlanningApplicationStatusCount[];
  /** Every type, in the order of `PLANNING_APPLICATION_TYPES`, even with none. */
  byType: PlanningApplicationTypeCount[];
  /** The ids of the major applications, newest first. */
  major: string[];
  /** The homes they would bring, estimated. */
  housing: EstimatedHousing;
}

/**
 * Whether the Planning Applications could be given (PRD FR-2.2): `ok`;
 * `queued` while the request for them waits its turn, as PlanIt allows only
 * one a minute (NFR-1.5), so ask again shortly; or `unavailable`.
 */
export const PLANNING_APPLICATIONS_STATUSES = [
  "ok",
  "queued",
  "unavailable",
] as const;

export type PlanningApplicationsStatus =
  (typeof PLANNING_APPLICATIONS_STATUSES)[number];

/**
 * A Planning Applications provider (ADR 0003), as the Location Overview
 * credits it. The frontend shows whichever one the backend asked, so
 * switching provider changes nothing in it.
 */
export interface PlanningApplicationsProviderInfo {
  /** Its id: "planit" or "planwire". */
  id: string;
  /** The name to show: "PlanIt". */
  name: string;
  /** Its website, which the Location Overview credits. */
  url: string;
  /**
   * Where its Planning Applications come from, which it leaves out or
   * places approximately, and how their types are told apart.
   */
  note: string;
}

/**
 * The Planning Applications received in the Search Area in the last 3 years
 * (PRD FR-2.2), from a third-party provider (ADR 0003).
 */
export interface PlanningApplications {
  status: PlanningApplicationsStatus;
  /** The provider asked (ADR 0003). */
  provider: PlanningApplicationsProviderInfo;
  /** The years looked at, as ISO 8601 dates, up to and including the day asked. */
  period: DataPeriod;
  /** Empty unless `status` is `ok`, newest first. */
  features: PlanningApplicationFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: PlanningApplicationStatistics | null;
}

/**
 * A Planning Application near a Land Opportunity that its nearby development
 * activity points out (PRD FR-5.4): an approved or a major one.
 */
export interface NearbyPlanningApplication {
  /** Its provider's name for it, as its Feature on the map has. */
  id: string;
  reference: string;
  address: string | null;
  description: string;
  status: PlanningApplicationStatus;
  applicationType: PlanningApplicationType;
  receivedOn: string;
  /** The new homes it proposes, estimated, or `null`. */
  estimatedHomes: number | null;
  /** How far it is from the Land Opportunity, in metres: 0 if it is on it. */
  distanceMetres: number;
}

/** The Planning Applications found near a Land Opportunity. */
export interface NearbyPlanningApplicationsFound {
  /** How many there are within `withinMetres`. */
  count: number;
  /** How many of them are approved. */
  approved: number;
  /** How many of them are major. */
  major: number;
  /** The new homes the approved and pending ones propose, estimated. */
  estimatedHomes: number;
  /** The approved and the major ones, nearest first. */
  highlighted: NearbyPlanningApplication[];
}

/**
 * A Land Opportunity's nearby development activity (PRD FR-5.4): the
 * Planning Applications within 500 m of it, among those received in the
 * Search Area in the last 3 years, as its Planning Layer has them, so none
 * beyond the Search Area's edge is counted. `status` is theirs: `queued`
 * while they wait for their provider's turn, so ask again shortly.
 */
export interface NearbyPlanningApplications {
  status: PlanningApplicationsStatus;
  /** The provider's name: "PlanIt". */
  provider: string;
  /** How far from it they are counted, in metres. */
  withinMetres: number;
  /** `null` unless `status` is `ok`. */
  found: NearbyPlanningApplicationsFound | null;
}

/**
 * The body of `GET /api/area/planning`: the Planning Constraints that
 * intersect the Search Area, from planning.data.gov.uk, with their count per
 * type and whether the Location sits inside each type, and the Planning
 * Applications in it (PRD FR-2.2). `status`, `features` and `statistics`
 * are the Planning Constraints': if planning.data.gov.uk is unavailable,
 * `status` says so, and there are no Features and no statistics (NFR-1.2).
 * The Planning Applications say how they are on their own.
 */
export interface PlanningLayerResponse {
  layer: "planning";
  status: SourceStatus;
  /** The Data Sources behind the Layer that have answered, and how each did. */
  sources: SourceReport[];
  features: PlanningConstraintFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: PlanningStatistics | null;
  /**
   * The Planning Applications, or `null` where they weren't looked for, as
   * the scores don't look for them.
   */
  applications: PlanningApplications | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n));

const isRing = (value: unknown): value is Position[] =>
  Array.isArray(value) && value.length >= 4 && value.every(isPosition);

const isPolygon = (value: unknown): value is Position[][] =>
  Array.isArray(value) && value.length >= 1 && value.every(isRing);

export const isConstraintShape = (value: unknown): value is ConstraintShape =>
  isRecord(value) &&
  value.type === "MultiPolygon" &&
  Array.isArray(value.coordinates) &&
  value.coordinates.length >= 1 &&
  value.coordinates.every(isPolygon);

export const isPlanningConstraintFeature = (
  value: unknown,
): value is PlanningConstraintFeature =>
  isFeature(value) &&
  isRecord(value) &&
  isPlanningConstraintType(value.type) &&
  typeof value.name === "string" &&
  (value.grade === null || typeof value.grade === "string") &&
  typeof value.coversLocation === "boolean" &&
  (value.shape === null || isConstraintShape(value.shape));

const isPlanningConstraintCount = (
  value: unknown,
): value is PlanningConstraintCount =>
  isRecord(value) &&
  isPlanningConstraintType(value.type) &&
  typeof value.count === "number" &&
  Number.isInteger(value.count) &&
  value.count >= 0 &&
  typeof value.coversLocation === "boolean";

const isPlanningConstraintName = (
  value: unknown,
): value is PlanningConstraintName =>
  isRecord(value) &&
  isPlanningConstraintType(value.type) &&
  typeof value.name === "string";

export const isPlanningStatistics = (
  value: unknown,
): value is PlanningStatistics =>
  isRecord(value) &&
  Array.isArray(value.byType) &&
  value.byType.every(isPlanningConstraintCount) &&
  Array.isArray(value.coveringLocation) &&
  value.coveringLocation.every(isPlanningConstraintName);

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isOptionalText = (value: unknown) => value === null || isText(value);

export const isPlanningApplicationFeature = (
  value: unknown,
): value is PlanningApplicationFeature =>
  isFeature(value) &&
  isRecord(value) &&
  isText(value.reference) &&
  isText(value.authority) &&
  typeof value.description === "string" &&
  isOptionalText(value.address) &&
  isOptionalText(value.postcode) &&
  isPlanningApplicationStatus(value.status) &&
  isPlanningApplicationType(value.applicationType) &&
  isOptionalText(value.councilType) &&
  isDate(value.receivedOn) &&
  (value.decidedOn === null || isDate(value.decidedOn)) &&
  typeof value.approximate === "boolean" &&
  isOptionalText(value.url) &&
  isOptionalText(value.providerUrl) &&
  (value.estimatedHomes === null ||
    (isCount(value.estimatedHomes) && value.estimatedHomes > 0)) &&
  isText(value.impact);

const isStatusCount = (
  value: unknown,
): value is PlanningApplicationStatusCount =>
  isRecord(value) &&
  isPlanningApplicationStatus(value.status) &&
  isCount(value.count);

const isTypeCount = (value: unknown): value is PlanningApplicationTypeCount =>
  isRecord(value) &&
  isPlanningApplicationType(value.type) &&
  isCount(value.count);

export const isEstimatedHousing = (value: unknown): value is EstimatedHousing =>
  isRecord(value) &&
  isCount(value.approved) &&
  isCount(value.pending) &&
  isCount(value.homes) &&
  isCount(value.residents) &&
  isCount(value.applications) &&
  isCount(value.unstated);

export const isPlanningApplicationStatistics = (
  value: unknown,
): value is PlanningApplicationStatistics =>
  isRecord(value) &&
  isCount(value.count) &&
  (value.total === null ||
    (isCount(value.total) && value.total >= value.count)) &&
  isCount(value.approximate) &&
  value.approximate <= value.count &&
  Array.isArray(value.byStatus) &&
  value.byStatus.every(isStatusCount) &&
  Array.isArray(value.byType) &&
  value.byType.every(isTypeCount) &&
  Array.isArray(value.major) &&
  value.major.every(isText) &&
  isEstimatedHousing(value.housing);

export const isPlanningApplicationsStatus = (
  value: unknown,
): value is PlanningApplicationsStatus =>
  PLANNING_APPLICATIONS_STATUSES.some((status) => status === value);

export const isPlanningApplications = (
  value: unknown,
): value is PlanningApplications =>
  isRecord(value) &&
  isPlanningApplicationsStatus(value.status) &&
  isRecord(value.provider) &&
  isText(value.provider.id) &&
  isText(value.provider.name) &&
  isText(value.provider.url) &&
  isText(value.provider.note) &&
  isDataPeriod(value.period) &&
  Array.isArray(value.features) &&
  value.features.every(isPlanningApplicationFeature) &&
  (value.statistics === null ||
    isPlanningApplicationStatistics(value.statistics));

const isNearbyPlanningApplication = (
  value: unknown,
): value is NearbyPlanningApplication =>
  isRecord(value) &&
  isText(value.id) &&
  isText(value.reference) &&
  isOptionalText(value.address) &&
  typeof value.description === "string" &&
  isPlanningApplicationStatus(value.status) &&
  isPlanningApplicationType(value.applicationType) &&
  isDate(value.receivedOn) &&
  (value.estimatedHomes === null || isCount(value.estimatedHomes)) &&
  typeof value.distanceMetres === "number" &&
  Number.isFinite(value.distanceMetres) &&
  value.distanceMetres >= 0;

const isNearbyPlanningApplicationsFound = (
  value: unknown,
): value is NearbyPlanningApplicationsFound =>
  isRecord(value) &&
  isCount(value.count) &&
  isCount(value.approved) &&
  isCount(value.major) &&
  isCount(value.estimatedHomes) &&
  Array.isArray(value.highlighted) &&
  value.highlighted.every(isNearbyPlanningApplication);

export const isNearbyPlanningApplications = (
  value: unknown,
): value is NearbyPlanningApplications =>
  isRecord(value) &&
  isPlanningApplicationsStatus(value.status) &&
  isText(value.provider) &&
  isCount(value.withinMetres) &&
  (value.found === null || isNearbyPlanningApplicationsFound(value.found));

export const isPlanningLayerResponse = (
  value: unknown,
): value is PlanningLayerResponse =>
  isRecord(value) &&
  value.layer === "planning" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  Array.isArray(value.features) &&
  value.features.every(isPlanningConstraintFeature) &&
  (value.statistics === null || isPlanningStatistics(value.statistics)) &&
  (value.applications === null || isPlanningApplications(value.applications));
