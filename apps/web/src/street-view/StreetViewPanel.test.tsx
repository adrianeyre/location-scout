import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GoogleMapsError,
  SCRIPT_FAILED,
  resetGoogleMapsForTests,
  type PanoramaFound,
  type PanoramaOptions,
  type StreetViewLibrary,
} from "./google-maps";
import { StreetViewPanel } from "./StreetViewPanel";

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };
/** A panorama about 20 m due south of NG17 1AA. */
const SOUTH_OF_NG17_1AA = { lat: 53.123484, lng: -1.264078 };

/**
 * A stand-in for Google's `streetView` library: its service finds `found`,
 * or fails with `error`, and each panorama made is recorded.
 */
const fakeLibrary = ({
  found = SOUTH_OF_NG17_1AA,
  error,
}: { found?: { lat: number; lng: number }; error?: Error } = {}) => {
  const panoramas: { container: HTMLElement; options: PanoramaOptions }[] = [];
  const requests: unknown[] = [];
  const library: StreetViewLibrary = {
    StreetViewPanorama: class {
      readonly pano: string;
      constructor(container: HTMLElement, options: PanoramaOptions) {
        this.pano = options.pano;
        container.textContent = `Panorama ${options.pano}`;
        panoramas.push({ container, options });
      }
    },
    StreetViewService: class {
      getPanorama = (request: unknown): Promise<PanoramaFound> => {
        requests.push(request);
        if (error) return Promise.reject(error);
        return Promise.resolve({
          data: {
            location: {
              pano: "pano-ng17",
              latLng: { lat: () => found.lat, lng: () => found.lng },
            },
          },
        });
      };
    },
    StreetViewPreference: { NEAREST: "nearest" },
    StreetViewSource: { OUTDOOR: "outdoor" },
  };
  return { library, panoramas, requests };
};

/** Google says it has no panorama there: its error's code is ZERO_RESULTS. */
const zeroResults = Object.assign(new Error("No panorama"), {
  code: "ZERO_RESULTS",
});

const panel = () => screen.getByRole("region", { name: "Street View" });

afterEach(() => {
  cleanup();
  resetGoogleMapsForTests();
});

