import type { TransportLayerResponse } from "@location-scout/shared";

import { formatDistance, formatKilometres } from "../format";
import { TRANSPORT_STYLES, transportName } from "./layer-styles";

/**
 * The Transport Layer's statistics: how far the nearest railway station is,
 * then how many of each facility are in the Search Area, and how many km of
 * footpath and cycle route (PRD FR-2.4).
 */
export const TransportStatistics = ({ statistics }: TransportLayerResponse) => {
  if (!statistics) return null;
  const { facilities, routes, nearestStation, stationSearchMetres } =
    statistics;
  return (
    <>
      <p>
        <strong>Nearest railway station:</strong>{" "}
        {nearestStation === null
          ? `none within ${(stationSearchMetres / 1000).toLocaleString("en-GB")} km.`
          : `${transportName("railway-station", nearestStation.name)}, ${formatDistance(nearestStation.distanceMetres)}${nearestStation.inSearchArea ? "" : ", outside the Search Area"}.`}
      </p>
      <table className="layer-statistics">
        <caption>Transport in the Search Area</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">In the Search Area</th>
          </tr>
        </thead>
        <tbody>
          {facilities.map(({ type, count }) => (
            <tr key={type}>
              <th scope="row">{TRANSPORT_STYLES[type].name[1]}</th>
              <td>{count.toLocaleString("en-GB")}</td>
            </tr>
          ))}
          {routes.map(({ type, lengthMetres }) => (
            <tr key={type}>
              <th scope="row">{TRANSPORT_STYLES[type].name[1]}</th>
              <td>{formatKilometres(lengthMetres)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};
