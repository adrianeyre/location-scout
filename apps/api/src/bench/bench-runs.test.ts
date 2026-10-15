import { afterEach, describe, expect, it, vi } from "vitest";

import { SERVED_LAYER_IDS } from "@location-scout/shared";

import { createRateLimiter } from "../sources/rate-limiter";
import {
  PREPARED_DATA_FIXTURE,
  NOTHING_PREPARED,
  testApp,
} from "../testing/app";
import { noNetwork } from "../testing/fetch-stubs";
import { recordedFetch } from "../testing/fixture-fetch";
import {
  BROWSER_CONNECTIONS,
  BenchError,
  LAYER_NAMES,
  NFR_LIMITS,
  countingFetch,
  duration,
  judgeCached,
  judgeLand,
  judgePrepare,
  judgeProgressive,
  judgeUncached,
  loadSearchArea,
  runBench,
  serveForBench,
  type LandSearch,
  type SearchAreaLoad,
  type TimedRequest,
} from "./bench-runs";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Serves the app as the end-to-end tests' fixture-backed API is, with no
 * waits between requests, and runs `use` against it over HTTP.
 */
const withRecordedApi = async <T>(
  use: (
    ask: Awaited<ReturnType<typeof serveForBench>>["ask"],
    sent: () => number,
  ) => Promise<T>,
  preparedData = PREPARED_DATA_FIXTURE,
) => {
  const counted = countingFetch(recordedFetch);
  const app = testApp({
    fetch: counted.fetch,
    policeLimiter: createRateLimiter(0),
    overpassLimiter: createRateLimiter(0),
    planItLimiter: createRateLimiter(0),
    preparedData,
  });
  const { ask, close } = await serveForBench(app);
  try {
    return await use(ask, counted.sent);
  } finally {
    await close();
  }
};

/** A request of a Search Area's, answered at `answeredMs`. */
const request = (
  name: string,
  answeredMs: number,
  changes: Partial<TimedRequest> = {},
): TimedRequest => ({
  name,
  path: `/api/${name}`,
  layer: null,
  answeredMs,
  status: 200,
  layerStatus: null,
  applicationsStatus: null,
  ...changes,
});

/** A Search Area loaded in `totalMs`, its Search Area answered at `areaMs` and each Layer at `layerMs`. */
const loaded = ({
  totalMs = 2000,
  areaMs = 100,
  layerMs = () => 1000,
  sourceRequests = 30,
  layerChanges = () => ({}),
}: {
  totalMs?: number;
  areaMs?: number;
  layerMs?: (index: number) => number;
  sourceRequests?: number;
  layerChanges?: (index: number) => Partial<TimedRequest>;
} = {}): SearchAreaLoad => ({
  geocode: request("Postcode", 50),
  requests: [
    request("Search Area", areaMs),
    ...SERVED_LAYER_IDS.map((layer, index) =>
      request(LAYER_NAMES[layer], layerMs(index), {
        layer,
        layerStatus: "ok",
        ...layerChanges(index),
      }),
    ),
    request("Scores", totalMs),
    request("Highlights", totalMs),
  ],
  totalMs,
  sourceRequests,
});

