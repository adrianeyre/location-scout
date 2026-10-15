import type {
  DemographicsLayerResponse,
  Deprivation,
  SourceReport,
} from "@location-scout/shared";

import { formatCount, formatMonthOrDate, formatPrice } from "../format";
import { DEMOGRAPHICS_CREDIT } from "../attribution";
import { CreditText } from "../CreditText";
import { AGE_GROUP_NAMES } from "./layer-styles";

const deprivationText = ({
  atLocation,
  lowestDecile,
  highestDecile,
  lsoas,
}: Deprivation) => {
  const range =
    lowestDecile === highestDecile
      ? `decile ${String(lowestDecile)}`
      : `deciles ${String(lowestDecile)} to ${String(highestDecile)}`;
  const across = `The ${formatCount(lsoas, ["LSOA", "LSOAs"])} the Search Area reaches into ${lsoas === 1 ? "is in" : "are in"} ${range}.`;
  return atLocation
    ? `The Location's LSOA, ${atLocation.name}, is in decile ${String(atLocation.decile)} of 10 of the Index of Multiple Deprivation, where 1 is the most deprived 10% of LSOAs in England: it ranks ${atLocation.rank.toLocaleString("en-GB")}, where 1 is the most deprived. ${across}`
    : across;
};

/** Each prepared dataset, named with the date its data dates from. */
const sourcesText = (sources: readonly SourceReport[]) =>
  sources
    .map(({ name, period }) =>
      period ? `${name} (${formatMonthOrDate(period.from)})` : name,
    )
    .join(", ");

/**
 * The credit the Demographics Layer's datasets require, under the Open
 * Government Licence (PRD FR-10.1a), with the date of each.
 */
export const DemographicsAttribution = ({
  sources,
}: {
  sources: readonly SourceReport[];
}) => (
  <p className="layer-attribution">
    From {sourcesText(sources)}. <CreditText credit={DEMOGRAPHICS_CREDIT} />
  </p>
);

/**
 * The Demographics Layer's statistics: the Search Area's estimated
 * population, households and median age, its household income and
 * deprivation, and its age profile (PRD FR-2.7a), each estimated from the
 * output areas it reaches into, with the datasets credited.
 */
export const DemographicsStatistics = ({
  statistics,
  sources,
}: DemographicsLayerResponse) => {
  if (!statistics) return null;
  const {
    outputAreas,
    population,
    households,
    ageProfile,
    medianAge,
    householdIncome,
    deprivation,
  } = statistics;
  if (outputAreas === 0) {
    return (
      <p>No output area in the prepared data reaches into this Search Area.</p>
    );
  }
  return (
    <>
      <p>
        <strong>Estimated population:</strong>{" "}
        {population.toLocaleString("en-GB")}, in{" "}
        {formatCount(households, ["household", "households"])}, from the{" "}
        {formatCount(outputAreas, ["output area", "output areas"])} reaching
        into the Search Area.
      </p>
      <p>
        <strong>Median age:</strong>{" "}
        {medianAge === null ? "unknown" : medianAge.toLocaleString("en-GB")}
      </p>
      <p>
        <strong>Average household income:</strong>{" "}
        {householdIncome
          ? `${formatPrice(householdIncome.averagePounds)} a year, across the ${formatCount(householdIncome.msoas, ["MSOA", "MSOAs"])} the Search Area reaches into, weighed by their households in it.`
          : "no estimate for this Search Area."}
      </p>
      <p>
        <strong>Deprivation:</strong>{" "}
        {deprivation
          ? deprivationText(deprivation)
          : "no decile for this Search Area."}
      </p>
      <table className="layer-statistics">
        <caption>Estimated age profile of the Search Area</caption>
        <thead>
          <tr>
            <th scope="col">Age</th>
            <th scope="col">Residents</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {ageProfile.map(({ group, population: residents, percent }) => (
            <tr key={group}>
              <th scope="row">{AGE_GROUP_NAMES[group]}</th>
              <td>{residents.toLocaleString("en-GB")}</td>
              <td>{percent.toLocaleString("en-GB")}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <DemographicsAttribution sources={sources} />
    </>
  );
};
