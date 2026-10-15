import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { DuckDBConnection } from "@duckdb/node-api";
import type { SchoolPhase } from "@location-scout/shared";

import { DOWNLOAD_TIMEOUT_MS, USER_AGENT } from "./arcgis";
import { quoted, requireColumns } from "./demographics";
import { sqlString } from "./duckdb";
import { zipEntries } from "./zip";

/**
 * The England-wide datasets behind the Schools Layer (PRD FR-2.3a, FR-6.0):
 * every open school in the Get Information about Schools register, and the
 * latest Ofsted inspection of each state-funded school. Both are published
 * afresh, GIAS daily and Ofsted monthly, so each run downloads the latest
 * and records its date. Both are CSVs in Windows-1252, which are decoded
 * here, as DuckDB and GDAL read CSVs only as UTF-8.
 */

/** Where a dataset came from, and the date its data dates from, as the manifest lists it. */
export interface DownloadedSource {
  name: string;
  source: string;
  url: string;
  sourceDate: string;
}

/**
 * The Get Information about Schools register, from the Department for
 * Education. Its Downloads page hands out the "Establishment fields CSV"
 * (every establishment it has ever registered) in three steps, as a browser
 * does: the page's form asks for the file, a page says when it is ready, and
 * its form gives the zip, of one CSV named for the day it was made.
 */
export const GIAS = {
  name: "Schools register",
  source: "Get Information about Schools",
  site: "https://get-information-schools.service.gov.uk",
  downloadsPath: "/Downloads",
  collatePath: "/Downloads/Collate",
  /** The download's tag in the form: "All establishment data, Establishment fields CSV". */
  tag: "all.edubase.data",
  /** The CSV in the zip, named for the day it was made, `edubasealldata20261009.csv`. */
  member: /^edubasealldata(\d{4})(\d{2})(\d{2})\.csv$/,
  /** How long to wait between asking whether the file is ready, and how many times. */
  poll: { ms: 2_000, times: 90 },
  columns: {
    urn: "URN",
    name: "EstablishmentName",
    type: "TypeOfEstablishment (name)",
    typeGroup: "EstablishmentTypeGroup (name)",
    status: "EstablishmentStatus (name)",
    phase: "PhaseOfEducation (name)",
    lowAge: "StatutoryLowAge",
    highAge: "StatutoryHighAge",
    region: "GOR (name)",
    easting: "Easting",
    northing: "Northing",
    inspectorate: "InspectorateName (name)",
  },
  /** An establishment open now, including one proposed to close. */
  openStatuses: ["Open", "Open, but proposed to close"],
  /**
   * England's regions. GIAS gives a new school's council as 9999 until it
   * knows it, but always its region; Welsh establishments' is "Wales (pseudo)".
   */
  englishRegions: [
    "North East",
    "North West",
    "Yorkshire and the Humber",
    "East Midlands",
    "West Midlands",
    "East of England",
    "London",
    "South East",
    "South West",
  ],
} as const;

/**
 * GIAS's type groups the Schools Layer shows, and the phases it shows them
 * by (PRD FR-2.3a). Colleges, universities, children's centres, online
 * providers, secure units, Welsh schools and 16 to 19 academies, which
 * Ofsted inspects as further education, are left out.
 */
export const SCHOOL_TYPE_GROUPS = [
  "Local authority maintained schools",
  "Academies",
  "Free Schools",
  "Special schools",
  "Independent schools",
] as const;

/** GIAS's phases of education, by the phase each counts as. */
const PHASES_OF_EDUCATION: Readonly<
  Record<
    Exclude<SchoolPhase, "special" | "alternative-provision" | "independent">,
    readonly string[]
  >
> = {
  nursery: ["Nursery"],
  primary: ["Primary", "Middle deemed primary"],
  secondary: ["Secondary", "Middle deemed secondary"],
  "all-through": ["All-through"],
};

const list = (values: readonly string[]) => values.map(sqlString).join(", ");

/**
 * Each school's phase, or `NULL` for an establishment the Layer leaves out:
 * independent schools by their type group, special schools and alternative
 * provision by their type, and the rest by their phase of education.
 */
