import type {
  AmenityType,
  CategoryId,
  OfstedGrade,
  Competitors,
  HighlightLevel,
  HighlightRuleId,
  LayerId,
  PlanningConstraintType,
  ScoutModeId,
  TransportFacilityType,
} from "@location-scout/shared";

/*
 * Every threshold, penalty and weight the scores use, in one place (PRD
 * FR-3.5), the Highlights' rules beside them (FR-3.7), and the Scout Modes
 * that weigh the scores, name their competitors and choose the Highlights
 * (FR-4.2, FR-4.3). Phase 1 has no
 * regional averages to compare with, so these are fixed starting points from
 * PRD §6.4, to be tuned against real Locations. Tuning one means changing it
 * here, and nowhere else: the rules in `category-scores.ts` and
 * `highlights.ts`, the text of each breakdown and each Highlight are written
 * from it. Adding a Scout Mode means adding it to `modes`, and nowhere else
 * (FR-4.5).
 */

/**
 * Points that fall in proportion as a figure grows: `points` at `full` or
 * less, 0 at `zero` or more, and in proportion between.
 */
export interface FallingRule {
  full: number;
  zero: number;
  points: number;
}

/** `points` shared out over a count, up to `cap`: more counts for nothing. */
export interface CappedCountRule {
  cap: number;
  points: number;
}

/** A rule that fires when a figure is past `percent`, up or down. */
interface PercentRule {
  percent: number;
}

/** A rule that fires when something is `metres` away or nearer, or further. */
interface DistanceRule {
  metres: number;
}

/** A rule that fires at a count of `count` or more, or `count` or fewer. */
interface CountRule {
  count: number;
}

/**
 * The thresholds of every Highlight rule that has them, one entry a rule.
 * Each Highlight comes from one Layer's figures, so it shows only while that
 * Layer is `ok`. The rules with no thresholds are described in `highlights.ts`.
 * Which rules apply is up to each Scout Mode's `highlights`.
 */
export interface HighlightsConfig {
  /**
   * Concern: crimes a year per 1,000 residents of `perThousand` or more,
   * counted as Safety counts them: per km² when the Demographics Layer has no
   * residents to count by.
   */
  "crime-rate-high": { perThousand: number };
  /** Good: `perThousand` or fewer. */
  "crime-rate-low": { perThousand: number };
  /** Watch: crime up more than `percent` on the 12 months before. */
  "crime-rising": PercentRule;
  /** Good: crime down more than `percent`. */
  "crime-falling": PercentRule;
  /**
   * The highest flood zone the Location is inside, highest first, and how
   * its Highlight reads.
   */
  "flood-zone-at-location": {
    zones: readonly { zone: string; level: HighlightLevel }[];
  };
  /** Watch: `zone` within `metres` of a Location that isn't inside it. */
  "flood-zone-nearby": DistanceRule & { zone: string };
  /** Good: `count` or more of the types of amenity in the Search Area. */
  "wide-range-of-amenities": CountRule;
  /** Watch: no railway station `metres` away or nearer. */
  "no-station-nearby": DistanceRule;
  /** Good: a railway station `metres` away or nearer. */
  "station-nearby": DistanceRule;
  /** Watch: `count` bus stops or fewer in the Search Area. */
  "few-bus-stops": CountRule;
  /** Good: `count` bus stops or more. */
  "good-bus-service": CountRule;
  /** Watch: `count` car parks or fewer in the Search Area. */
  "limited-parking": CountRule;
  /** Watch: no park `metres` away or nearer. */
  "no-park-nearby": DistanceRule;
  /** Good: a park `metres` away or nearer, or around the Location. */
  "park-nearby": DistanceRule;
  /**
   * Watch: the median price down more than `percent` on a year before, with
   * `sales` or more in each 12 months, so a sale or two can't move it.
   */
  "prices-falling": PercentRule & { sales: number };
  /** Good: the median price up more than `percent`, with `sales` or more in each 12 months. */
  "prices-rising": PercentRule & { sales: number };
  /**
   * Watch: fewer than `count` sales in the last 12 months. Not given when
   * postcodes.io cut the Search Area short, as there may be more.
   */
  "quiet-market": CountRule;
  /** Good: `count` sales or more in the last 12 months. */
  "active-market": CountRule;
}

