import { createRoute, z } from "@hono/zod-openapi";

import {
  DEFAULT_LAND_FILTERS,
  DEFAULT_LAND_SCOPE,
  DEFAULT_LAND_SORT,
  DEFAULT_SCOUT_MODE,
  DEFAULT_SEARCH_RADIUS_MILES,
  EXPLAIN_RULES,
  FLOOD_ZONES,
  LAND_LIST_LIMIT,
  LAND_SCOPES,
  LAND_SORTS,
  OWNERSHIP_CATEGORIES,
  PLANNING_CONSTRAINT_TYPES,
  SEARCH_RADII_MILES,
  SERVED_LAYER_IDS,
  isOwnershipCategory,
  isPlanningConstraintType,
  type OwnershipCategory,
  type PlanningConstraintType,
} from "@location-scout/shared";

import { parsePostcode } from "./postcode";
import {
  ApiErrorResponseSchema,
  AreaResponseSchema,
  CategoryIdSchema,
  CoverageResponseSchema,
  ExplainEventSchema,
  ExplainStatusResponseSchema,
  ExplainSubjectSchema,
  GeocodeResponseSchema,
  HealthResponseSchema,
  HighlightsResponseSchema,
  LandLayerResponseSchema,
  LandParcelResponseSchema,
  LayerResponseSchema,
  ModesResponseSchema,
  ScoresResponseSchema,
  StreetViewResponseSchema,
} from "./api-schemas";
import { SCORING_CONFIG } from "./scoring/config";

/*
 * The contract of every `/api` route: its parameters and every response it can
 * give. `createApp` serves each one with `app.openapi`, which validates the
 * parameters and documents the route at `/api/openapi.json` (PRD FR-8.1).
 * Paths are relative to `/api`.
 */

export const SEARCH_HINT =
  "Enter a postcode or an address, for example NG17 1AA or 12 High Street, Sutton-in-Ashfield.";
export const LOCATION_HINT = "lat and lng must be a latitude and longitude.";
export const RADIUS_HINT = "radius must be 0.25, 0.5 or 1 (miles).";
export const POSTCODE_HINT =
  "postcode must be a full postcode, for example NG17 1AA.";
/** What the user is told about a Scout Mode the config doesn't have. */
export const modeHint = (modes: readonly { id: string }[]) =>
  `mode must be one of the Scout Modes: ${modes.map(({ id }) => id).join(", ")}.`;
export const LAYER_HINT = `layer must be one of the Layers served: ${SERVED_LAYER_IDS.join(", ")}.`;
export const LAND_SCOPE_HINT = `scope must be one of: ${LAND_SCOPES.join(", ")}.`;
export const LAND_SORT_HINT = `sort must be one of: ${LAND_SORTS.join(", ")}.`;
export const ACRES_HINT =
  "minAcres and maxAcres must be areas in acres, 0 or more.";
export const ROAD_HINT =
  "maxRoadMetres must be a distance in metres, 0 or more, or any.";
export const FLOOD_ZONE_HINT = "maxFloodZone must be 1, 2 or 3.";
export const SOURCES_HINT = "sources must be true or false.";
export const BOOLEAN_HINT =
  "possiblyUnregisteredOnly and excludeListedBuildingOutlines must be true or false.";
export const OWNERSHIP_HINT = `ownershipCategories must be Ownership Categories separated by commas: ${OWNERSHIP_CATEGORIES.join(", ")}.`;
export const QUESTION_HINT = `question must be a question of 1 to ${String(EXPLAIN_RULES.maxQuestionLength)} characters.`;
export const WEIGHTS_HINT =
  "weights must give Category Scores whole per cents from 0 to 100.";
export const SUBJECT_HINT =
  "subject must be the Location Overview, a Category Score or a Land Opportunity.";
export const CONSTRAINTS_HINT = `excludeConstraints must be Planning Constraint types separated by commas: ${PLANNING_CONSTRAINT_TYPES.join(", ")}.`;

/** What the user is told about a Location outside England (PRD FR-1.5). */
export const ENGLAND_ONLY = "Location Scout currently covers England only.";

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const failure = (description: string) =>
  json(ApiErrorResponseSchema, description);

