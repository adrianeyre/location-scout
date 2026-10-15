import { afterEach, describe, expect, it, vi } from "vitest";

import { milesToMetres, type SearchArea } from "@location-scout/shared";

import { fixtureFetch, neverAnswers, stubFetch } from "../testing/fetch-stubs";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import { DAY_MS, SOURCE_TIMEOUT_MS, createSourceCaller } from "./data-source";
import ng17Applications from "./fixtures/planwire-ng17-1aa.json" with { type: "json" };
import { yearsUpTo } from "./land-registry";
import {
  planningApplicationStatistics,
  withHomesEstimated,
} from "./planning-applications";
import {
  NEARBY_URL,
  PLANWIRE_LIMIT,
  PLANWIRE_NOTE,
  PLANWIRE_URL,
  applicationStatus,
  applicationType,
  createPlanWire,
  mapNearby,
  msUntilMidnightUtc,
  nearbyUrl,
  planWire,
} from "./planwire";

/** The day the fixture is asked on, as the fixture-backed API takes it to be. */
const TODAY = "2026-10-08";
const PERIOD = yearsUpTo(TODAY, 3);

const API_KEY = "pw_test_location_scout";

/** NG17 1AA at each Search Radius: each is a request of its own. */
const areaAt = (miles: 0.25 | 0.5 | 1): SearchArea => ({
  location: NG17_1AA_AREA.location,
  searchRadius: { miles, metres: milesToMetres(miles) },
});

/** One of PlanWire's records, as its published schema gives it. */
const record = (overrides: Record<string, unknown> = {}) => ({
  id: "6e0c4c8e-2f0b-5b9e-9d55-1f6b0c4a7a10",
  councilId: "ashfield",
  reference: "V/2025/0425",
  url: "https://planning.ashfield.gov.uk/planning-applications/planning-application/?RefType=GFPlanning&KeyNo=243880",
  address: "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU",
  postcode: "NG17 1BU",
  lat: 53.12434,
  lng: -1.26446,
  description: "Demolition of existing commercial building",
  applicationType: "Full Planning Application",
  status: "Pending Consideration",
  decision: null,
  decisionOutcome: "unknown",
  receivedDate: "2025-07-21",
  validatedDate: null,
  decisionDate: null,
  applicationDate: "2025-07-21",
  council: { id: "ashfield", name: "Ashfield District Council" },
  distance_m: 78.4,
  ...overrides,
});

