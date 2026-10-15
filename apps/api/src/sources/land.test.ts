import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_LAND_FILTERS,
  LAND_LIST_LIMIT,
  LAND_PARCELS_DATASET,
  milesToMetres,
  type LandFilters,
  type OwnershipCategory,
  type PreparedManifest,
  type SearchArea,
} from "@location-scout/shared";

import {
  NOTHING_PREPARED,
  PREPARED_DATA_FIXTURE,
  PREPARED_DATA_FIXTURE_DIR,
} from "../testing/app";
import { createSourceCaller } from "./data-source";
import {
  DEFAULT_LAND_QUERY,
  landOpportunities,
  landParcel,
  readLandParcel,
  type LandQuery,
} from "./land";
import { openPreparedData, type PreparedData } from "./prepared-data";
import { noNetwork } from "../testing/fetch-stubs";

const ASHFIELD = { code: "E07000170", name: "Ashfield" };
const MANSFIELD = { code: "E07000174", name: "Mansfield" };

/** Sutton Parkway, in Ashfield, where the prepared-data fixture has land. */
const SUTTON_PARKWAY = { lat: 53.1145, lng: -1.246 };

const searchArea = (
  location = SUTTON_PARKWAY,
  miles: 0.25 | 0.5 | 1 = 0.25,
): SearchArea => ({
  location,
  searchRadius: { miles, metres: milesToMetres(miles) },
});

const callSource = () => createSourceCaller({ fetch: noNetwork() });

/** A Land Parcel made up for a test: a square, `east` and `north` metres from Sutton Parkway. */
interface MadeUpParcel {
  n: number;
  east: number;
  north: number;
  acres: number;
  road: number | null;
  coverage?: number;
  floodZone?: 2 | 3 | null;
  constraints?: { type: string; name: string }[];
  onListedBuildingOutline?: boolean;
  /** Its Ownership Category, if not other registered or Possibly Unregistered by its coverage. */
  ownership?: OwnershipCategory | null;
}

/** A title matched to the INSPIRE Index Polygon a made-up parcel is in, for its Ownership Category. */
const titleOf = (parcel: MadeUpParcel, category: string) =>
  `{'title_number': 'ZZ10000${String(parcel.n)}',
    'property_address': ${sql(`Unit ${String(parcel.n)}, Lowmoor Business Park, Kirkby-in-Ashfield`)},
    'proprietorship_category': ${sql(category === "company" ? "Limited Company or Public Limited Company" : "Local Authority")},
    'ownership_category': ${sql(category)}, 'dataset': 'ccod', 'source_date': '2026-10-02',
    'matched_by': 'address', 'inspire_id': '${String(64_000_000 + parcel.n)}', 'distance_m': 0::DOUBLE}`;

/** A matched title, as a Land Parcels file holds it. */
const MATCHED_TITLE =
  "STRUCT(title_number VARCHAR, property_address VARCHAR, proprietorship_category VARCHAR, ownership_category VARCHAR, dataset VARCHAR, source_date VARCHAR, matched_by VARCHAR, inspire_id VARCHAR, distance_m DOUBLE)";

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** The made-up parcels as rows of a Land Parcels file, as `pnpm data:prepare` writes them. */
const parcelRows = (parcels: readonly MadeUpParcel[]) =>
  parcels
    .map((parcel) => {
      const side = Math.sqrt(parcel.acres * 4046.8564224);
      const coverage = parcel.coverage ?? 1;
      const constraints = parcel.constraints ?? [];
      const structs = constraints
        .map(({ type, name }) => `{'type': ${sql(type)}, 'name': ${sql(name)}}`)
        .join(", ");
      const types = [...new Set(constraints.map(({ type }) => type))]
        .map(sql)
        .join(", ");
      const ownership =
        parcel.ownership === undefined
          ? coverage < 0.5
            ? "possibly-unregistered"
            : "other-registered"
          : parcel.ownership;
      const polygonCategory =
        ownership === "company" || ownership === "council-or-public-body"
          ? ownership
          : ownership === null
            ? null
            : "other-registered";
      return `SELECT ${String(parcel.n)} AS n, ${String(parcel.east)} AS east, ${String(parcel.north)} AS north,
        ${String(side)} AS side, ${String(side * side)} AS area_m2,
        ${parcel.road === null ? "NULL" : String(parcel.road)}::DOUBLE AS road_distance_m,
        ${String(coverage)}::DOUBLE AS inspire_coverage,
        ${coverage < 0.5 ? "true" : "false"} AS possibly_unregistered,
        ${coverage > 0 ? `[{'inspire_id': '${String(64_000_000 + parcel.n)}', 'share': ${String(coverage)}::DOUBLE, 'ownership_category': ${polygonCategory ? sql(polygonCategory) : "NULL"}}]` : "[]"}::STRUCT(inspire_id VARCHAR, share DOUBLE, ownership_category VARCHAR)[] AS inspire_polygons,
        ${ownership ? sql(ownership) : "NULL"}::VARCHAR AS ownership_category,
        [${ownership === "company" || ownership === "council-or-public-body" ? titleOf(parcel, ownership) : ""}]::${MATCHED_TITLE}[] AS matched_titles,
        [${structs}]::STRUCT(type VARCHAR, name VARCHAR)[] AS constraints,
        [${types}]::VARCHAR[] AS constraint_types,
        ${parcel.floodZone ? String(parcel.floodZone) : "NULL"}::INTEGER AS flood_zone,
        ${parcel.onListedBuildingOutline ? "true" : "false"} AS on_listed_building_outline`;
    })
    .join(" UNION ALL ");

