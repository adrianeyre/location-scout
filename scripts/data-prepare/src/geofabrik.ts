import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";

import {
  DOWNLOAD_TIMEOUT_MS,
  LARGE_DOWNLOAD_TIMEOUT_MS,
  USER_AGENT,
} from "./arcgis";
import { downloadFile } from "./demographics";
import { sqlString } from "./duckdb";

/**
 * OpenStreetMap's land use, buildings, roads and water for each Land
 * Coverage Area, from Geofabrik's extracts (PRD FR-6.1), which the Land
 * Opportunity Finder builds Land Parcels from (FR-5.2).
 *
 * Geofabrik cuts its England extract (1.7 GB) into one per county, and lists
 * them all, with the outline each covers, in its index. A council is clipped
 * from its counties' extracts rather than England's (`chooseExtracts`):
 * Nottinghamshire's and Derbyshire's for Ashfield (39 and 44 MB), as
 * Geofabrik's outline of Nottinghamshire follows the county's border only
 * roughly, leaving strips of Ashfield up to 130 m wide outside it. Each
 * `-latest` file redirects to one named for the day its data dates from,
 * `nottinghamshire-261008.osm.pbf`.
 */
export const GEOFABRIK = {
  name: "OpenStreetMap extract",
  source: "Geofabrik",
  index: "https://download.geofabrik.de/index-v1.json",
  /** The extract whose counties a council is clipped from. */
  england: "england",
  /** The file a `-latest` extract redirects to, named for its day: `-261008.osm.pbf`. */
  dated: /-(\d{2})(\d{2})(\d{2})\.osm\.pbf$/,
} as const;

/** One of Geofabrik's extracts, as its index lists it. */
export interface GeofabrikExtract {
  id: string;
  name: string;
  /** Its `-latest.osm.pbf`. */
  url: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isExtract = (value: unknown): value is GeofabrikExtract =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.url === "string";

const answered = (response: Response, url: string) => {
  if (!response.ok) {
    throw new Error(
      `${GEOFABRIK.source} answered ${String(response.status)} for ${url}`,
    );
  }
  return response;
};

/**
 * Downloads Geofabrik's index into the table `geofabrik_extracts`: each
 * extract's `id`, `name`, `url`, the extract it is cut from (`parent`) and
 * the outline it covers, `geometry`.
 */
export const loadGeofabrikIndex = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
) => {
  const response = answered(
    await fetchFn(GEOFABRIK.index, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    }),
    GEOFABRIK.index,
  );
  const index: unknown = await response.json();
  const features = (
    isRecord(index) && Array.isArray(index.features) ? index.features : []
  ).flatMap((feature: unknown) => {
    if (!isRecord(feature) || !isRecord(feature.properties)) return [];
    const { id, name, urls, parent } = feature.properties;
    const url = isRecord(urls) ? urls.pbf : null;
    return typeof id === "string" &&
      typeof name === "string" &&
      typeof url === "string" &&
      isRecord(feature.geometry)
      ? [
          {
            type: "Feature",
            properties: {
              id,
              name,
              url,
              parent: typeof parent === "string" ? parent : null,
            },
            geometry: feature.geometry,
          },
        ]
      : [];
  });
  if (features.length === 0) {
    throw new Error(
      `${GEOFABRIK.source}'s index at ${GEOFABRIK.index} lists no extracts. Its layout may have changed.`,
    );
  }
  const file = join(workDir, "geofabrik-index.geojson");
  await writeFile(
    file,
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  await connection.run(
    `CREATE OR REPLACE TABLE geofabrik_extracts AS
       SELECT id, name, url, parent, geom::GEOMETRY AS geometry FROM ST_Read($1)`,
    [file],
  );
};

/**
 * An extract is added for a council only if it covers at least this much of
 * the council that the extracts chosen so far don't: enough that a border's
 * strip of buildings is in it, not so little that a neighbouring county is
 * downloaded for a sliver where Geofabrik's outlines overlap.
 */
export const EXTRACT_MIN_GAIN_M2 = 10_000;

/** A geometry in WGS 84 in British National Grid, to measure in metres. */
const inMetres = (geometry: string) =>
  `ST_Transform(${geometry}, 'EPSG:4326', 'EPSG:27700', always_xy := true)`;

