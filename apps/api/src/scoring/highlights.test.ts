import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  AMENITY_TYPES,
  GREEN_SPACE_TYPES,
  HIGHLIGHT_RULE_IDS,
  type AmenityType,
  type HighlightRuleId,
  type PlanningConstraintFeature,
  type ScoutModeId,
  type SearchArea,
} from "@location-scout/shared";

import { landLayerResponse } from "../layers";
import { DEFAULT_LAND_QUERY } from "../sources/land";
import { modeOf } from "../testing/scout-modes";
import { SCORING_CONFIG, type ScoringConfig } from "./config";
import { highlightSearchArea } from "./highlights";
import type { ScoredLayers } from "./scores";

const location = { lat: 53.123664, lng: -1.264078 };
/** 0.5 mile: 2.03 km². */
const area: SearchArea = {
  location,
  searchRadius: { miles: 0.5, metres: 804.672 },
};
const ok = "ok" as const;

type Crime = NonNullable<ScoredLayers["crime"]["statistics"]>;
type Transport = NonNullable<ScoredLayers["transport"]["statistics"]>;
type GreenSpace = NonNullable<ScoredLayers["green-space"]["statistics"]>;
type Property = NonNullable<ScoredLayers["property"]["statistics"]>;

const crime = (
  last12Months: number,
  change: number | null,
  missingMonths: string[] = [],
): ScoredLayers["crime"] => ({
  layer: "crime",
  status: ok,
  sources: [],
  features: [],
  statistics: {
    month: "2026-08",
    total: Math.round(last12Months / 12),
    byCategory: [],
    trend: {
      last12Months: { from: "2025-09", to: "2026-08" },
      previous12Months: { from: "2024-09", to: "2025-08" },
      complete: missingMonths.length === 0,
      missingMonths,
      total: { last12Months, previous12Months: last12Months, change },
      byCategory: [],
    },
  } satisfies Crime,
});

const constraint = (
  overrides: Partial<PlanningConstraintFeature> &
    Pick<PlanningConstraintFeature, "id" | "type" | "name">,
): PlanningConstraintFeature => ({
  location,
  distanceMetres: 0,
  grade: null,
  coversLocation: true,
  shape: null,
  ...overrides,
});

const planning = (
  features: PlanningConstraintFeature[],
): ScoredLayers["planning"] => ({
  layer: "planning",
  status: ok,
  sources: [],
  features,
  statistics: {
    byType: [],
    coveringLocation: features
      .filter(({ coversLocation }) => coversLocation)
      .map(({ type, name }) => ({ type, name })),
  },
  applications: null,
});

const floodZone = (zone: string, distanceMetres: number) =>
  constraint({
    id: `flood-zone-${zone}`,
    type: "flood-zone",
    name: `Flood zone ${zone}`,
    distanceMetres,
    coversLocation: distanceMetres === 0,
  });

const amenities = (
  counts: Partial<Record<AmenityType, number>>,
): ScoredLayers["amenities"] => {
  const byType = AMENITY_TYPES.map((type) => ({
    type,
    count: counts[type] ?? 0,
    nearest: null,
  }));
  return {
    layer: "amenities",
    status: ok,
    sources: [],
    features: [],
    statistics: {
      total: byType.reduce((sum, { count }) => sum + count, 0),
      byType,
    },
  };
};

/** One of every type of amenity but `without`. */
const amenitiesWithout = (...without: AmenityType[]) =>
  amenities(
    Object.fromEntries(
      AMENITY_TYPES.map((type) => [type, without.includes(type) ? 0 : 1]),
    ),
  );

const transport = ({
  station = 1_628,
  busStops = 6,
  carParks = 4,
}: {
  station?: number | null;
  busStops?: number;
  carParks?: number;
}): ScoredLayers["transport"] => ({
  layer: "transport",
  status: ok,
  sources: [],
  features: [],
  statistics: {
    facilities: [
      { type: "railway-station", count: 0 },
      { type: "bus-stop", count: busStops },
      { type: "car-park", count: carParks },
      { type: "ev-charger", count: 0 },
    ],
    routes: [],
    nearestStation:
      station === null
        ? null
        : {
            id: "node/1",
            name: "Sutton Parkway",
            distanceMetres: station,
            inSearchArea: station <= area.searchRadius.metres,
          },
    stationSearchMetres: 5_000,
  } satisfies Transport,
});

