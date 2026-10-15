import type { ScoutMode } from "@location-scout/shared";

/**
 * Marks a Layer the Scout Mode highlights (PRD FR-4.3a): "★ Investment", read
 * out as "Highlighted by the Investment Scout Mode".
 */
export const HighlightedBy = ({ scoutMode }: { scoutMode: ScoutMode }) => (
  <span
    className="highlighted-by"
    title={`Highlighted by the ${scoutMode.name} Scout Mode`}
  >
    <span aria-hidden="true">★ {scoutMode.name}</span>
    <span className="visually-hidden">
      Highlighted by the {scoutMode.name} Scout Mode
    </span>
  </span>
);
