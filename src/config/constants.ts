export const APP = { name: 'PowerGIS', subtitle: 'Electricity Distribution GIS' } as const;
export const MAP_DEFAULT = { center: { lat: 11.9139, lng: 79.8145 }, zoom: 10 } as const;
export const ROUTES = {
  dashboard: '/',
  gis: '/gis',
  assets: '/assets',
  approvals: '/approvals',
  dataManagement: '/data-management',
  admin: '/admin',
} as const;
export const ASSET_TYPES = ['SUBSTATION','EHV_LINE','HV_LINE','DT','LT_LINE','POLE','SMART_METER'] as const;
export const ASSET_LABELS: Record<string,string> = { SUBSTATION:'Substations', EHV_LINE:'EHV Lines', HV_LINE:'HT Lines', DT:'Power / Distribution Transformers', LT_LINE:'LT Lines', POLE:'Poles', SMART_METER:'Smart Meters' };
export const ASSET_COLORS: Record<string,string> = { SUBSTATION:'#7C3AED', EHV_LINE:'#DC2626', HV_LINE:'#F59E0B', DT:'#2563EB', LT_LINE:'#16A34A', POLE:'#475569', SMART_METER:'#0891B2' };
export const STATUS_LABELS: Record<string,string> = { DRAFT:'Draft', SUBMITTED:'Submitted', JE_REVIEW:'JE Review', AE_REVIEW:'AE Review', APPROVED:'Approved', REJECTED:'Rejected', ACTIVE:'Active', RETIRED:'Retired' };
export const ROLES = ['GIS_ADMIN','SE','EE','AEE','AE','JE','CONTRACTOR'] as const;
