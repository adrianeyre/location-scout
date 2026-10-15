import { afterEach, describe, expect, it, vi } from "vitest";

import { EPC_RULES } from "@location-scout/shared";

import { NG17_1AA_EPC, TEST_EPC_API_KEY } from "../testing/epc-recordings";
import {
  epcFixtures,
  landRegistryFixtures,
  stubFetch,
} from "../testing/fetch-stubs";
import { NG17_1AA_PROPERTY } from "../testing/property-recordings";
import { NG17_1AA_AREA } from "../testing/police-ng17-1aa";
import { createSourceCaller } from "./data-source";
import {
  EPC_API_URL,
  EPC_CONCURRENCY,
  EPC_RETRY_AFTER_MS,
  atMost,
  certificateUrl,
  certificatesIn,
  createEpcRegister,
  domesticSearchUrl,
  epcRegister,
  mapCertificate,
  mapDomesticSearch,
  matchSales,
  pricePerSquareMetre,
  withEpcs,
  type CertificatesByPostcode,
  type SearchedCertificate,
} from "./epc";
import ng17Epcs from "./fixtures/epc-ng17-1aa.json" with { type: "json" };
import ng17Sales from "./fixtures/land-registry-ng17-1aa.json" with { type: "json" };
import ng17Postcodes from "./fixtures/postcodes-io-ng17-1aa-search-area.json" with { type: "json" };
import {
  mapPricePaid,
  pricePaidSales,
  saleFeature,
  type Sale,
} from "./land-registry";
import { mapPostcodesInSearchArea } from "./postcodes-io";

const TODAY = "2026-10-08";
const NG17_POSTCODES = mapPostcodesInSearchArea(
  200,
  ng17Postcodes,
  NG17_1AA_AREA.location,
);
const SALES = mapPricePaid(200, ng17Sales, NG17_POSTCODES.postcodes);

/** The EPC API answering the made-up certificates for NG17 1AA, and Price Paid its recordings. */
const recorded = () =>
  landRegistryFixtures(
    NG17_1AA_PROPERTY.pricePaid,
    epcFixtures(NG17_1AA_EPC, TEST_EPC_API_KEY),
  );

/** One certificate, as the search gives it. */
const searched = (
  certificateNumber: string,
  addressLines: (string | null)[],
  registrationDate = "2020-01-01",
): SearchedCertificate => ({
  certificateNumber,
  uprn: null,
  addressLines,
  registrationDate,
  currentBand: "C",
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the EPC API's URLs", () => {
  it("search a postcode for every domestic certificate, in one page, and ask for a certificate by its number", () => {
    expect(domesticSearchUrl("NG17 1BT")).toBe(
      `${EPC_API_URL}/api/domestic/search?postcode=NG17+1BT&page_size=5000`,
    );
    expect(certificateUrl("9901-0000-0000-0000-0005")).toBe(
      `${EPC_API_URL}/api/certificate?certificate_number=9901-0000-0000-0000-0005`,
    );
  });
});

