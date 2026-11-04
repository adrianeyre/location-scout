import { ChevronRight, MapPin, Search } from "lucide-react";

import type { Act } from "../kit/act";
import { Field } from "../kit/controls/Field";
import { Count } from "../kit/motion/Count";
import { Stage } from "../kit/stage";
import { Bar, Window } from "../kit/window";
import {
  LAYERS,
  LEVEL_NAMES,
  LayerMark,
  LevelGlyph,
  useScheme,
  type LayerId,
  type Level,
} from "./shared";
import "./look.css";
import "./hero.css";

/*
 * The website's hero: a search in Location Scout, told in four beats.
 *
 *   1. The cursor types a postcode, NG17 1AA, and presses Search.
 *   2. The Search Area's circle draws round the Location.
 *   3. Each Layer's markers arrive inside it, a cluster at a time.
 *   4. The Highlights arrive top to bottom, then the Location Score settles
 *      at 62 on its satellite card. It holds, then the next search clears it.
 *
 * Real words only on what the story is about: the postcode, Search, the
 * Overview's three Highlights and the score. The map is the product's
 * signature content, drawn quietly; everything else is filler.
 */

type S = {
  typed: string;
  focused: boolean;
  searched: boolean;
  markers: boolean;
  highlights: number;
  score: boolean;
};

const initial: S = {
  typed: "",
  focused: false,
  searched: false,
  markers: false,
  highlights: 0,
  score: false,
};

const POSTCODE = "NG17 1AA";

const POSTER: S = {
  typed: POSTCODE,
  focused: false,
  searched: true,
  markers: true,
  highlights: 3,
  score: true,
};

const HIGHLIGHTS: { level: Level; text: string }[] = [
  { level: "concern", text: "High crime" },
  { level: "watch", text: "Crime up 5.9%" },
  { level: "good", text: "58 bus stops" },
];

/** Markers round the Location, as fractions of the Search Area's radius. */
const MARKERS: { x: number; y: number; layer: LayerId; count?: number }[] = [
  { x: -0.52, y: -0.42, layer: "crime", count: 6 },
  { x: 0.18, y: -0.66, layer: "transport", count: 3 },
  { x: 0.6, y: -0.3, layer: "amenities", count: 17 },
  { x: -0.7, y: 0.12, layer: "greenSpace" },
  { x: 0.34, y: 0.04, layer: "crime", count: 25 },
  { x: -0.22, y: 0.4, layer: "schools" },
  { x: 0.62, y: 0.46, layer: "property" },
  { x: -0.02, y: -0.3, layer: "planning", count: 4 },
  { x: 0.1, y: 0.72, layer: "transport", count: 2 },
  { x: -0.6, y: 0.62, layer: "amenities", count: 8 },
];

const REST = { wide: { x: 316, y: 352 }, compact: { x: 260, y: 300 } };

async function script(a: Act<S>) {
  await a.wait(700);
  await a.move("field");
  await a.click();
  await a.set({ focused: true });
  await a.wait(200);
  await a.type("typed", POSTCODE, { interval: 70 });
  await a.wait(300);
  await a.move({ at: "search", x: 0.82, y: 0.72 });
  await a.wait(150);
  await a.click();
  await a.set({ focused: false, searched: true });
  await a.move("rest");
  await a.wait(450);
  await a.set({ markers: true });
  await a.wait(900);
  for (let shown = 1; shown <= HIGHLIGHTS.length; shown++) {
    await a.set({ highlights: shown });
    await a.wait(280);
  }
  await a.wait(250);
  await a.set({ score: true });
  await a.wait(3800);
  // The next search: everything it found clears together, so the loop has
  // no seam.
  await a.set({ ...initial });
  await a.wait(900);
}

