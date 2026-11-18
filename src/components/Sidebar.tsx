import type { LucideIcon } from 'lucide-react';
import { Power, LayoutDashboard, Map, Database, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { APP, ROUTES } from '../config/constants';

interface Props {
  path: string;
  onNavigate: (p: string) => void;
  user?: any;
}

interface NavItem {
  label: string;
  route: string;
  Icon: LucideIcon;
}

export function Sidebar({ path, onNavigate, user }: Props) {
  const items: NavItem[] = [
    { label: 'Dashboard', route: ROUTES.dashboard, Icon: LayoutDashboard },
    { label: 'GIS Master Map', route: ROUTES.gis, Icon: Map },
    { label: 'Assets', route: ROUTES.assets, Icon: Database },
    { label: 'Approvals', route: ROUTES.approvals, Icon: ClipboardCheck },
    ...(user?.role === 'GIS_ADMIN' ? [{ label: 'Administration', route: ROUTES.admin, Icon: ShieldCheck }] : []),
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-label="Power Symbol">
          <Power size={18} strokeWidth={2.5} />
        </div>
        <div>
          <div className="brand-title">{APP.name}</div>
          <div className="brand-sub">{APP.subtitle}</div>
        </div>
      </div>
      <nav className="nav">
        {items.map(({ label, route, Icon }) => (
          <button
            className={path === route ? 'active' : ''}
            key={route}
            onClick={() => onNavigate(route)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">Authorised GIS view</div>
    </aside>
  );
}
