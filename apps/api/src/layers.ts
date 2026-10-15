import type {
  AmenitiesLayerResponse,
  CrimeLayerResponse,
  DemographicsLayerResponse,
  GreenSpaceLayerResponse,
  LandLayerResponse,
  LayerResponse,
  PlanningApplications,
  PlanningLayerResponse,
  PropertyLayerResponse,
  SchoolsLayerResponse,
  SearchArea,
  ServedLayerId,
  TransportLayerResponse,
} from "@location-scout/shared";

import { sourceReport, type SourceLimiters } from "./sources/area-sources";
import type { CallSource, SourceResult } from "./sources/data-source";
import {
  demographicsSourceReports,
  demographicsStatistics,
  mapOutputAreas,
  outputAreasIn,
} from "./sources/demographics";
import {
  DEFAULT_LAND_QUERY,
  landOpportunities,
  landParcels,
  type LandFound,
  type LandQuery,
} from "./sources/land";
import {
  landSalesNear,
  listing,
  type LandSalesNear,
} from "./sources/land-sales";
import { landRegistry, pricePaidSales } from "./sources/land-registry";
import {
  certificatesIn,
  epcRegister,
  withEpcs,
  type EpcRegister,
} from "./sources/epc";
import { osmElements, overpass } from "./sources/overpass";
import { amenityStatistics, mapAmenities } from "./sources/overpass-amenities";
import { mapGreenSpace } from "./sources/overpass-green-space";
import { mapTransport } from "./sources/overpass-transport";
import { nearbyPlanningApplications } from "./sources/nearby-applications";
import {
  planningApplicationsIn,
  type PlanningApplicationsProvider,
} from "./sources/planning-applications";
import { planningConstraints, planningData } from "./sources/planning-data";
import { crimesWithTrend, police } from "./sources/police";
import { postcodesInSearchArea, postcodesIo } from "./sources/postcodes-io";
import type { PreparedData } from "./sources/prepared-data";
import {
  mapSchools,
  schoolsNear,
  schoolsSourceReports,
} from "./sources/schools";

/**
 * Loads one Layer's Features and statistics for a Search Area, consulting only
 * the Data Sources behind it, each through its limiter if it has one, and
 * identifying us with `userAgent` to those that ask. `today`, an ISO 8601
 * date, ends a Layer's last 12 months. `prepared` is what `pnpm
 * data:prepare` made, for a Layer read from it. `planningApplications` is
 * the provider Planning Applications come from (ADR 0003), and `epc` the
 * EPC API, or `null` without `EPC_API_KEY` (FR-2.6). It never throws:
 * a source that fails makes the Layer `unavailable` (PRD NFR-1.2), and one
 * not prepared makes it `not-prepared` (FR-6.6).
 */
export type LoadLayer = (
  area: SearchArea,
  callSource: CallSource,
  limiters: SourceLimiters,
  userAgent: string,
  today: string,
  prepared: PreparedData,
  planningApplications: PlanningApplicationsProvider,
  epc: EpcRegister | null,
) => Promise<LayerResponse>;

/**
 * The Crime Layer: the latest month's street-level crimes, and the trend over
 * the last 24 months (PRD FR-2.1).
 */
export const loadCrimeLayer = async (
  area: SearchArea,
  callSource: CallSource,
  limiters: SourceLimiters,
): Promise<CrimeLayerResponse> => {
  const crimes = await crimesWithTrend(area, callSource, {
    limiter: limiters.police,
  });
  const ok = crimes.status === "ok";
  return {
    layer: "crime",
    status: crimes.status,
    sources: [sourceReport(police, crimes)],
    features: ok ? crimes.data.features : [],
    statistics: ok ? crimes.data.statistics : null,
  };
};

/**
 * The Planning Layer's Planning Constraints alone: those that intersect the
 * Search Area, from planning.data.gov.uk (PRD FR-2.2), with its Planning
 * Applications not looked for, as the scores need only the constraints.
 */
export const loadPlanningConstraints = async (
  area: SearchArea,
  callSource: CallSource,
  today: string,
): Promise<PlanningLayerResponse> => {
  const constraints = await planningConstraints(area, callSource, today);
  const ok = constraints.status === "ok";
  return {
    layer: "planning",
    status: constraints.status,
    sources: [sourceReport(planningData, constraints)],
    features: ok ? constraints.data.features : [],
    statistics: ok ? constraints.data.statistics : null,
    applications: null,
  };
};

