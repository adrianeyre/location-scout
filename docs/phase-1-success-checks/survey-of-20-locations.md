# Survey of 20 Locations

Written by `pnpm survey` on 2026-10-09, with the live Data Sources, at the 0.5 mile Search Radius. Run it again rather than editing this file. [Phase 1 success checks](README.md) says what it found and what changed because of it.

15 of the Locations (NG17 1AA, NG17 7BA, YO1 8RS, NW1 8NH, NG17 3FP, NG17 2NW, BS7 8PB, LS6 3HN, NG16 6DP, NG16 5JU, GL7 5NW, CB3 9NF, NG17 3JN, NG15 0AR, NE46 2NB) are kept from a run on 2026-10-09, in which every Layer answered; the rest were surveyed again.

## Locations

Loaded in is from the search until the Search Area, every Layer, the scores and the Highlights had answered, uncached, as `pnpm bench` times NFR-2.1. A Layer not `ok` is named with its status: unavailable (U) or not prepared (NP).

| # | Kind | Location | Postcode | Local authority | Loaded in | Slowest | Layers not ok | Land Opportunities (Possibly Unregistered) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | town centre | Sutton-in-Ashfield | NG17 1AA | Ashfield | 3.6 s | Highlights | none | 12 (0) |
| 2 | town centre | Kirkby-in-Ashfield | NG17 7BA | Ashfield | 4.1 s | Transport | none | 15 (0) |
| 3 | town centre | York, Coppergate | YO1 8RS | York | 5.2 s ⚠ | Highlights | Land NP | – |
| 4 | town centre | Camden Town, London | NW1 8NH | Camden | 7.6 s ⚠ | Transport | Land NP | – |
| 5 | suburb | Skegby, Sutton-in-Ashfield | NG17 3FP | Ashfield | 2.6 s | Highlights | none | 6 (0) |
| 6 | suburb | Huthwaite | NG17 2NW | Ashfield | 3.3 s | Transport | none | 4 (0) |
| 7 | suburb | Bishopston, Bristol | BS7 8PB | Bristol, City of | 5 s ⚠ | Amenities | Land NP | – |
| 8 | suburb | Headingley, Leeds | LS6 3HN | Leeds | 4 s | Transport | Land NP | – |
| 9 | village | Westwood, Selston | NG16 6DP | Ashfield | 3.8 s | Amenities | none | 3 (0) |
| 10 | village | Jacksdale | NG16 5JU | Ashfield | 3.2 s | Highlights | none | 0 (0) |
| 11 | village | Bibury, Cotswolds | GL7 5NW | Cotswold | 2.7 s | Scores | Land NP | – |
| 12 | village | Grantchester, Cambridge | CB3 9NF | South Cambridgeshire | 4.2 s | Green space | Land NP | – |
| 13 | rural edge | Teversal | NG17 3JN | Ashfield | 2.6 s | Highlights | none | 4 (0) |
| 14 | rural edge | Annesley | NG15 0AR | Ashfield | 7 s ⚠ | Amenities | none | 6 (2) |
| 15 | rural edge | Hexham, west edge | NE46 2NB | Northumberland | 3.8 s | Amenities | Land NP | – |
| 16 | rural edge | Okehampton, south edge | EX20 1EL | West Devon | 2.5 s | Amenities | Land NP | – |
| 17 | industrial | Sherwood Business Park, Annesley | NG15 0DT | Ashfield | 4.7 s | Transport | Crime U | 7 (0) |
| 18 | industrial | Trafford Park, Manchester | M17 1PA | Trafford | 5.1 s ⚠ | Transport | Crime U, Land NP | – |
| 19 | industrial | Attercliffe, Sheffield | S9 3SA | Sheffield | 5.6 s ⚠ | Amenities | Crime U, Land NP | – |
| 20 | industrial | Threemilestone Industrial Estate, Truro | TR4 9LD | Cornwall | 3.5 s | Amenities | Crime U, Land NP | – |

## Location Scores

Each Scout Mode's Location Score, its weights renormalised over the Category Scores available.

| # | Location | General | Homebuyer | Buy-to-let | Investment | Development | Retail | Business: Café | Business: Restaurant | Business: Takeaway | Business: Gym | Business: Hairdresser | Business: Convenience store | Business: Dental practice | Business: Nursery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sutton-in-Ashfield | 62 | 66 | 61 | 68 | 76 | 53 | 44 | 56 | 41 | 61 | 37 | 30 | 54 | 54 |
| 2 | Kirkby-in-Ashfield | 70 | 71 | 72 | 77 | 87 | 48 | 39 | 61 | 34 | 49 | 34 | 27 | 58 | 55 |
| 3 | York, Coppergate | 63 | 68 | 62 | 68 | 72 | 63 | 51 | 56 | 49 | 62 | 44 | 36 | 38 | 59 |
| 4 | Camden Town, London | 62 | 70 | 62 | 67 | 72 | 79 | 64 | 69 | 69 | 82 | 64 | 59 | 83 | 78 |
| 5 | Skegby, Sutton-in-Ashfield | 60 | 61 | 56 | 52 | 65 | 27 | 42 | 46 | 23 | 41 | 46 | 32 | 48 | 56 |
| 6 | Huthwaite | 72 | 78 | 70 | 63 | 71 | 36 | 52 | 47 | 23 | 50 | 28 | 24 | 54 | 62 |
| 7 | Bishopston, Bristol | 84 | 85 | 84 | 86 | 87 | 77 | 63 | 68 | 62 | 84 | 62 | 59 | 83 | 79 |
| 8 | Headingley, Leeds | 77 | 80 | 72 | 75 | 75 | 65 | 54 | 59 | 51 | 75 | 53 | 63 | 74 | 70 |
| 9 | Westwood, Selston | 59 | 64 | 50 | 46 | 62 | 28 | 20 | 42 | 39 | 32 | 44 | 47 | 45 | 61 |
| 10 | Jacksdale | 68 | 71 | 54 | 48 | 61 | 28 | 38 | 48 | 20 | 47 | 27 | 34 | 35 | 62 |
| 11 | Bibury, Cotswolds | 38 | 38 | 36 | 47 | 56 | 21 | 18 | 20 | 39 | 40 | 42 | 15 | 44 | 49 |
| 12 | Grantchester, Cambridge | 56 | 59 | 46 | 50 | 62 | 26 | 22 | 43 | 42 | 45 | 47 | 50 | 51 | 61 |
| 13 | Teversal | 53 | 60 | 41 | 36 | 49 | 29 | 18 | 38 | 36 | 39 | 42 | 46 | 43 | 64 |
| 14 | Annesley | 64 | 69 | 55 | 42 | 57 | 44 | 55 | 50 | 45 | 54 | 54 | 54 | 57 | 42 |
| 15 | Hexham, west edge | 70 | 71 | 63 | 68 | 81 | 36 | 51 | 46 | 43 | 49 | 41 | 53 | 54 | 69 |
| 16 | Okehampton, south edge | 63 | – | – | – | – | – | – | – | – | – | – | – | – | – |
| 17 | Sherwood Business Park, Annesley | 59 | – | – | – | – | – | – | – | – | – | – | – | – | – |
| 18 | Trafford Park, Manchester | 74 | – | – | – | – | – | – | – | – | – | – | – | – | – |
| 19 | Attercliffe, Sheffield | 59 | – | – | – | – | – | – | – | – | – | – | – | – | – |
| 20 | Threemilestone Industrial Estate, Truro | 67 | – | – | – | – | – | – | – | – | – | – | – | – | – |

