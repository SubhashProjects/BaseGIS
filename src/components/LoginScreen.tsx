import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Eye, EyeOff, Zap, ChevronDown, ShieldCheck, Users } from './icons';
import { authenticateUser, listLoginUsers, type PowerGISUser } from '../services/powergisData';

// Roles for the Department Officers Portal (GIS_ADMIN is separated to its own portal)
const officerRoleOrder = ['SE', 'EE', 'AEE', 'AE', 'JE', 'CONTRACTOR'] as const;
const officerRoleLabels: Record<string, string> = {
  SE: 'SE',
  EE: 'EE',
  AEE: 'AEE',
  AE: 'AE',
  JE: 'JE',
  CONTRACTOR: 'Contractor',
};

export function LoginScreen({ onLogin }: { onLogin: (user: PowerGISUser) => void }) {
  // Portal mode: 'ADMIN' (GIS Admin login) or 'OFFICER' (Department officer login)
  // Defaults to 'ADMIN' so GIS Admin logins first as required
  const [portalMode, setPortalMode] = useState<'ADMIN' | 'OFFICER'>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash === '#login-officers') return 'OFFICER';
    return 'ADMIN';
  });

  const [allUsers, setAllUsers] = useState<PowerGISUser[]>([]);
  const [role, setRole] = useState<string>('SE');
  const [query, setQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  // Admin portal specific form state
  const [adminUsername, setAdminUsername] = useState('GIS Admin');
  const [adminPassword, setAdminPassword] = useState('GIS Admin');
  const [adminShowPassword, setAdminShowPassword] = useState(false);
  const [adminError, setAdminError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        setIsEditing(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync hash with portalMode
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#login-officers') {
        setPortalMode('OFFICER');
      } else if (window.location.hash === '#login-admin') {
        setPortalMode('ADMIN');
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const switchPortal = (mode: 'ADMIN' | 'OFFICER') => {
    setPortalMode(mode);
    setError('');
    setAdminError('');
    window.location.hash = mode === 'ADMIN' ? 'login-admin' : 'login-officers';
  };

  useEffect(() => {
    listLoginUsers()
      .then((data) => {
        setAllUsers(data);
        const seUsers = data.filter((u) => u.role === 'SE');
        if (seUsers.length > 0) {
          const first = seUsers[0];
          setSelected(first.id);
          setUsername(first.username);
          setPassword(first.username);
        }
      })
      .catch((e) => setError(e.message || 'Unable to connect to Supabase.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredOfficers = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          u.role === role &&
          (!query ||
            `${u.displayName} ${u.username} ${u.subdivision ?? ''} ${u.division ?? ''} ${u.circle ?? ''} ${u.department ?? ''} ${u.region}`
              .toLowerCase()
              .includes(query.toLowerCase()))
      ),
    [allUsers, role, query]
  );

  const currentOfficer = allUsers.find((u) => u.id === selected) ?? filteredOfficers[0] ?? null;

  const chooseRole = (r: string) => {
    setRole(r);
    setQuery('');
    setIsEditing(false);
    setError('');
    setDropdownOpen(false);
    const matching = allUsers.filter((u) => u.role === r);
    if (matching.length > 0) {
      const first = matching[0];
      setSelected(first.id);
      setUsername(first.username);
      setPassword(first.username);
    } else {
      setSelected('');
      setUsername('');
      setPassword('');
    }
  };

  const chooseUser = (u: PowerGISUser) => {
    setSelected(u.id);
    setUsername(u.username);
    setPassword(u.username);
    setError('');
    setQuery('');
    setIsEditing(false);
    setDropdownOpen(false);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setIsEditing(true);
    setDropdownOpen(true);
    const matches = allUsers.filter(
      (u) =>
        u.role === role &&
        `${u.displayName} ${u.username} ${u.subdivision ?? ''} ${u.division ?? ''} ${u.circle ?? ''} ${u.department ?? ''} ${u.region}`
          .toLowerCase()
          .includes(val.toLowerCase())
    );
    if (matches.length > 0) {
      setSelected(matches[0].id);
      setUsername(matches[0].username);
      setPassword(matches[0].username);
    }
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

  const displayOfficerValue = isEditing ? query : (currentOfficer ? currentOfficer.displayName : '');

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
            <p className="login-sub">Select your designation and officer profile to continue.</p>
          </div>

          {/* Role tabs for SE, EE, AEE, AE, JE, Contractor */}
          <div className="role-tabs">
            {officerRoleOrder.map((r) => (
              <button
                key={r}
                type="button"
                className={role === r ? 'active' : ''}
                onClick={() => chooseRole(r)}
              >
                {officerRoleLabels[r]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="login-loading">Loading officers directory…</div>
          ) : (
            <>
              <div className="login-field" ref={dropdownRef}>
                <label htmlFor="officer-search-input">Officer Profile ({officerRoleLabels[role]})</label>
                <div className="single-search-dropdown">
                  <Search size={14} className="single-search-icon" />
                  <input
                    id="officer-search-input"
                    type="text"
                    className="single-search-input"
                    value={displayOfficerValue}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onFocus={() => {
                      setIsEditing(true);
                      setQuery('');
                      setDropdownOpen(true);
                    }}
                    placeholder={currentOfficer ? currentOfficer.displayName : `Select or search ${officerRoleLabels[role]} officer…`}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="single-dropdown-arrow"
                    onClick={() => {
                      setDropdownOpen((prev) => !prev);
                      setIsEditing(false);
                    }}
                    aria-label="Toggle options"
                    tabIndex={-1}
                  >
                    <ChevronDown size={14} className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="custom-dropdown-list">
                      {filteredOfficers.length === 0 ? (
                        <div className="dropdown-empty">No officers found matching "{query}"</div>
                      ) : (
                        filteredOfficers.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className={`dropdown-option ${currentOfficer?.id === u.id ? 'selected' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => chooseUser(u)}
                          >
                            <span className="dropdown-option-name">{u.displayName}</span>
                            <span className="dropdown-option-sub">
                              {u.subdivision ? `${u.subdivision} • ` : u.division ? `${u.division} • ` : ''}
                              {u.region}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="login-fields-wrap">
                <div className="login-field">
                  <label htmlFor="username">Username</label>
                  <input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
