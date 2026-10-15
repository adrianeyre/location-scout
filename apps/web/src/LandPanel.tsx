import { useState, type ReactNode } from "react";

import {
  DEFAULT_LAND_FILTERS,
  FLOOD_ZONES,
  HM_LAND_REGISTRY_SEARCHES,
  INSPIRE_FREEHOLD_NOTE,
  LAND_OPPORTUNITY_WORDING,
  LAND_SORTS,
  OWNERSHIP_CATEGORIES,
  OWNERSHIP_CATEGORY_NAMES,
  OWNERSHIP_CATEGORY_NOTE,
  PLANNING_CONSTRAINT_TYPES,
  TITLE_DATASETS,
  isFloodZone,
  isLandSort,
  type Council,
  type LandFilters,
  type LandLayerResponse,
  type LandOpportunityFeature,
  type LandSort,
  type OwnershipCategory,
  type PlanningConstraintType,
  type ScoutMode,
} from "@location-scout/shared";

import type { LandSearch } from "./api";
import { Explain } from "./explain/Explain";
import { formatCount, formatDistance, formatList } from "./format";
import { Attributions } from "./LandCoverageArea";
import { HighlightedBy } from "./layers/HighlightedBy";
import { LandSales } from "./layers/LandSales";
import {
  OWNERSHIP_NOT_PREPARED,
  OwnershipCounts,
} from "./layers/LandStatistics";
import {
  MATCHED_TITLES_NAME,
  NEARBY_APPLICATIONS_NAME,
  NEARBY_APPLICATIONS_NOTE,
  OWNERSHIP_CATEGORY_COLOURS,
  PLANNING_CONSTRAINT_STYLES,
  formatLandArea,
  inspireOverlapText,
  landColour,
  landTags,
  landUseText,
  landSalesSummary,
  matchedTitleText,
  nearbyApplicationText,
  ownershipText,
  titleAttributions,
} from "./layers/layer-styles";
import type { CoverageState } from "./useCoverage";
import type { LandState } from "./useLand";
import type { LandParcelState } from "./useLandParcel";

/** How each order is offered. */
const SORT_NAMES: Readonly<Record<LandSort, string>> = {
  area: "Largest first",
  "road-distance": "Nearest a road first",
  capacity: "Most homes first",
};

/** The furthest from a road a Land Opportunity may be, in metres, offered to choose from; `null` is any distance. */
const ROAD_DISTANCES = [10, 25, 50, 100, 250, 500, null] as const;

/** How each highest flood zone is offered. */
const FLOOD_ZONE_NAMES = {
  1: "1 only: not in flood zone 2 or 3",
  2: "Up to 2",
  3: "Any, up to 3",
} as const;

/** "Ashfield", "Ashfield and Mansfield". */
const councilNames = (councils: readonly Council[]) =>
  formatList(councils.map(({ name }) => name));

/** A number of acres typed in, or `null` if it is blank or not 0 or more. */
const acresIn = (text: string) => {
  if (text.trim() === "") return null;
  const acres = Number(text);
  return Number.isFinite(acres) && acres >= 0 ? acres : null;
};

interface FiltersProps {
  search: LandSearch;
  /** The Land Coverage Areas the Search Area reaches into, to name. */
  landCoverageAreas: readonly Council[];
  /** Whether their land has Ownership Categories, so it can be filtered by them. */
  categorised: boolean;
  onChange: (search: LandSearch) => void;
  onReset: () => void;
}

/**
 * Where to look, in what order, and the filters a Land Parcel must meet to
 * be a Land Opportunity (PRD FR-5.1, FR-5.3, FR-5.5). Each change finds them
 * again.
 */
