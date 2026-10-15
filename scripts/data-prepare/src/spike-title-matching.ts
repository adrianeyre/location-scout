import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import type { DuckDBConnection } from "@duckdb/node-api";

import { LARGE_DOWNLOAD_TIMEOUT_MS } from "./arcgis";
import { downloadFile } from "./demographics";
import { openDuckDb, sqlString } from "./duckdb";
import { downloadExtract } from "./geofabrik";
import { INSPIRE, downloadInspireZip, openInspireDownloads } from "./inspire";
import { DATA_DIR } from "./paths";
import {
  MATCH_STEPS,
  RIGHT_WITHIN_M,
  TRUSTED_STEPS,
  knownNames,
  loadInspireBng,
  loadOsmAddresses,
  loadPostcodes,
  loadTitles,
  matchTitles,
  registerNormalisers,
  type Title,
} from "./title-matching";
import { zipMemberNames } from "./zip";

/**
 * `pnpm --filter @location-scout/data-prepare spike:title-matching` runs
 * OQ-7's spike on Ashfield (docs/spikes/oq-7-ccod-ocod-title-matching.md):
 * it matches registered titles to the INSPIRE Index Polygons by address,
 * and writes what it found to `oq-7-title-matching-results.md` in `--out`.
 *
 * It always matches two proxies for CCOD's titles whose true places are
 * known without their addresses, so each match can be checked: Ashfield
 * District Council's own published register of the land and buildings it
 * holds, with the council's point for each, and 2026's Price Paid sales in
 * Ashfield, with their UPRNs' points where HM Land Registry's lookups give
 * them. With `--ccod` and `--ocod` (HM Land Registry's CSVs, downloaded and
 * unzipped by hand, as they need an account) it matches their freehold
 * titles in `--district` too, and lists 20 of the matches to check by hand
 * against HM Land Registry's map search.
 *
 * Its downloads are kept in `--work` (`data/spikes/oq-7/` by default, which
 * git ignores) and not downloaded again.
 */

const USAGE = `Usage: pnpm --filter @location-scout/data-prepare spike:title-matching [options]

  --ccod <csv>        HM Land Registry's CCOD full file, unzipped.
  --ocod <csv>        HM Land Registry's OCOD full file, unzipped.
  --district <name>   The District their titles are kept for (ASHFIELD).
  --work <dir>        Where the open sources are downloaded (data/spikes/oq-7).
  --out <dir>         Where the report is written (the --work folder).
  --help              Show this message.`;

/** The open sources the spike downloads. */
const SOURCES = {
  inspire: {
    name: "Ashfield District Council",
    file: "inspire-ashfield.zip",
  },
  geofabrik: [
    {
      id: "nottinghamshire",
      name: "Nottinghamshire",
      url: "https://download.geofabrik.de/europe/united-kingdom/england/nottinghamshire-latest.osm.pbf",
    },
    {
      id: "derbyshire",
      name: "Derbyshire",
      url: "https://download.geofabrik.de/europe/united-kingdom/england/derbyshire-latest.osm.pbf",
    },
  ],
  codePointOpen: {
    url: "https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect",
    file: "codepo_gb.zip",
    /** Ashfield's postcode area, and its neighbours'. */
    areas: ["ng", "de", "s"],
  },
  pricePaid: {
    url: "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-2026.csv",
    file: "pp-2026.csv",
  },
  /**
   * HM Land Registry's lookups from a Price Paid sale to its UPRN, one a
   * month since July 2026, and Ordnance Survey's point for every UPRN: where
   * each of 2026's sales truly is, found without its address.
   */
  uprnLookups: [
    "https://price-paid-data.publicdata.landregistry.gov.uk/pp-uprn-lookup-jul-2026.csv",
    "https://price-paid-data.publicdata.landregistry.gov.uk/pp-uprn-lookup-aug-2026.csv",
  ],
  openUprn: {
    url: "https://api.os.uk/downloads/v1/products/OpenUPRN/downloads?area=GB&format=CSV&redirect",
    file: "osopenuprn_csv.zip",
  },
  councilAssets: {
    url: "https://www.ashfield.gov.uk/media/qv4hdjvg/land-and-property-transparency-data-27-february-2018.xlsx",
    file: "ashfield-land-and-property-2018.xlsx",
    page: "https://www.ashfield.gov.uk/your-council/legal-information-and-public-data/transparency-code",
  },
} as const;