describe("mapDomesticSearch", () => {
  it("reads each certificate's number, UPRN, address lines, date and band", () => {
    const [first] = mapDomesticSearch(ng17Epcs.searches["NG17 1BT"]);

    expect(first).toEqual({
      certificateNumber: "9901-0000-0000-0000-0005",
      uprn: "999000000101",
      addressLines: ["88 High Pavement", null, null, null],
      registrationDate: "2019-03-14",
      currentBand: "D",
    });
  });

  it("reads the OpenAPI file's own example answer", () => {
    expect(
      mapDomesticSearch({
        data: [
          {
            certificateNumber: "0000-0000-0000-0000-0000",
            addressLine1: "1 Some Street",
            addressLine2: null,
            addressLine3: null,
            addressLine4: null,
            postTown: "Whitbury",
            postcode: "SW10 0AA",
            uprn: 100121241798,
            council: "Hammersmith and Fulham",
            constituency: "Chelsea and Fulham",
            currentEnergyEfficiencyBand: "B",
            registrationDate: "2020-05-04",
            schemaType: "RdSAP-Schema-20.0.0",
          },
        ],
        pagination: { totalRecords: 1, currentPage: 1, totalPages: 1 },
      }),
    ).toEqual([
      {
        certificateNumber: "0000-0000-0000-0000-0000",
        uprn: "100121241798",
        addressLines: ["1 Some Street", null, null, null],
        registrationDate: "2020-05-04",
        currentBand: "B",
      },
    ]);
  });

  it("reads a band it doesn't know, a UPRN of 0 and a date with a time defensively", () => {
    expect(
      mapDomesticSearch({
        data: [
          {
            certificateNumber: "1",
            uprn: 0,
            currentEnergyEfficiencyBand: "INVALID!",
            registrationDate: "2020-05-04T10:00:00Z",
          },
          { certificateNumber: "2", currentEnergyEfficiencyBand: "c" },
          { registrationDate: "2020-05-04" },
          "not a certificate",
        ],
      }),
    ).toEqual([
      {
        certificateNumber: "1",
        uprn: null,
        addressLines: [null, null, null, null],
        registrationDate: "2020-05-04",
        currentBand: null,
      },
    ]);
  });

  it("finds none in a 404, and throws for an answer without data", () => {
    expect(mapDomesticSearch(null)).toEqual([]);
    expect(() => mapDomesticSearch({ error: "oops" })).toThrow("gave no data");
  });
});

describe("mapCertificate", () => {
  it("reads a certificate's potential band and floor area", () => {
    expect(
      mapCertificate(ng17Epcs.certificates["9901-0000-0000-0000-0005"]),
    ).toEqual({ potentialBand: "B", floorAreaSquareMetres: 92 });
  });

  it("leaves out a floor area that isn't a positive number", () => {
    for (const area of [0, -1, "NO DATA!", null, undefined]) {
      expect(
        mapCertificate({ data: { total_floor_area: area } })
          .floorAreaSquareMetres,
      ).toBeNull();
    }
    expect(
      mapCertificate({ data: { total_floor_area: "84.5" } })
        .floorAreaSquareMetres,
    ).toBe(84.5);
  });

  it("throws for an answer without a certificate", () => {
    expect(() => mapCertificate({})).toThrow("gave no certificate");
  });
});

describe("pricePerSquareMetre", () => {
  it("is the price over the floor area, to the pound", () => {
    expect(pricePerSquareMetre(173000, 92)).toBe(1880);
  });

  it(`gives none for no floor area, or one under ${String(EPC_RULES.minFloorAreaSquareMetres)} m² or over ${String(EPC_RULES.maxFloorAreaSquareMetres)} m²`, () => {
    expect(pricePerSquareMetre(173000, null)).toBeNull();
    expect(pricePerSquareMetre(173000, 0.01)).toBeNull();
    expect(pricePerSquareMetre(173000, 9.9)).toBeNull();
    expect(pricePerSquareMetre(173000, 1000.5)).toBeNull();
    expect(pricePerSquareMetre(173000, 10)).toBe(17300);
    expect(pricePerSquareMetre(1730000, 1000)).toBe(1730);
  });
});

describe("atMost", () => {
  it("loads every item, at most `limit` at once, answering in their order", async () => {
    let running = 0;
    let most = 0;
    const loaded = await atMost([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 8 - item));
      running--;
      return item * 10;
    });

    expect(loaded).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(most).toBe(3);
  });

  it("loads nothing for no items", async () => {
    expect(await atMost([], 3, () => Promise.resolve(1))).toEqual([]);
  });
});

