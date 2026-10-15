import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_LAND_FILTERS,
  DEFAULT_LAND_SCOPE,
  DEFAULT_LAND_SORT,
  GEOCODE_MATCH_KINDS,
  SERVED_LAYER_IDS,
  type AreaResponse,
  type GeocodeCandidate,
  type HighlightsResponse,
  type LayerId,
  type LayerResponse,
  type Location,
  type ScoresResponse,
  type ScoutModeId,
  type SearchRadiusMiles,
  type ServedLayerId,
} from "@location-scout/shared";

import {
  getArea,
  getGeocode,
  getHighlights,
  getLayer,
  getScores,
  type ApiResult,
} from "./api";
import {
  hiddenLayers,
  readUrlState,
  roundLocation,
  writeUrlState,
  type UrlState,
} from "./url-state";
import type { SavedView } from "./saved/saved-locations";
import type { CustomWeights } from "./weights";

/** The postcode or address a Location was found from. */
export type Found = Pick<GeocodeCandidate, "kind" | "label">;

/** A Layer's Features and statistics, or that they are still on their way. */
export type LayerState = { status: "loading" } | LayerResponse;

export type LayerStates = Record<ServedLayerId, LayerState>;

/** The Search Area's scores, that they are on their way, or that they failed to load. */
export type ScoresState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ok"; scores: ScoresResponse };

/** The Search Area's Highlights, that they are on their way, or that they failed to load. */
export type HighlightsState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ok"; highlights: HighlightsResponse };

export interface SearchResult {
  /**
   * What the Location was found from, or `null` if it came from a map click
   * or a shared URL.
   */
  found: Found | null;
  area: AreaResponse;
  /** Each Layer arrives on its own, never waiting for the slowest (PRD NFR-2.3). */
  layers: LayerStates;
  /** The scores arrive once every Layer they need has. */
  scores: ScoresState;
  /** So do the Highlights. */
  highlights: HighlightsState;
}

export interface SearchState {
  /**
   * The last Search Area found. It stays on screen while a new search runs, or
   * if the search finds no Location. It goes if the new Location's Search Area
   * can't be loaded, for example because it is outside England (PRD FR-1.5).
   */
  result: SearchResult | null;
  /** The Search Radius chosen. The next Search Area loaded uses it. */
  radius: SearchRadiusMiles;
  /**
   * The Scout Mode chosen (PRD FR-4.1). The scores and Highlights are loaded
   * in it.
   */
  mode: ScoutModeId;
  /**
   * The user's own weights for the Scout Mode (PRD FR-4.4), or `null` for its
   * defaults. They change only the Location Score, which is weighed again
   * from the Category Scores already loaded, so nothing loads again.
   */
  weights: CustomWeights | null;
  /** The Layers the user has switched off the map. */
  hidden: LayerId[];
  /**
   * The addresses a search matched, for the user to pick one from (PRD
   * FR-1.2), or `null` when there is nothing to pick.
   */
  candidates: GeocodeCandidate[] | null;
  /** Whether a search or a Search Area is loading. */
  busy: boolean;
  error: string | null;
}

/** What the user has chosen to look at: the URL's view plus how they found it. */
interface Choice extends UrlState {
  found: Found | null;
}

/**
 * Kept in each history entry, so going back or reloading still names the
 * postcode or address. A shared URL carries only the view.
 */
interface HistoryEntry {
  found: Found | null;
}

/** The postcode or address in a history entry, or `null` if it has none. */
export const foundFrom = (entry: unknown): Found | null => {
  if (typeof entry !== "object" || entry === null || !("found" in entry)) {
    return null;
  }
  const { found } = entry;
  if (typeof found !== "object" || found === null) return null;
  const kind =
    "kind" in found
      ? GEOCODE_MATCH_KINDS.find((known) => known === found.kind)
      : undefined;
  const label = "label" in found ? found.label : undefined;
  return kind !== undefined && typeof label === "string"
    ? { kind, label }
    : null;
};

