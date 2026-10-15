import {
  CATEGORY_NAMES,
  locationScore,
  type CategoryId,
  type LayerResponse,
  type PlanningApplicationStatistics,
  type PlanningApplications,
  type ServedLayerId,
} from "@location-scout/shared";

import { formatChange, formatDistance, formatPrice } from "../format";
import { isLandOutsideCoverage } from "../layers/layer-status";
import type { SavedLocation } from "../saved/saved-locations";
import type {
  HighlightsState,
  LayerState,
  LayerStates,
  ScoresState,
} from "../useSearchArea";
import { allWeights, type CustomWeights } from "../weights";

/*
 * Comparing Saved Locations side by side (PRD FR-7.3): their Category
 * Scores, Location Score and key statistics, row by row, under one Scout
 * Mode, with the best value in each row marked. Every figure is one the
 * Location Overview already shows; nothing new is calculated but which is
 * best.
 */

/** How few Saved Locations make a comparison, and how many it can take. */
export const MIN_COMPARED = 2;
export const MAX_COMPARED = 4;

/** One Saved Location compared: its Layers, scores and Highlights as they arrive. */
export interface ComparedColumn {
  saved: SavedLocation;
  layers: LayerStates;
  scores: ScoresState;
  highlights: HighlightsState;
}

/**
 * One column's figure in a row: the value compared and how it reads, or why
 * there is none. A `value` of `null` is a figure that can't be compared,
 * such as a year-on-year change with nothing to compare with.
 */
export type ComparedFigure =
  | { status: "ok"; value: number | null; text: string }
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "not-prepared" }
  /** The Land Layer, where the Search Area reaches into no Land Coverage Area. */
  | { status: "outside-coverage" }
  /** Planning Applications waiting for their provider's turn (PRD NFR-1.5). */
  | { status: "queued" };

/** Which way a row's best value lies, or `null` where neither is better. */
export type Better = "higher" | "lower";

export interface ComparisonRow {
  id: string;
  name: string;
  better: Better | null;
  /** One for each column, in order. */
  figures: ComparedFigure[];
  /** Whether each column's figure is the row's best. */
  best: boolean[];
}

const UNAVAILABLE: ComparedFigure = { status: "unavailable" };

/** A figure to compare, as `text` reads. */
const figure = (value: number | null, text: string): ComparedFigure => ({
  status: "ok",
  value,
  text,
});

const count = (value: number) => figure(value, value.toLocaleString("en-GB"));

/**
 * A distance as it is shown, to the nearest 10 m or, from 1 km, 100 m, so
 * that two which read the same are compared as the same.
 */
const shownMetres = (metres: number) =>
  metres < 995 ? Math.round(metres / 10) * 10 : Math.round(metres / 100) * 100;

/**
 * How far away the nearest is, or that there is none within the distance
 * looked: further than any, so any distance found is better.
 */
const nearest = (
  found: { distanceMetres: number } | null,
  searchMetres: number,
) =>
  found
    ? figure(
        shownMetres(found.distanceMetres),
        formatDistance(found.distanceMetres),
      )
    : figure(
        Number.POSITIVE_INFINITY,
        `None within ${formatDistance(searchMetres)}`,
      );

/** The Planning Layer's Planning Applications' figure: they have a status of their own. */
const applicationsFigure = (
  applications: PlanningApplications | null,
  of: (statistics: PlanningApplicationStatistics) => ComparedFigure,
): ComparedFigure => {
  if (applications?.status === "queued") return { status: "queued" };
  return applications?.status === "ok" && applications.statistics
    ? of(applications.statistics)
    : UNAVAILABLE;
};

/** A key statistic: one figure from one Layer's statistics. */
export interface KeyStatistic {
  id: string;
  name: string;
  layer: ServedLayerId;
  better: Better | null;
  /**
   * Whether it counts what is in the Search Area, so that a wider Search
   * Radius finds more, and Search Areas of different sizes can't be judged
   * by it.
   */
  counted: boolean;
  /** Whether it is from the Planning Layer's Planning Applications. */
  fromApplications?: true;
  /** Its figure, from the Layer once it is `ok`. */
  of: (layer: LayerResponse) => ComparedFigure;
}

/**
 * The key statistics compared (PRD FR-7.3), from the figures each Layer's
 * statistics in the Location Overview give. A row is marked best only
 * where more or less is plainly better: fewer crimes, a nearer station.
 * Prices, residents and Planning Applications are compared but not judged.
 */