## Category Scores

The same in every Scout Mode that weighs them. Competition, which counts each mode's own competitors, is in the next table. U: unavailable; NP: not prepared; Q: still waiting for PlanIt.

| # | Location | Safety | Amenities | Schools | Transport | Green space | Property activity | Development activity | Planning freedom | Demand | Footfall proxy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sutton-in-Ashfield | 0 | 100 | 87 | 88 | 100 | 24 | 100 | 80 | 26 | 81 |
| 2 | Kirkby-in-Ashfield | 6 | 95 | 89 | 100 | 100 | 53 | 100 | 100 | 19 | 52 |
| 3 | York, Coppergate | 0 | 100 | 96 | 100 | 100 | 18 | 100 | 65 | 37 | 100 |
| 4 | Camden Town, London | 0 | 100 | 91 | 100 | 100 | 14 | 100 | 65 | 100 | 100 |
| 5 | Skegby, Sutton-in-Ashfield | 40 | 48 | 78 | 56 | 94 | 54 | 34 | 100 | 10 | 12 |
| 6 | Huthwaite | 62 | 73 | 81 | 62 | 99 | 64 | 36 | 100 | 10 | 21 |
| 7 | Bishopston, Bristol | 61 | 100 | 96 | 99 | 88 | 65 | 100 | 85 | 77 | 88 |
| 8 | Headingley, Leeds | 61 | 100 | 78 | 98 | 100 | 28 | 100 | 65 | 68 | 58 |
| 9 | Westwood, Selston | 66 | 23 | 78 | 43 | 100 | 26 | 41 | 100 | 0 | 5 |
| 10 | Jacksdale | 82 | 62 | 73 | 47 | 100 | 24 | 28 | 100 | 0 | 11 |
| 11 | Bibury, Cotswolds | 32 | 29 | 53 | 40 | 30 | 5 | 100 | 60 | 8 | 8 |
| 12 | Grantchester, Cambridge | 70 | 19 | 76 | 54 | 75 | 1 | 84 | 80 | 12 | 3 |
| 13 | Teversal | 85 | 12 | 74 | 19 | 97 | 9 | 29 | 80 | 0 | 2 |
| 14 | Annesley | 90 | 12 | 75 | 90 | 72 | 1 | 21 | 100 | 0 | 7 |
| 15 | Hexham, west edge | 90 | 6 | 84 | 65 | 94 | 40 | 100 | 100 | 6 | 2 |
| 16 | Okehampton, south edge | 84 | 18 | 71 | 64 | 100 | 7 | 37 | 100 | – | – |
| 17 | Sherwood Business Park, Annesley | 42 | 60 | 71 | 79 | 71 | 13 | 38 | 100 | – | – |
| 18 | Trafford Park, Manchester | 90 | 49 | 86 | 97 | 70 | 14 | 49 | 100 | – | – |
| 19 | Attercliffe, Sheffield | 0 | 78 | 81 | 88 | 100 | 10 | 100 | 100 | – | – |
| 20 | Threemilestone Industrial Estate, Truro | 64 | 61 | 92 | 52 | 100 | 24 | 58 | 100 | – | – |

## Competition

| # | Location | Retail | Business: Café | Business: Restaurant | Business: Takeaway | Business: Gym | Business: Hairdresser | Business: Convenience store | Business: Dental practice | Business: Nursery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sutton-in-Ashfield | 0 | 0 | 35 | 0 | 78 | 0 | 0 | 89 | 78 |
| 2 | Kirkby-in-Ashfield | 0 | 0 | 85 | 0 | 32 | 0 | 0 | 100 | 85 |
| 3 | York, Coppergate | 0 | 0 | 0 | 0 | 49 | 0 | 0 | 0 | 80 |
| 4 | Camden Town, London | 0 | 0 | 0 | 0 | 66 | 0 | 0 | 76 | 88 |
| 5 | Skegby, Sutton-in-Ashfield | 0 | 74 | 100 | 21 | 74 | 100 | 47 | 100 | 100 |
| 6 | Huthwaite | 0 | 80 | 61 | 0 | 80 | 0 | 0 | 100 | 80 |
| 7 | Bishopston, Bristol | 0 | 0 | 0 | 0 | 83 | 0 | 9 | 88 | 77 |
| 8 | Headingley, Leeds | 0 | 0 | 0 | 0 | 78 | 0 | 46 | 70 | 52 |
| 9 | Westwood, Selston | 48 | 0 | 100 | 100 | 48 | 100 | 100 | 100 | 100 |
| 10 | Jacksdale | 0 | 52 | 100 | 13 | 100 | 23 | 52 | 52 | 100 |
| 11 | Bibury, Cotswolds | 0 | 0 | 0 | 100 | 100 | 100 | 0 | 100 | 100 |
| 12 | Grantchester, Cambridge | 0 | 0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 13 | Teversal | 100 | 0 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| 14 | Annesley | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 0 |
| 15 | Hexham, west edge | 62 | 100 | 100 | 100 | 100 | 62 | 100 | 100 | 100 |
| 16 | Okehampton, south edge | – | – | – | – | – | – | – | – | – |
| 17 | Sherwood Business Park, Annesley | – | – | – | – | – | – | – | – | – |
| 18 | Trafford Park, Manchester | – | – | – | – | – | – | – | – | – |
| 19 | Attercliffe, Sheffield | – | – | – | – | – | – | – | – | – |
| 20 | Threemilestone Industrial Estate, Truro | – | – | – | – | – | – | – | – | – |

## How each Category Score spread

A score that is 0 or 100 at most Locations tells them apart no better than a coin: its thresholds are where tuning starts.

| Category Score | Scored | Not scored | Min | Median | Max | At 0 | At 100 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Safety | 20 | 0 | 0 | 61.5 | 90 | 4 | 0 |
| Amenities | 20 | 0 | 6 | 60.5 | 100 | 0 | 5 |
| Schools | 20 | 0 | 53 | 79.5 | 96 | 0 | 0 |
| Transport | 20 | 0 | 19 | 72 | 100 | 0 | 3 |
| Green space | 20 | 0 | 30 | 99.5 | 100 | 0 | 10 |
| Property activity | 20 | 0 | 1 | 21 | 65 | 0 | 0 |
| Development activity | 20 | 0 | 21 | 71 | 100 | 0 | 9 |
| Planning freedom | 20 | 0 | 60 | 100 | 100 | 0 | 12 |
| Demand | 15 | 0 | 0 | 10 | 100 | 4 | 1 |
| Footfall proxy | 15 | 0 | 2 | 12 | 100 | 0 | 2 |

## Highlights

How many Highlights each Scout Mode gave: 🔴 Concern / 🟠 Watch / 🟢 Good.

