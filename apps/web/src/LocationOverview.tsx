import type { ScoutMode, ServedLayerId } from "@location-scout/shared";

import { Explain } from "./explain/Explain";
import { Highlights } from "./Highlights";
import { LandCoverageArea } from "./LandCoverageArea";
import { LayerStatisticsList } from "./layers/LayerStatisticsList";
import { LocalGeography } from "./LocalGeography";
import { Scores } from "./Scores";
import type { CoverageState } from "./useCoverage";
import type { SearchResult } from "./useSearchArea";
import type { CustomWeights } from "./weights";

/** Five decimal places is about a metre: plenty for a Location. */
const formatCoordinate = (degrees: number) => degrees.toFixed(5);

interface LocationOverviewProps {
  result: SearchResult | null;
  /** What `pnpm data:prepare` has prepared, with its dates. */
  coverage: CoverageState;
  /** The Scout Mode chosen, or `null` until the modes have loaded. */
  scoutMode: ScoutMode | null;
  /** The user's own weights for the Scout Mode, or `null` for its defaults. */
  weights: CustomWeights | null;
  /** Weighs the Location Score by the user's own weights, or `null` for the defaults. */
  onChangeWeights: (weights: CustomWeights | null) => void;
  /** Shows a Highlight's Layer on the map and points it out. */
  onFocusLayer: (layer: ServedLayerId) => void;
  /** Opens the Land panel, which lists the Land Opportunities. */
  onOpenLandPanel: () => void;
  /** Opens a report of the Search Area, to print or save as a PDF (PRD FR-7.4). */
  onOpenReport: () => void;
}

/** The Overview, as an AI Explanation is asked about it. */
const OVERVIEW = { kind: "overview" } as const;

/**
 * The Location Overview panel: the Search Area's Highlights first (PRD
 * FR-3.7), a button for a printable report of it (FR-7.4), then the
 * Search Area, the council it is in, its scores and each Layer's statistics, and
 * last, while AI Explanations are on, an Explain button for all of them
 * (FR-11.1).
 */
export const LocationOverview = ({
  result,
  coverage,
  scoutMode,
  weights,
  onChangeWeights,
  onFocusLayer,
  onOpenLandPanel,
  onOpenReport,
}: LocationOverviewProps) => {
  return (
    <aside className="location-overview" aria-labelledby="overview-heading">
      <h2 id="overview-heading">Location Overview</h2>
      {result ? (
        <>
          <Highlights state={result.highlights} onFocusLayer={onFocusLayer} />
          <p className="overview-report">
            <button type="button" onClick={onOpenReport}>
              Printable report
            </button>{" "}
            of this Search Area, to print or save as a PDF.
          </p>
          <dl>
            {result.found && (
              <>
                <dt>
                  {result.found.kind === "postcode" ? "Postcode" : "Address"}
                </dt>
                <dd>{result.found.label}</dd>
              </>
            )}
            <dt>Coordinates</dt>
            <dd>
              {formatCoordinate(result.area.location.lat)},{" "}
              {formatCoordinate(result.area.location.lng)}
            </dd>
            <dt>Search Radius</dt>
            <dd>{result.area.searchRadius.miles} mile</dd>
          </dl>
          <LocalGeography
            geography={result.area.geography}
            found={result.found}
          />
          <LandCoverageArea council={result.area.council} coverage={coverage} />
          <Scores
            state={result.scores}
            scoutMode={scoutMode}
            weights={weights}
            onChangeWeights={onChangeWeights}
          />
          <LayerStatisticsList
            layers={result.layers}
            scoutMode={scoutMode}
            onOpenLandPanel={onOpenLandPanel}
          />
          <Explain subject={OVERVIEW} name="the Location Overview" />
        </>
      ) : (
        <p className="empty-state">
          Enter a postcode or an address, or click the map, to see a Location
          and its Search Area.
        </p>
      )}
    </aside>
  );
};
