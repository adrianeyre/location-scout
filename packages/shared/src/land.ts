import { isFeature, type Feature } from "./feature";
import {
  isConstraintShape,
  isNearbyPlanningApplications,
  isPlanningConstraintType,
  type ConstraintShape,
  type NearbyPlanningApplications,
  type PlanningConstraintType,
} from "./planning";
import {
  CCOD_DATASET,
  OCOD_DATASET,
  isCouncil,
  type Council,
} from "./prepared-data";
import { isDate } from "./property";
import { isLocation, type Location } from "./search-area";
import {
  isDataPeriod,
  isSourceReport,
  isSourceStatus,
  type DataPeriod,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/**
 * The Land Opportunity Finder (PRD §6.6): Land Parcels that `pnpm
 * data:prepare` builds from OpenStreetMap's open or undeveloped land in each
 * Land Coverage Area, tagged as it builds them, and the filters that make a
 * Land Parcel a Land Opportunity.
 */

/**
 * The wording every Land view shows (PRD FR-5.7): a Land Opportunity only
 * ever warrants investigation.
 */
export const LAND_OPPORTUNITY_WORDING =
  "Our data suggests this parcel warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner.";

/**
 * What the UI says of INSPIRE Index Polygons, which Possibly Unregistered is
 * found from (PRD FR-5.8).
 */
export const INSPIRE_FREEHOLD_NOTE =
  "INSPIRE Index Polygons cover only registered freehold titles. Land held only on a lease, and titles registered recently, may be missing from them, so Possibly Unregistered land may well be registered.";

/**
 * HM Land Registry's services for checking who owns land (PRD FR-5.6): its
 * register, searched by address or on a map, and an official search of its
 * index map, which also says whether land is unregistered.
 */
export const HM_LAND_REGISTRY_SEARCHES = [
  {
    name: "Search the register",
    url: "https://www.gov.uk/search-property-information-land-registry",
  },
  {
    name: "Search the index map",
    url: "https://www.gov.uk/get-information-about-property-and-land/search-the-index-map",
  },
] as const;

/**
 * The indicative Ownership Categories (PRD FR-5.4a): who holds land, as far
 * as HM Land Registry's UK companies (CCOD) and overseas companies (OCOD)
 * that own property can say, matched to INSPIRE Index Polygons by address.
 * Land a company's or council's title isn't matched to is other registered
 * if INSPIRE Index Polygons cover most of it, and Possibly Unregistered if
 * they don't.
 */
export const OWNERSHIP_CATEGORIES = [
  "company",
  "council-or-public-body",
  "other-registered",
  "possibly-unregistered",
] as const;

export type OwnershipCategory = (typeof OWNERSHIP_CATEGORIES)[number];

export const isOwnershipCategory = (
  value: unknown,
): value is OwnershipCategory =>
  OWNERSHIP_CATEGORIES.some((category) => category === value);

/** The Ownership Categories a matched title gives the INSPIRE Index Polygon it is matched to. */
export type TitleOwnershipCategory = Extract<
  OwnershipCategory,
  "company" | "council-or-public-body"
>;

/** What each Ownership Category is called. */
export const OWNERSHIP_CATEGORY_NAMES: Readonly<
  Record<OwnershipCategory, string>
> = {
  company: "Company-owned",
  "council-or-public-body": "Council or public-body owned",
  "other-registered": "Other registered",
  "possibly-unregistered": "Possibly Unregistered",
};

/**
 * CCOD's Proprietorship Categories that make a title council or public-body
 * owned. "Corporate Body" is how HM Land Registry registers most public
 * bodies, such as NHS trusts, but not only them. Every other category in
 * CCOD, and every title in OCOD, is a company's.
 */
export const PUBLIC_BODY_PROPRIETORSHIP_CATEGORIES = [
  "Local Authority",
  "County Council",
  "Corporate Body",
] as const;

/**
 * What every view of Ownership Categories says (PRD FR-5.4a): they are
 * indicative, and few titles can be matched (docs/spikes/oq-7-ccod-ocod-title-matching.md).
 */
export const OWNERSHIP_CATEGORY_NOTE =
  "Ownership Categories are indicative. A company's or council's title is matched to an INSPIRE Index Polygon only where its address names a house number or a building that OpenStreetMap places inside that polygon, and few do, so other registered land may well be held by a company or a council too.";

/** HM Land Registry's datasets of titles held by UK companies and by overseas companies. */
export const TITLE_DATASETS = [CCOD_DATASET, OCOD_DATASET] as const;

export type TitleDataset = (typeof TITLE_DATASETS)[number];

/** How a title's address found the one INSPIRE Index Polygon it is matched to. */
export const TITLE_MATCHED_BY = ["address", "named"] as const;

export type TitleMatchedBy = (typeof TITLE_MATCHED_BY)[number];

/**
 * A company's or council's registered title, from CCOD or OCOD, matched to
 * one INSPIRE Index Polygon by its address (PRD FR-5.4a). The match is
 * indicative. Its proprietors are not named.
 */
export interface MatchedTitle {
  /** HM Land Registry's title number. */
  titleNumber: string;
  /** Its Property Address, as the register gives it, which it was matched by. */
  propertyAddress: string;
  /** Its first proprietor's Proprietorship Category, as the dataset gives it: "Local Authority". */
  proprietorshipCategory: string;
  ownershipCategory: TitleOwnershipCategory;
  /** The dataset it is from: `ccod` (UK companies) or `ocod` (overseas companies). */
  dataset: TitleDataset;
  /** When the dataset's data dates from, as an ISO 8601 month: `2026-10`. */
  sourceDate: string;
  /** Its house number and street, or the building it names, as OpenStreetMap places it. */
  matchedBy: TitleMatchedBy;
  /** The INSPIRE Index Polygon it is matched to. */
  inspireId: string;
  /** How far that polygon is from the Land Parcel, in metres: 0 if it overlaps it. */
  distanceMetres: number;
}

/**
 * The statement HM Land Registry's licence for CCOD and OCOD requires
 * wherever they are used, with the year of their data (PRD FR-10.1a).
 */
export const titleAttribution = (year: string) =>
  `Information produced by HM Land Registry. © Crown copyright ${year}.`;

/**
 * How the land sales near a Land Opportunity are found (PRD FR-5.4b):
 *
 * - `withinMetres`: HM Land Registry's Price Paid sales of property of type
 *   "Other" this near it, 1 mile, are listed with it. Each is placed at the
 *   middle of its postcode.
 * - `years`: those in this many years up to today.
 * - `listed`: at most this many, the newest first, are listed with each Land
 *   Opportunity and in the Land Layer's statistics; all of them are counted.
 */
export const NEARBY_LAND_SALES_RULES = {
  withinMetres: 1609.344,
  years: 5,
  listed: 10,
} as const;

/** What every nearby land sale is marked (PRD FR-5.4b). */
export const LAND_SALE_LABEL = "indicative: may not be land";

/**
 * What every view of nearby land sales says of them (PRD FR-5.4b): Price
 * Paid's "Other" is far more than land, and places sales only by postcode.
 */
export const LAND_SALES_NOTE =
  "Land sales are HM Land Registry's Price Paid sales of property of type Other: anything that isn't a house or a flat. That is land, but also shops, offices, pubs and industrial units, so most may not be land. Each is placed at the middle of its postcode, so a sale without a postcode, as land often is, can't be placed and isn't found.";

/**
 * A sale near a Land Opportunity that HM Land Registry's Price Paid Data
 * records as of property of type "Other" (PRD FR-5.4b). It is indicative: it
 * may not be land. Price Paid gives no point for a property, so `location`
 * is the middle of its postcode.
 */
export interface LandSale {
  /** Price Paid's transaction ID. */
  id: string;
  /** What it sold for, in whole pounds. */
  price: number;
  /** The day the sale completed, for example `2026-05-28`. */
  date: string;
  /** Its address as Price Paid records it, in capitals, without its postcode. */
  address: string;
  postcode: string;
  location: Location;
  /**
   * How far its postcode's middle is from the Land Opportunity, in metres:
   * 0 if it is inside it. In the Land Layer's statistics, from the nearest
   * of them.
   */
  distanceMetres: number;
}

/** The land sales found near Land Opportunities: how many, their median price, and the newest. */
export interface LandSalesFound {
  count: number;
  /** In whole pounds, or `null` if there were none. */
  medianPrice: number | null;
  /** The newest first: at most `NEARBY_LAND_SALES_RULES.listed`, except for one Land Parcel's own. */
  sales: LandSale[];
}

/**
 * The land sales within 1 mile of a Land Opportunity, or of any of them, in
 * the last 5 years (PRD FR-5.4b). They are looked for in the postcodes
 * `pnpm data:prepare` prepared for each Land Coverage Area: before it has,
 * `status` is `not-prepared`, and if Price Paid doesn't answer, `unavailable`.
 */
export interface NearbyLandSales {
  status: SourceStatus;
  /** The years looked at, as ISO 8601 dates, up to and including today. */
  period: DataPeriod;
  /** `null` unless `status` is `ok`. */
  found: LandSalesFound | null;
}

/** Square metres in an acre and in a hectare. */
export const SQUARE_METRES_PER_ACRE = 4046.8564224;
export const SQUARE_METRES_PER_HECTARE = 10_000;

/**
 * How `pnpm data:prepare` tags a Land Parcel (PRD FR-5.4), in one place so
 * the UI says what it does:
 *
 * - `possiblyUnregisteredBelow`: it is Possibly Unregistered when less than
 *   this share of its area is covered by INSPIRE Index Polygons.
 * - `homesPerHectare` and `accessAndOpenSpace`: its estimated capacity is
 *   this many homes a hectare, after leaving this share of it for access and
 *   open space.
 * - `roadSearchMetres`: how far a road is looked for. A parcel with none so
 *   near has no road distance.
 * - `minimumAreaSquareMetres`: smaller pieces of land are not Land Parcels.
 * - `developmentActivityMetres`: how far from a Land Opportunity Planning
 *   Applications count as its nearby development activity. The API tags it
 *   with them, as they come live, not from `pnpm data:prepare`.
 * - `titlesAroundMetres`: the companies' and councils' titles matched to
 *   INSPIRE Index Polygons this near it, as well as to those that overlap
 *   it, are listed with it (PRD FR-5.4a).
 */
export const LAND_PARCEL_RULES = {
  possiblyUnregisteredBelow: 0.5,
  homesPerHectare: 30,
  accessAndOpenSpace: 0.4,
  roadSearchMetres: 500,
  minimumAreaSquareMetres: 100,
  titlesAroundMetres: 25,
  developmentActivityMetres: 500,
} as const;

/** One INSPIRE Index Polygon that overlaps a Land Parcel, and how much of the parcel it covers. */
export interface InspireOverlap {
  /** HM Land Registry's INSPIRE ID for the polygon. */
  inspireId: string;
  /** The share of the parcel's area it covers, from 0 to 1. */
  share: number;
  /**
   * Its indicative Ownership Category: company-owned or council or
   * public-body owned if a title is matched to it, or else other registered.
   * `null` where CCOD and OCOD aren't prepared.
   */
  ownershipCategory: OwnershipCategory | null;
}

/** A Planning Constraint a Land Parcel intersects (PRD FR-5.4). */
export interface LandConstraint {
  type: PlanningConstraintType;
  /** Its name. A flood zone is named by its zone: "Flood zone 3". */
  name: string;
}

/**
 * A Land Parcel: a contiguous piece of open or undeveloped land from
 * OpenStreetMap, independent of any legal title, with its tags (PRD FR-5.2,
 * FR-5.4). Its `location` is a point inside it, where the map marks it.
 */
export interface LandParcel {
  /** The council's ONS code and its number there, for example `E07000170-412`. */
  id: string;
  location: Location;
  /** The Land Coverage Area it is in. */
  council: Council;
  /** The name OpenStreetMap gives the land, if any. */
  name: string | null;
  /** The OpenStreetMap tags of the land it is built from, for example `landuse=farmland`. */
  landUse: string[];
  areaHectares: number;
  areaAcres: number;
  /**
   * How far the nearest road is, in metres, or `null` if there is none
   * within `LAND_PARCEL_RULES.roadSearchMetres`.
   */
  roadDistanceMetres: number | null;
  /** The share of its area INSPIRE Index Polygons cover, from 0 to 1. */
  inspireCoverage: number;
  /** Less than half of it is covered by INSPIRE Index Polygons. Unregistered land still has an owner. */
  possiblyUnregistered: boolean;
  /** The INSPIRE Index Polygons that overlap it, the most overlapping first. */
  inspirePolygons: InspireOverlap[];
  /**
   * Its indicative Ownership Category (PRD FR-5.4a): Possibly Unregistered,
   * or else that of the INSPIRE Index Polygon that covers most of it. `null`
   * where CCOD and OCOD aren't prepared, so only whether it is Possibly
   * Unregistered is known.
   */
  ownershipCategory: OwnershipCategory | null;
  /**
   * The companies' and councils' titles matched to the INSPIRE Index
   * Polygons that overlap it or are within `LAND_PARCEL_RULES.titlesAroundMetres`
   * of it, the nearest first.
   */
  matchedTitles: MatchedTitle[];
  /** The Planning Constraints it intersects, by type. */
  constraints: LandConstraint[];
  /** The highest flood zone it is in, 2 or 3, or `null` for flood zone 1. */
  floodZone: 2 | 3 | null;
  /** Whether it overlaps a listed building's outline (PRD FR-5.3). */
  onListedBuildingOutline: boolean;
  /** Homes it might hold, at 30 a hectare after 40% for access and open space. */
  estimatedHomes: number;
  shape: ConstraintShape;
}

/**
 * A Land Opportunity: a Land Parcel that meets the active filters, and so
 * warrants further investigation (PRD FR-5.3). It is never a claim that the
 * land is available or unowned. `distanceMetres` is to its nearest edge: 0
 * if the Location is inside it.
 */
export interface LandOpportunityFeature extends LandParcel, Feature {
  /**
   * The land sales within 1 mile of it (PRD FR-5.4b). `null` across a whole
   * Land Coverage Area, where they are looked for only for the Land
   * Parcel chosen.
   */
  nearbyLandSales: NearbyLandSales | null;
  /**
   * Its nearby development activity (PRD FR-5.4): the Planning Applications
   * within 500 m of it, among the Search Area's. `null` across a whole Land
   * Coverage Area, where they aren't looked for.
   */
  nearbyPlanningApplications: NearbyPlanningApplications | null;
}

/** The land uses the Land Layer shows as context (PRD FR-2.7). */
export const LAND_USE_CONTEXT_TYPES = [
  "industrial",
  "commercial",
  "retail",
] as const;

export type LandUseContextType = (typeof LAND_USE_CONTEXT_TYPES)[number];

export const isLandUseContextType = (
  value: unknown,
): value is LandUseContextType =>
  LAND_USE_CONTEXT_TYPES.some((type) => type === value);

/** An area OpenStreetMap maps as industrial, commercial or retail land use, drawn as context. */
export interface LandUseArea {
  /** Its OpenStreetMap type and id, for example `way-123`. */
  id: string;
  landUse: LandUseContextType;
  name: string | null;
  shape: ConstraintShape;
}

/** Where Land Opportunities are looked for (PRD FR-5.1). */
export const LAND_SCOPES = ["search-area", "land-coverage-area"] as const;

export type LandScope = (typeof LAND_SCOPES)[number];

export const isLandScope = (value: unknown): value is LandScope =>
  LAND_SCOPES.some((scope) => scope === value);

/** How Land Opportunities are listed (PRD FR-5.1): the largest, nearest a road, or most homes first. */
export const LAND_SORTS = ["area", "road-distance", "capacity"] as const;

export type LandSort = (typeof LAND_SORTS)[number];

export const isLandSort = (value: unknown): value is LandSort =>
  LAND_SORTS.some((sort) => sort === value);

/** The flood zones a Land Opportunity may be in at most: 1 leaves out zones 2 and 3. */
export const FLOOD_ZONES = [1, 2, 3] as const;

export type FloodZone = (typeof FLOOD_ZONES)[number];

export const isFloodZone = (value: unknown): value is FloodZone =>
  FLOOD_ZONES.some((zone) => zone === value);

/**
 * The filters a Land Parcel must meet to be a Land Opportunity (PRD FR-5.3,
 * FR-5.5). Each is the user's to change.
 */
export interface LandFilters {
  /** Its least area, in acres. */
  minAcres: number;
  /** Its greatest area, in acres, or `null` for no limit. */
  maxAcres: number | null;
  /** How far from a road it may be, in metres, or `null` for any distance. */
  maxRoadMetres: number | null;
  /** The highest flood zone it may be in: 3 for any. */
  maxFloodZone: FloodZone;
  /** Only Possibly Unregistered land. */
  possiblyUnregisteredOnly: boolean;
  /** Leave out land that intersects a Planning Constraint of these types. */
  excludeConstraints: PlanningConstraintType[];
  /** Leave out land that overlaps a listed building's outline. */
  excludeListedBuildingOutlines: boolean;
  /**
   * Only land of these Ownership Categories, or any if there are none. Land
   * with no Ownership Category, where CCOD and OCOD aren't prepared, is in
   * none of them.
   */
  ownershipCategories: OwnershipCategory[];
}

/** FR-5.3's defaults: at least 0.1 acre, 50 m or nearer a road, and not on a listed building's outline. */
export const DEFAULT_LAND_FILTERS: LandFilters = {
  minAcres: 0.1,
  maxAcres: null,
  maxRoadMetres: 50,
  maxFloodZone: 3,
  possiblyUnregisteredOnly: false,
  excludeConstraints: [],
  excludeListedBuildingOutlines: true,
  ownershipCategories: [],
};

export const DEFAULT_LAND_SCOPE: LandScope = "search-area";
export const DEFAULT_LAND_SORT: LandSort = "area";

/** At most this many Land Opportunities are listed and mapped, in the order chosen. */
export const LAND_LIST_LIMIT = 500;

/** The Land Layer's statistics for the Location Overview and the Land panel (PRD FR-2.7). */
export interface LandStatistics {
  /** Land Parcels where they were looked for, before the filters. */
  parcels: number;
  /** Land Opportunities: the parcels that meet the filters. */
  count: number;
  /** Their area together, in hectares. */
  totalHectares: number;
  /** How many of them are Possibly Unregistered. */
  possiblyUnregistered: number;
  /**
   * How many of them are in each Ownership Category, or `null` if no Land
   * Coverage Area looked in has CCOD and OCOD prepared.
   */
  ownershipCategories: Record<OwnershipCategory, number> | null;
  /** Homes they might hold together. */
  estimatedHomes: number;
  /** How many are listed in `features`: at most `LAND_LIST_LIMIT`. */
  listed: number;
  /**
   * The land sales within 1 mile of any of them (PRD FR-5.4b), each as far
   * as the nearest. `null` across a whole Land Coverage Area.
   */
  nearbyLandSales: NearbyLandSales | null;
}

/**
 * The body of `GET /api/area/land` and `GET /api/land`: the Land
 * Opportunities in the Search Area, or in the whole Land Coverage Area,
 * that meet the filters, in the order chosen, with industrial and commercial
 * land use as context (PRD FR-2.7, FR-5.1). Before `pnpm data:prepare` has
 * run, or where the Search Area reaches into no Land Coverage Area, `status`
 * is `not-prepared`, and there are no Features and no statistics.
 */
export interface LandLayerResponse {
  layer: "land";
  status: SourceStatus;
  /** The prepared datasets behind the Layer, and how each was read. */
  sources: SourceReport[];
  scope: LandScope;
  sort: LandSort;
  filters: LandFilters;
  /** The Land Coverage Areas looked in: those the Search Area reaches into. */
  landCoverageAreas: Council[];
  /**
   * The councils the Search Area reaches into whose land data isn't
   * prepared, so whose land isn't looked at.
   */
  notCovered: Council[];
  /** Land Opportunities, at most `LAND_LIST_LIMIT`, in the order chosen. */
  features: LandOpportunityFeature[];
  /** Industrial, commercial and retail land use in the Search Area, as context. */
  landUse: LandUseArea[];
  /** `null` unless `status` is `ok`. */
  statistics: LandStatistics | null;
}

/**
 * An INSPIRE Index Polygon that overlaps a Land Parcel, or is around it with
 * a company's or council's title matched to it, with its outline. One around
 * it covers none of it: its `share` is 0.
 */
export interface InspirePolygon extends InspireOverlap {
  /** How far it is from the Land Parcel, in metres: 0 if it overlaps it. */
  distanceMetres: number;
  shape: ConstraintShape;
}

/**
 * The body of `GET /api/land/{parcelId}`: one Land Parcel, its tags and
 * outline, and the INSPIRE Index Polygons that overlap it, and those around
 * it a company's or council's title is matched to, with theirs (PRD FR-5.4a,
 * FR-5.6), and the land sales near it (FR-5.4b).
 */
export interface LandParcelResponse {
  parcel: LandParcel;
  inspirePolygons: InspirePolygon[];
  /** The land sales within 1 mile of it, every one of them (PRD FR-5.4b). */
  nearbyLandSales: NearbyLandSales;
  /** The prepared datasets behind it, and how each was read. */
  sources: SourceReport[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isShare = (value: unknown): value is number =>
  isAmount(value) && value <= 1;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isInspireOverlap = (value: unknown): value is InspireOverlap =>
  isRecord(value) &&
  isText(value.inspireId) &&
  isShare(value.share) &&
  (value.ownershipCategory === null ||
    isOwnershipCategory(value.ownershipCategory));

export const isMatchedTitle = (value: unknown): value is MatchedTitle =>
  isRecord(value) &&
  isText(value.titleNumber) &&
  isText(value.propertyAddress) &&
  isText(value.proprietorshipCategory) &&
  (value.ownershipCategory === "company" ||
    value.ownershipCategory === "council-or-public-body") &&
  TITLE_DATASETS.some((dataset) => dataset === value.dataset) &&
  isText(value.sourceDate) &&
  TITLE_MATCHED_BY.some((by) => by === value.matchedBy) &&
  isText(value.inspireId) &&
  isAmount(value.distanceMetres);

const isPrice = isCount;

export const isLandSale = (value: unknown): value is LandSale =>
  isRecord(value) &&
  isText(value.id) &&
  isPrice(value.price) &&
  isDate(value.date) &&
  isText(value.address) &&
  isText(value.postcode) &&
  isLocation(value.location) &&
  isAmount(value.distanceMetres);

const isLandSalesFound = (value: unknown): value is LandSalesFound =>
  isRecord(value) &&
  isCount(value.count) &&
  (value.medianPrice === null || isPrice(value.medianPrice)) &&
  Array.isArray(value.sales) &&
  value.sales.every(isLandSale);

export const isNearbyLandSales = (value: unknown): value is NearbyLandSales =>
  isRecord(value) &&
  isSourceStatus(value.status) &&
  isDataPeriod(value.period) &&
  isDate(value.period.from) &&
  isDate(value.period.to) &&
  (value.found === null || isLandSalesFound(value.found));

const isLandConstraint = (value: unknown): value is LandConstraint =>
  isRecord(value) && isPlanningConstraintType(value.type) && isText(value.name);

export const isLandParcel = (value: unknown): value is LandParcel =>
  isRecord(value) &&
  isText(value.id) &&
  isLocation(value.location) &&
  isCouncil(value.council) &&
  (value.name === null || isText(value.name)) &&
  Array.isArray(value.landUse) &&
  value.landUse.every(isText) &&
  isAmount(value.areaHectares) &&
  isAmount(value.areaAcres) &&
  (value.roadDistanceMetres === null || isAmount(value.roadDistanceMetres)) &&
  isShare(value.inspireCoverage) &&
  typeof value.possiblyUnregistered === "boolean" &&
  Array.isArray(value.inspirePolygons) &&
  value.inspirePolygons.every(isInspireOverlap) &&
  (value.ownershipCategory === null ||
    isOwnershipCategory(value.ownershipCategory)) &&
  Array.isArray(value.matchedTitles) &&
  value.matchedTitles.every(isMatchedTitle) &&
  Array.isArray(value.constraints) &&
  value.constraints.every(isLandConstraint) &&
  (value.floodZone === null ||
    value.floodZone === 2 ||
    value.floodZone === 3) &&
  typeof value.onListedBuildingOutline === "boolean" &&
  isCount(value.estimatedHomes) &&
  isConstraintShape(value.shape);

export const isLandOpportunityFeature = (
  value: unknown,
): value is LandOpportunityFeature =>
  isFeature(value) &&
  isLandParcel(value) &&
  isRecord(value) &&
  (value.nearbyLandSales === null ||
    isNearbyLandSales(value.nearbyLandSales)) &&
  (value.nearbyPlanningApplications === null ||
    isNearbyPlanningApplications(value.nearbyPlanningApplications));

export const isLandUseArea = (value: unknown): value is LandUseArea =>
  isRecord(value) &&
  isText(value.id) &&
  isLandUseContextType(value.landUse) &&
  (value.name === null || isText(value.name)) &&
  isConstraintShape(value.shape);

export const isLandFilters = (value: unknown): value is LandFilters =>
  isRecord(value) &&
  isAmount(value.minAcres) &&
  (value.maxAcres === null || isAmount(value.maxAcres)) &&
  (value.maxRoadMetres === null || isAmount(value.maxRoadMetres)) &&
  isFloodZone(value.maxFloodZone) &&
  typeof value.possiblyUnregisteredOnly === "boolean" &&
  Array.isArray(value.excludeConstraints) &&
  value.excludeConstraints.every(isPlanningConstraintType) &&
  typeof value.excludeListedBuildingOutlines === "boolean" &&
  Array.isArray(value.ownershipCategories) &&
  value.ownershipCategories.every(isOwnershipCategory);

const isCategoryCounts = (
  value: unknown,
): value is Record<OwnershipCategory, number> =>
  isRecord(value) &&
  OWNERSHIP_CATEGORIES.every((category) => isCount(value[category]));

export const isLandStatistics = (value: unknown): value is LandStatistics =>
  isRecord(value) &&
  isCount(value.parcels) &&
  isCount(value.count) &&
  isAmount(value.totalHectares) &&
  isCount(value.possiblyUnregistered) &&
  (value.ownershipCategories === null ||
    isCategoryCounts(value.ownershipCategories)) &&
  isCount(value.estimatedHomes) &&
  isCount(value.listed) &&
  (value.nearbyLandSales === null || isNearbyLandSales(value.nearbyLandSales));

export const isLandLayerResponse = (
  value: unknown,
): value is LandLayerResponse =>
  isRecord(value) &&
  value.layer === "land" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  isLandScope(value.scope) &&
  isLandSort(value.sort) &&
  isLandFilters(value.filters) &&
  Array.isArray(value.landCoverageAreas) &&
  value.landCoverageAreas.every(isCouncil) &&
  Array.isArray(value.notCovered) &&
  value.notCovered.every(isCouncil) &&
  Array.isArray(value.features) &&
  value.features.every(isLandOpportunityFeature) &&
  Array.isArray(value.landUse) &&
  value.landUse.every(isLandUseArea) &&
  (value.statistics === null || isLandStatistics(value.statistics));

const isInspirePolygon = (value: unknown): value is InspirePolygon =>
  isInspireOverlap(value) &&
  isRecord(value) &&
  isAmount(value.distanceMetres) &&
  isConstraintShape(value.shape);

export const isLandParcelResponse = (
  value: unknown,
): value is LandParcelResponse =>
  isRecord(value) &&
  isLandParcel(value.parcel) &&
  Array.isArray(value.inspirePolygons) &&
  value.inspirePolygons.every(isInspirePolygon) &&
  isNearbyLandSales(value.nearbyLandSales) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport);