const greenSpace = ({
  park = 600,
  playgrounds = 1,
  name = "Sutton Lawn",
}: {
  park?: number | null;
  playgrounds?: number;
  name?: string | null;
}): ScoredLayers["green-space"] => ({
  layer: "green-space",
  status: ok,
  sources: [],
  features: [],
  statistics: {
    total: 2 + playgrounds,
    byType: GREEN_SPACE_TYPES.map((type) => ({
      type,
      count: type === "playground" ? playgrounds : 1,
    })),
    nearestPark:
      park === null
        ? null
        : {
            id: "way/1",
            name,
            distanceMetres: park,
            inSearchArea: true,
            coversLocation: park === 0,
          },
    parkSearchMetres: 2_000,
  } satisfies GreenSpace,
});

const property = ({
  sales = 24,
  change = 0,
  salesBefore = 54,
  truncated = false,
}: {
  sales?: number;
  change?: number | null;
  /** Sales in the 12 months a year before. */
  salesBefore?: number;
  truncated?: boolean;
}): ScoredLayers["property"] => ({
  layer: "property",
  status: ok,
  sources: [],
  features: [],
  epc: null,
  statistics: {
    period: { from: "2025-10-08", to: "2026-10-07" },
    all: { count: sales, median: 182_000, mean: 187_000 },
    byType: [],
    byTenure: [],
    byNewBuild: [],
    medianChange: {
      twelveMonths: {
        period: { from: "2024-10-08", to: "2025-10-07" },
        prices: { count: salesBefore, median: 160_000, mean: 165_000 },
        change,
      },
      fiveYears: {
        period: { from: "2020-10-08", to: "2021-10-07" },
        prices: null,
        change: null,
      },
    },
    postcodes: {
      searched: truncated ? 100 : 40,
      limit: 100,
      truncated,
      reachMetres: 600,
    },
  } satisfies Property,
});

/**
 * A Search Area every Layer answered for, where few rules fire: 900 crimes a
 * year (442 per km²), no change; a conservation area over the Location; one
 * of every amenity; Sutton Parkway 1,628 m away, 6 bus stops and 4 car parks;
 * a park 600 m away and a playground; 24 sales, no change in median price.
 */
const layers: ScoredLayers = {
  crime: crime(900, 0),
  planning: planning([
    constraint({
      id: "44005909",
      type: "conservation-area",
      name: "Sutton in Ashfield Church and Market Place",
    }),
  ]),
  amenities: amenitiesWithout(),
  // No Highlight reads the Schools Layer, so it may as well be not prepared.
  schools: {
    layer: "schools",
    status: "not-prepared",
    sources: [],
    features: [],
    statistics: null,
  },
  transport: transport({}),
  "green-space": greenSpace({}),
  property: property({}),
  // No Highlight reads the Land Layer.
  land: landLayerResponse({ status: "not-prepared" }, DEFAULT_LAND_QUERY),
  demographics: {
    layer: "demographics",
    status: "not-prepared",
    sources: [],
    features: [],
    statistics: null,
  },
};

/** The Demographics Layer estimating `population` residents in the Search Area. */
const residents = (population: number): ScoredLayers["demographics"] => ({
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
    householdIncome: null,
    deprivation: null,
  },
});

const highlightsOf = (
  changed: Partial<ScoredLayers>,
  mode: ScoutModeId = "general",
  config: ScoringConfig = SCORING_CONFIG,
) =>
  highlightSearchArea(
    { ...layers, ...changed },
    area,
    modeOf(mode, config),
    config,
  );

/** The Highlight `rule` gives, as its level and text, or `null` if none. */
const given = (
  rule: HighlightRuleId,
  changed: Partial<ScoredLayers>,
  mode: ScoutModeId = "general",
) => {
  const found = highlightsOf(changed, mode).highlights.find(
    (highlight) => highlight.rule === rule,
  );
  return found ? `${found.level}: ${found.text}` : null;
};