/** The report's file, in `--out`. */
const RESULTS_FILE = "oq-7-title-matching-results.md";

/** How many matches the report lists to check by hand. */
const SAMPLE_SIZE = 20;

const exists = async (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

/** Today, as an ISO 8601 date. */
const today = () => new Date().toISOString().slice(0, 10);

/** The day each source was published or downloaded, kept beside them. */
type Dates = Record<string, string>;

const download = async (work: string, log: (message: string) => void) => {
  const datesFile = join(work, "sources.json");
  const dates: Dates = (await exists(datesFile))
    ? (JSON.parse(await readFile(datesFile, "utf8")) as Dates)
    : {};

  const inspireZip = join(work, SOURCES.inspire.file);
  if (!(await exists(inspireZip))) {
    log(`Downloading ${SOURCES.inspire.name}'s ${INSPIRE.name}…`);
    const { downloads, cookie } = await openInspireDownloads(fetch);
    const file = downloads.files.find(
      ({ name }) => name === SOURCES.inspire.name,
    );
    if (!file) throw new Error(`${INSPIRE.source} has no Ashfield file.`);
    await downloadInspireZip(fetch, file, cookie, inspireZip);
    dates.inspire = downloads.publishedOn;
  }
  const pbfs = [];
  for (const extract of SOURCES.geofabrik) {
    const pbf = join(work, `${extract.id}.osm.pbf`);
    if (!(await exists(pbf))) {
      log(`Downloading Geofabrik's ${extract.name} extract…`);
      dates[extract.id] = (
        await downloadExtract(fetch, extract, pbf)
      ).sourceDate;
    }
    pbfs.push(pbf);
  }
  const codePoint = join(work, SOURCES.codePointOpen.file);
  if (!(await exists(codePoint))) {
    log("Downloading Code-Point Open…");
    await downloadFile(
      fetch,
      "Ordnance Survey",
      SOURCES.codePointOpen.url,
      codePoint,
      {
        timeoutMs: LARGE_DOWNLOAD_TIMEOUT_MS,
      },
    );
    dates.codePointOpen = `downloaded ${today()}`;
  }
  const assets = join(work, SOURCES.councilAssets.file);
  if (!(await exists(assets))) {
    log("Downloading Ashfield District Council's land and property register…");
    await downloadFile(
      fetch,
      "Ashfield District Council",
      SOURCES.councilAssets.url,
      assets,
    );
    dates.councilAssets = `downloaded ${today()}`;
  }
  const pricePaid = join(work, SOURCES.pricePaid.file);
  if (!(await exists(pricePaid))) {
    log("Downloading HM Land Registry's Price Paid Data for 2026…");
    await downloadFile(
      fetch,
      "HM Land Registry",
      SOURCES.pricePaid.url,
      pricePaid,
      {
        timeoutMs: LARGE_DOWNLOAD_TIMEOUT_MS,
      },
    );
    dates.pricePaid = `downloaded ${today()}`;
  }
  const uprnLookups = [];
  for (const url of SOURCES.uprnLookups) {
    const file = join(work, url.slice(url.lastIndexOf("/") + 1));
    if (!(await exists(file))) {
      log(
        `Downloading HM Land Registry's ${url.slice(url.lastIndexOf("/") + 1)}…`,
      );
      await downloadFile(fetch, "HM Land Registry", url, file);
    }
    uprnLookups.push(file);
  }
  const openUprn = join(work, SOURCES.openUprn.file);
  if (!(await exists(openUprn))) {
    log("Downloading OS Open UPRN (about 620 MB)…");
    await downloadFile(
      fetch,
      "Ordnance Survey",
      SOURCES.openUprn.url,
      openUprn,
      {
        timeoutMs: LARGE_DOWNLOAD_TIMEOUT_MS,
      },
    );
    dates.openUprn = `downloaded ${today()}`;
  }
  await writeFile(datesFile, `${JSON.stringify(dates, null, 2)}\n`);
  return {
    inspireZip,
    pbfs,
    codePoint,
    assets,
    pricePaid,
    uprnLookups,
    openUprn,
    dates,
  };
};

/** The council's freehold and leasehold assets, as titles whose place is known. */
const councilTitles = async (
  connection: DuckDBConnection,
  workbook: string,
): Promise<Title[]> => {
  const rows = await rowsOf(
    connection,
    `SELECT AssetCode, TenureType, PropertyName, PostTown, PostCode, HoldingType,
       TRY_CAST(replace(CAST(GeoX AS VARCHAR), ',', '') AS DOUBLE) AS x,
       TRY_CAST(replace(CAST(GeoY AS VARCHAR), ',', '') AS DOUBLE) AS y
     FROM ST_Read(${sqlString(workbook)}, open_options := ['HEADERS=FORCE'])
     ORDER BY AssetCode`,
  );
  return rows.map((row, index) => ({
    titleNumber:
      typeof row.AssetCode === "string" && row.AssetCode.trim() !== ""
        ? row.AssetCode
        : `(no code ${String(index + 1)})`,
    tenure: String(row.TenureType ?? ""),
    // A few of its eastings and northings are written "356,096".
    // The register's own name for each asset, with its town, is the nearest
    // it has to a title's Property Address: "153 Portland Road, Hucknall,
    // Land", "Walesby Drive, Kirkby in Ashfield, Substation".
    propertyAddress: [row.PropertyName, row.PostTown]
      .filter((part) => typeof part === "string" && part.trim() !== "")
      .join(", "),
    postcode: typeof row.PostCode === "string" ? row.PostCode : null,
    category: String(row.HoldingType ?? ""),
    truth:
      typeof row.x === "number" && typeof row.y === "number"
        ? { x: row.x, y: row.y }
        : null,
  }));
};

/** Price Paid's property types. */
const PROPERTY_TYPES: Readonly<Record<string, string>> = {
  D: "Detached",
  S: "Semi-detached",
  T: "Terraced",
  F: "Flat or maisonette",
  O: "Other (non-residential, land)",
};

/**
 * Loads OS Open UPRN's points inside the INSPIRE Index Polygons' bounds,
 * from inside its zip, into `uprn_points`, in British National Grid.
 * GDAL reads its 41 million rows in a minute or two.
 */
const loadOpenUprn = async (connection: DuckDBConnection, zip: string) => {
  const member = (await zipMemberNames(zip)).find((name) =>
    name.endsWith(".csv"),
  );
  if (!member) throw new Error(`${zip} holds no CSV.`);
  await connection.run(
    `CREATE OR REPLACE TABLE uprn_points AS
       WITH bounds AS (
         SELECT ST_XMin(e) AS west, ST_YMin(e) AS south, ST_XMax(e) AS east, ST_YMax(e) AS north
         FROM (SELECT ST_Envelope_Agg(geometry) AS e FROM inspire)
       )
       SELECT CAST(UPRN AS VARCHAR) AS uprn,
         ST_Point(CAST(X_COORDINATE AS DOUBLE), CAST(Y_COORDINATE AS DOUBLE)) AS geometry
       FROM ST_Read(${sqlString(`/vsizip/${zip}/${member}`)}), bounds
       WHERE CAST(X_COORDINATE AS DOUBLE) BETWEEN west AND east
         AND CAST(Y_COORDINATE AS DOUBLE) BETWEEN south AND north`,
  );
};

/**
 * Each sale in `district` in a year of Price Paid Data (no header: id,
 * price, date, postcode, type, new build, duration, PAON, SAON, street,
 * locality, town, district…), its address written as a register writes a
 * title's: "Flat 2, 12 High Street, Sutton-in-Ashfield". Its id stands for
 * a title number, and its UPRN's point, where the lookups give it one, is
 * where it truly is.
 */
const pricePaidTitles = async (
  connection: DuckDBConnection,
  csv: string,
  lookups: readonly string[],
  district: string,
): Promise<Title[]> => {
  const rows = await rowsOf(
    connection,
    `WITH lookup AS (
       SELECT DISTINCT ON (id) column0 AS id, column1 AS uprn
       FROM read_csv([${lookups.map(sqlString).join(", ")}], header = false, all_varchar = true)
     )
     SELECT s.column00 AS id, s.column03 AS postcode, s.column04 AS type, s.column06 AS duration,
       concat_ws(', ', nullif(s.column08, ''), nullif(trim(concat_ws(' ', s.column07, s.column09)), ''),
         nullif(s.column10, ''), nullif(s.column11, '')) AS address,
       ST_X(u.geometry) AS x, ST_Y(u.geometry) AS y
     FROM read_csv(${sqlString(csv)}, header = false, all_varchar = true) s
     LEFT JOIN lookup l ON l.id = s.column00
     LEFT JOIN uprn_points u ON u.uprn = l.uprn
     WHERE upper(s.column12) = ${sqlString(district.toUpperCase())} AND s.column15 = 'A'
     ORDER BY id`,
  );
  return rows.map((row) => ({
    titleNumber: String(row.id),
    tenure:
      row.duration === "F"
        ? "Freehold"
        : row.duration === "L"
          ? "Leasehold"
          : "",
    propertyAddress: String(row.address ?? ""),
    postcode: typeof row.postcode === "string" ? row.postcode : null,
    category: PROPERTY_TYPES[String(row.type)] ?? String(row.type),
    truth:
      typeof row.x === "number" && typeof row.y === "number"
        ? { x: row.x, y: row.y }
        : null,
  }));
};

/** CCOD's or OCOD's titles in `district`. */
const registerTitles = async (
  connection: DuckDBConnection,
  csv: string,
  district: string,
): Promise<Title[]> => {
  const rows = await rowsOf(
    connection,
    `SELECT "Title Number" AS title, "Tenure" AS tenure, "Property Address" AS address,
       "Postcode" AS postcode, "Proprietorship Category (1)" AS category
     FROM read_csv(${sqlString(csv)}, header = true, all_varchar = true)
     WHERE upper(trim("District")) = ${sqlString(district.toUpperCase())}
     ORDER BY title`,
  );
  return rows.map((row) => ({
    titleNumber: String(row.title),
    tenure: String(row.tenure ?? ""),
    propertyAddress: String(row.address ?? ""),
    postcode: typeof row.postcode === "string" ? row.postcode : null,
    category: String(row.category ?? ""),
    truth: null,
  }));
};

const percent = (part: number, whole: number) =>
  whole === 0 ? "–" : `${((100 * part) / whole).toFixed(1)}%`;

/** A value DuckDB returns, as the report writes it. */
type Cell = string | number | boolean | null;

/** A query's rows, each value a string, number, boolean or null. */
const rowsOf = async (connection: DuckDBConnection, sql: string) =>
  (await connection.runAndReadAll(sql))
    .getRowObjectsJson()
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]): [string, Cell] => [
          key,
          value !== null && typeof value === "object"
            ? JSON.stringify(value)
            : value,
        ]),
      ),
    );

