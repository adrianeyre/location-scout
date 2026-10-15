import {
  PLANNING_APPLICATION_RULES,
  PLANNING_APPLICATION_STATUSES,
  PLANNING_APPLICATION_TYPES,
  type DataPeriod,
  type PlanningApplicationFeature,
  type PlanningApplicationStatistics,
  type PlanningApplications,
  type SearchArea,
  type SourceReport,
} from "@location-scout/shared";

import { sourceReport } from "./area-sources";
import {
  estimatedHousing,
  withEstimatedHomes,
  type ProviderApplication,
} from "./estimated-housing";
import type {
  CallSource,
  DataSource,
  Loaded,
  SourceContext,
  SourceResult,
} from "./data-source";
import { yearsUpTo } from "./land-registry";
import type { HoldingRateLimiter, RateLimiter } from "./rate-limiter";
import { TtlCache } from "./ttl-cache";

/** A Data Source's answer, or that the request is waiting for its turn. */
export type QueuedResult<T> = SourceResult<T> | { status: "queued" };

/**
 * The Planning Applications a provider found in a Search Area. Their homes
 * are estimated after, the same way whichever provider found them.
 */
export interface FoundApplications<
  A extends ProviderApplication = ProviderApplication,
> {
  /** Newest first. */
  features: A[];
  /**
   * How many the provider has in the Search Area: more than `features` if
   * it gave only the newest. `null` if it gave as many as it gives at once
   * and doesn't say how many it has, so it may have more.
   */
  total: number | null;
}

/**
 * A provider of Planning Applications (ADR 0003): PlanIt by default, or
 * PlanWire with a key. Each maps its own answers into the shared types, so
 * the Planning Layer, and the frontend, never know which one it asked.
 */
export interface PlanningApplicationsProvider {
  /** Its Data Source, as responses report it. */
  source: DataSource;
  /** Its website, which the Location Overview credits. */
  url: string;
  /**
   * Where its Planning Applications come from, which it leaves out or
   * places approximately, and how their types are told apart, as the
   * Location Overview says under them.
   */
  note: string;
  /**
   * The Planning Applications in the Search Area received in `period`,
   * through `callSource`, or `queued` while the request waits for the
   * provider's next turn.
   */
  find: (
    area: SearchArea,
    period: DataPeriod,
    callSource: CallSource,
  ) => Promise<QueuedResult<FoundApplications>>;
}

/**
 * Thrown by a load whose Data Source answered `429 Too Many Requests`, once
 * it has held its limiter back for as long as the answer's `Retry-After`
 * asks.
 */
export class RateLimitedError extends Error {
  override name = "RateLimitedError";
}

/**
 * How long a `429 Too Many Requests` answer asks us to wait before the next
 * request: its `Retry-After`, in seconds or as a date, or `fallbackMs` if it
 * gives neither.
 */
export const retryAfterMs = (
  header: string | null,
  fallbackMs: number,
  now = Date.now(),
) => {
  const value = header?.trim() ?? "";
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? fallbackMs : Math.max(0, at - now);
};

/**
 * How many times a request is sent while its Data Source answers `429 Too
 * Many Requests`, each time once its `Retry-After` has passed.
 */
export const RATE_LIMITED_ATTEMPTS = 3;

/**
 * How long a request that failed after waiting for its turn is answered as
 * failed, so that asking again for it, as the frontend does while it waits,
 * doesn't put it back in the queue at once.
 */
export const FAILED_FOR_MS = 60_000;

/** Calls a Data Source whose turns may be a minute or more apart. */
export interface SourceQueue {
  /**
   * Answers from the cache at once, or sends the request if its turn is
   * free, answering within the 8-second timeout. Otherwise the request joins
   * the queue, and this answers `queued` at once: the request carries on
   * waiting, and its answer is cached, so asking again once it has come
   * answers from the cache. While the source answers `429 Too Many
   * Requests` (`load` throws `RateLimitedError`), the request is sent again
   * once its `Retry-After` has passed, up to `RATE_LIMITED_ATTEMPTS` times.
   */
  call: <T>(
    callSource: CallSource,
    source: DataSource,
    request: string,
    load: (context: SourceContext) => Promise<Loaded<T>>,
  ) => Promise<QueuedResult<T>>;
}

/**
 * Makes a queue for one Data Source's requests, turned by `limiter`, which
 * every app in the process shares so the limit holds across them all
 * (PRD NFR-1.5). An app makes its own queue, as it has its own cache.
 */
