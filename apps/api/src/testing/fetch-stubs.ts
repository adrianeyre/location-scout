import { vi } from "vitest";

/**
 * Stand-ins for `fetch`, so adapter and route tests never reach a Data Source
 * (PRD NFR-3.3). Pass them to `createApp({ fetch })` or `createSourceCaller`.
 */

/** Answers every call with a fresh response from `respond`. */
export const stubFetch = (respond: () => Response | Promise<Response>) =>
  vi.fn<typeof fetch>(() => Promise.resolve(respond()));

/** Answers every call with a recorded fixture body. */
export const fixtureFetch = (body: unknown, init?: ResponseInit) =>
  stubFetch(() => Response.json(body, init));

/** Fails any test that lets a Data Source call reach the network. */
export const noNetwork = () =>
  vi.fn<typeof fetch>(() =>
    Promise.reject(new Error("tests must not call Data Sources")),
  );

/** A source that never answers: the call only ends when its signal aborts. */
export const neverAnswers = () =>
  vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason as Error);
        });
      }),
  );

/**
 * Answers postcodes.io's lookups with a recorded fixture body, such as the
 * postcode nearest a Location in England that `/api/area` checks first, and
 * passes every other call to `others`.
 */
export const withPostcodesIo = (
  body: unknown,
  others: typeof fetch = noNetwork(),
  responseInit?: ResponseInit,
) =>
  vi.fn<typeof fetch>((input, init) =>
    typeof input === "string" && input.startsWith("https://api.postcodes.io/")
      ? Promise.resolve(Response.json(body, responseInit))
      : others(input, init),
  );

/** postcodes.io gives its HTTP status in the body too, for example `404`. */
const statusOf = (body: unknown) =>
  typeof body === "object" &&
  body !== null &&
  "status" in body &&
  typeof body.status === "number"
    ? body.status
    : 200;

/**
 * Answers postcodes.io with recorded fixture bodies, each with the status it
 * gives: `lookup` for a postcode, as a search looks it up, and `nearest` for
 * the postcode nearest a Location, or for the postcodes in a Search Area if
 * `inSearchArea` has none for its URL, such as `NG17_1AA_PROPERTY.postcodes`.
 * Every other call goes to `others`.
 */
export const postcodesIoFixtures = (
  {
    lookup,
    nearest,
    inSearchArea = new Map(),
  }: {
    lookup: unknown;
    nearest: unknown;
    inSearchArea?: ReadonlyMap<string, unknown>;
  },
  others: typeof fetch = noNetwork(),
) =>
  vi.fn<typeof fetch>((input, init) => {
    if (typeof input !== "string") return others(input, init);
    const body = input.startsWith("https://api.postcodes.io/postcodes/")
      ? lookup
      : input.startsWith("https://api.postcodes.io/postcodes?")
        ? (inSearchArea.get(input) ?? nearest)
        : undefined;
    return body === undefined
      ? others(input, init)
      : Promise.resolve(Response.json(body, { status: statusOf(body) }));
  });

/** The month a street-level crimes request asks for, from its form body. */
export const policeMonthOf = (init?: RequestInit) =>
  typeof init?.body === "string"
    ? new URLSearchParams(init.body).get("date")
    : null;

/**
 * Answers data.police.uk with recorded fixture bodies: `lastUpdated` for its
 * latest month, and for the street-level crimes in any polygon either
 * `crimes`, whatever the month, or the month's body in `crimesByMonth`. A
 * month with none fails, as if data.police.uk had not answered. Every other
 * call goes to `others`.
 */
export const policeFixtures = (
  fixtures: { lastUpdated: unknown } & (
    { crimes: unknown } | { crimesByMonth: ReadonlyMap<string, unknown> }
  ),
  others: typeof fetch = noNetwork(),
) =>
  vi.fn<typeof fetch>((input, init) => {
    if (input === "https://data.police.uk/api/crime-last-updated") {
      return Promise.resolve(Response.json(fixtures.lastUpdated));
    }
    if (input === "https://data.police.uk/api/crimes-street/all-crime") {
      if ("crimes" in fixtures) {
        return Promise.resolve(Response.json(fixtures.crimes));
      }
      const crimes = fixtures.crimesByMonth.get(policeMonthOf(init) ?? "");
      return crimes === undefined
        ? Promise.reject(new Error("data.police.uk did not answer"))
        : Promise.resolve(Response.json(crimes));
    }
    return others(input, init);
  });

/**
 * Answers planning.data.gov.uk with recorded fixture bodies, by the URL asked
 * for, such as `NG17_1AA_PLANNING_DATA`. A URL with none fails, as if
 * planning.data.gov.uk had not answered. Every other call goes to `others`.
 */
