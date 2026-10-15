import { describe, expect, it, vi } from "vitest";

import {
  LAND_OPPORTUNITY_WORDING,
  isLandLayerResponse,
} from "@location-scout/shared";

import { countingFetch, serveForBench, type Ask } from "../bench/bench-runs";
import { SCORING_CONFIG } from "../scoring/config";
import { createRateLimiter } from "../sources/rate-limiter";
import { PREPARED_DATA_FIXTURE, testApp } from "../testing/app";
import { recordedFetch } from "../testing/fixture-fetch";
import {
  LOCATION_KINDS,
  SURVEY_LOCATIONS,
  type SurveyLocation,
} from "./locations";
import {
  UNREGISTERED_SAMPLE,
  askModes,
  categorySpread,
  runSurvey,
  sampleUnregistered,
  spreadSample,
  surveyLocation,
  surveyMarkdown,
  surveyedInFull,
  type LocationSurvey,
  type SurveyTiming,
} from "./survey-runs";

const NG17_1AA: SurveyLocation = {
  kind: "town centre",
  name: "Sutton-in-Ashfield",
  postcode: "NG17 1AA",
};

/** A postcode in England the recordings have no answer for. */
const UNRECORDED: SurveyLocation = {
  kind: "village",
  name: "Bibury, Cotswolds",
  postcode: "GL7 5NW",
};

/** Never waits: the queued Planning Applications are asked for again at once. */
const NO_WAIT: SurveyTiming = {
  pollMs: 5000,
  applicationsTimeoutMs: 60_000,
  sleep: () => Promise.resolve(),
};

/**
 * Serves the app as the end-to-end tests' fixture-backed API is, with no
 * waits between requests, and runs `use` against it over HTTP.
 */
const withRecordedApi = async <T>(
  use: (ask: Ask, sent: () => number) => Promise<T>,
) => {
  const counted = countingFetch(recordedFetch);
  const app = testApp({
    fetch: counted.fetch,
    policeLimiter: createRateLimiter(0),
    overpassLimiter: createRateLimiter(0),
    planItLimiter: createRateLimiter(0),
    preparedData: PREPARED_DATA_FIXTURE,
  });
  const { ask, close } = await serveForBench(app);
  try {
    return await use(ask, counted.sent);
  } finally {
    await close();
  }
};

/** `ask`, answering the Planning Layer's first `times` requests with its Planning Applications queued. */
const queuedFirst = (ask: Ask, times: number) => {
  let planning = 0;
  const asked: Ask = async (path) => {
    const answer = await ask(path);
    if (!path.startsWith("/api/area/planning?")) return answer;
    planning += 1;
    if (planning > times) return answer;
    const body = answer.body as { applications: { status: string } };
    return {
      ...answer,
      body: {
        ...body,
        applications: { ...body.applications, status: "queued" },
      },
    };
  };
  return { ask: asked, planningAsks: () => planning };
};

describe("the Locations surveyed", () => {
  it("are 20, four of each kind, each a different postcode", () => {
    expect(SURVEY_LOCATIONS).toHaveLength(20);
    for (const kind of LOCATION_KINDS) {
      expect(SURVEY_LOCATIONS.filter((l) => l.kind === kind)).toHaveLength(4);
    }
    expect(new Set(SURVEY_LOCATIONS.map((l) => l.postcode)).size).toBe(20);
  });

  it("start with NG17 1AA, which the recordings cover", () => {
    expect(SURVEY_LOCATIONS[0]).toEqual(NG17_1AA);
  });
});

