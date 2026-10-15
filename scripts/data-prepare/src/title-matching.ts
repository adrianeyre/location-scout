import type { DuckDBConnection } from "@duckdb/node-api";

import { sqlString } from "./duckdb";
import { INSPIRE } from "./inspire";
import {
  STREET_TYPES,
  parseTitleAddress,
  type TitleAddress,
} from "./title-addresses";

/**
 * OQ-7's spike: matching HM Land Registry's CCOD and OCOD titles, which
 * have an address but no outline, to the INSPIRE Index Polygons, which have
 * an outline but no title number (PRD FR-5.4a). Everything is matched in
 * British National Grid, in metres, where the INSPIRE Index Polygons are
 * published.
 *
 * A title is placed by the first of these that finds it any polygon:
 *
 * 1. `address`: its house numbers on its street, at an OpenStreetMap address
 *    (a node, or a building's outline) with that number and street, and the
 *    same postcode where both have one; the polygons those addresses are in.
 * 2. `named`: a building's or site's name it gives, as an OpenStreetMap
 *    feature's name or `addr:housename`; the polygons the feature is in, or
 *    that are mostly inside it.
 * 3. `street`: the polygons beside the street it names, on the side it says.
 * 4. `postcode`: the polygon its postcode's Code-Point Open point is in.
 *
 * Each of 1–3 looks only within `NEAR_POSTCODE_M` of the title's postcode,
 * if it has one. A title is matched when the step that placed it found one
 * polygon, and ambiguous when it found more.
 */

/** How far from its postcode's point a title's address may be found. */
export const NEAR_POSTCODE_M = 2000;

/** A polygon is beside a street if it comes within this distance of it. */
export const BESIDE_STREET_M = 10;

/** A named area holds an INSPIRE Index Polygon if this share of the polygon is inside it. */
export const MOSTLY_INSIDE = 0.5;

/** A match is counted right if its polygon is within this distance of where the title truly is. */
export const RIGHT_WITHIN_M = 25;

/** The steps, in the order they are tried. */
export const MATCH_STEPS = ["address", "named", "street", "postcode"] as const;
export type MatchStep = (typeof MATCH_STEPS)[number];

/**
 * The steps whose single matches the spike found right often enough to
 * show (docs/spikes/oq-7-ccod-ocod-title-matching.md). A `street` step
 * almost never narrows land to one polygon, and a `postcode` step's one
 * polygon is usually a neighbour's.
 */
export const TRUSTED_STEPS: readonly MatchStep[] = ["address", "named"];

/** British National Grid, which the INSPIRE Index Polygons and Code-Point Open use. */
const BNG = INSPIRE.crs;

/** A WGS 84 shape in British National Grid. */
const toBng = (geometry: string) =>
  `ST_Transform(${geometry}, 'EPSG:4326', ${sqlString(BNG)}, always_xy := true)`;

/**
 * Loads the GML in a council's INSPIRE zip into `inspire`, each polygon's
 * `inspire_id` and outline as published, in British National Grid.
 */
export const loadInspireBng = async (
  connection: DuckDBConnection,
  zip: string,
) => {
  await connection.run(
    `CREATE OR REPLACE TABLE inspire AS
       SELECT CAST(INSPIREID AS BIGINT) AS inspire_id, GEOMETRY::GEOMETRY AS geometry
       FROM ST_Read($1, open_options := ['DOWNLOAD_SCHEMA=NO'])`,
    [`/vsizip/${zip}/${INSPIRE.member}`],
  );
};

/**
 * Loads Code-Point Open's CSVs (no header: postcode, positional quality,
 * easting, northing…) from inside its zip into `postcodes`, with each
 * postcode's point.
 */
export const loadPostcodes = async (
  connection: DuckDBConnection,
  zip: string,
  areas: readonly string[],
) => {
  await connection.run(
    `CREATE OR REPLACE TABLE postcodes AS
       SELECT DISTINCT ON (postcode) postcode, geometry FROM (${areas
         .map(
           (area) =>
             `SELECT field_1 AS postcode,
                ST_Point(CAST(field_3 AS DOUBLE), CAST(field_4 AS DOUBLE)) AS geometry
              FROM ST_Read(${sqlString(`/vsizip/${zip}/Data/CSV/${area}.csv`)}, open_options := ['HEADERS=NO'])`,
         )
         .join(" UNION ALL ")})
       WHERE postcode IS NOT NULL ORDER BY postcode`,
  );
  // Code-Point writes some postcodes with two spaces, as "S1  2AB".
  await connection.run(
    `UPDATE postcodes SET postcode = regexp_replace(postcode, '\\s+', ' ', 'g')`,
  );
};

