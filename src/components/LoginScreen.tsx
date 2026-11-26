import { useState } from 'react';
import { Eye, EyeOff, Zap, ShieldCheck, Users } from './icons';
import { authenticateUser, type PowerGISUser } from '../services/powergisData';

export function LoginScreen({ onLogin }: { onLogin: (user: PowerGISUser) => void }) {
  // Portal mode: 'ADMIN' (GIS Admin login) or 'OFFICER' (Department officer login)
  // Defaults to 'ADMIN' so GIS Admin logins first as required
  const [portalMode, setPortalMode] = useState<'ADMIN' | 'OFFICER'>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash === '#login-officers') return 'OFFICER';
    return 'ADMIN';
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  // Admin portal specific form state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminShowPassword, setAdminShowPassword] = useState(false);
  const [adminError, setAdminError] = useState('');

  const switchPortal = (mode: 'ADMIN' | 'OFFICER') => {
    setPortalMode(mode);
    setError('');
    setAdminError('');
    setUsername('');
    setPassword('');
    setAdminUsername('');
    setAdminPassword('');
    window.location.hash = mode === 'ADMIN' ? 'login-admin' : 'login-officers';
  };

  const signInOfficer = async () => {
    if (!username || !password) {
      setError('Please enter your username and password.');
      return;
    }
    setSigningIn(true);
    setError('');
    try {
      const user = await authenticateUser(username.trim(), password);
      if (!user) {
        setError('Invalid username or password.');
        return;
      }
      onLogin(user);
    } catch (e: any) {
      setError(e.message || 'Unable to sign in.');
    } finally {
      setSigningIn(false);
    }
  };

  const signInAdmin = async () => {
    if (!adminUsername || !adminPassword) {
      setAdminError('Please enter the GIS Administrator username and password.');
      return;
    }
    setSigningIn(true);
    setAdminError('');
    try {
      const user = await authenticateUser(adminUsername.trim(), adminPassword);
      if (!user || user.role !== 'GIS_ADMIN') {
        setAdminError('Invalid GIS Administrator credentials.');
        return;
      }
      onLogin(user);
    } catch (e: any) {
      setAdminError(e.message || 'Unable to sign in.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="login-shell">
      {/* ========================================================================= */}
      {/* PAGE 1: GIS ADMINISTRATOR LOGIN (DEFAULTS FIRST)                          */}
      {/* ========================================================================= */}
      {portalMode === 'ADMIN' ? (
        <div className="login-card login-card-admin">
          <div className="login-head">
            <div className="login-brand">
              <div className="brand-mark admin-mark" aria-label="GIS Admin Shield">
                <ShieldCheck size={20} fill="#f59e0b" color="#0f172a" strokeWidth={1.8} />
              </div>
              <div>
                <strong>PowerGIS Administrator</strong>
              </div>
            </div>
            <div className="admin-portal-badge">
              <ShieldCheck size={12} />
              <span>GIS ADMIN ACCESS</span>
            </div>
          </div>

          <div className="login-title-section">
            <h1>GIS Admin Sign In</h1>
          </div>

          <div className="admin-credentials-box">

            <div className="login-fields-wrap">
              <div className="login-field">
                <label htmlFor="admin-username">Admin Username</label>
                <input
                  id="admin-username"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="e.g. GIS Admin"
                />
              </div>

              <div className="login-field">
                <label htmlFor="admin-password">Admin Password</label>
                <div className="password-input-wrap">
                  <input
                    id="admin-password"
                    type={adminShowPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') signInAdmin();
                    }}
                    placeholder="Enter admin password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setAdminShowPassword((prev) => !prev)}
                    title={adminShowPassword ? 'Hide password' : 'Show password'}
                    aria-label={adminShowPassword ? 'Hide password' : 'Show password'}
                  >
                    {adminShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {adminError && (
            <div className="login-error-slot">
              <span className="login-error-text">{adminError}</span>
            </div>
          )}

          <button
            type="button"
            className="btn primary login-btn admin-login-btn"
            onClick={signInAdmin}
            disabled={signingIn}
          >
            {signingIn ? 'Authenticating Admin…' : 'Sign In as GIS Administrator'}
          </button>

          <div className="login-portal-switcher">
            <button
              type="button"
              className="login-switch-btn"
              onClick={() => switchPortal('OFFICER')}
            >
              <Users size={14} />
              <span><strong>Switch to Officer Login →</strong></span>
            </button>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* PAGE 2: DEPARTMENT OFFICERS & STAFF LOGIN (SE, EE, AEE, AE, JE)          */
        /* ========================================================================= */
        <div className="login-card login-card-officer">
          <div className="login-head">
            <div className="login-brand">
              <div className="brand-mark" aria-label="Electricity Symbol">
                <Zap size={18} fill="#facc15" color="#facc15" strokeWidth={1} />
              </div>
              <div>
                <strong>PowerGIS</strong>
                <span>Electricity Department GIS Portal</span>
              </div>
            </div>
            <div className="officer-portal-badge">
              <Users size={12} />
              <span>OFFICERS PORTAL</span>
            </div>
          </div>

          <div className="login-title-section">
            <h1>Officer Sign In</h1>
            <p className="login-sub">Use your assigned account credentials. The officer directory is not exposed before authentication.</p>
          </div>

          <div className="login-security-note">
            <ShieldCheck size={14} />
            <span>Authorised accounts only. Enter your assigned username and password.</span>
          </div>

          <div className="login-fields-wrap">
            <div className="login-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') signInOfficer();
                  }}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          <div className="login-error-slot">
            {error && <span className="login-error-text">{error}</span>}
          </div>

          <button
            type="button"
            className="btn primary login-btn"
            onClick={signInOfficer}
            disabled={signingIn}
          >
            {signingIn ? 'Signing in…' : 'Sign in to PowerGIS'}
          </button>

          <div className="login-portal-switcher">
            <button
              type="button"
              className="login-switch-btn"
              onClick={() => switchPortal('ADMIN')}
            >
              <ShieldCheck size={14} />
              <span><strong>Switch to GIS Admin Login →</strong></span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
