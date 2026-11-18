import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserRound, Search, ChevronRight, Database } from 'lucide-react';
import { authenticateUser, listLoginUsers, type PowerGISUser } from '../services/powergisData';

const roleOrder=['GIS_ADMIN','SE','EE','AEE','AE','JE'] as const;
const roleLabels:Record<string,string>={GIS_ADMIN:'GIS Admin',SE:'SE',EE:'EE',AEE:'AEE',AE:'AE',JE:'JE'};

export function LoginScreen({onLogin}:{onLogin:(user:PowerGISUser)=>void}){
 const [users,setUsers]=useState<PowerGISUser[]>([]); const [role,setRole]=useState<string>('JE'); const [query,setQuery]=useState(''); const [selected,setSelected]=useState(''); const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [loading,setLoading]=useState(true); const [signingIn,setSigningIn]=useState(false); const [error,setError]=useState('');
 useEffect(()=>{listLoginUsers().then(setUsers).catch(e=>setError(e.message||'Unable to load users from Supabase.')).finally(()=>setLoading(false));},[]);
 const filtered=useMemo(()=>users.filter(u=>u.role===role && `${u.displayName} ${u.subdivision??''} ${u.division??''} ${u.circle??''} ${u.region}`.toLowerCase().includes(query.toLowerCase())),[users,role,query]);
 const current=users.find(u=>u.id===selected)??filtered[0]??null;
 const chooseRole=(r:string)=>{setRole(r);setQuery('');setSelected('');setUsername('');setPassword('');setError('');};
 const chooseUser=(u:PowerGISUser)=>{setSelected(u.id);setUsername(u.username);setPassword(u.username);setError('');};
 const signIn=async()=>{if(!username||!password){setError('Enter username and password.');return;} setSigningIn(true);setError(''); try{const user=await authenticateUser(username.trim(),password); if(!user){setError('Invalid username or password.');return;} onLogin(user);}catch(e:any){setError(e.message||'Unable to sign in.');}finally{setSigningIn(false);}};
 return <div className="login-shell"><div className="login-card">
   <div className="login-head"><div className="login-brand"><div className="brand-mark">P</div><div><strong>PowerGIS</strong><span>Electricity Distribution GIS</span></div></div><span className="demo-badge">TEST ACCESS</span></div>
   <h1>Sign in to PowerGIS</h1><p className="login-sub">Select your department role and organisation identity, then sign in. Your authorised hierarchy and GIS data are loaded from Supabase.</p>
   <div className="login-source"><Database size={14}/><span>Organisation & GIS data: Supabase / PostGIS</span></div>
   <div className="role-tabs">{roleOrder.map(r=><button key={r} className={role===r?'active':''} onClick={()=>chooseRole(r)}>{roleLabels[r]}</button>)}</div>
   <label className="login-search"><span>Find {roleLabels[role]}</span><div className="searchbox"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={role==='JE'?'Search JE / area…':'Search name / hierarchy…'}/></div></label>
   {error&&<div className="login-error">{error}</div>}
   {loading?<div className="login-loading">Loading organisation users…</div>:<div className="login-body">
    <div className="user-list">{filtered.length===0?<div className="empty">No users found.</div>:filtered.map(u=><button key={u.id} className={current?.id===u.id?'selected':''} onClick={()=>chooseUser(u)}><span className="user-avatar"><UserRound size={15}/></span><span className="user-row"><b>{u.displayName}</b><small>{u.subdivision??u.division??u.circle??u.region}</small></span><ChevronRight size={15}/></button>)}</div>
    {current&&<div className="login-preview"><div className="preview-kicker">Organisation identity</div><div className="preview-name">{current.displayName}</div><span className="role-chip">{roleLabels[current.role]}</span><div className="preview-grid">{current.subdivision&&<div><span>Sub Division</span><b>{current.subdivision}</b></div>}{current.division&&<div><span>Division</span><b>{current.division}</b></div>}{current.circle&&<div><span>Circle</span><b>{current.circle}</b></div>}<div><span>Department</span><b>{current.department??'—'}</b></div><div><span>Region</span><b>{current.region}</b></div></div><div className="scope-note"><ShieldCheck size={15}/><span>{current.role==='GIS_ADMIN'?'Full authorised GIS visibility':'Only your authorised hierarchy and GIS assets will be loaded'}</span></div><label className="login-field"><span>Username</span><input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" /></label><label className="login-field"><span>Password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e=>{if(e.key==='Enter')signIn();}} /></label><div className="test-credential-note">Temporary test mode: username and password are the same.</div><button className="btn primary login-btn" onClick={signIn} disabled={signingIn}>{signingIn?'Signing in…':'Sign in to PowerGIS'}</button></div>}
   </div>}
   <div className="login-footer">Test identities are based on the supplied organisation workbook. For this test build, username = password. GIS data is stored in Supabase/PostGIS.</div>
 </div></div>
}
