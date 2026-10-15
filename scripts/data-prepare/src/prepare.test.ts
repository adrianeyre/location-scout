import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PLANNING_CONSTRAINT_DATASETS,
  isPreparedManifest,
} from "@location-scout/shared";

import { COUNCIL_BOUNDARIES } from "./council-boundaries";
import {
  INCOME_ESTIMATES,
  INDICES_OF_DEPRIVATION,
  OUTPUT_AREA_BOUNDARIES,
} from "./demographics";
import { sqlString } from "./duckdb";
import { API_PREPARED_DATA_FIXTURE } from "./prepare-fixture";
import {
  COUNCIL_BOUNDARIES_FILE,
  MANIFEST_FILE,
  OUTPUT_AREA_BOUNDARIES_FILE,
  PrepareError,
  councilFolder,
  prepareData,
  type PrepareOptions,
} from "./prepare";
import {
  FIXTURE_PREPARED_AT,
  RECORDED_COUNCIL_BOUNDARIES,
} from "./recorded-boundaries";
import {
  RECORDED_CODE_POINT_OPEN,
  RECORDED_LAND_REGISTRY_API_KEY,
  RECORDED_OFSTED_INSPECTIONS_URL,
  RECORDED_OUTPUT_AREAS,
  recordedSources,
} from "./recorded-sources";
import { GIAS, OFSTED_INSPECTIONS } from "./schools";

const ASHFIELD = { code: "E07000170", name: "Ashfield" };
const MANSFIELD = { code: "E07000174", name: "Mansfield" };

/** NG17 1AA, in Sutton-in-Ashfield. */
const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

/** Every England-wide file, in order. */
const ENGLAND_FILES = [
  "england/census-2021.parquet",
  "england/council-boundaries.parquet",
  "england/income-estimates.parquet",
  "england/indices-of-deprivation.parquet",
  "england/ofsted-inspections.parquet",
  "england/output-area-boundaries.parquet",
  "england/schools.parquet",
];

/** Every file of a Land Coverage Area, in order. */
const landFiles = (folder: string) =>
  [
    "council-boundary",
    "inspire-index-polygons",
    "osm-land-use",
    "osm-buildings",
    "osm-roads",
    "osm-water",
    ...PLANNING_CONSTRAINT_DATASETS,
    "land-parcels",
    "postcodes",
  ]
    .map((name) => `${folder}/${name}.parquet`)
    .sort();

/** HM Land Registry's statements for INSPIRE Index Polygons published in 2026 (PRD FR-10.2). */
const INSPIRE_ATTRIBUTION = {
  statements: [
    "This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry.",
    "The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063.",
  ],
  conditionsUrl:
    "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
};

/** Ordnance Survey's statements for Code-Point Open's release of August 2026. */
const CODE_POINT_OPEN_ATTRIBUTION = {
  statements: [
    "Contains OS data © Crown copyright and database right 2026.",
    "Contains Royal Mail data © Royal Mail copyright and database right 2026.",
    "Contains National Statistics data © Crown copyright and database right 2026.",
  ],
  conditionsUrl:
    "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
};

/** Where Ashfield's and Mansfield's OpenStreetMap data came from: Nottinghamshire's and Derbyshire's extracts. */
const RECORDED_EXTRACT_URLS =
  "https://download.geofabrik.de/europe/united-kingdom/england/nottinghamshire-261008.osm.pbf https://download.geofabrik.de/europe/united-kingdom/england/derbyshire-261008.osm.pbf";

const FIRST_RUN = new Date("2026-10-08T21:30:00.000Z");
const SECOND_RUN = new Date("2026-11-08T21:30:00.000Z");

/** Reads a GeoParquet file's rows with DuckDB, as the API does. */
const readParquet = async (file: string, where = "true") => {
  const instance = await DuckDBInstance.create(":memory:", {
    autoinstall_known_extensions: "false",
  });
  const connection = await instance.connect();
  try {
    await connection.run("LOAD spatial");
    const rows = await connection.runAndReadAll(
      `SELECT code, name FROM read_parquet(${sqlString(file)}) WHERE ${where} ORDER BY code`,
    );
    const geo = await connection.runAndReadAll(
      `SELECT decode(value) AS value FROM parquet_kv_metadata(${sqlString(file)}) WHERE decode(key) = 'geo'`,
    );
    return {
      rows: rows.getRowObjectsJson(),
      geo: geo
        .getRowObjectsJson()
        .map(({ value }) => (typeof value === "string" ? value : "")),
    };
  } finally {
    connection.closeSync();
  }
};

/** Runs a query with DuckDB's spatial extension loaded, as the API does. */
const query = async (sql: string) => {
  const instance = await DuckDBInstance.create(":memory:", {
    autoinstall_known_extensions: "false",
  });
  const connection = await instance.connect();
  try {
    await connection.run("LOAD spatial");
    return (await connection.runAndReadAll(sql)).getRowObjectsJson();
  } finally {
    connection.closeSync();
  }
};

/** Every row of a prepared file, its geometry as it is stored. */
const readRows = (file: string) =>
  query(`SELECT * FROM read_parquet(${sqlString(file)})`);

const containing = ({ lat, lng }: { lat: number; lng: number }) =>
  `ST_Contains(geometry, ST_Point(${String(lng)}, ${String(lat)}))`;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "location-scout-data-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const prepare = (options: Partial<PrepareOptions> = {}) =>
  prepareData({
    dataDir,
    fetch: recordedSources,
    areas: [],
    all: false,
    now: () => FIRST_RUN,
    ...options,
  });

const readManifest = async () =>
  JSON.parse(await readFile(join(dataDir, MANIFEST_FILE), "utf8")) as unknown;

/** Every file in `dataDir`, relative to it, in order. */
const filesIn = async () =>
  (await readdir(dataDir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name).slice(dataDir.length + 1),
    )
    .sort();

