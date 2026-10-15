import { SERVED_LAYER_IDS, type ServedLayerId } from "@location-scout/shared";

/**
 * Where each Widget of the Dashboard sits on its Grid: a pure model, so
 * moving and resizing one can be tested without a browser.
 *
 * The Grid is `GRID.columns` wide and as many rows tall as it needs. A
 * Widget covers whole cells, so it snaps to them, and is as many rows tall
 * as its content needs, unless it was made a height of its own. Widgets
 * never overlap: one dropped or grown onto others
 * pushes them down, and every Widget then rises as far as it can, so no
 * band of blank space is left between them.
 */

export const GRID = { columns: 12, rowHeight: 8, gap: 16 } as const;

/** The Widgets above the Layers' own: the Location Score, the Category Scores and the Highlights. */
export const LEAD_WIDGETS = ["score", "categories", "highlights"] as const;

export type WidgetId = (typeof LEAD_WIDGETS)[number] | ServedLayerId;

export const WIDGET_IDS: readonly WidgetId[] = [
  ...LEAD_WIDGETS,
  ...SERVED_LAYER_IDS,
];

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Made this tall by a resize: kept at that height, its content scrolling
   * in it or with space below it, rather than fitted to its content.
   */
  sized?: boolean;
  /** Hidden from the Dashboard, until it is shown again from Settings. It keeps its place, and takes no room. */
  hidden?: boolean;
}

export type WidgetLayout = Record<WidgetId, Cell>;

/** How many rows a Widget is drawn before its content is measured. */
const FIRST_GUESS = 16;

/** The least a Widget is drawn, measured or not. */
const MIN_ROWS = 4;

/** The smallest a Widget can be made, in cells: a quarter of the Grid wide, and room for its header and a little more. */
export const MIN_SIZE = { w: 3, h: 6 } as const;

/** The lead's widths: the score narrow, the Category Scores and the Highlights wider. */
const LEAD_CELLS: Record<(typeof LEAD_WIDGETS)[number], Cell> = {
  score: { x: 0, y: 0, w: 3, h: FIRST_GUESS },
  categories: { x: 3, y: 0, w: 4, h: FIRST_GUESS },
  highlights: { x: 7, y: 0, w: 5, h: FIRST_GUESS },
};

/** A Layer's Widget is a third of the Grid wide. */
const LAYER_WIDTH = 4;

/**
 * Where the Widgets start: the lead across the top, then the Layers three
 * to a row in `order`, the Scout Mode's highlighted ones first.
 */
export const defaultLayout = (
  order: readonly ServedLayerId[],
): WidgetLayout => {
  const layout = { ...LEAD_CELLS } as WidgetLayout;
  order.forEach((layer, index) => {
    const perRow = GRID.columns / LAYER_WIDTH;
    layout[layer] = {
      x: (index % perRow) * LAYER_WIDTH,
      y: FIRST_GUESS * (1 + Math.floor(index / perRow)),
      w: LAYER_WIDTH,
      h: FIRST_GUESS,
    };
  });
  return compact(layout);
};

const overlaps = (a: Cell, b: Cell) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const sameCell = (a: Cell, b: Cell) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** The Widgets shown, top to bottom, then left to right: the order they are read in. */
export const readingOrder = (layout: WidgetLayout): WidgetId[] =>
  WIDGET_IDS.filter((id) => id in layout && !layout[id].hidden).toSorted(
    (a, b) => layout[a].y - layout[b].y || layout[a].x - layout[b].x,
  );

/** Push whatever `id` covers down below it, and whatever that then covers below that, and so on. */
const settle = (layout: WidgetLayout, id: WidgetId): WidgetLayout => {
  const next = { ...layout };
  const queue: WidgetId[] = [id];
  while (queue.length > 0) {
    const mover = next[queue.shift() as WidgetId];
    for (const other of readingOrder(next)) {
      if (
        other === id ||
        next[other] === mover ||
        !overlaps(mover, next[other])
      )
        continue;
      next[other] = { ...next[other], y: mover.y + mover.h };
      queue.push(other);
    }
  }
  return next;
};

/**
 * Each Widget, top to bottom, risen as far as it can go without overlapping
 * one above it, so no blank band is left. Any that overlap are pushed down
 * first, in reading order.
 */
const compact = (layout: WidgetLayout): WidgetLayout => {
  const next = { ...layout };
  const placed: Cell[] = [];
  const clashes = (cell: Cell) => placed.some((each) => overlaps(cell, each));
  for (const id of readingOrder(layout)) {
    let cell = next[id];
    while (cell.y > 0 && !clashes({ ...cell, y: cell.y - 1 }))
      cell = { ...cell, y: cell.y - 1 };
    while (clashes(cell)) cell = { ...cell, y: cell.y + 1 };
    next[id] = cell;
    placed.push(cell);
  }
  return next;
};