describe("StreetViewPanel", () => {
  it("opens Google's nearest outdoor panorama within 100 m of the Location, facing it", async () => {
    const { library, panoramas, requests } = fakeLibrary();
    const load = vi.fn(() => Promise.resolve(library));

    render(
      <StreetViewPanel
        apiKey="AIzaSyTestKey"
        target={{ location: NG17_1AA, name: "The Location" }}
        onClose={vi.fn()}
        load={load}
      />,
    );

    expect(within(panel()).getByRole("heading").textContent).toBe(
      "Street View",
    );
    expect(within(panel()).getByText("The Location")).toBeTruthy();
    expect(within(panel()).getByRole("status").textContent).toBe(
      "Loading Street View…",
    );
    expect(
      await within(panel()).findByText(
        "From Google's nearest panorama, 20 m away, facing it.",
      ),
    ).toBeTruthy();
    expect(load).toHaveBeenCalledExactlyOnceWith("AIzaSyTestKey");
    expect(requests).toEqual([
      {
        location: NG17_1AA,
        radius: 100,
        preference: "nearest",
        sources: ["outdoor"],
      },
    ]);
    expect(panoramas).toHaveLength(1);
    const [{ container, options } = { options: null }] = panoramas;
    expect(container).toBe(
      screen.getByRole("region", { name: "Street View panorama" }),
    );
    expect(options).toMatchObject({
      pano: "pano-ng17",
      pov: { pitch: 0 },
      visible: true,
      motionTracking: false,
    });
    // It was taken south of the Location, so it faces north.
    expect(options?.pov.heading).toBeCloseTo(0, 1);
  });

  it("credits Google Maps, as written, and links to its terms", () => {
    const { library } = fakeLibrary();

    render(
      <StreetViewPanel
        apiKey="AIzaSyTestKey"
        target={{ location: NG17_1AA, name: "The Location" }}
        onClose={vi.fn()}
        load={() => Promise.resolve(library)}
      />,
    );

    const credit = panel().querySelector(".street-view-attribution");
    expect(credit?.textContent).toBe("Street View imagery: Google Maps. Terms");
    expect(credit?.getAttribute("translate")).toBe("no");
    expect(
      within(panel()).getByRole("link", { name: "Terms" }).getAttribute("href"),
    ).toBe("https://www.google.com/intl/en-GB_ALL/help/terms_maps/");
  });

  it("says when Google has no Street View within 100 m, and shows no panorama", async () => {
    const { library, panoramas } = fakeLibrary({ error: zeroResults });

    render(
      <StreetViewPanel
        apiKey="AIzaSyTestKey"
        target={{ location: NG17_1AA, name: "Crime: Shoplifting" }}
        onClose={vi.fn()}
        load={() => Promise.resolve(library)}
      />,
    );

    expect(
      await within(panel()).findByText(
        "Google has no Street View within 100 m of this point.",
      ),
    ).toBeTruthy();
    expect(within(panel()).getByText("Crime: Shoplifting")).toBeTruthy();
    expect(panoramas).toEqual([]);
  });

  it("says when Google's script can't be loaded", async () => {
    render(
      <StreetViewPanel
        apiKey="AIzaSyTestKey"
        target={{ location: NG17_1AA, name: "The Location" }}
        onClose={vi.fn()}
        load={() => Promise.reject(new GoogleMapsError(SCRIPT_FAILED))}
      />,
    );

    expect((await within(panel()).findByRole("alert")).textContent).toBe(
      SCRIPT_FAILED,
    );
  });

  it("says when Google's Street View doesn't answer", async () => {
    const { library } = fakeLibrary({ error: new Error("UNKNOWN_ERROR") });

    render(
      <StreetViewPanel
        apiKey="AIzaSyTestKey"
        target={{ location: NG17_1AA, name: "The Location" }}
        onClose={vi.fn()}
        load={() => Promise.resolve(library)}
      />,
    );

    expect((await within(panel()).findByRole("alert")).textContent).toBe(
      "Google's Street View didn't answer. Please try again shortly.",
    );
  });

  it("says when Google refuses the key", async () => {
    const { library } = fakeLibrary();
    // The real loader sets up gm_authFailure, which Google's script calls.
    const { loadStreetView } = await import("./google-maps");
    void loadStreetView("AIzaSyWrongKey").catch(() => undefined);

    render(
      <StreetViewPanel
        apiKey="AIzaSyWrongKey"
        target={{ location: NG17_1AA, name: "The Location" }}
        onClose={vi.fn()}
        load={() => Promise.resolve(library)}
      />,
    );
    await within(panel()).findByText(
      "From Google's nearest panorama, 20 m away, facing it.",
    );
    window.gm_authFailure?.();

    expect((await within(panel()).findByRole("alert")).textContent).toBe(
      "Google refused GOOGLE_MAPS_API_KEY. Check it is a key for the Maps JavaScript API that allows this page, then restart the API.",
    );
  });

  it("opens again where it is moved to, and closes when asked", async () => {
    const { library, panoramas } = fakeLibrary();
    const onClose = vi.fn();
    const { rerender } = render(
      <StreetViewPanel
        apiKey="AIzaSyTestKey"
        target={{ location: NG17_1AA, name: "The Location" }}
        onClose={onClose}
        load={() => Promise.resolve(library)}
      />,
    );
    await within(panel()).findByText(/From Google's nearest panorama/);

    rerender(
      <StreetViewPanel
        apiKey="AIzaSyTestKey"
        target={{
          location: { lat: 53.1243, lng: -1.264078 },
          name: "Crime: Shoplifting",
        }}
        onClose={onClose}
        load={() => Promise.resolve(library)}
      />,
    );
    expect(await within(panel()).findByText(/90 m away/)).toBeTruthy();
    expect(panoramas).toHaveLength(2);
    // It was taken south of the crime, so it faces north.
    expect(panoramas[1]?.options.pov.heading).toBeCloseTo(0, 1);

    await userEvent
      .setup()
      .click(
        within(panel()).getByRole("button", { name: "Close Street View" }),
      );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
