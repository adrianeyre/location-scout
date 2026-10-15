import { useEffect, useRef, type ReactNode } from "react";

import {
  AGE_GROUPS,
  AMENITY_TYPES,
  CATEGORY_NAMES,
  EPC_BANDS,
  GREEN_SPACE_TYPES,
  OFSTED_JUDGEMENTS,
  OWNERSHIP_CATEGORIES,
  OWNERSHIP_CATEGORY_NAMES,
  PLANNING_APPLICATION_STATUSES,
  PLANNING_CONSTRAINT_TYPES,
  PROPERTY_TYPES,
  SERVED_LAYER_IDS,
  SCHOOL_PHASES,
  TRANSPORT_FACILITY_TYPES,
  type CategoryScore,
  type CrimeLayerResponse,
  type DemographicsLayerResponse,
  type GreenSpaceLayerResponse,
  type AmenitiesLayerResponse,
  type LandLayerResponse,
  type LayerResponse,
  type PlanningLayerResponse,
  type PropertyLayerResponse,
  type SchoolsLayerResponse,
  type ScoutMode,
  type ServedLayerId,
  type TransportLayerResponse,
} from "@location-scout/shared";

import {
  formatChange,
  formatCount,
  formatDistance,
  formatKilometres,
  formatMonth,
  formatPeriod,
  formatPrice,
  formatShortPrice,
} from "../format";
import { HIGHLIGHT_LEVEL_LABELS } from "../highlight-levels";
import { LevelIcon } from "../Highlights";
import { HighlightedBy } from "../layers/HighlightedBy";
import { LayerIcon } from "../layers/LayerIcon";
import {
  AGE_GROUP_NAMES,
  AMENITY_NAMES,
  GREEN_SPACE_NAMES,
  LAYER_STYLES,
  OFSTED_JUDGEMENT_NAMES,
  OWNERSHIP_CATEGORY_COLOURS,
  PLANNING_APPLICATION_STATUS_STYLES,
  PLANNING_APPLICATION_TYPE_NAMES,
  PLANNING_APPLICATIONS_RATE_LIMITED,
  PLANNING_CONSTRAINT_STYLES,
  PROPERTY_TYPE_NAMES,
  SCHOOL_PHASE_NAMES,
  TRANSPORT_STYLES,
} from "../layers/layer-styles";
import { weighed, whyLeftOut } from "../scores-shown";
import type { LayerState, SearchResult } from "../useSearchArea";
import type { CustomWeights } from "../weights";
import {
  BarTable,
  Bullet,
  DecileScale,
  Dumbbell,
  LineChart,
  PartsBar,
  ScoreGauge,
  StatTile,
  type BarRow,
} from "./charts";
import type { DashboardLayoutState } from "./useDashboardLayout";
import { WidgetGrid, type WidgetControls } from "./WidgetGrid";
import { highlightCounts, salesByPeriod } from "./dashboard-data";

/** The order Highlights are counted in: Concerns first, as the Overview gives them. */
const LEVELS = ["concern", "watch", "good"] as const;

/** EPC bands in the colours the certificates themselves use, A green to G red. */
const EPC_COLOURS = {
  A: "#007f3d",
  B: "#2c9f29",
  C: "#9dcb3c",
  D: "#fff200",
  E: "#f7af1d",
  F: "#ed6823",
  G: "#e31d23",
} as const;

/** Ofsted judgements, from the best grade to none, in one hue light to dark. */
const JUDGEMENT_COLOURS: Readonly<Record<string, string>> = {
  outstanding: "#0b5394",
  good: "#3d85c6",
  "requires-improvement": "#9fc5e8",
  inadequate: "#cfe2f3",
  "report-card": "#8e8e8e",
  "no-overall-grade": "#b7b7b7",
  none: "#d9d9d9",
};

const count = (value: number) => value.toLocaleString("en-GB");

/** "up" for a rise, "down" for a fall, "flat" for none, for a delta's arrow. */
const direction = (change: number) =>
  change > 0 ? "up" : change < 0 ? "down" : "flat";

