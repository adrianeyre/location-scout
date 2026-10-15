import type {
  PlanningConstraintName,
  PlanningLayerResponse,
} from "@location-scout/shared";

import {
  liveHistoricEnglandCredit,
  planningConstraintsCredit,
} from "../attribution";
import { CreditLine } from "../CreditText";
import { formatList } from "../format";
import { PLANNING_CONSTRAINT_STYLES } from "./layer-styles";

/**
 * How a covering Planning Constraint is named: with its type, unless its name
 * already says it, as "Flood zone 3" does.
 */
const named = ({ type, name }: PlanningConstraintName) =>
  type === "flood-zone"
    ? name
    : `${name} (${PLANNING_CONSTRAINT_STYLES[type].name[0].toLowerCase()})`;

/**
 * The Planning Layer's statistics: the Planning Constraints the Location is
 * inside, then how many of each type intersect the Search Area, and whether
 * the Location is inside any of them (PRD FR-2.2), credited to
 * planning.data.gov.uk and, for its conservation areas and listed
 * buildings, Historic England (FR-10.1).
 */
export const PlanningStatistics = ({
  statistics,
  sources,
}: PlanningLayerResponse) => {
  if (!statistics) return null;
  const { byType, coveringLocation } = statistics;
  const historicEngland = liveHistoricEnglandCredit(sources);
  return (
    <>
      <p>
        <strong>Location is inside:</strong>{" "}
        {coveringLocation.length === 0
          ? "none of these Planning Constraints."
          : `${formatList(coveringLocation.map(named))}.`}
      </p>
      <table className="layer-statistics">
        <caption>Planning Constraints in the Search Area</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">In the Search Area</th>
            <th scope="col">Location inside</th>
          </tr>
        </thead>
        <tbody>
          {byType.map(({ type, count, coversLocation }) => (
            <tr key={type}>
              <th scope="row">{PLANNING_CONSTRAINT_STYLES[type].name[1]}</th>
              <td>{count.toLocaleString("en-GB")}</td>
              <td>{coversLocation ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <CreditLine credit={planningConstraintsCredit()} />
      {historicEngland && <CreditLine credit={historicEngland} />}
    </>
  );
};
