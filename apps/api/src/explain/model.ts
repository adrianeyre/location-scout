import Anthropic from "@anthropic-ai/sdk";

import type { ExplainUsage } from "@location-scout/shared";

import type { ExplainPrompt } from "./prompt";

/** The model AI Explanations are written by unless `ANTHROPIC_MODEL` names another (PRD FR-11.4). */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/**
 * The most an explanation may be. They are asked for in under about two
 * hundred words, so this only stops a runaway answer.
 */
export const MAX_OUTPUT_TOKENS = 4096;

/**
 * Where Anthropic's API is. Given, rather than read from the environment as
 * Anthropic's SDK otherwise would, so the API calls only what its own
 * settings say.
 */
export const ANTHROPIC_API_URL = "https://api.anthropic.com";

/** How long Anthropic may take to answer before the request is given up. */
export const ANTHROPIC_TIMEOUT_MS = 60_000;

/** What the model streams: its text as it writes it, then how it ended. */
export type ModelEvent =
  | { type: "text"; text: string }
  | {
      type: "end";
      usage: ExplainUsage;
      /** Why it stopped: `end_turn` when it finished, `max_tokens`, `refusal`… */
      stopReason: string | null;
    };

/** Writes an answer to a prompt, streaming it. */
export type ExplainModel = (
  prompt: ExplainPrompt,
  signal: AbortSignal,
) => AsyncIterable<ModelEvent>;

/** The model couldn't answer, with what the user is told. */
export class ExplainModelError extends Error {
  override name = "ExplainModelError";
}

/** What the user is told when Anthropic doesn't answer, or refuses to. */
export const modelErrorMessage = (error: unknown, model: string): string => {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return "Anthropic refused ANTHROPIC_API_KEY. Check the key in .env, and restart the API.";
  }
  if (
    error instanceof Anthropic.NotFoundError ||
    error instanceof Anthropic.BadRequestError
  ) {
    return `Anthropic refused the request for ${model}. Check that ANTHROPIC_MODEL in .env names a current model.`;
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Anthropic's rate limit for your key was reached. Try again in a minute.";
  }
  if (error instanceof ExplainModelError) return error.message;
  return "Anthropic didn't answer. Try again shortly.";
};

/**
 * Anthropic's Messages API, streaming (PRD §6.17), with the user's own key
 * and the app's `fetch`, so tests answer with a stub model and nothing
 * reaches Anthropic.
 */
export const createAnthropicModel = ({
  apiKey,
  model,
  fetch: fetchFn,
}: {
  apiKey: string;
  model: string;
  fetch: typeof fetch;
}): ExplainModel => {
  const client = new Anthropic({
    apiKey,
    authToken: null,
    baseURL: ANTHROPIC_API_URL,
    fetch: fetchFn,
    maxRetries: 1,
    timeout: ANTHROPIC_TIMEOUT_MS,
  });
  return async function* stream(prompt, signal) {
    const answer = client.messages.stream(
      {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
        // A short explanation of figures given needs little thought.
        output_config: { effort: "low" },
      },
      { signal },
    );
    for await (const event of answer) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", text: event.delta.text };
      }
    }
    const { usage, stop_reason: stopReason } = await answer.finalMessage();
    yield {
      type: "end",
      usage: {
        inputTokens:
          usage.input_tokens +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
      },
      stopReason,
    };
  };
};
