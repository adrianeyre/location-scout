import { describe, expect, it } from "vitest";

import { USER_AGENT } from "./arcgis";
import {
  COUNCIL_BOUNDARIES,
  boundariesQueryUrl,
  downloadCouncilBoundaries,
} from "./council-boundaries";
import { RECORDED_COUNCIL_BOUNDARIES } from "./recorded-boundaries";

const [ashfield, cardiff, mansfield] = RECORDED_COUNCIL_BOUNDARIES.features;

describe("boundariesQueryUrl", () => {
  it("asks for every council's code and name, as GeoJSON in WGS 84, from an offset", () => {
    const url = new URL(boundariesQueryUrl(2000));

    expect(`${url.origin}${url.pathname}`).toBe(
      `${COUNCIL_BOUNDARIES.url}/query`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      where: "1=1",
      outFields: "LAD26CD,LAD26NM",
      outSR: "4326",
      orderByFields: "LAD26CD",
      resultOffset: "2000",
      f: "geojson",
    });
  });
});

describe("downloadCouncilBoundaries", () => {
  it("downloads the boundaries, saying who is asking", async () => {
    const asked: { url: string; userAgent: string | null }[] = [];
    const fetchFn = ((url: string, init?: RequestInit) => {
      asked.push({
        url,
        userAgent: new Headers(init?.headers).get("user-agent"),
      });
      return Promise.resolve(Response.json(RECORDED_COUNCIL_BOUNDARIES));
    }) as typeof fetch;

    const downloaded = await downloadCouncilBoundaries(fetchFn);

    expect(downloaded.features).toEqual(RECORDED_COUNCIL_BOUNDARIES.features);
    expect(asked).toEqual([
      { url: boundariesQueryUrl(0), userAgent: USER_AGENT },
    ]);
  });

  it("asks for the next page while ONS says there are more", async () => {
    const pages = [
      {
        type: "FeatureCollection",
        features: [ashfield, cardiff],
        properties: { exceededTransferLimit: true },
      },
      { type: "FeatureCollection", features: [mansfield] },
    ];
    const asked: string[] = [];
    const fetchFn = ((url: string) => {
      asked.push(url);
      return Promise.resolve(Response.json(pages[asked.length - 1]));
    }) as typeof fetch;

    const downloaded = await downloadCouncilBoundaries(fetchFn);

    expect(downloaded.features).toEqual([ashfield, cardiff, mansfield]);
    expect(asked).toEqual([boundariesQueryUrl(0), boundariesQueryUrl(2)]);
  });

  it("fails if ONS answers with an error", async () => {
    const fetchFn = (() =>
      Promise.resolve(
        Response.json(
          { error: { code: 400, message: "Invalid URL" } },
          { status: 200 },
        ),
      )) as typeof fetch;

    await expect(downloadCouncilBoundaries(fetchFn)).rejects.toThrow(
      /did not answer with GeoJSON features/,
    );
  });
});