export const KEY_STATISTICS: readonly KeyStatistic[] = [
  {
    id: "residents",
    name: "Estimated residents",
    layer: "demographics",
    better: null,
    counted: true,
    of: (layer) =>
      layer.layer === "demographics" && layer.statistics
        ? count(layer.statistics.population)
        : UNAVAILABLE,
  },
  {
    id: "crimes",
    name: "Crimes in the last 12 months",
    layer: "crime",
    better: "lower",
    counted: true,
    of: (layer) => {
      if (layer.layer !== "crime" || !layer.statistics) return UNAVAILABLE;
      const { complete, total } = layer.statistics.trend;
      // Months missing from the count make it too low to compare.
      return complete
        ? count(total.last12Months)
        : figure(
            null,
            `${total.last12Months.toLocaleString("en-GB")} (months missing)`,
          );
    },
  },
  {
    id: "crime-change",
    name: "Crime year on year",
    layer: "crime",
    better: "lower",
    counted: false,
    of: (layer) => {
      if (layer.layer !== "crime" || !layer.statistics) return UNAVAILABLE;
      const { change } = layer.statistics.trend.total;
      return change === null
        ? figure(null, "Not known")
        : figure(change, formatChange(change));
    },
  },
  {
    id: "median-price",
    name: "Median sale price, last 12 months",
    layer: "property",
    better: null,
    counted: false,
    of: (layer) => {
      if (layer.layer !== "property" || !layer.statistics) return UNAVAILABLE;
      const { median } = layer.statistics.all;
      return median === null
        ? figure(null, "No sales")
        : figure(median, formatPrice(median));
    },
  },
  {
    id: "price-change",
    name: "Median price, change over 12 months",
    layer: "property",
    better: null,
    counted: false,
    of: (layer) => {
      if (layer.layer !== "property" || !layer.statistics) return UNAVAILABLE;
      const { change } = layer.statistics.medianChange.twelveMonths;
      return change === null
        ? figure(null, "Not known")
        : figure(change, formatChange(change));
    },
  },
  {
    id: "amenities",
    name: "Amenities",
    layer: "amenities",
    better: "higher",
    counted: true,
    of: (layer) =>
      layer.layer === "amenities" && layer.statistics
        ? count(layer.statistics.total)
        : UNAVAILABLE,
  },
  {
    id: "bus-stops",
    name: "Bus stops",
    layer: "transport",
    better: "higher",
    counted: true,
    of: (layer) =>
      layer.layer === "transport" && layer.statistics
        ? count(
            layer.statistics.facilities.find(({ type }) => type === "bus-stop")
              ?.count ?? 0,
          )
        : UNAVAILABLE,
  },
  {
    id: "station",
    name: "Nearest railway station",
    layer: "transport",
    better: "lower",
    counted: false,
    of: (layer) =>
      layer.layer === "transport" && layer.statistics
        ? nearest(
            layer.statistics.nearestStation,
            layer.statistics.stationSearchMetres,
          )
        : UNAVAILABLE,
  },
  {
    id: "park",
    name: "Nearest park",
    layer: "green-space",
    better: "lower",
    counted: false,
    of: (layer) =>
      layer.layer === "green-space" && layer.statistics
        ? nearest(
            layer.statistics.nearestPark,
            layer.statistics.parkSearchMetres,
          )
        : UNAVAILABLE,
  },
  {
    id: "primary",
    name: "Nearest primary school",
    layer: "schools",
    better: "lower",
    counted: false,
    of: (layer) =>
      layer.layer === "schools" && layer.statistics
        ? nearest(
            layer.statistics.nearestPrimary,
            layer.statistics.primarySearchMetres,
          )
        : UNAVAILABLE,
  },
  {
    id: "secondary",
    name: "Nearest secondary school",
    layer: "schools",
    better: "lower",
    counted: false,
    of: (layer) =>
      layer.layer === "schools" && layer.statistics
        ? nearest(
            layer.statistics.nearestSecondary,
            layer.statistics.secondarySearchMetres,
          )
        : UNAVAILABLE,
  },
  {
    id: "constraints",
    name: "Planning Constraints at the Location",
    layer: "planning",
    better: "lower",
    counted: false,
    of: (layer) =>
      layer.layer === "planning" && layer.statistics
        ? count(layer.statistics.coveringLocation.length)
        : UNAVAILABLE,
  },
  {
    id: "applications",
    name: "Planning Applications, last 3 years",
    layer: "planning",
    better: null,
    counted: true,
    fromApplications: true,
    of: (layer) =>
      layer.layer === "planning"
        ? applicationsFigure(layer.applications, ({ count: found }) =>
            count(found),
          )
        : UNAVAILABLE,
  },
  {
    id: "homes",
    name: "Homes approved or pending, estimated",
    layer: "planning",
    better: null,
    counted: true,
    fromApplications: true,
    of: (layer) =>
      layer.layer === "planning"
        ? applicationsFigure(layer.applications, ({ housing }) =>
            count(housing.homes),
          )
        : UNAVAILABLE,
  },
  {
    id: "income",
    name: "Average household income",
    layer: "demographics",
    better: null,
    counted: false,
    of: (layer) => {
      if (layer.layer !== "demographics" || !layer.statistics) {
        return UNAVAILABLE;
      }
      const income = layer.statistics.householdIncome;
      return income
        ? figure(income.averagePounds, formatPrice(income.averagePounds))
        : figure(null, "Not known");
    },
  },
  {
    id: "deprivation",
    name: "Deprivation decile at the Location (10 least deprived)",
    layer: "demographics",
    better: "higher",
    counted: false,
    of: (layer) => {
      if (layer.layer !== "demographics" || !layer.statistics) {
        return UNAVAILABLE;
      }
      const decile = layer.statistics.deprivation?.atLocation?.decile;
      return decile === undefined
        ? figure(null, "Not known")
        : figure(decile, `${String(decile)} of 10`);
    },
  },
  {
    id: "land-opportunities",
    name: "Land Opportunities",
    layer: "land",
    better: null,
    counted: true,
    of: (layer) =>
      layer.layer === "land" && layer.statistics
        ? count(layer.statistics.count)
        : UNAVAILABLE,
  },
];

