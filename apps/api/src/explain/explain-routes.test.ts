import { describe, expect, it, vi } from "vitest";

import {
  LAND_OPPORTUNITY_WORDING,
  LAND_SALE_LABEL,
  isApiErrorResponse,
  isExplainEvent,
  isExplainStatusResponse,
  type ExplainEvent,
  type ExplainRequest,
} from "@location-scout/shared";

import { EXPLAIN_OFF } from "../app";
import { readConfig } from "../config";
import { QUESTION_HINT, modeHint } from "../routes";
import { SCORING_CONFIG } from "../scoring/config";
import { createRateLimiter } from "../sources/rate-limiter";
import {
  ANTHROPIC_MESSAGES_URL,
  MADE_UP_NUMBER,
  MADE_UP_NUMBER_QUESTION,
  TEST_ANTHROPIC_API_KEY,
  stubAnthropic,
} from "../testing/anthropic-stub";
import { PREPARED_DATA_FIXTURE, testApp } from "../testing/app";
import { noNetwork } from "../testing/fetch-stubs";
import { recordedFetch } from "../testing/fixture-fetch";

interface Sent {
  model: string;
  system: string;
  messages: { role: string; content: string }[];
}

/**
 * Every Data Source answers from its recording, and the stubbed model at
 * once. What the model is sent is kept, to check, and so is every call.
 */
const recorded = () => {
  const sent: Sent[] = [];
  const keys: (string | null)[] = [];
  const fetchFn = vi.fn<typeof fetch>((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (!url.startsWith(ANTHROPIC_MESSAGES_URL)) {
      return recordedFetch(input, init);
    }
    sent.push(
      JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Sent,
    );
    keys.push(new Headers(init?.headers).get("x-api-key"));
    const answer = stubAnthropic(url, init, { partMs: 0 });
    return answer ? Promise.resolve(answer) : Promise.reject(new Error(url));
  });
  return { fetch: fetchFn, sent, keys };
};

const explainingApp = (
  fetchFn: typeof fetch,
  options: { anthropicApiKey?: string | null; anthropicModel?: string } = {},
) =>
  testApp({
    fetch: fetchFn,
    planItLimiter: createRateLimiter(0),
    preparedData: PREPARED_DATA_FIXTURE,
    anthropicApiKey: TEST_ANTHROPIC_API_KEY,
    ...options,
  });

const NG17_1AA = {
  lat: 53.123664,
  lng: -1.264078,
  radius: 0.5,
  postcode: "NG17 1AA",
} as const;

const SUTTON_PARKWAY = { lat: 53.1145, lng: -1.246, radius: 0.25 } as const;

