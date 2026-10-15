import {
  HIGHLIGHT_RULE_IDS,
  LAYER_IDS,
  type ModesResponse,
  type ScoutMode,
} from "@location-scout/shared";

import type { ScoringConfig, ScoutModeConfig } from "./config";

/** The Scout Mode `id` names in the config, or `undefined` if there is none. */
export const findScoutMode = (
  config: ScoringConfig,
  id: string,
): ScoutModeConfig | undefined => config.modes.find((mode) => mode.id === id);

/** A Scout Mode as `/api/modes` gives it, its Layers and rules in their own order. */
const scoutMode = ({
  id,
  name,
  question,
  weights,
  competitors,
  highlightedLayers,
  highlights,
}: ScoutModeConfig): ScoutMode => ({
  id,
  name,
  question,
  weights: { ...weights },
  competitors: competitors && {
    name: competitors.name,
    tags: competitors.tags.map(({ key, values }) => ({
      key,
      values: values && [...values],
    })),
  },
  highlightedLayers: LAYER_IDS.filter((layer) =>
    highlightedLayers.includes(layer),
  ),
  highlights: HIGHLIGHT_RULE_IDS.filter((rule) => highlights.includes(rule)),
});

/** The body of `GET /api/modes`: every Scout Mode in the config, in its order. */
export const modesResponse = (config: ScoringConfig): ModesResponse => ({
  modes: config.modes.map(scoutMode),
});
