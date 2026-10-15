import { describe, expect, it } from "vitest";

import type {
  GreenSpaceFeature,
  TransportFacilityFeature,
  TransportRouteFeature,
} from "@location-scout/shared";

import { shapeCollection } from "./feature-shapes";

const busStop: TransportFacilityFeature = {
  id: "node/502386902",
  location: { lat: 53.1224124, lng: -1.2622831 },
  distanceMetres: 184,
  type: "bus-stop",
  name: "Silk Street",
  osmTag: "highway=bus_stop",
  shape: null,
  lengthMetres: null,
};

const route = (
  type: TransportRouteFeature["type"],
  lengthMetres: number,
): TransportRouteFeature => ({
  id: type,
  location: { lat: 53.1232889, lng: -1.263982 },
  distanceMetres: 42,
  type,
  name: null,
  osmTag: null,
  shape: {
    type: "MultiLineString",
    coordinates: [
      [
        [-1.263982, 53.1232889],
        [-1.2641, 53.1236],
      ],
    ],
  },
  lengthMetres,
});

describe("shapeCollection for transport", () => {
  it("draws the lines of footpaths and cycle routes, each in its colour, and nothing for a facility", () => {
    const footpaths = route("footpath", 9094);
    const cycleRoutes = route("cycle-route", 2923);

    const collection = shapeCollection("transport", [
      busStop,
      footpaths,
      cycleRoutes,
    ]);

    expect(collection.features).toEqual([
      {
        type: "Feature",
        id: "footpath",
        properties: { name: null, colour: "#5d4037" },
        geometry: footpaths.shape,
      },
      {
        type: "Feature",
        id: "cycle-route",
        properties: { name: null, colour: "#00695c" },
        geometry: cycleRoutes.shape,
      },
    ]);
  });
});

describe("shapeCollection for green space", () => {
  it("draws the outline of each green space that has one, in the Layer's colour", () => {
    const park: GreenSpaceFeature = {
      id: "way/309700889",
      location: { lat: 53.125114, lng: -1.2566126 },
      distanceMetres: 524,
      type: "park",
      name: "Sutton Lawn",
      osmTag: "leisure=park",
      coversLocation: false,
      shape: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-1.2566, 53.1251],
              [-1.255, 53.1251],
              [-1.255, 53.126],
              [-1.2566, 53.1251],
            ],
          ],
        ],
      },
    };
    const playground: GreenSpaceFeature = {
      ...park,
      id: "node/1",
      type: "playground",
      name: null,
      osmTag: "leisure=playground",
      shape: null,
    };

    expect(shapeCollection("green-space", [park, playground]).features).toEqual(
      [
        {
          type: "Feature",
          id: "way/309700889",
          properties: { name: "Sutton Lawn", colour: "#4d7c0f" },
          geometry: park.shape,
        },
      ],
    );
  });
});
