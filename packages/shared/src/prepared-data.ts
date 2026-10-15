import { isSourceStatus, type SourceStatus } from "./source-status";

/**
 * Data that has no live API is prepared once by `pnpm data:prepare` into
 * GeoParquet files in the git-ignored `data/` folder, which the backend
 * queries with DuckDB (PRD §6.7, ADR 0004). These are the manifest it writes
 * beside them, and what the backend says about them.
 */

/** A council: a local authority district, London borough or unitary authority. */
export interface Council {
  /** Its ONS code, for example `E07000170`. */
  code: string;
  /** Its name, for example `Ashfield`. */
  name: string;
}

/** The England-wide dataset of every English council's boundary. */
export const COUNCIL_BOUNDARIES_DATASET = "council-boundaries";

/** A Land Coverage Area's dataset of its own council boundary. */
export const COUNCIL_BOUNDARY_DATASET = "council-boundary";

/**
 * The England-wide dataset of every output area's boundary, with the LSOA and
 * MSOA it is in, for the Demographics Layer (PRD FR-6.0).
 */
export const OUTPUT_AREA_BOUNDARIES_DATASET = "output-area-boundaries";

/** The England-wide dataset of Census 2021's population, age and households by output area. */
export const CENSUS_2021_DATASET = "census-2021";

/** The England-wide dataset of ONS's household income estimates by MSOA. */
export const INCOME_ESTIMATES_DATASET = "income-estimates";

/** The England-wide dataset of the English Indices of Deprivation by LSOA. */
export const INDICES_OF_DEPRIVATION_DATASET = "indices-of-deprivation";

/**
 * The England-wide dataset of every open school in England, from the Get
 * Information about Schools register, for the Schools Layer (PRD FR-6.0).
 */
export const SCHOOLS_DATASET = "schools";

/** The England-wide dataset of state-funded schools' latest Ofsted inspections. */
export const OFSTED_INSPECTIONS_DATASET = "ofsted-inspections";

/**
 * The England-wide datasets of HM Land Registry's titles held by UK
 * companies (CCOD) and by overseas companies (OCOD), which the indicative
 * Ownership Categories come from (PRD FR-5.4a, FR-6.0).
 */
export const CCOD_DATASET = "ccod";
export const OCOD_DATASET = "ocod";

/**
 * A Land Coverage Area's dataset of HM Land Registry's INSPIRE Index
 * Polygons: the outlines of its registered freehold titles (PRD FR-6.1).
 */
export const INSPIRE_INDEX_POLYGONS_DATASET = "inspire-index-polygons";

/**
 * A Land Coverage Area's datasets from OpenStreetMap, clipped to its
 * boundary from Geofabrik's extract (PRD FR-6.1): land use, buildings, roads
 * and water.
 */
export const OSM_LAND_USE_DATASET = "osm-land-use";
export const OSM_BUILDINGS_DATASET = "osm-buildings";
export const OSM_ROADS_DATASET = "osm-roads";
export const OSM_WATER_DATASET = "osm-water";

/**
 * A Land Coverage Area's datasets of Planning Constraints, clipped to its
 * boundary from planning.data.gov.uk's bulk files (PRD FR-6.1). Each is named
 * as planning.data.gov.uk names it.
 */
export const PLANNING_CONSTRAINT_DATASETS = [
  "conservation-area",
  "listed-building",
  "listed-building-outline",
  "article-4-direction-area",
  "tree-preservation-zone",
  "flood-risk-zone",
] as const;

export type PlanningConstraintDataset =
  (typeof PLANNING_CONSTRAINT_DATASETS)[number];

/**
 * A Land Coverage Area's Land Parcels, which `pnpm data:prepare` builds from
 * its OpenStreetMap land use and tags from its INSPIRE Index Polygons and
 * Planning Constraints (PRD FR-5.2, FR-5.4, FR-6.2).
 */
export const LAND_PARCELS_DATASET = "land-parcels";

/**
 * A Land Coverage Area's postcodes: the middle of every postcode within a
 * mile of it, from Ordnance Survey's Code-Point Open, where the Price Paid
 * sales near its Land Opportunities are placed (PRD FR-5.4b).
 */
export const POSTCODES_DATASET = "postcodes";

/**
 * The statements a dataset's licence requires wherever it is used, and a
 * link to its conditions, as INSPIRE Index Polygons' does (PRD FR-10.2).
 */
export interface DatasetAttribution {
  /** Each statement, in full, with the year filled in. */
  statements: string[];
  /** Where its conditions are. */
  conditionsUrl: string;
}

/** One dataset `pnpm data:prepare` has prepared, and its dates (PRD FR-6.2, FR-6.5). */
export interface PreparedDataset {
  /** A stable identifier, for example `council-boundaries`. */
  id: string;
  /** The name to show, for example `Council boundaries`. */
  name: string;
  /** Who publishes it, for example `ONS Open Geography`. */
  source: string;
  /** Where it was downloaded from. */
  sourceUrl: string;
  /**
   * When its data dates from, as the source states it, as an ISO 8601 date or
   * month: council boundaries as at May 2026 are `2026-05`.
   */
  sourceDate: string;
  /** When `pnpm data:prepare` prepared it, as an ISO 8601 date and time. */
  preparedAt: string;
  /**
   * The statements its licence requires and a link to its conditions, or
   * `null` for a dataset whose source is credited as a whole.
   */
  attribution: DatasetAttribution | null;
}

