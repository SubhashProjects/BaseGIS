import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Dashboard } from './features/dashboard/Dashboard';
import { GisPage } from './features/gis/GisPage';
import { AssetsPage } from './features/assets/AssetsPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { AdminPage } from './features/admin/AdminPage';
import { ROUTES } from './config/constants';
export default function App(){const [path,setPath]=useState(location.hash.replace('#','')||ROUTES.dashboard); const navigate=(p:string)=>{setPath(p);location.hash=p}; const view=path===ROUTES.gis?<GisPage/>:path===ROUTES.assets?<AssetsPage/>:path===ROUTES.approvals?<ApprovalsPage/>:path===ROUTES.admin?<AdminPage/>:<Dashboard/>; return <div className="app"><div className="shell"><Sidebar path={path} onNavigate={navigate}/><main className="main"><Topbar/>{view}</main></div></div>}
