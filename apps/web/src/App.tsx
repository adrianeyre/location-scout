import "./App.css";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  DEFAULT_SCOUT_MODE,
  SERVED_LAYER_IDS,
  type AreaResponse,
  type DemographicMeasure,
  type ServedLayerId,
} from "@location-scout/shared";

import { CandidateList } from "./CandidateList";
import { ComparePanel } from "./compare/ComparePanel";
import { featureCredits } from "./attribution";
import { Footer } from "./Footer";
import { ExplainContext, type Explaining } from "./explain/explain-context";
import { useExplainStatus } from "./explain/useExplainStatus";
import { highlightCompetitors } from "./competitors";
import {
  DEFAULT_DEMOGRAPHIC_MEASURE,
  DEMOGRAPHIC_FILL_OPACITY,
  shadeOf,
} from "./layers/demographic-measures";
import { DemographicsShading } from "./layers/DemographicsShading";
import { LandPanel } from "./LandPanel";
import {
  LAND_USE_STYLES,
  OWNERSHIP_CATEGORY_COLOURS,
  applicationsShown,
} from "./layers/layer-styles";
import { LayerToggles } from "./layers/LayerToggles";
import { LocationOverview } from "./LocationOverview";
import type { ShapeShading } from "./map/feature-shapes";
import type { MapOverlay } from "./map/overlay-shapes";
import { SearchAreaMap, type MapLayer } from "./map/SearchAreaMap";
import { RadiusSelect } from "./RadiusSelect";
import { Report } from "./report/Report";
import {
  dashboardViewSearch,
  isDashboardView,
  isReportView,
  reportViewSearch,
} from "./report/report-view";
import { Dashboard } from "./dashboard/Dashboard";
import { dashboardOrder } from "./dashboard/dashboard-data";
import { useDashboardLayout } from "./dashboard/useDashboardLayout";
import {
  SavedLocationsPanel,
  type Saveable,
} from "./saved/SavedLocationsPanel";
import { useSavedLocations } from "./saved/useSavedLocations";
import { ScoutModeSelect } from "./ScoutModeSelect";
import { SearchBar } from "./SearchBar";
import { SettingsButton } from "./settings/SettingsButton";
import {
  StreetViewPanel,
  type StreetViewTarget,
} from "./street-view/StreetViewPanel";
import { useStreetViewKey } from "./street-view/useStreetViewKey";
import { PanelSheet } from "./ui/PanelSheet";
import { useCoverage } from "./useCoverage";
import { useLand } from "./useLand";
import { useLandParcel } from "./useLandParcel";
import { useScoutModes } from "./useScoutModes";
import { useSearchArea } from "./useSearchArea";
import { customWeightsFor } from "./weights";

/**
 * The side panel's tabs (PRD FR-9.1): the Location Overview, the Land panel,
 * the Saved Locations and their comparison.
 */
const PANEL_TABS = [
  { id: "overview", name: "Overview" },
  { id: "land", name: "Land" },
  { id: "saved", name: "Saved" },
  { id: "compare", name: "Compare" },
] as const;

type PanelTab = (typeof PANEL_TABS)[number]["id"];

/** Context land use is drawn in grey, faintly, with dashed outlines. */
const LAND_USE_OVERLAY = { colour: "#57606a", fillOpacity: 0.08, lineWidth: 1 };

/**
 * The INSPIRE Index Polygons that overlap the Land Opportunity chosen,
 * outlined in dashes, and those in and around it a company's or council's
 * title is matched to, in their Ownership Category's colour (PRD FR-5.4a).
 */
const INSPIRE_OVERLAY = { colour: "#1f2328", fillOpacity: 0, lineWidth: 2 };
const TITLED_CATEGORIES = ["company", "council-or-public-body"] as const;

/**
 * Keeps `--header-h` at the header's height, so on a phone the map and its
 * sheet fill the screen under it, and the footer follows below.
 */
