import { describe, expect, it } from "vitest";

import {
  AMENITY_TYPES,
  GREEN_SPACE_TYPES,
  OFSTED_JUDGEMENTS,
  PLANNING_APPLICATION_STATUSES,
  PLANNING_CONSTRAINT_TYPES,
  SCHOOL_PHASES,
  type AmenityFeature,
  type CategoryId,
  type DemographicsLayerResponse,
  type PlanningApplications,
  type SearchArea,
} from "@location-scout/shared";

import { landLayerResponse } from "../layers";
import { DEFAULT_LAND_QUERY } from "../sources/land";
import { amenityStatistics } from "../sources/overpass-amenities";
import { modeOf } from "../testing/scout-modes";
import { SCORING_CONFIG, type ScoringConfig } from "./config";
import { scoreSearchArea, type ScoredLayers } from "./scores";

const GENERAL = modeOf("general");

const location = { lat: 53.123664, lng: -1.264078 };
const area: SearchArea = {
  location,
  searchRadius: { miles: 0.5, metres: 804.672 },
};
const ok = "ok" as const;

/** The Demographics Layer before `pnpm data:prepare`. */
const NOT_PREPARED: DemographicsLayerResponse = {
  layer: "demographics",
  status: "not-prepared",
  sources: [],
  features: [],
  statistics: null,
};

/**
 * The Demographics Layer estimating `population` residents, whose MSOAs
 * average £42,000 a year, 5% above England's median of £40,000.
 */
const demographics = (population: number): DemographicsLayerResponse => ({
  layer: "demographics",
  status: ok,
  sources: [],
  features: [],
  statistics: {
    outputAreas: 40,
    population,
    households: Math.round(population / 2.3),
    ageProfile: [],
    medianAge: 40.1,
    householdIncome: {
      averagePounds: 42_000,
      msoas: 5,
      englandMedianPounds: 40_000,
    },
    deprivation: null,
  },
});

/**
 * The Schools Layer with a Good primary school 500 m away and a secondary
 * school with a report card 3 km away, outside the Search Area.
 */
const schools: ScoredLayers["schools"] = {
  layer: "schools",
  status: ok,
  sources: [],
  features: [],
  statistics: {
    total: 1,
    byPhase: SCHOOL_PHASES.map((phase) => ({
      phase,
      count: phase === "primary" ? 1 : 0,
      byJudgement: [],
    })),
    byJudgement: OFSTED_JUDGEMENTS.map((judgement) => ({
      judgement,
      count: judgement === "good" ? 1 : 0,
    })),
    nearestPrimary: {
      id: "122694",
      name: "Leamington Primary and Nursery Academy",
      phase: "primary",
      distanceMetres: 500,
      inSearchArea: true,
      judgement: "good",
      inspection: {
        kind: "graded",
        inspectedOn: "2022-03-08",
        grades: [],
        safeguardingMet: true,
        outcome: null,
        ofPredecessor: false,
      },
    },
    primarySearchMetres: 2_400,
    nearestSecondary: {
      id: "139063",
      name: "Sutton Community Academy",
      phase: "secondary",
      distanceMetres: 3_000,
      inSearchArea: false,
      judgement: "report-card",
      inspection: {
        kind: "report-card",
        inspectedOn: "2026-04-21",
        grades: [
          { area: "Inclusion", grade: "expected-standard" },
          { area: "Curriculum and teaching", grade: "expected-standard" },
          { area: "Achievement", grade: "needs-attention" },
          {
            area: "Personal development and wellbeing",
            grade: "strong-standard",
          },
        ],
        safeguardingMet: true,
        outcome: null,
        ofPredecessor: false,
      },
    },
    secondarySearchMetres: 6_000,
  },
};

/**
 * PlanIt's Planning Applications: 28 minor and 2 major, 25 approved and 5
 * pending, proposing 20 new homes, which would bring about 48 residents.
 */
