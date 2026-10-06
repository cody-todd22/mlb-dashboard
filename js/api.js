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
      // keep parentheses and commas readable; the API accepts them unescaped
      parts.push(encodeURIComponent(k) + '=' + String(params[k]).split(',').map(encodeURIComponent).join(',').replace(/%28/g, '(').replace(/%29/g, ')'));
    });
    return parts.join('&');
  }

  API.get = function (path, params) {
    var url = X.API_BASE + path + (params ? '?' + qs(params) : '');
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
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
  API.num = num;

  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  API.ymd = ymd;

  /* Season calendar: { start, end, postStart, postEnd } as YYYY-MM-DD strings. */
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

  /* Team season stats → { hit: {id: stat}, pit: {...}, fld: {...} } with numbers parsed. */
  API.teamStats = function (season, gameType) {
    var groups = [['hit', 'hitting'], ['pit', 'pitching'], ['fld', 'fielding']];
    return Promise.all(groups.map(function (g) {
      return API.get('/teams/stats', { season: season, sportId: 1, group: g[1], stats: 'season', gameType: gameType }).then(function (j) {
        var out = {};
        (((j.stats || [])[0] || {}).splits || []).forEach(function (sp) {
          var st = {};
          Object.keys(sp.stat || {}).forEach(function (k) { var n = num(sp.stat[k]); if (n !== null) st[k] = n; });
          if (sp.team) out[sp.team.id] = st;
        });
        return out;
      }).catch(function () { return {}; });
    })).then(function (r) { return { hit: r[0], pit: r[1], fld: r[2] }; });
  };

  /* One leaderboard → [{ rank, name, teamId, value }]. One category per request:
   * the endpoint falls back to default categories when a batch mixes stat groups. */
  API.leaders = function (season, statKey, opts) {
    var s = X.STAT_BY_KEY[statKey];
    if (!s) return Promise.resolve([]);
    var p = { leaderCategories: s.cat, statGroup: s.group, season: season, sportId: 1, limit: opts.limit, leaderGameTypes: opts.gameType, playerPool: opts.pool };
    if (opts.teamId) p.teamId = opts.teamId;
    return API.get('/stats/leaders', p).then(function (j) {
      var blocks = j.leagueLeaders || [];
      var block = blocks.filter(function (b) { return String(b.statGroup || '').toLowerCase() === s.group && b.leaderCategory === s.cat; })[0] ||
        blocks.filter(function (b) { return String(b.statGroup || '').toLowerCase() === s.group; })[0];
      if (!block) return [];
      return (block.leaders || []).map(function (r) {
        return { rank: r.rank, name: (r.person && r.person.fullName) || '—', teamId: r.team && r.team.id, value: r.value };
      });
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
    return {
      pk: g.gamePk, date: g.gameDate, day: g.officialDate || (g.gameDate || '').slice(0, 10),
      tbd: !!(g.status && g.status.startTimeTBD), state: state, detailed: detailed,
      away: { id: g.teams.away.team.id, score: g.teams.away.score }, home: { id: g.teams.home.team.id, score: g.teams.home.score },
      inning: inning, outs: state === 'live' && typeof ls.outs === 'number' ? ls.outs : null,
      gameType: g.gameType, post: post, round: post ? (g.seriesDescription || '') : '',
      gameNum: g.seriesGameNumber || null, gamesInSeries: g.gamesInSeries || null, ifNec: g.ifNecessary === 'Y',
      seriesNote: ss ? (ss.shortDescription && ss.result ? ss.result : (ss.result || '')) : '',
      seriesStatus: ss ? { isTied: !!ss.isTied, wins: ss.wins, losses: ss.losses, winId: ss.winningTeam && ss.winningTeam.id, loseId: ss.losingTeam && ss.losingTeam.id, isOver: !!ss.isOver } : null,
      tv: tv, probAway: prob('away'), probHome: prob('home')
    };
  };
  API.schedule = function (startDate, endDate) {
    return API.get('/schedule', { sportId: 1, startDate: startDate, endDate: endDate, hydrate: 'team,linescore,probablePitcher,broadcasts(all),seriesStatus' })
      .then(function (j) {
        var out = [];
        (j.dates || []).forEach(function (d) { (d.games || []).forEach(function (g) { out.push(API.normGame(g)); }); });
        return out;
      });
  };

  /* Postseason series in the window, from the most recent game of each matchup. */
  API.seriesFromGames = function (games) {
    var by = {};
    games.filter(function (g) { return g.post; }).forEach(function (g) {
      var ids = [g.away.id, g.home.id].sort(function (x, y) { return x - y; });
      var key = g.gameType + ':' + ids.join('-');
      var e = by[key] || (by[key] = { ids: ids, nextPre: null, lastFinal: null, any: g });
      if (!g.seriesStatus) return;
      // a game not yet final carries the series standing as of now; a final game, the standing after it
      if (g.state !== 'final') { if (!e.nextPre || g.date < e.nextPre.date) e.nextPre = g; }
      else if (!e.lastFinal || g.date > e.lastFinal.date) e.lastFinal = g;
    });
    return Object.keys(by).map(function (k) {
      var e = by[k], g = e.nextPre || e.lastFinal || e.any, ss = g.seriesStatus;
      e.g = e.any;
      var a = e.ids[0], b = e.ids[1], aw = 0, bw = 0;
      if (ss) {
        if (ss.isTied) { aw = bw = ss.wins || 0; }
        else if (ss.winId) { aw = ss.winId === a ? ss.wins : ss.losses; bw = ss.winId === b ? ss.wins : ss.losses; }
      }
      var games = g.gamesInSeries || e.g.gamesInSeries || 5;
      return { round: g.round || e.g.round, a: a, b: b, aw: aw || 0, bw: bw || 0, need: Math.ceil(games / 2), over: !!(ss && ss.isOver), note: g.seriesNote || '' };
    }).sort(function (x, y) { return String(x.round).localeCompare(String(y.round)); });
  };

  /* Month-end standings for the season race chart. */
  API.race = function (season, startDate, endDate) {
    var start = new Date(startDate + 'T12:00:00'), end = new Date(endDate + 'T12:00:00');
    var stops = [], labels = ['Opening'];
    var cur = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
    // a month-end within two weeks of Opening Day adds a crowded, near-empty point; start with the next one
    if ((cur - start) / 86400000 < 14) cur = new Date(cur.getFullYear(), cur.getMonth() + 2, 0, 12);
    while (cur < end) {
      stops.push(ymd(cur));
      labels.push(cur.toLocaleString('en-US', { month: 'short' }));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 2, 0, 12);
    }
    stops.push(ymd(end));
    labels.push(end >= new Date() ? 'Today' : 'Final');
    return Promise.all(stops.map(function (d) { return API.standings(season, d); })).then(function (list) {
      var pts = {};
      X.TEAMS.forEach(function (t) {
        pts[t.id] = [[0, 0]].concat(list.map(function (st) { var r = st[t.id]; return r ? [r.w, r.l] : null; }));
      });
      return { labels: labels, pts: pts };
    });
  };

  X.API = API;
})();
