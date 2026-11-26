import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const failures = new Rate('viewport_rpc_failures');
const baseUrl = (__ENV.SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = __ENV.SUPABASE_ANON_KEY || '';
const sessionToken = __ENV.POWERGIS_SESSION_TOKEN || '';
if (!baseUrl || !anonKey || !sessionToken) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and a staging GIS session token in the environment.');
}

export const options = {
  scenarios: {
    concurrent_viewports: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '60s', target: 50 },
        { duration: '60s', target: 100 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    viewport_rpc_failures: ['rate<0.01'],
  },
};

export default function () {
  const body = JSON.stringify({
    p_session_token: sessionToken,
    p_west: 79.75,
    p_south: 10.85,
    p_east: 79.95,
    p_north: 11.05,
    p_limit: 5000,
  });
  const response = http.post(`${baseUrl}/rest/v1/rpc/visible_assets_in_bbox`, body, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    timeout: '10s',
  });
  const ok = check(response, {
    'viewport RPC returns 200': (r) => r.status === 200,
    'viewport response is JSON': (r) => (r.headers['Content-Type'] || '').includes('json'),
  });
  failures.add(!ok);
  sleep(0.2);
}
