import type {
  AmenitiesLayerResponse,
  AmenityCount,
  ScoutMode,
} from "@location-scout/shared";

import { competitorsAmong } from "../competitors";
import { formatCount, formatDistance } from "../format";
import { AMENITY_NAMES, LAYER_STYLES, amenityName } from "./layer-styles";

/** The nearest amenity of one type, and how far it is, or that there is none. */
const nearestText = ({ type, nearest }: AmenityCount) =>
  nearest === null
    ? "None"
    : `${amenityName(type, nearest.name)}, ${formatDistance(nearest.distanceMetres)}`;

/**
 * How many of the Scout Mode's competitors there are (PRD FR-4.3), and the
 * nearest, which the map highlights.
 */
const Competitors = ({
  features,
  scoutMode,
}: Pick<AmenitiesLayerResponse, "features"> & { scoutMode: ScoutMode }) => {
  const { competitors } = scoutMode;
  if (!competitors) return null;
  const found = competitorsAmong(features, scoutMode);
  const [nearest] = found;
  return (
    <p className="competitors">
      <strong>Competitors</strong> in the {scoutMode.name} Scout Mode (
      {competitors.name}):{" "}
      {nearest
        ? `${found.length.toLocaleString("en-GB")} in the Search Area, the nearest ${amenityName(nearest.type, nearest.name)}, ${formatDistance(nearest.distanceMetres)} away. Each is starred on the map.`
        : "none in the Search Area."}
    </p>
  );
};

/**
 * The Amenities Layer's statistics: how many amenities OpenStreetMap maps in
 * the Search Area, the Scout Mode's competitors among them, then the count and
 * the nearest of each type (PRD FR-2.3).
 */
export const AmenityStatistics = ({
  statistics,
  features,
  scoutMode = null,
}: AmenitiesLayerResponse & { scoutMode?: ScoutMode | null }) => {
  if (!statistics) return null;
  const { total, byType } = statistics;
  return (
    <>
      <p>
        {total === 0
          ? "No amenities mapped in the Search Area."
          : `${formatCount(total, LAYER_STYLES.amenities.noun)} mapped in the Search Area.`}
      </p>
      {scoutMode && <Competitors features={features} scoutMode={scoutMode} />}
      <table className="layer-statistics">
        <caption>Amenities in the Search Area, and the nearest of each</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">In the Search Area</th>
            <th scope="col">Nearest</th>
          </tr>
        </thead>
        <tbody>
          {byType.map((count) => (
            <tr key={count.type}>
              <th scope="row">{AMENITY_NAMES[count.type][1]}</th>
              <td>{count.count.toLocaleString("en-GB")}</td>
              <td>{nearestText(count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};
