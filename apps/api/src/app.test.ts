import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LAND_FILTERS,
  isApiErrorResponse,
  isAreaResponse,
  isCoverageResponse,
  isGeocodeResponse,
  isHealthResponse,
  isHighlightsResponse,
  isLandParcelResponse,
  isLayerResponse,
  isModesResponse,
  isStreetViewResponse,
  isScoresResponse,
  PLANNING_CONSTRAINT_DATASETS,
  SERVED_LAYER_IDS,
  type AmenitiesLayerResponse,
  type AreaResponse,
  type CrimeLayerResponse,
  type PlanningLayerResponse,
  type GreenSpaceLayerResponse,
  type HighlightsResponse,
  type LandLayerResponse,
  type LandParcelResponse,
  type PreparedManifest,
  type ModesResponse,
  type PropertyLayerResponse,
  type ScoresResponse,
  type TransportLayerResponse,
} from "@location-scout/shared";

import { createApp } from "./app";
import { readConfig } from "./config";
import {
  ACRES_HINT,
  BOOLEAN_HINT,
  CONSTRAINTS_HINT,
  OWNERSHIP_HINT,
  ENGLAND_ONLY,
  FLOOD_ZONE_HINT,
  LAND_PARCEL_HINT,
  LAND_SCOPE_HINT,
  LAND_SORT_HINT,
  LAYER_HINT,
  LOCATION_HINT,
  POSTCODE_HINT,
  RADIUS_HINT,
  ROAD_HINT,
  SEARCH_HINT,
  SOURCES_HINT,
  modeHint,
} from "./routes";
import { SCORING_CONFIG, type ScoringConfig } from "./scoring/config";
import { SOURCE_TIMEOUT_MS } from "./sources/data-source";
import ng171aa from "./sources/fixtures/postcodes-io-ng17-1aa.json" with { type: "json" };
import highStreet from "./sources/fixtures/nominatim-12-high-street-sutton-in-ashfield.json" with { type: "json" };
import nothingFound from "./sources/fixtures/nominatim-not-found.json" with { type: "json" };
import cf101ep from "./sources/fixtures/postcodes-io-cf10-1ep.json" with { type: "json" };
import eh11yz from "./sources/fixtures/postcodes-io-eh1-1yz.json" with { type: "json" };
import nearestAberystwyth from "./sources/fixtures/postcodes-io-nearest-aberystwyth.json" with { type: "json" };
import nearestCf101ep from "./sources/fixtures/postcodes-io-nearest-cf10-1ep.json" with { type: "json" };
import nearestEdinburgh from "./sources/fixtures/postcodes-io-nearest-edinburgh.json" with { type: "json" };
import nearestEh11yz from "./sources/fixtures/postcodes-io-nearest-eh1-1yz.json" with { type: "json" };
import nearestMansfield from "./sources/fixtures/postcodes-io-nearest-mansfield.json" with { type: "json" };
import nearestNg171aa from "./sources/fixtures/postcodes-io-nearest-ng17-1aa.json" with { type: "json" };
import nearestNorthSea from "./sources/fixtures/postcodes-io-nearest-north-sea.json" with { type: "json" };
import notFound from "./sources/fixtures/postcodes-io-not-found.json" with { type: "json" };
import policeLastUpdated from "./sources/fixtures/police-last-updated.json" with { type: "json" };
import ng17Crimes from "./sources/fixtures/police-ng17-1aa-2026-08.json" with { type: "json" };
import { NOMINATIM_INTERVAL_MS } from "./sources/nominatim";
import {
  LAST_UPDATED_URL,
  POLICE_INTERVAL_MS,
  STREET_CRIMES_URL,
} from "./sources/police";
import {
  INTERPRETER_URL,
  OVERPASS_INTERVAL_MS,
  overpassBody,
} from "./sources/overpass";
import { constraintsUrl, outlinesAtUrl } from "./sources/planning-data";
import {
  PLANIT_INTERVAL_MS,
  PLANIT_NOTE,
  PLANIT_URL,
  applicationsUrl,
} from "./sources/planit";
import { PLANWIRE_NOTE, PLANWIRE_URL, nearbyUrl } from "./sources/planwire";
import { EPC_API_URL } from "./sources/epc";
import { SPARQL_URL } from "./sources/land-registry";
import { postcodesInSearchAreaUrl } from "./sources/postcodes-io";
import { createRateLimiter } from "./sources/rate-limiter";
import { openPreparedData, type PreparedData } from "./sources/prepared-data";
import {
  NOTHING_PREPARED,
  PREPARED_DATA_FIXTURE,
  PREPARED_DATA_FIXTURE_DIR,
  TEST_PLANIT_USER_AGENT,
  TEST_USER_AGENT,
  testApp,
} from "./testing/app";
import { jsonAreaSource } from "./testing/area-sources";
import { NG17_1AA_EPC, TEST_EPC_API_KEY } from "./testing/epc-recordings";
import {
  NG17_1AA_OVERPASS,
  SUTTON_PARKWAY_AREA,
} from "./testing/overpass-recordings";
import { NG17_1AA_PLANNING_DATA } from "./testing/planning-data-recordings";
import { NG17_1AA_PLANIT } from "./testing/planit-recordings";
import {
  NG17_1AA_PLANWIRE,
  TEST_PLANWIRE_API_KEY,
} from "./testing/planwire-recordings";
import {
  NG17_1AA_PROPERTY,
  SUTTON_PARKWAY_LAND_SALES,
} from "./testing/property-recordings";
import {
  NG17_1AA_AREA,
  NG17_1AA_CRIMES_BY_MONTH,
} from "./testing/police-ng17-1aa";
import {
  epcFixtures,
  fixtureFetch,
  landRegistryFixtures,
  neverAnswers,
  noNetwork,
  overpassFixtures,
  planItFixtures,
  planWireFixtures,
  planningDataFixtures,
  policeFixtures,
  policeMonthOf,
  postcodesIoFixtures,
  stubFetch,
  withPostcodesIo,
} from "./testing/fetch-stubs";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("answers with the shared health body", async () => {
    const response = await testApp({ fetch: noNetwork() }).request(
      "/api/health",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    const body: unknown = await response.json();
    expect(isHealthResponse(body)).toBe(true);
  });

  it("does not serve routes outside /api", async () => {
    const response = await testApp({ fetch: noNetwork() }).request("/health");

    expect(response.status).toBe(404);
  });
});

