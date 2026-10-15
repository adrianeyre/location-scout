import { isLocation, type Location } from "./search-area";

/**
 * A Feature: one real-world thing inside a Search Area that appears on the map,
 * such as a reported crime. Each Layer's Features add their own details.
 */
export interface Feature {
  /** Identifies the Feature within its Layer. */
  id: string;
  location: Location;
  /** How far it is from the Location in a straight line (PRD FR-2.10). */
  distanceMetres: number;
}

export const isFeature = (value: unknown): value is Feature =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof value.id === "string" &&
  "location" in value &&
  isLocation(value.location) &&
  "distanceMetres" in value &&
  typeof value.distanceMetres === "number" &&
  Number.isFinite(value.distanceMetres) &&
  value.distanceMetres >= 0;
