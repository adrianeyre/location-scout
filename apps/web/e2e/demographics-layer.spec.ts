import type { Locator, Page } from "@playwright/test";

import { drawnColour, expect, test } from "./fixtures";

/**
 * The Demographics Layer against the API's prepared-data fixture, made by
 * `pnpm data:prepare` from recordings of each source around NG17 1AA: 44
 * output areas reach into its 0.5 mile Search Area, 15 of them wholly, for
 * an estimated 9,052 residents. The real, England-wide data gives the same.
 */

/** The shades `demographic-measures.ts` fills output areas with, lightest to darkest. */
const SHADES = ["#f2a070", "#ec7d45", "#d9622a", "#ad4615", "#76300b"];

/** The opacity they are filled at. */
const FILL_OPACITY = 0.55;

/**
 * A shade as it shows on the map: filled at its opacity over the blank
 * base map, outside the Search Area, whose own faint fill tints it inside.
 */
const onMap = (shade: string) =>
  `#${[1, 3, 5]
    .map((at) =>
      Math.round(
        parseInt(shade.slice(at, at + 2), 16) * FILL_OPACITY +
          255 * (1 - FILL_OPACITY),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/**
 * Fewer pixels than this of a shade are only the edges of others, where
 * two shades blend. The map fills the page beside the floating panel, so
 * it shows more edges than when it shared the page with it: up to about
 * 3,500 of one shade, where the smallest filled one is over 12,000.
 */
const EDGES_ONLY = 5_000;

/** At least this many pixels of a shade are output areas filled with it. */
const FILLED = 8_000;

const searchNg17 = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?lat=53\.123664&lng=-1\.264078&radius=0\.5$/);
};

/** Switches every other Layer off, so none of their markers or shapes hide the shading. */
const onlyDemographics = async (page: Page) => {
  for (const name of [
    "Crime",
    "Planning",
    "Amenities",
    "Schools",
    "Transport",
    "Green space",
    "Property",
  ]) {
    await page.getByRole("checkbox", { name }).uncheck();
  }
};

/**
 * How many pixels of each shade the map draws, with the panels and markers
 * over it painted out.
 */
const drawnShades = async (page: Page, map: Locator) => {
  const masks = [
    page.getByRole("group", { name: "Layers" }),
    page.locator(".demographics-shading"),
    map.locator(".feature-cluster, .feature-marker, .location-marker"),
  ];
  const counts: number[] = [];
  for (const shade of SHADES) {
    counts.push(
      (await drawnColour(page, map, onMap(shade), masks))?.pixels ?? 0,
    );
  }
  return counts;
};

test("the Overview gives NG17 1AA's estimated population, households, median age, income, deprivation and age profile, crediting its sources under the OGL", async ({
  page,
}) => {
  await searchNg17(page);

  await expect(
    page.getByRole("checkbox", { name: "Demographics" }),
  ).toBeChecked();
  await expect(page.locator("#layer-demographics-status")).toHaveText(
    "44 output areas",
  );
  const section = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Demographics" });
  await expect(section).toContainText(
    "Estimated population: 9,052, in 3,951 households, from the 44 output areas reaching into the Search Area.",
  );
  await expect(section).toContainText("Median age: 40.1");
  await expect(section).toContainText(
    "Average household income: £38,890 a year, across the 5 MSOAs the Search Area reaches into",
  );
  await expect(section).toContainText(
    "The Location's LSOA, Ashfield 005E, is in decile 2 of 10 of the Index of Multiple Deprivation",
  );
  await expect(section).toContainText(
    "The 14 LSOAs the Search Area reaches into are in deciles 1 to 10.",
  );
  const table = section.getByRole("table", {
    name: "Estimated age profile of the Search Area",
  });
  for (const name of [
    "Under 15 1,649 18.3%",
    "15 to 24 1,038 11.5%",
    "25 to 44 2,327 25.8%",
    "45 to 64 2,247 24.9%",
    "65 and over 1,773 19.6%",
  ]) {
    await expect(table.getByRole("row", { name, exact: true })).toBeVisible();
  }
  await expect(section).toContainText(
    "From ONS Open Geography (December 2021), ONS Census 2021 (21 March 2021), ONS small area income estimates (March 2023), English Indices of Deprivation (30 October 2025).",
  );
  await expect(section).toContainText(
    "Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right 2021.",
  );
  await expect(section).toContainText(
    "English Indices of Deprivation © Crown copyright, Ministry of Housing, Communities and Local Government, licensed under the Open Government Licence v3.0.",
  );
  await expect(
    section.getByRole("link", { name: "Open Government Licence v3.0" }),
  ).toHaveAttribute(
    "href",
    "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  );
});

test("the output areas are shaded by each of the four measures, with a legend for each", async ({
  page,
}) => {
  await searchNg17(page);
  await onlyDemographics(page);
  const map = page.getByTestId("search-area-map");
  const measure = page.getByLabel("Shade output areas by");
  await expect(measure).toHaveValue("population-density");

  // For each measure, the shades NG17 1AA's output areas fall in, and those
  // none does, from the prepared fixture: by income, for example, every one
  // is in the two lightest classes.
  for (const { name, legend, filled, empty } of [
    {
      name: "Population density",
      legend: "Residents per km²",
      filled: [0, 1, 2, 3, 4],
      empty: [],
    },
    {
      name: "Median age",
      legend: "Median age, in years",
      filled: [0, 1, 2, 3, 4],
      empty: [],
    },
    {
      name: "Household income",
      legend: "Average household income a year, by MSOA",
      filled: [0, 1],
      empty: [2, 3, 4],
    },
    {
      name: "Deprivation",
      legend: "Index of Multiple Deprivation decile, by LSOA",
      filled: [2, 3, 4],
      empty: [1],
    },
  ]) {
    await measure.selectOption({ label: name });
    await expect(
      page.getByRole("list", { name: legend }).getByRole("listitem"),
    ).toHaveCount(5);

    await expect(async () => {
      const counts = await drawnShades(page, map);
      for (const shade of filled) {
        expect(
          counts[shade],
          `${name}: ${SHADES[shade] ?? ""}`,
        ).toBeGreaterThan(FILLED);
      }
      for (const shade of empty) {
        expect(counts[shade], `${name}: ${SHADES[shade] ?? ""}`).toBeLessThan(
          EDGES_ONLY,
        );
      }
    }).toPass({ timeout: 15_000 });
  }

  await expect(
    page
      .getByRole("list", {
        name: "Index of Multiple Deprivation decile, by LSOA",
      })
      .getByRole("listitem"),
  ).toHaveText([
    "9 to 10 (least deprived)",
    "7 to 8",
    "5 to 6",
    "3 to 4",
    "1 to 2 (most deprived)",
  ]);
});

test("an output area's popup gives its figures as text, and switching the Layer off takes its shading away", async ({
  page,
}) => {
  await searchNg17(page);
  await onlyDemographics(page);
  const map = page.getByTestId("search-area-map");

  const marker = map
    .locator('.feature-marker[data-layer="demographics"]')
    .first();
  await marker.click();
  const popup = page.locator(".maplibregl-popup .feature-popup");
  await expect(
    popup.getByRole("heading", { name: "Demographics" }),
  ).toBeVisible();
  await expect(popup).toContainText(/Output area E00\d{6}/);
  await expect(popup).toContainText(
    /residents and \d+ households in Census 2021/,
  );
  await expect(popup).toContainText(/Deprivation decile \d+ of 10/);
  await expect(popup).toContainText(/% of it is inside the Search Area/);

  await page.getByRole("checkbox", { name: "Demographics" }).uncheck();

  await expect(page.getByLabel("Shade output areas by")).toHaveCount(0);
  await expect(async () => {
    const counts = await drawnShades(page, map);
    for (const count of counts) expect(count).toBeLessThan(EDGES_ONLY);
  }).toPass({ timeout: 15_000 });
});
