import { supabase } from '../config/supabase';
import { DATA_IMPORT_FORMATS } from '../config/dataManagement.config';
import { parseGeoPackageArrayBuffer } from './gpkgParser';
import { filenameToLayerInfo } from './layerService';
import { PERFORMANCE } from '../config/performance.config';
import type { PowerGISAsset } from './powergisData';

export type ImportFeature = {
  assetNo?: string;
  assetType?: string;
  status?: string;
  geometry: any;
  metadata?: Record<string, unknown>;
  latitude?: number;
  longitude?: number;
  jurisdictionIds?: string[];
  ownerJeIds?: string[];
  sharedBoundary?: boolean;
};

export type ImportProgressEvent = {
  percent: number;
  stage: 'reading' | 'parsing' | 'indexing' | 'complete' | 'error';
  message: string;
  processed?: number;
  total?: number;
  log?: string;
};

export type ProgressCallback = (event: ImportProgressEvent) => void;

export type ImportResult = { inserted: number; skipped: number; errors: string[] };

const IMPORTED_ASSETS_KEY = 'powergis_imported_assets';

function token() {
  const value = sessionStorage.getItem('powergis_session_token');
  if (!value) throw new Error('Your session has expired. Please sign in again.');
  return value;
}

function ext(name: string) {
  return name.toLowerCase().slice(name.lastIndexOf('.'));
}

export function supportedImportAccept() {
  return DATA_IMPORT_FORMATS.map((x) => x.extension).join(',');
}

export function detectAssetType(filename: string, fallback: string = 'DT'): string {
  const low = filename.toLowerCase();
  if (low.includes('substation')) return 'SUBSTATION';
  if (low.includes('transmission line') || low.includes('ehv')) return 'EHV_LINE';
  if (low.includes('ht feeder') || low.includes('ht ') || low.includes('ht-') || low.includes('hv')) return 'HV_LINE';
  if (low.includes('currenttransformer') || low.includes('distribution') || low.includes('transformer') || low.includes('dt')) return 'DT';
  if (low.includes('pillar')) return 'PILLAR_WAY';
  if (low.includes('meter')) return 'SMART_METER';
  if (low.includes('street pole') || low.includes('streetpole') || low.includes('street_pole') || low.includes('tower') || low.includes('pole')) return 'POLE';
  if (low.includes('lt')) return 'LT_LINE';
  return fallback;
}

function geometryToPoint(geometry: any): { latitude?: number; longitude?: number } {
  if (!geometry) return {};
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    return {
      longitude: Number(geometry.coordinates[0]),
      latitude: Number(geometry.coordinates[1]),
    };
  }
  return {};
}

function normalizeFeature(feature: any, index: number, defaultType: string, filename?: string): ImportFeature {
  const properties = feature?.properties ?? {};
  const geometry = feature?.geometry ?? null;
  const point = geometryToPoint(geometry);

  let assetType = defaultType;
  if (!assetType || assetType === 'AUTO') {
    const rawType = properties.asset_type ?? properties.assetType;
    if (rawType) {
      assetType = String(rawType).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    } else if (filename) {
      const derived = filenameToLayerInfo(filename);
      assetType = derived.id;
    } else {
      assetType = 'ASSET';
    }
  }
  if (assetType === 'STREET_POLE' || assetType === 'STREETPOLES' || assetType === 'STREET_POLES' || assetType === 'POLES') {
    assetType = 'POLE';
  }

  let assetNo =
    properties.asset_no ??
    properties.assetNo ??
    properties.PILLAR_WAY ??
    properties.PILLAR_W_1 ??
    properties.name ??
    properties.CT_AIN ??
    properties.DT_AIN ??
    properties.FM_AIN ??
    properties.PTR_AIN ??
    properties.LTC_CIN ??
    properties.fid ??
    properties.OBJECTID ??
    properties.id;

  if (!assetNo || String(assetNo).trim() === '') {
    if (properties.type_of_pole || properties.connect_dt || properties.connect_feeder) {
      const polePrefix = properties.type_of_pole
        ? String(properties.type_of_pole).replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()
        : 'POLE';
      assetNo = `${polePrefix}-${index + 1}`;
    } else {
      const prefix = filename ? filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') : assetType;
      assetNo = `${prefix}-${index + 1}`;
    }
  }

  return {
    assetNo: String(assetNo),
    assetType,
    status: String(properties.status ?? properties.PILLAR_W_18 ?? 'ACTIVE'),
    geometry,
    metadata: properties,
    ...point,
  };
}

