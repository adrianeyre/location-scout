# Saved Locations, comparing and the printable report

Saving Search Areas in the browser, comparing 2 to 4 of them, and the printable report. Back to the [README](../../README.md).

## Saved Locations

The **Saved** tab keeps Search Areas to come back to (PRD FR-7.1, FR-7.2). **Save this Search Area** saves the one shown: its Location, Search Radius, Scout Mode and your own weights, if you chose some, with the postcode or address it was found from so that it opens with the same local geography. It is saved under the name you give it, up to 100 characters, or else the one offered: the postcode or address searched for, or for a map click the nearest postcode, "Near NG17 0AZ". The panel says what will be saved, "Saves 0.5 mile around NG17 1AA, in the Investment Scout Mode, with your own weights.", and each Saved Location is listed with the same words and when it was saved.

- **Open** loads it as a search does, adding a history entry, and shows the Location Overview. The URL then names its view, weights and all. If it is the Search Area already shown, only its scores and Highlights load again, in its Scout Mode. Layers you have switched off stay off. Weights that no longer suit their Scout Mode are put back to its defaults, as they are from a URL.
- **Rename** edits its name in place. Enter saves it and Escape keeps the old one.
- **Delete** asks first, as no other copy is kept unless you have exported one.
- **Export as JSON** downloads them all as `location-scout-saved-locations-YYYY-MM-DD.json`. **Import from JSON** adds those in such a file to the ones already saved. One with the id of a Saved Location already here, as when a file exported from this browser is imported back, replaces it where it is, so exporting and importing again changes nothing. Any that can't be read are left out, and the panel says how many. A file that isn't one of these is refused, with the reason.

There are no accounts in Phase 1, and nothing is sent to the backend (ADR 0002). Saved Locations are kept in the browser's local storage under `location-scout.saved-locations`, in the same JSON as an export:

```json
{
  "format": "location-scout.saved-locations",
  "version": 1,
  "savedLocations": [
    {
      "id": "3f0c9a…",
      "name": "Investing near the market",
      "savedAt": "2026-10-09T09:15:00.000Z",
      "location": { "lat": 53.123664, "lng": -1.264078 },
      "radius": 0.5,
      "mode": "investment",
      "weights": { "safety": 10, "amenities": 10, "transport": 20, "green-space": 10, "property-activity": 40, "planning-freedom": 10 },
      "found": { "kind": "postcode", "label": "NG17 1AA" }
    }
  ]
}
```

`weights` is `null` for the Scout Mode's defaults, and `found` for a map click. They are read as the URL's are: a Location in range, a radius of 0.25, 0.5 or 1, and whole per cents totalling 100. They stay in this browser and this profile only, so export them to keep a copy or to move them to another browser. A change in another tab shows here at once.

**When the browser won't keep them**, saving is off and the rest of the app works as ever. This happens when it blocks site data, where touching local storage throws, and in a private window that refuses anything written to it, as older Safari's did. The Saved tab then says "Saving is off: this browser won't let Location Scout keep anything in its storage…" and offers nothing to save, list or import. If it refuses a change later, as a full one does, the change isn't made and the panel says so. The code is in `apps/web/src/saved/`: reading, writing and merging the JSON in `saved-locations.ts`, the storage in `useSavedLocations.ts`, and the tab in `SavedLocationsPanel.tsx`.

## Comparing Saved Locations

The **Compare** tab puts 2 to 4 Saved Locations side by side (PRD FR-7.3). Tick the ones to compare. Once 4 are ticked the rest can't be, until one is unticked. Each column is a Saved Location, headed with its name and Search Area ("0.5 mile around NG17 1AA"), in the order they are saved in. The rows are:

- **Scores (beta):** the Location Score, then each Category Score the Scout Mode weighs. A Location Score that leaves out a Category Score which is unavailable says how many it is weighed from: Sutton Parkway's 0.25 mile Search Area reads "53 (5 of 8 Category Scores)" in General.
- **What you need to know:** each Search Area's Highlights, and the Layers left out of them.
- **Key statistics**, each a figure the Location Overview already gives:
  - estimated residents
  - crimes in the last 12 months, and their change year on year
  - the median sale price and its change over 12 months
  - amenities and bus stops
  - the nearest railway station, park, primary school and secondary school
  - the Planning Constraints at the Location
  - Planning Applications in the last 3 years, and the homes they would bring, estimated
  - average household income
  - the Location's deprivation decile
  - Land Opportunities, under FR-5.7's wording

A figure that can't be given says why: Loading…, Unavailable, Not prepared, or "Loading planning applications (rate-limited)" while PlanIt's queue holds it.

**Every column is compared in one Scout Mode:** the one chosen in the header, with your own weights if you have chosen some, whatever mode each was saved in. Choose another Scout Mode there and every column's scores and Highlights are loaded again in it; its Layers aren't, as no Scout Mode changes them. With your own weights, each Location Score is weighed again in the browser from its Category Scores, as the Overview's is. Each Saved Location is loaded as a Search Area is, through the same `/api/area/{layer}`, `/api/scores` and `/api/highlights` requests, re-asked while PlanIt's queue holds its Planning Applications. What has loaded is kept until the page is reloaded, so ticking one again, or going back to a Scout Mode, loads nothing.

