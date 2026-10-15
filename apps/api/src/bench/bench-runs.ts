import { Agent, request } from "node:http";
import type { AddressInfo } from "node:net";

import { serve } from "@hono/node-server";
import {
  SERVED_LAYER_IDS,
  isGeocodeResponse,
  isLandLayerResponse,
  isLayerResponse,
  type LandLayerResponse,
  type SearchRadiusMiles,
  type ServedLayerId,
} from "@location-scout/shared";

/**
 * `pnpm bench`: the repeatable benchmark of PRD NFR-2.1–NFR-2.5. It loads
 * NG17 1AA's 0.5 mile Search Area from the API as the frontend does, twice,
 * finds Land Opportunities across Ashfield, and can time `pnpm
 * data:prepare`. Tests run it against the recordings the end-to-end tests
 * use; only `pnpm bench` reaches the live Data Sources.
 */

/** Where the Search Area is loaded: NG17 1AA's 0.5 mile Search Area, which the recordings cover, in Ashfield. */
export const BENCH_POSTCODE = "NG17 1AA";
export const BENCH_RADIUS: SearchRadiusMiles = 0.5;

/** Each NFR's limit (PRD §6.13). */
export const NFR_LIMITS = {
  /** NFR-2.1: a full Search Area, uncached. */
  uncachedMs: 5000,
  /** NFR-2.2: the same search, cached. */
  cachedMs: 1000,
  /** NFR-2.4: a Land Opportunity search across a whole Land Coverage Area. */
  landMs: 3000,
  /** NFR-2.5: `data:prepare` for one council. */
  prepareMs: 15 * 60 * 1000,
} as const;

/**
 * How many requests a browser sends one origin at once over HTTP/1.1, as
 * Vite's dev server serves the frontend and its `/api` proxy: the rest wait
 * for one of them to answer.
 */
export const BROWSER_CONNECTIONS = 6;

/** Layers whose arrival within this long of one another is taken as at once. */
export const AT_ONCE_MS = 100;

/** Each Layer's name, as the Layers panel gives it. */
export const LAYER_NAMES: Readonly<Record<ServedLayerId, string>> = {
  crime: "Crime",
  planning: "Planning",
  amenities: "Amenities",
  schools: "Schools",
  transport: "Transport",
  "green-space": "Green space",
  property: "Property",
  land: "Land",
  demographics: "Demographics",
};

/** An answer from the API: its status and its body as JSON. */
export interface Answer {
  status: number;
  body: unknown;
}

/** Asks the API for a path, such as `/api/area?lat=…`, as the frontend does. */
export type Ask = (path: string) => Promise<Answer>;

/** The API could not be benchmarked: it didn't find the postcode, say. */
export class BenchError extends Error {
  override name = "BenchError";
}

/** The `error` of an `ApiErrorResponse`, or the status if there is none. */
const errorOf = ({ status, body }: Answer) =>
  typeof body === "object" &&
  body !== null &&
  "error" in body &&
  typeof body.error === "string"
    ? body.error
    : `it answered ${String(status)}`;

/** One request of a Search Area's, and when it was answered. */
export interface TimedRequest {
  /** What it asks for: `Search Area`, a Layer's name, `Scores` or `Highlights`. */
  name: string;
  path: string;
  /** The Layer it loads, or `null`. */
  layer: ServedLayerId | null;
  /** When it was answered, in ms from when the postcode was searched for. */
  answeredMs: number;
  status: number;
  /** A Layer's status: `ok`, `unavailable` or `not-prepared`. */
  layerStatus: string | null;
  /** The Planning Layer's Planning Applications' status: `ok`, `queued` or `unavailable`. */
  applicationsStatus: string | null;
}

/** One Search Area loaded as the frontend loads it. */
export interface SearchAreaLoad {
  /** The postcode searched for, as `/api/geocode` answered it. */
  geocode: TimedRequest;
  /** Every request then sent at once, in the order the frontend sends them. */
  requests: TimedRequest[];
  /** From the search until the last request was answered. */
  totalMs: number;
  /** How many requests the API sent Data Sources meanwhile. */
  sourceRequests: number;
}

