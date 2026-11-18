export type SimulatorRole = 'GIS_ADMIN' | 'SE' | 'EE' | 'AE' | 'JE' | 'CONTRACTOR';
export interface SimulatorUser {
  id: string;
  username: string;
  displayName: string;
  role: SimulatorRole;
  subdivision: string | null;
  division: string | null;
  circle: string | null;
  department: string | null;
  jurisdictions: string[];
  simulatorOnly: true;
}
export interface SimulatorAsset {
  id: string;
  assetNo: string;
  assetType: string;
  status: string;
  jurisdictionIds: string[];
  coordinates: [number, number];
  sharedBoundary?: boolean;
}
