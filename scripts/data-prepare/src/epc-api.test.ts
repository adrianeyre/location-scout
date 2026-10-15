import { describe, expect, it, vi } from "vitest";

import {
  EPC_API,
  certificateDetails,
  fetchCertificate,
  searchDomestic,
} from "./epc-api";

/** A `fetch` answering each request with the next of `responses`, and the requests it was asked. */
const stubFetch = (...responses: Response[]) => {
  const requests: { url: string; headers: Headers }[] = [];
  const fetchFn = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: input instanceof Request ? input.url : String(input),
      headers: new Headers(init?.headers),
    });
    const response = responses.shift();
    return Promise.resolve(response ?? new Response(null, { status: 500 }));
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, requests };
};

const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** The search's own example answer, from the API's OpenAPI description. */
const SEARCH = {
  data: [
    {
      addressLine1: "1 Some Street",
      addressLine2: null,
      addressLine3: null,
      addressLine4: null,
      uprn: 100121241798,
      certificateNumber: "0000-0000-0000-0000-0000",
      constituency: "Chelsea and Fulham",
      council: "Hammersmith and Fulham",
      currentEnergyEfficiencyBand: "B",
      postTown: "Whitbury",
      postcode: "SW10 0AA",
      registrationDate: "2020-05-04",
      schemaType: "RdSAP-Schema-20.0.0",
    },
  ],
  pagination: {
    totalRecords: 1,
    currentPage: 1,
    totalPages: 1,
    nextPage: null,
    prevPage: null,
    pageSize: 5000,
  },
};

describe("searchDomestic", () => {
  it("asks for a postcode's certificates with the bearer token, and reads them", async () => {
    const { fetchFn, requests } = stubFetch(json(SEARCH));
    expect(
      await searchDomestic(fetchFn, "token", { postcode: "SW10 0AA" }),
    ).toEqual([
      {
        certificateNumber: "0000-0000-0000-0000-0000",
        uprn: "100121241798",
        addressLines: ["1 Some Street", null, null, null],
        registrationDate: "2020-05-04",
      },
    ]);
    expect(requests[0]?.url).toBe(
      `${EPC_API.base}/api/domestic/search?postcode=SW10+0AA&page_size=5000`,
    );
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer token");
    expect(requests[0]?.headers.get("accept")).toBe("application/json");
  });

  it("asks for a UPRN padded to 12 digits", async () => {
    const { fetchFn, requests } = stubFetch(json(SEARCH));
    await searchDomestic(fetchFn, "token", { uprn: "766038542" });
    expect(requests[0]?.url).toBe(
      `${EPC_API.base}/api/domestic/search?uprn=000766038542&page_size=5000`,
    );
  });

  it("reads a 404 as no certificates", async () => {
    const { fetchFn } = stubFetch(
      json({ error: "No certificates could be found" }, 404),
    );
    expect(
      await searchDomestic(fetchFn, "token", { postcode: "NG17 1AA" }),
    ).toEqual([]);
  });

  it("waits out a 429 for as long as its Retry-After says, then asks again", async () => {
    const { fetchFn, requests } = stubFetch(
      new Response("Too Many Requests", {
        status: 429,
        headers: { "retry-after": "7" },
      }),
      json(SEARCH),
    );
    const wait = vi.fn(() => Promise.resolve());
    expect(
      await searchDomestic(fetchFn, "token", { postcode: "SW10 0AA" }, wait),
    ).toHaveLength(1);
    expect(wait).toHaveBeenCalledWith(7000);
    expect(requests).toHaveLength(2);
  });

  it("fails on an answer it can't use, such as a missing token's 403", async () => {
    const { fetchFn } = stubFetch(
      new Response("Access denied. Bad authentication header.", {
        status: 403,
      }),
    );
    await expect(
      searchDomestic(fetchFn, "", { postcode: "NG17 1AA" }),
    ).rejects.toThrow(/answered 403.*Bad authentication header/);
  });
});

describe("fetchCertificate", () => {
  it("reads the floor area and both ratings from a certificate's data", async () => {
    const { fetchFn, requests } = stubFetch(
      json({
        data: {
          uprn: 12457,
          total_floor_area: 55,
          current_energy_efficiency_band: "E",
          potential_energy_efficiency_band: "C",
          energy_rating_current: 50,
          energy_rating_potential: 72,
          assessment_type: "RdSAP",
        },
      }),
    );
    expect(
      await fetchCertificate(fetchFn, "token", "0000-1672-0000-1732-0000"),
    ).toEqual({
      uprn: "12457",
      totalFloorArea: 55,
      currentBand: "E",
      potentialBand: "C",
      currentRating: 50,
      potentialRating: 72,
    });
    expect(requests[0]?.url).toBe(
      `${EPC_API.base}/api/certificate?certificate_number=0000-1672-0000-1732-0000`,
    );
  });

  it("is null for a certificate the API doesn't have", async () => {
    const { fetchFn } = stubFetch(
      json({ error: "Certificate not found" }, 404),
    );
    expect(await fetchCertificate(fetchFn, "token", "0000")).toBeNull();
  });
});

describe("certificateDetails", () => {
  it("leaves out a floor area that isn't a positive number, and missing ratings", () => {
    expect(certificateDetails({ total_floor_area: 0 })).toEqual({
      uprn: null,
      totalFloorArea: null,
      currentBand: null,
      potentialBand: null,
      currentRating: null,
      potentialRating: null,
    });
  });
});
