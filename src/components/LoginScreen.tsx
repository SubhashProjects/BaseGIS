import { useEffect, useMemo, useState } from 'react';
import { UserRound, Search, ChevronRight } from 'lucide-react';
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
          <p className="login-sub">Select your designation and profile to access the GIS portal.</p>
        </div>

        <div className="role-tabs">
          {roleOrder.map((r) => (
            <button
              key={r}
              className={role === r ? 'active' : ''}
              onClick={() => chooseRole(r)}
            >
              {roleLabels[r]}
            </button>
          ))}
        </div>

        <label className="login-search">
          <span>Search {roleLabels[role]}</span>
          <div className="searchbox">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${roleLabels[role]} by name or area…`}
            />
          </div>
        </label>

        {error && <div className="login-error">{error}</div>}

        {loading ? (
          <div className="login-loading">Loading users…</div>
        ) : (
          <div className="login-body">
            <div className="user-list">
              {filtered.length === 0 ? (
                <div className="empty">No users found.</div>
              ) : (
                filtered.map((u) => (
                  <button
                    key={u.id}
                    className={current?.id === u.id ? 'selected' : ''}
                    onClick={() => chooseUser(u)}
                  >
                    <span className="user-avatar">
                      <UserRound size={15} />
                    </span>
                    <span className="user-row">
                      <b>{u.displayName}</b>
                      <small>{u.subdivision ?? u.division ?? u.circle ?? u.department ?? u.region}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))
              )}
            </div>

            {current && (
              <div className="login-preview">
                <div className="preview-top">
                  <div>
                    <div className="preview-kicker">Designation Profile</div>
                    <div className="preview-name">{current.displayName}</div>
                  </div>
                  <span className="role-chip">{roleLabels[current.role]}</span>
                </div>

                <div className="preview-grid">
                  {current.subdivision && (
                    <div>
                      <span>Sub Division</span>
                      <b>{current.subdivision}</b>
                    </div>
                  )}
                  {current.division && (
                    <div>
                      <span>Division</span>
                      <b>{current.division}</b>
                    </div>
                  )}
                  {current.circle && (
                    <div>
                      <span>Circle</span>
                      <b>{current.circle}</b>
                    </div>
                  )}
                  <div>
                    <span>Department</span>
                    <b>{current.department ?? 'SE - 1 HOD'}</b>
                  </div>
                  <div>
                    <span>Region</span>
                    <b>{current.region}</b>
                  </div>
                </div>

                <div className="login-fields-wrap">
                  <label className="login-field">
                    <span>Username</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </label>
                  <label className="login-field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') signIn();
                      }}
                    />
                  </label>
                </div>

                <button
                  className="btn primary login-btn"
                  onClick={signIn}
                  disabled={signingIn}
                >
                  {signingIn ? 'Signing in…' : 'Sign in to PowerGIS'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
