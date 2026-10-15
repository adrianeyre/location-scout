import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/*
 * The Dashboard (a view of its own, `?view=dashboard`) against the
 * fixture-backed API. NG17 1AA's 0.5 mile Search Area has a recording for
 * every Layer: a Location Score of 62 in the General Scout Mode, 2,024
 * crimes in the last 12 months, and 197 amenities.
 */

const NG17_1AA = "/?lat=53.123664&lng=-1.264078&radius=0.5";

const dashboard = (page: Page) => page.getByRole("main", { name: "Dashboard" });

const card = (page: Page, name: string) =>
  dashboard(page).getByRole("region", { name, exact: true });

/** A bar chart's row: its label and the value at its bar's tip. */
const barRow = (page: Page, cardName: string, label: string) =>
  card(page, cardName)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });

test("opens from beside the panel's tabs, draws every figure, and goes back to the map", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await expect(
    page.getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/[?&]view=dashboard\b/);
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 2 }),
  ).toBeFocused();
  await expect(page.getByTestId("search-area-map")).toHaveCount(0);

  await expect(card(page, "Location Score beta")).toContainText("62/100");
  await expect(card(page, "Location Score beta")).toContainText(
    "StrongestAmenities 100",
  );
  await expect(barRow(page, "Category Scores beta", "Safety")).toContainText(
    "0/100",
  );
  await expect(barRow(page, "Category Scores beta", "Amenities")).toContainText(
    "100/100",
  );

  const highlights = card(page, "What you need to know");
  await expect(highlights.locator(".highlight-counts dd")).toHaveText([
    "1",
    "2",
    "4",
  ]);

  await expect(card(page, "Crime")).toContainText("2,024");
  await expect(card(page, "Crime")).toContainText("+5.9% on the 12 before");
  await expect(barRow(page, "Amenities", "Other shops")).toContainText("100");
  await expect(card(page, "Property")).toContainText("£182,000");
  await expect(barRow(page, "Property", "Detached houses")).toContainText(
    "£243k",
  );
  await expect(card(page, "Demographics")).toContainText(
    "11.8% below England's median of £44,091",
  );

  await page.getByRole("button", { name: "Back to the map" }).click();
  await expect(page).not.toHaveURL(/view=dashboard/);
  await expect(page.getByTestId("search-area-map")).toBeVisible();
});

test("a shared URL opens the Dashboard, and Back and Forward close and open it", async ({
  page,
}) => {
  await page.goto(NG17_1AA);
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(dashboard(page)).toBeVisible();

  await page.goBack();
  await expect(dashboard(page)).toHaveCount(0);
  await page.goForward();
  await expect(dashboard(page)).toBeVisible();

  await page.goto(`${NG17_1AA}&view=dashboard`);
  await expect(card(page, "Location Score beta")).toContainText("62/100");
});

test("Show on the map goes back to the map and points out the Layer", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&hidden=transport&view=dashboard`);
  await card(page, "Transport")
    .getByRole("button", { name: "Show on the map: Transport" })
    .click();
  await expect(dashboard(page)).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Transport" })).toBeChecked();
  await expect(page.locator(".layer-toggle[data-focused]")).toContainText(
    "Transport",
  );
});

test("the median price over time has a tooltip by pointer and keyboard, and a table", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&view=dashboard`);
  const chart = card(page, "Property").getByRole("img", {
    name: /^Median sale price over time/,
  });
  await chart.focus();
  await expect(card(page, "Property").locator(".chart-tooltip")).toBeVisible();
  await chart.press("ArrowLeft");
  await expect(card(page, "Property").locator(".chart-tooltip")).toBeVisible();

  await card(page, "Property").getByText("Show as a table").click();
  await expect(
    card(page, "Property").getByRole("table", {
      name: "Median sale price over time",
    }),
  ).toBeVisible();
});

test("a Scout Mode puts the Layers it highlights first", async ({ page }) => {
  await page.goto(`${NG17_1AA}&mode=development&view=dashboard`);
  const headings = dashboard(page).locator(".dashboard-grid [data-layer] h3");
  await expect(headings.first()).toHaveText(/Planning|Land/);
});

/** The Widgets' names in the order they are read, top to bottom, then left to right. */
const widgetOrder = (page: Page) =>
  dashboard(page)
    .locator(".widget")
    .evaluateAll((widgets) =>
      widgets
        .map((widget) => {
          const box = widget.getBoundingClientRect();
          return {
            id: widget.getAttribute("data-widget") ?? "",
            top: Math.round(box.top),
            left: Math.round(box.left),
          };
        })
        .sort((a, b) => a.top - b.top || a.left - b.left)
        .map(({ id }) => id),
    );

