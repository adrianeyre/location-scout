import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  distanceMetres,
  type CrimeCategoryCount,
  type SearchArea,
} from "@location-scout/shared";

import {
  neverAnswers,
  policeFixtures,
  policeMonthOf,
} from "../testing/fetch-stubs";
import { NG17_1AA_CRIMES_BY_MONTH } from "../testing/police-ng17-1aa";
import { createSourceCaller, SOURCE_TIMEOUT_MS } from "./data-source";
import lastUpdated from "./fixtures/police-last-updated.json" with { type: "json" };
import ng17Crimes from "./fixtures/police-ng17-1aa-2026-08.json" with { type: "json" };
import {
  CRIME_CATEGORY_NAMES,
  LAST_UPDATED_URL,
  POLICE_INTERVAL_MS,
  PoliceError,
  STREET_CRIMES_URL,
  TREND_MONTHS,
  addMonths,
  countCrimes,
  crimeCategoryName,
  crimeTrend,
  crimesWithTrend,
  latestCrimes,
  mapLastUpdated,
  mapStreetCrimes,
  monthsUpTo,
  percentChange,
  searchAreaPoly,
  streetCrimesBody,
} from "./police";
import { createRateLimiter } from "./rate-limiter";

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

/** The Search Area the crimes fixture was recorded for. */
const area: SearchArea = {
  location: NG17_1AA,
  searchRadius: { miles: 0.5, metres: 804.672 },
};

/** Answers data.police.uk as it answered when the fixtures were recorded. */
const recordedPolice = (
  crimes: () => Response = () => Response.json(ng17Crimes),
) =>
  vi.fn<typeof fetch>((input) =>
    Promise.resolve(
      input === LAST_UPDATED_URL ? Response.json(lastUpdated) : crimes(),
    ),
  );

/** A limiter that never holds up a test that isn't about the rate limit. */
const unlimited = () => ({ limiter: createRateLimiter(0) });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("mapLastUpdated", () => {
  it("reads the latest month from the recorded date", () => {
    expect(mapLastUpdated(200, lastUpdated)).toBe("2026-08");
  });

  it.each([
    ["an error status", 500, lastUpdated],
    ["no date", 200, {}],
    ["a date that is not a date", 200, { date: "August" }],
    ["no body", 200, null],
  ])("throws for %s", (_label, status, body) => {
    expect(() => mapLastUpdated(status, body)).toThrow(PoliceError);
  });
});

describe("searchAreaPoly", () => {
  const corners = searchAreaPoly(area)
    .split(":")
    .map((corner) => corner.split(",").map(Number));

  it("outlines the Search Area with 32 lat,lng corners, not repeating the first", () => {
    expect(corners).toHaveLength(32);
    expect(corners.at(-1)).not.toEqual(corners[0]);
    const [lat, lng] = corners[0] ?? [];
    expect(lat).toBeGreaterThan(NG17_1AA.lat);
    expect(lng).toBeCloseTo(NG17_1AA.lng, 6);
  });

  it("puts every corner one Search Radius from the Location", () => {
    for (const [lat = 0, lng = 0] of corners) {
      expect(distanceMetres(NG17_1AA, { lat, lng })).toBeCloseTo(804.672, -1);
    }
  });

  it("is sent with the month as a form body", () => {
    const body = new URLSearchParams(streetCrimesBody(area, "2026-08"));

    expect(body.get("poly")).toBe(searchAreaPoly(area));
    expect(body.get("date")).toBe("2026-08");
  });
});

