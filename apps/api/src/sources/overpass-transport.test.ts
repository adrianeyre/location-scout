import { describe, expect, it } from "vitest";

import {
  TRANSPORT_FACILITY_TYPES,
  TRANSPORT_ROUTE_TYPES,
  distanceMetres,
  isTransportFeature,
  isTransportStatistics,
  type Location,
} from "@location-scout/shared";

import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import ng17Overpass from "./fixtures/overpass-ng17-1aa.json" with { type: "json" };
import { mapOverpassResponse, type OsmElement } from "./overpass";
import {
  STATION_SEARCH_METRES,
  TRANSPORT_SELECTION,
  classifyTransportFacility,
  classifyTransportRoute,
  mapTransport,
} from "./overpass-transport";

const NG17_1AA = NG17_1AA_AREA.location;

const { elements: ng17Elements } = mapOverpassResponse(200, ng17Overpass);

const element = (
  id: string,
  tags: Record<string, string>,
  location = NG17_1AA,
  line?: Location[],
): OsmElement => ({ id, location, tags, ...(line ? { line } : {}) });

/** A point `north` metres north of NG17 1AA (negative for south). */
const north = (metres: number): Location => ({
  lat: NG17_1AA.lat + metres / 111_195,
  lng: NG17_1AA.lng,
});

describe("TRANSPORT_SELECTION", () => {
  it("asks for bus stops, car parks and EV chargers in the Search Area, railway stations within 5 km, and the lines of paths", () => {
    expect(TRANSPORT_SELECTION).toEqual({
      layer: "transport",
      filters: [
        '["highway"="bus_stop"]',
        '["amenity"~"^(parking|charging_station)$"]',
      ],
      lineFilters: ['["highway"~"^(cycleway|footway|path|bridleway|steps)$"]'],
      wider: { metres: 5000, filters: ['["railway"~"^(station|halt)$"]'] },
    });
  });
});

describe("classifyTransportFacility", () => {
  it.each([
    [{ railway: "station" }, "railway-station", "railway=station"],
    [{ railway: "halt" }, "railway-station", "railway=halt"],
    [{ highway: "bus_stop" }, "bus-stop", "highway=bus_stop"],
    [
      { amenity: "parking", access: "customers" },
      "car-park",
      "amenity=parking",
    ],
    [{ amenity: "charging_station" }, "ev-charger", "amenity=charging_station"],
  ])("makes %j a %s, by %s", (tags, type, osmTag) => {
    expect(classifyTransportFacility(tags)).toEqual({ type, osmTag });
  });

  it.each([
    ["a private car park", { amenity: "parking", access: "private" }],
    ["a car park closed to the public", { amenity: "parking", access: "no" }],
    [
      "an EV charger only for bikes",
      { amenity: "charging_station", motorcar: "no", bicycle: "yes" },
    ],
    [
      "a miniature railway's station",
      { railway: "station", station: "miniature" },
    ],
    ["a heritage railway's station", { railway: "station", usage: "tourism" }],
    ["a tram stop", { railway: "tram_stop" }],
    ["an amenity", { amenity: "cafe" }],
  ])("leaves out %s", (_label, tags) => {
    expect(classifyTransportFacility(tags)).toBeNull();
  });
});

describe("classifyTransportRoute", () => {
  it.each([
    [{ highway: "cycleway" }, "cycle-route"],
    [{ highway: "path", bicycle: "designated" }, "cycle-route"],
    [{ highway: "footway", bicycle: "designated" }, "cycle-route"],
    [{ highway: "footway" }, "footpath"],
    [{ highway: "path", bicycle: "yes" }, "footpath"],
    [{ highway: "bridleway" }, "footpath"],
    [{ highway: "steps" }, "footpath"],
  ])("makes %j a %s", (tags, type) => {
    expect(classifyTransportRoute(tags)).toBe(type);
  });

  it.each([
    [
      "a pavement mapped beside a road",
      { highway: "footway", footway: "sidewalk" },
    ],
    [
      "a crossing mapped across a road",
      { highway: "footway", footway: "crossing" },
    ],
    ["a private path", { highway: "path", access: "private" }],
    ["a road", { highway: "residential" }],
  ])("leaves out %s", (_label, tags) => {
    expect(classifyTransportRoute(tags)).toBeNull();
  });
});