test("a Widget dragged by its header leans as it goes, snaps into place, nudges the others, and stays there", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${NG17_1AA}&view=dashboard`);
  await expect(card(page, "Crime")).toContainText("2,024");
  const before = await widgetOrder(page);
  expect(before.slice(0, 3)).toEqual(["score", "categories", "highlights"]);

  // Crime, the first Layer, dragged by its header onto the Location Score.
  const head = card(page, "Crime").locator(".card-head h3");
  const from = await head.boundingBox();
  const to = await card(page, "Location Score beta").boundingBox();
  if (!from || !to) throw new Error("No boxes");
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + 10, { steps: 12 });

  const lifted = card(page, "Crime");
  await expect(lifted).toHaveAttribute("data-dragging", "true");
  await expect
    .poll(() => lifted.evaluate((element) => getComputedStyle(element).rotate))
    .toBe("3deg");
  await expect(dashboard(page).locator(".widget-placeholder")).toBeVisible();

  await page.mouse.up();
  await expect(lifted).not.toHaveAttribute("data-dragging");
  await expect(dashboard(page).locator(".widget-placeholder")).toHaveCount(0);
  // The Location Score it landed on, pushed down, jumps; so does the Widget beside it.
  await expect(card(page, "Location Score beta")).toHaveAttribute(
    "data-nudged",
    /even|odd/,
  );
  await expect(card(page, "Category Scores beta")).toHaveAttribute(
    "data-nudged",
    /even|odd/,
  );
  expect(
    await card(page, "Location Score beta").evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toMatch(/^widget-nudge-(even|odd)$/);
  await expect.poll(() => widgetOrder(page)).not.toEqual(before);
  expect((await widgetOrder(page))[0]).toBe("crime");

  // Kept: it opens as it was left, until the layout is reset.
  await page.reload();
  await expect(card(page, "Crime")).toContainText("2,024");
  await expect.poll(async () => (await widgetOrder(page))[0]).toBe("crime");
  await page.getByRole("button", { name: "Reset layout" }).click();
  await expect
    .poll(async () => (await widgetOrder(page)).slice(0, 3))
    .toEqual(["score", "categories", "highlights"]);
  await expect(page.getByRole("button", { name: "Reset layout" })).toHaveCount(
    0,
  );
});

test("a Widget's grip moves it with the arrow keys, and says where it went", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${NG17_1AA}&view=dashboard`);
  await expect(card(page, "Crime")).toContainText("2,024");
  const grip = page.getByRole("button", { name: "Move Crime" });
  await grip.focus();
  await grip.press("ArrowUp");
  await expect(grip).toBeFocused();
  await expect(dashboard(page).locator("[aria-live]").last()).toContainText(
    /Crime moved: now \d+ of 12/,
  );
  expect((await widgetOrder(page)).indexOf("crime")).toBeLessThan(3);
});

test("a Widget's corner resizes it, snapping to the Grid, and a double-click fits it to its content again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${NG17_1AA}&view=dashboard`);
  const score = card(page, "Location Score beta");
  await expect(card(page, "Crime")).toContainText("2,024");
  const before = await score.boundingBox();
  const corner = await score.locator(".widget-resize").boundingBox();
  if (!before || !corner) throw new Error("No boxes");

  await page.mouse.move(corner.x + 9, corner.y + 9);
  await page.mouse.down();
  await page.mouse.move(corner.x + 130, corner.y + 200, { steps: 10 });
  await expect(score).toHaveAttribute("data-resizing", "true");
  await page.mouse.up();

  await expect(score).toHaveAttribute("data-sized", "true");
  const after = await score.boundingBox();
  if (!after) throw new Error("No box");
  expect(after.width).toBeGreaterThan(before.width + 100);
  expect(after.height).toBeGreaterThan(before.height + 150);
  // Snapped: its width is a whole number of columns, and its edges sit on the Grid's.
  const grid = await dashboard(page).locator(".dashboard-grid").boundingBox();
  if (!grid) throw new Error("No grid");
  const pitch = (grid.width + 16) / 12;
  expect(Math.abs((((after.width + 16) / pitch) % 1) - 0.5)).toBeGreaterThan(
    0.45,
  );
  await expect(dashboard(page).locator("[aria-live]").last()).toContainText(
    /Location Score resized: \d+ columns wide, \d+ rows tall\./,
  );

  await page.reload();
  await expect(card(page, "Location Score beta")).toHaveAttribute(
    "data-sized",
    "true",
  );
  await card(page, "Location Score beta").locator(".widget-resize").dblclick();
  await expect(card(page, "Location Score beta")).not.toHaveAttribute(
    "data-sized",
  );
});

test("a Widget's grip resizes it with Shift and the arrow keys", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${NG17_1AA}&view=dashboard`);
  await expect(card(page, "Crime")).toContainText("2,024");
  const before = await card(page, "Crime").boundingBox();
  const grip = page.getByRole("button", { name: "Move Crime" });
  await grip.focus();
  await grip.press("Shift+ArrowRight");
  await expect(grip).toBeFocused();
  await expect(dashboard(page).locator("[aria-live]").last()).toContainText(
    "Crime resized: 5 columns wide",
  );
  const after = await card(page, "Crime").boundingBox();
  expect(after && before && after.width > before.width).toBe(true);
});

test("a hidden Widget is listed in Settings, and shown again from there", async ({
  page,
}) => {
  await page.goto(`${NG17_1AA}&view=dashboard`);
  await card(page, "Planning")
    .getByRole("button", { name: "Hide Planning" })
    .click();
  await expect(card(page, "Planning")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  const widgets = page.getByRole("group", { name: "Dashboard Widgets" });
  await expect(widgets).toContainText("1 of 12 hidden");
  await widgets.getByRole("checkbox", { name: "Planning" }).check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(card(page, "Planning")).toBeVisible();
});

test("the page itself never scrolls past the footer, on the Dashboard or beside a narrow map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${NG17_1AA}&view=dashboard`);
  await expect(card(page, "Crime")).toContainText("2,024");
  /** How far the page itself scrolls past the window, across and down. */
  const overflow = () =>
    page.evaluate(() => ({
      across: document.documentElement.scrollWidth - window.innerWidth,
      down: document.documentElement.scrollHeight - window.innerHeight,
    }));
  expect(await overflow()).toEqual({ across: 0, down: 0 });
  await expect(page.locator(".app-footer")).toBeInViewport();

  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(NG17_1AA);
  await expect(
    page.getByRole("region", { name: "What you need to know" }),
  ).toBeVisible();
  expect(await overflow()).toEqual({ across: 0, down: 0 });
});