/** A key statistic's figure from its Layer, whatever has come of it. */
const statisticFigure = (
  statistic: KeyStatistic,
  state: LayerState,
): ComparedFigure => {
  switch (state.status) {
    case "loading":
      return { status: "loading" };
    case "unavailable":
      return UNAVAILABLE;
    case "not-prepared":
      return isLandOutsideCoverage(state)
        ? { status: "outside-coverage" }
        : { status: "not-prepared" };
    case "ok":
      return statistic.of(state);
  }
};

/**
 * Which figures are a row's best: those with its highest or lowest value.
 * None is marked unless at least two can be compared and they differ, as a
 * best of one, or of equals, says nothing.
 */
export const bestOf = (
  figures: readonly ComparedFigure[],
  better: Better | null,
): boolean[] => {
  const values = figures.map((each) =>
    each.status === "ok" ? each.value : null,
  );
  const known = values.filter((value) => value !== null);
  if (better === null || known.length < MIN_COMPARED) {
    return values.map(() => false);
  }
  const best = better === "higher" ? Math.max(...known) : Math.min(...known);
  if (known.every((value) => value === best)) return values.map(() => false);
  return values.map((value) => value === best);
};

const row = (
  id: string,
  name: string,
  better: Better | null,
  figures: ComparedFigure[],
): ComparisonRow => ({
  id,
  name,
  better,
  figures,
  best: bestOf(figures, better),
});

/** Whether every column's Search Area has the same Search Radius. */
export const sameSearchRadius = (columns: readonly ComparedColumn[]) =>
  columns.every(({ saved }) => saved.radius === columns[0]?.saved.radius);

/**
 * The key statistics, row by row. A count of what is in the Search Area is
 * marked best only when every Search Area is the same size.
 */
export const statisticRows = (
  columns: readonly ComparedColumn[],
  statistics: readonly KeyStatistic[] = KEY_STATISTICS,
): ComparisonRow[] => {
  const comparable = sameSearchRadius(columns);
  return statistics.map((statistic) =>
    row(
      statistic.id,
      statistic.name,
      statistic.counted && !comparable ? null : statistic.better,
      columns.map(({ layers }) =>
        statisticFigure(statistic, layers[statistic.layer]),
      ),
    ),
  );
};

/**
 * The Location Score row and a row for each Category Score the Scout Mode
 * weighs, higher being better. The Location Score is the backend's, from
 * the Scout Mode's weights, or weighed again by the user's own (PRD FR-4.4),
 * the same for every column. One that leaves out Category Scores that are
 * unavailable says how many it is weighed from.
 */
export const scoreRows = (
  columns: readonly ComparedColumn[],
  categories: readonly CategoryId[],
  weights: CustomWeights | null,
): ComparisonRow[] => [
  row(
    "location-score",
    "Location Score",
    "higher",
    columns.map(({ scores }): ComparedFigure => {
      if (scores.status !== "ok") return { status: scores.status };
      const { score, counted, leftOut } = weights
        ? locationScore(scores.scores.categories, allWeights(weights))
        : scores.scores.location;
      if (score === null) return UNAVAILABLE;
      // One weighed from fewer Category Scores says so (PRD FR-3.4).
      return figure(
        score,
        leftOut.length === 0
          ? String(score)
          : `${String(score)} (${String(counted.length)} of ${String(counted.length + leftOut.length)} Category Scores)`,
      );
    }),
  ),
  ...categories.map((id) =>
    row(
      id,
      CATEGORY_NAMES[id],
      "higher",
      columns.map(({ scores }): ComparedFigure => {
        if (scores.status !== "ok") return { status: scores.status };
        const category = scores.scores.categories.find(
          (each) => each.id === id,
        );
        if (!category) return UNAVAILABLE;
        if (category.status !== "ok" || category.score === null) {
          return {
            status: category.status === "ok" ? "unavailable" : category.status,
          };
        }
        return figure(category.score, String(category.score));
      }),
    ),
  ),
];
