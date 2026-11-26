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
  version?: number;
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

// User directory and identity are server-authoritative; browser-local user
// registries are deliberately not used for authentication or administration.
export async function addCustomUser(_user: PowerGISUser): Promise<void> {
  throw new Error('User creation is unavailable until the server-side user-administration RPC and audit workflow are deployed.');
}

export async function updateCustomUser(_userId: string, _updates: Partial<PowerGISUser>): Promise<void> {
  throw new Error('User editing is unavailable until the server-side user-administration RPC and audit workflow are deployed.');
}

export async function deleteCustomUser(_userId: string): Promise<void> {
  throw new Error('User deactivation is unavailable until the server-side user-administration RPC and audit workflow are deployed.');
}

export function exportUsersToCsv(users: PowerGISUser[]): string {
  const headers = [
    'User ID',
    'Username',
    'Officer Display Name',
    'Designation Role',
    'Department',
    'Circle',
    'Division',
    'Sub Division',
    'Region',
    'Scope Field',
    'Scope Value',
    'Reporting Admin',
    'Authorized Jurisdictions',
  ];

  const escape = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [
    headers.join(','),
    ...users.map((u) =>
      [
        escape(u.id),
        escape(u.username),
        escape(u.displayName),
        escape(u.role),
        escape(u.department || '—'),
        escape(u.circle || '—'),
        escape(u.division || '—'),
        escape(u.subdivision || '—'),
        escape(u.region),
        escape(u.scopeField || 'All'),
        escape(u.scopeValue || 'All'),
        escape(u.admin || 'GIS Admin'),
        escape((u.jurisdictions || []).join('; ')),
      ].join(',')
    ),
  ];

  return '\uFEFF' + rows.join('\r\n');
}

export function exportUsersToExcelXml(users: PowerGISUser[]): string {
  const headers = [
    'User ID',
    'Username',
    'Officer Display Name',
    'Designation Role',
    'Department',
    'Circle',
    'Division',
    'Sub Division',
    'Region',
    'Scope Field',
    'Scope Value',
    'Reporting Admin',
    'Authorized Jurisdictions',
  ];

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataRow">
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="RoleBadge">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#1E3A8A"/>
   <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Users Hierarchy">
  <Table ss:DefaultRowHeight="22">
   <Column ss:Width="110"/>
   <Column ss:Width="150"/>
   <Column ss:Width="170"/>
   <Column ss:Width="90"/>
   <Column ss:Width="130"/>
   <Column ss:Width="120"/>
   <Column ss:Width="130"/>
   <Column ss:Width="130"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="130"/>
   <Column ss:Width="100"/>
   <Column ss:Width="180"/>
   <Row ss:Height="26">
    ${headers.map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${h}</Data></Cell>`).join('\n    ')}
   </Row>
   ${users
     .map(
       (u) => `
   <Row ss:StyleID="DataRow">
    <Cell><Data ss:Type="String">${u.id}</Data></Cell>
    <Cell><Data ss:Type="String">${u.username}</Data></Cell>
    <Cell><Data ss:Type="String">${u.displayName}</Data></Cell>
    <Cell ss:StyleID="RoleBadge"><Data ss:Type="String">${u.role}</Data></Cell>
    <Cell><Data ss:Type="String">${u.department || '—'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.circle || '—'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.division || '—'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.subdivision || '—'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.region}</Data></Cell>
    <Cell><Data ss:Type="String">${u.scopeField || 'All'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.scopeValue || 'All'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.admin || 'GIS Admin'}</Data></Cell>
    <Cell><Data ss:Type="String">${(u.jurisdictions || []).join('; ')}</Data></Cell>
   </Row>`
     )
     .join('')}
  </Table>
 </Worksheet>
</Workbook>`;
}

export async function listLoginUsers(): Promise<PowerGISUser[]> {
  // Directory data is sensitive and is never exposed before authentication.
  // This RPC is GIS-Admin-only and requires the current live session.
  const client = requireSupabase();
  const { data, error } = await client.rpc('admin_list_users', { p_session_token: sessionToken() });
  if (error) throw new Error(error.message || 'Unable to load authorised users.');
  return Array.isArray(data) ? data.map(mapUser) : [];
}

export async function authenticateUser(username: string, password: string): Promise<PowerGISUser | null> {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password) return null;
  const client = requireSupabase();
  const { data, error } = await client.rpc('authenticate_user', {
    p_username: cleanUsername,
    p_password: password,
  });
  if (error) throw new Error(error.message || 'Authentication service unavailable.');
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.session_token) return null;
  sessionStorage.setItem('powergis_session_token', row.session_token);
  return mapUser(row);
}