/**
 * The requests that load a Search Area once its postcode is found, in the
 * order the frontend sends them (`loadArea` in
 * `apps/web/src/useSearchArea.ts`): the Search Area, leaving the Layers'
 * Data Sources to them, each Layer, then the scores and Highlights in the
 * General Scout Mode.
 */
export const searchAreaRequests = (query: string) => [
  {
    name: "Search Area",
    path: `/api/area?${query}&sources=false`,
    layer: null,
  },
  ...SERVED_LAYER_IDS.map((layer) => ({
    name: LAYER_NAMES[layer],
    path: `/api/area/${layer}?${query}`,
    layer,
  })),
  { name: "Scores", path: `/api/scores?${query}&mode=general`, layer: null },
  {
    name: "Highlights",
    path: `/api/highlights?${query}&mode=general`,
    layer: null,
  },
];

const timed = (
  name: string,
  path: string,
  layer: ServedLayerId | null,
  answeredMs: number,
  { status, body }: Answer,
): TimedRequest => {
  const isLayer = layer !== null && isLayerResponse(body);
  return {
    name,
    path,
    layer,
    answeredMs,
    status,
    layerStatus: isLayer ? body.status : null,
    applicationsStatus:
      isLayer && body.layer === "planning"
        ? (body.applications?.status ?? null)
        : null,
  };
};

/**
 * Searches for the postcode, then asks for its Search Area, every Layer, the
 * scores and the Highlights at once, as the frontend does, timing each from
 * the search. `sent` counts the requests the API has sent Data Sources.
 */
export const loadSearchArea = async (
  ask: Ask,
  sent: () => number,
): Promise<SearchAreaLoad> => {
  const before = sent();
  const started = performance.now();
  const since = () => Math.round(performance.now() - started);

  const geocodePath = `/api/geocode?${new URLSearchParams({ q: BENCH_POSTCODE }).toString()}`;
  const geocoded = await ask(geocodePath);
  const geocode = timed("Postcode", geocodePath, null, since(), geocoded);
  const [found] = isGeocodeResponse(geocoded.body)
    ? geocoded.body.candidates
    : [];
  if (geocoded.status !== 200 || found === undefined) {
    throw new BenchError(
      `/api/geocode didn't find ${BENCH_POSTCODE}: ${errorOf(geocoded)}`,
    );
  }

  const query = new URLSearchParams({
    lat: String(found.location.lat),
    lng: String(found.location.lng),
    radius: String(BENCH_RADIUS),
    postcode: found.label,
  }).toString();
  const requests = await Promise.all(
    searchAreaRequests(query).map(async ({ name, path, layer }) => {
      const answer = await ask(path);
      if (answer.status !== 200) {
        throw new BenchError(`${path} failed: ${errorOf(answer)}`);
      }
      return timed(name, path, layer, since(), answer);
    }),
  );
  return {
    geocode,
    requests,
    totalMs: since(),
    sourceRequests: sent() - before,
  };
};

/** Two Land Opportunity searches across every Land Coverage Area the Search Area reaches into. */
export interface LandSearch {
  /** The first, in the default order. */
  first: { ms: number; land: LandLayerResponse };
  /** Another in another order, as the Land panel asks when it is changed. */
  again: { ms: number; land: LandLayerResponse };
}

/** The order the second search asks for, which nothing has asked for before. */
const AGAIN_SORT = "capacity";

/**
 * Searches for Land Opportunities across the Land Coverage Area NG17 1AA
 * is in (PRD FR-5.1), with FR-5.3's default filters, then again in another
 * order.
 */