describe("createEpcRegister", () => {
  it("asks with the bearer token, and reads a 404 as none", async () => {
    const fetchMock = stubFetch(() =>
      Response.json({ error: "No data found" }, { status: 404 }),
    );
    const register = createEpcRegister({ apiKey: "token" });

    const result = await register.search(
      "NG17 0AZ",
      createSourceCaller({ fetch: fetchMock }),
    );

    expect(result).toEqual({ status: "ok", data: [], period: null });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(domesticSearchUrl("NG17 0AZ"));
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer token");
    expect(headers.get("accept")).toBe("application/json");
  });

  it("is unavailable when the API refuses the token, saying to check EPC_API_KEY", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const register = createEpcRegister({ apiKey: "wrong" });

    const result = await register.certificate(
      "9901-0000-0000-0000-0005",
      createSourceCaller({
        fetch: epcFixtures(NG17_1AA_EPC, TEST_EPC_API_KEY),
      }),
    );

    expect(result).toEqual({ status: "unavailable" });
    expect(String(errors.mock.calls[0]?.[1])).toMatch(
      /answered 403: check EPC_API_KEY/,
    );
  });

  it("asks nothing more after a 429 until its Retry-After has passed, or a minute without one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = stubFetch(() =>
      Response.json({}, { status: 429, headers: { "retry-after": "30" } }),
    );
    const register = createEpcRegister({ apiKey: "token" });
    const callSource = createSourceCaller({ fetch: fetchMock });

    expect(await register.search("NG17 1BT", callSource)).toEqual({
      status: "unavailable",
    });
    expect(await register.search("NG17 1BS", callSource)).toEqual({
      status: "unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    fetchMock.mockImplementation(() =>
      Promise.resolve(Response.json({}, { status: 429 })),
    );
    await register.search("NG17 1BS", callSource);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(EPC_RETRY_AFTER_MS - 1);
    await register.search("NG17 1AE", callSource);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches each answer for 24 hours, as Price Paid's", () => {
    expect(epcRegister.cacheTtlMs).toBe(24 * 60 * 60 * 1000);
  });
});

describe("certificatesIn", () => {
  it(`asks for every postcode in the Search Area, at most ${String(EPC_CONCURRENCY)} at once`, async () => {
    let running = 0;
    let most = 0;
    const fixtures = epcFixtures(NG17_1AA_EPC, TEST_EPC_API_KEY);
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      return fixtures(input, init);
    });

    const found = await certificatesIn(
      NG17_POSTCODES,
      createEpcRegister({ apiKey: TEST_EPC_API_KEY }),
      createSourceCaller({ fetch: fetchMock }),
    );

    expect(found.size).toBe(100);
    expect(found.get("NG17 5EQ")).toHaveLength(4);
    expect(found.get("NG17 0AZ")).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(100);
    expect(most).toBe(EPC_CONCURRENCY);
  });

  it("gives `null` for a postcode the EPC API didn't answer for", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bodies = new Map(NG17_1AA_EPC);
    bodies.delete(domesticSearchUrl("NG17 1BT"));

    const found = await certificatesIn(
      NG17_POSTCODES,
      createEpcRegister({ apiKey: TEST_EPC_API_KEY }),
      createSourceCaller({ fetch: epcFixtures(bodies, TEST_EPC_API_KEY) }),
    );

    expect(found.get("NG17 1BT")).toBeNull();
    expect(found.get("NG17 1BS")).toHaveLength(2);
  });
});

describe("matchSales", () => {
  const sale = (changes: Partial<Sale>): Sale => ({
    ...(SALES[0] as Sale),
    ...changes,
  });

  it("matches a house by its number and street, whichever way they are written", () => {
    const certificates: CertificatesByPostcode = new Map([
      ["NG17 1BT", [searched("1", ["88, High Pavement"])]],
    ]);

    expect(
      matchSales([sale({})], certificates).get(SALES[0]?.id ?? ""),
    ).toEqual(certificates.get("NG17 1BT")?.[0]);
  });

  it("leaves a sale unmatched when two properties fit, or none, and unavailable when its postcode wasn't answered", () => {
    const certificates: CertificatesByPostcode = new Map([
      [
        "NG17 1BT",
        [
          searched("1", ["Flat 1, 88 High Pavement"]),
          searched("2", ["Flat 2, 88 High Pavement"]),
        ],
      ],
      ["NG17 5DA", []],
      ["NG17 1AE", null],
    ]);

    const matched = matchSales(
      [
        sale({ id: "a" }),
        sale({ id: "b", postcode: "NG17 5DA" }),
        sale({ id: "c", postcode: "NG17 1AE" }),
      ],
      certificates,
    );

    expect([...matched]).toEqual([
      ["a", "unmatched"],
      ["b", "unmatched"],
      ["c", "unavailable"],
    ]);
  });

  it("never looks for property of type other", () => {
    expect(
      matchSales([sale({ type: "other" })], new Map([["NG17 1BT", []]])).size,
    ).toBe(0);
  });
});

