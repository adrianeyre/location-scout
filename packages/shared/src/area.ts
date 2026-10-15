import { isLocalGeography, type LocalGeography } from "./geography";
import { isCouncilReport, type CouncilReport } from "./prepared-data";
import {
  isLocation,
  isSearchRadiusMiles,
  type Location,
  type SearchRadiusMiles,
} from "./search-area";
import {
  isLayerReport,
  isSourceReport,
  type LayerReport,
  type SourceReport,
} from "./source-status";

/** A Search Area: the circle defined by a Location and its Search Radius. */
export interface SearchArea {
  location: Location;
  searchRadius: {
    miles: SearchRadiusMiles;
    metres: number;
  };
}

/**
 * The body of `GET /api/area?lat=&lng=&radius=`: the Search Area around a
 * Location, the local geography it lies in (PRD FR-1.8), the council it is in
 * from the prepared council boundaries (FR-6.3), every Data Source consulted
 * for it, and the status of each Layer those sources supply (PRD NFR-1.2,
 * NFR-1.3). Layer statistics are added to it by later work.
 */
export interface AreaResponse extends SearchArea {
  geography: LocalGeography;
  council: CouncilReport;
  sources: SourceReport[];
  layers: LayerReport[];
}

export const isSearchArea = (value: unknown): value is SearchArea =>
  typeof value === "object" &&
  value !== null &&
  "location" in value &&
  isLocation(value.location) &&
  "searchRadius" in value &&
  typeof value.searchRadius === "object" &&
  value.searchRadius !== null &&
  "miles" in value.searchRadius &&
  isSearchRadiusMiles(value.searchRadius.miles) &&
  "metres" in value.searchRadius &&
  typeof value.searchRadius.metres === "number";

export const isAreaResponse = (value: unknown): value is AreaResponse =>
  isSearchArea(value) &&
  "geography" in value &&
  isLocalGeography(value.geography) &&
  "council" in value &&
  isCouncilReport(value.council) &&
  "sources" in value &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  "layers" in value &&
  Array.isArray(value.layers) &&
  value.layers.every(isLayerReport);