| # | Location | General | Homebuyer | Buy-to-let | Investment | Development | Retail and Business (fewest–most) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sutton-in-Ashfield | 1 / 1 / 4 | 1 / 2 / 3 | 1 / 2 / 4 | 1 / 2 / 3 | 1 / 2 / 2 | 4–5 |
| 2 | Kirkby-in-Ashfield | 0 / 2 / 5 | 0 / 2 / 4 | 0 / 3 / 5 | 0 / 3 / 4 | 0 / 3 / 3 | 4–5 |
| 3 | York, Coppergate | 1 / 3 / 5 | 1 / 3 / 4 | 1 / 3 / 5 | 1 / 3 / 4 | 1 / 3 / 3 | 6–7 |
| 4 | Camden Town, London | 1 / 3 / 5 | 1 / 3 / 5 | 1 / 3 / 5 | 1 / 3 / 4 | 1 / 3 / 3 | 6–7 |
| 5 | Skegby, Sutton-in-Ashfield | 0 / 3 / 2 | 0 / 4 / 1 | 0 / 4 / 2 | 0 / 4 / 2 | 0 / 4 / 2 | 4–4 |
| 6 | Huthwaite | 0 / 1 / 4 | 0 / 1 / 3 | 0 / 1 / 5 | 0 / 1 / 5 | 0 / 1 / 4 | 3–3 |
| 7 | Bishopston, Bristol | 0 / 1 / 2 | 0 / 2 / 2 | 0 / 2 / 2 | 0 / 2 / 2 | 0 / 2 / 1 | 3–3 |
| 8 | Headingley, Leeds | 0 / 3 / 3 | 0 / 4 / 3 | 0 / 3 / 3 | 0 / 3 / 2 | 0 / 3 / 1 | 3–5 |
| 9 | Westwood, Selston | 0 / 3 / 4 | 0 / 3 / 2 | 0 / 3 / 4 | 0 / 1 / 3 | 0 / 1 / 3 | 2–3 |
| 10 | Jacksdale | 0 / 3 / 4 | 0 / 3 / 3 | 0 / 3 / 4 | 0 / 3 / 3 | 0 / 3 / 2 | 3–4 |
| 11 | Bibury, Cotswolds | 0 / 7 / 1 | 0 / 6 / 2 | 0 / 7 / 2 | 0 / 5 / 2 | 0 / 5 / 2 | 6–7 |
| 12 | Grantchester, Cambridge | 0 / 6 / 0 | 0 / 5 / 0 | 0 / 6 / 0 | 0 / 5 / 0 | 0 / 5 / 0 | 4–4 |
| 13 | Teversal | 0 / 5 / 0 | 0 / 5 / 1 | 0 / 5 / 1 | 0 / 3 / 1 | 0 / 3 / 1 | 3–4 |
| 14 | Annesley | 0 / 3 / 3 | 0 / 3 / 2 | 0 / 3 / 3 | 0 / 1 / 3 | 0 / 1 / 3 | 2–3 |
| 15 | Hexham, west edge | 0 / 4 / 2 | 0 / 5 / 1 | 0 / 4 / 2 | 0 / 2 / 2 | 0 / 2 / 2 | 2–3 |
| 16 | Okehampton, south edge | 0 / 4 / 3 | – | – | – | – | 0–0 |
| 17 | Sherwood Business Park, Annesley | 0 / 1 / 4 | – | – | – | – | 0–0 |
| 18 | Trafford Park, Manchester | 0 / 2 / 3 | – | – | – | – | 0–0 |
| 19 | Attercliffe, Sheffield | 1 / 2 / 3 | – | – | – | – | 0–0 |
| 20 | Threemilestone Industrial Estate, Truro | 0 / 2 / 3 | – | – | – | – | 0–0 |

## Each Location

Its General Scout Mode's Highlights, then each Category Score's figures and the points they earned.

### 1. Sutton-in-Ashfield (town centre, NG17 1AA)

Sutton Central & New Cross, Ashfield. General Location Score 62.

- 🔴 High crime: 220 crimes a year per 1,000 residents
- 🟠 Location is inside a conservation area: Sutton in Ashfield Church and Market Place
- 🟢 All 13 types of amenity in the Search Area
- 🟢 58 bus stops in the Search Area
- 🟢 Park 100 m away
- 🟢 Median price up 13.8% on a year before

- **Safety 0**: Crimes a year per 1,000 residents: 220.1 per 1,000 residents (0); Year-on-year change in crime: none (0)
- **Amenities 100**: Types of amenity in the Search Area: 13 of 13 (70); Amenities in the Search Area: 197 (30)
- **Schools 87**: Distance to the nearest primary school: 519 m (40); Latest Ofsted judgement of the nearest primary school: 55 % share (9.6); Distance to the nearest secondary school: 232 m (25); Latest Ofsted judgement of the nearest secondary school: 67.9 % share (11.9)
- **Transport 88**: Distance to the nearest railway station: 1628 m (48.2); Bus stops in the Search Area: 58 (40)
- **Green space 100**: Distance to the nearest park: 104 m (70); Green spaces in the Search Area: 13 (30)
- **Property activity 24**: Sales in the last 12 months: 24 (24)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 2 (10); Other Planning Applications in the Search Area in the last 3 years: 124 (124); Kept between 0 and 100: none (-34)
- **Planning freedom 80**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: yes (-20); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 26**: Estimated residents of the Search Area: 9052 (33.9); Household income against the England median: -27.5 % (-10); Estimated new residents from Planning Applications: 120 (1.8)
- **Footfall proxy 81**: Shops in the Search Area: 131 (52.4); Offices in the Search Area: 14 (5.6); Bus stops in the Search Area: 58 (23.2); Railway stations in the Search Area: 0 (0)

### 2. Kirkby-in-Ashfield (town centre, NG17 7BA)

Kingsway, Ashfield. General Location Score 70.

- 🟠 Flood zone 3 within 500 m: 400 m from the Location
- 🟠 Median price down 6.7% on a year before
- 🟢 No Planning Constraints recorded at the Location
- 🟢 12 of 13 types of amenity in the Search Area
- 🟢 Railway station 600 m away: Kirkby-in-Ashfield
- 🟢 41 bus stops in the Search Area
- 🟢 Park 160 m away: Kingsway Park

- **Safety 6**: Crimes a year per 1,000 residents: 189.1 per 1,000 residents (5.8); Year-on-year change in crime: none (0)
- **Amenities 95**: Types of amenity in the Search Area: 12 of 13 (64.6); Amenities in the Search Area: 123 (30)
- **Schools 89**: Distance to the nearest primary school: 253 m (40); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 94 m (25); Latest Ofsted judgement of the nearest secondary school: 62.5 % share (10.9)
- **Transport 100**: Distance to the nearest railway station: 598 m (60); Bus stops in the Search Area: 41 (40)
- **Green space 100**: Distance to the nearest park: 162 m (70); Green spaces in the Search Area: 17 (30)
- **Property activity 53**: Sales in the last 12 months: 53 (53)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 2 (10); Other Planning Applications in the Search Area in the last 3 years: 93 (93); Kept between 0 and 100: none (-3)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 19**: Estimated residents of the Search Area: 6868 (25.8); Household income against the England median: -16.2 % (-8.1); Estimated new residents from Planning Applications: 115 (1.7)
- **Footfall proxy 52**: Shops in the Search Area: 72 (28.8); Offices in the Search Area: 8 (3.2); Bus stops in the Search Area: 41 (16.4); Railway stations in the Search Area: 1 (4)

### 3. York, Coppergate (town centre, YO1 8RS)

Guildhall, York. General Location Score 63.