describe("GET /api/geocode", () => {
  it("resolves a postcode to its Location with postcodes.io", async () => {
    const fetchMock = fixtureFetch(ng171aa);

    const response = await testApp({ fetch: fetchMock }).request(
      "/api/geocode?q=ng17%201aa",
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isGeocodeResponse(body)).toBe(true);
    expect(body).toEqual({
      query: "ng17 1aa",
      candidates: [
        {
          kind: "postcode",
          label: "NG17 1AA",
          location: { lat: 53.123664, lng: -1.264078 },
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.postcodes.io/postcodes/NG171AA",
      expect.anything(),
    );
  });

  it("answers 404 with a message for an unknown postcode", async () => {
    const fetchMock = fixtureFetch(notFound, { status: 404 });

    const response = await testApp({ fetch: fetchMock }).request(
      "/api/geocode?q=ZZ1%201ZZ",
    );

    expect(response.status).toBe(404);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: "We couldn't find the postcode ZZ1 1ZZ." });
  });

  it.each(["", "q=", "q=%20%20"])(
    "answers 400 without calling a Data Source for ?%s",
    async (search) => {
      const fetchMock = noNetwork();

      const response = await testApp({ fetch: fetchMock }).request(
        `/api/geocode?${search}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: SEARCH_HINT });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("answers a repeated lookup from the cache", async () => {
    const fetchMock = fixtureFetch(ng171aa);
    const app = testApp({ fetch: fetchMock });

    const first = await app.request("/api/geocode?q=NG17%201AA");
    const second = await app.request("/api/geocode?q=ng171aa");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      ...((await first.json()) as object),
      query: "ng171aa",
    });
  });

  it("answers 502 when postcodes.io fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await testApp({ fetch: noNetwork() }).request(
      "/api/geocode?q=NG17%201AA",
    );

    expect(response.status).toBe(502);
    expect(isApiErrorResponse(await response.json())).toBe(true);
  });

  describe("for an address", () => {
    const HIGH_STREET =
      "/api/geocode?q=12%20High%20Street%2C%20Sutton-in-Ashfield";

    it("offers Nominatim's candidates in Great Britain, best first", async () => {
      const fetchMock = fixtureFetch(highStreet);

      const response = await testApp({ fetch: fetchMock }).request(HIGH_STREET);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isGeocodeResponse(body)).toBe(true);
      expect(body).toEqual({
        query: "12 High Street, Sutton-in-Ashfield",
        candidates: [
          {
            kind: "address",
            label:
              "High Street, Sutton in Ashfield, Kirkby in Ashfield Urban District;Sutton in Ashfield Urban District, Huthwaite, Ashfield, Nottinghamshire, East Midlands, England, NG17 2PG",
            location: { lat: 53.1287698, lng: -1.293384 },
          },
          {
            kind: "address",
            label:
              "High Street, Sutton in Ashfield, Kirkby in Ashfield Urban District;Sutton in Ashfield Urban District, Sutton-in-Ashfield, Ashfield, Nottinghamshire, East Midlands, England, NG17 1DH",
            location: { lat: 53.1241078, lng: -1.2621582 },
          },
          {
            kind: "address",
            label:
              "High Street, Sutton in Ashfield, Kirkby in Ashfield Urban District;Sutton in Ashfield Urban District, Stanton Hill, Ashfield, Nottinghamshire, East Midlands, England, NG17 3FY",
            location: { lat: 53.1408244, lng: -1.2773692 },
          },
        ],
      });
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        "https://nominatim.openstreetmap.org/search?q=12+high+street%2C+sutton-in-ashfield&format=jsonv2&countrycodes=gb&limit=5",
        expect.anything(),
      );
    });

    it("identifies itself to Nominatim with NOMINATIM_USER_AGENT", async () => {
      const fetchMock = fixtureFetch(highStreet);

      await testApp({ fetch: fetchMock }).request(HIGH_STREET);

      const [, init] = fetchMock.mock.calls[0] ?? [];
      expect(new Headers(init?.headers).get("user-agent")).toBe(
        TEST_USER_AGENT,
      );
    });

    it.each(["NG17", "10 Downing Street"])(
      "searches %j as an address, not a postcode",
      async (query) => {
        const fetchMock = fixtureFetch(highStreet);

        await testApp({ fetch: fetchMock }).request(
          `/api/geocode?${new URLSearchParams({ q: query }).toString()}`,
        );

        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
          expect.stringMatching(/^https:\/\/nominatim\.openstreetmap\.org\//),
          expect.anything(),
        );
      },
    );

    it("answers 404 with a message when Nominatim finds nothing", async () => {
      const response = await testApp({
        fetch: fixtureFetch(nothingFound),
      }).request("/api/geocode?q=Nowhere%20Lane%2C%20Xyzzyford");

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error:
          'We couldn\'t find an address matching "Nowhere Lane, Xyzzyford". Try adding the town or the postcode.',
      });
    });

    it("answers 502 when Nominatim fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const response = await testApp({
        fetch: fixtureFetch({ error: "busy" }, { status: 503 }),
      }).request(HIGH_STREET);

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "Address search is unavailable. Please try again shortly.",
      });
    });

    it("answers a repeated search from the cache, however it is typed", async () => {
      const fetchMock = fixtureFetch(highStreet);
      const app = testApp({ fetch: fetchMock });

      await app.request(HIGH_STREET);
      const again = await app.request(
        "/api/geocode?q=%2012%20high%20street,%20%20SUTTON-IN-ASHFIELD",
      );

      expect(again.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    describe("in a burst of searches", () => {
      /** Answers like Nominatim, noting when each request was sent. */
      const timedNominatim = () => {
        const sentAt: number[] = [];
        const fetchMock = stubFetch(() => {
          sentAt.push(Date.now());
          return Response.json(highStreet);
        });
        return { fetchMock, sentAt };
      };

      const search = async (app: ReturnType<typeof testApp>, street: number) =>
        app.request(
          `/api/geocode?q=${String(street)}%20High%20Street%2C%20Sutton-in-Ashfield`,
        );

      /** The time between each request and the next, in milliseconds. */
      const gaps = (times: number[]) =>
        times.slice(1).map((time, index) => time - (times[index] ?? 0));

      it("never sends Nominatim more than 1 request a second", async () => {
        vi.useFakeTimers();
        const { fetchMock, sentAt } = timedNominatim();
        const app = testApp({ fetch: fetchMock });

        const responses = Promise.all(
          [1, 2, 3, 4, 5, 6].map((street) => search(app, street)),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(sentAt).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(999);
        expect(sentAt).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(10_000);

        expect((await responses).map(({ status }) => status)).toEqual([
          200, 200, 200, 200, 200, 200,
        ]);
        expect(sentAt).toHaveLength(6);
        for (const gap of gaps(sentAt)) {
          expect(gap).toBeGreaterThanOrEqual(NOMINATIM_INTERVAL_MS);
        }
      });

      it("holds the limit across every app in the process", async () => {
        vi.useFakeTimers();
        const { fetchMock, sentAt } = timedNominatim();
        // As the server makes it: with the process's own limiter.
        const apps = [1, 2, 3].map(() =>
          createApp({ nominatimUserAgent: TEST_USER_AGENT, fetch: fetchMock }),
        );

        const responses = Promise.all(
          apps.map((app, index) => search(app, index + 1)),
        );
        await vi.advanceTimersByTimeAsync(10_000);
        await responses;

        expect(sentAt).toHaveLength(3);
        for (const gap of gaps(sentAt)) {
          expect(gap).toBeGreaterThanOrEqual(NOMINATIM_INTERVAL_MS);
        }
      });

      it("gives up on a search still waiting for its turn after 8 seconds", async () => {
        vi.useFakeTimers();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { fetchMock, sentAt } = timedNominatim();
        const app = testApp({ fetch: fetchMock });

        const responses = Promise.all(
          Array.from({ length: 10 }, (_, index) => search(app, index + 1)),
        );
        await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS + 5_000);

        // Turns at 0 s to 7 s; the rest time out and leave the queue unsent.
        expect((await responses).map(({ status }) => status)).toEqual([
          200, 200, 200, 200, 200, 200, 200, 200, 502, 502,
        ]);
        expect(sentAt).toHaveLength(8);
      });
    });
  });
});

describe("GET /api/area", () => {
  // A Location in England, as postcodes.io sees it; no Data Source beyond.
  const app = testApp({
    fetch: withPostcodesIo(nearestMansfield),
    areaSources: [],
  });

  /** What `/api/area` says of the council before `pnpm data:prepare` has run. */
  const notPrepared = {
    council: {
      status: "not-prepared",
      council: null,
      inLandCoverageArea: false,
    },
    boundaries: {
      id: "ons-council-boundaries",
      name: "ONS Open Geography",
      status: "not-prepared",
      period: null,
    },
  };

  /** The local geography of NG18 1JJ, the postcode `nearestMansfield` finds. */
  const mansfieldGeography = {
    postcode: "NG18 1JJ",
    ward: "Central",
    lsoa: "Mansfield 008D",
    msoa: "Mansfield 008",
    localAuthority: "Mansfield",
    parliamentaryConstituency: "Mansfield",
  };

  it("returns the Location and a 0.5 mile Search Radius by default", async () => {
    const response = await app.request("/api/area?lat=53.123664&lng=-1.264078");

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isAreaResponse(body)).toBe(true);
    expect(body).toEqual({
      location: { lat: 53.123664, lng: -1.264078 },
      searchRadius: { miles: 0.5, metres: 804.672 },
      geography: mansfieldGeography,
      council: notPrepared.council,
      sources: [notPrepared.boundaries],
      layers: [],
    });
  });

  it.each([
    [0.25, 402.336],
    [0.5, 804.672],
    [1, 1609.344],
  ])("accepts a %s mile Search Radius", async (miles, metres) => {
    const response = await app.request(
      `/api/area?lat=53.123664&lng=-1.264078&radius=${String(miles)}`,
    );

    expect(await response.json()).toMatchObject({
      searchRadius: { miles, metres },
    });
  });

  it.each([
    ["no coordinates", "", LOCATION_HINT],
    ["a missing longitude", "lat=53.12", LOCATION_HINT],
    ["a blank latitude", "lat=&lng=-1.26", LOCATION_HINT],
    ["a latitude that is not a number", "lat=north&lng=-1.26", LOCATION_HINT],
    ["a latitude past the pole", "lat=91&lng=-1.26", LOCATION_HINT],
    ["an infinite longitude", "lat=53.12&lng=Infinity", LOCATION_HINT],
    [
      "a Search Radius that is not offered",
      "lat=53.12&lng=-1.26&radius=2",
      RADIUS_HINT,
    ],
    ["a blank Search Radius", "lat=53.12&lng=-1.26&radius=", RADIUS_HINT],
    [
      "a postcode that isn't one",
      "lat=53.12&lng=-1.26&postcode=NG17",
      POSTCODE_HINT,
    ],
    ["a blank postcode", "lat=53.12&lng=-1.26&postcode=", POSTCODE_HINT],
  ])("answers 400 for %s", async (_label, search, message) => {
    const response = await app.request(`/api/area?${search}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: message });
  });

  describe("naming the local geography", () => {
    /** Consults no Data Source beyond postcodes.io, whose calls these tests count. */
    const geographyApp = (fetchMock: typeof fetch) =>
      testApp({ fetch: fetchMock, areaSources: [] });

    const ng17Geography = {
      postcode: "NG17 1AA",
      ward: "Sutton Central & New Cross",
      lsoa: "Ashfield 005E",
      msoa: "Ashfield 005",
      localAuthority: "Ashfield",
      parliamentaryConstituency: "Ashfield",
    };

    it("names the ward, LSOA, MSOA, local authority and constituency of a searched postcode, NG17 1AA", async () => {
      const fetchMock = postcodesIoFixtures({
        lookup: ng171aa,
        nearest: nearestNg171aa,
      });
      const app = geographyApp(fetchMock);

      const response = await app.request(
        "/api/area?lat=53.123664&lng=-1.264078&postcode=NG17%201AA",
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isAreaResponse(body)).toBe(true);
      expect(body).toMatchObject({ geography: ng17Geography });
      // NG17 1AA's own record: NG17 0AZ, the nearest, shares its point.
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        "https://api.postcodes.io/postcodes/NG171AA",
        expect.anything(),
      );
    });

    it("looks a postcode up once for the search and its Search Area", async () => {
      const fetchMock = postcodesIoFixtures({
        lookup: ng171aa,
        nearest: nearestNg171aa,
      });
      const app = geographyApp(fetchMock);

      await app.request("/api/geocode?q=ng17%201aa");
      const response = await app.request(
        "/api/area?lat=53.123664&lng=-1.264078&postcode=ng171aa",
      );

      expect(await response.json()).toMatchObject({ geography: ng17Geography });
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("names the nearest postcode's local geography for a map click", async () => {
      const fetchMock = postcodesIoFixtures({
        lookup: ng171aa,
        nearest: nearestMansfield,
      });

      const response = await geographyApp(fetchMock).request(
        "/api/area?lat=53.1435&lng=-1.1985",
      );

      expect(await response.json()).toMatchObject({
        geography: mansfieldGeography,
      });
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        "https://api.postcodes.io/postcodes?lon=-1.1985&lat=53.1435&radius=2000&limit=1",
        expect.anything(),
      );
    });

    it("names the nearest postcode's local geography if the searched postcode is elsewhere", async () => {
      const fetchMock = postcodesIoFixtures({
        lookup: ng171aa,
        nearest: nearestMansfield,
      });

      const response = await geographyApp(fetchMock).request(
        "/api/area?lat=53.1435&lng=-1.1985&postcode=NG171AA",
      );

      expect(await response.json()).toMatchObject({
        geography: mansfieldGeography,
      });
    });

    it("checks a searched postcode outside England by its own country", async () => {
      const others = fixtureFetch([]);
      const app = testApp({
        fetch: postcodesIoFixtures(
          { lookup: cf101ep, nearest: nearestCf101ep },
          others,
        ),
        areaSources: [jsonAreaSource("police", ["crime"], "/crime")],
      });
      const { latitude, longitude } = cf101ep.result;

      const response = await app.request(
        `/api/area?lat=${String(latitude)}&lng=${String(longitude)}&postcode=CF10%201EP`,
      );

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: `${ENGLAND_ONLY} That Location is in Wales.`,
      });
      expect(others).not.toHaveBeenCalled();
    });
  });

  describe("with Data Sources", () => {
    const period = { from: "2026-07", to: "2026-07" };
    const police = jsonAreaSource("police", ["crime"], "/crime", period);
    const overpass = jsonAreaSource(
      "overpass",
      ["amenities", "transport"],
      "/osm",
    );

    it("reports a timed-out source as unavailable and still returns the rest", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      // Overpass never answers; the police answer straight away.
      const hangs = neverAnswers();
      const fetchMock = withPostcodesIo(
        nearestMansfield,
        vi.fn<typeof fetch>((url, init) =>
          url === "/crime"
            ? Promise.resolve(Response.json([]))
            : hangs(url, init),
        ),
      );
      const app = testApp({
        fetch: fetchMock,
        areaSources: [police, overpass],
      });

      const pending = app.request("/api/area?lat=53.123664&lng=-1.264078");
      await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);
      const response = await pending;

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isAreaResponse(body)).toBe(true);
      expect(body).toEqual({
        location: { lat: 53.123664, lng: -1.264078 },
        searchRadius: { miles: 0.5, metres: 804.672 },
        geography: mansfieldGeography,
        council: notPrepared.council,
        sources: [
          { id: "police", name: "police source", status: "ok", period },
          {
            id: "overpass",
            name: "overpass source",
            status: "unavailable",
            period: null,
          },
          notPrepared.boundaries,
        ],
        layers: [
          { id: "crime", status: "ok" },
          { id: "amenities", status: "unavailable" },
          { id: "transport", status: "unavailable" },
        ],
      });
    });

    it("with sources=false, answers once the Location is checked, without waiting for the Layers' Data Sources (PRD NFR-2.3)", async () => {
      // Overpass would never answer, and the police are never asked.
      const fetchMock = withPostcodesIo(nearestMansfield, neverAnswers());
      const app = testApp({
        fetch: fetchMock,
        areaSources: [police, overpass],
      });

      const response = await app.request(
        "/api/area?lat=53.123664&lng=-1.264078&sources=false",
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isAreaResponse(body)).toBe(true);
      expect(body).toEqual({
        location: { lat: 53.123664, lng: -1.264078 },
        searchRadius: { miles: 0.5, metres: 804.672 },
        geography: mansfieldGeography,
        council: notPrepared.council,
        sources: [notPrepared.boundaries],
        layers: [],
      });
      // Only the check that it is in England.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("consults every source with sources=true, as it does by default", async () => {
      const fetchMock = withPostcodesIo(nearestMansfield, fixtureFetch([]));
      const app = testApp({ fetch: fetchMock, areaSources: [police] });

      const response = await app.request(
        "/api/area?lat=53.123664&lng=-1.264078&sources=true",
      );

      expect(await response.json()).toMatchObject({
        sources: [{ id: "police", status: "ok" }, notPrepared.boundaries],
        layers: [{ id: "crime", status: "ok" }],
      });
    });

    it("refuses sources that is neither true nor false, consulting nothing", async () => {
      const fetchMock = noNetwork();
      const app = testApp({ fetch: fetchMock, areaSources: [police] });

      const response = await app.request(
        "/api/area?lat=53.123664&lng=-1.264078&sources=no",
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: SOURCES_HINT });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("serves a repeated Search Area from the cache", async () => {
      const fetchMock = withPostcodesIo(nearestMansfield, fixtureFetch([]));
      const app = testApp({ fetch: fetchMock, areaSources: [police] });

      const first = await app.request("/api/area?lat=53.123664&lng=-1.264078");
      const second = await app.request("/api/area?lat=53.123664&lng=-1.264078");

      // One check that it is in England, and one call to the police.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await second.json()).toEqual(await first.json());
    });
  });

  it("reports data.police.uk, planning.data.gov.uk, Overpass, postcodes.io, Price Paid, the prepared Schools, Land and Demographics datasets and council boundaries, and the Layers they supply", async () => {
    const app = testApp({
      preparedData: PREPARED_DATA_FIXTURE,
      fetch: postcodesIoFixtures(
        {
          lookup: ng171aa,
          nearest: nearestNg171aa,
          inSearchArea: NG17_1AA_PROPERTY.postcodes,
        },
        policeFixtures(
          { lastUpdated: policeLastUpdated, crimes: ng17Crimes },
          planningDataFixtures(
            NG17_1AA_PLANNING_DATA,
            overpassFixtures(
              NG17_1AA_OVERPASS,
              landRegistryFixtures(NG17_1AA_PROPERTY.pricePaid),
            ),
          ),
        ),
      ),
    });

    const response = await app.request(
      "/api/area?lat=53.123664&lng=-1.264078&postcode=NG17%201AA",
    );

    expect(await response.json()).toMatchObject({
      council: {
        status: "ok",
        council: { code: "E07000170", name: "Ashfield" },
        inLandCoverageArea: true,
      },
      sources: [
        {
          id: "police",
          name: "data.police.uk",
          status: "ok",
          period: { from: "2026-08", to: "2026-08" },
        },
        {
          id: "planning-data",
          name: "planning.data.gov.uk",
          status: "ok",
          // The day it was obtained, which Historic England's statement names.
          period: { from: "2026-10-08", to: "2026-10-08" },
        },
        {
          id: "gias",
          name: "Get Information about Schools",
          status: "ok",
          period: { from: "2026-10-09", to: "2026-10-09" },
        },
        {
          id: "ofsted",
          name: "Ofsted",
          status: "ok",
          period: { from: "2026-08-31", to: "2026-08-31" },
        },
        {
          id: "overpass",
          name: "Overpass API",
          status: "ok",
          period: { from: "2026-10-08", to: "2026-10-08" },
        },
        {
          id: "postcodes-io",
          name: "postcodes.io",
          status: "ok",
          period: null,
        },
        {
          id: "land-registry",
          name: "HM Land Registry Price Paid",
          status: "ok",
          period: { from: "2025-10-09", to: "2026-10-08" },
        },
        {
          id: "land-parcels",
          name: "Land Parcels",
          status: "ok",
          period: { from: "2026-10-08", to: "2026-10-08" },
        },
        {
          id: "ons-output-areas",
          name: "ONS Open Geography",
          status: "ok",
          period: { from: "2021-12", to: "2021-12" },
        },
        {
          id: "ons-census-2021",
          name: "ONS Census 2021",
          status: "ok",
          period: { from: "2021-03-21", to: "2021-03-21" },
        },
        {
          id: "ons-income-estimates",
          name: "ONS small area income estimates",
          status: "ok",
          period: { from: "2023-03", to: "2023-03" },
        },
        {
          id: "indices-of-deprivation",
          name: "English Indices of Deprivation",
          status: "ok",
          period: { from: "2025-10-30", to: "2025-10-30" },
        },
        {
          id: "ons-council-boundaries",
          name: "ONS Open Geography",
          status: "ok",
          period: { from: "2026-05", to: "2026-05" },
        },
      ],
      layers: [
        { id: "crime", status: "ok" },
        { id: "planning", status: "ok" },
        { id: "amenities", status: "ok" },
        { id: "schools", status: "ok" },
        { id: "transport", status: "ok" },
        { id: "green-space", status: "ok" },
        { id: "property", status: "ok" },
        { id: "land", status: "ok" },
        { id: "demographics", status: "ok" },
      ],
    });
  });

  describe("checking the Location is in England", () => {
    const police = jsonAreaSource("police", ["crime"], "/crime");

    /** An app whose police source would answer, if it were ever asked. */
    const appNear = (nearest: unknown) => {
      const others = fixtureFetch([]);
      const fetchMock = withPostcodesIo(nearest, others);
      const app = testApp({ fetch: fetchMock, areaSources: [police] });
      return { app, fetchMock, others };
    };

    it("loads a Location clicked in Nottinghamshire", async () => {
      const { app, fetchMock } = appNear(nearestMansfield);

      const response = await app.request("/api/area?lat=53.1435&lng=-1.1985");

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        location: { lat: 53.1435, lng: -1.1985 },
        layers: [{ id: "crime", status: "ok" }],
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.postcodes.io/postcodes?lon=-1.1985&lat=53.1435&radius=2000&limit=1",
        expect.anything(),
      );
    });

    it.each([
      [
        "clicked in Wales",
        "lat=52.4153&lng=-4.0829",
        nearestAberystwyth,
        "Wales",
      ],
      [
        "clicked in Scotland",
        "lat=55.9533&lng=-3.1883",
        nearestEdinburgh,
        "Scotland",
      ],
    ])(
      "says it covers England only for a Location %s, and loads no Layers",
      async (_label, search, nearest, country) => {
        const { app, others } = appNear(nearest);

        const response = await app.request(`/api/area?${search}`);

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({
          error: `${ENGLAND_ONLY} That Location is in ${country}.`,
        });
        expect(others).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["CF10 1EP", cf101ep, nearestCf101ep, "Wales"],
      ["EH1 1YZ", eh11yz, nearestEh11yz, "Scotland"],
    ])(
      "finds the postcode %s, then says it covers England only",
      async (postcode, lookup, nearest, country) => {
        const app = testApp({ fetch: fixtureFetch(lookup) });
        const geocode = await app.request(
          `/api/geocode?${new URLSearchParams({ q: postcode }).toString()}`,
        );
        const body = (await geocode.json()) as {
          candidates: { location: { lat: number; lng: number } }[];
        };
        const [found] = body.candidates;
        if (!found) throw new Error(`${postcode} was not found`);
        const { others, app: checked } = appNear(nearest);

        const response = await checked.request(
          `/api/area?lat=${String(found.location.lat)}&lng=${String(found.location.lng)}`,
        );

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({
          error: `${ENGLAND_ONLY} That Location is in ${country}.`,
        });
        expect(others).not.toHaveBeenCalled();
      },
    );

    it("explains a Location clicked in the sea, and loads no Layers", async () => {
      const { app, others } = appNear(nearestNorthSea);

      const response = await app.request("/api/area?lat=53.5&lng=1.5");

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: `There is no postcode within 2 km of that Location, so it may be at sea or outside the UK. ${ENGLAND_ONLY} Choose a Location on land in England.`,
      });
      expect(others).not.toHaveBeenCalled();
    });

    it("answers 502, loading no Layers, when postcodes.io fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const others = fixtureFetch([]);
      const fetchMock = withPostcodesIo(
        { status: 500, error: "Internal server error" },
        others,
        { status: 500 },
      );
      const app = testApp({ fetch: fetchMock, areaSources: [police] });

      const response = await app.request("/api/area?lat=53.1435&lng=-1.1985");

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error:
          "We couldn't check that the Location is in England: postcodes.io is unavailable. Please try again shortly.",
      });
      expect(others).not.toHaveBeenCalled();
    });

    it("checks a Location once, then answers from the cache", async () => {
      const { app, fetchMock } = appNear(nearestEdinburgh);

      await app.request("/api/area?lat=55.9533&lng=-3.1883");
      await app.request("/api/area?lat=55.9533&lng=-3.1883&radius=1");

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

const NG17_AREA = "lat=53.123664&lng=-1.264078&radius=0.5&postcode=NG17%201AA";

/** The requests a stubbed `fetch` sent PlanIt. */
const planItCalls = (fetchMock: {
  mock: { calls: Parameters<typeof fetch>[] };
}) =>
  fetchMock.mock.calls.filter(
    ([url]) =>
      typeof url === "string" && url.startsWith("https://www.planit.org.uk/"),
  );

/**
 * NG17 1AA in England, the postcodes in its Search Area, and
 * planning.data.gov.uk, PlanIt, Overpass and Price Paid as they answered when
 * recorded, and data.police.uk as it answered for each month when recorded,
 * except for any months in `failing`.
 */
const recordedFetch = (...failing: string[]) =>
  postcodesIoFixtures(
    {
      lookup: ng171aa,
      nearest: nearestNg171aa,
      inSearchArea: NG17_1AA_PROPERTY.postcodes,
    },
    policeFixtures(
      {
        lastUpdated: policeLastUpdated,
        crimesByMonth: new Map(
          [...NG17_1AA_CRIMES_BY_MONTH].filter(
            ([month]) => !failing.includes(month),
          ),
        ),
      },
      planningDataFixtures(
        NG17_1AA_PLANNING_DATA,
        planItFixtures(
          NG17_1AA_PLANIT,
          overpassFixtures(
            NG17_1AA_OVERPASS,
            landRegistryFixtures(
              NG17_1AA_PROPERTY.pricePaid,
              epcFixtures(NG17_1AA_EPC, TEST_EPC_API_KEY),
            ),
          ),
        ),
      ),
    ),
  );

/**
 * An app whose data.police.uk and Overpass requests don't wait their turn,
 * so tests that aren't about the rate limit don't take seconds. Nothing is
 * prepared, unless `preparedData` says what is.
 */
const unlimitedApp = (
  fetchFn: typeof fetch,
  scoringConfig: ScoringConfig = SCORING_CONFIG,
  preparedData: PreparedData = NOTHING_PREPARED,
) =>
  testApp({
    fetch: fetchFn,
    policeLimiter: createRateLimiter(0),
    overpassLimiter: createRateLimiter(0),
    scoringConfig,
    preparedData,
  });

const MODE_HINT = modeHint(SCORING_CONFIG.modes);

/**
 * The scoring config with one more Scout Mode, added as config and nothing
 * else, to show that is all a new mode needs (PRD FR-4.5).
 */
const WITH_FIXTURE_MODE: ScoringConfig = {
  ...SCORING_CONFIG,
  modes: [
    ...SCORING_CONFIG.modes,
    {
      id: "fixture-commuter",
      name: "Commuter",
      question: "Could I live here and travel to work?",
      weights: {
        safety: 0,
        amenities: 0,
        schools: 0,
        transport: 75,
        "green-space": 0,
        "property-activity": 25,
        "development-activity": 0,
        "planning-freedom": 0,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
      competitors: null,
      highlightedLayers: ["transport"],
      highlights: ["good-bus-service", "station-nearby", "no-station-nearby"],
    },
  ],
};

/** A folder of prepared data for a test to change, which it removes after. */
const preparedDataDir = async (from: string | null = null) => {
  const dir = await mkdtemp(join(tmpdir(), "location-scout-api-data-"));
  if (from) await cp(from, dir, { recursive: true });
  return {
    dir,
    [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }),
  };
};

describe("the council a Location is in, in GET /api/area", () => {
  /** An app whose only Data Source is postcodes.io, saying it is in England. */
  const appWith = (preparedData = PREPARED_DATA_FIXTURE) =>
    testApp({
      fetch: withPostcodesIo(nearestMansfield, noNetwork()),
      areaSources: [],
      preparedData,
    });

  const councilAt = async (app: ReturnType<typeof testApp>, at: string) => {
    const response = await app.request(`/api/area?${at}`);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isAreaResponse(body)).toBe(true);
    return body as AreaResponse;
  };

  const boundaries = (status: string, period: unknown = null) => ({
    id: "ons-council-boundaries",
    name: "ONS Open Geography",
    status,
    period,
  });

  it("finds NG17 1AA in Ashfield, a Land Coverage Area, from the prepared boundaries", async () => {
    const body = await councilAt(appWith(), "lat=53.123664&lng=-1.264078");

    expect(body.council).toEqual({
      status: "ok",
      council: { code: "E07000170", name: "Ashfield" },
      inLandCoverageArea: true,
    });
    expect(body.sources).toEqual([
      boundaries("ok", { from: "2026-05", to: "2026-05" }),
    ]);
  });

  it("finds Mansfield, which isn't a Land Coverage Area", async () => {
    const body = await councilAt(appWith(), "lat=53.1435&lng=-1.1985");

    expect(body.council).toEqual({
      status: "ok",
      council: { code: "E07000174", name: "Mansfield" },
      inLandCoverageArea: false,
    });
  });

  it("finds no council where no prepared boundary covers the Location", async () => {
    // Nottingham: the fixture has only Ashfield's and Mansfield's boundaries.
    const body = await councilAt(appWith(), "lat=52.9536&lng=-1.1505");

    expect(body.council).toEqual({
      status: "ok",
      council: null,
      inLandCoverageArea: false,
    });
  });

  it("is not prepared before pnpm data:prepare, and the Search Area still loads", async () => {
    await using data = await preparedDataDir();
    const app = testApp({
      fetch: withPostcodesIo(nearestMansfield, fixtureFetch([])),
      areaSources: [jsonAreaSource("police", ["crime"], "/crime")],
      preparedData: openPreparedData(join(data.dir, "data")),
    });

    const body = await councilAt(app, "lat=53.123664&lng=-1.264078");

    expect(body.council).toEqual({
      status: "not-prepared",
      council: null,
      inLandCoverageArea: false,
    });
    expect(body.sources).toEqual([
      { id: "police", name: "police source", status: "ok", period: null },
      boundaries("not-prepared"),
    ]);
    expect(body.layers).toEqual([{ id: "crime", status: "ok" }]);
  });

  it("is not prepared if a file the manifest lists is missing", async () => {
    await using data = await preparedDataDir(PREPARED_DATA_FIXTURE_DIR);
    await rm(join(data.dir, "england"), { recursive: true });

    const body = await councilAt(
      appWith(openPreparedData(data.dir)),
      "lat=53.123664&lng=-1.264078",
    );

    expect(body.council.status).toBe("not-prepared");
  });

  it("is unavailable if the manifest isn't one pnpm data:prepare writes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await using data = await preparedDataDir();
    await writeFile(join(data.dir, "manifest.json"), "{ not json");

    const body = await councilAt(
      appWith(openPreparedData(data.dir)),
      "lat=53.123664&lng=-1.264078",
    );

    expect(body.council.status).toBe("unavailable");
    expect(body.sources).toEqual([boundaries("unavailable")]);
  });

  it("reads the prepared data afresh, so a run of pnpm data:prepare shows at once", async () => {
    await using data = await preparedDataDir();
    const app = appWith(openPreparedData(data.dir));
    const before = await councilAt(app, "lat=53.123664&lng=-1.264078");

    await cp(PREPARED_DATA_FIXTURE_DIR, data.dir, { recursive: true });
    const after = await councilAt(app, "lat=53.123664&lng=-1.264078");

    expect(before.council.status).toBe("not-prepared");
    expect(after.council.council).toEqual({
      code: "E07000170",
      name: "Ashfield",
    });
  });
});

