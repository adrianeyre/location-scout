import { describe, expect, it } from "vitest";

import {
  DEFAULT_LAND_FILTERS,
  HM_LAND_REGISTRY_SEARCHES,
  INSPIRE_FREEHOLD_NOTE,
  LAND_OPPORTUNITY_WORDING,
  LAND_SALE_LABEL,
  LAND_SALES_NOTE,
  NEARBY_LAND_SALES_RULES,
  OWNERSHIP_CATEGORIES,
  OWNERSHIP_CATEGORY_NAMES,
  OWNERSHIP_CATEGORY_NOTE,
  isLandFilters,
  isLandLayerResponse,
  isLandOpportunityFeature,
  isLandParcelResponse,
  isLandSale,
  isMatchedTitle,
  isNearbyLandSales,
  titleAttribution,
} from "./land";
import { isLayerResponse } from "./layer";

const square = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-1.25, 53.11],
        [-1.24, 53.11],
        [-1.24, 53.12],
        [-1.25, 53.11],
      ],
    ],
  ],
};

const ASHFIELD = { code: "E07000170", name: "Ashfield" };

const matchedTitle = {
  titleNumber: "ZZ100001",
  propertyAddress: "Sutton Parkway, Lowmoor Road, Kirkby-in-Ashfield",
  proprietorshipCategory: "Local Authority",
  ownershipCategory: "council-or-public-body",
  dataset: "ccod",
  sourceDate: "2026-10",
  matchedBy: "named",
  inspireId: "64151457",
  distanceMetres: 0,
};

const parcel = {
  id: "E07000170-2",
  location: { lat: 53.1146, lng: -1.2384 },
  council: ASHFIELD,
  name: null,
  landUse: ["landuse=farmland"],
  areaHectares: 19.522,
  areaAcres: 48.241,
  roadDistanceMetres: 7,
  inspireCoverage: 0.727,
  possiblyUnregistered: false,
  inspirePolygons: [
    {
      inspireId: "64151457",
      share: 0.724,
      ownershipCategory: "council-or-public-body",
    },
  ],
  ownershipCategory: "council-or-public-body",
  matchedTitles: [matchedTitle],
  constraints: [{ type: "flood-zone", name: "Flood zone 2" }],
  floodZone: 2,
  onListedBuildingOutline: false,
  estimatedHomes: 351,
  shape: square,
};

const landSale = {
  id: "559C5AD5-F565-AFE3-E063-4804A8C004A4",
  price: 380000,
  date: "2026-05-28",
  address: "UNIT 3, DRAKEHOUSE COURT, HAMILTON ROAD, SUTTON-IN-ASHFIELD",
  postcode: "NG17 5ES",
  location: { lat: 53.1236, lng: -1.2489 },
  distanceMetres: 1012,
};

const nearbyLandSales = {
  status: "ok",
  period: { from: "2021-10-09", to: "2026-10-08" },
  found: { count: 1, medianPrice: 380000, sales: [landSale] },
};

const nearbyPlanningApplications = {
  status: "ok",
  provider: "PlanIt",
  withinMetres: 500,
  found: {
    count: 2,
    approved: 1,
    major: 0,
    estimatedHomes: 4,
    highlighted: [
      {
        id: "Ashfield/V/2025/0320",
        reference: "V/2025/0320",
        address: "19 Portland Street, Sutton In Ashfield",
        description:
          "Outline application with all matters reserved for 4 dwellings",
        status: "approved",
        applicationType: "minor",
        receivedOn: "2025-08-20",
        estimatedHomes: 4,
        distanceMetres: 120,
      },
    ],
  },
};

const opportunity = {
  ...parcel,
  distanceMetres: 137,
  nearbyLandSales,
  nearbyPlanningApplications,
};

const landLayer = {
  layer: "land",
  status: "ok",
  sources: [
    {
      id: "land-parcels",
      name: "Land Parcels",
      status: "ok",
      period: { from: "2026-10-08", to: "2026-10-08" },
    },
  ],
  scope: "search-area",
  sort: "area",
  filters: DEFAULT_LAND_FILTERS,
  landCoverageAreas: [ASHFIELD],
  notCovered: [],
  features: [opportunity],
  landUse: [
    { id: "way-123", landUse: "industrial", name: null, shape: square },
  ],
  statistics: {
    parcels: 1,
    count: 1,
    totalHectares: 19.52,
    possiblyUnregistered: 0,
    ownershipCategories: {
      company: 0,
      "council-or-public-body": 1,
      "other-registered": 0,
      "possibly-unregistered": 0,
    },
    estimatedHomes: 351,
    listed: 1,
    nearbyLandSales,
  },
};

