import { createHash } from "node:crypto";

import type { ExplainEvent, ExplainUsage } from "@location-scout/shared";

import { TtlCache } from "../sources/ttl-cache";
import { modelErrorMessage, type ExplainModel } from "./model";
import { checkNumbers } from "./number-check";
import { promptText, type ExplainPrompt } from "./prompt";

/** How long an explanation is kept in memory to be given again at no cost (PRD FR-11.5). */
export const EXPLANATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface Explained {
  text: string;
  usage: ExplainUsage;
  truncated: boolean;
  unverifiedNumbers: string[];
}

const done = (
  { usage, truncated, unverifiedNumbers }: Explained,
  cached: boolean,
): ExplainEvent => ({
  type: "done",
  usage,
  cached,
  truncated,
  unverifiedNumbers,
});

/** Explains a prompt, streaming the answer as it is written. */
export type Explainer = (
  prompt: ExplainPrompt,
  signal: AbortSignal,
) => AsyncGenerator<ExplainEvent>;

/**
 * Asks `model` to explain each prompt, streaming its text, then its tokens
 * and any number in it that isn't in the prompt (PRD FR-11.6). A finished
 * answer is kept in memory, never on disk, so the same question about the
 * same figures in the same Scout Mode is answered again at no cost (FR-11.5).
 * The prompt holds the Search Area, Scout Mode, subject and question, so it
 * is the key, with the model: figures that have changed since, such as
 * Planning Applications that were queued, are asked about afresh.
 */
export const createExplainer = (
  model: ExplainModel,
  modelName: string,
  cache = new TtlCache(),
): Explainer =>
  async function* explain(prompt, signal) {
    const key = createHash("sha256")
      .update(modelName)
      .update("\0")
      .update(promptText(prompt))
      .digest("hex");
    const kept = cache.get(key) as Explained | undefined;
    if (kept) {
      yield { type: "text", text: kept.text };
      yield done(kept, true);
      return;
    }
    let text = "";
    try {
      for await (const event of model(prompt, signal)) {
        if (event.type === "text") {
          text += event.text;
          yield event;
          continue;
        }
        if (event.stopReason === "refusal") {
          yield {
            type: "error",
            error: "The model declined to answer this question.",
          };
          return;
        }
        const explained: Explained = {
          text,
          usage: event.usage,
          truncated: event.stopReason === "max_tokens",
          unverifiedNumbers: checkNumbers(text, promptText(prompt)).unverified,
        };
        cache.set(key, explained, EXPLANATION_CACHE_TTL_MS);
        yield done(explained, false);
        return;
      }
      yield { type: "error", error: modelErrorMessage(null, modelName) };
    } catch (error) {
      // The user asked another question, or left: nobody is listening.
      if (signal.aborted) return;
      yield { type: "error", error: modelErrorMessage(error, modelName) };
    }
  };