/** A delta for a stat tile, from a change in per cent, or none without one. */
const delta = (change: number | null, against: string) =>
  change === null
    ? null
    : ({
        text: `${formatChange(change)} ${against}`,
        direction: direction(change),
      } as const);

const rows = <T,>(items: readonly T[], row: (item: T) => BarRow): BarRow[] =>
  items.map(row);

/* ----- Each Layer's card ----- */

const CrimeCard = ({
  statistics,
}: {
  statistics: CrimeLayerResponse["statistics"];
}) => {
  if (!statistics) return <NoFigures />;
  const { trend } = statistics;
  return (
    <>
      <dl className="card-stats">
        <StatTile
          label="Last 12 months"
          value={count(trend.total.last12Months)}
          delta={
            trend.complete
              ? delta(trend.total.change, "on the 12 before")
              : null
          }
          detail={formatPeriod(trend.last12Months)}
        />
        <StatTile
          label={`In ${formatMonth(statistics.month)}`}
          value={count(statistics.total)}
          detail="The latest month published"
        />
      </dl>
      {!trend.complete && (
        <p className="trend-incomplete">
          Some months are missing, so the year-on-year change isn&apos;t given.
        </p>
      )}
      <h4>By category, the 12 months before against the last 12</h4>
      <Dumbbell
        caption="Crimes by category: the 12 months before, the last 12 months, and the change"
        beforeLabel={formatPeriod(trend.previous12Months)}
        afterLabel={formatPeriod(trend.last12Months)}
        rows={trend.byCategory.map(
          ({ category, name, previous12Months, last12Months, change }) => ({
            key: category,
            label: name,
            before: previous12Months,
            after: last12Months,
            change: change === null ? "–" : formatChange(change),
          }),
        )}
      />
    </>
  );
};

const PlanningCard = ({ response }: { response: PlanningLayerResponse }) => {
  const { statistics, applications } = response;
  const appStats = applications?.statistics ?? null;
  return (
    <>
      {statistics ? (
        <>
          <h4>Planning Constraints in the Search Area</h4>
          <BarTable
            caption="Planning Constraints by type"
            label="Type"
            value="Count"
            rows={rows(PLANNING_CONSTRAINT_TYPES, (type) => {
              const found = statistics.byType.find(
                (each) => each.type === type,
              );
              const value = found?.count ?? 0;
              return {
                key: type,
                label: PLANNING_CONSTRAINT_STYLES[type].name[1],
                value,
                shown: count(value),
                note: found?.coversLocation ? "Covers the Location" : undefined,
              };
            })}
          />
          {statistics.coveringLocation.length > 0 && (
            <p className="card-note">
              <strong>At the Location:</strong>{" "}
              {statistics.coveringLocation.map(({ name }) => name).join("; ")}
            </p>
          )}
        </>
      ) : (
        <p>Planning Constraints are unavailable.</p>
      )}
      <h4>Planning Applications, last 3 years</h4>
      {applications?.status === "queued" ? (
        <p>{PLANNING_APPLICATIONS_RATE_LIMITED}…</p>
      ) : appStats ? (
        <>
          <dl className="card-stats">
            <StatTile label="Applications" value={count(appStats.count)} />
            <StatTile
              label="Homes approved or pending"
              value={count(appStats.housing.homes)}
              detail="Estimated"
            />
          </dl>
          <PartsBar
            label="Planning Applications by status"
            unit="applications"
            parts={PLANNING_APPLICATION_STATUSES.map((status) => ({
              key: status,
              name: PLANNING_APPLICATION_STATUS_STYLES[status].name,
              colour: PLANNING_APPLICATION_STATUS_STYLES[status].colour,
              count:
                appStats.byStatus.find((each) => each.status === status)
                  ?.count ?? 0,
            }))}
          />
          <BarTable
            caption="Planning Applications by type"
            label="Type"
            value="Count"
            rows={appStats.byType.map(({ type, count: value }) => ({
              key: type,
              label: PLANNING_APPLICATION_TYPE_NAMES[type][1],
              value,
              shown: count(value),
            }))}
          />
        </>
      ) : (
        <p>Planning Applications are unavailable.</p>
      )}
    </>
  );
};

