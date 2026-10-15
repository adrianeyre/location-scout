import { useContext, useEffect, useId, useRef, useState } from "react";

import {
  AI_EXPLANATION_LABEL,
  EXPLAIN_RULES,
  type ExplainEvent,
  type ExplainSubject,
} from "@location-scout/shared";

import { streamExplanation } from "../api";
import { formatList } from "../format";
import { ExplainContext } from "./explain-context";

type Done = Extract<ExplainEvent, { type: "done" }>;

/** An answer being written, written, or that couldn't be. */
type Answer =
  | { status: "writing"; question: string; text: string }
  | { status: "done"; question: string; text: string; done: Done }
  | { status: "failed"; question: string; text: string; message: string };

/** What an answer that stops without finishing says. */
export const UNFINISHED =
  "The explanation stopped before it was finished. Try again.";

const tokens = (count: number) => count.toLocaleString("en-GB");

/** How many tokens an answer took, approximately (PRD FR-11.5). */
const usageText = ({ usage, cached }: Done) => {
  const total = usage.inputTokens + usage.outputTokens;
  const counted = `About ${tokens(total)} tokens: ${tokens(usage.inputTokens)} sent and ${tokens(usage.outputTokens)} written.`;
  return cached ? `${counted} Given again from memory.` : counted;
};

/** Warns of numbers the answer has that the figures don't (PRD FR-11.6). */
const unverifiedText = (numbers: readonly string[]) =>
  `Check this answer: ${formatList(numbers)} ${numbers.length === 1 ? "is" : "are"} not among the figures above, and an AI Explanation should use no other.`;

interface ExplainProps {
  subject: ExplainSubject;
  /** What it explains, as its button names it: "the Safety score". */
  name: string;
}

/**
 * An Explain button and, once opened, the questions it offers, the user's
 * own question, and the answer, streamed as it is written and labelled as
 * an AI Explanation (PRD FR-11.1, FR-11.3, FR-11.4). Hidden while AI
 * Explanations are off. A new Search Area, Scout Mode or weights put the
 * answer away, as it was about the figures before.
 */
export const Explain = ({ subject, name }: ExplainProps) => {
  const explaining = useContext(ExplainContext);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState("");
  const [answer, setAnswer] = useState<{ key: string; answer: Answer } | null>(
    null,
  );
  const asking = useRef<AbortController | null>(null);
  const key = explaining ? JSON.stringify([explaining.about, subject]) : "";

  // An answer still on its way is no longer wanted once the figures change.
  useEffect(
    () => () => {
      asking.current?.abort();
    },
    [key],
  );

  if (!explaining) return null;
  const shown = answer?.key === key ? answer.answer : null;

  const ask = (question: string) => {
    asking.current?.abort();
    const controller = new AbortController();
    asking.current = controller;
    const update = (next: (current: Answer) => Answer) => {
      if (controller.signal.aborted) return;
      setAnswer((current) =>
        current?.key === key ? { key, answer: next(current.answer) } : current,
      );
    };
    setAnswer({ key, answer: { status: "writing", question, text: "" } });
    streamExplanation(
      { ...explaining.about, subject, question },
      controller.signal,
      (event) => {
        update((current) => {
          switch (event.type) {
            case "text":
              return { ...current, text: current.text + event.text };
            case "done":
              return {
                status: "done",
                question,
                text: current.text,
                done: event,
              };
            case "error":
              return {
                status: "failed",
                question,
                text: current.text,
                message: event.error,
              };
          }
        });
      },
    ).then(
      (result) => {
        update((current) =>
          !result.ok
            ? { ...current, status: "failed", message: result.message }
            : current.status === "writing"
              ? { ...current, status: "failed", message: UNFINISHED }
              : current,
        );
      },
      // Only an abort throws: another question replaced this one.
      () => undefined,
    );
  };

  const questions = explaining.questions[subject.kind];
  return (
    <div className="explain">
      <button
        type="button"
        className="explain-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!open);
        }}
      >
        Explain {name}
      </button>
      <section
        id={panelId}
        className="explain-panel"
        aria-label={`AI Explanation of ${name}`}
        hidden={!open}
      >
        <p className="layer-note">
          {explaining.model} explains the figures above in plain English. It
          uses them alone and never decides a score. Each question is paid for
          with your own Anthropic API key.
        </p>
        <ul className="explain-questions" aria-label="Questions to ask">
          {questions.map((question) => (
            <li key={question}>
              <button
                type="button"
                onClick={() => {
                  ask(question);
                }}
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="explain-own"
          onSubmit={(event) => {
            event.preventDefault();
            const question = own.trim();
            if (question !== "") ask(question);
          }}
        >
          <label>
            Or ask your own question
            <input
              type="text"
              value={own}
              maxLength={EXPLAIN_RULES.maxQuestionLength}
              onChange={(event) => {
                setOwn(event.target.value);
              }}
            />
          </label>
          <button type="submit">Ask</button>
        </form>
        {shown && (
          <div
            className="explain-answer"
            aria-live="polite"
            aria-busy={shown.status === "writing"}
          >
            <p className="explain-label">{AI_EXPLANATION_LABEL}</p>
            <p className="explain-question">{shown.question}</p>
            {shown.text !== "" && <p className="explain-text">{shown.text}</p>}
            {shown.status === "writing" && (
              <p className="explain-status">Writing…</p>
            )}
            {shown.status === "done" && (
              <>
                {shown.done.unverifiedNumbers.length > 0 && (
                  <p className="explain-unverified">
                    {unverifiedText(shown.done.unverifiedNumbers)}
                  </p>
                )}
                {shown.done.truncated && (
                  <p className="layer-note">
                    It stopped at its length limit, so it is cut short.
                  </p>
                )}
                <p className="layer-note explain-usage">
                  {usageText(shown.done)}
                </p>
              </>
            )}
            {shown.status === "failed" && (
              <p className="explain-error" role="alert">
                {shown.message}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
