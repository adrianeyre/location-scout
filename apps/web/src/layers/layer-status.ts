import type { LayerResponse, ServedLayerId } from "@location-scout/shared";

import { formatCount } from "../format";
import type { LayerState } from "../useSearchArea";
import {
  LAYER_STYLES,
  PLANNING_APPLICATIONS_RATE_LIMITED,
} from "./layer-styles";

/**
 * Whether a Layer is the Land Layer in a Search Area that reaches into no
 * Land Coverage Area, though `pnpm data:prepare` has run (PRD FR-2.7).
 */
export const isLandOutsideCoverage = (layer: LayerResponse) =>
  layer.layer === "land" &&
  layer.status === "not-prepared" &&
  layer.landCoverageAreas.length === 0 &&
  layer.notCovered.length > 0;

const CONSTRAINTS = ["planning constraint", "planning constraints"] as const;

/**
 * What the Planning Layer's toggle says about its Planning Applications, on
 * a line of its own, while PlanIt's queue holds them (PRD FR-2.2) or if
 * they are unavailable, or `null` otherwise: once they have come, the
 * Overview counts them, and the Layers panel keeps its size over the map.
 */
export const applicationsStatusText = (state: LayerState) => {
  if (state.status === "loading" || state.layer !== "planning") return null;
  switch (state.applications?.status) {
    case "queued":
      return PLANNING_APPLICATIONS_RATE_LIMITED;
    case "unavailable":
      return "Planning applications unavailable";
    default:
      return null;
  }
};

/** What a Layer's toggle says about it (PRD FR-9.4). */
export const layerStatusText = (layer: ServedLayerId, state: LayerState) => {
  switch (state.status) {
    case "loading":
      return "Loading…";
    case "unavailable":
      return "Unavailable";
    case "not-prepared":
      return isLandOutsideCoverage(state)
        ? "Land data not prepared for this area"
        : "Not prepared";
    case "ok": {
      // Land Opportunities are counted, though only the first are listed.
      const count =
        state.layer === "land"
          ? (state.statistics?.count ?? 0)
          : state.features.length;
      return count === 0
        ? state.layer === "land" && state.scope === "land-coverage-area"
          ? "None in this Land Coverage Area"
          : "None in this Search Area"
        : formatCount(
            count,
            // The Planning Layer's Features here are its Planning
            // Constraints: its Planning Applications are counted apart.
            state.layer === "planning" ? CONSTRAINTS : LAYER_STYLES[layer].noun,
          );
    }
  }
};
