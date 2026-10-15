import {
  COUNCIL_BOUNDARIES_DATASET,
  DEFAULT_LAND_FILTERS,
  DEFAULT_LAND_SCOPE,
  DEFAULT_LAND_SORT,
  INSPIRE_INDEX_POLYGONS_DATASET,
  LAND_LIST_LIMIT,
  LAND_PARCEL_RULES,
  LAND_PARCELS_DATASET,
  LAND_USE_CONTEXT_TYPES,
  OSM_LAND_USE_DATASET,
  OWNERSHIP_CATEGORIES,
  SQUARE_METRES_PER_ACRE,
  SQUARE_METRES_PER_HECTARE,
  isLandUseContextType,
  isOwnershipCategory,
  isPlanningConstraintType,
  searchAreaRing,
  type Council,
  type DataPeriod,
  type InspireOverlap,
  type InspirePolygon,
  type LandConstraint,
  type LandFilters,
  type LandOpportunityFeature,
  type LandParcel,
  type LandScope,
  type LandSort,
  type LandStatistics,
  type LandUseArea,
  type ManifestDataset,
  type MatchedTitle,
  type OwnershipCategory,
  type PreparedManifest,
  type SearchArea,
} from "@location-scout/shared";
import type { Json } from "@duckdb/node-api";

