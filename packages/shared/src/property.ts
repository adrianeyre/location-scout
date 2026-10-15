import { isFeature, type Feature } from "./feature";
import {
  isDataPeriod,
  isSourceReport,
  isSourceStatus,
  type DataPeriod,
  type SourceReport,
  type SourceStatus,
} from "./source-status";

/**
 * The kinds of property HM Land Registry's Price Paid Data records a sale of
 * (PRD FR-2.6). `other` is anything else, such as a shop, an office or land.
 */
export const PROPERTY_TYPES = [
  "detached",
  "semi-detached",
  "terraced",
  "flat",
  "other",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const isPropertyType = (value: unknown): value is PropertyType =>
  PROPERTY_TYPES.some((type) => type === value);

/** Whether a property was sold freehold or leasehold. */
export const TENURES = ["freehold", "leasehold"] as const;

export type Tenure = (typeof TENURES)[number];

export const isTenure = (value: unknown): value is Tenure =>
  TENURES.some((tenure) => tenure === value);

/** An ISO 8601 date, such as `2026-05-29`. */
export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const isDate = (value: unknown): value is string =>
  typeof value === "string" && DATE_PATTERN.test(value);

/**
 * The energy efficiency bands of an Energy Performance Certificate, from A,
 * the most efficient, to G (PRD FR-2.6).
 */
export const EPC_BANDS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export type EpcBand = (typeof EPC_BANDS)[number];

export const isEpcBand = (value: unknown): value is EpcBand =>
  EPC_BANDS.some((band) => band === value);

/**
 * The fixed rules a sale's price per m² is figured by (PRD FR-2.6). A
 * certificate's floor area outside these is taken for a mistake, such as
 * the 0 or 0.01 m² some certificates give, so it gives no price per m².
 */
export const EPC_RULES = {
  minFloorAreaSquareMetres: 10,
  maxFloorAreaSquareMetres: 1000,
} as const;

/** Where EPCs come from, as the Location Overview credits it (FR-10.1a). */
export const EPC_SOURCE = {
  name: "Get energy performance of buildings data",
  url: "https://get-energy-performance-data.communities.gov.uk/",
} as const;

/**
 * The attribution EPC data needs (PRD FR-10.1a, OQ-8): every field but the
 * address is under the Open Government Licence v3.0. No certificate's
 * address is ever shown, so its address notice isn't needed.
 */
export const EPC_ATTRIBUTION =
  "Energy Performance Certificate data from MHCLG's Get energy performance of buildings data, licensed under the Open Government Licence v3.0.";

/**
 * What a sale's certificate says beyond its search result, from the EPC
 * API's certificate.
 */
export interface SaleEpcDetails {
  /** The band its improvements could bring it to, or `null` if it doesn't say. */
  potentialBand: EpcBand | null;
  /** Its total floor area in m², or `null` if it gives none. */
  floorAreaSquareMetres: number | null;
  /**
   * The sale's price over its floor area, in whole pounds, or `null` if it
   * gives none, or one outside `EPC_RULES`.
   */
  pricePerSquareMetre: number | null;
}

/** The Energy Performance Certificate a sale was matched to (PRD FR-2.6). */
export interface SaleEpc {
  /** The register's certificate number. Never its address (OQ-8). */
  certificateNumber: string;
  /** The day it was registered, for example `2019-03-14`. */
  registrationDate: string;
  /** Its band, or `null` if it doesn't say. */
  currentBand: EpcBand | null;
  /** `null` if the EPC API didn't answer for the certificate. */
  details: SaleEpcDetails | null;
}

/**
 * Whether a sale was matched to an Energy Performance Certificate in its
 * postcode (PRD FR-2.6, OQ-8):
 * - `matched`: exactly one property's certificates fit its address, and
 *   `certificate` is the one current when it sold.
 * - `unmatched`: none did, or more than one did.
 * - `unavailable`: the EPC API didn't answer for its postcode.
 */
export type SaleEpcMatch =
  | { status: "matched"; certificate: SaleEpc }
  | { status: "unmatched" }
  | { status: "unavailable" };

/**
 * One sale in a property's history: a sale Price Paid records at the same
 * address (PRD FR-2.12).
 */
export interface AddressSale {
  /** Price Paid's transaction ID. */
  id: string;
  /** What it sold for, in whole pounds. */
  price: number;
  /** The day the sale completed, for example `2024-10-06`. */
  date: string;
  /**
   * The change in price from the sale before it at the address, in per cent
   * to one decimal place, for example `-5.7`. `null` for the first sale Price
   * Paid records there.
   */
  change: number | null;
}

/**
 * One sale in the Search Area that HM Land Registry's Price Paid Data records
 * (PRD FR-2.6). Price Paid gives no point for a property, only its postcode,
 * so `location` is the middle of its postcode and every sale in one postcode
 * is at the same point.
 */
export interface PropertySaleFeature extends Feature {
  /** What it sold for, in whole pounds. */
  price: number;
  /** The day the sale completed, for example `2026-05-29`. */
  date: string;
  type: PropertyType;
  tenure: Tenure;
  /** Whether it was newly built when sold. */
  newBuild: boolean;
  /**
   * Its address as Price Paid records it, in capitals, without its postcode:
   * "FLAT 2, 88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD".
   */
  address: string;
  postcode: string;
  /**
   * Every sale Price Paid records at its address since 1995, newest first,
   * this one among them (PRD FR-2.12). `null` if Price Paid didn't answer
   * for them.
   */
  history: AddressSale[] | null;
  /**
   * Its Energy Performance Certificate (PRD FR-2.6), or `null` if EPCs
   * aren't looked for: without `EPC_API_KEY`, or for property of type
   * `other`, which the register of homes doesn't cover.
   */
  epc: SaleEpcMatch | null;
}

/** How many sales there were, and their median and mean price in whole pounds. */
export interface PriceSummary {
  count: number;
  /** `null` if there were none. */
  median: number | null;
  /** `null` if there were none. */
  mean: number | null;
}

export interface PropertyTypePrices extends PriceSummary {
  type: PropertyType;
}

export interface TenurePrices extends PriceSummary {
  tenure: Tenure;
}

export interface NewBuildPrices extends PriceSummary {
  newBuild: boolean;
}

/**
 * The postcodes whose sales were looked for (PRD FR-2.8). Price Paid is
 * searched by postcode, not by distance, so the backend asks postcodes.io for
 * the postcodes in the Search Area, nearest first. postcodes.io gives at most
 * `limit`, so in a dense Search Area the furthest are left out.
 */
export interface PostcodeCoverage {
  /** How many postcodes in the Search Area were searched. */
  searched: number;
  /** The most postcodes.io gives. */
  limit: number;
  /**
   * Whether postcodes.io gave as many as `limit`, so the Search Area may have
   * more, whose sales are left out.
   */
  truncated: boolean;
  /** How far the furthest postcode searched is from the Location, or `null` if there are none. */
  reachMetres: number | null;
}

/**
 * The last 12 months' median price against an earlier 12 months', in the same
 * postcodes (PRD FR-2.6).
 */
export interface MedianPriceChange {
  /** The earlier 12 months, as ISO 8601 dates. */
  period: DataPeriod;
  /** The sales in them, or `null` if Price Paid didn't answer for them. */
  prices: PriceSummary | null;
  /**
   * The change in median price from then to the last 12 months, in per cent
   * to one decimal place, for example `7.1`. `null` if Price Paid didn't
   * answer, or there were no sales then or in the last 12 months.
   */
  change: number | null;
}

/** The Property Layer's statistics for the Location Overview (FR-2.6). */
export interface PropertyStatistics {
  /** The 12 months searched, as ISO 8601 dates, up to and including today. */
  period: DataPeriod;
  /** Every sale in the Search Area. */
  all: PriceSummary;
  /** Every type, in the order of `PROPERTY_TYPES`, even with none. */
  byType: PropertyTypePrices[];
  /** Every tenure, in the order of `TENURES`, even with none. */
  byTenure: TenurePrices[];
  /** New builds, then the rest, even with none. */
  byNewBuild: NewBuildPrices[];
  /**
   * The median price against the 12 months a year before, and the 12 months
   * five years before.
   */
  medianChange: {
    twelveMonths: MedianPriceChange;
    fiveYears: MedianPriceChange;
  };
  postcodes: PostcodeCoverage;
}

/** How many homes' latest certificates are in one band. */
export interface EpcBandCount {
  band: EpcBand;
  count: number;
}

/**
 * The Energy Performance Certificates in the Search Area's postcodes, and
 * the sales matched to them (PRD FR-2.6).
 */
export interface EpcStatistics {
  /**
   * The homes with a certificate in the postcodes searched, each counted
   * once, by its latest certificate's band: every band, in the order of
   * `EPC_BANDS`, even with none.
   */
  byBand: EpcBandCount[];
  /** How many homes have a certificate, those without a band among them. */
  homes: number;
  /** The postcodes asked for their certificates. */
  postcodes: {
    /** Those of `PropertyStatistics.postcodes` searched. */
    searched: number;
    /** How many the EPC API didn't answer for, whose certificates are left out. */
    unanswered: number;
  };
  /** The sales of houses and flats in the last 12 months. */
  sales: {
    /** How many were looked for in their postcodes' certificates. */
    lookedFor: number;
    /** How many were matched to one property's certificate. */
    matched: number;
  };
  /**
   * The price per m² of the sales matched to a certificate with a floor
   * area within `EPC_RULES`: their count, median and mean in whole pounds.
   */
  pricePerSquareMetre: PriceSummary;
}

/**
 * The Property Layer's Energy Performance Certificates (PRD FR-2.6), from
 * MHCLG's Energy Performance of Buildings Data API. `unavailable` if it
 * didn't answer for any postcode, when there are no statistics.
 */
export interface PropertyEpc {
  status: "ok" | "unavailable";
  /** `null` unless `status` is `ok`. */
  statistics: EpcStatistics | null;
}

/**
 * The body of `GET /api/area/property`: the sales in the Search Area in the
 * last 12 months, from HM Land Registry's Price Paid Data, in the postcodes
 * postcodes.io gives for the Search Area, with their count, median and mean
 * price (PRD FR-2.6, FR-2.8). If either source is unavailable, `status` says
 * so, and there are no Features and no statistics (NFR-1.2).
 */
export interface PropertyLayerResponse {
  layer: "property";
  status: SourceStatus;
  /** The Data Sources behind the Layer, and how each answered. */
  sources: SourceReport[];
  /** Newest first. */
  features: PropertySaleFeature[];
  /** `null` unless `status` is `ok`. */
  statistics: PropertyStatistics | null;
  /**
   * Their Energy Performance Certificates, or `null` if they aren't looked
   * for: without `EPC_API_KEY`, or unless `status` is `ok`.
   */
  epc: PropertyEpc | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isPrice = isCount;

const isMetres = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isChange = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));

