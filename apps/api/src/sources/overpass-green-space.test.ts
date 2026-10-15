import { describe, expect, it } from "vitest";

import {
  GREEN_SPACE_TYPES,
  distanceMetres,
  isGreenSpaceFeature,
  isGreenSpaceStatistics,
  type Location,
} from "@location-scout/shared";

import { SUTTON_PARKWAY_AREA } from "../testing/overpass-recordings";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import ng17Overpass from "./fixtures/overpass-ng17-1aa.json" with { type: "json" };
import suttonParkwayOverpass from "./fixtures/overpass-sutton-parkway.json" with { type: "json" };
import { mapOverpassResponse, type OsmElement } from "./overpass";
import {
  GREEN_SPACE_SELECTION,
  PARK_SEARCH_METRES,
  classifyGreenSpace,
  mapGreenSpace,
  outlineOf,
} from "./overpass-green-space";

const NG17_1AA = NG17_1AA_AREA.location;

const { elements: ng17Elements } = mapOverpassResponse(200, ng17Overpass);

/** Metres in one degree of latitude. */
const METRES_PER_DEGREE = 111_195;

/** A point `north` metres north of NG17 1AA (negative for south). */
const north = (metres: number): Location => ({
  lat: NG17_1AA.lat + metres / METRES_PER_DEGREE,
  lng: NG17_1AA.lng,
});

/**
 * A closed square ring of points, `side` metres across, centred on `middle`,
 * running anticlockwise from its south-west corner.
 */
const square = (middle: Location, side: number): Location[] => {
  const dLat = side / 2 / METRES_PER_DEGREE;
  const dLng =
    side / 2 / (METRES_PER_DEGREE * Math.cos((middle.lat * Math.PI) / 180));
  const [south, west] = [middle.lat - dLat, middle.lng - dLng];
  const [northEdge, east] = [middle.lat + dLat, middle.lng + dLng];
  return [
    { lat: south, lng: west },
    { lat: south, lng: east },
    { lat: northEdge, lng: east },
    { lat: northEdge, lng: west },
    { lat: south, lng: west },
  ];
};

/** A way mapped as an area, with its outline. */
const area = (
  id: string,
  tags: Record<string, string>,
  middle: Location,
  side = 100,
): OsmElement => ({ id, location: middle, tags, line: square(middle, side) });

/** A node, with no outline. */
const point = (
  id: string,
  tags: Record<string, string>,
  location: Location,
): OsmElement => ({ id, location, tags });

describe("GREEN_SPACE_SELECTION", () => {
  it("asks for the outlines of playgrounds, nature reserves and woods in the Search Area, and of parks within 2 km", () => {
    expect(GREEN_SPACE_SELECTION).toEqual({
      layer: "green-space",
      filters: [],
      areaFilters: [
        '["leisure"~"^(playground|nature_reserve)$"]',
        '["natural"="wood"]',
        '["landuse"="forest"]',
      ],
      wider: { metres: 2000, areaFilters: ['["leisure"="park"]'] },
    });
    expect(PARK_SEARCH_METRES).toBe(2000);
  });
});

describe("classifyGreenSpace", () => {
  it.each([
    [{ leisure: "park" }, "park", "leisure=park"],
    [{ leisure: "playground" }, "playground", "leisure=playground"],
    [{ leisure: "nature_reserve" }, "nature-reserve", "leisure=nature_reserve"],
    [{ natural: "wood" }, "wood", "natural=wood"],
    [{ landuse: "forest" }, "wood", "landuse=forest"],
    [
      { natural: "wood", leisure: "nature_reserve" },
      "nature-reserve",
      "leisure=nature_reserve",
    ],
    [{ leisure: "park", access: "yes" }, "park", "leisure=park"],
  ])("makes %j a %s, by %s", (tags, type, osmTag) => {
    expect(classifyGreenSpace(tags)).toEqual({ type, osmTag });
  });

  it.each([
    ["a private park", { leisure: "park", access: "private" }],
    ["a wood closed to the public", { natural: "wood", access: "no" }],
    ["a garden", { leisure: "garden" }],
    ["a café", { amenity: "cafe" }],
  ])("leaves out %s", (_label, tags) => {
    expect(classifyGreenSpace(tags)).toBeNull();
  });
});