- 🔴 High crime: 536 crimes a year per 1,000 residents
- 🟠 Flood zone 3 within 500 m: 170 m from the Location
- 🟠 Location is inside a conservation area: Central Historic Core Conservation Area
- 🟠 Location is inside an Article 4 direction: HMO
- 🟢 Crime down 8.1% year on year
- 🟢 All 13 types of amenity in the Search Area
- 🟢 85 bus stops in the Search Area
- 🟢 Park 270 m away: North Street Gardens
- 🟢 Median price up 30.2% on a year before

- **Safety 0**: Crimes a year per 1,000 residents: 535.9 per 1,000 residents (0); Year-on-year change in crime: -8.1 % (0)
- **Amenities 100**: Types of amenity in the Search Area: 13 of 13 (70); Amenities in the Search Area: 1053 (30)
- **Schools 96**: Distance to the nearest primary school: 576 m (40); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 1246 m (25); Latest Ofsted judgement of the nearest secondary school: 100 % share (17.5)
- **Transport 100**: Distance to the nearest railway station: 830 m (59.6); Bus stops in the Search Area: 85 (40)
- **Green space 100**: Distance to the nearest park: 273 m (70); Green spaces in the Search Area: 53 (30)
- **Property activity 18**: Sales in the last 12 months: 18 (18)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 9 (45); Other Planning Applications in the Search Area in the last 3 years: 991 (991); Kept between 0 and 100: none (-936)
- **Planning freedom 65**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: yes (-20); Location inside a listed building: no (0); Location inside an Article 4 direction: yes (-15); Location inside a tree preservation zone: no (0)
- **Demand 37**: Estimated residents of the Search Area: 9843 (36.9); Household income against the England median: -10.2 % (-5.1); Estimated new residents from Planning Applications: 317 (4.8)
- **Footfall proxy 100**: Shops in the Search Area: 545 (218); Offices in the Search Area: 72 (28.8); Bus stops in the Search Area: 85 (34); Railway stations in the Search Area: 0 (0); Kept between 0 and 100: none (-180.8)

### 4. Camden Town, London (town centre, NW1 8NH)

Camden Town, Camden. General Location Score 62.

- 🔴 High crime: 292 crimes a year per 1,000 residents
- 🟠 Location is inside a conservation area: Camden Town
- 🟠 Location is inside an Article 4 direction: Basements and Commercial, Business, and Service (Use Class E) to residential (Use Class C3) (in CAZ)
- 🟠 Median price down 51.8% on a year before
- 🟢 Crime down 17.9% year on year
- 🟢 All 13 types of amenity in the Search Area
- 🟢 Railway station 30 m away: Camden Town
- 🟢 65 bus stops in the Search Area
- 🟢 Park 190 m away: Inverness Gardens

- **Safety 0**: Crimes a year per 1,000 residents: 285.6 per 1,000 residents (0); Year-on-year change in crime: none (0)
- **Amenities 100**: Types of amenity in the Search Area: 13 of 13 (70); Amenities in the Search Area: 772 (30)
- **Schools 91**: Distance to the nearest primary school: 328 m (40); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 869 m (25); Latest Ofsted judgement of the nearest secondary school: 75 % share (13.1)
- **Transport 100**: Distance to the nearest railway station: 31 m (60); Bus stops in the Search Area: 65 (40)
- **Green space 100**: Distance to the nearest park: 187 m (70); Green spaces in the Search Area: 41 (30)
- **Property activity 14**: Sales in the last 12 months: 14 (14)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 11 (55); Other Planning Applications in the Search Area in the last 3 years: 989 (989); Kept between 0 and 100: none (-944)
- **Planning freedom 65**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: yes (-20); Location inside a listed building: no (0); Location inside an Article 4 direction: yes (-15); Location inside a tree preservation zone: no (0)
- **Demand 100**: Estimated residents of the Search Area: 24668 (75); Household income against the England median: 34.2 % (10); Estimated new residents from Planning Applications: 1927 (15)
- **Footfall proxy 100**: Shops in the Search Area: 392 (156.8); Offices in the Search Area: 76 (30.4); Bus stops in the Search Area: 65 (26); Railway stations in the Search Area: 3 (12); Kept between 0 and 100: none (-125.2)

### 5. Skegby, Sutton-in-Ashfield (suburb, NG17 3FP)

Skegby, Ashfield. General Location Score 60.

- 🟠 Flood zone 3 within 500 m: 160 m from the Location
- 🟠 No railway station within 2 km. The nearest is 3.9 km away: Sutton Parkway
- 🟠 Median price down 22.1% on a year before
- 🟢 No Planning Constraints recorded at the Location
- 🟢 23 bus stops in the Search Area

- **Safety 40**: Crimes a year per 1,000 residents: 124.9 per 1,000 residents (39.7); Year-on-year change in crime: none (0)
- **Amenities 48**: Types of amenity in the Search Area: 8 of 13 (43.1); Amenities in the Search Area: 16 (4.8)
- **Schools 78**: Distance to the nearest primary school: 124 m (40); Latest Ofsted judgement of the nearest primary school: 46.4 % share (8.1); Distance to the nearest secondary school: 1147 m (25); Latest Ofsted judgement of the nearest secondary school: 25 % share (4.4)
- **Transport 56**: Distance to the nearest railway station: 3909 m (15.6); Bus stops in the Search Area: 23 (40)
- **Green space 94**: Distance to the nearest park: 438 m (64.3); Green spaces in the Search Area: 20 (30)
- **Property activity 54**: Sales in the last 12 months: 54 (54)
- **Development activity 34**: Major Planning Applications in the Search Area in the last 3 years: 1 (5); Other Planning Applications in the Search Area in the last 3 years: 29 (29)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 10**: Estimated residents of the Search Area: 3804 (14.3); Household income against the England median: -23.5 % (-10); Estimated new residents from Planning Applications: 367 (5.5)
- **Footfall proxy 12**: Shops in the Search Area: 8 (3.2); Offices in the Search Area: 0 (0); Bus stops in the Search Area: 23 (9.2); Railway stations in the Search Area: 0 (0)

### 6. Huthwaite (suburb, NG17 2NW)

Huthwaite & Brierley, Ashfield. General Location Score 72.

- 🟠 No railway station within 2 km. The nearest is 3.4 km away: Sutton Parkway
- 🟢 No Planning Constraints recorded at the Location
- 🟢 11 of 13 types of amenity in the Search Area
- 🟢 23 bus stops in the Search Area
- 🟢 Median price up 5.9% on a year before

- **Safety 62**: Crimes a year per 1,000 residents: 83.4 per 1,000 residents (61.7); Year-on-year change in crime: none (0)
- **Amenities 73**: Types of amenity in the Search Area: 11 of 13 (59.2); Amenities in the Search Area: 47 (14.1)
- **Schools 81**: Distance to the nearest primary school: 713 m (40); Latest Ofsted judgement of the nearest primary school: 67.9 % share (11.9); Distance to the nearest secondary school: 1903 m (25); Latest Ofsted judgement of the nearest secondary school: 25 % share (4.4)
- **Transport 62**: Distance to the nearest railway station: 3438 m (22.3); Bus stops in the Search Area: 23 (40)
- **Green space 99**: Distance to the nearest park: 324 m (69); Green spaces in the Search Area: 40 (30)
- **Property activity 64**: Sales in the last 12 months: 64 (64)
- **Development activity 36**: Major Planning Applications in the Search Area in the last 3 years: 2 (10); Other Planning Applications in the Search Area in the last 3 years: 26 (26)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 10**: Estimated residents of the Search Area: 5097 (19.1); Household income against the England median: -19.6 % (-9.8); Estimated new residents from Planning Applications: 74 (1.1)
- **Footfall proxy 21**: Shops in the Search Area: 26 (10.4); Offices in the Search Area: 3 (1.2); Bus stops in the Search Area: 23 (9.2); Railway stations in the Search Area: 0 (0)

