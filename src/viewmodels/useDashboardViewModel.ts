import { useMemo } from 'react';
import { ASSET_LABELS } from '../config/constants';
import { usePowerGISData } from './usePowerGISData';
import type { PowerGISUser } from '../services/powergisData';
export function useDashboardViewModel(user:PowerGISUser){ const data=usePowerGISData(user); const counts=useMemo(()=>Object.fromEntries(Object.keys(ASSET_LABELS).map(k=>[k,data.assets.filter(a=>a.assetType===k).length])),[data.assets]); return {...data,counts}; }
