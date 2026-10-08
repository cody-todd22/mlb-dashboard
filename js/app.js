/* MLB Live Board — app: state, data loading, rendering, ticker, feature chart, settings, TV mode. */
(function () {
  'use strict';
  var X = window.MLBX, API = X.API, CH = X.Charts;
  var esc = CH.esc, rate3 = CH.rate3, signed = CH.signed;
  var LS_KEY = 'mlb-live-board:settings';

  var S = {
    settings: null, team: 'MLB', view: 'dash', data: null, leaders: {}, pending: {}, ext: {}, pendingExt: {},
    tickPaused: false, tv: { chart: 0, board: 0, timer: null }, timers: {}, nextDailyAt: 0, wake: null, loadError: null, resetArmed: false
  };
  var TK = { x: 0, last: null, raf: null, hover: false };

  /* ───────── utilities ───────── */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function team(id) { return id === 'MLB' ? X.LEAGUE : X.TEAM_BY_ID[id]; }
  function abbr(id) { var t = X.TEAM_BY_ID[id]; return t ? t.abbr : '—'; }
  function nick(id) { var t = X.TEAM_BY_ID[id]; return t ? t.name : '—'; }
  function lastName(n) { var p = String(n).split(' '); if (p.length > 2 && /^(Jr\.?|Sr\.?|II|III|IV)$/.test(p[p.length - 1])) return p.slice(-2).join(' '); return p.length > 1 ? p.slice(1).join(' ') : n; }
  function shortName(n) { var p = String(n).split(' '); return p.length > 1 ? p[0].charAt(0) + '. ' + p.slice(1).join(' ') : n; }
  function shortRound(r) {
    if (!r) return '';
    if (/World Series/i.test(r)) return 'World Series';
    var L = leagueOf(r) || '';
    if (r.indexOf('Division Series') >= 0) return L + 'DS';
    if (r.indexOf('Championship Series') >= 0) return L + 'CS';
    if (r.indexOf('Wild Card') >= 0) return L + ' Wild Card';
    return r;
  }
  function leagueOf(r) { if (/^(AL|American)/.test(r || '')) return 'AL'; if (/^(NL|National)/.test(r || '')) return 'NL'; return null; }
  function teamLeague(id) { var t = X.TEAM_BY_ID[id]; return t ? X.DIV_BY_ID[t.div].league : null; }
  function nowDate() { return S.data && S.data.source === 'snapshot' ? new Date(S.data.now) : new Date(); }
  function dayKey(d) { return API.ymd(d); }
  function todayKey() { return dayKey(nowDate()); }
  function yestKey() { return dayKey(new Date(nowDate().getTime() - 86400000)); }
  function byDate(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); }
  function whenLabel(g) {
    var d = new Date(g.date), n = nowDate();
    var dk = dayKey(d);
    if (dk === dayKey(n)) return 'Today';
    if (dk === dayKey(new Date(n.getTime() + 86400000))) return 'Tomorrow';
    if (dk === dayKey(new Date(n.getTime() - 86400000))) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function timeLabel(g) {
    if (g.tbd) return 'Time TBD';
    return new Date(g.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }
  function isMLB() { return S.team === 'MLB'; }
  function involves(g, id) { return g.away.id === id || g.home.id === id; }
  function isLive() { return S.data && S.data.source === 'live'; }
  function halfText(v) { return v % 1 ? Math.abs(v).toFixed(1) : String(Math.abs(v)); }
  function signedHalf(v) { return v > 0 ? '+' + halfText(v) : (v < 0 ? '−' + halfText(v) : '0'); }
  function ipText(v) { var w = Math.floor(v + 1e-9), f = Math.round((v - w) * 3); return w + '.' + f; }

  /* Message blocks. Snapshot gaps and empty live responses read differently on purpose,
     so a live gap (likely a bug or an API change) stands out. */
  function msgLoading(what) { return '<div class="loading">Loading ' + esc(what) + '</div>'; }
  function msgSnapshot() { return '<div class="empty"><strong>Available with live data</strong>The saved snapshot doesn’t include this. It loads from the MLB Stats API on your hosted board.</div>'; }
  function msgNoData(what) { return '<div class="empty"><strong>No data came back</strong>The MLB Stats API returned nothing for ' + esc(what) + '. If this keeps happening, check the request in js/api.js.</div>'; }
  function missingShort() { return isLive() ? 'No data from the MLB Stats API' : 'Available with live data'; }

  /* ───────── settings ───────── */
  function mergeSettings(saved) {
    var s = clone(X.DEFAULT_SETTINGS);
    if (!saved || typeof saved !== 'object') return s;
    Object.keys(s).forEach(function (k) { if (k !== 'blocks' && k !== 'v' && saved[k] !== undefined) s[k] = saved[k]; });
    if (saved.blocks) Object.keys(s.blocks).forEach(function (k) { if (saved.blocks[k] !== undefined) s.blocks[k] = saved.blocks[k]; });
    if (!saved.v || saved.v < 2) s.teamPool = 'ALL';   // v2: team pages default to all players
    var validChart = { hide: true };
    X.FEATURE_GROUPS.forEach(function (g) { g.options.forEach(function (o) { validChart[o[0]] = true; }); });
    if (!validChart[s.blocks.race]) s.blocks.race = 'gap';
    return s;
  }
  function loadSettings() {
    try { var raw = window.localStorage.getItem(LS_KEY); if (raw) return mergeSettings(JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
    return clone(X.DEFAULT_SETTINGS);
  }
  function saveSettings() { try { window.localStorage.setItem(LS_KEY, JSON.stringify(S.settings)); } catch (e) { /* storage unavailable */ } }
  function isTV() { return S.settings.layout === 'tv' && S.view === 'dash'; }

  /* ───────── theme + club colors ───────── */
  function applyChrome() {
    var root = document.documentElement;
    if (S.settings.theme === 'auto') root.removeAttribute('data-app-theme'); else root.setAttribute('data-app-theme', S.settings.theme);
    root.classList.toggle('tv', isTV());
    var t = team(S.team), st = root.style;
    st.setProperty('--team', t.primary);
    st.setProperty('--team-2', t.secondary);
    st.setProperty('--on-team-2', t.onSecondary);
    st.setProperty('--team-ink-l', t.inkLight);
    st.setProperty('--team-ink-d', t.inkDark);
    st.setProperty('--team-tick', t.inkDark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.primary);
    document.title = (isMLB() ? '' : t.name + ' · ') + 'MLB Live Board';
  }

  /* ───────── data ───────── */
  function useSnapshot(err) {
    var sn = X.SNAPSHOT;
    S.loadError = err ? String(err.message || err) : null;
    S.data = { source: 'snapshot', asOf: sn.asOf, now: sn.now, season: sn.season, phase: sn.phase, info: null,
      standings: sn.standings, teamStats: sn.teamStats, games: sn.games, series: sn.series, snapLeaders: sn.leaders,
      race: { labels: sn.race.labels, snaps: sn.race.snaps, months: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'] } };
  }
  function phaseFor(info, d) {
    var t = dayKey(d);
    if (!info) return 'regular';
    if (t < info.start) return 'pre';
    if (t <= info.end) return 'regular';
    if (info.postStart && t >= info.postStart && (!info.postEnd || t <= info.postEnd)) return 'post';
    return 'off';
  }
  function windowStart() { return dayKey(new Date(Date.now() - 3 * 86400000)); }
  function windowEnd() { return dayKey(new Date(Date.now() + 6 * 86400000)); }
  function loadLive() {
    var today = new Date(), year = today.getFullYear();
    return API.season(year).then(function (info) {
      if (!info || dayKey(today) < info.start) return API.season(year - 1);
      return info;
    }).then(function (info) {
      if (!info) throw new Error('No season calendar returned');
      return Promise.all([
        API.standings(info.year),
        API.teamStats(info.year, S.settings.gameType),
        API.schedule(windowStart(), windowEnd()).catch(function () { return []; })
      ]).then(function (r) {
        var end = dayKey(today) < info.end ? dayKey(today) : info.end;
        S.data = { source: 'live', asOf: new Date().toISOString(), now: null, season: info.year, info: info, phase: phaseFor(info, today),
          standings: r[0], teamStats: r[1], games: r[2], series: API.seriesFromGames(r[2]), race: null,
          windows: API.monthWindows(info.start, end), seasonEnd: end, seasonOver: dayKey(today) > info.end };
        S.leaders = {}; S.ext = {}; S.pendingExt = {}; API.resetCache();
        loadRace();
      });
    });
  }
  function loadRace() {
    var d = S.data;
    if (!isLive() || !d.info) return;
    API.race(d.season, d.info.start, d.seasonEnd, d.seasonOver).then(function (race) {
      race.months = race.windows.map(function (w) { return w.label; });
      d.race = race; refreshMain();
    }).catch(function () { d.race = { failed: true }; refreshMain(); });
  }
  function refreshSchedule() {
    if (!isLive()) return Promise.resolve();
    var d = S.data;
    return API.schedule(windowStart(), windowEnd()).then(function (games) {
      d.games = games; d.series = API.seriesFromGames(games); d.asOf = new Date().toISOString();
      Object.keys(S.ext).forEach(function (k) { if (k.indexOf('recent|') === 0) delete S.ext[k]; });
      refreshTicker(); refreshMain(); refreshStatus();
    }).catch(function () { /* keep the last good schedule */ });
  }
  /* Scores: every minute while a game is live; otherwise sleep until about a minute before
     the next scheduled first pitch (or keep checking a game that should have started). */
  function scheduleScores() {
    clearTimeout(S.timers.sched);
    if (!S.settings.refresh || !isLive()) return;
    var now = Date.now(), gs = S.data.games, delay = null;
    if (gs.some(function (g) { return g.state === 'live'; })) delay = 60000;
    else {
      var starts = gs.filter(function (g) { return g.state === 'pre' && !g.tbd && !/Postponed|Cancelled/.test(g.detailed); }).map(function (g) { return new Date(g.date).getTime(); });
      if (starts.some(function (t) { return t <= now && now - t < 3 * 3600000; })) delay = 60000;
      else {
        var future = starts.filter(function (t) { return t > now; });
        if (future.length) delay = Math.max(30000, Math.min.apply(null, future) - now - 60000);
      }
    }
    if (delay == null) return;   // nothing scheduled this week: the 5 AM refresh picks up new games
    S.timers.sched = setTimeout(function () { refreshSchedule().then(scheduleScores); }, Math.min(delay, 2147483000));
  }
  /* Stats, standings, leaders and charts reload once a day at 5 AM local time. */
  function scheduleDaily() {
    clearTimeout(S.timers.daily);
    if (!S.settings.refresh || !isLive()) return;
    var n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 5, 0, 0);
    if (t <= n) t = new Date(t.getTime() + 86400000);
    S.nextDailyAt = t.getTime();
    S.timers.daily = setTimeout(dailyReload, Math.min(t - n, 2147483000));
  }
  function dailyReload() {
    loadLive().then(function () { render(); }).catch(function () { /* keep yesterday's data */ }).then(function () { scheduleScores(); scheduleDaily(); });
  }

  /* Games with the snapshot's optional sample live state applied. */
  function games() {
    var d = S.data; if (!d) return [];
    if (d.source !== 'snapshot' || !S.settings.sampleLive) return d.games;
    var sl = X.SNAPSHOT.sampleLive;
    return d.games.map(function (g) {
      var s = sl[g.pk]; if (!s) return g;
      var c = clone(g); c.state = 'live'; c.away.score = s.as; c.home.score = s.hs; c.inning = s.inning; c.outs = s.outs; c.sample = true;
      return c;
    });
  }

  /* Lazily loaded extras (charts, rosters, a team's recent games). Returns the value,
     undefined while loading, or { error } — and starts the request the first time. */
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

  /* ───────── leaders ───────── */
  function poolFor() { return isMLB() ? S.settings.pool : S.settings.teamPool; }
  function leaderKey(scope, statKey) { return [scope, statKey, poolFor(), S.settings.gameType, S.settings.limit].join('|'); }
  function leaderState(statKey) {
    var d = S.data;
    if (!d) return { loading: true };
    if (d.source === 'snapshot') {
      var sc = d.snapLeaders[isMLB() ? 'MLB' : String(S.team)];
      var rows = sc && sc[statKey];
      if (!rows) return { missing: true };
      return { rows: rows.slice(0, S.settings.limit) };
    }
    return S.leaders[leaderKey(S.team, statKey)] || { loading: true };
  }
  function activeLeaderStats() {
    var b = S.settings.blocks, out = [];
    ['feat1', 'feat2', 'board1', 'board2', 'board3', 'board4', 'board5', 'board6'].forEach(function (id) { if (b[id] && b[id] !== 'hide' && out.indexOf(b[id]) < 0) out.push(b[id]); });
    return out;
  }
  function ensureLeaders() {
    if (!isLive()) return;
    var scope = S.team, d = S.data;
    activeLeaderStats().forEach(function (statKey) {
      var k = leaderKey(scope, statKey);
      if (S.leaders[k] || S.pending[k]) return;
      S.pending[k] = true;
      API.leaders(d.season, statKey, { teamId: scope === 'MLB' ? null : scope, limit: S.settings.limit, pool: poolFor(), gameType: S.settings.gameType })
        .then(function (rows) { S.leaders[k] = { rows: rows.slice(0, S.settings.limit) }; })
        .catch(function () { S.leaders[k] = { error: true }; })
        .then(function () { delete S.pending[k]; queueRefresh(); });
    });
  }
  var queued = false;
  function queueRefresh() { if (queued) return; queued = true; setTimeout(function () { queued = false; refreshMain(); refreshTicker(); ensureLeaders(); }, 60); }

  /* Rosters → qualification for the asterisk (3.1 PA or 1 IP per team game). */
  function roster(teamId) {
    var d = S.data;
    return need('roster|' + teamId, function () {
      return Promise.all([API.roster(d.season, teamId, 'hitting', 'R'), API.roster(d.season, teamId, 'pitching', 'R')]).then(function (r) { return { hit: r[0], pit: r[1] }; });
    });
  }
  function qualifier() {
    if (isMLB() || !isLive() || S.settings.gameType !== 'R') return null;
    var r = roster(S.team);
    if (!r || isErr(r)) return null;
    var st = S.data.standings[S.team], G = st ? st.w + st.l : 0;
    var bat = {}, pit = {};
    r.hit.forEach(function (p) { bat[p.pid] = (p.stat.plateAppearances || 0) >= 3.1 * G; });
    r.pit.forEach(function (p) { pit[p.pid] = (p.stat.inningsPitched || 0) >= 1.0 * G; });
    return function (kind, pid) { var m = kind === 'bat' ? bat : pit; return pid in m ? m[pid] : true; };
  }

  /* ───────── club metrics ───────── */
  function metricValue(id, key) {
    var m = X.METRIC_BY_KEY[key], d = S.data; if (!m || !d) return null;
    if (m.src === 'st') { var r = d.standings[id]; return r && r[m.field] != null ? r[m.field] : null; }
    var g = d.teamStats[m.src] || {}, st = g[id];
    return st && st[m.field] != null ? st[m.field] : null;
  }
  function metricText(id, key) {
    var m = X.METRIC_BY_KEY[key], v = metricValue(id, key), r = S.data.standings[id] || {};
    if (m.fmt === 'record') return r.w != null ? r.w + '–' + r.l : '—';
    if (m.fmt === 'streak') return r.streak || '—';
    if (m.fmt === 'l10') return r.l10 || '—';
    if (m.fmt === 'home') return r.home || '—';
    if (m.fmt === 'away') return r.away || '—';
    if (v == null) return '—';
    if (m.fmt === 'rate3') return rate3(v);
    if (m.fmt === 'dec2') return v.toFixed(2);
    if (m.fmt === 'signed') return signed(v);
    return String(Math.round(v));
  }
  function metricRank(id, key) {
    var m = X.METRIC_BY_KEY[key], vals = [];
    X.TEAMS.forEach(function (t) { var v = metricValue(t.id, key); if (v != null) vals.push({ id: t.id, v: v }); });
    vals.sort(function (a, b) { return m.low ? a.v - b.v : b.v - a.v; });
    var me = vals.filter(function (x) { return x.id === id; })[0];
    if (!me) return null;
    var better = vals.filter(function (x) { return m.low ? x.v < me.v : x.v > me.v; }).length;
    var ties = vals.filter(function (x) { return x.v === me.v; }).length;
    return { rank: better + 1, tie: ties > 1, of: vals.length, best: vals[0] };
  }
  function bestBy(key, n, low) {
    return X.TEAMS.map(function (t) { return { id: t.id, v: metricValue(t.id, key) }; }).filter(function (x) { return x.v != null; })
      .sort(function (a, b) { return low ? a.v - b.v : b.v - a.v; }).slice(0, n).map(function (x) { return x.id; });
  }

  /* ───────── header ───────── */
  function contextLine() {
    var d = S.data; if (!d) return 'Loading';
    var season = d.season, g = games();
    if (d.phase === 'post') {
      var cur = g.filter(function (x) { return x.post && x.state !== 'final'; }).sort(byDate)[0];
      var round = cur ? cur.round.replace(/^(AL|NL)\s+/, '').replace(/^(American|National) League\s+/, '') : '';
      return season + ' Postseason' + (round ? ' · ' + round : '');
    }
    if (d.phase === 'pre') return season + ' season · Opening Day ahead';
    if (d.phase === 'off') return season + ' season · Final';
    return season + ' Regular season';
  }
  function statusHTML() {
    var d = S.data;
    if (!d) return '<span class="pill"><span class="dot"></span>Loading</span>';
    var at = new Date(d.asOf).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    if (d.source === 'snapshot') return '<span class="pill snap" title="' + esc(S.loadError ? 'Live data unavailable: ' + S.loadError : '') + '">Snapshot</span><span class="ctx">' + esc(contextLine()) + ' · Data as of ' + esc(at) + '</span>';
    var anyLive = games().some(function (x) { return x.state === 'live'; });
    return '<span class="pill"><span class="dot"></span>' + (anyLive ? 'Live' : 'Live data') + '</span><span class="ctx">' + esc(contextLine()) + ' · Updated ' + esc(new Date(d.asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</span>';
  }
  function teamSelectHTML(id) {
    var opts = '<option value="MLB"' + (S.team === 'MLB' ? ' selected' : '') + '>All MLB</option>';
    X.DIVISIONS.forEach(function (dv) {
      opts += '<optgroup label="' + dv.name + '">';
      X.TEAMS.filter(function (t) { return t.div === dv.id; }).forEach(function (t) {
        opts += '<option value="' + t.id + '"' + (String(S.team) === String(t.id) ? ' selected' : '') + '>' + esc(t.full) + '</option>';
      });
      opts += '</optgroup>';
    });
    return '<div class="pick"><label for="' + id + '">Team</label><div class="select-wrap"><select id="' + id + '" data-act="team">' + opts + '</select>' +
      '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></div></div>';
  }
  function tileHTML(key) {
    var m = X.METRIC_BY_KEY[key]; if (!m || !S.data) return '';
    if (isMLB()) {
      var withVal = X.TEAMS.filter(function (t) { return metricValue(t.id, key) != null; });
      var rk = withVal.length ? metricRank(withVal[0].id, key) : null;
      if (!rk || !rk.best) return '<div class="tile"><span class="tile-k">' + esc(m.label) + '</span><span class="tile-v">—</span><span class="tile-s">' + esc(missingShort()) + '</span></div>';
      var best = rk.best.id;
      return '<div class="tile"><span class="tile-k">' + esc(m.fmt === 'record' ? 'Best record' : m.label) + '</span><span class="tile-v">' + esc(abbr(best) + ' · ' + metricText(best, key)) + '</span></div>';
    }
    var id = S.team, txt = metricText(id, key), sub = '';
    if (m.fmt === 'record') {
      var r = S.data.standings[id] || {};
      sub = r.divRank ? ord(r.divRank) + ' in the ' + X.DIV_BY_ID[team(id).div].name + (r.gb && r.gb !== '-' ? ' · ' + r.gb + ' GB' : '') : '';
    } else {
      var rr = metricRank(id, key);
      sub = rr ? (rr.tie ? 'T-' : '') + ord(rr.rank) + ' of ' + rr.of + ' in MLB' : missingShort();
    }
    return '<div class="tile"><span class="tile-k">' + esc(m.label) + '</span><span class="tile-v">' + esc(txt) + '</span><span class="tile-s">' + esc(sub) + '</span></div>';
  }
  function tilesHTML() {
    return ['tile1', 'tile2', 'tile3', 'tile4'].map(function (k) { var v = S.settings.blocks[k]; return v && v !== 'hide' ? tileHTML(v) : ''; }).join('');
  }
  var PAUSE_SVG = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"><line x1="8" y1="5" x2="8" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line></svg>';
  var PLAY_SVG = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>';
  function tickerShellHTML() {
    if (!S.settings.ticker) return '';
    return '<div class="ticker" aria-label="Scores and schedule ticker">' +
      '<div class="tk-label" id="tk-label">' + esc(isMLB() ? 'MLB' : abbr(S.team)) + '</div>' +
      '<button type="button" class="tk-btn" data-act="tk-toggle" aria-label="' + (S.tickPaused ? 'Play ticker' : 'Pause ticker') + '">' + (S.tickPaused ? PLAY_SVG : PAUSE_SVG) + '</button>' +
      '<div class="tk-view' + (S.tickPaused ? ' paused' : '') + '" id="tk-view"><div class="tk-track" id="tk-track">' + tickerItemsHTML() + '</div></div></div>';
  }
  function headerHTML() {
    var t = team(S.team);
    var actions = '<div class="hdr-actions">' + teamSelectHTML('team-select') +
      '<button type="button" class="btn-hdr" data-act="open-settings"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>Settings</button></div>';
    var top = '<div class="hdr-top"><div class="hdr-status" id="hdr-status">' + statusHTML() + '</div>' + (isTV() ? '' : actions) + '</div>';
    var body = isTV()
      ? '<div class="hdr-main"><h1 class="hdr-title">' + esc(t.full) + '</h1><div class="tiles" id="tiles">' + tilesHTML() + '</div></div>'
      : '<h1 class="hdr-title">' + esc(t.full) + '</h1><div class="tiles" id="tiles">' + tilesHTML() + '</div>';
    return '<header class="hdr"><div class="hdr-in">' + top + body + '</div>' + tickerShellHTML() + '<div class="hdr-strip"></div></header>';
  }

  /* ───────── ticker ───────── */
  function seriesFor(g) {
    var ids = [g.away.id, g.home.id];
    return (S.data.series || []).filter(function (s) { return s.type === g.gameType && ids.indexOf(s.a) >= 0 && ids.indexOf(s.b) >= 0; })[0] || null;
  }
  function seriesText(s) {
    if (!s) return '';
    if (s.aw === s.bw) return 'Series tied ' + s.aw + '–' + s.bw;
    var lead = s.aw > s.bw ? s.a : s.b, hi = Math.max(s.aw, s.bw), lo = Math.min(s.aw, s.bw);
    return abbr(lead) + (s.over || hi >= s.need ? ' wins ' : ' leads ') + hi + '–' + lo;
  }
  /* Next-round matchups the API still lists with placeholder clubs ("NL Higher Seed"). */
  function tbdGame(g) { return !X.TEAM_BY_ID[g.away.id] || !X.TEAM_BY_ID[g.home.id]; }
  function pairLabel(s) { return (s.over || Math.max(s.aw, s.bw) >= s.need) ? abbr(s.aw > s.bw ? s.a : s.b) : abbr(s.a) + '/' + abbr(s.b); }
  function seriesStrength(s) { var st = S.data.standings; return Math.max((st[s.a] || {}).pct || 0, (st[s.b] || {}).pct || 0); }
  function feederSeries(g) {
    var ser = S.data.series || [];
    if (g.gameType === 'W') return ser.filter(function (s) { return s.type === 'L'; });
    var feed = g.gameType === 'L' ? 'D' : (g.gameType === 'D' ? 'F' : null), lg = leagueOf(g.round);
    return ser.filter(function (s) { return s.type === feed && leagueOf(s.round) === lg; }).sort(function (a, b) { return seriesStrength(b) - seriesStrength(a); });
  }
  function tbdMatchup(g) {
    if (g.gameType === 'W') {
      return ['AL', 'NL'].map(function (L) { var l = (S.data.series || []).filter(function (s) { return s.type === 'L' && leagueOf(s.round) === L; })[0]; return l ? pairLabel(l) : L + ' champion'; }).join(' vs ');
    }
    var f = feederSeries(g);
    if (!X.TEAM_BY_ID[g.away.id] && !X.TEAM_BY_ID[g.home.id] && f.length === 2) return pairLabel(f[0]) + ' vs ' + pairLabel(f[1]);
    return [g.away, g.home].map(function (t) { return X.TEAM_BY_ID[t.id] ? abbr(t.id) : (t.name || 'TBD'); }).join(' vs ');
  }
  function tbdInvolves(g, id) {
    if (involves(g, id)) return true;
    return feederSeries(g).some(function (s) { return s.a === id || s.b === id; });
  }
  function latestPerSeries(finals) {
    var by = {};
    finals.forEach(function (g) {
      var k = g.gameType + ':' + [g.away.id, g.home.id].sort().join('-');
      if (!by[k] || g.date > by[k].date) by[k] = g;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(byDate).reverse();
  }
  function tickerItems() {
    var all = games().slice().sort(byDate), today = todayKey(), yest = yestKey();
    var live = all.filter(function (g) { return g.state === 'live' && !tbdGame(g); });
    var pre = all.filter(function (g) { return g.state === 'pre' && !tbdGame(g) && !g.ifNec && !/Postponed|Cancelled/.test(g.detailed); });
    var tbdSeen = {}, tbd = all.filter(function (g) {
      if (g.state !== 'pre' || !tbdGame(g)) return false;
      var k = g.gameType + (leagueOf(g.round) || ''); if (tbdSeen[k]) return false; tbdSeen[k] = true; return true;
    });
    var series = (S.data.series || []).filter(function (s) { return !s.over; });
    var postFinals = latestPerSeries(all.filter(function (g) { return g.post && g.state === 'final' && !tbdGame(g); }));
    var regFinals = all.filter(function (g) { return !g.post && g.state === 'final'; }).reverse();
    var out = [];
    function sec(title, arr) { if (!arr.length) return; out.push({ k: 'head', text: title }); arr.forEach(function (i) { out.push(i); }); }
    function L(g) { return { k: 'live', g: g }; }
    function N(g) { return { k: 'next', g: g }; }
    function F(g) { return { k: 'final', g: g }; }
    function SR(s) { return { k: 'series', s: s }; }
    function TB(g) { return { k: 'tbd', g: g }; }
    if (isMLB()) {
      sec('Live', live.map(L));
      sec('Up next', pre.slice(0, 6).map(N));
      sec(series.length && series[0].round ? series[0].round.replace(/^(AL|NL)\s+/, '') : 'Series', series.map(SR));
      sec('Next round', tbd.map(TB));
      sec('Final', postFinals.map(F).concat(regFinals.filter(function (g) { return g.day === today || g.day === yest; }).map(F)));
    } else {
      var id = S.team;
      // the selected team's last 7 results (plus today's), from its own schedule
      var recent = need('recent|' + id, function () { return API.teamSchedule(id, dayKey(new Date(Date.now() - 21 * 86400000)), dayKey(new Date())); });
      // includes the team's own postseason games, so its latest results read in order
      var pool = all.filter(function (g) { return g.state === 'final' && involves(g, id); });
      if (Array.isArray(recent)) recent.forEach(function (g) { if (g.state === 'final' && !pool.some(function (p) { return p.pk === g.pk; })) pool.push(g); });
      pool.sort(byDate).reverse();
      var teamFinals = pool.filter(function (g, i) { return i < 7 || g.day === today; });
      var teamPks = {}; teamFinals.forEach(function (g) { teamPks[g.pk] = true; });
      var mineNext = pre.filter(function (g) { return involves(g, id) && (g.post || g.day === today); }).slice(0, 2);
      var mine = live.filter(function (g) { return involves(g, id); }).map(L)
        .concat(series.filter(function (s) { return s.a === id || s.b === id; }).map(SR))
        .concat(mineNext.map(N))
        .concat(tbd.filter(function (g) { return tbdInvolves(g, id); }).map(TB))
        .concat(postFinals.filter(function (g) { return involves(g, id) && !teamPks[g.pk]; }).map(F))
        .concat(teamFinals.map(F));
      if (!mine.length) mine = [{ k: 'note', text: S.data.phase === 'post' || S.data.phase === 'off' ? 'Season complete' : 'No games today' }];
      sec(team(id).name, mine);
      var otherNext = pre.filter(function (g) { return !involves(g, id) && (g.post || g.day === today); });
      sec('Around the league', live.filter(function (g) { return !involves(g, id); }).map(L)
        .concat(otherNext.filter(function (g) { return !g.post; }).map(N))
        .concat(otherNext.filter(function (g) { return g.post; }).slice(0, 3).map(N))
        .concat(series.filter(function (s) { return s.a !== id && s.b !== id; }).map(SR))
        .concat(tbd.filter(function (g) { return !tbdInvolves(g, id); }).map(TB))
        .concat(postFinals.filter(function (g) { return !involves(g, id); }).map(F))
        .concat(regFinals.filter(function (g) { return !involves(g, id) && g.day === today; }).map(F)));
    }
    if (!out.length) out.push({ k: 'note', text: 'No games scheduled this week' });
    return out;
  }
  function tickItemHTML(it) {
    if (it.k === 'head') return '<div class="tk-item head">' + esc(it.text) + '</div>';
    if (it.k === 'note') return '<div class="tk-item"><span class="tk-team win">' + esc(it.text) + '</span></div>';
    if (it.k === 'series') {
      var s = it.s;
      var pips = function (w) { var h = ''; for (var i = 0; i < s.need; i++) h += '<span class="pip' + (i < w ? ' on' : '') + '"></span>'; return h; };
      return '<div class="tk-item"><span class="tk-sub">' + esc(shortRound(s.round)) + '</span><span class="tk-team win">' + abbr(s.a) + '</span><span class="pips" aria-label="' + s.aw + ' wins">' + pips(s.aw) + '</span>' +
        '<span class="tk-team win">' + abbr(s.b) + '</span><span class="pips" aria-label="' + s.bw + ' wins">' + pips(s.bw) + '</span><span class="tk-sub">' + esc(seriesText(s)) + '</span></div>';
    }
    var g = it.g, a = abbr(g.away.id), h = abbr(g.home.id);
    if (it.k === 'tbd') {
      return '<div class="tk-item"><span class="tk-when">' + esc(whenLabel(g) + (g.tbd ? '' : ' ' + timeLabel(g))) + '</span><span class="tk-team win">' + esc(shortRound(g.round)) + ' ' + esc(tbdMatchup(g)) + '</span>' +
        (g.tv ? '<span class="tk-sub">' + esc(g.tv) + '</span>' : '') + '</div>';
    }
    if (it.k === 'live') {
      var aw = g.away.score > g.home.score, hw = g.home.score > g.away.score;
      return '<div class="tk-item"><span class="tk-live">' + (g.sample ? 'Sample' : 'Live') + '</span><span class="tk-team' + (aw ? ' win' : '') + '">' + a + ' ' + g.away.score + '</span>' +
        '<span class="tk-team' + (hw ? ' win' : '') + '">' + h + ' ' + g.home.score + '</span><span class="tk-sub">' + esc([g.inning, g.outs != null ? g.outs + (g.outs === 1 ? ' out' : ' outs') : '', g.tv].filter(Boolean).join(' · ')) + '</span></div>';
    }
    if (it.k === 'final') {
      var aW = g.away.score > g.home.score;
      return '<div class="tk-item"><span class="tk-final">Final</span><span class="tk-team ' + (aW ? 'win' : 'lose') + '">' + a + ' ' + g.away.score + '</span><span class="tk-team ' + (aW ? 'lose' : 'win') + '">' + h + ' ' + g.home.score + '</span>' +
        '<span class="tk-sub">' + esc([g.round ? shortRound(g.round) + (g.gameNum ? ' G' + g.gameNum : '') : '', whenLabel(g)].filter(Boolean).join(' · ')) + '</span></div>';
    }
    var prob = g.probAway && g.probHome ? lastName(g.probAway) + ' vs. ' + lastName(g.probHome) : '';
    return '<div class="tk-item"><span class="tk-when">' + esc(whenLabel(g) + ' ' + timeLabel(g)) + '</span><span class="tk-team win">' + a + ' <span class="tk-at">at</span> ' + h + '</span>' +
      '<span class="tk-sub">' + esc([g.round ? shortRound(g.round) + (g.gameNum ? ' G' + g.gameNum : '') : '', g.tv, prob].filter(Boolean).join(' · ')) + '</span></div>';
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
    if (lb) lb.textContent = isMLB() ? 'MLB' : abbr(S.team);
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
  var EXT_MODES = { lrace: 1, trace: 1, rpg: 1, tops: 1, tera: 1, hrrace: 1, season: 1, form10: 1, homeaway: 1, onerun: 1, hops: 1, rera: 1 };
  function divTeams(div) { return X.TEAMS.filter(function (t) { return t.div === div; }).map(function (t) { return t.id; }); }
  function topRecords(n) { var st = S.data.standings; return X.TEAMS.map(function (t) { return t.id; }).filter(function (id) { return st[id]; }).sort(function (a, b) { return st[b].pct - st[a].pct; }).slice(0, n); }
  function legendHTML(hiText, restText, extra) {
    return '<div class="legend"><span><i class="sw"></i>' + esc(hiText) + '</span>' + (extra || '') + (restText ? '<span><i class="sw gray"></i>' + esc(restText) + '</span>' : '') + '</div>';
  }
  function lineSize(tv) { return tv ? { w: 560, h: 500 } : { w: 760, h: 330 }; }

  /* Standings at each month end → derived records (rank, games back, wild-card margin). */
  function stopRecords(snap) {
    var out = {};
    X.DIVISIONS.forEach(function (dv) {
      var ts = X.TEAMS.filter(function (t) { return t.div === dv.id && snap[t.id]; }).map(function (t) { var r = snap[t.id]; return { id: t.id, w: r[0], l: r[1], pct: r[0] + r[1] ? r[0] / (r[0] + r[1]) : 0.5 }; });
      ts.sort(function (a, b) { return b.pct - a.pct || b.w - a.w; });
      var L = ts[0];
      ts.forEach(function (x, i) { out[x.id] = { w: x.w, l: x.l, pct: x.pct, rank: i + 1, gb: L ? ((L.w - x.w) + (x.l - L.l)) / 2 : 0, lead: i === 0 }; });
    });
    ['AL', 'NL'].forEach(function (lg) {
      var ids = X.TEAMS.filter(function (t) { return X.DIV_BY_ID[t.div].league === lg && out[t.id]; }).map(function (t) { return t.id; });
      var non = ids.filter(function (id) { return !out[id].lead; }).sort(function (a, b) { return out[b].pct - out[a].pct; });
      var cut = non[2] ? out[non[2]] : null;
      ids.forEach(function (id) { out[id].wc = cut ? ((out[id].w - out[id].l) - (cut.w - cut.l)) / 2 : 0; });
    });
    return out;
  }
  function raceRecs() {
    var r = S.data.race;
    if (!r || r.failed) return r;
    if (!r._recs) r._recs = r.snaps.map(stopRecords);
    return r;
  }
  function closestDivision() {
    var st = S.data.standings, best = null;
    X.DIVISIONS.forEach(function (dv) {
      var ts = divTeams(dv.id).filter(function (id) { return st[id]; }).sort(function (a, b) { return st[b].pct - st[a].pct; });
      if (ts.length < 2) return;
      var L = st[ts[0]], s2 = st[ts[1]], gap = ((L.w - s2.w) + (s2.l - L.l)) / 2;
      if (!best || gap < best.gap) best = { div: dv.id, gap: gap, leader: ts[0] };
    });
    return best;
  }
  function raceFamily(mode, tv) {
    var r = raceRecs();
    if (!r) return msgLoading('month-by-month standings');
    if (r.failed) return msgNoData('month-end standings');
    var recs = r._recs, labels = ['Start'].concat(r.labels.slice(1)), size = lineSize(tv);
    if (mode === 'wc') return wcChart(r, tv);
    var ids, hiId, rest;
    if (mode === 'gb' || mode === 'rank') {
      var div = isMLB() ? closestDivision().div : team(S.team).div;
      ids = divTeams(div);
      hiId = isMLB() ? closestDivision().leader : S.team;
      rest = X.DIV_BY_ID[div].name + (isMLB() ? ' · the closest division race' : ' rivals');
    } else {
      ids = isMLB() ? topRecords(6) : divTeams(team(S.team).div);
      hiId = isMLB() ? ids[0] : S.team;
      rest = isMLB() ? 'Next five best records' : X.DIV_BY_ID[team(S.team).div].name + ' rivals';
    }
    var series, lab = labels, opts;
    if (mode === 'monthly') {
      lab = r.months;
      series = ids.map(function (id) {
        return { label: abbr(id), hi: id === hiId, vals: recs.slice(1).map(function (cur, i) {
          var a = recs[i][id], b = cur[id]; if (!a || !b) return null;
          var dw = b.w - a.w, dl = b.l - a.l; return dw + dl ? dw / (dw + dl) : null;
        }) };
      });
      opts = { fmt: rate3, zero: 0.5 };
    } else {
      var val = { gap: function (x) { return x.w - x.l; }, pct: function (x) { return x.w + x.l ? x.pct : 0.5; }, gb: function (x) { return x.gb; }, rank: function (x) { return x.rank; } }[mode];
      series = ids.map(function (id) {
        return { label: abbr(id), hi: id === hiId, vals: recs.map(function (rec, i) { return rec[id] && !(mode === 'rank' && i === 0) ? val(rec[id]) : null; }) };
      });
      opts = {
        gap: { fmt: function (v) { return v === 0 ? '.500' : signed(v); }, zero: 0, ints: true },
        pct: { fmt: rate3, zero: 0.5 },
        gb: { fmt: function (v) { return v === 0 ? 'Lead' : halfText(v); }, invert: true, min: 0, zero: 0 },
        rank: { fmt: function (v) { return ord(v); }, invert: true, min: 1, max: ids.length, step: 1 }
      }[mode];
    }
    if (mode === 'rank') { lab = lab.slice(1); series.forEach(function (s) { s.vals = s.vals.slice(1); }); }   // everyone is tied before the first pitch
    opts.labels = lab; opts.series = series; opts.w = size.w; opts.h = size.h; opts.aria = FEATURE_META[mode].sub();
    return CH.lines(opts) + (tv ? '' : legendHTML(nick(hiId) + (isMLB() && (mode === 'gap' || mode === 'pct' || mode === 'monthly') ? ' · best record' : ''), rest));
  }
  function wcChart(r, tv) {
    var recs = r._recs, fin = recs[recs.length - 1];
    function panel(lg, focus) {
      var ids = X.TEAMS.filter(function (t) { return X.DIV_BY_ID[t.div].league === lg && fin[t.id] && !fin[t.id].lead; }).map(function (t) { return t.id; })
        .sort(function (a, b) { return fin[b].pct - fin[a].pct; }).slice(0, 6);
      if (focus && ids.indexOf(focus) < 0) ids.push(focus);
      var hiId = focus || ids[0];
      var series = ids.map(function (id) { return { label: abbr(id), hi: id === hiId, vals: recs.map(function (rec, i) { return i === 0 ? 0 : (rec[id] ? rec[id].wc : null); }) }; });
      return CH.lines({ labels: ['Start'].concat(r.labels.slice(1)), series: series, fmt: function (v) { return v === 0 ? '0' : signedHalf(v); }, zero: 0, zeroLabel: 'Last in', w: tv ? 560 : (isMLB() ? 600 : 760), h: tv ? (isMLB() ? 260 : 500) : 360, aria: lg + ' wild-card race' });
    }
    if (!isMLB()) return panel(teamLeague(S.team), S.team) + (tv ? '' : legendHTML(nick(S.team), teamLeague(S.team) + ' wild-card contenders'));
    return '<div class="dual"><div><h3 class="dual-h">American League</h3>' + panel('AL') + '</div><div><h3 class="dual-h">National League</h3>' + panel('NL') + '</div></div>' +
      (tv ? '' : legendHTML('Top wild-card team', 'Other contenders · 0 = the last wild-card spot'));
  }

  /* Season game logs (one request for every final) */
  function seasonGames() { var d = S.data; return need('games', function () { return API.seasonGames(d.season, d.info.start, d.seasonEnd); }); }
  function teamLog(all, id) {
    return all.filter(function (g) { return g.a === id || g.h === id; }).map(function (g) {
      var home = g.h === id, rs = home ? g.hs : g.as, ra = home ? g.as : g.hs;
      return { d: g.d, home: home, rs: rs, ra: ra, win: rs > ra, margin: rs - ra, opp: home ? g.a : g.h };
    });
  }
  function inWindow(day, w) { return day >= w.start && day <= w.end; }
  function bestRecordId() { return topRecords(1)[0]; }
  function seasonBars(tv) {
    var all = seasonGames(); if (all === undefined) return msgLoading('every game this season');
    if (isErr(all) || !all.length) return msgNoData('the season schedule');
    var id = isMLB() ? bestRecordId() : S.team, log = teamLog(all, id), ticks = [], lastM = null;
    log.forEach(function (g, i) { var m = g.d.slice(5, 7); if (m !== lastM) { lastM = m; ticks.push({ i: i, label: new Date(g.d + 'T12:00:00').toLocaleString('en-US', { month: 'short' }) }); } });
    var size = tv ? { w: 560, h: 480 } : { w: 760, h: 300 };
    var bars = log.map(function (g) {
      return { win: g.win, margin: g.margin, tip: g.d + ' · ' + (g.home ? 'vs ' : 'at ') + abbr(g.opp) + ' · ' + (g.win ? 'W ' : 'L ') + Math.max(g.rs, g.ra) + '–' + Math.min(g.rs, g.ra) };
    });
    var w = log.filter(function (g) { return g.win; }).length;
    return CH.gameBars({ games: bars, ticks: ticks, w: size.w, h: size.h, aria: nick(id) + ' game-by-game results' }) +
      (tv ? '' : '<div class="legend"><span><i class="sw sq"></i>' + esc(nick(id) + ' wins · ' + w + '–' + (log.length - w) + (isMLB() ? ' · best record in MLB' : '')) + '</span><span><i class="sw sq gray"></i>Losses</span></div>');
  }
  function formChart(tv) {
    var all = seasonGames(); if (all === undefined) return msgLoading('every game this season');
    if (isErr(all) || !all.length) return msgNoData('the season schedule');
    var id = isMLB() ? bestRecordId() : S.team, log = teamLog(all, id), labels = [], lastM = null;
    var vals = log.map(function (g, i) {
      var m = g.d.slice(5, 7); labels.push(m !== lastM ? new Date(g.d + 'T12:00:00').toLocaleString('en-US', { month: 'short' }) : ''); lastM = m;
      if (i < 9) return null;
      var w = 0; for (var k = i - 9; k <= i; k++) if (log[k].win) w++;
      return w / 10;
    });
    var size = lineSize(tv);
    return CH.lines({ labels: labels, series: [{ label: abbr(id), hi: true, vals: vals }], fmt: rate3, zero: 0.5, min: 0, max: 1, step: 0.2, w: size.w, h: size.h, aria: 'Rolling 10-game form' }) +
      (tv ? '' : legendHTML(nick(id) + (isMLB() ? ' · best record in MLB' : '') + ' · each point covers the previous 10 games'));
  }
  function homeAway(tv) {
    var all = seasonGames(); if (all === undefined) return msgLoading('every game this season');
    if (isErr(all) || !all.length) return msgNoData('the season schedule');
    var wins = S.data.windows, size = lineSize(tv), series;
    function pct(list, pick) { var w = 0, n = 0; list.forEach(function (g) { var r = pick(g); if (r == null) return; n++; if (r) w++; }); return n ? w / n : null; }
    if (isMLB()) {
      series = [{ label: 'Home teams', hi: true, vals: wins.map(function (w) { return pct(all.filter(function (g) { return inWindow(g.d, w); }), function (g) { return g.hs > g.as; }); }) }];
    } else {
      var log = teamLog(all, S.team);
      series = [
        { label: 'Home', hi: true, vals: wins.map(function (w) { return pct(log.filter(function (g) { return g.home && inWindow(g.d, w); }), function (g) { return g.win; }); }) },
        { label: 'Road', hi: true, dash: true, vals: wins.map(function (w) { return pct(log.filter(function (g) { return !g.home && inWindow(g.d, w); }), function (g) { return g.win; }); }) }
      ];
    }
    return CH.lines({ labels: wins.map(function (w) { return w.label; }), series: series, fmt: rate3, zero: 0.5, w: size.w, h: size.h, aria: 'Home and road winning percentage by month' }) +
      (tv ? '' : (isMLB() ? legendHTML('Home teams across MLB') : legendHTML(nick(S.team) + ' at home', '', '<span><i class="sw dash"></i>On the road</span>')));
  }
  function oneRun(tv) {
    var all = seasonGames(); if (all === undefined) return msgLoading('every game this season');
    if (isErr(all) || !all.length) return msgNoData('the season schedule');
    var wins = S.data.windows, size = lineSize(tv);
    function run(id) {
      var log = teamLog(all, id).filter(function (g) { return Math.abs(g.margin) === 1; });
      return { vals: wins.map(function (w) { var n = 0; log.forEach(function (g) { if (g.d <= w.end) n += g.win ? 1 : -1; }); return n; }), log: log };
    }
    var ids, hiId;
    if (isMLB()) {
      var ranked = X.TEAMS.map(function (t) { var r = run(t.id); return { id: t.id, v: r.vals[r.vals.length - 1] }; }).sort(function (a, b) { return b.v - a.v; });
      ids = ranked.slice(0, 3).concat(ranked.slice(-3)).map(function (x) { return x.id; }); hiId = ids[0];
    } else { ids = divTeams(team(S.team).div); hiId = S.team; }
    var series = ids.map(function (id) { var r = run(id), w = r.log.filter(function (g) { return g.win; }).length; return { label: abbr(id), endLabel: abbr(id) + ' ' + w + '–' + (r.log.length - w), hi: id === hiId, vals: r.vals }; });
    return CH.lines({ labels: wins.map(function (w) { return w.label; }), series: series, fmt: function (v) { return v === 0 ? '.500' : signed(v); }, zero: 0, ints: true, w: size.w, h: size.h, aria: 'One-run games' }) +
      (tv ? '' : legendHTML(nick(hiId), isMLB() ? 'Best and worst one-run records' : X.DIV_BY_ID[team(S.team).div].name + ' rivals'));
  }

  /* Monthly club stats (date-range requests per month) */
  function teamMonths() { var d = S.data; return need('months', function () { return API.teamMonths(d.season, d.windows); }); }
  function monthsGuard() {
    var M = teamMonths();
    if (M === undefined) return { html: msgLoading('club stats month by month') };
    if (isErr(M) || !M.length) return { html: msgNoData('monthly club stats') };
    return { M: M };
  }
  function rpgChart(tv) {
    var g = monthsGuard(); if (g.html) return g.html;
    var M = g.M, size = lineSize(tv);
    function rpg(st) { return st && st.gamesPlayed ? st.runs / st.gamesPlayed : null; }
    var avg = M.map(function (w) { var r = 0, n = 0; Object.keys(w.hit).forEach(function (id) { r += w.hit[id].runs || 0; n += w.hit[id].gamesPlayed || 0; }); return n ? r / n : null; });
    var series;
    if (isMLB()) {
      var tot = X.TEAMS.map(function (t) { return { id: t.id, r: M.reduce(function (a, w) { return a + ((w.hit[t.id] || {}).runs || 0); }, 0) }; }).sort(function (a, b) { return b.r - a.r; });
      var best = tot[0].id, worst = tot[tot.length - 1].id;
      series = [{ label: abbr(best), hi: true, vals: M.map(function (w) { return rpg(w.hit[best]); }) }, { label: abbr(worst), vals: M.map(function (w) { return rpg(w.hit[worst]); }) }, { label: 'MLB avg', ref: true, vals: avg }];
      return CH.lines({ labels: M.map(function (w) { return w.label; }), series: series, fmt: function (v) { return v.toFixed(2); }, w: size.w, h: size.h, aria: 'Runs per game by month' }) +
        (tv ? '' : legendHTML(nick(best) + ' · most runs scored', nick(worst) + ' · fewest runs scored', '<span><i class="sw ref"></i>MLB average</span>'));
    }
    var id = S.team;
    series = [{ label: 'Scored', hi: true, vals: M.map(function (w) { return rpg(w.hit[id]); }) }, { label: 'Allowed', hi: true, dash: true, vals: M.map(function (w) { return rpg(w.pit[id]); }) }, { label: 'MLB avg', ref: true, vals: avg }];
    return CH.lines({ labels: M.map(function (w) { return w.label; }), series: series, fmt: function (v) { return v.toFixed(2); }, w: size.w, h: size.h, aria: 'Runs scored and allowed per game by month' }) +
      (tv ? '' : legendHTML('Runs scored per game', '', '<span><i class="sw dash"></i>Runs allowed per game</span><span><i class="sw ref"></i>MLB average</span>'));
  }
  function monthlyTeamStat(tv, group, field, fmt, low, avgFn, label) {
    var g = monthsGuard(); if (g.html) return g.html;
    var M = g.M, size = lineSize(tv);
    var avg = M.map(function (w) { return avgFn(w[group]); });
    var ids = isMLB() ? bestBy(group === 'hit' ? 'hit:ops' : 'pit:era', 3, low) : [S.team];
    var series = ids.map(function (id, i) { return { label: abbr(id), hi: i === 0, vals: M.map(function (w) { var st = w[group][id]; return st && st[field] != null ? st[field] : null; }) }; });
    series.push({ label: 'MLB avg', ref: true, vals: avg });
    return CH.lines({ labels: M.map(function (w) { return w.label; }), series: series, fmt: fmt, w: size.w, h: size.h, aria: label + ' by month' }) +
      (tv ? '' : legendHTML(nick(ids[0]) + (isMLB() ? ' · best ' + label + ' this season' : ''), isMLB() ? 'Next two best' : '', '<span><i class="sw ref"></i>MLB average</span>'));
  }
  function hrRace(tv) {
    var g = monthsGuard(); if (g.html) return g.html;
    var M = g.M, size = lineSize(tv);
    function cum(id) { var t = 0; return M.map(function (w) { t += ((w.hit[id] || {}).homeRuns || 0); return t; }); }
    var ids, hiId;
    if (isMLB()) { ids = X.TEAMS.map(function (t) { var c = cum(t.id); return { id: t.id, v: c[c.length - 1] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6).map(function (x) { return x.id; }); hiId = ids[0]; }
    else { ids = divTeams(team(S.team).div); hiId = S.team; }
    return CH.lines({ labels: M.map(function (w) { return w.label; }), series: ids.map(function (id) { return { label: abbr(id), hi: id === hiId, vals: cum(id) }; }), fmt: function (v) { return String(Math.round(v)); }, min: 0, ints: true, w: size.w, h: size.h, aria: 'Team home run race' }) +
      (tv ? '' : legendHTML(nick(hiId), isMLB() ? 'Next five home run totals' : X.DIV_BY_ID[team(S.team).div].name + ' rivals'));
  }

  /* Player month-by-month races */
  function playerMonths(pid, group) { var d = S.data; return need('pm|' + pid + '|' + group, function () { return API.playerMonths(pid, group, d.season); }); }
  function cumulative(months, upto) {
    var c = { atBats: 0, hits: 0, baseOnBalls: 0, hitByPitch: 0, sacFlies: 0, totalBases: 0, earnedRuns: 0, inningsPitched: 0, strikeOuts: 0 };
    Object.keys(months).forEach(function (m) {
      if (+m > upto) return;
      var st = months[m];
      Object.keys(st).forEach(function (k) { c[k] = (c[k] || 0) + st[k]; });
    });
    return c;
  }
  function playerRace(players, group, valueFn, fmt, tv, aria, hiBest, low) {
    var wins = S.data.windows, size = lineSize(tv), loading = false, failed = false;
    var series = players.map(function (p) {
      var pm = playerMonths(p.pid, group);
      if (pm === undefined) { loading = true; return null; }
      if (isErr(pm)) { failed = true; return null; }
      return { label: lastName(p.name), vals: wins.map(function (w) { return valueFn(cumulative(pm, Math.max.apply(null, w.months))); }) };
    });
    if (loading) return msgLoading('month-by-month player stats');
    series = series.filter(Boolean);
    if (!series.length) return failed ? msgNoData('monthly player stats') : msgNoData('these players');
    var lastVal = function (s) { for (var i = s.vals.length - 1; i >= 0; i--) if (s.vals[i] != null) return s.vals[i]; return null; };
    var hiIdx = 0;
    if (hiBest) series.forEach(function (s, i) { var v = lastVal(s), b = lastVal(series[hiIdx]); if (v != null && (b == null || (low ? v < b : v > b))) hiIdx = i; });
    series[hiIdx].hi = true;
    return { html: CH.lines({ labels: wins.map(function (w) { return w.label; }), series: series, fmt: fmt, w: size.w, h: size.h, aria: aria }), hiName: series[hiIdx].label };
  }
  function lrace(tv) {
    var key = S.settings.blocks.raceStat, s = X.STAT_BY_KEY[key], field = X.COUNT_FIELDS[key];
    if (!s || !field) return msgNoData('this stat');
    var d = S.data, scope = S.team, pool = poolFor();
    var rows = need('lead5|' + scope + '|' + key + '|' + pool, function () { return API.leaders(d.season, key, { teamId: scope === 'MLB' ? null : scope, limit: 5, pool: pool, gameType: 'R' }); });
    if (rows === undefined) return msgLoading('the current leaders');
    if (isErr(rows) || !rows.length) return msgNoData(s.name + ' leaders');
    var players = rows.slice(0, 5).filter(function (r) { return r.pid; });
    var isIP = field === 'inningsPitched';
    var res = playerRace(players, s.group, function (c) { return field === '_xbh' ? (c.doubles || 0) + (c.triples || 0) + (c.homeRuns || 0) : (c[field] || 0); },
      isIP ? ipText : function (v) { return String(Math.round(v)); }, tv, s.name + ' leader race', true, /losses|blown|caughtStealing|groundInto/i.test(key));
    if (typeof res === 'string') return res;
    return res.html + (tv ? '' : legendHTML(res.hiName + ' · current leader', 'Rest of the top five'));
  }
  function trace(tv) {
    var key = S.settings.blocks.titleStat, s = X.STAT_BY_KEY[key], fn = X.RATE_FROM_PARTS[key];
    if (!s || !fn) return msgNoData('this stat');
    var d = S.data, scope = S.team;
    var q = need('lead5|' + scope + '|' + key + '|QUALIFIED', function () { return API.leaders(d.season, key, { teamId: scope === 'MLB' ? null : scope, limit: 5, pool: 'QUALIFIED', gameType: 'R' }); });
    if (q === undefined) return msgLoading('the current leaders');
    var rows = Array.isArray(q) ? q : [];
    if (rows.length < 2 && !isMLB()) {
      var a = need('lead5|' + scope + '|' + key + '|ALL', function () { return API.leaders(d.season, key, { teamId: scope, limit: 5, pool: 'ALL', gameType: 'R' }); });
      if (a === undefined) return msgLoading('the current leaders');
      if (Array.isArray(a)) rows = a;
    }
    if (!rows.length) return msgNoData(s.name + ' leaders');
    var low = s.group === 'pitching' && key !== 'pitching:strikeoutsPer9Inn' && key !== 'pitching:strikeoutWalkRatio';
    var fmt = s.group === 'hitting' ? rate3 : function (v) { return v.toFixed(2); };
    var res = playerRace(rows.slice(0, 5).filter(function (r) { return r.pid; }), s.group, fn, fmt, tv, s.name + ' title race', true, low);
    if (typeof res === 'string') return res;
    return res.html + (tv ? '' : legendHTML(res.hiName + ' · leads now', 'Rest of the top five'));
  }
  function hopsChart(tv) {
    var r = roster(S.team);
    if (r === undefined) return msgLoading('the roster');
    if (isErr(r)) return msgNoData('the roster');
    var players = r.hit.slice().sort(function (a, b) { return (b.stat.plateAppearances || 0) - (a.stat.plateAppearances || 0); }).slice(0, 5);
    var res = playerRace(players, 'hitting', X.RATE_FROM_PARTS['hitting:onBasePlusSlugging'], rate3, tv, 'Top hitters OPS by month', true, false);
    if (typeof res === 'string') return res;
    return res.html + (tv ? '' : legendHTML(res.hiName + ' · best OPS now', 'The five hitters with the most plate appearances'));
  }
  function reraChart(tv) {
    var r = roster(S.team);
    if (r === undefined) return msgLoading('the roster');
    if (isErr(r)) return msgNoData('the roster');
    var players = r.pit.filter(function (p) { return (p.stat.gamesStarted || 0) > 0; }).sort(function (a, b) { return (b.stat.gamesStarted || 0) - (a.stat.gamesStarted || 0); }).slice(0, 5);
    if (!players.length) return msgNoData('starting pitchers');
    var res = playerRace(players, 'pitching', X.RATE_FROM_PARTS['pitching:earnedRunAverage'], function (v) { return v.toFixed(2); }, tv, 'Rotation ERA by month', true, true);
    if (typeof res === 'string') return res;
    return res.html + (tv ? '' : legendHTML(res.hiName + ' · lowest ERA now', 'The five pitchers with the most starts'));
  }

  var FEATURE_META = {
    gap: { title: function () { return 'Race to October'; }, sub: function () { return 'Games above .500 · end of each month'; } },
    pct: { title: function () { return 'Race to October'; }, sub: function () { return 'Winning percentage · end of each month'; } },
    gb: { title: function () { return 'Race to October'; }, sub: function () { return 'Games back in the division · end of each month'; } },
    wc: { title: function () { return 'Race to October'; }, sub: function () { return 'Wild-card race · games above or below the last spot'; } },
    rank: { title: function () { return 'Race to October'; }, sub: function () { return 'Division standing · end of each month'; } },
    monthly: { title: function () { return 'Race to October'; }, sub: function () { return 'Winning percentage in each month on its own'; } },
    lrace: { title: function () { var s = X.STAT_BY_KEY[S.settings.blocks.raceStat]; return (s ? s.short : '') + ' race'; }, sub: function () { var s = X.STAT_BY_KEY[S.settings.blocks.raceStat]; return (s ? s.name : '') + ' · running total at each month’s end · top five'; } },
    trace: { title: function () { var s = X.STAT_BY_KEY[S.settings.blocks.titleStat]; return (s ? s.short : '') + ' title race'; }, sub: function () { var s = X.STAT_BY_KEY[S.settings.blocks.titleStat]; return 'Season-to-date ' + (s ? s.name.toLowerCase() : '') + ' at each month’s end'; } },
    rpg: { title: function () { return 'Runs per game'; }, sub: function () { return 'Scored and allowed in each month'; } },
    tops: { title: function () { return 'Team OPS by month'; }, sub: function () { return 'Each month on its own'; } },
    tera: { title: function () { return 'Team ERA by month'; }, sub: function () { return 'Each month on its own · lower is better'; } },
    hrrace: { title: function () { return 'Home run race'; }, sub: function () { return 'Team home runs · running total'; } },
    season: { title: function () { return 'Season in one picture'; }, sub: function () { return 'Every game · bar height = run margin'; } },
    form10: { title: function () { return 'Rolling 10-game form'; }, sub: function () { return 'Winning percentage over the previous 10 games'; } },
    homeaway: { title: function () { return 'Home vs. road'; }, sub: function () { return 'Winning percentage in each month'; } },
    onerun: { title: function () { return 'One-run games'; }, sub: function () { return 'Games above .500 in one-run games · running total'; } },
    hops: { title: function () { return 'Top hitters’ OPS'; }, sub: function () { return 'Season-to-date OPS at each month’s end'; } },
    rera: { title: function () { return 'Rotation ERA'; }, sub: function () { return 'Season-to-date ERA at each month’s end'; } }
  };
  var BUILDERS = {
    gap: function (tv) { return raceFamily('gap', tv); }, pct: function (tv) { return raceFamily('pct', tv); }, gb: function (tv) { return raceFamily('gb', tv); },
    wc: function (tv) { return raceFamily('wc', tv); }, rank: function (tv) { return raceFamily('rank', tv); }, monthly: function (tv) { return raceFamily('monthly', tv); },
    lrace: lrace, trace: trace, rpg: rpgChart,
    tops: function (tv) { return monthlyTeamStat(tv, 'hit', 'ops', rate3, false, function (g) { var v = Object.keys(g).map(function (id) { return g[id].ops; }).filter(function (x) { return x != null; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }, 'OPS'); },
    tera: function (tv) { return monthlyTeamStat(tv, 'pit', 'era', function (v) { return v.toFixed(2); }, true, function (g) { var er = 0, ip = 0; Object.keys(g).forEach(function (id) { er += g[id].earnedRuns || 0; ip += g[id].inningsPitched || 0; }); return ip ? 9 * er / ip : null; }, 'ERA'); },
    hrrace: hrRace, season: seasonBars, form10: formChart, homeaway: homeAway, onerun: oneRun, hops: hopsChart, rera: reraChart
  };
  function featureChart(tv) {
    var mode = S.settings.blocks.race;
    if (mode === 'hide' || !S.data) return null;
    var note = '';
    if (X.TEAM_ONLY_CHARTS[mode] && isMLB()) { note = 'Pick a team to see ' + FEATURE_META[mode].title().toLowerCase(); mode = 'gap'; }
    var meta = FEATURE_META[mode] || FEATURE_META.gap;
    var body;
    if (EXT_MODES[mode] && !isLive()) body = msgSnapshot();
    else if (EXT_MODES[mode] && !S.data.windows) body = msgNoData('the season calendar');
    else body = (BUILDERS[mode] || BUILDERS.gap)(tv) || msgNoData(meta.title());
    return { title: meta.title(), sub: meta.sub() + (note ? ' · ' + note : ''), body: body };
  }

  /* ───────── other dashboard sections ───────── */
  function standingsCardHTML(tv) {
    if (S.settings.blocks.standings === 'hide' || !S.data) return null;
    var d = S.data, rows, title, col;
    if (isMLB()) {
      title = 'Best records'; col = 'PCT';
      rows = topRecords(6).map(function (id) { var r = d.standings[id]; return { id: id, wl: r.w + '–' + r.l, ex: rate3(r.pct) }; });
    } else {
      var div = team(S.team).div; title = X.DIV_BY_ID[div].name; col = 'GB';
      rows = divTeams(div).filter(function (id) { return d.standings[id]; }).sort(function (a, b) { return d.standings[b].pct - d.standings[a].pct; })
        .map(function (id) { var r = d.standings[id]; return { id: id, wl: r.w + '–' + r.l, ex: r.gb === '-' || r.gb === 0 || r.gb === '0.0' ? '—' : r.gb }; });
    }
    var html = '<div class="st-row head"><span>Team</span><span>W–L</span><span>' + col + '</span></div>' + rows.map(function (r) {
      var t = X.TEAM_BY_ID[r.id];
      return '<div class="st-row' + (r.id === S.team ? ' me' : '') + '"><span class="st-name"><i style="background:' + t.primary + '"></i>' + esc(t.name) + '</span><span>' + r.wl + '</span><span>' + esc(r.ex) + '</span></div>';
    }).join('');
    return { title: title, body: html };
  }
  function leaderBodyHTML(statKey, kind, max) {
    var st = leaderState(statKey), s = X.STAT_BY_KEY[statKey];
    if (st.loading) return msgLoading('leaders');
    if (st.missing) return msgSnapshot();
    if (st.error) return msgNoData(s ? s.name + ' leaders' : 'this board');
    var rows = CH.orderRows(st.rows.slice(0, max || S.settings.limit));
    if (!rows.length) return '<div class="empty"><strong>No leaders yet</strong>No ' + (isMLB() ? '' : team(S.team).name + ' ') + 'players qualify for this stat. Try “All players” in Settings.</div>';
    var shares = CH.shares(rows), counts = {}, q = s && s.rate ? qualifier() : null, starred = false;
    rows.forEach(function (r) { counts[r.rank] = (counts[r.rank] || 0) + 1; });
    function rk(r) { return (counts[r.rank] > 1 ? 'T' : '') + r.rank; }
    function star(r) { if (q && r.pid && !q(s.rate, r.pid)) { starred = true; return '*'; } return ''; }
    var html;
    if (kind === 'feat') {
      html = '<div class="lb">' + rows.map(function (r, i) {
        return '<div class="lrow' + (i === 0 ? ' top' : '') + '"><span class="lrank">' + rk(r) + '</span><span class="lname"><span class="lbar" style="width:calc(var(--rk-off) + (100% - var(--rk-off) + var(--slant)) * ' + shares[i].toFixed(3) + ')"></span><b>' + esc(r.name) + star(r) + '</b><em>' + esc(abbr(r.teamId)) + '</em></span><span class="lval">' + esc(r.value) + '</span></div>';
      }).join('') + '</div>';
    } else {
      html = '<div class="bd-list">' + rows.map(function (r, i) {
        return '<div class="brow' + (i === 0 ? ' top' : '') + '"><div class="brow-top"><span title="' + esc(r.name + ' · ' + nick(r.teamId)) + '">' + esc(rk(r) + ' ' + shortName(r.name)) + star(r) + '</span><span>' + esc(r.value) + '</span></div><div class="btrack"><div class="bfill" style="width:' + Math.round(shares[i] * 100) + '%"></div></div></div>';
      }).join('') + '</div>';
    }
    return html + (starred ? '<div class="lb-note">* Not yet qualified (needs 3.1 plate appearances or 1 inning per team game)</div>' : '');
  }
  function clubsCardHTML() {
    var key = S.settings.blocks.clubs; if (!key || key === 'hide' || !S.data) return null;
    var m = X.METRIC_BY_KEY[key]; if (!m) return null;
    var d = S.data, on;
    if (isMLB()) {
      var alive = []; (d.series || []).forEach(function (s) { if (!s.over) { alive.push(s.a, s.b); } });
      if (!alive.length) alive = X.TEAMS.filter(function (t) { var r = d.standings[t.id]; return r && r.divRank === 1; }).map(function (t) { return t.id; });
      on = alive;
    } else on = [S.team];
    var items = X.TEAMS.map(function (t) { return { id: t.id, abbr: t.abbr, name: t.name, value: metricValue(t.id, key), text: metricText(t.id, key), on: on.indexOf(t.id) >= 0 }; });
    var vals = items.filter(function (i) { return i.value != null; });
    var mean = vals.length ? vals.reduce(function (a, i) { return a + i.value; }, 0) / vals.length : 0;
    var avgText = m.fmt === 'rate3' ? rate3(mean) : (m.fmt === 'dec2' ? mean.toFixed(2) : (m.fmt === 'signed' ? signed(Math.round(mean)) : String(Math.round(mean * 10) / 10)));
    var html = CH.clubs({ items: items, low: m.low, label: m.label, avgText: avgText });
    var legend = isMLB() ? ((d.series || []).some(function (s) { return !s.over; }) ? 'Still playing' : 'Division leaders') : team(S.team).name;
    return { title: m.label + ' · all 30 clubs', sub: m.low ? 'Above the line = better than average (lower is better)' : 'Above the line = better than the MLB average', legend: legend,
      body: html || (isLive() ? msgNoData(m.label) : msgSnapshot()) };
  }
  function upcoming(n) {
    var all = games().filter(function (g) { return g.state !== 'final' && (isMLB() || involves(g, S.team)); }).sort(byDate);
    return all.slice(0, n);
  }
  function gameCardHTML(g) {
    var cls = g.state === 'live' ? ' live' : (whenLabel(g) === 'Today' ? ' today' : '');
    var s = seriesFor(g), tbd = tbdGame(g);
    var hd = g.state === 'live' ? (g.sample ? 'Sample · ' : 'Live · ') + esc(g.inning || 'In progress') : esc(whenLabel(g) + ' · ' + timeLabel(g));
    var match = tbd ? esc(tbdMatchup(g)) : (g.state === 'live' ? abbr(g.away.id) + ' ' + g.away.score + ' <span class="at">·</span> ' + abbr(g.home.id) + ' ' + g.home.score : abbr(g.away.id) + ' <span class="at">at</span> ' + abbr(g.home.id));
    var line = [g.round ? shortRound(g.round) + (g.gameNum ? ' · Game ' + g.gameNum : '') : '', g.ifNec ? 'If necessary' : (s ? seriesText(s) : '')].filter(Boolean).join(' · ');
    var prob = g.probAway && g.probHome ? g.probAway + ' vs. ' + g.probHome : (g.state === 'pre' && !tbd ? 'Probable pitchers TBD' : '');
    return '<div class="game' + cls + '"><div class="game-hd"><span>' + hd + '</span><span>' + esc(g.tv) + '</span></div><div class="game-bd"><div class="game-m">' + match + '</div>' +
      (line ? '<div class="game-s">' + esc(line) + '</div>' : '') + (prob ? '<div class="game-p">' + esc(prob) + '</div>' : '') + '</div></div>';
  }
  function noGamesHTML() {
    var r = S.data && S.data.standings[S.team];
    if (!isMLB() && r && (S.data.phase === 'post' || S.data.phase === 'off')) return '<div class="card empty"><strong>Season complete</strong>' + esc(team(S.team).name) + ' finished ' + r.w + '–' + r.l + '. No games on the schedule this week.</div>';
    return '<div class="card empty"><strong>No games this week</strong>Check back when the schedule resumes.</div>';
  }

  function dashMainHTML() {
    if (!S.data) return '<div class="card loading">Loading the MLB Stats API</div>';
    var b = S.settings.blocks, out = [];
    var fc = featureChart(false), std = standingsCardHTML(false);
    if (fc || std) {
      out.push('<div class="row">' +
        (fc ? '<section class="card race" aria-label="' + esc(fc.title) + '"><div class="card-hd"><h2>' + esc(fc.title) + '</h2><span class="sub">' + esc(fc.sub) + '</span></div><div class="chart-body">' + fc.body + '</div></section>' : '') +
        (std ? '<section class="card standings" aria-label="Standings"><div class="card-hd"><h2>' + esc(std.title) + '</h2></div>' + std.body + '</section>' : '') + '</div>');
    }
    var feats = ['feat1', 'feat2'].filter(function (k) { return b[k] && b[k] !== 'hide'; });
    if (feats.length) {
      out.push('<section class="feat" aria-label="Featured leaders">' + feats.map(function (k) {
        var s = X.STAT_BY_KEY[b[k]]; if (!s) return '';
        return '<article class="card"><div class="card-hd"><h2>' + esc(s.short) + ' leaders</h2><span class="sub">' + esc(s.name) + '</span></div>' + leaderBodyHTML(b[k], 'feat') + '</article>';
      }).join('') + '</section>');
    }
    var boards = ['board1', 'board2', 'board3', 'board4', 'board5', 'board6'].filter(function (k) { return b[k] && b[k] !== 'hide'; });
    if (boards.length) {
      out.push('<section class="boards" aria-label="Leaderboards">' + boards.map(function (k) {
        var s = X.STAT_BY_KEY[b[k]]; if (!s) return '';
        return '<article class="card"><div class="bd-hd"><h3>' + esc(s.short) + '</h3><span>' + esc(s.name) + '</span></div>' + leaderBodyHTML(b[k], 'board') + '</article>';
      }).join('') + '</section>');
    }
    var clubs = clubsCardHTML();
    if (clubs) {
      out.push('<section class="card" aria-label="All clubs chart"><div class="card-hd"><h2>' + esc(clubs.title) + '</h2><span class="sub"><span class="legend" style="margin:0;color:inherit;font-size:inherit"><span><i class="sw sq"></i>' + esc(clubs.legend) + '</span></span></span></div>' +
        '<div class="clubs-scroll">' + clubs.body + '</div><div class="empty" style="padding-top:0">' + esc(clubs.sub) + '</div></section>');
    }
    if (b.upnext !== 'hide') {
      var up = upcoming(6);
      out.push('<section aria-label="Coming up" style="display:flex;flex-direction:column;gap:10px"><h2 class="sec-title">Coming up</h2>' +
        (up.length ? '<div class="games">' + up.map(gameCardHTML).join('') + '</div>' : noGamesHTML()) + '</section>');
    }
    out.push(footHTML());
    return out.join('');
  }
  function footHTML() {
    var d = S.data;
    var src = d && d.source === 'snapshot'
      ? 'Snapshot of MLB Stats API data · live data could not be reached here'
      : 'Data: MLB Stats API · ' + (S.settings.gameType === 'P' ? 'Postseason' : 'Regular season') + ' stats · stats refresh daily at 5 AM';
    return '<footer class="foot"><span>' + esc(src) + '</span><span>Times shown in your time zone</span></footer>';
  }

  /* ───────── TV layout ───────── */
  function tvBoards() { var b = S.settings.blocks; return ['feat1', 'feat2', 'board1', 'board2', 'board3', 'board4', 'board5', 'board6'].filter(function (k) { return b[k] && b[k] !== 'hide'; }); }
  function tvCharts() { var c = []; if (S.settings.blocks.race !== 'hide') c.push('race'); if (S.settings.blocks.clubs && S.settings.blocks.clubs !== 'hide') c.push('clubs'); return c; }
  function progressHTML(n, i) { if (n < 2) return ''; var h = '<div class="tv-progress" aria-hidden="true">'; for (var k = 0; k < n; k++) h += '<i class="' + (k === i ? 'on' : '') + '"></i>'; return h + '</div>'; }
  function tvChartPanelHTML() {
    var list = tvCharts(); if (!list.length) return '';
    var which = list[S.tv.chart % list.length];
    if (which === 'race') {
      var r = featureChart(true);
      return '<div class="card-hd"><h2>' + esc(r.title) + '</h2><span class="sub">' + esc(r.sub) + '</span></div><div class="tv-fill fade-in">' + r.body + '</div>' + progressHTML(list.length, S.tv.chart % list.length);
    }
    var c = clubsCardHTML();
    return '<div class="card-hd"><h2>' + esc(c.title) + '</h2><span class="sub">' + esc(c.legend) + ' highlighted</span></div><div class="tv-fill fade-in">' + c.body + '</div>' + progressHTML(list.length, S.tv.chart % list.length);
  }
  function tvBoardPanelHTML() {
    var list = tvBoards(); if (!list.length || !S.data) return '';
    var k = list[S.tv.board % list.length], s = X.STAT_BY_KEY[S.settings.blocks[k]];
    if (!s) return '';
    return '<div class="card-hd"><h2>' + esc(s.short) + ' leaders</h2><span class="sub">' + esc(s.name) + '</span></div><div class="tv-fill fade-in" style="padding:0">' + leaderBodyHTML(s.key, 'feat', Math.min(8, S.settings.limit)) + '</div>' + progressHTML(list.length, S.tv.board % list.length);
  }
  function tvGamesHTML() {
    var up = upcoming(5);
    if (!up.length) return '<div class="empty"><strong>No games this week</strong></div>';
    return '<div class="tv-games">' + up.map(function (g) {
      var s = seriesFor(g), tbd = tbdGame(g);
      var when = g.state === 'live' ? '<b>' + (g.sample ? 'Sample' : 'Live') + '</b>' + esc(g.inning) : '<b>' + esc(whenLabel(g)) + '</b>' + esc(timeLabel(g));
      var m = tbd ? esc(tbdMatchup(g)) : (g.state === 'live' ? abbr(g.away.id) + ' ' + g.away.score + ' · ' + abbr(g.home.id) + ' ' + g.home.score : abbr(g.away.id) + ' at ' + abbr(g.home.id));
      return '<div class="tv-game"><div class="when">' + when + '</div><div><div class="m">' + m + '</div><div class="s">' + esc([g.round ? shortRound(g.round) + (g.gameNum ? ' G' + g.gameNum : '') : '', g.ifNec ? 'If necessary' : (s ? seriesText(s) : ''), g.tv].filter(Boolean).join(' · ')) + '</div></div></div>';
    }).join('') + '</div>';
  }
  function tvStackHTML() {
    var std = standingsCardHTML(true);
    return (std ? '<section class="tv-panel" aria-label="Standings"><div class="card-hd"><h2>' + esc(std.title) + '</h2></div>' + std.body + '</section>' : '') +
      (S.settings.blocks.upnext !== 'hide' ? '<section class="tv-panel" aria-label="Coming up"><div class="card-hd"><h2>Coming up</h2></div>' + tvGamesHTML() + '</section>' : '');
  }
  function tvMainHTML() {
    if (!S.data) return '<div class="tv-main"><div class="tv-panel loading">Loading the MLB Stats API</div></div>';
    return '<div class="tv-main">' +
      '<section class="tv-panel" id="tv-chart" aria-label="Charts">' + tvChartPanelHTML() + '</section>' +
      '<section class="tv-panel" id="tv-board" aria-label="Leaders">' + tvBoardPanelHTML() + '</section>' +
      '<div class="tv-stack" id="tv-stack">' + tvStackHTML() + '</div></div>' +
      '<div class="tv-gear" id="tv-gear"><button type="button" data-act="fullscreen">Full screen</button><button type="button" data-act="open-settings">Settings</button><button type="button" data-act="exit-tv">Exit TV mode</button></div>';
  }
  function tvTick() {
    S.tv.board++; if (S.tv.board % 2 === 0) S.tv.chart++;
    var a = document.getElementById('tv-board'), c = document.getElementById('tv-chart');
    if (a) a.innerHTML = tvBoardPanelHTML();
    if (c && S.tv.board % 2 === 0) c.innerHTML = tvChartPanelHTML();
    CH.fitTV(document.getElementById('app'));
  }
  function startTV() {
    clearInterval(S.tv.timer);
    if (!isTV()) { releaseWake(); return; }
    S.tv.timer = setInterval(tvTick, Math.max(5, S.settings.tvRotate) * 1000);
    requestWake();
  }
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
  function statOptions(current, filter, allowHide) {
    var h = allowHide === false ? '' : '<option value="hide"' + (current === 'hide' ? ' selected' : '') + '>Hide this block</option>';
    X.STAT_GROUPS.forEach(function (g) {
      var list = X.STATS.filter(function (s) { return (s.pick || s.group) === g.id && (!filter || filter(s)); });
      if (!list.length) return;
      h += '<optgroup label="' + g.label + '">' + list.map(function (s) {
        return '<option value="' + s.key + '"' + (s.key === current ? ' selected' : '') + '>' + esc(s.short + ' · ' + s.name) + '</option>';
      }).join('') + '</optgroup>';
    });
    return h;
  }
  function metricOptions(current, allowHide, numericOnly) {
    var h = allowHide ? '<option value="hide"' + (current === 'hide' ? ' selected' : '') + '>Hide this block</option>' : '';
    X.METRIC_GROUPS.forEach(function (g) {
      h += '<optgroup label="' + g.label + '">';
      X.TEAM_METRICS.filter(function (m) { return m.src === g.src && (!numericOnly || ['record', 'streak', 'l10', 'home', 'away'].indexOf(m.fmt) < 0); }).forEach(function (m) {
        h += '<option value="' + m.key + '"' + (m.key === current ? ' selected' : '') + '>' + esc(m.label + ' (' + m.short + ')') + '</option>';
      });
      h += '</optgroup>';
    });
    return h;
  }
  function featureOptions(current) {
    return X.FEATURE_GROUPS.map(function (g) {
      return '<optgroup label="' + esc(g.label) + '">' + g.options.map(function (o) { return '<option value="' + o[0] + '"' + (current === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</optgroup>';
    }).join('') + '<option value="hide"' + (current === 'hide' ? ' selected' : '') + '>Hide this block</option>';
  }
  function pickerHTML(code, id, label, optionsHTML, extra) {
    return '<div class="pkr"><label for="pk-' + id + '"><span class="code">' + code + '</span>' + esc(label) + '</label><select class="set-select" id="pk-' + id + '" data-set="blocks.' + id + '" data-code="' + code + '">' + optionsHTML + '</select>' + (extra || '') + '</div>';
  }
  function settingsHTML() {
    var s = S.settings, b = s.blocks, t = team(S.team);
    var teamOpts = '<option value="MLB"' + (s.defaultTeam === 'MLB' ? ' selected' : '') + '>All MLB</option>' + X.DIVISIONS.map(function (dv) {
      return '<optgroup label="' + dv.name + '">' + X.TEAMS.filter(function (x) { return x.div === dv.id; }).map(function (x) {
        return '<option value="' + x.id + '"' + (String(s.defaultTeam) === String(x.id) ? ' selected' : '') + '>' + esc(x.full) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    function sel(id, key, opts) { return '<select class="set-select" id="' + id + '" data-set="' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(s[key]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
    var snapshot = S.data && S.data.source === 'snapshot';
    var map = '<div class="map" aria-hidden="true">' +
      '<div class="hdrblk span2">Header</div><div class="hdrblk span1" data-map="T1">T1</div><div class="hdrblk span1" data-map="T2">T2</div><div class="hdrblk span1" data-map="T3">T3</div><div class="hdrblk span1" data-map="T4">T4</div>' +
      '<div class="span4" data-map="R">R · Feature chart</div><div class="span2" data-map="S">S · Standings</div>' +
      '<div class="span3" data-map="F1">F1 · Featured</div><div class="span3" data-map="F2">F2 · Featured</div>' +
      '<div class="span1" data-map="B1">B1</div><div class="span1" data-map="B2">B2</div><div class="span1" data-map="B3">B3</div><div class="span1" data-map="B4">B4</div><div class="span1" data-map="B5">B5</div><div class="span1" data-map="B6">B6</div>' +
      '<div class="span6" data-map="C">C · All-clubs chart</div><div class="span6" data-map="U">U · Coming up</div></div>';
    var sub = '';
    if (b.race === 'lrace') sub = '<label class="sublabel" for="pk-raceStat">Stat for the leader race</label><select class="set-select" id="pk-raceStat" data-set="blocks.raceStat" data-code="R">' + statOptions(b.raceStat, function (x) { return X.COUNT_FIELDS[x.key]; }, false) + '</select>';
    if (b.race === 'trace') sub = '<label class="sublabel" for="pk-titleStat">Stat for the title race</label><select class="set-select" id="pk-titleStat" data-set="blocks.titleStat" data-code="R">' + statOptions(b.titleStat, function (x) { return X.RATE_FROM_PARTS[x.key]; }, false) + '</select>';
    if (X.TEAM_ONLY_CHARTS[b.race]) sub = '<span class="hint" style="font-size:13px;color:var(--muted)">Shows on team pages. The MLB page shows games above .500 instead.</span>';
    return '<div class="set-top"><div class="set-top-in"><h1>Settings</h1><div class="set-actions"><button type="button" class="btn-hdr" data-act="close-settings">Back to the board</button></div></div></div><div class="hdr-strip"></div>' +
      '<div class="set-wrap">' +
      '<section class="set-sec" aria-labelledby="sec-league"><div class="card-hd"><h2 id="sec-league">League</h2><span class="sub">Which board to show</span></div><div class="set-body">' +
      '<div class="field"><span class="flabel">League</span>' + segHTML('league', s.league, [['mlb', 'MLB'], ['college', 'College (D1)']]) + '<span class="hint">College mode covers NCAA Division I baseball: all of D1, each conference, and every D1 team. Display settings carry over.</span></div>' +
      '</div></section>' +
      '<section class="set-sec" aria-labelledby="sec-display"><div class="card-hd"><h2 id="sec-display">Display</h2><span class="sub">Saved in this browser</span></div><div class="set-body">' +
      '<div class="field"><span class="flabel">Theme</span>' + segHTML('theme', s.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) + '<span class="hint">Auto follows your device setting.</span></div>' +
      '<div class="field"><span class="flabel">Layout</span>' + segHTML('layout', s.layout, [['standard', 'Standard'], ['tv', 'TV']]) + '<span class="hint">TV fits a 16:9 screen with no scrolling, uses larger type, rotates leader boards and charts, and keeps the screen awake where the browser allows it.</span></div>' +
      '<div class="field"><label for="set-tvRotate">TV rotation</label>' + sel('set-tvRotate', 'tvRotate', [[8, 'Every 8 seconds'], [12, 'Every 12 seconds'], [20, 'Every 20 seconds'], [30, 'Every 30 seconds']]) + '<span class="hint">How long each leader board stays up in TV layout. Charts switch every second turn.</span></div>' +
      '<div class="field"><span class="flabel">Ticker</span>' + segHTML('ticker', s.ticker, [[true, 'On'], [false, 'Off']]) + '</div>' +
      '<div class="field"><span class="flabel">Ticker speed</span>' + segHTML('tickerSpeed', s.tickerSpeed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]) + '</div>' +
      '</div></section>' +
      '<section class="set-sec" aria-labelledby="sec-data"><div class="card-hd"><h2 id="sec-data">Data</h2><span class="sub">MLB Stats API</span></div><div class="set-body">' +
      '<div class="field"><label for="set-defaultTeam">Default team</label><select class="set-select" id="set-defaultTeam" data-set="defaultTeam">' + teamOpts + '</select><span class="hint">The board opens on this team. Changing it also switches the board now.</span></div>' +
      '<div class="field"><span class="flabel">Stats from</span>' + segHTML('gameType', s.gameType, [['R', 'Regular season'], ['P', 'Postseason']]) + '<span class="hint">Applies to leader boards and club stats. Standings and the feature chart always use the regular season.</span></div>' +
      '<div class="field"><label for="set-pool">MLB page player pool</label>' + sel('set-pool', 'pool', [['QUALIFIED', 'Qualified players'], ['ALL', 'All players'], ['ROOKIES', 'Rookies only']]) + '<span class="hint">Qualified means enough plate appearances or innings to rank in rate stats like AVG and ERA.</span></div>' +
      '<div class="field"><label for="set-teamPool">Team page player pool</label>' + sel('set-teamPool', 'teamPool', [['ALL', 'All players'], ['QUALIFIED', 'Qualified players'], ['ROOKIES', 'Rookies only']]) + '<span class="hint">With all players, rate-stat boards mark anyone not yet qualified with an asterisk.</span></div>' +
      '<div class="field"><span class="flabel">Leaders per board</span>' + segHTML('limit', s.limit, [[3, '3'], [5, '5'], [10, '10']]) + '</div>' +
      '<div class="field"><span class="flabel">Auto-refresh</span>' + segHTML('refresh', s.refresh, [[true, 'On'], [false, 'Off']]) + '<span class="hint">Scores check every minute while a game is live and wake up around each scheduled first pitch. Stats, standings and charts refresh once a day at 5 AM.</span></div>' +
      (snapshot ? '<div class="field"><span class="flabel">Sample live games</span>' + segHTML('sampleLive', s.sampleLive, [[false, 'Off'], [true, 'On']]) + '<span class="hint">Preview only. The board is showing a saved snapshot, so this adds two made-up in-progress scores to show how live games look in the ticker.</span></div>' : '') +
      '</div></section>' +
      '<section class="set-sec" aria-labelledby="sec-blocks"><div class="card-hd"><h2 id="sec-blocks">Blocks</h2><span class="sub">Choose what each block shows</span></div><div class="set-body">' + map +
      '<p class="set-note" style="margin:0">Leader boards can show any of the ' + (X.STATS.length - X.SABER_STATS.length) + ' player leaderboards the MLB Stats API ranks, across hitting, pitching, fielding and catching, plus ' + X.SABER_STATS.length + ' sabermetrics such as WAR, wOBA, wRC+ and FIP. Header tiles and the all-clubs chart use club stats. With a team selected, every block switches to that team.</p>' +
      '<h3 class="sec-title" style="font-size:22px">Header tiles</h3><div class="pickers">' +
      X.BLOCKS.tiles.map(function (k) { return pickerHTML(k.code, k.id, k.label, metricOptions(b[k.id], true, false)); }).join('') + '</div>' +
      '<h3 class="sec-title" style="font-size:22px">Charts and lists</h3><div class="pickers">' +
      pickerHTML('R', 'race', 'Feature chart', featureOptions(b.race), sub) +
      pickerHTML('S', 'standings', 'Standings', [['show', 'Show'], ['hide', 'Hide this block']].map(function (o) { return '<option value="' + o[0] + '"' + (b.standings === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')) +
      pickerHTML('C', 'clubs', 'All-clubs chart', metricOptions(b.clubs, true, true)) +
      pickerHTML('U', 'upnext', 'Coming up', [['show', 'Show'], ['hide', 'Hide this block']].map(function (o) { return '<option value="' + o[0] + '"' + (b.upnext === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')) + '</div>' +
      '<h3 class="sec-title" style="font-size:22px">Leader boards</h3><div class="pickers">' +
      X.BLOCKS.featured.concat(X.BLOCKS.boards).map(function (k) { return pickerHTML(k.code, k.id, k.label, statOptions(b[k.id])); }).join('') + '</div>' +
      '</div></section>' +
      '<div class="set-actions"><button type="button" class="btn primary" data-act="close-settings">Done</button>' +
      '<button type="button" class="btn' + (S.resetArmed ? ' warn' : '') + '" data-act="reset">' + (S.resetArmed ? 'Select again to reset everything' : 'Reset to defaults') + '</button>' +
      '<span class="set-note">Viewing: ' + esc(t.full) + '</span></div></div>';
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
    ensureLeaders();
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
    var main = document.getElementById('main');
    if (main) main.innerHTML = dashMainHTML(); else render();
  }
  function refreshStatus() {
    if (S.stopped) return;
    var st = document.getElementById('hdr-status'); if (st) st.innerHTML = statusHTML();
    var tl = document.getElementById('tiles'); if (tl) tl.innerHTML = tilesHTML();
  }
  function refreshAll() { if (S.view === 'dash') { refreshStatus(); refreshTicker(); refreshMain(); ensureLeaders(); } }

  /* ───────── events ───────── */
  function setTeam(v) {
    S.team = v === 'MLB' ? 'MLB' : parseInt(v, 10);
    S.tv.board = 0; S.tv.chart = 0; TK.x = 0;
    render();
  }
  function setSetting(path, raw) {
    var val = raw;
    if (raw === 'true') val = true; else if (raw === 'false') val = false;
    else if (/^\d+$/.test(raw) && ['limit', 'tvRotate'].indexOf(path) >= 0) val = parseInt(raw, 10);
    var prevGameType = S.settings.gameType;
    if (path === 'league') {
      if (val === 'college') {
        S.settings.league = 'college'; saveSettings();
        X.switchLeague('college');
      }
      return;
    }
    if (path.indexOf('blocks.') === 0) S.settings.blocks[path.slice(7)] = val; else S.settings[path] = val;
    if (path === 'defaultTeam') S.team = val === 'MLB' ? 'MLB' : parseInt(val, 10);
    if (path === 'layout' && val === 'tv') S.tickPaused = false;
    saveSettings();
    if (path === 'gameType' && val !== prevGameType && isLive()) {
      S.leaders = {};
      API.teamStats(S.data.season, val).then(function (ts) { S.data.teamStats = ts; refreshAll(); }).catch(function () {});
    }
    if (path === 'refresh') { scheduleScores(); scheduleDaily(); }
    S.resetArmed = false;
    render();
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
      S.settings = clone(X.DEFAULT_SETTINGS); S.team = 'MLB'; S.resetArmed = false; saveSettings(); render();
    }
    else if (act === 'exit-tv') setSetting('layout', 'standard');
    else if (act === 'fullscreen') { var r = document.documentElement; if (r.requestFullscreen) r.requestFullscreen().catch(function () {}); }
  }
  function onChange(e) {
    var t = e.target;
    if (t.getAttribute('data-act') === 'team') { setTeam(t.value); return; }
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
  function boot(opts) {
    S.stopped = false;
    S.settings = loadSettings();
    S.settings.league = 'mlb';
    saveSettings();
    S.team = S.settings.defaultTeam === 'MLB' ? 'MLB' : parseInt(S.settings.defaultTeam, 10) || 'MLB';
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) S.tickPaused = true; } catch (e) { /* ignore */ }
    if (location.hash === '#settings' || (opts && opts.view === 'settings')) S.view = 'settings';
    var app = document.getElementById('app');
    app.addEventListener('click', onClick);
    app.addEventListener('change', onChange);
    app.addEventListener('focusin', onFocus);
    var tv = function () { if (!S.stopped && isTV()) pokeIdle(); };
    if (!docBound) {
      docBound = true;
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
  function onVisible() {
      if (S.stopped || document.visibilityState !== 'visible') return;
      if (isTV()) requestWake();
      if (isLive() && S.settings.refresh && S.nextDailyAt && Date.now() >= S.nextDailyAt) dailyReload();
  }
  X.App = { state: S, render: render, boot: boot, stop: stop };
  /* Switch boards in place: stop the running one, swap in a fresh #app (dropping its listeners), boot the other. */
  X.switchLeague = function (to) {
    var from = to === 'college' ? X.App : X.CollegeApp, next = to === 'college' ? X.CollegeApp : X.App;
    if (!next) return;
    if (from && from.stop) from.stop();
    var old = document.getElementById('app'), fresh = old.cloneNode(false);
    old.parentNode.replaceChild(fresh, old);
    try { window.scrollTo(0, 0); history.replaceState(null, '', location.pathname + location.search.replace(/([?&])league=[^&]*&?/, '$1').replace(/[?&]$/, '') + '#settings'); } catch (e) { /* ignore */ }
    next.boot({ view: 'settings' });
  };
  if (!X.currentLeague || X.currentLeague() !== 'college') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
})();
