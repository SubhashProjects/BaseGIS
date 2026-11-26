# PowerGIS UI Refactor

This revision keeps the existing BaseGIS feature structure and data/map logic, while applying the supplied reference UI language to the application shell and dashboard.

## Visual changes
- Professional bright-only application shell with clearer navigation hierarchy.
- Compact top bar with workspace context, search field, notification affordance and user identity.
- Consistent PowerGIS blue/teal/amber semantic palette.
- Reusable SVG icon system from the supplied reference UI.
- Refined dashboard with KPI cards, asset composition donut, lifecycle bars and network-layer inventory.
- Responsive desktop/tablet/mobile layout improvements.
- Square controls and data-oriented surfaces for a utility/GIS workflow.
- GIS map remains the primary visual workspace; existing map tools and layer logic are preserved.

## CSS structure
- `src/styles/tokens.css` — shared design tokens.
- `src/styles/global.css` — existing application/component styles plus final shell overrides.
- `src/styles/dashboard.css` — dashboard-specific visual system extracted from the reference UI.

## Refactoring principle
Existing routes, feature modules, services, view models and GIS/data-management behaviour are retained. The refactor focuses on presentation, navigation clarity, responsive behaviour and reusable styling rather than replacing working modules with mock screens.
