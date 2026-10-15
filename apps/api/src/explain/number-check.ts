/**
 * Checks an AI Explanation for figures it wasn't given (PRD FR-11.6,
 * NFR-3.5). Every number written in digits in an answer must be among the
 * numbers in its input: the instructions, the figures and the question the
 * model was sent. A number in the input may be written rounded, to as many
 * decimal places as the answer gives (223.6 as 224), or as a percentage of a
 * share (0.727 as 72.7% or 73%), as those introduce nothing; anything else is
 * a defect. Numbers written in words aren't seen, so the model is told to
 * write every figure in digits.
 */

/**
 * A number in text: digits with commas between thousands ("2,024"), or
 * without, and any decimal part. A date's parts ("2026-07-14") are numbers
 * of their own; a minus sign is left out, as a fall is written as a word.
 */
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** Each number written in `text`, as written, in order. */
export const numbersIn = (text: string): string[] => text.match(NUMBER) ?? [];

const valueOf = (written: string) => Number(written.replaceAll(",", ""));

const decimalsOf = (written: string) => {
  const point = written.indexOf(".");
  return point === -1 ? 0 : written.length - point - 1;
};

const rounded = (value: number, decimals: number) =>
  Number(value.toFixed(decimals));

/**
 * Whether `written` is one of `inputs`, as given, rounded to its own
 * decimal places, or a share of one as a percentage.
 */
const isFromInput = (written: string, inputs: readonly number[]) => {
  const value = valueOf(written);
  const decimals = decimalsOf(written);
  return inputs.some(
    (input) =>
      input === value ||
      rounded(input, decimals) === value ||
      (input <= 1 && rounded(input * 100, decimals) === value),
  );
};

export interface NumberCheck {
  /** Every number in the answer is in its input. */
  ok: boolean;
  /** The numbers in the answer that aren't, as written, each once. */
  unverified: string[];
}

/** Checks each number in `answer` against those in `input`. */
export const checkNumbers = (answer: string, input: string): NumberCheck => {
  const inputs = [...new Set(numbersIn(input).map(valueOf))];
  const unverified = [
    ...new Set(
      numbersIn(answer).filter((written) => !isFromInput(written, inputs)),
    ),
  ];
  return { ok: unverified.length === 0, unverified };
};
