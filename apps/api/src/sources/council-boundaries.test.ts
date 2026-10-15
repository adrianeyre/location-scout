import { describe, expect, it, vi } from "vitest";

import type { PreparedManifest } from "@location-scout/shared";

import { PREPARED_DATA_FIXTURE } from "../testing/app";
import { noNetwork } from "../testing/fetch-stubs";
import { councilAt, councilReport } from "./council-boundaries";
import { NotPreparedError, createSourceCaller } from "./data-source";
import type { PreparedData } from "./prepared-data";

const NG17_1AA = { lat: 53.123664, lng: -1.264078 };

describe("councilAt", () => {
  it("finds the council a Location is in from the prepared boundaries, with the date they are as at", async () => {
    const fetchMock = noNetwork();

    const result = await councilAt(
      NG17_1AA,
      createSourceCaller({ fetch: fetchMock }),
      PREPARED_DATA_FIXTURE,
    );

    expect(result).toEqual({
      status: "ok",
      data: {
        council: { code: "E07000170", name: "Ashfield" },
        inLandCoverageArea: true,
      },
      period: { from: "2026-05", to: "2026-05" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not prepared when the manifest lists no council boundaries", async () => {
    const manifest = await PREPARED_DATA_FIXTURE.manifest();
    const withoutBoundaries: PreparedData = {
      manifest: () =>
        Promise.resolve<PreparedManifest>({ ...manifest, datasets: [] }),
      query: vi.fn<PreparedData["query"]>(),
    };

    const result = await councilAt(
      NG17_1AA,
      createSourceCaller({ fetch: noNetwork() }),
      withoutBoundaries,
    );

    expect(result).toEqual({ status: "not-prepared" });
    expect(withoutBoundaries.query).not.toHaveBeenCalled();
  });

  it("reads the boundaries every time rather than caching them", async () => {
    const manifest = vi.fn(() =>
      Promise.reject(new NotPreparedError("Nothing is prepared.")),
    );
    const callSource = createSourceCaller({ fetch: noNetwork() });
    const prepared: PreparedData = { manifest, query: vi.fn() };

    await councilAt(NG17_1AA, callSource, prepared);
    await councilAt(NG17_1AA, callSource, prepared);

    expect(manifest).toHaveBeenCalledTimes(2);
  });
});

describe("councilReport", () => {
  it("gives the council found", () => {
    expect(
      councilReport({
        status: "ok",
        data: { council: null, inLandCoverageArea: false },
        period: null,
      }),
    ).toEqual({ status: "ok", council: null, inLandCoverageArea: false });
  });

  it.each(["unavailable", "not-prepared"] as const)(
    "gives no council when %s",
    (status) => {
      expect(councilReport({ status })).toEqual({
        status,
        council: null,
        inLandCoverageArea: false,
      });
    },
  );
});