const AmenitiesCard = ({
  statistics,
}: {
  statistics: AmenitiesLayerResponse["statistics"];
}) => {
  if (!statistics) return <NoFigures />;
  const sorted = [...AMENITY_TYPES].sort(
    (a, b) =>
      (statistics.byType.find((each) => each.type === b)?.count ?? 0) -
      (statistics.byType.find((each) => each.type === a)?.count ?? 0),
  );
  const present = statistics.byType.filter(({ count: value }) => value > 0);
  return (
    <>
      <dl className="card-stats">
        <StatTile label="Amenities" value={count(statistics.total)} />
        <StatTile
          label="Types present"
          value={`${String(present.length)} of ${String(AMENITY_TYPES.length)}`}
        />
      </dl>
      <BarTable
        caption="Amenities by type, most first"
        label="Type"
        value="Count"
        rows={rows(sorted, (type) => {
          const found = statistics.byType.find((each) => each.type === type);
          const value = found?.count ?? 0;
          return {
            key: type,
            label: AMENITY_NAMES[type][1],
            value,
            shown: count(value),
            note: found?.nearest
              ? `nearest ${formatDistance(found.nearest.distanceMetres)}`
              : undefined,
          };
        })}
      />
    </>
  );
};

const SchoolsCard = ({
  statistics,
}: {
  statistics: SchoolsLayerResponse["statistics"];
}) => {
  if (!statistics) return <NoFigures />;
  const nearest = (school: typeof statistics.nearestPrimary, within: number) =>
    school
      ? {
          value: formatDistance(school.distanceMetres),
          detail: `${school.name}, ${OFSTED_JUDGEMENT_NAMES[school.judgement]}`,
        }
      : { value: "None", detail: `None within ${formatDistance(within)}` };
  const primary = nearest(
    statistics.nearestPrimary,
    statistics.primarySearchMetres,
  );
  const secondary = nearest(
    statistics.nearestSecondary,
    statistics.secondarySearchMetres,
  );
  return (
    <>
      <dl className="card-stats">
        <StatTile label="Schools" value={count(statistics.total)} />
        <StatTile label="Nearest primary" {...primary} />
        <StatTile label="Nearest secondary" {...secondary} />
      </dl>
      <h4>Latest Ofsted judgements</h4>
      <PartsBar
        label="Schools by latest Ofsted judgement"
        unit="schools"
        parts={OFSTED_JUDGEMENTS.map((judgement) => ({
          key: judgement,
          name: OFSTED_JUDGEMENT_NAMES[judgement],
          colour: JUDGEMENT_COLOURS[judgement] ?? "#d9d9d9",
          count:
            statistics.byJudgement.find((each) => each.judgement === judgement)
              ?.count ?? 0,
        }))}
      />
      <h4>By phase</h4>
      <BarTable
        caption="Schools by phase"
        label="Phase"
        value="Count"
        rows={rows(SCHOOL_PHASES, (phase) => {
          const value =
            statistics.byPhase.find((each) => each.phase === phase)?.count ?? 0;
          return {
            key: phase,
            label: SCHOOL_PHASE_NAMES[phase][1],
            value,
            shown: count(value),
          };
        })}
      />
    </>
  );
};

