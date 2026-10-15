import { describe, expect, it } from "vitest";

import { isLayerResponse } from "./layer";
import {
  PLANNING_APPLICATION_STATUSES,
  PLANNING_APPLICATION_TYPES,
  PLANNING_CONSTRAINT_TYPES,
  isConstraintShape,
  isPlanningApplicationFeature,
  isPlanningApplicationStatistics,
  isPlanningApplications,
  isPlanningConstraintFeature,
  isPlanningLayerResponse,
} from "./planning";

const square = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-1.27, 53.12],
        [-1.26, 53.12],
        [-1.26, 53.13],
        [-1.27, 53.13],
        [-1.27, 53.12],
      ],
    ],
  ],
};

const conservationArea = {
  id: "44005909",
  location: { lat: 53.123664, lng: -1.264078 },
  distanceMetres: 0,
  type: "conservation-area",
  name: "Sutton in Ashfield Church and Market Place",
  grade: null,
  coversLocation: true,
  shape: square,
};

const listedBuilding = {
  id: "31478316",
  location: { lat: 53.12433, lng: -1.26803 },
  distanceMetres: 272,
  type: "listed-building",
  name: "CHURCH OF ST MARY MAGDALENE",
  grade: "II*",
  coversLocation: false,
  shape: null,
};

const statistics = {
  byType: PLANNING_CONSTRAINT_TYPES.map((type) => ({
    type,
    count: type === "conservation-area" || type === "listed-building" ? 1 : 0,
    coversLocation: type === "conservation-area",
  })),
  coveringLocation: [
    {
      type: "conservation-area",
      name: "Sutton in Ashfield Church and Market Place",
    },
  ],
};

/** One of PlanIt's applications near NG17 1AA, placed at its postcode. */
const application = {
  id: "Ashfield/V/2025/0320",
  location: { lat: 53.124817, lng: -1.25829 },
  distanceMetres: 408,
  reference: "V/2025/0320",
  authority: "Ashfield",
  description: "Outline application with all matters reserved for 4 dwellings",
  address: "19 Portland Street, Sutton In Ashfield, Nottinghamshire, NG17 4AW",
  postcode: "NG17 4AW",
  status: "approved",
  applicationType: "minor",
  councilType: "Outline Planning Application",
  receivedOn: "2025-08-20",
  decidedOn: "2025-11-28",
  approximate: true,
  url: "https://planning.ashfield.gov.uk/planning-applications/planning-application/?RefType=GFPlanning&KeyNo=234546",
  providerUrl: "https://www.planit.org.uk/planapplic/Ashfield/V/2025/0320/",
  estimatedHomes: 4,
  impact:
    "Potential impact, estimated: 4 new homes, about 10 more residents, once built.",
};

const applicationStatistics = {
  count: 1,
  total: 1,
  approximate: 1,
  byStatus: PLANNING_APPLICATION_STATUSES.map((status) => ({
    status,
    count: status === "approved" ? 1 : 0,
  })),
  byType: PLANNING_APPLICATION_TYPES.map((type) => ({
    type,
    count: type === "minor" ? 1 : 0,
  })),
  major: [],
  housing: {
    approved: 4,
    pending: 0,
    homes: 4,
    residents: 10,
    applications: 1,
    unstated: 0,
  },
};

const applications = {
  status: "ok",
  provider: {
    id: "planit",
    name: "PlanIt",
    url: "https://www.planit.org.uk/",
    note: "Planning Applications come from PlanIt.",
  },
  period: { from: "2023-10-09", to: "2026-10-08" },
  features: [application],
  statistics: applicationStatistics,
};

const layer = {
  layer: "planning",
  status: "ok",
  sources: [
    {
      id: "planning-data",
      name: "planning.data.gov.uk",
      status: "ok",
      period: null,
    },
    {
      id: "planit",
      name: "PlanIt",
      status: "ok",
      period: { from: "2023-10-09", to: "2026-10-08" },
    },
  ],
  features: [conservationArea, listedBuilding],
  statistics,
  applications,
};

describe("isConstraintShape", () => {
  it("accepts a MultiPolygon with closed rings", () => {
    expect(isConstraintShape(square)).toBe(true);
  });

  it.each([
    ["a Polygon", { ...square, type: "Polygon" }],
    ["no polygons", { ...square, coordinates: [] }],
    [
      "a ring of fewer than four positions",
      {
        ...square,
        coordinates: [
          [
            [
              [-1.27, 53.12],
              [-1.26, 53.12],
            ],
          ],
        ],
      },
    ],
    [
      "a position that is not a pair of numbers",
      { ...square, coordinates: [[[[-1.27], [-1.26, 53.12], [0, 0], [0, 0]]]] },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isConstraintShape(value)).toBe(false);
  });
});

