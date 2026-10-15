import type { z } from "@hono/zod-openapi";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  isApiErrorResponse,
  isCoverageResponse,
  isHighlightsResponse,
  isModesResponse,
  isExplainEvent,
  isExplainStatusResponse,
  isExplainSubject,
  isStreetViewResponse,
  isScoresResponse,
  type ModesResponse,
  type ExplainEvent,
  type ExplainStatusResponse,
  type ExplainSubject,
  type StreetViewResponse,
  type ScoutMode,
  type Highlight,
  type HighlightsResponse,
  type LeftOutLayer,
  type CategoryId,
  type CategoryScore,
  type CategoryStatus,
  type LeftOutCategory,
  type LocationScore,
  type ScorePart,
  type ScoresResponse,
  type WeightedCategory,
  isAreaResponse,
  isGeocodeResponse,
  isHealthResponse,
  isLayerResponse,
  isLandParcelResponse,
  type ApiErrorResponse,
  type FloodZone,
  type InspireOverlap,
  type InspirePolygon,
  type LandConstraint,
  type LandFilters,
  type LandLayerResponse,
  type LandOpportunityFeature,
  type LandParcel,
  type LandParcelResponse,
  type LandSale,
  type LandSalesFound,
  type LandScope,
  type LandSort,
  type LandStatistics,
  type LandUseArea,
  type LandUseContextType,
  type NearbyLandSales,
  type NearbyPlanningApplication,
  type NearbyPlanningApplications,
  type EstimatedHousing,
  type AreaResponse,
  type Council,
  type CouncilReport,
  type CoverageResponse,
  type DatasetAttribution,
  type LandCoverageArea,
  type PreparedDataset,
  type CrimeCategoryChange,
  type CrimeCategoryCount,
  type CrimeChange,
  type CrimeFeature,
  type AmenitiesLayerResponse,
  type AmenityCount,
  type AmenityFeature,
  type AmenityStatistics,
  type AmenityType,
  type CrimeLayerResponse,
  type CrimeStatistics,
  type CrimeTrend,
  type DataPeriod,
  type GeocodeCandidate,
  type GeocodeResponse,
  type AgeGroup,
  type AgeGroupCount,
  type DemographicsLayerResponse,
  type DemographicsStatistics,
  type Deprivation,
  type HouseholdIncome,
  type Lsoa,
  type LsoaDeprivation,
  type OutputAreaFeature,
  type GreenSpaceCount,
  type GreenSpaceFeature,
  type GreenSpaceLayerResponse,
  type GreenSpaceStatistics,
  type GreenSpaceType,
  type HealthResponse,
  type LayerReport,
  type LayerResponse,
  type NearestAmenity,
  type NearestPark,
  type ConstraintShape,
  type PlanningConstraintCount,
  type PlanningConstraintFeature,
  type PlanningConstraintName,
  type PlanningConstraintType,
  type PlanningApplicationFeature,
  type PlanningApplicationStatistics,
  type PlanningApplications,
  type PlanningLayerResponse,
  type PlanningStatistics,
  type NewBuildPrices,
  type PostcodeCoverage,
  type PriceSummary,
  type AddressSale,
  type MedianPriceChange,
  type PropertyLayerResponse,
  type EpcBand,
  type EpcBandCount,
  type EpcStatistics,
  type PropertyEpc,
  type SaleEpc,
  type SaleEpcDetails,
  type SaleEpcMatch,
  type PropertySaleFeature,
  type PropertyStatistics,
  type PropertyType,
  type PropertyTypePrices,
  type Tenure,
  type TenurePrices,
  type LocalGeography,
  type Location,
  type SearchArea,
  type SearchRadiusMiles,
  type SourceReport,
  type SourceStatus,
  type NearestStation,
  type RouteShape,
  type TransportFeature,
  type TransportLayerResponse,
  type TransportFacilityCount,
  type TransportFacilityFeature,
  type TransportRouteFeature,
  type TransportRouteLength,
  type TransportStatistics,
  type TransportType,
  type NearestSchool,
  type OfstedAreaGrade,
  type OfstedGrade,
  type OfstedInspection,
  type OfstedJudgement,
  type SchoolFeature,
  type SchoolJudgementCount,
  type SchoolPhase,
  type SchoolPhaseCount,
  type SchoolStatistics,
  type SchoolsLayerResponse,
} from "@location-scout/shared";

import {
  ApiErrorResponseSchema,
  CategoryIdSchema,
  CategoryScoreSchema,
  CategoryStatusSchema,
  LeftOutCategorySchema,
  LocationScoreSchema,
  ScorePartSchema,
  ScoresResponseSchema,
  HighlightSchema,
  HighlightsResponseSchema,
  LeftOutLayerSchema,
  ModesResponseSchema,
  ExplainEventSchema,
  ExplainStatusResponseSchema,
  ExplainSubjectSchema,
  StreetViewResponseSchema,
  ScoutModeSchema,
  CouncilSchema,
  CouncilReportSchema,
  CoverageResponseSchema,
  DatasetAttributionSchema,
  LandCoverageAreaSchema,
  PreparedDatasetSchema,
  WeightedCategorySchema,
  AreaResponseSchema,
  CrimeCategoryChangeSchema,
  CrimeCategoryCountSchema,
  CrimeChangeSchema,
  CrimeFeatureSchema,
  AmenitiesLayerResponseSchema,
  AmenityCountSchema,
  AmenityFeatureSchema,
  AmenityStatisticsSchema,
  AmenityTypeSchema,
  NearestAmenitySchema,
  CrimeLayerResponseSchema,
  CrimeStatisticsSchema,
  CrimeTrendSchema,
  DataPeriodSchema,
  GeocodeCandidateSchema,
  GeocodeResponseSchema,
  HealthResponseSchema,
  LayerReportSchema,
  AgeGroupCountSchema,
  AgeGroupSchema,
  DemographicsLayerResponseSchema,
  DemographicsStatisticsSchema,
  NearestSchoolSchema,
  OfstedAreaGradeSchema,
  OfstedGradeSchema,
  OfstedInspectionSchema,
  OfstedJudgementSchema,
  SchoolFeatureSchema,
  SchoolJudgementCountSchema,
  SchoolPhaseCountSchema,
  SchoolPhaseSchema,
  SchoolStatisticsSchema,
  SchoolsLayerResponseSchema,
  DeprivationSchema,
  HouseholdIncomeSchema,
  LsoaDeprivationSchema,
  LsoaSchema,
  OutputAreaFeatureSchema,
  GreenSpaceCountSchema,
  GreenSpaceFeatureSchema,
  GreenSpaceLayerResponseSchema,
  GreenSpaceStatisticsSchema,
  GreenSpaceTypeSchema,
  LayerResponseSchema,
  FloodZoneSchema,
  InspireOverlapSchema,
  InspirePolygonSchema,
  LandConstraintSchema,
  LandFiltersSchema,
  LandLayerResponseSchema,
  LandOpportunityFeatureSchema,
  LandParcelResponseSchema,
  LandParcelSchema,
  LandSaleSchema,
  LandSalesFoundSchema,
  LandScopeSchema,
  LandSortSchema,
  LandStatisticsSchema,
  LandUseAreaSchema,
  LandUseContextTypeSchema,
  NearbyLandSalesSchema,
  NearbyPlanningApplicationSchema,
  NearbyPlanningApplicationsSchema,
  EstimatedHousingSchema,
  NearestParkSchema,
  ConstraintShapeSchema,
  PlanningConstraintCountSchema,
  PlanningConstraintFeatureSchema,
  PlanningConstraintNameSchema,
  PlanningConstraintTypeSchema,
  PlanningApplicationFeatureSchema,
  PlanningApplicationStatisticsSchema,
  PlanningApplicationsSchema,
  PlanningLayerResponseSchema,
  PlanningStatisticsSchema,
  NewBuildPricesSchema,
  PostcodeCoverageSchema,
  PriceSummarySchema,
  AddressSaleSchema,
  MedianPriceChangeSchema,
  PropertyLayerResponseSchema,
  EpcBandCountSchema,
  EpcBandSchema,
  EpcStatisticsSchema,
  PropertyEpcSchema,
  SaleEpcDetailsSchema,
  SaleEpcMatchSchema,
  SaleEpcSchema,
  PropertySaleFeatureSchema,
  PropertyStatisticsSchema,
  PropertyTypePricesSchema,
  PropertyTypeSchema,
  TenurePricesSchema,
  TenureSchema,
  LocalGeographySchema,
  LocationSchema,
  SearchAreaSchema,
  SearchRadiusMilesSchema,
  SourceReportSchema,
  SourceStatusSchema,
  NearestStationSchema,
  RouteShapeSchema,
  TransportFeatureSchema,
  TransportLayerResponseSchema,
  TransportFacilityCountSchema,
  TransportFacilityFeatureSchema,
  TransportRouteFeatureSchema,
  TransportRouteLengthSchema,
  TransportStatisticsSchema,
  TransportTypeSchema,
} from "./api-schemas";

// `pnpm typecheck` checks these: each schema describes exactly its shared type.
expectTypeOf<
  z.output<typeof ApiErrorResponseSchema>
>().toEqualTypeOf<ApiErrorResponse>();
expectTypeOf<
  z.output<typeof HealthResponseSchema>
>().toEqualTypeOf<HealthResponse>();
expectTypeOf<z.output<typeof LocationSchema>>().toEqualTypeOf<Location>();
expectTypeOf<
  z.output<typeof GeocodeCandidateSchema>
>().toEqualTypeOf<GeocodeCandidate>();
expectTypeOf<
  z.output<typeof GeocodeResponseSchema>
>().toEqualTypeOf<GeocodeResponse>();
expectTypeOf<
  z.output<typeof SearchRadiusMilesSchema>
>().toEqualTypeOf<SearchRadiusMiles>();
expectTypeOf<z.output<typeof SearchAreaSchema>>().toEqualTypeOf<SearchArea>();
expectTypeOf<
  z.output<typeof SourceStatusSchema>
>().toEqualTypeOf<SourceStatus>();
expectTypeOf<z.output<typeof DataPeriodSchema>>().toEqualTypeOf<DataPeriod>();
expectTypeOf<
  z.output<typeof SourceReportSchema>
>().toEqualTypeOf<SourceReport>();
expectTypeOf<z.output<typeof LayerReportSchema>>().toEqualTypeOf<LayerReport>();
expectTypeOf<
  z.output<typeof LocalGeographySchema>
>().toEqualTypeOf<LocalGeography>();
expectTypeOf<
  z.output<typeof AreaResponseSchema>
>().toEqualTypeOf<AreaResponse>();
expectTypeOf<
  z.output<typeof CrimeFeatureSchema>
>().toEqualTypeOf<CrimeFeature>();
expectTypeOf<
  z.output<typeof CrimeCategoryCountSchema>