export const searchLand = async (ask: Ask): Promise<LandSearch> => {
  const geocoded = await ask(
    `/api/geocode?${new URLSearchParams({ q: BENCH_POSTCODE }).toString()}`,
  );
  const [found] = isGeocodeResponse(geocoded.body)
    ? geocoded.body.candidates
    : [];
  if (found === undefined) {
    throw new BenchError(
      `/api/geocode didn't find ${BENCH_POSTCODE}: ${errorOf(geocoded)}`,
    );
  }
  const query = new URLSearchParams({
    lat: String(found.location.lat),
    lng: String(found.location.lng),
    radius: String(BENCH_RADIUS),
    postcode: found.label,
    scope: "land-coverage-area",
  }).toString();

  const search = async (path: string) => {
    const started = performance.now();
    const answer = await ask(path);
    const ms = Math.round(performance.now() - started);
    if (answer.status !== 200 || !isLandLayerResponse(answer.body)) {
      throw new BenchError(`${path} failed: ${errorOf(answer)}`);
    }
    return { ms, land: answer.body };
  };
  const first = await search(`/api/land?${query}`);
  const again = await search(`/api/land?${query}&sort=${AGAIN_SORT}`);
  return { first, again };
};

/** How long `pnpm data:prepare` took, and what it prepared. */
export interface PrepareTiming {
  ms: number;
  /** Its exit code: 0 if it prepared everything. */
  exitCode: number;
  /** The Land Coverage Areas it prepared, by name. */
  councils: string[];
}

export type BenchOutcome = "pass" | "fail" | "skip";

export interface BenchResult {
  nfr: "NFR-2.1" | "NFR-2.2" | "NFR-2.3" | "NFR-2.4" | "NFR-2.5";
  outcome: BenchOutcome;
  detail: string;
}

/**
 * A time as people read it: `85 ms`, `4.3 s` or `10 min 25 s`. Seconds are
 * cut to a tenth, not rounded, so a time under a limit never reads as it.
 */
export const duration = (ms: number) => {
  if (ms < 1000) return `${String(Math.round(ms))} ms`;
  if (ms < 60_000) return `${String(Math.floor(ms / 100) / 10)} s`;
  const seconds = Math.round(ms / 1000);
  const minutes = `${String(Math.floor(seconds / 60))} min`;
  return seconds % 60 === 0 ? minutes : `${minutes} ${String(seconds % 60)} s`;
};

/** Names in a list: `A`, `A and B`, `A, B and C`. */
const list = (names: readonly string[]) =>
  names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;

const layersWith = (load: SearchAreaLoad, status: string) =>
  load.requests
    .filter(({ layerStatus }) => layerStatus === status)
    .map(({ name }) => name);

const sourceRequests = (count: number) =>
  `${String(count)} Data Source ${count === 1 ? "request" : "requests"}`;

/**
 * NFR-2.1: uncached, a full Search Area loads in under 5 seconds. A Layer
 * whose Data Source was unavailable leaves it short of full, so it fails
 * too. Planning Applications queued for PlanIt's turn, which comes about
 * once a minute (ADR 0003), are said, as the frontend shows the rest
 * meanwhile.
 */
export const judgeUncached = (load: SearchAreaLoad): BenchResult => {
  const unavailable = layersWith(load, "unavailable");
  const notPrepared = layersWith(load, "not-prepared");
  const queued = load.requests.some(
    ({ applicationsStatus }) => applicationsStatus === "queued",
  );
  const inTime = load.totalMs < NFR_LIMITS.uncachedMs;
  const notes = [
    ...(unavailable.length > 0
      ? [
          `${list(unavailable)} ${unavailable.length === 1 ? "was" : "were"} unavailable, so it wasn't full`,
        ]
      : []),
    ...(queued
      ? [
          "its Planning Applications waited for PlanIt's turn, which comes about once a minute, so they aren't in it",
        ]
      : []),
    ...(notPrepared.length > 0 ? [`${list(notPrepared)} aren't prepared`] : []),
  ];
  return {
    nfr: "NFR-2.1",
    outcome: inTime && unavailable.length === 0 ? "pass" : "fail",
    detail: `Uncached, ${BENCH_POSTCODE}'s ${String(BENCH_RADIUS)} mile Search Area loaded in ${duration(load.totalMs)}, ${inTime ? "under" : "not under"} ${duration(NFR_LIMITS.uncachedMs)}, with ${sourceRequests(load.sourceRequests)}${notes.map((note) => `; ${note}`).join("")}.`,
  };
};

/**
 * NFR-2.2: cached, the same search loads in under 1 second. Only answers
 * that were `ok` are cached, so any that failed are asked again.
 */