/**
 * Writes made-up parcels as Ashfield's Land Parcels, as `pnpm data:prepare`
 * would: those listed, or the rows of a query with their columns.
 */
const writeParcels = async (
  file: string,
  parcels: readonly MadeUpParcel[] | string,
) => {
  const instance = await DuckDBInstance.create(":memory:", {
    autoinstall_known_extensions: "false",
  });
  const connection = await instance.connect();
  try {
    await connection.run("LOAD spatial");
    const { lat, lng } = SUTTON_PARKWAY;
    await connection.run(
      `COPY (
         WITH made AS (${typeof parcels === "string" ? parcels : parcelRows(parcels)}),
         origin AS (SELECT ST_Transform(ST_Point(${String(lng)}, ${String(lat)}), 'EPSG:4326', 'EPSG:27700', always_xy := true) AS p),
         shaped AS (
           SELECT m.*, ST_Transform(ST_MakeEnvelope(
               ST_X(o.p) + m.east - m.side / 2, ST_Y(o.p) + m.north - m.side / 2,
               ST_X(o.p) + m.east + m.side / 2, ST_Y(o.p) + m.north + m.side / 2),
             'EPSG:27700', 'EPSG:4326', always_xy := true) AS geometry
           FROM made m, origin o
         )
         SELECT 'E07000170-' || n AS parcel_id, NULL::VARCHAR AS name,
           ['landuse=grass'] AS land_use, area_m2, road_distance_m,
           inspire_coverage, possibly_unregistered, inspire_polygons,
           ownership_category, matched_titles,
           constraints, constraint_types, flood_zone, on_listed_building_outline,
           CAST(floor(area_m2 / 10000 * 0.6 * 30) AS INTEGER) AS estimated_homes,
           ST_Y(ST_Centroid(geometry)) AS lat, ST_X(ST_Centroid(geometry)) AS lng,
           ST_XMin(geometry) AS xmin, ST_YMin(geometry) AS ymin,
           ST_XMax(geometry) AS xmax, ST_YMax(geometry) AS ymax, geometry
         FROM shaped ORDER BY n
       ) TO ${sql(file)} (FORMAT parquet)`,
    );
  } finally {
    connection.closeSync();
  }
};

/**
 * Land Parcels in and around Sutton Parkway's 0.25 mile Search Area, each
 * meeting FR-5.3's default filters but for one way it doesn't.
 */
