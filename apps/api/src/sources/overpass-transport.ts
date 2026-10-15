import {
  TRANSPORT_FACILITY_TYPES,
  TRANSPORT_ROUTE_TYPES,
  TRANSPORT_TYPES,
  distanceMetres,
  type Location,
  type NearestStation,
  type Position,
  type SearchArea,
  type TransportFeature,
  type TransportFacilityFeature,
  type TransportFacilityType,
  type TransportRouteFeature,
  type TransportRouteType,
  type TransportStatistics,
} from "@location-scout/shared";

import { clipLineToCircle, nearestLinePoint } from "../shapes";
import type { OsmElement, OsmSelection } from "./overpass";
import { ruleFilters, tagFilter } from "./overpass-filters";

/**
 * How far from the Location the nearest railway station is looked for: as far
 * as the Transport Category Score gives points for one (PRD §6.4: "scaling to
 * 0 at 5 km"). The Search Area is at most a mile across, and most Locations
 * have no station inside it.
 */
export const STATION_SEARCH_METRES = 5000;

/**
 * Which OpenStreetMap tags make a facility of each type (PRD FR-2.4). Each
 * facility has one type: the first rule its tags match.
 */
export const TRANSPORT_FACILITY_RULES: readonly {
  type: TransportFacilityType;
  key: string;
  values: readonly string[];
}[] = [
  { type: "railway-station", key: "railway", values: ["station", "halt"] },
  { type: "bus-stop", key: "highway", values: ["bus_stop"] },
  { type: "car-park", key: "amenity", values: ["parking"] },
  { type: "ev-charger", key: "amenity", values: ["charging_station"] },
];

/** The paths that ways of each kind can be: footways, paths, bridleways, steps and cycleways. */
const PATHS = ["footway", "path", "bridleway", "steps"] as const;

/**
 * Which ways are footpaths and which are cycle routes (FR-2.4). Each way is
 * one or the other, by the first rule it matches, so a path designated for
 * bikes is a cycle route, though people walk it too.
 */
export const TRANSPORT_ROUTE_RULES: readonly {
  type: TransportRouteType;
  /** Every one of these tags, each with one of its values. */
  tags: Readonly<Record<string, readonly string[]>>;
}[] = [
  { type: "cycle-route", tags: { highway: ["cycleway"] } },
  { type: "cycle-route", tags: { highway: PATHS, bicycle: ["designated"] } },
  { type: "footpath", tags: { highway: PATHS } },
];

/** Tag values that say the public may not use a facility or way. */
const NOT_PUBLIC: ReadonlySet<string> = new Set(["private", "no"]);

/**
 * Tags that leave a facility or way out, whatever its type: private ones, an EV
 * charger only for bikes, a miniature or heritage railway's station, and a
 * pavement or crossing mapped beside or across a road, which would count
 * every street twice.
 */
const LEFT_OUT: Readonly<Record<string, ReadonlySet<string>>> = {
  access: NOT_PUBLIC,
  motorcar: new Set(["no"]),
  station: new Set(["miniature"]),
  usage: new Set(["tourism"]),
  footway: new Set(["sidewalk", "crossing"]),
};

const isLeftOut = (tags: Readonly<Record<string, string>>) =>
  Object.entries(LEFT_OUT).some(([key, values]) => {
    const value = tags[key]?.trim();
    return value !== undefined && values.has(value);
  });

/** The Overpass QL filters for the facilities of the rules for `types`. */
const facilityFilters = (types: readonly TransportFacilityType[]) =>
  ruleFilters(
    TRANSPORT_FACILITY_RULES.filter(({ type }) => types.includes(type)),
  );

/**
 * What the Transport Layer asks of the one Overpass query for a Search Area
 * (PRD NFR-1.5): bus stops, car parks and EV chargers in the Search Area,
 * railway stations within 5 km, so the nearest is found even outside it, and
 * the lines of every path and cycleway in it.
 */
export const TRANSPORT_SELECTION: OsmSelection = {
  layer: "transport",
  filters: facilityFilters(["bus-stop", "car-park", "ev-charger"]),
  lineFilters: [tagFilter("highway", ["cycleway", ...PATHS])],
  wider: {
    metres: STATION_SEARCH_METRES,
    filters: facilityFilters(["railway-station"]),
  },
};

/** The type of facility an element is, and the tag that says so, or `null`. */
export const classifyTransportFacility = (
  tags: Readonly<Record<string, string>>,
): { type: TransportFacilityType; osmTag: string } | null => {
  if (isLeftOut(tags)) return null;
  for (const { type, key, values } of TRANSPORT_FACILITY_RULES) {
    const value = tags[key]?.trim();
    if (value !== undefined && values.includes(value)) {
      return { type, osmTag: `${key}=${value}` };
    }
  }
  return null;
};

