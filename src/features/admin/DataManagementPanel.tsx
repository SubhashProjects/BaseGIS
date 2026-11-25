import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DatabaseBackup,
  Download,
  FileUp,
  RefreshCw,
  ShieldCheck,
  Trash2,
  LayerIconGlyph,
  Check,
} from '../../components/icons';
import {
  useGisLayers,
  PRESET_LAYER_COLORS,
  PRESET_LAYER_ICONS,
  filenameToLayerInfo,
  type LayerIconKey,
} from '../../services/layerService';
import { UI } from '../../config/ui.config';
import {
  supportedImportAccept,
  parseImportFile,
  importAssets,
  getLocalImportedAssets,
  clearAllImportedAssets,
  type DuplicateStrategy,
  type ImportFeature,
} from '../../services/dataManagementService';
import { useDataManagementViewModel } from '../../viewmodels/useDataManagementViewModel';
import { deleteAssets, type PowerGISAsset, type PowerGISUser } from '../../services/powergisData';

interface StagedFileMeta {
  id: string;
  file: File;
  layerLabel: string;
  layerId: string;
  layerColor: string;
  layerIcon: LayerIconKey;
}

interface StagedFeatureRow {
  uid: string;
  fileId: string;
  fileName: string;
  selected: boolean;
  assetNo: string;
  assetType: string;
  status: string;
  geometryType: string;
  coordsSummary: string;
  isDuplicate: boolean;
  raw: ImportFeature;
}