const PARCELS: MadeUpParcel[] = [
  { n: 1, east: 0, north: 150, acres: 1, road: 10 },
  { n: 2, east: 150, north: 0, acres: 0.05, road: 5 },
  { n: 3, east: -150, north: 0, acres: 5, road: 120 },
  { n: 4, east: 0, north: -200, acres: 2, road: null },
  {
    n: 5,
    east: 200,
    north: 200,
    acres: 3,
    road: 20,
    floodZone: 3,
    constraints: [{ type: "flood-zone", name: "Flood zone 3" }],
  },
  {
    n: 6,
    east: -200,
    north: 200,
    acres: 1.5,
    road: 30,
    floodZone: 2,
    constraints: [{ type: "flood-zone", name: "Flood zone 2" }],
    ownership: "company",
  },
  { n: 7, east: 100, north: -100, acres: 0.5, road: 0, coverage: 0.2 },
  {
    n: 8,
    east: -100,
    north: -100,
    acres: 0.8,
    road: 40,
    constraints: [{ type: "conservation-area", name: "Kirkby Cross" }],
    ownership: "council-or-public-body",
  },
  {
    n: 9,
    east: -60,
    north: 60,
    acres: 0.6,
    road: 15,
    onListedBuildingOutline: true,
    constraints: [{ type: "listed-building", name: "Church of St Wilfrid" }],
  },
  // Outside the Search Area, but in Ashfield.
  { n: 10, east: -3000, north: 0, acres: 4, road: 8 },
];

/** A copy of the prepared-data fixture, with Ashfield's Land Parcels replaced. */
const preparedWith = async (parcels: readonly MadeUpParcel[] | string) => {
  const dir = await mkdtemp(join(tmpdir(), "location-scout-land-"));
  await cp(PREPARED_DATA_FIXTURE_DIR, dir, { recursive: true });
  await writeParcels(join(dir, "ashfield", "land-parcels.parquet"), parcels);
  return { dir, prepared: openPreparedData(dir) };
};

let made: { dir: string; prepared: PreparedData };

beforeAll(async () => {
  made = await preparedWith(PARCELS);
});

afterAll(async () => {
  await rm(made.dir, { recursive: true, force: true });
});

/** The Land Opportunities found with the filters changed from FR-5.3's defaults. */
const find = async (
  filters: Partial<LandFilters> = {},
  query: Partial<Omit<LandQuery, "filters">> = {},
  area = searchArea(),
  prepared = made.prepared,
) => {
  const result = await landOpportunities(
    area,
    {
      ...DEFAULT_LAND_QUERY,
      ...query,
      filters: { ...DEFAULT_LAND_FILTERS, ...filters },
    },
    callSource(),
    prepared,
  );
  if (result.status !== "ok") throw new Error(`Land is ${result.status}`);
  return result;
};

/** The numbers of the Land Opportunities found, in their order. */
const numbers = async (
  filters: Partial<LandFilters> = {},
  query: Partial<Omit<LandQuery, "filters">> = {},
) =>
  ((await find(filters, query)).data.found?.features ?? []).map(({ id }) =>
    Number(id.split("-")[1]),
  );

