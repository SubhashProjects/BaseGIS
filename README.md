# PowerGIS MVP

PowerGIS is a jurisdiction-aware electricity distribution GIS foundation using React + TypeScript + Vite, Supabase/PostGIS and Google XYZ basemap tiles.

## Current embedded simulator

The simulator is part of the main application rather than a separate page. Demo login identities come from the supplied organisation Excel, including the exact JE / User Name and hierarchy values.

Normal demo users are private by design: a JE can see only their assigned simulated assets. GIS Admin is the only demo role with full visibility. Shared-boundary assets can have multiple relevant JE owner ids.

JE demo boundaries are illustrative irregular GeoJSON polygons and are intended to be replaced later with authoritative GIS boundaries. The map already uses the same coordinate/geometry concepts needed for production.

## GIS map

Google XYZ tiles are available as Roadmap, Satellite, Hybrid, Terrain and Roads Only. GIS layers have separate standard colours and line/point rendering.

## Production direction

The production security boundary should be enforced server-side with Supabase/PostGIS RLS and jurisdiction relationships. Client-side filtering in the simulator is only a demonstration of the intended user experience and data model.
