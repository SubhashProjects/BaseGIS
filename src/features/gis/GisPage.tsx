import { useMemo } from 'react';
import { GisMap } from './GisMap';
import { ASSET_COLORS, ASSET_LABELS } from '../../config/constants';
import simulatorAssetsRaw from '../../../data/simulator/assets.geojson';

const assets = (simulatorAssetsRaw as {features:Array<{properties:Record<string,unknown>}>}).features.map(f=>({
  type:String(f.properties.assetType),
  owners:(f.properties.ownerJeIds as string[])??[],
}));

export function GisPage({ currentUser }:{currentUser:{id:string;displayName:string;role:string;subdivision:string|null;division:string|null;circle?:string|null;department?:string|null;region:string}}){
 const isAdmin=currentUser.role==='GIS_ADMIN';
 const visibleAssets=assets.filter(a=>isAdmin||a.owners.includes(currentUser.id));
 const counts=useMemo(()=>Object.keys(ASSET_LABELS).map(k=>[k,visibleAssets.filter(a=>a.type===k).length] as const),[visibleAssets]);
 return <div className="content"><div className="page-title"><div><h1>GIS Master Map</h1><div className="muted">Google XYZ base map • private jurisdiction view • each JE sees only their assigned simulated assets</div></div><div className="toolbar"><button className="btn">Measure</button><button className="btn">Locate</button><button className="btn primary">Add Asset</button></div></div><div className="gis-workspace"><div className="panel gis-panel"><GisMap currentUser={currentUser}/></div><aside className="gis-side"><div className="panel"><div className="panel-head">Logged-in demo user</div><div className="gis-user"><b>{currentUser.displayName}</b><span>{currentUser.role}</span><small>{currentUser.region} • {currentUser.subdivision ?? currentUser.division ?? 'All jurisdictions'}</small><small className="privacy-note">{isAdmin?'GIS Admin: full simulator visibility':'Private view: other JE users and their assets are hidden'}</small></div></div><div className="panel"><div className="panel-head">My hierarchy</div><div className="hierarchy"><div><b>Sub Division</b><span>{currentUser.subdivision??'—'}</span></div><div><b>Division</b><span>{currentUser.division??'—'}</span></div><div><b>Circle</b><span>{currentUser.circle??'—'}</span></div><div><b>Department</b><span>{currentUser.department??'—'}</span></div><div><b>Region</b><span>{currentUser.region}</span></div></div></div><div className="panel"><div className="panel-head">My simulated inventory</div><div className="inventory">{counts.map(([k,v])=><div key={k}><span><i className="layer-dot" style={{background:ASSET_COLORS[k]}}/>{ASSET_LABELS[k]}</span><b>{v}</b></div>)}</div></div></aside></div></div>;
}
