/* Builds the offline snapshots from live data, using the boards' own data layers (js/api.js, js/college/api.js,
 * js/football/api.js). Runs in Node from tools/build-snapshots.mjs; it only needs the MLBX object, so it can also be
 * pasted into a browser console on the board to try it out.
 *
 * Each builder returns the object the matching board reads as its snapshot, or throws if the result looks wrong
 * (so a bad day at a data source never replaces a good snapshot). */
(function (root) {
  'use strict';
  function iso(d) { return d.toISOString().replace(/\.\d+Z$/, 'Z'); }
  function check(ok, what) { if (!ok) throw new Error('Snapshot check failed: ' + what); }
  /* Run tasks a few at a time; a task that fails yields null. */
  function pool(items, n, fn) {
    var out = new Array(items.length), i = 0;
    function next() { if (i >= items.length) return Promise.resolve(); var k = i++; return fn(items[k]).then(function (v) { out[k] = v; }, function () { out[k] = null; }).then(next); }
    var runners = []; for (var r = 0; r < Math.min(n, items.length); r++) runners.push(next());
    return Promise.all(runners).then(function () { return out; });
  }

  /* ───────── MLB ───────── */
  function mlb(X, now) {
    var API = X.API, today = API.ymd(now), year = now.getFullYear();
    function day(n) { return API.ymd(new Date(now.getTime() + n * 86400000)); }
    return API.season(year).then(function (info) { return !info || today < info.start ? API.season(year - 1) : info; }).then(function (info) {
      check(info && info.start && info.end, 'MLB season calendar');
      var end = today < info.end ? today : info.end, over = today > info.end;
      var phase = today < info.start ? 'pre' : (today <= info.end ? 'regular' : (info.postStart && today >= info.postStart && (!info.postEnd || today <= info.postEnd) ? 'post' : 'off'));
      /* In season: the days around today. Out of season: the last week of games played, so the ticker has results. */
      var from = phase === 'off' || phase === 'pre' ? API.ymd(new Date(new Date((info.postEnd || info.end) + 'T12:00:00').getTime() - 6 * 86400000)) : day(-3);
      var to = phase === 'off' || phase === 'pre' ? (info.postEnd || info.end) : day(6);
      return Promise.all([API.standings(info.year), API.teamStats(info.year, 'R'), API.schedule(from, to).catch(function () { return []; }), API.race(info.year, info.start, end, over)]).then(function (r) {
        var stats = X.STATS.filter(function (s) { return !s.saber; });
        return pool(stats, 4, function (s) { return API.leaders(info.year, s.key, { teamId: null, limit: 10, pool: 'QUALIFIED', gameType: 'R' }); }).then(function (lists) {
          var leaders = { MLB: {} };
          stats.forEach(function (s, i) { if (lists[i] && lists[i].length) leaders.MLB[s.key] = lists[i].map(function (x) { return { rank: x.rank, name: x.name, teamId: x.teamId, value: x.value }; }); });
          var race = r[3];
          var snap = { asOf: iso(now), now: iso(now), season: info.year, phase: phase, standings: r[0], teamStats: r[1], games: r[2], series: API.seriesFromGames(r[2]),
            race: { labels: race.labels, snaps: race.snaps, months: race.windows.map(function (w) { return w.label; }) }, leaders: leaders, sampleLive: {} };
          check(Object.keys(snap.standings).length === 30, 'MLB standings for 30 clubs');
          check(snap.teamStats && snap.teamStats.hit && Object.keys(snap.teamStats.hit).length === 30, 'MLB team stats');
          check(snap.race.snaps.length >= 2, 'MLB race snapshots');
          check(Object.keys(leaders.MLB).length >= 20, 'MLB leader lists (' + Object.keys(leaders.MLB).length + ')');
          return snap;
        });
      });
    });
  }

  /* ───────── College baseball ───────── */
  function college(X, now, onProgress) {
    var C = X.College, API = C.API, season = API.seasonFor(now), today = API.ymd(now);
    var indIds = C.STATS.map(function (s) { return s.id; });
    var teamIds = C.TEAM_METRICS.filter(function (m) { return m.src !== 'st' && /^\d+$/.test(String(m.id)); }).map(function (m) { return m.id; });
    [C.RUNS_FOR, C.RUNS_AGAINST].forEach(function (id) { if (id && teamIds.indexOf(id) < 0) teamIds.push(id); });
    return Promise.all([API.statList('team', C.WL_LIST, true), API.rankings()]).then(function (r) {
      var records = {};
      r[0].rows.forEach(function (row) {
        var t = C.TEAM_BY_NAME[C.nameKey(row.Team)]; if (!t) return;
        records[t.seo] = [parseInt(row.W, 10) || 0, parseInt(row.L, 10) || 0, parseInt(row.T, 10) || 0];
      });
      return pool(indIds, 2, function (id) { return API.statList('individual', id, false); }).then(function (ind) {
        return pool(teamIds, 2, function (id) { return API.statList('team', id, true); }).then(function (tm) {
          return API.season(season, today, onProgress, true).then(function (res) {
            var cut = API.addDays(today < season.end ? today : season.end, -21);
            var games = res.games.filter(function (g) { return g.round || g.day >= cut; }).map(function (g) {
              return [g.day, g.pk, Math.round(new Date(g.date).getTime() / 1000), g.state.charAt(0), g.away.seo, g.home.seo, g.away.score, g.home.score, g.round || '', g.away.name || '', g.home.name || ''];
            });
            var snap = { asOf: iso(now), now: iso(now), season: season.year, statsUpdated: r[0].updated || '', records: records,
              rankings: { title: r[1].title, updated: r[1].updated, rows: r[1].rows.map(function (x) { return [x.rank, x.name, x.record, x.prev]; }) }, ind: {}, team: {}, games: games };
            indIds.forEach(function (id, i) { if (ind[i] && ind[i].rows.length) snap.ind[id] = ind[i].rows.slice(0, 50).map(function (x) { return [x.Rank, String(x.Name || '').trim(), String(x.Team || '').trim(), API.valueOf(x)]; }); });
            teamIds.forEach(function (id, i) { if (tm[i] && tm[i].rows.length) snap.team[id] = tm[i].rows.map(function (x) { var row = [x.Rank, x.Team, API.valueOf(x)]; if (x.R != null) row.push(x.R); return row; }); });
            check(Object.keys(records).length >= 250, 'college records (' + Object.keys(records).length + ')');
            check(snap.rankings.rows.length >= 20, 'college Top 25');
            check(Object.keys(snap.ind).length >= 8, 'college player lists');
            return snap;
          });
        });
      });
    });
  }

  /* ───────── NFL and College football ───────── */
  function football(X, lid, now) {
    var F = X.Football, L = F.LEAGUES[lid], API = F.makeAPI(L);
    return API.calendar().then(function (cal) {
      var weeks = cal.weeks, cur = API.currentWeek(weeks, now);
      check(cur && weeks.length >= 10, lid + ' calendar');
      return pool(weeks, 3, function (w) { return API.week(cal.season, w.type, w.week).then(function (gs) { return { w: w, gs: gs }; }); }).then(function (all) {
        var games = [], played = 0;
        all.forEach(function (x) {
          if (!x) return;
          x.gs.forEach(function (g) {
            if (g.state === 'final') played = Math.max(played, x.w.type * 100 + x.w.week);
            games.push([x.w.type, x.w.week, g.pk, Math.round(new Date(g.date).getTime() / 1000), g.state === 'live' ? 'p' : g.state.charAt(0), g.away.id, g.home.id,
              g.state === 'final' ? g.away.score : null, g.state === 'final' ? g.home.score : null, g.note, g.confGame ? 1 : 0, g.neutral ? 1 : 0,
              L.TEAM_BY_ID[g.away.id] ? '' : g.away.abbr, L.TEAM_BY_ID[g.home.id] ? '' : g.home.abbr, g.tbd ? 1 : 0]);
          });
        });
        return Promise.all([
          pool(F.STATS, 2, function (s) { return API.leaders(s, { season: cal.season, all: true, pages: 1 }); }),
          API.teamStats(cal.season).catch(function () { return null; }),
          lid === 'cfb' ? API.rankings(cal.season, cur.type === 2 ? cur.week : 16).catch(function () { return null; }) : Promise.resolve(null)
        ]).then(function (r) {
          var leaders = {}, teamStats = {};
          F.STATS.forEach(function (s, i) { if (r[0][i] && r[0][i].length) leaders[s.key] = r[0][i].slice(0, 120).map(function (x) { return [x.name, x.teamId, x.value]; }); });
          if (r[1]) Object.keys(r[1]).forEach(function (id) {
            var m = {}; F.TEAM_METRICS.forEach(function (tm) { if (tm.src === 'ts') { var v = API.tsValue(r[1][id], tm.id); if (v != null) m[tm.id] = v; } });
            if (L.TEAM_BY_ID[id]) teamStats[id] = m;
          });
          var last = weeks.filter(function (w) { return w.type * 100 + w.week === played; })[0];
          var snap = { season: cal.season, now: iso(now), asOf: iso(now), current: { type: cur.type, week: cur.week }, weeks: weeks, games: games, leaders: leaders, teamStats: teamStats,
            note: (last ? 'Results through ' + last.label : 'Schedule only') + ' · player and team stats from ESPN as of ' + now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) };
          if (lid === 'cfb' && r[2]) snap.rankings = r[2];
          check(games.length >= (lid === 'nfl' ? 250 : 600), lid + ' games (' + games.length + ')');
          check(Object.keys(leaders).length >= 10, lid + ' leader lists (' + Object.keys(leaders).length + ')');
          return snap;
        });
      });
    });
  }

  root.SnapshotBuilders = { mlb: mlb, college: college, football: football };
})(typeof window !== 'undefined' ? window : globalThis);