describe("landOpportunities", () => {
  it("finds the Land Parcels in the Search Area that meet FR-5.3's defaults, the largest first, with their tags", async () => {
    const { data, period } = await find();

    expect(data.landCoverageAreas).toEqual([ASHFIELD]);
    expect(data.notCovered).toEqual([]);
    // 2 is too small, 3 too far from a road, 4 has no road within 500 m,
    // 9 is on a listed building's outline, and 10 is outside the Search Area.
    expect(data.found?.features.map(({ id }) => id)).toEqual([
      "E07000170-5",
      "E07000170-6",
      "E07000170-1",
      "E07000170-8",
      "E07000170-7",
    ]);
    expect(data.found?.statistics).toEqual({
      parcels: 9,
      count: 5,
      totalHectares: 2.75,
      possiblyUnregistered: 1,
      ownershipCategories: {
        company: 1,
        "council-or-public-body": 1,
        "other-registered": 2,
        "possibly-unregistered": 1,
      },
      estimatedHomes: 21 + 10 + 7 + 5 + 3,
      listed: 5,
    });
    expect(data.found?.features[0]).toMatchObject({
      id: "E07000170-5",
      council: ASHFIELD,
      landUse: ["landuse=grass"],
      areaHectares: 1.214,
      areaAcres: 3,
      roadDistanceMetres: 20,
      inspireCoverage: 1,
      possiblyUnregistered: false,
      inspirePolygons: [
        {
          inspireId: "64000005",
          share: 1,
          ownershipCategory: "other-registered",
        },
      ],
      ownershipCategory: "other-registered",
      matchedTitles: [],
      constraints: [{ type: "flood-zone", name: "Flood zone 3" }],
      floodZone: 3,
      onListedBuildingOutline: false,
      estimatedHomes: 21,
      shape: { type: "MultiPolygon" },
    });
    expect(period).toEqual({ from: "2026-10-08", to: "2026-10-08" });
  });

  it("measures how far each is from the Location, to its nearest edge", async () => {
    const { data } = await find({}, { scope: "land-coverage-area" });
    const distances = Object.fromEntries(
      (data.found?.features ?? []).map(({ id, distanceMetres }) => [
        id,
        distanceMetres,
      ]),
    );

    // 1 acre is a square of 64 m, so its nearest edge is 150 - 32 m away.
    expect(distances["E07000170-1"]).toBeCloseTo(118, -1);
    expect(distances["E07000170-10"]).toBeCloseTo(3000 - 64, -1);
  });

  it("leaves out land smaller than minAcres, or larger than maxAcres", async () => {
    expect(await numbers({ minAcres: 0.01 })).toEqual([5, 6, 1, 8, 7, 2]);
    expect(await numbers({ minAcres: 1 })).toEqual([5, 6, 1]);
    expect(await numbers({ maxAcres: 1 })).toEqual([1, 8, 7]);
    expect(await numbers({ minAcres: 1, maxAcres: 2 })).toEqual([6, 1]);
  });

  it("leaves out land further from a road than maxRoadMetres, or with no road within 500 m, unless any distance will do", async () => {
    expect(await numbers({ maxRoadMetres: 20 })).toEqual([5, 1, 7]);
    expect(await numbers({ maxRoadMetres: 0 })).toEqual([7]);
    expect(await numbers({ maxRoadMetres: 200 })).toEqual([3, 5, 6, 1, 8, 7]);
    expect(await numbers({ maxRoadMetres: null })).toEqual([
      3, 5, 4, 6, 1, 8, 7,
    ]);
  });

  it("leaves out land in a higher flood zone than maxFloodZone", async () => {
    expect(await numbers({ maxFloodZone: 3 })).toEqual([5, 6, 1, 8, 7]);
    expect(await numbers({ maxFloodZone: 2 })).toEqual([6, 1, 8, 7]);
    expect(await numbers({ maxFloodZone: 1 })).toEqual([1, 8, 7]);
  });

  it("keeps only Possibly Unregistered land if asked", async () => {
    expect(await numbers({ possiblyUnregisteredOnly: true })).toEqual([7]);
  });

  it("keeps only land of the Ownership Categories asked for, each with the titles matched to it", async () => {
    expect(
      await numbers({
        ownershipCategories: ["company", "council-or-public-body"],
      }),
    ).toEqual([6, 8]);
    expect(
      await numbers({ ownershipCategories: ["possibly-unregistered"] }),
    ).toEqual([7]);
    expect(
      await numbers({ ownershipCategories: ["other-registered"] }),
    ).toEqual([5, 1]);
    const { data } = await find({ ownershipCategories: ["company"] });
    expect(data.found?.features[0]).toMatchObject({
      ownershipCategory: "company",
      matchedTitles: [
        {
          titleNumber: "ZZ100006",
          propertyAddress: "Unit 6, Lowmoor Business Park, Kirkby-in-Ashfield",
          proprietorshipCategory: "Limited Company or Public Limited Company",
          ownershipCategory: "company",
          dataset: "ccod",
          sourceDate: "2026-10-02",
          matchedBy: "address",
          inspireId: "64000006",
          distanceMetres: 0,
        },
      ],
    });
    expect(data.found?.statistics.ownershipCategories).toEqual({
      company: 1,
      "council-or-public-body": 0,
      "other-registered": 0,
      "possibly-unregistered": 0,
    });
  });

  it("has no Ownership Categories, and finds no land in one, where CCOD and OCOD weren't prepared", async () => {
    const { dir, prepared } = await preparedWith(
      PARCELS.map((parcel) => ({ ...parcel, ownership: null })),
    );
    try {
      const { data } = await find({}, {}, searchArea(), prepared);
      expect(data.found?.statistics).toMatchObject({
        count: 5,
        possiblyUnregistered: 1,
        ownershipCategories: null,
      });
      expect(data.found?.features[0]).toMatchObject({
        ownershipCategory: null,
        matchedTitles: [],
        inspirePolygons: [{ ownershipCategory: null }],
      });
      const filtered = await find(
        { ownershipCategories: ["possibly-unregistered"] },
        {},
        searchArea(),
        prepared,
      );
      expect(filtered.data.found?.statistics.count).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("leaves out land that intersects a Planning Constraint of the types excluded", async () => {
    expect(
      await numbers({ excludeConstraints: ["conservation-area"] }),
    ).toEqual([5, 6, 1, 7]);
    expect(await numbers({ excludeConstraints: ["flood-zone"] })).toEqual([
      1, 8, 7,
    ]);
    expect(
      await numbers({
        excludeConstraints: ["flood-zone", "conservation-area"],
      }),
    ).toEqual([1, 7]);
    expect(
      await numbers({
        excludeListedBuildingOutlines: false,
        excludeConstraints: ["listed-building"],
      }),
    ).toEqual([5, 6, 1, 8, 7]);
  });

  it("leaves out land on a listed building's outline unless asked to keep it", async () => {
    expect(await numbers({ excludeListedBuildingOutlines: false })).toEqual([
      5, 6, 1, 8, 9, 7,
    ]);
  });

  it("looks across the whole Land Coverage Area if asked", async () => {
    const { data } = await find({}, { scope: "land-coverage-area" });

    expect(data.found?.features.map(({ id }) => id)).toEqual([
      "E07000170-10",
      "E07000170-5",
      "E07000170-6",
      "E07000170-1",
      "E07000170-8",
      "E07000170-7",
    ]);
    expect(data.found?.statistics).toMatchObject({ parcels: 10, count: 6 });
  });

  it("lists them nearest a road first, or those that might hold the most homes first", async () => {
    expect(await numbers({}, { sort: "road-distance" })).toEqual([
      7, 1, 5, 6, 8,
    ]);
    expect(
      await numbers({ maxRoadMetres: null }, { sort: "road-distance" }),
    ).toEqual([7, 1, 5, 6, 8, 3, 4]);
    expect(await numbers({}, { sort: "capacity" })).toEqual([5, 6, 1, 8, 7]);
  });

  it(`lists at most ${String(LAND_LIST_LIMIT)}, but counts them all`, async () => {
    // A grid of squares of 0.1 acre and more, 25 m apart, each larger than the last.
    const { dir, prepared } = await preparedWith(
      `SELECT i + 1 AS n, (i % 23) * 25 - 275 AS east, (i // 23) * 25 - 275 AS north,
         sqrt((0.1 + i / 10000) * 4046.8564224) AS side,
         (0.1 + i / 10000) * 4046.8564224 AS area_m2,
         5::DOUBLE AS road_distance_m, 1::DOUBLE AS inspire_coverage,
         false AS possibly_unregistered,
         []::STRUCT(inspire_id VARCHAR, share DOUBLE, ownership_category VARCHAR)[] AS inspire_polygons,
         'other-registered' AS ownership_category,
         []::${MATCHED_TITLE}[] AS matched_titles,
         []::STRUCT(type VARCHAR, name VARCHAR)[] AS constraints,
         []::VARCHAR[] AS constraint_types, NULL::INTEGER AS flood_zone,
         false AS on_listed_building_outline
       FROM range(${String(LAND_LIST_LIMIT + 10)}) t(i)`,
    );
    try {
      const { data } = await find({}, {}, searchArea(), prepared);

      expect(data.found?.statistics).toMatchObject({
        parcels: LAND_LIST_LIMIT + 10,
        count: LAND_LIST_LIMIT + 10,
        listed: LAND_LIST_LIMIT,
      });
      expect(data.found?.features).toHaveLength(LAND_LIST_LIMIT);
      expect(data.found?.features[0]?.id).toBe(
        `E07000170-${String(LAND_LIST_LIMIT + 10)}`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("gives the industrial, commercial and retail land use in the Search Area as context", async () => {
    const { data } = await find({}, {}, searchArea(SUTTON_PARKWAY, 0.5));

    expect(data.found?.landUse.length).toBeGreaterThan(0);
    for (const area of data.found?.landUse ?? []) {
      expect(["industrial", "commercial", "retail"]).toContain(area.landUse);
      expect(area.id).toMatch(/^(way|relation)-\d+$/);
      expect(area.shape.type).toBe("MultiPolygon");
    }
  });

  it("finds none where the Search Area reaches into no Land Coverage Area, naming the councils it does", async () => {
    const { data, period } = await find(
      {},
      {},
      searchArea({ lat: 53.1435, lng: -1.1985 }),
    );

    expect(data).toEqual({
      landCoverageAreas: [],
      notCovered: [MANSFIELD],
      found: null,
    });
    expect(period).toBeNull();
  });

  it("is not prepared before pnpm data:prepare", async () => {
    expect(
      await landOpportunities(
        searchArea(),
        DEFAULT_LAND_QUERY,
        callSource(),
        NOTHING_PREPARED,
      ),
    ).toEqual({ status: "not-prepared" });
  });

  it("is not prepared for a Land Coverage Area prepared before its Land Parcels were", async () => {
    const dir = await mkdtemp(join(tmpdir(), "location-scout-land-"));
    try {
      await cp(PREPARED_DATA_FIXTURE_DIR, dir, { recursive: true });
      const file = join(dir, "manifest.json");
      const manifest = JSON.parse(
        await readFile(file, "utf8"),
      ) as PreparedManifest;
      for (const area of manifest.landCoverageAreas) {
        area.datasets = area.datasets.filter(
          ({ id }) => id !== LAND_PARCELS_DATASET,
        );
      }
      await writeFile(file, JSON.stringify(manifest));

      expect(
        await landOpportunities(
          searchArea(),
          DEFAULT_LAND_QUERY,
          callSource(),
          openPreparedData(dir),
        ),
      ).toEqual({ status: "not-prepared" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("is not prepared for Land Parcels prepared before Ownership Categories were", async () => {
    const { dir, prepared } = await preparedWith(PARCELS);
    try {
      // The file as data:prepare wrote it before: without their columns.
      const file = sql(join(dir, "ashfield", "land-parcels.parquet"));
      const instance = await DuckDBInstance.create(":memory:", {
        autoinstall_known_extensions: "false",
      });
      const connection = await instance.connect();
      try {
        await connection.run("LOAD spatial");
        await connection.run(
          `CREATE TABLE old AS SELECT * EXCLUDE (ownership_category, matched_titles) FROM read_parquet(${file})`,
        );
        await connection.run(`COPY old TO ${file} (FORMAT parquet)`);
      } finally {
        connection.closeSync();
      }

      expect(
        await landOpportunities(
          searchArea(),
          DEFAULT_LAND_QUERY,
          callSource(),
          prepared,
        ),
      ).toEqual({ status: "not-prepared" });
      expect(await landParcel("E07000170-1", callSource(), prepared)).toEqual({
        status: "not-prepared",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("landParcel", () => {
  it("gives a Land Parcel, with the INSPIRE Index Polygons that overlap it, and those around it a title is matched to, with their Ownership Categories and outlines", async () => {
    const result = await landParcel(
      "E07000170-2",
      callSource(),
      PREPARED_DATA_FIXTURE,
    );

    expect(result).toMatchObject({
      status: "ok",
      data: {
        parcel: {
          id: "E07000170-2",
          council: ASHFIELD,
          landUse: ["landuse=farmland"],
          possiblyUnregistered: false,
          ownershipCategory: "other-registered",
          matchedTitles: [
            {
              titleNumber: "ZZ200001",
              propertyAddress:
                "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE)",
              proprietorshipCategory:
                "Limited Company or Public Limited Company",
              ownershipCategory: "company",
              dataset: "ocod",
              sourceDate: "2026-10-02",
              matchedBy: "named",
              inspireId: "25709295",
              distanceMetres: 9,
            },
          ],
        },
        // Those that overlap it, then the one 9 m away an overseas
        // company's title is matched to.
        inspirePolygons: [
          {
            inspireId: "64151457",
            share: 0.724,
            ownershipCategory: "other-registered",
            distanceMetres: 0,
            shape: { type: "MultiPolygon" },
          },
          { inspireId: "64151706", share: 0.003, distanceMetres: 0 },
          { inspireId: "64152606", share: 0.002, distanceMetres: 0 },
          {
            inspireId: "25709295",
            share: 0,
            ownershipCategory: "company",
            distanceMetres: 9,
            shape: { type: "MultiPolygon" },
          },
        ],
      },
      period: { from: "2026-10-08", to: "2026-10-08" },
    });
  });

  it("is null for a Land Parcel no Land Coverage Area has", async () => {
    for (const id of ["E07000170-999999", "E07000174-1"]) {
      expect(await landParcel(id, callSource(), PREPARED_DATA_FIXTURE)).toEqual(
        { status: "ok", data: null, period: null },
      );
    }
  });

  it("is not prepared before pnpm data:prepare", async () => {
    expect(
      await landParcel("E07000170-2", callSource(), NOTHING_PREPARED),
    ).toEqual({ status: "not-prepared" });
  });
});

describe("readLandParcel", () => {
  const row = {
    parcel_id: "E07000170-412",
    name: "Sutton Lawn",
    land_use: ["landuse=grass", "natural=scrub"],
    area_m2: 4046.8564224,
    road_distance_m: 12.4,
    inspire_coverage: 0.4567,
    possibly_unregistered: true,
    inspire_polygons: [
      {
        inspire_id: "64151457",
        share: 0.4567,
        ownership_category: "council-or-public-body",
      },
      { inspire_id: null, share: 0.1, ownership_category: null },
    ],
    ownership_category: "possibly-unregistered",
    matched_titles: [
      {
        title_number: "ZZ100003",
        property_address: "Sutton Lawn, Sutton-in-Ashfield",
        proprietorship_category: "Local Authority",
        ownership_category: "council-or-public-body",
        dataset: "ccod",
        source_date: "2026-10-02",
        matched_by: "named",
        inspire_id: "64151457",
        distance_m: 0,
      },
      {
        title_number: "ZZ100004",
        property_address: "A title matched by its postcode alone",
        proprietorship_category: "Local Authority",
        ownership_category: "council-or-public-body",
        dataset: "ccod",
        source_date: "2026-10-02",
        matched_by: "postcode",
        inspire_id: "64151458",
        distance_m: 3.6,
      },
    ],
    constraints: [
      { type: "flood-zone", name: "Flood zone 2" },
      { type: "power-line", name: "Not a constraint the app knows" },
    ],
    flood_zone: 2,
    on_listed_building_outline: false,
    estimated_homes: 7,
    lat: 53.1,
    lng: -1.2,
    shape: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [-1.2, 53.1],
          [-1.19, 53.1],
          [-1.19, 53.11],
          [-1.2, 53.1],
        ],
      ],
    }),
  };

  it("reads a Land Parcel's tags, in acres and hectares, as a MultiPolygon", () => {
    expect(readLandParcel(row, ASHFIELD)).toEqual({
      id: "E07000170-412",
      location: { lat: 53.1, lng: -1.2 },
      council: ASHFIELD,
      name: "Sutton Lawn",
      landUse: ["landuse=grass", "natural=scrub"],
      areaHectares: 0.405,
      areaAcres: 1,
      roadDistanceMetres: 12,
      inspireCoverage: 0.457,
      possiblyUnregistered: true,
      inspirePolygons: [
        {
          inspireId: "64151457",
          share: 0.457,
          ownershipCategory: "council-or-public-body",
        },
      ],
      ownershipCategory: "possibly-unregistered",
      // Only titles matched by address or a named building are read.
      matchedTitles: [
        {
          titleNumber: "ZZ100003",
          propertyAddress: "Sutton Lawn, Sutton-in-Ashfield",
          proprietorshipCategory: "Local Authority",
          ownershipCategory: "council-or-public-body",
          dataset: "ccod",
          sourceDate: "2026-10-02",
          matchedBy: "named",
          inspireId: "64151457",
          distanceMetres: 0,
        },
      ],
      constraints: [{ type: "flood-zone", name: "Flood zone 2" }],
      floodZone: 2,
      onListedBuildingOutline: false,
      estimatedHomes: 7,
      shape: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-1.2, 53.1],
              [-1.19, 53.1],
              [-1.19, 53.11],
              [-1.2, 53.1],
            ],
          ],
        ],
      },
    });
  });

  it("has no road distance, or flood zone, where the row gives none", () => {
    expect(
      readLandParcel(
        { ...row, road_distance_m: null, flood_zone: null },
        ASHFIELD,
      ),
    ).toMatchObject({ roadDistanceMetres: null, floodZone: null });
  });

  it("has no Ownership Category where CCOD and OCOD weren't prepared", () => {
    expect(
      readLandParcel(
        { ...row, ownership_category: null, matched_titles: [] },
        ASHFIELD,
      ),
    ).toMatchObject({ ownershipCategory: null, matchedTitles: [] });
  });

  it("refuses a row with no id or outline", () => {
    expect(() => readLandParcel({ ...row, shape: null }, ASHFIELD)).toThrow(
      "incomplete",
    );
  });
});