describe("runBench against the recordings", () => {
  it("loads NG17 1AA's 0.5 mile Search Area as the frontend does, then again from the cache, and finds Ashfield's Land Opportunities, passing NFR-2.1 to NFR-2.4 and skipping NFR-2.5", async () => {
    const loads: [string, SearchAreaLoad][] = [];

    const results = await withRecordedApi((ask, sent) =>
      runBench({
        ask,
        sent,
        prepared: null,
        onLoad: (label, load) => loads.push([label, load]),
      }),
    );

    expect(loads.map(([label]) => label)).toEqual(["Uncached", "Cached"]);
    const [[, uncached], [, cached]] = loads as [
      [string, SearchAreaLoad],
      [string, SearchAreaLoad],
    ];
    expect(uncached.geocode.path).toBe("/api/geocode?q=NG17+1AA");
    const query = "lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17+1AA";
    // Every request the frontend sends once the postcode is found, in its order.
    expect(uncached.requests.map(({ name, path }) => [name, path])).toEqual([
      ["Search Area", `/api/area?${query}&sources=false`],
      ["Crime", `/api/area/crime?${query}`],
      ["Planning", `/api/area/planning?${query}`],
      ["Amenities", `/api/area/amenities?${query}`],
      ["Schools", `/api/area/schools?${query}`],
      ["Transport", `/api/area/transport?${query}`],
      ["Green space", `/api/area/green-space?${query}`],
      ["Property", `/api/area/property?${query}`],
      ["Land", `/api/area/land?${query}`],
      ["Demographics", `/api/area/demographics?${query}`],
      ["Scores", `/api/scores?${query}&mode=general`],
      ["Highlights", `/api/highlights?${query}&mode=general`],
    ]);
    expect(
      uncached.requests
        .filter(({ layer }) => layer !== null)
        .map(({ layerStatus }) => layerStatus),
    ).toEqual(SERVED_LAYER_IDS.map(() => "ok"));
    expect(
      uncached.requests.find(({ layer }) => layer === "planning")
        ?.applicationsStatus,
    ).toBe("ok");
    expect(uncached.sourceRequests).toBeGreaterThan(0);
    // Everything the first asked the Data Sources for is cached.
    expect(cached.sourceRequests).toBe(0);
    expect(uncached.totalMs).toBe(
      Math.max(...uncached.requests.map(({ answeredMs }) => answeredMs)),
    );

    expect(results.map(({ nfr, outcome }) => [nfr, outcome])).toEqual([
      ["NFR-2.1", "pass"],
      ["NFR-2.2", "pass"],
      ["NFR-2.3", "pass"],
      ["NFR-2.4", "pass"],
      ["NFR-2.5", "skip"],
    ]);
    expect(results[1]?.detail).toContain("sending no Data Source requests");
    expect(results[3]?.detail).toMatch(
      /^Across Ashfield, 4 Land Opportunities among 5 Land Parcels were found in \d+ ms, and in \d+ ms in another order, under 3 s\.$/,
    );
  });

  it("skips NFR-2.4 and names the Layers that aren't prepared before pnpm data:prepare", async () => {
    const results = await withRecordedApi(
      (ask, sent) => runBench({ ask, sent, prepared: null }),
      NOTHING_PREPARED,
    );

    expect(results[0]?.detail).toContain(
      "Schools, Land and Demographics aren't prepared",
    );
    expect(results[3]).toEqual({
      nfr: "NFR-2.4",
      outcome: "skip",
      detail:
        "The land data of the council NG17 1AA is in isn't prepared: run pnpm data:prepare, or pnpm bench --prepare to prepare it and time it.",
    });
  });

  it("stops, saying why, when the postcode can't be found", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = testApp({ fetch: noNetwork() });
    const { ask, close } = await serveForBench(app);

    try {
      await expect(loadSearchArea(ask, () => 0)).rejects.toThrow(
        new BenchError(
          "/api/geocode didn't find NG17 1AA: Postcode lookup is unavailable. Please try again shortly.",
        ),
      );
    } finally {
      await close();
    }
  });
});

