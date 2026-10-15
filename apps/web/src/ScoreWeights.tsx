import {
  CATEGORY_NAMES,
  weighedCategories,
  type ScoutMode,
} from "@location-scout/shared";

import { defaultWeights, rebalance, type CustomWeights } from "./weights";

interface ScoreWeightsProps {
  scoutMode: ScoutMode;
  /** The user's own weights, or `null` for the Scout Mode's defaults. */
  weights: CustomWeights | null;
  expanded: boolean;
  onToggle: () => void;
  onChange: (weights: CustomWeights | null) => void;
}

/**
 * A slider for each category the Scout Mode weighs, as a whole per cent of the
 * Location Score (PRD FR-4.4). They always total 100%: moving one shares what
 * is left between the others in proportion. "Reset to default" puts back the
 * mode's weights from the config.
 */
export const ScoreWeights = ({
  scoutMode,
  weights,
  expanded,
  onToggle,
  onChange,
}: ScoreWeightsProps) => {
  const ids = weighedCategories(scoutMode);
  const shown = weights ?? defaultWeights(scoutMode);
  return (
    <div className="score-weights">
      <button
        type="button"
        className="score-weights-toggle"
        aria-expanded={expanded}
        aria-controls="score-weights"
        onClick={onToggle}
      >
        Weights:{" "}
        {weights ? "your own" : `the ${scoutMode.name} Scout Mode's defaults`}
      </button>
      {expanded && (
        <fieldset id="score-weights" className="score-weights-sliders">
          <legend>Each category's weight in the Location Score</legend>
          {ids.map((id) => {
            const weight = shown[id] ?? 0;
            const inputId = `weight-${id}`;
            return (
              <div className="score-weight" key={id}>
                <label htmlFor={inputId}>{CATEGORY_NAMES[id]}</label>
                <input
                  id={inputId}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={weight}
                  aria-valuetext={`${String(weight)}%`}
                  disabled={ids.length < 2}
                  onChange={(event) => {
                    onChange(
                      rebalance(shown, id, event.currentTarget.valueAsNumber),
                    );
                  }}
                />
                <output htmlFor={inputId}>{weight}%</output>
              </div>
            );
          })}
          <p className="layer-note">
            The weights always make up 100%. Moving one shares the rest between
            the others, in proportion to their weights.
            {!weights &&
              " These are the Scout Mode's, each to the nearest whole per cent."}
          </p>
          <button
            type="button"
            className="score-weights-reset"
            disabled={!weights}
            onClick={() => {
              onChange(null);
            }}
          >
            Reset to default
          </button>
        </fieldset>
      )}
    </div>
  );
};
