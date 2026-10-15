import { fileURLToPath } from "node:url";

import type { DuckDBConnection } from "@duckdb/node-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDuckDb } from "./duckdb";
import { RECORDED_BOXES } from "./record-land-fixtures";
import {
  knownNames,
  loadOsmAddresses,
  loadTitles,
  matchTitles,
  registerNormalisers,
  type Title,
} from "./title-matching";

let connection: DuckDBConnection;

beforeEach(async () => {
  connection = await openDuckDb();
  await registerNormalisers(connection);
});

afterEach(() => {
  connection.closeSync();
});

const rows = async (sql: string) =>
  (await connection.runAndReadAll(sql)).getRowObjectsJson();

/** A square in British National Grid, from its south-west corner. */
const square = (x: number, y: number, size = 20) =>
  `ST_GeomFromText('POLYGON((${String(x)} ${String(y)}, ${String(x + size)} ${String(y)}, ${String(x + size)} ${String(y + size)}, ${String(x)} ${String(y + size)}, ${String(x)} ${String(y)}))')`;

const point = (x: number, y: number) => `ST_Point(${String(x)}, ${String(y)})`;

/**
 * A small made-up place, in metres: High Street runs east to west at
 * y = 25 between four INSPIRE Index Polygons, two south of it (1 and 2,
 * numbers 12 and 14) and two north (3 and 4), with NG17 1AA's point in 4.
 * Lammas Leisure Centre is mapped as an area around polygon 5, away from
 * the street, and NG1 1AA's point is 10 km off.
 */
const makePlace = async () => {
  await connection.run(
    `CREATE TABLE inspire AS SELECT inspire_id::BIGINT AS inspire_id, geometry FROM (VALUES
       (1, ${square(0, 0)}), (2, ${square(20, 0)}),
       (3, ${square(0, 30)}), (4, ${square(20, 30)}),
       (5, ${square(100, 0)})
     ) t(inspire_id, geometry)`,
  );
  await connection.run(
    `CREATE TABLE osm_addresses AS SELECT * FROM (VALUES
       ('node', 1, '12', 'HIGH STREET', 'NG17 1AA', NULL::VARCHAR, ${point(10, 10)}),
       ('node', 2, '14', 'HIGH STREET', NULL, NULL, ${point(30, 10)})
     ) t(osm_type, osm_id, housenumber, street, postcode, housename, point)`,
  );
  await connection.run(
    `CREATE TABLE osm_named AS SELECT * FROM (VALUES
       ('way', 3, 'LAMMAS LEISURE CENTRE', ${point(110, 10)}, ${square(95, -5, 30)})
     ) t(osm_type, osm_id, name, point, area)`,
  );
  await connection.run(
    `CREATE TABLE osm_streets AS SELECT * FROM (VALUES
       (4, 'HIGH STREET', ST_GeomFromText('LINESTRING(-10 25, 50 25)'))
     ) t(osm_id, street, geometry)`,
  );
  await connection.run(
    `CREATE TABLE osm_places AS SELECT * FROM (VALUES ('SUTTON IN ASHFIELD')) t(name)`,
  );
  await connection.run(
    `CREATE TABLE postcodes AS SELECT * FROM (VALUES
       ('NG17 1AA', ${point(30, 40)}), ('NG1 1AA', ${point(10_000, 10_000)})
     ) t(postcode, geometry)`,
  );
};

const title = (
  titleNumber: string,
  propertyAddress: string,
  postcode: string | null,
  truth: Title["truth"] = null,
): Title => ({
  titleNumber,
  tenure: "Freehold",
  propertyAddress,
  postcode,
  category: "Limited Company or Public Limited Company",
  truth,
});

const match = async (titles: readonly Title[]) => {
  await loadTitles(connection, titles, await knownNames(connection));
  await matchTitles(connection);
  return rows(
    `SELECT title_number, step, candidates, inspire_id, registered, truth_among,
       distance_m
     FROM title_matches ORDER BY title_number`,
  );
};