describe("outlineOf", () => {
  it("makes a closed way's line its outline", () => {
    const park = area("way/1", { leisure: "park" }, north(300));

    expect(outlineOf(park)).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [square(north(300), 100).map(({ lat, lng }) => [lng, lat])],
      ],
    });
  });

  it("gives no outline for a way that doesn't close, or a node", () => {
    const line = square(north(300), 100).slice(0, 4);

    expect(
      outlineOf({ id: "way/1", location: NG17_1AA, tags: {}, line }),
    ).toBeNull();
    expect(outlineOf(point("node/1", {}, NG17_1AA))).toBeNull();
  });

  it("joins a relation's member ways into outer rings, with their holes", () => {
    const [a, b, c, d] = square(north(300), 400);
    const hole = square(north(300), 100);
    const elsewhere = square(north(-300), 100);
    if (!a || !b || !c || !d) throw new Error("A square has four corners");

    const shape = outlineOf({
      id: "relation/1",
      location: north(300),
      tags: { leisure: "park", type: "multipolygon" },
      members: [
        { role: "outer", line: [a, b, c] },
        { role: "inner", line: hole },
        { role: "outer", line: elsewhere },
        // Drawn the other way round, as OpenStreetMap allows.
        { role: "outer", line: [a, d, c] },
      ],
    });

    const toPositions = (ring: Location[]) =>
      ring.map(({ lat, lng }) => [lng, lat]);
    expect(shape).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [toPositions([a, b, c, d, a]), toPositions(hole)],
        [toPositions(elsewhere)],
      ],
    });
  });
});

