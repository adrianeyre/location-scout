import { useEffect, useRef, useState, type ReactNode } from "react";

import { announceMapCover } from "../map/map-cover";

/** How much of a phone's screen the panel takes, as a bottom sheet. */
export type SheetSize = "peek" | "half" | "full";

const SIZES: readonly SheetSize[] = ["peek", "half", "full"];

const SIZE_NAMES: Record<SheetSize, string> = {
  peek: "lowered",
  half: "half raised",
  full: "fully raised",
};

/** The peek's height, as `--sheet-peek` in App.css gives it: 9rem. */
const PEEK_PX = 144;

/** A drag shorter than this is a tap, which steps the sheet up a size. */
const TAP_PX = 6;

interface PanelSheetProps {
  /** The panel's tabs and whatever sits beside them. */
  head: ReactNode;
  /** The tab panels. */
  children: ReactNode;
  /**
   * Changes when there is something new to show, such as a Search Area
   * found: a hidden panel opens again, and a lowered sheet rises to half.
   */
  revealKey: unknown;
}

/**
 * The side panel, floating over the map (PRD FR-9.1). On a wide screen it
 * is a card at the map's right that can be hidden, leaving the whole map,
 * and shown again. On a phone it is a bottom sheet over the map, lowered,
 * half or fully raised: dragged by its handle, or stepped up a size by
 * tapping or pressing it, so it never needs dragging (WCAG 2.5.7). A
 * screen too short or zoomed too far for a sheet stacks the panel under
 * the map instead (App.css), and nothing here applies.
 */
export const PanelSheet = ({ head, children, revealKey }: PanelSheetProps) => {
  const [open, setOpen] = useState(true);
  const [size, setSize] = useState<SheetSize>("half");
  const [revealed, setRevealed] = useState(revealKey);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  // Whether the last press dragged, so the click that ends it doesn't step too.
  const dragged = useRef(false);

  // Something new to show: bring the panel back into view.
  if (revealed !== revealKey) {
    setRevealed(revealKey);
    setOpen(true);
    if (size === "peek") setSize("half");
  }

  // Shown or hidden, the map keeps the Search Area in what is left of it.
  useEffect(() => {
    announceMapCover();
  }, [open]);

  const stepUp = () => {
    setSize(SIZES[(SIZES.indexOf(size) + 1) % SIZES.length] ?? "half");
  };

  /** The sheet's height at each size, in pixels, inside the space it rises in. */
  const snapHeights = (): Record<SheetSize, number> => {
    const room = panel.current?.parentElement?.clientHeight ?? 0;
    return { peek: PEEK_PX, half: room / 2, full: room };
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          className="panel-show"
          aria-controls="side-panel"
          aria-expanded="false"
          onClick={() => {
            setOpen(true);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Show panel
        </button>
      )}
      <div
        ref={panel}
        id="side-panel"
        className="side-panel"
        data-covers-map
        hidden={!open}
        data-size={size}
        data-dragging={dragHeight !== null || undefined}
        onTransitionEnd={(event) => {
          // A sheet that has settled at its size.
          if (event.target === event.currentTarget) announceMapCover();
        }}
        style={
          dragHeight === null
            ? undefined
            : { height: `${String(Math.round(dragHeight))}px` }
        }
      >
        <button
          type="button"
          className="panel-handle"
          aria-label={`Panel ${SIZE_NAMES[size]}. ${size === "full" ? "Lower" : "Raise"} it`}
          onPointerDown={(event) => {
            if (!panel.current) return;
            const handle = event.currentTarget;
            // Followed even when the finger strays off the handle (missing in jsdom).
            if (typeof handle.setPointerCapture === "function") {
              handle.setPointerCapture(event.pointerId);
            }
            dragged.current = false;
            drag.current = {
              startY: event.clientY,
              startHeight: panel.current.getBoundingClientRect().height,
            };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const moved = drag.current.startY - event.clientY;
            if (Math.abs(moved) < TAP_PX && !dragged.current) return;
            dragged.current = true;
            const { full } = snapHeights();
            setDragHeight(
              Math.min(
                full,
                Math.max(PEEK_PX, drag.current.startHeight + moved),
              ),
            );
          }}
          onPointerUp={() => {
            drag.current = null;
            if (dragHeight === null) return;
            // Settles at the nearest size.
            const heights = snapHeights();
            const nearest = SIZES.reduce((best, each) =>
              Math.abs(heights[each] - dragHeight) <
              Math.abs(heights[best] - dragHeight)
                ? each
                : best,
            );
            setDragHeight(null);
            setSize(nearest);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragHeight(null);
          }}
          onClick={() => {
            // A drag ends in a click too; only a tap, or Enter or Space, steps.
            if (dragged.current) dragged.current = false;
            else stepUp();
          }}
        >
          <span aria-hidden="true" />
        </button>
        <div className="side-panel-head">
          {head}
          <button
            type="button"
            className="panel-hide"
            aria-controls="side-panel"
            aria-expanded="true"
            aria-label="Hide panel"
            title="Hide panel"
            onClick={() => {
              setOpen(false);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </>
  );
};