export const isAddressSale = (value: unknown): value is AddressSale =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isPrice(value.price) &&
  isDate(value.date) &&
  isChange(value.change);

const isSquareMetres = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isSaleEpcDetails = (value: unknown): value is SaleEpcDetails =>
  isRecord(value) &&
  (value.potentialBand === null || isEpcBand(value.potentialBand)) &&
  (value.floorAreaSquareMetres === null ||
    isSquareMetres(value.floorAreaSquareMetres)) &&
  (value.pricePerSquareMetre === null || isPrice(value.pricePerSquareMetre));

export const isSaleEpc = (value: unknown): value is SaleEpc =>
  isRecord(value) &&
  typeof value.certificateNumber === "string" &&
  isDate(value.registrationDate) &&
  (value.currentBand === null || isEpcBand(value.currentBand)) &&
  (value.details === null || isSaleEpcDetails(value.details));

export const isSaleEpcMatch = (value: unknown): value is SaleEpcMatch =>
  isRecord(value) &&
  (value.status === "matched"
    ? isSaleEpc(value.certificate)
    : value.status === "unmatched" || value.status === "unavailable");

export const isPropertySaleFeature = (
  value: unknown,
): value is PropertySaleFeature =>
  isFeature(value) &&
  isRecord(value) &&
  isPrice(value.price) &&
  isDate(value.date) &&
  isPropertyType(value.type) &&
  isTenure(value.tenure) &&
  typeof value.newBuild === "boolean" &&
  typeof value.address === "string" &&
  typeof value.postcode === "string" &&
  (value.history === null ||
    (Array.isArray(value.history) && value.history.every(isAddressSale))) &&
  (value.epc === null || isSaleEpcMatch(value.epc));

