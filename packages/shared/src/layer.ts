import {
  isAmenitiesLayerResponse,
  type AmenitiesLayerResponse,
} from "./amenities";
import { isCrimeLayerResponse, type CrimeLayerResponse } from "./crime";
import {
  isDemographicsLayerResponse,
  type DemographicsLayerResponse,
} from "./demographics";
import {
  isGreenSpaceLayerResponse,
  type GreenSpaceLayerResponse,
} from "./green-space";
import { isLandLayerResponse, type LandLayerResponse } from "./land";
import {
  isPlanningLayerResponse,
  type PlanningLayerResponse,
} from "./planning";
import {
  isPropertyLayerResponse,
  type PropertyLayerResponse,
} from "./property";
import { isSchoolsLayerResponse, type SchoolsLayerResponse } from "./schools";
import type { LayerId } from "./source-status";
import {
  isTransportLayerResponse,
  type TransportLayerResponse,
} from "./transport";

/**
 * The Layers whose Features and statistics the backend serves so far, each at
 * `GET /api/area/{layer}`. Each Layer joins the list as it is built.
 */
export const SERVED_LAYER_IDS = [
  "crime",
  "planning",
  "amenities",
  "schools",
  "transport",
  "green-space",
  "property",
  "land",
  "demographics",
] as const satisfies readonly LayerId[];
export type ServedLayerId = (typeof SERVED_LAYER_IDS)[number];

export const isServedLayerId = (value: unknown): value is ServedLayerId =>
  SERVED_LAYER_IDS.some((id) => id === value);

/**
 * The body of `GET /api/area/{layer}`: one Layer's Features and statistics for
 * a Search Area. Each Layer loads on its own, so the map shows it as soon as
 * its Data Sources answer, never waiting for the slowest (PRD NFR-2.3).
 */
export type LayerResponse =
  | CrimeLayerResponse
  | PlanningLayerResponse
  | AmenitiesLayerResponse
  | SchoolsLayerResponse
  | TransportLayerResponse
  | GreenSpaceLayerResponse
  | PropertyLayerResponse
  | LandLayerResponse
  | DemographicsLayerResponse;

export const isLayerResponse = (value: unknown): value is LayerResponse =>
  isCrimeLayerResponse(value) ||
  isPlanningLayerResponse(value) ||
  isAmenitiesLayerResponse(value) ||
  isSchoolsLayerResponse(value) ||
  isTransportLayerResponse(value) ||
  isGreenSpaceLayerResponse(value) ||
  isPropertyLayerResponse(value) ||
  isLandLayerResponse(value) ||
  isDemographicsLayerResponse(value);
