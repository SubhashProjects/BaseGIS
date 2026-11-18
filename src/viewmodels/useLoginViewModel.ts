import { useEffect, useMemo, useState } from 'react';
import { authenticateUser, listLoginUsers, type PowerGISUser } from '../services/powergisData';
import { ROLE_LABELS, ROLE_ORDER } from '../config/ui.config';

export function useLoginViewModel(onLogin: (user: PowerGISUser) => void) {
  const [users, setUsers] = useState<PowerGISUser[]>([]);
  const [role, setRole] = useState<string>(ROLE_ORDER[0]);
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
        const first = data.find((u) => u.role === role);
        if (first) {
          setSelected(first.id);
          setUsername(first.username);
          setPassword(first.username);
        }
      })
      .catch((e) => setError(e?.message || 'Unable to connect to Supabase.'))
      .finally(() => setLoading(false));
  }, [role]);

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === role &&
          (!query ||
            `${u.displayName} ${u.username} ${u.subdivision ?? ''} ${u.division ?? ''} ${u.circle ?? ''} ${
              u.department ?? ''
            } ${u.region}`
              .toLowerCase()
              .includes(query.toLowerCase()))
      ),
    [users, role, query]
  );

  const current = users.find((u) => u.id === selected) ?? filtered[0] ?? null;

  const chooseRole = (r: string) => {
    setRole(r);
    setQuery('');
    setError('');
    const first = users.find((u) => u.role === r);
    setSelected(first?.id ?? '');
    setUsername(first?.username ?? '');
    setPassword(first?.username ?? '');
  };

  const chooseUser = (u: PowerGISUser) => {
    setSelected(u.id);
    setUsername(u.username);
    setPassword(u.username);
    setQuery('');
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
      const user = await authenticateUser(username, password);
      if (!user) {
        setError('Invalid username or password.');
        return;
      }
      onLogin(user);
    } catch (e: any) {
      setError(e?.message || 'Unable to sign in.');
    } finally {
      setSigningIn(false);
    }
  };

  return {
    users,
    role,
    query,
    selected,
    username,
    password,
    loading,
    signingIn,
    error,
    current,
    filtered,
    roleLabels: ROLE_LABELS,
    setQuery,
    setUsername,
    setPassword,
    chooseRole,
    chooseUser,
    signIn,
  };
}
