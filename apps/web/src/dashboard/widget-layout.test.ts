import { describe, expect, it } from "vitest";

import { SERVED_LAYER_IDS, type ServedLayerId } from "@location-scout/shared";

import {
  GRID,
  defaultLayout,
  MIN_SIZE,
  fitToContent,
  fitWidget,
  moveWidget,
  nudgesFrom,
  parseLayout,
  readingOrder,
  resizeWidget,
  rowsFor,
  serialiseLayout,
  setWidgetHidden,
  type Cell,
  type WidgetLayout,
} from "./widget-layout";

const overlaps = (a: Cell, b: Cell) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const noOverlaps = (layout: WidgetLayout) => {
  const ids = readingOrder(layout);
  return ids.every((id, index) =>
    ids.slice(index + 1).every((other) => !overlaps(layout[id], layout[other])),
  );
};

const START = defaultLayout(SERVED_LAYER_IDS);

/** The item at `index`, which the test knows is there. */
const nth = <T>(items: readonly T[], index: number): T => {
  const item = items.at(index);
  if (item === undefined) throw new Error(`Nothing at ${String(index)}`);
  return item;
};

/** Two Layers' Widgets, one directly above the other. */
const [first, second] = [
  nth(readingOrder(START), 3),
  nth(readingOrder(START), 6),
];

describe("defaultLayout", () => {
  it("puts the lead across the top and the Layers three to a row in order", () => {
    expect(readingOrder(START).slice(0, 6)).toEqual([
      "score",
      "categories",
      "highlights",
      SERVED_LAYER_IDS[0],
      SERVED_LAYER_IDS[1],
      SERVED_LAYER_IDS[2],
    ]);
    expect(START.score.y).toBe(0);
    expect(START[SERVED_LAYER_IDS[0]]).toMatchObject({ x: 0, w: 4 });
    expect(noOverlaps(START)).toBe(true);
  });

  it("follows the order given, so a Scout Mode's Layers come first", () => {
    const order: ServedLayerId[] = [
      "land",
      ...SERVED_LAYER_IDS.filter((id) => id !== "land"),
    ];
    expect(readingOrder(defaultLayout(order))[3]).toBe("land");
  });

  it("keeps every Widget inside the Grid", () => {
    for (const id of readingOrder(START))
      expect(START[id].x + START[id].w).toBeLessThanOrEqual(GRID.columns);
  });
});

describe("moveWidget", () => {
  it("snaps to whole cells and keeps a Widget inside the Grid", () => {
    const moved = moveWidget(START, "crime", 99.4, 0.3);
    expect(moved.crime.x).toBe(GRID.columns - moved.crime.w);
    expect(Number.isInteger(moved.crime.y)).toBe(true);
    expect(noOverlaps(moved)).toBe(true);
  });

  it("moved up onto another, takes its place and pushes it down", () => {
    const moved = moveWidget(START, second, START[first].x, START[first].y);
    expect(moved[second].y).toBe(START[first].y);
    expect(moved[first].y).toBe(moved[second].y + moved[second].h);
    expect(noOverlaps(moved)).toBe(true);
  });

  it("moved down onto the one below, swaps with it", () => {
    const moved = moveWidget(START, first, START[first].x, START[first].y + 1);
    expect(moved[second].y).toBe(START[first].y);
    expect(moved[first].y).toBe(moved[second].y + moved[second].h);
    expect(noOverlaps(moved)).toBe(true);
  });

  it("moved into blank space, rises until it meets another", () => {
    const moved = moveWidget(START, "score", 0, 500);
    expect(moved.score.y).toBeLessThan(500);
    expect(noOverlaps(moved)).toBe(true);
  });

  it("left where it is, changes nothing", () => {
    expect(moveWidget(START, "crime", START.crime.x, START.crime.y)).toBe(
      START,
    );
  });
});

describe("fitToContent", () => {
  it("draws each Widget as tall as its content, pushing down and closing up", () => {
    const fitted = fitToContent(START, {
      score: 30,
      categories: 6,
      highlights: 6,
    });
    expect(fitted.score.h).toBe(30);
    const under = readingOrder(fitted).find(
      (id) => fitted[id].x === 0 && id !== "score",
    );
    expect(under && fitted[under].y).toBe(30);
    expect(noOverlaps(fitted)).toBe(true);
  });

  it("draws a row of Widgets as tall as the tallest, so it ends level with no blank space", () => {
    const needed = Object.fromEntries(
      readingOrder(START).map((id, index) => [id, 6 + ((index * 7) % 13)]),
    );
    const fitted = fitToContent(START, needed);
    const rows = Map.groupBy(readingOrder(fitted), (id) => fitted[id].y);
    for (const ids of rows.values()) {
      const bottoms = new Set(ids.map((id) => fitted[id].y + fitted[id].h));
      expect(bottoms.size).toBe(1);
      expect(ids.reduce((sum, id) => sum + fitted[id].w, 0)).toBe(GRID.columns);
    }
    expect(noOverlaps(fitted)).toBe(true);
  });

  it("keeps a Widget made a height of its own at that height", () => {
    const sized = resizeWidget(START, "crime", START.crime.w, 30);
    expect(fitToContent(sized, { crime: 8 }).crime.h).toBe(30);
  });

  it("changes nothing when every height is as measured", () => {
    expect(fitToContent(START, { score: START.score.h })).toBe(START);
  });
});

