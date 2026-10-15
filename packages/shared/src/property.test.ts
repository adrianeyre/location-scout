import { describe, expect, it } from "vitest";

import {
  EPC_BANDS,
  PROPERTY_TYPES,
  TENURES,
  isAddressSale,
  isDate,
  isEpcBand,
  isEpcStatistics,
  isPropertyEpc,
  isSaleEpcMatch,
  isPriceSummary,
  isPropertyLayerResponse,
  isPropertySaleFeature,
  isPropertyStatistics,
  isPropertyType,
  isTenure,
} from "./property";
import { isLayerResponse } from "./layer";

const detached = {
  id: "5A7B802C-F597-1886-E063-4704A8C021AE",
  location: { lat: 53.124479, lng: -1.264985 },
  distanceMetres: 111,
  price: 173000,
  date: "2026-05-29",
  type: "detached",
  tenure: "freehold",
  newBuild: false,
  address: "88 HIGH PAVEMENT, SUTTON-IN-ASHFIELD",
  postcode: "NG17 1BT",
  history: [
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
  ],
  epc: {
    status: "matched",
    certificate: {
      certificateNumber: "9901-0000-0000-0000-0001",
      registrationDate: "2019-03-14",
      currentBand: "D",
      details: {
        potentialBand: "B",
        floorAreaSquareMetres: 92,
        pricePerSquareMetre: 1880,
      },
    },
  },
};

const newFlat = {
  ...detached,
  id: "5340B1C5-AC36-8052-E063-4804A8C06EE4",
  price: 120000,
  date: "2026-04-30",
  type: "flat",
  tenure: "leasehold",
  newBuild: true,
  address: "FLAT 2, HOLDEN HOUSE, CHURCH STREET, SUTTON-IN-ASHFIELD",
  history: null,
  epc: { status: "unmatched" },
};

/** A shop, which EPCs aren't looked for. */
const shop = { ...detached, type: "other", epc: null };

const epcStatistics = {
  byBand: EPC_BANDS.map((band) => ({ band, count: band === "D" ? 2 : 0 })),
  homes: 2,
  postcodes: { searched: 2, unanswered: 0 },
  sales: { lookedFor: 2, matched: 1 },
  pricePerSquareMetre: { count: 1, median: 1880, mean: 1880 },
};

const summary = (count: number, median: number | null) => ({
  count,
  median,
  mean: median,
});

const statistics = {
  period: { from: "2025-10-09", to: "2026-10-08" },
  all: { count: 2, median: 146500, mean: 146500 },
  byType: PROPERTY_TYPES.map((type) => ({
    type,
    ...(type === "detached"
      ? summary(1, 173000)
      : type === "flat"
        ? summary(1, 120000)
        : summary(0, null)),
  })),
  byTenure: TENURES.map((tenure) => ({
    tenure,
    ...summary(1, tenure === "freehold" ? 173000 : 120000),
  })),
  byNewBuild: [
    { newBuild: true, ...summary(1, 120000) },
    { newBuild: false, ...summary(1, 173000) },
  ],
  medianChange: {
    twelveMonths: {
      period: { from: "2024-10-09", to: "2025-10-08" },
      prices: summary(3, 136750),
      change: 7.1,
    },
    fiveYears: {
      period: { from: "2020-10-09", to: "2021-10-08" },
      prices: null,
      change: null,
    },
  },
  postcodes: { searched: 100, limit: 100, truncated: true, reachMetres: 430 },
};

const layer = {
  layer: "property",
  status: "ok",
  sources: [
    {
      id: "postcodes-io",
      name: "postcodes.io",
      status: "ok",
      period: null,
    },
    {
      id: "land-registry",
      name: "HM Land Registry Price Paid",
      status: "ok",
      period: { from: "2025-10-09", to: "2026-10-08" },
    },
  ],
  features: [detached, newFlat, shop],
  statistics,
  epc: { status: "ok", statistics: epcStatistics },
};

describe("PROPERTY_TYPES and TENURES", () => {
  it("are Price Paid's property types and tenures", () => {
    expect(PROPERTY_TYPES).toEqual([
      "detached",
      "semi-detached",
      "terraced",
      "flat",
      "other",
    ]);
    expect(TENURES).toEqual(["freehold", "leasehold"]);
    for (const type of PROPERTY_TYPES) expect(isPropertyType(type)).toBe(true);
    for (const tenure of TENURES) expect(isTenure(tenure)).toBe(true);
  });

  it("leave out Price Paid's own names for them", () => {
    expect(isPropertyType("flat-maisonette")).toBe(false);
    expect(isTenure("F")).toBe(false);
  });
});

