# Appearance, accessibility and SEO

How Location Scout looks, how it meets WCAG 2.2 AA, and how it presents itself to search engines and link previews. Back to the [README](../../README.md).

## Design system

The frontend's look lives in `apps/web/src/App.css`: Inter (self-hosted from `@fontsource-variable/inter`, so the page still asks nothing of anyone but our backend, [ADR 0001](../architectural-decision-record/0001-local-backend-between-frontend-and-data-sources.md)), three radii (`--radius-sm`, `--radius`, `--radius-lg`), three elevations (`--shadow-sm`, `--shadow-md`, `--shadow-lg`, stronger in dark mode), and one control height (`--control-h`). Inputs, selects and the app's own buttons are styled once at the top of the file; map markers keep their own styles. Colours are never written as hex in component rules: they come from the theme.

**The map comes first.** It fills the page under the header, and everything else floats over it (`apps/web/src/ui/PanelSheet.tsx`, `App.css`):

- **On a wide screen,** the side panel is a card at the map's right. Its tabs form one segmented control. The chevron at its end hides the panel, leaving the whole map, and **Show panel** brings it back. The **Layers** card at the top left folds away with its own chevron.
- **On a phone,** the panel is a bottom sheet: lowered to its tabs, half raised or fully raised. Drag it by its handle, or press the handle to step it up a size, so it never needs dragging (SC 2.5.7). The Layers start folded.
- **Search Area placement:** whatever covers the map is marked `data-covers-map`, and the map fits the Search Area into the part left uncovered (`apps/web/src/map/map-cover.ts`). Hiding the panel, or raising or lowering the sheet, slides the view to keep it there, and keyboard zoom zooms about it.
- **A new search** brings a hidden panel back, and raises a lowered sheet to half.
- **Type:** words are set in Inter and figures in JetBrains Mono, with even widths so columns line up. Both are self-hosted, as on the [project website](../../site/).

A few patterns recur. The search is one control: a magnifier inside the field, the Search button joined to its end, and a spinner while it searches. It grows into the header's spare width and shrinks back to 12rem first, so the header keeps to one row at 1280 px. On a phone the field takes the full width, with the Search Radius and Scout Mode side by side under it. Each score's summary draws its score as a bar after the figure. The bar is `aria-hidden` decoration, as the figure already gives the score in words. A chevron shows whether the score is open, and every Highlight ends in an arrow, since each one leads to its Layer. The notices for something left out or cut short (`.scores-left-out`, `.trend-incomplete` and the like) are callouts on the theme's warning colours. Before a search, the Overview and Land panels show an empty state with a pin in the theme's accent. The side panel keeps room for its scrollbar (`scrollbar-gutter: stable`), so its content doesn't shift as it grows.

Buttons the app draws itself come in three variants, set with `data-variant` so the secondary button's base styles still apply. Without one, a button is secondary. `data-variant="primary"` fills it with the accent, for the one action a view is for, such as saving or opening a Saved Location. `data-variant="danger"` edges and letters it in the danger colour, for what can't be undone. A file input keeps its own shape, and its button is drawn as a secondary one. Highlight levels are marked with the SVG shapes `LevelIcon` draws (a tick in a circle, a triangle, an octagon) everywhere they appear: the Overview, the comparison and the report. They are never marked with emoji, which can show as empty boxes where no emoji font is installed.

The map's own colours (each Layer's, the markers', the demographic shading and the base map's tiles) are the same in every theme, so the map reads the same whatever is chosen.

## Settings: mode, theme and Dashboard Widgets

The cog at the top right of the header opens **Settings**, a dialog with:

