import { describe, expect, it } from "vitest";

import {
  AMENITY_TYPES,
  isAmenitiesLayerResponse,
  isAmenityFeature,
  isAmenityStatistics,
  isAmenityType,
} from "./amenities";

const cafe = {
  id: "node/1234",
  location: { lat: 53.12401, lng: -1.26365 },
  distanceMetres: 49,
  type: "cafe",
  name: "Costa",
  osmTag: "amenity=cafe",
};

const office = {
  id: "way/5678",
  location: { lat: 53.1229, lng: -1.2655 },
  distanceMetres: 129,
  type: "office",
  name: null,
  osmTag: "office=company",
};

const statistics = {
  total: 2,
  byType: AMENITY_TYPES.map((type) => ({
    type,
    count: type === "cafe" || type === "office" ? 1 : 0,
    nearest:
      type === "cafe"
        ? { id: cafe.id, name: cafe.name, distanceMetres: 49 }
        : type === "office"
          ? { id: office.id, name: null, distanceMetres: 129 }
          : null,
  })),
};

const layer = {
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
  features: [cafe, office],
  statistics,
};

describe("isAmenityType", () => {
  it("accepts each type the Amenities Layer shows", () => {
    for (const type of AMENITY_TYPES) expect(isAmenityType(type)).toBe(true);
  });

  it("rejects an OpenStreetMap tag value that is not one of them", () => {
    expect(isAmenityType("fast_food")).toBe(false);
  });
});

describe("isAmenityFeature", () => {
  it("accepts a named amenity, and one OpenStreetMap names nothing", () => {
    expect(isAmenityFeature(cafe)).toBe(true);
    expect(isAmenityFeature(office)).toBe(true);
  });

  it.each([
    ["an unknown type", { ...cafe, type: "bank" }],
    ["a name that is a number", { ...cafe, name: 7 }],
    ["no tag", { ...cafe, osmTag: undefined }],
    ["no distance", { ...cafe, distanceMetres: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isAmenityFeature(value)).toBe(false);
  });
});

describe("isAmenityStatistics", () => {
  it("accepts every type counted, with the nearest of each or none", () => {
    expect(isAmenityStatistics(statistics)).toBe(true);
  });

  it.each([
    ["a total that is not a whole number", { ...statistics, total: 1.5 }],
    [
      "a count below zero",
      {
        ...statistics,
        byType: [{ type: "pub", count: -1, nearest: null }],
      },
    ],
    [
      "a nearest amenity with no distance",
      {
        ...statistics,
        byType: [{ type: "pub", count: 1, nearest: { id: "node/1" } }],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isAmenityStatistics(value)).toBe(false);
  });
});

describe("isAmenitiesLayerResponse", () => {
  it("accepts amenities with their count and nearest of each type", () => {
    expect(isAmenitiesLayerResponse(layer)).toBe(true);
  });

  it("accepts an unavailable Layer with no Features or statistics", () => {
    expect(
      isAmenitiesLayerResponse({
        ...layer,
        status: "unavailable",
        features: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["another Layer", { ...layer, layer: "planning" }],
    ["a Feature of another Layer", { ...layer, features: [{ id: "1" }] }],
    ["statistics with no total", { ...layer, statistics: { byType: [] } }],
  ])("rejects %s", (_label, value) => {
    expect(isAmenitiesLayerResponse(value)).toBe(false);
  });
});