/**
 * The extracts each council in the table `land_areas` is clipped from, by
 * council code. Only England's extracts that aren't cut into smaller ones
 * are used: its counties. The first is the one that covers most of the
 * council; then, while one covers at least `EXTRACT_MIN_GAIN_M2` of what the
 * chosen ones don't, the one that covers most of it is added, as Derbyshire's
 * is for the strips of Ashfield Nottinghamshire's outline leaves out. A
 * council no such extract reaches into is clipped from the smallest extract
 * that covers it. A council no extract covers is missing.
 */
export const chooseExtracts = async (connection: DuckDBConnection) => {
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE extract_parts AS
       SELECT a.code, e.id, ${inMetres("TRY(ST_Intersection(e.geometry, a.boundary))")} AS part
       FROM land_areas a JOIN geofabrik_extracts e ON ST_Intersects(e.geometry, a.boundary)
       WHERE e.id IN (
         WITH RECURSIVE within(id) AS (
           SELECT $1::VARCHAR
           UNION SELECT x.id FROM geofabrik_extracts x JOIN within w ON x.parent = w.id
         )
         SELECT id FROM within
       )
       AND e.id NOT IN (SELECT parent FROM geofabrik_extracts WHERE parent IS NOT NULL)`,
    [GEOFABRIK.england],
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE uncovered AS
       SELECT code, ${inMetres("boundary")} AS rest FROM land_areas`,
  );
  await connection.run(
    "CREATE OR REPLACE TEMP TABLE chosen_extracts (code VARCHAR, id VARCHAR, step INTEGER)",
  );
  for (let step = 0; ; step++) {
    await connection.run(
      `CREATE OR REPLACE TEMP TABLE best AS
         SELECT code, arg_max(id, gain) AS id
         FROM (
           SELECT p.code, p.id, ST_Area(TRY(ST_Intersection(p.part, u.rest))) AS gain
           FROM extract_parts p JOIN uncovered u USING (code)
           WHERE (p.code, p.id) NOT IN (SELECT (code, id) FROM chosen_extracts)
         )
         WHERE gain >= $1
         GROUP BY code`,
      [EXTRACT_MIN_GAIN_M2],
    );
    const added = await connection.runAndReadAll(
      "SELECT count(*) AS added FROM best",
    );
    if (Number(added.getRowObjectsJson()[0]?.added) === 0) break;
    await connection.run(
      `INSERT INTO chosen_extracts SELECT code, id, ${String(step)} FROM best`,
    );
    await connection.run(
      `UPDATE uncovered u SET rest = coalesce(TRY(ST_Difference(u.rest, p.part)), u.rest)
       FROM best b JOIN extract_parts p USING (code, id)
       WHERE u.code = b.code`,
    );
  }

  const extract = "{'id': e.id, 'name': e.name, 'url': e.url}";
  const rows = await connection.runAndReadAll(
    `SELECT c.code, list(${extract} ORDER BY c.step) AS extracts
     FROM chosen_extracts c JOIN geofabrik_extracts e USING (id)
     GROUP BY c.code
     UNION ALL
     SELECT a.code, [arg_min(${extract}, ST_Area(e.geometry))]
     FROM land_areas a JOIN geofabrik_extracts e ON ST_Covers(e.geometry, a.boundary)
     WHERE a.code NOT IN (SELECT code FROM chosen_extracts)
     GROUP BY a.code`,
  );
  for (const table of [
    "extract_parts",
    "uncovered",
    "chosen_extracts",
    "best",
  ]) {
    await connection.run(`DROP TABLE ${table}`);
  }
  return new Map(
    rows.getRowObjectsJson().flatMap(({ code, extracts }) => {
      const found = Array.isArray(extracts)
        ? extracts.flatMap((part) => (isExtract(part) ? [part] : []))
        : [];
      return typeof code === "string" && found.length > 0
        ? [[code, found] as const]
        : [];
    }),
  );
};

/**
 * Downloads an extract to `file`, following its `-latest` link to the file
 * named for its day. Returns that file's URL and its day.
 */
