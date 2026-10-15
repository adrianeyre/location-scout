import { distanceMetres } from "@location-scout/shared";

import { parsePostcode } from "../postcode";
import highStreet from "../sources/fixtures/nominatim-12-high-street-sutton-in-ashfield.json" with { type: "json" };
import nothingFound from "../sources/fixtures/nominatim-not-found.json" with { type: "json" };
import cf101ep from "../sources/fixtures/postcodes-io-cf10-1ep.json" with { type: "json" };
import eh11yz from "../sources/fixtures/postcodes-io-eh1-1yz.json" with { type: "json" };
import nearestAberystwyth from "../sources/fixtures/postcodes-io-nearest-aberystwyth.json" with { type: "json" };
import nearestCf101ep from "../sources/fixtures/postcodes-io-nearest-cf10-1ep.json" with { type: "json" };
import nearestEdinburgh from "../sources/fixtures/postcodes-io-nearest-edinburgh.json" with { type: "json" };
import nearestEh11yz from "../sources/fixtures/postcodes-io-nearest-eh1-1yz.json" with { type: "json" };
import nearestMansfield from "../sources/fixtures/postcodes-io-nearest-mansfield.json" with { type: "json" };
import nearestNg171aa from "../sources/fixtures/postcodes-io-nearest-ng17-1aa.json" with { type: "json" };
import nearestNorthSea from "../sources/fixtures/postcodes-io-nearest-north-sea.json" with { type: "json" };
import nearestSuttonParkway from "../sources/fixtures/postcodes-io-nearest-sutton-parkway.json" with { type: "json" };
import ng171aa from "../sources/fixtures/postcodes-io-ng17-1aa.json" with { type: "json" };
import postcodeNotFound from "../sources/fixtures/postcodes-io-not-found.json" with { type: "json" };
import policeLastUpdated from "../sources/fixtures/police-last-updated.json" with { type: "json" };
import { EPC_API_URL } from "../sources/epc";
import { SPARQL_URL } from "../sources/land-registry";
import { searchUrl } from "../sources/nominatim";
import { INTERPRETER_URL } from "../sources/overpass";
import { ENTITY_URL } from "../sources/planning-data";
import { APPLICS_URL } from "../sources/planit";
import { NEARBY_URL } from "../sources/planwire";
import {
  LAST_UPDATED_URL,
  STREET_CRIMES_URL,
  streetCrimesBody,
} from "../sources/police";
import {
  NEAREST_POSTCODE_RADIUS_METRES,
  POSTCODES_LIMIT,
} from "../sources/postcodes-io";
import {
  NG17_1AA_OVERPASS,
  SUTTON_PARKWAY_OVERPASS,
} from "./overpass-recordings";
import { NG17_1AA_PLANNING_DATA } from "./planning-data-recordings";
import { NG17_1AA_PLANIT } from "./planit-recordings";
import {
  NG17_1AA_PLANWIRE,
  TEST_PLANWIRE_API_KEY,
} from "./planwire-recordings";
import { stubAnthropic } from "./anthropic-stub";
import { NG17_1AA_EPC, TEST_EPC_API_KEY } from "./epc-recordings";
import { NG17_1AA_AREA, NG17_1AA_CRIMES_BY_MONTH } from "./police-ng17-1aa";
import {
  NG17_1AA_PROPERTY,
  SUTTON_PARKWAY_LAND_SALES,
  SUTTON_PARKWAY_PROPERTY,
} from "./property-recordings";

/**
 * A `fetch` that answers every Data Source call from recorded fixtures and
 * never reaches the network (PRD NFR-3.3). The fixture-backed API that the
 * end-to-end tests run against is built with it.
 */

/** The postcodes looked up, by their recorded postcode. */
const POSTCODE_LOOKUPS = [ng171aa, cf101ep, eh11yz];

/** The recorded reverse lookups, each answering for points near its postcode. */
const NEAREST_POSTCODES = [
  nearestNg171aa,
  nearestSuttonParkway,
  nearestMansfield,
  nearestCf101ep,
  nearestEh11yz,
  nearestEdinburgh,
  nearestAberystwyth,
];