### 7. Bishopston, Bristol (suburb, BS7 8PB)

Bishopston and Ashley Down, Bristol, City of. General Location Score 84.

- 🟠 Location is inside an Article 4 direction: Article 4 North
- 🟢 All 13 types of amenity in the Search Area
- 🟢 26 bus stops in the Search Area

- **Safety 61**: Crimes a year per 1,000 residents: 85.1 per 1,000 residents (60.8); Year-on-year change in crime: none (0)
- **Amenities 100**: Types of amenity in the Search Area: 13 of 13 (70); Amenities in the Search Area: 296 (30)
- **Schools 96**: Distance to the nearest primary school: 349 m (40); Latest Ofsted judgement of the nearest primary school: 100 % share (17.5); Distance to the nearest secondary school: 1241 m (25); Latest Ofsted judgement of the nearest secondary school: 75 % share (13.1)
- **Transport 99**: Distance to the nearest railway station: 892 m (58.7); Bus stops in the Search Area: 26 (40)
- **Green space 88**: Distance to the nearest park: 446 m (64); Green spaces in the Search Area: 8 (24)
- **Property activity 65**: Sales in the last 12 months: 65 (65)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 1 (5); Other Planning Applications in the Search Area in the last 3 years: 461 (461); Kept between 0 and 100: none (-366)
- **Planning freedom 85**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: yes (-15); Location inside a tree preservation zone: no (0)
- **Demand 77**: Estimated residents of the Search Area: 17383 (65.2); Household income against the England median: 30.5 % (10); Estimated new residents from Planning Applications: 130 (2)
- **Footfall proxy 88**: Shops in the Search Area: 170 (68); Offices in the Search Area: 24 (9.6); Bus stops in the Search Area: 26 (10.4); Railway stations in the Search Area: 0 (0)

### 8. Headingley, Leeds (suburb, LS6 3HN)

Headingley & Hyde Park, Leeds. General Location Score 77.

- 🟠 Location is inside a conservation area: HEADINGLEY
- 🟠 Location is inside an Article 4 direction: A4D01
- 🟠 Median price down 7.5% on a year before
- 🟢 All 13 types of amenity in the Search Area
- 🟢 32 bus stops in the Search Area
- 🟢 Park 120 m away: Rose Garden

- **Safety 61**: Crimes a year per 1,000 residents: 85.2 per 1,000 residents (60.8); Year-on-year change in crime: none (0)
- **Amenities 100**: Types of amenity in the Search Area: 13 of 13 (70); Amenities in the Search Area: 204 (30)
- **Schools 78**: Distance to the nearest primary school: 356 m (40); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 1344 m (25); Latest Ofsted judgement of the nearest secondary school: 0 % share (0)
- **Transport 98**: Distance to the nearest railway station: 923 m (58.2); Bus stops in the Search Area: 32 (40)
- **Green space 100**: Distance to the nearest park: 123 m (70); Green spaces in the Search Area: 13 (30)
- **Property activity 28**: Sales in the last 12 months: 28 (28)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 3 (15); Other Planning Applications in the Search Area in the last 3 years: 665 (665); Kept between 0 and 100: none (-580)
- **Planning freedom 65**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: yes (-20); Location inside a listed building: no (0); Location inside an Article 4 direction: yes (-15); Location inside a tree preservation zone: no (0)
- **Demand 68**: Estimated residents of the Search Area: 16779 (62.9); Household income against the England median: 3.1 % (1.5); Estimated new residents from Planning Applications: 262 (3.9)
- **Footfall proxy 58**: Shops in the Search Area: 85 (34); Offices in the Search Area: 27 (10.8); Bus stops in the Search Area: 32 (12.8); Railway stations in the Search Area: 0 (0)

### 9. Westwood, Selston (village, NG16 6DP)

Selston, Ashfield. General Location Score 59.

- 🟠 No convenience store or supermarket in the Search Area
- 🟠 No GP, pharmacy or other healthcare in the Search Area
- 🟠 No railway station within 2 km. The nearest is 4.8 km away: Alfreton
- 🟢 No Planning Constraints recorded at the Location
- 🟢 11 bus stops in the Search Area
- 🟢 Park 100 m away: Selston Country Park
- 🟢 Median price up 23.2% on a year before

- **Safety 66**: Crimes a year per 1,000 residents: 75.2 per 1,000 residents (66.1); Year-on-year change in crime: none (0)
- **Amenities 23**: Types of amenity in the Search Area: 4 of 13 (21.5); Amenities in the Search Area: 5 (1.5)
- **Schools 78**: Distance to the nearest primary school: 518 m (40); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 652 m (25); Latest Ofsted judgement of the nearest secondary school: 0 % share (0)
- **Transport 43**: Distance to the nearest railway station: 4818 m (2.6); Bus stops in the Search Area: 11 (40)
- **Green space 100**: Distance to the nearest park: 101 m (70); Green spaces in the Search Area: 11 (30)
- **Property activity 26**: Sales in the last 12 months: 26 (26)
- **Development activity 41**: Major Planning Applications in the Search Area in the last 3 years: 1 (5); Other Planning Applications in the Search Area in the last 3 years: 36 (36)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 0**: Estimated residents of the Search Area: 1936 (7.3); Household income against the England median: -17.8 % (-8.9); Estimated new residents from Planning Applications: 5 (0.1); Kept between 0 and 100: none (1.5)
- **Footfall proxy 5**: Shops in the Search Area: 1 (0.4); Offices in the Search Area: 0 (0); Bus stops in the Search Area: 11 (4.4); Railway stations in the Search Area: 0 (0)

### 10. Jacksdale (village, NG16 5JU)

Jacksdale & Westwood, Ashfield. General Location Score 68.

- 🟠 Flood zone 3 within 500 m: 90 m from the Location
- 🟠 No railway station within 2 km. The nearest is 4.5 km away: Langley Mill
- 🟠 Median price down 6.7% on a year before
- 🟢 No Planning Constraints recorded at the Location
- 🟢 10 of 13 types of amenity in the Search Area
- 🟢 12 bus stops in the Search Area
- 🟢 Park 50 m away

