import type { DataPeriod, LayerId } from "@location-scout/shared";

import type { AreaSource } from "../sources/area-sources";
import { DAY_MS } from "../sources/data-source";

/**
 * A made-up area source that reads one JSON body from `url` through the
 * caller, for testing how `/api/area` treats its sources.
 */
export const jsonAreaSource = (
  id: string,
  layers: readonly LayerId[],
  url: string,
  period: DataPeriod | null = null,
): AreaSource => {
  const source = { id, name: `${id} source`, cacheTtlMs: DAY_MS };
  return {
    source,
    layers,
    load: (_area, callSource) =>
      callSource(source, url, async ({ fetch, signal }) => {
        const response = await fetch(url, { signal });
        const data: unknown = await response.json();
        return { data, period };
      }),
  };
};