/**
 * A Land Coverage Area: a council whose land data has been prepared, so Land
 * Opportunities can be found inside it (PRD FR-6.1, FR-6.4).
 */
export interface LandCoverageArea {
  council: Council;
  datasets: PreparedDataset[];
  /**
   * Whether its INSPIRE Index Polygons were published more than 2 months ago,
   * or aren't prepared, so running `pnpm data:prepare` again is suggested
   * (FR-6.5).
   */
  outOfDate: boolean;
}

/** A prepared dataset as the manifest lists it: with the file it is in. */
export interface ManifestDataset extends Omit<PreparedDataset, "attribution"> {
  /** Its GeoParquet file, relative to `data/`, for example `england/council-boundaries.parquet`. */
  file: string;
  /** Only for a dataset whose licence requires statements of its own. */
  attribution?: DatasetAttribution;
}

/**
 * `data/manifest.json`, written by `pnpm data:prepare` once every file it
 * lists has been written (PRD FR-6.2). A re-run replaces it and its files: no
 * history is kept (FR-6.5).
 */
export interface PreparedManifest {
  /** When `pnpm data:prepare` last ran, as an ISO 8601 date and time. */
  preparedAt: string;
  /** The England-wide datasets (FR-6.0). */
  datasets: ManifestDataset[];
  /** The Land Coverage Areas, in order of name, each with its own datasets (FR-6.1). */
  landCoverageAreas: { council: Council; datasets: ManifestDataset[] }[];
}

/**
 * The body of `GET /api/coverage`: the prepared datasets and Land Coverage
 * Areas, with their dates (PRD FR-6.5, FR-8.2).
 */
export interface CoverageResponse {
  /**
   * `not-prepared` until `pnpm data:prepare` has run, and `unavailable` if
   * what it prepared can't be read. Either way the lists are empty.
   */
  status: SourceStatus;
  /** When `pnpm data:prepare` last ran, or `null` unless `status` is `ok`. */
  preparedAt: string | null;
  /** The England-wide datasets. */
  datasets: PreparedDataset[];
  landCoverageAreas: LandCoverageArea[];
}

/**
 * The council a Location is in, found in the prepared council boundaries,
 * and whether it is a Land Coverage Area.
 */
export interface CouncilReport {
  /** `not-prepared` until `pnpm data:prepare` has prepared the boundaries. */
  status: SourceStatus;
  /**
   * `null` unless `status` is `ok`, or if no council's boundary covers the
   * Location: the boundaries follow the coast, so a beach may be outside them.
   */
  council: Council | null;
  /** Whether the council is a Land Coverage Area. `false` without a council. */
  inLandCoverageArea: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const isCouncil = (value: unknown): value is Council =>
  isRecord(value) && isText(value.code) && isText(value.name);

export const isDatasetAttribution = (
  value: unknown,
): value is DatasetAttribution =>
  isRecord(value) &&
  Array.isArray(value.statements) &&
  value.statements.length > 0 &&
  value.statements.every(isText) &&
  isText(value.conditionsUrl);

/** A dataset's source and dates, whether the API or the manifest lists it. */
const isDescribedDataset = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  isText(value.id) &&
  isText(value.name) &&
  isText(value.source) &&
  isText(value.sourceUrl) &&
  isText(value.sourceDate) &&
  isText(value.preparedAt);

export const isPreparedDataset = (value: unknown): value is PreparedDataset =>
  isDescribedDataset(value) &&
  (value.attribution === null || isDatasetAttribution(value.attribution));

export const isLandCoverageArea = (value: unknown): value is LandCoverageArea =>
  isRecord(value) &&
  isCouncil(value.council) &&
  Array.isArray(value.datasets) &&
  value.datasets.every(isPreparedDataset) &&
  typeof value.outOfDate === "boolean";

/** A file relative to `data/`, which can't reach outside it. */
const isDataFile = (value: unknown): value is string =>
  isText(value) &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  value.split("/").every((part) => part !== "" && part !== "..");

const isManifestDataset = (value: unknown): value is ManifestDataset =>
  isDescribedDataset(value) &&
  isDataFile(value.file) &&
  (!("attribution" in value) || isDatasetAttribution(value.attribution));

export const isPreparedManifest = (value: unknown): value is PreparedManifest =>
  isRecord(value) &&
  isText(value.preparedAt) &&
  Array.isArray(value.datasets) &&
  value.datasets.every(isManifestDataset) &&
  Array.isArray(value.landCoverageAreas) &&
  value.landCoverageAreas.every(
    (area) =>
      isRecord(area) &&
      isCouncil(area.council) &&
      Array.isArray(area.datasets) &&
      area.datasets.every(isManifestDataset),
  );

export const isCoverageResponse = (value: unknown): value is CoverageResponse =>
  isRecord(value) &&
  isSourceStatus(value.status) &&
  (value.preparedAt === null || isText(value.preparedAt)) &&
  Array.isArray(value.datasets) &&
  value.datasets.every(isPreparedDataset) &&
  Array.isArray(value.landCoverageAreas) &&
  value.landCoverageAreas.every(isLandCoverageArea);

export const isCouncilReport = (value: unknown): value is CouncilReport =>
  isRecord(value) &&
  isSourceStatus(value.status) &&
  (value.council === null || isCouncil(value.council)) &&
  typeof value.inLandCoverageArea === "boolean";
