import ng17Epcs from "../sources/fixtures/epc-ng17-1aa.json" with { type: "json" };
import { certificateUrl, domesticSearchUrl } from "../sources/epc";

/** The bearer token tests give the EPC API, which its stubs answer to. */
export const TEST_EPC_API_KEY = "epc_test_location_scout";

/**
 * The EPC API's answers for the postcodes in NG17 1AA's 0.5 mile Search
 * Area, by the URL asked, `null` for its `404`, which is how it says it has
 * none. **Made up**, as no GOV.UK One Login account was to hand (OQ-8), in
 * the API's published schema (its OpenAPI file and MHCLG's JSON samples),
 * with certificate numbers beginning `9901` and UPRNs beginning `999`, as no
 * real one does. The 17 postcodes with sales from 9 October 2025 in Price
 * Paid's recording have 36 certificates of 35 homes: one for every house
 * sold but 9 Kensington Close, written as assessors write them ("21
 * Priestsic Rd", "10, The Twitchell"), with their neighbours'. 35 Portland
 * Street has two, from 2014 and 2022, and Rosedene, Coronation Street, no
 * UPRN. 97 Silk Street's floor area is 0, as some certificates' are. The
 * other 83 postcodes have none. Each certificate is answered for too.
 */
export const NG17_1AA_EPC: ReadonlyMap<string, unknown> = new Map<
  string,
  unknown
>([
  ...Object.entries(ng17Epcs.searches).map(
    ([postcode, body]): [string, unknown] => [
      domesticSearchUrl(postcode),
      body,
    ],
  ),
  ...Object.entries(ng17Epcs.certificates).map(
    ([number, body]): [string, unknown] => [certificateUrl(number), body],
  ),
]);
