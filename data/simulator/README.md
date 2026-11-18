# PowerGIS embedded simulator

This simulator is embedded in the normal PowerGIS application. It does not open a separate simulator page.

## Demo identity

The demo login uses the exact JE / User Name identities and hierarchy values supplied in the organisation Excel. The simulator users are marked `simulatorOnly: true`.

## Privacy model

- GIS Admin can view all simulator data.
- A normal JE can view only assets whose `ownerJeIds` contains that JE's simulator user id.
- The shared-boundary demonstration asset has two owner JE ids, so it is visible to both relevant demo users and to no unrelated JE.
- Assets, approvals, dashboard counts and map features all use the same visibility rule.
- The simulator must not be treated as production authentication or production security; production enforcement belongs in Supabase/PostGIS RLS.

## JE boundaries

`je-jurisdictions.geojson` contains one illustrative irregular polygon per JE. These are demo geometries designed to be replaced later by authoritative PostGIS/GeoJSON boundaries.

## GIS layers

Each layer has a dedicated standard colour:

- Substations: purple
- EHV Lines: red
- HT Lines: amber/orange
- Power / Distribution Transformers: blue
- LT Lines: green
- Poles: slate/grey
- Smart Meters: cyan

Line layers are rendered as lines, while point assets use layer-specific point symbols.

## Google XYZ basemaps

- Roadmap: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`
- Satellite: `https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`
- Hybrid: `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}`
- Terrain: `https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}`
- Roads Only: `https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}`
