import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fixtureFetch,
  neverAnswers,
  postcodesIoFixtures,
} from "../testing/fetch-stubs";
import { DAY_MS, SOURCE_TIMEOUT_MS, createSourceCaller } from "./data-source";
import nearestAberystwyth from "./fixtures/postcodes-io-nearest-aberystwyth.json" with { type: "json" };
import nearestEdinburgh from "./fixtures/postcodes-io-nearest-edinburgh.json" with { type: "json" };
import nearestMansfield from "./fixtures/postcodes-io-nearest-mansfield.json" with { type: "json" };
import nearestNg171aa from "./fixtures/postcodes-io-nearest-ng17-1aa.json" with { type: "json" };
import nearestNorthSea from "./fixtures/postcodes-io-nearest-north-sea.json" with { type: "json" };
import ng171aa from "./fixtures/postcodes-io-ng17-1aa.json" with { type: "json" };
import notFound from "./fixtures/postcodes-io-not-found.json" with { type: "json" };
import ng17SearchArea from "./fixtures/postcodes-io-ng17-1aa-search-area.json" with { type: "json" };
import suttonParkwaySearchArea from "./fixtures/postcodes-io-sutton-parkway-search-area.json" with { type: "json" };
import { SUTTON_PARKWAY_AREA } from "../testing/overpass-recordings";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import {
  POSTCODES_LIMIT,
  PostcodesIoError,
  lookupPostcode,
  mapNearestResponse,
  mapPostcodeResponse,
  mapPostcodesInSearchArea,
  nearestPostcode,
  postcodeAt,
  postcodesInSearchArea,
  postcodesInSearchAreaUrl,
} from "./postcodes-io";

/** NG17 1AA's local geography, as its recorded lookup names it. */
const NG17_1AA_GEOGRAPHY = {
  postcode: "NG17 1AA",
  ward: "Sutton Central & New Cross",
  lsoa: "Ashfield 005E",
  msoa: "Ashfield 005",
  localAuthority: "Ashfield",
  parliamentaryConstituency: "Ashfield",
};

/** NG17 1AA, as its recorded lookup finds it. */
const NG17_1AA_FOUND = {
  kind: "found",
  postcode: "NG17 1AA",
  location: { lat: 53.123664, lng: -1.264078 },
  country: "England",
  geography: NG17_1AA_GEOGRAPHY,
};

/** The postcode nearest a point in Mansfield, as its recorded lookup finds it. */
const NEAREST_MANSFIELD_FOUND = {
  kind: "found",
  postcode: "NG18 1JJ",
  country: "England",
  geography: {
    postcode: "NG18 1JJ",
    ward: "Central",
    lsoa: "Mansfield 008D",
    msoa: "Mansfield 008",
    localAuthority: "Mansfield",
    parliamentaryConstituency: "Mansfield",
  },
};

describe("mapPostcodeResponse", () => {
  it("maps a recorded NG17 1AA lookup to its Location, country and local geography", () => {
    expect(mapPostcodeResponse(200, ng171aa)).toEqual(NG17_1AA_FOUND);
  });

  it("leaves out any local geography postcodes.io doesn't name", () => {
    const body = {
      ...ng171aa,
      result: {
        ...ng171aa.result,
        admin_ward: null,
        parliamentary_constituency: null,
      },
    };

    expect(mapPostcodeResponse(200, body)).toMatchObject({
      geography: {
        ...NG17_1AA_GEOGRAPHY,
        ward: null,
        parliamentaryConstituency: null,
      },
    });
  });

  it("maps a recorded 404 to not-found", () => {
    expect(mapPostcodeResponse(404, notFound)).toEqual({ kind: "not-found" });
  });

  it("treats a postcode with no coordinates as not-found", () => {
    const body = {
      ...ng171aa,
      result: { ...ng171aa.result, latitude: null, longitude: null },
    };

    expect(mapPostcodeResponse(200, body)).toEqual({ kind: "not-found" });
  });

  it.each([
    ["a server error", 500, { status: 500, error: "Internal server error" }],
    ["a body without a result", 200, { status: 200 }],
    [
      "a postcode without a country",
      200,
      { status: 200, result: { ...ng171aa.result, country: null } },
    ],
    ["a body that is not JSON", 200, null],
  ])("throws on %s", (_label, status, body) => {
    expect(() => mapPostcodeResponse(status, body)).toThrow(PostcodesIoError);
  });
});

