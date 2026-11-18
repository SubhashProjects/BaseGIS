import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { LoginScreen, type DemoUser } from './components/LoginScreen';
import { Dashboard } from './features/dashboard/Dashboard';
import { GisPage } from './features/gis/GisPage';
import { AssetsPage } from './features/assets/AssetsPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { AdminPage } from './features/admin/AdminPage';
import { ROUTES, SIMULATOR } from './config/constants';

export default function App(){
 const [user,setUser]=useState<DemoUser|null>(null);
 const [path,setPath]=useState(location.hash.replace('#','')||ROUTES.gis);
 const [simulator,setSimulator]=useState(SIMULATOR.enabled);
 const navigate=(p:string)=>{setPath(p);location.hash=p};
 if(!user) return <LoginScreen onLogin={setUser}/>;
 const view=path===ROUTES.gis?<GisPage currentUser={user}/>:path===ROUTES.assets?<AssetsPage currentUser={user}/>:path===ROUTES.approvals?<ApprovalsPage currentUser={user}/>:path===ROUTES.admin?<AdminPage currentUser={user}/>:<Dashboard currentUser={user}/>;
 return <div className="app"><div className="shell"><Sidebar path={path} onNavigate={navigate} user={user}/><main className="main"><Topbar user={user} simulator={simulator} onToggleSimulator={setSimulator} onLogout={()=>setUser(null)}/>{simulator&&<div className="sim-strip">SIMULATOR ON • Demo identity: <b>{user.displayName}</b> • No production data • <button onClick={()=>setSimulator(false)}>Turn simulator off</button></div>}{view}</main></div></div>
}
