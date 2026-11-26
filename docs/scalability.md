# PowerGIS scalability design

## Large GIS datasets

- Authorised asset reads use keyset pagination through `visible_assets_page()` instead of one unbounded JSON response.
- PostgreSQL performs dashboard counts and layer aggregation through `visible_asset_stats()`.
- GIS reads are bounded by a client safety ceiling so a very large database cannot accidentally allocate unlimited browser memory.
- Existing PostGIS/GiST, owner/jurisdiction GIN and scope indexes are retained and additional ordering/status/session indexes are added in migration 007.
- Import processing remains chunked and yields to the browser event loop between batches.

## Concurrent users

- Authorisation remains server-side through the session token and scoped RPCs.
- Browser local state is treated as an offline/import cache, not the shared source of truth.
- Refresh notifications are debounced so repeated local changes do not create a request storm.
- Dashboard aggregation avoids transferring the entire asset table to every concurrent browser.
- Keyset pagination avoids increasingly expensive OFFSET scans for later asset pages.

## Capacity expectations

The code is designed to scale substantially better than the original unbounded-read path, but capacity is deployment-dependent. Establish production limits with staging load tests using the expected asset volume, geometry complexity, concurrent sessions, tile traffic and import rate.


## Map viewport delivery

The GIS map now requests `visible_assets_in_bbox` after map pan, zoom, or resize. The RPC applies the same server-side role/jurisdiction visibility rules, uses the PostGIS geometry index, returns only intersecting active assets, and caps each response at 10,000 rows (the client requests 5,000). Map view no longer downloads the complete organisation inventory. Dashboard and admin summary cards use aggregate statistics instead of loading all asset geometries. Validate query plans with production-sized spatial data and tune indexes/limits on staging.
