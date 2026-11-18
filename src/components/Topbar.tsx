import { Bell, UserCircle, LogOut } from 'lucide-react';
import type { PowerGISUser } from '../services/powergisData';

export function Topbar({ user, onLogout }: { user: PowerGISUser; onLogout: () => void }) {
  return (
    <header className="topbar">
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
        <Bell size={18} />
        <div className="user-menu">
          <UserCircle size={20} />
          <span>{user.displayName}</span>
          <small>{user.role}</small>
        </div>
        <button className="icon-btn" title="Sign out" onClick={onLogout}>
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