describe("GET /api/coverage", () => {
  it("lists the prepared datasets and Land Coverage Areas with their dates, calling no Data Source", async () => {
    const fetchMock = noNetwork();
    const app = testApp({
      fetch: fetchMock,
      preparedData: PREPARED_DATA_FIXTURE,
    });

    const response = await app.request("/api/coverage");

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isCoverageResponse(body)).toBe(true);
    const boundaries = {
      source: "ONS Open Geography",
      sourceUrl:
        "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_May_2026_Boundaries_UK_BGC/FeatureServer/0",
      sourceDate: "2026-05",
      preparedAt: "2026-10-08T12:00:00.000Z",
      attribution: null,
    };
    const preparedAt = "2026-10-08T12:00:00.000Z";
    expect(body).toEqual({
      status: "ok",
      preparedAt: "2026-10-08T12:00:00.000Z",
      datasets: [
        { id: "council-boundaries", name: "Council boundaries", ...boundaries },
        {
          id: "output-area-boundaries",
          name: "Output area boundaries",
          source: "ONS Open Geography",
          sourceUrl:
            "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Output_Areas_2021_EW_BGC_V2/FeatureServer/0",
          sourceDate: "2021-12",
          preparedAt,
          attribution: null,
        },
        {
          id: "census-2021",
          name: "Census 2021 by output area",
          source: "ONS Census 2021",
          sourceUrl: "https://www.nomisweb.co.uk/sources/census_2021_bulk",
          sourceDate: "2021-03-21",
          preparedAt,
          attribution: null,
        },
        {
          id: "income-estimates",
          name: "Household income estimates by MSOA",
          source: "ONS small area income estimates",
          sourceUrl: expect.stringContaining(
            "financialyearending2023/datasetfinal.xlsx",
          ) as unknown,
          sourceDate: "2023-03",
          preparedAt,
          attribution: null,
        },
        {
          id: "indices-of-deprivation",
          name: "English Indices of Deprivation 2025",
          source: "English Indices of Deprivation",
          sourceUrl: expect.stringContaining("File_7_IoD2025") as unknown,
          sourceDate: "2025-10-30",
          preparedAt,
          attribution: null,
        },
        {
          id: "schools",
          name: "Schools register",
          source: "Get Information about Schools",
          sourceUrl: "https://get-information-schools.service.gov.uk/Downloads",
          sourceDate: "2026-10-09",
          preparedAt,
          attribution: null,
        },
        {
          id: "ofsted-inspections",
          name: "Ofsted inspections of state-funded schools",
          source: "Ofsted",
          sourceUrl: expect.stringContaining(
            "latest_inspections_as_at_31_August_2026.csv",
          ) as unknown,
          sourceDate: "2026-08-31",
          preparedAt,
          attribution: null,
        },
        ...["ccod", "ocod"].map((id) => ({
          id,
          name: `${id === "ccod" ? "UK" : "Overseas"} companies that own property in England and Wales`,
          source: "HM Land Registry",
          sourceUrl: `https://use-land-property-data.service.gov.uk/api/v1/datasets/${id}/${id.toUpperCase()}_FULL_2026_10.zip`,
          sourceDate: "2026-10-02",
          preparedAt,
          attribution: {
            statements: [
              "Information produced by HM Land Registry. © Crown copyright 2026.",
            ],
            conditionsUrl: `https://use-land-property-data.service.gov.uk/datasets/${id}/licence/view`,
          },
        })),
      ],
      landCoverageAreas: [
        {
          council: { code: "E07000170", name: "Ashfield" },
          datasets: [
            { id: "council-boundary", name: "Council boundary", ...boundaries },
            {
              id: "inspire-index-polygons",
              name: "INSPIRE Index Polygons",
              source: "HM Land Registry",
              sourceUrl:
                "https://use-land-property-data.service.gov.uk/datasets/inspire/download/Ashfield_District_Council.zip",
              sourceDate: "2026-10-04",
              preparedAt,
              attribution: {
                statements: [
                  "This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry.",
                  "The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063.",
                ],
                conditionsUrl:
                  "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
              },
            },
            ...["osm-land-use", "osm-buildings", "osm-roads", "osm-water"].map(
              (id) => ({
                id,
                name: expect.any(String) as unknown,
                source: "OpenStreetMap via Geofabrik",
                sourceUrl: expect.stringContaining(
                  "nottinghamshire-261008.osm.pbf",
                ) as unknown,
                sourceDate: "2026-10-08",
                preparedAt,
                attribution: null,
              }),
            ),
            ...PLANNING_CONSTRAINT_DATASETS.map((id) => ({
              id,
              name: expect.any(String) as unknown,
              source: "planning.data.gov.uk",
              sourceUrl: `https://files.planning.data.gov.uk/dataset/${id}.parquet`,
              sourceDate: "2026-10-08",
              preparedAt,
              attribution: null,
            })),
            {
              id: "land-parcels",
              name: "Land Parcels",
              source: "OpenStreetMap via Geofabrik",
              sourceUrl: expect.stringContaining(
                "nottinghamshire-261008.osm.pbf",
              ) as unknown,
              sourceDate: "2026-10-08",
              preparedAt,
              attribution: null,
            },
            {
              id: "postcodes",
              name: "Postcodes",
              source: "Ordnance Survey's Code-Point Open",
              sourceUrl:
                "https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect",
              sourceDate: "2026-08",
              preparedAt,
              attribution: {
                statements: [
                  "Contains OS data © Crown copyright and database right 2026.",
                  "Contains Royal Mail data © Royal Mail copyright and database right 2026.",
                  "Contains National Statistics data © Crown copyright and database right 2026.",
                ],
                conditionsUrl:
                  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
              },
            },
          ],
          outOfDate: false,
        },
      ],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-12-04", false],
    ["2026-12-05", true],
  ])(
    "on %s, says whether Ashfield's INSPIRE Index Polygons, published on 4 October 2026, are more than 2 months old: %s",
    async (today, outOfDate) => {
      const app = testApp({
        fetch: noNetwork(),
        preparedData: PREPARED_DATA_FIXTURE,
        today: () => today,
      });

      const response = await app.request("/api/coverage");

      expect(await response.json()).toMatchObject({
        landCoverageAreas: [
          { council: { code: "E07000170", name: "Ashfield" }, outOfDate },
        ],
      });
    },
  );

  it("says nothing is prepared before pnpm data:prepare", async () => {
    await using data = await preparedDataDir();
    const app = testApp({
      fetch: noNetwork(),
      preparedData: openPreparedData(join(data.dir, "data")),
    });

    const response = await app.request("/api/coverage");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "not-prepared",
      preparedAt: null,
      datasets: [],
      landCoverageAreas: [],
    });
  });

  it("says the prepared data is unavailable if its manifest can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await using data = await preparedDataDir();
    await writeFile(
      join(data.dir, "manifest.json"),
      JSON.stringify({ preparedAt: "yesterday" }),
    );
    const app = testApp({
      fetch: noNetwork(),
      preparedData: openPreparedData(data.dir),
    });

    const response = await app.request("/api/coverage");

    expect(await response.json()).toEqual({
      status: "unavailable",
      preparedAt: null,
      datasets: [],
      landCoverageAreas: [],
    });
  });
});

describe("GET /api/street-view", () => {
  it("says Street View is off without GOOGLE_MAPS_API_KEY, giving no key, calling no Data Source", async () => {
    const others = noNetwork();
    const app = testApp({ fetch: others });

    const response = await app.request("/api/street-view");

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isStreetViewResponse(body)).toBe(true);
    expect(body).toEqual({ enabled: false });
    expect(others).not.toHaveBeenCalled();
  });

  it("gives GOOGLE_MAPS_API_KEY to the frontend with it, for no cache to keep, calling no Data Source", async () => {
    const others = noNetwork();
    const { googleMapsApiKey } = readConfig({
      NOMINATIM_USER_AGENT: "location-scout-test (tests@example.com)",
      GOOGLE_MAPS_API_KEY: " AIzaSyTestKey ",
    });
    const app = testApp({ fetch: others, googleMapsApiKey });

    const response = await app.request("/api/street-view");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body: unknown = await response.json();
    expect(isStreetViewResponse(body)).toBe(true);
    expect(body).toEqual({ enabled: true, apiKey: "AIzaSyTestKey" });
    expect(others).not.toHaveBeenCalled();
  });

  it("gives the key nowhere else", async () => {
    const app = testApp({ googleMapsApiKey: "AIzaSyTestKey" });

    for (const path of ["/api/health", "/api/modes", "/api/openapi.json"]) {
      const response = await app.request(path);
      expect(await response.text()).not.toContain("AIzaSyTestKey");
    }
  });
});

describe("GET /api/modes", () => {
  it("lists every Scout Mode, with its weights, competitors and highlighted Layers, calling no Data Source", async () => {
    const others = noNetwork();
    const app = testApp({ fetch: others });

    const response = await app.request("/api/modes");

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isModesResponse(body)).toBe(true);
    if (!isModesResponse(body)) return;
    expect(body.modes.map(({ name }) => name)).toEqual([
      "General",
      "Homebuyer",
      "Buy-to-let",
      "Investment",
      "Development",
      "Retail",
      "Business: Café",
      "Business: Restaurant",
      "Business: Takeaway",
      "Business: Gym",
      "Business: Hairdresser",
      "Business: Convenience store",
      "Business: Dental practice",
      "Business: Nursery",
    ]);
    expect(body.modes[0]?.weights).toEqual({
      safety: 25,
      amenities: 15,
      schools: 10,
      transport: 15,
      "green-space": 10,
      "property-activity": 10,
      "development-activity": 5,
      "planning-freedom": 10,
      demand: 0,
      competition: 0,
      footfall: 0,
    });
    expect(body.modes.find(({ id }) => id === "retail")).toMatchObject({
      question: "Could I open a shop here?",
      competitors: { name: "shops", tags: [{ key: "shop", values: null }] },
    });
    expect(
      body.modes.map(({ id, highlightedLayers }) => [id, highlightedLayers]),
    ).toEqual([
      ["general", []],
      ["homebuyer", []],
      ["buy-to-let", []],
      ["investment", ["planning", "property"]],
      ["development", ["planning", "land"]],
      ["retail", ["amenities"]],
      ["business-cafe", ["amenities"]],
      ["business-restaurant", ["amenities"]],
      ["business-takeaway", ["amenities"]],
      ["business-gym", ["amenities"]],
      ["business-hairdresser", ["amenities"]],
      ["business-convenience-store", ["amenities"]],
      ["business-dental-practice", ["amenities"]],
      ["business-nursery", ["amenities"]],
    ]);
    expect(others).not.toHaveBeenCalled();
  });

  it("lists a Scout Mode added to the config, with no other change", async () => {
    const app = testApp({
      fetch: noNetwork(),
      scoringConfig: WITH_FIXTURE_MODE,
    });

    const body = (await (
      await app.request("/api/modes")
    ).json()) as ModesResponse;

    expect(body.modes.map(({ id }) => id)).toEqual([
      "general",
      "homebuyer",
      "buy-to-let",
      "investment",
      "development",
      "retail",
      "business-cafe",
      "business-restaurant",
      "business-takeaway",
      "business-gym",
      "business-hairdresser",
      "business-convenience-store",
      "business-dental-practice",
      "business-nursery",
      "fixture-commuter",
    ]);
    expect(body.modes.at(-1)).toMatchObject({
      name: "Commuter",
      highlightedLayers: ["transport"],
      highlights: ["no-station-nearby", "station-nearby", "good-bus-service"],
    });
  });
});

