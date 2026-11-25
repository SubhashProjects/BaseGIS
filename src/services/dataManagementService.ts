import { supabase } from '../config/supabase';
import { DATA_IMPORT_FORMATS } from '../config/dataManagement.config';
import { parseGeoPackageArrayBuffer } from './gpkgParser';
import { filenameToLayerInfo } from './layerService';
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

export type ImportResult = { inserted: number; skipped: number; errors: string[] };

const IMPORTED_ASSETS_KEY = 'powergis_imported_assets';

function token() {
  const value = localStorage.getItem('powergis_session_token');
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
  if (low.includes('meter')) return 'SMART_METER';
  if (low.includes('tower') || low.includes('pole')) return 'POLE';
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

  let assetNo =
    properties.asset_no ??
    properties.assetNo ??
    properties.name ??
    properties.CT_AIN ??
    properties.DT_AIN ??
    properties.FM_AIN ??
    properties.PTR_AIN ??
    properties.LTC_CIN ??
    properties.id;

  if (!assetNo || String(assetNo).trim() === '') {
    const prefix = filename ? filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') : assetType;
    assetNo = `${prefix}-${index + 1}`;
  }

  return {
    assetNo: String(assetNo),
    assetType,
    status: String(properties.status ?? 'ACTIVE'),
    geometry,
    metadata: properties,
    ...point,
  };
}

function parseGeoJSON(text: string, defaultType: string, filename?: string): ImportFeature[] {
  const data = JSON.parse(text);
  const features = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [];
  return features
    .filter((f: any) => f?.geometry)
    .map((f: any, i: number) => normalizeFeature(f, i, defaultType, filename));
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

function parseCsvTokens(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let token = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        token += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push(token.trim());
      token = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(token.trim());
      if (row.some((t) => t !== '')) lines.push(row);
      row = [];
      token = '';
    } else {
      token += char;
    }
  }

  if (token || row.length) {
    row.push(token.trim());
    if (row.some((t) => t !== '')) lines.push(row);
  }

  return lines;
}

