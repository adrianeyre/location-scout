import {
  ESTIMATED_HOUSING_RULES,
  type EstimatedHousing,
  type PlanningApplicationFeature,
  type PlanningApplications,
} from "@location-scout/shared";

import { formatCount, formatDate } from "../format";
import {
  PLANNING_APPLICATIONS_RATE_LIMITED,
  PLANNING_APPLICATION_STATUS_STYLES,
  PLANNING_APPLICATION_TYPE_NAMES,
} from "./layer-styles";

const APPLICATIONS = ["Planning Application", "Planning Applications"] as const;

/** A major application, as the Overview lists it. */
const majorText = ({
  address,
  reference,
  description,
  status,
  receivedOn,
}: PlanningApplicationFeature) =>
  `${address ?? reference}: ${description} (${PLANNING_APPLICATION_STATUS_STYLES[status].name.toLowerCase()}, received ${formatDate(receivedOn)})`;

const HOMES = ["home", "homes"] as const;

/**
 * The homes the approved and pending applications would bring, and the
 * residents they would bring, labelled estimated (PRD FR-2.2): "Estimated:
 * 50 homes approved or pending in the Search Area → about 120 extra
 * residents".
 */
const EstimatedHousingText = ({ housing }: { housing: EstimatedHousing }) => {
  const { approved, pending, homes, residents, applications, unstated } =
    housing;
  const { residentsPerHome } = ESTIMATED_HOUSING_RULES;
  return (
    <div className="planning-housing">
      <p>
        <strong>Estimated housing:</strong>{" "}
        {homes === 0
          ? "no new homes approved or pending in the Search Area."
          : `${formatCount(homes, HOMES)} approved or pending in the Search Area → about ${formatCount(residents, ["extra resident", "extra residents"])}.`}
      </p>
      <p className="layer-note">
        {homes > 0 &&
          `${approved.toLocaleString("en-GB")} approved and ${pending.toLocaleString("en-GB")} pending, read from the descriptions of ${formatCount(applications, APPLICATIONS)}, at ${residentsPerHome.toLocaleString("en-GB")} residents a home. `}
        {unstated > 0 &&
          `${formatCount(unstated, ["more proposes", "more propose"])} homes without saying how many, so ${unstated === 1 ? "isn't" : "aren't"} counted. `}
        Estimated by fixed rules from what each application proposes: homes
        demolished, converted from or replaced aren't taken away, and those
        refused or withdrawn aren't counted.
      </p>
    </div>
  );
};

/**
 * The Planning Layer's Planning Applications in the Location Overview (PRD
 * FR-2.2): how many were received in the Search Area in the last 3 years,
 * by status and by type, the major ones listed, and the homes they would
 * bring, estimated. Or that they are waiting for their provider's turn, or
 * unavailable. Its provider, PlanIt or PlanWire (ADR 0003), is credited as
 * the backend describes it, so nothing here changes with it.
 */
export const PlanningApplicationStatistics = ({
  applications,
}: {
  applications: PlanningApplications;
}) => {
  const { status, statistics, features, period, provider } = applications;
  let body;
  switch (status) {
    case "queued":
      body = (
        <p>
          <strong>{PLANNING_APPLICATIONS_RATE_LIMITED}.</strong> {provider.name}{" "}
          allows about one request a minute, so a new Search Area waits its
          turn. They appear here and on the map once it has come, and are kept
          for 7 days. Everything else loads without them.
        </p>
      );
      break;
    case "unavailable":
      body = (
        <p>
          <strong>Unavailable.</strong> {provider.name} didn't answer, so
          Planning Applications can't be shown for now. Everything else still
          works.
        </p>
      );
      break;
    case "ok": {
      if (!statistics) return null;
      const { count, total, approximate, byStatus, byType, major, housing } =
        statistics;
      const majors = major.flatMap(
        (id) => features.find((feature) => feature.id === id) ?? [],
      );
      body = (
        <>
          <p>
            {count === 0
              ? `None received in the Search Area since ${formatDate(period.from)}.`
              : `${formatCount(count, APPLICATIONS)} received in the Search Area since ${formatDate(period.from)}.`}
            {total === null
              ? ` ${provider.name} gave as many as it gives at once and doesn't say how many it has, so there may be more than are shown and counted.`
              : total > count &&
                ` ${provider.name} has ${total.toLocaleString("en-GB")}: only the newest ${count.toLocaleString("en-GB")} are shown and counted.`}
          </p>
          {approximate > 0 && (
            <p>
              {approximate === count
                ? `${count === 1 ? "It is" : "All are"} approximate`
                : `${approximate.toLocaleString("en-GB")} are approximate`}
              : placed at the middle of their postcode, as the council gave no
              closer location.
            </p>
          )}
          <table className="layer-statistics">
            <caption>Planning Applications by status</caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">In the Search Area</th>
              </tr>
            </thead>
            <tbody>
              {byStatus.map(({ status: each, count: many }) => (
                <tr key={each}>
                  <th scope="row">
                    <span
                      className="planning-status-swatch"
                      style={{
                        backgroundColor:
                          PLANNING_APPLICATION_STATUS_STYLES[each].colour,
                      }}
                      aria-hidden="true"
                    />
                    {PLANNING_APPLICATION_STATUS_STYLES[each].name}
                  </th>
                  <td>{many.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="layer-statistics">
            <caption>Planning Applications by type</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">In the Search Area</th>
              </tr>
            </thead>
            <tbody>
              {byType.map(({ type, count: many }) => (
                <tr key={type}>
                  <th scope="row">
                    {PLANNING_APPLICATION_TYPE_NAMES[type][1]}
                  </th>
                  <td>{many.toLocaleString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {majors.length === 0 ? (
            <p>No major applications.</p>
          ) : (
            <>
              <p>
                <strong>Major applications:</strong>
              </p>
              <ul className="planning-majors" aria-label="Major applications">
                {majors.map((application) => (
                  <li key={application.id}>{majorText(application)}</li>
                ))}
              </ul>
            </>
          )}
          <EstimatedHousingText housing={housing} />
          <p className="layer-note">{provider.note}</p>
          <p className="layer-attribution">
            Planning Applications from{" "}
            <a href={provider.url} target="_blank" rel="noopener noreferrer">
              {provider.name}
            </a>
            , as it had them on {formatDate(period.to)}.
          </p>
        </>
      );
    }
  }
  return (
    // Part of the Planning Layer's region, not a region of its own.
    <div className="planning-applications">
      <h4>Planning Applications</h4>
      {body}
    </div>
  );
};
