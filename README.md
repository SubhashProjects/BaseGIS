# PowerGIS

PowerGIS is a jurisdiction-aware electricity distribution GIS using React + TypeScript + Vite, Supabase/PostGIS and Google XYZ basemap tiles.

## Supabase data source

The application no longer contains a local dataset or toggle. Organisation identities, JE jurisdiction boundaries and GIS assets are stored in Supabase/PostGIS.

Run the migrations in `supabase/migrations` in order. Migration `002_powergis_test_data.sql` imports the supplied organisation identities, 41 JE jurisdiction geometries and the complete test GIS asset dataset.

The frontend reads authorised users, assets and boundaries through Supabase RPC functions. Normal users receive only the GIS data allowed by their hierarchy; GIS Admin receives the full dataset.

## GIS map

Google XYZ tiles are available as Roadmap, Satellite, Hybrid, Terrain and Roads Only. Wheel zoom, double-click zoom, drag pan and mouse rotation are supported. Use **Shift + left-drag** or **right-drag** to rotate; click **N** to reset north.

GIS layers use separate standard colours and line/point rendering. Hovering an asset shows a tooltip and clicking it opens the asset details.

## Production direction

The test directory is deliberately stored in Supabase so the application architecture is already database-first. For production, replace the test login directory with Supabase Auth-backed `profiles` and keep the same PostGIS jurisdiction model and server-side authorization approach.


## Test login
The current build uses Supabase database-backed test identities rather than Supabase Auth. Select an organisation user and sign in with username = password. Production authentication can be introduced later without changing the GIS hierarchy model.
