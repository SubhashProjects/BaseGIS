import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Pencil, Trash2, RotateCcw, FileUp, LayerIconGlyph } from '../../components/icons';
import { MAP_DEFAULT } from '../../config/constants';
import {
  useGisLayers,
  PRESET_LAYER_COLORS,
  PRESET_LAYER_ICONS,
  filenameToLayerInfo,
  type LayerIconKey,
} from '../../services/layerService';
import { parseImportFile, importAssets, supportedImportAccept } from '../../services/dataManagementService';
import type { MapNavigationTarget } from './MapHierarchyNavigator';
import type { PowerGISAsset, PowerGISBoundary, PowerGISUser } from '../../services/powergisData';

type BaseLayer = 'roadmap' | 'satellite' | 'hybrid' | 'terrain' | 'roads';
type Point = { lat: number; lng: number };

const TILE_URLS: Record<BaseLayer, string> = {
  satellite: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  hybrid: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  roadmap: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  terrain: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
  roads: 'https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}',
};

const tileSize = 256;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const latToY = (lat: number, z: number) => {
  const s = Math.sin(clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z;
};

const lngToX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const xToLng = (x: number, z: number) => (x / 2 ** z) * 360 - 180;

const yToLat = (y: number, z: number) => {
  const n = Math.PI - 2 * Math.PI * y / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};

const geometryPoints = (g: any): Point[] =>
  g.type === 'Point'
    ? [{ lng: g.coordinates[0], lat: g.coordinates[1] }]
    : g.type === 'LineString'
    ? g.coordinates.map((c: number[]) => ({ lng: c[0], lat: c[1] }))
    : g.coordinates[0].map((c: number[]) => ({ lng: c[0], lat: c[1] }));

const pos = (p: Point, c: Point, z: number, w: number, h: number) => {
  const wx = lngToX(p.lng, z) * tileSize;
  const wy = latToY(p.lat, z) * tileSize;
  const cx = lngToX(c.lng, z) * tileSize;
  const cy = latToY(c.lat, z) * tileSize;
  return { left: w / 2 + wx - cx, top: h / 2 + wy - cy };
};

export function XyzTileMap({
  currentUser,
  assets,
  boundaries,
  navigationTarget,
}: {
  currentUser: PowerGISUser;
  assets: PowerGISAsset[];
  boundaries: PowerGISBoundary[];
  navigationTarget?: MapNavigationTarget | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState<Point>(MAP_DEFAULT.center);
  const [zoom, setZoom] = useState(10);
  const [bearing, setBearing] = useState(0);
  const [layer, setLayer] = useState<BaseLayer>('roadmap');
  const [isDragging, setIsDragging] = useState(false);
  const [size, setSize] = useState({ width: 1000, height: 650 });
  const {
    layers,
    layerLabels,
    layerColors,
    layerIcons,
    addLayer,
    ensureLayer,
    editLayer,
    deleteLayer,
    deleteAllLayers,
    resetLayers,
  } = useGisLayers();

  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(layers.map((l) => [l.id, true]))
  );

  const [showAreaNames, setShowAreaNames] = useState<boolean>(true);
  const [visibleAreas, setVisibleAreas] = useState<Record<string, boolean>>({});
  const [showAreaSublist, setShowAreaSublist] = useState<boolean>(false);

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('');
  const [editIcon, setEditIcon] = useState<LayerIconKey>('circle');
  const [showAddBox, setShowAddBox] = useState<boolean>(false);
  const [newLabel, setNewLabel] = useState<string>('');
  const [newColor, setNewColor] = useState<string>(PRESET_LAYER_COLORS[0]);
  const [newIcon, setNewIcon] = useState<LayerIconKey>('circle');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateOrImport = async () => {
    const label = newLabel.trim();
    if (!label) return;
    try {
      setIsImporting(true);
      if (attachedFile) {
        const layer = ensureLayer(label, newColor, undefined, newIcon);
        const features = await parseImportFile(attachedFile, layer.id);
        if (features.length > 0) {
          await importAssets(features);
        }
      } else {
        addLayer(label, newColor, undefined, newIcon);
      }
      setNewLabel('');
      setAttachedFile(null);
      setShowAddBox(false);
    } catch (err: any) {
      alert(`Import error: ${err?.message || 'Failed to import file'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const activeLayerIds = useMemo(() => new Set(layers.map((l) => l.id)), [layers]);
  const [selectedAsset, setSelectedAsset] = useState<PowerGISAsset | null>(null);
  const [hover, setHover] = useState<{ asset: PowerGISAsset; x: number; y: number } | null>(null);
  const baseMapSelectRef = useRef<HTMLSelectElement>(null);

  const handleBaseMapClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.target !== baseMapSelectRef.current) {
      try {
        baseMapSelectRef.current?.showPicker();
      } catch {
        baseMapSelectRef.current?.focus();
      }
    }
  };

  // Synchronization refs to eliminate stale-closure bugs during fast wheel/drag gestures
  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const bearingRef = useRef(bearing);
  const dragRef = useRef<{
    lastX: number;
    lastY: number;
    mode: 'pan' | 'rotate';
  } | null>(null);
  const wheelAccRef = useRef(0);
  const lastWheelTimeRef = useRef(0);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    bearingRef.current = bearing;
  }, [bearing]);

  useEffect(() => {
    const handleGlobalUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        setIsDragging(false);
      }
    };
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('pointercancel', handleGlobalUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
    };
  }, []);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const o = new ResizeObserver(() => setSize({ width: node.clientWidth, height: node.clientHeight }));
    o.observe(node);
    setSize({ width: node.clientWidth, height: node.clientHeight });
    return () => o.disconnect();
  }, []);

  const panBy = (dx: number, dy: number) => {
    const b = bearingRef.current;
    const rad = (b * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Transform screen displacement into container coordinates accounting for rotation
    const cdx = dx * cos + dy * sin;
    const cdy = -dx * sin + dy * cos;

    const z = zoomRef.current;
    const c = centerRef.current;
    const cx = lngToX(c.lng, z) * tileSize - cdx;
    const cy = latToY(c.lat, z) * tileSize - cdy;

    const nextCenter = {
      lng: xToLng(cx / tileSize, z),
      lat: clamp(yToLat(cy / tileSize, z), -85.05112878, 85.05112878),
    };
    centerRef.current = nextCenter;
    setCenter(nextCenter);
  };

  const zoomAt = (next: number, clientX?: number, clientY?: number) => {
    const targetZoom = clamp(Math.round(next), 3, 19);
    const curZoom = zoomRef.current;
    if (targetZoom === curZoom) return;

    const curCenter = centerRef.current;
    const b = bearingRef.current;
    const rect = mapRef.current?.getBoundingClientRect();

    const s = 2 ** (targetZoom - curZoom);
    const cx = lngToX(curCenter.lng, curZoom) * tileSize;
    const cy = latToY(curCenter.lat, curZoom) * tileSize;

    let ux = 0;
    let uy = 0;

    // Anchor to cursor only when zooming IN with mouse coordinates
    // When zooming OUT (wheel reverse), anchor to viewport center (ux=0, uy=0)
    if (targetZoom > curZoom && clientX !== undefined && clientY !== undefined && rect) {
      const ox = clientX - (rect.left + rect.width / 2);
      const oy = clientY - (rect.top + rect.height / 2);
      const rad = (b * Math.PI) / 180;
      ux = ox * Math.cos(rad) + oy * Math.sin(rad);
      uy = -ox * Math.sin(rad) + oy * Math.cos(rad);
    }

    const newCx = cx * s + ux * (s - 1);
    const newCy = cy * s + uy * (s - 1);

    const nextCenter = {
      lng: xToLng(newCx / tileSize, targetZoom),
      lat: clamp(yToLat(newCy / tileSize, targetZoom), -85.05112878, 85.05112878),
    };

    zoomRef.current = targetZoom;
    centerRef.current = nextCenter;
    setZoom(targetZoom);
    setCenter(nextCenter);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key.toLowerCase() === 'n') {
        bearingRef.current = 0;
        setBearing(0);
      } else if (e.key === 'ArrowUp') {
        panBy(0, 40);
      } else if (e.key === 'ArrowDown') {
        panBy(0, -40);
      } else if (e.key === 'ArrowLeft') {
        panBy(40, 0);
      } else if (e.key === 'ArrowRight') {
        panBy(-40, 0);
      } else if (e.key === '+' || e.key === '=') {
        zoomAt(zoomRef.current + 1);
      } else if (e.key === '-' || e.key === '_') {
        zoomAt(zoomRef.current - 1);
      } else if (e.key === 'Escape') {
        setSelectedAsset(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!boundaries.length) return;
    const pts = boundaries.flatMap((b) => geometryPoints(b.geometry));
    if (!pts.length) return;
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    const initCenter = { lat, lng };
    const initZoom = currentUser.role === 'GIS_ADMIN' ? 10 : currentUser.role === 'JE' ? 14 : 11;
    centerRef.current = initCenter;
    zoomRef.current = initZoom;
    bearingRef.current = 0;
    setCenter(initCenter);
    setZoom(initZoom);
    setBearing(0);
  }, [currentUser.id, currentUser.role, boundaries]);

  useEffect(() => {
    if (!navigationTarget) return;
    const target = boundaries.filter((b) => navigationTarget.boundaryIds.includes(b.id));
    if (!target.length) return;
    const pts = target.flatMap((b) => geometryPoints(b.geometry));
    if (!pts.length) return;
    const z =
      navigationTarget.level === 'je'
        ? 14
        : navigationTarget.level === 'subdivision'
        ? 13
        : navigationTarget.level === 'division'
        ? 11
        : 10;
    const nextCenter = {
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
    };
    centerRef.current = nextCenter;
    zoomRef.current = z;
    bearingRef.current = 0;
    setCenter(nextCenter);
    setZoom(z);
    setBearing(0);
  }, [navigationTarget, boundaries]);

  const tiles = useMemo(() => {
    const cx = lngToX(center.lng, zoom) * tileSize;
    const cy = latToY(center.lat, zoom) * tileSize;
    // Diagonal extent provides 100% tile coverage at all rotation angles without needing artificial scale
    const diag = Math.ceil(Math.hypot(size.width, size.height) / 2);
    const minX = Math.floor((cx - diag) / tileSize) - 1;
    const maxX = Math.floor((cx + diag) / tileSize) + 1;
    const minY = Math.floor((cy - diag) / tileSize) - 1;
    const maxY = Math.floor((cy + diag) / tileSize) + 1;
    const n = 2 ** zoom;
    const out: { x: number; y: number; left: number; top: number; url: string }[] = [];
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
  }, [center.lat, center.lng, zoom, layer, size.width, size.height]);

  const reset = () => {
    if (boundaries.length) {
      const pts = boundaries.flatMap((b) => geometryPoints(b.geometry));
      if (!pts.length) return;
      const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
      const nextCenter = { lat, lng };
      const nextZoom = currentUser.role === 'GIS_ADMIN' ? 10 : currentUser.role === 'JE' ? 14 : 11;
      centerRef.current = nextCenter;
      zoomRef.current = nextZoom;
      bearingRef.current = 0;
      setCenter(nextCenter);
      setZoom(nextZoom);
      setBearing(0);
    }
  };

  const contentTransform = bearing !== 0 ? `rotate(${bearing}deg)` : undefined;

  return (
    <div
      className={`xyz-map ${isDragging ? 'dragging' : ''}`}
      ref={mapRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 2) return;
        const target = e.target as HTMLElement;
        if (target.closest('.xyz-controls, .xyz-map-left-panel, .xyz-layer, .xyz-layer-list, .asset-detail, button, select, input, label')) {
          return;
        }
        const mode = e.button === 2 || e.shiftKey ? 'rotate' : 'pan';
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        dragRef.current = {
          lastX: e.clientX,
          lastY: e.clientY,
          mode,
        };
        setIsDragging(true);
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        if (dx === 0 && dy === 0) return;

        // Synchronously update coordinates to prevent accumulating lag
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;

        if (drag.mode === 'rotate') {
          const nextBearing = Math.round((bearingRef.current + dx * 0.4) % 360 + 360) % 360;
          bearingRef.current = nextBearing;
          setBearing(nextBearing);
        } else {
          panBy(dx, dy);
        }
      }}
      onPointerUp={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        dragRef.current = null;
        setIsDragging(false);
      }}
      onPointerCancel={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        dragRef.current = null;
        setIsDragging(false);
      }}
      onLostPointerCapture={() => {
        dragRef.current = null;
        setIsDragging(false);
      }}
      onWheel={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.xyz-controls, .xyz-map-left-panel, .xyz-layer, .xyz-layer-list, .asset-detail, button, select, input, label')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        wheelAccRef.current += e.deltaY;
        const threshold = 50;
        if (
          Math.abs(wheelAccRef.current) >= threshold ||
          (now - lastWheelTimeRef.current > 100 && Math.abs(wheelAccRef.current) > 15)
        ) {
          const direction = wheelAccRef.current < 0 ? 1 : -1;
          wheelAccRef.current = 0;
          lastWheelTimeRef.current = now;
          zoomAt(zoomRef.current + direction, e.clientX, e.clientY);
        }
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.xyz-controls, .xyz-map-left-panel, .xyz-layer, .xyz-layer-list, .asset-detail, button, select, input, label')) {
          return;
        }
        e.preventDefault();
        zoomAt(zoomRef.current + 1, e.clientX, e.clientY);
      }}
    >
      <div className="xyz-content" style={{ transform: contentTransform }}>
        <div className="xyz-tiles">
          {tiles.map((t) => (
            <img
              key={`${t.x}-${t.y}-${zoom}`}
              src={t.url}
              alt=""
              draggable={false}
              style={{ left: t.left, top: t.top }}
            />
          ))}
        </div>
        <svg className="xyz-svg" width={size.width} height={size.height} aria-hidden="true">
          {boundaries
            .filter((b) => showAreaNames && visibleAreas[b.id] !== false)
            .map((b) => {
              const pts = geometryPoints(b.geometry).map((p) => pos(p, center, zoom, size.width, size.height));
              return <polygon key={b.id} points={pts.map((p) => `${p.left},${p.top}`).join(' ')} className="je-polygon" />;
            })}
          {assets
            .filter((a) => a.geometry.type !== 'Point' && activeLayerIds.has(a.assetType) && visibleTypes[a.assetType] !== false)
            .map((a) => {
              const pts = geometryPoints(a.geometry).map((p) => pos(p, center, zoom, size.width, size.height));
              return (
                <polyline
                  key={a.id}
                  points={pts.map((p) => `${p.left},${p.top}`).join(' ')}
                  fill="none"
                  stroke={layerColors[a.assetType] || '#2563EB'}
                  strokeWidth={a.assetType === 'EHV_LINE' ? 5 : a.assetType === 'HV_LINE' ? 4 : 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity=".9"
                  onMouseEnter={(e) => setHover({ asset: a, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelectedAsset(a)}
                />
              );
            })}
        </svg>
        <div className="xyz-overlay">
          {boundaries
            .filter((b) => showAreaNames && visibleAreas[b.id] !== false)
            .map((b) => {
              const pts = geometryPoints(b.geometry);
              const c = pts.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
              const cp = { lat: c.lat / pts.length, lng: c.lng / pts.length };
              const p = pos(cp, center, zoom, size.width, size.height);
              return (
                <div key={b.id} className="je-label" style={{ left: p.left, top: p.top }}>
                  {b.name.replace(/^JE-/, '')}
                </div>
              );
            })}
          {assets
            .filter((a) => a.geometry.type === 'Point' && activeLayerIds.has(a.assetType) && visibleTypes[a.assetType] !== false)
            .map((a) => {
              const p = pos({ lat: a.lat!, lng: a.lng! }, center, zoom, size.width, size.height);
              const layerIcon = layerIcons[a.assetType] || 'circle';
              const layerColor = layerColors[a.assetType] || '#2563EB';
              return (
                <button
                  key={a.id}
                  aria-label={a.assetNo}
                  className={`asset-marker ${a.assetType.toLowerCase()} ${selectedAsset?.id === a.id ? 'selected' : ''}`}
                  style={{ left: p.left - 9, top: p.top - 9, background: layerColor }}
                  onMouseEnter={(e) => setHover({ asset: a, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAsset(a);
                  }}
                >
                  <LayerIconGlyph icon={layerIcon} size={11} color="#ffffff" strokeWidth={2.5} />
                </button>
              );
            })}
        </div>
      </div>
      <div className="xyz-controls" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <button title="Zoom in" onClick={() => zoomAt(zoomRef.current + 1)}>
          +
        </button>
        <button title="Zoom out" onClick={() => zoomAt(zoomRef.current - 1)}>
          −
        </button>
        <button title="Fit area" onClick={reset}>
          ⌂
        </button>
        <button
          title="Reset north"
          onClick={() => {
            bearingRef.current = 0;
            setBearing(0);
          }}
        >
          N
        </button>
        <span className="zoom-readout">
          z{zoom} • {Math.round((bearing % 360 + 360) % 360)}°
        </span>
      </div>
      <div
        className="xyz-map-left-panel"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          className="xyz-layer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleBaseMapClick}
        >
          <span className="xyz-layer-title">Base map</span>
          <div className="xyz-base-select-wrap">
            <select
              ref={baseMapSelectRef}
              value={layer}
              onChange={(e) => setLayer(e.target.value as BaseLayer)}
            >
              <option value="roadmap">Roadmap</option>
              <option value="satellite">Satellite</option>
              <option value="hybrid">Hybrid</option>
              <option value="terrain">Terrain</option>
              <option value="roads">Roads</option>
            </select>
            <ChevronDown size={14} className="xyz-base-chevron" />
          </div>
        </div>
        <div
          className="xyz-layer-list"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="xyz-layer-header">
            <b>GIS layers</b>
            <div className="xyz-layer-header-actions">
              <button
                type="button"
                className="layer-tool-btn"
                title="Add new GIS layer"
                onClick={() => {
                  setShowAddBox((prev) => !prev);
                  setEditingLayerId(null);
                  setNewLabel('');
                  setNewColor(PRESET_LAYER_COLORS[layers.length % PRESET_LAYER_COLORS.length]);
                  setNewIcon('circle');
                }}
              >
                <Plus size={11} />
                <span>Add</span>
              </button>
              <button
                type="button"
                className="layer-tool-btn danger"
                title={layers.length > 0 ? 'Delete all GIS layers' : 'No layers to delete'}
                disabled={layers.length === 0}
                onClick={() => {
                  if (layers.length > 0 && window.confirm('Delete all GIS layers? All layer lines and markers will be cleared.')) {
                    deleteAllLayers();
                  }
                }}
              >
                <Trash2 size={11} />
                <span>Delete</span>
              </button>
              <button
                type="button"
                className="layer-tool-btn reset"
                title="Refresh & reset all layers to defaults"
                onClick={() => {
                  if (window.confirm('Refresh and restore all layers to default configuration?')) {
                    resetLayers();
                  }
                }}
              >
                <RotateCcw size={11} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="area-names-section">
            <div className="area-names-header-row">
              <label
                className="layer-item-main"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={showAreaNames}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowAreaNames(checked);
                    if (checked) {
                      const next: Record<string, boolean> = {};
                      boundaries.forEach((b) => {
                        next[b.id] = true;
                      });
                      setVisibleAreas(next);
                    }
                  }}
                />
                <span className="area-swatch-badge">
                  <LayerIconGlyph icon="pin" size={10} color="#ffffff" strokeWidth={2.5} />
                </span>
                <span className="layer-name-text">Area Names ({boundaries.length})</span>
              </label>
              <button
                type="button"
                className="area-expand-btn"
                title={showAreaSublist ? 'Collapse individual area list' : 'Expand individual area list'}
                onClick={() => setShowAreaSublist((prev) => !prev)}
              >
                <ChevronDown
                  size={13}
                  style={{
                    transform: showAreaSublist ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s ease',
                  }}
                />
              </button>
            </div>
            {showAreaSublist && (
              <div className="area-sublist">
                <div className="area-sublist-toolbar">
                  <button
                    type="button"
                    className="area-sub-link"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      boundaries.forEach((b) => {
                        next[b.id] = true;
                      });
                      setVisibleAreas(next);
                      setShowAreaNames(true);
                    }}
                  >
                    Select All
                  </button>
                  <span className="area-sub-div">·</span>
                  <button
                    type="button"
                    className="area-sub-link"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      boundaries.forEach((b) => {
                        next[b.id] = false;
                      });
                      setVisibleAreas(next);
                    }}
                  >
                    Deselect All
                  </button>
                </div>
                {boundaries.map((b) => {
                  const isAreaVisible = showAreaNames && visibleAreas[b.id] !== false;
                  return (
                    <label
                      key={b.id}
                      className="area-sub-item"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isAreaVisible}
                        onChange={(e) => {
                          const nextChecked = e.target.checked;
                          setVisibleAreas((prev) => ({ ...prev, [b.id]: nextChecked }));
                          if (nextChecked && !showAreaNames) {
                            setShowAreaNames(true);
                          }
                        }}
                      />
                      <span className="area-sub-name">{b.name.replace(/^JE-/, '')}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {showAddBox && (
            <div
              className="layer-edit-box"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setAttachedFile(f);
                  if (!newLabel.trim()) {
                    const info = filenameToLayerInfo(f.name);
                    setNewLabel(info.label);
                    setNewIcon(info.icon);
                  }
                }
              }}
            >
              <div className="layer-edit-title">New Layer / Import</div>
              <input
                type="text"
                className="layer-edit-input"
                placeholder="Layer name (e.g. Solar Panels)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLabel.trim() && !isImporting) {
                    void handleCreateOrImport();
                  } else if (e.key === 'Escape') {
                    setShowAddBox(false);
                    setAttachedFile(null);
                  }
                }}
              />

              <div className="layer-file-upload-zone">
                <button
                  type="button"
                  className="layer-file-select-btn"
                  onClick={() => addFileInputRef.current?.click()}
                  title="Select KML, GeoJSON, CSV, or GPKG file to import"
                >
                  <FileUp size={12} />
                  <span>{attachedFile ? attachedFile.name : 'Choose GIS File to Import…'}</span>
                </button>
                <input
                  ref={addFileInputRef}
                  type="file"
                  hidden
                  accept={supportedImportAccept()}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setAttachedFile(f);
                      if (!newLabel.trim()) {
                        const info = filenameToLayerInfo(f.name);
                        setNewLabel(info.label);
                        setNewIcon(info.icon);
                      }
                    }
                    e.currentTarget.value = '';
                  }}
                />
                {attachedFile && (
                  <div className="layer-attached-file">
                    <span className="layer-attached-name">
                      {(attachedFile.size / 1024).toFixed(1)} KB attached
                    </span>
                    <button
                      type="button"
                      className="layer-attached-remove"
                      onClick={() => setAttachedFile(null)}
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              <div className="layer-palette-label">Layer Color:</div>
              <div className="layer-color-palette">
                {PRESET_LAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`layer-color-swatch ${newColor === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                    title={c}
                  />
                ))}
              </div>

              <div className="layer-palette-label">Layer Icon:</div>
              <div className="layer-icon-palette">
                {PRESET_LAYER_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    className={`layer-icon-choice ${newIcon === ic ? 'active' : ''}`}
                    onClick={() => setNewIcon(ic)}
                    title={ic}
                  >
                    <LayerIconGlyph icon={ic} size={14} color={newIcon === ic ? newColor : '#94A3B8'} />
                  </button>
                ))}
              </div>

              <div className="layer-edit-actions">
                <button
                  type="button"
                  className="layer-save-btn"
                  disabled={!newLabel.trim() || isImporting}
                  onClick={handleCreateOrImport}
                >
                  {isImporting
                    ? 'Importing…'
                    : attachedFile
                    ? 'Create & Import'
                    : 'Create'}
                </button>
                <button
                  type="button"
                  className="layer-cancel-btn"
                  disabled={isImporting}
                  onClick={() => {
                    setShowAddBox(false);
                    setAttachedFile(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {layers.length === 0 ? (
            <div className="layer-empty-msg">
              No active layers. Click <b>+ Add</b> to create a layer or <RotateCcw size={10} style={{ verticalAlign: 'middle' }} /> to restore defaults.
            </div>
          ) : (
            layers.map((l) => {
            const isEditing = editingLayerId === l.id;
            const currentIcon = l.icon || layerIcons[l.id] || 'circle';
            return (
              <div key={l.id}>
                <div className="layer-item-row">
                  <label
                    className="layer-item-main"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={visibleTypes[l.id] !== false}
                      onChange={(e) => {
                        const nextChecked = e.target.checked;
                        setVisibleTypes((prev) => ({ ...prev, [l.id]: nextChecked }));
                      }}
                    />
                    <span className="layer-color-swatch-badge" style={{ background: l.color }}>
                      <LayerIconGlyph icon={currentIcon} size={10} color="#ffffff" strokeWidth={2.5} />
                    </span>
                    <span className="layer-name-text" title={l.label}>
                      {l.label}
                    </span>
                  </label>
                  <div className="layer-item-btns">
                    <button
                      type="button"
                      className="layer-icon-btn"
                      title="Edit layer name, color & icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditing) {
                          setEditingLayerId(null);
                        } else {
                          setEditingLayerId(l.id);
                          setEditLabel(l.label);
                          setEditColor(l.color);
                          setEditIcon(currentIcon);
                          setShowAddBox(false);
                        }
                      }}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      className="layer-icon-btn delete"
                      title="Delete layer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${l.label}" layer?`)) {
                          deleteLayer(l.id);
                          if (editingLayerId === l.id) {
                            setEditingLayerId(null);
                          }
                        }
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="layer-edit-box">
                    <div className="layer-edit-title">Edit Layer</div>
                    <input
                      type="text"
                      className="layer-edit-input"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editLabel.trim()) {
                          editLayer(l.id, editLabel.trim(), editColor, editIcon);
                          setEditingLayerId(null);
                        } else if (e.key === 'Escape') {
                          setEditingLayerId(null);
                        }
                      }}
                    />

                    <div className="layer-palette-label">Layer Color:</div>
                    <div className="layer-color-palette">
                      {PRESET_LAYER_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`layer-color-swatch ${editColor === c ? 'active' : ''}`}
                          style={{ background: c }}
                          onClick={() => setEditColor(c)}
                          title={c}
                        />
                      ))}
                    </div>

                    <div className="layer-palette-label">Layer Icon:</div>
                    <div className="layer-icon-palette">
                      {PRESET_LAYER_ICONS.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          className={`layer-icon-choice ${editIcon === ic ? 'active' : ''}`}
                          onClick={() => setEditIcon(ic)}
                          title={ic}
                        >
                          <LayerIconGlyph icon={ic} size={14} color={editIcon === ic ? editColor : '#94A3B8'} />
                        </button>
                      ))}
                    </div>

                    <div className="layer-edit-actions">
                      <button
                        type="button"
                        className="layer-save-btn"
                        disabled={!editLabel.trim()}
                        onClick={() => {
                          if (editLabel.trim()) {
                            editLayer(l.id, editLabel.trim(), editColor, editIcon);
                            setEditingLayerId(null);
                          }
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="layer-cancel-btn"
                        onClick={() => setEditingLayerId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      </div>
      {hover && (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 270),
            top: Math.max(hover.y - 80, 8),
          }}
        >
          <b>{hover.asset.assetNo}</b>
          <span>{layerLabels[hover.asset.assetType] ?? hover.asset.assetType}</span>
          <span>Status: {hover.asset.status}</span>
        </div>
      )}
      {selectedAsset && (
        <div className="asset-detail" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="asset-detail-head">
            <div>
              <span className="asset-kicker">{layerLabels[selectedAsset.assetType] ?? selectedAsset.assetType}</span>
              <b>{selectedAsset.assetNo}</b>
            </div>
            <button title="Close" onClick={() => setSelectedAsset(null)}>
              ×
            </button>
          </div>
          <div className="asset-detail-grid">
            <span>Status</span>
            <b>{selectedAsset.status}</b>
            <span>Visibility</span>
            <b>{selectedAsset.shared ? 'Shared boundary' : 'Private'}</b>
            <span>Jurisdiction</span>
            <b>{selectedAsset.jurisdictions.join(', ')}</b>
            <span>Coordinates</span>
            <b>
              {selectedAsset.lat?.toFixed(6)}, {selectedAsset.lng?.toFixed(6)}
            </b>
          </div>
        </div>
      )}
      <div className="xyz-legend">
        {showAreaNames && (
          <span className="xyz-legend-item">
            <span className="legend-swatch-badge" style={{ background: '#38BDF8' }}>
              <LayerIconGlyph icon="pin" size={9} color="#ffffff" strokeWidth={2.5} />
            </span>
            Area Boundaries
          </span>
        )}
        {layers.map((l) => (
          <span key={l.id} className="xyz-legend-item">
            <span className="legend-swatch-badge" style={{ background: l.color }}>
              <LayerIconGlyph icon={l.icon || layerIcons[l.id]} size={9} color="#ffffff" strokeWidth={2.5} />
            </span>
            {l.label}
          </span>
        ))}
      </div>
      <div className="map-help">Wheel: zoom · Drag: pan · Shift + drag / right-drag: rotate · N: north</div>
    </div>
  );
}
