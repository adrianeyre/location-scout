import {
  isAmenityFeature,
  isCompetitor,
  type AmenityFeature,
  type ScoutMode,
} from "@location-scout/shared";

import type { LayerFeature } from "./layers/layer-styles";
import type { MapHighlight } from "./map/SearchAreaMap";

/** The Scout Mode's competitors among the amenities (PRD FR-4.3), nearest first. */
export const competitorsAmong = (
  features: readonly LayerFeature[],
  { competitors }: ScoutMode,
): AmenityFeature[] =>
  competitors
    ? features
        .filter(isAmenityFeature)
        .filter((feature) => isCompetitor(feature, competitors.tags))
        .sort((a, b) => a.distanceMetres - b.distanceMetres)
    : [];

/**
 * The Amenities Layer's Features, split into the Scout Mode's competitors,
 * which the map highlights (FR-4.3), and the rest. `null` for a mode with no
 * competitors, which highlights none.
 */
export const highlightCompetitors = (
  features: readonly LayerFeature[],
  scoutMode: ScoutMode,
): { rest: LayerFeature[]; highlighted: MapHighlight } | null => {
  if (!scoutMode.competitors) return null;
  const competitors = new Set<LayerFeature>(
    competitorsAmong(features, scoutMode),
  );
  return {
    rest: features.filter((feature) => !competitors.has(feature)),
    highlighted: {
      features: features.filter((feature) => competitors.has(feature)),
      noun: ["competitor", "competitors"],
      note: `★ Competitor in the ${scoutMode.name} Scout Mode`,
    },
  };
};
