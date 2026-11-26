# GIS map-first layout

- Map tools (base map, layer visibility/management, area names and marker scale) are collapsed by default in a single floating drawer.
- Zoom, fit-to-scope and north-reset remain in a compact always-visible toolbar.
- Hierarchy navigation is collapsed by default and closes after a selection or reset.
- User hierarchy and inventory context is moved below the map into a collapsed disclosure panel, so it no longer consumes a permanent desktop column.
- The map uses the available content width and adapts its height and tool drawer to mobile viewports.

Large-data note: the existing point renderer caps DOM markers and thins points above its safety threshold. This is not true spatial clustering or vector-tile rendering. Production-scale vector tiles require a tile-generation/serving pipeline (for example PostGIS MVT endpoints) and should be deployed with a compatible GIS tile source rather than represented as a front-end-only change.

- A full-screen map action is available in the map control strip. The floating tools and legend remain available while the map is full-screen, and Escape closes the tools drawer.
- Choosing a base map closes the tools drawer immediately to restore the map viewport.
