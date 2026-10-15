import { useState } from "react";

import {
  CATEGORY_NAMES,
  type CategoryScore,
  type LocationScore,
  type ScoresResponse,
  type ScoutMode,
} from "@location-scout/shared";

import { Explain } from "./explain/Explain";
import { formatFigure, formatList, formatPoints } from "./format";
import { PLANNING_APPLICATIONS_RATE_LIMITED } from "./layers/layer-styles";
import { ScoreWeights } from "./ScoreWeights";
import { weighed, whyLeftOut, type ShownLocationScore } from "./scores-shown";
import type { ScoresState } from "./useSearchArea";
import type { CustomWeights } from "./weights";

/** Every score is labelled beta: fixed thresholds, still to be tuned (PRD FR-3.2). */
export const Beta = () => <span className="beta">beta</span>;

/** How a Category Score left out of the Location Score is labelled. */
const LEFT_OUT_LABELS: Readonly<
  Record<Exclude<CategoryScore["status"], "ok">, string>
> = {
  unavailable: "Unavailable",
  "not-prepared": "Not prepared",
  queued: PLANNING_APPLICATIONS_RATE_LIMITED,
};

/** What a Category Score left out of the Location Score shows instead. */
export const LeftOut = ({ category }: { category: CategoryScore }) => (
  <p className="score-left-out">
    <span className="score-name">{CATEGORY_NAMES[category.id]}</span>{" "}
    <strong>
      {category.status === "ok"
        ? LEFT_OUT_LABELS.unavailable
        : LEFT_OUT_LABELS[category.status]}
    </strong>
    : {whyLeftOut(category)}, so it is left out of the Location Score
    {category.status === "queued" &&
      " until they come, which the scores show without reloading"}
    .
  </p>
);

/** The score itself, as its summary shows it: "54/100". */
export const Score = ({ score }: { score: number }) => (
  <span className="score-value">
    {score}
    <span className="score-out-of">/100</span>
  </span>
);

/**
 * The score drawn as a bar, for a glance down the list. Decoration only: the
 * figure beside it says the same in words (FR-9.5).
 */
export const ScoreMeter = ({ score }: { score: number }) => (
  <span className="score-meter" aria-hidden="true">
    <span style={{ inlineSize: `${String(score)}%` }} />
  </span>
);

/**
 * How a Category Score is reached: each input, the rule and thresholds used,
 * and the points given (PRD FR-3.3).
 */
