/* MLB Live Board — app: state, data loading, rendering, ticker, settings, TV mode. */
(function () {
  'use strict';
  var X = window.MLBX, API = X.API, CH = X.Charts;
  var esc = CH.esc, rate3 = CH.rate3, signed = CH.signed;
  var LS_KEY = 'mlb-live-board:settings';

  var S = {
    settings: null, team: 'MLB', view: 'dash', data: null, leaders: {}, pending: {},
    tickPaused: false, tv: { chart: 0, board: 0, timer: null }, timers: {}, wake: null, loadError: null, resetArmed: false
  };
  var TK = { x: 0, last: null, raf: null, hover: false };

  /* ───────── utilities ───────── */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function team(id) { return id === 'MLB' ? X.LEAGUE : X.TEAM_BY_ID[id]; }
  function abbr(id) { var t = X.TEAM_BY_ID[id]; return t ? t.abbr : '—'; }
  function nick(id) { var t = X.TEAM_BY_ID[id]; return t ? t.name : '—'; }
  function shortName(n) { var p = String(n).split(' '); return p.length > 1 ? p[0].charAt(0) + '. ' + p.slice(1).join(' ') : n; }
  function shortRound(r) {
    if (!r) return '';
    var m = { 'Division Series': 'DS', 'Championship Series': 'CS', 'Wild Card Series': 'WC' };
    if (/World Series/i.test(r)) return 'World Series';
    var lg = /^(AL|NL|American|National)/.exec(r);
    var L = lg ? (lg[1] === 'American' ? 'AL' : lg[1] === 'National' ? 'NL' : lg[1]) : '';
    for (var k in m) if (r.indexOf(k) >= 0) return k === 'Wild Card Series' ? L + ' Wild Card' : L + m[k];
    return r;
  }
  function nowDate() { return S.data && S.data.source === 'snapshot' ? new Date(S.data.now) : new Date(); }
  function dayKey(d) { return API.ymd(d); }
  function whenLabel(g) {
    var d = new Date(g.date), n = nowDate();
    var dk = dayKey(d), today = dayKey(n);
    var tm = new Date(n.getTime() + 86400000);
    if (dk === today) return 'Today';
    if (dk === dayKey(tm)) return 'Tomorrow';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function timeLabel(g) {
    if (g.tbd) return 'Time TBD';
    return new Date(g.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }
  function isMLB() { return S.team === 'MLB'; }
  function involves(g, id) { return g.away.id === id || g.home.id === id; }

  /* ───────── settings ───────── */
  function mergeSettings(saved) {
    var s = clone(X.DEFAULT_SETTINGS);
    if (!saved || typeof saved !== 'object') return s;
    Object.keys(s).forEach(function (k) { if (k !== 'blocks' && saved[k] !== undefined) s[k] = saved[k]; });
    if (saved.blocks) Object.keys(s.blocks).forEach(function (k) { if (saved.blocks[k] !== undefined) s.blocks[k] = saved.blocks[k]; });
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
      standings: sn.standings, teamStats: sn.teamStats, race: sn.race, games: sn.games, series: sn.series, snapLeaders: sn.leaders };
  }
  function phaseFor(info, d) {
    var t = dayKey(d);
    if (!info) return 'regular';
    if (t < info.start) return 'pre';
    if (t <= info.end) return 'regular';
    if (info.postStart && t >= info.postStart && (!info.postEnd || t <= info.postEnd)) return 'post';
    return 'off';
  }
  function loadLive() {
    var today = new Date(), year = today.getFullYear();
    return API.season(year).then(function (info) {
      if (!info || dayKey(today) < info.start) return API.season(year - 1);
      return info;
    }).then(function (info) {
      if (!info) throw new Error('No season calendar returned');
      var start = dayKey(new Date(today.getTime() - 3 * 86400000)), end = dayKey(new Date(today.getTime() + 6 * 86400000));
      return Promise.all([
        API.standings(info.year),
        API.teamStats(info.year, S.settings.gameType),
        API.schedule(start, end).catch(function () { return []; })
      ]).then(function (r) {
        S.data = { source: 'live', asOf: new Date().toISOString(), now: null, season: info.year, info: info, phase: phaseFor(info, today),
          standings: r[0], teamStats: r[1], games: r[2], series: API.seriesFromGames(r[2]), race: null };
        loadRace();
      });
    });
  }
  function loadRace() {
    var d = S.data;
    if (!d || d.source !== 'live' || !d.info) return;
    var end = dayKey(new Date()) < d.info.end ? dayKey(new Date()) : d.info.end;
    API.race(d.season, d.info.start, end).then(function (race) { d.race = race; refreshMain(); }).catch(function () { d.race = { failed: true }; refreshMain(); });
  }
  function refreshSchedule() {
    var d = S.data; if (!d || d.source !== 'live') return Promise.resolve();
    var today = new Date();
    var start = dayKey(new Date(today.getTime() - 3 * 86400000)), end = dayKey(new Date(today.getTime() + 6 * 86400000));
    return API.schedule(start, end).then(function (games) {
      d.games = games; d.series = API.seriesFromGames(games); d.asOf = new Date().toISOString();
      refreshTicker(); refreshMain(); refreshStatus();
    }).catch(function () { /* keep the last good schedule */ });
  }
  function refreshStats() {
    var d = S.data; if (!d || d.source !== 'live') return;
    Promise.all([API.standings(d.season), API.teamStats(d.season, S.settings.gameType)]).then(function (r) {
      d.standings = r[0]; d.teamStats = r[1]; d.asOf = new Date().toISOString();
      S.leaders = {}; refreshAll();
    }).catch(function () { /* retry next cycle */ });
  }
  function scheduleRefresh() {
    clearTimeout(S.timers.sched); clearInterval(S.timers.stats);
    if (!S.settings.refresh || !S.data || S.data.source !== 'live') return;
    var anyLive = S.data.games.some(function (g) { return g.state === 'live'; });
    S.timers.sched = setTimeout(function () { refreshSchedule().then(scheduleRefresh); }, anyLive ? 30000 : 300000);
    S.timers.stats = setInterval(refreshStats, 15 * 60000);
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

  /* ───────── leaders ───────── */
  function leaderKey(scope, statKey) {
    var s = S.settings;
    return [scope, statKey, scope === 'MLB' ? s.pool : s.teamPool, s.gameType, s.limit].join('|');
  }
  function leaderState(statKey) {
    var scope = S.team, d = S.data;
    if (!d) return { loading: true };
    if (d.source === 'snapshot') {
      var sc = d.snapLeaders[scope === 'MLB' ? 'MLB' : String(scope)];
      var rows = sc && sc[statKey];
      if (!rows) return { missing: true };
      return { rows: rows.slice(0, S.settings.limit) };
    }
    var k = leaderKey(scope, statKey);
    return S.leaders[k] || { loading: true };
  }
  function activeLeaderStats() {
    var b = S.settings.blocks, out = [];
    ['feat1', 'feat2', 'board1', 'board2', 'board3', 'board4', 'board5', 'board6'].forEach(function (id) { if (b[id] && b[id] !== 'hide' && out.indexOf(b[id]) < 0) out.push(b[id]); });
    return out;
  }
  function ensureLeaders() {
    var d = S.data; if (!d || d.source !== 'live') return;
    var scope = S.team;
    activeLeaderStats().forEach(function (statKey) {
      var k = leaderKey(scope, statKey);
      if (S.leaders[k] || S.pending[k]) return;
      S.pending[k] = true;
      API.leaders(d.season, statKey, { teamId: scope === 'MLB' ? null : scope, limit: S.settings.limit, pool: scope === 'MLB' ? S.settings.pool : S.settings.teamPool, gameType: S.settings.gameType })
        .then(function (rows) { S.leaders[k] = { rows: rows.slice(0, S.settings.limit) }; })
        .catch(function () { S.leaders[k] = { error: true }; })
        .then(function () { delete S.pending[k]; queueMainRefresh(); });
    });
  }
  var mainQueued = false;
  function queueMainRefresh() { if (mainQueued) return; mainQueued = true; setTimeout(function () { mainQueued = false; refreshMain(); }, 60); }

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

  /* ───────── header ───────── */
  function contextLine() {
    var d = S.data; if (!d) return 'Loading';
    var season = d.season, g = games();
    if (d.phase === 'post') {
      var cur = g.filter(function (x) { return x.post && x.state !== 'final'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
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
      if (!rk || !rk.best) return '<div class="tile"><span class="tile-k">' + esc(m.label) + '</span><span class="tile-v">—</span><span class="tile-s">Not in this data</span></div>';
      var best = rk.best.id;
      return '<div class="tile"><span class="tile-k">' + esc(m.fmt === 'record' ? 'Best record' : m.label) + '</span><span class="tile-v">' + esc(abbr(best) + ' · ' + metricText(best, key)) + '</span><span class="tile-s">' + esc(nick(best)) + ' lead MLB</span></div>';
    }
    var id = S.team, txt = metricText(id, key), sub = '';
    if (m.fmt === 'record') {
      var r = S.data.standings[id] || {};
      sub = r.divRank ? ord(r.divRank) + ' in the ' + X.DIV_BY_ID[team(id).div].name + (r.gb && r.gb !== '-' ? ' · ' + r.gb + ' GB' : '') : '';
    } else {
      var rr = metricRank(id, key);
      sub = rr ? (rr.tie ? 'T-' : '') + ord(rr.rank) + ' of ' + rr.of + ' in MLB' : 'Not in this data';
    }
    return '<div class="tile"><span class="tile-k">' + esc(m.label) + '</span><span class="tile-v">' + esc(txt) + '</span><span class="tile-s">' + esc(sub) + '</span></div>';
  }
  function tilesHTML() {
    return ['tile1', 'tile2', 'tile3', 'tile4'].map(function (k) { var v = S.settings.blocks[k]; return v && v !== 'hide' ? tileHTML(v) : ''; }).join('');
  }
  function tickerShellHTML() {
    if (!S.settings.ticker) return '';
    return '<div class="ticker" aria-label="Scores and schedule ticker">' +
      '<div class="tk-label" id="tk-label">' + esc(tickerLabel()) + '</div>' +
      '<button type="button" class="tk-btn" data-act="tk-toggle" aria-label="' + (S.tickPaused ? 'Play ticker' : 'Pause ticker') + '">' +
      (S.tickPaused ? '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>'
        : '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"><line x1="8" y1="5" x2="8" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line></svg>') +
      '</button><div class="tk-view' + (S.tickPaused ? ' paused' : '') + '" id="tk-view"><div class="tk-track" id="tk-track">' + tickerItemsHTML() + '</div></div></div>';
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
  function tickerLabel() {
    if (games().some(function (g) { return g.state === 'live'; })) return S.data && S.data.source === 'snapshot' ? 'Live · sample' : 'Live';
    return 'On deck';
  }
  function seriesFor(g) {
    var ids = [g.away.id, g.home.id];
    return (S.data.series || []).filter(function (s) { return ids.indexOf(s.a) >= 0 && ids.indexOf(s.b) >= 0; })[0] || null;
  }
  function seriesText(s) {
    if (!s) return '';
    if (s.aw === s.bw) return 'Series tied ' + s.aw + '–' + s.bw;
    var lead = s.aw > s.bw ? s.a : s.b, hi = Math.max(s.aw, s.bw), lo = Math.min(s.aw, s.bw);
    return abbr(lead) + (s.over || hi >= s.need ? ' wins ' : ' leads ') + hi + '–' + lo;
  }
  function tickerItems() {
    var all = games().slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var live = all.filter(function (g) { return g.state === 'live'; });
    var next = all.filter(function (g) { return g.state === 'pre' && !g.ifNec && g.detailed !== 'Postponed'; });
    var finals = all.filter(function (g) { return g.state === 'final'; }).reverse();
    var series = (S.data.series || []).filter(function (s) { return !s.over; });
    var out = [];
    function sec(title, arr) { if (!arr.length) return; out.push({ k: 'head', text: title }); arr.forEach(function (i) { out.push(i); }); }
    function L(g) { return { k: 'live', g: g }; }
    function N(g) { return { k: 'next', g: g }; }
    function F(g) { return { k: 'final', g: g }; }
    function SR(s) { return { k: 'series', s: s }; }
    if (isMLB()) {
      sec('Live', live.map(L));
      sec('Up next', next.slice(0, 6).map(N));
      sec(series.length && series[0].round ? series[0].round.replace(/^(AL|NL)\s+/, '') : 'Series', series.map(SR));
      sec('Final', finals.slice(0, 6).map(F));
    } else {
      var id = S.team;
      var mine = live.filter(function (g) { return involves(g, id); }).map(L)
        .concat(series.filter(function (s) { return s.a === id || s.b === id; }).map(SR))
        .concat(next.filter(function (g) { return involves(g, id); }).slice(0, 2).map(N))
        .concat(finals.filter(function (g) { return involves(g, id); }).slice(0, 2).map(F));
      if (!mine.length) {
        var r = S.data.standings[id];
        mine = [{ k: 'note', text: S.data.phase === 'post' || S.data.phase === 'off' ? 'Season complete' + (r ? ' · ' + r.w + '–' + r.l : '') : 'No games in the next few days' }];
      }
      sec(team(id).name, mine);
      sec('Around the league', live.filter(function (g) { return !involves(g, id); }).map(L)
        .concat(next.filter(function (g) { return !involves(g, id); }).slice(0, 3).map(N))
        .concat(series.filter(function (s) { return s.a !== id && s.b !== id; }).map(SR))
        .concat(finals.filter(function (g) { return !involves(g, id); }).slice(0, 2).map(F)));
    }
    if (!out.length) out.push({ k: 'note', text: 'No games scheduled this week' });
    return out;
  }
  function tickItemHTML(it) {
    if (it.k === 'head') return '<div class="tk-item head">' + esc(it.text) + '</div>';
    if (it.k === 'note') return '<div class="tk-item"><span class="tk-team win">' + esc(it.text) + '</span></div>';
    if (it.k === 'series') {
      var s = it.s;
      function pips(w) { var h = ''; for (var i = 0; i < s.need; i++) h += '<span class="pip' + (i < w ? ' on' : '') + '"></span>'; return h; }
      return '<div class="tk-item"><span class="tk-sub">' + esc(shortRound(s.round)) + '</span><span class="tk-team win">' + abbr(s.a) + '</span><span class="pips" aria-label="' + s.aw + ' wins">' + pips(s.aw) + '</span>' +
        '<span class="tk-team win">' + abbr(s.b) + '</span><span class="pips" aria-label="' + s.bw + ' wins">' + pips(s.bw) + '</span><span class="tk-sub">' + esc(seriesText(s)) + '</span></div>';
    }
    var g = it.g, a = abbr(g.away.id), h = abbr(g.home.id);
    if (it.k === 'live') {
      var aw = g.away.score > g.home.score, hw = g.home.score > g.away.score;
      return '<div class="tk-item"><span class="tk-live">' + (g.sample ? 'Sample' : 'Live') + '</span><span class="tk-team' + (aw ? ' win' : '') + '">' + a + ' ' + g.away.score + '</span>' +
        '<span class="tk-team' + (hw ? ' win' : '') + '">' + h + ' ' + g.home.score + '</span><span class="tk-sub">' + esc([g.inning, g.outs != null ? g.outs + (g.outs === 1 ? ' out' : ' outs') : '', g.tv].filter(Boolean).join(' · ')) + '</span></div>';
    }
    if (it.k === 'final') {
      var aW = g.away.score > g.home.score;
      return '<div class="tk-item"><span class="tk-final">Final</span><span class="tk-team ' + (aW ? 'win' : 'lose') + '">' + a + ' ' + g.away.score + '</span><span class="tk-team ' + (aW ? 'lose' : 'win') + '">' + h + ' ' + g.home.score + '</span>' +
        '<span class="tk-sub">' + esc([g.round ? shortRound(g.round) + (g.gameNum ? ' G' + g.gameNum : '') : '', new Date(g.date).toLocaleDateString([], { weekday: 'short' })].filter(Boolean).join(' · ')) + '</span></div>';
    }
    var prob = g.probAway && g.probHome ? g.probAway.split(' ').slice(-1)[0] + ' vs. ' + g.probHome.split(' ').slice(-1)[0] : '';
    return '<div class="tk-item"><span class="tk-when">' + esc(whenLabel(g) + ' ' + timeLabel(g)) + '</span><span class="tk-team win">' + a + ' <span class="tk-at">at</span> ' + h + '</span>' +
      '<span class="tk-sub">' + esc([g.round ? shortRound(g.round) + (g.gameNum ? ' G' + g.gameNum : '') : '', g.tv, prob].filter(Boolean).join(' · ')) + '</span></div>';
  }
  function tickerItemsHTML() {
    if (!S.data) return '<div class="tk-copy"><div class="tk-item">Loading scores</div></div>';
    var inner = tickerItems().map(tickItemHTML).join('');
    return '<div class="tk-copy">' + inner + '</div><div class="tk-copy" aria-hidden="true">' + inner + '</div>';
  }
  function refreshTicker() {
    var tr = document.getElementById('tk-track'), lb = document.getElementById('tk-label');
    if (tr) tr.innerHTML = tickerItemsHTML();
    if (lb) lb.textContent = tickerLabel();
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
  }

  /* ───────── dashboard sections ───────── */
  function raceSeries() {
    var d = S.data, race = d.race;
    if (!race || !race.pts) return null;
    var ids;
    if (isMLB()) {
      ids = X.TEAMS.map(function (t) { return t.id; }).filter(function (id) { return d.standings[id]; })
        .sort(function (a, b) { return d.standings[b].pct - d.standings[a].pct; }).slice(0, 6);
    } else {
      var div = team(S.team).div;
      ids = X.TEAMS.filter(function (t) { return t.div === div; }).map(function (t) { return t.id; });
    }
    var metric = S.settings.blocks.race;
    var hiId = isMLB() ? ids[0] : S.team;
    return { ids: ids, hiId: hiId, series: ids.map(function (id) {
      return { id: id, abbr: abbr(id), hi: id === hiId, vals: (race.pts[id] || []).map(function (p, i) {
        if (!p) return null;
        if (metric === 'pct') return p[0] + p[1] ? p[0] / (p[0] + p[1]) : (i === 0 ? 0.5 : null);
        return p[0] - p[1];
      }) };
    }) };
  }
  function raceCardHTML(tv) {
    var mode = S.settings.blocks.race; if (mode === 'hide') return '';
    var d = S.data, sub = mode === 'pct' ? 'Winning percentage · end of each month' : 'Games above .500 · end of each month';
    var body;
    if (!d || !d.race) body = '<div class="loading">Loading month-by-month standings</div>';
    else if (d.race.failed) body = '<div class="empty"><strong>Chart unavailable</strong>Month-end standings did not load. They will retry on the next refresh.</div>';
    else {
      var rs = raceSeries();
      body = CH.race({ labels: d.race.labels, series: rs.series, metric: mode, aria: 'Season race: ' + sub, w: tv ? 560 : 760, h: tv ? 500 : 330 }) +
        (tv ? '' : '<div class="legend"><span><i class="sw"></i>' + esc(nick(rs.hiId) + (isMLB() ? ' · best record' : '')) + '</span><span><i class="sw gray"></i>' + esc(isMLB() ? 'Next five best records' : X.DIV_BY_ID[team(S.team).div].name + ' rivals') + '</span></div>');
    }
    return { title: 'Race to October', sub: sub, body: body };
  }
  function standingsCardHTML(tv) {
    if (S.settings.blocks.standings === 'hide' || !S.data) return null;
    var d = S.data, rows, title, col;
    if (isMLB()) {
      title = 'Best records'; col = 'PCT';
      rows = X.TEAMS.filter(function (t) { return d.standings[t.id]; }).sort(function (a, b) { return d.standings[b.id].pct - d.standings[a.id].pct; }).slice(0, tv ? 8 : 6)
        .map(function (t) { var r = d.standings[t.id]; return { id: t.id, wl: r.w + '–' + r.l, ex: rate3(r.pct) }; });
    } else {
      var div = team(S.team).div; title = X.DIV_BY_ID[div].name; col = 'GB';
      rows = X.TEAMS.filter(function (t) { return t.div === div && d.standings[t.id]; }).sort(function (a, b) { return d.standings[b.id].pct - d.standings[a.id].pct; })
        .map(function (t) { var r = d.standings[t.id]; return { id: t.id, wl: r.w + '–' + r.l, ex: r.gb === '-' || r.gb === 0 || r.gb === '0.0' ? '—' : r.gb }; });
    }
    var html = '<div class="st-row head"><span>Team</span><span>W–L</span><span>' + col + '</span></div>' + rows.map(function (r) {
      var t = X.TEAM_BY_ID[r.id];
      return '<div class="st-row' + (r.id === S.team ? ' me' : '') + '"><span class="st-name"><i style="background:' + t.primary + '"></i>' + esc(t.name) + '</span><span>' + r.wl + '</span><span>' + esc(r.ex) + '</span></div>';
    }).join('');
    return { title: title, body: html };
  }
  function leaderBodyHTML(statKey, kind, max) {
    var st = leaderState(statKey);
    if (st.loading) return '<div class="loading">Loading leaders</div>';
    if (st.missing) return '<div class="empty"><strong>Live data board</strong>This stat loads from the MLB Stats API when the board is online.</div>';
    if (st.error) return '<div class="empty"><strong>Didn’t load</strong>The MLB Stats API didn’t answer for this board. It retries on the next refresh.</div>';
    var rows = st.rows.slice(0, max || S.settings.limit);
    if (!rows.length) return '<div class="empty"><strong>No leaders yet</strong>No ' + (isMLB() ? '' : team(S.team).name + ' ') + 'players qualify for this stat. Try “All players” in Settings.</div>';
    var shares = CH.shares(rows), counts = {};
    rows.forEach(function (r) { counts[r.rank] = (counts[r.rank] || 0) + 1; });
    function rk(r) { return (counts[r.rank] > 1 ? 'T' : '') + r.rank; }
    if (kind === 'feat') {
      return '<div class="lb">' + rows.map(function (r, i) {
        return '<div class="lrow' + (i === 0 ? ' top' : '') + '"><span class="lrank">' + rk(r) + '</span><span class="lname"><span class="lbar" style="width:' + Math.round(shares[i] * 100) + '%"></span><b>' + esc(r.name) + '</b><em>' + esc(abbr(r.teamId)) + '</em></span><span class="lval">' + esc(r.value) + '</span></div>';
      }).join('') + '</div>';
    }
    return '<div class="bd-list">' + rows.map(function (r, i) {
      return '<div class="brow' + (i === 0 ? ' top' : '') + '"><div class="brow-top"><span title="' + esc(r.name + ' · ' + nick(r.teamId)) + '">' + esc(rk(r) + ' ' + shortName(r.name)) + '</span><span>' + esc(r.value) + '</span></div><div class="btrack"><div class="bfill" style="width:' + Math.round(shares[i] * 100) + '%"></div></div></div>';
    }).join('') + '</div>';
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
      body: html || '<div class="empty"><strong>No data</strong>' + esc(m.label) + ' is not in this data set.</div>' };
  }
  function upcoming(n) {
    var all = games().filter(function (g) { return g.state !== 'final' && (isMLB() || involves(g, S.team)); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return all.slice(0, n);
  }
  function gameCardHTML(g) {
    var cls = g.state === 'live' ? ' live' : (whenLabel(g) === 'Today' ? ' today' : '');
    var s = seriesFor(g);
    var hd = g.state === 'live' ? (g.sample ? 'Sample · ' : 'Live · ') + esc(g.inning || 'In progress') : esc(whenLabel(g) + ' · ' + timeLabel(g));
    var match = g.state === 'live' ? abbr(g.away.id) + ' ' + g.away.score + ' <span class="at">·</span> ' + abbr(g.home.id) + ' ' + g.home.score : abbr(g.away.id) + ' <span class="at">at</span> ' + abbr(g.home.id);
    var line = [g.round ? shortRound(g.round) + (g.gameNum ? ' · Game ' + g.gameNum : '') : '', g.ifNec ? 'If necessary' : (s ? seriesText(s) : '')].filter(Boolean).join(' · ');
    var prob = g.probAway && g.probHome ? g.probAway + ' vs. ' + g.probHome : (g.state === 'pre' ? 'Probable pitchers TBD' : '');
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
    var race = raceCardHTML(false), std = standingsCardHTML(false);
    if (race || std) {
      out.push('<div class="row">' +
        (race ? '<section class="card race" aria-label="Race to October chart"><div class="card-hd"><h2>' + race.title + '</h2><span class="sub">' + esc(race.sub) + '</span></div><div class="chart-body">' + race.body + '</div></section>' : '') +
        (std ? '<section class="card standings" aria-label="Standings"><div class="card-hd"><h2>' + esc(std.title) + '</h2></div>' + std.body + '</section>' : '') + '</div>');
    }
    var feats = ['feat1', 'feat2'].filter(function (k) { return b[k] && b[k] !== 'hide'; });
    if (feats.length) {
      out.push('<section class="feat" aria-label="Featured leaders">' + feats.map(function (k) {
        var s = X.STAT_BY_KEY[b[k]]; if (!s) return '';
        return '<article class="card"><div class="card-hd"><h2>' + esc(s.short) + ' leaders</h2><span class="sub">' + esc(s.name) + ' · bar = share of #1</span></div>' + leaderBodyHTML(b[k], 'feat') + '</article>';
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
      : 'Data: MLB Stats API · ' + (S.settings.gameType === 'P' ? 'Postseason' : 'Regular season') + ' stats';
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
      var r = raceCardHTML(true);
      return '<div class="card-hd"><h2>' + r.title + '</h2><span class="sub">' + esc(r.sub) + '</span></div><div class="tv-fill fade-in">' + r.body + '</div>' + progressHTML(list.length, S.tv.chart % list.length);
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
      var s = seriesFor(g);
      var when = g.state === 'live' ? '<b>' + (g.sample ? 'Sample' : 'Live') + '</b>' + esc(g.inning) : '<b>' + esc(whenLabel(g)) + '</b>' + esc(timeLabel(g));
      var m = g.state === 'live' ? abbr(g.away.id) + ' ' + g.away.score + ' · ' + abbr(g.home.id) + ' ' + g.home.score : abbr(g.away.id) + ' at ' + abbr(g.home.id);
      return '<div class="tv-game"><div class="when">' + when + '</div><div><div class="m">' + m + '</div><div class="s">' + esc([g.round ? shortRound(g.round) + (g.gameNum ? ' G' + g.gameNum : '') : '', g.ifNec ? 'If necessary' : (s ? seriesText(s) : ''), g.tv].filter(Boolean).join(' · ')) + '</div></div></div>';
    }).join('') + '</div>';
  }
  function tvMainHTML() {
    if (!S.data) return '<div class="tv-main"><div class="tv-panel loading">Loading the MLB Stats API</div></div>';
    var std = standingsCardHTML(true);
    return '<div class="tv-main">' +
      '<section class="tv-panel" id="tv-chart" aria-label="Charts">' + tvChartPanelHTML() + '</section>' +
      '<section class="tv-panel" id="tv-board" aria-label="Leaders">' + tvBoardPanelHTML() + '</section>' +
      '<div class="tv-stack">' +
      (std ? '<section class="tv-panel" aria-label="Standings"><div class="card-hd"><h2>' + esc(std.title) + '</h2></div>' + std.body + '</section>' : '') +
      (S.settings.blocks.upnext !== 'hide' ? '<section class="tv-panel" aria-label="Coming up"><div class="card-hd"><h2>Coming up</h2></div>' + tvGamesHTML() + '</section>' : '') +
      '</div></div>' +
      '<div class="tv-gear" id="tv-gear"><button type="button" data-act="fullscreen">Full screen</button><button type="button" data-act="open-settings">Settings</button><button type="button" data-act="exit-tv">Exit TV mode</button></div>';
  }
  function tvTick() {
    S.tv.board++; if (S.tv.board % 2 === 0) S.tv.chart++;
    var a = document.getElementById('tv-board'), c = document.getElementById('tv-chart');
    if (a) a.innerHTML = tvBoardPanelHTML();
    if (c && S.tv.board % 2 === 0) c.innerHTML = tvChartPanelHTML();
  }
  function startTV() {
    clearInterval(S.tv.timer);
    if (!isTV()) { releaseWake(); return; }
    S.tv.timer = setInterval(tvTick, Math.max(5, S.settings.tvRotate) * 1000);
    requestWake();
  }
  function requestWake() {
    if (S.wake || !navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request('screen').then(function (l) { S.wake = l; l.addEventListener && l.addEventListener('release', function () { S.wake = null; }); }).catch(function () { /* not granted */ });
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
    X.STAT_GROUPS.forEach(function (g) {
      h += '<optgroup label="' + g.label + '">';
      X.STATS.filter(function (s) { return s.group === g.id; }).forEach(function (s) {
        h += '<option value="' + s.key + '"' + (s.key === current ? ' selected' : '') + '>' + esc(s.short + ' · ' + s.name) + '</option>';
      });
      h += '</optgroup>';
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
  function pickerHTML(code, id, label, optionsHTML) {
    return '<div class="pkr"><label for="pk-' + id + '"><span class="code">' + code + '</span>' + esc(label) + '</label><select class="set-select" id="pk-' + id + '" data-set="blocks.' + id + '" data-code="' + code + '">' + optionsHTML + '</select></div>';
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
      '<div class="span4" data-map="R">R · Race chart</div><div class="span2" data-map="S">S · Standings</div>' +
      '<div class="span3" data-map="F1">F1 · Featured</div><div class="span3" data-map="F2">F2 · Featured</div>' +
      '<div class="span1" data-map="B1">B1</div><div class="span1" data-map="B2">B2</div><div class="span1" data-map="B3">B3</div><div class="span1" data-map="B4">B4</div><div class="span1" data-map="B5">B5</div><div class="span1" data-map="B6">B6</div>' +
      '<div class="span6" data-map="C">C · All-clubs chart</div><div class="span6" data-map="U">U · Coming up</div></div>';
    return '<div class="set-top"><div class="set-top-in"><h1>Settings</h1><div class="set-actions"><button type="button" class="btn-hdr" data-act="close-settings">Back to the board</button></div></div></div><div class="hdr-strip"></div>' +
      '<div class="set-wrap">' +
      '<section class="set-sec" aria-labelledby="sec-display"><div class="card-hd"><h2 id="sec-display">Display</h2><span class="sub">Saved in this browser</span></div><div class="set-body">' +
      '<div class="field"><span class="flabel">Theme</span>' + segHTML('theme', s.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) + '<span class="hint">Auto follows your device setting.</span></div>' +
      '<div class="field"><span class="flabel">Layout</span>' + segHTML('layout', s.layout, [['standard', 'Standard'], ['tv', 'TV']]) + '<span class="hint">TV fits a 16:9 screen with no scrolling, uses larger type, rotates leader boards and charts, and keeps the screen awake where the browser allows it.</span></div>' +
      '<div class="field"><label for="set-tvRotate">TV rotation</label>' + sel('set-tvRotate', 'tvRotate', [[8, 'Every 8 seconds'], [12, 'Every 12 seconds'], [20, 'Every 20 seconds'], [30, 'Every 30 seconds']]) + '<span class="hint">How long each leader board stays up in TV layout. Charts switch every second turn.</span></div>' +
      '<div class="field"><span class="flabel">Ticker</span>' + segHTML('ticker', s.ticker, [[true, 'On'], [false, 'Off']]) + '</div>' +
      '<div class="field"><span class="flabel">Ticker speed</span>' + segHTML('tickerSpeed', s.tickerSpeed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]) + '</div>' +
      '</div></section>' +
      '<section class="set-sec" aria-labelledby="sec-data"><div class="card-hd"><h2 id="sec-data">Data</h2><span class="sub">MLB Stats API</span></div><div class="set-body">' +
      '<div class="field"><label for="set-defaultTeam">Default team</label><select class="set-select" id="set-defaultTeam" data-set="defaultTeam">' + teamOpts + '</select><span class="hint">The board opens on this team. Changing it also switches the board now.</span></div>' +
      '<div class="field"><span class="flabel">Stats from</span>' + segHTML('gameType', s.gameType, [['R', 'Regular season'], ['P', 'Postseason']]) + '<span class="hint">Applies to leader boards and club stats. Standings and the race chart always use the regular season.</span></div>' +
      '<div class="field"><label for="set-pool">League player pool</label>' + sel('set-pool', 'pool', [['QUALIFIED', 'Qualified players'], ['ALL', 'All players'], ['ROOKIES', 'Rookies only']]) + '<span class="hint">Qualified means enough plate appearances or innings to rank in rate stats like AVG and ERA.</span></div>' +
      '<div class="field"><label for="set-teamPool">Club player pool</label>' + sel('set-teamPool', 'teamPool', [['QUALIFIED', 'Qualified players'], ['ALL', 'All players'], ['ROOKIES', 'Rookies only']]) + '<span class="hint">Used when a team is selected. Clubs often have only one or two qualified pitchers.</span></div>' +
      '<div class="field"><span class="flabel">Leaders per board</span>' + segHTML('limit', s.limit, [[3, '3'], [5, '5'], [10, '10']]) + '</div>' +
      '<div class="field"><span class="flabel">Auto-refresh</span>' + segHTML('refresh', s.refresh, [[true, 'On'], [false, 'Off']]) + '<span class="hint">Scores refresh every 30 seconds while games are live and every 5 minutes otherwise. Stats refresh every 15 minutes.</span></div>' +
      (snapshot ? '<div class="field"><span class="flabel">Sample live games</span>' + segHTML('sampleLive', s.sampleLive, [[false, 'Off'], [true, 'On']]) + '<span class="hint">Preview only. The board is showing a saved snapshot, so this adds two made-up in-progress scores to show how live games look in the ticker.</span></div>' : '') +
      '</div></section>' +
      '<section class="set-sec" aria-labelledby="sec-blocks"><div class="card-hd"><h2 id="sec-blocks">Blocks</h2><span class="sub">Choose what each block shows</span></div><div class="set-body">' + map +
      '<p class="set-note" style="margin:0">Leader boards can show any of the ' + X.STATS.length + ' player leaderboards the MLB Stats API ranks, across hitting, pitching, fielding and catching. Header tiles and the all-clubs chart use club stats. With a team selected, every block switches to that team.</p>' +
      '<h3 class="sec-title" style="font-size:22px">Header tiles</h3><div class="pickers">' +
      X.BLOCKS.tiles.map(function (k) { return pickerHTML(k.code, k.id, k.label, metricOptions(b[k.id], true, false)); }).join('') + '</div>' +
      '<h3 class="sec-title" style="font-size:22px">Charts and lists</h3><div class="pickers">' +
      pickerHTML('R', 'race', 'Race chart', [['gap', 'Games above .500'], ['pct', 'Winning percentage'], ['hide', 'Hide this block']].map(function (o) { return '<option value="' + o[0] + '"' + (b.race === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')) +
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
    applyChrome();
    var app = document.getElementById('app');
    var focusId = document.activeElement && document.activeElement.id;
    if (S.view === 'settings') app.innerHTML = settingsHTML();
    else if (isTV()) app.innerHTML = '<div class="tvapp">' + headerHTML() + tvMainHTML() + '</div>';
    else app.innerHTML = headerHTML() + '<main class="dash" id="main">' + dashMainHTML() + '</main>';
    if (focusId) { var el = document.getElementById(focusId); if (el) el.focus(); }
    ensureLeaders();
    startTV();
  }
  function refreshMain() {
    if (S.view !== 'dash') return;
    if (isTV()) {
      var a = document.getElementById('tv-board'), c = document.getElementById('tv-chart');
      if (!a || !c) { render(); return; }
      a.innerHTML = tvBoardPanelHTML(); c.innerHTML = tvChartPanelHTML();
      var stack = document.querySelector('.tv-stack');
      if (stack) { var tmp = document.createElement('div'); tmp.innerHTML = tvMainHTML(); var ns = tmp.querySelector('.tv-stack'); if (ns) stack.innerHTML = ns.innerHTML; }
      return;
    }
    var main = document.getElementById('main');
    if (main) main.innerHTML = dashMainHTML(); else render();
  }
  function refreshStatus() {
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
    if (path.indexOf('blocks.') === 0) S.settings.blocks[path.slice(7)] = val; else S.settings[path] = val;
    if (path === 'defaultTeam') S.team = val === 'MLB' ? 'MLB' : parseInt(val, 10);
    if (path === 'layout' && val === 'tv') S.tickPaused = false;
    saveSettings();
    if (path === 'gameType' && val !== prevGameType && S.data && S.data.source === 'live') {
      S.leaders = {};
      API.teamStats(S.data.season, val).then(function (ts) { S.data.teamStats = ts; refreshAll(); }).catch(function () {});
    }
    if (path === 'refresh') scheduleRefresh();
    S.resetArmed = false;
    render();
  }
  function onClick(e) {
    var btn = e.target.closest('[data-act]'); if (!btn || btn.tagName === 'SELECT') return;
    var act = btn.getAttribute('data-act');
    if (act === 'open-settings') { S.view = 'settings'; S.resetArmed = false; render(); try { window.scrollTo(0, 0); history.replaceState(null, '', '#settings'); } catch (er) { /* ignore */ } }
    else if (act === 'close-settings') { S.view = 'dash'; render(); try { window.scrollTo(0, 0); history.replaceState(null, '', location.pathname + location.search); } catch (er) { /* ignore */ } }
    else if (act === 'tk-toggle') { S.tickPaused = !S.tickPaused; var v = document.getElementById('tk-view'); if (v) v.classList.toggle('paused', S.tickPaused); btn.setAttribute('aria-label', S.tickPaused ? 'Play ticker' : 'Pause ticker'); btn.innerHTML = S.tickPaused ? '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>' : '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"><line x1="8" y1="5" x2="8" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line></svg>'; }
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
  function boot() {
    S.settings = loadSettings();
    S.team = S.settings.defaultTeam === 'MLB' ? 'MLB' : parseInt(S.settings.defaultTeam, 10) || 'MLB';
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) S.tickPaused = true; } catch (e) { /* ignore */ }
    if (location.hash === '#settings') S.view = 'settings';
    var app = document.getElementById('app');
    app.addEventListener('click', onClick);
    app.addEventListener('change', onChange);
    app.addEventListener('focusin', onFocus);
    var tv = function () { if (isTV()) pokeIdle(); };
    document.addEventListener('mousemove', tv); document.addEventListener('keydown', tv);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && isTV()) requestWake(); });
    app.addEventListener('mouseover', function (e) { TK.hover = !!e.target.closest('#tk-view'); });
    app.addEventListener('mouseleave', function () { TK.hover = false; });
    render();
    TK.raf = window.requestAnimationFrame(tickStep);
    loadLive().catch(function (err) { useSnapshot(err); }).then(function () { render(); scheduleRefresh(); });
  }
  X.App = { state: S, render: render, boot: boot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