describe("matchTitles", () => {
  it("places a postal address at the OpenStreetMap address with its number and street", async () => {
    await makePlace();

    expect(
      await match([
        title("T1", "12 High Street, Sutton-in-Ashfield", "NG17 1AA", {
          x: 10,
          y: 10,
        }),
        title("T2", "14 High Street", null),
      ]),
    ).toEqual([
      {
        title_number: "T1",
        step: "address",
        candidates: "1",
        inspire_id: "1",
        registered: true,
        truth_among: true,
        distance_m: 0,
      },
      expect.objectContaining({
        title_number: "T2",
        step: "address",
        inspire_id: "2",
      }),
    ]);
  });

  it("places a named site at the polygons mostly inside its area", async () => {
    await makePlace();

    expect(
      await match([title("T1", "Lammas Leisure Centre", "NG17 1AA")]),
    ).toEqual([
      expect.objectContaining({
        step: "named",
        candidates: "1",
        inspire_id: "5",
      }),
    ]);
  });

  it("finds land beside a street on the side it says, ambiguous when there are several", async () => {
    await makePlace();

    const [north] = await match([
      title("T1", "Land on the north side of High Street", null, {
        x: 30,
        y: 40,
      }),
    ]);
    expect(north).toMatchObject({
      step: "street",
      candidates: "2",
      inspire_id: null,
      truth_among: true,
    });
    const candidates = await rows(
      "SELECT inspire_id FROM title_candidates ORDER BY inspire_id",
    );
    expect(candidates).toEqual([{ inspire_id: "3" }, { inspire_id: "4" }]);
  });

  it("falls back to the polygon its postcode's point is in", async () => {
    await makePlace();

    expect(await match([title("T1", "Land, Sutton", "NG17 1AA")])).toEqual([
      expect.objectContaining({
        step: "postcode",
        candidates: "1",
        inspire_id: "4",
      }),
    ]);
  });

  it("looks only near the title's postcode, and finds nothing when nothing is near", async () => {
    await makePlace();

    expect(
      await match([title("T1", "12 High Street", "NG1 1AA", { x: 10, y: 10 })]),
    ).toEqual([
      expect.objectContaining({
        step: null,
        candidates: "0",
        inspire_id: null,
        registered: true,
        truth_among: false,
      }),
    ]);
  });

  it("measures how far a wrong match is from where the title truly is", async () => {
    await makePlace();

    const [wrong] = await match([
      title("T1", "Land, Sutton", "NG17 1AA", { x: 10, y: 10 }),
    ]);
    expect(wrong).toMatchObject({ step: "postcode", inspire_id: "4" });
    expect(wrong?.distance_m).toBeCloseTo(Math.hypot(10, 20));
  });
});

describe("loadOsmAddresses", () => {
  it("reads the recorded extracts' named features and streets, normalised, in British National Grid", async () => {
    const fixture = (name: string) =>
      fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
    const [west, south, east, north] = RECORDED_BOXES.suttonParkway;

    await loadOsmAddresses(
      connection,
      [
        fixture("geofabrik-nottinghamshire.osm.pbf"),
        fixture("geofabrik-derbyshire.osm.pbf"),
      ],
      [west - 0.1, south - 0.1, east + 0.1, north + 0.1],
    );

    const streets = await rows(
      "SELECT DISTINCT street FROM osm_streets ORDER BY street",
    );
    expect(streets).toContainEqual({ street: "LOWMOOR ROAD" });
    expect(streets).toContainEqual({ street: "JULIAS WAY" });
    const [bounds] = await rows(
      `SELECT min(ST_X(point)) AS west, max(ST_Y(point)) AS north FROM osm_named`,
    );
    // Sutton-in-Ashfield is about 450 km east and 360 km north of the grid's origin.
    expect(Number(bounds?.west)).toBeGreaterThan(440_000);
    expect(Number(bounds?.north)).toBeLessThan(370_000);
  });
});
