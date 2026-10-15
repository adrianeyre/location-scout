import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRateLimiter } from "./rate-limiter";

/** Asks for `count` turns at once and notes when each one comes. */
const askForTurns = (
  limiter: ReturnType<typeof createRateLimiter>,
  count: number,
) => {
  const turns: number[] = [];
  const waits = Array.from({ length: count }, () =>
    limiter.wait().then(() => {
      turns.push(Date.now());
    }),
  );
  return { turns, done: Promise.all(waits) };
};

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives the first turn at once", async () => {
    const limiter = createRateLimiter(1000);
    const start = Date.now();

    await limiter.wait();

    expect(Date.now()).toBe(start);
  });

  it("spaces a burst one interval apart, in the order asked", async () => {
    const limiter = createRateLimiter(1000);
    const start = Date.now();

    const { turns, done } = askForTurns(limiter, 5);
    await vi.advanceTimersByTimeAsync(0);
    expect(turns).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(turns).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(turns).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3000);
    await done;

    expect(turns.map((time) => time - start)).toEqual([
      0, 1000, 2000, 3000, 4000,
    ]);
  });

  it("gives a turn at once after a quiet spell", async () => {
    const limiter = createRateLimiter(1000);
    await limiter.wait();
    await vi.advanceTimersByTimeAsync(5000);
    const start = Date.now();

    await limiter.wait();

    expect(Date.now()).toBe(start);
  });

  it("makes a caller wait out the rest of the interval", async () => {
    const limiter = createRateLimiter(1000);
    await limiter.wait();
    await vi.advanceTimersByTimeAsync(400);
    const start = Date.now();

    const { turns, done } = askForTurns(limiter, 1);
    await vi.advanceTimersByTimeAsync(600);
    await done;

    expect(turns).toEqual([start + 600]);
  });

  it("lets a caller leave the queue without using a turn", async () => {
    const limiter = createRateLimiter(1000);
    const start = Date.now();
    await limiter.wait();
    const controller = new AbortController();
    const reason = new Error("timed out");

    const leaving = limiter.wait(controller.signal);
    const { turns, done } = askForTurns(limiter, 1);
    controller.abort(reason);

    await expect(leaving).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(turns).toEqual([start + 1000]);
  });

  it("refuses a caller whose signal has already aborted", async () => {
    const limiter = createRateLimiter(1000);
    const reason = new Error("timed out");

    await expect(limiter.wait(AbortSignal.abort(reason))).rejects.toBe(reason);

    // It used no turn.
    const start = Date.now();
    await limiter.wait();
    expect(Date.now()).toBe(start);
  });

  it("says whether a caller asking now would get its turn at once", async () => {
    const limiter = createRateLimiter(1000);
    expect(limiter.isFree()).toBe(true);

    await limiter.wait();
    expect(limiter.isFree()).toBe(false);
    const { done } = askForTurns(limiter, 1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    // That caller has just had its turn.
    expect(limiter.isFree()).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(limiter.isFree()).toBe(true);
  });

  it("gives no turn until a hold is over, then keeps the interval", async () => {
    const limiter = createRateLimiter(1000);
    const start = Date.now();
    await limiter.wait();

    // As if the source answered 429 with a Retry-After of 5 seconds.
    limiter.holdFor(5000);
    const { turns, done } = askForTurns(limiter, 2);
    await vi.advanceTimersByTimeAsync(4999);
    expect(turns).toEqual([]);
    expect(limiter.isFree()).toBe(false);
    await vi.advanceTimersByTimeAsync(1001);
    await done;

    expect(turns.map((time) => time - start)).toEqual([5000, 6000]);
  });

  it("keeps the longer of two holds", async () => {
    const limiter = createRateLimiter(1000);
    const start = Date.now();

    limiter.holdFor(3000);
    limiter.holdFor(1000);
    const { turns, done } = askForTurns(limiter, 1);
    await vi.advanceTimersByTimeAsync(3000);
    await done;

    expect(turns).toEqual([start + 3000]);
  });
});
