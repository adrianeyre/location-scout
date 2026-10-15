import { SCORING_CONFIG, type ScoringConfig } from "../scoring/config";
import { findScoutMode } from "../scoring/scout-modes";

/** The Scout Mode `id` in `config`, which a test expects to be there. */
export const modeOf = (id: string, config: ScoringConfig = SCORING_CONFIG) => {
  const mode = findScoutMode(config, id);
  if (!mode) throw new Error(`There is no Scout Mode ${id} in the config.`);
  return mode;
};