const applications: PlanningApplications = {
  status: ok,
  provider: {
    id: "planit",
    name: "PlanIt",
    url: "https://www.planit.org.uk/",
    note: "Planning Applications come from PlanIt.",
  },
  period: { from: "2023-10-09", to: "2026-10-08" },
  features: [],
  statistics: {
    count: 30,
    total: 30,
    approximate: 0,
    byStatus: PLANNING_APPLICATION_STATUSES.map((status) => ({
      status,
      count: { approved: 25, pending: 5 }[status as string] ?? 0,
    })),
    byType: [
      { type: "householder", count: 0 },
      { type: "minor", count: 28 },
      { type: "major", count: 2 },
    ],
    major: ["Ashfield/V/2025/0425", "Ashfield/V/2024/0379"],
    housing: {
      approved: 15,
      pending: 5,
      homes: 20,
      residents: 48,
      applications: 3,
      unstated: 0,
    },
  },
};

/**
 * A Search Area whose every Layer answered, as small as the scores need, but
 * for the Demographics Layer, which is not prepared, so Safety and
 * Competition count per km².
 */
const layers: ScoredLayers = {
  crime: {
    layer: "crime",
    status: ok,
    sources: [],
    features: [],
    statistics: {
      month: "2026-08",
      total: 160,
      byCategory: [],
      trend: {
        last12Months: { from: "2025-09", to: "2026-08" },
        previous12Months: { from: "2024-09", to: "2025-08" },
        complete: true,
        missingMonths: [],
        total: { last12Months: 900, previous12Months: 1_100, change: -18.2 },
        byCategory: [],
      },
    },
  },
  planning: {
    layer: "planning",
    status: ok,
    sources: [],
    features: [
      {
        id: "44005909",
        location,
        distanceMetres: 0,
        type: "conservation-area",
        name: "Sutton in Ashfield Church and Market Place",
        grade: null,
        coversLocation: true,
        shape: null,
      },
    ],
    statistics: {
      byType: PLANNING_CONSTRAINT_TYPES.map((type) => ({
        type,
        count: type === "conservation-area" ? 1 : 0,
        coversLocation: type === "conservation-area",
      })),
      coveringLocation: [
        {
          type: "conservation-area",
          name: "Sutton in Ashfield Church and Market Place",
        },
      ],
    },
    applications,
  },
  schools,
  amenities: {
    layer: "amenities",
    status: ok,
    sources: [],
    features: [],
    statistics: {
      total: 40,
      byType: AMENITY_TYPES.map((type) => ({
        type,
        count: type === "cafe" || type === "pub" ? 20 : 0,
        nearest: null,
      })),
    },
  },
  transport: {
    layer: "transport",
    status: ok,
    sources: [],
    features: [],
    statistics: {
      facilities: [
        { type: "railway-station", count: 0 },
        { type: "bus-stop", count: 6 },
        { type: "car-park", count: 2 },
        { type: "ev-charger", count: 0 },
      ],
      routes: [],
      nearestStation: {
        id: "node/1",
        name: "Sutton Parkway",
        distanceMetres: 1_628,
        inSearchArea: false,
      },
      stationSearchMetres: 5_000,
    },
  },
  "green-space": {
    layer: "green-space",
    status: ok,
    sources: [],
    features: [],
    statistics: {
      total: 4,
      byType: GREEN_SPACE_TYPES.map((type) => ({ type, count: 1 })),
      nearestPark: {
        id: "way/1",
        name: null,
        distanceMetres: 600,
        inSearchArea: true,
        coversLocation: false,
      },
      parkSearchMetres: 2_000,
    },
  },
  property: {
    layer: "property",
    status: ok,
    sources: [],
    features: [],
    epc: null,
    statistics: {
      period: { from: "2025-10-08", to: "2026-10-07" },
      all: { count: 24, median: 182_000, mean: 187_000 },
      byType: [],
      byTenure: [],
      byNewBuild: [],
      medianChange: {
        twelveMonths: {
          period: { from: "2024-10-08", to: "2025-10-07" },
          prices: null,
          change: null,
        },
        fiveYears: {
          period: { from: "2020-10-08", to: "2021-10-07" },
          prices: null,
          change: null,
        },
      },
      postcodes: {
        searched: 100,
        limit: 100,
        truncated: true,
        reachMetres: 430,
      },
    },
  },
  // No score reads the Land Layer.
  land: landLayerResponse({ status: "not-prepared" }, DEFAULT_LAND_QUERY),
  demographics: NOT_PREPARED,
};

