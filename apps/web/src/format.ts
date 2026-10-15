/** How figures are written for the user, in British English. */

const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A month such as `2026-08`, as "August 2026". */
export const formatMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  if (year === undefined || number === undefined) return month;
  const date = new Date(Date.UTC(year, number - 1, 1));
  return Number.isNaN(date.getTime()) ? month : MONTH_FORMAT.format(date);
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** A day such as `2026-05-29`, as "29 May 2026". */
export const formatDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return date;
  }
  const written = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(written.getTime()) ? date : DATE_FORMAT.format(written);
};

/** A month or a day, such as a dataset's source date, as "May 2026" or "29 May 2026". */
export const formatMonthOrDate = (value: string) =>
  value.length === 7 ? formatMonth(value) : formatDate(value);

const PRICE_FORMAT = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

/** A price in pounds, such as `173000`, as "£173,000". */
export const formatPrice = (pounds: number) => PRICE_FORMAT.format(pounds);

/**
 * A price in pounds, briefly, to label the map: "£173k", "£1.25m", to three
 * significant figures. Written out rather than with Intl's compact notation,
 * whose letters differ between browsers.
 */
export const formatShortPrice = (pounds: number) => {
  if (pounds < 1000) return formatPrice(pounds);
  const [value, unit] =
    pounds < 999_500 ? [pounds / 1000, "k"] : [pounds / 1_000_000, "m"];
  return `£${Number(value.toPrecision(3)).toLocaleString("en-GB")}${unit}`;
};

/** A floor area in m², as "92 m²" or "84.5 m²". */
export const formatSquareMetres = (squareMetres: number) =>
  `${squareMetres.toLocaleString("en-GB", { maximumFractionDigits: 1 })} m²`;

/** A distance as "350 m" to the nearest 10 m, or "1.2 km" from 1 km. */
export const formatDistance = (metres: number) =>
  metres < 995
    ? `${String(Math.round(metres / 10) * 10)} m`
    : `${(metres / 1000).toFixed(1)} km`;

/** A length of footpath or cycle route as "9.1 km", to the nearest 100 m. */
export const formatKilometres = (metres: number) =>
  `${(metres / 1000).toLocaleString("en-GB", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;

/** A count with the right noun, such as "1 crime" or "1,234 crimes". */
export const formatCount = (
  count: number,
  [one, many]: readonly [string, string],
) => `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;

/** A period of months such as `2025-09` to `2026-08`, as "September 2025 to August 2026". */
export const formatPeriod = ({ from, to }: { from: string; to: string }) =>
  `${formatMonth(from)} to ${formatMonth(to)}`;

const LIST_FORMAT = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** Names as a list in a sentence: "A", "A and B", "A, B and C". */
export const formatList = (items: readonly string[]) =>
  LIST_FORMAT.format(items);

const PERCENT = {
  style: "percent",
  maximumFractionDigits: 1,
} as const satisfies Intl.NumberFormatOptions;
const CHANGE_FORMAT = new Intl.NumberFormat("en-GB", {
  ...PERCENT,
  signDisplay: "exceptZero",
});
const SIZE_FORMAT = new Intl.NumberFormat("en-GB", {
  ...PERCENT,
  signDisplay: "never",
});

/** A change in per cent, such as `5.9`, as "+5.9%", "-16.9%" or "0%". */
export const formatChange = (percent: number) =>
  CHANGE_FORMAT.format(percent / 100);

/** A change in per cent in a sentence: "up 5.9%", "down 16.9%" or "no change". */
export const describeChange = (percent: number) => {
  if (percent === 0) return "no change";
  const size = SIZE_FORMAT.format(percent / 100);
  return percent > 0 ? `up ${size}` : `down ${size}`;
};

/**
 * A figure in a score's breakdown, with its unit: "1.6 km", "+5.9%", "995 per
 * km²", "13 of 13", "55% share", "Yes", or "–" if there is none. A unit of
 * "%" alone is a change.
 */
export const formatFigure = (
  value: number | boolean | null,
  unit: string | null,
) => {
  if (value === null) return "–";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (unit === "m") return formatDistance(value);
  if (unit === "%") return formatChange(value);
  const figure = value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  if (unit === null) return figure;
  return unit.startsWith("%") ? `${figure}${unit}` : `${figure} ${unit}`;
};

/** Points in a score's breakdown, such as `-20`, as "−20", with a true minus sign. */
export const formatPoints = (points: number) => {
  const size = Math.abs(points).toLocaleString("en-GB", {
    maximumFractionDigits: 1,
  });
  return points < 0 ? `−${size}` : size;
};
