import {
  mkdtemp,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";
import {
  CCOD_DATASET,
  CENSUS_2021_DATASET,
  COUNCIL_BOUNDARIES_DATASET,
  COUNCIL_BOUNDARY_DATASET,
  INCOME_ESTIMATES_DATASET,
  INDICES_OF_DEPRIVATION_DATASET,
  OCOD_DATASET,
  OFSTED_INSPECTIONS_DATASET,
  OUTPUT_AREA_BOUNDARIES_DATASET,
  SCHOOLS_DATASET,
  isPreparedManifest,
  type Council,
  type DatasetAttribution,
  type ManifestDataset,
  type PreparedManifest,
} from "@location-scout/shared";

import { companyTitlesCopy, loadCompanyTitles } from "./company-titles";
import {
  COUNCIL_BOUNDARIES,
  ENGLISH_CODE_PREFIX,
  downloadCouncilBoundaries,
} from "./council-boundaries";
import {
  CENSUS_2021,
  DEMOGRAPHICS_COPIES,
  INCOME_ESTIMATES,
  INDICES_OF_DEPRIVATION,
  OUTPUT_AREA_BOUNDARIES,
  loadDemographics,
} from "./demographics";
import { copyToParquet, openDuckDb, sqlString } from "./duckdb";
import { prepareLandData } from "./land-data";
import { loadCodePointOpen } from "./postcodes";
import { SCHOOLS_COPIES, loadSchools } from "./schools";

/** The Land Coverage Area prepared when none has been (PRD FR-6.4). */
export const DEFAULT_LAND_COVERAGE_AREA = "Ashfield";

/** The manifest's file, in `data/` (PRD FR-6.2). */
export const MANIFEST_FILE = "manifest.json";

/** England-wide datasets go in `data/england/` (PRD §6.16). */
export const COUNCIL_BOUNDARIES_FILE = "england/council-boundaries.parquet";

/** The Demographics Layer's England-wide datasets (PRD FR-6.0). */
export const OUTPUT_AREA_BOUNDARIES_FILE =
  "england/output-area-boundaries.parquet";
export const CENSUS_2021_FILE = "england/census-2021.parquet";
export const INCOME_ESTIMATES_FILE = "england/income-estimates.parquet";
export const INDICES_OF_DEPRIVATION_FILE =
  "england/indices-of-deprivation.parquet";

/** The Schools Layer's England-wide datasets (PRD FR-6.0). */
export const SCHOOLS_FILE = "england/schools.parquet";
export const OFSTED_INSPECTIONS_FILE = "england/ofsted-inspections.parquet";

/** HM Land Registry's titles held by UK companies and by overseas companies (PRD FR-6.0). */
export const TITLE_FILES = {
  [CCOD_DATASET]: "england/ccod.parquet",
  [OCOD_DATASET]: "england/ocod.parquet",
} as const;

/** Each Land Coverage Area's own outline, in its own folder. */
export const COUNCIL_BOUNDARY_FILE = "council-boundary.parquet";

/** A file being written, until every file is ready to replace the last run's. */
const PARTIAL = ".partial";

export interface PrepareOptions {
  /** Where to write, normally the repository's `data/`. */
  dataDir: string;
  /** How to download. Tests pass a stub, so nothing reaches the network. */
  fetch: typeof fetch;
  /** Councils to add as Land Coverage Areas, each by name or ONS code. */
  areas: readonly string[];
  /** Make every English council a Land Coverage Area. */
  all: boolean;
  /**
   * The Use land and property data API key, to download CCOD and OCOD, or
   * `null` to skip them, with a warning (PRD FR-6.0).
   */
  landRegistryApiKey?: string | null;
  /** The time the run is recorded as prepared at. */
  now?: () => Date;
  /** Where progress and warnings go. */
  log?: (message: string) => void;
}

/** Where a prepared dataset comes from, and the date its data dates from. */
interface PreparedSource {
  name: string;
  source: string;
  url: string;
  sourceDate: string;
  /** The statements its licence requires, if it requires its own. */
  attribution?: DatasetAttribution;
}

/** Something the person running `pnpm data:prepare` can fix, saying how. */
export class PrepareError extends Error {
  override name = "PrepareError";
}

/** A council's folder in `data/`, for example `ashfield` or `king-s-lynn-and-west-norfolk`. */
export const councilFolder = ({ name }: Council) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The last run's manifest, or `null` if there was none or it can't be read. */
const readManifest = async (dataDir: string) => {
  try {
    const manifest: unknown = JSON.parse(
      await readFile(join(dataDir, MANIFEST_FILE), "utf8"),
    );
    return isPreparedManifest(manifest) ? manifest : null;
  } catch {
    return null;
  }
};

/** Loads the downloaded boundaries into DuckDB, keeping only England's. */
const loadCouncils = async (
  connection: DuckDBConnection,
  geoJsonFile: string,
): Promise<Council[]> => {
  const { codeField, nameField } = COUNCIL_BOUNDARIES;
  await connection.run(
    `CREATE TABLE councils AS
       SELECT "${codeField}" AS code, "${nameField}" AS name, geom AS geometry
       FROM ST_Read($1)
       WHERE starts_with("${codeField}", $2)`,
    [geoJsonFile, ENGLISH_CODE_PREFIX],
  );
  const rows = await connection.runAndReadAll(
    "SELECT code, name FROM councils ORDER BY name",
  );
  return rows
    .getRowObjectsJson()
    .flatMap(({ code, name }) =>
      typeof code === "string" && typeof name === "string"
        ? [{ code, name }]
        : [],
    );
};

const sameText = (a: string, b: string) =>
  a.localeCompare(b, "en-GB", { sensitivity: "base" }) === 0;

/** Finds a council by its name or ONS code, ignoring case. */
const findCouncil = (councils: readonly Council[], wanted: string) =>
  councils.find(
    ({ code, name }) => sameText(code, wanted) || sameText(name, wanted),
  );

const unknownCouncil = (councils: readonly Council[], wanted: string) => {
  const near = councils
    .filter(({ name }) => name.toLowerCase().includes(wanted.toLowerCase()))
    .map(({ name }) => `"${name}"`);
  const suggestion =
    near.length > 0 ? ` Did you mean ${near.join(" or ")}?` : "";
  return new PrepareError(
    `There is no English council called "${wanted}" in ${COUNCIL_BOUNDARIES.source}'s boundaries.${suggestion} Name a council as ONS does, for example --area "${DEFAULT_LAND_COVERAGE_AREA}", or give its code, such as E07000170. Nothing was changed in data/.`,
  );
};

/**
 * The councils to prepare as Land Coverage Areas, in order of name: those
 * named, or Ashfield if none is named and none has been prepared, plus every
 * one prepared before, which is refreshed. `--all` prepares every English
 * council (PRD FR-6.4).
 */
const chooseLandCoverageAreas = (
  councils: readonly Council[],
  { areas, all }: Pick<PrepareOptions, "areas" | "all">,
  previous: PreparedManifest | null,
  log: (message: string) => void,
): Council[] => {
  if (all) return [...councils];

  const named = areas.map((wanted) => {
    const council = findCouncil(councils, wanted);
    if (!council) throw unknownCouncil(councils, wanted);
    return council;
  });
  const kept = (previous?.landCoverageAreas ?? []).flatMap(({ council }) => {
    const still = councils.find(({ code }) => code === council.code);
    if (still) return [still];
    log(
      `${council.name} (${council.code}) is not in ${COUNCIL_BOUNDARIES.source}'s boundaries any more, so it is no longer a Land Coverage Area.`,
    );
    return [];
  });
  const fallback = findCouncil(councils, DEFAULT_LAND_COVERAGE_AREA);
  const wanted =
    named.length === 0 && kept.length === 0 && fallback ? [fallback] : named;

  const chosen = new Map(
    [...kept, ...wanted].map((council) => [council.code, council]),
  );
  return [...chosen.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/** Every file a manifest lists, relative to `data/`. */
const listedFiles = (manifest: PreparedManifest | null) =>
  manifest
    ? [
        ...manifest.datasets,
        ...manifest.landCoverageAreas.flatMap(({ datasets }) => datasets),
      ].map(({ file }) => file)
    : [];

/** Removes a file, and its folder if that leaves it empty. */
const removeFile = async (file: string) => {
  await rm(file, { force: true });
  await rmdir(dirname(file)).catch(() => undefined);
};

/**
 * Downloads the source files, converts them into GeoParquet files in
 * `dataDir`, and writes the manifest listing them with their dates (PRD
 * FR-6.2). Every file is written beside the last run's first, and only once
 * all are ready do they replace it, so a failed download or an unknown
 * council changes nothing. A re-run replaces the files and the manifest: no
 * history is kept (FR-6.5).
 */
export const prepareData = async ({
  dataDir,
  fetch: fetchFn,
  areas,
  all,
  landRegistryApiKey = null,
  now = () => new Date(),
  log = () => undefined,
}: PrepareOptions): Promise<PreparedManifest> => {
  const previous = await readManifest(dataDir);
  const workDir = await mkdtemp(join(tmpdir(), "location-scout-prepare-"));
  // Each file is written beside the one it replaces, as `<file>.partial`.
  const partials: string[] = [];
  const partial = (file: string) => {
    const path = `${join(dataDir, file)}${PARTIAL}`;
    partials.push(path);
    return path;
  };
  try {
    log(
      `Downloading the council boundaries from ${COUNCIL_BOUNDARIES.source}…`,
    );
    const boundaries = await downloadCouncilBoundaries(fetchFn);
    const geoJsonFile = join(workDir, "council-boundaries.geojson");
    await writeFile(geoJsonFile, JSON.stringify(boundaries));

    const connection = await openDuckDb();
    try {
      const councils = await loadCouncils(connection, geoJsonFile);
      if (councils.length === 0) {
        throw new Error(
          `${COUNCIL_BOUNDARIES.source}'s boundaries had no English council in them.`,
        );
      }
      const chosen = chooseLandCoverageAreas(
        councils,
        { areas, all },
        previous,
        log,
      );
      await loadDemographics(connection, fetchFn, workDir, log);
      const schools = await loadSchools(connection, fetchFn, workDir, log);
      const preparedAt = now().toISOString();
      const postcodes = await loadCodePointOpen(
        connection,
        fetchFn,
        workDir,
        preparedAt.slice(0, 10),
        log,
      );
      const titles = await loadCompanyTitles(
        connection,
        fetchFn,
        workDir,
        landRegistryApiKey,
        postcodes !== null,
        log,
      );

      const land = await prepareLandData({
        connection,
        fetch: fetchFn,
        workDir,
        councils: chosen,
        today: preparedAt.slice(0, 10),
        write: (council, file) => partial(`${councilFolder(council)}/${file}`),
        ownership: titles !== null,
        postcodes,
        log,
      });

      const dataset = (
        id: string,
        from: PreparedSource,
        file: string,
        name = from.name,
      ): ManifestDataset => ({
        id,
        name,
        source: from.source,
        sourceUrl: from.url,
        sourceDate: from.sourceDate,
        preparedAt,
        file,
        ...(from.attribution ? { attribution: from.attribution } : {}),
      });
      const manifest: PreparedManifest = {
        preparedAt,
        datasets: [
          dataset(
            COUNCIL_BOUNDARIES_DATASET,
            COUNCIL_BOUNDARIES,
            COUNCIL_BOUNDARIES_FILE,
          ),
          dataset(
            OUTPUT_AREA_BOUNDARIES_DATASET,
            OUTPUT_AREA_BOUNDARIES,
            OUTPUT_AREA_BOUNDARIES_FILE,
          ),
          dataset(CENSUS_2021_DATASET, CENSUS_2021, CENSUS_2021_FILE),
          dataset(
            INCOME_ESTIMATES_DATASET,
            INCOME_ESTIMATES,
            INCOME_ESTIMATES_FILE,
          ),
          dataset(
            INDICES_OF_DEPRIVATION_DATASET,
            INDICES_OF_DEPRIVATION,
            INDICES_OF_DEPRIVATION_FILE,
          ),
          dataset(SCHOOLS_DATASET, schools.schools, SCHOOLS_FILE),
          dataset(
            OFSTED_INSPECTIONS_DATASET,
            schools.ofsted,
            OFSTED_INSPECTIONS_FILE,
          ),
          ...(titles ?? []).map((from) =>
            dataset(from.id, from, TITLE_FILES[from.id]),
          ),
        ],
        landCoverageAreas: chosen.map((council) => ({
          council,
          datasets: [
            dataset(
              COUNCIL_BOUNDARY_DATASET,
              COUNCIL_BOUNDARIES,
              `${councilFolder(council)}/${COUNCIL_BOUNDARY_FILE}`,
              "Council boundary",
            ),
            ...(land.get(council.code) ?? []).map((from) =>
              dataset(from.id, from, `${councilFolder(council)}/${from.file}`),
            ),
          ],
        })),
      };

      log(
        `Converting ${String(councils.length)} English councils' boundaries to GeoParquet…`,
      );
      await copyToParquet(
        connection,
        "SELECT code, name, geometry FROM councils ORDER BY code",
        partial(COUNCIL_BOUNDARIES_FILE),
      );
      log("Converting the Demographics Layer's datasets to GeoParquet…");
      for (const [{ query, rowGroupSize }, file] of [
        [DEMOGRAPHICS_COPIES.outputAreas, OUTPUT_AREA_BOUNDARIES_FILE],
        [DEMOGRAPHICS_COPIES.census, CENSUS_2021_FILE],
        [DEMOGRAPHICS_COPIES.income, INCOME_ESTIMATES_FILE],
        [DEMOGRAPHICS_COPIES.deprivation, INDICES_OF_DEPRIVATION_FILE],
      ] as const) {
        await copyToParquet(connection, query, partial(file), rowGroupSize);
      }
      log("Converting the Schools Layer's datasets to GeoParquet…");
      await copyToParquet(
        connection,
        SCHOOLS_COPIES.schools,
        partial(SCHOOLS_FILE),
      );
      await copyToParquet(
        connection,
        SCHOOLS_COPIES.ofsted,
        partial(OFSTED_INSPECTIONS_FILE),
      );
      if (titles) {
        log("Converting CCOD's and OCOD's titles in England to Parquet…");
        for (const { id } of titles) {
          await copyToParquet(
            connection,
            companyTitlesCopy(id),
            partial(TITLE_FILES[id]),
          );
        }
      }
      for (const council of chosen) {
        await copyToParquet(
          connection,
          `SELECT code, name, geometry FROM councils WHERE code = ${sqlString(council.code)}`,
          partial(`${councilFolder(council)}/${COUNCIL_BOUNDARY_FILE}`),
        );
      }

      const manifestPartial = partial(MANIFEST_FILE);
      await writeFile(
        manifestPartial,
        `${JSON.stringify(manifest, null, 2)}\n`,
      );

      // Everything is ready: replace the last run's files, then its manifest.
      const files = listedFiles(manifest);
      for (const file of files) {
        await rename(`${join(dataDir, file)}${PARTIAL}`, join(dataDir, file));
      }
      await rename(manifestPartial, join(dataDir, MANIFEST_FILE));
      partials.length = 0;

      // A council that is no longer a Land Coverage Area keeps nothing behind.
      for (const file of listedFiles(previous)) {
        if (!files.includes(file)) await removeFile(join(dataDir, file));
      }
      return manifest;
    } finally {
      connection.closeSync();
    }
  } catch (error) {
    for (const path of partials) await removeFile(path);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};
