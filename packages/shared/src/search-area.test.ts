import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEARCH_RADIUS_MILES,
  distanceMetres,
  isLocation,
  isSearchRadiusMiles,
  milesToMetres,
  searchAreaRing,
} from "./search-area";

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

describe("Search Radius", () => {
  it("defaults to 0.5 mile", () => {
    expect(DEFAULT_SEARCH_RADIUS_MILES).toBe(0.5);
  });

  it.each([0.25, 0.5, 1])("accepts %s mile", (miles) => {
    expect(isSearchRadiusMiles(miles)).toBe(true);
  });

  it.each([0, 0.75, 2, "0.5", null])("rejects %s", (value) => {
    expect(isSearchRadiusMiles(value)).toBe(false);
  });

  it("converts miles to metres", () => {
    expect(milesToMetres(0.5)).toBeCloseTo(804.672, 6);
  });
});

describe("isLocation", () => {
  it("accepts a latitude and longitude", () => {
    expect(isLocation(NG17_1AA)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a missing longitude", { lat: 53 }],
    ["a string latitude", { lat: "53", lng: -1 }],
    ["NaN", { lat: Number.NaN, lng: -1 }],
    ["a latitude past the pole", { lat: 91, lng: -1 }],
    ["a longitude past the antimeridian", { lat: 53, lng: 181 }],
  ])("rejects %s", (_label, value) => {
    expect(isLocation(value)).toBe(false);
  });
});

describe("distanceMetres", () => {
  it("is zero from a Location to itself", () => {
    expect(distanceMetres(NG17_1AA, NG17_1AA)).toBe(0);
  });

  it("measures one degree of latitude as about 111.2 km", () => {
    expect(
      distanceMetres({ lat: 52, lng: -1 }, { lat: 53, lng: -1 }),
    ).toBeCloseTo(111_195, -1);
  });
});

describe("searchAreaRing", () => {
  const radius = milesToMetres(0.5);
  const ring = searchAreaRing(NG17_1AA, radius);

  it("is a closed GeoJSON ring", () => {
    expect(ring).toHaveLength(65);
    expect(ring.at(-1)).toEqual(ring[0]);
  });

  it("puts every vertex one Search Radius from the Location", () => {
    for (const [lng, lat] of ring) {
      expect(distanceMetres(NG17_1AA, { lat, lng })).toBeCloseTo(radius, 3);
    }
  });

  it("starts due north, in [lng, lat] order", () => {
    const [lng, lat] = ring[0] ?? [];
    expect(lng).toBeCloseTo(NG17_1AA.lng, 9);
    expect(lat).toBeGreaterThan(NG17_1AA.lat);
  });
});
