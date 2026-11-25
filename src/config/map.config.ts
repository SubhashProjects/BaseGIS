const env = import.meta.env;

export const MAP_CONFIG = {
  default: { center: { lat: 11.9139, lng: 79.8145 }, zoom: 10 },
  zoom: { min: 3, max: 19 },
  rotation: { sensitivity: 0.4 },
  tileSize: 256,
  layers: {
    roadmap: { label: 'Roadmap', url: env.VITE_MAP_TILE_ROADMAP || 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}' },
    satellite: { label: 'Satellite', url: env.VITE_MAP_TILE_SATELLITE || 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' },
    hybrid: { label: 'Hybrid', url: env.VITE_MAP_TILE_HYBRID || 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}' },
    terrain: { label: 'Terrain', url: env.VITE_MAP_TILE_TERRAIN || 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}' },
    roads: { label: 'Roads', url: env.VITE_MAP_TILE_ROADS || 'https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}' },
    osm: { label: 'OpenStreetMap', url: env.VITE_MAP_TILE_OSM || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
  },
  assetStrokeWidth: { EHV_LINE: 5, HV_LINE: 4, LT_LINE: 3 },
} as const;
export type BaseLayer = keyof typeof MAP_CONFIG.layers;
