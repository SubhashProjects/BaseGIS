export type Role = 'GIS_ADMIN'|'AE'|'JE'|'CONTRACTOR';
export type AssetStatus = 'DRAFT'|'SUBMITTED'|'JE_REVIEW'|'AE_REVIEW'|'APPROVED'|'REJECTED'|'ACTIVE'|'RETIRED';
export interface UserProfile { id:string; display_name:string; role:Role; jurisdiction_ids:string[]; }
export interface Asset { id:string; asset_no:string; asset_type:string; status:AssetStatus; latitude?:number; longitude?:number; geometry?:unknown; jurisdiction_ids?:string[]; metadata?:Record<string,unknown>; }
export interface DashboardMetric { label:string; value:string; detail:string; }