describe("rowsFor", () => {
  it("gives the rows that hold a height, the gaps between them included", () => {
    const pitch = GRID.rowHeight + GRID.gap;
    expect(rowsFor(10 * pitch - GRID.gap)).toBe(10);
    expect(rowsFor(10 * pitch - GRID.gap + 1)).toBe(11);
    expect(rowsFor(0)).toBe(4);
  });
});

describe("nudgesFrom", () => {
  it("nudges the Widgets the drop moved and those touching it, away from it", () => {
    const after = moveWidget(START, second, START[first].x, START[first].y);
    const nudges = nudgesFrom(START, after, second);
    expect(nudges[second]).toBeUndefined();
    expect(nudges[first]).toEqual({ x: 0, y: 1 });
    const beside = readingOrder(after).find(
      (id) =>
        after[id].y === after[second].y &&
        after[id].x === after[second].x + after[second].w,
    );
    expect(beside && nudges[beside]).toEqual({ x: 1, y: 0 });
  });

  it("leaves alone a Widget that neither moved nor touches it", () => {
    const far = nth(readingOrder(START), -1);
    expect(nudgesFrom(START, START, "score")[far]).toBeUndefined();
  });
});

describe("parseLayout", () => {
  it("reads back a layout it kept, sizes and all", () => {
    const moved = resizeWidget(
      moveWidget(START, "crime", 8, 0),
      "score",
      4,
      30,
    );
    const parsed = parseLayout(serialiseLayout(moved), START);
    expect(parsed && readingOrder(parsed)).toEqual(readingOrder(moved));
    expect(parsed?.score).toMatchObject({ w: 4, h: 30, sized: true });
  });

  it("gives none for nothing kept or something unreadable", () => {
    expect(parseLayout(null, START)).toBeNull();
    expect(parseLayout("{", START)).toBeNull();
    expect(parseLayout('{"widgets":3}', START)).toBeNull();
  });

  it("puts a Widget kept wrongly where it starts, and keeps the rest inside the Grid", () => {
    const parsed = parseLayout(
      JSON.stringify({
        widgets: { crime: { x: "a", y: 0 }, score: { x: 40, y: 0 } },
      }),
      START,
    );
    if (!parsed) throw new Error("Nothing parsed");
    expect(parsed.score.x).toBe(GRID.columns - START.score.w);
    expect(noOverlaps(parsed)).toBe(true);
  });
});

describe("resizeWidget", () => {
  it("snaps to whole cells, pushing down what it grows over", () => {
    const grown = resizeWidget(START, "score", 5.4, START.score.h + 0.2);
    expect(grown.score).toMatchObject({ w: 5, h: START.score.h });
    expect(grown.score.sized).toBeUndefined();
    expect(grown.categories.y).toBeGreaterThanOrEqual(grown.score.h);
    expect(noOverlaps(grown)).toBe(true);
  });

  it("made taller or shorter, keeps that height", () => {
    const taller = resizeWidget(START, "crime", START.crime.w, 40);
    expect(taller.crime).toMatchObject({ h: 40, sized: true });
    const under = readingOrder(taller).find(
      (id) => taller[id].x === taller.crime.x && taller[id].y > taller.crime.y,
    );
    expect(under && taller[under].y).toBe(taller.crime.y + 40);
  });

  it("is no smaller than its least, and no wider than the Grid", () => {
    const small = resizeWidget(START, "crime", 0, 0);
    expect(small.crime).toMatchObject(MIN_SIZE);
    const wide = resizeWidget(START, "highlights", 40, START.highlights.h);
    expect(wide.highlights.x + wide.highlights.w).toBe(GRID.columns);
  });

  it("fitted again, gives the height back to its content", () => {
    const sized = resizeWidget(START, "crime", START.crime.w, 40);
    const fitted = fitWidget(sized, "crime");
    expect(fitted.crime.sized).toBeUndefined();
    expect(fitToContent(fitted, { crime: 9 }).crime.h).toBeLessThan(40);
  });
});

describe("setWidgetHidden", () => {
  it("hidden, a Widget takes no room, and what was under it rises", () => {
    const hidden = setWidgetHidden(START, first, true);
    expect(readingOrder(hidden)).not.toContain(first);
    expect(hidden[second].y).toBe(START[first].y);
    expect(noOverlaps(hidden)).toBe(true);
  });

  it("shown again, goes back where it was, pushing down what is there now", () => {
    const shown = setWidgetHidden(
      setWidgetHidden(START, first, true),
      first,
      false,
    );
    expect(shown[first]).toEqual(START[first]);
    expect(shown[second].y).toBe(START[second].y);
  });

  it("stays hidden when the layout is kept and read back", () => {
    const hidden = setWidgetHidden(START, "land", true);
    const parsed = parseLayout(serialiseLayout(hidden), START);
    expect(parsed?.land.hidden).toBe(true);
    expect(parsed && readingOrder(parsed)).not.toContain("land");
  });
});