function parseCsv(text: string, defaultType: string, filename?: string): ImportFeature[] {
  const tokenRows = parseCsvTokens(text);
  if (!tokenRows.length) return [];

  const headers = tokenRows[0].map((h) => h.replace(/^["']|["']$/g, '').trim());

  return tokenRows
    .slice(1)
    .map((values, i) => {
      const row: Record<string, string> = {};
      headers.forEach((h, n) => {
        row[h] = (values[n] ?? '').replace(/^["']|["']$/g, '').trim();
      });

      const wkt = row.st_astext || row.geometry || row.wkt || row.the_geom || '';
      let geometry = parseWkt(wkt);

      if (!geometry) {
        const lat = Number(row.latitude ?? row.lat);
        const lng = Number(row.longitude ?? row.lng ?? row.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          geometry = { type: 'Point', coordinates: [lng, lat] };
        }
      }

      return normalizeFeature({ properties: row, geometry }, i, defaultType, filename);
    })
    .filter((x) => x.geometry);
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

function parseKml(text: string, defaultType: string, filename?: string): ImportFeature[] {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const placemarks = Array.from(xml.getElementsByTagName('Placemark'));

  return placemarks
    .map((pm, i) => {
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

      return normalizeFeature({ properties: props, geometry }, i, defaultType, filename);
    })
    .filter((x) => x.geometry);
}

export async function parseImportFile(file: File, defaultType?: string): Promise<ImportFeature[]> {
  const extension = ext(file.name);
  const resolvedType = defaultType || filenameToLayerInfo(file.name).id;

  if (extension === '.gpkg') {
    const buffer = await file.arrayBuffer();
    const features = parseGeoPackageArrayBuffer(buffer, resolvedType);
    if (!features.length) {
      throw new Error(`No geometry records could be parsed from GeoPackage: ${file.name}`);
    }
    return features;
  }

  if (extension === '.geojson' || extension === '.json') {
    return parseGeoJSON(await file.text(), resolvedType, file.name);
  }

  if (extension === '.kml') {
    return parseKml(await file.text(), resolvedType, file.name);
  }

  if (extension === '.csv') {
    return parseCsv(await file.text(), resolvedType, file.name);
  }

  if (extension === '.kmz') {
    throw new Error('KMZ is a compressed archive. Please extract and import the inner .kml or .geojson file.');
  }

  throw new Error(`Unsupported file format: ${file.name}. Please select KML, GeoJSON, CSV, or GPKG.`);
}

export async function importSourceFile(file: File, defaultType: string): Promise<ImportResult> {
  const features = await parseImportFile(file, defaultType);
  if (!features.length) {
    throw new Error('No GIS features could be read from the selected file.');
  }
  return importAssets(features);
}

export function getLocalImportedAssets(): PowerGISAsset[] {
  try {
    const saved = localStorage.getItem(IMPORTED_ASSETS_KEY);
    if (saved) {
      return JSON.parse(saved) as PowerGISAsset[];
    }
  } catch (e) {
    console.warn('Error reading local imported assets:', e);
  }
  return [];
}

export function saveLocalImportedAssets(assets: PowerGISAsset[]): void {
  try {
    localStorage.setItem(IMPORTED_ASSETS_KEY, JSON.stringify(assets));
  } catch (e) {
    console.warn('Error saving local imported assets:', e);
  }
}

export async function importAssets(features: ImportFeature[]): Promise<ImportResult> {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Convert features to PowerGISAsset format for immediate local application availability
  const newAssets: PowerGISAsset[] = features.map((f, i) => ({
    id: `imp-${Date.now()}-${i + 1}`,
    assetNo: f.assetNo || `IMP-${i + 1}`,
    assetType: f.assetType || 'DT',
    status: f.status || 'ACTIVE',
    geometry: f.geometry,
    latitude: f.latitude,
    longitude: f.longitude,
    jurisdictions: f.jurisdictionIds || ['PONDICHERRY'],
    owners: f.ownerJeIds || [],
    shared: f.sharedBoundary || false,
    metadata: f.metadata,
  }));

  const existingLocal = getLocalImportedAssets();
  const existingNos = new Set(existingLocal.map((a) => a.assetNo));
  const toAdd = newAssets.filter((a) => !existingNos.has(a.assetNo));
  saveLocalImportedAssets([...existingLocal, ...toAdd]);
  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));

  // Attempt database synchronization in chunks of 150
  if (supabase) {
    const CHUNK_SIZE = 150;
    for (let c = 0; c < features.length; c += CHUNK_SIZE) {
      const slice = features.slice(c, c + CHUNK_SIZE);
      try {
        const { data, error } = await supabase.rpc('admin_import_assets', {
          p_session_token: token(),
          p_assets: slice,
        });

        if (error) {
          errors.push(error.message || String(error));
        } else if (data?.[0]) {
          inserted += data[0].inserted ?? slice.length;
          skipped += data[0].skipped ?? 0;
        } else {
          inserted += slice.length;
        }
      } catch (err: any) {
        errors.push(err.message || String(err));
      }
    }
  } else {
    inserted = toAdd.length;
    skipped = newAssets.length - toAdd.length;
  }

  if (inserted === 0 && toAdd.length > 0) {
    inserted = toAdd.length;
  }

  return { inserted, skipped, errors };
}

export async function exportVisibleAssets(format: 'geojson' | 'csv' | 'json'): Promise<Blob> {
  const localAssets = getLocalImportedAssets();
  let dbRows: any[] = [];

  if (supabase) {
    try {
      const { data } = await supabase.rpc('export_assets', { p_session_token: token() });
      if (data) dbRows = data;
    } catch {
      /* fallback to local assets */
    }
  }

  const allAssets = [...dbRows, ...localAssets];

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
  if (supabase) {
    try {
      const { data } = await supabase.rpc('create_backup_manifest', { p_session_token: token() });
      return data?.[0] ?? { backup_id: `bck-${Date.now()}` };
    } catch {
      /* fallback */
    }
  }
  return { backup_id: `local-bck-${Date.now()}` };
}

export async function listBackupRuns() {
  if (supabase) {
    try {
      const { data } = await supabase.rpc('list_backup_runs', { p_session_token: token() });
      return data ?? [];
    } catch {
      /* fallback */
    }
  }
  return [];
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