const readChoice = (): Choice => ({
  ...readUrlState(window.location.search),
  found: foundFrom(window.history.state),
});

/**
 * `push` adds a history entry, so Back returns to the previous view. `replace`
 * corrects the current one. `keep` leaves history alone: the view came from it.
 */
type HistoryUpdate = "push" | "replace" | "keep";

const writeChoice = (choice: Choice, update: HistoryUpdate) => {
  if (update === "keep") return;
  const { pathname, search, hash } = window.location;
  const next = writeUrlState(choice, search);
  const entry: HistoryEntry = { found: choice.found };
  const url = `${pathname}${next}${hash}`;
  if (update === "push" && next !== search) {
    window.history.pushState(entry, "", url);
  } else {
    window.history.replaceState(entry, "", url);
  }
};

/**
 * Whether two views show the same Search Area, found the same way, so that
 * only the Scout Mode, its weights and the visible Layers can differ between
 * them.
 */
const sameSearchArea = (a: Choice, b: Choice) =>
  a.location?.lat === b.location?.lat &&
  a.location?.lng === b.location?.lng &&
  a.radius === b.radius &&
  a.found?.kind === b.found?.kind &&
  a.found?.label === b.found?.label;

/**
 * The view of a chosen candidate, with the Search Radius, Scout Mode, weights
 * and Layers chosen by now.
 */
const chosen = (
  { kind, label, location }: GeocodeCandidate,
  { radius, mode, weights, hidden }: Choice,
): Choice => ({
  location,
  found: { kind, label },
  radius,
  mode,
  weights,
  hidden,
});

/**
 * How long the weights must stay still before the URL follows them. A slider
 * changes them at every step it is dragged or keyed through, and browsers
 * refuse a page that rewrites its URL that often.
 */
export const WEIGHTS_URL_DELAY_MS = 250;

/** Every Layer, on its way. */
export const loadingLayers = (): LayerStates => ({
  crime: { status: "loading" },
  planning: { status: "loading" },
  amenities: { status: "loading" },
  schools: { status: "loading" },
  transport: { status: "loading" },
  "green-space": { status: "loading" },
  property: { status: "loading" },
  land: { status: "loading" },
  demographics: { status: "loading" },
});

/** A Layer whose request failed: the backend is not answering, for example. */
export const unavailableLayer = (layer: ServedLayerId): LayerResponse => {
  const status = "unavailable";
  // Spelt out for each Layer, so each is a whole response of its own kind.
  switch (layer) {
    case "crime":
      return { layer, status, sources: [], features: [], statistics: null };
    case "planning":
      return {
        layer,
        status,
        sources: [],
        features: [],
        statistics: null,
        applications: null,
      };
    case "amenities":
      return { layer, status, sources: [], features: [], statistics: null };
    case "schools":
      return { layer, status, sources: [], features: [], statistics: null };
    case "transport":
      return { layer, status, sources: [], features: [], statistics: null };
    case "green-space":
      return { layer, status, sources: [], features: [], statistics: null };
    case "property":
      return {
        layer,
        status,
        sources: [],
        features: [],
        statistics: null,
        epc: null,
      };
    case "land":
      return {
        layer,
        status,
        sources: [],
        scope: DEFAULT_LAND_SCOPE,
        sort: DEFAULT_LAND_SORT,
        filters: DEFAULT_LAND_FILTERS,
        landCoverageAreas: [],
        notCovered: [],
        features: [],
        landUse: [],
        statistics: null,
      };
    case "demographics":
      return { layer, status, sources: [], features: [], statistics: null };
  }
};

/**
 * How long the Planning Layer waits before it is asked for again while its
 * Planning Applications are queued for PlanIt's turn, which comes about once
 * a minute (PRD NFR-1.5). Asking again is answered by our own backend: from
 * its cache once their turn has come, or `queued` again.
 */
