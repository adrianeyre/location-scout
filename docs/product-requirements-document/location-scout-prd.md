# Location Scout: Product Requirements Document

| | |
|---|---|
| **Status** | Draft, agreed for Phase 1 build |
| **Last updated** | 2026-10-09 |
| **Glossary** | [`GLOSSARY.md`](../../GLOSSARY.md). Capitalised terms (Location, Layer, Feature, Land Opportunity…) are defined there. |
| **Decisions** | [`docs/architectural-decision-record/`](../architectural-decision-record/) |

---

## 1. Summary

Location Scout lets someone pick any Location in England and understand everything around it on one screen. An interactive map shows Layers of Features (crime, planning, amenities, schools, transport, green space, property, land and demographics). A Location Overview opens with "what you need to know" Highlights, then gives headline statistics and transparent Category Scores. Scout Modes answer specific questions ("open a café here?", "buy-to-let here?"). The **Land Opportunity Finder** finds Land Parcels that warrant investigation, including ones that are Possibly Unregistered.

**Phase 1 contains every product feature and runs entirely on a developer's machine.** There is no hosting and no database server. Most data is fetched live from free public Data Sources. Land data, which has no API, is prepared once into local files. Planning Applications and AI Explanations switch on when the developer supplies API keys. Later phases are infrastructure: Phase 2 hosts the product with real accounts, Phase 3 adds a database and historical data, and Phase 4 scales it.

## 2. Problem

Information about a place in England is scattered across many government and open-data services: police crime data, planning designations, Land Registry sales and title outlines, OpenStreetMap amenities and land use. Each has its own website, format and quirks. Getting a full picture of one Location, or finding land worth pursuing, means visiting several sites and stitching the answers together in your head.

Existing products (see §11) each cover part of this, mostly through a property-investment lens. None of them is a map-first tool for "what is around this place, is it any good for my purpose, and is there land here worth looking into?"

## 3. Goals and non-goals

### Goals (whole product)

1. Enter a Location and see everything known about its Search Area on one interactive map.
2. Turn raw data into decisions using Category Scores whose reasoning is visible, not black-box judgements.
3. Answer purpose-specific questions with Scout Modes.
4. Surface Land Opportunities that other property websites don't show.
5. Show how a Search Area is changing over time (from Phase 3).

### Non-goals (throughout)

- Coverage of Scotland or Northern Ireland.
- Property valuations or automated valuation models.
- Google Street View as a core feature. It is optional and needs the user's own key.
- Proximity to utilities, and radon data (no free, reusable source).
- Claiming any land is unowned or available. Land Opportunities only ever "warrant investigation".
- AI-generated numbers. AI only ever explains figures that code has calculated ([ADR 0005](../architectural-decision-record/0005-ai-explains-calculated-scores-opt-in.md)).

## 4. Users

| Audience | Question they bring | Served by (Phase 1) |
|---|---|---|
| Curious resident or homebuyer | "What is this area really like?" | Location Overview, Homebuyer Scout Mode |
| Property investor | "Is this a good area to buy to let?" | Buy-to-let Scout Mode, Property Layer |
| Property developer / land buyer | "What land and constraints are around here?" | Land Opportunity Finder, Planning Layer |
| Small business owner | "Is this a good place to open a café / gym / nursery?" | Business Scout Modes |
| Developer / technical user | "Can I get this data programmatically?" | Documented local API |

## 5. Phased roadmap

| Phase | Theme | Runs where | Persistence | Headline additions |
|---|---|---|---|---|
| **1** | Every feature, local | Developer machine | In-memory cache, prepared local files ([ADR 0004](../architectural-decision-record/0004-prepared-local-files-queried-with-duckdb.md)), browser storage | Everything in §6: search, map, 9 Layers, Highlights, scores, Scout Modes, Land Opportunity Finder with ownership, Planning Applications with housing estimates, property history and EPC, demographics, AI Explanations, Street View, Saved Locations, comparison, reports, documented API |
| **2** | Hosted business | Cloudflare Pages + Workers (+ small container for land queries) | KV cache, R2, user data store | Public URL, real accounts, server-side Saved Locations, SEO pages, public API access, hosted maps and geocoding |
| **3** | Database and history | As Phase 2 + Neon | Postgres/PostGIS | Bulk backfill, monthly imports, trends, "what's changed?", watch-area alerts, benchmarked scores, area rankings, UPRN linking |
| **4** | Growth and scale | As Phase 3, scaled | As Phase 3 | Travel-time catchments, broadband, air quality and noise, more Data Sources and Scout Modes, infrastructure scaling |

Phase 1 is specified in full (§6). Later phases are specified at goal and scope level (§8).

---

## 6. Phase 1: Full local edition

### 6.1 Scope summary

- Runs locally. One command prepares local data, one command starts the app. Nothing is hosted.
- England only for all Layers. Land Opportunities only inside prepared **Land Coverage Areas** (Ashfield to start).
- No database server and no stored history ([ADR 0002](../architectural-decision-record/0002-phase-1-has-no-persistence.md)).
- The frontend talks only to the local backend ([ADR 0001](../architectural-decision-record/0001-local-backend-between-frontend-and-data-sources.md)).
- Planning Applications come from a third-party API: PlanIt by default (free, no key, rate-limited), or PlanWire with a key ([ADR 0003](../architectural-decision-record/0003-planning-applications-from-a-third-party-api.md)).
- Optional keys switch on extra features, each off by default: EPC (energy ratings and floor area), PlanWire, Google Street View, and AI Explanations
- AI Explanations use the developer's own Anthropic API key ([ADR 0005](../architectural-decision-record/0005-ai-explains-calculated-scores-opt-in.md)).
- Features that need stored history (trends, "what's changed?", alerts, benchmarked scores) are Phase 3. Features that only make sense for a public site with real users (accounts, SEO pages, a public API) are Phase 2.