describe("GET /api/area/{layer}", () => {
  describe("crime", () => {
    it("gives the latest month's crimes in the Search Area, with their count by category", async () => {
      const app = unlimitedApp(recordedFetch());

      const response = await app.request(`/api/area/crime?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "crime",
        status: "ok",
        sources: [
          {
            id: "police",
            name: "data.police.uk",
            status: "ok",
            period: { from: "2026-08", to: "2026-08" },
          },
        ],
        statistics: {
          month: "2026-08",
          total: 185,
          byCategory: expect.arrayContaining([
            { category: "shoplifting", name: "Shoplifting", count: 29 },
          ]) as unknown,
        },
      });
      expect((body as { features: unknown[] }).features).toHaveLength(185);
      expect((body as { features: unknown[] }).features[0]).toEqual({
        id: "137366010",
        location: { lat: 53.123398, lng: -1.273124 },
        distanceMetres: 604,
        category: "anti-social-behaviour",
        categoryName: "Anti-social behaviour",
        month: "2026-08",
        street: "On or near Petrol Station",
      });
    });

    it("compares the last 12 months' crimes with the 12 before, overall and per category", async () => {
      const app = unlimitedApp(recordedFetch());

      const response = await app.request(`/api/area/crime?${NG17_AREA}`);

      expect(await response.json()).toMatchObject({
        statistics: {
          trend: {
            last12Months: { from: "2025-09", to: "2026-08" },
            previous12Months: { from: "2024-09", to: "2025-08" },
            complete: true,
            missingMonths: [],
            total: { last12Months: 2024, previous12Months: 1912, change: 5.9 },
            byCategory: expect.arrayContaining([
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
            ]) as unknown,
          },
        },
      });
    });

    it("marks the trend incomplete, with no changes, when some months fail", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = unlimitedApp(recordedFetch("2025-03", "2025-11"));

      const response = await app.request(`/api/area/crime?${NG17_AREA}`);

      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        status: "ok",
        statistics: {
          total: 185,
          trend: {
            complete: false,
            missingMonths: ["2025-03", "2025-11"],
            total: { change: null },
          },
        },
      });
      const { trend } = (body as CrimeLayerResponse).statistics ?? {};
      expect(trend?.byCategory.every(({ change }) => change === null)).toBe(
        true,
      );
    });

    it("is unavailable, with no Features, when data.police.uk fails, and still answers", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = testApp({
        fetch: postcodesIoFixtures({
          lookup: ng171aa,
          nearest: nearestNg171aa,
        }),
      });

      const response = await app.request(`/api/area/crime?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toEqual({
        layer: "crime",
        status: "unavailable",
        sources: [
          {
            id: "police",
            name: "data.police.uk",
            status: "unavailable",
            period: null,
          },
        ],
        features: [],
        statistics: null,
      });
    });

    it("is unavailable when data.police.uk takes more than 8 seconds", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = testApp({
        fetch: postcodesIoFixtures(
          { lookup: ng171aa, nearest: nearestNg171aa },
          neverAnswers(),
        ),
      });

      const pending = app.request(`/api/area/crime?${NG17_AREA}`);
      await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);
      const response = await pending;

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: "unavailable",
        features: [],
      });
    });

    it("calls data.police.uk once for each month for the Search Area and its Crime Layer loaded together", async () => {
      const fetchMock = recordedFetch();
      const app = unlimitedApp(fetchMock);

      const [area, crime] = await Promise.all([
        app.request(`/api/area?${NG17_AREA}`),
        app.request(`/api/area/crime?${NG17_AREA}`),
      ]);

      expect(area.status).toBe(200);
      expect(crime.status).toBe(200);
      const policeCalls = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" && url.startsWith("https://data.police.uk/"),
      );
      expect(policeCalls.map(([url]) => url)).toEqual([
        LAST_UPDATED_URL,
        ...Array.from({ length: 24 }, () => STREET_CRIMES_URL),
      ]);
      const months = policeCalls
        .slice(1)
        .map(([, init]) => policeMonthOf(init));
      expect(new Set(months).size).toBe(24);
    });

    it("spaces its data.police.uk requests at most 10 a second, across every app in the process", async () => {
      vi.useFakeTimers();
      const sentAt: number[] = [];
      const recorded = recordedFetch();
      const fetchMock = vi.fn<typeof fetch>((input, init) => {
        if (
          typeof input === "string" &&
          input.startsWith("https://data.police.uk/")
        ) {
          sentAt.push(Date.now());
        }
        return recorded(input, init);
      });
      // As the server makes them: with the process's own limiter.
      const apps = [1, 2].map(() =>
        createApp({ nominatimUserAgent: TEST_USER_AGENT, fetch: fetchMock }),
      );

      const responses = Promise.all([
        apps[0]?.request(`/api/area/crime?${NG17_AREA}`),
        apps[1]?.request(`/api/area/crime?${NG17_AREA}`),
      ]);
      await vi.advanceTimersByTimeAsync(10_000);

      for (const response of await responses) {
        expect(await response?.json()).toMatchObject({
          status: "ok",
          statistics: { trend: { complete: true } },
        });
      }
      // Each app has its own cache, so each asks for all 25.
      expect(sentAt).toHaveLength(50);
      for (const [index, time] of sentAt.entries()) {
        expect(time - (sentAt[index - 1] ?? -Infinity)).toBeGreaterThanOrEqual(
          POLICE_INTERVAL_MS,
        );
        expect(
          sentAt.filter((t) => t >= time && t < time + 1000).length,
        ).toBeLessThanOrEqual(10);
      }
    });

    it("says it covers England only for a Location in Wales, and calls no Data Source for the Layer", async () => {
      const others = noNetwork();
      const app = testApp({
        fetch: withPostcodesIo(nearestAberystwyth, others),
      });

      const response = await app.request(
        "/api/area/crime?lat=52.4153&lng=-4.0829",
      );

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: `${ENGLAND_ONLY} That Location is in Wales.`,
      });
      expect(others).not.toHaveBeenCalled();
    });

    it("explains a Location in the sea", async () => {
      const app = testApp({ fetch: withPostcodesIo(nearestNorthSea) });

      const response = await app.request("/api/area/crime?lat=53.5&lng=1.5");

      expect(response.status).toBe(404);
      expect(isApiErrorResponse(await response.json())).toBe(true);
    });

    it("answers 502 when postcodes.io fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = testApp({
        fetch: withPostcodesIo({ status: 500 }, noNetwork(), { status: 500 }),
      });

      const response = await app.request(
        "/api/area/crime?lat=53.1435&lng=-1.1985",
      );

      expect(response.status).toBe(502);
    });

    it.each([
      ["no coordinates", "", LOCATION_HINT],
      [
        "a Search Radius that is not offered",
        "lat=53.12&lng=-1.26&radius=2",
        RADIUS_HINT,
      ],
      [
        "a postcode that isn't one",
        "lat=53.12&lng=-1.26&postcode=NG17",
        POSTCODE_HINT,
      ],
    ])("answers 400 for %s", async (_label, search, message) => {
      const app = testApp({ fetch: noNetwork() });

      const response = await app.request(`/api/area/crime?${search}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: message });
    });
  });

  describe("planning", () => {
    it("gives the Planning Constraints intersecting the Search Area, counted by type, and those the Location is inside", async () => {
      const app = testApp({ fetch: recordedFetch() });

      const response = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "planning",
        status: "ok",
        sources: [
          {
            id: "planning-data",
            name: "planning.data.gov.uk",
            status: "ok",
            period: { from: "2026-10-08", to: "2026-10-08" },
          },
          {
            id: "planit",
            name: "PlanIt",
            status: "ok",
            period: { from: "2023-10-09", to: "2026-10-08" },
          },
        ],
        statistics: {
          byType: [
            { type: "conservation-area", count: 1, coversLocation: true },
            { type: "listed-building", count: 8, coversLocation: false },
            { type: "article-4-direction", count: 0, coversLocation: false },
            {
              type: "tree-preservation-zone",
              count: 0,
              coversLocation: false,
            },
            { type: "flood-zone", count: 0, coversLocation: false },
          ],
          coveringLocation: [
            {
              type: "conservation-area",
              name: "Sutton in Ashfield Church and Market Place",
            },
          ],
        },
      });
      const { features } = body as PlanningLayerResponse;
      expect(features).toHaveLength(9);
      expect(features[0]).toMatchObject({
        type: "conservation-area",
        distanceMetres: 0,
        shape: { type: "MultiPolygon" },
      });
    });

    it("gives the Planning Applications received in the Search Area in the last 3 years, from PlanIt, counted by status and type, with the major ones", async () => {
      const app = testApp({ fetch: recordedFetch() });

      const response = await app.request(`/api/area/planning?${NG17_AREA}`);

      const { applications } = (await response.json()) as PlanningLayerResponse;
      expect(applications).toMatchObject({
        status: "ok",
        provider: { id: "planit", name: "PlanIt" },
        period: { from: "2023-10-09", to: "2026-10-08" },
        statistics: {
          count: 126,
          total: 126,
          approximate: 126,
          byStatus: [
            { status: "pending", count: 16 },
            { status: "approved", count: 94 },
            { status: "refused", count: 14 },
            { status: "withdrawn", count: 2 },
            { status: "other", count: 0 },
          ],
          byType: [
            { type: "householder", count: 0 },
            { type: "minor", count: 124 },
            { type: "major", count: 2 },
          ],
          major: ["Ashfield/V/2025/0425", "Ashfield/V/2024/0379"],
        },
      });
      expect(applications?.features).toHaveLength(126);
      expect(applications?.features[0]).toMatchObject({
        id: "Ashfield/X/2026/0034",
        status: "pending",
        approximate: true,
      });
    });

    /**
     * NG17 1AA in England, planning.data.gov.uk as recorded, and PlanWire's
     * made-up answer, to `TEST_PLANWIRE_API_KEY` only. PlanIt isn't there.
     */
    const planWireFetch = () =>
      postcodesIoFixtures(
        { lookup: ng171aa, nearest: nearestNg171aa },
        planningDataFixtures(
          NG17_1AA_PLANNING_DATA,
          planWireFixtures(NG17_1AA_PLANWIRE, TEST_PLANWIRE_API_KEY),
        ),
      );

    it("gives them from PlanWire with PLANNING_APPLICATIONS_PROVIDER=planwire and its key, in the very shape PlanIt's come in, and asks PlanIt nothing", async () => {
      const { planWireApiKey } = readConfig({
        NOMINATIM_USER_AGENT: TEST_USER_AGENT,
        PLANNING_APPLICATIONS_PROVIDER: "planwire",
        PLANWIRE_API_KEY: TEST_PLANWIRE_API_KEY,
      });
      const fetchMock = planWireFetch();
      const app = testApp({ fetch: fetchMock, planWireApiKey });

      const planWire: unknown = await (
        await app.request(`/api/area/planning?${NG17_AREA}`)
      ).json();
      const planIt = (await (
        await testApp({ fetch: recordedFetch() }).request(
          `/api/area/planning?${NG17_AREA}`,
        )
      ).json()) as PlanningLayerResponse;

      expect(isLayerResponse(planWire)).toBe(true);
      expect(planWire).toMatchObject({
        status: "ok",
        sources: [
          { id: "planning-data", status: "ok" },
          {
            id: "planwire",
            name: "PlanWire",
            status: "ok",
            period: { from: "2023-10-09", to: "2026-10-08" },
          },
        ],
        applications: {
          status: "ok",
          provider: {
            id: "planwire",
            name: "PlanWire",
            url: PLANWIRE_URL,
            note: PLANWIRE_NOTE,
          },
          period: { from: "2023-10-09", to: "2026-10-08" },
          statistics: {
            count: 97,
            total: null,
            approximate: 0,
            major: ["ashfield/V/2025/0425"],
          },
        },
      });
      // The same Layer, the same Planning Constraints, and Planning
      // Applications with the same fields: only the provider has changed.
      const { applications, ...layer } = planWire as PlanningLayerResponse;
      const { applications: planItApplications, ...planItLayer } = planIt;
      expect(layer.features).toEqual(planItLayer.features);
      expect(layer.statistics).toEqual(planItLayer.statistics);
      expect(Object.keys(applications ?? {})).toEqual(
        Object.keys(planItApplications ?? {}),
      );
      expect(Object.keys(applications?.features[0] ?? {})).toEqual(
        Object.keys(planItApplications?.features[0] ?? {}),
      );
      expect(Object.keys(applications?.statistics ?? {})).toEqual(
        Object.keys(planItApplications?.statistics ?? {}),
      );
      const asked = fetchMock.mock.calls.map(([url]) =>
        typeof url === "string" ? url : "",
      );
      expect(asked).toContain(nearbyUrl(NG17_1AA_AREA));
      expect(asked.some((url) => url.includes("planit.org.uk"))).toBe(false);
    });

    it("falls back to PlanIt when PLANNING_APPLICATIONS_PROVIDER is planwire but PLANWIRE_API_KEY isn't set", async () => {
      const { planWireApiKey, warnings } = readConfig({
        NOMINATIM_USER_AGENT: TEST_USER_AGENT,
        PLANNING_APPLICATIONS_PROVIDER: "planwire",
      });
      const fetchMock = recordedFetch();
      const app = testApp({ fetch: fetchMock, planWireApiKey });

      const response = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(warnings).toHaveLength(1);
      expect(await response.json()).toMatchObject({
        applications: {
          status: "ok",
          provider: { id: "planit", name: "PlanIt" },
          statistics: { count: 126 },
        },
      });
      expect(
        fetchMock.mock.calls.some(
          ([url]) =>
            typeof url === "string" &&
            url.startsWith("https://api.planwire.io/"),
        ),
      ).toBe(false);
    });

    it("says PlanWire's Planning Applications are unavailable if it refuses the key, still giving the Planning Constraints", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = testApp({
        fetch: planWireFetch(),
        planWireApiKey: "pw_live_not_ours",
      });

      const response = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(await response.json()).toMatchObject({
        status: "ok",
        sources: [
          { id: "planning-data", status: "ok" },
          { id: "planwire", status: "unavailable" },
        ],
        statistics: { coveringLocation: [{ type: "conservation-area" }] },
        applications: {
          status: "unavailable",
          provider: { id: "planwire", name: "PlanWire" },
          features: [],
          statistics: null,
        },
      });
      expect(console.error).toHaveBeenCalledWith(
        "PlanWire is unavailable",
        expect.objectContaining({
          message: expect.stringContaining("check PLANWIRE_API_KEY") as unknown,
        }),
      );
    });

    it("asks PlanIt with PLANIT_USER_AGENT, or else the Nominatim User-Agent, which has a way to contact us too", async () => {
      const withOwn = recordedFetch();
      await testApp({ fetch: withOwn }).request(
        `/api/area/planning?${NG17_AREA}`,
      );
      const withNominatim = recordedFetch();
      await testApp({ fetch: withNominatim, planItUserAgent: null }).request(
        `/api/area/planning?${NG17_AREA}`,
      );

      const sentWith = (fetchMock: ReturnType<typeof recordedFetch>) =>
        fetchMock.mock.calls
          .filter(([url]) => url === applicationsUrl(NG17_1AA_AREA))
          .map(([, init]) => new Headers(init?.headers).get("user-agent"));
      expect(sentWith(withOwn)).toEqual([TEST_PLANIT_USER_AGENT]);
      expect(sentWith(withNominatim)).toEqual([TEST_USER_AGENT]);
    });

    it("answers at once while PlanIt's turn is taken, saying the Planning Applications are queued, with the Planning Constraints and every other Layer as ever", async () => {
      const planItLimiter = createRateLimiter(PLANIT_INTERVAL_MS);
      const fetchMock = recordedFetch();
      const app = testApp({ fetch: fetchMock, planItLimiter });
      // Another Search Area's request has just had PlanIt's turn.
      await planItLimiter.wait();

      const [planning, crime] = await Promise.all([
        app.request(`/api/area/planning?${NG17_AREA}`),
        app.request(`/api/area/crime?${NG17_AREA}`),
      ]);

      expect(await planning.json()).toMatchObject({
        status: "ok",
        sources: [{ id: "planning-data", status: "ok" }],
        statistics: { coveringLocation: [{ type: "conservation-area" }] },
        applications: {
          status: "queued",
          provider: { id: "planit", name: "PlanIt" },
          features: [],
          statistics: null,
        },
      });
      expect(await crime.json()).toMatchObject({ status: "ok" });
      expect(
        fetchMock.mock.calls.filter(
          ([url]) =>
            typeof url === "string" &&
            url.startsWith("https://www.planit.org.uk/"),
        ),
      ).toHaveLength(0);
    });

    it("gives the Planning Applications once their turn has come, asked again as the frontend does", async () => {
      // Turns 50 ms apart rather than a minute, so the test needn't wait.
      const planItLimiter = createRateLimiter(50);
      const app = testApp({ fetch: recordedFetch(), planItLimiter });
      await planItLimiter.wait();

      const first = await app.request(`/api/area/planning?${NG17_AREA}`);
      expect(await first.json()).toMatchObject({
        applications: { status: "queued" },
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const again = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(await again.json()).toMatchObject({
        sources: [{ id: "planning-data" }, { id: "planit", status: "ok" }],
        applications: { status: "ok", statistics: { count: 126 } },
      });
    });

    it("sends PlanIt one request when the scores ask for the Planning Applications as the Planning Layer is, and gives both its answer", async () => {
      const fetchMock = recordedFetch();
      const app = testApp({ fetch: fetchMock });

      const [planning, scores] = await Promise.all([
        app.request(`/api/area/planning?${NG17_AREA}`),
        app.request(`/api/scores?${NG17_AREA}&mode=investment`),
      ]);

      expect(await planning.json()).toMatchObject({
        applications: { status: "ok", statistics: { count: 126 } },
      });
      const body = (await scores.json()) as ScoresResponse;
      expect(
        body.categories.find(({ id }) => id === "development-activity"),
      ).toMatchObject({ layer: "planning", status: "ok", score: 54 });
      expect(planItCalls(fetchMock)).toHaveLength(1);
    });

    it("still gives the Planning Applications when planning.data.gov.uk fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = testApp({
        fetch: postcodesIoFixtures(
          { lookup: ng171aa, nearest: nearestNg171aa },
          planningDataFixtures(new Map(), planItFixtures(NG17_1AA_PLANIT)),
        ),
      });

      const response = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(await response.json()).toMatchObject({
        status: "unavailable",
        features: [],
        statistics: null,
        applications: { status: "ok", statistics: { count: 126 } },
      });
    });

    it("uses only planning.data.gov.uk's entity data, never its planning applications", async () => {
      const fetchMock = recordedFetch();
      const app = testApp({ fetch: fetchMock });

      await app.request(`/api/area/planning?${NG17_AREA}`);

      const planningCalls = fetchMock.mock.calls
        .map(([url]) => (typeof url === "string" ? url : ""))
        .filter((url) => url.includes("planning.data.gov.uk"));
      expect(planningCalls).toEqual([
        constraintsUrl(NG17_1AA_AREA),
        outlinesAtUrl(NG17_1AA_AREA.location),
      ]);
      for (const url of planningCalls) {
        expect(url).toMatch(
          /^https:\/\/www\.planning\.data\.gov\.uk\/entity\.json\?/,
        );
        expect(url).not.toContain("planning-application");
      }
    });

    it("is unavailable, with no Features, when planning.data.gov.uk and PlanIt fail, and still answers", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = testApp({
        fetch: postcodesIoFixtures(
          { lookup: ng171aa, nearest: nearestNg171aa },
          planningDataFixtures(new Map()),
        ),
      });

      const response = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        layer: "planning",
        status: "unavailable",
        sources: [
          {
            id: "planning-data",
            name: "planning.data.gov.uk",
            status: "unavailable",
            period: null,
          },
          { id: "planit", name: "PlanIt", status: "unavailable", period: null },
        ],
        features: [],
        statistics: null,
        applications: {
          status: "unavailable",
          provider: {
            id: "planit",
            name: "PlanIt",
            url: PLANIT_URL,
            note: PLANIT_NOTE,
          },
          period: { from: "2023-10-09", to: "2026-10-08" },
          features: [],
          statistics: null,
        },
      });
    });

    it("calls planning.data.gov.uk once for the Search Area and its Planning Layer loaded together", async () => {
      const fetchMock = recordedFetch();
      const app = unlimitedApp(fetchMock);

      const [area, planning] = await Promise.all([
        app.request(`/api/area?${NG17_AREA}`),
        app.request(`/api/area/planning?${NG17_AREA}`),
      ]);

      expect(await area.json()).toMatchObject({
        layers: [
          { id: "crime", status: "ok" },
          { id: "planning", status: "ok" },
          { id: "amenities", status: "ok" },
          { id: "schools", status: "not-prepared" },
          { id: "transport", status: "ok" },
          { id: "green-space", status: "ok" },
          { id: "property", status: "ok" },
          { id: "land", status: "not-prepared" },
          { id: "demographics", status: "not-prepared" },
        ],
      });
      expect(await planning.json()).toMatchObject({ status: "ok" });
      const planningCalls = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.startsWith("https://www.planning.data.gov.uk/"),
      );
      expect(planningCalls).toHaveLength(2);
    });

    it("says it covers England only for a Location in Wales, and calls no Data Source for the Layer", async () => {
      const others = noNetwork();
      const app = testApp({
        fetch: withPostcodesIo(nearestAberystwyth, others),
      });

      const response = await app.request(
        "/api/area/planning?lat=52.4153&lng=-4.0829",
      );

      expect(response.status).toBe(422);
      expect(others).not.toHaveBeenCalled();
    });
  });

  describe("amenities", () => {
    /** The calls made to Overpass. */
    const overpassCalls = (fetchMock: ReturnType<typeof recordedFetch>) =>
      fetchMock.mock.calls.filter(([url]) => url === INTERPRETER_URL);

    it("gives the amenities in the Search Area with their names and types, counted with the nearest of each type", async () => {
      const app = unlimitedApp(recordedFetch());

      const response = await app.request(`/api/area/amenities?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "amenities",
        status: "ok",
        sources: [
          {
            id: "overpass",
            name: "Overpass API",
            status: "ok",
            period: { from: "2026-10-08", to: "2026-10-08" },
          },
        ],
        statistics: { total: 197 },
      });
      const { features, statistics } = body as AmenitiesLayerResponse;
      expect(features).toHaveLength(197);
      expect(features).toContainEqual(
        expect.objectContaining({
          id: "way/251921972",
          type: "cafe",
          name: "Costa",
          osmTag: "amenity=cafe",
          distanceMetres: 110,
        }),
      );
      expect(statistics?.byType).toContainEqual({
        type: "cafe",
        count: 11,
        nearest: { id: "way/251921972", name: "Costa", distanceMetres: 110 },
      });
    });

    it("makes one Overpass request, with the app's User-Agent, for the Search Area, its Amenities Layer and a repeat of both", async () => {
      const fetchMock = recordedFetch();
      const app = unlimitedApp(fetchMock);

      const [area, amenities] = await Promise.all([
        app.request(`/api/area?${NG17_AREA}`),
        app.request(`/api/area/amenities?${NG17_AREA}`),
      ]);
      await app.request(`/api/area?${NG17_AREA}`);
      await app.request(`/api/area/amenities?${NG17_AREA}`);

      expect(await area.json()).toMatchObject({
        layers: expect.arrayContaining([
          { id: "amenities", status: "ok" },
        ]) as unknown,
      });
      expect(await amenities.json()).toMatchObject({ status: "ok" });
      expect(overpassCalls(fetchMock)).toEqual([
        [
          INTERPRETER_URL,
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              "user-agent": TEST_USER_AGENT,
            }) as unknown,
            body: overpassBody(NG17_1AA_AREA),
          }),
        ],
      ]);
    });

    it("makes a new Overpass request for each new Search Area, a second apart", async () => {
      vi.useFakeTimers();
      const fetchMock = withPostcodesIo(
        nearestNg171aa,
        stubFetch(() => Response.json({ elements: [] })),
      );
      const app = testApp({ fetch: fetchMock });

      const responses = Promise.all(
        [0.25, 0.5, 1].map(async (radius) =>
          app.request(
            `/api/area/amenities?lat=53.123664&lng=-1.264078&radius=${String(radius)}`,
          ),
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      const overpassNow = () =>
        fetchMock.mock.calls.filter(([url]) => url === INTERPRETER_URL).length;
      expect(overpassNow()).toBe(1);
      await vi.advanceTimersByTimeAsync(OVERPASS_INTERVAL_MS);
      expect(overpassNow()).toBe(2);
      await vi.advanceTimersByTimeAsync(OVERPASS_INTERVAL_MS);
      expect(overpassNow()).toBe(3);

      for (const response of await responses) {
        expect(await response.json()).toMatchObject({
          status: "ok",
          features: [],
          statistics: { total: 0 },
        });
      }
    });

    it("is unavailable, with no Features, when Overpass fails, and the other Layers still load", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = unlimitedApp(
        postcodesIoFixtures(
          {
            lookup: ng171aa,
            nearest: nearestNg171aa,
            inSearchArea: NG17_1AA_PROPERTY.postcodes,
          },
          policeFixtures(
            { lastUpdated: policeLastUpdated, crimes: ng17Crimes },
            planningDataFixtures(
              NG17_1AA_PLANNING_DATA,
              overpassFixtures(
                new Map(),
                landRegistryFixtures(NG17_1AA_PROPERTY.pricePaid),
              ),
            ),
          ),
        ),
      );

      const amenities = await app.request(`/api/area/amenities?${NG17_AREA}`);
      const area = await app.request(`/api/area?${NG17_AREA}`);

      expect(amenities.status).toBe(200);
      expect(await amenities.json()).toEqual({
        layer: "amenities",
        status: "unavailable",
        sources: [
          {
            id: "overpass",
            name: "Overpass API",
            status: "unavailable",
            period: null,
          },
        ],
        features: [],
        statistics: null,
      });
      expect(await area.json()).toMatchObject({
        layers: [
          { id: "crime", status: "ok" },
          { id: "planning", status: "ok" },
          { id: "amenities", status: "unavailable" },
          { id: "schools", status: "not-prepared" },
          { id: "transport", status: "unavailable" },
          { id: "green-space", status: "unavailable" },
          { id: "property", status: "ok" },
          { id: "land", status: "not-prepared" },
          { id: "demographics", status: "not-prepared" },
        ],
      });
    });

    it("says it covers England only for a Location in Wales, and calls no Data Source for the Layer", async () => {
      const others = noNetwork();
      const app = testApp({
        fetch: withPostcodesIo(nearestAberystwyth, others),
      });

      const response = await app.request(
        "/api/area/amenities?lat=52.4153&lng=-4.0829",
      );

      expect(response.status).toBe(422);
      expect(others).not.toHaveBeenCalled();
    });
  });

  describe("transport", () => {
    /** The calls made to Overpass. */
    const overpassCalls = (fetchMock: ReturnType<typeof recordedFetch>) =>
      fetchMock.mock.calls.filter(([url]) => url === INTERPRETER_URL);

    it("gives the bus stops, car parks and EV chargers in the Search Area, its footpaths and cycle routes, and the nearest railway station", async () => {
      const app = unlimitedApp(recordedFetch());

      const response = await app.request(`/api/area/transport?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "transport",
        status: "ok",
        sources: [
          {
            id: "overpass",
            name: "Overpass API",
            status: "ok",
            period: { from: "2026-10-08", to: "2026-10-08" },
          },
        ],
        statistics: {
          facilities: [
            { type: "railway-station", count: 0 },
            { type: "bus-stop", count: 58 },
            { type: "car-park", count: 33 },
            { type: "ev-charger", count: 1 },
          ],
          routes: [
            { type: "footpath", lengthMetres: 9094 },
            { type: "cycle-route", lengthMetres: 2923 },
          ],
          nearestStation: {
            id: "node/3170173970",
            name: "Sutton Parkway",
            distanceMetres: 1628,
            inSearchArea: false,
          },
          stationSearchMetres: 5000,
        },
      });
      const { features } = body as TransportLayerResponse;
      expect(features).toHaveLength(94);
      expect(features).toContainEqual(
        expect.objectContaining({
          id: "node/502386902",
          type: "bus-stop",
          name: "Silk Street",
          osmTag: "highway=bus_stop",
          distanceMetres: 184,
        }),
      );
      expect(features).toContainEqual(
        expect.objectContaining({
          id: "cycle-route",
          type: "cycle-route",
          lengthMetres: 2923,
          shape: expect.objectContaining({
            type: "MultiLineString",
          }) as unknown,
        }),
      );
    });

    it("shares one Overpass request between the Search Area, its Amenities Layer and its Transport Layer", async () => {
      const fetchMock = recordedFetch();
      const app = unlimitedApp(fetchMock);

      const [area, amenities, transport] = await Promise.all([
        app.request(`/api/area?${NG17_AREA}`),
        app.request(`/api/area/amenities?${NG17_AREA}`),
        app.request(`/api/area/transport?${NG17_AREA}`),
      ]);
      await app.request(`/api/area/transport?${NG17_AREA}`);

      expect(await area.json()).toMatchObject({
        layers: expect.arrayContaining([
          { id: "amenities", status: "ok" },
          { id: "transport", status: "ok" },
        ]) as unknown,
      });
      expect(await amenities.json()).toMatchObject({ status: "ok" });
      expect(await transport.json()).toMatchObject({ status: "ok" });
      expect(overpassCalls(fetchMock)).toEqual([
        [
          INTERPRETER_URL,
          expect.objectContaining({
            method: "POST",
            body: overpassBody(NG17_1AA_AREA),
          }),
        ],
      ]);
    });

    it("is unavailable, with no Features, when Overpass fails, and the other Layers still load", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = unlimitedApp(
        postcodesIoFixtures(
          { lookup: ng171aa, nearest: nearestNg171aa },
          policeFixtures(
            { lastUpdated: policeLastUpdated, crimes: ng17Crimes },
            planningDataFixtures(
              NG17_1AA_PLANNING_DATA,
              overpassFixtures(new Map()),
            ),
          ),
        ),
      );

      const transport = await app.request(`/api/area/transport?${NG17_AREA}`);
      const planning = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(transport.status).toBe(200);
      expect(await transport.json()).toEqual({
        layer: "transport",
        status: "unavailable",
        sources: [
          {
            id: "overpass",
            name: "Overpass API",
            status: "unavailable",
            period: null,
          },
        ],
        features: [],
        statistics: null,
      });
      expect(await planning.json()).toMatchObject({ status: "ok" });
    });

    it("says it covers England only for a Location in Wales, and calls no Data Source for the Layer", async () => {
      const others = noNetwork();
      const app = testApp({
        fetch: withPostcodesIo(nearestAberystwyth, others),
      });

      const response = await app.request(
        "/api/area/transport?lat=52.4153&lng=-4.0829",
      );

      expect(response.status).toBe(422);
      expect(others).not.toHaveBeenCalled();
    });
  });

  describe("green-space", () => {
    /** The calls made to Overpass. */
    const overpassCalls = (fetchMock: ReturnType<typeof recordedFetch>) =>
      fetchMock.mock.calls.filter(([url]) => url === INTERPRETER_URL);

    it("gives the parks, playgrounds, nature reserves and woods in the Search Area with their outlines, and the nearest park", async () => {
      const app = unlimitedApp(recordedFetch());

      const response = await app.request(`/api/area/green-space?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "green-space",
        status: "ok",
        sources: [
          {
            id: "overpass",
            name: "Overpass API",
            status: "ok",
            period: { from: "2026-10-08", to: "2026-10-08" },
          },
        ],
        statistics: {
          total: 13,
          byType: [
            { type: "park", count: 6 },
            { type: "playground", count: 3 },
            { type: "nature-reserve", count: 0 },
            { type: "wood", count: 4 },
          ],
          nearestPark: {
            id: "way/1289231258",
            name: null,
            distanceMetres: 104,
            inSearchArea: true,
            coversLocation: false,
          },
          parkSearchMetres: 2000,
        },
      });
      const { features } = body as GreenSpaceLayerResponse;
      expect(features).toHaveLength(13);
      expect(features).toContainEqual(
        expect.objectContaining({
          id: "way/309700889",
          type: "park",
          name: "Sutton Lawn",
          osmTag: "leisure=park",
          distanceMetres: 524,
          coversLocation: false,
          shape: expect.objectContaining({
            type: "MultiPolygon",
          }) as unknown,
        }),
      );
    });

    it("shares one Overpass request between the Search Area and its Amenities, Transport and Green space Layers", async () => {
      const fetchMock = recordedFetch();
      const app = unlimitedApp(fetchMock);

      const [area, ...layers] = await Promise.all([
        app.request(`/api/area?${NG17_AREA}`),
        app.request(`/api/area/amenities?${NG17_AREA}`),
        app.request(`/api/area/transport?${NG17_AREA}`),
        app.request(`/api/area/green-space?${NG17_AREA}`),
      ]);
      await app.request(`/api/area/green-space?${NG17_AREA}`);

      expect(await area.json()).toMatchObject({
        layers: expect.arrayContaining([
          { id: "amenities", status: "ok" },
          { id: "transport", status: "ok" },
          { id: "green-space", status: "ok" },
        ]) as unknown,
      });
      for (const layer of layers) {
        expect(await layer.json()).toMatchObject({ status: "ok" });
      }
      expect(overpassCalls(fetchMock)).toEqual([
        [
          INTERPRETER_URL,
          expect.objectContaining({
            method: "POST",
            body: overpassBody(NG17_1AA_AREA),
          }),
        ],
      ]);
    });

    it("is unavailable, with no Features, when Overpass fails, and the other Layers still load", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = unlimitedApp(
        postcodesIoFixtures(
          { lookup: ng171aa, nearest: nearestNg171aa },
          policeFixtures(
            { lastUpdated: policeLastUpdated, crimes: ng17Crimes },
            planningDataFixtures(
              NG17_1AA_PLANNING_DATA,
              overpassFixtures(new Map()),
            ),
          ),
        ),
      );

      const greenSpace = await app.request(
        `/api/area/green-space?${NG17_AREA}`,
      );
      const planning = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(greenSpace.status).toBe(200);
      expect(await greenSpace.json()).toEqual({
        layer: "green-space",
        status: "unavailable",
        sources: [
          {
            id: "overpass",
            name: "Overpass API",
            status: "unavailable",
            period: null,
          },
        ],
        features: [],
        statistics: null,
      });
      expect(await planning.json()).toMatchObject({ status: "ok" });
    });

    it("says it covers England only for a Location in Wales, and calls no Data Source for the Layer", async () => {
      const others = noNetwork();
      const app = testApp({
        fetch: withPostcodesIo(nearestAberystwyth, others),
      });

      const response = await app.request(
        "/api/area/green-space?lat=52.4153&lng=-4.0829",
      );

      expect(response.status).toBe(422);
      expect(others).not.toHaveBeenCalled();
    });
  });

  describe("property", () => {
    /** The calls made to postcodes.io for the postcodes in the Search Area, and to Price Paid. */
    const propertyCalls = (fetchMock: ReturnType<typeof recordedFetch>) =>
      fetchMock.mock.calls.filter(
        ([url]) =>
          url === SPARQL_URL || url === postcodesInSearchAreaUrl(NG17_1AA_AREA),
      );

    it("gives the last 12 months' sales in the Search Area's postcodes, with their count, median and mean price, the change in median price, each sale's history, and says postcodes.io cut them short", async () => {
      const app = unlimitedApp(recordedFetch());

      const response = await app.request(`/api/area/property?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "property",
        status: "ok",
        sources: [
          {
            id: "postcodes-io",
            name: "postcodes.io",
            status: "ok",
            period: null,
          },
          {
            id: "land-registry",
            name: "HM Land Registry Price Paid",
            status: "ok",
            period: { from: "2025-10-09", to: "2026-10-08" },
          },
        ],
        statistics: {
          period: { from: "2025-10-09", to: "2026-10-08" },
          all: { count: 24, median: 182000, mean: 187000 },
          byType: [
            { type: "detached", count: 8, median: 242500, mean: 241813 },
            { type: "semi-detached", count: 6, median: 172000, mean: 162333 },
            { type: "terraced", count: 6, median: 146000, mean: 155750 },
            { type: "flat", count: 0, median: null, mean: null },
            { type: "other", count: 4, median: 160500, mean: 161250 },
          ],
          byTenure: [
            { tenure: "freehold", count: 24 },
            { tenure: "leasehold", count: 0 },
          ],
          byNewBuild: [
            { newBuild: true, count: 0 },
            { newBuild: false, count: 24 },
          ],
          medianChange: {
            twelveMonths: {
              period: { from: "2024-10-09", to: "2025-10-08" },
              prices: { count: 54, median: 160000 },
              change: 13.8,
            },
            fiveYears: {
              period: { from: "2020-10-09", to: "2021-10-08" },
              prices: { count: 39, median: 150000 },
              change: 21.3,
            },
          },
          postcodes: {
            searched: 100,
            limit: 100,
            truncated: true,
            reachMetres: 430,
          },
        },
      });
      const { features } = body as PropertyLayerResponse;
      expect(features).toHaveLength(24);
      expect(features).toContainEqual({
        id: "4E75C29E-328E-8922-E063-4804A8C094D0",
        location: expect.any(Object) as unknown,
        distanceMetres: 42,
        price: 141000,
        date: "2026-02-16",
        type: "other",
        tenure: "freehold",
        newBuild: false,
        address: "6 BROOK STREET, SUTTON-IN-ASHFIELD",
        postcode: "NG17 1AL",
        history: [
          {
            id: "4E75C29E-328E-8922-E063-4804A8C094D0",
            price: 141000,
            date: "2026-02-16",
            change: null,
          },
        ],
        epc: null,
      });
      expect(
        features.find(({ address }) => address.startsWith("88 HIGH PAVEMENT"))
          ?.history,
      ).toEqual([
        {
          id: "5A7B802C-F597-1886-E063-4704A8C021AE",
          price: 173000,
          date: "2026-05-29",
          change: -5.7,
        },
        {
          id: "44F406B6-B93C-1095-E063-4704A8C048D4",
          price: 183500,
          date: "2024-10-06",
          change: null,
        },
      ]);
    });

    it("asks postcodes.io once and Price Paid each of its four queries once for the Search Area and its Property Layer loaded together, and again for neither", async () => {
      const fetchMock = recordedFetch();
      const app = unlimitedApp(fetchMock);

      const [area, layer] = await Promise.all([
        app.request(`/api/area?${NG17_AREA}`),
        app.request(`/api/area/property?${NG17_AREA}`),
      ]);
      await app.request(`/api/area/property?${NG17_AREA}`);

      expect(await area.json()).toMatchObject({
        layers: expect.arrayContaining([
          { id: "property", status: "ok" },
        ]) as unknown,
      });
      expect(await layer.json()).toMatchObject({ status: "ok" });
      expect(propertyCalls(fetchMock).map(([url]) => url)).toEqual([
        postcodesInSearchAreaUrl(NG17_1AA_AREA),
        SPARQL_URL,
        SPARQL_URL,
        SPARQL_URL,
        SPARQL_URL,
      ]);
      expect(
        new Set(propertyCalls(fetchMock).map(([, init]) => init?.body)),
      ).toEqual(new Set([undefined, ...NG17_1AA_PROPERTY.pricePaid.keys()]));
    });

    it("is unavailable, with no Features, when Price Paid fails, and the other Layers still load", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const app = unlimitedApp(
        postcodesIoFixtures(
          {
            lookup: ng171aa,
            nearest: nearestNg171aa,
            inSearchArea: NG17_1AA_PROPERTY.postcodes,
          },
          planningDataFixtures(
            NG17_1AA_PLANNING_DATA,
            landRegistryFixtures(new Map()),
          ),
        ),
      );

      const property = await app.request(`/api/area/property?${NG17_AREA}`);
      const planning = await app.request(`/api/area/planning?${NG17_AREA}`);

      expect(property.status).toBe(200);
      expect(await property.json()).toEqual({
        layer: "property",
        status: "unavailable",
        sources: [
          {
            id: "postcodes-io",
            name: "postcodes.io",
            status: "ok",
            period: null,
          },
          {
            id: "land-registry",
            name: "HM Land Registry Price Paid",
            status: "unavailable",
            period: null,
          },
        ],
        features: [],
        statistics: null,
        epc: null,
      });
      expect(await planning.json()).toMatchObject({ status: "ok" });
    });

    it("is unavailable, without asking Price Paid, when postcodes.io can't give the Search Area's postcodes", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const sparql = landRegistryFixtures(NG17_1AA_PROPERTY.pricePaid);
      const app = unlimitedApp(
        postcodesIoFixtures(
          {
            lookup: ng171aa,
            nearest: nearestNg171aa,
            inSearchArea: new Map([
              [
                postcodesInSearchAreaUrl(NG17_1AA_AREA),
                { status: 500, error: "Internal server error" },
              ],
            ]),
          },
          sparql,
        ),
      );

      const response = await app.request(`/api/area/property?${NG17_AREA}`);

      expect(await response.json()).toEqual({
        layer: "property",
        status: "unavailable",
        sources: [
          {
            id: "postcodes-io",
            name: "postcodes.io",
            status: "unavailable",
            period: null,
          },
        ],
        features: [],
        statistics: null,
        epc: null,
      });
      expect(sparql).not.toHaveBeenCalled();
    });

    describe("with EPC_API_KEY", () => {
      /** The calls made to the EPC API. */
      const epcCalls = (fetchMock: ReturnType<typeof recordedFetch>) =>
        fetchMock.mock.calls.flatMap(([url]) =>
          typeof url === "string" && url.startsWith(EPC_API_URL) ? [url] : [],
        );
      const epcApp = (fetchMock: typeof fetch) =>
        testApp({ fetch: fetchMock, epcApiKey: TEST_EPC_API_KEY });

      it("gives the homes in the Search Area's postcodes by band, and each sale of a house matched to an EPC with its band and price per m², from the made-up certificates", async () => {
        const fetchMock = recordedFetch();
        const app = epcApp(fetchMock);

        const response = await app.request(`/api/area/property?${NG17_AREA}`);

        const body: unknown = await response.json();
        expect(isLayerResponse(body)).toBe(true);
        const { sources, features, epc } = body as PropertyLayerResponse;
        expect(sources.at(-1)).toEqual({
          id: "epc",
          name: "Energy Performance of Buildings Data API",
          status: "ok",
          period: null,
        });
        expect(epc).toEqual({
          status: "ok",
          statistics: {
            byBand: [
              { band: "A", count: 0 },
              { band: "B", count: 4 },
              { band: "C", count: 10 },
              { band: "D", count: 12 },
              { band: "E", count: 6 },
              { band: "F", count: 2 },
              { band: "G", count: 1 },
            ],
            homes: 35,
            postcodes: { searched: 100, unanswered: 0 },
            sales: { lookedFor: 20, matched: 19 },
            pricePerSquareMetre: { count: 18, median: 1894, mean: 1904 },
          },
        });
        const byAddress = (start: string) =>
          features.find(({ address }) => address.startsWith(start))?.epc;
        expect(byAddress("88 HIGH PAVEMENT")).toEqual({
          status: "matched",
          certificate: {
            certificateNumber: "9901-0000-0000-0000-0005",
            registrationDate: "2019-03-14",
            currentBand: "D",
            details: {
              potentialBand: "B",
              floorAreaSquareMetres: 92,
              pricePerSquareMetre: 1880,
            },
          },
        });
        // Its 2022 certificate, current when it sold in 2026, not its 2014 one.
        expect(byAddress("35 PORTLAND STREET")).toMatchObject({
          certificate: { registrationDate: "2022-11-20", currentBand: "D" },
        });
        expect(byAddress("97 SILK STREET")).toMatchObject({
          certificate: {
            details: { floorAreaSquareMetres: null, pricePerSquareMetre: null },
          },
        });
        expect(byAddress("9 KENSINGTON CLOSE")).toEqual({
          status: "unmatched",
        });
        expect(byAddress("6 BROOK STREET")).toBeNull();
        // One search for each postcode, and the certificate of each sale matched.
        expect(epcCalls(fetchMock)).toHaveLength(100 + 19);
      });

      it("never answers with a certificate's address, which its licence allows only for energy-efficiency purposes", async () => {
        const app = epcApp(recordedFetch());

        const response = await app.request(`/api/area/property?${NG17_AREA}`);

        const text = await response.text();
        expect(text).not.toMatch(/Priestsic Rd|The Twitchell|Wayside Cottage/);
        expect(text).not.toMatch(/addressLine|addressParts/);
      });

      it("asks the EPC API nothing again for the same Search Area", async () => {
        const fetchMock = recordedFetch();
        const app = epcApp(fetchMock);

        await app.request(`/api/area/property?${NG17_AREA}`);
        await app.request(`/api/area/property?${NG17_AREA}`);

        expect(epcCalls(fetchMock)).toHaveLength(119);
      });

      it("still gives the sales when the EPC API refuses the key, with their EPCs unavailable", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const app = testApp({
          fetch: recordedFetch(),
          epcApiKey: "not-the-tests-token",
        });

        const response = await app.request(`/api/area/property?${NG17_AREA}`);

        const body = (await response.json()) as PropertyLayerResponse;
        expect(body.status).toBe("ok");
        expect(body.statistics?.all.count).toBe(24);
        expect(body.epc).toEqual({ status: "unavailable", statistics: null });
        expect(body.sources.at(-1)).toMatchObject({
          id: "epc",
          status: "unavailable",
        });
        expect(body.features[0]?.epc).toEqual({ status: "unavailable" });
      });
    });

    it("leaves EPCs out, asking the EPC API nothing, without EPC_API_KEY", async () => {
      const fetchMock = recordedFetch();
      const app = unlimitedApp(fetchMock);

      const response = await app.request(`/api/area/property?${NG17_AREA}`);

      const body = (await response.json()) as PropertyLayerResponse;
      expect(body.epc).toBeNull();
      expect(body.features.every(({ epc }) => epc === null)).toBe(true);
      expect(body.sources.map(({ id }) => id)).toEqual([
        "postcodes-io",
        "land-registry",
      ]);
      expect(
        fetchMock.mock.calls.some(
          ([url]) => typeof url === "string" && url.startsWith(EPC_API_URL),
        ),
      ).toBe(false);
    });

    it("says it covers England only for a Location in Wales, and calls no Data Source for the Layer", async () => {
      const others = noNetwork();
      const app = testApp({
        fetch: withPostcodesIo(nearestAberystwyth, others),
      });

      const response = await app.request(
        "/api/area/property?lat=52.4153&lng=-4.0829",
      );

      expect(response.status).toBe(422);
      expect(others).not.toHaveBeenCalled();
    });
  });

  describe("schools", () => {
    it("gives the schools in the Search Area by phase with their latest Ofsted judgement, and the nearest primary and secondary, from the prepared data, calling no Data Source but postcodes.io", async () => {
      const fetchMock = recordedFetch();
      const app = testApp({
        fetch: fetchMock,
        preparedData: PREPARED_DATA_FIXTURE,
      });

      const response = await app.request(`/api/area/schools?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "schools",
        status: "ok",
        sources: [
          {
            id: "gias",
            status: "ok",
            period: { from: "2026-10-09", to: "2026-10-09" },
          },
          {
            id: "ofsted",
            status: "ok",
            period: { from: "2026-08-31", to: "2026-08-31" },
          },
        ],
        features: [
          {
            id: "139063",
            name: "Sutton Community Academy",
            phase: "secondary",
            distanceMetres: 232,
            judgement: "report-card",
            inspection: { kind: "report-card", inspectedOn: "2026-04-21" },
          },
          { id: "122463", phase: "primary", judgement: "no-overall-grade" },
          { id: "122468", phase: "primary", judgement: "good" },
          {
            id: "146288",
            phase: "special",
            judgement: "none",
            inspection: null,
            inspectorate: "ISI",
          },
        ],
        statistics: {
          total: 4,
          nearestPrimary: {
            name: "Croft Primary School",
            distanceMetres: 519,
            inSearchArea: true,
          },
          primarySearchMetres: 2400,
          nearestSecondary: {
            name: "Sutton Community Academy",
            distanceMetres: 232,
          },
          secondarySearchMetres: 6000,
        },
      });
      expect(
        fetchMock.mock.calls.every(
          ([url]) =>
            typeof url === "string" &&
            url.startsWith("https://api.postcodes.io/"),
        ),
      ).toBe(true);
    });

    it("is not prepared before pnpm data:prepare, and the other Layers still load", async () => {
      const app = unlimitedApp(recordedFetch());

      const [schools, area] = await Promise.all([
        app.request(`/api/area/schools?${NG17_AREA}`),
        app.request(`/api/area?${NG17_AREA}`),
      ]);

      expect(await schools.json()).toEqual({
        layer: "schools",
        status: "not-prepared",
        sources: [
          {
            id: "gias",
            name: "Get Information about Schools",
            status: "not-prepared",
            period: null,
          },
          {
            id: "ofsted",
            name: "Ofsted",
            status: "not-prepared",
            period: null,
          },
        ],
        features: [],
        statistics: null,
      });
      expect(await area.json()).toMatchObject({
        layers: expect.arrayContaining([
          { id: "crime", status: "ok" },
          { id: "amenities", status: "ok" },
          { id: "schools", status: "not-prepared" },
        ]) as unknown,
      });
    });

    it("says it covers England only for a Location in Wales, reading no prepared data", async () => {
      const manifest = vi.fn(() => PREPARED_DATA_FIXTURE.manifest());
      const app = testApp({
        fetch: withPostcodesIo(nearestAberystwyth, noNetwork()),
        preparedData: { ...PREPARED_DATA_FIXTURE, manifest },
      });

      const response = await app.request(
        "/api/area/schools?lat=52.4153&lng=-4.0829",
      );

      expect(response.status).toBe(422);
      expect(manifest).not.toHaveBeenCalled();
    });
  });

  describe("demographics", () => {
    it("gives the output areas reaching into the Search Area, and its estimated population, from the prepared data, calling no Data Source but postcodes.io", async () => {
      const fetchMock = recordedFetch();
      const app = testApp({
        fetch: fetchMock,
        preparedData: PREPARED_DATA_FIXTURE,
      });

      const response = await app.request(`/api/area/demographics?${NG17_AREA}`);

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "demographics",
        status: "ok",
        sources: [
          { id: "ons-output-areas", status: "ok" },
          { id: "ons-census-2021", status: "ok" },
          { id: "ons-income-estimates", status: "ok" },
          { id: "indices-of-deprivation", status: "ok" },
        ],
        statistics: {
          outputAreas: 44,
          population: 9052,
          households: 3951,
          medianAge: 40.1,
          householdIncome: {
            averagePounds: 38890,
            msoas: 5,
            englandMedianPounds: 44091,
          },
          deprivation: {
            atLocation: { code: "E01027976", decile: 2 },
            lowestDecile: 1,
            highestDecile: 10,
          },
        },
      });
      expect(
        fetchMock.mock.calls.every(
          ([url]) =>
            typeof url === "string" &&
            url.startsWith("https://api.postcodes.io/"),
        ),
      ).toBe(true);
    });

    it("is not prepared before pnpm data:prepare, and the other Layers still load", async () => {
      const app = unlimitedApp(recordedFetch());

      const [demographics, area] = await Promise.all([
        app.request(`/api/area/demographics?${NG17_AREA}`),
        app.request(`/api/area?${NG17_AREA}`),
      ]);

      expect(await demographics.json()).toEqual({
        layer: "demographics",
        status: "not-prepared",
        sources: [
          {
            id: "ons-output-areas",
            name: "ONS Open Geography",
            status: "not-prepared",
            period: null,
          },
          {
            id: "ons-census-2021",
            name: "ONS Census 2021",
            status: "not-prepared",
            period: null,
          },
          {
            id: "ons-income-estimates",
            name: "ONS small area income estimates",
            status: "not-prepared",
            period: null,
          },
          {
            id: "indices-of-deprivation",
            name: "English Indices of Deprivation",
            status: "not-prepared",
            period: null,
          },
        ],
        features: [],
        statistics: null,
      });
      expect(await area.json()).toMatchObject({
        layers: expect.arrayContaining([
          { id: "crime", status: "ok" },
          { id: "property", status: "ok" },
          { id: "demographics", status: "not-prepared" },
        ]) as unknown,
      });
    });

    it("says it covers England only for a Location in Wales, reading no prepared data", async () => {
      const manifest = vi.fn(() => PREPARED_DATA_FIXTURE.manifest());
      const app = testApp({
        fetch: withPostcodesIo(nearestAberystwyth, noNetwork()),
        preparedData: { ...PREPARED_DATA_FIXTURE, manifest },
      });

      const response = await app.request(
        "/api/area/demographics?lat=52.4153&lng=-4.0829",
      );

      expect(response.status).toBe(422);
      expect(manifest).not.toHaveBeenCalled();
    });
  });

  it.each(["weather", "Crime"])(
    "answers 400 for a Layer that is not served: %s",
    async (layer) => {
      const app = testApp({ fetch: noNetwork() });

      const response = await app.request(
        `/api/area/${layer}?lat=53.123664&lng=-1.264078`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: LAYER_HINT });
    },
  );
});