describe("mapGreenSpace", () => {
  const ng17 = mapGreenSpace(ng17Elements, NG17_1AA_AREA);

  it("counts NG17 1AA's recorded parks, playgrounds and woods", () => {
    expect(ng17.statistics).toEqual({
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
      parkSearchMetres: PARK_SEARCH_METRES,
    });
    expect(isGreenSpaceStatistics(ng17.statistics)).toBe(true);
  });

  it("gives each green space in the Search Area with its outline, by type and nearest first", () => {
    expect(ng17.features).toHaveLength(13);
    expect(ng17.features.every(isGreenSpaceFeature)).toBe(true);
    expect(ng17.features.map(({ type }) => type)).toEqual([
      ...Array<string>(6).fill("park"),
      ...Array<string>(3).fill("playground"),
      ...Array<string>(4).fill("wood"),
    ]);
    for (const type of GREEN_SPACE_TYPES) {
      const distances = ng17.features
        .filter((feature) => feature.type === type)
        .map(({ distanceMetres }) => distanceMetres);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
    }
    expect(ng17.features.every(({ shape }) => shape !== null)).toBe(true);
    expect(
      ng17.features.find(({ name }) => name === "Sutton Lawn"),
    ).toMatchObject({
      id: "way/309700889",
      type: "park",
      osmTag: "leisure=park",
      coversLocation: false,
      distanceMetres: 524,
    });
  });

  it("marks each green space at the point of its outline nearest the Location, inside the Search Area", () => {
    for (const { location, distanceMetres: distance, shape } of ng17.features) {
      expect(Math.round(distanceMetres(NG17_1AA, location))).toBe(distance);
      expect(distance).toBeLessThanOrEqual(NG17_1AA_AREA.searchRadius.metres);
      const nearestCorner = Math.min(
        ...(shape?.coordinates.flat(2) ?? []).map(([lng, lat]) =>
          distanceMetres(NG17_1AA, { lat, lng }),
        ),
      );
      expect(distance).toBeLessThanOrEqual(Math.ceil(nearestCorner));
    }
  });

  it("leaves out the parks the wider search finds outside the Search Area", () => {
    const parks = ng17Elements.filter(({ tags }) => tags.leisure === "park");

    // 23 parks within 2 km, 6 of them reaching into the Search Area.
    expect(parks).toHaveLength(23);
    expect(ng17.statistics.byType[0]).toEqual({ type: "park", count: 6 });
  });

  it("counts Sutton Parkway's recorded parks and woods", () => {
    const { elements } = mapOverpassResponse(200, suttonParkwayOverpass);

    expect(
      mapGreenSpace(elements, SUTTON_PARKWAY_AREA).statistics,
    ).toMatchObject({
      total: 7,
      byType: [
        { type: "park", count: 2 },
        { type: "playground", count: 0 },
        { type: "nature-reserve", count: 0 },
        { type: "wood", count: 5 },
      ],
      nearestPark: { id: "way/410657381", distanceMetres: 95 },
    });
  });

  it("marks a green space the Location is inside at the Location, 0 m away", () => {
    const { features, statistics } = mapGreenSpace(
      [area("way/1", { leisure: "park", name: "Here" }, NG17_1AA, 200)],
      NG17_1AA_AREA,
    );

    expect(features).toEqual([
      {
        id: "way/1",
        location: NG17_1AA,
        distanceMetres: 0,
        type: "park",
        name: "Here",
        osmTag: "leisure=park",
        coversLocation: true,
        shape: expect.objectContaining({ type: "MultiPolygon" }) as unknown,
      },
    ]);
    expect(statistics.nearestPark).toEqual({
      id: "way/1",
      name: "Here",
      distanceMetres: 0,
      inSearchArea: true,
      coversLocation: true,
    });
  });

  it("measures to a green space's nearest edge, not its middle", () => {
    const { features } = mapGreenSpace(
      [area("way/1", { natural: "wood" }, north(400), 200)],
      NG17_1AA_AREA,
    );

    expect(features[0]?.distanceMetres).toBe(300);
    expect(features[0]?.location.lat).toBeCloseTo(north(300).lat, 6);
  });

  it("finds the nearest park outside the Search Area, without making it a Feature", () => {
    const { features, statistics } = mapGreenSpace(
      [
        area("way/1", { leisure: "park", name: "Far" }, north(1900), 200),
        area("way/2", { leisure: "park", name: "Near" }, north(1300), 200),
        area("way/3", { leisure: "playground" }, north(200), 20),
      ],
      NG17_1AA_AREA,
    );

    expect(features.map(({ id }) => id)).toEqual(["way/3"]);
    expect(statistics.byType[0]).toEqual({ type: "park", count: 0 });
    expect(statistics.nearestPark).toEqual({
      id: "way/2",
      name: "Near",
      distanceMetres: 1200,
      inSearchArea: false,
      coversLocation: false,
    });
  });

  it("gives no nearest park when there is none within 2 km", () => {
    const { statistics } = mapGreenSpace(
      [
        area("way/1", { leisure: "park" }, north(2200), 200),
        area("way/2", { natural: "wood" }, north(200)),
      ],
      NG17_1AA_AREA,
    );

    expect(statistics.nearestPark).toBeNull();
    expect(statistics.total).toBe(1);
  });

  it("marks one OpenStreetMap maps only as a point at its point, with no outline", () => {
    const { features } = mapGreenSpace(
      [point("node/1", { leisure: "playground" }, north(150))],
      NG17_1AA_AREA,
    );

    expect(features).toEqual([
      {
        id: "node/1",
        location: north(150),
        distanceMetres: 150,
        type: "playground",
        name: null,
        osmTag: "leisure=playground",
        coversLocation: false,
        shape: null,
      },
    ]);
  });

  it("counts an element found twice once, with its outline", () => {
    const park = area("way/1", { leisure: "park" }, north(300));
    const middle = point("way/1", { leisure: "park" }, north(300));

    for (const elements of [
      [middle, park],
      [park, middle],
    ]) {
      const { features } = mapGreenSpace(elements, NG17_1AA_AREA);
      expect(features).toHaveLength(1);
      expect(features[0]?.shape).not.toBeNull();
    }
  });

  it("leaves out the amenities and transport found by the same query", () => {
    expect(
      mapGreenSpace(
        [
          point("node/1", { amenity: "cafe" }, north(100)),
          point("node/2", { highway: "bus_stop" }, north(100)),
        ],
        NG17_1AA_AREA,
      ).features,
    ).toEqual([]);
  });
});
