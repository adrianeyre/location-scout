import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { milesToMetres, type SearchArea } from "@location-scout/shared";

import { fixtureFetch, neverAnswers, stubFetch } from "../testing/fetch-stubs";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import { DAY_MS, SOURCE_TIMEOUT_MS, createSourceCaller } from "./data-source";
import ng17Applications from "./fixtures/planit-ng17-1aa.json" with { type: "json" };
import { yearsUpTo } from "./land-registry";
import {
  FAILED_FOR_MS,
  RATE_LIMITED_ATTEMPTS,
  planningApplicationStatistics,
  withHomesEstimated,
  retryAfterMs,
} from "./planning-applications";
import {
  APPLICS_URL,
  PLANIT_INTERVAL_MS,
  PLANIT_PAGE_SIZE,
  applicationType,
  applicationsUrl,
  createPlanIt,
  mapApplications,
  planIt,
} from "./planit";
import { createRateLimiter } from "./rate-limiter";

/** The day the recording is asked on, as the fixture-backed API takes it to be. */
const TODAY = "2026-10-08";
const PERIOD = yearsUpTo(TODAY, 3);

const USER_AGENT = "location-scout-test (planit@example.com)";

/** NG17 1AA at each Search Radius: each is a request of its own. */
const areaAt = (miles: 0.25 | 0.5 | 1): SearchArea => ({
  location: NG17_1AA_AREA.location,
  searchRadius: { miles, metres: milesToMetres(miles) },
});

/** One of PlanIt's records, as its answer to our `select` gives it. */
const record = (overrides: Record<string, unknown> = {}) => ({
  name: "Ashfield/V/2025/0425",
  uid: "V/2025/0425",
  area_name: "Ashfield",
  description: "Demolition of existing commercial building",
  address: "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU",
  postcode: "NG17 1BU",
  location_x: -1.26446,
  location_y: 53.12434,
  start_date: "2025-07-21",
  decided_date: null,
  app_state: "Undecided",
  app_size: "Small",
  application_type: "Full Planning Application",
  development_type: null,
  lat: null,
  lng: null,
  link: "https://www.planit.org.uk/planapplic/Ashfield/V/2025/0425/",
  url: null,
  ...overrides,
});

