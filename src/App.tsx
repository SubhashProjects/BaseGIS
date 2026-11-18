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

export default function App(){
 const [user,setUser]=useState<PowerGISUser|null>(null);
 const [path,setPath]=useState(location.hash.replace('#','')||ROUTES.gis);
 const navigate=(p:string)=>{setPath(p);location.hash=p};
 if(!user) return <LoginScreen onLogin={setUser}/>;
 const view=path===ROUTES.gis?<GisPage currentUser={user}/>:path===ROUTES.assets?<AssetsPage currentUser={user}/>:path===ROUTES.approvals?<ApprovalsPage currentUser={user}/>:path===ROUTES.admin?<AdminPage currentUser={user}/>:<Dashboard currentUser={user}/>;
 return <div className="app"><div className="shell"><Sidebar path={path} onNavigate={navigate} user={user}/><main className="main"><Topbar user={user} onLogout={()=>setUser(null)}/>{view}</main></div></div>
}
