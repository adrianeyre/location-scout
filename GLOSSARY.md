# Location Scout

Location Scout helps someone understand a place in England: they pick a spot and get a map and a summary of everything around it.

## Language

### Searching

**Location**:
The single point (latitude and longitude) a user is asking about, chosen from a postcode, an address or a map click.
_Avoid_: Place, spot, address (an address is only one way to pick a Location)

**Search Radius**:
The distance around a Location that every Layer covers. It is one of 0.25, 0.5 or 1 mile.
_Avoid_: Range, area, catchment

**Search Area**:
The circle defined by a Location and its Search Radius.
_Avoid_: Neighbourhood, zone, region

### What the user sees

**Layer**:
One category of Features shown on the map, which the user can switch on or off, such as Crime, Planning or Businesses.
_Avoid_: Overlay, dataset, filter

**Feature**:
One real-world thing inside a Search Area that appears on the map as a pin or shape, such as a planning application, a reported crime or a café.
_Avoid_: Pin, marker, item, POI (a pin is only how a Feature is drawn)

**Location Overview**:
The summary panel for a Search Area: headline statistics per Layer plus Category Scores.
_Avoid_: Report, summary, dashboard (the Dashboard is a view of its own)

**Dashboard**:
A full-width view of a Search Area, opened in place of the map: the same figures the Location Overview gives, drawn as charts, with a card for each Layer.
_Avoid_: Charts, analytics, overview (the Location Overview is the panel beside the map)

**Widget**:
One card on the Dashboard: the Location Score, the Category Scores, the Highlights, or a Layer's figures. It can be moved about the Dashboard's Grid, snapping to its cells.
_Avoid_: Card, panel, tile (a stat tile is one figure inside a Widget)

**Planning Constraint**:
An area-based planning designation that limits what can be built, such as a conservation area, listed building, Article 4 direction, tree preservation zone or flood zone.
_Avoid_: Restriction, designation, planning data

**Planning Application**:
A request to a council for permission to build or change the use of land or buildings, at a single site.
_Avoid_: Application, development, proposal

### Judging a location

**Category Score**:
A 0–100 rating of one aspect of a Search Area (for example Safety or Amenities), calculated by fixed, published rules.
_Avoid_: Rating, grade, AI score

**Highlight**:
A short Good, Watch or Concern statement about a Search Area, produced by a fixed rule from calculated figures.
_Avoid_: Insight, flag, alert (an alert is a notification about change)

**Location Score**:
The weighted combination of Category Scores for a Search Area.
_Avoid_: Overall rating, area score

**Scout Mode**:
A question-specific view (for example "open a café" or "buy to let") that changes which Category Scores matter and how they are weighted.
_Avoid_: Persona, use case, profile

**AI Explanation**:
Plain-English commentary on a Search Area or Land Opportunity, written only from figures the product has already calculated.
_Avoid_: AI analysis, AI score, insight

### Land

**Land Parcel**:
A contiguous piece of open or undeveloped land identified from map data, independent of any legal title.
_Avoid_: Plot, site, title (a title is a legal registration, not a parcel)

**Land Opportunity**:
A Land Parcel that meets the user's filters (size, access, constraints) and therefore warrants further investigation. It is never a claim that the land is available or unowned.
_Avoid_: Unclaimed land, free land, development site

**Possibly Unregistered**:
A flag on a Land Parcel when no registered freehold title outline covers most of it. Unregistered land still has an owner.
_Avoid_: Unowned, unclaimed, ownerless

**Ownership Category**:
An indicative grouping of who holds land: company-owned, council or public-body owned, other registered, or Possibly Unregistered.
_Avoid_: Owner, ownership (an Ownership Category never names or confirms an owner)

**Land Coverage Area**:
A council area whose land data has been prepared locally, so Land Opportunities can be found inside it.
_Avoid_: Prepared area, region, coverage

**Saved Location**:
A Location and Search Radius the user has kept for later or for comparison.
_Avoid_: Favourite, bookmark, watchlist

### Data

**Data Source**:
An external provider that supplies Features for one or more Layers, such as the Police API.
_Avoid_: Provider, feed, integration