import {
  NotPreparedError,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import { outlineOf } from "./demographics";
import { RUN_DATA_PREPARE, type PreparedData } from "./prepared-data";

/*
 * The Land Layer's prepared data (PRD FR-2.7, §6.6): each Land Coverage
 * Area's Land Parcels, which `pnpm data:prepare` builds from OpenStreetMap's
 * open or undeveloped land and tags (FR-5.2, FR-5.4), and its INSPIRE Index
 * Polygons and land use. The backend only filters and sorts them.
 */

// Read afresh every time, which takes milliseconds, so a re-run of
// `pnpm data:prepare` shows at once.
export const landParcels: DataSource = {
  id: "land-parcels",
  name: "Land Parcels",
  cacheTtlMs: 0,
};

/** Where Land Opportunities are looked for, which of them, and in what order. */
export interface LandQuery {
  scope: LandScope;
  sort: LandSort;
  filters: LandFilters;
}

/** The Land Layer's defaults: the Search Area, the largest first, with FR-5.3's filters. */
export const DEFAULT_LAND_QUERY: LandQuery = {
  scope: DEFAULT_LAND_SCOPE,
  sort: DEFAULT_LAND_SORT,
  filters: DEFAULT_LAND_FILTERS,
};

/**
 * A Land Opportunity found, before the land sales (PRD FR-5.4b) and the
 * Planning Applications (FR-5.4) near it are.
 */
export type LandOpportunityFound = Omit<
  LandOpportunityFeature,
  "nearbyLandSales" | "nearbyPlanningApplications"
>;

/** The Land Opportunities found, before the land sales near them are. */
export interface LandFound {
  /** The Land Coverage Areas looked in: those the Search Area reaches into. */
  landCoverageAreas: Council[];
  /** The councils the Search Area reaches into whose land data isn't prepared. */
  notCovered: Council[];
  /** `null` if the Search Area reaches into no Land Coverage Area. */
  found: {
    features: LandOpportunityFound[];
    landUse: LandUseArea[];
    statistics: Omit<LandStatistics, "nearbyLandSales">;
  } | null;
}

/** One Land Parcel and the INSPIRE Index Polygons that overlap it, with their outlines. */
export interface LandParcelFound {
  parcel: LandParcel;
  inspirePolygons: InspirePolygon[];
}

export class LandError extends Error {
  override name = "LandError";
}

/** The order Land Opportunities are listed in, each from a fixed list. */
const SORT_ORDER: Readonly<Record<LandSort, string>> = {
  area: "area_m2 DESC",
  "road-distance": "road_distance_m ASC NULLS LAST, area_m2 DESC",
  capacity: "estimated_homes DESC, area_m2 DESC",
};

/** A shape in WGS 84, in British National Grid, where distances are in metres. */
const bng = (geometry: string) =>
  `ST_Transform(${geometry}, 'EPSG:4326', 'EPSG:27700', always_xy := true)`;

/** The columns of a Land Parcel, of the table `alias`, that make it a `LandParcel`. */
const parcelColumns = (alias: string) =>
  `${[
    "parcel_id",
    "name",
    "land_use",
    "area_m2",
    "road_distance_m",
    "inspire_coverage",
    "possibly_unregistered",
    "inspire_polygons",
    "ownership_category",
    "matched_titles",
    "constraints",
    "flood_zone",
    "on_listed_building_outline",
    "estimated_homes",
    "lat",
    "lng",
  ]
    .map((column) => `${alias}.${column}`)
    .join(", ")}, ST_AsGeoJSON(${alias}.geometry) AS shape`;

/** Each Ownership Category's count of Land Opportunities, as the summary names it. */
const categoryCount = (category: OwnershipCategory) =>
  `${category.replaceAll("-", "_")}_count`;

/**
 * One Land Coverage Area's Land Opportunities: the Land Parcels in the
 * Search Area (`$3` false) or anywhere in it (`$3` true) that meet the
 * filters, the first `$15` in the order chosen, each with its distance from
 * the Location, and a summary of them all: with how many are in each
 * Ownership Category, and whether its parcels have them at all
 * (`categorised`), which they don't where CCOD and OCOD weren't prepared. Parcels are found first by their
 * bounds, which the file keeps beside their outlines, so for a Search Area
 * DuckDB reads only the row groups near it. There is always one row: the
 * summary, with no parcel if none meets the filters.
 */
const landOpportunitiesSql = (sort: LandSort) => `
  WITH search_area AS (SELECT ST_GeomFromText($2) AS shape),
  in_scope AS (
    SELECT p.* FROM read_parquet($1) p, search_area s
    WHERE $3 OR (p.xmax >= $4 AND p.xmin <= $6 AND p.ymax >= $5 AND p.ymin <= $7
      AND ST_Intersects(p.geometry, s.shape))
  ),
  opportunities AS (
    SELECT * FROM in_scope
    WHERE area_m2 >= $8 AND ($9::DOUBLE IS NULL OR area_m2 <= $9)
      AND ($10::DOUBLE IS NULL OR road_distance_m <= $10)
      AND coalesce(flood_zone, 1) <= $11
      AND (NOT $12 OR possibly_unregistered)
      AND NOT list_has_any(constraint_types, string_split($13, ','))
      AND (NOT $14 OR NOT on_listed_building_outline)
      AND ($18 = '' OR list_contains(string_split($18, ','), ownership_category))
  ),
  summary AS (
    SELECT (SELECT count(*) FROM in_scope) AS parcels, count(*) AS count,
      coalesce(sum(area_m2), 0) AS total_m2,
      count(*) FILTER (WHERE possibly_unregistered) AS possibly_unregistered_count,
      ${OWNERSHIP_CATEGORIES.map((category) => `count(*) FILTER (WHERE ownership_category = '${category}') AS ${categoryCount(category)}`).join(", ")},
      (SELECT coalesce(bool_or(ownership_category IS NOT NULL), false) FROM read_parquet($1)) AS categorised,
      coalesce(sum(estimated_homes), 0) AS total_homes
    FROM opportunities
  ),
  listed AS (
    SELECT *, row_number() OVER (ORDER BY ${SORT_ORDER[sort]}, parcel_id) AS rank
    FROM opportunities
    ORDER BY rank
    LIMIT $15
  )
  SELECT s.*, l.rank, ${parcelColumns("l")},
    ST_Distance(${bng("l.geometry")}, ${bng("ST_Point($16, $17)")}) AS distance_m
  FROM summary s LEFT JOIN listed l ON true
  ORDER BY l.rank`;

/** The industrial, commercial and retail land use in the Search Area, as context (PRD FR-2.7). */
const LAND_USE_SQL = `
  WITH search_area AS (SELECT ST_GeomFromText($2) AS shape)
  SELECT t.osm_type, t.osm_id, t.landuse, t.name, ST_AsGeoJSON(t.geometry) AS shape
  FROM read_parquet($1) t, search_area s
  WHERE t.landuse IN (${LAND_USE_CONTEXT_TYPES.map((type) => `'${type}'`).join(", ")})
    AND t.xmax >= $3 AND t.xmin <= $5 AND t.ymax >= $4 AND t.ymin <= $6
    AND ST_Intersects(t.geometry, s.shape)
  ORDER BY t.osm_type, t.osm_id`;

/** The councils whose boundaries the Search Area reaches into. */
const COUNCILS_REACHED_SQL = `
  SELECT code, name FROM read_parquet($1)
  WHERE ST_Intersects(geometry, ST_GeomFromText($2))
  ORDER BY name, code`;

/** One Land Parcel, by its id. */
const LAND_PARCEL_SQL = `
  SELECT ${parcelColumns("p")}, p.xmin, p.ymin, p.xmax, p.ymax
  FROM read_parquet($1) p WHERE p.parcel_id = $2`;

/** The INSPIRE Index Polygons with these ids, `$2` separated by commas, within the bounds `$3` to `$6`. */
const INSPIRE_POLYGONS_SQL = `
  SELECT CAST(inspire_id AS VARCHAR) AS inspire_id, ST_AsGeoJSON(geometry) AS shape
  FROM read_parquet($1)
  WHERE xmax >= $3 AND xmin <= $5 AND ymax >= $4 AND ymin <= $6
    AND list_contains(string_split($2, ','), CAST(inspire_id AS VARCHAR))`;

const text = (value: Json | undefined) =>
  typeof value === "string" && value !== "" ? value : null;

/** A number DuckDB gives as a number, or as text for a big integer. */
const number = (value: Json | undefined) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

const required = (value: Json | undefined, what: string) => {
  const parsed = number(value);
  if (parsed === null) throw new LandError(`No ${what} in a Land Parcel's row`);
  return parsed;
};

/** Rounded to `places` decimal places. */
const rounded = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const records = (value: Json | undefined) =>
  Array.isArray(value)
    ? value.flatMap((each) =>
        typeof each === "object" && each !== null && !Array.isArray(each)
          ? [each]
          : [],
      )
    : [];

const ownershipCategory = (value: Json | undefined) =>
  isOwnershipCategory(value) ? value : null;

const inspireOverlaps = (value: Json | undefined): InspireOverlap[] =>
  records(value).flatMap((each) => {
    const inspireId = text(each.inspire_id);
    const share = number(each.share);
    return inspireId && share !== null
      ? [
          {
            inspireId,
            share: rounded(Math.min(1, share), 3),
            ownershipCategory: ownershipCategory(each.ownership_category),
          },
        ]
      : [];
  });

const matchedTitles = (value: Json | undefined): MatchedTitle[] =>
  records(value).flatMap((each): MatchedTitle[] => {
    const titleNumber = text(each.title_number);
    const propertyAddress = text(each.property_address);
    const proprietorshipCategory = text(each.proprietorship_category);
    const sourceDate = text(each.source_date);
    const inspireId = text(each.inspire_id);
    const distance = number(each.distance_m);
    const category = each.ownership_category;
    const dataset = each.dataset;
    const matchedBy = each.matched_by;
    return titleNumber &&
      propertyAddress &&
      proprietorshipCategory &&
      sourceDate &&
      inspireId &&
      distance !== null &&
      (category === "company" || category === "council-or-public-body") &&
      (dataset === "ccod" || dataset === "ocod") &&
      (matchedBy === "address" || matchedBy === "named")
      ? [
          {
            titleNumber,
            propertyAddress,
            proprietorshipCategory,
            ownershipCategory: category,
            dataset,
            sourceDate,
            matchedBy,
            inspireId,
            distanceMetres: Math.round(distance),
          },
        ]
      : [];
  });

const landConstraints = (value: Json | undefined): LandConstraint[] =>
  records(value).flatMap((each) => {
    const name = text(each.name);
    return isPlanningConstraintType(each.type) && name
      ? [{ type: each.type, name }]
      : [];
  });

/** Reads a Land Parcel's columns (`parcelColumns`) in a Land Coverage Area. */
export const readLandParcel = (
  row: Record<string, Json>,
  council: Council,
): LandParcel => {
  const id = text(row.parcel_id);
  const shape = text(row.shape);
  if (!id || !shape) throw new LandError("A Land Parcel's row is incomplete");
  const areaM2 = required(row.area_m2, "area");
  const road = number(row.road_distance_m);
  const floodZone = number(row.flood_zone);
  return {
    id,
    location: {
      lat: required(row.lat, "point"),
      lng: required(row.lng, "point"),
    },
    council,
    name: text(row.name),
    landUse: Array.isArray(row.land_use)
      ? row.land_use.flatMap((tag) => (typeof tag === "string" ? [tag] : []))
      : [],
    areaHectares: rounded(areaM2 / SQUARE_METRES_PER_HECTARE, 3),
    areaAcres: rounded(areaM2 / SQUARE_METRES_PER_ACRE, 3),
    roadDistanceMetres: road === null ? null : Math.round(road),
    inspireCoverage: rounded(
      Math.min(1, required(row.inspire_coverage, "INSPIRE coverage")),
      3,
    ),
    possiblyUnregistered: row.possibly_unregistered === true,
    inspirePolygons: inspireOverlaps(row.inspire_polygons),
    ownershipCategory: ownershipCategory(row.ownership_category),
    matchedTitles: matchedTitles(row.matched_titles),
    constraints: landConstraints(row.constraints),
    floodZone: floodZone === 2 || floodZone === 3 ? floodZone : null,
    onListedBuildingOutline: row.on_listed_building_outline === true,
    estimatedHomes: required(row.estimated_homes, "estimated homes"),
    shape: outlineOf(shape),
  };
};

/**
 * The Search Area's outline, as WKT, the same 64-cornered circle the map
 * draws, and its bounds.
 */
const searchAreaShape = ({ location, searchRadius }: SearchArea) => {
  const ring = searchAreaRing(location, searchRadius.metres);
  const lngs = ring.map(([lng]) => lng);
  const lats = ring.map(([, lat]) => lat);
  return {
    wkt: `POLYGON((${ring.map(([lng, lat]) => `${String(lng)} ${String(lat)}`).join(", ")}))`,
    bounds: [
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ],
  };
};

/**
 * Runs a query over a Land Coverage Area's Land Parcels. Those prepared
 * before Ownership Categories were added have none of their columns, so
 * they are not prepared.
 */
const queryParcels = async (
  prepared: PreparedData,
  parcels: ManifestDataset,
  council: Council,
  sql: string,
  values: Parameters<PreparedData["query"]>[2],
) => {
  try {
    return await prepared.query(parcels, sql, values);
  } catch (error) {
    if (
      error instanceof Error &&
      /column (named )?"(ownership_category|matched_titles)"/i.test(
        error.message,
      )
    ) {
      throw new NotPreparedError(
        `${council.name}'s Land Parcels were prepared before Ownership Categories were added. ${RUN_DATA_PREPARE}`,
        { cause: error },
      );
    }
    throw error;
  }
};

/** A dataset a Land Coverage Area must have, or else it is not prepared. */
const landDataset = (
  datasets: readonly ManifestDataset[],
  id: string,
  council: Council,
) => {
  const found = datasets.find((dataset) => dataset.id === id);
  if (!found) {
    throw new NotPreparedError(
      `${council.name}'s land data has no ${id}: it was prepared before it was added. ${RUN_DATA_PREPARE}`,
    );
  }
  return found;
};

/** The dates the Land Parcels of these Land Coverage Areas date from. */
const periodOf = (dates: readonly string[]): DataPeriod | null => {
  const sorted = [...dates].sort();
  const [from] = sorted;
  const to = sorted.at(-1);
  return from && to ? { from, to } : null;
};

/** The councils a Search Area reaches into, and which of them are Land Coverage Areas. */
const councilsReached = async (
  manifest: PreparedManifest,
  prepared: PreparedData,
  wkt: string,
) => {
  const boundaries = manifest.datasets.find(
    ({ id }) => id === COUNCIL_BOUNDARIES_DATASET,
  );
  if (!boundaries) {
    throw new NotPreparedError(
      `The manifest lists no council boundaries. ${RUN_DATA_PREPARE}`,
    );
  }
  const reached = (
    await prepared.query(boundaries, COUNCILS_REACHED_SQL, [wkt])
  ).flatMap((row) => {
    const code = text(row.code);
    const name = text(row.name);
    return code && name ? [{ code, name }] : [];
  });
  const covered = manifest.landCoverageAreas.filter(({ council }) =>
    reached.some(({ code }) => code === council.code),
  );
  return {
    covered,
    notCovered: reached.filter(
      ({ code }) => !covered.some(({ council }) => council.code === code),
    ),
  };
};

/**
 * Compares two Land Opportunities in the order chosen, as the query orders
 * them, but by their areas to the square metre.
 */
const inOrder =
  (sort: LandSort) => (a: LandOpportunityFound, b: LandOpportunityFound) => {
    const byArea = b.areaHectares - a.areaHectares;
    const tied = byArea || a.id.localeCompare(b.id);
    switch (sort) {
      case "area":
        return tied;
      case "road-distance":
        return (
          (a.roadDistanceMetres ?? Infinity) -
            (b.roadDistanceMetres ?? Infinity) || tied
        );
      case "capacity":
        return b.estimatedHomes - a.estimatedHomes || tied;
    }
  };

/**
 * Finds the Land Opportunities in the Search Area, or in the whole of each
 * Land Coverage Area it reaches into, that meet the filters, in the order
 * chosen, and the industrial and commercial land use in the Search Area.
 * Each Land Coverage Area is asked on its own, and their answers are joined.
 * Its period is the date of the Land Parcels' OpenStreetMap data. Before
 * `pnpm data:prepare` has prepared the council boundaries and each Land
 * Coverage Area's Land Parcels, it is `not-prepared`.
 */
export const landOpportunities = (
  area: SearchArea,
  { scope, sort, filters }: LandQuery,
  callSource: CallSource,
  prepared: PreparedData,
): Promise<SourceResult<LandFound>> => {
  const { location, searchRadius } = area;
  return callSource<LandFound>(
    landParcels,
    JSON.stringify([location, searchRadius.metres, scope, sort, filters]),
    async () => {
      const manifest = await prepared.manifest();
      const { wkt, bounds } = searchAreaShape(area);
      const { covered, notCovered } = await councilsReached(
        manifest,
        prepared,
        wkt,
      );
      const areas = covered.map(({ council, datasets }) => ({
        council,
        parcels: landDataset(datasets, LAND_PARCELS_DATASET, council),
        landUse: landDataset(datasets, OSM_LAND_USE_DATASET, council),
      }));
      const landCoverageAreas = areas.map(({ council }) => council);
      if (areas.length === 0) {
        return {
          data: { landCoverageAreas, notCovered, found: null },
          period: null,
        };
      }

      const answers = await Promise.all(
        areas.map(async ({ council, parcels, landUse }) => {
          const [rows, uses] = await Promise.all([
            queryParcels(
              prepared,
              parcels,
              council,
              landOpportunitiesSql(sort),
              [
                wkt,
                scope === "land-coverage-area",
                ...bounds,
                filters.minAcres * SQUARE_METRES_PER_ACRE,
                filters.maxAcres === null
                  ? null
                  : filters.maxAcres * SQUARE_METRES_PER_ACRE,
                filters.maxRoadMetres,
                filters.maxFloodZone,
                filters.possiblyUnregisteredOnly,
                filters.excludeConstraints.join(","),
                filters.excludeListedBuildingOutlines,
                LAND_LIST_LIMIT,
                location.lng,
                location.lat,
                filters.ownershipCategories.join(","),
              ],
            ),
            prepared.query(landUse, LAND_USE_SQL, [wkt, ...bounds]),
          ]);
          return { council, rows, uses };
        }),
      );

      // Each answer is in the order chosen; several are merged into it.
      const listed = answers.flatMap(({ council, rows }) =>
        rows.flatMap((row): LandOpportunityFound[] =>
          row.parcel_id === null
            ? []
            : [
                {
                  ...readLandParcel(row, council),
                  distanceMetres: Math.round(
                    required(row.distance_m, "distance"),
                  ),
                },
              ],
        ),
      );
      const features =
        answers.length === 1
          ? listed
          : listed.sort(inOrder(sort)).slice(0, LAND_LIST_LIMIT);
      const summed = (column: string) =>
        answers.reduce(
          (total, { rows: [summary] }) =>
            total + (number(summary?.[column]) ?? 0),
          0,
        );
      const landUse = new Map<string, LandUseArea>();
      for (const { uses } of answers) {
        for (const row of uses) {
          const id = `${text(row.osm_type) ?? ""}-${text(row.osm_id) ?? String(number(row.osm_id))}`;
          const shape = text(row.shape);
          if (!isLandUseContextType(row.landuse) || !shape) continue;
          landUse.set(id, {
            id,
            landUse: row.landuse,
            name: text(row.name),
            shape: outlineOf(shape),
          });
        }
      }
      return {
        data: {
          landCoverageAreas,
          notCovered,
          found: {
            features,
            landUse: [...landUse.values()],
            statistics: {
              parcels: summed("parcels"),
              count: summed("count"),
              totalHectares: rounded(
                summed("total_m2") / SQUARE_METRES_PER_HECTARE,
                2,
              ),
              possiblyUnregistered: summed("possibly_unregistered_count"),
              ownershipCategories: answers.some(
                ({ rows: [summary] }) => summary?.categorised === true,
              )
                ? {
                    company: summed(categoryCount("company")),
                    "council-or-public-body": summed(
                      categoryCount("council-or-public-body"),
                    ),
                    "other-registered": summed(
                      categoryCount("other-registered"),
                    ),
                    "possibly-unregistered": summed(
                      categoryCount("possibly-unregistered"),
                    ),
                  }
                : null,
              estimatedHomes: summed("total_homes"),
              listed: features.length,
            },
          },
        },
        period: periodOf(areas.map(({ parcels }) => parcels.sourceDate)),
      };
    },
  );
};

/**
 * One Land Parcel, by its id, with the INSPIRE Index Polygons that overlap
 * it and those around it a company's or council's title is matched to, and
 * their outlines (PRD FR-5.4a, FR-5.6), or `null` if no Land Coverage Area
 * has it. Before `pnpm data:prepare` has prepared its Land Coverage Area,
 * it is `not-prepared`.
 */
export const landParcel = (
  parcelId: string,
  callSource: CallSource,
  prepared: PreparedData,
): Promise<SourceResult<LandParcelFound | null>> =>
  callSource<LandParcelFound | null>(landParcels, parcelId, async () => {
    const manifest = await prepared.manifest();
    const code = parcelId.slice(0, parcelId.lastIndexOf("-"));
    const area = manifest.landCoverageAreas.find(
      ({ council }) => council.code === code,
    );
    if (!area) return { data: null, period: null };
    const { council, datasets } = area;
    const parcels = landDataset(datasets, LAND_PARCELS_DATASET, council);
    const inspire = landDataset(
      datasets,
      INSPIRE_INDEX_POLYGONS_DATASET,
      council,
    );
    const [row] = await queryParcels(
      prepared,
      parcels,
      council,
      LAND_PARCEL_SQL,
      [parcelId],
    );
    if (!row) return { data: null, period: null };
    const parcel = readLandParcel(row, council);
    // Those that overlap it, the most first, then those around it, the nearest first.
    const around = new Map<string, Omit<InspirePolygon, "shape">>();
    for (const {
      inspireId,
      share,
      ownershipCategory,
    } of parcel.inspirePolygons) {
      around.set(inspireId, {
        inspireId,
        share,
        ownershipCategory,
        distanceMetres: 0,
      });
    }
    for (const title of parcel.matchedTitles) {
      const known = around.get(title.inspireId);
      around.set(title.inspireId, {
        inspireId: title.inspireId,
        share: known?.share ?? 0,
        // A council's title outweighs a company's, as data:prepare weighs them.
        ownershipCategory:
          known?.ownershipCategory === "council-or-public-body"
            ? known.ownershipCategory
            : title.ownershipCategory,
        distanceMetres: known?.distanceMetres ?? title.distanceMetres,
      });
    }
    const margin = LAND_PARCEL_RULES.titlesAroundMetres / 50_000;
    const polygons =
      around.size === 0
        ? []
        : await prepared.query(inspire, INSPIRE_POLYGONS_SQL, [
            [...around.keys()].join(","),
            required(row.xmin, "bounds") - margin,
            required(row.ymin, "bounds") - margin,
            required(row.xmax, "bounds") + margin,
            required(row.ymax, "bounds") + margin,
          ]);
    const outlines = new Map(
      polygons.flatMap((polygon) => {
        const id = text(polygon.inspire_id);
        const shape = text(polygon.shape);
        return id && shape ? [[id, outlineOf(shape)] as const] : [];
      }),
    );
    return {
      data: {
        parcel,
        inspirePolygons: [...around.values()].flatMap((polygon) => {
          const shape = outlines.get(polygon.inspireId);
          return shape ? [{ ...polygon, shape }] : [];
        }),
      },
      period: periodOf([parcels.sourceDate]),
    };
  });
