/* MLB Live Board · Football modes — data layer for ESPN's public (unofficial) football API.
 * One instance per league (NFL, FBS). Everything is normalized to the shapes football/app.js renders,
 * so the bundled snapshot (football/snapshot.js) can stand in when ESPN can't be reached.
 *
 * Endpoints (paths relative to the hosts below):
 *   site  /apis/site/v2/sports/football/<league>/scoreboard?dates=YYYY&seasontype=T&week=W[&groups=80&limit=300]
 *   site  /apis/site/v2/sports/football/college-football/rankings?season=YYYY&seasontype=2&week=W
 *   site  /apis/v2/sports/football/<league>/standings?season=YYYY[&group=80]
 *   web   /apis/common/v3/sports/football/<league>/statistics/byathlete?...&category=&sort=<cat>.<field>:desc
 *   web   /apis/common/v3/sports/football/<league>/statistics/byteam?... */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});
  var F = (X.Football = X.Football || {});
  var HOST = { site: 'https://site.api.espn.com', web: 'https://site.web.api.espn.com' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function num(v) {
    if (v === null || v === undefined || v === '' || v === '-') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }
  function lc(s) { return String(s || '').toLowerCase(); }

  F.makeAPI = function (L) {
    var API = { ymd: ymd, num: num }, relay = '';
    API.setRelay = function (r) { relay = String(r || '').trim().replace(/\/+$/, ''); };
    API.relay = function () { return relay; };
    /* With a relay set (worker/ncaa-relay.js), ESPN calls go through it: <relay>/espn/<site|web>/<path>. */
    function url(host, path) { return relay ? relay + '/espn/' + host + path : HOST[host] + path; }

    var queue = [], active = 0, MAX = 4;
    function pump() {
      while (active < MAX && queue.length) {
        var job = queue.shift(); active++;
        run(job.url).then(job.ok, job.fail).then(function () { active--; pump(); });
      }
    }
    function run(u) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 25000);
      return fetch(u, ctl ? { signal: ctl.signal } : {}).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) { var e = new Error('ESPN returned ' + r.status); e.status = r.status; throw e; }
        return r.json();
      }, function (err) { clearTimeout(timer); throw err; });
    }
    API.get = function (host, path) { var u = url(host, path); return new Promise(function (ok, fail) { queue.push({ url: u, ok: ok, fail: fail }); pump(); }); };
    API.pace = function (m) { MAX = m; };

    var sp = '/apis/site/v2/sports/football/' + L.path, grp = L.groupsParam ? '&groups=' + L.groupsParam : '';

    /* ───── calendar: season types and weeks with their date windows ───── */
    API.calendar = function () {
      return API.get('site', sp + '/scoreboard' + (L.groupsParam ? '?groups=' + L.groupsParam : '')).then(function (j) {
        var lg = (j.leagues || [])[0] || {}, weeks = [];
        (lg.calendar || []).forEach(function (t) {
          var type = parseInt(t.value, 10);
          (t.entries || []).forEach(function (e) {
            weeks.push({ type: type, week: parseInt(e.value, 10), label: e.label || e.alternateLabel || ('Week ' + e.value), detail: e.detail || '', start: e.startDate, end: e.endDate });
          });
        });
        var season = (j.season && j.season.year) || (lg.season && lg.season.year) || new Date().getFullYear();
        return { season: season, weeks: weeks.filter(function (w) { return w.type === 2 || w.type === 3; }) };
      });
    };
    /* The week whose window holds `now` (or the next one in a gap; the last one after the season). */
    API.currentWeek = function (weeks, now) {
      var t = now.getTime(), hit = null;
      weeks.forEach(function (w) { if (!hit && new Date(w.start).getTime() <= t && t <= new Date(w.end).getTime()) hit = w; });
      if (!hit) hit = weeks.filter(function (w) { return new Date(w.start).getTime() > t; })[0] || weeks[weeks.length - 1] || null;
      return hit;
    };

    /* ───── scoreboard ───── */
    function stateOf(st) {
      var s = (st && st.type) || {};
      if (s.state === 'post') return /cancel|postpone|forfeit/i.test(s.name || '') ? 'off' : 'final';
      if (s.state === 'in') return 'live';
      if (/postpone|cancel|delay/i.test(s.name || '')) return 'off';
      return 'pre';
    }
    function side(c) {
      var t = c.team || {}, rank = c.curatedRank && c.curatedRank.current;
      return { id: String(t.id || c.id || ''), abbr: t.abbreviation || '', name: t.shortDisplayName || t.displayName || t.name || '', score: num(c.score && c.score.value != null ? c.score.value : c.score), rank: rank && rank < 99 ? rank : null };
    }
    API.normGame = function (ev, fallbackWeek, fallbackType) {
      var c = (ev.competitions || [])[0] || {}, st = c.status || ev.status || {}, cs = c.competitors || [];
      var home = cs.filter(function (x) { return x.homeAway === 'home'; })[0] || cs[0] || {}, away = cs.filter(function (x) { return x.homeAway === 'away'; })[0] || cs[1] || {};
      var s = c.situation || {}, note = ((c.notes || [])[0] || {}).headline || '';
      var tv = []; (c.broadcasts || []).forEach(function (b) { (b.names || []).forEach(function (n) { if (tv.indexOf(n) < 0) tv.push(n); }); });
      var d = new Date(ev.date || c.date);
      return {
        pk: String(ev.id), date: d.toISOString(), day: ymd(d), week: (ev.week && ev.week.number) || fallbackWeek, type: (ev.season && ev.season.type) || fallbackType,
        state: stateOf(st), detail: (st.type && (st.type.shortDetail || st.type.detail)) || '', period: st.period || 0, clock: st.displayClock || '',
        tbd: !!(ev.timeValid === false || c.timeValid === false), tv: tv.slice(0, 2).join('/'), note: note, neutral: !!c.neutralSite, confGame: !!c.conferenceCompetition,
        away: side(away), home: side(home),
        sit: s.downDistanceText || s.shortDownDistanceText ? { text: s.shortDownDistanceText || s.downDistanceText, long: s.downDistanceText || '', poss: s.possession ? String(s.possession) : '', rz: !!s.isRedZone } : null
      };
    };
    API.week = function (year, type, week) {
      return API.get('site', sp + '/scoreboard?dates=' + year + '&seasontype=' + type + '&week=' + week + grp + (L.groupsParam ? '&limit=300' : '')).then(function (j) {
        return (j.events || []).map(function (ev) { return API.normGame(ev, week, type); });
      });
    };

    /* ───── every week of the season, kept on the device ───── */
    var LS = 'mlb-live-board:' + L.id + '-season:';
    function pack(g) { return [g.pk, Math.round(new Date(g.date).getTime() / 1000), g.state.charAt(0), g.away.id, g.home.id, g.away.score, g.home.score, g.note, g.confGame ? 1 : 0, g.neutral ? 1 : 0, L.TEAM_BY_ID[g.away.id] ? '' : g.away.abbr, L.TEAM_BY_ID[g.home.id] ? '' : g.home.abbr, g.tbd ? 1 : 0]; }
    var ST = { f: 'final', l: 'live', p: 'pre', o: 'off' };
    API.unpack = function (a, type, week) {
      var d = new Date(a[1] * 1000);
      return { pk: a[0], date: d.toISOString(), day: ymd(d), week: week, type: type, state: ST[a[2]] || 'off', note: a[7] || '', confGame: !!a[8], neutral: !!a[9],
        away: { id: String(a[3]), score: a[5], abbr: a[10] || '' }, home: { id: String(a[4]), score: a[6], abbr: a[11] || '' }, tbd: !!a[12], detail: '', tv: '', sit: null };
    };
    function load(year) {
      try { var raw = window.localStorage.getItem(LS + year); if (raw) { var s = JSON.parse(raw); if (s && s.v === 1) return s; } } catch (e) { /* unavailable */ }
      return { v: 1, year: year, weeks: {}, at: {} };
    }
    function save(s) {
      try {
        window.localStorage.setItem(LS + s.year, JSON.stringify(s));
        Object.keys(window.localStorage).forEach(function (k) { if (k.indexOf(LS) === 0 && k !== LS + s.year) window.localStorage.removeItem(k); });
      } catch (e) { /* full or unavailable */ }
    }
    var stores = {};
    /* weeks: calendar weeks up to and including the current one. A week is settled once fetched 2 days after it ended. */
    API.season = function (year, weeks, now, force) {
      var s = stores[year] || (stores[year] = load(year));
      var todo = weeks.filter(function (w) {
        var k = w.type + ':' + w.week, at = s.at[k];
        return force || !s.weeks[k] || !(at && at > new Date(w.end).getTime() + 2 * 86400000);
      });
      var failed = 0;
      return Promise.all(todo.map(function (w) {
        return API.week(year, w.type, w.week).then(function (gs) { s.weeks[w.type + ':' + w.week] = gs.map(pack); s.at[w.type + ':' + w.week] = Date.now(); }, function () { failed++; });
      })).then(function () {
        save(s);
        if (failed && failed === todo.length && todo.length > 2) throw new Error('Season scoreboards could not be loaded');
        var out = [];
        weeks.forEach(function (w) { (s.weeks[w.type + ':' + w.week] || []).forEach(function (a) { out.push(API.unpack(a, w.type, w.week)); }); });
        out.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
        return out;
      });
    };

    /* ───── standings (used for NFL playoff seeds; records come from results) ───── */
    API.standings = function (year) {
      return API.get('site', '/apis/v2/sports/football/' + L.path + '/standings?season=' + year + (L.groupsParam ? '&group=' + L.groupsParam : '')).then(function (j) {
        var out = {};
        (function walk(node) {
          if (!node) return;
          ((node.standings && node.standings.entries) || []).forEach(function (e) {
            var id = String((e.team && e.team.id) || ''), r = {};
            (e.stats || []).forEach(function (s) { var k = s.name || s.type; if (k) r[k] = s.value != null ? s.value : s.displayValue; if (s.type && s.summary) r['_' + s.type] = s.summary; });
            out[id] = { seed: num(r.playoffSeed), clincher: r.clincher || '' };
          });
          (node.children || []).forEach(walk);
        })(j);
        return out;
      });
    };

    /* ───── polls (FBS): the newest of the AP and CFP rankings ───── */
    API.rankings = function (year, week) {
      var tries = [week + 1, week, week - 1].filter(function (w) { return w >= 1; });
      return Promise.all(tries.map(function (w) {
        return API.get('site', sp + '/rankings?season=' + year + '&seasontype=2&week=' + w).catch(function () { return null; });
      })).then(function (rs) {
        var polls = [];
        rs.forEach(function (j) { ((j && j.rankings) || []).forEach(function (p) { polls.push(p); }); });
        function latest(type) {
          return polls.filter(function (p) { return lc(p.type) === type && (p.ranks || []).length; }).sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1; })[0];
        }
        var p = latest('cfp') || latest('ap');
        if (!p) return null;
        return { name: p.name, short: p.shortName || p.name, type: lc(p.type), label: (p.occurrence && p.occurrence.displayValue) || '', date: p.date || '',
          rows: p.ranks.map(function (r) { return { rank: r.current, prev: r.previous, id: String(r.team && r.team.id), record: r.recordSummary || '', points: r.points, fpv: r.firstPlaceVotes }; }) };
      });
    };
    /* AP poll for each week so far (for the poll-race chart) → { week: { teamId: rank } } */
    API.pollHistory = function (year, upTo) {
      var ws = []; for (var w = 2; w <= upTo + 1; w++) ws.push(w);
      return Promise.all(ws.map(function (w) {
        return API.get('site', sp + '/rankings?season=' + year + '&seasontype=2&week=' + w).then(function (j) {
          var ap = ((j && j.rankings) || []).filter(function (p) { return lc(p.type) === 'ap'; })[0];
          if (!ap) return null;
          var m = {}; (ap.ranks || []).forEach(function (r) { m[String(r.team && r.team.id)] = r.current; });
          return { label: (ap.occurrence && ap.occurrence.displayValue) || ('Week ' + (w - 1)), date: ap.date, ranks: m };
        }).catch(function () { return null; });
      })).then(function (rs) {
        var seen = {}, out = [];
        rs.forEach(function (r) { if (r && !seen[r.date]) { seen[r.date] = 1; out.push(r); } });
        out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        return out;
      });
    };

    /* ───── player leaders ───── */
    var memo = {};
    API.resetCache = function () { memo = {}; };
    function statPath(stat, opts, page, limit) {
      return '/apis/common/v3/sports/football/' + L.path + '/statistics/byathlete?region=us&lang=en&contentorigin=espn' +
        '&isqualified=' + (stat.rate || !opts.all ? 'true' : 'false') + '&page=' + page + '&limit=' + limit +
        (opts.noCategory ? '' : '&category=' + encodeURIComponent(stat.q)) + '&sort=' + encodeURIComponent(stat.cat + '.' + stat.field + ':desc') +
        '&season=' + opts.season + '&seasontype=' + (opts.type || 2) + grp;
    }
    function parseAthletes(j, stat) {
      var cats = j.categories || [], ci = -1, fi = -1;
      cats.forEach(function (c, i) { if (lc(c.name) === lc(stat.cat)) { ci = i; fi = (c.names || []).map(lc).indexOf(lc(stat.field)); } });
      return (j.athletes || []).map(function (a) {
        var ath = a.athlete || {}, cat = null;
        (a.categories || []).forEach(function (c) { if (lc(c.name) === lc(stat.cat)) cat = c; });
        if (!cat && ci >= 0) cat = (a.categories || [])[ci];
        var v = cat && fi >= 0 ? num((cat.values || [])[fi]) : null, txt = cat && fi >= 0 ? (cat.totals || [])[fi] : null;
        var tm = (ath.teams || [])[0] || {};
        return { name: ath.displayName || ath.shortName || '—', teamId: String(ath.teamId || tm.id || ''), abbr: ath.teamShortName || tm.abbreviation || '', pos: (ath.position && ath.position.abbreviation) || '', num: v, value: txt != null && txt !== '-' ? String(txt) : (v != null ? String(v) : '—') };
      }).filter(function (r) { return r.num != null; });
    }
    /* → [{ name, teamId, abbr, num, value }] in ESPN's order. all = every player (for division and team pages). */
    API.leaders = function (stat, opts) {
      var key = stat.key + '|' + (opts.all ? 1 : 0) + '|' + opts.season + '|' + (opts.type || 2);
      if (memo[key]) return memo[key];
      var limit = opts.all ? 500 : 60;
      function fetchAll(o) {
        return API.get('web', statPath(stat, o, 1, limit)).then(function (j) {
          var rows = parseAthletes(j, stat), pages = (j.pagination && j.pagination.pages) || 1, more = [];
          if (opts.all) for (var p = 2; p <= Math.min(pages, 8); p++) more.push(API.get('web', statPath(stat, o, p, limit)).then(function (jj) { return parseAthletes(jj, stat); }, function () { return []; }));
          return Promise.all(more).then(function (rs) { rs.forEach(function (r) { rows = rows.concat(r); }); return rows; });
        });
      }
      var p = fetchAll(opts).then(function (rows) {
        if (rows.length) return rows;
        var o2 = {}; for (var k in opts) o2[k] = opts[k]; o2.noCategory = true;   // a category name ESPN doesn't know: sort alone still works
        return fetchAll(o2);
      });
      memo[key] = p; p.catch(function () { delete memo[key]; });
      return p;
    };

    /* ───── team statistics → { teamId: { 'own.passing.yardsPerGame': n, 'opp.…': n } } ───── */
    API.teamStats = function (year) {
      if (memo.ts) return memo.ts;
      var p = API.get('web', '/apis/common/v3/sports/football/' + L.path + '/statistics/byteam?region=us&lang=en&contentorigin=espn&season=' + year + '&seasontype=2&limit=300' + grp).then(function (j) {
        var names = {}; (j.categories || []).forEach(function (c) { names[lc(c.name)] = (c.names || []); });
        var out = {};
        (j.teams || []).forEach(function (t) {
          var id = String((t.team && t.team.id) || ''), m = out[id] = {};
          (t.categories || []).forEach(function (c) {
            var side = String(c.splitId) === '900' || /^opponent/i.test(c.displayName || '') ? 'opp' : 'own', ns = c.names || names[lc(c.name)] || [];
            ns.forEach(function (n, i) { var v = num((c.values || [])[i]); if (v != null && m[side + '.' + lc(c.name) + '.' + n] == null) m[side + '.' + lc(c.name) + '.' + n] = v; });
          });
        });
        return out;
      });
      memo.ts = p; p.catch(function () { delete memo.ts; });
      return p;
    };
    API.tsValue = function (row, key) {
      if (!row) return null;
      var parts = key.split('.'), k = parts[0] + '.' + lc(parts[1]) + '.' + parts.slice(2).join('.');
      return row[k] != null ? row[k] : null;
    };

    /* ───── records worked out from results ───── */
    /* Division (NFL) or conference (FBS) games: NFL = both clubs in the same division; FBS = ESPN's
       conference-game flag with both clubs in the same conference. Ties count half in PCT. */
    API.records = function (games) {
      var R = {};
      function rec(id) { return R[id] || (R[id] = { w: 0, l: 0, t: 0, gw: 0, gl: 0, gt: 0, hw: 0, hl: 0, ht: 0, aw: 0, al: 0, at: 0, cw: 0, cl: 0, ct: 0, pf: 0, pa: 0, gp: 0, log: [] }); }
      games.forEach(function (g) {
        if (g.state !== 'final' || g.away.score == null || g.home.score == null) return;
        var a = L.TEAM_BY_ID[g.away.id], h = L.TEAM_BY_ID[g.home.id];
        var same = a && h && a.group === h.group && (L.id === 'nfl' ? true : g.confGame) && a.group !== 'ind';
        [[g.away.id, g.away.score, g.home.score, false, g.home.id, g.home.abbr], [g.home.id, g.home.score, g.away.score, true, g.away.id, g.away.abbr]].forEach(function (x) {
          if (!L.TEAM_BY_ID[x[0]]) return;
          var r = rec(x[0]), res = x[1] > x[2] ? 'w' : (x[1] < x[2] ? 'l' : 't'), post = g.type === 3;
          if (!post) {
            r[res]++; r.gp++; r.pf += x[1]; r.pa += x[2];
            if (same) r['g' + res]++;
            if (g.neutral) { /* neutral sites count in neither home nor road */ } else if (x[3]) r['h' + res]++; else r['a' + res]++;
            if (Math.abs(x[1] - x[2]) <= 8) r['c' + res]++;
          }
          r.log.push({ d: g.day, wk: g.week, type: g.type, home: x[3], neutral: g.neutral, pf: x[1], pa: x[2], res: res, margin: x[1] - x[2], opp: x[4], oppAbbr: x[5] || '', grp: same, post: post, note: g.note });
        });
      });
      Object.keys(R).forEach(function (id) {
        var r = R[id], log = r.log.filter(function (x) { return !x.post; }), n = 0, last = null;
        for (var i = log.length - 1; i >= 0; i--) { if (last === null) last = log[i].res; if (log[i].res !== last) break; n++; }
        r.streak = log.length ? last.toUpperCase() + n : '';
        r.pct = r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : null;
        r.gpct = r.gw + r.gl + r.gt ? (r.gw + r.gt / 2) / (r.gw + r.gl + r.gt) : null;
      });
      return R;
    };
    return API;
  };
})();
