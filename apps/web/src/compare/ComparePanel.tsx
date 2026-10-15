import { useMemo, useState, type ReactNode } from "react";

import {
  LAND_OPPORTUNITY_WORDING,
  weighedCategories,
  type CategoryId,
  type ScoutMode,
  type ScoutModeId,
} from "@location-scout/shared";

import { formatList } from "../format";
import { HIGHLIGHT_LEVEL_LABELS } from "../highlight-levels";
import { LevelIcon } from "../Highlights";
import {
  LAYER_STYLES,
  PLANNING_APPLICATIONS_RATE_LIMITED,
} from "../layers/layer-styles";
import { describeSearchArea } from "../saved/saved-locations";
import type { useSavedLocations } from "../saved/useSavedLocations";
import type { HighlightsState } from "../useSearchArea";
import type { CustomWeights } from "../weights";
import {
  KEY_STATISTICS,
  MAX_COMPARED,
  MIN_COMPARED,
  sameSearchRadius,
  scoreRows,
  statisticRows,
  type ComparedColumn,
  type ComparedFigure,
  type ComparisonRow,
} from "./comparison";
import { useComparison } from "./useComparison";

interface ComparePanelProps {
  saved: ReturnType<typeof useSavedLocations>;
  /** The Scout Mode chosen above, which every column is compared in. */
  mode: ScoutModeId;
  /** That Scout Mode, once the modes have loaded. */
  scoutMode: ScoutMode | null;
  /** The user's own weights for it, or `null` for its defaults (PRD FR-4.4). */
  weights: CustomWeights | null;
}

/** What a figure that hasn't been found says instead. */
const FIGURE_TEXTS: Readonly<
  Record<Exclude<ComparedFigure["status"], "ok">, string>
> = {
  loading: "Loading…",
  unavailable: "Unavailable",
  "not-prepared": "Not prepared",
  "outside-coverage": "Land data not prepared for this area",
  queued: PLANNING_APPLICATIONS_RATE_LIMITED,
};

/** One column's figure in a row, marked if it is the row's best. */
const FigureCell = ({
  figure,
  best,
}: {
  figure: ComparedFigure;
  best: boolean;
}) => (
  <td className={best ? "compare-best" : undefined}>
    {figure.status === "ok" ? figure.text : FIGURE_TEXTS[figure.status]}
    {best && (
      <span className="compare-best-mark">
        {" "}
        <span aria-hidden="true">★</span> Best
      </span>
    )}
  </td>
);

/** Rows of figures, one cell for each column, keyed by its Saved Location's id. */
const Rows = ({
  rows,
  columns,
}: {
  rows: readonly ComparisonRow[];
  columns: readonly ComparedColumn[];
}) =>
  rows.map(({ id, name, figures, best }) => (
    <tr key={id}>
      <th scope="row">{name}</th>
      {figures.map((figure, index) => (
        <FigureCell
          key={columns[index]?.saved.id ?? index}
          figure={figure}
          best={best[index] ?? false}
        />
      ))}
    </tr>
  ));

/** A section of the table, headed across every column. */
const SectionHeading = ({
  id,
  columns,
  children,
}: {
  id: string;
  columns: number;
  children: ReactNode;
}) => (
  <tr className="compare-section">
    <th id={id} scope="colgroup" colSpan={columns + 1}>
      {children}
    </th>
  </tr>
);

