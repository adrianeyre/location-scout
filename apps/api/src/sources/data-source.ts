import type { DataPeriod } from "@location-scout/shared";

import type { RateLimiter } from "./rate-limiter";
import { TtlCache } from "./ttl-cache";

/** Every live Data Source call gives up after 8 seconds (PRD NFR-1.1). */
export const SOURCE_TIMEOUT_MS = 8000;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** An external provider of data. Each adapter module defines one. */
export interface DataSource {
  /** A stable identifier, for example `postcodes-io`. */
  id: string;
  /** The name shown to the user, for example `postcodes.io`. */
  name: string;
  /** How long an answer stays in the in-memory cache (PRD NFR-1.4). */
  cacheTtlMs: number;
}

/** What an adapter makes its calls with. */
export interface SourceContext {
  fetch: typeof fetch;
  /** Aborted when the call times out. Pass it to every request. */
  signal: AbortSignal;
}

/** An adapter's answer: data mapped into shared types, and the period it covers. */
export interface Loaded<T> {
  data: T;
  period: DataPeriod | null;
}

/** How a call to a Data Source turned out. It never throws (NFR-1.2). */
export type SourceResult<T> =
  | { status: "ok"; data: T; period: DataPeriod | null }
  | { status: "unavailable" }
  | { status: "not-prepared" };

/** Thrown by an adapter whose `pnpm data:prepare` files are missing (ADR 0004). */
export class NotPreparedError extends Error {
  override name = "NotPreparedError";
}

export class SourceTimeoutError extends Error {
  override name = "SourceTimeoutError";

  constructor(source: DataSource, timeoutMs: number) {
    super(`${source.name} did not answer within ${String(timeoutMs)} ms`);
  }
}

/** How one call to a Data Source is made, beyond its request. */
export interface CallOptions {
  /**
   * For a Data Source whose turns may be a minute or more apart, as PlanIt's
   * are (PRD NFR-1.5): a request the cache can't answer waits for its turn
   * here, and its timeout starts only once its turn has come, so it still
   * has 8 seconds to answer. A cached answer never waits.
   */
  turn?: RateLimiter;
}

/**
 * Calls a Data Source through the timeout and the cache.
 *
 * `request` identifies the request within the source, for example its URL:
 * a repeated request within the source's TTL is answered from the cache
 * without calling `load`. Only `ok` answers are cached, so a failed source is
 * tried again next time. A request made again while the first is still
 * waiting for its answer shares that answer, so the source is called once.
 */
export type CallSource = <T>(
  source: DataSource,
  request: string,
  load: (context: SourceContext) => Promise<Loaded<T>>,
  options?: CallOptions,
) => Promise<SourceResult<T>>;

export interface SourceCallerOptions {
  fetch: typeof fetch;
  timeoutMs?: number;
}

/**
 * Makes the one way the backend calls Data Sources. Each caller has its own
 * cache, which lasts as long as the app that made it.
 */
export const createSourceCaller = ({
  fetch: fetchFn,
  timeoutMs = SOURCE_TIMEOUT_MS,
}: SourceCallerOptions): CallSource => {
  const cache = new TtlCache();
  const waiting = new Map<string, Promise<SourceResult<unknown>>>();

  const call = async <T>(
    source: DataSource,
    key: string,
    load: (context: SourceContext) => Promise<Loaded<T>>,
    { turn }: CallOptions,
  ): Promise<SourceResult<T>> => {
    await turn?.wait();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Racing the timer as well as aborting means an adapter that ignores its
    // signal still cannot hold up the response.
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new SourceTimeoutError(source, timeoutMs);
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });

    try {
      const { data, period } = await Promise.race([
        load({ fetch: fetchFn, signal: controller.signal }),
        timedOut,
      ]);
      const result: SourceResult<T> = { status: "ok", data, period };
      cache.set(key, result, source.cacheTtlMs);
      return result;
    } catch (error) {
      if (error instanceof NotPreparedError) return { status: "not-prepared" };
      console.error(`${source.name} is unavailable`, error);
      return { status: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  };

  return async <T>(
    source: DataSource,
    request: string,
    load: (context: SourceContext) => Promise<Loaded<T>>,
    options: CallOptions = {},
  ): Promise<SourceResult<T>> => {
    const key = `${source.id} ${request}`;
    // Only this function stores entries, and always the result of this key's load.
    const cached = cache.get(key);
    if (cached !== undefined) return cached as SourceResult<T>;
    // The same request is already on its way: share its answer.
    const pending = waiting.get(key);
    if (pending !== undefined) return pending as Promise<SourceResult<T>>;

    const answer = call(source, key, load, options);
    waiting.set(key, answer);
    try {
      return await answer;
    } finally {
      waiting.delete(key);
    }
  };
};
