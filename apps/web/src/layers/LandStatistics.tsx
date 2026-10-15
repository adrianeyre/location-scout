import {
  OWNERSHIP_CATEGORIES,
  OWNERSHIP_CATEGORY_NAMES,
  OWNERSHIP_CATEGORY_NOTE,
  type Council,
  type LandLayerResponse,
} from "@location-scout/shared";

import { formatCount, formatList } from "../format";
import { LandSales } from "./LandSales";
import { OWNERSHIP_CATEGORY_COLOURS, landSalesSummary } from "./layer-styles";

/** What is said where CCOD and OCOD aren't prepared (PRD FR-6.0). */
export const OWNERSHIP_NOT_PREPARED =
  "Not prepared, so land is only Possibly Unregistered or registered. Set LAND_REGISTRY_DATA_API_KEY in .env and run pnpm data:prepare to add them from HM Land Registry's CCOD and OCOD.";

/** How many Land Opportunities are in each Ownership Category, each with its colour on the map. */
export const OwnershipCounts = ({
  counts,
}: {
  counts: NonNullable<
    NonNullable<LandLayerResponse["statistics"]>["ownershipCategories"]
  >;
}) => (
  <ul className="land-ownership" aria-label="By Ownership Category">
    {OWNERSHIP_CATEGORIES.map((category) => (
      <li key={category}>
        <span
          className="land-swatch"
          style={{ borderColor: OWNERSHIP_CATEGORY_COLOURS[category] }}
          aria-hidden="true"
        />
        {OWNERSHIP_CATEGORY_NAMES[category]}:{" "}
        {counts[category].toLocaleString("en-GB")}
      </li>
    ))}
  </ul>
);

const councilNames = (councils: readonly Council[]) =>
  formatList(councils.map(({ name }) => name));

interface LandStatisticsProps extends LandLayerResponse {
  /** Opens the Land panel, which lists them, or `null` where there is none, as in a report. */
  onOpenLandPanel: (() => void) | null;
}

/**
 * The Land Layer's statistics (PRD FR-2.7): how many Land Opportunities meet
 * the Land panel's filters, their area, how many are Possibly Unregistered,
 * how many are in each indicative Ownership Category (FR-5.4a), the homes
 * they might hold, and the land sales within 1 mile of them, which may not
 * be land (FR-5.4b). The Layer's note gives FR-5.7's wording.
 */
export const LandStatistics = ({
  statistics,
  scope,
  landCoverageAreas,
  notCovered,
  onOpenLandPanel,
}: LandStatisticsProps) => {
  if (!statistics) return null;
  return (
    <>
      <dl>
        <dt>Land Opportunities</dt>
        <dd>
          {statistics.count.toLocaleString("en-GB")}{" "}
          {scope === "search-area"
            ? "in the Search Area"
            : `across ${councilNames(landCoverageAreas)}`}
          , of{" "}
          {formatCount(statistics.parcels, ["Land Parcel", "Land Parcels"])}
        </dd>
        <dt>Total area</dt>
        <dd>{statistics.totalHectares.toLocaleString("en-GB")} ha</dd>
        <dt>Possibly Unregistered</dt>
        <dd>{statistics.possiblyUnregistered.toLocaleString("en-GB")}</dd>
        <dt>Ownership Categories, indicative</dt>
        <dd>
          {statistics.ownershipCategories ? (
            <OwnershipCounts counts={statistics.ownershipCategories} />
          ) : (
            OWNERSHIP_NOT_PREPARED
          )}
        </dd>
        <dt>Estimated capacity</dt>
        <dd>
          About {formatCount(statistics.estimatedHomes, ["home", "homes"])}
        </dd>
        <dt>Nearby land sales, indicative</dt>
        <dd>{landSalesSummary(statistics.nearbyLandSales)}</dd>
      </dl>
      {/* Listed below, at the Overview's full width. */}
      <LandSales
        sales={statistics.nearbyLandSales}
        fromNearest
        withSummary={false}
      />
      {statistics.ownershipCategories && (
        <p className="layer-note">{OWNERSHIP_CATEGORY_NOTE}</p>
      )}
      {scope === "search-area" && notCovered.length > 0 && (
        <p className="layer-note">
          Land data isn&apos;t prepared for {councilNames(notCovered)}, which
          the Search Area reaches into.
        </p>
      )}
      {onOpenLandPanel && (
        <p>
          <button type="button" onClick={onOpenLandPanel}>
            Filter and list them in the Land panel
          </button>
        </p>
      )}
    </>
  );
};