/** One column's Highlights, as the Location Overview gives them (PRD FR-3.7). */
const HighlightsCell = ({ state }: { state: HighlightsState }) => {
  if (state.status !== "ok") {
    return <td>{FIGURE_TEXTS[state.status]}</td>;
  }
  const { highlights, leftOut } = state.highlights;
  return (
    <td className="compare-highlights">
      {highlights.length > 0 ? (
        <ul>
          {highlights.map(({ rule, level, text }) => {
            const { name } = HIGHLIGHT_LEVEL_LABELS[level];
            return (
              <li key={rule} data-level={level}>
                <LevelIcon level={level} />
                <span>
                  {name}: {text}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        "Nothing stands out"
      )}
      {leftOut.length > 0 && (
        <p className="compare-left-out">
          Left out: the{" "}
          {formatList(leftOut.map(({ layer }) => LAYER_STYLES[layer].name))}{" "}
          {leftOut.length === 1 ? "Layer" : "Layers"}
        </p>
      )}
    </td>
  );
};

/**
 * The categories compared: those the Scout Mode weighs, or, until the modes
 * arrive, those the first scores to arrive give.
 */
const categoriesCompared = (
  scoutMode: ScoutMode | null,
  columns: readonly ComparedColumn[],
): CategoryId[] => {
  if (scoutMode) return weighedCategories(scoutMode);
  for (const { scores } of columns) {
    if (scores.status === "ok") {
      return scores.scores.categories.map(({ id }) => id);
    }
  }
  return [];
};

/** The counted key statistics, named, for when they can't be judged. */
const COUNTED = formatList(
  KEY_STATISTICS.filter(({ counted }) => counted).map(({ name }) =>
    name.toLowerCase(),
  ),
);

const ComparisonTable = ({
  columns,
  modeName,
  scoutMode,
  weights,
}: {
  columns: readonly ComparedColumn[];
  modeName: string;
  scoutMode: ScoutMode | null;
  weights: CustomWeights | null;
}) => {
  const categories = categoriesCompared(scoutMode, columns);
  const scores = scoreRows(columns, categories, weights);
  const statistics = statisticRows(columns, KEY_STATISTICS);
  return (
    <>
      <table className="compare-table">
        <caption>
          Compared in the {modeName} Scout Mode, with{" "}
          {weights ? "your own weights" : "its default weights"}
        </caption>
        <thead>
          <tr>
            <td />
            {columns.map(({ saved }) => (
              <th key={saved.id} scope="col">
                {saved.name}{" "}
                <span className="compare-where">
                  {describeSearchArea(saved)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-labelledby="compare-scores">
          <SectionHeading id="compare-scores" columns={columns.length}>
            Scores <span className="beta">beta</span>
          </SectionHeading>
          <Rows rows={scores} columns={columns} />
        </tbody>
        <tbody aria-labelledby="compare-highlights">
          <SectionHeading id="compare-highlights" columns={columns.length}>
            What you need to know
          </SectionHeading>
          <tr>
            <th scope="row">Highlights</th>
            {columns.map(({ saved, highlights }) => (
              <HighlightsCell key={saved.id} state={highlights} />
            ))}
          </tr>
        </tbody>
        <tbody aria-labelledby="compare-statistics">
          <SectionHeading id="compare-statistics" columns={columns.length}>
            Key statistics
          </SectionHeading>
          <Rows rows={statistics} columns={columns} />
        </tbody>
      </table>
      <p className="layer-note">
        <span aria-hidden="true">★</span> Best marks the highest score in each
        row, and the fewest crimes, the nearest station, school or park, and so
        on. Prices, residents, incomes and Planning Applications are compared
        but not judged. A Category Score that is unavailable is left out of its
        Location Score, and the rest reweighed.
      </p>
      {!sameSearchRadius(columns) && (
        <p className="layer-note">
          These Search Areas differ in size, so counts of what is in them (
          {COUNTED}) aren&apos;t marked best.
        </p>
      )}
      <p className="land-wording">
        <strong>Land Opportunities:</strong> {LAND_OPPORTUNITY_WORDING}
      </p>
    </>
  );
};

/**
 * The Compare tab (PRD FR-7.3, FR-9.1): 2 to 4 Saved Locations side by
 * side, their Category Scores, Location Score, Highlights and key
 * statistics, all in the one Scout Mode chosen above, with the best value
 * in each row marked. Choosing another Scout Mode compares them all in it.
 */
export const ComparePanel = ({
  saved,
  mode,
  scoutMode,
  weights,
}: ComparePanelProps) => {
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const savedLocations = useMemo(
    () => (saved.state.status === "on" ? saved.state.savedLocations : []),
    [saved.state],
  );
  // In the order they are saved in; one deleted since is dropped.
  const compared = useMemo(
    () => savedLocations.filter(({ id }) => chosen.includes(id)),
    [savedLocations, chosen],
  );
  const columns = useComparison(compared, mode);
  const modeName = scoutMode?.name ?? mode;

  const choose = (id: string, on: boolean) => {
    setChosen((previous) =>
      on
        ? [...previous.filter((each) => each !== id), id]
        : previous.filter((each) => each !== id),
    );
  };

  if (saved.state.status === "off") {
    return (
      <aside className="compare-panel" aria-labelledby="compare-heading">
        <h2 id="compare-heading">Compare Saved Locations</h2>
        <p className="saved-off" role="status">
          Saving is off: this browser won&apos;t let Location Scout keep
          anything in its storage, so there are no Saved Locations to compare.
        </p>
      </aside>
    );
  }

  const full = compared.length >= MAX_COMPARED;

  return (
    <aside className="compare-panel" aria-labelledby="compare-heading">
      <h2 id="compare-heading">Compare Saved Locations</h2>
      {savedLocations.length < MIN_COMPARED ? (
        <p className="empty-state">
          Save at least {String(MIN_COMPARED)} Search Areas in the Saved tab to
          compare them here.
        </p>
      ) : (
        <fieldset className="compare-choice">
          <legend>
            Choose {String(MIN_COMPARED)} to {String(MAX_COMPARED)} to compare
          </legend>
          <ul>
            {savedLocations.map((each) => {
              const on = compared.includes(each);
              return (
                <li key={each.id}>
                  <input
                    type="checkbox"
                    id={`compare-${each.id}`}
                    checked={on}
                    disabled={!on && full}
                    aria-describedby={`compare-where-${each.id}`}
                    onChange={(event) => {
                      choose(each.id, event.target.checked);
                    }}
                  />
                  <label htmlFor={`compare-${each.id}`}>{each.name}</label>
                  <span
                    id={`compare-where-${each.id}`}
                    className="compare-where"
                  >
                    {describeSearchArea(each)}
                  </span>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      <p className="compare-status" role="status">
        {compared.length === 0
          ? null
          : compared.length < MIN_COMPARED
            ? "Choose another to compare it with."
            : full
              ? `Comparing ${String(compared.length)} Saved Locations, as many as fit side by side: untick one to compare another.`
              : `Comparing ${String(compared.length)} Saved Locations.`}
      </p>
      {compared.length >= MIN_COMPARED && (
        <>
          <p className="layer-note">
            Each is compared in the Scout Mode chosen above, whatever it was
            saved in. Choose another there to compare them all in it.
          </p>
          <ComparisonTable
            columns={columns}
            modeName={modeName}
            scoutMode={scoutMode}
            weights={weights}
          />
        </>
      )}
    </aside>
  );
};