describe("the Land Opportunity Finder's wording", () => {
  it("says every Land Opportunity only warrants investigation (PRD FR-5.7)", () => {
    expect(LAND_OPPORTUNITY_WORDING).toBe(
      "Our data suggests this parcel warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner.",
    );
  });

  it("says INSPIRE covers only registered freehold titles (PRD FR-5.8)", () => {
    expect(INSPIRE_FREEHOLD_NOTE).toContain("only registered freehold titles");
    expect(INSPIRE_FREEHOLD_NOTE).toContain("recently");
  });

  it("links to HM Land Registry's register and index map searches (PRD FR-5.6)", () => {
    expect(HM_LAND_REGISTRY_SEARCHES.map(({ name }) => name)).toEqual([
      "Search the register",
      "Search the index map",
    ]);
    for (const { url } of HM_LAND_REGISTRY_SEARCHES) {
      expect(url).toMatch(/^https:\/\/www\.gov\.uk\//);
    }
  });
});

describe("Ownership Categories", () => {
  it("are company-owned, council or public-body owned, other registered or Possibly Unregistered (PRD FR-5.4a)", () => {
    expect(
      OWNERSHIP_CATEGORIES.map((each) => OWNERSHIP_CATEGORY_NAMES[each]),
    ).toEqual([
      "Company-owned",
      "Council or public-body owned",
      "Other registered",
      "Possibly Unregistered",
    ]);
  });

  it("are said to be indicative, and other registered land may be a company's or a council's", () => {
    expect(OWNERSHIP_CATEGORY_NOTE).toMatch(
      /^Ownership Categories are indicative\./,
    );
    expect(OWNERSHIP_CATEGORY_NOTE).toContain(
      "other registered land may well be held by a company or a council too",
    );
  });

  it("credit HM Land Registry as CCOD's and OCOD's licence requires, with the year of their data", () => {
    expect(titleAttribution("2026")).toBe(
      "Information produced by HM Land Registry. © Crown copyright 2026.",
    );
  });

  it("are matched from a company's or council's title, with its address and Proprietorship Category", () => {
    expect(isMatchedTitle(matchedTitle)).toBe(true);
    expect(
      isMatchedTitle({
        ...matchedTitle,
        ownershipCategory: "company",
        dataset: "ocod",
        matchedBy: "address",
      }),
    ).toBe(true);
    expect(isMatchedTitle({ ...matchedTitle, matchedBy: "postcode" })).toBe(
      false,
    );
    expect(isMatchedTitle({ ...matchedTitle, propertyAddress: "" })).toBe(
      false,
    );
    expect(isMatchedTitle({ ...matchedTitle, distanceMetres: -1 })).toBe(false);
  });
});

describe("nearby land sales", () => {
  it("are Price Paid's sales within 1 mile in the last 5 years, the newest 10 listed (PRD FR-5.4b)", () => {
    expect(NEARBY_LAND_SALES_RULES).toEqual({
      withinMetres: 1609.344,
      years: 5,
      listed: 10,
    });
  });

  it("are marked indicative: they may not be land", () => {
    expect(LAND_SALE_LABEL).toBe("indicative: may not be land");
    expect(LAND_SALES_NOTE).toContain("property of type Other");
    expect(LAND_SALES_NOTE).toContain("most may not be land");
    expect(LAND_SALES_NOTE).toContain("middle of its postcode");
  });

  it("are each a sale with its price, date, address, postcode and distance", () => {
    expect(isLandSale(landSale)).toBe(true);
  });

  it.each([
    { id: "" },
    { price: 1.5 },
    { price: -1 },
    { date: "28 May 2026" },
    { address: "" },
    { postcode: undefined },
    { location: null },
    { distanceMetres: -1 },
  ])("refuse a sale with %o", (change) => {
    expect(isLandSale({ ...landSale, ...change })).toBe(false);
  });

  it("are counted, with their median, and may be none, unavailable or not prepared", () => {
    expect(isNearbyLandSales(nearbyLandSales)).toBe(true);
    expect(
      isNearbyLandSales({
        ...nearbyLandSales,
        found: { count: 0, medianPrice: null, sales: [] },
      }),
    ).toBe(true);
    for (const status of ["unavailable", "not-prepared"]) {
      expect(
        isNearbyLandSales({ ...nearbyLandSales, status, found: null }),
      ).toBe(true);
    }
  });

  it.each([
    { status: "failed" },
    { period: null },
    { period: { from: "2021", to: "2026-10-08" } },
    { found: { count: -1, medianPrice: null, sales: [] } },
    { found: { count: 1, medianPrice: "£380,000", sales: [landSale] } },
    {
      found: {
        count: 1,
        medianPrice: 380000,
        sales: [{ ...landSale, price: null }],
      },
    },
    { found: undefined },
  ])("refuse %o", (change) => {
    expect(isNearbyLandSales({ ...nearbyLandSales, ...change })).toBe(false);
  });
});

describe("isLandFilters", () => {
  it("accepts FR-5.3's defaults: at least 0.1 acre, 50 m from a road, not on a listed building's outline", () => {
    expect(DEFAULT_LAND_FILTERS).toEqual({
      minAcres: 0.1,
      maxAcres: null,
      maxRoadMetres: 50,
      maxFloodZone: 3,
      possiblyUnregisteredOnly: false,
      excludeConstraints: [],
      excludeListedBuildingOutlines: true,
      ownershipCategories: [],
    });
    expect(isLandFilters(DEFAULT_LAND_FILTERS)).toBe(true);
  });

  it("accepts Ownership Categories to keep", () => {
    expect(
      isLandFilters({
        ...DEFAULT_LAND_FILTERS,
        ownershipCategories: ["company", "possibly-unregistered"],
      }),
    ).toBe(true);
  });

  it.each([
    { minAcres: -1 },
    { maxAcres: "any" },
    { maxRoadMetres: undefined },
    { maxFloodZone: 4 },
    { possiblyUnregisteredOnly: "yes" },
    { excludeConstraints: ["green-belt"] },
    { excludeListedBuildingOutlines: null },
    { ownershipCategories: ["individual"] },
    { ownershipCategories: undefined },
  ])("refuses %o", (change) => {
    expect(isLandFilters({ ...DEFAULT_LAND_FILTERS, ...change })).toBe(false);
  });
});

describe("isLandOpportunityFeature", () => {
  it("accepts a Land Parcel that meets the filters, with its distance", () => {
    expect(isLandOpportunityFeature(opportunity)).toBe(true);
    // Across a whole Land Coverage Area, land sales and Planning
    // Applications aren't looked for.
    expect(
      isLandOpportunityFeature({
        ...opportunity,
        nearbyLandSales: null,
        nearbyPlanningApplications: null,
      }),
    ).toBe(true);
    // While the Planning Applications wait their provider's turn.
    expect(
      isLandOpportunityFeature({
        ...opportunity,
        nearbyPlanningApplications: {
          ...nearbyPlanningApplications,
          status: "queued",
          found: null,
        },
      }),
    ).toBe(true);
    expect(
      isLandOpportunityFeature({
        ...opportunity,
        name: "Kirkby Fields",
        roadDistanceMetres: null,
        floodZone: null,
        constraints: [],
        inspirePolygons: [],
        matchedTitles: [],
        ownershipCategory: "other-registered",
      }),
    ).toBe(true);
  });

  it("accepts one with no Ownership Category, where CCOD and OCOD aren't prepared", () => {
    expect(
      isLandOpportunityFeature({
        ...opportunity,
        inspirePolygons: [
          { inspireId: "64151457", share: 0.724, ownershipCategory: null },
        ],
        ownershipCategory: null,
        matchedTitles: [],
      }),
    ).toBe(true);
  });

  it.each([
    { distanceMetres: undefined },
    { council: null },
    { name: "" },
    { inspireCoverage: 1.2 },
    {
      inspirePolygons: [
        { inspireId: "64151457", share: -0.1, ownershipCategory: null },
      ],
    },
    { inspirePolygons: [{ inspireId: "64151457", share: 0.7 }] },
    { ownershipCategory: "individual" },
    { ownershipCategory: undefined },
    {
      matchedTitles: [
        { ...matchedTitle, ownershipCategory: "other-registered" },
      ],
    },
    { matchedTitles: [{ ...matchedTitle, dataset: "nps" }] },
    { matchedTitles: undefined },
    { constraints: [{ type: "green-belt", name: "Green belt" }] },
    { floodZone: 1 },
    { estimatedHomes: 2.5 },
    { shape: null },
    { nearbyLandSales: undefined },
    { nearbyLandSales: { ...nearbyLandSales, found: undefined } },
    { nearbyPlanningApplications: undefined },
    {
      nearbyPlanningApplications: {
        ...nearbyPlanningApplications,
        status: "not-prepared",
      },
    },
    {
      nearbyPlanningApplications: {
        ...nearbyPlanningApplications,
        found: {
          ...nearbyPlanningApplications.found,
          highlighted: [
            {
              ...nearbyPlanningApplications.found.highlighted[0],
              distanceMetres: -1,
            },
          ],
        },
      },
    },
  ])("refuses one with %o", (change) => {
    expect(isLandOpportunityFeature({ ...opportunity, ...change })).toBe(false);
  });
});

describe("isLandLayerResponse", () => {
  it("accepts the Land Layer, which is a Layer response", () => {
    expect(isLandLayerResponse(landLayer)).toBe(true);
    expect(isLayerResponse(landLayer)).toBe(true);
  });

  it("accepts statistics with no Ownership Categories, where CCOD and OCOD aren't prepared", () => {
    expect(
      isLandLayerResponse({
        ...landLayer,
        statistics: { ...landLayer.statistics, ownershipCategories: null },
      }),
    ).toBe(true);
  });

  it("accepts statistics with no land sales, across a whole Land Coverage Area", () => {
    expect(
      isLandLayerResponse({
        ...landLayer,
        scope: "land-coverage-area",
        features: [
          {
            ...opportunity,
            nearbyLandSales: null,
            nearbyPlanningApplications: null,
          },
        ],
        statistics: { ...landLayer.statistics, nearbyLandSales: null },
      }),
    ).toBe(true);
  });

  it("accepts land data not prepared for this area", () => {
    expect(
      isLandLayerResponse({
        ...landLayer,
        status: "not-prepared",
        landCoverageAreas: [],
        notCovered: [{ code: "E07000174", name: "Mansfield" }],
        features: [],
        landUse: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it.each([
    { layer: "lands" },
    { scope: "england" },
    { sort: "price" },
    { filters: null },
    { notCovered: undefined },
    { features: [parcel] },
    {
      landUse: [
        { id: "way-1", landUse: "residential", name: null, shape: square },
      ],
    },
    { statistics: { ...landLayer.statistics, listed: -1 } },
    {
      statistics: {
        ...landLayer.statistics,
        ownershipCategories: { company: 1 },
      },
    },
    { statistics: { ...landLayer.statistics, nearbyLandSales: undefined } },
  ])("refuses %o", (change) => {
    expect(isLandLayerResponse({ ...landLayer, ...change })).toBe(false);
  });
});

describe("isLandParcelResponse", () => {
  it("accepts a Land Parcel with the INSPIRE Index Polygons that overlap it, and the land sales near it", () => {
    const body = {
      parcel,
      inspirePolygons: [
        {
          inspireId: "64151457",
          share: 0.724,
          ownershipCategory: "council-or-public-body",
          distanceMetres: 0,
          shape: square,
        },
      ],
      nearbyLandSales,
      sources: landLayer.sources,
    };

    expect(isLandParcelResponse(body)).toBe(true);
    expect(isLandParcelResponse({ ...body, nearbyLandSales: null })).toBe(
      false,
    );
    expect(
      isLandParcelResponse({
        ...body,
        inspirePolygons: [
          {
            inspireId: "64151457",
            share: 0.724,
            ownershipCategory: "council-or-public-body",
          },
        ],
      }),
    ).toBe(false);
  });
});
