import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * Saved Locations (PRD FR-7.1, FR-7.2) against the fixture-backed API. They
 * are kept in the browser's local storage, so each test's fresh browser
 * context starts with none. NG17 1AA's 0.5 mile Search Area scores Transport
 * 88, so with every weight on Transport its Location Score is 88.
 */

/** NG17 1AA in the Investment Scout Mode, weighed by Transport alone. */
const TRANSPORT_ONLY =
  "/?lat=53.123664&lng=-1.264078&radius=0.5&mode=investment&weights=safety:0,amenities:0,schools:0,transport:100,green-space:0,property-activity:0,development-activity:0,planning-freedom:0";

const TRANSPORT_WEIGHTS = {
  safety: 0,
  amenities: 0,
  schools: 0,
  transport: 100,
  "green-space": 0,
  "property-activity": 0,
  "development-activity": 0,
  "planning-freedom": 0,
};

/** Two Saved Locations, as the app keeps them in local storage and exports them. */
const SAVED = {
  format: "location-scout.saved-locations",
  version: 1,
  savedLocations: [
    {
      id: "e2e-transport-only",
      name: "Transport only",
      savedAt: "2026-10-09T09:15:00.000Z",
      location: { lat: 53.123664, lng: -1.264078 },
      radius: 0.5,
      mode: "investment",
      weights: TRANSPORT_WEIGHTS,
      found: null,
    },
    {
      id: "e2e-a-mile-around",
      name: "A mile around",
      savedAt: "2026-10-09T09:20:00.000Z",
      location: { lat: 53.123664, lng: -1.264078 },
      radius: 1,
      mode: "general",
      weights: null,
      found: { kind: "postcode", label: "NG17 1AA" },
    },
  ],
};

const savedTab = (page: Page) => page.getByRole("tab", { name: "Saved" });

const savedPanel = (page: Page) =>
  page.getByRole("complementary", { name: "Saved Locations" });

const savedNames = (page: Page) =>
  savedPanel(page)
    .getByRole("list", { name: "Saved Locations" })
    .getByRole("heading");

const locationScore = (page: Page) =>
  page
    .getByRole("complementary", { name: "Location Overview" })
    .getByRole("region", { name: "Scores beta" })
    .locator("summary")
    .first();

/**
 * Opens a bare page with `SAVED` in local storage, as if saved before, and
 * shows the Saved tab. A bare page loads no Search Area.
 */
const openWithSaved = async (page: Page) => {
  await page.goto("/");
  await page.evaluate((saved) => {
    window.localStorage.setItem(
      "location-scout.saved-locations",
      JSON.stringify(saved),
    );
  }, SAVED);
  await page.reload();
  await savedTab(page).click();
  await expect(savedNames(page)).toHaveText([
    "Transport only",
    "A mile around",
  ]);
};

/** Reloads the page and shows the Saved tab again. */
const reloadSaved = async (page: Page) => {
  await page.reload();
  await savedTab(page).click();
};

test("saves the Search Area with its Scout Mode and weights under a name, keeping it through a reload", async ({
  page,
}) => {
  await page.goto(TRANSPORT_ONLY);
  await expect(locationScore(page)).toHaveText("Location Score 88/100 beta");
  await savedTab(page).click();
  await expect(
    savedPanel(page).getByText("No Saved Locations yet."),
  ).toBeVisible();
  await expect(
    savedPanel(page).getByText(
      "Saves 0.5 mile around 53.123664, -1.264078, in the Investment Scout Mode, with your own weights.",
    ),
  ).toBeVisible();
  const name = savedPanel(page).getByLabel("Name", { exact: true });
  await expect(name).toHaveAttribute("placeholder", "Near NG17 0AZ");

  await name.fill("Transport only");
  await savedPanel(page)
    .getByRole("button", { name: "Save this Search Area" })
    .click();
  await expect(savedPanel(page).getByRole("status")).toHaveText(
    "Saved Transport only.",
  );
  // Given no name, it is saved under the one offered.
  await savedPanel(page)
    .getByRole("button", { name: "Save this Search Area" })
    .click();
  await expect(savedNames(page)).toHaveText([
    "Transport only",
    "Near NG17 0AZ",
  ]);

  await reloadSaved(page);
  await expect(savedNames(page)).toHaveText([
    "Transport only",
    "Near NG17 0AZ",
  ]);
  const stored = await page.evaluate(() =>
    window.localStorage.getItem("location-scout.saved-locations"),
  );
  const { savedLocations } = JSON.parse(stored ?? "{}") as typeof SAVED;
  expect(savedLocations[0]).toMatchObject({
    name: "Transport only",
    location: { lat: 53.123664, lng: -1.264078 },
    radius: 0.5,
    mode: "investment",
    weights: TRANSPORT_WEIGHTS,
    found: null,
  });
});