/**
 * Reads the extracts' addresses, names, streets and places inside `box`
 * (west, south, east, north, in WGS 84) into British National Grid:
 *
 * - `osm_addresses`: each node or closed way with `addr:housenumber` or
 *   `addr:housename`, one row a house number (`12;14` is two), its
 *   `street`, `postcode`, `housename` and `point` (a way's point on its
 *   surface).
 * - `osm_named`: each named node or closed way that isn't a road, with its
 *   `name`, its `point` and, for a way, its `area`.
 * - `osm_streets`: each named highway, as a line.
 * - `osm_places`: the names of `place` nodes: towns, villages, suburbs.
 *
 * Names are normalised by `normaliseName`. Relations are not read: few
 * addresses or named sites in Ashfield are multipolygons.
 */
export const loadOsmAddresses = async (
  connection: DuckDBConnection,
  pbfs: readonly string[],
  box: readonly [number, number, number, number],
) => {
  const [west, south, east, north] = [box[0], box[1], box[2], box[3]].map(
    (degrees) => String(degrees),
  ) as [string, string, string, string];
  const elements = `(${pbfs
    .map(
      (pbf, index) =>
        `SELECT *, ${String(index)} AS extract FROM ST_ReadOSM(${sqlString(pbf)})`,
    )
    .join(" UNION ALL ")})`;
  const wanted = `tags['addr:housenumber'] IS NOT NULL OR tags['addr:housename'] IS NOT NULL
    OR tags['name'] IS NOT NULL OR tags['place'] IS NOT NULL`;
  const envelope = `ST_MakeEnvelope(${west}, ${south}, ${east}, ${north})`;
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE spike_ways AS
       SELECT DISTINCT ON (id) id, tags, refs FROM ${elements}
       WHERE kind = 'way' AND (${wanted}) ORDER BY id, extract`,
  );
  // The tagged nodes in the box, and every node a tagged way needs.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE spike_nodes AS
       SELECT DISTINCT ON (id) id, tags, lon, lat FROM ${elements}
       WHERE kind = 'node' AND (
         ((${wanted}) AND lon BETWEEN ${west} AND ${east} AND lat BETWEEN ${south} AND ${north})
         OR id IN (SELECT DISTINCT unnest(refs) FROM spike_ways)
       )
       ORDER BY id, extract`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE spike_lines AS
       WITH points AS (
         SELECT w.id, r.position, r.node FROM spike_ways w, LATERAL (
           SELECT unnest(w.refs) AS node, generate_subscripts(w.refs, 1) AS position
         ) r
       )
       SELECT id, line FROM (
         SELECT p.id, ST_MakeLine(list(ST_Point(n.lon, n.lat) ORDER BY p.position)) AS line
         FROM points p JOIN spike_nodes n ON n.id = p.node
         GROUP BY p.id HAVING count(*) >= 2
       )
       WHERE ST_Intersects(line, ${envelope})`,
  );
  // Every tagged element in the box, as a point and, for a closed way, an area.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE spike_elements AS
       SELECT 'node' AS osm_type, id AS osm_id, tags,
         ${toBng("ST_Point(lon, lat)")} AS point, NULL::GEOMETRY AS area, NULL::GEOMETRY AS line
       FROM spike_nodes
       WHERE (${wanted}) AND lon BETWEEN ${west} AND ${east} AND lat BETWEEN ${south} AND ${north}
       UNION ALL
       SELECT 'way', id, tags, ST_PointOnSurface(coalesce(area, line)), area, line
       FROM (
         SELECT w.id, w.tags, ${toBng("l.line")} AS line,
           CASE WHEN ST_IsClosed(l.line) AND ST_NPoints(l.line) >= 4
             THEN ${toBng("ST_MakePolygon(l.line)")} END AS area
         FROM spike_ways w JOIN spike_lines l USING (id)
       )`,
  );
  await connection.run(
    `CREATE OR REPLACE TABLE osm_addresses AS
       SELECT osm_type, osm_id, housenumber,
         normalise_name(tags['addr:street']) AS street,
         normalise_postcode(tags['addr:postcode']) AS postcode,
         normalise_name(tags['addr:housename']) AS housename,
         point
       FROM spike_elements, LATERAL (
         SELECT unnest(string_split(upper(regexp_replace(coalesce(tags['addr:housenumber'], ''), '\\s', '', 'g')), ';')) AS housenumber
       )
       WHERE (tags['addr:housenumber'] IS NOT NULL OR tags['addr:housename'] IS NOT NULL)
         AND (housenumber <> '' OR tags['addr:housename'] IS NOT NULL)`,
  );
  await connection.run(
    `CREATE OR REPLACE TABLE osm_named AS
       SELECT osm_type, osm_id, normalise_name(tags['name']) AS name, point, area
       FROM spike_elements
       WHERE tags['name'] IS NOT NULL AND tags['highway'] IS NULL AND tags['place'] IS NULL`,
  );
  await connection.run(
    `CREATE OR REPLACE TABLE osm_streets AS
       SELECT osm_id, normalise_name(tags['name']) AS street, line AS geometry
       FROM spike_elements
       WHERE osm_type = 'way' AND tags['highway'] IS NOT NULL AND tags['name'] IS NOT NULL`,
  );
  await connection.run(
    `CREATE OR REPLACE TABLE osm_places AS
       SELECT DISTINCT normalise_name(tags['name']) AS name FROM spike_elements
       WHERE tags['place'] IS NOT NULL AND tags['name'] IS NOT NULL`,
  );
  for (const table of [
    "spike_elements",
    "spike_lines",
    "spike_ways",
    "spike_nodes",
  ]) {
    await connection.run(`DROP TABLE ${table}`);
  }
};

