import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LAND_PARCEL_RULES,
  PLANNING_CONSTRAINT_DATASETS,
} from "@location-scout/shared";

import { sqlString } from "./duckdb";
import { LAND_PARCELS_QUERY, buildLandParcels } from "./land-parcels";
import { constraintsTable } from "./planning-constraints";

/*
 * A made-up council, a kilometre square in British National Grid near
 * Sutton-in-Ashfield, whose land shows each of the rules: a
 * shape is given in metres east and north of its south-west corner.
 */

const CODE = "E07000170";
const ORIGIN = { east: 450_000, north: 358_000 };

/** A rectangle, in metres from the council's corner, as WGS 84. */
const box = (x1: number, y1: number, x2: number, y2: number) =>
  wgs84(
    `POLYGON((${[
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1],
    ]
      .map(
        ([x = 0, y = 0]) =>
          `${String(ORIGIN.east + x)} ${String(ORIGIN.north + y)}`,
      )
      .join(", ")}))`,
  );

/** A line, in metres from the council's corner, as WGS 84. */
const line = (...points: [number, number][]) =>
  wgs84(
    `LINESTRING(${points
      .map(([x, y]) => `${String(ORIGIN.east + x)} ${String(ORIGIN.north + y)}`)
      .join(", ")})`,
  );

/** A point, in metres from the council's corner, as WGS 84. */
const point = (x: number, y: number) =>
  wgs84(`POINT(${String(ORIGIN.east + x)} ${String(ORIGIN.north + y)})`);

const wgs84 = (wkt: string) =>
  `ST_Transform(ST_GeomFromText(${sqlString(wkt)}), 'EPSG:27700', 'EPSG:4326', always_xy := true)`;

const bounds = `ST_XMin(geometry) AS xmin, ST_YMin(geometry) AS ymin,
  ST_XMax(geometry) AS xmax, ST_YMax(geometry) AS ymax`;

/** A table of rows, each a shape and its columns, as `prepareLandData` loads them. */
const table = async (
  connection: DuckDBConnection,
  name: string,
  columns: string,
  rows: readonly string[],
) => {
  await connection.run(
    `CREATE OR REPLACE TABLE ${name} AS
       SELECT *, ${bounds} FROM (
         ${rows.length > 0 ? rows.map((row) => `SELECT ${row}`).join(" UNION ALL ") : `SELECT ${columns} WHERE false`}
       )`,
  );
};

let connection: DuckDBConnection;

/** The Land Parcel with the point at `x`, `y` inside it, and its tags. */
const parcelAt = async (x: number, y: number) => {
  const rows = await connection.runAndReadAll(
    `SELECT parcel_id, name, land_use, round(area_m2) AS area_m2,
       round(road_distance_m, 1) AS road_distance_m,
       round(inspire_coverage, 3) AS inspire_coverage, possibly_unregistered,
       inspire_polygons, ownership_category, matched_titles, constraints,
       constraint_types, flood_zone, on_listed_building_outline, estimated_homes
     FROM (${LAND_PARCELS_QUERY})
     WHERE ST_Contains(geometry, ${point(x, y)})`,
  );
  const [found, ...others] = rows.getRowObjectsJson();
  expect(others).toEqual([]);
  return found;
};

