import { createWriteStream } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

import type { DuckDBConnection } from "@duckdb/node-api";
import { CENSUS_AGE_BANDS, type AgeBand } from "@location-scout/shared";

import {
  DOWNLOAD_TIMEOUT_MS,
  USER_AGENT,
  queryPages,
  type ArcGisQuery,
} from "./arcgis";
import { ENGLISH_CODE_PREFIX } from "./council-boundaries";
import { sqlString } from "./duckdb";

/**
 * The England-wide datasets behind the Demographics Layer (PRD FR-2.7a,
 * FR-6.0): Census 2021 by output area, with the output areas' boundaries,
 * ONS's household income estimates by MSOA, and the English Indices of
 * Deprivation by LSOA. Each source's edition is in its constant here, so a
 * new edition means changing that constant and nothing else.
 */

const ONS_ARCGIS =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services";

/**
 * Every output area's boundary from ONS Open Geography, as at December 2021,
 * generalised to 20 m and clipped to the coastline (BGC), with the LSOA and
 * MSOA it is in from ONS's lookup of the same date. Output areas are Census
 * 2021's smallest areas, of about 125 households each.
 */
export const OUTPUT_AREA_BOUNDARIES = {
  name: "Output area boundaries",
  source: "ONS Open Geography",
  url: `${ONS_ARCGIS}/Output_Areas_2021_EW_BGC_V2/FeatureServer/0`,
  lookupUrl: `${ONS_ARCGIS}/OA_LSOA_MSOA_EW_DEC_2021_LU_v3/FeatureServer/0`,
  sourceDate: "2021-12",
  codeField: "OA21CD",
  lookupFields: {
    lsoaCode: "LSOA21CD",
    lsoaName: "LSOA21NM",
    msoaCode: "MSOA21CD",
    msoaName: "MSOA21NM",
  },
} as const;

const englishOutputAreas = `${OUTPUT_AREA_BOUNDARIES.codeField} LIKE '${ENGLISH_CODE_PREFIX}%'`;

/** England's output areas' outlines, to the sixth decimal place (about 10 cm). */
export const OUTPUT_AREAS_QUERY: ArcGisQuery = {
  source: OUTPUT_AREA_BOUNDARIES.source,
  url: OUTPUT_AREA_BOUNDARIES.url,
  params: {
    where: englishOutputAreas,
    outFields: OUTPUT_AREA_BOUNDARIES.codeField,
    outSR: "4326",
    geometryPrecision: "6",
    orderByFields: OUTPUT_AREA_BOUNDARIES.codeField,
    f: "geojson",
  },
  // 178,605 output areas, 2,000 a page.
  maxPages: 200,
};

/** The LSOA and MSOA each English output area is in. */
export const OUTPUT_AREA_LOOKUP_QUERY: ArcGisQuery = {
  source: OUTPUT_AREA_BOUNDARIES.source,
  url: OUTPUT_AREA_BOUNDARIES.lookupUrl,
  params: {
    where: englishOutputAreas,
    outFields: [
      OUTPUT_AREA_BOUNDARIES.codeField,
      ...Object.values(OUTPUT_AREA_BOUNDARIES.lookupFields),
    ].join(","),
    orderByFields: OUTPUT_AREA_BOUNDARIES.codeField,
    f: "geojson",
  },
  // The lookup gives 1,000 a page.
  maxPages: 400,
};

/** A Census 2021 age band as Nomis names its column, for example `Age: Aged 5 to 9 years`. */
export const ageBandColumn = ({ from, to }: AgeBand) =>
  from === 0
    ? `Age: Aged ${String(to)} years and under`
    : to === null
      ? `Age: Aged ${String(from)} years and over`
      : `Age: Aged ${String(from)} to ${String(to)} years`;

/**
 * Census 2021's figures by output area, from Nomis's bulk downloads: one zip
 * per table, each with a CSV per geography. Census day was 21 March 2021.
 */
export const CENSUS_2021 = {
  name: "Census 2021 by output area",
  source: "ONS Census 2021",
  url: "https://www.nomisweb.co.uk/sources/census_2021_bulk",
  sourceDate: "2021-03-21",
  codeColumn: "geography code",
  tables: {
    population: {
      table: "ts001",
      columns: ["Residence type: Total; measures: Value"],
    },
    households: {
      table: "ts041",
      columns: ["Number of households: Number of households; measures: Value"],
    },
    populationDensity: {
      table: "ts006",
      columns: [
        "Population Density: Persons per square kilometre; measures: Value",
      ],
    },
    ages: { table: "ts007a", columns: CENSUS_AGE_BANDS.map(ageBandColumn) },
  },
} as const;