const TransportCard = ({
  statistics,
}: {
  statistics: TransportLayerResponse["statistics"];
}) => {
  if (!statistics) return <NoFigures />;
  const station = statistics.nearestStation;
  return (
    <>
      <dl className="card-stats">
        <StatTile
          label="Nearest railway station"
          value={station ? formatDistance(station.distanceMetres) : "None"}
          detail={
            station
              ? (station.name ?? "Unnamed railway station")
              : `None within ${formatDistance(statistics.stationSearchMetres)}`
          }
        />
        {statistics.routes.map(({ type, lengthMetres }) => (
          <StatTile
            key={type}
            label={TRANSPORT_STYLES[type].name[1]}
            value={formatKilometres(lengthMetres)}
          />
        ))}
      </dl>
      <BarTable
        caption="Transport facilities by type"
        label="Type"
        value="Count"
        rows={rows(TRANSPORT_FACILITY_TYPES, (type) => {
          const value =
            statistics.facilities.find((each) => each.type === type)?.count ??
            0;
          return {
            key: type,
            label: TRANSPORT_STYLES[type].name[1],
            value,
            shown: count(value),
          };
        })}
      />
    </>
  );
};

const GreenSpaceCard = ({
  statistics,
}: {
  statistics: GreenSpaceLayerResponse["statistics"];
}) => {
  if (!statistics) return <NoFigures />;
  const park = statistics.nearestPark;
  return (
    <>
      <dl className="card-stats">
        <StatTile label="Green spaces" value={count(statistics.total)} />
        <StatTile
          label="Nearest park"
          value={
            park
              ? park.coversLocation
                ? "Here"
                : formatDistance(park.distanceMetres)
              : "None"
          }
          detail={
            park
              ? (park.name ?? "Unnamed park")
              : `None within ${formatDistance(statistics.parkSearchMetres)}`
          }
        />
      </dl>
      <BarTable
        caption="Green spaces by type"
        label="Type"
        value="Count"
        rows={rows(GREEN_SPACE_TYPES, (type) => {
          const value =
            statistics.byType.find((each) => each.type === type)?.count ?? 0;
          return {
            key: type,
            label: GREEN_SPACE_NAMES[type][1],
            value,
            shown: count(value),
          };
        })}
      />
    </>
  );
};

const PropertyCard = ({ response }: { response: PropertyLayerResponse }) => {
  const { statistics, features, epc } = response;
  if (!statistics) return <NoFigures />;
  const { twelveMonths, fiveYears } = statistics.medianChange;
  const periods = salesByPeriod(features);
  const epcStats = epc?.statistics ?? null;
  return (
    <>
      <dl className="card-stats">
        <StatTile
          label="Median price"
          value={
            statistics.all.median === null
              ? "–"
              : formatPrice(statistics.all.median)
          }
          delta={delta(twelveMonths.change, "on a year before")}
          detail={`${formatCount(statistics.all.count, ["sale", "sales"])}, ${formatPeriod(statistics.period)}`}
        />
        <StatTile
          label="Over 5 years"
          value={
            fiveYears.change === null ? "–" : formatChange(fiveYears.change)
          }
          detail="Change in the median price"
        />
      </dl>
      <h4>Median price over time</h4>
      <LineChart
        label="Median sale price over time"
        xHeading="Period"
        yHeading="Median price"
        formatTick={formatShortPrice}
        points={periods.map(({ at, label, median, count: sales }) => ({
          key: label,
          x: at,
          y: median,
          xLabel: label,
          yLabel: formatPrice(median),
          note: formatCount(sales, ["sale", "sales"]),
        }))}
      />
      <h4>Median price by property type</h4>
      <BarTable
        caption="Median sale price by property type"
        label="Property type"
        value="Median price"
        rows={rows(PROPERTY_TYPES, (type) => {
          const found = statistics.byType.find((each) => each.type === type);
          const median = found?.median ?? null;
          return {
            key: type,
            label: PROPERTY_TYPE_NAMES[type][1],
            value: median ?? 0,
            shown: median === null ? "–" : formatShortPrice(median),
            note: formatCount(found?.count ?? 0, ["sale", "sales"]),
          };
        })}
      />
      {epcStats && epcStats.homes > 0 && (
        <>
          <h4>Energy ratings</h4>
          <PartsBar
            label="Homes by EPC band"
            unit="homes"
            parts={EPC_BANDS.map((band) => ({
              key: band,
              name: `Band ${band}`,
              colour: EPC_COLOURS[band],
              count:
                epcStats.byBand.find((each) => each.band === band)?.count ?? 0,
            }))}
          />
        </>
      )}
    </>
  );
};