export const healthRoute = createRoute({
  method: "get",
  path: "/health",
  summary: "Check that the backend is answering",
  responses: {
    200: json(HealthResponseSchema, "The backend is up."),
  },
});

export const geocodeRoute = createRoute({
  method: "get",
  path: "/geocode",
  summary: "Resolve a postcode or an address to Locations",
  description:
    "A full postcode is looked up with postcodes.io (PRD FR-1.1) and gives one candidate. Anything else is searched as an address with Nominatim, in Great Britain only, and may give several candidates for the user to pick from (FR-1.2). Nominatim is sent at most one request a second; a new address search may wait for its turn (NFR-1.5). Answers are cached for 7 days.",
  request: {
    query: z.object({
      q: z.string({ error: SEARCH_HINT }).trim().min(1, SEARCH_HINT).openapi({
        description:
          "A postcode, in any case and spacing, or a free-text address.",
        example: "12 High Street, Sutton-in-Ashfield",
      }),
    }),
  },
  responses: {
    200: json(GeocodeResponseSchema, "The Locations it may mean, best first."),
    400: failure("`q` is missing or blank."),
    404: failure(
      "postcodes.io does not know the postcode, or Nominatim found no address.",
    ),
    502: failure("postcodes.io or Nominatim is unavailable."),
  },
});

/**
 * A number sent as text in the query string, then checked by `schema`. A blank
 * one is refused rather than read as 0. Any problem gives the user `hint`.
 */
const numberParam = <T extends z.ZodType<unknown, number>>(
  hint: string,
  schema: T,
) =>
  z
    .string({ error: hint })
    .trim()
    .min(1, hint)
    .pipe(z.coerce.number<string>({ error: hint }))
    .pipe(schema);

const coordinate = (limit: number, description: string, example: number) =>
  numberParam(
    LOCATION_HINT,
    z.number().min(-limit, LOCATION_HINT).max(limit, LOCATION_HINT),
  ).openapi({
    type: "number",
    minimum: -limit,
    maximum: limit,
    description,
    example,
  });

/** How checking that a Location is in England can fail (PRD FR-1.5). */
const locationCheckFailures = {
  404: failure(
    "There is no postcode within 2 km of the Location, so it can't be shown to be in England.",
  ),
  422: failure("The Location is outside England."),
  502: failure(
    "postcodes.io is unavailable, so the Location can't be checked.",
  ),
};

/** Where a Search Area is: its Location, Search Radius and searched postcode. */
const areaQuery = z.object({
  lat: coordinate(90, "The Location's latitude.", 53.123664),
  lng: coordinate(180, "The Location's longitude.", -1.264078),
  radius: numberParam(
    RADIUS_HINT,
    z.literal(SEARCH_RADII_MILES, { error: RADIUS_HINT }),
  )
    .default(DEFAULT_SEARCH_RADIUS_MILES)
    .openapi({
      type: "number",
      enum: [...SEARCH_RADII_MILES],
      default: DEFAULT_SEARCH_RADIUS_MILES,
      description: "The Search Radius in miles.",
    }),
  postcode: z
    .string()
    .transform((input, ctx) => {
      const postcode = parsePostcode(input);
      if (postcode === null) {
        ctx.addIssue({ code: "custom", message: POSTCODE_HINT });
        return z.NEVER;
      }
      return postcode;
    })
    .optional()
    .openapi({
      type: "string",
      description:
        "The postcode the user searched for, if they did, in any case and spacing. Several postcodes can share a point, so this names the one whose local geography to give. If it is not at the Location, the postcode nearest the Location is used instead.",
      example: "NG17 1AA",
    }),
});