const unavailable = <L extends keyof ScoredLayers>(
  layer: L,
  status: "unavailable" | "not-prepared" = "unavailable",
) => ({ ...layers[layer], status, features: [], statistics: null });

describe("Highlight rules", () => {
  it("number at least 12, across crime, planning, transport, amenities, green space and property", () => {
    expect(HIGHLIGHT_RULE_IDS.length).toBeGreaterThanOrEqual(12);
    const all = highlightsOf({
      crime: crime(2_024, 12),
      planning: planning([floodZone("3", 0)]),
      amenities: amenities({}),
      transport: transport({ station: null, busStops: 0, carParks: 0 }),
      "green-space": greenSpace({ park: null, playgrounds: 0 }),
      property: property({ sales: 3, change: -8 }),
    }).highlights;
    expect(new Set(all.map(({ layer }) => layer))).toEqual(
      new Set([
        "crime",
        "planning",
        "amenities",
        "transport",
        "green-space",
        "property",
      ]),
    );
  });

  it("are each applied by a Scout Mode in the scoring config", () => {
    for (const id of HIGHLIGHT_RULE_IDS) {
      expect(
        SCORING_CONFIG.modes.some(({ highlights }) => highlights.includes(id)),
        id,
      ).toBe(true);
    }
  });

  it("give Highlights in every Scout Mode", () => {
    for (const { id } of SCORING_CONFIG.modes) {
      expect(highlightsOf({}, id).highlights.length, id).toBeGreaterThan(0);
    }
  });

  it("use no AI: the rules are synchronous, and import only our own code", () => {
    expect(highlightsOf({})).not.toBeInstanceOf(Promise);
    for (const file of ["./highlights.ts", "./config.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map(
        ([, from]) => from,
      );
      for (const from of imports) {
        expect(from, file).toMatch(/^(@location-scout\/shared$|\.)/);
      }
    }
  });
});

describe("crime", () => {
  // 10,000 residents: 30 per 1,000 is 300 crimes, 200 is 2,000.
  const tenThousand = residents(10_000);

  it("gives a Concern at 200 crimes a year per 1,000 residents or more", () => {
    expect(
      given("crime-rate-high", {
        crime: crime(1_999, 0),
        demographics: tenThousand,
      }),
    ).toBeNull();
    expect(
      given("crime-rate-high", {
        crime: crime(2_000, 0),
        demographics: tenThousand,
      }),
    ).toBe("concern: High crime: 200 crimes a year per 1,000 residents");
    // NG17 1AA: 2,024 crimes for the prepared fixture's 9,052 residents.
    expect(
      given("crime-rate-high", {
        crime: crime(2_024, 5.9),
        demographics: residents(9_052),
      }),
    ).toBe("concern: High crime: 224 crimes a year per 1,000 residents");
  });

  it("gives a Good at 30 crimes a year per 1,000 residents or fewer", () => {
    expect(
      given("crime-rate-low", {
        crime: crime(301, 0),
        demographics: tenThousand,
      }),
    ).toBeNull();
    expect(
      given("crime-rate-low", {
        crime: crime(300, 0),
        demographics: tenThousand,
      }),
    ).toBe("good: Low crime: 30 crimes a year per 1,000 residents");
  });

  it("judges the same crimes per resident, not per km²", () => {
    // 1,628 crimes is 800 per km², a Concern without residents to count by,
    // but only 54 per 1,000 of 30,000 residents.
    expect(given("crime-rate-high", { crime: crime(1_628, 0) })).toBe(
      "concern: High crime: 800 crimes a year per km²",
    );
    expect(
      given("crime-rate-high", {
        crime: crime(1_628, 0),
        demographics: residents(30_000),
      }),
    ).toBeNull();
  });

  // Without residents to count by, as before `pnpm data:prepare`: 0.5 mile
  // is 2.034 km². 120 per km² is 244 crimes; 800 is 1,628.
  it("without an estimate of the residents, gives a Concern at 800 crimes a year per km² or more", () => {
    expect(given("crime-rate-high", { crime: crime(1_627, 0) })).toBeNull();
    expect(given("crime-rate-high", { crime: crime(1_628, 0) })).toBe(
      "concern: High crime: 800 crimes a year per km²",
    );
    expect(given("crime-rate-high", { crime: crime(2_024, 5.9) })).toBe(
      "concern: High crime: 995 crimes a year per km²",
    );
  });

  it("without an estimate of the residents, gives a Good at 120 crimes a year per km² or fewer", () => {
    expect(given("crime-rate-low", { crime: crime(245, 0) })).toBeNull();
    expect(given("crime-rate-low", { crime: crime(244, 0) })).toBe(
      "good: Low crime: 120 crimes a year per km²",
    );
    expect(given("crime-rate-low", { crime: crime(0, null) })).toBe(
      "good: Low crime: 0 crimes a year per km²",
    );
  });

  it("scales the months data.police.uk answered for up to a year, as Safety does", () => {
    // 1,100 crimes in 11 months is 1,200 a year: 590 per km².
    expect(
      given("crime-rate-low", { crime: crime(110, null, ["2026-01"]) }),
    ).toBe("good: Low crime: 59 crimes a year per km²");
    expect(
      given("crime-rate-high", { crime: crime(1_500, null, ["2026-01"]) }),
    ).toBe("concern: High crime: 804 crimes a year per km²");
  });

  it("gives a Watch for crime up more than 5% year on year", () => {
    expect(given("crime-rising", { crime: crime(900, 5) })).toBeNull();
    expect(given("crime-rising", { crime: crime(900, 5.1) })).toBe(
      "watch: Crime up 5.1% year on year",
    );
    expect(given("crime-rising", { crime: crime(900, null) })).toBeNull();
  });

  it("gives a Good for crime down more than 5% year on year", () => {
    expect(given("crime-falling", { crime: crime(900, -5) })).toBeNull();
    expect(given("crime-falling", { crime: crime(900, -8.3) })).toBe(
      "good: Crime down 8.3% year on year",
    );
    expect(given("crime-falling", { crime: crime(900, null) })).toBeNull();
  });
});