describe("mapStreetCrimes", () => {
  const crimes = mapStreetCrimes(200, ng17Crimes, NG17_1AA);

  it("maps every recorded crime to a Crime Feature", () => {
    expect(crimes).toHaveLength(185);
    expect(crimes[0]).toEqual({
      id: "137366010",
      location: { lat: 53.123398, lng: -1.273124 },
      distanceMetres: 604,
      category: "anti-social-behaviour",
      categoryName: "Anti-social behaviour",
      month: "2026-08",
      street: "On or near Petrol Station",
    });
  });

  it("gives each crime its distance from the Location, inside the Search Area", () => {
    for (const { location, distanceMetres: distance } of crimes) {
      expect(distance).toBe(Math.round(distanceMetres(NG17_1AA, location)));
      expect(distance).toBeLessThanOrEqual(805);
    }
  });

  it("names every recorded category", () => {
    const named = new Set(Object.values(CRIME_CATEGORY_NAMES));
    for (const { categoryName } of crimes) {
      expect(named).toContain(categoryName);
    }
  });

  it("skips a crime with no usable location", () => {
    const [first] = ng17Crimes;
    const mapped = mapStreetCrimes(
      200,
      [
        { ...first, location: null },
        { ...first, location: { ...first?.location, latitude: "" } },
        first,
      ],
      NG17_1AA,
    );

    expect(mapped.map(({ id }) => id)).toEqual(["137366010"]);
  });

  it("keeps a crime placed on no named street", () => {
    const [first] = ng17Crimes;
    const [mapped] = mapStreetCrimes(
      200,
      [{ ...first, location: { ...first?.location, street: null } }],
      NG17_1AA,
    );

    expect(mapped?.street).toBeNull();
  });

  it.each([
    ["more than 10,000 crimes", 503, ""],
    ["an error status", 500, []],
    ["a body that is not a list", 200, { crimes: [] }],
  ])("throws for %s", (_label, status, body) => {
    expect(() => mapStreetCrimes(status, body, NG17_1AA)).toThrow(PoliceError);
  });
});

describe("crimeCategoryName", () => {
  it("uses data.police.uk's name", () => {
    expect(crimeCategoryName("violent-crime")).toBe(
      "Violence and sexual offences",
    );
  });

  it("names a category added later from its id", () => {
    expect(crimeCategoryName("fly-tipping")).toBe("Fly tipping");
  });
});

describe("countCrimes", () => {
  it("counts the recorded crimes by category, most reported first", () => {
    const statistics = countCrimes(
      mapStreetCrimes(200, ng17Crimes, NG17_1AA),
      "2026-08",
    );

    expect(statistics.month).toBe("2026-08");
    expect(statistics.total).toBe(185);
    expect(statistics.byCategory.slice(0, 3)).toEqual([
      {
        category: "violent-crime",
        name: "Violence and sexual offences",
        count: 43,
      },
      {
        category: "anti-social-behaviour",
        name: "Anti-social behaviour",
        count: 42,
      },
      { category: "shoplifting", name: "Shoplifting", count: 29 },
    ]);
    expect(
      statistics.byCategory.reduce((sum, { count }) => sum + count, 0),
    ).toBe(185);
  });

  it("orders categories with the same count by name", () => {
    const statistics = countCrimes(
      mapStreetCrimes(200, ng17Crimes, NG17_1AA),
      "2026-08",
    );

    // Possession of weapons, robbery and vehicle crime were reported 4 times each.
    expect(
      statistics.byCategory
        .filter(({ count }) => count === 4)
        .map(({ name }) => name),
    ).toEqual(["Possession of weapons", "Robbery", "Vehicle crime"]);
  });

  it("has nothing to count in a month with no crimes", () => {
    expect(countCrimes([], "2026-08")).toEqual({
      month: "2026-08",
      total: 0,
      byCategory: [],
    });
  });
});

