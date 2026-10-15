import { useEffect, useState } from "react";

import type { LandParcelResponse } from "@location-scout/shared";

import { getLandParcel } from "./api";

/** A Land Parcel's details, that they are on their way, or why there are none. */
export type LandParcelState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "ok"; parcel: LandParcelResponse };

/**
 * Loads the Land Opportunity chosen in the Land panel, with the INSPIRE
 * Index Polygons that overlap it (PRD FR-5.6), or nothing while none is
 * chosen.
 */
export const useLandParcel = (id: string | null) => {
  const [loaded, setLoaded] = useState<{
    id: string;
    state: LandParcelState;
  } | null>(null);

  useEffect(() => {
    if (id === null) return;
    const controller = new AbortController();
    getLandParcel(id, controller.signal).then(
      (parcel) => {
        setLoaded({
          id,
          state: parcel.ok
            ? { status: "ok", parcel: parcel.body }
            : { status: "unavailable", message: parcel.message },
        });
      },
      // Only an abort throws: another was chosen.
      () => undefined,
    );
    return () => {
      controller.abort();
    };
  }, [id]);

  if (id === null) return null;
  return loaded?.id === id ? loaded.state : ({ status: "loading" } as const);
};