describe("prepareData", () => {
  it("prepares the England-wide datasets and Ashfield the first time, and writes the manifest with their dates", async () => {
    const manifest = await prepare();

    const boundaries = {
      source: "ONS Open Geography",
      sourceUrl: COUNCIL_BOUNDARIES.url,
      sourceDate: "2026-05",
      preparedAt: "2026-10-08T21:30:00.000Z",
    };
    expect(manifest).toEqual({
      preparedAt: "2026-10-08T21:30:00.000Z",
      datasets: [
        {
          id: "council-boundaries",
          name: "Council boundaries",
          ...boundaries,
          file: "england/council-boundaries.parquet",
        },
        {
          id: "output-area-boundaries",
          name: "Output area boundaries",
          source: "ONS Open Geography",
          sourceUrl: OUTPUT_AREA_BOUNDARIES.url,
          sourceDate: "2021-12",
          preparedAt: "2026-10-08T21:30:00.000Z",
          file: "england/output-area-boundaries.parquet",
        },
        {
          id: "census-2021",
          name: "Census 2021 by output area",
          source: "ONS Census 2021",
          sourceUrl: "https://www.nomisweb.co.uk/sources/census_2021_bulk",
          sourceDate: "2021-03-21",
          preparedAt: "2026-10-08T21:30:00.000Z",
          file: "england/census-2021.parquet",
        },
        {
          id: "income-estimates",
          name: "Household income estimates by MSOA",
          source: "ONS small area income estimates",
          sourceUrl: INCOME_ESTIMATES.url,
          sourceDate: "2023-03",
          preparedAt: "2026-10-08T21:30:00.000Z",
          file: "england/income-estimates.parquet",
        },
        {
          id: "indices-of-deprivation",
          name: "English Indices of Deprivation 2025",
          source: "English Indices of Deprivation",
          sourceUrl: INDICES_OF_DEPRIVATION.url,
          sourceDate: "2025-10-30",
          preparedAt: "2026-10-08T21:30:00.000Z",
          file: "england/indices-of-deprivation.parquet",
        },
        {
          id: "schools",
          name: "Schools register",
          source: "Get Information about Schools",
          sourceUrl: "https://get-information-schools.service.gov.uk/Downloads",
          sourceDate: "2026-10-09",
          preparedAt: "2026-10-08T21:30:00.000Z",
          file: "england/schools.parquet",
        },
        {
          id: "ofsted-inspections",
          name: "Ofsted inspections of state-funded schools",
          source: "Ofsted",
          sourceUrl: RECORDED_OFSTED_INSPECTIONS_URL,
          sourceDate: "2026-08-31",
          preparedAt: "2026-10-08T21:30:00.000Z",
          file: "england/ofsted-inspections.parquet",
        },
      ],
      landCoverageAreas: [
        {
          council: ASHFIELD,
          datasets: [
            {
              id: "council-boundary",
              name: "Council boundary",
              ...boundaries,
              file: "ashfield/council-boundary.parquet",
            },
            {
              id: "inspire-index-polygons",
              name: "INSPIRE Index Polygons",
              source: "HM Land Registry",
              sourceUrl:
                "https://use-land-property-data.service.gov.uk/datasets/inspire/download/Ashfield_District_Council.zip",
              sourceDate: "2026-10-04",
              preparedAt: "2026-10-08T21:30:00.000Z",
              file: "ashfield/inspire-index-polygons.parquet",
              attribution: INSPIRE_ATTRIBUTION,
            },
            ...[
              ["osm-land-use", "Land use"],
              ["osm-buildings", "Buildings"],
              ["osm-roads", "Roads"],
              ["osm-water", "Water"],
            ].map(([id, name]) => ({
              id,
              name,
              source: "OpenStreetMap via Geofabrik",
              sourceUrl: RECORDED_EXTRACT_URLS,
              sourceDate: "2026-10-08",
              preparedAt: "2026-10-08T21:30:00.000Z",
              file: `ashfield/${id ?? ""}.parquet`,
            })),
            ...[
              ["conservation-area", "Conservation areas"],
              ["listed-building", "Listed buildings"],
              ["listed-building-outline", "Listed building outlines"],
              ["article-4-direction-area", "Article 4 direction areas"],
              ["tree-preservation-zone", "Tree preservation zones"],
              ["flood-risk-zone", "Flood risk zones"],
            ].map(([id, name]) => ({
              id,
              name,
              source: "planning.data.gov.uk",
              sourceUrl: `https://files.planning.data.gov.uk/dataset/${id ?? ""}.parquet`,
              sourceDate: "2026-10-08",
              preparedAt: "2026-10-08T21:30:00.000Z",
              file: `ashfield/${id ?? ""}.parquet`,
            })),
            {
              id: "land-parcels",
              name: "Land Parcels",
              source: "OpenStreetMap via Geofabrik",
              sourceUrl: RECORDED_EXTRACT_URLS,
              sourceDate: "2026-10-08",
              preparedAt: "2026-10-08T21:30:00.000Z",
              file: "ashfield/land-parcels.parquet",
            },
            {
              id: "postcodes",
              name: "Postcodes",
              source: "Ordnance Survey's Code-Point Open",
              sourceUrl:
                "https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect",
              sourceDate: "2026-08",
              preparedAt: "2026-10-08T21:30:00.000Z",
              file: "ashfield/postcodes.parquet",
              attribution: CODE_POINT_OPEN_ATTRIBUTION,
            },
          ],
        },
      ],
    });
    expect(await readManifest()).toEqual(manifest);
    expect(isPreparedManifest(manifest)).toBe(true);
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
  });

  it("converts England's council boundaries to GeoParquet, leaving out Wales's", async () => {
    await prepare();

    const { rows, geo } = await readParquet(
      join(dataDir, COUNCIL_BOUNDARIES_FILE),
    );
    expect(rows).toEqual([ASHFIELD, MANSFIELD]);
    expect(RECORDED_COUNCIL_BOUNDARIES.features).toHaveLength(3);
    const [metadata] = geo;
    expect(JSON.parse(metadata ?? "null")).toMatchObject({
      version: "1.0.0",
      primary_column: "geometry",
      columns: { geometry: { encoding: "WKB" } },
    });
  });

  it("keeps each council's boundary, so the council a Location is in can be found", async () => {
    await prepare();

    const { rows } = await readParquet(
      join(dataDir, COUNCIL_BOUNDARIES_FILE),
      containing(NG17_1AA),
    );
    expect(rows).toEqual([ASHFIELD]);
    const own = await readParquet(
      join(dataDir, "ashfield/council-boundary.parquet"),
      containing(NG17_1AA),
    );
    expect(own.rows).toEqual([ASHFIELD]);
  });

  it("adds a council named by --area to those prepared before, and refreshes them", async () => {
    await prepare();

    const manifest = await prepare({
      areas: ["Mansfield"],
      now: () => SECOND_RUN,
    });

    expect(manifest.landCoverageAreas.map(({ council }) => council)).toEqual([
      ASHFIELD,
      MANSFIELD,
    ]);
    const preparedAt = manifest.landCoverageAreas.flatMap(({ datasets }) =>
      datasets.map((dataset) => dataset.preparedAt),
    );
    expect(preparedAt).toHaveLength(28);
    expect(new Set(preparedAt)).toEqual(new Set(["2026-11-08T21:30:00.000Z"]));
    const { rows } = await readParquet(
      join(dataDir, "mansfield/council-boundary.parquet"),
    );
    expect(rows).toEqual([MANSFIELD]);
  });

  it("converts England's output areas to GeoParquet, with the bounds of each and the LSOA and MSOA it is in", async () => {
    await prepare();
    const file = sqlString(join(dataDir, OUTPUT_AREA_BOUNDARIES_FILE));

    const [summary] = await query(
      `SELECT count(*) AS areas, count(lsoa_code) AS lsoas, count(msoa_code) AS msoas,
         bool_and(starts_with(code, 'E00')) AS english,
         bool_and(xmin = ST_XMin(geometry) AND ymax = ST_YMax(geometry)) AS bounded
       FROM read_parquet(${file})`,
    );
    expect(summary).toEqual({
      areas: "92",
      lsoas: "92",
      msoas: "92",
      english: true,
      bounded: true,
    });
    expect(RECORDED_OUTPUT_AREAS.features).toHaveLength(92);
    expect(
      await query(
        `SELECT code, lsoa_code, lsoa_name, msoa_code, msoa_name
         FROM read_parquet(${file}) WHERE ${containing(NG17_1AA)}`,
      ),
    ).toEqual([
      {
        code: "E00142547",
        lsoa_code: "E01027976",
        lsoa_name: "Ashfield 005E",
        msoa_code: "E02005823",
        msoa_name: "Ashfield 005",
      },
    ]);
    const [metadata] = await query(
      `SELECT decode(value) AS value FROM parquet_kv_metadata(${file}) WHERE decode(key) = 'geo'`,
    );
    expect(
      JSON.parse(typeof metadata?.value === "string" ? metadata.value : "null"),
    ).toMatchObject({
      primary_column: "geometry",
      columns: { geometry: { encoding: "WKB" } },
    });
  });

  it("keeps Census 2021's population, households, density and residents in each age band, for England's output areas only", async () => {
    await prepare();
    const file = sqlString(join(dataDir, "england/census-2021.parquet"));

    expect(
      await query(
        `SELECT * FROM read_parquet(${file}) WHERE code = 'E00142547'`,
      ),
    ).toEqual([
      {
        code: "E00142547",
        population: 239,
        households: 140,
        population_density: 2725.2,
        ages: [
          4, 5, 12, 9, 19, 19, 21, 9, 12, 11, 16, 16, 17, 24, 19, 11, 11, 5,
        ],
      },
    ]);
    // ONS adjusts each table a little on its own, to protect privacy, so an
    // output area's age bands add up to about its population, not exactly.
    expect(
      await query(
        `SELECT count(*) AS areas,
           bool_and(len(ages) = 18) AS banded,
           bool_and(abs(list_sum(ages) - population) <= 0.05 * population) AS close,
           count(*) FILTER (WHERE code = 'W00000001') AS welsh
         FROM read_parquet(${file})`,
      ),
    ).toEqual([{ areas: "92", banded: true, close: true, welsh: "0" }]);
  });

  it("keeps each English MSOA's average household income and each LSOA's deprivation", async () => {
    await prepare();

    const income = await readRows(
      join(dataDir, "england/income-estimates.parquet"),
    );
    expect(income).toHaveLength(7);
    expect(income).toContainEqual({
      msoa_code: "E02005823",
      msoa_name: "Ashfield 005",
      income: 33525,
    });
    expect(income.map(({ msoa_code }) => msoa_code)).not.toContain("W02000001");

    const deprivation = await readRows(
      join(dataDir, "england/indices-of-deprivation.parquet"),
    );
    expect(deprivation).toHaveLength(22);
    expect(deprivation).toContainEqual({
      lsoa_code: "E01027976",
      lsoa_name: "Ashfield 005E",
      score: 39.822,
      rank: 4630,
      decile: 2,
    });
  });

  it("keeps England's open schools by phase, at their point, leaving out closed ones, colleges and Wales's", async () => {
    await prepare();
    const file = sqlString(join(dataDir, "england/schools.parquet"));

    expect(
      await query(
        `SELECT phase, count(*) AS schools FROM read_parquet(${file}) GROUP BY phase ORDER BY phase`,
      ),
    ).toEqual([
      { phase: "independent", schools: "2" },
      { phase: "nursery", schools: "2" },
      { phase: "primary", schools: "65" },
      { phase: "secondary", schools: "12" },
      { phase: "special", schools: "9" },
    ]);
    const [sutton] = await query(
      `SELECT * EXCLUDE (geometry), ST_X(geometry) AS x, ST_Y(geometry) AS y
       FROM read_parquet(${file}) WHERE urn = '139063'`,
    );
    // GIAS places it at easting 449577, northing 358768.
    expect(sutton).toEqual({
      urn: "139063",
      name: "Sutton Community Academy",
      phase: "secondary",
      establishment_type: "Academy sponsor led",
      age_from: 11,
      age_to: 16,
      inspectorate: null,
      lng: -1.260611,
      lat: 53.123786,
      x: expect.closeTo(-1.260611, 6) as number,
      y: expect.closeTo(53.123786, 6) as number,
    });
    expect(
      await query(
        `SELECT urn, name, phase, inspectorate FROM read_parquet(${file})
         WHERE urn IN ('144806', '136425', '152253', '152214') OR inspectorate IS NOT NULL
         ORDER BY urn`,
      ),
    ).toEqual([
      // Independent, inspected by Ofsted and by the Independent Schools Inspectorate.
      {
        urn: "136425",
        name: "Green Crescent School",
        phase: "independent",
        inspectorate: "Ofsted",
      },
      // Independent special schools are special, but have an inspectorate.
      {
        urn: "142538",
        name: "Aurora Mansfield School",
        phase: "special",
        inspectorate: "Ofsted",
      },
      {
        urn: "144806",
        name: "Kingdom Christian School",
        phase: "independent",
        inspectorate: "ISI",
      },
      {
        urn: "145546",
        name: "Pollyteach Limited",
        phase: "special",
        inspectorate: "Ofsted",
      },
      {
        urn: "146288",
        name: "Westbourne School",
        phase: "special",
        inspectorate: "ISI",
      },
      // GIAS doesn't know its council yet, but knows it is in London.
      {
        urn: "152214",
        name: "Nancy Reuben Primary School",
        phase: "primary",
        inspectorate: null,
      },
      // Decoded from Windows-1252, apostrophe and all.
      {
        urn: "152253",
        name: "St John’s CE Primary School",
        phase: "primary",
        inspectorate: null,
      },
    ]);
    // Closed, a further education college, a special post-16 institution, and
    // a Welsh nursery.
    expect(
      await query(
        `SELECT count(*) AS left_in FROM read_parquet(${file})
         WHERE urn IN ('112607', '130777', '131959', '400003')`,
      ),
    ).toEqual([{ left_in: "0" }]);
  });

  it("asks GIAS for the register as its form does, sending back its cookies", async () => {
    const asked: string[] = [];
    const recording = ((url: string, init?: RequestInit) => {
      asked.push(`${init?.method ?? "GET"} ${url}`);
      return recordedSources(url, init);
    }) as typeof fetch;

    await prepare({ fetch: recording });

    expect(
      asked.filter(
        (request) => request.includes("edubase") || request.includes(GIAS.site),
      ),
    ).toEqual([
      `GET ${GIAS.site}/Downloads`,
      `POST ${GIAS.site}/Downloads/Collate`,
      `GET ${GIAS.site}/Downloads/Generated/f6292a6b-6810-49f2-8426-8f66197fc04b`,
      "GET https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/File.xhtml?id=f6292a6b-6810-49f2-8426-8f66197fc04b",
    ]);
  });

  it("keeps the latest Ofsted inspections of the schools it keeps, from the latest month's CSV", async () => {
    await prepare();
    const rows = await readRows(
      join(dataDir, "england/ofsted-inspections.parquet"),
    );

    // Every state-funded school kept but those 5 independent ones, and not
    // The Aldgate School, which isn't in the recorded register.
    expect(rows).toHaveLength(85);
    expect(rows.map(({ urn }) => urn)).not.toContain("100000");
    expect(rows.find(({ urn }) => urn === "139063")).toEqual({
      urn: "139063",
      report_card_on: "2026-04-21",
      report_card_grades: [
        { area: "Inclusion", grade: "Expected standard" },
        { area: "Curriculum and teaching", grade: "Expected standard" },
        { area: "Achievement", grade: "Needs attention" },
        { area: "Attendance and behaviour", grade: "Expected standard" },
        {
          area: "Personal development and wellbeing",
          grade: "Expected standard",
        },
        { area: "Early years", grade: "Not applicable" },
        { area: "Post-16 provision", grade: "Expected standard" },
        { area: "Leadership and governance", grade: "Expected standard" },
      ],
      report_card_safeguarding: "Met",
      report_card_of_current_urn: "Yes",
      graded_on: "2022-04-26",
      overall_effectiveness: "2",
      graded_grades: [
        { area: "Quality of education", grade: "2" },
        { area: "Behaviour and attitudes", grade: "2" },
        { area: "Personal development", grade: "2" },
        { area: "Leadership and management", grade: "2" },
        { area: "Early years provision", grade: "9" },
        { area: "Sixth form provision", grade: "2" },
      ],
      graded_safeguarding: "Yes",
      graded_of_current_urn: "Yes",
      ungraded_on: null,
      ungraded_outcome: null,
      ungraded_of_current_urn: null,
    });
  });

  it("refuses a source whose layout has changed, naming what is missing, and changes nothing", async () => {
    await prepare();
    const before = await readManifest();
    const renamed = ((url: string, init?: RequestInit) =>
      url === INDICES_OF_DEPRIVATION.url
        ? Promise.resolve(
            new Response(
              "LSOA code (2021),LSOA name (2021),IMD decile\nE01027976,Ashfield 005E,2\n",
            ),
          )
        : recordedSources(url, init)) as typeof fetch;

    await expect(prepare({ fetch: renamed })).rejects.toThrow(
      /English Indices of Deprivation 2025 has no column "Index of Multiple Deprivation \(IMD\) Score"/,
    );

    expect(await readManifest()).toEqual(before);
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
  });

  it("changes nothing if a Census download fails", async () => {
    await prepare();
    const before = await readManifest();
    const failing = ((url: string, init?: RequestInit) =>
      url.startsWith("https://www.nomisweb.co.uk/")
        ? Promise.resolve(new Response("Service unavailable", { status: 503 }))
        : recordedSources(url, init)) as typeof fetch;

    await expect(prepare({ fetch: failing })).rejects.toThrow(
      /ONS Census 2021 answered 503/,
    );

    expect(await readManifest()).toEqual(before);
  });

  it("refuses Ofsted's inspections if their layout has changed, naming what is missing, and changes nothing", async () => {
    await prepare();
    const before = await readManifest();
    const renamed = ((url: string, init?: RequestInit) =>
      url === RECORDED_OFSTED_INSPECTIONS_URL
        ? Promise.resolve(new Response("URN,Overall effectiveness\n100000,2\n"))
        : recordedSources(url, init)) as typeof fetch;

    await expect(prepare({ fetch: renamed })).rejects.toThrow(
      /Ofsted's latest inspections has no column "Inspection number of latest full inspection"/,
    );
    expect(await readManifest()).toEqual(before);
  });

  it("changes nothing if Ofsted's page lists no latest inspections, or GIAS's form has changed", async () => {
    await prepare();
    const before = await readManifest();
    const noCsv = ((url: string, init?: RequestInit) =>
      url === OFSTED_INSPECTIONS.content
        ? Promise.resolve(Response.json({ details: { attachments: [] } }))
        : recordedSources(url, init)) as typeof fetch;
    const noForm = ((url: string, init?: RequestInit) =>
      url === `${GIAS.site}/Downloads`
        ? Promise.resolve(new Response("<html><body>Sorry</body></html>"))
        : recordedSources(url, init)) as typeof fetch;

    await expect(prepare({ fetch: noCsv })).rejects.toThrow(
      /has no "latest inspections" CSV any more/,
    );
    await expect(prepare({ fetch: noForm })).rejects.toThrow(
      /The Downloads page of Get Information about Schools is not as it was/,
    );
    expect(await readManifest()).toEqual(before);
  });

  it("replaces the files and the manifest on a re-run, keeping no history", async () => {
    await prepare();
    // Stands in for a file the last run wrote, to show it is replaced whole.
    await writeFile(join(dataDir, COUNCIL_BOUNDARIES_FILE), "last month's");

    await prepare({ now: () => SECOND_RUN });

    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
    const { rows } = await readParquet(join(dataDir, COUNCIL_BOUNDARIES_FILE));
    expect(rows).toEqual([ASHFIELD, MANSFIELD]);
    expect(await readManifest()).toMatchObject({
      preparedAt: "2026-11-08T21:30:00.000Z",
    });
  });

  it("finds a council by its name in any case, or by its code", async () => {
    const manifest = await prepare({ areas: ["mansfield", "E07000170"] });

    expect(manifest.landCoverageAreas.map(({ council }) => council)).toEqual([
      ASHFIELD,
      MANSFIELD,
    ]);
  });

  it("prepares every English council with --all", async () => {
    const manifest = await prepare({ all: true });

    expect(manifest.landCoverageAreas.map(({ council }) => council)).toEqual([
      ASHFIELD,
      MANSFIELD,
    ]);
  });

  it("refuses a council that isn't in England's boundaries, saying which, and changes nothing", async () => {
    await prepare();
    const before = await readManifest();

    const refused = prepare({ areas: ["Ashfeld"], now: () => SECOND_RUN });

    await expect(refused).rejects.toBeInstanceOf(PrepareError);
    await expect(refused).rejects.toThrow(
      /no English council called "Ashfeld".*Nothing was changed/,
    );
    await expect(prepare({ areas: ["Cardiff"] })).rejects.toThrow(
      /no English council called "Cardiff"/,
    );
    await expect(prepare({ areas: ["field"] })).rejects.toThrow(
      /Did you mean "Ashfield" or "Mansfield"\?/,
    );
    expect(await readManifest()).toEqual(before);
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
  });

  it("changes nothing if the download fails", async () => {
    await prepare();
    const before = await readManifest();
    const failing = (() =>
      Promise.resolve(
        new Response("Service unavailable", { status: 503 }),
      )) as typeof fetch;

    await expect(
      prepare({ fetch: failing, areas: ["Mansfield"] }),
    ).rejects.toThrow(/ONS Open Geography answered 503/);

    expect(await readManifest()).toEqual(before);
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
  });

  it("stops preparing a council that is gone from the boundaries, removing its files", async () => {
    await prepare({ areas: ["Ashfield", "Mansfield"] });
    const withoutMansfield = ((url: string, init?: RequestInit) =>
      url.startsWith(COUNCIL_BOUNDARIES.url)
        ? Promise.resolve(
            Response.json({
              ...RECORDED_COUNCIL_BOUNDARIES,
              features: RECORDED_COUNCIL_BOUNDARIES.features.filter(
                ({ properties }) => properties.LAD26CD !== MANSFIELD.code,
              ),
            }),
          )
        : recordedSources(url, init)) as typeof fetch;
    const logged: string[] = [];

    const manifest = await prepare({
      fetch: withoutMansfield,
      log: (message) => logged.push(message),
    });

    expect(manifest.landCoverageAreas.map(({ council }) => council)).toEqual([
      ASHFIELD,
    ]);
    expect(logged).toContain(
      "Mansfield (E07000174) is not in ONS Open Geography's boundaries any more, so it is no longer a Land Coverage Area.",
    );
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
    expect(existsSync(join(dataDir, "mansfield"))).toBe(false);
  });
});

