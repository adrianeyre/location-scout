import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";
import {
  INSPIRE_INDEX_POLYGONS_DATASET,
  LAND_PARCELS_DATASET,
  OSM_BUILDINGS_DATASET,
  OSM_LAND_USE_DATASET,
  OSM_ROADS_DATASET,
  OSM_WATER_DATASET,
  NEARBY_LAND_SALES_RULES,
  POSTCODES_DATASET,
  type Council,
  type DatasetAttribution,
} from "@location-scout/shared";

import { ENGLAND_BOUNDS } from "./demographics";
import { copyToParquet, sqlString } from "./duckdb";
import {
  GEOFABRIK,
  chooseExtracts,
  downloadExtract,
  loadGeofabrikIndex,
  loadOsm,
  type GeofabrikExtract,
} from "./geofabrik";
import {
  INSPIRE,
  downloadInspireZip,
  inspireAttribution,
  inspireFileFor,
  loadInspire,
  openInspireDownloads,
} from "./inspire";
import { LAND_PARCELS_QUERY, buildLandParcels } from "./land-parcels";
import {
  PLANNING_CONSTRAINTS,
  constraintsTable,
  downloadPlanningConstraints,
  loadPlanningConstraints,
} from "./planning-constraints";
import type { PostcodesSource } from "./postcodes";
import { matchCouncilTitles } from "./title-ownership";

/**
 * A Land Coverage Area's land data (PRD FR-6.1, FR-6.2): its INSPIRE Index
 * Polygons, OpenStreetMap's land use, buildings, roads and water, and
 * planning.data.gov.uk's Planning Constraints, each in its own GeoParquet
 * file in the council's folder, and the Land Parcels the Land Opportunity
 * Finder finds Land Opportunities among, built and tagged from them
 * (FR-5.2, FR-5.4). And the postcodes in and around it, from Code-Point
 * Open, where the Price Paid sales near its Land Opportunities are placed
 * (FR-5.4b).
 */

/**
 * OpenStreetMap features and Planning Constraints are kept if they reach
 * within this distance of the council's boundary, whole, so that a Land
 * Parcel at its edge still finds the road, the buildings or the flood zone
 * just across it (FR-5.3's 50 m from a road).
 */
export const CLIP_MARGIN_METRES = 100;

/** The files in a Land Coverage Area's folder, beside its `council-boundary.parquet`. */
export const LAND_FILES = {
  inspire: "inspire-index-polygons.parquet",
  osm: {
    osm_land_use: "osm-land-use.parquet",
    osm_buildings: "osm-buildings.parquet",
    osm_roads: "osm-roads.parquet",
    osm_water: "osm-water.parquet",
  },
  constraints: (dataset: string) => `${dataset}.parquet`,
  parcels: "land-parcels.parquet",
  postcodes: "postcodes.parquet",
} as const;

/** The OpenStreetMap datasets: each table, its id and its name. */
const OSM_DATASETS = [
  { table: "osm_land_use", id: OSM_LAND_USE_DATASET, name: "Land use" },
  { table: "osm_buildings", id: OSM_BUILDINGS_DATASET, name: "Buildings" },
  { table: "osm_roads", id: OSM_ROADS_DATASET, name: "Roads" },
  { table: "osm_water", id: OSM_WATER_DATASET, name: "Water" },
] as const;

/** A dataset prepared for a Land Coverage Area, as the manifest will list it. */
export interface LandDataset {
  id: string;
  name: string;
  source: string;
  url: string;
  sourceDate: string;
  /** Its file in the council's folder. */
  file: string;
  attribution?: DatasetAttribution;
}

/** Shapes are written along a Hilbert curve in small row groups, so a query of a small area reads little. */
const ROW_GROUP_SIZE = 2048;

/** A query's rows along a Hilbert curve, then by `key`, so every run writes them in the same order. */
const inOrder = (query: string, key: string) =>
  `${query} ORDER BY ST_Hilbert(geometry, ${ENGLAND_BOUNDS}), ${key}`;

