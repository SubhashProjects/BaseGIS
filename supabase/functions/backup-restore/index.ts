import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const bucket = Deno.env.get('POWERGIS_BACKUP_BUCKET') ?? 'powergis-backups';
const allowedOrigin = Deno.env.get('POWERGIS_ALLOWED_ORIGIN') ?? '';
const maxBytes = Number(Deno.env.get('POWERGIS_BACKUP_RESTORE_MAX_BYTES') ?? 268435456);
if (!url || !serviceKey) throw new Error('Backup restore function is missing Supabase configuration');
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });


function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function backupKey(): Promise<CryptoKey> {
  const raw = Deno.env.get('POWERGIS_BACKUP_ENCRYPTION_KEY') ?? '';
  if (!raw) throw new Error('Backup encryption key is not configured');
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('Backup encryption key must be exactly 32 bytes');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
}

async function decryptBackup(bytes: Uint8Array): Promise<string> {
  const text = new TextDecoder().decode(bytes);
  if (!text.startsWith('PGBK1.')) throw new Error('Unsupported backup envelope');
  const parts = text.split('.');
  if (parts.length !== 3) throw new Error('Invalid backup envelope');
  const iv = fromB64url(parts[1]);
  const ciphertext = fromB64url(parts[2]);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await backupKey(), ciphertext);
  return new TextDecoder().decode(plain);
}

const json = (body: unknown, status = 200, origin = '') => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store, no-store',
    'pragma': 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...(origin ? { 'access-control-allow-origin': origin } : {}),
    'vary': 'Origin',
  },
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (allowedOrigin && origin && origin !== allowedOrigin) return json({ error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...(allowedOrigin ? { 'access-control-allow-origin': allowedOrigin } : {}), 'access-control-allow-headers': 'authorization, apikey, content-type, x-powergis-session', 'access-control-allow-methods': 'POST, OPTIONS', 'vary': 'Origin' } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json();
    const sessionToken = req.headers.get('x-powergis-session') || (typeof body.sessionToken === 'string' ? body.sessionToken : '');
    const backupId = typeof body.backupId === 'string' ? body.backupId : '';
    const action = body.action;
    if (!sessionToken || sessionToken.length > 512 || !backupId || backupId.length > 160 || !['download', 'restore'].includes(action)) {
      return json({ error: 'Invalid backup request' }, 400, allowedOrigin && origin ? origin : '');
    }
    // This RPC verifies the opaque live session and GIS_ADMIN role before returning a path.
    const { data: storagePath, error: pathError } = await supabase.rpc('admin_get_backup_path', {
      p_session_token: sessionToken,
      p_backup_id: backupId,
    });
    if (pathError || typeof storagePath !== 'string') return json({ error: 'GIS Admin access required or completed backup unavailable' }, 403, allowedOrigin && origin ? origin : '');

    if (action === 'download') {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60);
      if (error || !data?.signedUrl) return json({ error: 'Unable to create a temporary backup download link' }, 500, allowedOrigin && origin ? origin : '');
      return json({ signedUrl: data.signedUrl, expiresInSeconds: 60 }, 200, allowedOrigin && origin ? origin : '');
    }

    const { data: file, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
    if (downloadError || !file) return json({ error: 'Backup file could not be retrieved from private storage' }, 500, allowedOrigin && origin ? origin : '');
    if (file.size > maxBytes) return json({ error: 'Backup exceeds the configured restore size limit' }, 413, allowedOrigin && origin ? origin : '');
    let payload: unknown;
    try { payload = JSON.parse(await decryptBackup(new Uint8Array(await file.arrayBuffer()))); }
    catch { return json({ error: 'Backup file is not valid JSON' }, 422, allowedOrigin && origin ? origin : ''); }
    const { data: restored, error: restoreError } = await supabase.rpc('admin_restore_backup_payload', {
      p_session_token: sessionToken,
      p_backup_id: backupId,
      p_payload: payload,
    });
    if (restoreError) return json({ error: 'Backup restore failed' }, 422, allowedOrigin && origin ? origin : '');
    return json({ ok: true, backupId, restored: Array.isArray(restored) ? restored[0] : restored }, 200, allowedOrigin && origin ? origin : '');
  } catch {
    return json({ error: 'Unexpected backup operation failure' }, 500, allowedOrigin && origin ? origin : '');
  }
});
