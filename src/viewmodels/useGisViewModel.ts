import { useMemo } from 'react';
import { ASSET_LABELS } from '../config/constants';
import { usePowerGISData } from './usePowerGISData';
import type { PowerGISUser } from '../services/powergisData';
export function useGisViewModel(user:PowerGISUser){ const data=usePowerGISData(user); const counts=useMemo(()=>Object.keys(ASSET_LABELS).map(k=>[k,data.assets.filter(a=>a.assetType===k).length] as const),[data.assets]); const hierarchy=useMemo(()=>[{key:'subdivision',value:user.subdivision},{key:'division',value:user.division},{key:'circle',value:user.circle},{key:'department',value:user.department},{key:'region',value:user.region}].filter(x=>Boolean(x.value)),[user]); return {...data,counts,hierarchy}; }
