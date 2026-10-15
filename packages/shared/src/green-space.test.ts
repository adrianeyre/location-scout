import { describe, expect, it } from "vitest";

import {
  GREEN_SPACE_TYPES,
  isGreenSpaceFeature,
  isGreenSpaceLayerResponse,
  isGreenSpaceStatistics,
  isGreenSpaceType,
} from "./green-space";
import { isLayerResponse } from "./layer";

const outline = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-1.266, 53.126],
        [-1.264, 53.126],
        [-1.264, 53.128],
        [-1.266, 53.128],
        [-1.266, 53.126],
      ],
    ],
  ],
};

const park = {
  id: "way/309700889",
  location: { lat: 53.126, lng: -1.264078 },
  distanceMetres: 260,
  type: "park",
  name: "Sutton Lawn",
  osmTag: "leisure=park",
  coversLocation: false,
  shape: outline,
};

const playground = {
  id: "node/1234",
  location: { lat: 53.1229, lng: -1.2655 },
  distanceMetres: 129,
  type: "playground",
  name: null,
  osmTag: "leisure=playground",
  coversLocation: false,
  shape: null,
};

const statistics = {
  total: 2,
  byType: GREEN_SPACE_TYPES.map((type) => ({
    type,
    count: type === "park" || type === "playground" ? 1 : 0,
  })),
  nearestPark: {
    id: "way/309700889",
    name: "Sutton Lawn",
    distanceMetres: 260,
    inSearchArea: true,
    coversLocation: false,
  },
  parkSearchMetres: 2000,
};

const layer = {
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
  features: [park, playground],
  statistics,
};

describe("GREEN_SPACE_TYPES", () => {
  it("are parks, playgrounds, nature reserves and woods", () => {
    expect(GREEN_SPACE_TYPES).toEqual([
      "park",
      "playground",
      "nature-reserve",
      "wood",
    ]);
    for (const type of GREEN_SPACE_TYPES)
      expect(isGreenSpaceType(type)).toBe(true);
  });

  it("leave out an OpenStreetMap tag value", () => {
    expect(isGreenSpaceType("nature_reserve")).toBe(false);
  });
});

describe("isGreenSpaceFeature", () => {
  it("accepts one with an outline, and one OpenStreetMap maps only as a point", () => {
    expect(isGreenSpaceFeature(park)).toBe(true);
    expect(isGreenSpaceFeature(playground)).toBe(true);
  });

  it.each([
    ["an unknown type", { ...park, type: "garden" }],
    ["no tag", { ...park, osmTag: null }],
    [
      "no word on whether it covers the Location",
      { ...park, coversLocation: undefined },
    ],
    [
      "lines for an outline",
      { ...park, shape: { type: "MultiLineString", coordinates: [] } },
    ],
    ["no distance", { ...park, distanceMetres: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isGreenSpaceFeature(value)).toBe(false);
  });
});

describe("isGreenSpaceStatistics", () => {
  it("accepts every type counted and the nearest park", () => {
    expect(isGreenSpaceStatistics(statistics)).toBe(true);
  });

  it("accepts no park within reach", () => {
    expect(isGreenSpaceStatistics({ ...statistics, nearestPark: null })).toBe(
      true,
    );
  });

  it.each([
    ["no total", { ...statistics, total: undefined }],
    [
      "a count that is not a whole number",
      { ...statistics, byType: [{ type: "park", count: 1.5 }] },
    ],
    [
      "a nearest park that doesn't say whether it is in the Search Area",
      {
        ...statistics,
        nearestPark: {
          id: "way/1",
          name: null,
          distanceMetres: 260,
          coversLocation: false,
        },
      },
    ],
    ["no search distance", { ...statistics, parkSearchMetres: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isGreenSpaceStatistics(value)).toBe(false);
  });
});

describe("isGreenSpaceLayerResponse", () => {
  it("accepts green space with its counts and nearest park", () => {
    expect(isGreenSpaceLayerResponse(layer)).toBe(true);
    expect(isLayerResponse(layer)).toBe(true);
  });

  it("accepts an unavailable Layer with no Features or statistics", () => {
    expect(
      isGreenSpaceLayerResponse({
        ...layer,
        status: "unavailable",
        features: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["another Layer", { ...layer, layer: "transport" }],
    ["a Feature of another Layer", { ...layer, features: [{ id: "1" }] }],
    ["statistics with no counts", { ...layer, statistics: { total: 0 } }],
  ])("rejects %s", (_label, value) => {
    expect(isGreenSpaceLayerResponse(value)).toBe(false);
  });
});
