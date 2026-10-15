import {
  EPC_BANDS,
  EPC_RULES,
  PROPERTY_TYPES,
  isEpcBand,
  latestCertificates,
  matchSale,
  type Certificate,
  type EpcBand,
  type EpcStatistics,
  type PropertyEpc,
  type PropertySaleFeature,
  type PropertyType,
  type SaleEpcDetails,
  type SaleEpcMatch,
} from "@location-scout/shared";

import {
  DAY_MS,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import { priceSummary, type Sale } from "./land-registry";
import { retryAfterMs } from "./planning-applications";
import type { PostcodesInSearchArea } from "./postcodes-io";

/**
 * MHCLG's Energy Performance of Buildings Data API (PRD FR-2.6, OQ-8): the
 * Energy Performance Certificates of homes in England and Wales registered
 * since 2012. It needs a free bearer token from a GOV.UK One Login account,
 * `EPC_API_KEY`, and without one EPCs aren't looked for.
 */
export const epcRegister: DataSource = {
  id: "epc",
  name: "Energy Performance of Buildings Data API",
  // Searched like Price Paid, so cached as long (PRD NFR-1.4).
  cacheTtlMs: DAY_MS,
};

export const EPC_API_URL =
  "https://api.get-energy-performance-data.communities.gov.uk";

/** The most certificates the search gives at once, more than any postcode has. */
export const EPC_PAGE_SIZE = 5000;

/**
 * How many requests go to the EPC API at once. MHCLG allows 6,000 every 5
 * minutes, but asks for requests a few at a time, not all together.
 */
export const EPC_CONCURRENCY = 6;

/** How long to ask the EPC API nothing after a `429` without a `Retry-After`. */
export const EPC_RETRY_AFTER_MS = 60_000;

export class EpcError extends Error {
  override name = "EpcError";
}

/** The search for every domestic certificate in a postcode. */
export const domesticSearchUrl = (postcode: string) =>
  `${EPC_API_URL}/api/domestic/search?${new URLSearchParams({
    postcode,
    page_size: String(EPC_PAGE_SIZE),
  }).toString()}`;

/** One certificate's full data. */
export const certificateUrl = (certificateNumber: string) =>
  `${EPC_API_URL}/api/certificate?${new URLSearchParams({
    certificate_number: certificateNumber,
  }).toString()}`;

/**
 * A certificate as the search gives it, with its band: its address is
 * needed only to match it to a sale here, and is never answered with
 * (OQ-8), as its licence allows it only for energy-efficiency purposes.
 */
export interface SearchedCertificate extends Certificate {
  currentBand: EpcBand | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const numberOf = (value: unknown) =>
  typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;

const bandOf = (value: unknown) => {
  const band = text(value)?.toUpperCase();
  return isEpcBand(band) ? band : null;
};

const uprnOf = (value: unknown) => {
  const uprn = numberOf(value);
  return Number.isInteger(uprn) && uprn > 0 ? String(uprn) : null;
};

/**
 * Maps the search's answer to its certificates. MHCLG warns its answers may
 * hold keys it hasn't documented and values it can't vouch for, so each is
 * read defensively, and a certificate without a number or a date is left
 * out. `null`, a `404`, is how the API says it has none.
 */
export const mapDomesticSearch = (body: unknown): SearchedCertificate[] => {
  if (body === null) return [];
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new EpcError("The EPC API's search gave no data");
  }
  return body.data.flatMap((row): SearchedCertificate[] => {
    if (!isRecord(row)) return [];
    const certificateNumber = text(row.certificateNumber);
    const registrationDate = text(row.registrationDate)?.slice(0, 10) ?? "";
    if (
      certificateNumber === null ||
      !/^\d{4}-\d\d-\d\d$/.test(registrationDate)
    )
      return [];
    return [
      {
        certificateNumber,
        uprn: uprnOf(row.uprn),
        addressLines: [
          text(row.addressLine1),
          text(row.addressLine2),
          text(row.addressLine3),
          text(row.addressLine4),
        ],
        registrationDate,
        currentBand: bandOf(row.currentEnergyEfficiencyBand),
      },
    ];
  });
};

/** What a certificate says beyond its search result, before a sale's price is set against it. */
export type CertificateDetails = Omit<SaleEpcDetails, "pricePerSquareMetre">;

/**
 * Maps one certificate's answer to its potential band and floor area,
 * whichever schema it was lodged in. A floor area that isn't a positive
 * number is left out.
 */
export const mapCertificate = (body: unknown): CertificateDetails => {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new EpcError("The EPC API gave no certificate");
  }
  const area = numberOf(body.data.total_floor_area);
  return {
    potentialBand: bandOf(body.data.potential_energy_efficiency_band),
    floorAreaSquareMetres: Number.isFinite(area) && area > 0 ? area : null,
  };
};

