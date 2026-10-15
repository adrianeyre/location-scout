# Bulk-only data is prepared into local files and queried with DuckDB

The Land Opportunity Finder needs HM Land Registry's INSPIRE Index Polygons, which have no API and are published only as monthly GML files, one per local authority. It also needs OpenStreetMap land-use and building data at a scale Overpass isn't suited to. Other sources are also published only as bulk files: Census 2021, income estimates, the Indices of Deprivation, GIAS and Ofsted, and CCOD/OCOD. So Phase 1 has a one-off `data:prepare` script. It downloads the England-wide files plus the land data for the chosen Land Coverage Areas and converts them into GeoParquet files in a local `data/` folder. The backend queries those files with DuckDB's spatial extension, which runs inside the backend process.

## Considered Options

- **Live APIs only:** impossible, because INSPIRE has no API.
- **Postgres + PostGIS locally:** a server to install and run, which Phase 1 avoids. It moves to Phase 3 alongside history.
- **SQLite/SpatiaLite:** workable, but DuckDB reads GeoParquet directly and its spatial SQL is close to PostGIS, which eases a later move.

## Consequences

The Land Opportunity Finder only works inside prepared Land Coverage Areas (Ashfield to start). Demographics, school ratings and Ownership Categories only work once the England-wide files are prepared. Prepared files are not history: re-running the script replaces them.
