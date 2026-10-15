import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLANNING_CONSTRAINT_TYPES,
  distanceMetres,
  isPlanningConstraintFeature,
  type SearchArea,
} from "@location-scout/shared";

import {
  neverAnswers,
  noNetwork,
  planningDataFixtures,
} from "../testing/fetch-stubs";
import {
  CAMBRIDGE_AREA,
  CAMBRIDGE_PLANNING_DATA,
  NG17_1AA_PLANNING_DATA,
} from "../testing/planning-data-recordings";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import { createSourceCaller, SOURCE_TIMEOUT_MS } from "./data-source";
import cambridgePage2 from "./fixtures/planning-data-cambridge-offset-500.json" with { type: "json" };
import cambridgePage1 from "./fixtures/planning-data-cambridge.json" with { type: "json" };
import ng17Constraints from "./fixtures/planning-data-ng17-1aa.json" with { type: "json" };
import {
  ENTITY_URL,
  PAGE_SIZE,
  PlanningDataError,
  constraintsUrl,
  mapConstraints,
  mapEntityPage,
  outlinesAtUrl,
  parsePoint,
  parseShape,
  planningConstraints,
  searchAreaWkt,
  type Entity,
} from "./planning-data";

const TODAY = "2026-10-08";

const NG17_1AA = NG17_1AA_AREA.location;

/** The entities in recorded pages. */
const entitiesOf = (...pages: unknown[]) =>
  pages.flatMap((page) => mapEntityPage(200, page).entities);

const ng17Entities = entitiesOf(ng17Constraints);
const cambridgeEntities = entitiesOf(cambridgePage1, cambridgePage2);

/** The list entry of the church at the heart of NG17 1AA's conservation area. */
const ST_MARY_MAGDALENE = "1221773";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("searchAreaWkt and the request URLs", () => {
  it("outlines the Search Area as a closed WKT polygon of 32 corners", () => {
    const wkt = searchAreaWkt(NG17_1AA_AREA);

    const corners = /^POLYGON\(\((.*)\)\)$/.exec(wkt)?.[1]?.split(",") ?? [];
    expect(corners).toHaveLength(33);
    expect(corners[0]).toBe(corners[32]);
    for (const corner of corners) {
      const [lng = 0, lat = 0] = corner.split(" ").map(Number);
      expect(distanceMetres(NG17_1AA, { lat, lng })).toBeCloseTo(805, -1);
    }
  });

  it("asks for every type of Planning Constraint intersecting it, a page at a time, with only the fields used", () => {
    const url = new URL(constraintsUrl(NG17_1AA_AREA, 500));
    const params = url.searchParams;

    expect(`${url.origin}${url.pathname}`).toBe(ENTITY_URL);
    expect(params.getAll("dataset")).toEqual([
      "conservation-area",
      "listed-building",
      "article-4-direction-area",
      "tree-preservation-zone",
      "flood-risk-zone",
    ]);
    expect(params.get("geometry")).toBe(searchAreaWkt(NG17_1AA_AREA));
    expect(params.get("geometry_relation")).toBe("intersects");
    expect(params.get("limit")).toBe(String(PAGE_SIZE));
    expect(params.get("offset")).toBe("500");
    expect(params.getAll("field")).toContain("geometry");
    expect(params.getAll("field")).not.toContain("notes");
  });

  it("asks for the listed building outlines at the Location", () => {
    const params = new URL(outlinesAtUrl(NG17_1AA)).searchParams;

    expect(params.get("dataset")).toBe("listed-building-outline");
    expect(params.get("longitude")).toBe("-1.264078");
    expect(params.get("latitude")).toBe("53.123664");
  });
});

describe("mapEntityPage", () => {
  it("reads the recorded page and its count", () => {
    expect(mapEntityPage(200, cambridgePage1)).toMatchObject({ count: 635 });
    expect(mapEntityPage(200, cambridgePage1).entities).toHaveLength(500);
  });

  it.each([
    ["an error status", 500, ng17Constraints],
    ["a body with no entities", 200, { count: 3 }],
    ["a body with no count", 200, { entities: [] }],
    ["no body", 200, null],
  ])("throws on %s", (_label, status, body) => {
    expect(() => mapEntityPage(status, body)).toThrow(PlanningDataError);
  });
});

