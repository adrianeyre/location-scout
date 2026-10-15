import {
  CATEGORY_LAYERS,
  locationScore,
  weighedCategories,
  type AmenitiesLayerResponse,
  type CategoryId,
  type CategoryScore,
  type CategoryStatus,
  type CrimeLayerResponse,
  type DemographicsLayerResponse,
  type GreenSpaceLayerResponse,
  type LandLayerResponse,
  type PlanningLayerResponse,
  type PropertyLayerResponse,
  type SchoolsLayerResponse,
  type ScoresResponse,
  type SearchArea,
  type ServedLayerId,
  type TransportLayerResponse,
} from "@location-scout/shared";

import {
  loadAmenitiesLayer,
  loadCrimeLayer,
  loadDemographicsLayer,
  loadGreenSpaceLayer,
  loadLandLayer,
  loadPlanningConstraints,
  loadPlanningLayer,
  loadPropertyLayer,
  loadSchoolsLayer,
  loadTransportLayer,
} from "../layers";
import type { SourceLimiters } from "../sources/area-sources";
import type { CallSource } from "../sources/data-source";
import type { PlanningApplicationsProvider } from "../sources/planning-applications";
import type { PreparedData } from "../sources/prepared-data";
import {
  scoreAmenities,
  scoreCompetition,
  scoreDemand,
  scoreDevelopmentActivity,
  scoreFootfall,
  scoreGreenSpace,
  scorePlanningFreedom,
  scorePropertyActivity,
  scoreSafety,
  scoreSchools,
  scoreTransport,
  type Scored,
} from "./category-scores";
import {
  SCORING_CONFIG,
  type ScoringConfig,
  type ScoutModeConfig,
} from "./config";

/** The Layers the Category Scores and Highlights are calculated from: every served Layer. */
export interface ScoredLayers extends Record<ServedLayerId, unknown> {
  crime: CrimeLayerResponse;
  planning: PlanningLayerResponse;
  amenities: AmenitiesLayerResponse;
  schools: SchoolsLayerResponse;
  transport: TransportLayerResponse;
  "green-space": GreenSpaceLayerResponse;
  property: PropertyLayerResponse;
  land: LandLayerResponse;
  demographics: DemographicsLayerResponse;
}

/**
 * The Search Area's residents, as the Demographics Layer estimates them, for
 * Safety, Competition and the crime Highlights to count per 1,000 of. `null`
 * if the Layer is not `ok` or estimates none, when they count per km².
 */
export const residentsOf = ({
  statistics,
}: DemographicsLayerResponse): number | null =>
  statistics && statistics.population > 0 ? statistics.population : null;

/**
 * The Planning Applications' statistics, for Development activity and
 * Demand, or `null` unless they are `ok`.
 */
const applicationStatistics = ({ applications }: PlanningLayerResponse) =>
  applications?.status === "ok" ? applications.statistics : null;

/**
 * One category's score in a Scout Mode, or `null` if a Layer it needs has no
 * statistics.
 */
const scoreOf = (
  id: CategoryId,
  layers: ScoredLayers,
  area: SearchArea,
  mode: ScoutModeConfig,
  config: ScoringConfig,
): Scored | null => {
  switch (id) {
    case "safety": {
      const { statistics } = layers.crime;
      return (
        statistics &&
        scoreSafety(statistics, area, residentsOf(layers.demographics), config)
      );
    }
    case "amenities": {
      const { statistics } = layers.amenities;
      return statistics && scoreAmenities(statistics, config);
    }
    case "schools": {
      const { statistics } = layers.schools;
      return statistics && scoreSchools(statistics, config);
    }
    case "transport": {
      const { statistics } = layers.transport;
      return statistics && scoreTransport(statistics, config);
    }
    case "green-space": {
      const { statistics } = layers["green-space"];
      return statistics && scoreGreenSpace(statistics, config);
    }
    case "property-activity": {
      const { statistics } = layers.property;
      return statistics && scorePropertyActivity(statistics, config);
    }
    case "development-activity": {
      const { applications } = layers.planning;
      const statistics = applicationStatistics(layers.planning);
      return applications && statistics
        ? scoreDevelopmentActivity(
            { provider: applications.provider, statistics },
            config,
          )
        : null;
    }
    case "planning-freedom": {
      const { status, features } = layers.planning;
      return status === "ok" ? scorePlanningFreedom(features, config) : null;
    }
    case "competition": {
      const { status, features } = layers.amenities;
      return status === "ok" && mode.competitors
        ? scoreCompetition(
            features,
            mode.competitors,
            area,
            residentsOf(layers.demographics),
            config,
            mode.competitionPerThousand,
          )
        : null;
    }
    case "demand": {
      const { statistics } = layers.demographics;
      return (
        statistics &&
        scoreDemand(statistics, applicationStatistics(layers.planning), config)
      );
    }
    case "footfall": {
      const amenities = layers.amenities.statistics;
      const transport = layers.transport.statistics;
      return amenities && transport
        ? scoreFootfall(amenities, transport, config)
        : null;
    }
  }
};

/**
 * The Layer whose status a category has: the first of its Layers that is not
 * `ok`, or else the first.
 */
