# OQ-7: matching titles to INSPIRE Index Polygons on Ashfield, results

Written by `pnpm --filter @location-scout/data-prepare spike:title-matching` on 2026-10-09. What it does, and what the results mean: [oq-7-ccod-ocod-title-matching.md](oq-7-ccod-ocod-title-matching.md).

## Results

Sources: HM Land Registry's INSPIRE Index Polygons for Ashfield published 2026-10-04; Geofabrik's Nottinghamshire (2026-10-08) and Derbyshire (2026-10-08) extracts; Code-Point Open (downloaded 2026-10-09); Ashfield District Council's [land and property transparency data, 27 February 2018](https://www.ashfield.gov.uk/your-council/legal-information-and-public-data/transparency-code) (downloaded 2026-10-09); HM Land Registry's Price Paid Data for 2026 (downloaded 2026-10-09) and its lookups from a sale to its UPRN for July and August 2026; OS Open UPRN (downloaded 2026-10-09 (osopenuprn_202609)).

Ashfield has 58,066 INSPIRE Index Polygons. OpenStreetMap has 18,919 addressed nodes and buildings in and around it; 4,086 polygons (7.0%) hold at least one. It has 6,022 named features that aren't roads, and 10,929 named road ways (4647 street names).

### 20-sample accuracy check