// --- HIGH-PERFORMANCE CHUNKED STREAMING PARSERS ---

async function parseGeoJSONChunked(
  text: string,
  defaultType: string,
  filename?: string,
  onProgress?: ProgressCallback
): Promise<ImportFeature[]> {
  onProgress?.({
    percent: 10,
    stage: 'parsing',
    message: 'Parsing GeoJSON payload...',
    log: `[${new Date().toLocaleTimeString()}] Parsing GeoJSON data (${(text.length / 1024 / 1024).toFixed(1)} MB)...`,
  });

  await new Promise((r) => setTimeout(r, 0));
  const data = JSON.parse(text);
  const rawFeatures = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [];
  const validRaw = rawFeatures.filter((f: any) => f?.geometry);
  const total = validRaw.length;

  onProgress?.({
    percent: 25,
    stage: 'parsing',
    message: `Discovered ${total.toLocaleString()} GeoJSON features. Normalizing geometries...`,
    total,
    processed: 0,
    log: `[${new Date().toLocaleTimeString()}] Discovered ${total.toLocaleString()} valid features in GeoJSON.`,
  });

  const features: ImportFeature[] = [];
  const CHUNK_SIZE = 2500;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = validRaw.slice(i, i + CHUNK_SIZE);
    for (let c = 0; c < chunk.length; c++) {
      features.push(normalizeFeature(chunk[c], i + c, defaultType, filename));
    }
    const processed = Math.min(i + CHUNK_SIZE, total);
    const percent = Math.min(95, Math.round(25 + (processed / total) * 70));

    onProgress?.({
      percent,
      stage: 'parsing',
      message: `Processed ${processed.toLocaleString()} / ${total.toLocaleString()} features (${percent}%)...`,
      processed,
      total,
      log: `[${new Date().toLocaleTimeString()}] Processed ${processed.toLocaleString()} of ${total.toLocaleString()} features (${percent}%)...`,
    });

    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.({
    percent: 100,
    stage: 'parsing',
    message: `Extracted all ${features.length.toLocaleString()} GeoJSON features.`,
    processed: features.length,
    total,
    log: `[${new Date().toLocaleTimeString()}] GeoJSON parsing complete: ${features.length.toLocaleString()} features ready.`,
  });

  return features;
}

function parseWktCoordinate(s: string): [number, number] | null {
  const parts = s.trim().split(/\s+/);
  if (parts.length >= 2) {
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6];
    }
  }
  return null;
}

