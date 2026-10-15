import { afterEach, describe, expect, it, vi } from "vitest";

import type { SearchArea } from "@location-scout/shared";

import {
  neverAnswers,
  noNetwork,
  overpassFixtures,
} from "../testing/fetch-stubs";
import { NG17_1AA_OVERPASS } from "../testing/overpass-recordings";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import { createSourceCaller, SOURCE_TIMEOUT_MS } from "./data-source";
import ng17Overpass from "./fixtures/overpass-ng17-1aa.json" with { type: "json" };
import {
  INTERPRETER_URL,
  OSM_SELECTIONS,
  OverpassError,
  mapOverpassResponse,
  osmElements,
  overpassBody,
  overpassQuery,
} from "./overpass";
import { createRateLimiter, type RateLimiter } from "./rate-limiter";

const USER_AGENT = "location-scout-test (tests@example.com)";

/** A limiter that never holds up a test that isn't about the rate limit. */
const unlimited = () => ({
  limiter: createRateLimiter(0),
  userAgent: USER_AGENT,
});

const caller = (fetchFn: typeof fetch) =>
  createSourceCaller({ fetch: fetchFn });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("overpassQuery", () => {
  const AROUND = "(around:804.7,53.123664,-1.264078)";
  /** The settings, with a box reaching 100 m past the widest `around:`. */
  const settings = (bbox: string) =>
    `[out:json][timeout:8][maxsize:134217728][bbox:${bbox}];`;
  /** The box of NG17 1AA's 0.5 mile Search Area alone, reaching 904.672 m. */
  const IN_AREA = settings("53.115537,-1.277621,53.131791,-1.250535");

  it("asks for every Layer's elements within the Search Radius of the Location, with their tags and middle, the lines of paths, and the outlines of green spaces, in a box around the railway stations' 5 km", () => {
    const PARKS = "(around:2000.0,53.123664,-1.264078)";

    expect(overpassQuery(NG17_1AA_AREA)).toBe(
      `${settings("53.077850,-1.340423,53.169478,-1.187733")}(${[
        `nwr["shop"]${AROUND};`,
        `nwr["amenity"~"^(cafe|restaurant|fast_food|pub|dentist|kindergarten|childcare|doctors|clinic|hospital|pharmacy)$"]${AROUND};`,
        `nwr["leisure"="fitness_centre"]${AROUND};`,
        `nwr["healthcare"]${AROUND};`,
        `nwr["office"]${AROUND};`,
        `nwr["highway"="bus_stop"]${AROUND};`,
        `nwr["amenity"~"^(parking|charging_station)$"]${AROUND};`,
        `nwr["railway"~"^(station|halt)$"](around:5000.0,53.123664,-1.264078);`,
      ].join("")});out tags center;` +
        `(${[
          `way["highway"~"^(cycleway|footway|path|bridleway|steps)$"]${AROUND};`,
          `nw["leisure"~"^(playground|nature_reserve)$"]${AROUND};`,
          `nw["natural"="wood"]${AROUND};`,
          `nw["landuse"="forest"]${AROUND};`,
          `nw["leisure"="park"]${PARKS};`,
        ].join("")});out tags geom;` +
        `(${[
          `rel["leisure"~"^(playground|nature_reserve)$"]${AROUND};`,
          `rel["natural"="wood"]${AROUND};`,
          `rel["landuse"="forest"]${AROUND};`,
          `rel["leisure"="park"]${PARKS};`,
        ].join("")});out body geom;`,
    );
  });

  it("serves the Amenities, Transport and Green space Layers so far", () => {
    expect(OSM_SELECTIONS.map(({ layer }) => layer)).toEqual([
      "amenities",
      "transport",
      "green-space",
    ]);
  });

  it("joins another Layer's filters into the same one query", () => {
    const query = overpassQuery(NG17_1AA_AREA, [
      ...OSM_SELECTIONS,
      { layer: "schools", filters: ['["amenity"="school"]'] },
    ]);

    // One output for every Layer's points, one for every Layer's lines and
    // ways mapped as areas, and one for every Layer's relations mapped as areas.
    expect(query.match(/out /g)).toHaveLength(3);
    expect(query).toContain(`nwr["shop"]${AROUND};`);
    expect(query).toContain(`nwr["amenity"="school"]${AROUND};`);
  });

  it("asks for nodes and ways mapped as areas with their lines, and relations with their members' lines", () => {
    expect(
      overpassQuery(NG17_1AA_AREA, [
        {
          layer: "green-space",
          filters: [],
          areaFilters: ['["leisure"="playground"]'],
        },
      ]),
    ).toBe(
      IN_AREA +
        `(nw["leisure"="playground"]${AROUND};);out tags geom;` +
        `(rel["leisure"="playground"]${AROUND};);out body geom;`,
    );
  });

  it("outputs no lines when no Layer asks for them", () => {
    expect(
      overpassQuery(NG17_1AA_AREA, [
        { layer: "amenities", filters: ['["shop"]'] },
      ]),
    ).toBe(`${IN_AREA}(nwr["shop"]${AROUND};);out tags center;`);
  });

  it("asks for a Layer's wider filters within their own distance of the Location", () => {
    const query = overpassQuery(NG17_1AA_AREA, [
      {
        layer: "transport",
        filters: [],
        wider: { metres: 2500, filters: ['["railway"="station"]'] },
      },
    ]);

    expect(query).toBe(
      `${settings("53.100308,-1.302999,53.147020,-1.225157")}(nwr["railway"="station"](around:2500.0,53.123664,-1.264078););out tags center;`,
    );
  });

  it("asks for a Layer's wider area filters within their own distance, with outlines", () => {
    const WIDER = "(around:2000.0,53.123664,-1.264078)";

    expect(
      overpassQuery(NG17_1AA_AREA, [
        {
          layer: "green-space",
          filters: [],
          wider: { metres: 2000, areaFilters: ['["leisure"="park"]'] },
        },
      ]),
    ).toBe(
      settings("53.104799,-1.295514,53.142529,-1.232642") +
        `(nw["leisure"="park"]${WIDER};);out tags geom;` +
        `(rel["leisure"="park"]${WIDER};);out body geom;`,
    );
  });

  it("is sent as the data field of a form", () => {
    expect(new URLSearchParams(overpassBody(NG17_1AA_AREA)).get("data")).toBe(
      overpassQuery(NG17_1AA_AREA),
    );
  });
});

