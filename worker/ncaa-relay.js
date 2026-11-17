/*
 * Data relay for MLB Live Board — a Cloudflare Worker (free plan is plenty).
 *
 * College baseball: browsers won't let a web page read the free NCAA API (ncaa-api.henrygd.me) from
 * another site, because it sends no CORS headers. This Worker fetches the same paths for the board,
 * adds those headers, and caches the answers so the board stays well inside the API's 5-requests-a-second limit.
 *
 * Football: the NFL and College football boards call ESPN directly. If ESPN ever blocks that from your
 * site, put this Worker's address in those boards' Settings → Relay address, and their requests go to
 * /espn/site/... (site.api.espn.com), /espn/web/... (site.web.api.espn.com) and /espn/core/...
 * (sports.core.api.espn.com, used for each week's AP poll) here instead.
 *
 * Deploy: Cloudflare dashboard → Workers & Pages → Create → Create Worker → replace the code with
 * this file → Deploy. Copy the worker's address (https://<name>.<you>.workers.dev) into the board's
 * Settings (College baseball: NCAA data address; football boards: Relay address). The address is kept
 * only in that browser's local storage, so it never ends up in your repository.
 *
 * Optional variables (Worker → Settings → Variables):
 *   UPSTREAM         your own copy of the NCAA API (docker run -p 3000:3000 henrygd/ncaa-api),
 *                    e.g. https://ncaa.example.com. Default: the public instance.
 *   NCAA_KEY         sent as the x-ncaa-key header, if your copy sets NCAA_HEADER_KEY.
 *   ALLOWED_ORIGINS  comma-separated sites allowed to use the relay, e.g. https://board.example.com.
 *                    Recommended: set it to your board's address so nobody else can use your relay.
 *                    Default: any site.
 */
const DEFAULT_UPSTREAM = 'https://ncaa-api.henrygd.me';
const ALLOWED_PATH = /^\/(scoreboard|stats|rankings)\/baseball\//;
const ESPN = { site: 'https://site.api.espn.com', web: 'https://site.web.api.espn.com', core: 'https://sports.core.api.espn.com' };
const ESPN_PATH = /^\/espn\/(site|web|core)(\/(?:apis\/(?:site\/v2|v2|common\/v3)\/sports\/football|v2\/sports\/football\/leagues)\/.*)$/;

/* With ALLOWED_ORIGINS set, only those sites may use the relay. A request from anywhere else is refused
 * outright (it never reaches the upstream), and no Access-Control-Allow-Origin header is sent — in particular
 * not "null", which sandboxed pages and local files would match. */
function originAllowed(origin, env) {
  const allow = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return { open: !allow.length, ok: !allow.length || (!!origin && allow.includes(origin)) };
}
function baseHeaders(origin, env) {
  const a = originAllowed(origin, env);
  const h = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Origin'
  };
  if (a.ok) h['Access-Control-Allow-Origin'] = a.open ? '*' : origin;
  return h;
}

/* Seconds to cache: finished days for a week, recent scoreboards for 45 seconds, stats and the poll for 30 minutes. */
function ttlFor(path) {
  if (/^\/espn\//.test(path)) return /scoreboard|\/summary/.test(path) ? 30 : (/\/news/.test(path) ? 300 : 1800);   // scores and game detail 30 s, headlines 5 min, stats 30 min
  const m = path.match(/^\/scoreboard\/baseball\/d1\/(\d{4})\/(\d{2})\/(\d{2})/);
  if (m) {
    const day = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Date.now() - day > 3 * 86400000 ? 7 * 86400 : 45;
  }
  return 1800;
}

const MAX_QUERY = 600;   // the boards' longest query is well under this; longer ones are only useful for cache-busting abuse

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = baseHeaders(origin, env);
    const reply = (text, status) => new Response(text, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
    if (!originAllowed(origin, env).ok) return reply('Origin not allowed', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return reply('Method not allowed', 405);

    const url = new URL(request.url);   // the URL parser has already resolved any ../ segments
    const espn = url.pathname.match(ESPN_PATH);
    if (!espn && !ALLOWED_PATH.test(url.pathname)) return reply('Not found', 404);
    if (url.search.length > MAX_QUERY) return reply('Query too long', 414);

    let base = DEFAULT_UPSTREAM;
    if (!espn && env.UPSTREAM) {
      try { const u = new URL(env.UPSTREAM); if (u.protocol !== 'https:') throw new Error(); base = (u.origin + u.pathname).replace(/\/+$/, ''); }
      catch (e) { return reply('UPSTREAM must be an https address', 500); }
    }
    const upstream = espn ? ESPN[espn[1]] + espn[2] + url.search : base + url.pathname + url.search;
    const cache = caches.default;
    const key = new Request(upstream, { method: 'GET' });
    let res = await cache.match(key);
    if (!res) {
      const headers = { Accept: 'application/json' };
      if (env.NCAA_KEY && !espn) headers['x-ncaa-key'] = env.NCAA_KEY;   // only ever sent to the NCAA upstream
      let up;
      try { up = await fetch(upstream, { headers, redirect: 'error' }); }   // never follow a redirect to some other host
      catch (e) { return reply('Upstream unreachable', 502); }
      // Always JSON: whatever the upstream sends is never served as a web page from this address.
      res = new Response(up.body, { status: up.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
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