### 6.2 Choosing a Location

| ID | Requirement |
|---|---|
| FR-1.1 | The user can enter a **postcode**. It is resolved to a Location with postcodes.io. |
| FR-1.2 | The user can enter a **free-text address**. It is resolved with Nominatim, limited to GB results. If several candidates come back, the user picks one from a list. |
| FR-1.3 | The user can **click anywhere on the map** to set the Location to that point. |
| FR-1.4 | The user can choose a **Search Radius** of 0.25, 0.5 or 1 mile. The default is 0.5 mile. Changing it reloads the Search Area. |
| FR-1.5 | If the Location is **outside England** (checked with the postcodes.io `country` field, including a reverse lookup for map clicks), the app shows "Location Scout currently covers England only" and loads no Layers. |
| FR-1.6 | Invalid or unknown postcodes and addresses show a clear message without a page error. |
| FR-1.7 | The current Location, Search Radius, Scout Mode and visible Layers are reflected in the URL, so a search can be bookmarked and shared locally. |
| FR-1.8 | The Overview names the Location's **local geography** from postcodes.io: ward, LSOA, MSOA, local authority and parliamentary constituency. |

### 6.3 Layers

Every Layer can be switched on and off. All Layers cover the same Search Area.

| ID | Layer | Data Source | Features shown | Overview statistics |
|---|---|---|---|---|
| FR-2.1 | **Crime** | data.police.uk | Street-level crimes for the latest published month, clustered | Count by category for the latest month and the last 12 months, plus **year-on-year change** overall and per category against the previous 12 months (24 live calls, cached 24 h, nothing stored) |
| FR-2.2 | **Planning** | planning.data.gov.uk (constraints); third-party Planning Applications API (§6.17) | Planning Constraints intersecting the Search Area (conservation areas, listed buildings, Article 4 directions, tree preservation zones, flood zones), and Planning Applications from the last 3 years, coloured by status (pending, approved, refused, withdrawn) | Constraints: count per type, and whether the Location sits inside each. Applications: count by status and by type (householder, minor, major), and major applications listed. While PlanIt's queue is waiting: "Loading planning applications (rate-limited)". Applications with postcode-derived coordinates are marked approximate. **Estimated housing:** dwelling numbers are pulled out of application descriptions ("erection of 86 dwellings"), giving "N homes approved / pending within the Search Area → about N × 2.4 extra residents". Each popup gets a rule-based "potential impact" line. Everything derived is labelled "estimated". |
| FR-2.3 | **Amenities** | OpenStreetMap via Overpass | Shops, convenience stores, cafés, restaurants, takeaways, pubs, supermarkets, gyms, hairdressers, dentists, nurseries, healthcare, offices | Count by type, nearest of each type |
| FR-2.3a | **Schools** | GIAS (schools register) + Ofsted inspection data, prepared locally | Schools by phase (primary, secondary, special, independent) with latest Ofsted judgement | Count by phase and Ofsted judgement, nearest primary and secondary |
| FR-2.4 | **Transport** | OpenStreetMap via Overpass | Railway stations, bus stops, car parks, EV chargers, footpaths and cycle routes | Counts, distance to nearest railway station, km of footpath and cycle route in the Search Area |
| FR-2.5 | **Green space** | OpenStreetMap via Overpass | Parks, playgrounds, nature reserves, woods | Count, distance to nearest park |
| FR-2.6 | **Property** | HM Land Registry Price Paid (SPARQL); EPC register (optional key) | Sales in the last 12 months within the Search Area, labelled with price | Count, median and mean price by property type, tenure and new-build. **12-month and 5-year median change** (live query over earlier years). **Price per m²** where an EPC floor area matches. EPC rating distribution. |
| FR-2.7 | **Land** | Prepared local files (§6.7) | Land Opportunities coloured by Ownership Category; industrial and commercial land use as context | Count, total area, count per Ownership Category, nearby land sales. Shown only inside a Land Coverage Area; otherwise "Land data not prepared for this area". |
| FR-2.7a | **Demographics** | ONS Census 2021, ONS small-area income estimates, Index of Multiple Deprivation, prepared locally for all of England | Output areas shaded by a chosen measure (population density, median age, income, deprivation decile) | Estimated population in the Search Area (output areas weighted by overlap), age profile, households, average household income (MSOA), deprivation decile |

| ID | Requirement |
|---|---|
| FR-2.8 | **Property search area:** Price Paid filters by postcode, not radius. The backend gets the postcodes inside the Search Area from postcodes.io (max 100) and queries those. If the limit cuts the area short, the Overview says so. |
| FR-2.9 | **Crime locations:** the Crime Layer states that police crime locations are deliberately approximate. |
| FR-2.10 | **Feature details:** clicking a Feature opens a popup with its details and its distance from the Location. |
| FR-2.12 | **Sale history per address:** a sold-property popup lists every Price Paid sale at that address since 1995, with the change between sales ("Last sold £267,500, June 2024; previous £198,000, 2018; +35.1%"). This is fetched live; nothing is stored. |
| FR-2.13 | **Street View (optional):** when `GOOGLE_MAPS_API_KEY` is set, a Street View panel opens at the Location or a clicked Feature. It is hidden without a key. |
| FR-2.11 | The Search Area circle and the Location marker are always drawn. |

### 6.4 Location Overview and scoring

