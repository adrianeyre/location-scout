import { useState } from "react";

import {
  SERVED_LAYER_IDS,
  type LayerId,
  type ScoutMode,
  type ServedLayerId,
} from "@location-scout/shared";

import type { LayerStates } from "../useSearchArea";
import { HighlightedBy } from "./HighlightedBy";
import { LayerIcon } from "./LayerIcon";
import { LAYER_STYLES } from "./layer-styles";
import { applicationsStatusText, layerStatusText } from "./layer-status";

interface LayerTogglesProps {
  hidden: readonly LayerId[];
  /** How each Layer is loading, or `null` when there is no Search Area. */
  layers: LayerStates | null;
  /** The Layer a Highlight last pointed to, if any. */
  focused?: ServedLayerId | null;
  /** The Scout Mode chosen, whose highlighted Layers are pointed out (FR-4.3a). */
  scoutMode?: ScoutMode | null;
  onShow: (layer: LayerId, visible: boolean) => void;
}

/** Whether the Layers start folded away: on a phone, where they would cover the map. */
const startsFolded = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(max-width: 48rem)").matches;

/**
 * Switches each Layer on and off the map (PRD §6.3), always in view (FR-9.1),
 * and says whether it is loading, empty or unavailable (FR-9.4). The Layers
 * the Scout Mode highlights are marked with its name (FR-4.3a).
 */
export const LayerToggles = ({
  hidden,
  layers,
  focused = null,
  scoutMode = null,
  onShow,
}: LayerTogglesProps) => {
  // Folded away to leave the map clear, as it starts on a phone.
  const [folded, setFolded] = useState(startsFolded);
  return (
    <fieldset
      className="layer-toggles"
      id="layer-toggles"
      tabIndex={-1}
      data-folded={folded || undefined}
    >
      <legend>Layers</legend>
      <button
        type="button"
        className="layer-toggles-fold"
        aria-expanded={!folded}
        aria-controls="layer-toggle-list"
        aria-label={folded ? "Show the Layers" : "Hide the Layers"}
        title={folded ? "Show the Layers" : "Hide the Layers"}
        onClick={() => {
          setFolded(!folded);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div className="layer-toggle-list" id="layer-toggle-list" hidden={folded}>
        {SERVED_LAYER_IDS.map((id) => {
          const state = layers?.[id];
          const highlighted =
            scoutMode?.highlightedLayers.includes(id) ?? false;
          // The Planning Layer's Planning Applications say how they are on a
          // line of their own while they wait or are unavailable (PRD FR-2.2).
          const applications = state ? applicationsStatusText(state) : null;
          const applicationsStatus =
            state?.status !== "loading" &&
            state?.layer === "planning" &&
            state.applications
              ? state.applications.status
              : null;
          return (
            <div
              key={id}
              className="layer-toggle"
              data-focused={id === focused || undefined}
              data-highlighted={highlighted || undefined}
            >
              <input
                type="checkbox"
                id={`layer-${id}`}
                checked={!hidden.includes(id)}
                aria-describedby={
                  state
                    ? [
                        `layer-${id}-status`,
                        ...(applications
                          ? [`layer-${id}-applications-status`]
                          : []),
                      ].join(" ")
                    : undefined
                }
                onChange={(event) => {
                  onShow(id, event.target.checked);
                }}
              />
              <label htmlFor={`layer-${id}`}>
                <LayerIcon layer={id} />
                {LAYER_STYLES[id].name}
              </label>
              {highlighted && scoutMode && (
                <HighlightedBy scoutMode={scoutMode} />
              )}
              {state && (
                <span
                  id={`layer-${id}-status`}
                  className="layer-status"
                  data-status={state.status}
                  aria-live="polite"
                >
                  {layerStatusText(id, state)}
                </span>
              )}
              {applications && applicationsStatus && (
                <span
                  id={`layer-${id}-applications-status`}
                  className="layer-status layer-status-applications"
                  data-status={applicationsStatus}
                  aria-live="polite"
                >
                  {applications}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
};
