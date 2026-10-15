import type { CSSProperties } from "react";

import type { ServedLayerId } from "@location-scout/shared";

import { LAYER_STYLES } from "./layer-styles";

/** The Layer's icon, white on its colour, as its map markers show it (PRD FR-9.3). */
export const LayerIcon = ({ layer }: { layer: ServedLayerId }) => {
  const { colour, icon } = LAYER_STYLES[layer];
  return (
    <span
      className="layer-icon"
      style={{ "--layer-colour": colour } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24">
        <path d={icon} />
      </svg>
    </span>
  );
};
