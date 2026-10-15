import { isCategoryId, type CategoryId } from "./scores";
import { isScoutModeId, type ScoutModeId } from "./scout-modes";
import type { SearchRadiusMiles } from "./search-area";

/**
 * What an AI Explanation is about (PRD FR-11.1): the Location Overview, one
 * Category Score, or one Land Opportunity, named by its Land Parcel's id.
 */
export type ExplainSubject =
  | { kind: "overview" }
  | { kind: "category"; category: CategoryId }
  | { kind: "land-opportunity"; parcelId: string };

export const EXPLAIN_SUBJECT_KINDS = [
  "overview",
  "category",
  "land-opportunity",
] as const;

export type ExplainSubjectKind = (typeof EXPLAIN_SUBJECT_KINDS)[number];

/** How AI Explanations are asked for. */
export const EXPLAIN_RULES = {
  /** The longest question of the user's own the backend takes, in characters. */
  maxQuestionLength: 500,
} as const;

/**
 * Every AI Explanation is labelled so (PRD FR-11.4): it is written by a
 * model, from the figures shown above it and nothing else.
 */
export const AI_EXPLANATION_LABEL =
  "AI Explanation, based only on the figures above";

/**
 * The questions offered for each subject before the user's own (PRD
 * FR-11.3). The Overview's are each Scout Mode's own, by its id.
 */
export interface ExplainQuestions {
  overview: Record<ScoutModeId, string[]>;
  category: string[];
  "land-opportunity": string[];
}

/**
 * The body of `GET /api/explain`: whether AI Explanations are on, which they
 * are only when `ANTHROPIC_API_KEY` is set (ADR 0005), the model that writes
 * them, and the questions they offer.
 */
export type ExplainStatusResponse =
  | { enabled: false }
  | {
      enabled: true;
      /** `ANTHROPIC_MODEL`, by default `claude-sonnet-5-5`. */
      model: string;
      questions: ExplainQuestions;
    };

/** The body of `POST /api/explain`: a question about a subject in a Search Area. */
export interface ExplainRequest {
  lat: number;
  lng: number;
  radius: SearchRadiusMiles;
  /** The postcode searched for, if the Location was found from one. */
  postcode?: string;
  mode: ScoutModeId;
  /**
   * The user's own weights for the Scout Mode (PRD FR-4.4), if the Location
   * Score shown is weighed by them.
   */
  weights?: Partial<Record<CategoryId, number>>;
  subject: ExplainSubject;
  /** A question offered, or one of the user's own. */
  question: string;
}

/**
 * The tokens an explanation took, as the model's provider counted them
 * (PRD FR-11.5): what it was sent and what it wrote.
 */
export interface ExplainUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * One event of `POST /api/explain`'s answer, which streams as
 * server-sent events: the explanation's text as it is written, then
 * `done`, or `error` if it couldn't be finished.
 */
export type ExplainEvent =
  | { type: "text"; text: string }
  | {
      type: "done";
      usage: ExplainUsage;
      /** It was answered from the in-memory cache, at no cost. */
      cached: boolean;
      /** The model stopped at its length limit, so the answer is cut short. */
      truncated: boolean;
      /**
       * Each number in the answer that isn't among the figures it was given
       * (PRD FR-11.6), which the panel warns of. Empty when it checks out.
       */
      unverifiedNumbers: string[];
    }
  | { type: "error"; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isQuestionList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((question) => typeof question === "string" && question !== "");

export const isExplainSubject = (value: unknown): value is ExplainSubject => {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "overview":
      return Object.keys(value).length === 1;
    case "category":
      return isCategoryId(value.category);
    case "land-opportunity":
      return typeof value.parcelId === "string" && value.parcelId !== "";
    default:
      return false;
  }
};

export const isExplainQuestions = (value: unknown): value is ExplainQuestions =>
  isRecord(value) &&
  isRecord(value.overview) &&
  !Array.isArray(value.overview) &&
  Object.entries(value.overview).every(
    ([mode, questions]) => isScoutModeId(mode) && isQuestionList(questions),
  ) &&
  isQuestionList(value.category) &&
  isQuestionList(value["land-opportunity"]);

export const isExplainStatusResponse = (
  value: unknown,
): value is ExplainStatusResponse => {
  if (!isRecord(value)) return false;
  if (value.enabled === false) return Object.keys(value).length === 1;
  return (
    value.enabled === true &&
    typeof value.model === "string" &&
    value.model !== "" &&
    isExplainQuestions(value.questions)
  );
};

export const isExplainUsage = (value: unknown): value is ExplainUsage =>
  isRecord(value) && isCount(value.inputTokens) && isCount(value.outputTokens);

export const isExplainEvent = (value: unknown): value is ExplainEvent => {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case "text":
      return typeof value.text === "string";
    case "done":
      return (
        isExplainUsage(value.usage) &&
        typeof value.cached === "boolean" &&
        typeof value.truncated === "boolean" &&
        Array.isArray(value.unverifiedNumbers) &&
        value.unverifiedNumbers.every((number) => typeof number === "string")
      );
    case "error":
      return typeof value.error === "string" && value.error !== "";
    default:
      return false;
  }
};
