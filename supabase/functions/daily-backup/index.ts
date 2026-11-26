import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const bucket = Deno.env.get('POWERGIS_BACKUP_BUCKET') ?? 'powergis-backups';
const pageSize = 1000;
const maxRows = Number(Deno.env.get('POWERGIS_BACKUP_MAX_ROWS') ?? 250000);

if (!url || !serviceKey) throw new Error('Backup worker is missing Supabase configuration');
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Row = Record<string, unknown>;
function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function encryptionKey(): Promise<CryptoKey> {
  const raw = Deno.env.get('POWERGIS_BACKUP_ENCRYPTION_KEY') ?? '';
  if (!raw) throw new Error('Backup encryption key is not configured');
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('Backup encryption key must be exactly 32 bytes');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt']);
}

async function encryptBackup(payload: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(payload)));
  const header = new TextEncoder().encode('PGBK1.');
  const ivText = new TextEncoder().encode(b64url(iv) + '.');
  const out = new Uint8Array(header.length + ivText.length + encrypted.length);
  out.set(header, 0); out.set(ivText, header.length); out.set(encrypted, header.length + ivText.length);
  return out;
}


async function readAll(entity: 'users' | 'jurisdictions' | 'assets' | 'auditEvents'): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.rpc('service_backup_page', {
      p_entity: entity,
      p_offset: from,
      p_limit: pageSize,
    });
    if (error) throw new Error(`Backup read failed for ${entity}`);
    const page = Array.isArray(data) ? data as Row[] : [];
    rows.push(...page);
    if (rows.length > maxRows) throw new Error(`Backup safety limit exceeded for ${entity}`);
    if (page.length < pageSize) return rows;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const expectedSecret = Deno.env.get('POWERGIS_BACKUP_CRON_SECRET') ?? '';
  const suppliedSecret = req.headers.get('x-backup-secret') ?? '';
  if (!expectedSecret || suppliedSecret.length !== expectedSecret.length || suppliedSecret !== expectedSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let backupId = `daily-${stamp}`;
  let path = `daily/${backupId}.pgbk`;
  let contentType = 'application/octet-stream';
  try {
    // A manual admin request is claimed atomically; scheduled runs create a new daily snapshot.
    const { data: claimedId, error: claimError } = await supabase.rpc('claim_next_backup_run');
    if (claimError) throw new Error('Unable to claim a pending backup request');
    if (typeof claimedId === 'string' && claimedId.length > 0) {
      backupId = claimedId;
      path = `requested/${backupId}.pgbk`;
      contentType = 'application/octet-stream';
    }
    // Never include password hashes, session tokens, or authentication material.
    const users = await readAll('users');
    const jurisdictions = await readAll('jurisdictions');
    const assets = await readAll('assets');
    const auditEvents = await readAll('auditEvents');

    const payload = {
      schemaVersion: 3,
      backupId,
      exportedAt: new Date().toISOString(),
      counts: { users: users.length, jurisdictions: jurisdictions.length, assets: assets.length, auditEvents: auditEvents.length },
      users,
      jurisdictions,
      assets,
      auditEvents,
    };
    const body = await encryptBackup(JSON.stringify(payload));
    const upload = await supabase.storage.from(bucket).upload(path, body, {
      contentType,
      upsert: false,
    });
    if (upload.error) throw new Error('Private backup storage upload failed');

    const { error: manifestError } = await supabase.from('powergis_backup_runs').upsert({
      backup_id: backupId,
      status: 'COMPLETED',
      storage_path: path,
      user_count: users.length,
      jurisdiction_count: jurisdictions.length,
      asset_count: assets.length,
      completed_at: new Date().toISOString(),
      error_message: null,
    }, { onConflict: 'backup_id' });
    if (manifestError) throw new Error('Backup manifest update failed');

    return new Response(JSON.stringify({ ok: true, backupId, counts: payload.counts }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : 'Unknown backup failure';
    // Keep a failure record for operations without exposing data or secrets.
    await supabase.from('powergis_backup_runs').upsert({
      backup_id: backupId,
      status: 'FAILED',
      error_message: safeMessage.slice(0, 500),
      completed_at: new Date().toISOString(),
    }, { onConflict: 'backup_id' });
    return new Response(JSON.stringify({ ok: false, backupId, error: safeMessage }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
