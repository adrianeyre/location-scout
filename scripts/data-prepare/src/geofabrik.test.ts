import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DuckDBConnection } from "@duckdb/node-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDuckDb } from "./duckdb";
import {
  GEOFABRIK,
  chooseExtracts,
  downloadExtract,
  loadGeofabrikIndex,
  loadOsm,
} from "./geofabrik";
import { osmPbf } from "./record-land-fixtures";
import { RECORDED_COUNCIL_BOUNDARIES } from "./recorded-boundaries";
import { recordedSources } from "./recorded-sources";

let connection: DuckDBConnection;
let workDir: string;

beforeEach(async () => {
  connection = await openDuckDb();
  workDir = await mkdtemp(join(tmpdir(), "location-scout-geofabrik-"));
});

afterEach(async () => {
  connection.closeSync();
  await rm(workDir, { recursive: true, force: true });
});

const rows = async (sql: string) =>
  (await connection.runAndReadAll(sql)).getRowObjectsJson();

/** The table `land_areas` of the recorded boundaries, as `prepareLandData` makes it, and a council `inside` Nottinghamshire's outline. */
const loadLandAreas = async () => {
  const boundaries = join(workDir, "boundaries.geojson");
  await writeFile(boundaries, JSON.stringify(RECORDED_COUNCIL_BOUNDARIES));
  await connection.run(
    `CREATE TABLE land_areas AS
       SELECT LAD26CD AS code, geom::GEOMETRY AS boundary FROM ST_Read($1)
       WHERE starts_with(LAD26CD, 'E')
       UNION ALL
       SELECT 'inside', ST_Buffer(ST_Point(-1.15, 53.0), 0.01)`,
    [boundaries],
  );
};

const ids = (extracts: { id: string }[] | undefined) =>
  extracts?.map(({ id }) => id);

describe("chooseExtracts", () => {
  it("clips a council from the county's extract that covers most of it, and each that covers a hectare more of it, as Derbyshire's does of the strips of Ashfield Nottinghamshire's outline leaves out", async () => {
    await loadGeofabrikIndex(connection, recordedSources, workDir);
    await loadLandAreas();

    const chosen = await chooseExtracts(connection);

    expect(ids(chosen.get("E07000170"))).toEqual([
      "nottinghamshire",
      "derbyshire",
    ]);
    expect(ids(chosen.get("E07000174"))).toEqual([
      "nottinghamshire",
      "derbyshire",
    ]);
    expect(chosen.get("E07000170")?.[0]).toEqual({
      id: "nottinghamshire",
      name: "Nottinghamshire",
      url: "https://download.geofabrik.de/europe/united-kingdom/england/nottinghamshire-latest.osm.pbf",
    });
  });

  it("clips a council inside one county's outline from that county's extract alone", async () => {
    await loadGeofabrikIndex(connection, recordedSources, workDir);
    await loadLandAreas();

    expect(ids((await chooseExtracts(connection)).get("inside"))).toEqual([
      "nottinghamshire",
    ]);
  });

  it("clips a council from England's extract if Geofabrik lists no counties", async () => {
    const index = JSON.parse(
      await readFile(
        new URL("./fixtures/geofabrik-index.json", import.meta.url),
        "utf8",
      ),
    ) as { features: { properties: { id: string } }[] };
    const englandOnly = ((url: string, init?: RequestInit) =>
      url === GEOFABRIK.index
        ? Promise.resolve(
            Response.json({
              ...index,
              features: index.features.filter(
                ({ properties }) => properties.id === "england",
              ),
            }),
          )
        : recordedSources(url, init)) as typeof fetch;
    await loadGeofabrikIndex(connection, englandOnly, workDir);
    await loadLandAreas();

    expect(ids((await chooseExtracts(connection)).get("E07000170"))).toEqual([
      "england",
    ]);
  });

  it("refuses an index that lists no extracts", async () => {
    const empty = (() =>
      Promise.resolve(Response.json({ features: [] }))) as typeof fetch;

    await expect(
      loadGeofabrikIndex(connection, empty, workDir),
    ).rejects.toThrow(/lists no extracts. Its layout may have changed/);
  });
});

describe("downloadExtract", () => {
  it("follows the -latest link to the file named for its day, and gives that day", async () => {
    const file = join(workDir, "nottinghamshire.osm.pbf");

    const downloaded = await downloadExtract(
      recordedSources,
      {
        id: "nottinghamshire",
        name: "Nottinghamshire",
        url: "https://download.geofabrik.de/europe/united-kingdom/england/nottinghamshire-latest.osm.pbf",
      },
      file,
    );

    expect(downloaded).toEqual({
      url: "https://download.geofabrik.de/europe/united-kingdom/england/nottinghamshire-261008.osm.pbf",
      sourceDate: "2026-10-08",
    });
    expect(await readFile(file)).toEqual(
      await readFile(
        new URL(
          "./fixtures/geofabrik-nottinghamshire.osm.pbf",
          import.meta.url,
        ),
      ),
    );
  });

  it("refuses a -latest link that doesn't redirect to a dated file", async () => {
    const notRedirected = (() =>
      Promise.resolve(new Response("pbf"))) as typeof fetch;

    await expect(
      downloadExtract(
        notRedirected,
        {
          id: "x",
          name: "X",
          url: "https://download.geofabrik.de/x-latest.osm.pbf",
        },
        join(workDir, "x.osm.pbf"),
      ),
    ).rejects.toThrow(
      /answered 200 for .*x-latest.osm.pbf, not the file it stands for/,
    );
  });
});

