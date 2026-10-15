import { join } from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";
import {
  CCOD_DATASET,
  OCOD_DATASET,
  titleAttribution,
  type DatasetAttribution,
  type TitleDataset,
} from "@location-scout/shared";

import {
  DOWNLOAD_TIMEOUT_MS,
  LARGE_DOWNLOAD_TIMEOUT_MS,
  USER_AGENT,
} from "./arcgis";
import { downloadFile } from "./demographics";
import { sqlString } from "./duckdb";
import { tidyName } from "./inspire";
import { zipMemberNames } from "./zip";

/**
 * HM Land Registry's datasets of the titles held by UK companies (CCOD) and
 * by overseas companies (OCOD), which the indicative Ownership Categories
 * come from (PRD FR-5.4a, FR-6.0). They are free, but downloading them needs
 * a Use land and property data account, its licences agreed, and its API
 * key in `LAND_REGISTRY_DATA_API_KEY`. Without one, they are skipped with a
 * warning, and Land Parcels are only Possibly Unregistered or registered.
 *
 * Each is a monthly CSV in a zip. CCOD's proprietors include councils,
 * which its Proprietorship Category says. Neither gives a title's outline:
 * titles are matched to INSPIRE Index Polygons by their addresses
 * (`title-ownership.ts`), helped by Ordnance Survey's Code-Point Open, which
 * places each postcode (`postcodes.ts`).
 */
export const COMPANY_TITLES = {
  source: "HM Land Registry",
  api: "https://use-land-property-data.service.gov.uk/api/v1",
  site: "https://use-land-property-data.service.gov.uk",
  /** The environment variable that holds the API key. */
  keyVariable: "LAND_REGISTRY_DATA_API_KEY",
  datasets: {
    [CCOD_DATASET]: {
      name: "UK companies that own property in England and Wales",
      /** The full file, not the month's changes: `CCOD_FULL_2026_10.zip`. */
      fullFile: /^CCOD_FULL_(\d{4})_(\d{2})\.zip$/,
    },
    [OCOD_DATASET]: {
      name: "Overseas companies that own property in England and Wales",
      fullFile: /^OCOD_FULL_(\d{4})_(\d{2})\.zip$/,
    },
  },
  /**
   * The columns kept, by the name each has in the CSV, whose capitals HM
   * Land Registry's own specification doesn't always agree on, so they are
   * found whatever their case. Proprietors' names and addresses are not kept:
   * an Ownership Category never names an owner.
   */
  columns: {
    title_number: "Title Number",
    tenure: "Tenure",
    property_address: "Property Address",
    district: "District",
    county: "County",
    region: "Region",
    postcode: "Postcode",
    multiple_address_indicator: "Multiple Address Indicator",
    proprietorship_category: "Proprietorship Category (1)",
  },
  /** The Region of titles in Wales, which are left out. */
  wales: "WALES",
} as const;

/** The licence each dataset is used under, whose conditions its attribution links to. */
export const titleLicenceUrl = (dataset: TitleDataset) =>
  `${COMPANY_TITLES.site}/datasets/${dataset}/licence/view`;