/**
 * A Widget moved to column `x` and row `y`, snapped to whole cells and kept
 * inside the Grid. Moved up or across onto others, it takes their place and
 * pushes them down. Moved down onto the ones below it, it swaps with them:
 * they rise into the rows it left and it goes under them.
 */
export const moveWidget = (
  layout: WidgetLayout,
  id: WidgetId,
  x: number,
  y: number,
): WidgetLayout => {
  const from = layout[id];
  const to: Cell = {
    ...from,
    x: Math.min(GRID.columns - from.w, Math.max(0, Math.round(x))),
    y: Math.max(0, Math.round(y)),
  };
  if (to.x === from.x && to.y === from.y) return layout;
  let next: WidgetLayout = { ...layout, [id]: to };
  if (to.y > from.y) {
    const others = readingOrder(layout).filter((other) => other !== id);
    const below = others.filter(
      (other) =>
        layout[other].y >= from.y + from.h && overlaps(to, layout[other]),
    );
    if (below.length > 0) {
      const rise = Math.min(...below.map((other) => layout[other].y)) - from.y;
      const risen = { ...layout };
      for (const other of below)
        risen[other] = { ...layout[other], y: layout[other].y - rise };
      const blocked = others.some(
        (other) =>
          !below.includes(other) &&
          below.some((each) => overlaps(risen[each], layout[other])),
      );
      if (!blocked) {
        const column = { ...to, y: 0, h: Number.POSITIVE_INFINITY };
        const under = Math.max(
          to.y,
          ...below
            .filter((each) => overlaps(column, risen[each]))
            .map((each) => risen[each].y + risen[each].h),
        );
        next = { ...risen, [id]: { ...to, y: under } };
      }
    }
  }
  return compact(settle(next, id));
};

/**
 * A Widget made `w` columns wide and `h` rows tall from its top-left
 * corner, snapped to whole cells, no smaller than `MIN_SIZE` and inside the
 * Grid. Whatever it grows over is pushed down, and whatever is below one
 * made smaller rises. Made taller or shorter, it keeps that height
 * (`sized`); made only wider or narrower, it is still fitted to its content.
 */
export const resizeWidget = (
  layout: WidgetLayout,
  id: WidgetId,
  w: number,
  h: number,
): WidgetLayout => {
  const from = layout[id];
  const to: Cell = {
    ...from,
    w: Math.min(GRID.columns - from.x, Math.max(MIN_SIZE.w, Math.round(w))),
    h: Math.max(MIN_SIZE.h, Math.round(h)),
  };
  if (to.w === from.w && to.h === from.h) return layout;
  if (to.h !== from.h) to.sized = true;
  return compact(settle({ ...layout, [id]: to }, id));
};

/** A Widget given back to its content: no longer kept at the height it was made, but as tall as its content. */
export const fitWidget = (layout: WidgetLayout, id: WidgetId): WidgetLayout => {
  if (!layout[id].sized) return layout;
  const { x, y, w, h } = layout[id];
  return { ...layout, [id]: { x, y, w, h } };
};

/**
 * A Widget hidden, its rows closing up as what is below it rises, or shown
 * again where it was, pushing down whatever is there now.
 */
export const setWidgetHidden = (
  layout: WidgetLayout,
  id: WidgetId,
  hidden: boolean,
): WidgetLayout => {
  if (Boolean(layout[id].hidden) === hidden) return layout;
  const { x, y, w, h, sized } = layout[id];
  const cell: Cell = { x, y, w, h, ...(sized && { sized }) };
  if (hidden) return compact({ ...layout, [id]: { ...cell, hidden } });
  return compact(settle({ ...layout, [id]: cell }, id));
};

/** How many rows a Widget needs to show `px` of itself: it spans the gaps between its rows. */
export const rowsFor = (px: number) =>
  Math.max(
    MIN_ROWS,
    Math.ceil((px + GRID.gap - 0.5) / (GRID.rowHeight + GRID.gap)),
  );

/**
 * The layout with each Widget as tall as its content needs, `needed` rows,
 * but those made a height of their own (`sized`). Widgets whose tops are
 * level are drawn as tall as the tallest of them, so a row of Widgets ends
 * level too, with no blank space under the shorter ones. One that grew
 * pushes down what is below it, and what is below one that shrank rises.
 */