export const planningDataFixtures = (
  bodies: ReadonlyMap<string, unknown>,
  others: typeof fetch = noNetwork(),
) =>
  vi.fn<typeof fetch>((input, init) => {
    if (
      typeof input === "string" &&
      input.startsWith("https://www.planning.data.gov.uk/")
    ) {
      const body = bodies.get(input);
      return body === undefined
        ? Promise.reject(new Error("planning.data.gov.uk did not answer"))
        : Promise.resolve(Response.json(body));
    }
    return others(input, init);
  });

/**
 * Answers Overpass with recorded fixture bodies, by the form body of the
 * query, such as `NG17_1AA_OVERPASS`. A query with none fails, as if Overpass
 * had not answered. Every other call goes to `others`.
 */
export const overpassFixtures = (
  bodies: ReadonlyMap<string, unknown>,
  others: typeof fetch = noNetwork(),
) =>
  vi.fn<typeof fetch>((input, init) => {
    if (input === "https://overpass-api.de/api/interpreter") {
      const body = bodies.get(typeof init?.body === "string" ? init.body : "");
      return body === undefined
        ? Promise.reject(new Error("Overpass did not answer"))
        : Promise.resolve(Response.json(body));
    }
    return others(input, init);
  });

/**
 * Answers HM Land Registry's SPARQL endpoint with recorded fixture bodies, by
 * the form body of the query, such as `NG17_1AA_PROPERTY.pricePaid`. A query
 * with none fails, as if Price Paid had not answered. Every other call goes
 * to `others`.
 */
export const landRegistryFixtures = (
  bodies: ReadonlyMap<string, unknown>,
  others: typeof fetch = noNetwork(),
) =>
  vi.fn<typeof fetch>((input, init) => {
    if (input === "https://landregistry.data.gov.uk/landregistry/query") {
      const body = bodies.get(typeof init?.body === "string" ? init.body : "");
      return body === undefined
        ? Promise.reject(new Error("HM Land Registry did not answer"))
        : Promise.resolve(Response.json(body));
    }
    return others(input, init);
  });

/**
 * Answers PlanIt with recorded fixture bodies, by the URL asked for, such as
 * `NG17_1AA_PLANIT`. A URL with none fails, as if PlanIt had not answered.
 * Every other call goes to `others`.
 */
export const planItFixtures = (
  bodies: ReadonlyMap<string, unknown>,
  others: typeof fetch = noNetwork(),
) =>
  vi.fn<typeof fetch>((input, init) => {
    if (
      typeof input === "string" &&
      input.startsWith("https://www.planit.org.uk/")
    ) {
      const body = bodies.get(input);
      return body === undefined
        ? Promise.reject(new Error("PlanIt did not answer"))
        : Promise.resolve(Response.json(body));
    }
    return others(input, init);
  });

/**
 * Answers PlanWire with recorded fixture bodies, by the URL asked for, such
 * as `NG17_1AA_PLANWIRE`, to requests with `apiKey` in their `X-API-Key`
 * header; any other key is refused with `401`, as PlanWire refuses it. A URL
 * with none fails, as if PlanWire had not answered. Every other call goes to
 * `others`.
 */
export const planWireFixtures = (
  bodies: ReadonlyMap<string, unknown>,
  apiKey: string,
  others: typeof fetch = noNetwork(),
) =>
  vi.fn<typeof fetch>((input, init) => {
    if (
      typeof input === "string" &&
      input.startsWith("https://api.planwire.io/")
    ) {
      if (new Headers(init?.headers).get("x-api-key") !== apiKey) {
        return Promise.resolve(
          Response.json({ error: "Invalid API key" }, { status: 401 }),
        );
      }
      const body = bodies.get(input);
      return body === undefined
        ? Promise.reject(new Error("PlanWire did not answer"))
        : Promise.resolve(Response.json(body));
    }
    return others(input, init);
  });

/**
 * Answers the EPC API with recorded fixture bodies, by the URL asked for,
 * such as `NG17_1AA_EPC`, `null` with its `404`, to requests with `apiKey`
 * as their bearer token; any other is refused with `403`, as the EPC API
 * refuses it. A URL with none fails, as if the EPC API had not answered.
 * Every other call goes to `others`.
 */
export const epcFixtures = (
  bodies: ReadonlyMap<string, unknown>,
  apiKey: string,
  others: typeof fetch = noNetwork(),
) =>
  vi.fn<typeof fetch>((input, init) => {
    if (
      typeof input === "string" &&
      input.startsWith(
        "https://api.get-energy-performance-data.communities.gov.uk/",
      )
    ) {
      if (
        new Headers(init?.headers).get("authorization") !== `Bearer ${apiKey}`
      ) {
        return Promise.resolve(
          Response.json(
            { error: "Access denied. Bad authentication header." },
            { status: 403 },
          ),
        );
      }
      const body = bodies.get(input);
      if (body === null) {
        return Promise.resolve(
          Response.json({ error: "No data found" }, { status: 404 }),
        );
      }
      return body === undefined
        ? Promise.reject(new Error("The EPC API did not answer"))
        : Promise.resolve(Response.json(body));
    }
    return others(input, init);
  });
