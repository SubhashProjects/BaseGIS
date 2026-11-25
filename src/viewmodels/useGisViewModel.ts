import { useMemo } from 'react';
import { useGisLayers } from '../services/layerService';
import { usePowerGISData } from './usePowerGISData';
import type { PowerGISUser } from '../services/powergisData';
export function useGisViewModel(user:PowerGISUser){ const data=usePowerGISData(user); const { layers }=useGisLayers(); const counts=useMemo(()=>layers.map(l=>[l.id,data.assets.filter(a=>a.assetType===l.id).length] as const),[data.assets,layers]); const hierarchy=useMemo(()=>[{key:'subdivision',value:user.subdivision},{key:'division',value:user.division},{key:'circle',value:user.circle},{key:'department',value:user.department},{key:'region',value:user.region}].filter(x=>Boolean(x.value)),[user]); return {...data,counts,hierarchy}; }