export const fitToContent = (
  layout: WidgetLayout,
  needed: Partial<Record<WidgetId, number>>,
): WidgetLayout => {
  let next = layout;
  // Each pass levels one more row: a row that grows moves the tops of those below it.
  for (let pass = 0; pass < WIDGET_IDS.length; pass += 1) {
    const fitted = readingOrder(next).filter((id) => !next[id].sized);
    const tallest = new Map<number, number>();
    for (const id of fitted) {
      const rows = needed[id] ?? next[id].h;
      tallest.set(next[id].y, Math.max(tallest.get(next[id].y) ?? 0, rows));
    }
    const draft = { ...next };
    const changed = fitted.filter((id) => {
      const h = tallest.get(next[id].y) ?? next[id].h;
      if (h === next[id].h) return false;
      draft[id] = { ...next[id], h };
      return true;
    });
    if (changed.length === 0) break;
    next = compact(changed.reduce(settle, draft));
  }
  return next;
};

/** Which way a nudged Widget jumps: away from the one dropped, -1, 0 or 1 on each axis. */
export interface Nudge {
  x: number;
  y: number;
}

/**
 * The Widgets a drop nudges: those it moved, and those that now touch the
 * one dropped or resized, each with the way it jumps, away from it.
 */
export const nudgesFrom = (
  before: WidgetLayout,
  after: WidgetLayout,
  dropped: WidgetId,
): Partial<Record<WidgetId, Nudge>> => {
  const at = after[dropped];
  const nudges: Partial<Record<WidgetId, Nudge>> = {};
  for (const id of readingOrder(after)) {
    if (id === dropped) continue;
    const cell = after[id];
    const columns = cell.x < at.x + at.w && at.x < cell.x + cell.w;
    const rows = cell.y < at.y + at.h && at.y < cell.y + cell.h;
    const besideIt =
      rows && (cell.x === at.x + at.w || cell.x + cell.w === at.x);
    const aboveOrBelow =
      columns &&
      (Math.abs(cell.y - (at.y + at.h)) <= 1 ||
        Math.abs(cell.y + cell.h - at.y) <= 1);
    if (!besideIt && !aboveOrBelow && sameCell(before[id], cell)) continue;
    const side = (start: number, size: number, from: number, width: number) =>
      Math.sign(start + size / 2 - (from + width / 2));
    nudges[id] = {
      x: columns ? 0 : side(cell.x, cell.w, at.x, at.w),
      y: rows && !columns ? 0 : side(cell.y, cell.h, at.y, at.h) || 1,
    };
  }
  return nudges;
};

/** Where the layout is kept in the browser between visits. */
export const LAYOUT_STORAGE_KEY = "location-scout:dashboard-layout";

export const serialiseLayout = (layout: WidgetLayout) =>
  JSON.stringify({
    version: 1,
    widgets: Object.fromEntries(
      WIDGET_IDS.filter((id) => id in layout).map((id) => {
        const { x, y, w, h, sized, hidden } = layout[id];
        return [
          id,
          {
            ...(sized ? { x, y, w, h, sized } : { x, y, w }),
            ...(hidden && { hidden }),
          },
        ];
      }),
    ),
  });

/**
 * A kept layout, as far as it can be trusted, or `null` with none. A Widget
 * missing from it, or kept wrongly, takes its place in `fallback`.
 */
export const parseLayout = (
  saved: string | null,
  fallback: WidgetLayout,
): WidgetLayout | null => {
  if (!saved) return null;
  let widgets: unknown;
  try {
    widgets = (JSON.parse(saved) as { widgets?: unknown }).widgets;
  } catch {
    return null;
  }
  if (typeof widgets !== "object" || widgets === null) return null;
  const layout = { ...fallback };
  for (const id of WIDGET_IDS) {
    const entry = (widgets as Record<string, unknown>)[id];
    if (typeof entry !== "object" || entry === null) continue;
    const { x, y, w, h, sized, hidden } = entry as Record<string, unknown>;
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    const width = Number.isInteger(w)
      ? Math.min(GRID.columns, Math.max(MIN_SIZE.w, w as number))
      : fallback[id].w;
    const height =
      sized === true && Number.isInteger(h)
        ? Math.max(MIN_SIZE.h, h as number)
        : null;
    layout[id] = {
      ...fallback[id],
      x: Math.min(GRID.columns - width, Math.max(0, x as number)),
      y: Math.max(0, y as number),
      w: width,
      ...(height !== null && { h: height, sized: true }),
      ...(hidden === true && { hidden: true }),
    };
  }
  return compact(layout);
};