describe("loadOsm", () => {
  /** A point `east` and `north` hundredths of a degree from near Sutton Parkway. */
  const node = (id: number, east: number, north: number) => ({
    id,
    lon: -1.25 + east / 100,
    lat: 53.11 + north / 100,
  });
  const square = (first: number, west: number, south: number, size: number) => [
    node(first, west, south),
    node(first + 1, west + size, south),
    node(first + 2, west + size, south + size),
    node(first + 3, west, south + size),
  ];
  const ring = (first: number) => [
    first,
    first + 1,
    first + 2,
    first + 3,
    first,
  ];

  /** One extract, with a meadow with a hole, a building, a road, a stream and what isn't kept. */
  const FIRST = osmPbf(
    [
      ...square(1, 0, 0, 4),
      ...square(5, 1, 1, 1),
      ...square(9, 3.1, 3.1, 0.5),
      ...square(13, 5, 0, 0.5),
      node(17, 6, 0),
      node(18, 7, 1),
      node(19, 6, 2),
    ],
    [
      { id: 100, tags: [], refs: ring(1) },
      { id: 101, tags: [], refs: ring(5) },
      { id: 102, tags: [["building", "yes"]], refs: ring(9) },
      {
        id: 103,
        tags: [
          ["highway", "residential"],
          ["name", "Station Road"],
        ],
        refs: [17, 18],
      },
      { id: 104, tags: [["waterway", "stream"]], refs: [18, 19] },
      { id: 105, tags: [["landuse", "grass"]], refs: [17, 18, 19] },
      { id: 106, tags: [["building", "no"]], refs: ring(13) },
      { id: 107, tags: [["power", "line"]], refs: [17, 19] },
    ],
    [
      {
        id: 200,
        tags: [
          ["type", "multipolygon"],
          ["landuse", "meadow"],
        ],
        members: [
          { id: 100, type: "way", role: "outer" },
          { id: 101, type: "way", role: "inner" },
        ],
      },
    ],
  );

  /** A neighbouring extract, with the same building and a pond of its own. */
  const SECOND = osmPbf(
    [...square(9, 3.1, 3.1, 0.5), ...square(20, 8, 0, 1)],
    [
      { id: 102, tags: [["building", "yes"]], refs: ring(9) },
      { id: 108, tags: [["natural", "water"]], refs: ring(20) },
    ],
    [],
  );

  const load = async () => {
    const first = join(workDir, "first.osm.pbf");
    const second = join(workDir, "second.osm.pbf");
    await writeFile(first, FIRST);
    await writeFile(second, SECOND);
    await loadOsm(connection, [first, second]);
  };

  it("builds a multipolygon's area from its member ways, its inner ring a hole, and keeps natural areas as land use too", async () => {
    await load();

    expect(
      await rows(
        `SELECT osm_type, osm_id, landuse, "natural", ST_NumInteriorRings(geometry) AS holes,
           round(ST_Area(geometry) * 10000) AS area
         FROM osm_land_use ORDER BY osm_type, osm_id`,
      ),
    ).toEqual([
      {
        osm_type: "relation",
        osm_id: "200",
        landuse: "meadow",
        natural: null,
        holes: 1,
        area: 15,
      },
      {
        osm_type: "way",
        osm_id: "108",
        landuse: null,
        natural: "water",
        holes: 0,
        area: 1,
      },
    ]);
  });

  it("keeps a building that two extracts both have once, and leaves out building=no", async () => {
    await load();

    expect(
      await rows("SELECT osm_type, osm_id, building FROM osm_buildings"),
    ).toEqual([{ osm_type: "way", osm_id: "102", building: "yes" }]);
  });

  it("keeps roads and waterways as lines, and water as areas, from either extract", async () => {
    await load();

    expect(
      await rows(
        "SELECT osm_id, highway, name, ST_GeometryType(geometry) AS type FROM osm_roads",
      ),
    ).toEqual([
      {
        osm_id: "103",
        highway: "residential",
        name: "Station Road",
        type: "LINESTRING",
      },
    ]);
    expect(
      await rows(
        `SELECT osm_id, "natural", waterway, ST_GeometryType(geometry) AS type
         FROM osm_water ORDER BY osm_id`,
      ),
    ).toEqual([
      { osm_id: "104", natural: null, waterway: "stream", type: "LINESTRING" },
      { osm_id: "108", natural: "water", waterway: null, type: "POLYGON" },
    ]);
  });

  it("leaves out a multipolygon GEOS can build no area from, as Hartshorne Wood's ways in Derbyshire's extract are mapped, and says how many it left out", async () => {
    const derbyshire = fileURLToPath(
      new URL("./fixtures/geofabrik-derbyshire.osm.pbf", import.meta.url),
    );

    expect(await loadOsm(connection, [derbyshire])).toEqual({ unbuilt: 1 });
    expect(
      await rows(
        "SELECT count(*) AS n FROM osm_land_use WHERE osm_id = 18670512",
      ),
    ).toEqual([{ n: "0" }]);
  });

  it("gives each shape its bounds", async () => {
    await load();

    expect(
      await rows(
        "SELECT round(xmin, 4) AS xmin, round(ymin, 4) AS ymin, round(xmax, 4) AS xmax, round(ymax, 4) AS ymax FROM osm_buildings",
      ),
    ).toEqual([{ xmin: -1.219, ymin: 53.141, xmax: -1.214, ymax: 53.146 }]);
  });
});
