import type {
  Highlight,
  HighlightLevel,
  HighlightsResponse,
  ServedLayerId,
} from "@location-scout/shared";

import { formatList } from "./format";
import { HIGHLIGHT_LEVEL_LABELS } from "./highlight-levels";
import { LayerIcon } from "./layers/LayerIcon";
import { layerOverviewId } from "./layers/layer-links";
import { LAYER_STYLES } from "./layers/layer-styles";
import type { HighlightsState } from "./useSearchArea";

/** Each level is marked by a shape of its own (a tick in a circle, a triangle,
 * an octagon), never by colour alone (PRD FR-9.5). */
const LEVEL_SHAPES: Readonly<Record<HighlightLevel, string>> = {
  good: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.4 14.2-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z",
  watch: "M12 2.5 1.5 21h21L12 2.5zm-1 6.5h2v6h-2V9zm0 8h2v2h-2v-2z",
  concern:
    "M8.3 2h7.4L22 8.3v7.4L15.7 22H8.3L2 15.7V8.3L8.3 2zm2.7 5v7h2V7h-2zm0 9v2h2v-2h-2z",
};

export const LevelIcon = ({ level }: { level: HighlightLevel }) => (
  <svg
    className="highlight-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path d={LEVEL_SHAPES[level]} fillRule="evenodd" />
  </svg>
);

interface HighlightsProps {
  state: HighlightsState;
  /** Shows a Layer on the map and points it out in the Layers panel. */
  onFocusLayer: (layer: ServedLayerId) => void;
}

/**
 * Focuses a Highlight's Layer: shows it on the map, then brings its
 * statistics into view and moves keyboard focus to them.
 */
const focusLayer = (
  layer: ServedLayerId,
  onFocusLayer: (layer: ServedLayerId) => void,
) => {
  onFocusLayer(layer);
  const overview = document.getElementById(layerOverviewId(layer));
  overview?.focus({ preventScroll: true });
  overview?.scrollIntoView({ block: "start" });
};

const HighlightButton = ({
  highlight: { level, text, layer },
  onFocusLayer,
}: {
  highlight: Highlight;
  onFocusLayer: (layer: ServedLayerId) => void;
}) => {
  const { name } = HIGHLIGHT_LEVEL_LABELS[level];
  const layerName = LAYER_STYLES[layer].name;
  return (
    <button
      type="button"
      className="highlight"
      data-level={level}
      title={`Focus the ${layerName} Layer`}
      onClick={() => {
        focusLayer(layer, onFocusLayer);
      }}
    >
      <LevelIcon level={level} />
      <span className="highlight-body">
        <span className="highlight-level">{name}:</span>{" "}
        <span className="highlight-text">{text}</span>{" "}
        <span className="highlight-layer">
          <LayerIcon layer={layer} />
          {layerName}
        </span>
      </span>
    </button>
  );
};

/** "unavailable", "not prepared", or both if the Layers left out differ. */
const whyLeftOut = (leftOut: HighlightsResponse["leftOut"]) => {
  const statuses = new Set(leftOut.map(({ status }) => status));
  return formatList(
    [...statuses].map((status) =>
      status === "not-prepared" ? "not prepared" : "unavailable",
    ),
  ).replace(" and ", " or ");
};

/** The Layers the Highlights leave out, and why. */
export const HighlightsLeftOut = ({
  leftOut,
}: Pick<HighlightsResponse, "leftOut">) =>
  leftOut.length > 0 && (
    <p className="highlights-left-out">
      <strong>Left out:</strong> anything from the{" "}
      {formatList(leftOut.map(({ layer }) => LAYER_STYLES[layer].name))}{" "}
      {leftOut.length === 1 ? "Layer, which is" : "Layers, which are"}{" "}
      {whyLeftOut(leftOut)}.
    </p>
  );

const HighlightsList = ({
  highlights,
  leftOut,
  onFocusLayer,
}: HighlightsResponse & Pick<HighlightsProps, "onFocusLayer">) => (
  <>
    {highlights.length > 0 ? (
      <ul className="highlights-list" aria-label="Highlights">
        {highlights.map((highlight) => (
          <li key={highlight.rule}>
            <HighlightButton
              highlight={highlight}
              onFocusLayer={onFocusLayer}
            />
          </li>
        ))}
      </ul>
    ) : (
      <p>Nothing stands out in this Search Area.</p>
    )}
    <HighlightsLeftOut leftOut={leftOut} />
    <p className="layer-note">
      Highlights come from fixed rules over the figures below, never from AI.
      Choose one to see its Layer.
    </p>
  </>
);

/**
 * "What you need to know": the Good, Watch and Concern Highlights at the top
 * of the Location Overview, each linked to its Layer (PRD FR-3.7).
 */
export const Highlights = ({ state, onFocusLayer }: HighlightsProps) => (
  <section className="highlights" aria-labelledby="highlights-heading">
    <h3 id="highlights-heading">What you need to know</h3>
    {state.status === "loading" && (
      <p>
        Loading… The Highlights follow once every Layer they read has loaded.
      </p>
    )}
    {state.status === "unavailable" && (
      <p>
        <strong>Unavailable.</strong> The Highlights can't be shown for now.
        Everything else still works.
      </p>
    )}
    {state.status === "ok" && (
      <HighlightsList {...state.highlights} onFocusLayer={onFocusLayer} />
    )}
  </section>
);
