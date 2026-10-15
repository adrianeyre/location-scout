import { useEffect, useState } from "react";

import {
  CATEGORY_NAMES,
  HM_LAND_REGISTRY_SEARCHES,
  INSPIRE_FREEHOLD_NOTE,
  LAND_OPPORTUNITY_WORDING,
  SERVED_LAYER_IDS,
  type HighlightsResponse,
  type LandLayerResponse,
  type ScoresResponse,
  type ScoutMode,
} from "@location-scout/shared";

import { formatCount, formatDistance, formatList } from "../format";
import { HighlightsLeftOut } from "../Highlights";
import { HIGHLIGHT_LEVEL_LABELS } from "../highlight-levels";
import { LevelIcon } from "../Highlights";
import { LandCoverageArea } from "../LandCoverageArea";
import { LayerIcon } from "../layers/LayerIcon";
import { LayerStatisticsList } from "../layers/LayerStatisticsList";
import { LAYER_STYLES, formatLandArea, landTags } from "../layers/layer-styles";
import { LocalGeography } from "../LocalGeography";
import type { MapLayer } from "../map/SearchAreaMap";
import { describeSearchArea } from "../saved/saved-locations";
import {
  Beta,
  CategoryBreakdown,
  LeftOut,
  LocationScoreLeftOut,
  LocationScoreWeighing,
  Score,
} from "../Scores";
import { weighed } from "../scores-shown";
import type { CoverageState } from "../useCoverage";
import type { SearchResult } from "../useSearchArea";
import type { CustomWeights } from "../weights";
import { ReportAttributions } from "./ReportAttributions";
import { ReportMap } from "./ReportMap";

/** Five decimal places is about a metre: plenty for a Location. */
const formatCoordinate = (degrees: number) => degrees.toFixed(5);

/** Today, as a report is dated: "9 October 2026". */
const today = () =>
  new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** The Highlights, each with its level in words and its Layer (PRD FR-3.7). */
