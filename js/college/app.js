/* MLB Live Board · College mode — state, data loading, rendering, ticker, feature chart, settings, TV.
 * Three levels: All D1 → a conference → a team. Reuses the board's CSS and chart helpers. */
(function () {
  'use strict';
  var X = window.MLBX, C = X.College, API = C.API, CH = X.Charts;
  var esc = CH.esc, rate3 = CH.rate3, signed = CH.signed;
  var LS_SHARED = 'mlb-live-board:settings', LS_COLLEGE = 'mlb-live-board:college';
  var SHARED_KEYS = ['theme', 'layout', 'tvRotate', 'ticker', 'tickerSpeed', 'refresh', 'limit', 'league'];
  var SHARED_DEFAULTS = { theme: 'auto', layout: 'standard', tvRotate: 12, ticker: true, tickerSpeed: 'normal', refresh: true, limit: 5, league: 'college' };

  var S = {
    settings: null, cs: null, scope: 'D1', view: 'dash', data: null, ext: {}, pendingExt: {},
    tickPaused: false, tv: { chart: 0, board: 0, timer: null }, timers: {}, nextDailyAt: 0, wake: null, loadError: null, resetArmed: false, crawl: null
  };
  var TK = { x: 0, last: null, raf: null, hover: false };

  /* ───────── utilities ───────── */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function team(seo) { return C.TEAM_BY_SEO[seo]; }
  function abbr(seo, fallback) { var t = team(seo); return t ? t.abbr : (fallback || seo || '—'); }
  function nick(seo) { var t = team(seo); return t ? t.school : seo; }
  function confOf(seo) { var t = team(seo); return t ? t.conf : null; }
  function conf(id) { return C.CONF_BY_ID[id]; }
  function teamByName(n) { return C.TEAM_BY_NAME[C.nameKey(n)]; }
  function shortName(n) { var p = String(n).split(' '); return p.length > 1 ? p[0].charAt(0) + '. ' + p.slice(1).join(' ') : n; }
  function isD1() { return S.scope === 'D1'; }
  function scopeConfOnly() { return S.scope.indexOf('c:') === 0 ? S.scope.slice(2) : null; }
  function scopeTeam() { return !isD1() && !scopeConfOnly() ? S.scope : null; }
  function scopeConf() { return scopeConfOnly() || (scopeTeam() ? confOf(scopeTeam()) : null); }
  function entity() { return isD1() ? C.D1 : (scopeTeam() ? team(scopeTeam()) : conf(scopeConfOnly())); }
  function confTeams(cid) { return C.TEAMS.filter(function (t) { return t.conf === cid; }).map(function (t) { return t.seo; }); }
  function inScope(seo) { if (isD1()) return true; if (scopeTeam()) return seo === scopeTeam(); return confOf(seo) === scopeConfOnly(); }
  function nowDate() { return S.data && S.data.source === 'snapshot' ? new Date(S.data.now) : new Date(); }
  function dayKey(d) { return API.ymd(d); }
  function todayKey() { return dayKey(nowDate()); }
  function yestKey() { return API.addDays(todayKey(), -1); }
  function byDate(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); }
  function isLive() { return S.data && S.data.source === 'live'; }
  function isSnap() { return S.data && S.data.source === 'snapshot'; }
  function whenLabel(g) {
    var dk = g.day || dayKey(new Date(g.date)), t = todayKey();
    if (dk === t) return 'Today';
    if (dk === API.addDays(t, 1)) return 'Tomorrow';
    if (dk === API.addDays(t, -1)) return 'Yesterday';
    return new Date(dk + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function timeLabel(g) { return g.tbd ? 'Time TBA' : new Date(g.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
  function involves(g, seo) { return g.away.seo === seo || g.home.seo === seo; }
  function involvesScope(g) { return isD1() ? true : (inScope(g.away.seo) || inScope(g.home.seo)); }
  function wl(w, l, t) { return w + '–' + l + (t ? '–' + t : ''); }
  function pctOf(w, l) { return w + l ? w / (w + l) : null; }
  function halfText(v) { return v % 1 ? Math.abs(v).toFixed(1) : String(Math.abs(v)); }

  /* Messages: snapshot gaps and empty live responses read differently on purpose. */
  function msgLoading(what) { return '<div class="loading">Loading ' + esc(what) + '</div>'; }
  function msgSnapshot() { return '<div class="empty"><strong>Available with live data</strong>The saved snapshot doesn’t include this. It loads from the NCAA API on your hosted board.</div>'; }
  function msgNoData(what) { return '<div class="empty"><strong>No data came back</strong>The NCAA API returned nothing for ' + esc(what) + '. If this keeps happening, check the request in js/college/api.js.</div>'; }
  function missingShort() { return isLive() ? 'No data from the NCAA API' : 'Available with live data'; }
  function msgCrawl() {
    var c = S.crawl;
    if (c && c.failed) return msgNoData('the season’s scoreboards');
    return '<div class="loading">Loading the season’s results' + (c && c.total ? ' · ' + c.done + ' of ' + c.total + ' days' : '') + '<span class="hint" style="display:block;font-size:13px;margin-top:4px">First visit only. Results are kept on this device after that.</span></div>';
  }

  /* ───────── settings (display settings are shared with the MLB board) ───────── */
  function readJSON(k) { try { var raw = window.localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function writeJSON(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function loadSettings() {
    var raw = readJSON(LS_SHARED) || {}, s = {};
    SHARED_KEYS.forEach(function (k) { s[k] = raw[k] !== undefined ? raw[k] : SHARED_DEFAULTS[k]; });
    var cs = clone(C.DEFAULT_SETTINGS), sc = readJSON(LS_COLLEGE);
    if (sc && typeof sc === 'object') {
      Object.keys(cs).forEach(function (k) { if (k !== 'blocks' && sc[k] !== undefined) cs[k] = sc[k]; });
      if (sc.blocks) Object.keys(cs.blocks).forEach(function (k) { if (sc.blocks[k] !== undefined) cs.blocks[k] = sc.blocks[k]; });
    }
    var valid = { hide: true }; C.FEATURE_GROUPS.forEach(function (g) { g.options.forEach(function (o) { valid[o[0]] = true; }); });
    if (!valid[cs.blocks.race]) cs.blocks.race = 'gap';
    S.settings = s; S.cs = cs;
  }
  function saveSettings() {
    var raw = readJSON(LS_SHARED) || {};
    SHARED_KEYS.forEach(function (k) { raw[k] = S.settings[k]; });
    writeJSON(LS_SHARED, raw);
    writeJSON(LS_COLLEGE, S.cs);
  }
  function validScope(v) {
    if (v === 'D1') return true;
    if (String(v).indexOf('c:') === 0) return !!conf(String(v).slice(2));
    return !!team(v);
  }
  function isTV() { return S.settings.layout === 'tv' && S.view === 'dash'; }

  /* ───────── theme + colors ───────── */
  function applyChrome() {
    var root = document.documentElement;
    if (S.settings.theme === 'auto') root.removeAttribute('data-app-theme'); else root.setAttribute('data-app-theme', S.settings.theme);
    root.classList.toggle('tv', isTV());
    var t = entity() || C.D1, st = root.style;
    st.setProperty('--team', t.primary); st.setProperty('--team-2', t.secondary); st.setProperty('--on-team-2', t.onSecondary);
    st.setProperty('--team-ink-l', t.inkLight); st.setProperty('--team-ink-d', t.inkDark); st.setProperty('--team-tick', t.tick || t.inkDark);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t.primary);
    document.title = (isD1() ? '' : t.full + ' · ') + 'College Baseball Live Board';
  }

  /* ───────── data ───────── */
  function useSnapshot(err) {
    var sn = C.SNAPSHOT;
    S.loadError = err ? String(err.message || err) : null;
    var records = {};
    Object.keys(sn.records).forEach(function (seo) { var r = sn.records[seo]; records[seo] = { w: r[0], l: r[1], t: r[2], pct: pctOf(r[0] + r[2] / 2, r[1] + r[2] / 2) }; });
    var post = API.seasonFromStore({ days: groupDays(sn.games) }).games;
    S.data = { source: 'snapshot', asOf: sn.asOf, now: sn.now, season: sn.season, phase: 'off', statsUpdated: sn.statsUpdated,
      records: records, rankings: normRankings({ title: sn.rankings.title, updated: sn.rankings.updated, rows: sn.rankings.rows.map(function (r) { return { rank: r[0], name: r[1], record: r[2], prev: r[3] }; }) }),
      games: post, seasonGames: post, partial: true, recs: API.records(post, confOf) };
    function groupDays(list) { var g = {}; list.forEach(function (a) { (g[a[0]] = g[a[0]] || []).push(a.slice(1)); }); return g; }
  }
  function normRankings(rk) {
    if (!rk) return null;
    rk.rows.forEach(function (r) { r.seo = pollSeo(r.name); });
    return rk;
  }
  function pollSeo(name) {
    var k = C.nameKey(name);
    if (C.POLL_ALIASES[k]) return C.POLL_ALIASES[k];
    var t = C.TEAM_BY_NAME[k] || C.TEAM_BY_NAME[k.replace(/ state$/, ' st.')] || C.TEAM_BY_NAME[k.replace(/ state /, ' st. ')];
    if (t) return t.seo;
    var hit = C.TEAMS.filter(function (x) { return C.nameKey(x.school) === k; })[0];
    return hit ? hit.seo : null;
  }
  function recordsFromList(list) {
    var out = {};
    list.rows.forEach(function (r) {
      var t = teamByName(r.Team); if (!t) return;
      var w = parseInt(r.W, 10) || 0, l = parseInt(r.L, 10) || 0, ti = parseInt(r.T, 10) || 0;
      out[t.seo] = { w: w, l: l, t: ti, pct: pctOf(w + ti / 2, l + ti / 2) };
    });
    return out;
  }
  function windowDays() { var t = todayKey(), out = []; for (var i = -1; i <= 6; i++) out.push(API.addDays(t, i)); return out; }
  function loadWindow() {
    var days = windowDays();
    return Promise.all(days.map(function (d) { return API.scoreboard(d).catch(function () { return null; }); })).then(function (r) {
      if (r.every(function (x) { return x === null; })) throw new Error('Scoreboards could not be loaded');
      var all = []; r.forEach(function (gs) { if (gs) all = all.concat(gs); });
      return all.sort(byDate);
    });
  }
  function loadLive() {
    API.setBase(S.cs.apiBase);
    var now = new Date(), season = API.seasonFor(now);
    return Promise.all([
      API.statList('team', C.WL_LIST, true),
      API.rankings().catch(function () { return null; }),
      loadWindow().catch(function () { return []; })
    ]).then(function (r) {
      S.data = { source: 'live', asOf: new Date().toISOString(), now: null, season: season.year, seasonInfo: season, statsUpdated: r[0].updated,
        records: recordsFromList(r[0]), rankings: normRankings(r[1]), games: r[2], seasonGames: null, recs: null, partial: false };
      S.data.phase = phaseFor();
      S.ext = {}; S.pendingExt = {};
      startCrawl();
    });
  }
  /* Download every scoreboard of the season (cached on the device) → records, charts, team results. */
  function startCrawl(force) {
    var d = S.data; if (!isLive()) return;
    S.crawl = { done: 0, total: 0 };
    var lastPaint = 0;
    API.season(d.seasonInfo, dayKey(new Date()), function (done, total) {
      S.crawl = { done: done, total: total };
      if (Date.now() - lastPaint > 1500) { lastPaint = Date.now(); refreshMain(); }
    }, force).then(function (res) {
      if (S.data !== d) return;
      mergeSeason(res.games);
      S.crawl = null; refreshAll();
    }).catch(function () { S.crawl = { failed: true }; refreshMain(); });
  }
  function mergeSeason(list) {
    var d = S.data, byPk = {};
    list.forEach(function (g) { byPk[g.pk] = g; });
    (d.games || []).forEach(function (g) { if (g.day <= todayKey()) byPk[g.pk] = g; });   // fresher scores from the ticker window
    d.seasonGames = Object.keys(byPk).map(function (k) { return byPk[k]; }).filter(function (g) { return g.day <= todayKey(); }).sort(byDate);
    d.recs = API.records(d.seasonGames, confOf);
    d.phase = phaseFor();
  }
  function phaseFor() {
    var d = S.data, t = todayKey(), y = d.season, all = (d.seasonGames || []).concat(d.games || []);
    var finals = seriesFrom(all).filter(function (s) { return s.round === 'World Series Finals'; })[0];
    if (finals && finals.over) return 'off';
    if (t > y + '-06-30' || String(new Date().getFullYear()) > String(y)) return 'off';
    if (all.some(function (g) { return g.post; })) return 'post';
    if (!all.some(function (g) { return g.state === 'final' || g.state === 'live'; })) return 'pre';
    return 'regular';
  }
  function refreshScores() {
    if (!isLive()) return Promise.resolve();
    var d = S.data;
    return loadWindow().then(function (gs) {
      d.games = gs; d.asOf = new Date().toISOString();
      if (d.seasonGames) mergeSeason(d.seasonGames);
      refreshTicker(); refreshMain(); refreshStatus();
    }).catch(function () { /* keep the last good scores */ });
  }
  function scheduleScores() {
    clearTimeout(S.timers.sched);
    if (!S.settings.refresh || !isLive()) return;
    var now = Date.now(), gs = S.data.games, delay = null;
    if (gs.some(function (g) { return g.state === 'live'; })) delay = 60000;
    else {
      var starts = gs.filter(function (g) { return g.state === 'pre' && !g.tbd; }).map(function (g) { return new Date(g.date).getTime(); });
      if (starts.some(function (t) { return t <= now && now - t < 4 * 3600000; })) delay = 60000;
      else { var fut = starts.filter(function (t) { return t > now; }); if (fut.length) delay = Math.max(30000, Math.min.apply(null, fut) - now - 60000); }
    }
    if (delay == null) return;
    S.timers.sched = setTimeout(function () { refreshScores().then(scheduleScores); }, Math.min(delay, 2147483000));
  }
  function scheduleDaily() {
    clearTimeout(S.timers.daily);
    if (!S.settings.refresh || !isLive()) return;
    var n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 5, 0, 0);
    if (t <= n) t = new Date(t.getTime() + 86400000);
    S.nextDailyAt = t.getTime();
    S.timers.daily = setTimeout(dailyReload, Math.min(t - n, 2147483000));
  }
  function dailyReload() {
    API.resetCache();
    loadLive().then(function () { render(); }).catch(function () { /* keep yesterday's data */ }).then(function () { scheduleScores(); scheduleDaily(); });
  }
  function need(key, fn) {
    var v = S.ext[key];
    if (v !== undefined) return v;
    if (!isLive()) return { error: 'snapshot' };
    if (!S.pendingExt[key]) {
      S.pendingExt[key] = true;
      fn().then(function (r) { S.ext[key] = r; }, function (e) { S.ext[key] = { error: String((e && e.message) || e) }; })
        .then(function () { delete S.pendingExt[key]; queueRefresh(); });
    }
    return undefined;
  }
  function isErr(v) { return v && !Array.isArray(v) && v.error; }
  var queued = false;
  function queueRefresh() { if (queued) return; queued = true; setTimeout(function () { queued = false; refreshStatus(); refreshMain(); }, 80); }

  /* ───────── poll ranks ───────── */
  function rankOf(seo) {
    var rk = S.data && S.data.rankings; if (!rk) return null;
    var r = rk.rows.filter(function (x) { return x.seo === seo; })[0];
    return r ? r.rank : null;
  }
  function rankTag(seo) { var r = rankOf(seo); return r ? '<span class="tk-rk">' + r + '</span>' : ''; }
  function topSeos(n) { var rk = S.data.rankings; return rk ? rk.rows.filter(function (r) { return r.seo; }).slice(0, n).map(function (r) { return r.seo; }) : []; }

  /* ───────── stat lists ───────── */
  /* → { rows: [{rank, name, team, value}] } | { loading } | { error } | { missing } */
  function indList(id, all) {
    if (isSnap()) { var s = C.SNAPSHOT.ind[id]; return s ? { rows: s.map(function (r) { return { rankText: r[0], name: r[1], team: r[2], value: r[3] }; }) } : { missing: true }; }
    var v = need('I|' + id + '|' + (all ? 1 : 0), function () { return API.statList('individual', id, all); });
    if (v === undefined) return { loading: true };
    if (isErr(v)) return { error: true };
    return { rows: v.rows.map(function (r) { return { rankText: r.Rank, name: String(r.Name || '').trim(), team: String(r.Team || '').trim(), value: API.valueOf(r) }; }) };
  }
  function rankUp(rows, keepNational) {
    var last = null, lastText = null;
    return rows.map(function (r, i) {
      var rk;
      if (keepNational) { var n = parseInt(r.rankText, 10); rk = isNaN(n) ? last : n; }
      else rk = r.value === lastText ? last : i + 1;
      last = rk; lastText = r.value;
      var t = teamByName(r.team);
      return { rank: rk, name: r.name, seo: t ? t.seo : null, teamName: r.team, value: r.value };
    });
  }
  function leaderState(statKey) {
    var s = C.STAT_BY_KEY[statKey]; if (!s || !S.data) return { loading: true };
    var L = indList(s.id, !isD1());
    if (!L.rows) return L;
    if (isD1()) return { rows: rankUp(L.rows, true).slice(0, S.settings.limit), national: true };
    var mine = L.rows.filter(function (r) { var t = teamByName(r.team); return t && inScope(t.seo); });
    return { rows: rankUp(mine, false).slice(0, S.settings.limit), listSize: L.rows.length };
  }
  function teamList(id) {
    if (isSnap()) {
      var s = C.SNAPSHOT.team[id]; if (!s) return { missing: true };
      return { rows: s.map(function (r) { return { Rank: r[0], Team: r[1], value: r[2], R: r[3] }; }) };
    }
    var v = need('T|' + id, function () { return API.statList('team', id, true); });
    if (v === undefined) return { loading: true };
    if (isErr(v)) return { error: true };
    return { rows: v.rows.map(function (r) { return { Rank: r.Rank, Team: r.Team, value: API.valueOf(r), R: r.R }; }) };
  }
  function teamTable(id) {
    var L = teamList(id); if (!L.rows) return L;
    var out = {}, last = null;
    L.rows.forEach(function (r) {
      var n = parseInt(r.Rank, 10); if (!isNaN(n)) last = n;
      var t = teamByName(r.Team); if (!t) return;
      out[t.seo] = { rank: last, text: String(r.value).trim(), v: parseFloat(String(r.value).replace(/,/g, '')), R: r.R != null ? parseFloat(r.R) : null };
    });
    return { map: out, size: L.rows.length };
  }

  /* ───────── club metrics ───────── */
  /* → { v, text } | { loading } | { missing } */
  function metric(seo, key) {
    var m = C.METRIC_BY_KEY[key], d = S.data; if (!m || !d) return { loading: true };
    if (m.src === 'ts') {
      var T = teamTable(m.id); if (!T.map) return T;
      var x = T.map[seo]; return x ? { v: x.v, text: x.text, rank: x.rank, of: T.size } : { none: true };
    }
    if (m.id === 'record' || m.id === 'pct') {
      var r = d.records[seo]; if (!r) return { none: true };
      return m.id === 'record' ? { v: r.pct, text: wl(r.w, r.l, r.t) } : { v: r.pct, text: rate3(r.pct || 0) };
    }
    if (m.id === 'rdiff') {
      var F = teamTable(C.RUNS_FOR), A = teamTable(C.RUNS_AGAINST);
      if (!F.map) return F; if (!A.map) return A;
      var f = F.map[seo], a = A.map[seo]; if (!f || !a || f.R == null || a.R == null) return { none: true };
      return { v: f.R - a.R, text: signed(f.R - a.R) };
    }
    if (d.partial) return { missing: true };
    if (!d.recs) return { loading: true };
    var g = d.recs[seo]; if (!g) return { none: true };
    if (m.id === 'conf') return g.cw + g.cl ? { v: pctOf(g.cw, g.cl), text: wl(g.cw, g.cl) } : { none: true };
    if (m.id === 'streak') return { v: (g.streak.charAt(0) === 'W' ? 1 : -1) * parseInt(g.streak.slice(1), 10), text: g.streak };
    if (m.id === 'l10') return { v: parseInt(g.l10, 10), text: g.l10 };
    if (m.id === 'home') return { v: pctOf(g.hw, g.hl), text: wl(g.hw, g.hl) };
    if (m.id === 'away') return { v: pctOf(g.aw, g.al), text: wl(g.aw, g.al) };
    return { none: true };
  }
  function metricBest(seos, key) {
    var m = C.METRIC_BY_KEY[key], best = null, state = null;
    seos.forEach(function (seo) {
      var x = metric(seo, key);
      if (x.loading || x.missing) { state = state || x; return; }
      if (x.v == null || isNaN(x.v)) return;
      if (!best || (m.low ? x.v < best.x.v : x.v > best.x.v)) best = { seo: seo, x: x };
    });
    return best || state || { none: true };
  }
  function metricRank(seo, key, pool) {
    var m = C.METRIC_BY_KEY[key], me = metric(seo, key);
    if (me.v == null || isNaN(me.v)) return null;
    var vals = pool.map(function (s) { return metric(s, key).v; }).filter(function (v) { return v != null && !isNaN(v); });
    var better = vals.filter(function (v) { return m.low ? v < me.v : v > me.v; }).length, ties = vals.filter(function (v) { return v === me.v; }).length;
    return { rank: better + 1, tie: ties > 1, of: vals.length };
  }
  function confStandings(cid) {
    var d = S.data, ids = confTeams(cid);
    return ids.map(function (seo) {
      var r = d.records[seo] || { w: 0, l: 0, t: 0, pct: null }, g = d.recs && !d.partial ? d.recs[seo] : null;
      return { seo: seo, w: r.w, l: r.l, t: r.t, pct: r.pct || 0, cw: g ? g.cw : null, cl: g ? g.cl : null, cpct: g && g.cw + g.cl ? g.cw / (g.cw + g.cl) : null };
    }).sort(function (a, b) {
      if (a.cpct != null || b.cpct != null) { var c = (b.cpct == null ? -1 : b.cpct) - (a.cpct == null ? -1 : a.cpct); if (c) return c; var cw = (b.cw || 0) - (a.cw || 0); if (cw) return cw; }
      return b.pct - a.pct;
    });
  }

  /* ───────── header ───────── */
  function contextLine() {
    var d = S.data; if (!d) return 'Loading';
    if (d.phase === 'post') {
      var cur = (d.games || []).concat(d.seasonGames || []).filter(function (g) { return g.post; }).sort(byDate).pop();
      return d.season + ' NCAA Tournament' + (cur ? ' · ' + roundName(cur.round) : '');
    }
    if (d.phase === 'pre') return d.season + ' season · Opening Day ahead';
    if (d.phase === 'off') return d.season + ' season · Final';
    return d.season + ' Regular season';
  }
  function statusHTML() {
    var d = S.data;
    if (!d) return '<span class="pill"><span class="dot"></span>Loading</span>';
    if (d.source === 'snapshot') {
      var at = new Date(d.asOf).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      return '<span class="pill snap" title="' + esc(S.loadError ? 'Live data unavailable: ' + S.loadError : '') + '">Snapshot</span><span class="ctx">' + esc(contextLine()) + ' · Data as of ' + esc(at) + '</span>';
    }
    var anyLive = (d.games || []).some(function (x) { return x.state === 'live'; });
    return '<span class="pill"><span class="dot"></span>' + (anyLive ? 'Live' : 'Live data') + '</span><span class="ctx">' + esc(contextLine()) + ' · Updated ' + esc(new Date(d.asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</span>';
  }
  var CHEV = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  function scopeSelectsHTML(prefix) {
    var cid = scopeConf();
    var copts = '<option value="D1"' + (isD1() ? ' selected' : '') + '>All D1</option>' + C.CONFS.map(function (c) {
      return '<option value="c:' + c.id + '"' + (cid === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    var h = '<div class="pick"><label for="' + prefix + '-conf">Conference</label><div class="select-wrap"><select id="' + prefix + '-conf" data-act="conf">' + copts + '</select>' + CHEV + '</div></div>';
    if (cid) {
      var topts = '<option value="c:' + cid + '"' + (scopeConfOnly() ? ' selected' : '') + '>Whole conference</option>' + C.TEAMS.filter(function (t) { return t.conf === cid; })
        .sort(function (a, b) { return a.school < b.school ? -1 : 1; }).map(function (t) {
          return '<option value="' + t.seo + '"' + (scopeTeam() === t.seo ? ' selected' : '') + '>' + esc(t.school) + '</option>';
        }).join('');
      h += '<div class="pick"><label for="' + prefix + '-team">Team</label><div class="select-wrap"><select id="' + prefix + '-team" data-act="team">' + topts + '</select>' + CHEV + '</div></div>';
    }
    return h;
  }
  function tileHTML(key) {
    var m = C.METRIC_BY_KEY[key]; if (!m || !S.data) return '';
    function tile(k, v, s) { return '<div class="tile"><span class="tile-k">' + esc(k) + '</span><span class="tile-v">' + esc(v) + '</span>' + (s ? '<span class="tile-s">' + esc(s) + '</span>' : '') + '</div>'; }
    function pending(x) { return x.loading ? 'Loading' : (x.missing ? 'Available with live data' : missingShort()); }
    var recordish = m.fmt === 'record' || m.fmt === 'conf' || m.fmt === 'streak' || m.fmt === 'l10' || m.fmt === 'home' || m.fmt === 'away';
    var seo = scopeTeam();
    if (!seo) {
      var pool = isD1() ? C.TEAMS.map(function (t) { return t.seo; }) : confTeams(scopeConfOnly());
      if (recordish) {
        var lead = isD1() ? topSeos(1)[0] : (confStandings(scopeConfOnly())[0] || {}).seo;
        if (!lead) return tile(m.label, '—', missingShort());
        var lx = metric(lead, key);
        if (lx.text == null) return tile(m.label, '—', pending(lx));
        return tile(m.label, abbr(lead) + ' · ' + lx.text, isD1() ? 'No. 1 in the ' + ((S.data.rankings && S.data.rankings.title) || 'Top 25') : 'Leads the ' + conf(scopeConfOnly()).name);
      }
      var b = metricBest(pool, key);
      if (!b.seo) return tile(m.label, '—', pending(b));
      return tile(m.label, abbr(b.seo) + ' · ' + b.x.text, isD1() ? 'Best in D1' : 'Best in the ' + conf(scopeConfOnly()).name);
    }
    var x = metric(seo, key);
    if (x.text == null) return tile(m.label, '—', x.none ? 'Not listed' : pending(x));
    var sub = '';
    if (m.fmt === 'record') {
      var cs = confStandings(confOf(seo)), pos = cs.map(function (r) { return r.seo; }).indexOf(seo), rk = rankOf(seo);
      sub = [cs[pos] && cs[pos].cpct != null ? ord(pos + 1) + ' in the ' + conf(confOf(seo)).name : '', rk ? 'No. ' + rk + ' in the Top 25' : ''].filter(Boolean).join(' · ');
    } else if (m.fmt === 'conf') {
      var cs2 = confStandings(confOf(seo)), p2 = cs2.map(function (r) { return r.seo; }).indexOf(seo);
      sub = ord(p2 + 1) + ' in the ' + conf(confOf(seo)).name;
    } else if (m.src === 'ts') sub = x.rank ? ord(x.rank) + ' of ' + x.of + ' in D1' : '';
    else if (!recordish) { var rr = metricRank(seo, key, C.TEAMS.map(function (t) { return t.seo; })); sub = rr ? (rr.tie ? 'T-' : '') + ord(rr.rank) + ' of ' + rr.of + ' in D1' : ''; }
    return tile(m.label, x.text, sub);
  }
  function tilesHTML() { return ['tile1', 'tile2', 'tile3', 'tile4'].map(function (k) { var v = S.cs.blocks[k]; return v && v !== 'hide' ? tileHTML(v) : ''; }).join(''); }
  var PAUSE_SVG = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"><line x1="8" y1="5" x2="8" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line></svg>';
  var PLAY_SVG = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>';
  var GEAR = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>';
  function tickLabel() { var e = entity(); return isD1() ? 'D1' : e.abbr; }
  function tickerShellHTML() {
    if (!S.settings.ticker) return '';
    return '<div class="ticker" aria-label="Scores and schedule ticker"><div class="tk-label" id="tk-label">' + esc(tickLabel()) + '</div>' +
      '<button type="button" class="tk-btn" data-act="tk-toggle" aria-label="' + (S.tickPaused ? 'Play ticker' : 'Pause ticker') + '">' + (S.tickPaused ? PLAY_SVG : PAUSE_SVG) + '</button>' +
      '<div class="tk-view' + (S.tickPaused ? ' paused' : '') + '" id="tk-view"><div class="tk-track" id="tk-track">' + tickerItemsHTML() + '</div></div></div>';
  }
  function headerHTML() {
    var t = entity();
    var actions = '<div class="hdr-actions">' + scopeSelectsHTML('scope') + '<button type="button" class="btn-hdr" data-act="open-settings">' + GEAR + 'Settings</button></div>';
    var top = '<div class="hdr-top"><div class="hdr-status" id="hdr-status">' + statusHTML() + '</div>' + (isTV() ? '' : actions) + '</div>';
    var title = '<h1 class="hdr-title">' + esc(t.full) + '</h1>';
    var body = isTV() ? '<div class="hdr-main">' + title + '<div class="tiles" id="tiles">' + tilesHTML() + '</div></div>' : title + '<div class="tiles" id="tiles">' + tilesHTML() + '</div>';
    return '<header class="hdr"><div class="hdr-in">' + top + body + '</div>' + tickerShellHTML() + '<div class="hdr-strip"></div></header>';
  }

  /* ───────── postseason ───────── */
  function roundName(r) {
    if (!r) return '';
    if (/World Series Finals/i.test(r)) return 'CWS Finals';
    if (/World Series/i.test(r)) return 'College World Series';
    if (/Super/i.test(r)) return 'Super Regionals';
    if (/Regional/i.test(r)) return 'Regionals';
    return r;
  }
  function roundShort(r) {
    if (/World Series Finals/i.test(r)) return 'CWS Finals';
    if (/World Series/i.test(r)) return 'CWS';
    if (/Super/i.test(r)) return 'Super';
    if (/Regional/i.test(r)) return 'Regional';
    return r || '';
  }
  /* Best-of-three rounds: Super Regionals and the CWS Finals. */
  function seriesFrom(games) {
    var by = {}, seen = {};
    games.forEach(function (g) {
      if (!/Super|World Series Finals/i.test(g.round || '') || seen[g.pk]) return;
      seen[g.pk] = true;
      var k = g.round + '|' + [g.away.seo, g.home.seo].sort().join('|');
      var s = by[k] || (by[k] = { round: g.round, a: [g.away.seo, g.home.seo].sort()[0], b: [g.away.seo, g.home.seo].sort()[1], aw: 0, bw: 0, need: 2, last: g.date });
      if (g.date > s.last) s.last = g.date;
      if (g.state !== 'final' || g.away.score == null || g.home.score == null) return;
      var win = g.away.score > g.home.score ? g.away.seo : g.home.seo;
      if (win === s.a) s.aw++; else s.bw++;
    });
    return Object.keys(by).map(function (k) { var s = by[k]; s.over = Math.max(s.aw, s.bw) >= s.need; return s; });
  }
  function allSeries() { var d = S.data; return seriesFrom((d.seasonGames || []).concat(d.games || [])); }
  function seriesText(s) {
    if (s.aw === s.bw) return 'Series tied ' + s.aw + '–' + s.bw;
    var lead = s.aw > s.bw ? s.a : s.b, hi = Math.max(s.aw, s.bw), lo = Math.min(s.aw, s.bw);
    return abbr(lead) + (s.over ? ' wins ' : ' leads ') + hi + '–' + lo;
  }
  function seriesFor(g) { var ids = [g.away.seo, g.home.seo]; return allSeries().filter(function (s) { return s.round === g.round && ids.indexOf(s.a) >= 0 && ids.indexOf(s.b) >= 0; })[0] || null; }

  /* ───────── ticker ───────── */
  function finalsPool() {
    var d = S.data, by = {};
    (d.seasonGames || []).concat(d.games || []).forEach(function (g) { if (g.state === 'final') by[g.pk] = g; });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(byDate);
  }
  function latestPerSeries(finals) {
    var by = {};
    finals.forEach(function (g) { var k = roundShort(g.round) + ':' + [g.away.seo, g.home.seo].sort().join('-'); if (!by[k] || g.date > by[k].date) by[k] = g; });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(byDate).reverse();
  }
  function ranked(g) { return rankOf(g.away.seo) || rankOf(g.home.seo); }
  function rankFirst(a, b) { var ra = Math.min(rankOf(a.away.seo) || 99, rankOf(a.home.seo) || 99), rb = Math.min(rankOf(b.away.seo) || 99, rankOf(b.home.seo) || 99); return ra - rb || byDate(a, b); }
  function tickerItems() {
    var d = S.data, today = todayKey(), yest = yestKey();
    var win = (d.games || []).slice().sort(byDate);
    var live = win.filter(function (g) { return g.state === 'live'; });
    var pre = win.filter(function (g) { return g.state === 'pre'; });
    var finals = finalsPool();
    var recentPost = d.phase === 'post' || d.phase === 'off' ? latestPerSeries(finals.filter(function (g) { return g.post; })).slice(0, 16) : [];
    var series = d.phase === 'off' ? [] : allSeries().filter(function (s) { return !s.over; });
    var doneSeries = d.phase === 'off' ? allSeries().filter(function (s) { return s.over && /Finals/.test(s.round); }) : [];
    var regFinals = finals.filter(function (g) { return !g.post && (g.day === today || g.day === yest); }).reverse();
    var out = [];
    function sec(title, arr) { if (!arr.length) return; out.push({ k: 'head', text: title }); arr.forEach(function (i) { out.push(i); }); }
    function L(g) { return { k: 'live', g: g }; } function N(g) { return { k: 'next', g: g }; } function F(g) { return { k: 'final', g: g }; } function SR(s) { return { k: 'series', s: s }; }
    var seo = scopeTeam(), cid = scopeConf();
    if (isD1()) {
      sec('Live', live.slice().sort(rankFirst).slice(0, 24).map(L));
      sec('Up next', pre.filter(function (g) { return d.phase === 'post' || ranked(g); }).sort(rankFirst).slice(0, 10).map(N));
      sec(series.length ? roundName(series[0].round) : 'Series', series.map(SR));
      sec('Champions', doneSeries.map(SR));
      sec('Final', recentPost.map(F).concat(regFinals.filter(ranked).sort(rankFirst).slice(0, 20).map(F)));
    } else {
      var mineLive = live.filter(involvesScope), minePre = pre.filter(function (g) { return involvesScope(g) && (g.day === today || g.post); }).slice(0, seo ? 2 : 12);
      var mineFinals;
      if (seo) {
        var tf = finals.filter(function (g) { return involves(g, seo); }).reverse();
        mineFinals = tf.filter(function (g, i) { return i < 7 || g.day === today; });
      } else mineFinals = finals.filter(function (g) { return involvesScope(g) && (g.day === today || g.day === yest || (g.post && d.phase !== 'regular')); }).reverse().slice(0, 16);
      var mine = mineLive.map(L).concat(series.filter(function (s) { return inScope(s.a) || inScope(s.b); }).map(SR)).concat(minePre.map(N)).concat(mineFinals.map(F));
      if (!mine.length) mine = [{ k: 'note', text: d.phase === 'off' ? 'Season complete' : 'No games today' }];
      sec(seo ? team(seo).school : conf(cid).name, mine);
      if (seo) {
        var cg = live.concat(pre.filter(function (g) { return g.day === today; })).filter(function (g) { return !involves(g, seo) && (confOf(g.away.seo) === cid || confOf(g.home.seo) === cid); });
        sec('Around the ' + conf(cid).name, cg.map(function (g) { return g.state === 'live' ? L(g) : N(g); }));
      }
      sec('Around D1', live.filter(function (g) { return !involvesScope(g) && ranked(g); }).sort(rankFirst).slice(0, 10).map(L)
        .concat(series.filter(function (s) { return !inScope(s.a) && !inScope(s.b); }).map(SR))
        .concat(doneSeries.map(SR))
        .concat(recentPost.filter(function (g) { return !involvesScope(g); }).slice(0, 6).map(F))
        .concat(regFinals.filter(function (g) { return !involvesScope(g) && ranked(g); }).sort(rankFirst).slice(0, 8).map(F)));
    }
    if (!out.length) out.push({ k: 'note', text: d.phase === 'off' ? 'Season complete · The next season opens in mid-February' : 'No games scheduled this week' });
    return out;
  }
  function tname(side) { return rankTag(side.seo) + esc(abbr(side.seo, side.name)); }
  function tickItemHTML(it) {
    if (it.k === 'head') return '<div class="tk-item head">' + esc(it.text) + '</div>';
    if (it.k === 'note') return '<div class="tk-item"><span class="tk-team win">' + esc(it.text) + '</span></div>';
    if (it.k === 'series') {
      var s = it.s, pips = function (w) { var h = ''; for (var i = 0; i < s.need; i++) h += '<span class="pip' + (i < w ? ' on' : '') + '"></span>'; return h; };
      return '<div class="tk-item"><span class="tk-sub">' + esc(roundShort(s.round)) + '</span><span class="tk-team win">' + rankTag(s.a) + esc(abbr(s.a)) + '</span><span class="pips" aria-label="' + s.aw + ' wins">' + pips(s.aw) + '</span>' +
        '<span class="tk-team win">' + rankTag(s.b) + esc(abbr(s.b)) + '</span><span class="pips" aria-label="' + s.bw + ' wins">' + pips(s.bw) + '</span><span class="tk-sub">' + esc(seriesText(s)) + '</span></div>';
    }
    var g = it.g;
    if (it.k === 'live') {
      var aw = g.away.score > g.home.score, hw = g.home.score > g.away.score;
      return '<div class="tk-item"><span class="tk-live">Live</span><span class="tk-team' + (aw ? ' win' : '') + '">' + tname(g.away) + ' ' + (g.away.score == null ? 0 : g.away.score) + '</span>' +
        '<span class="tk-team' + (hw ? ' win' : '') + '">' + tname(g.home) + ' ' + (g.home.score == null ? 0 : g.home.score) + '</span><span class="tk-sub">' + esc([g.inning, g.tv].filter(Boolean).join(' · ')) + '</span></div>';
    }
    if (it.k === 'final') {
      var aW = g.away.score > g.home.score;
      return '<div class="tk-item"><span class="tk-final">Final</span><span class="tk-team ' + (aW ? 'win' : 'lose') + '">' + tname(g.away) + ' ' + g.away.score + '</span><span class="tk-team ' + (aW ? 'lose' : 'win') + '">' + tname(g.home) + ' ' + g.home.score + '</span>' +
        '<span class="tk-sub">' + esc([roundShort(g.round), whenLabel(g)].filter(Boolean).join(' · ')) + '</span></div>';
    }
    return '<div class="tk-item"><span class="tk-when">' + esc(whenLabel(g) + ' ' + timeLabel(g)) + '</span><span class="tk-team win">' + tname(g.away) + ' <span class="tk-at">at</span> ' + tname(g.home) + '</span>' +
      '<span class="tk-sub">' + esc([roundShort(g.round), g.tv].filter(Boolean).join(' · ')) + '</span></div>';
  }
  function tickerItemsHTML() {
    if (!S.data) return '<div class="tk-copy"><div class="tk-item">Loading scores</div></div>';
    var inner = tickerItems().map(tickItemHTML).join('');
    return '<div class="tk-copy">' + inner + '</div><div class="tk-copy" aria-hidden="true">' + inner + '</div>';
  }
  function refreshTicker() {
    if (S.stopped) return;
    var tr = document.getElementById('tk-track'), lb = document.getElementById('tk-label');
    if (tr) tr.innerHTML = tickerItemsHTML();
    if (lb) lb.textContent = tickLabel();
  }
  function tickerSpeed() { var b = { slow: 35, normal: 55, fast: 85 }[S.settings.tickerSpeed] || 55; return isTV() ? b * 1.5 : b; }
  function tickStep(ts) {
    var tr = document.getElementById('tk-track'), view = document.getElementById('tk-view');
    var dt = TK.last == null ? 0 : Math.min(64, ts - TK.last); TK.last = ts;
    if (tr && view) {
      var first = tr.firstElementChild, second = first && first.nextElementSibling;
      var w = first ? first.offsetWidth : 0, fits = w <= view.clientWidth;
      if (second) second.hidden = fits;
      if (fits) TK.x = 0;
      else if (!S.tickPaused && !TK.hover) { TK.x -= dt * tickerSpeed() / 1000; if (w > 0 && -TK.x >= w) TK.x += w; }
      tr.style.transform = 'translateX(' + TK.x.toFixed(1) + 'px)';
    }
    TK.raf = window.requestAnimationFrame(tickStep);
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!S.stopped && isTV()) CH.fitTV(document.getElementById('app')); }); } catch (e) { /* ignore */ }
  }

  /* ───────── feature chart (block R) ───────── */
  function lineSize(tv) { return tv ? { w: 560, h: 500 } : { w: 760, h: 330 }; }
  function legendHTML(hiText, restText, extra) {
    return '<div class="legend"><span><i class="sw"></i>' + esc(hiText) + '</span>' + (extra || '') + (restText ? '<span><i class="sw gray"></i>' + esc(restText) + '</span>' : '') + '</div>';
  }
  function shortDay(day) { return new Date(day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function monthLabel(day) { return new Date(day + 'T12:00:00').toLocaleString('en-US', { month: 'short' }); }
  /* Week ends (Sundays) from the first game to the last → [{ end, label }] */
  function weeks() {
    var d = S.data; if (d._weeks) return d._weeks;
    var gs = d.seasonGames.filter(function (g) { return g.state === 'final'; });
    if (!gs.length) return (d._weeks = []);
    var first = gs[0].day, last = gs[gs.length - 1].day, out = [], dt = new Date(first + 'T12:00:00');
    while (dt.getDay() !== 0) dt.setDate(dt.getDate() + 1);
    var lastM = null;
    for (var k = dayKey(dt); k < last; k = API.addDays(k, 7)) { var m = k.slice(5, 7); out.push({ end: k, label: m !== lastM ? monthLabel(k) : '', tip: shortDay(k) }); lastM = m; }
    out.push({ end: last, label: last.slice(5, 7) !== lastM ? monthLabel(last) : (d.phase === 'off' ? 'End' : 'Now'), tip: shortDay(last) });
    return (d._weeks = out);
  }
  function months() {
    var d = S.data; if (d._months) return d._months;
    var gs = d.seasonGames.filter(function (g) { return g.state === 'final'; }), seen = {}, out = [];
    gs.forEach(function (g) { var m = g.day.slice(0, 7); if (!seen[m]) { seen[m] = true; out.push({ key: m, label: monthLabel(g.day) }); } });
    return (d._months = out);
  }
  function logOf(seo) { var r = S.data.recs[seo]; return r ? r.log : []; }
  function cumAt(seo, day) {
    var c = { w: 0, l: 0, cw: 0, cl: 0, n1: 0 };
    logOf(seo).forEach(function (g) { if (g.d > day) return; if (g.win) c.w++; else c.l++; if (g.conf) { if (g.win) c.cw++; else c.cl++; } if (Math.abs(g.margin) === 1) c.n1 += g.win ? 1 : -1; });
    return c;
  }
  function chartGuard() {
    var d = S.data;
    if (d.partial) return msgSnapshot();
    if (!d.seasonGames || !d.recs) return msgCrawl();
    if (!weeks().length) return '<div class="empty"><strong>No games yet</strong>Charts fill in once the season starts.</div>';
    return null;
  }
  /* Who's on the chart: the selected team and its conference's top clubs; on the D1 page the top of the poll. */
  function confFocus() {
    if (scopeConf()) return scopeConf();
    var top = topSeos(1)[0]; return top ? confOf(top) : 'sec';
  }
  function chartIds(byConf) {
    var seo = scopeTeam(), cid = scopeConf();
    if (isD1() && !byConf) { var t = topSeos(6); return { ids: t, hi: t[0], rest: 'Next five in the poll', hiText: t[0] ? 'No. 1 ' + nick(t[0]) : '' }; }
    cid = cid || confFocus();
    var st = confStandings(cid).map(function (r) { return r.seo; }), ids = st.slice(0, 6);
    if (seo && ids.indexOf(seo) < 0) ids = ids.slice(0, 5).concat([seo]);
    var hi = seo || ids[0];
    return { ids: ids, hi: hi, rest: conf(cid).name + ' contenders', hiText: nick(hi) + (seo ? '' : ' · conference leader'), cid: cid };
  }
  function raceChart(mode, tv) {
    var g = chartGuard(); if (g) return g;
    var W = weeks(), size = lineSize(tv), labels = W.map(function (w) { return w.label; });
    if (mode === 'monthly') {
      var P = chartIds(false), M = months();
      var series = P.ids.map(function (seo) { return { label: abbr(seo), hi: seo === P.hi, vals: M.map(function (m) { var w = 0, l = 0; logOf(seo).forEach(function (x) { if (x.d.slice(0, 7) === m.key) { if (x.win) w++; else l++; } }); return w + l ? w / (w + l) : null; }) }; });
      return CH.lines({ labels: M.map(function (m) { return m.label; }), series: series, fmt: rate3, zero: 0.5, w: size.w, h: size.h, aria: 'Winning percentage in each month' }) + (tv ? '' : legendHTML(P.hiText, P.rest));
    }
    if (mode === 'cgb' || mode === 'crank') {
      var Q = chartIds(true), all = confTeams(Q.cid);
      var snaps = W.map(function (w) {
        var rows = all.map(function (seo) { var c = cumAt(seo, w.end); return { seo: seo, cw: c.cw, cl: c.cl, p: c.cw + c.cl ? c.cw / (c.cw + c.cl) : null }; });
        if (!rows.some(function (r) { return r.cw + r.cl; })) return null;
        rows.sort(function (a, b) { return (b.p == null ? -1 : b.p) - (a.p == null ? -1 : a.p) || b.cw - a.cw; });
        var L = rows[0], out = {};
        rows.forEach(function (r, i) { out[r.seo] = { gb: ((L.cw - r.cw) + (r.cl - L.cl)) / 2, rank: i + 1, played: r.cw + r.cl }; });
        return out;
      });
      var start = snaps.findIndex(function (s) { return s; });
      if (start < 0) return '<div class="empty"><strong>No conference games yet</strong>This chart starts with the first conference series.</div>';
      var lab2 = labels.slice(start); if (!lab2[0]) lab2[0] = monthLabel(W[start].end);
      var ser = Q.ids.map(function (seo) { return { label: abbr(seo), hi: seo === Q.hi, vals: snaps.slice(start).map(function (s) { return s && s[seo] && s[seo].played ? (mode === 'cgb' ? s[seo].gb : s[seo].rank) : null; }) }; });
      var opts = mode === 'cgb' ? { fmt: function (v) { return v === 0 ? 'Lead' : halfText(v); }, invert: true, min: 0, zero: 0 } : { fmt: function (v) { return ord(v); }, invert: true, min: 1, max: all.length, step: Math.max(1, Math.ceil(all.length / 6)) };
      opts.labels = lab2; opts.tipLabels = W.slice(start).map(function (w) { return w.tip; }); opts.series = ser; opts.w = size.w; opts.h = size.h; opts.aria = mode === 'cgb' ? 'Conference games back by week' : 'Conference standing by week';
      return CH.lines(opts) + (tv ? '' : legendHTML(Q.hiText, Q.rest + ' · conference games only'));
    }
    var R = chartIds(false);
    if (!R.ids.length) return msgNoData('the Top 25');
    var series2 = R.ids.map(function (seo) {
      return { label: abbr(seo), hi: seo === R.hi, vals: W.map(function (w) { var c = cumAt(seo, w.end); if (!c.w && !c.l) return null; return mode === 'gap' ? c.w - c.l : c.w / (c.w + c.l); }) };
    });
    var o = mode === 'gap' ? { fmt: function (v) { return v === 0 ? '.500' : signed(v); }, zero: 0, ints: true } : { fmt: rate3, zero: 0.5 };
    o.labels = labels; o.tipLabels = W.map(function (w) { return w.tip; }); o.series = series2; o.w = size.w; o.h = size.h; o.aria = mode === 'gap' ? 'Games above .500 by week' : 'Winning percentage by week';
    return CH.lines(o) + (tv ? '' : legendHTML(R.hiText, R.rest));
  }
  function focusTeam() { return scopeTeam() || (isD1() ? topSeos(1)[0] : (confStandings(scopeConfOnly())[0] || {}).seo); }
  function focusText(seo) { return nick(seo) + (scopeTeam() ? '' : (isD1() ? ' · No. 1 in the poll' : ' · conference leader')); }
  function rdiffChart(tv) {
    var g = chartGuard(); if (g) return g;
    var seo = focusTeam(); if (!seo) return msgNoData('the Top 25');
    var M = months(), size = lineSize(tv), log = logOf(seo);
    function per(m, k) { var t = 0, n = 0; log.forEach(function (x) { if (x.d.slice(0, 7) === m.key) { t += x[k]; n++; } }); return n ? t / n : null; }
    var avg = M.map(function (m) { var t = 0, n = 0; Object.keys(S.data.recs).forEach(function (s) { S.data.recs[s].log.forEach(function (x) { if (x.d.slice(0, 7) === m.key) { t += x.rs; n++; } }); }); return n ? t / n : null; });
    var series = [{ label: 'Scored', hi: true, vals: M.map(function (m) { return per(m, 'rs'); }) }, { label: 'Allowed', hi: true, dash: true, vals: M.map(function (m) { return per(m, 'ra'); }) }, { label: 'D1 avg', ref: true, vals: avg }];
    return CH.lines({ labels: M.map(function (m) { return m.label; }), series: series, fmt: function (v) { return v.toFixed(1); }, w: size.w, h: size.h, aria: 'Runs scored and allowed per game by month' }) +
      (tv ? '' : legendHTML(focusText(seo) + ' · runs scored per game', '', '<span><i class="sw dash"></i>Runs allowed per game</span><span><i class="sw ref"></i>D1 average</span>'));
  }
  function seasonBars(tv) {
    var g = chartGuard(); if (g) return g;
    var seo = focusTeam(); if (!seo) return msgNoData('the Top 25');
    var log = logOf(seo), ticks = [], lastM = null;
    log.forEach(function (x, i) { var m = x.d.slice(5, 7); if (m !== lastM) { lastM = m; ticks.push({ i: i, label: monthLabel(x.d) }); } });
    var size = tv ? { w: 560, h: 480 } : { w: 760, h: 300 };
    var bars = log.map(function (x) { return { win: x.win, margin: x.margin, tip: x.d + ' · ' + (x.home ? 'vs ' : 'at ') + abbr(x.opp) + ' · ' + (x.win ? 'W ' : 'L ') + Math.max(x.rs, x.ra) + '–' + Math.min(x.rs, x.ra) + (x.post ? ' · NCAA Tournament' : '') }; });
    var w = log.filter(function (x) { return x.win; }).length;
    return CH.gameBars({ games: bars, ticks: ticks, w: size.w, h: size.h, aria: nick(seo) + ' game-by-game results' }) +
      (tv ? '' : '<div class="legend"><span><i class="sw sq"></i>' + esc(focusText(seo) + ' · wins · ' + w + '–' + (log.length - w)) + '</span><span><i class="sw sq gray"></i>Losses</span></div>');
  }
  function formChart(tv) {
    var g = chartGuard(); if (g) return g;
    var seo = focusTeam(); if (!seo) return msgNoData('the Top 25');
    var log = logOf(seo), labels = [], lastM = null;
    var vals = log.map(function (x, i) {
      var m = x.d.slice(5, 7); labels.push(m !== lastM ? monthLabel(x.d) : ''); lastM = m;
      if (i < 9) return null; var w = 0; for (var k = i - 9; k <= i; k++) if (log[k].win) w++; return w / 10;
    });
    var size = lineSize(tv);
    return CH.lines({ labels: labels, series: [{ label: abbr(seo), hi: true, vals: vals }], fmt: rate3, zero: 0.5, min: 0, max: 1, step: 0.2, w: size.w, h: size.h, aria: 'Rolling 10-game form' }) +
      (tv ? '' : legendHTML(focusText(seo) + ' · each point covers the previous 10 games'));
  }
  function homeAway(tv) {
    var g = chartGuard(); if (g) return g;
    var M = months(), size = lineSize(tv), series;
    function pct(list) { var w = 0, n = 0; list.forEach(function (x) { n++; if (x) w++; }); return n ? w / n : null; }
    if (isD1()) {
      series = [{ label: 'Home teams', hi: true, vals: M.map(function (m) { return pct(S.data.seasonGames.filter(function (x) { return x.state === 'final' && !x.post && x.day.slice(0, 7) === m.key && C.TEAM_BY_SEO[x.home.seo] && C.TEAM_BY_SEO[x.away.seo]; }).map(function (x) { return x.home.score > x.away.score; })); }) }];
      return CH.lines({ labels: M.map(function (m) { return m.label; }), series: series, fmt: rate3, zero: 0.5, w: size.w, h: size.h, aria: 'Home teams’ winning percentage by month' }) + (tv ? '' : legendHTML('Home teams across D1 · games between D1 clubs'));
    }
    var seo = focusTeam(), log = logOf(seo);
    series = [
      { label: 'Home', hi: true, vals: M.map(function (m) { return pct(log.filter(function (x) { return x.home && x.d.slice(0, 7) === m.key; }).map(function (x) { return x.win; })); }) },
      { label: 'Road', hi: true, dash: true, vals: M.map(function (m) { return pct(log.filter(function (x) { return !x.home && x.d.slice(0, 7) === m.key; }).map(function (x) { return x.win; })); }) }
    ];
    return CH.lines({ labels: M.map(function (m) { return m.label; }), series: series, fmt: rate3, zero: 0.5, w: size.w, h: size.h, aria: 'Home and road winning percentage by month' }) +
      (tv ? '' : legendHTML(focusText(seo) + ' at home', '', '<span><i class="sw dash"></i>On the road (and neutral sites)</span>'));
  }
  function oneRun(tv) {
    var g = chartGuard(); if (g) return g;
    var P = chartIds(false), W = weeks(), size = lineSize(tv);
    var series = P.ids.map(function (seo) {
      var l1 = logOf(seo).filter(function (x) { return Math.abs(x.margin) === 1; }), w = l1.filter(function (x) { return x.win; }).length;
      return { label: abbr(seo), endLabel: abbr(seo) + ' ' + w + '–' + (l1.length - w), hi: seo === P.hi, vals: W.map(function (wk) { return cumAt(seo, wk.end).n1; }) };
    });
    return CH.lines({ labels: W.map(function (w) { return w.label; }), tipLabels: W.map(function (w) { return w.tip; }), series: series, fmt: function (v) { return v === 0 ? '.500' : signed(v); }, zero: 0, ints: true, w: size.w, h: size.h, aria: 'One-run games' }) + (tv ? '' : legendHTML(P.hiText, P.rest));
  }
  var FEATURE_META = {
    gap: ['Race to Omaha', 'Games above .500 · end of each week'],
    pct: ['Race to Omaha', 'Winning percentage · end of each week'],
    cgb: ['Race to Omaha', 'Conference games back · end of each week'],
    crank: ['Race to Omaha', 'Conference standing · end of each week'],
    monthly: ['Race to Omaha', 'Winning percentage in each month on its own'],
    rdiff: ['Runs scored vs. allowed', 'Per game, in each month'],
    season: ['Season in one picture', 'Every game · bar height = run margin'],
    form10: ['Rolling 10-game form', 'Winning percentage over the previous 10 games'],
    homeaway: ['Home vs. road', 'Winning percentage in each month'],
    onerun: ['One-run games', 'Games above .500 in one-run games · running total']
  };
  var BUILDERS = {
    gap: function (tv) { return raceChart('gap', tv); }, pct: function (tv) { return raceChart('pct', tv); }, cgb: function (tv) { return raceChart('cgb', tv); },
    crank: function (tv) { return raceChart('crank', tv); }, monthly: function (tv) { return raceChart('monthly', tv); },
    rdiff: rdiffChart, season: seasonBars, form10: formChart, homeaway: homeAway, onerun: oneRun
  };
  function featureChart(tv) {
    var mode = S.cs.blocks.race; if (mode === 'hide' || !S.data) return null;
    var meta = FEATURE_META[mode] || FEATURE_META.gap;
    return { title: meta[0], sub: meta[1], body: (BUILDERS[mode] || BUILDERS.gap)(tv) || msgNoData(meta[0]) };
  }

  /* ───────── standings, leaders, clubs, upcoming ───────── */
  function stRow(seo, cols, me) {
    var t = team(seo) || { primary: '#888', school: seo };
    return '<div class="st-row cs' + (me ? ' me' : '') + '"><span class="st-name"><i style="background:' + t.primary + '"></i>' + esc(t.school) + '</span>' + cols.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>';
  }
  function standingsCardHTML(tv) {
    if (S.cs.blocks.standings === 'hide' || !S.data) return null;
    var d = S.data;
    if (isD1()) {
      var rk = d.rankings;
      if (!rk || !rk.rows.length) return { title: 'Top 25', body: isLive() ? msgNoData('the Top 25') : msgSnapshot() };
      var rows = rk.rows.slice(0, tv ? 8 : 25).map(function (r) {
        var prev = parseInt(r.prev, 10), mv = isNaN(prev) ? 'New' : (prev === r.rank ? '—' : (prev > r.rank ? '▲' + (prev - r.rank) : '▼' + (r.rank - prev)));
        var t = team(r.seo);
        return '<div class="st-row rk-row"><span class="st-rk">' + r.rank + '</span><span class="st-name"><i style="background:' + (t ? t.primary : '#888') + '"></i>' + esc(t ? t.school : r.name) + '</span><span>' + esc(r.record) + '</span><span class="st-mv">' + esc(mv) + '</span></div>';
      }).join('');
      return { title: rk.title.replace(/\.com/, ''), sub: rk.updated, body: '<div class="st-scroll"><div class="st-row rk-row head"><span>#</span><span>Team</span><span>W–L</span><span>Move</span></div>' + rows + '</div>' };
    }
    var cid = scopeConf(), cs = confStandings(cid), noConf = d.partial || !d.recs;
    if (tv && cs.length > 8) {   // the TV stack shows the top eight, plus the selected team if it's lower
      var mine = cs.filter(function (r) { return r.seo === scopeTeam(); })[0], top = cs.slice(0, 8);
      if (mine && top.indexOf(mine) < 0) top = cs.slice(0, 7).concat([mine]);
      cs = top;
    }
    var list = cs.map(function (r) { return stRow(r.seo, [r.cw != null && (r.cw + r.cl) ? wl(r.cw, r.cl) : '—', wl(r.w, r.l, r.t)], r.seo === scopeTeam()); });
    var head = '<div class="st-row cs head"><span>Team</span><span>Conf</span><span>Overall</span></div>';
    var note = noConf ? '<div class="lb-note">' + (d.partial ? 'Conference records are available with live data. Sorted by overall record.' : 'Conference records appear once the season’s results finish loading.') + '</div>' : '';
    return { title: conf(cid).full, body: '<div class="st-scroll">' + head + list.join('') + '</div>' + note };
  }
  function leaderBodyHTML(statKey, kind, max) {
    var st = leaderState(statKey), s = C.STAT_BY_KEY[statKey];
    if (st.loading) return msgLoading('leaders');
    if (st.missing) return msgSnapshot();
    if (st.error) return msgNoData(s ? s.name + ' leaders' : 'this board');
    var rows = st.rows.slice(0, max || S.settings.limit);
    var who = scopeTeam() ? team(scopeTeam()).school : (scopeConfOnly() ? conf(scopeConfOnly()).name : 'D1');
    if (!rows.length) return '<div class="empty"><strong>No ranked players</strong>No ' + esc(who) + ' players are in the NCAA’s national list for this stat (top ' + (st.listSize || 'ranked') + ' qualified players).</div>';
    var shares = CH.shares(rows), counts = {};
    rows.forEach(function (r) { counts[r.rank] = (counts[r.rank] || 0) + 1; });
    function rk(r) { return (counts[r.rank] > 1 ? 'T' : '') + r.rank; }
    var html;
    if (kind === 'feat') {
      html = '<div class="lb">' + rows.map(function (r, i) {
        return '<div class="lrow' + (i === 0 ? ' top' : '') + '"><span class="lrank">' + rk(r) + '</span><span class="lname"><span class="lbar" style="width:calc((100% + var(--slant)) * ' + shares[i].toFixed(3) + ')"></span><b>' + esc(r.name) + '</b><em>' + esc(r.seo ? abbr(r.seo) : r.teamName) + '</em></span><span class="lval">' + esc(r.value) + '</span></div>';
      }).join('') + '</div>';
    } else {
      html = '<div class="bd-list">' + rows.map(function (r, i) {
        return '<div class="brow' + (i === 0 ? ' top' : '') + '"><div class="brow-top"><span title="' + esc(r.name + ' · ' + (r.seo ? team(r.seo).school : r.teamName)) + '">' + esc(rk(r) + ' ' + shortName(r.name)) + '</span><span>' + esc(r.value) + '</span></div><div class="btrack"><div class="bfill" style="width:' + Math.round(shares[i] * 100) + '%"></div></div></div>';
      }).join('') + '</div>';
    }
    return html + (st.national ? '' : '<div class="lb-note">Ranked among players in the NCAA’s national list (qualified players only)</div>');
  }
  function clubsCardHTML() {
    var key = S.cs.blocks.clubs; if (!key || key === 'hide' || !S.data) return null;
    var m = C.METRIC_BY_KEY[key]; if (!m) return null;
    var d = S.data, ids, on, legend, avgName;
    if (isD1()) {
      ids = topSeos(25);
      var omaha = {}; (d.seasonGames || []).forEach(function (g) { if (/World Series/.test(g.round)) { omaha[g.away.seo] = 1; omaha[g.home.seo] = 1; } });
      on = Object.keys(omaha).length ? Object.keys(omaha) : ids.slice(0, 8);
      legend = Object.keys(omaha).length ? 'Reached Omaha' : 'Top 8 in the poll'; avgName = 'Top 25 avg';
    } else {
      var cid = scopeConf(); ids = confTeams(cid); avgName = conf(cid).name + ' avg';
      if (scopeTeam()) { on = [scopeTeam()]; legend = team(scopeTeam()).school; } else { var lead = (confStandings(cid)[0] || {}).seo; on = lead ? [lead] : []; legend = 'Conference leader'; }
    }
    var state = null;
    var items = ids.map(function (seo) {
      var x = metric(seo, key); if (x.loading || x.missing) state = state || x;
      return { id: seo, abbr: abbr(seo), name: nick(seo), value: x.v != null && !isNaN(x.v) ? x.v : null, text: x.text || '—', on: on.indexOf(seo) >= 0 };
    });
    var vals = items.filter(function (i) { return i.value != null; });
    var mean = vals.length ? vals.reduce(function (a, i) { return a + i.value; }, 0) / vals.length : 0;
    var avgText = m.fmt === 'signed' ? signed(Math.round(mean)) : (m.fmt === 'rate3' || m.fmt === 'record' || m.fmt === 'conf' || m.fmt === 'home' || m.fmt === 'away' ? rate3(mean) : String(Math.round(mean * 100) / 100));
    var html = vals.length ? CH.clubs({ items: items, low: m.low, label: m.label, avgText: avgText, avgName: avgName, scopeName: isD1() ? 'the Top 25' : conf(scopeConf()).name + ' clubs' }) : '';
    var body = html || (state && state.loading ? msgLoading(m.label) : (state && state.missing ? msgSnapshot() : (d.partial && m.games ? msgSnapshot() : msgNoData(m.label))));
    return { title: m.label + ' · ' + (isD1() ? 'Top 25' : conf(scopeConf()).name), sub: m.low ? 'Above the line = better than average (lower is better)' : 'Above the line = better than the ' + avgName.replace(/ avg$/, '') + ' average', legend: legend, body: body };
  }
  function upcoming(n) {
    var d = S.data, all = (d.games || []).filter(function (g) { return (g.state === 'pre' || g.state === 'live') && involvesScope(g); }).sort(byDate);
    if (isD1() && d.phase !== 'post') {
      var live = all.filter(function (g) { return g.state === 'live'; }), pre = all.filter(function (g) { return g.state === 'pre'; });
      all = live.sort(rankFirst).concat(pre.filter(ranked).concat(pre.filter(function (g) { return !ranked(g); })));
    }
    return all.slice(0, n);
  }
  function gameCardHTML(g) {
    var cls = g.state === 'live' ? ' live' : (whenLabel(g) === 'Today' ? ' today' : '');
    var s = seriesFor(g);
    var hd = g.state === 'live' ? 'Live · ' + esc(g.inning || 'In progress') : esc(whenLabel(g) + ' · ' + timeLabel(g));
    var match = g.state === 'live' ? tname(g.away) + ' ' + g.away.score + ' <span class="at">·</span> ' + tname(g.home) + ' ' + g.home.score : tname(g.away) + ' <span class="at">at</span> ' + tname(g.home);
    var line = [roundName(g.round), s ? seriesText(s) : ''].filter(Boolean).join(' · ');
    var sub = [team(g.away.seo) ? team(g.away.seo).school : g.away.name, team(g.home.seo) ? team(g.home.seo).school : g.home.name].join(' at ');
    return '<div class="game' + cls + '"><div class="game-hd"><span>' + hd + '</span><span>' + esc(g.tv) + '</span></div><div class="game-bd"><div class="game-m">' + match + '</div>' +
      (line ? '<div class="game-s">' + esc(line) + '</div>' : '') + '<div class="game-p">' + esc(sub) + '</div></div></div>';
  }
  function noGamesHTML() {
    var d = S.data;
    if (d.phase === 'off') {
      var seo = scopeTeam(), r = seo && d.records[seo];
      return '<div class="card empty"><strong>Season complete</strong>' + (r ? esc(team(seo).school) + ' finished ' + wl(r.w, r.l, r.t) + '. ' : '') + 'The next season opens in mid-February.</div>';
    }
    return '<div class="card empty"><strong>No games this week</strong>Check back when the schedule resumes.</div>';
  }

  function dashMainHTML() {
    if (!S.data) return '<div class="card loading">Loading the NCAA API</div>';
    var b = S.cs.blocks, out = [];
    var fc = featureChart(false), std = standingsCardHTML(false);
    if (fc || std) {
      out.push('<div class="row">' +
        (fc ? '<section class="card race" aria-label="' + esc(fc.title) + '"><div class="card-hd"><h2>' + esc(fc.title) + '</h2><span class="sub">' + esc(fc.sub) + '</span></div><div class="chart-body">' + fc.body + '</div></section>' : '') +
        (std ? '<section class="card standings" aria-label="Standings"><div class="card-hd"><h2>' + esc(std.title) + '</h2>' + (std.sub ? '<span class="sub">' + esc(std.sub) + '</span>' : '') + '</div>' + std.body + '</section>' : '') + '</div>');
    }
    var feats = ['feat1', 'feat2'].filter(function (k) { return b[k] && b[k] !== 'hide' && C.STAT_BY_KEY[b[k]]; });
    if (feats.length) {
      out.push('<section class="feat" aria-label="Featured leaders">' + feats.map(function (k) {
        var s = C.STAT_BY_KEY[b[k]];
        return '<article class="card"><div class="card-hd"><h2>' + esc(s.short) + ' leaders</h2><span class="sub">' + esc(s.name) + '</span></div>' + leaderBodyHTML(b[k], 'feat') + '</article>';
      }).join('') + '</section>');
    }
    var boards = ['board1', 'board2', 'board3', 'board4', 'board5', 'board6'].filter(function (k) { return b[k] && b[k] !== 'hide' && C.STAT_BY_KEY[b[k]]; });
    if (boards.length) {
      out.push('<section class="boards" aria-label="Leaderboards">' + boards.map(function (k) {
        var s = C.STAT_BY_KEY[b[k]];
        return '<article class="card"><div class="bd-hd"><h3>' + esc(s.short) + '</h3><span>' + esc(s.name) + '</span></div>' + leaderBodyHTML(b[k], 'board') + '</article>';
      }).join('') + '</section>');
    }
    var clubs = clubsCardHTML();
    if (clubs) {
      out.push('<section class="card" aria-label="Clubs chart"><div class="card-hd"><h2>' + esc(clubs.title) + '</h2><span class="sub"><span class="legend" style="margin:0;color:inherit;font-size:inherit"><span><i class="sw sq"></i>' + esc(clubs.legend) + '</span></span></span></div>' +
        '<div class="clubs-scroll">' + clubs.body + '</div><div class="empty" style="padding-top:0">' + esc(clubs.sub) + '</div></section>');
    }
    if (b.upnext !== 'hide') {
      var up = upcoming(6);
      out.push('<section aria-label="Coming up" style="display:flex;flex-direction:column;gap:10px"><h2 class="sec-title">Coming up</h2>' + (up.length ? '<div class="games">' + up.map(gameCardHTML).join('') + '</div>' : noGamesHTML()) + '</section>');
    }
    out.push(footHTML());
    return out.join('');
  }
  function footHTML() {
    var d = S.data;
    var src = d && d.source === 'snapshot' ? 'Snapshot of NCAA API data (final 2026 season) · live data could not be reached here'
      : 'Data: NCAA API (ncaa.com) · Poll: D1Baseball.com Top 25 · stats refresh daily at 5 AM' + (d && d.statsUpdated ? ' · NCAA stats ' + d.statsUpdated.replace(/^.* - /, '').toLowerCase() : '');
    return '<footer class="foot"><span>' + esc(src) + '</span><span>Times shown in your time zone</span></footer>';
  }

  /* ───────── TV layout ───────── */
  function tvBoards() { var b = S.cs.blocks; return ['feat1', 'feat2', 'board1', 'board2', 'board3', 'board4', 'board5', 'board6'].filter(function (k) { return b[k] && b[k] !== 'hide' && C.STAT_BY_KEY[b[k]]; }); }
  function tvCharts() { var c = []; if (S.cs.blocks.race !== 'hide') c.push('race'); if (S.cs.blocks.clubs && S.cs.blocks.clubs !== 'hide') c.push('clubs'); return c; }
  function progressHTML(n, i) { if (n < 2) return ''; var h = '<div class="tv-progress" aria-hidden="true">'; for (var k = 0; k < n; k++) h += '<i class="' + (k === i ? 'on' : '') + '"></i>'; return h + '</div>'; }
  function tvChartPanelHTML() {
    var list = tvCharts(); if (!list.length) return '';
    var which = list[S.tv.chart % list.length];
    if (which === 'race') { var r = featureChart(true); return '<div class="card-hd"><h2>' + esc(r.title) + '</h2><span class="sub">' + esc(r.sub) + '</span></div><div class="tv-fill fade-in">' + r.body + '</div>' + progressHTML(list.length, S.tv.chart % list.length); }
    var c = clubsCardHTML();
    return '<div class="card-hd"><h2>' + esc(c.title) + '</h2><span class="sub">' + esc(c.legend) + ' highlighted</span></div><div class="tv-fill fade-in">' + c.body + '</div>' + progressHTML(list.length, S.tv.chart % list.length);
  }
  function tvBoardPanelHTML() {
    var list = tvBoards(); if (!list.length || !S.data) return '';
    var k = list[S.tv.board % list.length], s = C.STAT_BY_KEY[S.cs.blocks[k]];
    return '<div class="card-hd"><h2>' + esc(s.short) + ' leaders</h2><span class="sub">' + esc(s.name) + '</span></div><div class="tv-fill fade-in" style="padding:0">' + leaderBodyHTML(s.key, 'feat', Math.min(8, S.settings.limit)) + '</div>' + progressHTML(list.length, S.tv.board % list.length);
  }
  function tvGamesHTML() {
    var up = upcoming(5);
    if (!up.length) return '<div class="empty"><strong>' + (S.data.phase === 'off' ? 'Season complete' : 'No games this week') + '</strong></div>';
    return '<div class="tv-games">' + up.map(function (g) {
      var s = seriesFor(g);
      var when = g.state === 'live' ? '<b>Live</b>' + esc(g.inning) : '<b>' + esc(whenLabel(g)) + '</b>' + esc(timeLabel(g));
      var m = g.state === 'live' ? tname(g.away) + ' ' + g.away.score + ' · ' + tname(g.home) + ' ' + g.home.score : tname(g.away) + ' at ' + tname(g.home);
      return '<div class="tv-game"><div class="when">' + when + '</div><div><div class="m">' + m + '</div><div class="s">' + esc([roundShort(g.round), s ? seriesText(s) : '', g.tv].filter(Boolean).join(' · ')) + '</div></div></div>';
    }).join('') + '</div>';
  }
  function tvStackHTML() {
    var std = standingsCardHTML(true);
    return (std ? '<section class="tv-panel" aria-label="Standings"><div class="card-hd"><h2>' + esc(std.title) + '</h2></div>' + std.body + '</section>' : '') +
      (S.cs.blocks.upnext !== 'hide' ? '<section class="tv-panel" aria-label="Coming up"><div class="card-hd"><h2>Coming up</h2></div>' + tvGamesHTML() + '</section>' : '');
  }
  function tvMainHTML() {
    if (!S.data) return '<div class="tv-main"><div class="tv-panel loading">Loading the NCAA API</div></div>';
    return '<div class="tv-main"><section class="tv-panel" id="tv-chart" aria-label="Charts">' + tvChartPanelHTML() + '</section>' +
      '<section class="tv-panel" id="tv-board" aria-label="Leaders">' + tvBoardPanelHTML() + '</section><div class="tv-stack" id="tv-stack">' + tvStackHTML() + '</div></div>' +
      '<div class="tv-gear" id="tv-gear"><button type="button" data-act="fullscreen">Full screen</button><button type="button" data-act="open-settings">Settings</button><button type="button" data-act="exit-tv">Exit TV mode</button></div>';
  }
  function tvTick() {
    S.tv.board++; if (S.tv.board % 2 === 0) S.tv.chart++;
    var a = document.getElementById('tv-board'), c = document.getElementById('tv-chart');
    if (a) a.innerHTML = tvBoardPanelHTML();
    if (c && S.tv.board % 2 === 0) c.innerHTML = tvChartPanelHTML();
    CH.fitTV(document.getElementById('app'));
  }
  function startTV() { clearInterval(S.tv.timer); if (!isTV()) { releaseWake(); return; } S.tv.timer = setInterval(tvTick, Math.max(5, S.settings.tvRotate) * 1000); requestWake(); }
  function requestWake() {
    if (S.wake || !navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request('screen').then(function (l) { S.wake = l; if (l.addEventListener) l.addEventListener('release', function () { S.wake = null; }); }).catch(function () { /* not granted */ });
  }
  function releaseWake() { if (S.wake) { try { S.wake.release(); } catch (e) { /* ignore */ } S.wake = null; } }
  var idleTimer = null;
  function pokeIdle() {
    var root = document.documentElement, gear = document.getElementById('tv-gear');
    root.classList.remove('idle'); if (gear) gear.classList.add('show');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (isTV()) root.classList.add('idle'); var g2 = document.getElementById('tv-gear'); if (g2 && !g2.contains(document.activeElement)) g2.classList.remove('show'); }, 3000);
  }

  /* ───────── settings page ───────── */
  function segHTML(key, current, options) {
    return '<div class="seg" role="group">' + options.map(function (o) {
      return '<button type="button" data-act="seg" data-key="' + key + '" data-val="' + esc(o[0]) + '" aria-pressed="' + (String(current) === String(o[0])) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function statOptions(current) {
    var h = '<option value="hide"' + (current === 'hide' ? ' selected' : '') + '>Hide this block</option>';
    C.STAT_GROUPS.forEach(function (g) {
      h += '<optgroup label="' + g.label + '">' + C.STATS.filter(function (s) { return s.group === g.id; }).map(function (s) {
        return '<option value="' + s.key + '"' + (s.key === current ? ' selected' : '') + '>' + esc(s.short + ' · ' + s.name) + '</option>';
      }).join('') + '</optgroup>';
    });
    return h;
  }
  function metricOptions(current, numericOnly) {
    var h = '<option value="hide"' + (current === 'hide' ? ' selected' : '') + '>Hide this block</option>';
    C.METRIC_GROUPS.forEach(function (g) {
      var list = C.TEAM_METRICS.filter(function (m) { return (m.grp || m.src) === g.src && (!numericOnly || ['record', 'streak', 'l10', 'home', 'away', 'conf'].indexOf(m.fmt) < 0 || m.id === 'record'); });
      h += '<optgroup label="' + g.label + '">' + list.map(function (m) { return '<option value="' + m.key + '"' + (m.key === current ? ' selected' : '') + '>' + esc(m.label + ' (' + m.short + ')') + '</option>'; }).join('') + '</optgroup>';
    });
    return h;
  }
  function featureOptions(current) {
    return C.FEATURE_GROUPS.map(function (g) {
      return '<optgroup label="' + esc(g.label) + '">' + g.options.map(function (o) { return '<option value="' + o[0] + '"' + (current === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</optgroup>';
    }).join('') + '<option value="hide"' + (current === 'hide' ? ' selected' : '') + '>Hide this block</option>';
  }
  function pickerHTML(code, id, label, optionsHTML, extra) {
    return '<div class="pkr"><label for="pk-' + id + '"><span class="code">' + code + '</span>' + esc(label) + '</label><select class="set-select" id="pk-' + id + '" data-set="blocks.' + id + '" data-code="' + code + '">' + optionsHTML + '</select>' + (extra || '') + '</div>';
  }
  function showHide(v) { return [['show', 'Show'], ['hide', 'Hide this block']].map(function (o) { return '<option value="' + o[0] + '"' + (v === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
  function settingsHTML() {
    var s = S.settings, cs = S.cs, b = cs.blocks;
    function sel(id, key, opts) { return '<select class="set-select" id="' + id + '" data-set="' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(s[key]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
    var def = cs.defaultScope;
    var defOpts = '<option value="D1"' + (def === 'D1' ? ' selected' : '') + '>All D1</option>' + C.CONFS.map(function (c) {
      return '<optgroup label="' + esc(c.name) + '"><option value="c:' + c.id + '"' + (def === 'c:' + c.id ? ' selected' : '') + '>' + esc(c.name) + ' (whole conference)</option>' +
        C.TEAMS.filter(function (t) { return t.conf === c.id; }).sort(function (a, z) { return a.school < z.school ? -1 : 1; }).map(function (t) { return '<option value="' + t.seo + '"' + (def === t.seo ? ' selected' : '') + '>' + esc(t.school) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    var snapshot = isSnap();
    var apiNote = snapshot && S.loadError
      ? '<span class="hint" style="color:var(--live)">Couldn’t reach ' + esc(API.base()) + ' (' + esc(S.loadError) + '). The board is showing the saved snapshot. A hosted board needs the relay in worker/ncaa-relay.js; the README walks through it.</span>'
      : '<span class="hint">Leave empty to use the public NCAA API. Browsers block it from other sites, so a hosted board needs your relay’s address here (see worker/ncaa-relay.js in the README).</span>';
    var map = '<div class="map" aria-hidden="true">' +
      '<div class="hdrblk span2">Header</div><div class="hdrblk span1" data-map="T1">T1</div><div class="hdrblk span1" data-map="T2">T2</div><div class="hdrblk span1" data-map="T3">T3</div><div class="hdrblk span1" data-map="T4">T4</div>' +
      '<div class="span4" data-map="R">R · Feature chart</div><div class="span2" data-map="S">S · Standings</div>' +
      '<div class="span3" data-map="F1">F1 · Featured</div><div class="span3" data-map="F2">F2 · Featured</div>' +
      '<div class="span1" data-map="B1">B1</div><div class="span1" data-map="B2">B2</div><div class="span1" data-map="B3">B3</div><div class="span1" data-map="B4">B4</div><div class="span1" data-map="B5">B5</div><div class="span1" data-map="B6">B6</div>' +
      '<div class="span6" data-map="C">C · Clubs chart</div><div class="span6" data-map="U">U · Coming up</div></div>';
    return '<div class="set-top"><div class="set-top-in"><h1>Settings</h1><div class="set-actions"><button type="button" class="btn-hdr" data-act="close-settings">Back to the board</button></div></div></div><div class="hdr-strip"></div>' +
      '<div class="set-wrap">' +
      '<section class="set-sec" aria-labelledby="sec-league"><div class="card-hd"><h2 id="sec-league">League</h2><span class="sub">Which board to show</span></div><div class="set-body">' +
      '<div class="field"><span class="flabel">League</span>' + segHTML('league', s.league, [['mlb', 'MLB'], ['college', 'College (D1)']]) + '<span class="hint">College mode covers NCAA Division I baseball: all of D1, each conference, and every D1 team.</span></div>' +
      '</div></section>' +
      '<section class="set-sec" aria-labelledby="sec-display"><div class="card-hd"><h2 id="sec-display">Display</h2><span class="sub">Saved in this browser · shared with the MLB board</span></div><div class="set-body">' +
      '<div class="field"><span class="flabel">Theme</span>' + segHTML('theme', s.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) + '<span class="hint">Auto follows your device setting.</span></div>' +
      '<div class="field"><span class="flabel">Layout</span>' + segHTML('layout', s.layout, [['standard', 'Standard'], ['tv', 'TV']]) + '<span class="hint">TV fits a 16:9 screen with no scrolling, uses larger type, rotates leader boards and charts, and keeps the screen awake where the browser allows it.</span></div>' +
      '<div class="field"><label for="set-tvRotate">TV rotation</label>' + sel('set-tvRotate', 'tvRotate', [[8, 'Every 8 seconds'], [12, 'Every 12 seconds'], [20, 'Every 20 seconds'], [30, 'Every 30 seconds']]) + '</div>' +
      '<div class="field"><span class="flabel">Ticker</span>' + segHTML('ticker', s.ticker, [[true, 'On'], [false, 'Off']]) + '</div>' +
      '<div class="field"><span class="flabel">Ticker speed</span>' + segHTML('tickerSpeed', s.tickerSpeed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]) + '</div>' +
      '</div></section>' +
      '<section class="set-sec" aria-labelledby="sec-data"><div class="card-hd"><h2 id="sec-data">Data</h2><span class="sub">NCAA API</span></div><div class="set-body">' +
      '<div class="field"><label for="set-defaultScope">Default view</label><select class="set-select" id="set-defaultScope" data-cset="defaultScope">' + defOpts + '</select><span class="hint">The board opens on this view. Changing it also switches the board now.</span></div>' +
      '<div class="field"><label for="set-apiBase">NCAA data address</label><input class="set-input" id="set-apiBase" data-cset="apiBase" type="url" inputmode="url" spellcheck="false" placeholder="' + esc(C.API_DEFAULT) + '" value="' + esc(cs.apiBase) + '">' + apiNote + '</div>' +
      '<div class="field"><span class="flabel">Leaders per board</span>' + segHTML('limit', s.limit, [[3, '3'], [5, '5'], [10, '10']]) + '</div>' +
      '<div class="field"><span class="flabel">Auto-refresh</span>' + segHTML('refresh', s.refresh, [[true, 'On'], [false, 'Off']]) + '<span class="hint">Scores check every minute while a game is live and wake up around each scheduled first pitch. Stats, the poll and charts refresh once a day at 5 AM.</span></div>' +
      (isLive() ? '<div class="field"><span class="flabel">Season results</span><div><button type="button" class="btn" data-act="recrawl">Download again</button></div><span class="hint">Records and charts come from every scoreboard of the season, kept on this device. Download them again if something looks off.</span></div>' : '') +
      '</div></section>' +
      '<section class="set-sec" aria-labelledby="sec-blocks"><div class="card-hd"><h2 id="sec-blocks">Blocks</h2><span class="sub">Choose what each block shows</span></div><div class="set-body">' + map +
      '<p class="set-note" style="margin:0">Leader boards can show any of the ' + C.STATS.length + ' player stats the NCAA ranks. The NCAA lists only qualified players, so conference and team boards show players from the national list. On the All D1 page the standings block shows the D1Baseball.com Top 25.</p>' +
      '<h3 class="sec-title" style="font-size:22px">Header tiles</h3><div class="pickers">' +
      C.BLOCKS.tiles.map(function (k) { return pickerHTML(k.code, k.id, k.label, metricOptions(b[k.id], false)); }).join('') + '</div>' +
      '<h3 class="sec-title" style="font-size:22px">Charts and lists</h3><div class="pickers">' +
      pickerHTML('R', 'race', 'Feature chart', featureOptions(b.race)) +
      pickerHTML('S', 'standings', 'Standings', showHide(b.standings)) +
      pickerHTML('C', 'clubs', 'Clubs chart', metricOptions(b.clubs, true)) +
      pickerHTML('U', 'upnext', 'Coming up', showHide(b.upnext)) + '</div>' +
      '<h3 class="sec-title" style="font-size:22px">Leader boards</h3><div class="pickers">' +
      C.BLOCKS.featured.concat(C.BLOCKS.boards).map(function (k) { return pickerHTML(k.code, k.id, k.label, statOptions(b[k.id])); }).join('') + '</div>' +
      '</div></section>' +
      '<div class="set-actions"><button type="button" class="btn primary" data-act="close-settings">Done</button>' +
      '<button type="button" class="btn' + (S.resetArmed ? ' warn' : '') + '" data-act="reset">' + (S.resetArmed ? 'Select again to reset college settings' : 'Reset college settings') + '</button>' +
      '<span class="set-note">Viewing: ' + esc(entity().full) + '</span></div></div>';
  }

  /* ───────── render ───────── */
  function render() {
    if (S.stopped) return;
    applyChrome();
    var app = document.getElementById('app');
    var focusId = document.activeElement && document.activeElement.id;
    if (S.view === 'settings') app.innerHTML = settingsHTML();
    else if (isTV()) app.innerHTML = '<div class="tvapp">' + headerHTML() + tvMainHTML() + '</div>';
    else app.innerHTML = headerHTML() + '<main class="dash" id="main">' + dashMainHTML() + '</main>';
    if (focusId) { var el = document.getElementById(focusId); if (el) el.focus(); }
    if (isTV()) CH.fitTV(app);
    startTV();
  }
  function refreshMain() {
    if (S.stopped) return;
    if (S.view !== 'dash') return;
    if (isTV()) {
      var a = document.getElementById('tv-board'), c = document.getElementById('tv-chart'), st = document.getElementById('tv-stack');
      if (!a || !c) { render(); return; }
      a.innerHTML = tvBoardPanelHTML(); c.innerHTML = tvChartPanelHTML(); if (st) st.innerHTML = tvStackHTML();
      CH.fitTV(document.getElementById('app'));
      return;
    }
    var main = document.getElementById('main'); if (main) main.innerHTML = dashMainHTML(); else render();
  }
  function refreshStatus() {
    if (S.stopped) return;
    var st = document.getElementById('hdr-status'); if (st) st.innerHTML = statusHTML();
    var tl = document.getElementById('tiles'); if (tl) tl.innerHTML = tilesHTML();
  }
  function refreshAll() { if (S.view === 'dash') { refreshStatus(); refreshTicker(); refreshMain(); } }

  /* ───────── events ───────── */
  function setScope(v) {
    if (!validScope(v)) v = 'D1';
    S.scope = v; S.tv.board = 0; S.tv.chart = 0; TK.x = 0;
    render();
  }
  function switchLeague(v) { S.settings.league = v; saveSettings(); X.switchLeague(v); }
  function setSetting(path, raw) {
    var val = raw;
    if (raw === 'true') val = true; else if (raw === 'false') val = false;
    else if (/^\d+$/.test(raw) && ['limit', 'tvRotate'].indexOf(path) >= 0) val = parseInt(raw, 10);
    if (path === 'league') { if (val !== 'college') switchLeague(val); return; }
    if (path.indexOf('blocks.') === 0) S.cs.blocks[path.slice(7)] = val; else S.settings[path] = val;
    if (path === 'layout' && val === 'tv') S.tickPaused = false;
    saveSettings();
    if (path === 'refresh') { scheduleScores(); scheduleDaily(); }
    S.resetArmed = false;
    render();
  }
  function setCollege(path, val) {
    S.cs[path] = val; saveSettings();
    if (path === 'defaultScope') { S.scope = validScope(val) ? val : 'D1'; render(); }
    if (path === 'apiBase') {
      API.setBase(val); API.resetCache(); S.ext = {}; S.pendingExt = {};
      S.data = null; render();
      loadLive().catch(function (err) { useSnapshot(err); }).then(function () { render(); scheduleScores(); scheduleDaily(); });
    }
  }
  function onClick(e) {
    var btn = e.target.closest('[data-act]'); if (!btn || btn.tagName === 'SELECT') return;
    var act = btn.getAttribute('data-act');
    if (act === 'open-settings') { S.view = 'settings'; S.resetArmed = false; render(); try { window.scrollTo(0, 0); history.replaceState(null, '', '#settings'); } catch (er) { /* ignore */ } }
    else if (act === 'close-settings') { S.view = 'dash'; render(); try { window.scrollTo(0, 0); history.replaceState(null, '', location.pathname + location.search); } catch (er) { /* ignore */ } }
    else if (act === 'tk-toggle') { S.tickPaused = !S.tickPaused; var v = document.getElementById('tk-view'); if (v) v.classList.toggle('paused', S.tickPaused); btn.setAttribute('aria-label', S.tickPaused ? 'Play ticker' : 'Pause ticker'); btn.innerHTML = S.tickPaused ? PLAY_SVG : PAUSE_SVG; }
    else if (act === 'seg') setSetting(btn.getAttribute('data-key'), btn.getAttribute('data-val'));
    else if (act === 'reset') {
      if (!S.resetArmed) { S.resetArmed = true; render(); return; }
      S.cs = clone(C.DEFAULT_SETTINGS); S.scope = 'D1'; S.resetArmed = false; saveSettings(); render();
    }
    else if (act === 'recrawl') { if (isLive()) { S.data.seasonGames = null; S.data.recs = null; S.view = 'dash'; render(); startCrawl(true); } }
    else if (act === 'exit-tv') setSetting('layout', 'standard');
    else if (act === 'fullscreen') { var r = document.documentElement; if (r.requestFullscreen) r.requestFullscreen().catch(function () {}); }
  }
  function onChange(e) {
    var t = e.target, act = t.getAttribute('data-act');
    if (act === 'conf' || act === 'team') { setScope(t.value); return; }
    var cpath = t.getAttribute('data-cset'); if (cpath) { setCollege(cpath, t.value.trim()); return; }
    var path = t.getAttribute('data-set'); if (path) setSetting(path, t.value);
  }
  function onFocus(e) {
    var code = e.target.getAttribute && e.target.getAttribute('data-code');
    document.querySelectorAll('.map [data-map]').forEach(function (n) { n.classList.toggle('lit', !!code && n.getAttribute('data-map') === code); });
  }

  /* ───────── boot ───────── */
  function stop() {
    S.stopped = true;
    clearTimeout(S.timers.sched); clearTimeout(S.timers.daily); clearInterval(S.tv.timer);
    if (TK.raf) window.cancelAnimationFrame(TK.raf);
    releaseWake();
  }
  var docBound = false;
  function onVisible() {
    if (S.stopped || document.visibilityState !== 'visible') return;
    if (isTV()) requestWake();
    if (isLive() && S.settings.refresh && S.nextDailyAt && Date.now() >= S.nextDailyAt) dailyReload();
  }
  function boot(opts) {
    S.stopped = false;
    loadSettings();
    S.settings.league = 'college';
    saveSettings();
    S.scope = validScope(S.cs.defaultScope) ? S.cs.defaultScope : 'D1';
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) S.tickPaused = true; } catch (e) { /* ignore */ }
    if (location.hash === '#settings' || (opts && opts.view === 'settings')) S.view = 'settings';
    var app = document.getElementById('app');
    app.addEventListener('click', onClick);
    app.addEventListener('change', onChange);
    app.addEventListener('focusin', onFocus);
    if (!docBound) {
      docBound = true;
      var tv = function () { if (!S.stopped && isTV()) pokeIdle(); };
      document.addEventListener('mousemove', tv); document.addEventListener('keydown', tv);
      window.addEventListener('resize', function () { if (!S.stopped && isTV()) { clearTimeout(S.timers.fit); S.timers.fit = setTimeout(function () { render(); }, 150); } });
      document.addEventListener('visibilitychange', onVisible);
    }
    app.addEventListener('mouseover', function (e) { TK.hover = !!e.target.closest('#tk-view'); });
    app.addEventListener('mouseleave', function () { TK.hover = false; });
    render();
    TK.raf = window.requestAnimationFrame(tickStep);
    loadLive().catch(function (err) { useSnapshot(err); }).then(function () { if (S.stopped) return; render(); scheduleScores(); scheduleDaily(); });
  }
  X.CollegeApp = { state: S, render: render, boot: boot, stop: stop };
  if (X.currentLeague && X.currentLeague() === 'college') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
})();
