/**
 * How a Data Source answered for one response (PRD NFR-1.3):
 * - `ok`: it answered.
 * - `unavailable`: it failed or took longer than 8 seconds (NFR-1.1).
 * - `not-prepared`: its local files have not been made by `pnpm data:prepare`.
 */
export const SOURCE_STATUSES = ["ok", "unavailable", "not-prepared"] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** The Layers shown on the map (PRD §6.3). */
export const LAYER_IDS = [
  "crime",
  "planning",
  "amenities",
  "schools",
  "transport",
  "green-space",
  "property",
  "land",
  "demographics",
] as const;

export type LayerId = (typeof LAYER_IDS)[number];

/**
 * The period a Data Source's figures cover, inclusive, as ISO 8601 dates or
 * months: for example the latest month of crime is `2026-07` to `2026-07`.
 */
export interface DataPeriod {
  from: string;
  to: string;
}

/** One Data Source behind a response, and how it answered. */
export interface SourceReport {
  /** A stable identifier, for example `postcodes-io`. */
  id: string;
  /** The name to show, for example `postcodes.io`. */
  name: string;
  status: SourceStatus;
  /** `null` when the source did not answer or states no period. */
  period: DataPeriod | null;
}

/** One Layer and whether its Features and statistics can be shown. */
export interface LayerReport {
  id: LayerId;
  status: SourceStatus;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isSourceStatus = (value: unknown): value is SourceStatus =>
  SOURCE_STATUSES.some((status) => status === value);

export const isLayerId = (value: unknown): value is LayerId =>
  LAYER_IDS.some((id) => id === value);

export const isDataPeriod = (value: unknown): value is DataPeriod =>
  isRecord(value) &&
  typeof value.from === "string" &&
  typeof value.to === "string";

export const isSourceReport = (value: unknown): value is SourceReport =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  isSourceStatus(value.status) &&
  (value.period === null || isDataPeriod(value.period));

export const isLayerReport = (value: unknown): value is LayerReport =>
  isRecord(value) && isLayerId(value.id) && isSourceStatus(value.status);