describe("mapOverpassResponse", () => {
  it("reads every recorded element, and the date of Overpass's copy of OpenStreetMap", () => {
    const { elements, dataDate } = mapOverpassResponse(200, ng17Overpass);

    // 584 for the Amenities and Transport Layers, and 30 green spaces.
    expect(elements).toHaveLength(614);
    expect(elements.filter(({ line }) => line)).toHaveLength(249 + 30);
    expect(dataDate).toBe("2026-10-08");
  });

  it("places a node at its point and a way at its middle, by type and id", () => {
    const { elements } = mapOverpassResponse(200, ng17Overpass);

    expect(elements.find(({ id }) => id === "node/676196614")).toEqual({
      id: "node/676196614",
      location: { lat: 53.1241327, lng: -1.2536558 },
      tags: { amenity: "cafe" },
    });
    expect(elements.find(({ id }) => id === "way/251921972")).toMatchObject({
      location: { lat: expect.closeTo(53.124, 3) as unknown },
      tags: { amenity: "cafe", name: "Costa" },
    });
  });

  it("gives a way output with its line its points in order, placed at the middle of its bounds", () => {
    const { elements } = mapOverpassResponse(200, ng17Overpass);

    expect(elements.find(({ id }) => id === "way/33610130")).toEqual({
      id: "way/33610130",
      location: {
        lat: expect.closeTo(53.1304785, 6) as unknown,
        lng: expect.closeTo(-1.2613006, 6) as unknown,
      },
      tags: expect.objectContaining({
        highway: "cycleway",
        name: "Skegby Trail",
      }) as unknown,
      line: [
        { lat: 53.1303783, lng: -1.2613888 },
        { lat: 53.1304225, lng: -1.2613376 },
        { lat: 53.1304997, lng: -1.2612314 },
        { lat: 53.1305786, lng: -1.2612123 },
      ],
    });
  });

  it("gives a line no line when it has fewer than two points", () => {
    const { elements } = mapOverpassResponse(200, {
      elements: [
        {
          type: "way",
          id: 1,
          bounds: { minlat: 53.1, minlon: -1.2, maxlat: 53.1, maxlon: -1.2 },
          geometry: [{ lat: 53.1, lon: -1.2 }, null],
          tags: { highway: "footway" },
        },
      ],
    });

    expect(elements).toEqual([
      {
        id: "way/1",
        location: { lat: 53.1, lng: -1.2 },
        tags: { highway: "footway" },
      },
    ]);
  });

  it("gives a relation output with its members' lines each member way, with its role and points, placed at the middle of its bounds", () => {
    const { elements } = mapOverpassResponse(200, {
      elements: [
        {
          type: "relation",
          id: 9758367,
          bounds: {
            minlat: 53.16,
            minlon: -1.18,
            maxlat: 53.17,
            maxlon: -1.16,
          },
          members: [
            {
              type: "way",
              ref: 1,
              role: "outer",
              geometry: [
                { lat: 53.16, lon: -1.18 },
                { lat: 53.17, lon: -1.16 },
              ],
            },
            {
              type: "way",
              ref: 2,
              role: "inner",
              geometry: [
                { lat: 53.165, lon: -1.17 },
                { lat: 53.166, lon: -1.171 },
              ],
            },
            // A label node, and a way with too few points for a line.
            { type: "node", ref: 3, role: "label", lat: 53.165, lon: -1.17 },
            {
              type: "way",
              ref: 4,
              role: "outer",
              geometry: [{ lat: 53.16, lon: -1.18 }],
            },
          ],
          tags: { leisure: "park", type: "multipolygon" },
        },
      ],
    });

    expect(elements).toEqual([
      {
        id: "relation/9758367",
        location: { lat: 53.165, lng: -1.17 },
        tags: { leisure: "park", type: "multipolygon" },
        members: [
          {
            role: "outer",
            line: [
              { lat: 53.16, lng: -1.18 },
              { lat: 53.17, lng: -1.16 },
            ],
          },
          {
            role: "inner",
            line: [
              { lat: 53.165, lng: -1.17 },
              { lat: 53.166, lng: -1.171 },
            ],
          },
        ],
      },
    ]);
  });

  it("skips a relation output with its tags only, and no members or middle", () => {
    const { elements } = mapOverpassResponse(200, {
      elements: [{ type: "relation", id: 1, tags: { leisure: "park" } }],
    });

    expect(elements).toEqual([]);
  });

  it("skips an element with no point or no tags, and a tag that is not text", () => {
    const { elements } = mapOverpassResponse(200, {
      elements: [
        { type: "way", id: 1, tags: { shop: "bakery" } },
        { type: "node", id: 2, lat: 53.1, lon: -1.2 },
        { type: "node", id: 3, lat: 53.1, lon: -1.2, tags: { shop: 4 } },
      ],
    });

    expect(elements).toEqual([
      { id: "node/3", location: { lat: 53.1, lng: -1.2 }, tags: {} },
    ]);
  });

  it("gives no date when Overpass states none", () => {
    expect(mapOverpassResponse(200, { elements: [] })).toEqual({
      elements: [],
      dataDate: null,
    });
  });

  it.each([
    ["too many requests", 429, ng17Overpass],
    ["a body with no elements", 200, { remark: "busy" }],
    ["no body", 200, null],
    [
      "a query that ran out of time, with what it found so far",
      200,
      {
        ...ng17Overpass,
        remark:
          'runtime error: Query timed out in "query" at line 1 after 8 seconds.',
      },
    ],
  ])("throws on %s", (_label, status, body) => {
    expect(() => mapOverpassResponse(status, body)).toThrow(OverpassError);
  });
});