const LandCard = ({
  statistics,
}: {
  statistics: LandLayerResponse["statistics"];
}) => {
  if (!statistics) return <NoFigures />;
  return (
    <>
      <dl className="card-stats">
        <StatTile label="Land Opportunities" value={count(statistics.count)} />
        <StatTile
          label="Area in all"
          value={`${statistics.totalHectares.toLocaleString("en-GB", { maximumFractionDigits: 1 })} ha`}
        />
        <StatTile
          label="Room for about"
          value={count(statistics.estimatedHomes)}
          detail="homes, estimated"
        />
      </dl>
      {statistics.ownershipCategories && (
        <>
          <h4>By Ownership Category, indicative</h4>
          <PartsBar
            label="Land Opportunities by Ownership Category, indicative"
            unit="Land Opportunities"
            parts={OWNERSHIP_CATEGORIES.map((category) => ({
              key: category,
              name: OWNERSHIP_CATEGORY_NAMES[category],
              colour: OWNERSHIP_CATEGORY_COLOURS[category],
              count: statistics.ownershipCategories?.[category] ?? 0,
            }))}
          />
        </>
      )}
    </>
  );
};

const DemographicsCard = ({
  statistics,
}: {
  statistics: DemographicsLayerResponse["statistics"];
}) => {
  if (!statistics) return <NoFigures />;
  const { householdIncome: income, deprivation } = statistics;
  return (
    <>
      <dl className="card-stats">
        <StatTile
          label="Residents"
          value={count(statistics.population)}
          detail="Estimated"
        />
        <StatTile label="Households" value={count(statistics.households)} />
        <StatTile
          label="Median age"
          value={
            statistics.medianAge === null ? "–" : String(statistics.medianAge)
          }
        />
      </dl>
      <h4>Age profile</h4>
      <BarTable
        caption="Residents by age group, as a share of all"
        label="Age group"
        value="Share"
        rows={rows(AGE_GROUPS, (group) => {
          const found = statistics.ageProfile.find(
            (each) => each.group === group,
          );
          const percent = found?.percent ?? 0;
          return {
            key: group,
            label: AGE_GROUP_NAMES[group],
            value: percent,
            shown: `${percent.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`,
            note: count(found?.population ?? 0),
          };
        })}
      />
      {income && (
        <>
          <h4>Average household income</h4>
          <p className="card-figure">
            {formatPrice(income.averagePounds)}{" "}
            <span>
              {againstEngland(income.averagePounds, income.englandMedianPounds)}
            </span>
          </p>
          <Bullet
            value={income.averagePounds}
            mark={income.englandMedianPounds}
            max={
              Math.max(income.averagePounds, income.englandMedianPounds) * 1.25
            }
            valueLabel="This Search Area"
            markLabel="England's median"
          />
        </>
      )}
      {deprivation && (
        <>
          <h4>Deprivation decile</h4>
          <p className="card-figure">
            {deprivation.atLocation
              ? `${String(deprivation.atLocation.decile)} of 10 at the Location`
              : "Not known at the Location"}{" "}
            <span>
              {deprivation.lowestDecile === deprivation.highestDecile
                ? `${String(deprivation.lowestDecile)} across the Search Area`
                : `${String(deprivation.lowestDecile)} to ${String(deprivation.highestDecile)} across the Search Area`}
              ; 1 is the most deprived tenth of England, 10 the least
            </span>
          </p>
          <DecileScale
            lowest={deprivation.lowestDecile}
            highest={deprivation.highestDecile}
            at={deprivation.atLocation?.decile ?? null}
          />
        </>
      )}
    </>
  );
};

