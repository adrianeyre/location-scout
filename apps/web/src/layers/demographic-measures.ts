import type {
  DemographicMeasure,
  OutputAreaFeature,
} from "@location-scout/shared";

import { formatPrice } from "../format";

/**
 * How the Demographics Layer shades its output areas by each measure (PRD
 * FR-2.7a). Each measure has five classes, lightest to darkest, with fixed
 * breaks, so a shade means the same in every Search Area. The breaks are
 * about where England's output areas (for income, its MSOAs) divide into
 * fifths, rounded: half of England's output areas are lighter than the
 * middle shade, and half darker.
 */

/**
 * The five shades, lightest to darkest: one hue, orange, clear of the Search
 * Area's blue, each step darker than the last for every kind of colour
 * vision, and the lightest still 2:1 against the page.
 */
export const DEMOGRAPHIC_SHADES = [
  "#f2a070",
  "#ec7d45",
  "#d9622a",
  "#ad4615",
  "#76300b",
] as const;

/** The measure the output areas are shaded by until another is chosen. */
export const DEFAULT_DEMOGRAPHIC_MEASURE: DemographicMeasure =
  "population-density";

/** An output area with no figure for the measure. */
export const NO_FIGURE_SHADE = "#9e9e9e";

/** How the shapes are filled: enough to read a shade, and the map beneath. */
export const DEMOGRAPHIC_FILL_OPACITY = 0.55;

/** One class of a measure: its label, and whether a value is in it. */
export interface MeasureClass {
  label: string;
  contains: (value: number) => boolean;
}

export interface DemographicMeasureStyle {
  /** What the selector calls it: "Population density". */
  name: string;
  /** What the legend says its classes measure: "Residents per km²". */
  legend: string;
  /** An output area's figure, or `null` if it has none. */
  value: (feature: OutputAreaFeature) => number | null;
  /** Lightest to darkest, one for each of `DEMOGRAPHIC_SHADES`. */
  classes: readonly MeasureClass[];
}

const whole = (value: number) => value.toLocaleString("en-GB");

/** Five classes split at four breaks, each from its break up to the next. */
const splitAt = (
  breaks: readonly [number, number, number, number],
  format: (value: number) => string,
): MeasureClass[] => {
  const [first, ...rest] = breaks;
  const last = rest.at(-1) ?? first;
  return [
    { label: `Under ${format(first)}`, contains: (value) => value < first },
    ...breaks.slice(0, -1).map((from, index) => {
      const to = breaks[index + 1] ?? from;
      return {
        label: `${format(from)} to ${format(to)}`,
        contains: (value: number) => value >= from && value < to,
      };
    }),
    {
      label: `${format(last)} or more`,
      contains: (value) => value >= last,
    },
  ];
};

/** Two deciles a class, the least deprived lightest, the most deprived darkest. */
const decilePairs = (): MeasureClass[] =>
  [9, 7, 5, 3, 1].map((from) => ({
    label:
      from === 9
        ? "9 to 10 (least deprived)"
        : from === 1
          ? "1 to 2 (most deprived)"
          : `${String(from)} to ${String(from + 1)}`,
    contains: (decile) => decile === from || decile === from + 1,
  }));

export const DEMOGRAPHIC_MEASURE_STYLES: Readonly<
  Record<DemographicMeasure, DemographicMeasureStyle>
> = {
  "population-density": {
    name: "Population density",
    legend: "Residents per km²",
    value: ({ populationDensity }) => populationDensity,
    // England's fifths: 1,463, 3,749, 5,672 and 8,434 a km².
    classes: splitAt([1500, 3500, 5500, 8500], whole),
  },
  "median-age": {
    name: "Median age",
    legend: "Median age, in years",
    value: ({ medianAge }) => medianAge,
    // England's fifths: 34.4, 39.0, 44.6 and 51.2.
    classes: splitAt([34, 39, 45, 51], whole),
  },
  "household-income": {
    name: "Household income",
    legend: "Average household income a year, by MSOA",
    value: ({ householdIncome }) => householdIncome,
    // England's MSOAs' fifths: £43,296, £50,205, £57,578 and £67,455.
    classes: splitAt([43000, 50000, 57500, 67500], formatPrice),
  },
  deprivation: {
    name: "Deprivation",
    legend: "Index of Multiple Deprivation decile, by LSOA",
    value: ({ deprivationDecile }) => deprivationDecile,
    classes: decilePairs(),
  },
};

/** The shade an output area is filled with for a measure. */
export const shadeOf = (
  measure: DemographicMeasure,
  feature: OutputAreaFeature,
) => {
  const { value, classes } = DEMOGRAPHIC_MEASURE_STYLES[measure];
  const figure = value(feature);
  if (figure === null) return NO_FIGURE_SHADE;
  const index = classes.findIndex(({ contains }) => contains(figure));
  return DEMOGRAPHIC_SHADES[index] ?? NO_FIGURE_SHADE;
};