describe("EPC_BANDS", () => {
  it("are A, the most efficient, to G", () => {
    expect(EPC_BANDS.join("")).toBe("ABCDEFG");
    expect(isEpcBand("C")).toBe(true);
    expect(isEpcBand("c")).toBe(false);
    expect(isEpcBand("A+")).toBe(false);
  });
});

describe("isSaleEpcMatch", () => {
  it("accepts a matched certificate, with or without its details, and a sale unmatched or whose postcode the EPC API didn't answer for", () => {
    expect(isSaleEpcMatch(detached.epc)).toBe(true);
    expect(
      isSaleEpcMatch({
        status: "matched",
        certificate: { ...detached.epc.certificate, details: null },
      }),
    ).toBe(true);
    expect(isSaleEpcMatch({ status: "unmatched" })).toBe(true);
    expect(isSaleEpcMatch({ status: "unavailable" })).toBe(true);
  });

  it.each([
    ["a match without its certificate", { status: "matched" }],
    [
      "a band the register doesn't have",
      {
        status: "matched",
        certificate: { ...detached.epc.certificate, currentBand: "H" },
      },
    ],
    [
      "a floor area of 0",
      {
        status: "matched",
        certificate: {
          ...detached.epc.certificate,
          details: {
            ...detached.epc.certificate.details,
            floorAreaSquareMetres: 0,
          },
        },
      },
    ],
    [
      "a price per m² in pence",
      {
        status: "matched",
        certificate: {
          ...detached.epc.certificate,
          details: {
            ...detached.epc.certificate.details,
            pricePerSquareMetre: 1880.4,
          },
        },
      },
    ],
    ["an unknown status", { status: "ambiguous" }],
  ])("rejects %s", (_label, value) => {
    expect(isSaleEpcMatch(value)).toBe(false);
  });
});

describe("isEpcStatistics and isPropertyEpc", () => {
  it("accept the homes by band and the sales' price per m², and the EPC API unavailable", () => {
    expect(isEpcStatistics(epcStatistics)).toBe(true);
    expect(isPropertyEpc({ status: "ok", statistics: epcStatistics })).toBe(
      true,
    );
    expect(isPropertyEpc({ status: "unavailable", statistics: null })).toBe(
      true,
    );
  });

  it.each([
    [
      "a band the register doesn't have",
      { ...epcStatistics, byBand: [{ band: "H", count: 1 }] },
    ],
    ["no count of homes", { ...epcStatistics, homes: undefined }],
    [
      "no count of postcodes unanswered",
      { ...epcStatistics, postcodes: { searched: 2 } },
    ],
    ["no price per m²", { ...epcStatistics, pricePerSquareMetre: null }],
  ])("isEpcStatistics rejects %s", (_label, value) => {
    expect(isEpcStatistics(value)).toBe(false);
  });

  it("isPropertyEpc rejects a status of its own", () => {
    expect(isPropertyEpc({ status: "not-prepared", statistics: null })).toBe(
      false,
    );
  });
});

describe("isDate", () => {
  it.each(["2026-05-29", "2024-02-29"])("accepts %s", (date) => {
    expect(isDate(date)).toBe(true);
  });

  it.each(["2026-05", "29/05/2026", "2026-13-01", "2026-05-29T00:00:00"])(
    "rejects %s",
    (date) => {
      expect(isDate(date)).toBe(false);
    },
  );
});

describe("isAddressSale", () => {
  it("accepts a sale with the change from the one before, and the first with none", () => {
    for (const sale of detached.history) expect(isAddressSale(sale)).toBe(true);
  });

  it.each([
    ["a price in pence", { price: 183500.5 }],
    ["a month for a date", { date: "2024-10" }],
    ["a change as text", { change: "-5.7%" }],
    ["no change at all", { change: undefined }],
  ])("rejects %s", (_label, change) => {
    expect(isAddressSale({ ...detached.history[0], ...change })).toBe(false);
  });
});

