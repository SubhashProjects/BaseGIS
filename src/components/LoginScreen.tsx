import { useEffect, useMemo, useState } from 'react';
import { Search, Eye, EyeOff } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

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
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
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
            <div className="brand-mark">P</div>
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
            <div className="login-field">
              <label htmlFor="officer-select">Officer Profile ({roleLabels[role]})</label>
              {users.filter((u) => u.role === role).length > 5 && (
                <div className="searchbox" style={{ marginBottom: '6px' }}>
                  <Search size={14} />
                  <input
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder={`Filter ${roleLabels[role]} by name or area…`}
                  />
                </div>
              )}
              <select
                id="officer-select"
                className="login-select"
                value={current?.id ?? ''}
                onChange={(e) => {
                  const u = users.find((x) => x.id === e.target.value);
                  if (u) chooseUser(u);
                }}
              >
                {filtered.length === 0 ? (
                  <option value="" disabled>
                    No officers matching query
                  </option>
                ) : (
                  filtered.map((u) => {
                    const area = u.subdivision || u.division || u.circle || u.department || u.region;
                    return (
                      <option key={u.id} value={u.id}>
                        {u.displayName} {area ? `— ${area}` : ''}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            {current && (
              <div className="officer-summary">
                <div className="officer-summary-top">
                  <span className="officer-name">{current.displayName}</span>
                  <span className="role-chip">{roleLabels[current.role]}</span>
                </div>
                <div className="officer-summary-grid">
                  {current.subdivision && (
                    <div>
                      <span>Sub-Div:</span>
                      <b>{current.subdivision}</b>
                    </div>
                  )}
                  {current.division && (
                    <div>
                      <span>Division:</span>
                      <b>{current.division}</b>
                    </div>
                  )}
                  {current.circle && (
                    <div>
                      <span>Circle:</span>
                      <b>{current.circle}</b>
                    </div>
                  )}
                  <div>
                    <span>Dept:</span>
                    <b>{current.department ?? 'SE - 1 HOD'}</b>
                  </div>
                  <div>
                    <span>Region:</span>
                    <b>{current.region}</b>
                  </div>
                </div>
              </div>
            )}

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
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

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
