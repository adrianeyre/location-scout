import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";

import {
  CATEGORY_IDS,
  CATEGORY_NAMES,
  SERVED_LAYER_IDS,
  locationScore,
  milesToMetres,
  type ApiErrorResponse,
  type CategoryId,
  type ExplainEvent,
  type ExplainRequest,
  type GeocodeCandidate,
  type LocalGeography,
  type Location,
  type SearchArea,
  type SearchRadiusMiles,
} from "@location-scout/shared";

import { loadCoverage } from "./coverage";
import { createExplainer } from "./explain/explainer";
import {
  categoryFacts,
  hasLandOpportunities,
  landOpportunityFacts,
  overviewFacts,
  type ExplainFacts,
  type JudgedSearchArea,
} from "./explain/facts";
import { DEFAULT_ANTHROPIC_MODEL, createAnthropicModel } from "./explain/model";
import { explainPrompt } from "./explain/prompt";
import { explainQuestions } from "./explain/questions";
import { parsePostcode } from "./postcode";
import {
  LAYER_LOADERS,
  applicationsFor,
  landLayerResponse,
  landSalesFor,
} from "./layers";
import {
  ENGLAND_ONLY,
  areaLayerRoute,
  areaRoute,
  coverageRoute,
  explainRoute,
  explainStatusRoute,
  geocodeRoute,
  healthRoute,
  highlightsRoute,
  landParcelRoute,
  landRoute,
  modeHint,
  modesRoute,
  scoresRoute,
  streetViewRoute,
} from "./routes";
import {
  SCORING_CONFIG,
  type ScoringConfig,
  type ScoutModeConfig,
} from "./scoring/config";
import { highlightSearchArea, loadHighlights } from "./scoring/highlights";
import {
  loadScores,
  scoreSearchArea,
  type ScoredLayers,
} from "./scoring/scores";
import { findScoutMode, modesResponse } from "./scoring/scout-modes";
import {
  AREA_SOURCES,
  loadAreaSources,
  sourceReport,
  type AreaSource,
} from "./sources/area-sources";
import {
  councilAt,
  councilReport,
  onsCouncilBoundaries,
} from "./sources/council-boundaries";
import { createSourceCaller } from "./sources/data-source";
import { createEpcRegister } from "./sources/epc";
import { landOpportunities, landParcel, landParcels } from "./sources/land";
import { landSalesNear } from "./sources/land-sales";
import { nearbyPlanningApplications } from "./sources/nearby-applications";
import { NOMINATIM_LIMITER, searchAddress } from "./sources/nominatim";
import { OVERPASS_LIMITER } from "./sources/overpass";
import { PLANIT_LIMITER, createPlanIt } from "./sources/planit";
import { planningApplicationsIn } from "./sources/planning-applications";
import { createPlanWire } from "./sources/planwire";
import { POLICE_LIMITER } from "./sources/police";
import {
  NEAREST_POSTCODE_RADIUS_METRES,
  lookupPostcode,
  postcodeAt,
} from "./sources/postcodes-io";
import {
  DATA_DIR,
  openPreparedData,
  type PreparedData,
} from "./sources/prepared-data";
import type { HoldingRateLimiter, RateLimiter } from "./sources/rate-limiter";

const BASE_PATH = "/api";

/** Where the OpenAPI document and its interactive page are served (PRD FR-8.1). */
export const OPENAPI_PATH = `${BASE_PATH}/openapi.json`;
export const DOCS_PATH = `${BASE_PATH}/docs`;

/** What `POST /api/explain` answers without `ANTHROPIC_API_KEY` (ADR 0005). */
export const EXPLAIN_OFF =
  "AI Explanations are off: ANTHROPIC_API_KEY is not set in .env.";

/** What the land routes answer for a Land Parcel no Land Coverage Area has. */
const noLandParcel = (parcelId: string) =>
  `No Land Coverage Area has a Land Parcel ${parcelId}. Its land data may have been prepared again since, which numbers its Land Parcels afresh, or not prepared at all: run pnpm data:prepare.`;

