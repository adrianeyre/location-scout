/**
 * What floats over the map, such as the side panel, is marked
 * `data-covers-map`, and says so with `MAP_COVER_EVENT` whenever it moves,
 * so the map keeps the Search Area in the part that can be seen.
 */
export const MAP_COVER_EVENT = "location-scout:map-cover";

/** Says that what covers the map has moved, opened or closed. */
export const announceMapCover = () => {
  window.dispatchEvent(new Event(MAP_COVER_EVENT));
};

/**
 * How far in from each edge of `map`, in pixels, what is marked
 * `data-covers-map` reaches: a panel along the right, or a sheet along the
 * foot. Never more than 60% of the map, so there is always room left.
 */
export const coveredEdges = (map: HTMLElement) => {
  const bounds = map.getBoundingClientRect();
  const edges = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const cover of document.querySelectorAll("[data-covers-map]")) {
    const over = cover.getBoundingClientRect();
    const overlaps =
      over.width > 0 &&
      over.height > 0 &&
      over.left < bounds.right &&
      over.right > bounds.left &&
      over.top < bounds.bottom &&
      over.bottom > bounds.top;
    if (!overlaps) continue;
    if (over.width >= bounds.width * 0.9) {
      edges.bottom = Math.max(edges.bottom, bounds.bottom - over.top);
    } else if (over.left > bounds.left + bounds.width / 2) {
      edges.right = Math.max(edges.right, bounds.right - over.left);
    }
  }
  edges.right = Math.round(Math.min(edges.right, bounds.width * 0.6));
  edges.bottom = Math.round(Math.min(edges.bottom, bounds.height * 0.6));
  return edges;
};
