# PowerGIS MVP

A professional electricity-department GIS starter for Pondicherry, Karaikal, Mahe and Yanam using React + TypeScript + Supabase/PostGIS, designed for GitHub Pages deployment.

## Included
- GIS master-map shell with Google Maps base-map selector.
- Asset layers for substations, EHV/HV/LT lines, distribution transformers, poles and smart meters.
- MVVM-style separation: views/components → viewmodels → services → Supabase.
- Central common configuration for labels, routes, asset types and roles.
- Role model: GIS_ADMIN, AE, JE, CONTRACTOR.
- Contractor → JE → AE approval workflow.
- Jurisdiction-aware security using Supabase RLS + PostGIS.
- **Shared-boundary visibility:** `asset_jurisdictions` is many-to-many. An asset intersecting two authorized boundaries is linked to both, so members of both jurisdictions can see it.
- Supplied organisation workbook converted to `data/organisation-seed.json` without inventing missing hierarchy values.
- Audit-log, import/export and backup architecture placeholders.

## Run
1. Copy `.env.example` to `.env.local`.
2. Set Supabase URL + anon key + Google Maps browser key.
3. `npm install`
4. `npm run dev`

## Supabase
Create a Supabase project, enable PostGIS if required by the project UI, then run `supabase/migrations/001_powergis_core.sql` in the SQL editor or through Supabase CLI migrations.

Official boundary polygons should be imported into `jurisdictions.boundary` before enabling production asset mapping.

## GitHub Pages
The Vite base is `./`, so the generated static site can be published by GitHub Actions. Add repository secrets/environment variables for the three VITE_* values. Never commit a service-role key.

## Important security rule
The frontend must never be the authority for jurisdiction visibility. RLS and database functions enforce access. The UI only mirrors those permissions.

## Isolated simulator

The project includes a separate `simulator.html` entry point. It is deliberately outside the main application route tree and uses only synthetic data under `data/simulator/`.

Enable/disable at build time with `VITE_SIMULATOR_ENABLED=true|false`. The simulator displays a permanent `SIMULATOR DATA ONLY` / `DEMO` warning, dummy identities derived from the supplied organisation workbook, illustrative boundaries for Pondicherry/Karaikal/Mahe/Yanam, and synthetic electricity assets. It includes a shared-boundary example where one synthetic asset belongs to two jurisdictions and is therefore visible to authorized members of both.

The simulator is not connected to Supabase production tables and must not be used for operational records.

### Simulator data files

- `data/simulator/users.json` — 41 JE identities from the supplied workbook plus simulator-only hierarchy and contractor identities.
- `data/simulator/jurisdictions.geojson` — four illustrative region polygons.
- `data/simulator/assets.geojson` — synthetic substations, lines, transformers, poles and smart meters, including a deliberately shared asset assigned to both Pondicherry and Karaikal.