// Each asks the recorded API for every Scout Mode's scores and Highlights.
describe("surveyLocation", { timeout: 30_000 }, () => {
  it("records NG17 1AA's Layers, scores in every Scout Mode, Highlights and land, as recorded", async () => {
    const survey = await withRecordedApi(async (ask) =>
      surveyLocation(ask, NG17_1AA, await askModes(ask), NO_WAIT),
    );

    expect(survey.error).toBeNull();
    expect(survey.localAuthority).toBe("Ashfield");
    expect(survey.council).toBe("Ashfield");
    expect(survey.loadMs).toBeGreaterThan(0);
    expect(survey.slowest).not.toBeNull();
    expect(Object.values(survey.layers)).toHaveLength(9);
    expect(Object.values(survey.layers).every((s) => s === "ok")).toBe(true);
    expect(survey.applications).toBe("ok");
    // As scores.spec.ts and scout-modes.spec.ts check them in the page.
    expect(survey.locationScores).toMatchObject({
      general: 62,
      homebuyer: 67,
      "buy-to-let": 62,
      investment: 60,
      development: 67,
      "business-cafe": 59,
    });
    expect(Object.keys(survey.locationScores)).toHaveLength(
      SCORING_CONFIG.modes.length,
    );
    const score = (id: string) =>
      survey.categories.find((category) => category.id === id)?.score;
    expect(score("safety")).toBe(0);
    expect(score("schools")).toBe(87);
    expect(score("demand")).toBe(30);
    expect(score("footfall")).toBe(81);
    expect(survey.categories.map(({ id }) => id)).not.toContain("competition");
    expect(survey.competition["business-cafe"]?.score).toBe(59);
    expect(survey.competition["business-gym"]?.score).toBe(78);
    expect(survey.competition.general).toBeUndefined();
    expect(survey.highlights.general).toHaveLength(7);
    expect(survey.highlights.general?.[0]?.text).toBe(
      "High crime: 224 crimes a year per 1,000 residents",
    );
    expect(survey.land).toEqual({ count: 0, possiblyUnregistered: 0 });
  });

  it("records why a Location couldn't be surveyed, asking nothing more about it", async () => {
    const survey = await withRecordedApi(async (ask, sent) => {
      const modes = await askModes(ask);
      const before = sent();
      const found = await surveyLocation(ask, UNRECORDED, modes, NO_WAIT);
      expect(sent() - before).toBe(1);
      return found;
    });

    expect(survey.error).toBe(
      "/api/geocode didn't find GL7 5NW: We couldn't find the postcode GL7 5NW.",
    );
    expect(survey.locationScores).toEqual({});
  });

  it("asks for the Planning Layer again while its Planning Applications wait for PlanIt, then scores them", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const survey = await withRecordedApi(async (recorded) => {
      const { ask, planningAsks } = queuedFirst(recorded, 3);
      const found = await surveyLocation(ask, NG17_1AA, await askModes(ask), {
        ...NO_WAIT,
        sleep,
      });
      expect(planningAsks()).toBe(4);
      return found;
    });

    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(NO_WAIT.pollMs);
    expect(survey.applications).toBe("ok");
    expect(
      survey.categories.find(({ id }) => id === "development-activity")?.score,
    ).toBe(54);
  });

  it("stops waiting for PlanIt at its limit, saying the Planning Applications are still queued", async () => {
    const survey = await withRecordedApi(async (recorded) => {
      const { ask } = queuedFirst(recorded, Infinity);
      return surveyLocation(ask, NG17_1AA, await askModes(ask), {
        ...NO_WAIT,
        applicationsTimeoutMs: 0,
      });
    });

    expect(survey.applications).toBe("queued");
  });

  it("asks only the General Scout Mode when a Layer is unavailable, as its failed Data Source isn't cached", async () => {
    const scored: string[] = [];
    const survey = await withRecordedApi(async (recorded) => {
      const ask: Ask = async (path) => {
        if (path.startsWith("/api/scores?")) scored.push(path);
        const answer = await recorded(path);
        return path.startsWith("/api/area/amenities?")
          ? {
              ...answer,
              body: { ...(answer.body as object), status: "unavailable" },
            }
          : answer;
      };
      return surveyLocation(ask, NG17_1AA, await askModes(ask), NO_WAIT);
    });

    expect(survey.layers.amenities).toBe("unavailable");
    expect(survey.onlyGeneral).toBe(true);
    expect(surveyedInFull(survey)).toBe(false);
    // The frontend's own request, then General's once the Layers are in.
    expect(scored.map((path) => path.split("mode=")[1])).toEqual([
      "general",
      "general",
    ]);
    expect(Object.keys(survey.locationScores)).toEqual(["general"]);
    expect(Object.keys(survey.highlights)).toEqual(["general"]);
  });

  it("asks only the General Scout Mode when data.police.uk didn't answer for some months, and records which", async () => {
    const scored: string[] = [];
    const survey = await withRecordedApi(async (recorded) => {
      const ask: Ask = async (path) => {
        if (path.startsWith("/api/scores?")) scored.push(path);
        const answer = await recorded(path);
        if (!path.startsWith("/api/area/crime?")) return answer;
        const body = answer.body as {
          statistics: { trend: Record<string, unknown> };
        };
        return {
          ...answer,
          body: {
            ...body,
            statistics: {
              ...body.statistics,
              trend: {
                ...body.statistics.trend,
                complete: false,
                missingMonths: ["2025-09", "2026-02"],
              },
            },
          },
        };
      };
      return surveyLocation(ask, NG17_1AA, await askModes(ask), NO_WAIT);
    });

    expect(survey.layers.crime).toBe("ok");
    expect(survey.missingCrimeMonths).toEqual(["2025-09", "2026-02"]);
    expect(survey.onlyGeneral).toBe(true);
    expect(surveyedInFull(survey)).toBe(false);
    expect(scored).toHaveLength(2);
    expect(
      surveyMarkdown({
        date: "2026-10-09",
        recorded: true,
        modes: [],
        locations: [survey],
        kept: null,
        unregistered: [],
      }),
    ).toContain(
      "data.police.uk didn't answer for 2 of the 24 months (2025-09, 2026-02), so the rest are scaled up to a year and there is no year-on-year change. Only the General Scout Mode was asked, as a Data Source failed and asking each mode would ask it again.",
    );
  });
});

