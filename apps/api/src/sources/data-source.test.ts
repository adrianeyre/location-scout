import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { neverAnswers, noNetwork, stubFetch } from "../testing/fetch-stubs";
import {
  DAY_MS,
  NotPreparedError,
  SOURCE_TIMEOUT_MS,
  SourceTimeoutError,
  createSourceCaller,
  type DataSource,
  type Loaded,
  type SourceContext,
} from "./data-source";
import { createRateLimiter } from "./rate-limiter";

const police: DataSource = {
  id: "police",
  name: "data.police.uk",
  cacheTtlMs: DAY_MS,
};

const period = { from: "2026-07", to: "2026-07" };

/** A load that reads one JSON body through the context's fetch. */
const loadJson =
  (url: string) =>
  async ({ fetch, signal }: SourceContext) => {
    const response = await fetch(url, { signal });
    const data: unknown = await response.json();
    return { data, period };
  };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createSourceCaller", () => {
  it("returns the mapped data and its period", async () => {
    const callSource = createSourceCaller({
      fetch: stubFetch(() => Response.json({ crimes: 3 })),
    });

    const result = await callSource(police, "latest", loadJson("/crimes"));

    expect(result).toEqual({ status: "ok", data: { crimes: 3 }, period });
  });

  it("gives every call a signal and the caller's fetch", async () => {
    const fetchMock = stubFetch(() => Response.json({}));
    const callSource = createSourceCaller({ fetch: fetchMock });

    await callSource(police, "latest", loadJson("/crimes"));

    expect(fetchMock).toHaveBeenCalledWith("/crimes", {
      signal: expect.any(AbortSignal) as unknown,
    });
  });

  describe("timeout", () => {
    it("reports a source that takes more than 8 seconds as unavailable and aborts it", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fetchMock = neverAnswers();
      const callSource = createSourceCaller({ fetch: fetchMock });

      const pending = callSource(police, "latest", loadJson("/crimes"));
      await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);

      expect(await pending).toEqual({ status: "unavailable" });
      const signal = fetchMock.mock.calls[0]?.[1]?.signal;
      expect(signal?.aborted).toBe(true);
      expect(signal?.reason).toBeInstanceOf(SourceTimeoutError);
      expect(console.error).toHaveBeenCalledWith(
        "data.police.uk is unavailable",
        expect.any(SourceTimeoutError),
      );
    });

    it("still answers at 7.9 seconds", async () => {
      const callSource = createSourceCaller({ fetch: noNetwork() });
      const pending = callSource(police, "latest", async () => {
        await new Promise((resolve) => setTimeout(resolve, 7900));
        return { data: "late but in time", period: null };
      });

      await vi.advanceTimersByTimeAsync(7900);

      expect(await pending).toEqual({
        status: "ok",
        data: "late but in time",
        period: null,
      });
    });

    it("times out an adapter that ignores its signal", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const callSource = createSourceCaller({ fetch: noNetwork() });

      const pending = callSource(
        police,
        "latest",
        () => new Promise<Loaded<string>>(() => undefined),
      );
      await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);

      expect(await pending).toEqual({ status: "unavailable" });
    });
  });

  it("reports a failed call as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const callSource = createSourceCaller({ fetch: noNetwork() });

    expect(await callSource(police, "latest", loadJson("/crimes"))).toEqual({
      status: "unavailable",
    });
  });

  it("reports missing prepared files as not-prepared", async () => {
    const callSource = createSourceCaller({ fetch: noNetwork() });

    const result = await callSource(police, "latest", () =>
      Promise.reject(new NotPreparedError("data/ashfield is missing")),
    );

    expect(result).toEqual({ status: "not-prepared" });
  });

  describe("in-memory cache", () => {
    it("serves a repeated request within its TTL from the cache", async () => {
      const fetchMock = stubFetch(() => Response.json({ crimes: 3 }));
      const callSource = createSourceCaller({ fetch: fetchMock });

      const first = await callSource(police, "latest", loadJson("/crimes"));
      vi.advanceTimersByTime(DAY_MS - 1);
      const second = await callSource(police, "latest", loadJson("/crimes"));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it("calls the source again once the TTL has passed", async () => {
      const fetchMock = stubFetch(() => Response.json({ crimes: 3 }));
      const callSource = createSourceCaller({ fetch: fetchMock });

      await callSource(police, "latest", loadJson("/crimes"));
      vi.advanceTimersByTime(DAY_MS);
      await callSource(police, "latest", loadJson("/crimes"));

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("uses each source's own TTL", async () => {
      const fetchMock = stubFetch(() => Response.json({}));
      const callSource = createSourceCaller({ fetch: fetchMock });
      const shortLived = { ...police, cacheTtlMs: 1000 };

      await callSource(shortLived, "latest", loadJson("/crimes"));
      vi.advanceTimersByTime(1000);
      await callSource(shortLived, "latest", loadJson("/crimes"));

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("keys the cache by source and request", async () => {
      const fetchMock = stubFetch(() => Response.json({}));
      const callSource = createSourceCaller({ fetch: fetchMock });
      const overpass = { ...police, id: "overpass", name: "Overpass API" };

      await callSource(police, "latest", loadJson("/crimes"));
      await callSource(police, "2026-06", loadJson("/crimes"));
      await callSource(overpass, "latest", loadJson("/amenities"));

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("does not cache an unavailable source", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error("connection reset"))
        .mockResolvedValueOnce(Response.json({ crimes: 3 }));
      const callSource = createSourceCaller({ fetch: fetchMock });

      const failed = await callSource(police, "latest", loadJson("/crimes"));
      const retried = await callSource(police, "latest", loadJson("/crimes"));

      expect(failed.status).toBe("unavailable");
      expect(retried).toEqual({ status: "ok", data: { crimes: 3 }, period });
    });

    it("calls the source once for a request made again while it is waiting", async () => {
      const fetchMock = stubFetch(() => Response.json({ crimes: 3 }));
      const callSource = createSourceCaller({ fetch: fetchMock });

      const answers = await Promise.all([
        callSource(police, "latest", loadJson("/crimes")),
        callSource(police, "latest", loadJson("/crimes")),
      ]);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(answers).toEqual([
        { status: "ok", data: { crimes: 3 }, period },
        { status: "ok", data: { crimes: 3 }, period },
      ]);
    });

    it("shares a failure only with the requests that were waiting for it", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error("connection reset"))
        .mockResolvedValueOnce(Response.json({ crimes: 3 }));
      const callSource = createSourceCaller({ fetch: fetchMock });

      const waiting = await Promise.all([
        callSource(police, "latest", loadJson("/crimes")),
        callSource(police, "latest", loadJson("/crimes")),
      ]);
      const later = await callSource(police, "latest", loadJson("/crimes"));

      expect(waiting.map(({ status }) => status)).toEqual([
        "unavailable",
        "unavailable",
      ]);
      expect(later.status).toBe("ok");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("starts empty for a new caller, as after a restart", async () => {
      const fetchMock = stubFetch(() => Response.json({}));

      await createSourceCaller({ fetch: fetchMock })(
        police,
        "latest",
        loadJson("/crimes"),
      );
      await createSourceCaller({ fetch: fetchMock })(
        police,
        "latest",
        loadJson("/crimes"),
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("waiting for a turn", () => {
    /** A source whose turns are a minute apart, as PlanIt's are. */
    const minuteApart = () => createRateLimiter(60_000);

    it("starts the timeout only once the request's turn has come", async () => {
      const fetchMock = stubFetch(() => Response.json({ crimes: 3 }));
      const callSource = createSourceCaller({ fetch: fetchMock });
      const turn = minuteApart();
      await turn.wait();

      const pending = callSource(police, "latest", loadJson("/crimes"), {
        turn,
      });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(fetchMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      // Waiting far longer than 8 seconds for its turn didn't time it out.
      expect(await pending).toEqual({
        status: "ok",
        data: { crimes: 3 },
        period,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("still times out a request that takes over 8 seconds once its turn has come", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const callSource = createSourceCaller({ fetch: neverAnswers() });
      const turn = minuteApart();
      await turn.wait();

      const pending = callSource(police, "latest", loadJson("/crimes"), {
        turn,
      });
      await vi.advanceTimersByTimeAsync(60_000 + SOURCE_TIMEOUT_MS);

      expect(await pending).toEqual({ status: "unavailable" });
    });

    it("answers a cached request without waiting for a turn", async () => {
      const fetchMock = stubFetch(() => Response.json({ crimes: 3 }));
      const callSource = createSourceCaller({ fetch: fetchMock });
      const turn = minuteApart();

      await callSource(police, "latest", loadJson("/crimes"), { turn });
      const start = Date.now();
      const again = await callSource(police, "latest", loadJson("/crimes"), {
        turn,
      });

      expect(Date.now()).toBe(start);
      expect(again.status).toBe("ok");
      expect(fetchMock).toHaveBeenCalledOnce();
      // It used no turn: the next request waits only for the first's minute.
      expect(turn.isFree()).toBe(false);
    });

    it("waits once for requests that share an answer", async () => {
      const fetchMock = stubFetch(() => Response.json({ crimes: 3 }));
      const callSource = createSourceCaller({ fetch: fetchMock });
      const turn = minuteApart();

      const answers = Promise.all([
        callSource(police, "latest", loadJson("/crimes"), { turn }),
        callSource(police, "latest", loadJson("/crimes"), { turn }),
      ]);
      await vi.advanceTimersByTimeAsync(0);

      expect((await answers).map(({ status }) => status)).toEqual(["ok", "ok"]);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(turn.isFree()).toBe(false);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(turn.isFree()).toBe(true);
    });
  });
});
