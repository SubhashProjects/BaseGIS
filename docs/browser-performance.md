# Browser responsiveness and rendering safeguards

This pass focuses on keeping the browser responsive while the GIS workspace is being used.

## Implemented

- Route-level lazy loading: login, dashboard, GIS, assets, approvals, admin and data-management code are split into independently loaded modules. The browser does not need to download and parse every screen before showing the first screen.
- GIS pointer input is coalesced to one animation-frame update. High-frequency pointer events no longer force a React render for every raw mouse/touch event.
- Parsed GeoJSON coordinate arrays are cached by geometry object, avoiding repeated coordinate-object allocation during pan, zoom and redraw.
- GIS tile images decode asynchronously and the map/content surfaces use rendering containment to reduce unrelated layout/paint work.
- Reduced-motion preferences are respected.

## Operational notes

These changes improve perceived loading and interaction smoothness; they do not make an unbounded dataset safe to render in the browser. Keep list views paginated and avoid downloading full geometry collections for overview screens. For very large GIS inventories, the next architectural step is server-generated, viewport-bounded vector tiles or clustered points, with generalised geometry at low zoom and feature detail fetched only when selected.

For production, serve static assets and map tiles through a CDN, enable Brotli/gzip, use immutable hashed asset caching, and monitor Core Web Vitals (LCP, INP, CLS), browser memory, API latency and Postgres query latency. Establish performance budgets and test with realistic datasets and concurrent sessions. A smooth experience cannot be guaranteed without measuring the actual hosting, database, tile provider, devices and network conditions.

## Additional safeguards in the GIS enhancement pass

- Overlapping GIS refreshes now use a monotonically increasing request token. A slower response from an earlier refresh or user context is ignored rather than overwriting newer data. The request is not forcibly cancelled at the transport layer because the current Supabase RPC wrapper does not expose a shared AbortSignal contract.
- Asset-page fallback reads now apply the same local deletion/override filter as the primary paginated path. This also fixes a stale helper reference in the fallback branch.
- Full-screen map mode is available from the compact map control strip; the floating tools, map controls, legend and help remain positioned within the full-screen map. Escape closes the open map-tools drawer and clears the selected feature.
- Selecting a base map automatically closes the tools drawer to return map space to the user.

## Verification boundary

The source files touched in this pass passed TypeScript transpilation syntax checks. A full project type-check/build could not be completed because the supplied `node_modules` tree is incomplete; dependency installation did not complete in the execution environment. Run `npm ci`, `npm run build` and `npm run lint` in a network-enabled development environment before deployment.
