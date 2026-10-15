import type { DuckDBConnection } from "@duckdb/node-api";
import {
  LAND_PARCEL_RULES,
  PLANNING_CONSTRAINT_DATASETS,
  SQUARE_METRES_PER_HECTARE,
  type PlanningConstraintDataset,
  type PlanningConstraintType,
} from "@location-scout/shared";

import { ENGLAND_BOUNDS } from "./demographics";
import { sqlString } from "./duckdb";
import { constraintsTable } from "./planning-constraints";

/**
 * A Land Coverage Area's Land Parcels (PRD FR-5.2), built from the tables
 * `prepareLandData` loads, and tagged (FR-5.4), so the backend only filters
 * and sorts them (FR-6.2).
 *
 * Its open or undeveloped land is joined where it meets or overlaps, cut to
 * the council's boundary, and what buildings, roads, water and protected
 * parks cover is taken away from it, leaving each contiguous piece a Land
 * Parcel. Shapes are measured in British National Grid, in metres.
 */

/** OpenStreetMap's open or undeveloped land (PRD FR-5.2), by key. */
export const OPEN_LAND = {
  landuse: [
    "grass",
    "meadow",
    "brownfield",
    "greenfield",
    "farmland",
    "construction",
  ],
  natural: ["scrub", "grassland"],
} as const;

/** Parks and other protected open spaces, which are taken away from open land. */
export const PROTECTED_PARKS = {
  leisure: ["park", "nature_reserve", "common", "garden"],
  landuse: ["village_green", "recreation_ground"],
} as const;

/**
 * The roads taken away from open land, and that a Land Parcel's road
 * distance is to, each with half the width it is taken to be, in metres.
 * Footpaths, cycle paths, bridleways and tracks cross fields without
 * dividing them, so they are neither.
 */
export const ROAD_HALF_WIDTHS: Readonly<Record<string, number>> = {
  motorway: 12,
  motorway_link: 5,
  trunk: 8,
  trunk_link: 5,
  primary: 6,
  primary_link: 4,
  secondary: 5,
  secondary_link: 4,
  tertiary: 4,
  tertiary_link: 3,
  unclassified: 3,
  residential: 3,
  living_street: 3,
  pedestrian: 3,
  busway: 3,
  road: 3,
  service: 2.5,
};

/** Half the width of a waterway mapped as a line, in metres: a river's or a canal's, or a stream's or a ditch's. */
export const WATERWAY_HALF_WIDTHS = { wide: 5, narrow: 1 } as const;
const WIDE_WATERWAYS = ["river", "canal"];

/** INSPIRE Index Polygons that overlap a Land Parcel by less than this, in m², are taken to only touch it. */
export const INSPIRE_MIN_OVERLAP_M2 = 10;

/** Shapes are kept to within this many metres, which keeps the file small. */
const SIMPLIFY_METRES = 0.5;

/** Each Planning Constraint dataset, and the type the Planning Layer calls it. */
const CONSTRAINT_TYPES: Readonly<
  Record<PlanningConstraintDataset, PlanningConstraintType>
> = {
  "conservation-area": "conservation-area",
  "listed-building": "listed-building",
  "listed-building-outline": "listed-building",
  "article-4-direction-area": "article-4-direction",
  "tree-preservation-zone": "tree-preservation-zone",
  "flood-risk-zone": "flood-zone",
};

const list = (values: readonly string[]) => values.map(sqlString).join(", ");

/** A shape in WGS 84, in British National Grid. */
const bng = (geometry: string) =>
  `ST_Transform(${geometry}, 'EPSG:4326', 'EPSG:27700', always_xy := true)`;

/** A shape in British National Grid, in WGS 84. */
const wgs84 = (geometry: string) =>
  `ST_Transform(${geometry}, 'EPSG:27700', 'EPSG:4326', always_xy := true)`;

