import { useEffect, useState } from 'react';
import { listAssets } from '../services/assetService';
import type { Asset } from '../models/types';
export function useDashboard(){ const [assets,setAssets]=useState<Asset[]>([]); const [loading,setLoading]=useState(true); useEffect(()=>{listAssets().then(setAssets).catch(console.error).finally(()=>setLoading(false));},[]); return {assets,loading}; }