/** The rows of a table that reach into a council's boundary, with the margin. */
const clipped = (table: string, key: string, code: string) =>
  inOrder(
    `SELECT t.* FROM ${table} t, (SELECT * FROM land_areas WHERE code = ${sqlString(code)}) a
     WHERE t.xmax >= a.xmin AND t.xmin <= a.xmax AND t.ymax >= a.ymin AND t.ymin <= a.ymax
       AND ST_Intersects(t.geometry, a.clip)`,
    key,
  );

/**
 * Each postcode's middle, from Code-Point Open's `postcodes`, within 1 mile
 * of a council's boundary: every one a land sale near its Land
 * Opportunities may be in (PRD FR-5.4b). Each is a point in WGS 84, with
 * its latitude and longitude beside it, so a query of a small area reads
 * little of the file. Points are found first by the boundary's bounds.
 */
const postcodesNear = (code: string) => {
  const within = String(NEARBY_LAND_SALES_RULES.withinMetres);
  return inOrder(
    `SELECT postcode, ST_Y(geometry) AS lat, ST_X(geometry) AS lng, geometry FROM (
       SELECT p.postcode, ST_Transform(p.geometry, 'EPSG:27700', 'EPSG:4326', always_xy := true) AS geometry
       FROM postcodes p, (
         SELECT ST_Transform(boundary, 'EPSG:4326', 'EPSG:27700', always_xy := true) AS boundary
         FROM land_areas WHERE code = ${sqlString(code)}
       ) a
       WHERE ST_X(p.geometry) BETWEEN ST_XMin(a.boundary) - ${within} AND ST_XMax(a.boundary) + ${within}
         AND ST_Y(p.geometry) BETWEEN ST_YMin(a.boundary) - ${within} AND ST_YMax(a.boundary) + ${within}
         AND ST_DWithin(p.geometry, a.boundary, ${within})
     )`,
    "postcode",
  );
};

/** Councils' codes, as an SQL list. */
const codes = (councils: readonly Council[]) =>
  councils.map(({ code }) => sqlString(code)).join(", ");

/** "Nottinghamshire's", "Greater London's". */
const possessive = (name: string) => `${name}'${name.endsWith("s") ? "" : "s"}`;

export interface PrepareLandOptions {
  /** With the spatial extension loaded, and the table `councils`. */
  connection: DuckDBConnection;
  fetch: typeof fetch;
  workDir: string;
  /** The Land Coverage Areas to prepare. */
  councils: readonly Council[];
  /** Today, as an ISO 8601 date, for which Planning Constraints are still in force. */
  today: string;
  /** Where to write one of a council's files. */
  write: (council: Council, file: string) => string;
  /**
   * Whether CCOD's and OCOD's titles are loaded, in `company_titles`, with
   * `title_districts` and `postcodes`, so each council's are matched to its
   * INSPIRE Index Polygons and give its Land Parcels Ownership Categories.
   */
  ownership: boolean;
  /**
   * Code-Point Open, if it is loaded, in `postcodes`, so each council's
   * postcodes are kept, for the land sales near its Land Opportunities.
   */
  postcodes: PostcodesSource | null;
  log: (message: string) => void;
}

/**
 * Downloads each Land Coverage Area's land data and writes its files, with
 * `write`. Each source is downloaded once a run: planning.data.gov.uk's
 * datasets for every council, each Geofabrik extract for the councils it
 * covers, and each council's own INSPIRE zip. Councils clipped from the same
 * extracts are prepared together, so only those extracts' features are in
 * memory at once.
 * With `ownership`, each council's companies' and councils' titles are
 * matched to its INSPIRE Index Polygons before its Land Parcels are built.
 * With `postcodes`, the postcodes within 1 mile of it are kept.
 * Returns each council's datasets by its code. Throws if a download fails,
 * or a council has no INSPIRE file or Geofabrik extract.
 */
