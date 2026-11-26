# Supabase setup

1. Create/open the PowerGIS Supabase project.
2. Run the migrations in order: `001_powergis_core.sql`, `002_powergis_organisation_seed.sql`, `003_production_table_names.sql`, `004_secure_test_sessions.sql`, `005_data_import_export_backup.sql`, `006_authentication_hardening.sql`, then `007_scale_read_paths.sql`, `008_operational_security.sql`, `009_operational_workflows.sql`, and `010_admin_backup_restore.sql`.
3. Copy the project URL and anon key into `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

4. Run `npm install` and `npm run build`.

The application no longer needs a local demo environment variable. There is no simulator page and no simulator on/off switch. The test login is database-backed and uses username = password temporarily.

The login directory is read from `login_users()`. After login, the application requests only the authorised assets and JE boundaries for the selected identity through `visible_assets()` and `visible_jurisdictions()`.

The database seed contains the 68 organisation identities, 41 JE jurisdiction polygons and 292 GIS assets from the previous organisation seed dataset.

For production, replace the test login directory with Supabase Auth-backed profiles. Keep PostGIS geometries and the hierarchy/jurisdiction relationships.


### Production table labels
The test dataset is stored under production-oriented names: `organization_users`, `gis_jurisdictions`, and `gis_assets`. Migration `003_production_table_names.sql` upgrades an older database that already used the previous table/function names.

### Temporary test credentials
For the current test phase, each seeded account uses its username as its password. This is intentionally temporary and should be replaced before production deployment.


## Operational workflows migration

Apply `supabase/migrations/009_operational_workflows.sql` and `010_admin_backup_restore.sql` after migrations 001–008 in staging first. It adds version-checked asset edits, recoverable archives, role-checked review transitions and audit queries. See `docs/operational-workflows-release.md` for the role matrix, backup worker configuration and acceptance tests.


### GIS Admin backup and restore

Apply migrations 001 through 010 in order. Deploy both `daily-backup` and `backup-restore` Edge Functions. Keep the `powergis-backups` storage bucket private and configure `POWERGIS_BACKUP_BUCKET`, `POWERGIS_BACKUP_CRON_SECRET`, and optionally `POWERGIS_BACKUP_RESTORE_MAX_BYTES`. Only a completed manifest can be downloaded or restored. Test restore on a disposable staging database first. See `docs/operational-workflows-release.md`.