const statusLayer = (id: CategoryId, layers: ScoredLayers): ServedLayerId => {
  const needed = CATEGORY_LAYERS[id];
  return needed.find((layer) => layers[layer].status !== "ok") ?? needed[0];
};

/**
 * The Layer a category takes its status from, and that status. Development
 * activity takes the Planning Applications', not the Planning Layer's,
 * which is the Planning Constraints'. Demand waits for them while they are
 * queued for their provider's turn, as they bring its planned housing.
 */
const categoryStatus = (
  id: CategoryId,
  layers: ScoredLayers,
): { layer: ServedLayerId; status: CategoryStatus } => {
  const { applications } = layers.planning;
  if (id === "development-activity") {
    return { layer: "planning", status: applications?.status ?? "unavailable" };
  }
  const layer = statusLayer(id, layers);
  const { status } = layers[layer];
  if (id === "demand" && status === "ok" && applications?.status === "queued") {
    return { layer: "planning", status: "queued" };
  }
  return { layer, status };
};

/**
 * The Category Scores a Scout Mode weighs and the Location Score for a Search
 * Area, from its Layers (PRD §6.4), weighed by the mode (FR-4.2), with
 * Competition counting its competitors (FR-4.3). Safety and Competition
 * count per 1,000 of the Search Area's residents if the Demographics Layer
 * estimates them, or else per km². Development activity and Demand count
 * the Planning Applications, if they were looked for. A pure function: the
 * same Layers and mode always give the same scores (FR-3.6). A category a
 * Layer it needs is not `ok` for has no score and is left out of the
 * Location Score, which says so (FR-3.4). While the Planning Applications
 * are queued, so are the categories that need them.
 */
export const scoreSearchArea = (
  layers: ScoredLayers,
  area: SearchArea,
  mode: ScoutModeConfig,
  config: ScoringConfig = SCORING_CONFIG,
): ScoresResponse => {
  const categories = weighedCategories(mode).map((id): CategoryScore => {
    const { layer, status } = categoryStatus(id, layers);
    const scored =
      status === "ok" ? scoreOf(id, layers, area, mode, config) : null;
    return scored
      ? { id, layer, status, ...scored }
      : {
          id,
          layer,
          // A Layer that is `ok` always has statistics.
          status: status === "ok" ? "unavailable" : status,
          score: null,
          breakdown: [],
        };
  });
  return {
    mode: mode.id,
    categories,
    location: locationScore(categories, mode.weights),
  };
};

/**
 * Loads every Layer the scores and Highlights read. The Layers' Data Source
 * calls are shared with `/api/area/{layer}` requests for the same Search
 * Area, and answered from the cache after, so scoring calls no source a
 * second time. The Planning Layer's Planning Applications are looked for
 * with `planningApplications`, as the scores need them, or not at all with
 * `null`, as the Highlights don't. Asked for while the Planning Layer's own
 * request for them is being sent, they wait for its answer, and while it
 * waits its turn, they are `queued`, sending the provider nothing more.
 */
export const loadScoredLayers = async (
  area: SearchArea,
  callSource: CallSource,
  limiters: SourceLimiters,
  userAgent: string,
  today: string,
  prepared: PreparedData,
  planningApplications: PlanningApplicationsProvider | null,
): Promise<ScoredLayers> => {
  const [
    crime,
    planning,
    amenities,
    schools,
    transport,
    greenSpace,
    property,
    land,
    demographics,
  ] = await Promise.all([
    loadCrimeLayer(area, callSource, limiters),
    planningApplications
      ? loadPlanningLayer(
          area,
          callSource,
          limiters,
          userAgent,
          today,
          prepared,
          planningApplications,
        )
      : loadPlanningConstraints(area, callSource, today),
    loadAmenitiesLayer(area, callSource, limiters, userAgent),
    loadSchoolsLayer(area, callSource, limiters, userAgent, today, prepared),
    loadTransportLayer(area, callSource, limiters, userAgent),
    loadGreenSpaceLayer(area, callSource, limiters, userAgent),
    loadPropertyLayer(area, callSource, limiters, userAgent, today),
    loadLandLayer(
      area,
      callSource,
      limiters,
      userAgent,
      today,
      prepared,
      planningApplications,
    ),
    loadDemographicsLayer(
      area,
      callSource,
      limiters,
      userAgent,
      today,
      prepared,
    ),
  ]);
  return {
    crime,
    planning,
    amenities,
    schools,
    transport,
    "green-space": greenSpace,
    property,
    land,
    demographics,
  };
};

/**
 * Loads every Layer the scores need, with the Planning Applications from
 * `planningApplications`, then scores the Search Area in a Scout Mode.
 */
export const loadScores = async (
  area: SearchArea,
  mode: ScoutModeConfig,
  callSource: CallSource,
  limiters: SourceLimiters,
  userAgent: string,
  today: string,
  prepared: PreparedData,
  planningApplications: PlanningApplicationsProvider,
  config: ScoringConfig = SCORING_CONFIG,
): Promise<ScoresResponse> =>
  scoreSearchArea(
    await loadScoredLayers(
      area,
      callSource,
      limiters,
      userAgent,
      today,
      prepared,
      planningApplications,
    ),
    area,
    mode,
    config,
  );