describe("parseShape and parsePoint", () => {
  it("reads a MULTIPOLYGON, with a hole", () => {
    expect(
      parseShape(
        "MULTIPOLYGON (((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 2 1, 2 2, 1 1)), ((5 5, 6 5, 6 6, 5 5)))",
      ),
    ).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 1],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [6, 6],
            [5, 5],
          ],
        ],
      ],
    });
  });

  it("reads a POLYGON as a MultiPolygon, closing a ring left open", () => {
    expect(parseShape("POLYGON((0 0,1 0,1 1))")).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      ],
    });
  });

  it.each([
    "",
    "POINT (-1.26 53.12)",
    "POLYGON((0 0, 1 1))",
    "POLYGON((0 0",
    "MULTIPOLYGON (((0 0, 1 0, 1 1)), x)",
  ])("gives no shape for %j", (wkt) => {
    expect(parseShape(wkt)).toBeNull();
  });

  it("reads a POINT as a Location", () => {
    expect(parsePoint("POINT (-1.268 53.124)")).toEqual({
      lat: 53.124,
      lng: -1.268,
    });
    expect(parsePoint("")).toBeNull();
    expect(parsePoint("POINT (-1.268 95)")).toBeNull();
  });
});

describe("mapConstraints", () => {
  it("maps NG17 1AA's recorded conservation area and 8 listed buildings, and finds the Location inside the conservation area", () => {
    const { features, statistics } = mapConstraints(
      ng17Entities,
      NG17_1AA,
      new Set(),
      TODAY,
    );

    expect(features.every(isPlanningConstraintFeature)).toBe(true);
    expect(statistics).toEqual({
      byType: [
        { type: "conservation-area", count: 1, coversLocation: true },
        { type: "listed-building", count: 8, coversLocation: false },
        { type: "article-4-direction", count: 0, coversLocation: false },
        { type: "tree-preservation-zone", count: 0, coversLocation: false },
        { type: "flood-zone", count: 0, coversLocation: false },
      ],
      coveringLocation: [
        {
          type: "conservation-area",
          name: "Sutton in Ashfield Church and Market Place",
        },
      ],
    });
  });

  it("marks a shape covering the Location at the Location, and a listed building at its own point", () => {
    const { features } = mapConstraints(
      ng17Entities,
      NG17_1AA,
      new Set(),
      TODAY,
    );
    const [conservationArea, nearest] = features;

    expect(conservationArea).toMatchObject({
      id: "44005909",
      type: "conservation-area",
      location: NG17_1AA,
      distanceMetres: 0,
      grade: null,
      shape: { type: "MultiPolygon" },
    });
    expect(nearest).toEqual({
      id: "31691403",
      type: "listed-building",
      name: "HUNTER'S BAR",
      grade: "II",
      coversLocation: false,
      shape: null,
      location: { lat: 53.124777, lng: -1.26524 },
      distanceMetres: 146,
    });
  });

  it("lists each type in turn, nearest first", () => {
    const { features } = mapConstraints(
      cambridgeEntities,
      CAMBRIDGE_AREA.location,
      new Set(),
      TODAY,
    );

    const types = features.map(({ type }) => type);
    expect(types).toEqual(
      [...types].sort(
        (a, b) =>
          PLANNING_CONSTRAINT_TYPES.indexOf(a) -
          PLANNING_CONSTRAINT_TYPES.indexOf(b),
      ),
    );
    const listed = features.filter(({ type }) => type === "listed-building");
    expect(listed.map(({ distanceMetres }) => distanceMetres)).toEqual(
      listed.map(({ distanceMetres }) => distanceMetres).sort((a, b) => a - b),
    );
  });

  it("counts every type in Cambridge's two recorded pages, joining each flood zone's areas into one", () => {
    const { features, statistics } = mapConstraints(
      cambridgeEntities,
      CAMBRIDGE_AREA.location,
      new Set(),
      TODAY,
    );

    expect(statistics.byType).toEqual([
      { type: "conservation-area", count: 7, coversLocation: true },
      { type: "listed-building", count: 552, coversLocation: false },
      { type: "article-4-direction", count: 1, coversLocation: false },
      { type: "tree-preservation-zone", count: 8, coversLocation: false },
      { type: "flood-zone", count: 2, coversLocation: false },
    ]);
    expect(statistics.coveringLocation).toEqual([
      { type: "conservation-area", name: "Historic Core" },
    ]);
    const floodZones = features.filter(({ type }) => type === "flood-zone");
    expect(floodZones).toMatchObject([
      { id: "flood-zone-2", name: "Flood zone 2", coversLocation: false },
      { id: "flood-zone-3", name: "Flood zone 3", coversLocation: false },
    ]);
    // 59 recorded areas in zone 2 and 8 in zone 3.
    expect(floodZones.map(({ shape }) => shape?.coordinates.length)).toEqual([
      59, 8,
    ]);
  });

  it("marks a shape the Location is outside at its nearest point, inside the Search Area", () => {
    const from = CAMBRIDGE_AREA.location;
    const { features } = mapConstraints(
      cambridgeEntities,
      from,
      new Set(),
      TODAY,
    );

    for (const feature of features) {
      expect(feature.distanceMetres).toBeLessThanOrEqual(
        Math.ceil(CAMBRIDGE_AREA.searchRadius.metres),
      );
      expect(feature.distanceMetres).toBe(
        Math.round(distanceMetres(from, feature.location)),
      );
      if (feature.shape && !feature.coversLocation) {
        expect(feature.distanceMetres).toBeGreaterThan(0);
      }
    }
    expect(
      features.find(({ name }) => name === "Flood zone 3")?.distanceMetres,
    ).toBe(496);
  });

  it("finds the Location inside a flood zone", () => {
    const zone3 = cambridgeEntities.find(
      (entity) => entity["flood-risk-level"] === "3",
    );
    // planning.data.gov.uk's point for this recorded area lies inside it.
    const inside = parsePoint(String(zone3?.point));
    if (!zone3 || !inside) throw new Error("No area of flood zone 3 recorded");

    const { features, statistics } = mapConstraints(
      [zone3],
      inside,
      new Set(),
      TODAY,
    );

    expect(features).toMatchObject([
      { name: "Flood zone 3", location: inside, distanceMetres: 0 },
    ]);
    expect(statistics.coveringLocation).toEqual([
      { type: "flood-zone", name: "Flood zone 3" },
    ]);
  });

  it("finds the Location inside a listed building from its outline", () => {
    const church: Entity =
      ng17Entities.find(({ reference }) => reference === ST_MARY_MAGDALENE) ??
      {};

    const { features, statistics } = mapConstraints(
      [church],
      NG17_1AA,
      new Set([ST_MARY_MAGDALENE]),
      TODAY,
    );

    expect(features[0]).toMatchObject({ coversLocation: true, grade: "II*" });
    expect(statistics.byType[1]).toEqual({
      type: "listed-building",
      count: 1,
      coversLocation: true,
    });
  });

  it("leaves out a Planning Constraint that has ended, and keeps one ending later", () => {
    const [conservationArea] = ng17Entities.filter(
      ({ dataset }) => dataset === "conservation-area",
    );

    const counted = (endDate: string) =>
      mapConstraints(
        [{ ...conservationArea, "end-date": endDate }],
        NG17_1AA,
        new Set(),
        TODAY,
      ).features.length;

    expect(counted("2020-01-01")).toBe(0);
    expect(counted(TODAY)).toBe(0);
    expect(counted("2027-01-01")).toBe(1);
  });

  it("names an unnamed constraint by its type, and skips one it can't place or doesn't know", () => {
    const { features } = mapConstraints(
      [
        {
          entity: 1,
          dataset: "tree-preservation-zone",
          name: "",
          point: "POINT (-1.264 53.123)",
        },
        {
          entity: 2,
          dataset: "conservation-area",
          name: "Nowhere",
          geometry: "",
          point: "",
        },
        {
          entity: 3,
          dataset: "green-belt",
          name: "Green belt",
          point: "POINT (-1.264 53.123)",
        },
      ],
      NG17_1AA,
      new Set(),
      TODAY,
    );

    expect(features).toMatchObject([
      { id: "1", name: "Unnamed tree preservation zone", shape: null },
    ]);
  });
});