export const createSourceQueue = (limiter: HoldingRateLimiter): SourceQueue => {
  // The requests not yet answered: each one's answer, and a promise that
  // settles once it has joined the queue, which it may never do.
  const waiting = new Map<
    string,
    {
      answer: Promise<SourceResult<unknown>>;
      queued: Promise<{ status: "queued" }>;
    }
  >();
  const failed = new TtlCache();

  return {
    call: async <T>(
      callSource: CallSource,
      source: DataSource,
      request: string,
      load: (context: SourceContext) => Promise<Loaded<T>>,
    ): Promise<QueuedResult<T>> => {
      const key = `${source.id} ${request}`;
      // The same request asked for again, as the Planning Layer and the
      // scores both ask: answered with it once it has been sent, or
      // `queued` while it waits its turn. Only this function stores entries,
      // each with its own key's answer.
      const asked = waiting.get(key);
      if (asked) {
        return Promise.race([asked.answer, asked.queued]) as Promise<
          QueuedResult<T>
        >;
      }
      const failure = failed.get(key);
      if (failure !== undefined) return failure as SourceResult<T>;

      const { promise: queued, resolve: answerQueued } = Promise.withResolvers<{
        status: "queued";
      }>();
      // Asked for only on a cache miss: a request that can't go at once has
      // joined the queue.
      const turn: RateLimiter = {
        wait: (signal) => {
          if (!limiter.isFree()) answerQueued({ status: "queued" });
          return limiter.wait(signal);
        },
      };

      const answer = (async (): Promise<SourceResult<T>> => {
        for (let attempt = 1; ; attempt++) {
          const sent = { rateLimited: false };
          const result = await callSource(
            source,
            request,
            async (context) => {
              try {
                return await load(context);
              } catch (error) {
                sent.rateLimited = error instanceof RateLimitedError;
                throw error;
              }
            },
            { turn },
          );
          if (!sent.rateLimited || attempt >= RATE_LIMITED_ATTEMPTS) {
            return result;
          }
        }
      })();
      waiting.set(key, { answer, queued });
      void answer.then((result) => {
        waiting.delete(key);
        if (result.status !== "ok") failed.set(key, result, FAILED_FOR_MS);
      });
      return Promise.race([answer, queued]);
    },
  };
};

/** A provider's Planning Applications, each with the new homes it proposes, estimated. */
export const withHomesEstimated = ({
  features,
  total,
}: FoundApplications): FoundApplications<PlanningApplicationFeature> => ({
  features: features.map(withEstimatedHomes),
  total,
});

/**
 * The Planning Applications' statistics (PRD FR-2.2): how many there are,
 * of each status and type, how many are placed at their postcode, the
 * major ones, newest first, and the homes they would bring, estimated.
 */
export const planningApplicationStatistics = ({
  features,
  total,
}: FoundApplications<PlanningApplicationFeature>): PlanningApplicationStatistics => ({
  count: features.length,
  total: total === null ? null : Math.max(total, features.length),
  approximate: features.filter(({ approximate }) => approximate).length,
  byStatus: PLANNING_APPLICATION_STATUSES.map((status) => ({
    status,
    count: features.filter((feature) => feature.status === status).length,
  })),
  byType: PLANNING_APPLICATION_TYPES.map((type) => ({
    type,
    count: features.filter(({ applicationType }) => applicationType === type)
      .length,
  })),
  major: features
    .filter(({ applicationType }) => applicationType === "major")
    .map(({ id }) => id),
  housing: estimatedHousing(features),
});

/**
 * The Planning Applications received in the Search Area in the last 3 years
 * up to `today` (PRD FR-2.2), from `provider`, and how its Data Source
 * answered, or `null` while the request is queued, as it hasn't yet.
 */
export const planningApplicationsIn = async (
  area: SearchArea,
  today: string,
  callSource: CallSource,
  provider: PlanningApplicationsProvider,
): Promise<{
  applications: PlanningApplications;
  report: SourceReport | null;
}> => {
  const period = yearsUpTo(today, PLANNING_APPLICATION_RULES.years);
  const result = await provider.find(area, period, callSource);
  const { id, name } = provider.source;
  const found = result.status === "ok" ? withHomesEstimated(result.data) : null;
  const applications: PlanningApplications = {
    status: result.status === "not-prepared" ? "unavailable" : result.status,
    provider: { id, name, url: provider.url, note: provider.note },
    // A cached answer covers the years up to the day it was asked.
    period: result.status === "ok" ? (result.period ?? period) : period,
    features: found?.features ?? [],
    statistics: found && planningApplicationStatistics(found),
  };
  return {
    applications,
    report:
      result.status === "queued" ? null : sourceReport(provider.source, result),
  };
};
