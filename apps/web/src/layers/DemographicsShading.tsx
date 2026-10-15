import {
  DEMOGRAPHIC_MEASURES,
  isDemographicMeasure,
  type DemographicMeasure,
  type OutputAreaFeature,
} from "@location-scout/shared";

import {
  DEMOGRAPHIC_FILL_OPACITY,
  DEMOGRAPHIC_MEASURE_STYLES,
  DEMOGRAPHIC_SHADES,
  NO_FIGURE_SHADE,
} from "./demographic-measures";

/** A shade as the map draws it, at the same opacity, so the two match. */
const swatch = (shade: string) => ({
  background: shade,
  opacity: DEMOGRAPHIC_FILL_OPACITY,
});

interface DemographicsShadingProps {
  measure: DemographicMeasure;
  /** The output areas shaded, to say whether any has no figure. */
  features: readonly OutputAreaFeature[];
  onChange: (measure: DemographicMeasure) => void;
}

/**
 * Chooses the measure the Demographics Layer shades its output areas by
 * (PRD FR-2.7a), with a legend naming each shade, so no shade is read by
 * colour alone (FR-9.5). Each output area's figures are in its popup, and
 * the Search Area's in the Location Overview, as text.
 */
export const DemographicsShading = ({
  measure,
  features,
  onChange,
}: DemographicsShadingProps) => {
  const { legend, classes, value } = DEMOGRAPHIC_MEASURE_STYLES[measure];
  const unshaded = features.some((feature) => value(feature) === null);
  return (
    <div className="demographics-shading">
      <label htmlFor="demographic-measure">Shade output areas by</label>
      <select
        id="demographic-measure"
        value={measure}
        onChange={(event) => {
          const chosen = event.target.value;
          if (isDemographicMeasure(chosen)) onChange(chosen);
        }}
      >
        {DEMOGRAPHIC_MEASURES.map((id) => (
          <option key={id} value={id}>
            {DEMOGRAPHIC_MEASURE_STYLES[id].name}
          </option>
        ))}
      </select>
      <p className="demographics-legend-title" id="demographics-legend">
        {legend}
      </p>
      <ul className="demographics-legend" aria-labelledby="demographics-legend">
        {classes.map(({ label }, index) => (
          <li key={label}>
            <span
              className="demographics-swatch"
              style={swatch(DEMOGRAPHIC_SHADES[index] ?? NO_FIGURE_SHADE)}
              aria-hidden="true"
            />
            {label}
          </li>
        ))}
        {unshaded && (
          <li>
            <span
              className="demographics-swatch"
              style={swatch(NO_FIGURE_SHADE)}
              aria-hidden="true"
            />
            No figure
          </li>
        )}
      </ul>
    </div>
  );
};