describe("spreadSample", () => {
  it("takes items spread evenly from the first, or all of them if there are too few", () => {
    const items = Array.from({ length: 10 }, (_, index) => index);

    expect(spreadSample(items, 3)).toEqual([0, 3, 6]);
    expect(spreadSample(items, 10)).toEqual(items);
    expect(spreadSample([1, 2], 10)).toEqual([1, 2]);
    expect(spreadSample([], 10)).toEqual([]);
  });
});

// Each asks the recorded API for every Scout Mode's scores and Highlights.
describe("sampleUnregistered", { timeout: 30_000 }, () => {
  it("samples 10 Possibly Unregistered Land Opportunities across each Land Coverage Area, once each", async () => {
    await withRecordedApi(async (recorded) => {
      const modes = await askModes(recorded);
      const survey = await surveyLocation(recorded, NG17_1AA, modes, NO_WAIT);
      const landAsks: string[] = [];
      // The fixture's land has no Possibly Unregistered parcel, so 25 are made up from its first.
      const ask: Ask = async (path) => {
        const answer = await recorded(path);
        if (!path.startsWith("/api/land?")) return answer;
        landAsks.push(path);
        if (!path.includes("possiblyUnregisteredOnly=true")) return answer;
        if (!isLandLayerResponse(answer.body)) throw new Error(path);
        const all = await recorded(
          path.replace("&possiblyUnregisteredOnly=true", ""),
        );
        if (!isLandLayerResponse(all.body)) throw new Error(path);
        const [first] = all.body.features;
        if (first === undefined) throw new Error("No Land Opportunity");
        const features = Array.from({ length: 25 }, (_, index) => ({
          ...first,
          id: `E07000170-${String(index)}`,
          possiblyUnregistered: true,
        }));
        return {
          ...answer,
          body: {
            ...answer.body,
            features,
            statistics: { ...answer.body.statistics, count: 30 },
          },
        };
      };

      const samples = await sampleUnregistered(ask, [survey, survey]);

      expect(landAsks).toHaveLength(2);
      expect(landAsks[0]).toContain("scope=land-coverage-area");
      expect(samples).toHaveLength(1);
      const [ashfield] = samples;
      expect(ashfield?.council).toBe("Ashfield");
      expect(ashfield?.total).toBe(30);
      expect(ashfield?.opportunities).toBe(4);
      expect(ashfield?.listed).toBe(25);
      expect(ashfield?.sample).toHaveLength(UNREGISTERED_SAMPLE);
      expect(ashfield?.sample.map(({ id }) => id).slice(0, 3)).toEqual([
        "E07000170-0",
        "E07000170-2",
        "E07000170-5",
      ]);
    });
  });

  it("asks nothing for a Location outside every Land Coverage Area", async () => {
    const ask = vi.fn<Ask>();
    const outside = { land: null, council: "Cotswold" } as LocationSurvey;

    expect(await sampleUnregistered(ask, [outside])).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
  });
});

