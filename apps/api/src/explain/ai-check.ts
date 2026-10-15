import {
  LAND_OPPORTUNITY_WORDING,
  isExplainEvent,
  isExplainStatusResponse,
  type ExplainRequest,
} from "@location-scout/shared";

import { PREPARED_DATA_FIXTURE, testApp } from "../testing/app";
import { ANTHROPIC_MESSAGES_URL } from "../testing/anthropic-stub";
import { recordedFetch } from "../testing/fixture-fetch";
import { createRateLimiter } from "../sources/rate-limiter";
import { checkNumbers } from "./number-check";
import { promptText } from "./prompt";

/*
 * The opt-in AI check (PRD FR-11.6, NFR-3.5), run by `pnpm test:ai`: it
 * asks a model each question offered about recorded inputs, the figures the
 * fixture-backed API gives for NG17 1AA and Sutton Parkway's Land
 * Opportunity from its recordings, and fails if an answer has a number
 * that isn't in what the model was sent, or leaves out the Land Opportunity
 * wording its instructions require (FR-5.7).
 */

/** A subject in a Search Area, asked about in each question it is offered. */
export interface AiCheckCase {
  name: string;
  request: Omit<ExplainRequest, "question">;
  /** Questions to ask instead of those offered. */
  questions?: string[];
}

const NG17_1AA = {
  lat: 53.123664,
  lng: -1.264078,
  radius: 0.5,
  postcode: "NG17 1AA",
} as const;

const SUTTON_PARKWAY = { lat: 53.1145, lng: -1.246, radius: 0.25 } as const;

/** The recorded inputs the check asks about. */
export const AI_CHECK_CASES: readonly AiCheckCase[] = [
  {
    name: "NG17 1AA's Location Overview in General",
    request: { ...NG17_1AA, mode: "general", subject: { kind: "overview" } },
  },
  {
    name: "NG17 1AA's Location Overview in Homebuyer",
    request: { ...NG17_1AA, mode: "homebuyer", subject: { kind: "overview" } },
  },
  {
    name: "NG17 1AA's Location Overview in Business: Café",
    request: {
      ...NG17_1AA,
      mode: "business-cafe",
      subject: { kind: "overview" },
    },
  },
  {
    name: "NG17 1AA's Safety score in General",
    request: {
      ...NG17_1AA,
      mode: "general",
      subject: { kind: "category", category: "safety" },
    },
  },
  {
    name: "NG17 1AA's Schools score in Homebuyer",
    request: {
      ...NG17_1AA,
      mode: "homebuyer",
      subject: { kind: "category", category: "schools" },
    },
  },
  {
    name: "Sutton Parkway's farm field, a Land Opportunity, in Development",
    request: {
      ...SUTTON_PARKWAY,
      mode: "development",
      subject: { kind: "land-opportunity", parcelId: "E07000170-2" },
    },
  },
];

/** What one question about one case found. */
export interface AiCheckResult {
  case: string;
  question: string;
  answer: string;
  /** Each number in the answer that isn't in what the model was sent. */
  unverifiedNumbers: string[];
  /** The model was told to repeat the Land Opportunity wording, and didn't. */
  wordingMissing: boolean;
  /** Why no answer came, if none did. */
  error: string | null;
  inputTokens: number;
  outputTokens: number;
}

export const passed = (result: AiCheckResult) =>
  result.error === null &&
  result.unverifiedNumbers.length === 0 &&
  !result.wordingMissing;

/** The events in a server-sent event stream's body. */
const eventsIn = (body: string) =>
  body
    .split("\n\n")
    .filter((event) => event.startsWith("data: "))
    .map((event): unknown => JSON.parse(event.slice("data: ".length)));

interface Sent {
  system: string;
  messages: { content: string }[];
}

/**
 * Asks the model each case's questions through the fixture-backed API, so
 * every Data Source answers from its recording, and only the model is
 * called through `modelFetch`: Anthropic itself, or a stub in the tests.
 */
export const runAiCheck = async ({
  apiKey,
  model,
  modelFetch,
  cases = AI_CHECK_CASES,
  onResult = () => undefined,
}: {
  apiKey: string;
  model: string;
  modelFetch: typeof fetch;
  cases?: readonly AiCheckCase[];
  onResult?: (result: AiCheckResult) => void;
}): Promise<AiCheckResult[]> => {
  // What the model is sent, the input each answer is checked against.
  const sent: Sent[] = [];
  const app = testApp({
    fetch: (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!url.startsWith(ANTHROPIC_MESSAGES_URL)) {
        return recordedFetch(input, init);
      }
      if (typeof init?.body === "string") {
        sent.push(JSON.parse(init.body) as Sent);
      }
      return modelFetch(input, init);
    },
    planItLimiter: createRateLimiter(0),
    preparedData: PREPARED_DATA_FIXTURE,
    anthropicApiKey: apiKey,
    anthropicModel: model,
  });

  const results: AiCheckResult[] = [];
  for (const checked of cases) {
    const status: unknown = await (await app.request("/api/explain")).json();
    if (!isExplainStatusResponse(status) || !status.enabled) {
      throw new Error("AI Explanations are off in the check's own API.");
    }
    const { kind } = checked.request.subject;
    const questions =
      checked.questions ??
      (kind === "overview"
        ? (status.questions.overview[checked.request.mode] ?? [])
        : status.questions[kind]);
    for (const question of questions) {
      const asked = sent.length;
      const response = await app.request("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...checked.request, question }),
      });
      const result: AiCheckResult = {
        case: checked.name,
        question,
        answer: "",
        unverifiedNumbers: [],
        wordingMissing: false,
        error: null,
        inputTokens: 0,
        outputTokens: 0,
      };
      if (!response.ok) {
        result.error = `The API answered ${String(response.status)}: ${await response.text()}`;
      } else {
        for (const event of eventsIn(await response.text())) {
          if (!isExplainEvent(event)) continue;
          if (event.type === "text") result.answer += event.text;
          if (event.type === "error") result.error = event.error;
          if (event.type === "done") {
            result.inputTokens = event.usage.inputTokens;
            result.outputTokens = event.usage.outputTokens;
          }
        }
      }
      const prompt = sent.length > asked ? sent.at(-1) : undefined;
      if (prompt && result.error === null) {
        const input = promptText({
          system: prompt.system,
          user: prompt.messages.map(({ content }) => content).join("\n"),
        });
        result.unverifiedNumbers = checkNumbers(
          result.answer,
          input,
        ).unverified;
        result.wordingMissing =
          prompt.system.includes(LAND_OPPORTUNITY_WORDING) &&
          !result.answer.includes(LAND_OPPORTUNITY_WORDING);
      } else if (result.error === null) {
        result.error = "Nothing was sent to the model.";
      }
      results.push(result);
      onResult(result);
    }
  }
  return results;
};
