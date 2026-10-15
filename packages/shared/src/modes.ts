import { isCompetitors, type Competitors } from "./competitors";
import {
  HIGHLIGHT_RULE_IDS,
  isHighlightRuleId,
  type HighlightRuleId,
} from "./highlights";
import { CATEGORY_IDS, isCategoryId, type CategoryId } from "./scores";
import {
  DEFAULT_SCOUT_MODE,
  isScoutModeId,
  type ScoutModeId,
} from "./scout-modes";
import { LAYER_IDS, isLayerId, type LayerId } from "./source-status";

/**
 * A Scout Mode (PRD §6.5): a question-specific view that decides how the
 * Category Scores are weighted, which Layers matter most and which Highlights
 * apply. It is config only, so adding one changes no code (FR-4.5).
 */
export interface ScoutMode {
  id: ScoutModeId;
  /** Its name, as the user sees it, for example "Buy-to-let". */
  name: string;
  /** The question it answers, for example "Should I buy a home here to let?". */
  question: string;
  /**
   * Each Category Score's weight in the Location Score (FR-4.2), out of 100
   * across every category the PRD gives the mode. A category it gives 0
   * counts for nothing.
   */
  weights: Record<CategoryId, number>;
  /**
   * The businesses it competes with (FR-4.3), whose number and nearness make
   * its Competition score, and which the map highlights. `null` for a mode
   * that isn't for opening a business.
   */
  competitors: Competitors | null;
  /** The Layers it highlights (FR-4.3a), in the order of `LAYER_IDS`. */
  highlightedLayers: LayerId[];
  /** The Highlight rules it applies (FR-3.7), in the order of `HIGHLIGHT_RULE_IDS`. */
  highlights: HighlightRuleId[];
}

/** The body of `GET /api/modes`: every Scout Mode, General first (FR-8.2). */
export interface ModesResponse {
  modes: ScoutMode[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isWeight = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isWeights = (value: unknown): value is Record<CategoryId, number> =>
  isRecord(value) &&
  Object.keys(value).every(isCategoryId) &&
  CATEGORY_IDS.every((id) => isWeight(value[id]));

/** Whether `value` is a list of `ids`, each once, in the order `order` gives. */
const isOrderedSubset = <T>(
  value: unknown,
  isId: (id: unknown) => id is T,
  order: readonly T[],
): value is T[] =>
  Array.isArray(value) &&
  value.every(isId) &&
  value
    .map((id) => order.indexOf(id))
    .every((at, index, all) => index === 0 || (all[index - 1] ?? at) < at);

export const isScoutMode = (value: unknown): value is ScoutMode =>
  isRecord(value) &&
  isScoutModeId(value.id) &&
  typeof value.name === "string" &&
  value.name.length > 0 &&
  typeof value.question === "string" &&
  isWeights(value.weights) &&
  (value.competitors === null || isCompetitors(value.competitors)) &&
  isOrderedSubset(value.highlightedLayers, isLayerId, LAYER_IDS) &&
  isOrderedSubset(value.highlights, isHighlightRuleId, HIGHLIGHT_RULE_IDS);

export const isModesResponse = (value: unknown): value is ModesResponse =>
  isRecord(value) &&
  Array.isArray(value.modes) &&
  value.modes.every(isScoutMode) &&
  value.modes.some(({ id }) => id === DEFAULT_SCOUT_MODE) &&
  new Set(value.modes.map(({ id }) => id)).size === value.modes.length;