describe("each Land Coverage Area's land data", () => {
  /** The ids of a prepared file's rows, in order. */
  const idsIn = async (file: string, id: string) =>
    (
      await query(
        `SELECT ${id} AS id FROM read_parquet(${sqlString(join(dataDir, file))}) ORDER BY ${id}`,
      )
    ).map(({ id: value }) =>
      typeof value === "string" ? value : JSON.stringify(value),
    );

  it("prepares each council's INSPIRE Index Polygons from its own zip, in WGS 84, with HM Land Registry's statements and their date", async () => {
    const manifest = await prepare({ areas: ["Ashfield", "Mansfield"] });

    const [ashfield, mansfield] = await Promise.all(
      ["ashfield", "mansfield"].map((folder) =>
        query(
          `SELECT count(*) AS polygons, count(DISTINCT inspire_id) AS ids,
             bool_and(ST_GeometryType(geometry) = 'POLYGON') AS polygons_only,
             round(min(xmin), 2) AS xmin, round(max(ymax), 2) AS ymax
           FROM read_parquet(${sqlString(join(dataDir, folder, "inspire-index-polygons.parquet"))})`,
        ),
      ),
    );
    expect(ashfield).toEqual([
      {
        polygons: "231",
        ids: "231",
        polygons_only: true,
        xmin: -1.31,
        ymax: 53.14,
      },
    ]);
    expect(mansfield).toEqual([
      {
        polygons: "6",
        ids: "6",
        polygons_only: true,
        xmin: -1.24,
        ymax: 53.14,
      },
    ]);
    const inspire = manifest.landCoverageAreas.map(({ datasets }) =>
      datasets.find(({ id }) => id === "inspire-index-polygons"),
    );
    expect(inspire).toMatchObject([
      {
        sourceUrl:
          "https://use-land-property-data.service.gov.uk/datasets/inspire/download/Ashfield_District_Council.zip",
        sourceDate: "2026-10-04",
        attribution: INSPIRE_ATTRIBUTION,
      },
      {
        sourceUrl:
          "https://use-land-property-data.service.gov.uk/datasets/inspire/download/Mansfield_District_Council.zip",
        sourceDate: "2026-10-04",
        attribution: INSPIRE_ATTRIBUTION,
      },
    ]);
  });

  it("asks HM Land Registry for its download page and zips as a browser does, sending back the cookies it sets", async () => {
    const asked: { url: string; cookie: string | null }[] = [];
    const watched = ((url: string, init?: RequestInit) => {
      if (url.startsWith("https://use-land-property-data.service.gov.uk/")) {
        asked.push({ url, cookie: new Headers(init?.headers).get("cookie") });
      }
      return recordedSources(url, init);
    }) as typeof fetch;

    await prepare({ fetch: watched });

    const cookie =
      "anonymous=true; AccessToken=05537355-4f63-489a-b0d5-f25179c1013d";
    expect(asked).toEqual([
      {
        url: "https://use-land-property-data.service.gov.uk/datasets/inspire/download",
        cookie: null,
      },
      {
        url: "https://use-land-property-data.service.gov.uk/datasets/inspire/download",
        cookie,
      },
      {
        url: "https://use-land-property-data.service.gov.uk/datasets/inspire/download/Ashfield_District_Council.zip",
        cookie,
      },
    ]);
  });

  it("keeps OpenStreetMap's land use, buildings, roads and water that reach within 100 m of each council's boundary, whole, each once though two extracts have it", async () => {
    await prepare({ areas: ["Ashfield", "Mansfield"] });

    for (const folder of ["ashfield", "mansfield"]) {
      const boundary = sqlString(
        join(dataDir, folder, "council-boundary.parquet"),
      );
      for (const name of [
        "osm-land-use",
        "osm-buildings",
        "osm-roads",
        "osm-water",
      ]) {
        const file = sqlString(join(dataDir, folder, `${name}.parquet`));
        const [{ outside, duplicates } = {}] = await query(
          `WITH b AS (SELECT ST_Transform(geometry, 'EPSG:4326', 'EPSG:27700', always_xy := true) AS boundary FROM read_parquet(${boundary}))
           SELECT count(*) FILTER (WHERE ST_Distance(ST_Transform(geometry, 'EPSG:4326', 'EPSG:27700', always_xy := true), b.boundary) > 100.01) AS outside,
             count(*) - count(DISTINCT (osm_type, osm_id)) AS duplicates
           FROM read_parquet(${file}), b`,
        );
        expect({ folder, name, outside, duplicates }).toEqual({
          folder,
          name,
          outside: "0",
          duplicates: "0",
        });
      }
    }
    const ashfieldRoads = await idsIn("ashfield/osm-roads.parquet", "osm_id");
    const mansfieldRoads = await idsIn("mansfield/osm-roads.parquet", "osm_id");
    expect(ashfieldRoads).toHaveLength(243);
    expect(mansfieldRoads).toHaveLength(42);
    // Roads near where the two councils meet are in both.
    expect(
      mansfieldRoads.filter((id) => ashfieldRoads.includes(id)).length,
    ).toBeGreaterThan(0);
    expect(
      await query(
        `SELECT osm_type, osm_id, building FROM read_parquet(${sqlString(join(dataDir, "ashfield/osm-buildings.parquet"))}) WHERE osm_type = 'relation'`,
      ),
    ).toEqual([
      { osm_type: "relation", osm_id: "11288693", building: "hospital" },
    ]);
    expect(
      await query(
        `SELECT osm_id, waterway, name FROM read_parquet(${sqlString(join(dataDir, "ashfield/osm-water.parquet"))})`,
      ),
    ).toEqual([
      { osm_id: "520771889", waterway: "stream", name: "River Maun" },
    ]);
  });

  it("says how many of OpenStreetMap's multipolygons it had to leave out, rather than stopping", async () => {
    const logged: string[] = [];

    await prepare({ log: (message) => logged.push(message) });

    expect(logged).toContain(
      "1 of OpenStreetMap's multipolygons there are mapped so that no area can be built from them, so they are left out.",
    );
  });

  it("keeps the Planning Constraints still in force that reach into each council, and leaves out the rest of England's", async () => {
    await prepare({ areas: ["Ashfield", "Mansfield"] });

    const entities = async (folder: string) =>
      Object.fromEntries(
        await Promise.all(
          PLANNING_CONSTRAINT_DATASETS.map(
            async (dataset) =>
              [
                dataset,
                await idsIn(`${folder}/${dataset}.parquet`, "entity"),
              ] as const,
          ),
        ),
      );
    expect(await entities("ashfield")).toEqual({
      "conservation-area": ["44005909"],
      "listed-building": ["31691397", "31853492"],
      "listed-building-outline": [],
      "article-4-direction-area": [],
      "tree-preservation-zone": [],
      "flood-risk-zone": ["65388948", "65405620"],
    });
    // A council with none of a dataset's still has its shapes as geometry.
    expect(
      await query(
        `SELECT count(*) AS inside FROM read_parquet(${sqlString(join(dataDir, "ashfield/article-4-direction-area.parquet"))})
         WHERE ST_Intersects(geometry, ST_Point(${String(NG17_1AA.lng)}, ${String(NG17_1AA.lat)}))`,
      ),
    ).toEqual([{ inside: "0" }]);
    // 31744790's listing ended in 2023, so it is left out.
    expect(await entities("mansfield")).toEqual({
      "conservation-area": ["44005281"],
      "listed-building": ["31857253"],
      "listed-building-outline": [],
      "article-4-direction-area": [],
      "tree-preservation-zone": [],
      "flood-risk-zone": ["65399692", "65405620"],
    });
    expect(
      await query(
        `SELECT name, "listed-building-grade" AS grade, ST_AsText(geometry) AS geometry, ST_AsText(point) AS point
         FROM read_parquet(${sqlString(join(dataDir, "ashfield/listed-building.parquet"))}) WHERE entity = 31853492`,
      ),
    ).toEqual([
      {
        name: "215, MANSFIELD ROAD, ASHFIELD",
        grade: "II",
        geometry: "POINT (-1.25236 53.14115)",
        point: "POINT (-1.25236 53.14115)",
      },
    ]);
  });

  it("builds each council's Land Parcels inside its boundary, clear of buildings and roads, and tags them", async () => {
    await prepare({ areas: ["Ashfield", "Mansfield"] });

    for (const folder of ["ashfield", "mansfield"]) {
      const file = (name: string) =>
        sqlString(join(dataDir, folder, `${name}.parquet`));
      const bng = (geometry: string) =>
        `ST_Transform(${geometry}, 'EPSG:4326', 'EPSG:27700', always_xy := true)`;
      const [checked = {}] = await query(
        `WITH p AS (SELECT * FROM read_parquet(${file("land-parcels")})),
           b AS (SELECT ${bng("geometry")} AS boundary FROM read_parquet(${file("council-boundary")}))
         SELECT count(*) AS parcels,
           count(*) FILTER (WHERE ST_Area(ST_Difference(${bng("p.geometry")}, b.boundary)) > 1) AS outside,
           count(*) FILTER (WHERE area_m2 < 100) AS small,
           count(*) FILTER (WHERE possibly_unregistered <> (inspire_coverage < 0.5)) AS mistagged,
           count(*) FILTER (WHERE estimated_homes <> floor(area_m2 / 10000 * 0.6 * 30)) AS miscounted,
           count(*) FILTER (WHERE NOT starts_with(parcel_id, ${sqlString(folder === "ashfield" ? "E07000170-" : "E07000174-")})) AS misnamed,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM read_parquet(${file("osm-buildings")}) k
             WHERE ST_Area(ST_Intersection(${bng("p.geometry")}, ${bng("k.geometry")})) > 1
           )) AS on_buildings,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM read_parquet(${file("osm-roads")}) r
             WHERE r.highway IN ('residential', 'secondary', 'trunk', 'unclassified', 'service')
               AND ST_Crosses(${bng("r.geometry")}, ${bng("p.geometry")})
           )) AS crossed
         FROM p, b`,
      );
      expect({ folder, ...checked }).toEqual({
        folder,
        parcels: folder === "ashfield" ? "5" : "1",
        outside: "0",
        small: "0",
        mistagged: "0",
        miscounted: "0",
        misnamed: "0",
        on_buildings: "0",
        crossed: "0",
      });
    }
    expect(
      await query(
        `SELECT parcel_id, land_use, round(area_m2) AS area_m2, possibly_unregistered, len(inspire_polygons) AS titles
         FROM read_parquet(${sqlString(join(dataDir, "ashfield/land-parcels.parquet"))})
         WHERE parcel_id = 'E07000170-2'`,
      ),
    ).toEqual([
      {
        parcel_id: "E07000170-2",
        land_use: ["landuse=farmland"],
        area_m2: 195_224,
        possibly_unregistered: false,
        titles: "3",
      },
    ]);
  });

  it("keeps the postcodes within 1 mile of each council from Code-Point Open, for the land sales near its Land Opportunities", async () => {
    const manifest = await prepare({ areas: ["Ashfield", "Mansfield"] });

    const bng = (geometry: string) =>
      `ST_Transform(${geometry}, 'EPSG:4326', 'EPSG:27700', always_xy := true)`;
    const summary = async (folder: string) =>
      query(
        `WITH p AS (SELECT * FROM read_parquet(${sqlString(join(dataDir, folder, "postcodes.parquet"))})),
           b AS (SELECT ${bng("geometry")} AS boundary FROM read_parquet(${sqlString(join(dataDir, folder, "council-boundary.parquet"))}))
         SELECT count(*) AS postcodes,
           count(*) FILTER (WHERE ST_Distance(${bng("p.geometry")}, b.boundary) > 1609.344) AS beyond_a_mile,
           count(*) FILTER (WHERE ST_Distance(${bng("p.geometry")}, b.boundary) > 0) AS outside,
           count(*) FILTER (WHERE abs(ST_X(p.geometry) - lng) > 1e-9 OR abs(ST_Y(p.geometry) - lat) > 1e-9) AS misplaced,
           count(*) FILTER (WHERE postcode LIKE '%  %') AS double_spaced,
           bool_or(postcode = 'NG17 1AA') AS ng17_1aa,
           bool_or(starts_with(postcode, 'LE')) AS leicestershire
         FROM p, b`,
      );
    // The recording has 2,860 postcodes: around Sutton Parkway, where
    // Ashfield meets Mansfield, near Pinxton, and Hartshorne Wood's, which
    // are nowhere near either. Those within a mile of a council's boundary
    // are kept, across it too.
    expect(await summary("ashfield")).toEqual([
      {
        postcodes: "2128",
        beyond_a_mile: "0",
        outside: "675",
        misplaced: "0",
        double_spaced: "0",
        ng17_1aa: true,
        leicestershire: false,
      },
    ]);
    expect(await summary("mansfield")).toEqual([
      {
        postcodes: "1128",
        beyond_a_mile: "0",
        outside: "309",
        misplaced: "0",
        double_spaced: "0",
        ng17_1aa: false,
        leicestershire: false,
      },
    ]);
    expect(
      manifest.landCoverageAreas.map(({ datasets }) =>
        datasets.find(({ id }) => id === "postcodes"),
      ),
    ).toMatchObject([
      {
        source: "Ordnance Survey's Code-Point Open",
        sourceDate: "2026-08",
        file: "ashfield/postcodes.parquet",
        attribution: CODE_POINT_OPEN_ATTRIBUTION,
      },
      { sourceDate: "2026-08", file: "mansfield/postcodes.parquet" },
    ]);
  });

  it("prepares the rest without postcodes, warning, if Code-Point Open fails", async () => {
    const said: string[] = [];
    const noCodePoint = ((url: string, init?: RequestInit) =>
      url === RECORDED_CODE_POINT_OPEN
        ? Promise.resolve(new Response("Service unavailable", { status: 503 }))
        : recordedSources(url, init)) as typeof fetch;

    const manifest = await prepare({
      fetch: noCodePoint,
      log: (message) => said.push(message),
    });

    expect(said).toContain(
      `Warning: Ordnance Survey answered 503 for ${RECORDED_CODE_POINT_OPEN}. Code-Point Open is skipped, so nearby land sales can't be found, and CCOD and OCOD are skipped too, as it places their titles.`,
    );
    expect(
      manifest.landCoverageAreas[0]?.datasets.map(({ id }) => id),
    ).not.toContain("postcodes");
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield").filter(
        (file) => file !== "ashfield/postcodes.parquet",
      ),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
  });

  it("dates a Planning Constraint dataset by the day it was downloaded if planning.data.gov.uk doesn't say when it was written", async () => {
    const undated = (async (url: string, init?: RequestInit) => {
      const response = await recordedSources(url, init);
      if (!url.startsWith("https://files.planning.data.gov.uk/"))
        return response;
      return new Response(await response.arrayBuffer());
    }) as typeof fetch;

    const manifest = await prepare({ fetch: undated, now: () => SECOND_RUN });

    expect(
      manifest.landCoverageAreas[0]?.datasets
        .filter(({ source }) => source === "planning.data.gov.uk")
        .map(({ sourceDate }) => sourceDate),
    ).toEqual(Array(6).fill("2026-11-08"));
  });

  it("refuses a council HM Land Registry has no INSPIRE file for, saying where to name it, and changes nothing", async () => {
    await prepare();
    const before = await readManifest();
    const withoutAshfield = (async (url: string, init?: RequestInit) => {
      const response = await recordedSources(url, init);
      if (
        url !==
          "https://use-land-property-data.service.gov.uk/datasets/inspire/download" ||
        !response.ok
      ) {
        return response;
      }
      return new Response(
        (await response.text()).replaceAll(
          "Ashfield District Council",
          "Ashfeld",
        ),
      );
    }) as typeof fetch;

    await expect(prepare({ fetch: withoutAshfield })).rejects.toThrow(
      /HM Land Registry has no one INSPIRE Index Polygons file for Ashfield \(E07000170\).*INSPIRE_NAMES/,
    );
    expect(await readManifest()).toEqual(before);
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
  });

  it("changes nothing if a land download fails, or a Planning Constraint dataset's columns have changed", async () => {
    await prepare();
    const before = await readManifest();
    const floodZones =
      "https://files.planning.data.gov.uk/dataset/flood-risk-zone.parquet";
    const failing = ((url: string, init?: RequestInit) =>
      url === floodZones
        ? Promise.resolve(new Response("Service unavailable", { status: 503 }))
        : recordedSources(url, init)) as typeof fetch;
    const renamed = ((url: string, init?: RequestInit) =>
      recordedSources(
        url === floodZones
          ? "https://files.planning.data.gov.uk/dataset/conservation-area.parquet"
          : url,
        init,
      )) as typeof fetch;

    await expect(prepare({ fetch: failing })).rejects.toThrow(
      /planning.data.gov.uk answered 503 for .*flood-risk-zone.parquet/,
    );
    await expect(prepare({ fetch: renamed })).rejects.toThrow(
      /planning.data.gov.uk's flood-risk-zone dataset has no column "flood-risk-level"/,
    );
    expect(await readManifest()).toEqual(before);
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
  });
});