const PHASE_SQL = (() => {
  const { type, typeGroup, phase } = GIAS.columns;
  return `CASE
    WHEN ${quoted(typeGroup)} NOT IN (${list(SCHOOL_TYPE_GROUPS)}) THEN NULL
    WHEN ${quoted(typeGroup)} = 'Independent schools' THEN 'independent'
    WHEN ${quoted(typeGroup)} = 'Special schools'
      OR lower(${quoted(type)}) LIKE '%special%' THEN 'special'
    WHEN lower(${quoted(type)}) LIKE '%pupil referral unit%'
      OR lower(${quoted(type)}) LIKE '%alternative provision%' THEN 'alternative-provision'
    ${Object.entries(PHASES_OF_EDUCATION)
      .map(
        ([ours, theirs]) =>
          `WHEN ${quoted(phase)} IN (${list(theirs)}) THEN '${ours}'`,
      )
      .join("\n    ")}
    ELSE NULL
  END`;
})();

/**
 * Ofsted's monthly management information on state-funded schools: the CSV
 * of each school's latest inspections "as at" the end of a month. Each
 * month's is a new attachment of the same gov.uk page, so the latest is
 * found through gov.uk's Content API.
 */
export const OFSTED_INSPECTIONS = {
  name: "Ofsted inspections of state-funded schools",
  source: "Ofsted",
  page: "https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes",
  content:
    "https://www.gov.uk/api/content/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes",
  /** Its attachments' title, with the day it is as at: "31 August 2026" or "31 Aug 2026". */
  title:
    /^Management information - state-funded schools - latest inspections as at (\d{1,2}) ([A-Za-z]+) (\d{4})$/,
  columns: {
    urn: "URN",
    // The latest full inspection under the renewed framework, from 10
    // November 2025: a report card.
    reportCardNumber: "Inspection number of latest full inspection",
    reportCardStart: "Inspection start date",
    reportCardOfCurrentUrn:
      "Does the latest full inspection relate to the URN of the current school?",
    safeguardingStandards: "Safeguarding standards",
    // The latest graded inspection under the original framework, from 1
    // September 2019 to 9 November 2025.
    gradedStart: "Inspection start date of latest OEIF graded inspection",
    gradedOfCurrentUrn:
      "Does the latest OEIF graded inspection relate to the URN of the current school?",
    overallEffectiveness: "Latest OEIF overall effectiveness",
    safeguardingEffective: "Latest OEIF  safeguarding is effective?",
    // Its latest ungraded inspection under the original framework.
    ungradedDate: "Date of latest ungraded inspection",
    ungradedOfCurrentUrn:
      "Does the ungraded inspection relate to the URN of the current school?",
    ungradedOutcome: "Ungraded inspection overall outcome",
  },
  /** A report card's evaluation areas: each column, and the area as the app names it. */
  reportCardAreas: [
    { column: "Inclusion", area: "Inclusion" },
    { column: "Curriculum and teaching", area: "Curriculum and teaching" },
    { column: "Achievement", area: "Achievement" },
    { column: "Attendance and behaviour", area: "Attendance and behaviour" },
    {
      column: "Personal development and wellbeing",
      area: "Personal development and wellbeing",
    },
    { column: "Early years (where applicable)", area: "Early years" },
    {
      column: "Post-16 provision (where applicable)",
      area: "Post-16 provision",
    },
    { column: "Leadership and governance", area: "Leadership and governance" },
  ],
  /** A graded inspection's key judgements, each graded 1 to 4. */
  gradedAreas: [
    {
      column: "Latest OEIF quality of education",
      area: "Quality of education",
    },
    {
      column: "Latest OEIF behaviour and attitudes",
      area: "Behaviour and attitudes",
    },
    {
      column: "Latest OEIF personal development",
      area: "Personal development",
    },
    {
      column: "Latest OEIF effectiveness of leadership and management",
      area: "Leadership and management",
    },
    {
      column: "Latest OEIF early years provision (where applicable)",
      area: "Early years provision",
    },
    {
      column: "Latest OEIF sixth form provision (where applicable)",
      area: "Sixth form provision",
    },
  ],
  /** How Ofsted writes a missing value. */
  missing: "NULL",
} as const;

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** "31 August 2026" or "31 Aug 2026" as `2026-08-31`, or `null`. */
const isoDate = (day: string, month: string, year: string) => {
  const index = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
  if (index < 0) return null;
  return `${year}-${String(index + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
};

/** A request that says who is asking and gives up after `DOWNLOAD_TIMEOUT_MS`. */
const request = (headers: Record<string, string> = {}): RequestInit => ({
  headers: { "user-agent": USER_AGENT, ...headers },
  signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
});

/** The response, if it is a success. */
const answered = (response: Response, source: string, url: string) => {
  if (!response.ok) {
    throw new Error(`${source} answered ${String(response.status)} for ${url}`);
  }
  return response;
};

/** The value of each attribute of an HTML tag, such as an `<input>`. */
const attributes = (tag: string) =>
  new Map(
    [...tag.matchAll(/([a-zA-Z_:-]+)="([^"]*)"/g)].map(([, name, value]) => [
      name ?? "",
      (value ?? "")
        .replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'"),
    ]),
  );

/** The hidden fields of the form posting to `action` in a page, in order. */
export const formFields = (html: string, action: string) => {
  const start = html.indexOf(`<form action="${action}"`);
  const end = html.indexOf("</form>", start);
  if (start < 0 || end < 0) return null;
  return [...html.slice(start, end).matchAll(/<input\b[^>]*>/g)].flatMap(
    ([tag]) => {
      const input = attributes(tag);
      const name = input.get("name");
      return input.get("type") === "hidden" && name
        ? [[name, input.get("value") ?? ""] as const]
        : [];
    },
  );
};

/** The cookies a response sets, as a request sends them back. */
const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

const layoutChanged = (what: string) =>
  new Error(
    `The ${what} of ${GIAS.source} is not as it was, so the schools register can't be downloaded. Its layout may have changed.`,
  );