>().toEqualTypeOf<CrimeCategoryCount>();
expectTypeOf<z.output<typeof CrimeChangeSchema>>().toEqualTypeOf<CrimeChange>();
expectTypeOf<
  z.output<typeof CrimeCategoryChangeSchema>
>().toEqualTypeOf<CrimeCategoryChange>();
expectTypeOf<z.output<typeof CrimeTrendSchema>>().toEqualTypeOf<CrimeTrend>();
expectTypeOf<
  z.output<typeof CrimeStatisticsSchema>
>().toEqualTypeOf<CrimeStatistics>();
expectTypeOf<
  z.output<typeof CrimeLayerResponseSchema>
>().toEqualTypeOf<CrimeLayerResponse>();
expectTypeOf<
  z.output<typeof PlanningConstraintTypeSchema>
>().toEqualTypeOf<PlanningConstraintType>();
expectTypeOf<
  z.output<typeof ConstraintShapeSchema>
>().toEqualTypeOf<ConstraintShape>();
expectTypeOf<
  z.output<typeof PlanningConstraintFeatureSchema>
>().toEqualTypeOf<PlanningConstraintFeature>();
expectTypeOf<
  z.output<typeof PlanningConstraintCountSchema>
>().toEqualTypeOf<PlanningConstraintCount>();
expectTypeOf<
  z.output<typeof PlanningConstraintNameSchema>
>().toEqualTypeOf<PlanningConstraintName>();
expectTypeOf<
  z.output<typeof PlanningStatisticsSchema>
>().toEqualTypeOf<PlanningStatistics>();
expectTypeOf<
  z.output<typeof PlanningApplicationFeatureSchema>
>().toEqualTypeOf<PlanningApplicationFeature>();
expectTypeOf<
  z.output<typeof EstimatedHousingSchema>
>().toEqualTypeOf<EstimatedHousing>();
expectTypeOf<
  z.output<typeof PlanningApplicationStatisticsSchema>
>().toEqualTypeOf<PlanningApplicationStatistics>();
expectTypeOf<
  z.output<typeof PlanningApplicationsSchema>
>().toEqualTypeOf<PlanningApplications>();
expectTypeOf<
  z.output<typeof PlanningLayerResponseSchema>
>().toEqualTypeOf<PlanningLayerResponse>();
expectTypeOf<z.output<typeof AmenityTypeSchema>>().toEqualTypeOf<AmenityType>();
expectTypeOf<
  z.output<typeof AmenityFeatureSchema>
>().toEqualTypeOf<AmenityFeature>();
expectTypeOf<
  z.output<typeof NearestAmenitySchema>
>().toEqualTypeOf<NearestAmenity>();
expectTypeOf<
  z.output<typeof AmenityCountSchema>
>().toEqualTypeOf<AmenityCount>();
expectTypeOf<
  z.output<typeof AmenityStatisticsSchema>
>().toEqualTypeOf<AmenityStatistics>();
expectTypeOf<
  z.output<typeof AmenitiesLayerResponseSchema>
>().toEqualTypeOf<AmenitiesLayerResponse>();
expectTypeOf<
  z.output<typeof TransportTypeSchema>
>().toEqualTypeOf<TransportType>();
expectTypeOf<z.output<typeof RouteShapeSchema>>().toEqualTypeOf<RouteShape>();
expectTypeOf<
  z.output<typeof TransportFacilityFeatureSchema>
>().toEqualTypeOf<TransportFacilityFeature>();
expectTypeOf<
  z.output<typeof TransportRouteFeatureSchema>
>().toEqualTypeOf<TransportRouteFeature>();
expectTypeOf<
  z.output<typeof TransportFeatureSchema>
>().toEqualTypeOf<TransportFeature>();
expectTypeOf<
  z.output<typeof TransportFacilityCountSchema>
>().toEqualTypeOf<TransportFacilityCount>();
expectTypeOf<
  z.output<typeof TransportRouteLengthSchema>
>().toEqualTypeOf<TransportRouteLength>();
expectTypeOf<
  z.output<typeof NearestStationSchema>
>().toEqualTypeOf<NearestStation>();
expectTypeOf<
  z.output<typeof TransportStatisticsSchema>
>().toEqualTypeOf<TransportStatistics>();
expectTypeOf<
  z.output<typeof TransportLayerResponseSchema>
>().toEqualTypeOf<TransportLayerResponse>();
expectTypeOf<
  z.output<typeof GreenSpaceTypeSchema>
>().toEqualTypeOf<GreenSpaceType>();
expectTypeOf<
  z.output<typeof GreenSpaceFeatureSchema>
>().toEqualTypeOf<GreenSpaceFeature>();
expectTypeOf<
  z.output<typeof GreenSpaceCountSchema>
>().toEqualTypeOf<GreenSpaceCount>();
expectTypeOf<z.output<typeof NearestParkSchema>>().toEqualTypeOf<NearestPark>();
expectTypeOf<
  z.output<typeof GreenSpaceStatisticsSchema>
>().toEqualTypeOf<GreenSpaceStatistics>();
expectTypeOf<
  z.output<typeof GreenSpaceLayerResponseSchema>
>().toEqualTypeOf<GreenSpaceLayerResponse>();
expectTypeOf<
  z.output<typeof PropertyTypeSchema>
>().toEqualTypeOf<PropertyType>();
expectTypeOf<z.output<typeof TenureSchema>>().toEqualTypeOf<Tenure>();
expectTypeOf<z.output<typeof AddressSaleSchema>>().toEqualTypeOf<AddressSale>();
expectTypeOf<
  z.output<typeof PropertySaleFeatureSchema>
>().toEqualTypeOf<PropertySaleFeature>();
expectTypeOf<
  z.output<typeof PriceSummarySchema>
>().toEqualTypeOf<PriceSummary>();
expectTypeOf<
  z.output<typeof PropertyTypePricesSchema>
>().toEqualTypeOf<PropertyTypePrices>();
expectTypeOf<
  z.output<typeof TenurePricesSchema>
>().toEqualTypeOf<TenurePrices>();
expectTypeOf<
  z.output<typeof NewBuildPricesSchema>
>().toEqualTypeOf<NewBuildPrices>();
expectTypeOf<
  z.output<typeof MedianPriceChangeSchema>
>().toEqualTypeOf<MedianPriceChange>();
expectTypeOf<
  z.output<typeof PostcodeCoverageSchema>
>().toEqualTypeOf<PostcodeCoverage>();
expectTypeOf<
  z.output<typeof PropertyStatisticsSchema>
>().toEqualTypeOf<PropertyStatistics>();
expectTypeOf<z.output<typeof EpcBandSchema>>().toEqualTypeOf<EpcBand>();
expectTypeOf<
  z.output<typeof SaleEpcDetailsSchema>
>().toEqualTypeOf<SaleEpcDetails>();
expectTypeOf<z.output<typeof SaleEpcSchema>>().toEqualTypeOf<SaleEpc>();
expectTypeOf<
  z.output<typeof SaleEpcMatchSchema>
>().toEqualTypeOf<SaleEpcMatch>();
expectTypeOf<
  z.output<typeof EpcBandCountSchema>
>().toEqualTypeOf<EpcBandCount>();
expectTypeOf<
  z.output<typeof EpcStatisticsSchema>
>().toEqualTypeOf<EpcStatistics>();
expectTypeOf<z.output<typeof PropertyEpcSchema>>().toEqualTypeOf<PropertyEpc>();
expectTypeOf<
  z.output<typeof PropertyLayerResponseSchema>
>().toEqualTypeOf<PropertyLayerResponse>();
expectTypeOf<z.output<typeof AgeGroupSchema>>().toEqualTypeOf<AgeGroup>();
expectTypeOf<z.output<typeof LsoaSchema>>().toEqualTypeOf<Lsoa>();
expectTypeOf<
  z.output<typeof OutputAreaFeatureSchema>
>().toEqualTypeOf<OutputAreaFeature>();
expectTypeOf<
  z.output<typeof AgeGroupCountSchema>
>().toEqualTypeOf<AgeGroupCount>();
expectTypeOf<
  z.output<typeof HouseholdIncomeSchema>
>().toEqualTypeOf<HouseholdIncome>();
expectTypeOf<
  z.output<typeof LsoaDeprivationSchema>
>().toEqualTypeOf<LsoaDeprivation>();
expectTypeOf<z.output<typeof DeprivationSchema>>().toEqualTypeOf<Deprivation>();
expectTypeOf<
  z.output<typeof DemographicsStatisticsSchema>
>().toEqualTypeOf<DemographicsStatistics>();
expectTypeOf<
  z.output<typeof DemographicsLayerResponseSchema>
>().toEqualTypeOf<DemographicsLayerResponse>();
expectTypeOf<z.output<typeof SchoolPhaseSchema>>().toEqualTypeOf<SchoolPhase>();
expectTypeOf<
  z.output<typeof OfstedJudgementSchema>
>().toEqualTypeOf<OfstedJudgement>();
expectTypeOf<z.output<typeof OfstedGradeSchema>>().toEqualTypeOf<OfstedGrade>();
expectTypeOf<
  z.output<typeof OfstedAreaGradeSchema>
>().toEqualTypeOf<OfstedAreaGrade>();
expectTypeOf<
  z.output<typeof OfstedInspectionSchema>
>().toEqualTypeOf<OfstedInspection>();
expectTypeOf<
  z.output<typeof SchoolFeatureSchema>
>().toEqualTypeOf<SchoolFeature>();
expectTypeOf<
  z.output<typeof SchoolJudgementCountSchema>
>().toEqualTypeOf<SchoolJudgementCount>();
expectTypeOf<
  z.output<typeof SchoolPhaseCountSchema>
>().toEqualTypeOf<SchoolPhaseCount>();
expectTypeOf<
  z.output<typeof NearestSchoolSchema>
>().toEqualTypeOf<NearestSchool>();
expectTypeOf<
  z.output<typeof SchoolStatisticsSchema>
>().toEqualTypeOf<SchoolStatistics>();
expectTypeOf<
  z.output<typeof SchoolsLayerResponseSchema>
>().toEqualTypeOf<SchoolsLayerResponse>();
expectTypeOf<
  z.output<typeof InspireOverlapSchema>
>().toEqualTypeOf<InspireOverlap>();
expectTypeOf<
  z.output<typeof LandConstraintSchema>
>().toEqualTypeOf<LandConstraint>();
expectTypeOf<z.output<typeof LandParcelSchema>>().toEqualTypeOf<LandParcel>();
expectTypeOf<z.output<typeof LandSaleSchema>>().toEqualTypeOf<LandSale>();
expectTypeOf<
  z.output<typeof LandSalesFoundSchema>
>().toEqualTypeOf<LandSalesFound>();
expectTypeOf<
  z.output<typeof NearbyLandSalesSchema>