export const isPriceSummary = (value: unknown): value is PriceSummary =>
  isRecord(value) &&
  isCount(value.count) &&
  (value.median === null || isPrice(value.median)) &&
  (value.mean === null || isPrice(value.mean));

const isMedianPriceChange = (value: unknown): value is MedianPriceChange =>
  isRecord(value) &&
  isDataPeriod(value.period) &&
  isDate(value.period.from) &&
  isDate(value.period.to) &&
  (value.prices === null || isPriceSummary(value.prices)) &&
  isChange(value.change);

const isPostcodeCoverage = (value: unknown): value is PostcodeCoverage =>
  isRecord(value) &&
  isCount(value.searched) &&
  isCount(value.limit) &&
  typeof value.truncated === "boolean" &&
  (value.reachMetres === null || isMetres(value.reachMetres));

export const isPropertyStatistics = (
  value: unknown,
): value is PropertyStatistics =>
  isRecord(value) &&
  isDataPeriod(value.period) &&
  isDate(value.period.from) &&
  isDate(value.period.to) &&
  isPriceSummary(value.all) &&
  Array.isArray(value.byType) &&
  value.byType.every(
    (prices) =>
      isPriceSummary(prices) && isRecord(prices) && isPropertyType(prices.type),
  ) &&
  Array.isArray(value.byTenure) &&
  value.byTenure.every(
    (prices) =>
      isPriceSummary(prices) && isRecord(prices) && isTenure(prices.tenure),
  ) &&
  Array.isArray(value.byNewBuild) &&
  value.byNewBuild.every(
    (prices) =>
      isPriceSummary(prices) &&
      isRecord(prices) &&
      typeof prices.newBuild === "boolean",
  ) &&
  isRecord(value.medianChange) &&
  isMedianPriceChange(value.medianChange.twelveMonths) &&
  isMedianPriceChange(value.medianChange.fiveYears) &&
  isPostcodeCoverage(value.postcodes);

