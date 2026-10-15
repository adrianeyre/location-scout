import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fixtureFetch,
  landRegistryFixtures,
  neverAnswers,
  noNetwork,
} from "../testing/fetch-stubs";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import {
  NG17_1AA_PROPERTY,
  SUTTON_PARKWAY_LAND_SALES,
} from "../testing/property-recordings";
import { DAY_MS, SOURCE_TIMEOUT_MS, createSourceCaller } from "./data-source";
import ng17FiveYearsBefore from "./fixtures/land-registry-ng17-1aa-five-years-before.json" with { type: "json" };
import ng17History from "./fixtures/land-registry-ng17-1aa-history.json" with { type: "json" };
import ng17YearBefore from "./fixtures/land-registry-ng17-1aa-year-before.json" with { type: "json" };
import ng17Sales from "./fixtures/land-registry-ng17-1aa.json" with { type: "json" };
import ng17Postcodes from "./fixtures/postcodes-io-ng17-1aa-search-area.json" with { type: "json" };
import suttonParkwayLandSales from "./fixtures/land-registry-sutton-parkway-land-sales.json" with { type: "json" };
import {
  LandRegistryError,
  SPARQL_URL,
  addressOf,
  landSalesBody,
  landSalesIn,
  landSalesQuery,
  lastTwelveMonths,
  mapLandSales,
  mapPricePaid,
  mapSaleHistories,
  medianPriceChange,
  priceSummary,
  pricePaidBody,
  pricePaidQuery,
  pricePaidSales,
  propertyStatistics,
  saleHistoryBody,
  saleHistoryQuery,
  salesInLastTwelveMonths,
  twelveMonthsBefore,
  withHistories,
  yearsUpTo,
  type Sale,
} from "./land-registry";
import { mapPostcodesInSearchArea } from "./postcodes-io";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The 100 postcodes postcodes.io gave for NG17 1AA's 0.5 mile Search Area. */
const NG17_POSTCODES = mapPostcodesInSearchArea(
  200,
  ng17Postcodes,
  NG17_1AA_AREA.location,
);

/** The day the fixtures were recorded. */
const TODAY = "2026-10-08";

/** One row of a SPARQL JSON answer, from plain values. */
const row = (values: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      { type: "literal", value },
    ]),
  );

/** A sale at NG17 1BT, as Price Paid's SPARQL endpoint gives it. */
const SALE = {
  transaction:
    "http://landregistry.data.gov.uk/data/ppi/transaction/5A7B802C-F597-1886-E063-4704A8C021AE/current",
  postcode: "NG17 1BT",
  amount: "173000",
  date: "2026-05-29",
  propertyType: "http://landregistry.data.gov.uk/def/common/detached",
  estateType: "http://landregistry.data.gov.uk/def/common/freehold",
  newBuild: "false",
  paon: "88",
  street: "HIGH PAVEMENT",
  town: "SUTTON-IN-ASHFIELD",
};

const answer = (...rows: Record<string, string>[]) => ({
  head: { vars: Object.keys(SALE) },
  results: { bindings: rows.map(row) },
});

describe("lastTwelveMonths", () => {
  it.each([
    ["2026-10-08", "2025-10-09"],
    ["2026-01-01", "2025-01-02"],
    ["2026-12-31", "2026-01-01"],
  ])("ends on %s and starts on %s", (today, from) => {
    expect(lastTwelveMonths(today)).toEqual({ from, to: today });
  });
});

describe("yearsUpTo", () => {
  it.each([
    ["2026-10-08", 5, "2021-10-09"],
    ["2026-10-08", 1, "2025-10-09"],
    // As lastTwelveMonths does, the day after 29 February is 2 March.
    ["2028-02-29", 5, "2023-03-02"],
  ])("ends on %s and %i years back starts on %s", (today, years, from) => {
    expect(yearsUpTo(today, years)).toEqual({ from, to: today });
  });
});