>().toEqualTypeOf<NearbyLandSales>();
expectTypeOf<
  z.output<typeof NearbyPlanningApplicationSchema>
>().toEqualTypeOf<NearbyPlanningApplication>();
expectTypeOf<
  z.output<typeof NearbyPlanningApplicationsSchema>
>().toEqualTypeOf<NearbyPlanningApplications>();
expectTypeOf<
  z.output<typeof LandOpportunityFeatureSchema>
>().toEqualTypeOf<LandOpportunityFeature>();
expectTypeOf<
  z.output<typeof LandUseContextTypeSchema>
>().toEqualTypeOf<LandUseContextType>();
expectTypeOf<z.output<typeof LandUseAreaSchema>>().toEqualTypeOf<LandUseArea>();
expectTypeOf<z.output<typeof LandScopeSchema>>().toEqualTypeOf<LandScope>();
expectTypeOf<z.output<typeof LandSortSchema>>().toEqualTypeOf<LandSort>();
expectTypeOf<z.output<typeof FloodZoneSchema>>().toEqualTypeOf<FloodZone>();
expectTypeOf<z.output<typeof LandFiltersSchema>>().toEqualTypeOf<LandFilters>();
expectTypeOf<
  z.output<typeof LandStatisticsSchema>
>().toEqualTypeOf<LandStatistics>();
expectTypeOf<
  z.output<typeof LandLayerResponseSchema>
>().toEqualTypeOf<LandLayerResponse>();
expectTypeOf<
  z.output<typeof InspirePolygonSchema>
>().toEqualTypeOf<InspirePolygon>();
expectTypeOf<
  z.output<typeof LandParcelResponseSchema>
>().toEqualTypeOf<LandParcelResponse>();
expectTypeOf<
  z.output<typeof LayerResponseSchema>
>().toEqualTypeOf<LayerResponse>();
expectTypeOf<z.output<typeof CategoryIdSchema>>().toEqualTypeOf<CategoryId>();
expectTypeOf<z.output<typeof ScorePartSchema>>().toEqualTypeOf<ScorePart>();
expectTypeOf<
  z.output<typeof CategoryStatusSchema>
>().toEqualTypeOf<CategoryStatus>();
expectTypeOf<
  z.output<typeof CategoryScoreSchema>
>().toEqualTypeOf<CategoryScore>();
expectTypeOf<
  z.output<typeof WeightedCategorySchema>
>().toEqualTypeOf<WeightedCategory>();
expectTypeOf<
  z.output<typeof LeftOutCategorySchema>
>().toEqualTypeOf<LeftOutCategory>();
expectTypeOf<
  z.output<typeof LocationScoreSchema>
>().toEqualTypeOf<LocationScore>();
expectTypeOf<
  z.output<typeof ScoresResponseSchema>
>().toEqualTypeOf<ScoresResponse>();
expectTypeOf<z.output<typeof HighlightSchema>>().toEqualTypeOf<Highlight>();
expectTypeOf<
  z.output<typeof LeftOutLayerSchema>
>().toEqualTypeOf<LeftOutLayer>();
expectTypeOf<
  z.output<typeof HighlightsResponseSchema>
>().toEqualTypeOf<HighlightsResponse>();
expectTypeOf<z.output<typeof ScoutModeSchema>>().toEqualTypeOf<ScoutMode>();
expectTypeOf<
  z.output<typeof ModesResponseSchema>
>().toEqualTypeOf<ModesResponse>();
expectTypeOf<
  z.output<typeof StreetViewResponseSchema>
>().toEqualTypeOf<StreetViewResponse>();
expectTypeOf<
  z.output<typeof ExplainStatusResponseSchema>
>().toEqualTypeOf<ExplainStatusResponse>();
expectTypeOf<
  z.output<typeof ExplainSubjectSchema>
>().toEqualTypeOf<ExplainSubject>();
expectTypeOf<
  z.output<typeof ExplainEventSchema>
>().toEqualTypeOf<ExplainEvent>();
expectTypeOf<z.output<typeof CouncilSchema>>().toEqualTypeOf<Council>();
expectTypeOf<
  z.output<typeof CouncilReportSchema>
>().toEqualTypeOf<CouncilReport>();
expectTypeOf<
  z.output<typeof DatasetAttributionSchema>
>().toEqualTypeOf<DatasetAttribution>();
expectTypeOf<
  z.output<typeof PreparedDatasetSchema>
>().toEqualTypeOf<PreparedDataset>();
expectTypeOf<
  z.output<typeof LandCoverageAreaSchema>
>().toEqualTypeOf<LandCoverageArea>();
expectTypeOf<
  z.output<typeof CoverageResponseSchema>
>().toEqualTypeOf<CoverageResponse>();

const location = { lat: 53.123664, lng: -1.264078 };

const shape = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-1.27, 53.12],
        [-1.26, 53.12],
        [-1.26, 53.13],
        [-1.27, 53.12],
      ],
    ],
  ],
};
const conservationArea = {
  id: "44005909",
  location,
  distanceMetres: 0,
  type: "conservation-area",
  name: "Sutton in Ashfield Church and Market Place",
  grade: null,
  coversLocation: true,
  shape,
};
const listedBuilding = {
  id: "31691403",
  location: { lat: 53.124777, lng: -1.26524 },
  distanceMetres: 146,
  type: "listed-building",
  name: "HUNTER'S BAR",
  grade: "II",
  coversLocation: false,
  shape: null,
};
const planningStatistics = {
  byType: [
    { type: "conservation-area", count: 1, coversLocation: true },
    { type: "listed-building", count: 1, coversLocation: false },
  ],
  coveringLocation: [
    {
      type: "conservation-area",
      name: "Sutton in Ashfield Church and Market Place",
    },
  ],
};
const application = {
  id: "Ashfield/V/2025/0425",
  location: { lat: 53.12434, lng: -1.26446 },
  distanceMetres: 77,
  reference: "V/2025/0425",
  authority: "Ashfield",
  description:
    "Demolition of existing commercial building and construction of a 3 storey apartment block",
  address: "71 High Pavement, Sutton In Ashfield, Nottinghamshire, NG17 1BU",
  postcode: "NG17 1BU",
  status: "pending",
  applicationType: "major",
  councilType: "Major Full",
  receivedOn: "2025-07-21",
  decidedOn: null,
  approximate: true,
  url: null,
  providerUrl: "https://www.planit.org.uk/planapplic/Ashfield/V/2025/0425/",
  estimatedHomes: null,
  impact: "Potential impact, estimated: no new homes in its description.",
};
const housing = {
  approved: 41,
  pending: 9,
  homes: 50,
  residents: 120,
  applications: 16,
  unstated: 2,
};
const applications = {
  status: "ok",
  provider: {
    id: "planit",
    name: "PlanIt",
    url: "https://www.planit.org.uk/",
    note: "Planning Applications come from PlanIt.",
  },
  period: { from: "2023-10-09", to: "2026-10-08" },
  features: [application],
  statistics: {
    count: 1,
    total: 1,
    approximate: 1,
    byStatus: [
      { status: "pending", count: 1 },
      { status: "approved", count: 0 },
    ],
    byType: [{ type: "major", count: 1 }],
    major: [application.id],
    housing,
  },
};
const planningLayer = {
  layer: "planning",
  status: "ok",
  sources: [
    {
      id: "planning-data",
      name: "planning.data.gov.uk",
      status: "ok",
      period: null,
    },
    {
      id: "planit",
      name: "PlanIt",
      status: "ok",
      period: { from: "2023-10-09", to: "2026-10-08" },
    },
  ],
  features: [conservationArea, listedBuilding],
  statistics: planningStatistics,
  applications,
};

const cafe = {
  id: "way/251921972",
  location: { lat: 53.124, lng: -1.2649 },
  distanceMetres: 110,
  type: "cafe",
  name: "Costa",
  osmTag: "amenity=cafe",
};
const unnamedOffice = {
  id: "node/1",
  location,
  distanceMetres: 0,
  type: "office",
  name: null,
  osmTag: "office=company",
};
const amenityStatistics = {
  total: 2,
  byType: [
    {
      type: "cafe",
      count: 1,
      nearest: { id: cafe.id, name: "Costa", distanceMetres: 110 },
    },
    {
      type: "office",
      count: 1,
      nearest: { id: "node/1", name: null, distanceMetres: 0 },
    },
    { type: "pub", count: 0, nearest: null },
  ],
};
const amenitiesLayer = {
  layer: "amenities",
  status: "ok",
  sources: [
    {
      id: "overpass",
      name: "Overpass API",
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    },
  ],
  features: [cafe, unnamedOffice],
  statistics: amenityStatistics,
};

const busStop = {
  id: "node/502386902",
  location: { lat: 53.1251, lng: -1.2624 },
  distanceMetres: 184,
  type: "bus-stop",
  name: "Silk Street",
  osmTag: "highway=bus_stop",
  shape: null,
  lengthMetres: null,
};
const footpaths = {
  id: "footpath",
  location: { lat: 53.1232889, lng: -1.263982 },
  distanceMetres: 42,
  type: "footpath",
  name: null,
  osmTag: null,
  shape: {
    type: "MultiLineString",
    coordinates: [
      [
        [-1.263982, 53.1232889],
        [-1.2641, 53.1236],
      ],
    ],
  },
  lengthMetres: 37,
};
const transportStatistics = {
  facilities: [
    { type: "railway-station", count: 0 },
    { type: "bus-stop", count: 1 },
  ],
  routes: [
    { type: "footpath", lengthMetres: 37 },
    { type: "cycle-route", lengthMetres: 0 },
  ],
  nearestStation: {
    id: "node/3170173970",
    name: "Sutton Parkway",
    distanceMetres: 1628,
    inSearchArea: false,
  },
  stationSearchMetres: 5000,
};
const transportLayer = {
  layer: "transport",
  status: "ok",
  sources: amenitiesLayer.sources,
  features: [busStop, footpaths],
  statistics: transportStatistics,
};

const park = {
  id: "way/309700889",
  location: { lat: 53.1251, lng: -1.2566 },
  distanceMetres: 524,
  type: "park",
  name: "Sutton Lawn",
  osmTag: "leisure=park",
  coversLocation: false,
  shape,
};
const playground = {
  id: "node/1",
  location,
  distanceMetres: 0,
  type: "playground",
  name: null,
  osmTag: "leisure=playground",
  coversLocation: false,
  shape: null,
};
const greenSpaceStatistics = {
  total: 2,
  byType: [
    { type: "park", count: 1 },
    { type: "playground", count: 1 },
  ],
  nearestPark: {
    id: park.id,
    name: "Sutton Lawn",
    distanceMetres: 524,
    inSearchArea: true,
    coversLocation: false,
  },
  parkSearchMetres: 2000,
};
const greenSpaceLayer = {
  layer: "green-space",
  status: "ok",
  sources: amenitiesLayer.sources,
  features: [park, playground],
  statistics: greenSpaceStatistics,
};

