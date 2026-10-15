import { describe, expect, it } from "vitest";

import type { ExplainEvent } from "@location-scout/shared";

import { createExplainer } from "./explainer";
import type { ExplainModel, ModelEvent } from "./model";

const PROMPT = {
  system: "Use only the figures given.",
  user: 'The figures, as JSON:\n{"score":62}\n\nThe question: Why?',
};

/** A model that streams `events`, counting how often it is asked. */
const scripted = (...events: ModelEvent[]) => {
  const model = Object.assign(
    async function* stream() {
      model.calls += 1;
      await Promise.resolve();
      yield* events;
    } as ExplainModel,
    { calls: 0 },
  );
  return model;
};

const explained = async (
  explain: ReturnType<typeof createExplainer>,
  signal = new AbortController().signal,
) => {
  const events: ExplainEvent[] = [];
  for await (const event of explain(PROMPT, signal)) events.push(event);
  return events;
};

const USAGE = { inputTokens: 40, outputTokens: 12 };

describe("createExplainer", () => {
  it("streams the model's text, then its tokens and the numbers it has that the prompt doesn't", async () => {
    const model = scripted(
      { type: "text", text: "The Location Score is 62, " },
      { type: "text", text: "not 70." },
      { type: "end", usage: USAGE, stopReason: "end_turn" },
    );

    expect(
      await explained(createExplainer(model, "claude-sonnet-5-5")),
    ).toEqual([
      { type: "text", text: "The Location Score is 62, " },
      { type: "text", text: "not 70." },
      {
        type: "done",
        usage: USAGE,
        cached: false,
        truncated: false,
        unverifiedNumbers: ["70"],
      },
    ]);
  });

  it("gives a finished answer again from memory, whole, without asking the model, but not to another model", async () => {
    const model = scripted(
      { type: "text", text: "Part one, " },
      { type: "text", text: "part two." },
      { type: "end", usage: USAGE, stopReason: "end_turn" },
    );
    const explain = createExplainer(model, "claude-sonnet-5-5");

    await explained(explain);
    const again = await explained(explain);

    expect(again).toEqual([
      { type: "text", text: "Part one, part two." },
      {
        type: "done",
        usage: USAGE,
        cached: true,
        truncated: false,
        unverifiedNumbers: [],
      },
    ]);
    expect(model.calls).toBe(1);
  });

  it("says when the answer stopped at its length limit", async () => {
    const model = scripted(
      { type: "text", text: "It goes on and" },
      { type: "end", usage: USAGE, stopReason: "max_tokens" },
    );

    expect((await explained(createExplainer(model, "m"))).at(-1)).toMatchObject(
      { type: "done", truncated: true },
    );
  });

  it("says the model declined, keeping nothing", async () => {
    const model = scripted({
      type: "end",
      usage: USAGE,
      stopReason: "refusal",
    });
    const explain = createExplainer(model, "m");

    expect(await explained(explain)).toEqual([
      { type: "error", error: "The model declined to answer this question." },
    ]);
    await explained(explain);
    expect(model.calls).toBe(2);
  });

  it("says Anthropic didn't answer when the model fails, or ends without finishing", async () => {
    const failing = async function* stream(): AsyncGenerator<ModelEvent> {
      await Promise.resolve();
      yield { type: "text", text: "Half" };
      throw new Error("socket hang up");
    };
    const unfinished = scripted({ type: "text", text: "Half" });

    for (const model of [failing, unfinished]) {
      expect((await explained(createExplainer(model, "m"))).at(-1)).toEqual({
        type: "error",
        error: "Anthropic didn't answer. Try again shortly.",
      });
    }
  });

  it("says nothing more once the question is abandoned", async () => {
    const controller = new AbortController();
    const abandoned = async function* stream(): AsyncGenerator<ModelEvent> {
      await Promise.resolve();
      controller.abort();
      if (!controller.signal.aborted) yield { type: "text", text: "Never" };
      throw new Error("aborted");
    };

    expect(
      await explained(createExplainer(abandoned, "m"), controller.signal),
    ).toEqual([]);
  });
});
