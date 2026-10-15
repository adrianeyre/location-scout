import type { ExplainQuestions } from "@location-scout/shared";

import type { ScoutModeConfig } from "../scoring/config";

/**
 * The questions an AI Explanation offers before the user's own (PRD
 * FR-11.3). Every Scout Mode's Overview asks its own question first ("Could
 * I open a café here?"), so a mode added by config has one with no change
 * here; `overview` adds questions for a mode, by its id, before those every
 * mode asks.
 */
export interface ExplainQuestionsConfig {
  overview: {
    byMode: Readonly<Partial<Record<string, readonly string[]>>>;
    everyMode: readonly string[];
  };
  category: readonly string[];
  "land-opportunity": readonly string[];
}

export const EXPLAIN_QUESTIONS: ExplainQuestionsConfig = {
  overview: {
    byMode: {
      homebuyer: ["Is this area good for families?"],
      "buy-to-let": ["What would tenants find here?"],
      investment: ["What is changing here?"],
      development: ["What would limit building here?"],
      "business-nursery": ["Is this area good for families?"],
    },
    everyMode: [
      "What are the biggest risks here?",
      "What stands out most in these figures?",
    ],
  },
  category: [
    "Why is this score what it is?",
    "Which input counts most in this score?",
    "How much does this score count in the Location Score?",
  ],
  "land-opportunity": [
    "Why does this land warrant investigation?",
    "What should I check before pursuing it?",
    "What do the land sales and Planning Applications near it suggest?",
  ],
};

/** The Overview's questions in a Scout Mode: its own first. */
const overviewQuestions = (
  mode: ScoutModeConfig,
  config: ExplainQuestionsConfig,
) => [
  ...new Set([
    mode.question,
    ...(config.overview.byMode[mode.id] ?? []),
    ...config.overview.everyMode,
  ]),
];

/** The questions offered, the Overview's for each Scout Mode. */
export const explainQuestions = (
  modes: readonly ScoutModeConfig[],
  config: ExplainQuestionsConfig = EXPLAIN_QUESTIONS,
): ExplainQuestions => ({
  overview: Object.fromEntries(
    modes.map((mode) => [mode.id, overviewQuestions(mode, config)]),
  ),
  category: [...config.category],
  "land-opportunity": [...config["land-opportunity"]],
});