const answer = (records: unknown[], total = records.length) => ({
  from: 0,
  to: records.length - 1,
  total,
  records,
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("applicationsUrl", () => {
  it("asks for the newest applications in a circle holding the Search Area, from the last 3 years and a day", () => {
    const url = new URL(applicationsUrl(NG17_1AA_AREA));

    expect(`${url.origin}${url.pathname}`).toBe(APPLICS_URL);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      lat: "53.123664",
      lng: "-1.264078",
      // 804.672 m, rounded up to the metre.
      krad: "0.805",
      recent: "1096",
      pg_sz: String(PLANIT_PAGE_SIZE),
      sort: "-start_date",
    });
    expect(areaAt(0.25).searchRadius.metres).toBeCloseTo(402.336);
    expect(
      new URL(applicationsUrl(areaAt(0.25))).searchParams.get("krad"),
    ).toBe("0.403");
  });

  it("asks only for the fields the Planning Layer uses, never applicants' or agents' details", () => {
    const select = new URL(applicationsUrl(NG17_1AA_AREA)).searchParams.get(
      "select",
    );

    expect(select?.split(",")).toEqual([
      "name",
      "uid",
      "area_name",
      "description",
      "address",
      "postcode",
      "location_x",
      "location_y",
      "start_date",
      "decided_date",
      "app_state",
      "app_size",
      "link",
      "url",
      "other_fields->application_type",
      "other_fields->development_type",
      "other_fields->lat",
      "other_fields->lng",
    ]);
    expect(select).not.toMatch(/applicant|agent/);
  });

  it("names no day, so it is the same request every day and the 7-day cache can answer it", () => {
    expect(applicationsUrl(NG17_1AA_AREA)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("mapApplications", () => {
  it("maps NG17 1AA's recorded applications, newest first", () => {
    const { features, total } = mapApplications(
      ng17Applications,
      NG17_1AA_AREA,
      PERIOD,
    );

    expect(features).toHaveLength(126);
    expect(total).toBe(126);
    expect(features[0]).toEqual({
      id: "Ashfield/X/2026/0034",
      location: { lat: 53.123264, lng: -1.263218 },
      distanceMetres: expect.closeTo(73, 0) as unknown,
      reference: "X/2026/0034",
      authority: "Ashfield",
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
      approximate: true,
      url: "https://planning.ashfield.gov.uk/planning-applications/planning-application/?RefType=GFPlanning&KeyNo=245360",
      providerUrl: "https://www.planit.org.uk/planapplic/Ashfield/X/2026/0034/",
    });
    const received = features.map(({ receivedOn }) => receivedOn);
    expect(received).toEqual([...received].sort().reverse());
    for (const { distanceMetres } of features) {
      expect(distanceMetres).toBeLessThanOrEqual(
        NG17_1AA_AREA.searchRadius.metres,
      );
    }
  });

  it("counts them by status and type, and lists the two major applications", () => {
    const statistics = planningApplicationStatistics(
      withHomesEstimated(
        mapApplications(ng17Applications, NG17_1AA_AREA, PERIOD),
      ),
    );

    expect(statistics).toEqual({
      count: 126,
      total: 126,
      // Ashfield gives PlanIt no points, so each is at its postcode.
      approximate: 126,
      byStatus: [
        { status: "pending", count: 16 },
        // 61 with conditions and 33 without.
        { status: "approved", count: 94 },
        { status: "refused", count: 14 },
        { status: "withdrawn", count: 2 },
        { status: "other", count: 0 },
      ],
      // Ashfield calls its householder applications full ones.
      byType: [
        { type: "householder", count: 0 },
        { type: "minor", count: 124 },
        { type: "major", count: 2 },
      ],
      major: ["Ashfield/V/2025/0425", "Ashfield/V/2024/0379"],
      // From the descriptions (dwellings.test.ts): 41 homes in 12 approved
      // applications and 9 in 4 pending ones, and 2 approved changes of use
      // to residential units that don't say how many.
      housing: {
        approved: 41,
        pending: 9,
        homes: 50,
        residents: 120,
        applications: 16,
        unstated: 2,
      },
    });
  });

  it.each([
    ["Undecided", "pending"],
    ["Referred", "pending"],
    ["Permitted", "approved"],
    ["Conditions", "approved"],
    ["Rejected", "refused"],
    ["Withdrawn", "withdrawn"],
    ["Unresolved", "other"],
    ["Other", "other"],
    [null, "other"],
  ])("shows PlanIt's %s as %s", (state, status) => {
    const { features } = mapApplications(
      answer([record({ app_state: state })]),
      NG17_1AA_AREA,
      PERIOD,
    );
    expect(features[0]?.status).toBe(status);
  });

  it("marks one placed at a point the council gave as not approximate", () => {
    const { features } = mapApplications(
      answer([record({ lat: 53.12434, lng: -1.26446 })]),
      NG17_1AA_AREA,
      PERIOD,
    );
    expect(features[0]?.approximate).toBe(false);
  });

  it("drops records with no location, outside the Search Area, or older than 3 years", () => {
    const { features, total } = mapApplications(
      answer([
        record({ name: "no-point", location_x: null, location_y: null }),
        // About 1.1 km north of the Location.
        record({ name: "too-far", location_y: 53.1337 }),
        record({ name: "too-old", start_date: "2023-10-08" }),
        record({ name: "first-day", start_date: "2023-10-09" }),
        record({ name: null }),
      ]),
      NG17_1AA_AREA,
      PERIOD,
    );

    expect(features.map(({ id }) => id)).toEqual(["first-day"]);
    expect(total).toBe(1);
  });

  it("counts the applications PlanIt has but didn't give, beyond the newest it gave", () => {
    const { features, total } = mapApplications(
      answer([record()], 1234),
      NG17_1AA_AREA,
      PERIOD,
    );

    expect(features).toHaveLength(1);
    expect(total).toBe(1234);
  });

  it("refuses an answer with no records", () => {
    expect(() =>
      mapApplications({ error: "Bad request" }, NG17_1AA_AREA, PERIOD),
    ).toThrow("PlanIt gave no records");
  });
});

describe("applicationType", () => {
  it("is major for PlanIt's large developments, whatever the council calls them", () => {
    expect(
      applicationType(
        record({ app_size: "Large", application_type: "Householder" }),
      ),
    ).toBe("major");
  });

  it.each([
    ["application_type", "Householder Application"],
    ["application_type", "HOUSEHOLDER"],
    ["development_type", "Householder developments"],
  ])("is householder where the council's %s says %s", (field, value) => {
    expect(
      applicationType(record({ application_type: null, [field]: value })),
    ).toBe("householder");
  });

  it("is minor otherwise, even for several homes", () => {
    expect(applicationType(record({ app_size: "Medium" }))).toBe("minor");
    expect(applicationType(record())).toBe("minor");
  });
});

describe("retryAfterMs", () => {
  it("reads seconds, or a date, or waits as long as it is told without either", () => {
    const now = Date.parse("2026-10-09T11:00:00Z");
    const wait = (header: string | null) =>
      retryAfterMs(header, PLANIT_INTERVAL_MS, now);
    expect(wait("120")).toBe(120_000);
    expect(wait("Fri, 09 Oct 2026 11:05:00 GMT")).toBe(300_000);
    expect(wait("Fri, 09 Oct 2026 10:00:00 GMT")).toBe(0);
    expect(wait(null)).toBe(PLANIT_INTERVAL_MS);
    expect(wait("soon")).toBe(PLANIT_INTERVAL_MS);
  });
});

describe("createPlanIt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /** PlanIt, queued a minute apart, as the app makes it, with its own limiter. */
  const planItWith = (fetchMock: typeof fetch) => {
    const limiter = createRateLimiter(PLANIT_INTERVAL_MS);
    const provider = createPlanIt({ userAgent: USER_AGENT, limiter });
    const callSource = createSourceCaller({ fetch: fetchMock });
    return {
      limiter,
      find: (area: SearchArea) => provider.find(area, PERIOD, callSource),
    };
  };

  it("is cached for 7 days", () => {
    expect(planIt.cacheTtlMs).toBe(7 * DAY_MS);
  });

  it("sends its turn's request at once, with our User-Agent, and answers", async () => {
    const fetchMock = fixtureFetch(ng17Applications);
    const { find } = planItWith(fetchMock);

    const result = await find(NG17_1AA_AREA);

    expect(result).toMatchObject({ status: "ok", period: PERIOD });
    expect(fetchMock).toHaveBeenCalledWith(applicationsUrl(NG17_1AA_AREA), {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: expect.any(AbortSignal) as unknown,
    });
  });

  it("never sends more than 1 request a minute, however many are asked for at once", async () => {
    const sentAt: number[] = [];
    const fetchMock = stubFetch(() => {
      sentAt.push(Date.now());
      return Response.json(ng17Applications);
    });
    const { find } = planItWith(fetchMock);
    const start = Date.now();
    const areas = [areaAt(0.5), areaAt(0.25), areaAt(1)];

    // The first is sent; the others join the queue and are answered `queued`.
    const first = await Promise.all(areas.map(find));
    expect(first.map(({ status }) => status)).toEqual([
      "ok",
      "queued",
      "queued",
    ]);
    // Asking again while they wait sends nothing more.
    expect((await find(areaAt(1))).status).toBe("queued");

    for (let second = 1; second <= 180; second++) {
      await vi.advanceTimersByTimeAsync(1000);
      // Polling, as the frontend does while they wait.
      await Promise.all(areas.map(find));
    }

    expect(sentAt.map((at) => at - start)).toEqual([
      0,
      PLANIT_INTERVAL_MS,
      2 * PLANIT_INTERVAL_MS,
    ]);
    for (const [index, at] of sentAt.entries()) {
      if (index > 0) {
        expect(at - (sentAt[index - 1] ?? 0)).toBeGreaterThanOrEqual(
          PLANIT_INTERVAL_MS,
        );
      }
    }
    // Each answer waited in the queue, and is now cached.
    const later = await Promise.all(areas.map(find));
    expect(later.map(({ status }) => status)).toEqual(["ok", "ok", "ok"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("answers a cached Search Area at once, without waiting for or using a turn", async () => {
    const fetchMock = fixtureFetch(ng17Applications);
    const { find, limiter } = planItWith(fetchMock);
    await find(NG17_1AA_AREA);
    await vi.advanceTimersByTimeAsync(PLANIT_INTERVAL_MS);

    vi.advanceTimersByTime(7 * DAY_MS - PLANIT_INTERVAL_MS - 1);
    const again = await find(NG17_1AA_AREA);

    expect(again.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(limiter.isFree()).toBe(true);
  });

  it("honours a 429's Retry-After, holding back every request, and asks again after it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sentAt: number[] = [];
    let refusals = 1;
    const fetchMock = stubFetch(() => {
      sentAt.push(Date.now());
      if (refusals-- > 0) {
        return new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429,
          headers: { "retry-after": "300" },
        });
      }
      return Response.json(ng17Applications);
    });
    const { find } = planItWith(fetchMock);
    const start = Date.now();

    // Refused, so it waits in the queue for its Retry-After.
    expect((await find(areaAt(0.5))).status).toBe("queued");
    expect((await find(areaAt(1))).status).toBe("queued");
    await vi.advanceTimersByTimeAsync(299_999);
    expect(sentAt).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1 + PLANIT_INTERVAL_MS);

    expect(sentAt.map((at) => at - start)).toEqual([
      0,
      300_000,
      300_000 + PLANIT_INTERVAL_MS,
    ]);
    expect((await find(areaAt(0.5))).status).toBe("ok");
    expect((await find(areaAt(1))).status).toBe("ok");
    expect(console.error).toHaveBeenCalledWith(
      "PlanIt is unavailable",
      expect.objectContaining({ name: "RateLimitedError" }),
    );
  });

  it(`gives up after ${String(RATE_LIMITED_ATTEMPTS)} refusals, and is unavailable`, async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = stubFetch(
      () =>
        new Response(null, { status: 429, headers: { "retry-after": "60" } }),
    );
    const { find } = planItWith(fetchMock);

    expect((await find(NG17_1AA_AREA)).status).toBe("queued");
    // Each refusal asks for a minute's wait.
    await vi.advanceTimersByTimeAsync(
      (RATE_LIMITED_ATTEMPTS - 1) * PLANIT_INTERVAL_MS,
    );

    expect(fetchMock).toHaveBeenCalledTimes(RATE_LIMITED_ATTEMPTS);
    expect(await find(NG17_1AA_AREA)).toEqual({ status: "unavailable" });
    await vi.advanceTimersByTimeAsync(10 * PLANIT_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(RATE_LIMITED_ATTEMPTS);
  });

  it("is unavailable if PlanIt fails, and answers so for a minute rather than queueing it again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = stubFetch(
      () => new Response("Forbidden", { status: 403 }),
    );
    const { find } = planItWith(fetchMock);

    expect(await find(NG17_1AA_AREA)).toEqual({ status: "unavailable" });
    await vi.advanceTimersByTimeAsync(FAILED_FOR_MS - 1);
    expect(await find(NG17_1AA_AREA)).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await find(NG17_1AA_AREA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives a request 8 seconds once its turn has come, however long it waited", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(ng17Applications))
      .mockImplementation(neverAnswers());
    const { find } = planItWith(fetchMock);
    await find(areaAt(0.5));

    expect((await find(areaAt(1))).status).toBe("queued");
    await vi.advanceTimersByTimeAsync(
      PLANIT_INTERVAL_MS + SOURCE_TIMEOUT_MS - 1,
    );
    expect((await find(areaAt(1))).status).toBe("queued");
    await vi.advanceTimersByTimeAsync(1);

    expect(await find(areaAt(1))).toEqual({ status: "unavailable" });
  });
});