/**
 * Something that brings people past, for Footfall proxy: amenities of some
 * types, or transport stops of some types, each counting `weight` towards the
 * weighted count.
 */
export type FootfallGenerator = {
  /** As the breakdown names them, for example "Bus stops". */
  name: string;
  weight: number;
} & (
  | { layer: "amenities"; types: readonly AmenityType[] }
  | { layer: "transport"; types: readonly TransportFacilityType[] }
);

export interface ScoringConfig {
  /**
   * Residents per km² taken to turn a rate per 1,000 residents into a rate
   * per km², when the Demographics Layer has no estimate of the Search
   * Area's residents because it is not prepared or unavailable: for Safety,
   * the crime Highlights and Competition. A town's density, so that a town
   * centre is judged as it would be per resident.
   */
  residentsPerKm2: number;
  safety: {
    /**
     * Crimes a year per 1,000 residents: 90 points at 30 or fewer, 0 at 200
     * or more.
     */
    ratePerThousand: FallingRule;
    /**
     * Points added for a year-on-year fall of more than `percent`, or taken
     * away for a rise of more than `percent`.
     */
    trend: { percent: number; points: number };
  };
  amenities: {
    /** Points shared out over the types of amenity, for each type present. */
    typeCoverage: { points: number };
    count: CappedCountRule;
  };
  schools: {
    /**
     * Metres to the nearest primary school, and to the nearest secondary,
     * each scaling to 0 at three times the distance that earns full points.
     */
    primary: FallingRule;
    secondary: FallingRule;
    /**
     * Points shared equally between the latest Ofsted judgements of the
     * nearest primary and the nearest secondary school, each given the share
     * of its half that its grade earns: its overall grade's, or the mean of
     * the areas it graded if it has no overall grade, as a report card has
     * none. None if its safeguarding was not found effective, or met.
     */
    ofsted: { points: number; grades: Readonly<Record<OfstedGrade, number>> };
  };
  transport: {
    /** Metres to the nearest railway station. */
    station: FallingRule;
    busStops: CappedCountRule;
  };
  greenSpace: {
    /** Metres to the nearest park. */
    park: FallingRule;
    count: CappedCountRule;
  };
  propertyActivity: {
    /** Sales in the last 12 months: market liquidity, not quality. */
    sales: CappedCountRule;
  };
  developmentActivity: {
    /**
     * The Planning Applications received in the Search Area in the last 3
     * years, a major one counting `majorWeight` and any other 1: points in
     * proportion to the weighted count, up to `cap`. It indicates change,
     * not quality.
     */
    applications: CappedCountRule;
    majorWeight: number;
  };
  planningFreedom: {
    start: number;
    /** Points taken away if the Location is inside one or more of each type. */
    penalties: Readonly<
      Record<Exclude<PlanningConstraintType, "flood-zone">, number>
    >;
    /**
     * Points taken away for the highest flood zone the Location is inside,
     * highest first: only one is taken.
     */
    floodZones: readonly { zone: string; penalty: number }[];
  };
  demand: {
    /**
     * The Search Area's estimated residents, from the Demographics Layer:
     * points in proportion, up to `cap`.
     */
    population: CappedCountRule;
    /**
     * Points added in proportion as the Search Area's average household
     * income is above the England median, up to `points` at `percent` above,
     * or taken away as it is below.
     */
    income: { percent: number; points: number };
    /**
     * The residents the approved and pending Planning Applications in the
     * Search Area would bring, estimated from the homes they propose (PRD
     * FR-2.2): points in proportion, up to `cap`.
     */
    plannedResidents: CappedCountRule;
  };
  competition: {
    /**
     * The Scout Mode's competitors per 1,000 residents: 100 points at none, 0
     * at 1 or more, unless the mode gives its own (`competitionPerThousand`).
     * Counted per km² at `residentsPerKm2` when the Demographics Layer has no
     * residents to count by.
     */
    ratePerThousand: FallingRule;
    /** Points taken away if a competitor is `metres` away or nearer. */
    nearby: { metres: number; points: number };
  };
  footfall: {
    /**
     * What brings people past (PRD §6.4: shops, offices, transport stops and
     * schools), each counting its `weight` towards the weighted count.
     * Schools join with the Schools Layer.
     */
    generators: readonly FootfallGenerator[];
    /** Points for the weighted count, up to `cap`. */
    count: CappedCountRule;
  };
  highlights: HighlightsConfig;
  /**
   * The Scout Modes the user can pick from, General first (PRD §6.5). Each is
   * config only: adding one here adds it to `/api/modes`, the selector, the
   * scores and the Highlights, with no other change (FR-4.5).
   */
  modes: readonly ScoutModeConfig[];
}

