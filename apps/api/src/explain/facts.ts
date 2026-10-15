import {
  CATEGORY_LAYERS,
  CATEGORY_NAMES,
  LAND_OPPORTUNITY_WORDING,
  LAND_SALE_LABEL,
  LAND_SALES_NOTE,
  OWNERSHIP_CATEGORY_NOTE,
  SERVED_LAYER_IDS,
  type CategoryId,
  type CategoryScore,
  type HighlightsResponse,
  type LandParcelResponse,
  type LayerResponse,
  type LocalGeography,
  type LocationScore,
  type NearbyPlanningApplications,
  type ScoresResponse,
  type SearchArea,
  type ServedLayerId,
} from "@location-scout/shared";

import type { ScoutModeConfig } from "../scoring/config";
import type { ScoredLayers } from "../scoring/scores";

/*
 * The figures an AI Explanation is written from (PRD FR-11.2): the
 * structured response the user is already shown for its subject, its
 * statistics, scores, breakdowns, Highlights and tags, in the Scout Mode
 * chosen, and nothing else (ADR 0005). Where things are on the map, their
 * outlines and ids are left out: they are drawn, not figures to explain, and
 * every coordinate would be a number the model might repeat.
 */

/** The figures, as JSON: what the model is sent. */
export type ExplainFacts = Readonly<Record<string, unknown>>;

/** Keys whose values are where a thing is on the map, not a figure. */
const PLACING_KEYS = new Set(["id", "location", "shape", "line", "members"]);

/** `value` without the keys that place things on the map, at any depth. */
const figuresOf = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(figuresOf);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, inner]) =>
      PLACING_KEYS.has(key) ? [] : [[key, figuresOf(inner)]],
    ),
  );
};

/** The Search Area, as the Overview names it. */
const searchAreaFacts = (area: SearchArea, geography: LocalGeography) => ({
  location: { latitude: area.location.lat, longitude: area.location.lng },
  searchRadiusMiles: area.searchRadius.miles,
  localGeography: geography,
});

const scoutModeFacts = (mode: ScoutModeConfig) => ({
  name: mode.name,
  question: mode.question,
});

/** One Layer's statistics, or its status if it has none to give. */
const layerFacts = (response: LayerResponse) => ({
  layer: response.layer,
  status: response.status,
  statistics: figuresOf(response.statistics),
  ...(response.layer === "planning" && response.applications
    ? {
        planningApplications: {
          status: response.applications.status,
          provider: response.applications.provider.name,
          period: response.applications.period,
          statistics: figuresOf(response.applications.statistics),
        },
      }
    : {}),
});

/** A Category Score with its breakdown, or why it is left out. */
const categoryScoreFacts = (category: CategoryScore) => ({
  category: CATEGORY_NAMES[category.id],
  status: category.status,
  score: category.score,
  outOf: 100,
  breakdown: category.breakdown,
});

/** The Location Score, how each category is weighed in it, and what is left out. */
const locationScoreFacts = (
  location: LocationScore,
  mode: ScoutModeConfig,
  ownWeights: boolean,
) => ({
  score: location.score,
  outOf: 100,
  weighedBy: ownWeights
    ? `the user's own weights for the ${mode.name} Scout Mode`
    : `the ${mode.name} Scout Mode's weights`,
  counted: location.counted.map(({ id, score, weight, share, points }) => ({
    category: CATEGORY_NAMES[id],
    score,
    weight,
    sharePercent: share,
    points,
  })),
  leftOut: location.leftOut.map(({ id, status }) => ({
    category: CATEGORY_NAMES[id],
    status,
  })),
});

/** What the Overview and Category Scores are explained from. */
export interface JudgedSearchArea {
  area: SearchArea;
  geography: LocalGeography;
  mode: ScoutModeConfig;
  layers: ScoredLayers;
  scores: ScoresResponse;
  /** The Location Score shown, weighed by the user's own weights if they chose some. */
  location: LocationScore;
  ownWeights: boolean;
  highlights: HighlightsResponse;
}

