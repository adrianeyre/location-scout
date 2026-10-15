import {
  LAYER_IDS,
  type AreaResponse,
  type LayerId,
  type SearchArea,
  type SourceReport,
  type SourceStatus,
} from "@location-scout/shared";

import type { CallSource, DataSource, SourceResult } from "./data-source";
import {
  DEMOGRAPHICS_SOURCES,
  demographicsSourceResult,
  outputAreasIn,
} from "./demographics";
import { DEFAULT_LAND_QUERY, landOpportunities, landParcels } from "./land";
import { landRegistry, salesInLastTwelveMonths } from "./land-registry";
import { OSM_SELECTIONS, osmElements, overpass } from "./overpass";
import { planningConstraints, planningData } from "./planning-data";
import { latestCrimes, police } from "./police";
import { postcodesInSearchArea, postcodesIo } from "./postcodes-io";
import type { PreparedData } from "./prepared-data";
import type { RateLimiter } from "./rate-limiter";
import { SCHOOLS_SOURCES, schoolsNear, schoolsSourceResult } from "./schools";

/**
 * The rate limiters of the Data Sources that have a limit (PRD NFR-1.5). The
 * app shares each between every request it serves, so the limit holds however
 * many arrive at once.
 */
export interface SourceLimiters {
  police: RateLimiter;
  overpass: RateLimiter;
}

/** A Data Source that `/api/area` consults for every Search Area. */
export interface AreaSource {
  source: DataSource;
  /** The Layers it supplies. If it is not `ok`, only these are affected (PRD NFR-1.2). */
  layers: readonly LayerId[];
  /**
   * Fetches its part of the Search Area, making every call through
   * `callSource`, and waiting for its turn from its limiter, if it has one.
   * `userAgent` identifies us, with a way to contact us, to a source that
   * asks for it. `today`, an ISO 8601 date, ends a source's last 12 months.
   * `prepared` is what `pnpm data:prepare` made, for a source read from it.
   */
  load: (
    area: SearchArea,
    callSource: CallSource,
    limiters: SourceLimiters,
    userAgent: string,
    today: string,
    prepared: PreparedData,
  ) => Promise<SourceResult<unknown>>;
}

/** The sources behind `/api/area`. Each Layer adds its own as it is built. */
export const AREA_SOURCES: readonly AreaSource[] = [
  {
    source: police,
    layers: ["crime"],
    load: (area, callSource, limiters) =>
      latestCrimes(area, callSource, { limiter: limiters.police }),
  },
  {
    source: planningData,
    layers: ["planning"],
    load: (area, callSource, _limiters, _userAgent, today) =>
      planningConstraints(area, callSource, today),
  },
  // The Schools Layer's prepared datasets are read together, once, and each
  // reported with the date its own data dates from.
  ...SCHOOLS_SOURCES.map(({ source, dataset }): AreaSource => ({
    source,
    layers: ["schools"],
    load: async (area, callSource, _limiters, _userAgent, _today, prepared) =>
      schoolsSourceResult(
        await schoolsNear(area, callSource, prepared),
        dataset,
      ),
  })),
  {
    source: overpass,
    // One query serves every Layer from OpenStreetMap (PRD NFR-1.5).
    layers: OSM_SELECTIONS.map(({ layer }) => layer),
    load: (area, callSource, limiters, userAgent) =>
      osmElements(area, callSource, {
        limiter: limiters.overpass,
        userAgent,
      }),
  },
  {
    // Price Paid is searched by postcode, so the Property Layer needs both
    // (PRD FR-2.8). Loaded together, they ask postcodes.io once. Without the
    // postcodes, Price Paid can't be asked, so it is unavailable too.
    source: postcodesIo,
    layers: ["property"],
    load: (area, callSource) => postcodesInSearchArea(area, callSource),
  },
  {
    source: landRegistry,
    layers: ["property"],
    load: async (area, callSource, _limiters, _userAgent, today) => {
      const postcodes = await postcodesInSearchArea(area, callSource);
      return postcodes.status === "ok"
        ? salesInLastTwelveMonths(postcodes.data, callSource, today)
        : postcodes;
    },
  },
  {
    // The same query as the Land Layer's own, so it is read once. A Search
    // Area that reaches into no Land Coverage Area has no land data prepared.
    source: landParcels,
    layers: ["land"],
    load: async (area, callSource, _limiters, _userAgent, _today, prepared) => {
      const result = await landOpportunities(
        area,
        DEFAULT_LAND_QUERY,
        callSource,
        prepared,
      );
      return result.status === "ok" && result.data.found === null
        ? { status: "not-prepared" }
        : result;
    },
  },
  // The Demographics Layer's prepared datasets are read together, once, and
  // each reported with the date its own data dates from.
  ...DEMOGRAPHICS_SOURCES.map(({ source, dataset }): AreaSource => ({
    source,
    layers: ["demographics"],
    load: async (area, callSource, _limiters, _userAgent, _today, prepared) =>
      demographicsSourceResult(
        await outputAreasIn(area, callSource, prepared),
        dataset,
      ),
  })),
];

/**
 * When a Layer has several sources, the status that needs the most attention
 * wins. Missing prepared data won't fix itself, so it comes before a failed
 * call, which might.
 */
const STATUS_PRECEDENCE: readonly SourceStatus[] = [
  "not-prepared",
  "unavailable",
  "ok",
];

export const layerStatus = (sourceStatuses: readonly SourceStatus[]) =>
  STATUS_PRECEDENCE.find((status) => sourceStatuses.includes(status)) ?? "ok";

/** How a Data Source answered, as a response reports it (PRD NFR-1.3). */
export const sourceReport = (
  { id, name }: DataSource,
  result: SourceResult<unknown>,
): SourceReport => ({
  id,
  name,
  status: result.status,
  period: result.status === "ok" ? result.period : null,
});

/**
 * Consults every source at once and reports how each answered, plus the
 * status of each Layer they supply. A source that fails or times out is
 * reported as `unavailable`; it never fails the response.
 */
export const loadAreaSources = async (
  area: SearchArea,
  areaSources: readonly AreaSource[],
  callSource: CallSource,
  limiters: SourceLimiters,
  userAgent: string,
  today: string,
  prepared: PreparedData,
): Promise<Pick<AreaResponse, "sources" | "layers">> => {
  const answered = await Promise.all(
    areaSources.map(async (areaSource) => {
      let result: SourceResult<unknown>;
      try {
        result = await areaSource.load(
          area,
          callSource,
          limiters,
          userAgent,
          today,
          prepared,
        );
      } catch (error) {
        // Loads go through callSource, which never throws; this guards a
        // load that does its own work around it.
        console.error(`${areaSource.source.name} is unavailable`, error);
        result = { status: "unavailable" };
      }
      return { areaSource, report: sourceReport(areaSource.source, result) };
    }),
  );

  const layers = LAYER_IDS.flatMap((id) => {
    const statuses = answered
      .filter(({ areaSource }) => areaSource.layers.includes(id))
      .map(({ report }) => report.status);
    return statuses.length === 0 ? [] : [{ id, status: layerStatus(statuses) }];
  });

  return { sources: answered.map(({ report }) => report), layers };
};
