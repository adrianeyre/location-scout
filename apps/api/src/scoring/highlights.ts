import {
  HIGHLIGHT_LEVELS,
  HIGHLIGHT_RULE_IDS,
  SERVED_LAYER_IDS,
  type AmenityType,
  type CrimeStatistics,
  type GreenSpaceType,
  type Highlight,
  type HighlightLevel,
  type HighlightRuleId,
  type HighlightsResponse,
  type PropertyStatistics,
  type LeftOutLayer,
  type SearchArea,
  type TransportFacilityType,
} from "@location-scout/shared";

import { floodZoneId } from "../sources/planning-data";
import {
  INSIDE,
  crimeRate,
  threshold,
  type PenalisedType,
} from "./category-scores";
import {
  SCORING_CONFIG,
  type ScoringConfig,
  type ScoutModeConfig,
} from "./config";
import type { SourceLimiters } from "../sources/area-sources";
import type { CallSource } from "../sources/data-source";
import type { PreparedData } from "../sources/prepared-data";
import { loadScoredLayers, residentsOf, type ScoredLayers } from "./scores";

/*
 * The rules that give a Search Area's Highlights (PRD FR-3.7): short Good,
 * Watch and Concern statements, each from one Layer's calculated figures.
 * Their thresholds are in `SCORING_CONFIG.highlights`, beside the scores'
 * own, and each Scout Mode in `SCORING_CONFIG.modes` names the rules it
 * applies. Each rule is a pure function of the Layer's response and the
 * config, so the same figures always give the same Highlights. None of them
 * uses AI (ADR 0005).
 */

/** What a rule found: how its Highlight reads, or `null` if it doesn't apply. */
type Found = { level: HighlightLevel; text: string } | null;

interface RuleContext {
  area: SearchArea;
  config: ScoringConfig;
  /**
   * The Search Area's residents, as the Demographics Layer estimates them, or
   * `null` without them.
   */
  residents: number | null;
}

/** A Layer that answered, so its statistics are there to read. */
type Loaded<T extends { statistics: unknown }> = T & {
  statistics: NonNullable<T["statistics"]>;
};

const isLoaded = <T extends { status: string; statistics: unknown }>(
  layer: T,
): layer is Loaded<T> => layer.status === "ok" && layer.statistics !== null;

interface HighlightRule {
  /** The Layer whose figures it reads, which its Highlight links to. */
  layer: keyof ScoredLayers;
  /** Its Highlight, or `null` if it doesn't apply or the Layer isn't `ok`. */
  apply: (layers: ScoredLayers, context: RuleContext) => Found;
}

/** A rule over one Layer, applied only when that Layer is `ok`. */
const over = <L extends keyof ScoredLayers>(
  layer: L,
  apply: (loaded: Loaded<ScoredLayers[L]>, context: RuleContext) => Found,
): HighlightRule => ({
  layer,
  apply: (layers, context) => {
    const response = layers[layer];
    return isLoaded(response) ? apply(response, context) : null;
  },
});

const number = (value: number) =>
  value.toLocaleString("en-GB", { maximumFractionDigits: 1 });

/** A distance measured, as "350 m" to the nearest 10 m, or "1.2 km" from 1 km. */
const distance = (metres: number) =>
  metres < 995
    ? `${number(Math.round(metres / 10) * 10)} m`
    : `${(metres / 1000).toFixed(1)} km`;

/** A distance in the config, such as 500 m or 2 km. */
const within = (metres: number) =>
  metres >= 1000 ? `${number(metres / 1000)} km` : `${number(metres)} m`;

/** "1 bus stop", "58 bus stops". */
const count = (n: number, one: string, many: string) =>
  `${number(n)} ${n === 1 ? one : many}`;

/** "A, B and C". */
const list = (names: readonly string[]) =>
  new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);

/** `text`, followed by what it names, if it has a name. */
const named = (text: string, name: string | null) =>
  name ? `${text}: ${name}` : text;

const good = (text: string): Found => ({ level: "good", text });
const watch = (text: string): Found => ({ level: "watch", text });

