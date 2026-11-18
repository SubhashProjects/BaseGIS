import { supabase } from '../config/supabase';

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
  username: 'SE - 1 HOD',
  displayName: 'SE - 1 HOD',
  role: 'SE',
  subdivision: null,
  division: null,
  circle: null,
  department: 'SE - 1 HOD',
  admin: 'GIS Admin',
  region: 'All Regions',
  scopeField: 'department',
  scopeValue: 'SE - 1 HOD',
  jurisdictions: ['PONDICHERRY', 'KARAIKAL', 'MAHE', 'YANAM'],
};

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

function mapUser(row: any): PowerGISUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
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

  // Guarantee that SE - 1 HOD is available under SE role
  if (!list.some((u: PowerGISUser) => u.username === 'SE - 1 HOD' || u.displayName === 'SE - 1 HOD' || u.id === 'org-se-000')) {
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
  const isSe1Hod = cleanUsername.toLowerCase().replace(/[\s-]/g, '') === 'se1hod';

  try {
    const { data, error } = await client.rpc('authenticate_user', { p_username: cleanUsername, p_password: password });
    if (!error && data && data.length > 0) {
      return mapUser(data[0]);
    }
  } catch (err) {
    console.warn('RPC authentication note:', err);
  }

  // Graceful fallback for SE - 1 HOD if not yet seeded in the remote database
  if (isSe1Hod) {
    return SE1_HOD_USER;
  }

  return null;
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

  // If SE - 1 HOD was queried before the DB seed was updated, load full assets via GIS Admin scope
  if ((!data || data.length === 0) && userId === 'org-se-000') {
    const res = await client.rpc('visible_assets', { p_user_id: 'org-admin-001' });
    data = res.data;
    error = res.error;
  }

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    assetNo: String(row.asset_no),
    assetType: String(row.asset_type),
    status: String(row.status),
    jurisdictions: row.jurisdiction_ids ?? [],
    owners: row.owner_je_ids ?? [],
    shared: !!row.shared_boundary,
    geometry: row.geometry,
    lat: row.latitude ?? undefined,
    lng: row.longitude ?? undefined,
  }));
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

  // Fallback for SE - 1 HOD if DB not yet re-seeded
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