const ask = (app: ReturnType<typeof testApp>, body: unknown) =>
  app.request("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** The events in a server-sent event stream. */
const eventsOf = async (response: Response): Promise<ExplainEvent[]> => {
  const events = (await response.text())
    .split("\n\n")
    .filter((event) => event.startsWith("data: "))
    .map((event): unknown => JSON.parse(event.slice("data: ".length)));
  expect(events.every(isExplainEvent)).toBe(true);
  return events as ExplainEvent[];
};

const answerOf = (events: readonly ExplainEvent[]) =>
  events.map((event) => (event.type === "text" ? event.text : "")).join("");

const overview: ExplainRequest = {
  ...NG17_1AA,
  mode: "general",
  subject: { kind: "overview" },
  question: "What are the biggest risks here?",
};

/** The figures the model was sent, from its message. */
const figuresSent = (sent: Sent | undefined): Record<string, unknown> => {
  const content = sent?.messages[0]?.content ?? "";
  const json = content.slice(
    content.indexOf("{"),
    content.lastIndexOf("\n\nThe question: "),
  );
  return JSON.parse(json) as Record<string, unknown>;
};

describe("GET /api/explain", () => {
  it("says AI Explanations are off without ANTHROPIC_API_KEY, calling nothing", async () => {
    const others = noNetwork();
    const app = testApp({ fetch: others });

    const response = await app.request("/api/explain");

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isExplainStatusResponse(body)).toBe(true);
    expect(body).toEqual({ enabled: false });
    expect(others).not.toHaveBeenCalled();
  });

  it("with the key, gives the model and the questions offered, each Scout Mode's own first for the Overview, calling nothing", async () => {
    const others = noNetwork();
    const { anthropicApiKey } = readConfig({
      NOMINATIM_USER_AGENT: "location-scout-test (tests@example.com)",
      ANTHROPIC_API_KEY: ` ${TEST_ANTHROPIC_API_KEY} `,
    });
    const app = testApp({ fetch: others, anthropicApiKey });

    const response = await app.request("/api/explain");

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isExplainStatusResponse(body)).toBe(true);
    expect(body).toMatchObject({
      enabled: true,
      model: "claude-sonnet-5-5",
      questions: {
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
      },
    });
    const { questions } = body as { questions: { overview: object } };
    expect(questions.overview).toMatchObject({
      general: [
        "What is it like here?",
        "What are the biggest risks here?",
        "What stands out most in these figures?",
      ],
      homebuyer: [
        "Should I buy a home here to live in?",
        "Is this area good for families?",
        "What are the biggest risks here?",
        "What stands out most in these figures?",
      ],
      "business-cafe": [
        "Could I open a café here?",
        "What are the biggest risks here?",
        "What stands out most in these figures?",
      ],
    });
    // Every Scout Mode has its questions, so one added by config does too.
    expect(Object.keys(questions.overview)).toEqual(
      SCORING_CONFIG.modes.map(({ id }) => id),
    );
    expect(others).not.toHaveBeenCalled();
  });

  it("names the model ANTHROPIC_MODEL names", async () => {
    const app = testApp({
      anthropicApiKey: TEST_ANTHROPIC_API_KEY,
      anthropicModel: "claude-opus-5-5",
    });

    const body: unknown = await (await app.request("/api/explain")).json();

    expect(body).toMatchObject({ model: "claude-opus-5-5" });
  });

  it("gives the key to nobody", async () => {
    const app = testApp({ anthropicApiKey: TEST_ANTHROPIC_API_KEY });

    for (const path of [
      "/api/explain",
      "/api/health",
      "/api/modes",
      "/api/street-view",
      "/api/openapi.json",
    ]) {
      const response = await app.request(path);
      expect(await response.text()).not.toContain(TEST_ANTHROPIC_API_KEY);
    }
  });
});

