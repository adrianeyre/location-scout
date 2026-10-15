import { isFeature, type Feature } from "./feature";
import {
  isDataPeriod,
  isSourceReport,
  isSourceStatus,
  type DataPeriod,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/** A month as data.police.uk gives it, for example `2026-08`. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isMonth = (value: unknown): value is string =>
  typeof value === "string" && MONTH_PATTERN.test(value);

/** One street-level crime reported to the police (PRD FR-2.1). */
export interface CrimeFeature extends Feature {
  /** data.police.uk's category, for example `violent-crime`. */
  category: string;
  /** The category's name, for example "Violence and sexual offences". */
  categoryName: string;
  /** The month it was reported in, for example `2026-08`. */
  month: string;
  /**
   * Where the police place it, for example "On or near Parking Area". Police
   * locations are deliberately approximate (FR-2.9).
   */
  street: string | null;
}

/** How many crimes of one category were reported. */
export interface CrimeCategoryCount {
  category: string;
  name: string;
  count: number;
}

/** How many crimes were reported in the last 12 months and the 12 before. */
export interface CrimeChange {
  /** The 12 months up to and including the latest published month. */
  last12Months: number;
  /** The 12 months before those. */
  previous12Months: number;
  /**
   * The year-on-year change in per cent, to one decimal place, for example
   * `-8.3`. `null` if the trend is incomplete, or if there were no crimes in
   * the previous 12 months to compare with.
   */
  change: number | null;
}

/** One category's crimes, year on year. */
export interface CrimeCategoryChange extends CrimeChange {
  category: string;
  name: string;
}

/**
 * Crimes in the last 12 months against the 12 months before (PRD FR-2.1).
 * Each of the 24 months is asked for on its own. If data.police.uk doesn't
 * answer for some, the counts leave them out and the trend is marked
 * incomplete, with no changes, rather than compared wrongly.
 */
export interface CrimeTrend {
  /** For example `2025-09` to `2026-08`. */
  last12Months: DataPeriod;
  /** For example `2024-09` to `2025-08`. */
  previous12Months: DataPeriod;
  /** `true` only if every one of the 24 months was counted. */
  complete: boolean;
  /** The months data.police.uk didn't answer for, oldest first. */
  missingMonths: string[];
  /** Every category together. */
  total: CrimeChange;
  /** Most reported in the last 12 months first. */
  byCategory: CrimeCategoryChange[];
}

/** The Crime Layer's statistics for the Location Overview (FR-2.1). */
export interface CrimeStatistics {
  /** The latest month data.police.uk has published, for example `2026-08`. */
  month: string;
  /** Crimes in the latest month. */
  total: number;
  /** The latest month's crimes by category, most reported first. */
  byCategory: CrimeCategoryCount[];
  /** The last 12 months against the 12 before. */
  trend: CrimeTrend;
}

/**
 * The body of `GET /api/area/crime`: the street-level crimes in the Search
 * Area for the latest published month, their count by category, and the
 * year-on-year trend over the last 24 months. If
 * data.police.uk is unavailable, `status` says so, and there are no Features
 * and no statistics (PRD NFR-1.2).
 */
export interface CrimeLayerResponse {
  layer: "crime";
  status: SourceStatus;
  /** The Data Sources behind the Layer, and how each answered. */
  sources: SourceReport[];
  features: CrimeFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: CrimeStatistics | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export const isCrimeFeature = (value: unknown): value is CrimeFeature =>
  isFeature(value) &&
  isRecord(value) &&
  typeof value.category === "string" &&
  typeof value.categoryName === "string" &&
  isMonth(value.month) &&
  (value.street === null || typeof value.street === "string");

const isCrimeCategoryCount = (value: unknown): value is CrimeCategoryCount =>
  isRecord(value) &&
  typeof value.category === "string" &&
  typeof value.name === "string" &&
  isCount(value.count);

const isChange = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));

const isCrimeChange = (value: unknown): value is CrimeChange =>
  isRecord(value) &&
  isCount(value.last12Months) &&
  isCount(value.previous12Months) &&
  isChange(value.change);

const isCrimeCategoryChange = (value: unknown): value is CrimeCategoryChange =>
  isCrimeChange(value) &&
  isRecord(value) &&
  typeof value.category === "string" &&
  typeof value.name === "string";

export const isCrimeTrend = (value: unknown): value is CrimeTrend =>
  isRecord(value) &&
  isDataPeriod(value.last12Months) &&
  isDataPeriod(value.previous12Months) &&
  typeof value.complete === "boolean" &&
  Array.isArray(value.missingMonths) &&
  value.missingMonths.every(isMonth) &&
  isCrimeChange(value.total) &&
  Array.isArray(value.byCategory) &&
  value.byCategory.every(isCrimeCategoryChange);

export const isCrimeStatistics = (value: unknown): value is CrimeStatistics =>
  isRecord(value) &&
  isMonth(value.month) &&
  isCount(value.total) &&
  Array.isArray(value.byCategory) &&
  value.byCategory.every(isCrimeCategoryCount) &&
  isCrimeTrend(value.trend);

export const isCrimeLayerResponse = (
  value: unknown,
): value is CrimeLayerResponse =>
  isRecord(value) &&
  value.layer === "crime" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  Array.isArray(value.features) &&
  value.features.every(isCrimeFeature) &&
  (value.statistics === null || isCrimeStatistics(value.statistics));