| ID | Requirement |
|---|---|
| FR-3.1 | A panel next to the map shows the resolved Location, Search Radius and statistics for each Layer. |
| FR-3.2 | The panel shows each **Category Score** (0–100) and the **Location Score**, labelled **"beta"**. |
| FR-3.3 | Each score expands to show its breakdown: inputs, thresholds used and points awarded. |
| FR-3.7 | The Overview opens with **Highlights**: 🟢 Good, 🟠 Watch and 🔴 Concern statements (for example "Crime down 8% year-on-year", "Flood zone 3 within 500 m", "Limited parking", "420 homes approved nearby"). They come from fixed rules in the same config as the scores, never from AI, and each one links to the Layer behind it. The active Scout Mode decides which rules apply. |
| FR-3.4 | If a Layer is unavailable (§6.12), its statistics read "Unavailable". Its Category Score is left out and the Location Score says so. |

Phase 1 has no regional averages (those arrive in Phase 3), so scores use **fixed thresholds** held in one typed config module. The values are starting points, to be tuned against real Locations. The rules are deterministic, with no AI.

| Category Score | Inputs | Initial rule |
|---|---|---|
| **Safety** | 12-month crime count per 1,000 residents (per km² if demographics are missing), year-on-year change | Linear on rate: ≤ 30 per 1,000 → 90, ≥ 200 → 0; ±10 points for a fall or rise of more than 10% |
| **Amenities** | Distinct amenity types present plus total count | 70% type coverage + 30% count (capped) |
| **Schools** | Distance to nearest primary and secondary, their Ofsted judgements | Nearest primary ≤ 800 m → 40 pts and nearest secondary ≤ 2 km → 25 pts, each scaling to 0 at 3× distance; up to 35 pts for the Ofsted judgements of the nearest of each |
| **Transport** | Distance to nearest station, bus stop count | Station ≤ 800 m → 60 pts, scaling to 0 at 5 km; up to 40 pts for bus stops (cap 10) |
| **Green space** | Distance to nearest park, green-space count | Park ≤ 300 m → 70 pts, scaling to 0 at 2 km; up to 30 pts for count |
| **Property activity** | Sales in 12 months | Market liquidity, not quality. 0 sales → 0, ≥ 100 → 100 |
| **Development activity** | Planning Applications in Search Area in the last 3 years (major counted ×5) | Linear on weighted count, capped at 100. Indicates change, not quality. Unavailable without a key. |
| **Planning freedom** | Planning Constraints covering the Location | 100 minus penalties: flood zone 3 −40, flood zone 2 −20, conservation area −20, listed building −20, Article 4 −15, TPZ −5 |
| **Demand** *(Business and Retail modes)* | Estimated population, estimated new residents from Planning Applications, household income | Linear on population (cap 20,000), +up to 15 for planned housing, ±10 for income relative to England median |
| **Competition** *(Business modes only)* | Competitors of the chosen business type per 1,000 residents, distance to nearest competitor | Fewer competitors scores higher. 0 per 1,000 → 100, ≥ 1 per 1,000 → 0; −10 if a competitor is within 100 m |
| **Footfall proxy** *(Business modes only)* | Shops, offices, transport stops and schools within Search Area | Linear on weighted count, capped |

**Location Score** = weighted mean of the available Category Scores. Weights come from the active Scout Mode (§6.5). They are renormalised when a category is unavailable.

| ID | Requirement |
|---|---|
| FR-3.5 | All thresholds, penalties and weights live in one typed config module. |
| FR-3.6 | Every score is reproducible: the same inputs always give the same score. |

### 6.5 Scout Modes

A Scout Mode changes which Category Scores count and how they are weighted. It can also add mode-specific inputs and highlight relevant Features.

| ID | Requirement |
|---|---|
| FR-4.1 | The user can pick a Scout Mode from a selector. **General** is the default. |
| FR-4.2 | Phase 1 modes and default weights (%): |

| Scout Mode | Safety | Amenities | Schools | Transport | Green | Property activity | Development activity | Planning freedom | Demand | Competition | Footfall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| General | 25 | 15 | 10 | 15 | 10 | 10 | 5 | 10 | – | – | – |
| Homebuyer | 25 | 15 | 20 | 15 | 15 | 5 | – | 5 | – | – | – |
| Buy-to-let | 15 | 10 | 10 | 25 | 5 | 25 | 5 | 5 | – | – | – |
| Investment | 10 | 10 | 5 | 15 | 5 | 25 | 25 | 5 | – | – | – |
| Development | 5 | 5 | 5 | 10 | 5 | 15 | 25 | 30 | – | – | – |
| Retail | 10 | 5 | – | 20 | – | – | – | 5 | 25 | 10 | 25 |
| Business: Café | 10 | 5 | – | 15 | – | – | – | 5 | 20 | 25 | 20 |
| Business: Restaurant | 10 | 10 | – | 15 | – | – | – | 5 | 20 | 20 | 20 |
| Business: Takeaway | 5 | – | – | 10 | – | – | – | 5 | 30 | 25 | 25 |
| Business: Gym | 10 | 5 | – | 20 | – | – | – | 5 | 25 | 20 | 15 |
| Business: Hairdresser | 10 | – | – | 15 | – | – | – | 5 | 30 | 25 | 15 |
| Business: Convenience store | 10 | – | – | 10 | – | – | – | 5 | 35 | 30 | 10 |
| Business: Dental practice | 10 | – | – | 20 | – | – | – | 5 | 40 | 25 | – |
| Business: Nursery | 20 | – | 10 | 10 | 10 | – | – | – | 25 | 25 | – |

Investment mode uses only current data in Phase 1. Its "what's changing?" inputs arrive with history in Phase 3.