- **Safety 82**: Crimes a year per 1,000 residents: 45.9 per 1,000 residents (81.6); Year-on-year change in crime: none (0)
- **Amenities 62**: Types of amenity in the Search Area: 10 of 13 (53.8); Amenities in the Search Area: 26 (7.8)
- **Schools 73**: Distance to the nearest primary school: 117 m (40); Latest Ofsted judgement of the nearest primary school: 60.7 % share (10.6); Distance to the nearest secondary school: 2461 m (22.1); Latest Ofsted judgement of the nearest secondary school: 0 % share (0)
- **Transport 47**: Distance to the nearest railway station: 4489 m (7.3); Bus stops in the Search Area: 12 (40)
- **Green space 100**: Distance to the nearest park: 53 m (70); Green spaces in the Search Area: 26 (30)
- **Property activity 24**: Sales in the last 12 months: 24 (24)
- **Development activity 28**: Major Planning Applications in the Search Area in the last 3 years: 0 (0); Other Planning Applications in the Search Area in the last 3 years: 28 (28)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 0**: Estimated residents of the Search Area: 2613 (9.8); Household income against the England median: -23.7 % (-10); Estimated new residents from Planning Applications: 2 (0); Kept between 0 and 100: none (0.2)
- **Footfall proxy 11**: Shops in the Search Area: 15 (6); Offices in the Search Area: 1 (0.4); Bus stops in the Search Area: 12 (4.8); Railway stations in the Search Area: 0 (0)

### 11. Bibury, Cotswolds (village, GL7 5NW)

Coln Valley, Cotswold. General Location Score 38.

- 🟠 Flood zone 3 within 500 m: 30 m from the Location
- 🟠 Location is inside a conservation area: Bibury Conservation Area
- 🟠 Location is inside a listed building: SWAN HOTEL
- 🟠 No GP, pharmacy or other healthcare in the Search Area
- 🟠 No railway station within 5 km
- 🟠 No park within 2 km
- 🟠 Quiet market: 5 sales in the last 12 months
- 🟢 18 bus stops in the Search Area

- **Safety 32**: Crimes a year per 1,000 residents: 140.4 per 1,000 residents (31.5); Year-on-year change in crime: none (0)
- **Amenities 29**: Types of amenity in the Search Area: 5 of 13 (26.9); Amenities in the Search Area: 7 (2.1)
- **Schools 53**: Distance to the nearest primary school: 473 m (40); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: none (0); Latest Ofsted judgement of the nearest secondary school: none (0)
- **Transport 40**: Distance to the nearest railway station: none (0); Bus stops in the Search Area: 18 (40)
- **Green space 30**: Distance to the nearest park: none (0); Green spaces in the Search Area: 21 (30)
- **Property activity 5**: Sales in the last 12 months: 5 (5)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 1 (5); Other Planning Applications in the Search Area in the last 3 years: 138 (138); Kept between 0 and 100: none (-43)
- **Planning freedom 60**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: yes (-20); Location inside a listed building: yes (-20); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 8**: Estimated residents of the Search Area: 94 (0.4); Household income against the England median: 16.2 % (8.1); Estimated new residents from Planning Applications: 0 (0)
- **Footfall proxy 8**: Shops in the Search Area: 3 (1.2); Offices in the Search Area: 0 (0); Bus stops in the Search Area: 18 (7.2); Railway stations in the Search Area: 0 (0)

### 12. Grantchester, Cambridge (village, CB3 9NF)

Harston & Comberton, South Cambridgeshire. General Location Score 56.

- 🟠 Flood zone 3 within 500 m: 210 m from the Location
- 🟠 Location is inside a conservation area: Grantchester
- 🟠 No convenience store or supermarket in the Search Area
- 🟠 No GP, pharmacy or other healthcare in the Search Area
- 🟠 No railway station within 2 km. The nearest is 2.6 km away: Cambridge South
- 🟠 Quiet market: 1 sale in the last 12 months

- **Safety 70**: Crimes a year per 1,000 residents: 67.7 per 1,000 residents (70.1); Year-on-year change in crime: none (0)
- **Amenities 19**: Types of amenity in the Search Area: 3 of 13 (16.2); Amenities in the Search Area: 8 (2.4)
- **Schools 76**: Distance to the nearest primary school: 1417 m (24.6); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 1839 m (25); Latest Ofsted judgement of the nearest secondary school: 75 % share (13.1)
- **Transport 54**: Distance to the nearest railway station: 2593 m (34.4); Bus stops in the Search Area: 5 (20)
- **Green space 75**: Distance to the nearest park: 905 m (45.1); Green spaces in the Search Area: 16 (30)
- **Property activity 1**: Sales in the last 12 months: 1 (1)
- **Development activity 84**: Major Planning Applications in the Search Area in the last 3 years: 0 (0); Other Planning Applications in the Search Area in the last 3 years: 84 (84)
- **Planning freedom 80**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: yes (-20); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 12**: Estimated residents of the Search Area: 532 (2); Household income against the England median: 39.8 % (10); Estimated new residents from Planning Applications: 5 (0.1)
- **Footfall proxy 3**: Shops in the Search Area: 3 (1.2); Offices in the Search Area: 0 (0); Bus stops in the Search Area: 5 (2); Railway stations in the Search Area: 0 (0)

### 13. Teversal (rural edge, NG17 3JN)

Stanton Hill & Teversal, Ashfield. General Location Score 53.

- 🟠 Location is inside a conservation area: Teversal
- 🟠 No convenience store or supermarket in the Search Area
- 🟠 No GP, pharmacy or other healthcare in the Search Area
- 🟠 No railway station within 2 km. The nearest is 4.8 km away: Sutton Parkway
- 🟠 Quiet market: 9 sales in the last 12 months

- **Safety 85**: Crimes a year per 1,000 residents: 38.6 per 1,000 residents (85.5); Year-on-year change in crime: none (0)
- **Amenities 12**: Types of amenity in the Search Area: 2 of 13 (10.8); Amenities in the Search Area: 3 (0.9)
- **Schools 74**: Distance to the nearest primary school: 939 m (36.5); Latest Ofsted judgement of the nearest primary school: 46.4 % share (8.1); Distance to the nearest secondary school: 2030 m (24.8); Latest Ofsted judgement of the nearest secondary school: 25 % share (4.4)
- **Transport 19**: Distance to the nearest railway station: 4792 m (3); Bus stops in the Search Area: 4 (16)
- **Green space 97**: Distance to the nearest park: 370 m (67.1); Green spaces in the Search Area: 56 (30)
- **Property activity 9**: Sales in the last 12 months: 9 (9)
- **Development activity 29**: Major Planning Applications in the Search Area in the last 3 years: 0 (0); Other Planning Applications in the Search Area in the last 3 years: 29 (29)
- **Planning freedom 80**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: yes (-20); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 0**: Estimated residents of the Search Area: 795 (3); Household income against the England median: -23.2 % (-10); Estimated new residents from Planning Applications: 17 (0.3); Kept between 0 and 100: none (6.8)
- **Footfall proxy 2**: Shops in the Search Area: 0 (0); Offices in the Search Area: 0 (0); Bus stops in the Search Area: 4 (1.6); Railway stations in the Search Area: 0 (0)

### 14. Annesley (rural edge, NG15 0AR)

Annesley & Kirkby Woodhouse, Ashfield. General Location Score 64.

- 🟠 No convenience store or supermarket in the Search Area
- 🟠 No GP, pharmacy or other healthcare in the Search Area
- 🟠 Quiet market: 1 sale in the last 12 months
- 🟢 Low crime: 0 crimes a year per 1,000 residents
- 🟢 No Planning Constraints recorded at the Location
- 🟢 14 bus stops in the Search Area