export function HeroDemo() {
  const theme = useScheme();
  return (
    <Stage<S>
      width={720}
      height={420}
      compact={{ below: 560, width: 358, height: 400 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme={theme}
      cursor={{ at: REST }}
      className="ls-look ls-hero"
    >
      {(s, _rect, layout) => {
        const wide = layout === "wide";
        return (
          <>
            <Window url="localhost:5173" className="ls-hero-window">
              <div className="ls-app">
                <div className="ls-app-header">
                  {wide && (
                    <div className="ls-brand">
                      <MapPin size={16} strokeWidth={2.4} />
                      <span>Location Scout</span>
                    </div>
                  )}
                  <Field
                    className="ls-search"
                    value={s.typed}
                    placeholder="Postcode or address"
                    focused={s.focused}
                    leading={<Search size={14} strokeWidth={2} />}
                    box={{ "data-target": "field", "data-cursor": "ibeam" }}
                  />
                  <span
                    className="ls-search-button"
                    data-target="search"
                    data-cursor="pointer"
                  >
                    Search
                  </span>
                  {wide && <Bar w={44} h={26} r={6} tone={1} />}
                </div>
                <div className="ls-app-body">
                  <MapPane
                    searched={s.searched}
                    markers={s.markers}
                    wide={wide}
                  />
                  <Overview shown={s.highlights} wide={wide} />
                </div>
              </div>
            </Window>
            {wide && <ScoreCard show={s.score} />}
          </>
        );
      }}
    </Stage>
  );
}

function MapPane({
  searched,
  markers,
  wide,
}: {
  searched: boolean;
  markers: boolean;
  wide: boolean;
}) {
  const radius = wide ? 112 : 74;
  return (
    <div className="ls-map" data-searched={searched || undefined}>
      <svg
        className="ls-map-ground"
        viewBox="0 0 360 320"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path className="ls-map-park" d="M0 222 70 196 118 240 96 320H0Z" />
        <path
          className="ls-map-park"
          d="M262 22 330 40 352 104 300 118 254 76Z"
        />
        {[
          "M0 112 C 90 104 170 128 360 96",
          "M146 0 C 150 90 140 200 176 320",
          "M0 268 C 120 250 240 266 360 236",
          "M248 0 C 236 110 266 210 250 320",
          "M40 0 C 60 70 30 150 70 210",
        ].map((d) => (
          <path key={d} className="ls-map-road" d={d} />
        ))}
        {[
          "M0 168 C 100 176 220 160 360 172",
          "M96 0 C 100 60 92 120 100 180",
          "M300 120 C 290 190 320 250 300 320",
          "M200 0 C 206 40 196 80 210 120",
        ].map((d) => (
          <path key={d} className="ls-map-road ls-map-road--minor" d={d} />
        ))}
      </svg>
      <div
        className="ls-area"
        style={{ width: radius * 2, height: radius * 2 }}
      >
        {MARKERS.map((marker, i) => (
          <span
            key={i}
            className="ls-marker"
            data-show={markers || undefined}
            style={{
              left: `${String(50 + marker.x * 50)}%`,
              top: `${String(50 + marker.y * 50)}%`,
              transitionDelay: markers ? `${String(i * 70)}ms` : "0ms",
            }}
          >
            {marker.count ? (
              <span
                className="ls-cluster"
                style={{ background: LAYERS[marker.layer].colour }}
              >
                {marker.count}
              </span>
            ) : (
              <LayerMark layer={marker.layer} size={wide ? 20 : 18} />
            )}
          </span>
        ))}
        <span className="ls-location" aria-hidden="true">
          <MapPin size={wide ? 26 : 22} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

function Overview({ shown: shown_, wide }: { shown: number; wide: boolean }) {
  return (
    <div className="ls-overview">
      {wide ? (
        <div className="ls-overview-tabs">
          <span data-active>Overview</span>
          <Bar w={34} h={6} tone={2} />
          <Bar w={38} h={6} tone={2} />
        </div>
      ) : null}
      <div className="ls-overview-title">Location Overview</div>
      <div className="ls-highlights">
        {HIGHLIGHTS.map((highlight, i) => {
          const shown = i < shown_;
          return (
            <div
              key={highlight.level}
              className="ls-highlight"
              data-level={highlight.level}
              data-show={shown || undefined}
            >
              {/* A skeleton at the row's own geometry, which resolves into
                  its words in place: the same box, top to bottom. */}
              <span className="ls-highlight-face ls-highlight-face--skeleton">
                <Bar w={15} h={15} r={8} tone={2} />
                <Bar w={[96, 112, 84][i] ?? 96} h={6} tone={2} />
              </span>
              <span className="ls-highlight-face ls-highlight-face--real">
                <LevelGlyph level={highlight.level} />
                <span className="ls-highlight-text">
                  <b>{LEVEL_NAMES[highlight.level]}:</b> {highlight.text}
                </span>
              </span>
              <ChevronRight
                className="ls-highlight-more"
                size={14}
                strokeWidth={2}
              />
            </div>
          );
        })}
        <div className="ls-highlight ls-highlight--filler">
          <span className="ls-highlight-face">
            <Bar w={15} h={15} r={8} tone={2} />
            <Bar w={108} h={6} tone={2} />
          </span>
          <ChevronRight
            className="ls-highlight-more"
            size={14}
            strokeWidth={2}
          />
        </div>
      </div>
    </div>
  );
}

const ARC = 2 * Math.PI * 34 * 0.75;

function ScoreCard({ show }: { show: boolean }) {
  const value = show ? 62 : 0;
  return (
    <div className="ls-score" data-show={show || undefined}>
      <div className="ls-score-label">Location Score</div>
      <div className="ls-score-dial">
        <svg viewBox="-10 -10 100 100" aria-hidden="true">
          <g transform="rotate(135 40 40)">
            <circle
              className="ls-score-track"
              cx="40"
              cy="40"
              r="34"
              strokeDasharray={`${String(ARC)} 999`}
            />
            <circle
              className="ls-score-fill"
              cx="40"
              cy="40"
              r="34"
              strokeDasharray={`${String(ARC)} 999`}
              strokeDashoffset={ARC * (1 - value / 100)}
            />
          </g>
        </svg>
        <span className="ls-score-value">
          <Count value={value} duration={900} />
          <span className="ls-score-out">/100</span>
        </span>
      </div>
    </div>
  );
}
