# Operational Workflows Release

This release adds server-enforced asset mutation, review, backup/restore and viewport workflows. Apply migrations in numeric order through `010_admin_backup_restore.sql` in a staging Supabase project before enabling the application.

## What is now implemented

- Asset records carry an integer `version` for optimistic concurrency.
- GIS Admin asset edits run through `admin_update_asset`; the database checks the live session, role, geometry validity, asset type and expected version.
- Asset deletion is a soft archive (`archived_at`) rather than physical deletion. Bulk archive is atomic: the entire selected set is archived or none is.
- Archived records are excluded from paginated live inventory, dashboard statistics and authorised export. Restoration is available through the server RPC `admin_restore_asset` and requires the expected version.
- Review transitions run through `review_asset_submission`, check the active session, current stage, role and assigned JE/jurisdiction, increment the version and write an audit event. Concurrent review attempts fail rather than overwrite one another.
- The approval screen is connected to the review RPC. It requires a reason for rejection and refreshes after a confirmed transition.
- The backup worker now atomically claims a pending admin backup request (or creates a scheduled daily snapshot), pages through a service-role-only snapshot RPC with explicit GeoJSON geometry serialization, excludes password hashes and session tokens, includes the operational audit trail, applies a configurable row ceiling, writes only to the configured private bucket, and records completion/failure in `powergis_backup_runs`.

## Review role matrix currently encoded

| Current stage | Permitted reviewer | Approve result | Reject result |
|---|---|---|---|
| `SUBMITTED` | Assigned JE or GIS Admin | `JE_REVIEW` | `REJECTED` |
| `JE_REVIEW` | AE/AEE/EE/SE in assigned jurisdiction, or GIS Admin | `AE_REVIEW` | `REJECTED` |
| `AE_REVIEW` | AE/AEE/EE/SE in assigned jurisdiction, or GIS Admin | `APPROVED` | `REJECTED` |

This is a conservative initial matrix inferred from the existing UI workflow. Confirm it with the organisation's actual delegation-of-authority policy before production. Do not broaden the matrix only in the UI; update the database function and tests together.

## Required Supabase configuration

- Apply migrations `001` through `010` in order. Do not apply `009` to a production database before validating it against a staging clone.
- Deploy `supabase/functions/daily-backup`.
- Set `POWERGIS_BACKUP_CRON_SECRET`, `POWERGIS_BACKUP_BUCKET`, and optionally `POWERGIS_BACKUP_MAX_ROWS` in the Edge Function environment.
- Configure the backup bucket as **private**. Do not create public object URLs or expose the service-role key to the browser.
- Schedule the function using a trusted scheduler that sends `x-backup-secret`. Keep the secret in the scheduler's secret store.
- Configure retention and run a restore drill. A completed upload is not a verified recoverable backup until restoration has been tested.

## Important limitations

- User administration/password reset remains disabled pending a separately designed identity lifecycle (prefer Supabase Auth rather than custom browser-managed credentials).
- Full PostGIS vector-tile delivery and server-side clustering are not implemented. The GIS map uses bounded viewport queries, while the inventory table retains a browser safety ceiling; do not claim unlimited dataset support.
- The backup worker builds a bounded JSON payload in memory. For datasets exceeding the configured ceiling, use a database-native or object-streaming backup process rather than raising the ceiling without capacity testing.
- No database migration, production build, live Supabase integration, backup restoration or concurrent-user load test was executed in this environment.

## Staging acceptance tests

1. GIS Admin edits an asset with the current version; the version increments and an audit event appears.
2. Two clients load version N. Client A saves; client B's save using N fails with a concurrency conflict.
3. A non-admin calls the asset mutation RPC and receives a permission error.
4. A malformed geometry, unsupported asset type, empty asset number or out-of-range WGS84 geometry is rejected.
5. A bulk archive with one invalid/already archived ID archives none of the selected records.
6. Archived records disappear from live map inventory, statistics and export; restore brings them back and increments the version.
7. JE can review only assigned submissions; a JE outside the asset's owner assignment is rejected.
8. AE/AEE/EE/SE can review only records intersecting their assigned jurisdiction IDs.
9. Two users review the same version; only the first transition succeeds.
10. Rejection without a reason is blocked by the UI; direct RPC calls still require a valid decision and server-side authorisation.
11. Backup object contains no `password` or session token fields, is stored in a private bucket, and has matching row counts.
12. Simulate backup upload failure and verify a `FAILED` manifest is recorded without leaking secrets.
13. Restore a backup into an isolated staging project and compare record counts and representative geometry.
14. Verify non-GIS-Admin users cannot list backup manifests, create a backup request, download a signed backup URL, or invoke restore directly; verify GIS Admin can do all four only for `COMPLETED` manifests.
15. Restore an older snapshot after creating newer records and confirm the operation is additive: newer records remain, matching rows are updated, existing password hashes are unchanged, and a `BACKUP_RESTORE` audit event is written.
16. Run the k6 viewport test with 10, 50 and 100 concurrent staging users and inspect database query plans and PostGIS index use.

## GIS Admin backup and restore controls (migration 010)

