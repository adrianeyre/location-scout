import { createRoute, z } from "@hono/zod-openapi";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DOCS_PATH, OPENAPI_PATH, createApp } from "./app";
import {
  areaRoute,
  geocodeRoute,
  healthRoute,
  landParcelRoute,
  landRoute,
} from "./routes";
import highStreet from "./sources/fixtures/nominatim-12-high-street-sutton-in-ashfield.json" with { type: "json" };
import nothingFound from "./sources/fixtures/nominatim-not-found.json" with { type: "json" };
import nearestEdinburgh from "./sources/fixtures/postcodes-io-nearest-edinburgh.json" with { type: "json" };
import nearestMansfield from "./sources/fixtures/postcodes-io-nearest-mansfield.json" with { type: "json" };
import nearestNorthSea from "./sources/fixtures/postcodes-io-nearest-north-sea.json" with { type: "json" };
import ng171aa from "./sources/fixtures/postcodes-io-ng17-1aa.json" with { type: "json" };
import notFound from "./sources/fixtures/postcodes-io-not-found.json" with { type: "json" };
import { PREPARED_DATA_FIXTURE, testApp } from "./testing/app";
import {
  fixtureFetch,
  noNetwork,
  withPostcodesIo,
} from "./testing/fetch-stubs";

type App = ReturnType<typeof createApp>;

/** The parts of an OpenAPI document these tests read. */
interface OpenApiDocument {
  openapi: string;
  servers?: unknown;
  paths: Record<
    string,
    Record<
      string,
      {
        parameters?: { name: string; schema?: unknown }[];
        responses: Record<
          string,
          { content?: Record<string, { schema?: unknown }> }
        >;
      }
    >
  >;
}

const getDocument = async (app: App) => {
  const response = await app.request(OPENAPI_PATH);
  expect(response.status).toBe(200);
  return (await response.json()) as OpenApiDocument;
};

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head"];

const operations = (document: OpenApiDocument) =>
  Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => HTTP_METHODS.includes(method))
      .map(([method, operation]) => ({
        route: `${method.toUpperCase()} ${path}`,
        operation,
      })),
  );

/** The document and its page describe the API; they are not part of it. */
const DOCUMENTATION_ROUTES = [`GET ${OPENAPI_PATH}`, `GET ${DOCS_PATH}`];

/** Every route the app serves that the OpenAPI document leaves out. */
const undocumentedRoutes = (app: App, document: OpenApiDocument) => {
  const documented = operations(document).map(({ route }) => route);
  const served = app.routes
    // Middleware added with `use` is not a route.
    .filter(({ method }) => method !== "ALL")
    .map(({ method, path }) => `${method} ${path.replace(/:(\w+)/g, "{$1}")}`);
  return [...new Set(served)].filter(
    (route) =>
      !documented.includes(route) && !DOCUMENTATION_ROUTES.includes(route),
  );
};

/**
 * Every parameter or response in the document that has no schema, in JSON
 * or, for a stream such as `POST /api/explain`'s, its own content type.
 */
const missingSchemas = (document: OpenApiDocument) =>
  operations(document).flatMap(({ route, operation }) => [
    ...(operation.parameters ?? [])
      .filter(({ schema }) => schema === undefined)
      .map(({ name }) => `${route} parameter ${name}`),
    ...Object.entries(operation.responses)
      .filter(
        ([, response]) =>
          !Object.values(response.content ?? {}).some(
            ({ schema }) => schema !== undefined,
          ),
      )
      .map(([status]) => `${route} response ${status}`),
  ]);

