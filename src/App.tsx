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

export default function App() {
  const [user, setUser] = useState<PowerGISUser | null>(null);
  const [path, setPath] = useState<string>(ROUTES.dashboard);

  const navigate = (p: string) => {
    setPath(p);
    location.hash = p;
  };

  const handleLogin = (newUser: PowerGISUser) => {
    setUser(newUser);
    setPath(ROUTES.dashboard);
    location.hash = ROUTES.dashboard;
  };

  const handleLogout = () => {
    setUser(null);
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