/** The EPC API, asked with `EPC_API_KEY`. */
export interface EpcRegister {
  /** Every domestic certificate in `postcode`, in one request. */
  search: (
    postcode: string,
    callSource: CallSource,
  ) => Promise<SourceResult<SearchedCertificate[]>>;
  /** One certificate's potential band and floor area. */
  certificate: (
    certificateNumber: string,
    callSource: CallSource,
  ) => Promise<SourceResult<CertificateDetails>>;
}

export interface EpcRegisterOptions {
  /** `EPC_API_KEY`: the bearer token on the service's "my account" page. */
  apiKey: string;
}

/**
 * The EPC API, asked with `apiKey` as its bearer token. Each answer is
 * cached for 24 hours. Once it answers `429 Too Many Requests`, it is asked
 * nothing more until its `Retry-After` has passed, or a minute if it gives
 * none, as MHCLG asks.
 */
export const createEpcRegister = ({
  apiKey,
}: EpcRegisterOptions): EpcRegister => {
  let refusedUntil = 0;

  /** GETs `url`, answering `null` for a `404`, which is how the API says it has none. */
  const get = async (
    url: string,
    fetchFn: typeof fetch,
    signal: AbortSignal,
  ): Promise<unknown> => {
    if (Date.now() < refusedUntil) {
      throw new EpcError(
        `The EPC API is not asked until ${new Date(refusedUntil).toISOString()}, as it answered 429 Too Many Requests`,
      );
    }
    const response = await fetchFn(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      signal,
    });
    if (response.status === 404) return null;
    if (response.status === 429) {
      const ms = retryAfterMs(
        response.headers.get("retry-after"),
        EPC_RETRY_AFTER_MS,
      );
      refusedUntil = Date.now() + ms;
      throw new EpcError(
        `The EPC API answered 429 Too Many Requests: asking it nothing more for ${String(Math.ceil(ms / 1000))} s`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new EpcError(
        `The EPC API answered ${String(response.status)}: check EPC_API_KEY is the bearer token on your account page at get-energy-performance-data.communities.gov.uk`,
      );
    }
    if (!response.ok) {
      throw new EpcError(`The EPC API answered ${String(response.status)}`);
    }
    return response.json();
  };

  return {
    search: (postcode, callSource) => {
      const url = domesticSearchUrl(postcode);
      return callSource(epcRegister, url, async ({ fetch, signal }) => ({
        data: mapDomesticSearch(await get(url, fetch, signal)),
        period: null,
      }));
    },
    certificate: (certificateNumber, callSource) => {
      const url = certificateUrl(certificateNumber);
      return callSource(epcRegister, url, async ({ fetch, signal }) => ({
        data: mapCertificate(await get(url, fetch, signal)),
        period: null,
      }));
    },
  };
};

