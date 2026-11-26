import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const bootstrapSecret = Deno.env.get('POWERGIS_BOOTSTRAP_SECRET') ?? '';
if (!url || !serviceKey) throw new Error('Bootstrap function is missing Supabase configuration');
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!bootstrapSecret) return json({ error: 'Bootstrap is disabled' }, 503);
  try {
    const body = await req.json();
    const secret = typeof body.secret === 'string' ? body.secret : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!secret || !username || !password || password.length > 512) return json({ error: 'Invalid bootstrap request' }, 400);
    const { error } = await supabase.rpc('bootstrap_set_admin', {
      p_bootstrap_secret: secret,
      p_expected_secret: bootstrapSecret,
      p_username: username,
      p_password: password,
    });
    if (error) return json({ error: 'Bootstrap failed' }, 403);
    return json({ ok: true });
  } catch {
    return json({ error: 'Bootstrap failed' }, 400);
  }
});