describe("CCOD and OCOD, for Ownership Categories", () => {
  /** Runs data:prepare, keeping what it says. */
  const prepareLogged = async (options: Partial<PrepareOptions> = {}) => {
    const said: string[] = [];
    const manifest = await prepare({
      log: (message) => {
        said.push(message);
      },
      ...options,
    });
    return { manifest, said: said.join("\n") };
  };

  const ownershipOf = (folder = "ashfield") =>
    query(
      `SELECT parcel_id, ownership_category, list_transform(inspire_polygons, p -> p.ownership_category) AS polygons,
         list_transform(matched_titles, t -> t.title_number) AS titles
       FROM read_parquet(${sqlString(join(dataDir, folder, "land-parcels.parquet"))})
       ORDER BY parcel_id`,
    );

  const LICENCE = (dataset: string) =>
    `https://use-land-property-data.service.gov.uk/datasets/${dataset}/licence/view`;

  it("are skipped with a warning without LAND_REGISTRY_DATA_API_KEY, so Land Parcels are only Possibly Unregistered or registered", async () => {
    const { manifest, said } = await prepareLogged();

    expect(said).toContain(
      "Warning: LAND_REGISTRY_DATA_API_KEY is not set, so HM Land Registry's UK companies that own property in England and Wales (CCOD) and Overseas companies that own property in England and Wales (OCOD) are skipped",
    );
    expect(manifest.datasets.map(({ id }) => id)).not.toContain("ccod");
    expect(manifest.datasets.map(({ id }) => id)).not.toContain("ocod");
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
    for (const parcel of await ownershipOf()) {
      expect(parcel).toMatchObject({
        ownership_category: null,
        titles: [],
      });
      expect(parcel.polygons).toEqual(
        (parcel.polygons as unknown[]).map(() => null),
      );
    }
  });

  it("are downloaded with the key as HM Land Registry's API hands them out, keeping England's titles without their proprietors, and credited as their licence requires", async () => {
    const { manifest } = await prepareLogged({
      landRegistryApiKey: RECORDED_LAND_REGISTRY_API_KEY,
    });

    expect(
      manifest.datasets.filter(({ id }) => id === "ccod" || id === "ocod"),
    ).toEqual([
      {
        id: "ccod",
        name: "UK companies that own property in England and Wales",
        source: "HM Land Registry",
        sourceUrl:
          "https://use-land-property-data.service.gov.uk/api/v1/datasets/ccod/CCOD_FULL_2026_10.zip",
        sourceDate: "2026-10-02",
        preparedAt: FIRST_RUN.toISOString(),
        file: "england/ccod.parquet",
        attribution: {
          statements: [
            "Information produced by HM Land Registry. © Crown copyright 2026.",
          ],
          conditionsUrl: LICENCE("ccod"),
        },
      },
      {
        id: "ocod",
        name: "Overseas companies that own property in England and Wales",
        source: "HM Land Registry",
        sourceUrl:
          "https://use-land-property-data.service.gov.uk/api/v1/datasets/ocod/OCOD_FULL_2026_10.zip",
        sourceDate: "2026-10-02",
        preparedAt: FIRST_RUN.toISOString(),
        file: "england/ocod.parquet",
        attribution: {
          statements: [
            "Information produced by HM Land Registry. © Crown copyright 2026.",
          ],
          conditionsUrl: LICENCE("ocod"),
        },
      },
    ]);
    const ccod = await readRows(join(dataDir, "england/ccod.parquet"));
    // Cardiff's title is in Wales, and left out.
    expect(ccod.map(({ title_number }) => title_number)).toEqual([
      "ZZ100001",
      "ZZ100002",
      "ZZ100003",
      "ZZ100004",
      "ZZ100005",
      "ZZ100006",
      "ZZ100007",
    ]);
    expect(Object.keys(ccod[0] ?? {})).toEqual([
      "title_number",
      "tenure",
      "property_address",
      "district",
      "county",
      "region",
      "postcode",
      "multiple_address_indicator",
      "proprietorship_category",
    ]);
    // OCOD's columns are found whatever their capitals.
    expect(await readRows(join(dataDir, "england/ocod.parquet"))).toEqual([
      expect.objectContaining({
        title_number: "ZZ200001",
        property_address: "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE)",
        multiple_address_indicator: "N",
        proprietorship_category: "Limited Company or Public Limited Company",
      }),
    ]);
  });

  it("match each council's freehold titles to one INSPIRE Index Polygon by address or named building, giving its Land Parcels and their polygons Ownership Categories", async () => {
    const { said } = await prepareLogged({
      areas: ["Ashfield", "Mansfield"],
      landRegistryApiKey: RECORDED_LAND_REGISTRY_API_KEY,
    });

    // Smart Aluminium's, Romo's and Metal Craft Group's; not Kings Mill
    // Hospital's, which names a building over two polygons, nor land
    // described only by its street.
    expect(said).toContain(
      "Matched 3 of its 5 freehold titles in CCOD and OCOD to one INSPIRE Index Polygon each, by their addresses.",
    );
    expect(said).toContain(
      "Matched 0 of its 1 freehold titles in CCOD and OCOD to one INSPIRE Index Polygon each, by their addresses.",
    );
    expect(said).toContain(
      "1 of the titles in England name a District that is no English council's, such as HARROGATE, so no Land Coverage Area has them.",
    );
    expect(await ownershipOf()).toEqual([
      {
        parcel_id: "E07000170-1",
        ownership_category: "other-registered",
        polygons: ["other-registered"],
        titles: [],
      },
      {
        parcel_id: "E07000170-2",
        ownership_category: "other-registered",
        polygons: ["other-registered", "other-registered", "other-registered"],
        // Metal Craft Group's, 9 m away.
        titles: ["ZZ200001"],
      },
      ...["E07000170-3", "E07000170-4", "E07000170-5"].map((id) => ({
        parcel_id: id,
        ownership_category: "other-registered",
        polygons: expect.arrayContaining(["other-registered"]) as unknown,
        titles: [],
      })),
    ]);
    const [matched] = await query(
      `SELECT matched_titles[1] AS title FROM read_parquet(${sqlString(join(dataDir, "ashfield/land-parcels.parquet"))})
       WHERE parcel_id = 'E07000170-2'`,
    );
    expect(matched?.title).toEqual({
      title_number: "ZZ200001",
      property_address: "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE)",
      proprietorship_category: "Limited Company or Public Limited Company",
      ownership_category: "company",
      dataset: "ocod",
      source_date: "2026-10-02",
      matched_by: "named",
      inspire_id: "25709295",
      distance_m: expect.closeTo(9.44, 2) as unknown,
    });
    expect(await ownershipOf("mansfield")).toEqual([
      expect.objectContaining({ ownership_category: "other-registered" }),
    ]);
  });

  it("are skipped with a warning, and the rest prepared, if HM Land Registry refuses the key, Code-Point Open fails, or a CSV's columns have changed", async () => {
    const wrongKey = await prepareLogged({ landRegistryApiKey: "not-a-key" });
    expect(wrongKey.said).toMatch(
      /Warning: HM Land Registry's API answered 404 for https:\/\/use-land-property-data\.service\.gov\.uk\/api\/v1\/datasets\/ccod: API Key provided is incorrect or does not exist\. CCOD and OCOD are skipped/,
    );
    expect(wrongKey.manifest.datasets.map(({ id }) => id)).not.toContain(
      "ccod",
    );

    const noCodePoint = ((url: string, init?: RequestInit) =>
      url === RECORDED_CODE_POINT_OPEN
        ? Promise.resolve(new Response("Service unavailable", { status: 503 }))
        : recordedSources(url, init)) as typeof fetch;
    const failed = await prepareLogged({
      fetch: noCodePoint,
      landRegistryApiKey: RECORDED_LAND_REGISTRY_API_KEY,
    });
    expect(failed.said).toContain(
      `Warning: Ordnance Survey answered 503 for ${RECORDED_CODE_POINT_OPEN}. Code-Point Open is skipped, so nearby land sales can't be found, and CCOD and OCOD are skipped too`,
    );

    // Code-Point Open's CSV in place of CCOD's has none of its columns.
    const renamed = ((url: string, init?: RequestInit) =>
      recordedSources(
        url.includes("/ccod/CCOD_FULL_2026_10.zip?")
          ? RECORDED_CODE_POINT_OPEN
          : url,
        init,
      )) as typeof fetch;
    const changed = await prepareLogged({
      fetch: renamed,
      landRegistryApiKey: RECORDED_LAND_REGISTRY_API_KEY,
    });
    expect(changed.said).toMatch(
      /Warning: UK companies that own property in England and Wales has no column "Title Number", "Tenure", .*"Proprietorship Category \(1\)"\. Its layout may have changed\. CCOD and OCOD are skipped/,
    );
    for (const { manifest } of [wrongKey, failed, changed]) {
      expect(manifest.datasets.map(({ id }) => id)).not.toContain("ocod");
    }
    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
    for (const parcel of await ownershipOf()) {
      expect(parcel.ownership_category).toBeNull();
    }
  });

  it("are removed when a later run is without the key", async () => {
    await prepare({ landRegistryApiKey: RECORDED_LAND_REGISTRY_API_KEY });
    expect(await filesIn()).toContain("england/ccod.parquet");

    await prepare({ now: () => SECOND_RUN });

    expect(await filesIn()).toEqual([
      ...landFiles("ashfield"),
      ...ENGLAND_FILES,
      "manifest.json",
    ]);
  });
});

