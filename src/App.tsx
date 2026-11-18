import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './features/dashboard/Dashboard';
import { GisPage } from './features/gis/GisPage';
import { AssetsPage } from './features/assets/AssetsPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { AdminPage } from './features/admin/AdminPage';
import { ROUTES } from './config/constants';
import type { PowerGISUser } from './services/powergisData';

const SESSION_KEY = 'powergis_session_user';

function setSessionCookie(name: string, value: string, days = 30) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function getSessionCookie(name: string): string | null {
  const matches = document.cookie.match(new RegExp('(?:^|; )' + encodeURIComponent(name) + '=([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : null;
}

function deleteSessionCookie(name: string) {
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`;
}

function getStoredUser(): PowerGISUser | null {
  try {
    const fromStorage = localStorage.getItem(SESSION_KEY);
    if (fromStorage) {
      return JSON.parse(fromStorage) as PowerGISUser;
    }
  } catch {
    // continue to cookie
  }

  try {
    const fromCookie = getSessionCookie(SESSION_KEY);
    if (fromCookie) {
      return JSON.parse(fromCookie) as PowerGISUser;
    }
  } catch {
    // ignore
  }

  return null;
}

export default function App() {
  const [user, setUser] = useState<PowerGISUser | null>(getStoredUser);

  const [path, setPath] = useState<string>(() => {
    const hash = location.hash.replace('#', '');
    return hash || ROUTES.dashboard;
  });

  const navigate = (p: string) => {
    setPath(p);
    location.hash = p;
  };

  const handleLogin = (newUser: PowerGISUser) => {
    setUser(newUser);
    const serialized = JSON.stringify(newUser);
    try {
      localStorage.setItem(SESSION_KEY, serialized);
    } catch (e) {
      console.warn('Unable to save to localStorage:', e);
    }
    try {
      setSessionCookie(SESSION_KEY, serialized, 30);
    } catch (e) {
      console.warn('Unable to save session cookie:', e);
    }
    setPath(ROUTES.dashboard);
    location.hash = ROUTES.dashboard;
  };

  const handleLogout = () => {
    setUser(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.warn('Unable to remove from localStorage:', e);
    }
    try {
      deleteSessionCookie(SESSION_KEY);
    } catch (e) {
      console.warn('Unable to delete session cookie:', e);
    }
    setPath(ROUTES.dashboard);
    location.hash = '';
  };

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  const view =
    path === ROUTES.gis ? (
      <GisPage currentUser={user} />
    ) : path === ROUTES.assets ? (
      <AssetsPage currentUser={user} />
    ) : path === ROUTES.approvals ? (
      <ApprovalsPage currentUser={user} />
    ) : path === ROUTES.admin ? (
      <AdminPage currentUser={user} />
    ) : (
      <Dashboard currentUser={user} />
    );

  return (
    <div className="app">
      <div className="shell">
        <Sidebar path={path} onNavigate={navigate} user={user} />
        <main className="main">
          <Topbar user={user} onLogout={handleLogout} />
          {view}
        </main>
      </div>
    </div>
  );
}