/** "11.8% below England's median of £44,091", or above, or the same as. */
const againstEngland = (pounds: number, england: number) => {
  const percent = ((pounds - england) / england) * 100;
  const size = Math.abs(percent).toLocaleString("en-GB", {
    maximumFractionDigits: 1,
  });
  const where =
    Math.round(percent * 10) === 0
      ? "The same as"
      : `${size}% ${percent > 0 ? "above" : "below"}`;
  return `${where} England's median of ${formatPrice(england)}`;
};

/** Shimmering bars where figures will be, so nothing jumps when they come. */
const Placeholder = () => (
  <>
    <p className="visually-hidden">Loading…</p>
    <div className="card-loading" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  </>
);

const NoFigures = () => <p>No figures for this Search Area.</p>;

/** One Layer's card, by what its response is. */
const layerBody = (response: LayerResponse): ReactNode => {
  switch (response.layer) {
    case "crime":
      return <CrimeCard statistics={response.statistics} />;
    case "planning":
      return <PlanningCard response={response} />;
    case "amenities":
      return <AmenitiesCard statistics={response.statistics} />;
    case "schools":
      return <SchoolsCard statistics={response.statistics} />;
    case "transport":
      return <TransportCard statistics={response.statistics} />;
    case "green-space":
      return <GreenSpaceCard statistics={response.statistics} />;
    case "property":
      return <PropertyCard response={response} />;
    case "land":
      return <LandCard statistics={response.statistics} />;
    case "demographics":
      return <DemographicsCard statistics={response.statistics} />;
  }
};

const layerHeading = (layer: ServedLayerId) => `dashboard-${layer}-heading`;

/** One Layer's Widget: its header, with its grip, and its figures. */
const LayerCard = ({
  layer,
  state,
  scoutMode,
  onShowOnMap,
  controls,
}: {
  layer: ServedLayerId;
  state: LayerState;
  scoutMode: ScoutMode | null;
  onShowOnMap: (layer: ServedLayerId) => void;
  controls: WidgetControls;
}) => {
  const { name } = LAYER_STYLES[layer];
  let body: ReactNode;
  if (state.status === "loading") {
    body = <Placeholder />;
  } else if (state.status === "unavailable") {
    body = (
      <p>
        <strong>Unavailable.</strong> Its Data Source didn&apos;t answer, so
        there are no figures for now.
      </p>
    );
  } else if (state.status === "not-prepared") {
    body = (
      <p>
        <strong>Not prepared.</strong> Run <code>pnpm data:prepare</code> to
        show this Layer.
      </p>
    );
  } else {
    body = layerBody(state);
  }
  return (
    <>
      <header className="card-head">
        {controls.grip}
        <h3 id={layerHeading(layer)}>
          <LayerIcon layer={layer} />
          {name}
        </h3>
        {scoutMode?.highlightedLayers.includes(layer) && (
          <HighlightedBy scoutMode={scoutMode} />
        )}
        <button
          type="button"
          className="link-button card-map-link"
          aria-label={`Show on the map: ${name}`}
          onClick={() => {
            onShowOnMap(layer);
          }}
        >
          Show on the map
        </button>
        {controls.hide}
      </header>
      {body}
    </>
  );
};

/* ----- The top of the Dashboard: the scores and the Highlights ----- */

const ScoresCard = ({
  result,
  scoutMode,
  weights,
}: {
  result: SearchResult;
  scoutMode: ScoutMode | null;
  weights: CustomWeights | null;
}) => {
  const { scores } = result;
  if (scores.status !== "ok") {
    return (
      <>
        <ScoreGauge score={null} label="Location Score" />
        <p className="card-note">
          {scores.status === "loading"
            ? "The scores follow once every Layer they need has loaded."
            : "The scores can't be shown for now."}
        </p>
      </>
    );
  }
  const { location, modeName, custom } = weighed(
    scores.scores,
    scoutMode,
    weights,
  );
  return (
    <>
      <ScoreGauge score={location.score} label="Location Score" />
      <Extremes categories={scores.scores.categories} />
      <p className="card-note">
        Weighed for the <strong>{modeName}</strong> Scout Mode
        {custom ? ", with your own weights" : ""}.{" "}
        {location.leftOut.length > 0 &&
          `${formatCount(location.leftOut.length, ["category", "categories"])} left out.`}
      </p>
    </>
  );
};

