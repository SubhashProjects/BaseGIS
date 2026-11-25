import { useRef, useState } from 'react';
import { DatabaseBackup, Download, FileUp, RefreshCw, ShieldCheck } from '../../components/icons';
import { useGisLayers, PRESET_LAYER_COLORS, filenameToLayerInfo } from '../../services/layerService';
import { UI } from '../../config/ui.config';
import { supportedImportAccept } from '../../services/dataManagementService';
import { useDataManagementViewModel } from '../../viewmodels/useDataManagementViewModel';
import type { PowerGISUser } from '../../services/powergisData';

interface StagedImport {
  id: string;
  file: File;
  layerLabel: string;
  layerId: string;
  layerColor: string;
}

export function DataManagementPanel({ currentUser }: { currentUser: PowerGISUser }) {
  const vm = useDataManagementViewModel(currentUser);
  const { layers, ensureLayer } = useGisLayers();
  const input = useRef<HTMLInputElement>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedImport[]>([]);
  const [format, setFormat] = useState<'geojson' | 'csv' | 'json'>('geojson');

  if (currentUser.role !== 'GIS_ADMIN') return null;

  const handleFilesChosen = (fileList: File[]) => {
    if (!fileList.length) return;
    const newStaged: StagedImport[] = fileList.map((f, i) => {
      const derived = filenameToLayerInfo(f.name);
      return {
        id: `${f.name}-${Date.now()}-${i}`,
        file: f,
        layerLabel: derived.label,
        layerId: derived.id,
        layerColor: PRESET_LAYER_COLORS[(layers.length + stagedFiles.length + i) % PRESET_LAYER_COLORS.length],
      };
    });
    setStagedFiles((prev) => [...prev, ...newStaged]);
  };

  const updateStaged = (id: string, updates: Partial<StagedImport>) => {
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
  };

  const handleImportSingle = async (staged: StagedImport) => {
    try {
      ensureLayer(staged.layerLabel, staged.layerColor, staged.layerId);
      await vm.importFile(staged.file, staged.layerId);
      setStagedFiles((prev) => prev.filter((s) => s.id !== staged.id));
    } catch (err) {
      console.warn(`Error importing ${staged.file.name}:`, err);
    }
  };

  const handleImportAll = async () => {
    for (const staged of stagedFiles) {
      await handleImportSingle(staged);
    }
  };

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
        <div className="data-grid">
          <div className="data-card">
            <div className="data-card-icon">
              <FileUp size={20} />
            </div>
            <h3>{UI.admin.data.importTitle}</h3>
            <p>Select GIS files. Layer names are automatically inferred from filenames with full option to edit before importing.</p>

            <button
              type="button"
              className="btn primary"
              disabled={vm.busy}
              onClick={() => input.current?.click()}
            >
              <FileUp size={15} />
              {stagedFiles.length > 0 ? 'Select more files…' : 'Select GIS File(s) to Import'}
            </button>
            <input
              ref={input}
              hidden
              type="file"
              accept={supportedImportAccept()}
              multiple={true}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                handleFilesChosen(files);
                e.currentTarget.value = '';
              }}
            />
            <div className="file-hint">KML · GeoJSON · CSV · GPKG (Single or Multi-select)</div>

            {stagedFiles.length > 0 && (
              <div className="staged-import-queue">
                <div className="staged-queue-header">
                  <span>Selected ({stagedFiles.length})</span>
                  {stagedFiles.length > 1 && (
                    <button
                      type="button"
                      className="staged-all-btn"
                      disabled={vm.busy}
                      onClick={handleImportAll}
                    >
                      Import All
                    </button>
                  )}
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
                        title="Remove file"
                        onClick={() => setStagedFiles((prev) => prev.filter((s) => s.id !== staged.id))}
                      >
                        ×
                      </button>
                    </div>

                    <div className="staged-field-group">
                      <label>Layer name (edit):</label>
                      <input
                        type="text"
                        className="staged-layer-input"
                        value={staged.layerLabel}
                        placeholder="Layer Name"
                        onChange={(e) => updateStaged(staged.id, { layerLabel: e.target.value })}
                      />
                    </div>

                    <div className="staged-color-group">
                      <label>Layer color:</label>
                      <div className="staged-color-swatches">
                        {PRESET_LAYER_COLORS.slice(0, 8).map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`staged-swatch ${staged.layerColor === c ? 'active' : ''}`}
                            style={{ background: c }}
                            onClick={() => updateStaged(staged.id, { layerColor: c })}
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="staged-import-single-btn"
                      disabled={vm.busy || !staged.layerLabel.trim()}
                      onClick={() => handleImportSingle(staged)}
                    >
                      Import into "{staged.layerLabel || 'Layer'}"
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