- Backup creation, history, download and restore are exposed only in the GIS Admin data-management workspace. The database RPC and `backup-restore` Edge Function independently validate the live opaque session and `GIS_ADMIN` role; UI hiding is not the security boundary.
- Backup creation queues a `REQUESTED` manifest. The trusted `daily-backup` worker must run with `POWERGIS_BACKUP_CRON_SECRET` and a private `POWERGIS_BACKUP_BUCKET`; a backup is downloadable only after its manifest is `COMPLETED`.
- Download links are short-lived (60 seconds) and generated server-side from the private bucket. The browser never receives the service-role key or bucket listing access. The backup worker reads bounded pages through a service-role-only RPC that explicitly serializes PostGIS geometries as GeoJSON and excludes credential material.
- Restore is an atomic, additive upsert: it inserts missing and updates matching users, jurisdictions and assets, appends imported audit history, and writes a restore audit event. It does not delete records that were created after the backup. Existing password hashes and live sessions are never backed up or overwritten; new users restored from backup need their identity credentials provisioned separately.
- GIS Admin must take a fresh backup before restoring. The UI asks for confirmation and disables download/restore until the worker reports `COMPLETED`.
- Restore is limited to 256 MB and one million combined rows by default. Asset geometry is validated and limited to 50,000 vertices. Conflicting unique asset numbers or invalid references fail the transaction rather than partially applying a restore.
- Deploy migration 010 and the `backup-restore` Edge Function. Keep the backup bucket private. Configure `POWERGIS_BACKUP_BUCKET`, `POWERGIS_BACKUP_CRON_SECRET`, and optional `POWERGIS_BACKUP_RESTORE_MAX_BYTES` in the Edge Function environment.
- The restore flow has not been exercised against a live staging database or real backup object in this build. Run the documented restore drill on a disposable staging project before production use.

## Viewport and concurrency

The GIS map uses debounced viewport RPC requests rather than full-inventory browser downloads. `visible_assets_in_bbox` enforces session visibility and returns a bounded 5,000-row response from the indexed PostGIS geometry. A k6 ramp test is included at `tests/load/viewport-assets.k6.js`; run it only against staging with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `POWERGIS_SESSION_TOKEN` environment variables. The script ramps to 100 concurrent virtual users and checks response latency/error thresholds. It is a test harness, not evidence that a production load test has already passed.


## Security perimeter hardening (migration 011)

- The unauthenticated `login_users` directory enumeration RPC is removed. The login screen no longer downloads the officer directory before authentication.
- GIS Admin directory access uses `admin_list_users` and a live session token. Password hashes, session tokens and source-row provenance are never returned to the browser.
- Session tokens are held in `sessionStorage` rather than persistent `localStorage`; closing the browser tab removes the token.
- Authentication now enforces active-account checks and a username-keyed failed-login throttle (5 failures in a 15-minute window). Authentication failures use generic responses to reduce account enumeration.
- Backup restore/download requests use a dedicated session header and can be restricted to the approved application origin with `POWERGIS_ALLOWED_ORIGIN`.
- Backup objects are application-encrypted with AES-256-GCM before being stored. Configure `POWERGIS_BACKUP_ENCRYPTION_KEY` as a 32-byte random server-only secret and never put it in a `VITE_` variable.
- Backup files are now `.pgbk` encrypted envelopes. The restore function decrypts them server-side only.
- Keep the backup storage bucket private and deny public object access.
- Use HTTPS only, secure DNS, a reverse proxy/WAF, database point-in-time recovery, and restricted Supabase project/team access in production.

### Security acceptance tests

1. Anonymous call to `login_users` is rejected because the function no longer exists.
2. Anonymous call to `admin_list_users` is rejected.
3. A non-admin live session cannot list users or retrieve backup paths.
4. Five failed authentication attempts for the same username cause temporary throttling.
5. Backup storage objects cannot be read anonymously.
6. A leaked backup object cannot be parsed as JSON without the server-only encryption key.
7. Restore fails when the backup envelope is modified, because AES-GCM authentication fails.
8. Closing the browser tab removes the custom session token.
9. `POWERGIS_ALLOWED_ORIGIN` rejects browser requests from an unapproved origin.
10. Production deployment must use a security review, dependency scanning, WAF/rate limiting, centralized audit monitoring, and a tested incident-response/disaster-recovery procedure.


### Mandatory credential provisioning

Migration 011 disables accounts that still use the known seeded/test pattern `username == password`. This is intentional for a sensitive deployment. Do not re-enable those accounts manually with the old password. Provision unique high-entropy passwords through a trusted server-side identity workflow before go-live. The application source must never contain real production passwords, password hashes, API service-role keys, or reusable bootstrap credentials.


### Initial secure administrator provisioning

Migration 011 intentionally disables known seeded/test credentials. Configure the server-only `POWERGIS_BOOTSTRAP_SECRET`, deploy `bootstrap-admin`, and run the one-time bootstrap request from a trusted administration workstation to assign a unique administrator password. The database marks bootstrap as consumed; repeated bootstrap attempts are rejected. Remove/rotate the bootstrap secret after provisioning and do not store it in the frontend, source control, screenshots, tickets, or shell history.
