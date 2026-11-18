# Supabase setup

1. Create/open the PowerGIS Supabase project.
2. Run `supabase/migrations/001_powergis_core.sql`.
3. Run `supabase/migrations/002_powergis_organisation_seed.sql`.
4. Copy the project URL and anon key into `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

5. Run `npm install` and `npm run build`.

The application no longer needs a local demo environment variable. There is no simulator page and no simulator on/off switch. The test login is database-backed and uses username = password temporarily.

The login directory is read from `login_users()`. After login, the application requests only the authorised assets and JE boundaries for the selected identity through `visible_assets()` and `visible_jurisdictions()`.

The database seed contains the 68 organisation identities, 41 JE jurisdiction polygons and 292 GIS assets from the previous organisation seed dataset.

For production, replace the test login directory with Supabase Auth-backed profiles. Keep PostGIS geometries and the hierarchy/jurisdiction relationships.


### Production table labels
The test dataset is stored under production-oriented names: `organization_users`, `gis_jurisdictions`, and `gis_assets`. Migration `003_production_table_names.sql` upgrades an older database that already used the previous table/function names.

### Temporary test credentials
For the current test phase, each seeded account uses its username as its password. This is intentionally temporary and should be replaced before production deployment.
