import { expect, test } from "./fixtures";

/**
 * The fixture-backed API reads a tiny prepared-data fixture instead of
 * `data/`: England's council boundaries are Ashfield's and Mansfield's, and
 * Ashfield is the one Land Coverage Area, as `pnpm data:prepare` makes it the
 * first time, with its land data from recordings of 9 October 2026: its
 * INSPIRE Index Polygons published on 4 October 2026, and OpenStreetMap's
 * and planning.data.gov.uk's data as at 8 October 2026, the day the API
 * takes it to be, so none is out of date. It was prepared with a key for
 * CCOD and OCOD, whose made-up titles HM Land Registry's stubbed API gave as
 * published on 2 October 2026.
 */

test("NG17 1AA is in Ashfield, a Land Coverage Area, from the prepared boundaries, with their dates", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  const section = page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Land Coverage Area" });
  await expect(section.getByRole("definition")).toHaveText("Ashfield");
  await expect(section).toContainText(
    "Ashfield is a Land Coverage Area: its land data was prepared on 8 October 2026.",
  );
  await expect(section).toContainText(
    "Council boundaries from ONS Open Geography, as at May 2026, prepared on 8 October 2026.",
  );
});

test("Ashfield's land data gives each source's date and credits INSPIRE Index Polygons as HM Land Registry requires", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Postcode or address").fill("NG17 1AA");
  await page.getByRole("button", { name: "Search" }).click();

  const section = page.getByRole("region", { name: "Land Coverage Area" });
  await expect(
    section.getByRole("list", { name: "Land data" }).getByRole("listitem"),
  ).toHaveText([
    "INSPIRE Index Polygons: HM Land Registry, published on 4 October 2026",
    "Land use, Buildings, Roads, Water, Land Parcels: OpenStreetMap via Geofabrik, as at 8 October 2026",
    "Conservation areas, Listed buildings, Listed building outlines, Article 4 direction areas, Tree preservation zones, Flood risk zones: planning.data.gov.uk, as at 8 October 2026",
    "Postcodes: Ordnance Survey's Code-Point Open, as at August 2026",
    "UK companies that own property in England and Wales, Overseas companies that own property in England and Wales: HM Land Registry, published on 2 October 2026",
  ]);
  const inspire = section.getByText(/^INSPIRE Index Polygons: This/);
  await expect(inspire).toHaveText(
    "INSPIRE Index Polygons: This information is subject to Crown copyright and database rights 2026 and is reproduced with the permission of HM Land Registry. The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063. Conditions of use.",
  );
  await expect(
    inspire.getByRole("link", { name: "Conditions of use" }),
  ).toHaveAttribute(
    "href",
    "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
  );
  // Code-Point Open places the land sales near its Land Opportunities.
  await expect(section.getByText(/^Postcodes: Contains OS data/)).toHaveText(
    "Postcodes: Contains OS data © Crown copyright and database right 2026. Contains Royal Mail data © Royal Mail copyright and database right 2026. Contains National Statistics data © Crown copyright and database right 2026. Conditions of use.",
  );
  // Published on 4 October 2026, they are not 2 months old on 8 October.
  await expect(section).not.toContainText("Out of date");
});

test("a Location in Mansfield is in a council whose land data isn't prepared", async ({
  page,
}) => {
  await page.goto("/?lat=53.1435&lng=-1.1985&radius=0.5");

  const section = page.getByRole("region", { name: "Land Coverage Area" });
  await expect(section.getByRole("definition")).toHaveText("Mansfield");
  await expect(section).toContainText(
    'Land data not prepared for this area. Add Mansfield with pnpm data:prepare --area "Mansfield".',
  );
});

test("/api/coverage lists the prepared datasets and Land Coverage Areas with their dates", async ({
  page,
}) => {
  const response = await page.request.get("/api/coverage");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    status: "ok",
    preparedAt: "2026-10-08T12:00:00.000Z",
    datasets: [
      {
        id: "council-boundaries",
        source: "ONS Open Geography",
        sourceDate: "2026-05",
      },
      {
        id: "output-area-boundaries",
        source: "ONS Open Geography",
        sourceDate: "2021-12",
      },
      {
        id: "census-2021",
        source: "ONS Census 2021",
        sourceDate: "2021-03-21",
      },
      {
        id: "income-estimates",
        source: "ONS small area income estimates",
        sourceDate: "2023-03",
      },
      {
        id: "indices-of-deprivation",
        source: "English Indices of Deprivation",
        sourceDate: "2025-10-30",
      },
      {
        id: "schools",
        source: "Get Information about Schools",
        sourceDate: "2026-10-09",
      },
      {
        id: "ofsted-inspections",
        source: "Ofsted",
        sourceDate: "2026-08-31",
      },
      {
        id: "ccod",
        source: "HM Land Registry",
        sourceDate: "2026-10-02",
        attribution: {
          statements: [
            "Information produced by HM Land Registry. © Crown copyright 2026.",
          ],
          conditionsUrl:
            "https://use-land-property-data.service.gov.uk/datasets/ccod/licence/view",
        },
      },
      {
        id: "ocod",
        source: "HM Land Registry",
        sourceDate: "2026-10-02",
        attribution: {
          statements: [
            "Information produced by HM Land Registry. © Crown copyright 2026.",
          ],
          conditionsUrl:
            "https://use-land-property-data.service.gov.uk/datasets/ocod/licence/view",
        },
      },
    ],
    landCoverageAreas: [
      {
        council: { code: "E07000170", name: "Ashfield" },
        outOfDate: false,
        datasets: [
          { id: "council-boundary", sourceDate: "2026-05", attribution: null },
          {
            id: "inspire-index-polygons",
            source: "HM Land Registry",
            sourceDate: "2026-10-04",
            attribution: {
              conditionsUrl:
                "https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions",
            },
          },
          { id: "osm-land-use", sourceDate: "2026-10-08" },
          { id: "osm-buildings", sourceDate: "2026-10-08" },
          { id: "osm-roads", sourceDate: "2026-10-08" },
          { id: "osm-water", sourceDate: "2026-10-08" },
          { id: "conservation-area", sourceDate: "2026-10-08" },
          { id: "listed-building", sourceDate: "2026-10-08" },
          { id: "listed-building-outline", sourceDate: "2026-10-08" },
          { id: "article-4-direction-area", sourceDate: "2026-10-08" },
          { id: "tree-preservation-zone", sourceDate: "2026-10-08" },
          { id: "flood-risk-zone", sourceDate: "2026-10-08" },
          {
            id: "land-parcels",
            source: "OpenStreetMap via Geofabrik",
            sourceDate: "2026-10-08",
          },
          {
            id: "postcodes",
            source: "Ordnance Survey's Code-Point Open",
            sourceDate: "2026-08",
            attribution: {
              conditionsUrl:
                "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
            },
          },
        ],
      },
    ],
  });
});
