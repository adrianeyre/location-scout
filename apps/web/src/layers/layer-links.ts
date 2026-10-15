import type { ServedLayerId } from "@location-scout/shared";

/** The id of a Layer's part of the Location Overview, which a Highlight links to. */
export const layerOverviewId = (layer: ServedLayerId) => `${layer}-overview`;
