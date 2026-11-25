import { Bell, UserCircle, LogOut, Menu, Zap } from './icons';
import type { PowerGISUser } from '../services/powergisData';
import { APP } from '../config/constants';

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
          <button
            className="mobile-menu-btn"
            onClick={onToggleMobileMenu}
            aria-label="Open menu"
            type="button"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="mobile-brand">
          <div className="mobile-brand-mark">
            <Zap size={14} fill="#facc15" color="#facc15" strokeWidth={1} />
          </div>
          <span className="mobile-brand-title">{APP.name}</span>
        </div>
      </div>
      <div className="topbar-right">
        <Bell size={18} />
        <div className="user-menu">
          <UserCircle size={20} />
          <span>{user.displayName}</span>
          <small>{user.role}</small>
        </div>
        <button className="icon-btn" title="Sign out" onClick={onLogout} type="button">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