/** `load` for each of `items`, at most `limit` at once, in their order. */
export const atMost = async <T, R>(
  items: readonly T[],
  limit: number,
  load: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await load(items[index] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
};

/** The types of property the register of homes covers: houses and flats, not `other`. */
const HOMES: ReadonlySet<PropertyType> = new Set(
  PROPERTY_TYPES.filter((type) => type !== "other"),
);

/** What matching a sale found: its certificate, or why there is none. */
export type SaleMatch = SearchedCertificate | "unmatched" | "unavailable";

/** The sale's price over a floor area within `EPC_RULES`, or `null`. */
export const pricePerSquareMetre = (
  price: number,
  floorAreaSquareMetres: number | null,
) =>
  floorAreaSquareMetres !== null &&
  floorAreaSquareMetres >= EPC_RULES.minFloorAreaSquareMetres &&
  floorAreaSquareMetres <= EPC_RULES.maxFloorAreaSquareMetres
    ? Math.round(price / floorAreaSquareMetres)
    : null;

/** Each postcode's certificates, or `null` where the EPC API didn't answer. */
export type CertificatesByPostcode = ReadonlyMap<
  string,
  readonly SearchedCertificate[] | null
>;

/**
 * Matches each sale of a house or flat to a certificate in its postcode,
 * with `matchSale` (OQ-8), by its flat, house number or name and street.
 * Price Paid's SPARQL endpoint gives no UPRN, so its first step is never
 * taken. Other property is never looked for.
 */
export const matchSales = (
  sales: readonly Sale[],
  certificates: CertificatesByPostcode,
): Map<string, SaleMatch> =>
  new Map(
    sales
      .filter((sale) => HOMES.has(sale.type))
      .map((sale): [string, SaleMatch] => {
        const found = certificates.get(sale.postcode);
        if (!found) return [sale.id, "unavailable"];
        const { id, date, postcode, addressParts } = sale;
        const { certificate } = matchSale(
          { id, date, postcode, ...addressParts, uprn: null },
          found,
        );
        return [sale.id, certificate ?? "unmatched"];
      }),
  );

/**
 * The Energy Performance Certificates in the Search Area's postcodes, and
 * the sales matched to them (PRD FR-2.6): the homes in each band, by each
 * one's latest certificate, and the sales' price per m².
 */
export const epcStatistics = (
  certificates: CertificatesByPostcode,
  features: readonly PropertySaleFeature[],
): EpcStatistics => {
  const answered = [...certificates.values()].filter((found) => found !== null);
  const homes = answered.flatMap((found) => latestCertificates(found));
  const lookedFor = features.filter(({ epc }) => epc !== null);
  const matched = lookedFor.flatMap(({ epc }) =>
    epc?.status === "matched" ? [epc.certificate] : [],
  );
  return {
    byBand: EPC_BANDS.map((band) => ({
      band,
      count: homes.filter(({ currentBand }) => currentBand === band).length,
    })),
    homes: homes.length,
    postcodes: {
      searched: certificates.size,
      unanswered: certificates.size - answered.length,
    },
    sales: { lookedFor: lookedFor.length, matched: matched.length },
    pricePerSquareMetre: priceSummary(
      matched.flatMap(({ details }) =>
        details?.pricePerSquareMetre == null
          ? []
          : [details.pricePerSquareMetre],
      ),
    ),
  };
};

/** The Property Layer's sales with their EPCs, and the EPCs' statistics. */
export interface SalesWithEpcs {
  features: PropertySaleFeature[];
  /** `unavailable` if the EPC API answered for no postcode. */
  epc: PropertyEpc;
}

/**
 * Every certificate in the Search Area's postcodes, one request for each,
 * at most `EPC_CONCURRENCY` at once, by postcode, `null` for a postcode the
 * EPC API didn't answer for.
 */
export const certificatesIn = async (
  { postcodes }: PostcodesInSearchArea,
  register: EpcRegister,
  callSource: CallSource,
): Promise<CertificatesByPostcode> => {
  const answers = await atMost(postcodes, EPC_CONCURRENCY, ({ postcode }) =>
    register.search(postcode, callSource),
  );
  return new Map(
    postcodes.map(({ postcode }, index) => {
      const answer = answers[index];
      return [postcode, answer?.status === "ok" ? answer.data : null];
    }),
  );
};

/**
 * Gives each of `features` its Energy Performance Certificate (PRD FR-2.6):
 * it is matched among `certificates`, those in its postcode, and the
 * certificate it matched is asked for, at most `EPC_CONCURRENCY` at once,
 * for its potential band and floor area, and so its price per m². If the
 * EPC API doesn't answer for a certificate, only its details are missing.
 */
export const withEpcs = async (
  features: readonly PropertySaleFeature[],
  sales: readonly Sale[],
  certificates: CertificatesByPostcode,
  register: EpcRegister,
  callSource: CallSource,
): Promise<SalesWithEpcs> => {
  const matches = matchSales(sales, certificates);
  const wanted = [
    ...new Set(
      [...matches.values()].flatMap((match) =>
        typeof match === "string" ? [] : [match.certificateNumber],
      ),
    ),
  ];
  const answers = await atMost(wanted, EPC_CONCURRENCY, (number) =>
    register.certificate(number, callSource),
  );
  const details = new Map(
    wanted.map((number, index) => {
      const answer = answers[index];
      return [number, answer?.status === "ok" ? answer.data : null];
    }),
  );

  const epcOf = (sale: PropertySaleFeature): SaleEpcMatch | null => {
    const match = matches.get(sale.id);
    if (match === undefined) return null;
    if (typeof match === "string") return { status: match };
    const found = details.get(match.certificateNumber) ?? null;
    return {
      status: "matched",
      certificate: {
        certificateNumber: match.certificateNumber,
        registrationDate: match.registrationDate,
        currentBand: match.currentBand,
        details:
          found === null
            ? null
            : {
                ...found,
                pricePerSquareMetre: pricePerSquareMetre(
                  sale.price,
                  found.floorAreaSquareMetres,
                ),
              },
      },
    };
  };

  const withEpc = features.map((sale) => ({ ...sale, epc: epcOf(sale) }));
  const answered =
    certificates.size === 0 ||
    [...certificates.values()].some((found) => found !== null);
  return {
    features: withEpc,
    epc: answered
      ? { status: "ok", statistics: epcStatistics(certificates, withEpc) }
      : { status: "unavailable", statistics: null },
  };
};