/** The bounds of a shape, beside it, so a join can skip what is far away. */
const bounds = (geometry: string) =>
  `ST_XMin(${geometry}) AS xmin, ST_YMin(${geometry}) AS ymin,
   ST_XMax(${geometry}) AS xmax, ST_YMax(${geometry}) AS ymax`;

/** Whether two rows' bounds overlap, the second's grown by `margin`. */
const near = (a: string, b: string, margin = 0) => {
  const m = String(margin);
  return `${b}.xmax + ${m} >= ${a}.xmin AND ${b}.xmin - ${m} <= ${a}.xmax
    AND ${b}.ymax + ${m} >= ${a}.ymin AND ${b}.ymin - ${m} <= ${a}.ymax`;
};

/** Rows of a WGS 84 table whose bounds reach the council's, with its margin. */
const inCouncil = (alias: string) =>
  `${alias}.xmax >= c.xmin AND ${alias}.xmin <= c.xmax AND ${alias}.ymax >= c.ymin AND ${alias}.ymin <= c.ymax`;

/** Polygons only, each on its own, from whatever a shape operation left. */
const polygonsOf = (geometry: string) =>
  `unnest(ST_Dump(ST_CollectionExtract(ST_MakeValid(${geometry}), 3))).geom`;

const openLand = [
  ...OPEN_LAND.landuse.map((value) => `t.landuse = ${sqlString(value)}`),
  ...OPEN_LAND.natural.map((value) => `t."natural" = ${sqlString(value)}`),
].join(" OR ");

/** A title matched to an INSPIRE Index Polygon, as a Land Parcel lists it. */
const MATCHED_TITLE = `STRUCT(
  title_number VARCHAR, property_address VARCHAR, proprietorship_category VARCHAR,
  ownership_category VARCHAR, dataset VARCHAR, source_date VARCHAR,
  matched_by VARCHAR, inspire_id VARCHAR, distance_m DOUBLE)`;

/**
 * Builds the council's Land Parcels into the table `land_parcels`, replacing
 * any it held, from `osm_land_use`, `osm_buildings`, `osm_roads`,
 * `osm_water`, `inspire_index_polygons` (the council's own), the Planning
 * Constraint tables and the council's row of `land_areas`. Each has its
 * `parcel_id`, the council's code and its number; its area; its tags; a point
 * inside it and its bounds, in WGS 84; and its `geometry`, in WGS 84.
 *
 * With `ownership`, the companies' and councils' titles matched to the
 * council's INSPIRE Index Polygons in `inspire_titles` give each polygon,
 * and each Land Parcel, its indicative Ownership Category (PRD FR-5.4a): a
 * polygon a council's or public body's title is matched to is council or
 * public-body owned, one only companies' titles are matched to is
 * company-owned, and the rest are other registered. A Land Parcel is
 * Possibly Unregistered, or else in the category of the polygon that covers
 * most of it, and lists the titles matched to the polygons that overlap it
 * or are within `LAND_PARCEL_RULES.titlesAroundMetres` of it. Without it,
 * neither has a category, and none lists a title.
 */