- **Safety 90**: Crimes a year per 1,000 residents: 0 per 1,000 residents (90); Year-on-year change in crime: none (0)
- **Amenities 12**: Types of amenity in the Search Area: 2 of 13 (10.8); Amenities in the Search Area: 5 (1.5)
- **Schools 75**: Distance to the nearest primary school: 1080 m (33); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 3111 m (18.1); Latest Ofsted judgement of the nearest secondary school: 62.5 % share (10.9)
- **Transport 90**: Distance to the nearest railway station: 1528 m (49.6); Bus stops in the Search Area: 14 (40)
- **Green space 72**: Distance to the nearest park: 974 m (42.2); Green spaces in the Search Area: 16 (30)
- **Property activity 1**: Sales in the last 12 months: 1 (1)
- **Development activity 21**: Major Planning Applications in the Search Area in the last 3 years: 1 (5); Other Planning Applications in the Search Area in the last 3 years: 16 (16)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 0**: Estimated residents of the Search Area: 51 (0.2); Household income against the England median: -16.1 % (-8.1); Estimated new residents from Planning Applications: 2 (0); Kept between 0 and 100: none (7.8)
- **Footfall proxy 7**: Shops in the Search Area: 0 (0); Offices in the Search Area: 4 (1.6); Bus stops in the Search Area: 14 (5.6); Railway stations in the Search Area: 0 (0)

### 15. Hexham, west edge (rural edge, NE46 2NB)

Hexham West, Northumberland. General Location Score 70.

- 🟠 Flood zone 3 within 500 m: 120 m from the Location
- 🟠 No convenience store or supermarket in the Search Area
- 🟠 No GP, pharmacy or other healthcare in the Search Area
- 🟠 Median price down 9% on a year before
- 🟢 Low crime: 28 crimes a year per 1,000 residents
- 🟢 No Planning Constraints recorded at the Location

- **Safety 90**: Crimes a year per 1,000 residents: 27.7 per 1,000 residents (90); Year-on-year change in crime: none (0)
- **Amenities 6**: Types of amenity in the Search Area: 1 of 13 (5.4); Amenities in the Search Area: 1 (0.3)
- **Schools 84**: Distance to the nearest primary school: 1098 m (32.6); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 360 m (25); Latest Ofsted judgement of the nearest secondary school: 75 % share (13.1)
- **Transport 65**: Distance to the nearest railway station: 1873 m (44.7); Bus stops in the Search Area: 5 (20)
- **Green space 94**: Distance to the nearest park: 445 m (64); Green spaces in the Search Area: 16 (30)
- **Property activity 40**: Sales in the last 12 months: 40 (40)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 0 (0); Other Planning Applications in the Search Area in the last 3 years: 126 (126); Kept between 0 and 100: none (-26)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)
- **Demand 6**: Estimated residents of the Search Area: 2598 (9.7); Household income against the England median: -8.7 % (-4.3); Estimated new residents from Planning Applications: 17 (0.3)
- **Footfall proxy 2**: Shops in the Search Area: 1 (0.4); Offices in the Search Area: 0 (0); Bus stops in the Search Area: 5 (2); Railway stations in the Search Area: 0 (0)

### 16. Okehampton, south edge (rural edge, EX20 1EL)

Okehampton South, West Devon. General Location Score 63. data.police.uk didn't answer for 11 of the 24 months (2025-01, 2025-04, 2025-05, 2025-06, 2025-08, 2025-10, 2026-01, 2026-02, 2026-03, 2026-06, 2026-07), so the rest are scaled up to a year and there is no year-on-year change. Only the General Scout Mode was asked, as a Data Source failed and asking each mode would ask it again.

- 🟠 Flood zone 3 within 500 m: 190 m from the Location
- 🟠 No convenience store or supermarket in the Search Area
- 🟠 Few bus stops: 1 bus stop in the Search Area
- 🟠 Quiet market: 7 sales in the last 12 months
- 🟢 No Planning Constraints recorded at the Location
- 🟢 Railway station 140 m away: Okehampton
- 🟢 Park 280 m away: Simmons Park

- **Safety 84**: Crimes a year per 1,000 residents: 40.4 per 1,000 residents (84.5); Year-on-year change in crime: none (0)
- **Amenities 18**: Types of amenity in the Search Area: 3 of 13 (16.2); Amenities in the Search Area: 6 (1.8)
- **Schools 71**: Distance to the nearest primary school: 1392 m (25.2); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 653 m (25); Latest Ofsted judgement of the nearest secondary school: 46.4 % share (8.1)
- **Transport 64**: Distance to the nearest railway station: 139 m (60); Bus stops in the Search Area: 1 (4)
- **Green space 100**: Distance to the nearest park: 282 m (70); Green spaces in the Search Area: 15 (30)
- **Property activity 7**: Sales in the last 12 months: 7 (7)
- **Development activity 37**: Major Planning Applications in the Search Area in the last 3 years: 0 (0); Other Planning Applications in the Search Area in the last 3 years: 37 (37)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)

### 17. Sherwood Business Park, Annesley (industrial, NG15 0DT)

Annesley & Kirkby Woodhouse, Ashfield. General Location Score 59. Only the General Scout Mode was asked, as a Data Source failed and asking each mode would ask it again.

- 🟠 No railway station within 2 km. The nearest is 2.3 km away: Newstead
- 🟢 No Planning Constraints recorded at the Location
- 🟢 10 of 13 types of amenity in the Search Area
- 🟢 20 bus stops in the Search Area
- 🟢 Median price up 38.3% on a year before

- **Safety 42**: Crimes a year per 1,000 residents: 119.8 per 1,000 residents (42.5); Year-on-year change in crime: none (0)
- **Amenities 60**: Types of amenity in the Search Area: 10 of 13 (53.8); Amenities in the Search Area: 21 (6.3)
- **Schools 71**: Distance to the nearest primary school: 1263 m (28.4); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 3096 m (18.2); Latest Ofsted judgement of the nearest secondary school: 62.5 % share (10.9)
- **Transport 79**: Distance to the nearest railway station: 2303 m (38.5); Bus stops in the Search Area: 20 (40)
- **Green space 71**: Distance to the nearest park: 994 m (41.4); Green spaces in the Search Area: 15 (30)
- **Property activity 13**: Sales in the last 12 months: 13 (13)
- **Development activity 38**: Major Planning Applications in the Search Area in the last 3 years: 1 (5); Other Planning Applications in the Search Area in the last 3 years: 33 (33)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)

### 18. Trafford Park, Manchester (industrial, M17 1PA)

Gorse Hill & Cornbrook, Trafford. General Location Score 74. Only the General Scout Mode was asked, as a Data Source failed and asking each mode would ask it again.

- 🟠 Flood zone 3 within 500 m: 280 m from the Location
- 🟠 No GP, pharmacy or other healthcare in the Search Area
- 🟢 Low crime: 0 crimes a year per 1,000 residents
- 🟢 No Planning Constraints recorded at the Location
- 🟢 23 bus stops in the Search Area

