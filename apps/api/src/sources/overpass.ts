import type { LayerId, Location, SearchArea } from "@location-scout/shared";

import { AMENITY_FILTERS } from "./overpass-amenities";
import { GREEN_SPACE_SELECTION } from "./overpass-green-space";
import { TRANSPORT_SELECTION } from "./overpass-transport";
import {
  DAY_MS,
  SOURCE_TIMEOUT_MS,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import { createRateLimiter, type RateLimiter } from "./rate-limiter";

/**
 * The Overpass API: amenities, transport and green space from OpenStreetMap
 * (PRD §6.17). Free, no key, for fair use. Every Layer from OpenStreetMap is
 * asked for in one query per Search Area (NFR-1.5).
 */
export const overpass: DataSource = {
  id: "overpass",
  name: "Overpass API",
  // Overpass answers are cached for 24 hours (PRD NFR-1.4).
  cacheTtlMs: DAY_MS,
};

/** The public instance's query endpoint. Queries are sent as a POST form. */
export const INTERPRETER_URL = "https://overpass-api.de/api/interpreter";

/**
 * Queries to Overpass go at least a second apart. The public instance gives
 * each IP address only a couple of query slots at once, and it is for light use.
 */
export const OVERPASS_INTERVAL_MS = 1000;

/**
 * The one limiter for every Overpass query this process makes, however many
 * apps it creates, so the limit holds across the whole process.
 */
export const OVERPASS_LIMITER = createRateLimiter(OVERPASS_INTERVAL_MS);

export interface OverpassOptions {
  /** Spaces out the queries. Each one waits its turn inside its timeout. */
  limiter: RateLimiter;
  /**
   * Identifies us, with a way to contact us. The public instance refuses a
   * query that doesn't say who sends it, such as one with Node's own
   * User-Agent, with 406 Not Acceptable.
   */
  userAgent: string;
}

/**
 * What one Layer asks OpenStreetMap for, as Overpass QL tag filters such as
 * `["railway"="station"]`.
 */
export interface OsmSelection {
  layer: LayerId;
  /** Matched against nodes, ways and relations in the Search Area, each placed at a point. */
  filters: readonly string[];
  /**
   * Matched against ways in the Search Area that are drawn as lines, such as
   * footpaths. Each comes with its line as well as its point.
   */
  lineFilters?: readonly string[];
  /**
   * Matched against nodes, ways and relations in the Search Area that are
   * mapped as areas, such as parks. Ways come with their line and relations
   * with their members' lines, so their outlines can be drawn.
   */
  areaFilters?: readonly string[];
  /**
   * Filters matched within `metres` of the Location rather than the Search
   * Radius, for a Layer that measures how far the nearest of something is
   * even when it is outside the Search Area.
   */
  wider?: {
    metres: number;
    filters?: readonly string[];
    areaFilters?: readonly string[];
  };
}

/**
 * What every Layer from OpenStreetMap asks for. Each Layer adds its own here,
 * so they all share the one query for a Search Area, and with it one cached
 * answer. Each Layer then picks out the elements it recognises.
 */
export const OSM_SELECTIONS: readonly OsmSelection[] = [
  { layer: "amenities", filters: AMENITY_FILTERS },
  TRANSPORT_SELECTION,
  GREEN_SPACE_SELECTION,
];

/** One OpenStreetMap node, way or relation, placed at a point. */
export interface OsmElement {
  /** For example `node/1234`. */
  id: string;
  /** A node's own point, or the middle of a way or relation. */
  location: Location;
  tags: Readonly<Record<string, string>>;
  /** A way found by a Layer's `lineFilters` or `areaFilters`: its points in order. */
  line?: Location[];
  /**
   * A relation found by a Layer's `areaFilters`: the lines of its member
   * ways, each with its role, such as `outer` or `inner` for a multipolygon.
   */
  members?: OsmMember[];
}

/** One way in a relation, with its role and its points in order. */
export interface OsmMember {
  role: string;
  line: Location[];
}

/** Everything one query found, and the date of OpenStreetMap it was found in. */
export interface OsmElements {
  elements: OsmElement[];
  /** When Overpass's copy of OpenStreetMap was taken, as an ISO 8601 date. */
  dataDate: string | null;
}

export class OverpassError extends Error {
  override name = "OverpassError";
}

/**
 * The memory a query asks Overpass for: 128 MiB, a quarter of its default.
 * The public instance admits a query only once it can give it the memory it
 * asks for, so under load one asking for less is run sooner, where one asking
 * for the default may wait until it is refused, 504 Gateway Timeout. On 9
 * October 2026 NG17 1AA's 0.5 mile Search Area asked for the default was
 * refused, or answered in 7 to 16 seconds, and asking for 64 to 256 MiB with
 * `bbox` answered in 4 to 5 seconds; central London's 1 mile Search Area
 * needed more than 32 MiB.
 */
export const OVERPASS_MAXSIZE_BYTES = 128 * 1024 * 1024;

/** Metres in a degree of latitude, near enough for a box to search. */
const METRES_PER_DEGREE = 111_320;

/** How much further the box reaches than the widest `around:`, for the Earth's shape. */
const BBOX_MARGIN_METRES = 100;

/**
 * Overpass QL's global `bbox` setting: a box reaching `metres` and a little
 * more from the Location, south, west, north and east. Every statement then
 * looks only inside it, which spares Overpass a search of the whole planet's
 * tags before `around:` narrows it down.
 */
const bbox = ({ lat, lng }: Location, metres: number) => {
  const latitude = (metres + BBOX_MARGIN_METRES) / METRES_PER_DEGREE;
  const longitude = latitude / Math.cos((lat * Math.PI) / 180);
  return [lat - latitude, lng - longitude, lat + latitude, lng + longitude]
    .map((degrees) => degrees.toFixed(6))
    .join(",");
};

/** Overpass QL's `around:` filter: within `metres` of the Location. */
const around = (location: Location, metres: number) =>
  `(around:${metres.toFixed(1)},${location.lat.toFixed(6)},${location.lng.toFixed(6)})`;

/**
 * One output statement for a set of statements, or nothing if there are none.
 * `print` says what Overpass gives for each element, such as `tags center`.
 */
const output = (statements: readonly string[], print: string) =>
  statements.length === 0 ? "" : `(${statements.join("")});out ${print};`;

/**
 * The Overpass QL query for a Search Area: every Layer's filters, each within
 * the Search Radius of the Location (`around:`), or further for a Layer that
 * asks. Elements at a point are output with their tags and point (`center`).
 * Ways drawn as lines or areas are asked for in the same query and output with
 * their lines (`geom`), and relations mapped as areas with their members'
 * lines, which needs their members (`body`). Overpass gives up when we do,
 * after 8 seconds. It asks for `OVERPASS_MAXSIZE_BYTES` of memory, and looks
 * only in a box around the widest `around:` (PRD NFR-2.1).
 */
export const overpassQuery = (
  { location, searchRadius }: SearchArea,
  selections: readonly OsmSelection[] = OSM_SELECTIONS,
) => {
  const inArea = around(location, searchRadius.metres);
  // Each Layer's filters within the Search Area, and its wider ones further out.
  const reaches = selections.flatMap(
    ({ filters, lineFilters = [], areaFilters = [], wider }) => [
      {
        metres: searchRadius.metres,
        within: inArea,
        filters,
        lineFilters,
        areaFilters,
      },
      ...(wider
        ? [
            {
              metres: wider.metres,
              within: around(location, wider.metres),
              filters: wider.filters ?? [],
              lineFilters: [],
              areaFilters: wider.areaFilters ?? [],
            },
          ]
        : []),
    ],
  );
  const points = reaches.flatMap(({ within, filters }) =>
    filters.map((filter) => `nwr${filter}${within};`),
  );
  const lines = reaches.flatMap(({ within, lineFilters, areaFilters }) => [
    ...lineFilters.map((filter) => `way${filter}${within};`),
    ...areaFilters.map((filter) => `nw${filter}${within};`),
  ]);
  const relations = reaches.flatMap(({ within, areaFilters }) =>
    areaFilters.map((filter) => `rel${filter}${within};`),
  );
  const widest = Math.max(
    searchRadius.metres,
    ...reaches.map(({ metres }) => metres),
  );
  const header = `[out:json][timeout:${String(SOURCE_TIMEOUT_MS / 1000)}][maxsize:${String(OVERPASS_MAXSIZE_BYTES)}][bbox:${bbox(location, widest)}];`;
  return [
    header,
    output(points, "tags center"),
    output(lines, "tags geom"),
    output(relations, "body geom"),
  ].join("");
};

/** The form body that sends the query for a Search Area. */
export const overpassBody = (area: SearchArea) =>
  new URLSearchParams({ data: overpassQuery(area) }).toString();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** A point Overpass gives as `{ lat, lon }`, or `null`. */
const pointOf = (value: unknown): Location | null =>
  isRecord(value) &&
  typeof value.lat === "number" &&
  typeof value.lon === "number" &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lon)
    ? { lat: value.lat, lng: value.lon }
    : null;