describe("lookupPostcode", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("asks postcodes.io for the postcode with a timeout signal", async () => {
    const fetchMock = fixtureFetch(ng171aa);

    const result = await lookupPostcode(
      "NG171AA",
      createSourceCaller({ fetch: fetchMock }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postcodes.io/postcodes/NG171AA",
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }),
    );
    expect(result).toEqual({
      status: "ok",
      data: NG17_1AA_FOUND,
      period: null,
    });
  });

  it("maps a 404 to not-found", async () => {
    const result = await lookupPostcode(
      "ZZ11ZZ",
      createSourceCaller({ fetch: fixtureFetch(notFound, { status: 404 }) }),
    );

    expect(result).toMatchObject({ status: "ok", data: { kind: "not-found" } });
  });

  it("reports a server error as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await lookupPostcode(
      "NG171AA",
      createSourceCaller({
        fetch: fixtureFetch(
          { status: 500, error: "Internal server error" },
          { status: 500 },
        ),
      }),
    );

    expect(result).toEqual({ status: "unavailable" });
  });

  it("reports postcodes.io as unavailable after 8 seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const pending = lookupPostcode(
      "NG171AA",
      createSourceCaller({ fetch: neverAnswers() }),
    );
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);

    expect(await pending).toEqual({ status: "unavailable" });
  });

  it("caches a lookup for 7 days", async () => {
    vi.useFakeTimers();
    const fetchMock = fixtureFetch(ng171aa);
    const callSource = createSourceCaller({ fetch: fetchMock });

    await lookupPostcode("NG171AA", callSource);
    vi.advanceTimersByTime(7 * DAY_MS - 1);
    await lookupPostcode("NG171AA", callSource);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await lookupPostcode("NG171AA", callSource);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("mapNearestResponse", () => {
  it.each([
    ["Mansfield", nearestMansfield, "NG18 1JJ", "England"],
    ["Aberystwyth", nearestAberystwyth, "SY23 2JH", "Wales"],
    ["Edinburgh", nearestEdinburgh, "EH1 3EG", "Scotland"],
  ])(
    "maps a recorded lookup near %s to its nearest postcode and country",
    (_place, body, postcode, country) => {
      expect(mapNearestResponse(200, body)).toMatchObject({
        kind: "found",
        postcode,
        country,
        geography: { postcode },
      });
    },
  );

  it("maps a recorded lookup near Mansfield to its local geography", () => {
    expect(mapNearestResponse(200, nearestMansfield)).toEqual(
      NEAREST_MANSFIELD_FOUND,
    );
  });

  it("maps a recorded lookup in the North Sea to none-nearby", () => {
    expect(mapNearestResponse(200, nearestNorthSea)).toEqual({
      kind: "none-nearby",
    });
  });

  it("treats an empty list as none-nearby", () => {
    expect(mapNearestResponse(200, { status: 200, result: [] })).toEqual({
      kind: "none-nearby",
    });
  });

  it.each([
    ["a server error", 500, { status: 500, error: "Internal server error" }],
    ["a body without a result", 200, { status: 200 }],
    ["a result that is not a list", 200, { status: 200, result: {} }],
    [
      "a postcode without a country",
      200,
      { status: 200, result: [{ postcode: "NG18 1JJ" }] },
    ],
    ["a body that is not JSON", 200, null],
  ])("throws on %s", (_label, status, body) => {
    expect(() => mapNearestResponse(status, body)).toThrow(PostcodesIoError);
  });
});

describe("nearestPostcode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks postcodes.io for the one postcode nearest the Location, within 2 km", async () => {
    const fetchMock = fixtureFetch(nearestMansfield);

    const result = await nearestPostcode(
      { lat: 53.1435, lng: -1.1985 },
      createSourceCaller({ fetch: fetchMock }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postcodes.io/postcodes?lon=-1.1985&lat=53.1435&radius=2000&limit=1",
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }),
    );
    expect(result).toEqual({
      status: "ok",
      data: NEAREST_MANSFIELD_FOUND,
      period: null,
    });
  });

  it("reports a server error as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await nearestPostcode(
      { lat: 53.1435, lng: -1.1985 },
      createSourceCaller({
        fetch: fixtureFetch({ status: 500 }, { status: 500 }),
      }),
    );

    expect(result).toEqual({ status: "unavailable" });
  });
});