- **Mode:** Light, Dark or System. System follows the device, and changes with it.
- **Theme:** Scout (the default), Ocean, Forest, Heather, Sunset and High contrast. Each card lists that theme's measured contrast ratios for the mode being drawn.
- **Dashboard Widgets:** every Widget on the Dashboard, each marked Shown or Hidden. Tick a hidden one to show it again ([The Dashboard](dashboard.md#moving-resizing-and-hiding-the-widgets)).

The choice is kept in the browser's local storage under `location-scout:appearance`, and `index.html` applies it before the page is drawn, so it never flashes the wrong colours. Nothing is sent to the backend.

Every theme is in `apps/web/src/theme/themes.ts`, with a light and a dark palette. `themes.test.ts` holds each palette to WCAG 2.2 AA: text at least 4.5:1 on every background it sits on (SC 1.4.3), and focus outlines, control edges and the coloured edges that carry meaning at least 3:1 (SC 1.4.11). To add a theme, add it to `THEMES` with both palettes and run `pnpm --filter @location-scout/web test`; it fails, naming the pair, if any colour falls short.

## Footer and dialogs

A full-width footer sits at the foot of every view. It opens with PRD FR-10.1's credit for the Data Sources: "© OpenStreetMap contributors (ODbL). police.uk, HM Land Registry and planning.data.gov.uk data under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right." Below it are a **Website design** credit linking to the source, the version (the root `package.json`'s), and **Data sources and licences**, which lists every Data Source with its credit ([Attribution](data-sources-and-attribution.md#attribution)), **Privacy Policy**, **Terms and Conditions**, **Cookie Policy** and **Accessibility**. Each opens a dialog (`apps/web/src/ui/Dialog.tsx`) with a title, a close cross at the top right, a body that scrolls both ways when its content is too tall or too wide, and an optional footer that stays put (Settings' **Done**). The texts are in `apps/web/src/legal/`.

The footer stays in view because the panes above it scroll on their own, so it never covers what has focus (SC 2.4.11). On screens under 30rem wide or tall it ends the page instead, so it doesn't take a permanent strip of a small screen.

## Accessibility

Location Scout is built to meet WCAG 2.2 at Level AA:

- A **Skip to main content** link comes first; every control works by keyboard, with a visible focus ring.
- Every marker on the map is a button, so the map may hold dozens of Tab stops: **Skip past the map**, the map's first Tab stop, goes straight to the Layers. A marker's popup takes the focus, and Escape or its cross gives it back to the marker; a cluster zoomed into leaves it on the map.
- The panel's tabs move with the arrow keys, Home and End. Selects choose with the arrow keys, and the weight sliders move a per cent at a time with the arrow keys, to 0% with Home and 100% with End.
- Every statistic the map shows is also given as text in the Location Overview, and in the report (PRD FR-9.5).
- Landmarks are labelled, and every icon-only button (the cog, each dialog's cross) has a name.
- Highlights are named and shaped (a tick in a circle, a triangle, an octagon), never shown by colour alone.
- Under 48rem wide and at least 34rem tall, on a phone, the panel is a bottom sheet over the map. Under 48rem wide and shorter, or under 30rem tall, as at 400% zoom, nothing floats: the panel stacks under the map and the page scrolls as one. Either way nothing scrolls sideways (PRD FR-9.2, SC 1.4.10): each weight's name goes above its slider, the comparison's columns share the panel's width, and a popup is never wider than the map. Only a policy's table too wide to reflow scrolls inside its dialog.
- Colours come from the theme everywhere but the map and the printed report, whose page is always white: the Saved and Compare tabs included, and MapLibre's popups, whose own white is loaded before `App.css` so the theme's wins.
- Targets are at least 24 by 24 pixels (SC 2.5.8). Map markers sit where their Features are, so they may overlap: the criterion's "essential" exception.
- Animations stop when the device asks for reduced motion; `prefers-contrast: more` and Windows Contrast Themes are respected.

`apps/web/e2e/accessibility.spec.ts` runs axe on the main view in every theme in light and dark, on every other main view `e2e/main-views.ts` opens (the scores' breakdown and sliders, an address search's places, a map popup, the Land panel, the Saved and Compare tabs and the report) in light and dark, and on every dialog, and checks the skip link, the footer, the dialogs' scrolling, reflow at 320 px and Settings by hand. `narrow-screen.spec.ts` checks that at 375 px wide nothing on those views scrolls sideways, and `keyboard.spec.ts` that search, the Layers, Scout Mode, Search Radius, the sliders, the tabs and the map's popups work by keyboard alone. [Testing](testing.md) says what each checks.

## Search engines and link previews

`apps/web/index.html` gives the title, a description under 160 characters, a canonical link, Open Graph and X (Twitter) card tags with a 1200 × 630 preview image (`og-image.png`) and its alt text, `theme-color` for light and dark, and schema.org `WebApplication` structured data. Pasted into Slack, Teams, LinkedIn, X, Facebook or iMessage, a link shows the image, title and description.

Link previews need absolute URLs, so set **`SITE_URL`** to the address the site is served from when building:

```bash
SITE_URL=https://location-scout.example pnpm --filter @location-scout/web build
```

The build writes it into `index.html`, and writes `robots.txt` and `sitemap.xml` with it. Without it they point at `http://localhost:5173`, and the build warns. The dev server serves `robots.txt` and `sitemap.xml` too.

## Icons

`apps/web/public/favicon.svg` is the source icon: a pin over a dashed Search Area on a blue tile. `pnpm --filter @location-scout/web brand:assets` draws everything else from it with Playwright's Chromium: `favicon.ico` (16, 32 and 48 px), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` for `site.webmanifest`, and `og-image.png`. Run it after changing the icon or the preview's wording, and commit what it writes.