export type CensusTable = keyof typeof CENSUS_2021.tables;

/** A Census table's bulk download. */
export const censusTableUrl = (table: string) =>
  `https://www.nomisweb.co.uk/output/census/2021/census2021-${table}.zip`;

/** The table's CSV by output area, inside its zip. */
export const censusTableMember = (table: string) =>
  `census2021-${table}-oa.csv`;

/**
 * ONS's small area income estimates for the financial year ending March 2023:
 * each MSOA's average total annual household income, in an Excel workbook
 * whose sheet has a title above its table.
 */
export const INCOME_ESTIMATES = {
  name: "Household income estimates by MSOA",
  source: "ONS small area income estimates",
  url: "https://www.ons.gov.uk/file?uri=/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/smallareaincomeestimatesformiddlelayersuperoutputareasenglandandwales/financialyearending2023/datasetfinal.xlsx",
  /** The financial year ending March 2023. */
  sourceDate: "2023-03",
  sheet: "Total annual income",
  /** The table's header, by spreadsheet column. */
  header: {
    msoaCode: { column: "Field1", name: "MSOA code" },
    msoaName: { column: "Field2", name: "MSOA name" },
    income: { column: "Field7", name: "Total annual income (£)" },
  },
} as const;

/**
 * The English Indices of Deprivation 2025, published by the Ministry of
 * Housing, Communities and Local Government on 30 October 2025: File 7, with
 * every LSOA's ranks, deciles and scores.
 */
export const INDICES_OF_DEPRIVATION = {
  name: "English Indices of Deprivation 2025",
  source: "English Indices of Deprivation",
  url: "https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv",
  sourceDate: "2025-10-30",
  columns: {
    lsoaCode: "LSOA code (2021)",
    lsoaName: "LSOA name (2021)",
    score: "Index of Multiple Deprivation (IMD) Score",
    rank: "Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)",
    decile:
      "Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)",
  },
} as const;

/**
 * Downloads a file to `file`, a piece at a time, saying who is asking, with
 * any other `headers`, giving up after `timeoutMs`. Returns the response's
 * headers.
 */
export const downloadFile = async (
  fetchFn: typeof fetch,
  source: string,
  url: string,
  file: string,
  {
    headers = {},
    timeoutMs = DOWNLOAD_TIMEOUT_MS,
  }: { headers?: Record<string, string>; timeoutMs?: number } = {},
) => {
  const response = await fetchFn(url, {
    headers: { "user-agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) {
    throw new Error(`${source} answered ${String(response.status)} for ${url}`);
  }
  await pipeline(
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
    createWriteStream(file),
  );
  return response.headers;
};

/** A column's name as an SQL identifier. */
export const quoted = (column: string) => `"${column.replaceAll('"', '""')}"`;

/** Throws, naming them, if any of `columns` is missing from what `from` reads. */
export const requireColumns = async (
  connection: DuckDBConnection,
  from: string,
  values: readonly string[],
  columns: readonly string[],
  what: string,
) => {
  const described = await connection.runAndReadAll(
    `DESCRIBE SELECT * FROM ${from}`,
    [...values],
  );
  const present = new Set(
    described.getRowObjectsJson().map(({ column_name }) => column_name),
  );
  const missing = columns.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new Error(
      `${what} has no column ${missing.map((column) => `"${column}"`).join(", ")}. Its layout may have changed.`,
    );
  }
};

/** Reads a CSV inside a zip with DuckDB's spatial extension (GDAL), as text. */
const zippedCsv = (zip: string, member: string) => `/vsizip/${zip}/${member}`;

/**
 * Downloads every output area's boundary and the LSOA and MSOA it is in, a
 * page at a time, into the table `output_areas`: `code`, `lsoa_code`,
 * `lsoa_name`, `msoa_code`, `msoa_name`, the bounds of its outline (`xmin`,
 * `ymin`, `xmax`, `ymax`) and the outline itself, `geometry`.
 */
const loadOutputAreas = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
) => {
  const { codeField, lookupFields } = OUTPUT_AREA_BOUNDARIES;
  const page = join(workDir, "output-areas-page.geojson");
  await connection.run(
    "CREATE TABLE output_area_shapes (code VARCHAR, geometry GEOMETRY)",
  );
  await queryPages(fetchFn, OUTPUT_AREAS_QUERY, async (features) => {
    await writeFile(page, JSON.stringify(features));
    await connection.run(
      `INSERT INTO output_area_shapes
         SELECT ${quoted(codeField)}, geom FROM ST_Read($1)`,
      [page],
    );
  });
  await connection.run(
    `CREATE TABLE output_area_lookup (code VARCHAR, lsoa_code VARCHAR,
       lsoa_name VARCHAR, msoa_code VARCHAR, msoa_name VARCHAR)`,
  );
  await queryPages(fetchFn, OUTPUT_AREA_LOOKUP_QUERY, async (features) => {
    await writeFile(page, JSON.stringify(features));
    await connection.run(
      `INSERT INTO output_area_lookup
         SELECT ${[codeField, ...Object.values(lookupFields)].map(quoted).join(", ")}
         FROM ST_Read($1)`,
      [page],
    );
  });
  await rm(page, { force: true });
  await connection.run(
    `CREATE TABLE output_areas AS
       SELECT s.code, l.lsoa_code, l.lsoa_name, l.msoa_code, l.msoa_name,
         ST_XMin(s.geometry) AS xmin, ST_YMin(s.geometry) AS ymin,
         ST_XMax(s.geometry) AS xmax, ST_YMax(s.geometry) AS ymax,
         s.geometry
       FROM output_area_shapes s LEFT JOIN output_area_lookup l USING (code)
       WHERE starts_with(s.code, $1)`,
    [ENGLISH_CODE_PREFIX],
  );
  await connection.run("DROP TABLE output_area_shapes");
  await connection.run("DROP TABLE output_area_lookup");
};