export function parseWkt(wktStr: string): any | null {
  if (!wktStr || typeof wktStr !== 'string') return null;
  const trimmed = wktStr.trim();
  const match = trimmed.match(/^([A-Z]+)(?:\s+[A-Z]+)?\s*\((.*)\)$/is);
  if (!match) return null;

  const geomType = match[1].toUpperCase();
  const body = match[2].trim();

  if (geomType === 'POINT') {
    const coord = parseWktCoordinate(body.replace(/[()]/g, ''));
    return coord ? { type: 'Point', coordinates: coord } : null;
  }

  if (geomType === 'LINESTRING') {
    const pairs = body.split(',');
    const coords: [number, number][] = [];
    for (const p of pairs) {
      const c = parseWktCoordinate(p);
      if (c) coords.push(c);
    }
    return coords.length ? { type: 'LineString', coordinates: coords } : null;
  }

  if (geomType === 'MULTILINESTRING') {
    const lineMatches = body.match(/\(([^()]+)\)/g);
    if (!lineMatches) return null;
    const lines: [number, number][][] = [];
    for (const lm of lineMatches) {
      const inner = lm.replace(/[()]/g, '');
      const coords: [number, number][] = [];
      for (const p of inner.split(',')) {
        const c = parseWktCoordinate(p);
        if (c) coords.push(c);
      }
      if (coords.length) lines.push(coords);
    }
    if (lines.length === 1) return { type: 'LineString', coordinates: lines[0] };
    return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
  }

  if (geomType === 'POLYGON') {
    const ringMatches = body.match(/\(([^()]+)\)/g);
    if (!ringMatches) return null;
    const rings: [number, number][][] = [];
    for (const rm of ringMatches) {
      const inner = rm.replace(/[()]/g, '');
      const coords: [number, number][] = [];
      for (const p of inner.split(',')) {
        const c = parseWktCoordinate(p);
        if (c) coords.push(c);
      }
      if (coords.length) rings.push(coords);
    }
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }

  if (geomType === 'MULTIPOLYGON') {
    const polyMatches = body.match(/\(\s*\((.*?)\)\s*\)/gs);
    if (!polyMatches) return null;
    const polys: [number, number][][][] = [];
    for (const pm of polyMatches) {
      const ringMatches = pm.match(/\(([^()]+)\)/g) || [pm];
      const rings: [number, number][][] = [];
      for (const rm of ringMatches) {
        const inner = rm.replace(/[()]/g, '');
        const coords: [number, number][] = [];
        for (const p of inner.split(',')) {
          const c = parseWktCoordinate(p);
          if (c) coords.push(c);
        }
        if (coords.length) rings.push(coords);
      }
      if (rings.length) polys.push(rings);
    }
    if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] };
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  }

  return null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(line.slice(start, i).trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      start = i + 1;
    }
  }
  result.push(line.slice(start).trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  return result;
}

async function parseCsvChunked(
  text: string,
  defaultType: string,
  filename?: string,
  onProgress?: ProgressCallback
): Promise<ImportFeature[]> {
  onProgress?.({
    percent: 5,
    stage: 'parsing',
    message: 'Analyzing CSV structure and lines...',
    log: `[${new Date().toLocaleTimeString()}] Reading lines from CSV (${(text.length / 1024 / 1024).toFixed(1)} MB)...`,
  });

  const lines = text.split(/\r?\n/);
  if (!lines.length || !lines[0].trim()) return [];

  const headers = parseCsvLine(lines[0]);
  const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);
  const total = dataLines.length;

  onProgress?.({
    percent: 10,
    stage: 'parsing',
    message: `Discovered ${total.toLocaleString()} CSV records. Beginning parsing...`,
    total,
    processed: 0,
    log: `[${new Date().toLocaleTimeString()}] Discovered ${total.toLocaleString()} rows. Columns: ${headers.slice(0, 6).join(', ')}...`,
  });

  const features: ImportFeature[] = [];
  const CHUNK_SIZE = 2500;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = dataLines.slice(i, i + CHUNK_SIZE);
    for (let c = 0; c < chunk.length; c++) {
      const idx = i + c;
      const values = parseCsvLine(chunk[c]);
      const row: Record<string, string> = {};
      for (let h = 0; h < headers.length; h++) {
        row[headers[h]] = values[h] ?? '';
      }

      const wkt = row.st_astext || row.geometry || row.wkt || row.the_geom || '';
      let geometry = parseWkt(wkt);
      if (!geometry) {
        const lat = Number(row.latitude ?? row.lat);
        const lng = Number(row.longitude ?? row.lng ?? row.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          geometry = { type: 'Point', coordinates: [lng, lat] };
        }
      }

      if (geometry) {
        features.push(normalizeFeature({ properties: row, geometry }, idx, defaultType, filename));
      }
    }

    const processed = Math.min(i + CHUNK_SIZE, total);
    const percent = Math.min(95, Math.round(10 + (processed / total) * 85));

    onProgress?.({
      percent,
      stage: 'parsing',
      message: `Parsed ${processed.toLocaleString()} / ${total.toLocaleString()} records (${percent}%)...`,
      processed,
      total,
      log: `[${new Date().toLocaleTimeString()}] Parsed ${processed.toLocaleString()} of ${total.toLocaleString()} rows (${percent}%)...`,
    });

    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.({
    percent: 100,
    stage: 'parsing',
    message: `Extracted all ${features.length.toLocaleString()} valid features from CSV.`,
    processed: features.length,
    total,
    log: `[${new Date().toLocaleTimeString()}] CSV parsing complete: ${features.length.toLocaleString()} features ready.`,
  });

  return features;
}

