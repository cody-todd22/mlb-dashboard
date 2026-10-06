/* MLB Live Board — data layer for the public MLB Stats API (statsapi.mlb.com).
 * Every function returns data normalized to the shapes the UI renders, so the
 * bundled snapshot (snapshot.js) can stand in when the API can't be reached. */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});
  var API = {};

  function qs(params) {
    var parts = [];
    Object.keys(params).forEach(function (k) {
      if (params[k] === undefined || params[k] === null || params[k] === '') return;
      parts.push(encodeURIComponent(k) + '=' + String(params[k]).split(',').map(encodeURIComponent).join(',').replace(/%28/g, '(').replace(/%29/g, ')'));
    });
    return parts.join('&');
  }

  API.get = function (path, params) {
    var url = X.API_BASE + path + (params ? '?' + qs(params) : '');
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('MLB Stats API returned ' + r.status + ' for ' + path);
      return r.json();
    }, function (err) { clearTimeout(timer); throw err; });
  };

  function num(v) {
    if (v === null || v === undefined || v === '' || v === '-.--' || v === '.---') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  /* Innings come as "180.1" = 180⅓. */
  function ipNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var p = String(v).split('.'), w = parseInt(p[0], 10), f = p[1] ? parseInt(p[1], 10) : 0;
    return isNaN(w) ? null : w + (f === 1 ? 1 / 3 : f === 2 ? 2 / 3 : 0);
  }
  function parseStat(raw) {
    var st = {};
    Object.keys(raw || {}).forEach(function (k) {
      var n = /^innings/i.test(k) ? ipNum(raw[k]) : num(raw[k]);
      if (n !== null) st[k] = n;
    });
    return st;
  }
  API.num = num;
  API.ipNum = ipNum;

  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  API.ymd = ymd;

  /* Month windows from Opening Day to `end`. A first month shorter than two weeks
   * (late-March openers) folds into the next one. → [{ label, start, end, months: [3, 4] }] */
  API.monthWindows = function (startDate, endDate) {
    var start = new Date(startDate + 'T12:00:00'), end = new Date(endDate + 'T12:00:00');
    var out = [], cur = new Date(start);
    while (cur <= end) {
      var mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 12);
      var wEnd = mEnd < end ? mEnd : end;
      out.push({ label: cur.toLocaleString('en-US', { month: 'short' }), start: ymd(cur), end: ymd(wEnd), months: [cur.getMonth() + 1] });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12);
    }
    if (out.length > 1 && (new Date(out[0].end) - new Date(out[0].start)) / 86400000 < 13) {
      out[1].start = out[0].start; out[1].months = out[0].months.concat(out[1].months); out.shift();
    }
    return out;
  };

  /* Season calendar: { year, start, end, postStart, postEnd } as YYYY-MM-DD strings. */
  API.season = function (year) {
    return API.get('/seasons/' + year, { sportId: 1 }).then(function (j) {
      var s = (j.seasons || [])[0];
      if (!s) return null;
      return { year: year, start: s.regularSeasonStartDate, end: s.regularSeasonEndDate, postStart: s.postSeasonStartDate, postEnd: s.postSeasonEndDate || s.seasonEndDate };
    });
  };

  /* Standings → { teamId: record } */
  API.normStandings = function (json) {
    var out = {};
    (json.records || []).forEach(function (rec) {
      var divId = rec.division && rec.division.id;
      (rec.teamRecords || []).forEach(function (tr) {
        var split = {};
        ((tr.records || {}).splitRecords || []).forEach(function (s) { split[s.type] = s; });
        var w = tr.wins, l = tr.losses;
        var sc = (tr.streak && tr.streak.streakCode) || '';
        function wl(s) { return s ? s.wins + '–' + s.losses : null; }
        function pct(s) { return s && (s.wins + s.losses) ? s.wins / (s.wins + s.losses) : null; }
        out[tr.team.id] = {
          w: w, l: l, pct: (w + l) ? w / (w + l) : 0,
          rd: tr.runDifferential, rs: tr.runsScored, ra: tr.runsAllowed,
          gb: tr.gamesBack, divRank: parseInt(tr.divisionRank, 10) || null, div: divId || (X.TEAM_BY_ID[tr.team.id] || {}).div,
          streak: sc || null, streakN: sc ? (sc.charAt(0) === 'W' ? 1 : -1) * parseInt(sc.slice(1), 10) : null,
          l10: wl(split.lastTen), l10w: split.lastTen ? split.lastTen.wins : null,
          home: wl(split.home), homePct: pct(split.home), away: wl(split.away), awayPct: pct(split.away)
        };
      });
    });
    return out;
  };
  API.standings = function (season, date) {
    return API.get('/standings', { leagueId: '103,104', season: season, standingsTypes: 'regularSeason', date: date, hydrate: 'team' }).then(API.normStandings);
  };

  /* Team season stats → { hit: {id: stat}, pit: {...}, fld: {...} } */
  API.teamStats = function (season, gameType) {
    var groups = [['hit', 'hitting'], ['pit', 'pitching'], ['fld', 'fielding']];
    return Promise.all(groups.map(function (g) {
      return API.get('/teams/stats', { season: season, sportId: 1, group: g[1], stats: 'season', gameType: gameType }).then(function (j) {
        var out = {};
        (((j.stats || [])[0] || {}).splits || []).forEach(function (sp) { if (sp.team) out[sp.team.id] = parseStat(sp.stat); });
        return out;
      }).catch(function () { return {}; });
    })).then(function (r) { return { hit: r[0], pit: r[1], fld: r[2] }; });
  };

  /* Team stats for every club over a date range (the API's byMonth split fails for teams). */
  API.teamRange = function (season, start, end, group, gameType) {
    return API.get('/teams/stats', { stats: 'byDateRange', startDate: start, endDate: end, group: group, season: season, sportId: 1, gameType: gameType }).then(function (j) {
      var out = {};
      (((j.stats || [])[0] || {}).splits || []).forEach(function (sp) { if (sp.team) out[sp.team.id] = parseStat(sp.stat); });
      return out;
    });
  };
  /* Every club's hitting and pitching for each month window → [{ label, hit: {id: stat}, pit: {...} }] */
  API.teamMonths = function (season, windows) {
    return Promise.all(windows.map(function (w) {
      return Promise.all([API.teamRange(season, w.start, w.end, 'hitting', 'R'), API.teamRange(season, w.start, w.end, 'pitching', 'R')])
        .then(function (r) { return { label: w.label, hit: r[0], pit: r[1] }; });
    }));
  };

  /* One leaderboard → [{ rank, name, pid, teamId, value }]. One category per request:
   * the endpoint falls back to default categories when a batch mixes stat groups. */
  /* WAR leaders from /stats?stats=sabermetrics. Sorted here too: with a teamId filter the API
   * doesn't fully sort by WAR. Ranks and ties follow the one-decimal value people see. */
  function warText(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  API.saberLeaders = function (season, group, opts) {
    var p = { stats: 'sabermetrics', group: group, season: season, sportId: 1, playerPool: 'ALL', sortStat: 'war', order: 'desc',
      limit: opts.teamId ? 100 : 60, gameType: opts.gameType || 'R' };
    if (opts.teamId) p.teamId = opts.teamId;
    return API.get('/stats', p).then(function (j) {
      var rows = (((j.stats || [])[0] || {}).splits || []).map(function (sp) {
        var war = num(sp.stat && sp.stat.war);
        return { name: (sp.player && sp.player.fullName) || '—', pid: sp.player && sp.player.id, teamId: sp.team && sp.team.id, war: war };
      }).filter(function (r) { return r.war !== null; });
      rows.sort(function (a, b) { return b.war - a.war; });
      var lastText = null, lastRank = 0;
      return rows.slice(0, opts.limit).map(function (r, i) {
        var text = warText(r.war);
        if (text !== lastText) { lastRank = i + 1; lastText = text; }
        return { rank: lastRank, name: r.name, pid: r.pid, teamId: r.teamId, value: text };
      });
    });
  };

  API.leaders = function (season, statKey, opts) {
    var s = X.STAT_BY_KEY[statKey];
    if (!s) return Promise.resolve([]);
    if (s.saber) return API.saberLeaders(season, s.group, opts);
    var p = { leaderCategories: s.cat, statGroup: s.group, season: season, sportId: 1, limit: opts.limit, leaderGameTypes: opts.gameType, playerPool: opts.pool };
    if (opts.teamId) p.teamId = opts.teamId;
    return API.get('/stats/leaders', p).then(function (j) {
      var blocks = j.leagueLeaders || [];
      var block = blocks.filter(function (b) { return String(b.statGroup || '').toLowerCase() === s.group && b.leaderCategory === s.cat; })[0] ||
        blocks.filter(function (b) { return String(b.statGroup || '').toLowerCase() === s.group; })[0];
      if (!block) return [];
      return (block.leaders || []).map(function (r) {
        return { rank: r.rank, name: (r.person && r.person.fullName) || '—', pid: r.person && r.person.id, teamId: r.team && r.team.id, value: r.value };
      });
    });
  };

  /* A club's players with season totals (all players) → [{ pid, name, stat }] */
  API.roster = function (season, teamId, group, gameType) {
    return API.get('/stats', { stats: 'season', group: group, teamId: teamId, season: season, sportId: 1, playerPool: 'ALL', limit: 200, gameType: gameType }).then(function (j) {
      return (((j.stats || [])[0] || {}).splits || []).map(function (sp) {
        return { pid: sp.player && sp.player.id, name: sp.player && sp.player.fullName, stat: parseStat(sp.stat) };
      }).filter(function (r) { return r.pid; });
    });
  };

  /* A player's stats month by month → { monthNumber: stat } */
  API.playerMonths = function (pid, group, season) {
    return API.get('/people/' + pid + '/stats', { stats: 'byMonth', group: group, season: season, gameType: 'R' }).then(function (j) {
      var out = {};
      (((j.stats || [])[0] || {}).splits || []).forEach(function (sp) { if (sp.month) out[sp.month] = parseStat(sp.stat); });
      return out;
    });
  };

  /* Every final regular-season game → [{ pk, d, a, h, as, hs }] (compact, one request). */
  API.seasonGames = function (season, start, end) {
    return API.get('/schedule', { sportId: 1, gameType: 'R', season: season, startDate: start, endDate: end,
      fields: 'dates,games,gamePk,officialDate,status,abstractGameState,teams,away,home,team,id,score' }).then(function (j) {
      var seen = {}, out = [];
      (j.dates || []).forEach(function (d) {
        (d.games || []).forEach(function (g) {
          if (!g.status || g.status.abstractGameState !== 'Final' || seen[g.gamePk]) return;
          var as = g.teams.away.score, hs = g.teams.home.score;
          if (typeof as !== 'number' || typeof hs !== 'number') return;
          seen[g.gamePk] = true;
          out.push({ pk: g.gamePk, d: g.officialDate, a: g.teams.away.team.id, h: g.teams.home.team.id, as: as, hs: hs });
        });
      });
      return out.sort(function (x, y) { return x.d < y.d ? -1 : (x.d > y.d ? 1 : x.pk - y.pk); });
    });
  };

  /* Schedule window → normalized games. */
  API.normGame = function (g) {
    var abs = g.status && g.status.abstractGameState;
    var state = abs === 'Live' ? 'live' : (abs === 'Final' ? 'final' : 'pre');
    var detailed = (g.status && g.status.detailedState) || '';
    var ls = g.linescore || {};
    var inning = '';
    if (state === 'live' && ls.currentInningOrdinal) inning = (ls.inningState ? ls.inningState + ' ' : '') + ls.currentInningOrdinal;
    var tvs = (g.broadcasts || []).filter(function (b) { return b.type === 'TV'; });
    var nat = tvs.filter(function (b) { return b.isNational; });
    var tv = (nat[0] || tvs[0] || {}).name || '';
    var ss = g.seriesStatus || null;
    var post = ['F', 'D', 'L', 'W'].indexOf(g.gameType) >= 0;
    function prob(side) { var p = g.teams[side].probablePitcher; return p ? p.fullName : null; }
    function side(s) { return { id: g.teams[s].team.id, name: g.teams[s].team.name, score: g.teams[s].score }; }
    return {
      pk: g.gamePk, date: g.gameDate, day: g.officialDate || (g.gameDate || '').slice(0, 10),
      tbd: !!(g.status && g.status.startTimeTBD), state: state, detailed: detailed,
      away: side('away'), home: side('home'),
      inning: inning, outs: state === 'live' && typeof ls.outs === 'number' ? ls.outs : null,
      gameType: g.gameType, post: post, round: post ? (g.seriesDescription || '') : '',
      gameNum: g.seriesGameNumber || null, gamesInSeries: g.gamesInSeries || null, ifNec: g.ifNecessary === 'Y',
      seriesStatus: ss ? { isTied: !!ss.isTied, wins: ss.wins, losses: ss.losses, winId: ss.winningTeam && ss.winningTeam.id, isOver: !!ss.isOver } : null,
      tv: tv, probAway: prob('away'), probHome: prob('home')
    };
  };
  var HYDRATE = 'team,linescore,probablePitcher,broadcasts(all),seriesStatus';
  API.schedule = function (startDate, endDate) {
    return API.get('/schedule', { sportId: 1, startDate: startDate, endDate: endDate, hydrate: HYDRATE }).then(function (j) {
      var out = [];
      (j.dates || []).forEach(function (d) { (d.games || []).forEach(function (g) { out.push(API.normGame(g)); }); });
      return out;
    });
  };
  /* One club's recent games (for its last 7 results). */
  API.teamSchedule = function (teamId, startDate, endDate) {
    return API.get('/schedule', { sportId: 1, teamId: teamId, startDate: startDate, endDate: endDate, hydrate: HYDRATE }).then(function (j) {
      var out = [];
      (j.dates || []).forEach(function (d) { (d.games || []).forEach(function (g) { out.push(API.normGame(g)); }); });
      return out;
    });
  };

  /* Postseason series in the window, from the most informative game of each matchup.
   * Matchups still waiting on a winner (placeholder teams) are left out. */
  API.seriesFromGames = function (games) {
    var by = {};
    games.filter(function (g) { return g.post && X.TEAM_BY_ID[g.away.id] && X.TEAM_BY_ID[g.home.id]; }).forEach(function (g) {
      var ids = [g.away.id, g.home.id].sort(function (x, y) { return x - y; });
      var key = g.gameType + ':' + ids.join('-');
      var e = by[key] || (by[key] = { ids: ids, nextPre: null, lastFinal: null, any: g });
      if (!g.seriesStatus) return;
      // a game not yet final carries the standing as of now; a final game, the standing after it
      if (g.state !== 'final') { if (!e.nextPre || g.date < e.nextPre.date) e.nextPre = g; }
      else if (!e.lastFinal || g.date > e.lastFinal.date) e.lastFinal = g;
    });
    return Object.keys(by).map(function (k) {
      var e = by[k], g = e.nextPre || e.lastFinal || e.any, ss = g.seriesStatus;
      var a = e.ids[0], b = e.ids[1], aw = 0, bw = 0;
      if (ss) {
        if (ss.isTied) { aw = bw = ss.wins || 0; }
        else if (ss.winId) { aw = ss.winId === a ? ss.wins : ss.losses; bw = ss.winId === b ? ss.wins : ss.losses; }
      }
      var n = g.gamesInSeries || e.any.gamesInSeries || 5;
      return { type: e.any.gameType, round: e.any.round, a: a, b: b, aw: aw || 0, bw: bw || 0, need: Math.ceil(n / 2), over: !!(ss && ss.isOver) };
    }).sort(function (x, y) { return String(x.round).localeCompare(String(y.round)); });
  };

  /* Month-end standings for the feature chart → { labels, snaps: [{ id: [W, L] }] }, snaps[0] = Opening Day. */
  API.race = function (season, startDate, endDate, seasonOver) {
    var wins = API.monthWindows(startDate, endDate);
    return Promise.all(wins.map(function (w) { return API.standings(season, w.end); })).then(function (list) {
      var zero = {};
      X.TEAMS.forEach(function (t) { zero[t.id] = [0, 0]; });
      var snaps = [zero].concat(list.map(function (st) {
        var m = {}; Object.keys(st).forEach(function (id) { m[id] = [st[id].w, st[id].l]; }); return m;
      }));
      var labels = ['Opening'].concat(wins.map(function (w) { return w.label; }));
      labels[labels.length - 1] = seasonOver ? 'Final' : 'Now';
      return { labels: labels, snaps: snaps, windows: wins };
    });
  };

  X.API = API;
})();
