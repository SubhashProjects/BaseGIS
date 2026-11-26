import type { LucideIcon } from './icons';
import { Zap, LayoutDashboard, Map, Database, ClipboardCheck, ShieldCheck, DatabaseBackup, X } from './icons';
import { APP, ROUTES } from '../config/constants';
import type { PowerGISUser } from '../services/powergisData';

interface Props {
  path: string;
  onNavigate: (p: string) => void;
  user?: PowerGISUser | null;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem { label: string; route: string; Icon: LucideIcon; }

export function Sidebar({ path, onNavigate, user, mobileOpen, onCloseMobile }: Props) {
  const items: NavItem[] = [
    { label: 'Dashboard', route: ROUTES.dashboard, Icon: LayoutDashboard },
    { label: 'GIS Master Map', route: ROUTES.gis, Icon: Map },
    { label: 'Assets', route: ROUTES.assets, Icon: Database },
    { label: 'Approvals', route: ROUTES.approvals, Icon: ClipboardCheck },
    ...(user?.role === 'GIS_ADMIN'
      ? [
          { label: 'Data Management', route: ROUTES.dataManagement, Icon: DatabaseBackup },
          { label: 'Administration', route: ROUTES.admin, Icon: ShieldCheck },
        ]
      : []),
  ];

  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Primary navigation">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true"><Zap size={19} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="brand-title">{APP.name}</div>
          {APP.subtitle ? <div className="brand-sub">{APP.subtitle}</div> : null}
        </div>
        {onCloseMobile && (
          <button className="mobile-close-btn" onClick={onCloseMobile} aria-label="Close navigation" type="button">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="nav">
        <div className="nav-section-label">Workspace</div>
        {items.slice(0, 4).map(({ label, route, Icon }) => (
          <button className={path === route ? 'active' : ''} key={route} onClick={() => { onNavigate(route); onCloseMobile?.(); }} type="button" aria-current={path === route ? 'page' : undefined}>
            <Icon size={18} /> <span>{label}</span>
          </button>
        ))}
        {items.length > 4 && <div className="nav-section-label nav-section-admin">Administration</div>}
        {items.slice(4).map(({ label, route, Icon }) => (
          <button className={path === route ? 'active' : ''} key={route} onClick={() => { onNavigate(route); onCloseMobile?.(); }} type="button" aria-current={path === route ? 'page' : undefined}>
            <Icon size={18} /> <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span>Operational GIS</span>
        <span className="sidebar-version">MVP</span>
      </div>
    </aside>
  );
}