export const areaRoute = createRoute({
  method: "get",
  path: "/area",
  summary: "Load the Search Area around a Location",
  description:
    "First finds the postcode that describes the Location on postcodes.io: `postcode`, if the user searched for one and it is at the Location, or else the postcode nearest it. Its country checks that the Location is in England (PRD FR-1.5), and its record names the local geography (FR-1.8). Outside England, or with no postcode within 2 km (out at sea, or outside the UK), it answers with a message and consults no Data Source, so no Layer is loaded. Otherwise it consults every Data Source for the Search Area and reports how each answered, and the status of each Layer it supplies. It also finds the council the Location is in from the council boundaries `pnpm data:prepare` prepared (FR-6.3), and whether it is a Land Coverage Area; before `pnpm data:prepare` that is `not-prepared`. A Data Source that fails or takes over 8 seconds is reported as `unavailable`; it never fails the response (PRD NFR-1.1–NFR-1.3). With `sources=false` it consults none of the Layers' Data Sources, so it answers as soon as the Location is checked and its council found, with only the council boundaries in `sources` and no `layers`: the frontend asks this way, as each Layer reports its own sources, so the Search Area is shown without waiting for the slowest of them (NFR-2.3).",
  request: {
    query: areaQuery.extend({
      sources: z
        .enum(["true", "false"], { error: SOURCES_HINT })
        .transform((value) => value === "true")
        .default(true)
        .openapi({
          type: "boolean",
          default: true,
          description:
            "Whether to consult every Layer's Data Sources and report how each answered, which waits for the slowest. `false` leaves them to each Layer's own request.",
        }),
    }),
  },
  responses: {
    200: json(AreaResponseSchema, "The Search Area and its Data Sources."),
    400: failure("The Location, Search Radius or postcode is not valid."),
    ...locationCheckFailures,
  },
});

export const areaLayerRoute = createRoute({
  method: "get",
  path: "/area/{layer}",
  summary: "Load one Layer's Features and statistics for a Search Area",
  description:
    "Checks the Location is in England exactly as `/api/area` does, answering in the same way if it is not, then consults only the Data Sources behind the Layer. Each Layer loads on its own, so the map can show it as soon as its sources answer, never waiting for the slowest (PRD NFR-2.3). A Data Source that fails or takes over 8 seconds makes the Layer `unavailable`, with no Features; it never fails the response (NFR-1.2).",
  request: {
    params: z.object({
      layer: z.enum(SERVED_LAYER_IDS, { error: LAYER_HINT }).openapi({
        param: { name: "layer", in: "path" },
        description: "The Layer to load.",
        example: "crime",
      }),
    }),
    query: areaQuery,
  },
  responses: {
    200: json(LayerResponseSchema, "The Layer's Features and statistics."),
    400: failure(
      "The Layer is not served, or the Location, Search Radius or postcode is not valid.",
    ),
    ...locationCheckFailures,
  },
});

export const coverageRoute = createRoute({
  method: "get",
  path: "/coverage",
  summary:
    "List the prepared datasets and Land Coverage Areas, with their dates",
  description:
    "What `pnpm data:prepare` has prepared into `data/`, from the manifest it writes (PRD FR-6.2, FR-6.5): the England-wide datasets, and each Land Coverage Area with its own datasets, each with its source, the date its data dates from and when it was prepared. Before `pnpm data:prepare` has run, `status` is `not-prepared` and the lists are empty: the app works without prepared data (FR-6.6). It calls no Data Source.",
  responses: {
    200: json(
      CoverageResponseSchema,
      "The prepared datasets and Land Coverage Areas.",
    ),
  },
});

export const streetViewRoute = createRoute({
  method: "get",
  path: "/street-view",
  summary: "Say whether the Street View panel is on, with its key",
  description:
    "The optional Street View panel (PRD FR-2.13) is on only when `GOOGLE_MAPS_API_KEY` is set in `.env`. Then this gives the key, which the browser loads Google's Maps JavaScript API with when the panel is first opened: Google's script runs only in a browser, with its key in the page, so the key is given at runtime rather than built into the frontend, and is never stored. Without it, `enabled` is `false`, the panel is hidden and nothing is loaded from Google. It calls no Data Source.",
  responses: {
    200: json(
      StreetViewResponseSchema,
      "Whether Street View is on, and its key if it is.",
    ),
  },
});

export const modesRoute = createRoute({
  method: "get",
  path: "/modes",
  summary: "List the Scout Modes and their default weights",
  description:
    "Every Scout Mode in `apps/api/src/scoring/config.ts`, General first (PRD §6.5): the question it answers, each Category Score's weight in the Location Score (FR-4.2), the Layers it highlights (FR-4.3a) and the Highlight rules it applies (FR-3.7). A Scout Mode is config only, so one added there is listed here, with no other change (FR-4.5). It calls no Data Source.",
  responses: {
    200: json(ModesResponseSchema, "The Scout Modes."),
  },
});