describe("POST /api/explain", () => {
  it("is off without ANTHROPIC_API_KEY: nothing calls Anthropic, or any Data Source", async () => {
    const others = noNetwork();
    const app = testApp({ fetch: others });

    const response = await ask(app, overview);

    expect(response.status).toBe(404);
    const body: unknown = await response.json();
    expect(isApiErrorResponse(body)).toBe(true);
    expect(body).toEqual({ error: EXPLAIN_OFF });
    expect(others).not.toHaveBeenCalled();
  });

  it("streams the Overview's explanation as it is written, then its tokens, with the user's own key and the model's name", async () => {
    const { fetch: fetchFn, sent, keys } = recorded();
    const app = explainingApp(fetchFn);

    const response = await ask(app, overview);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    const events = await eventsOf(response);
    expect(events.map(({ type }) => type)).toEqual([
      "text",
      "text",
      "text",
      "done",
    ]);
    expect(answerOf(events)).toBe(
      'The stubbed model was asked "What are the biggest risks here?". It writes its answer a part at a time, from the figures above alone.',
    );
    expect(events.at(-1)).toEqual({
      type: "done",
      usage: {
        inputTokens: expect.any(Number) as number,
        outputTokens: 33,
      },
      cached: false,
      truncated: false,
      unverifiedNumbers: [],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.model).toBe("claude-sonnet-5-5");
    expect(keys).toEqual([TEST_ANTHROPIC_API_KEY]);
  });

  it("sends the model only the Overview's figures: its Highlights, scores with their breakdowns and every Layer's statistics, without Features or coordinates of theirs", async () => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn);

    await eventsOf(await ask(app, overview));

    const [prompt] = sent;
    expect(prompt?.system).toContain(
      "Never introduce a number that isn't in them",
    );
    expect(prompt?.system).toContain("unavailable");
    // The instructions hold no number of their own.
    expect(prompt?.system).not.toMatch(/\d/);
    expect(prompt?.messages).toHaveLength(1);
    expect(prompt?.messages[0]?.content).toMatch(
      /\n\nThe question: What are the biggest risks here\?$/,
    );
    const figures = figuresSent(prompt);
    expect(figures).toMatchObject({
      about: "The Location Overview of a Search Area",
      searchArea: {
        location: { latitude: 53.123664, longitude: -1.264078 },
        searchRadiusMiles: 0.5,
        localGeography: { postcode: "NG17 1AA", localAuthority: "Ashfield" },
      },
      scoutMode: { name: "General", question: "What is it like here?" },
      locationScore: {
        score: 62,
        outOf: 100,
        weighedBy: "the General Scout Mode's weights",
      },
    });
    expect(figures.highlights).toContainEqual({
      level: "concern",
      text: "High crime: 224 crimes a year per 1,000 residents",
      layer: "crime",
    });
    expect(figures.categoryScores).toContainEqual(
      expect.objectContaining({ category: "Safety", score: 0 }),
    );
    expect(
      (figures.layers as { layer: string }[]).map(({ layer }) => layer),
    ).toEqual([
      "crime",
      "planning",
      "amenities",
      "schools",
      "transport",
      "green-space",
      "property",
      "land",
      "demographics",
    ]);
    expect(figures.layers).toContainEqual(
      expect.objectContaining({
        layer: "planning",
        planningApplications: expect.objectContaining({
          provider: "PlanIt",
          statistics: expect.objectContaining({ count: 126 }) as unknown,
        }) as unknown,
      }),
    );
    const content = prompt?.messages[0]?.content ?? "";
    expect(content).not.toContain('"features"');
    expect(content).not.toContain('"location":{"lat"');
    // NG17 1AA's Search Area has no Land Opportunity, so no wording is asked for.
    expect(prompt?.system).not.toContain(LAND_OPPORTUNITY_WORDING);
  });

  it("answers the same question about the same figures from memory, at no cost, calling Anthropic once", async () => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn);

    const first = await eventsOf(await ask(app, overview));
    const again = await eventsOf(await ask(app, overview));
    const otherMode = await eventsOf(
      await ask(app, { ...overview, mode: "homebuyer" }),
    );

    expect(answerOf(again)).toBe(answerOf(first));
    expect(again.at(-1)).toEqual({ ...first.at(-1), cached: true });
    expect(otherMode.at(-1)).toMatchObject({ cached: false });
    expect(sent).toHaveLength(2);
  });

  it("explains a Category Score from its breakdown, its part in the Location Score and its own Layers' statistics", async () => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn);

    const events = await eventsOf(
      await ask(app, {
        ...overview,
        subject: { kind: "category", category: "safety" },
        question: "Why is this score what it is?",
      }),
    );

    expect(events.at(-1)).toMatchObject({ type: "done" });
    const figures = figuresSent(sent[0]);
    expect(figures).toMatchObject({
      about: "The Safety Category Score of a Search Area",
      categoryScore: {
        category: "Safety",
        status: "ok",
        score: 0,
        outOf: 100,
        breakdown: [
          expect.objectContaining({
            input: "Crimes a year per 1,000 residents",
            value: 223.6,
          }),
          expect.objectContaining({ value: 5.9 }),
        ],
      },
      locationScore: { score: 62 },
    });
    expect(
      (figures.layers as { layer: string }[]).map(({ layer }) => layer),
    ).toEqual(["crime"]);
    expect(sent[0]?.system).not.toContain(LAND_OPPORTUNITY_WORDING);
  });

  it("weighs the Location Score by the user's own weights when they chose some, as it is shown", async () => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn);

    await eventsOf(
      await ask(app, {
        ...overview,
        weights: {
          safety: 40,
          amenities: 12,
          schools: 8,
          transport: 12,
          "green-space": 8,
          "property-activity": 8,
          "development-activity": 4,
          "planning-freedom": 8,
        },
      }),
    );

    // (0×40 + 100×12 + 87×8 + 88×12 + 100×8 + 40×8 + 54×4 + 80×8) ÷ 100
    // = 49.3
    expect(figuresSent(sent[0])).toMatchObject({
      locationScore: {
        score: 49,
        weighedBy: "the user's own weights for the General Scout Mode",
      },
    });
  });

  it("explains a Land Opportunity from its tags, Ownership Category and the land sales near it, telling the model to repeat the Land Opportunity wording, which it does", async () => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn);

    const events = await eventsOf(
      await ask(app, {
        ...SUTTON_PARKWAY,
        mode: "development",
        subject: { kind: "land-opportunity", parcelId: "E07000170-2" },
        question: "What should I check before pursuing it?",
      }),
    );

    expect(sent[0]?.system).toContain(
      `repeat this wording exactly, as a paragraph of its own: "${LAND_OPPORTUNITY_WORDING}"`,
    );
    expect(sent[0]?.system).toContain(
      "Never call it available, for sale, unowned, unclaimed or free.",
    );
    expect(figuresSent(sent[0])).toMatchObject({
      about: "One Land Opportunity",
      wording: LAND_OPPORTUNITY_WORDING,
      scoutMode: { name: "Development" },
      landOpportunity: {
        council: "Ashfield",
        areaAcres: 48.241,
        possiblyUnregistered: false,
        ownershipCategory: "other-registered",
        estimatedHomes: 351,
      },
      nearbyLandSales: {
        label: LAND_SALE_LABEL,
        status: "ok",
        found: { count: 76, medianPrice: 207000 },
      },
      // PlanIt has no recording for Sutton Parkway's Search Area.
      nearbyPlanningApplications: { status: "unavailable", found: null },
    });
    expect(answerOf(events)).toContain(LAND_OPPORTUNITY_WORDING);
  });

  it("tells the model to repeat the Land Opportunity wording about an Overview whose Search Area has Land Opportunities", async () => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn);

    await eventsOf(
      await ask(app, {
        ...SUTTON_PARKWAY,
        mode: "development",
        subject: { kind: "overview" },
        question: "What would limit building here?",
      }),
    );

    expect(figuresSent(sent[0]).layers).toContainEqual(
      expect.objectContaining({
        layer: "land",
        status: "ok",
        statistics: expect.objectContaining({ count: 1 }) as unknown,
      }),
    );
    expect(sent[0]?.system).toContain(LAND_OPPORTUNITY_WORDING);
  });

  it("names any number in the answer that the figures don't have", async () => {
    const { fetch: fetchFn } = recorded();
    const app = explainingApp(fetchFn);

    const events = await eventsOf(
      await ask(app, { ...overview, question: MADE_UP_NUMBER_QUESTION }),
    );

    expect(answerOf(events)).toContain(MADE_UP_NUMBER);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      unverifiedNumbers: [MADE_UP_NUMBER],
    });
  });

  it("says Anthropic refused the key, as an event, keeping nothing", async () => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn, {
      anthropicApiKey: "sk-ant-not-the-tests-key",
    });

    const first = await eventsOf(await ask(app, overview));
    await eventsOf(await ask(app, overview));

    expect(first).toEqual([
      {
        type: "error",
        error:
          "Anthropic refused ANTHROPIC_API_KEY. Check the key in .env, and restart the API.",
      },
    ]);
    // A refusal isn't kept, so the second question is asked again.
    expect(sent.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["an empty question", { question: "   " }, QUESTION_HINT],
    ["a question too long", { question: "Why? ".repeat(101) }, QUESTION_HINT],
    [
      "a Scout Mode it doesn't have",
      { mode: "astrology" },
      modeHint(SCORING_CONFIG.modes),
    ],
    [
      "a Category Score the Scout Mode doesn't score",
      { subject: { kind: "category", category: "demand" } },
      "The General Scout Mode doesn't score Demand.",
    ],
  ])("refuses %s, calling no model", async (_label, change, error) => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn);

    const response = await ask(app, { ...overview, ...change });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(sent).toEqual([]);
  });

  it("says when no Land Coverage Area has the Land Opportunity, calling no model", async () => {
    const { fetch: fetchFn, sent } = recorded();
    const app = explainingApp(fetchFn);

    const response = await ask(app, {
      ...SUTTON_PARKWAY,
      mode: "development",
      subject: { kind: "land-opportunity", parcelId: "E07000170-9999" },
      question: "Why does this land warrant investigation?",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining(
        "No Land Coverage Area has a Land Parcel E07000170-9999",
      ) as unknown,
    });
    expect(sent).toEqual([]);
  });
});