beforeAll(async () => {
  const instance = await DuckDBInstance.create(":memory:", {
    autoinstall_known_extensions: "false",
  });
  connection = await instance.connect();
  await connection.run("LOAD spatial");

  const council = box(0, 0, 1000, 1000);
  await connection.run(
    `CREATE TABLE land_areas AS
       SELECT ${sqlString(CODE)} AS code, ${council} AS boundary, ${council} AS clip,
         ST_XMin(${council}) AS xmin, ST_YMin(${council}) AS ymin,
         ST_XMax(${council}) AS xmax, ST_YMax(${council}) AS ymax`,
  );

  const land = (
    id: number,
    tag: string,
    shape: string,
    name: string | null = null,
  ) => {
    const [key, value] = tag.split("=");
    const of = (k: string) =>
      key === k ? sqlString(value ?? "") : "NULL::VARCHAR";
    return `'way' AS osm_type, ${String(id)} AS osm_id, ${of("landuse")} AS landuse,
      ${of("natural")} AS "natural", ${of("leisure")} AS leisure, NULL::VARCHAR AS access,
      ${name ? sqlString(name) : "NULL::VARCHAR"} AS name, ${shape} AS geometry`;
  };
  await table(connection, "osm_land_use", "", [
    // Grass and farmland that overlap, which a road divides at x = 300.
    land(1, "landuse=grass", box(0, 0, 200, 100), "Kirkby Fields"),
    land(2, "landuse=farmland", box(150, 0, 400, 100)),
    // Scrub around a park, which is taken away.
    land(3, "natural=scrub", box(450, 450, 650, 650)),
    land(4, "leisure=park", box(500, 500, 600, 600)),
    // A meadow a stream crosses at y = 800.
    land(5, "landuse=meadow", box(0, 700, 200, 900)),
    // A sliver too small to be a Land Parcel.
    land(6, "landuse=grass", box(900, 0, 905, 10)),
    // Brownfield land across the council's boundary, far from any road.
    land(7, "landuse=brownfield", box(950, 300, 1050, 400)),
    // Land use that isn't open land.
    land(8, "landuse=residential", box(700, 100, 800, 200)),
  ]);
  await table(connection, "osm_buildings", "", [
    `'way' AS osm_type, 10 AS osm_id, 'house' AS building, NULL::VARCHAR AS name, ${box(50, 40, 60, 50)} AS geometry`,
  ]);
  await table(connection, "osm_roads", "", [
    `'way' AS osm_type, 20 AS osm_id, 'residential' AS highway, NULL::VARCHAR AS name, ${line([300, -50], [300, 150])} AS geometry`,
    // A footpath across the meadow divides nothing.
    `'way' AS osm_type, 21 AS osm_id, 'footway' AS highway, NULL::VARCHAR AS name, ${line([100, 650], [100, 950])} AS geometry`,
  ]);
  await table(connection, "osm_water", "", [
    `'way' AS osm_type, 30 AS osm_id, NULL::VARCHAR AS "natural", NULL::VARCHAR AS water, 'stream' AS waterway, NULL::VARCHAR AS landuse, NULL::VARCHAR AS name, ${line([-50, 800], [250, 800])} AS geometry`,
  ]);
  await table(connection, "inspire_index_polygons", "", [
    // A title covering the grass west of the road; none covers the farmland east of it.
    `1001 AS inspire_id, DATE '2020-01-01' AS valid_from, ${box(0, 0, 297, 100)} AS geometry`,
    // A title covering a quarter of the scrub.
    `1002 AS inspire_id, DATE '2020-01-01' AS valid_from, ${box(450, 450, 550, 550)} AS geometry`,
    // A title 10 m east of the farmland, beyond the conservation area's edge.
    `1003 AS inspire_id, DATE '2020-01-01' AS valid_from, ${box(410, 0, 450, 100)} AS geometry`,
    // A title covering the brownfield land.
    `1004 AS inspire_id, DATE '2020-01-01' AS valid_from, ${box(940, 290, 1000, 410)} AS geometry`,
  ]);
  // Titles from CCOD and OCOD matched to those polygons, as `matchCouncilTitles` writes them.
  const title = (
    inspireId: number,
    titleNumber: string,
    proprietorshipCategory: string,
    ownershipCategory: string,
    dataset: string,
  ) =>
    `SELECT ${String(inspireId)}::BIGINT AS inspire_id, ${sqlString(titleNumber)} AS title_number,
       ${sqlString(`${titleNumber} Kirkby Road, Kirkby-in-Ashfield`)} AS property_address,
       ${sqlString(proprietorshipCategory)} AS proprietorship_category,
       ${sqlString(ownershipCategory)} AS ownership_category, ${sqlString(dataset)} AS dataset,
       '2026-10-02' AS source_date, 'address' AS matched_by`;
  await connection.run(
    `CREATE TABLE inspire_titles AS ${[
      title(1001, "NT1", "Local Authority", "council-or-public-body", "ccod"),
      title(
        1002,
        "NT2",
        "Limited Company or Public Limited Company",
        "company",
        "ccod",
      ),
      title(1002, "NT3", "County Council", "council-or-public-body", "ccod"),
      title(
        1003,
        "NT4",
        "Limited Company or Public Limited Company",
        "company",
        "ocod",
      ),
    ].join(" UNION ALL ")}`,
  );
  const constraint = (
    entity: number,
    name: string,
    shape: string,
    level: string | null = null,
  ) =>
    `${String(entity)} AS entity, ${sqlString(name)} AS name, ${sqlString(String(entity))} AS reference,
     ${level ? sqlString(level) : "NULL::VARCHAR"} AS "flood-risk-level", ${shape} AS geometry`;
  const constraints: Record<string, string[]> = {
    "conservation-area": [
      constraint(41, "Kirkby Cross", box(400, 400, 700, 700)),
      // Beside the farmland east of the road, touching it.
      constraint(46, "Annesley Woodhouse", box(400, 0, 450, 100)),
    ],
    "listed-building": [constraint(42, "Church of St Wilfrid", point(20, 20))],
    "listed-building-outline": [
      constraint(43, "Annesley Hall", box(980, 350, 1020, 370)),
    ],
    "flood-risk-zone": [
      constraint(44, "", box(0, 600, 300, 1000), "2"),
      constraint(45, "", box(0, 600, 300, 750), "3"),
    ],
  };
  for (const dataset of PLANNING_CONSTRAINT_DATASETS) {
    await table(
      connection,
      constraintsTable(dataset),
      constraint(0, "", box(0, 0, 1, 1)),
      constraints[dataset] ?? [],
    );
  }

  await buildLandParcels(connection, CODE);
});