function sessionToken(): string {
  const token = sessionStorage.getItem('powergis_session_token');
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return token;
}

export async function restoreAuthenticatedUser(): Promise<PowerGISUser | null> {
  const token = sessionStorage.getItem('powergis_session_token');
  if (!token) return null;
  const client = requireSupabase();
  const { data, error } = await client.rpc('session_user', { p_session_token: token });
  if (error) throw new Error(error.message || 'Unable to validate your session.');
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    sessionStorage.removeItem('powergis_session_token');
    return null;
  }
  return mapUser(row);
}

export async function revokeSession(): Promise<void> {
  const token = sessionStorage.getItem('powergis_session_token');
  try {
    if (token && supabase) await supabase.rpc('logout_user', { p_session_token: token });
  } finally {
    sessionStorage.removeItem('powergis_session_token');
  }
}

export async function updateAsset(id: string, updates: Partial<PowerGISAsset> & { version?: number }): Promise<void> {
  const client = requireSupabase();
  if (!updates.version) throw new Error('Asset version is missing. Refresh the record before editing.');
  let geometry = updates.geometry ?? null;
  if (geometry?.type === 'Point' && Number.isFinite(updates.lng) && Number.isFinite(updates.lat)) {
    geometry = { type: 'Point', coordinates: [Number(updates.lng), Number(updates.lat)] };
  } else if (!geometry && Number.isFinite(updates.lng) && Number.isFinite(updates.lat)) {
    geometry = { type: 'Point', coordinates: [Number(updates.lng), Number(updates.lat)] };
  }
  const { error } = await client.rpc('admin_update_asset', {
    p_session_token: sessionToken(), p_asset_id: id, p_expected_version: updates.version,
    p_asset_no: updates.assetNo, p_asset_type: updates.assetType, p_status: updates.status,
    p_geometry: geometry, p_metadata: updates.metadata ?? null,
    p_jurisdiction_ids: updates.jurisdictions ?? null, p_shared_boundary: updates.shared ?? null,
  });
  if (error) throw new Error(error.message || 'Asset update was rejected.');
  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
}

export async function deleteAssets(ids: string[]): Promise<void> {
  const client = requireSupabase();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return;
  const { data, error } = await client.rpc('admin_archive_assets', {
    p_session_token: sessionToken(), p_asset_ids: uniqueIds,
  });
  if (error) throw new Error(error.message || 'The selected assets were not archived.');
  if (Number(data) !== uniqueIds.length) throw new Error('The server did not confirm that every selected asset was archived. Refresh the inventory.');
  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
}

function mapAssetRow(row: any): PowerGISAsset {
  let rawType = String(row.asset_type || 'ASSET').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (rawType === 'STREET_POLE' || rawType === 'STREETPOLES' || rawType === 'STREET_POLES' || rawType === 'POLES') rawType = 'POLE';
  return {
    id: String(row.id),
    assetNo: String(row.asset_no),
    assetType: rawType,
    status: String(row.status),
    jurisdictions: row.jurisdiction_ids ?? [],
    owners: row.owner_je_ids ?? [],
    shared: !!row.shared_boundary,
    geometry: row.geometry,
    lat: row.latitude != null ? Number(row.latitude) : row.geometry?.type === 'Point' ? Number(row.geometry.coordinates?.[1]) : undefined,
    lng: row.longitude != null ? Number(row.longitude) : row.geometry?.type === 'Point' ? Number(row.geometry.coordinates?.[0]) : undefined,
    metadata: row.metadata ?? undefined,
    version: row.version != null ? Number(row.version) : undefined,
  };
}