const answer = (records: unknown[], meta: Record<string, unknown> = {}) => ({
  data: records,
  meta: { lat: 53.123664, lng: -1.264078, radius_km: 0.805, ...meta },
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("nearbyUrl", () => {
  it("asks /v1/applications/nearby for as many as PlanWire gives in a circle holding the Search Area", () => {
    const url = new URL(nearbyUrl(NG17_1AA_AREA));

    expect(`${url.origin}${url.pathname}`).toBe(NEARBY_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: "53.123664",
      lng: "-1.264078",
      // 804.672 m, rounded up to the metre.
      radius_km: "0.805",
      limit: String(PLANWIRE_LIMIT),
    });
    expect(PLANWIRE_LIMIT).toBe(100);
    expect(new URL(nearbyUrl(areaAt(0.25))).searchParams.get("radius_km")).toBe(
      "0.403",
    );
    expect(new URL(nearbyUrl(areaAt(1))).searchParams.get("radius_km")).toBe(
      "1.610",
    );
  });

  it("names no day and holds no key, so it is the same request every day and the 7-day cache can keep it", () => {
    const url = nearbyUrl(NG17_1AA_AREA);
    expect(url).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(url).not.toMatch(/key/i);
  });
});

describe("mapNearby", () => {
  it("maps NG17 1AA's applications into the same Features as PlanIt's, newest first, leaving out those with no location or date, or received before the last 3 years", () => {
    const { features, total } = mapNearby(
      ng17Applications,
      NG17_1AA_AREA,
      PERIOD,
    );

    expect(features).toHaveLength(97);
    expect(features.some(({ reference }) => reference.startsWith("ZZ"))).toBe(
      false,
    );
    expect(features[0]).toEqual({
      id: "ashfield/X/2026/0034",
      location: { lat: 53.123264, lng: -1.263218 },
      distanceMetres: expect.closeTo(73, 0) as unknown,
      reference: "X/2026/0034",
      authority: "Ashfield District Council",
      description:
        "Application to determine if prior approval is required for a proposed change of use from commercial, business and service (use class e) to dwellinghouse (use class c3)",
      address:
        "Vencomatic (Gb) Ltd, 7A New Street, Sutton In Ashfield, Nottinghamshire, NG17 1BW",
      postcode: "NG17 1BW",
      status: "pending",
      applicationType: "minor",
      councilType: "PACU",
      receivedOn: "2026-10-08",
      decidedOn: null,
      approximate: false,
      url: "https://planning.ashfield.gov.uk/planning-applications/planning-application/?RefType=GFPlanning&KeyNo=245360",
      providerUrl: null,
    });
    const received = features.map(({ receivedOn }) => receivedOn);
    expect(received).toEqual([...received].sort().reverse());
    for (const { distanceMetres } of features) {
      expect(distanceMetres).toBeLessThanOrEqual(
        NG17_1AA_AREA.searchRadius.metres,
      );
    }
    // It gave as many as it gives, and doesn't say how many it has.
    expect(total).toBeNull();
  });

  it("counts them by status and type, and lists the major application", () => {
    const statistics = planningApplicationStatistics(
      withHomesEstimated(mapNearby(ng17Applications, NG17_1AA_AREA, PERIOD)),
    );

    expect(statistics).toEqual({
      count: 97,
      total: null,
      approximate: 0,
      byStatus: [
        { status: "pending", count: 14 },
        { status: "approved", count: 72 },
        { status: "refused", count: 10 },
        { status: "withdrawn", count: 1 },
        { status: "other", count: 0 },
      ],
      // Ashfield calls its householder applications full ones, and its two
      // major ones "Major Full", one of them within the nearest 97.
      byType: [
        { type: "householder", count: 0 },
        { type: "minor", count: 96 },
        { type: "major", count: 1 },
      ],
      major: ["ashfield/V/2025/0425"],
      // The same descriptions as PlanIt's, but only the nearest 97.
      housing: {
        approved: 27,
        pending: 9,
        homes: 36,
        residents: 86,
        applications: 11,
        unstated: 2,
      },
    });
  });

  it("counts every application PlanWire has when it gave fewer than it gives, across the whole Search Area", () => {
    expect(mapNearby(answer([record()]), NG17_1AA_AREA, PERIOD).total).toBe(1);
    expect(mapNearby({ data: [record()] }, NG17_1AA_AREA, PERIOD).total).toBe(
      1,
    );
  });

  it("may have more when PlanWire searched a smaller circle than it was asked, as a free key's 0.5 km is", () => {
    const { features, total } = mapNearby(
      answer([record()], { radius_km: 0.5 }),
      NG17_1AA_AREA,
      PERIOD,
    );
    expect(features).toHaveLength(1);
    expect(total).toBeNull();
  });

  it("may have more when it gave a free key's samples", () => {
    const { total } = mapNearby(
      {
        ...answer([record({ decisionOutcome: undefined })]),
        access: { tier: "free", omitted: ["status", "decision"] },
      },
      NG17_1AA_AREA,
      PERIOD,
    );
    expect(total).toBeNull();
  });

  it("drops records with no location, outside the Search Area, older than 3 years, or with no council, reference or date", () => {
    const { features, total } = mapNearby(
      answer([
        record({ reference: "no-point", lat: null, lng: null }),
        // About 1.1 km north of the Location.
        record({ reference: "too-far", lat: 53.1337 }),
        record({
          reference: "too-old",
          receivedDate: "2023-10-08",
          applicationDate: "2023-10-08",
        }),
        record({
          reference: "first-day",
          receivedDate: "2023-10-09",
          applicationDate: "2023-10-09",
        }),
        record({
          reference: "no-date",
          receivedDate: null,
          applicationDate: null,
        }),
        record({ reference: null }),
        record({ reference: "no-council", councilId: null }),
      ]),
      NG17_1AA_AREA,
      PERIOD,
    );

    expect(features.map(({ id }) => id)).toEqual(["ashfield/first-day"]);
    expect(total).toBe(1);
  });

  it("takes the day it was validated where the council gives no day it was received", () => {
    const { features } = mapNearby(
      answer([
        record({
          receivedDate: null,
          applicationDate: null,
          validatedDate: "2025-08-01",
        }),
      ]),
      NG17_1AA_AREA,
      PERIOD,
    );
    expect(features[0]?.receivedOn).toBe("2025-08-01");
  });

  it("names the council by PlanWire's id for it if it gives no name", () => {
    const { features } = mapNearby(
      answer([record({ council: null })]),
      NG17_1AA_AREA,
      PERIOD,
    );
    expect(features[0]?.authority).toBe("ashfield");
  });

  it("refuses an answer with no data", () => {
    expect(() =>
      mapNearby({ error: "Invalid API key" }, NG17_1AA_AREA, PERIOD),
    ).toThrow("PlanWire gave no data");
  });
});

describe("applicationStatus", () => {
  it.each([
    ["approved", null, null, "approved"],
    ["refused", "Refuse Permission", "2025-09-11", "refused"],
    ["withdrawn", "Withdrawn", "2025-04-25", "withdrawn"],
    ["other", "Split Decision", "2025-04-25", "other"],
    ["unknown", null, null, "pending"],
    ["unknown", "Prior Approval Not Required", null, "other"],
    ["unknown", null, "2025-04-25", "other"],
    // A free key's samples leave out their decision.
    [undefined, null, null, "other"],
  ])(
    "shows PlanWire's %s, decided %s on %s, as %s",
    (decisionOutcome, decision, decisionDate, status) => {
      expect(
        applicationStatus(record({ decisionOutcome, decision, decisionDate })),
      ).toBe(status);
    },
  );
});

describe("applicationType", () => {
  it.each([
    ["Major Full", "major"],
    ["Full Application - Major", "major"],
    ["Householder Application", "householder"],
    ["HOUSEHOLDER", "householder"],
    ["Full Planning Application", "minor"],
    ["Majorca Road advertisement", "minor"],
    [null, "minor"],
  ])("is %s's type %s, by the council's own type", (councilType, type) => {
    expect(applicationType(councilType)).toBe(type);
  });
});

describe("msUntilMidnightUtc", () => {
  it("is how long until PlanWire's allowance starts again", () => {
    expect(msUntilMidnightUtc(Date.parse("2026-10-09T23:00:00Z"))).toBe(
      60 * 60 * 1000,
    );
    expect(msUntilMidnightUtc(Date.parse("2026-10-09T00:00:00Z"))).toBe(DAY_MS);
  });
});

describe("createPlanWire", () => {
  const planWireWith = (fetchMock: typeof fetch) => {
    const provider = createPlanWire({ apiKey: API_KEY });
    const callSource = createSourceCaller({ fetch: fetchMock });
    return {
      provider,
      find: (area: SearchArea) => provider.find(area, PERIOD, callSource),
    };
  };

  it("is cached for 7 days, and credits PlanWire with its own note", () => {
    const { provider } = planWireWith(fixtureFetch(ng17Applications));
    expect(planWire.cacheTtlMs).toBe(7 * DAY_MS);
    expect(provider).toMatchObject({
      source: { id: "planwire", name: "PlanWire" },
      url: PLANWIRE_URL,
      note: PLANWIRE_NOTE,
    });
  });

  it("sends the request at once, with the key in its X-API-Key header, and answers", async () => {
    const fetchMock = fixtureFetch(ng17Applications);
    const { find } = planWireWith(fetchMock);

    const result = await find(NG17_1AA_AREA);

    expect(result).toMatchObject({
      status: "ok",
      period: PERIOD,
      data: { total: null },
    });
    expect(fetchMock).toHaveBeenCalledWith(nearbyUrl(NG17_1AA_AREA), {
      headers: { accept: "application/json", "x-api-key": API_KEY },
      signal: expect.any(AbortSignal) as unknown,
    });
  });

  it("never waits for a turn: each Search Area is asked for at once", async () => {
    const fetchMock = fixtureFetch(answer([record()]));
    const { find } = planWireWith(fetchMock);

    const results = await Promise.all(
      [areaAt(0.25), areaAt(0.5), areaAt(1)].map(find),
    );

    expect(results.map(({ status }) => status)).toEqual(["ok", "ok", "ok"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("answers a Search Area again from the cache for 7 days", async () => {
    vi.useFakeTimers();
    const fetchMock = fixtureFetch(ng17Applications);
    const { find } = planWireWith(fetchMock);
    await find(NG17_1AA_AREA);

    vi.advanceTimersByTime(7 * DAY_MS - 1);
    expect((await find(NG17_1AA_AREA)).status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1);
    await find(NG17_1AA_AREA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "check PLANWIRE_API_KEY"],
    [402, "needs a paid plan"],
    [500, "PlanWire answered 500"],
  ])(
    "is unavailable if PlanWire answers %i, saying why",
    async (status, why) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { find } = planWireWith(
        stubFetch(() => Response.json({ error: "No" }, { status })),
      );

      expect(await find(NG17_1AA_AREA)).toEqual({ status: "unavailable" });
      expect(console.error).toHaveBeenCalledWith(
        "PlanWire is unavailable",
        expect.objectContaining({
          message: expect.stringContaining(why) as unknown,
        }),
      );
    },
  );

  it("asks nothing more after a 429 until its Retry-After has passed, answering cached Search Areas as ever", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let refusals = 1;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      if (input === nearbyUrl(areaAt(1)) && refusals-- > 0) {
        return Promise.resolve(
          Response.json(
            { error: "Rate limit exceeded" },
            { status: 429, headers: { "retry-after": "600" } },
          ),
        );
      }
      return Promise.resolve(Response.json(answer([record()])));
    });
    const { find } = planWireWith(fetchMock);
    await find(areaAt(0.5));

    expect(await find(areaAt(1))).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(600_000 - 1);
    expect(await find(areaAt(0.25))).toEqual({ status: "unavailable" });
    expect((await find(areaAt(0.5))).status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1);
    expect((await find(areaAt(1))).status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("asks nothing more after a 429 without a Retry-After until midnight UTC, when its daily allowance starts again", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-09T22:00:00Z") });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let refusals = 1;
    const fetchMock = stubFetch(() =>
      refusals-- > 0
        ? Response.json({ error: "Rate limit exceeded" }, { status: 429 })
        : Response.json(answer([record()])),
    );
    const { find } = planWireWith(fetchMock);

    expect(await find(NG17_1AA_AREA)).toEqual({ status: "unavailable" });
    vi.setSystemTime(Date.parse("2026-10-09T23:59:59Z"));
    expect(await find(NG17_1AA_AREA)).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.setSystemTime(Date.parse("2026-10-10T00:00:00Z"));
    expect((await find(NG17_1AA_AREA)).status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is unavailable if PlanWire takes over 8 seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { find } = planWireWith(neverAnswers());

    const result = find(NG17_1AA_AREA);
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);

    expect(await result).toEqual({ status: "unavailable" });
  });
});
