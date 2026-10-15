import type { ReactNode } from "react";

import {
  COUNCIL_BOUNDARIES_DATASET,
  COUNCIL_BOUNDARY_DATASET,
  INSPIRE_INDEX_POLYGONS_DATASET,
  TITLE_DATASETS,
  type CouncilReport,
  type LandCoverageArea as PreparedArea,
  type PreparedDataset,
} from "@location-scout/shared";

import { formatDate, formatMonthOrDate } from "./format";
import type { CoverageState } from "./useCoverage";

interface LandCoverageAreaProps {
  /** The council the Location is in, from the prepared council boundaries. */
  council: CouncilReport;
  /** What has been prepared, with its dates. */
  coverage: CoverageState;
}

/** When a dataset was prepared, as "8 October 2026". */
const preparedOn = ({ preparedAt }: PreparedDataset) =>
  formatDate(preparedAt.slice(0, 10));

/** A source date, which is a month or a day, as "May 2026" or "29 May 2026". */
const sourceDate = ({ sourceDate: date }: PreparedDataset) =>
  formatMonthOrDate(date);

/** Whether a dataset is CCOD or OCOD, which the Ownership Categories come from. */
const isTitleDataset = ({ id }: PreparedDataset) =>
  TITLE_DATASETS.some((dataset) => dataset === id);

/**
 * When a dataset's data dates from: the day HM Land Registry published
 * INSPIRE Index Polygons, CCOD or OCOD, or as at its source date.
 */
const datedAt = (dataset: PreparedDataset) =>
  dataset.id === INSPIRE_INDEX_POLYGONS_DATASET || isTitleDataset(dataset)
    ? `published on ${sourceDate(dataset)}`
    : `as at ${sourceDate(dataset)}`;

/**
 * A Land Coverage Area's land data, beside its boundary: each source's
 * datasets together where they share a date, with that date (FR-6.5).
 */
const LandData = ({ datasets }: { datasets: PreparedDataset[] }) => {
  const groups = new Map<string, PreparedDataset[]>();
  for (const dataset of datasets) {
    if (dataset.id === COUNCIL_BOUNDARY_DATASET) continue;
    const key = `${dataset.source} ${datedAt(dataset)}`;
    groups.set(key, [...(groups.get(key) ?? []), dataset]);
  }
  if (groups.size === 0) return null;
  return (
    <ul aria-label="Land data">
      {[...groups].map(([key, group]) => {
        const [first] = group;
        return first ? (
          <li key={key}>
            {group.map(({ name }) => name).join(", ")}: {first.source},{" "}
            {datedAt(first)}
          </li>
        ) : null;
      })}
    </ul>
  );
};

/**
 * Says to run `pnpm data:prepare` again when a Land Coverage Area's INSPIRE
 * Index Polygons are more than 2 months old, or aren't prepared (FR-6.5).
 */
const OutOfDate = ({ area }: { area: PreparedArea }) => {
  if (!area.outOfDate) return null;
  const inspire = area.datasets.find(
    ({ id }) => id === INSPIRE_INDEX_POLYGONS_DATASET,
  );
  return (
    <p className="land-out-of-date">
      {inspire ? (
        <>
          <strong>Out of date.</strong> Its {inspire.name} were published on{" "}
          {sourceDate(inspire)}, more than 2 months ago. Run{" "}
          <code>pnpm data:prepare</code> again for the latest: {inspire.source}{" "}
          publishes them on the first Sunday of every month.
        </>
      ) : (
        <>
          <strong>Not all prepared.</strong> Its INSPIRE Index Polygons
          aren&apos;t prepared yet. Run <code>pnpm data:prepare</code> again to
          prepare them.
        </>
      )}
    </p>
  );
};

/** The statements each dataset's licence requires, with a link to its conditions (FR-10.2). */
export const Attributions = ({ datasets }: { datasets: PreparedDataset[] }) => (
  <>
    {datasets.flatMap(({ id, name, attribution }) =>
      attribution
        ? [
            <p key={id} className="layer-note">
              {name}: {attribution.statements.join(" ")}{" "}
              <a href={attribution.conditionsUrl}>Conditions of use</a>.
            </p>,
          ]
        : [],
    )}
  </>
);

/**
 * The council the Location is in, from the council boundaries `pnpm
 * data:prepare` prepared (PRD FR-6.3), and whether its land data is prepared:
 * whether it is a Land Coverage Area, when it was prepared, and the date of
 * each of its sources, with CCOD and OCOD, which its Ownership Categories
 * come from, and the statements their licences require (FR-10.1a),
 * suggesting running `pnpm data:prepare` again if its INSPIRE Index Polygons
 * are out of date (FR-6.5). Before `pnpm data:prepare` it says to run it
 * (FR-6.6).
 */
export const LandCoverageArea = ({
  council,
  coverage,
}: LandCoverageAreaProps) => {
  const prepared = coverage.status === "ok" ? coverage.coverage : null;
  const boundaries = prepared?.datasets.find(
    ({ id }) => id === COUNCIL_BOUNDARIES_DATASET,
  );
  const area = prepared?.landCoverageAreas.find(
    (candidate) => candidate.council.code === council.council?.code,
  );
  const [areaDataset] = area?.datasets ?? [];
  // CCOD and OCOD are England-wide, and give every Land Coverage Area its
  // Ownership Categories (PRD FR-5.4a).
  const titleDatasets = prepared?.datasets.filter(isTitleDataset) ?? [];

  let body: ReactNode;
  if (council.status === "not-prepared") {
    body = (
      <p>
        <strong>Not prepared.</strong> Run <code>pnpm data:prepare</code> to
        find the council the Location is in and prepare its land data.
      </p>
    );
  } else if (council.status === "unavailable") {
    body = (
      <p>
        <strong>Unavailable.</strong> The prepared council boundaries can't be
        read for now. Everything else still works.
      </p>
    );
  } else if (council.council === null) {
    body = <p>No prepared council boundary covers the Location.</p>;
  } else {
    const { name } = council.council;
    body = (
      <>
        <dl>
          <dt>Council</dt>
          <dd>{name}</dd>
        </dl>
        {council.inLandCoverageArea ? (
          <>
            <p>
              {name} is a Land Coverage Area
              {areaDataset
                ? `: its land data was prepared on ${preparedOn(areaDataset)}.`
                : "."}
            </p>
            {area && (
              <>
                <LandData datasets={[...area.datasets, ...titleDatasets]} />
                {titleDatasets.length === 0 && (
                  <p className="layer-note">
                    Ownership Categories aren&apos;t prepared, so its land is
                    only Possibly Unregistered or registered. Set{" "}
                    <code>LAND_REGISTRY_DATA_API_KEY</code> and run{" "}
                    <code>pnpm data:prepare</code> to add them from HM Land
                    Registry&apos;s CCOD and OCOD.
                  </p>
                )}
                <OutOfDate area={area} />
                <Attributions datasets={[...area.datasets, ...titleDatasets]} />
              </>
            )}
          </>
        ) : (
          <p>
            Land data not prepared for this area. Add {name} with{" "}
            <code>pnpm data:prepare --area "{name}"</code>.
          </p>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="land-coverage-area-heading">
      <h3 id="land-coverage-area-heading">Land Coverage Area</h3>
      {body}
      {council.status === "ok" && boundaries && (
        <p className="layer-note">
          Council boundaries from {boundaries.source}, as at{" "}
          {sourceDate(boundaries)}, prepared on {preparedOn(boundaries)}.
        </p>
      )}
    </section>
  );
};