describe("twelveMonthsBefore", () => {
  const last = lastTwelveMonths("2026-10-08");

  it.each([
    [1, "2024-10-09", "2025-10-08"],
    [5, "2020-10-09", "2021-10-08"],
  ])("goes back %i years to %s to %s", (years, from, to) => {
    expect(twelveMonthsBefore(last, years)).toEqual({ from, to });
  });

  it("ends the day before the 12 months after it start, even across a leap day", () => {
    const leap = lastTwelveMonths("2028-02-29");
    const before = twelveMonthsBefore(leap, 1);

    expect(leap).toEqual({ from: "2027-03-02", to: "2028-02-29" });
    expect(before).toEqual({ from: "2026-03-02", to: "2027-03-01" });
  });
});

describe("pricePaidQuery", () => {
  it("asks for the sales in each postcode from the first day, newest first", () => {
    const query = pricePaidQuery(["NG17 1AA", "NG17 1BT"], "2025-10-09");

    expect(query).toContain('VALUES ?postcode { "NG17 1AA" "NG17 1BT" }');
    expect(query).toContain('FILTER (?date >= "2025-10-09"^^xsd:date)');
    expect(query).toContain("ORDER BY DESC(?date) ?transaction");
    expect(query).not.toContain("?date <=");
  });

  it("asks for an earlier 12 months up to and including their last day", () => {
    const query = pricePaidQuery(["NG17 1AA"], "2024-10-09", "2025-10-08");

    expect(query).toContain('FILTER (?date >= "2024-10-09"^^xsd:date)');
    expect(query).toContain('FILTER (?date <= "2025-10-08"^^xsd:date)');
  });

  it("leaves out anything that isn't a postcode, so nothing else reaches the query", () => {
    const query = pricePaidQuery(
      ['NG17 1AA" } ?s ?p ?o { "', "ng17 1bt", "NG17 1BT"],
      "2025-10-09",
    );

    expect(query).toContain('VALUES ?postcode { "NG17 1BT" }');
  });

  it("is sent as a form, with the query as `query`", () => {
    const body = pricePaidBody(NG17_POSTCODES.postcodes, "2025-10-09");

    expect(new URLSearchParams(body).get("query")).toBe(
      pricePaidQuery(
        NG17_POSTCODES.postcodes.map(({ postcode }) => postcode),
        "2025-10-09",
      ),
    );
  });
});

describe("landSalesQuery", () => {
  it("asks for the sales of property of type Other in each postcode from the first day, newest first", () => {
    const query = landSalesQuery(["NG17 1BT", "NG17 1AA"], "2021-10-09");

    expect(query).toContain('VALUES ?postcode { "NG17 1AA" "NG17 1BT" }');
    expect(query).toContain("lrppi:propertyType lrcommon:otherPropertyType");
    expect(query).toContain('FILTER (?date >= "2021-10-09"^^xsd:date)');
    expect(query).toContain("ORDER BY DESC(?date) ?transaction");
  });

  it("asks for each postcode once, in order, so the same postcodes make the same query", () => {
    expect(
      landSalesQuery(["NG17 5LX", "NG17 1AA", "NG17 5LX"], "2021-10-09"),
    ).toBe(landSalesQuery(["NG17 1AA", "NG17 5LX"], "2021-10-09"));
  });

  it("leaves out anything that isn't a postcode, so nothing else reaches the query", () => {
    const query = landSalesQuery(
      ['NG17 1AA" } ?s ?p ?o { "', "ng17 1bt", "NG17 1BT"],
      "2021-10-09",
    );

    expect(query).toContain('VALUES ?postcode { "NG17 1BT" }');
  });

  it("is sent as a form, with the query as `query`", () => {
    expect(
      new URLSearchParams(landSalesBody(["NG17 5LX"], "2021-10-09")).get(
        "query",
      ),
    ).toBe(landSalesQuery(["NG17 5LX"], "2021-10-09"));
  });
});

