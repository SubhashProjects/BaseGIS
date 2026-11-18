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
  scopeField?: 'subdivision'|'division'|'circle'|null;
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
  return (data ?? []).map(mapUser);
}


export async function authenticateUser(username: string, password: string): Promise<PowerGISUser | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('authenticate_user', { p_username: username, p_password: password });
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? mapUser(row) : null;
}

export async function getVisibleAssets(userId: string): Promise<PowerGISAsset[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('visible_assets', { p_user_id: userId });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id), assetNo: String(row.asset_no), assetType: String(row.asset_type), status: String(row.status),
    jurisdictions: row.jurisdiction_ids ?? [], owners: row.owner_je_ids ?? [], shared: !!row.shared_boundary,
    geometry: row.geometry, lat: row.latitude ?? undefined, lng: row.longitude ?? undefined,
  }));
}

export async function getVisibleBoundaries(userId: string): Promise<PowerGISBoundary[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('visible_jurisdictions', { p_user_id: userId });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id), name: String(row.name), region: String(row.region), subdivision: row.subdivision ?? null,
    division: row.division ?? null, circle: row.circle ?? null, department: row.department ?? null, geometry: row.geometry,
  }));
}
