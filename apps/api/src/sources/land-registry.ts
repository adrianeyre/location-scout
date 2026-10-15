import {
  PROPERTY_TYPES,
  TENURES,
  isDate,
  type AddressSale,
  type DataPeriod,
  type MedianPriceChange,
  type PriceSummary,
  type PropertySaleFeature,
  type PropertyStatistics,
  type PropertyType,
  type Tenure,
} from "@location-scout/shared";

import {
  DAY_MS,
  type CallSource,
  type DataSource,
  type SourceResult,
} from "./data-source";
import { percentChange } from "./police";
import {
  POSTCODES_LIMIT,
  type PostcodeInSearchArea,
  type PostcodesInSearchArea,
} from "./postcodes-io";

/**
 * HM Land Registry's Price Paid Data: every residential sale in England and
 * Wales since 1995 (PRD §6.17). Free, no key, queried with SPARQL. It is
 * searched by postcode, so the postcodes in a Search Area come from
 * postcodes.io first (FR-2.8).
 */
export const landRegistry: DataSource = {
  id: "land-registry",
  name: "HM Land Registry Price Paid",
  // Price Paid is cached for 24 hours (PRD NFR-1.4).
  cacheTtlMs: DAY_MS,
};

/** HM Land Registry's SPARQL endpoint, queried with a POSTed form. */
export const SPARQL_URL = "https://landregistry.data.gov.uk/landregistry/query";

/** Where Price Paid's transactions are, by their ID. */
const TRANSACTION_URI = "http://landregistry.data.gov.uk/data/ppi/transaction/";

/** A Price Paid transaction ID, so it is safe inside a SPARQL IRI. */
const TRANSACTION_ID = /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i;

/** Price Paid's property types, by the end of their URI. */
const PROPERTY_TYPE_URIS: Readonly<Record<string, PropertyType>> = {
  detached: "detached",
  "semi-detached": "semi-detached",
  terraced: "terraced",
  "flat-maisonette": "flat",
  otherPropertyType: "other",
};

/** Price Paid's tenures (its "estate types"), by the end of their URI. */
const TENURE_URIS: Readonly<Record<string, Tenure>> = {
  freehold: "freehold",
  leasehold: "leasehold",
};

/** A postcode as postcodes.io writes it, so it is safe inside a SPARQL string. */
const POSTCODE = /^[A-Z0-9]{2,4} [A-Z0-9]{3}$/;

export class LandRegistryError extends Error {
  override name = "LandRegistryError";
}

/**
 * The `years` years up to and including `today`, an ISO 8601 date:
 * `2026-10-08`, 5 → `2021-10-09` to `2026-10-08`.
 */
export const yearsUpTo = (today: string, years: number): DataPeriod => {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = today
    .split("-")
    .map(Number);
  const from = new Date(Date.UTC(year - years, month - 1, day + 1));
  return { from: from.toISOString().slice(0, 10), to: today };
};

/**
 * The last 12 months up to and including `today`, an ISO 8601 date:
 * `2026-10-08` → `2025-10-09` to `2026-10-08`.
 */
export const lastTwelveMonths = (today: string): DataPeriod =>
  yearsUpTo(today, 1);

/** The day before `date`, an ISO 8601 date: `2025-10-09` → `2025-10-08`. */
const dayBefore = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

/**
 * The 12 months `years` years before `period`, each year ending the day
 * before the next starts, so none overlap: the last 12 months `2025-10-09` to
 * `2026-10-08`, 1 → `2024-10-09` to `2025-10-08`, 5 → `2020-10-09` to
 * `2021-10-08`.
 */
export const twelveMonthsBefore = (
  period: DataPeriod,
  years: number,
): DataPeriod => {
  let earlier = period;
  for (let year = 0; year < years; year++) {
    earlier = lastTwelveMonths(dayBefore(earlier.from));
  }
  return earlier;
};

/**
 * The SPARQL query for every sale in `postcodes` from `from`, an ISO 8601
 * date, onwards, up to and including `to` if it is given, newest first. Each
 * sale is one transaction, with its address.
 */
