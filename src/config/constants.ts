export const APP = { name: 'PowerGIS', subtitle: 'Electricity Distribution GIS' } as const;
export const MAP_DEFAULT = { center: { lat: 11.9139, lng: 79.8145 }, zoom: 10 } as const;
export const ROUTES = { dashboard:'/', gis:'/gis', assets:'/assets', approvals:'/approvals', admin:'/admin' } as const;
export const SIMULATOR = { enabled: String(import.meta.env.VITE_SIMULATOR_ENABLED ?? 'true').toLowerCase() === 'true', url: 'simulator.html' } as const;
export const ASSET_TYPES = ['SUBSTATION','EHV_LINE','HV_LINE','DT','LT_LINE','POLE','SMART_METER'] as const;
export const ASSET_LABELS: Record<string,string> = { SUBSTATION:'Substations', EHV_LINE:'EHV Lines', HV_LINE:'HV Lines', DT:'Distribution Transformers', LT_LINE:'LT Lines', POLE:'Poles', SMART_METER:'Smart Meters' };
export const STATUS_LABELS: Record<string,string> = { DRAFT:'Draft', SUBMITTED:'Submitted', JE_REVIEW:'JE Review', AE_REVIEW:'AE Review', APPROVED:'Approved', REJECTED:'Rejected', ACTIVE:'Active', RETIRED:'Retired' };
export const ROLES = ['GIS_ADMIN','AE','JE','CONTRACTOR'] as const;