function parseKmlCoordinates(text: string): [number, number][] {
  const res: [number, number][] = [];
  for (const pair of text.trim().split(/\s+/)) {
    const parts = pair.split(',');
    if (parts.length >= 2) {
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        res.push([Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);
      }
    }
  }
  return res;
}

async function parseKmlChunked(
  text: string,
  defaultType: string,
  filename?: string,
  onProgress?: ProgressCallback
): Promise<ImportFeature[]> {
  onProgress?.({
    percent: 10,
    stage: 'parsing',
    message: 'Parsing KML XML tree...',
    log: `[${new Date().toLocaleTimeString()}] Reading KML XML document (${(text.length / 1024 / 1024).toFixed(1)} MB)...`,
  });

  await new Promise((r) => setTimeout(r, 0));
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const placemarks = Array.from(xml.getElementsByTagName('Placemark'));
  const total = placemarks.length;

  onProgress?.({
    percent: 25,
    stage: 'parsing',
    message: `Found ${total.toLocaleString()} KML Placemarks. Extracting attributes...`,
    total,
    processed: 0,
    log: `[${new Date().toLocaleTimeString()}] Extracted ${total.toLocaleString()} Placemarks from KML.`,
  });

  const features: ImportFeature[] = [];
  const CHUNK_SIZE = 1000;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = placemarks.slice(i, i + CHUNK_SIZE);
    for (let c = 0; c < chunk.length; c++) {
      const pm = chunk[c];
      const idx = i + c;
      const props: Record<string, any> = {};

      const simpleData = Array.from(pm.getElementsByTagName('SimpleData'));
      for (const sd of simpleData) {
        const nameAttr = sd.getAttribute('name');
        if (nameAttr && sd.textContent) {
          props[nameAttr] = sd.textContent.trim();
        }
      }

      const nameEl = pm.getElementsByTagName('name')[0];
      if (nameEl?.textContent) {
        props.name = nameEl.textContent.trim();
      }

      let geometry: any = null;
      const pt = pm.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
      const ls = pm.getElementsByTagName('LineString')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
      const pg = pm.getElementsByTagName('Polygon')[0]?.getElementsByTagName('coordinates')[0]?.textContent;

      if (pt) {
        const coords = parseKmlCoordinates(pt);
        if (coords.length) geometry = { type: 'Point', coordinates: coords[0] };
      } else if (ls) {
        const coords = parseKmlCoordinates(ls);
        if (coords.length) geometry = { type: 'LineString', coordinates: coords };
      } else if (pg) {
        const coords = parseKmlCoordinates(pg);
        if (coords.length) geometry = { type: 'Polygon', coordinates: [coords] };
      }

      if (geometry) {
        features.push(normalizeFeature({ properties: props, geometry }, idx, defaultType, filename));
      }
    }

    const processed = Math.min(i + CHUNK_SIZE, total);
    const percent = Math.min(95, Math.round(25 + (processed / total) * 70));

    onProgress?.({
      percent,
      stage: 'parsing',
      message: `Parsed ${processed.toLocaleString()} / ${total.toLocaleString()} Placemarks...`,
      processed,
      total,
      log: `[${new Date().toLocaleTimeString()}] Parsed ${processed.toLocaleString()} of ${total.toLocaleString()} Placemarks (${percent}%)...`,
    });

    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.({
    percent: 100,
    stage: 'parsing',
    message: `Completed KML parsing: ${features.length.toLocaleString()} features.`,
    processed: features.length,
    total,
    log: `[${new Date().toLocaleTimeString()}] KML parsing complete: ${features.length.toLocaleString()} features ready.`,
  });

  return features;
}

