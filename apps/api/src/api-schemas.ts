import { z } from "@hono/zod-openapi";

import {
  AGE_GROUPS,
  AMENITY_TYPES,
  CATEGORY_IDS,
  CATEGORY_STATUSES,
  DATE_PATTERN,
  EPC_BANDS,
  EPC_RULES,
  FLOOD_ZONES,
  GEOCODE_MATCH_KINDS,
  GREEN_SPACE_TYPES,
  HIGHLIGHT_LEVELS,
  HIGHLIGHT_RULE_IDS,
  LAND_LIST_LIMIT,
  LAND_PARCEL_RULES,
  LAND_SALE_LABEL,
  LAND_SCOPES,
  LAND_SORTS,
  LAND_USE_CONTEXT_TYPES,
  LAYER_IDS,
  MONTH_PATTERN,
  NEARBY_LAND_SALES_RULES,
  OFSTED_GRADES,
  OFSTED_INSPECTION_KINDS,
  OFSTED_JUDGEMENTS,
  OWNERSHIP_CATEGORIES,
  PLANNING_APPLICATION_STATUSES,
  PLANNING_APPLICATION_TYPES,
  PLANNING_APPLICATIONS_STATUSES,
  PLANNING_CONSTRAINT_TYPES,
  PROPERTY_TYPES,
  DEFAULT_SCOUT_MODE,
  SCHOOL_PHASES,
  SCOUT_MODE_ID_PATTERN,
  SEARCH_RADII_MILES,
  SERVED_LAYER_IDS,
  SOURCE_STATUSES,
  TENURES,
  TITLE_DATASETS,
  TITLE_MATCHED_BY,
  TRANSPORT_FACILITY_TYPES,
  TRANSPORT_ROUTE_TYPES,
  TRANSPORT_TYPES,
} from "@location-scout/shared";

/*
 * The schema of every `/api` response body, from which the OpenAPI document is
 * generated (PRD FR-8.1). Their choices come from `packages/shared`, and
 * `api-schemas.test.ts` checks each against its shared type and type guard, so
 * the document can't drift from what the API sends (FR-8.3).
 */

export const ApiErrorResponseSchema = z
  .object({
    error: z.string().openapi({
      description: "A message to show the user.",
      example: "Enter a full postcode, for example NG17 1AA.",
    }),
  })
  .openapi("ApiErrorResponse", {
    description: "The body of any `/api` response that is not a success.",
  });

export const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("location-scout-api"),
  })
  .openapi("HealthResponse", {
    description: "The backend is up and answering.",
  });

export const LocationSchema = z
  .object({
    lat: z.number().min(-90).max(90).openapi({ example: 53.123664 }),
    lng: z.number().min(-180).max(180).openapi({ example: -1.264078 }),
  })
  .openapi("Location", {
    description: "A Location: the single point a user is asking about.",
  });

export const GeocodeCandidateSchema = z
  .object({
    kind: z.enum(GEOCODE_MATCH_KINDS).openapi({
      description:
        "`postcode` if postcodes.io resolved it, `address` if Nominatim did.",
    }),
    label: z.string().openapi({
      description:
        "How to name it to the user: the postcode as postcodes.io formats it, or the address as Nominatim gives it.",
      example: "NG17 1AA",
    }),
    location: LocationSchema,
  })
  .openapi("GeocodeCandidate", {
    description: "One Location that what the user typed may mean.",
  });

export const GeocodeResponseSchema = z
  .object({
    query: z.string().openapi({
      description: "What the user typed.",
      example: "ng17 1aa",
    }),
    candidates: z.array(GeocodeCandidateSchema).min(1).openapi({
      description:
        "The Locations it may mean, best first. A postcode has exactly one; an address may have several for the user to pick from.",
    }),
  })
  .openapi("GeocodeResponse", {
    description: "What the user typed, resolved to one or more Locations.",
  });

export const SearchRadiusMilesSchema = z
  .literal(SEARCH_RADII_MILES)
  .openapi("SearchRadiusMiles", {
    description: "A Search Radius in miles (PRD FR-1.4).",
    // The generator lists only the first of several literals, so list them all.
    enum: [...SEARCH_RADII_MILES],
    example: 0.5,
  });

export const SearchAreaSchema = z
  .object({
    location: LocationSchema,
    searchRadius: z.object({
      miles: SearchRadiusMilesSchema,
      metres: z.number().openapi({ example: 804.672 }),
    }),
  })
  .openapi("SearchArea", {
    description:
      "A Search Area: the circle defined by a Location and its Search Radius.",
  });

export const SourceStatusSchema = z
  .enum(SOURCE_STATUSES)
  .openapi("SourceStatus", {
    description:
      "How a Data Source answered (PRD NFR-1.3): `ok`; `unavailable` if it failed or took over 8 seconds; `not-prepared` if its `pnpm data:prepare` files are missing.",
  });

export const DataPeriodSchema = z
  .object({
    from: z.string().openapi({ example: "2026-07" }),
    to: z.string().openapi({ example: "2026-07" }),
  })
  .openapi("DataPeriod", {
    description:
      "The period a Data Source's figures cover, inclusive, as ISO 8601 dates or months.",
  });

export const SourceReportSchema = z
  .object({
    id: z.string().openapi({ example: "police" }),
    name: z.string().openapi({ example: "data.police.uk" }),
    status: SourceStatusSchema,
    // A union, because the generator would mark DataPeriod itself as nullable.
    period: z.union([DataPeriodSchema, z.null()]).openapi({
      description: "`null` when the source did not answer or states no period.",
    }),
  })
  .openapi("SourceReport", {
    description: "One Data Source behind a response, and how it answered.",
  });

export const LayerReportSchema = z
  .object({
    id: z.enum(LAYER_IDS),
    status: SourceStatusSchema,
  })
  .openapi("LayerReport", {
    description:
      "One Layer and whether its Features and statistics can be shown.",
  });

/** A name postcodes.io may leave out. */
const geographyName = (description: string, example: string) =>
  z.union([z.string(), z.null()]).openapi({
    description: `${description} \`null\` if postcodes.io names none.`,
    example,
  });

export const LocalGeographySchema = z
  .object({
    postcode: z.string().openapi({
      description:
        "The postcode whose postcodes.io record names these areas: the one searched for, or else the one nearest the Location.",
      example: "NG17 1AA",
    }),
    ward: geographyName("The electoral ward.", "Sutton Central & New Cross"),
    lsoa: geographyName("The Lower layer Super Output Area.", "Ashfield 005E"),
    msoa: geographyName("The Middle layer Super Output Area.", "Ashfield 005"),
    localAuthority: geographyName(
      "The district, unitary authority or London borough.",
      "Ashfield",
    ),
    parliamentaryConstituency: geographyName(
      "The parliamentary constituency.",
      "Ashfield",
    ),
  })
  .openapi("LocalGeography", {
    description:
      "The local geography a Location lies in, from postcodes.io (PRD FR-1.8).",
  });

const TextSchema = z.string().min(1);

export const CouncilSchema = z
  .object({
    code: TextSchema.openapi({
      description: "Its ONS code.",
      example: "E07000170",
    }),
    name: TextSchema.openapi({ example: "Ashfield" }),
  })
  .openapi("Council", {
    description:
      "A council: a local authority district, London borough or unitary authority.",
  });

export const CouncilReportSchema = z
  .object({
    status: SourceStatusSchema.openapi({
      description:
        "`not-prepared` until `pnpm data:prepare` has prepared the council boundaries.",
    }),
    council: z.union([CouncilSchema, z.null()]).openapi({
      description:
        "`null` unless `status` is `ok`, or if no council's boundary covers the Location: the boundaries follow the coast, so a beach may be outside them.",
    }),
    inLandCoverageArea: z.boolean().openapi({
      description:
        "Whether the council is a Land Coverage Area, whose land data is prepared. `false` without a council.",
    }),
  })
  .openapi("CouncilReport", {
    description:
      "The council a Location is in, from the council boundaries `pnpm data:prepare` prepared (PRD FR-6.3), and whether it is a Land Coverage Area.",
  });

export const AreaResponseSchema = SearchAreaSchema.extend({
  geography: LocalGeographySchema,
  council: CouncilReportSchema,
  sources: z.array(SourceReportSchema),
  layers: z.array(LayerReportSchema),
}).openapi("AreaResponse", {
  description:
    "The Search Area around a Location, the local geography it lies in (PRD FR-1.8), the council it is in from the prepared council boundaries (FR-6.3), every Data Source consulted for it, and the status of each Layer those sources supply (PRD NFR-1.2, NFR-1.3).",
});

export const DatasetAttributionSchema = z
  .object({
    statements: z
      .array(TextSchema)
      .min(1)
      .openapi({
        description: "Each statement, in full, with the year filled in.",
        example: [
          "This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry.",
          "The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063.",
        ],
      }),
    conditionsUrl: TextSchema.openapi({
      description: "Where its conditions are.",
      example:
        "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
    }),
  })
  .openapi("DatasetAttribution", {
    description:
      "The statements a dataset's licence requires wherever it is used, and a link to its conditions, as INSPIRE Index Polygons' does (PRD FR-10.2).",
  });

export const PreparedDatasetSchema = z
  .object({
    id: TextSchema.openapi({ example: "council-boundaries" }),
    name: TextSchema.openapi({ example: "Council boundaries" }),
    source: TextSchema.openapi({
      description: "Who publishes it.",
      example: "ONS Open Geography",
    }),
    sourceUrl: TextSchema.openapi({
      description: "Where it was downloaded from.",
      example:
        "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_May_2026_Boundaries_UK_BGC/FeatureServer/0",
    }),
    sourceDate: TextSchema.openapi({
      description:
        "When its data dates from, as the source states it, as an ISO 8601 date or month.",
      example: "2026-05",
    }),
    preparedAt: TextSchema.openapi({
      description:
        "When `pnpm data:prepare` prepared it, as an ISO 8601 date and time.",
      example: "2026-10-08T12:00:00.000Z",
    }),
    attribution: z.union([DatasetAttributionSchema, z.null()]).openapi({
      description:
        "The statements its licence requires and a link to its conditions, or `null` for a dataset whose source is credited as a whole.",
    }),
  })
  .openapi("PreparedDataset", {
    description:
      "One dataset `pnpm data:prepare` has prepared, and its dates (PRD FR-6.2, FR-6.5).",
  });

export const LandCoverageAreaSchema = z
  .object({
    council: CouncilSchema,
    datasets: z.array(PreparedDatasetSchema),
    outOfDate: z.boolean().openapi({
      description:
        "Whether its INSPIRE Index Polygons were published more than 2 months ago, or aren't prepared, so running `pnpm data:prepare` again is suggested (PRD FR-6.5).",
    }),
  })
  .openapi("LandCoverageArea", {
    description:
      "A council whose land data has been prepared, so Land Opportunities can be found inside it (PRD FR-6.1, FR-6.4).",
  });

export const CoverageResponseSchema = z
  .object({
    status: SourceStatusSchema.openapi({
      description:
        "`not-prepared` until `pnpm data:prepare` has run, and `unavailable` if what it prepared can't be read. Either way the lists are empty.",
    }),
    preparedAt: z.union([TextSchema, z.null()]).openapi({
      description:
        "When `pnpm data:prepare` last ran, or `null` unless `status` is `ok`.",
      example: "2026-10-08T12:00:00.000Z",
    }),
    datasets: z.array(PreparedDatasetSchema).openapi({
      description: "The England-wide datasets.",
    }),
    landCoverageAreas: z.array(LandCoverageAreaSchema),
  })
  .openapi("CoverageResponse", {
    description:
      "The prepared datasets and Land Coverage Areas, with their dates (PRD FR-6.5, FR-8.2).",
  });

export const StreetViewResponseSchema = z
  .discriminatedUnion("enabled", [
    z
      .object({
        enabled: z.literal(false),
      })
      .strict()
      .openapi("StreetViewOff", {
        description:
          "`GOOGLE_MAPS_API_KEY` isn't set: the Street View panel is hidden, and nothing is loaded from Google.",
      }),
    z
      .object({
        enabled: z.literal(true),
        apiKey: z.string().min(1).openapi({
          description:
            "`GOOGLE_MAPS_API_KEY`, which the browser loads Google's Maps JavaScript API with. Google's script needs it in the page, so it is a browser key: restrict it in Google Cloud to your own origin and to the Maps JavaScript API.",
          example: "AIzaSy…",
        }),
      })
      .openapi("StreetViewOn", {
        description: "`GOOGLE_MAPS_API_KEY` is set: Street View is on.",
      }),
  ])
  .openapi("StreetViewResponse", {
    description:
      "Whether the optional Street View panel is on, and the key it is loaded with (PRD FR-2.13).",
  });

const MonthSchema = z
  .string()
  .regex(MONTH_PATTERN)
  .openapi({ example: "2026-08" });

const CountSchema = z.number().int().min(0);

const DateSchema = z.string().regex(DATE_PATTERN);

export const CrimeFeatureSchema = z
  .object({
    id: z.string().openapi({
      description: "data.police.uk's id for the crime.",
      example: "137366010",
    }),
    location: LocationSchema,
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far it is from the Location in a straight line, in metres (PRD FR-2.10).",
      example: 604,
    }),
    category: z.string().openapi({
      description: "data.police.uk's category.",
      example: "anti-social-behaviour",
    }),
    categoryName: z.string().openapi({ example: "Anti-social behaviour" }),
    month: MonthSchema.openapi({
      description: "The month it was reported in.",
    }),
    street: z.union([z.string(), z.null()]).openapi({
      description:
        "Where the police place it, or `null` if they name nowhere. Police locations are deliberately approximate (FR-2.9).",
      example: "On or near Petrol Station",
    }),
  })
  .openapi("CrimeFeature", {
    description:
      "One street-level crime reported to the police, as a Feature of the Crime Layer (PRD FR-2.1).",
  });

export const CrimeCategoryCountSchema = z
  .object({
    category: z.string().openapi({ example: "violent-crime" }),
    name: z.string().openapi({ example: "Violence and sexual offences" }),
    count: CountSchema.openapi({ example: 43 }),
  })
  .openapi("CrimeCategoryCount", {
    description: "How many crimes of one category were reported.",
  });

