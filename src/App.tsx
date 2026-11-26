import { useState, useEffect, lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ROUTES } from './config/constants';
import { restoreAuthenticatedUser, revokeSession, type PowerGISUser } from './services/powergisData';

const LoginScreen = lazy(() => import('./components/LoginScreen').then((module) => ({ default: module.LoginScreen })));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })));
const GisPage = lazy(() => import('./features/gis/GisPage').then((module) => ({ default: module.GisPage })));
const AssetsPage = lazy(() => import('./features/assets/AssetsPage').then((module) => ({ default: module.AssetsPage })));
const ApprovalsPage = lazy(() => import('./features/approvals/ApprovalsPage').then((module) => ({ default: module.ApprovalsPage })));
const AdminPage = lazy(() => import('./features/admin/AdminPage').then((module) => ({ default: module.AdminPage })));
const DataManagementPage = lazy(() => import('./features/data-management/DataManagementPage').then((module) => ({ default: module.DataManagementPage })));


export default function App() {
  const [user, setUser] = useState<PowerGISUser | null>(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [path, setPath] = useState<string>(() => {
    const hash = location.hash.replace('#', '');
    return hash || ROUTES.dashboard;
  });

  const navigate = (p: string) => {
    setPath(p);
    location.hash = p;
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    let active = true;
    restoreAuthenticatedUser()
      .then((restored) => { if (active) setUser(restored); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setSessionChecking(false); });
    return () => { active = false; };
  }, []);

  // Sensitive GIS sessions are automatically logged out after 30 minutes of inactivity.
  useEffect(() => {
    if (!user) return;
    const IDLE_MS = 30 * 60 * 1000;
    let timer: number | undefined;
    const reset = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void revokeSession().catch(() => undefined).finally(() => {
          setUser(null);
          setPath(ROUTES.dashboard);
          location.hash = '';
        });
      }, IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    reset();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [user]);

  useEffect(() => {
    const handleHash = () => {
      const hash = location.hash.replace('#', '');
      if (hash) {
        setPath(hash);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleLogin = (newUser: PowerGISUser) => {
    setUser(newUser);
    setPath(ROUTES.dashboard);
    location.hash = ROUTES.dashboard;
  };

  const handleLogout = () => {
    void revokeSession().catch(() => undefined).finally(() => {
      setUser(null);
      setPath(ROUTES.dashboard);
      location.hash = '';
    });
  };

  if (sessionChecking) return <div className="app-loading" role="status">Validating secure session…</div>;

  if (!user) return <Suspense fallback={<div className="app-loading" role="status">Loading workspace…</div>}><LoginScreen onLogin={handleLogin} /></Suspense>;

  const view =
    path === ROUTES.gis ? (
      <GisPage currentUser={user} />
    ) : path === ROUTES.assets ? (
      <AssetsPage currentUser={user} />
    ) : path === ROUTES.approvals ? (
      <ApprovalsPage currentUser={user} />
    ) : path === ROUTES.dataManagement && user.role === 'GIS_ADMIN' ? (
      <DataManagementPage currentUser={user} />
    ) : path === ROUTES.admin ? (
      <AdminPage currentUser={user} />
    ) : (
      <Dashboard currentUser={user} />
    );

  return (
    <div className="app">
      <div className="shell">
        <Sidebar
          path={path}
          onNavigate={navigate}
          user={user}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
        {mobileMenuOpen && (
          <div
            className="mobile-overlay"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}
        <main className="main">
          <Topbar
            user={user}
            onLogout={handleLogout}
            onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          />
          <Suspense fallback={<div className="app-loading" role="status">Loading module…</div>}>{view}</Suspense>
        </main>
      </div>
      <MobileBottomNav path={path} onNavigate={navigate} user={user} />
    </div>
  );
}