export async function parseImportFile(
  file: File,
  defaultType?: string,
  onProgress?: ProgressCallback
): Promise<ImportFeature[]> {
  const extension = ext(file.name);
  const resolvedType = defaultType || filenameToLayerInfo(file.name).id;

  onProgress?.({
    percent: 2,
    stage: 'reading',
    message: `Reading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`,
    log: `[${new Date().toLocaleTimeString()}] Reading "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB)...`,
  });

  if (extension === '.gpkg') {
    const buffer = await file.arrayBuffer();
    onProgress?.({
      percent: 20,
      stage: 'parsing',
      message: `Parsing GeoPackage SQLite B-Trees (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)...`,
      log: `[${new Date().toLocaleTimeString()}] Processing GeoPackage SQLite structure...`,
    });
    const features = parseGeoPackageArrayBuffer(buffer, resolvedType);
    if (!features.length) {
      throw new Error(`No geometry records could be parsed from GeoPackage: ${file.name}`);
    }
    onProgress?.({
      percent: 100,
      stage: 'parsing',
      message: `Extracted ${features.length.toLocaleString()} features from GeoPackage.`,
      processed: features.length,
      log: `[${new Date().toLocaleTimeString()}] GeoPackage parsed: ${features.length.toLocaleString()} features.`,
    });
    return features;
  }

  if (extension === '.geojson' || extension === '.json') {
    const text = await file.text();
    return parseGeoJSONChunked(text, resolvedType, file.name, onProgress);
  }

  if (extension === '.kml') {
    const text = await file.text();
    return parseKmlChunked(text, resolvedType, file.name, onProgress);
  }

  if (extension === '.csv') {
    const text = await file.text();
    return parseCsvChunked(text, resolvedType, file.name, onProgress);
  }

  if (extension === '.kmz') {
    throw new Error('KMZ is a compressed archive. Please extract and import the inner .kml or .geojson file.');
  }

  throw new Error(`Unsupported file format: ${file.name}. Please select KML, GeoJSON, CSV, or GPKG.`);
}

export async function importSourceFile(
  file: File,
  defaultType: string,
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  const features = await parseImportFile(file, defaultType, onProgress);
  if (!features.length) {
    throw new Error('No GIS features could be read from the selected file.');
  }
  return importAssets(features, 'overwrite', onProgress);
}

// --- HIGH-PERFORMANCE INDEXEDDB STORAGE ENGINE ---
const IDB_NAME = 'PowerGIS_Offline_DB';
const IDB_VERSION = 1;
const IDB_STORE = 'imported_assets';

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveToIndexedDb(assets: PowerGISAsset[]): Promise<void> {
  try {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      for (const a of assets) {
        store.put(a);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB write warning:', err);
  }
}

function normalizeImportedAsset(a: PowerGISAsset): PowerGISAsset {
  if (
    a.assetType === 'STREET_POLE' ||
    a.assetType === 'STREETPOLES' ||
    a.assetType === 'STREET_POLES' ||
    a.assetType === 'POLES'
  ) {
    return { ...a, assetType: 'POLE' };
  }
  return a;
}

export async function loadFromIndexedDb(): Promise<PowerGISAsset[]> {
  try {
    const db = await openIndexedDb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).map(normalizeImportedAsset));
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// In-memory fast cache to ensure synchronous 0ms lookups for React components
let cachedLocalAssets: PowerGISAsset[] | null = null;

// Initial hydration from IndexedDB on startup
if (typeof window !== 'undefined') {
  void loadFromIndexedDb().then((idbAssets) => {
    if (idbAssets && idbAssets.length > 0) {
      cachedLocalAssets = idbAssets;
      window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
    }
  });
}

export function getLocalImportedAssets(): PowerGISAsset[] {
  if (cachedLocalAssets !== null) {
    return cachedLocalAssets.map(normalizeImportedAsset);
  }
  try {
    const saved = localStorage.getItem(IMPORTED_ASSETS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        cachedLocalAssets = parsed.map(normalizeImportedAsset);
        return cachedLocalAssets;
      }
    }
  } catch (e) {
    console.warn('Error reading local imported assets from localStorage:', e);
  }
  return [];
}

export function saveLocalImportedAssets(assets: PowerGISAsset[]): void {
  const normalized = assets.map(normalizeImportedAsset);
  cachedLocalAssets = normalized;
  // Asynchronously persist to IndexedDB (can hold 100s of MBs with 0ms UI blocking)
  void saveToIndexedDb(normalized);

  // If size is small, also store in localStorage for instant sync
  try {
    if (normalized.length <= 500) {
      localStorage.setItem(IMPORTED_ASSETS_KEY, JSON.stringify(normalized));
    } else {
      localStorage.setItem(
        IMPORTED_ASSETS_KEY,
        JSON.stringify({ _indexedDb: true, count: normalized.length, updated: Date.now() })
      );
    }
  } catch {
    /* ignore localStorage quota exceeded - IndexedDB has it safely */
  }
}

