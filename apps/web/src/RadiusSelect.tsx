import {
  SEARCH_RADII_MILES,
  isSearchRadiusMiles,
  type SearchRadiusMiles,
} from "@location-scout/shared";

interface RadiusSelectProps {
  radius: SearchRadiusMiles;
  onChange: (radius: SearchRadiusMiles) => void;
}

/** Chooses the Search Radius (PRD FR-1.4). */
export const RadiusSelect = ({ radius, onChange }: RadiusSelectProps) => (
  <div className="radius-select">
    <label htmlFor="search-radius">Search Radius</label>
    <select
      id="search-radius"
      value={radius}
      onChange={(event) => {
        const miles = Number(event.target.value);
        if (isSearchRadiusMiles(miles)) onChange(miles);
      }}
    >
      {SEARCH_RADII_MILES.map((miles) => (
        <option key={miles} value={miles}>
          {miles} mile
        </option>
      ))}
    </select>
  </div>
);