describe("judgeUncached (NFR-2.1)", () => {
  it("passes a full Search Area loaded in under 5 seconds", () => {
    expect(judgeUncached(loaded({ totalMs: 4999 }))).toEqual({
      nfr: "NFR-2.1",
      outcome: "pass",
      detail:
        "Uncached, NG17 1AA's 0.5 mile Search Area loaded in 4.9 s, under 5 s, with 30 Data Source requests.",
    });
  });

  it("fails one that took 5 seconds or more", () => {
    expect(judgeUncached(loaded({ totalMs: 8012 }))).toMatchObject({
      outcome: "fail",
      detail:
        "Uncached, NG17 1AA's 0.5 mile Search Area loaded in 8 s, not under 5 s, with 30 Data Source requests.",
    });
  });

  it("fails one with a Layer unavailable, as it wasn't full, however fast", () => {
    expect(
      judgeUncached(
        loaded({
          layerChanges: (index) =>
            index === 2 || index === 4 ? { layerStatus: "unavailable" } : {},
        }),
      ),
    ).toMatchObject({
      outcome: "fail",
      detail:
        "Uncached, NG17 1AA's 0.5 mile Search Area loaded in 2 s, under 5 s, with 30 Data Source requests; Amenities and Transport were unavailable, so it wasn't full.",
    });
  });

  it("says when its Planning Applications waited for PlanIt's turn", () => {
    expect(
      judgeUncached(
        loaded({
          layerChanges: (index) =>
            index === 1 ? { applicationsStatus: "queued" } : {},
        }),
      ),
    ).toMatchObject({
      outcome: "pass",
      detail:
        "Uncached, NG17 1AA's 0.5 mile Search Area loaded in 2 s, under 5 s, with 30 Data Source requests; its Planning Applications waited for PlanIt's turn, which comes about once a minute, so they aren't in it.",
    });
  });
});

describe("judgeCached (NFR-2.2)", () => {
  it("passes the same search loaded in under 1 second", () => {
    expect(judgeCached(loaded({ totalMs: 41, sourceRequests: 0 }))).toEqual({
      nfr: "NFR-2.2",
      outcome: "pass",
      detail:
        "Cached, it loaded again in 41 ms, under 1 s, sending no Data Source requests.",
    });
  });

  it("fails one that took 1 second or more, saying how many requests were sent again", () => {
    expect(
      judgeCached(loaded({ totalMs: NFR_LIMITS.cachedMs, sourceRequests: 11 })),
    ).toMatchObject({
      outcome: "fail",
      detail:
        "Cached, it loaded again in 1 s, not under 1 s, sending 11 Data Source requests again, for answers that failed, which aren't cached.",
    });
  });
});

describe("judgeProgressive (NFR-2.3)", () => {
  it("passes when the Search Area is shown before the slowest Layer arrives", () => {
    expect(
      judgeProgressive(
        loaded({
          areaMs: 180,
          layerMs: (index) => (index === 2 ? 4300 : 200 + index),
        }),
      ),
    ).toEqual({
      nfr: "NFR-2.3",
      outcome: "pass",
      detail:
        "The Search Area was shown at 180 ms, and 8 of the 9 Layers before the slowest, Amenities, at 4.3 s; the first, Crime, arrived at 200 ms.",
    });
  });

  it("fails when the Search Area waited for the slowest Layer, so nothing was shown until it arrived", () => {
    expect(
      judgeProgressive(
        loaded({
          areaMs: 6432,
          layerMs: (index) => (index === 2 ? 6432 : 214),
        }),
      ),
    ).toEqual({
      nfr: "NFR-2.3",
      outcome: "fail",
      detail:
        "The Search Area answered at 6.4 s, no sooner than the slowest Layer, Amenities, at 6.4 s, so nothing was shown until it had arrived.",
    });
  });

  it("passes when every Layer arrived at once, leaving none slowest", () => {
    expect(
      judgeProgressive(loaded({ areaMs: 40, layerMs: (index) => 30 + index })),
    ).toMatchObject({
      outcome: "pass",
      detail:
        "Every Layer arrived within 100 ms of the first, at 38 ms, so none was left to wait for.",
    });
  });
});

