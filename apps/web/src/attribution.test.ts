import { describe, expect, it } from "vitest";

import {
  EPC_ATTRIBUTION,
  STREET_VIEW_ATTRIBUTION,
  titleAttribution,
  type LayerResponse,
  type PreparedDataset,
} from "@location-scout/shared";

import readme from "../../../README.md?raw";
import guide from "../../../docs/guides/data-sources-and-attribution.md?raw";

import {
  ANY_YEAR,
  EPC_CREDIT,
  FOOTER_CREDIT,
  SOURCE_CREDITS,
  creditText,
  featureCredits,
  historicEnglandCredit,
  planningApplicationsCredit,
  pricePaidCredit,
  type Credit,
} from "./attribution";
import type { LayerFeature } from "./layers/layer-styles";
import type { CoverageState } from "./useCoverage";

const texts = (credits: readonly Credit[]) => credits.map(creditText);

/** Markdown's links as their words, and its line breaks as spaces. */
const plain = (markdown: string) =>
  markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ");

/** The guide's Attribution section, which the README sends readers to. */
const guideAttribution = guide.slice(guide.indexOf("## Attribution"));

const PLANIT = {
  id: "planit",
  name: "PlanIt",
  url: "https://www.planit.org.uk/",
};

const NO_COVERAGE: CoverageState = { status: "loading" };

/** A Layer's response, with only what its credits read. */
const layer = (response: Record<string, unknown>) =>
  ({
    status: "ok",
    features: [],
    statistics: null,
    ...response,
  }) as unknown as LayerResponse;

const feature = (value: Record<string, unknown>) =>
  value as unknown as LayerFeature;