describe("GET /api/scores", () => {
  const scoresOf = (body: ScoresResponse) =>
    Object.fromEntries(body.categories.map(({ id, score }) => [id, score]));

  it("scores NG17 1AA's Search Area in every category, leaving out Schools before pnpm data:prepare, and weighs them into the Location Score", async () => {
    const app = unlimitedApp(recordedFetch());

    const response = await app.request(`/api/scores?${NG17_AREA}`);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isScoresResponse(body)).toBe(true);
    if (!isScoresResponse(body)) return;
    expect(scoresOf(body)).toEqual({
      // 2,024 crimes in 2.03 km², 995 a year per km²; up 5.9%.
      safety: 0,
      // All 13 types of amenity, and 197 amenities.
      amenities: 100,
      // Not prepared.
      schools: null,
      // Sutton Parkway 1,628 m away, and 58 bus stops.
      transport: 88,
      // A park 104 m away, and 13 green spaces.
      "green-space": 100,
      // 24 sales at 1.67 points each.
      "property-activity": 40,
      // 124 minor and 2 major Planning Applications from PlanIt: 134, at 0.4
      // points each.
      "development-activity": 54,
      // Inside a conservation area.
      "planning-freedom": 80,
    });
    expect(body.categories[0]?.breakdown.map(({ value }) => value)).toEqual([
      995, 5.9,
    ]);
    // (0×25 + 100×15 + 88×15 + 100×10 + 40×10 + 54×5 + 80×10) ÷ 90 = 58.8
    expect(body.location).toMatchObject({
      score: 59,
      leftOut: [
        { id: "schools", layer: "schools", status: "not-prepared", weight: 10 },
      ],
    });
    expect(body.location.counted.map(({ id }) => id)).toEqual([
      "safety",
      "amenities",
      "transport",
      "green-space",
      "property-activity",
      "development-activity",
      "planning-freedom",
    ]);
  });

  it("says Development activity and Demand are queued while PlanIt's turn is taken, asking it nothing more", async () => {
    const planItLimiter = createRateLimiter(PLANIT_INTERVAL_MS);
    const fetchMock = recordedFetch();
    const app = testApp({
      fetch: fetchMock,
      planItLimiter,
      preparedData: PREPARED_DATA_FIXTURE,
    });
    // Another Search Area's request has just had PlanIt's turn.
    await planItLimiter.wait();

    const inMode = async (mode: string) =>
      (await (
        await app.request(`/api/scores?${NG17_AREA}&mode=${mode}`)
      ).json()) as ScoresResponse;
    const [investment, cafe] = await Promise.all([
      inMode("investment"),
      inMode("business-cafe"),
    ]);

    expect(investment.location.leftOut).toEqual([
      {
        id: "development-activity",
        layer: "planning",
        status: "queued",
        weight: 25,
      },
    ]);
    expect(cafe.categories.find(({ id }) => id === "demand")).toEqual({
      id: "demand",
      layer: "planning",
      status: "queued",
      score: null,
      breakdown: [],
    });
    expect(planItCalls(fetchMock)).toHaveLength(0);
  });

  it("gives the same scores every time", async () => {
    const app = unlimitedApp(recordedFetch());
    const other = unlimitedApp(recordedFetch());

    const first = await (await app.request(`/api/scores?${NG17_AREA}`)).json();
    const again = await (await app.request(`/api/scores?${NG17_AREA}`)).json();
    const elsewhere = await (
      await other.request(`/api/scores?${NG17_AREA}`)
    ).json();

    expect(again).toEqual(first);
    expect(elsewhere).toEqual(first);
  });

  it("calls no Data Source more than loading the Layers alone does, and none again for a repeat", async () => {
    const layersAlone = recordedFetch();
    const withScores = recordedFetch();
    const loadLayers = (app: ReturnType<typeof testApp>) =>
      SERVED_LAYER_IDS.map(async (layer) =>
        app.request(`/api/area/${layer}?${NG17_AREA}`),
      );

    await Promise.all(loadLayers(unlimitedApp(layersAlone)));
    const app = unlimitedApp(withScores);
    await Promise.all([
      ...loadLayers(app),
      app.request(`/api/scores?${NG17_AREA}`),
    ]);
    const calls = withScores.mock.calls.length;
    await app.request(`/api/scores?${NG17_AREA}`);

    expect(calls).toBe(layersAlone.mock.calls.length);
    expect(withScores.mock.calls.length).toBe(calls);
  });

  it("leaves out the categories of Layers whose Data Source is unavailable, and the Location Score says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = unlimitedApp(
      postcodesIoFixtures(
        {
          lookup: ng171aa,
          nearest: nearestNg171aa,
          inSearchArea: NG17_1AA_PROPERTY.postcodes,
        },
        policeFixtures(
          {
            lastUpdated: policeLastUpdated,
            crimesByMonth: NG17_1AA_CRIMES_BY_MONTH,
          },
          planningDataFixtures(
            NG17_1AA_PLANNING_DATA,
            overpassFixtures(
              new Map(),
              landRegistryFixtures(NG17_1AA_PROPERTY.pricePaid),
            ),
          ),
        ),
      ),
    );

    const response = await app.request(`/api/scores?${NG17_AREA}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as ScoresResponse;
    expect(scoresOf(body)).toEqual({
      safety: 0,
      amenities: null,
      schools: null,
      transport: null,
      "green-space": null,
      "property-activity": 40,
      // PlanIt has no recording here.
      "development-activity": null,
      "planning-freedom": 80,
    });
    expect(body.categories[1]).toEqual({
      id: "amenities",
      layer: "amenities",
      status: "unavailable",
      score: null,
      breakdown: [],
    });
    // (0×25 + 40×10 + 80×10) ÷ 45 = 26.7
    expect(body.location.score).toBe(27);
    expect(body.location.leftOut).toEqual([
      {
        id: "amenities",
        layer: "amenities",
        status: "unavailable",
        weight: 15,
      },
      {
        id: "schools",
        layer: "schools",
        status: "not-prepared",
        weight: 10,
      },
      {
        id: "transport",
        layer: "transport",
        status: "unavailable",
        weight: 15,
      },
      {
        id: "green-space",
        layer: "green-space",
        status: "unavailable",
        weight: 10,
      },
      {
        id: "development-activity",
        layer: "planning",
        status: "unavailable",
        weight: 5,
      },
    ]);
  });

  it("weighs the Location Score by the Scout Mode, leaving each Category Score as it is", async () => {
    const app = unlimitedApp(recordedFetch());
    const inMode = async (mode: string) =>
      (await (
        await app.request(`/api/scores?${NG17_AREA}&mode=${mode}`)
      ).json()) as ScoresResponse;

    const general = await inMode("general");
    const development = await inMode("development");

    expect(general.mode).toBe("general");
    expect(development.mode).toBe("development");
    expect(development.categories).toEqual(general.categories);
    expect(general.location.score).toBe(59);
    // (0×5 + 100×5 + 88×10 + 100×5 + 40×15 + 54×25 + 80×30) ÷ 95 = 65.6
    expect(development.location.score).toBe(66);
    expect(
      development.location.counted.map(({ id, weight }) => [id, weight]),
    ).toEqual([
      ["safety", 5],
      ["amenities", 5],
      ["transport", 10],
      ["green-space", 5],
      ["property-activity", 15],
      ["development-activity", 25],
      ["planning-freedom", 30],
    ]);
    const scores = await Promise.all(
      SCORING_CONFIG.modes.map(async ({ id }) => [
        id,
        (await inMode(id)).location.score,
      ]),
    );
    expect(Object.fromEntries(scores)).toEqual({
      general: 59,
      // (0×25 + 100×15 + 88×15 + 100×15 + 40×5 + 80×5) ÷ 80 = 61.5
      homebuyer: 62,
      // (0×15 + 100×10 + 88×25 + 100×5 + 40×25 + 54×5 + 80×5) ÷ 90 = 59.7
      "buy-to-let": 60,
      // (0×10 + 100×10 + 88×15 + 100×5 + 40×25 + 54×25 + 80×5) ÷ 95 = 58.6
      investment: 59,
      development: 66,
      // With Footfall proxy 81 and each mode's Competition: see below.
      // (0×10 + 100×5 + 88×20 + 80×5 + 10×10 + 81×25) ÷ 75 = 63.8
      retail: 64,
      // (0×10 + 100×5 + 88×15 + 80×5 + 55×25 + 81×20) ÷ 80 = 65.2
      "business-cafe": 65,
      // (0×10 + 100×10 + 88×15 + 80×5 + 70×20 + 81×20) ÷ 80 = 71.75
      "business-restaurant": 72,
      // (0×5 + 88×10 + 80×5 + 38×25 + 81×25) ÷ 70 = 60.8
      "business-takeaway": 61,
      // (0×10 + 100×5 + 88×20 + 80×5 + 75×20 + 81×15) ÷ 75 = 71.7
      "business-gym": 72,
      // (0×10 + 88×15 + 80×5 + 20×25 + 81×15) ÷ 70 = 49.1
      "business-hairdresser": 49,
      // (0×10 + 88×10 + 80×5 + 39×30 + 81×10) ÷ 65 = 50.2
      "business-convenience-store": 50,
      // (0×10 + 88×20 + 80×5 + 88×25) ÷ 60 = 72.7
      "business-dental-practice": 73,
      // (0×20 + 88×10 + 100×10 + 75×25) ÷ 65 = 57.8
      "business-nursery": 58,
    });
  });

  it("scores Competition by each Business and Retail mode's competitors, and Footfall proxy, from NG17 1AA's recordings", async () => {
    const app = unlimitedApp(recordedFetch());
    const inMode = async (mode: string) =>
      (await (
        await app.request(`/api/scores?${NG17_AREA}&mode=${mode}`)
      ).json()) as ScoresResponse;
    const scoreOf = (body: ScoresResponse, id: string) =>
      body.categories.find((category) => category.id === id);

    const general = await inMode("general");
    expect(general.categories.map(({ id }) => id)).not.toContain("competition");
    expect(general.categories.map(({ id }) => id)).not.toContain("footfall");

    const competition = await Promise.all(
      SCORING_CONFIG.modes
        .filter(({ competitors }) => competitors)
        .map(async ({ id }) => [
          id,
          scoreOf(await inMode(id), "competition")?.score,
        ]),
    );
    expect(Object.fromEntries(competition)).toEqual({
      // 131 shops over 2.03 km², 64.4 a km², falling to 0 points at 80 a km²
      // (20 per 1,000 residents): 19.5, less 10 for the one 43 m away.
      retail: 10,
      // 11 cafés, 5.41 a km², falling to 0 points at 12 a km² (3 per 1,000
      // residents): 54.9, the nearest 110 m away.
      "business-cafe": 55,
      // 5 restaurants, 2.46 a km², falling to 0 points at 12 a km²: 79.5, less
      // 10 for the one 40 m away.
      "business-restaurant": 70,
      // 17 takeaways, 8.36 a km², falling to 0 points at 16 a km² (4 per 1,000
      // residents): 47.8, less 10 for the one 58 m away.
      "business-takeaway": 38,
      // 2 gyms, 0.98 a km², the nearest 369 m away.
      "business-gym": 75,
      // 17 hairdressers, 8.36 a km², falling to 0 points at 12 a km²: 30.4,
      // less 10 for the one 73 m away.
      "business-hairdresser": 20,
      // 10 convenience stores, 4.92 a km², falling to 0 points at 8 a km² (2
      // per 1,000 residents): 38.55, the nearest 141 m away.
      "business-convenience-store": 39,
      // 1 dentist, 174 m away.
      "business-dental-practice": 88,
      // 2 nurseries, both childcare, the nearest 550 m away.
      "business-nursery": 75,
    });

    const cafe = await inMode("business-cafe");
    expect(scoreOf(cafe, "competition")?.breakdown).toMatchObject([
      { input: "Competitors (cafés) per km²", value: 5.4, points: 54.9 },
      { input: "Distance to the nearest competitor", value: 110, points: 0 },
    ]);
    // 131 shops, 14 offices and 58 bus stops, but no railway station: 203.
    expect(scoreOf(cafe, "footfall")).toMatchObject({
      layer: "amenities",
      status: "ok",
      score: 81,
      breakdown: [
        { input: "Shops in the Search Area", value: 131 },
        { input: "Offices in the Search Area", value: 14 },
        { input: "Bus stops in the Search Area", value: 58 },
        { input: "Railway stations in the Search Area", value: 0 },
      ],
    });
  });

  it("counts Safety and Competition per 1,000 of NG17 1AA's residents, scores Demand from the prepared Demographics Layer, and Schools from the prepared Schools Layer", async () => {
    const app = unlimitedApp(
      recordedFetch(),
      SCORING_CONFIG,
      PREPARED_DATA_FIXTURE,
    );
    const inMode = async (mode: string) =>
      (await (
        await app.request(`/api/scores?${NG17_AREA}&mode=${mode}`)
      ).json()) as ScoresResponse;
    const categoryOf = (body: ScoresResponse, id: string) =>
      body.categories.find((category) => category.id === id);

    const general = await inMode("general");
    expect(isScoresResponse(general)).toBe(true);
    // 2,024 crimes for an estimated 9,052 residents.
    expect(categoryOf(general, "safety")).toMatchObject({
      score: 0,
      breakdown: [
        {
          input: "Crimes a year per 1,000 residents",
          value: 223.6,
          unit: "per 1,000 residents",
        },
        { input: "Year-on-year change in crime", value: 5.9 },
      ],
    });
    expect(general.categories.map(({ id }) => id)).not.toContain("demand");
    // Croft Primary School 519 m away, graded with no overall grade in
    // January 2025, its five areas' mean 55%; Sutton Community Academy 232 m
    // away, its report card of April 2026 graded at 67.9%:
    // 40 + 9.6 + 25 + 11.9 = 86.5.
    expect(categoryOf(general, "schools")).toMatchObject({
      layer: "schools",
      status: "ok",
      score: 87,
      breakdown: [
        { input: "Distance to the nearest primary school", value: 519 },
        {
          input: "Latest Ofsted judgement of the nearest primary school",
          value: 55,
          points: 9.6,
        },
        { input: "Distance to the nearest secondary school", value: 232 },
        {
          input: "Latest Ofsted judgement of the nearest secondary school",
          value: 67.9,
          points: 11.9,
        },
      ],
    });
    // (0×25 + 100×15 + 87×10 + 88×15 + 100×10 + 40×10 + 54×5 + 80×10)
    // ÷ 100 = 61.6
    expect(general.location.score).toBe(62);
    expect(general.location.leftOut).toEqual([]);
    // (0×25 + 100×15 + 87×20 + 88×15 + 100×15 + 40×5 + 80×5) ÷ 100 = 66.6
    expect((await inMode("homebuyer")).location.score).toBe(67);

    const cafe = await inMode("business-cafe");
    expect(scoresOf(cafe)).toEqual({
      safety: 0,
      amenities: 100,
      transport: 88,
      "planning-freedom": 80,
      // 75 × 9,052 ÷ 20,000 = 33.9, −5.9 for an income 11.8% below the
      // median of the fixture's MSOAs, and 1.8 for the 120 residents the 50
      // homes approved or pending would bring.
      demand: 30,
      // 11 cafés for 9,052 residents: 1.2 per 1,000, falling to 0 points at
      // 3: 59.49.
      competition: 59,
      footfall: 81,
    });
    expect(categoryOf(cafe, "demand")).toMatchObject({
      layer: "demographics",
      status: "ok",
      breakdown: [
        { input: "Estimated residents of the Search Area", value: 9052 },
        { input: "Household income against the England median", value: -11.8 },
        {
          input: "Estimated new residents from Planning Applications",
          value: 120,
          points: 1.8,
        },
      ],
    });
    expect(categoryOf(cafe, "competition")?.breakdown[0]).toMatchObject({
      input: "Competitors (cafés) per 1,000 residents",
      value: 1.2,
      unit: "per 1,000 residents",
    });

    const scores = await Promise.all(
      SCORING_CONFIG.modes
        .filter(({ competitors }) => competitors)
        .map(async ({ id }) => {
          const body = await inMode(id);
          return [
            id,
            [categoryOf(body, "competition")?.score, body.location.score],
          ];
        }),
    );
    // Each mode's Competition, and its Location Score with Demand 30 and
    // Footfall proxy 81.
    expect(Object.fromEntries(scores)).toEqual({
      // 131 shops, 14.5 per 1,000, falling to 0 points at 20: 27.6, less 10
      // for the one 43 m away.
      // (0×10 + 100×5 + 88×20 + 80×5 + 30×25 + 18×10 + 81×25) ÷ 100 = 56.15
      retail: [18, 56],
      // 11 cafés: 59.49, as above.
      // (0×10 + 100×5 + 88×15 + 80×5 + 30×20 + 59×25 + 81×20) ÷ 100 = 59.15
      "business-cafe": [59, 59],
      // 5 restaurants, 0.55 per 1,000, falling to 0 points at 3: 81.6, less 10
      // for the one 40 m away.
      // (0×10 + 100×10 + 88×15 + 80×5 + 30×20 + 72×20 + 81×20) ÷ 100 = 63.8
      "business-restaurant": [72, 64],
      // 17 takeaways, 1.88 per 1,000, falling to 0 points at 4: 53, less 10
      // for the one 58 m away.
      // (0×5 + 88×10 + 80×5 + 30×30 + 43×25 + 81×25) ÷ 100 = 52.8
      "business-takeaway": [43, 53],
      // 2 gyms, 0.22 per 1,000: 77.9.
      // (0×10 + 100×5 + 88×20 + 80×5 + 30×25 + 78×20 + 81×15) ÷ 100 = 61.8
      "business-gym": [78, 62],
      // 17 hairdressers, 1.88 per 1,000, falling to 0 points at 3: 37.4, less
      // 10 for the one 73 m away.
      // (0×10 + 88×15 + 80×5 + 30×30 + 27×25 + 81×15) ÷ 100 = 45.1
      "business-hairdresser": [27, 45],
      // 10 convenience stores, 1.1 per 1,000, falling to 0 points at 2: 44.8,
      // the nearest 141 m away.
      // (0×10 + 88×10 + 80×5 + 30×35 + 45×30 + 81×10) ÷ 100 = 44.9
      "business-convenience-store": [45, 45],
      // 1 dentist, 0.11 per 1,000: 89, the nearest 174 m away.
      // (0×10 + 88×20 + 80×5 + 30×40 + 89×25) ÷ 100 = 55.9
      "business-dental-practice": [89, 56],
      // 2 nurseries: 77.9.
      // (0×20 + 87×10 + 88×10 + 100×10 + 30×25 + 78×25) ÷ 100 = 54.5
      "business-nursery": [78, 55],
    });
  });

  it("falls back to Safety and Competition per km², and leaves Demand out, before pnpm data:prepare", async () => {
    const app = unlimitedApp(recordedFetch());

    const response = await app.request(
      `/api/scores?${NG17_AREA}&mode=business-cafe`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ScoresResponse;
    expect(scoresOf(body)).toMatchObject({
      safety: 0,
      demand: null,
      competition: 55,
    });
    expect(body.categories[0]?.breakdown[0]).toMatchObject({
      input: "Crimes a year per km²",
      value: 995,
      unit: "per km²",
    });
    expect(body.location.leftOut).toEqual([
      {
        id: "demand",
        layer: "demographics",
        status: "not-prepared",
        weight: 20,
      },
    ]);
    // Demand left out, the rest renormalised, as before it was built.
    expect(body.location.score).toBe(65);
  });

  it("weighs the Location Score by a Scout Mode added to the config alone", async () => {
    const app = unlimitedApp(recordedFetch(), WITH_FIXTURE_MODE);

    const response = await app.request(
      `/api/scores?${NG17_AREA}&mode=fixture-commuter`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ScoresResponse;
    expect(body.mode).toBe("fixture-commuter");
    // (88×75 + 40×25) ÷ 100 = 76
    expect(body.location.score).toBe(76);
    expect(body.location.counted.map(({ id }) => id)).toEqual([
      "transport",
      "property-activity",
    ]);
  });

  it.each(["landlord", "General", "business-florist", ""])(
    "answers 400 with a message for a Scout Mode that doesn't exist: %j",
    async (mode) => {
      const others = noNetwork();
      const app = testApp({ fetch: others });

      const response = await app.request(
        `/api/scores?lat=53.123664&lng=-1.264078&mode=${mode}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: MODE_HINT });
      expect(others).not.toHaveBeenCalled();
    },
  );

  it("says it covers England only for a Location in Wales, and calls no Data Source for the scores", async () => {
    const others = noNetwork();
    const app = testApp({
      fetch: withPostcodesIo(nearestAberystwyth, others),
    });

    const response = await app.request("/api/scores?lat=52.4153&lng=-4.0829");

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: `${ENGLAND_ONLY} That Location is in Wales.`,
    });
    expect(others).not.toHaveBeenCalled();
  });

  it("answers 400 with a message for an invalid Search Radius", async () => {
    const app = testApp({ fetch: noNetwork() });

    const response = await app.request(
      "/api/scores?lat=53.123664&lng=-1.264078&radius=2",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: RADIUS_HINT });
  });
});

