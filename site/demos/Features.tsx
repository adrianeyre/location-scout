import { Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { Act } from "../kit/act";
import { Badge } from "../kit/controls/Badge";
import { Count } from "../kit/motion/Count";
import { Stream } from "../kit/motion/Stream";
import { Meter } from "../kit/parts/Meter";
import { Stage } from "../kit/stage";
import { Bar } from "../kit/window";
import {
  LAYERS,
  LEVEL_NAMES,
  LayerMark,
  LevelGlyph,
  useScheme,
  useSlotWidth,
  type LayerId,
  type Level,
} from "./shared";
import "./look.css";
import "./features.css";

/*
 * The Features section's bento grid (Stageshow, bento.md). The copy of each
 * tile is the page's own HTML; each picture here is its own Stage, drawn at
 * 1:1 at its slot's measured width, and plays one beat, once, as it scrolls
 * in, a little after the tile before it in reading order.
 *
 *   Tile         Span   Kind       The one thing                        Moves
 *   Scores       2 × 1  Hero UI    Category Scores, one opened          bars fill, its breakdown arrives
 *   Open data    1 × 1  Stat       "11" Data Sources (page text only)   -
 *   Highlights   1 × 1  Component  a Concern, a Watch and a Good        arrive top to bottom
 *   Layers       1 × 1  Collection the nine Layers' marks               pop in
 *   Scout Modes  1 × 1  Component  Homebuyer chosen                     the score rolls 62 to 71
 *   Themes       1 × 1  Object     six themes, Heather raised           -
 *   Explain      1 × 1  Component  an answer about the figures          streams in, then is checked
 *   Land         1 × 1  Diagram    a parcel, possibly unregistered      its outline draws, the badge settles
 *
 * One window-like card in the grid (the hero's); no real string repeats
 * from tile to tile, or from the page's hero.
 */

const LEAD = 350;
const STEP = 110;

type Beat = { on: boolean };
const before: Beat = { on: false };
const after: Beat = { on: true };
const beat = (order: number) => async (a: Act<Beat>) => {
  await a.wait(LEAD + order * STEP);
  await a.set({ on: true });
};

/** A tile's picture: one Stage at its slot's width, played once in view. */
function Picture({
  height,
  order,
  className,
  children,
}: {
  height: number | ((width: number) => number);
  order: number;
  className: string;
  children: (on: boolean, width: number) => ReactNode;
}) {
  const theme = useScheme();
  const [slot, width] = useSlotWidth();
  const tall = typeof height === "function" ? height(width) : height;
  return (
    <div ref={slot} className="ls-picture">
      <Stage<Beat>
        width={width}
        height={tall}
        initial={before}
        poster={after}
        play="once"
        script={beat(order)}
        theme={theme}
        className={`ls-look ls-tile ${className}`}
      >
        {(s) => children(s.on, width)}
      </Stage>
    </div>
  );
}

/* ---------------- Scores (the hero tile) ---------------- */

const CATEGORY_SCORES: { name: string; score: number }[] = [
  { name: "Schools", score: 87 },
  { name: "Transport", score: 88 },
  { name: "Green space", score: 100 },
  { name: "Planning freedom", score: 80 },
];

export function ScoresPicture() {
  return (
    <Picture
      height={(w) => (w < 560 ? 250 : 270)}
      order={0}
      className="ls-scores"
    >
      {(on, width) => {
        const wide = width >= 560;
        return (
          <>
            <div
              className="ls-widget"
              style={
                wide ? { width: width - 24 - 200, right: "auto" } : undefined
              }
            >
              <div className="ls-widget-head">
                <span className="ls-widget-grip" aria-hidden="true">
                  <Bar w={3} h={12} r={1} tone={2} />
                  <Bar w={3} h={12} r={1} tone={2} />
                </span>
                <span className="ls-widget-title">Category Scores</span>
                <Badge tone="accent" className="ls-beta">
                  Beta
                </Badge>
              </div>
              <div className="ls-score-rows">
                {CATEGORY_SCORES.map(({ name, score }, i) => (
                  <div
                    key={name}
                    className="ls-score-row"
                    data-open={wide && i === 0 ? "" : undefined}
                  >
                    <span className="ls-score-name">{name}</span>
                    <span className="ls-score-number">{score}</span>
                    <Meter
                      value={on ? score / 100 : 0}
                      className="ls-score-meter"
                      style={{ transitionDelay: `${String(i * 90)}ms` }}
                    />
                  </div>
                ))}
                {[64, 48].map((w) => (
                  <div key={w} className="ls-score-row">
                    <Bar w={w + 30} h={6} tone={2} />
                    <Bar w={22} h={6} tone={2} />
                    <Bar w={w * 2} h={6} tone={1} />
                  </div>
                ))}
              </div>
            </div>
            {wide && (
              <div className="ls-breakdown" data-show={on || undefined}>
                <div className="ls-breakdown-title">
                  Schools <span>87/100</span>
                </div>
                <div className="ls-breakdown-row">
                  <span>Nearest primary, 350 m</span>
                  <b>+40</b>
                </div>
                <div className="ls-breakdown-row">
                  <span>Good or better, 3</span>
                  <b>+30</b>
                </div>
                <div className="ls-breakdown-row ls-breakdown-row--filler">
                  <Bar w={96} h={6} tone={2} />
                  <Bar w={20} h={6} tone={2} />
                </div>
              </div>
            )}
          </>
        );
      }}
    </Picture>
  );
}

/* ---------------- Highlights ---------------- */

const TILE_HIGHLIGHTS: { level: Level; text: string; layer: LayerId }[] = [
  { level: "concern", text: "Location is in flood zone 3", layer: "planning" },
  { level: "watch", text: "No playground nearby", layer: "amenities" },
  { level: "good", text: "Outstanding primary school", layer: "schools" },
];

export function HighlightsPicture() {
  return (
    <Picture height={214} order={2} className="ls-highlights-tile">
      {(on) => (
        <div className="ls-stack">
          {TILE_HIGHLIGHTS.map(({ level, text, layer }, i) => (
            <div
              key={level}
              className="ls-stack-row"
              data-level={level}
              data-show={on || undefined}
              style={{ transitionDelay: on ? `${String(i * 140)}ms` : "0ms" }}
            >
              <LevelGlyph level={level} />
              <span className="ls-stack-text">
                <b>{LEVEL_NAMES[level]}:</b> {text}
              </span>
              <LayerMark layer={layer} size={18} />
            </div>
          ))}
          <div
            className="ls-stack-row ls-stack-row--filler"
            data-show={on || undefined}
            style={{ transitionDelay: on ? "420ms" : "0ms" }}
          >
            <Bar w={15} h={15} r={8} tone={2} />
            <Bar w={120} h={6} tone={2} />
          </div>
        </div>
      )}
    </Picture>
  );
}

/* ---------------- Layers ---------------- */

const LAYER_ORDER = Object.keys(LAYERS) as LayerId[];

export function LayersPicture() {
  return (
    <Picture height={196} order={3} className="ls-layers-tile">
      {(on) => (
        <div className="ls-layer-grid">
          {LAYER_ORDER.map((layer, i) => (
            <span
              key={layer}
              className="ls-layer-cell"
              data-show={on || undefined}
              style={{ transitionDelay: on ? `${String(i * 55)}ms` : "0ms" }}
            >
              <LayerMark layer={layer} size={46} />
            </span>
          ))}
        </div>
      )}
    </Picture>
  );
}

/* ---------------- Scout Modes ---------------- */

const MODES = ["General", "Homebuyer", "Buy-to-let", "Development"];

export function ModesPicture() {
  return (
    <Picture height={214} order={4} className="ls-modes-tile">
      {(on) => (
        <>
          <div className="ls-menu" role="presentation">
            {MODES.map((mode, i) => {
              const chosen = on ? i === 1 : i === 0;
              return (
                <div
                  key={mode}
                  className="ls-menu-row"
                  data-chosen={chosen || undefined}
                >
                  <span className="ls-menu-check">
                    {chosen && <Check size={14} strokeWidth={2.6} />}
                  </span>
                  {mode}
                </div>
              );
            })}
            <div className="ls-menu-row ls-menu-row--filler">
              <span className="ls-menu-check" />
              <Bar w={58} h={6} tone={2} />
            </div>
          </div>
          <div className="ls-mode-score">
            <span className="ls-mode-score-label">Location Score</span>
            <span className="ls-mode-score-value">
              <Count value={on ? 71 : 62} duration={800} />
            </span>
          </div>
        </>
      )}
    </Picture>
  );
}

/* ---------------- Themes ---------------- */

/** Each theme's background and accent, light then dark (apps/web/src/theme/themes.ts). */
const THEMES = [
  {
    name: "Scout",
    light: ["#ffffff", "#0550ae"],
    dark: ["#0d1117", "#79c0ff"],
  },
  {
    name: "Ocean",
    light: ["#fbfeff", "#005f6b"],
    dark: ["#071a1e", "#6ad8e0"],
  },
  {
    name: "Forest",
    light: ["#fcfdfb", "#17652e"],
    dark: ["#0a160f", "#84e39f"],
  },
  {
    name: "Heather",
    light: ["#fdfcff", "#5b2fa0"],
    dark: ["#140f1c", "#cdb0ff"],
  },
  {
    name: "Sunset",
    light: ["#fffdfb", "#933a00"],
    dark: ["#19110b", "#ffb27a"],
  },
  {
    name: "High contrast",
    light: ["#ffffff", "#00309c"],
    dark: ["#000000", "#ffeb3b"],
  },
] as const;

const RAISED = 3;

export function ThemesPicture() {
  const scheme = useScheme();
  return (
    <Picture height={196} order={5} className="ls-themes-tile">
      {() => (
        <div className="ls-swatches">
          {THEMES.map((theme, i) => (
            <div
              key={theme.name}
              className="ls-swatch"
              data-raised={i === RAISED || undefined}
              style={
                {
                  "--sw-bg": theme[scheme][0],
                  "--sw-accent": theme[scheme][1],
                } as CSSProperties
              }
            >
              <span className="ls-swatch-bar" />
              <span className="ls-swatch-line" />
              <span className="ls-swatch-line ls-swatch-line--short" />
              <span className="ls-swatch-button" />
              {i === RAISED && (
                <span className="ls-swatch-name">{theme.name}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Picture>
  );
}

/* ---------------- AI Explanations ---------------- */

const QUESTION = "Why is Safety 0?";
const ANSWER =
  "The Search Area records 224 crimes a year per 1,000 residents, which is in the rule's lowest band, so Safety scores 0.";
const ANSWER_WORDS = ANSWER.split(" ").length;

type Explain = { asked: boolean; count: number; checked: boolean };

async function explainScript(a: Act<Explain>) {
  await a.wait(LEAD + 6 * STEP);
  await a.set({ asked: true });
  await a.wait(500);
  for (let count = 1; count <= ANSWER_WORDS; count++) {
    a.put({ count });
    await a.wait(55);
  }
  await a.wait(300);
  await a.set({ checked: true });
}

export function ExplainPicture() {
  const theme = useScheme();
  const [slot, width] = useSlotWidth();
  return (
    <div ref={slot} className="ls-picture">
      <Stage<Explain>
        width={width}
        height={214}
        initial={{ asked: false, count: 0, checked: false }}
        poster={{ asked: true, count: ANSWER_WORDS, checked: true }}
        play="once"
        script={explainScript}
        theme={theme}
        className="ls-look ls-tile ls-explain-tile"
      >
        {(s) => (
          <div className="ls-explain">
            <div className="ls-question" data-show={s.asked || undefined}>
              {QUESTION}
            </div>
            <p className="ls-answer">
              <Stream text={ANSWER} count={s.count} />
            </p>
            <div className="ls-checked" data-show={s.checked || undefined}>
              <Check size={13} strokeWidth={2.8} />
              Every number is from the figures on screen
            </div>
          </div>
        )}
      </Stage>
    </div>
  );
}

/* ---------------- Land ---------------- */

const PARCEL = "M86 58 L176 40 L214 112 L150 150 L98 128 Z";

export function LandPicture() {
  return (
    <Picture height={214} order={7} className="ls-land-tile">
      {(on, width) => (
        <div className="ls-land">
          <svg
            className="ls-land-map"
            viewBox={`0 0 ${String(width)} 214`}
            preserveAspectRatio="xMinYMin slice"
            aria-hidden="true"
          >
            <path
              className="ls-land-road"
              d={`M-10 176 C 80 168 ${String(width * 0.6)} 190 ${String(width + 10)} 170`}
            />
            <path
              className="ls-land-road ls-land-road--minor"
              d="M60 -10 C 70 60 40 130 54 230"
            />
            <path
              className="ls-land-block"
              d="M232 30h70v46h-70z M240 96h56v60h-56z M20 20h40v52H20z"
            />
            <g
              transform={`translate(${String(Math.max(0, (width - 300) / 2))} 0)`}
            >
              <path
                className="ls-land-parcel"
                d={PARCEL}
                pathLength={1}
                data-on={on || undefined}
              />
            </g>
          </svg>
          <div className="ls-land-card" data-show={on || undefined}>
            <span className="ls-land-area">0.42 ha</span>
            <Badge tone="warning">Possibly unregistered</Badge>
          </div>
        </div>
      )}
    </Picture>
  );
}