const ReportHighlights = ({ highlights, leftOut }: HighlightsResponse) => (
  <>
    {highlights.length > 0 ? (
      <ul className="highlights-list" aria-label="Highlights">
        {highlights.map(({ rule, level, text, layer }) => {
          const { name } = HIGHLIGHT_LEVEL_LABELS[level];
          return (
            <li key={rule} className="highlight" data-level={level}>
              <LevelIcon level={level} />
              <span className="highlight-body">
                <span className="highlight-level">{name}:</span>{" "}
                <span className="highlight-text">{text}</span>{" "}
                <span className="highlight-layer">
                  <LayerIcon layer={layer} />
                  {LAYER_STYLES[layer].name}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    ) : (
      <p>Nothing stands out in this Search Area.</p>
    )}
    <HighlightsLeftOut leftOut={leftOut} />
    <p className="layer-note">
      Highlights come from fixed rules over the figures in this report, never
      from AI.
    </p>
  </>
);

/**
 * The Location Score and every Category Score, each with its breakdown in
 * full (PRD FR-3.3), as a printed page can't expand them.
 */
const ReportScores = ({
  scores,
  scoutMode,
  weights,
}: {
  scores: ScoresResponse;
  scoutMode: ScoutMode | null;
  weights: CustomWeights | null;
}) => {
  const shown = weighed(scores, scoutMode, weights);
  return (
    <>
      {shown.location.score === null ? (
        <p className="score-left-out">
          <span className="score-name">Location Score</span>{" "}
          <strong>Unavailable</strong>: no Category Score is available.
        </p>
      ) : (
        <div className="report-score">
          <h3>
            <span className="score-name">Location Score</span>{" "}
            <Score score={shown.location.score} />
          </h3>
          <LocationScoreWeighing {...shown} />
        </div>
      )}
      <LocationScoreLeftOut location={shown.location} />
      {scores.categories.map((category) =>
        category.score === null ? (
          <LeftOut key={category.id} category={category} />
        ) : (
          <div key={category.id} className="report-score">
            <h3>
              <span className="score-name">{CATEGORY_NAMES[category.id]}</span>{" "}
              <Score score={category.score} />
            </h3>
            <CategoryBreakdown category={category} />
          </div>
        ),
      )}
      <p className="layer-note">
        Scores are beta. They use fixed thresholds, still to be tuned against
        real Locations, as there are no regional averages to compare with yet.
      </p>
    </>
  );
};

/**
 * Each Land Opportunity the Land Layer found, with its tags (PRD FR-5.4),
 * under FR-5.7's wording and FR-5.8's note, and where to check who owns it
 * (FR-5.6).
 */
const ReportLand = ({ land }: { land: LandLayerResponse }) => {
  const { features, scope, landCoverageAreas, statistics } = land;
  const where =
    scope === "search-area"
      ? "in the Search Area"
      : `across ${formatList(landCoverageAreas.map(({ name }) => name))}`;
  return (
    <section
      className="report-section report-land"
      aria-labelledby="report-land-heading"
    >
      <h2 id="report-land-heading">Land Opportunities</h2>
      <p className="land-wording">
        <strong>{LAND_OPPORTUNITY_WORDING}</strong>
      </p>
      <p className="layer-note">{INSPIRE_FREEHOLD_NOTE}</p>
      <p>
        {formatCount(features.length, [
          "Land Opportunity",
          "Land Opportunities",
        ])}{" "}
        {where}
        {statistics && statistics.listed < statistics.count
          ? `, the first ${statistics.listed.toLocaleString("en-GB")} of ${statistics.count.toLocaleString("en-GB")}`
          : ""}
        , in the Land panel&apos;s order, with the filters chosen there.
      </p>
      <ol className="report-land-list" aria-label="Land Opportunities">
        {features.map((opportunity) => (
          <li key={opportunity.id}>
            <h3>
              {opportunity.name ?? "Land Opportunity"}:{" "}
              {formatLandArea(opportunity)},{" "}
              {formatDistance(opportunity.distanceMetres)} from the Location
            </h3>
            <ul aria-label="Its tags">
              {landTags(opportunity).map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p>
        Check who owns land with HM Land Registry:{" "}
        {HM_LAND_REGISTRY_SEARCHES.map(({ name, url }, index) => (
          <span key={url}>
            {index > 0 && " or "}
            <a href={url}>{name}</a>
          </span>
        ))}
        .
      </p>
    </section>
  );
};

/** The Layers the report gives that are still loading. */
const layersLoading = (result: SearchResult) =>
  SERVED_LAYER_IDS.filter((id) => result.layers[id].status === "loading");

/** What is still loading, by name, to say before printing. */
const stillLoading = (result: SearchResult) => [
  ...layersLoading(result).map((id) => `the ${LAYER_STYLES[id].name} Layer`),
  ...(result.scores.status === "loading" ? ["the scores"] : []),
  ...(result.highlights.status === "loading" ? ["the Highlights"] : []),
];

interface ReportProps {
  /** The Search Area shown, or `null` before one has loaded. */
  result: SearchResult | null;
  /** Whether a Search Area is loading, as one is when the report's URL is opened. */
  busy: boolean;
  /** What `pnpm data:prepare` has prepared, with its dates and statements. */
  coverage: CoverageState;
  /** The Scout Mode chosen, or `null` until the modes have loaded. */
  scoutMode: ScoutMode | null;
  /** The user's own weights for the Scout Mode, or `null` for its defaults. */
  weights: CustomWeights | null;
  /** The Layers the map shows, which the report's map image draws. */
  mapLayers: readonly MapLayer[];
  /** Goes back to the map. */
  onClose: () => void;
}

/**
 * A report of the Search Area shown, made to be printed on A4 or saved as a
 * PDF through the browser's print dialog (PRD FR-7.4): a static map image,
 * the Highlights, the Location Overview, the scores with their breakdowns,
 * any Land Opportunities with FR-5.7's wording, and every Layer's
 * attribution (FR-10.1). It is made from what has already loaded, in the
 * Scout Mode and weights chosen, so it asks the backend for nothing more.
 */
export const Report = ({
  result,
  busy,
  coverage,
  scoutMode,
  weights,
  mapLayers,
  onClose,
}: ReportProps) => {
  const [producedOn] = useState(today);
  const name = result
    ? describeSearchArea({
        location: result.area.location,
        radius: result.area.searchRadius.miles,
        found: result.found,
      })
    : null;
  const title = name
    ? `Location Scout report: ${name}`
    : "Location Scout report";

  // The title a saved PDF is named after.
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);

  const waiting = result ? stillLoading(result) : [];
  const settled = result ? layersLoading(result).length === 0 : false;
  const land = result?.layers.land;

  return (
    <div className="report">
      <header className="report-toolbar">
        <button type="button" onClick={onClose}>
          Back to the map
        </button>
        <button
          type="button"
          disabled={!result}
          onClick={() => {
            window.print();
          }}
        >
          Print or save as PDF
        </button>
        <p className="report-status" role="status">
          {!result
            ? ""
            : waiting.length > 0
              ? `Still loading ${formatList(waiting)}. Anything not loaded when you print is left out.`
              : "Everything has loaded. To keep a PDF, choose Save as PDF as the printer."}
        </p>
      </header>
      <main>
        <article className="report-page" aria-labelledby="report-heading">
          <h1 id="report-heading">{title}</h1>
          {result && name ? (
            <>
              <dl className="report-facts">
                {result.found && (
                  <>
                    <dt>
                      {result.found.kind === "postcode"
                        ? "Postcode"
                        : "Address"}
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
                <dt>Scout Mode</dt>
                <dd>
                  {scoutMode
                    ? `${scoutMode.name}: ${scoutMode.question} ${weights ? "Weighed with your own weights." : "Weighed with its default weights."}`
                    : "Loading…"}
                </dd>
                <dt>Produced</dt>
                <dd>{producedOn}, by Location Scout</dd>
              </dl>
              <ReportMap
                area={result.area}
                layers={settled ? mapLayers : null}
                name={name}
              />
              <section
                className="report-section"
                aria-labelledby="report-highlights-heading"
              >
                <h2 id="report-highlights-heading">What you need to know</h2>
                {result.highlights.status === "ok" ? (
                  <ReportHighlights {...result.highlights.highlights} />
                ) : result.highlights.status === "loading" ? (
                  <p>Loading…</p>
                ) : (
                  <p>
                    <strong>Unavailable.</strong> The Highlights couldn&apos;t
                    be loaded.
                  </p>
                )}
              </section>
              <section
                className="report-section"
                aria-labelledby="report-overview-heading"
              >
                <h2 id="report-overview-heading">Location Overview</h2>
                <LocalGeography
                  geography={result.area.geography}
                  found={result.found}
                />
                <LandCoverageArea
                  council={result.area.council}
                  coverage={coverage}
                />
                <LayerStatisticsList
                  layers={result.layers}
                  scoutMode={scoutMode}
                  onOpenLandPanel={null}
                />
              </section>
              <section
                className="report-section"
                aria-labelledby="report-scores-heading"
              >
                <h2 id="report-scores-heading">
                  Scores <Beta />
                </h2>
                {result.scores.status === "ok" ? (
                  <ReportScores
                    scores={result.scores.scores}
                    scoutMode={scoutMode}
                    weights={weights}
                  />
                ) : result.scores.status === "loading" ? (
                  <p>Loading…</p>
                ) : (
                  <p>
                    <strong>Unavailable.</strong> The scores couldn&apos;t be
                    loaded.
                  </p>
                )}
              </section>
              {land?.status === "ok" &&
                land.layer === "land" &&
                land.features.length > 0 && <ReportLand land={land} />}
              <ReportAttributions result={result} coverage={coverage} />
            </>
          ) : (
            <p>
              {busy
                ? "Loading the Search Area…"
                : "There is no Search Area to report on. Go back to the map and choose a Location first."}
            </p>
          )}
        </article>
      </main>
    </div>
  );
};
