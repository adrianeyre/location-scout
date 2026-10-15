import {
  distanceMetres,
  type ConstraintShape,
  type Location,
  type Position,
} from "@location-scout/shared";

/*
 * Plane geometry for the shapes of Features close to one Location, such as
 * Planning Constraints' outlines and footpaths' lines. Positions are
 * `[lng, lat]`, as in GeoJSON.
 */

/** Metres in one degree of latitude, on the mean Earth radius. */
const METRES_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;

/** Whether a ring encloses a point, by counting the edges a ray from it crosses. */
const ringContains = (ring: readonly Position[], { lat, lng }: Location) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
};

/**
 * Whether a point lies inside a shape: inside one of its polygons' outer
 * rings, and not in any of that polygon's holes.
 */
export const shapeContains = (shape: ConstraintShape, point: Location) =>
  shape.coordinates.some(
    ([outer, ...holes]) =>
      outer !== undefined &&
      ringContains(outer, point) &&
      !holes.some((hole) => ringContains(hole, point)),
  );

/**
 * A flat plane around `from`, in metres east and north of it. Close to
 * `from`, degrees of longitude are scaled to the same length as degrees of
 * latitude, so distances and directions on it are true enough within a mile.
 */
const planeAround = (from: Location) => {
  const scale = Math.cos((from.lat * Math.PI) / 180);
  return {
    toPlane: ([lng, lat]: Position): Position => [
      (lng - from.lng) * scale * METRES_PER_DEGREE,
      (lat - from.lat) * METRES_PER_DEGREE,
    ],
    fromPlane: ([x, y]: Position): Location => ({
      lat: from.lat + y / METRES_PER_DEGREE,
      lng: from.lng + x / (scale * METRES_PER_DEGREE),
    }),
  };
};

/**
 * The point on any of `lines` nearest `from`, found on a flat plane around
 * it, or `null` if there are no lines.
 */
export const nearestLinePoint = (
  lines: readonly (readonly Position[])[],
  from: Location,
): Location | null => {
  const { toPlane, fromPlane } = planeAround(from);
  let nearest: Position | null = null;
  let nearestSquared = Infinity;
  for (const line of lines) {
    const points = line.map(toPlane);
    for (let i = 0; i < points.length; i++) {
      const [bx = 0, by = 0] = points[i] ?? [];
      const [ax = bx, ay = by] = points[i - 1] ?? [];
      const [dx, dy] = [bx - ax, by - ay];
      const length = dx * dx + dy * dy;
      // How far along the edge the point nearest `from` lies, from 0 to 1.
      const along =
        length === 0
          ? 0
          : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / length));
      const [x, y] = [ax + along * dx, ay + along * dy];
      const squared = x * x + y * y;
      if (squared < nearestSquared) {
        nearestSquared = squared;
        nearest = [x, y];
      }
    }
  }
  return nearest && fromPlane(nearest);
};

/** The point on a shape's outline nearest `from`. */
export const nearestOutlinePoint = (
  shape: ConstraintShape,
  from: Location,
): Location => nearestLinePoint(shape.coordinates.flat(), from) ?? from;

/**
 * Where a shape is marked on the map, and how far that is from `from`: `from`
 * itself if it is inside the shape, or else the point of its outline nearest
 * `from`.
 */
export const placeShape = (shape: ConstraintShape, from: Location) => {
  const coversLocation = shapeContains(shape, from);
  const location = coversLocation ? from : nearestOutlinePoint(shape, from);
  return {
    location,
    distanceMetres: Math.round(distanceMetres(from, location)),
    coversLocation,
  };
};

const samePosition = (a: Position | undefined, b: Position | undefined) =>
  a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1];

/** Whether a line ends where it starts, with room for an area inside. */
export const isClosedRing = (line: readonly Position[]) =>
  line.length >= 4 && samePosition(line[0], line.at(-1));