/**
 * The Scout Mode to score or highlight a Search Area in. Any id is taken here;
 * the handler checks it is one of the config's modes, which are config only
 * (PRD FR-4.5).
 */
const modeQuery = (description: string) =>
  z
    .string()
    .default(DEFAULT_SCOUT_MODE)
    .openapi({
      description: `${description} One of the Scout Modes \`/api/modes\` lists.`,
      enum: SCORING_CONFIG.modes.map(({ id }) => id),
      default: DEFAULT_SCOUT_MODE,
      example: "homebuyer",
    });

export const scoresRoute = createRoute({
  method: "get",
  path: "/scores",
  summary: "Score a Search Area: its Category Scores and Location Score",
  description:
    "Checks the Location is in England exactly as `/api/area` does, answering in the same way if it is not, then loads every Layer the scores need and scores them by the fixed rules in `apps/api/src/scoring/config.ts` (PRD §6.4). Each Category Score is 0–100, with a breakdown of its inputs, the thresholds used and the points given (FR-3.3). The Location Score is their weighted mean, with the Scout Mode's weights (FR-4.2): switching mode changes only the Location Score. Safety and Competition count per 1,000 of the Search Area's residents, as the Demographics Layer estimates them, or per km² while it is not prepared or unavailable; Demand needs it. A Layer that is unavailable leaves its Category Score out, the other weights are renormalised, and the Location Score lists what was left out (FR-3.4). The scores are beta: the same inputs always give the same scores (FR-3.6), but Phase 1 has no regional averages to compare with. The Layers' Data Source calls are shared with `/api/area/{layer}` requests for the same Search Area, so scoring calls no source again.",
  request: {
    query: areaQuery.extend({
      mode: modeQuery("The Scout Mode, whose weights make the Location Score."),
    }),
  },
  responses: {
    200: json(ScoresResponseSchema, "The Search Area's scores."),
    400: failure(
      "The Location, Search Radius, postcode or Scout Mode is not valid.",
    ),
    ...locationCheckFailures,
  },
});

export const highlightsRoute = createRoute({
  method: "get",
  path: "/highlights",
  summary: "Give a Search Area's Highlights: Good, Watch and Concern",
  description:
    "Checks the Location is in England exactly as `/api/area` does, answering in the same way if it is not, then loads every Layer the Highlights read and applies the fixed rules in `apps/api/src/scoring/config.ts` that the Scout Mode applies (PRD FR-3.7). Each Highlight is a short Good, Watch or Concern statement from one Layer's calculated figures, never from AI, and names that Layer so it can link to it. Concerns come first, then Watches, then Goods. A Layer that is unavailable gives no Highlights, and is listed as left out. The Layers' Data Source calls are shared with `/api/area/{layer}` and `/api/scores` requests for the same Search Area, so the Highlights call no source again.",
  request: {
    query: areaQuery.extend({
      mode: modeQuery(
        "The Scout Mode, which decides which rules apply (PRD FR-3.7).",
      ),
    }),
  },
  responses: {
    200: json(HighlightsResponseSchema, "The Search Area's Highlights."),
    400: failure(
      "The Location, Search Radius, postcode or Scout Mode is not valid.",
    ),
    ...locationCheckFailures,
  },
});

/** `true` or `false` in the query string. */
const booleanParam = (fallback: boolean, description: string) =>
  z
    .enum(["true", "false"], { error: BOOLEAN_HINT })
    .transform((value) => value === "true")
    .default(fallback)
    .openapi({ type: "boolean", default: fallback, description });

