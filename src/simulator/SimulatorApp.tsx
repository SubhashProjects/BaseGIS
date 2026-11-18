import { useMemo, useState } from 'react';
import { simulatorAssets, simulatorJurisdictions, simulatorUsers } from './data';
import type { SimulatorRole } from './types';
import './simulator.css';

const labels: Record<string, string> = {
  SUBSTATION: 'Substations', EHV_LINE: 'EHV Lines', HV_LINE: 'HV Lines', DT: 'Distribution Transformers', LT_LINE: 'LT Lines', POLE: 'Poles', SMART_METER: 'Smart Meters'
};

function MapCanvas({ activeRegion, setActiveRegion }: { activeRegion: string; setActiveRegion: (v: string) => void }) {
  const visible = useMemo(() => simulatorAssets.filter(a => activeRegion === 'ALL' || a.jurisdictionIds.includes(activeRegion)), [activeRegion]);
  return <section className="sim-map-card">
    <div className="sim-map-toolbar">
      <span className="sim-chip warning">SIMULATOR DATA ONLY</span>
      <select value={activeRegion} onChange={e => setActiveRegion(e.target.value)}><option value="ALL">All regions</option>{simulatorJurisdictions.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}</select>
    </div>
    <div className="sim-map">
      <div className="sim-grid" />
      {simulatorJurisdictions.map((j, idx) => (
        <div key={j.id} className={`sim-boundary b-${idx}`} style={{ borderColor: j.color }} onClick={() => setActiveRegion(j.id)}>
          <span style={{ color: j.color }}>{j.label} • illustrative boundary</span>
        </div>
      ))}
      {visible.map(a => <div key={a.id} className="sim-marker" title={`${a.assetNo} • ${labels[a.assetType] ?? a.assetType}`} style={{ left: `${18 + ((a.coordinates[1] * 1000) % 64)}%`, top: `${18 + ((a.coordinates[0] * 1000) % 60)}%` }} />)}
      <div className="sim-map-note">Synthetic map canvas • coordinates are demo placements, not authoritative GIS boundaries.</div>
    </div>
  </section>;
}

export function SimulatorApp() {
  const [activeRegion, setActiveRegion] = useState('ALL');
  const [role, setRole] = useState<SimulatorRole>('GIS_ADMIN');
  const [enabled, setEnabled] = useState(true);
  const [showUsers, setShowUsers] = useState(false);
  const filteredAssets = simulatorAssets.filter(a => activeRegion === 'ALL' || a.jurisdictionIds.includes(activeRegion));
  const filteredUsers = simulatorUsers.filter(u => role === 'GIS_ADMIN' || u.role === role);
  if (!enabled) return <div className="sim-disabled"><div><span className="sim-chip warning">SIMULATOR OFF</span><h1>PowerGIS Simulator is disabled</h1><p>Set <code>VITE_SIMULATOR_ENABLED=true</code> to enable the isolated simulator site.</p><button onClick={() => setEnabled(true)}>Turn on for this session</button></div></div>;
  return <div className="sim-app">
    <header className="sim-header"><div><div className="sim-brand">PowerGIS <span>Simulator</span></div><div className="sim-sub">Isolated synthetic environment — never production data</div></div><div className="sim-actions"><label className="toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /><span /></label><span>Simulator ON</span><button onClick={() => setEnabled(false)}>Turn off</button></div></header>
    <main className="sim-main">
      <section className="sim-hero"><div><span className="sim-chip warning">DEMO / SIMULATION</span><h1>PowerGIS Test Environment</h1><p>Use this isolated site to test roles, jurisdiction visibility, shared-boundary assets, approvals and dummy electricity-network data.</p></div><div className="sim-controls"><label>Act as role<select value={role} onChange={e => setRole(e.target.value as SimulatorRole)}><option value="GIS_ADMIN">GIS Admin</option><option value="SE">SE</option><option value="EE">EE</option><option value="AE">AE</option><option value="JE">JE</option><option value="CONTRACTOR">Contractor</option></select></label><button onClick={() => setShowUsers(v => !v)}>{showUsers ? 'Hide' : 'Show'} dummy users</button></div></section>
      <section className="sim-stats">{[['Users', simulatorUsers.length], ['Assets', filteredAssets.length], ['Jurisdictions', activeRegion === 'ALL' ? 4 : 1], ['Shared-boundary assets', filteredAssets.filter(a => a.jurisdictionIds.length > 1).length]].map(([l,v]) => <div className="sim-stat" key={String(l)}><span>{l}</span><strong>{v}</strong></div>)}</section>
      <MapCanvas activeRegion={activeRegion} setActiveRegion={setActiveRegion} />
      <section className="sim-panels">
        <div className="sim-panel"><div className="sim-panel-title">Jurisdiction visibility test</div><p>Users only see assets assigned to their jurisdiction. An asset assigned to two jurisdictions is intentionally visible to authorized users in both.</p><div className="sim-boundary-list">{simulatorJurisdictions.map(j => <button key={j.id} onClick={() => setActiveRegion(j.id)}>{j.label}<span>{filteredAssets.filter(a => a.jurisdictionIds.includes(j.id)).length} assets</span></button>)}</div></div>
        <div className="sim-panel"><div className="sim-panel-title">Asset status</div>{Object.entries(labels).map(([k,v]) => <div className="sim-row" key={k}><span>{v}</span><strong>{filteredAssets.filter(a => a.assetType === k).length}</strong></div>)}</div>
      </section>
      {showUsers && <section className="sim-panel user-panel"><div className="sim-panel-title">Dummy users from supplied organisation workbook</div><div className="sim-table-wrap"><table><thead><tr><th>Simulator identity</th><th>Role</th><th>Subdivision</th><th>Division</th><th>Region</th><th>Simulator</th></tr></thead><tbody>{filteredUsers.map(u => <tr key={u.id}><td>{u.displayName}<div className="sim-muted">{u.username}</div></td><td>{u.role}</td><td>{u.subdivision ?? '—'}</td><td>{u.division ?? '—'}</td><td>{u.jurisdictions.join(', ')}</td><td><span className="sim-chip">YES</span></td></tr>)}</tbody></table></div></section>}
      <footer className="sim-footer">All names, assets, coordinates and boundaries shown here are simulator/demo data. Do not use this environment for departmental records or operational decisions.</footer>
    </main>
  </div>;
}