/** The recorded address searches, by the query typed. */
const ADDRESS_SEARCHES = new Map<string, unknown>([
  [searchUrl("12 High Street, Sutton-in-Ashfield"), highStreet],
]);

/**
 * The recorded street-level crimes, by the body of the request: NG17 1AA's
 * 0.5 mile Search Area in each of the 24 months up to the one that
 * `police-last-updated.json` names.
 */
const STREET_CRIMES = new Map<string, unknown>(
  [...NG17_1AA_CRIMES_BY_MONTH].map(([month, crimes]) => [
    streetCrimesBody(NG17_1AA_AREA, month),
    crimes,
  ]),
);

/**
 * The recorded Overpass answers, by the body of the query: NG17 1AA's 0.5
 * mile Search Area, and a 0.25 mile one at Sutton Parkway station.
 */
const OVERPASS = new Map<string, unknown>([
  ...NG17_1AA_OVERPASS,
  ...SUTTON_PARKWAY_OVERPASS,
]);

/**
 * The recorded postcodes in a Search Area, by URL, and Price Paid's sales in
 * them, by the body of the query: NG17 1AA's 0.5 mile Search Area, and a 0.25
 * mile one at Sutton Parkway station. And the land sales within 1 mile of
 * the Land Opportunity there.
 */
const POSTCODES_IN_SEARCH_AREA = new Map<string, unknown>([
  ...NG17_1AA_PROPERTY.postcodes,
  ...SUTTON_PARKWAY_PROPERTY.postcodes,
]);
const PRICE_PAID = new Map<string, unknown>([
  ...NG17_1AA_PROPERTY.pricePaid,
  ...SUTTON_PARKWAY_PROPERTY.pricePaid,
  ...SUTTON_PARKWAY_LAND_SALES.pricePaid,
]);

/** postcodes.io `GET /postcodes/{postcode}`: the recording, or "not found". */
const lookupFixture = (postcode: string | null) =>
  POSTCODE_LOOKUPS.find(
    ({ result }) => parsePostcode(result.postcode) === postcode,
  ) ?? postcodeNotFound;

/**
 * postcodes.io `GET /postcodes?lon=&lat=`: the recording whose postcode is
 * nearest the point, or none at all beyond postcodes.io's radius, as at sea.
 */
const nearestFixture = (lat: number, lng: number) => {
  const byDistance = NEAREST_POSTCODES.map((body) => {
    const [nearest] = body.result;
    return {
      body,
      metres: nearest
        ? distanceMetres(
            { lat: nearest.latitude, lng: nearest.longitude },
            { lat, lng },
          )
        : Infinity,
    };
  })
    .filter(({ metres }) => metres <= NEAREST_POSTCODE_RADIUS_METRES)
    .sort((a, b) => a.metres - b.metres);
  return byDistance[0]?.body ?? nearestNorthSea;
};

/** postcodes.io gives its HTTP status in the body too, for example `404`. */
const replay = (body: unknown) =>
  Response.json(body, {
    status:
      typeof body === "object" &&
      body !== null &&
      "status" in body &&
      typeof body.status === "number"
        ? body.status
        : 200,
  });

/**
 * The recorded answer to `url`, sent with `body`, with `apiKey` in its
 * `X-API-Key` header and `authorization` as its `Authorization` header, if
 * any, or `undefined` if nothing was recorded for it.
 */