export const PLANNING_APPLICATIONS_RETRY_MS = 5000;

/**
 * Whether a Layer waits for Planning Applications queued for their
 * provider's turn: the Planning Layer's own, or those near the Land Layer's
 * Land Opportunities (PRD FR-5.4).
 */
const isQueued = (layer: LayerResponse) =>
  (layer.layer === "planning" && layer.applications?.status === "queued") ||
  (layer.layer === "land" &&
    layer.features.some(
      ({ nearbyPlanningApplications }) =>
        nearbyPlanningApplications?.status === "queued",
    ));

/** Whether some of the scores wait for Planning Applications queued for their provider's turn. */
const isWaiting = ({ categories }: ScoresResponse) =>
  categories.some(({ status }) => status === "queued");

/**
 * The Planning Layer, or the Land Layer, as it was, but with its Planning
 * Applications unavailable, as asking for them again failed.
 */
const applicationsUnavailable = (layer: LayerResponse): LayerResponse => {
  if (layer.layer === "planning" && layer.applications) {
    return {
      ...layer,
      applications: { ...layer.applications, status: "unavailable" },
    };
  }
  if (layer.layer === "land") {
    return {
      ...layer,
      features: layer.features.map((feature) => ({
        ...feature,
        nearbyPlanningApplications: feature.nearbyPlanningApplications && {
          ...feature.nearbyPlanningApplications,
          status: "unavailable" as const,
          found: null,
        },
      })),
    };
  }
  return layer;
};

/** Resolves after `ms`, or rejects at once if `signal` aborts. */
export const after = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });

/**
 * Shows a Layer once its request answers, or as unavailable if it failed.
 * While Planning Applications in it wait for PlanIt's turn, it is asked for
 * `again` shortly, until they come, showing the rest as it is meanwhile.
 * `first` is `null` if a newer request replaced it, which leaves nothing to
 * show.
 */
export const followLayer = async (
  id: ServedLayerId,
  first: Promise<ApiResult<LayerResponse> | null>,
  again: () => Promise<ApiResult<LayerResponse>>,
  signal: AbortSignal,
  show: (layer: LayerResponse) => void,
) => {
  const loaded = await first;
  if (loaded === null) return;
  let layer = loaded.ok ? loaded.body : unavailableLayer(id);
  show(layer);
  while (isQueued(layer)) {
    const next = await after(PLANNING_APPLICATIONS_RETRY_MS, signal)
      .then(again)
      .catch(() => null);
    if (next === null) return;
    layer = next.ok ? next.body : applicationsUnavailable(layer);
    show(layer);
  }
};

/**
 * Shows the scores once their request answers, or that they are
 * unavailable. Some may wait for the Planning Applications: they are asked
 * for `again` shortly, until they come, showing the rest as they are
 * meanwhile. If asking again fails, the scores stay as they are. `null` is
 * a request a newer one replaced.
 */
export const followScores = async (
  first: Promise<ApiResult<ScoresResponse> | null>,
  again: () => Promise<ApiResult<ScoresResponse> | null>,
  show: (scores: ScoresState) => void,
) => {
  const loaded = await first;
  if (loaded === null) return;
  show(
    loaded.ok
      ? { status: "ok", scores: loaded.body }
      : { status: "unavailable" },
  );
  let scores = loaded;
  while (scores.ok && isWaiting(scores.body)) {
    const next = await again();
    if (next === null || !next.ok) return;
    scores = next;
    show({ status: "ok", scores: next.body });
  }
};

/** Aborts the previous request of one kind when the next one starts. */
const useLatest = () => {
  const current = useRef<AbortController | null>(null);
  return useCallback(() => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    return controller;
  }, []);
};

/** The postcode searched for, if the Location was found from one. */
export const searchedPostcode = ({ found }: Pick<Choice, "found">) =>
  found?.kind === "postcode" ? found.label : null;