describe("planning", () => {
  it("gives a Concern for a Location in flood zone 3, or a Watch in flood zone 2", () => {
    const rule = "flood-zone-at-location";
    expect(given(rule, {})).toBeNull();
    expect(given(rule, { planning: planning([floodZone("3", 0)]) })).toBe(
      "concern: Location is in flood zone 3",
    );
    expect(given(rule, { planning: planning([floodZone("2", 0)]) })).toBe(
      "watch: Location is in flood zone 2",
    );
    // Only the highest counts.
    expect(
      given(rule, {
        planning: planning([floodZone("2", 0), floodZone("3", 0)]),
      }),
    ).toBe("concern: Location is in flood zone 3");
    expect(given(rule, { planning: planning([floodZone("3", 40)]) })).toBe(
      null,
    );
  });

  it("gives a Watch for flood zone 3 within 500 m of a Location outside it", () => {
    const rule = "flood-zone-nearby";
    expect(given(rule, { planning: planning([floodZone("3", 340)]) })).toBe(
      "watch: Flood zone 3 within 500 m: 340 m from the Location",
    );
    expect(given(rule, { planning: planning([floodZone("3", 500)]) })).toBe(
      "watch: Flood zone 3 within 500 m: 500 m from the Location",
    );
    expect(
      given(rule, { planning: planning([floodZone("3", 501)]) }),
    ).toBeNull();
    expect(given(rule, { planning: planning([floodZone("3", 0)]) })).toBeNull();
    expect(given(rule, { planning: planning([floodZone("2", 40)]) })).toBe(
      null,
    );
  });

  it("gives a Watch for each type of Planning Constraint the Location is inside, naming them", () => {
    expect(given("conservation-area", {})).toBe(
      "watch: Location is inside a conservation area: Sutton in Ashfield Church and Market Place",
    );
    const inside = planning([
      constraint({ id: "1", type: "listed-building", name: "Town Hall" }),
      constraint({ id: "2", type: "listed-building", name: "Market Cross" }),
      constraint({ id: "3", type: "article-4-direction", name: "HMOs" }),
      constraint({ id: "4", type: "tree-preservation-zone", name: "TPO 12" }),
      constraint({
        id: "5",
        type: "conservation-area",
        name: "Nearby",
        coversLocation: false,
        distanceMetres: 200,
      }),
    ]);
    expect(given("listed-building", { planning: inside })).toBe(
      "watch: Location is inside a listed building: Town Hall and Market Cross",
    );
    expect(given("article-4-direction", { planning: inside })).toBe(
      "watch: Location is inside an Article 4 direction: HMOs",
    );
    expect(given("tree-preservation-zone", { planning: inside })).toBe(
      "watch: Location is inside a tree preservation zone: TPO 12",
    );
    expect(given("conservation-area", { planning: inside })).toBeNull();
  });

  it("gives a Good when no Planning Constraint is recorded at the Location", () => {
    expect(given("no-planning-constraints", {})).toBeNull();
    expect(
      given("no-planning-constraints", {
        planning: planning([floodZone("3", 340)]),
      }),
    ).toBe("good: No Planning Constraints recorded at the Location");
  });
});