/** The strongest and weakest Category Scores, the first places to look. */
const Extremes = ({ categories }: { categories: readonly CategoryScore[] }) => {
  const scored = categories.flatMap(({ id, score }) =>
    score === null ? [] : [{ id, score }],
  );
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const [best, worst] = [sorted[0], sorted.at(-1)];
  if (!best || !worst || best.score === worst.score) return null;
  return (
    <dl className="score-extremes">
      <div>
        <dt>Strongest</dt>
        <dd>
          {CATEGORY_NAMES[best.id]} <strong>{best.score}</strong>
        </dd>
      </div>
      <div>
        <dt>Weakest</dt>
        <dd>
          {CATEGORY_NAMES[worst.id]} <strong>{worst.score}</strong>
        </dd>
      </div>
    </dl>
  );
};

const CategoryScoresCard = ({ result }: { result: SearchResult }) => {
  const { scores } = result;
  if (scores.status !== "ok") {
    return scores.status === "loading" ? (
      <Placeholder />
    ) : (
      <p>Unavailable for now.</p>
    );
  }
  return (
    <BarTable
      caption="Category Scores, each out of 100"
      label="Category"
      value="Score"
      max={100}
      rows={scores.scores.categories.map((category) => ({
        key: category.id,
        label: CATEGORY_NAMES[category.id],
        value: category.score ?? 0,
        shown:
          category.score === null
            ? "Left out"
            : `${String(category.score)}/100`,
        note: category.score === null ? whyLeftOut(category) : undefined,
      }))}
    />
  );
};

