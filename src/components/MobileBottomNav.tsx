import type { LucideIcon } from './icons';
import { LayoutDashboard, Map, Database, ClipboardCheck, ShieldCheck, DatabaseBackup } from './icons';
import { ROUTES } from '../config/constants';
import type { PowerGISUser } from '../services/powergisData';

interface NavItem {
  label: string;
  route: string;
  Icon: LucideIcon;
}

export function MobileBottomNav({
  path,
  onNavigate,
  user,
}: {
  path: string;
  onNavigate: (route: string) => void;
  user: PowerGISUser | null;
}) {
  const items: NavItem[] = [
    { label: 'Dashboard', route: ROUTES.dashboard, Icon: LayoutDashboard },
    { label: 'Map', route: ROUTES.gis, Icon: Map },
    { label: 'Assets', route: ROUTES.assets, Icon: Database },
    { label: 'Approvals', route: ROUTES.approvals, Icon: ClipboardCheck },
    ...(user?.role === 'GIS_ADMIN'
      ? [
          { label: 'Data', route: ROUTES.dataManagement, Icon: DatabaseBackup },
          { label: 'Admin', route: ROUTES.admin, Icon: ShieldCheck },
        ]
      : []),
  ];

  return (
    <nav className="mobile-bottom-nav">
      {items.map(({ label, route, Icon }) => {
        const isActive = path === route;
        return (
          <button
            key={route}
            className={`mobile-nav-btn ${isActive ? 'active' : ''}`}
            onClick={() => onNavigate(route)}
            title={label}
          >
            <Icon size={18} className="mobile-nav-icon" />
            <span className="mobile-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
