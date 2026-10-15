import { useCallback, useState } from "react";

import type { ServedLayerId } from "@location-scout/shared";

import {
  LAYOUT_STORAGE_KEY,
  defaultLayout,
  parseLayout,
  serialiseLayout,
  type WidgetLayout,
} from "./widget-layout";

export interface DashboardLayoutState {
  /** The layout kept, or the Scout Mode's order with none kept. */
  layout: WidgetLayout;
  /** Whether the layout is one moved by hand, and so can be reset. */
  moved: boolean;
  setLayout: (layout: WidgetLayout) => void;
  reset: () => void;
}

const readKept = () => {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * The Dashboard's layout, kept in the browser once a Widget is moved, so it
 * opens as it was left. Until then, and after a reset, it follows `order`.
 */
export const useDashboardLayout = (
  order: readonly ServedLayerId[],
): DashboardLayoutState => {
  const start = defaultLayout(order);
  const [kept, setKept] = useState(() => parseLayout(readKept(), start));
  const setLayout = useCallback((layout: WidgetLayout) => {
    setKept(layout);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, serialiseLayout(layout));
    } catch {
      // Storage blocked: the layout lasts as long as the page.
    }
  }, []);
  const reset = useCallback(() => {
    setKept(null);
    try {
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } catch {
      // Nothing was kept.
    }
  }, []);
  return { layout: kept ?? start, moved: kept !== null, setLayout, reset };
};