/** A Scout Mode: the question it answers, and how it changes what is shown. */
export interface ScoutModeConfig {
  /** Lower-case words joined by hyphens, kept in the URL as `mode`. */
  id: ScoutModeId;
  name: string;
  question: string;
  /**
   * Each Category Score's weight in the Location Score, from PRD FR-4.2.
   * The weights are renormalised over the categories available
   * (`location-score.ts` in `packages/shared`). A category given 0 counts
   * for nothing.
   */
  weights: Readonly<Record<CategoryId, number>>;
  /**
   * The businesses a Business or Retail mode competes with (FR-4.3): what
   * they are called, and the OpenStreetMap tags that make an amenity one.
   * Each tag must be one the Amenities Layer finds (`AMENITY_RULES`). They
   * make the Competition score, and the map highlights them. `null` for a
   * mode that isn't for opening a business, which can't weigh Competition.
   */
  competitors: Competitors | null;
  /**
   * Its competitors per 1,000 residents and the points they leave, in place
   * of `competition.ratePerThousand`, for a business far commoner than one
   * per 1,000 residents, as shops, cafés and takeaways are. Left out, the
   * default applies.
   */
  competitionPerThousand?: FallingRule;
  /**
   * The Layers it highlights (FR-4.3a). A Layer not built yet is named here
   * all the same, and highlighted once it is.
   */
  highlightedLayers: readonly LayerId[];
  /**
   * The Highlight rules it applies (FR-3.7), in any order: they are applied
   * in the order of `HIGHLIGHT_RULE_IDS`.
   */
  highlights: readonly HighlightRuleId[];
}

/**
 * The Highlights every Scout Mode gives: crime, flood risk, protected
 * buildings, and getting about.
 */
const EVERYWHERE: readonly HighlightRuleId[] = [
  "crime-rate-high",
  "crime-rate-low",
  "crime-rising",
  "crime-falling",
  "flood-zone-at-location",
  "flood-zone-nearby",
  "conservation-area",
  "listed-building",
  "no-station-nearby",
  "station-nearby",
  "few-bus-stops",
  "good-bus-service",
];

/** What the property market is doing, for those who own, let or build. */
const MARKET: readonly HighlightRuleId[] = [
  "no-planning-constraints",
  "prices-rising",
  "quiet-market",
  "active-market",
];

/** What living somewhere is like, for those who live in or let a home. */
const LIVING: readonly HighlightRuleId[] = [
  "no-everyday-shop",
  "no-healthcare",
  "wide-range-of-amenities",
  "no-park-nearby",
  "park-nearby",
];

/**
 * What opening a business needs to know: getting there, parking, and whether
 * an Article 4 direction takes away the right to change a building's use.
 */
const BUSINESS: readonly HighlightRuleId[] = [
  ...EVERYWHERE,
  "article-4-direction",
  "limited-parking",
];

