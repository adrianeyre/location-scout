import { COUNCIL_BOUNDARIES } from "./council-boundaries";
import boundaries from "./fixtures/ons-council-boundaries.json" with { type: "json" };

/**
 * The council boundaries as ONS Open Geography answered for three councils on
 * 8 October 2026 (`fixtures/ons-council-boundaries.json`): Ashfield and
 * Mansfield, which are in England, and Cardiff, which isn't.
 */
export const RECORDED_COUNCIL_BOUNDARIES = boundaries;

/** When the API's prepared-data fixture is recorded as prepared. */
export const FIXTURE_PREPARED_AT = new Date("2026-10-08T12:00:00.000Z");

/**
 * A `fetch` that answers the council boundaries query with the recording, and
 * refuses anything else without sending it, so nothing reaches the network.
 */
export const recordedBoundaries = ((input: string | URL | Request) => {
  const url = input instanceof Request ? input.url : String(input);
  return url.startsWith(`${COUNCIL_BOUNDARIES.url}/query?`)
    ? Promise.resolve(Response.json(boundaries))
    : Promise.reject(new TypeError(`No recording for ${url}`));
}) as typeof fetch;
