import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import type { ServedLayerId } from "@location-scout/shared";

import {
  GRID,
  fitToContent,
  fitWidget,
  moveWidget,
  nudgesFrom,
  readingOrder,
  resizeWidget,
  setWidgetHidden,
  rowsFor,
  type Nudge,
  type WidgetId,
  type WidgetLayout,
} from "./widget-layout";

/** One of the Dashboard's Widgets: a card that can be moved about its Grid. */
export interface Widget {
  id: WidgetId;
  /** What its grip and its announcements call it. */
  title: string;
  /** The id of its heading, which names its region. */
  labelledBy: string;
  className?: string;
  busy?: boolean;
  layer?: ServedLayerId;
  /** Its content, given the controls to put in its header. */
  content: (controls: WidgetControls) => ReactNode;
}

/** The controls in a Widget's header: its grip, first, and its hide button, last. */
export interface WidgetControls {
  grip: ReactNode;
  hide: ReactNode;
}

/** How far the pointer must go before a press becomes a drag, so a click stays a click. */
const DRAG_THRESHOLD = 4;

/** How close to the top or bottom of the Dashboard the pointer must be for a drag to scroll it. */
const EDGE = 48;

/** How far a Widget leans as it is dragged, as if lifted off the page. */
const TILT = "3deg";

/** A Widget is moved by its header and resized by its corner. */
type Kind = "move" | "resize";

interface Gesture {
  id: WidgetId;
  kind: Kind;
  pointerId: number;
  from: { x: number; y: number };
  last: { x: number; y: number };
  /** The width and height of one cell and its gap, in pixels. */
  pitch: { x: number; y: number };
  /** Where the Widget was on screen when it was pressed. */
  rect: { left: number; top: number };
  scroller: HTMLElement | null;
  scrollStart: number;
  started: boolean;
}

interface Drag {
  id: WidgetId;
  kind: Kind;
  offset: { x: number; y: number };
  /** The layout as it will be once dropped, which the placeholder and the others show. */
  preview: WidgetLayout;
}

interface Landing {
  id: WidgetId;
  /** Where the Widget was on screen when it was let go. */
  from: { left: number; top: number };
}

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The nearest ancestor that scrolls, or null when it is the page itself. */
const scrollParent = (element: HTMLElement): HTMLElement | null => {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  )
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  return null;
};

/** The Grid is drawn as one only when wide enough; narrower, the Widgets stack in reading order and stay put. */
const isGrid = (element: HTMLElement | null) =>
  element !== null && getComputedStyle(element).display === "grid";

/** A press on these starts no drag, but for the grip: they are clicked, typed in, or have pointer handling of their own. */
const INTERACTIVE = "a, button, input, select, textarea, summary, [tabindex]";

/** Where a Widget sits, said as its place in reading order and its columns, or, resized, its size. */
const describe = (
  layout: WidgetLayout,
  id: WidgetId,
  title: string,
  kind: Kind,
) => {
  const { x, w, h, sized } = layout[id];
  if (kind === "resize")
    return `${title} resized: ${String(w)} columns wide, ${sized ? `${String(h)} rows tall` : "as tall as its content"}.`;
  const order = readingOrder(layout);
  return `${title} moved: now ${String(order.indexOf(id) + 1)} of ${String(order.length)}, in columns ${String(x + 1)} to ${String(x + w)}.`;
};

/**
 * The Dashboard's Widgets on their Grid. Each is dragged by its header,
 * snapping to whole cells, and leans as it goes; dropped, it settles into
 * place and the Widgets around it jump, nudged. Each is resized by its
 * corner, snapping too; double-clicked, the corner fits it to its content
 * again. From the keyboard, its grip moves it with the arrow keys and
 * resizes it with Shift and the arrow keys. Narrower than the Grid needs,
 * the Widgets stack in reading order.
 */
