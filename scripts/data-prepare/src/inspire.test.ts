import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import onsCouncils from "./fixtures/ons-council-names.json" with { type: "json" };
import {
  inspireAttribution,
  inspireDownloads,
  inspireFileFor,
  tidyName,
} from "./inspire";

const downloadPage = () =>
  readFile(
    new URL("./fixtures/inspire-download.html", import.meta.url),
    "utf8",
  );

/** England's 296 councils, as ONS Open Geography named them in May 2026. */
const ENGLISH_COUNCILS = onsCouncils.features.map(({ attributes }) => ({
  code: attributes.LAD26CD,
  name: attributes.LAD26NM,
}));

describe("inspireDownloads", () => {
  it("reads the day the files were published, and every local authority's file", async () => {
    const { publishedOn, files } = inspireDownloads(await downloadPage());

    expect(publishedOn).toBe("2026-10-04");
    expect(files).toHaveLength(318);
    expect(files).toContainEqual({
      name: "Ashfield District Council",
      url: "https://use-land-property-data.service.gov.uk/datasets/inspire/download/Ashfield_District_Council.zip",
    });
  });

  it.each([
    ["no date", "<table></table>"],
    [
      "no files",
      "<p>This dataset was published on 4 October 2026.</p><table></table>",
    ],
  ])(
    "refuses a page with %s, saying its layout may have changed",
    (_label, html) => {
      expect(() => inspireDownloads(html)).toThrow(
        /download page is not as it was.*layout may have changed/,
      );
    },
  );
});

describe("tidyName", () => {
  it.each([
    ["Ashfield District Council", "Ashfield"],
    ["London Borough of Barking and Dagenham", "Barking and Dagenham"],
    ["Royal Borough of Kingston upon Thames", "Kingston upon Thames"],
    ["City of London Corporation", "City of London"],
    ["City of Westminster", "Westminster"],
    ["Bristol City Council", "Bristol, City of"],
    ["Herefordshire Council", "Herefordshire, County of"],
    [
      "Bournemouth Christchurch and Poole Council",
      "Bournemouth, Christchurch and Poole",
    ],
    ["St Helens Council", "St. Helens"],
    ["Council of the Isles of Scilly", "Isles of Scilly"],
    ["The North Yorkshire Council", "North Yorkshire"],
  ])("tidies HM Land Registry's %s as ONS's %s", (theirs, ons) => {
    expect(tidyName(theirs)).toBe(tidyName(ons));
  });
});

describe("inspireFileFor", () => {
  it("finds one file for each of England's 296 councils, a different one for each", async () => {
    const { files } = inspireDownloads(await downloadPage());

    const found = ENGLISH_COUNCILS.map((council) =>
      inspireFileFor(council, files),
    );

    expect(ENGLISH_COUNCILS).toHaveLength(296);
    expect(found.filter((file) => file === null)).toEqual([]);
    expect(new Set(found.map((file) => file?.url)).size).toBe(296);
  });

  it.each([
    ["E07000170", "Ashfield", "Ashfield District Council"],
    ["E06000023", "Bristol, City of", "Bristol City Council"],
    ["E06000010", "Kingston upon Hull, City of", "Hull City Council"],
    ["E06000047", "County Durham", "Durham County Council"],
    [
      "E07000146",
      "King's Lynn and West Norfolk",
      "Borough Council of Kings Lynn and West Norfolk",
    ],
    ["E09000001", "City of London", "City of London Corporation"],
  ])("finds %s %s's file, %s", async (code, name, theirs) => {
    const { files } = inspireDownloads(await downloadPage());

    expect(inspireFileFor({ code, name }, files)?.name).toBe(theirs);
  });

  it("finds none for a council the page doesn't list", async () => {
    const { files } = inspireDownloads(await downloadPage());

    expect(
      inspireFileFor(
        { code: "E07000170", name: "Ashfield" },
        files.filter(({ name }) => !name.startsWith("Ashfield")),
      ),
    ).toBeNull();
  });
});

describe("inspireAttribution", () => {
  it("gives HM Land Registry's and Ordnance Survey's statements for the year the polygons were published, and a link to the conditions (PRD FR-10.2)", () => {
    expect(inspireAttribution("2027-01-03")).toEqual({
      statements: [
        "This information is subject to Crown copyright and database rights 2027 and is reproduced with the permission of HM Land Registry.",
        "The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2027 Ordnance Survey AC0000851063.",
      ],
      conditionsUrl:
        "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
    });
  });
});