**The best value in each row is marked "★ Best"**, shaded and edged in the theme's green:

- **Scores:** the highest score.
- **Key statistics:** the fewest crimes or the smallest rise in them, the most amenities or bus stops, the nearest station, park or school, the fewest Planning Constraints at the Location, and the least deprived decile.
- **Not judged:** prices, residents, income, Planning Applications and Land Opportunities. Whether more of them is better depends on what you are looking for.
- **No mark:** where fewer than two figures can be compared, or where they are all the same. Distances are compared as they read, so two parks both "100 m" away are equal.
- **Counts when Search Radii differ:** a wider Search Area finds more, so residents, crimes, amenities, bus stops, Planning Applications, homes and Land Opportunities aren't marked. The tab says so.

The code is in `apps/web/src/compare/`. `comparison.ts` holds the rows and how the best is found. `useComparison.ts` does the loading, using `followLayer` and `followScores` from `useSearchArea.ts`, as the Overview does. `ComparePanel.tsx` is the tab. With saving off, the tab says there are no Saved Locations to compare.

## Printable report

**Printable report**, in the Location Overview below its Highlights, opens a report of the Search Area shown to print, or to keep as a PDF by choosing **Save as PDF** as the printer in the browser's print dialog (PRD FR-7.4). It is made from what the page has already loaded, in the Scout Mode chosen and with your own weights if you chose some, so it asks the backend for nothing more. It has, in order:

- **Its title, "Location Scout report: 0.5 mile around NG17 1AA"**, which the page takes while it is open, so a saved PDF is named after it; the postcode or address it was found from, the Location's coordinates, the Search Radius, the Scout Mode with its question and whose weights, and the day it was produced.
- **A static map image** of the Search Area: its circle, the Location, and the Features of each Layer the map shows, each as its shape (a conservation area, a park, a Land Opportunity) or as a dot in its marker's colour, nothing clustered, and the Scout Mode's competitors ringed. The Demographics Layer's output areas would cover it all, so they are left off and given in figures. A key names each Layer with how many of its Features are drawn, and OpenStreetMap is credited beneath (FR-10.4). A map drawn with WebGL may print blank, so the image is drawn once, on a map of its own that can't be moved, at twice the screen's resolution, and turned into a PNG (`ReportMap.tsx`). It is drawn once every Layer has loaded. Without WebGL it says there is no map image, and the rest of the report stands.
- **What you need to know:** the Highlights, each with its level in words and its Layer, and what they leave out.
- **The Location Overview:** the local geography, the Land Coverage Area and each Layer's statistics, as the Overview gives them, with each Layer's own notes and credits, but none of its buttons.
- **Scores (beta):** the Location Score with how it is weighed, then every Category Score with its breakdown in full, as a printed page can't expand them, and any left out, saying why.
- **Land Opportunities**, if the Land Layer found any: each with its area, its distance from the Location and its tags, as the Land panel gives them and with its filters, under FR-5.7's wording, "Our data suggests this parcel warrants further investigation…", and FR-5.8's note, with HM Land Registry's two ownership checks. Without any there is no such section, though the Overview's Land Layer still gives the wording.
- **Attributions:** the footer's credit (PRD FR-10.1), then the base map's, the Location's (postcodes.io, as the ONS Postcode Directory's licence asks, and the council boundaries once prepared), then every Layer's, for each of its Data Sources that answered, as their licences require ([Attribution](data-sources-and-attribution.md#attribution)): police.uk; planning.data.gov.uk, Historic England, dated the day the constraints were obtained, and the Planning Applications provider; OpenStreetMap for Amenities, Transport and Green space; GIAS and Ofsted; postcodes.io, HM Land Registry's Price Paid wording and, with `EPC_API_KEY`, the EPC data; OpenStreetMap, planning.data.gov.uk, Historic England and each Land Coverage Area's INSPIRE Index Polygons, Code-Point Open, CCOD and OCOD statements for Land; and ONS's and MHCLG's for Demographics. A Layer that is unavailable or not prepared says that nothing of it is in the report.

Above it, **Print or save as PDF** opens the print dialog, and the report says whether everything has loaded yet ("Still loading the Planning Layer…"); anything still loading when you print is left out. **Back to the map** returns to the map as it was. The report is printed on A4 with 12 mm margins either side (`@page` in `App.css`): its buttons aren't printed, colours are kept, a table, a score, a Highlight or a Land Opportunity isn't split across pages where that can be helped, and the attributions' links are spelt out after them, as paper can't follow them. NG17 1AA's report is 12 pages. The URL keeps it as `view=report` beside the Search Area's own view (`report-view.ts`), so reloading or bookmarking it opens the report again, and Back returns to the map. The code is in `apps/web/src/report/`, and `report.spec.ts` checks it end to end, making a PDF of it with Chromium and checking every page is A4.