/**
 * Registers `normalise_name` and `normalise_postcode` with DuckDB, as SQL
 * macros that do what `normaliseName` and `normalisePostcode` do to the
 * names OpenStreetMap gives, so both sides of a match are written alike, and
 * `name_key`, which the `named` step compares names by.
 */
export const registerNormalisers = async (connection: DuckDBConnection) => {
  const streetTypes = Object.entries(STREET_TYPES);
  // OpenStreetMap writes names out in full, so only "St" at the end, for
  // "Street", and the few short forms some mappers use are rewritten.
  await connection.run(
    `CREATE OR REPLACE MACRO normalise_words(t) AS
       trim(regexp_replace(regexp_replace(replace(replace(replace(upper(t), '&', ' AND '), '''', ''), '’', ''), '[^A-Z0-9]+', ' ', 'g'), '\\s+', ' ', 'g'))`,
  );
  await connection.run(
    `CREATE OR REPLACE MACRO normalise_name(t) AS
       CASE WHEN t IS NULL OR normalise_words(t) = '' THEN NULL ELSE
         array_to_string(list_transform(
           string_split(normalise_words(t), ' '),
           (w, i) -> CASE
             WHEN i = len(string_split(normalise_words(t), ' ')) AND w = 'ST' THEN 'STREET'
             ${streetTypes.map(([short, long]) => `WHEN w = '${short}' THEN '${long}'`).join(" ")}
             ELSE w END
         ), ' ')
       END`,
  );
  await connection.run(
    `CREATE OR REPLACE MACRO normalise_postcode(t) AS
       CASE WHEN regexp_full_match(upper(trim(coalesce(t, ''))), '[A-Z]{1,2}[0-9][A-Z0-9]?\\s*[0-9][A-Z]{2}')
         THEN regexp_replace(upper(trim(t)), '^([A-Z]{1,2}[0-9][A-Z0-9]?)\\s*([0-9][A-Z]{2})$', '\\1 \\2')
       END`,
  );
  // A normalised name as a site's name is compared: without "THE" before
  // it, and each word's plural "S" dropped, so "Carsic Allotment" is the
  // site OpenStreetMap names "Carsic Allotments".
  await connection.run(
    `CREATE OR REPLACE MACRO name_key(t) AS
       array_to_string(list_transform(
         string_split(regexp_replace(t, '^THE ', ''), ' '),
         w -> CASE WHEN length(w) > 3 AND w LIKE '%S' AND w NOT LIKE '%SS' THEN w[1:-2] ELSE w END
       ), ' ')`,
  );
};

/** A registered title, as CCOD, OCOD or a proxy for them gives it. */
export interface Title {
  titleNumber: string;
  tenure: string;
  propertyAddress: string;
  postcode: string | null;
  /** CCOD's Proprietorship Category (1), or the proxy's kind of owner. */
  category: string;
  /** Where the title truly is, in British National Grid, if a proxy knows it. */
  truth: { x: number; y: number } | null;
}