export const pricePaidQuery = (
  postcodes: readonly string[],
  from: string,
  to?: string,
) => {
  const values = postcodes
    .filter((postcode) => POSTCODE.test(postcode))
    .map((postcode) => `"${postcode}"`)
    .join(" ");
  return `PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?transaction ?postcode ?amount ?date ?propertyType ?estateType ?newBuild ?paon ?saon ?street ?town
WHERE {
  VALUES ?postcode { ${values} }
  ?address lrcommon:postcode ?postcode .
  ?transaction lrppi:propertyAddress ?address ;
    lrppi:pricePaid ?amount ;
    lrppi:transactionDate ?date ;
    lrppi:propertyType ?propertyType ;
    lrppi:estateType ?estateType ;
    lrppi:newBuild ?newBuild .
  FILTER (?date >= "${from}"^^xsd:date)${to === undefined ? "" : `\n  FILTER (?date <= "${to}"^^xsd:date)`}
  OPTIONAL { ?address lrcommon:paon ?paon }
  OPTIONAL { ?address lrcommon:saon ?saon }
  OPTIONAL { ?address lrcommon:street ?street }
  OPTIONAL { ?address lrcommon:town ?town }
}
ORDER BY DESC(?date) ?transaction`;
};

/**
 * The form body of the Price Paid query for the postcodes in a Search Area,
 * from `from` up to `to`, if it is given.
 */
export const pricePaidBody = (
  postcodes: readonly PostcodeInSearchArea[],
  from: string,
  to?: string,
) =>
  new URLSearchParams({
    query: pricePaidQuery(
      postcodes.map(({ postcode }) => postcode),
      from,
      to,
    ),
  }).toString();

/**
 * The SPARQL query for every sale Price Paid records at the address of each
 * sale in `ids`, its transaction IDs (PRD FR-2.12). Price Paid gives every
 * sale at one address the same address, so each sale's history is the sales
 * that share its address, `?sold` saying whose history each row is part of.
 */
export const saleHistoryQuery = (ids: readonly string[]) => {
  const values = ids
    .filter((id) => TRANSACTION_ID.test(id))
    .map((id) => `<${TRANSACTION_URI}${id}/current>`)
    .join(" ");
  return `PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
SELECT ?sold ?transaction ?amount ?date
WHERE {
  VALUES ?sold { ${values} }
  ?sold lrppi:propertyAddress ?address .
  ?transaction lrppi:propertyAddress ?address ;
    lrppi:pricePaid ?amount ;
    lrppi:transactionDate ?date .
}
ORDER BY ?sold DESC(?date) ?transaction`;
};

/**
 * The SPARQL query for every sale of property of type "Other" in
 * `postcodes`, from `from`, an ISO 8601 date, onwards, newest first: the
 * land sales near a Land Opportunity (PRD FR-5.4b). "Other" is anything
 * that isn't a house or a flat, so it may not be land. The postcodes are
 * sorted, so the same postcodes always make the same query.
 */
export const landSalesQuery = (postcodes: readonly string[], from: string) => {
  const values = [...new Set(postcodes)]
    .filter((postcode) => POSTCODE.test(postcode))
    .sort()
    .map((postcode) => `"${postcode}"`)
    .join(" ");
  return `PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?transaction ?postcode ?amount ?date ?paon ?saon ?street ?town
WHERE {
  VALUES ?postcode { ${values} }
  ?address lrcommon:postcode ?postcode .
  ?transaction lrppi:propertyAddress ?address ;
    lrppi:propertyType lrcommon:otherPropertyType ;
    lrppi:pricePaid ?amount ;
    lrppi:transactionDate ?date .
  FILTER (?date >= "${from}"^^xsd:date)
  OPTIONAL { ?address lrcommon:paon ?paon }
  OPTIONAL { ?address lrcommon:saon ?saon }
  OPTIONAL { ?address lrcommon:street ?street }
  OPTIONAL { ?address lrcommon:town ?town }
}
ORDER BY DESC(?date) ?transaction`;
};

/** The form body of the land sales query for `postcodes`, from `from`. */
export const landSalesBody = (postcodes: readonly string[], from: string) =>
  new URLSearchParams({ query: landSalesQuery(postcodes, from) }).toString();