const measureHeader = (header: HTMLElement | null) => {
  if (!header || typeof ResizeObserver === "undefined") return;
  const observer = new ResizeObserver(() => {
    document.documentElement.style.setProperty(
      "--header-h",
      `${String(header.offsetHeight)}px`,
    );
  });
  observer.observe(header);
  return () => {
    observer.disconnect();
  };
};

export const App = () => {
  const {
    result,
    radius,
    mode,
    weights: chosenWeights,
    hidden,
    candidates,
    busy,
    error,
    search,
    choose,
    pick,
    open,
    changeRadius,
    changeMode,
    changeWeights,
    showLayer,
  } = useSearchArea();
  const modes = useScoutModes();
  // Whether the report is shown instead of the map, as the URL says (PRD FR-7.4).
  const [reporting, setReporting] = useState(() =>
    isReportView(window.location.search),
  );
  // Whether opening the report added the history entry it is in, so
  // closing it can go back to the map's.
  const reportPushed = useRef(false);
  // Whether the Dashboard is shown instead of the map and panel, as the URL
  // says, and whether opening it added its history entry.
  const [dashboard, setDashboard] = useState(() =>
    isDashboardView(window.location.search),
  );
  const dashboardPushed = useRef(false);
  const saved = useSavedLocations();
  const coverage = useCoverage();
  // GOOGLE_MAPS_API_KEY, or `null` when Street View is off (PRD FR-2.13).
  const streetViewKey = useStreetViewKey();
  const explainOn = useExplainStatus();
  const {
    land,
    search: landSearch,
    changeSearch: changeLandSearch,
    reset: resetLandSearch,
  } = useLand(result);
  // The Search Area, with the Land Layer as the Land panel's search found it.
  const shown = useMemo(
    () =>
      result && land
        ? { ...result, layers: { ...result.layers, land } }
        : result,
    [result, land],
  );
  const [tab, setTab] = useState<PanelTab>("overview");
  // The Land Opportunity chosen in the Land panel, in the Search Area it was chosen in.
  const [chosen, setChosen] = useState<{
    id: string;
    area: AreaResponse;
  } | null>(null);
  const chosenId = chosen && chosen.area === result?.area ? chosen.id : null;
  const parcel = useLandParcel(chosenId);
  const opportunity =
    land?.status === "ok"
      ? (land.features.find(({ id }) => id === chosenId) ?? null)
      : null;
  const scoutMode =
    modes.status === "ok"
      ? (modes.modes.find(({ id }) => id === mode) ?? null)
      : null;

  // Where the Dashboard's Widgets sit, kept here so Settings can show the hidden ones again.
  const widgetLayout = useDashboardLayout(
    dashboardOrder(SERVED_LAYER_IDS, scoutMode?.highlightedLayers ?? []),
  );

  // The user's own weights, if they suit the Scout Mode (PRD FR-4.4).
  const weights = scoutMode && customWeightsFor(scoutMode, chosenWeights);

  // A URL may name a Scout Mode the backend doesn't have: put it back to General.
  useEffect(() => {
    if (modes.status === "ok" && scoutMode === null) {
      changeMode(DEFAULT_SCOUT_MODE, "replace");
    }
  }, [modes.status, scoutMode, changeMode]);

  // Or weights that don't suit its Scout Mode: put them back to its defaults.
  useEffect(() => {
    if (scoutMode && chosenWeights && !weights) changeWeights(null);
  }, [scoutMode, chosenWeights, weights, changeWeights]);

  // The Search Area shown, in the Scout Mode and weights chosen, to save
  // under a name: the postcode or address it was found from, or else the
  // postcode nearest it (PRD FR-7.1). Until the modes arrive, the weights
  // chosen are kept as they are.
  const saveable = useMemo(
    (): Saveable | null =>
      result && {
        view: {
          location: result.area.location,
          radius: result.area.searchRadius.miles,
          mode,
          weights: scoutMode ? weights : chosenWeights,
          found: result.found,
        },
        suggestedName:
          result.found?.label ?? `Near ${result.area.geography.postcode}`,
      },
    [result, mode, scoutMode, weights, chosenWeights],
  );
  // The Layer a Highlight last focused, in the Search Area it was focused in.
  // What AI Explanations ask about: the Search Area shown, in the Scout Mode
  // chosen, weighed as its Location Score is shown (PRD FR-11.2).
  const explainedArea = result?.area ?? null;
  const searchedPostcode =
    result?.found?.kind === "postcode" ? result.found.label : null;
  const explaining = useMemo(
    (): Explaining | null =>
      explainOn && explainedArea
        ? {
            model: explainOn.model,
            questions: {
              ...explainOn.questions,
              overview: explainOn.questions.overview[mode] ?? [],
            },
            about: {
              lat: explainedArea.location.lat,
              lng: explainedArea.location.lng,
              radius: explainedArea.searchRadius.miles,
              ...(searchedPostcode === null
                ? {}
                : { postcode: searchedPostcode }),
              mode,
              ...(weights ? { weights } : {}),
            },
          }
        : null,
    [explainOn, mode, explainedArea, searchedPostcode, weights],
  );

  const [focus, setFocus] = useState<{
    layer: ServedLayerId;
    area: AreaResponse;
  } | null>(null);
  const focused = focus && focus.area === result?.area ? focus.layer : null;

  /** A Highlight's Layer: shown on the map, and pointed out in the Layers panel. */
  const focusLayer = (layer: ServedLayerId) => {
    if (!result) return;
    if (hidden.includes(layer)) showLayer(layer, true);
    setFocus({ layer, area: result.area });
  };

  // Where Street View is open, in the Search Area it was opened in: a new
  // search closes it, so no panorama is loaded that wasn't asked for.
  const [streetView, setStreetView] = useState<{
    target: StreetViewTarget;
    area: AreaResponse;
  } | null>(null);
  const streetViewTarget =
    streetView && streetView.area === result?.area ? streetView.target : null;
  const searchedArea = result?.area ?? null;
  const openStreetView = useCallback(
    (target: StreetViewTarget) => {
      if (searchedArea) setStreetView({ target, area: searchedArea });
    },
    [searchedArea],
  );

  // The Scout Mode's competitors among the amenities, which the map highlights.
  const amenities = result?.layers.amenities;
  const amenityFeatures =
    amenities?.status === "ok" ? amenities.features : null;
  const competitors = useMemo(
    () =>
      amenityFeatures && scoutMode
        ? highlightCompetitors(amenityFeatures, scoutMode)
        : null,
    [amenityFeatures, scoutMode],
  );

  // The measure the Demographics Layer's output areas are shaded by (PRD FR-2.7a).
  const [measure, setMeasure] = useState<DemographicMeasure>(
    DEFAULT_DEMOGRAPHIC_MEASURE,
  );
  const shading = useMemo(
    (): ShapeShading => ({
      colour: (feature) =>
        "deprivationDecile" in feature ? shadeOf(measure, feature) : "",
      fillOpacity: DEMOGRAPHIC_FILL_OPACITY,
      outlineColour: "#ffffff",
      outlineWidth: 1,
    }),
    [measure],
  );
  const demographics = result?.layers.demographics;
  const outputAreas =
    demographics?.status === "ok" &&
    demographics.layer === "demographics" &&
    !hidden.includes("demographics")
      ? demographics.features
      : null;

  // The industrial and commercial land the Land Layer shows as context, and
  // the INSPIRE Index Polygons that overlap the Land Opportunity chosen.
  const landUse =
    land?.status === "ok" && !hidden.includes("land") ? land.landUse : null;
  const inspire =
    opportunity && parcel?.status === "ok"
      ? parcel.parcel.inspirePolygons
      : null;
  const overlays = useMemo(
    (): MapOverlay[] => [
      ...(landUse
        ? [
            {
              id: "land-use",
              shapes: landUse.map(({ id, landUse: use, name, shape }) => ({
                id,
                name: name ?? LAND_USE_STYLES[use].name,
                shape,
              })),
              ...LAND_USE_OVERLAY,
              dashed: true,
            },
          ]
        : []),
      ...(inspire
        ? [null, ...TITLED_CATEGORIES].map((category) => ({
            id: category ? `inspire-${category}` : "inspire",
            shapes: inspire
              .filter(({ ownershipCategory }) =>
                category
                  ? ownershipCategory === category
                  : !TITLED_CATEGORIES.some(
                      (titled) => titled === ownershipCategory,
                    ),
              )
              .map(({ inspireId, shape }) => ({
                id: inspireId,
                name: `INSPIRE ID ${inspireId}`,
                shape,
              })),
            ...INSPIRE_OVERLAY,
            ...(category
              ? { colour: OWNERSHIP_CATEGORY_COLOURS[category], lineWidth: 3 }
              : {}),
            dashed: true,
          }))
        : []),
    ],
    [landUse, inspire],
  );

  // Back and Forward open and close the report as the URL says.
  useEffect(() => {
    const follow = () => {
      reportPushed.current = false;
      dashboardPushed.current = false;
      setReporting(isReportView(window.location.search));
      setDashboard(isDashboardView(window.location.search));
    };
    window.addEventListener("popstate", follow);
    return () => {
      window.removeEventListener("popstate", follow);
    };
  }, []);

  /** Shows the report, in a history entry of its own. */
  const openReport = () => {
    const { pathname, search, hash } = window.location;
    window.history.pushState(
      window.history.state,
      "",
      `${pathname}${reportViewSearch(search, true)}${hash}`,
    );
    reportPushed.current = true;
    setReporting(true);
  };

  /**
   * Goes back to the map: Back, if opening the report added its entry, or
   * else, as for a report reloaded or bookmarked, the same entry without it.
   */
  const closeReport = () => {
    setReporting(false);
    if (reportPushed.current) {
      reportPushed.current = false;
      window.history.back();
      return;
    }
    const { pathname, search, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${reportViewSearch(search, false)}${hash}`,
    );
  };

  /** Shows the Dashboard, in a history entry of its own. */
  const openDashboard = () => {
    const { pathname, search, hash } = window.location;
    window.history.pushState(
      window.history.state,
      "",
      `${pathname}${dashboardViewSearch(search, true)}${hash}`,
    );
    dashboardPushed.current = true;
    setDashboard(true);
  };

  /** Goes back to the map, as `closeReport` does from the report. */
  const closeDashboard = () => {
    setDashboard(false);
    if (dashboardPushed.current) {
      dashboardPushed.current = false;
      window.history.back();
      return;
    }
    const { pathname, search, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${dashboardViewSearch(search, false)}${hash}`,
    );
  };

  /**
   * Moves between the panel's tabs with the arrow keys, and to the first and
   * last with Home and End, as a tab list does.
   */
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = PANEL_TABS.findIndex(({ id }) => id === tab);
    const to =
      event.key === "ArrowRight"
        ? (index + 1) % PANEL_TABS.length
        : event.key === "ArrowLeft"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? -1
              : null;
    if (to === null) return;
    event.preventDefault();
    const next = PANEL_TABS.at(to);
    if (!next) return;
    setTab(next.id);
    document.getElementById(`panel-tab-${next.id}`)?.focus();
  };

  // The Planning Layer's Planning Constraints, and its Planning
  // Applications apart from them, each drawn once it has arrived, whatever
  // came of the other, or `null` while neither has.
  const planning = shown?.layers.planning;
  const planningMap = useMemo(() => {
    if (planning?.status === undefined || planning.status === "loading") {
      return null;
    }
    if (planning.layer !== "planning") return null;
    if (planning.status !== "ok" && planning.applications?.status !== "ok") {
      return null;
    }
    return {
      features: planning.status === "ok" ? planning.features : [],
      apart: applicationsShown(planning.applications),
    };
  }, [planning]);

  // The Layers switched on whose Features have arrived.
  const mapLayers: MapLayer[] = shown
    ? SERVED_LAYER_IDS.flatMap((id): MapLayer[] => {
        const layer = shown.layers[id];
        // Each popup credits its Features' Data Sources (PRD §6.15).
        const credits =
          layer.status === "loading" ? null : featureCredits(layer, coverage);
        if (id === "planning") {
          return planningMap && !hidden.includes(id)
            ? [{ id, ...planningMap, credits }]
            : [];
        }
        if (layer.status !== "ok" || hidden.includes(id)) return [];
        return id === "amenities" && competitors
          ? [
              {
                id,
                features: competitors.rest,
                highlighted: competitors.highlighted,
                credits,
              },
            ]
          : id === "demographics"
            ? [{ id, features: layer.features, shading, credits }]
            : [{ id, features: layer.features, credits }];
      })
    : [];

  if (reporting) {
    return (
      <Report
        result={shown}
        busy={busy}
        coverage={coverage}
        scoutMode={scoutMode}
        weights={weights}
        mapLayers={mapLayers}
        onClose={closeReport}
      />
    );
  }

  return (
    <ExplainContext value={explaining}>
      <div className="app">
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="app-header" ref={measureHeader}>
          <div className="app-title">
            <h1 className="brand">
              <svg
                className="brand-mark"
                viewBox="0 0 64 64"
                aria-hidden="true"
                focusable="false"
              >
                <rect width="64" height="64" rx="14" fill="var(--accent)" />
                <ellipse
                  cx="32"
                  cy="50"
                  rx="22"
                  ry="7"
                  fill="none"
                  stroke="var(--bg)"
                  strokeOpacity="0.6"
                  strokeWidth="3"
                  strokeDasharray="5 4"
                />
                <path
                  d="M32 9c-8.8 0-16 6.9-16 15.5C16 35.6 32 51 32 51s16-15.4 16-26.5C48 15.9 40.8 9 32 9z"
                  fill="var(--bg)"
                />
                <circle cx="32" cy="24.5" r="6.5" fill="var(--accent)" />
              </svg>
              Location Scout
            </h1>
          </div>
          <SearchBar
            busy={busy}
            onSearch={(query) => {
              void search(query);
            }}
          />
          <RadiusSelect radius={radius} onChange={changeRadius} />
          <ScoutModeSelect modes={modes} mode={mode} onChange={changeMode} />
          <div className="app-actions">
            {/* Shows the Dashboard in place of the map and the panel, and the map again. */}
            <button
              type="button"
              className="dashboard-open"
              aria-pressed={dashboard}
              onClick={dashboard ? closeDashboard : openDashboard}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
              Dashboard
            </button>
            <SettingsButton widgetLayout={widgetLayout} />
          </div>
          {error && (
            <p className="search-error" role="alert">
              {error}
            </p>
          )}
          {candidates && (
            <CandidateList candidates={candidates} onChoose={choose} />
          )}
        </header>
        {dashboard ? (
          <Dashboard
            result={shown}
            scoutMode={scoutMode}
            weights={weights}
            onClose={closeDashboard}
            widgetLayout={widgetLayout}
            onShowOnMap={(layer) => {
              closeDashboard();
              setTab("overview");
              focusLayer(layer);
            }}
          />
        ) : (
          <main className="app-main" id="main" tabIndex={-1}>
            <div className="map-pane">
              {/* Past every marker on the map, which may be dozens of Tab stops (PRD FR-9.5). */}
              <a
                className="skip-link map-skip-link"
                href="#layer-toggles"
                onClick={(event) => {
                  // Focused without a #fragment in the URL, which is shared.
                  event.preventDefault();
                  document.getElementById("layer-toggles")?.focus();
                }}
              >
                Skip past the map
              </a>
              <SearchAreaMap
                area={result?.area ?? null}
                layers={mapLayers}
                overlays={overlays}
                focus={opportunity?.shape ?? null}
                onPick={pick}
                onStreetView={streetViewKey ? openStreetView : null}
              />
              <LayerToggles
                hidden={hidden}
                layers={shown?.layers ?? null}
                focused={focused}
                scoutMode={scoutMode}
                onShow={showLayer}
              />
              {outputAreas && (
                <DemographicsShading
                  measure={measure}
                  features={outputAreas}
                  onChange={setMeasure}
                />
              )}
              {streetViewKey && result && (
                <button
                  type="button"
                  className="street-view-button"
                  onClick={() => {
                    openStreetView({
                      location: result.area.location,
                      name: "The Location",
                    });
                  }}
                >
                  Street View at the Location
                </button>
              )}
              {streetViewKey && streetViewTarget && (
                <StreetViewPanel
                  apiKey={streetViewKey}
                  target={streetViewTarget}
                  onClose={() => {
                    setStreetView(null);
                  }}
                />
              )}
            </div>
            <PanelSheet
              revealKey={result?.area ?? null}
              head={
                <>
                  <div
                    className="side-panel-tabs"
                    role="tablist"
                    aria-label="Panel"
                  >
                    {PANEL_TABS.map(({ id, name }) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        id={`panel-tab-${id}`}
                        aria-selected={tab === id}
                        aria-controls={`panel-${id}`}
                        tabIndex={tab === id ? 0 : -1}
                        onClick={() => {
                          setTab(id);
                        }}
                        onKeyDown={moveTab}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              }
            >
              <div
                className="side-panel-body"
                role="tabpanel"
                id="panel-overview"
                aria-labelledby="panel-tab-overview"
                hidden={tab !== "overview"}
              >
                <LocationOverview
                  result={shown}
                  coverage={coverage}
                  scoutMode={scoutMode}
                  weights={weights}
                  onChangeWeights={changeWeights}
                  onFocusLayer={focusLayer}
                  onOpenLandPanel={() => {
                    setTab("land");
                  }}
                  onOpenReport={openReport}
                />
              </div>
              <div
                className="side-panel-body"
                role="tabpanel"
                id="panel-land"
                aria-labelledby="panel-tab-land"
                hidden={tab !== "land"}
              >
                <LandPanel
                  land={land}
                  search={landSearch}
                  onChangeSearch={(next) => {
                    setChosen(null);
                    changeLandSearch(next);
                  }}
                  onResetSearch={() => {
                    setChosen(null);
                    resetLandSearch();
                  }}
                  chosen={chosenId}
                  parcel={parcel}
                  onChoose={(id) => {
                    setChosen(id && result ? { id, area: result.area } : null);
                  }}
                  coverage={coverage}
                  scoutMode={scoutMode}
                />
              </div>
              <div
                className="side-panel-body"
                role="tabpanel"
                id="panel-saved"
                aria-labelledby="panel-tab-saved"
                hidden={tab !== "saved"}
              >
                <SavedLocationsPanel
                  saved={saved}
                  current={saveable}
                  modes={modes}
                  onOpen={(view) => {
                    open(view);
                    setTab("overview");
                  }}
                />
              </div>
              <div
                className="side-panel-body"
                role="tabpanel"
                id="panel-compare"
                aria-labelledby="panel-tab-compare"
                hidden={tab !== "compare"}
              >
                <ComparePanel
                  saved={saved}
                  mode={mode}
                  scoutMode={scoutMode}
                  weights={weights}
                />
              </div>
            </PanelSheet>
          </main>
        )}
        <Footer />
      </div>
    </ExplainContext>
  );
};
