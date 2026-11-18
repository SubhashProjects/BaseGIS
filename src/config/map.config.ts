export const MAP_CONFIG = {
  default: { center: { lat: 11.9139, lng: 79.8145 }, zoom: 10 },
  zoom: { min: 3, max: 19 },
  rotation: { sensitivity: 0.4 },
  tileSize: 256,
  layers: {
    roadmap: { label: 'Roadmap', url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}' },
    satellite: { label: 'Satellite', url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' },
    hybrid: { label: 'Hybrid', url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}' },
    terrain: { label: 'Terrain', url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}' },
    roads: { label: 'Roads', url: 'https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}' }
  },
  assetStrokeWidth: { EHV_LINE: 5, HV_LINE: 4, LT_LINE: 3 }
} as const;
export type BaseLayer = keyof typeof MAP_CONFIG.layers;