describe("osmElements", () => {
  it("sends one query for the Search Area as a POST form, saying who sends it, after waiting its turn", async () => {
    const fetchMock = overpassFixtures(NG17_1AA_OVERPASS);
    const wait = vi.fn<RateLimiter["wait"]>(() => Promise.resolve());

    const result = await osmElements(NG17_1AA_AREA, caller(fetchMock), {
      limiter: { wait },
      userAgent: USER_AGENT,
    });

    expect(result).toMatchObject({
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    });
    expect(result.status === "ok" && result.data.elements).toHaveLength(614);
    expect(wait).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(INTERPRETER_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": USER_AGENT,
      },
      body: overpassBody(NG17_1AA_AREA),
      signal: expect.any(AbortSignal) as unknown,
    });
  });

  it("answers a repeated Search Area from the cache, without waiting for a turn", async () => {
    const fetchMock = overpassFixtures(NG17_1AA_OVERPASS);
    const callSource = caller(fetchMock);
    const wait = vi.fn<RateLimiter["wait"]>(() => Promise.resolve());

    const first = await osmElements(NG17_1AA_AREA, callSource, {
      limiter: { wait },
      userAgent: USER_AGENT,
    });
    const second = await osmElements(NG17_1AA_AREA, callSource, {
      limiter: { wait },
      userAgent: USER_AGENT,
    });

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledOnce();
  });

  it("sends one query for a Search Area asked for twice at once", async () => {
    const fetchMock = overpassFixtures(NG17_1AA_OVERPASS);
    const callSource = caller(fetchMock);

    const [first, second] = await Promise.all([
      osmElements(NG17_1AA_AREA, callSource, unlimited()),
      osmElements(NG17_1AA_AREA, callSource, unlimited()),
    ]);

    expect(first.status).toBe("ok");
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("spaces queries for different Search Areas a second apart", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ elements: [] })),
    );
    const callSource = caller(fetchMock);
    const options = {
      limiter: createRateLimiter(1000),
      userAgent: USER_AGENT,
    };
    const wider: SearchArea = {
      ...NG17_1AA_AREA,
      searchRadius: { miles: 1, metres: 1609.344 },
    };

    const first = osmElements(NG17_1AA_AREA, callSource, options);
    const second = osmElements(wider, callSource, options);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await first).status).toBe("ok");
    expect((await second).status).toBe("ok");
  });

  it.each([
    ["is too busy", () => new Response("", { status: 429 })],
    [
      "runs out of time",
      () =>
        Response.json({
          elements: [],
          remark: "runtime error: Query timed out",
        }),
    ],
  ])(
    "is unavailable, and asks again next time, when Overpass %s",
    async (_label, respond) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond()));
      const callSource = caller(fetchMock);

      const result = await osmElements(NG17_1AA_AREA, callSource, unlimited());
      await osmElements(NG17_1AA_AREA, callSource, unlimited());

      expect(result).toEqual({ status: "unavailable" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("is unavailable when Overpass takes more than 8 seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const pending = osmElements(
      NG17_1AA_AREA,
      caller(neverAnswers()),
      unlimited(),
    );
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);

    expect(await pending).toEqual({ status: "unavailable" });
  });

  it("is unavailable, without reaching the network, in tests with no recording", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const others = noNetwork();
    const elsewhere: SearchArea = {
      ...NG17_1AA_AREA,
      searchRadius: { miles: 1, metres: 1609.344 },
    };

    const result = await osmElements(
      elsewhere,
      caller(overpassFixtures(NG17_1AA_OVERPASS, others)),
      unlimited(),
    );

    expect(result).toEqual({ status: "unavailable" });
    expect(others).not.toHaveBeenCalled();
  });
});
