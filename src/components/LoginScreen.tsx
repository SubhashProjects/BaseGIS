import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Eye, EyeOff, Power, ChevronDown } from 'lucide-react';
import { authenticateUser, listLoginUsers, type PowerGISUser } from '../services/powergisData';

const roleOrder = ['SE', 'EE', 'AEE', 'AE', 'JE', 'GIS_ADMIN'] as const;
const roleLabels: Record<string, string> = {
  SE: 'SE',
  EE: 'EE',
  AEE: 'AEE',
  AE: 'AE',
  JE: 'JE',
  GIS_ADMIN: 'GIS Admin',
};

export function LoginScreen({ onLogin }: { onLogin: (user: PowerGISUser) => void }) {
  const [users, setUsers] = useState<PowerGISUser[]>([]);
  const [role, setRole] = useState<string>('SE');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    listLoginUsers()
      .then((data) => {
        setUsers(data);
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

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === role &&
          `${u.displayName} ${u.username} ${u.subdivision ?? ''} ${u.division ?? ''} ${u.circle ?? ''} ${u.department ?? ''} ${u.region}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [users, role, query]
  );

  const current = users.find((u) => u.id === selected) ?? filtered[0] ?? null;

  const chooseRole = (r: string) => {
    setRole(r);
    setQuery('');
    setError('');
    setDropdownOpen(false);
    const matching = users.filter((u) => u.role === r);
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
    setDropdownOpen(false);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setDropdownOpen(true);
    const matches = users.filter(
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

  const signIn = async () => {
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

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-head">
          <div className="login-brand">
            <div className="brand-mark" aria-label="Power Symbol">
              <Power size={18} strokeWidth={2.5} />
            </div>
            <div>
              <strong>PowerGIS</strong>
              <span>Electricity Department GIS Portal</span>
            </div>
          </div>
        </div>

        <div className="login-title-section">
          <h1>Sign In</h1>
          <p className="login-sub">Select your designation and officer profile to continue.</p>
        </div>

        <div className="role-tabs">
          {roleOrder.map((r) => (
            <button
              key={r}
              type="button"
              className={role === r ? 'active' : ''}
              onClick={() => chooseRole(r)}
            >
              {roleLabels[r]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="login-loading">Loading users…</div>
        ) : (
          <>
            <div className="login-field" ref={dropdownRef}>
              <label htmlFor="officer-search">Officer Profile ({roleLabels[role]})</label>
              <div className="searchbox">
                <Search size={14} />
                <input
                  id="officer-search"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder={`Search ${roleLabels[role]} name or area…`}
                />
              </div>

              <div className="custom-dropdown-wrap">
                <button
                  type="button"
                  className="custom-dropdown-trigger"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  aria-expanded={dropdownOpen}
                >
                  <span className="dropdown-trigger-text">
                    {current
                      ? `${current.displayName} — ${current.subdivision ?? current.division ?? current.circle ?? current.department ?? current.region}`
                      : 'Select an officer…'}
                  </span>
                  <ChevronDown size={14} className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`} />
                </button>

                {dropdownOpen && (
                  <div className="custom-dropdown-list">
                    {filtered.length === 0 ? (
                      <div className="dropdown-empty">No officers matching "{query}"</div>
                    ) : (
                      filtered.map((u) => {
                        const area = u.subdivision || u.division || u.circle || u.department || u.region;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            className={`dropdown-option ${current?.id === u.id ? 'selected' : ''}`}
                            onClick={() => chooseUser(u)}
                          >
                            <span className="dropdown-option-name">{u.displayName}</span>
                            {area && <span className="dropdown-option-area">{area}</span>}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="officer-summary">
              <div className="officer-summary-top">
                <span className="officer-name">{current?.displayName ?? '—'}</span>
                <span className="role-chip">{current ? roleLabels[current.role] : '—'}</span>
              </div>
              <div className="officer-summary-grid">
                <div>
                  <span>Sub-Div:</span>
                  <b>{current?.subdivision || '—'}</b>
                </div>
                <div>
                  <span>Division:</span>
                  <b>{current?.division || '—'}</b>
                </div>
                <div>
                  <span>Dept:</span>
                  <b>{current?.department || 'SE - 1 HOD'}</b>
                </div>
                <div>
                  <span>Region:</span>
                  <b>{current?.region || 'All Regions'}</b>
                </div>
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
                      if (e.key === 'Enter') signIn();
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
              onClick={signIn}
              disabled={signingIn}
            >
              {signingIn ? 'Signing in…' : 'Sign in to PowerGIS'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