/** The filters, scope and order of a Land Opportunity search (PRD FR-5.1, FR-5.3, FR-5.5). */
const landQuery = areaQuery.extend({
  scope: z
    .enum(LAND_SCOPES, { error: LAND_SCOPE_HINT })
    .default(DEFAULT_LAND_SCOPE)
    .openapi({
      description:
        "Where to look: the Search Area, or the whole of each Land Coverage Area it reaches into.",
    }),
  sort: z
    .enum(LAND_SORTS, { error: LAND_SORT_HINT })
    .default(DEFAULT_LAND_SORT)
    .openapi({
      description:
        "The largest first, the nearest a road first, or those that might hold the most homes first.",
    }),
  minAcres: numberParam(ACRES_HINT, z.number().min(0, ACRES_HINT))
    .default(DEFAULT_LAND_FILTERS.minAcres)
    .openapi({
      type: "number",
      minimum: 0,
      default: DEFAULT_LAND_FILTERS.minAcres,
      description: "Its least area, in acres.",
    }),
  maxAcres: numberParam(ACRES_HINT, z.number().min(0, ACRES_HINT))
    .optional()
    .openapi({
      type: "number",
      minimum: 0,
      description: "Its greatest area, in acres. Leave it out for no limit.",
    }),
  maxRoadMetres: z
    .union(
      [z.literal("any"), numberParam(ROAD_HINT, z.number().min(0, ROAD_HINT))],
      { error: ROAD_HINT },
    )
    .transform((value) => (value === "any" ? null : value))
    .default(DEFAULT_LAND_FILTERS.maxRoadMetres)
    .openapi({
      oneOf: [
        { type: "number", minimum: 0 },
        { type: "string", enum: ["any"] },
      ],
      default: DEFAULT_LAND_FILTERS.maxRoadMetres,
      description:
        "How far from a road it may be, in metres, or `any` for any distance.",
    }),
  maxFloodZone: numberParam(
    FLOOD_ZONE_HINT,
    z.literal(FLOOD_ZONES, { error: FLOOD_ZONE_HINT }),
  )
    .default(DEFAULT_LAND_FILTERS.maxFloodZone)
    .openapi({
      type: "integer",
      enum: [...FLOOD_ZONES],
      default: DEFAULT_LAND_FILTERS.maxFloodZone,
      description:
        "The highest flood zone it may be in: 1 leaves out flood zones 2 and 3, and 3 is any.",
    }),
  possiblyUnregisteredOnly: booleanParam(
    DEFAULT_LAND_FILTERS.possiblyUnregisteredOnly,
    "Only Possibly Unregistered land: less than half of it covered by INSPIRE Index Polygons.",
  ),
  excludeConstraints: z
    .string()
    .transform((input, ctx): PlanningConstraintType[] => {
      const types = input.split(",").filter((type) => type !== "");
      if (!types.every(isPlanningConstraintType)) {
        ctx.addIssue({ code: "custom", message: CONSTRAINTS_HINT });
        return z.NEVER;
      }
      return [...new Set(types)];
    })
    .default([])
    .openapi({
      type: "string",
      description: `Leave out land that intersects a Planning Constraint of these types, separated by commas: ${PLANNING_CONSTRAINT_TYPES.join(", ")}.`,
      example: "flood-zone,conservation-area",
    }),
  excludeListedBuildingOutlines: booleanParam(
    DEFAULT_LAND_FILTERS.excludeListedBuildingOutlines,
    "Leave out land that overlaps a listed building's outline.",
  ),
  ownershipCategories: z
    .string()
    .transform((input, ctx): OwnershipCategory[] => {
      const categories = input.split(",").filter((each) => each !== "");
      if (!categories.every(isOwnershipCategory)) {
        ctx.addIssue({ code: "custom", message: OWNERSHIP_HINT });
        return z.NEVER;
      }
      return [...new Set(categories)];
    })
    .default([])
    .openapi({
      type: "string",
      description: `Only land of these indicative Ownership Categories (PRD FR-5.4a, FR-5.5), separated by commas: ${OWNERSHIP_CATEGORIES.join(", ")}. Leave it out for any. Land has none where CCOD and OCOD aren't prepared, so it is in none of them.`,
      example: "company,council-or-public-body",
    }),
});