/**
 * The Planning Layer: the Planning Constraints that intersect the Search Area,
 * from planning.data.gov.uk, and the Planning Applications received in it in
 * the last 3 years up to `today`, from `planningApplications` (PRD FR-2.2).
 * Each part stands on its own: if one source fails, the other is still
 * shown. While the request for the applications waits for the provider's
 * turn, they are `queued`, and the constraints don't wait for them.
 */
export const loadPlanningLayer = async (
  area: SearchArea,
  callSource: CallSource,
  _limiters: SourceLimiters,
  _userAgent: string,
  today: string,
  _prepared: PreparedData,
  planningApplications: PlanningApplicationsProvider,
): Promise<PlanningLayerResponse> => {
  const [constraints, { applications, report }] = await Promise.all([
    loadPlanningConstraints(area, callSource, today),
    planningApplicationsIn(area, today, callSource, planningApplications),
  ]);
  return {
    ...constraints,
    sources: [...constraints.sources, ...(report ? [report] : [])],
    applications,
  };
};

/**
 * The Amenities Layer: the amenities OpenStreetMap maps in the Search Area,
 * with their count and the nearest of each type (PRD FR-2.3). They come from
 * the one Overpass query every Layer from OpenStreetMap shares.
 */
export const loadAmenitiesLayer = async (
  area: SearchArea,
  callSource: CallSource,
  limiters: SourceLimiters,
  userAgent: string,
): Promise<AmenitiesLayerResponse> => {
  const osm = await osmElements(area, callSource, {
    limiter: limiters.overpass,
    userAgent,
  });
  const sources = [sourceReport(overpass, osm)];
  if (osm.status !== "ok") {
    return {
      layer: "amenities",
      status: osm.status,
      sources,
      features: [],
      statistics: null,
    };
  }
  const features = mapAmenities(osm.data.elements, area.location);
  return {
    layer: "amenities",
    status: "ok",
    sources,
    features,
    statistics: amenityStatistics(features),
  };
};

/**
 * The Schools Layer: the schools open in the Search Area by phase, with their
 * latest Ofsted judgement, their counts, and the nearest primary and
 * secondary school, which may be outside it (PRD FR-2.3a), from the GIAS
 * register and Ofsted's inspections that `pnpm data:prepare` prepared
 * (FR-6.0). Before it has run, the Layer is `not-prepared` (FR-6.6).
 */
export const loadSchoolsLayer = async (
  area: SearchArea,
  callSource: CallSource,
  _limiters: SourceLimiters,
  _userAgent: string,
  _today: string,
  prepared: PreparedData,
): Promise<SchoolsLayerResponse> => {
  const found = await schoolsNear(area, callSource, prepared);
  const sources = schoolsSourceReports(found);
  if (found.status !== "ok") {
    return {
      layer: "schools",
      status: found.status,
      sources,
      features: [],
      statistics: null,
    };
  }
  return {
    layer: "schools",
    status: "ok",
    sources,
    ...mapSchools(found.data.rows, area),
  };
};

/**
 * The Transport Layer: the railway stations, bus stops, car parks, EV
 * chargers, footpaths and cycle routes OpenStreetMap maps in the Search Area,
 * with their counts, the nearest railway station and the length of footpath
 * and cycle route (PRD FR-2.4). They come from the same one Overpass query as
 * the Amenities Layer, so loading both makes one request (NFR-1.5).
 */
export const loadTransportLayer = async (
  area: SearchArea,
  callSource: CallSource,
  limiters: SourceLimiters,
  userAgent: string,
): Promise<TransportLayerResponse> => {
  const osm = await osmElements(area, callSource, {
    limiter: limiters.overpass,
    userAgent,
  });
  const sources = [sourceReport(overpass, osm)];
  if (osm.status !== "ok") {
    return {
      layer: "transport",
      status: osm.status,
      sources,
      features: [],
      statistics: null,
    };
  }
  return {
    layer: "transport",
    status: "ok",
    sources,
    ...mapTransport(osm.data.elements, area),
  };
};

/**
 * The Green space Layer: the parks, playgrounds, nature reserves and woods
 * OpenStreetMap maps in the Search Area, with their outlines, their count and
 * the distance to the nearest park (PRD FR-2.5). They come from the same one
 * Overpass query as the Amenities and Transport Layers (NFR-1.5).
 */
