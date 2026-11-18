import { useRef, useState } from 'react';
import { DatabaseBackup, Download, FileUp, RefreshCw, ShieldCheck } from 'lucide-react';
import { ASSET_LABELS, ASSET_TYPES } from '../../config/constants';
import { UI } from '../../config/ui.config';
import { supportedImportAccept } from '../../services/dataManagementService';
import { useDataManagementViewModel } from '../../viewmodels/useDataManagementViewModel';
import type { PowerGISUser } from '../../services/powergisData';

export function DataManagementPanel({ currentUser }: { currentUser: PowerGISUser }) {
  const vm = useDataManagementViewModel(currentUser);
  const input = useRef<HTMLInputElement>(null);
  const [assetType, setAssetType] = useState<string>(ASSET_TYPES[0]);
  const [format, setFormat] = useState<'geojson'|'csv'|'json'>('geojson');
  if (currentUser.role !== 'GIS_ADMIN') return null;
  return <section className="panel data-management">
    <div className="panel-head data-head"><div><b>{UI.admin.data.title}</b><div className="muted">{UI.admin.data.subtitle}</div></div><ShieldCheck size={18}/></div>
    <div className="panel-body">
      <div className="data-grid">
        <div className="data-card"><FileUp size={22}/><h3>{UI.admin.data.importTitle}</h3><p>{UI.admin.data.importHelp}</p><div className="field-row"><label>{UI.admin.data.assetType}</label><select value={assetType} onChange={(e)=>setAssetType(e.target.value)}>{ASSET_TYPES.map(t=><option key={t} value={t}>{ASSET_LABELS[t]??t}</option>)}</select></div><button className="btn primary" disabled={vm.busy} onClick={()=>input.current?.click()}><FileUp size={16}/>{vm.busy?UI.common.loading:UI.admin.data.importButton}</button><input ref={input} hidden type="file" accept={supportedImportAccept()} multiple={false} onChange={async(e)=>{const f=e.target.files?.[0]; if(f) await vm.importFile(f,assetType); e.currentTarget.value='';}}/><div className="file-hint">KML · GeoJSON · CSV · XLS/XLSX · GPKG</div></div>
        <div className="data-card"><Download size={22}/><h3>{UI.admin.data.exportTitle}</h3><p>{UI.admin.data.exportHelp}</p><div className="field-row"><label>{UI.admin.data.format}</label><select value={format} onChange={(e)=>setFormat(e.target.value as any)}><option value="geojson">GeoJSON</option><option value="csv">CSV</option><option value="json">PowerGIS JSON</option></select></div><button className="btn" disabled={vm.busy} onClick={()=>vm.exportData(format)}><Download size={16}/>{UI.admin.data.exportButton}</button><div className="file-hint">Export is limited to the signed-in user's authorised GIS scope.</div></div>
        <div className="data-card"><DatabaseBackup size={22}/><h3>{UI.admin.data.backupTitle}</h3><p>{UI.admin.data.backupHelp}</p><button className="btn" disabled={vm.busy} onClick={vm.backupNow}><DatabaseBackup size={16}/>{UI.admin.data.backupButton}</button><div className="file-hint">{UI.admin.data.dailySchedule}</div></div>
      </div>
      {(vm.message || vm.error) && <div className={`notice ${vm.error ? 'danger' : 'success'}`}>{vm.error || vm.message}</div>}
      <div className="backup-list"><div className="backup-list-head"><b>{UI.admin.data.history}</b><button className="icon-btn" onClick={vm.refreshBackups} title={UI.admin.data.refresh}><RefreshCw size={16}/></button></div>{vm.backups.length ? vm.backups.slice(0,8).map((b:any)=><div className="backup-row" key={b.backup_id}><span>{b.backup_id}</span><span>{new Date(b.created_at).toLocaleString()}</span><span className="status active">{b.status}</span></div>) : <div className="muted">{UI.admin.data.noBackups}</div>}</div>
    </div>
  </section>;
}