describe("withEpcs", () => {
  it("gives the sales of NG17 1AA their EPCs, and the homes in its postcodes by band", async () => {
    const callSource = createSourceCaller({ fetch: recorded() });
    const register = createEpcRegister({ apiKey: TEST_EPC_API_KEY });
    const sales = await pricePaidSales(NG17_POSTCODES, callSource, TODAY);
    if (sales.status !== "ok") throw new Error("Price Paid didn't answer");
    const certificates = await certificatesIn(
      NG17_POSTCODES,
      register,
      callSource,
    );

    const { features, epc } = await withEpcs(
      sales.data.features,
      sales.data.sales,
      certificates,
      register,
      callSource,
    );

    expect(features.map(({ epc }) => epc?.status ?? null)).toEqual(
      sales.data.features.map(({ type, address }) =>
        type === "other"
          ? null
          : address.startsWith("9 KENSINGTON CLOSE")
            ? "unmatched"
            : "matched",
      ),
    );
    expect(epc.statistics).toMatchObject({
      homes: 35,
      sales: { lookedFor: 20, matched: 19 },
      pricePerSquareMetre: { count: 18, median: 1894, mean: 1904 },
    });
  });

  it("gives a matched sale without its certificate's details when the EPC API doesn't answer for it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bodies = new Map(NG17_1AA_EPC);
    bodies.delete(certificateUrl("9901-0000-0000-0000-0005"));
    const callSource = createSourceCaller({
      fetch: epcFixtures(bodies, TEST_EPC_API_KEY),
    });
    const register = createEpcRegister({ apiKey: TEST_EPC_API_KEY });
    const highPavement = SALES.slice(0, 1);

    const { features, epc } = await withEpcs(
      highPavement.map((sale) => saleFeature(sale, null)),
      highPavement,
      new Map([["NG17 1BT", mapDomesticSearch(ng17Epcs.searches["NG17 1BT"])]]),
      register,
      callSource,
    );

    expect(features[0]?.epc).toEqual({
      status: "matched",
      certificate: {
        certificateNumber: "9901-0000-0000-0000-0005",
        registrationDate: "2019-03-14",
        currentBand: "D",
        details: null,
      },
    });
    expect(epc.statistics).toMatchObject({
      sales: { lookedFor: 1, matched: 1 },
      pricePerSquareMetre: { count: 0, median: null },
    });
  });

  it("counts the homes in the postcodes answered, and is unavailable when none was", async () => {
    const some = await withEpcs(
      [],
      [],
      new Map([
        ["NG17 1BT", mapDomesticSearch(ng17Epcs.searches["NG17 1BT"])],
        ["NG17 1BS", null],
      ]),
      createEpcRegister({ apiKey: TEST_EPC_API_KEY }),
      createSourceCaller({ fetch: vi.fn<typeof fetch>() }),
    );
    const none = await withEpcs(
      [],
      [],
      new Map([["NG17 1BS", null]]),
      createEpcRegister({ apiKey: TEST_EPC_API_KEY }),
      createSourceCaller({ fetch: vi.fn<typeof fetch>() }),
    );

    expect(some.epc).toEqual({
      status: "ok",
      statistics: {
        byBand: [
          { band: "A", count: 0 },
          { band: "B", count: 0 },
          { band: "C", count: 1 },
          { band: "D", count: 1 },
          { band: "E", count: 1 },
          { band: "F", count: 0 },
          { band: "G", count: 0 },
        ],
        homes: 3,
        postcodes: { searched: 2, unanswered: 1 },
        sales: { lookedFor: 0, matched: 0 },
        pricePerSquareMetre: { count: 0, median: null, mean: null },
      },
    });
    expect(none.epc).toEqual({ status: "unavailable", statistics: null });
  });
});