export const fixtureFor = (
  url: string,
  body?: string,
  apiKey?: string | null,
  authorization?: string | null,
): Response | undefined => {
  const { origin, pathname, searchParams } = new URL(url);

  if (origin === "https://api.postcodes.io") {
    if (pathname.startsWith("/postcodes/")) {
      const searched = decodeURIComponent(pathname.slice("/postcodes/".length));
      return replay(lookupFixture(parsePostcode(searched)));
    }
    // The postcodes in a Search Area are recorded for NG17 1AA's 0.5 mile
    // Search Area, and Sutton Parkway's 0.25 mile one, only.
    if (
      pathname === "/postcodes" &&
      searchParams.get("limit") === String(POSTCODES_LIMIT)
    ) {
      const postcodes = POSTCODES_IN_SEARCH_AREA.get(url);
      return postcodes === undefined ? undefined : replay(postcodes);
    }
    if (pathname === "/postcodes") {
      return replay(
        nearestFixture(
          Number(searchParams.get("lat")),
          Number(searchParams.get("lon")),
        ),
      );
    }
  }

  if (url.startsWith("https://nominatim.openstreetmap.org/search?")) {
    return replay(ADDRESS_SEARCHES.get(url) ?? nothingFound);
  }

  if (url === LAST_UPDATED_URL) return replay(policeLastUpdated);
  if (url === STREET_CRIMES_URL && body !== undefined) {
    const crimes = STREET_CRIMES.get(body);
    return crimes === undefined ? undefined : replay(crimes);
  }

  // planning.data.gov.uk is recorded for NG17 1AA's 0.5 mile Search Area only.
  if (url.startsWith(`${ENTITY_URL}?`)) {
    const entities = NG17_1AA_PLANNING_DATA.get(url);
    return entities === undefined ? undefined : replay(entities);
  }

  // PlanIt is recorded for NG17 1AA's 0.5 mile Search Area only.
  if (url.startsWith(`${APPLICS_URL}?`)) {
    const applications = NG17_1AA_PLANIT.get(url);
    return applications === undefined ? undefined : replay(applications);
  }

  // PlanWire is made up for NG17 1AA's 0.5 mile Search Area only, and
  // answers only the tests' key.
  if (url.startsWith(`${NEARBY_URL}?`)) {
    if (apiKey !== TEST_PLANWIRE_API_KEY) {
      return Response.json({ error: "Invalid API key" }, { status: 401 });
    }
    const applications = NG17_1AA_PLANWIRE.get(url);
    return applications === undefined ? undefined : replay(applications);
  }

  // The EPC API is made up for NG17 1AA's 0.5 mile Search Area only, and
  // answers only the tests' bearer token. `null` is its 404: none there.
  if (url.startsWith(`${EPC_API_URL}/`)) {
    if (authorization !== `Bearer ${TEST_EPC_API_KEY}`) {
      return Response.json(
        { error: "Access denied. Bad authentication header." },
        { status: 403 },
      );
    }
    const answer = NG17_1AA_EPC.get(url);
    if (answer === null) {
      return Response.json({ error: "No data found" }, { status: 404 });
    }
    return answer === undefined ? undefined : replay(answer);
  }

  // Overpass is recorded for NG17 1AA's 0.5 mile Search Area, and Sutton
  // Parkway's 0.25 mile one, only.
  if (url === INTERPRETER_URL && body !== undefined) {
    const elements = OVERPASS.get(body);
    return elements === undefined ? undefined : replay(elements);
  }

  // Price Paid is recorded for the same two Search Areas only, and the land
  // sales near Sutton Parkway's Land Opportunity.
  if (url === SPARQL_URL && body !== undefined) {
    const sales = PRICE_PAID.get(body);
    return sales === undefined ? undefined : replay(sales);
  }

  return undefined;
};

/**
 * Answers each call with its recording. A call with no recording fails, as
 * an unreachable source would, so its Layer reads "unavailable" and the call
 * is logged rather than sent.
 */
export const recordedFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  // AI Explanations are written by a stubbed model, which streams.
  const explained = stubAnthropic(url, init);
  if (explained) return Promise.resolve(explained);
  const body = typeof init?.body === "string" ? init.body : undefined;
  const headers = new Headers(init?.headers);
  const response = fixtureFor(
    url,
    body,
    headers.get("x-api-key"),
    headers.get("authorization"),
  );
  if (response) return Promise.resolve(response);
  console.error(`No fixture recorded for ${url}; it was not sent.`);
  return Promise.reject(new Error(`No fixture recorded for ${url}`));
};