const LAND_UNREADABLE = "The prepared land data can't be read.";

/** One server-sent event, its data an `ExplainEvent` as JSON. */
const serverSentEvent = (event: ExplainEvent) =>
  new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

/** The Swagger UI release the docs page loads from jsDelivr. */
const SWAGGER_UI_VERSION = "5.33.1";

export interface AppOptions {
  /**
   * Identifies us to Nominatim (see `readConfig`), and to Overpass, which
   * refuses requests that don't say who sends them. There is no default.
   */
  nominatimUserAgent: string;
  /** How Data Sources are called. Tests pass a stub so nothing hits the network. */
  fetch?: typeof fetch;
  /** The Data Sources consulted for every Search Area. */
  areaSources?: readonly AreaSource[];
  /**
   * Spaces out Nominatim requests. The default is shared by every app in the
   * process; tests pass their own so they don't wait on one another.
   */
  nominatimLimiter?: RateLimiter;
  /** Spaces out data.police.uk requests, shared in the same way. */
  policeLimiter?: RateLimiter;
  /** Spaces out Overpass queries, shared in the same way. */
  overpassLimiter?: RateLimiter;
  /**
   * Identifies us to PlanIt, which asks for a User-Agent with a contact
   * email (`PLANIT_USER_AGENT`, see `readConfig`). Without one, PlanIt is
   * sent `nominatimUserAgent`, which has a way to contact us too.
   */
  planItUserAgent?: string | null;
  /**
   * Queues PlanIt requests at most one a minute, shared in the same way.
   * The tests' fixture-backed API passes one with no wait.
   */
  planItLimiter?: HoldingRateLimiter;
  /**
   * PlanWire's API key, when `PLANNING_APPLICATIONS_PROVIDER` is `planwire`
   * (see `readConfig`): Planning Applications then come from PlanWire
   * instead of PlanIt, and nothing else changes. `null`, the default, for
   * PlanIt.
   */
  planWireApiKey?: string | null;
  /**
   * `EPC_API_KEY` (see `readConfig`): the Property Layer then gives the
   * Energy Performance Certificates in the Search Area's postcodes and its
   * sales' (PRD FR-2.6). `null`, the default, leaves them out.
   */
  epcApiKey?: string | null;
  /**
   * `GOOGLE_MAPS_API_KEY` (see `readConfig`): `/api/street-view` gives it to
   * the frontend, which then offers the Street View panel (PRD FR-2.13).
   * `null`, the default, hides it.
   */
  googleMapsApiKey?: string | null;
  /**
   * `ANTHROPIC_API_KEY` (see `readConfig`): AI Explanations are then on,
   * written by `anthropicModel` through Anthropic's Messages API with the
   * app's `fetch` (PRD §6.9). `null`, the default, turns them off, and
   * nothing calls Anthropic (ADR 0005).
   */
  anthropicApiKey?: string | null;
  /** `ANTHROPIC_MODEL`: `claude-sonnet-5-5` unless set. */
  anthropicModel?: string;
  /**
   * Today's date, ISO 8601, which ends the Property Layer's last 12 months.
   * Tests pass the day their fixtures were recorded, so they ask what was asked.
   */
  today?: () => string;
  /**
   * The thresholds, Highlights and Scout Modes the scores use. Tests pass
   * their own, for example with a Scout Mode added, to show it needs config
   * alone (PRD FR-4.5).
   */
  scoringConfig?: ScoringConfig;
  /**
   * The files `pnpm data:prepare` made, read with DuckDB (ADR 0004). Tests
   * pass a tiny fixture, or a folder with nothing in it.
   */
  preparedData?: PreparedData;
}

const isoToday = () => new Date().toISOString().slice(0, 10);

