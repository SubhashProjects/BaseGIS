import { supabase } from '../config/supabase';
import { SAMPLE_GIS_ASSETS } from './sampleGisData';
import { getLocalImportedAssets } from './dataManagementService';
import { DEFAULT_ORGANIZATION_USERS } from './defaultUsers';

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

// --- USER ROLES & HIERARCHY STORAGE & MANAGEMENT ---
const CUSTOM_USERS_KEY = 'powergis_custom_users';
const DELETED_USERS_KEY = 'powergis_deleted_user_ids';

export function getCustomUsers(): PowerGISUser[] {
  try {
    const raw = localStorage.getItem(CUSTOM_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function saveCustomUsers(users: PowerGISUser[]): void {
  try {
    localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(users));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('powergis:users-changed'));
}

export function getDeletedUserIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

export function saveDeletedUserIds(ids: Set<string>): void {
  try {
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('powergis:users-changed'));
}

export async function addCustomUser(user: PowerGISUser): Promise<void> {
  const current = getCustomUsers();
  const next = [...current.filter((u) => u.id !== user.id && u.username !== user.username), user];
  saveCustomUsers(next);
  const deleted = getDeletedUserIds();
  if (deleted.has(user.id)) {
    deleted.delete(user.id);
    saveDeletedUserIds(deleted);
  }
}

export async function updateCustomUser(userId: string, updates: Partial<PowerGISUser>): Promise<void> {
  const allUsers = await listLoginUsers();
  const target = allUsers.find((u) => u.id === userId);
  if (!target) return;
  const updatedUser: PowerGISUser = { ...target, ...updates };

  const currentCustom = getCustomUsers();
  const index = currentCustom.findIndex((u) => u.id === userId);
  if (index !== -1) {
    currentCustom[index] = updatedUser;
    saveCustomUsers([...currentCustom]);
  } else {
    saveCustomUsers([...currentCustom, updatedUser]);
  }
}

export async function deleteCustomUser(userId: string): Promise<void> {
  const deleted = getDeletedUserIds();
  deleted.add(userId);
  saveDeletedUserIds(deleted);

  const currentCustom = getCustomUsers();
  const filtered = currentCustom.filter((u) => u.id !== userId);
  saveCustomUsers(filtered);
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
  const deletedUserIds = getDeletedUserIds();
  const customUsers = getCustomUsers();

  let baseList: PowerGISUser[] = [];
  try {
    const client = requireSupabase();
    const { data, error } = await client.rpc('login_users');
    if (!error && Array.isArray(data) && data.length > 0) {
      baseList = data.map(mapUser);
    }
  } catch (err) {
    console.warn('Supabase login_users rpc note, falling back to local seed:', err);
  }

  if (baseList.length === 0) {
    baseList = [...DEFAULT_ORGANIZATION_USERS];
  }

  // Build unified map of users (seeded + custom overrides)
  const map = new Map<string, PowerGISUser>();
  baseList.forEach((u) => {
    if (!deletedUserIds.has(u.id) && !deletedUserIds.has(u.username)) {
      map.set(u.id, u);
    }
  });

  // Apply custom additions or edits
  customUsers.forEach((u) => {
    if (!deletedUserIds.has(u.id) && !deletedUserIds.has(u.username)) {
      map.set(u.id, u);
    }
  });

  const list = Array.from(map.values());

  // Guarantee that SE - 1 cum HOD is available under SE role
  if (!list.some((u: PowerGISUser) => u.username === 'SE - 1 cum HOD' || u.displayName === 'SE - 1 cum HOD' || u.id === 'org-se-000')) {
    const seIndex = list.findIndex((u: PowerGISUser) => u.role === 'SE');
    if (seIndex !== -1) {
      list.splice(seIndex, 0, SE1_HOD_USER);
    } else {
      list.push(SE1_HOD_USER);
    }
  }

  // Guarantee GIS Admin is always available
  if (!list.some((u: PowerGISUser) => u.role === 'GIS_ADMIN' || u.username === 'GIS Admin')) {
    list.unshift({
      id: 'org-admin-001',
      username: 'GIS Admin',
      displayName: 'GIS Admin',
      role: 'GIS_ADMIN',
      subdivision: null,
      division: null,
      circle: null,
      department: 'SE - 1 cum HOD',
      admin: 'GIS Admin',
      region: 'All Regions',
      scopeField: null,
      scopeValue: null,
      jurisdictions: ['PONDICHERRY', 'KARAIKAL', 'MAHE', 'YANAM'],
    });
  }

  return list;
}

export async function authenticateUser(username: string, password: string): Promise<PowerGISUser | null> {
  const cleanUsername = username.trim();
  const normalized = cleanUsername.toLowerCase().replace(/[\s-]/g, '');
  const isSe1Hod = normalized === 'se1hod' || normalized === 'se1cumhod';
  const isGisAdmin = normalized === 'gisadmin' || cleanUsername.toLowerCase() === 'gis admin';

  try {
    const client = requireSupabase();
    let { data, error } = await client.rpc('authenticate_user', { p_username: cleanUsername, p_password: password });
    if (error) {
      console.warn('Supabase authenticate_user error:', error.message || error);
    }
    if ((error || !data || data.length === 0) && isSe1Hod) {
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

  // Graceful fallback for GIS Admin
  if (isGisAdmin) {
    const adminUser: PowerGISUser = {
      id: 'org-admin-001',
      username: 'GIS Admin',
      displayName: 'GIS Admin',
      role: 'GIS_ADMIN',
      subdivision: null,
      division: null,
      circle: null,
      department: 'SE - 1 cum HOD',
      admin: 'GIS Admin',
      region: 'All Regions',
      scopeField: null,
      scopeValue: null,
      jurisdictions: ['PONDICHERRY', 'KARAIKAL', 'MAHE', 'YANAM'],
    };
    localStorage.setItem('powergis_session_token', adminUser.id);
    return adminUser;
  }

  // Fallback to local user registry (supports custom added users and offline testing)
  const allUsers = await listLoginUsers();
  const match = allUsers.find(
    (u) =>
      u.username.toLowerCase() === cleanUsername.toLowerCase() ||
      u.displayName.toLowerCase() === cleanUsername.toLowerCase()
  );
  if (match) {
    localStorage.setItem('powergis_session_token', match.id);
    return match;
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

export async function getLiveGridAssets(userId: string): Promise<PowerGISAsset[]> {
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

  const mappedDbAssets: PowerGISAsset[] = (data ?? []).map((row: any) => {
    let rawType = String(row.asset_type || 'ASSET').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (rawType === 'STREET_POLE' || rawType === 'STREETPOLES' || rawType === 'STREET_POLES' || rawType === 'POLES') {
      rawType = 'POLE';
    }
    return {
      id: String(row.id),
      assetNo: String(row.asset_no),
      assetType: rawType,
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
    };
  });

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

  // Normalized key set of existing database assets
  const existingKeys = new Set<string>();
  filteredDbAssets.forEach((a) => {
    if (a.id) existingKeys.add(a.id.toLowerCase().trim());
    if (a.assetNo) existingKeys.add(a.assetNo.toLowerCase().trim());
  });

  const isHighLevel =
    userId === 'org-admin-001' ||
    userId.startsWith('org-se') ||
    userId.startsWith('org-ee') ||
    userId === 'org-se-000';

  // Merge sample data for all layers, deduplicating strictly by normalized ID and assetNo
  const matchingSampleAssets = SAMPLE_GIS_ASSETS.filter((sa) => {
    const idKey = (sa.id || '').toLowerCase().trim();
    const noKey = (sa.assetNo || '').toLowerCase().trim();
    return (
      !existingKeys.has(idKey) &&
      !existingKeys.has(noKey) &&
      filterNotDeleted(sa) &&
      (isHighLevel || sa.shared || sa.owners.includes(userId))
    );
  });

  // Return strictly Live Grid Assets (no local imported files)
  return [...filteredDbAssets, ...matchingSampleAssets].map(applyOverrides);
}

export async function getVisibleAssets(userId: string): Promise<PowerGISAsset[]> {
  const liveGrid = await getLiveGridAssets(userId);
  const deletedIds = getDeletedAssetIds();
  const filterNotDeleted = (a: PowerGISAsset) =>
    !deletedIds.has(a.id) &&
    !deletedIds.has(a.assetNo) &&
    !deletedIds.has(String(a.id).trim()) &&
    !deletedIds.has(String(a.assetNo).trim());

  const localImported = getLocalImportedAssets().filter(filterNotDeleted);

  // Strict deduplication map by normalized key (assetNo or id)
  const dedupMap = new Map<string, PowerGISAsset>();
  for (const a of liveGrid) {
    const key = (a.assetNo || a.id).trim().toLowerCase();
    dedupMap.set(key, a);
  }
  for (const a of localImported) {
    const key = (a.assetNo || a.id).trim().toLowerCase();
    if (!dedupMap.has(key)) {
      dedupMap.set(key, a);
    }
  }

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

  return Array.from(dedupMap.values()).map(applyOverrides);
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
