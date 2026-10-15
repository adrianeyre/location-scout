import type { ScoutModeId } from "@location-scout/shared";

import type { ScoutModesState } from "./useScoutModes";

interface ScoutModeSelectProps {
  modes: ScoutModesState;
  mode: ScoutModeId;
  onChange: (mode: ScoutModeId) => void;
}

/**
 * Chooses the Scout Mode (PRD FR-4.1), from the modes the backend lists. Until
 * they arrive, or if they can't, it can't be changed. The question the mode
 * answers describes it; the scores show it too. A long name is cut short to
 * keep the header in one row, so the chosen mode's whole name is its title.
 */
export const ScoutModeSelect = ({
  modes,
  mode,
  onChange,
}: ScoutModeSelectProps) => {
  const chosen =
    modes.status === "ok" ? modes.modes.find(({ id }) => id === mode) : null;
  return (
    <div className="scout-mode-select">
      <label htmlFor="scout-mode">Scout Mode</label>
      <select
        id="scout-mode"
        value={mode}
        disabled={modes.status !== "ok"}
        aria-describedby={chosen ? "scout-mode-question" : undefined}
        title={chosen?.name}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {modes.status === "ok" ? (
          modes.modes.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))
        ) : (
          <option value={mode}>
            {modes.status === "loading" ? "Loading…" : "Unavailable"}
          </option>
        )}
      </select>
      {chosen && (
        <span id="scout-mode-question" className="visually-hidden">
          {chosen.question}
        </span>
      )}
    </div>
  );
};