/** The form body of the sale history query for `sales`. */
export const saleHistoryBody = (sales: readonly Pick<Sale, "id">[]) =>
  new URLSearchParams({
    query: saleHistoryQuery(sales.map(({ id }) => id)),
  }).toString();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The value of one variable in a SPARQL JSON result row, or `null` if it is unbound. */
const valueOf = (row: Record<string, unknown>, name: string) => {
  const binding = row[name];
  return isRecord(binding) && typeof binding.value === "string"
    ? binding.value
    : null;
};

/** The last part of a URI: `…/def/common/semi-detached` → `semi-detached`. */
const lastPart = (uri: string | null) => uri?.split("/").pop() ?? "";

/**
 * An address as Price Paid records it: "FLAT 2, 88 HIGH PAVEMENT,
 * SUTTON-IN-ASHFIELD". A building named rather than numbered is kept apart
 * from its street: "HOLDEN HOUSE, CHURCH STREET".
 */
export const addressOf = ({
  saon,
  paon,
  street,
  town,
}: Record<"saon" | "paon" | "street" | "town", string | null>) => {
  const building =
    paon !== null && street !== null
      ? `${paon}${/^\d/.test(paon) ? " " : ", "}${street}`
      : (paon ?? street);
  return [saon, building, town].filter((part) => part !== null).join(", ");
};

/** A transaction's ID, from its URI, or `null` if it has none. */
const transactionId = (uri: string | null) =>
  /\/transaction\/([^/]+)/.exec(uri ?? "")?.[1] ?? null;

/**
 * A sale in the Search Area, before its history and its EPC are known, with
 * the parts of its address Price Paid gives, which matching it to an EPC
 * needs (OQ-8): its house number or name (PAON), flat (SAON) and street,
 * each `""` if Price Paid gives none.
 */
export type Sale = Omit<PropertySaleFeature, "history" | "epc"> & {
  addressParts: Record<"paon" | "saon" | "street", string>;
};

/** One sale from a SPARQL result row, or `null` if it can't be read. */
const toSale = (
  row: unknown,
  postcodes: ReadonlyMap<string, PostcodeInSearchArea>,
): Sale | null => {
  if (!isRecord(row)) return null;
  const id = transactionId(valueOf(row, "transaction"));
  const postcode = postcodes.get(valueOf(row, "postcode") ?? "");
  const price = Number(valueOf(row, "amount"));
  const date = valueOf(row, "date");
  const type = PROPERTY_TYPE_URIS[lastPart(valueOf(row, "propertyType"))];
  const tenure = TENURE_URIS[lastPart(valueOf(row, "estateType"))];
  const newBuild = valueOf(row, "newBuild");
  if (
    !id ||
    postcode === undefined ||
    !Number.isInteger(price) ||
    price < 0 ||
    !isDate(date) ||
    type === undefined ||
    tenure === undefined ||
    (newBuild !== "true" && newBuild !== "false")
  ) {
    return null;
  }
  return {
    id,
    location: postcode.location,
    distanceMetres: postcode.distanceMetres,
    price,
    date,
    type,
    tenure,
    newBuild: newBuild === "true",
    address: addressOf({
      saon: valueOf(row, "saon"),
      paon: valueOf(row, "paon"),
      street: valueOf(row, "street"),
      town: valueOf(row, "town"),
    }),
    postcode: postcode.postcode,
    addressParts: {
      paon: valueOf(row, "paon") ?? "",
      saon: valueOf(row, "saon") ?? "",
      street: valueOf(row, "street") ?? "",
    },
  };
};

/** The rows of a SPARQL JSON answer. Throws if there are none to read. */
const resultRows = (status: number, body: unknown): unknown[] => {
  const rows =
    isRecord(body) && isRecord(body.results) ? body.results.bindings : null;
  if (status !== 200 || !Array.isArray(rows)) {
    throw new LandRegistryError(
      `HM Land Registry answered ${String(status)} without SPARQL results`,
    );
  }
  return rows;
};

/**
 * Maps a raw SPARQL JSON answer to the Price Paid query to sales, each placed
 * at the middle of its postcode, newest first. A sale it can't read, such as
 * one of a property type Price Paid adds later, is left out, and so is a
 * repeat of one already read.
 */
