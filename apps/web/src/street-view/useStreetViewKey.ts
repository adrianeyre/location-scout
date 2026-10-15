import { useEffect, useState } from "react";

import { getStreetView } from "../api";

/**
 * Asks the backend once whether the Street View panel is on (PRD FR-2.13).
 * Gives `GOOGLE_MAPS_API_KEY` if it is, or `null` while it is being asked,
 * if it is off or if the backend didn't answer: the panel is hidden, and
 * nothing is loaded from Google.
 */
export const useStreetViewKey = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getStreetView(controller.signal).then(
      (streetView) => {
        if (streetView.ok && streetView.body.enabled) {
          setApiKey(streetView.body.apiKey);
        }
      },
      // Only an abort throws: the page has gone.
      () => undefined,
    );
    return () => {
      controller.abort();
    };
  }, []);

  return apiKey;
};