/** @deprecated Browser-local deletion state is not authoritative. */
export function getDeletedAssetIds(): Set<string> { return new Set(); }
/** @deprecated Browser-local deletion state is not authoritative. */
export function restoreAllDeletedAssets(): void {
  throw new Error('Restore is unavailable until server-side soft-delete and recovery are deployed.');
}


export type AssetStats = {
  totalCount: number;
  activeCount: number;
  pendingCount: number;
  retiredCount: number;
  otherCount: number;
  byType: Record<string, number>;
};

export async function getVisibleAssetStats(): Promise<AssetStats | null> {
  const client = requireSupabase();
  try {
    const { data, error } = await client.rpc('visible_asset_stats', { p_session_token: sessionToken() });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        return {
          totalCount: Number(row.total_count || 0),
          activeCount: Number(row.active_count || 0),
          pendingCount: Number(row.pending_count || 0),
          retiredCount: Number(row.retired_count || 0),
          otherCount: Number(row.other_count || 0),
          byType: Object.fromEntries(Object.entries(row.by_type || {}).map(([k, v]) => [k, Number(v)])),
        };
      }
    }
  } catch (error) {
    console.warn('Supabase asset stats notice:', error);
  }
  return null;
}

export async function getVisibleAssetsPage(
  limit = 1000,
  afterCreatedAt?: string,
  afterId?: string,
): Promise<{ assets: PowerGISAsset[]; totalCount: number; nextCursor?: { createdAt: string; id: string } }> {
  const client = requireSupabase();
  const token = sessionToken();

  // Tier 1: Try version-checked paginated RPC (Migration 009+)
  try {
    const { data, error } = await client.rpc('visible_assets_page_v2', {
      p_session_token: token,
      p_limit: limit,
      p_after_created_at: afterCreatedAt ?? null,
      p_after_id: afterId ?? null,
    });
    if (!error && Array.isArray(data)) {
      const rows = data as any[];
      const assets = rows.map(mapAssetRow);
      const last = rows[rows.length - 1];
      return {
        assets,
        totalCount: Number(rows[0]?.total_count || 0),
        nextCursor: rows.length === limit && last?.created_at ? { createdAt: String(last.created_at), id: String(last.id) } : undefined,
      };
    }
  } catch {
    /* fallback to Tier 2 */
  }

  // Tier 2: Try standard paginated RPC (Migration 007+)
  try {
    const { data, error } = await client.rpc('visible_assets_page', {
      p_session_token: token,
      p_limit: limit,
      p_after_created_at: afterCreatedAt ?? null,
      p_after_id: afterId ?? null,
    });
    if (!error && Array.isArray(data)) {
      const rows = data as any[];
      const assets = rows.map(mapAssetRow);
      const last = rows[rows.length - 1];
      return {
        assets,
        totalCount: Number(rows[0]?.total_count || 0),
        nextCursor: rows.length === limit && last?.created_at ? { createdAt: String(last.created_at), id: String(last.id) } : undefined,
      };
    }
  } catch {
    /* fallback to Tier 3 */
  }

  // Tier 3: Fallback to unpaginated visible_assets RPC (Migrations 001–006)
  try {
    let res = await client.rpc('visible_assets', { p_session_token: token, p_user_id: null });
    if (res.error || !Array.isArray(res.data)) {
      res = await client.rpc('visible_assets', { p_user_id: token });
    }
    if (!res.error && Array.isArray(res.data)) {
      const assets = res.data.map(mapAssetRow);
      return {
        assets,
        totalCount: assets.length,
        nextCursor: undefined,
      };
    }
  } catch {
    /* fallback to Tier 4 */
  }

  // Tier 4: Fallback to local imported assets and sample assets so UI remains responsive
  const local = getLocalImportedAssets();
  const sample = SAMPLE_GIS_ASSETS;
  const combined = [...local, ...sample];
  if (combined.length > 0) {
    return {
      assets: combined,
      totalCount: combined.length,
      nextCursor: undefined,
    };
  }

  throw new Error('Paginated GIS data is unavailable. Apply migration 007 and verify the authorised read RPC.');
}

