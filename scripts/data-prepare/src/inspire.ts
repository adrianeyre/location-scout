import type { DuckDBConnection } from "@duckdb/node-api";
import type { Council, DatasetAttribution } from "@location-scout/shared";

import {
  DOWNLOAD_TIMEOUT_MS,
  LARGE_DOWNLOAD_TIMEOUT_MS,
  USER_AGENT,
} from "./arcgis";
import { downloadFile } from "./demographics";
import { sqlString } from "./duckdb";

/**
 * HM Land Registry's INSPIRE Index Polygons (PRD FR-6.1): the indicative
 * outline of every registered freehold title, published on the first Sunday
 * of each month as one GML file per local authority, in a zip, with no API
 * (ADR 0004). Its download page names the day the files were published and
 * links each local authority's zip; it sets cookies first, and hands out the
 * zips only to a request that sends them back.
 */
export const INSPIRE = {
  name: "INSPIRE Index Polygons",
  source: "HM Land Registry",
  site: "https://use-land-property-data.service.gov.uk",
  downloadPath: "/datasets/inspire/download",
  /** "This dataset was published on 4 October 2026." */
  published:
    /This dataset was published on\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/,
  /** Each local authority's row: its name, and the link to its zip. */
  file: /<th\b[^>]*\bscope="row"[^>]*>\s*([^<]+?)\s*<\/th>\s*<td\b[^>]*>\s*<a\b[^>]*\bhref="(\/datasets\/inspire\/download\/[^"]+\.zip)"/g,
  /** The GML file in each zip. */
  member: "Land_Registry_Cadastral_Parcels.gml",
  /** Its polygons are in British National Grid. */
  crs: "EPSG:27700",
  conditionsUrl:
    "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
} as const;

/**
 * The statements HM Land Registry's conditions require wherever the polygons
 * are used, with the year they were published (PRD FR-10.2).
 */
export const inspireAttribution = (publishedOn: string): DatasetAttribution => {
  const year = publishedOn.slice(0, 4);
  return {
    statements: [
      `This information is subject to Crown copyright and database rights ${year} and is reproduced with the permission of HM Land Registry.`,
      `The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights ${year} Ordnance Survey AC0000851063.`,
    ],
    conditionsUrl: INSPIRE.conditionsUrl,
  };
};

/**
 * HM Land Registry's name for the few councils whose ONS name doesn't match
 * once both are tidied (`tidyName`), by their ONS code.
 */
const INSPIRE_NAMES: Readonly<Record<string, string>> = {
  E06000010: "Hull City Council",
  E06000017: "Rutland County Council District Council",
  E06000047: "Durham County Council",
  E07000146: "Borough Council of Kings Lynn and West Norfolk",
  E07000240: "St Albans City and District Council",
  E08000021: "Newcastle City Council",
  E08000032: "City of Bradford Metropolitan District Council",
  E08000036: "Wakefield Metropolitan District Council",
};

/**
 * A council's name without what ONS and HM Land Registry write differently:
 * "London Borough of Barnet", "Ashfield District Council" and "Bristol, City
 * of" are "barnet", "ashfield" and "bristol".
 */