/** A dataset of titles as the manifest lists it. */
export interface TitleSource {
  id: TitleDataset;
  name: string;
  source: string;
  url: string;
  /** The day HM Land Registry published it, or its month if it doesn't say. */
  sourceDate: string;
  attribution: DatasetAttribution;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "2 October 2026" as `2026-10-02`, or `null`. */
const isoDay = (text: unknown) => {
  const [, day, month, year] =
    /^\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(String(text)) ?? [];
  const index = MONTHS.indexOf((month ?? "").toLowerCase());
  return day && year && index >= 0
    ? `${year}-${String(index + 1).padStart(2, "0")}-${day.padStart(2, "0")}`
    : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Asks HM Land Registry's API, with the key, for its JSON `result`. */
const askApi = async (fetchFn: typeof fetch, key: string, path: string) => {
  const url = `${COMPANY_TITLES.api}${path}`;
  const response = await fetchFn(url, {
    headers: {
      authorization: key,
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(body) || !isRecord(body.result)) {
    const said =
      isRecord(body) && typeof body.error === "string" ? `: ${body.error}` : "";
    throw new Error(
      `${COMPANY_TITLES.source}'s API answered ${String(response.status)} for ${url}${said}`,
    );
  }
  return body.result;
};

/**
 * Downloads a dataset's latest full file into `zip`, as HM Land Registry's
 * API hands it out: the dataset's resources name it, and asking for it gives
 * a link to it valid for 10 seconds, which is followed at once, without the
 * key.
 */
const downloadTitles = async (
  fetchFn: typeof fetch,
  key: string,
  dataset: TitleDataset,
  zip: string,
): Promise<TitleSource> => {
  const { name, fullFile } = COMPANY_TITLES.datasets[dataset];
  const about = await askApi(fetchFn, key, `/datasets/${dataset}`);
  const resources = Array.isArray(about.resources) ? about.resources : [];
  const file = resources
    .flatMap((resource: unknown) =>
      isRecord(resource) && typeof resource.file_name === "string"
        ? [resource.file_name]
        : [],
    )
    .find((fileName) => fullFile.test(fileName));
  const [, year, month] = (file && fullFile.exec(file)) ?? [];
  if (!file || !year || !month) {
    throw new Error(
      `${COMPANY_TITLES.source}'s API lists no full file of ${name}.`,
    );
  }
  const path = `/datasets/${dataset}/${file}`;
  const link = await askApi(fetchFn, key, path);
  if (typeof link.download_url !== "string") {
    throw new Error(`${COMPANY_TITLES.source}'s API gave no link to ${file}.`);
  }
  await downloadFile(fetchFn, COMPANY_TITLES.source, link.download_url, zip, {
    timeoutMs: LARGE_DOWNLOAD_TIMEOUT_MS,
  });
  return {
    id: dataset,
    name,
    source: COMPANY_TITLES.source,
    url: `${COMPANY_TITLES.api}${path}`,
    sourceDate: isoDay(about.last_updated) ?? `${year}-${month}`,
    attribution: {
      statements: [titleAttribution(year)],
      conditionsUrl: titleLicenceUrl(dataset),
    },
  };
};

/**
 * Loads one dataset's CSV, inside its zip, into `company_titles`: its titles
 * in England, with only the columns `COMPANY_TITLES.columns` keeps. GDAL
 * reads the CSV inside the zip, every field as text. Throws, naming them, if
 * a column is missing.
 */
const loadTitleCsv = async (
  connection: DuckDBConnection,
  zip: string,
  { id, sourceDate }: TitleSource,
) => {
  const member = (await zipMemberNames(zip)).find((name) =>
    name.toLowerCase().endsWith(".csv"),
  );
  if (!member) throw new Error(`${zip} holds no CSV.`);
  const csv = `/vsizip/${zip}/${member}`;
  const described = await connection.runAndReadAll(
    "DESCRIBE SELECT * FROM ST_Read($1, open_options := ['HEADERS=YES'])",
    [csv],
  );
  const present = new Map(
    described
      .getRowObjectsJson()
      .flatMap(({ column_name }) =>
        typeof column_name === "string"
          ? [[column_name.trim().toLowerCase(), column_name] as const]
          : [],
      ),
  );
  const wanted = Object.entries(COMPANY_TITLES.columns);
  const missing = wanted.filter(
    ([, column]) => !present.has(column.toLowerCase()),
  );
  if (missing.length > 0) {
    throw new Error(
      `${COMPANY_TITLES.datasets[id].name} has no column ${missing.map(([, column]) => `"${column}"`).join(", ")}. Its layout may have changed.`,
    );
  }
  const columns = wanted.map(
    ([as, column]) =>
      `nullif(trim("${(present.get(column.toLowerCase()) ?? column).replaceAll('"', '""')}"), '') AS ${as}`,
  );
  await connection.run(
    `INSERT INTO company_titles
       SELECT ${sqlString(id)} AS dataset, ${sqlString(sourceDate)} AS source_date, * FROM (
         SELECT ${columns.join(", ")}
         FROM ST_Read($1, open_options := ['HEADERS=YES'])
       )
       WHERE title_number IS NOT NULL
         AND upper(coalesce(region, '')) <> ${sqlString(COMPANY_TITLES.wales)}`,
    [csv],
  );
};

/**
 * Matches each District CCOD and OCOD name to the English council of that
 * name, as `tidyName` tidies both, into `title_districts` (`district`,
 * `code`). HM Land Registry names districts its own way ("CITY OF
 * WESTMINSTER", "KINGSTON UPON HULL, CITY OF"), and some by councils that no
 * longer exist, whose titles no council has.
 */
const matchDistricts = async (connection: DuckDBConnection) => {
  const read = async (sql: string) =>
    (await connection.runAndReadAll(sql)).getRowObjectsJson();
  const councils = new Map(
    (await read("SELECT code, name FROM councils")).flatMap(({ code, name }) =>
      typeof code === "string" && typeof name === "string"
        ? [[tidyName(name), code] as const]
        : [],
    ),
  );
  const districts = (
    await read(
      "SELECT DISTINCT district FROM company_titles WHERE district IS NOT NULL",
    )
  ).flatMap(({ district }) => {
    const code =
      typeof district === "string" ? councils.get(tidyName(district)) : null;
    return code && typeof district === "string" ? [[district, code]] : [];
  });
  await connection.run(
    "CREATE OR REPLACE TABLE title_districts (district VARCHAR, code VARCHAR)",
  );
  if (districts.length > 0) {
    await connection.run(
      `INSERT INTO title_districts VALUES ${districts
        .map(
          ([district = "", code = ""]) =>
            `(${sqlString(district)}, ${sqlString(code)})`,
        )
        .join(", ")}`,
    );
  }
  const [unmatched] = await read(
    `SELECT count(*) AS titles, min(district) AS example FROM company_titles
     WHERE district IS NULL OR district NOT IN (SELECT district FROM title_districts)`,
  );
  return {
    titles: Number(unmatched?.titles ?? 0),
    example: typeof unmatched?.example === "string" ? unmatched.example : null,
  };
};

/** The copies of the England-wide files: each dataset's titles, in order. */
export const companyTitlesCopy = (dataset: TitleDataset) =>
  `SELECT * EXCLUDE (dataset, source_date) FROM company_titles
   WHERE dataset = ${sqlString(dataset)} ORDER BY title_number`;

/**
 * Downloads CCOD and OCOD with the API key, if there is one, and loads their
 * titles in England into `company_titles`, and each District's English
 * council into `title_districts`. Needs the table `councils`, and every
 * postcode's point in `postcodes`, from Code-Point Open (`postcodes`), to
 * place the titles while they are matched.
 *
 * Returns the two datasets, or `null`, warning why, if there is no key, or
 * a download or a CSV fails, as when HM Land Registry refuses the key: the
 * rest is prepared without them. Without `postcodes` they are skipped, as
 * Code-Point Open's own warning says.
 */
export const loadCompanyTitles = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
  key: string | null,
  postcodes: boolean,
  log: (message: string) => void,
): Promise<TitleSource[] | null> => {
  if (!key) {
    log(
      `Warning: ${COMPANY_TITLES.keyVariable} is not set, so HM Land Registry's ${COMPANY_TITLES.datasets.ccod.name} (CCOD) and ${COMPANY_TITLES.datasets.ocod.name} (OCOD) are skipped: Land Parcels will be only Possibly Unregistered or registered, with no Ownership Category. To add them, create a Use land and property data account at ${COMPANY_TITLES.site}, agree to both datasets' licences, and set ${COMPANY_TITLES.keyVariable} in .env to its API key.`,
    );
    return null;
  }
  if (!postcodes) return null;
  await connection.run(
    `CREATE OR REPLACE TABLE company_titles (
       dataset VARCHAR, source_date VARCHAR,
       ${Object.keys(COMPANY_TITLES.columns)
         .map((column) => `${column} VARCHAR`)
         .join(", ")})`,
  );
  try {
    const sources = [];
    for (const dataset of [CCOD_DATASET, OCOD_DATASET] as const) {
      log(
        `Downloading ${COMPANY_TITLES.source}'s ${COMPANY_TITLES.datasets[dataset].name} (${dataset.toUpperCase()})…`,
      );
      const zip = join(workDir, `${dataset}.zip`);
      const source = await downloadTitles(fetchFn, key, dataset, zip);
      await loadTitleCsv(connection, zip, source);
      sources.push(source);
    }
    const unmatched = await matchDistricts(connection);
    if (unmatched.titles > 0) {
      log(
        `${String(unmatched.titles)} of the titles in England name a District that is no English council's${unmatched.example ? `, such as ${unmatched.example}` : ""}, so no Land Coverage Area has them.`,
      );
    }
    return sources;
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    log(
      `Warning: ${why.replace(/\.$/, "")}. CCOD and OCOD are skipped: Land Parcels will be only Possibly Unregistered or registered, with no Ownership Category. Check that ${COMPANY_TITLES.keyVariable} is your API key, and that you have agreed to both datasets' licences at ${COMPANY_TITLES.site}.`,
    );
    await connection.run("DROP TABLE IF EXISTS company_titles");
    return null;
  }
};