/**
 * Downloads the GIAS register's zip as a browser would (`GIAS`), sending back
 * the cookies its form needs, and waiting while it makes the file.
 */
export const downloadGiasZip = async (
  fetchFn: typeof fetch,
  log: (message: string) => void,
  poll: { ms: number; times: number } = GIAS.poll,
) => {
  const pageUrl = `${GIAS.site}${GIAS.downloadsPath}`;
  const page = answered(
    await fetchFn(pageUrl, request()),
    GIAS.source,
    pageUrl,
  );
  const cookie = cookiesOf(page);
  const fields = formFields(await page.text(), GIAS.collatePath);
  const tagField = fields?.find(
    ([name, value]) =>
      /^Downloads\[\d+\]\.Tag$/.test(name) && value === GIAS.tag,
  );
  if (!fields || !tagField) throw layoutChanged("Downloads page");
  const form = new URLSearchParams(
    fields.map(([name, value]) => [name, value]),
  );
  form.append(tagField[0].replace(/\.Tag$/, ".Selected"), "true");

  const collateUrl = `${GIAS.site}${GIAS.collatePath}`;
  const collated = await fetchFn(collateUrl, {
    ...request({
      cookie,
      "content-type": "application/x-www-form-urlencoded",
    }),
    method: "POST",
    body: form.toString(),
    redirect: "manual",
  });
  const generated = collated.headers.get("location");
  if (collated.status !== 302 || !generated) {
    throw new Error(
      `${GIAS.source} answered ${String(collated.status)} for ${collateUrl}, not where to find the file.`,
    );
  }

  const generatedUrl = new URL(generated, GIAS.site).toString();
  for (let time = 0; time < poll.times; time++) {
    const ready = answered(
      await fetchFn(generatedUrl, request({ cookie })),
      GIAS.source,
      generatedUrl,
    );
    const extract = formFields(
      await ready.text(),
      "/Downloads/Download/Extract",
    );
    if (extract) {
      const field = new Map(extract);
      const path = field.get("path");
      const id = field.get("id");
      if (!path || !id) throw layoutChanged("page giving the file");
      const zipUrl = `${path}?${new URLSearchParams({ id }).toString()}`;
      const zip = answered(
        await fetchFn(zipUrl, request()),
        GIAS.source,
        zipUrl,
      );
      return Buffer.from(await zip.arrayBuffer());
    }
    if (time === 0) log(`Waiting for ${GIAS.source} to make the file…`);
    await sleep(poll.ms);
  }
  throw new Error(
    `${GIAS.source} didn't make the file in ${String((poll.ms * poll.times) / 1000)} seconds. Try again later.`,
  );
};

const decode = (bytes: Uint8Array) =>
  new TextDecoder("windows-1252").decode(bytes);

/**
 * Downloads the GIAS register into the table `schools`: each open school in
 * England the Schools Layer shows, with its `urn`, `name`, `phase`,
 * `establishment_type`, the ages it may teach (`age_from`, `age_to`), an
 * independent school's `inspectorate` (independent special schools are
 * `special`, but have one), and its point (`lng`, `lat`,
 * `geometry`), from GIAS's British National Grid easting and northing.
 */
