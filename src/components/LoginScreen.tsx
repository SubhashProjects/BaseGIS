import { useMemo, useState } from 'react';
import usersRaw from '../../data/simulator/users.json';
import { ShieldCheck, UserRound } from 'lucide-react';

export type DemoUser = {
  id: string;
  username: string;
  displayName: string;
  role: 'GIS_ADMIN' | 'JE';
  subdivision: string | null;
  division: string | null;
  circle: string | null;
  department: string | null;
  admin: string | null;
  region: string;
  jurisdictions: string[];
  simulatorOnly: boolean;
};

const users = usersRaw as DemoUser[];

export function LoginScreen({ onLogin }: { onLogin: (user: DemoUser) => void }) {
  const [selected, setSelected] = useState(users[0]?.username ?? '');
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => users.filter((u) => `${u.displayName} ${u.subdivision ?? ''} ${u.division ?? ''} ${u.circle ?? ''} ${u.department ?? ''}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  const current = users.find((u) => u.username === selected) ?? users[0];

  if (!current) return null;

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">P</div>
          <div><strong>PowerGIS</strong><span>Electricity Distribution GIS</span></div>
        </div>
        <div className="sim-banner">SIMULATOR / DEMO LOGIN — USERS COPIED FROM SUPPLIED EXCEL</div>
        <h1>Sign in to PowerGIS</h1>
        <p className="muted">Select the exact JE / User Name from the supplied organisation Excel. The hierarchy below is populated from the Excel's merged hierarchy cells, so each JE carries its Sub Division, Division, Circle and Department.</p>

        <label className="login-search">Find user
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search JE / User Name, subdivision or division…" />
        </label>

        <div className="user-picker">
          {filtered.map((u) => (
            <button key={u.id} className={selected === u.username ? 'selected' : ''} onClick={() => setSelected(u.username)}>
              <UserRound size={16} />
              <span><b>{u.displayName}</b><small>{u.role} • {u.region}</small></span>
            </button>
          ))}
        </div>

        <div className="selected-user">
          <ShieldCheck size={18} />
          <div>
            <b>{current.displayName}</b>
            <div className="muted">{current.role} • {current.region}</div>
            <div className="login-hierarchy">
              <span><b>Sub Division:</b> {current.subdivision ?? '—'}</span>
              <span><b>Division:</b> {current.division ?? '—'}</span>
              <span><b>Circle:</b> {current.circle ?? '—'}</span>
              <span><b>Dept:</b> {current.department ?? '—'}</span>
              <span><b>Admin:</b> {current.admin ?? '—'}</span>
            </div>
          </div>
        </div>

        <button className="btn primary login-btn" onClick={() => onLogin(current)}>Enter PowerGIS Simulator as {current.displayName}</button>
        <div className="login-note">Demo authentication only. No production account, password or Supabase identity is used. The selected Excel identity and hierarchy control the simulator session.</div>
      </div>
    </div>
  );
}
