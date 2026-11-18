import { supabase, hasSupabase } from '../config/supabase';
import type { Asset } from '../models/types';

export async function listAssets(): Promise<Asset[]> {
  if (!hasSupabase || !supabase) return [];
  const { data, error } = await supabase
    .from('assets')
    .select('id,asset_no,asset_type,status,latitude,longitude,metadata,asset_jurisdictions(jurisdiction_id)')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    jurisdiction_ids: (row.asset_jurisdictions ?? []).map((x: any) => x.jurisdiction_id)
  }));
}