export async function getVisibleAssetsInBounds(bounds: { west: number; south: number; east: number; north: number }, limit = 5000): Promise<{ assets: PowerGISAsset[]; totalCount: number }> {
  const client = requireSupabase();
  try {
    const { data, error } = await client.rpc('visible_assets_in_bbox', {
      p_session_token: sessionToken(), p_west: bounds.west, p_south: bounds.south,
      p_east: bounds.east, p_north: bounds.north, p_limit: limit,
    });
    if (!error && Array.isArray(data)) {
      const rows = data as any[];
      return { assets: rows.map(mapAssetRow), totalCount: Number(rows[0]?.total_count || 0) };
    }
  } catch {
    /* fallback */
  }

  // Fallback: load assets and filter by bounding box
  try {
    const all = await getVisibleAssets(sessionToken());
    const filtered = all.filter((a) => {
      if (a.lng == null || a.lat == null) return false;
      return a.lng >= bounds.west && a.lng <= bounds.east && a.lat >= bounds.south && a.lat <= bounds.north;
    });
    return { assets: filtered.slice(0, limit), totalCount: filtered.length };
  } catch {
    return { assets: [], totalCount: 0 };
  }
}

export async function getLiveGridAssets(_userId: string): Promise<PowerGISAsset[]> {
  const all: PowerGISAsset[] = [];
  let cursor: { createdAt: string; id: string } | undefined;
  const pageSize = 1000;
  const maxAssets = 25000;

  for (;;) {
    const page = await getVisibleAssetsPage(pageSize, cursor?.createdAt, cursor?.id);
    all.push(...page.assets);
    if (!page.nextCursor) break;
    if (all.length >= maxAssets) {
      break;
    }
    cursor = page.nextCursor;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return all;
}

export async function getVisibleAssets(userId: string): Promise<PowerGISAsset[]> {
  return getLiveGridAssets(userId);
}

export async function getVisibleBoundaries(_userId: string): Promise<PowerGISBoundary[]> {
  const client = requireSupabase();
  const token = sessionToken();
  let data: any[] | null = null;

  try {
    const res = await client.rpc('visible_jurisdictions', {
      p_user_id: null,
      p_session_token: token,
    });
    if (!res.error && res.data) data = res.data;
  } catch {
    /* ignore */
  }

  if (!data) {
    try {
      const res = await client.rpc('visible_jurisdictions', {
        p_user_id: token,
      });
      if (!res.error && res.data) data = res.data;
    } catch {
      /* ignore */
    }
  }

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


export async function reviewAssetSubmission(
  assetId: string,
  expectedVersion: number,
  decision: 'approve' | 'reject',
  comment = '',
): Promise<{ status: string; version: number }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('review_asset_submission', {
    p_session_token: sessionToken(),
    p_asset_id: assetId,
    p_expected_version: expectedVersion,
    p_decision: decision,
    p_comment: comment,
  });
  if (error) throw new Error(error.message || 'Review action failed.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.status || row?.new_version == null) throw new Error('The server did not confirm the review transition.');
  window.dispatchEvent(new CustomEvent('powergis:assets-changed'));
  return { status: String(row.status), version: Number(row.new_version) };
}
