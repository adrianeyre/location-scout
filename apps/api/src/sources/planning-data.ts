import {
  PLANNING_CONSTRAINT_TYPES,
  distanceMetres,
  isLocation,
  searchAreaRing,
  type ConstraintShape,
  type Location,
  type PlanningConstraintFeature,
  type PlanningConstraintType,
  type PlanningStatistics,
  type Position,
  type SearchArea,
} from "@location-scout/shared";

import { placeShape } from "../shapes";
import {
  DAY_MS,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";

/**
 * planning.data.gov.uk: Planning Constraints (PRD §6.17). Free, no key. Only
 * its entity data is used: its planning-application dataset is not ready for
 * use, so Planning Applications come from elsewhere (ADR 0003).
 */
export const planningData: DataSource = {
  id: "planning-data",
  name: "planning.data.gov.uk",
  // Planning constraints are cached for 24 hours (PRD NFR-1.4).
  cacheTtlMs: DAY_MS,
};

/** Searches entities by dataset, place and shape. */
export const ENTITY_URL = "https://www.planning.data.gov.uk/entity.json";

/** The most entities planning.data.gov.uk gives in one page. */
export const PAGE_SIZE = 500;

/** planning.data.gov.uk's dataset for each type of Planning Constraint. */
export const CONSTRAINT_DATASETS: Readonly<
  Record<string, PlanningConstraintType>
> = {
  "conservation-area": "conservation-area",
  "listed-building": "listed-building",
  "article-4-direction-area": "article-4-direction",
  "tree-preservation-zone": "tree-preservation-zone",
  "flood-risk-zone": "flood-zone",
};

/**
 * Listed buildings are given only as points. Where a council has published
 * their outlines, this dataset says whether the Location is inside one.
 */
const OUTLINE_DATASET = "listed-building-outline";

/** Only the fields the Planning Layer uses, to keep pages small. */
const FIELDS = [
  "entity",
  "dataset",
  "name",
  "reference",
  "geometry",
  "point",
  "end-date",
  "listed-building-grade",
  "flood-risk-level",
];

/**
 * The corners of the polygon sent for a Search Area, as for data.police.uk.
 * A Planning Constraint that only grazes the circle between two corners may
 * be left out; one that does not reach the circle never is.
 */
const POLYGON_CORNERS = 32;

/** What a constraint with no name is called. */
const UNNAMED: Readonly<Record<PlanningConstraintType, string>> = {
  "conservation-area": "Unnamed conservation area",
  "listed-building": "Unnamed listed building",
  "article-4-direction": "Unnamed Article 4 direction",
  "tree-preservation-zone": "Unnamed tree preservation zone",
  "flood-zone": "Flood zone",
};

export class PlanningDataError extends Error {
  override name = "PlanningDataError";
}

/** The Search Area as WKT, the form planning.data.gov.uk's `geometry` takes. */
export const searchAreaWkt = ({ location, searchRadius }: SearchArea) => {
  const corners = searchAreaRing(
    location,
    searchRadius.metres,
    POLYGON_CORNERS,
  ).map(([lng, lat]) => `${lng.toFixed(6)} ${lat.toFixed(6)}`);
  return `POLYGON((${corners.join(",")}))`;
};

const withFields = (params: [string, string][], fields: readonly string[]) => [
  ...params,
  ...fields.map((field): [string, string] => ["field", field]),
];

/** One page of the Planning Constraints that intersect the Search Area. */
export const constraintsUrl = (area: SearchArea, offset = 0) =>
  `${ENTITY_URL}?${new URLSearchParams(
    withFields(
      [
        ...Object.keys(CONSTRAINT_DATASETS).map((dataset): [string, string] => [
          "dataset",
          dataset,
        ]),
        ["geometry", searchAreaWkt(area)],
        ["geometry_relation", "intersects"],
        ["limit", String(PAGE_SIZE)],
        ["offset", String(offset)],
      ],
      FIELDS,
    ),
  ).toString()}`;

/** The listed building outlines that the Location is inside. */
export const outlinesAtUrl = ({ lat, lng }: Location) =>
  `${ENTITY_URL}?${new URLSearchParams(
    withFields(
      [
        ["dataset", OUTLINE_DATASET],
        ["longitude", lng.toFixed(6)],
        ["latitude", lat.toFixed(6)],
        ["limit", String(PAGE_SIZE)],
      ],
      ["entity", "listed-building", "end-date"],
    ),
  ).toString()}`;

/** One entity, with the fields the Planning Layer uses, as planning.data.gov.uk gives them. */
export type Entity = Record<string, unknown>;

/** One page of entities, and how many there are in every page together. */
export interface EntityPage {
  count: number;
  entities: Entity[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Maps a raw `GET /entity.json` response to its page of entities. */
export const mapEntityPage = (status: number, body: unknown): EntityPage => {
  if (
    status !== 200 ||
    !isRecord(body) ||
    !Array.isArray(body.entities) ||
    typeof body.count !== "number"
  ) {
    throw new PlanningDataError(
      `planning.data.gov.uk answered ${String(status)} without a page of entities`,
    );
  }
  return { count: body.count, entities: body.entities.filter(isRecord) };
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** Whether an entity has ended by `today`, an ISO 8601 date: it no longer applies. */
const hasEnded = (entity: Entity, today: string) => {
  const ended = text(entity["end-date"]);
  return ended !== "" && ended <= today;
};

/**
 * Reads WKT's nested lists of coordinates, such as `((1 2, 3 4))`, into
 * nested arrays, each list of coordinates becoming a list of positions.
 */
const readLists = (wkt: string): unknown => {
  const tokens = wkt.match(/\(|\)|,|[^\s(),]+(?:\s+[^\s(),]+)*/g) ?? [];
  let next = 0;
  const read = (): unknown => {
    if (tokens[next] !== "(") {
      const [lng, lat] = (tokens[next++] ?? "").trim().split(/\s+/).map(Number);
      return [lng, lat];
    }
    next++;
    const items: unknown[] = [read()];
    while (tokens[next] === ",") {
      next++;
      items.push(read());
    }
    if (tokens[next++] !== ")") throw new PlanningDataError(`Bad WKT: ${wkt}`);
    return items;
  };
  return read();
};

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n));

/** A ring of positions, closed if it was not, or `null` if it is not a ring. */
const toRing = (value: unknown): Position[] | null => {
  if (!Array.isArray(value) || !value.every(isPosition)) return null;
  const [first] = value;
  const last = value.at(-1);
  const ring =
    first && last && (first[0] !== last[0] || first[1] !== last[1])
      ? [...value, first]
      : value;
  return ring.length >= 4 ? ring : null;
};

const toPolygon = (value: unknown): Position[][] | null => {
  if (!Array.isArray(value)) return null;
  const rings = value.map(toRing);
  return rings.length > 0 && rings.every((ring) => ring !== null)
    ? rings
    : null;
};

/**
 * Reads a WKT `POLYGON` or `MULTIPOLYGON` into a shape, or `null` if it is
 * anything else, such as a `POINT`, or empty, or can't be read.
 */
export const parseShape = (wkt: string): ConstraintShape | null => {
  const match = /^\s*(MULTIPOLYGON|POLYGON)\s*(\(.*\))\s*$/is.exec(wkt);
  if (!match) return null;
  const [, kind = "", lists = ""] = match;
  let read: unknown;
  try {
    read = readLists(lists);
  } catch {
    return null;
  }
  const polygons =
    kind.toUpperCase() === "POLYGON"
      ? [toPolygon(read)]
      : Array.isArray(read)
        ? read.map(toPolygon)
        : [null];
  return polygons.every((polygon) => polygon !== null)
    ? { type: "MultiPolygon", coordinates: polygons }
    : null;
};

/** Reads a WKT `POINT`, such as `POINT (-1.268 53.124)`, or `null`. */
export const parsePoint = (wkt: string): Location | null => {
  const match = /^\s*POINT\s*\(\s*(\S+)\s+(\S+)\s*\)\s*$/i.exec(wkt);
  if (!match) return null;
  const location = { lat: Number(match[2]), lng: Number(match[1]) };
  return isLocation(location) ? location : null;
};

const byTypeThenDistance = (
  a: PlanningConstraintFeature,
  b: PlanningConstraintFeature,
) =>
  PLANNING_CONSTRAINT_TYPES.indexOf(a.type) -
    PLANNING_CONSTRAINT_TYPES.indexOf(b.type) ||
  a.distanceMetres - b.distanceMetres ||
  a.name.localeCompare(b.name);

/** One Planning Constraint from an entity, or `null` if it can't be placed. */
const toConstraint = (
  entity: Entity,
  type: PlanningConstraintType,
  from: Location,
  outlinesAtLocation: ReadonlySet<string>,
): PlanningConstraintFeature | null => {
  const shape = parseShape(text(entity.geometry));
  const point = parsePoint(text(entity.point));
  const name = text(entity.name) || UNNAMED[type];
  const id = String(entity.entity);
  const grade =
    type === "listed-building"
      ? text(entity["listed-building-grade"]) || null
      : null;
  if (shape) {
    return { id, type, name, grade, shape, ...placeShape(shape, from) };
  }
  if (!point) return null;
  return {
    id,
    type,
    name,
    grade,
    shape: null,
    location: point,
    distanceMetres: Math.round(distanceMetres(from, point)),
    coversLocation:
      type === "listed-building" &&
      outlinesAtLocation.has(text(entity.reference)),
  };
};

/** The id of the one Feature that joins all of a flood zone's areas, such as `flood-zone-3`. */
export const floodZoneId = (zone: string) => `flood-zone-${zone}`;

/**
 * Flood zones are mapped as many small areas, so their count would say
 * little. Each zone's areas are joined into one Feature: "Flood zone 2" and
 * "Flood zone 3".
 */
const toFloodZones = (
  entities: readonly Entity[],
  from: Location,
): PlanningConstraintFeature[] => {
  const zones = new Map<string, Position[][][]>();
  for (const entity of entities) {
    const zone = text(entity["flood-risk-level"]);
    const shape = parseShape(text(entity.geometry));
    if (zone === "" || !shape) continue;
    zones.set(zone, [...(zones.get(zone) ?? []), ...shape.coordinates]);
  }
  return [...zones].map(([zone, coordinates]) => {
    const shape: ConstraintShape = { type: "MultiPolygon", coordinates };
    return {
      id: floodZoneId(zone),
      type: "flood-zone",
      name: `Flood zone ${zone}`,
      grade: null,
      shape,
      ...placeShape(shape, from),
    };
  });
};

/** The Planning Layer's Features and statistics. */
export interface PlanningConstraints {
  features: PlanningConstraintFeature[];
  statistics: PlanningStatistics;
}

/** Counts the Planning Constraints of every type, and names those covering the Location. */
export const constraintStatistics = (
  features: readonly PlanningConstraintFeature[],
): PlanningStatistics => ({
  byType: PLANNING_CONSTRAINT_TYPES.map((type) => {
    const ofType = features.filter((feature) => feature.type === type);
    return {
      type,
      count: ofType.length,
      coversLocation: ofType.some(({ coversLocation }) => coversLocation),
    };
  }),
  coveringLocation: features
    .filter(({ coversLocation }) => coversLocation)
    .map(({ type, name }) => ({ type, name })),
});

/**
 * Maps the entities that intersect the Search Area to Planning Constraints,
 * each placed and measured from the Location (PRD FR-2.2), and counts them.
 * Entities that have ended by `today` no longer apply and are left out.
 * `outlinesAtLocation` holds the list entries of listed buildings whose
 * outlines the Location is inside.
 */
export const mapConstraints = (
  entities: readonly Entity[],
  from: Location,
  outlinesAtLocation: ReadonlySet<string>,
  today: string,
): PlanningConstraints => {
  const current = entities.filter((entity) => !hasEnded(entity, today));
  const typed = current.flatMap((entity) => {
    const type = CONSTRAINT_DATASETS[text(entity.dataset)];
    return type === undefined ? [] : [{ entity, type }];
  });
  const features = [
    ...typed
      .filter(({ type }) => type !== "flood-zone")
      .map(({ entity, type }) =>
        toConstraint(entity, type, from, outlinesAtLocation),
      )
      .filter((feature) => feature !== null),
    ...toFloodZones(
      typed
        .filter(({ type }) => type === "flood-zone")
        .map(({ entity }) => entity),
      from,
    ),
  ].sort(byTypeThenDistance);
  return { features, statistics: constraintStatistics(features) };
};

/**
 * Asks planning.data.gov.uk for one page of entities, dated `today`, the
 * day it was obtained, which stays with it while it is cached: Historic
 * England's statement for its conservation areas and listed buildings
 * names that day (PRD FR-10.1).
 */
const entityPage = (url: string, callSource: CallSource, today: string) =>
  callSource(planningData, url, async ({ fetch, signal }) => {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return {
      data: mapEntityPage(response.status, body),
      period: { from: today, to: today },
    };
  });

/**
 * Fetches the Planning Constraints that intersect the Search Area from
 * planning.data.gov.uk (PRD FR-2.2), with whether the Location sits inside
 * each. The first page says how many there are; any further pages are asked
 * for together. Alongside it, one call finds the listed building outlines at
 * the Location. Each call is cached for 24 hours. If any fails, so does
 * this: a count with a page missing would be wrong.
 */
export const planningConstraints = async (
  area: SearchArea,
  callSource: CallSource,
  today: string,
): Promise<SourceResult<PlanningConstraints>> => {
  const [first, outlines] = await Promise.all([
    entityPage(constraintsUrl(area), callSource, today),
    entityPage(outlinesAtUrl(area.location), callSource, today),
  ]);
  if (first.status !== "ok") return first;
  if (outlines.status !== "ok") return outlines;

  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < first.data.count; offset += PAGE_SIZE) {
    offsets.push(offset);
  }
  const rest = await Promise.all(
    offsets.map((offset) =>
      entityPage(constraintsUrl(area, offset), callSource, today),
    ),
  );
  const entities = [...first.data.entities];
  for (const page of rest) {
    if (page.status !== "ok") return page;
    entities.push(...page.data.entities);
  }

  const outlinesAtLocation = new Set(
    outlines.data.entities
      .filter((outline) => !hasEnded(outline, today))
      .map((outline) => text(outline["listed-building"]))
      .filter((listEntry) => listEntry !== ""),
  );
  return {
    status: "ok",
    data: mapConstraints(entities, area.location, outlinesAtLocation, today),
    // The day its first page was obtained, even if from the cache.
    period: first.period,
  };
};