describe("latestCrimes", () => {
  it("asks for the latest month, then the Search Area's crimes in it", async () => {
    const fetchMock = recordedPolice();

    const result = await latestCrimes(
      area,
      createSourceCaller({ fetch: fetchMock }),
      unlimited(),
    );

    expect(result).toMatchObject({
      status: "ok",
      period: { from: "2026-08", to: "2026-08" },
      data: { counts: { month: "2026-08", total: 185 } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      LAST_UPDATED_URL,
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, STREET_CRIMES_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: streetCrimesBody(area, "2026-08"),
      signal: expect.any(AbortSignal) as unknown,
    });
  });

  it("answers a repeated Search Area from the cache", async () => {
    const fetchMock = recordedPolice();
    const callSource = createSourceCaller({ fetch: fetchMock });

    await latestCrimes(area, callSource, unlimited());
    const again = await latestCrimes(area, callSource, unlimited());

    expect(again.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is unavailable when data.police.uk fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.reject(new Error("connection reset")),
    );

    const result = await latestCrimes(
      area,
      createSourceCaller({ fetch: fetchMock }),
      unlimited(),
    );

    expect(result).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("is unavailable when the Search Area holds too many crimes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await latestCrimes(
      area,
      createSourceCaller({
        fetch: recordedPolice(() => new Response("", { status: 503 })),
      }),
      unlimited(),
    );

    expect(result).toEqual({ status: "unavailable" });
  });

  it("is unavailable when data.police.uk takes more than 8 seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const answer = latestCrimes(
      area,
      createSourceCaller({ fetch: neverAnswers() }),
      unlimited(),
    );
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);

    expect(await answer).toEqual({ status: "unavailable" });
  });

  it("gives an empty month no Features", async () => {
    const result = await latestCrimes(
      area,
      createSourceCaller({ fetch: recordedPolice(() => Response.json([])) }),
      unlimited(),
    );

    expect(result).toMatchObject({
      status: "ok",
      data: {
        features: [],
        counts: { month: "2026-08", total: 0, byCategory: [] },
      },
    });
  });
});

