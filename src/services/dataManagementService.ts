import { supabase } from '../config/supabase';
import { DATA_IMPORT_FORMATS } from '../config/dataManagement.config';
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

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

function token() {
  const value = localStorage.getItem('powergis_session_token');
  if (!value) throw new Error('Your session has expired. Please sign in again.');
  return value;
}

function ext(name: string) { return name.toLowerCase().slice(name.lastIndexOf('.')); }

export function supportedImportAccept() {
  return DATA_IMPORT_FORMATS.map((x) => x.extension).join(',');
}

function geometryToPoint(geometry: any) {
  if (!geometry) return {};
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    return { longitude: Number(geometry.coordinates[0]), latitude: Number(geometry.coordinates[1]) };
  }
  return {};
}

function normalizeFeature(feature: any, index: number, defaultType: string): ImportFeature {
  const properties = feature?.properties ?? {};
  const geometry = feature?.geometry ?? null;
  const point = geometryToPoint(geometry);
  const assetNo = String(properties.asset_no ?? properties.assetNo ?? properties.id ?? `IMP-${Date.now()}-${index + 1}`);
  return {
    assetNo,
    assetType: String(properties.asset_type ?? properties.assetType ?? defaultType),
    status: String(properties.status ?? 'ACTIVE'),
    geometry,
    metadata: properties,
    ...point,
  };
}

function parseGeoJSON(text: string, defaultType: string): ImportFeature[] {
  const data = JSON.parse(text);
  const features = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [];
  return features.filter((f: any) => f?.geometry).map((f: any, i: number) => normalizeFeature(f, i, defaultType));
}

function kmlCoordinates(text: string): number[][] {
  return text.trim().split(/\s+/).map((pair) => {
    const p = pair.split(',');
    return [Number(p[0]), Number(p[1])];
  }).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

function parseKml(text: string, defaultType: string): ImportFeature[] {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const placemarks = Array.from(xml.getElementsByTagName('Placemark'));
  return placemarks.map((pm, i) => {
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() || `KML-${i + 1}`;
    const point = pm.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    const line = pm.getElementsByTagName('LineString')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    const polygon = pm.getElementsByTagName('Polygon')[0]?.getElementsByTagName('outerBoundaryIs')[0]?.getElementsByTagName('LinearRing')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    let geometry: any = null;
    if (point) geometry = { type: 'Point', coordinates: kmlCoordinates(point)[0] };
    else if (line) geometry = { type: 'LineString', coordinates: kmlCoordinates(line) };
    else if (polygon) geometry = { type: 'Polygon', coordinates: [kmlCoordinates(polygon)] };
    return normalizeFeature({ properties: { name, asset_no: name }, geometry }, i, defaultType);
  }).filter((x) => x.geometry);
}

function parseCsv(text: string, defaultType: string): ImportFeature[] {
  const rows = text.split(/\r?\n/).filter(Boolean);
  if (!rows.length) return [];
  const headers = rows[0].split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
  return rows.slice(1).map((line, i) => {
    const values = line.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, n) => { row[h] = values[n] ?? ''; });
    const lat = Number(row.latitude ?? row.lat);
    const lng = Number(row.longitude ?? row.lng ?? row.lon);
    const geometry = Number.isFinite(lat) && Number.isFinite(lng) ? { type: 'Point', coordinates: [lng, lat] } : null;
    return normalizeFeature({ properties: row, geometry }, i, defaultType);
  }).filter((x) => x.geometry);
}

export async function parseImportFile(file: File, defaultType: string): Promise<ImportFeature[]> {
  const kind = DATA_IMPORT_FORMATS.find((x) => x.extension === ext(file.name))?.kind;
  if (!kind) throw new Error(`Unsupported import format: ${file.name}`);
  if (kind === 'kmz') throw new Error('KMZ requires server-side unzip processing. Export the layer as KML or GeoPackage for direct import.');
  if (kind === 'xlsx' || kind === 'gpkg') throw new Error('This format is imported through the server import endpoint.');
  if (kind === 'geojson') return parseGeoJSON(await file.text(), defaultType);
  if (kind === 'kml') return parseKml(await file.text(), defaultType);
  if (kind === 'csv') return parseCsv(await file.text(), defaultType);
  return [];
}

export async function importSourceFile(file: File, defaultType: string) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('import-gis', {
    body: (() => { const fd = new FormData(); fd.append('file', file, file.name); fd.append('defaultType', defaultType); fd.append('sessionToken', token()); return fd; })(),
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'GIS import failed.');
  return data as ImportResult;
}

export async function importAssets(features: ImportFeature[]): Promise<ImportResult> {
  const { data, error } = await requireSupabase().rpc('admin_import_assets', { p_session_token: token(), p_assets: features });
  if (error) throw error;
  return data?.[0] ?? { inserted: 0, skipped: 0, errors: [] };
}

export async function exportVisibleAssets(format: 'geojson'|'csv'|'json'): Promise<Blob> {
  const { data, error } = await requireSupabase().rpc('export_assets', { p_session_token: token() });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (format === 'geojson') {
    return new Blob([JSON.stringify({ type: 'FeatureCollection', features: rows.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { asset_no: r.asset_no, asset_type: r.asset_type, status: r.status, jurisdiction_ids: r.jurisdiction_ids, owner_je_ids: r.owner_je_ids, metadata: r.metadata } })) }, null, 2)], { type: 'application/geo+json' });
  }
  if (format === 'csv') {
    const headers = ['asset_no','asset_type','status','latitude','longitude','jurisdiction_ids','owner_je_ids'];
    const lines = [headers.join(',')];
    rows.forEach((r) => lines.push(headers.map((h) => JSON.stringify(r[h] ?? '')).join(',')));
    return new Blob([lines.join('\n')], { type: 'text/csv' });
  }
  return new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), assets: rows }, null, 2)], { type: 'application/json' });
}

export async function createDatabaseBackup() {
  const { data, error } = await requireSupabase().rpc('create_backup_manifest', { p_session_token: token() });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function listBackupRuns() {
  const { data, error } = await requireSupabase().rpc('list_backup_runs', { p_session_token: token() });
  if (error) throw error;
  return data ?? [];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type { PowerGISAsset };
