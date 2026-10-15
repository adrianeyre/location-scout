import { isServedLayerId, type ServedLayerId } from "./layer";
import { isScoutModeId, type ScoutModeId } from "./scout-modes";
import { isSourceStatus, type SourceStatus } from "./source-status";

/**
 * How a Highlight reads (PRD FR-3.7): 🟢 Good, 🟠 Watch or 🔴 Concern, in the
 * order the Location Overview gives them, most pressing first.
 */
export const HIGHLIGHT_LEVELS = ["concern", "watch", "good"] as const;

export type HighlightLevel = (typeof HIGHLIGHT_LEVELS)[number];

export const isHighlightLevel = (value: unknown): value is HighlightLevel =>
  HIGHLIGHT_LEVELS.some((level) => level === value);

/**
 * The rules that give Highlights, each from one Layer's calculated figures,
 * in the order they are applied. Highlights that need Layers not built yet,
 * such as Planning Applications, join with them.
 */
export const HIGHLIGHT_RULE_IDS = [
  "crime-rate-high",
  "crime-rate-low",
  "crime-rising",
  "crime-falling",
  "flood-zone-at-location",
  "flood-zone-nearby",
  "conservation-area",
  "listed-building",
  "article-4-direction",
  "tree-preservation-zone",
  "no-planning-constraints",
  "no-everyday-shop",
  "no-healthcare",
  "wide-range-of-amenities",
  "no-station-nearby",
  "station-nearby",
  "few-bus-stops",
  "good-bus-service",
  "limited-parking",
  "no-park-nearby",
  "park-nearby",
  "no-playground",
  "prices-falling",
  "prices-rising",
  "quiet-market",
  "active-market",
] as const;

export type HighlightRuleId = (typeof HIGHLIGHT_RULE_IDS)[number];

export const isHighlightRuleId = (value: unknown): value is HighlightRuleId =>
  HIGHLIGHT_RULE_IDS.some((id) => id === value);

/**
 * A short Good, Watch or Concern statement about a Search Area, given by a
 * fixed rule from calculated figures, never by AI (PRD FR-3.7). For example
 * "Crime up 5.9% year on year".
 */
export interface Highlight {
  /** The rule that gave it. */
  rule: HighlightRuleId;
  level: HighlightLevel;
  text: string;
  /** The Layer whose figures it comes from, which it links to. */
  layer: ServedLayerId;
}

/**
 * A Layer whose Highlights are left out because it isn't `ok`: its rules had
 * no figures to read.
 */
export interface LeftOutLayer {
  layer: ServedLayerId;
  status: Exclude<SourceStatus, "ok">;
}

/**
 * The body of `GET /api/highlights`: the Highlights for a Search Area under
 * one Scout Mode, which decides which rules apply (PRD FR-3.7).
 */
export interface HighlightsResponse {
  mode: ScoutModeId;
  /** Concerns first, then Watches, then Goods, each in the order of `HIGHLIGHT_RULE_IDS`. */
  highlights: Highlight[];
  /** The Layers with rules in this mode that weren't `ok`, in the order of `SERVED_LAYER_IDS`. */
  leftOut: LeftOutLayer[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isHighlight = (value: unknown): value is Highlight =>
  isRecord(value) &&
  isHighlightRuleId(value.rule) &&
  isHighlightLevel(value.level) &&
  typeof value.text === "string" &&
  value.text.length > 0 &&
  isServedLayerId(value.layer);

const isLeftOutLayer = (value: unknown): value is LeftOutLayer =>
  isRecord(value) &&
  isServedLayerId(value.layer) &&
  isSourceStatus(value.status) &&
  value.status !== "ok";

export const isHighlightsResponse = (
  value: unknown,
): value is HighlightsResponse =>
  isRecord(value) &&
  isScoutModeId(value.mode) &&
  Array.isArray(value.highlights) &&
  value.highlights.every(isHighlight) &&
  Array.isArray(value.leftOut) &&
  value.leftOut.every(isLeftOutLayer);