describe("addMonths and monthsUpTo", () => {
  it.each([
    ["2026-08", -12, "2025-08"],
    ["2026-01", -1, "2025-12"],
    ["2025-12", 1, "2026-01"],
    ["2026-08", -23, "2024-09"],
  ])("%s plus %i months is %s", (month, by, expected) => {
    expect(addMonths(month, by)).toBe(expected);
  });

  it("lists the months up to and including the latest, oldest first", () => {
    expect(monthsUpTo("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("gives the trend 24 months", () => {
    const months = monthsUpTo("2026-08", TREND_MONTHS);

    expect(months).toHaveLength(24);
    expect(months[0]).toBe("2024-09");
    expect(new Set(months).size).toBe(24);
  });
});

describe("percentChange", () => {
  it.each([
    [110, 100, 10],
    [2024, 1912, 5.9],
    [339, 408, -16.9],
    [0, 5, -100],
  ])(
    "%i crimes against %i before is a change of %s per cent",
    (last, previous, change) => {
      expect(percentChange(last, previous)).toBe(change);
    },
  );

  it.each([
    [5, 0],
    [0, 0],
  ])(
    "has nothing to compare %i with when there were %i before",
    (last, previous) => {
      expect(percentChange(last, previous)).toBeNull();
    },
  );

  it("calls a fall too small to show no change, not -0", () => {
    expect(Object.is(percentChange(100_000, 100_001), 0)).toBe(true);
  });
});

/** Each recorded month's crimes, counted by category. */
const recordedCounts = (
  byMonth: ReadonlyMap<string, unknown> = NG17_1AA_CRIMES_BY_MONTH,
) =>
  new Map(
    [...byMonth].map(([month, body]) => [
      month,
      countCrimes(mapStreetCrimes(200, body, NG17_1AA), month).byCategory,
    ]),
  );

/** `byMonth` without some of its months, as if data.police.uk failed for them. */
const without = (byMonth: ReadonlyMap<string, unknown>, ...months: string[]) =>
  new Map([...byMonth].filter(([month]) => !months.includes(month)));

describe("crimeTrend", () => {
  it("compares the last 12 months with the 12 before", () => {
    const trend = crimeTrend("2026-08", recordedCounts());

    expect(trend).toMatchObject({
      last12Months: { from: "2025-09", to: "2026-08" },
      previous12Months: { from: "2024-09", to: "2025-08" },
      complete: true,
      missingMonths: [],
      total: { last12Months: 2024, previous12Months: 1912, change: 5.9 },
    });
  });

  it("compares each category, most reported in the last 12 months first", () => {
    const { byCategory } = crimeTrend("2026-08", recordedCounts());

    expect(byCategory.slice(0, 3)).toEqual([
      {
        category: "violent-crime",
        name: "Violence and sexual offences",
        last12Months: 558,
        previous12Months: 509,
        change: 9.6,
      },
      {
        category: "shoplifting",
        name: "Shoplifting",
        last12Months: 374,
        previous12Months: 304,
        change: 23,
      },
      {
        category: "anti-social-behaviour",
        name: "Anti-social behaviour",
        last12Months: 339,
        previous12Months: 408,
        change: -16.9,
      },
    ]);
    expect(byCategory).toHaveLength(14);
    expect(
      byCategory.reduce((sum, { last12Months }) => sum + last12Months, 0),
    ).toBe(2024);
  });

  it("marks the trend incomplete when months are missing, and gives no changes rather than wrong ones", () => {
    const trend = crimeTrend(
      "2026-08",
      recordedCounts(without(NG17_1AA_CRIMES_BY_MONTH, "2026-02", "2025-01")),
    );

    expect(trend.complete).toBe(false);
    expect(trend.missingMonths).toEqual(["2025-01", "2026-02"]);
    // The counts leave out the months missing: 128 and 169 crimes.
    expect(trend.total).toEqual({
      last12Months: 2024 - 128,
      previous12Months: 1912 - 169,
      change: null,
    });
    for (const { change } of trend.byCategory) {
      expect(change).toBeNull();
    }
  });

  it("gives no change for a category with no crimes in the previous 12 months", () => {
    const counted = new Map<string, readonly CrimeCategoryCount[]>([
      ["2026-08", [{ category: "drugs", name: "Drugs", count: 2 }]],
      ["2024-09", [{ category: "burglary", name: "Burglary", count: 3 }]],
      ...monthsUpTo("2026-07", 22).map((month) => [month, []] as const),
    ]);

    const trend = crimeTrend("2026-08", counted);

    expect(trend.complete).toBe(true);
    expect(trend.byCategory).toEqual([
      {
        category: "drugs",
        name: "Drugs",
        last12Months: 2,
        previous12Months: 0,
        change: null,
      },
      {
        category: "burglary",
        name: "Burglary",
        last12Months: 0,
        previous12Months: 3,
        change: -100,
      },
    ]);
    expect(trend.total).toEqual({
      last12Months: 2,
      previous12Months: 3,
      change: -33.3,
    });
  });

  it("has nothing to compare in 24 months with no crimes", () => {
    const counted = new Map(
      monthsUpTo("2026-01", 24).map((month) => [month, []] as const),
    );

    expect(crimeTrend("2026-01", counted)).toEqual({
      last12Months: { from: "2025-02", to: "2026-01" },
      previous12Months: { from: "2024-02", to: "2025-01" },
      complete: true,
      missingMonths: [],
      total: { last12Months: 0, previous12Months: 0, change: null },
      byCategory: [],
    });
  });
});

describe("crimesWithTrend", () => {
  /** data.police.uk as it answered for NG17 1AA when each month was recorded. */
  const recordedMonths = (
    crimesByMonth: ReadonlyMap<string, unknown> = NG17_1AA_CRIMES_BY_MONTH,
  ) => policeFixtures({ lastUpdated, crimesByMonth });

  /** The month each street-level crimes request asked for, in order. */
  const monthsAskedFor = (fetchMock: ReturnType<typeof recordedMonths>) =>
    fetchMock.mock.calls
      .filter(([url]) => url === STREET_CRIMES_URL)
      .map(([, init]) => policeMonthOf(init));

  it("asks for the latest month, then the crimes in each of the 24 months up to it, the latest first", async () => {
    const fetchMock = recordedMonths();

    const result = await crimesWithTrend(
      area,
      createSourceCaller({ fetch: fetchMock }),
      unlimited(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(25);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(LAST_UPDATED_URL);
    const months = monthsAskedFor(fetchMock);
    expect(months[0]).toBe("2026-08");
    expect(months.toSorted()).toEqual(monthsUpTo("2026-08", 24));
    expect(fetchMock).toHaveBeenLastCalledWith(STREET_CRIMES_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: streetCrimesBody(area, "2026-07"),
      signal: expect.any(AbortSignal) as unknown,
    });

    expect(result).toMatchObject({
      status: "ok",
      period: { from: "2026-08", to: "2026-08" },
      data: {
        statistics: {
          month: "2026-08",
          total: 185,
          trend: {
            complete: true,
            total: { last12Months: 2024, previous12Months: 1912, change: 5.9 },
          },
        },
      },
    });
    if (result.status !== "ok") return;
    // The Features are the latest month's only.
    expect(result.data.features).toHaveLength(185);
    expect(new Set(result.data.features.map(({ month }) => month))).toEqual(
      new Set(["2026-08"]),
    );
  });

  it("answers a repeated Search Area from the cache", async () => {
    const fetchMock = recordedMonths();
    const callSource = createSourceCaller({ fetch: fetchMock });

    const first = await crimesWithTrend(area, callSource, unlimited());
    const again = await crimesWithTrend(area, callSource, unlimited());

    expect(again).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(25);
  });

  it("shares the latest month's call with latestCrimes", async () => {
    const fetchMock = recordedMonths();
    const callSource = createSourceCaller({ fetch: fetchMock });

    await Promise.all([
      latestCrimes(area, callSource, unlimited()),
      crimesWithTrend(area, callSource, unlimited()),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(25);
  });

  it("marks the trend incomplete when some months fail, and still gives the latest month", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await crimesWithTrend(
      area,
      createSourceCaller({
        fetch: recordedMonths(
          without(NG17_1AA_CRIMES_BY_MONTH, "2025-01", "2026-02"),
        ),
      }),
      unlimited(),
    );

    expect(result).toMatchObject({
      status: "ok",
      data: {
        statistics: {
          total: 185,
          trend: {
            complete: false,
            missingMonths: ["2025-01", "2026-02"],
            total: {
              last12Months: 2024 - 128,
              previous12Months: 1912 - 169,
              change: null,
            },
          },
        },
      },
    });
  });

  it("asks again next time only for the months that failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let failing = true;
    const fetchMock = vi.fn<typeof fetch>((input, init) =>
      failing && policeMonthOf(init) === "2025-01"
        ? Promise.reject(new Error("connection reset"))
        : recordedMonths()(input, init),
    );
    const callSource = createSourceCaller({ fetch: fetchMock });

    const first = await crimesWithTrend(area, callSource, unlimited());
    failing = false;
    const again = await crimesWithTrend(area, callSource, unlimited());

    expect(first).toMatchObject({
      data: { statistics: { trend: { complete: false } } },
    });
    expect(again).toMatchObject({
      data: { statistics: { trend: { complete: true } } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(26);
    expect(policeMonthOf(fetchMock.mock.calls.at(-1)?.[1])).toBe("2025-01");
  });

  it("is unavailable when the latest month fails, whatever the earlier months do", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await crimesWithTrend(
      area,
      createSourceCaller({
        fetch: recordedMonths(without(NG17_1AA_CRIMES_BY_MONTH, "2026-08")),
      }),
      unlimited(),
    );

    expect(result).toEqual({ status: "unavailable" });
  });

  it("is unavailable, asking for no month, when data.police.uk can't say which is the latest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.reject(new Error("connection reset")),
    );

    const result = await crimesWithTrend(
      area,
      createSourceCaller({ fetch: fetchMock }),
      unlimited(),
    );

    expect(result).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("the data.police.uk rate limit (PRD NFR-1.5)", () => {
  /** data.police.uk as recorded, noting when each request is sent. */
  const timedPolice = () => {
    const sentAt: number[] = [];
    const recorded = policeFixtures({
      lastUpdated,
      crimesByMonth: NG17_1AA_CRIMES_BY_MONTH,
    });
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      sentAt.push(Date.now());
      return recorded(input, init);
    });
    return { fetchMock, sentAt };
  };

  /** The most requests sent in any one second. */
  const mostInOneSecond = (sentAt: readonly number[]) =>
    Math.max(
      ...sentAt.map(
        (start) =>
          sentAt.filter((time) => time >= start && time < start + 1000).length,
      ),
    );

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows at most 10 requests a second, well under data.police.uk's 15", () => {
    expect(1000 / POLICE_INTERVAL_MS).toBeLessThanOrEqual(10);
  });

  it("spaces a Crime Layer's 25 requests 100 ms apart, and still answers within the timeout", async () => {
    const { fetchMock, sentAt } = timedPolice();
    const start = Date.now();

    const answer = crimesWithTrend(
      area,
      createSourceCaller({ fetch: fetchMock }),
      { limiter: createRateLimiter(POLICE_INTERVAL_MS) },
    );
    await vi.advanceTimersByTimeAsync(24 * POLICE_INTERVAL_MS);
    const result = await answer;

    expect(sentAt.map((time) => time - start)).toEqual(
      Array.from({ length: 25 }, (_, turn) => turn * POLICE_INTERVAL_MS),
    );
    expect(mostInOneSecond(sentAt)).toBe(10);
    expect(result).toMatchObject({
      status: "ok",
      data: { statistics: { trend: { complete: true } } },
    });
  });

  it("holds across Search Areas asked for at once", async () => {
    const { fetchMock, sentAt } = timedPolice();
    const callSource = createSourceCaller({ fetch: fetchMock });
    const limiter = createRateLimiter(POLICE_INTERVAL_MS);
    const wider: SearchArea = {
      location: NG17_1AA,
      searchRadius: { miles: 1, metres: 1609.344 },
    };

    const answers = Promise.all([
      crimesWithTrend(area, callSource, { limiter }),
      crimesWithTrend(wider, callSource, { limiter }),
    ]);
    await vi.advanceTimersByTimeAsync(48 * POLICE_INTERVAL_MS);
    await answers;

    // The latest month is asked for once, then 24 months for each.
    expect(sentAt).toHaveLength(49);
    for (const [turn, time] of sentAt.entries()) {
      expect(time - (sentAt[0] ?? 0)).toBe(turn * POLICE_INTERVAL_MS);
    }
    expect(mostInOneSecond(sentAt)).toBe(10);
  });

  it("answers from the cache without waiting for a turn", async () => {
    const { fetchMock } = timedPolice();
    const callSource = createSourceCaller({ fetch: fetchMock });
    const limiter = createRateLimiter(POLICE_INTERVAL_MS);
    const first = crimesWithTrend(area, callSource, { limiter });
    await vi.advanceTimersByTimeAsync(24 * POLICE_INTERVAL_MS);
    await first;
    const start = Date.now();

    const again = await crimesWithTrend(area, callSource, { limiter });

    expect(Date.now()).toBe(start);
    expect(again.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(25);
  });

  it("leaves out a month still waiting for its turn after 8 seconds, and marks the trend incomplete", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { fetchMock } = timedPolice();

    // Turns 450 ms apart. The earlier months are asked for once the latest
    // has answered, at 450 ms, so only those whose turn comes by 8,450 ms are
    // sent: the 17 up to 8,100 ms.
    const interval = 450;
    const answer = crimesWithTrend(
      area,
      createSourceCaller({ fetch: fetchMock }),
      { limiter: createRateLimiter(interval) },
    );
    await vi.advanceTimersByTimeAsync(interval + SOURCE_TIMEOUT_MS);
    const result = await answer;

    expect(fetchMock).toHaveBeenCalledTimes(2 + 17);
    expect(result).toMatchObject({
      status: "ok",
      data: {
        statistics: {
          total: 185,
          trend: {
            complete: false,
            missingMonths: monthsUpTo("2026-07", 6),
          },
        },
      },
    });
  });
});
