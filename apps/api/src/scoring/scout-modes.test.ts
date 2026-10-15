import { describe, expect, it } from "vitest";

import {
  CATEGORY_IDS,
  DEFAULT_SCOUT_MODE,
  competitorTagText,
  isModesResponse,
  isScoutModeId,
} from "@location-scout/shared";

import { AMENITY_RULES } from "../sources/overpass-amenities";
import { modeOf } from "../testing/scout-modes";
import { SCORING_CONFIG, type ScoringConfig } from "./config";
import { findScoutMode, modesResponse } from "./scout-modes";

describe("the Scout Modes in the scoring config", () => {
  it("are PRD FR-4.2's Phase 1 modes, General first", () => {
    expect(SCORING_CONFIG.modes.map(({ id, name }) => [id, name])).toEqual([
      ["general", "General"],
      ["homebuyer", "Homebuyer"],
      ["buy-to-let", "Buy-to-let"],
      ["investment", "Investment"],
      ["development", "Development"],
      ["retail", "Retail"],
      ["business-cafe", "Business: Café"],
      ["business-restaurant", "Business: Restaurant"],
      ["business-takeaway", "Business: Takeaway"],
      ["business-gym", "Business: Gym"],
      ["business-hairdresser", "Business: Hairdresser"],
      ["business-convenience-store", "Business: Convenience store"],
      ["business-dental-practice", "Business: Dental practice"],
      ["business-nursery", "Business: Nursery"],
    ]);
    expect(SCORING_CONFIG.modes[0]?.id).toBe(DEFAULT_SCOUT_MODE);
  });

  it("each have an id fit for the URL, a question, and Highlights to apply", () => {
    for (const { id, question, highlights } of SCORING_CONFIG.modes) {
      expect(isScoutModeId(id), id).toBe(true);
      expect(question, id).toMatch(/\?$/);
      expect(highlights.length, id).toBeGreaterThan(0);
      expect(new Set(highlights).size, id).toBe(highlights.length);
    }
  });

  // PRD FR-4.2's table, in its column order: Safety, Amenities, Schools,
  // Transport, Green, Property activity, Development activity, Planning
  // freedom, Demand, Competition and Footfall. "–" is 0.
  const PRD_WEIGHTS: Record<string, readonly number[]> = {
    general: [25, 15, 10, 15, 10, 10, 5, 10, 0, 0, 0],
    homebuyer: [25, 15, 20, 15, 15, 5, 0, 5, 0, 0, 0],
    "buy-to-let": [15, 10, 10, 25, 5, 25, 5, 5, 0, 0, 0],
    investment: [10, 10, 5, 15, 5, 25, 25, 5, 0, 0, 0],
    development: [5, 5, 5, 10, 5, 15, 25, 30, 0, 0, 0],
    retail: [10, 5, 0, 20, 0, 0, 0, 5, 25, 10, 25],
    "business-cafe": [10, 5, 0, 15, 0, 0, 0, 5, 20, 25, 20],
    "business-restaurant": [10, 10, 0, 15, 0, 0, 0, 5, 20, 20, 20],
    "business-takeaway": [5, 0, 0, 10, 0, 0, 0, 5, 30, 25, 25],
    "business-gym": [10, 5, 0, 20, 0, 0, 0, 5, 25, 20, 15],
    "business-hairdresser": [10, 0, 0, 15, 0, 0, 0, 5, 30, 25, 15],
    "business-convenience-store": [10, 0, 0, 10, 0, 0, 0, 5, 35, 30, 10],
    "business-dental-practice": [10, 0, 0, 20, 0, 0, 0, 5, 40, 25, 0],
    "business-nursery": [20, 0, 10, 10, 10, 0, 0, 0, 25, 25, 0],
  };
  const PRD_COLUMNS = [
    "safety",
    "amenities",
    "schools",
    "transport",
    "green-space",
    "property-activity",
    "development-activity",
    "planning-freedom",
    "demand",
    "competition",
    "footfall",
  ] as const;

  it("give every PRD mode, each making up 100", () => {
    expect(Object.keys(PRD_WEIGHTS)).toEqual(
      SCORING_CONFIG.modes.map(({ id }) => id),
    );
    for (const [id, weights] of Object.entries(PRD_WEIGHTS)) {
      expect(
        weights.reduce((sum, weight) => sum + weight, 0),
        id,
      ).toBe(100);
    }
  });

  it.each(Object.entries(PRD_WEIGHTS))(
    "give %s the PRD's weights, for every category",
    (id, prd) => {
      expect(CATEGORY_IDS).toEqual(PRD_COLUMNS);
      expect(modeOf(id).weights).toEqual(
        Object.fromEntries(
          CATEGORY_IDS.map((category) => [
            category,
            prd[PRD_COLUMNS.indexOf(category)],
          ]),
        ),
      );
    },
  );

  // PRD FR-4.3.
  it.each([
    ["retail", "shops", ["shop=*"]],
    ["business-cafe", "cafés", ["amenity=cafe"]],
    ["business-restaurant", "restaurants", ["amenity=restaurant"]],
    ["business-takeaway", "takeaways", ["amenity=fast_food"]],
    ["business-gym", "gyms", ["leisure=fitness_centre"]],
    ["business-hairdresser", "hairdressers", ["shop=hairdresser"]],
    ["business-convenience-store", "convenience stores", ["shop=convenience"]],
    [
      "business-dental-practice",
      "dental practices",
      // The Amenities Layer counts a dentist mapped either way.
      ["amenity=dentist", "healthcare=dentist"],
    ],
    [
      "business-nursery",
      "nurseries",
      ["amenity=kindergarten", "amenity=childcare"],
    ],
  ])("give %s its competitors' OpenStreetMap tags", (id, name, tags) => {
    const { competitors } = modeOf(id);
    expect(competitors?.name).toBe(name);
    expect(competitors?.tags.flatMap(competitorTagText)).toEqual(tags);
  });

  it("give competitors to every mode that weighs Competition, and to no other", () => {
    for (const { id, weights, competitors } of SCORING_CONFIG.modes) {
      expect(competitors !== null, id).toBe(weights.competition > 0);
    }
  });

  it("give a mode its own Competition rule only if it has competitors, falling from 100 points at none", () => {
    for (const {
      id,
      competitors,
      competitionPerThousand,
    } of SCORING_CONFIG.modes) {
      if (competitionPerThousand === undefined) continue;
      expect(competitors, id).not.toBeNull();
      expect(competitionPerThousand.full, id).toBe(0);
      expect(competitionPerThousand.points, id).toBe(100);
      expect(competitionPerThousand.zero, id).toBeGreaterThan(0);
    }
  });

  it("name only competitors the Amenities Layer finds", () => {
    for (const { id, competitors } of SCORING_CONFIG.modes) {
      for (const { key, values } of competitors?.tags ?? []) {
        const rules = AMENITY_RULES.filter((rule) => rule.key === key);
        const found = (value: string) =>
          rules.some(
            (rule) => rule.values === null || rule.values.includes(value),
          );
        expect(
          values === null
            ? rules.some((rule) => rule.values === null)
            : values.every(found),
          `${id}: ${key}`,
        ).toBe(true);
      }
    }
  });

  it("highlight the Layers PRD FR-4.3a names for Development and Investment", () => {
    // Land Opportunities, Planning Constraints and Planning Applications.
    expect(modeOf("development").highlightedLayers).toEqual([
      "planning",
      "land",
    ]);
    // Sales, the change in price, and Planning Applications.
    expect(modeOf("investment").highlightedLayers).toEqual([
      "planning",
      "property",
    ]);
    for (const id of ["general", "homebuyer", "buy-to-let"]) {
      expect(modeOf(id).highlightedLayers, id).toEqual([]);
    }
  });

  it("highlight the Amenities Layer, where their competitors are, for Business and Retail", () => {
    for (const { id, competitors, highlightedLayers } of SCORING_CONFIG.modes) {
      if (competitors) expect(highlightedLayers, id).toEqual(["amenities"]);
    }
  });
});