export function DataManagementPanel({ currentUser }: { currentUser: PowerGISUser }) {
  const vm = useDataManagementViewModel(currentUser);
  const { layers, ensureLayer } = useGisLayers();
  const input = useRef<HTMLInputElement>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedFileMeta[]>([]);
  const [stagedFeatures, setStagedFeatures] = useState<StagedFeatureRow[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('overwrite');
  const [isParsingFiles, setIsParsingFiles] = useState<boolean>(false);
  const [format, setFormat] = useState<'geojson' | 'csv' | 'json'>('geojson');

  // Active imported GIS assets state
  const [activeImported, setActiveImported] = useState<PowerGISAsset[]>(getLocalImportedAssets);
  const [selectedActiveIds, setSelectedActiveIds] = useState<Set<string>>(new Set());
  const [searchActive, setSearchActive] = useState<string>('');
  const [filterActiveLayer, setFilterActiveLayer] = useState<string>('ALL');

  useEffect(() => {
    const handleAssetsChanged = () => {
      setActiveImported(getLocalImportedAssets());
    };
    window.addEventListener('powergis:assets-changed', handleAssetsChanged);
    return () => {
      window.removeEventListener('powergis:assets-changed', handleAssetsChanged);
    };
  }, []);

  const existingAssetNos = useMemo(() => {
    return new Set(activeImported.map((a) => a.assetNo));
  }, [activeImported]);

  const handleFilesChosen = async (fileList: File[]) => {
    if (!fileList.length) return;
    setIsParsingFiles(true);

    const newFiles: StagedFileMeta[] = [];
    const newRows: StagedFeatureRow[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const derived = filenameToLayerInfo(f.name);
      const fileId = `${f.name}-${Date.now()}-${i}`;
      const color = PRESET_LAYER_COLORS[(layers.length + stagedFiles.length + i) % PRESET_LAYER_COLORS.length];
      const icon = derived.icon || 'circle';

      const fileMeta: StagedFileMeta = {
        id: fileId,
        file: f,
        layerLabel: derived.label,
        layerId: derived.id,
        layerColor: color,
        layerIcon: icon,
      };
      newFiles.push(fileMeta);

      try {
        const parsed = await parseImportFile(f, derived.id);
        parsed.forEach((feat, featIdx) => {
          const assetNo = feat.assetNo || `${derived.id}-${featIdx + 1}`;
          const geomType = feat.geometry?.type || 'Point';
          let coords = '';
          if (feat.latitude !== undefined && feat.longitude !== undefined) {
            coords = `${feat.latitude.toFixed(4)}, ${feat.longitude.toFixed(4)}`;
          } else if (feat.geometry?.coordinates) {
            coords = Array.isArray(feat.geometry.coordinates[0])
              ? `${feat.geometry.coordinates.length} pts`
              : `${feat.geometry.coordinates[1]?.toFixed?.(4) ?? ''}, ${feat.geometry.coordinates[0]?.toFixed?.(4) ?? ''}`;
          }

          newRows.push({
            uid: `staged-${fileId}-${featIdx}-${Math.random().toString(36).slice(2, 6)}`,
            fileId,
            fileName: f.name,
            selected: true,
            assetNo,
            assetType: feat.assetType || derived.id,
            status: feat.status || 'ACTIVE',
            geometryType: geomType,
            coordsSummary: coords || 'N/A',
            isDuplicate: existingAssetNos.has(assetNo),
            raw: feat,
          });
        });
      } catch (err: any) {
        console.warn(`Error parsing features from ${f.name}:`, err);
      }
    }

    setStagedFiles((prev) => [...prev, ...newFiles]);
    setStagedFeatures((prev) => [...prev, ...newRows]);
    setIsParsingFiles(false);
  };

  const updateStagedFile = (id: string, updates: Partial<StagedFileMeta>) => {
    setStagedFiles((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...updates };
        if (updates.layerLabel !== undefined && updates.layerId === undefined) {
          next.layerId =
            updates.layerLabel
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '_')
              .replace(/^_+|_+$/g, '') || item.layerId;
        }
        return next;
      })
    );

    // If layerId changed, update corresponding features that still match old layerId
    if (updates.layerId || updates.layerLabel) {
      const targetMeta = stagedFiles.find((s) => s.id === id);
      if (targetMeta) {
        const nextId =
          updates.layerId ||
          (updates.layerLabel
            ? updates.layerLabel.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/^_+|_+$/g, '')
            : targetMeta.layerId);

        setStagedFeatures((prev) =>
          prev.map((row) => (row.fileId === id ? { ...row, assetType: nextId } : row))
        );
      }
    }
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((s) => s.id !== id));
    setStagedFeatures((prev) => prev.filter((r) => r.fileId !== id));
  };

  // Feature row edits
  const updateFeatureRow = (uid: string, updates: Partial<StagedFeatureRow>) => {
    setStagedFeatures((prev) =>
      prev.map((r) => {
        if (r.uid !== uid) return r;
        const next = { ...r, ...updates };
        if (updates.assetNo !== undefined) {
          next.isDuplicate = existingAssetNos.has(updates.assetNo.trim());
        }
        return next;
      })
    );
  };

  const removeFeatureRow = (uid: string) => {
    setStagedFeatures((prev) => prev.filter((r) => r.uid !== uid));
  };

  const selectAllFeatures = () => {
    setStagedFeatures((prev) => prev.map((r) => ({ ...r, selected: true })));
  };

  const deselectAllFeatures = () => {
    setStagedFeatures((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  const removeSelectedFeatures = () => {
    setStagedFeatures((prev) => prev.filter((r) => !r.selected));
  };

  const selectedCount = stagedFeatures.filter((r) => r.selected).length;
  const duplicateCount = stagedFeatures.filter((r) => r.selected && r.isDuplicate).length;

  // Execute Import
  const handleImportSelected = async () => {
    const toImport = stagedFeatures.filter((r) => r.selected);
    if (!toImport.length) return;

    try {
      // 1. Ensure all associated layers exist with user-specified name, color and icon
      for (const fileMeta of stagedFiles) {
        ensureLayer(fileMeta.layerLabel, fileMeta.layerColor, fileMeta.layerId, fileMeta.layerIcon);
      }

      // 2. Prepare features with updated assetNo, assetType, status
      const featuresPayload: ImportFeature[] = toImport.map((r) => ({
        ...r.raw,
        assetNo: r.assetNo.trim(),
        assetType: r.assetType.trim(),
        status: r.status,
      }));

      // 3. Import with selected duplicate strategy
      const result = await importAssets(featuresPayload, duplicateStrategy);

      // 4. Remove imported features from staging
      const importedUids = new Set(toImport.map((r) => r.uid));
      setStagedFeatures((prev) => prev.filter((r) => !importedUids.has(r.uid)));

      // If all features of a file were imported, remove that file card too
      setStagedFiles((prev) =>
        prev.filter((f) => stagedFeatures.some((r) => !importedUids.has(r.uid) && r.fileId === f.id))
      );

      // Show result message
      alert(
        `Import Successful!\n• Added/Updated: ${result.inserted} feature(s)\n• Skipped: ${result.skipped}\nDuplicate Strategy used: ${duplicateStrategy.toUpperCase()}`
      );
    } catch (err: any) {
      alert(`Import error: ${err?.message || 'Failed to import features'}`);
    }
  };

  // Active imported asset operations
  const filteredActiveAssets = useMemo(() => {
    return activeImported.filter((a) => {
      if (filterActiveLayer !== 'ALL' && a.assetType !== filterActiveLayer) return false;
      if (searchActive.trim()) {
        const query = searchActive.toLowerCase();
        return (
          a.assetNo.toLowerCase().includes(query) ||
          a.assetType.toLowerCase().includes(query) ||
          a.status.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [activeImported, filterActiveLayer, searchActive]);

  const toggleSelectActive = (id: string) => {
    setSelectedActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllActive = () => {
    setSelectedActiveIds(new Set(filteredActiveAssets.map((a) => a.id)));
  };

  const deselectAllActive = () => {
    setSelectedActiveIds(new Set());
  };

  const handleDeleteSelectedActive = async () => {
    if (!selectedActiveIds.size) return;
    if (window.confirm(`Delete ${selectedActiveIds.size} selected imported asset(s)?`)) {
      await deleteAssets(Array.from(selectedActiveIds));
      setSelectedActiveIds(new Set());
    }
  };

  const handleClearAllActive = () => {
    if (activeImported.length === 0) return;
    if (window.confirm('Delete all imported GIS assets? This will remove all imported markers and lines from your map.')) {
      clearAllImportedAssets();
      setSelectedActiveIds(new Set());
    }
  };

  if (currentUser.role !== 'GIS_ADMIN') return null;

  return (
    <section className="panel data-management">
      <div className="panel-head data-head">
        <div>
          <b>{UI.admin.data.title}</b>
          <div className="muted">{UI.admin.data.subtitle}</div>
        </div>
        <ShieldCheck size={20} className="data-head-icon" />
      </div>

      <div className="panel-body">
        {/* Explanatory Info Card on Duplicate Handling & Storage */}
        <div className="import-explainer-banner">
          <div className="explainer-header">
            <b>GIS Data Import & Storage Guide</b>
          </div>
          <div className="explainer-content">
            <div className="explainer-item">
              <span className="explainer-bullet">✓</span>
              <div>
                <strong>Duplicates & Skipped Data:</strong> When an imported record matches an existing{' '}
                <code>Asset No</code>, you can now choose to <b>Overwrite existing</b> (default),{' '}
                <b>Auto-rename duplicates</b> (keep both), or <b>Skip duplicates</b>. You can also edit Asset Numbers
                directly in the staging table before committing.
              </div>
            </div>
            <div className="explainer-item">
              <span className="explainer-bullet">✓</span>
              <div>
                <strong>Database & Offline Persistence:</strong> All imported layers and assets are safely stored in
                local browser GIS storage, immediately visible on the live map and inventory, and synced to PostgreSQL /
                Supabase when online.
              </div>
            </div>
          </div>
        </div>

        <div className="data-grid">
          {/* Card 1: Import GIS Files */}
          <div className="data-card">
            <div className="data-card-icon">
              <FileUp size={20} />
            </div>
            <h3>{UI.admin.data.importTitle}</h3>
            <p>
              Select GIS files. Layer names, colors, and <b>icons</b> are automatically inferred with full option to edit
              and preview features before importing.
            </p>

            <button
              type="button"
              className="btn primary"
              disabled={vm.busy || isParsingFiles}
              onClick={() => input.current?.click()}
            >
              <FileUp size={15} />
              {isParsingFiles ? 'Reading GIS File(s)…' : stagedFiles.length > 0 ? 'Select More Files…' : 'Select GIS File(s) to Import'}
            </button>
            <input
              ref={input}
              hidden
              type="file"
              accept={supportedImportAccept()}
              multiple={true}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                void handleFilesChosen(files);
                e.currentTarget.value = '';
              }}
            />
            <div className="file-hint">KML · GeoJSON · CSV · GPKG (Single or Multi-select)</div>

            {/* Staged File Cards */}
            {stagedFiles.length > 0 && (
              <div className="staged-import-queue">
                <div className="staged-queue-header">
                  <span>Selected Files ({stagedFiles.length})</span>
                </div>

                {stagedFiles.map((staged) => (
                  <div className="staged-file-card" key={staged.id}>
                    <div className="staged-file-top">
                      <div className="staged-file-meta">
                        <b className="staged-filename" title={staged.file.name}>
                          {staged.file.name}
                        </b>
                        <span className="staged-filesize">{(staged.file.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <button
                        type="button"
                        className="staged-remove-btn"
                        title="Remove file and its staged features"
                        onClick={() => removeStagedFile(staged.id)}
                      >
                        ×
                      </button>
                    </div>

                    <div className="staged-field-group">
                      <label>Layer Name (edit):</label>
                      <input
                        type="text"
                        className="staged-layer-input"
                        value={staged.layerLabel}
                        placeholder="Layer Name"
                        onChange={(e) => updateStagedFile(staged.id, { layerLabel: e.target.value })}
                      />
                    </div>

                    <div className="staged-color-group">
                      <label>Layer Color:</label>
                      <div className="staged-color-swatches">
                        {PRESET_LAYER_COLORS.slice(0, 10).map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`staged-swatch ${staged.layerColor === c ? 'active' : ''}`}
                            style={{ background: c }}
                            onClick={() => updateStagedFile(staged.id, { layerColor: c })}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Layer Icon Selector */}
                    <div className="staged-icon-group">
                      <label>Layer Icon:</label>
                      <div className="staged-icon-palette">
                        {PRESET_LAYER_ICONS.map((ic) => (
                          <button
                            key={ic}
                            type="button"
                            className={`staged-icon-btn ${staged.layerIcon === ic ? 'active' : ''}`}
                            onClick={() => updateStagedFile(staged.id, { layerIcon: ic })}
                            title={ic}
                          >
                            <LayerIconGlyph
                              icon={ic}
                              size={14}
                              color={staged.layerIcon === ic ? staged.layerColor : '#94A3B8'}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 2: Export Data */}
          <div className="data-card">
            <div className="data-card-icon">
              <Download size={20} />
            </div>
            <h3>{UI.admin.data.exportTitle}</h3>
            <p>{UI.admin.data.exportHelp}</p>
            <div className="field-row">
              <label>{UI.admin.data.format}</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as any)}>
                <option value="geojson">GeoJSON</option>
                <option value="csv">CSV</option>
                <option value="json">PowerGIS JSON</option>
              </select>
            </div>
            <button className="btn" disabled={vm.busy} onClick={() => vm.exportData(format)}>
              <Download size={15} />
              {UI.admin.data.exportButton}
            </button>
            <div className="file-hint">Export restricted to authorised GIS scope</div>
          </div>

          {/* Card 3: Database Backup */}
          <div className="data-card">
            <div className="data-card-icon">
              <DatabaseBackup size={20} />
            </div>
            <h3>{UI.admin.data.backupTitle}</h3>
            <p>{UI.admin.data.backupHelp}</p>
            <div className="field-row">
              <label>Retention policy</label>
              <div className="field-static-value">Daily snapshot · 30 days retention</div>
            </div>
            <button className="btn" disabled={vm.busy} onClick={vm.backupNow}>
              <DatabaseBackup size={15} />
              {UI.admin.data.backupButton}
            </button>
            <div className="file-hint">{UI.admin.data.dailySchedule}</div>
          </div>
        </div>

        {/* Feature-Level Preview & Modification Table */}
        {stagedFeatures.length > 0 && (
          <div className="import-staging-section">
            <div className="staging-section-head">
              <div className="staging-title-box">
                <b>Parsed Features Preview & Editor ({stagedFeatures.length})</b>
                <span className="staging-stats">
                  {selectedCount} selected
                  {duplicateCount > 0 && (
                    <span className="staging-dup-warn"> • {duplicateCount} duplicate Asset No detected</span>
                  )}
                </span>
              </div>

              <div className="staging-toolbar">
                <button type="button" className="btn-sm" onClick={selectAllFeatures} title="Select all features">
                  Select All
                </button>
                <button type="button" className="btn-sm" onClick={deselectAllFeatures} title="Deselect all features">
                  Deselect All
                </button>
                <button
                  type="button"
                  className="btn-sm danger"
                  disabled={selectedCount === 0}
                  onClick={removeSelectedFeatures}
                  title="Remove selected features from staging"
                >
                  <Trash2 size={12} />
                  Remove Selected ({selectedCount})
                </button>

                <div className="strategy-selector-wrap">
                  <label>Duplicate Handling:</label>
                  <select
                    className="strategy-select"
                    value={duplicateStrategy}
                    onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
                  >
                    <option value="overwrite">Overwrite existing (Update)</option>
                    <option value="rename">Keep both (Auto-rename duplicates)</option>
                    <option value="skip">Skip duplicates (Ignore)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="staging-table-container">
              <table className="staging-table">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedCount === stagedFeatures.length && stagedFeatures.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) selectAllFeatures();
                          else deselectAllFeatures();
                        }}
                      />
                    </th>
                    <th style={{ width: 60 }}>#</th>
                    <th>Asset No (Editable)</th>
                    <th>Layer / Type (Editable)</th>
                    <th>Status</th>
                    <th>Geometry</th>
                    <th>Coordinates</th>
                    <th>File</th>
                    <th style={{ width: 60, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stagedFeatures.map((row, idx) => (
                    <tr key={row.uid} className={row.selected ? '' : 'row-deselected'}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => updateFeatureRow(row.uid, { selected: e.target.checked })}
                        />
                      </td>
                      <td className="muted">{idx + 1}</td>
                      <td>
                        <div className="table-input-cell">
                          <input
                            type="text"
                            className={`table-edit-input ${row.isDuplicate ? 'input-duplicate-warn' : ''}`}
                            value={row.assetNo}
                            onChange={(e) => updateFeatureRow(row.uid, { assetNo: e.target.value })}
                            placeholder="Asset Number"
                          />
                          {row.isDuplicate && (
                            <span className="duplicate-badge" title="Asset number exists in current GIS data">
                              Duplicate
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="table-edit-input"
                          value={row.assetType}
                          onChange={(e) => updateFeatureRow(row.uid, { assetType: e.target.value.toUpperCase() })}
                          placeholder="Layer Type"
                        />
                      </td>
                      <td>
                        <select
                          className="table-select-input"
                          value={row.status}
                          onChange={(e) => updateFeatureRow(row.uid, { status: e.target.value })}
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="MAINTENANCE">MAINTENANCE</option>
                          <option value="INACTIVE">INACTIVE</option>
                        </select>
                      </td>
                      <td>
                        <span className="geom-pill">{row.geometryType}</span>
                      </td>
                      <td className="coords-cell" title={row.coordsSummary}>
                        {row.coordsSummary}
                      </td>
                      <td className="muted filename-cell" title={row.fileName}>
                        {row.fileName}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="row-remove-btn"
                          title="Remove feature"
                          onClick={() => removeFeatureRow(row.uid)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="staging-bottom-bar">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setStagedFeatures([]);
                  setStagedFiles([]);
                }}
              >
                Clear All Staging
              </button>

              <button
                type="button"
                className="btn primary import-commit-btn"
                disabled={selectedCount === 0 || vm.busy}
                onClick={handleImportSelected}
              >
                <Check size={16} />
                Import Selected ({selectedCount}) Features
              </button>
            </div>
          </div>
        )}

        {/* Active Imported GIS Data Management Panel */}
        <div className="active-imported-section">
          <div className="active-imported-head">
            <div>
              <b>Currently Loaded Imported GIS Assets ({activeImported.length})</b>
              <div className="muted">Manage, filter, or delete active imported assets on your local map.</div>
            </div>

            <div className="active-imported-actions">
              <input
                type="text"
                className="active-search-input"
                placeholder="Search Asset No / Type…"
                value={searchActive}
                onChange={(e) => setSearchActive(e.target.value)}
              />

              <select
                className="active-filter-select"
                value={filterActiveLayer}
                onChange={(e) => setFilterActiveLayer(e.target.value)}
              >
                <option value="ALL">All Layers</option>
                {Array.from(new Set(activeImported.map((a) => a.assetType))).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="btn-sm"
                onClick={selectAllActive}
                disabled={filteredActiveAssets.length === 0}
              >
                Select All
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={deselectAllActive}
                disabled={selectedActiveIds.size === 0}
              >
                Deselect All
              </button>
              <button
                type="button"
                className="btn-sm danger"
                disabled={selectedActiveIds.size === 0}
                onClick={handleDeleteSelectedActive}
              >
                <Trash2 size={12} />
                Delete Selected ({selectedActiveIds.size})
              </button>
              <button
                type="button"
                className="btn-sm reset"
                disabled={activeImported.length === 0}
                onClick={handleClearAllActive}
              >
                Clear All
              </button>
            </div>
          </div>

          {activeImported.length === 0 ? (
            <div className="muted" style={{ padding: '16px 0' }}>
              No imported GIS assets currently loaded. Use the import tool above to upload KML, GeoJSON, CSV, or GPKG data.
            </div>
          ) : (
            <div className="active-imported-table-wrap">
              <table className="staging-table">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={
                          selectedActiveIds.size === filteredActiveAssets.length && filteredActiveAssets.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) selectAllActive();
                          else deselectAllActive();
                        }}
                      />
                    </th>
                    <th>Asset No</th>
                    <th>Layer / Type</th>
                    <th>Status</th>
                    <th>Geometry</th>
                    <th>Coordinates</th>
                    <th style={{ width: 60, textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActiveAssets.map((asset) => (
                    <tr key={asset.id}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedActiveIds.has(asset.id)}
                          onChange={() => toggleSelectActive(asset.id)}
                        />
                      </td>
                      <td>
                        <strong>{asset.assetNo}</strong>
                      </td>
                      <td>
                        <span className="layer-type-badge">{asset.assetType}</span>
                      </td>
                      <td>
                        <span className={`status-pill ${asset.status.toLowerCase()}`}>{asset.status}</span>
                      </td>
                      <td>
                        <span className="geom-pill">{asset.geometry?.type || 'Point'}</span>
                      </td>
                      <td className="coords-cell">
                        {asset.latitude !== undefined && asset.longitude !== undefined
                          ? `${asset.latitude.toFixed(4)}, ${asset.longitude.toFixed(4)}`
                          : 'Geometry'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="row-remove-btn"
                          title="Delete asset"
                          onClick={() => deleteAssets([asset.id])}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {(vm.message || vm.error) && (
          <div className={`notice ${vm.error ? 'danger' : 'success'}`} style={{ marginTop: 16 }}>
            {vm.error || vm.message}
          </div>
        )}

        <div className="backup-list">
          <div className="backup-list-head">
            <b>{UI.admin.data.history}</b>
            <button className="icon-btn" onClick={vm.refreshBackups} title={UI.admin.data.refresh}>
              <RefreshCw size={15} />
            </button>
          </div>
          {vm.backups.length ? (
            <div className="backup-rows">
              {vm.backups.slice(0, 8).map((b: any) => (
                <div className="backup-row" key={b.backup_id}>
                  <span className="backup-id">{b.backup_id}</span>
                  <span className="backup-date">{new Date(b.created_at).toLocaleString()}</span>
                  <span className="status active">{b.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">{UI.admin.data.noBackups}</div>
          )}
        </div>
      </div>
    </section>
  );
}