describe("postcodeAt", () => {
  const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("describes a Location by the postcode searched for, not another postcode at the same point", async () => {
    // NG17 0AZ shares NG17 1AA's grid reference, and postcodes.io gives it
    // as the nearest.
    expect(mapNearestResponse(200, nearestNg171aa)).toMatchObject({
      postcode: "NG17 0AZ",
    });
    const fetchMock = postcodesIoFixtures({
      lookup: ng171aa,
      nearest: nearestNg171aa,
    });

    const result = await postcodeAt(
      NG17_1AA,
      "NG171AA",
      createSourceCaller({ fetch: fetchMock }),
    );

    expect(result).toEqual({
      status: "ok",
      data: {
        kind: "found",
        postcode: "NG17 1AA",
        country: "England",
        geography: NG17_1AA_GEOGRAPHY,
      },
      period: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing more when the search's lookup is still cached", async () => {
    const fetchMock = postcodesIoFixtures({
      lookup: ng171aa,
      nearest: nearestNg171aa,
    });
    const callSource = createSourceCaller({ fetch: fetchMock });
    await lookupPostcode("NG171AA", callSource);

    await postcodeAt(NG17_1AA, "NG171AA", callSource);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("describes a Location with no postcode searched for by the nearest postcode", async () => {
    const fetchMock = postcodesIoFixtures({
      lookup: ng171aa,
      nearest: nearestMansfield,
    });

    const result = await postcodeAt(
      { lat: 53.1435, lng: -1.1985 },
      null,
      createSourceCaller({ fetch: fetchMock }),
    );

    expect(result).toMatchObject({ data: NEAREST_MANSFIELD_FOUND });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postcodes.io/postcodes?lon=-1.1985&lat=53.1435&radius=2000&limit=1",
      expect.anything(),
    );
  });

  it("uses the nearest postcode when the one searched for is somewhere else", async () => {
    const fetchMock = postcodesIoFixtures({
      lookup: ng171aa,
      nearest: nearestMansfield,
    });

    const result = await postcodeAt(
      { lat: 53.1435, lng: -1.1985 },
      "NG171AA",
      createSourceCaller({ fetch: fetchMock }),
    );

    expect(result).toMatchObject({ data: NEAREST_MANSFIELD_FOUND });
  });

  it("uses the nearest postcode when postcodes.io doesn't know the one searched for", async () => {
    const fetchMock = postcodesIoFixtures({
      lookup: notFound,
      nearest: nearestMansfield,
    });

    const result = await postcodeAt(
      { lat: 53.1435, lng: -1.1985 },
      "ZZ11ZZ",
      createSourceCaller({ fetch: fetchMock }),
    );

    expect(result).toMatchObject({ data: NEAREST_MANSFIELD_FOUND });
  });
});

describe("postcodesInSearchAreaUrl", () => {
  it.each([
    [
      "NG17 1AA's 0.5 mile Search Area",
      NG17_1AA_AREA,
      "https://api.postcodes.io/postcodes?lon=-1.264078&lat=53.123664&radius=805&limit=100",
    ],
    [
      "Sutton Parkway's 0.25 mile Search Area",
      SUTTON_PARKWAY_AREA,
      "https://api.postcodes.io/postcodes?lon=-1.246&lat=53.1145&radius=402&limit=100",
    ],
  ])(
    "asks for every postcode in %s, up to postcodes.io's limit",
    (_label, area, url) => {
      expect(postcodesInSearchAreaUrl(area)).toBe(url);
    },
  );
});

describe("mapPostcodesInSearchArea", () => {
  it("maps NG17 1AA's 100 recorded postcodes, nearest first, and says postcodes.io may have cut them short", () => {
    const { postcodes, truncated } = mapPostcodesInSearchArea(
      200,
      ng17SearchArea,
      NG17_1AA_AREA.location,
    );

    expect(postcodes).toHaveLength(POSTCODES_LIMIT);
    expect(truncated).toBe(true);
    expect(postcodes[0]).toEqual({
      postcode: "NG17 0AZ",
      location: { lat: 53.123664, lng: -1.264078 },
      distanceMetres: 0,
    });
    expect(postcodes.at(-1)).toMatchObject({
      postcode: "NG17 2AF",
      distanceMetres: 430,
    });
  });

  it("maps Sutton Parkway's 7 recorded postcodes, all of its Search Area", () => {
    const { postcodes, truncated } = mapPostcodesInSearchArea(
      200,
      suttonParkwaySearchArea,
      SUTTON_PARKWAY_AREA.location,
    );

    expect(postcodes.map(({ postcode }) => postcode)).toEqual([
      "NG17 5LG",
      "NG17 5LX",
      "NG17 7RB",
      "NG17 7RD",
      "NG17 5FB",
      "NG17 7JR",
      "NG17 5HL",
    ]);
    expect(truncated).toBe(false);
  });

  it("finds no postcodes when postcodes.io answers null", () => {
    expect(
      mapPostcodesInSearchArea(
        200,
        { status: 200, result: null },
        NG17_1AA_AREA.location,
      ),
    ).toEqual({ postcodes: [], truncated: false });
  });

  it("throws for an error", () => {
    expect(() =>
      mapPostcodesInSearchArea(
        500,
        { status: 500, error: "Internal server error" },
        NG17_1AA_AREA.location,
      ),
    ).toThrow(PostcodesIoError);
  });
});

describe("postcodesInSearchArea", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks postcodes.io once, and caches the answer for 7 days", async () => {
    vi.useFakeTimers();
    const fetchMock = fixtureFetch(suttonParkwaySearchArea);
    const callSource = createSourceCaller({ fetch: fetchMock });

    const result = await postcodesInSearchArea(SUTTON_PARKWAY_AREA, callSource);
    vi.advanceTimersByTime(7 * DAY_MS - 1);
    await postcodesInSearchArea(SUTTON_PARKWAY_AREA, callSource);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      postcodesInSearchAreaUrl(SUTTON_PARKWAY_AREA),
      expect.objectContaining({ signal: expect.any(AbortSignal) as unknown }),
    );
    expect(result).toMatchObject({
      status: "ok",
      data: { truncated: false },
      period: null,
    });
    vi.useRealTimers();
  });

  it("reports a server error as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await postcodesInSearchArea(
      NG17_1AA_AREA,
      createSourceCaller({
        fetch: fixtureFetch({ status: 500 }, { status: 500 }),
      }),
    );

    expect(result).toEqual({ status: "unavailable" });
  });
});