describe("planningConstraints", () => {
  const caller = (fetchFn: typeof fetch) =>
    createSourceCaller({ fetch: fetchFn });

  it("asks for the first page and the outlines at the Location, then each further page", async () => {
    const fetchMock = planningDataFixtures(CAMBRIDGE_PLANNING_DATA);

    const result = await planningConstraints(
      CAMBRIDGE_AREA,
      caller(fetchMock),
      TODAY,
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      constraintsUrl(CAMBRIDGE_AREA),
      outlinesAtUrl(CAMBRIDGE_AREA.location),
      constraintsUrl(CAMBRIDGE_AREA, 500),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { accept: "application/json" },
        signal: expect.any(AbortSignal) as unknown,
      }),
    );
    expect(result).toMatchObject({
      status: "ok",
      period: { from: TODAY, to: TODAY },
      data: {
        statistics: {
          byType: [
            { type: "conservation-area", count: 7 },
            { type: "listed-building", count: 552 },
            { type: "article-4-direction", count: 1 },
            { type: "tree-preservation-zone", count: 8 },
            { type: "flood-zone", count: 2 },
          ],
        },
      },
    });
  });

  it("asks for only one page when one holds them all", async () => {
    const fetchMock = planningDataFixtures(NG17_1AA_PLANNING_DATA);

    const result = await planningConstraints(
      NG17_1AA_AREA,
      caller(fetchMock),
      TODAY,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status === "ok" && result.data.features).toHaveLength(9);
  });

  it("marks a listed building whose outline the Location is inside", async () => {
    const outlines = {
      count: 1,
      entities: [
        {
          entity: 42000001,
          "listed-building": ST_MARY_MAGDALENE,
          "end-date": "",
        },
      ],
      links: {},
    };
    const fetchMock = planningDataFixtures(
      new Map([...NG17_1AA_PLANNING_DATA, [outlinesAtUrl(NG17_1AA), outlines]]),
    );

    const result = await planningConstraints(
      NG17_1AA_AREA,
      caller(fetchMock),
      TODAY,
    );

    expect(result).toMatchObject({
      status: "ok",
      data: {
        statistics: {
          coveringLocation: [
            {
              type: "conservation-area",
              name: "Sutton in Ashfield Church and Market Place",
            },
            { type: "listed-building", name: "CHURCH OF ST MARY MAGDALENE" },
          ],
        },
      },
    });
  });

  it("answers a repeated Search Area from the cache", async () => {
    const fetchMock = planningDataFixtures(CAMBRIDGE_PLANNING_DATA);
    const callSource = caller(fetchMock);

    const first = await planningConstraints(CAMBRIDGE_AREA, callSource, TODAY);
    const second = await planningConstraints(CAMBRIDGE_AREA, callSource, TODAY);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(second).toEqual(first);
  });

  it("is dated the day it was obtained, which a cached answer keeps, for Historic England's statement", async () => {
    const callSource = caller(planningDataFixtures(CAMBRIDGE_PLANNING_DATA));

    await planningConstraints(CAMBRIDGE_AREA, callSource, "2026-10-08");
    const cached = await planningConstraints(
      CAMBRIDGE_AREA,
      callSource,
      "2026-10-09",
    );

    expect(cached).toMatchObject({
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    });
  });

  it.each([
    ["the first page", constraintsUrl(CAMBRIDGE_AREA)],
    ["a further page", constraintsUrl(CAMBRIDGE_AREA, 500)],
    ["the outlines at the Location", outlinesAtUrl(CAMBRIDGE_AREA.location)],
  ])(
    "is unavailable, rather than counting short, when %s fails",
    async (_label, failing) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fetchMock = planningDataFixtures(
        new Map(
          [...CAMBRIDGE_PLANNING_DATA].filter(([url]) => url !== failing),
        ),
      );

      const result = await planningConstraints(
        CAMBRIDGE_AREA,
        caller(fetchMock),
        TODAY,
      );

      expect(result).toEqual({ status: "unavailable" });
    },
  );

  it("is unavailable when planning.data.gov.uk answers with an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ detail: "busy" }, { status: 503 })),
    );

    const result = await planningConstraints(
      NG17_1AA_AREA,
      caller(fetchMock),
      TODAY,
    );

    expect(result).toEqual({ status: "unavailable" });
  });

  it("is unavailable when planning.data.gov.uk takes more than 8 seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const pending = planningConstraints(
      NG17_1AA_AREA,
      caller(neverAnswers()),
      TODAY,
    );
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);

    expect(await pending).toEqual({ status: "unavailable" });
  });

  it("is unavailable, without reaching the network, in tests with no recording", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = noNetwork();
    const elsewhere: SearchArea = {
      ...NG17_1AA_AREA,
      searchRadius: { miles: 1, metres: 1609.344 },
    };

    const result = await planningConstraints(
      elsewhere,
      caller(fetchMock),
      TODAY,
    );

    expect(result).toEqual({ status: "unavailable" });
  });
});