const table = (
  header: readonly string[],
  rows: readonly (readonly string[])[],
) =>
  [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map(
      (row) =>
        `| ${row.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`,
    ),
  ].join("\n");

/** How a set of titles is written up. */
interface Labels {
  /** Its heading. */
  label: string;
  /** What its title numbers stand for: "Title", "Asset". */
  idLabel: string;
  /** What its categories are. */
  categoryLabel: string;
  /** Where a title truly is, for the titles that know: "the council's point". */
  truth: string;
}

/** Matches one set of titles, and writes up what it found. */
const report = async (
  connection: DuckDBConnection,
  titles: readonly Title[],
  known: Awaited<ReturnType<typeof knownNames>>,
  { label, idLabel, categoryLabel, truth }: Labels,
) => {
  const freehold = titles.filter(({ tenure }) =>
    /^freehold$/i.test(tenure.trim()),
  );
  await loadTitles(connection, freehold, known);
  // A place more than a kilometre outside the council's polygons is a
  // mistake (the council's register puts one asset 148 km away).
  const [implausible] = await rowsOf(
    connection,
    `SELECT count(*) AS n FROM titles WHERE truth IS NOT NULL AND NOT ST_DWithin(
       truth, (SELECT ST_Envelope_Agg(geometry) FROM inspire), 1000)`,
  );
  await connection.run(
    `UPDATE titles SET truth = NULL WHERE truth IS NOT NULL AND NOT ST_DWithin(
       truth, (SELECT ST_Envelope_Agg(geometry) FROM inspire), 1000)`,
  );
  await matchTitles(connection);
  const total = freehold.length;
  const lines = [
    `### ${label}`,
    "",
    `${String(titles.length)} titles, of which ${String(total)} are freehold and matched. The other ${String(titles.length - total)} (leasehold, or no tenure) can't be: INSPIRE Index Polygons outline only freehold titles (PRD FR-5.8).`,
    "",
  ];

  const kinds = await rowsOf(
    connection,
    `SELECT kind, count(*) AS n FROM titles GROUP BY kind ORDER BY n DESC`,
  );
  lines.push(
    "What their addresses give:",
    "",
    table(
      ["Address gives", "Titles", "Share"],
      kinds.map(({ kind, n }) => [
        String(kind),
        String(n),
        percent(Number(n), total),
      ]),
    ),
    "",
  );

  const steps = await rowsOf(
    connection,
    `SELECT s.step, count(m.title_number) AS placed,
       count(*) FILTER (m.candidates = 1) AS matched,
       count(*) FILTER (m.candidates > 1) AS ambiguous,
       median(m.candidates) FILTER (m.candidates > 1) AS median_candidates,
       count(*) FILTER (m.distance_m = 0) AS right,
       count(*) FILTER (m.distance_m <= ${String(RIGHT_WITHIN_M)}) AS near,
       count(*) FILTER (m.distance_m IS NOT NULL) AS checkable,
       count(*) FILTER (m.candidates > 1 AND m.truth_among) AS truth_among,
       count(*) FILTER (m.candidates > 1 AND m.truth_among IS NOT NULL) AS ambiguous_checkable
     FROM (SELECT unnest([${MATCH_STEPS.map((step) => `'${step}'`).join(", ")}]) AS step) s
     LEFT JOIN title_matches m USING (step)
     GROUP BY s.step ORDER BY list_position([${MATCH_STEPS.map((step) => `'${step}'`).join(", ")}], s.step)`,
  );
  const trusted = `[${TRUSTED_STEPS.map((step) => `'${step}'`).join(", ")}]`;
  const [summary] = await rowsOf(
    connection,
    `SELECT count(*) FILTER (candidates = 1) AS matched,
       count(*) FILTER (candidates = 1 AND list_contains(${trusted}, step)) AS trusted,
       count(*) FILTER (candidates = 1 AND list_contains(${trusted}, step) AND distance_m = 0) AS trusted_right,
       count(*) FILTER (candidates = 1 AND list_contains(${trusted}, step) AND distance_m <= ${String(RIGHT_WITHIN_M)}) AS trusted_near,
       count(*) FILTER (candidates = 1 AND list_contains(${trusted}, step) AND distance_m IS NOT NULL) AS trusted_checkable,
       count(*) FILTER (candidates > 1) AS ambiguous,
       count(*) FILTER (candidates = 0) AS unplaced,
       count(*) FILTER (registered) AS registered,
       count(*) FILTER (registered IS NOT NULL) AS with_truth,
       count(*) FILTER (distance_m = 0) AS right,
       count(*) FILTER (distance_m <= ${String(RIGHT_WITHIN_M)}) AS near,
       count(*) FILTER (distance_m IS NOT NULL) AS checkable
     FROM title_matches`,
  );
  const n = (key: string) => Number(summary?.[key] ?? 0);
  const truthKnown = n("with_truth") > 0;
  lines.push(
    `**Match rate: ${String(n("trusted"))} of ${String(total)} freehold titles (${percent(n("trusted"), total)}) matched one INSPIRE Index Polygon by the ${TRUSTED_STEPS.join(" or ")} step.** Counting every step, ${String(n("matched"))} (${percent(n("matched"), total)}) matched one polygon, ${String(n("ambiguous"))} (${percent(n("ambiguous"), total)}) were ambiguous, finding more than one, and ${String(n("unplaced"))} (${percent(n("unplaced"), total)}) found none.`,
    "",
  );
  if (truthKnown) {
    lines.push(
      `For ${String(Number(implausible?.n ?? 0))} of them, ${truth} is more than 1 km outside Ashfield, a mistake, so they are not checked. Of the ${String(n("with_truth"))} whose place is known, ${String(n("registered"))} (${percent(n("registered"), n("with_truth"))}) are inside an INSPIRE Index Polygon at all; the rest are on land with no registered freehold outline, which no match can find.`,
      "",
      `**Accuracy: of the ${String(n("trusted_checkable"))} matched by the ${TRUSTED_STEPS.join(" or ")} step, ${String(n("trusted_right"))} (${percent(n("trusted_right"), n("trusted_checkable"))}) matched the polygon ${truth} is in, and ${String(n("trusted_near"))} (${percent(n("trusted_near"), n("trusted_checkable"))}) one within ${String(RIGHT_WITHIN_M)} m of it.** Counting every step, ${String(n("right"))} of ${String(n("checkable"))} (${percent(n("right"), n("checkable"))}) were right, and ${String(n("near"))} (${percent(n("near"), n("checkable"))}) within ${String(RIGHT_WITHIN_M)} m.`,
      "",
    );
  }
  lines.push(
    "By the step that placed each title:",
    "",
    table(
      [
        "Step",
        "Placed",
        "Matched one polygon",
        "Ambiguous",
        "Median polygons when ambiguous",
        ...(truthKnown
          ? [
              "Matched, right polygon",
              `Matched, within ${String(RIGHT_WITHIN_M)} m`,
              "Ambiguous, right one among them",
            ]
          : []),
      ],
      steps.map((row) => [
        String(row.step),
        String(row.placed),
        String(row.matched),
        String(row.ambiguous),
        row.median_candidates === null ? "–" : String(row.median_candidates),
        ...(truthKnown
          ? [
              `${String(row.right)} of ${String(row.checkable)}`,
              `${String(row.near)} of ${String(row.checkable)}`,
              `${String(row.truth_among)} of ${String(row.ambiguous_checkable)}`,
            ]
          : []),
      ]),
    ),
    "",
  );

  const categories = await rowsOf(
    connection,
    `SELECT category, count(*) AS n,
       count(*) FILTER (candidates = 1 AND list_contains(${trusted}, step)) AS matched
     FROM title_matches GROUP BY category ORDER BY n DESC, category`,
  );
  lines.push(
    `By ${categoryLabel}, matched by the ${TRUSTED_STEPS.join(" or ")} step:`,
    "",
    table(
      [categoryLabel, "Freehold titles", "Matched", "Rate"],
      categories.map(({ category, n: count, matched }) => [
        String(category),
        String(count),
        String(matched),
        percent(Number(matched), Number(count)),
      ]),
    ),
    "",
  );

  // Where each title truly is is known, every match by a trusted step is
  // checked; otherwise the same 20 every run are listed to check by hand,
  // in the order of the hash of their number.
  const sample = await rowsOf(
    connection,
    `SELECT title_number, property_address, postcode, step, inspire_id,
       round(ST_Y(matched_point), 6) AS lat, round(ST_X(matched_point), 6) AS lng,
       round(distance_m, 1) AS distance_m
     FROM title_matches
     WHERE candidates = 1 AND list_contains(${trusted}, step)
       ${truthKnown ? "AND distance_m IS NOT NULL" : ""}
     ORDER BY md5(title_number) ${truthKnown ? "" : `LIMIT ${String(SAMPLE_SIZE)}`}`,
  );
  lines.push(
    truthKnown
      ? `Every match by the ${TRUSTED_STEPS.join(" or ")} step whose place is known, checked against ${truth}:`
      : `${String(sample.length)} matches by the ${TRUSTED_STEPS.join(" or ")} step, to check by hand against HM Land Registry's map search (find the point, select the polygon, and compare its title number):`,
    "",
    table(
      [
        idLabel,
        "Property Address",
        "Postcode",
        "Step",
        "INSPIRE ID",
        "Polygon point",
        ...(truthKnown
          ? [`Distance from ${truth}`, "Verdict"]
          : ["Title number on the map", "Right?"]),
      ],
      sample.map((row) => [
        String(row.title_number),
        String(row.property_address),
        row.postcode === null ? "" : String(row.postcode),
        String(row.step),
        String(row.inspire_id),
        pointLink(row.lat, row.lng),
        ...(truthKnown
          ? [`${String(row.distance_m)} m`, verdict(row.distance_m)]
          : ["", ""]),
      ]),
    ),
    "",
  );
  if (truthKnown) {
    const wrong = await rowsOf(
      connection,
      `SELECT title_number, property_address, step, round(distance_m) AS distance_m
       FROM title_matches WHERE distance_m > ${String(RIGHT_WITHIN_M)} ORDER BY distance_m DESC`,
    );
    lines.push(
      `Every match more than ${String(RIGHT_WITHIN_M)} m from ${truth}:`,
      "",
      table(
        [idLabel, "Property Address", "Step", "Distance"],
        wrong.map((row) => [
          String(row.title_number),
          String(row.property_address),
          String(row.step),
          `${String(row.distance_m)} m`,
        ]),
      ),
      "",
    );
  }
  const matches = await rowsOf(
    connection,
    `SELECT title_number, tenure, category, kind, property_address, postcode, street, name, side,
       step, candidates, inspire_id, registered, truth_among, round(distance_m, 1) AS distance_m
     FROM title_matches`,
  );
  const checked = truthKnown
    ? sample.map((row): Record<string, unknown> => ({ ...row, set: label }))
    : [];
  return { markdown: lines.join("\n"), matches, checked };
};