export const downloadExtract = async (
  fetchFn: typeof fetch,
  extract: GeofabrikExtract,
  file: string,
) => {
  const latest = await fetchFn(extract.url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  await latest.body?.cancel();
  const location = latest.headers.get("location");
  const url = location ? new URL(location, extract.url).toString() : null;
  const [, year, month, day] = (url && GEOFABRIK.dated.exec(url)) ?? [];
  if (latest.status < 300 || latest.status >= 400 || !url || !day) {
    throw new Error(
      `${GEOFABRIK.source} answered ${String(latest.status)} for ${extract.url}, not the file it stands for.`,
    );
  }
  await downloadFile(fetchFn, GEOFABRIK.source, url, file, {
    timeoutMs: LARGE_DOWNLOAD_TIMEOUT_MS,
  });
  return { url, sourceDate: `20${year ?? ""}-${month ?? ""}-${day}` };
};

/** Tags whose closed ways and multipolygons are areas the Land Coverage Area keeps. */
const AREA_KEYS = ["building", "landuse", "natural", "leisure", "water"];

/** A way or relation is wanted if it has one of these tags. */
const WANTED = [...AREA_KEYS, "highway", "waterway"]
  .map((key) => `tags['${key}'] IS NOT NULL`)
  .join(" OR ");

/** The bounds of a geometry, beside it, so a query can skip what is far away. */
const bounds = (geometry: string) =>
  `ST_XMin(${geometry}) AS xmin, ST_YMin(${geometry}) AS ymin,
   ST_XMax(${geometry}) AS xmax, ST_YMax(${geometry}) AS ymax`;

/**
 * Reads extracts with DuckDB's `ST_ReadOSM`, each element once where they
 * overlap, and builds the tables a Land Coverage Area's OpenStreetMap files
 * are clipped from, each with an
 * `osm_type` (`way` or `relation`), `osm_id`, the tags it is kept for,
 * `name`, its bounds and its `geometry` in WGS 84:
 *
 * - `osm_land_use`: areas tagged `landuse`, `natural` or `leisure`, with
 *   `access`, for a park or nature reserve the public can't use.
 * - `osm_buildings`: areas tagged `building`, but for `building=no`.
 * - `osm_roads`: ways tagged `highway`, as lines, footpaths too.
 * - `osm_water`: areas of water (`natural=water`, `water`, `landuse`
 *   reservoir or basin, `waterway` riverbank or dock) and waterways as lines.
 *
 * A closed way with one of those area tags is a polygon, and a multipolygon
 * relation is built from its member ways' lines, its inner rings holes. A
 * multipolygon whose ways don't make an area GEOS can build, as a few
 * mapped with crossing rings don't, is left out; it returns how many were.
 * Extracts hold whole ways, so every node a way needs is in the file. (GDAL
 * reads `.osm.pbf` too, but it drops features from every layer but the one
 * read, so it is not used.)
 */
export const loadOsm = async (
  connection: DuckDBConnection,
  pbfs: readonly string[],
) => {
  // Each extract's elements of a kind, the same element once, from the
  // first extract that has it.
  const read = (kind: string, columns: string, where: string) =>
    `SELECT DISTINCT ON (id) ${columns} FROM (${pbfs
      .map(
        (pbf, index) =>
          `SELECT *, ${String(index)} AS extract FROM ST_ReadOSM(${sqlString(pbf)})`,
      )
      .join(" UNION ALL ")}) WHERE kind = '${kind}' AND (${where})
     ORDER BY id, extract`;
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE osm_relations AS
       ${read("relation", "id, tags, refs, ref_roles, ref_types", `tags['type'] = 'multipolygon' AND (${WANTED})`)}`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE osm_ways AS
       ${read(
         "way",
         "id, tags, refs",
         `(${WANTED}) OR id IN (
           SELECT ref FROM (
             SELECT unnest(refs) AS ref, unnest(ref_types) AS type FROM osm_relations
           ) WHERE type = 'way'
         )`,
       )}`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE osm_nodes AS
       ${read("node", "id, lon, lat", "id IN (SELECT DISTINCT unnest(refs) FROM osm_ways)")}`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE osm_lines AS
       WITH points AS (
         SELECT w.id, r.position, r.node
         FROM osm_ways w, LATERAL (
           SELECT unnest(w.refs) AS node, generate_subscripts(w.refs, 1) AS position
         ) r
       )
       SELECT p.id, ST_MakeLine(list(ST_Point(n.lon, n.lat) ORDER BY p.position)) AS line
       FROM points p JOIN osm_nodes n ON n.id = p.node
       GROUP BY p.id
       HAVING count(*) >= 2`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE osm_areas AS
       SELECT 'way' AS osm_type, w.id AS osm_id, w.tags, ST_MakePolygon(l.line) AS geometry
       FROM osm_ways w JOIN osm_lines l USING (id)
       WHERE ST_IsClosed(l.line) AND ST_NPoints(l.line) >= 4
         AND (${AREA_KEYS.map((key) => `w.tags['${key}'] IS NOT NULL`).join(" OR ")}
           OR w.tags['waterway'] IN ('riverbank', 'dock'))
       UNION ALL
       SELECT 'relation', id, tags, TRY(ST_BuildArea(ST_Collect(lines)))
       FROM (
         SELECT m.id, any_value(m.tags) AS tags,
           list(l.line ORDER BY m.position) AS lines
         FROM (
           SELECT id, tags, unnest(refs) AS way, unnest(ref_types) AS type,
             unnest(ref_roles) AS role, generate_subscripts(refs, 1) AS position
           FROM osm_relations
         ) m JOIN osm_lines l ON l.id = m.way
         WHERE m.type = 'way' AND m.role IN ('outer', 'inner', '')
         GROUP BY m.id
       )`,
  );
  const unbuilt = await connection.runAndReadAll(
    "SELECT count(*) AS unbuilt FROM osm_areas WHERE geometry IS NULL",
  );
  const tag = (key: string) => `tags['${key}'] AS "${key}"`;
  await connection.run(
    `CREATE OR REPLACE TABLE osm_land_use AS
       SELECT osm_type, osm_id, ${["landuse", "natural", "leisure", "access", "name"].map(tag).join(", ")},
         ${bounds("geometry")}, geometry
       FROM osm_areas
       WHERE (tags['landuse'] IS NOT NULL OR tags['natural'] IS NOT NULL OR tags['leisure'] IS NOT NULL)
         AND NOT ST_IsEmpty(geometry)`,
  );
  await connection.run(
    `CREATE OR REPLACE TABLE osm_buildings AS
       SELECT osm_type, osm_id, ${["building", "name"].map(tag).join(", ")},
         ${bounds("geometry")}, geometry
       FROM osm_areas
       WHERE tags['building'] IS NOT NULL AND tags['building'] <> 'no'
         AND NOT ST_IsEmpty(geometry)`,
  );
  await connection.run(
    `CREATE OR REPLACE TABLE osm_roads AS
       SELECT 'way' AS osm_type, w.id AS osm_id, ${["highway", "name"].map((key) => `w.${tag(key)}`).join(", ")},
         ${bounds("l.line")}, l.line AS geometry
       FROM osm_ways w JOIN osm_lines l USING (id)
       WHERE w.tags['highway'] IS NOT NULL`,
  );
  await connection.run(
    `CREATE OR REPLACE TABLE osm_water AS
       SELECT osm_type, osm_id, ${["natural", "water", "waterway", "landuse", "name"].map(tag).join(", ")},
         ${bounds("geometry")}, geometry
       FROM osm_areas
       WHERE (tags['natural'] = 'water' OR tags['water'] IS NOT NULL
           OR tags['landuse'] IN ('reservoir', 'basin')
           OR tags['waterway'] IN ('riverbank', 'dock'))
         AND NOT ST_IsEmpty(geometry)
       UNION ALL
       SELECT 'way', w.id, ${["natural", "water", "waterway", "landuse", "name"].map((key) => `w.${tag(key)}`).join(", ")},
         ${bounds("l.line")}, l.line
       FROM osm_ways w JOIN osm_lines l USING (id)
       WHERE w.tags['waterway'] IS NOT NULL
         AND w.tags['waterway'] NOT IN ('riverbank', 'dock')`,
  );
  for (const table of [
    "osm_areas",
    "osm_lines",
    "osm_nodes",
    "osm_ways",
    "osm_relations",
  ]) {
    await connection.run(`DROP TABLE ${table}`);
  }
  return { unbuilt: Number(unbuilt.getRowObjectsJson()[0]?.unbuilt ?? 0) };
};

/** The tables `loadOsm` builds, which a Land Coverage Area's OpenStreetMap files are clipped from. */
export const OSM_TABLES = [
  "osm_land_use",
  "osm_buildings",
  "osm_roads",
  "osm_water",
] as const;