/** How many amenities of `types` the Search Area has. */
const amenities = (
  { byType }: { byType: readonly { type: AmenityType; count: number }[] },
  types: readonly AmenityType[],
) =>
  byType
    .filter(({ type }) => types.includes(type))
    .reduce((sum, { count: n }) => sum + n, 0);

const facilities = (
  {
    facilities: counts,
  }: { facilities: readonly { type: TransportFacilityType; count: number }[] },
  type: TransportFacilityType,
) => counts.find((facility) => facility.type === type)?.count ?? 0;

const greenSpaces = (
  { byType }: { byType: readonly { type: GreenSpaceType; count: number }[] },
  type: GreenSpaceType,
) => byType.find((green) => green.type === type)?.count ?? 0;

/**
 * The change in median price on a year before, or `null` unless each 12
 * months had `sales` or more.
 */
const medianChange = (
  { all, medianChange: { twelveMonths } }: PropertyStatistics,
  sales: number,
) =>
  all.count >= sales && (twelveMonths.prices?.count ?? 0) >= sales
    ? twelveMonths.change
    : null;

/**
 * Crimes a year as Safety counts them: per 1,000 of the Search Area's
 * residents, or per km² without them.
 */
const crimeRateOf = (
  { trend }: CrimeStatistics,
  { area, config, residents }: RuleContext,
) => crimeRate(trend, area, residents, config.residentsPerKm2);

/** Watch: the Location is inside one or more Planning Constraints of `type`. */
const insideConstraint = (type: PenalisedType) =>
  over("planning", ({ statistics }) => {
    const names = statistics.coveringLocation
      .filter((constraint) => constraint.type === type)
      .map(({ name }) => name);
    return names.length > 0
      ? watch(`Location is inside ${INSIDE[type]}: ${list(names)}`)
      : null;
  });

