import type { LucideIcon } from './icons';
import { Zap, LayoutDashboard, Map, Database, ClipboardCheck, ShieldCheck, DatabaseBackup, X } from './icons';
import { APP, ROUTES } from '../config/constants';

interface Props {
  path: string;
  onNavigate: (p: string) => void;
  user?: any;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  label: string;
  route: string;
  Icon: LucideIcon;
}

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

  const handleNav = (route: string) => {
    onNavigate(route);
    onCloseMobile?.();
  };

  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand">
        <div className="brand-mark" aria-label="Electricity Symbol">
          <Zap size={18} fill="#facc15" color="#facc15" strokeWidth={1} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="brand-title">{APP.name}</div>
          {APP.subtitle ? <div className="brand-sub">{APP.subtitle}</div> : null}
        </div>
        {onCloseMobile && (
          <button
            className="mobile-close-btn"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            type="button"
          >
            <X size={20} />
          </button>
        )}
      </div>
      <nav className="nav">
        {items.map(({ label, route, Icon }) => (
          <button
            className={path === route ? 'active' : ''}
            key={route}
            onClick={() => handleNav(route)}
            type="button"
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
