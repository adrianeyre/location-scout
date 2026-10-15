import type { ReactNode } from "react";

import type {
  LayerResponse,
  ScoutMode,
  ServedLayerId,
} from "@location-scout/shared";

import type { LayerState } from "../useSearchArea";
import { HighlightedBy } from "./HighlightedBy";
import { LayerIcon } from "./LayerIcon";
import { layerOverviewId } from "./layer-links";
import { LAYER_STYLES } from "./layer-styles";

interface LayerOverviewProps {
  layer: ServedLayerId;
  state: LayerState;
  /** The Scout Mode chosen, which may highlight this Layer (PRD FR-4.3a). */
  scoutMode?: ScoutMode | null;
  /** The Layer's statistics, once it has loaded. */
  children: (loaded: LayerResponse) => ReactNode;
  /** What it says when it is not prepared, if not to run `pnpm data:prepare`. */
  notPrepared?: (loaded: LayerResponse) => ReactNode;
  /**
   * A part of the Layer from another Data Source that stands on its own,
   * shown after the rest however that went, once it has loaded, as the
   * Planning Layer's Planning Applications are.
   */
  alongside?: (loaded: LayerResponse) => ReactNode;
}

/**
 * The Data Sources that didn't answer, but for the Planning Layer's
 * Planning Applications' provider, as they say how they are on their own.
 */
const sourceNames = (response: LayerResponse) => {
  const apart =
    response.layer === "planning" ? response.applications?.provider.id : null;
  const names = response.sources
    .filter(({ id, status }) => status !== "ok" && id !== apart)
    .map(({ name }) => name);
  return names.length > 0 ? names.join(" and ") : "Its Data Source";
};

/**
 * One Layer's part of the Location Overview: its statistics, or why there are
 * none yet (PRD FR-3.4, FR-9.4). Statistics are always given as text, whether
 * or not the Layer is shown on the map (FR-9.5).
 */
export const LayerOverview = ({
  layer,
  state,
  scoutMode = null,
  children,
  notPrepared,
  alongside,
}: LayerOverviewProps) => {
  const style = LAYER_STYLES[layer];
  const heading = `${layer}-overview-heading`;
  let body: ReactNode;
  switch (state.status) {
    case "loading":
      body = <p>Loading…</p>;
      break;
    case "unavailable":
      body = (
        <p>
          <strong>Unavailable.</strong> {sourceNames(state)} didn't answer, so
          this Layer can't be shown for now. Everything else still works.
        </p>
      );
      break;
    case "not-prepared":
      body = notPrepared?.(state) ?? (
        <p>
          <strong>Not prepared.</strong> Run <code>pnpm data:prepare</code> to
          show this Layer.
        </p>
      );
      break;
    case "ok":
      body = (
        <>
          {children(state)}
          {style.note && <p className="layer-note">{style.note}</p>}
        </>
      );
  }
  return (
    // A Highlight focuses it, so it can take focus, though not by Tab.
    <section
      id={layerOverviewId(layer)}
      className="layer-overview"
      aria-labelledby={heading}
      tabIndex={-1}
    >
      <h3 id={heading}>
        <LayerIcon layer={layer} />
        {style.name}
      </h3>
      {scoutMode?.highlightedLayers.includes(layer) && (
        <p className="layer-highlighted">
          <HighlightedBy scoutMode={scoutMode} />
        </p>
      )}
      {body}
      {state.status !== "loading" && alongside?.(state)}
    </section>
  );
};
