import { describe, expect, it } from "vitest";

import type {
  AmenityFeature,
  CrimeFeature,
  GreenSpaceFeature,
  OutputAreaFeature,
  SearchArea,
} from "@location-scout/shared";

import { reportMapData } from "./report-map";

const AREA: SearchArea = {
  location: { lat: 53.123664, lng: -1.264078 },
  searchRadius: { miles: 0.5, metres: 804.672 },
};

const crime = (id: string): CrimeFeature => ({
  id,
  location: { lat: 53.1239, lng: -1.2637 },
  distanceMetres: 37,
  category: "shoplifting",
  categoryName: "Shoplifting",
  month: "2026-08",
  street: "On or near Market Place",
});

const amenity = (id: string, osmTag: string): AmenityFeature => ({
  id,
  location: { lat: 53.1241, lng: -1.2649 },
  distanceMetres: 72,
  type: osmTag === "amenity=cafe" ? "cafe" : "pub",
  name: null,
  osmTag,
});

const park: GreenSpaceFeature = {
  id: "way/24081207",
  location: { lat: 53.1228, lng: -1.2652 },
  distanceMetres: 104,
  type: "park",
  name: "Portland Square",
  osmTag: "leisure=park",
  coversLocation: false,
  shape: {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [-1.2655, 53.1226],
          [-1.2649, 53.1226],
          [-1.2649, 53.123],
          [-1.2655, 53.1226],
        ],
      ],
    ],
  },
};

describe("reportMapData", () => {
  it("draws the Location and the Search Area circle, fitted to its bounds", () => {
    const { location, searchArea, bounds } = reportMapData(AREA, []);

    expect(location.geometry.coordinates).toEqual([-1.264078, 53.123664]);
    const [ring = []] = searchArea.geometry.coordinates;
    expect(ring.length).toBeGreaterThan(32);
    const [[west, south], [east, north]] = bounds;
    // 804.672 m either side of the Location: about 0.0072° of latitude.
    expect(north - AREA.location.lat).toBeCloseTo(0.00724, 4);
    expect(AREA.location.lat - south).toBeCloseTo(0.00724, 4);
    expect(east - AREA.location.lng).toBeCloseTo(AREA.location.lng - west, 6);
  });

  it("draws each Feature known only as a point as a dot in its Layer's colour, and keys each Layer", () => {
    const { points, shapes, key } = reportMapData(AREA, [
      { id: "crime", features: [crime("1"), crime("2")] },
    ]);

    expect(shapes.features).toEqual([]);
    expect(points.features).toEqual([
      {
        type: "Feature",
        properties: { colour: "#bf360c", highlighted: false },
        geometry: { type: "Point", coordinates: [-1.2637, 53.1239] },
      },
      {
        type: "Feature",
        properties: { colour: "#bf360c", highlighted: false },
        geometry: { type: "Point", coordinates: [-1.2637, 53.1239] },
      },
    ]);
    expect(key).toEqual([
      { id: "crime", name: "Crime", colour: "#bf360c", drawn: "2 crimes" },
    ]);
  });

  it("draws a Feature with a shape as its shape alone", () => {
    const { points, shapes, key } = reportMapData(AREA, [
      { id: "green-space", features: [park] },
    ]);

    expect(points.features).toEqual([]);
    expect(shapes.features).toEqual([
      {
        type: "Feature",
        id: "way/24081207",
        properties: { name: "Portland Square", colour: "#4d7c0f" },
        geometry: park.shape,
      },
    ]);
    expect(key.map(({ drawn }) => drawn)).toEqual(["1 green space"]);
  });

  it("rings the Features the Scout Mode highlights, and says how many there are", () => {
    const cafe = amenity("node/1", "amenity=cafe");
    const { points, key } = reportMapData(AREA, [
      {
        id: "amenities",
        features: [amenity("node/2", "amenity=pub")],
        highlighted: {
          features: [cafe],
          noun: ["competitor", "competitors"],
          note: "★ Competitor in the Business: Café Scout Mode",
        },
      },
    ]);

    expect(
      points.features.map(({ properties }) =>
        properties ? Boolean(properties.highlighted) : null,
      ),
    ).toEqual([false, true]);
    expect(key.map(({ drawn }) => drawn)).toEqual([
      "2 amenities, 1 of them competitor, ringed",
    ]);
  });

  it("leaves out the Demographics Layer's output areas, and any Layer with nothing to draw", () => {
    const outputArea = {
      id: "E00142407",
      location: AREA.location,
      distanceMetres: 0,
      deprivationDecile: 2,
    } as OutputAreaFeature;

    const { points, shapes, key } = reportMapData(AREA, [
      { id: "demographics", features: [outputArea] },
      { id: "property", features: [] },
    ]);

    expect(points.features).toEqual([]);
    expect(shapes.features).toEqual([]);
    expect(key).toEqual([]);
  });
});
