import { Bell, UserCircle, LogOut, Menu, Search } from './icons';
import type { PowerGISUser } from '../services/powergisData';

interface TopbarProps {
  user: PowerGISUser;
  onLogout: () => void;
  onToggleMobileMenu?: () => void;
}

export function Topbar({ user, onLogout, onToggleMobileMenu }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        {onToggleMobileMenu && (
          <button className="mobile-menu-btn" onClick={onToggleMobileMenu} aria-label="Open navigation" type="button">
            <Menu size={20} />
          </button>
        )}
        <div className="mobile-brand" aria-label="PowerGIS">
          <span className="mobile-brand-mark"><span>⚡</span></span>
          <span className="mobile-brand-title">PowerGIS</span>
        </div>
      </div>
      <div className="topbar-right">
        <label className="topbar-search" aria-label="Search workspace">
          <Search size={16} />
          <input type="search" placeholder="Search assets, areas or IDs" />
        </label>
        <button className="icon-btn topbar-notification" title="Notifications" aria-label="Notifications" type="button">
          <Bell size={17} />
          <span aria-hidden="true" />
        </button>
        <div className="user-menu">
          <UserCircle size={20} />
          <span>{user.displayName}</span>
          <small>{user.role}</small>
        </div>
        <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={onLogout} type="button">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
