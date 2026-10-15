import { createContext } from "react";

import type {
  ExplainRequest,
  ExplainSubjectKind,
} from "@location-scout/shared";

/** What every Explain button asks about, while AI Explanations are on. */
export interface Explaining {
  /** The model that writes them, as `ANTHROPIC_MODEL` names it. */
  model: string;
  /** The questions offered for each subject in the Scout Mode chosen (PRD FR-11.3). */
  questions: Record<ExplainSubjectKind, string[]>;
  /**
   * The Search Area, Scout Mode and the user's own weights shown, which
   * each question is asked about.
   */
  about: Omit<ExplainRequest, "subject" | "question">;
}

/**
 * AI Explanations, when they are on and a Search Area is shown, or `null`,
 * when every Explain button is hidden (PRD FR-11.1).
 */
export const ExplainContext = createContext<Explaining | null>(null);