describe("isPropertySaleFeature", () => {
  it("accepts a sale of an established house with its history, and of a new flat whose history Price Paid didn't give", () => {
    expect(isPropertySaleFeature(detached)).toBe(true);
    expect(isPropertySaleFeature(newFlat)).toBe(true);
  });

  it.each([
    ["a price in pence", { ...detached, price: 173000.5 }],
    ["a price as text", { ...detached, price: "173000" }],
    ["a date with a time", { ...detached, date: "2026-05-29T00:00:00" }],
    ["Price Paid's own property type", { ...detached, type: "detached-house" }],
    ["an unknown tenure", { ...detached, tenure: "unknown" }],
    ["new build as text", { ...detached, newBuild: "N" }],
    ["no address", { ...detached, address: null }],
    ["no postcode", { ...detached, postcode: undefined }],
    ["no distance", { ...detached, distanceMetres: undefined }],
    ["no history", { ...detached, history: undefined }],
    ["no word on its EPC", { ...detached, epc: undefined }],
    ["an EPC that isn't one", { ...detached, epc: { status: "matched" } }],
    [
      "a history with a sale that isn't one",
      { ...detached, history: [{ price: 183500 }] },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isPropertySaleFeature(value)).toBe(false);
  });
});

describe("isPriceSummary", () => {
  it("accepts sales with their median and mean, and none with neither", () => {
    expect(isPriceSummary(summary(3, 150000))).toBe(true);
    expect(isPriceSummary(summary(0, null))).toBe(true);
  });

  it.each([
    ["a count below zero", { count: -1, median: null, mean: null }],
    ["a median in pence", { count: 2, median: 150000.5, mean: 150000 }],
    ["no mean", { count: 2, median: 150000 }],
  ])("rejects %s", (_label, value) => {
    expect(isPriceSummary(value)).toBe(false);
  });
});

describe("isPropertyStatistics", () => {
  it("accepts prices by type, tenure and new build, the change in median price, and the postcodes searched", () => {
    expect(isPropertyStatistics(statistics)).toBe(true);
  });

  it("accepts a Search Area with no postcodes", () => {
    expect(
      isPropertyStatistics({
        ...statistics,
        postcodes: {
          searched: 0,
          limit: 100,
          truncated: false,
          reachMetres: null,
        },
      }),
    ).toBe(true);
  });

  it.each([
    [
      "a period of months",
      { ...statistics, period: { from: "2025-10", to: "2026-10" } },
    ],
    ["no summary of every sale", { ...statistics, all: undefined }],
    [
      "prices of an unknown type",
      { ...statistics, byType: [{ type: "bungalow", ...summary(0, null) }] },
    ],
    [
      "prices of an unknown tenure",
      { ...statistics, byTenure: [{ tenure: "U", ...summary(0, null) }] },
    ],
    [
      "new builds not said to be new or not",
      { ...statistics, byNewBuild: [summary(1, 120000)] },
    ],
    ["no change in median price", { ...statistics, medianChange: undefined }],
    [
      "no five-year change in median price",
      {
        ...statistics,
        medianChange: { twelveMonths: statistics.medianChange.twelveMonths },
      },
    ],
    [
      "a change in median price as text",
      {
        ...statistics,
        medianChange: {
          ...statistics.medianChange,
          twelveMonths: {
            ...statistics.medianChange.twelveMonths,
            change: "+7.1%",
          },
        },
      },
    ],
    [
      "a change in median price over a period of months",
      {
        ...statistics,
        medianChange: {
          ...statistics.medianChange,
          fiveYears: {
            ...statistics.medianChange.fiveYears,
            period: { from: "2020-10", to: "2021-10" },
          },
        },
      },
    ],
    [
      "no word on whether the postcodes were cut short",
      {
        ...statistics,
        postcodes: { searched: 100, limit: 100, reachMetres: 430 },
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isPropertyStatistics(value)).toBe(false);
  });
});

describe("isPropertyLayerResponse", () => {
  it("accepts sales with their statistics", () => {
    expect(isPropertyLayerResponse(layer)).toBe(true);
    expect(isLayerResponse(layer)).toBe(true);
  });

  it("accepts sales whose EPCs aren't looked for, without EPC_API_KEY", () => {
    expect(
      isPropertyLayerResponse({
        ...layer,
        features: [{ ...detached, epc: null }],
        epc: null,
      }),
    ).toBe(true);
  });

  it("accepts an unavailable Layer with no Features or statistics", () => {
    expect(
      isPropertyLayerResponse({
        ...layer,
        status: "unavailable",
        features: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["another Layer", { ...layer, layer: "planning" }],
    ["a Feature of another Layer", { ...layer, features: [{ id: "1" }] }],
    ["statistics with no prices", { ...layer, statistics: { all: null } }],
    ["no word on EPCs", { ...layer, epc: undefined }],
    ["EPCs without a status", { ...layer, epc: { statistics: null } }],
  ])("rejects %s", (_label, value) => {
    expect(isPropertyLayerResponse(value)).toBe(false);
  });
});