/** The middle of the box Overpass gives as a way's `bounds`, or `null`. */
const middleOf = (bounds: unknown): Location | null =>
  isRecord(bounds)
    ? pointOf({
        lat: (Number(bounds.minlat) + Number(bounds.maxlat)) / 2,
        lon: (Number(bounds.minlon) + Number(bounds.maxlon)) / 2,
      })
    : null;

/** The points of a line Overpass gives as `geometry`, or `null` if it gives none. */
const lineOf = (geometry: unknown): Location[] | null =>
  Array.isArray(geometry)
    ? geometry.map(pointOf).filter((point) => point !== null)
    : null;

/** The member ways of a relation output with their lines, or `null` if there are none. */
const membersOf = (members: unknown): OsmMember[] | null => {
  if (!Array.isArray(members)) return null;
  const ways = members.flatMap((member): OsmMember[] => {
    if (!isRecord(member) || member.type !== "way") return [];
    const line = lineOf(member.geometry);
    return line && line.length >= 2
      ? [{ role: typeof member.role === "string" ? member.role : "", line }]
      : [];
  });
  return ways.length > 0 ? ways : null;
};

/**
 * One element from a raw response, or `null` if it has no point or no tags.
 * A way output with its line, or a relation with its members' lines (`geom`),
 * is placed at the middle of its bounds.
 */