describe("amenities", () => {
  it("gives a Watch with no convenience store or supermarket", () => {
    expect(given("no-everyday-shop", {})).toBeNull();
    expect(
      given("no-everyday-shop", { amenities: amenitiesWithout("supermarket") }),
    ).toBeNull();
    expect(
      given("no-everyday-shop", {
        amenities: amenitiesWithout("supermarket", "convenience-store"),
      }),
    ).toBe("watch: No convenience store or supermarket in the Search Area");
  });

  it("gives a Watch with no healthcare", () => {
    expect(given("no-healthcare", {})).toBeNull();
    expect(
      given("no-healthcare", { amenities: amenitiesWithout("healthcare") }),
    ).toBe("watch: No GP, pharmacy or other healthcare in the Search Area");
  });

  it("gives a Good for 10 or more of the 13 types of amenity", () => {
    const rule = "wide-range-of-amenities";
    expect(given(rule, {})).toBe(
      "good: All 13 types of amenity in the Search Area",
    );
    expect(
      given(rule, { amenities: amenitiesWithout("gym", "dentist", "office") }),
    ).toBe("good: 10 of 13 types of amenity in the Search Area");
    expect(
      given(rule, {
        amenities: amenitiesWithout("gym", "dentist", "office", "pub"),
      }),
    ).toBeNull();
  });
});

describe("transport", () => {
  it("gives a Watch with no railway station within 2 km", () => {
    const rule = "no-station-nearby";
    expect(given(rule, {})).toBeNull();
    expect(given(rule, { transport: transport({ station: 2_000 }) })).toBe(
      null,
    );
    expect(given(rule, { transport: transport({ station: 3_420 }) })).toBe(
      "watch: No railway station within 2 km. The nearest is 3.4 km away: Sutton Parkway",
    );
    expect(given(rule, { transport: transport({ station: null }) })).toBe(
      "watch: No railway station within 5 km",
    );
  });

  it("gives a Good for a railway station 800 m away or nearer", () => {
    const rule = "station-nearby";
    expect(given(rule, {})).toBeNull();
    expect(given(rule, { transport: transport({ station: 801 }) })).toBeNull();
    expect(given(rule, { transport: transport({ station: 800 }) })).toBe(
      "good: Railway station 800 m away: Sutton Parkway",
    );
    expect(given(rule, { transport: transport({ station: 52 }) })).toBe(
      "good: Railway station 50 m away: Sutton Parkway",
    );
  });

  it("gives a Watch for 2 bus stops or fewer", () => {
    const rule = "few-bus-stops";
    expect(given(rule, { transport: transport({ busStops: 3 }) })).toBeNull();
    expect(given(rule, { transport: transport({ busStops: 2 }) })).toBe(
      "watch: Few bus stops: 2 bus stops in the Search Area",
    );
    expect(given(rule, { transport: transport({ busStops: 1 }) })).toBe(
      "watch: Few bus stops: 1 bus stop in the Search Area",
    );
    expect(given(rule, { transport: transport({ busStops: 0 }) })).toBe(
      "watch: No bus stops in the Search Area",
    );
  });

  it("gives a Good for 10 bus stops or more", () => {
    const rule = "good-bus-service";
    expect(given(rule, { transport: transport({ busStops: 9 }) })).toBeNull();
    expect(given(rule, { transport: transport({ busStops: 10 }) })).toBe(
      "good: 10 bus stops in the Search Area",
    );
    expect(given(rule, { transport: transport({ busStops: 58 }) })).toBe(
      "good: 58 bus stops in the Search Area",
    );
  });

  it("gives a Watch for limited parking: 1 car park or none", () => {
    const rule = "limited-parking";
    expect(given(rule, { transport: transport({ carParks: 2 }) })).toBeNull();
    expect(given(rule, { transport: transport({ carParks: 1 }) })).toBe(
      "watch: Limited parking: 1 car park in the Search Area",
    );
    expect(given(rule, { transport: transport({ carParks: 0 }) })).toBe(
      "watch: Limited parking: no car parks in the Search Area",
    );
  });
});

