import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const bucket = Deno.env.get('POWERGIS_BACKUP_BUCKET') ?? 'powergis-backups';
const supabase = createClient(url, serviceKey);

Deno.serve(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `daily/${stamp}.json`;
  try {
    const [users, jurisdictions, assets] = await Promise.all([
      supabase.from('organization_users').select('*'),
      supabase.from('gis_jurisdictions').select('id,name,region,subdivision,division,circle,department,geometry:boundary'),
      supabase.from('gis_assets').select('*'),
    ]);
    if (users.error) throw users.error;
    if (jurisdictions.error) throw jurisdictions.error;
    if (assets.error) throw assets.error;
    const payload = { exportedAt: new Date().toISOString(), users: users.data, jurisdictions: jurisdictions.data, assets: assets.data };
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const upload = await supabase.storage.from(bucket).upload(path, body, { contentType: 'application/json', upsert: false });
    if (upload.error) throw upload.error;
    const backupId = `daily-${stamp}`;
    await supabase.from('powergis_backup_runs').insert({ backup_id: backupId, status: 'COMPLETED', storage_path: path, user_count: users.data.length, jurisdiction_count: jurisdictions.data.length, asset_count: assets.data.length, completed_at: new Date().toISOString() });
    return new Response(JSON.stringify({ ok: true, backupId, path }), { headers: { 'content-type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
