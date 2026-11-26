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
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedFileMeta[]>([]);
  const [stagedFeatures, setStagedFeatures] = useState<StagedFeatureRow[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [isParsingFiles, setIsParsingFiles] = useState<boolean>(false);
  const [format, setFormat] = useState<'geojson' | 'csv' | 'json'>('geojson');

  // Pagination for staged features preview
  const [stagePage, setStagePage] = useState<number>(1);
  const [stagePageSize, setStagePageSize] = useState<number>(50);

  // Active imported GIS assets state & pagination
  const [activeImported, setActiveImported] = useState<PowerGISAsset[]>(getLocalImportedAssets);
  const [selectedActiveIds, setSelectedActiveIds] = useState<Set<string>>(new Set());
  const [searchActive, setSearchActive] = useState<string>('');
  const [filterActiveLayer, setFilterActiveLayer] = useState<string>('ALL');
  const [activePage, setActivePage] = useState<number>(1);
  const [activePageSize, setActivePageSize] = useState<number>(25);

  // Real-time streaming import progress & live logging bar
  const [importProgress, setImportProgress] = useState<{
    active: boolean;
    stage: 'reading' | 'parsing' | 'indexing' | 'complete' | 'error';
    title: string;
    percent: number;
    message: string;
    processedCount: number;
    totalCount: number;
    logs: string[];
  }>({
    active: false,
    stage: 'reading',
    title: '',
    percent: 0,
    message: '',
    processedCount: 0,
    totalCount: 0,
    logs: [],
  });

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [importProgress.logs]);

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
    setImportProgress({
      active: true,
      stage: 'reading',
      title: `Processing ${fileList.map((f) => f.name).join(', ')}`,
      percent: 5,
      message: 'Opening file and initializing streaming parser...',
      processedCount: 0,
      totalCount: 0,
      logs: [
        `[${new Date().toLocaleTimeString()}] Selected ${fileList.length} file(s) for import: ${fileList
          .map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`)
          .join(', ')}`,
      ],
    });

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
        const parsed = await parseImportFile(f, derived.id, (prog) => {
          setImportProgress((prev) => ({
            ...prev,
            active: true,
            stage: prog.stage,
            percent: prog.percent,
            message: prog.message,
            processedCount: prog.processed ?? prev.processedCount,
            totalCount: prog.total ?? prev.totalCount,
            logs: prog.log ? [...prev.logs, prog.log] : prev.logs,
          }));
        });

        setImportProgress((prev) => ({
          ...prev,
          stage: 'parsing',
          percent: 92,
          message: `Staging ${parsed.length.toLocaleString()} features...`,
          processedCount: parsed.length,
          totalCount: parsed.length,
          logs: [
            ...prev.logs,
            `[${new Date().toLocaleTimeString()}] Normalizing ${parsed.length.toLocaleString()} features for preview...`,
          ],
        }));

        for (let featIdx = 0; featIdx < parsed.length; featIdx++) {
          const feat = parsed[featIdx];
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
        }
      } catch (err: any) {
        setImportProgress((prev) => ({
          ...prev,
          stage: 'error',
          message: err?.message || 'Error parsing file',
          logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ERROR: ${err?.message || err}`],
        }));
      }
    }

    setStagedFiles((prev) => [...prev, ...newFiles]);
    setStagedFeatures((prev) => [...prev, ...newRows]);
    setStagePage(1);
    setIsParsingFiles(false);

    setImportProgress((prev) => ({
      ...prev,
      stage: 'complete',
      percent: 100,
      message: `Parsed ${newRows.length.toLocaleString()} feature(s) successfully without UI lag. Ready to review or import.`,
      processedCount: newRows.length,
      totalCount: newRows.length,
      logs: [
        ...prev.logs,
        `[${new Date().toLocaleTimeString()}] Ready: ${newRows.length.toLocaleString()} features staged into interactive preview.`,
      ],
    }));
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
      setImportProgress({
        active: true,
        stage: 'indexing',
        title: `Committing ${toImport.length.toLocaleString()} Assets`,
        percent: 5,
        message: 'Synchronizing layer configurations...',
        processedCount: 0,
        totalCount: toImport.length,
        logs: [
          `[${new Date().toLocaleTimeString()}] Commencing import of ${toImport.length.toLocaleString()} features (Strategy: ${duplicateStrategy.toUpperCase()})...`,
        ],
      });

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

      // 3. Import with selected duplicate strategy and progress streaming
      const result = await importAssets(featuresPayload, duplicateStrategy, (prog) => {
        setImportProgress((prev) => ({
          ...prev,
          active: true,
          stage: prog.stage,
          percent: prog.percent,
          message: prog.message,
          processedCount: prog.processed ?? prev.processedCount,
          totalCount: prog.total ?? prev.totalCount,
          logs: prog.log ? [...prev.logs, prog.log] : prev.logs,
        }));
      });

      // Remove successfully handled rows from staging; keep rejected rows for correction/retry.
      const hasBatchFailure = result.errors.some((entry) => /^Batch \d+:/.test(entry));
      const failedAssetNos = new Set(result.errors.filter((entry) => !/^Batch \d+:/.test(entry)).map((entry) => entry.split(':')[0].trim().toLowerCase()));
      const handledUids = new Set(hasBatchFailure ? [] : toImport.filter((r) => !failedAssetNos.has(r.assetNo.trim().toLowerCase())).map((r) => r.uid));
      setStagedFeatures((prev) => prev.filter((r) => !handledUids.has(r.uid)));
      setStagedFiles((prev) => prev.filter((f) => stagedFeatures.some((r) => !handledUids.has(r.uid) && r.fileId === f.id)));

      setImportProgress((prev) => ({
        ...prev,
        stage: result.errors.length ? 'error' : 'complete',
        percent: 100,
        message: result.errors.length
          ? `Import partially completed: ${result.inserted.toLocaleString()} inserted, ${result.skipped.toLocaleString()} skipped, ${result.errors.length.toLocaleString()} rejected. Rejected rows remain staged.`
          : `Server import complete: ${result.inserted.toLocaleString()} inserted (${result.skipped.toLocaleString()} duplicates skipped).`,
        processedCount: result.inserted + result.skipped,
        totalCount: toImport.length,
        logs: [
          ...prev.logs,
          `[${new Date().toLocaleTimeString()}] Server result: ${result.inserted.toLocaleString()} inserted, ${result.skipped.toLocaleString()} skipped, ${result.errors.length.toLocaleString()} errors.`,
        ],
      }));
    } catch (err: any) {
      setImportProgress((prev) => ({
        ...prev,
        stage: 'error',
        message: err?.message || 'Failed to import features',
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ERROR: ${err?.message || err}`],
      }));
    }
  };

  // Staged pagination calculations
  const totalStagePages = Math.ceil(stagedFeatures.length / stagePageSize) || 1;
  const paginatedStaged = useMemo(() => {
    const start = (stagePage - 1) * stagePageSize;
    return stagedFeatures.slice(start, start + stagePageSize);
  }, [stagedFeatures, stagePage, stagePageSize]);

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

  const totalActivePages = Math.ceil(filteredActiveAssets.length / activePageSize) || 1;
  const paginatedActive = useMemo(() => {
    const start = (activePage - 1) * activePageSize;
    return filteredActiveAssets.slice(start, start + activePageSize);
  }, [filteredActiveAssets, activePage, activePageSize]);

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
      try {
        await deleteAssets(Array.from(selectedActiveIds));
        setSelectedActiveIds(new Set());
      } catch (error: any) {
        alert(error?.message || 'Asset deletion was not saved.');
      }
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
        {/* Real-time Import Engine Progress & Live Log Terminal */}
        {importProgress.active && (
          <div className="import-progress-card">
            <div className="import-progress-header">
              <div className="import-progress-title-row">
                <span
                  className={`import-pulse-dot ${
                    importProgress.stage === 'error'
                      ? 'error'
                      : importProgress.stage === 'complete'
                      ? 'done'
                      : 'active'
                  }`}
                />
                <b>{importProgress.title || 'GIS Import Engine'}</b>
                <span className={`import-stage-pill ${importProgress.stage}`}>{importProgress.stage.toUpperCase()}</span>
              </div>
              <span className="import-percent-badge">{importProgress.percent}%</span>
            </div>

            <div className="import-progress-bar-track">
              <div
                className={`import-progress-bar-fill ${importProgress.stage}`}
                style={{ width: `${Math.max(3, Math.min(100, importProgress.percent))}%` }}
              />
            </div>

            <div className="import-progress-sub-row">
              <span className="import-progress-msg">{importProgress.message}</span>
              {importProgress.totalCount > 0 && (
                <span className="import-progress-counter">
                  {importProgress.processedCount.toLocaleString()} / {importProgress.totalCount.toLocaleString()} records
                </span>
              )}
            </div>

            {/* Live Log Stream Console */}
            <div className="import-log-box">
              <div className="import-log-head">
                <span>Real-time Import Logs</span>
                <span className="muted">{importProgress.logs.length} events logged</span>
              </div>
              <div className="import-log-terminal" ref={logContainerRef}>
                {importProgress.logs.map((line, idx) => (
                  <div key={idx} className="import-log-line">
                    <span className="log-prompt">›</span> {line}
                  </div>
                ))}
              </div>
            </div>

            {importProgress.stage === 'complete' && (
              <div className="import-progress-footer">
                <span className="import-success-msg">✓ Processed without UI lag. Indexed in local storage & ready on map.</span>
                <button
                  type="button"
                  className="dm-sync-btn"
                  onClick={() => setImportProgress((prev) => ({ ...prev, active: false }))}
                >
                  Dismiss
                </button>
              </div>
            )}
            {importProgress.stage === 'error' && (
              <div className="import-progress-footer">
                <span className="staging-dup-warn">⚠ Import encountered an issue. Review logs above.</span>
                <button
                  type="button"
                  className="dm-sync-btn danger"
                  onClick={() => setImportProgress((prev) => ({ ...prev, active: false }))}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}

        <div className="data-grid">
          {/* Card 1: Import GIS Files */}
          <div className="data-card">
            <div className="data-card-icon">
              <FileUp size={20} />
            </div>
            <h3>{UI.admin.data.importTitle}</h3>

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
            <div className="field-row">
              <label>Retention policy</label>
              <div className="field-static-value">Daily snapshot · 30 days retention</div>
            </div>
            <button className="btn" disabled={vm.busy} onClick={vm.backupNow}>
              <DatabaseBackup size={15} />
              {UI.admin.data.backupButton}
            </button>
            <div className="file-hint">{UI.admin.data.dailySchedule} Backup, download and restore controls are available only to GIS Admin. Restore merges the snapshot and never deletes current records.</div>
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
                <div className="dm-synced-btn-group">
                  <button
                    type="button"
                    className="dm-sync-btn"
                    onClick={selectAllFeatures}
                    title="Select all features"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="dm-sync-btn"
                    onClick={deselectAllFeatures}
                    title="Deselect all features"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    className={`dm-sync-btn danger ${selectedCount > 0 ? 'active' : ''}`}
                    disabled={selectedCount === 0}
                    onClick={removeSelectedFeatures}
                    title={selectedCount > 0 ? `Remove ${selectedCount} selected feature(s) from staging` : 'Select features to remove'}
                  >
                    <Trash2 size={13} />
                    <span>Remove Selected ({selectedCount})</span>
                  </button>
                </div>

                <div className="strategy-selector-wrap">
                  <label>Duplicate Handling:</label>
                  <select
                    className="strategy-select"
                    value={duplicateStrategy}
                    onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
                  >
                    <option value="skip">Skip duplicates (safe server-side mode)</option>
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
                  {paginatedStaged.map((row, idx) => {
                    const realIdx = (stagePage - 1) * stagePageSize + idx;
                    return (
                      <tr key={row.uid} className={row.selected ? '' : 'row-deselected'}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => updateFeatureRow(row.uid, { selected: e.target.checked })}
                          />
                        </td>
                        <td className="muted">{realIdx + 1}</td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Staging Pagination Controls */}
            {totalStagePages > 1 && (
              <div className="dm-pagination-bar" style={{ marginTop: 8 }}>
                <span className="muted">
                  Showing {(stagePage - 1) * stagePageSize + 1} -{' '}
                  {Math.min(stagePage * stagePageSize, stagedFeatures.length)} of{' '}
                  {stagedFeatures.length.toLocaleString()} staged features
                </span>
                <div className="dm-page-btns">
                  <button
                    type="button"
                    className="dm-sync-btn"
                    disabled={stagePage <= 1}
                    onClick={() => setStagePage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="pagination-indicator">
                    Page {stagePage} of {totalStagePages}
                  </span>
                  <button
                    type="button"
                    className="dm-sync-btn"
                    disabled={stagePage >= totalStagePages}
                    onClick={() => setStagePage((p) => Math.min(totalStagePages, p + 1))}
                  >
                    Next
                  </button>
                  <select
                    className="dm-pagesize-select"
                    value={stagePageSize}
                    onChange={(e) => {
                      setStagePageSize(Number(e.target.value));
                      setStagePage(1);
                    }}
                  >
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>
              </div>
            )}

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

              <div className="dm-synced-btn-group">
                <button
                  type="button"
                  className="dm-sync-btn"
                  onClick={selectAllActive}
                  disabled={filteredActiveAssets.length === 0}
                  title="Select all imported records"
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="dm-sync-btn"
                  onClick={deselectAllActive}
                  disabled={selectedActiveIds.size === 0}
                  title="Deselect all records"
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  className={`dm-sync-btn danger ${selectedActiveIds.size > 0 ? 'active' : ''}`}
                  disabled={selectedActiveIds.size === 0}
                  onClick={handleDeleteSelectedActive}
                  title={selectedActiveIds.size > 0 ? `Delete ${selectedActiveIds.size} selected record(s)` : 'Select records to delete'}
                >
                  <Trash2 size={13} />
                  <span>Delete Selected ({selectedActiveIds.size})</span>
                </button>
                <button
                  type="button"
                  className={`dm-sync-btn danger ${activeImported.length > 0 ? 'active' : ''}`}
                  disabled={activeImported.length === 0}
                  onClick={handleClearAllActive}
                  title="Clear all imported records from storage"
                >
                  <Trash2 size={13} />
                  <span>Clear All</span>
                </button>
              </div>
            </div>
          </div>

          {activeImported.length === 0 ? (
            <div className="muted" style={{ padding: '16px 0' }}>
              No imported GIS assets currently loaded. Use the import tool above to upload KML, GeoJSON, CSV, or GPKG data.
            </div>
          ) : (
            <>
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
                    {paginatedActive.map((asset) => (
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
                            onClick={async () => {
                              try { await deleteAssets([asset.id]); }
                              catch (error: any) { alert(error?.message || 'Asset deletion was not saved.'); }
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Active Imported Pagination Controls */}
              {totalActivePages > 1 && (
                <div className="dm-pagination-bar" style={{ marginTop: 8 }}>
                  <span className="muted">
                    Showing {(activePage - 1) * activePageSize + 1} -{' '}
                    {Math.min(activePage * activePageSize, filteredActiveAssets.length)} of{' '}
                    {filteredActiveAssets.length.toLocaleString()} active imported assets
                  </span>
                  <div className="dm-page-btns">
                    <button
                      type="button"
                      className="dm-sync-btn"
                      disabled={activePage <= 1}
                      onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="pagination-indicator">
                      Page {activePage} of {totalActivePages}
                    </span>
                    <button
                      type="button"
                      className="dm-sync-btn"
                      disabled={activePage >= totalActivePages}
                      onClick={() => setActivePage((p) => Math.min(totalActivePages, p + 1))}
                    >
                      Next
                    </button>
                    <select
                      className="dm-pagesize-select"
                      value={activePageSize}
                      onChange={(e) => {
                        setActivePageSize(Number(e.target.value));
                        setActivePage(1);
                      }}
                    >
                      <option value={25}>25 / page</option>
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                    </select>
                  </div>
                </div>
              )}
            </>
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
              {vm.backups.slice(0, 12).map((b: any) => (
                <div className="backup-row" key={b.backup_id}>
                  <span className="backup-id">{b.backup_id}</span>
                  <span className="backup-date">{new Date(b.created_at).toLocaleString()}</span>
                  <span className={`status ${b.status === 'COMPLETED' ? 'active' : b.status === 'FAILED' ? 'danger' : ''}`}>{b.status}</span>
                  <span className="backup-actions">
                    <button type="button" className="icon-btn" disabled={vm.busy || b.status !== 'COMPLETED'} onClick={() => vm.downloadBackup(b.backup_id)} title="Download backup" aria-label={`Download ${b.backup_id}`}><Download size={14} /></button>
                    <button type="button" className="icon-btn" disabled={vm.busy || b.status !== 'COMPLETED'} onClick={() => { if (window.confirm(`Restore ${b.backup_id}? This merges the snapshot into the current database, updates matching records, preserves existing credentials and does not delete current records. Take a fresh backup first.`)) void vm.restoreBackup(b.backup_id); }} title="Restore backup" aria-label={`Restore ${b.backup_id}`}><DatabaseBackup size={14} /></button>
                  </span>
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
