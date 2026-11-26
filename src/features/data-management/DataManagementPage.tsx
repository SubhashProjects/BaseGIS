import { useState, useMemo, useEffect, useRef } from 'react';
import {
  DatabaseBackup,
  FileUp,
  Download,
  Trash2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayerIconGlyph,
  ShieldCheck,
  Pencil,
  Save,
  Plus,
  RotateCcw,
  Users,
} from '../../components/icons';
import { useGisLayers } from '../../services/layerService';
import { DataManagementPanel } from '../admin/DataManagementPanel';
import {
  getLocalImportedAssets,
  downloadBlob,
} from '../../services/dataManagementService';
import {
  deleteAssets,
  updateAsset,
  getDeletedAssetIds,
  getLiveGridAssets,
  listLoginUsers,
  addCustomUser,
  updateCustomUser,
  deleteCustomUser,
  exportUsersToCsv,
  exportUsersToExcelXml,
  type PowerGISAsset,
  type PowerGISUser,
} from '../../services/powergisData';

// Embedded schema metadata analyzed locally from c:\Users\HARISH VYAS\Project\BaseGIS\New folder
interface FileSchemaInfo {
  name: string;
  format: string;
  count: number | string;
  geomType: string;
  primaryKey: string;
  properties: string[];
  description: string;
}

const NEW_FOLDER_SCHEMAS: FileSchemaInfo[] = [
  {
    name: 'CurrentTransformer',
    format: 'GeoJSON / KML',
    count: 68,
    geomType: 'Point',
    primaryKey: 'CT_AIN / asset_no',
    properties: ['CT_AIN', 'CT_NAME', 'CT_SS_NAME', 'CT_FDR_NAM', 'CT_TYPE', 'CT_STATUS', 'CT_RT_AV', 'CT_R_MAKE', 'CT_KP_VOLT', 'asset_no', 'asset_type', 'status'],
    description: 'Current Transformers installed across Puducherry substations with ratio and manufacturer ratings.',
  },
  {
    name: 'Distribution_Transformer',
    format: 'GeoJSON / KML',
    count: 858,
    geomType: 'Point',
    primaryKey: 'DT_AIN / asset_no',
    properties: ['DT_AIN', 'DT_NAME', 'DT_SS_NAME', 'DT_FDR_NAM', 'DT_CC_KVA', 'DT_VOLT_RA', 'DT_MAKE', 'DT_MOUNT', 'DT_HVSV_KV', 'DT_LVSV_KV', 'asset_no', 'asset_type', 'status'],
    description: 'Distribution transformers serving town, rural and industrial loads with capacity ratings in kVA.',
  },
  {
    name: 'DT-Feeder boundary',
    format: 'CSV / GeoJSON',
    count: 169,
    geomType: 'Polygon',
    primaryKey: 'name / asset_no',
    properties: ['name', 'feeder', 'st_astext (WKT MULTIPOLYGON ZM)', 'asset_no', 'asset_type', 'status'],
    description: 'Geographic polygon boundaries for 11kV distribution transformer feeder coverage zones.',
  },
  {
    name: 'DTFeederLocation',
    format: 'GeoJSON / GPKG',
    count: 3442,
    geomType: 'Point',
    primaryKey: 'fid / asset_no',
    properties: ['fid', 'name', 'layer', 'vilnam_soi', 'tname', 'sname', 'dname', 'vname', 'villcode', 'sdtcode', 'dtcode', 'stcode', 'asset_no', 'asset_type'],
    description: 'Comprehensive point locations for all distribution transformer feeder nodes in Puducherry.',
  },
  {
    name: 'Feeder_Meter',
    format: 'GeoJSON / KML',
    count: 28,
    geomType: 'Point',
    primaryKey: 'FM_AIN / asset_no',
    properties: ['FM_AIN', 'FM_SS_NAME', 'FM_FDR_NAM', 'FM_TYPE', 'FM_MAKE', 'FM_MODEL', 'FM_VOLT_KV', 'FM_CLASS', 'FM_DLMS', 'asset_no', 'asset_type', 'status'],
    description: 'Substation and feeder meters with DLMS compliance, accuracy class and CT/PT ratio metadata.',
  },
  {
    name: 'HT feeders - Distribution Transformers',
    format: 'CSV / GeoJSON',
    count: 664,
    geomType: 'LineString',
    primaryKey: 'name / layer / asset_no',
    properties: ['name', 'layer', 'descriptio', 'st_astext (WKT MULTILINESTRING ZM)', 'asset_no', 'asset_type', 'status'],
    description: 'High-tension 11kV and 22kV overhead line paths connecting substations to distribution transformers.',
  },
  {
    name: 'HT feeders-Transmission and Distribution',
    format: 'CSV / GeoJSON',
    count: 2461,
    geomType: 'LineString',
    primaryKey: 'name / layer / asset_no',
    properties: ['name', 'layer', 'vilnam_soi', 'tname', 'sname', 'dname', 'vname', 'villcode', 'st_astext (WKT MULTILINESTRING ZM)', 'asset_no', 'asset_type', 'status'],
    description: 'Complete high-tension grid distribution routes spanning villages and administrative taluks.',
  },
  {
    name: 'HTfeedersDistributionTransformers',
    format: 'GeoJSON / GPKG',
    count: '664+',
    geomType: 'LineString',
    primaryKey: 'fid / asset_no',
    properties: ['fid', 'layer', 'length_km', 'voltage_kv', 'source_ss', 'asset_no', 'asset_type'],
    description: 'Geopackage binary dataset for HT feeders and distribution lines.',
  },
  {
    name: 'LT',
    format: 'GeoJSON / KML',
    count: 2,
    geomType: 'Point',
    primaryKey: 'LTC_CIN / asset_no',
    properties: ['LTC_CIN', 'LTC_CON_NA', 'LTC_TARIFF', 'LTC_AREA', 'LTC_PINCOD', 'LTC_SLOAD_', 'LTC_MT_MAK', 'LTC_DT_NAM', 'LTC_FDR_NA', 'asset_no', 'asset_type', 'status'],
    description: 'Low-tension consumer connection points with connected load, tariff category and meter serials.',
  },
  {
    name: 'Power_Transformer',
    format: 'GeoJSON / KML',
    count: 13,
    geomType: 'Point',
    primaryKey: 'PTR_AIN / asset_no',
    properties: ['PTR_AIN', 'PTR_NAME', 'PTR_SS_NAM', 'PTR_MAKE', 'PTR_CAP_MV', 'PTR_HSV_KV', 'PTR_LSV_KV', 'PTR_STATUS', 'PTR_COOL_T', 'asset_no', 'asset_type', 'status'],
    description: 'Primary power transformers located at 110/22kV and 110/11kV grid substations.',
  },
  {
    name: 'Substations',
    format: 'CSV / GeoJSON',
    count: 40,
    geomType: 'Polygon',
    primaryKey: 'name / asset_no',
    properties: ['name', 'layer', 'vilnam_soi', 'tname', 'sname', 'dname', 'st_astext (WKT MULTIPOLYGON ZM)', 'asset_no', 'asset_type', 'status'],
    description: 'Boundary footprints for all EHV and distribution substations in the Puducherry region.',
  },
  {
    name: 'Transmission Lines',
    format: 'CSV / GeoJSON',
    count: 44,
    geomType: 'LineString',
    primaryKey: 'name / asset_no',
    properties: ['name', 'layer', 'vilnam_soi', 'tname', 'sname', 'dname', 'vname', 'villcode', 'st_astext (WKT MULTILINESTRING ZM)', 'asset_no', 'asset_type', 'status'],
    description: '110kV and 230kV extra-high-voltage transmission corridors connecting regional grid points.',
  },
  {
    name: 'TransmissionTowers',
    format: 'GeoJSON / GPKG',
    count: 765,
    geomType: 'Point',
    primaryKey: 'fid / asset_no',
    properties: ['fid', 'name', 'layer', 'vilnam_soi', 'tname', 'sname', 'dname', 'villcode', 'asset_no', 'asset_type'],
    description: 'Transmission lattice tower locations supporting extra-high-voltage transmission circuits.',
  },
  {
    name: 'Pillar_ways',
    format: 'KML / XML',
    count: 3648,
    geomType: 'Point',
    primaryKey: 'PILLAR_WAY / PILLAR_W_1 / OBJECTID',
    properties: [
      'OBJECTID',
      'PILLAR_WAY',
      'PILLAR_W_1',
      'PILLAR_W_2 (Region)',
      'PILLAR_W_3 (Division EE - IV)',
      'PILLAR_W_4 (Subdivision KALAPET)',
      'PILLAR_W_5 (KALAPET O & M)',
      'PILLAR_W_6 (Substation KALAPET 110/22 SS)',
      'PILLAR_W_7 (Feeder KC KULAM)',
      'PILLAR_W_8 (Locality)',
      'PILLAR_W_9',
      'PILLAR__10',
      'PILLAR__11',
      'PILLAR__18',
      'PILLAR__20',
      'PILLAR__21',
      'PILLAR__22',
      'PILLAR__23 (Connected DT)',
      'PILLAR__24',
      'Enabled',
    ],
    description: 'Low-tension pillar ways connecting distribution transformers to end consumer service points across Puducherry.',
  },
  {
    name: 'Street Poles',
    format: 'CSV / GPKG (StreetPoles.gpkg)',
    count: 79636,
    geomType: 'Point',
    primaryKey: 'fid / type_of_pole + connect_feeder',
    properties: [
      'type_of_pole',
      'voltage',
      'additional_information',
      'number_of_lines',
      'street_light',
      'connect_dt',
      'connect_feeder',
      'inserted_by',
      'inserted_date',
      'st_astext (POINT WKT)',
    ],
    description: 'Complete island/regional electrical distribution street poles dataset with voltage ratings, line count, and feeding substation/DT.',
  },
  {
    name: 'PoleMap25',
    format: 'QGZ (QGIS Project Archive)',
    count: '79,636 features ref',
    geomType: 'Point',
    primaryKey: 'PoleMap25.qgs / fOTuMl_styles.db',
    properties: [
      'type_of_pole',
      'voltage',
      'connect_feeder',
      'connect_dt',
      'symbology_rules',
      'layer_definitions',
    ],
    description: 'QGIS cartographic styling and symbology project container for Puducherry street poles.',
  },
];