describe("councilFolder", () => {
  it.each([
    ["Ashfield", "ashfield"],
    ["King's Lynn and West Norfolk", "king-s-lynn-and-west-norfolk"],
    ["Bristol, City of", "bristol-city-of"],
    ["St. Helens", "st-helens"],
  ])("puts %s in %s/", (name, folder) => {
    expect(councilFolder({ code: "E00000000", name })).toBe(folder);
  });
});

describe("the API's prepared-data fixture", () => {
  it("is what data:prepare makes of the recorded boundaries the first time, with the key for CCOD and OCOD", async () => {
    const manifest = await prepare({
      now: () => FIXTURE_PREPARED_AT,
      landRegistryApiKey: RECORDED_LAND_REGISTRY_API_KEY,
    });

    const fixture: unknown = JSON.parse(
      await readFile(join(API_PREPARED_DATA_FIXTURE, MANIFEST_FILE), "utf8"),
    );
    expect(fixture).toEqual(manifest);
    for (const { file } of [
      ...manifest.datasets,
      ...manifest.landCoverageAreas.flatMap(({ datasets }) => datasets),
    ]) {
      expect(await readRows(join(API_PREPARED_DATA_FIXTURE, file))).toEqual(
        await readRows(join(dataDir, file)),
      );
    }
  });
});