afterAll(() => {
  connection.closeSync();
});

describe("buildLandParcels", () => {
  it("joins open land where it overlaps, and parts it where a road crosses", async () => {
    const west = await parcelAt(100, 20);
    const east = await parcelAt(350, 50);

    expect(west).toMatchObject({
      name: "Kirkby Fields",
      land_use: ["landuse=farmland", "landuse=grass"],
      // 297 m by 100 m, less the house.
      area_m2: 29_700 - 100,
    });
    expect(east).toMatchObject({
      land_use: ["landuse=farmland"],
      area_m2: 9_700,
    });
    expect(west?.parcel_id).not.toBe(east?.parcel_id);
  });

  it("takes away buildings, roads, water and parks", async () => {
    expect(await parcelAt(55, 45)).toBeUndefined();
    expect(await parcelAt(300, 50)).toBeUndefined();
    expect(await parcelAt(100, 800)).toBeUndefined();
    expect(await parcelAt(550, 550)).toBeUndefined();
    expect(await parcelAt(475, 475)).toMatchObject({
      area_m2: 40_000 - 10_000,
    });
    // The stream parts the meadow; the footpath across it doesn't.
    expect(await parcelAt(50, 750)).toMatchObject({ area_m2: 200 * 99 });
    expect(await parcelAt(50, 850)).toMatchObject({ area_m2: 200 * 99 });
    expect((await parcelAt(50, 750))?.parcel_id).toBe(
      (await parcelAt(150, 750))?.parcel_id,
    );
  });

  it("keeps only open land, inside the council, of at least 100 m²", async () => {
    expect(await parcelAt(750, 150)).toBeUndefined();
    expect(await parcelAt(902, 5)).toBeUndefined();
    expect(await parcelAt(975, 320)).toMatchObject({ area_m2: 5_000 });
    expect(await parcelAt(1025, 320)).toBeUndefined();
    expect(LAND_PARCEL_RULES.minimumAreaSquareMetres).toBe(100);
  });

  it("is Possibly Unregistered where INSPIRE Index Polygons cover less than half of it", async () => {
    expect(await parcelAt(100, 20)).toMatchObject({
      inspire_coverage: 1,
      possibly_unregistered: false,
      inspire_polygons: [
        { inspire_id: "1001", share: expect.closeTo(1, 6) as unknown },
      ],
    });
    expect(await parcelAt(350, 50)).toMatchObject({
      inspire_coverage: 0,
      possibly_unregistered: true,
      inspire_polygons: [],
    });
    // The title covers 7,500 m² of its 30,000: the rest is in the park.
    expect(await parcelAt(475, 475)).toMatchObject({
      inspire_coverage: 0.25,
      possibly_unregistered: true,
      inspire_polygons: [{ inspire_id: "1002" }],
    });
  });

  it("tags the Planning Constraints each intersects, its highest flood zone, and whether it is on a listed building's outline", async () => {
    expect(await parcelAt(100, 20)).toMatchObject({
      constraints: [{ type: "listed-building", name: "Church of St Wilfrid" }],
      constraint_types: ["listed-building"],
      flood_zone: null,
      on_listed_building_outline: false,
    });
    expect(await parcelAt(475, 475)).toMatchObject({
      constraints: [{ type: "conservation-area", name: "Kirkby Cross" }],
    });
    expect(await parcelAt(50, 750)).toMatchObject({
      constraints: [
        { type: "flood-zone", name: "Flood zone 2" },
        { type: "flood-zone", name: "Flood zone 3" },
      ],
      constraint_types: ["flood-zone"],
      flood_zone: 3,
    });
    expect(await parcelAt(50, 850)).toMatchObject({ flood_zone: 2 });
    expect(await parcelAt(975, 320)).toMatchObject({
      constraints: [{ type: "listed-building", name: "Annesley Hall" }],
      on_listed_building_outline: true,
    });
    // Land beside a conservation area, touching it, is not in it.
    expect(await parcelAt(350, 50)).toMatchObject({ constraints: [] });
  });

  it("measures how far the nearest road is, up to 500 m, but not footpaths", async () => {
    expect(await parcelAt(100, 20)).toMatchObject({ road_distance_m: 3 });
    expect(await parcelAt(475, 475)).toMatchObject({
      road_distance_m: expect.closeTo(Math.hypot(150, 300), 0) as unknown,
    });
    expect(await parcelAt(50, 750)).toMatchObject({ road_distance_m: null });
    expect(await parcelAt(975, 320)).toMatchObject({ road_distance_m: null });
  });

  it("estimates its capacity at 30 homes a hectare, after 40% for access and open space", async () => {
    // 2.96 ha, of which 60% at 30 a hectare is 53.28.
    expect(await parcelAt(100, 20)).toMatchObject({ estimated_homes: 53 });
    expect(await parcelAt(975, 320)).toMatchObject({ estimated_homes: 9 });
  });

  it("gives no Ownership Category, and lists no title, without CCOD and OCOD", async () => {
    expect(await parcelAt(100, 20)).toMatchObject({
      ownership_category: null,
      matched_titles: [],
      inspire_polygons: [{ inspire_id: "1001", ownership_category: null }],
    });
    expect(await parcelAt(350, 50)).toMatchObject({
      possibly_unregistered: true,
      ownership_category: null,
    });
  });
});

