# Developing Location Scout

URL state, tuning, and adding Scout Modes, endpoints, Data Sources, Layers and datasets; the spikes; Sandcastle. Back to the [README](../../README.md).

## Keeping view state in the URL

`apps/web/src/url-state.ts` reads and writes the part of the view kept in the URL (PRD FR-1.7): the Location, the Search Radius, the Scout Mode (`mode`, left out for General), your own weights for it (`weights`, left out for the mode's defaults) and the Layers switched off (`hidden`). To add to it, add a field to `UrlState`, read it in `readUrlState` with a fallback for a missing or invalid value, write it in `writeUrlState`, and cover both in `url-state.test.ts`. `useSearchArea` adds a history entry each time the Location, radius, Scout Mode or a Layer's toggle changes (new state should do the same), and restores the view on reload, Back and Forward. Going Back to a view that differs only in its hidden Layers loads nothing again, and one that differs only in its Scout Mode loads only its scores and Highlights again. A parameter `writeUrlState` doesn't know is kept after its own, so the [printable report](saved-locations-compare-and-report.md#printable-report)'s `view=report` (`src/report/report-view.ts`) stays in the URL when a reloaded report's Search Area loads and corrects it. Weights are the exception to adding a history entry: a slider changes them at every step, so `changeWeights` replaces the current entry once they have been still for `WEIGHTS_URL_DELAY_MS`. The Scout Modes are config, so the URL may name any id; once `/api/modes` answers, `App` puts one it doesn't list back to General, replacing the URL rather than adding to history, and weights that don't suit the mode back to its defaults (`customWeightsFor` in `src/weights.ts`).

## Tuning a score or a Highlight

Every threshold, penalty and weight the scores use is in `SCORING_CONFIG` in `apps/api/src/scoring/config.ts` (PRD FR-3.5). To see what a change does to real Locations, run [`pnpm survey`](testing.md#survey-of-20-locations), which loads 20 real Locations in every Scout Mode and says how each Category Score spread across them; [Phase 1 success checks](../phase-1-success-checks/README.md) is what it found on 9 October 2026, and why Development activity, Property activity, the Retail and Business modes' Competition and the price Highlights were tuned from PRD §6.4's starting points. Say beside a tuned value what it was and why it changed, as the config does. Change a value there and nothing else: the rules in `category-scores.ts` and the text of each breakdown are written from it, and the Location Score's weights come from each Scout Mode's `weights` in `SCORING_CONFIG.modes`. The scoring functions are pure, taking the Layers' statistics and the config, so the same inputs always give the same scores (FR-3.6). `category-scores.test.ts` checks each rule at the values PRD §6.4 gives, including at and either side of each threshold, so it will name any rule a change moves away from the PRD. `scores.test.ts` checks that a threshold changed in a config passed in, or a weight changed in a Scout Mode, changes the scores, with no other change, and `scout-modes.test.ts` checks each mode's weights against PRD FR-4.2. `category-scores.test.ts` checks Schools at and either side of each distance, and for each kind of Ofsted judgement, Safety and Competition per 1,000 residents and, without them, per km², Demand at and either side of 20,000 residents, 20% from the England median and 1,000 new residents from Planning Applications, Development activity at and either side of a weighted count of 250, with a major application counting 5, and Footfall proxy at a weighted count of 250, and `scores.test.ts` checks that each counts per 1,000 residents once the Demographics Layer is `ok`, and falls back to per km², leaving Demand out, when it isn't. To add a Category Score, add its id, name and Layers to `CATEGORY_IDS`, `CATEGORY_NAMES` and `CATEGORY_LAYERS` in `packages/shared/src/scores.ts`, its rule to `category-scores.ts`, its thresholds to the config and its weight to each Scout Mode's `weights`, and its case to `scoreOf` in `scores.ts`. A score from several Layers, as Footfall proxy is from Amenities and Transport, lists them all in `CATEGORY_LAYERS`: it is scored only when every one is `ok`, and otherwise left out, naming the first that isn't.

The Highlights' thresholds are in the same config, in `SCORING_CONFIG.highlights` (PRD FR-3.7): one entry for each rule that has thresholds. Which rules apply is up to each Scout Mode's `highlights` in `SCORING_CONFIG.modes`. Change a threshold or a mode's `highlights` there and nothing else. The rules in `apps/api/src/scoring/highlights.ts` and the text of each Highlight are written from it. Each rule is a pure function of one Layer's response and the config, and none uses AI: `highlights.test.ts` checks each rule at and either side of its thresholds, which Scout Modes give it, and that the rules import nothing but our own code. To add a rule, add its id to `HIGHLIGHT_RULE_IDS` in `packages/shared/src/highlights.ts`, in the order rules are applied; any thresholds to `HighlightsConfig` and `SCORING_CONFIG.highlights`; its id to the `highlights` of each Scout Mode that applies it; and its function to `RULES` in `highlights.ts`, made with `over(layer, …)` so it only runs when that Layer is `ok`.

## Adding a Scout Mode

A Scout Mode is config only (PRD FR-4.5). Add it to `SCORING_CONFIG.modes` in `apps/api/src/scoring/config.ts`, in the order the selector should offer it, and change nothing else:

- `id`: lower-case words joined by hyphens, such as `buy-to-let`. It is kept in the URL as `mode`.
- `name` and `question`, as the user sees them.
- `weights`: each Category Score's weight in the Location Score, out of 100 across every category the PRD gives the mode. Give 0 to one it doesn't weigh; it isn't scored in the mode.
- `competitors`: for a mode about opening a business, what its competitors are called ("cafés") and their OpenStreetMap tags, each a key and its values, or `values: null` for any value, as `shop=*` is. Each must be a tag the Amenities Layer finds (`AMENITY_RULES` in `overpass-amenities.ts`). They make its Competition score, and the map stars them. Give `null` to any other mode, which can't weigh Competition.
- `competitionPerThousand` (optional): for a business commoner than one per 1,000 residents, how many of its competitors per 1,000 residents leave Competition at 0, as `{ full: 0, zero: 3, points: 100 }` does for cafés. Left out, `competition.ratePerThousand`'s 1 per 1,000 applies, as for gyms.
- `highlightedLayers`: the Layers it points out, from `LAYER_IDS`. A Layer not built yet can be named; it is marked once it is built.
- `highlights`: the Highlight rules it applies, from `HIGHLIGHT_RULE_IDS`, in any order.

`GET /api/modes` then lists it, the selector offers it, `/api/scores` weighs the Location Score by it and counts its competitors, the map stars them, and `/api/highlights` applies its rules. `app.test.ts` proves this with a fixture mode, `WITH_FIXTURE_MODE`, added to a copy of the config passed to the app as `scoringConfig`, and nothing else; `scores.test.ts` does the same for a fixture Business mode's competitors. Check the new mode's weights against PRD FR-4.2's table, its competitors' tags and its highlighted Layers in `scout-modes.test.ts`, which also checks that every mode weighing Competition has competitors, and that the Amenities Layer finds each of their tags.

## Adding an API endpoint

Every `/api` endpoint is described in the OpenAPI document, which is generated from the endpoint's own definition with [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi). Its response bodies use the types in `packages/shared` (PRD FR-8.3).

1. **Add the response type to `packages/shared`**, with a type guard for the frontend, for example `CoverageResponse` and `isCoverageResponse`.

2. **Add its schema to `apps/api/src/api-schemas.ts`.** Build it from the shared constants (such as `LAYER_IDS`) rather than repeating their values, and name it with `.openapi("CoverageResponse")`. In `api-schemas.test.ts`, check that it describes the shared type exactly and judges sample bodies the same way as the guard:

   ```ts
   expectTypeOf<
     z.output<typeof CoverageResponseSchema>
   >().toEqualTypeOf<CoverageResponse>();
   ```

3. **Define the route in `apps/api/src/routes.ts`** with `createRoute`. Give it a schema for every parameter and for the body of every status it can answer with. Errors use `ApiErrorResponseSchema`. A parameter's schema validates it as well as documenting it, and its `error` is the message the user gets if it is wrong:

   ```ts
   export const coverageRoute = createRoute({
     method: "get",
     path: "/coverage",
     summary: "List the Land Coverage Areas and their data dates",
     responses: {
       200: json(CoverageResponseSchema, "The prepared Land Coverage Areas."),
     },
   });
   ```

4. **Serve it with `app.openapi`** in `createApp`, never `app.get`. TypeScript then checks each `c.json(body, status)` against the route's schemas, and `c.req.valid("query")` gives you the parsed parameters.

`openapi.test.ts` fails if the API serves a route that the document leaves out, or a parameter or response that has no schema.

## Adding a Data Source adapter

Only `apps/api` calls Data Sources ([ADR 0001](../../docs/architectural-decision-record/0001-local-backend-between-frontend-and-data-sources.md)). Each one gets a module in `apps/api/src/sources/`, with `postcodes-io.ts` as the worked example:

1. **Define the Data Source.** Give it an `id`, the `name` users see and its cache lifetime, taken from PRD NFR-1.4:

   ```ts
   export const police: DataSource = {
     id: "police",
     name: "data.police.uk",
     cacheTtlMs: DAY_MS,
   };
   ```

2. **Write a mapping function** from the raw response to types in `packages/shared`, for example `mapPostcodeResponse(status, body)`. Keep it pure: it is what the fixture tests exercise. Throw if the response is unusable.

3. **Make every call through `callSource`**, the caller that `createApp` builds with `createSourceCaller`. Pass a string that identifies the request (usually its URL, plus the body for a POST). Pass the `signal` you are given to `fetch`. Return the mapped data and the period it covers, or `null` if the source states none:

   ```ts
   export const latestCrimes = (area: SearchArea, callSource: CallSource) =>
     callSource(police, url, async ({ fetch, signal }) => {
       const response = await fetch(url, { signal });
       return {
         data: mapCrimes(await response.json()),
         period: { from: "2026-07", to: "2026-07" },
       };
     });
   ```

   `callSource` never throws. It returns `{ status: "ok", data, period }`, `{ status: "unavailable" }` if the call failed, threw or took over 8 seconds, or `{ status: "not-prepared" }` if the adapter threw `NotPreparedError` because `pnpm data:prepare` files are missing. An `ok` answer is kept in memory for the source's TTL, so a repeated request is answered without calling the source. Failures are not cached. The same request made again while the first is still waiting shares its answer, so `/api/area` and `/api/area/{layer}` arriving together call the source once. The cache is never written to disk and a restart empties it.

   `police.ts` is the worked example of a POST, and of an adapter that makes many calls: the latest month, the crimes for it, then the crimes for each month before. Each is its own `callSource` call, so each is cached and fails on its own.

4. **Add it to the Search Area.** If the Data Source supplies a Layer, add an `AreaSource` to `AREA_SOURCES` in `apps/api/src/sources/area-sources.ts`, naming the Layers it supplies. `/api/area` then lists it under `sources` with its status and data period, and gives each of those Layers a `status`, unless it is asked with `sources=false`, as the frontend asks, when it consults none of them and answers as soon as the Location is checked. If it fails, only those Layers are affected. Then serve the Layer's Features (see [Adding a Layer](#adding-a-layer)).

5. **Respect the service's rate limits and terms** (see [Using the public APIs responsibly](data-sources-and-attribution.md#using-the-public-apis-responsibly)). Send an identifying User-Agent where the service asks for one: an area source or Layer loader is given the app's own (`NOMINATIM_USER_AGENT`) as `userAgent`, as `overpass.ts` uses it. If the service limits how often you may call it, make one limiter for the whole process with `createRateLimiter` from `apps/api/src/sources/rate-limiter.ts`, as `NOMINATIM_LIMITER` in `nominatim.ts` and `POLICE_LIMITER` in `police.ts` do. Make it the default of an `AppOptions` setting, such as `policeLimiter`, so that a test can pass its own. An area source or Layer loader gets it from the `limiters` it is given (`SourceLimiters` in `area-sources.ts`). Inside `load`, wait for a turn before fetching:

   ```ts
   callSource(nominatim, url, async ({ fetch, signal }) => {
     await limiter.wait(signal);
     const response = await fetch(url, { headers, signal });
     // …
   });
   ```

   `OVERPASS_LIMITER` in `overpass.ts` (`overpassLimiter`) is a third. That way a cached answer never waits, and the wait counts towards the 8-second timeout. A request that times out leaves the queue without using a turn. A source whose turns are a minute or more apart, as PlanIt's are, can't wait inside the timeout: give its requests to a queue made with `createSourceQueue` (`apps/api/src/sources/planning-applications.ts`), with a limiter of its own (`PLANIT_LIMITER` in `planit.ts`, `planItLimiter`), as `createPlanIt` does. It passes the limiter to `callSource` as its `turn`, which a request the cache can't answer waits for before its timeout starts, answers `queued` at once to one that must wait, and sends a request again after a `429 Too Many Requests` once the limiter has been held back (`holdFor`) for its `Retry-After`: throw `RateLimitedError` from `load` to say so. If a setting is required, read it in `apps/api/src/config.ts` so the API refuses to start without it and says why.

6. **Test the mapping with recorded fixtures** and the adapter with a stub `fetch` from `apps/api/src/testing/fetch-stubs.ts`: `fixtureFetch` replays a fixture, `neverAnswers` simulates a timeout and `noNetwork` fails any call. No test may call the network (PRD NFR-3.3). Build the app for a route test with `testApp({ fetch })` from `apps/api/src/testing/app.ts`. It supplies a test User-Agent and Nominatim, data.police.uk and Overpass limiters of its own, so tests don't wait on one another. A test that isn't about the rate limit can pass `policeLimiter: createRateLimiter(0)` (or `overpassLimiter`) so it doesn't wait at all; one that is can use fake timers, as `police.test.ts` does. For data.police.uk, `policeFixtures({ lastUpdated, crimesByMonth })` answers each month with its own recording and fails the months it has none for. `/api/area` asks postcodes.io whether the Location is in England before it calls any other source, so wrap your stub in `withPostcodesIo(nearestFixture, yourStub)` to answer that check, for example with `postcodes-io-nearest-mansfield.json`. To answer a postcode lookup and the nearest-postcode lookup differently, as a postcode search followed by its Search Area needs, use `postcodesIoFixtures({ lookup, nearest }, yourStub)`. For planning.data.gov.uk, `planningDataFixtures(bodies)` answers each URL from a map of recordings, such as `NG17_1AA_PLANNING_DATA` or the two pages of `CAMBRIDGE_PLANNING_DATA` in `apps/api/src/testing/planning-data-recordings.ts`, and fails any URL it has none for. For Overpass, `overpassFixtures(bodies)` answers each query by its form body, such as `NG17_1AA_OVERPASS` or `SUTTON_PARKWAY_OVERPASS` in `apps/api/src/testing/overpass-recordings.ts`, and fails any query it has none for. For PlanIt, `planItFixtures(bodies)` answers each URL from a map of recordings, such as `NG17_1AA_PLANIT` in `apps/api/src/testing/planit-recordings.ts`, and fails any URL it has none for; `testApp` gives each app a PlanIt limiter of its own, a minute apart, so a test that asks for two Search Areas' Planning Applications sees the second queued, and `planit.test.ts` uses fake timers to check that PlanIt is never sent more than one request a minute, however many are asked for, and that a `429`'s `Retry-After` holds every request back. For PlanWire, `planWireFixtures(bodies, apiKey)` does the same with `NG17_1AA_PLANWIRE` in `planwire-recordings.ts`, answering only requests whose `X-API-Key` is `apiKey` and refusing any other with `401`; build the app with `testApp({ planWireApiKey })` to use PlanWire. `planwire.test.ts` checks the request, the mapping of every status, type and date, the records left out, when PlanWire may have more, and that after a `429` it is asked nothing until its `Retry-After` or midnight UTC; `config.test.ts` checks that `planwire` without a key falls back to PlanIt, saying why, even as the server starts; and `app.test.ts` checks that the Planning Layer's response has the same shape from either provider. For Price Paid, `landRegistryFixtures(bodies)` does the same with Price Paid's SPARQL queries, such as `NG17_1AA_PROPERTY.pricePaid` in `apps/api/src/testing/property-recordings.ts`, which answers all four of the Property Layer's queries; give `postcodesIoFixtures` the postcodes in the same Search Area as `inSearchArea: NG17_1AA_PROPERTY.postcodes`. `testApp` asks on the day those were recorded, so its queries match them. An app is given today's date with its `today` option, and a Layer loader or area source gets it as `today`, for a Layer that covers the last 12 months.

7. **Give the end-to-end tests a recording.** Add a fixture for the new source to `recordedFetch` in `apps/api/src/testing/fixture-fetch.ts` (see [End-to-end tests](testing.md#end-to-end-tests)). Without one, the fixture-backed API reports the source as unavailable.

8. **Give the smoke script a check.** Add a `SmokeCheck` for the new source to `SMOKE_CHECKS` in `apps/api/src/smoke/smoke-checks.ts`: its `id` and `name`, what `skip`s it (a key that isn't set), and a `run` that calls your adapter once with the `callSource` it is given, passes the result to `answered`, which gives the data or throws why the call failed, and checks the answer has what it always has, saying what it found. Add it to the run against the recordings in `smoke-checks.test.ts`, which fails until every live Data Source has a check ([Smoke script](testing.md#smoke-script)).

## Adding a Layer

Each Layer is served on its own at `GET /api/area/{layer}`, so the map shows it as soon as its Data Sources answer (PRD NFR-2.3). The frontend asks for every Layer at once, with the Search Area itself from `/api/area?sources=false`, which waits for none of their Data Sources, so the map is drawn without waiting for the slowest of them. The Crime Layer is the worked example.

1. **Describe its response in `packages/shared`**, like `CrimeLayerResponse` in `crime.ts`: `layer`, `status`, `sources`, its Features (each extends `Feature`, with an `id`, a `location` and its `distanceMetres` from the Location) and its statistics, which are `null` unless `status` is `ok`. Add it to the `LayerResponse` union and `isLayerResponse` in `layer.ts`, and its id to `SERVED_LAYER_IDS`.

2. **Give it a schema** in `apps/api/src/api-schemas.ts`, add it to `LayerResponseSchema`, and check it in `api-schemas.test.ts` as described in [Adding an API endpoint](#adding-an-api-endpoint).

3. **Load it** with a function in `apps/api/src/layers.ts`, added to `LAYER_LOADERS`. It calls the Layer's adapters through `callSource`, passing on any limiter they need from `limiters`, and reports each source with `sourceReport`. A Layer read from what `pnpm data:prepare` prepared is given it as `prepared`, as `loadDemographicsLayer` is. It never throws: a failed source gives `status: "unavailable"` with no Features. `/api/area/{layer}` checks the Location is in England first, exactly as `/api/area` does.

   A Layer from OpenStreetMap, such as Amenities, doesn't make a query of its own: every Layer from OpenStreetMap shares one Overpass query per Search Area (PRD NFR-1.5). Add an `OsmSelection` to `OSM_SELECTIONS` in `apps/api/src/sources/overpass.ts`, naming the Layer and the Overpass QL tag filters that find its elements, such as `["leisure"="park"]` (`tagFilter` in `overpass-filters.ts` writes one). `overpassQuery` joins every Layer's filters into the one query, and the Overpass area source then reports each of those Layers. Three more kinds of filter are there if you need them, as `TRANSPORT_SELECTION` and `GREEN_SPACE_SELECTION` use them: `lineFilters` find ways drawn as lines, which come with their `line` as well as their point; `areaFilters` find nodes, ways and relations mapped as areas, a way coming with its `line` and a relation with its `members`' lines and roles; and `wider` looks further out than the Search Area, with `filters`, `areaFilters` or both, for a Layer that measures how far the nearest of something is. (`ruleFilters` in `overpass-filters.ts` writes one filter per key from a list of tag rules.) In the loader, call `osmElements` as `loadAmenitiesLayer` and `loadTransportLayer` do, and pick out the elements your Layer recognises by their tags, as `mapAmenities` does with `classifyAmenity`. Every element comes with its tags and a point: its own, or the middle of a way or relation. Elements of other Layers come too, and a `wider` filter's from outside the Search Area, so check both. `clipLineToCircle` in `apps/api/src/shapes.ts` cuts a line off at the Search Area's edge. `outlineOf` in `overpass-green-space.ts` turns an area's lines into a shape, with `joinRings` and `polygonsOf` from `shapes.ts`, and `placeShape` marks a shape where it comes nearest the Location. The query changes for every Search Area, so re-record `overpass-ng17-1aa.json` and `overpass-sutton-parkway.json` with the new query's bodies (`overpassBody(NG17_1AA_AREA)` and `overpassBody(SUTTON_PARKWAY_AREA)`).

4. **Draw it** in `apps/web`. Give it a name, colour, icon and popup details in `LAYER_STYLES` (`src/layers/layer-styles.ts`). White text on its colour must meet WCAG AA, and the colour must stay clear of the Search Area's blue, which the end-to-end tests look for. If its Features can have a shape, as Planning Constraints' and green spaces' outlines and footpaths' lines do, give it a `shapeColour`: `FeatureShapes` (`src/map/feature-shapes.ts`) then draws each Feature's `shape` under the Search Area circle, filling only polygons, and its marker still opens its popup. Add it to `loadingLayers` and `unavailableLayer` in `useSearchArea.ts`. The toggle, the clusters and the popups then come for free. Show its statistics in `LocationOverview.tsx` inside a `LayerOverview`, which already handles the loading, unavailable and not-prepared states, checking `layer` to narrow the response to your Layer's.

5. **Test it**, including with its Data Source failing, and give `recordedFetch` a recording so the end-to-end tests can show it.

### Recording fixtures

A fixture is a real response body saved as JSON in `apps/api/src/sources/fixtures/`. Record one with a single live call:

```bash
pnpm --filter @location-scout/api fixture:record postcodes-io-ng17-1aa \
  https://api.postcodes.io/postcodes/NG171AA

# A POST with a body and headers, and a User-Agent the service can contact you on
pnpm --filter @location-scout/api fixture:record police-ng17-1aa \
  https://data.police.uk/api/crimes-street/all-crime \
  --method POST --header "content-type: application/x-www-form-urlencoded" \
  --body "poly=53.13,-1.27:53.13,-1.25:53.11,-1.25" \
  --user-agent "location-scout-dev (you@example.com)"
```

Overpass answers 406 Not Acceptable to a User-Agent whose contact is a placeholder such as `you@example.com`, so give your own address, or leave `--user-agent` out to send the recorder's own. Name the fixture `<source id>-<what was asked>` in lower case, for example `police-ng17-1aa-2026-08` for one month of crimes. The recorder saves the body formatted for Prettier and prints the HTTP status. If the status isn't 200, replay it with that status, for example `fixtureFetch(notFound, { status: 404 })`. Each run makes one live call, so space runs out to respect the service's rate limits. Check the response holds nothing personal before you commit it.

## Preparing a dataset

Data with no live API is prepared once by `pnpm data:prepare` and queried with DuckDB ([ADR 0004](../../docs/architectural-decision-record/0004-prepared-local-files-queried-with-duckdb.md)). The council boundaries are the worked example.

1. **Download it** in a module in `scripts/data-prepare/src/`, as `downloadCouncilBoundaries` in `council-boundaries.ts` does, with the `fetch` it is given, so that a test can pass a recording. Keep where it comes from and the date its data dates from in one constant, as `COUNCIL_BOUNDARIES` does, so a new edition changes nothing else. A source published afresh, as GIAS is daily and Ofsted's inspections monthly, keeps where to find it in its constant instead, and finds the latest edition and its date as it runs, as `loadSchools` in `schools.ts` does. `queryPages` in `arcgis.ts` asks an ONS Open Geography layer for a page at a time while it says there are more, handing each page on as it arrives, so a large layer such as the output areas is never all in memory; `downloadFile` in `demographics.ts` saves a file as it downloads. Check a source's column names before you read it, as `loadDemographics` does, so a new edition that changes them stops the run, naming what is missing.

2. **Convert it** in `prepareData` (`scripts/data-prepare/src/prepare.ts`), or, for a Land Coverage Area's own data, in `prepareLandData` (`land-data.ts`), with the DuckDB connection it opens with the spatial extension loaded. `ST_Read` reads GeoJSON (and GML, shapefiles and more), and `COPY (…) TO '<file>' (FORMAT parquet)` writes a geometry column as GeoParquet. Write each file to its `partial(file)` path: once every file is ready, `prepareData` moves them over the last run's and writes the manifest. An England-wide dataset goes in `data/england/`; a Land Coverage Area's in its own folder (`councilFolder`), clipped to its boundary with `clipped`, which keeps what reaches within `CLIP_MARGIN_METRES` of it. Write it with `copyToParquet` (`duckdb.ts`): DuckDB writes GeoParquet's metadata from the shapes it writes, so a file with none, such as a council's Article 4 directions where it has none, would be read back as bytes, and `copyToParquet` writes such a file again with the metadata given.

3. **List it in the manifest** with its `id`, `name`, `source`, `sourceUrl`, `sourceDate`, `preparedAt` and `file`, in `datasets` or in its Land Coverage Area's `datasets`. Give its id a constant in `packages/shared/src/prepared-data.ts`, as `COUNCIL_BOUNDARIES_DATASET` is, so the backend finds it by the same name.

4. **Query it in the backend** through `callSource`, like any Data Source, with the `PreparedData` the app is given (`apps/api/src/sources/prepared-data.ts`): find the dataset in `await prepared.manifest()`, then `prepared.query(dataset, sql, values)`, where `$1` is the dataset's file and your values follow, as `councilAt` does. To join several datasets, give a list of them: their files are `$1`, `$2`… in order, and your values follow, as `outputAreasIn` does with the Demographics Layer's four. A Layer, rather than a feature, adds an `AreaSource` for each dataset to `AREA_SOURCES`, so `/api/area` reports it, and gets `prepared` in its loader. Both throw `NotPreparedError` if the manifest or the file is missing, so its Layer or feature reads `not-prepared` and says to run `pnpm data:prepare`; anything else is `unavailable`. Give its Data Source a `cacheTtlMs` of 0, so a re-run shows at once. The server reaches the files only through DuckDB, never through `node:fs` (`no-disk-writes.test.ts` checks).

5. **Test it** without downloading. Record a small part of the source in `scripts/data-prepare/src/fixtures/`, as `ons-council-boundaries.json` is, answer it from a `fetch` like `recordedBoundaries`, and check `prepareData`'s files and manifest in `prepare.test.ts`. Then make the backend's fixture again with `pnpm --filter @location-scout/data-prepare fixture:prepare`, which runs `prepareData` on the recordings into `apps/api/src/testing/prepared-data/`; `prepare.test.ts` fails if that fixture differs from what `pnpm data:prepare` would make. A route test reads it with `testApp({ preparedData: PREPARED_DATA_FIXTURE })` (`apps/api/src/testing/app.ts`); `testApp` otherwise has nothing prepared.

## Matching titles to INSPIRE Index Polygons (OQ-7 spike)

`pnpm --filter @location-scout/data-prepare spike:title-matching` measures how well registered titles can be matched to Ashfield's INSPIRE Index Polygons by address, as FR-5.4a's Ownership Categories would need. What it found, and the recommendation to drop the categories as specified, are in [docs/spikes/oq-7-ccod-ocod-title-matching.md](../../docs/spikes/oq-7-ccod-ocod-title-matching.md).

It downloads its open sources once into the git-ignored `data/spikes/oq-7/`: INSPIRE, Geofabrik's Nottinghamshire and Derbyshire extracts, Code-Point Open, Ashfield District Council's land register, 2026's Price Paid Data with its UPRN lookups, and OS Open UPRN, which is about 620 MB. It then writes `oq-7-title-matching-results.md` to `--out`. A run takes about two minutes once the sources are downloaded, most of it reading OS Open UPRN. With `--ccod` and `--ocod` pointing at HM Land Registry's unzipped CSVs, which need a Use land and property data account, it matches their titles too, and lists 20 matches to check by hand against HM Land Registry's map search. It is a spike, not part of `pnpm data:prepare`, which uses its matching with only its trusted steps ([Ownership Categories](preparing-land-data.md#prepare-land-data-optional)).

## Matching EPCs to Price Paid sales (OQ-8 spike)

`EPC_API_KEY=<token> pnpm --filter @location-scout/data-prepare spike:epc-matching --out ../../docs/spikes` measures how many of Ashfield's 2026 Price Paid sales can be matched to an Energy Performance Certificate, as FR-2.6's price per m² needs. Which EPC API is current, its token, limits, fields and licence, and the recommended matching, are in [docs/spikes/oq-8-epc-api.md](../../docs/spikes/oq-8-epc-api.md).

It downloads 2026's Price Paid Data and HM Land Registry's lookups from a sale to its UPRN once into the git-ignored `data/spikes/oq-8/`, and writes `oq-8-epc-matching-results.md` to `--out`. Without a token it describes only the sales. With one, it asks the API for every certificate in the sales' postcodes, one request every 150 ms, matches each sale with `matchSale` (`epc-matching.ts`), UPRN first and then by address, checks the address matches against the UPRN, and fetches each matched certificate's floor area and ratings. It never writes a certificate's address, which the EPC licence restricts to energy-efficiency purposes.

## Working issues with Sandcastle

[Sandcastle](https://github.com/mattpocock/sandcastle) runs a coding agent against a GitHub issue inside a Docker container and brings its commits back to your branch. Its configuration lives in `.sandcastle/`.

```bash
cp .sandcastle/.env.example .sandcastle/.env   # credentials (never commit)
pnpm exec sandcastle docker build-image        # once, and after any Dockerfile change
git checkout -b issue-9-short-name origin/main # never run from main
pnpm sandcastle 9                              # work issue #9
```

See [docs/processes/running-sandcastle.md](../../docs/processes/running-sandcastle.md) for setup, writing prompts, landing a run and troubleshooting.
