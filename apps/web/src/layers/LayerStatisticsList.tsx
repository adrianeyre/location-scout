import type { ScoutMode } from "@location-scout/shared";

import type { LayerStates } from "../useSearchArea";
import { AmenityStatistics } from "./AmenityStatistics";
import { CrimeStatistics } from "./CrimeStatistics";
import { DemographicsStatistics } from "./DemographicsStatistics";
import { GreenSpaceStatistics } from "./GreenSpaceStatistics";
import { LandStatistics } from "./LandStatistics";
import { isLandOutsideCoverage } from "./layer-status";
import { LayerOverview } from "./LayerOverview";
import { PlanningApplicationStatistics } from "./PlanningApplicationStatistics";
import { PlanningStatistics } from "./PlanningStatistics";
import { PropertyStatistics } from "./PropertyStatistics";
import { SchoolStatistics } from "./SchoolStatistics";
import { TransportStatistics } from "./TransportStatistics";

interface LayerStatisticsListProps {
  layers: LayerStates;
  /** The Scout Mode chosen, which may highlight a Layer (PRD FR-4.3a). */
  scoutMode: ScoutMode | null;
  /** Opens the Land panel, or `null` where there is none, as in a report. */
  onOpenLandPanel: (() => void) | null;
}

/**
 * Each Layer's statistics, in turn, or why there are none (PRD FR-3.1,
 * FR-3.4), as the Location Overview and a report give them.
 */
export const LayerStatisticsList = ({
  layers,
  scoutMode,
  onOpenLandPanel,
}: LayerStatisticsListProps) => {
  return (
    <>
      <LayerOverview layer="crime" state={layers.crime} scoutMode={scoutMode}>
        {(crime) => crime.layer === "crime" && <CrimeStatistics {...crime} />}
      </LayerOverview>
      <LayerOverview
        layer="planning"
        state={layers.planning}
        scoutMode={scoutMode}
        alongside={(planning) =>
          planning.layer === "planning" &&
          planning.applications && (
            <PlanningApplicationStatistics
              applications={planning.applications}
            />
          )
        }
      >
        {(planning) =>
          planning.layer === "planning" && <PlanningStatistics {...planning} />
        }
      </LayerOverview>
      <LayerOverview
        layer="amenities"
        state={layers.amenities}
        scoutMode={scoutMode}
      >
        {(amenities) =>
          amenities.layer === "amenities" && (
            <AmenityStatistics {...amenities} scoutMode={scoutMode} />
          )
        }
      </LayerOverview>
      <LayerOverview
        layer="schools"
        state={layers.schools}
        scoutMode={scoutMode}
      >
        {(schools) =>
          schools.layer === "schools" && <SchoolStatistics {...schools} />
        }
      </LayerOverview>
      <LayerOverview
        layer="transport"
        state={layers.transport}
        scoutMode={scoutMode}
      >
        {(transport) =>
          transport.layer === "transport" && (
            <TransportStatistics {...transport} />
          )
        }
      </LayerOverview>
      <LayerOverview
        layer="green-space"
        state={layers["green-space"]}
        scoutMode={scoutMode}
      >
        {(greenSpace) =>
          greenSpace.layer === "green-space" && (
            <GreenSpaceStatistics {...greenSpace} />
          )
        }
      </LayerOverview>
      <LayerOverview
        layer="property"
        state={layers.property}
        scoutMode={scoutMode}
      >
        {(property) =>
          property.layer === "property" && <PropertyStatistics {...property} />
        }
      </LayerOverview>
      <LayerOverview
        layer="land"
        state={layers.land}
        scoutMode={scoutMode}
        notPrepared={(land) =>
          land.layer === "land" && isLandOutsideCoverage(land) ? (
            <p>
              <strong>Land data not prepared for this area.</strong> Add{" "}
              {land.notCovered.map(({ name }) => name).join(" and ")} with{" "}
              <code>pnpm data:prepare --area "{land.notCovered[0]?.name}"</code>
              .
            </p>
          ) : null
        }
      >
        {(land) =>
          land.layer === "land" && (
            <LandStatistics {...land} onOpenLandPanel={onOpenLandPanel} />
          )
        }
      </LayerOverview>
      <LayerOverview
        layer="demographics"
        state={layers.demographics}
        scoutMode={scoutMode}
      >
        {(demographics) =>
          demographics.layer === "demographics" && (
            <DemographicsStatistics {...demographics} />
          )
        }
      </LayerOverview>
    </>
  );
};
