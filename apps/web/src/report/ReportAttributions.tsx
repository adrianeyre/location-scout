import type { ReactNode } from "react";

import {
  COUNCIL_BOUNDARIES_DATASET,
  SERVED_LAYER_IDS,
  type LayerResponse,
  type SourceReport,
} from "@location-scout/shared";

import {
  EPC_CREDIT,
  FOOTER_CREDIT,
  POLICE_CREDIT,
  POSTCODES_CREDIT,
  councilBoundariesCredit,
  landDatasets,
  liveHistoricEnglandCredit,
  openStreetMapCredit,
  planningApplicationsCredit,
  planningConstraintsCredit,
  preparedHistoricEnglandCredit,
} from "../attribution";
import { CreditLine } from "../CreditText";
import { formatDate } from "../format";
import { Attributions } from "../LandCoverageArea";
import { DemographicsAttribution } from "../layers/DemographicsStatistics";
import { LAYER_STYLES } from "../layers/layer-styles";
import { PricePaidAttribution } from "../layers/PropertyStatistics";
import { SchoolsAttribution } from "../layers/SchoolStatistics";
import type { CoverageState } from "../useCoverage";
import type { LayerState, SearchResult } from "../useSearchArea";

const answered = (sources: readonly SourceReport[], id: string) =>
  sources.find((source) => source.id === id && source.status === "ok") ?? null;

/** "as at 8 October 2026", from a source's period, if it gives one. */
const asAt = (source: SourceReport | null) =>
  source?.period ? `as at ${formatDate(source.period.to)}` : "";

/** What a Layer that isn't in the report says instead of its credits. */
const NOT_SHOWN: Readonly<Record<Exclude<LayerState["status"], "ok">, string>> =
  {
    loading: "Still loading, so nothing of it is in this report yet.",
    unavailable: "Unavailable, so nothing of it is in this report.",
    "not-prepared": "Not prepared, so nothing of it is in this report.",
  };

/** The credits one Layer's Data Sources need, for those that answered. */
const LayerCredits = ({
  layer,
  coverage,
}: {
  layer: LayerResponse;
  coverage: CoverageState;
}): ReactNode => {
  const { sources } = layer;
  switch (layer.layer) {
    case "crime":
      return <CreditLine credit={POLICE_CREDIT} />;
    case "planning": {
      const applications =
        layer.applications?.status === "ok" ? layer.applications : null;
      const historicEngland = liveHistoricEnglandCredit(sources);
      return (
        <>
          {layer.status === "ok" && (
            <CreditLine credit={planningConstraintsCredit()} />
          )}
          {layer.status === "ok" && historicEngland && (
            <CreditLine credit={historicEngland} />
          )}
          {applications && (
            <CreditLine
              credit={planningApplicationsCredit(
                applications.provider,
                applications.period.to,
              )}
            />
          )}
        </>
      );
    }
    case "amenities":
    case "transport":
    case "green-space":
      return (
        <CreditLine
          credit={openStreetMapCredit(
            `from the Overpass API ${asAt(answered(sources, "overpass"))}`.trim(),
          )}
        />
      );
    case "schools":
      return <SchoolsAttribution sources={sources} />;
    case "property": {
      const pricePaid = answered(sources, "land-registry");
      return (
        <>
          <CreditLine credit={POSTCODES_CREDIT} />
          {pricePaid?.period && (
            <PricePaidAttribution year={pricePaid.period.to.slice(0, 4)} />
          )}
          {layer.epc?.status === "ok" && <CreditLine credit={EPC_CREDIT} />}
        </>
      );
    }
    case "land": {
      const { areas, titles } = landDatasets(layer, coverage);
      const historicEngland = preparedHistoricEnglandCredit(areas);
      const landSales = answered(sources, "land-registry");
      return (
        <>
          <CreditLine
            credit={openStreetMapCredit(
              "from Geofabrik's extracts, which Land Parcels are built from",
            )}
          />
          <CreditLine credit={planningConstraintsCredit("'s bulk files")} />
          {historicEngland && <CreditLine credit={historicEngland} />}
          <Attributions datasets={areas} />
          <Attributions datasets={titles} />
          {landSales?.period && (
            <PricePaidAttribution year={landSales.period.to.slice(0, 4)} />
          )}
        </>
      );
    }
    case "demographics":
      return <DemographicsAttribution sources={sources} />;
  }
};

interface ReportAttributionsProps {
  result: SearchResult;
  coverage: CoverageState;
}

/**
 * The report's credits (PRD FR-7.4, FR-10.1): the footer's credit, the
 * base map's, the Location's, and every Layer's, for each of its Data Sources that
 * answered, as their licences require, links spelt out in print.
 */
export const ReportAttributions = ({
  result,
  coverage,
}: ReportAttributionsProps) => {
  const boundaries =
    result.area.council.status === "ok" && coverage.status === "ok"
      ? coverage.coverage.datasets.find(
          ({ id }) => id === COUNCIL_BOUNDARIES_DATASET,
        )
      : undefined;
  return (
    <section
      className="report-section report-attributions"
      aria-labelledby="report-attributions-heading"
    >
      <h2 id="report-attributions-heading">Attributions</h2>
      <CreditLine credit={FOOTER_CREDIT} />
      <dl>
        <dt>Map</dt>
        <dd>
          <CreditLine credit={openStreetMapCredit()} />
        </dd>
        <dt>Location</dt>
        <dd>
          <CreditLine credit={POSTCODES_CREDIT} />
          {boundaries && (
            <CreditLine
              credit={councilBoundariesCredit(
                boundaries.sourceDate.slice(0, 4),
              )}
            />
          )}
        </dd>
        {SERVED_LAYER_IDS.map((id) => {
          const layer = result.layers[id];
          return (
            <div key={id}>
              <dt>{LAYER_STYLES[id].name}</dt>
              <dd>
                {layer.status === "loading" ? (
                  <p>{NOT_SHOWN.loading}</p>
                ) : layer.status === "ok" ||
                  (layer.layer === "planning" &&
                    layer.applications?.status === "ok") ? (
                  <LayerCredits layer={layer} coverage={coverage} />
                ) : (
                  <p>{NOT_SHOWN[layer.status]}</p>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
};