- **Safety 90**: Crimes a year per 1,000 residents: 0 per 1,000 residents (90); Year-on-year change in crime: none (0)
- **Amenities 49**: Types of amenity in the Search Area: 8 of 13 (43.1); Amenities in the Search Area: 21 (6.3)
- **Schools 86**: Distance to the nearest primary school: 1017 m (34.6); Latest Ofsted judgement of the nearest primary school: 75 % share (13.1); Distance to the nearest secondary school: 1795 m (25); Latest Ofsted judgement of the nearest secondary school: 75 % share (13.1)
- **Transport 97**: Distance to the nearest railway station: 1024 m (56.8); Bus stops in the Search Area: 23 (40)
- **Green space 70**: Distance to the nearest park: 811 m (49); Green spaces in the Search Area: 7 (21)
- **Property activity 14**: Sales in the last 12 months: 14 (14)
- **Development activity 49**: Major Planning Applications in the Search Area in the last 3 years: 0 (0); Other Planning Applications in the Search Area in the last 3 years: 49 (49)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)

### 19. Attercliffe, Sheffield (industrial, S9 3SA)

Darnall, Sheffield. General Location Score 59. Only the General Scout Mode was asked, as a Data Source failed and asking each mode would ask it again.

- 🔴 High crime: 211 crimes a year per 1,000 residents
- 🟠 Flood zone 3 within 500 m: 410 m from the Location
- 🟠 Median price down 23.1% on a year before
- 🟢 No Planning Constraints recorded at the Location
- 🟢 23 bus stops in the Search Area
- 🟢 Park 270 m away

- **Safety 0**: Crimes a year per 1,000 residents: 204.2 per 1,000 residents (0); Year-on-year change in crime: none (0)
- **Amenities 78**: Types of amenity in the Search Area: 9 of 13 (48.5); Amenities in the Search Area: 116 (30)
- **Schools 81**: Distance to the nearest primary school: 482 m (40); Latest Ofsted judgement of the nearest primary school: 46.4 % share (8.1); Distance to the nearest secondary school: 482 m (25); Latest Ofsted judgement of the nearest secondary school: 46.4 % share (8.1)
- **Transport 88**: Distance to the nearest railway station: 1649 m (47.9); Bus stops in the Search Area: 23 (40)
- **Green space 100**: Distance to the nearest park: 273 m (70); Green spaces in the Search Area: 44 (30)
- **Property activity 10**: Sales in the last 12 months: 10 (10)
- **Development activity 100**: Major Planning Applications in the Search Area in the last 3 years: 4 (20); Other Planning Applications in the Search Area in the last 3 years: 80 (80)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)

### 20. Threemilestone Industrial Estate, Truro (industrial, TR4 9LD)

Threemilestone & Chacewater, Cornwall. General Location Score 67. Only the General Scout Mode was asked, as a Data Source failed and asking each mode would ask it again.

- 🟠 Flood zone 3 within 500 m: 270 m from the Location
- 🟠 No railway station within 2 km. The nearest is 4.2 km away: Truro
- 🟢 No Planning Constraints recorded at the Location
- 🟢 11 bus stops in the Search Area
- 🟢 Park 270 m away

- **Safety 64**: Crimes a year per 1,000 residents: 79.9 per 1,000 residents (63.6); Year-on-year change in crime: none (0)
- **Amenities 61**: Types of amenity in the Search Area: 9 of 13 (48.5); Amenities in the Search Area: 43 (12.9)
- **Schools 92**: Distance to the nearest primary school: 805 m (39.9); Latest Ofsted judgement of the nearest primary school: 80 % share (14); Distance to the nearest secondary school: 1450 m (25); Latest Ofsted judgement of the nearest secondary school: 75 % share (13.1)
- **Transport 52**: Distance to the nearest railway station: 4191 m (11.6); Bus stops in the Search Area: 11 (40)
- **Green space 100**: Distance to the nearest park: 265 m (70); Green spaces in the Search Area: 23 (30)
- **Property activity 24**: Sales in the last 12 months: 24 (24)
- **Development activity 58**: Major Planning Applications in the Search Area in the last 3 years: 0 (0); Other Planning Applications in the Search Area in the last 3 years: 58 (58)
- **Planning freedom 100**: Starting score: none (100); Flood zone the Location is inside: none (0); Location inside a conservation area: no (0); Location inside a listed building: no (0); Location inside an Article 4 direction: no (0); Location inside a tree preservation zone: no (0)

## Possibly Unregistered land to check

PRD §6.19's fourth criterion: check 10 Possibly Unregistered results against HM Land Registry's index map. These are spread evenly through each Land Coverage Area's Possibly Unregistered Land Opportunities, with FR-5.3's default filters, from the largest to the smallest. For each, find it on [Search the register](https://www.gov.uk/search-property-information-land-registry)'s map, or ask for an official [search the index map](https://www.gov.uk/get-information-about-property-and-land/search-the-index-map), and note whether registered titles cover most of it, part of it or none of it. Our data suggests this parcel warrants further investigation. It is not a statement about ownership or availability. Unregistered land still has an owner.

### Ashfield

18 of its 288 Land Opportunities are Possibly Unregistered.

| # | Land Parcel | Name | Land use | Acres | INSPIRE coverage | Where | Index map says |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `E07000170-194` | – | landuse=farmland | 4.58 | 1% | 53.09421, -1.27450 ([map](https://www.openstreetmap.org/?mlat=53.09421&mlon=-1.27450#map=17/53.09421/-1.27450)) |  |
| 2 | `E07000170-402` | – | landuse=grass | 1.35 | 0% | 53.10601, -1.18344 ([map](https://www.openstreetmap.org/?mlat=53.10601&mlon=-1.18344#map=17/53.10601/-1.18344)) |  |
| 3 | `E07000170-280` | – | landuse=grass | 1.07 | 6% | 53.02407, -1.22740 ([map](https://www.openstreetmap.org/?mlat=53.02407&mlon=-1.22740#map=17/53.02407/-1.22740)) |  |
| 4 | `E07000170-111` | – | natural=scrub | 0.67 | 22% | 53.04586, -1.20220 ([map](https://www.openstreetmap.org/?mlat=53.04586&mlon=-1.20220#map=17/53.04586/-1.20220)) |  |
| 5 | `E07000170-145` | – | landuse=grass | 0.39 | 0% | 53.08254, -1.24171 ([map](https://www.openstreetmap.org/?mlat=53.08254&mlon=-1.24171#map=17/53.08254/-1.24171)) |  |
| 6 | `E07000170-374` | – | natural=scrub | 0.32 | 21% | 53.03984, -1.19703 ([map](https://www.openstreetmap.org/?mlat=53.03984&mlon=-1.19703#map=17/53.03984/-1.19703)) |  |
| 7 | `E07000170-277` | – | landuse=grass | 0.14 | 0% | 53.02357, -1.22384 ([map](https://www.openstreetmap.org/?mlat=53.02357&mlon=-1.22384#map=17/53.02357/-1.22384)) |  |
| 8 | `E07000170-328` | – | landuse=grass | 0.14 | 35% | 53.02882, -1.21503 ([map](https://www.openstreetmap.org/?mlat=53.02882&mlon=-1.21503#map=17/53.02882/-1.21503)) |  |
| 9 | `E07000170-139` | – | landuse=grass | 0.12 | 32% | 53.07128, -1.24391 ([map](https://www.openstreetmap.org/?mlat=53.07128&mlon=-1.24391#map=17/53.07128/-1.24391)) |  |
| 10 | `E07000170-282` | – | landuse=grass | 0.10 | 0% | 53.02562, -1.22758 ([map](https://www.openstreetmap.org/?mlat=53.02562&mlon=-1.22758#map=17/53.02562/-1.22758)) |  |