/** Each rule, by its id. Adding one means adding its id, config and rule. */
const RULES: Readonly<Record<HighlightRuleId, HighlightRule>> = {
  "crime-rate-high": over("crime", ({ statistics }, context) => {
    const { perThousand } = context.config.highlights["crime-rate-high"];
    const { rate } = crimeRateOf(statistics, context);
    return rate.value >= threshold(perThousand, rate)
      ? {
          level: "concern",
          text: `High crime: ${number(Math.round(rate.value))} crimes a year ${rate.per}`,
        }
      : null;
  }),

  "crime-rate-low": over("crime", ({ statistics }, context) => {
    const { perThousand } = context.config.highlights["crime-rate-low"];
    const { rate } = crimeRateOf(statistics, context);
    return rate.value <= threshold(perThousand, rate)
      ? good(
          `Low crime: ${number(Math.round(rate.value))} crimes a year ${rate.per}`,
        )
      : null;
  }),

  "crime-rising": over("crime", ({ statistics }, { config }) => {
    const { change } = statistics.trend.total;
    const { percent } = config.highlights["crime-rising"];
    return change !== null && change > percent
      ? watch(`Crime up ${number(change)}% year on year`)
      : null;
  }),

  "crime-falling": over("crime", ({ statistics }, { config }) => {
    const { change } = statistics.trend.total;
    const { percent } = config.highlights["crime-falling"];
    return change !== null && change < -percent
      ? good(`Crime down ${number(-change)}% year on year`)
      : null;
  }),

  "flood-zone-at-location": over("planning", ({ features }, { config }) => {
    const { zones } = config.highlights["flood-zone-at-location"];
    const highest = zones.find(({ zone }) =>
      features.some(
        ({ id, coversLocation }) => coversLocation && id === floodZoneId(zone),
      ),
    );
    return highest
      ? {
          level: highest.level,
          text: `Location is in flood zone ${highest.zone}`,
        }
      : null;
  }),

  "flood-zone-nearby": over("planning", ({ features }, { config }) => {
    const { zone, metres } = config.highlights["flood-zone-nearby"];
    const flood = features.find(({ id }) => id === floodZoneId(zone));
    return flood && !flood.coversLocation && flood.distanceMetres <= metres
      ? watch(
          `Flood zone ${zone} within ${within(metres)}: ${distance(flood.distanceMetres)} from the Location`,
        )
      : null;
  }),

  "conservation-area": insideConstraint("conservation-area"),
  "listed-building": insideConstraint("listed-building"),
  "article-4-direction": insideConstraint("article-4-direction"),
  "tree-preservation-zone": insideConstraint("tree-preservation-zone"),

  "no-planning-constraints": over("planning", ({ statistics }) =>
    statistics.coveringLocation.length === 0
      ? good("No Planning Constraints recorded at the Location")
      : null,
  ),

  "no-everyday-shop": over("amenities", ({ statistics }) =>
    amenities(statistics, ["convenience-store", "supermarket"]) === 0
      ? watch("No convenience store or supermarket in the Search Area")
      : null,
  ),

  "no-healthcare": over("amenities", ({ statistics }) =>
    amenities(statistics, ["healthcare"]) === 0
      ? watch("No GP, pharmacy or other healthcare in the Search Area")
      : null,
  ),

  "wide-range-of-amenities": over("amenities", ({ statistics }, { config }) => {
    const present = statistics.byType.filter(({ count: n }) => n > 0).length;
    const types = statistics.byType.length;
    return present >= config.highlights["wide-range-of-amenities"].count
      ? good(
          present === types
            ? `All ${number(types)} types of amenity in the Search Area`
            : `${number(present)} of ${number(types)} types of amenity in the Search Area`,
        )
      : null;
  }),

  "no-station-nearby": over("transport", ({ statistics }, { config }) => {
    const { metres } = config.highlights["no-station-nearby"];
    const { nearestStation, stationSearchMetres } = statistics;
    if (nearestStation === null) {
      return watch(`No railway station within ${within(stationSearchMetres)}`);
    }
    return nearestStation.distanceMetres > metres
      ? watch(
          named(
            `No railway station within ${within(metres)}. The nearest is ${distance(nearestStation.distanceMetres)} away`,
            nearestStation.name,
          ),
        )
      : null;
  }),

  "station-nearby": over("transport", ({ statistics }, { config }) => {
    const { metres } = config.highlights["station-nearby"];
    const { nearestStation } = statistics;
    return nearestStation && nearestStation.distanceMetres <= metres
      ? good(
          named(
            `Railway station ${distance(nearestStation.distanceMetres)} away`,
            nearestStation.name,
          ),
        )
      : null;
  }),

  "few-bus-stops": over("transport", ({ statistics }, { config }) => {
    const stops = facilities(statistics, "bus-stop");
    if (stops > config.highlights["few-bus-stops"].count) return null;
    return watch(
      stops === 0
        ? "No bus stops in the Search Area"
        : `Few bus stops: ${count(stops, "bus stop", "bus stops")} in the Search Area`,
    );
  }),

  "good-bus-service": over("transport", ({ statistics }, { config }) => {
    const stops = facilities(statistics, "bus-stop");
    return stops >= config.highlights["good-bus-service"].count
      ? good(`${count(stops, "bus stop", "bus stops")} in the Search Area`)
      : null;
  }),

  "limited-parking": over("transport", ({ statistics }, { config }) => {
    const carParks = facilities(statistics, "car-park");
    if (carParks > config.highlights["limited-parking"].count) return null;
    return watch(
      `Limited parking: ${carParks === 0 ? "no car parks" : count(carParks, "car park", "car parks")} in the Search Area`,
    );
  }),

  "no-park-nearby": over("green-space", ({ statistics }, { config }) => {
    const { metres } = config.highlights["no-park-nearby"];
    const { nearestPark, parkSearchMetres } = statistics;
    if (nearestPark === null) {
      return watch(`No park within ${within(parkSearchMetres)}`);
    }
    return nearestPark.distanceMetres > metres
      ? watch(
          named(
            `No park within ${within(metres)}. The nearest is ${distance(nearestPark.distanceMetres)} away`,
            nearestPark.name,
          ),
        )
      : null;
  }),

  "park-nearby": over("green-space", ({ statistics }, { config }) => {
    const { metres } = config.highlights["park-nearby"];
    const { nearestPark } = statistics;
    if (nearestPark === null || nearestPark.distanceMetres > metres) {
      return null;
    }
    return good(
      nearestPark.coversLocation
        ? named("Location is in a park", nearestPark.name)
        : named(
            `Park ${distance(nearestPark.distanceMetres)} away`,
            nearestPark.name,
          ),
    );
  }),

  "no-playground": over("green-space", ({ statistics }) =>
    greenSpaces(statistics, "playground") === 0
      ? watch("No playground in the Search Area")
      : null,
  ),

  "prices-falling": over("property", ({ statistics }, { config }) => {
    const change = medianChange(
      statistics,
      config.highlights["prices-falling"].sales,
    );
    return change !== null &&
      change < -config.highlights["prices-falling"].percent
      ? watch(`Median price down ${number(-change)}% on a year before`)
      : null;
  }),

  "prices-rising": over("property", ({ statistics }, { config }) => {
    const change = medianChange(
      statistics,
      config.highlights["prices-rising"].sales,
    );
    return change !== null &&
      change > config.highlights["prices-rising"].percent
      ? good(`Median price up ${number(change)}% on a year before`)
      : null;
  }),

  "quiet-market": over("property", ({ statistics }, { config }) => {
    const sales = statistics.all.count;
    // With the Search Area cut short there may be more sales than counted.
    return !statistics.postcodes.truncated &&
      sales < config.highlights["quiet-market"].count
      ? watch(
          `Quiet market: ${sales === 0 ? "no sales" : count(sales, "sale", "sales")} in the last 12 months`,
        )
      : null;
  }),

  "active-market": over("property", ({ statistics }, { config }) => {
    const sales = statistics.all.count;
    return sales >= config.highlights["active-market"].count
      ? good(
          `Active market: ${statistics.postcodes.truncated ? "at least " : ""}${count(sales, "sale", "sales")} in the last 12 months`,
        )
      : null;
  }),
};