describe("mapTransport", () => {
  const ng17 = mapTransport(ng17Elements, NG17_1AA_AREA);

  it("counts NG17 1AA's recorded bus stops, car parks and EV chargers, with no railway station in the Search Area", () => {
    expect(ng17.statistics.facilities).toEqual([
      { type: "railway-station", count: 0 },
      { type: "bus-stop", count: 58 },
      { type: "car-park", count: 33 },
      { type: "ev-charger", count: 1 },
    ]);
    expect(isTransportStatistics(ng17.statistics)).toBe(true);
  });

  it("finds Sutton Parkway, 1.6 km away and outside the Search Area, as the nearest railway station", () => {
    expect(ng17.statistics.nearestStation).toEqual({
      id: "node/3170173970",
      name: "Sutton Parkway",
      distanceMetres: 1628,
      inSearchArea: false,
    });
    expect(ng17.statistics.stationSearchMetres).toBe(STATION_SEARCH_METRES);
    // Measured from the recorded point: 53.1141408, -1.2455485.
    expect(
      distanceMetres(NG17_1AA, { lat: 53.1141408, lng: -1.2455485 }),
    ).toBeCloseTo(1628, 0);
  });

  it("measures NG17 1AA's footpaths and cycle routes inside the Search Area", () => {
    expect(ng17.statistics.routes).toEqual([
      { type: "footpath", lengthMetres: 9094 },
      { type: "cycle-route", lengthMetres: 2923 },
    ]);
  });

  it("gives each facility in the Search Area, then the footpaths and the cycle routes, by type and nearest first", () => {
    expect(ng17.features).toHaveLength(58 + 33 + 1 + 2);
    expect(ng17.features.every(isTransportFeature)).toBe(true);
    expect(ng17.features.map(({ type }) => type)).toEqual([
      ...Array<string>(58).fill("bus-stop"),
      ...Array<string>(33).fill("car-park"),
      "ev-charger",
      "footpath",
      "cycle-route",
    ]);
    for (const type of TRANSPORT_FACILITY_TYPES) {
      const distances = ng17.features
        .filter((feature) => feature.type === type)
        .map(({ distanceMetres }) => distanceMetres);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
    }
    expect(ng17.features[0]).toEqual({
      id: "node/502386902",
      location: { lat: 53.1224124, lng: -1.2622831 },
      distanceMetres: 184,
      type: "bus-stop",
      name: "Silk Street",
      osmTag: "highway=bus_stop",
      shape: null,
      lengthMetres: null,
    });
  });

  it("joins the footpaths into one Feature, cut off at the Search Area's edge, marked at their point nearest the Location", () => {
    const footpaths = ng17.features.find(({ id }) => id === "footpath");

    expect(footpaths).toMatchObject({
      type: "footpath",
      name: null,
      osmTag: null,
      lengthMetres: 9094,
      distanceMetres: 42,
    });
    const positions = footpaths?.shape?.coordinates.flat() ?? [];
    expect(positions.length).toBeGreaterThan(0);
    const furthest = Math.max(
      ...positions.map(([lng, lat]) => distanceMetres(NG17_1AA, { lat, lng })),
    );
    expect(furthest).toBeLessThanOrEqual(NG17_1AA_AREA.searchRadius.metres + 1);
    const nearest = Math.min(
      ...positions.map(([lng, lat]) => distanceMetres(NG17_1AA, { lat, lng })),
    );
    expect(nearest).toBeGreaterThanOrEqual(42);
  });

  it("makes a railway station in the Search Area a Feature, and the nearest", () => {
    const { features, statistics } = mapTransport(
      [
        element("node/1", { railway: "station", name: "Far" }, north(3000)),
        element("node/2", { railway: "halt", name: "Near" }, north(300)),
      ],
      NG17_1AA_AREA,
    );

    expect(features.map(({ id }) => id)).toEqual(["node/2"]);
    expect(statistics.facilities[0]).toEqual({
      type: "railway-station",
      count: 1,
    });
    expect(statistics.nearestStation).toEqual({
      id: "node/2",
      name: "Near",
      distanceMetres: 300,
      inSearchArea: true,
    });
  });

  it("gives no nearest railway station, and no routes, in a Search Area with neither", () => {
    const { features, statistics } = mapTransport(
      [element("node/1", { highway: "bus_stop" })],
      NG17_1AA_AREA,
    );

    expect(features.map(({ type }) => type)).toEqual(["bus-stop"]);
    expect(statistics.nearestStation).toBeNull();
    expect(statistics.routes).toEqual(
      TRANSPORT_ROUTE_TYPES.map((type) => ({ type, lengthMetres: 0 })),
    );
  });

  it("joins every way of a type, leaving out what is outside the Search Area", () => {
    const { features, statistics } = mapTransport(
      [
        element("way/1", { highway: "footway" }, north(100), [
          north(50),
          north(150),
        ]),
        element("way/2", { highway: "path" }, north(800), [
          north(700),
          north(900),
        ]),
        element("way/3", { highway: "steps" }, north(2000), [
          north(1900),
          north(2100),
        ]),
      ],
      NG17_1AA_AREA,
    );

    expect(features).toHaveLength(1);
    expect(features[0]?.shape?.coordinates).toHaveLength(2);
    // 100 m of way/1 and the 104.7 m of way/2 inside 804.7 m.
    expect(features[0]?.lengthMetres).toBe(205);
    expect(features[0]?.distanceMetres).toBe(50);
    expect(statistics.routes[0]).toEqual({
      type: "footpath",
      lengthMetres: 205,
    });
  });

  it("counts an element found twice once", () => {
    const stop = element("node/1", { highway: "bus_stop" });

    expect(mapTransport([stop, stop], NG17_1AA_AREA).features).toHaveLength(1);
  });

  it("leaves out the amenities found by the same query", () => {
    expect(
      mapTransport([element("node/1", { amenity: "cafe" })], NG17_1AA_AREA)
        .features,
    ).toEqual([]);
  });
});