/** The Location Overview (PRD FR-11.1): Highlights, scores and every Layer's statistics. */
export const overviewFacts = ({
  area,
  geography,
  mode,
  layers,
  scores,
  location,
  ownWeights,
  highlights,
}: JudgedSearchArea): ExplainFacts => ({
  about: "The Location Overview of a Search Area",
  searchArea: searchAreaFacts(area, geography),
  scoutMode: scoutModeFacts(mode),
  highlights: highlights.highlights.map(({ level, text, layer }) => ({
    level,
    text,
    layer,
  })),
  highlightsLeftOut: highlights.leftOut,
  locationScore: locationScoreFacts(location, mode, ownWeights),
  categoryScores: scores.categories.map(categoryScoreFacts),
  layers: SERVED_LAYER_IDS.map((id) => layerFacts(layers[id])),
});

/**
 * One Category Score (PRD FR-11.1): its breakdown, its part in the Location
 * Score, and the statistics of the Layers it is calculated from.
 */
export const categoryFacts = (
  judged: JudgedSearchArea,
  id: CategoryId,
): ExplainFacts | null => {
  const category = judged.scores.categories.find((scored) => scored.id === id);
  if (!category) return null;
  const { area, geography, mode, layers, location, ownWeights } = judged;
  const read: readonly ServedLayerId[] = CATEGORY_LAYERS[id];
  return {
    about: `The ${CATEGORY_NAMES[id]} Category Score of a Search Area`,
    searchArea: searchAreaFacts(area, geography),
    scoutMode: scoutModeFacts(mode),
    categoryScore: categoryScoreFacts(category),
    locationScore: locationScoreFacts(location, mode, ownWeights),
    layers: read.map((layer) => layerFacts(layers[layer])),
  };
};

/**
 * Whether the Overview's figures include any Land Opportunity, so that the
 * model must repeat their wording (PRD FR-5.7).
 */
export const hasLandOpportunities = ({ layers }: JudgedSearchArea) =>
  (layers.land.statistics?.count ?? 0) > 0;

/**
 * One Land Opportunity (PRD FR-11.1): its tags, its indicative Ownership
 * Category and the titles matched around it, the INSPIRE Index Polygons
 * that overlap it, the land sales within 1 mile of it and its nearby
 * development activity, as the Land panel shows them, with the wording
 * every Land view carries (FR-5.7).
 */
export const landOpportunityFacts = (
  area: SearchArea,
  geography: LocalGeography,
  mode: ScoutModeConfig,
  {
    parcel,
    inspirePolygons,
    nearbyLandSales,
  }: Omit<LandParcelResponse, "sources">,
  nearbyApplications: NearbyPlanningApplications | null,
): ExplainFacts => ({
  about: "One Land Opportunity",
  wording: LAND_OPPORTUNITY_WORDING,
  searchArea: searchAreaFacts(area, geography),
  scoutMode: scoutModeFacts(mode),
  landOpportunity: {
    name: parcel.name,
    council: parcel.council.name,
    landUse: parcel.landUse,
    areaHectares: parcel.areaHectares,
    areaAcres: parcel.areaAcres,
    roadDistanceMetres: parcel.roadDistanceMetres,
    inspireCoverage: parcel.inspireCoverage,
    possiblyUnregistered: parcel.possiblyUnregistered,
    ownershipCategory: parcel.ownershipCategory,
    ownershipCategoryNote: OWNERSHIP_CATEGORY_NOTE,
    matchedTitles: figuresOf(parcel.matchedTitles),
    planningConstraints: figuresOf(parcel.constraints),
    floodZone: parcel.floodZone,
    onListedBuildingOutline: parcel.onListedBuildingOutline,
    estimatedHomes: parcel.estimatedHomes,
    inspireIndexPolygonsOverlapping: inspirePolygons.filter(
      ({ distanceMetres }) => distanceMetres === 0,
    ).length,
  },
  nearbyLandSales: {
    label: LAND_SALE_LABEL,
    note: LAND_SALES_NOTE,
    ...(figuresOf(nearbyLandSales) as object),
  },
  nearbyPlanningApplications: figuresOf(nearbyApplications),
});