const reportCard = {
  kind: "report-card",
  inspectedOn: "2026-04-21",
  grades: [
    { area: "Inclusion", grade: "expected-standard" },
    { area: "Achievement", grade: "needs-attention" },
  ],
  safeguardingMet: true,
  outcome: null,
  ofPredecessor: false,
};
const school = {
  id: "139063",
  location: { lat: 53.123786, lng: -1.260611 },
  distanceMetres: 230,
  name: "Sutton Community Academy",
  phase: "secondary",
  establishmentType: "Academy sponsor led",
  ages: { from: 11, to: 16 },
  judgement: "report-card",
  inspection: reportCard,
  inspectorate: null,
};
const schoolsByJudgement = (judgement: string) =>
  ["good", "report-card", "none"].map((each) => ({
    judgement: each,
    count: each === judgement ? 1 : 0,
  }));
const schoolStatistics = {
  total: 1,
  byPhase: [
    {
      phase: "secondary",
      count: 1,
      byJudgement: schoolsByJudgement("report-card"),
    },
  ],
  byJudgement: schoolsByJudgement("report-card"),
  nearestPrimary: null,
  primarySearchMetres: 2400,
  nearestSecondary: {
    id: school.id,
    name: school.name,
    phase: "secondary",
    distanceMetres: 230,
    inSearchArea: true,
    judgement: "report-card",
    inspection: reportCard,
  },
  secondarySearchMetres: 6000,
};
const schoolsLayer = {
  layer: "schools",
  status: "ok",
  sources: [
    {
      id: "gias",
      name: "Get Information about Schools",
      status: "ok",
      period: { from: "2026-10-09", to: "2026-10-09" },
    },
  ],
  features: [school],
  statistics: schoolStatistics,
};

const outputArea = {
  id: "E00142547",
  location: { lat: 53.123181, lng: -1.265629 },
  distanceMetres: 117,
  lsoa: { code: "E01027976", name: "Ashfield 005E" },
  msoaCode: "E02005823",
  population: 239,
  households: 140,
  populationDensity: 2725.2,
  medianAge: 49.5,
  householdIncome: 33525,
  deprivationDecile: 2,
  overlap: 1,
  coversLocation: true,
  shape: conservationArea.shape,
};
const demographicsStatistics = {
  outputAreas: 44,
  population: 9052,
  households: 3951,
  ageProfile: [
    { group: "under-15", population: 1649, percent: 18.3 },
    { group: "15-to-24", population: 1038, percent: 11.5 },
    { group: "25-to-44", population: 2327, percent: 25.8 },
    { group: "45-to-64", population: 2247, percent: 24.9 },
    { group: "65-and-over", population: 1773, percent: 19.6 },
  ],
  medianAge: 40.1,
  householdIncome: {
    averagePounds: 38890,
    msoas: 5,
    englandMedianPounds: 44091,
  },
  deprivation: {
    atLocation: {
      code: "E01027976",
      name: "Ashfield 005E",
      decile: 2,
      rank: 4630,
    },
    lowestDecile: 1,
    highestDecile: 10,
    lsoas: 14,
  },
};
const demographicsLayer = {
  layer: "demographics",
  status: "ok",
  sources: [
    {
      id: "ons-census-2021",
      name: "ONS Census 2021",
      status: "ok",
      period: { from: "2021-03-21", to: "2021-03-21" },
    },
  ],
  features: [outputArea],
  statistics: demographicsStatistics,
};

const sale = {
  id: "5A7B802C-F597-1886-E063-4704A8C021AE",
  location: { lat: 53.122394, lng: -1.263681 },
  distanceMetres: 144,
  price: 173000,
  date: "2026-05-29",
  type: "detached",
  tenure: "freehold",
  newBuild: false,
  address: "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
  postcode: "NG17 1BT",
  history: [
    {
      id: "5A7B802C-F597-1886-E063-4704A8C021AE",
      price: 173000,
      date: "2026-05-29",
      change: -5.7,
    },
    {
      id: "44F406B6-B93C-1095-E063-4704A8C048D4",
      price: 183500,
      date: "2024-10-06",
      change: null,
    },
  ],
  epc: {
    status: "matched",
    certificate: {
      certificateNumber: "9901-0000-0000-0000-0001",
      registrationDate: "2019-03-14",
      currentBand: "D",
      details: {
        potentialBand: "B",
        floorAreaSquareMetres: 92,
        pricePerSquareMetre: 1880,
      },
    },
  },
};
const noSales = { count: 0, median: null, mean: null };
const oneSale = { count: 1, median: 173000, mean: 173000 };
const propertyStatistics = {
  period: { from: "2025-10-09", to: "2026-10-08" },
  all: oneSale,
  byType: [
    { type: "detached", ...oneSale },
    { type: "flat", ...noSales },
  ],
  byTenure: [
    { tenure: "freehold", ...oneSale },
    { tenure: "leasehold", ...noSales },
  ],
  byNewBuild: [
    { newBuild: true, ...noSales },
    { newBuild: false, ...oneSale },
  ],
  medianChange: {
    twelveMonths: {
      period: { from: "2024-10-09", to: "2025-10-08" },
      prices: { count: 3, median: 161500, mean: 160000 },
      change: 7.1,
    },
    fiveYears: {
      period: { from: "2020-10-09", to: "2021-10-08" },
      prices: noSales,
      change: null,
    },
  },
  postcodes: { searched: 100, limit: 100, truncated: true, reachMetres: 430 },
};
const propertyLayer = {
  layer: "property",
  status: "ok",
  sources: [
    { id: "postcodes-io", name: "postcodes.io", status: "ok", period: null },
    {
      id: "land-registry",
      name: "HM Land Registry Price Paid",
      status: "ok",
      period: { from: "2025-10-09", to: "2026-10-08" },
    },
  ],
  features: [sale],
  statistics: propertyStatistics,
  epc: {
    status: "ok",
    statistics: {
      byBand: ["A", "B", "C", "D", "E", "F", "G"].map((band) => ({
        band,
        count: band === "D" ? 1 : 0,
      })),
      homes: 1,
      postcodes: { searched: 100, unanswered: 0 },
      sales: { lookedFor: 1, matched: 1 },
      pricePerSquareMetre: { count: 1, median: 1880, mean: 1880 },
    },
  },
};

const geography = {
  postcode: "NG17 1AA",
  ward: "Sutton Central & New Cross",
  lsoa: "Ashfield 005E",
  msoa: "Ashfield 005",
  localAuthority: "Ashfield",
  parliamentaryConstituency: "Ashfield",
};
const council = {
  status: "ok",
  council: { code: "E07000170", name: "Ashfield" },
  inLandCoverageArea: true,
};
const searchArea = {
  location,
  searchRadius: { miles: 0.5, metres: 804.672 },
  geography,
  council,
};

const preparedDataset = {
  id: "council-boundaries",
  name: "Council boundaries",
  source: "ONS Open Geography",
  sourceUrl:
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_May_2026_Boundaries_UK_BGC/FeatureServer/0",
  sourceDate: "2026-05",
  preparedAt: "2026-10-08T12:00:00.000Z",
  attribution: null,
};
const inspireDataset = {
  ...preparedDataset,
  id: "inspire-index-polygons",
  name: "INSPIRE Index Polygons",
  source: "HM Land Registry",
  sourceUrl:
    "https://use-land-property-data.service.gov.uk/datasets/inspire/download/Ashfield_District_Council.zip",
  sourceDate: "2026-10-04",
  attribution: {
    statements: [
      "This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry.",
      "The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063.",
    ],
    conditionsUrl:
      "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
  },
};
const coverage = {
  status: "ok",
  preparedAt: "2026-10-08T12:00:00.000Z",
  datasets: [preparedDataset],
  landCoverageAreas: [
    {
      council: council.council,
      datasets: [
        {
          ...preparedDataset,
          id: "council-boundary",
          name: "Council boundary",
        },
        inspireDataset,
      ],
      outOfDate: false,
    },
  ],
};

const crime = {
  id: "137366010",
  location: { lat: 53.123398, lng: -1.273124 },
  distanceMetres: 604,
  category: "anti-social-behaviour",
  categoryName: "Anti-social behaviour",
  month: "2026-08",
  street: "On or near Petrol Station",
};
const trend = {
  last12Months: { from: "2025-09", to: "2026-08" },
  previous12Months: { from: "2024-09", to: "2025-08" },
  complete: true,
  missingMonths: [],
  total: { last12Months: 12, previous12Months: 16, change: -25 },
  byCategory: [
    {
      category: "anti-social-behaviour",
      name: "Anti-social behaviour",
      last12Months: 12,
      previous12Months: 16,
      change: -25,
    },
  ],
};
const statistics = {
  month: "2026-08",
  total: 1,
  byCategory: [
    {
      category: "anti-social-behaviour",
      name: "Anti-social behaviour",
      count: 1,
    },
  ],
  trend,
};
const police = {
  id: "police",
  name: "data.police.uk",
  status: "ok",
  period: { from: "2026-08", to: "2026-08" },
};
const crimeLayer = {
  layer: "crime",
  status: "ok",
  sources: [police],
  features: [crime],
  statistics,
};

/** Bodies that a schema and its shared type guard must judge alike. */
interface Case {
  name: string;
  schema: z.ZodType;
  guard: (value: unknown) => boolean;
  accepted: unknown[];
  rejected: unknown[];
}

const stationPart = {
  input: "Distance to the nearest railway station",
  value: 1628,
  unit: "m",
  rule: "800 m or less: 60 points, falling in proportion to 0 at 5 km or more.",
  points: 48.2,
};
const transportScore = {
  id: "transport",
  layer: "transport",
  status: "ok",
  score: 88,
  breakdown: [
    stationPart,
    {
      input: "Bus stops in the Search Area",
      value: 58,
      unit: null,
      rule: "4 points each, up to 10 stops: 40 points.",
      points: 40,
    },
  ],
};
const unavailableSafety = {
  id: "safety",
  layer: "crime",
  status: "unavailable",
  score: null,
  breakdown: [],
};
const scores = {
  mode: "general",
  categories: [unavailableSafety, transportScore],
  location: {
    score: 88,
    counted: [
      { id: "transport", score: 88, weight: 15, share: 100, points: 88 },
    ],
    leftOut: [
      { id: "safety", layer: "crime", status: "unavailable", weight: 25 },
    ],
  },
};
const crimeRising = {
  rule: "crime-rising",
  level: "watch",
  text: "Crime up 5.9% year on year",
  layer: "crime",
};
const highlights = {
  mode: "general",
  highlights: [
    {
      rule: "crime-rate-high",
      level: "concern",
      text: "High crime: 995 crimes a year per km²",
      layer: "crime",
    },
    crimeRising,
  ],
  leftOut: [{ layer: "planning", status: "unavailable" }],
};
const weights = {
  safety: 10,
  amenities: 10,
  schools: 5,
  transport: 15,
  "green-space": 5,
  "property-activity": 25,
  "development-activity": 25,
  "planning-freedom": 5,
  demand: 0,
  competition: 0,
  footfall: 0,
};
const investment = {
  id: "investment",
  name: "Investment",
  question: "Should I invest in property here?",
  weights,
  competitors: null,
  highlightedLayers: ["planning", "property"],
  highlights: ["crime-rate-high", "prices-rising"],
};
const cafeMode = {
  ...investment,
  id: "business-cafe",
  name: "Business: Café",
  question: "Could I open a café here?",
  weights: { ...weights, demand: 20, competition: 25, footfall: 20 },
  competitors: { name: "cafés", tags: [{ key: "amenity", values: ["cafe"] }] },
  highlightedLayers: ["amenities"],
};

