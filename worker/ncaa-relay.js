/*
 * NCAA relay for the College mode of MLB Live Board — a Cloudflare Worker (free plan is plenty).
 *
 * Browsers won't let a web page read the free NCAA API (ncaa-api.henrygd.me) from another site,
 * because it sends no CORS headers. This Worker fetches the same paths for the board, adds those
 * headers, and caches the answers so the board stays well inside the API's 5-requests-a-second limit.
 *
 * Deploy: Cloudflare dashboard → Workers & Pages → Create → Create Worker → replace the code with
 * this file → Deploy. Copy the worker's address (https://<name>.<you>.workers.dev) into the board's
 * Settings → NCAA data address.
 *
 * Optional variables (Worker → Settings → Variables):
 *   UPSTREAM         your own copy of the NCAA API (docker run -p 3000:3000 henrygd/ncaa-api),
 *                    e.g. https://ncaa.example.com. Default: the public instance.
 *   NCAA_KEY         sent as the x-ncaa-key header, if your copy sets NCAA_HEADER_KEY.
 *   ALLOWED_ORIGINS  comma-separated origins allowed to use the relay, e.g. https://board.example.com.
 *                    Default: any origin.
 */
const DEFAULT_UPSTREAM = 'https://ncaa-api.henrygd.me';
const ALLOWED_PATH = /^\/(scoreboard|stats|rankings)\/baseball\//;

function corsHeaders(origin, env) {
  const allow = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = !allow.length || allow.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (allow.length ? origin : '*') : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

/* Seconds to cache: finished days for a week, recent scoreboards for 45 seconds, stats and the poll for 30 minutes. */
function ttlFor(path) {
  const m = path.match(/^\/scoreboard\/baseball\/d1\/(\d{4})\/(\d{2})\/(\d{2})/);
  if (m) {
    const day = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Date.now() - day > 3 * 86400000 ? 7 * 86400 : 45;
  }
  return 1800;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const url = new URL(request.url);
    if (!ALLOWED_PATH.test(url.pathname)) return new Response('Not found', { status: 404, headers: cors });

    const upstream = (env.UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, '') + url.pathname + url.search;
    const cache = caches.default;
    const key = new Request(upstream, { method: 'GET' });
    let res = await cache.match(key);
    if (!res) {
      const headers = { Accept: 'application/json' };
      if (env.NCAA_KEY) headers['x-ncaa-key'] = env.NCAA_KEY;
      const up = await fetch(upstream, { headers });
      res = new Response(up.body, { status: up.status, headers: { 'Content-Type': up.headers.get('Content-Type') || 'application/json' } });
      if (up.ok) {
        res.headers.set('Cache-Control', 'public, max-age=' + ttlFor(url.pathname));
        ctx.waitUntil(cache.put(key, res.clone()));
      }
    }
    const out = new Response(res.body, res);
    Object.keys(cors).forEach((k) => out.headers.set(k, cors[k]));
    return out;
  }
};