export type DuplicateStrategy = 'overwrite' | 'skip' | 'rename';

export function removeImportedAssets(ids: string[]): void {
  const current = getLocalImportedAssets();
  const toDelete = new Set(ids);
  const remaining = current.filter((a) => !toDelete.has(a.id) && !toDelete.has(a.assetNo));
  saveLocalImportedAssets(remaining);
  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
}

export function clearAllImportedAssets(): void {
  saveLocalImportedAssets([]);
  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
}

export async function importAssets(
  features: ImportFeature[],
  duplicateStrategy: DuplicateStrategy = 'skip',
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  if (!supabase) throw new Error('GIS import requires a configured server connection. Offline-only imports are not published as operational assets.');
  if (features.length > PERFORMANCE.importMaxDbSync) {
    throw new Error(`This import contains ${features.length.toLocaleString()} features; the configured server limit is ${PERFORMANCE.importMaxDbSync.toLocaleString()}. Split the file into smaller batches.`);
  }
  if (duplicateStrategy !== 'skip') {
    throw new Error('The current database import procedure only supports safe duplicate skipping. Overwrite and rename require a server-side conflict-resolution migration.');
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const chunkSize = PERFORMANCE.importDbChunkSize;
  onProgress?.({ percent: 5, stage: 'indexing', message: `Validating ${features.length.toLocaleString()} features before server import...` });

  for (let offset = 0; offset < features.length; offset += chunkSize) {
    const chunk = features.slice(offset, offset + chunkSize).map((feature) => ({
      assetNo: String(feature.assetNo || '').trim(),
      assetType: String(feature.assetType || 'DT').trim().toUpperCase(),
      status: String(feature.status || 'ACTIVE').trim().toUpperCase(),
      geometry: feature.geometry,
      latitude: feature.latitude,
      longitude: feature.longitude,
      metadata: feature.metadata || {},
    }));
    try {
      const { data, error } = await supabase.rpc('admin_import_assets', {
        p_session_token: token(),
        p_assets: chunk,
      });
      if (error) {
        errors.push(`Batch ${Math.floor(offset / chunkSize) + 1}: ${error.message || String(error)}`);
      } else {
        const result = Array.isArray(data) ? data[0] : data;
        inserted += Number(result?.inserted || 0);
        skipped += Number(result?.skipped || 0);
        const rowErrors = Array.isArray(result?.errors) ? result.errors : [];
        rowErrors.forEach((entry: any) => errors.push(`${entry.assetNo || 'Unknown asset'}: ${entry.error || 'Rejected by server validation'}`));
      }
    } catch (err: any) {
      errors.push(`Batch ${Math.floor(offset / chunkSize) + 1}: ${err?.message || String(err)}`);
    }
    const processed = Math.min(offset + chunk.length, features.length);
    onProgress?.({
      percent: Math.round(10 + (processed / Math.max(features.length, 1)) * 85),
      stage: errors.length ? 'error' : 'indexing',
      message: `Server processed ${processed.toLocaleString()} / ${features.length.toLocaleString()} features`,
      processed,
      total: features.length,
    });
    // Yield between bounded batches to keep the browser responsive.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
  const failed = errors.length > 0;
  onProgress?.({
    percent: 100,
    stage: failed ? 'error' : 'complete',
    message: failed
      ? `Import partially completed: ${inserted.toLocaleString()} inserted, ${skipped.toLocaleString()} skipped, ${errors.length.toLocaleString()} errors.`
      : `Import complete: ${inserted.toLocaleString()} inserted, ${skipped.toLocaleString()} skipped.`,
    processed: features.length,
    total: features.length,
  });
  return { inserted, skipped, errors };
}

export async function exportVisibleAssets(format: 'geojson' | 'csv' | 'json'): Promise<Blob> {
  if (!supabase) throw new Error('Export is unavailable because the server connection is not configured.');
  const allAssets: any[] = [];
  let afterCreatedAt: string | null = null;
  let afterId: string | null = null;
  const pageSize = 1000;
  for (;;) {
    const res: any = await supabase.rpc('visible_assets_page', {
      p_session_token: token(),
      p_limit: pageSize,
      p_after_created_at: afterCreatedAt,
      p_after_id: afterId,
    });
    const data: any[] | null = res?.data;
    const error: any = res?.error;
    if (error) throw new Error(error.message || 'Authorised export failed.');
    if (!Array.isArray(data)) throw new Error('The server returned an invalid export page.');
    const total = Number(data[0]?.total_count || 0);
    if (total > PERFORMANCE.maxClientAssets) {
      throw new Error(`This export contains ${total.toLocaleString()} records. The safe browser export ceiling is ${PERFORMANCE.maxClientAssets.toLocaleString()}; use a server-side export job for larger datasets.`);
    }
    allAssets.push(...data);
    if (data.length < pageSize) break;
    const last: any = data[data.length - 1];
    if (!last?.created_at || !last?.id) throw new Error('The export cursor is incomplete; export stopped to prevent duplicate or missing records.');
    afterCreatedAt = String(last.created_at);
    afterId = String(last.id);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (format === 'geojson') {
    const fc = {
      type: 'FeatureCollection',
      features: allAssets.map((r) => ({
        type: 'Feature',
        geometry: r.geometry,
        properties: {
          asset_no: r.assetNo || r.asset_no,
          asset_type: r.assetType || r.asset_type,
          status: r.status,
          jurisdiction_ids: r.jurisdictions || r.jurisdiction_ids,
          owner_je_ids: r.owners || r.owner_je_ids,
          metadata: r.metadata,
        },
      })),
    };
    return new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
  }

  if (format === 'csv') {
    const headers = ['asset_no', 'asset_type', 'status', 'latitude', 'longitude', 'jurisdiction_ids', 'owner_je_ids'];
    const lines = [headers.join(',')];
    allAssets.forEach((r) =>
      lines.push(
        headers
          .map((h) => {
            const val = r[h] ?? r[h.replace(/_([a-z])/g, (_, l) => l.toUpperCase())] ?? '';
            return JSON.stringify(val);
          })
          .join(',')
      )
    );
    return new Blob([lines.join('\n')], { type: 'text/csv' });
  }

  return new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), assets: allAssets }, null, 2)], {
    type: 'application/json',
  });
}

