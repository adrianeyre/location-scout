import {
  CATEGORY_IDS,
  isCategoryId,
  weighedCategories,
  type CategoryId,
  type ScoutMode,
} from "@location-scout/shared";

/*
 * The user's own weights for a Scout Mode (PRD FR-4.4): each category the mode
 * weighs, as a whole per cent of the Location Score, always totalling 100%.
 * Without them, the Location Score is the backend's, with the mode's default
 * weights from the config.
 */

/** Each category a Scout Mode weighs, as a whole per cent. They total 100. */
export type CustomWeights = Partial<Record<CategoryId, number>>;

/** What the weights always total, in per cent. */
export const WEIGHTS_TOTAL = 100;

/**
 * Whole numbers in proportion to `values`, totalling `total`: each rounded
 * down, then the rest given one each to those that lost most, the first first
 * if two lost the same. With nothing to go by, `total` is shared equally.
 */
const apportion = (values: readonly number[], total: number): number[] => {
  const sum = values.reduce((all, value) => all + value, 0);
  const exact = values.map((value) =>
    sum > 0 ? (value * total) / sum : total / values.length,
  );
  const whole = exact.map(Math.floor);
  const short = total - whole.reduce((all, value) => all + value, 0);
  const lostMost = exact
    .map((value, index) => ({ index, lost: value - (whole[index] ?? 0) }))
    .sort((a, b) => b.lost - a.lost || a.index - b.index)
    .slice(0, short);
  for (const { index } of lostMost) whole[index] = (whole[index] ?? 0) + 1;
  return whole;
};

const fromEntries = (entries: Iterable<readonly [CategoryId, number]>) =>
  Object.fromEntries(entries) as CustomWeights;

/**
 * The sliders' values for a Scout Mode's default weights: each category's
 * share of the categories it weighs, to the whole per cent, totalling 100%.
 * The config's weights total 100 across every category the PRD gives the
 * mode, but a mode added to the config needn't, so they are renormalised.
 */
export const defaultWeights = (mode: ScoutMode): CustomWeights => {
  const ids = weighedCategories(mode);
  const shares = apportion(
    ids.map((id) => mode.weights[id]),
    WEIGHTS_TOTAL,
  );
  return fromEntries(ids.map((id, index) => [id, shares[index] ?? 0]));
};

/**
 * The weights after one slider moves to `value`: the others share what is
 * left in proportion to their weights before, or equally if they had none,
 * so that they still total 100%.
 */
export const rebalance = (
  weights: CustomWeights,
  moved: CategoryId,
  value: number,
): CustomWeights => {
  const ids = CATEGORY_IDS.filter((id) => weights[id] !== undefined);
  const others = ids.filter((id) => id !== moved);
  if (others.length === 0) return { [moved]: WEIGHTS_TOTAL };
  const set = Math.min(WEIGHTS_TOTAL, Math.max(0, Math.round(value)));
  const shared = apportion(
    others.map((id) => weights[id] ?? 0),
    WEIGHTS_TOTAL - set,
  );
  return fromEntries(
    ids.map((id) => [
      id,
      id === moved ? set : (shared[others.indexOf(id)] ?? 0),
    ]),
  );
};

/**
 * `weights` if they are for `mode`: one for each category it weighs and no
 * other. Otherwise `null`, and the mode's default weights apply.
 */
export const customWeightsFor = (
  mode: ScoutMode,
  weights: CustomWeights | null,
): CustomWeights | null => {
  if (weights === null) return null;
  const ids = weighedCategories(mode);
  const named = CATEGORY_IDS.filter((id) => weights[id] !== undefined);
  return named.length === ids.length && ids.every((id) => named.includes(id))
    ? weights
    : null;
};

/** Every category's weight, 0 for those not given one, for `locationScore`. */
export const allWeights = (
  weights: CustomWeights,
): Record<CategoryId, number> =>
  Object.fromEntries(
    CATEGORY_IDS.map((id) => [id, weights[id] ?? 0]),
  ) as Record<CategoryId, number>;

/**
 * Weights as the URL keeps them, in the order of `CATEGORY_IDS`:
 * `safety:30,amenities:20,…`.
 */
export const formatWeights = (weights: CustomWeights): string =>
  CATEGORY_IDS.flatMap((id) => {
    const weight = weights[id];
    return weight === undefined ? [] : [`${id}:${String(weight)}`];
  }).join(",");

const WEIGHT_PATTERN = /^\d{1,3}$/;

/**
 * Weights from the URL, or `null` unless each names a category once with a
 * whole per cent, and they total 100%. Whether they suit the Scout Mode is
 * for `customWeightsFor` to say, once the modes are known.
 */
export const parseWeights = (text: string | null): CustomWeights | null => {
  if (!text) return null;
  const weights: CustomWeights = {};
  for (const pair of text.split(",")) {
    const [id, weight, ...rest] = pair.trim().split(":");
    if (
      !isCategoryId(id) ||
      weight === undefined ||
      !WEIGHT_PATTERN.test(weight) ||
      rest.length > 0 ||
      weights[id] !== undefined
    ) {
      return null;
    }
    weights[id] = Number(weight);
  }
  const total = Object.values(weights).reduce((all, weight) => all + weight, 0);
  return total === WEIGHTS_TOTAL ? weights : null;
};