export const landRoute = createRoute({
  method: "get",
  path: "/land",
  summary:
    "Find the Land Opportunities in a Search Area or a Land Coverage Area",
  description: `Checks the Location is in England exactly as \`/api/area\` does, answering in the same way if it is not, then finds the Land Parcels \`pnpm data:prepare\` built in the Search Area, or in the whole of each Land Coverage Area it reaches into (PRD FR-5.1), that meet the filters (FR-5.3, FR-5.5), and lists the first ${String(LAND_LIST_LIMIT)} in the order chosen, with their tags (FR-5.4) and how many there are in all. Where \`pnpm data:prepare\` prepared HM Land Registry's CCOD and OCOD, each has an indicative Ownership Category, with the companies' and councils' titles matched to the INSPIRE Index Polygons in and around it by their addresses, and they are counted by it (FR-5.4a); otherwise it is only Possibly Unregistered or registered. In the Search Area, each has the land sales within 1 mile of it in the last 5 years, and the statistics those within 1 mile of any (FR-5.4b): HM Land Registry's Price Paid sales of property of type "Other", which are indicative: they may not be land. They are found in one Price Paid query for the postcodes \`pnpm data:prepare\` keeps within 1 mile of them; if Price Paid doesn't answer, they are \`unavailable\`, and the Land Opportunities are still given. Across a whole Land Coverage Area they aren't looked for: \`/api/land/{parcelId}\` gives one Land Parcel's. With no filter given it answers as \`/api/area/land\` does, with FR-5.3's defaults: at least 0.1 acre, 50 m or nearer a road, and not on a listed building's outline. A Search Area that reaches into no Land Coverage Area is \`not-prepared\`: land data not prepared for this area. Our data suggests each Land Opportunity warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner (FR-5.7).`,
  request: { query: landQuery },
  responses: {
    200: json(LandLayerResponseSchema, "The Land Opportunities found."),
    400: failure(
      "The Location, Search Radius, postcode or a filter is not valid.",
    ),
    ...locationCheckFailures,
  },
});

export const LAND_PARCEL_HINT =
  "parcelId must be a Land Parcel's id, its council's ONS code and its number, for example E07000170-412.";

export const landParcelRoute = createRoute({
  method: "get",
  path: "/land/{parcelId}",
  summary:
    "Give one Land Parcel, the INSPIRE Index Polygons that overlap it, and the land sales near it",
  description:
    "One Land Parcel `pnpm data:prepare` built, by its id, with its tags and outline, and the INSPIRE Index Polygons that overlap it, and those within 25 m of it a company's or council's title is matched to, with their outlines and indicative Ownership Categories (PRD FR-5.4a, FR-5.6), and every land sale within 1 mile of it in the last 5 years: HM Land Registry's Price Paid sales of property of type \"Other\", which are indicative: they may not be land (FR-5.4b). Its ownership can be checked with HM Land Registry's services: search the register, or ask for a search of the index map. INSPIRE Index Polygons cover only registered freehold titles (FR-5.8). It calls only Price Paid, for the land sales; if Price Paid doesn't answer, they are `unavailable`.",
  request: {
    params: z.object({
      parcelId: z
        .string()
        .regex(/^E\d{8}-\d+$/, LAND_PARCEL_HINT)
        .openapi({
          param: { name: "parcelId", in: "path" },
          description: "The Land Parcel's id.",
          example: "E07000170-412",
        }),
    }),
  },
  responses: {
    200: json(LandParcelResponseSchema, "The Land Parcel."),
    400: failure("The id is not a Land Parcel's."),
    404: failure(
      "No Land Coverage Area has a Land Parcel with that id: it may have been prepared again since, or not prepared at all.",
    ),
    503: failure("The prepared land data can't be read."),
  },
});

/** Every AI Explanation route says that it is off without a key (ADR 0005). */
const EXPLAIN_OFF =
  "AI Explanations are on only when `ANTHROPIC_API_KEY` is set in `.env`";

export const explainStatusRoute = createRoute({
  method: "get",
  path: "/explain",
  summary: "Say whether AI Explanations are on, with the questions they offer",
  description: `${EXPLAIN_OFF}. Without it, \`enabled\` is \`false\`, no Explain button is shown and nothing calls Anthropic. With it, this gives the model that writes them (\`ANTHROPIC_MODEL\`, \`claude-sonnet-5-5\` unless set) and the questions offered before the user's own (PRD FR-11.3), the Location Overview's for each Scout Mode. It calls no Data Source.`,
  responses: {
    200: json(ExplainStatusResponseSchema, "Whether AI Explanations are on."),
  },
});