| ID | Requirement |
|---|---|
| FR-4.3 | Business and Retail modes define their **competitor category** from OSM tags and highlight competitors on the map. Café: `amenity=cafe`. Restaurant: `amenity=restaurant`. Takeaway: `amenity=fast_food`. Gym: `leisure=fitness_centre`. Hairdresser: `shop=hairdresser`. Convenience store: `shop=convenience`. Dental practice: `amenity=dentist`. Nursery: `amenity=kindergarten` / `childcare`. Retail: any `shop=*`. |
| FR-4.3a | **Development** mode highlights Land Opportunities, Planning Constraints and Planning Applications. **Investment** mode highlights sales, price change and Planning Applications. |
| FR-4.4 | The user can adjust a mode's weights with sliders. "Reset to default" restores them. Custom weights are kept with Saved Locations. |
| FR-4.5 | New Scout Modes can be added by config only: weights, competitor tags and highlighted Layers. |

### 6.6 Land Opportunity Finder

| ID | Requirement |
|---|---|
| FR-5.1 | A **Land** panel lists Land Opportunities in the Search Area, sortable by size, road distance and capacity. The user can also search a whole Land Coverage Area. |
| FR-5.2 | A Land Parcel is built from OSM open or undeveloped land: `landuse` = grass, meadow, brownfield, greenfield, farmland or construction; `natural` = scrub or grassland; and gaps between building footprints. Areas covered by buildings, roads, water or protected parks are removed. |
| FR-5.3 | A Land Parcel is a **Land Opportunity** when it meets all the active filters. Defaults: area ≥ 0.1 acre; ≤ 50 m from a road; not inside a listed building outline. Each filter is user-adjustable. |
| FR-5.4 | Each Land Opportunity is tagged with:<br>• **Possibly Unregistered:** less than 50% of its area is covered by INSPIRE Index Polygons (registered freehold title outlines)<br>• **Planning Constraints** it intersects<br>• **Flood zone**<br>• **Nearby development activity:** Planning Applications within 500 m (approved and major highlighted) when configured, plus OSM `landuse=construction` within 500 m<br>• **Estimated capacity** at 30 homes/hectare after a 40% deduction for access and open space<br>• **Area** in acres and hectares |
| FR-5.4a | Each Land Parcel and the INSPIRE polygons around it get an indicative **Ownership Category**: company-owned, council or public-body owned, other registered, or Possibly Unregistered. Company and council ownership comes from HM Land Registry's **UK companies (CCOD) and overseas companies (OCOD) that own property** datasets, whose proprietor categories include local authorities. INSPIRE polygons carry no title number, so titles are matched to polygons by address and postcode. The match is shown as "indicative", with the matched title address. |
| FR-5.4b | **Nearby land sales:** Price Paid transactions of type "Other" (non-residential and land) within 1 mile, with price and date, marked "indicative: may not be land". |
| FR-5.5 | Filters include ownership category, "Possibly Unregistered only", maximum flood zone, exclude-constraint types, and minimum/maximum area. |
| FR-5.6 | Clicking a Land Opportunity shows its tags, outline, the INSPIRE polygons that overlap it, and links to HM Land Registry's "search the register" and "index map search" services for ownership checks. |
| FR-5.7 | Every Land view shows this wording: "**Our data suggests this parcel warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner.**" |
| FR-5.8 | INSPIRE polygons cover only registered **freehold** titles. Leasehold-only and recent registrations may be missing, and the UI says so. |
| FR-5.9 | "Proximity to utilities" is **not** offered: there is no free national utilities dataset. |

### 6.7 Preparing local data

| ID | Requirement |
|---|---|
| FR-6.0 | `pnpm data:prepare` always prepares the **England-wide datasets**, which are small enough to keep whole:<br>• ONS Census 2021 by output area (population, age, households) and output area boundaries<br>• ONS small-area (MSOA) household income estimates<br>• the latest English Indices of Deprivation (LSOA)<br>• the GIAS schools register and the latest Ofsted inspection outcomes<br>• HM Land Registry CCOD and OCOD (free, but downloading needs a Use land and property data account and API key: `LAND_REGISTRY_DATA_API_KEY`; skipped with a warning if it is not set) |
| FR-6.1 | `pnpm data:prepare --area <council>` also downloads, for each named council:<br>• the INSPIRE Index Polygons GML (HM Land Registry, monthly, one file per local authority)<br>• the Geofabrik England OSM extract, clipped to the council boundary<br>• the planning.data.gov.uk constraint datasets (bulk GeoJSON), clipped to the council boundary<br>• the council boundary (ONS Open Geography) |
| FR-6.2 | The script converts these to **GeoParquet** files in `data/<council>/`, precomputes Land Parcels and their tags, and writes a manifest with source dates. |
| FR-6.3 | The backend queries the files with **DuckDB** (spatial extension) inside its own process. No database server is required ([ADR 0004](../architectural-decision-record/0004-prepared-local-files-queried-with-duckdb.md)). |
| FR-6.4 | The default Land Coverage Area is **Ashfield**. Other councils are added by naming them, and `--all` prepares every English council (several GB of downloads and a long first run). |
| FR-6.5 | The app shows each Land Coverage Area's data dates. If the INSPIRE data is more than 2 months old, it suggests re-running the script. Re-running replaces files; no history is kept. |
| FR-6.6 | `data/` is git-ignored. The app works without prepared data. Only the Layers that need it (Land, Schools ratings, Demographics) and the scores that use them are disabled, each saying "run `pnpm data:prepare`". |

### 6.7a What preparation covers

| Data | Coverage | Size (approx.) | Refresh |
|---|---|---|---|
| Census, income, deprivation | All of England | Hundreds of MB | Rarely (census every 10 years; income and IMD every few years) |
| Schools and Ofsted | All of England | Tens of MB | Monthly |
| CCOD / OCOD | England and Wales | About 1 GB | Monthly |
| INSPIRE, OSM land use, planning constraints | Per Land Coverage Area, or `--all` | Tens of MB per council; several GB for all | Monthly |

### 6.8 Saved Locations, comparison and reports