/**
 * Joins lines that meet end to end into closed rings, as OpenStreetMap maps
 * the outline of a large area: several ways, each running either way round.
 * A line that can't be closed is left out.
 */
export const joinRings = (lines: readonly (readonly Position[])[]) => {
  const open = lines
    .filter((line) => line.length >= 2)
    .map((line) => [...line]);
  const rings: Position[][] = [];
  for (let ring = open.shift(); ring; ring = open.shift()) {
    while (!isClosedRing(ring)) {
      const end = ring.at(-1);
      const next = open.findIndex(
        (line) => samePosition(line[0], end) || samePosition(line.at(-1), end),
      );
      const [line] = next === -1 ? [] : open.splice(next, 1);
      if (!line) break;
      const onward = samePosition(line[0], end) ? line : line.reverse();
      ring.push(...onward.slice(1));
    }
    if (isClosedRing(ring)) rings.push(ring);
  }
  return rings;
};

/**
 * A shape from the outer rings of an area and the rings of its holes: each
 * outer ring is a polygon, with every hole that lies inside it. `null` if
 * there is no outer ring.
 */
export const polygonsOf = (
  outers: readonly Position[][],
  holes: readonly Position[][],
): ConstraintShape | null =>
  outers.length === 0
    ? null
    : {
        type: "MultiPolygon",
        coordinates: outers.map((outer) => [
          outer,
          ...holes.filter(([first]) => {
            const [lng = NaN, lat = NaN] = first ?? [];
            return ringContains(outer, { lat, lng });
          }),
        ]),
      };

/** Seven decimal places of a degree is about a centimetre, as OpenStreetMap keeps them. */
const roundDegrees = (degrees: number) => Math.round(degrees * 1e7) / 1e7;

/**
 * The parts of a line inside the circle of `radiusMetres` around `centre`,
 * each cut off where it crosses the circle, with their length in metres. A
 * line that leaves the circle and comes back in gives two parts.
 */
export const clipLineToCircle = (
  line: readonly Position[],
  centre: Location,
  radiusMetres: number,
): { parts: Position[][]; lengthMetres: number } => {
  const { toPlane, fromPlane } = planeAround(centre);
  const toPosition = (point: Position): Position => {
    const { lat, lng } = fromPlane(point);
    return [roundDegrees(lng), roundDegrees(lat)];
  };
  const points = line.map(toPlane);
  const parts: Position[][] = [];
  let lengthMetres = 0;
  // Whether the last edge ended inside the circle, so the next one carries on
  // its part.
  let carryOn = false;
  for (let i = 1; i < points.length; i++) {
    const [ax = 0, ay = 0] = points[i - 1] ?? [];
    const [bx = 0, by = 0] = points[i] ?? [];
    const [dx, dy] = [bx - ax, by - ay];
    // The edge is inside the circle from `start` to `end` along it, where
    // |a + t(b - a)| = r, both from 0 to 1.
    const a = dx * dx + dy * dy;
    const b = 2 * (ax * dx + ay * dy);
    const c = ax * ax + ay * ay - radiusMetres * radiusMetres;
    const discriminant = b * b - 4 * a * c;
    if (a === 0 || discriminant < 0) {
      // A repeated point leaves any part as it was; a miss ends it.
      if (a !== 0) carryOn = false;
      continue;
    }
    const root = Math.sqrt(discriminant);
    const start = Math.max(0, (-b - root) / (2 * a));
    const end = Math.min(1, (-b + root) / (2 * a));
    if (start >= end) {
      carryOn = false;
      continue;
    }
    const from: Position = [ax + start * dx, ay + start * dy];
    const to: Position = [ax + end * dx, ay + end * dy];
    lengthMetres += (end - start) * Math.sqrt(a);
    const part = parts.at(-1);
    if (carryOn && start === 0 && part) {
      part.push(toPosition(to));
    } else {
      parts.push([toPosition(from), toPosition(to)]);
    }
    carryOn = end === 1;
  }
  return { parts, lengthMetres };
};
