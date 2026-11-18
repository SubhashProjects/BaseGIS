import assetsRaw from '../../data/simulator/assets.geojson';

export type DemoAsset = {
  id:string; assetNo:string; assetType:string; status:string; jurisdictions:string[]; owners:string[]; shared?:boolean;
};

export const demoAssets: DemoAsset[] = (assetsRaw as any).features.map((f:any)=>({
  id:String(f.properties.id), assetNo:String(f.properties.assetNo), assetType:String(f.properties.assetType), status:String(f.properties.status),
  jurisdictions:(f.properties.jurisdictionIds as string[]) ?? [], owners:(f.properties.ownerJeIds as string[]) ?? [], shared:!!f.properties.sharedBoundary,
}));

export function visibleDemoAssets(user:any): DemoAsset[] {
  if(user?.role==='GIS_ADMIN') return demoAssets;
  return demoAssets.filter(a => a.owners.includes(user.id));
}

export function isAdmin(user:any){ return user?.role==='GIS_ADMIN'; }