/** The streets and places known in the area, normalised, which a title's address is read against. */
export const knownNames = async (connection: DuckDBConnection) => {
  const read = async (sql: string) =>
    new Set(
      (await connection.runAndReadAll(sql))
        .getRowObjectsJson()
        .flatMap(({ name }) => (typeof name === "string" ? [name] : [])),
    );
  return {
    streets: await read(
      `SELECT street AS name FROM osm_streets UNION SELECT street FROM osm_addresses WHERE street IS NOT NULL`,
    ),
    places: await read(`SELECT name FROM osm_places WHERE name IS NOT NULL`),
  };
};

/** Reads each title's address and loads them into `titles`. */
export const loadTitles = async (
  connection: DuckDBConnection,
  titles: readonly Title[],
  known: Parameters<typeof parseTitleAddress>[2],
) => {
  await connection.run(
    `CREATE OR REPLACE TABLE titles (
       title_number VARCHAR PRIMARY KEY, tenure VARCHAR, property_address VARCHAR,
       category VARCHAR, kind VARCHAR, postcode VARCHAR, street VARCHAR,
       numbers VARCHAR[], name VARCHAR, land BOOLEAN, beside BOOLEAN, side VARCHAR,
       truth GEOMETRY)`,
  );
  const parsed: [Title, TitleAddress][] = titles.map((title) => [
    title,
    parseTitleAddress(title.propertyAddress, title.postcode, known),
  ]);
  // Rows go in through a prepared statement: the appender can't write a
  // geometry, and a few thousand titles are quick enough this way.
  const insert = await connection.prepare(
    `INSERT INTO titles VALUES ($1, $2, $3, $4, $5, $6, $7,
       CASE WHEN $8 = '' THEN [] ELSE string_split($8, '|') END,
       $9, $10, $11, $12,
       CASE WHEN $13 IS NULL THEN NULL ELSE ST_Point($13, $14) END)`,
  );
  for (const [title, address] of parsed) {
    insert.bindVarchar(1, title.titleNumber);
    insert.bindVarchar(2, title.tenure);
    insert.bindVarchar(3, title.propertyAddress);
    insert.bindVarchar(4, title.category);
    insert.bindVarchar(5, address.kind);
    bindNullable(insert, 6, address.postcode);
    bindNullable(insert, 7, address.street);
    insert.bindVarchar(8, address.numbers.join("|"));
    bindNullable(insert, 9, address.name);
    insert.bindBoolean(10, address.land);
    insert.bindBoolean(11, address.beside);
    bindNullable(insert, 12, address.side);
    if (title.truth) {
      insert.bindDouble(13, title.truth.x);
      insert.bindDouble(14, title.truth.y);
    } else {
      insert.bindNull(13);
      insert.bindNull(14);
    }
    await insert.run();
  }
};

const bindNullable = (
  statement: Awaited<ReturnType<DuckDBConnection["prepare"]>>,
  index: number,
  value: string | null,
) => {
  if (value === null) statement.bindNull(index);
  else statement.bindVarchar(index, value);
};

/**
 * Matches every title in `titles` to the INSPIRE Index Polygons in
 * `inspire`, writing `title_candidates` (each title's step and every polygon
 * it found) and `title_matches`: each title's `step` (or `NULL`), how many
 * `candidates` it found, its `inspire_id` if it found one, and, where
 * `truth` is known, whether a polygon covers it (`registered`), how far the
 * matched polygon is from it (`distance_m`) and whether any candidate is
 * within `RIGHT_WITHIN_M` of it (`truth_among`).
 */