export const CategoryBreakdown = ({
  category,
}: {
  category: CategoryScore;
}) => {
  const name = CATEGORY_NAMES[category.id];
  return (
    <table className="layer-statistics score-breakdown">
      <caption>How the {name} score is reached</caption>
      <thead>
        <tr>
          <th scope="col">Input and rule</th>
          <th scope="col">Figure</th>
          <th scope="col">Points</th>
        </tr>
      </thead>
      <tbody>
        {category.breakdown.map(({ input, value, unit, rule, points }) => (
          <tr key={input}>
            <th scope="row">
              {input}
              <span className="score-rule">{rule}</span>
            </th>
            <td>{formatFigure(value, unit)}</td>
            <td>{formatPoints(points)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={2}>
            {name} score
          </th>
          <td>{category.score}</td>
        </tr>
      </tfoot>
    </table>
  );
};

/**
 * One Category Score, which expands to its breakdown: each input, the rule
 * and thresholds used, and the points given (PRD FR-3.3), and an Explain
 * button for it while AI Explanations are on (FR-11.1).
 */
const CategoryScoreDetails = ({ category }: { category: CategoryScore }) => {
  if (category.score === null) return <LeftOut category={category} />;
  const name = CATEGORY_NAMES[category.id];
  return (
    <details className="score">
      <summary>
        <span className="score-name">{name}</span>{" "}
        <Score score={category.score} /> <Beta />
        <ScoreMeter score={category.score} />
      </summary>
      <CategoryBreakdown category={category} />
      <Explain
        subject={{ kind: "category", category: category.id }}
        name={`the ${name} score`}
      />
    </details>
  );
};

/**
 * How each Category Score is weighed in the Location Score by the Scout
 * Mode (PRD FR-4.2), or by the user's own weights (FR-4.4).
 */
export const LocationScoreWeighing = ({
  location,
  modeName,
  custom,
}: ShownLocationScore) => (
  <>
    <table className="layer-statistics score-breakdown">
      <caption>
        {custom
          ? `How the Location Score is weighed, with your own weights for the ${modeName} Scout Mode`
          : `How the Location Score is weighed, with the ${modeName} Scout Mode's weights`}
      </caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Score</th>
          <th scope="col">Weight</th>
          <th scope="col">Share</th>
          <th scope="col">Points</th>
        </tr>
      </thead>
      <tbody>
        {location.counted.map(({ id, score, weight, share, points }) => (
          <tr key={id}>
            <th scope="row">{CATEGORY_NAMES[id]}</th>
            <td>{score}</td>
            <td>{weight}</td>
            <td>{formatFigure(share, null)}%</td>
            <td>{formatPoints(points)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={4}>
            Location Score
          </th>
          <td>{location.score}</td>
        </tr>
      </tfoot>
    </table>
    <p className="layer-note">
      Each category's share is its weight out of the weights of the categories
      counted. Its points are its score times its share.
    </p>
  </>
);

/** The categories left out of the Location Score, and why (PRD FR-3.4). */
export const LocationScoreLeftOut = ({
  location,
}: {
  location: LocationScore;
}) =>
  location.leftOut.length > 0 && (
    <p className="scores-left-out">
      <strong>Left out:</strong>{" "}
      {formatList(
        location.leftOut.map(
          (category) =>
            `${CATEGORY_NAMES[category.id]} (${whyLeftOut(category)})`,
        ),
      )}
      .{" "}
      {location.counted.length > 0 &&
        "The Location Score weighs the other categories, their weights renormalised to make up 100%."}
    </p>
  );

/**
 * The Location Score, which expands to how each Category Score is weighed in
 * it by the Scout Mode (PRD FR-4.2), or by the user's own weights (FR-4.4).
 * Any category left out is named, whether or not it is expanded (FR-3.4).
 */
const LocationScoreDetails = ({
  location,
  modeName,
  custom,
}: ShownLocationScore) => (
  <>
    {location.score === null ? (
      <p className="score-left-out">
        <span className="score-name">Location Score</span>{" "}
        <strong>Unavailable</strong>: no Category Score is available.
      </p>
    ) : (
      <details className="score location-score">
        <summary>
          <span className="score-name">Location Score</span>{" "}
          <Score score={location.score} /> <Beta />
          <ScoreMeter score={location.score} />
        </summary>
        <LocationScoreWeighing
          location={location}
          modeName={modeName}
          custom={custom}
        />
      </details>
    )}
    <LocationScoreLeftOut location={location} />
  </>
);

interface WeightsProps {
  /** The user's own weights for the Scout Mode, or `null` for its defaults. */
  weights: CustomWeights | null;
  onChangeWeights: (weights: CustomWeights | null) => void;
}

const ScoresList = ({
  mode,
  categories,
  location,
  scoutMode,
  weights,
  onChangeWeights,
  weightsExpanded,
  onToggleWeights,
}: ScoresResponse &
  WeightsProps & {
    scoutMode: ScoutMode | null;
    weightsExpanded: boolean;
    onToggleWeights: () => void;
  }) => {
  const shownMode = scoutMode?.id === mode ? scoutMode : null;
  const own = shownMode && weights;
  return (
    <>
      <LocationScoreDetails
        {...weighed({ mode, categories, location }, scoutMode, weights)}
      />
      {shownMode && (
        <ScoreWeights
          scoutMode={shownMode}
          weights={own}
          expanded={weightsExpanded}
          onToggle={onToggleWeights}
          onChange={onChangeWeights}
        />
      )}
      <ul className="category-scores" aria-label="Category Scores">
        {categories.map((category) => (
          <li key={category.id}>
            <CategoryScoreDetails category={category} />
          </li>
        ))}
      </ul>
      <p className="layer-note">
        Scores are beta. They use fixed thresholds, still to be tuned against
        real Locations, as there are no regional averages to compare with yet.
        Expand a score to see how it is reached.
      </p>
    </>
  );
};

/**
 * The Location Score and each Category Score, each labelled beta and each
 * expanding to its breakdown (PRD FR-3.2, FR-3.3). The Location Score is
 * weighed by the Scout Mode chosen, or by the user's own weights for it
 * (FR-4.4).
 */
export const Scores = ({
  state,
  scoutMode,
  weights,
  onChangeWeights,
}: WeightsProps & {
  state: ScoresState;
  scoutMode: ScoutMode | null;
}) => {
  // The sliders show while the user's own weights are in use, until the
  // user says otherwise.
  const [weightsOpen, setWeightsOpen] = useState<boolean | null>(null);
  const weightsExpanded = weightsOpen ?? weights !== null;
  return (
    <section className="scores" aria-labelledby="scores-heading">
      <h3 id="scores-heading">
        Scores <Beta />
      </h3>
      {state.status === "loading" && (
        <p>Loading… The scores follow once every Layer they need has loaded.</p>
      )}
      {state.status === "unavailable" && (
        <p>
          <strong>Unavailable.</strong> The scores can't be shown for now.
          Everything else still works.
        </p>
      )}
      {scoutMode && (
        <p className="scores-mode">
          <strong>{scoutMode.name}</strong> Scout Mode: {scoutMode.question}
        </p>
      )}
      {state.status === "ok" && (
        <ScoresList
          {...state.scores}
          scoutMode={scoutMode}
          weights={weights}
          onChangeWeights={onChangeWeights}
          weightsExpanded={weightsExpanded}
          onToggleWeights={() => {
            setWeightsOpen(!weightsExpanded);
          }}
        />
      )}
    </section>
  );
};
