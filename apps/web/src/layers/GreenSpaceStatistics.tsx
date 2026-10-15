import type {
  GreenSpaceLayerResponse,
  NearestPark,
} from "@location-scout/shared";

import { formatCount, formatDistance } from "../format";
import {
  GREEN_SPACE_NAMES,
  LAYER_STYLES,
  greenSpaceName,
} from "./layer-styles";

/** The nearest park and how far it is, or that there is none within reach. */
const nearestParkText = (park: NearestPark | null, searchMetres: number) => {
  if (park === null) {
    return `none within ${(searchMetres / 1000).toLocaleString("en-GB")} km.`;
  }
  const name = greenSpaceName("park", park.name);
  if (park.coversLocation) return `${name}, which the Location is inside.`;
  return `${name}, ${formatDistance(park.distanceMetres)}${park.inSearchArea ? "" : ", outside the Search Area"}.`;
};

/**
 * The Green space Layer's statistics: how far the nearest park is, then how
 * many green spaces of each type are in the Search Area (PRD FR-2.5).
 */
export const GreenSpaceStatistics = ({
  statistics,
}: GreenSpaceLayerResponse) => {
  if (!statistics) return null;
  const { total, byType, nearestPark, parkSearchMetres } = statistics;
  return (
    <>
      <p>
        <strong>Nearest park:</strong>{" "}
        {nearestParkText(nearestPark, parkSearchMetres)}
      </p>
      <p>
        {total === 0
          ? "No green spaces mapped in the Search Area."
          : `${formatCount(total, LAYER_STYLES["green-space"].noun)} mapped in the Search Area.`}
      </p>
      <table className="layer-statistics">
        <caption>Green space in the Search Area</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">In the Search Area</th>
          </tr>
        </thead>
        <tbody>
          {byType.map(({ type, count }) => (
            <tr key={type}>
              <th scope="row">{GREEN_SPACE_NAMES[type][1]}</th>
              <td>{count.toLocaleString("en-GB")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};
