import { describe, expect, it } from "vitest";

import {
  distanceMetres,
  type ConstraintShape,
  type Position,
} from "@location-scout/shared";

import {
  clipLineToCircle,
  isClosedRing,
  joinRings,
  nearestLinePoint,
  nearestOutlinePoint,
  placeShape,
  polygonsOf,
  shapeContains,
} from "./shapes";

/** A closed square ring from `west, south` to `east, north`. */
const square = (
  west: number,
  south: number,
  east: number,
  north: number,
): Position[] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
];

/** About 1.1 km across, with a hole about 220 m across in the middle. */
const withHole: ConstraintShape = {
  type: "MultiPolygon",
  coordinates: [
    [
      square(-1.27, 53.12, -1.255, 53.13),
      square(-1.264, 53.124, -1.261, 53.126),
    ],
  ],
};

/** Two separate squares. */
const two: ConstraintShape = {
  type: "MultiPolygon",
  coordinates: [
    [square(-1.27, 53.12, -1.265, 53.125)],
    [square(-1.26, 53.12, -1.255, 53.125)],
  ],
};

describe("shapeContains", () => {
  it.each([
    ["inside the outer ring", { lat: 53.122, lng: -1.268 }, true],
    ["in the hole", { lat: 53.125, lng: -1.2625 }, false],
    ["outside", { lat: 53.135, lng: -1.2625 }, false],
  ])("says a point %s is %s", (_label, point, inside) => {
    expect(shapeContains(withHole, point)).toBe(inside);
  });

  it("finds a point in any of a shape's polygons", () => {
    expect(shapeContains(two, { lat: 53.122, lng: -1.258 })).toBe(true);
    expect(shapeContains(two, { lat: 53.122, lng: -1.2625 })).toBe(false);
  });
});

describe("nearestOutlinePoint", () => {
  it("finds the nearest point on an edge, square to it", () => {
    const from = { lat: 53.1225, lng: -1.2615 };

    const nearest = nearestOutlinePoint(two, from);

    // Between the squares, nearer the eastern one's western edge.
    expect(nearest.lng).toBeCloseTo(-1.26, 6);
    expect(nearest.lat).toBeCloseTo(53.1225, 6);
    expect(distanceMetres(from, nearest)).toBeCloseTo(100, 0);
  });

  it("finds a corner when it is nearest", () => {
    const nearest = nearestOutlinePoint(two, { lat: 53.13, lng: -1.25 });

    expect(nearest.lat).toBeCloseTo(53.125, 6);
    expect(nearest.lng).toBeCloseTo(-1.255, 6);
  });

  it("finds the edge of a hole from inside it", () => {
    const from = { lat: 53.125, lng: -1.2625 };

    const nearest = nearestOutlinePoint(withHole, from);

    expect(nearest.lat).toBeCloseTo(53.125, 6);
    expect(distanceMetres(from, nearest)).toBeCloseTo(100, -1);
  });
});

describe("placeShape", () => {
  it("marks a shape at the Location, 0 m away, when the Location is inside it", () => {
    const inside = { lat: 53.122, lng: -1.268 };

    expect(placeShape(withHole, inside)).toEqual({
      location: inside,
      distanceMetres: 0,
      coversLocation: true,
    });
  });

  it("marks a shape at the point of its outline nearest the Location, from outside it", () => {
    const south = { lat: 53.119, lng: -1.268 };

    const placed = placeShape(withHole, south);

    expect(placed.coversLocation).toBe(false);
    expect(placed.location.lat).toBeCloseTo(53.12, 6);
    expect(placed.location.lng).toBeCloseTo(-1.268, 6);
    expect(placed.distanceMetres).toBe(
      Math.round(distanceMetres(south, placed.location)),
    );
    expect(placed.distanceMetres).toBe(111);
  });
});

describe("joinRings", () => {
  const a: Position = [-1.27, 53.12];
  const b: Position = [-1.26, 53.12];
  const c: Position = [-1.26, 53.13];
  const d: Position = [-1.27, 53.13];

  it("keeps a ring that is already closed", () => {
    expect(joinRings([[a, b, c, d, a]])).toEqual([[a, b, c, d, a]]);
  });

  it("joins lines that meet end to end, whichever way each runs", () => {
    expect(
      joinRings([
        [a, b],
        [d, c],
        [c, b],
        [d, a],
      ]),
    ).toEqual([[a, b, c, d, a]]);
  });

  it("gives each ring of several on its own", () => {
    const e: Position = [-1.25, 53.12];
    const f: Position = [-1.24, 53.12];
    const g: Position = [-1.24, 53.13];

    expect(
      joinRings([
        [a, b, c],
        [e, f],
        [c, d, a],
        [f, g, e],
      ]),
    ).toEqual([
      [a, b, c, d, a],
      [e, f, g, e],
    ]);
  });

  it("leaves out lines that can't be closed", () => {
    expect(
      joinRings([
        [a, b],
        [b, c],
      ]),
    ).toEqual([]);
  });

  it("is not fooled by a ring too small to hold an area", () => {
    expect(isClosedRing([a, b, a])).toBe(false);
    expect(joinRings([[a, b, a]])).toEqual([]);
  });
});

