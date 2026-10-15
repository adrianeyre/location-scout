import { isServedLayerId, type ServedLayerId } from "./layer";
import { isScoutModeId, type ScoutModeId } from "./scout-modes";
import type { SourceStatus } from "./source-status";

/**
 * The Category Scores (PRD §6.4), each from one or more Layers' statistics.
 * Demand, Competition and Footfall proxy are for the Business and Retail
 * Scout Modes, which alone weigh them.
 */
export const CATEGORY_IDS = [
  "safety",
  "amenities",
  "schools",
  "transport",
  "green-space",
  "property-activity",
  "development-activity",
  "planning-freedom",
  "demand",
  "competition",
  "footfall",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export const isCategoryId = (value: unknown): value is CategoryId =>
  CATEGORY_IDS.some((id) => id === value);

/** Each Category Score's name, as the user sees it. */
export const CATEGORY_NAMES: Readonly<Record<CategoryId, string>> = {
  safety: "Safety",
  amenities: "Amenities",
  schools: "Schools",
  transport: "Transport",
  "green-space": "Green space",
  "property-activity": "Property activity",
  "development-activity": "Development activity",
  "planning-freedom": "Planning freedom",
  demand: "Demand",
  competition: "Competition",
  footfall: "Footfall proxy",
};

/**
 * The Layers whose statistics each Category Score is calculated from: one,
 * or for Footfall proxy, the Amenities Layer's shops and offices and the
 * Transport Layer's stops. It needs every one of them. Safety and Competition
 * also count by the Demographics Layer's residents when it has them, but
 * don't need it: without it, they count per km². Development activity is
 * the Planning Layer's Planning Applications, not its Planning Constraints,
 * so it goes by their status rather than the Layer's. Demand also counts the
 * new residents they would bring, and waits for them while they are queued.
 */
export const CATEGORY_LAYERS: Readonly<
  Record<CategoryId, readonly [ServedLayerId, ...ServedLayerId[]]>
> = {
  safety: ["crime"],
  amenities: ["amenities"],
  schools: ["schools"],
  transport: ["transport"],
  "green-space": ["green-space"],
  "property-activity": ["property"],
  "development-activity": ["planning"],
  "planning-freedom": ["planning"],
  demand: ["demographics"],
  competition: ["amenities"],
  footfall: ["amenities", "transport"],
};

/**
 * One line of a Category Score's breakdown (PRD FR-3.3): an input, the rule
 * and thresholds that turn it into points, and the points it was given.
 */
export interface ScorePart {
  /** What is measured, for example "Distance to the nearest railway station". */
  input: string;
  /**
   * The figure measured: a number, or whether something is so, such as the
   * Location being inside a conservation area. `null` if there is none, for
   * example no railway station within 5 km.
   */
  value: number | boolean | null;
  /** The unit of a number, for example "m" or "%", or `null` for a count or none. */
  unit: string | null;
  /** The rule and thresholds used, written from the scoring config. */
  rule: string;
  /** The points given, to one decimal place. A penalty is negative. */
  points: number;
}

/**
 * Whether a Category Score could be calculated: its Layer's status, or
 * `queued` while the Planning Applications it needs wait for their
 * provider's turn (PRD NFR-1.5), so ask for the scores again shortly.
 */
export const CATEGORY_STATUSES = [
  "ok",
  "unavailable",
  "not-prepared",
  "queued",
] as const satisfies readonly (SourceStatus | "queued")[];

export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export const isCategoryStatus = (value: unknown): value is CategoryStatus =>
  CATEGORY_STATUSES.some((status) => status === value);

/**
 * One Category Score (PRD FR-3.2): 0–100, by fixed rules. If its Layer is
 * unavailable or not prepared, `status` says so, and there is no score and no
 * breakdown (FR-3.4).
 */
export interface CategoryScore {
  id: CategoryId;
  /**
   * The Layer it is calculated from. For one calculated from several, the
   * first of them that is not `ok`, or else the first.
   */
  layer: ServedLayerId;
  /**
   * The status of that Layer, or for Development activity and Demand, of
   * the Planning Applications when they are not `ok`.
   */
  status: CategoryStatus;
  /** A whole number from 0 to 100, or `null` unless `status` is `ok`. */
  score: number | null;
  /**
   * How it was reached. The parts' points add up to the score, before it is
   * rounded. Empty unless `status` is `ok`.
   */
  breakdown: ScorePart[];
}

/** A Category Score counted in the Location Score, and its weight. */
export interface WeightedCategory {
  id: CategoryId;
  score: number;
  /** Its weight in the Scout Mode, out of 100 for every category the mode weighs. */
  weight: number;
  /**
   * Its share of the Location Score in per cent, to one decimal place: its
   * weight renormalised over the categories counted.
   */
  share: number;
  /** What it adds to the Location Score: its score times its share, to one decimal place. */
  points: number;
}

/** A Category Score left out of the Location Score, because its Layer is not `ok`. */
export interface LeftOutCategory {
  id: CategoryId;
  /** The Layer it needs that is not `ok`: the first, if there are several. */
  layer: ServedLayerId;
  status: Exclude<CategoryStatus, "ok">;
  weight: number;
}

/**
 * The Location Score (PRD §6.4): the weighted mean of the Category Scores
 * available, with the Scout Mode's weights renormalised over them.
 */
export interface LocationScore {
  /** A whole number from 0 to 100, or `null` if no Category Score is available. */
  score: number | null;
  /** The Category Scores counted, in the order of `CATEGORY_IDS`. */
  counted: WeightedCategory[];
  /** The Category Scores left out, and why (FR-3.4). */
  leftOut: LeftOutCategory[];
}

/**
 * The body of `GET /api/scores`: the Category Scores and the Location Score
 * for a Search Area, each with its breakdown (PRD FR-3.2, FR-3.3), under one
 * Scout Mode, whose weights make the Location Score (FR-4.2) and whose
 * competitors make Competition (FR-4.3). They are "beta": fixed thresholds,
 * to be tuned against real Locations.
 */
export interface ScoresResponse {
  mode: ScoutModeId;
  /**
   * Every category the Scout Mode weighs, in the order of `CATEGORY_IDS`,
   * even one left out. A category it gives no weight isn't scored.
   */
  categories: CategoryScore[];
  location: LocationScore;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isScore = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 100;

const isWeight = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

export const isScorePart = (value: unknown): value is ScorePart =>
  isRecord(value) &&
  typeof value.input === "string" &&
  (value.value === null ||
    typeof value.value === "boolean" ||
    isFiniteNumber(value.value)) &&
  (value.unit === null || typeof value.unit === "string") &&
  typeof value.rule === "string" &&
  isFiniteNumber(value.points);

export const isCategoryScore = (value: unknown): value is CategoryScore =>
  isRecord(value) &&
  isCategoryId(value.id) &&
  isServedLayerId(value.layer) &&
  isCategoryStatus(value.status) &&
  (value.score === null || isScore(value.score)) &&
  Array.isArray(value.breakdown) &&
  value.breakdown.every(isScorePart);

const isWeightedCategory = (value: unknown): value is WeightedCategory =>
  isRecord(value) &&
  isCategoryId(value.id) &&
  isScore(value.score) &&
  isWeight(value.weight) &&
  isWeight(value.share) &&
  isWeight(value.points);

const isLeftOutCategory = (value: unknown): value is LeftOutCategory =>
  isRecord(value) &&
  isCategoryId(value.id) &&
  isServedLayerId(value.layer) &&
  isCategoryStatus(value.status) &&
  value.status !== "ok" &&
  isWeight(value.weight);

export const isLocationScore = (value: unknown): value is LocationScore =>
  isRecord(value) &&
  (value.score === null || isScore(value.score)) &&
  Array.isArray(value.counted) &&
  value.counted.every(isWeightedCategory) &&
  Array.isArray(value.leftOut) &&
  value.leftOut.every(isLeftOutCategory);

export const isScoresResponse = (value: unknown): value is ScoresResponse =>
  isRecord(value) &&
  isScoutModeId(value.mode) &&
  Array.isArray(value.categories) &&
  value.categories.every(isCategoryScore) &&
  isLocationScore(value.location);