const crimeChangeShape = {
  last12Months: CountSchema.openapi({
    description:
      "Crimes in the 12 months up to and including the latest published month.",
    example: 1984,
  }),
  previous12Months: CountSchema.openapi({
    description: "Crimes in the 12 months before those.",
    example: 1902,
  }),
  change: z.union([z.number(), z.null()]).openapi({
    description:
      "The year-on-year change in per cent, to one decimal place. `null` if the trend is incomplete, or if there were no crimes in the previous 12 months to compare with.",
    example: 4.3,
  }),
};

export const CrimeChangeSchema = z
  .object(crimeChangeShape)
  .openapi("CrimeChange", {
    description:
      "How many crimes were reported in the last 12 months and the 12 before.",
  });

export const CrimeCategoryChangeSchema = z
  .object({
    category: z.string().openapi({ example: "violent-crime" }),
    name: z.string().openapi({ example: "Violence and sexual offences" }),
    ...crimeChangeShape,
  })
  .openapi("CrimeCategoryChange", {
    description: "One category's crimes, year on year.",
  });

export const CrimeTrendSchema = z
  .object({
    last12Months: DataPeriodSchema.openapi({
      example: { from: "2025-09", to: "2026-08" },
    }),
    previous12Months: DataPeriodSchema.openapi({
      example: { from: "2024-09", to: "2025-08" },
    }),
    complete: z.boolean().openapi({
      description: "`true` only if every one of the 24 months was counted.",
    }),
    missingMonths: z.array(MonthSchema).openapi({
      description:
        "The months data.police.uk didn't answer for, oldest first. Their crimes are left out of the counts.",
    }),
    total: CrimeChangeSchema,
    byCategory: z.array(CrimeCategoryChangeSchema).openapi({
      description: "Most reported in the last 12 months first.",
    }),
  })
  .openapi("CrimeTrend", {
    description:
      "Crimes in the last 12 months against the 12 months before (PRD FR-2.1). If data.police.uk doesn't answer for some of the 24 months, the trend is marked incomplete, with no changes, rather than compared wrongly.",
  });

export const CrimeStatisticsSchema = z
  .object({
    month: MonthSchema.openapi({
      description: "The latest month data.police.uk has published.",
    }),
    total: CountSchema.openapi({
      description: "Crimes in the latest month.",
      example: 185,
    }),
    byCategory: z.array(CrimeCategoryCountSchema).openapi({
      description:
        "The latest month's crimes by category, most reported first.",
    }),
    trend: CrimeTrendSchema,
  })
  .openapi("CrimeStatistics", {
    description:
      "The Crime Layer's statistics for the Location Overview (PRD FR-2.1).",
  });

