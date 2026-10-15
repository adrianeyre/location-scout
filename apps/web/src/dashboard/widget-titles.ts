import { SERVED_LAYER_IDS } from "@location-scout/shared";

import { LAYER_STYLES } from "../layers/layer-styles";
import type { WidgetId } from "./widget-layout";

/** What each Widget is called: by its grip, its hide button, Settings and its announcements. */
export const WIDGET_TITLES = {
  score: "Location Score",
  categories: "Category Scores",
  highlights: "What you need to know",
  ...Object.fromEntries(
    SERVED_LAYER_IDS.map((layer) => [layer, LAYER_STYLES[layer].name]),
  ),
} as Readonly<Record<WidgetId, string>>;
