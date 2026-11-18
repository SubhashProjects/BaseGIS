import { ASSET_LABELS, ASSET_COLORS } from '../../config/constants';
import { usePowerGISData } from '../../viewmodels/usePowerGISData';
import type { PowerGISUser } from '../../services/powergisData';
export function AssetsPage({ currentUser }: { currentUser: PowerGISUser }) {
 const {assets,loading,error}=usePowerGISData(currentUser);
 if(error) return <div className="content"><div className="notice error-notice"><b>Asset data unavailable</b><br/>{error}</div></div>;
 return <div className="content"><div className="page-title"><div><h1>My Assets</h1><div className="muted">Only authorised assets loaded from Supabase</div></div></div><div className="panel"><div className="panel-head"><span>{currentUser.role==='GIS_ADMIN'?'All authorised assets':'Authorised assets'}</span><span className="pill">{loading?'Loading…':`${assets.length} visible`}</span></div><table className="table"><thead><tr><th>Asset</th><th>Type</th><th>Status</th><th>Jurisdiction</th><th>Visibility</th></tr></thead><tbody>{assets.map(a=><tr key={a.id}><td><b>{a.assetNo}</b></td><td><span className="type-chip"><i style={{background:ASSET_COLORS[a.assetType]}}/>{ASSET_LABELS[a.assetType]??a.assetType}</span></td><td><span className={'status '+(a.status==='ACTIVE'?'active':'pending')}>{a.status}</span></td><td>{a.jurisdictions.join(', ')}</td><td>{a.shared?'Shared boundary':'Private'}</td></tr>)}</tbody></table></div></div>;
}
