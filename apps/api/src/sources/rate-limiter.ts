/**
 * Spaces out requests to a Data Source with a rate limit (PRD NFR-1.5). Callers
 * wait their turn in the order they asked, and each turn comes at least
 * `intervalMs` after the one before.
 */
export interface RateLimiter {
  /**
   * Resolves when the caller may send one request. If `signal` aborts first,
   * the caller leaves the queue without using a turn, and this rejects with
   * the signal's reason.
   */
  wait(signal?: AbortSignal): Promise<void>;
}

/**
 * A rate limiter that can also say whether a request would be sent at once,
 * and be told to wait longer, as a `429 Too Many Requests` answer's
 * `Retry-After` asks.
 */
export interface HoldingRateLimiter extends RateLimiter {
  /** Whether a caller asking now would get its turn at once. */
  isFree(): boolean;
  /**
   * Gives no turn until at least `ms` from now, however long ago the last
   * one was. Callers already waiting keep their places.
   */
  holdFor(ms: number): void;
}

interface Waiter {
  resolve: () => void;
  leave: () => void;
}

export const createRateLimiter = (intervalMs: number): HoldingRateLimiter => {
  const queue: Waiter[] = [];
  let lastTurnAt = Number.NEGATIVE_INFINITY;
  let heldUntil = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const nextTurnAt = () => Math.max(lastTurnAt + intervalMs, heldUntil);

  const serve = () => {
    timer = undefined;
    const waiter = queue[0];
    if (waiter === undefined) return;
    const delay = nextTurnAt() - Date.now();
    if (delay > 0) {
      timer = setTimeout(serve, delay);
      return;
    }
    queue.shift();
    lastTurnAt = Date.now();
    waiter.leave();
    waiter.resolve();
    serve();
  };

  return {
    isFree: () => queue.length === 0 && nextTurnAt() <= Date.now(),
    holdFor: (ms) => {
      heldUntil = Math.max(heldUntil, Date.now() + ms);
      // A turn already timed for sooner finds it must wait longer, and waits again.
    },
    wait: (signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason as Error);
          return;
        }
        const abandon = () => {
          const index = queue.indexOf(waiter);
          if (index >= 0) queue.splice(index, 1);
          reject(signal?.reason as Error);
        };
        const waiter: Waiter = {
          resolve,
          leave: () => signal?.removeEventListener("abort", abandon),
        };
        signal?.addEventListener("abort", abandon, { once: true });
        queue.push(waiter);
        if (timer === undefined) serve();
      }),
  };
};