const scoresOf = (scored: ReturnType<typeof scoreSearchArea>) =>
  Object.fromEntries(scored.categories.map(({ id, score }) => [id, score]));

describe("scoreSearchArea", () => {
  it("scores every category from its Layer, and weighs them into the Location Score", () => {
    const scored = scoreSearchArea(layers, area, GENERAL);

    expect(scoresOf(scored)).toEqual({
      // 442.4 crimes per km², 47.3 points, and 10 for an 18.2% fall.
      safety: 57,
      // 2 of 13 types, 10.8 points; 40 amenities, 12 points.
      amenities: 23,
      // 40 points for the primary school 500 m away, and 13.1 for its Good
      // grade; 18.8 for the secondary school 3 km away, and 11.6 for its
      // report card.
      schools: 83,
      // 48.2 points for the station; 24 for 6 bus stops.
      transport: 72,
      // 57.6 points for the park 600 m away; 12 for 4 green spaces.
      "green-space": 70,
      // 24 sales at 1.67 points each.
      "property-activity": 40,
      // 28 minor applications and 2 major, counting 5 each: 38 at 0.4 points
      // each.
      "development-activity": 15,
      // 100, less 20 for the conservation area.
      "planning-freedom": 80,
    });
    expect(scored.categories.every(({ status }) => status === "ok")).toBe(true);
    // (57×25 + 23×15 + 83×10 + 72×15 + 70×10 + 40×10 + 15×5 + 80×10) ÷ 100
    // = 56.55
    expect(scored.location.score).toBe(57);
    expect(scored.location.leftOut).toEqual([]);
  });

  it("always gives the same scores for the same Layers", () => {
    const first = scoreSearchArea(layers, area, GENERAL);
    const again = scoreSearchArea(structuredClone(layers), area, GENERAL);

    expect(again).toEqual(first);
    expect(JSON.stringify(scoreSearchArea(layers, area, GENERAL))).toBe(
      JSON.stringify(first),
    );
  });

  it("leaves out the category of an unavailable Layer, and the Location Score says so", () => {
    const scored = scoreSearchArea(
      {
        ...layers,
        crime: {
          layer: "crime",
          status: "unavailable",
          sources: [],
          features: [],
          statistics: null,
        },
      },
      area,
      GENERAL,
    );

    expect(scored.categories[0]).toEqual({
      id: "safety",
      layer: "crime",
      status: "unavailable",
      score: null,
      breakdown: [],
    });
    expect(scored.location.leftOut).toEqual([
      { id: "safety", layer: "crime", status: "unavailable", weight: 25 },
    ]);
    expect(scored.location.counted.map(({ id }) => id)).not.toContain("safety");
    // (23×15 + 83×10 + 72×15 + 70×10 + 40×10 + 15×5 + 80×10) ÷ 75 = 56.4
    expect(scored.location.score).toBe(56);
    // The other categories are scored as before.
    expect(scoresOf(scored)).toMatchObject({ amenities: 23, transport: 72 });
  });

  it("leaves out Planning freedom when the Planning Layer is unavailable", () => {
    const scored = scoreSearchArea(
      {
        ...layers,
        planning: {
          layer: "planning",
          status: "unavailable",
          sources: [],
          features: [],
          statistics: null,
          applications: null,
        },
      },
      area,
      GENERAL,
    );

    expect(scoresOf(scored)["planning-freedom"]).toBeNull();
    // Neither the constraints nor the applications were found.
    expect(scored.location.leftOut.map(({ id }) => id)).toEqual([
      "development-activity",
      "planning-freedom",
    ]);
  });

  it("scores Development activity from the Planning Applications, whatever the Planning Constraints' status", () => {
    const scored = scoreSearchArea(
      {
        ...layers,
        planning: {
          layer: "planning",
          status: "unavailable",
          sources: [],
          features: [],
          statistics: null,
          applications,
        },
      },
      area,
      modeOf("development"),
    );

    expect(
      scored.categories.find(({ id }) => id === "development-activity"),
    ).toMatchObject({ layer: "planning", status: "ok", score: 15 });
    expect(scored.location.leftOut).toEqual([
      {
        id: "planning-freedom",
        layer: "planning",
        status: "unavailable",
        weight: 30,
      },
    ]);
  });

  it("leaves out Development activity while the Planning Applications are unavailable, as they are without a provider", () => {
    for (const unavailable of [
      { ...applications, status: "unavailable" as const, statistics: null },
      null,
    ]) {
      const scored = scoreSearchArea(
        {
          ...layers,
          planning: { ...layers.planning, applications: unavailable },
        },
        area,
        GENERAL,
      );

      expect(
        scored.categories.find(({ id }) => id === "development-activity"),
      ).toEqual({
        id: "development-activity",
        layer: "planning",
        status: "unavailable",
        score: null,
        breakdown: [],
      });
      expect(scoresOf(scored)["planning-freedom"]).toBe(80);
      // (57×25 + 23×15 + 83×10 + 72×15 + 70×10 + 40×10 + 80×10) ÷ 95 = 58.7
      expect(scored.location.score).toBe(59);
    }
  });

  it("says Development activity is queued while the Planning Applications wait their turn", () => {
    const scored = scoreSearchArea(
      {
        ...layers,
        planning: {
          ...layers.planning,
          applications: { ...applications, status: "queued", statistics: null },
        },
      },
      area,
      modeOf("investment"),
    );

    expect(scored.location.leftOut).toEqual([
      {
        id: "development-activity",
        layer: "planning",
        status: "queued",
        weight: 25,
      },
    ]);
  });

  it("follows a threshold changed in the config, with no other change", () => {
    const nearer: ScoringConfig = {
      ...SCORING_CONFIG,
      transport: {
        ...SCORING_CONFIG.transport,
        station: { ...SCORING_CONFIG.transport.station, full: 2_000 },
      },
    };

    const scored = scoreSearchArea(layers, area, GENERAL, nearer);
    const transport = scored.categories.find(({ id }) => id === "transport");

    // The station 1,628 m away is now within full points' reach.
    expect(transport?.score).toBe(84);
    expect(transport?.breakdown[0]).toMatchObject({
      rule: "2 km or less: 60 points, falling in proportion to 0 at 5 km or more.",
      points: 60,
    });
    // (57×25 + 23×15 + 83×10 + 84×15 + 70×10 + 40×10 + 15×5 + 80×10) ÷ 100
    // = 58.35
    expect(scored.location.score).toBe(58);
  });

  it("follows a weight changed in the config, with no other change", () => {
    const safetyOnly = {
      ...GENERAL,
      weights: {
        safety: 100,
        amenities: 0,
        schools: 0,
        transport: 0,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 0,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
    };

    const scored = scoreSearchArea(layers, area, safetyOnly);

    expect(scored.location.score).toBe(57);
    expect(scored.location.counted.map(({ id }) => id)).toEqual(["safety"]);
  });

  it("weighs the Location Score by the Scout Mode, leaving each Category Score as it is", () => {
    const general = scoreSearchArea(layers, area, GENERAL);
    const inMode = (id: string) => scoreSearchArea(layers, area, modeOf(id));

    expect(
      Object.fromEntries(
        ["general", "homebuyer", "buy-to-let", "investment", "development"].map(
          (id) => [id, inMode(id).location.score],
        ),
      ),
    ).toEqual({
      general: 57,
      // (57×25 + 23×15 + 83×20 + 72×15 + 70×15 + 40×5 + 80×5) ÷ 100 = 61.6
      homebuyer: 62,
      // (57×15 + 23×10 + 83×10 + 72×25 + 70×5 + 40×25 + 15×5 + 80×5) ÷ 100
      // = 55.4
      "buy-to-let": 55,
      // (57×10 + 23×10 + 83×5 + 72×15 + 70×5 + 40×25 + 15×25 + 80×5) ÷ 100
      // = 44.2
      investment: 44,
      // (57×5 + 23×5 + 83×5 + 72×10 + 70×5 + 40×15 + 15×25 + 80×30) ÷ 100
      // = 52.6
      development: 53,
    });
    const development = inMode("development");
    expect(development.mode).toBe("development");
    expect(general.mode).toBe("general");
    expect(development.categories).toEqual(general.categories);
    expect(
      development.location.counted.map(({ id, weight, share }) => [
        id,
        weight,
        share,
      ]),
    ).toEqual([
      ["safety", 5, 5],
      ["amenities", 5, 5],
      ["schools", 5, 5],
      ["transport", 10, 10],
      ["green-space", 5, 5],
      ["property-activity", 15, 15],
      ["development-activity", 25, 25],
      ["planning-freedom", 30, 30],
    ]);
  });

  it("leaves out Schools before pnpm data:prepare, saying it is not prepared, and renormalises the rest", () => {
    const scored = scoreSearchArea(
      {
        ...layers,
        schools: { ...schools, status: "not-prepared", statistics: null },
      },
      area,
      modeOf("homebuyer"),
    );

    expect(scored.categories.find(({ id }) => id === "schools")).toEqual({
      id: "schools",
      layer: "schools",
      status: "not-prepared",
      score: null,
      breakdown: [],
    });
    expect(scored.location.leftOut).toEqual([
      { id: "schools", layer: "schools", status: "not-prepared", weight: 20 },
    ]);
    // (57×25 + 23×15 + 72×15 + 70×15 + 40×5 + 80×5) ÷ 80 = 56.25
    expect(scored.location.score).toBe(56);
  });
});

/** An amenity made its type by `osmTag`, `metres` from the Location. */
const amenity = (
  type: AmenityFeature["type"],
  osmTag: string,
  metres: number,
): AmenityFeature => ({
  id: `${osmTag}@${String(metres)}`,
  location,
  distanceMetres: metres,
  type,
  name: null,
  osmTag,
});

/**
 * `layers`, with amenities to compete with: two cafés, one 80 m away, a
 * restaurant, two shops and an office.
 */
const BUSINESS_FEATURES = [
  amenity("cafe", "amenity=cafe", 80),
  amenity("shop", "shop=bakery", 150),
  amenity("convenience-store", "shop=convenience", 200),
  amenity("office", "office=estate_agent", 250),
  amenity("restaurant", "amenity=restaurant", 300),
  amenity("cafe", "amenity=cafe", 400),
];
const business: ScoredLayers = {
  ...layers,
  amenities: {
    ...layers.amenities,
    features: BUSINESS_FEATURES,
    statistics: amenityStatistics(BUSINESS_FEATURES),
  },
};

const idsOf = (scored: { categories: { id: CategoryId }[] }) =>
  scored.categories.map(({ id }) => id);

describe("scoreSearchArea in the Business and Retail Scout Modes", () => {
  it("scores only the categories each mode weighs", () => {
    const inMode = (id: string) => scoreSearchArea(business, area, modeOf(id));

    expect(idsOf(inMode("general"))).toEqual([
      "safety",
      "amenities",
      "schools",
      "transport",
      "green-space",
      "property-activity",
      "development-activity",
      "planning-freedom",
    ]);
    expect(idsOf(inMode("business-cafe"))).toEqual([
      "safety",
      "amenities",
      "transport",
      "planning-freedom",
      "demand",
      "competition",
      "footfall",
    ]);
    // PRD FR-4.2 gives a nursery no Footfall and no Planning freedom.
    expect(idsOf(inMode("business-nursery"))).toEqual([
      "safety",
      "schools",
      "transport",
      "green-space",
      "demand",
      "competition",
    ]);
  });

  it("counts each mode's own competitors in its Competition score", () => {
    const competition = (id: string) =>
      scoresOf(scoreSearchArea(business, area, modeOf(id))).competition;

    expect(
      Object.fromEntries(
        SCORING_CONFIG.modes
          .filter(({ competitors }) => competitors)
          .map(({ id }) => [id, competition(id)]),
      ),
    ).toEqual({
      // Two shops over the Search Area's 2.03 km², 0.98 a km², falling to 0
      // points at 80 a km² (20 per 1,000 residents): 98.8.
      retail: 99,
      // Two cafés, 0.98 a km², falling to 0 points at 12 a km² (3 per 1,000
      // residents): 91.8, less 10 for the one 80 m away.
      "business-cafe": 82,
      // One restaurant, 0.49 a km², falling to 0 points at 12 a km²: 95.9.
      "business-restaurant": 96,
      "business-takeaway": 100,
      "business-gym": 100,
      "business-hairdresser": 100,
      // One convenience store, 200 m away, 0.49 a km², falling to 0 points at
      // 8 a km² (2 per 1,000 residents): 93.9.
      "business-convenience-store": 94,
      "business-dental-practice": 100,
      "business-nursery": 100,
    });
    const cafe = scoreSearchArea(business, area, modeOf("business-cafe"));
    expect(
      cafe.categories.find(({ id }) => id === "competition"),
    ).toMatchObject({
      layer: "amenities",
      status: "ok",
      breakdown: [
        { input: "Competitors (cafés) per km²", value: 1 },
        { input: "Distance to the nearest competitor", value: 80, points: -10 },
      ],
    });
  });

  it("scores Footfall proxy from the Amenities and Transport Layers, and weighs both into the Location Score", () => {
    const cafe = scoreSearchArea(business, area, modeOf("business-cafe"));

    // Two shops, an office and 6 bus stops: 9 at 0.4 points each.
    expect(scoresOf(cafe)).toEqual({
      safety: 57,
      amenities: 29,
      transport: 72,
      "planning-freedom": 80,
      demand: null,
      competition: 82,
      footfall: 4,
    });
    // Demand is left out without the Demographics Layer:
    // (57×10 + 29×5 + 72×15 + 80×5 + 82×25 + 4×20) ÷ 80 = 54.1
    expect(cafe.location.score).toBe(54);
    expect(
      cafe.location.counted.map(({ id, weight, share }) => [id, weight, share]),
    ).toEqual([
      ["safety", 10, 12.5],
      ["amenities", 5, 6.3],
      ["transport", 15, 18.8],
      ["planning-freedom", 5, 6.3],
      ["competition", 25, 31.3],
      ["footfall", 20, 25],
    ]);
  });

  it("leaves out Footfall proxy, naming the Transport Layer, when only it is unavailable", () => {
    const scored = scoreSearchArea(
      {
        ...business,
        transport: {
          layer: "transport",
          status: "unavailable",
          sources: [],
          features: [],
          statistics: null,
        },
      },
      area,
      modeOf("retail"),
    );

    expect(scored.categories.find(({ id }) => id === "footfall")).toEqual({
      id: "footfall",
      layer: "transport",
      status: "unavailable",
      score: null,
      breakdown: [],
    });
    expect(scoresOf(scored).competition).toBe(99);
    expect(scored.location.leftOut).toEqual([
      {
        id: "transport",
        layer: "transport",
        status: "unavailable",
        weight: 20,
      },
      {
        id: "demand",
        layer: "demographics",
        status: "not-prepared",
        weight: 25,
      },
      { id: "footfall", layer: "transport", status: "unavailable", weight: 25 },
    ]);
  });

  it("leaves out Competition and Footfall proxy, naming the Amenities Layer, when it is not prepared or unavailable", () => {
    const scored = scoreSearchArea(
      {
        ...business,
        amenities: {
          layer: "amenities",
          status: "unavailable",
          sources: [],
          features: [],
          statistics: null,
        },
      },
      area,
      modeOf("business-gym"),
    );

    expect(scored.location.leftOut.map(({ id, layer }) => [id, layer])).toEqual(
      [
        ["amenities", "amenities"],
        ["demand", "demographics"],
        ["competition", "amenities"],
        ["footfall", "amenities"],
      ],
    );
    // (57×10 + 72×20 + 80×5) ÷ 35 = 68.9
    expect(scored.location.score).toBe(69);
  });

  it("scores Competition for a Business mode added to the config alone, with its own competitors", () => {
    const pub = {
      ...modeOf("business-cafe"),
      id: "fixture-pub",
      competitors: {
        name: "restaurants and cafés",
        tags: [{ key: "amenity", values: ["restaurant", "cafe"] }],
      },
    };

    // Three over 2.03 km², 1.47 a km², falling to 0 points at the café's 12 a
    // km²: 87.7, less 10 for the café 80 m away.
    expect(scoresOf(scoreSearchArea(business, area, pub)).competition).toBe(78);
  });

  it("never scores Competition for a mode with no competitors, even if it weighs it", () => {
    const muddled = {
      ...GENERAL,
      weights: { ...GENERAL.weights, competition: 50 },
    };

    expect(idsOf(scoreSearchArea(business, area, muddled))).not.toContain(
      "competition",
    );
  });
});

describe("scoreSearchArea with the Demographics Layer", () => {
  /** `business`, with 9,000 residents estimated in the Search Area. */
  const prepared: ScoredLayers = {
    ...business,
    demographics: demographics(9_000),
  };
  const breakdownOf = (
    scored: ReturnType<typeof scoreSearchArea>,
    id: CategoryId,
  ) => scored.categories.find((category) => category.id === id)?.breakdown;

  it("counts Safety per 1,000 of the Search Area's estimated residents", () => {
    const scored = scoreSearchArea(prepared, area, GENERAL);

    // 900 crimes for 9,000 residents, 100 per 1,000: 52.9 points, and 10 for
    // an 18.2% fall.
    expect(scoresOf(scored).safety).toBe(63);
    expect(breakdownOf(scored, "safety")?.[0]).toMatchObject({
      input: "Crimes a year per 1,000 residents",
      value: 100,
      unit: "per 1,000 residents",
    });
    // Per km² without it: 442.4 per km², 47.3 points.
    expect(scoresOf(scoreSearchArea(business, area, GENERAL)).safety).toBe(57);
    expect(
      breakdownOf(scoreSearchArea(business, area, GENERAL), "safety")?.[0],
    ).toMatchObject({ input: "Crimes a year per km²", unit: "per km²" });
  });

  it("counts Competition per 1,000 of the Search Area's estimated residents", () => {
    const cafe = scoreSearchArea(prepared, area, modeOf("business-cafe"));

    // Two cafés for 9,000 residents, 0.22 per 1,000, falling to 0 points at
    // 3: 92.6, less 10 for the one 80 m away. Per km², it was 82.
    expect(scoresOf(cafe).competition).toBe(83);
    expect(breakdownOf(cafe, "competition")?.[0]).toMatchObject({
      input: "Competitors (cafés) per 1,000 residents",
      value: 0.2,
      unit: "per 1,000 residents",
    });
  });

  it("scores Demand, and each Business and Retail mode weighs it into the Location Score", () => {
    const cafe = scoreSearchArea(prepared, area, modeOf("business-cafe"));

    // 75 × 9,000 ÷ 20,000 = 33.75, +2.5 for income 5% above the median,
    // and 15 × 48 ÷ 1,000 = 0.7 for the residents 20 new homes would bring.
    expect(scoresOf(cafe)).toEqual({
      safety: 63,
      amenities: 29,
      transport: 72,
      "planning-freedom": 80,
      demand: 37,
      competition: 83,
      footfall: 4,
    });
    expect(cafe.categories.find(({ id }) => id === "demand")).toMatchObject({
      layer: "demographics",
      status: "ok",
    });
    // (63×10 + 29×5 + 72×15 + 80×5 + 37×20 + 83×25 + 4×20) ÷ 100 = 51.5
    expect(cafe.location.score).toBe(52);
    expect(cafe.location.leftOut).toEqual([]);
    expect(
      Object.fromEntries(
        SCORING_CONFIG.modes.map(({ id }) => [
          id,
          scoreSearchArea(prepared, area, modeOf(id)).location.counted.find(
            (category) => category.id === "demand",
          )?.weight ?? null,
        ]),
      ),
    ).toEqual({
      general: null,
      homebuyer: null,
      "buy-to-let": null,
      investment: null,
      development: null,
      // PRD FR-4.2.
      retail: 25,
      "business-cafe": 20,
      "business-restaurant": 20,
      "business-takeaway": 30,
      "business-gym": 25,
      "business-hairdresser": 30,
      "business-convenience-store": 35,
      "business-dental-practice": 40,
      "business-nursery": 25,
    });
  });

  it("scores Demand without planned housing while the Planning Applications are unavailable", () => {
    const cafe = scoreSearchArea(
      {
        ...prepared,
        planning: {
          ...prepared.planning,
          applications: {
            ...applications,
            status: "unavailable",
            statistics: null,
          },
        },
      },
      area,
      modeOf("business-cafe"),
    );

    expect(scoresOf(cafe).demand).toBe(36);
    expect(breakdownOf(cafe, "demand")?.[2]).toMatchObject({
      input: "Estimated new residents from Planning Applications",
      value: null,
      points: 0,
    });
  });

  it("waits for the planned housing while the Planning Applications are queued, saying so", () => {
    const cafe = scoreSearchArea(
      {
        ...prepared,
        planning: {
          ...prepared.planning,
          applications: { ...applications, status: "queued", statistics: null },
        },
      },
      area,
      modeOf("business-cafe"),
    );

    expect(cafe.categories.find(({ id }) => id === "demand")).toEqual({
      id: "demand",
      layer: "planning",
      status: "queued",
      score: null,
      breakdown: [],
    });
    expect(cafe.location.leftOut).toEqual([
      { id: "demand", layer: "planning", status: "queued", weight: 20 },
    ]);
  });

  it("falls back to per km² and leaves Demand out, naming the Demographics Layer, when it is not prepared or unavailable", () => {
    for (const status of ["not-prepared", "unavailable"] as const) {
      const scored = scoreSearchArea(
        { ...prepared, demographics: { ...NOT_PREPARED, status } },
        area,
        modeOf("business-cafe"),
      );

      expect(scoresOf(scored)).toMatchObject({
        safety: 57,
        demand: null,
        competition: 82,
      });
      expect(scored.categories.find(({ id }) => id === "demand")).toEqual({
        id: "demand",
        layer: "demographics",
        status,
        score: null,
        breakdown: [],
      });
      expect(scored.location.leftOut).toEqual([
        { id: "demand", layer: "demographics", status, weight: 20 },
      ]);
      expect(scored.location.score).toBe(54);
    }
  });

  it("counts per km² when the Demographics Layer estimates no residents", () => {
    const empty = scoreSearchArea(
      { ...prepared, demographics: demographics(0) },
      area,
      modeOf("business-cafe"),
    );

    expect(scoresOf(empty)).toMatchObject({ safety: 57, competition: 82 });
    expect(breakdownOf(empty, "safety")?.[0]?.unit).toBe("per km²");
  });
});