describe("judgeLand (NFR-2.4)", () => {
  const search = (firstMs: number, againMs: number, status = "ok") => {
    const land = {
      layer: "land",
      status,
      sources: [],
      scope: "land-coverage-area",
      sort: "area",
      filters: {},
      landCoverageAreas: [{ code: "E07000170", name: "Ashfield" }],
      notCovered: [],
      features: [],
      landUse: [],
      statistics: status === "ok" ? { parcels: 411, count: 288 } : null,
    };
    return {
      first: { ms: firstMs, land },
      again: { ms: againMs, land },
    } as unknown as LandSearch;
  };

  it("passes searches across a Land Coverage Area in under 3 seconds", () => {
    expect(judgeLand(search(310, 82))).toEqual({
      nfr: "NFR-2.4",
      outcome: "pass",
      detail:
        "Across Ashfield, 288 Land Opportunities among 411 Land Parcels were found in 310 ms, and in 82 ms in another order, under 3 s.",
    });
  });

  it("fails when either took 3 seconds or more", () => {
    expect(judgeLand(search(310, 3000)).outcome).toBe("fail");
    expect(judgeLand(search(3200, 82)).outcome).toBe("fail");
  });

  it("fails when the prepared land data couldn't be read", () => {
    expect(judgeLand(search(12, 10, "unavailable"))).toMatchObject({
      outcome: "fail",
      detail: "The prepared land data couldn't be read: it was unavailable.",
    });
  });
});

describe("judgePrepare (NFR-2.5)", () => {
  it("skips it unless pnpm data:prepare was run", () => {
    expect(judgePrepare(null)).toMatchObject({
      nfr: "NFR-2.5",
      outcome: "skip",
    });
  });

  it("passes one council prepared in under 15 minutes", () => {
    expect(
      judgePrepare({ ms: 625_000, exitCode: 0, councils: ["Ashfield"] }),
    ).toEqual({
      nfr: "NFR-2.5",
      outcome: "pass",
      detail:
        "pnpm data:prepare prepared the England-wide datasets and Ashfield in 10 min 25 s, under 15 min.",
    });
  });

  it("fails one that took 15 minutes or more, or failed", () => {
    expect(
      judgePrepare({
        ms: NFR_LIMITS.prepareMs,
        exitCode: 0,
        councils: ["Ashfield"],
      }).outcome,
    ).toBe("fail");
    expect(
      judgePrepare({ ms: 90_000, exitCode: 1, councils: [] }),
    ).toMatchObject({
      outcome: "fail",
      detail: "pnpm data:prepare failed after 1 min 30 s, exiting with 1.",
    });
  });

  it("doesn't judge a run that refreshed several councils against one council's limit", () => {
    expect(
      judgePrepare({
        ms: 1_200_000,
        exitCode: 0,
        councils: ["Ashfield", "Mansfield"],
      }),
    ).toMatchObject({
      outcome: "skip",
      detail:
        "pnpm data:prepare took 20 min for 2 councils (Ashfield and Mansfield), as it refreshes every council prepared before, so it isn't judged against one council's 15 min.",
    });
  });
});

describe("serveForBench", () => {
  it("asks over at most 6 connections at once, as a browser does, and the rest wait their turn", async () => {
    let open = 0;
    let most = 0;
    const app = {
      fetch: async () => {
        open += 1;
        most = Math.max(most, open);
        await new Promise((resolve) => setTimeout(resolve, 20));
        open -= 1;
        return Response.json({ ok: true });
      },
    };
    const { ask, close } = await serveForBench(app);

    try {
      const answers = await Promise.all(
        Array.from({ length: 12 }, (_, index) => ask(`/${String(index)}`)),
      );

      expect(answers).toEqual(
        Array.from({ length: 12 }, () => ({ status: 200, body: { ok: true } })),
      );
      expect(most).toBe(BROWSER_CONNECTIONS);
    } finally {
      await close();
    }
  });
});

describe("duration", () => {
  it("gives milliseconds, seconds, or minutes and seconds", () => {
    expect(duration(85.4)).toBe("85 ms");
    expect(duration(4321)).toBe("4.3 s");
    expect(duration(5000)).toBe("5 s");
    expect(duration(4999)).toBe("4.9 s");
    expect(duration(625_000)).toBe("10 min 25 s");
  });
});

describe("countingFetch", () => {
  it("counts the requests sent through it", async () => {
    const counted = countingFetch(() => Promise.resolve(new Response("")));

    await counted.fetch("https://example.com/");
    await counted.fetch("https://example.com/");

    expect(counted.sent()).toBe(2);
  });
});