describe("credits", () => {
  it("give PRD FR-10.1's credit in the footer", () => {
    expect(creditText(FOOTER_CREDIT)).toBe(
      "© OpenStreetMap contributors (ODbL). police.uk, HM Land Registry and planning.data.gov.uk data under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.",
    );
  });

  it("say what the shared statements say, with their links", () => {
    expect(creditText(EPC_CREDIT)).toBe(EPC_ATTRIBUTION);
    const streetView = SOURCE_CREDITS.find(
      ({ name }) => name === "Google Street View",
    );
    expect(creditText(streetView?.credit ?? [])).toBe(
      `${STREET_VIEW_ATTRIBUTION}. Terms`,
    );
    const titles = SOURCE_CREDITS.find(({ name }) => name.includes("CCOD"));
    expect(creditText(titles?.credit ?? [])).toContain(
      titleAttribution(ANY_YEAR),
    );
  });

  it("give HM Land Registry's wording for Price Paid, with its address conditions (PRD FR-10.3)", () => {
    expect(creditText(pricePaidCredit("2026"))).toBe(
      "Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under the Open Government Licence v3.0. Price Paid Data contains address data processed against Ordnance Survey’s AddressBase Premium product, which incorporates Royal Mail’s PAF® database (Address Data). Royal Mail and Ordnance Survey permit its use for personal and/or non-commercial use, and to display for the purpose of providing residential property price information services.",
    );
  });

  it("give Historic England's statement, dated the day its data was obtained", () => {
    expect(creditText(historicEnglandCredit("2026-10-08"))).toBe(
      "Conservation areas and listed buildings: © Historic England 2026. Contains Ordnance Survey data © Crown copyright and database right 2026. The Historic England GIS Data contained in this material was obtained on 8 October 2026. The most publicly available up to date Historic England GIS Data can be obtained from HistoricEngland.org.uk.",
    );
  });

  it("give PlanIt's postcode statement only for PlanIt", () => {
    expect(creditText(planningApplicationsCredit(PLANIT, "2026-10-08"))).toBe(
      "Planning Applications from PlanIt, as it had them on 8 October 2026. Locations PlanIt looks up from postcodes contain OS data © Crown copyright and database right, Royal Mail data © Royal Mail copyright and database right, and National Statistics data © Crown copyright and database right, under the Open Government Licence v3.0.",
    );
    expect(
      creditText(
        planningApplicationsCredit({
          id: "planwire",
          name: "PlanWire",
          url: "https://planwire.io/",
        }),
      ),
    ).toBe("Planning Applications from PlanWire.");
  });

  it("link only to secure addresses", () => {
    const links = [
      ...FOOTER_CREDIT,
      ...SOURCE_CREDITS.flatMap(({ credit }) => credit),
    ].flatMap((part) => (typeof part === "string" ? [] : [part.url]));
    expect(links.length).toBeGreaterThan(20);
    for (const url of links) expect(url).toMatch(/^https:\/\//);
  });
});

describe("the README and the guide", () => {
  it("give the footer's credit", () => {
    expect(plain(readme)).toContain(creditText(FOOTER_CREDIT));
  });

  it.each(SOURCE_CREDITS.map(({ name, credit }) => [name, credit] as const))(
    "credit %s as the app does, linking where it links",
    (_name, credit) => {
      expect(plain(guideAttribution)).toContain(creditText(credit));
      for (const part of credit) {
        if (typeof part !== "string")
          expect(guideAttribution).toContain(part.url);
      }
    },
  );
});

describe("featureCredits", () => {
  it("credits a crime to police.uk", () => {
    const credits = featureCredits(
      layer({ layer: "crime", sources: [] }),
      NO_COVERAGE,
    );
    expect(texts(credits(feature({ category: "shoplifting" })))).toEqual([
      "Crime data from police.uk, licensed under the Open Government Licence v3.0.",
    ]);
  });

  it("credits a Planning Constraint to planning.data.gov.uk and Historic England, and a Planning Application to its provider", () => {
    const credits = featureCredits(
      layer({
        layer: "planning",
        sources: [
          {
            id: "planning-data",
            name: "planning.data.gov.uk",
            status: "ok",
            period: { from: "2026-10-09", to: "2026-10-09" },
          },
        ],
        applications: {
          status: "ok",
          provider: PLANIT,
          period: { from: "2023-10-09", to: "2026-10-08" },
        },
      }),
      NO_COVERAGE,
    );
    expect(texts(credits(feature({ coversLocation: false })))).toEqual([
      "Planning Constraints from planning.data.gov.uk, licensed under the Open Government Licence v3.0.",
      creditText(historicEnglandCredit("2026-10-09")),
    ]);
    expect(texts(credits(feature({ applicationType: "householder" })))).toEqual(
      [creditText(planningApplicationsCredit(PLANIT))],
    );
  });

  it("credits OpenStreetMap's Features to its contributors", () => {
    for (const id of ["amenities", "transport", "green-space"]) {
      const credits = featureCredits(
        layer({ layer: id, sources: [] }),
        NO_COVERAGE,
      );
      expect(texts(credits(feature({})))).toEqual([
        "Map data © OpenStreetMap contributors, ODbL, from the Overpass API.",
      ]);
    }
  });

  it("credits a sale to Price Paid, of the year of its latest data, and to the EPC register where one matched", () => {
    const credits = featureCredits(
      layer({
        layer: "property",
        sources: [
          {
            id: "land-registry",
            name: "HM Land Registry Price Paid",
            status: "ok",
            period: { from: "2025-10-09", to: "2026-10-08" },
          },
        ],
      }),
      NO_COVERAGE,
    );
    const pricePaid = creditText(pricePaidCredit("2026"));
    expect(texts(credits(feature({ epc: null })))).toEqual([pricePaid]);
    expect(texts(credits(feature({ epc: { status: "matched" } })))).toEqual([
      pricePaid,
      EPC_ATTRIBUTION,
    ]);
  });

  it("credits a Land Opportunity to its Land Coverage Area's datasets", () => {
    const dataset = (
      id: string,
      attribution: PreparedDataset["attribution"] = null,
    ): PreparedDataset => ({
      id,
      name: id === "inspire-index-polygons" ? "INSPIRE Index Polygons" : id,
      source: "",
      sourceUrl: "",
      sourceDate: "2026-10-04",
      preparedAt: "2026-10-08T12:00:00.000Z",
      attribution,
    });
    const coverage: CoverageState = {
      status: "ok",
      coverage: {
        datasets: [],
        landCoverageAreas: [
          {
            council: { code: "E07000170", name: "Ashfield" },
            outOfDate: false,
            datasets: [
              dataset("inspire-index-polygons", {
                statements: ["Statement one.", "Statement two."],
                conditionsUrl: "https://example.gov.uk/conditions",
              }),
              dataset("conservation-area"),
            ],
          },
        ],
      },
    } as unknown as CoverageState;
    const credits = featureCredits(
      layer({
        layer: "land",
        sources: [],
        landCoverageAreas: [{ code: "E07000170", name: "Ashfield" }],
      }),
      coverage,
    );
    expect(texts(credits(feature({})))).toEqual([
      "Map data © OpenStreetMap contributors, ODbL, from Geofabrik's extracts, which Land Parcels are built from.",
      "Planning Constraints from planning.data.gov.uk's bulk files, licensed under the Open Government Licence v3.0.",
      creditText(historicEnglandCredit("2026-10-04")),
      "INSPIRE Index Polygons: Statement one. Statement two. Conditions of use.",
    ]);
  });

  it("credits a school to GIAS and Ofsted", () => {
    const credits = featureCredits(
      layer({ layer: "schools", sources: [] }),
      NO_COVERAGE,
    );
    expect(texts(credits(feature({})))).toEqual([
      "Contains public sector information from the Department for Education's Get Information about Schools and Ofsted, licensed under the Open Government Licence v3.0.",
    ]);
  });

  it("credits an output area to ONS and MHCLG", () => {
    const credits = featureCredits(
      layer({ layer: "demographics", sources: [] }),
      NO_COVERAGE,
    );
    expect(texts(credits(feature({})))).toEqual([
      "Census, boundary and income data: Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2021. English Indices of Deprivation © Crown copyright, Ministry of Housing, Communities and Local Government, licensed under the Open Government Licence v3.0.",
    ]);
  });
});