export const loadGreenSpaceLayer = async (
  area: SearchArea,
  callSource: CallSource,
  limiters: SourceLimiters,
  userAgent: string,
): Promise<GreenSpaceLayerResponse> => {
  const osm = await osmElements(area, callSource, {
    limiter: limiters.overpass,
    userAgent,
  });
  const sources = [sourceReport(overpass, osm)];
  if (osm.status !== "ok") {
    return {
      layer: "green-space",
      status: osm.status,
      sources,
      features: [],
      statistics: null,
    };
  }
  return {
    layer: "green-space",
    status: "ok",
    sources,
    ...mapGreenSpace(osm.data.elements, area),
  };
};

/**
 * The Property Layer: the sales in the Search Area in the last 12 months up to
 * `today`, from HM Land Registry's Price Paid Data, with their count, median
 * and mean price (PRD FR-2.6). Price Paid is searched by postcode, so the
 * postcodes in the Search Area come from postcodes.io first (FR-2.8). If
 * postcodes.io fails, Price Paid is not asked. With `epc`, the EPC API is
 * asked for the certificates in the same postcodes while Price Paid is, and
 * each sale is matched to one, for the homes' bands and the sales' price per
 * m². If the EPC API fails, only the EPCs are missing.
 */
export const loadPropertyLayer = async (
  area: SearchArea,
  callSource: CallSource,
  _limiters: SourceLimiters,
  _userAgent: string,
  today: string,
  _prepared?: PreparedData,
  _planningApplications?: PlanningApplicationsProvider,
  epc: EpcRegister | null = null,
): Promise<PropertyLayerResponse> => {
  const postcodes = await postcodesInSearchArea(area, callSource);
  if (postcodes.status !== "ok") {
    return {
      layer: "property",
      status: postcodes.status,
      sources: [sourceReport(postcodesIo, postcodes)],
      features: [],
      statistics: null,
      epc: null,
    };
  }
  const [sales, certificates] = await Promise.all([
    pricePaidSales(postcodes.data, callSource, today),
    epc === null ? null : certificatesIn(postcodes.data, epc, callSource),
  ]);
  const sources = [
    sourceReport(postcodesIo, postcodes),
    sourceReport(landRegistry, sales),
  ];
  if (sales.status !== "ok") {
    return {
      layer: "property",
      status: sales.status,
      sources,
      features: [],
      statistics: null,
      epc: null,
    };
  }
  if (epc === null || certificates === null) {
    return {
      layer: "property",
      status: "ok",
      sources,
      features: sales.data.features,
      statistics: sales.data.statistics,
      epc: null,
    };
  }
  const withEpc = await withEpcs(
    sales.data.features,
    sales.data.sales,
    certificates,
    epc,
    callSource,
  );
  return {
    layer: "property",
    status: "ok",
    sources: [
      ...sources,
      sourceReport(
        epcRegister,
        withEpc.epc.status === "ok"
          ? { status: "ok", data: null, period: null }
          : { status: "unavailable" },
      ),
    ],
    features: withEpc.features,
    statistics: sales.data.statistics,
    epc: withEpc.epc,
  };
};

/**
 * The land sales near the Land Opportunities found in the Search Area (PRD
 * FR-5.4b), in the last 5 years up to `today`, or `null` if none were found,
 * or they were looked for across a whole Land Coverage Area, where there
 * are too many to look near each.
 */
export const landSalesFor = async (
  result: SourceResult<LandFound>,
  { scope }: LandQuery,
  today: string,
  callSource: CallSource,
  prepared: PreparedData,
): Promise<LandSalesNear | null> =>
  result.status === "ok" && result.data.found && scope === "search-area"
    ? landSalesNear(result.data.found.features, today, callSource, prepared)
    : null;

/**
 * The Planning Applications in the Search Area, for the nearby development
 * activity of the Land Opportunities found in it (PRD FR-5.4), or `null` if
 * none were found, they were looked for across a whole Land Coverage Area,
 * beyond the Search Area whose applications are known, or with no
 * `planningApplications` to ask, as for the Highlights. The request is
 * the Planning Layer's own, so it is answered with it, or from the cache.
 */
export const applicationsFor = async (
  result: SourceResult<LandFound>,
  { scope }: LandQuery,
  area: SearchArea,
  today: string,
  callSource: CallSource,
  planningApplications: PlanningApplicationsProvider | null,
): Promise<PlanningApplications | null> =>
  planningApplications &&
  result.status === "ok" &&
  result.data.found &&
  result.data.found.features.length > 0 &&
  scope === "search-area"
    ? (
        await planningApplicationsIn(
          area,
          today,
          callSource,
          planningApplications,
        )
      ).applications
    : null;