describe("mapLandSales", () => {
  it("maps the 76 sales recorded within 1 mile of Sutton Parkway's farm field, newest first", () => {
    const sales = mapLandSales(200, suttonParkwayLandSales);

    expect(sales).toHaveLength(76);
    expect(sales[0]).toEqual({
      id: "5A7B802D-835A-1886-E063-4704A8C021AE",
      price: 100000,
      date: "2026-07-14",
      address: "44 HARCOURT STREET, NOTTINGHAM",
      postcode: "NG17 8DD",
    });
    expect(sales.find(({ address }) => address.startsWith("PLOT D"))).toEqual({
      id: expect.any(String) as unknown,
      price: 110000,
      date: "2022-02-11",
      address: "PLOT D, SIDINGS ROAD, NOTTINGHAM",
      postcode: "NG17 7JZ",
    });
    expect(sales.at(-1)?.date).toBe("2021-10-15");
    const dates = sales.map(({ date }) => date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("counts a sale given twice once, and leaves out one it can't read", () => {
    const land = {
      transaction: SALE.transaction,
      postcode: "NG17 7JZ",
      amount: "110000",
      date: "2022-02-11",
      paon: "PLOT D",
      street: "SIDINGS ROAD",
    };

    expect(
      mapLandSales(
        200,
        answer(land, land, { ...land, transaction: "", amount: "free" }),
      ),
    ).toEqual([
      {
        id: "5A7B802C-F597-1886-E063-4704A8C021AE",
        price: 110000,
        date: "2022-02-11",
        address: "PLOT D, SIDINGS ROAD",
        postcode: "NG17 7JZ",
      },
    ]);
  });

  it("throws on an answer without SPARQL results", () => {
    expect(() => mapLandSales(503, { error: "busy" })).toThrow(
      LandRegistryError,
    );
  });
});

describe("landSalesIn", () => {
  const period = yearsUpTo(TODAY, 5);

  it("POSTs one SPARQL query for every postcode, and answers their sales of property of type Other", async () => {
    const fetchMock = landRegistryFixtures(SUTTON_PARKWAY_LAND_SALES.pricePaid);
    const callSource = createSourceCaller({ fetch: fetchMock });

    const result = await landSalesIn(
      SUTTON_PARKWAY_LAND_SALES.postcodes,
      period,
      callSource,
    );

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(SPARQL_URL, {
      method: "POST",
      headers: {
        accept: "application/sparql-results+json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: landSalesBody(SUTTON_PARKWAY_LAND_SALES.postcodes, period.from),
      signal: expect.any(AbortSignal) as unknown,
    });
    expect(result).toMatchObject({
      status: "ok",
      period: { from: "2021-10-09", to: "2026-10-08" },
    });
    expect(result.status === "ok" && result.data).toHaveLength(76);
  });

  it("asks nothing with no postcodes", async () => {
    const fetchMock = noNetwork();

    expect(
      await landSalesIn([], period, createSourceCaller({ fetch: fetchMock })),
    ).toEqual({ status: "ok", data: [], period });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable when Price Paid fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const callSource = createSourceCaller({
      fetch: fixtureFetch({ error: "Service Unavailable" }, { status: 503 }),
    });

    expect(await landSalesIn(["NG17 5LX"], period, callSource)).toEqual({
      status: "unavailable",
    });
  });
});

describe("saleHistoryQuery", () => {
  it("asks for every sale at the address of each sale, by its transaction", () => {
    const query = saleHistoryQuery([
      "5A7B802C-F597-1886-E063-4704A8C021AE",
      "42C129E4-F0CB-60A9-E063-4804A8C0C25D",
    ]);

    expect(query).toContain(
      "VALUES ?sold { <http://landregistry.data.gov.uk/data/ppi/transaction/5A7B802C-F597-1886-E063-4704A8C021AE/current> <http://landregistry.data.gov.uk/data/ppi/transaction/42C129E4-F0CB-60A9-E063-4804A8C0C25D/current> }",
    );
    expect(query).toContain("?sold lrppi:propertyAddress ?address .");
    expect(query).toContain("?transaction lrppi:propertyAddress ?address ;");
  });

  it("leaves out anything that isn't a Price Paid transaction ID, so nothing else reaches the query", () => {
    const query = saleHistoryQuery([
      "5A7B802C-F597-1886-E063-4704A8C021AE> } ?s ?p ?o { <x",
      "42C129E4-F0CB-60A9-E063-4804A8C0C25D",
    ]);

    expect(query).toContain(
      "VALUES ?sold { <http://landregistry.data.gov.uk/data/ppi/transaction/42C129E4-F0CB-60A9-E063-4804A8C0C25D/current> }",
    );
  });

  it("is sent as a form, with the query as `query`", () => {
    const sales = mapPricePaid(200, ng17Sales, NG17_POSTCODES.postcodes);

    expect(new URLSearchParams(saleHistoryBody(sales)).get("query")).toBe(
      saleHistoryQuery(sales.map(({ id }) => id)),
    );
  });
});

describe("addressOf", () => {
  it.each([
    [
      "a numbered house",
      { saon: null, paon: "88", street: "HIGH PAVEMENT" },
      "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
    ],
    [
      "a named house, apart from its street",
      { saon: null, paon: "HOLDEN HOUSE", street: "CHURCH STREET" },
      "HOLDEN HOUSE, CHURCH STREET, SUTTON-IN-ASHFIELD",
    ],
    [
      "a flat in a numbered building",
      { saon: "FLAT 2", paon: "2B", street: "OUTRAM STREET" },
      "FLAT 2, 2B OUTRAM STREET, SUTTON-IN-ASHFIELD",
    ],
    [
      "a building with no street",
      { saon: null, paon: "THE OLD MILL", street: null },
      "THE OLD MILL, SUTTON-IN-ASHFIELD",
    ],
  ])("writes %s as Price Paid records it", (_label, parts, address) => {
    expect(addressOf({ ...parts, town: "SUTTON-IN-ASHFIELD" })).toBe(address);
  });
});

describe("mapPricePaid", () => {
  it("maps NG17 1AA's recorded 24 sales, newest first, each at the middle of its postcode", () => {
    const sales = mapPricePaid(200, ng17Sales, NG17_POSTCODES.postcodes);

    expect(sales).toHaveLength(24);
    expect(sales[0]).toEqual({
      id: "5A7B802C-F597-1886-E063-4704A8C021AE",
      location: { lat: 53.122394, lng: -1.263681 },
      distanceMetres: 144,
      price: 173000,
      date: "2026-05-29",
      type: "detached",
      tenure: "freehold",
      newBuild: false,
      address: "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
      postcode: "NG17 1BT",
      addressParts: { paon: "88", saon: "", street: "HIGH PAVEMENT" },
    });
    expect(sales.at(-1)).toMatchObject({
      date: "2025-10-10",
      address: "3 WINDMILL CLOSE, SUTTON-IN-ASHFIELD",
    });
    const dates = sales.map(({ date }) => date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("places every sale in one postcode at the same point", () => {
    const sales = mapPricePaid(200, ng17Sales, NG17_POSTCODES.postcodes);

    const windmillClose = sales.filter(
      ({ postcode }) => postcode === "NG17 5EQ",
    );
    expect(windmillClose).toHaveLength(3);
    expect(new Set(windmillClose.map(({ location }) => location))).toEqual(
      new Set([windmillClose[0]?.location]),
    );
  });

  it.each([
    ["flat-maisonette", "leasehold", "true", "flat", "leasehold", true],
    ["otherPropertyType", "freehold", "false", "other", "freehold", false],
    ["semi-detached", "freehold", "false", "semi-detached", "freehold", false],
  ])(
    "reads Price Paid's %s, %s, new build %s",
    (propertyType, estateType, newBuild, type, tenure, isNew) => {
      const common = "http://landregistry.data.gov.uk/def/common/";
      const [sale] = mapPricePaid(
        200,
        answer({
          ...SALE,
          propertyType: `${common}${propertyType}`,
          estateType: `${common}${estateType}`,
          newBuild,
        }),
        NG17_POSTCODES.postcodes,
      );

      expect(sale).toMatchObject({ type, tenure, newBuild: isNew });
    },
  );

  it.each([
    ["a property type Price Paid adds later", { propertyType: "…/bungalow" }],
    ["a tenure Price Paid doesn't know", { estateType: "…/unknown" }],
    ["a price that isn't a whole number of pounds", { amount: "173000.50" }],
    ["a date that isn't a day", { date: "2026-05" }],
    ["a postcode that wasn't asked for", { postcode: "NG18 1JJ" }],
    ["no transaction", { transaction: "" }],
  ])("leaves out a sale with %s", (_label, change) => {
    expect(
      mapPricePaid(
        200,
        answer({ ...SALE, ...change }),
        NG17_POSTCODES.postcodes,
      ),
    ).toEqual([]);
  });

  it("counts a sale given twice once", () => {
    expect(
      mapPricePaid(200, answer(SALE, SALE), NG17_POSTCODES.postcodes),
    ).toHaveLength(1);
  });

  it.each([
    ["an error page", 500, null],
    ["a malformed query's answer", 400, { error: "Parse error" }],
    ["an answer with no results", 200, { head: {} }],
  ])("throws for %s", (_label, status, body) => {
    expect(() => mapPricePaid(status, body, NG17_POSTCODES.postcodes)).toThrow(
      LandRegistryError,
    );
  });
});

/** A row of an answer to the sale history query. */
const historyRow = (
  sold: string,
  transaction: string,
  amount: string,
  date: string,
) =>
  row({
    sold: `http://landregistry.data.gov.uk/data/ppi/transaction/${sold}/current`,
    transaction: `http://landregistry.data.gov.uk/data/ppi/transaction/${transaction}/current`,
    amount,
    date,
  });

const historyAnswer = (...rows: Record<string, unknown>[]) => ({
  head: { vars: ["sold", "transaction", "amount", "date"] },
  results: { bindings: rows },
});

describe("mapSaleHistories", () => {
  it("gives every sale at the address of each of NG17 1AA's recorded 24 sales, newest first, with the change from the sale before", () => {
    const histories = mapSaleHistories(200, ng17History);

    expect(histories.size).toBe(24);
    expect(histories.get("5A7B802C-F597-1886-E063-4704A8C021AE")).toEqual([
      {
        id: "5A7B802C-F597-1886-E063-4704A8C021AE",
        price: 173000,
        date: "2026-05-29",
        change: -5.7,
      },
      {
        id: "44F406B6-B93C-1095-E063-4704A8C048D4",
        price: 183500,
        date: "2024-10-06",
        change: null,
      },
    ]);
    // Wayside, Cowpasture Lane, sold four times since 2000.
    expect(
      histories
        .get("49E87C32-4302-591C-E063-4704A8C00C31")
        ?.map(({ price, date, change }) => [price, date, change]),
    ).toEqual([
      [350000, "2026-01-09", 52.2],
      [229950, "2013-10-15", 15],
      [200000, "2009-08-14", 116.7],
      [92300, "2000-11-30", null],
    ]);
  });

  it("gives a sale that is the only one at its address a history of itself", () => {
    // 6 Brook Street, NG17 1AL.
    const [only] = mapPricePaid(
      200,
      ng17Sales,
      NG17_POSTCODES.postcodes,
    ).filter(({ address }) => address.startsWith("6 BROOK STREET"));

    expect(mapSaleHistories(200, ng17History).get(only?.id ?? "")).toEqual([
      { id: only?.id, price: 141000, date: "2026-02-16", change: null },
    ]);
  });

  it("orders sales on the same day by their IDs, and counts a sale given twice once", () => {
    const histories = mapSaleHistories(
      200,
      historyAnswer(
        historyRow("B", "B", "120000", "2026-05-29"),
        historyRow("B", "A", "100000", "2026-05-29"),
        historyRow("B", "B", "120000", "2026-05-29"),
        historyRow("B", "C", "80000", "2020-01-31"),
      ),
    );

    expect(histories.get("B")).toEqual([
      { id: "A", price: 100000, date: "2026-05-29", change: -16.7 },
      { id: "B", price: 120000, date: "2026-05-29", change: 50 },
      { id: "C", price: 80000, date: "2020-01-31", change: null },
    ]);
  });

  it.each([
    ["a price that isn't a whole number of pounds", "1.5", "2020-01-31"],
    ["a date that isn't a day", "100000", "2020-01"],
  ])("leaves out a sale with %s", (_label, amount, date) => {
    const histories = mapSaleHistories(
      200,
      historyAnswer(
        historyRow("A", "A", "120000", "2026-05-29"),
        historyRow("A", "B", amount, date),
      ),
    );

    expect(histories.get("A")).toEqual([
      { id: "A", price: 120000, date: "2026-05-29", change: null },
    ]);
  });

  it.each([
    ["an error page", 500, null],
    ["an answer with no results", 200, { head: {} }],
  ])("throws for %s", (_label, status, body) => {
    expect(() => mapSaleHistories(status, body)).toThrow(LandRegistryError);
  });
});

describe("withHistories", () => {
  const sales = mapPricePaid(200, ng17Sales, NG17_POSTCODES.postcodes);

  it("gives each sale its history", () => {
    const [highPavement] = withHistories(
      sales,
      mapSaleHistories(200, ng17History),
    );

    expect(highPavement?.history?.map(({ price }) => price)).toEqual([
      173000, 183500,
    ]);
  });

  it("gives a sale Price Paid gave no history for a history of itself alone", () => {
    const [highPavement] = withHistories(sales, new Map());

    expect(highPavement?.history).toEqual([
      {
        id: "5A7B802C-F597-1886-E063-4704A8C021AE",
        price: 173000,
        date: "2026-05-29",
        change: null,
      },
    ]);
  });

  it("gives each sale as the Property Layer answers with it: without the parts of its address, and with its EPC not yet looked for", () => {
    const [highPavement] = withHistories(sales, new Map());

    expect(highPavement).not.toHaveProperty("addressParts");
    expect(highPavement?.epc).toBeNull();
  });

  it("gives every sale no history if Price Paid didn't answer for them", () => {
    expect(
      withHistories(sales, null).every(({ history }) => history === null),
    ).toBe(true);
  });
});

describe("priceSummary", () => {
  it("gives the median of an odd number of prices, and the mean", () => {
    expect(priceSummary([150000, 100000, 290000])).toEqual({
      count: 3,
      median: 150000,
      mean: 180000,
    });
  });

  it("gives the median of an even number as the mean of the middle two, to the pound", () => {
    expect(priceSummary([100001, 150000, 200000, 90000])).toEqual({
      count: 4,
      median: 125001,
      mean: 135000,
    });
  });

  it("gives no median or mean when there are no sales", () => {
    expect(priceSummary([])).toEqual({ count: 0, median: null, mean: null });
  });
});

describe("medianPriceChange", () => {
  const period = { from: "2024-10-09", to: "2025-10-08" };
  const last = priceSummary([182000]);
  const sales = (...prices: number[]) =>
    prices.map((price) => ({ price }) as Sale);

  it("gives the change in median price from the earlier 12 months", () => {
    expect(
      medianPriceChange(last, { period, sales: sales(150000, 170000) }),
    ).toEqual({
      period,
      prices: { count: 2, median: 160000, mean: 160000 },
      change: 13.8,
    });
  });

  it("gives no change if Price Paid didn't answer for the earlier 12 months", () => {
    expect(medianPriceChange(last, { period, sales: null })).toEqual({
      period,
      prices: null,
      change: null,
    });
  });

  it("gives no change if there were no sales then, or none in the last 12 months", () => {
    expect(medianPriceChange(last, { period, sales: [] }).change).toBeNull();
    expect(
      medianPriceChange(priceSummary([]), { period, sales: sales(150000) })
        .change,
    ).toBeNull();
  });
});

describe("propertyStatistics", () => {
  const period = lastTwelveMonths(TODAY);
  const searched = NG17_POSTCODES.postcodes;
  const earlier = {
    twelveMonths: {
      period: twelveMonthsBefore(period, 1),
      sales: mapPricePaid(200, ng17YearBefore, searched),
    },
    fiveYears: {
      period: twelveMonthsBefore(period, 5),
      sales: mapPricePaid(200, ng17FiveYearsBefore, searched),
    },
  };

  it("gives NG17 1AA's recorded sales' count, median and mean by type, tenure and new build", () => {
    const sales = mapPricePaid(200, ng17Sales, NG17_POSTCODES.postcodes);

    expect(propertyStatistics(sales, period, NG17_POSTCODES, earlier)).toEqual({
      period: { from: "2025-10-09", to: "2026-10-08" },
      all: { count: 24, median: 182000, mean: 187000 },
      byType: [
        { type: "detached", count: 8, median: 242500, mean: 241813 },
        { type: "semi-detached", count: 6, median: 172000, mean: 162333 },
        { type: "terraced", count: 6, median: 146000, mean: 155750 },
        { type: "flat", count: 0, median: null, mean: null },
        { type: "other", count: 4, median: 160500, mean: 161250 },
      ],
      byTenure: [
        { tenure: "freehold", count: 24, median: 182000, mean: 187000 },
        { tenure: "leasehold", count: 0, median: null, mean: null },
      ],
      byNewBuild: [
        { newBuild: true, count: 0, median: null, mean: null },
        { newBuild: false, count: 24, median: 182000, mean: 187000 },
      ],
      medianChange: {
        twelveMonths: {
          period: { from: "2024-10-09", to: "2025-10-08" },
          prices: { count: 54, median: 160000, mean: 193535 },
          change: 13.8,
        },
        fiveYears: {
          period: { from: "2020-10-09", to: "2021-10-08" },
          prices: { count: 39, median: 150000, mean: 156679 },
          change: 21.3,
        },
      },
      postcodes: {
        searched: 100,
        limit: 100,
        truncated: true,
        reachMetres: 430,
      },
    });
  });

  it("splits new builds from the rest, and leasehold from freehold", () => {
    const sale = (price: number, changes: Partial<Sale>): Sale => ({
      id: String(price),
      location: NG17_1AA_AREA.location,
      distanceMetres: 0,
      price,
      date: "2026-05-29",
      type: "flat",
      tenure: "leasehold",
      newBuild: true,
      address: "FLAT 1, 2 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
      postcode: "NG17 1BT",
      addressParts: { paon: "2", saon: "FLAT 1", street: "HIGH PAVEMENT" },
      ...changes,
    });
    const sales = [
      sale(120000, {}),
      sale(130000, {}),
      sale(250000, { type: "detached", tenure: "freehold", newBuild: false }),
    ];

    const statistics = propertyStatistics(
      sales,
      period,
      { postcodes: [], truncated: false },
      earlier,
    );

    expect(statistics.byTenure).toEqual([
      { tenure: "freehold", count: 1, median: 250000, mean: 250000 },
      { tenure: "leasehold", count: 2, median: 125000, mean: 125000 },
    ]);
    expect(statistics.byNewBuild).toEqual([
      { newBuild: true, count: 2, median: 125000, mean: 125000 },
      { newBuild: false, count: 1, median: 250000, mean: 250000 },
    ]);
    expect(statistics.postcodes).toEqual({
      searched: 0,
      limit: 100,
      truncated: false,
      reachMetres: null,
    });
  });
});

describe("salesInLastTwelveMonths", () => {
  it("POSTs one SPARQL query for every postcode in the Search Area, and answers its sales for the last 12 months", async () => {
    const body = pricePaidBody(
      NG17_POSTCODES.postcodes,
      lastTwelveMonths(TODAY).from,
    );
    const fetchMock = landRegistryFixtures(NG17_1AA_PROPERTY.pricePaid);
    const callSource = createSourceCaller({ fetch: fetchMock });

    const result = await salesInLastTwelveMonths(
      NG17_POSTCODES,
      callSource,
      TODAY,
    );

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(SPARQL_URL, {
      method: "POST",
      headers: {
        accept: "application/sparql-results+json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: expect.any(AbortSignal) as unknown,
    });
    expect(result).toMatchObject({
      status: "ok",
      period: { from: "2025-10-09", to: "2026-10-08" },
    });
    expect(result.status === "ok" && result.data).toHaveLength(24);
  });
});

describe("pricePaidSales", () => {
  const period = lastTwelveMonths(TODAY);
  const sales = mapPricePaid(200, ng17Sales, NG17_POSTCODES.postcodes);
  const bodies = {
    sales: pricePaidBody(NG17_POSTCODES.postcodes, period.from),
    history: saleHistoryBody(sales),
    yearBefore: pricePaidBody(
      NG17_POSTCODES.postcodes,
      "2024-10-09",
      "2025-10-08",
    ),
    fiveYearsBefore: pricePaidBody(
      NG17_POSTCODES.postcodes,
      "2020-10-09",
      "2021-10-08",
    ),
  };
  /** NG17 1AA's recordings, less those for the queries named. */
  const recordedWithout = (...left: (keyof typeof bodies)[]) =>
    new Map(
      [...NG17_1AA_PROPERTY.pricePaid].filter(
        ([body]) => !left.some((name) => bodies[name] === body),
      ),
    );
  const bodiesSent = (fetchMock: ReturnType<typeof landRegistryFixtures>) =>
    fetchMock.mock.calls.map(([, init]) => init?.body);

  it("asks for the last 12 months' sales, then for every sale at their addresses and the sales a year and five years before", async () => {
    const fetchMock = landRegistryFixtures(NG17_1AA_PROPERTY.pricePaid);
    const callSource = createSourceCaller({ fetch: fetchMock });

    const result = await pricePaidSales(NG17_POSTCODES, callSource, TODAY);

    const sent = bodiesSent(fetchMock);
    expect(sent[0]).toBe(bodies.sales);
    expect(new Set(sent.slice(1))).toEqual(
      new Set([bodies.history, bodies.yearBefore, bodies.fiveYearsBefore]),
    );
    expect(result).toMatchObject({
      status: "ok",
      period: { from: "2025-10-09", to: "2026-10-08" },
      data: {
        statistics: {
          all: { count: 24, median: 182000 },
          medianChange: {
            twelveMonths: { prices: { median: 160000 }, change: 13.8 },
            fiveYears: { prices: { median: 150000 }, change: 21.3 },
          },
        },
      },
    });
    if (result.status !== "ok") return;
    expect(result.data.features).toHaveLength(24);
    expect(result.data.features[0]).toMatchObject({
      address: "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
      history: [
        { price: 173000, date: "2026-05-29", change: -5.7 },
        { price: 183500, date: "2024-10-06", change: null },
      ],
    });
  });

  it("is unavailable when Price Paid fails for the last 12 months, and asks nothing more", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = landRegistryFixtures(recordedWithout("sales"));
    const callSource = createSourceCaller({ fetch: fetchMock });

    expect(await pricePaidSales(NG17_POSTCODES, callSource, TODAY)).toEqual({
      status: "unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still gives the sales when Price Paid fails for their histories, with no history", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const callSource = createSourceCaller({
      fetch: landRegistryFixtures(recordedWithout("history")),
    });

    const result = await pricePaidSales(NG17_POSTCODES, callSource, TODAY);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.features).toHaveLength(24);
    expect(result.data.features.every(({ history }) => history === null)).toBe(
      true,
    );
    expect(result.data.statistics.medianChange.twelveMonths.change).toBe(13.8);
  });

  it("still gives the sales when Price Paid fails for five years before, with no change from then", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const callSource = createSourceCaller({
      fetch: landRegistryFixtures(recordedWithout("fiveYearsBefore")),
    });

    const result = await pricePaidSales(NG17_POSTCODES, callSource, TODAY);

    expect(result).toMatchObject({
      status: "ok",
      data: {
        statistics: {
          medianChange: {
            twelveMonths: { change: 13.8 },
            fiveYears: {
              period: { from: "2020-10-09", to: "2021-10-08" },
              prices: null,
              change: null,
            },
          },
        },
      },
    });
  });

  it("asks nothing for a Search Area with no postcodes", async () => {
    const fetchMock = noNetwork();
    const callSource = createSourceCaller({ fetch: fetchMock });

    const result = await pricePaidSales(
      { postcodes: [], truncated: false },
      callSource,
      TODAY,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "ok",
      data: {
        features: [],
        statistics: {
          all: { count: 0 },
          medianChange: {
            twelveMonths: { prices: { count: 0 }, change: null },
            fiveYears: { prices: { count: 0 }, change: null },
          },
        },
      },
    });
  });

  it("caches each answer for 24 hours", async () => {
    vi.useFakeTimers();
    const fetchMock = landRegistryFixtures(NG17_1AA_PROPERTY.pricePaid);
    const callSource = createSourceCaller({ fetch: fetchMock });

    await pricePaidSales(NG17_POSTCODES, callSource, TODAY);
    vi.advanceTimersByTime(DAY_MS - 1);
    await pricePaidSales(NG17_POSTCODES, callSource, TODAY);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    vi.advanceTimersByTime(1);
    await pricePaidSales(NG17_POSTCODES, callSource, TODAY);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("is unavailable when Price Paid fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const callSource = createSourceCaller({
      fetch: fixtureFetch({ error: "Service Unavailable" }, { status: 503 }),
    });

    expect(await pricePaidSales(NG17_POSTCODES, callSource, TODAY)).toEqual({
      status: "unavailable",
    });
  });

  it("is unavailable when Price Paid takes more than 8 seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const callSource = createSourceCaller({ fetch: neverAnswers() });

    const pending = pricePaidSales(NG17_POSTCODES, callSource, TODAY);
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS);

    expect(await pending).toEqual({ status: "unavailable" });
  });
});