describe("isPlanningConstraintFeature", () => {
  it("accepts a shape and a listed building known only as a point", () => {
    expect(isPlanningConstraintFeature(conservationArea)).toBe(true);
    expect(isPlanningConstraintFeature(listedBuilding)).toBe(true);
  });

  it.each([
    ["an unknown type", { ...listedBuilding, type: "green-belt" }],
    ["no name", { ...listedBuilding, name: undefined }],
    ["a grade that is a number", { ...listedBuilding, grade: 2 }],
    ["no word on the Location", { ...listedBuilding, coversLocation: null }],
    ["a shape that is not a MultiPolygon", { ...listedBuilding, shape: {} }],
  ])("rejects %s", (_label, value) => {
    expect(isPlanningConstraintFeature(value)).toBe(false);
  });
});

describe("isPlanningApplicationFeature", () => {
  it("accepts an application, decided or not", () => {
    expect(isPlanningApplicationFeature(application)).toBe(true);
    expect(
      isPlanningApplicationFeature({
        ...application,
        status: "pending",
        decidedOn: null,
        address: null,
        postcode: null,
        councilType: null,
        url: null,
        providerUrl: null,
        estimatedHomes: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["an unknown status", { ...application, status: "permitted" }],
    ["an unknown type", { ...application, applicationType: "large" }],
    ["no reference", { ...application, reference: "" }],
    [
      "a date that isn't ISO 8601",
      { ...application, receivedOn: "20/08/2025" },
    ],
    ["no word on its point", { ...application, approximate: undefined }],
    ["no location", { ...application, location: null }],
    ["no homes counted as homes", { ...application, estimatedHomes: 0 }],
    ["part of a home", { ...application, estimatedHomes: 1.5 }],
    ["no potential impact", { ...application, impact: "" }],
  ])("rejects %s", (_label, value) => {
    expect(isPlanningApplicationFeature(value)).toBe(false);
  });
});

describe("isPlanningApplicationStatistics", () => {
  it("accepts every status and type counted", () => {
    expect(isPlanningApplicationStatistics(applicationStatistics)).toBe(true);
  });

  it("accepts a provider that doesn't say how many it has", () => {
    expect(
      isPlanningApplicationStatistics({
        ...applicationStatistics,
        total: null,
      }),
    ).toBe(true);
  });

  it.each([
    ["fewer in all than given", { ...applicationStatistics, total: 0 }],
    [
      "more approximate than given",
      { ...applicationStatistics, approximate: 2 },
    ],
    [
      "an unknown status",
      {
        ...applicationStatistics,
        byStatus: [{ status: "permitted", count: 1 }],
      },
    ],
    [
      "a count that is not a whole number",
      { ...applicationStatistics, byType: [{ type: "minor", count: 0.5 }] },
    ],
    [
      "a major application with no id",
      { ...applicationStatistics, major: [""] },
    ],
    ["no estimated housing", { ...applicationStatistics, housing: undefined }],
    [
      "part of a resident",
      {
        ...applicationStatistics,
        housing: { ...applicationStatistics.housing, residents: 9.6 },
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isPlanningApplicationStatistics(value)).toBe(false);
  });
});

describe("isPlanningApplications", () => {
  it("accepts applications found, queued or unavailable", () => {
    expect(isPlanningApplications(applications)).toBe(true);
    for (const status of ["queued", "unavailable"]) {
      expect(
        isPlanningApplications({
          ...applications,
          status,
          features: [],
          statistics: null,
        }),
      ).toBe(true);
    }
  });

  it.each([
    ["an unknown status", { ...applications, status: "not-prepared" }],
    ["no provider", { ...applications, provider: { id: "planit" } }],
    [
      "a provider with no website to credit",
      { ...applications, provider: { ...applications.provider, url: "" } },
    ],
    ["no period", { ...applications, period: null }],
    [
      "a constraint as an application",
      { ...applications, features: [listedBuilding] },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isPlanningApplications(value)).toBe(false);
  });
});

describe("isPlanningLayerResponse", () => {
  it("accepts Planning Constraints with their count per type", () => {
    expect(isPlanningLayerResponse(layer)).toBe(true);
    expect(isLayerResponse(layer)).toBe(true);
  });

  it("accepts an unavailable Layer with no Features or statistics", () => {
    expect(
      isPlanningLayerResponse({
        ...layer,
        status: "unavailable",
        features: [],
        statistics: null,
      }),
    ).toBe(true);
  });

  it("accepts a Layer whose Planning Applications weren't looked for", () => {
    expect(isPlanningLayerResponse({ ...layer, applications: null })).toBe(
      true,
    );
  });

  it.each([
    ["another Layer", { ...layer, layer: "crime" }],
    ["a Feature of another Layer", { ...layer, features: [{ id: "1" }] }],
    ["no word on Planning Applications", { ...layer, applications: undefined }],
    [
      "an application among the Planning Constraints",
      { ...layer, features: [application] },
    ],
    [
      "a count that is not a whole number",
      {
        ...layer,
        statistics: {
          ...statistics,
          byType: [{ type: "flood-zone", count: 0.5, coversLocation: false }],
        },
      },
    ],
    [
      "a covering constraint without a name",
      {
        ...layer,
        statistics: {
          ...statistics,
          coveringLocation: [{ type: "conservation-area" }],
        },
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isPlanningLayerResponse(value)).toBe(false);
  });
});
