import { useState, useMemo, useEffect } from 'react';
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
} from '../../components/icons';
import { useGisLayers } from '../../services/layerService';
import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import { DataManagementPanel } from '../admin/DataManagementPanel';
import {
  getLocalImportedAssets,
  downloadBlob,
} from '../../services/dataManagementService';
import {
  deleteAssets,
  updateAsset,
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
];

type TabMode = 'tables' | 'import' | 'schemas';
type SortKey = 'assetNo' | 'assetType' | 'status' | 'geometry' | 'jurisdiction';

export function DataManagementPage({ currentUser }: { currentUser: PowerGISUser }) {
  const { assets: liveAssets } = usePowerGISData(currentUser);
  const { layers, layerLabels, layerColors, layerIcons } = useGisLayers();

  const [activeTab, setActiveTab] = useState<TabMode>('tables');
  const [localAssets, setLocalAssets] = useState<PowerGISAsset[]>(getLocalImportedAssets);

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

    await updateAsset(editingAsset.id, {
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
  };

  const handleDeleteSingle = async (id: string, name: string) => {
    if (window.confirm(`Delete asset "${name}"? This will remove it from the map, table, and storage.`)) {
      await deleteAssets([id]);
      if (editingAsset?.id === id) setEditingAsset(null);
      if (inspectedAsset?.id === id) setInspectedAsset(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Listen to asset changes
  useEffect(() => {
    const handleAssetsChanged = () => {
      setLocalAssets(getLocalImportedAssets());
    };
    window.addEventListener('powergis:assets-changed', handleAssetsChanged);
    return () => {
      window.removeEventListener('powergis:assets-changed', handleAssetsChanged);
    };
  }, []);

  // Combine live and local imported assets based on source selection
  const combinedAssets = useMemo(() => {
    if (dataSource === 'LIVE') return liveAssets;
    if (dataSource === 'IMPORTED') return localAssets;

    // 'ALL': Merge local and live without duplicate assetNo
    const map = new Map<string, PowerGISAsset>();
    liveAssets.forEach((a) => map.set(a.id, a));
    localAssets.forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  }, [liveAssets, localAssets, dataSource]);

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
      await deleteAssets(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  // Export current filtered table to CSV
  const exportTableCsv = () => {
    const headers = ['Asset No', 'Layer Type', 'Layer Label', 'Status', 'Geometry Type', 'Latitude', 'Longitude', 'Jurisdictions'];
    const rows = sortedAssets.map((a) => [
      `"${a.assetNo.replace(/"/g, '""')}"`,
      `"${a.assetType}"`,
      `"${(layerLabels[a.assetType] || a.assetType).replace(/"/g, '""')}"`,
      `"${a.status}"`,
      `"${a.geometry?.type || 'Point'}"`,
      a.latitude ?? (a.lat || ''),
      a.longitude ?? (a.lng || ''),
      `"${(a.jurisdictions || []).join('; ')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `powergis-table-${new Date().toISOString().slice(0, 10)}.csv`);
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
      <div className="page-title">
        <div>
          <span className="eyebrow">POWERGIS / DATA MANAGEMENT</span>
          <h1>Data Management & Tables View</h1>
          <p>
            Import operational GIS files, customize layer colors and icons, resolve duplicate records, and inspect all features in full interactive table view.
          </p>
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
                  <option value="ALL">All Assets ({liveAssets.length + localAssets.length})</option>
                  <option value="IMPORTED">Imported Data Only ({localAssets.length})</option>
                  <option value="LIVE">Live Grid Assets ({liveAssets.length})</option>
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
                  className="btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-sm"
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
                  style={{ marginRight: 'auto' }}
                >
                  <Pencil size={13} /> Edit Asset Data
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
                    className="btn-sm"
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