export const tidyName = (name: string) =>
  name
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[.,']/g, " ")
    .replace(
      /^\s*(the|london borough of|royal borough of|council of the|city of)\s+/,
      "",
    )
    .replace(
      /\s+(metropolitan borough|metropolitan district|district|borough|city|county)?\s*(council|corporation)\s*$/,
      "",
    )
    .replace(/\s+(city|county) of\s*$/, "")
    .split(/\s+/)
    .filter((word) => word !== "")
    .join(" ");

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

/** One local authority's file, as the download page links it. */
export interface InspireFile {
  /** HM Land Registry's name for it, such as "Ashfield District Council". */
  name: string;
  url: string;
}

/** What the download page offers: the day the files were published, and each file. */
export interface InspireDownloads {
  publishedOn: string;
  files: InspireFile[];
}

const layoutChanged = () =>
  new Error(
    `${INSPIRE.source}'s ${INSPIRE.name} download page is not as it was, so they can't be downloaded. Its layout may have changed.`,
  );

/** Reads the download page. Throws if it doesn't say when the files were published, or links none. */
export const inspireDownloads = (html: string): InspireDownloads => {
  const [, day, month, year] = INSPIRE.published.exec(html) ?? [];
  const monthIndex = MONTHS.indexOf((month ?? "").toLowerCase());
  const files = [...html.matchAll(INSPIRE.file)].map(([, name, path]) => ({
    name: (name ?? "").replaceAll("&amp;", "&").replaceAll("&#39;", "'"),
    url: `${INSPIRE.site}${path ?? ""}`,
  }));
  if (!day || !year || monthIndex < 0 || files.length === 0) {
    throw layoutChanged();
  }
  return {
    publishedOn: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`,
    files,
  };
};

/**
 * The council's file: the one HM Land Registry names for its ONS code in
 * `INSPIRE_NAMES`, or else the one whose name is the same once both are
 * tidied. `null` if there is none, or more than one.
 */
export const inspireFileFor = (
  { code, name }: Council,
  files: readonly InspireFile[],
): InspireFile | null => {
  const theirs = INSPIRE_NAMES[code];
  const matching = files.filter((file) =>
    theirs === undefined
      ? tidyName(file.name) === tidyName(name)
      : file.name === theirs,
  );
  return matching.length === 1 ? (matching[0] ?? null) : null;
};

/** The cookies a response sets, as a request sends them back. */
const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

/**
 * Opens the download page as a browser does: it first answers with the
 * cookies it wants sent back and a redirect to itself. Returns what it
 * offers, and the cookies, which the zips need too.
 */
export const openInspireDownloads = async (fetchFn: typeof fetch) => {
  const url = `${INSPIRE.site}${INSPIRE.downloadPath}`;
  let cookie = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetchFn(url, {
      headers: { "user-agent": USER_AGENT, ...(cookie ? { cookie } : {}) },
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (response.ok) {
      return { downloads: inspireDownloads(await response.text()), cookie };
    }
    const sets = cookiesOf(response);
    if (response.status < 300 || response.status >= 400 || sets === "") {
      throw new Error(
        `${INSPIRE.source} answered ${String(response.status)} for ${url}`,
      );
    }
    cookie = [cookie, sets].filter((part) => part !== "").join("; ");
  }
  throw new Error(`${INSPIRE.source} kept redirecting ${url} to itself.`);
};

/** Downloads a council's zip, sending back the download page's cookies. */
export const downloadInspireZip = async (
  fetchFn: typeof fetch,
  file: InspireFile,
  cookie: string,
  zip: string,
) => {
  await downloadFile(fetchFn, INSPIRE.source, file.url, zip, {
    headers: { cookie },
    timeoutMs: LARGE_DOWNLOAD_TIMEOUT_MS,
  });
};

/**
 * Loads the GML in a council's zip into the table `inspire_index_polygons`,
 * replacing any it held: each polygon's `inspire_id`, the day its title's
 * outline was last changed (`valid_from`), its bounds and its outline in
 * WGS 84. GDAL reads it inside the zip. It would try to download the GML's
 * schema from HM Land Registry's own network, which can't be reached, so it
 * is told not to and works the schema out from the file.
 */
export const loadInspire = async (
  connection: DuckDBConnection,
  zip: string,
) => {
  const gml = `/vsizip/${zip}/${INSPIRE.member}`;
  await connection.run(
    `CREATE OR REPLACE TABLE inspire_index_polygons AS
       WITH read AS (
         SELECT CAST(INSPIREID AS BIGINT) AS inspire_id,
           CAST(substr(VALIDFROM, 1, 10) AS DATE) AS valid_from,
           ST_Transform(GEOMETRY, ${sqlString(INSPIRE.crs)}, 'EPSG:4326', always_xy := true)::GEOMETRY AS geometry
         FROM ST_Read($1, open_options := ['DOWNLOAD_SCHEMA=NO'])
       )
       SELECT inspire_id, valid_from,
         ST_XMin(geometry) AS xmin, ST_YMin(geometry) AS ymin,
         ST_XMax(geometry) AS xmax, ST_YMax(geometry) AS ymax,
         geometry
       FROM read`,
    [gml],
  );
};
