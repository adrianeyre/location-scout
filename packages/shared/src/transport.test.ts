import { describe, expect, it } from "vitest";

import { isLayerResponse } from "./layer";
import {
  TRANSPORT_FACILITY_TYPES,
  TRANSPORT_ROUTE_TYPES,
  TRANSPORT_TYPES,
  isRouteShape,
  isTransportFeature,
  isTransportLayerResponse,
  isTransportStatistics,
  isTransportType,
} from "./transport";

const busStop = {
  id: "node/1234",
  location: { lat: 53.12401, lng: -1.26365 },
  distanceMetres: 49,
  type: "bus-stop",
  name: "Portland Square",
  osmTag: "highway=bus_stop",
  shape: null,
  lengthMetres: null,
};

const carPark = {
  id: "way/5678",
  location: { lat: 53.1229, lng: -1.2655 },
  distanceMetres: 129,
  type: "car-park",
  name: null,
  osmTag: "amenity=parking",
  shape: null,
  lengthMetres: null,
};

const footpaths = {
  id: "footpath",
  location: { lat: 53.1236, lng: -1.2641 },
  distanceMetres: 7,
  type: "footpath",
  name: null,
  osmTag: null,
  shape: {
    type: "MultiLineString",
    coordinates: [
      [
        [-1.2641, 53.1236],
        [-1.2645, 53.124],
      ],
      [
        [-1.26, 53.12],
        [-1.261, 53.121],
        [-1.262, 53.121],
      ],
    ],
  },
  lengthMetres: 312,
};

const statistics = {
  facilities: TRANSPORT_FACILITY_TYPES.map((type) => ({
    type,
    count: type === "bus-stop" || type === "car-park" ? 1 : 0,
  })),
  routes: TRANSPORT_ROUTE_TYPES.map((type) => ({
    type,
    lengthMetres: type === "footpath" ? 312 : 0,
  })),
  nearestStation: {
    id: "node/99",
    name: "Sutton Parkway",
    distanceMetres: 2290,
    inSearchArea: false,
  },
  stationSearchMetres: 5000,
};

const layer = {
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
  features: [busStop, carPark, footpaths],
  statistics,
};

describe("TRANSPORT_TYPES", () => {
  it("are the facilities, then the routes", () => {
    expect(TRANSPORT_TYPES).toEqual([
      "railway-station",
      "bus-stop",
      "car-park",
      "ev-charger",
      "footpath",
      "cycle-route",
    ]);
    for (const type of TRANSPORT_TYPES)
      expect(isTransportType(type)).toBe(true);
  });

  it("leave out an OpenStreetMap tag value", () => {
    expect(isTransportType("bus_stop")).toBe(false);
  });
});

describe("isRouteShape", () => {
  it("accepts lines of two or more positions", () => {
    expect(isRouteShape(footpaths.shape)).toBe(true);
  });

  it.each([
    ["a polygon", { type: "MultiPolygon", coordinates: [] }],
    ["no lines", { type: "MultiLineString", coordinates: [] }],
    [
      "a line of one position",
      { type: "MultiLineString", coordinates: [[[-1.26, 53.12]]] },
    ],
    [
      "a position with no latitude",
      {
        type: "MultiLineString",
        coordinates: [[[-1.26, 53.12], [-1.27]]],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isRouteShape(value)).toBe(false);
  });
});

describe("isTransportFeature", () => {
  it("accepts a named facility, one OpenStreetMap names nothing, and routes", () => {
    expect(isTransportFeature(busStop)).toBe(true);
    expect(isTransportFeature(carPark)).toBe(true);
    expect(isTransportFeature(footpaths)).toBe(true);
  });

  it.each([
    ["an unknown type", { ...busStop, type: "tram-stop" }],
    ["a facility with no tag", { ...busStop, osmTag: null }],
    ["a facility with lines", { ...busStop, shape: footpaths.shape }],
    ["a facility with a length", { ...busStop, lengthMetres: 10 }],
    ["routes with no lines", { ...footpaths, shape: null }],
    ["routes with no length", { ...footpaths, lengthMetres: null }],
    ["routes with a negative length", { ...footpaths, lengthMetres: -1 }],
    ["routes with a tag", { ...footpaths, osmTag: "highway=footway" }],
    ["routes with a name", { ...footpaths, name: "Skegby Trail" }],
    ["no distance", { ...busStop, distanceMetres: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isTransportFeature(value)).toBe(false);
  });
});

describe("isTransportStatistics", () => {
  it("accepts every facility counted, every route measured and the nearest station", () => {
    expect(isTransportStatistics(statistics)).toBe(true);
  });

  it("accepts no railway station within reach", () => {
    expect(isTransportStatistics({ ...statistics, nearestStation: null })).toBe(
      true,
    );
  });

  it.each([
    [
      "a count that is not a whole number",
      { ...statistics, facilities: [{ type: "bus-stop", count: 1.5 }] },
    ],
    [
      "a route counted as a facility",
      { ...statistics, facilities: [{ type: "footpath", count: 1 }] },
    ],
    [
      "a facility measured as a route",
      { ...statistics, routes: [{ type: "car-park", lengthMetres: 1 }] },
    ],
    [
      "a nearest station that doesn't say whether it is in the Search Area",
      {
        ...statistics,
        nearestStation: { id: "node/99", name: null, distanceMetres: 2290 },
      },
    ],
    ["no search distance", { ...statistics, stationSearchMetres: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isTransportStatistics(value)).toBe(false);
  });
});

describe("isTransportLayerResponse", () => {
  it("accepts transport with its counts, lengths and nearest station", () => {
    expect(isTransportLayerResponse(layer)).toBe(true);
    expect(isLayerResponse(layer)).toBe(true);
  });

  it("accepts an unavailable Layer with no Features or statistics", () => {
    expect(
      isTransportLayerResponse({
        ...layer,
        status: "unavailable",
        features: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["another Layer", { ...layer, layer: "amenities" }],
    ["a Feature of another Layer", { ...layer, features: [{ id: "1" }] }],
    ["statistics with no routes", { ...layer, statistics: { facilities: [] } }],
  ])("rejects %s", (_label, value) => {
    expect(isTransportLayerResponse(value)).toBe(false);
  });
});
