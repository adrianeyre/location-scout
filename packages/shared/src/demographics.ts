import { isFeature, type Feature } from "./feature";
import { isConstraintShape, type ConstraintShape } from "./planning";
import {
  isSourceReport,
  isSourceStatus,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/**
 * What the Demographics Layer can shade its output areas by (PRD FR-2.7a):
 * each output area's population density and median age, its MSOA's average
 * household income, and its LSOA's deprivation decile.
 */
export const DEMOGRAPHIC_MEASURES = [
  "population-density",
  "median-age",
  "household-income",
  "deprivation",
] as const;

export type DemographicMeasure = (typeof DEMOGRAPHIC_MEASURES)[number];

export const isDemographicMeasure = (
  value: unknown,
): value is DemographicMeasure =>
  DEMOGRAPHIC_MEASURES.some((measure) => measure === value);

/**
 * A band of ages, inclusive, in years. `to` is `null` for the last band,
 * which is open.
 */
export interface AgeBand {
  from: number;
  to: number | null;
}

/**
 * The age bands Census 2021 counts residents of each output area in (table
 * TS007A): 0 to 4, 5 to 9 and so on, up to 85 and over.
 */
export const CENSUS_AGE_BANDS: readonly AgeBand[] = [
  ...Array.from({ length: 17 }, (_, band) => ({
    from: band * 5,
    to: band * 5 + 4,
  })),
  { from: 85, to: null },
];

/** The groups the Location Overview gives the Search Area's age profile in. */
export const AGE_GROUPS = [
  "under-15",
  "15-to-24",
  "25-to-44",
  "45-to-64",
  "65-and-over",
] as const;

export type AgeGroup = (typeof AGE_GROUPS)[number];

/** Each age group's ages, made of whole Census age bands. */
export const AGE_GROUP_BANDS: Readonly<Record<AgeGroup, AgeBand>> = {
  "under-15": { from: 0, to: 14 },
  "15-to-24": { from: 15, to: 24 },
  "25-to-44": { from: 25, to: 44 },
  "45-to-64": { from: 45, to: 64 },
  "65-and-over": { from: 65, to: null },
};

export const isAgeGroup = (value: unknown): value is AgeGroup =>
  AGE_GROUPS.some((group) => group === value);

/** A lower layer super output area (LSOA): a few output areas together. */
export interface Lsoa {
  /** Its ONS code, for example `E01027954`. */
  code: string;
  /** Its name, for example `Ashfield 007D`. */
  name: string;
}

/**
 * One output area that reaches into the Search Area, shaded on the map by
 * the measure chosen (PRD FR-2.7a). Its `location` is where the map marks it:
 * a point of it inside the Search Area. `distanceMetres` is how far that is.
 */
export interface OutputAreaFeature extends Feature {
  /** Its ONS code, for example `E00142407`. */
  id: string;
  /** The LSOA it is in, or `null` if ONS's lookup gives none. */
  lsoa: Lsoa | null;
  /** The ONS code of the MSOA it is in, or `null` if ONS's lookup gives none. */
  msoaCode: string | null;
  /** Its usual residents in Census 2021. */
  population: number;
  /** Its households in Census 2021. */
  households: number;
  /** Its residents per km², as Census 2021 gives it. */
  populationDensity: number;
  /** The median age of its residents, from their age bands, to one decimal place. */
  medianAge: number | null;
  /**
   * Its MSOA's average total annual household income in pounds, from ONS's
   * small area income estimates, or `null` if they give none.
   */
  householdIncome: number | null;
  /**
   * Its LSOA's decile of the Index of Multiple Deprivation, where 1 is the
   * most deprived 10% of LSOAs in England, or `null` if it has none.
   */
  deprivationDecile: number | null;
  /** The share of it inside the Search Area, from 0 to 1, to three decimal places. */
  overlap: number;
  /** Whether the Location sits inside it. */
  coversLocation: boolean;
  /** Its outline. */
  shape: ConstraintShape;
}

/** How many of the Search Area's residents are estimated to be in one age group. */
export interface AgeGroupCount {
  group: AgeGroup;
  population: number;
  /** Their share of the Search Area's estimated population, in per cent, to one decimal place. */
  percent: number;
}

/** The average household income across the MSOAs in the Search Area. */
export interface HouseholdIncome {
  /**
   * The MSOAs' average total annual household incomes in pounds, weighed by
   * the households estimated to be in the Search Area in each, to the pound.
   */
  averagePounds: number;
  /** How many MSOAs the Search Area reaches into. */
  msoas: number;
  /**
   * The median of every English MSOA's average total annual household
   * income in pounds, from the same estimates, for comparing with.
   */
  englandMedianPounds: number;
}

/** An LSOA's place in the Index of Multiple Deprivation. */
export interface LsoaDeprivation extends Lsoa {
  /** Its decile, where 1 is the most deprived 10% of LSOAs in England. */
  decile: number;
  /** Its rank among England's LSOAs, where 1 is the most deprived. */
  rank: number;
}

/** The deprivation of the Search Area's LSOAs. */
export interface Deprivation {
  /** The LSOA the Location is in, or `null` if it has no decile. */
  atLocation: LsoaDeprivation | null;
  /** The most deprived decile of any LSOA the Search Area reaches into. */
  lowestDecile: number;
  /** The least deprived. */
  highestDecile: number;
  /** How many LSOAs the Search Area reaches into. */
  lsoas: number;
}

/**
 * The Demographics Layer's statistics for the Location Overview (PRD
 * FR-2.7a). The Search Area's population, households and age profile are
 * estimated from the output areas it reaches into, each counted in
 * proportion to the share of it inside the Search Area.
 */
export interface DemographicsStatistics {
  /** How many output areas reach into the Search Area. */
  outputAreas: number;
  /** The estimated population of the Search Area, to the person. */
  population: number;
  /** The estimated households in the Search Area. */
  households: number;
  /** Every age group, in the order of `AGE_GROUPS`. */
  ageProfile: AgeGroupCount[];
  /** The median age of the estimated population, or `null` with no residents. */
  medianAge: number | null;
  /** `null` if no MSOA in the Search Area has an income estimate. */
  householdIncome: HouseholdIncome | null;
  /** `null` if no LSOA in the Search Area has a decile. */
  deprivation: Deprivation | null;
}

/**
 * The body of `GET /api/area/demographics`: the output areas that reach into
 * the Search Area, from Census 2021, ONS's small area income estimates and the
 * English Indices of Deprivation, as `pnpm data:prepare` prepared them, with
 * the Search Area's estimated population, households, age profile, income
 * and deprivation (PRD FR-2.7a). Before `pnpm data:prepare`, `status` is
 * `not-prepared`, and there are no Features and no statistics (FR-6.6).
 */
export interface DemographicsLayerResponse {
  layer: "demographics";
  status: SourceStatus;
  /** The prepared datasets behind the Layer, and how each was read. */
  sources: SourceReport[];
  features: OutputAreaFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: DemographicsStatistics | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isDecile = (value: unknown): value is number =>
  isCount(value) && value >= 1 && value <= 10;

const isLsoa = (value: unknown): value is Lsoa =>
  isRecord(value) &&
  typeof value.code === "string" &&
  typeof value.name === "string";

export const isOutputAreaFeature = (
  value: unknown,
): value is OutputAreaFeature =>
  isFeature(value) &&
  isRecord(value) &&
  (value.lsoa === null || isLsoa(value.lsoa)) &&
  (value.msoaCode === null || typeof value.msoaCode === "string") &&
  isCount(value.population) &&
  isCount(value.households) &&
  isAmount(value.populationDensity) &&
  (value.medianAge === null || isAmount(value.medianAge)) &&
  (value.householdIncome === null || isAmount(value.householdIncome)) &&
  (value.deprivationDecile === null || isDecile(value.deprivationDecile)) &&
  isAmount(value.overlap) &&
  value.overlap <= 1 &&
  typeof value.coversLocation === "boolean" &&
  isConstraintShape(value.shape);

const isAgeGroupCount = (value: unknown): value is AgeGroupCount =>
  isRecord(value) &&
  isAgeGroup(value.group) &&
  isCount(value.population) &&
  isAmount(value.percent);

const isHouseholdIncome = (value: unknown): value is HouseholdIncome =>
  isRecord(value) &&
  isAmount(value.averagePounds) &&
  isCount(value.msoas) &&
  isAmount(value.englandMedianPounds);

const isLsoaDeprivation = (value: unknown): value is LsoaDeprivation =>
  isLsoa(value) &&
  isRecord(value) &&
  isDecile(value.decile) &&
  isCount(value.rank);

const isDeprivation = (value: unknown): value is Deprivation =>
  isRecord(value) &&
  (value.atLocation === null || isLsoaDeprivation(value.atLocation)) &&
  isDecile(value.lowestDecile) &&
  isDecile(value.highestDecile) &&
  isCount(value.lsoas);

export const isDemographicsStatistics = (
  value: unknown,
): value is DemographicsStatistics =>
  isRecord(value) &&
  isCount(value.outputAreas) &&
  isCount(value.population) &&
  isCount(value.households) &&
  Array.isArray(value.ageProfile) &&
  value.ageProfile.every(isAgeGroupCount) &&
  (value.medianAge === null || isAmount(value.medianAge)) &&
  (value.householdIncome === null ||
    isHouseholdIncome(value.householdIncome)) &&
  (value.deprivation === null || isDeprivation(value.deprivation));

export const isDemographicsLayerResponse = (
  value: unknown,
): value is DemographicsLayerResponse =>
  isRecord(value) &&
  value.layer === "demographics" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  Array.isArray(value.features) &&
  value.features.every(isOutputAreaFeature) &&
  (value.statistics === null || isDemographicsStatistics(value.statistics));
