import { useEffect, useState } from 'react';
import { getVisibleAssets, getVisibleBoundaries, type PowerGISAsset, type PowerGISBoundary, type PowerGISUser } from '../services/powergisData';

export function usePowerGISData(user: PowerGISUser){
  const [assets,setAssets]=useState<PowerGISAsset[]>([]); const [boundaries,setBoundaries]=useState<PowerGISBoundary[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  useEffect(()=>{let active=true; setLoading(true); setError(''); Promise.all([getVisibleAssets(user.id),getVisibleBoundaries(user.id)]).then(([a,b])=>{if(!active)return;setAssets(a);setBoundaries(b);}).catch(e=>{if(active)setError(e.message||'Unable to load authorised GIS data from Supabase.');}).finally(()=>{if(active)setLoading(false);}); return()=>{active=false};},[user.id]);
  return {assets,boundaries,loading,error};
}