// Each asks the recorded API for every Scout Mode's scores and Highlights.
describe("runSurvey and surveyMarkdown", { timeout: 30_000 }, () => {
  it("keeps the Locations an earlier run surveyed in full, surveying again only the rest", async () => {
    await withRecordedApi(async (ask) => {
      const first = await runSurvey({
        ask,
        locations: [NG17_1AA, UNRECORDED],
        today: "2026-10-09",
        recorded: true,
        timing: NO_WAIT,
      });
      const asked: string[] = [];
      const kept: boolean[] = [];
      const again = await runSurvey({
        ask: (path) => {
          asked.push(path);
          return ask(path);
        },
        locations: [NG17_1AA, UNRECORDED],
        today: "2026-10-10",
        recorded: true,
        timing: NO_WAIT,
        previous: first,
        onLocation: (_, __, wasKept) => kept.push(wasKept),
      });

      expect(kept).toEqual([true, false]);
      expect(asked.filter((path) => path.startsWith("/api/geocode"))).toEqual([
        "/api/geocode?q=GL7+5NW",
      ]);
      expect(
        asked.filter((path) => /^\/api\/(area|scores|highlights)/.test(path)),
      ).toEqual([]);
      expect(again.kept).toEqual({
        date: "2026-10-09",
        postcodes: ["NG17 1AA"],
      });
      expect(again.locations[0]).toEqual(first.locations[0]);
      expect(again.date).toBe("2026-10-10");
      expect(surveyMarkdown(again)).toContain(
        "1 of the Locations (NG17 1AA) are kept from a run on 2026-10-09, in which every Layer answered; the rest were surveyed again.",
      );
    });
  });

  it("surveys each Location in turn and writes what each gave, with the land to check and FR-5.7's wording", async () => {
    const surveyed: string[] = [];
    const result = await withRecordedApi((ask) =>
      runSurvey({
        ask,
        locations: [NG17_1AA, UNRECORDED],
        today: "2026-10-09",
        recorded: true,
        timing: NO_WAIT,
        onLocation: ({ location }, index) => {
          surveyed.push(`${String(index)} ${location.postcode}`);
        },
      }),
    );

    expect(surveyed).toEqual(["0 NG17 1AA", "1 GL7 5NW"]);
    expect(result.modes[0]?.id).toBe("general");
    expect(result.unregistered.map(({ council }) => council)).toEqual([
      "Ashfield",
    ]);
    const markdown = surveyMarkdown(result);
    expect(markdown).toContain(
      "Written by `pnpm survey` on 2026-10-09, from the recordings",
    );
    expect(markdown).toMatch(
      /\| 1 \| town centre \| Sutton-in-Ashfield \| NG17 1AA \| Ashfield \| \d+(\.\d)? m?s \| \w+ \| none \| 0 \(0\) \|/,
    );
    expect(markdown).toContain(
      "| 1 | Sutton-in-Ashfield | 62 | 67 | 62 | 60 | 67 |",
    );
    expect(markdown).toContain(
      "| 1 | Sutton-in-Ashfield | 0 | 100 | 87 | 88 | 100 | 40 | 54 | 80 | 30 | 81 |",
    );
    expect(markdown).toContain("| Safety | 1 | 0 | 0 | 0 | 0 | 1 | 0 |");
    expect(markdown).toContain(
      "- 🔴 High crime: 224 crimes a year per 1,000 residents",
    );
    expect(markdown).toContain(
      "- **Schools 87**: Distance to the nearest primary school: 519 m (40);",
    );
    expect(markdown).toContain(
      "Not surveyed: /api/geocode didn't find GL7 5NW",
    );
    expect(markdown).toContain(
      "0 of its 4 Land Opportunities are Possibly Unregistered.",
    );
    expect(markdown).toContain(LAND_OPPORTUNITY_WORDING);
  });
});

describe("categorySpread", () => {
  const surveyed = (scores: Record<string, number | null>) =>
    ({
      categories: Object.entries(scores).map(([id, score]) => ({
        id,
        status: score === null ? "unavailable" : "ok",
        score,
        parts: [],
      })),
    }) as unknown as LocationSurvey;

  it("gives each Category Score's least, median and most, and how often it was 0 or 100", () => {
    const spread = categorySpread([
      surveyed({ safety: 0, transport: 100 }),
      surveyed({ safety: 40, transport: null }),
      surveyed({ safety: 0, transport: 60 }),
      surveyed({ safety: 100 }),
    ]);

    expect(spread.find(({ id }) => id === "safety")).toEqual({
      id: "safety",
      scored: 4,
      notScored: 0,
      min: 0,
      median: 20,
      max: 100,
      atZero: 2,
      atHundred: 1,
    });
    expect(spread.find(({ id }) => id === "transport")).toMatchObject({
      scored: 2,
      notScored: 1,
      median: 80,
    });
    expect(spread.find(({ id }) => id === "demand")).toMatchObject({
      scored: 0,
      min: null,
    });
    expect(spread.map(({ id }) => id)).not.toContain("competition");
  });
});
