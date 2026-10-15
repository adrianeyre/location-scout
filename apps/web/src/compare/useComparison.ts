import { useEffect, useRef, useState } from "react";

import {
  SERVED_LAYER_IDS,
  type ScoutModeId,
  type ServedLayerId,
} from "@location-scout/shared";

import { getHighlights, getLayer, getScores } from "../api";
import type { SavedLocation, SavedView } from "../saved/saved-locations";
import {
  PLANNING_APPLICATIONS_RETRY_MS,
  after,
  followLayer,
  followScores,
  loadingLayers,
  searchedPostcode,
  type HighlightsState,
  type LayerState,
  type LayerStates,
  type ScoresState,
} from "../useSearchArea";
import type { ComparedColumn } from "./comparison";

/** The scores and Highlights of one Search Area in one Scout Mode. */
interface Judgement {
  scores: ScoresState;
  highlights: HighlightsState;
}

const LOADING_JUDGEMENT: Judgement = {
  scores: { status: "loading" },
  highlights: { status: "loading" },
};

/**
 * What places a Saved Location's Search Area: its Location, Search Radius
 * and the postcode it was found from, which names its local geography. Two
 * Saved Locations of the same Search Area share their Layers.
 */
const areaKey = (view: SavedView) =>
  [
    String(view.location.lat),
    String(view.location.lng),
    String(view.radius),
    searchedPostcode(view) ?? "",
  ].join(",");

const judgementKey = (view: SavedView, mode: ScoutModeId) =>
  `${areaKey(view)},${mode}`;

/**
 * Loads each Saved Location compared (PRD FR-7.3) as the Location Overview
 * loads a Search Area: every Layer on its own, showing each as it arrives
 * (NFR-2.3), and its scores and Highlights in the one Scout Mode chosen. A
 * new Scout Mode loads only the scores and Highlights again, for every
 * column. What has loaded is kept while the page is open, so a Saved
 * Location compared again, or a Scout Mode chosen again, shows at once.
 */
export const useComparison = (
  compared: readonly SavedLocation[],
  mode: ScoutModeId,
): ComparedColumn[] => {
  const [areas, setAreas] = useState<Readonly<Record<string, LayerStates>>>({});
  const [judgements, setJudgements] = useState<
    Readonly<Record<string, Judgement>>
  >({});
  // The keys whose loads have started, and what stops them when the page goes.
  const started = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    const loads = started.current;
    return () => {
      current.abort();
      controller.current = null;
      loads.clear();
    };
  }, []);

  useEffect(() => {
    const signal = controller.current?.signal;
    if (!signal) return;

    for (const view of compared) {
      const { location, radius } = view;
      const postcode = searchedPostcode(view);

      const area = areaKey(view);
      if (!started.current.has(area)) {
        started.current.add(area);
        setAreas((previous) => ({ ...previous, [area]: loadingLayers() }));
        const show = (id: ServedLayerId, layer: LayerState) => {
          setAreas((previous) => {
            const layers = previous[area];
            return layers
              ? { ...previous, [area]: { ...layers, [id]: layer } }
              : previous;
          });
        };
        for (const id of SERVED_LAYER_IDS) {
          const load = () => getLayer(id, location, radius, postcode, signal);
          void followLayer(
            id,
            load().catch(() => null),
            load,
            signal,
            (layer) => {
              show(id, layer);
            },
          );
        }
      }

      const judgement = judgementKey(view, mode);
      if (!started.current.has(judgement)) {
        started.current.add(judgement);
        setJudgements((previous) => ({
          ...previous,
          [judgement]: LOADING_JUDGEMENT,
        }));
        const show = (change: Partial<Judgement>) => {
          setJudgements((previous) => {
            const shown = previous[judgement];
            return shown
              ? { ...previous, [judgement]: { ...shown, ...change } }
              : previous;
          });
        };
        const scores = () =>
          getScores(location, radius, postcode, mode, signal).catch(() => null);
        void followScores(
          scores(),
          // The Planning Applications some need are queued for their
          // provider's turn: ask again shortly, as the Overview does.
          () =>
            after(PLANNING_APPLICATIONS_RETRY_MS, signal)
              .then(scores)
              .catch(() => null),
          (loaded) => {
            show({ scores: loaded });
          },
        );
        void getHighlights(location, radius, postcode, mode, signal).then(
          (highlights) => {
            show({
              highlights: highlights.ok
                ? { status: "ok", highlights: highlights.body }
                : { status: "unavailable" },
            });
          },
          // Only an abort throws: the page has gone.
          () => undefined,
        );
      }
    }
  }, [compared, mode]);

  return compared.map((saved) => ({
    saved,
    layers: areas[areaKey(saved)] ?? loadingLayers(),
    ...(judgements[judgementKey(saved, mode)] ?? LOADING_JUDGEMENT),
  }));
};