/** Concerns first, then Watches, then Goods. */
const byLevel = (a: Highlight, b: Highlight) =>
  HIGHLIGHT_LEVELS.indexOf(a.level) - HIGHLIGHT_LEVELS.indexOf(b.level);

/**
 * The Highlights for a Search Area under a Scout Mode (PRD FR-3.7): every
 * rule the mode applies, over the Layers' calculated figures. A pure
 * function, so the same Layers always give the same Highlights. A Layer that
 * isn't `ok` gives none, and is listed as left out.
 */
export const highlightSearchArea = (
  layers: ScoredLayers,
  area: SearchArea,
  mode: ScoutModeConfig,
  config: ScoringConfig = SCORING_CONFIG,
): HighlightsResponse => {
  const applied = HIGHLIGHT_RULE_IDS.filter((id) =>
    mode.highlights.includes(id),
  );
  const highlights = applied
    .flatMap((rule): Highlight[] => {
      const { layer, apply } = RULES[rule];
      const found = apply(layers, {
        area,
        config,
        residents: residentsOf(layers.demographics),
      });
      return found ? [{ rule, ...found, layer }] : [];
    })
    .sort(byLevel);
  const read = new Set(applied.map((rule) => RULES[rule].layer));
  const leftOut = SERVED_LAYER_IDS.flatMap((layer): LeftOutLayer[] => {
    if (!read.has(layer)) return [];
    const { status } = layers[layer];
    return status === "ok" ? [] : [{ layer, status }];
  });
  return { mode: mode.id, highlights, leftOut };
};

/** Loads every Layer the Highlights read, then gives the Scout Mode's Highlights. */
export const loadHighlights = async (
  area: SearchArea,
  mode: ScoutModeConfig,
  callSource: CallSource,
  limiters: SourceLimiters,
  userAgent: string,
  today: string,
  prepared: PreparedData,
  config: ScoringConfig = SCORING_CONFIG,
): Promise<HighlightsResponse> =>
  highlightSearchArea(
    // No Highlight reads the Planning Applications, so they aren't asked for.
    await loadScoredLayers(
      area,
      callSource,
      limiters,
      userAgent,
      today,
      prepared,
      null,
    ),
    area,
    mode,
    config,
  );
