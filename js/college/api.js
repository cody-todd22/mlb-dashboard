/* MLB Live Board · College mode — data layer for the free NCAA API (github.com/henrygd/ncaa-api,
 * a wrapper around ncaa.com). Everything is normalized to the shapes college/app.js renders, so the
 * bundled snapshot (college/snapshot.js) can stand in when the API can't be reached.
 *
 * What the NCAA API offers for D1 baseball: daily scoreboards, the D1Baseball.com Top 25 and the
 * NCAA's national stat lists. It has no standings and no team schedules, so the board downloads the
 * season's scoreboards once, keeps them on the device, and works out records from the results. */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});
  var C = (X.College = X.College || {});
  var API = (C.API = {});

  var base = C.API_DEFAULT;
  API.setBase = function (b) { base = String(b || '').trim().replace(/\/+$/, '') || C.API_DEFAULT; };
  API.base = function () { return base; };

  /* ───── request queue: the public API allows 5 requests a second per address ───── */
  var queue = [], active = 0, lastStart = 0, MAX = 3, GAP = 230;
  function pump() {
    if (!queue.length || active >= MAX) return;
    var wait = lastStart + GAP - Date.now();
    if (wait > 0) { setTimeout(pump, wait); return; }
    var job = queue.shift(); active++; lastStart = Date.now();
    run(job.url, 0).then(job.ok, job.fail).then(function () { active--; pump(); });
    pump();
  }
  function run(url, tries) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (r.status === 429 && tries < 3) return new Promise(function (res) { setTimeout(res, 1500 * (tries + 1)); }).then(function () { return run(url, tries + 1); });
      if (!r.ok) { var e = new Error('NCAA API returned ' + r.status); e.status = r.status; throw e; }
      return r.json();
    }, function (err) { clearTimeout(timer); throw err; });
  }
  API.pace = function (max, gap) { MAX = max; GAP = gap; };   // tests and self-hosted copies
  API.get = function (path) {
    var url = base + path;
    return new Promise(function (ok, fail) { queue.push({ url: url, ok: ok, fail: fail }); pump(); });
  };

  /* ───── dates ───── */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  API.ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  function addDays(key, n) { var d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return API.ymd(d); }
  API.addDays = addDays;
  /* The season runs mid-February to late June. Before February, the board shows last season. */
  API.seasonFor = function (now) {
    var y = now.getFullYear(), start = y + '-02-10';
    if (API.ymd(now) < start) y--;
    return { year: y, start: y + '-02-10', end: y + '-06-30' };
  };

  /* ───── scoreboard ───── */
  function stateOf(s) {
    s = String(s || '').toLowerCase();
    if (s === 'final' || s === 'f') return 'final';
    if (s === 'live' || s === 'i' || s === 'in_progress') return 'live';
    if (s === 'pre' || s === 'p' || s === '') return 'pre';
    return 'off';   // canceled, postponed, suspended
  }
  function side(t) {
    var n = (t && t.names) || {};
    var score = t && t.score !== '' && t.score != null ? parseInt(t.score, 10) : null;
    return { seo: n.seo || '', name: String(n.short || '').trim(), score: isNaN(score) ? null : score, seed: (t && t.seed) || '', conf: (((t && t.conferences) || [])[0] || {}).conferenceSeo || '' };
  }
  API.normGame = function (g, day) {
    var epoch = parseInt(g.startTimeEpoch, 10);
    var round = (g.championshipGame && g.championshipGame.round && g.championshipGame.round.title) || '';
    return {
      pk: String(g.gameID), day: day, date: isNaN(epoch) ? day + 'T12:00:00' : new Date(epoch * 1000).toISOString(),
      tbd: !g.startTime || /^12:00 AM/.test(g.startTime) || /TBA|TBD/i.test(g.startTime),
      state: stateOf(g.gameState), detailed: g.gameState || '', inning: g.currentPeriod && !/final/i.test(g.currentPeriod) ? g.currentPeriod : '',
      tv: g.network || '', round: round, post: !!round, bracket: g.bracketId || '',
      away: side(g.away), home: side(g.home)
    };
  };
  API.scoreboard = function (day) {
    var p = day.split('-');
    return API.get('/scoreboard/baseball/d1/' + p[0] + '/' + p[1] + '/' + p[2]).then(function (j) {
      var seen = {};
      return ((j && j.games) || []).map(function (w) { return API.normGame(w.game || w, day); })
        .filter(function (g) { if (!g.away.seo || !g.home.seo || seen[g.pk]) return false; seen[g.pk] = true; return true; });
    }, function (e) { if (e.status === 404) return []; throw e; });   // days without games can 404
  };

  /* ───── stat lists ───── */
  var memo = {};
  API.resetCache = function () { memo = {}; };
  function statPage(kind, id, page) {
    return API.get('/stats/baseball/d1/current/' + kind + '/' + id + (page > 1 ? '?page=' + page : ''));
  }
  function rowsOf(j) { return (j && j.data) || []; }
  /* → { title, updated, pages, rows } ; all=true walks every page (about 50 rows each). */
  API.statList = function (kind, id, all) {
    var key = kind + id + (all ? '*' : '');
    if (memo[key]) return memo[key];
    var p = statPage(kind, id, 1).then(function (j) {
      var out = { title: j.title, updated: j.updated, pages: j.pages || 1, rows: rowsOf(j) };
      if (!all || out.pages < 2) return out;
      var more = [];
      for (var i = 2; i <= out.pages; i++) more.push(statPage(kind, id, i).then(rowsOf, function () { return []; }));
      return Promise.all(more).then(function (r) { r.forEach(function (rows) { out.rows = out.rows.concat(rows); }); return out; });
    });
    memo[key] = p;
    p.catch(function () { delete memo[key]; });
    return p;
  };
  /* A list row → { rank, name, team, value }. The ranked value is the last column. */
  API.valueOf = function (row) { var ks = Object.keys(row); return ks.length ? String(row[ks[ks.length - 1]]).trim() : ''; };
  API.rankRows = function (rows) {
    var last = null;
    return rows.map(function (r) {
      var rk = parseInt(r.Rank, 10);
      if (!isNaN(rk)) last = rk;
      return { rank: last, name: String(r.Name || '').trim(), team: String(r.Team || '').trim(), value: API.valueOf(r), row: r };
    });
  };
  API.rankings = function () {
    if (memo.rank) return memo.rank;
    var p = API.get('/rankings/baseball/d1').then(function (j) {
      return { title: j.title || 'Top 25', updated: j.updated || '', rows: ((j && j.data) || []).map(function (r) {
        return { rank: parseInt(r.RANK, 10), name: String(r.TEAM || r.SCHOOL || '').trim(), record: r['OVERALL RECORD'] || r.RECORD || '', prev: r['PREVIOUS RANK'] || r.PREVIOUS || '' };
      }) };
    });
    memo.rank = p; p.catch(function () { delete memo.rank; });
    return p;
  };

  /* ───── the season's results, downloaded once and kept on this device ───── */
  var LS_PREFIX = 'mlb-live-board:college-season:';
  function pack(g) { return [g.pk, Math.round(new Date(g.date).getTime() / 1000), g.state.charAt(0), g.away.seo, g.home.seo, g.away.score, g.home.score, g.round, C.TEAM_BY_SEO[g.away.seo] ? '' : g.away.name, C.TEAM_BY_SEO[g.home.seo] ? '' : g.home.name]; }
  var ST = { f: 'final', l: 'live', p: 'pre', o: 'off' };
  API.unpack = function (a, day) {
    return { pk: a[0], day: day, date: new Date(a[1] * 1000).toISOString(), state: ST[a[2]] || 'off', round: a[7] || '', post: !!a[7],
      away: { seo: a[3], score: a[5], name: a[8] || (C.TEAM_BY_SEO[a[3]] || {}).name || a[3] },
      home: { seo: a[4], score: a[6], name: a[9] || (C.TEAM_BY_SEO[a[4]] || {}).name || a[4] } };
  };
  function loadStore(year) {
    try { var raw = window.localStorage.getItem(LS_PREFIX + year); if (raw) { var s = JSON.parse(raw); if (s && s.v === 1) return s; } } catch (e) { /* unavailable */ }
    return { v: 1, year: year, days: {}, at: {} };
  }
  function saveStore(s) {
    try {
      window.localStorage.setItem(LS_PREFIX + s.year, JSON.stringify(s));
      Object.keys(window.localStorage).forEach(function (k) { if (k.indexOf(LS_PREFIX) === 0 && k !== LS_PREFIX + s.year) window.localStorage.removeItem(k); });
    } catch (e) { /* full or unavailable: keep it in memory only */ }
  }
  /* A day is settled once it was fetched at least two days after it ended. */
  function settled(s, day) { var at = s.at[day]; return at && at > new Date(addDays(day, 3) + 'T00:00:00').getTime(); }
  var stores = {};
  /* → Promise of { games: [...all results, oldest first], days, complete }. onProgress(done, total). */
  API.season = function (season, today, onProgress, force) {
    var s = stores[season.year] || (stores[season.year] = loadStore(season.year));
    var last = today < season.end ? today : season.end, days = [];
    for (var d = season.start; d <= last; d = addDays(d, 1)) days.push(d);
    var todo = days.filter(function (d) { return force || !s.days[d] || !settled(s, d); });
    var done = days.length - todo.length, failed = 0, sinceSave = 0;
    if (onProgress) onProgress(done, days.length);
    return Promise.all(todo.map(function (day) {
      return API.scoreboard(day).then(function (gs) {
        s.days[day] = gs.map(pack); s.at[day] = Date.now();
        if (++sinceSave >= 10) { sinceSave = 0; saveStore(s); }
      }, function () { failed++; }).then(function () { done++; if (onProgress) onProgress(done, days.length); });
    })).then(function () {
      saveStore(s);
      if (failed && failed === todo.length && todo.length > 3) throw new Error('Season scoreboards could not be loaded');
      return API.seasonFromStore(s, days, failed === 0);
    });
  };
  API.seasonFromStore = function (s, days, complete) {
    var games = [], seen = {}, sig = {};
    (days || Object.keys(s.days).sort()).forEach(function (day) {
      (s.days[day] || []).forEach(function (a) {
        if (seen[a[0]]) return;
        seen[a[0]] = true;
        var g = API.unpack(a, day);
        /* The feed sometimes lists a postseason game twice under two ids, a day apart and once
           without its round. Same clubs and same score within two days = one game. */
        var k = [g.away.seo, g.home.seo].sort().join('|') + '|' + [g.away.score, g.home.score].sort().join('-');
        if (g.state === 'final') {
          var twin = (sig[k] || []).filter(function (o) { return (o.round || g.round) && Math.abs(new Date(o.day) - new Date(day)) <= 2 * 86400000; })[0];
          if (twin) { if (g.round && !twin.round) { twin.round = g.round; twin.post = true; twin.day = g.day; twin.date = g.date; twin.pk = g.pk; } return; }
          (sig[k] = sig[k] || []).push(g);
        }
        games.push(g);
      });
    });
    games.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    return { games: games, complete: complete !== false };
  };

  /* ───── records worked out from results ───── */
  /* Conference games: both clubs in the same conference, and the pair met more than once within
     three days (a conference series or doubleheader). That leaves out non-conference meetings
     and most conference-tournament games, which the scoreboard doesn't label. */
  API.records = function (games, confOf) {
    var R = {}, pairs = {};
    function rec(seo) { return R[seo] || (R[seo] = { w: 0, l: 0, cw: 0, cl: 0, hw: 0, hl: 0, aw: 0, al: 0, rs: 0, ra: 0, log: [] }); }
    var finals = games.filter(function (g) { return g.state === 'final' && g.away.score != null && g.home.score != null && g.away.score !== g.home.score; });
    finals.forEach(function (g) { var k = [g.away.seo, g.home.seo].sort().join('|'); (pairs[k] = pairs[k] || []).push(g.day); });
    finals.forEach(function (g) {
      var a = g.away.seo, h = g.home.seo, ca = confOf(a), k = [a, h].sort().join('|');
      var conf = !g.post && ca && ca === confOf(h) && ca !== 'di-independent' && pairs[k].some(function (d) { return d !== g.day ? Math.abs(new Date(d) - new Date(g.day)) <= 3 * 86400000 : pairs[k].filter(function (x) { return x === d; }).length > 1; });
      [[a, g.away.score, g.home.score, false, h], [h, g.home.score, g.away.score, true, a]].forEach(function (x) {
        if (!C.TEAM_BY_SEO[x[0]]) return;
        var r = rec(x[0]), win = x[1] > x[2];
        if (win) r.w++; else r.l++;
        if (conf) { if (win) r.cw++; else r.cl++; }
        if (x[3]) { if (win) r.hw++; else r.hl++; } else { if (win) r.aw++; else r.al++; }
        r.rs += x[1]; r.ra += x[2];
        r.log.push({ d: g.day, home: x[3], rs: x[1], ra: x[2], win: win, margin: x[1] - x[2], opp: x[4], conf: conf, post: g.post });
      });
    });
    Object.keys(R).forEach(function (seo) {
      var r = R[seo], log = r.log, n = 0, last = null;
      for (var i = log.length - 1; i >= 0; i--) { if (last === null) last = log[i].win; if (log[i].win !== last) break; n++; }
      r.streak = log.length ? (last ? 'W' : 'L') + n : '';
      var l10 = log.slice(-10), w10 = l10.filter(function (g) { return g.win; }).length;
      r.l10 = l10.length ? w10 + '-' + (l10.length - w10) : '';
    });
    return R;
  };
})();