| ID | Requirement |
|---|---|
| FR-7.1 | The user can save the current Location, Search Radius, Scout Mode and custom weights as a **Saved Location** with a name. Saved Locations are stored in browser local storage. There are no accounts. |
| FR-7.2 | Saved Locations can be listed, opened, renamed, deleted, and exported or imported as a JSON file. |
| FR-7.3 | The user can **compare 2–4 Saved Locations** side by side: Category Scores, Location Score and key statistics, under one chosen Scout Mode. |
| FR-7.4 | The user can produce a **report** for the current Search Area: a print-optimised page with a static map image, the Overview, scores with breakdowns, Land Opportunities (if any) and attributions. It is saved to PDF through the browser's print dialog. |

### 6.9 AI Explanations

| ID | Requirement |
|---|---|
| FR-11.1 | When `ANTHROPIC_API_KEY` is set, an **Explain** button appears on the Overview, each Category Score, each comparison and each Land Opportunity. Without a key it is hidden. |
| FR-11.2 | The backend sends the model only the structured response already shown to the user (statistics, scores, breakdowns, tags, Scout Mode). The model is instructed to use only those figures, to say when data is unavailable, and to repeat the Land Opportunity ownership wording where relevant. |
| FR-11.3 | Pre-built questions per Scout Mode come first ("What are the biggest risks here?", "Could I open a café here?", "Is this area good for families?"). A free-text question box is also provided, answered under the same constraints. |
| FR-11.4 | Default model is Claude Sonnet 5.5 (`claude-sonnet-5-5`), configurable. Answers stream into the panel and are labelled "AI Explanation, based only on the figures above". |
| FR-11.5 | Explanations are cached in memory per (Search Area, Scout Mode, question) so a repeated question isn't asked again. The app shows the approximate token usage per explanation. |
| FR-11.6 | Any figure in an answer that doesn't appear in the input is a defect. A test suite checks recorded answers for this (NFR-3.5). |

### 6.11 Documented local API

| ID | Requirement |
|---|---|
| FR-8.1 | The backend publishes an **OpenAPI** description at `/api/openapi.json` and an interactive docs page at `/api/docs`. |
| FR-8.2 | Endpoints (indicative):<br>• `GET /api/geocode?q=`<br>• `GET /api/area?lat=&lng=&radius=&mode=`<br>• `GET /api/area/{layer}?…`<br>• `GET /api/land?lat=&lng=&radius=&…filters`<br>• `GET /api/land/{parcelId}`<br>• `GET /api/coverage` (prepared Land Coverage Areas and their data dates)<br>• `GET /api/modes` (Scout Modes and their default weights)<br>• `POST /api/explain` (AI Explanation, streamed; only when configured) |
| FR-8.3 | Responses use the types from `packages/shared`. The frontend uses only these endpoints. |

### 6.12 Reliability and degradation

| ID | Requirement |
|---|---|
| NFR-1.1 | Each live Data Source call has an **8-second timeout**. |
| NFR-1.2 | A failed or timed-out Data Source makes only its own Layers "Unavailable". The rest of the Search Area still loads. |
| NFR-1.3 | Responses list each Data Source with its status (`ok` / `unavailable` / `not-prepared`) and the data period it covers. |
| NFR-1.4 | **In-memory cache** for live calls: crime 24 h, Overpass 24 h, Price Paid 24 h, planning constraints 24 h, Planning Applications 7 days, geocoding 7 days. Cleared on restart. |
| NFR-1.5 | Rate limits are respected: Nominatim at most 1 request/second with an identifying User-Agent; PlanIt at most 1 request/minute through a queue, honouring `429` / `Retry-After`, with a User-Agent containing a contact email; Police API well under 15 requests/second; Overpass queries combined per Search Area. |

### 6.13 Performance

| ID | Requirement |
|---|---|
| NFR-2.1 | Uncached, a full Search Area loads in **under 5 seconds** on a developer machine at the 0.5 mile radius. |
| NFR-2.2 | Cached, the same search loads in under 1 second. |
| NFR-2.3 | Layers render as each Data Source returns. The UI never waits for the slowest one before showing anything. |
| NFR-2.4 | A Land Opportunity search across a whole Land Coverage Area returns in **under 3 seconds**. |
| NFR-2.5 | `data:prepare` for one council completes in under 15 minutes on a typical broadband connection. |

### 6.14 User interface

| ID | Requirement |
|---|---|
| FR-9.1 | **Desktop-first layout:** search bar, radius and Scout Mode selector across the top; map about 60% of the width; a side panel about 40% with tabs for Overview, Land, Saved and Compare; Layer toggles always visible. |
| FR-9.2 | On narrow screens the panel stacks below the map. Nothing scrolls horizontally. |
| FR-9.3 | Dense Features are clustered. Each Layer has a distinct icon and colour. Land Opportunities are drawn as outlined shapes, coloured by tag (Possibly Unregistered in a distinct colour). |
| FR-9.4 | Loading, empty, unavailable and not-prepared states are each shown clearly per Layer. |
| FR-9.5 | Accessibility: keyboard-operable controls, WCAG AA text contrast, and all statistics available as text, not only on the map. |

### 6.15 Attribution and licensing

| ID | Requirement |
|---|---|
| FR-10.1 | A persistent attribution footer and the report credit:<br>• © OpenStreetMap contributors (ODbL)<br>• police.uk, HM Land Registry and planning.data.gov.uk data under the Open Government Licence v3.0<br>• Contains OS data © Crown copyright and database right |
| FR-10.1a | Ofsted, GIAS, Census, income and deprivation data are credited under the Open Government Licence v3.0. CCOD/OCOD and EPC data carry the attribution and conditions their licences require (checked during the build). Street View carries Google's own attribution. |
| FR-10.2 | **INSPIRE Index Polygons** carry HM Land Registry's statement ("This information is subject to Crown copyright and database rights [year] and is reproduced with the permission of HM Land Registry"), the Ordnance Survey statement (© Crown copyright and database rights [year] Ordnance Survey AC0000851063), and a link to the dataset's conditions. |
| FR-10.3 | Price Paid attribution follows HM Land Registry's required wording, including address-data conditions. |
| FR-10.4 | Map tile attribution is shown on the map. |

