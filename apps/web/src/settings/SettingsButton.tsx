import { useState } from "react";

import { useAppearance } from "../theme/appearance";
import { Dialog } from "../ui/Dialog";
import type { DashboardLayoutState } from "../dashboard/useDashboardLayout";
import { AppearanceSettings } from "./AppearanceSettings";
import { DashboardWidgetSettings } from "./DashboardWidgetSettings";

/**
 * The cog at the top right of the header, which opens Settings: light, dark
 * or system mode, the colour theme, and which of the Dashboard's Widgets
 * are shown.
 */
export const SettingsButton = ({
  widgetLayout,
}: {
  widgetLayout?: DashboardLayoutState;
}) => {
  const [open, setOpen] = useState(false);
  const { appearance, resolved, change } = useAppearance();
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className="icon-button settings-button"
        aria-label="Settings"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <Dialog
        open={open}
        onClose={close}
        title="Settings"
        closeLabel="Close settings"
        footer={
          <button type="button" className="primary-button" onClick={close}>
            Done
          </button>
        }
      >
        <AppearanceSettings
          appearance={appearance}
          resolved={resolved}
          onChange={change}
        />
        {widgetLayout && (
          <DashboardWidgetSettings widgetLayout={widgetLayout} />
        )}
      </Dialog>
    </>
  );
};
