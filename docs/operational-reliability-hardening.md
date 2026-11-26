# Operational reliability hardening

## Implemented in this source revision

- Browser startup no longer trusts a serialized user profile. It validates the opaque session token through `session_user` before rendering protected modules.
- Login no longer falls back to hard-coded GIS Admin / SE identities, username-as-password assumptions, or a browser-local user registry.
- Logout revokes the server session and removes the local token.
- GIS assets and jurisdiction boundaries are read through session-bound, server-authorised RPCs only.
- The live GIS inventory no longer merges sample records or browser-local imports into the operational dataset.
- The GIS read path fails closed when the paginated RPC is unavailable; it does not silently fall back to an unbounded legacy response.
- Asset update/delete and user create/update/deactivate operations fail closed until their server-side, role-checked, audited mutation RPCs exist. Browser-local overrides/deletions are not treated as database changes.
- Imports require a configured server connection, use bounded batches, report server-side inserted/skipped/error counts, and support safe duplicate skipping only. Overwrite/rename are deliberately rejected until the server implements those semantics.
- Exports no longer fall back to local-only assets. Backup requests no longer fabricate local backup IDs.
- Supabase requests have a 20-second timeout.
- Migration 008 requires a valid unexpired opaque session token for import/export/backup RPCs; raw user IDs are not accepted. It records GIS import batch audit events. Backup manifests remain `REQUESTED` until a trusted backup worker confirms actual storage.
- Approval actions are explicitly read-only and disabled until the server-side workflow exists.

## Required deployment steps

1. Back up the staging database and apply migrations `001` through `008` in numeric order.
2. Verify `authenticate_user`, `session_user`, `logout_user`, `visible_assets_page`, `visible_asset_stats`, `visible_jurisdictions`, `admin_import_assets`, `export_assets`, `create_backup_manifest`, and `list_backup_runs` using real staging accounts and expired/invalid tokens.
3. Confirm all seeded passwords are unique strong credentials. Remove test accounts and configure login throttling / lockout at the edge or gateway.
4. Confirm `login_users` returns only the minimum directory fields required by the login selector. Prefer a username-first login flow if exposing the directory is not acceptable.
5. Configure the trusted backup worker and private storage. A `REQUESTED` manifest is not a backup. Verify stored artifacts, retention, integrity checks and restoration before enabling production claims.
6. Implement server-side asset mutation RPCs with role and jurisdiction enforcement, optimistic version checks, soft-delete/recovery and audit events before enabling edit/delete controls.
7. Implement server-side user administration and approval transition RPCs with role checks, immutable history, idempotency and concurrent-transition protection.
8. Add a resumable import job table/worker for large files. The current bounded RPC batches can partially commit; inspect returned per-feature errors and retry idempotently by asset number.
9. Add viewport-based PostGIS vector tiles / spatial aggregation before supporting inventories above the 25,000-record browser safety ceiling. Do not load the entire inventory into the browser for dense map use.
10. Run cross-role, cross-jurisdiction, concurrency, import-abuse, backup-restore and low-memory Android tests against the deployed staging environment.

## Known limitations / intentionally disabled workflows

- Asset editing and deletion are disabled. This is intentional: the previous browser-local behaviour could make one user's browser disagree with the database and other users.
- User administration mutations are disabled until a server-side implementation exists.
- Approval transitions are disabled; the current schema and client screen do not yet provide a complete operational workflow for the organisation-user / GIS-asset data model.
- Backup manifest creation only requests a backup. It does not create a database dump or upload an artifact.
- The GIS client still fetches authorised assets in pages and caps the browser inventory at 25,000. It is not a vector-tile architecture.
- The database import function commits bounded batches independently. A multi-batch import is not one atomic transaction; use returned results and idempotent retries.
- No production concurrency capacity or performance SLA is claimed. Load testing requires the actual Supabase project, hosting tier, production-like geometry volume and realistic concurrent sessions.

## Release gate

Do not enable operational write workflows or call the deployment production-ready until the required server-side mutations, approval workflow, backup/restore, monitoring and staging tests are complete. A green frontend build does not substitute for applying and testing the database migrations.

## Browser session note

The opaque session token is still held in browser `localStorage` so the current custom-session architecture can survive a page reload. This is not equivalent to an HttpOnly secure cookie: a successful XSS attack could read it. Production hosting must enforce HTTPS, a restrictive Content-Security-Policy, output escaping, dependency hygiene and short session expiry. A future migration to Supabase Auth or a backend-for-frontend with HttpOnly/Secure/SameSite cookies is recommended.