describe("GET /api/highlights", () => {
  const textsOf = (body: HighlightsResponse) =>
    body.highlights.map(({ level, text }) => `${level}: ${text}`);

  it("gives NG17 1AA's Highlights in the General Scout Mode, Concerns first, each naming its Layer", async () => {
    const app = unlimitedApp(recordedFetch());

    const response = await app.request(`/api/highlights?${NG17_AREA}`);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isHighlightsResponse(body)).toBe(true);
    if (!isHighlightsResponse(body)) return;
    expect(body.mode).toBe("general");
    expect(
      body.highlights.map(({ level, text, layer }) => [level, text, layer]),
    ).toEqual([
      ["concern", "High crime: 995 crimes a year per km²", "crime"],
      ["watch", "Crime up 5.9% year on year", "crime"],
      [
        "watch",
        "Location is inside a conservation area: Sutton in Ashfield Church and Market Place",
        "planning",
      ],
      ["good", "All 13 types of amenity in the Search Area", "amenities"],
      ["good", "58 bus stops in the Search Area", "transport"],
      ["good", "Park 100 m away", "green-space"],
      ["good", "Median price up 13.8% on a year before", "property"],
    ]);
    expect(body.leftOut).toEqual([]);
  });

  it("asks PlanIt nothing, as no Highlight reads the Planning Applications", async () => {
    const fetchMock = recordedFetch();

    await unlimitedApp(fetchMock).request(`/api/highlights?${NG17_AREA}`);

    expect(planItCalls(fetchMock)).toHaveLength(0);
  });

  it("counts crime per 1,000 of NG17 1AA's residents, as Safety does, once the Demographics Layer is prepared", async () => {
    const app = unlimitedApp(
      recordedFetch(),
      SCORING_CONFIG,
      PREPARED_DATA_FIXTURE,
    );

    const response = await app.request(`/api/highlights?${NG17_AREA}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as HighlightsResponse;
    // 2,024 crimes for an estimated 9,052 residents.
    expect(textsOf(body)[0]).toBe(
      "concern: High crime: 224 crimes a year per 1,000 residents",
    );
    expect(body.leftOut).toEqual([]);
  });

  it("gives only the rules the Scout Mode applies", async () => {
    const app = unlimitedApp(recordedFetch());
    const inMode = async (mode: string) =>
      textsOf(
        (await (
          await app.request(`/api/highlights?${NG17_AREA}&mode=${mode}`)
        ).json()) as HighlightsResponse,
      );

    // Rising prices suit an investor more than a buyer.
    expect(await inMode("homebuyer")).not.toContain(
      "good: Median price up 13.8% on a year before",
    );
    expect(await inMode("investment")).toContain(
      "good: Median price up 13.8% on a year before",
    );
    // A developer is told about the market, not about amenities or parks.
    expect(await inMode("development")).toEqual([
      "concern: High crime: 995 crimes a year per km²",
      "watch: Crime up 5.9% year on year",
      "watch: Location is inside a conservation area: Sutton in Ashfield Church and Market Place",
      "good: 58 bus stops in the Search Area",
      "good: Median price up 13.8% on a year before",
    ]);
  });

  it("applies the rules of a Scout Mode added to the config alone", async () => {
    const app = unlimitedApp(recordedFetch(), WITH_FIXTURE_MODE);

    const response = await app.request(
      `/api/highlights?${NG17_AREA}&mode=fixture-commuter`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as HighlightsResponse;
    expect(body.mode).toBe("fixture-commuter");
    // Sutton Parkway, 1.6 km away, is neither near nor far.
    expect(textsOf(body)).toEqual(["good: 58 bus stops in the Search Area"]);
  });

  it("gives the same Highlights every time", async () => {
    const app = unlimitedApp(recordedFetch());
    const other = unlimitedApp(recordedFetch());
    const url = `/api/highlights?${NG17_AREA}`;

    const first = await (await app.request(url)).json();
    const again = await (await app.request(url)).json();
    const elsewhere = await (await other.request(url)).json();

    expect(again).toEqual(first);
    expect(elsewhere).toEqual(first);
  });

  it("calls no Data Source more than loading the Layers alone does", async () => {
    const layersAlone = recordedFetch();
    const withHighlights = recordedFetch();
    const loadLayers = (app: ReturnType<typeof testApp>) =>
      SERVED_LAYER_IDS.map(async (layer) =>
        app.request(`/api/area/${layer}?${NG17_AREA}`),
      );

    await Promise.all(loadLayers(unlimitedApp(layersAlone)));
    const app = unlimitedApp(withHighlights);
    await Promise.all([
      ...loadLayers(app),
      app.request(`/api/scores?${NG17_AREA}`),
      app.request(`/api/highlights?${NG17_AREA}`),
    ]);
    const calls = withHighlights.mock.calls.length;
    await app.request(`/api/highlights?${NG17_AREA}&mode=homebuyer`);

    expect(calls).toBe(layersAlone.mock.calls.length);
    expect(withHighlights.mock.calls.length).toBe(calls);
  });

  it("leaves out the Highlights of Layers whose Data Source is unavailable, and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = unlimitedApp(
      postcodesIoFixtures(
        {
          lookup: ng171aa,
          nearest: nearestNg171aa,
          inSearchArea: NG17_1AA_PROPERTY.postcodes,
        },
        policeFixtures(
          {
            lastUpdated: policeLastUpdated,
            crimesByMonth: NG17_1AA_CRIMES_BY_MONTH,
          },
          planningDataFixtures(
            NG17_1AA_PLANNING_DATA,
            overpassFixtures(
              new Map(),
              landRegistryFixtures(NG17_1AA_PROPERTY.pricePaid),
            ),
          ),
        ),
      ),
    );

    const response = await app.request(`/api/highlights?${NG17_AREA}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as HighlightsResponse;
    expect(textsOf(body)).toEqual([
      "concern: High crime: 995 crimes a year per km²",
      "watch: Crime up 5.9% year on year",
      "watch: Location is inside a conservation area: Sutton in Ashfield Church and Market Place",
      "good: Median price up 13.8% on a year before",
    ]);
    expect(body.leftOut).toEqual([
      { layer: "amenities", status: "unavailable" },
      { layer: "transport", status: "unavailable" },
      { layer: "green-space", status: "unavailable" },
    ]);
  });

  it("says it covers England only for a Location in Wales, and calls no Data Source for the Highlights", async () => {
    const others = noNetwork();
    const app = testApp({
      fetch: withPostcodesIo(nearestAberystwyth, others),
    });

    const response = await app.request(
      "/api/highlights?lat=52.4153&lng=-4.0829",
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: `${ENGLAND_ONLY} That Location is in Wales.`,
    });
    expect(others).not.toHaveBeenCalled();
  });

  it.each(["landlord", "General", "business-florist", ""])(
    "answers 400 with a message for a Scout Mode that doesn't exist: %j",
    async (mode) => {
      const app = testApp({ fetch: noNetwork() });

      const response = await app.request(
        `/api/highlights?lat=53.123664&lng=-1.264078&mode=${mode}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: MODE_HINT });
    },
  );
});

describe("the Land Opportunity Finder", () => {
  /**
   * An app with the prepared-data fixture, whose Locations are in England,
   * and Price Paid's land sales near Sutton Parkway's farm field.
   */
  const landApp = (
    preparedData = PREPARED_DATA_FIXTURE,
    fetchMock = landRegistryFixtures(SUTTON_PARKWAY_LAND_SALES.pricePaid),
  ) =>
    testApp({
      fetch: withPostcodesIo(nearestMansfield, fetchMock),
      preparedData,
    });

  /** The land sales recorded near the field, as listed: the newest 10 of 76. */
  const FIELD_LAND_SALES = {
    status: "ok",
    period: { from: "2021-10-09", to: "2026-10-08" },
    found: { count: 76, medianPrice: 207000 },
  };

  const SUTTON_PARKWAY = "lat=53.1145&lng=-1.246&radius=0.25";

  const ids = (body: unknown) =>
    (body as { features: { id: string }[] }).features.map(({ id }) => id);

  describe("GET /api/area/land", () => {
    it("gives the Land Opportunities in the Search Area that meet FR-5.3's defaults, with their tags", async () => {
      const response = await landApp().request(
        `/api/area/land?${SUTTON_PARKWAY}`,
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLayerResponse(body)).toBe(true);
      expect(body).toMatchObject({
        layer: "land",
        status: "ok",
        sources: [
          {
            id: "land-parcels",
            name: "Land Parcels",
            status: "ok",
            period: { from: "2026-10-08", to: "2026-10-08" },
          },
          {
            id: "postcodes",
            name: "Postcodes",
            status: "ok",
            period: { from: "2026-08", to: "2026-08" },
          },
          {
            id: "land-registry",
            name: "HM Land Registry Price Paid",
            status: "ok",
            period: { from: "2021-10-09", to: "2026-10-08" },
          },
        ],
        scope: "search-area",
        sort: "area",
        filters: DEFAULT_LAND_FILTERS,
        landCoverageAreas: [{ code: "E07000170", name: "Ashfield" }],
        notCovered: [],
        features: [
          {
            id: "E07000170-2",
            landUse: ["landuse=farmland"],
            areaHectares: 19.522,
            roadDistanceMetres: 7,
            possiblyUnregistered: false,
            estimatedHomes: 351,
            nearbyLandSales: FIELD_LAND_SALES,
          },
        ],
        statistics: {
          parcels: 1,
          count: 1,
          listed: 1,
          nearbyLandSales: FIELD_LAND_SALES,
        },
      });
    });

    /**
     * A made-up PlanIt answer for Sutton Parkway's 0.25 mile Search Area,
     * which PlanIt has no recording of, numbered ZZ… as no council's are:
     * a major scheme of 120 homes, approved, on the farm field, and 2 homes
     * refused 115 m west of the Location.
     */
    const suttonParkwayPlanIt = new Map([
      [
        applicationsUrl(SUTTON_PARKWAY_AREA),
        {
          from: 0,
          to: 1,
          total: 2,
          records: [
            {
              name: "Ashfield/ZZ/2025/0001",
              uid: "ZZ/2025/0001",
              area_name: "Ashfield",
              description: "Erection of 120 dwellings",
              address: "Land at Sutton Parkway",
              postcode: null,
              location_x: -1.242,
              location_y: 53.114,
              start_date: "2025-05-01",
              decided_date: "2025-12-01",
              app_state: "Permitted",
              app_size: "Large",
              link: null,
              url: null,
              application_type: "Full",
              development_type: null,
              lat: 53.114,
              lng: -1.242,
            },
            {
              name: "Ashfield/ZZ/2025/0002",
              uid: "ZZ/2025/0002",
              area_name: "Ashfield",
              description: "Erection of 2 dwellings",
              address: "Lowmoor Road",
              postcode: null,
              location_x: -1.2475,
              location_y: 53.115,
              start_date: "2025-06-01",
              decided_date: "2025-09-01",
              app_state: "Rejected",
              app_size: "Small",
              link: null,
              url: null,
              application_type: "Full",
              development_type: null,
              lat: 53.115,
              lng: -1.2475,
            },
          ],
        },
      ],
    ]);

    it("tags each Land Opportunity with the Planning Applications within 500 m of it, among the Search Area's, highlighting the approved and major ones", async () => {
      const response = await landApp(
        PREPARED_DATA_FIXTURE,
        planItFixtures(
          suttonParkwayPlanIt,
          landRegistryFixtures(SUTTON_PARKWAY_LAND_SALES.pricePaid),
        ),
      ).request(`/api/area/land?${SUTTON_PARKWAY}`);

      const body = (await response.json()) as LandLayerResponse;
      expect(body.features[0]?.nearbyPlanningApplications).toMatchObject({
        status: "ok",
        provider: "PlanIt",
        withinMetres: 500,
        found: {
          count: 2,
          approved: 1,
          major: 1,
          // The refused 2 aren't counted.
          estimatedHomes: 120,
          highlighted: [
            {
              id: "Ashfield/ZZ/2025/0001",
              status: "approved",
              applicationType: "major",
              estimatedHomes: 120,
            },
          ],
        },
      });
    });

    it("says the Planning Applications near the land are queued while PlanIt's turn is taken, and unavailable when it fails", async () => {
      const planItLimiter = createRateLimiter(PLANIT_INTERVAL_MS);
      await planItLimiter.wait();
      const queued = testApp({
        fetch: withPostcodesIo(
          nearestMansfield,
          planItFixtures(
            suttonParkwayPlanIt,
            landRegistryFixtures(SUTTON_PARKWAY_LAND_SALES.pricePaid),
          ),
        ),
        preparedData: PREPARED_DATA_FIXTURE,
        planItLimiter,
      });

      const [whileQueued, failed] = await Promise.all([
        queued.request(`/api/area/land?${SUTTON_PARKWAY}`),
        landApp().request(`/api/area/land?${SUTTON_PARKWAY}`),
      ]);

      expect(
        ((await whileQueued.json()) as LandLayerResponse).features[0]
          ?.nearbyPlanningApplications,
      ).toEqual({
        status: "queued",
        provider: "PlanIt",
        withinMetres: 500,
        found: null,
      });
      expect(
        ((await failed.json()) as LandLayerResponse).features[0]
          ?.nearbyPlanningApplications,
      ).toMatchObject({ status: "unavailable", found: null });
    });

    it("doesn't look for Planning Applications across a whole Land Coverage Area, asking PlanIt nothing", async () => {
      const fetchMock = planItFixtures(
        suttonParkwayPlanIt,
        landRegistryFixtures(SUTTON_PARKWAY_LAND_SALES.pricePaid),
      );

      const response = await landApp(PREPARED_DATA_FIXTURE, fetchMock).request(
        `/api/land?${SUTTON_PARKWAY}&scope=land-coverage-area`,
      );

      const body = (await response.json()) as LandLayerResponse;
      expect(body.features).toHaveLength(4);
      for (const { nearbyPlanningApplications } of body.features) {
        expect(nearbyPlanningApplications).toBeNull();
      }
      expect(planItCalls(fetchMock)).toHaveLength(0);
    });

    it("gives each Land Opportunity, and the statistics, the newest 10 of the land sales within 1 mile, in one Price Paid query", async () => {
      const fetchMock = landRegistryFixtures(
        SUTTON_PARKWAY_LAND_SALES.pricePaid,
      );

      const response = await landApp(PREPARED_DATA_FIXTURE, fetchMock).request(
        `/api/area/land?${SUTTON_PARKWAY}`,
      );

      const body = (await response.json()) as LandLayerResponse;
      const [field] = body.features;
      const sales = field?.nearbyLandSales?.found?.sales ?? [];
      expect(sales.map(({ date }) => date)).toEqual([
        "2026-07-14",
        "2026-05-28",
        "2026-04-28",
        "2026-03-27",
        "2026-03-27",
        "2026-01-06",
        "2025-12-22",
        "2025-12-19",
        "2025-11-19",
        "2025-10-17",
      ]);
      expect(sales[1]).toMatchObject({
        price: 380000,
        address: "UNIT 3, DRAKEHOUSE COURT, HAMILTON ROAD, SUTTON-IN-ASHFIELD",
        postcode: "NG17 5ES",
      });
      // One Land Opportunity: the statistics' are its own.
      expect(body.statistics?.nearbyLandSales).toEqual(field?.nearbyLandSales);
      expect(
        fetchMock.mock.calls.filter(([url]) => url === SPARQL_URL),
      ).toHaveLength(1);
    });

    it("still gives the Land Opportunities if Price Paid doesn't answer, saying their land sales are unavailable", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const response = await landApp(
        PREPARED_DATA_FIXTURE,
        noNetwork(),
      ).request(`/api/area/land?${SUTTON_PARKWAY}`);

      const unavailable = {
        status: "unavailable",
        period: { from: "2021-10-09", to: "2026-10-08" },
        found: null,
      };
      expect(await response.json()).toMatchObject({
        status: "ok",
        sources: [
          { id: "land-parcels", status: "ok" },
          { id: "postcodes", status: "ok" },
          { id: "land-registry", status: "unavailable", period: null },
        ],
        features: [{ id: "E07000170-2", nearbyLandSales: unavailable }],
        statistics: { count: 1, nearbyLandSales: unavailable },
      });
    });

    it("says land sales are not prepared for land prepared before its postcodes were, asking Price Paid nothing", async () => {
      await using data = await preparedDataDir(PREPARED_DATA_FIXTURE_DIR);
      const manifest = JSON.parse(
        await readFile(join(data.dir, "manifest.json"), "utf8"),
      ) as PreparedManifest;
      await writeFile(
        join(data.dir, "manifest.json"),
        JSON.stringify({
          ...manifest,
          landCoverageAreas: manifest.landCoverageAreas.map((area) => ({
            ...area,
            datasets: area.datasets.filter(({ id }) => id !== "postcodes"),
          })),
        }),
      );
      const fetchMock = noNetwork();

      const response = await landApp(
        openPreparedData(data.dir),
        fetchMock,
      ).request(`/api/area/land?${SUTTON_PARKWAY}`);

      expect(await response.json()).toMatchObject({
        status: "ok",
        sources: [
          { id: "land-parcels", status: "ok" },
          { id: "postcodes", status: "not-prepared" },
        ],
        statistics: {
          count: 1,
          nearbyLandSales: { status: "not-prepared", found: null },
        },
      });
      // Only PlanIt is asked, for the Planning Applications near the land.
      expect(
        fetchMock.mock.calls.map(([input]) =>
          typeof input === "string" ? new URL(input).origin : input,
        ),
      ).toEqual(["https://www.planit.org.uk"]);
    });

    it("says land data is not prepared for a Search Area in a council that isn't a Land Coverage Area", async () => {
      const response = await landApp().request(
        "/api/area/land?lat=53.1435&lng=-1.1985&radius=0.25",
      );

      expect(await response.json()).toMatchObject({
        layer: "land",
        status: "not-prepared",
        landCoverageAreas: [],
        notCovered: [{ code: "E07000174", name: "Mansfield" }],
        features: [],
        statistics: null,
      });
    });

    it("is not prepared before pnpm data:prepare, and every other Layer still loads", async () => {
      const app = testApp({ fetch: withPostcodesIo(nearestMansfield) });

      const land = await app.request(`/api/area/land?${SUTTON_PARKWAY}`);
      const area = await app.request(`/api/area?${SUTTON_PARKWAY}`);

      expect(await land.json()).toMatchObject({
        status: "not-prepared",
        landCoverageAreas: [],
        notCovered: [],
      });
      expect(area.status).toBe(200);
      expect(await area.json()).toMatchObject({
        layers: expect.arrayContaining([
          { id: "land", status: "not-prepared" },
        ]) as unknown,
      });
    });
  });

  describe("GET /api/land", () => {
    it("answers as /api/area/land does with no filter given", async () => {
      const app = landApp();

      const [land, layer] = await Promise.all([
        app.request(`/api/land?${SUTTON_PARKWAY}`),
        app.request(`/api/area/land?${SUTTON_PARKWAY}`),
      ]);

      expect(land.status).toBe(200);
      expect(await land.json()).toEqual(await layer.json());
    });

    it.each([
      [
        "scope=land-coverage-area",
        ["E07000170-2", "E07000170-5", "E07000170-3", "E07000170-1"],
      ],
      ["scope=land-coverage-area&minAcres=6.5", ["E07000170-2", "E07000170-5"]],
      [
        "scope=land-coverage-area&maxAcres=10",
        ["E07000170-5", "E07000170-3", "E07000170-1"],
      ],
      [
        "scope=land-coverage-area&maxRoadMetres=5",
        ["E07000170-3", "E07000170-1"],
      ],
      [
        "scope=land-coverage-area&minAcres=0&maxRoadMetres=any&sort=road-distance",
        [
          "E07000170-1",
          "E07000170-3",
          "E07000170-2",
          "E07000170-4",
          "E07000170-5",
        ],
      ],
      [
        "scope=land-coverage-area&sort=capacity",
        ["E07000170-2", "E07000170-5", "E07000170-3", "E07000170-1"],
      ],
      ["scope=land-coverage-area&possiblyUnregisteredOnly=true", []],
      [
        "scope=land-coverage-area&maxFloodZone=1&excludeConstraints=flood-zone,conservation-area&excludeListedBuildingOutlines=false",
        ["E07000170-2", "E07000170-5", "E07000170-3", "E07000170-1"],
      ],
      [
        "scope=land-coverage-area&ownershipCategories=other-registered",
        ["E07000170-2", "E07000170-5", "E07000170-3", "E07000170-1"],
      ],
      [
        "scope=land-coverage-area&ownershipCategories=company,council-or-public-body",
        [],
      ],
    ])("finds the Land Opportunities with %s", async (query, expected) => {
      const response = await landApp().request(
        `/api/land?${SUTTON_PARKWAY}&${query}`,
      );

      expect(response.status).toBe(200);
      expect(ids(await response.json())).toEqual(expected);
    });

    it("gives the filters, scope and order it used", async () => {
      const response = await landApp().request(
        `/api/land?${SUTTON_PARKWAY}&scope=land-coverage-area&sort=capacity&minAcres=1&maxAcres=60&maxRoadMetres=any&maxFloodZone=2&possiblyUnregisteredOnly=true&excludeConstraints=flood-zone,flood-zone&excludeListedBuildingOutlines=false&ownershipCategories=company,company,possibly-unregistered`,
      );

      expect(await response.json()).toMatchObject({
        scope: "land-coverage-area",
        sort: "capacity",
        filters: {
          minAcres: 1,
          maxAcres: 60,
          maxRoadMetres: null,
          maxFloodZone: 2,
          possiblyUnregisteredOnly: true,
          excludeConstraints: ["flood-zone"],
          excludeListedBuildingOutlines: false,
          ownershipCategories: ["company", "possibly-unregistered"],
        },
      });
    });

    it("gives no land sales across a whole Land Coverage Area, asking Price Paid nothing", async () => {
      const fetchMock = noNetwork();

      const response = await landApp(PREPARED_DATA_FIXTURE, fetchMock).request(
        `/api/land?${SUTTON_PARKWAY}&scope=land-coverage-area`,
      );

      const body = (await response.json()) as LandLayerResponse;
      expect(body.features).toHaveLength(4);
      for (const feature of body.features) {
        expect(feature.nearbyLandSales).toBeNull();
      }
      expect(body.statistics?.nearbyLandSales).toBeNull();
      expect(body.sources.map(({ id }) => id)).toEqual(["land-parcels"]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("counts the Land Opportunities in each indicative Ownership Category, with the titles matched around them", async () => {
      const response = await landApp().request(
        `/api/land?${SUTTON_PARKWAY}&scope=land-coverage-area`,
      );

      const body = (await response.json()) as LandLayerResponse;
      expect(body.statistics?.ownershipCategories).toEqual({
        company: 0,
        "council-or-public-body": 0,
        "other-registered": 4,
        "possibly-unregistered": 0,
      });
      expect(
        body.features.find(({ id }) => id === "E07000170-2"),
      ).toMatchObject({
        ownershipCategory: "other-registered",
        matchedTitles: [
          {
            titleNumber: "ZZ200001",
            propertyAddress: "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE)",
            ownershipCategory: "company",
            dataset: "ocod",
            distanceMetres: 9,
          },
        ],
      });
    });

    it.each([
      ["scope=england", LAND_SCOPE_HINT],
      ["sort=price", LAND_SORT_HINT],
      ["minAcres=-1", ACRES_HINT],
      ["maxAcres=lots", ACRES_HINT],
      ["maxRoadMetres=far", ROAD_HINT],
      ["maxFloodZone=4", FLOOD_ZONE_HINT],
      ["possiblyUnregisteredOnly=yes", BOOLEAN_HINT],
      ["excludeConstraints=green-belt", CONSTRAINTS_HINT],
      ["ownershipCategories=individual", OWNERSHIP_HINT],
    ])("answers 400 for %s, saying what is wrong", async (query, error) => {
      const response = await landApp().request(
        `/api/land?${SUTTON_PARKWAY}&${query}`,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    });

    it("checks the Location is in England first, as /api/area does", async () => {
      const app = testApp({
        fetch: withPostcodesIo(nearestEdinburgh, noNetwork()),
        preparedData: PREPARED_DATA_FIXTURE,
      });

      const response = await app.request("/api/land?lat=55.9533&lng=-3.1883");

      expect(response.status).toBe(422);
    });
  });

  describe("GET /api/land/{parcelId}", () => {
    it("gives a Land Parcel with the INSPIRE Index Polygons that overlap it, those around it a title is matched to, and every land sale within 1 mile, asking only Price Paid", async () => {
      const fetchMock = landRegistryFixtures(
        SUTTON_PARKWAY_LAND_SALES.pricePaid,
      );
      const app = testApp({
        fetch: fetchMock,
        preparedData: PREPARED_DATA_FIXTURE,
      });

      const response = await app.request("/api/land/E07000170-2");

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(isLandParcelResponse(body)).toBe(true);
      expect(body).toMatchObject({
        parcel: { id: "E07000170-2", inspireCoverage: 0.727 },
        inspirePolygons: [
          {
            inspireId: "64151457",
            share: 0.724,
            ownershipCategory: "other-registered",
          },
          { inspireId: "64151706" },
          { inspireId: "64152606" },
          {
            inspireId: "25709295",
            share: 0,
            ownershipCategory: "company",
            distanceMetres: 9,
          },
        ],
        nearbyLandSales: FIELD_LAND_SALES,
        sources: [
          { id: "land-parcels", status: "ok" },
          { id: "postcodes", status: "ok" },
          { id: "land-registry", status: "ok" },
        ],
      });
      expect(
        (body as LandParcelResponse).nearbyLandSales.found?.sales,
      ).toHaveLength(76);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it.each([
      [
        "a parcel no Land Coverage Area has",
        "E07000170-999",
        PREPARED_DATA_FIXTURE,
      ],
      [
        "a council that isn't a Land Coverage Area",
        "E07000174-1",
        PREPARED_DATA_FIXTURE,
      ],
      ["nothing prepared", "E07000170-2", NOTHING_PREPARED],
    ])("answers 404 for %s", async (_what, id, preparedData) => {
      const response = await testApp({
        fetch: noNetwork(),
        preparedData,
      }).request(`/api/land/${id}`);

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining("run pnpm data:prepare") as unknown,
      });
    });

    it("answers 400 for an id that isn't a Land Parcel's", async () => {
      const response = await landApp().request("/api/land/the-big-field");

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: LAND_PARCEL_HINT });
    });
  });
});