/** Whether a way is a footpath or a cycle route, or `null` if it is neither. */
export const classifyTransportRoute = (
  tags: Readonly<Record<string, string>>,
): TransportRouteType | null => {
  if (isLeftOut(tags)) return null;
  const rule = TRANSPORT_ROUTE_RULES.find((candidate) =>
    Object.entries(candidate.tags).every(([key, values]) => {
      const value = tags[key]?.trim();
      return value !== undefined && values.includes(value);
    }),
  );
  return rule?.type ?? null;
};

const byTypeThenDistance = (a: TransportFeature, b: TransportFeature) =>
  TRANSPORT_TYPES.indexOf(a.type) - TRANSPORT_TYPES.indexOf(b.type) ||
  a.distanceMetres - b.distanceMetres ||
  (a.name ?? "").localeCompare(b.name ?? "") ||
  a.id.localeCompare(b.id);

const toPosition = ({ lat, lng }: Location): Position => [lng, lat];

/**
 * The Transport Layer among the elements Overpass found (PRD FR-2.4): each
 * facility in the Search Area, measured from the Location, and all the
 * footpaths, and all the cycle routes, each joined into one Feature cut off
 * at the Search Area's edge, at its point nearest the Location. Its
 * statistics count each type of facility, measure each type of route, and
 * give the nearest railway station within 5 km.
 */
export const mapTransport = (
  elements: readonly OsmElement[],
  { location: from, searchRadius }: SearchArea,
): { features: TransportFeature[]; statistics: TransportStatistics } => {
  const seen = new Set<string>();
  const facilities: TransportFacilityFeature[] = [];
  const lines = new Map<TransportRouteType, Position[][]>();
  const lengths = new Map<TransportRouteType, number>();

  for (const { id, location, tags, line } of elements) {
    if (seen.has(id)) continue;
    const route = line && classifyTransportRoute(tags);
    if (line && route) {
      seen.add(id);
      const clipped = clipLineToCircle(
        line.map(toPosition),
        from,
        searchRadius.metres,
      );
      const parts = lines.get(route) ?? [];
      parts.push(...clipped.parts);
      lines.set(route, parts);
      lengths.set(route, (lengths.get(route) ?? 0) + clipped.lengthMetres);
      continue;
    }
    const facility = classifyTransportFacility(tags);
    if (!facility) continue;
    seen.add(id);
    facilities.push({
      id,
      location,
      distanceMetres: Math.round(distanceMetres(from, location)),
      name: tags.name?.trim() || null,
      ...facility,
      shape: null,
      lengthMetres: null,
    });
  }

  // Railway stations are looked for further out than the Search Area, so
  // only those whose point is inside it are Features. Other facilities are
  // found only in the Search Area, and kept as amenities are.
  const inArea = facilities.filter(
    ({ type, location }) =>
      type !== "railway-station" ||
      distanceMetres(from, location) <= searchRadius.metres,
  );
  const routes = TRANSPORT_ROUTE_TYPES.flatMap(
    (type): TransportRouteFeature[] => {
      const parts = lines.get(type) ?? [];
      const nearest = nearestLinePoint(parts, from);
      if (!nearest) return [];
      return [
        {
          id: type,
          location: nearest,
          distanceMetres: Math.round(distanceMetres(from, nearest)),
          type,
          name: null,
          osmTag: null,
          shape: { type: "MultiLineString", coordinates: parts },
          lengthMetres: Math.round(lengths.get(type) ?? 0),
        },
      ];
    },
  );

  const station = facilities
    .filter(({ type }) => type === "railway-station")
    .sort(byTypeThenDistance)[0];
  const nearestStation: NearestStation | null = station
    ? {
        id: station.id,
        name: station.name,
        distanceMetres: station.distanceMetres,
        inSearchArea: inArea.includes(station),
      }
    : null;

  return {
    features: [...inArea, ...routes].sort(byTypeThenDistance),
    statistics: {
      facilities: TRANSPORT_FACILITY_TYPES.map((type) => ({
        type,
        count: inArea.filter((facility) => facility.type === type).length,
      })),
      routes: TRANSPORT_ROUTE_TYPES.map((type) => ({
        type,
        lengthMetres: Math.round(lengths.get(type) ?? 0),
      })),
      nearestStation,
      stationSearchMetres: STATION_SEARCH_METRES,
    },
  };
};