describe("green space", () => {
  it("gives a Watch with no park within 1 km", () => {
    const rule = "no-park-nearby";
    expect(given(rule, {})).toBeNull();
    expect(
      given(rule, { "green-space": greenSpace({ park: 1_000 }) }),
    ).toBeNull();
    expect(given(rule, { "green-space": greenSpace({ park: 1_240 }) })).toBe(
      "watch: No park within 1 km. The nearest is 1.2 km away: Sutton Lawn",
    );
    expect(
      given(rule, { "green-space": greenSpace({ park: 1_240, name: null }) }),
    ).toBe("watch: No park within 1 km. The nearest is 1.2 km away");
    expect(given(rule, { "green-space": greenSpace({ park: null }) })).toBe(
      "watch: No park within 2 km",
    );
  });

  it("gives a Good for a park 300 m away or nearer, or around the Location", () => {
    const rule = "park-nearby";
    expect(given(rule, { "green-space": greenSpace({ park: 301 }) })).toBe(
      null,
    );
    expect(given(rule, { "green-space": greenSpace({ park: 300 }) })).toBe(
      "good: Park 300 m away: Sutton Lawn",
    );
    expect(given(rule, { "green-space": greenSpace({ park: 0 }) })).toBe(
      "good: Location is in a park: Sutton Lawn",
    );
    expect(given(rule, { "green-space": greenSpace({ park: null }) })).toBe(
      null,
    );
  });

  it("gives a Watch with no playground, for a homebuyer", () => {
    const none = { "green-space": greenSpace({ playgrounds: 0 }) };
    expect(given("no-playground", {}, "homebuyer")).toBeNull();
    expect(given("no-playground", none, "homebuyer")).toBe(
      "watch: No playground in the Search Area",
    );
    expect(given("no-playground", none, "general")).toBeNull();
  });
});

describe("property", () => {
  it("gives a Watch for the median price down more than 5% on a year before", () => {
    const rule = "prices-falling";
    expect(given(rule, { property: property({ change: -5 }) })).toBeNull();
    expect(given(rule, { property: property({ change: -6.2 }) })).toBe(
      "watch: Median price down 6.2% on a year before",
    );
    expect(given(rule, { property: property({ change: null }) })).toBeNull();
  });

  // 20 sales, tuned from 10 on 20 real Locations.
  it("gives no change in median price from fewer than 20 sales in either 12 months", () => {
    const changed = (sales: number, salesBefore: number) =>
      given("prices-falling", {
        property: property({ change: -42.3, sales, salesBefore }),
      });
    expect(changed(20, 20)).toBe(
      "watch: Median price down 42.3% on a year before",
    );
    expect(changed(19, 54)).toBeNull();
    expect(changed(24, 19)).toBeNull();
    // Camden Town's 14 sales, down 51.8%.
    expect(changed(14, 30)).toBeNull();
    expect(
      given("prices-rising", {
        property: property({ change: 13.8, sales: 1, salesBefore: 1 }),
      }),
    ).toBeNull();
  });

  it("gives a Good for the median price up more than 5% on a year before", () => {
    const rule = "prices-rising";
    expect(given(rule, { property: property({ change: 5 }) })).toBeNull();
    expect(given(rule, { property: property({ change: 13.8 }) })).toBe(
      "good: Median price up 13.8% on a year before",
    );
    expect(given(rule, { property: property({ change: null }) })).toBeNull();
  });

  it("gives a Watch for a quiet market, fewer than 10 sales, unless the Search Area was cut short", () => {
    const rule = "quiet-market";
    expect(given(rule, { property: property({ sales: 10 }) })).toBeNull();
    expect(given(rule, { property: property({ sales: 9 }) })).toBe(
      "watch: Quiet market: 9 sales in the last 12 months",
    );
    expect(given(rule, { property: property({ sales: 1 }) })).toBe(
      "watch: Quiet market: 1 sale in the last 12 months",
    );
    expect(given(rule, { property: property({ sales: 0 }) })).toBe(
      "watch: Quiet market: no sales in the last 12 months",
    );
    expect(
      given(rule, { property: property({ sales: 3, truncated: true }) }),
    ).toBeNull();
  });

  it("gives a Good for an active market, 60 sales or more", () => {
    const rule = "active-market";
    expect(given(rule, { property: property({ sales: 59 }) })).toBeNull();
    expect(given(rule, { property: property({ sales: 60 }) })).toBe(
      "good: Active market: 60 sales in the last 12 months",
    );
    expect(
      given(rule, { property: property({ sales: 120, truncated: true }) }),
    ).toBe("good: Active market: at least 120 sales in the last 12 months");
  });
});