describe("polygonsOf", () => {
  const outer = square(-1.27, 53.12, -1.255, 53.13);
  const hole = square(-1.264, 53.124, -1.261, 53.126);
  const elsewhere = square(-1.25, 53.12, -1.245, 53.125);

  it("puts each hole in the outer ring around it", () => {
    expect(polygonsOf([outer, elsewhere], [hole])).toEqual({
      type: "MultiPolygon",
      coordinates: [[outer, hole], [elsewhere]],
    });
  });

  it("gives no shape without an outer ring", () => {
    expect(polygonsOf([], [hole])).toBeNull();
  });
});

describe("nearestLinePoint", () => {
  it("finds the nearest point on any of the lines", () => {
    const from = { lat: 53.1225, lng: -1.2615 };

    const nearest = nearestLinePoint(
      [
        [
          [-1.27, 53.12],
          [-1.27, 53.13],
        ],
        [
          [-1.26, 53.12],
          [-1.26, 53.13],
        ],
      ],
      from,
    );

    expect(nearest?.lng).toBeCloseTo(-1.26, 6);
    expect(nearest?.lat).toBeCloseTo(53.1225, 6);
  });

  it("finds a line's end when it is nearest", () => {
    const nearest = nearestLinePoint(
      [
        [
          [-1.26, 53.12],
          [-1.25, 53.12],
        ],
      ],
      { lat: 53.13, lng: -1.24 },
    );

    expect(nearest?.lng).toBeCloseTo(-1.25, 6);
    expect(nearest?.lat).toBeCloseTo(53.12, 6);
  });

  it("finds nothing on no lines", () => {
    expect(nearestLinePoint([], { lat: 53.12, lng: -1.26 })).toBeNull();
  });
});

describe("clipLineToCircle", () => {
  const centre = { lat: 53.123664, lng: -1.264078 };
  /** A position `east` and `north` metres from the centre. */
  const at = (east: number, north: number): Position => {
    const metresPerDegree = (6_371_008.8 * Math.PI) / 180;
    const scale = Math.cos((centre.lat * Math.PI) / 180);
    return [
      centre.lng + east / (scale * metresPerDegree),
      centre.lat + north / metresPerDegree,
    ];
  };
  const fromCentre = ([lng, lat]: Position) =>
    distanceMetres(centre, { lat, lng });

  it("keeps a line wholly inside the circle as it is", () => {
    const line = [at(-100, 0), at(0, 50), at(100, 0)];

    const { parts, lengthMetres } = clipLineToCircle(line, centre, 500);

    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(3);
    expect(lengthMetres).toBeCloseTo(2 * Math.hypot(100, 50), 6);
  });

  it("cuts a line crossing the circle off at its edge", () => {
    const { parts, lengthMetres } = clipLineToCircle(
      [at(-1000, 0), at(1000, 0)],
      centre,
      500,
    );

    expect(parts).toHaveLength(1);
    const [part = []] = parts;
    expect(part).toHaveLength(2);
    for (const end of part) expect(fromCentre(end)).toBeCloseTo(500, 0);
    expect(lengthMetres).toBeCloseTo(1000, 6);
  });

  it("cuts a chord from a line that passes through without a point inside", () => {
    const { parts, lengthMetres } = clipLineToCircle(
      [at(-1000, 300), at(1000, 300)],
      centre,
      500,
    );

    expect(parts).toHaveLength(1);
    // A chord 300 m from the centre of a circle of 500 m is 800 m long.
    expect(lengthMetres).toBeCloseTo(800, 6);
  });

  it("splits a line that leaves the circle and comes back", () => {
    const { parts, lengthMetres } = clipLineToCircle(
      [at(-400, 0), at(-400, 1000), at(400, 1000), at(400, 0)],
      centre,
      500,
    );

    expect(parts).toHaveLength(2);
    // Each leg is inside from 0 to 300 m north.
    expect(lengthMetres).toBeCloseTo(600, 6);
  });

  it("gives nothing for a line outside the circle", () => {
    expect(clipLineToCircle([at(600, 0), at(600, 100)], centre, 500)).toEqual({
      parts: [],
      lengthMetres: 0,
    });
  });

  it("passes over a repeated point without breaking the line", () => {
    const { parts, lengthMetres } = clipLineToCircle(
      [at(0, 0), at(100, 0), at(100, 0), at(200, 0)],
      centre,
      500,
    );

    expect(parts).toHaveLength(1);
    expect(lengthMetres).toBeCloseTo(200, 6);
  });
});