export const createApp = ({
  nominatimUserAgent,
  fetch: fetchFn = fetch,
  areaSources = AREA_SOURCES,
  nominatimLimiter = NOMINATIM_LIMITER,
  policeLimiter = POLICE_LIMITER,
  overpassLimiter = OVERPASS_LIMITER,
  planItUserAgent = null,
  planItLimiter = PLANIT_LIMITER,
  planWireApiKey = null,
  epcApiKey = null,
  googleMapsApiKey = null,
  anthropicApiKey = null,
  anthropicModel = DEFAULT_ANTHROPIC_MODEL,
  today = isoToday,
  scoringConfig = SCORING_CONFIG,
  preparedData = openPreparedData(DATA_DIR),
}: AppOptions) => {
  const app = new OpenAPIHono({
    // Parameters that don't match a route's schema get its message, not a page error.
    defaultHook: (result, c) => {
      if (!result.success) {
        const [issue] = result.error.issues;
        return c.json<ApiErrorResponse>(
          { error: issue?.message ?? "The request is not valid." },
          400,
        );
      }
      return undefined;
    },
  }).basePath(BASE_PATH);
  // Its in-memory cache lives as long as this app: a restart empties it.
  const callSource = createSourceCaller({ fetch: fetchFn });
  const limiters = { police: policeLimiter, overpass: overpassLimiter };
  // Planning Applications come from PlanIt, or PlanWire with a key (ADR
  // 0003). PlanIt's queue of requests waiting for a turn lives as long as
  // this app, as the cache does.
  const planningApplications =
    planWireApiKey === null
      ? createPlanIt({
          userAgent: planItUserAgent ?? nominatimUserAgent,
          limiter: planItLimiter,
        })
      : createPlanWire({ apiKey: planWireApiKey });
  // EPCs are looked for only with a key (PRD FR-2.6).
  const epc =
    epcApiKey === null ? null : createEpcRegister({ apiKey: epcApiKey });
  // AI Explanations are written only with the user's own key (ADR 0005).
  // Their cache lives as long as this app, as the Data Sources' does.
  const explainer =
    anthropicApiKey === null
      ? null
      : createExplainer(
          createAnthropicModel({
            apiKey: anthropicApiKey,
            model: anthropicModel,
            fetch: fetchFn,
          }),
          anthropicModel,
        );

  // Every route is added with app.openapi from its contract in routes.ts, so
  // it appears in the OpenAPI document. openapi.test.ts fails if one isn't.
  app.openapi(healthRoute, (c) =>
    c.json({ status: "ok", service: "location-scout-api" } as const, 200),
  );

  app.openapi(geocodeRoute, async (c) => {
    const { q: query } = c.req.valid("query");
    const postcode = parsePostcode(query);

    if (postcode) {
      const lookup = await lookupPostcode(postcode, callSource);
      if (lookup.status !== "ok") {
        return c.json(
          {
            error: "Postcode lookup is unavailable. Please try again shortly.",
          },
          502,
        );
      }
      if (lookup.data.kind === "not-found") {
        return c.json(
          { error: `We couldn't find the postcode ${query.toUpperCase()}.` },
          404,
        );
      }
      const found: GeocodeCandidate = {
        kind: "postcode",
        label: lookup.data.postcode,
        location: lookup.data.location,
      };
      return c.json({ query, candidates: [found] }, 200);
    }

    // Anything that isn't a postcode is a free-text address (PRD FR-1.2).
    const search = await searchAddress(query, callSource, {
      userAgent: nominatimUserAgent,
      limiter: nominatimLimiter,
    });
    if (search.status !== "ok") {
      return c.json(
        { error: "Address search is unavailable. Please try again shortly." },
        502,
      );
    }
    if (search.data.length === 0) {
      return c.json(
        {
          error: `We couldn't find an address matching "${query}". Try adding the town or the postcode.`,
        },
        404,
      );
    }
    return c.json({ query, candidates: search.data }, 200);
  });

  /**
   * Checks a Location is in England before any Layer is loaded for it (PRD
   * FR-1.5), however it was chosen, and finds the local geography it lies in
   * (FR-1.8). Outside England, it gives the message to answer with instead.
   */
  const checkLocation = async (
    location: Location,
    postcode: string | null,
  ): Promise<
    | { inEngland: true; geography: LocalGeography }
    | { inEngland: false; error: string; status: 404 | 422 | 502 }
  > => {
    const nearest = await postcodeAt(location, postcode, callSource);
    if (nearest.status !== "ok") {
      return {
        inEngland: false,
        error:
          "We couldn't check that the Location is in England: postcodes.io is unavailable. Please try again shortly.",
        status: 502,
      };
    }
    if (nearest.data.kind === "none-nearby") {
      const km = NEAREST_POSTCODE_RADIUS_METRES / 1000;
      return {
        inEngland: false,
        error: `There is no postcode within ${String(km)} km of that Location, so it may be at sea or outside the UK. ${ENGLAND_ONLY} Choose a Location on land in England.`,
        status: 404,
      };
    }
    if (nearest.data.country !== "England") {
      return {
        inEngland: false,
        error: `${ENGLAND_ONLY} That Location is in ${nearest.data.country}.`,
        status: 422,
      };
    }
    return { inEngland: true, geography: nearest.data.geography };
  };

  const searchArea = (
    lat: number,
    lng: number,
    miles: SearchRadiusMiles,
  ): SearchArea => ({
    location: { lat, lng },
    searchRadius: { miles, metres: milesToMetres(miles) },
  });

  app.openapi(areaRoute, async (c) => {
    const {
      lat,
      lng,
      radius: miles,
      postcode,
      sources: consulted,
    } = c.req.valid("query");
    const checked = await checkLocation({ lat, lng }, postcode ?? null);
    if (!checked.inEngland) {
      return c.json({ error: checked.error }, checked.status);
    }

    const area = searchArea(lat, lng, miles);
    const [{ sources, layers }, council] = await Promise.all([
      // Without them, the Search Area waits for none of the Layers' sources.
      consulted
        ? loadAreaSources(
            area,
            areaSources,
            callSource,
            limiters,
            nominatimUserAgent,
            today(),
            preparedData,
          )
        : { sources: [], layers: [] },
      councilAt(area.location, callSource, preparedData),
    ]);
    return c.json(
      {
        ...area,
        geography: checked.geography,
        council: councilReport(council),
        sources: [...sources, sourceReport(onsCouncilBoundaries, council)],
        layers,
      },
      200,
    );
  });

  app.openapi(areaLayerRoute, async (c) => {
    const { layer } = c.req.valid("param");
    const { lat, lng, radius: miles, postcode } = c.req.valid("query");
    const checked = await checkLocation({ lat, lng }, postcode ?? null);
    if (!checked.inEngland) {
      return c.json({ error: checked.error }, checked.status);
    }

    const loadLayer = LAYER_LOADERS[layer];
    return c.json(
      await loadLayer(
        searchArea(lat, lng, miles),
        callSource,
        limiters,
        nominatimUserAgent,
        today(),
        preparedData,
        planningApplications,
        epc,
      ),
      200,
    );
  });

  app.openapi(landRoute, async (c) => {
    const {
      lat,
      lng,
      radius: miles,
      postcode,
      scope,
      sort,
      maxAcres,
      ...filters
    } = c.req.valid("query");
    const checked = await checkLocation({ lat, lng }, postcode ?? null);
    if (!checked.inEngland) {
      return c.json({ error: checked.error }, checked.status);
    }

    const query = {
      scope,
      sort,
      filters: { ...filters, maxAcres: maxAcres ?? null },
    };
    const area = searchArea(lat, lng, miles);
    const found = await landOpportunities(
      area,
      query,
      callSource,
      preparedData,
    );
    const [sales, applications] = await Promise.all([
      landSalesFor(found, query, today(), callSource, preparedData),
      applicationsFor(
        found,
        query,
        area,
        today(),
        callSource,
        planningApplications,
      ),
    ]);
    return c.json(landLayerResponse(found, query, sales, applications), 200);
  });

  app.openapi(landParcelRoute, async (c) => {
    const { parcelId } = c.req.valid("param");
    const found = await landParcel(parcelId, callSource, preparedData);
    if (found.status === "unavailable") {
      return c.json({ error: LAND_UNREADABLE }, 503);
    }
    if (found.status === "not-prepared" || found.data === null) {
      return c.json({ error: noLandParcel(parcelId) }, 404);
    }
    const sales = await landSalesNear(
      [found.data.parcel],
      today(),
      callSource,
      preparedData,
    );
    return c.json(
      {
        ...found.data,
        nearbyLandSales: sales.all,
        sources: [sourceReport(landParcels, found), ...sales.sources],
      },
      200,
    );
  });

  app.openapi(coverageRoute, async (c) =>
    c.json(await loadCoverage(preparedData, today()), 200),
  );

  app.openapi(modesRoute, (c) => c.json(modesResponse(scoringConfig), 200));

  app.openapi(streetViewRoute, (c) => {
    // The key is the user's own: no cache along the way keeps a copy.
    c.header("Cache-Control", "no-store");
    return c.json(
      googleMapsApiKey === null
        ? ({ enabled: false } as const)
        : ({ enabled: true, apiKey: googleMapsApiKey } as const),
      200,
    );
  });

  app.openapi(scoresRoute, async (c) => {
    const { lat, lng, radius: miles, postcode, mode } = c.req.valid("query");
    const scoutMode = findScoutMode(scoringConfig, mode);
    if (!scoutMode) {
      return c.json({ error: modeHint(scoringConfig.modes) }, 400);
    }
    const checked = await checkLocation({ lat, lng }, postcode ?? null);
    if (!checked.inEngland) {
      return c.json({ error: checked.error }, checked.status);
    }

    return c.json(
      await loadScores(
        searchArea(lat, lng, miles),
        scoutMode,
        callSource,
        limiters,
        nominatimUserAgent,
        today(),
        preparedData,
        planningApplications,
        scoringConfig,
      ),
      200,
    );
  });

  app.openapi(highlightsRoute, async (c) => {
    const { lat, lng, radius: miles, postcode, mode } = c.req.valid("query");
    const scoutMode = findScoutMode(scoringConfig, mode);
    if (!scoutMode) {
      return c.json({ error: modeHint(scoringConfig.modes) }, 400);
    }
    const checked = await checkLocation({ lat, lng }, postcode ?? null);
    if (!checked.inEngland) {
      return c.json({ error: checked.error }, checked.status);
    }

    return c.json(
      await loadHighlights(
        searchArea(lat, lng, miles),
        scoutMode,
        callSource,
        limiters,
        nominatimUserAgent,
        today(),
        preparedData,
        scoringConfig,
      ),
      200,
    );
  });

  app.openapi(explainStatusRoute, (c) =>
    c.json(
      explainer === null
        ? ({ enabled: false } as const)
        : ({
            enabled: true,
            model: anthropicModel,
            questions: explainQuestions(scoringConfig.modes),
          } as const),
      200,
    ),
  );

  /**
   * The figures the Overview and the Category Scores are explained from:
   * every Layer, from the same Data Source calls as their own requests, and
   * the scores and Highlights calculated from them, as `/api/scores` and
   * `/api/highlights` give them. With the user's own weights, the Location
   * Score is weighed by them, as the frontend weighs it.
   */
  const judge = async (
    area: SearchArea,
    geography: LocalGeography,
    mode: ScoutModeConfig,
    weights: ExplainRequest["weights"],
  ): Promise<JudgedSearchArea> => {
    const loaded = await Promise.all(
      SERVED_LAYER_IDS.map((id) =>
        LAYER_LOADERS[id](
          area,
          callSource,
          limiters,
          nominatimUserAgent,
          today(),
          preparedData,
          planningApplications,
          epc,
        ),
      ),
    );
    // Each Layer's loader gives that Layer's response.
    const layers = Object.fromEntries(
      SERVED_LAYER_IDS.map((id, index) => [id, loaded[index]]),
    ) as unknown as ScoredLayers;
    const scores = scoreSearchArea(layers, area, mode, scoringConfig);
    return {
      area,
      geography,
      mode,
      layers,
      scores,
      location: weights
        ? locationScore(
            scores.categories,
            Object.fromEntries(
              CATEGORY_IDS.map((id) => [id, weights[id] ?? 0]),
            ) as Record<CategoryId, number>,
          )
        : scores.location,
      ownWeights: weights !== undefined,
      highlights: highlightSearchArea(layers, area, mode, scoringConfig),
    };
  };

  app.openapi(explainRoute, async (c) => {
    if (explainer === null) return c.json({ error: EXPLAIN_OFF }, 404);
    const {
      lat,
      lng,
      radius: miles,
      postcode,
      mode,
      weights,
      subject,
      question,
    } = c.req.valid("json");
    const scoutMode = findScoutMode(scoringConfig, mode);
    if (!scoutMode) {
      return c.json({ error: modeHint(scoringConfig.modes) }, 400);
    }
    const checked = await checkLocation({ lat, lng }, postcode ?? null);
    if (!checked.inEngland) {
      return c.json({ error: checked.error }, checked.status);
    }

    const area = searchArea(lat, lng, miles);
    let facts: ExplainFacts;
    let landOpportunities: boolean;
    if (subject.kind === "land-opportunity") {
      const found = await landParcel(
        subject.parcelId,
        callSource,
        preparedData,
      );
      if (found.status === "unavailable") {
        return c.json({ error: LAND_UNREADABLE }, 503);
      }
      if (found.status === "not-prepared" || found.data === null) {
        return c.json({ error: noLandParcel(subject.parcelId) }, 404);
      }
      const { parcel } = found.data;
      const [sales, { applications }] = await Promise.all([
        landSalesNear([parcel], today(), callSource, preparedData),
        planningApplicationsIn(area, today(), callSource, planningApplications),
      ]);
      facts = landOpportunityFacts(
        area,
        checked.geography,
        scoutMode,
        { ...found.data, nearbyLandSales: sales.all },
        nearbyPlanningApplications(parcel.shape, applications),
      );
      landOpportunities = true;
    } else {
      const judged = await judge(area, checked.geography, scoutMode, weights);
      if (subject.kind === "category") {
        const category = categoryFacts(judged, subject.category);
        if (category === null) {
          return c.json(
            {
              error: `The ${scoutMode.name} Scout Mode doesn't score ${CATEGORY_NAMES[subject.category]}.`,
            },
            400,
          );
        }
        facts = category;
        landOpportunities = false;
      } else {
        facts = overviewFacts(judged);
        landOpportunities = hasLandOpportunities(judged);
      }
    }

    const events = explainer(
      explainPrompt(facts, question, landOpportunities),
      c.req.raw.signal,
    );
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await events.next();
        if (next.done) controller.close();
        else controller.enqueue(serverSentEvent(next.value));
      },
      async cancel() {
        await events.return(undefined);
      },
    });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  });

  app.doc31(OPENAPI_PATH.slice(BASE_PATH.length), {
    openapi: "3.1.0",
    info: {
      title: "Location Scout API",
      version: "0.0.0",
      description:
        "The local backend behind Location Scout. It is the only thing that calls Data Sources (ADR 0001). Every response body uses the types in `packages/shared`.",
    },
  });
  // The page calls the API from the browser, on whichever origin served it.
  app.get(
    DOCS_PATH.slice(BASE_PATH.length),
    swaggerUI({
      url: OPENAPI_PATH,
      title: "Location Scout API",
      version: SWAGGER_UI_VERSION,
    }),
  );

  return app;
};