export const SCORING_CONFIG: ScoringConfig = {
  residentsPerKm2: 4_000,
  safety: {
    ratePerThousand: { full: 30, zero: 200, points: 90 },
    trend: { percent: 10, points: 10 },
  },
  amenities: {
    typeCoverage: { points: 70 },
    count: { cap: 100, points: 30 },
  },
  schools: {
    // Three times 800 m and 2 km (PRD §6.4), as far as the Schools Layer
    // looks for the nearest of each.
    primary: { full: 800, zero: 2_400, points: 40 },
    secondary: { full: 2_000, zero: 6_000, points: 25 },
    ofsted: {
      points: 35,
      // Starting points, to be tuned. The report card's expected standard is
      // taken to be as good as a Good grade, needing attention as requiring
      // improvement, and urgent improvement as inadequate.
      grades: {
        outstanding: 1,
        good: 0.75,
        "requires-improvement": 0.25,
        inadequate: 0,
        exceptional: 1,
        "strong-standard": 0.9,
        "expected-standard": 0.75,
        "needs-attention": 0.25,
        "urgent-improvement": 0,
      },
    },
  },
  transport: {
    station: { full: 800, zero: 5_000, points: 60 },
    busStops: { cap: 10, points: 40 },
  },
  greenSpace: {
    park: { full: 300, zero: 2_000, points: 70 },
    count: { cap: 10, points: 30 },
  },
  propertyActivity: {
    // Tuned on 20 real Locations (docs/phase-1-success-checks): PRD §6.4's
    // 100 sales was never reached, the most being 65, as postcodes.io gives
    // a Search Area's nearest 100 postcodes at most (FR-2.8), whose homes
    // see about 60 sales a year.
    sales: { cap: 60, points: 100 },
  },
  developmentActivity: {
    // PRD §6.4: linear on the weighted count, capped. Tuned on 20 real
    // Locations (docs/phase-1-success-checks): at PRD §6.4's 100, 9 of the
    // 20 scored 100, every town and city, and a Cotswold village with 143.
    // At 250 a town's 100 to 140 score about half, and only a city's
    // hundreds score 100.
    applications: { cap: 250, points: 100 },
    majorWeight: 5,
  },
  planningFreedom: {
    start: 100,
    penalties: {
      "conservation-area": 20,
      "listed-building": 20,
      "article-4-direction": 15,
      "tree-preservation-zone": 5,
    },
    floodZones: [
      { zone: "3", penalty: 40 },
      { zone: "2", penalty: 20 },
    ],
  },
  demand: {
    // 75 + 10 for income + 15 for planned housing make 100.
    population: { cap: 20_000, points: 75 },
    income: { percent: 20, points: 10 },
    // A starting point, to be tuned: 1,000 new residents, about 420 homes,
    // is a town's worth of growth within a Search Area.
    plannedResidents: { cap: 1_000, points: 15 },
  },
  competition: {
    // PRD §6.4's, for the businesses rarer than one per 1,000 residents:
    // gyms, dental practices and nurseries. The commoner have their own.
    ratePerThousand: { full: 0, zero: 1, points: 100 },
    nearby: { metres: 100, points: 10 },
  },
  footfall: {
    // Starting points, to be tuned: a railway station brings as many people
    // past as ten shops or bus stops.
    generators: [
      {
        name: "Shops",
        layer: "amenities",
        types: ["shop", "convenience-store", "supermarket", "hairdresser"],
        weight: 1,
      },
      { name: "Offices", layer: "amenities", types: ["office"], weight: 1 },
      { name: "Bus stops", layer: "transport", types: ["bus-stop"], weight: 1 },
      {
        name: "Railway stations",
        layer: "transport",
        types: ["railway-station"],
        weight: 10,
      },
    ],
    count: { cap: 250, points: 100 },
  },
  highlights: {
    // Safety's thresholds: 0 points at 200 per 1,000 residents, 90 at 30.
    "crime-rate-high": { perThousand: 200 },
    "crime-rate-low": { perThousand: 30 },
    "crime-rising": { percent: 5 },
    "crime-falling": { percent: 5 },
    "flood-zone-at-location": {
      zones: [
        { zone: "3", level: "concern" },
        { zone: "2", level: "watch" },
      ],
    },
    "flood-zone-nearby": { zone: "3", metres: 500 },
    "wide-range-of-amenities": { count: 10 },
    "no-station-nearby": { metres: 2_000 },
    // Transport's full points for a station.
    "station-nearby": { metres: 800 },
    "few-bus-stops": { count: 2 },
    // Transport's full points for bus stops.
    "good-bus-service": { count: 10 },
    "limited-parking": { count: 1 },
    "no-park-nearby": { metres: 1_000 },
    // Green space's full points for a park.
    "park-nearby": { metres: 300 },
    // Tuned on 20 real Locations (docs/phase-1-success-checks): with 10
    // sales the four largest changes, of 23% to 52%, came from 10 to 18
    // sales, a few flats or houses moving the median rather than the market.
    "prices-falling": { percent: 5, sales: 20 },
    "prices-rising": { percent: 5, sales: 20 },
    "quiet-market": { count: 10 },
    // Property activity's full points.
    "active-market": { count: 60 },
  },
  // Weights from PRD FR-4.2. Competitors from FR-4.3: each Business and
  // Retail mode highlights its own, among the Amenities Layer's Features.
  // Tuned on 20 real Locations (docs/phase-1-success-checks): at PRD §6.4's
  // one per 1,000 residents, Competition was 0 wherever there was a high
  // street for shops, cafés, restaurants, takeaways, hairdressers and
  // convenience stores, the towns and suburbs surveyed having 1 to 3 cafés,
  // 1 to 2 takeaways and 5 to 16 shops per 1,000. Each of those modes falls
  // to 0 at about twice the rate of the towns surveyed, so a typical high
  // street scores about half.
  modes: [
    {
      id: "general",
      name: "General",
      question: "What is it like here?",
      weights: {
        safety: 25,
        amenities: 15,
        schools: 10,
        transport: 15,
        "green-space": 10,
        "property-activity": 10,
        "development-activity": 5,
        "planning-freedom": 10,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
      competitors: null,
      highlightedLayers: [],
      highlights: [
        ...EVERYWHERE,
        "article-4-direction",
        "tree-preservation-zone",
        "limited-parking",
        "prices-falling",
        ...MARKET,
        ...LIVING,
      ],
    },
    {
      id: "homebuyer",
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
      // Rising prices suit an owner or an investor more than a buyer.
      highlights: [
        ...EVERYWHERE,
        "article-4-direction",
        "tree-preservation-zone",
        "limited-parking",
        "prices-falling",
        ...LIVING,
        "no-playground",
      ],
    },
    {
      id: "buy-to-let",
      name: "Buy-to-let",
      question: "Should I buy a home here to let?",
      weights: {
        safety: 15,
        amenities: 10,
        schools: 10,
        transport: 25,
        "green-space": 5,
        "property-activity": 25,
        "development-activity": 5,
        "planning-freedom": 5,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
      competitors: null,
      highlightedLayers: [],
      highlights: [
        ...EVERYWHERE,
        "article-4-direction",
        "prices-falling",
        ...MARKET,
        ...LIVING,
      ],
    },
    {
      // Its "what's changing?" inputs arrive with history in Phase 3.
      id: "investment",
      name: "Investment",
      question: "Should I invest in property here?",
      weights: {
        safety: 10,
        amenities: 10,
        schools: 5,
        transport: 15,
        "green-space": 5,
        "property-activity": 25,
        "development-activity": 25,
        "planning-freedom": 5,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
      competitors: null,
      // Planning for its Planning Applications, Property for its sales and
      // change in price (FR-4.3a).
      highlightedLayers: ["planning", "property"],
      highlights: [
        ...EVERYWHERE,
        "article-4-direction",
        "prices-falling",
        ...MARKET,
        "wide-range-of-amenities",
      ],
    },
    {
      id: "development",
      name: "Development",
      question: "Could I build here?",
      weights: {
        safety: 5,
        amenities: 5,
        schools: 5,
        transport: 10,
        "green-space": 5,
        "property-activity": 15,
        "development-activity": 25,
        "planning-freedom": 30,
        demand: 0,
        competition: 0,
        footfall: 0,
      },
      competitors: null,
      // Planning for its Planning Constraints and Planning Applications,
      // Land for its Land Opportunities (FR-4.3a).
      highlightedLayers: ["planning", "land"],
      highlights: [
        ...EVERYWHERE,
        "article-4-direction",
        "tree-preservation-zone",
        "prices-falling",
        ...MARKET,
      ],
    },
    {
      id: "retail",
      name: "Retail",
      question: "Could I open a shop here?",
      weights: {
        safety: 10,
        amenities: 5,
        schools: 0,
        transport: 20,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 25,
        competition: 10,
        footfall: 25,
      },
      competitors: {
        name: "shops",
        tags: [{ key: "shop", values: null }],
      },
      competitionPerThousand: { full: 0, zero: 20, points: 100 },
      highlightedLayers: ["amenities"],
      highlights: BUSINESS,
    },
    {
      id: "business-cafe",
      name: "Business: Café",
      question: "Could I open a café here?",
      weights: {
        safety: 10,
        amenities: 5,
        schools: 0,
        transport: 15,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 20,
        competition: 25,
        footfall: 20,
      },
      competitors: {
        name: "cafés",
        tags: [{ key: "amenity", values: ["cafe"] }],
      },
      competitionPerThousand: { full: 0, zero: 3, points: 100 },
      highlightedLayers: ["amenities"],
      highlights: BUSINESS,
    },
    {
      id: "business-restaurant",
      name: "Business: Restaurant",
      question: "Could I open a restaurant here?",
      weights: {
        safety: 10,
        amenities: 10,
        schools: 0,
        transport: 15,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 20,
        competition: 20,
        footfall: 20,
      },
      competitors: {
        name: "restaurants",
        tags: [{ key: "amenity", values: ["restaurant"] }],
      },
      competitionPerThousand: { full: 0, zero: 3, points: 100 },
      highlightedLayers: ["amenities"],
      highlights: BUSINESS,
    },
    {
      id: "business-takeaway",
      name: "Business: Takeaway",
      question: "Could I open a takeaway here?",
      weights: {
        safety: 5,
        amenities: 0,
        schools: 0,
        transport: 10,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 30,
        competition: 25,
        footfall: 25,
      },
      competitors: {
        name: "takeaways",
        tags: [{ key: "amenity", values: ["fast_food"] }],
      },
      competitionPerThousand: { full: 0, zero: 4, points: 100 },
      highlightedLayers: ["amenities"],
      highlights: BUSINESS,
    },
    {
      id: "business-gym",
      name: "Business: Gym",
      question: "Could I open a gym here?",
      weights: {
        safety: 10,
        amenities: 5,
        schools: 0,
        transport: 20,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 25,
        competition: 20,
        footfall: 15,
      },
      competitors: {
        name: "gyms",
        tags: [{ key: "leisure", values: ["fitness_centre"] }],
      },
      highlightedLayers: ["amenities"],
      highlights: BUSINESS,
    },
    {
      id: "business-hairdresser",
      name: "Business: Hairdresser",
      question: "Could I open a hairdresser here?",
      weights: {
        safety: 10,
        amenities: 0,
        schools: 0,
        transport: 15,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 30,
        competition: 25,
        footfall: 15,
      },
      competitors: {
        name: "hairdressers",
        tags: [{ key: "shop", values: ["hairdresser"] }],
      },
      competitionPerThousand: { full: 0, zero: 3, points: 100 },
      highlightedLayers: ["amenities"],
      highlights: BUSINESS,
    },
    {
      id: "business-convenience-store",
      name: "Business: Convenience store",
      question: "Could I open a convenience store here?",
      weights: {
        safety: 10,
        amenities: 0,
        schools: 0,
        transport: 10,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 35,
        competition: 30,
        footfall: 10,
      },
      competitors: {
        name: "convenience stores",
        tags: [{ key: "shop", values: ["convenience"] }],
      },
      competitionPerThousand: { full: 0, zero: 2, points: 100 },
      highlightedLayers: ["amenities"],
      highlights: BUSINESS,
    },
    {
      // OpenStreetMap maps a dentist as `amenity=dentist` (FR-4.3) or
      // `healthcare=dentist`, as the Amenities Layer counts them.
      id: "business-dental-practice",
      name: "Business: Dental practice",
      question: "Could I open a dental practice here?",
      weights: {
        safety: 10,
        amenities: 0,
        schools: 0,
        transport: 20,
        "green-space": 0,
        "property-activity": 0,
        "development-activity": 0,
        "planning-freedom": 5,
        demand: 40,
        competition: 25,
        footfall: 0,
      },
      competitors: {
        name: "dental practices",
        tags: [
          { key: "amenity", values: ["dentist"] },
          { key: "healthcare", values: ["dentist"] },
        ],
      },
      highlightedLayers: ["amenities"],
      highlights: BUSINESS,
    },
    {
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
      highlights: [
        ...BUSINESS,
        "no-park-nearby",
        "park-nearby",
        "no-playground",
      ],
    },
  ],
};
