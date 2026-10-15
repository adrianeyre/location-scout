import { describe, expect, it } from "vitest";

import { LAND_OPPORTUNITY_WORDING } from "@location-scout/shared";

import {
  MADE_UP_NUMBER,
  MADE_UP_NUMBER_QUESTION,
  TEST_ANTHROPIC_API_KEY,
  stubAnthropic,
} from "../testing/anthropic-stub";
import { SCORING_CONFIG } from "../scoring/config";
import { AI_CHECK_CASES, passed, runAiCheck } from "./ai-check";
import { explainQuestions } from "./questions";

/** The stubbed model, answering at once. */
const stubModel: typeof fetch = (input, init) => {
  const url = input instanceof Request ? input.url : input.toString();
  const response = stubAnthropic(url, init, { partMs: 0 });
  return response
    ? Promise.resolve(response)
    : Promise.reject(new Error("Only the model may be called."));
};

const [overview] = AI_CHECK_CASES;
const land = AI_CHECK_CASES.find(
  ({ request }) => request.subject.kind === "land-opportunity",
);

describe("runAiCheck", () => {
  it("asks each question offered about each recorded input, and passes answers with only the numbers they were sent", async () => {
    const results = await runAiCheck({
      apiKey: TEST_ANTHROPIC_API_KEY,
      model: "claude-sonnet-5-5",
      modelFetch: stubModel,
    });

    // Every question offered about each, the Overview's first its Scout
    // Mode's own.
    const questions = explainQuestions(SCORING_CONFIG.modes);
    const offered = AI_CHECK_CASES.flatMap(({ request }) =>
      request.subject.kind === "overview"
        ? (questions.overview[request.mode] ?? [])
        : questions[request.subject.kind],
    );
    expect(offered.length).toBeGreaterThanOrEqual(AI_CHECK_CASES.length * 3);
    expect(results.map(({ question }) => question)).toEqual(offered);
    expect(results.find(({ case: name }) => name === overview?.name)).toEqual(
      expect.objectContaining({ question: "What is it like here?" }),
    );
    expect(results.filter(passed)).toEqual(results);
    for (const result of results) {
      expect(result.answer).toContain(result.question);
      expect(result.inputTokens).toBeGreaterThan(0);
    }
  }, 30_000);

  it("fails an answer with a number the model wasn't sent, naming it", async () => {
    const [result] = await runAiCheck({
      apiKey: TEST_ANTHROPIC_API_KEY,
      model: "claude-sonnet-5-5",
      modelFetch: stubModel,
      cases: overview
        ? [{ ...overview, questions: [MADE_UP_NUMBER_QUESTION] }]
        : [],
    });

    expect(result?.unverifiedNumbers).toEqual([MADE_UP_NUMBER]);
    expect(result && passed(result)).toBe(false);
  });

  it("fails an answer about a Land Opportunity that leaves out its wording", async () => {
    const forgetful: typeof fetch = (input, init) => {
      // The model sees the instruction, but answers as if it hadn't.
      const body = JSON.parse(
        typeof init?.body === "string" ? init.body : "{}",
      ) as { system: string };
      return stubModel(input, {
        ...init,
        body: JSON.stringify({
          ...body,
          system: body.system.replaceAll(LAND_OPPORTUNITY_WORDING, ""),
        }),
      });
    };

    const results = await runAiCheck({
      apiKey: TEST_ANTHROPIC_API_KEY,
      model: "claude-sonnet-5-5",
      modelFetch: forgetful,
      cases: land ? [land] : [],
    });

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.wordingMissing).toBe(true);
      expect(passed(result)).toBe(false);
    }
  });

  it("fails each question when the model refuses the key", async () => {
    const results = await runAiCheck({
      apiKey: "sk-ant-not-the-tests-key",
      model: "claude-sonnet-5-5",
      modelFetch: stubModel,
      cases: overview ? [overview] : [],
    });

    for (const result of results) {
      expect(result.error).toBe(
        "Anthropic refused ANTHROPIC_API_KEY. Check the key in .env, and restart the API.",
      );
      expect(passed(result)).toBe(false);
    }
  });
});