/** A point, linked to OpenStreetMap's map of it. */
const pointLink = (lat: unknown, lng: unknown) =>
  `[${String(lat)}, ${String(lng)}](https://www.openstreetmap.org/?mlat=${String(lat)}&mlon=${String(lng)}#map=19/${String(lat)}/${String(lng)})`;

/** Whether a match's polygon holds where the title truly is, is next to it, or is wrong. */
const verdict = (distance: unknown) =>
  distance === null
    ? ""
    : Number(distance) === 0
      ? "Right"
      : Number(distance) <= RIGHT_WITHIN_M
        ? "Next to it"
        : "Wrong";

const run = async () => {
  const { values } = parseArgs({
    options: {
      ccod: { type: "string" },
      ocod: { type: "string" },
      district: { type: "string", default: "ASHFIELD" },
      work: { type: "string", default: join(DATA_DIR, "spikes", "oq-7") },
      out: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const log = (message: string) => {
    console.log(message);
  };
  const work = values.work;
  const out = values.out ?? work;
  await mkdir(work, { recursive: true });
  await mkdir(out, { recursive: true });
  const sources = await download(work, log);

  const connection = await openDuckDb();
  await registerNormalisers(connection);
  log("Loading the INSPIRE Index Polygons, Code-Point Open and OpenStreetMap…");
  await loadInspireBng(connection, sources.inspireZip);
  await loadPostcodes(
    connection,
    sources.codePoint,
    SOURCES.codePointOpen.areas,
  );
  const [box] = await rowsOf(
    connection,
    `SELECT ST_XMin(e) AS west, ST_YMin(e) AS south, ST_XMax(e) AS east, ST_YMax(e) AS north FROM (
       SELECT ST_Transform(ST_Envelope(ST_Buffer(ST_Envelope_Agg(geometry), 500)), ${sqlString(INSPIRE.crs)}, 'EPSG:4326', always_xy := true) AS e
       FROM inspire
     )`,
  );
  await loadOsmAddresses(connection, sources.pbfs, [
    Number(box?.west),
    Number(box?.south),
    Number(box?.east),
    Number(box?.north),
  ]);
  const known = await knownNames(connection);
  const [counts] = await rowsOf(
    connection,
    `SELECT (SELECT count(*) FROM inspire) AS polygons,
       (SELECT count(DISTINCT (osm_type, osm_id)) FROM osm_addresses) AS addresses,
       (SELECT count(*) FROM osm_addresses a JOIN inspire i ON ST_Intersects(i.geometry, a.point)) AS addresses_in_polygons,
       (SELECT count(DISTINCT i.inspire_id) FROM osm_addresses a JOIN inspire i ON ST_Intersects(i.geometry, a.point)) AS polygons_with_address,
       (SELECT count(*) FROM osm_named) AS named,
       (SELECT count(*) FROM osm_streets) AS street_ways`,
  );

  const sections = [];
  const results: Record<string, unknown> = {};
  log("Matching Ashfield District Council's land and property register…");
  const council = await report(
    connection,
    await councilTitles(connection, sources.assets),
    known,
    {
      label: "Ashfield District Council's land and property register",
      idLabel: "Asset",
      categoryLabel: "Holding type",
      truth: "the council's point",
    },
  );
  sections.push(council.markdown);
  results.council = council.matches;
  log("Loading OS Open UPRN's points in Ashfield…");
  await loadOpenUprn(connection, sources.openUprn);
  log("Matching 2026's Price Paid sales in Ashfield…");
  const sales = await report(
    connection,
    await pricePaidTitles(
      connection,
      sources.pricePaid,
      sources.uprnLookups,
      values.district,
    ),
    known,
    {
      label: "Price Paid sales in Ashfield in 2026",
      idLabel: "Sale",
      categoryLabel: "Property type",
      truth: "its UPRN's point",
    },
  );
  sections.push(sales.markdown);
  results.pricePaid = sales.matches;
  for (const [key, csv] of [
    ["ccod", values.ccod],
    ["ocod", values.ocod],
  ] as const) {
    if (csv === undefined) continue;
    log(`Matching ${key.toUpperCase()}'s titles in ${values.district}…`);
    const titles = await registerTitles(connection, csv, values.district);
    const result = await report(connection, titles, known, {
      label: `${key.toUpperCase()}, ${values.district}`,
      idLabel: "Title",
      categoryLabel: "Proprietorship Category",
      truth: "",
    });
    sections.push(result.markdown);
    results[key] = result.matches;
  }

  // The 20-sample check: 20 of the proxies' matches by a trusted step whose
  // place is known, the same 20 every run, in the order of the hash of their
  // number.
  const hash = (text: string) => createHash("md5").update(text).digest("hex");
  const checked = [...council.checked, ...sales.checked]
    .sort((a, b) =>
      hash(String(a.title_number)).localeCompare(hash(String(b.title_number))),
    )
    .slice(0, SAMPLE_SIZE);
  const tally = (wanted: string) =>
    checked.filter((row) => verdict(row.distance_m) === wanted).length;
  const sampleCheck = [
    `### ${String(checked.length)}-sample accuracy check`,
    "",
    `${String(checked.length)} of the ${String(council.checked.length + sales.checked.length)} matches by the ${TRUSTED_STEPS.join(" or ")} step whose place is independently known (the council's point for its asset, or a sale's UPRN's point): **${String(tally("Right"))} right, ${String(tally("Next to it"))} within ${String(RIGHT_WITHIN_M)} m (the point just outside the matched polygon), ${String(tally("Wrong"))} wrong.**`,
    "",
    table(
      [
        "Proxy",
        "Asset or sale",
        "Property Address",
        "Step",
        "INSPIRE ID",
        "Polygon point",
        "Distance",
        "Verdict",
      ],
      checked.map((row) => [
        String(row.set),
        String(row.title_number),
        String(row.property_address),
        String(row.step),
        String(row.inspire_id),
        pointLink(row.lat, row.lng),
        `${String(row.distance_m)} m`,
        verdict(row.distance_m),
      ]),
    ),
    "",
  ].join("\n");

  const c = (key: string) => Number(counts?.[key] ?? 0).toLocaleString("en-GB");
  const markdown = [
    "# OQ-7: matching titles to INSPIRE Index Polygons on Ashfield, results",
    "",
    `Written by \`pnpm --filter @location-scout/data-prepare spike:title-matching\` on ${today()}. What it does, and what the results mean: [oq-7-ccod-ocod-title-matching.md](oq-7-ccod-ocod-title-matching.md).`,
    "",
    "## Results",
    "",
    `Sources: ${INSPIRE.source}'s ${INSPIRE.name} for Ashfield published ${sources.dates.inspire ?? "?"}; Geofabrik's Nottinghamshire (${sources.dates.nottinghamshire ?? "?"}) and Derbyshire (${sources.dates.derbyshire ?? "?"}) extracts; Code-Point Open (${sources.dates.codePointOpen ?? "?"}); Ashfield District Council's [land and property transparency data, 27 February 2018](${SOURCES.councilAssets.page}) (${sources.dates.councilAssets ?? "?"}); HM Land Registry's Price Paid Data for 2026 (${sources.dates.pricePaid ?? "?"}) and its lookups from a sale to its UPRN for July and August 2026; OS Open UPRN (${sources.dates.openUprn ?? "?"}).`,
    "",
    `Ashfield has ${c("polygons")} INSPIRE Index Polygons. OpenStreetMap has ${c("addresses")} addressed nodes and buildings in and around it; ${c("polygons_with_address")} polygons (${percent(Number(counts?.polygons_with_address), Number(counts?.polygons))}) hold at least one. It has ${c("named")} named features that aren't roads, and ${c("street_ways")} named road ways (${String(known.streets.size)} street names).`,
    "",
    sampleCheck,
    ...sections,
  ].join("\n");
  await writeFile(join(out, RESULTS_FILE), `${markdown}\n`);
  // Every title's match, with the addresses it was matched from, stays in
  // the git-ignored work folder.
  await writeFile(
    join(work, "oq-7-matches.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  log(
    `Wrote ${join(out, RESULTS_FILE)}, and ${join(work, "oq-7-matches.json")}.`,
  );
  connection.closeSync();
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(USAGE);
  process.exitCode = 1;
}