export const judgeCached = (load: SearchAreaLoad): BenchResult => {
  const inTime = load.totalMs < NFR_LIMITS.cachedMs;
  const sent =
    load.sourceRequests === 0
      ? "sending no Data Source requests"
      : `sending ${sourceRequests(load.sourceRequests)} again, for answers that failed, which aren't cached`;
  return {
    nfr: "NFR-2.2",
    outcome: inTime ? "pass" : "fail",
    detail: `Cached, it loaded again in ${duration(load.totalMs)}, ${inTime ? "under" : "not under"} ${duration(NFR_LIMITS.cachedMs)}, ${sent}.`,
  };
};

/**
 * NFR-2.3: Layers render as each Data Source returns, and the UI never
 * waits for the slowest before showing anything. The frontend shows the
 * Search Area once `/api/area` answers, then each Layer as it arrives, so
 * it passes if the Search Area answered before the slowest Layer did, or
 * if every Layer arrived at once, leaving none slowest.
 */
export const judgeProgressive = (load: SearchAreaLoad): BenchResult => {
  const area = load.requests.find(({ name }) => name === "Search Area");
  const layers = load.requests
    .filter(({ layer }) => layer !== null)
    .sort((a, b) => a.answeredMs - b.answeredMs);
  const fastest = layers.at(0);
  const slowest = layers.at(-1);
  if (area === undefined || fastest === undefined || slowest === undefined) {
    return { nfr: "NFR-2.3", outcome: "fail", detail: "No Layer was loaded." };
  }
  if (slowest.answeredMs - fastest.answeredMs <= AT_ONCE_MS) {
    return {
      nfr: "NFR-2.3",
      outcome: "pass",
      detail: `Every Layer arrived within ${duration(AT_ONCE_MS)} of the first, at ${duration(slowest.answeredMs)}, so none was left to wait for.`,
    };
  }
  const before = layers.filter(
    ({ answeredMs }) => answeredMs < slowest.answeredMs,
  ).length;
  const shown = area.answeredMs < slowest.answeredMs;
  return {
    nfr: "NFR-2.3",
    outcome: shown ? "pass" : "fail",
    detail: shown
      ? `The Search Area was shown at ${duration(area.answeredMs)}, and ${String(before)} of the ${String(layers.length)} Layers before the slowest, ${slowest.name}, at ${duration(slowest.answeredMs)}; the first, ${fastest.name}, arrived at ${duration(fastest.answeredMs)}.`
      : `The Search Area answered at ${duration(area.answeredMs)}, no sooner than the slowest Layer, ${slowest.name}, at ${duration(slowest.answeredMs)}, so nothing was shown until it had arrived.`,
  };
};

/** The Land Coverage Areas a search looked in, by name. */
const lookedIn = ({ landCoverageAreas }: LandLayerResponse) =>
  list(landCoverageAreas.map(({ name }) => name));

/**
 * NFR-2.4: a Land Opportunity search across a whole Land Coverage Area
 * returns in under 3 seconds: the first, and another in another order.
 * Without the land data prepared there is nothing to search.
 */
export const judgeLand = (search: LandSearch): BenchResult => {
  const { first, again } = search;
  if (
    first.land.status === "not-prepared" ||
    first.land.landCoverageAreas.length === 0
  ) {
    return {
      nfr: "NFR-2.4",
      outcome: "skip",
      detail: `The land data of the council ${BENCH_POSTCODE} is in isn't prepared: run pnpm data:prepare, or pnpm bench --prepare to prepare it and time it.`,
    };
  }
  if (first.land.status !== "ok" || first.land.statistics === null) {
    return {
      nfr: "NFR-2.4",
      outcome: "fail",
      detail: `The prepared land data couldn't be read: it was ${first.land.status}.`,
    };
  }
  const slowest = Math.max(first.ms, again.ms);
  const inTime = slowest < NFR_LIMITS.landMs;
  const { count, parcels } = first.land.statistics;
  return {
    nfr: "NFR-2.4",
    outcome: inTime ? "pass" : "fail",
    detail: `Across ${lookedIn(first.land)}, ${String(count)} Land Opportunities among ${String(parcels)} Land Parcels were found in ${duration(first.ms)}, and in ${duration(again.ms)} in another order, ${inTime ? "under" : "not under"} ${duration(NFR_LIMITS.landMs)}.`,
  };
};