export const CrimeLayerResponseSchema = z
  .object({
    layer: z.literal("crime"),
    status: SourceStatusSchema,
    sources: z.array(SourceReportSchema).openapi({
      description: "The Data Sources behind the Layer, and how each answered.",
    }),
    features: z.array(CrimeFeatureSchema).openapi({
      description: "Empty unless `status` is `ok`.",
    }),
    statistics: z.union([CrimeStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("CrimeLayerResponse", {
    description:
      "The street-level crimes in the Search Area for the latest month data.police.uk has published, their count by category, and the year-on-year trend over the last 24 months (PRD FR-2.1). If data.police.uk is unavailable, `status` says so (NFR-1.2).",
  });

export const PlanningConstraintTypeSchema = z
  .enum(PLANNING_CONSTRAINT_TYPES)
  .openapi("PlanningConstraintType", {
    description:
      "A kind of Planning Constraint (PRD FR-2.2). planning.data.gov.uk calls Article 4 directions `article-4-direction-area` and flood zones `flood-risk-zone`.",
  });

const PositionSchema = z
  .tuple([z.number(), z.number()])
  .openapi({ description: "`[lng, lat]`, in GeoJSON order." });

export const ConstraintShapeSchema = z
  .object({
    type: z.literal("MultiPolygon"),
    coordinates: z
      .array(z.array(z.array(PositionSchema).min(4)).min(1))
      .min(1)
      .openapi({
        description:
          "Polygons, each an outer ring followed by any holes, each ring closed.",
      }),
  })
  .openapi("ConstraintShape", {
    description:
      "The outline of a Planning Constraint or a green space, as a GeoJSON MultiPolygon.",
  });

export const PlanningConstraintFeatureSchema = z
  .object({
    id: z.string().openapi({
      description:
        "planning.data.gov.uk's entity number, or `flood-zone-2` or `flood-zone-3` for a flood zone.",
      example: "44005909",
    }),
    location: LocationSchema.openapi({
      description:
        "Where the map marks it: a listed building's own point, or otherwise the point of its shape nearest the Location, which is the Location itself if the Location is inside it.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far `location` is from the Location in a straight line, in metres (PRD FR-2.10): 0 if the Location is inside it.",
      example: 0,
    }),
    type: PlanningConstraintTypeSchema,
    name: z.string().openapi({
      description:
        'Its name. A flood zone is named by its zone, for example "Flood zone 3".',
      example: "Sutton in Ashfield Church and Market Place",
    }),
    grade: z.union([z.string(), z.null()]).openapi({
      description: "A listed building's grade, or `null`.",
      example: "II*",
    }),
    coversLocation: z.boolean().openapi({
      description: "Whether the Location sits inside it.",
    }),
    shape: z.union([ConstraintShapeSchema, z.null()]).openapi({
      description:
        "Its outline, or `null` for one known only as a point, as listed buildings are.",
    }),
  })
  .openapi("PlanningConstraintFeature", {
    description:
      "One Planning Constraint that intersects the Search Area, as a Feature of the Planning Layer (PRD FR-2.2). Flood zones are mapped as many small areas, so each zone's areas are joined into one Feature.",
  });

export const PlanningConstraintCountSchema = z
  .object({
    type: PlanningConstraintTypeSchema,
    count: CountSchema.openapi({ example: 1 }),
    coversLocation: z.boolean().openapi({
      description: "Whether the Location sits inside any of them.",
    }),
  })
  .openapi("PlanningConstraintCount", {
    description:
      "How many Planning Constraints of one type intersect the Search Area.",
  });

export const PlanningConstraintNameSchema = z
  .object({
    type: PlanningConstraintTypeSchema,
    name: z.string().openapi({
      example: "Sutton in Ashfield Church and Market Place",
    }),
  })
  .openapi("PlanningConstraintName", {
    description: "A Planning Constraint the Location sits inside.",
  });

export const PlanningStatisticsSchema = z
  .object({
    byType: z.array(PlanningConstraintCountSchema).openapi({
      description: "Every type, in a fixed order, even with none.",
    }),
    coveringLocation: z.array(PlanningConstraintNameSchema).openapi({
      description:
        "The Planning Constraints the Location sits inside, by type.",
    }),
  })
  .openapi("PlanningStatistics", {
    description:
      "The Planning Layer's statistics for the Location Overview (PRD FR-2.2).",
  });

export const PlanningApplicationStatusSchema = z
  .enum(PLANNING_APPLICATION_STATUSES)
  .openapi("PlanningApplicationStatus", {
    description:
      "Where a Planning Application has got to (PRD FR-2.2): `pending` while it waits for a decision, here or from the government or another authority it was referred to; `approved`, with or without conditions; `refused`; `withdrawn` before a decision; or `other`, when no decision was made, as in a split decision, or its status isn't known. From PlanIt's `app_state`: Undecided and Referred are pending, Permitted and Conditions approved, Rejected refused, Withdrawn withdrawn, and Unresolved and Other other. From PlanWire's `decisionOutcome`: approved, refused, withdrawn and other as they are, and unknown pending if it has no decision or decision date yet, and other if it has.",
  });

export const PlanningApplicationTypeSchema = z
  .enum(PLANNING_APPLICATION_TYPES)
  .openapi("PlanningApplicationType", {
    description:
      "The kind of development a Planning Application is for (PRD FR-2.2): `major`, PlanIt's \"Large\" (major, large scale developments), or, from PlanWire, where the council's own type for it says major; `householder`, where the council's own type for it says so, as neither provider has a type of its own for them; or `minor`, anything else.",
  });

export const PlanningApplicationFeatureSchema = z
  .object({
    id: z.string().openapi({
      description: "Its provider's name for it, unique across the UK.",
      example: "Ashfield/V/2025/0320",
    }),
    location: LocationSchema.openapi({
      description:
        "Where its provider places it: the point the council gave, or else, from PlanIt, the middle of its postcode.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far `location` is from the Location in a straight line, in metres (PRD FR-2.10).",
      example: 408,
    }),
    reference: z.string().min(1).openapi({
      description: "The council's reference for it.",
      example: "V/2025/0320",
    }),
    authority: z.string().min(1).openapi({
      description: "The planning authority that handles it.",
      example: "Ashfield",
    }),
    description: z.string().openapi({
      description: "What it proposes, as the council describes it.",
      example: "Outline application with all matters reserved for 4 dwellings",
    }),
    address: z.union([z.string().min(1), z.null()]).openapi({
      example:
        "19 Portland Street, Sutton In Ashfield, Nottinghamshire, NG17 4AW",
    }),
    postcode: z.union([z.string().min(1), z.null()]).openapi({
      example: "NG17 4AW",
    }),
    status: PlanningApplicationStatusSchema,
    applicationType: PlanningApplicationTypeSchema,
    councilType: z.union([z.string().min(1), z.null()]).openapi({
      description: "The council's own name for its type, or `null`.",
      example: "Outline Planning Application",
    }),
    receivedOn: DateSchema.openapi({
      description:
        "The day it was received or validated, whichever came first, ISO 8601.",
      example: "2025-08-20",
    }),
    decidedOn: z.union([DateSchema, z.null()]).openapi({
      description: "The day it was decided, or `null` if it hasn't been.",
      example: "2025-11-28",
    }),
    approximate: z.boolean().openapi({
      description:
        "Whether it is placed at the middle of its postcode, the council having given no point (ADR 0003). PlanWire doesn't say, so its applications never are.",
    }),
    url: z.union([z.string().min(1), z.null()]).openapi({
      description: "The application on the council's own website, or `null`.",
    }),
    providerUrl: z.union([z.string().min(1), z.null()]).openapi({
      description:
        "The application on its provider's website, or `null`, as it always is from PlanWire, which has no page for one.",
      example: "https://www.planit.org.uk/planapplic/Ashfield/V/2025/0320/",
    }),
    estimatedHomes: z.union([z.number().int().min(1), z.null()]).openapi({
      description:
        "The new homes its description proposes, estimated by fixed rules (PRD FR-2.2): \"erection of 86 dwellings\" is 86. Those demolished, converted from or replaced, and applications that only settle the details of a permission, aren't counted. `null` if it proposes none, or doesn't say how many.",
      example: 4,
    }),
    impact: z.string().min(1).openapi({
      description:
        "Its potential impact, estimated by a fixed rule from its homes, status and type, as its popup shows it.",
      example:
        "Potential impact, estimated: 4 new homes, about 10 more residents, once built.",
    }),
  })
  .openapi("PlanningApplicationFeature", {
    description:
      "One Planning Application received in the Search Area in the last 3 years, as a Feature of the Planning Layer (PRD FR-2.2). Applications its provider has no location for are left out.",
  });

export const EstimatedHousingSchema = z
  .object({
    approved: CountSchema.openapi({
      description: "The homes approved applications propose.",
      example: 41,
    }),
    pending: CountSchema.openapi({
      description: "The homes pending applications propose.",
      example: 9,
    }),
    homes: CountSchema.openapi({
      description: "Approved and pending together.",
      example: 50,
    }),
    residents: CountSchema.openapi({
      description:
        "The residents they would bring: `homes` × 2.4, to the nearest whole one.",
      example: 120,
    }),
    applications: CountSchema.openapi({
      description: "How many approved or pending applications propose them.",
      example: 16,
    }),
    unstated: CountSchema.openapi({
      description:
        "How many approved or pending applications propose homes without saying how many, so are not counted.",
      example: 2,
    }),
  })
  .openapi("EstimatedHousing", {
    description:
      'The homes the approved and pending Planning Applications in the Search Area propose, and the residents they would bring, estimated from their descriptions (PRD FR-2.2): "N homes approved or pending → about N × 2.4 extra residents".',
  });

export const PlanningApplicationStatisticsSchema = z
  .object({
    count: CountSchema.openapi({
      description: "How many are in the Search Area, and given as Features.",
      example: 126,
    }),
    total: z.union([CountSchema, z.null()]).openapi({
      description:
        "How many its provider has in the Search Area: more than `count` if it gave only the newest. `null` if it gave as many as it gives at once and doesn't say how many it has, as PlanWire doesn't, so it may have more.",
      example: 126,
    }),
    approximate: CountSchema.openapi({
      description: "How many are placed at the middle of their postcode.",
      example: 126,
    }),
    byStatus: z
      .array(
        z.object({
          status: PlanningApplicationStatusSchema,
          count: CountSchema,
        }),
      )
      .openapi({
        description: "Every status, in a fixed order, even with none.",
      }),
    byType: z
      .array(
        z.object({ type: PlanningApplicationTypeSchema, count: CountSchema }),
      )
      .openapi({
        description: "Every type, in a fixed order, even with none.",
      }),
    major: z.array(z.string().min(1)).openapi({
      description: "The ids of the major applications, newest first.",
      example: ["Ashfield/V/2025/0425"],
    }),
    housing: EstimatedHousingSchema,
  })
  .openapi("PlanningApplicationStatistics", {
    description:
      "The Planning Applications' statistics for the Location Overview (PRD FR-2.2).",
  });

export const PlanningApplicationsSchema = z
  .object({
    status: z.enum(PLANNING_APPLICATIONS_STATUSES).openapi({
      description:
        "`ok`; `queued` while the request for them waits its turn, as PlanIt allows one a minute (PRD NFR-1.5), so ask again in a few seconds (PlanWire's requests never wait); or `unavailable` if the provider failed or took over 8 seconds once its turn came.",
    }),
    provider: z
      .object({
        id: z.string().min(1).openapi({
          description:
            "`planit`, or `planwire` with `PLANNING_APPLICATIONS_PROVIDER=planwire` and `PLANWIRE_API_KEY`.",
          example: "planit",
        }),
        name: z.string().min(1).openapi({ example: "PlanIt" }),
        url: z.string().min(1).openapi({
          description: "Its website, which the Location Overview credits.",
          example: "https://www.planit.org.uk/",
        }),
        note: z.string().min(1).openapi({
          description:
            "Where its Planning Applications come from, which it leaves out or places approximately, and how their types are told apart.",
          example:
            "Planning Applications come from PlanIt, which gathers them from councils' planning websites, so each is as its council published it.",
        }),
      })
      .openapi({
        description:
          "The provider asked (ADR 0003), which the frontend shows whatever it is.",
      }),
    period: DataPeriodSchema.openapi({
      description:
        "The 3 years looked at, as ISO 8601 dates, up to and including the day they were asked for, which a cached answer may be up to 7 days before.",
    }),
    features: z.array(PlanningApplicationFeatureSchema).openapi({
      description: "Empty unless `status` is `ok`, newest first.",
    }),
    statistics: z
      .union([PlanningApplicationStatisticsSchema, z.null()])
      .openapi({
        description: "`null` unless `status` is `ok`.",
      }),
  })
  .openapi("PlanningApplications", {
    description:
      "The Planning Applications received in the Search Area in the last 3 years, from a third-party provider: PlanIt, or PlanWire with a key (PRD FR-2.2, ADR 0003).",
  });

export const PlanningLayerResponseSchema = z
  .object({
    layer: z.literal("planning"),
    status: SourceStatusSchema.openapi({
      description:
        "How planning.data.gov.uk answered, for the Planning Constraints.",
    }),
    sources: z.array(SourceReportSchema).openapi({
      description:
        "The Data Sources behind the Layer that have answered, and how each did. The Planning Applications' provider is left out while its request is queued.",
    }),
    features: z.array(PlanningConstraintFeatureSchema).openapi({
      description: "The Planning Constraints. Empty unless `status` is `ok`.",
    }),
    statistics: z.union([PlanningStatisticsSchema, z.null()]).openapi({
      description: "The Planning Constraints'. `null` unless `status` is `ok`.",
    }),
    applications: z.union([PlanningApplicationsSchema, z.null()]).openapi({
      description:
        "The Planning Applications, which stand on their own. `GET /api/area/planning` always looks for them.",
    }),
  })
  .openapi("PlanningLayerResponse", {
    description:
      "The Planning Constraints that intersect the Search Area, from planning.data.gov.uk's entity data, with their count per type and whether the Location sits inside each type, and the Planning Applications received in it in the last 3 years (PRD FR-2.2). planning.data.gov.uk's `period` is the day its answer was obtained, which Historic England's statement for conservation areas and listed buildings names (FR-10.1). If planning.data.gov.uk is unavailable, `status` says so (NFR-1.2); the Planning Applications say how they are on their own.",
  });

export const AmenityTypeSchema = z.enum(AMENITY_TYPES).openapi("AmenityType", {
  description:
    "A kind of amenity (PRD FR-2.3). Each amenity has one: the first that its OpenStreetMap tags match, in this order: supermarket (`shop=supermarket`), convenience store (`shop=convenience`), hairdresser (`shop=hairdresser`), café (`amenity=cafe`), restaurant (`amenity=restaurant`), takeaway (`amenity=fast_food`), pub (`amenity=pub`), gym (`leisure=fitness_centre`), dentist (`amenity=dentist` or `healthcare=dentist`), nursery (`amenity=kindergarten` or `childcare`), healthcare (`amenity=doctors`, `clinic`, `hospital` or `pharmacy`, or any `healthcare`), then any other `shop`, then any `office`.",
});

const AmenityNameSchema = z.union([z.string(), z.null()]).openapi({
  description: "Its name in OpenStreetMap, or `null` if it has none.",
  example: "Costa",
});

export const AmenityFeatureSchema = z
  .object({
    id: z.string().openapi({
      description:
        "The OpenStreetMap element: `node/`, `way/` or `relation/` and its id.",
      example: "way/251921972",
    }),
    location: LocationSchema.openapi({
      description:
        "Where it is: a node's own point, or the middle of a way or relation, such as a building.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far it is from the Location in a straight line, in metres (PRD FR-2.10).",
      example: 110,
    }),
    type: AmenityTypeSchema,
    name: AmenityNameSchema,
    osmTag: z.string().openapi({
      description: "The OpenStreetMap tag that made it this type.",
      example: "amenity=cafe",
    }),
  })
  .openapi("AmenityFeature", {
    description:
      "One amenity mapped in OpenStreetMap inside the Search Area, as a Feature of the Amenities Layer (PRD FR-2.3).",
  });

export const NearestAmenitySchema = z
  .object({
    id: z.string().openapi({ example: "way/251921972" }),
    name: AmenityNameSchema,
    distanceMetres: z.number().min(0).openapi({ example: 110 }),
  })
  .openapi("NearestAmenity", {
    description: "The amenity of one type nearest the Location.",
  });

export const AmenityCountSchema = z
  .object({
    type: AmenityTypeSchema,
    count: CountSchema.openapi({ example: 11 }),
    nearest: z.union([NearestAmenitySchema, z.null()]).openapi({
      description: "`null` if there are none.",
    }),
  })
  .openapi("AmenityCount", {
    description:
      "How many amenities of one type are in the Search Area, and the nearest.",
  });

export const AmenityStatisticsSchema = z
  .object({
    total: CountSchema.openapi({
      description: "Amenities of every type together.",
      example: 197,
    }),
    byType: z.array(AmenityCountSchema).openapi({
      description: "Every type, in a fixed order, even with none.",
    }),
  })
  .openapi("AmenityStatistics", {
    description:
      "The Amenities Layer's statistics for the Location Overview (PRD FR-2.3).",
  });

export const AmenitiesLayerResponseSchema = z
  .object({
    layer: z.literal("amenities"),
    status: SourceStatusSchema,
    sources: z.array(SourceReportSchema).openapi({
      description: "The Data Sources behind the Layer, and how each answered.",
    }),
    features: z.array(AmenityFeatureSchema).openapi({
      description: "Empty unless `status` is `ok`.",
    }),
    statistics: z.union([AmenityStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("AmenitiesLayerResponse", {
    description:
      "The amenities OpenStreetMap maps in the Search Area, from the Overpass API, with their count and the nearest of each type (PRD FR-2.3). They come from the one Overpass query made for each Search Area (NFR-1.5), whose `period` is the date of Overpass's copy of OpenStreetMap. If Overpass is unavailable, `status` says so (NFR-1.2).",
  });

export const TransportTypeSchema = z
  .enum(TRANSPORT_TYPES)
  .openapi("TransportType", {
    description:
      "A kind of transport Feature (PRD FR-2.4): a railway station (`railway=station` or `halt`), bus stop (`highway=bus_stop`), car park (`amenity=parking`) or EV charger (`amenity=charging_station`), each at a point; or footpaths (`highway=footway`, `path`, `bridleway` or `steps`, leaving out pavements and crossings mapped as `footway=sidewalk` or `crossing`) or cycle routes (`highway=cycleway`, or a path with `bicycle=designated`), drawn as lines. Anything private (`access=private` or `no`) is left out.",
  });

export const TransportFacilityTypeSchema = z
  .enum(TRANSPORT_FACILITY_TYPES)
  .openapi("TransportFacilityType", {
    description: "A kind of transport Feature at a point.",
  });

export const TransportRouteTypeSchema = z
  .enum(TRANSPORT_ROUTE_TYPES)
  .openapi("TransportRouteType", {
    description: "A kind of transport Feature drawn as lines.",
  });

export const RouteShapeSchema = z
  .object({
    type: z.literal("MultiLineString"),
    coordinates: z
      .array(z.array(PositionSchema).min(2))
      .min(1)
      .openapi({ description: "Lines, each of two or more positions." }),
  })
  .openapi("RouteShape", {
    description:
      "Footpaths or cycle routes inside the Search Area, cut off at its edge, as a GeoJSON MultiLineString.",
  });

export const TransportFacilityFeatureSchema = z
  .object({
    id: z.string().openapi({
      description:
        "The OpenStreetMap element: `node/`, `way/` or `relation/` and its id.",
      example: "node/502386902",
    }),
    location: LocationSchema.openapi({
      description:
        "Where it is: a node's own point, or the middle of a way or relation, such as a car park.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far it is from the Location in a straight line, in metres (PRD FR-2.10).",
      example: 184,
    }),
    type: TransportFacilityTypeSchema,
    name: z.union([z.string(), z.null()]).openapi({
      description: "Its name in OpenStreetMap, or `null` if it has none.",
      example: "Silk Street",
    }),
    osmTag: z.string().openapi({
      description: "The OpenStreetMap tag that made it this type.",
      example: "highway=bus_stop",
    }),
    shape: z.null(),
    lengthMetres: z.null(),
  })
  .openapi("TransportFacilityFeature", {
    description:
      "A railway station, bus stop, car park or EV charger in the Search Area, as a Feature of the Transport Layer (PRD FR-2.4).",
  });

export const TransportRouteFeatureSchema = z
  .object({
    id: z.string().openapi({
      description: "`footpath` or `cycle-route`, as its type.",
      example: "footpath",
    }),
    location: LocationSchema.openapi({
      description:
        "Where the map marks it: the point of its lines nearest the Location.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far `location` is from the Location in a straight line, in metres (PRD FR-2.10).",
      example: 42,
    }),
    type: TransportRouteTypeSchema,
    name: z.null(),
    osmTag: z.null(),
    shape: RouteShapeSchema,
    lengthMetres: z.number().min(0).openapi({
      description:
        "How long its lines inside the Search Area are, end to end, in metres.",
      example: 9094,
    }),
  })
  .openapi("TransportRouteFeature", {
    description:
      "All the footpaths, or all the cycle routes, in the Search Area, as one Feature of the Transport Layer (PRD FR-2.4). OpenStreetMap maps them as many short ways, so all of each type are joined, and cut off at the Search Area's edge.",
  });

export const TransportFeatureSchema = z
  .union([TransportFacilityFeatureSchema, TransportRouteFeatureSchema])
  .openapi("TransportFeature", {
    description:
      "One Feature of the Transport Layer: a facility, or footpaths or cycle routes.",
  });

export const TransportFacilityCountSchema = z
  .object({
    type: TransportFacilityTypeSchema,
    count: CountSchema.openapi({ example: 58 }),
  })
  .openapi("TransportFacilityCount", {
    description: "How many facilities of one type are in the Search Area.",
  });

export const TransportRouteLengthSchema = z
  .object({
    type: TransportRouteTypeSchema,
    lengthMetres: z.number().min(0).openapi({ example: 9094 }),
  })
  .openapi("TransportRouteLength", {
    description:
      "How long the routes of one type inside the Search Area are, end to end, in metres.",
  });

export const NearestStationSchema = z
  .object({
    id: z.string().openapi({ example: "node/3170173970" }),
    name: z.union([z.string(), z.null()]).openapi({
      description: "Its name in OpenStreetMap, or `null` if it has none.",
      example: "Sutton Parkway",
    }),
    distanceMetres: z.number().min(0).openapi({ example: 1628 }),
    inSearchArea: z.boolean().openapi({
      description:
        "Whether it is inside the Search Area, and so a Feature of the Layer.",
    }),
  })
  .openapi("NearestStation", {
    description:
      "The railway station nearest the Location, which may be outside the Search Area.",
  });

export const TransportStatisticsSchema = z
  .object({
    facilities: z.array(TransportFacilityCountSchema).openapi({
      description: "Every type of facility, in a fixed order, even with none.",
    }),
    routes: z.array(TransportRouteLengthSchema).openapi({
      description: "Every type of route, in a fixed order, even with none.",
    }),
    nearestStation: z.union([NearestStationSchema, z.null()]).openapi({
      description:
        "The nearest railway station within `stationSearchMetres`, or `null` if there is none that close.",
    }),
    stationSearchMetres: z.number().min(0).openapi({
      description:
        "How far from the Location the nearest railway station is looked for, in metres.",
      example: 5000,
    }),
  })
  .openapi("TransportStatistics", {
    description:
      "The Transport Layer's statistics for the Location Overview (PRD FR-2.4).",
  });

export const TransportLayerResponseSchema = z
  .object({
    layer: z.literal("transport"),
    status: SourceStatusSchema,
    sources: z.array(SourceReportSchema).openapi({
      description: "The Data Sources behind the Layer, and how each answered.",
    }),
    features: z.array(TransportFeatureSchema).openapi({
      description: "Empty unless `status` is `ok`.",
    }),
    statistics: z.union([TransportStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("TransportLayerResponse", {
    description:
      "The railway stations, bus stops, car parks, EV chargers, footpaths and cycle routes OpenStreetMap maps in the Search Area, from the Overpass API, with their counts, the distance to the nearest railway station and the length of footpath and cycle route (PRD FR-2.4). They come from the one Overpass query made for each Search Area (NFR-1.5), whose `period` is the date of Overpass's copy of OpenStreetMap. If Overpass is unavailable, `status` says so (NFR-1.2).",
  });

export const GreenSpaceTypeSchema = z
  .enum(GREEN_SPACE_TYPES)
  .openapi("GreenSpaceType", {
    description:
      "A kind of green space (PRD FR-2.5). Each has one: the first that its OpenStreetMap tags match, in this order: park (`leisure=park`), playground (`leisure=playground`), nature reserve (`leisure=nature_reserve`), wood (`natural=wood` or `landuse=forest`). Anything private (`access=private` or `no`) is left out.",
  });

export const GreenSpaceFeatureSchema = z
  .object({
    id: z.string().openapi({
      description:
        "The OpenStreetMap element: `node/`, `way/` or `relation/` and its id.",
      example: "way/309700889",
    }),
    location: LocationSchema.openapi({
      description:
        "Where the map marks it: the point of its outline nearest the Location, which is the Location itself if the Location is inside it, or its own point if OpenStreetMap maps it only as a point.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far `location` is from the Location in a straight line, in metres (PRD FR-2.10): 0 if the Location is inside it.",
      example: 391,
    }),
    type: GreenSpaceTypeSchema,
    name: z.union([z.string(), z.null()]).openapi({
      description: "Its name in OpenStreetMap, or `null` if it has none.",
      example: "Sutton Lawn",
    }),
    osmTag: z.string().openapi({
      description: "The OpenStreetMap tag that made it this type.",
      example: "leisure=park",
    }),
    coversLocation: z.boolean().openapi({
      description: "Whether the Location sits inside it.",
    }),
    shape: z.union([ConstraintShapeSchema, z.null()]).openapi({
      description:
        "Its outline, or `null` for one OpenStreetMap maps only as a point.",
    }),
  })
  .openapi("GreenSpaceFeature", {
    description:
      "A park, playground, nature reserve or wood that reaches into the Search Area, as a Feature of the Green space Layer (PRD FR-2.5).",
  });

export const GreenSpaceCountSchema = z
  .object({
    type: GreenSpaceTypeSchema,
    count: CountSchema.openapi({ example: 10 }),
  })
  .openapi("GreenSpaceCount", {
    description: "How many green spaces of one type are in the Search Area.",
  });

export const NearestParkSchema = z
  .object({
    id: z.string().openapi({ example: "way/309700889" }),
    name: z.union([z.string(), z.null()]).openapi({
      description: "Its name in OpenStreetMap, or `null` if it has none.",
      example: "Sutton Lawn",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far the nearest point of it is, in metres: 0 if the Location is inside it.",
      example: 391,
    }),
    inSearchArea: z.boolean().openapi({
      description:
        "Whether it reaches into the Search Area, and so is a Feature of the Layer.",
    }),
    coversLocation: z.boolean().openapi({
      description: "Whether the Location sits inside it.",
    }),
  })
  .openapi("NearestPark", {
    description:
      "The park nearest the Location, which may be outside the Search Area.",
  });

export const GreenSpaceStatisticsSchema = z
  .object({
    total: CountSchema.openapi({
      description: "Green spaces of every type together.",
      example: 14,
    }),
    byType: z.array(GreenSpaceCountSchema).openapi({
      description: "Every type, in a fixed order, even with none.",
    }),
    nearestPark: z.union([NearestParkSchema, z.null()]).openapi({
      description:
        "The nearest park within `parkSearchMetres`, or `null` if there is none that close.",
    }),
    parkSearchMetres: z.number().min(0).openapi({
      description:
        "How far from the Location the nearest park is looked for, in metres.",
      example: 2000,
    }),
  })
  .openapi("GreenSpaceStatistics", {
    description:
      "The Green space Layer's statistics for the Location Overview (PRD FR-2.5).",
  });

export const GreenSpaceLayerResponseSchema = z
  .object({
    layer: z.literal("green-space"),
    status: SourceStatusSchema,
    sources: z.array(SourceReportSchema).openapi({
      description: "The Data Sources behind the Layer, and how each answered.",
    }),
    features: z.array(GreenSpaceFeatureSchema).openapi({
      description: "Empty unless `status` is `ok`.",
    }),
    statistics: z.union([GreenSpaceStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("GreenSpaceLayerResponse", {
    description:
      "The parks, playgrounds, nature reserves and woods OpenStreetMap maps in the Search Area, from the Overpass API, with their outlines, their count and the distance to the nearest park (PRD FR-2.5). They come from the one Overpass query made for each Search Area (NFR-1.5), whose `period` is the date of Overpass's copy of OpenStreetMap. If Overpass is unavailable, `status` says so (NFR-1.2).",
  });

export const PropertyTypeSchema = z
  .enum(PROPERTY_TYPES)
  .openapi("PropertyType", {
    description:
      "The kind of property sold, as Price Paid records it (PRD FR-2.6): detached, semi-detached, terraced, flat (a flat or maisonette), or other, such as a shop, an office or land.",
  });

export const TenureSchema = z.enum(TENURES).openapi("Tenure", {
  description: "Whether a property was sold freehold or leasehold.",
});

/** A price in whole pounds. */
const PriceSchema = z.number().int().min(0);

/** A change in per cent, to one decimal place, or `null`. */
const ChangeSchema = z.union([z.number(), z.null()]);

export const AddressSaleSchema = z
  .object({
    id: z.string().openapi({
      description: "Price Paid's transaction id.",
      example: "44F406B6-B93C-1095-E063-4704A8C048D4",
    }),
    price: PriceSchema.openapi({
      description: "What it sold for, in whole pounds.",
      example: 183500,
    }),
    date: DateSchema.openapi({
      description: "The day the sale completed.",
      example: "2024-10-06",
    }),
    change: ChangeSchema.openapi({
      description:
        "The change in price from the sale before it at the address, in per cent to one decimal place, or `null` for the first sale Price Paid records there.",
      example: -5.7,
    }),
  })
  .openapi("AddressSale", {
    description:
      "One sale Price Paid records at a property's address, in its history (PRD FR-2.12).",
  });

export const EpcBandSchema = z.enum(EPC_BANDS).openapi("EpcBand", {
  description:
    "An Energy Performance Certificate's energy efficiency band, from A, the most efficient, to G.",
});

export const SaleEpcDetailsSchema = z
  .object({
    potentialBand: z.union([EpcBandSchema, z.null()]).openapi({
      description:
        "The band its improvements could bring it to, or `null` if the certificate doesn't say.",
      example: "B",
    }),
    floorAreaSquareMetres: z.union([z.number().positive(), z.null()]).openapi({
      description:
        "Its total floor area in m², measured to the inside of its outside walls, or `null` if the certificate gives none.",
      example: 92,
    }),
    pricePerSquareMetre: z.union([PriceSchema, z.null()]).openapi({
      description: `The sale's price over its floor area, in whole pounds, or \`null\` if the certificate gives none, or one under ${String(EPC_RULES.minFloorAreaSquareMetres)} m² or over ${String(EPC_RULES.maxFloorAreaSquareMetres)} m², which is taken for a mistake.`,
      example: 1880,
    }),
  })
  .openapi("SaleEpcDetails", {
    description:
      "What a sale's certificate says beyond its search result, from the EPC API's certificate.",
  });

export const SaleEpcSchema = z
  .object({
    certificateNumber: z.string().openapi({
      description:
        "The register's certificate number. Its address is never given: the EPC licence allows it only for energy-efficiency purposes (OQ-8).",
      example: "9901-0000-0000-0000-0001",
    }),
    registrationDate: DateSchema.openapi({
      description: "The day it was registered.",
      example: "2019-03-14",
    }),
    currentBand: z.union([EpcBandSchema, z.null()]).openapi({
      description: "Its band, or `null` if it doesn't say.",
      example: "D",
    }),
    details: z.union([SaleEpcDetailsSchema, z.null()]).openapi({
      description: "`null` if the EPC API didn't answer for the certificate.",
    }),
  })
  .openapi("SaleEpc", {
    description:
      "The Energy Performance Certificate a sale was matched to (PRD FR-2.6): the one current when it sold, of the one property in its postcode whose certificates fit its flat, house number or name and street.",
  });

export const SaleEpcMatchSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("matched"), certificate: SaleEpcSchema }),
    z.object({ status: z.literal("unmatched") }),
    z.object({ status: z.literal("unavailable") }),
  ])
  .openapi("SaleEpcMatch", {
    description:
      "Whether a sale was matched to an Energy Performance Certificate in its postcode (PRD FR-2.6): `matched`, with its certificate; `unmatched`, when no property's certificates fit its address, or more than one property's did; or `unavailable`, when the EPC API didn't answer for its postcode.",
  });

export const PropertySaleFeatureSchema = z
  .object({
    id: z.string().openapi({
      description: "Price Paid's transaction id.",
      example: "5A7B802C-F597-1886-E063-4704A8C021AE",
    }),
    location: LocationSchema.openapi({
      description:
        "The middle of its postcode, from postcodes.io: Price Paid gives no point for a property, so every sale in one postcode is at the same point.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far `location` is from the Location in a straight line, in metres (PRD FR-2.10).",
      example: 111,
    }),
    price: PriceSchema.openapi({
      description: "What it sold for, in whole pounds.",
      example: 173000,
    }),
    date: DateSchema.openapi({
      description: "The day the sale completed.",
      example: "2026-05-29",
    }),
    type: PropertyTypeSchema,
    tenure: TenureSchema,
    newBuild: z.boolean().openapi({
      description: "Whether it was newly built when sold.",
    }),
    address: z.string().openapi({
      description:
        "Its address as Price Paid records it, in capitals, without its postcode.",
      example: "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
    }),
    postcode: z.string().openapi({ example: "NG17 1BT" }),
    history: z.union([z.array(AddressSaleSchema), z.null()]).openapi({
      description:
        "Every sale Price Paid records at its address since 1995, newest first, this one among them, each with the change in price from the sale before (PRD FR-2.12). `null` if Price Paid didn't answer for them.",
    }),
    epc: z.union([SaleEpcMatchSchema, z.null()]).openapi({
      description:
        "Its Energy Performance Certificate (PRD FR-2.6), or `null` if EPCs aren't looked for: without `EPC_API_KEY`, or for property of type `other`, which the register of homes doesn't cover.",
    }),
  })
  .openapi("PropertySaleFeature", {
    description:
      "A sale in the Search Area recorded in HM Land Registry's Price Paid Data, as a Feature of the Property Layer (PRD FR-2.6).",
  });

const priceSummaryShape = {
  count: CountSchema.openapi({ example: 24 }),
  median: z.union([PriceSchema, z.null()]).openapi({
    description:
      "The median price in whole pounds, or `null` if there were no sales.",
    example: 182000,
  }),
  mean: z.union([PriceSchema, z.null()]).openapi({
    description:
      "The mean price in whole pounds, or `null` if there were no sales.",
    example: 187000,
  }),
};

export const PriceSummarySchema = z
  .object(priceSummaryShape)
  .openapi("PriceSummary", {
    description: "How many sales there were, and their median and mean price.",
  });

export const PropertyTypePricesSchema = z
  .object({ type: PropertyTypeSchema, ...priceSummaryShape })
  .openapi("PropertyTypePrices", {
    description: "The sales of one type of property.",
  });

export const TenurePricesSchema = z
  .object({ tenure: TenureSchema, ...priceSummaryShape })
  .openapi("TenurePrices", {
    description: "The sales of one tenure.",
  });

export const NewBuildPricesSchema = z
  .object({
    newBuild: z.boolean().openapi({
      description: "Whether these are the sales of new builds, or of the rest.",
    }),
    ...priceSummaryShape,
  })
  .openapi("NewBuildPrices", {
    description: "The sales of new builds, or of the rest.",
  });

export const MedianPriceChangeSchema = z
  .object({
    period: z
      .object({
        from: DateSchema.openapi({ example: "2024-10-09" }),
        to: DateSchema.openapi({ example: "2025-10-08" }),
      })
      .openapi({ description: "The earlier 12 months, as ISO 8601 dates." }),
    prices: z.union([PriceSummarySchema, z.null()]).openapi({
      description:
        "The sales in those 12 months, in the same postcodes, or `null` if Price Paid didn't answer for them.",
    }),
    change: ChangeSchema.openapi({
      description:
        "The change in median price from then to the last 12 months, in per cent to one decimal place. `null` if Price Paid didn't answer, or there were no sales then or in the last 12 months.",
      example: 7.1,
    }),
  })
  .openapi("MedianPriceChange", {
    description:
      "The last 12 months' median price against an earlier 12 months', in the same postcodes (PRD FR-2.6).",
  });

export const PostcodeCoverageSchema = z
  .object({
    searched: CountSchema.openapi({
      description: "How many postcodes in the Search Area were searched.",
      example: 100,
    }),
    limit: CountSchema.openapi({
      description: "The most postcodes postcodes.io gives.",
      example: 100,
    }),
    truncated: z.boolean().openapi({
      description:
        "Whether postcodes.io gave as many as `limit`, so the Search Area may have more postcodes, further from the Location, whose sales are left out.",
    }),
    reachMetres: z.union([z.number().min(0), z.null()]).openapi({
      description:
        "How far the furthest postcode searched is from the Location, in metres, or `null` if there are none.",
      example: 430,
    }),
  })
  .openapi("PostcodeCoverage", {
    description:
      "The postcodes whose sales were looked for (PRD FR-2.8): Price Paid is searched by postcode, so these are the postcodes postcodes.io gives in the Search Area, nearest first.",
  });

export const PropertyStatisticsSchema = z
  .object({
    period: z
      .object({
        from: DateSchema.openapi({ example: "2025-10-09" }),
        to: DateSchema.openapi({ example: "2026-10-08" }),
      })
      .openapi({
        description:
          "The 12 months searched, up to and including today, as ISO 8601 dates.",
      }),
    all: PriceSummarySchema,
    byType: z.array(PropertyTypePricesSchema).openapi({
      description: "Every type, in a fixed order, even with none.",
    }),
    byTenure: z.array(TenurePricesSchema).openapi({
      description: "Freehold, then leasehold, even with none.",
    }),
    byNewBuild: z.array(NewBuildPricesSchema).openapi({
      description: "New builds, then the rest, even with none.",
    }),
    medianChange: z
      .object({
        twelveMonths: MedianPriceChangeSchema,
        fiveYears: MedianPriceChangeSchema,
      })
      .openapi({
        description:
          "The median price against the 12 months a year before, and the 12 months five years before.",
      }),
    postcodes: PostcodeCoverageSchema,
  })
  .openapi("PropertyStatistics", {
    description:
      "The Property Layer's statistics for the Location Overview (PRD FR-2.6).",
  });

export const EpcBandCountSchema = z
  .object({
    band: EpcBandSchema,
    count: CountSchema.openapi({ example: 12 }),
  })
  .openapi("EpcBandCount", {
    description: "How many homes' latest certificates are in one band.",
  });

export const EpcStatisticsSchema = z
  .object({
    byBand: z.array(EpcBandCountSchema).openapi({
      description:
        "The homes with a certificate in the postcodes searched, each counted once, by its latest certificate's band: every band from A to G, even with none.",
    }),
    homes: CountSchema.openapi({
      description:
        "How many homes have a certificate, those without a band among them.",
      example: 412,
    }),
    postcodes: z
      .object({
        searched: CountSchema.openapi({
          description:
            "The postcodes asked for their certificates: those Price Paid was searched in.",
          example: 100,
        }),
        unanswered: CountSchema.openapi({
          description:
            "How many the EPC API didn't answer for, whose certificates are left out.",
          example: 0,
        }),
      })
      .openapi({ description: "The postcodes asked for their certificates." }),
    sales: z
      .object({
        lookedFor: CountSchema.openapi({
          description:
            "How many sales of houses and flats were looked for in their postcodes' certificates.",
          example: 20,
        }),
        matched: CountSchema.openapi({
          description: "How many were matched to one property's certificate.",
          example: 19,
        }),
      })
      .openapi({
        description: "The sales of houses and flats in the last 12 months.",
      }),
    pricePerSquareMetre: PriceSummarySchema.openapi({
      description:
        "The price per m² of the sales matched to a certificate with a plausible floor area: their count, median and mean in whole pounds.",
    }),
  })
  .openapi("EpcStatistics", {
    description:
      "The Energy Performance Certificates in the Search Area's postcodes, and the sales matched to them (PRD FR-2.6).",
  });

export const PropertyEpcSchema = z
  .object({
    status: z.enum(["ok", "unavailable"]).openapi({
      description:
        "`unavailable` if the EPC API answered for no postcode, when there are no statistics.",
    }),
    statistics: z.union([EpcStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("PropertyEpc", {
    description:
      "The Property Layer's Energy Performance Certificates (PRD FR-2.6), from MHCLG's Energy Performance of Buildings Data API.",
  });

export const PropertyLayerResponseSchema = z
  .object({
    layer: z.literal("property"),
    status: SourceStatusSchema,
    sources: z.array(SourceReportSchema).openapi({
      description:
        "The Data Sources behind the Layer, and how each answered: postcodes.io, then Price Paid, which is not asked if postcodes.io fails, then, with `EPC_API_KEY`, the EPC API, `ok` if it answered for any postcode.",
    }),
    features: z.array(PropertySaleFeatureSchema).openapi({
      description: "Newest first. Empty unless `status` is `ok`.",
    }),
    statistics: z.union([PropertyStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
    epc: z.union([PropertyEpcSchema, z.null()]).openapi({
      description:
        "Their Energy Performance Certificates, or `null` if they aren't looked for: without `EPC_API_KEY`, or unless `status` is `ok`.",
    }),
  })
  .openapi("PropertyLayerResponse", {
    description:
      "The sales in the Search Area in the last 12 months, from HM Land Registry's Price Paid Data, with their count, median and mean price by property type, tenure and new build, the change in median price from a year and five years before (PRD FR-2.6), and every sale at each one's address since 1995 (FR-2.12). Price Paid is searched by postcode, so the postcodes in the Search Area come from postcodes.io first, at most 100 of them (FR-2.8). If either source is unavailable, `status` says so (NFR-1.2). With `EPC_API_KEY`, MHCLG's Energy Performance of Buildings Data API is asked for every certificate in the same postcodes, at most 6 requests at once: the homes are counted by band, and each sale of a house or flat is matched to a certificate by its flat, house number or name and street, for its band and, with a plausible floor area, its price per m² (FR-2.6). If the EPC API is unavailable, only the EPCs are missing, and the EPC API is reported among `sources`.",
  });

export const AgeGroupSchema = z.enum(AGE_GROUPS).openapi("AgeGroup", {
  description:
    "A group of ages the Search Area's age profile is given in (PRD FR-2.7a): under 15, 15 to 24, 25 to 44, 45 to 64, and 65 and over.",
});

/** A decile of the Index of Multiple Deprivation, where 1 is the most deprived. */
const DecileSchema = z.number().int().min(1).max(10);

export const LsoaSchema = z
  .object({
    code: z.string().openapi({ example: "E01027976" }),
    name: z.string().openapi({ example: "Ashfield 005E" }),
  })
  .openapi("Lsoa", {
    description:
      "A lower layer super output area (LSOA): a few output areas together.",
  });

export const OutputAreaFeatureSchema = z
  .object({
    id: z.string().openapi({
      description: "The output area's ONS code.",
      example: "E00142547",
    }),
    location: LocationSchema.openapi({
      description:
        "Where the map marks it: a point of it inside the Search Area.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description: "How far that point is from the Location, in metres.",
      example: 40,
    }),
    lsoa: z.union([LsoaSchema, z.null()]).openapi({
      description: "The LSOA it is in, or `null` if ONS's lookup gives none.",
    }),
    msoaCode: z.union([z.string(), z.null()]).openapi({
      description:
        "The ONS code of the MSOA it is in, or `null` if ONS's lookup gives none.",
      example: "E02005823",
    }),
    population: CountSchema.openapi({
      description: "Its usual residents in Census 2021.",
      example: 239,
    }),
    households: CountSchema.openapi({
      description: "Its households in Census 2021.",
      example: 140,
    }),
    populationDensity: z.number().min(0).openapi({
      description: "Its residents per km², as Census 2021 gives it.",
      example: 2725.2,
    }),
    medianAge: z.union([z.number().min(0), z.null()]).openapi({
      description:
        "The median age of its residents, from their five-year age bands, to one decimal place.",
      example: 44.6,
    }),
    householdIncome: z.union([z.number().min(0), z.null()]).openapi({
      description:
        "Its MSOA's average total annual household income in pounds, from ONS's small area income estimates, or `null` if they give none.",
      example: 33525,
    }),
    deprivationDecile: z.union([DecileSchema, z.null()]).openapi({
      description:
        "Its LSOA's decile of the Index of Multiple Deprivation, where 1 is the most deprived 10% of LSOAs in England, or `null` if it has none.",
      example: 2,
    }),
    overlap: z.number().min(0).max(1).openapi({
      description:
        "The share of it inside the Search Area, from 0 to 1, to three decimal places.",
      example: 1,
    }),
    coversLocation: z.boolean().openapi({
      description: "Whether the Location sits inside it.",
    }),
    shape: ConstraintShapeSchema.openapi({ description: "Its outline." }),
  })
  .openapi("OutputAreaFeature", {
    description:
      "A Census 2021 output area that reaches into the Search Area, as a Feature of the Demographics Layer, which the map shades by a measure chosen (PRD FR-2.7a).",
  });

export const AgeGroupCountSchema = z
  .object({
    group: AgeGroupSchema,
    population: CountSchema.openapi({ example: 1520 }),
    percent: z.number().min(0).openapi({
      description:
        "Their share of the Search Area's estimated population, in per cent, to one decimal place.",
      example: 17.1,
    }),
  })
  .openapi("AgeGroupCount", {
    description:
      "How many of the Search Area's residents are estimated to be in one age group.",
  });

export const HouseholdIncomeSchema = z
  .object({
    averagePounds: z.number().min(0).openapi({
      description:
        "The MSOAs' average total annual household incomes in pounds, weighed by the households estimated to be in the Search Area in each, to the pound.",
      example: 40210,
    }),
    msoas: CountSchema.openapi({
      description: "How many MSOAs the Search Area reaches into.",
      example: 5,
    }),
    englandMedianPounds: z.number().min(0).openapi({
      description:
        "The median of every English MSOA's average total annual household income in pounds, from the same estimates, for comparing with. Demand scores the Search Area's income against it.",
      example: 44091,
    }),
  })
  .openapi("HouseholdIncome", {
    description:
      "The average household income across the MSOAs in the Search Area, and England's median.",
  });

export const LsoaDeprivationSchema = z
  .object({
    code: z.string().openapi({ example: "E01027976" }),
    name: z.string().openapi({ example: "Ashfield 005E" }),
    decile: DecileSchema.openapi({
      description:
        "Its decile, where 1 is the most deprived 10% of LSOAs in England.",
      example: 2,
    }),
    rank: CountSchema.openapi({
      description:
        "Its rank among England's LSOAs, where 1 is the most deprived.",
      example: 4630,
    }),
  })
  .openapi("LsoaDeprivation", {
    description: "An LSOA's place in the Index of Multiple Deprivation.",
  });

export const DeprivationSchema = z
  .object({
    atLocation: z.union([LsoaDeprivationSchema, z.null()]).openapi({
      description:
        "The LSOA the Location is in, or `null` if it has no decile.",
    }),
    lowestDecile: DecileSchema.openapi({
      description:
        "The most deprived decile of any LSOA the Search Area reaches into.",
      example: 1,
    }),
    highestDecile: DecileSchema.openapi({
      description: "The least deprived.",
      example: 6,
    }),
    lsoas: CountSchema.openapi({
      description: "How many LSOAs the Search Area reaches into.",
      example: 14,
    }),
  })
  .openapi("Deprivation", {
    description: "The deprivation of the Search Area's LSOAs.",
  });

export const DemographicsStatisticsSchema = z
  .object({
    outputAreas: CountSchema.openapi({
      description: "How many output areas reach into the Search Area.",
      example: 39,
    }),
    population: CountSchema.openapi({
      description:
        "The estimated population of the Search Area, to the person.",
      example: 8902,
    }),
    households: CountSchema.openapi({
      description: "The estimated households in the Search Area.",
      example: 4128,
    }),
    ageProfile: z.array(AgeGroupCountSchema).openapi({
      description: "Every age group, in a fixed order.",
    }),
    medianAge: z.union([z.number().min(0), z.null()]).openapi({
      description:
        "The median age of the estimated population, to one decimal place, or `null` with no residents.",
      example: 41.2,
    }),
    householdIncome: z.union([HouseholdIncomeSchema, z.null()]).openapi({
      description:
        "`null` if no MSOA in the Search Area has an income estimate.",
    }),
    deprivation: z.union([DeprivationSchema, z.null()]).openapi({
      description: "`null` if no LSOA in the Search Area has a decile.",
    }),
  })
  .openapi("DemographicsStatistics", {
    description:
      "The Demographics Layer's statistics for the Location Overview (PRD FR-2.7a). The population, households and age profile are estimated from the output areas the Search Area reaches into, each counted in proportion to the share of it inside the Search Area.",
  });

export const DemographicsLayerResponseSchema = z
  .object({
    layer: z.literal("demographics"),
    status: SourceStatusSchema,
    sources: z.array(SourceReportSchema).openapi({
      description:
        "The prepared datasets behind the Layer, and how each was read. Each `period` is the date its data dates from.",
    }),
    features: z.array(OutputAreaFeatureSchema).openapi({
      description: "Empty unless `status` is `ok`.",
    }),
    statistics: z.union([DemographicsStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("DemographicsLayerResponse", {
    description:
      "The Census 2021 output areas that reach into the Search Area, with their population, age and households, their MSOA's household income from ONS's small area income estimates, and their LSOA's decile of the English Indices of Deprivation, with the Search Area's estimated population, households, age profile, income and deprivation (PRD FR-2.7a). They come from the England-wide files `pnpm data:prepare` prepares (FR-6.0); before it has run, `status` is `not-prepared` (FR-6.6).",
  });

export const SchoolPhaseSchema = z.enum(SCHOOL_PHASES).openapi("SchoolPhase", {
  description:
    "A school's phase (PRD FR-2.3a), from the Get Information about Schools register: independent schools by their type group, state-funded special schools and alternative provision (such as pupil referral units) by their type, and the rest by their phase of education, middle schools as GIAS deems them. An all-through school teaches primary and secondary pupils.",
});

export const OfstedJudgementSchema = z
  .enum(OFSTED_JUDGEMENTS)
  .openapi("OfstedJudgement", {
    description:
      "A school's latest Ofsted judgement: an overall grade (`outstanding` to `inadequate`) from a graded inspection between September 2019 and August 2024, or an earlier one an ungraded inspection says it keeps; `report-card`, a report card from November 2025, which grades each evaluation area but gives no overall grade; `no-overall-grade`, an inspection that gave none, a graded one from September 2024 to November 2025 or an ungraded one that names no grade; or `none`, no inspection in Ofsted's data on state-funded schools, as for a new school or an independent school.",
  });

export const OfstedGradeSchema = z.enum(OFSTED_GRADES).openapi("OfstedGrade", {
  description:
    "A grade Ofsted gives: `outstanding` to `inadequate` on a graded inspection from September 2019, or `exceptional` to `urgent-improvement` on a report card's evaluation areas from November 2025.",
});

export const OfstedAreaGradeSchema = z
  .object({
    area: TextSchema.openapi({
      description: "The area graded, as Ofsted names it.",
      example: "Achievement",
    }),
    grade: OfstedGradeSchema,
  })
  .openapi("OfstedAreaGrade", { description: "One area Ofsted graded." });

export const OfstedInspectionSchema = z
  .object({
    kind: z.enum(OFSTED_INSPECTION_KINDS).openapi({
      description:
        "How it was made: a report card, a graded inspection, or an ungraded one.",
    }),
    inspectedOn: DateSchema.openapi({
      description: "The first day of the inspection.",
      example: "2026-04-21",
    }),
    grades: z.array(OfstedAreaGradeSchema).openapi({
      description:
        "The area grades it gave, in Ofsted's order: a report card's evaluation areas, or a graded inspection's key judgements. Empty for an ungraded inspection.",
    }),
    safeguardingMet: z.union([z.boolean(), z.null()]).openapi({
      description:
        "Whether it found safeguarding effective, or its standards met, or `null` if it doesn't say.",
    }),
    outcome: z.union([TextSchema, z.null()]).openapi({
      description:
        "An ungraded inspection's outcome, in Ofsted's words, or else `null`.",
      example: "School remains Good",
    }),
    ofPredecessor: z.boolean().openapi({
      description:
        "Whether it inspected the school this one replaced, such as the maintained school an academy converted from.",
    }),
  })
  .openapi("OfstedInspection", {
    description:
      "The inspection a school's latest Ofsted judgement comes from, from Ofsted's management information on state-funded schools.",
  });

const AgesSchema = z.number().int().min(0).max(100);

export const SchoolFeatureSchema = z
  .object({
    id: z.string().openapi({
      description: "Its URN, the number GIAS and Ofsted know it by.",
      example: "139063",
    }),
    location: LocationSchema,
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far it is from the Location in a straight line, in metres (PRD FR-2.10).",
      example: 220,
    }),
    name: TextSchema.openapi({ example: "Sutton Community Academy" }),
    phase: SchoolPhaseSchema,
    establishmentType: TextSchema.openapi({
      description: "Its type, as GIAS names it.",
      example: "Academy sponsor led",
    }),
    ages: z
      .union([z.object({ from: AgesSchema, to: AgesSchema }), z.null()])
      .openapi({
        description:
          "The ages it may teach, as GIAS gives them, or `null` if it gives none.",
        example: { from: 11, to: 16 },
      }),
    judgement: OfstedJudgementSchema,
    inspection: z.union([OfstedInspectionSchema, z.null()]).openapi({
      description:
        "The inspection `judgement` comes from, or `null` if it is `none`.",
    }),
    inspectorate: z.union([TextSchema, z.null()]).openapi({
      description:
        "Who inspects an independent school, as GIAS names it (`ISI`, the Independent Schools Inspectorate, or `Ofsted`), or else `null`.",
      example: null,
    }),
  })
  .openapi("SchoolFeature", {
    description:
      "A school open in the Search Area, from the GIAS register, with its latest Ofsted judgement, as a Feature of the Schools Layer (PRD FR-2.3a).",
  });

export const SchoolJudgementCountSchema = z
  .object({
    judgement: OfstedJudgementSchema,
    count: CountSchema.openapi({ example: 4 }),
  })
  .openapi("SchoolJudgementCount", {
    description: "How many schools have one latest Ofsted judgement.",
  });

export const SchoolPhaseCountSchema = z
  .object({
    phase: SchoolPhaseSchema,
    count: CountSchema.openapi({ example: 6 }),
    byJudgement: z.array(SchoolJudgementCountSchema).openapi({
      description: "Every judgement, in a fixed order, even with none.",
    }),
  })
  .openapi("SchoolPhaseCount", {
    description:
      "How many schools of one phase are in the Search Area, by their latest Ofsted judgement.",
  });

export const NearestSchoolSchema = z
  .object({
    id: z.string().openapi({ example: "139063" }),
    name: TextSchema.openapi({ example: "Sutton Community Academy" }),
    phase: SchoolPhaseSchema,
    distanceMetres: z.number().min(0).openapi({ example: 220 }),
    inSearchArea: z.boolean().openapi({
      description:
        "Whether it is in the Search Area, and so a Feature of the Layer.",
    }),
    judgement: OfstedJudgementSchema,
    inspection: z.union([OfstedInspectionSchema, z.null()]),
  })
  .openapi("NearestSchool", {
    description:
      "The school of a phase nearest the Location, which may be outside the Search Area.",
  });

export const SchoolStatisticsSchema = z
  .object({
    total: CountSchema.openapi({
      description: "Schools of every phase together.",
      example: 11,
    }),
    byPhase: z.array(SchoolPhaseCountSchema).openapi({
      description: "Every phase, in a fixed order, even with none.",
    }),
    byJudgement: z.array(SchoolJudgementCountSchema).openapi({
      description:
        "Every judgement, of every phase together, in a fixed order, even with none.",
    }),
    nearestPrimary: z.union([NearestSchoolSchema, z.null()]).openapi({
      description:
        "The nearest primary or all-through school within `primarySearchMetres`, or `null` if there is none that close.",
    }),
    primarySearchMetres: z.number().min(0).openapi({
      description:
        "How far from the Location the nearest primary school is looked for, in metres: as far as the Schools score gives points for one.",
      example: 2400,
    }),
    nearestSecondary: z.union([NearestSchoolSchema, z.null()]).openapi({
      description:
        "The nearest secondary or all-through school within `secondarySearchMetres`, or `null` if there is none that close.",
    }),
    secondarySearchMetres: z.number().min(0).openapi({ example: 6000 }),
  })
  .openapi("SchoolStatistics", {
    description:
      "The Schools Layer's statistics for the Location Overview (PRD FR-2.3a).",
  });

export const SchoolsLayerResponseSchema = z
  .object({
    layer: z.literal("schools"),
    status: SourceStatusSchema,
    sources: z.array(SourceReportSchema).openapi({
      description:
        "The prepared datasets behind the Layer, and how each was read. Each `period` is the date its data dates from.",
    }),
    features: z.array(SchoolFeatureSchema).openapi({
      description: "Empty unless `status` is `ok`.",
    }),
    statistics: z.union([SchoolStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("SchoolsLayerResponse", {
    description:
      "The schools open in the Search Area, by phase, with their latest Ofsted judgement, their counts, and the nearest primary and secondary school (PRD FR-2.3a). They come from the GIAS register and Ofsted's latest inspections of state-funded schools, which `pnpm data:prepare` prepares (FR-6.0); before it has run, `status` is `not-prepared` (FR-6.6).",
  });

const ShareSchema = z.number().min(0).max(1);

export const OwnershipCategorySchema = z
  .enum(OWNERSHIP_CATEGORIES)
  .openapi("OwnershipCategory", {
    description:
      "An indicative Ownership Category (PRD FR-5.4a): company-owned or council or public-body owned where a title in HM Land Registry's CCOD or OCOD is matched to the land's INSPIRE Index Polygon by its address, other registered where none is, or Possibly Unregistered. Few titles can be matched, so other registered land may well be held by a company or a council too. It never names or confirms an owner.",
  });

export const MatchedTitleSchema = z
  .object({
    titleNumber: TextSchema.openapi({
      description: "HM Land Registry's title number.",
      example: "ZZ200001",
    }),
    propertyAddress: TextSchema.openapi({
      description:
        "Its Property Address, as the register gives it, which it was matched by.",
      example: "Metal Craft Group, Sutton-in-Ashfield (NG17 7LE)",
    }),
    proprietorshipCategory: TextSchema.openapi({
      description:
        "Its first proprietor's Proprietorship Category, as the dataset gives it.",
      example: "Limited Company or Public Limited Company",
    }),
    ownershipCategory: z.enum(["company", "council-or-public-body"]),
    dataset: z.enum(TITLE_DATASETS).openapi({
      description:
        "`ccod`: UK companies that own property in England and Wales. `ocod`: overseas companies.",
    }),
    sourceDate: TextSchema.openapi({
      description: "When the dataset's data dates from.",
      example: "2026-10-02",
    }),
    matchedBy: z.enum(TITLE_MATCHED_BY).openapi({
      description:
        "`address`: its house number and street, at an OpenStreetMap address inside the polygon. `named`: the building it names, as OpenStreetMap maps it.",
    }),
    inspireId: TextSchema.openapi({
      description: "The INSPIRE Index Polygon it is matched to.",
      example: "25709295",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far that polygon is from the Land Parcel, in metres: 0 if it overlaps it.",
      example: 9,
    }),
  })
  .openapi("MatchedTitle", {
    description:
      "A company's or council's registered title, from HM Land Registry's CCOD or OCOD, matched to one INSPIRE Index Polygon by its address (PRD FR-5.4a). The match is indicative. Its proprietors are not named. Information produced by HM Land Registry. © Crown copyright.",
  });

export const InspireOverlapSchema = z
  .object({
    inspireId: TextSchema.openapi({
      description: "HM Land Registry's INSPIRE ID for the polygon.",
      example: "64151457",
    }),
    share: ShareSchema.openapi({
      description:
        "The share of the Land Parcel's area it covers, from 0 to 1.",
      example: 0.724,
    }),
    ownershipCategory: z.union([OwnershipCategorySchema, z.null()]).openapi({
      description:
        "Its indicative Ownership Category: company-owned or council or public-body owned if a title is matched to it, or else other registered. `null` where CCOD and OCOD aren't prepared.",
    }),
  })
  .openapi("InspireOverlap", {
    description:
      "One INSPIRE Index Polygon, a registered freehold title's outline, that overlaps a Land Parcel.",
  });

export const LandConstraintSchema = z
  .object({
    type: PlanningConstraintTypeSchema,
    name: TextSchema.openapi({
      description:
        'Its name. A flood zone is named by its zone: "Flood zone 3".',
      example: "Flood zone 2",
    }),
  })
  .openapi("LandConstraint", {
    description: "A Planning Constraint a Land Parcel intersects (PRD FR-5.4).",
  });

const landParcelShape = {
  id: TextSchema.openapi({
    description:
      "The council's ONS code and the parcel's number there. Numbers are given afresh each time `pnpm data:prepare` runs.",
    example: "E07000170-412",
  }),
  location: LocationSchema.openapi({
    description: "A point inside it, where the map marks it.",
  }),
  council: CouncilSchema.openapi({
    description: "The Land Coverage Area it is in.",
  }),
  name: z.union([TextSchema, z.null()]).openapi({
    description: "The name OpenStreetMap gives the land, if any.",
  }),
  landUse: z.array(TextSchema).openapi({
    description:
      "The OpenStreetMap tags of the open or undeveloped land it is built from (PRD FR-5.2).",
    example: ["landuse=farmland"],
  }),
  areaHectares: z.number().min(0).openapi({ example: 19.522 }),
  areaAcres: z.number().min(0).openapi({ example: 48.241 }),
  roadDistanceMetres: z.union([z.number().min(0), z.null()]).openapi({
    description:
      "How far the nearest road is, in metres, or `null` if there is none within 500 m. Footpaths, cycle paths, bridleways and tracks aren't roads.",
    example: 7,
  }),
  inspireCoverage: ShareSchema.openapi({
    description:
      "The share of its area INSPIRE Index Polygons cover, from 0 to 1.",
    example: 0.727,
  }),
  possiblyUnregistered: z.boolean().openapi({
    description:
      "Less than half of its area is covered by INSPIRE Index Polygons (PRD FR-5.4). Unregistered land still has an owner, and INSPIRE covers only freehold titles (FR-5.8).",
  }),
  inspirePolygons: z.array(InspireOverlapSchema).openapi({
    description:
      "The INSPIRE Index Polygons that overlap it by 10 m² or more, the most overlapping first.",
  }),
  ownershipCategory: z.union([OwnershipCategorySchema, z.null()]).openapi({
    description:
      "Its indicative Ownership Category (PRD FR-5.4a): Possibly Unregistered, or else that of the INSPIRE Index Polygon that covers most of it. `null` where CCOD and OCOD aren't prepared, so only `possiblyUnregistered` is known.",
  }),
  matchedTitles: z.array(MatchedTitleSchema).openapi({
    description:
      "The companies' and councils' titles matched to the INSPIRE Index Polygons that overlap it or are within 25 m of it, the nearest first.",
  }),
  constraints: z.array(LandConstraintSchema).openapi({
    description: "The Planning Constraints it intersects, by type.",
  }),
  floodZone: z.union([z.literal(2), z.literal(3), z.null()]).openapi({
    description: "The highest flood zone it is in, or `null` for flood zone 1.",
  }),
  onListedBuildingOutline: z.boolean().openapi({
    description:
      "Whether it overlaps a listed building's outline (PRD FR-5.3).",
  }),
  estimatedHomes: CountSchema.openapi({
    description:
      "Homes it might hold: 30 a hectare, after 40% for access and open space (PRD FR-5.4).",
    example: 351,
  }),
  shape: ConstraintShapeSchema,
};

export const LandSaleSchema = z
  .object({
    id: TextSchema.openapi({
      description: "Price Paid's transaction id.",
      example: "559C5AD5-F565-AFE3-E063-4804A8C004A4",
    }),
    price: PriceSchema.openapi({
      description: "What it sold for, in whole pounds.",
      example: 380000,
    }),
    date: DateSchema.openapi({
      description: "The day the sale completed.",
      example: "2026-05-28",
    }),
    address: TextSchema.openapi({
      description:
        "Its address as Price Paid records it, in capitals, without its postcode.",
      example: "UNIT 3, DRAKEHOUSE COURT, HAMILTON ROAD, SUTTON-IN-ASHFIELD",
    }),
    postcode: TextSchema.openapi({ example: "NG17 5ES" }),
    location: LocationSchema.openapi({
      description:
        "The middle of its postcode, from Code-Point Open: Price Paid gives no point for a property.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far its postcode's middle is from the Land Opportunity, in metres: 0 inside it. In the Land Layer's statistics, from the nearest of them.",
      example: 1012,
    }),
  })
  .openapi("LandSale", {
    description: `A sale near a Land Opportunity that HM Land Registry's Price Paid Data records as of property of type "Other": anything that isn't a house or a flat, such as land, a shop, an office or a pub (PRD FR-5.4b). It is ${LAND_SALE_LABEL}.`,
  });

export const LandSalesFoundSchema = z
  .object({
    count: CountSchema.openapi({ example: 9 }),
    medianPrice: z.union([PriceSchema, z.null()]).openapi({
      description:
        "Their median price in whole pounds, or `null` if there were none.",
      example: 214000,
    }),
    sales: z.array(LandSaleSchema).openapi({
      description: `The newest first: at most ${String(NEARBY_LAND_SALES_RULES.listed)} with a Land Opportunity and in the Land Layer's statistics, and every one with a Land Parcel on its own.`,
    }),
  })
  .openapi("LandSalesFound", {
    description:
      "The land sales found near Land Opportunities: how many, their median price, and the newest.",
  });

export const NearbyLandSalesSchema = z
  .object({
    status: SourceStatusSchema.openapi({
      description:
        "`not-prepared` if `pnpm data:prepare` hasn't prepared the Land Coverage Area's postcodes, which they are found in; `unavailable` if Price Paid didn't answer.",
    }),
    period: z
      .object({
        from: DateSchema.openapi({ example: "2021-10-09" }),
        to: DateSchema.openapi({ example: "2026-10-08" }),
      })
      .openapi({
        description: `The ${String(NEARBY_LAND_SALES_RULES.years)} years looked at, as ISO 8601 dates, up to and including today.`,
      }),
    found: z.union([LandSalesFoundSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("NearbyLandSales", {
    description: `HM Land Registry's Price Paid sales of property of type "Other" within 1 mile of a Land Opportunity, or of any of several, in the last ${String(NEARBY_LAND_SALES_RULES.years)} years (PRD FR-5.4b), each placed at the middle of its postcode. Each is ${LAND_SALE_LABEL}. They are found in the postcodes \`pnpm data:prepare\` keeps for each Land Coverage Area, so a sale without a postcode isn't found.`,
  });

export const LandParcelSchema = z
  .object(landParcelShape)
  .openapi("LandParcel", {
    description:
      "A Land Parcel: a contiguous piece of open or undeveloped land from OpenStreetMap, independent of any legal title, with its tags (PRD FR-5.2, FR-5.4).",
  });

export const NearbyPlanningApplicationSchema = z
  .object({
    id: z.string().min(1).openapi({
      description: "Its provider's name for it, as its Feature has.",
      example: "Ashfield/V/2024/0379",
    }),
    reference: z.string().min(1).openapi({ example: "V/2024/0379" }),
    address: z.union([z.string().min(1), z.null()]),
    description: z.string(),
    status: PlanningApplicationStatusSchema,
    applicationType: PlanningApplicationTypeSchema,
    receivedOn: DateSchema,
    estimatedHomes: z.union([CountSchema, z.null()]).openapi({
      description: "The new homes it proposes, estimated, or `null`.",
    }),
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far it is from the Land Opportunity's nearest edge, in metres: 0 if it is on it.",
      example: 240,
    }),
  })
  .openapi("NearbyPlanningApplication", {
    description:
      "An approved or major Planning Application near a Land Opportunity, which its nearby development activity points out (PRD FR-5.4).",
  });

export const NearbyPlanningApplicationsSchema = z
  .object({
    status: z.enum(PLANNING_APPLICATIONS_STATUSES).openapi({
      description:
        "The Planning Applications': `queued` while they wait for their provider's turn, so ask again in a few seconds; `unavailable` if the provider failed.",
    }),
    provider: z.string().min(1).openapi({ example: "PlanIt" }),
    withinMetres: CountSchema.openapi({
      description: "How far from it they are counted, in metres.",
      example: LAND_PARCEL_RULES.developmentActivityMetres,
    }),
    found: z
      .union([
        z.object({
          count: CountSchema.openapi({
            description: "How many there are within `withinMetres`.",
          }),
          approved: CountSchema.openapi({
            description: "How many of them are approved.",
          }),
          major: CountSchema.openapi({
            description: "How many of them are major.",
          }),
          estimatedHomes: CountSchema.openapi({
            description:
              "The new homes the approved and pending ones propose, estimated.",
          }),
          highlighted: z.array(NearbyPlanningApplicationSchema).openapi({
            description: "The approved and the major ones, nearest first.",
          }),
        }),
        z.null(),
      ])
      .openapi({ description: "`null` unless `status` is `ok`." }),
  })
  .openapi("NearbyPlanningApplications", {
    description:
      "A Land Opportunity's nearby development activity (PRD FR-5.4): the Planning Applications within 500 m of it, among those received in the Search Area in the last 3 years, so none beyond the Search Area's edge is counted.",
  });

export const LandOpportunityFeatureSchema = z
  .object({
    ...landParcelShape,
    distanceMetres: z.number().min(0).openapi({
      description:
        "How far its nearest edge is from the Location, in metres (PRD FR-2.10): 0 if the Location is inside it.",
      example: 137,
    }),
    nearbyLandSales: z.union([NearbyLandSalesSchema, z.null()]).openapi({
      description: `The land sales within 1 mile of it (PRD FR-5.4b), the newest ${String(NEARBY_LAND_SALES_RULES.listed)} listed. \`null\` across a whole Land Coverage Area, where they are found only for one Land Parcel at \`/api/land/{parcelId}\`.`,
    }),
    nearbyPlanningApplications: z
      .union([NearbyPlanningApplicationsSchema, z.null()])
      .openapi({
        description:
          "Its nearby development activity (PRD FR-5.4): the Planning Applications within 500 m of it, among the Search Area's. `null` across a whole Land Coverage Area, where they aren't looked for.",
      }),
  })
  .openapi("LandOpportunityFeature", {
    description:
      "A Land Opportunity: a Land Parcel that meets the filters, and so warrants further investigation (PRD FR-5.3). It is not a statement about ownership or availability. Unregistered land still has an owner (FR-5.7).",
  });

export const LandUseContextTypeSchema = z
  .enum(LAND_USE_CONTEXT_TYPES)
  .openapi("LandUseContextType", {
    description: "OpenStreetMap's `landuse` of an area shown as context.",
  });

export const LandUseAreaSchema = z
  .object({
    id: TextSchema.openapi({
      description: "Its OpenStreetMap type and id.",
      example: "way-123",
    }),
    landUse: LandUseContextTypeSchema,
    name: z.union([TextSchema, z.null()]),
    shape: ConstraintShapeSchema,
  })
  .openapi("LandUseArea", {
    description:
      "An area OpenStreetMap maps as industrial, commercial or retail land use, which the Land Layer draws as context (PRD FR-2.7).",
  });

export const LandScopeSchema = z.enum(LAND_SCOPES).openapi("LandScope", {
  description:
    "Where Land Opportunities are looked for: the Search Area, or the whole of each Land Coverage Area it reaches into (PRD FR-5.1).",
});

export const LandSortSchema = z.enum(LAND_SORTS).openapi("LandSort", {
  description:
    "The order they are listed in: the largest, the nearest a road, or those that might hold the most homes, first (PRD FR-5.1).",
});

export const FloodZoneSchema = z.literal(FLOOD_ZONES).openapi("FloodZone", {
  description: "A flood zone: 1 is outside flood zones 2 and 3.",
});

export const LandFiltersSchema = z
  .object({
    minAcres: z.number().min(0).openapi({
      description: "Its least area, in acres.",
      example: 0.1,
    }),
    maxAcres: z.union([z.number().min(0), z.null()]).openapi({
      description: "Its greatest area, in acres, or `null` for no limit.",
    }),
    maxRoadMetres: z.union([z.number().min(0), z.null()]).openapi({
      description:
        "How far from a road it may be, in metres, or `null` for any distance.",
      example: 50,
    }),
    maxFloodZone: FloodZoneSchema.openapi({
      description: "The highest flood zone it may be in: 3 for any.",
    }),
    possiblyUnregisteredOnly: z.boolean(),
    excludeConstraints: z.array(PlanningConstraintTypeSchema).openapi({
      description: "It intersects no Planning Constraint of these types.",
    }),
    excludeListedBuildingOutlines: z.boolean().openapi({
      description: "It overlaps no listed building's outline.",
    }),
    ownershipCategories: z.array(OwnershipCategorySchema).openapi({
      description:
        "It is in one of these Ownership Categories, or any if there are none.",
    }),
  })
  .openapi("LandFilters", {
    description:
      "The filters a Land Parcel meets to be a Land Opportunity (PRD FR-5.3, FR-5.5).",
  });

export const LandStatisticsSchema = z
  .object({
    parcels: CountSchema.openapi({
      description:
        "Land Parcels where they were looked for, before the filters.",
      example: 5,
    }),
    count: CountSchema.openapi({
      description: "Land Opportunities: the parcels that meet the filters.",
      example: 4,
    }),
    totalHectares: z.number().min(0).openapi({ example: 24.85 }),
    possiblyUnregistered: CountSchema,
    ownershipCategories: z
      .union([z.record(OwnershipCategorySchema, CountSchema), z.null()])
      .openapi({
        description:
          "How many of them are in each Ownership Category, or `null` if no Land Coverage Area looked in has CCOD and OCOD prepared.",
        example: {
          company: 0,
          "council-or-public-body": 0,
          "other-registered": 4,
          "possibly-unregistered": 0,
        },
      }),
    estimatedHomes: CountSchema.openapi({
      description: "Homes they might hold together.",
      example: 446,
    }),
    listed: CountSchema.openapi({
      description: `How many are listed in \`features\`: at most ${String(LAND_LIST_LIMIT)}.`,
    }),
    nearbyLandSales: z.union([NearbyLandSalesSchema, z.null()]).openapi({
      description: `The land sales within 1 mile of any of them (PRD FR-5.4b), each as far as the nearest, the newest ${String(NEARBY_LAND_SALES_RULES.listed)} listed. \`null\` across a whole Land Coverage Area.`,
    }),
  })
  .openapi("LandStatistics", {
    description:
      "The Land Layer's statistics for the Location Overview and the Land panel (PRD FR-2.7).",
  });

export const LandLayerResponseSchema = z
  .object({
    layer: z.literal("land"),
    status: SourceStatusSchema.openapi({
      description:
        "`not-prepared` before `pnpm data:prepare` has prepared the Land Parcels, or if the Search Area reaches into no Land Coverage Area: Land data not prepared for this area.",
    }),
    sources: z.array(SourceReportSchema).openapi({
      description:
        "The prepared Land Parcels behind the Layer, and how they were read: their `period` is the date of the OpenStreetMap data they are built from. In the Search Area, the prepared postcodes and HM Land Registry's Price Paid too, which the land sales near them come from.",
    }),
    scope: LandScopeSchema,
    sort: LandSortSchema,
    filters: LandFiltersSchema,
    landCoverageAreas: z.array(CouncilSchema).openapi({
      description:
        "The Land Coverage Areas looked in: those the Search Area reaches into.",
    }),
    notCovered: z.array(CouncilSchema).openapi({
      description:
        "The councils the Search Area reaches into whose land data isn't prepared.",
    }),
    features: z.array(LandOpportunityFeatureSchema).openapi({
      description: `Land Opportunities, at most ${String(LAND_LIST_LIMIT)}, in the order chosen. Empty unless \`status\` is \`ok\`.`,
    }),
    landUse: z.array(LandUseAreaSchema).openapi({
      description:
        "Industrial, commercial and retail land use in the Search Area, as context.",
    }),
    statistics: z.union([LandStatisticsSchema, z.null()]).openapi({
      description: "`null` unless `status` is `ok`.",
    }),
  })
  .openapi("LandLayerResponse", {
    description:
      "The Land Opportunities in the Search Area, or in the whole of each Land Coverage Area it reaches into, that meet the filters, in the order chosen, with industrial and commercial land use as context (PRD FR-2.7, FR-5.1). Land Parcels are built and tagged by `pnpm data:prepare` (FR-6.2). Our data suggests each warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner (FR-5.7).",
  });

export const InspirePolygonSchema = InspireOverlapSchema.extend({
  distanceMetres: z.number().min(0).openapi({
    description:
      "How far it is from the Land Parcel, in metres: 0 if it overlaps it.",
  }),
  shape: ConstraintShapeSchema,
}).openapi("InspirePolygon", {
  description:
    "An INSPIRE Index Polygon that overlaps a Land Parcel, or is within 25 m of it with a company's or council's title matched to it, with its outline. One around it covers none of it: its `share` is 0.",
});

export const LandParcelResponseSchema = z
  .object({
    parcel: LandParcelSchema,
    inspirePolygons: z.array(InspirePolygonSchema),
    nearbyLandSales: NearbyLandSalesSchema.openapi({
      description:
        "The land sales within 1 mile of it (PRD FR-5.4b), every one of them listed.",
    }),
    sources: z.array(SourceReportSchema).openapi({
      description:
        "The prepared Land Parcels and postcodes behind it, and HM Land Registry's Price Paid, and how each answered.",
    }),
  })
  .openapi("LandParcelResponse", {
    description:
      "One Land Parcel, its tags and outline, and the INSPIRE Index Polygons that overlap it, and those around it a company's or council's title is matched to, with theirs and their indicative Ownership Categories (PRD FR-5.4a, FR-5.6), and the land sales near it (FR-5.4b). INSPIRE Index Polygons cover only registered freehold titles (FR-5.8).",
  });

/** One Layer's Features and statistics. Each Layer adds its own as it is built. */
export const LayerResponseSchema = z
  .discriminatedUnion("layer", [
    CrimeLayerResponseSchema,
    PlanningLayerResponseSchema,
    AmenitiesLayerResponseSchema,
    SchoolsLayerResponseSchema,
    TransportLayerResponseSchema,
    GreenSpaceLayerResponseSchema,
    PropertyLayerResponseSchema,
    LandLayerResponseSchema,
    DemographicsLayerResponseSchema,
  ])
  .openapi("LayerResponse", {
    description: "One Layer's Features and statistics, by `layer`.",
  });

export const CategoryIdSchema = z.enum(CATEGORY_IDS).openapi("CategoryId", {
  description:
    "A Category Score calculated so far (PRD §6.4). Schools and Development activity join as the Layers they need are built. `demand`, `competition` and `footfall` (Footfall proxy) are weighed only by the Business and Retail Scout Modes.",
});

const ServedLayerIdSchema = z.enum(SERVED_LAYER_IDS);

export const ScorePartSchema = z
  .object({
    input: z.string().openapi({
      description: "What is measured.",
      example: "Distance to the nearest railway station",
    }),
    value: z.union([z.number(), z.boolean(), z.null()]).openapi({
      description:
        "The figure measured: a number, or whether something is so, such as the Location being inside a conservation area. `null` if there is none, for example no railway station within 5 km.",
      example: 1604,
    }),
    unit: z.union([z.string(), z.null()]).openapi({
      description:
        "The unit of a number, for example `m` or `%`, or `null` for a count or none.",
      example: "m",
    }),
    rule: z.string().openapi({
      description:
        "The rule and thresholds used, written from the scoring config.",
      example:
        "800 m or less: 60 points, falling in proportion to 0 at 5 km or more.",
    }),
    points: z.number().openapi({
      description:
        "The points given, to one decimal place. A penalty is negative.",
      example: 48.6,
    }),
  })
  .openapi("ScorePart", {
    description:
      "One line of a Category Score's breakdown (PRD FR-3.3): an input, the rule and thresholds that turn it into points, and the points given.",
  });

const ScoreSchema = z.number().int().min(0).max(100);

export const CategoryStatusSchema = z
  .enum(CATEGORY_STATUSES)
  .openapi("CategoryStatus", {
    description:
      "Whether a Category Score could be calculated: its Layer's status (`ok`, `unavailable` or `not-prepared`), or, for Development activity and Demand, `queued` while the Planning Applications they need wait for their provider's turn (PRD NFR-1.5), so ask for the scores again in a few seconds. Development activity is `unavailable` when the Planning Applications are, whatever the Planning Constraints' status.",
  });

export const CategoryScoreSchema = z
  .object({
    id: CategoryIdSchema,
    layer: ServedLayerIdSchema.openapi({
      description:
        "The Layer it is calculated from. For one calculated from several, as `footfall` is from `amenities` and `transport`, the first of them that is not `ok`, or else the first. Demand's is `planning` while the Planning Applications are queued.",
    }),
    status: CategoryStatusSchema,
    score: z.union([ScoreSchema, z.null()]).openapi({
      description: "From 0 to 100. `null` unless `status` is `ok`.",
      example: 89,
    }),
    breakdown: z.array(ScorePartSchema).openapi({
      description:
        "How it was reached. The parts' points add up to the score, before it is rounded. Empty unless `status` is `ok`.",
    }),
  })
  .openapi("CategoryScore", {
    description:
      "One Category Score (PRD FR-3.2), 0–100 by fixed rules. If its Layer is unavailable or not prepared, `status` says so, and there is no score and no breakdown (FR-3.4).",
  });

export const WeightedCategorySchema = z
  .object({
    id: CategoryIdSchema,
    score: ScoreSchema,
    weight: z.number().min(0).openapi({
      description:
        "Its weight in the Scout Mode, out of 100 for every category the mode weighs.",
      example: 15,
    }),
    share: z.number().min(0).openapi({
      description:
        "Its share of the Location Score in per cent, to one decimal place: its weight renormalised over the categories counted.",
      example: 17.6,
    }),
    points: z.number().min(0).openapi({
      description:
        "What it adds to the Location Score: its score times its share, to one decimal place.",
      example: 15.7,
    }),
  })
  .openapi("WeightedCategory", {
    description:
      "A Category Score counted in the Location Score, and its weight.",
  });

export const LeftOutCategorySchema = z
  .object({
    id: CategoryIdSchema,
    layer: ServedLayerIdSchema.openapi({
      description:
        "The Layer it needs that is not `ok`: the first, if there are several.",
    }),
    status: CategoryStatusSchema.exclude(["ok"]),
    weight: z.number().min(0).openapi({ example: 25 }),
  })
  .openapi("LeftOutCategory", {
    description:
      "A Category Score left out of the Location Score, because its Layer is not `ok`.",
  });

export const LocationScoreSchema = z
  .object({
    score: z.union([ScoreSchema, z.null()]).openapi({
      description:
        "From 0 to 100, or `null` if no Category Score is available.",
      example: 62,
    }),
    counted: z.array(WeightedCategorySchema),
    leftOut: z.array(LeftOutCategorySchema).openapi({
      description: "The Category Scores left out, and why (PRD FR-3.4).",
    }),
  })
  .openapi("LocationScore", {
    description:
      "The weighted mean of the Category Scores available, with the Scout Mode's weights renormalised over them (PRD §6.4).",
  });

export const ScoutModeIdSchema = z
  .string()
  .regex(SCOUT_MODE_ID_PATTERN)
  .openapi("ScoutModeId", {
    description:
      "A Scout Mode (PRD §6.5), one of those `/api/modes` lists: lower-case words joined by hyphens.",
    example: "buy-to-let",
  });

export const ScoresResponseSchema = z
  .object({
    mode: ScoutModeIdSchema.openapi({
      description: "The Scout Mode whose weights make the Location Score.",
    }),
    categories: z.array(CategoryScoreSchema).openapi({
      description:
        "Every category the Scout Mode weighs, in order, even one left out. A category it gives no weight isn't scored.",
    }),
    location: LocationScoreSchema,
  })
  .openapi("ScoresResponse", {
    description:
      "The Category Scores and the Location Score for a Search Area, each with its breakdown (PRD FR-3.2, FR-3.3), under one Scout Mode, whose weights make the Location Score (FR-4.2) and whose competitors make Competition (FR-4.3). They are beta: fixed thresholds, to be tuned against real Locations.",
  });

export const HighlightSchema = z
  .object({
    rule: z.enum(HIGHLIGHT_RULE_IDS).openapi({
      description:
        "The rule that gave it. Its thresholds, and the Scout Modes that apply it, are in `apps/api/src/scoring/config.ts`.",
      example: "crime-rising",
    }),
    level: z.enum(HIGHLIGHT_LEVELS).openapi({
      description: "Good, Watch or Concern.",
      example: "watch",
    }),
    text: z.string().min(1).openapi({
      description: "What it says, written from the figures and the rule.",
      example: "Crime up 5.9% year on year",
    }),
    layer: ServedLayerIdSchema.openapi({
      description: "The Layer whose figures it comes from, which it links to.",
    }),
  })
  .openapi("Highlight", {
    description:
      "A short Good, Watch or Concern statement about a Search Area, given by a fixed rule from calculated figures, never by AI (PRD FR-3.7).",
  });

export const LeftOutLayerSchema = z
  .object({
    layer: ServedLayerIdSchema,
    status: SourceStatusSchema.exclude(["ok"]),
  })
  .openapi("LeftOutLayer", {
    description:
      "A Layer whose Highlights are left out because it isn't `ok`: its rules had no figures to read.",
  });

export const HighlightsResponseSchema = z
  .object({
    mode: ScoutModeIdSchema,
    highlights: z.array(HighlightSchema).openapi({
      description:
        "Concerns first, then Watches, then Goods, each in the order the rules are applied.",
    }),
    leftOut: z.array(LeftOutLayerSchema).openapi({
      description:
        "The Layers with rules in this Scout Mode that weren't `ok`, so gave no Highlights.",
    }),
  })
  .openapi("HighlightsResponse", {
    description:
      "The Highlights for a Search Area under one Scout Mode, which decides which rules apply (PRD FR-3.7).",
  });

/** A list of ids, each once, in the order `order` gives them. */
const inOrder =
  <T>(order: readonly T[]) =>
  (ids: readonly T[]) =>
    ids.every(
      (id, index) =>
        index === 0 || order.indexOf(ids[index - 1] ?? id) < order.indexOf(id),
    );

export const CompetitorTagSchema = z
  .object({
    key: z.string().min(1).openapi({ example: "amenity" }),
    values: z.union([z.array(z.string().min(1)).min(1), z.null()]).openapi({
      description: "The values it takes, or `null` for any value.",
      example: ["cafe"],
    }),
  })
  .openapi("CompetitorTag", {
    description:
      "An OpenStreetMap tag that makes an amenity a competitor (PRD FR-4.3), matched against the tag that made the amenity its type (`osmTag`).",
  });

export const CompetitorsSchema = z
  .object({
    name: z.string().min(1).openapi({
      description: "What they are, as the user sees them.",
      example: "cafés",
    }),
    tags: z.array(CompetitorTagSchema).min(1),
  })
  .openapi("Competitors", {
    description:
      "The businesses a Business or Retail Scout Mode competes with (PRD FR-4.3), found among the Amenities Layer's Features.",
  });

export const ScoutModeSchema = z
  .object({
    id: ScoutModeIdSchema,
    name: z.string().min(1).openapi({ example: "Buy-to-let" }),
    question: z.string().openapi({
      description: "The question it answers.",
      example: "Should I buy a home here to let?",
    }),
    weights: z.record(CategoryIdSchema, z.number().min(0)).openapi({
      description:
        "Each Category Score's weight in the Location Score (PRD FR-4.2), out of 100 across every category the PRD gives the mode. A category given 0 counts for nothing. The weights of the categories available are renormalised to make up 100%.",
      example: {
        safety: 15,
        amenities: 10,
        transport: 25,
        "green-space": 5,
        "property-activity": 25,
        "development-activity": 5,
        "planning-freedom": 5,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
    }),
    competitors: z.union([CompetitorsSchema, z.null()]).openapi({
      description:
        "The businesses it competes with (PRD FR-4.3), which make its Competition score and which the map highlights. `null` for a mode that isn't for opening a business.",
    }),
    highlightedLayers: z
      .array(z.enum(LAYER_IDS))
      .refine(inOrder(LAYER_IDS))
      .openapi({
        description:
          "The Layers it highlights (PRD FR-4.3a), in Layer order. A Layer not built yet is listed all the same.",
        example: ["planning", "property"],
      }),
    highlights: z
      .array(z.enum(HIGHLIGHT_RULE_IDS))
      .refine(inOrder(HIGHLIGHT_RULE_IDS))
      .openapi({
        description:
          "The Highlight rules it applies (PRD FR-3.7), in the order they are applied.",
        example: ["crime-rate-high", "prices-rising"],
      }),
  })
  .openapi("ScoutMode", {
    description:
      "A Scout Mode (PRD §6.5): a question-specific view that decides how the Category Scores are weighted, which Layers it highlights and which Highlights apply. It is config only (FR-4.5).",
  });

export const ModesResponseSchema = z
  .object({
    modes: z
      .array(ScoutModeSchema)
      .refine((modes) => modes.some(({ id }) => id === DEFAULT_SCOUT_MODE), {
        message: `The Scout Modes include ${DEFAULT_SCOUT_MODE}, the default.`,
      })
      .refine(
        (modes) => new Set(modes.map(({ id }) => id)).size === modes.length,
        { message: "Each Scout Mode is listed once." },
      )
      .openapi({
        description: `Every Scout Mode, in the order to offer them. \`${DEFAULT_SCOUT_MODE}\` is always one, and the default (PRD FR-4.1).`,
      }),
  })
  .openapi("ModesResponse", {
    description:
      "The Scout Modes the user can pick from, and their default weights (PRD FR-8.2).",
  });

const QuestionListSchema = z.array(z.string().min(1));

export const ExplainQuestionsSchema = z
  .object({
    overview: z.record(ScoutModeIdSchema, QuestionListSchema).openapi({
      description:
        "Offered for the Location Overview in each Scout Mode, by its id: the mode's own question first, then others.",
      example: {
        "business-cafe": [
          "Could I open a café here?",
          "What are the biggest risks here?",
        ],
      },
    }),
    category: QuestionListSchema.openapi({
      description: "Offered for each Category Score.",
      example: ["Why is this score what it is?"],
    }),
    "land-opportunity": QuestionListSchema.openapi({
      description: "Offered for each Land Opportunity.",
      example: ["What should I check before pursuing it?"],
    }),
  })
  .openapi("ExplainQuestions", {
    description:
      "The questions offered before the user's own, for each subject (PRD FR-11.3).",
  });

export const ExplainStatusResponseSchema = z
  .discriminatedUnion("enabled", [
    z
      .object({ enabled: z.literal(false) })
      .strict()
      .openapi("ExplainOff", {
        description:
          "`ANTHROPIC_API_KEY` isn't set: AI Explanations are off, no Explain button is shown, and nothing calls Anthropic.",
      }),
    z
      .object({
        enabled: z.literal(true),
        model: z.string().min(1).openapi({
          description:
            "`ANTHROPIC_MODEL`, the model that writes them: `claude-sonnet-5-5` unless set.",
          example: "claude-sonnet-5-5",
        }),
        questions: ExplainQuestionsSchema,
      })
      .openapi("ExplainOn", {
        description: "`ANTHROPIC_API_KEY` is set: AI Explanations are on.",
      }),
  ])
  .openapi("ExplainStatusResponse", {
    description:
      "Whether AI Explanations are on, the model that writes them and the questions they offer (PRD FR-11.1, FR-11.3).",
  });

export const ExplainSubjectSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("overview") }).strict(),
    z.object({
      kind: z.literal("category"),
      category: CategoryIdSchema,
    }),
    z.object({
      kind: z.literal("land-opportunity"),
      parcelId: z.string().min(1).openapi({
        description: "The Land Opportunity's Land Parcel id.",
        example: "E07000170-2",
      }),
    }),
  ])
  .openapi("ExplainSubject", {
    description:
      "What is explained: the Location Overview, one Category Score, or one Land Opportunity (PRD FR-11.1).",
  });

const ExplainUsageSchema = z
  .object({
    inputTokens: z.int().min(0).openapi({
      description:
        "The tokens the model was sent: its instructions, the figures and the question.",
    }),
    outputTokens: z.int().min(0).openapi({
      description: "The tokens it wrote.",
    }),
  })
  .openapi("ExplainUsage", {
    description:
      "The tokens an explanation took, as Anthropic counted them (PRD FR-11.5).",
  });

export const ExplainEventSchema = z
  .discriminatedUnion("type", [
    z
      .object({ type: z.literal("text"), text: z.string() })
      .openapi("ExplainText", {
        description: "The next part of the explanation, as it is written.",
      }),
    z
      .object({
        type: z.literal("done"),
        usage: ExplainUsageSchema,
        cached: z.boolean().openapi({
          description:
            "It was given again from the in-memory cache, at no cost (PRD FR-11.5).",
        }),
        truncated: z.boolean().openapi({
          description: "The model stopped at its length limit.",
        }),
        unverifiedNumbers: z.array(z.string()).openapi({
          description:
            "Each number in the answer that isn't among the figures it was given (PRD FR-11.6). Empty when it checks out.",
        }),
      })
      .openapi("ExplainDone", { description: "The explanation is finished." }),
    z
      .object({ type: z.literal("error"), error: z.string().min(1) })
      .openapi("ExplainError", {
        description: "The explanation couldn't be finished, and why.",
      }),
  ])
  .openapi("ExplainEvent", {
    description:
      "One server-sent event of an AI Explanation's stream: its text as it is written, then `done`, or `error`.",
  });
