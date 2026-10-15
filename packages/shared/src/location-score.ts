import type { Competitors } from "./competitors";
import {
  CATEGORY_IDS,
  type CategoryId,
  type CategoryScore,
  type LeftOutCategory,
  type LocationScore,
  type WeightedCategory,
} from "./scores";

/*
 * The Location Score's one rule, shared so that the backend, weighing a Scout
 * Mode's default weights, and the frontend, weighing the user's own (PRD
 * FR-4.4), weigh the same Category Scores the same way.
 */

/** To one decimal place, never -0. */
export const oneDecimal = (value: number) => Math.round(value * 10) / 10 || 0;

/**
 * The categories a Scout Mode weighs, in the order of `CATEGORY_IDS`: those it
 * gives a weight. Competition needs competitors, so a mode with none never
 * weighs it.
 */
export const weighedCategories = ({
  weights,
  competitors,
}: {
  weights: Readonly<Record<CategoryId, number>>;
  competitors: Competitors | null;
}): CategoryId[] =>
  CATEGORY_IDS.filter(
    (id) => weights[id] > 0 && (id !== "competition" || competitors !== null),
  );

/**
 * The Location Score (PRD §6.4): the weighted mean of the Category Scores
 * available, under a Scout Mode's `weights`. A category whose Layer is not
 * `ok` is left out, and the weights of the rest are renormalised so they
 * still add up to 100% (FR-3.4). A category the mode gives no weight counts
 * for nothing either way.
 */
export const locationScore = (
  categories: readonly CategoryScore[],
  weights: Readonly<Record<CategoryId, number>>,
): LocationScore => {
  const weighed = categories.filter(({ id }) => weights[id] > 0);
  const available = weighed.flatMap(({ id, score }) =>
    score === null ? [] : [{ id, score, weight: weights[id] }],
  );
  const leftOut = weighed.flatMap(({ id, layer, status }): LeftOutCategory[] =>
    status === "ok" ? [] : [{ id, layer, status, weight: weights[id] }],
  );
  const totalWeight = available.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight === 0) return { score: null, counted: [], leftOut };

  const counted = available.map(({ id, score, weight }): WeightedCategory => ({
    id,
    score,
    weight,
    share: oneDecimal((weight / totalWeight) * 100),
    points: oneDecimal((score * weight) / totalWeight),
  }));
  const mean = available.reduce(
    (sum, { score, weight }) => sum + (score * weight) / totalWeight,
    0,
  );
  return { score: Math.round(mean), counted, leftOut };
};