describe("findScoutMode", () => {
  it("finds a Scout Mode by its id, and nothing for an id the config lacks", () => {
    expect(findScoutMode(SCORING_CONFIG, "investment")?.name).toBe(
      "Investment",
    );
    expect(findScoutMode(SCORING_CONFIG, "Investment")).toBeUndefined();
    expect(findScoutMode(SCORING_CONFIG, "business-florist")).toBeUndefined();
  });
});

describe("modesResponse", () => {
  it("gives every Scout Mode, its Layers and rules each in their own order", () => {
    const body = modesResponse(SCORING_CONFIG);

    expect(isModesResponse(body)).toBe(true);
    expect(body.modes.map(({ id }) => id)).toEqual(
      SCORING_CONFIG.modes.map(({ id }) => id),
    );
    expect(body.modes.find(({ id }) => id === "homebuyer")).toMatchObject({
      name: "Homebuyer",
      question: "Should I buy a home here to live in?",
      weights: {
        safety: 25,
        amenities: 15,
        schools: 20,
        transport: 15,
        "green-space": 15,
        "property-activity": 5,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
      competitors: null,
      highlightedLayers: [],
    });
    expect(body.modes.find(({ id }) => id === "business-nursery")).toEqual({
      id: "business-nursery",
      name: "Business: Nursery",
      question: "Could I open a nursery here?",
      weights: {
        safety: 20,
        amenities: 0,
        schools: 10,
        transport: 10,
        "green-space": 10,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 0,
        demand: 25,
        competition: 25,
        footfall: 0,
      },
      competitors: {
        name: "nurseries",
        tags: [{ key: "amenity", values: ["kindergarten", "childcare"] }],
      },
      highlightedLayers: ["amenities"],
      highlights: expect.arrayContaining(["no-playground"]) as unknown,
    });
  });

  it("lists a Business mode added to the config, with its competitors", () => {
    const config: ScoringConfig = {
      ...SCORING_CONFIG,
      modes: [
        ...SCORING_CONFIG.modes,
        {
          ...modeOf("business-cafe"),
          id: "fixture-pub",
          name: "Business: Pub",
          question: "Could I open a pub here?",
          competitors: {
            name: "pubs",
            tags: [{ key: "amenity", values: ["pub"] }],
          },
        },
      ],
    };

    const body = modesResponse(config);

    expect(isModesResponse(body)).toBe(true);
    expect(body.modes.at(-1)?.competitors).toEqual({
      name: "pubs",
      tags: [{ key: "amenity", values: ["pub"] }],
    });
  });

  it("lists a Scout Mode added to the config, with no other change", () => {
    const config: ScoringConfig = {
      ...SCORING_CONFIG,
      modes: [
        ...SCORING_CONFIG.modes,
        {
          id: "fixture-families",
          name: "Families",
          question: "Should I bring up a family here?",
          weights: { ...modeOf("homebuyer").weights, safety: 50 },
          competitors: null,
          highlightedLayers: ["green-space", "crime"],
          highlights: ["park-nearby", "no-playground", "crime-rate-high"],
        },
      ],
    };

    const body = modesResponse(config);

    expect(isModesResponse(body)).toBe(true);
    expect(body.modes.at(-1)).toEqual({
      id: "fixture-families",
      name: "Families",
      question: "Should I bring up a family here?",
      weights: {
        safety: 50,
        amenities: 15,
        schools: 20,
        transport: 15,
        "green-space": 15,
        "property-activity": 5,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
      competitors: null,
      highlightedLayers: ["crime", "green-space"],
      highlights: ["crime-rate-high", "park-nearby", "no-playground"],
    });
  });
});