type TabMode = 'tables' | 'users' | 'import' | 'schemas';
type SortKey = 'assetNo' | 'assetType' | 'status' | 'geometry' | 'jurisdiction';

export function DataManagementPage({ currentUser }: { currentUser: PowerGISUser }) {
  const { layers, layerLabels, layerColors, layerIcons } = useGisLayers();

  const [activeTab, setActiveTab] = useState<TabMode>('tables');
  const [liveGridAssets, setLiveGridAssets] = useState<PowerGISAsset[]>([]);
  const [loadError, setLoadError] = useState('');
  const [localAssets, setLocalAssets] = useState<PowerGISAsset[]>(getLocalImportedAssets);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(getDeletedAssetIds);

  // User Roles & Hierarchy state
  const [usersList, setUsersList] = useState<PowerGISUser[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [userRegionFilter, setUserRegionFilter] = useState<string>('ALL');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userPage, setUserPage] = useState<number>(1);
  const [userPageSize, setUserPageSize] = useState<number>(25);

  // User Add/Edit modal state
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormUsername, setUserFormUsername] = useState<string>('');
  const [userFormDisplayName, setUserFormDisplayName] = useState<string>('');
  const [userFormRole, setUserFormRole] = useState<string>('JE');
  const [userFormRegion, setUserFormRegion] = useState<string>('Pondicherry');
  const [userFormDepartment, setUserFormDepartment] = useState<string>('SE - 1 cum HOD');
  const [userFormCircle, setUserFormCircle] = useState<string>('SE - 3 O&M');
  const [userFormDivision, setUserFormDivision] = useState<string>('EE - Urban');
  const [userFormSubdivision, setUserFormSubdivision] = useState<string>('AEE- Town I');
  const [userFormScopeField, setUserFormScopeField] = useState<string>('');
  const [userFormScopeValue, setUserFormScopeValue] = useState<string>('');
  const [userFormJurisdictions, setUserFormJurisdictions] = useState<string>('PONDICHERRY');
  const [userFormAdmin, setUserFormAdmin] = useState<string>('GIS Admin');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Table View state
  const [dataSource, setDataSource] = useState<'ALL' | 'LIVE' | 'IMPORTED'>('ALL');
  const [filterLayer, setFilterLayer] = useState<string>('ALL');
  const [filterGeom, setFilterGeom] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortField, setSortField] = useState<SortKey>('assetNo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Inspector modal state
  const [inspectedAsset, setInspectedAsset] = useState<PowerGISAsset | null>(null);

  // Asset Editing modal state (for GIS Admin)
  const [editingAsset, setEditingAsset] = useState<PowerGISAsset | null>(null);
  const [editAssetNo, setEditAssetNo] = useState<string>('');
  const [editAssetType, setEditAssetType] = useState<string>('');
  const [editStatus, setEditStatus] = useState<string>('ACTIVE');
  const [editLat, setEditLat] = useState<string>('');
  const [editLng, setEditLng] = useState<string>('');
  const [editJurisdiction, setEditJurisdiction] = useState<string>('');
  const [editShared, setEditShared] = useState<boolean>(true);
  const [editMetadata, setEditMetadata] = useState<Record<string, any>>({});
  const [newMetaKey, setNewMetaKey] = useState<string>('');
  const [newMetaVal, setNewMetaVal] = useState<string>('');

  const openEditModal = (asset: PowerGISAsset) => {
    setEditingAsset(asset);
    setEditAssetNo(asset.assetNo || '');
    setEditAssetType(asset.assetType || '');
    setEditStatus(asset.status || 'ACTIVE');
    setEditLat(
      asset.latitude !== undefined
        ? String(asset.latitude)
        : asset.lat !== undefined
        ? String(asset.lat)
        : ''
    );
    setEditLng(
      asset.longitude !== undefined
        ? String(asset.longitude)
        : asset.lng !== undefined
        ? String(asset.lng)
        : ''
    );
    setEditJurisdiction((asset.jurisdictions || []).join(', '));
    setEditShared(asset.shared ?? true);
    setEditMetadata(asset.metadata ? { ...asset.metadata } : {});
    setNewMetaKey('');
    setNewMetaVal('');
  };

  const handleSaveAsset = async () => {
    if (!editingAsset || !editAssetNo.trim()) return;
    const parsedLat = parseFloat(editLat);
    const parsedLng = parseFloat(editLng);
    const jurs = editJurisdiction.split(',').map((s) => s.trim()).filter(Boolean);

    try {
      await updateAsset(editingAsset.id, {
        version: editingAsset.version,
        geometry: editingAsset.geometry,
        assetNo: editAssetNo.trim(),
        assetType: editAssetType,
        status: editStatus as any,
        lat: Number.isFinite(parsedLat) ? parsedLat : editingAsset.lat,
        lng: Number.isFinite(parsedLng) ? parsedLng : editingAsset.lng,
        latitude: Number.isFinite(parsedLat) ? parsedLat : editingAsset.latitude,
        longitude: Number.isFinite(parsedLng) ? parsedLng : editingAsset.longitude,
        jurisdictions: jurs.length > 0 ? jurs : editingAsset.jurisdictions,
        shared: editShared,
        metadata: editMetadata,
      });
      setEditingAsset(null);
    } catch (error: any) {
      alert(error?.message || 'Asset update was not saved.');
    }
  };

  const handleDeleteSingle = async (id: string, name: string) => {
    if (window.confirm(`Delete asset "${name}"? This will remove it from the map, table, and storage.`)) {
      try {
        await deleteAssets([id]);
      } catch (error: any) {
        alert(error?.message || 'Asset deletion was not saved.');
        return;
      }
      setDeletedIds(getDeletedAssetIds());
      if (editingAsset?.id === id) setEditingAsset(null);
      if (inspectedAsset?.id === id) setInspectedAsset(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Initial data and asset sync
  useEffect(() => {
    const refreshData = () => {
      setLocalAssets(getLocalImportedAssets());
      setDeletedIds(getDeletedAssetIds());
      void getLiveGridAssets(currentUser.id).then((assets) => { setLiveGridAssets(assets); setLoadError(''); }).catch((error: any) => setLoadError(error?.message || 'Unable to load authorised GIS assets.'));
    };
    refreshData();
    window.addEventListener('powergis:assets-changed', refreshData);
    return () => {
      window.removeEventListener('powergis:assets-changed', refreshData);
    };
  }, [currentUser.id]);

  // Initial users sync
  useEffect(() => {
    const refreshUsers = () => {
      listLoginUsers().then(setUsersList).catch(() => setUsersList([]));
    };
    refreshUsers();
    window.addEventListener('powergis:users-changed', refreshUsers);
    return () => {
      window.removeEventListener('powergis:users-changed', refreshUsers);
    };
  }, []);

  // Pure Live Grid and Imported count helpers
  const liveOnlyAssets = useMemo(
    () =>
      liveGridAssets.filter(
        (a) =>
          !deletedIds.has(a.id) &&
          !deletedIds.has(a.assetNo) &&
          !deletedIds.has(String(a.id).trim()) &&
          !deletedIds.has(String(a.assetNo).trim())
      ),
    [liveGridAssets, deletedIds]
  );
  const importedOnlyAssets = useMemo(
    () =>
      localAssets.filter(
        (a) =>
          !deletedIds.has(a.id) &&
          !deletedIds.has(a.assetNo) &&
          !deletedIds.has(String(a.id).trim()) &&
          !deletedIds.has(String(a.assetNo).trim())
      ),
    [localAssets, deletedIds]
  );

  // Combine live grid and local imported assets with strict zero-duplication deduplication
  const combinedAssets = useMemo(() => {
    if (dataSource === 'LIVE') return liveOnlyAssets;
    if (dataSource === 'IMPORTED') return importedOnlyAssets;

    // 'ALL': Deduplicate strictly by normalized assetNo or id
    const map = new Map<string, PowerGISAsset>();
    liveOnlyAssets.forEach((a) => {
      const key = (a.assetNo || a.id).trim().toLowerCase();
      map.set(key, a);
    });
    importedOnlyAssets.forEach((a) => {
      const key = (a.assetNo || a.id).trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, a);
      }
    });
    return Array.from(map.values());
  }, [liveOnlyAssets, importedOnlyAssets, dataSource]);

  // --- USER ROLES & HIERARCHY MODAL HANDLERS ---
  const openAddUserModal = () => {
    setEditingUserId(null);
    setUserFormUsername('');
    setUserFormDisplayName('');
    setUserFormRole('JE');
    setUserFormRegion('Pondicherry');
    setUserFormDepartment('SE - 1 cum HOD');
    setUserFormCircle('SE - 3 O&M');
    setUserFormDivision('EE - Urban');
    setUserFormSubdivision('AEE- Town I');
    setUserFormScopeField('');
    setUserFormScopeValue('');
    setUserFormJurisdictions('PONDICHERRY');
    setUserFormAdmin('GIS Admin');
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (u: PowerGISUser) => {
    setEditingUserId(u.id);
    setUserFormUsername(u.username);
    setUserFormDisplayName(u.displayName);
    setUserFormRole(u.role);
    setUserFormRegion(u.region || 'Pondicherry');
    setUserFormDepartment(u.department || '');
    setUserFormCircle(u.circle || '');
    setUserFormDivision(u.division || '');
    setUserFormSubdivision(u.subdivision || '');
    setUserFormScopeField(u.scopeField || '');
    setUserFormScopeValue(u.scopeValue || '');
    setUserFormJurisdictions((u.jurisdictions || []).join(', '));
    setUserFormAdmin(u.admin || 'GIS Admin');
    setIsUserModalOpen(true);
  };

  const handleSaveUserForm = async () => {
    if (!userFormUsername.trim() || !userFormDisplayName.trim()) {
      alert('Username and Officer Display Name are required.');
      return;
    }

    const jurs = userFormJurisdictions
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const userObj: PowerGISUser = {
      id: editingUserId || `custom-user-${Date.now()}`,
      username: userFormUsername.trim(),
      displayName: userFormDisplayName.trim(),
      role: userFormRole as any,
      region: userFormRegion,
      department: userFormDepartment.trim() || null,
      circle: userFormCircle.trim() || null,
      division: userFormDivision.trim() || null,
      subdivision: userFormSubdivision.trim() || null,
      scopeField: (userFormScopeField as any) || null,
      scopeValue: userFormScopeValue.trim() || null,
      admin: userFormAdmin.trim() || 'GIS Admin',
      jurisdictions: jurs.length > 0 ? jurs : ['PONDICHERRY'],
    };

    try {
      if (editingUserId) await updateCustomUser(editingUserId, userObj);
      else await addCustomUser(userObj);
      setIsUserModalOpen(false);
      const refreshed = await listLoginUsers();
      setUsersList(refreshed);
    } catch (error: any) {
      alert(error?.message || 'User changes were not saved.');
    }
  };

  const handleDeleteUserSingle = async (u: PowerGISUser) => {
    if (window.confirm(`Delete officer account "${u.displayName}" (${u.username})?`)) {
      try {
        await deleteCustomUser(u.id);
      } catch (error: any) {
        alert(error?.message || 'User deactivation was not saved.');
        return;
      }
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(u.id);
        return next;
      });
      const refreshed = await listLoginUsers();
      setUsersList(refreshed);
    }
  };

  const handleDeleteSelectedUsers = async () => {
    if (selectedUserIds.size === 0) return;
    if (window.confirm(`Delete ${selectedUserIds.size} selected user account(s)?`)) {
      try {
        for (const id of Array.from(selectedUserIds)) await deleteCustomUser(id);
      } catch (error: any) {
        alert(error?.message || 'User deactivation was not saved.');
        return;
      }
      setSelectedUserIds(new Set());
      const refreshed = await listLoginUsers();
      setUsersList(refreshed);
    }
  };

  const handleResetUsersToSeed = async () => {
    if (
      window.confirm(
        'Reset all user roles and hierarchy to default database seed? This will clear all custom modifications.'
      )
    ) {
      alert('Reset is unavailable until a server-side user-administration workflow is deployed. No accounts were changed.');
    }
  };

  const handleExportUsersCsv = () => {
    const csv = exportUsersToCsv(filteredUsers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `PowerGIS_Users_Hierarchy_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleExportUsersExcel = () => {
    const xml = exportUsersToExcelXml(filteredUsers);
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    downloadBlob(blob, `PowerGIS_Users_Hierarchy_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = `${import.meta.env.BASE_URL}templates/PowerGIS_Users_Hierarchy_and_Roles.csv`;
    link.download = 'PowerGIS_Users_Hierarchy_Template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportUsersFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        alert('File is empty or does not contain a header line.');
        return;
      }
      const parseLine = (line: string) => {
        const parts: string[] = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') {
            inQ = !inQ;
          } else if (c === ',' && !inQ) {
            parts.push(cur.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
            cur = '';
          } else {
            cur += c;
          }
        }
        parts.push(cur.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        return parts;
      };

      const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
      const usernameIdx = headers.findIndex((h) => h.includes('username') || h === 'user');
      const nameIdx = headers.findIndex((h) => h.includes('display') || h.includes('name'));
      const roleIdx = headers.findIndex((h) => h.includes('role') || h.includes('designation'));
      const deptIdx = headers.findIndex((h) => h.includes('department') || h.includes('dept'));
      const circleIdx = headers.findIndex((h) => h.includes('circle'));
      const divIdx = headers.findIndex((h) => h.includes('division') && !h.includes('sub'));
      const subIdx = headers.findIndex((h) => h.includes('sub') || h.includes('subdivision'));
      const regIdx = headers.findIndex((h) => h.includes('region'));
      const jurIdx = headers.findIndex((h) => h.includes('jurisdiction'));

      let importedCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const uname = usernameIdx !== -1 ? cols[usernameIdx] : '';
        const dname = nameIdx !== -1 ? cols[nameIdx] : uname;
        if (!uname && !dname) continue;

        const roleVal = (roleIdx !== -1 ? cols[roleIdx] : 'JE').toUpperCase();
        const validRole = ['GIS_ADMIN', 'SE', 'EE', 'AEE', 'AE', 'JE', 'CONTRACTOR'].includes(roleVal)
          ? roleVal
          : 'JE';

        const jurs = jurIdx !== -1 && cols[jurIdx]
          ? cols[jurIdx].split(/[,;]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
          : ['PONDICHERRY'];

        const userObj: PowerGISUser = {
          id: `imp-user-${Date.now()}-${i}`,
          username: uname || dname,
          displayName: dname || uname,
          role: validRole as any,
          region: regIdx !== -1 && cols[regIdx] ? cols[regIdx] : 'Pondicherry',
          department: deptIdx !== -1 && cols[deptIdx] ? cols[deptIdx] : null,
          circle: circleIdx !== -1 && cols[circleIdx] ? cols[circleIdx] : null,
          division: divIdx !== -1 && cols[divIdx] ? cols[divIdx] : null,
          subdivision: subIdx !== -1 && cols[subIdx] ? cols[subIdx] : null,
          admin: 'GIS Admin',
          jurisdictions: jurs,
        };

        await addCustomUser(userObj);
        importedCount++;
      }

      alert(`Successfully imported and updated ${importedCount} officer profile(s).`);
      const refreshed = await listLoginUsers();
      setUsersList(refreshed);
    } catch (err: any) {
      alert(`Import error: ${err?.message || 'Unable to parse file.'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
      if (userRegionFilter !== 'ALL' && u.region !== userRegionFilter) return false;
      if (userSearchTerm.trim()) {
        const q = userSearchTerm.toLowerCase();
        const inU = u.username.toLowerCase().includes(q);
        const inD = u.displayName.toLowerCase().includes(q);
        const inR = u.role.toLowerCase().includes(q);
        const inDep = (u.department || '').toLowerCase().includes(q);
        const inCir = (u.circle || '').toLowerCase().includes(q);
        const inDiv = (u.division || '').toLowerCase().includes(q);
        const inSub = (u.subdivision || '').toLowerCase().includes(q);
        const inReg = (u.region || '').toLowerCase().includes(q);
        return inU || inD || inR || inDep || inCir || inDiv || inSub || inReg;
      }
      return true;
    });
  }, [usersList, userRoleFilter, userRegionFilter, userSearchTerm]);

  const totalUserPages = Math.ceil(filteredUsers.length / userPageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  // Filtered assets
  const filteredAssets = useMemo(() => {
    return combinedAssets.filter((a) => {
      if (filterLayer !== 'ALL' && a.assetType !== filterLayer) return false;
      if (filterGeom !== 'ALL' && (a.geometry?.type || 'Point') !== filterGeom) return false;
      if (filterStatus !== 'ALL' && a.status !== filterStatus) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const inNo = (a.assetNo || '').toLowerCase().includes(query);
        const inType = (a.assetType || '').toLowerCase().includes(query);
        const inLabel = (layerLabels[a.assetType] || '').toLowerCase().includes(query);
        const inJur = (a.jurisdictions || []).join(' ').toLowerCase().includes(query);
        const inMeta = a.metadata ? JSON.stringify(a.metadata).toLowerCase().includes(query) : false;
        return inNo || inType || inLabel || inJur || inMeta;
      }
      return true;
    });
  }, [combinedAssets, filterLayer, filterGeom, filterStatus, searchTerm, layerLabels]);

  // Sorted assets
  const sortedAssets = useMemo(() => {
    const list = [...filteredAssets];
    list.sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (sortField) {
        case 'assetNo':
          valA = a.assetNo || '';
          valB = b.assetNo || '';
          break;
        case 'assetType':
          valA = layerLabels[a.assetType] || a.assetType || '';
          valB = layerLabels[b.assetType] || b.assetType || '';
          break;
        case 'status':
          valA = a.status || '';
          valB = b.status || '';
          break;
        case 'geometry':
          valA = a.geometry?.type || 'Point';
          valB = b.geometry?.type || 'Point';
          break;
        case 'jurisdiction':
          valA = (a.jurisdictions || []).join(', ');
          valB = (b.jurisdictions || []).join(', ');
          break;
      }
      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredAssets, sortField, sortDir, layerLabels]);

  // Pagination
  const totalPages = Math.ceil(sortedAssets.length / pageSize) || 1;
  const paginatedAssets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedAssets.slice(start, start + pageSize);
  }, [sortedAssets, page, pageSize]);

  const handleSort = (field: SortKey) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPage = () => {
    setSelectedIds(new Set(paginatedAssets.map((a) => a.id)));
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(sortedAssets.map((a) => a.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.size) return;
    if (window.confirm(`Delete ${selectedIds.size} selected asset(s)? This will remove them from the live grid, map, and storage.`)) {
      const idsToDelete: string[] = [];
      combinedAssets.forEach((a) => {
        if (selectedIds.has(a.id)) {
          idsToDelete.push(a.id);
          if (a.assetNo) idsToDelete.push(a.assetNo);
        }
      });
      selectedIds.forEach((id) => idsToDelete.push(id));

      try {
        await deleteAssets(idsToDelete);
        setDeletedIds(getDeletedAssetIds());
        setSelectedIds(new Set());
      } catch (error: any) {
        alert(error?.message || 'Asset deletion was not saved.');
      }
    }
  };

  const handleRestoreDefaults = async () => {
    alert('Sample-asset restoration is disabled. Live GIS records are server-authoritative; use an approved database recovery process.');
  };

  // Export current filtered table to CSV with ALL Raw Feature Metadata / Attributes
  const exportTableCsv = () => {
    // Gather all unique metadata keys across the current filtered dataset
    const metaKeySet = new Set<string>();
    sortedAssets.forEach((a) => {
      if (a.metadata && typeof a.metadata === 'object') {
        Object.keys(a.metadata).forEach((k) => metaKeySet.add(k));
      }
    });
    const metaKeys = Array.from(metaKeySet).sort();

    const baseHeaders = [
      'Asset No',
      'Layer Type',
      'Layer Label',
      'Status',
      'Geometry Type',
      'Latitude',
      'Longitude',
      'Jurisdictions',
      'Shared Boundary',
    ];
    const headers = [...baseHeaders, ...metaKeys];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = sortedAssets.map((a) => {
      const lat = a.latitude ?? (a.lat !== undefined ? a.lat : '');
      const lng = a.longitude ?? (a.lng !== undefined ? a.lng : '');
      const baseValues = [
        escapeCsv(a.assetNo),
        escapeCsv(a.assetType),
        escapeCsv(layerLabels[a.assetType] || a.assetType),
        escapeCsv(a.status),
        escapeCsv(a.geometry?.type || 'Point'),
        lat,
        lng,
        escapeCsv((a.jurisdictions || []).join('; ')),
        escapeCsv(a.shared ? 'Yes' : 'No'),
      ];

      const metaValues = metaKeys.map((k) => {
        const v = a.metadata ? a.metadata[k] : undefined;
        return escapeCsv(v);
      });

      return [...baseValues, ...metaValues];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `powergis-table-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Export metadata for inspected single asset to CSV
  const exportInspectedMetaCsv = () => {
    if (!inspectedAsset) return;
    const meta = inspectedAsset.metadata || {};
    const headers = ['Property / Attribute Key', 'Value'];
    const rows = Object.entries(meta).map(([k, v]) => {
      const escapedKey = `"${String(k).replace(/"/g, '""')}"`;
      const strVal = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      const escapedVal = `"${strVal.replace(/"/g, '""')}"`;
      return [escapedKey, escapedVal];
    });
    const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `asset-${inspectedAsset.assetNo}-attributes.csv`);
  };

  // Export current filtered table to GeoJSON
  const exportTableGeoJson = () => {
    const featureCollection = {
      type: 'FeatureCollection',
      features: sortedAssets.map((a) => ({
        type: 'Feature',
        geometry: a.geometry || { type: 'Point', coordinates: [a.longitude || a.lng || 0, a.latitude || a.lat || 0] },
        properties: {
          asset_no: a.assetNo,
          asset_type: a.assetType,
          status: a.status,
          jurisdictions: a.jurisdictions,
          shared: a.shared,
          ...(a.metadata || {}),
        },
      })),
    };
    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
    downloadBlob(blob, `powergis-table-${new Date().toISOString().slice(0, 10)}.geojson`);
  };

  if (currentUser.role !== 'GIS_ADMIN') {
    return (
      <div className="content">
        <div className="notice danger">
          <b>Access Restricted:</b> Data Management is available exclusively to GIS Administrator accounts.
        </div>
      </div>
    );
  }

  return (
    <div className="content data-management-page">
      {loadError && <div className="notice error-notice" role="alert">Live GIS inventory unavailable: {loadError}</div>}
      <div className="page-title">
        <div>
          <h1>Data Management & Tables View</h1>
        </div>
      </div>

      {/* Top Tab Switcher */}
      <div className="dm-tab-bar">
        <button
          type="button"
          className={`dm-tab-btn ${activeTab === 'tables' ? 'active' : ''}`}
          onClick={() => setActiveTab('tables')}
        >
          <DatabaseBackup size={16} />
          <span>Interactive Tables View ({combinedAssets.length})</span>
        </button>

        <button
          type="button"
          className={`dm-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          <span>User Roles & Hierarchy ({usersList.length})</span>
        </button>

        <button
          type="button"
          className={`dm-tab-btn ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          <FileUp size={16} />
          <span>Import & Modification Staging</span>
        </button>

        <button
          type="button"
          className={`dm-tab-btn ${activeTab === 'schemas' ? 'active' : ''}`}
          onClick={() => setActiveTab('schemas')}
        >
          <ShieldCheck size={16} />
          <span>Local File Schemas ({NEW_FOLDER_SCHEMAS.length} Datasets)</span>
        </button>
      </div>

      {/* TAB 1: INTERACTIVE TABLES VIEW */}
      {activeTab === 'tables' && (
        <div className="dm-tables-view-wrap">
          {/* Filters Bar */}
          <div className="dm-table-filters-card">
            <div className="dm-search-wrap">
              <Search size={15} className="dm-search-icon" />
              <input
                type="text"
                className="dm-search-input"
                placeholder="Search Asset No, Layer, Status, or Metadata attributes…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
              />
              {searchTerm && (
                <button type="button" className="dm-search-clear" onClick={() => setSearchTerm('')}>
                  ×
                </button>
              )}
            </div>

            <div className="dm-filters-row">
              <div className="dm-filter-item">
                <label>Data Source:</label>
                <select
                  value={dataSource}
                  onChange={(e) => {
                    setDataSource(e.target.value as any);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Assets ({combinedAssets.length})</option>
                  <option value="LIVE">Live Grid Assets ({liveOnlyAssets.length})</option>
                  <option value="IMPORTED">Imported Data Only ({importedOnlyAssets.length})</option>
                </select>
              </div>

              <div className="dm-filter-item">
                <label>Layer / Type:</label>
                <select
                  value={filterLayer}
                  onChange={(e) => {
                    setFilterLayer(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Layers ({layers.length})</option>
                  {layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label} ({l.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="dm-filter-item">
                <label>Geometry:</label>
                <select
                  value={filterGeom}
                  onChange={(e) => {
                    setFilterGeom(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Geometries</option>
                  <option value="Point">Point (Nodes / Transformers)</option>
                  <option value="LineString">LineString (Lines / Feeders)</option>
                  <option value="Polygon">Polygon (Substations / Zones)</option>
                  <option value="MultiLineString">MultiLineString</option>
                  <option value="MultiPolygon">MultiPolygon</option>
                </select>
              </div>

              <div className="dm-filter-item">
                <label>Status:</label>
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Actions Toolbar */}
          <div className="dm-table-toolbar">
            <div className="dm-toolbar-left">
              <span className="dm-results-count">
                Showing <strong>{sortedAssets.length}</strong> matching records
                {selectedIds.size > 0 && <span className="dm-selected-badge"> • {selectedIds.size} selected</span>}
              </span>
            </div>

            <div className="dm-toolbar-actions">
              <div className="dm-synced-btn-group">
                <button type="button" className="dm-sync-btn" onClick={selectAllPage} title="Select all records on current page">
                  Select Page
                </button>
                <button type="button" className="dm-sync-btn" onClick={selectAllFiltered} title="Select all filtered records">
                  Select All ({sortedAssets.length})
                </button>
                <button
                  type="button"
                  className="dm-sync-btn"
                  onClick={deselectAll}
                  disabled={selectedIds.size === 0}
                  title="Deselect all records"
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  className={`dm-sync-btn danger ${selectedIds.size > 0 ? 'active' : ''}`}
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.size === 0}
                  title={selectedIds.size > 0 ? `Delete ${selectedIds.size} selected record(s)` : 'Select records to delete'}
                >
                  <Trash2 size={13} />
                  <span>Delete Selected ({selectedIds.size})</span>
                </button>
                <button type="button" className="dm-sync-btn" onClick={exportTableCsv} title="Export current filtered table to CSV">
                  <Download size={13} />
                  <span>Export CSV</span>
                </button>
                <button type="button" className="dm-sync-btn" onClick={exportTableGeoJson} title="Export current filtered table to GeoJSON">
                  <Download size={13} />
                  <span>Export GeoJSON</span>
                </button>
                <button
                  type="button"
                  className="dm-sync-btn"
                  onClick={handleRestoreDefaults}
                  disabled
                  title="Recovery is performed through an approved database restore process"
                >
                  <RotateCcw size={13} />
                  <span>Restore Disabled</span>
                </button>
              </div>

              <select
                className="dm-pagesize-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>
          </div>

          {/* The Data Table */}
          <div className="dm-table-container">
            <table className="dm-grid-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={paginatedAssets.length > 0 && paginatedAssets.every((a) => selectedIds.has(a.id))}
                      onChange={(e) => {
                        if (e.target.checked) selectAllPage();
                        else deselectAll();
                      }}
                    />
                  </th>
                  <th onClick={() => handleSort('assetNo')} className="sortable-col">
                    <div className="col-header-inner">
                      <span>Asset Number</span>
                      {sortField === 'assetNo' ? (
                        sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={11} className="dim" />
                      )}
                    </div>
                  </th>
                  <th onClick={() => handleSort('assetType')} className="sortable-col">
                    <div className="col-header-inner">
                      <span>Layer / Asset Type</span>
                      {sortField === 'assetType' ? (
                        sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={11} className="dim" />
                      )}
                    </div>
                  </th>
                  <th onClick={() => handleSort('status')} className="sortable-col" style={{ width: 110 }}>
                    <div className="col-header-inner">
                      <span>Status</span>
                      {sortField === 'status' ? (
                        sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={11} className="dim" />
                      )}
                    </div>
                  </th>
                  <th onClick={() => handleSort('geometry')} className="sortable-col" style={{ width: 120 }}>
                    <div className="col-header-inner">
                      <span>Geometry</span>
                      {sortField === 'geometry' ? (
                        sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={11} className="dim" />
                      )}
                    </div>
                  </th>
                  <th>Coordinates / Vertices</th>
                  <th onClick={() => handleSort('jurisdiction')} className="sortable-col">
                    <div className="col-header-inner">
                      <span>Jurisdiction</span>
                      {sortField === 'jurisdiction' ? (
                        sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={11} className="dim" />
                      )}
                    </div>
                  </th>
                  <th style={{ width: currentUser.role === 'GIS_ADMIN' ? 140 : 90, textAlign: 'center' }}>
                    {currentUser.role === 'GIS_ADMIN' ? 'Actions' : 'Attributes'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedAssets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="dm-no-records">
                      No records match the current filters. Adjust search query or source filters above.
                    </td>
                  </tr>
                ) : (
                  paginatedAssets.map((asset) => {
                    const isSelected = selectedIds.has(asset.id);
                    const color = layerColors[asset.assetType] || '#2563EB';
                    const icon = layerIcons[asset.assetType] || 'circle';
                    const label = layerLabels[asset.assetType] || asset.assetType;
                    const geomType = asset.geometry?.type || 'Point';

                    let coordsStr = '—';
                    if (asset.latitude !== undefined && asset.longitude !== undefined) {
                      coordsStr = `${asset.latitude.toFixed(5)}, ${asset.longitude.toFixed(5)}`;
                    } else if (asset.lat !== undefined && asset.lng !== undefined) {
                      coordsStr = `${asset.lat.toFixed(5)}, ${asset.lng.toFixed(5)}`;
                    } else if (asset.geometry?.coordinates) {
                      coordsStr = `${Array.isArray(asset.geometry.coordinates[0]) ? asset.geometry.coordinates.length : 1} point(s)`;
                    }

                    return (
                      <tr key={asset.id} className={isSelected ? 'dm-row-selected' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(asset.id)}
                          />
                        </td>
                        <td>
                          <span className="dm-asset-no">{asset.assetNo}</span>
                        </td>
                        <td>
                          <div className="dm-layer-cell">
                            <span className="dm-layer-badge" style={{ background: color }}>
                              <LayerIconGlyph icon={icon} size={11} color="#ffffff" strokeWidth={2.5} />
                            </span>
                            <span className="dm-layer-name" title={asset.assetType}>
                              {label}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill ${asset.status.toLowerCase()}`}>{asset.status}</span>
                        </td>
                        <td>
                          <span className="geom-pill">{geomType}</span>
                        </td>
                        <td className="coords-cell" title={coordsStr}>
                          {coordsStr}
                        </td>
                        <td>
                          <span className="muted">{(asset.jurisdictions || []).join(', ') || 'Pondicherry'}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="dm-row-actions">
                            {currentUser.role === 'GIS_ADMIN' && (
                              <button
                                type="button"
                                className="dm-row-btn edit"
                                title="Edit asset name & data (GIS Admin)"
                                onClick={() => openEditModal(asset)}
                              >
                                <Pencil size={11} />
                                <span>Edit</span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="dm-row-btn inspect"
                              title="Inspect full attributes"
                              onClick={() => setInspectedAsset(asset)}
                            >
                              Inspect
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="dm-pagination-bar">
              <span className="muted">
                Page {page} of {totalPages} ({sortedAssets.length} total)
              </span>
              <div className="dm-page-btns">
                <button
                  type="button"
                  className="dm-sync-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="dm-sync-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: IMPORT & MODIFICATION STAGING */}
      {activeTab === 'import' && (
        <div className="dm-import-tab-wrap">
          <DataManagementPanel currentUser={currentUser} />
        </div>
      )}

      {/* TAB 3: FILE SCHEMAS ANALYSIS */}
      {activeTab === 'schemas' && (
        <div className="dm-schemas-tab-wrap">
          <div className="dm-schemas-header-box">
            <div>
              <h3>Puducherry Electrical GIS File Schemas</h3>
              <p className="muted">
                Analyzed locally from <code>c:\Users\HARISH VYAS\Project\BaseGIS\New folder</code> without uploading any data externally.
              </p>
            </div>
          </div>

          <div className="dm-schemas-grid">
            {NEW_FOLDER_SCHEMAS.map((schema) => (
              <div className="dm-schema-card" key={schema.name}>
                <div className="dm-schema-card-head">
                  <div className="dm-schema-title-row">
                    <b>{schema.name}</b>
                    <span className="dm-format-pill">{schema.format}</span>
                  </div>
                  <div className="dm-schema-metrics">
                    <span className="geom-pill">{schema.geomType}</span>
                    <span className="dm-count-badge">{schema.count} features</span>
                  </div>
                </div>

                <p className="dm-schema-desc">{schema.description}</p>

                <div className="dm-schema-field-section">
                  <div className="dm-schema-section-title">
                    <span>Key Identifier:</span> <code>{schema.primaryKey}</code>
                  </div>
                  <div className="dm-schema-section-title">Attribute Properties ({schema.properties.length}):</div>
                  <div className="dm-props-chip-list">
                    {schema.properties.map((p) => (
                      <span key={p} className="dm-prop-chip">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: USER ROLES & HIERARCHY MANAGEMENT (VISUAL TABLE FORMAT) */}
      {activeTab === 'users' && (
        <div className="dm-users-tab-wrap">
          {/* Hidden File Input for Users Import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportUsersFile}
            accept=".csv,.txt"
            style={{ display: 'none' }}
          />

          {/* Statistics Summary Cards */}
          <div className="dm-users-stat-cards">
            <div className="dm-users-stat-card">
              <div className="stat-label">Total Officers & Staff</div>
              <div className="stat-value">{usersList.length}</div>
              <div className="stat-sub">Registered organizational profiles</div>
            </div>
            <div className="dm-users-stat-card">
              <div className="stat-label">Administrative Hierarchy</div>
              <div className="stat-value">
                {usersList.filter((u) => u.role === 'SE' || u.role === 'EE').length}
              </div>
              <div className="stat-sub">
                {usersList.filter((u) => u.role === 'SE').length} SEs · {usersList.filter((u) => u.role === 'EE').length} EEs
              </div>
            </div>
            <div className="dm-users-stat-card">
              <div className="stat-label">Field Junior Engineers</div>
              <div className="stat-value">{usersList.filter((u) => u.role === 'JE').length}</div>
              <div className="stat-sub">Jurisdictional operational engineers</div>
            </div>
            <div className="dm-users-stat-card">
              <div className="stat-label">Covered Regions</div>
              <div className="stat-value">4</div>
              <div className="stat-sub">Pondicherry · Karaikal · Mahe · Yanam</div>
            </div>
          </div>

          {/* Filter & Action Toolbar */}
          <div className="dm-table-filters-card">
            <div className="dm-search-wrap">
              <Search size={15} className="dm-search-icon" />
              <input
                type="text"
                className="dm-search-input"
                placeholder="Search by Officer Name, Username, Division, Circle, Role, or Jurisdiction…"
                value={userSearchTerm}
                onChange={(e) => {
                  setUserSearchTerm(e.target.value);
                  setUserPage(1);
                }}
              />
              {userSearchTerm && (
                <button type="button" className="dm-search-clear" onClick={() => setUserSearchTerm('')}>
                  ×
                </button>
              )}
            </div>

            <div className="dm-filters-row">
              <div className="dm-filter-item">
                <label>Designation Role:</label>
                <select
                  value={userRoleFilter}
                  onChange={(e) => {
                    setUserRoleFilter(e.target.value);
                    setUserPage(1);
                  }}
                >
                  <option value="ALL">All Roles ({usersList.length})</option>
                  <option value="GIS_ADMIN">GIS Admin ({usersList.filter((u) => u.role === 'GIS_ADMIN').length})</option>
                  <option value="SE">Superintending Engineer - SE ({usersList.filter((u) => u.role === 'SE').length})</option>
                  <option value="EE">Executive Engineer - EE ({usersList.filter((u) => u.role === 'EE').length})</option>
                  <option value="AEE">Assistant Executive Engineer - AEE ({usersList.filter((u) => u.role === 'AEE').length})</option>
                  <option value="AE">Assistant Engineer - AE ({usersList.filter((u) => u.role === 'AE').length})</option>
                  <option value="JE">Junior Engineer - JE ({usersList.filter((u) => u.role === 'JE').length})</option>
                  <option value="CONTRACTOR">Contractor ({usersList.filter((u) => u.role === 'CONTRACTOR').length})</option>
                </select>
              </div>

              <div className="dm-filter-item">
                <label>Region:</label>
                <select
                  value={userRegionFilter}
                  onChange={(e) => {
                    setUserRegionFilter(e.target.value);
                    setUserPage(1);
                  }}
                >
                  <option value="ALL">All Regions</option>
                  <option value="Pondicherry">Pondicherry</option>
                  <option value="Karaikal">Karaikal</option>
                  <option value="Mahe">Mahe</option>
                  <option value="Yanam">Yanam</option>
                  <option value="All Regions">All Regions (Headquarters)</option>
                </select>
              </div>

              <div className="dm-actions-col">
                <button type="button" className="dm-action-btn primary" onClick={openAddUserModal}>
                  <Plus size={14} />
                  <span>Add New User / Role</span>
                </button>

                <button
                  type="button"
                  className="dm-action-btn secondary"
                  onClick={() => fileInputRef.current?.click()}
                  title="Import officers directory from CSV or Excel file"
                >
                  <FileUp size={14} />
                  <span>Import Users (CSV/Excel)</span>
                </button>

                <button
                  type="button"
                  className="dm-action-btn secondary"
                  onClick={handleExportUsersExcel}
                  title="Download complete organizational hierarchy as formatted Excel file (.xls)"
                >
                  <Download size={14} />
                  <span>Export Excel (.xls)</span>
                </button>

                <button
                  type="button"
                  className="dm-action-btn secondary"
                  onClick={handleExportUsersCsv}
                  title="Download user roles and mapping as CSV"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  className="dm-action-btn secondary"
                  onClick={handleDownloadTemplate}
                  title="Download sample Excel/CSV template for importing users"
                >
                  <Download size={14} />
                  <span>Hierarchy Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* Synchronized Action Button Group */}
          <div className="dm-table-header-bar">
            <div className="dm-synced-btn-group">
              <button
                type="button"
                className="dm-sync-btn"
                onClick={() => {
                  setSelectedUserIds(new Set(paginatedUsers.map((u) => u.id)));
                }}
              >
                Select Page ({paginatedUsers.length})
              </button>
              <button
                type="button"
                className="dm-sync-btn"
                onClick={() => {
                  setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
                }}
              >
                Select All ({filteredUsers.length})
              </button>
              <button
                type="button"
                className="dm-sync-btn"
                onClick={() => setSelectedUserIds(new Set())}
                disabled={selectedUserIds.size === 0}
              >
                Deselect All
              </button>
              <button
                type="button"
                className="dm-sync-btn danger"
                onClick={handleDeleteSelectedUsers}
                disabled={selectedUserIds.size === 0}
              >
                <Trash2 size={13} />
                <span>Delete Selected ({selectedUserIds.size})</span>
              </button>
              <button
                type="button"
                className="dm-sync-btn reset"
                onClick={handleResetUsersToSeed}
                title="Restore default organizational directory seed"
              >
                <RotateCcw size={13} />
                <span>Reset to Seed Users</span>
              </button>
            </div>

            <div className="dm-table-stats">
              <span>
                Showing <b>{paginatedUsers.length}</b> of <b>{filteredUsers.length}</b> users
                {selectedUserIds.size > 0 && ` (${selectedUserIds.size} selected)`}
              </span>
            </div>
          </div>

          {/* Visual Table Container */}
          <div className="dm-table-scroll-card">
            <table className="dm-interactive-table">
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedUserIds.has(u.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev);
                            paginatedUsers.forEach((u) => next.add(u.id));
                            return next;
                          });
                        } else {
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev);
                            paginatedUsers.forEach((u) => next.delete(u.id));
                            return next;
                          });
                        }
                      }}
                    />
                  </th>
                  <th>Username</th>
                  <th>Officer Display Name</th>
                  <th>Role Designation</th>
                  <th>Department / Circle</th>
                  <th>Division / Sub Division</th>
                  <th>Region</th>
                  <th>Authorized Jurisdictions</th>
                  <th style={{ textAlign: 'center', width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="dm-table-empty">
                      No officers or user roles found matching current filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => {
                    const isSelected = selectedUserIds.has(u.id);
                    const roleLower = u.role.toLowerCase();
                    return (
                      <tr key={u.id} className={isSelected ? 'selected-row' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              setSelectedUserIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(u.id);
                                else next.delete(u.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td>
                          <span className="dm-code-pill">{u.username}</span>
                        </td>
                        <td>
                          <strong>{u.displayName}</strong>
                        </td>
                        <td>
                          <span className={`dm-user-role-badge role-${roleLower}`}>{u.role}</span>
                        </td>
                        <td>
                          <div className="dm-user-hierarchy-cell">
                            <strong>{u.department || '—'}</strong>
                            <span>{u.circle || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="dm-user-hierarchy-cell">
                            <strong>{u.division || '—'}</strong>
                            <span>{u.subdivision || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="dm-user-region-badge">{u.region}</span>
                        </td>
                        <td>
                          <div>
                            {(u.jurisdictions || []).map((jur) => (
                              <span key={jur} className="dm-user-jur-badge">
                                {jur}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="dm-row-actions">
                            <button
                              type="button"
                              className="dm-icon-btn edit"
                              onClick={() => openEditUserModal(u)}
                              title="Edit Officer Profile & Role Mapping"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className="dm-icon-btn delete"
                              onClick={() => handleDeleteUserSingle(u)}
                              title="Delete Officer Profile"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* User Table Pagination Bar */}
          <div className="dm-pagination-bar">
            <div className="dm-page-size-selector">
              <span>Show:</span>
              <select
                value={userPageSize}
                onChange={(e) => {
                  setUserPageSize(Number(e.target.value));
                  setUserPage(1);
                }}
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            <div className="dm-page-controls">
              <button
                type="button"
                className="dm-sync-btn"
                disabled={userPage <= 1}
                onClick={() => setUserPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>

              <span className="pagination-indicator">
                Page {userPage} of {totalUserPages}
              </span>

              <button
                type="button"
                className="dm-sync-btn"
                disabled={userPage >= totalUserPages}
                onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT USER ROLES MODAL */}
      {isUserModalOpen && (
        <div className="dm-modal-overlay" onClick={() => setIsUserModalOpen(false)}>
          <div className="dm-modal-box dm-edit-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="dm-modal-header">
              <div>
                <span className="asset-kicker">GIS ADMIN / USER ROLES & HIERARCHY</span>
                <h3>{editingUserId ? `Edit User Profile: ${userFormUsername}` : 'Add New Officer / Role'}</h3>
              </div>
              <button type="button" className="dm-modal-close" onClick={() => setIsUserModalOpen(false)}>
                ×
              </button>
            </div>

            <div className="dm-modal-body">
              <div className="dm-edit-form-grid">
                <div className="dm-edit-field">
                  <label>
                    Username: <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormUsername}
                    onChange={(e) => setUserFormUsername(e.target.value)}
                    placeholder="e.g. JE-TownCentral"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>
                    Officer Display Name: <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormDisplayName}
                    onChange={(e) => setUserFormDisplayName(e.target.value)}
                    placeholder="e.g. JE - Town Central Division"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Designation Role:</label>
                  <select
                    className="dm-edit-select"
                    value={userFormRole}
                    onChange={(e) => setUserFormRole(e.target.value)}
                  >
                    <option value="GIS_ADMIN">GIS Admin (System Administrator)</option>
                    <option value="SE">Superintending Engineer (SE)</option>
                    <option value="EE">Executive Engineer (EE)</option>
                    <option value="AEE">Assistant Executive Engineer (AEE)</option>
                    <option value="AE">Assistant Engineer (AE)</option>
                    <option value="JE">Junior Engineer (JE - Field)</option>
                    <option value="CONTRACTOR">Contractor</option>
                  </select>
                </div>

                <div className="dm-edit-field">
                  <label>Region:</label>
                  <select
                    className="dm-edit-select"
                    value={userFormRegion}
                    onChange={(e) => setUserFormRegion(e.target.value)}
                  >
                    <option value="Pondicherry">Pondicherry</option>
                    <option value="Karaikal">Karaikal</option>
                    <option value="Mahe">Mahe</option>
                    <option value="Yanam">Yanam</option>
                    <option value="All Regions">All Regions</option>
                  </select>
                </div>

                <div className="dm-edit-field">
                  <label>Department:</label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormDepartment}
                    onChange={(e) => setUserFormDepartment(e.target.value)}
                    placeholder="e.g. SE - 1 cum HOD"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Circle:</label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormCircle}
                    onChange={(e) => setUserFormCircle(e.target.value)}
                    placeholder="e.g. SE - 3 O&M"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Division:</label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormDivision}
                    onChange={(e) => setUserFormDivision(e.target.value)}
                    placeholder="e.g. EE - Urban"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Sub Division:</label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormSubdivision}
                    onChange={(e) => setUserFormSubdivision(e.target.value)}
                    placeholder="e.g. AEE- Town I"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Authorized Jurisdictions (comma-separated):</label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormJurisdictions}
                    onChange={(e) => setUserFormJurisdictions(e.target.value)}
                    placeholder="e.g. PONDICHERRY, KARAIKAL"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Scope Field (Visibility Filter):</label>
                  <select
                    className="dm-edit-select"
                    value={userFormScopeField}
                    onChange={(e) => setUserFormScopeField(e.target.value)}
                  >
                    <option value="">None (Region/Jurisdiction Bound)</option>
                    <option value="subdivision">Subdivision</option>
                    <option value="division">Division</option>
                    <option value="circle">Circle</option>
                    <option value="department">Department</option>
                  </select>
                </div>

                <div className="dm-edit-field">
                  <label>Scope Value:</label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormScopeValue}
                    onChange={(e) => setUserFormScopeValue(e.target.value)}
                    placeholder="e.g. EE - Urban"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Reporting Admin:</label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={userFormAdmin}
                    onChange={(e) => setUserFormAdmin(e.target.value)}
                    placeholder="GIS Admin"
                  />
                </div>
              </div>
            </div>

            <div className="dm-modal-footer dm-edit-footer">
              <div className="dm-footer-right" style={{ marginLeft: 'auto' }}>
                <button type="button" className="btn secondary" onClick={() => setIsUserModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!userFormUsername.trim() || !userFormDisplayName.trim()}
                  onClick={handleSaveUserForm}
                >
                  <Save size={14} />
                  <span>{editingUserId ? 'Save Officer Profile' : 'Create Officer Profile'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RAW ATTRIBUTES INSPECTION MODAL */}
      {inspectedAsset && (
        <div className="dm-modal-overlay" onClick={() => setInspectedAsset(null)}>
          <div className="dm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="dm-modal-header">
              <div>
                <span className="asset-kicker">
                  {layerLabels[inspectedAsset.assetType] || inspectedAsset.assetType}
                </span>
                <h3>{inspectedAsset.assetNo}</h3>
              </div>
              <button type="button" className="dm-modal-close" onClick={() => setInspectedAsset(null)}>
                ×
              </button>
            </div>

            <div className="dm-modal-body">
              <div className="dm-modal-meta-grid">
                <div>
                  <label>Status:</label>
                  <b>{inspectedAsset.status}</b>
                </div>
                <div>
                  <label>Geometry Type:</label>
                  <b>{inspectedAsset.geometry?.type || 'Point'}</b>
                </div>
                <div>
                  <label>Visibility:</label>
                  <b>{inspectedAsset.shared ? 'Shared boundary' : 'Private'}</b>
                </div>
                <div>
                  <label>Jurisdiction:</label>
                  <b>{(inspectedAsset.jurisdictions || []).join(', ') || 'Pondicherry'}</b>
                </div>
              </div>

              <h4>Raw Feature Metadata / Attributes</h4>
              {inspectedAsset.metadata && Object.keys(inspectedAsset.metadata).length > 0 ? (
                <div className="dm-meta-table-wrap">
                  <table className="dm-meta-table">
                    <thead>
                      <tr>
                        <th>Property / Column Name</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(inspectedAsset.metadata).map(([key, val]) => (
                        <tr key={key}>
                          <td>
                            <code>{key}</code>
                          </td>
                          <td>{val === null || val === undefined ? '<Null>' : String(val)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="muted" style={{ padding: '12px 0' }}>
                  No extended properties present for this feature.
                </div>
              )}
            </div>

            <div className="dm-modal-footer">
              {currentUser.role === 'GIS_ADMIN' && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    const target = inspectedAsset;
                    setInspectedAsset(null);
                    openEditModal(target);
                  }}
                  style={{ marginRight: 8 }}
                >
                  <Pencil size={13} /> Edit Asset Data
                </button>
              )}
              {inspectedAsset.metadata && Object.keys(inspectedAsset.metadata).length > 0 && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={exportInspectedMetaCsv}
                  style={{ marginRight: 'auto' }}
                  title="Export raw attribute properties of this asset to CSV"
                >
                  <Download size={13} /> Export Attributes CSV
                </button>
              )}
              <button type="button" className="btn secondary" onClick={() => setInspectedAsset(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSET EDITING MODAL (FOR GIS ADMIN) */}
      {editingAsset && (
        <div className="dm-modal-overlay" onClick={() => setEditingAsset(null)}>
          <div className="dm-modal-box dm-edit-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="dm-modal-header">
              <div>
                <span className="asset-kicker">GIS ADMIN / ASSET EDITOR</span>
                <h3>Edit Asset: {editingAsset.assetNo}</h3>
              </div>
              <button type="button" className="dm-modal-close" onClick={() => setEditingAsset(null)}>
                ×
              </button>
            </div>

            <div className="dm-modal-body">
              <div className="dm-edit-form-grid">
                <div className="dm-edit-field">
                  <label>
                    Asset Name / Number: <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={editAssetNo}
                    onChange={(e) => setEditAssetNo(e.target.value)}
                    placeholder="Asset Number / ID"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Layer / Asset Type:</label>
                  <select
                    className="dm-edit-select"
                    value={editAssetType}
                    onChange={(e) => setEditAssetType(e.target.value)}
                  >
                    {layers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label} ({l.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="dm-edit-field">
                  <label>Operational Status:</label>
                  <select
                    className="dm-edit-select"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>

                <div className="dm-edit-field">
                  <label>Jurisdictions (comma-separated):</label>
                  <input
                    type="text"
                    className="dm-edit-input"
                    value={editJurisdiction}
                    onChange={(e) => setEditJurisdiction(e.target.value)}
                    placeholder="e.g. Pondicherry, Oulgaret"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Latitude:</label>
                  <input
                    type="number"
                    step="0.000001"
                    className="dm-edit-input"
                    value={editLat}
                    onChange={(e) => setEditLat(e.target.value)}
                    placeholder="Latitude (e.g. 11.9416)"
                  />
                </div>

                <div className="dm-edit-field">
                  <label>Longitude:</label>
                  <input
                    type="number"
                    step="0.000001"
                    className="dm-edit-input"
                    value={editLng}
                    onChange={(e) => setEditLng(e.target.value)}
                    placeholder="Longitude (e.g. 79.8083)"
                  />
                </div>
              </div>

              <div className="dm-edit-checkbox-row">
                <label className="dm-checkbox-label">
                  <input
                    type="checkbox"
                    checked={editShared}
                    onChange={(e) => setEditShared(e.target.checked)}
                  />
                  <span>Shared Boundary (visible across sub-jurisdictions)</span>
                </label>
              </div>

              {/* Extended Metadata Attributes Editor */}
              <div className="dm-metadata-editor-section">
                <div className="dm-section-head-row">
                  <h4>Extended Feature Attributes / Properties</h4>
                  <span className="muted">{Object.keys(editMetadata).length} properties</span>
                </div>

                <div className="dm-meta-table-wrap">
                  <table className="dm-meta-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40%' }}>Attribute Key</th>
                        <th>Attribute Value</th>
                        <th style={{ width: 50, textAlign: 'center' }}>Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(editMetadata).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 12 }}>
                            No custom attributes defined. Add a new property below.
                          </td>
                        </tr>
                      ) : (
                        Object.entries(editMetadata).map(([k, v]) => (
                          <tr key={k}>
                            <td>
                              <code>{k}</code>
                            </td>
                            <td>
                              <input
                                type="text"
                                className="dm-meta-val-input"
                                value={v === null || v === undefined ? '' : String(v)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditMetadata((prev) => ({ ...prev, [k]: val }));
                                }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="row-remove-btn"
                                title={`Delete ${k}`}
                                onClick={() => {
                                  setEditMetadata((prev) => {
                                    const next = { ...prev };
                                    delete next[k];
                                    return next;
                                  });
                                }}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add New Attribute Form */}
                <div className="dm-add-attr-bar">
                  <input
                    type="text"
                    className="dm-add-attr-key"
                    placeholder="Property name (e.g. VOLTAGE_KV)"
                    value={newMetaKey}
                    onChange={(e) => setNewMetaKey(e.target.value)}
                  />
                  <input
                    type="text"
                    className="dm-add-attr-val"
                    placeholder="Property value"
                    value={newMetaVal}
                    onChange={(e) => setNewMetaVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newMetaKey.trim()) {
                        e.preventDefault();
                        setEditMetadata((prev) => ({ ...prev, [newMetaKey.trim()]: newMetaVal }));
                        setNewMetaKey('');
                        setNewMetaVal('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="dm-sync-btn"
                    disabled={!newMetaKey.trim()}
                    onClick={() => {
                      if (newMetaKey.trim()) {
                        setEditMetadata((prev) => ({ ...prev, [newMetaKey.trim()]: newMetaVal }));
                        setNewMetaKey('');
                        setNewMetaVal('');
                      }
                    }}
                  >
                    <Plus size={13} />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="dm-modal-footer dm-edit-footer">
              <button
                type="button"
                className="btn danger"
                onClick={() => handleDeleteSingle(editingAsset.id, editingAsset.assetNo)}
              >
                <Trash2 size={13} />
                <span>Delete Asset</span>
              </button>

              <div className="dm-footer-right">
                <button type="button" className="btn secondary" onClick={() => setEditingAsset(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!editAssetNo.trim()}
                  onClick={handleSaveAsset}
                >
                  <Save size={14} />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
