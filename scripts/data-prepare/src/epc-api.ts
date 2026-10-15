/**
 * MHCLG's Energy Performance of Buildings Data API, which replaced
 * epc.opendatacommunities.org's API in 2026 (OQ-8,
 * docs/spikes/oq-8-epc-api.md). Every request needs the bearer token a
 * GOV.UK One Login account is given on the service's "my account" page.
 * Its standard limit is 6,000 requests every 5 minutes per IP address, and
 * it answers 429 beyond it.
 */

import type { Certificate } from "@location-scout/shared";

/** Where the API is, and the variable that holds its bearer token. */
export const EPC_API = {
  base: "https://api.get-energy-performance-data.communities.gov.uk",
  keyVariable: "EPC_API_KEY",
  /** How long to wait after a 429 without a Retry-After. */
  retryAfterMs: 60_000,
  /** How many 429s in a row to wait out before giving up. */
  retries: 3,
  timeoutMs: 8_000,
} as const;

/** What a certificate says, beyond its search result. */
export interface CertificateDetails {
  uprn: string | null;
  /** Total floor area in m², where it is a positive number. */
  totalFloorArea: number | null;
  /** "A" to "G". */
  currentBand: string | null;
  potentialBand: string | null;
  /** SAP points, 1 to 100 or more. */
  currentRating: number | null;
  potentialRating: number | null;
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const uprnOf = (value: unknown) => {
  const uprn = number(value);
  return uprn === null || uprn <= 0 ? null : String(uprn);
};

/** A search result as `matchSale` reads it. */
const certificateOf = (row: Record<string, unknown>): Certificate => ({
  certificateNumber: text(row.certificateNumber) ?? "",
  uprn: uprnOf(row.uprn),
  addressLines: [
    text(row.addressLine1),
    text(row.addressLine2),
    text(row.addressLine3),
    text(row.addressLine4),
  ],
  registrationDate: (text(row.registrationDate) ?? "").slice(0, 10),
});

/** A certificate's `data` block as `CertificateDetails`. */
export const certificateDetails = (
  data: Record<string, unknown>,
): CertificateDetails => {
  const area = number(data.total_floor_area);
  return {
    uprn: uprnOf(data.uprn),
    totalFloorArea: area !== null && area > 0 ? area : null,
    currentBand: text(data.current_energy_efficiency_band),
    potentialBand: text(data.potential_energy_efficiency_band),
    currentRating: number(data.energy_rating_current),
    potentialRating: number(data.energy_rating_potential),
  };
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * GETs `path` with `token`, waiting out a 429 as its Retry-After asks.
 * Answers null for a 404, which is how the API says nothing matched.
 */
const get = async (
  fetchFn: typeof fetch,
  token: string,
  path: string,
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<Record<string, unknown> | null> => {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchFn(`${EPC_API.base}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(EPC_API.timeoutMs),
    });
    if (response.status === 404) return null;
    if (response.status === 429 && attempt < EPC_API.retries) {
      const seconds = Number(response.headers.get("retry-after"));
      await wait(
        Number.isFinite(seconds) && seconds > 0
          ? seconds * 1000
          : EPC_API.retryAfterMs,
      );
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `The EPC API answered ${String(response.status)} for ${path}: ${(await response.text()).slice(0, 200)}`,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }
};

/**
 * The domestic certificates registered for a postcode, or for a UPRN: one
 * request, as a postcode never has more than a page (5,000) of them.
 */
export const searchDomestic = async (
  fetchFn: typeof fetch,
  token: string,
  query: { postcode: string } | { uprn: string },
  wait?: (ms: number) => Promise<unknown>,
): Promise<Certificate[]> => {
  const parameters = new URLSearchParams(
    "postcode" in query
      ? { postcode: query.postcode, page_size: "5000" }
      : { uprn: query.uprn.padStart(12, "0"), page_size: "5000" },
  );
  const body = await get(
    fetchFn,
    token,
    `/api/domestic/search?${parameters.toString()}`,
    wait,
  );
  const rows = body?.data;
  return Array.isArray(rows)
    ? rows.map((row) => certificateOf(row as Record<string, unknown>))
    : [];
};

/** A certificate's floor area and ratings, or null if there is no such certificate. */
export const fetchCertificate = async (
  fetchFn: typeof fetch,
  token: string,
  certificateNumber: string,
  wait?: (ms: number) => Promise<unknown>,
): Promise<CertificateDetails | null> => {
  const body = await get(
    fetchFn,
    token,
    `/api/certificate?${new URLSearchParams({ certificate_number: certificateNumber }).toString()}`,
    wait,
  );
  const data = body?.data;
  return data !== null && typeof data === "object"
    ? certificateDetails(data as Record<string, unknown>)
    : null;
};
