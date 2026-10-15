import { afterEach, describe, expect, it, vi } from "vitest";

import { fixtureFetch, noNetwork } from "../testing/fetch-stubs";
import { DAY_MS, createSourceCaller } from "./data-source";
import highStreet from "./fixtures/nominatim-12-high-street-sutton-in-ashfield.json" with { type: "json" };
import nothingFound from "./fixtures/nominatim-not-found.json" with { type: "json" };
import {
  MAX_CANDIDATES,
  NominatimError,
  mapSearchResponse,
  normaliseAddressQuery,
  searchAddress,
  searchUrl,
} from "./nominatim";
import type { RateLimiter } from "./rate-limiter";

const USER_AGENT = "location-scout-test (tests@example.com)";

/** A limiter that never makes anyone wait, and counts the turns given. */
const countingLimiter = () => {
  const wait = vi.fn<RateLimiter["wait"]>(() => Promise.resolve());
  return { wait };
};

describe("mapSearchResponse", () => {
  it("maps a recorded search to address candidates, best first", () => {
    const candidates = mapSearchResponse(200, highStreet);

    expect(candidates.map(({ location }) => location)).toEqual([
      { lat: 53.1287698, lng: -1.293384 },
      { lat: 53.1241078, lng: -1.2621582 },
      { lat: 53.1408244, lng: -1.2773692 },
    ]);
    expect(candidates.every(({ kind }) => kind === "address")).toBe(true);
    expect(candidates[1]?.label).toBe(
      "High Street, Sutton in Ashfield, Kirkby in Ashfield Urban District;Sutton in Ashfield Urban District, Sutton-in-Ashfield, Ashfield, Nottinghamshire, East Midlands, England, NG17 1DH",
    );
  });

  it("maps a recorded search with no match to no candidates", () => {
    expect(mapSearchResponse(200, nothingFound)).toEqual([]);
  });

  it("skips places without a usable name or position", () => {
    const [first] = highStreet;
    const body = [
      { ...first, lat: "north" },
      { ...first, display_name: undefined },
      { ...first, lon: -1.29 },
      null,
      first,
    ];

    expect(mapSearchResponse(200, body)).toHaveLength(1);
  });

  it(`offers at most ${String(MAX_CANDIDATES)} candidates`, () => {
    const body = Array.from({ length: 8 }, () => highStreet[0]);

    expect(mapSearchResponse(200, body)).toHaveLength(MAX_CANDIDATES);
  });

  it.each([
    ["a server error", 503, { error: "busy" }],
    ["a body that is not a list", 200, { error: "Unable to geocode" }],
    ["a body that is not JSON", 200, null],
  ])("throws on %s", (_label, status, body) => {
    expect(() => mapSearchResponse(status, body)).toThrow(NominatimError);
  });
});

describe("searchUrl", () => {
  it("asks for JSON results in Great Britain only", () => {
    const url = new URL(searchUrl("12 High Street, Sutton-in-Ashfield"));

    expect(url.origin + url.pathname).toBe(
      "https://nominatim.openstreetmap.org/search",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "12 high street, sutton-in-ashfield",
      format: "jsonv2",
      countrycodes: "gb",
      limit: String(MAX_CANDIDATES),
    });
  });

  it("is the same however the address is spaced or capitalised", () => {
    expect(normaliseAddressQuery("  12  High Street,\tSUTTON ")).toBe(
      "12 high street, sutton",
    );
    expect(searchUrl("12 HIGH  street")).toBe(searchUrl(" 12 high street "));
  });
});

describe("searchAddress", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits for its turn, then asks Nominatim with our User-Agent", async () => {
    const order: string[] = [];
    const limiter: RateLimiter = {
      wait: () => {
        order.push("turn");
        return Promise.resolve();
      },
    };
    const fetchMock = vi.fn<typeof fetch>(() => {
      order.push("request");
      return Promise.resolve(Response.json(highStreet));
    });

    const result = await searchAddress(
      "12 High Street, Sutton-in-Ashfield",
      createSourceCaller({ fetch: fetchMock }),
      { userAgent: USER_AGENT, limiter },
    );

    expect(order).toEqual(["turn", "request"]);
    expect(result).toMatchObject({ status: "ok", period: null });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(searchUrl("12 High Street, Sutton-in-Ashfield"));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).get("user-agent")).toBe(USER_AGENT);
  });

  it("reports Nominatim as unavailable when it fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await searchAddress(
      "12 High Street",
      createSourceCaller({ fetch: noNetwork() }),
      { userAgent: USER_AGENT, limiter: countingLimiter() },
    );

    expect(result).toEqual({ status: "unavailable" });
  });

  it("caches a search for 7 days, without taking a turn to answer it again", async () => {
    vi.useFakeTimers();
    const fetchMock = fixtureFetch(highStreet);
    const limiter = countingLimiter();
    const callSource = createSourceCaller({ fetch: fetchMock });
    const options = { userAgent: USER_AGENT, limiter };

    await searchAddress("12 High Street", callSource, options);
    vi.advanceTimersByTime(7 * DAY_MS - 1);
    await searchAddress("12 high street", callSource, options);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(limiter.wait).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await searchAddress("12 High Street", callSource, options);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(limiter.wait).toHaveBeenCalledTimes(2);
  });
});