/**
 * The Land Layer's response to `query`, from the Land Opportunities found,
 * and the land sales and Planning Applications near them, if they were
 * looked for, the newest land sales listed. A Search Area that reaches into
 * no Land Coverage Area is `not-prepared`: land data not prepared for this
 * area (PRD FR-2.7).
 */
export const landLayerResponse = (
  result: SourceResult<LandFound>,
  { scope, sort, filters }: LandQuery,
  sales: LandSalesNear | null = null,
  applications: PlanningApplications | null = null,
): LandLayerResponse => {
  const answered = result.status === "ok" ? result.data : null;
  const found = answered?.found ?? null;
  const status = answered && !found ? "not-prepared" : result.status;
  const salesNear = (id: string) => {
    const near = sales?.byParcel.get(id);
    return near ? listing(near) : null;
  };
  return {
    layer: "land",
    status,
    sources: [
      {
        id: landParcels.id,
        name: landParcels.name,
        status,
        period: result.status === "ok" && found ? result.period : null,
      },
      ...(sales?.sources ?? []),
    ],
    scope,
    sort,
    filters,
    landCoverageAreas: answered?.landCoverageAreas ?? [],
    notCovered: answered?.notCovered ?? [],
    features:
      found?.features.map((feature) => ({
        ...feature,
        nearbyLandSales: salesNear(feature.id),
        nearbyPlanningApplications:
          applications &&
          nearbyPlanningApplications(feature.shape, applications),
      })) ?? [],
    landUse: found?.landUse ?? [],
    statistics: found
      ? {
          ...found.statistics,
          nearbyLandSales: sales ? listing(sales.all) : null,
        }
      : null,
  };
};

/**
 * The Land Layer: the Land Opportunities in the Search Area that meet FR-5.3's
 * default filters, the largest first, with industrial and commercial land use
 * as context (PRD FR-2.7), from the Land Parcels `pnpm data:prepare` built
 * for each Land Coverage Area (FR-6.2), each with the land sales within 1
 * mile of it in the last 5 years up to `today`, from Price Paid (FR-5.4b),
 * and the Planning Applications within 500 m of it, among the Search
 * Area's, from `planningApplications` (FR-5.4).
 * `GET /api/land` finds them with other filters, or across the whole Land
 * Coverage Area (FR-5.1).
 */
export const loadLandLayer = async (
  area: SearchArea,
  callSource: CallSource,
  _limiters: SourceLimiters,
  _userAgent: string,
  today: string,
  prepared: PreparedData,
  planningApplications: PlanningApplicationsProvider | null,
): Promise<LandLayerResponse> => {
  const found = await landOpportunities(
    area,
    DEFAULT_LAND_QUERY,
    callSource,
    prepared,
  );
  const [sales, applications] = await Promise.all([
    landSalesFor(found, DEFAULT_LAND_QUERY, today, callSource, prepared),
    applicationsFor(
      found,
      DEFAULT_LAND_QUERY,
      area,
      today,
      callSource,
      planningApplications,
    ),
  ]);
  return landLayerResponse(found, DEFAULT_LAND_QUERY, sales, applications);
};

/**
 * The Demographics Layer: the output areas that reach into the Search Area,
 * with the Search Area's estimated population, households, age profile,
 * household income and deprivation (PRD FR-2.7a), from the England-wide files
 * `pnpm data:prepare` prepared (FR-6.0). Before it has run, the Layer is
 * `not-prepared` (FR-6.6).
 */
export const loadDemographicsLayer = async (
  area: SearchArea,
  callSource: CallSource,
  _limiters: SourceLimiters,
  _userAgent: string,
  _today: string,
  prepared: PreparedData,
): Promise<DemographicsLayerResponse> => {
  const found = await outputAreasIn(area, callSource, prepared);
  const ok = found.status === "ok";
  return {
    layer: "demographics",
    status: found.status,
    sources: demographicsSourceReports(found),
    features: ok ? mapOutputAreas(found.data.rows, area) : [],
    statistics: ok
      ? demographicsStatistics(found.data.rows, found.data.englandMedianIncome)
      : null,
  };
};

/** How each served Layer is loaded for `GET /api/area/{layer}`. */
export const LAYER_LOADERS: Readonly<Record<ServedLayerId, LoadLayer>> = {
  crime: loadCrimeLayer,
  planning: loadPlanningLayer,
  amenities: loadAmenitiesLayer,
  schools: loadSchoolsLayer,
  transport: loadTransportLayer,
  "green-space": loadGreenSpaceLayer,
  property: loadPropertyLayer,
  land: loadLandLayer,
  demographics: loadDemographicsLayer,
};