### 6.16 Architecture

```text
Browser (apps/web: React + Vite + MapLibre GL, OSM raster tiles)
   │  /api/*  (documented by OpenAPI)
   ▼
Local backend (apps/api: Hono on Node)
   ├── geocoding   → postcodes.io, Nominatim                       (live)
   ├── crime       → data.police.uk                                (live)
   ├── planning    → planning.data.gov.uk                          (live)
   ├── osm         → Overpass                                      (live)
   ├── property    → postcodes.io + Land Registry SPARQL           (live)
   ├── epc         → Energy Performance of Buildings Data API      (live, key, optional)
   ├── land        → DuckDB over data/<council>/*.parquet          (prepared)
   ├── national    → DuckDB over data/england/*.parquet            (prepared: demographics, schools, CCOD/OCOD)
   ├── highlights  → rules over the calculated statistics
   ├── planningApps→ third-party Planning Applications API          (live, key)
   ├── scoring     → pure functions + Scout Mode config
   ├── explain     → Anthropic API                                 (live, key, opt-in)
   └── in-memory cache

Data preparation (scripts/data-prepare: Node + DuckDB)
   England-wide: Census 2021 · income · deprivation · GIAS + Ofsted · CCOD/OCOD
   Per council:  INSPIRE GML · Geofabrik OSM · planning bulk GeoJSON · ONS boundary
        → data/<council>/*.parquet + manifest.json
```

- **Monorepo** with workspaces: `apps/web`, `apps/api`, `packages/shared`, `scripts/data-prepare`.
- **Backend framework:** Hono, so the same code runs on Node locally and on Cloudflare Workers in Phase 2. The DuckDB-backed land module is the one part that needs a different host or approach when hosted (see Phase 2).
- **Data Source adapters:** one module per Data Source, mapping raw responses into shared types.

### 6.17 Data Sources (Phase 1)

