import { useEffect, useMemo, useRef, useState } from 'react';
import { ASSET_COLORS, ASSET_LABELS, MAP_DEFAULT } from '../../config/constants';
import assetsRaw from '../../../data/simulator/assets.geojson';
import jeBoundariesRaw from '../../../data/simulator/je-jurisdictions.geojson';

type BaseLayer = 'roadmap' | 'satellite' | 'hybrid' | 'terrain' | 'roads';
type Point = { lat: number; lng: number };
type Asset = { id: string; assetNo: string; assetType: string; status: string; jurisdictions: string[]; owners: string[]; lat?: number; lng?: number; geometry: any; shared?: boolean };
type Boundary = { id: string; name: string; region: string; subdivision: string | null; division: string | null; circle: string | null; department: string | null; geometry: any };

const TILE_URLS: Record<BaseLayer, string> = {
  satellite: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  hybrid: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  roadmap: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  terrain: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
  roads: 'https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}',
};

const assets: Asset[] = (assetsRaw as any).features.map((f: any): Asset => ({
  id: String(f.properties.id),
  assetNo: String(f.properties.assetNo),
  assetType: String(f.properties.assetType),
  status: String(f.properties.status),
  jurisdictions: (f.properties.jurisdictionIds as string[]) ?? [],
  owners: (f.properties.ownerJeIds as string[]) ?? [],
  lat: f.geometry.type === 'Point' ? f.geometry.coordinates[1] : undefined,
  lng: f.geometry.type === 'Point' ? f.geometry.coordinates[0] : undefined,
  geometry: f.geometry,
  shared: !!f.properties.sharedBoundary,
}));

const boundaries: Boundary[] = (jeBoundariesRaw as any).features.map((f: any): Boundary => ({
  id: String(f.properties.id),
  name: String(f.properties.name),
  region: String(f.properties.region),
  subdivision: f.properties.subdivision,
  division: f.properties.division,
  circle: f.properties.circle,
  department: f.properties.department,
  geometry: f.geometry,
}));