const HighlightsCard = ({
  result,
  onShowOnMap,
}: {
  result: SearchResult;
  onShowOnMap: (layer: ServedLayerId) => void;
}) => {
  const { highlights } = result;
  if (highlights.status !== "ok") {
    return highlights.status === "loading" ? (
      <Placeholder />
    ) : (
      <p>Unavailable for now.</p>
    );
  }
  const list = highlights.highlights.highlights;
  const counts = highlightCounts(list);
  return (
    <>
      <dl className="highlight-counts">
        {LEVELS.map((level) => (
          <div key={level} data-level={level}>
            <dt>
              <LevelIcon level={level} />
              {HIGHLIGHT_LEVEL_LABELS[level].name}
            </dt>
            <dd>{counts[level]}</dd>
          </div>
        ))}
      </dl>
      {list.length > 0 ? (
        <ul className="dashboard-highlights" aria-label="Highlights">
          {list.map(({ rule, level, text, layer }) => (
            <li key={rule}>
              <button
                type="button"
                className="highlight"
                data-level={level}
                title={`Show the ${LAYER_STYLES[layer].name} Layer on the map`}
                onClick={() => {
                  onShowOnMap(layer);
                }}
              >
                <LevelIcon level={level} />
                <span className="highlight-body">
                  <span className="highlight-level">
                    {HIGHLIGHT_LEVEL_LABELS[level].name}:
                  </span>{" "}
                  <span className="highlight-text">{text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nothing stands out in this Search Area.</p>
      )}
    </>
  );
};

interface DashboardProps {
  result: SearchResult | null;
  scoutMode: ScoutMode | null;
  weights: CustomWeights | null;
  /** Goes back to the map. */
  onClose: () => void;
  /** Goes back to the map, showing a Layer there and pointing it out. */
  onShowOnMap: (layer: ServedLayerId) => void;
  /** Where its Widgets sit, kept above it so Settings can show the hidden ones again. */
  widgetLayout: DashboardLayoutState;
}

/**
 * The Dashboard: every figure the Search Area has, drawn. The Location
 * Score and the Highlights lead, then a card for each Layer, those the Scout
 * Mode highlights first. It shows only what the Location Overview does, from
 * the same responses, so nothing more is loaded for it.
 */
export const Dashboard = ({
  result,
  scoutMode,
  weights,
  onClose,
  onShowOnMap,
  widgetLayout: { layout, moved, setLayout, reset },
}: DashboardProps) => {
  const heading = useRef<HTMLHeadingElement>(null);
  // Its heading takes focus when it opens, so a screen reader starts there.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const where = result
    ? (result.found?.label ??
      `${result.area.location.lat.toFixed(5)}, ${result.area.location.lng.toFixed(5)}`)
    : null;
  return (
    <main
      className="dashboard"
      id="main"
      tabIndex={-1}
      aria-labelledby="dashboard-heading"
    >
      <div className="dashboard-bar">
        <div className="dashboard-title">
          <h2 id="dashboard-heading" ref={heading} tabIndex={-1}>
            Dashboard
          </h2>
          {result && where && (
            <p>
              <strong>{where}</strong>, {result.area.searchRadius.miles} mile
              around it
              {scoutMode && (
                <>
                  {" "}
                  · {scoutMode.name}: {scoutMode.question}
                </>
              )}
            </p>
          )}
        </div>
        <div className="dashboard-actions">
          {result && moved && (
            <button type="button" onClick={reset}>
              Reset layout
            </button>
          )}
          <button type="button" data-variant="primary" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M15 5 8 12l7 7" />
            </svg>
            Back to the map
          </button>
        </div>
      </div>
      {result ? (
        <>
          <WidgetGrid
            layout={layout}
            onLayout={setLayout}
            widgets={[
              {
                id: "score",
                title: "Location Score",
                labelledBy: "dashboard-score-heading",
                className: "dashboard-score",
                content: (controls) => (
                  <>
                    <header className="card-head">
                      {controls.grip}
                      <h3 id="dashboard-score-heading">
                        Location Score <span className="beta">beta</span>
                      </h3>
                      {controls.hide}
                    </header>
                    <ScoresCard
                      result={result}
                      scoutMode={scoutMode}
                      weights={weights}
                    />
                  </>
                ),
              },
              {
                id: "categories",
                title: "Category Scores",
                labelledBy: "dashboard-categories-heading",
                content: (controls) => (
                  <>
                    <header className="card-head">
                      {controls.grip}
                      <h3 id="dashboard-categories-heading">
                        Category Scores <span className="beta">beta</span>
                      </h3>
                      {controls.hide}
                    </header>
                    <CategoryScoresCard result={result} />
                  </>
                ),
              },
              {
                id: "highlights",
                title: "What you need to know",
                labelledBy: "dashboard-highlights-heading",
                content: (controls) => (
                  <>
                    <header className="card-head">
                      {controls.grip}
                      <h3 id="dashboard-highlights-heading">
                        What you need to know
                      </h3>
                      {controls.hide}
                    </header>
                    <HighlightsCard result={result} onShowOnMap={onShowOnMap} />
                  </>
                ),
              },
              ...SERVED_LAYER_IDS.map((layer) => ({
                id: layer,
                title: LAYER_STYLES[layer].name,
                labelledBy: layerHeading(layer),
                layer,
                busy: result.layers[layer].status === "loading",
                content: (controls: WidgetControls) => (
                  <LayerCard
                    layer={layer}
                    state={result.layers[layer]}
                    scoutMode={scoutMode}
                    onShowOnMap={onShowOnMap}
                    controls={controls}
                  />
                ),
              })),
            ]}
          />
          <p className="layer-note dashboard-note">
            The Dashboard draws the figures the Location Overview gives, from
            the same Data Sources, credited at the foot of the page. Scores and
            Highlights come from fixed rules, never from AI.
          </p>
        </>
      ) : (
        <p className="empty-state">
          Enter a postcode or an address to see its Dashboard.
        </p>
      )}
    </main>
  );
};
