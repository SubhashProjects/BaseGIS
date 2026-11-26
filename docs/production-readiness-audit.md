# BaseGIS / PowerGIS engineering audit

## Changes in this revision

- Reworked the dashboard into a responsive operations overview with KPI cards, a native SVG donut chart, a CSS bar chart and layer inventory. No charting/UI packages were added.
- Added a consistent visual treatment, mobile breakpoints, keyboard focus visibility and reduced-motion handling.
- Removed automatic demo credential population and all local/demo authentication fallbacks.
- Replaced browser-stored user-profile restoration with opaque session-token validation through `session_user`; logout revokes the server session.
- Changed asset and jurisdiction reads to pass the session token, and updated migration 006 so these RPCs reject raw user IDs as authentication.
- Stopped merging browser-local/demo assets into the live authorised GIS inventory.
- Added migration 006 to hash existing non-empty test passwords with bcrypt and remove the username-equals-password authentication bypass.
- Centralised map tile templates and made providers configurable with environment variables.
- Added import file-size and feature-count limits, geometry validation and asset-type allow-listing to the GIS import Edge Function.
- Protected the daily-backup Edge Function with a required server-side cron secret and POST-only invocation.
- Replaced the README's test-phase claims with deployment guidance and a production release checklist.

## Important production blockers still requiring environment/database work

This revision improves the source but cannot certify a live deployment without the Supabase project, hosting configuration, and real user accounts. Do not label the deployment production-ready until these are completed:

1. **Credentials:** Migration 006 hashes existing credentials, but the original seeded passwords were weak username-based test passwords. Set unique strong passwords for every account and remove unused/test accounts. Add rate limiting, lockout and a password-reset/change workflow.
2. **All write paths:** Audit every RPC, table mutation and Edge Function for session-token validation and server-side role/jurisdiction enforcement. In particular, review asset edit/delete, approval transitions, user administration, imports, exports and backup management. Client-side page/role visibility is not authorization.
3. **Asset mutation:** Existing asset edit/delete flows contain browser-local fallback behavior and must be migrated to explicit, audited database RPCs before relying on them operationally.
4. **Approval workflow:** The current approvals screen is a read-only listing; its Review control is not a completed approval transaction. Implement state-transition RPCs with JE/AE/EE/SE role checks, audit history and concurrency protection.
5. **Backup operations:** Configure `POWERGIS_BACKUP_CRON_SECRET` as an Edge Function secret and schedule the function through a trusted scheduler. Verify the bucket is private, retention is configured, and restore drills succeed.
6. **Basemap licensing:** Confirm the selected tile provider permits the intended production use, add required attribution, configure quotas/keys where applicable, and avoid relying on public/demo tile endpoints for availability guarantees.
7. **Security operations:** Configure HTTPS, CSP and other security headers, dependency scanning, database backups, monitoring, alerting and incident response at the hosting/Supabase layers.
8. **End-to-end verification:** Test every role against real staging data, including cross-jurisdiction access denial, expired/revoked sessions, import abuse cases, backup access, mobile layouts and large GIS datasets.

## Dependency note

No new frontend runtime or charting dependencies were introduced. The repository still uses its existing React/React DOM/Vite/TypeScript toolchain, and the existing Supabase Edge Functions import external packages for Supabase access and GIS file parsing. A literal zero-third-party-software build would require replacing the existing React/Vite stack and those Edge Function parsers; that is not a safe drop-in change for this project.

## Verification status

- TypeScript/TSX source transpilation syntax check: passed for 40 source and Edge Function files.
- Full `npm run build` and `npm run lint`: not verified in this environment. The pre-existing `node_modules` installation was incomplete, and `npm ci` could not complete within the available execution window. Re-run both commands in a normal network-enabled development environment before deployment.
- Migration 006: generated but not applied to a live Supabase database here. Apply to a disposable staging copy first and validate the password migration and RPC permissions before production.

## Scalability hardening added in this revision

- Added `007_scale_read_paths.sql` with keyset-paginated authorised asset reads, PostgreSQL-side dashboard statistics, GIS asset indexes, user-scope indexes and session expiry indexes.
- Dashboard statistics no longer require downloading the entire asset inventory to calculate totals, status counts and layer counts.
- Large authorised asset reads are fetched in bounded pages instead of one unbounded JSON response, with a client-side safety ceiling.
- Asset refresh events are debounced to prevent bursts of repeated reads when several local changes happen together.
- GIS imports use configurable database batch sizes and a high but bounded server-sync ceiling rather than silently stopping after 1,500 records.
- Existing client-side IndexedDB remains an offline/import cache; the database RPC layer remains the authoritative concurrent multi-user path.

### Concurrency note

These changes make the application substantially safer for large datasets and concurrent users, but they do not by themselves establish a numeric capacity guarantee. Final concurrent-user limits depend on the Supabase/Postgres plan, connection pooling, PostGIS query cost, storage, tile provider quotas, hosting limits and production data shape. Load-test the deployed staging environment with realistic GIS volumes before assigning an SLA.

## Operational reliability pass (2026-11-26)

See `docs/operational-reliability-hardening.md` for the full release gate. This pass removes browser-profile session restoration and local/demo authentication fallbacks, validates sessions on startup, removes local/demo records from the live GIS inventory, makes the paginated read path fail closed, hardens import/export/backup semantics, adds migration 008 for opaque-session-only data-management RPCs and import audit events, and disables incomplete asset/user/approval writes. These changes deliberately reduce available write functionality until the required server-side transactions are implemented; they do not certify a live deployment or load capacity.