test("opens a Saved Location with its Scout Mode and weights, from a bare page", async ({
  page,
}) => {
  await openWithSaved(page);

  await savedPanel(page)
    .getByRole("button", { name: "Open Transport only" })
    .click();

  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page).toHaveURL(TRANSPORT_ONLY);
  await expect(page.getByLabel("Scout Mode")).toHaveValue("investment");
  await expect(locationScore(page)).toHaveText("Location Score 88/100 beta");
});

test("renames a Saved Location, keeping the new name through a reload", async ({
  page,
}) => {
  await openWithSaved(page);

  await savedPanel(page)
    .getByRole("button", { name: "Rename Transport only" })
    .click();
  const rename = savedPanel(page).getByRole("form", {
    name: "Rename Transport only",
  });
  await expect(rename.getByLabel("New name")).toBeFocused();
  await rename.getByLabel("New name").fill("By bus and train");
  await rename.getByRole("button", { name: "Save name" }).click();
  await expect(savedNames(page)).toHaveText([
    "By bus and train",
    "A mile around",
  ]);

  await reloadSaved(page);
  await expect(savedNames(page)).toHaveText([
    "By bus and train",
    "A mile around",
  ]);
});

test("deletes a Saved Location once confirmed, and it stays deleted through a reload", async ({
  page,
}) => {
  await openWithSaved(page);

  await savedPanel(page)
    .getByRole("button", { name: "Delete A mile around" })
    .click();
  await expect(
    savedPanel(page).getByText(
      "Delete A mile around? Nothing else keeps it unless you have exported it.",
    ),
  ).toBeVisible();
  await savedPanel(page)
    .getByRole("button", { name: "Delete A mile around" })
    .click();
  await expect(savedNames(page)).toHaveText(["Transport only"]);

  await reloadSaved(page);
  await expect(savedNames(page)).toHaveText(["Transport only"]);
});

test("exports the Saved Locations as JSON, which imports into an empty browser as they were", async ({
  page,
}) => {
  await openWithSaved(page);

  const downloading = page.waitForEvent("download");
  await savedPanel(page)
    .getByRole("button", { name: "Export as JSON" })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^location-scout-saved-locations-\d{4}-\d\d-\d\d\.json$/,
  );
  const path = await download.path();
  const exported = await readFile(path, "utf8");
  expect(JSON.parse(exported)).toEqual(SAVED);

  // Another browser, as far as storage goes: none saved.
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await reloadSaved(page);
  await expect(
    savedPanel(page).getByText("No Saved Locations yet."),
  ).toBeVisible();

  await savedPanel(page).getByLabel("Import from JSON").setInputFiles(path);

  await expect(savedPanel(page).getByRole("status")).toHaveText(
    "Imported 2 Saved Locations.",
  );
  await expect(savedNames(page)).toHaveText([
    "Transport only",
    "A mile around",
  ]);
  // Exported again, the file is the same.
  const again = page.waitForEvent("download");
  await savedPanel(page)
    .getByRole("button", { name: "Export as JSON" })
    .click();
  expect(await readFile(await (await again).path(), "utf8")).toBe(exported);
  // And it is kept, as one saved here would be.
  await reloadSaved(page);
  await expect(savedNames(page)).toHaveText([
    "Transport only",
    "A mile around",
  ]);
});

test("says saving is off when the browser won't let the page use storage, and loads the Search Area as ever", async ({
  page,
}) => {
  // As a browser blocking site data does: touching local storage throws.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException(
          "Access is denied for this document.",
          "SecurityError",
        );
      },
    });
  });
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));

  await page.goto(TRANSPORT_ONLY);
  await expect(locationScore(page)).toHaveText("Location Score 88/100 beta");
  await savedTab(page).click();

  await expect(savedPanel(page).getByRole("status")).toHaveText(
    /^Saving is off: this browser won't let Location Scout keep anything in its storage/,
  );
  await expect(savedPanel(page).getByRole("button")).toHaveCount(0);
  expect(errors).toEqual([]);
});