| Data Source | Used for | Access | Key | Notable limits |
|---|---|---|---|---|
| postcodes.io | Postcode lookup, reverse lookup, country, nearest postcodes | REST | None | Nearest radius max 2,000 m, limit 100 |
| Nominatim (OSMF public) | Address search | REST | None (User-Agent required) | 1 request/second |
| data.police.uk | Street-level crime | REST `crimes-street` with `poly` (POST) | None | 15 req/s, burst 30; anonymised; monthly, ~2-month lag |
| planning.data.gov.uk | Planning Constraints (live and bulk) | REST `entity.json`, bulk GeoJSON | None | Planning-application dataset not used (ADR 0003) |
| Overpass API (public) | Amenities, transport, green space | Overpass QL `around:` | None | Fair use |
| HM Land Registry Price Paid | Sold prices | SPARQL | None | Postcode filter; OGL with address-data conditions |
| [PlanIt](https://www.planit.org.uk/api/) (default) | Planning Applications | REST `/api/applics/json?lat=&lng=&krad=` | None (User-Agent with email) | ~1 request/min, ~300/day; free, "no commercial terms"; 9% of records unlocated, 27% postcode-located |
| [PlanWire](https://planwire.io/) (optional) | Planning Applications | REST `/v1/applications/nearby` | **Yes** | 25 requests/day with a free key; intended Phase 2 provider |
| Anthropic API | AI Explanations | Messages API (streaming) | **Yes** (optional) | Off by default |
| HM Land Registry INSPIRE Index Polygons | Possibly Unregistered detection | Monthly GML download per local authority | None | OGL; freehold only; OS attribution required; no API |
| [EPC: Energy Performance of Buildings Data API](https://get-energy-performance-data.communities.gov.uk/api-technical-documentation) (MHCLG; optional) | Energy ratings, floor area for price per m² | REST `https://api.get-energy-performance-data.communities.gov.uk`: `/api/domestic/search?postcode=` (current band, UPRN), `/api/certificate?certificate_number=` (`total_floor_area`, `potential_energy_efficiency_band`) | **Yes**: free bearer token from a GOV.UK One Login account (`Authorization: Bearer`) | 6,000 requests per 5 minutes per IP, `429` beyond; certificates from 2012; OGL except address and postcode, which OS and Royal Mail permit only for energy-efficiency purposes, and personal data; match to sales by UPRN, else by address within the postcode ([OQ-8](../spikes/oq-8-epc-api.md)) |
| HM Land Registry CCOD / OCOD | Company and council ownership | Monthly CSV download | **Yes** (free account) | Licence terms on the download page; no geometry |
| ONS Census 2021, ONS income estimates, English Indices of Deprivation | Demographics | CSV and boundary downloads | None | OGL |
| GIAS and Ofsted | Schools register and inspection outcomes | CSV downloads | None | OGL |
| Google Street View (optional) | Street-level imagery | Maps JavaScript API | **Yes** (optional) | Hidden without a key |
| Geofabrik | OSM extract for land parcels | `.osm.pbf` download | None | England extract ~1.6 GB |
| ONS Open Geography | Council boundaries | GeoJSON download | None | OGL |
| OSM raster tiles | Base map | Tile URLs | None | Light development use only; changed before hosting |

### 6.18 Testing

| ID | Requirement |
|---|---|
| NFR-3.1 | **Unit tests (Vitest)** for every scoring rule, every Scout Mode's weights, every Data Source adapter's mapping (using recorded fixtures), and the Land Parcel tagging rules (using a small fixture area). |
| NFR-3.2 | **End-to-end tests (Playwright)** against a backend stubbed with fixtures:<br>• search → map → Layer toggle → Feature popup → Overview<br>• switch Scout Mode<br>• Highlights shown and linked to Layers<br>• Land Opportunity filter, Ownership Category and popup<br>• sale-history popup<br>• save, compare and report<br>• AI Explanation with a stubbed model |
| NFR-3.3 | No test makes live network calls. An opt-in **smoke script** calls each live Data Source once. |
| NFR-3.4 | Degradation (NFR-1.2), missing prepared data (FR-6.6) and missing API keys are covered by tests. |
| NFR-3.5 | An opt-in AI check runs pre-built questions against recorded inputs and fails if an answer contains a number that isn't in its input. |

### 6.19 Phase 1 success criteria

1. Any valid English postcode loads a complete Location Overview in under 5 seconds uncached.
2. All nine Layers render with working toggles and popups. Land works inside Ashfield and shows "not prepared" elsewhere. Highlights appear for every Scout Mode.
3. Every Scout Mode produces scores with a visible breakdown, and weight sliders change them.
4. The Land Opportunity Finder returns tagged parcels for Ashfield within 3 seconds. A sample of 10 Possibly Unregistered results checked against the HM Land Registry index map shows the flag is useful, not noise.
5. With Planning Applications and AI keys set, both features work. Without them, the app is fully usable and says what is off.
6. With any one Data Source switched off, the app still works and says what is missing.
7. The developer uses it on **20 real Locations** and judges it genuinely useful. Thresholds are tuned as a result.

---

## 7. Cross-phase principles

- **The frontend never knows where data comes from.** Swapping live calls, prepared files or a database never changes the UI.
- **Code decides, AI (if any) explains.**
- **Land Opportunities warrant investigation; they never assert ownership or availability.**
- **Licence first.** For each dataset, check "what are we allowed to store, transform and publish?" before checking "can we download it?"

---

## 8. Later phases

### Phase 2: Hosted business

**Goal:** the full Phase 1 product on a public URL, with real users.

- Frontend on **Cloudflare Pages**; backend on **Cloudflare Workers**; cache in **Workers KV**. GitHub Pages is not used, because its terms forbid commercial SaaS hosting.
- Prepared land files move to **Cloudflare R2**. Land queries run on DuckDB in a small container, or move early to Phase 3's database (OQ-2).
- Base map moves to **MapTiler**. Address geocoding stops using public Nominatim (OQ-3). Planning Applications switch from PlanIt to **PlanWire**, because PlanIt offers no commercial terms. Confirm PlanWire's storage and redistribution terms first (OQ-1).
- **Accounts** (OQ-5), server-side Saved Locations (importing from browser storage), and a minimal user data store.
- **Programmatic SEO pages** per town or postcode district.
- **Hosting options considered:** Cloudflare (chosen: static hosting, Workers, R2), Supabase (Postgres, auth and storage in one; the easiest all-in-one), AWS (CloudFront, Lambda, RDS; most room to scale) or Lightsail (one VM running everything in Docker), Render and Railway (managed app plus Postgres, simple). Supabase is the fallback if auth and storage prove slow to build.
- Privacy-respecting analytics and error monitoring.

### Phase 3: Database and history

**Goal:** answer "how is this area changing?", score against real benchmarks, and keep users coming back.

- **Neon Postgres + PostGIS**; raw files in **R2**.
- **Backfill before launch**, then **scheduled monthly imports**: police archives (about 3 years), Geofabrik OSM, ONS Postcode Directory, Land Registry Price Paid (back to 1995), planning.data.gov.uk bulk, INSPIRE polygons for every English council, and Planning Applications where the licence allows storage.
- Store processed or aggregated data (for example monthly crime per LSOA), not raw national files.
- Features: trend charts, **"what's changed?"**, **watch-area alerts** by email, Category Scores benchmarked against regional and national averages (dropping "beta"), and land changes over time.
- **Area rankings:** "Which Nottinghamshire towns have improved most in three years?", "Where is business growth fastest?", "Where is housing development accelerating?"
- **UPRN linking:** connect sales, EPCs and addresses through HM Land Registry's transaction-to-UPRN lookup, so one property's whole record joins up reliably.

### Phase 4: Growth and scale

**Goal:** widen and harden the product as use grows.

- **Travel-time catchments:** "population within a 10-minute walk or drive", using a routing service (for example OpenRouteService or self-hosted Valhalla). Phase 1 uses straight-line radiuses.
- More Data Sources: broadband (Ofcom Connected Nations), air quality and noise (Defra), Companies House, school performance tables. Radon is excluded because its licence restricts reuse.
- More Scout Modes, driven by demand.
- Read replicas, queueing for imports, dedicated ingestion infrastructure, more map tile capacity, and backups as needed.

## 10. Risks

| Risk | Mitigation |
|---|---|
| A free Data Source changes, rate-limits or disappears | Adapter per source, smoke script, graceful degradation; bulk imports in Phase 3 |
| Fixed-threshold scores mislead | "Beta" label, visible breakdown, adjustable weights, tuning on real Locations; benchmarked in Phase 3 |
| Possibly Unregistered flags are noisy (OSM gaps, freehold-only INSPIRE, boundary slivers) | 50% coverage threshold, minimum size filter, validation against the index map (success criterion 4), clear wording |
| Ownership Categories are wrong because of loose address matching | "Indicative" label, matched address shown, spike before relying on it (OQ-7) |
| Users treat Land Opportunities as available land | Mandatory wording (FR-5.7), links to official ownership checks |
| Competitors copy the UI | Defensible parts are the data pipeline, land analysis, derived metrics and Scout Mode scoring |
| Competitors already have years of history | Backfill before Phase 3; compete on cross-dataset analysis and experience |
| Licensing breach when redistributing data | Licence review per dataset before storing or publishing |
| Public OSM / Nominatim infrastructure misused | Phase 1 local, light use only; replaced before hosting |
| AI Explanation invents or misstates figures | Structured-input-only prompts, number-check test (NFR-3.5), clear labelling |
| Planning Applications provider limits or terms change | Adapter interface (PlanIt / PlanWire), 7-day cache, graceful degradation |

## 11. Competitive landscape

| Competitor | Focus |
|---|---|
| PropertyData | Property investment analytics |
| Crystal Roof | Postcode-level location data and API |
| Praesago | Area and property intelligence, scores, alerts |
| Scapely | Development and property due diligence |
| LandInsight / Nimbus, Searchland | Land and development |

**Positioning:** "Enter anywhere in England and understand everything happening around it, and find land worth investigating." The product is map-first, works across datasets, gives transparent scores, offers several Scout Modes and finds land.

## 11a. Product notes

### What makes this hard to copy

The concept and the interface can be copied in weeks. These can't, and they are where effort should go:

1. **Historical dataset** (Phase 3): years of processed snapshots, not just today's API responses.
2. **Scoring methodology:** the public data is free, but our interpretation of it, in Category Scores, Highlights and Scout Modes, is our own.
3. **Derived metrics:** for example "1,842 planned homes → about 4,100 residents → 1 gym per 3,200 residents → potentially underserved".
4. **Vertical Scout Modes:** offering decisions, not data.
5. **Experience:** map-first, fast, enjoyable to explore.
6. **Alerts** (Phase 3): users come to rely on the product.
7. **Ingestion system:** turning hundreds of messy sources into one consistent dataset.
8. **Licensing discipline:** knowing what can legally be stored, transformed and published.

### Pre-launch task: competitor feature matrix

Before Phase 2 launches, compare about 10 serious UK products (PropertyData, Crystal Roof, Praesago, Scapely, Searchland, LandInsight, Locrating, Nimbus Maps and others) across about 50 features: data sources, historical depth, map layers, alerts, planning, businesses, property, API, scoring, scenario analysis, exports and UX. The question to answer is not "what features do they have?" but "**what do users still have to leave their platform to do?**" The 3–5 most important gaps should shape launch positioning.

## 12. Open questions

| # | Question | Needed by |
|---|---|---|
| OQ-1 | Do PlanWire's terms allow caching and display in a hosted product, and what exactly are its `/nearby` parameters? (Phase 1 default is PlanIt; see ADR 0003.) | Phase 2 |
| OQ-2 | When hosted, should land queries run on DuckDB in a small container, or move early to Postgres/PostGIS? | Phase 2 |
| OQ-3 | Which geocoding provider replaces public Nominatim when hosted? | Phase 2 |
| OQ-4 | Exact Price Paid attribution wording and address-data conditions for display in a hosted product | Phase 2 |
| OQ-5 | Which auth provider for accounts? | Phase 2 |
| OQ-6 | Final product name and domain | Phase 2 |
| OQ-7 | How reliably can CCOD/OCOD titles be matched to INSPIRE polygons by address, and is the result useful enough to show? **Spiked on Ashfield ([findings](../spikes/oq-7-ccod-ocod-title-matching.md)):** with free data, only 5–7% of freehold titles match one polygon by their address or a named building (OpenStreetMap has an address in only 7% of Ashfield's polygons), and only 1.9% of the council's own land does. The matches found are accurate: in a 20-sample check against independently known places, 17 were right, 3 were within 25 m and none were wrong. Land described by its street never narrows to one polygon (a median of 42–53 candidates), and a postcode's point usually lands on a neighbour's polygon. **Recommendation: drop Ownership Categories as FR-5.4a specifies them, and keep Possibly Unregistered.** This was measured on proxies with known places: the council's published land register, and 2026's Price Paid sales with their UPRNs. Running it on CCOD/OCOD, and checking 20 of its matches against HM Land Registry's map search, needs a Use land and property data account and a person. | Phase 1 (answered; CCOD check outstanding) |
| OQ-8 | Which EPC API is current (the register's open-data service has been changing), and what are its auth and rate limits? **Answered ([findings](../spikes/oq-8-epc-api.md)):** `epc.opendatacommunities.org` now redirects every request to MHCLG's **Get energy performance of buildings data** service (beta). Its **Energy Performance of Buildings Data API** is at `https://api.get-energy-performance-data.communities.gov.uk`. It needs a free **bearer token** from a GOV.UK One Login account, and allows **6,000 requests every 5 minutes per IP address**, answering `429` beyond. It covers certificates from 2012. `/api/domestic/search?postcode=` gives each certificate's number, address lines, UPRN, current band and registration date. `/api/certificate` gives one certificate's `total_floor_area`, `current_energy_efficiency_band` and `potential_energy_efficiency_band`. **Licence:** every field except the address and postcode is under the OGL. The address and postcode are Ordnance Survey's and Royal Mail's, permitted only for energy-efficiency purposes, and address-level data is personal data. So the UI shows the sale's Price Paid address, never the certificate's. **Matching:** by the sale's UPRN from HM Land Registry's monthly lookups (sales registered since July 2026), else by flat, house number or name and street among the postcode's certificates, matching only when exactly one property fits. The estimated match rate on Ashfield's 844 sales in 2026 is **about 75–90%** (35% have a UPRN), from published linkages: 93% with AddressBase, about 60% by exact address alone for 2022–2026 sales. Measuring it against real certificates needs a person with a One Login token, and whether matching by EPC address is a permitted use in a hosted product is for OQ-4's licence review. | Phase 1 (answered; match rate to measure) |