/** The Search Area on screen, and the view it was loaded for. */
interface Shown {
  area: AreaResponse;
  choice: Choice;
}

/** Runs a request, ignoring it if a newer one replaced it: that one's result will arrive. */
const unlessReplaced = async (signal: AbortSignal, run: Promise<void>) => {
  try {
    await run;
  } catch (error) {
    if (!signal.aborted) throw error;
  }
};

/**
 * Resolves what the user typed, or the point they clicked, to a Location, then
 * loads its Search Area at the chosen Search Radius, and each Layer for it,
 * then its scores and Highlights in the chosen Scout Mode. The URL follows the
 * Location, radius, Scout Mode and hidden Layers, and opening the URL restores
 * them.
 */
export const useSearchArea = () => {
  const [initial] = useState(readChoice);
  const [state, setState] = useState<SearchState>({
    result: null,
    radius: initial.radius,
    mode: initial.mode,
    weights: initial.weights,
    hidden: initial.hidden,
    candidates: null,
    busy: false,
    error: null,
  });
  const choice = useRef(initial);
  // Set once the latest Search Area asked for has arrived, so that changing
  // the Scout Mode need only load its scores and Highlights again.
  const shown = useRef<Shown | null>(null);
  const nextGeocode = useLatest();
  const nextArea = useLatest();
  // The scores and Highlights load again on their own when the mode changes.
  const nextJudgement = useLatest();
  // The URL waits for the weights to stay still.
  const weightsWrite = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  /**
   * Requests the scores and Highlights for a view, replacing any still on
   * their way. A request only throws when a newer one replaced it, which
   * leaves nothing to show.
   */
  const requestJudgement = useCallback(
    (location: Location, view: Choice) => {
      const { signal } = nextJudgement();
      const postcode = searchedPostcode(view);
      const { radius, mode } = view;
      const scores = () =>
        getScores(location, radius, postcode, mode, signal).catch(() => null);
      return {
        scores: scores(),
        /**
         * The scores asked for again shortly, as the Planning Layer is,
         * while the Planning Applications some need are queued for their
         * provider's turn.
         */
        scoresAgain: () =>
          after(PLANNING_APPLICATIONS_RETRY_MS, signal)
            .then(scores)
            .catch(() => null),
        highlights: getHighlights(
          location,
          radius,
          postcode,
          mode,
          signal,
        ).catch(() => null),
      };
    },
    [nextJudgement],
  );

  /** Shows the scores and Highlights as each arrives, if `area` is still on screen. */
  const showJudgement = useCallback(
    (area: AreaResponse, loads: ReturnType<typeof requestJudgement>) => {
      const update = (change: (current: SearchResult) => SearchResult) => {
        setState((previous) =>
          previous.result?.area === area
            ? { ...previous, result: change(previous.result) }
            : previous,
        );
      };

      void followScores(loads.scores, loads.scoresAgain, (scores) => {
        update((current) => ({ ...current, scores }));
      });

      void loads.highlights.then((highlights) => {
        if (highlights === null) return;
        update((current) => ({
          ...current,
          highlights: highlights.ok
            ? { status: "ok", highlights: highlights.body }
            : { status: "unavailable" },
        }));
      });
    },
    [],
  );

  const loadArea = useCallback(
    async (next: Choice, update: HistoryUpdate) => {
      const { signal } = nextArea();
      nextJudgement().abort();
      choice.current = next;
      shown.current = null;
      writeChoice(next, update);
      const { location, radius, mode, weights, hidden, found } = next;
      setState((previous) => ({
        result: location ? previous.result : null,
        radius,
        mode,
        weights,
        hidden,
        candidates: previous.candidates,
        busy: location !== null,
        error: null,
      }));
      if (!location) return;

      const postcode = searchedPostcode(next);
      const areaLoad = getArea(location, radius, postcode, signal);
      // Every Layer is requested alongside the Search Area, so each can be
      // shown the moment it arrives (PRD NFR-2.3). A request only throws when
      // a newer one replaced it, which leaves nothing to show.
      const layerLoads = SERVED_LAYER_IDS.map((id) => ({
        id,
        load: getLayer(id, location, radius, postcode, signal).catch(
          () => null,
        ),
      }));
      const judgementLoads = requestJudgement(location, next);

      await unlessReplaced(
        signal,
        areaLoad.then((area) => {
          if (!area.ok) {
            setState((previous) => ({
              ...previous,
              result: null,
              busy: false,
              error: area.message,
            }));
            return;
          }
          const result: SearchResult = {
            found,
            area: area.body,
            layers: loadingLayers(),
            scores: { status: "loading" },
            highlights: { status: "loading" },
          };
          shown.current = { area: area.body, choice: next };
          setState((previous) => ({ ...previous, result, busy: false }));

          /** Changes the result, but only for the Search Area it was loaded with. */
          const update = (change: (current: SearchResult) => SearchResult) => {
            setState((previous) =>
              previous.result?.area === area.body
                ? { ...previous, result: change(previous.result) }
                : previous,
            );
          };

          const showLayer = (id: ServedLayerId, layer: LayerResponse) => {
            update((current) => ({
              ...current,
              layers: { ...current.layers, [id]: layer },
            }));
          };

          for (const { id, load } of layerLoads) {
            void followLayer(
              id,
              load,
              () => getLayer(id, location, radius, postcode, signal),
              signal,
              (layer) => {
                showLayer(id, layer);
              },
            );
          }

          showJudgement(area.body, judgementLoads);
        }),
      );
    },
    [nextArea, nextJudgement, requestJudgement, showJudgement],
  );

  /**
   * Shows a view that differs from the one chosen only in its Scout Mode, its
   * weights or hidden Layers. A new mode loads the scores and Highlights
   * again, but not the Search Area or its Layers, which no mode changes. If
   * the Search Area hasn't arrived, it is loaded again in the new mode. New
   * weights load nothing.
   */
  const showView = useCallback(
    (next: Choice, update: HistoryUpdate) => {
      const modeChanged = next.mode !== choice.current.mode;
      const on = shown.current;
      if (modeChanged && !on && next.location) {
        void loadArea(next, update);
        return;
      }
      choice.current = next;
      writeChoice(next, update);
      if (!modeChanged || !on?.choice.location) {
        setState((previous) => ({
          ...previous,
          mode: next.mode,
          weights: next.weights,
          hidden: next.hidden,
        }));
        return;
      }
      shown.current = { ...on, choice: next };
      setState((previous) => ({
        ...previous,
        mode: next.mode,
        weights: next.weights,
        hidden: next.hidden,
        result: previous.result && {
          ...previous.result,
          scores: { status: "loading" },
          highlights: { status: "loading" },
        },
      }));
      showJudgement(on.area, requestJudgement(on.choice.location, next));
    },
    [loadArea, requestJudgement, showJudgement],
  );

  const search = useCallback(
    async (query: string) => {
      const { signal } = nextGeocode();
      nextArea().abort();
      setState((previous) => ({
        ...previous,
        candidates: null,
        busy: true,
        error: null,
      }));

      await unlessReplaced(
        signal,
        getGeocode(query, signal).then(async (geocode) => {
          if (!geocode.ok) {
            setState((previous) => ({
              ...previous,
              busy: false,
              error: geocode.message,
            }));
            return;
          }
          const [only, ...others] = geocode.body.candidates;
          if (only !== undefined && others.length === 0) {
            // The radius is read now, so one chosen while it resolved is kept.
            await loadArea(chosen(only, choice.current), "push");
            return;
          }
          // Several addresses match: the user picks one (PRD FR-1.2).
          setState((previous) => ({
            ...previous,
            candidates: geocode.body.candidates,
            busy: false,
          }));
        }),
      );
    },
    [nextGeocode, nextArea, loadArea],
  );

  const choose = useCallback(
    (candidate: GeocodeCandidate) => {
      setState((previous) => ({ ...previous, candidates: null }));
      void loadArea(chosen(candidate, choice.current), "push");
    },
    [loadArea],
  );

  const pick = useCallback(
    (location: Location) => {
      // The click replaces any search still resolving or waiting for a choice.
      nextGeocode().abort();
      setState((previous) => ({ ...previous, candidates: null }));
      void loadArea(
        {
          ...choice.current,
          location: roundLocation(location),
          found: null,
        },
        "push",
      );
    },
    [nextGeocode, loadArea],
  );

  /**
   * Opens a Saved Location (PRD FR-7.2): its Location, Search Radius, Scout
   * Mode and weights, with the Layers shown as they are. Where it is the
   * Search Area already shown, only its Scout Mode and weights change.
   */
  const open = useCallback(
    ({ location, radius, mode, weights, found }: SavedView) => {
      nextGeocode().abort();
      setState((previous) => ({ ...previous, candidates: null }));
      const next: Choice = {
        location,
        radius,
        mode,
        weights,
        found,
        hidden: choice.current.hidden,
      };
      if (shown.current && sameSearchArea(next, shown.current.choice)) {
        showView(next, "push");
        return;
      }
      void loadArea(next, "push");
    },
    [nextGeocode, loadArea, showView],
  );

  const changeRadius = useCallback(
    (radius: SearchRadiusMiles) => {
      void loadArea({ ...choice.current, radius }, "push");
    },
    [loadArea],
  );

  /**
   * Picks a Scout Mode (PRD FR-4.1), with its default weights. `replace`
   * corrects the URL's mode without adding a history entry, for one the
   * backend doesn't have.
   */
  const changeMode = useCallback(
    (mode: ScoutModeId, update: "push" | "replace" = "push") => {
      showView({ ...choice.current, mode, weights: null }, update);
    },
    [showView],
  );

  /**
   * Weighs the Location Score by the user's own weights, or by the Scout
   * Mode's defaults again for `null` (PRD FR-4.4). The URL keeps them,
   * replacing its entry rather than adding one for every step of a slider.
   */
  const changeWeights = useCallback(
    (weights: CustomWeights | null) => {
      showView({ ...choice.current, weights }, "keep");
      clearTimeout(weightsWrite.current);
      weightsWrite.current = setTimeout(() => {
        writeChoice(choice.current, "replace");
      }, WEIGHTS_URL_DELAY_MS);
    },
    [showView],
  );

  const showLayer = useCallback(
    (layer: LayerId, visible: boolean) => {
      const { hidden } = choice.current;
      showView(
        {
          ...choice.current,
          hidden: visible
            ? hidden.filter((id) => id !== layer)
            : hiddenLayers([...hidden, layer]),
        },
        "push",
      );
    },
    [showView],
  );

  useEffect(() => {
    // Opening the page: load the URL's view, correcting anything invalid in it.
    // A bare URL stays bare until the user chooses something.
    void loadArea(choice.current, window.location.search ? "replace" : "keep");

    const restore = () => {
      nextGeocode().abort();
      setState((previous) => ({ ...previous, candidates: null }));
      const next = readChoice();
      if (sameSearchArea(next, choice.current)) {
        // Only the Scout Mode or the visible Layers changed, so the Search
        // Area and its Layers need not load again.
        showView(next, "keep");
        return;
      }
      void loadArea(next, "keep");
    };
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      nextGeocode().abort();
      nextArea().abort();
      clearTimeout(weightsWrite.current);
    };
  }, [loadArea, showView, nextGeocode, nextArea]);

  return {
    ...state,
    search,
    choose,
    pick,
    open,
    changeRadius,
    changeMode,
    changeWeights,
    showLayer,
  };
};