const modes = {
  modes: [
    { ...investment, id: "general", name: "General", highlightedLayers: [] },
    investment,
    cafeMode,
  ],
};

const ASHFIELD = { code: "E07000170", name: "Ashfield" };
const landParcel = {
  id: "E07000170-2",
  location: { lat: 53.1146, lng: -1.2384 },
  council: ASHFIELD,
  name: null,
  landUse: ["landuse=farmland"],
  areaHectares: 19.522,
  areaAcres: 48.241,
  roadDistanceMetres: 7,
  inspireCoverage: 0.727,
  possiblyUnregistered: false,
  inspirePolygons: [
    {
      inspireId: "64151457",
      share: 0.724,
      ownershipCategory: "other-registered",
    },
  ],
  ownershipCategory: "other-registered",
  matchedTitles: [
    {
      titleNumber: "ZZ200001",
      propertyAddress: "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE)",
      proprietorshipCategory: "Limited Company or Public Limited Company",
      ownershipCategory: "company",
      dataset: "ocod",
      sourceDate: "2026-10-02",
      matchedBy: "named",
      inspireId: "25709295",
      distanceMetres: 9,
    },
  ],
  constraints: [{ type: "flood-zone", name: "Flood zone 2" }],
  floodZone: 2,
  onListedBuildingOutline: false,
  estimatedHomes: 351,
  shape: conservationArea.shape,
};
const nearbyLandSales = {
  status: "ok",
  period: { from: "2021-10-09", to: "2026-10-08" },
  found: {
    count: 76,
    medianPrice: 207000,
    sales: [
      {
        id: "E073986C-2D52-2134-E053-6C04A8C0233B",
        price: 110000,
        date: "2022-02-11",
        address: "PLOT D, SIDINGS ROAD, NOTTINGHAM",
        postcode: "NG17 7JZ",
        location: { lat: 53.1124, lng: -1.2525 },
        distanceMetres: 512,
      },
    ],
  },
};
const nearbyPlanningApplications = {
  status: "ok",
  provider: "PlanIt",
  withinMetres: 500,
  found: {
    count: 3,
    approved: 1,
    major: 1,
    estimatedHomes: 6,
    highlighted: [
      {
        id: "Ashfield/V/2025/0425",
        reference: "V/2025/0425",
        address: "71 High Pavement, Sutton In Ashfield, Nottinghamshire",
        description: "Construction of 6 semi-detached houses",
        status: "pending",
        applicationType: "major",
        receivedOn: "2025-07-21",
        estimatedHomes: 6,
        distanceMetres: 240,
      },
    ],
  },
};
const landOpportunity = {
  ...landParcel,
  distanceMetres: 137,
  nearbyLandSales,
  nearbyPlanningApplications,
};
const landLayer = {
  layer: "land",
  status: "ok",
  sources: [
    {
      id: "land-parcels",
      name: "Land Parcels",
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    },
  ],
  scope: "search-area",
  sort: "area",
  filters: {
    minAcres: 0.1,
    maxAcres: null,
    maxRoadMetres: 50,
    maxFloodZone: 3,
    possiblyUnregisteredOnly: false,
    excludeConstraints: [],
    excludeListedBuildingOutlines: true,
    ownershipCategories: [],
  },
  landCoverageAreas: [ASHFIELD],
  notCovered: [],
  features: [landOpportunity],
  landUse: [
    {
      id: "way-123",
      landUse: "industrial",
      name: null,
      shape: conservationArea.shape,
    },
  ],
  statistics: {
    parcels: 1,
    count: 1,
    totalHectares: 19.52,
    possiblyUnregistered: 0,
    ownershipCategories: {
      company: 0,
      "council-or-public-body": 0,
      "other-registered": 1,
      "possibly-unregistered": 0,
    },
    estimatedHomes: 351,
    listed: 1,
    nearbyLandSales,
  },
};