export const buildLandParcels = async (
  connection: DuckDBConnection,
  code: string,
  { ownership }: { ownership: boolean } = { ownership: false },
) => {
  const council = `(SELECT * FROM land_areas WHERE code = ${sqlString(code)})`;
  const roads = Object.keys(ROAD_HALF_WIDTHS);
  const roadHalfWidth = `CASE highway ${Object.entries(ROAD_HALF_WIDTHS)
    .map(
      ([highway, metres]) =>
        `WHEN ${sqlString(highway)} THEN ${String(metres)}`,
    )
    .join(" ")} END`;

  // The council's open land, and what is taken away from it, in metres.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE parcel_open AS
       SELECT t.osm_type, t.osm_id, t.name,
         CASE WHEN t.landuse IN (${list(OPEN_LAND.landuse)}) THEN 'landuse=' || t.landuse
           ELSE 'natural=' || t."natural" END AS tag,
         ST_MakeValid(${bng("t.geometry")}) AS geometry
       FROM osm_land_use t, ${council} c
       WHERE (${openLand}) AND ${inCouncil("t")}
         AND ST_Intersects(t.geometry, c.boundary)`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE parcel_roads AS
       SELECT geometry, ${bounds("geometry")}, half_width FROM (
         SELECT ${bng("t.geometry")} AS geometry, ${roadHalfWidth} AS half_width
         FROM osm_roads t, ${council} c
         WHERE t.highway IN (${list(roads)}) AND ${inCouncil("t")}
       )`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE parcel_removed AS
       SELECT geometry, ${bounds("geometry")} FROM (
         SELECT ST_Buffer(geometry, half_width) AS geometry FROM parcel_roads
         UNION ALL
         SELECT ${bng("t.geometry")} FROM osm_buildings t, ${council} c WHERE ${inCouncil("t")}
         UNION ALL
         SELECT CASE WHEN ST_Dimension(t.geometry) = 1
             THEN ST_Buffer(${bng("t.geometry")}, CASE WHEN t.waterway IN (${list(WIDE_WATERWAYS)}) THEN ${String(WATERWAY_HALF_WIDTHS.wide)} ELSE ${String(WATERWAY_HALF_WIDTHS.narrow)} END)
             ELSE ${bng("t.geometry")} END
         FROM osm_water t, ${council} c WHERE ${inCouncil("t")}
         UNION ALL
         SELECT ${bng("t.geometry")} FROM osm_land_use t, ${council} c
         WHERE (t.leisure IN (${list(PROTECTED_PARKS.leisure)}) OR t.landuse IN (${list(PROTECTED_PARKS.landuse)}))
           AND ${inCouncil("t")}
       )`,
  );

  // Contiguous open land inside the council's boundary, less what covers it.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE parcel_parts AS
       WITH joined AS (
         SELECT ST_Intersection(ST_Union_Agg(o.geometry), ${bng("any_value(c.boundary)")}) AS geometry
         FROM parcel_open o, ${council} c
       ),
       parts AS (SELECT ${polygonsOf("geometry")} AS geometry FROM joined)
       SELECT row_number() OVER () AS part, geometry, ${bounds("geometry")} FROM parts`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE parcel_pieces AS
       WITH covered AS (
         SELECT p.part, ST_Union_Agg(r.geometry) AS removed
         FROM parcel_parts p JOIN parcel_removed r
           ON ${near("p", "r")} AND ST_Intersects(p.geometry, r.geometry)
         GROUP BY p.part
       ),
       pieces AS (
         SELECT ${polygonsOf("CASE WHEN c.removed IS NULL THEN p.geometry ELSE ST_Difference(p.geometry, c.removed) END")} AS geometry
         FROM parcel_parts p LEFT JOIN covered c USING (part)
       )
       SELECT geometry, ST_Area(geometry) AS area_m2, ${bounds("geometry")}
       FROM pieces
       WHERE ST_Area(geometry) >= ${String(LAND_PARCEL_RULES.minimumAreaSquareMetres)}`,
  );
  // Numbered along a Hilbert curve, so every run numbers them the same way.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE parcel_shapes AS
       SELECT row_number() OVER (ORDER BY ST_Hilbert(${wgs84("ST_PointOnSurface(geometry)")}, ${ENGLAND_BOUNDS}), xmin, ymin) AS n, *
       FROM parcel_pieces`,
  );

  // What each is tagged from, in metres.
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE parcel_inspire AS
       SELECT inspire_id, ownership_category, geometry, ${bounds("geometry")} FROM (
         SELECT p.inspire_id,
           ${ownership ? "coalesce(t.ownership_category, 'other-registered')" : "NULL::VARCHAR"} AS ownership_category,
           ST_MakeValid(${bng("p.geometry")}) AS geometry
         FROM inspire_index_polygons p
         ${
           ownership
             ? `LEFT JOIN (
                  SELECT inspire_id,
                    CASE WHEN bool_or(ownership_category = 'council-or-public-body')
                      THEN 'council-or-public-body' ELSE 'company' END AS ownership_category
                  FROM inspire_titles GROUP BY inspire_id
                ) t USING (inspire_id)`
             : ""
         }
       )`,
  );
  await connection.run(
    `CREATE OR REPLACE TEMP TABLE parcel_constraints AS
       SELECT dataset, type, name, level, geometry, ${bounds("geometry")} FROM (
         ${PLANNING_CONSTRAINT_DATASETS.map(
           (dataset) =>
             `SELECT ${sqlString(dataset)} AS dataset, ${sqlString(CONSTRAINT_TYPES[dataset])} AS type,
                ${
                  dataset === "flood-risk-zone"
                    ? `'Flood zone ' || t."flood-risk-level"`
                    : `coalesce(NULLIF(t.name, ''), NULLIF(t.reference, ''), ${sqlString(dataset)})`
                } AS name,
                ${dataset === "flood-risk-zone" ? `TRY_CAST(t."flood-risk-level" AS INTEGER)` : "NULL::INTEGER"} AS level,
                ST_MakeValid(${bng("t.geometry")}) AS geometry
              FROM ${constraintsTable(dataset)} t, ${council} c WHERE ${inCouncil("t")}`,
         ).join(" UNION ALL ")}
       )`,
  );

  const {
    possiblyUnregisteredBelow,
    homesPerHectare,
    accessAndOpenSpace,
    titlesAroundMetres,
  } = LAND_PARCEL_RULES;
  const roadSearch = String(LAND_PARCEL_RULES.roadSearchMetres);
  // The titles matched to the polygons that overlap each, or are around it.
  const titles = ownership
    ? `SELECT s.n, list({
           title_number: t.title_number, property_address: t.property_address,
           proprietorship_category: t.proprietorship_category,
           ownership_category: t.ownership_category, dataset: t.dataset,
           source_date: t.source_date, matched_by: t.matched_by,
           inspire_id: CAST(t.inspire_id AS VARCHAR),
           distance_m: ST_Distance(s.geometry, i.geometry)
         }::${MATCHED_TITLE} ORDER BY ST_Distance(s.geometry, i.geometry), t.title_number) AS matched_titles
       FROM parcel_shapes s
       JOIN parcel_inspire i
         ON ${near("s", "i", titlesAroundMetres)}
         AND ST_DWithin(s.geometry, i.geometry, ${String(titlesAroundMetres)})
       JOIN inspire_titles t USING (inspire_id)
       GROUP BY s.n`
    : `SELECT NULL::BIGINT AS n, NULL::${MATCHED_TITLE}[] AS matched_titles WHERE false`;
  await connection.run(
    `CREATE OR REPLACE TABLE land_parcels AS
       WITH land AS (
         SELECT s.n, list(DISTINCT o.tag ORDER BY o.tag) AS land_use,
           min(o.name) FILTER (WHERE o.name IS NOT NULL AND o.name <> '') AS name
         FROM parcel_shapes s JOIN parcel_open o
           ON ST_Intersects(s.geometry, o.geometry)
           AND ST_Area(ST_Intersection(s.geometry, o.geometry)) > 0
         GROUP BY s.n
       ),
       inspire_overlaps AS (
         SELECT s.n, s.area_m2, i.inspire_id, i.ownership_category,
           ST_Intersection(s.geometry, i.geometry) AS overlap
         FROM parcel_shapes s JOIN parcel_inspire i
           ON ${near("s", "i")} AND ST_Intersects(s.geometry, i.geometry)
       ),
       inspire AS (
         SELECT n, least(1, ST_Area(ST_Union_Agg(overlap)) / any_value(area_m2)) AS coverage,
           list({inspire_id: CAST(inspire_id AS VARCHAR), share: least(1, ST_Area(overlap) / area_m2),
               ownership_category: ownership_category}
             ORDER BY ST_Area(overlap) DESC, inspire_id)
             FILTER (WHERE ST_Area(overlap) >= ${String(INSPIRE_MIN_OVERLAP_M2)}) AS polygons,
           arg_max(ownership_category, ST_Area(overlap)) AS largest_category
         FROM inspire_overlaps GROUP BY n
       ),
       titles AS (${titles}),
       constraints AS (
         SELECT s.n,
           list(DISTINCT {type: k.type, name: k.name} ORDER BY {type: k.type, name: k.name}) AS constraints,
           list(DISTINCT k.type ORDER BY k.type) AS constraint_types,
           max(k.level) AS flood_zone,
           bool_or(k.dataset = 'listed-building-outline') AS on_listed_building_outline
         FROM parcel_shapes s JOIN parcel_constraints k
           ON ${near("s", "k")} AND ST_Intersects(s.geometry, k.geometry)
           AND NOT ST_Touches(s.geometry, k.geometry)
         GROUP BY s.n
       ),
       roads AS (
         SELECT s.n, min(ST_Distance(s.geometry, r.geometry)) AS road_distance_m
         FROM parcel_shapes s JOIN parcel_roads r
           ON ${near("s", "r", LAND_PARCEL_RULES.roadSearchMetres)}
           AND ST_DWithin(s.geometry, r.geometry, ${roadSearch})
         GROUP BY s.n
       ),
       shaped AS (
         SELECT s.n, s.area_m2,
           ${wgs84("ST_PointOnSurface(s.geometry)")} AS point,
           ${wgs84(`ST_SimplifyPreserveTopology(s.geometry, ${String(SIMPLIFY_METRES)})`)} AS geometry
         FROM parcel_shapes s
       )
       SELECT ${sqlString(`${code}-`)} || s.n AS parcel_id, s.n,
         l.name, coalesce(l.land_use, []) AS land_use, s.area_m2,
         r.road_distance_m,
         coalesce(i.coverage, 0) AS inspire_coverage,
         coalesce(i.coverage, 0) < ${String(possiblyUnregisteredBelow)} AS possibly_unregistered,
         coalesce(i.polygons, []) AS inspire_polygons,
         ${
           ownership
             ? `CASE WHEN coalesce(i.coverage, 0) < ${String(possiblyUnregisteredBelow)}
                  THEN 'possibly-unregistered' ELSE i.largest_category END`
             : "NULL::VARCHAR"
         } AS ownership_category,
         coalesce(t.matched_titles, []) AS matched_titles,
         coalesce(k.constraints, []) AS constraints,
         coalesce(k.constraint_types, []) AS constraint_types,
         k.flood_zone,
         coalesce(k.on_listed_building_outline, false) AS on_listed_building_outline,
         CAST(floor(s.area_m2 / ${String(SQUARE_METRES_PER_HECTARE)} * (1 - ${String(accessAndOpenSpace)}) * ${String(homesPerHectare)}) AS INTEGER) AS estimated_homes,
         ST_X(s.point) AS lng, ST_Y(s.point) AS lat,
         ${bounds("s.geometry")}, s.geometry
       FROM shaped s
       LEFT JOIN land l USING (n)
       LEFT JOIN inspire i USING (n)
       LEFT JOIN constraints k USING (n)
       LEFT JOIN roads r USING (n)
       LEFT JOIN titles t USING (n)`,
  );
  for (const table of [
    "parcel_open",
    "parcel_roads",
    "parcel_removed",
    "parcel_parts",
    "parcel_pieces",
    "parcel_shapes",
    "parcel_inspire",
    "parcel_constraints",
  ]) {
    await connection.run(`DROP TABLE ${table}`);
  }
};

/** The order Land Parcels are written in: along a Hilbert curve, by their numbers. */
export const LAND_PARCELS_QUERY = `SELECT * EXCLUDE (n) FROM land_parcels ORDER BY n`;
