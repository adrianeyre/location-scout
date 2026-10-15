import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_LAND_FILTERS,
  DEFAULT_LAND_SCOPE,
  DEFAULT_LAND_SORT,
  type AreaResponse,
  type LandLayerResponse,
} from "@location-scout/shared";

import { getLand, type LandSearch } from "./api";
import { searchedPostcode, type SearchResult } from "./useSearchArea";

/** The Land Layer's own search: the Search Area, the largest first, with FR-5.3's filters. */
export const DEFAULT_LAND_SEARCH: LandSearch = {
  scope: DEFAULT_LAND_SCOPE,
  sort: DEFAULT_LAND_SORT,
  filters: DEFAULT_LAND_FILTERS,
};

/** Whether two searches look in the same place, for the same land, in the same order. */
export const sameLandSearch = (a: LandSearch, b: LandSearch) =>
  a.scope === b.scope &&
  a.sort === b.sort &&
  JSON.stringify({
    ...a.filters,
    excludeConstraints: [...a.filters.excludeConstraints].sort(),
  }) ===
    JSON.stringify({
      ...b.filters,
      excludeConstraints: [...b.filters.excludeConstraints].sort(),
    });

/** The Land Layer's Land Opportunities, that they are on their way, or the Layer as it loaded. */
export type LandState = { status: "loading" } | LandLayerResponse;

/** A search whose request failed: the backend is not answering, for example. */
const unavailable = ({
  scope,
  sort,
  filters,
}: LandSearch): LandLayerResponse => ({
  layer: "land",
  status: "unavailable",
  sources: [],
  scope,
  sort,
  filters,
  landCoverageAreas: [],
  notCovered: [],
  features: [],
  landUse: [],
  statistics: null,
});

interface Found {
  area: AreaResponse;
  search: LandSearch;
  state: LandState;
}

/**
 * The Land Opportunities the Land panel and the Land Layer show (PRD FR-5.1,
 * FR-2.7): the Land Layer as it loaded with the Search Area, with FR-5.3's
 * default filters, or, once the user changes the filters, the scope or the
 * order, those `/api/land` finds for them. The search is kept when the
 * Search Area changes, and made again for the new one.
 */
export const useLand = (result: SearchResult | null) => {
  const [search, setSearch] = useState<LandSearch>(DEFAULT_LAND_SEARCH);
  const [found, setFound] = useState<Found | null>(null);
  const area = result?.area ?? null;
  const own = sameLandSearch(search, DEFAULT_LAND_SEARCH);
  const postcode = result ? searchedPostcode(result) : null;

  useEffect(() => {
    if (!area || own) return;
    const controller = new AbortController();
    getLand(
      area.location,
      area.searchRadius.miles,
      postcode,
      search,
      controller.signal,
    )
      .then((land) => {
        setFound({
          area,
          search,
          state: land.ok ? land.body : unavailable(search),
        });
      })
      // Only a newer search, which replaced this one, aborts it.
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [area, own, postcode, search]);

  let land: LandState | null = null;
  if (result) {
    const layer = result.layers.land;
    if (own) {
      land =
        layer.status === "loading" || layer.layer === "land" ? layer : null;
    } else {
      land =
        found?.area === result.area && found.search === search
          ? found.state
          : { status: "loading" };
    }
  }

  const reset = useCallback(() => {
    setSearch(DEFAULT_LAND_SEARCH);
  }, []);

  return { land, search, changeSearch: setSearch, reset };
};
