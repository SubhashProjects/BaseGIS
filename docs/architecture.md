# Architecture

React View -> ViewModel -> Service -> Supabase/Postgres/PostGIS -> RLS

## Shared boundary rule
An asset is not assigned to one and only one jurisdiction. Spatial assignment creates zero, one or many rows in `asset_jurisdictions` using `ST_Intersects`. Therefore a line crossing two subdivisions, or an asset located on a shared boundary, can be visible to authorized users from both jurisdictions.

## Production hardening to complete before go-live
- Import authoritative region/circle/division/subdivision/JE boundary polygons.
- Add exact user identities to Supabase Auth and map them to profiles/user_jurisdictions.
- Add server-side approval RPCs with role checks and immutable audit events.
- Configure automated database/storage backup retention.
- Add import staging tables and validation reports.
- Add rate limits, monitoring and error reporting.
- Restrict Google Maps API key by HTTP referrer and required APIs.