export const matchTitles = async (connection: DuckDBConnection) => {
  // Each title's postcode point, if Code-Point Open has its postcode.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE title_places AS
       SELECT t.*, p.geometry AS postcode_point
       FROM titles t LEFT JOIN postcodes p ON p.postcode = t.postcode`,
  );
  const near = (point: string) =>
    `(t.postcode_point IS NULL OR ST_DWithin(t.postcode_point, ${point}, ${String(NEAR_POSTCODE_M)}))`;
  const steps: Record<MatchStep, string> = {
    address: `
      SELECT DISTINCT t.title_number, i.inspire_id
      FROM title_places t
      JOIN osm_addresses a ON a.street = t.street AND list_contains(t.numbers, a.housenumber)
      JOIN inspire i ON ST_Intersects(i.geometry, a.point)
      WHERE NOT t.beside AND len(t.numbers) > 0
        AND (a.postcode IS NULL OR t.postcode IS NULL OR a.postcode = t.postcode)
        AND ${near("a.point")}`,
    named: `
      WITH named AS (
        SELECT t.title_number, n.point, n.area
        FROM title_places t JOIN osm_named n ON name_key(n.name) = name_key(t.name)
        WHERE t.name IS NOT NULL AND ${near("n.point")}
        UNION ALL
        SELECT t.title_number, a.point, NULL
        FROM title_places t JOIN osm_addresses a ON name_key(a.housename) = name_key(t.name)
        WHERE t.name IS NOT NULL AND ${near("a.point")}
      )
      SELECT DISTINCT n.title_number, i.inspire_id
      FROM named n JOIN inspire i ON ST_Intersects(i.geometry, n.point)
      UNION
      SELECT n.title_number, i.inspire_id
      FROM named n JOIN inspire i ON ST_Intersects(i.geometry, n.area)
      WHERE n.area IS NOT NULL
        AND ST_Area(ST_Intersection(i.geometry, n.area)) >= ${String(MOSTLY_INSIDE)} * ST_Area(i.geometry)`,
    street: `
      WITH beside AS (
        SELECT t.title_number, t.side, i.inspire_id, i.geometry,
          ST_ClosestPoint(s.geometry, ST_PointOnSurface(i.geometry)) AS on_street
        FROM title_places t
        JOIN osm_streets s ON s.street = t.street
        JOIN inspire i ON ST_DWithin(i.geometry, s.geometry, ${String(BESIDE_STREET_M)})
        WHERE t.street IS NOT NULL AND ${near("s.geometry")}
      )
      SELECT DISTINCT title_number, inspire_id FROM (
        SELECT *, ST_PointOnSurface(geometry) AS inside FROM beside
      )
      WHERE side IS NULL
        OR (side = 'NORTH' AND ST_Y(inside) > ST_Y(on_street))
        OR (side = 'SOUTH' AND ST_Y(inside) < ST_Y(on_street))
        OR (side = 'EAST' AND ST_X(inside) > ST_X(on_street))
        OR (side = 'WEST' AND ST_X(inside) < ST_X(on_street))`,
    postcode: `
      SELECT DISTINCT t.title_number, i.inspire_id
      FROM title_places t JOIN inspire i ON ST_Intersects(i.geometry, t.postcode_point)
      WHERE t.postcode_point IS NOT NULL`,
  };
  await connection.run(
    `CREATE OR REPLACE TABLE title_candidates AS
       ${MATCH_STEPS.map(
         (step, order) =>
           `SELECT title_number, '${step}' AS step, ${String(order)} AS step_order, inspire_id FROM (${steps[step]})`,
       ).join(" UNION ALL ")}`,
  );
  // Each title keeps only the first step that found it a polygon.
  await connection.run(
    `CREATE OR REPLACE TABLE title_candidates AS
       SELECT c.* FROM title_candidates c
       JOIN (SELECT title_number, min(step_order) AS step_order FROM title_candidates GROUP BY ALL) f
         USING (title_number, step_order)`,
  );
  await connection.run(
    `CREATE OR REPLACE TABLE title_matches AS
       WITH found AS (
         SELECT title_number, any_value(step) AS step, count(*) AS candidates,
           CASE WHEN count(*) = 1 THEN any_value(inspire_id) END AS inspire_id
         FROM title_candidates GROUP BY title_number
       ),
       truth AS (
         SELECT t.title_number,
           EXISTS (SELECT 1 FROM inspire i WHERE ST_Intersects(i.geometry, t.truth)) AS registered,
           EXISTS (
             SELECT 1 FROM title_candidates c JOIN inspire i USING (inspire_id)
             WHERE c.title_number = t.title_number AND ST_DWithin(i.geometry, t.truth, ${String(RIGHT_WITHIN_M)})
           ) AS truth_among
         FROM titles t WHERE t.truth IS NOT NULL
       )
       SELECT t.title_number, t.tenure, t.category, t.kind, t.property_address,
         t.postcode, t.street, t.name, t.side, t.land, t.beside,
         f.step, coalesce(f.candidates, 0) AS candidates, f.inspire_id,
         tr.registered, tr.truth_among,
         CASE WHEN f.inspire_id IS NOT NULL AND t.truth IS NOT NULL
           THEN ST_Distance(i.geometry, t.truth) END AS distance_m,
         CASE WHEN f.inspire_id IS NOT NULL
           THEN ST_Transform(ST_PointOnSurface(i.geometry), ${sqlString(BNG)}, 'EPSG:4326', always_xy := true) END AS matched_point
       FROM titles t
       LEFT JOIN found f USING (title_number)
       LEFT JOIN truth tr USING (title_number)
       LEFT JOIN inspire i ON i.inspire_id = f.inspire_id
       ORDER BY t.title_number`,
  );
  await connection.run("DROP TABLE title_places");
};
