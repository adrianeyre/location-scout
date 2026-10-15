import type {
  CrimeChange,
  CrimeLayerResponse,
  CrimeStatistics as Statistics,
  CrimeTrend,
} from "@location-scout/shared";

import {
  describeChange,
  formatChange,
  formatCount,
  formatList,
  formatMonth,
  formatPeriod,
} from "../format";

const CRIMES = ["crime", "crimes"] as const;

/** Up to this many missing months are named; more are only counted. */
const MOST_MONTHS_NAMED = 3;

const count = (value: number) => value.toLocaleString("en-GB");

/** The latest month's crimes, counted by category. */
const LatestMonth = ({ month, total, byCategory }: Statistics) => {
  const written = formatMonth(month);
  return (
    <>
      <h4>Latest month</h4>
      {total === 0 ? (
        <p>
          No crimes reported in the Search Area in {written}, the latest month
          the police have published.
        </p>
      ) : (
        <>
          <p>
            {formatCount(total, CRIMES)} reported in the Search Area in{" "}
            {written}, the latest month the police have published.
          </p>
          <table className="layer-statistics">
            <caption>Crimes by category, {written}</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Crimes</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map(({ category, name, count: crimes }) => (
                <tr key={category}>
                  <th scope="row">{name}</th>
                  <td>{count(crimes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
};

/** How the last 12 months compare with the 12 before, in a sentence. */
const comparison = ({ previous12Months, change }: CrimeChange) =>
  change === null
    ? "none in the 12 months before"
    : `${describeChange(change)} on the 12 months before (${count(previous12Months)})`;

/** A change in the table. A category new this year has nothing to compare with. */
const changeCell = ({ change }: CrimeChange) =>
  change === null ? "None before" : formatChange(change);

/**
 * Why there is no year-on-year change: data.police.uk didn't answer for some
 * months, so comparing what it did answer would be wrong.
 */
const Incomplete = ({ missingMonths }: CrimeTrend) => {
  const missing =
    missingMonths.length <= MOST_MONTHS_NAMED
      ? formatList(missingMonths.map(formatMonth))
      : `${String(missingMonths.length)} of the 24 months`;
  return (
    <p className="trend-incomplete">
      <strong>Trend incomplete.</strong> data.police.uk didn't answer for{" "}
      {missing}, so the counts leave those months out and no year-on-year change
      is given.
    </p>
  );
};

/**
 * The last 12 months' crimes against the 12 before, overall and by category
 * (PRD FR-2.1). If some months are missing, it says so and gives no change.
 */
const LastTwelveMonths = ({ trend }: { trend: CrimeTrend }) => {
  const { complete, total, byCategory } = trend;
  const period = formatPeriod(trend.last12Months);
  return (
    <>
      <h4>Last 12 months</h4>
      {complete && byCategory.length === 0 ? (
        <p>
          No crimes reported in the Search Area from {period}, or in the 12
          months before.
        </p>
      ) : complete ? (
        <p>
          {formatCount(total.last12Months, CRIMES)} reported in the Search Area
          from {period}: {comparison(total)}.
        </p>
      ) : (
        <>
          <Incomplete {...trend} />
          <p>
            {formatCount(total.last12Months, CRIMES)} counted in the Search Area
            from {period}, and {count(total.previous12Months)} in the 12 months
            before.
          </p>
        </>
      )}
      {byCategory.length > 0 && (
        <table className="layer-statistics">
          <caption>
            Crimes by category, {period}, against the 12 months before
          </caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Last 12 months</th>
              <th scope="col">12 months before</th>
              {complete && <th scope="col">Change</th>}
            </tr>
          </thead>
          <tbody>
            {byCategory.map((category) => (
              <tr key={category.category}>
                <th scope="row">{category.name}</th>
                <td>{count(category.last12Months)}</td>
                <td>{count(category.previous12Months)}</td>
                {complete && <td>{changeCell(category)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">All crimes</th>
              <td>{count(total.last12Months)}</td>
              <td>{count(total.previous12Months)}</td>
              {complete && <td>{changeCell(total)}</td>}
            </tr>
          </tfoot>
        </table>
      )}
    </>
  );
};

/**
 * The Crime Layer's statistics: crimes in the Search Area in the latest month
 * the police have published, counted by category, then the last 12 months
 * against the 12 before (PRD FR-2.1).
 */
export const CrimeStatistics = ({ statistics }: CrimeLayerResponse) => {
  if (!statistics) return null;
  return (
    <>
      <LatestMonth {...statistics} />
      <LastTwelveMonths trend={statistics.trend} />
    </>
  );
};
