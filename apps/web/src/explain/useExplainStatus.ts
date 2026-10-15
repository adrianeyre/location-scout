import { useEffect, useState } from "react";

import type { ExplainQuestions } from "@location-scout/shared";

import { getExplainStatus } from "../api";

/** AI Explanations are on: the model that writes them and the questions offered. */
export interface ExplainOn {
  model: string;
  questions: ExplainQuestions;
}

/**
 * Asks the backend once whether AI Explanations are on (PRD FR-11.1), with
 * the questions they offer. `null` while it is being asked, if they are off,
 * which they are without `ANTHROPIC_API_KEY`, or if the backend didn't
 * answer: no Explain button is shown, and nothing is asked of Anthropic.
 */
export const useExplainStatus = () => {
  const [on, setOn] = useState<ExplainOn | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getExplainStatus(controller.signal).then(
      (status) => {
        if (status.ok && status.body.enabled) setOn(status.body);
      },
      // Only an abort throws: the page has gone.
      () => undefined,
    );
    return () => {
      controller.abort();
    };
  }, []);

  return on;
};
