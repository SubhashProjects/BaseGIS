# BaseGIS UI / UX Hardening

This pass is intentionally **non-functional**. Existing routes, GIS behaviour, data services, view models and business workflows are preserved.

## Completed

- Added the shared application UI stylesheet to the global style pipeline.
- Centralised compact UI tokens for control height, radius, focus state and soft borders.
- Normalised buttons, selects, icon buttons, cards, panels and status elements to the same compact visual language.
- Refined the topbar search field and user controls.
- Improved keyboard focus visibility for interactive controls.
- Tightened table presentation and sticky table headers.
- Kept tables and operational controls square/compact rather than pill-shaped.
- Reduced decorative dashboard motion and card hover movement.
- Reduced dashboard corner radii while preserving the supplied reference UI hierarchy.
- Improved responsive dashboard, topbar and layer-grid behaviour.
- Kept the GIS workspace visually primary.
- Preserved the existing bright theme.

## Validation note

The source was inspected after the refactor. A clean production build could not be completed in the provided environment because the npm dependency cache was incomplete (`yocto-queue` was unavailable for offline installation). No application dependency or feature was intentionally added by this UI-only pass.


## Large-data UI behaviour

The UI keeps the existing bright, compact visual language while avoiding unbounded data work in the browser. Dashboard summaries can be served from server-side aggregates, GIS reads are paged, refreshes are debounced, and large tables should remain bounded rather than rendering an unlimited DOM list.
