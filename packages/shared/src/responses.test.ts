import { describe, expect, it } from "vitest";

import { isApiErrorResponse } from "./api-error";
import { isAreaResponse, isSearchArea } from "./area";
import { isGeocodeResponse } from "./geocode";

const location = { lat: 53.123664, lng: -1.264078 };

describe("isGeocodeResponse", () => {
  const postcode = { kind: "postcode", label: "NG17 1AA", location };
  const address = {
    kind: "address",
    label: "High Street, Sutton in Ashfield, NG17 1DH",
    location: { lat: 53.1241078, lng: -1.2621582 },
  };

  it("accepts a resolved postcode", () => {
    expect(
      isGeocodeResponse({ query: "ng17 1aa", candidates: [postcode] }),
    ).toBe(true);
  });

  it("accepts several address candidates", () => {
    expect(
      isGeocodeResponse({
        query: "12 High Street, Sutton-in-Ashfield",
        candidates: [address, { ...address, label: "High Street, Huthwaite" }],
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["missing candidates", { query: "ng17 1aa" }],
    ["no candidates", { query: "ng17 1aa", candidates: [] }],
    ["a missing query", { candidates: [postcode] }],
    [
      "a candidate of an unknown kind",
      { query: "ng17 1aa", candidates: [{ ...postcode, kind: "map-click" }] },
    ],
    [
      "a candidate without a label",
      { query: "ng17 1aa", candidates: [{ kind: "postcode", location }] },
    ],
    [
      "a bad location",
      {
        query: "ng17 1aa",
        candidates: [{ ...postcode, location: { lat: 53 } }],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isGeocodeResponse(value)).toBe(false);
  });
});

describe("isAreaResponse", () => {
  const geography = {
    postcode: "NG17 1AA",
    ward: "Sutton Central & New Cross",
    lsoa: "Ashfield 005E",
    msoa: "Ashfield 005",
    localAuthority: "Ashfield",
    parliamentaryConstituency: "Ashfield",
  };
  const council = {
    status: "ok",
    council: { code: "E07000170", name: "Ashfield" },
    inLandCoverageArea: true,
  };
  const searchArea = {
    location,
    searchRadius: { miles: 0.5, metres: 804.672 },
    geography,
    council,
  };

  it("accepts a Search Area with no sources yet", () => {
    expect(isAreaResponse({ ...searchArea, sources: [], layers: [] })).toBe(
      true,
    );
  });

  it("accepts local geography that postcodes.io leaves partly unnamed", () => {
    expect(
      isAreaResponse({
        ...searchArea,
        geography: {
          ...geography,
          ward: null,
          parliamentaryConstituency: null,
        },
        sources: [],
        layers: [],
      }),
    ).toBe(true);
  });

  it.each([
    ["before data:prepare", { status: "not-prepared", council: null }],
    ["outside every prepared boundary", { status: "ok", council: null }],
    [
      "in a council that is not a Land Coverage Area",
      { status: "ok", council: { code: "E07000174", name: "Mansfield" } },
    ],
  ])("accepts the council %s", (_label, found) => {
    expect(
      isAreaResponse({
        ...searchArea,
        council: { ...found, inLandCoverageArea: false },
        sources: [],
        layers: [],
      }),
    ).toBe(true);
  });

  it("accepts a Search Area with its sources and Layer status", () => {
    expect(
      isAreaResponse({
        ...searchArea,
        sources: [
          {
            id: "police",
            name: "data.police.uk",
            status: "ok",
            period: { from: "2026-07", to: "2026-07" },
          },
          {
            id: "overpass",
            name: "Overpass API",
            status: "unavailable",
            period: null,
          },
        ],
        layers: [
          { id: "crime", status: "ok" },
          { id: "amenities", status: "unavailable" },
        ],
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    [
      "a missing Search Radius",
      { location, geography, council, sources: [], layers: [] },
    ],
    [
      "a Search Radius that is not offered",
      {
        location,
        searchRadius: { miles: 2, metres: 3218.688 },
        geography,
        council,
        sources: [],
        layers: [],
      },
    ],
    [
      "missing metres",
      {
        location,
        searchRadius: { miles: 0.5 },
        geography,
        council,
        sources: [],
        layers: [],
      },
    ],
    [
      "missing local geography",
      {
        location,
        searchRadius: { miles: 0.5, metres: 804.672 },
        council,
        sources: [],
        layers: [],
      },
    ],
    [
      "local geography without its postcode",
      {
        ...searchArea,
        geography: { ...geography, postcode: null },
        sources: [],
        layers: [],
      },
    ],
    [
      "local geography missing a ward",
      {
        ...searchArea,
        geography: { ...geography, ward: undefined },
        sources: [],
        layers: [],
      },
    ],
    [
      "a local authority that is not a name",
      {
        ...searchArea,
        geography: { ...geography, localAuthority: 170 },
        sources: [],
        layers: [],
      },
    ],
    [
      "a missing council",
      {
        location,
        searchRadius: { miles: 0.5, metres: 804.672 },
        geography,
        sources: [],
        layers: [],
      },
    ],
    [
      "a council without its code",
      {
        ...searchArea,
        council: { ...council, council: { name: "Ashfield" } },
        sources: [],
        layers: [],
      },
    ],
    [
      "a council status that is not offered",
      {
        ...searchArea,
        council: { ...council, status: "missing" },
        sources: [],
        layers: [],
      },
    ],
    [
      "no word on the Land Coverage Area",
      {
        ...searchArea,
        council: { status: "ok", council: null },
        sources: [],
        layers: [],
      },
    ],
    ["missing sources", { ...searchArea, layers: [] }],
    ["missing layers", { ...searchArea, sources: [] }],
    [
      "a source status that is not offered",
      {
        ...searchArea,
        sources: [{ id: "x", name: "X", status: "broken", period: null }],
        layers: [],
      },
    ],
    [
      "a source without a period",
      {
        ...searchArea,
        sources: [{ id: "x", name: "X", status: "ok" }],
        layers: [],
      },
    ],
    [
      "a malformed period",
      {
        ...searchArea,
        sources: [{ id: "x", name: "X", status: "ok", period: "2026-07" }],
        layers: [],
      },
    ],
    [
      "a Layer that does not exist",
      { ...searchArea, sources: [], layers: [{ id: "weather", status: "ok" }] },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isAreaResponse(value)).toBe(false);
  });
});

describe("isSearchArea", () => {
  it("accepts a Location and Search Radius on their own", () => {
    expect(
      isSearchArea({ location, searchRadius: { miles: 1, metres: 1609.344 } }),
    ).toBe(true);
  });
});

describe("isApiErrorResponse", () => {
  it("accepts an error message", () => {
    expect(isApiErrorResponse({ error: "Postcode not found" })).toBe(true);
  });

  it.each([null, {}, { error: 404 }])("rejects %j", (value) => {
    expect(isApiErrorResponse(value)).toBe(false);
  });
});
