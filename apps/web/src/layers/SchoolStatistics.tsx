import {
  OFSTED_JUDGEMENTS,
  type NearestSchool,
  type SchoolsLayerResponse,
  type SourceReport,
} from "@location-scout/shared";

import { SCHOOLS_CREDIT } from "../attribution";
import { CreditText } from "../CreditText";
import { formatCount, formatDate, formatDistance } from "../format";
import {
  LAYER_STYLES,
  OFSTED_JUDGEMENT_NAMES,
  SCHOOL_PHASE_NAMES,
  judgementText,
} from "./layer-styles";

/** The nearest school of a phase, how far it is and its judgement, or that there is none within reach. */
const nearestSchoolText = (
  school: NearestSchool | null,
  searchMetres: number,
) => {
  if (school === null) {
    return `none within ${(searchMetres / 1000).toLocaleString("en-GB")} km.`;
  }
  const where = school.inSearchArea ? "" : ", outside the Search Area";
  const kind = school.phase === "all-through" ? ", an all-through school" : "";
  return `${school.name}${kind}, ${formatDistance(school.distanceMetres)}${where}. Ofsted: ${judgementText(school)}.`;
};

/** Each dataset, named with the date its data dates from. */
const sourcesText = (sources: readonly SourceReport[]) =>
  sources
    .map(({ name, period }) =>
      period ? `${name} (${formatDate(period.from)})` : name,
    )
    .join(" and ");

/**
 * The credit GIAS's and Ofsted's data require, under the Open Government
 * Licence (PRD FR-10.1a), with the date of each.
 */
export const SchoolsAttribution = ({
  sources,
}: {
  sources: readonly SourceReport[];
}) => (
  <p className="layer-attribution">
    From {sourcesText(sources)}. <CreditText credit={SCHOOLS_CREDIT} />
  </p>
);

/**
 * The Schools Layer's statistics: the nearest primary and secondary school
 * with their latest Ofsted judgements, then how many schools of each phase
 * are in the Search Area and what Ofsted judged them (PRD FR-2.3a), with
 * the datasets credited.
 */
export const SchoolStatistics = ({
  statistics,
  sources,
}: SchoolsLayerResponse) => {
  if (!statistics) return null;
  const {
    total,
    byPhase,
    byJudgement,
    nearestPrimary,
    primarySearchMetres,
    nearestSecondary,
    secondarySearchMetres,
  } = statistics;
  return (
    <>
      <p>
        <strong>Nearest primary school:</strong>{" "}
        {nearestSchoolText(nearestPrimary, primarySearchMetres)}
      </p>
      <p>
        <strong>Nearest secondary school:</strong>{" "}
        {nearestSchoolText(nearestSecondary, secondarySearchMetres)}
      </p>
      <p>
        {total === 0
          ? "No schools open in the Search Area."
          : `${formatCount(total, LAYER_STYLES.schools.noun)} open in the Search Area.`}
      </p>
      {total > 0 && (
        <>
          <table className="layer-statistics">
            <caption>Schools in the Search Area by phase</caption>
            <thead>
              <tr>
                <th scope="col">Phase</th>
                <th scope="col">Schools</th>
                <th scope="col">Latest Ofsted judgements</th>
              </tr>
            </thead>
            <tbody>
              {byPhase.map(({ phase, count, byJudgement: judged }) => (
                <tr key={phase}>
                  <th scope="row">{SCHOOL_PHASE_NAMES[phase][1]}</th>
                  <td>{count.toLocaleString("en-GB")}</td>
                  <td className="layer-statistics-text">
                    {judged
                      .filter((judgement) => judgement.count > 0)
                      .map(
                        ({ judgement, count: judgedCount }) =>
                          `${OFSTED_JUDGEMENT_NAMES[judgement]} ${judgedCount.toLocaleString("en-GB")}`,
                      )
                      .join(", ") || "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="layer-statistics">
            <caption>
              Schools in the Search Area by latest Ofsted judgement
            </caption>
            <thead>
              <tr>
                <th scope="col">Judgement</th>
                <th scope="col">Schools</th>
              </tr>
            </thead>
            <tbody>
              {OFSTED_JUDGEMENTS.map((judgement) => (
                <tr key={judgement}>
                  <th scope="row">{OFSTED_JUDGEMENT_NAMES[judgement]}</th>
                  <td>
                    {(
                      byJudgement.find((each) => each.judgement === judgement)
                        ?.count ?? 0
                    ).toLocaleString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <SchoolsAttribution sources={sources} />
    </>
  );
};
