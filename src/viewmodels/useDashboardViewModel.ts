import { useMemo } from 'react';
import { useGisLayers } from '../services/layerService';
import { usePowerGISData } from './usePowerGISData';
import type { PowerGISUser } from '../services/powergisData';
export function useDashboardViewModel(user:PowerGISUser){ const data=usePowerGISData(user); const { layers }=useGisLayers(); const counts=useMemo(()=>Object.fromEntries(layers.map(l=>[l.id,data.assets.filter(a=>a.assetType===l.id).length])),[data.assets,layers]); return {...data,counts}; }
