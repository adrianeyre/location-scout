import type {
  HighlightLevel,
  HighlightsResponse,
  PropertySaleFeature,
  ServedLayerId,
} from "@location-scout/shared";

/** The middle value, or the mean of the middle two, or `null` with none. */
export const median = (values: readonly number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1
    ? upper
    : ((sorted[middle - 1] ?? upper) + upper) / 2;
};

/** The sales in one period: a calendar year, or a quarter of one. */
export interface PeriodOfSales {
  /** Where it falls in time, in years: 2025.5 for the third quarter of 2025. */
  at: number;
  /** "2025", or "Q3 2025". */
  label: string;
  count: number;
  median: number;
}

/**
 * The Property Layer's sales by period, oldest first, each with its count
 * and median price: by quarter when they span 3 years or fewer, so a year's
 * sales still give a line, and by calendar year when they span more. A period
 * with no sale is left out, as it has no median to draw.
 */
export const salesByPeriod = (
  sales: readonly Pick<PropertySaleFeature, "date" | "price">[],
): PeriodOfSales[] => {
  const dated = sales.flatMap(({ date, price }) => {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    return Number.isInteger(year) && month >= 1 && month <= 12
      ? [{ year, quarter: Math.ceil(month / 3), price }]
      : [];
  });
  if (dated.length === 0) return [];
  const years = dated.map(({ year }) => year);
  const byQuarter = Math.max(...years) - Math.min(...years) < 3;
  const prices = new Map<number, number[]>();
  for (const { year, quarter, price } of dated) {
    const at = byQuarter ? year + (quarter - 1) / 4 : year;
    prices.set(at, [...(prices.get(at) ?? []), price]);
  }
  return [...prices.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, each]) => ({
      at,
      label: byQuarter
        ? `Q${String((at % 1) * 4 + 1)} ${String(Math.floor(at))}`
        : String(at),
      count: each.length,
      median: median(each) ?? 0,
    }));
};

/**
 * Round numbers to mark an axis from 0 up to at least `max` with, giving
 * about `count` steps of 1, 2 or 5 times a power of ten.
 */
export const niceTicks = (max: number, count = 4): number[] => {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((each) => each * power)
      .find((each) => each >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let tick = 0; tick < max + step; tick += step) {
    ticks.push(Number(tick.toPrecision(12)));
    if (tick >= max) break;
  }
  return ticks;
};

/** A value as a per cent of the largest, for a bar's length: 0 to 100. */
export const share = (value: number, max: number) =>
  max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

/** How many Highlights there are at each level, Concerns first. */
export const highlightCounts = (
  highlights: HighlightsResponse["highlights"],
): Record<HighlightLevel, number> => {
  const counts: Record<HighlightLevel, number> = {
    concern: 0,
    watch: 0,
    good: 0,
  };
  for (const { level } of highlights) counts[level] += 1;
  return counts;
};

/**
 * The Layers in the order the Dashboard shows them: those the Scout Mode
 * highlights first, as they matter most to it, then the rest as they come.
 */
export const dashboardOrder = (
  layers: readonly ServedLayerId[],
  highlighted: readonly ServedLayerId[],
) => [
  ...layers.filter((layer) => highlighted.includes(layer)),
  ...layers.filter((layer) => !highlighted.includes(layer)),
];
