import { WIDGET_IDS, setWidgetHidden } from "../dashboard/widget-layout";
import { WIDGET_TITLES } from "../dashboard/widget-titles";
import type { DashboardLayoutState } from "../dashboard/useDashboardLayout";

/**
 * Settings' list of the Dashboard's Widgets, each saying whether it is
 * shown or hidden. Ticked, a hidden one is shown again where it was;
 * unticked, a shown one is hidden.
 */
export const DashboardWidgetSettings = ({
  widgetLayout: { layout, setLayout },
}: {
  widgetLayout: DashboardLayoutState;
}) => {
  const hidden = WIDGET_IDS.filter((id) => layout[id].hidden).length;
  return (
    <fieldset className="widget-settings">
      <legend>Dashboard Widgets</legend>
      <p className="settings-hint">
        {hidden === 0
          ? "Every Widget is shown. Hide one with the × in its header."
          : `${String(hidden)} of ${String(WIDGET_IDS.length)} hidden. Tick one to show it again.`}
      </p>
      <ul>
        {WIDGET_IDS.map((id) => {
          const shown = !layout[id].hidden;
          return (
            <li key={id} data-hidden={!shown || undefined}>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={() => {
                    setLayout(setWidgetHidden(layout, id, shown));
                  }}
                />
                {WIDGET_TITLES[id]}
              </label>
              <span className="widget-status">
                {shown ? "Shown" : "Hidden"}
              </span>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
};