export async function createDatabaseBackup() {
  if (!supabase) throw new Error('Backup service is not configured.');
  const { data, error } = await supabase.rpc('create_backup_manifest', { p_session_token: token() });
  if (error) throw new Error(error.message || 'Backup request failed.');
  if (!data?.[0]?.backup_id) throw new Error('The backup service did not confirm a backup run.');
  return data[0];
}

export async function listBackupRuns() {
  if (!supabase) throw new Error('Backup service is not configured.');
  const { data, error } = await supabase.rpc('list_backup_runs', { p_session_token: token() });
  if (error) throw new Error(error.message || 'Unable to retrieve backup history.');
  return data ?? [];
}

async function invokeBackupRestore(action: 'download' | 'restore', backupId: string): Promise<any> {
  if (!supabase) throw new Error('Backup service is not configured.');
  const { data, error } = await supabase.functions.invoke('backup-restore', {
    body: JSON.stringify({ action, backupId }),
    headers: { 'x-powergis-session': token() },
  });
  if (error) throw new Error(error.message || 'Backup operation failed.');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function downloadDatabaseBackup(backupId: string): Promise<void> {
  const result = await invokeBackupRestore('download', backupId);
  if (typeof result?.signedUrl !== 'string') throw new Error('The backup download link was not returned.');
  const response = await fetch(result.signedUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to download the selected backup.');
  const blob = await response.blob();
  downloadBlob(blob, `powergis-${backupId}.pgbk`);
}

export async function restoreDatabaseBackup(backupId: string): Promise<Record<string, number>> {
  const result = await invokeBackupRestore('restore', backupId);
  if (!result?.ok) throw new Error('The backup restore was not confirmed.');
  return result.restored ?? {};
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type { PowerGISAsset };
