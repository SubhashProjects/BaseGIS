# PowerGIS data management

## Supported source layers

The GIS Admin import center accepts:

- KML / KMZ source files
- GeoJSON / JSON
- CSV with `latitude`/`longitude` or a GeoJSON geometry column
- Excel XLS / XLSX with latitude/longitude or geometry JSON
- GeoPackage GPKG feature tables

The import pipeline normalizes features to WGS84 GeoJSON and sends them through the session-bound `admin_import_assets` RPC. The RPC validates the GIS Admin session, asset type, geometry and duplicate asset number before writing to `gis_assets`.

The layer files shown in the PowerGIS source inventory are therefore suitable as import sources: CurrentTransformer.kml, Distribution_Transformer.kml, DT-Feeder boundary, DTFeederLocation.gpkg, Feeder_Meter.kml, HT feeders - Distribution Transformers, HT feeders-Transmission and Distribution, HTfeedersDistributionTransformers.gpkg, LT.kml, Power_Transformer.kml, Substations and Transmission Lines, plus TransmissionTowers.gpkg.

## Export

Exports are scoped to the signed-in session. GIS Admin can export the full authorised inventory as GeoJSON, CSV or PowerGIS JSON.

## Daily backups

`supabase/functions/daily-backup` creates a complete JSON snapshot of organisation users, jurisdiction boundaries and GIS assets and stores it in the `powergis-backups` Supabase Storage bucket. Deploy the function with the Supabase service role key kept only in the server-side function environment, then schedule it once daily using Supabase Scheduled Functions / pg_cron. The application never exposes the service role key.

The database also records each completed run in `powergis_backup_runs` so the Administration page can display backup history.