describe(`GET ${OPENAPI_PATH}`, () => {
  it("is an OpenAPI 3.1 document of /api/health, /api/geocode, /api/area, /api/area/{layer}, /api/land, /api/land/{parcelId}, /api/coverage, /api/modes, /api/street-view, /api/scores, /api/highlights and /api/explain", async () => {
    const document = await getDocument(testApp({ fetch: noNetwork() }));

    expect(document.openapi).toBe("3.1.0");
    expect(operations(document).map(({ route }) => route)).toEqual([
      "GET /api/health",
      "GET /api/geocode",
      "GET /api/area",
      "GET /api/area/{layer}",
      "GET /api/land",
      "GET /api/land/{parcelId}",
      "GET /api/coverage",
      "GET /api/modes",
      "GET /api/street-view",
      "GET /api/scores",
      "GET /api/highlights",
      "GET /api/explain",
      "POST /api/explain",
    ]);
  });

  it("documents every route the API serves", async () => {
    const app = testApp({ fetch: noNetwork() });

    expect(undocumentedRoutes(app, await getDocument(app))).toEqual([]);
  });

  it("gives every parameter and response a schema", async () => {
    const document = await getDocument(testApp({ fetch: noNetwork() }));

    expect(missingSchemas(document)).toEqual([]);
  });

  it("would notice a route added without a schema", async () => {
    const app = testApp({ fetch: noNetwork() });
    app.get("/plain", (c) => c.json({ added: "without app.openapi" }));
    app.openapi(
      createRoute({
        method: "get",
        path: "/bare",
        request: { query: z.object({ q: z.string() }) },
        responses: { 200: { description: "No schema for the body." } },
      }),
      (c) => c.json({ added: "with no response schema" }, 200),
    );
    const document = await getDocument(app);

    expect(undocumentedRoutes(app, document)).toEqual(["GET /api/plain"]);
    expect(missingSchemas(document)).toEqual(["GET /api/bare response 200"]);
  });

  it("lets the docs page call the API on the server that serves it", async () => {
    const document = await getDocument(testApp({ fetch: noNetwork() }));

    // With no servers listed, the docs page calls the origin it was loaded from.
    expect(document.servers).toBeUndefined();
    expect(Object.keys(document.paths)).not.toHaveLength(0);
    for (const path of Object.keys(document.paths)) {
      expect(path).toMatch(/^\/api\//);
    }
  });
});

describe(`GET ${DOCS_PATH}`, () => {
  it("serves an interactive page for the OpenAPI document", async () => {
    const response = await testApp({ fetch: noNetwork() }).request(DOCS_PATH);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    const page = await response.text();
    expect(page).toContain("<title>Location Scout API</title>");
    expect(page).toContain("SwaggerUIBundle");
    expect(page).toContain(`url: '${OPENAPI_PATH}'`);
  });
});

describe("responses the API sends", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The schema a route documents for one status of its responses. */
  const documentedSchema = (
    route: { responses: Record<number, unknown> },
    status: number,
  ) => {
    const response = route.responses[status] as {
      content: { "application/json": { schema: z.ZodType } };
    };
    return response.content["application/json"].schema;
  };

  it.each([
    ["/api/health", healthRoute, noNetwork(), 200],
    ["/api/geocode?q=NG17%201AA", geocodeRoute, fixtureFetch(ng171aa), 200],
    ["/api/geocode", geocodeRoute, noNetwork(), 400],
    ["/api/geocode?q=%20", geocodeRoute, noNetwork(), 400],
    [
      "/api/geocode?q=12%20High%20Street%2C%20Sutton-in-Ashfield",
      geocodeRoute,
      fixtureFetch(highStreet),
      200,
    ],
    [
      "/api/geocode?q=Nowhere%20Lane",
      geocodeRoute,
      fixtureFetch(nothingFound),
      404,
    ],
    ["/api/geocode?q=High%20Street", geocodeRoute, noNetwork(), 502],
    [
      "/api/geocode?q=ZZ1%201ZZ",
      geocodeRoute,
      fixtureFetch(notFound, { status: 404 }),
      404,
    ],
    [
      "/api/area?lat=53.123664&lng=-1.264078",
      areaRoute,
      withPostcodesIo(nearestMansfield),
      200,
    ],
    ["/api/area?lat=north&lng=-1.26", areaRoute, noNetwork(), 400],
    [
      "/api/area?lat=53.5&lng=1.5",
      areaRoute,
      withPostcodesIo(nearestNorthSea),
      404,
    ],
    [
      "/api/area?lat=55.9533&lng=-3.1883",
      areaRoute,
      withPostcodesIo(nearestEdinburgh),
      422,
    ],
    ["/api/area?lat=53.123664&lng=-1.264078", areaRoute, noNetwork(), 502],
    [
      "/api/land?lat=53.1145&lng=-1.246&radius=0.25",
      landRoute,
      withPostcodesIo(nearestMansfield),
      200,
    ],
    [
      "/api/land?lat=53.1145&lng=-1.246&scope=land-coverage-area&sort=capacity&maxRoadMetres=any&excludeConstraints=flood-zone",
      landRoute,
      withPostcodesIo(nearestMansfield),
      200,
    ],
    [
      "/api/land?lat=53.1145&lng=-1.246&minAcres=-1",
      landRoute,
      noNetwork(),
      400,
    ],
    ["/api/land?lat=53.1145&lng=-1.246", landRoute, noNetwork(), 502],
    ["/api/land/E07000170-2", landParcelRoute, noNetwork(), 200],
    ["/api/land/E07000170-999999", landParcelRoute, noNetwork(), 404],
    ["/api/land/a-field", landParcelRoute, noNetwork(), 400],
  ] as const)(
    "match their documented schema: %s",
    async (url, route, fetchStub, status) => {
      // A Data Source that fails is logged; that is not what is tested here.
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const response = await testApp({
        fetch: fetchStub,
        preparedData: PREPARED_DATA_FIXTURE,
      }).request(url);

      expect(response.status).toBe(status);
      const body: unknown = await response.json();
      expect(documentedSchema(route, status).safeParse(body)).toMatchObject({
        success: true,
      });
    },
  );
});