const loadGias = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
  log: (message: string) => void,
): Promise<DownloadedSource> => {
  const entry = zipEntries(await downloadGiasZip(fetchFn, log)).find(
    ({ name }) => GIAS.member.test(name),
  );
  const [, year, month, day] = entry
    ? (GIAS.member.exec(entry.name) ?? [])
    : [];
  if (!entry || !year || !month || !day) {
    throw layoutChanged("zip");
  }
  const csv = join(workDir, "gias.csv");
  await writeFile(csv, decode(entry.read()));

  const from = "read_csv($1, all_varchar = true)";
  const { columns } = GIAS;
  await requireColumns(
    connection,
    from,
    [csv],
    Object.values(columns),
    `The ${GIAS.source} file ${entry.name}`,
  );
  const point = `ST_Point(CAST(${quoted(columns.easting)} AS DOUBLE), CAST(${quoted(columns.northing)} AS DOUBLE))`;
  await connection.run(
    `CREATE TABLE schools AS
       WITH open AS (
         SELECT *, ${PHASE_SQL} AS phase,
           ST_Transform(${point}, 'EPSG:27700', 'EPSG:4326', always_xy := true) AS geometry
         FROM ${from}
         WHERE ${quoted(columns.status)} IN (${list(GIAS.openStatuses)})
           AND ${quoted(columns.region)} IN (${list(GIAS.englishRegions)})
           AND TRY_CAST(${quoted(columns.easting)} AS DOUBLE) > 0
           AND TRY_CAST(${quoted(columns.northing)} AS DOUBLE) > 0
       )
       SELECT ${quoted(columns.urn)} AS urn,
         ${quoted(columns.name)} AS name,
         phase,
         ${quoted(columns.type)} AS establishment_type,
         TRY_CAST(${quoted(columns.lowAge)} AS INTEGER) AS age_from,
         TRY_CAST(${quoted(columns.highAge)} AS INTEGER) AS age_to,
         CASE WHEN (phase = 'independent'
             OR lower(${quoted(columns.type)}) LIKE '%independent%')
           AND ${quoted(columns.inspectorate)} NOT IN ('', 'Not applicable')
           THEN ${quoted(columns.inspectorate)} END AS inspectorate,
         round(ST_X(geometry), 6) AS lng,
         round(ST_Y(geometry), 6) AS lat,
         geometry
       FROM open
       WHERE phase IS NOT NULL`,
    [csv],
  );
  return {
    name: GIAS.name,
    source: GIAS.source,
    url: `${GIAS.site}${GIAS.downloadsPath}`,
    sourceDate: `${year}-${month}-${day}`,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The latest month's CSV among the attachments of Ofsted's page, and the day it is as at. */
export const latestOfstedInspections = (content: unknown) => {
  const attachments =
    isRecord(content) &&
    isRecord(content.details) &&
    Array.isArray(content.details.attachments)
      ? content.details.attachments
      : [];
  const found = attachments.flatMap((attachment) => {
    if (!isRecord(attachment)) return [];
    const { title, url } = attachment;
    if (typeof title !== "string" || typeof url !== "string") return [];
    const [, day, month, year] =
      OFSTED_INSPECTIONS.title.exec(title.trim()) ?? [];
    const asAt = day && month && year ? isoDate(day, month, year) : null;
    return asAt && url.toLowerCase().endsWith(".csv") ? [{ url, asAt }] : [];
  });
  return found.reduce<(typeof found)[number] | null>(
    (latest, next) => (latest && latest.asAt >= next.asAt ? latest : next),
    null,
  );
};

/** A grade column, with Ofsted's `NULL` as SQL's. */
const value = (column: string) =>
  `NULLIF(${quoted(column)}, ${sqlString(OFSTED_INSPECTIONS.missing)})`;

/** Ofsted's dates, `13/01/2026`, as dates. */
const date = (column: string) =>
  `CAST(try_strptime(${value(column)}, '%d/%m/%Y') AS DATE)`;

/** The areas an inspection graded, as a list of `{ area, grade }` in Ofsted's words. */
const grades = (areas: readonly { column: string; area: string }[]) =>
  `list_filter([${areas
    .map(
      ({ column, area }) =>
        `{'area': ${sqlString(area)}, 'grade': ${value(column)}}`,
    )
    .join(", ")}], g -> g.grade IS NOT NULL)`;

/**
 * Downloads Ofsted's latest inspections of state-funded schools into the
 * table `ofsted_inspections`: each school's `urn`; its latest report card's
 * date (`report_card_on`), evaluation area grades (`report_card_grades`),
 * safeguarding standards and whether it inspected this school or the one it
 * replaced; the same of its latest graded inspection, with its overall
 * effectiveness, 1 to 4, and key judgements; and its latest ungraded
 * inspection's date and outcome. Grades are in Ofsted's words, which the
 * backend reads.
 */
const loadOfstedInspections = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
): Promise<DownloadedSource> => {
  const { content: contentUrl, columns: c } = OFSTED_INSPECTIONS;
  const page = answered(
    await fetchFn(contentUrl, request({ accept: "application/json" })),
    OFSTED_INSPECTIONS.source,
    contentUrl,
  );
  const latest = latestOfstedInspections(await page.json());
  if (!latest) {
    throw new Error(
      `${OFSTED_INSPECTIONS.page} has no "latest inspections" CSV any more. Its layout may have changed.`,
    );
  }
  const download = answered(
    await fetchFn(latest.url, request()),
    OFSTED_INSPECTIONS.source,
    latest.url,
  );
  const csv = join(workDir, "ofsted-inspections.csv");
  await writeFile(csv, decode(new Uint8Array(await download.arrayBuffer())));

  const from = "read_csv($1, all_varchar = true)";
  const { reportCardAreas, gradedAreas } = OFSTED_INSPECTIONS;
  await requireColumns(
    connection,
    from,
    [csv],
    [
      ...Object.values(c),
      ...[...reportCardAreas, ...gradedAreas].map(({ column }) => column),
    ],
    `${OFSTED_INSPECTIONS.source}'s latest inspections`,
  );
  await connection.run(
    `CREATE TABLE ofsted_inspections AS
       SELECT ${quoted(c.urn)} AS urn,
         CASE WHEN ${value(c.reportCardNumber)} IS NOT NULL
           THEN ${date(c.reportCardStart)} END AS report_card_on,
         ${grades(reportCardAreas)} AS report_card_grades,
         ${value(c.safeguardingStandards)} AS report_card_safeguarding,
         ${value(c.reportCardOfCurrentUrn)} AS report_card_of_current_urn,
         ${date(c.gradedStart)} AS graded_on,
         ${value(c.overallEffectiveness)} AS overall_effectiveness,
         ${grades(gradedAreas)} AS graded_grades,
         ${value(c.safeguardingEffective)} AS graded_safeguarding,
         ${value(c.gradedOfCurrentUrn)} AS graded_of_current_urn,
         ${date(c.ungradedDate)} AS ungraded_on,
         ${value(c.ungradedOutcome)} AS ungraded_outcome,
         ${value(c.ungradedOfCurrentUrn)} AS ungraded_of_current_urn
       FROM ${from}`,
    [csv],
  );
  return {
    name: OFSTED_INSPECTIONS.name,
    source: OFSTED_INSPECTIONS.source,
    url: latest.url,
    sourceDate: latest.asAt,
  };
};

/**
 * Downloads the Schools Layer's sources into `workDir` and loads them into
 * DuckDB as the tables `schools` and `ofsted_inspections`, keeping only
 * England's open schools. Returns where each came from and its date. Throws
 * if a download fails or a source's layout is not what it was.
 */
export const loadSchools = async (
  connection: DuckDBConnection,
  fetchFn: typeof fetch,
  workDir: string,
  log: (message: string) => void,
) => {
  log(`Downloading the schools register from ${GIAS.source}…`);
  const schools = await loadGias(connection, fetchFn, workDir, log);
  log(`Downloading the latest ${OFSTED_INSPECTIONS.name}…`);
  const ofsted = await loadOfstedInspections(connection, fetchFn, workDir);
  return { schools, ofsted };
};

/**
 * The queries that write each of the Schools Layer's tables to its file,
 * keeping only the inspections of the schools it shows.
 */
export const SCHOOLS_COPIES = {
  schools: "SELECT * FROM schools ORDER BY urn",
  ofsted: `SELECT * FROM ofsted_inspections
    WHERE urn IN (SELECT urn FROM schools) ORDER BY urn`,
} as const;
