import { describe, expect, it } from "vitest";

import {
  isCoverageResponse,
  isDatasetAttribution,
  isPreparedDataset,
  isPreparedManifest,
} from "./prepared-data";

const ashfield = { code: "E07000170", name: "Ashfield" };

const dataset = {
  id: "council-boundaries",
  name: "Council boundaries",
  source: "ONS Open Geography",
  sourceUrl:
    "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Local_Authority_Districts_May_2026_Boundaries_UK_BGC/FeatureServer/0",
  sourceDate: "2026-05",
  preparedAt: "2026-10-08T21:30:00.000Z",
};

const described = { ...dataset, attribution: null };

const attribution = {
  statements: [
    "This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry.",
    "The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063.",
  ],
  conditionsUrl:
    "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
};

const inspire = {
  ...dataset,
  id: "inspire-index-polygons",
  name: "INSPIRE Index Polygons",
  source: "HM Land Registry",
  sourceUrl:
    "https://use-land-property-data.service.gov.uk/datasets/inspire/download/Ashfield_District_Council.zip",
  sourceDate: "2026-10-04",
  attribution,
};

const manifest = {
  preparedAt: "2026-10-08T21:30:00.000Z",
  datasets: [{ ...dataset, file: "england/council-boundaries.parquet" }],
  landCoverageAreas: [
    {
      council: ashfield,
      datasets: [
        {
          ...dataset,
          id: "council-boundary",
          name: "Council boundary",
          file: "ashfield/council-boundary.parquet",
        },
        { ...inspire, file: "ashfield/inspire-index-polygons.parquet" },
      ],
    },
  ],
};

describe("isDatasetAttribution", () => {
  it("accepts INSPIRE's statements and the link to its conditions", () => {
    expect(isDatasetAttribution(attribution)).toBe(true);
  });

  it.each([
    ["no statements", { ...attribution, statements: [] }],
    ["an empty statement", { ...attribution, statements: [""] }],
    ["no link to its conditions", { ...attribution, conditionsUrl: "" }],
  ])("rejects one with %s", (_label, value) => {
    expect(isDatasetAttribution(value)).toBe(false);
  });
});

describe("isPreparedDataset", () => {
  it("accepts a dataset with its source and dates", () => {
    expect(isPreparedDataset(described)).toBe(true);
  });

  it("accepts a dataset with the statements its licence requires", () => {
    expect(isPreparedDataset(inspire)).toBe(true);
  });

  it.each(["id", "source", "sourceDate", "preparedAt"])(
    "rejects one without its %s",
    (key) => {
      expect(isPreparedDataset({ ...described, [key]: "" })).toBe(false);
    },
  );

  it.each([
    ["no attribution at all", dataset],
    ["an attribution with no statements", { ...inspire, attribution: {} }],
  ])("rejects one with %s", (_label, value) => {
    expect(isPreparedDataset(value)).toBe(false);
  });
});

describe("isPreparedManifest", () => {
  it("accepts the manifest data:prepare writes", () => {
    expect(isPreparedManifest(manifest)).toBe(true);
  });

  it("accepts a manifest written before datasets had attributions", () => {
    expect(
      isPreparedManifest({
        ...manifest,
        landCoverageAreas: [
          {
            council: ashfield,
            datasets: manifest.landCoverageAreas[0]?.datasets.slice(0, 1),
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts a manifest with no Land Coverage Areas", () => {
    expect(isPreparedManifest({ ...manifest, landCoverageAreas: [] })).toBe(
      true,
    );
  });

  it.each([
    ["no file", { ...dataset }],
    ["an absolute file", { ...dataset, file: "/etc/passwd" }],
    ["a file outside data/", { ...dataset, file: "../secret.parquet" }],
    ["a file with an empty part", { ...dataset, file: "england//x.parquet" }],
    [
      "an attribution with no statements",
      { ...inspire, file: "x.parquet", attribution: { statements: [] } },
    ],
  ])("rejects a dataset with %s", (_label, listed) => {
    expect(isPreparedManifest({ ...manifest, datasets: [listed] })).toBe(false);
  });

  it.each([
    ["null", null],
    ["no date", { ...manifest, preparedAt: undefined }],
    ["no datasets", { ...manifest, datasets: undefined }],
    [
      "a Land Coverage Area without its council",
      {
        ...manifest,
        landCoverageAreas: [{ council: { name: "Ashfield" }, datasets: [] }],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isPreparedManifest(value)).toBe(false);
  });
});

describe("isCoverageResponse", () => {
  it("accepts what is prepared, without the files", () => {
    expect(
      isCoverageResponse({
        status: "ok",
        preparedAt: manifest.preparedAt,
        datasets: [described],
        landCoverageAreas: [
          {
            council: ashfield,
            datasets: [described, inspire],
            outOfDate: false,
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts nothing prepared", () => {
    expect(
      isCoverageResponse({
        status: "not-prepared",
        preparedAt: null,
        datasets: [],
        landCoverageAreas: [],
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    [
      "a status that is not offered",
      {
        status: "missing",
        preparedAt: null,
        datasets: [],
        landCoverageAreas: [],
      },
    ],
    [
      "no Land Coverage Areas",
      { status: "not-prepared", preparedAt: null, datasets: [] },
    ],
    [
      "a dataset without its date",
      {
        status: "ok",
        preparedAt: manifest.preparedAt,
        datasets: [{ ...described, sourceDate: undefined }],
        landCoverageAreas: [],
      },
    ],
    [
      "a Land Coverage Area that doesn't say whether it is out of date",
      {
        status: "ok",
        preparedAt: manifest.preparedAt,
        datasets: [],
        landCoverageAreas: [{ council: ashfield, datasets: [described] }],
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isCoverageResponse(value)).toBe(false);
  });
});