const tileSize = 256;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const latToY = (lat: number, z: number) => {
  const s = Math.sin(clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180);
  return (.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};
const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const xToLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const yToLat = (y: number, z: number) => {
  const n = Math.PI - 2 * Math.PI * y / 2 ** z;
  return 180 / Math.PI * Math.atan(Math.sinh(n));
};
const pos = (p: Point, c: Point, z: number, w: number, h: number) => {
  const wx = lngToX(p.lng, z) * tileSize;
  const wy = latToY(p.lat, z) * tileSize;
  const cx = lngToX(c.lng, z) * tileSize;
  const cy = latToY(c.lat, z) * tileSize;
  return { left: w / 2 + wx - cx, top: h / 2 + wy - cy };
};
const geometryPoints = (geometry: any): Point[] =>
  geometry.type === 'Point'
    ? [{ lng: geometry.coordinates[0], lat: geometry.coordinates[1] }]
    : geometry.coordinates[0].map((c: number[]) => ({ lng: c[0], lat: c[1] }));

export function XyzTileMap({ currentUser }: { currentUser: any }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState<Point>(MAP_DEFAULT.center);
  const [zoom, setZoom] = useState(10);
  const [layer, setLayer] = useState<BaseLayer>('roadmap');
  const [drag, setDrag] = useState<any>(null);
  const [size, setSize] = useState({ width: 1000, height: 650 });
  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(ASSET_LABELS).map(k => [k, true]))
  );
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const isAdmin = currentUser.role === 'GIS_ADMIN';
  const visibleBoundaries = useMemo(
    () => (isAdmin ? boundaries : boundaries.filter((b: Boundary) => b.id === currentUser.id)),
    [currentUser.id, isAdmin]
  );
  const visibleAssets = useMemo(
    () => assets.filter((a: Asset) => (isAdmin || a.owners.includes(currentUser.id)) && visibleTypes[a.assetType]),
    [currentUser.id, isAdmin, visibleTypes]
  );

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const o = new ResizeObserver(() => setSize({ width: node.clientWidth, height: node.clientHeight }));
    o.observe(node);
    setSize({ width: node.clientWidth, height: node.clientHeight });
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    if (isAdmin) return;
    const b = boundaries.find((x: Boundary) => x.id === currentUser.id);
    if (!b) return;
    const pts = geometryPoints(b.geometry);
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    setCenter({ lat, lng });
    setZoom(12);
  }, [currentUser.id, isAdmin]);

  const tiles = useMemo(() => {
    const cx = lngToX(center.lng, zoom) * tileSize;
    const cy = latToY(center.lat, zoom) * tileSize;
    const minX = Math.floor((cx - size.width / 2) / tileSize) - 1;
    const maxX = Math.floor((cx + size.width / 2) / tileSize) + 1;
    const minY = Math.floor((cy - size.height / 2) / tileSize) - 1;
    const maxY = Math.floor((cy + size.height / 2) / tileSize) + 1;
    const n = 2 ** zoom;
    const out: any[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= n) continue;
        const wx = ((x % n) + n) % n;
        out.push({
          x: wx,
          y,
          left: x * tileSize - (cx - size.width / 2),
          top: y * tileSize - (cy - size.height / 2),
          url: TILE_URLS[layer].replace('{x}', String(wx)).replace('{y}', String(y)).replace('{z}', String(zoom)),
        });
      }
    }
    return out;
  }, [center, zoom, layer, size]);

  const panTo = (dx: number, dy: number) => {
    const cx = lngToX(center.lng, zoom) * tileSize - dx;
    const cy = latToY(center.lat, zoom) * tileSize - dy;
    setCenter({ lat: yToLat(cy / tileSize, zoom), lng: xToLng(cx / tileSize, zoom) });
  };

  const reset = () => {
    if (!isAdmin) {
      const b = boundaries.find((x: Boundary) => x.id === currentUser.id);
      if (b) {
        const pts = geometryPoints(b.geometry);
        setCenter({
          lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
          lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
        });
        setZoom(12);
        return;
      }
    }
    setCenter(MAP_DEFAULT.center);
    setZoom(10);
  };

  return (
    <div
      className="xyz-map"
      ref={mapRef}
      onPointerDown={e => {
        if (e.button !== 0) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag({ x: e.clientX, y: e.clientY });
      }}
      onPointerMove={e => {
        if (!drag) return;
        panTo(e.clientX - drag.x, e.clientY - drag.y);
        setDrag({ x: e.clientX, y: e.clientY });
      }}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      <div className="xyz-tiles">
        {tiles.map(t => (
          <img
            key={`${t.x}-${t.y}-${zoom}`}
            src={t.url}
            alt="Google map tile"
            draggable={false}
            style={{ left: t.left, top: t.top }}
          />
        ))}
      </div>
      <svg className="xyz-svg" width={size.width} height={size.height} aria-hidden="true">
        {visibleBoundaries.map((b: Boundary) => {
          const pts = geometryPoints(b.geometry).map(p => pos(p, center, zoom, size.width, size.height));
          return <polygon key={b.id} points={pts.map(p => `${p.left},${p.top}`).join(' ')} className="je-polygon" />;
        })}
        {visibleAssets
          .filter((a: Asset) => a.geometry.type !== 'Point')
          .map((a: Asset) => {
            const pts = geometryPoints(a.geometry).map(p => pos(p, center, zoom, size.width, size.height));
            return (
              <polyline
                key={a.id}
                points={pts.map(p => `${p.left},${p.top}`).join(' ')}
                fill="none"
                stroke={ASSET_COLORS[a.assetType]}
                strokeWidth={a.assetType === 'EHV_LINE' ? 5 : a.assetType === 'HV_LINE' ? 4 : 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity=".9"
                onClick={() => setSelectedAsset(a)}
              />
            );
          })}
      </svg>
      <div className="xyz-overlay">
        {visibleBoundaries.map((b: Boundary) => {
          const pts = geometryPoints(b.geometry);
          const c = pts.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
          const centerPt = { lat: c.lat / pts.length, lng: c.lng / pts.length };
          const p = pos(centerPt, center, zoom, size.width, size.height);
          return (
            <div key={b.id} className="je-label" style={{ left: p.left, top: p.top }}>
              {b.name}
            </div>
          );
        })}
        {visibleAssets
          .filter((a: Asset) => a.geometry.type === 'Point')
          .map((a: Asset) => {
            const p = pos({ lat: a.lat!, lng: a.lng! }, center, zoom, size.width, size.height);
            return (
              <button
                key={a.id}
                className={`asset-marker ${a.assetType.toLowerCase()} ${selectedAsset?.id === a.id ? 'selected' : ''}`}
                style={{ left: p.left - 7, top: p.top - 7, background: ASSET_COLORS[a.assetType] }}
                title={`${a.assetNo} • ${ASSET_LABELS[a.assetType] ?? a.assetType}${a.shared ? ' • Shared boundary' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  setSelectedAsset(a);
                }}
              />
            );
          })}
      </div>
      <div className="xyz-controls" onPointerDown={e => e.stopPropagation()}>
        <button onClick={() => setZoom(z => clamp(z + 1, 4, 19))}>+</button>
        <button onClick={() => setZoom(z => clamp(z - 1, 4, 19))}>−</button>
        <button onClick={reset}>⌂</button>
      </div>
      <div className="xyz-layer">
        <label>
          Base map
          <select value={layer} onChange={e => setLayer(e.target.value as BaseLayer)}>
            <option value="roadmap">Google Roadmap</option>
            <option value="satellite">Google Satellite</option>
            <option value="hybrid">Google Hybrid</option>
            <option value="terrain">Google Terrain</option>
            <option value="roads">Google Roads Only</option>
          </select>
        </label>
      </div>
      <div className="xyz-layer-list">
        <b>GIS layers</b>
        {Object.entries(ASSET_LABELS).map(([k, v]) => (
          <label key={k}>
            <input
              type="checkbox"
              checked={visibleTypes[k]}
              onChange={e => setVisibleTypes(prev => ({ ...prev, [k]: e.target.checked }))}
            />
            <i style={{ background: ASSET_COLORS[k] }} />
            <span>{v}</span>
          </label>
        ))}
      </div>
      {selectedAsset && (
        <div className="asset-detail" onPointerDown={e => e.stopPropagation()}>
          <div className="asset-detail-head">
            <div>
              <span className="asset-kicker">{ASSET_LABELS[selectedAsset.assetType] ?? selectedAsset.assetType}</span>
              <b>{selectedAsset.assetNo}</b>
            </div>
            <button onClick={() => setSelectedAsset(null)}>×</button>
          </div>
          <div className="asset-detail-grid">
            <span>Status</span>
            <b>{selectedAsset.status}</b>
            <span>Visibility</span>
            <b>{selectedAsset.shared ? 'Shared jurisdiction' : 'Private to assigned JE'}</b>
            <span>Jurisdiction</span>
            <b>{selectedAsset.jurisdictions.join(', ')}</b>
          </div>
        </div>
      )}
      <div className="xyz-legend">
        {Object.entries(ASSET_LABELS).map(([k, v]) => (
          <span key={k}>
            <i style={{ background: ASSET_COLORS[k] }} />
            {v}
          </span>
        ))}
      </div>
      <div className="xyz-disclaimer">
        SIMULATOR DATA ONLY •{' '}
        {isAdmin
          ? 'GIS ADMIN FULL VISIBILITY'
          : `PRIVATE VIEW • ONLY ${currentUser.displayName} / AUTHORIZED JURISDICTION DATA`}{' '}
        • JE boundary is illustrative demo geometry.
      </div>
    </div>
  );
}