20 of the 24 matches by the address or named step whose place is independently known (the council's point for its asset, or a sale's UPRN's point): **17 right, 3 within 25 m (the point just outside the matched polygon), 0 wrong.**

| Proxy | Asset or sale | Property Address | Step | INSPIRE ID | Polygon point | Distance | Verdict |
|---|---|---|---|---|---|---|---|
| Ashfield District Council's land and property register | TA001 | 10 Fox Street, Homeless Unit, Annesley Woodhouse | address | 24906896 | [53.077868, -1.255061](https://www.openstreetmap.org/?mlat=53.077868&mlon=-1.255061#map=19/53.077868/-1.255061) | 2 m | Next to it |
| Price Paid sales in Ashfield in 2026 | {5834E4E9-BACA-29C7-E063-4804A8C015BC} | 71 SYLVAN AVENUE, KIRKBY IN ASHFIELD, NOTTINGHAM | address | 58148967 | [53.093356, -1.252773](https://www.openstreetmap.org/?mlat=53.093356&mlon=-1.252773#map=19/53.093356/-1.252773) | 0 m | Right |
| Price Paid sales in Ashfield in 2026 | {5A7B802D-8328-1886-E063-4704A8C021AE} | 130 PORTLAND ROAD, HUCKNALL, NOTTINGHAM | address | 29002308 | [53.032798, -1.196792](https://www.openstreetmap.org/?mlat=53.032798&mlon=-1.196792#map=19/53.032798/-1.196792) | 1.4 m | Next to it |
| Price Paid sales in Ashfield in 2026 | {5A7B802C-F66C-1886-E063-4704A8C021AE} | 24 NEW STREET, HUTHWAITE, SUTTON-IN-ASHFIELD | address | 45565999 | [53.129543, -1.300092](https://www.openstreetmap.org/?mlat=53.129543&mlon=-1.300092#map=19/53.129543/-1.300092) | 0 m | Right |
| Price Paid sales in Ashfield in 2026 | {5834E4E9-19BC-29C7-E063-4804A8C015BC} | 33 PLAINSPOT ROAD, BRINSLEY, NOTTINGHAM | address | 28798947 | [53.04851, -1.315485](https://www.openstreetmap.org/?mlat=53.04851&mlon=-1.315485#map=19/53.04851/-1.315485) | 0 m | Right |
| Ashfield District Council's land and property register | LC005 | Lammas Leisure Centre, Sutton in Ashfield | named | 23797499 | [53.12589, -1.268062](https://www.openstreetmap.org/?mlat=53.12589&mlon=-1.268062#map=19/53.12589/-1.268062) | 0 m | Right |
| Price Paid sales in Ashfield in 2026 | {5834E4E9-1A60-29C7-E063-4804A8C015BC} | 27 DERBYSHIRE DRIVE, WESTWOOD, NOTTINGHAM | address | 28679264 | [53.06064, -1.329554](https://www.openstreetmap.org/?mlat=53.06064&mlon=-1.329554#map=19/53.06064/-1.329554) | 0 m | Right |
| Ashfield District Council's land and property register | LD001 | 153 Portland Road, Hucknall, Land, Hucknall | address | 29011276 | [53.031414, -1.195596](https://www.openstreetmap.org/?mlat=53.031414&mlon=-1.195596#map=19/53.031414/-1.195596) | 0.3 m | Next to it |
| Price Paid sales in Ashfield in 2026 | {5834E4E9-1BA0-29C7-E063-4804A8C015BC} | 3 MANSFIELD ROAD, UNDERWOOD, NOTTINGHAM | address | 21048052 | [53.051306, -1.292865](https://www.openstreetmap.org/?mlat=53.051306&mlon=-1.292865#map=19/53.051306/-1.292865) | 0 m | Right |
| Ashfield District Council's land and property register | CP009 | Piggins Croft, Hucknall Car Park, Hucknall | named | 60452821 | [53.037351, -1.205036](https://www.openstreetmap.org/?mlat=53.037351&mlon=-1.205036#map=19/53.037351/-1.205036) | 0 m | Right |
| Price Paid sales in Ashfield in 2026 | {5834E4E9-1FEF-29C7-E063-4804A8C015BC} | 10 FRANCES STREET, BRINSLEY, NOTTINGHAM | address | 28791177 | [53.048912, -1.315945](https://www.openstreetmap.org/?mlat=53.048912&mlon=-1.315945#map=19/53.048912/-1.315945) | 0 m | Right |
| Price Paid sales in Ashfield in 2026 | {5A7B802C-F6D1-1886-E063-4704A8C021AE} | 55 PAPPLEWICK LANE, HUCKNALL, NOTTINGHAM | address | 29011792 | [53.041705, -1.19552](https://www.openstreetmap.org/?mlat=53.041705&mlon=-1.19552#map=19/53.041705/-1.19552) | 0 m | Right |
| Ashfield District Council's land and property register | MISC008 | Kings Mill Reservoir, Sutton in Ashfield | named | 60519696 | [53.130159, -1.23022](https://www.openstreetmap.org/?mlat=53.130159&mlon=-1.23022#map=19/53.130159/-1.23022) | 0 m | Right |
| Ashfield District Council's land and property register | LC004 | Huthwaite Leisure Centre, HUTHWAITE | named | 62756116 | [53.130308, -1.300834](https://www.openstreetmap.org/?mlat=53.130308&mlon=-1.300834#map=19/53.130308/-1.300834) | 0 m | Right |
| Ashfield District Council's land and property register | CC004 | Healdswood Community Centre, Sutton in Ashfield | named | 23089051 | [53.143435, -1.273329](https://www.openstreetmap.org/?mlat=53.143435&mlon=-1.273329#map=19/53.143435/-1.273329) | 0 m | Right |
| Ashfield District Council's land and property register | MISC001 | Annesley Old Church, Annesley | named | 25253301 | [53.066228, -1.249963](https://www.openstreetmap.org/?mlat=53.066228&mlon=-1.249963#map=19/53.066228/-1.249963) | 0 m | Right |
| Price Paid sales in Ashfield in 2026 | {5834E4E9-1FB2-29C7-E063-4804A8C015BC} | 17 OLD MILL CLOSE, BESTWOOD VILLAGE, NOTTINGHAM | address | 29085399 | [53.019161, -1.183844](https://www.openstreetmap.org/?mlat=53.019161&mlon=-1.183844#map=19/53.019161/-1.183844) | 0 m | Right |
| Price Paid sales in Ashfield in 2026 | {5834E4E9-199D-29C7-E063-4804A8C015BC} | 48 BYRON ROAD, ANNESLEY, NOTTINGHAM | address | 26011896 | [53.078031, -1.236353](https://www.openstreetmap.org/?mlat=53.078031&mlon=-1.236353#map=19/53.078031/-1.236353) | 0 m | Right |
| Price Paid sales in Ashfield in 2026 | {5834E4E9-1A4E-29C7-E063-4804A8C015BC} | 88 FOREST ROAD, KIRKBY IN ASHFIELD, NOTTINGHAM | address | 25197859 | [53.077794, -1.250002](https://www.openstreetmap.org/?mlat=53.077794&mlon=-1.250002#map=19/53.077794/-1.250002) | 0 m | Right |
| Ashfield District Council's land and property register | BC002 | Byron Business Centre, Hucknall | named | 28968172 | [53.036218, -1.201841](https://www.openstreetmap.org/?mlat=53.036218&mlon=-1.201841#map=19/53.036218/-1.201841) | 0 m | Right |

### Ashfield District Council's land and property register

251 titles, of which 222 are freehold and matched. The other 29 (leasehold, or no tenure) can't be: INSPIRE Index Polygons outline only freehold titles (PRD FR-5.8).

What their addresses give:

| Address gives | Titles | Share |
|---|---|---|
| land | 124 | 55.9% |
| named | 83 | 37.4% |
| address | 15 | 6.8% |

**Match rate: 11 of 222 freehold titles (5.0%) matched one INSPIRE Index Polygon by the address or named step.** Counting every step, 70 (31.5%) matched one polygon, 146 (65.8%) were ambiguous, finding more than one, and 6 (2.7%) found none.

For 11 of them, the council's point is more than 1 km outside Ashfield, a mistake, so they are not checked. Of the 208 whose place is known, 195 (93.8%) are inside an INSPIRE Index Polygon at all; the rest are on land with no registered freehold outline, which no match can find.

**Accuracy: of the 10 matched by the address or named step, 8 (80.0%) matched the polygon the council's point is in, and 10 (100.0%) one within 25 m of it.** Counting every step, 17 of 65 (26.2%) were right, and 24 (36.9%) within 25 m.

By the step that placed each title:

| Step | Placed | Matched one polygon | Ambiguous | Median polygons when ambiguous | Matched, right polygon | Matched, within 25 m | Ambiguous, right one among them |
|---|---|---|---|---|---|---|---|
| address | 2 | 2 | 0 | – | 0 of 2 | 2 of 2 | 0 of 0 |
| named | 14 | 9 | 5 | 3 | 8 of 8 | 8 of 8 | 4 of 5 |
| street | 141 | 0 | 141 | 42 | 0 of 0 | 0 of 0 | 121 of 134 |
| postcode | 59 | 59 | 0 | – | 9 of 55 | 14 of 55 | 0 of 0 |

By Holding type, matched by the address or named step:

| Holding type | Freehold titles | Matched | Rate |
|---|---|---|---|
| Land Only | 155 | 3 | 1.9% |
| Buildings Only | 46 | 6 | 13.0% |
| Land/Building | 21 | 2 | 9.5% |

Every match by the address or named step whose place is known, checked against the council's point:

| Asset | Property Address | Postcode | Step | INSPIRE ID | Polygon point | Distance from the council's point | Verdict |
|---|---|---|---|---|---|---|---|
| TA001 | 10 Fox Street, Homeless Unit, Annesley Woodhouse | NG17 9HX | address | 24906896 | [53.077868, -1.255061](https://www.openstreetmap.org/?mlat=53.077868&mlon=-1.255061#map=19/53.077868/-1.255061) | 2 m | Next to it |
| LC005 | Lammas Leisure Centre, Sutton in Ashfield | NG17 2AD | named | 23797499 | [53.12589, -1.268062](https://www.openstreetmap.org/?mlat=53.12589&mlon=-1.268062#map=19/53.12589/-1.268062) | 0 m | Right |
| LD001 | 153 Portland Road, Hucknall, Land, Hucknall | NG15 7SB | address | 29011276 | [53.031414, -1.195596](https://www.openstreetmap.org/?mlat=53.031414&mlon=-1.195596#map=19/53.031414/-1.195596) | 0.3 m | Next to it |
| CP009 | Piggins Croft, Hucknall Car Park, Hucknall | NG15 7LF | named | 60452821 | [53.037351, -1.205036](https://www.openstreetmap.org/?mlat=53.037351&mlon=-1.205036#map=19/53.037351/-1.205036) | 0 m | Right |
| MISC008 | Kings Mill Reservoir, Sutton in Ashfield | NG17 4PA | named | 60519696 | [53.130159, -1.23022](https://www.openstreetmap.org/?mlat=53.130159&mlon=-1.23022#map=19/53.130159/-1.23022) | 0 m | Right |
| LC004 | Huthwaite Leisure Centre, HUTHWAITE | NG17 2LR | named | 62756116 | [53.130308, -1.300834](https://www.openstreetmap.org/?mlat=53.130308&mlon=-1.300834#map=19/53.130308/-1.300834) | 0 m | Right |
| CC004 | Healdswood Community Centre, Sutton in Ashfield | NG17 3EE | named | 23089051 | [53.143435, -1.273329](https://www.openstreetmap.org/?mlat=53.143435&mlon=-1.273329#map=19/53.143435/-1.273329) | 0 m | Right |
| MISC001 | Annesley Old Church, Annesley | NG17 0AS | named | 25253301 | [53.066228, -1.249963](https://www.openstreetmap.org/?mlat=53.066228&mlon=-1.249963#map=19/53.066228/-1.249963) | 0 m | Right |
| BC002 | Byron Business Centre, Hucknall | NG15 7HP | named | 28968172 | [53.036218, -1.201841](https://www.openstreetmap.org/?mlat=53.036218&mlon=-1.201841#map=19/53.036218/-1.201841) | 0 m | Right |
| LC003 | Hucknall Leisure Centre, Hucknall | NG15 7AJ | named | 63485689 | [53.041082, -1.200807](https://www.openstreetmap.org/?mlat=53.041082&mlon=-1.200807#map=19/53.041082/-1.200807) | 0 m | Right |

Every match more than 25 m from the council's point:

| Asset | Property Address | Step | Distance |
|---|---|---|---|
| CP014 | Yorke Street, Hucknall Car Park, Hucknall | postcode | 7156 m |
| SUB052 | Oddicroft Lane, Sutton in Ashfield, Substation, Sutton in Ashfield | postcode | 2036 m |
| CP010 | Robin Hood, Kirkby Car Park, Kirkby in Ashfield | postcode | 1479 m |
| CR001 | Bluebell Wood Changing Room, Sutton in Ashfield | postcode | 1335 m |
| DEP001 | Northern Depot, Sutton in Ashfield | postcode | 1276 m |
| LD034 | Lammas Compound, Sutton in Ashfield | postcode | 506 m |
| CEM003 | Kingsway Cemetery, Kirkby in Ashfield | postcode | 461 m |
| RG001 | BRSA Kirkby Recreation Ground, Kirkby in Ashfield | postcode | 297 m |
| PK006 | Sutton Lawn Park, Sutton in Ashfield | postcode | 278 m |
| AL003 | California Allotment, Kirkby in Ashfield | postcode | 264 m |
| AL002 | Butlers Hill Allotment, Hucknall | postcode | 215 m |
| (no code 251) | Teversal Trust, SUTTON IN ASHFIELD | postcode | 166 m |
| SUB082 | Teversal Grange Country Inn, Teversal, Substation, Teversal | postcode | 166 m |
| CP011 | Robin Hood, Sutton Car Park, Kirkby in Ashfield | postcode | 161 m |
| BC003 | Kingsway Lodge Business Unit, Kirkby in Ashfield | postcode | 133 m |
| CP019 | North Sutton Car Park, Sutton -in Ashfield. | postcode | 131 m |
| PK008 | Titchfield Park, Kirkby, Kirkby in Ashfield | postcode | 129 m |
| CC005 | Manor Rooms Community Centre, Teversall Village | postcode | 129 m |
| PK002 | Huthwaite Welfare Park, HUTHWAITE | postcode | 126 m |
| SUB084 | Chapel Street, Underwood, Substation, Underwood | postcode | 114 m |
| LD023 | Wharf Green, Jacksdale (Grazing licence), Land, Jacksdale | postcode | 113 m |
| LC002 | Festival Hall Leisure Centre, Kirkby in Ashfield | postcode | 108 m |
| LD013 | Mansfield Hosiery Mills Sports Ground, Land, Sutton in Ashfield | postcode | 108 m |
| LD014 | Maun Valley Industrial Estate, Land, Sutton in Ashfield | postcode | 96 m |
| CEM001 | Broomhill Cemetery, Hucknall | postcode | 90 m |
| LD011 | Laburnum Grove, Kirkby (Coal Authority), Land, Kirkby in Ashfield | postcode | 89 m |
| AL009 | Garden Gap Allotment, HUTHWAITE | postcode | 88 m |
| CEM004 | South Ward, Skegby Lane Cemetery, Sutton in Ashfield | postcode | 87 m |
| AL026 | Wighay Allotment, Hucknall | postcode | 80 m |
| SUB001 | Waverley Close, Kirkby, Substation, Kirkby in Ashfield | postcode | 75 m |
| LD021 | The Poplars, Land, Sutton in Ashfield | postcode | 63 m |
| CP 018 | South Sutton Car Park, Sutton in Ashfield | postcode | 62 m |
| MKT005 | Market Place, Sutton, Sutton in Ashfield | postcode | 57 m |
| CEM002 | Huthwaite Cemetery, HUTHWAITE | postcode | 57 m |
| AL014 | Kingsway Allotment, Kirkby in Ashfield | postcode | 56 m |
| RG006 | Healdswood Recreation Ground, Sutton in Ashfield | postcode | 55 m |
| MKT003 | Kirkby Market Place, Kirkby in Ashfield | postcode | 52 m |
| RG002 | Butlers Hill Recreation Ground, Hucknall | postcode | 45 m |
| CP004 | Jacksdale Car Park, Jacksdale | postcode | 29 m |
| PK004 | Portland Park, Kirkby in Ashfield | postcode | 26 m |
| CC010 | The Poplars Community Centre, Sutton in Ashfield | postcode | 26 m |

### Price Paid sales in Ashfield in 2026

861 titles, of which 844 are freehold and matched. The other 17 (leasehold, or no tenure) can't be: INSPIRE Index Polygons outline only freehold titles (PRD FR-5.8).

What their addresses give:

| Address gives | Titles | Share |
|---|---|---|
| address | 773 | 91.6% |
| named | 71 | 8.4% |

**Match rate: 56 of 844 freehold titles (6.6%) matched one INSPIRE Index Polygon by the address or named step.** Counting every step, 107 (12.7%) matched one polygon, 737 (87.3%) were ambiguous, finding more than one, and 0 (0.0%) found none.

For 0 of them, its UPRN's point is more than 1 km outside Ashfield, a mistake, so they are not checked. Of the 296 whose place is known, 296 (100.0%) are inside an INSPIRE Index Polygon at all; the rest are on land with no registered freehold outline, which no match can find.

**Accuracy: of the 14 matched by the address or named step, 13 (92.9%) matched the polygon its UPRN's point is in, and 14 (100.0%) one within 25 m of it.** Counting every step, 15 of 37 (40.5%) were right, and 29 (78.4%) within 25 m.

By the step that placed each title:

| Step | Placed | Matched one polygon | Ambiguous | Median polygons when ambiguous | Matched, right polygon | Matched, within 25 m | Ambiguous, right one among them |
|---|---|---|---|---|---|---|---|
| address | 56 | 52 | 4 | 2 | 13 of 14 | 14 of 14 | 0 of 0 |
| named | 9 | 4 | 5 | 2 | 0 of 0 | 0 of 0 | 0 of 1 |
| street | 728 | 0 | 728 | 53 | 0 of 0 | 0 of 0 | 252 of 258 |
| postcode | 51 | 51 | 0 | – | 2 of 23 | 15 of 23 | 0 of 0 |

By Property type, matched by the address or named step:

| Property type | Freehold titles | Matched | Rate |
|---|---|---|---|
| Semi-detached | 323 | 9 | 2.8% |
| Terraced | 253 | 33 | 13.0% |
| Detached | 249 | 10 | 4.0% |
| Other (non-residential, land) | 17 | 4 | 23.5% |
| Flat or maisonette | 2 | 0 | 0.0% |

Every match by the address or named step whose place is known, checked against its UPRN's point:

| Sale | Property Address | Postcode | Step | INSPIRE ID | Polygon point | Distance from its UPRN's point | Verdict |
|---|---|---|---|---|---|---|---|
| {5834E4E9-BACA-29C7-E063-4804A8C015BC} | 71 SYLVAN AVENUE, KIRKBY IN ASHFIELD, NOTTINGHAM | NG17 8RG | address | 58148967 | [53.093356, -1.252773](https://www.openstreetmap.org/?mlat=53.093356&mlon=-1.252773#map=19/53.093356/-1.252773) | 0 m | Right |
| {5A7B802D-8328-1886-E063-4704A8C021AE} | 130 PORTLAND ROAD, HUCKNALL, NOTTINGHAM | NG15 7SA | address | 29002308 | [53.032798, -1.196792](https://www.openstreetmap.org/?mlat=53.032798&mlon=-1.196792#map=19/53.032798/-1.196792) | 1.4 m | Next to it |
| {5A7B802C-F66C-1886-E063-4704A8C021AE} | 24 NEW STREET, HUTHWAITE, SUTTON-IN-ASHFIELD | NG17 2LS | address | 45565999 | [53.129543, -1.300092](https://www.openstreetmap.org/?mlat=53.129543&mlon=-1.300092#map=19/53.129543/-1.300092) | 0 m | Right |
| {5834E4E9-19BC-29C7-E063-4804A8C015BC} | 33 PLAINSPOT ROAD, BRINSLEY, NOTTINGHAM | NG16 5BQ | address | 28798947 | [53.04851, -1.315485](https://www.openstreetmap.org/?mlat=53.04851&mlon=-1.315485#map=19/53.04851/-1.315485) | 0 m | Right |
| {5834E4E9-1A60-29C7-E063-4804A8C015BC} | 27 DERBYSHIRE DRIVE, WESTWOOD, NOTTINGHAM | NG16 5HQ | address | 28679264 | [53.06064, -1.329554](https://www.openstreetmap.org/?mlat=53.06064&mlon=-1.329554#map=19/53.06064/-1.329554) | 0 m | Right |
| {5834E4E9-1BA0-29C7-E063-4804A8C015BC} | 3 MANSFIELD ROAD, UNDERWOOD, NOTTINGHAM | NG16 5FF | address | 21048052 | [53.051306, -1.292865](https://www.openstreetmap.org/?mlat=53.051306&mlon=-1.292865#map=19/53.051306/-1.292865) | 0 m | Right |
| {5834E4E9-1FEF-29C7-E063-4804A8C015BC} | 10 FRANCES STREET, BRINSLEY, NOTTINGHAM | NG16 5BP | address | 28791177 | [53.048912, -1.315945](https://www.openstreetmap.org/?mlat=53.048912&mlon=-1.315945#map=19/53.048912/-1.315945) | 0 m | Right |
| {5A7B802C-F6D1-1886-E063-4704A8C021AE} | 55 PAPPLEWICK LANE, HUCKNALL, NOTTINGHAM | NG15 8EE | address | 29011792 | [53.041705, -1.19552](https://www.openstreetmap.org/?mlat=53.041705&mlon=-1.19552#map=19/53.041705/-1.19552) | 0 m | Right |
| {5834E4E9-1FB2-29C7-E063-4804A8C015BC} | 17 OLD MILL CLOSE, BESTWOOD VILLAGE, NOTTINGHAM | NG6 8TA | address | 29085399 | [53.019161, -1.183844](https://www.openstreetmap.org/?mlat=53.019161&mlon=-1.183844#map=19/53.019161/-1.183844) | 0 m | Right |
| {5834E4E9-199D-29C7-E063-4804A8C015BC} | 48 BYRON ROAD, ANNESLEY, NOTTINGHAM | NG15 0AG | address | 26011896 | [53.078031, -1.236353](https://www.openstreetmap.org/?mlat=53.078031&mlon=-1.236353#map=19/53.078031/-1.236353) | 0 m | Right |
| {5834E4E9-1A4E-29C7-E063-4804A8C015BC} | 88 FOREST ROAD, KIRKBY IN ASHFIELD, NOTTINGHAM | NG17 9HD | address | 25197859 | [53.077794, -1.250002](https://www.openstreetmap.org/?mlat=53.077794&mlon=-1.250002#map=19/53.077794/-1.250002) | 0 m | Right |
| {5A7B802C-F4C7-1886-E063-4704A8C021AE} | 33 LADYCROFT AVENUE, HUCKNALL, NOTTINGHAM | NG15 7FJ | address | 28553002 | [53.037198, -1.210461](https://www.openstreetmap.org/?mlat=53.037198&mlon=-1.210461#map=19/53.037198/-1.210461) | 0 m | Right |
| {5A7B802C-F4F6-1886-E063-4704A8C021AE} | 52 BYRON ROAD, ANNESLEY, NOTTINGHAM | NG15 0AG | address | 26003020 | [53.078256, -1.236381](https://www.openstreetmap.org/?mlat=53.078256&mlon=-1.236381#map=19/53.078256/-1.236381) | 0 m | Right |
| {5834E4E9-1A7A-29C7-E063-4804A8C015BC} | 144 CHURCH LANE, UNDERWOOD, NOTTINGHAM | NG16 5HD | address | 28932433 | [53.057021, -1.294489](https://www.openstreetmap.org/?mlat=53.057021&mlon=-1.294489#map=19/53.057021/-1.294489) | 0 m | Right |

Every match more than 25 m from its UPRN's point:

| Sale | Property Address | Step | Distance |
|---|---|---|---|
| {5A7B802C-F427-1886-E063-4704A8C021AE} | 86 WALK MILL DRIVE, HUCKNALL, NOTTINGHAM | postcode | 151 m |
| {5A7B802C-F41F-1886-E063-4704A8C021AE} | 1 LOUNDHOUSE ROAD, SUTTON-IN-ASHFIELD | postcode | 89 m |
| {5A7B802C-F63A-1886-E063-4704A8C021AE} | 12 SHAWCROFT, SUTTON-IN-ASHFIELD | postcode | 78 m |
| {5A7B802C-F76D-1886-E063-4704A8C021AE} | 78 GREENACRES, KIRKBY IN ASHFIELD, NOTTINGHAM | postcode | 56 m |
| {5834E4E9-1C53-29C7-E063-4804A8C015BC} | 79 WOODSIDE, SUTTON-IN-ASHFIELD | postcode | 50 m |
| {5834E4E9-1D62-29C7-E063-4804A8C015BC} | 65 GREENACRES, KIRKBY IN ASHFIELD, NOTTINGHAM | postcode | 40 m |
| {5834E4E9-BB5D-29C7-E063-4804A8C015BC} | 66 GREENACRES, KIRKBY IN ASHFIELD, NOTTINGHAM | postcode | 35 m |
| {5A7B802D-83FB-1886-E063-4704A8C021AE} | 24 TURNER GROVE, HUCKNALL, NOTTINGHAM | postcode | 33 m |