export const prepareLandData = async ({
  connection,
  fetch: fetchFn,
  workDir,
  councils,
  today,
  write,
  ownership,
  postcodes,
  log,
}: PrepareLandOptions): Promise<Map<string, LandDataset[]>> => {
  const prepared = new Map<string, LandDataset[]>();
  if (councils.length === 0) return prepared;

  await connection.run(
    `CREATE OR REPLACE TABLE land_areas AS
       WITH chosen AS (
         SELECT code, geometry AS boundary,
           ST_Transform(ST_Buffer(ST_Transform(geometry, 'EPSG:4326', 'EPSG:27700', always_xy := true), ${String(CLIP_MARGIN_METRES)}), 'EPSG:27700', 'EPSG:4326', always_xy := true) AS clip
         FROM councils WHERE code IN (${codes(councils)})
       )
       SELECT code, boundary, clip,
         ST_XMin(clip) AS xmin, ST_YMin(clip) AS ymin,
         ST_XMax(clip) AS xmax, ST_YMax(clip) AS ymax
       FROM chosen`,
  );

  log(`Finding each council's ${INSPIRE.name} at ${INSPIRE.source}…`);
  const { downloads, cookie } = await openInspireDownloads(fetchFn);
  const withFiles = councils.map((council) => {
    const inspireFile = inspireFileFor(council, downloads.files);
    if (!inspireFile) {
      throw new Error(
        `${INSPIRE.source} has no one ${INSPIRE.name} file for ${council.name} (${council.code}) on ${INSPIRE.site}${INSPIRE.downloadPath}. If it names the council differently, add its name to INSPIRE_NAMES in scripts/data-prepare/src/inspire.ts.`,
      );
    }
    return { council, inspireFile };
  });
  const attribution = inspireAttribution(downloads.publishedOn);

  log(`Finding the ${GEOFABRIK.source} extracts that cover each council…`);
  await loadGeofabrikIndex(connection, fetchFn, workDir);
  const extracts = await chooseExtracts(connection);
  // Councils clipped from the same extracts are prepared together.
  const byExtracts = new Map<
    string,
    { extracts: GeofabrikExtract[]; councils: typeof withFiles }
  >();
  for (const area of withFiles) {
    const chosen = extracts.get(area.council.code);
    if (!chosen) {
      throw new Error(
        `No ${GEOFABRIK.source} extract in ${GEOFABRIK.index} covers ${area.council.name} (${area.council.code}).`,
      );
    }
    const key = chosen.map(({ id }) => id).join(" ");
    const group = byExtracts.get(key) ?? {
      extracts: chosen,
      councils: [] as typeof withFiles,
    };
    group.councils.push(area);
    byExtracts.set(key, group);
  }
  await connection.run("DROP TABLE geofabrik_extracts");

  const constraints = await downloadPlanningConstraints(
    connection,
    fetchFn,
    workDir,
    today,
    log,
  );

  // Each extract is downloaded once a run, for every group that needs it.
  const downloaded = new Map<
    string,
    { file: string; url: string; sourceDate: string }
  >();
  const download = async (extract: GeofabrikExtract) => {
    const done = downloaded.get(extract.id);
    if (done) return done;
    log(
      `Downloading ${possessive(extract.name)} ${GEOFABRIK.name} from ${GEOFABRIK.source}…`,
    );
    const file = join(workDir, `${extract.id}.osm.pbf`);
    const extractDownload = {
      file,
      ...(await downloadExtract(fetchFn, extract, file)),
    };
    downloaded.set(extract.id, extractDownload);
    return extractDownload;
  };

  const groups = [...byExtracts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => group);
  for (const { extracts: chosen, councils: inExtract } of groups) {
    const files = [];
    for (const extract of chosen) files.push(await download(extract));
    const { unbuilt } = await loadOsm(
      connection,
      files.map(({ file }) => file),
    );
    if (unbuilt > 0) {
      log(
        `${String(unbuilt)} of OpenStreetMap's multipolygons there are mapped so that no area can be built from them, so they are left out.`,
      );
    }
    // Its data is as recent as its oldest extract's.
    const osm = {
      url: files.map(({ url }) => url).join(" "),
      sourceDate: files
        .map(({ sourceDate }) => sourceDate)
        .reduce((oldest, day) => (day < oldest ? day : oldest)),
    };

    const box = await connection.runAndReadAll(
      `SELECT min(xmin) AS xmin, min(ymin) AS ymin, max(xmax) AS xmax, max(ymax) AS ymax
       FROM land_areas WHERE code IN (${codes(inExtract.map(({ council }) => council))})`,
    );
    const [bounds] = box.getRowObjectsJson();
    const { xmin, ymin, xmax, ymax } = bounds ?? {};
    for (const dataset of constraints) {
      await loadPlanningConstraints(
        connection,
        dataset,
        {
          xmin: Number(xmin),
          ymin: Number(ymin),
          xmax: Number(xmax),
          ymax: Number(ymax),
        },
        today,
      );
    }

    for (const { council, inspireFile } of inExtract) {
      log(`Preparing the Land Coverage Area ${council.name}…`);
      const zip = join(workDir, "inspire.zip");
      await downloadInspireZip(fetchFn, inspireFile, cookie, zip);
      await loadInspire(connection, zip);
      await rm(zip, { force: true });
      await copyToParquet(
        connection,
        inOrder("SELECT * FROM inspire_index_polygons", "inspire_id"),
        write(council, LAND_FILES.inspire),
        ROW_GROUP_SIZE,
      );
      for (const { table } of OSM_DATASETS) {
        await copyToParquet(
          connection,
          clipped(table, "osm_type, osm_id", council.code),
          write(council, LAND_FILES.osm[table]),
          ROW_GROUP_SIZE,
        );
      }
      for (const { dataset } of constraints) {
        await copyToParquet(
          connection,
          clipped(constraintsTable(dataset), "entity", council.code),
          write(council, LAND_FILES.constraints(dataset)),
          ROW_GROUP_SIZE,
        );
      }
      let titled = false;
      if (ownership) {
        log(
          `Matching ${possessive(council.name)} companies' and councils' titles to its ${INSPIRE.name}…`,
        );
        const { titles, matched } = await matchCouncilTitles(
          connection,
          council,
          files.map(({ file }) => file),
        );
        titled = titles > 0;
        log(
          titled
            ? `Matched ${String(matched)} of its ${String(titles)} freehold titles in CCOD and OCOD to one ${INSPIRE.name.replace(/s$/, "")} each, by their addresses.`
            : `Warning: no title in CCOD or OCOD names ${council.name} as its District, so its Land Parcels have no Ownership Category.`,
        );
      }
      log(`Building ${possessive(council.name)} Land Parcels…`);
      await buildLandParcels(connection, council.code, { ownership: titled });
      await copyToParquet(
        connection,
        LAND_PARCELS_QUERY,
        write(council, LAND_FILES.parcels),
        ROW_GROUP_SIZE,
      );
      await connection.run("DROP TABLE land_parcels");
      await connection.run("DROP TABLE IF EXISTS inspire_titles");
      if (postcodes) {
        await copyToParquet(
          connection,
          postcodesNear(council.code),
          write(council, LAND_FILES.postcodes),
          ROW_GROUP_SIZE,
        );
      }
      prepared.set(council.code, [
        {
          id: INSPIRE_INDEX_POLYGONS_DATASET,
          name: INSPIRE.name,
          source: INSPIRE.source,
          url: inspireFile.url,
          sourceDate: downloads.publishedOn,
          file: LAND_FILES.inspire,
          attribution,
        },
        ...OSM_DATASETS.map(({ table, id, name }) => ({
          id,
          name,
          source: `OpenStreetMap via ${GEOFABRIK.source}`,
          url: osm.url,
          sourceDate: osm.sourceDate,
          file: LAND_FILES.osm[table],
        })),
        ...constraints.map(({ dataset, name, url, sourceDate }) => ({
          id: dataset,
          name,
          source: PLANNING_CONSTRAINTS.source,
          url,
          sourceDate,
          file: LAND_FILES.constraints(dataset),
        })),
        // Built from OpenStreetMap's land, and tagged from the rest.
        {
          id: LAND_PARCELS_DATASET,
          name: "Land Parcels",
          source: `OpenStreetMap via ${GEOFABRIK.source}`,
          url: osm.url,
          sourceDate: osm.sourceDate,
          file: LAND_FILES.parcels,
        },
        ...(postcodes
          ? [
              {
                id: POSTCODES_DATASET,
                name: postcodes.name,
                source: postcodes.source,
                url: postcodes.url,
                sourceDate: postcodes.sourceDate,
                file: LAND_FILES.postcodes,
                attribution: postcodes.attribution,
              },
            ]
          : []),
      ]);
    }
    await connection.run("DROP TABLE IF EXISTS inspire_index_polygons");
  }
  for (const { file } of downloaded.values()) await rm(file, { force: true });
  return prepared;
};