export const ExplainRequestSchema = z
  .object({
    lat: z
      .number({ error: LOCATION_HINT })
      .min(-90, LOCATION_HINT)
      .max(90, LOCATION_HINT)
      .openapi({ description: "The Location's latitude.", example: 53.123664 }),
    lng: z
      .number({ error: LOCATION_HINT })
      .min(-180, LOCATION_HINT)
      .max(180, LOCATION_HINT)
      .openapi({
        description: "The Location's longitude.",
        example: -1.264078,
      }),
    radius: z
      .literal(SEARCH_RADII_MILES, { error: RADIUS_HINT })
      .openapi({ description: "The Search Radius in miles." }),
    postcode: z
      .string({ error: POSTCODE_HINT })
      .transform((input, ctx) => {
        const postcode = parsePostcode(input);
        if (postcode === null) {
          ctx.addIssue({ code: "custom", message: POSTCODE_HINT });
          return z.NEVER;
        }
        return postcode;
      })
      .optional()
      .openapi({
        type: "string",
        description:
          "The postcode the user searched for, if they did, which names the Location's local geography, as `/api/area`'s does.",
        example: "NG17 1AA",
      }),
    mode: z.string({ error: modeHint(SCORING_CONFIG.modes) }).openapi({
      description:
        "The Scout Mode chosen. One of the Scout Modes `/api/modes` lists.",
      enum: SCORING_CONFIG.modes.map(({ id }) => id),
      example: "homebuyer",
    }),
    weights: z
      .partialRecord(
        CategoryIdSchema,
        z
          .int({ error: WEIGHTS_HINT })
          .min(0, WEIGHTS_HINT)
          .max(100, WEIGHTS_HINT),
        { error: WEIGHTS_HINT },
      )
      .optional()
      .openapi({
        description:
          "The user's own weights for the Scout Mode (PRD FR-4.4), if the Location Score shown is weighed by them. Categories not named count for nothing.",
        example: { safety: 40, transport: 60 },
      }),
    subject: ExplainSubjectSchema.openapi({ description: SUBJECT_HINT }),
    question: z
      .string({ error: QUESTION_HINT })
      .trim()
      .min(1, QUESTION_HINT)
      .max(EXPLAIN_RULES.maxQuestionLength, QUESTION_HINT)
      .openapi({
        description:
          "A question offered by `GET /api/explain`, or one of the user's own.",
        example: "What are the biggest risks here?",
      }),
  })
  .openapi("ExplainRequest", {
    description:
      "A question about the Location Overview, a Category Score or a Land Opportunity in a Search Area, in a Scout Mode.",
  });

export const explainRoute = createRoute({
  method: "post",
  path: "/explain",
  summary: "Explain a Search Area's figures in plain English, streamed",
  description: `An AI Explanation (PRD §6.9). ${EXPLAIN_OFF}; without it this answers 404 and nothing calls Anthropic. It checks the Location is in England exactly as \`/api/area\` does, then loads the figures already shown for the subject from the same Data Source calls, which the cache answers: for the Overview its Highlights, scores with their breakdowns and every Layer's statistics; for a Category Score its breakdown, its part in the Location Score and its Layers' statistics; for a Land Opportunity its tags, Ownership Category, overlapping INSPIRE Index Polygons, land sales and Planning Applications nearby. Only those figures and the question are sent to the model, told to use no number that isn't in them, to say what is unavailable, and, where Land Opportunities are concerned, to repeat their wording (FR-11.2, FR-5.7). Scores are never decided by the model (ADR 0005). The answer streams as server-sent events, each one's \`data\` an \`ExplainEvent\` as JSON: its text as it is written, then \`done\` with its tokens and any number in it the figures don't have (FR-11.6), or \`error\`. A finished answer is kept in memory for 24 hours, so the same question about the same figures is answered again at no cost (FR-11.5).`,
  request: {
    body: {
      content: { "application/json": { schema: ExplainRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description:
        "The explanation, as server-sent events, each one's `data` an `ExplainEvent` as JSON.",
      content: { "text/event-stream": { schema: ExplainEventSchema } },
    },
    400: failure(
      "The Location, Search Radius, postcode, Scout Mode, weights, subject or question is not valid.",
    ),
    404: failure(
      "AI Explanations are off, as `ANTHROPIC_API_KEY` isn't set; or the Location has no postcode within 2 km; or no Land Coverage Area has the Land Opportunity.",
    ),
    422: locationCheckFailures[422],
    502: locationCheckFailures[502],
    503: failure("The prepared land data can't be read."),
  },
});
