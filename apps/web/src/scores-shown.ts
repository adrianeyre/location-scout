import {
  locationScore,
  type CategoryScore,
  type LocationScore,
  type ScoresResponse,
  type ScoutMode,
} from "@location-scout/shared";

import { LAYER_STYLES } from "./layers/layer-styles";
import { allWeights, type CustomWeights } from "./weights";

/**
 * Why a category is left out: "the Crime Layer is unavailable", or, for
 * Development activity, "the Planning Layer's Planning Applications are
 * unavailable", as it goes by them rather than the Layer.
 */
export const whyLeftOut = ({
  id,
  layer,
  status,
}: Pick<CategoryScore, "id" | "layer" | "status">) => {
  if (status === "queued") {
    return `the ${LAYER_STYLES[layer].name} Layer's Planning Applications are waiting for their provider's turn`;
  }
  const what =
    id === "development-activity"
      ? `the ${LAYER_STYLES[layer].name} Layer's Planning Applications are`
      : `the ${LAYER_STYLES[layer].name} Layer is`;
  return `${what} ${status === "not-prepared" ? "not prepared" : "unavailable"}`;
};

/** The Location Score as it is shown, and what it is weighed by. */
export interface ShownLocationScore {
  location: LocationScore;
  modeName: string;
  /** Whether it is weighed by the user's own weights rather than the mode's. */
  custom: boolean;
}

/**
 * The Location Score as it is shown: weighed by the user's own weights for
 * the Scout Mode, if they chose some, or else as the backend weighed it
 * with the mode's defaults (PRD FR-4.4).
 */
export const weighed = (
  { mode, categories, location }: ScoresResponse,
  scoutMode: ScoutMode | null,
  weights: CustomWeights | null,
): ShownLocationScore => {
  const shownMode = scoutMode?.id === mode ? scoutMode : null;
  // The user's own weights weigh the Category Scores again, by the same rule
  // the backend weighs the mode's defaults by, so nothing loads again.
  const own = shownMode && weights;
  return {
    location: own ? locationScore(categories, allWeights(own)) : location,
    modeName: shownMode?.name ?? mode,
    custom: own !== null,
  };
};