describe("highlightSearchArea", () => {
  const busy: Partial<ScoredLayers> = {
    crime: crime(2_024, 5.9),
    planning: planning([floodZone("2", 0), floodZone("3", 120)]),
    transport: transport({ station: 400, busStops: 58, carParks: 0 }),
    "green-space": greenSpace({ park: 104, playgrounds: 0 }),
    property: property({ sales: 24, change: 13.8, truncated: true }),
  };

  it("gives Concerns first, then Watches, then Goods, each in rule order", () => {
    expect(highlightsOf(busy)).toEqual({
      mode: "general",
      highlights: [
        {
          rule: "crime-rate-high",
          level: "concern",
          text: "High crime: 995 crimes a year per km²",
          layer: "crime",
        },
        {
          rule: "crime-rising",
          level: "watch",
          text: "Crime up 5.9% year on year",
          layer: "crime",
        },
        {
          rule: "flood-zone-at-location",
          level: "watch",
          text: "Location is in flood zone 2",
          layer: "planning",
        },
        {
          rule: "flood-zone-nearby",
          level: "watch",
          text: "Flood zone 3 within 500 m: 120 m from the Location",
          layer: "planning",
        },
        {
          rule: "limited-parking",
          level: "watch",
          text: "Limited parking: no car parks in the Search Area",
          layer: "transport",
        },
        {
          rule: "wide-range-of-amenities",
          level: "good",
          text: "All 13 types of amenity in the Search Area",
          layer: "amenities",
        },
        {
          rule: "station-nearby",
          level: "good",
          text: "Railway station 400 m away: Sutton Parkway",
          layer: "transport",
        },
        {
          rule: "good-bus-service",
          level: "good",
          text: "58 bus stops in the Search Area",
          layer: "transport",
        },
        {
          rule: "park-nearby",
          level: "good",
          text: "Park 100 m away: Sutton Lawn",
          layer: "green-space",
        },
        {
          rule: "prices-rising",
          level: "good",
          text: "Median price up 13.8% on a year before",
          layer: "property",
        },
      ],
      leftOut: [],
    });
  });

  it("gives only the rules the Scout Mode applies", () => {
    const rules = (mode: ScoutModeId) =>
      highlightsOf(busy, mode).highlights.map(({ rule }) => rule);
    // A homebuyer is told about playgrounds, not about rising prices.
    expect(rules("homebuyer")).toContain("no-playground");
    expect(rules("homebuyer")).not.toContain("prices-rising");
    expect(rules("general")).not.toContain("no-playground");
    // A developer is told about the market, not about parking, parks or
    // amenities nearby.
    expect(rules("development")).toEqual([
      "crime-rate-high",
      "crime-rising",
      "flood-zone-at-location",
      "flood-zone-nearby",
      "station-nearby",
      "good-bus-service",
      "prices-rising",
    ]);
    expect(rules("investment")).not.toContain("limited-parking");
    expect(highlightsOf(busy, "development").mode).toBe("development");
  });

  it("follows a Scout Mode's Highlights as the config sets them", () => {
    const config: ScoringConfig = {
      ...SCORING_CONFIG,
      modes: SCORING_CONFIG.modes.map((mode) =>
        mode.id === "general"
          ? { ...mode, highlights: [...mode.highlights, "no-playground"] }
          : mode,
      ),
    };
    const rules = (mode: ScoutModeId) =>
      highlightsOf(busy, mode, config).highlights.map(({ rule }) => rule);
    expect(rules("general")).toContain("no-playground");
    expect(rules("buy-to-let")).not.toContain("no-playground");
  });

  it("applies the rules of a Scout Mode added to the config alone", () => {
    const config: ScoringConfig = {
      ...SCORING_CONFIG,
      modes: [
        ...SCORING_CONFIG.modes,
        {
          id: "fixture-families",
          name: "Families",
          question: "Should I bring up a family here?",
          weights: modeOf("homebuyer").weights,
          competitors: null,
          highlightedLayers: ["green-space"],
          highlights: ["no-playground", "park-nearby", "crime-rate-high"],
        },
      ],
    };

    expect(highlightsOf(busy, "fixture-families", config)).toEqual({
      mode: "fixture-families",
      highlights: [
        {
          rule: "crime-rate-high",
          level: "concern",
          text: "High crime: 995 crimes a year per km²",
          layer: "crime",
        },
        {
          rule: "no-playground",
          level: "watch",
          text: "No playground in the Search Area",
          layer: "green-space",
        },
        {
          rule: "park-nearby",
          level: "good",
          text: "Park 100 m away: Sutton Lawn",
          layer: "green-space",
        },
      ],
      leftOut: [],
    });
  });

  it("follows a threshold as the config sets it, with no other change", () => {
    const config: ScoringConfig = {
      ...SCORING_CONFIG,
      highlights: {
        ...SCORING_CONFIG.highlights,
        "station-nearby": {
          ...SCORING_CONFIG.highlights["station-nearby"],
          metres: 2_000,
        },
      },
    };
    expect(
      highlightsOf({}, "general", config).highlights.find(
        ({ rule }) => rule === "station-nearby",
      ),
    ).toEqual({
      rule: "station-nearby",
      level: "good",
      text: "Railway station 1.6 km away: Sutton Parkway",
      layer: "transport",
    });
    expect(
      highlightsOf({}).highlights.some(({ rule }) => rule === "station-nearby"),
    ).toBe(false);
  });

  it("leaves out an unavailable Layer's Highlights, and says so", () => {
    const result = highlightsOf({
      ...busy,
      crime: unavailable("crime"),
      property: unavailable("property", "not-prepared"),
    });
    expect(result.highlights.map(({ layer }) => layer)).not.toContain("crime");
    expect(result.highlights.map(({ layer }) => layer)).not.toContain(
      "property",
    );
    expect(result.highlights.length).toBeGreaterThan(0);
    expect(result.leftOut).toEqual([
      { layer: "crime", status: "unavailable" },
      { layer: "property", status: "not-prepared" },
    ]);
  });

  it("lists only the Layers left out whose rules the Scout Mode applies", () => {
    const config: ScoringConfig = {
      ...SCORING_CONFIG,
      modes: [
        ...SCORING_CONFIG.modes,
        {
          ...modeOf("general"),
          id: "crime-only",
          highlights: ["crime-rising"],
        },
      ],
    };
    // No rule of the crime-only mode reads the Property Layer.
    expect(
      highlightsOf({ property: unavailable("property") }, "crime-only", config)
        .leftOut,
    ).toEqual([]);
    expect(
      highlightsOf({ property: unavailable("property") }, "investment").leftOut,
    ).toEqual([{ layer: "property", status: "unavailable" }]);
  });

  it("gives the same Highlights for the same figures, every time", () => {
    const copy = structuredClone({ ...layers, ...busy });
    expect(
      JSON.stringify(highlightSearchArea(copy, area, modeOf("general"))),
    ).toBe(JSON.stringify(highlightsOf(busy)));
  });
});
