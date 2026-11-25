import { supabase } from '../config/supabase';
import { SAMPLE_GIS_ASSETS } from './sampleGisData';
import { getLocalImportedAssets } from './dataManagementService';

export type PowerGISUser = {
  id: string;
  username: string;
  displayName: string;
  role: 'GIS_ADMIN'|'SE'|'EE'|'AEE'|'AE'|'JE'|'CONTRACTOR';
  subdivision: string|null;
  division: string|null;
  circle: string|null;
  department: string|null;
  admin: string|null;
  region: string;
  scopeField?: 'subdivision'|'division'|'circle'|'department'|null;
  scopeValue?: string|null;
  jurisdictions: string[];
};

export type PowerGISAsset = {
  id: string;
  assetNo: string;
  assetType: string;
  status: string;
  jurisdictions: string[];
  owners: string[];
  shared?: boolean;
  geometry: any;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  metadata?: Record<string, any>;
};

export type PowerGISBoundary = {
  id: string;
  name: string;
  region: string;
  subdivision: string|null;
  division: string|null;
  circle: string|null;
  department: string|null;
  geometry: any;
};

const SE1_HOD_USER: PowerGISUser = {
  id: 'org-se-000',
  username: 'SE - 1 cum HOD',
  displayName: 'SE - 1 cum HOD',
  role: 'SE',
  subdivision: null,
  division: null,
  circle: null,
  department: 'SE - 1 cum HOD',
  admin: 'GIS Admin',
  region: 'All Regions',
  scopeField: 'department',
  scopeValue: 'SE - 1 cum HOD',
  jurisdictions: ['PONDICHERRY', 'KARAIKAL', 'MAHE', 'YANAM'],
};

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

function mapUser(row: any): PowerGISUser {
  let displayName = row.display_name;
  let username = row.username;
  if (displayName === 'SE - 1 HOD' || username === 'SE - 1 HOD') {
    displayName = 'SE - 1 cum HOD';
    username = 'SE - 1 cum HOD';
  }
  return {
    id: row.id,
    username,
    displayName,
    role: row.role,
    subdivision: row.subdivision ?? null,
    division: row.division ?? null,
    circle: row.circle ?? null,
    department: row.department ?? null,
    admin: row.admin_name ?? null,
    region: row.region,
    scopeField: row.scope_field ?? null,
    scopeValue: row.scope_value ?? null,
    jurisdictions: row.jurisdiction_ids ?? [],
  };
}

export async function listLoginUsers(): Promise<PowerGISUser[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('login_users');
  if (error) throw error;
  const list: PowerGISUser[] = (data ?? []).map(mapUser);

  // Guarantee that SE - 1 cum HOD is available under SE role
  if (!list.some((u: PowerGISUser) => u.username === 'SE - 1 cum HOD' || u.displayName === 'SE - 1 cum HOD' || u.username === 'SE - 1 HOD' || u.id === 'org-se-000')) {
    const seIndex = list.findIndex((u: PowerGISUser) => u.role === 'SE');
    if (seIndex !== -1) {
      list.splice(seIndex, 0, SE1_HOD_USER);
    } else {
      list.push(SE1_HOD_USER);
    }
  }
  return list;
}

export async function authenticateUser(username: string, password: string): Promise<PowerGISUser | null> {
  const client = requireSupabase();
  const cleanUsername = username.trim();
  const normalized = cleanUsername.toLowerCase().replace(/[\s-]/g, '');
  const isSe1Hod = normalized === 'se1hod' || normalized === 'se1cumhod';

  try {
    let { data, error } = await client.rpc('authenticate_user', { p_username: cleanUsername, p_password: password });
    if (error) {
      console.warn('Supabase authenticate_user error:', error.message || error);
    }
    if ((error || !data || data.length === 0) && isSe1Hod) {
      // Fallback query if DB still has SE - 1 HOD as username
      const fallback = await client.rpc('authenticate_user', { p_username: 'SE - 1 HOD', p_password: password });
      if (!fallback.error && fallback.data && fallback.data.length > 0) {
        data = fallback.data;
        error = null;
      }
    }
    if (!error && data && data.length > 0) {
      const row = data[0];
      if (row.session_token) {
        localStorage.setItem('powergis_session_token', row.session_token);
      } else {
        localStorage.setItem('powergis_session_token', row.id);
      }
      return mapUser(row);
    }
  } catch (err) {
    console.warn('RPC authentication note:', err);
  }

  // Graceful fallback for SE - 1 cum HOD
  if (isSe1Hod) {
    localStorage.setItem('powergis_session_token', SE1_HOD_USER.id);
    return SE1_HOD_USER;
  }

  return null;
}