export const WidgetGrid = ({
  widgets,
  layout: kept,
  onLayout,
}: {
  widgets: readonly Widget[];
  layout: WidgetLayout;
  onLayout: (layout: WidgetLayout) => void;
}) => {
  const [needed, setNeeded] = useState<Partial<Record<WidgetId, number>>>({});
  const layout = fitToContent(kept, needed);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [nudges, setNudges] = useState<{
    round: number;
    by: Partial<Record<WidgetId, Nudge>>;
  }>({ round: 0, by: {} });
  const [announcement, setAnnouncement] = useState("");
  const gesture = useRef<Gesture | null>(null);
  const landing = useRef<Landing | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<WidgetId, HTMLElement>());
  const contents = useRef(new Map<WidgetId, HTMLElement>());
  const grips = useRef(new Map<WidgetId, HTMLButtonElement>());
  const refocus = useRef<WidgetId | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const hintId = useId();
  const shown = drag?.preview ?? layout;
  const titles = Object.fromEntries(
    widgets.map(({ id, title }) => [id, title]),
  ) as Record<WidgetId, string>;

  // Each Widget's rows as its content needs them, measured again whenever its content changes size.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next: Partial<Record<WidgetId, number>> = {};
      for (const [id, content] of contents.current) {
        const card = content.parentElement;
        if (!card || content.offsetHeight === 0) continue;
        const style = getComputedStyle(card);
        const frame = [
          style.paddingTop,
          style.paddingBottom,
          style.borderTopWidth,
          style.borderBottomWidth,
        ].reduce((sum, each) => sum + (Number.parseFloat(each) || 0), 0);
        next[id] = rowsFor(content.offsetHeight + frame);
      }
      setNeeded((before) =>
        Object.keys({ ...before, ...next }).every(
          (id) => before[id as WidgetId] === next[id as WidgetId],
        )
          ? before
          : next,
      );
    };
    observer.current = new ResizeObserver(measure);
    return () => {
      observer.current?.disconnect();
    };
  }, []);
  // A Widget drawn for the first time is watched from then on; watching one twice changes nothing.
  useEffect(() => {
    for (const content of contents.current.values())
      observer.current?.observe(content);
  });

  // Moved by the keyboard, a Widget moves in the page too, which drops focus: its grip takes it back.
  // Dropped, it settles from where it was let go into its place, still leaning, and straightens.
  useLayoutEffect(() => {
    if (refocus.current) grips.current.get(refocus.current)?.focus();
    refocus.current = null;
    const landed = landing.current;
    landing.current = null;
    const card = landed && cards.current.get(landed.id);
    if (
      !landed ||
      !card ||
      typeof card.animate !== "function" ||
      reducedMotion()
    )
      return;
    const to = card.getBoundingClientRect();
    card.animate(
      [
        {
          translate: `${String(landed.from.left - to.left)}px ${String(landed.from.top - to.top)}px`,
          rotate: TILT,
        },
        { translate: "0 0", rotate: "0deg" },
      ],
      { duration: 240, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.2)" },
    );
  });

  const follow = () => {
    const current = gesture.current;
    if (!current?.started) return;
    const scrolled = current.scroller
      ? current.scroller.scrollTop - current.scrollStart
      : 0;
    const offset = {
      x: current.last.x - current.from.x,
      y: current.last.y - current.from.y + scrolled,
    };
    const start = layout[current.id];
    const cols = Math.round(offset.x / current.pitch.x);
    const rows = Math.round(offset.y / current.pitch.y);
    const preview =
      current.kind === "move"
        ? moveWidget(layout, current.id, start.x + cols, start.y + rows)
        : resizeWidget(layout, current.id, start.w + cols, start.h + rows);
    setDrag({ id: current.id, kind: current.kind, offset, preview });
  };

  const begin = (event: PointerEvent<HTMLElement>, id: WidgetId) => {
    const element = grid.current;
    if (event.button !== 0 || !element || !isGrid(element)) return;
    const target = event.target as HTMLElement;
    const kind: Kind = target.closest(".widget-resize") ? "resize" : "move";
    const handle = target.closest(".widget-grip, .card-head");
    const control = target.closest(INTERACTIVE);
    const pressed =
      control &&
      event.currentTarget.contains(control) &&
      !control.classList.contains("widget-grip");
    if (kind === "move" && (!handle || pressed)) return;
    const width = element.clientWidth;
    const cell = (width - GRID.gap * (GRID.columns - 1)) / GRID.columns;
    const scroller = scrollParent(element);
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.current = {
      id,
      kind,
      pointerId: event.pointerId,
      from: { x: event.clientX, y: event.clientY },
      last: { x: event.clientX, y: event.clientY },
      pitch: { x: cell + GRID.gap, y: GRID.rowHeight + GRID.gap },
      rect: { left: rect.left, top: rect.top },
      scroller,
      scrollStart: scroller?.scrollTop ?? 0,
      started: false,
    };
  };

  const track = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    current.last = { x: event.clientX, y: event.clientY };
    const moved = Math.hypot(
      event.clientX - current.from.x,
      event.clientY - current.from.y,
    );
    if (!current.started && moved < DRAG_THRESHOLD) return;
    // Captured only once it is a drag, so a click or a double-click lands on what was pressed.
    if (!current.started)
      event.currentTarget.setPointerCapture(event.pointerId);
    current.started = true;
    event.preventDefault();
    follow();
  };

  const cancel = () => {
    gesture.current = null;
    setDrag(null);
  };

  const settle = (
    before: WidgetLayout,
    after: WidgetLayout,
    id: WidgetId,
    kind: Kind,
  ) => {
    onLayout(after);
    setNudges(({ round }) => ({
      round: round + 1,
      by: nudgesFrom(before, after, id),
    }));
    setAnnouncement(describe(after, id, titles[id], kind));
  };

  // Also when the pointer's capture is lost: the drag ends where it was, rather than being left hanging.
  const end = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    if (drag && current.started) {
      if (drag.kind === "move")
        landing.current = {
          id: drag.id,
          from: {
            left: current.rect.left + current.last.x - current.from.x,
            top: current.rect.top + current.last.y - current.from.y,
          },
        };
      if (drag.preview !== layout)
        settle(layout, drag.preview, drag.id, drag.kind);
    }
    cancel();
  };

  const onGripKey = (event: KeyboardEvent, id: WidgetId) => {
    const step = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!step || !isGrid(grid.current)) return;
    event.preventDefault();
    const [dx, dy] = step as [number, number];
    const at = layout[id];
    const kind: Kind = event.shiftKey ? "resize" : "move";
    const next =
      kind === "resize"
        ? resizeWidget(layout, id, at.w + dx, at.h + dy)
        : moveWidget(layout, id, at.x + dx, at.y + dy);
    const still = readingOrder(next).every(
      (each) =>
        next[each].x === layout[each].x &&
        next[each].y === layout[each].y &&
        next[each].w === layout[each].w &&
        next[each].h === layout[each].h,
    );
    if (still) {
      setAnnouncement(
        kind === "resize"
          ? `${titles[id]} can't be made any ${dx > 0 ? "wider" : dx < 0 ? "narrower" : dy > 0 ? "taller" : "shorter"}.`
          : `${titles[id]} can't move further that way.`,
      );
      return;
    }
    refocus.current = id;
    settle(layout, next, id, kind);
  };

  // Hidden, its rows close up, and focus goes on to the grip of the Widget read after it.
  const hide = (id: WidgetId) => {
    const order = readingOrder(layout);
    const after = order[order.indexOf(id) + 1] ?? order[order.indexOf(id) - 1];
    refocus.current = after ?? null;
    onLayout(setWidgetHidden(layout, id, true));
    setAnnouncement(`${titles[id]} hidden. Show it again from Settings.`);
  };

  const fit = (id: WidgetId) => {
    if (!layout[id].sized) return;
    settle(layout, fitWidget(layout, id), id, "resize");
  };

  // Escape puts a Widget being dragged back; held near the top or bottom, the Dashboard scrolls.
  const latest = useRef({ follow, cancel });
  useLayoutEffect(() => {
    latest.current = { follow, cancel };
  });
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") latest.current.cancel();
    };
    window.addEventListener("keydown", onKey);
    const scroller = gesture.current?.scroller;
    const onScroll = () => {
      latest.current.follow();
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    let frame = 0;
    const edgeScroll = () => {
      const current = gesture.current;
      if (current?.scroller) {
        const box = current.scroller.getBoundingClientRect();
        const by =
          current.last.y < box.top + EDGE
            ? current.last.y - (box.top + EDGE)
            : current.last.y > box.bottom - EDGE
              ? current.last.y - (box.bottom - EDGE)
              : 0;
        if (by !== 0) current.scroller.scrollTop += Math.round(by / 3);
      }
      frame = requestAnimationFrame(edgeScroll);
    };
    if (typeof requestAnimationFrame === "function")
      frame = requestAnimationFrame(edgeScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      scroller?.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [dragging]);

  // In the order they were before a drag began, while it lasts: moving one in the page would lose the pointer's capture.
  const order = readingOrder(drag ? layout : shown);
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const placeholder = drag?.kind === "move" ? shown[drag.id] : null;

  return (
    <>
      <p id={hintId} className="visually-hidden">
        Arrow keys move it about the Dashboard; Shift and the arrow keys resize
        it.
      </p>
      <div
        ref={grid}
        className="dashboard-grid"
        data-dragging={dragging || undefined}
        data-resizing={drag?.kind === "resize" || undefined}
        style={{
          gridTemplateColumns: `repeat(${String(GRID.columns)}, minmax(0, 1fr))`,
          gridAutoRows: `${String(GRID.rowHeight)}px`,
          gap: `${String(GRID.gap)}px`,
        }}
      >
        {placeholder && (
          <div
            className="widget-placeholder"
            aria-hidden="true"
            style={{
              gridColumn: `${String(placeholder.x + 1)} / span ${String(placeholder.w)}`,
              gridRow: `${String(placeholder.y + 1)} / span ${String(placeholder.h)}`,
            }}
          />
        )}
        {order.map((id) => {
          const widget = byId.get(id);
          if (!widget) return null;
          const lifted = drag?.id === id && drag.kind === "move";
          // A Widget being dragged follows the pointer from where it was; the placeholder shows where it will land.
          // One being resized is drawn at the size it will be.
          const at = lifted ? layout[id] : shown[id];
          const nudge = nudges.by[id];
          const style = {
            gridColumn: `${String(at.x + 1)} / span ${String(at.w)}`,
            gridRow: `${String(at.y + 1)} / span ${String(at.h)}`,
            ...(lifted && {
              translate: `${String(drag.offset.x)}px ${String(drag.offset.y)}px`,
            }),
            ...(nudge && {
              "--nudge-x": String(nudge.x),
              "--nudge-y": String(nudge.y),
            }),
          } as CSSProperties;
          return (
            <section
              key={id}
              ref={(element) => {
                if (element) cards.current.set(id, element);
                else cards.current.delete(id);
              }}
              className={["dashboard-card", "widget", widget.className]
                .filter(Boolean)
                .join(" ")}
              data-widget={id}
              data-layer={widget.layer}
              data-dragging={lifted || undefined}
              data-resizing={
                (drag?.id === id && drag.kind === "resize") || undefined
              }
              data-sized={at.sized || undefined}
              data-nudged={
                nudge && !dragging
                  ? nudges.round % 2 === 0
                    ? "even"
                    : "odd"
                  : undefined
              }
              aria-labelledby={widget.labelledBy}
              aria-busy={widget.busy || undefined}
              style={style}
              onPointerDown={(event) => {
                begin(event, id);
              }}
              onPointerMove={track}
              onPointerUp={end}
              onLostPointerCapture={end}
              onPointerCancel={cancel}
            >
              <div
                className="widget-content"
                ref={(element) => {
                  if (element) contents.current.set(id, element);
                  else contents.current.delete(id);
                }}
              >
                {widget.content({
                  grip: (
                    <button
                      ref={(element) => {
                        if (element) grips.current.set(id, element);
                        else grips.current.delete(id);
                      }}
                      type="button"
                      className="widget-grip"
                      aria-label={`Move ${widget.title}`}
                      aria-describedby={hintId}
                      title={`Drag to move ${widget.title}`}
                      onKeyDown={(event) => {
                        onGripKey(event, id);
                      }}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <circle cx="5.5" cy="3.5" r="1.25" />
                        <circle cx="10.5" cy="3.5" r="1.25" />
                        <circle cx="5.5" cy="8" r="1.25" />
                        <circle cx="10.5" cy="8" r="1.25" />
                        <circle cx="5.5" cy="12.5" r="1.25" />
                        <circle cx="10.5" cy="12.5" r="1.25" />
                      </svg>
                    </button>
                  ),
                  hide: (
                    <button
                      type="button"
                      className="widget-hide"
                      aria-label={`Hide ${widget.title}`}
                      title={`Hide ${widget.title}`}
                      onClick={() => {
                        hide(id);
                      }}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  ),
                })}
              </div>
              <div
                className="widget-resize"
                aria-hidden="true"
                title={`Drag to resize ${widget.title}; double-click to fit it to its content`}
                onDoubleClick={() => {
                  fit(id);
                }}
              />
            </section>
          );
        })}
      </div>
      {order.length === 0 && (
        <p className="empty-state">
          Every Widget is hidden. Show them again from Settings.
        </p>
      )}
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </>
  );
};