const LandFiltersForm = ({
  search,
  landCoverageAreas,
  categorised,
  onChange,
  onReset,
}: FiltersProps) => {
  const { scope, sort, filters } = search;
  // The acres as typed, so a half-typed number isn't put back as it is read.
  const [minText, setMinText] = useState(String(filters.minAcres));
  const [maxText, setMaxText] = useState(
    filters.maxAcres === null ? "" : String(filters.maxAcres),
  );
  const change = (next: Partial<LandFilters>) => {
    onChange({ ...search, filters: { ...filters, ...next } });
  };
  const exclude = (type: PlanningConstraintType, excluded: boolean) => {
    change({
      excludeConstraints: excluded
        ? [...filters.excludeConstraints, type]
        : filters.excludeConstraints.filter((each) => each !== type),
    });
  };
  const keep = (category: OwnershipCategory, kept: boolean) => {
    change({
      ownershipCategories: kept
        ? [...filters.ownershipCategories, category]
        : filters.ownershipCategories.filter((each) => each !== category),
    });
  };
  const whole =
    landCoverageAreas.length > 0
      ? `Across ${councilNames(landCoverageAreas)}`
      : "Across the whole Land Coverage Area";

  return (
    <form
      className="land-filters"
      aria-label="Find Land Opportunities"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <fieldset className="land-scope">
        <legend>Look</legend>
        <label>
          <input
            type="radio"
            name="land-scope"
            checked={scope === "search-area"}
            onChange={() => {
              onChange({ ...search, scope: "search-area" });
            }}
          />
          In the Search Area
        </label>
        <label>
          <input
            type="radio"
            name="land-scope"
            checked={scope === "land-coverage-area"}
            onChange={() => {
              onChange({ ...search, scope: "land-coverage-area" });
            }}
          />
          {whole}
        </label>
      </fieldset>
      <label className="land-field">
        Order
        <select
          value={sort}
          onChange={(event) => {
            const { value } = event.target;
            if (isLandSort(value)) onChange({ ...search, sort: value });
          }}
        >
          {LAND_SORTS.map((each) => (
            <option key={each} value={each}>
              {SORT_NAMES[each]}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="land-filter-list">
        <legend>Filters</legend>
        <label className="land-field">
          Smallest area, in acres
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={minText}
            onChange={(event) => {
              setMinText(event.target.value);
              change({ minAcres: acresIn(event.target.value) ?? 0 });
            }}
          />
        </label>
        <label className="land-field">
          Largest area, in acres
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            placeholder="No limit"
            value={maxText}
            onChange={(event) => {
              setMaxText(event.target.value);
              change({ maxAcres: acresIn(event.target.value) });
            }}
          />
        </label>
        <label className="land-field">
          Furthest from a road
          <select
            value={String(filters.maxRoadMetres)}
            onChange={(event) => {
              const { value } = event.target;
              change({
                maxRoadMetres: value === "null" ? null : Number(value),
              });
            }}
          >
            {ROAD_DISTANCES.map((metres) => (
              <option key={String(metres)} value={String(metres)}>
                {metres === null ? "Any distance" : formatDistance(metres)}
              </option>
            ))}
          </select>
        </label>
        <label className="land-field">
          Highest flood zone
          <select
            value={filters.maxFloodZone}
            onChange={(event) => {
              const zone = Number(event.target.value);
              if (isFloodZone(zone)) change({ maxFloodZone: zone });
            }}
          >
            {[...FLOOD_ZONES].reverse().map((zone) => (
              <option key={zone} value={zone}>
                {FLOOD_ZONE_NAMES[zone]}
              </option>
            ))}
          </select>
        </label>
        <label className="land-check">
          <input
            type="checkbox"
            checked={filters.possiblyUnregisteredOnly}
            onChange={(event) => {
              change({ possiblyUnregisteredOnly: event.target.checked });
            }}
          />
          Possibly Unregistered only
        </label>
        <label className="land-check">
          <input
            type="checkbox"
            checked={filters.excludeListedBuildingOutlines}
            onChange={(event) => {
              change({ excludeListedBuildingOutlines: event.target.checked });
            }}
          />
          Leave out land on a listed building&apos;s outline
        </label>
        {(categorised || filters.ownershipCategories.length > 0) && (
          <fieldset className="land-exclude">
            <legend>Only land that is, indicatively</legend>
            {OWNERSHIP_CATEGORIES.map((category) => (
              <label key={category} className="land-check land-ownership-check">
                <input
                  type="checkbox"
                  checked={filters.ownershipCategories.includes(category)}
                  onChange={(event) => {
                    keep(category, event.target.checked);
                  }}
                />
                <span
                  className="land-swatch"
                  style={{
                    borderColor: OWNERSHIP_CATEGORY_COLOURS[category],
                  }}
                  aria-hidden="true"
                />
                {OWNERSHIP_CATEGORY_NAMES[category]}
              </label>
            ))}
          </fieldset>
        )}
        <fieldset className="land-exclude">
          <legend>Leave out land in</legend>
          {PLANNING_CONSTRAINT_TYPES.map((type) => (
            <label key={type} className="land-check">
              <input
                type="checkbox"
                checked={filters.excludeConstraints.includes(type)}
                onChange={(event) => {
                  exclude(type, event.target.checked);
                }}
              />
              {PLANNING_CONSTRAINT_STYLES[type].name[1]}
            </label>
          ))}
        </fieldset>
      </fieldset>
      <button
        type="button"
        onClick={() => {
          setMinText(String(DEFAULT_LAND_FILTERS.minAcres));
          setMaxText("");
          onReset();
        }}
      >
        Reset to the defaults
      </button>
    </form>
  );
};

/** One Land Opportunity's tags, briefly, for the list. */
const briefly = (opportunity: LandOpportunityFeature) =>
  [
    landUseText(opportunity.landUse),
    ...(opportunity.ownershipCategory
      ? [ownershipText(opportunity.ownershipCategory)]
      : opportunity.possiblyUnregistered
        ? ["Possibly Unregistered"]
        : []),
    opportunity.roadDistanceMetres === null
      ? "no road within 500 m"
      : `road ${formatDistance(opportunity.roadDistanceMetres)}`,
    ...(opportunity.floodZone === null
      ? []
      : [`flood zone ${String(opportunity.floodZone)}`]),
    `about ${formatCount(opportunity.estimatedHomes, ["home", "homes"])}`,
    `${formatDistance(opportunity.distanceMetres)} from the Location`,
  ].join(", ");

interface ChosenProps {
  opportunity: LandOpportunityFeature;
  parcel: LandParcelState | null;
  onClose: () => void;
}

/**
 * The Land Opportunity chosen: its tags, its indicative Ownership Category
 * and the companies' and councils' titles matched in and around it (PRD
 * FR-5.4a), the INSPIRE Index Polygons that overlap it, which the map
 * outlines, every land sale within 1 mile of it, which may not be land
 * (FR-5.4b), an Explain button for it while AI Explanations are on
 * (FR-11.1), and HM Land Registry's services for checking who owns it
 * (FR-5.6).
 */
const ChosenOpportunity = ({ opportunity, parcel, onClose }: ChosenProps) => {
  let polygons: ReactNode;
  const overlapping =
    parcel?.status === "ok"
      ? parcel.parcel.inspirePolygons.filter(
          ({ distanceMetres }) => distanceMetres === 0,
        )
      : [];
  if (!parcel || parcel.status === "loading") {
    polygons = <p>Loading the INSPIRE Index Polygons that overlap it…</p>;
  } else if (parcel.status === "unavailable") {
    polygons = <p>{parcel.message}</p>;
  } else if (overlapping.length === 0) {
    polygons = <p>No INSPIRE Index Polygon overlaps it.</p>;
  } else {
    polygons = (
      <ul aria-label="INSPIRE Index Polygons that overlap it">
        {overlapping.map((polygon) => (
          <li key={polygon.inspireId}>{inspireOverlapText(polygon)}</li>
        ))}
      </ul>
    );
  }
  const { ownershipCategory, matchedTitles } = opportunity;
  const nearbyApplications = opportunity.nearbyPlanningApplications?.found;
  return (
    <section className="land-chosen" aria-labelledby="land-chosen-heading">
      <h3 id="land-chosen-heading">
        {opportunity.name ?? "Land Opportunity"}: {formatLandArea(opportunity)}
      </h3>
      <p className="land-wording">{LAND_OPPORTUNITY_WORDING}</p>
      <ul aria-label="Its tags">
        {landTags(opportunity).map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
        <li>{formatDistance(opportunity.distanceMetres)} from the Location</li>
      </ul>
      <h4>Ownership Category</h4>
      {ownershipCategory ? (
        <>
          <p>
            <span
              className="land-swatch"
              style={{
                borderColor: OWNERSHIP_CATEGORY_COLOURS[ownershipCategory],
              }}
              aria-hidden="true"
            />{" "}
            <strong>{ownershipText(ownershipCategory)}</strong>
          </p>
          {matchedTitles.length > 0 ? (
            <>
              <p>{MATCHED_TITLES_NAME}:</p>
              <ul aria-label="Titles matched in and around it">
                {matchedTitles.map((title) => (
                  <li key={title.titleNumber}>{matchedTitleText(title)}</li>
                ))}
              </ul>
              {titleAttributions(matchedTitles).map((statement) => (
                <p key={statement} className="layer-note">
                  {statement}
                </p>
              ))}
            </>
          ) : (
            <p>
              No company&apos;s or council&apos;s title is matched in or around
              it.
            </p>
          )}
          <p className="layer-note">{OWNERSHIP_CATEGORY_NOTE}</p>
        </>
      ) : (
        <p className="layer-note">{OWNERSHIP_NOT_PREPARED}</p>
      )}
      <h4>INSPIRE Index Polygons that overlap it</h4>
      <p className="layer-note">
        Outlined on the map with dashes, and those around it a company&apos;s or
        council&apos;s title is matched to in its colour.{" "}
        {INSPIRE_FREEHOLD_NOTE}
      </p>
      {polygons}
      <h4>Land sales within 1 mile</h4>
      {!parcel || parcel.status === "loading" ? (
        <p>Loading the land sales near it…</p>
      ) : parcel.status === "unavailable" ? (
        <p>{parcel.message}</p>
      ) : (
        <LandSales sales={parcel.parcel.nearbyLandSales} />
      )}
      {nearbyApplications && nearbyApplications.highlighted.length > 0 && (
        <>
          <h4>{NEARBY_APPLICATIONS_NAME}</h4>
          <ul aria-label={NEARBY_APPLICATIONS_NAME}>
            {nearbyApplications.highlighted.map((application) => (
              <li key={application.id}>{nearbyApplicationText(application)}</li>
            ))}
          </ul>
          <p className="layer-note">{NEARBY_APPLICATIONS_NOTE}</p>
        </>
      )}
      <Explain
        subject={{ kind: "land-opportunity", parcelId: opportunity.id }}
        name="this Land Opportunity"
      />
      <h4>Check its ownership with HM Land Registry</h4>
      <ul aria-label="HM Land Registry's ownership checks">
        {HM_LAND_REGISTRY_SEARCHES.map(({ name, url }) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              HM Land Registry: {name}
            </a>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onClose}>
        Back to the list
      </button>
    </section>
  );
};

interface OpportunitiesProps {
  land: LandLayerResponse;
  chosen: string | null;
  parcel: LandParcelState | null;
  onChoose: (id: string | null) => void;
}

/** The Land Opportunities found, in the order chosen, and the one chosen. */
const Opportunities = ({
  land,
  chosen,
  parcel,
  onChoose,
}: OpportunitiesProps) => {
  const { statistics, features, scope, landCoverageAreas, notCovered } = land;
  if (!statistics) return null;
  const where =
    scope === "search-area"
      ? "in the Search Area"
      : `across ${councilNames(landCoverageAreas)}`;
  const opportunity = features.find(({ id }) => id === chosen);
  return (
    <>
      <p className="land-summary" aria-live="polite">
        <strong>
          {formatCount(statistics.count, [
            "Land Opportunity",
            "Land Opportunities",
          ])}{" "}
          {where}
        </strong>
        , of {formatCount(statistics.parcels, ["Land Parcel", "Land Parcels"])}:{" "}
        {statistics.totalHectares.toLocaleString("en-GB")} ha in all,{" "}
        {statistics.possiblyUnregistered.toLocaleString("en-GB")} Possibly
        Unregistered, room for about{" "}
        {formatCount(statistics.estimatedHomes, ["home", "homes"])}, estimated.
      </p>
      {statistics.ownershipCategories ? (
        <>
          <p>By Ownership Category, indicative:</p>
          <OwnershipCounts counts={statistics.ownershipCategories} />
          <p className="layer-note">{OWNERSHIP_CATEGORY_NOTE}</p>
        </>
      ) : (
        <p className="layer-note">
          Ownership Categories: {OWNERSHIP_NOT_PREPARED}
        </p>
      )}
      <p className="land-sales-summary">
        Nearby land sales: {landSalesSummary(statistics.nearbyLandSales)}
      </p>
      {statistics.listed < statistics.count && (
        <p className="layer-note">
          The first {statistics.listed.toLocaleString("en-GB")}, in this order,
          are listed and mapped.
        </p>
      )}
      {scope === "search-area" && notCovered.length > 0 && (
        <p className="layer-note">
          Land data isn&apos;t prepared for {councilNames(notCovered)}, which
          the Search Area reaches into, so its land there isn&apos;t looked at.
        </p>
      )}
      {opportunity && (
        <ChosenOpportunity
          opportunity={opportunity}
          parcel={parcel}
          onClose={() => {
            onChoose(null);
          }}
        />
      )}
      {features.length > 0 && (
        <ol className="land-list" aria-label="Land Opportunities">
          {features.map((each) => (
            <li key={each.id}>
              <button
                type="button"
                aria-pressed={each.id === chosen}
                data-possibly-unregistered={
                  each.possiblyUnregistered || undefined
                }
                data-ownership-category={each.ownershipCategory ?? undefined}
                style={{ borderLeftColor: landColour(each) }}
                onClick={() => {
                  onChoose(each.id === chosen ? null : each.id);
                }}
              >
                <strong>
                  {each.name ? `${each.name}, ` : ""}
                  {formatLandArea(each)}
                </strong>
                <span>{briefly(each)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
};

interface LandPanelProps {
  /** The Land Opportunities, or `null` with no Search Area. */
  land: LandState | null;
  search: LandSearch;
  onChangeSearch: (search: LandSearch) => void;
  onResetSearch: () => void;
  /** The Land Opportunity chosen, by its id, and its details. */
  chosen: string | null;
  parcel: LandParcelState | null;
  onChoose: (id: string | null) => void;
  /** What has been prepared, for the INSPIRE Index Polygons' statements. */
  coverage: CoverageState;
  /** The Scout Mode chosen, which may highlight the Land Layer (PRD FR-4.3a). */
  scoutMode: ScoutMode | null;
}

/**
 * The Land panel (PRD FR-5.1): the Land Opportunities in the Search Area, or
 * across the whole Land Coverage Area, that meet the filters, in the order
 * chosen, each with its tags and indicative Ownership Category, which it can
 * be filtered by (FR-5.4a, FR-5.5), and the one chosen with the titles
 * matched in and around it, the INSPIRE Index Polygons that overlap it and
 * links to HM Land Registry's ownership checks.
 * It always says that a Land Opportunity only warrants investigation
 * (FR-5.7), and that INSPIRE covers only freehold titles (FR-5.8).
 */
export const LandPanel = ({
  land,
  search,
  onChangeSearch,
  onResetSearch,
  chosen,
  parcel,
  onChoose,
  coverage,
  scoutMode,
}: LandPanelProps) => {
  const loaded = land && land.status !== "loading" ? land : null;
  let body: ReactNode;
  if (!land) {
    body = (
      <p className="empty-state">
        Enter a postcode or an address, or click the map, to find Land
        Opportunities around a Location.
      </p>
    );
  } else if (land.status === "loading") {
    body = <p>Loading…</p>;
  } else if (land.status === "unavailable") {
    body = (
      <p>
        <strong>Unavailable.</strong> The prepared Land Parcels can&apos;t be
        read for now. Everything else still works.
      </p>
    );
  } else if (land.status === "not-prepared") {
    const [council] = land.notCovered;
    body =
      land.landCoverageAreas.length === 0 && council ? (
        <p>
          <strong>Land data not prepared for this area.</strong> Add{" "}
          {councilNames(land.notCovered)} with{" "}
          <code>pnpm data:prepare --area "{council.name}"</code>.
        </p>
      ) : (
        <p>
          <strong>Not prepared.</strong> Run <code>pnpm data:prepare</code> to
          prepare the Land Coverage Areas&apos; Land Parcels.
        </p>
      );
  } else {
    body = (
      <Opportunities
        land={land}
        chosen={chosen}
        parcel={parcel}
        onChoose={onChoose}
      />
    );
  }
  const areas =
    coverage.status === "ok"
      ? coverage.coverage.landCoverageAreas.filter(({ council }) =>
          loaded?.landCoverageAreas.some(({ code }) => code === council.code),
        )
      : [];
  const covered = loaded ? loaded.landCoverageAreas : [];
  const categorised = Boolean(
    loaded?.status === "ok" && loaded.statistics?.ownershipCategories,
  );
  // CCOD and OCOD, which the Ownership Categories come from, are England-wide.
  const titleDatasets =
    categorised && coverage.status === "ok"
      ? coverage.coverage.datasets.filter(({ id }) =>
          TITLE_DATASETS.some((dataset) => dataset === id),
        )
      : [];
  return (
    <aside className="land-panel" aria-labelledby="land-heading">
      <h2 id="land-heading">Land Opportunities</h2>
      {scoutMode?.highlightedLayers.includes("land") && (
        <p className="layer-highlighted">
          <HighlightedBy scoutMode={scoutMode} />
        </p>
      )}
      <p className="land-wording">
        <strong>{LAND_OPPORTUNITY_WORDING}</strong>
      </p>
      <p className="layer-note">{INSPIRE_FREEHOLD_NOTE}</p>
      {land && (land.status === "loading" || land.status === "ok") && (
        <LandFiltersForm
          search={search}
          landCoverageAreas={covered}
          categorised={categorised}
          onChange={onChangeSearch}
          onReset={onResetSearch}
        />
      )}
      {body}
      {areas.map(({ council, datasets }) => (
        <Attributions key={council.code} datasets={datasets} />
      ))}
      <Attributions datasets={titleDatasets} />
    </aside>
  );
};
