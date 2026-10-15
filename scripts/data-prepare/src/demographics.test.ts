import { describe, expect, it } from "vitest";

import { CENSUS_AGE_BANDS } from "@location-scout/shared";

import { arcGisQueryUrl } from "./arcgis";
import {
  CENSUS_2021,
  OUTPUT_AREAS_QUERY,
  OUTPUT_AREA_BOUNDARIES,
  OUTPUT_AREA_LOOKUP_QUERY,
  ageBandColumn,
  censusTableMember,
  censusTableUrl,
} from "./demographics";

const paramsOf = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("OUTPUT_AREAS_QUERY", () => {
  it("asks for England's output areas' outlines, as GeoJSON in WGS 84 to six decimal places, from an offset", () => {
    const url = arcGisQueryUrl(OUTPUT_AREAS_QUERY, 4000);

    expect(url.startsWith(`${OUTPUT_AREA_BOUNDARIES.url}/query?`)).toBe(true);
    expect(paramsOf(url)).toEqual({
      where: "OA21CD LIKE 'E%'",
      outFields: "OA21CD",
      outSR: "4326",
      geometryPrecision: "6",
      orderByFields: "OA21CD",
      resultOffset: "4000",
      f: "geojson",
    });
  });
});

describe("OUTPUT_AREA_LOOKUP_QUERY", () => {
  it("asks for the LSOA and MSOA of each English output area", () => {
    const url = arcGisQueryUrl(OUTPUT_AREA_LOOKUP_QUERY, 0);

    expect(url.startsWith(`${OUTPUT_AREA_BOUNDARIES.lookupUrl}/query?`)).toBe(
      true,
    );
    expect(paramsOf(url)).toEqual({
      where: "OA21CD LIKE 'E%'",
      outFields: "OA21CD,LSOA21CD,LSOA21NM,MSOA21CD,MSOA21NM",
      orderByFields: "OA21CD",
      resultOffset: "0",
      f: "geojson",
    });
  });
});

describe("Census 2021's tables", () => {
  it("are each Nomis's bulk download, with a CSV by output area", () => {
    expect(censusTableUrl("ts001")).toBe(
      "https://www.nomisweb.co.uk/output/census/2021/census2021-ts001.zip",
    );
    expect(censusTableMember("ts007a")).toBe("census2021-ts007a-oa.csv");
    expect(Object.values(CENSUS_2021.tables).map(({ table }) => table)).toEqual(
      ["ts001", "ts041", "ts006", "ts007a"],
    );
  });

  it("name each age band's column as Nomis does", () => {
    expect(CENSUS_AGE_BANDS.map(ageBandColumn)).toEqual([
      "Age: Aged 4 years and under",
      ...Array.from(
        { length: 16 },
        (_, band) =>
          `Age: Aged ${String(band * 5 + 5)} to ${String(band * 5 + 9)} years`,
      ),
      "Age: Aged 85 years and over",
    ]);
  });
});