describe("buildLandParcels with CCOD's and OCOD's titles", () => {
  beforeAll(async () => {
    await buildLandParcels(connection, CODE, { ownership: true });
  });

  it("is in the category of the polygon that covers most of it, with the titles matched to it", async () => {
    expect(await parcelAt(100, 20)).toMatchObject({
      ownership_category: "council-or-public-body",
      inspire_polygons: [
        { inspire_id: "1001", ownership_category: "council-or-public-body" },
      ],
      matched_titles: [
        {
          title_number: "NT1",
          property_address: "NT1 Kirkby Road, Kirkby-in-Ashfield",
          proprietorship_category: "Local Authority",
          ownership_category: "council-or-public-body",
          dataset: "ccod",
          source_date: "2026-10-02",
          matched_by: "address",
          inspire_id: "1001",
          distance_m: 0,
        },
      ],
    });
  });

  it("is other registered where INSPIRE Index Polygons cover most of it, but no title is matched to them", async () => {
    expect(await parcelAt(975, 320)).toMatchObject({
      possibly_unregistered: false,
      ownership_category: "other-registered",
      inspire_polygons: [
        { inspire_id: "1004", ownership_category: "other-registered" },
      ],
      matched_titles: [],
    });
  });

  it("is Possibly Unregistered where they cover less than half of it, whatever is matched to them", async () => {
    // A council's and a company's titles are matched to the polygon that
    // covers a quarter of the scrub: the polygon is the council's.
    const scrub = await parcelAt(475, 475);
    expect(scrub).toMatchObject({
      ownership_category: "possibly-unregistered",
      inspire_polygons: [
        { inspire_id: "1002", ownership_category: "council-or-public-body" },
      ],
    });
    expect(
      (scrub?.matched_titles as { title_number: string }[]).map(
        ({ title_number }) => title_number,
      ),
    ).toEqual(["NT2", "NT3"]);
    expect(await parcelAt(50, 750)).toMatchObject({
      ownership_category: "possibly-unregistered",
      matched_titles: [],
    });
  });

  it("lists the titles matched to polygons within 25 m of it, the nearest first, with how far they are", async () => {
    expect(LAND_PARCEL_RULES.titlesAroundMetres).toBe(25);
    // The council's polygon is across the road, 6 m away; the company's 10 m.
    expect(await parcelAt(350, 50)).toMatchObject({
      ownership_category: "possibly-unregistered",
      inspire_polygons: [],
      matched_titles: [
        {
          title_number: "NT1",
          inspire_id: "1001",
          distance_m: expect.closeTo(6, 3) as unknown,
        },
        {
          title_number: "NT4",
          ownership_category: "company",
          dataset: "ocod",
          inspire_id: "1003",
          distance_m: expect.closeTo(10, 3) as unknown,
        },
      ],
    });
  });
});