const toElement = (element: unknown): OsmElement | null => {
  if (!isRecord(element) || !isRecord(element.tags)) return null;
  const { type, id } = element;
  if (typeof type !== "string" || typeof id !== "number") return null;
  const line = lineOf(element.geometry);
  const members = membersOf(element.members);
  const location =
    type === "node"
      ? pointOf(element)
      : (pointOf(element.center) ??
        (line || members ? middleOf(element.bounds) : null));
  if (!location) return null;
  const tags = Object.fromEntries(
    Object.entries(element.tags).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return {
    id: `${type}/${String(id)}`,
    location,
    tags,
    ...(line && line.length >= 2 ? { line } : {}),
    ...(members ? { members } : {}),
  };
};

/**
 * Maps a raw Overpass response to its elements. Overpass answers 200 even when
 * a query runs out of time or memory, with what it found so far and a
 * `remark` saying so: that would count short, so it throws instead.
 */
export const mapOverpassResponse = (
  status: number,
  body: unknown,
): OsmElements => {
  if (status !== 200 || !isRecord(body) || !Array.isArray(body.elements)) {
    throw new OverpassError(
      `Overpass answered ${String(status)} without a list of elements`,
    );
  }
  if (typeof body.remark === "string" && /error/i.test(body.remark)) {
    throw new OverpassError(`Overpass did not finish: ${body.remark}`);
  }
  const base = isRecord(body.osm3s) ? body.osm3s.timestamp_osm_base : null;
  const date =
    typeof base === "string" ? /^\d{4}-\d{2}-\d{2}/.exec(base)?.[0] : null;
  return {
    elements: body.elements
      .map(toElement)
      .filter((element) => element !== null),
    dataDate: date ?? null,
  };
};

/**
 * Asks Overpass for everything every Layer from OpenStreetMap needs in the
 * Search Area, in one query (PRD NFR-1.5), waiting for its turn first. The
 * answer is cached for 24 hours, and the same Search Area asked for again
 * while the query is on its way shares its answer, so each Layer can ask
 * without a query of its own. The period is the date of Overpass's copy of
 * OpenStreetMap.
 */
export const osmElements = (
  area: SearchArea,
  callSource: CallSource,
  { limiter, userAgent }: OverpassOptions,
): Promise<SourceResult<OsmElements>> => {
  const body = overpassBody(area);
  return callSource(
    overpass,
    `${INTERPRETER_URL} ${body}`,
    async ({ fetch, signal }) => {
      await limiter.wait(signal);
      const response = await fetch(INTERPRETER_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": userAgent,
        },
        body,
        signal,
      });
      const json: unknown = await response.json().catch(() => null);
      const data = mapOverpassResponse(response.status, json);
      return {
        data,
        period: data.dataDate
          ? { from: data.dataDate, to: data.dataDate }
          : null,
      };
    },
  );
};
