import { describe, expect, it } from "vitest";

import {
  isExplainEvent,
  isExplainStatusResponse,
  isExplainSubject,
} from "./explain";

const QUESTIONS = {
  overview: {
    general: ["What is it like here?", "What are the biggest risks here?"],
    "business-cafe": ["Could I open a café here?"],
  },
  category: ["Why is this score what it is?"],
  "land-opportunity": ["What should I check before pursuing it?"],
};

describe("isExplainStatusResponse", () => {
  it.each([
    ["AI Explanations off", { enabled: false }],
    [
      "on, with the model and the questions, each Scout Mode's own",
      { enabled: true, model: "claude-sonnet-5-5", questions: QUESTIONS },
    ],
  ])("accepts %s", (_label, value) => {
    expect(isExplainStatusResponse(value)).toBe(true);
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
    ["off with a model", { enabled: false, model: "claude-sonnet-5-5" }],
    ["on without a model", { enabled: true, questions: QUESTIONS }],
    [
      "on with the Overview's questions for a Scout Mode that isn't one",
      {
        enabled: true,
        model: "claude-sonnet-5-5",
        questions: { ...QUESTIONS, overview: { "Not a mode": ["Why?"] } },
      },
    ],
    [
      "on with the Overview's questions not by Scout Mode",
      {
        enabled: true,
        model: "claude-sonnet-5-5",
        questions: { ...QUESTIONS, overview: ["Why?"] },
      },
    ],
    [
      "on without the Land Opportunity's questions",
      {
        enabled: true,
        model: "claude-sonnet-5-5",
        questions: { overview: {}, category: [] },
      },
    ],
    [
      "on with an empty question",
      {
        enabled: true,
        model: "claude-sonnet-5-5",
        questions: { ...QUESTIONS, category: [""] },
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isExplainStatusResponse(value)).toBe(false);
  });
});

describe("isExplainSubject", () => {
  it.each([
    ["the Overview", { kind: "overview" }],
    ["a Category Score", { kind: "category", category: "safety" }],
    [
      "a Land Opportunity",
      { kind: "land-opportunity", parcelId: "E07000170-2" },
    ],
  ])("accepts %s", (_label, value) => {
    expect(isExplainSubject(value)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a kind it doesn't know", { kind: "comparison" }],
    ["a category that isn't one", { kind: "category", category: "crime" }],
    ["a Land Opportunity without its id", { kind: "land-opportunity" }],
    ["the Overview with more", { kind: "overview", category: "safety" }],
  ])("rejects %s", (_label, value) => {
    expect(isExplainSubject(value)).toBe(false);
  });
});

describe("isExplainEvent", () => {
  it.each([
    ["text as it is written", { type: "text", text: "Crime is high" }],
    [
      "the end, with its tokens",
      {
        type: "done",
        usage: { inputTokens: 4210, outputTokens: 180 },
        cached: false,
        truncated: false,
        unverifiedNumbers: [],
      },
    ],
    [
      "the end of an answer with a number not in its input",
      {
        type: "done",
        usage: { inputTokens: 4210, outputTokens: 180 },
        cached: true,
        truncated: false,
        unverifiedNumbers: ["42"],
      },
    ],
    ["an error", { type: "error", error: "Anthropic didn't answer." }],
  ])("accepts %s", (_label, value) => {
    expect(isExplainEvent(value)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a type it doesn't know", { type: "ping" }],
    ["text that isn't a string", { type: "text", text: 4 }],
    [
      "the end with tokens that aren't counts",
      {
        type: "done",
        usage: { inputTokens: -1, outputTokens: 1.5 },
        cached: false,
        truncated: false,
        unverifiedNumbers: [],
      },
    ],
    [
      "the end without the numbers checked",
      {
        type: "done",
        usage: { inputTokens: 1, outputTokens: 1 },
        cached: false,
        truncated: false,
      },
    ],
    ["an empty error", { type: "error", error: "" }],
  ])("rejects %s", (_label, value) => {
    expect(isExplainEvent(value)).toBe(false);
  });
});
