# PowerGIS — Electricity Distribution GIS

PowerGIS is a React + TypeScript + Vite application with a Supabase/PostGIS data layer and a dependency-free SVG/CSS dashboard visualisation layer.

## Technology and dependency policy

- Runtime dependencies remain the project's existing React and React DOM packages.
- No charting, UI, mapping, date, or utility libraries have been added. Dashboard charts are native SVG/CSS.
- TypeScript strict build and ESLint are the intended quality gates.

## Setup

1. Install the existing dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Apply Supabase migrations in numeric order, including `006_authentication_hardening.sql`, `007_scale_read_paths.sql`, and `008_operational_security.sql`.
4. Configure Supabase RLS policies and Storage policies for the deployment environment.
5. Run `npm run lint`, `npm run build`, then `npm run preview` for a local production preview.

Never commit `.env` or service-role keys. A Supabase anon key is a public client key, not a secret; authorization must be enforced by database policies and security-definer RPC functions.

## Authentication migration notice

Migration `004_secure_test_sessions.sql` was a test-phase implementation: it accepted username-equals-password credentials and stored plaintext passwords. Migration `006_authentication_hardening.sql` converts existing non-empty passwords to bcrypt hashes and replaces the authentication RPC with strict credential comparison. The frontend no longer silently authenticates local/demo users, creates fake administrator sessions, or restores a user from a browser-stored profile object. It stores only the opaque session token and validates it against `session_user` on application startup.

**Important:** existing test credentials are still weak even after hashing. Before production, set unique strong passwords for every account, enable rate limiting/lockout at the authentication boundary, review session revocation, and test role/jurisdiction access using real accounts. Do not expose the test seed dataset or test accounts to the public internet.

## GIS map

The map implementation is maintained in `src/features/gis`. Base-map tile usage is subject to the provider's terms, attribution requirements, quota and key restrictions. Configure production tile providers and keys through environment-backed configuration; do not treat public demo endpoints as a production service-level guarantee.

## Data and access model

The intended data model is Supabase/PostGIS with jurisdiction-aware access. The browser is not an authorization boundary: every read/write operation must validate the authenticated session and the user's role/jurisdiction in PostgreSQL or a trusted Edge Function. Review every RPC and table policy before production deployment.

## Release checklist

- [ ] Apply all migrations to a clean staging database and verify migration ordering.
- [ ] Replace all seeded/test passwords and remove test accounts and sample records.
- [ ] Verify RLS and RPC authorization for GIS Admin, SE, EE, AEE, AE, JE and Contractor roles.
- [ ] Verify that import, export, backup and approval operations enforce server-side authorization.
- [ ] Configure production tile provider, attribution and usage limits.
- [ ] Configure HTTPS, security headers, CSP, backups, monitoring and alerting at the hosting layer.
- [ ] Run lint, production build, browser/device tests and database security tests.
- [ ] Perform restore testing for database and uploaded files.

A successful frontend build is not, by itself, a production security certification. Database deployment, provider configuration, operational controls and end-to-end tests are required.


## GIS map usability and dense data

The GIS map now opens in a map-first layout. Use **Map tools** to reveal base-map selection, marker scale, area visibility and layer management; the panel is collapsed by default. The hierarchy selector also starts collapsed and closes after a selection. User scope and inventory details are available under the collapsed **Map context & inventory** section below the map. Dense point layers use screen-space clustering above the DOM marker threshold; selecting a cluster zooms into its location. This is a client-side display optimisation, not a substitute for viewport-bounded server vector tiles for very large datasets.


## Operational workflows and deployment safety

See [Operational Workflows Release](docs/operational-workflows-release.md) before applying migration 011 or deploying the backup Edge Function. The review role matrix must be confirmed against the organisation's delegation-of-authority policy.


GIS Admin-only backup download and additive restore are provided by migration 010 and the `backup-restore` Edge Function. See `SUPABASE_SETUP.md` and `docs/operational-workflows-release.md` before deploying.


Security: apply migrations 001–011 in order. Migration 011 removes unauthenticated user-directory enumeration, adds login throttling, moves browser session storage to sessionStorage, and requires application-encrypted backup objects. Configure server-only `POWERGIS_BACKUP_ENCRYPTION_KEY` and `POWERGIS_ALLOWED_ORIGIN` before enabling backup/restore.


Initial secure provisioning: migration 011 disables known seeded/test credentials. Configure `POWERGIS_BOOTSTRAP_SECRET` only as an Edge Function secret, deploy `bootstrap-admin`, provision the GIS Admin account once from a trusted workstation, then remove/rotate the bootstrap secret. Never place it in a `VITE_` variable or source control.
