/** The Location's marker, on the map and in a report's map image. */
export const LOCATION_COLOUR = "#c2185b";

/** The Search Area circle's outline and faint fill. */
export const SEARCH_AREA_COLOUR = "#1565c0";

/** The bounds of a ring of `[lng, lat]` points, south-west then north-east. */
export const boundsOf = (
  ring: readonly (readonly [number, number])[],
): [[number, number], [number, number]] => {
  const lngs = ring.map(([lng]) => lng);
  const lats = ring.map(([, lat]) => lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
};
