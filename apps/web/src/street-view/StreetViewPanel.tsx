import { useEffect, useRef, useState } from "react";

import {
  GOOGLE_MAPS_TERMS_URL,
  STREET_VIEW_ATTRIBUTION,
  STREET_VIEW_RULES,
  distanceMetres,
  type Location,
} from "@location-scout/shared";

import { formatDistance } from "../format";
import {
  GoogleMapsError,
  KEY_REFUSED,
  bearingDegrees,
  loadStreetView,
  onKeyRefused,
  type StreetViewLibrary,
} from "./google-maps";

/** Where Street View is opened: the Location, or a Feature clicked on the map. */
export interface StreetViewTarget {
  location: Location;
  /**
   * What is there, as the panel names it: "The Location", or a Feature's
   * Layer and title, "Property: 88, High Pavement".
   */
  name: string;
}

/** What the panel shows: Google's panorama on its way, shown, missing or failed. */
type PanelState =
  | { status: "loading" }
  | { status: "shown"; metres: number }
  | { status: "none" }
  | { status: "failed"; message: string };

/** Whether Google said it has no panorama there. */
const isZeroResults = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ZERO_RESULTS";

interface StreetViewPanelProps {
  /** `GOOGLE_MAPS_API_KEY`, as `/api/street-view` gives it. */
  apiKey: string;
  target: StreetViewTarget;
  onClose: () => void;
  /** Loads Google's Street View library. Tests pass a stand-in. */
  load?: (apiKey: string) => Promise<StreetViewLibrary>;
}

/**
 * The optional Street View panel (PRD FR-2.13): Google's nearest outdoor
 * panorama within 100 m of the Location or a Feature, facing it, with
 * Google's own attribution, which is never covered, and ours beneath.
 */
export const StreetViewPanel = ({
  apiKey,
  target,
  onClose,
  load = loadStreetView,
}: StreetViewPanelProps) => {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const { lat, lng } = target.location;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let open = true;
    setState({ status: "loading" });
    const show = async () => {
      const library = await load(apiKey);
      const location = { lat, lng };
      let found;
      try {
        found = await new library.StreetViewService().getPanorama({
          location,
          radius: STREET_VIEW_RULES.searchRadiusMetres,
          preference: library.StreetViewPreference.NEAREST,
          sources: [library.StreetViewSource.OUTDOOR],
        });
      } catch (error) {
        if (isZeroResults(error)) return { status: "none" } as const;
        throw error;
      }
      const panorama = found.data.location;
      const at = panorama?.latLng && {
        lat: panorama.latLng.lat(),
        lng: panorama.latLng.lng(),
      };
      if (!panorama || !at) return { status: "none" } as const;
      if (!open) return null;
      new library.StreetViewPanorama(element, {
        pano: panorama.pano,
        pov: { heading: bearingDegrees(at, location), pitch: 0 },
        visible: true,
        motionTracking: false,
      });
      return { status: "shown", metres: distanceMetres(at, location) } as const;
    };
    show().then(
      (shown) => {
        if (open && shown) setState(shown);
      },
      (error: unknown) => {
        if (!open) return;
        setState({
          status: "failed",
          message:
            error instanceof GoogleMapsError
              ? error.message
              : "Google's Street View didn't answer. Please try again shortly.",
        });
      },
    );
    const stopListening = onKeyRefused(() => {
      if (open) setState({ status: "failed", message: KEY_REFUSED });
    });
    return () => {
      open = false;
      stopListening();
      // Google has no way to remove a panorama but to take it off the page.
      element.replaceChildren();
    };
  }, [apiKey, lat, lng, load]);

  return (
    <section
      className="street-view-panel"
      aria-labelledby="street-view-heading"
      data-status={state.status}
    >
      <div className="street-view-header">
        <h2 id="street-view-heading">Street View</h2>
        <p className="street-view-target">{target.name}</p>
        <button type="button" onClick={onClose}>
          Close Street View
        </button>
      </div>
      {state.status === "loading" && (
        <p className="street-view-message" role="status">
          Loading Street View…
        </p>
      )}
      {state.status === "shown" && (
        <p className="street-view-message" role="status">
          From Google&apos;s nearest panorama, {formatDistance(state.metres)}{" "}
          away, facing it.
        </p>
      )}
      {state.status === "none" && (
        <p className="street-view-message" role="status">
          Google has no Street View within{" "}
          {String(STREET_VIEW_RULES.searchRadiusMetres)} m of this point.
        </p>
      )}
      {state.status === "failed" && (
        <p className="street-view-message" role="alert">
          {state.message}
        </p>
      )}
      {/* Never hidden: Google sizes its panorama to it as it is made. */}
      <div
        ref={container}
        className="street-view-panorama"
        role="region"
        aria-label="Street View panorama"
      />
      <p className="street-view-attribution" translate="no">
        {STREET_VIEW_ATTRIBUTION}.{" "}
        <a
          href={GOOGLE_MAPS_TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms
        </a>
      </p>
    </section>
  );
};