const cases: Case[] = [
  {
    name: "HealthResponse",
    schema: HealthResponseSchema,
    guard: isHealthResponse,
    accepted: [{ status: "ok", service: "location-scout-api" }],
    rejected: [
      null,
      {},
      { status: "down", service: "location-scout-api" },
      { status: "ok", service: "something-else" },
    ],
  },
  {
    name: "GeocodeResponse",
    schema: GeocodeResponseSchema,
    guard: isGeocodeResponse,
    accepted: [
      {
        query: "ng17 1aa",
        candidates: [{ kind: "postcode", label: "NG17 1AA", location }],
      },
      {
        query: "12 High Street, Sutton-in-Ashfield",
        candidates: [
          { kind: "address", label: "High Street, NG17 2PG", location },
          { kind: "address", label: "High Street, NG17 1DH", location },
        ],
      },
    ],
    rejected: [
      null,
      { query: "ng17 1aa" },
      { query: "ng17 1aa", candidates: [] },
      { candidates: [{ kind: "postcode", label: "NG17 1AA", location }] },
      {
        query: "ng17 1aa",
        candidates: [{ kind: "click", label: "NG17 1AA", location }],
      },
      { query: "ng17 1aa", candidates: [{ kind: "postcode", location }] },
      {
        query: "ng17 1aa",
        candidates: [
          { kind: "postcode", label: "NG17 1AA", location: { lat: 53 } },
        ],
      },
      {
        query: "ng17 1aa",
        candidates: [
          {
            kind: "postcode",
            label: "NG17 1AA",
            location: { lat: 91, lng: -1 },
          },
        ],
      },
    ],
  },
  {
    name: "AreaResponse",
    schema: AreaResponseSchema,
    guard: isAreaResponse,
    accepted: [
      { ...searchArea, sources: [], layers: [] },
      {
        ...searchArea,
        council: {
          status: "not-prepared",
          council: null,
          inLandCoverageArea: false,
        },
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        council: {
          status: "ok",
          council: { code: "E07000174", name: "Mansfield" },
          inLandCoverageArea: false,
        },
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        geography: {
          ...geography,
          ward: null,
          parliamentaryConstituency: null,
        },
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        sources: [
          {
            id: "police",
            name: "data.police.uk",
            status: "ok",
            period: { from: "2026-07", to: "2026-07" },
          },
          {
            id: "overpass",
            name: "Overpass API",
            status: "unavailable",
            period: null,
          },
        ],
        layers: [
          { id: "crime", status: "ok" },
          { id: "land", status: "not-prepared" },
        ],
      },
    ],
    rejected: [
      null,
      { location, geography, council, sources: [], layers: [] },
      {
        location,
        searchRadius: { miles: 2, metres: 3218.688 },
        geography,
        council,
        sources: [],
        layers: [],
      },
      {
        location,
        searchRadius: { miles: 0.5, metres: 804.672 },
        council,
        sources: [],
        layers: [],
      },
      {
        location,
        searchRadius: { miles: 0.5, metres: 804.672 },
        geography,
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        council: { ...council, council: { code: "E07000170" } },
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        council: { ...council, council: { code: "", name: "Ashfield" } },
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        council: { status: "ok", council: null },
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        geography: { ...geography, postcode: null },
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        geography: { ...geography, ward: undefined },
        sources: [],
        layers: [],
      },
      {
        ...searchArea,
        geography: { ...geography, localAuthority: 170 },
        sources: [],
        layers: [],
      },
      { ...searchArea, layers: [] },
      { ...searchArea, sources: [] },
      {
        ...searchArea,
        sources: [{ id: "x", name: "X", status: "broken", period: null }],
        layers: [],
      },
      {
        ...searchArea,
        sources: [{ id: "x", name: "X", status: "ok" }],
        layers: [],
      },
      {
        ...searchArea,
        sources: [],
        layers: [{ id: "weather", status: "ok" }],
      },
    ],
  },
  {
    name: "LayerResponse",
    schema: LayerResponseSchema,
    guard: isLayerResponse,
    accepted: [
      crimeLayer,
      {
        ...crimeLayer,
        features: [],
        statistics: { ...statistics, total: 0, byCategory: [] },
      },
      {
        ...crimeLayer,
        statistics: {
          ...statistics,
          trend: {
            ...trend,
            complete: false,
            missingMonths: ["2025-01"],
            total: { ...trend.total, change: null },
            byCategory: [
              { ...trend.byCategory[0], previous12Months: 0, change: null },
            ],
          },
        },
      },
      { ...crimeLayer, features: [{ ...crime, street: null }] },
      {
        layer: "crime",
        status: "unavailable",
        sources: [{ ...police, status: "unavailable", period: null }],
        features: [],
        statistics: null,
      },
      planningLayer,
      {
        ...planningLayer,
        features: [],
        statistics: {
          byType: [{ type: "flood-zone", count: 0, coversLocation: false }],
          coveringLocation: [],
        },
      },
      {
        ...planningLayer,
        status: "unavailable",
        features: [],
        statistics: null,
      },
      { ...planningLayer, applications: null },
      {
        ...planningLayer,
        applications: {
          ...applications,
          status: "queued",
          features: [],
          statistics: null,
        },
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          features: [{ ...application, decidedOn: null, url: null }],
        },
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          provider: {
            id: "planwire",
            name: "PlanWire",
            url: "https://planwire.io/",
            note: "Planning Applications come from PlanWire.",
          },
          features: [{ ...application, approximate: false, providerUrl: null }],
          statistics: { ...applications.statistics, total: null },
        },
      },
      amenitiesLayer,
      {
        ...amenitiesLayer,
        features: [],
        statistics: {
          total: 0,
          byType: [{ type: "gym", count: 0, nearest: null }],
        },
      },
      {
        ...amenitiesLayer,
        status: "unavailable",
        sources: [
          {
            id: "overpass",
            name: "Overpass API",
            status: "unavailable",
            period: null,
          },
        ],
        features: [],
        statistics: null,
      },
      transportLayer,
      {
        ...transportLayer,
        features: [{ ...busStop, name: null }],
        statistics: { ...transportStatistics, nearestStation: null },
      },
      {
        ...transportLayer,
        status: "unavailable",
        features: [],
        statistics: null,
      },
      schoolsLayer,
      {
        ...schoolsLayer,
        features: [
          {
            ...school,
            judgement: "good",
            inspection: {
              ...reportCard,
              kind: "ungraded",
              grades: [],
              safeguardingMet: null,
              outcome: "School remains Good",
              ofPredecessor: true,
            },
          },
          {
            ...school,
            phase: "independent",
            ages: null,
            judgement: "none",
            inspection: null,
            inspectorate: "ISI",
          },
        ],
        statistics: { ...schoolStatistics, nearestSecondary: null },
      },
      {
        ...schoolsLayer,
        status: "not-prepared",
        features: [],
        statistics: null,
      },
      landLayer,
      {
        ...landLayer,
        scope: "land-coverage-area",
        sort: "capacity",
        filters: {
          ...landLayer.filters,
          maxAcres: 50,
          maxRoadMetres: null,
          maxFloodZone: 1,
          possiblyUnregisteredOnly: true,
          excludeConstraints: ["flood-zone", "conservation-area"],
          excludeListedBuildingOutlines: false,
          ownershipCategories: ["possibly-unregistered"],
        },
        features: [
          {
            ...landOpportunity,
            name: "Kirkby Fields",
            roadDistanceMetres: null,
            floodZone: null,
            possiblyUnregistered: true,
            ownershipCategory: "possibly-unregistered",
            matchedTitles: [],
            nearbyLandSales: null,
            nearbyPlanningApplications: null,
          },
        ],
        statistics: { ...landLayer.statistics, nearbyLandSales: null },
      },
      {
        ...landLayer,
        features: [
          {
            ...landOpportunity,
            nearbyLandSales: {
              ...nearbyLandSales,
              status: "unavailable",
              found: null,
            },
            nearbyPlanningApplications: {
              ...nearbyPlanningApplications,
              status: "queued",
              found: null,
            },
          },
        ],
        statistics: {
          ...landLayer.statistics,
          nearbyLandSales: {
            ...nearbyLandSales,
            status: "not-prepared",
            found: { count: 0, medianPrice: null, sales: [] },
          },
        },
      },
      {
        ...landLayer,
        features: [
          {
            ...landOpportunity,
            inspirePolygons: [
              { inspireId: "64151457", share: 0.724, ownershipCategory: null },
            ],
            ownershipCategory: null,
            matchedTitles: [],
          },
        ],
        statistics: { ...landLayer.statistics, ownershipCategories: null },
      },
      {
        ...landLayer,
        status: "not-prepared",
        sources: [
          { ...landLayer.sources[0], status: "not-prepared", period: null },
        ],
        landCoverageAreas: [],
        notCovered: [{ code: "E07000174", name: "Mansfield" }],
        features: [],
        landUse: [],
        statistics: null,
      },
      demographicsLayer,
      {
        ...demographicsLayer,
        features: [
          {
            ...outputArea,
            lsoa: null,
            msoaCode: null,
            medianAge: null,
            householdIncome: null,
            deprivationDecile: null,
          },
        ],
        statistics: {
          ...demographicsStatistics,
          medianAge: null,
          householdIncome: null,
          deprivation: {
            ...demographicsStatistics.deprivation,
            atLocation: null,
          },
        },
      },
      {
        ...demographicsLayer,
        statistics: { ...demographicsStatistics, deprivation: null },
      },
      {
        ...demographicsLayer,
        status: "not-prepared",
        features: [],
        statistics: null,
      },
      greenSpaceLayer,
      {
        ...greenSpaceLayer,
        features: [{ ...park, name: null, coversLocation: true }],
        statistics: { ...greenSpaceStatistics, nearestPark: null },
      },
      {
        ...greenSpaceLayer,
        status: "unavailable",
        features: [],
        statistics: null,
      },
      propertyLayer,
      {
        ...propertyLayer,
        features: [
          { ...sale, type: "flat", tenure: "leasehold", newBuild: true },
        ],
      },
      { ...propertyLayer, features: [{ ...sale, history: null }] },
      { ...propertyLayer, features: [{ ...sale, epc: null }], epc: null },
      {
        ...propertyLayer,
        features: [
          { ...sale, epc: { status: "unmatched" } },
          { ...sale, epc: { status: "unavailable" } },
          {
            ...sale,
            epc: {
              status: "matched",
              certificate: { ...sale.epc.certificate, details: null },
            },
          },
        ],
      },
      {
        ...propertyLayer,
        epc: { status: "unavailable", statistics: null },
      },
      {
        ...propertyLayer,
        statistics: {
          ...propertyStatistics,
          medianChange: {
            ...propertyStatistics.medianChange,
            twelveMonths: {
              ...propertyStatistics.medianChange.twelveMonths,
              prices: null,
              change: null,
            },
          },
        },
      },
      {
        ...propertyLayer,
        features: [],
        statistics: {
          ...propertyStatistics,
          all: noSales,
          postcodes: {
            searched: 0,
            limit: 100,
            truncated: false,
            reachMetres: null,
          },
        },
      },
      {
        ...propertyLayer,
        status: "unavailable",
        features: [],
        statistics: null,
      },
    ],
    rejected: [
      null,
      { ...propertyLayer, layer: "sales" },
      { ...propertyLayer, features: [park] },
      { ...propertyLayer, features: [{ ...sale, price: 173000.5 }] },
      { ...propertyLayer, features: [{ ...sale, price: -1 }] },
      { ...propertyLayer, features: [{ ...sale, date: "2026-05" }] },
      { ...propertyLayer, features: [{ ...sale, type: "flat-maisonette" }] },
      { ...propertyLayer, features: [{ ...sale, tenure: "U" }] },
      { ...propertyLayer, features: [{ ...sale, newBuild: "N" }] },
      { ...propertyLayer, features: [{ ...sale, address: null }] },
      { ...propertyLayer, features: [{ ...sale, history: undefined }] },
      { ...propertyLayer, features: [{ ...sale, epc: undefined }] },
      { ...propertyLayer, features: [{ ...sale, epc: { status: "matched" } }] },
      {
        ...propertyLayer,
        features: [
          {
            ...sale,
            epc: {
              status: "matched",
              certificate: { ...sale.epc.certificate, currentBand: "H" },
            },
          },
        ],
      },
      { ...propertyLayer, epc: undefined },
      { ...propertyLayer, epc: { status: "not-prepared", statistics: null } },
      {
        ...propertyLayer,
        features: [
          { ...sale, history: [{ ...sale.history[0], change: "-5.7%" }] },
        ],
      },
      {
        ...propertyLayer,
        statistics: { ...propertyStatistics, medianChange: undefined },
      },
      {
        ...propertyLayer,
        statistics: {
          ...propertyStatistics,
          medianChange: {
            ...propertyStatistics.medianChange,
            fiveYears: {
              ...propertyStatistics.medianChange.fiveYears,
              period: { from: "2020-10", to: "2021-10" },
            },
          },
        },
      },
      {
        ...propertyLayer,
        statistics: {
          ...propertyStatistics,
          period: { from: "2025-10", to: "2026-10" },
        },
      },
      {
        ...propertyLayer,
        statistics: {
          ...propertyStatistics,
          all: { count: 1, median: 173000.5, mean: 173000 },
        },
      },
      {
        ...propertyLayer,
        statistics: {
          ...propertyStatistics,
          byType: [{ type: "bungalow", ...noSales }],
        },
      },
      {
        ...propertyLayer,
        statistics: { ...propertyStatistics, byTenure: [noSales] },
      },
      {
        ...propertyLayer,
        statistics: {
          ...propertyStatistics,
          byNewBuild: [{ newBuild: "Y", ...noSales }],
        },
      },
      {
        ...propertyLayer,
        statistics: {
          ...propertyStatistics,
          postcodes: { searched: 100, limit: 100, reachMetres: 430 },
        },
      },
      { ...schoolsLayer, layer: "school" },
      { ...schoolsLayer, features: [park] },
      { ...schoolsLayer, features: [{ ...school, phase: "college" }] },
      { ...schoolsLayer, features: [{ ...school, name: "" }] },
      { ...schoolsLayer, features: [{ ...school, judgement: "satisfactory" }] },
      {
        ...schoolsLayer,
        features: [
          {
            ...school,
            inspection: { ...reportCard, inspectedOn: "21/04/2026" },
          },
        ],
      },
      {
        ...schoolsLayer,
        features: [
          {
            ...school,
            inspection: {
              ...reportCard,
              grades: [{ area: "Inclusion", grade: "Expected standard" }],
            },
          },
        ],
      },
      {
        ...schoolsLayer,
        statistics: { ...schoolStatistics, primarySearchMetres: undefined },
      },
      {
        ...schoolsLayer,
        statistics: {
          ...schoolStatistics,
          byJudgement: [{ judgement: "good", count: -1 }],
        },
      },
      { ...landLayer, layer: "lands" },
      { ...landLayer, scope: "england" },
      { ...landLayer, sort: "price" },
      { ...landLayer, filters: { ...landLayer.filters, maxFloodZone: 4 } },
      { ...landLayer, filters: { ...landLayer.filters, minAcres: -1 } },
      {
        ...landLayer,
        filters: { ...landLayer.filters, excludeConstraints: ["green-belt"] },
      },
      { ...landLayer, notCovered: undefined },
      { ...landLayer, features: [landParcel] },
      { ...landLayer, features: [{ ...landOpportunity, floodZone: 1 }] },
      {
        ...landLayer,
        features: [{ ...landOpportunity, inspireCoverage: 1.5 }],
      },
      {
        ...landLayer,
        features: [{ ...landOpportunity, estimatedHomes: 2.5 }],
      },
      {
        ...landLayer,
        landUse: [{ ...landLayer.landUse[0], landUse: "residential" }],
      },
      {
        ...landLayer,
        statistics: { ...landLayer.statistics, listed: -1 },
      },
      {
        ...landLayer,
        features: [{ ...landOpportunity, nearbyLandSales: undefined }],
      },
      {
        ...landLayer,
        features: [
          {
            ...landOpportunity,
            nearbyLandSales: { ...nearbyLandSales, period: null },
          },
        ],
      },
      {
        ...landLayer,
        statistics: {
          ...landLayer.statistics,
          nearbyLandSales: {
            ...nearbyLandSales,
            found: {
              ...nearbyLandSales.found,
              sales: [{ ...nearbyLandSales.found.sales[0], price: 1.5 }],
            },
          },
        },
      },
      {
        ...landLayer,
        statistics: {
          ...landLayer.statistics,
          nearbyLandSales: {
            ...nearbyLandSales,
            found: { ...nearbyLandSales.found, medianPrice: "£207,000" },
          },
        },
      },
      { ...demographicsLayer, layer: "census" },
      { ...demographicsLayer, features: [park] },
      {
        ...demographicsLayer,
        features: [{ ...outputArea, deprivationDecile: 11 }],
      },
      { ...demographicsLayer, features: [{ ...outputArea, overlap: 1.5 }] },
      { ...demographicsLayer, features: [{ ...outputArea, shape: null }] },
      {
        ...demographicsLayer,
        features: [{ ...outputArea, population: 2.5 }],
      },
      {
        ...demographicsLayer,
        statistics: {
          ...demographicsStatistics,
          ageProfile: [{ group: "teens", population: 1, percent: 1 }],
        },
      },
      {
        ...demographicsLayer,
        statistics: {
          ...demographicsStatistics,
          deprivation: { atLocation: null, lsoas: 1 },
        },
      },
      {
        ...demographicsLayer,
        statistics: { ...demographicsStatistics, population: undefined },
      },
      { ...greenSpaceLayer, layer: "green" },
      { ...greenSpaceLayer, features: [busStop] },
      { ...greenSpaceLayer, features: [{ ...park, type: "garden" }] },
      { ...greenSpaceLayer, features: [{ ...park, osmTag: null }] },
      { ...greenSpaceLayer, features: [{ ...park, coversLocation: null }] },
      {
        ...greenSpaceLayer,
        features: [{ ...park, shape: footpaths.shape }],
      },
      {
        ...greenSpaceLayer,
        statistics: { ...greenSpaceStatistics, total: -1 },
      },
      {
        ...greenSpaceLayer,
        statistics: {
          ...greenSpaceStatistics,
          byType: [{ type: "footpath", count: 1 }],
        },
      },
      {
        ...greenSpaceLayer,
        statistics: {
          ...greenSpaceStatistics,
          nearestPark: { id: park.id, name: null, distanceMetres: 1 },
        },
      },
      {
        ...greenSpaceLayer,
        statistics: { ...greenSpaceStatistics, parkSearchMetres: undefined },
      },
      { ...transportLayer, layer: "travel" },
      { ...transportLayer, features: [cafe] },
      { ...transportLayer, features: [{ ...busStop, type: "tram-stop" }] },
      { ...transportLayer, features: [{ ...busStop, osmTag: null }] },
      { ...transportLayer, features: [{ ...busStop, lengthMetres: 10 }] },
      {
        ...transportLayer,
        features: [{ ...busStop, shape: footpaths.shape }],
      },
      { ...transportLayer, features: [{ ...footpaths, shape: null }] },
      { ...transportLayer, features: [{ ...footpaths, lengthMetres: -1 }] },
      { ...transportLayer, features: [{ ...footpaths, name: "Trail" }] },
      {
        ...transportLayer,
        features: [
          {
            ...footpaths,
            shape: { type: "MultiLineString", coordinates: [[[0, 0]]] },
          },
        ],
      },
      {
        ...transportLayer,
        statistics: {
          ...transportStatistics,
          facilities: [{ type: "footpath", count: 1 }],
        },
      },
      {
        ...transportLayer,
        statistics: {
          ...transportStatistics,
          routes: [{ type: "bus-stop", lengthMetres: 1 }],
        },
      },
      {
        ...transportLayer,
        statistics: {
          ...transportStatistics,
          nearestStation: { id: "node/1", name: null, distanceMetres: 1 },
        },
      },
      {
        ...transportLayer,
        statistics: { ...transportStatistics, stationSearchMetres: undefined },
      },
      { ...amenitiesLayer, layer: "shops" },
      { ...amenitiesLayer, features: [conservationArea] },
      { ...amenitiesLayer, features: [{ ...cafe, type: "bank" }] },
      { ...amenitiesLayer, features: [{ ...cafe, name: undefined }] },
      { ...amenitiesLayer, features: [{ ...cafe, osmTag: null }] },
      { ...amenitiesLayer, statistics: { ...amenityStatistics, total: -1 } },
      {
        ...amenitiesLayer,
        statistics: {
          ...amenityStatistics,
          byType: [{ type: "cafe", count: 1, nearest: { id: cafe.id } }],
        },
      },
      {
        ...amenitiesLayer,
        statistics: {
          ...amenityStatistics,
          byType: [{ type: "cafe", count: 1 }],
        },
      },
      { ...planningLayer, layer: "crime" },
      { ...planningLayer, features: [crime] },
      { ...planningLayer, features: [application] },
      { ...planningLayer, applications: undefined },
      {
        ...planningLayer,
        applications: { ...applications, status: "not-prepared" },
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          features: [{ ...application, estimatedHomes: 0 }],
        },
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          features: [{ ...application, impact: "" }],
        },
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          statistics: {
            ...applications.statistics,
            housing: { ...housing, residents: -1 },
          },
        },
      },
      {
        ...landLayer,
        features: [
          {
            ...landOpportunity,
            nearbyPlanningApplications: {
              ...nearbyPlanningApplications,
              status: "loading",
            },
          },
        ],
      },
      {
        ...landLayer,
        features: [
          {
            ...landOpportunity,
            nearbyPlanningApplications: {
              ...nearbyPlanningApplications,
              found: { ...nearbyPlanningApplications.found, approved: 0.5 },
            },
          },
        ],
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          provider: { id: "planit", name: "PlanIt" },
        },
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          features: [{ ...application, status: "permitted" }],
        },
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          features: [{ ...application, receivedOn: "21/07/2025" }],
        },
      },
      {
        ...planningLayer,
        applications: {
          ...applications,
          statistics: { ...applications.statistics, major: [""] },
        },
      },
      {
        ...planningLayer,
        features: [{ ...conservationArea, type: "green-belt" }],
      },
      {
        ...planningLayer,
        features: [
          { ...conservationArea, shape: { ...shape, type: "Polygon" } },
        ],
      },
      {
        ...planningLayer,
        features: [
          {
            ...conservationArea,
            shape: { ...shape, coordinates: [[[[0, 0]]]] },
          },
        ],
      },
      { ...planningLayer, features: [{ ...listedBuilding, grade: 2 }] },
      {
        ...planningLayer,
        features: [{ ...listedBuilding, coversLocation: undefined }],
      },
      {
        ...planningLayer,
        statistics: {
          ...planningStatistics,
          byType: [{ type: "flood-zone", count: -1, coversLocation: false }],
        },
      },
      {
        ...planningLayer,
        statistics: { ...planningStatistics, coveringLocation: undefined },
      },
      { ...crimeLayer, layer: "planning" },
      { ...crimeLayer, status: "loading" },
      { ...crimeLayer, sources: undefined },
      { ...crimeLayer, statistics: undefined },
      { ...crimeLayer, features: [{ ...crime, location: null }] },
      { ...crimeLayer, features: [{ ...crime, distanceMetres: -1 }] },
      { ...crimeLayer, features: [{ ...crime, id: 137366010 }] },
      { ...crimeLayer, features: [{ ...crime, month: "2026-13" }] },
      { ...crimeLayer, features: [{ ...crime, categoryName: undefined }] },
      { ...crimeLayer, statistics: { ...statistics, month: "Aug" } },
      { ...crimeLayer, statistics: { ...statistics, total: 1.5 } },
      {
        ...crimeLayer,
        statistics: {
          ...statistics,
          byCategory: [{ category: "drugs", count: 1 }],
        },
      },
      { ...crimeLayer, statistics: { ...statistics, trend: undefined } },
      {
        ...crimeLayer,
        statistics: {
          ...statistics,
          trend: { ...trend, missingMonths: ["January"] },
        },
      },
      {
        ...crimeLayer,
        statistics: {
          ...statistics,
          trend: { ...trend, total: { ...trend.total, change: "-25%" } },
        },
      },
      {
        ...crimeLayer,
        statistics: {
          ...statistics,
          trend: {
            ...trend,
            byCategory: [{ ...trend.byCategory[0], previous12Months: -1 }],
          },
        },
      },
    ],
  },
  {
    name: "ScoresResponse",
    schema: ScoresResponseSchema,
    guard: isScoresResponse,
    accepted: [
      scores,
      {
        mode: "investment",
        categories: [
          {
            id: "development-activity",
            layer: "planning",
            status: "queued",
            score: null,
            breakdown: [],
          },
        ],
        location: {
          score: null,
          counted: [],
          leftOut: [
            {
              id: "development-activity",
              layer: "planning",
              status: "queued",
              weight: 25,
            },
          ],
        },
      },
      {
        mode: "business-cafe",
        categories: [
          { ...transportScore, id: "competition", layer: "amenities" },
          { ...unavailableSafety, id: "footfall", layer: "transport" },
        ],
        location: {
          score: 88,
          counted: [
            {
              id: "competition",
              score: 88,
              weight: 25,
              share: 100,
              points: 88,
            },
          ],
          leftOut: [
            {
              id: "footfall",
              layer: "transport",
              status: "unavailable",
              weight: 20,
            },
          ],
        },
      },
      {
        mode: "development",
        categories: [unavailableSafety],
        location: {
          score: null,
          counted: [],
          leftOut: scores.location.leftOut,
        },
      },
      {
        ...scores,
        categories: [
          {
            ...transportScore,
            breakdown: [{ ...stationPart, value: null }],
          },
          {
            ...transportScore,
            breakdown: [{ ...stationPart, value: true, points: -20 }],
          },
        ],
      },
    ],
    rejected: [
      null,
      {},
      { ...scores, mode: undefined },
      { ...scores, mode: "Buy to let" },
      { ...scores, categories: undefined },
      { ...scores, location: undefined },
      { ...scores, categories: [{ ...transportScore, id: "weather" }] },
      { ...scores, categories: [{ ...transportScore, layer: "weather" }] },
      { ...scores, categories: [{ ...transportScore, status: "loading" }] },
      { ...scores, categories: [{ ...transportScore, score: 101 }] },
      { ...scores, categories: [{ ...transportScore, score: 88.5 }] },
      {
        ...scores,
        categories: [
          {
            ...transportScore,
            breakdown: [{ ...stationPart, value: "1.6 km" }],
          },
        ],
      },
      {
        ...scores,
        categories: [
          { ...transportScore, breakdown: [{ ...stationPart, rule: null }] },
        ],
      },
      { ...scores, location: { ...scores.location, score: -1 } },
      {
        ...scores,
        location: {
          ...scores.location,
          counted: [{ ...scores.location.counted[0], share: -1 }],
        },
      },
      {
        ...scores,
        location: {
          ...scores.location,
          leftOut: [{ ...scores.location.leftOut[0], status: "ok" }],
        },
      },
    ],
  },
  {
    name: "HighlightsResponse",
    schema: HighlightsResponseSchema,
    guard: isHighlightsResponse,
    accepted: [
      highlights,
      { mode: "development", highlights: [], leftOut: [] },
      {
        ...highlights,
        leftOut: [{ layer: "property", status: "not-prepared" }],
      },
    ],
    rejected: [
      null,
      {},
      { ...highlights, mode: "Buy to let" },
      { ...highlights, mode: undefined },
      { ...highlights, highlights: undefined },
      { ...highlights, highlights: [{ ...crimeRising, level: "alert" }] },
      { ...highlights, highlights: [{ ...crimeRising, rule: "ai" }] },
      { ...highlights, highlights: [{ ...crimeRising, layer: "weather" }] },
      { ...highlights, highlights: [{ ...crimeRising, text: "" }] },
      { ...highlights, leftOut: [{ layer: "planning", status: "ok" }] },
      { ...highlights, leftOut: [{ layer: "weather", status: "unavailable" }] },
    ],
  },
  {
    name: "CoverageResponse",
    schema: CoverageResponseSchema,
    guard: isCoverageResponse,
    accepted: [
      coverage,
      { ...coverage, landCoverageAreas: [] },
      {
        ...coverage,
        landCoverageAreas: [
          { council: council.council, datasets: [], outOfDate: true },
        ],
      },
      {
        status: "not-prepared",
        preparedAt: null,
        datasets: [],
        landCoverageAreas: [],
      },
    ],
    rejected: [
      null,
      { ...coverage, status: "prepared" },
      { ...coverage, preparedAt: "" },
      { ...coverage, datasets: undefined },
      { ...coverage, datasets: [{ ...preparedDataset, sourceDate: null }] },
      { ...coverage, datasets: [{ ...preparedDataset, source: "" }] },
      {
        ...coverage,
        landCoverageAreas: [{ council: { name: "Ashfield" }, datasets: [] }],
      },
      { ...coverage, landCoverageAreas: [{ council: council.council }] },
      {
        ...coverage,
        landCoverageAreas: [{ council: council.council, datasets: [] }],
      },
      {
        ...coverage,
        datasets: [{ ...preparedDataset, attribution: undefined }],
      },
      {
        ...coverage,
        datasets: [
          {
            ...inspireDataset,
            attribution: { ...inspireDataset.attribution, statements: [] },
          },
        ],
      },
    ],
  },
  {
    name: "StreetViewResponse",
    schema: StreetViewResponseSchema,
    guard: isStreetViewResponse,
    accepted: [{ enabled: false }, { enabled: true, apiKey: "AIzaSyTest" }],
    rejected: [
      null,
      {},
      { enabled: true },
      { enabled: true, apiKey: "" },
      { enabled: false, apiKey: "AIzaSyTest" },
      { enabled: "true", apiKey: "AIzaSyTest" },
    ],
  },
  {
    name: "ExplainStatusResponse",
    schema: ExplainStatusResponseSchema,
    guard: isExplainStatusResponse,
    accepted: [
      { enabled: false },
      {
        enabled: true,
        model: "claude-sonnet-5-5",
        questions: {
          overview: { "business-cafe": ["Could I open a café here?"] },
          category: ["Why is this score what it is?"],
          "land-opportunity": ["What should I check before pursuing it?"],
        },
      },
    ],
    rejected: [
      null,
      {},
      { enabled: false, model: "claude-sonnet-5-5" },
      { enabled: true, model: "claude-sonnet-5-5" },
      {
        enabled: true,
        model: "",
        questions: { overview: {}, category: [], "land-opportunity": [] },
      },
      {
        enabled: true,
        model: "claude-sonnet-5-5",
        questions: {
          overview: { "Not A Mode": ["Why?"] },
          category: [],
          "land-opportunity": [],
        },
      },
      {
        enabled: true,
        model: "claude-sonnet-5-5",
        questions: {
          overview: { general: [""] },
          category: [],
          "land-opportunity": [],
        },
      },
    ],
  },
  {
    name: "ExplainSubject",
    schema: ExplainSubjectSchema,
    guard: isExplainSubject,
    accepted: [
      { kind: "overview" },
      { kind: "category", category: "footfall" },
      { kind: "land-opportunity", parcelId: "E07000170-2" },
    ],
    rejected: [
      null,
      { kind: "comparison" },
      { kind: "overview", category: "safety" },
      { kind: "category", category: "crime" },
      { kind: "land-opportunity", parcelId: "" },
    ],
  },
  {
    name: "ExplainEvent",
    schema: ExplainEventSchema,
    guard: isExplainEvent,
    accepted: [
      { type: "text", text: "Crime is high" },
      { type: "text", text: "" },
      {
        type: "done",
        usage: { inputTokens: 5036, outputTokens: 33 },
        cached: false,
        truncated: false,
        unverifiedNumbers: [],
      },
      {
        type: "done",
        usage: { inputTokens: 0, outputTokens: 0 },
        cached: true,
        truncated: true,
        unverifiedNumbers: ["987,654"],
      },
      { type: "error", error: "Anthropic didn't answer. Try again shortly." },
    ],
    rejected: [
      null,
      { type: "ping" },
      { type: "text" },
      {
        type: "done",
        usage: { inputTokens: 1.5, outputTokens: 1 },
        cached: false,
        truncated: false,
        unverifiedNumbers: [],
      },
      {
        type: "done",
        usage: { inputTokens: 1, outputTokens: 1 },
        cached: "no",
        truncated: false,
        unverifiedNumbers: [],
      },
      { type: "error", error: "" },
    ],
  },
  {
    name: "ModesResponse",
    schema: ModesResponseSchema,
    guard: isModesResponse,
    accepted: [
      modes,
      {
        modes: [
          ...modes.modes,
          {
            ...cafeMode,
            id: "retail",
            competitors: {
              name: "shops",
              tags: [{ key: "shop", values: null }],
            },
          },
          {
            ...investment,
            id: "fixture-mode",
            weights: { ...weights, safety: 0 },
            highlightedLayers: ["land"],
            highlights: [],
          },
        ],
      },
    ],
    rejected: [
      null,
      {},
      { modes: [] },
      { modes: [investment] },
      { modes: [...modes.modes, investment] },
      { modes: [...modes.modes, { ...investment, id: "Buy to let" }] },
      { modes: [...modes.modes, { ...investment, name: "" }] },
      { modes: [...modes.modes, { ...investment, question: null }] },
      {
        modes: [
          ...modes.modes,
          { ...investment, weights: { ...weights, safety: -1 } },
        ],
      },
      {
        modes: [
          ...modes.modes,
          { ...investment, weights: { ...weights, safety: undefined } },
        ],
      },
      {
        modes: [
          ...modes.modes,
          { ...investment, weights: { ...weights, demand: 25 } },
        ],
      },
      {
        modes: [
          ...modes.modes,
          { ...investment, highlightedLayers: ["property", "planning"] },
        ],
      },
      {
        modes: [
          ...modes.modes,
          { ...investment, highlightedLayers: ["businesses"] },
        ],
      },
      {
        modes: [
          ...modes.modes,
          { ...investment, highlights: ["prices-rising", "crime-rate-high"] },
        ],
      },
      {
        modes: [
          ...modes.modes,
          { ...investment, highlights: ["prices-rising", "prices-rising"] },
        ],
      },
      {
        modes: [...modes.modes, { ...investment, highlights: ["ai-says-so"] }],
      },
      { modes: [...modes.modes, { ...investment, competitors: undefined }] },
      {
        modes: [
          ...modes.modes,
          {
            ...cafeMode,
            competitors: { name: "", tags: cafeMode.competitors.tags },
          },
        ],
      },
      {
        modes: [
          ...modes.modes,
          { ...cafeMode, competitors: { name: "cafés", tags: [] } },
        ],
      },
      {
        modes: [
          ...modes.modes,
          {
            ...cafeMode,
            competitors: { name: "cafés", tags: [{ key: "amenity" }] },
          },
        ],
      },
      {
        modes: [
          ...modes.modes,
          {
            ...cafeMode,
            competitors: {
              name: "cafés",
              tags: [{ key: "amenity", values: [] }],
            },
          },
        ],
      },
    ],
  },
  {
    name: "LandParcelResponse",
    schema: LandParcelResponseSchema,
    guard: isLandParcelResponse,
    accepted: [
      {
        parcel: landParcel,
        inspirePolygons: [
          {
            inspireId: "64151457",
            share: 0.724,
            ownershipCategory: "other-registered",
            distanceMetres: 0,
            shape: conservationArea.shape,
          },
          {
            inspireId: "25709295",
            share: 0,
            ownershipCategory: "company",
            distanceMetres: 9,
            shape: conservationArea.shape,
          },
        ],
        nearbyLandSales,
        sources: landLayer.sources,
      },
    ],
    rejected: [
      {
        parcel: landParcel,
        inspirePolygons: [],
        nearbyLandSales: null,
        sources: [],
      },
      {
        parcel: landParcel,
        inspirePolygons: [],
        nearbyLandSales: {
          ...nearbyLandSales,
          found: {
            ...nearbyLandSales.found,
            sales: [{ ...nearbyLandSales.found.sales[0], date: "2022" }],
          },
        },
        sources: [],
      },
      { parcel: landOpportunity, inspirePolygons: [], sources: undefined },
      {
        parcel: landParcel,
        inspirePolygons: [
          {
            inspireId: "64151457",
            share: 0.724,
            ownershipCategory: "other-registered",
            distanceMetres: 0,
          },
        ],
        sources: [],
      },
      {
        parcel: landParcel,
        inspirePolygons: [
          {
            inspireId: "64151457",
            share: 0.724,
            ownershipCategory: "individual",
            distanceMetres: 0,
            shape: conservationArea.shape,
          },
        ],
        sources: [],
      },
      {
        parcel: {
          ...landParcel,
          matchedTitles: [
            { ...landParcel.matchedTitles[0], matchedBy: "postcode" },
          ],
        },
        inspirePolygons: [],
        sources: [],
      },
      {
        parcel: { ...landParcel, council: null },
        inspirePolygons: [],
        sources: [],
      },
    ],
  },
  {
    name: "ApiErrorResponse",
    schema: ApiErrorResponseSchema,
    guard: isApiErrorResponse,
    accepted: [{ error: "Postcode not found" }],
    rejected: [null, {}, { error: 404 }],
  },
];

describe.each(cases)(
  "the $name schema",
  ({ schema, guard, accepted, rejected }) => {
    it.each(accepted)("accepts %j, as packages/shared does", (body) => {
      expect(guard(body)).toBe(true);
      expect(schema.safeParse(body).success).toBe(true);
    });

    it.each(rejected)("rejects %j, as packages/shared does", (body) => {
      expect(guard(body)).toBe(false);
      expect(schema.safeParse(body).success).toBe(false);
    });
  },
);