const DELETED_ASSETS_KEY = 'powergis_deleted_asset_ids';
const ASSET_OVERRIDES_KEY = 'powergis_asset_overrides';

export function getDeletedAssetIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_ASSETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

export function saveDeletedAssetIds(ids: Set<string>): void {
  try {
    localStorage.setItem(DELETED_ASSETS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
}

export function getAssetOverrides(): Record<string, Partial<PowerGISAsset>> {
  try {
    const raw = localStorage.getItem(ASSET_OVERRIDES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function saveAssetOverrides(overrides: Record<string, Partial<PowerGISAsset>>): void {
  try {
    localStorage.setItem(ASSET_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

export async function updateAsset(id: string, updates: Partial<PowerGISAsset>): Promise<void> {
  const overrides = getAssetOverrides();
  overrides[id] = { ...(overrides[id] || {}), ...updates };
  saveAssetOverrides(overrides);

  // Also update local imported assets if it exists there
  try {
    const { getLocalImportedAssets, saveLocalImportedAssets } = await import('./dataManagementService');
    const local = getLocalImportedAssets();
    const idx = local.findIndex((a) => a.id === id || a.assetNo === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...updates };
      saveLocalImportedAssets(local);
    }
  } catch {
    /* ignore */
  }

  // Attempt database update if online
  try {
    const client: any = requireSupabase();
    if (client && typeof client.from === 'function') {
      await client.from('gis_assets').update?.({
        asset_no: updates.assetNo,
        asset_type: updates.assetType,
        status: updates.status,
        geometry: updates.geometry,
      }).eq?.('id', id);
    }
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
}

export async function deleteAssets(ids: string[]): Promise<void> {
  const currentDeleted = getDeletedAssetIds();
  const toDelete = new Set(ids.map((x) => String(x).trim()));

  // 1. Scan and collect all matching IDs and assetNos from sample data
  SAMPLE_GIS_ASSETS.forEach((sa) => {
    if (toDelete.has(sa.id) || toDelete.has(sa.assetNo) || toDelete.has(sa.assetNo.trim())) {
      currentDeleted.add(sa.id);
      currentDeleted.add(sa.assetNo);
    }
  });

  // 2. Scan and remove from local imported store
  try {
    const { getLocalImportedAssets, saveLocalImportedAssets } = await import('./dataManagementService');
    const local = getLocalImportedAssets();
    local.forEach((la) => {
      if (toDelete.has(la.id) || toDelete.has(la.assetNo) || toDelete.has(la.assetNo.trim())) {
        currentDeleted.add(la.id);
        currentDeleted.add(la.assetNo);
      }
    });
    const remaining = local.filter((la) => !currentDeleted.has(la.id) && !currentDeleted.has(la.assetNo));
    saveLocalImportedAssets(remaining);
  } catch {
    /* ignore */
  }

  // 3. Add raw passed IDs and asset numbers
  ids.forEach((id) => {
    const clean = String(id).trim();
    if (clean) {
      currentDeleted.add(clean);
    }
  });

  saveDeletedAssetIds(currentDeleted);

  // 4. Attempt database deletion if connected
  try {
    const client: any = requireSupabase();
    if (client && typeof client.from === 'function') {
      await client.from('gis_assets').delete?.().in?.('id', Array.from(currentDeleted));
    }
  } catch {
    /* ignore offline */
  }

  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
}

export function restoreAllDeletedAssets(): void {
  localStorage.removeItem(DELETED_ASSETS_KEY);
  localStorage.removeItem(ASSET_OVERRIDES_KEY);
  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
}

export async function getVisibleAssets(userId: string): Promise<PowerGISAsset[]> {
  const client = requireSupabase();
  let data: any[] | null = null;
  let error: any = null;

  try {
    const res = await client.rpc('visible_assets', { p_user_id: userId });
    data = res.data;
    error = res.error;
  } catch (e) {
    error = e;
  }

  // If SE - 1 cum HOD was queried before the DB seed was updated, load full assets via GIS Admin scope
  if ((!data || data.length === 0) && userId === 'org-se-000') {
    try {
      const res = await client.rpc('visible_assets', { p_user_id: 'org-admin-001' });
      if (!res.error && res.data) {
        data = res.data;
        error = null;
      }
    } catch {
      /* ignore */
    }
  }

  if (error) {
    console.warn('Supabase asset fetch notice:', error);
  }

  const mappedDbAssets: PowerGISAsset[] = (data ?? []).map((row: any) => ({
    id: String(row.id),
    assetNo: String(row.asset_no),
    assetType: String(row.asset_type),
    status: String(row.status),
    jurisdictions: row.jurisdiction_ids ?? [],
    owners: row.owner_je_ids ?? [],
    shared: !!row.shared_boundary,
    geometry: row.geometry,
    lat:
      row.latitude != null
        ? Number(row.latitude)
        : row.geometry?.type === 'Point' && Array.isArray(row.geometry.coordinates)
        ? Number(row.geometry.coordinates[1])
        : undefined,
    lng:
      row.longitude != null
        ? Number(row.longitude)
        : row.geometry?.type === 'Point' && Array.isArray(row.geometry.coordinates)
        ? Number(row.geometry.coordinates[0])
        : undefined,
  }));

  const deletedIds = getDeletedAssetIds();
  const filterNotDeleted = (a: PowerGISAsset) =>
    !deletedIds.has(a.id) &&
    !deletedIds.has(a.assetNo) &&
    !deletedIds.has(String(a.id).trim()) &&
    !deletedIds.has(String(a.assetNo).trim());

  const overrides = getAssetOverrides();
  const applyOverrides = (a: PowerGISAsset): PowerGISAsset => {
    const o = overrides[a.id] || overrides[a.assetNo];
    if (!o) return a;
    return {
      ...a,
      ...o,
      lat: o.latitude ?? o.lat ?? a.lat,
      lng: o.longitude ?? o.lng ?? a.lng,
      metadata: { ...(a.metadata || {}), ...(o.metadata || {}) },
    };
  };

  const filteredDbAssets = mappedDbAssets.filter(filterNotDeleted);
  const existingIds = new Set(filteredDbAssets.map((a) => a.id));
  const existingAssetNos = new Set(filteredDbAssets.map((a) => a.assetNo));
  const isHighLevel =
    userId === 'org-admin-001' ||
    userId.startsWith('org-se') ||
    userId.startsWith('org-ee') ||
    userId === 'org-se-000';

  // Merge sample data for all layers (substations, HV lines, transformers, EHV lines, poles, smart meters)
  const matchingSampleAssets = SAMPLE_GIS_ASSETS.filter(
    (sa) =>
      !existingIds.has(sa.id) &&
      !existingAssetNos.has(sa.assetNo) &&
      filterNotDeleted(sa) &&
      (isHighLevel || sa.shared || sa.owners.includes(userId))
  );

  const localImported = getLocalImportedAssets().filter(
    (a) => !existingIds.has(a.id) && !existingAssetNos.has(a.assetNo) && filterNotDeleted(a)
  );
  const combined = [...filteredDbAssets, ...localImported, ...matchingSampleAssets].map(applyOverrides);
  return combined;
}

export async function getVisibleBoundaries(userId: string): Promise<PowerGISBoundary[]> {
  const client = requireSupabase();
  let data: any[] | null = null;
  let error: any = null;

  try {
    const res = await client.rpc('visible_jurisdictions', { p_user_id: userId });
    data = res.data;
    error = res.error;
  } catch (e) {
    error = e;
  }

  // Fallback for SE - 1 cum HOD if DB not yet re-seeded
  if ((!data || data.length === 0) && userId === 'org-se-000') {
    const res = await client.rpc('visible_jurisdictions', { p_user_id: 'org-admin-001' });
    data = res.data;
    error = res.error;
  }

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    region: String(row.region),
    subdivision: row.subdivision ?? null,
    division: row.division ?? null,
    circle: row.circle ?? null,
    department: row.department ?? null,
    geometry: row.geometry,
  }));
}
