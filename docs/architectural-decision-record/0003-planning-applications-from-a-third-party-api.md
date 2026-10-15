# Planning Applications come from a third-party API, not planning.data.gov.uk

planning.data.gov.uk's planning-application dataset is marked "incomplete and not yet ready for use": no councils supply it, and its records are seeded by MHCLG. Its constraint datasets are authoritative and free, so Planning Constraints come from there. Planning Applications come from a third-party provider behind one adapter interface. Scraping council planning portals ourselves was rejected as fragile and legally unclear.

Phase 1 defaults to **PlanIt**. It is free, needs no key, has a native lat/lng and radius search, and covers all of England back to about 2000. That fits a local build. Its limits shape the design: about 1 request per minute (~300 per day), so requests go through a queue with a 7-day cache, and its terms offer "no commercial terms". **PlanWire** is a second adapter, enabled by an API key. It has a radius endpoint, and is the intended provider once the product is hosted in Phase 2.

## Consequences

The first search of a new Search Area may wait up to about a minute for Planning Applications while other Layers load. About 9% of PlanIt records have no location and are dropped, and 27% have postcode-derived coordinates, which the UI marks as approximate.