export const mapPricePaid = (
  status: number,
  body: unknown,
  postcodes: readonly PostcodeInSearchArea[],
): Sale[] => {
  const rows = resultRows(status, body);
  const byPostcode = new Map(
    postcodes.map((postcode) => [postcode.postcode, postcode]),
  );
  const sales = new Map<string, Sale>();
  for (const row of rows) {
    const sale = toSale(row, byPostcode);
    if (sale && !sales.has(sale.id)) sales.set(sale.id, sale);
  }
  return [...sales.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
};

/** A sale of property of type "Other" in a postcode, before it is placed near a Land Opportunity. */
export interface PricePaidLandSale {
  /** Price Paid's transaction ID. */
  id: string;
  price: number;
  date: string;
  address: string;
  postcode: string;
}

/**
 * Maps a raw SPARQL JSON answer to the land sales query to its sales, newest
 * first (PRD FR-5.4b). A sale it can't read is left out, and so is a repeat
 * of one already read.
 */
export const mapLandSales = (
  status: number,
  body: unknown,
): PricePaidLandSale[] => {
  const sales = new Map<string, PricePaidLandSale>();
  for (const row of resultRows(status, body)) {
    if (!isRecord(row)) continue;
    const id = transactionId(valueOf(row, "transaction"));
    const postcode = valueOf(row, "postcode");
    const price = Number(valueOf(row, "amount"));
    const date = valueOf(row, "date");
    if (
      !id ||
      !postcode ||
      !Number.isInteger(price) ||
      price < 0 ||
      !isDate(date) ||
      sales.has(id)
    ) {
      continue;
    }
    sales.set(id, {
      id,
      price,
      date,
      address: addressOf({
        saon: valueOf(row, "saon"),
        paon: valueOf(row, "paon"),
        street: valueOf(row, "street"),
        town: valueOf(row, "town"),
      }),
      postcode,
    });
  }
  return [...sales.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
};

/**
 * Each sale's history, newest first, with the change in price from the sale
 * before (PRD FR-2.12). Sales on the same day are in the order of their IDs.
 */
const withChanges = (sales: readonly Omit<AddressSale, "change">[]) =>
  [...sales]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    .map((sale, index, newestFirst): AddressSale => {
      const before = newestFirst[index + 1];
      return {
        ...sale,
        change: before ? percentChange(sale.price, before.price) : null,
      };
    });

/**
 * Maps a raw SPARQL JSON answer to the sale history query to each sale's
 * history, by the ID of the sale whose history it is (PRD FR-2.12), every
 * sale at its address newest first, with the change in price from the sale
 * before. A row it can't read is left out, and so is a repeat.
 */
export const mapSaleHistories = (
  status: number,
  body: unknown,
): Map<string, AddressSale[]> => {
  const histories = new Map<string, Map<string, Omit<AddressSale, "change">>>();
  for (const row of resultRows(status, body)) {
    if (!isRecord(row)) continue;
    const sold = transactionId(valueOf(row, "sold"));
    const id = transactionId(valueOf(row, "transaction"));
    const price = Number(valueOf(row, "amount"));
    const date = valueOf(row, "date");
    if (!sold || !id || !Number.isInteger(price) || price < 0 || !isDate(date))
      continue;
    const sales =
      histories.get(sold) ?? new Map<string, Omit<AddressSale, "change">>();
    if (!sales.has(id)) sales.set(id, { id, price, date });
    histories.set(sold, sales);
  }
  return new Map(
    [...histories].map(([sold, sales]) => [
      sold,
      withChanges([...sales.values()]),
    ]),
  );
};

/**
 * A sale as the Property Layer answers with it, without the parts of its
 * address, with `history` and `epc`.
 */
export const saleFeature = (
  {
    id,
    location,
    distanceMetres,
    price,
    date,
    type,
    tenure,
    newBuild,
    address,
    postcode,
  }: Sale,
  history: AddressSale[] | null,
  epc: PropertySaleFeature["epc"] = null,
): PropertySaleFeature => ({
  id,
  location,
  distanceMetres,
  price,
  date,
  type,
  tenure,
  newBuild,
  address,
  postcode,
  history,
  epc,
});

/**
 * Each sale with its history from `histories`, or with none if Price Paid
 * didn't answer for it. A sale Price Paid gave no history for has a history of
 * itself alone. Its EPC isn't looked for yet.
 */
export const withHistories = (
  sales: readonly Sale[],
  histories: ReadonlyMap<string, AddressSale[]> | null,
): PropertySaleFeature[] =>
  sales.map((sale) =>
    saleFeature(
      sale,
      histories === null
        ? null
        : (histories.get(sale.id) ??
            withChanges([{ id: sale.id, price: sale.price, date: sale.date }])),
    ),
  );

/** How many prices there are, and their median and mean, to the nearest pound. */
export const priceSummary = (prices: readonly number[]): PriceSummary => {
  if (prices.length === 0) return { count: 0, median: null, mean: null };
  const sorted = [...prices].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  const mean =
    sorted.reduce((total, price) => total + price, 0) / sorted.length;
  return {
    count: sorted.length,
    median: Math.round(median),
    mean: Math.round(mean),
  };
};

const pricesOf = (sales: readonly Sale[]) =>
  priceSummary(sales.map(({ price }) => price));

/** The sales in one earlier 12 months, or `null` if Price Paid didn't answer for them. */
export interface EarlierSales {
  period: DataPeriod;
  sales: readonly Sale[] | null;
}

/**
 * The change in median price from `earlier` to `last`, the last 12 months'
 * sales (PRD FR-2.6).
 */
export const medianPriceChange = (
  last: PriceSummary,
  { period, sales }: EarlierSales,
): MedianPriceChange => {
  const prices = sales === null ? null : pricesOf(sales);
  return {
    period,
    prices,
    change:
      last.median === null || prices?.median == null
        ? null
        : percentChange(last.median, prices.median),
  };
};

/**
 * The Property Layer's statistics (PRD FR-2.6): the count, median and mean
 * price of every sale, then by property type, tenure and new build, the
 * change in median price from the 12 months a year and five years before,
 * and which postcodes were searched (FR-2.8).
 */
export const propertyStatistics = (
  sales: readonly Sale[],
  period: DataPeriod,
  { postcodes, truncated }: PostcodesInSearchArea,
  earlier: { twelveMonths: EarlierSales; fiveYears: EarlierSales },
): PropertyStatistics => {
  const all = pricesOf(sales);
  return {
    period,
    all,
    byType: PROPERTY_TYPES.map((type) => ({
      type,
      ...pricesOf(sales.filter((sale) => sale.type === type)),
    })),
    byTenure: TENURES.map((tenure) => ({
      tenure,
      ...pricesOf(sales.filter((sale) => sale.tenure === tenure)),
    })),
    byNewBuild: [true, false].map((newBuild) => ({
      newBuild,
      ...pricesOf(sales.filter((sale) => sale.newBuild === newBuild)),
    })),
    medianChange: {
      twelveMonths: medianPriceChange(all, earlier.twelveMonths),
      fiveYears: medianPriceChange(all, earlier.fiveYears),
    },
    postcodes: {
      searched: postcodes.length,
      limit: POSTCODES_LIMIT,
      truncated,
      reachMetres: postcodes.reduce<number | null>(
        (furthest, { distanceMetres }) =>
          Math.max(furthest ?? 0, distanceMetres),
        null,
      ),
    },
  };
};

/**
 * Asks Price Paid's SPARQL endpoint one query, POSTed as a form, and maps its
 * answer with `map`. Each query is cached on its own for 24 hours, and fails
 * on its own.
 */
const askPricePaid = <T>(
  body: string,
  period: DataPeriod | null,
  callSource: CallSource,
  map: (status: number, results: unknown) => T,
) =>
  callSource(
    landRegistry,
    `${SPARQL_URL} ${body}`,
    async ({ fetch, signal }) => {
      const response = await fetch(SPARQL_URL, {
        method: "POST",
        headers: {
          accept: "application/sparql-results+json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        signal,
      });
      const results: unknown = await response.json().catch(() => null);
      return { data: map(response.status, results), period };
    },
  );

/**
 * The sales in `period` in the postcodes of a Search Area (FR-2.8), from the
 * query `body`. A Search Area with no postcodes has no sales, and asks
 * nothing.
 */
const salesIn = (
  postcodes: PostcodesInSearchArea,
  period: DataPeriod,
  body: string,
  callSource: CallSource,
): Promise<SourceResult<Sale[]>> =>
  postcodes.postcodes.length === 0
    ? Promise.resolve({ status: "ok", data: [], period })
    : askPricePaid(body, period, callSource, (status, results) =>
        mapPricePaid(status, results, postcodes.postcodes),
      );

/**
 * The sales in the last 12 months up to `today` in the postcodes of a Search
 * Area (PRD FR-2.6, FR-2.8), newest first, in one SPARQL query. Price Paid
 * has no sales after today, so it is asked for every sale from the first day.
 */
export const salesInLastTwelveMonths = (
  postcodes: PostcodesInSearchArea,
  callSource: CallSource,
  today: string,
) => {
  const period = lastTwelveMonths(today);
  return salesIn(
    postcodes,
    period,
    pricePaidBody(postcodes.postcodes, period.from),
    callSource,
  );
};

/** The sales in an earlier 12 months in the same postcodes, to compare with. */
const earlierSales = async (
  postcodes: PostcodesInSearchArea,
  period: DataPeriod,
  callSource: CallSource,
): Promise<EarlierSales> => {
  const sales = await salesIn(
    postcodes,
    period,
    pricePaidBody(postcodes.postcodes, period.from, period.to),
    callSource,
  );
  return { period, sales: sales.status === "ok" ? sales.data : null };
};

/**
 * Every sale Price Paid records at the address of each of `sales`, by the ID
 * of the sale whose history it is (PRD FR-2.12), in one SPARQL query. With no
 * sales it asks nothing.
 */
export const saleHistories = (
  sales: readonly Sale[],
  callSource: CallSource,
): Promise<SourceResult<Map<string, AddressSale[]>>> =>
  sales.length === 0
    ? Promise.resolve({ status: "ok", data: new Map(), period: null })
    : askPricePaid(saleHistoryBody(sales), null, callSource, mapSaleHistories);

/** The Property Layer's Features and statistics. */
export interface PropertySales {
  features: PropertySaleFeature[];
  statistics: PropertyStatistics;
  /** The same sales as `features`, with the parts of their addresses. */
  sales: Sale[];
}

/**
 * The sales in the last 12 months up to `today` in the postcodes of a Search
 * Area, with their statistics (PRD FR-2.6, FR-2.8). Once Price Paid has given
 * them, it is asked three more queries together: every sale at their
 * addresses since 1995 (FR-2.12), and the sales in the same postcodes in the
 * 12 months a year before and five years before, for the change in median
 * price. If one of those fails, only its part is missing: the sales have no
 * history, or there is no change from those 12 months.
 */
export const pricePaidSales = async (
  postcodes: PostcodesInSearchArea,
  callSource: CallSource,
  today: string,
): Promise<SourceResult<PropertySales>> => {
  const last = await salesInLastTwelveMonths(postcodes, callSource, today);
  if (last.status !== "ok") return last;

  const period = lastTwelveMonths(today);
  const [histories, twelveMonths, fiveYears] = await Promise.all([
    saleHistories(last.data, callSource),
    earlierSales(postcodes, twelveMonthsBefore(period, 1), callSource),
    earlierSales(postcodes, twelveMonthsBefore(period, 5), callSource),
  ]);
  return {
    status: "ok",
    data: {
      features: withHistories(
        last.data,
        histories.status === "ok" ? histories.data : null,
      ),
      statistics: propertyStatistics(last.data, period, postcodes, {
        twelveMonths,
        fiveYears,
      }),
      sales: last.data,
    },
    period,
  };
};

/**
 * The sales of property of type "Other" in `postcodes` in `period`, newest
 * first, in one SPARQL query (PRD FR-5.4b): the land sales near Land
 * Opportunities, which may not be land. Price Paid has no sales after today,
 * so it is asked for every sale from the first day. With no postcodes it
 * asks nothing.
 */
export const landSalesIn = (
  postcodes: readonly string[],
  period: DataPeriod,
  callSource: CallSource,
): Promise<SourceResult<PricePaidLandSale[]>> =>
  postcodes.length === 0
    ? Promise.resolve({ status: "ok", data: [], period })
    : askPricePaid(
        landSalesBody(postcodes, period.from),
        period,
        callSource,
        mapLandSales,
      );
