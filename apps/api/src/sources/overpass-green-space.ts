import {
  GREEN_SPACE_TYPES,
  distanceMetres,
  type ConstraintShape,
  type GreenSpaceFeature,
  type GreenSpaceStatistics,
  type GreenSpaceType,
  type Location,
  type NearestPark,
  type Position,
  type SearchArea,
} from "@location-scout/shared";

import { isClosedRing, joinRings, placeShape, polygonsOf } from "../shapes";
import type { OsmElement, OsmSelection } from "./overpass";
import { ruleFilters } from "./overpass-filters";

/**
 * How far from the Location the nearest park is looked for: as far as the
 * Green space Category Score gives points for one (PRD §6.4: "scaling to 0 at
 * 2 km"). That is further than the widest Search Radius, a mile, so it finds
 * every park in the Search Area too.
 */
export const PARK_SEARCH_METRES = 2000;

/**
 * Which OpenStreetMap tags make a green space of each type (PRD FR-2.5). Each
 * green space has one type: the first rule its tags match, so a wood that is
 * also a nature reserve is a nature reserve.
 */
export const GREEN_SPACE_RULES: readonly {
  type: GreenSpaceType;
  key: string;
  values: readonly string[];
}[] = [
  { type: "park", key: "leisure", values: ["park"] },
  { type: "playground", key: "leisure", values: ["playground"] },
  { type: "nature-reserve", key: "leisure", values: ["nature_reserve"] },
  { type: "wood", key: "natural", values: ["wood"] },
  { type: "wood", key: "landuse", values: ["forest"] },
];

/** Tag values that say the public may not use a green space. */
const NOT_PUBLIC: ReadonlySet<string> = new Set(["private", "no"]);

/**
 * What the Green space Layer asks of the one Overpass query for a Search Area
 * (PRD NFR-1.5): the outlines of playgrounds, nature reserves and woods in the
 * Search Area, and of parks within 2 km, so the nearest is found even outside
 * it.
 */
export const GREEN_SPACE_SELECTION: OsmSelection = {
  layer: "green-space",
  filters: [],
  areaFilters: ruleFilters(
    GREEN_SPACE_RULES.filter(({ type }) => type !== "park"),
  ),
  wider: {
    metres: PARK_SEARCH_METRES,
    areaFilters: ruleFilters(
      GREEN_SPACE_RULES.filter(({ type }) => type === "park"),
    ),
  },
};

/** The type of green space an element is, and the tag that says so, or `null`. */
export const classifyGreenSpace = (
  tags: Readonly<Record<string, string>>,
): { type: GreenSpaceType; osmTag: string } | null => {
  const access = tags.access?.trim();
  if (access !== undefined && NOT_PUBLIC.has(access)) return null;
  for (const { type, key, values } of GREEN_SPACE_RULES) {
    const value = tags[key]?.trim();
    if (value !== undefined && values.includes(value)) {
      return { type, osmTag: `${key}=${value}` };
    }
  }
  return null;
};

const toPosition = ({ lat, lng }: Location): Position => [lng, lat];

/**
 * The outline of an element mapped as an area: a closed way's ring, or a
 * multipolygon relation's outer rings with their holes (`inner`), each joined
 * from the member ways it is drawn with. `null` for a node, or a way or
 * relation whose lines don't close.
 */
export const outlineOf = ({
  line,
  members,
}: OsmElement): ConstraintShape | null => {
  if (members) {
    const rings = (inner: boolean) =>
      joinRings(
        members
          .filter(({ role }) => (role === "inner") === inner)
          .map((member) => member.line.map(toPosition)),
      );
    return polygonsOf(rings(false), rings(true));
  }
  const ring = line?.map(toPosition);
  return ring && isClosedRing(ring) ? polygonsOf([ring], []) : null;
};

const byTypeThenDistance = (a: GreenSpaceFeature, b: GreenSpaceFeature) =>
  GREEN_SPACE_TYPES.indexOf(a.type) - GREEN_SPACE_TYPES.indexOf(b.type) ||
  a.distanceMetres - b.distanceMetres ||
  (a.name ?? "").localeCompare(b.name ?? "") ||
  a.id.localeCompare(b.id);

/**
 * The Green space Layer among the elements Overpass found (PRD FR-2.5): each
 * park, playground, nature reserve and wood in the Search Area with its
 * outline, marked where it comes nearest the Location, or at the Location if
 * the Location is inside it. One OpenStreetMap maps only as a point is marked
 * there. Its statistics count each type and give the nearest park within 2 km.
 */
export const mapGreenSpace = (
  elements: readonly OsmElement[],
  { location: from, searchRadius }: SearchArea,
): { features: GreenSpaceFeature[]; statistics: GreenSpaceStatistics } => {
  const found = new Map<string, GreenSpaceFeature>();
  for (const element of elements) {
    const greenSpace = classifyGreenSpace(element.tags);
    if (!greenSpace) continue;
    const shape = outlineOf(element);
    // An element found twice, once with its outline, keeps its outline.
    const known = found.get(element.id);
    if (known && (known.shape || !shape)) continue;
    const placed = shape
      ? placeShape(shape, from)
      : {
          location: element.location,
          distanceMetres: Math.round(distanceMetres(from, element.location)),
          coversLocation: false,
        };
    found.set(element.id, {
      id: element.id,
      location: placed.location,
      distanceMetres: placed.distanceMetres,
      type: greenSpace.type,
      name: element.tags.name?.trim() || null,
      osmTag: greenSpace.osmTag,
      coversLocation: placed.coversLocation,
      shape,
    });
  }

  // Parks are looked for further out than the Search Area, so only those
  // that reach into it are Features. Overpass finds the rest only in the
  // Search Area, and they are measured again here all the same.
  const all = [...found.values()].sort(byTypeThenDistance);
  const inArea = all.filter(
    ({ distanceMetres }) => distanceMetres <= searchRadius.metres,
  );

  const park = all.find(
    ({ type, distanceMetres }) =>
      type === "park" && distanceMetres <= PARK_SEARCH_METRES,
  );
  const nearestPark: NearestPark | null = park
    ? {
        id: park.id,
        name: park.name,
        distanceMetres: park.distanceMetres,
        inSearchArea: inArea.includes(park),
        coversLocation: park.coversLocation,
      }
    : null;

  return {
    features: inArea,
    statistics: {
      total: inArea.length,
      byType: GREEN_SPACE_TYPES.map((type) => ({
        type,
        count: inArea.filter((feature) => feature.type === type).length,
      })),
      nearestPark,
      parkSearchMetres: PARK_SEARCH_METRES,
    },
  };
};