/**
 * Downloads Census 2021's tables into the table `census`: each English
 * output area's `code`, `population`, `households`, `population_density`
 * and `ages`, its residents in each of `CENSUS_AGE_BANDS`.
 */
const loadCensus = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
) => {
  const { codeColumn, tables } = CENSUS_2021;
  const read: Partial<Record<CensusTable, string>> = {};
  for (const [name, { table, columns }] of Object.entries(tables)) {
    const zip = join(workDir, `census2021-${table}.zip`);
    await downloadFile(fetchFn, CENSUS_2021.source, censusTableUrl(table), zip);
    const csv = zippedCsv(zip, censusTableMember(table));
    await requireColumns(
      connection,
      "ST_Read($1)",
      [csv],
      [codeColumn, ...columns],
      `Census 2021 table ${table.toUpperCase()}`,
    );
    read[name as CensusTable] = csv;
  }
  const column = (table: CensusTable, index = 0) =>
    quoted(tables[table].columns[index] ?? "");
  await connection.run(
    `CREATE TABLE census AS
       SELECT p.code,
         CAST(p.population AS INTEGER) AS population,
         CAST(h.households AS INTEGER) AS households,
         CAST(d.population_density AS DOUBLE) AS population_density,
         a.ages
       FROM (SELECT ${quoted(codeColumn)} AS code, ${column("population")} AS population FROM ST_Read($1)) p
       JOIN (SELECT ${quoted(codeColumn)} AS code, ${column("households")} AS households FROM ST_Read($2)) h USING (code)
       JOIN (SELECT ${quoted(codeColumn)} AS code, ${column("populationDensity")} AS population_density FROM ST_Read($3)) d USING (code)
       JOIN (SELECT ${quoted(codeColumn)} AS code,
               [${tables.ages.columns.map((_, index) => `CAST(${column("ages", index)} AS INTEGER)`).join(", ")}] AS ages
             FROM ST_Read($4)) a USING (code)
       WHERE starts_with(p.code, $5)`,
    [
      read.population ?? "",
      read.households ?? "",
      read.populationDensity ?? "",
      read.ages ?? "",
      ENGLISH_CODE_PREFIX,
    ],
  );
};

/**
 * Downloads the income estimates into the table `income`: each English
 * MSOA's `msoa_code`, `msoa_name` and average total annual household
 * `income` in pounds.
 */
