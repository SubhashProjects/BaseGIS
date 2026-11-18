# PowerGIS Simulator Data

This directory contains synthetic/demo data only. It is deliberately separated from the production application data and must never be treated as departmental GIS data.

- `users.json`: dummy users derived from the supplied organisation workbook. Names are clearly marked as simulator identities.
- `jurisdictions.geojson`: illustrative synthetic jurisdiction polygons for Pondicherry, Karaikal, Mahe and Yanam. They are not authoritative boundaries.
- `assets.geojson`: synthetic electricity assets placed within/near those illustrative boundaries.

Simulator data is loaded only by `simulator.html` when `VITE_SIMULATOR_ENABLED=true`.
