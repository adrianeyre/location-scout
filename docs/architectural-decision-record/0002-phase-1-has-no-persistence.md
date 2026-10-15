---
status: accepted (narrowed by ADR 0004)
---

# Phase 1 has no database server and no stored history

Phase 1 runs only on a developer's machine and fetches most Data Sources live for each search, with at most a short-lived in-memory cache. There is no database server, no scheduled import and no historical data, so trends and "what's changed?" are out of scope until Phase 3. We chose this to keep the first pass free and simple, and to prove the experience before investing in ingestion. The backend's response shape is designed so a database can later sit behind it without changing the frontend. ADR 0004 allows one exception: local data files prepared once, for land data that has no live API.
