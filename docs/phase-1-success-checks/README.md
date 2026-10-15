# Phase 1 success checks

PRD [§6.19](../product-requirements-document/location-scout-prd.md#619-phase-1-success-criteria)'s seven success criteria, checked on 9 October 2026 for issue #49, with the evidence for each, the 20 real Locations used, what was tuned because of them and why, and what a person still has to do. Back to the [README](../../README.md).

The checks were run by a coding agent in a sandbox in a data centre, not by a person on a home connection. Everything that could be measured there was measured: [`pnpm survey`](../guides/testing.md#survey-of-20-locations) loaded the 20 Locations with the live Data Sources and Ashfield's land data prepared by `pnpm data:prepare`, and the tests and end-to-end tests were run. Two things can't be done by an agent: judging whether the app is _genuinely useful_ (criterion 7), and checking Possibly Unregistered land against HM Land Registry's index map, which needs a person signed in to its service (criterion 4). They are listed under [What a person still has to do](#what-a-person-still-has-to-do).

- [The 20 Locations](#the-20-locations)
- [The success criteria](#the-success-criteria)
- [What was tuned, and why](#what-was-tuned-and-why)
- [What wasn't tuned, and why](#what-wasnt-tuned-and-why)
- [Defects and limits found](#defects-and-limits-found)
- [Possibly Unregistered land to check](#possibly-unregistered-land-to-check)
- [What a person still has to do](#what-a-person-still-has-to-do)
- [Is Phase 1 ready for Phase 2?](#is-phase-1-ready-for-phase-2)

## The 20 Locations

Four of each kind issue #49 names, each found by its postcode as a user would search for it, and each checked with postcodes.io and Nominatim to be in England and of its kind. Nine are in Ashfield, the default Land Coverage Area, so the Land Layer has land to show; the rest are spread across England. They are `SURVEY_LOCATIONS` in `apps/api/src/survey/locations.ts`.

| Kind | Locations |
|---|---|
| Town centre | Sutton-in-Ashfield (NG17 1AA), Kirkby-in-Ashfield (NG17 7BA), York, Coppergate (YO1 8RS), Camden Town, London (NW1 8NH) |
| Suburb | Skegby, Sutton-in-Ashfield (NG17 3FP), Huthwaite (NG17 2NW), Bishopston, Bristol (BS7 8PB), Headingley, Leeds (LS6 3HN) |
| Village | Westwood, Selston (NG16 6DP), Jacksdale (NG16 5JU), Bibury, Cotswolds (GL7 5NW), Grantchester, Cambridge (CB3 9NF) |
| Rural edge | Teversal (NG17 3JN), Annesley (NG15 0AR), Hexham, west edge (NE46 2NB), Okehampton, south edge (EX20 1EL) |
| Industrial | Sherwood Business Park, Annesley (NG15 0DT), Trafford Park, Manchester (M17 1PA), Attercliffe, Sheffield (S9 3SA), Threemilestone Industrial Estate, Truro (TR4 9LD) |

[Survey of 20 Locations](survey-of-20-locations.md) is what `pnpm survey` wrote, **before the tuning below**, from two runs on 9 October 2026: the first surveyed all 20, and once Overpass answered again, a second (`--retry`) surveyed the six it hadn't answered for. It gives, for each Location, how long it took, the Layers that weren't `ok`, every Scout Mode's Location Score, every Category Score with the figures and points behind it, its Highlights, and how each Category Score spread across the 20.

### Observations

- **The scores rank the Locations in an order that looks right**, though a person should judge that. In the General Scout Mode the leafy inner suburbs score highest (Bishopston 84, Headingley 77), market towns and their edges next (Huthwaite 72, Kirkby-in-Ashfield 70, Hexham 70), and the Locations with little around them lowest: Bibury 38 (no park, healthcare or station, and 140 crimes a year per 1,000 of its 94 residents, from its visitors) and Teversal 53. Homebuyer favours the suburbs and villages with schools nearby; Development favours Kirkby-in-Ashfield (87 before the tuning), with no Planning Constraints and a busy planning register. Where a Layer is missing the score moves, as it should and says: Attercliffe was 40 in the first run, with Safety 0 but no Amenities, Transport or Green space, and 59 in the second, with them.
- **Town centres are always "High crime".** Sutton-in-Ashfield, York, Camden Town and Attercliffe have 218 to 536 crimes a year per 1,000 residents, so Safety is 0 and each gets a 🔴 Concern. Per resident is the PRD's measure, and a town centre's crimes are committed among many more people than live there, so this says as much about footfall as risk. It is said plainly in the breakdown; see [What wasn't tuned](#what-wasnt-tuned-and-why).
- **The Highlights read as a person would sum up each Location**: a flood zone 3 within 500 m at 11 of the 20, a conservation area at the seven historic centres and villages, "No convenience store or supermarket" and "No GP, pharmacy or other healthcare" at the villages and rural edges, a station 30 m away in Camden Town and 140 m away at Okehampton. Rural Locations get mostly 🟠 Watch Highlights and few 🟢 Good ones: Grantchester 0 Good and 6 Watch. That is fair for someone who needs a shop and a bus, less so for someone wanting quiet.
- **The median price change was noise where sales were few**: Camden Town "down 51.8%" from 14 sales, Sherwood Business Park "up 38.3%" from 13, York "up 30.2%" from 18, Attercliffe "down 23.1%" from 10. Tuned below.
- **Several scores couldn't tell the Locations apart**: Development activity was 100 at 9 of the 20, Property activity never above 65, and Competition 0 at almost every Location with a high street in the Retail, Café, Takeaway, Hairdresser and Convenience store modes. Tuned below.
- **Land works inside Ashfield and says "not prepared" elsewhere**: the nine Ashfield Locations have 0 to 15 Land Opportunities in their Search Areas (Annesley's 6 include 2 Possibly Unregistered), and the eleven elsewhere read "Land data not prepared for this area". Across Ashfield there are 288 Land Opportunities with FR-5.3's default filters, and 18 of them are Possibly Unregistered.
- **Overpass was the slowest Data Source, and stopped answering.** York, Camden Town, Bishopston and Annesley took 5 to 7.6 seconds, waiting for it. At Okehampton and Sherwood Business Park it timed out after 8 seconds, then refused every connection from the sandbox for about 45 minutes, so the Amenities, Transport and Green space Layers of the last six Locations were "Unavailable" while the rest loaded (criterion 6 working). They were surveyed again once it answered, when it took 2.5 to 5.6 seconds.
- **data.police.uk answered `429 Too Many Requests` for some months at most Locations**, as `pnpm bench` found from the same data centre: 11 of Okehampton's 24 months in the second run, and for the last four Locations every month at first, so their Crime Layer read "Unavailable" until the scores asked again. The Crime Layer scales the months it has up to a year, so Safety is still scored, but there is no year-on-year change, so the crime trend Highlights rarely appeared (York and Camden Town had them).

## The success criteria

✅ met, with the evidence; 🟡 met here as far as an agent can take it, with what a person must still do; ❌ not met.

| # | Criterion (PRD §6.19) | | Evidence |
|---|---|---|---|
| 1 | Any valid English postcode loads a complete Location Overview in under 5 seconds uncached. | ❌ | Of the 16 Locations whose Search Area loaded with every Layer answering, 12 loaded in 2.6 to 4.2 seconds and 4 in 5 to 7.6 (York, Camden Town, Bishopston and Annesley), each waiting for Overpass, which answers in 3.6 to 5 seconds when it isn't busy and times out when it is ([Survey](survey-of-20-locations.md#locations); `pnpm bench` found the same, [Benchmark](../guides/testing.md#benchmark)). The page never waits for it: the map and each Layer show as they arrive (NFR-2.3, `App.test.tsx`), and from the cache it loads in under 1 second when every source had answered, about 120 ms (`pnpm bench --recorded`). It is met for most Locations, but not for "any": that needs Overpass to answer faster than the public instance does, which is for hosting to solve (Phase 2). |
| 2 | All nine Layers render with working toggles and popups. Land works inside Ashfield and shows "not prepared" elsewhere. Highlights appear for every Scout Mode. | ✅ | Live: all nine Layers answered `ok` at the 15 Locations surveyed in full (Land not prepared outside Ashfield); the nine Ashfield Locations had 0 to 15 Land Opportunities each and the eleven elsewhere read "Land data not prepared for this area"; every Location had Highlights in every Scout Mode it was asked in, 2 to 9 of them. In the browser, against the recordings: each Layer's toggle, markers and popup (`crime-layer.spec.ts`, `planning-applications.spec.ts`, `amenities-layer.spec.ts` and the rest), the Land Layer in Ashfield and "not prepared" in Mansfield (`land-layer.spec.ts`), and each Scout Mode's Highlights (`scout-modes.spec.ts`, `highlights.spec.ts`). A person has not yet clicked through them on live data. |
| 3 | Every Scout Mode produces scores with a visible breakdown, and weight sliders change them. | ✅ | Live: the 15 Locations surveyed in full have a Location Score and each Category Score's breakdown in all 14 Scout Modes. In the browser: each mode's scores and breakdown (`scout-modes.spec.ts`, `business-scout-modes.spec.ts`, `scores.spec.ts`), and the sliders (`score-weights.spec.ts`, `keyboard.spec.ts`). |
| 4 | The Land Opportunity Finder returns tagged parcels for Ashfield within 3 seconds. A sample of 10 Possibly Unregistered results checked against the HM Land Registry index map shows the flag is useful, not noise. | 🟡 | With Ashfield prepared on 9 October 2026, `/api/land` across Ashfield found 288 Land Opportunities among 411 Land Parcels in 0.52 seconds, and in 0.18 to 0.26 seconds in other orders and with Possibly Unregistered only, each tagged with Possibly Unregistered, its Planning Constraints, flood zone, estimated capacity, road distance and area. The 10 are [chosen and listed below](#possibly-unregistered-land-to-check); checking them needs a person signed in to HM Land Registry's service. |
| 5 | With Planning Applications and AI keys set, both features work. Without them, the app is fully usable and says what is off. | 🟡 | Planning Applications come from PlanIt without a key, and it answered at all 20 Locations, through its once-a-minute queue. No PlanWire or Anthropic key was available, so neither was used live; against stubs that answer as they do, PlanWire (`planning-applications.planwire.spec.ts`) and AI Explanations (`ai-explanations.anthropic.spec.ts`) work, and without a key no Explain button is offered (`ai-explanations.spec.ts`) and PlanWire falls back to PlanIt, saying why (`config.test.ts`). A person with the keys should run `pnpm smoke` and `pnpm test:ai` and try both in the app. |
| 6 | With any one Data Source switched off, the app still works and says what is missing. | ✅ | Live, by accident: with Overpass refusing connections, the Amenities, Transport and Green space Layers read "Unavailable" while the rest loaded, and the scores left them out and said so; with data.police.uk refusing, the Crime Layer did the same. Tested for every Data Source: each failing or timing out alone (`app.test.ts`), data.police.uk failing in the browser (`crime-layer.spec.ts`), nothing prepared (`*.not-prepared.spec.ts`) and no keys. |
| 7 | The developer uses it on 20 real Locations and judges it genuinely useful. Thresholds are tuned as a result. | 🟡 | The 20 Locations were surveyed (above), and Development activity, Property activity, six Scout Modes' Competition and the price Highlights were tuned from what they showed ([below](#what-was-tuned-and-why)). Whether it is _genuinely useful_ is a person's judgement, on their own Locations, in the browser. |

## What was tuned, and why

Every threshold is in `SCORING_CONFIG` (`apps/api/src/scoring/config.ts`), which says beside each tuned value what it was and why it changed. PRD §6.4 says of its rules, "The values are starting points, to be tuned against real Locations", so the PRD is unchanged: its table is where the thresholds started. Each change was judged by one test: does the score or Highlight now tell the 20 Locations apart in the order a person would put them, without moving any Location the wrong way? The before and after below are worked out from the figures the survey recorded, by the rules before and after.

### Development activity: 100 points at a weighted count of 250, not 100

At 100, nine of the 20 scored 100: all four town centres, both city suburbs, Hexham's west edge (126 applications), Attercliffe (100) and Bibury, a Cotswold village of 94 residents with 143, where a conservation area full of listed buildings needs consent for work that elsewhere doesn't (Development activity counts every application PlanIt has; see [Defects and limits found](#defects-and-limits-found)). A town has 100 to 140 weighted applications in 3 years within half a mile and a city 460 to over 1,000, so 100 couldn't tell a market town from central London. At 250 a town scores about half, Bibury 57, and only the cities 100.

| | Before | After |
|---|---|---|
| Scored 100 | 9 of 20 | 4 of 20 (York, Camden Town, Bishopston, Headingley) |
| Median | 71 | 28.5 |
| Sutton-in-Ashfield (NG17 1AA) | 100 | 54 |
| Kirkby-in-Ashfield | 100 | 41 |
| Bibury | 100 | 57 |
| Hexham, west edge | 100 | 50 |
| Skegby, the least of the suburbs | 34 | 14 |

### Property activity: 100 points at 60 sales in 12 months, not 100

No Location reached 100 sales: the most was 65 (Bishopston), the median 21. The Property Layer counts the sales in the Search Area's nearest 100 postcodes, as many as postcodes.io gives (PRD FR-2.8), and 100 postcodes hold about 1,500 homes (a postcode has about 15 addresses on average), of which about 4% sell in a year: about 60. So PRD §6.4's 100 could only be reached where postcodes are unusually large. At 60, the busiest suburbs score 100 (Huthwaite's 64 sales and Bishopston's 65), the town centres 23 to 88, and the villages and rural edges 2 to 43. The "Active market" Highlight, given at Property activity's full points, moves with it, from 100 sales to 60; at 100 it was never given.

### Competition: each common business has its own rate

PRD §6.4 gives Competition 0 at one competitor per 1,000 residents, for every Retail and Business mode. That suits gyms, dental practices and nurseries, which the towns and suburbs surveyed have 0.1 to 0.6 of per 1,000. But they have 5 to 16 shops, 1 to 3 cafés, 1 to 2.3 takeaways, 1.2 to 1.9 hairdressers and 0.5 to 1.2 convenience stores per 1,000, so Competition was 0 wherever there was a high street: Retail at 11 of the 15 Locations surveyed in every mode, Café at 10, Takeaway and Hairdresser at 7. A Scout Mode can now give its own rate (`competitionPerThousand`), and each of the six whose business is common falls to 0 at about twice the rate of the towns surveyed, so a typical high street scores about half and only a saturated one 0:

| Scout Mode | 0 points at, per 1,000 residents | Competition 0, before → after | Median, before → after |
|---|---|---|---|
| Retail (shops) | 20 | 11 → 2 of 15 | 0 → 62 |
| Business: Café | 3 | 10 → 3 | 0 → 57 |
| Business: Restaurant | 3 | 5 → 3 | 85 → 97 |
| Business: Takeaway | 4 | 7 → 1 | 13 → 70 |
| Business: Hairdresser | 3 | 7 → 1 | 23 → 73 |
| Business: Convenience store | 2 | 6 → 2 | 46 → 70 |
| Business: Gym, Dental practice, Nursery | 1, as before | unchanged | unchanged |

York's centre, with 55 shops and 12 cafés per 1,000 of its few residents, still scores 0 in each; Sutton-in-Ashfield's café Competition goes from 0 to 60 (1.2 cafés per 1,000, the nearest over 100 m away). Competition still counts per resident, so a town centre with few residents and many visitors scores low; see below.

### Highlights: a change in median price needs 20 sales in each 12 months, not 10

The four largest changes in median price came from fewer than 20 sales: Camden Town down 51.8% from 14, Sherwood Business Park up 38.3% from 13, York up 30.2% from 18 and Attercliffe down 23.1% from 10. No market moves that fast; a few flats sold one year and houses the next do. With 20, those four aren't given, and Sutton-in-Ashfield's (24 sales, up 13.8%), Kirkby-in-Ashfield's, Hexham's and the rest still are. Changes of 20% or so from more sales (Skegby, 54 sales, down 22.1%; Westwood, 26 sales, up 23.2%) are still given: whether to compare like with like, by property type, is a rule for later, not a threshold.

### The Location Scores, before and after

Each Location Score before and after, in the modes the tuning changes; Gym, Dental practice and Nursery change only through Property activity, which they don't weigh, so they are left out. Both sides are worked out from the Category Scores the survey recorded in the General Scout Mode, with the Scout Modes' weights, so a "before" may differ by a point or two from the survey's own table where data.police.uk answered for more months when another mode was asked. The six Locations surveyed again were asked only in General, as data.police.uk wasn't answering for every month (see `pnpm survey`).

| Location | General | Homebuyer | Buy-to-let | Investment | Development | Retail | Café | Restaurant | Takeaway | Hairdresser | Convenience store |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sutton-in-Ashfield | 62 | 66 → 67 | 61 → 62 | 68 → 60 | 76 → 67 | 53 → 55 | 44 → 59 | 56 → 63 | 41 → 52 | 37 → 44 | 30 → 44 |
| Kirkby-in-Ashfield | 70 → 71 | 71 → 73 | 73 → 78 | 78 → 72 | 87 → 78 | 48 → 52 | 40 → 54 | 61 → 64 | 34 → 43 | 34 → 47 | 27 → 39 |
| York, Coppergate | 63 → 64 | 68 → 69 | 62 → 65 | 68 → 71 | 72 → 74 | 63 | 51 | 56 | 49 | 44 | 36 |
| Camden Town, London | 62 → 63 | 67 → 68 | 61 → 63 | 66 → 69 | 71 → 73 | 78 → 79 | 63 | 68 | 68 → 77 | 63 → 75 | 58 → 69 |
| Skegby, Sutton-in-Ashfield | 60 → 63 | 63 → 65 | 58 → 66 | 53 → 57 | 65 → 66 | 28 → 37 | 43 → 47 | 47 | 24 → 39 | 47 | 33 → 42 |
| Huthwaite | 72 → 74 | 75 → 77 | 68 → 76 | 62 → 65 | 71 → 70 | 35 → 42 | 50 → 54 | 46 → 51 | 23 → 34 | 27 → 37 | 23 → 35 |
| Bishopston, Bristol | 84 → 87 | 85 → 87 | 83 → 92 | 86 → 94 | 87 → 93 | 76 → 81 | 63 → 71 | 68 → 76 | 62 → 79 | 62 → 72 | 59 → 71 |
| Headingley, Leeds | 77 → 79 | 80 → 81 | 72 → 76 | 75 → 80 | 75 → 78 | 65 → 72 | 54 → 69 | 59 → 68 | 51 → 67 | 53 → 65 | 63 → 71 |
| Westwood, Selston | 59 | 63 → 64 | 49 → 52 | 46 → 44 | 62 → 58 | 27 → 32 | 20 → 34 | 41 | 39 | 44 | 46 |
| Jacksdale | 68 → 69 | 73 | 55 → 58 | 48 | 61 → 59 | 28 → 35 | 39 → 45 | 49 | 20 → 34 | 28 → 40 | 35 → 40 |
| Bibury, Cotswolds | 38 → 36 | 37 | 34 → 32 | 46 → 36 | 55 → 45 | 20 | 17 | 18 | 38 | 41 | 14 |
| Grantchester, Cambridge | 56 → 53 | 59 | 46 → 43 | 50 → 38 | 63 → 50 | 27 → 33 | 23 → 32 | 44 | 42 | 48 | 51 |
| Teversal | 53 | 60 | 39 | 35 → 32 | 48 → 45 | 27 | 16 → 31 | 37 | 36 | 41 | 45 |
| Annesley | 64 → 63 | 69 | 55 → 54 | 42 → 39 | 57 → 54 | 44 | 55 | 50 | 45 | 54 | 54 |
| Hexham, west edge | 70 | 71 → 72 | 63 → 68 | 68 → 63 | 81 → 73 | 36 → 39 | 51 | 46 | 43 | 41 → 48 | 53 |
| Okehampton, south edge | 63 → 62 | – | – | – | – | – | – | – | – | – | – |
| Sherwood Business Park, Annesley | 59 | – | – | – | – | – | – | – | – | – | – |
| Trafford Park, Manchester | 74 → 73 | – | – | – | – | – | – | – | – | – | – |
| Attercliffe, Sheffield | 59 → 57 | – | – | – | – | – | – | – | – | – | – |
| Threemilestone Industrial Estate, Truro | 67 | – | – | – | – | – | – | – | – | – | – |

No Location moved against what its own figures say. Investment and Development fall at the towns whose Development activity was held at 100, Sutton-in-Ashfield's Investment from 68 to 60, and rise at the busy suburbs whose sales were undercounted, Bishopston's from 86 to 94. The Business modes rise most where there is a high street and Competition was 0: Sutton-in-Ashfield's Café from 44 to 59, Headingley's Takeaway from 51 to 67. General changes by 3 points at most.

NG17 1AA's recordings, which the end-to-end tests use, change in the same way: Property activity 24 → 40, Development activity 100 → 54; its Location Score stays 62 in General, and is 67 in Homebuyer (was 66), 62 in Buy-to-let (61), 60 in Investment (68), 67 in Development (76), 56 in Retail (54), 59 in Café (44), 64 in Restaurant (56), 53 in Takeaway (42), 45 in Hairdresser (38) and 45 in Convenience store (31), and as before in Gym, Dental practice and Nursery.

## What wasn't tuned, and why

- **Safety's thresholds.** Safety spread well, from 0 to 90 with a median of 61, and broadly in the order a person would put the Locations: town centres 0 to 6, suburbs 40 to 62, villages 66 to 82 but Bibury 32 (140 crimes a year per 1,000 of its 94 residents, again its visitors'), and rural edges 84 to 90. The town centres' 0 is the per-resident measure counting crimes among visitors against the few who live there. Per km² would judge them the same way. A fairer measure needs footfall, which Phase 1 has no data for, so it stays, and the breakdown says what it counts.
- **Demand.** Its median was 7, and 8 of the 20 scored 0, but those are villages, rural edges and industrial estates with 51 to 2,600 residents and incomes below England's median, where a shop would indeed struggle. The town centres score 19 to 37 and the busiest city Locations 68 to 100 (Headingley, Bishopston and Camden Town). Its population cap, 20,000 residents, is reached only in Camden Town at the 0.5 mile Search Radius and 4 times as easily at 1 mile: it counts residents in the Search Area, not their density. Whether to count density is a change of rule, for a person to decide.
- **Green space.** Bibury scored 30, with no park within 2 km, though it is surrounded by countryside; Green space counts public parks, playgrounds, nature reserves and woods, not farmland, which isn't open to the public. That is the PRD's rule, and the right one for a family wanting a playground, so it stays.
- **Planning freedom** was 100 at 12 of the 20 and 60 to 85 at the rest, which is its purpose: it marks only the Locations inside a Planning Constraint.
- **Schools, Transport, Amenities and Footfall proxy** spread from low in the countryside to high in the towns, and none needed tuning.
- **The Scout Modes' weights**, which are PRD FR-4.2's. Nothing in the 20 showed one mode ranking Locations against its own question; the user can change them with the sliders.

## Defects and limits found

These are outside this issue, which tunes thresholds and adds nothing new, so each is left for an issue of its own.

1. **Greater Manchester Police publishes no street-level crimes to data.police.uk**, so Trafford Park's Search Area had 0 crimes in 12 months, Safety 90 and a 🟢 "Low crime: 0 crimes a year per 1,000 residents" Highlight. data.police.uk confirmed 0 crimes within a mile of it in August 2026, against 321 around NG17 1AA. No data reads as no crime across all of Greater Manchester, about 2.9 million people. The Crime Layer should say when a force publishes nothing, and Safety should be left out there.
2. **Development activity counts every application PlanIt has**, including work to protected trees, the discharge of conditions and amendments, not only applications to build or change the use of land, which is the Glossary's _Planning Application_. That may make a conservation area's village look as busy as a town, as Bibury's 143, for 94 residents, suggests; the survey didn't record the types to show it. Counting only full and outline applications, by PlanIt's `app_type`, would be truer, but is a rule, not a threshold.
3. **A median price compares different homes.** Even with 20 sales or more, a year of more flats against a year of more houses can move the median far further than prices moved: Skegby's fell 22.1% on 54 sales. Comparing by property type would show whether that is the market or the mix.
4. **data.police.uk refused some months with `429` from the sandbox**, at the app's 10 requests a second, under its published 15. A failed month isn't cached, so the frontend asks again whenever the scores or Highlights are asked for in another Scout Mode. From a home connection this may not happen; from a shared data centre it does.
5. **Overpass decides how long a Search Area takes.** When it was answering, the Search Area loaded in 2.6 to 7.6 seconds, and the slowest were waiting for it. The public Overpass instance timed out at Okehampton, and then refused connections from the sandbox for about 45 minutes, very likely because the first survey run sent its timed-out query again for each Scout Mode (6, below). Hosting will need an Overpass of its own, or OpenStreetMap prepared in advance as the land data already is.
6. **`pnpm survey` itself asked failed Data Sources again too often in its first run**: each Scout Mode's scores and Highlights asked Overpass again once it had timed out, up to 28 times a Location, and data.police.uk again for the months that had failed. It now asks only the General Scout Mode wherever a Data Source failed, and `--retry` surveys only those Locations again.
7. **A Land Parcel can be very large.** The largest Land Opportunity across Ashfield is 472.9 acres of farmland, contiguous fields joined into one Land Parcel. It is "open land" as FR-5.2 defines it, but not a parcel a buyer would recognise; splitting Land Parcels at field boundaries or hedges would be a rule for later.

## Possibly Unregistered land to check

Criterion 4 asks for 10 Possibly Unregistered results to be checked against HM Land Registry's index map. Across Ashfield, 18 of the 288 Land Opportunities with FR-5.3's default filters are Possibly Unregistered: 6%, so the flag is given sparingly, not to most land. The survey picked these 10, spread from the largest to the smallest. What surrounds each is from OpenStreetMap, by Nominatim, as a hint of what to expect; only the index map can say whether it is registered. Our data suggests each parcel warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner.

| # | Land Parcel | Land use | Acres | INSPIRE coverage | Where | What is around it | Index map says |
|---|---|---|---|---|---|---|---|
| 1 | `E07000170-194` | Farmland | 4.58 | 1% | [53.09421, -1.27450](https://www.openstreetmap.org/?mlat=53.09421&mlon=-1.27450#map=17/53.09421/-1.27450) | A field off Pinxton Road, Kirkby-in-Ashfield | |
| 2 | `E07000170-402` | Grass | 1.35 | 0% | [53.10601, -1.18344](https://www.openstreetmap.org/?mlat=53.10601&mlon=-1.18344#map=17/53.10601/-1.18344) | Fountaindale School's grounds, Nottingham Road | |
| 3 | `E07000170-280` | Grass | 1.07 | 6% | [53.02407, -1.22740](https://www.openstreetmap.org/?mlat=53.02407&mlon=-1.22740#map=17/53.02407/-1.22740) | A housing estate, Lancaster Road, Hucknall | |
| 4 | `E07000170-111` | Scrub | 0.67 | 22% | [53.04586, -1.20220](https://www.openstreetmap.org/?mlat=53.04586&mlon=-1.20220#map=17/53.04586/-1.20220) | The edge of an estate, Avocet Close, Hucknall | |
| 5 | `E07000170-145` | Grass | 0.39 | 0% | [53.08254, -1.24171](https://www.openstreetmap.org/?mlat=53.08254&mlon=-1.24171#map=17/53.08254/-1.24171) | Beside Derby Road, Kirkby-in-Ashfield | |
| 6 | `E07000170-374` | Scrub | 0.32 | 21% | [53.03984, -1.19703](https://www.openstreetmap.org/?mlat=53.03984&mlon=-1.19703#map=17/53.03984/-1.19703) | Off Papplewick Lane, Hucknall | |
| 7 | `E07000170-277` | Grass | 0.14 | 0% | [53.02357, -1.22384](https://www.openstreetmap.org/?mlat=53.02357&mlon=-1.22384#map=17/53.02357/-1.22384) | A housing estate, Kingsway Road, Hucknall | |
| 8 | `E07000170-328` | Grass | 0.14 | 35% | [53.02882, -1.21503](https://www.openstreetmap.org/?mlat=53.02882&mlon=-1.21503#map=17/53.02882/-1.21503) | Beside the A611, Hazelgrove, Hucknall | |
| 9 | `E07000170-139` | Grass | 0.12 | 32% | [53.07128, -1.24391](https://www.openstreetmap.org/?mlat=53.07128&mlon=-1.24391#map=17/53.07128/-1.24391) | Beside a main road, Annesley | |
| 10 | `E07000170-282` | Grass | 0.10 | 0% | [53.02562, -1.22758](https://www.openstreetmap.org/?mlat=53.02562&mlon=-1.22758#map=17/53.02562/-1.22758) | A housing estate, Astral Grove, Hucknall | |

What to expect: land that has never been sold since registration became compulsory on sale, in 1990, is often unregistered, such as old farms, highway verges, a council's long-held land, and the open space of estates built before then. Several of these are verges and estate open space, which may well be unregistered and still be of little use: if most of the 10 are, the 0.1 acre minimum (FR-5.3) or leaving out land beside roads would be the thing to tune, once the check says so. INSPIRE Index Polygons cover only registered freehold titles, so land held only on a lease, such as an academy's school grounds (2), or registered recently, may show as Possibly Unregistered though it is registered (FR-5.8).

To check one: search for NG17 1AA, open the **Land** tab, choose **Across Ashfield** and **Possibly Unregistered only**, and choose the parcel, whose popup links to HM Land Registry's [Search the register](https://www.gov.uk/search-property-information-land-registry) and [Search the index map](https://www.gov.uk/get-information-about-property-and-land/search-the-index-map), or go to the point above on the register's map search, signed in. Note in the last column whether registered titles cover **most**, **part** or **none** of it. The flag is useful if most of the 10 are none or part, and noise if most are covered.

## What a person still has to do

1. **Check the 10 Possibly Unregistered parcels** [above](#possibly-unregistered-land-to-check) against HM Land Registry's index map, signed in to its service, filling in the last column, and say whether the flag is useful (criterion 4). If most are verges or estate open space, raise the 0.1 acre minimum or leave out land beside roads.
2. **Use the app on the 20 Locations, or 20 of your own**, in the browser with `pnpm dev`: switch each Layer on and off, open popups, choose Scout Modes, move the sliders, and judge whether the Highlights and scores are what you would say about each Location (criteria 2, 3 and 7). Say on the issue whether it is genuinely useful.
3. **With a PlanWire key and an Anthropic API key**, run `pnpm smoke` and `pnpm test:ai`, and try Planning Applications from PlanWire and the Explain buttons in the app (criterion 5).
4. **Run `pnpm bench` and `pnpm survey` from a home connection**, where data.police.uk and Overpass may answer as they don't from a data centre, to see whether criterion 1 holds there. Not more than once an hour: each survey asks every Data Source about 20 Locations.
5. **Decide on the defects above**: no crime data in Greater Manchester read as no crime, Development activity counting tree and conditions applications, and comparing median prices by property type. Each wants an issue of its own.

## Is Phase 1 ready for Phase 2?

**Not yet, but close.** Every Phase 1 feature is built and works against the live Data Sources: all nine Layers, Highlights and scores in every Scout Mode, the Land Opportunity Finder across Ashfield in well under 3 seconds, and a failed Data Source costing only its own Layers. The scores now tell the 20 Locations apart in the order a person would put them. Three things should come first:

- **A person's judgement** that it is genuinely useful, and the check of the 10 Possibly Unregistered parcels (criteria 4 and 7). Without them the Land Opportunity Finder, the feature PRD §3 says other property websites don't show, isn't shown to be useful.
- **Greater Manchester's crime data read as no crime** (defect 1). It would mislead the first paying users anywhere in Manchester.
- **Overpass** (criterion 1). The public instance decides how long a Search Area takes and refused this sandbox for about 45 minutes. Phase 2 must replace it, with an Overpass of its own or OpenStreetMap prepared as land data already is, alongside PRD §8's move away from public Nominatim and PlanIt.

The rest of what was found (defects 2 to 7) can be fixed alongside Phase 2's hosting work.