const loadIncome = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
) => {
  const workbook = join(workDir, "income-estimates.xlsx");
  await downloadFile(
    fetchFn,
    INCOME_ESTIMATES.source,
    INCOME_ESTIMATES.url,
    workbook,
  );
  const { sheet, header } = INCOME_ESTIMATES;
  // The sheet's title is above its table, so its header is read as a row.
  await connection.run(
    `CREATE TEMP VIEW income_sheet AS
       SELECT * FROM ST_Read(${sqlString(workbook)},
         layer := ${sqlString(sheet)},
         open_options := ['HEADERS=DISABLE'])`,
  );
  const columns = Object.values(header);
  const headerRows = await connection.runAndReadAll(
    `SELECT count(*) AS found FROM income_sheet
       WHERE ${columns.map(({ column }, index) => `${column} = $${String(index + 1)}`).join(" AND ")}`,
    columns.map(({ name }) => name),
  );
  if (Number(headerRows.getRowObjectsJson()[0]?.found ?? 0) !== 1) {
    throw new Error(
      `${INCOME_ESTIMATES.source}' sheet "${sheet}" has no header ${columns.map(({ name }) => `"${name}"`).join(", ")}. Its layout may have changed.`,
    );
  }
  await connection.run(
    `CREATE TABLE income AS
       SELECT ${header.msoaCode.column} AS msoa_code,
         ${header.msoaName.column} AS msoa_name,
         CAST(round(CAST(${header.income.column} AS DOUBLE)) AS INTEGER) AS income
       FROM income_sheet
       WHERE starts_with(${header.msoaCode.column}, $1)`,
    [ENGLISH_CODE_PREFIX],
  );
  await connection.run("DROP VIEW income_sheet");
};

/**
 * Downloads the Indices of Deprivation into the table `deprivation`: each
 * LSOA's `lsoa_code`, `lsoa_name`, and its Index of Multiple Deprivation
 * `score`, `rank` and `decile`.
 */
const loadDeprivation = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
) => {
  const csv = join(workDir, "indices-of-deprivation.csv");
  await downloadFile(
    fetchFn,
    INDICES_OF_DEPRIVATION.source,
    INDICES_OF_DEPRIVATION.url,
    csv,
  );
  const { columns } = INDICES_OF_DEPRIVATION;
  const from = "read_csv($1, all_varchar = true)";
  await requireColumns(
    connection,
    from,
    [csv],
    Object.values(columns),
    INDICES_OF_DEPRIVATION.name,
  );
  await connection.run(
    `CREATE TABLE deprivation AS
       SELECT ${quoted(columns.lsoaCode)} AS lsoa_code,
         ${quoted(columns.lsoaName)} AS lsoa_name,
         CAST(${quoted(columns.score)} AS DOUBLE) AS score,
         CAST(${quoted(columns.rank)} AS INTEGER) AS rank,
         CAST(${quoted(columns.decile)} AS INTEGER) AS decile
       FROM ${from}
       WHERE starts_with(${quoted(columns.lsoaCode)}, $2)`,
    [csv, ENGLISH_CODE_PREFIX],
  );
};

/**
 * Downloads the Demographics Layer's sources into `workDir` and loads them
 * into DuckDB as the tables `output_areas`, `census`, `income` and
 * `deprivation`, keeping only England's. Throws if a download fails or a
 * source's layout is not what it was.
 */
export const loadDemographics = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
  log: (message: string) => void,
) => {
  log(
    `Downloading the output area boundaries from ${OUTPUT_AREA_BOUNDARIES.source}, a page at a time…`,
  );
  await loadOutputAreas(connection, fetchFn, workDir);
  log(`Downloading Census 2021 by output area from Nomis…`);
  await loadCensus(connection, fetchFn, workDir);
  log(`Downloading the ${INCOME_ESTIMATES.source}…`);
  await loadIncome(connection, fetchFn, workDir);
  log(`Downloading the ${INDICES_OF_DEPRIVATION.name}…`);
  await loadDeprivation(connection, fetchFn, workDir);
};

/** England's bounds, for ordering output areas along a Hilbert curve. */
/** England's bounds, along which a Hilbert curve puts near shapes together. */
export const ENGLAND_BOUNDS =
  "{'min_x': -6.5, 'min_y': 49.8, 'max_x': 2.0, 'max_y': 55.9}::BOX_2D";

/**
 * The queries that write each of the Demographics Layer's tables to its
 * file. Output areas are written near ones together, along a Hilbert curve,
 * in small row groups, so that a query of a Search Area's bounds reads only
 * the few row groups whose bounds reach it.
 */
export const DEMOGRAPHICS_COPIES = {
  outputAreas: {
    query: `SELECT * FROM output_areas
      ORDER BY ST_Hilbert(geometry, ${ENGLAND_BOUNDS})`,
    rowGroupSize: 2048,
  },
  census: { query: "SELECT * FROM census ORDER BY code", rowGroupSize: null },
  income: {
    query: "SELECT * FROM income ORDER BY msoa_code",
    rowGroupSize: null,
  },
  deprivation: {
    query: "SELECT * FROM deprivation ORDER BY lsoa_code",
    rowGroupSize: null,
  },
} as const;