export const isEpcStatistics = (value: unknown): value is EpcStatistics =>
  isRecord(value) &&
  Array.isArray(value.byBand) &&
  value.byBand.every(
    (count) => isRecord(count) && isEpcBand(count.band) && isCount(count.count),
  ) &&
  isCount(value.homes) &&
  isRecord(value.postcodes) &&
  isCount(value.postcodes.searched) &&
  isCount(value.postcodes.unanswered) &&
  isRecord(value.sales) &&
  isCount(value.sales.lookedFor) &&
  isCount(value.sales.matched) &&
  isPriceSummary(value.pricePerSquareMetre);

export const isPropertyEpc = (value: unknown): value is PropertyEpc =>
  isRecord(value) &&
  (value.status === "ok" || value.status === "unavailable") &&
  (value.statistics === null || isEpcStatistics(value.statistics));

export const isPropertyLayerResponse = (
  value: unknown,
): value is PropertyLayerResponse =>
  isRecord(value) &&
  value.layer === "property" &&
  isSourceStatus(value.status) &&
  Array.isArray(value.sources) &&
  value.sources.every(isSourceReport) &&
  Array.isArray(value.features) &&
  value.features.every(isPropertySaleFeature) &&
  (value.statistics === null || isPropertyStatistics(value.statistics)) &&
  (value.epc === null || isPropertyEpc(value.epc));