/**
 * NFR-2.5: `data:prepare` for one council completes in under 15 minutes.
 * A run that prepared several councils refreshes them all, so it isn't
 * judged against one council's limit.
 */
export const judgePrepare = (timing: PrepareTiming | null): BenchResult => {
  if (timing === null) {
    return {
      nfr: "NFR-2.5",
      outcome: "skip",
      detail:
        "pnpm data:prepare wasn't run: add --prepare to run it and time it, which downloads about 800 MB.",
    };
  }
  const took = duration(timing.ms);
  if (timing.exitCode !== 0) {
    return {
      nfr: "NFR-2.5",
      outcome: "fail",
      detail: `pnpm data:prepare failed after ${took}, exiting with ${String(timing.exitCode)}.`,
    };
  }
  if (timing.councils.length !== 1) {
    return {
      nfr: "NFR-2.5",
      outcome: "skip",
      detail: `pnpm data:prepare took ${took} for ${String(timing.councils.length)} councils (${list(timing.councils)}), as it refreshes every council prepared before, so it isn't judged against one council's ${duration(NFR_LIMITS.prepareMs)}.`,
    };
  }
  const inTime = timing.ms < NFR_LIMITS.prepareMs;
  return {
    nfr: "NFR-2.5",
    outcome: inTime ? "pass" : "fail",
    detail: `pnpm data:prepare prepared the England-wide datasets and ${list(timing.councils)} in ${took}, ${inTime ? "under" : "not under"} ${duration(NFR_LIMITS.prepareMs)}.`,
  };
};

export interface BenchOptions {
  ask: Ask;
  /** How many requests the API has sent Data Sources so far. */
  sent: () => number;
  /** How long `pnpm data:prepare` took, if it was run first, or `null`. */
  prepared: PrepareTiming | null;
  /** Called with each Search Area as it is loaded, uncached and then cached. */
  onLoad?: (label: "Uncached" | "Cached", load: SearchAreaLoad) => void;
}

/**
 * Loads the Search Area uncached, then cached, then searches for Land
 * Opportunities, and judges each NFR, in order.
 */
export const runBench = async ({
  ask,
  sent,
  prepared,
  onLoad,
}: BenchOptions): Promise<BenchResult[]> => {
  const uncached = await loadSearchArea(ask, sent);
  onLoad?.("Uncached", uncached);
  const cached = await loadSearchArea(ask, sent);
  onLoad?.("Cached", cached);
  const land = await searchLand(ask);
  return [
    judgeUncached(uncached),
    judgeCached(cached),
    judgeProgressive(uncached),
    judgeLand(land),
    judgePrepare(prepared),
  ];
};

/** `fetch`, counting the requests sent through it. */
export const countingFetch = (fetchFn: typeof fetch) => {
  let count = 0;
  const counted: typeof fetch = (input, init) => {
    count += 1;
    return fetchFn(input, init);
  };
  return { fetch: counted, sent: () => count };
};

/**
 * Serves an app on a free port on this machine, and asks it over HTTP/1.1
 * through `BROWSER_CONNECTIONS` connections, as a browser asks Vite's dev
 * server: the rest of the requests wait their turn.
 */
export const serveForBench = async (app: {
  fetch: (request: Request) => Response | Promise<Response>;
}) => {
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const started = serve({ fetch: app.fetch, port: 0 }, () => {
      resolve(started);
    });
  });
  const { port } = server.address() as AddressInfo;
  const agent = new Agent({
    keepAlive: true,
    maxSockets: BROWSER_CONNECTIONS,
  });
  const ask: Ask = (path) =>
    new Promise((resolve, reject) => {
      request({ host: "127.0.0.1", port, path, agent }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      })
        .on("error", reject)
        .end();
    });
  const close = () =>
    new Promise<void>((resolve) => {
      agent.destroy();
      server.close(() => {
        resolve();
      });
    });
  return { ask, close };
};
