/* MLB Live Board · Football modes (NFL and FBS college football) — state, data loading, rendering,
 * ticker, weekly feature charts, settings, TV mode. One factory, two boards: F.Apps.nfl and F.Apps.cfb.
 * Three levels: everyone → a division (NFL) or conference (FBS) → a team. Reuses the board's CSS and charts. */
(function () {
  'use strict';
  var X = window.MLBX, F = X.Football, CH = X.Charts;
  var esc = CH.esc, rate3 = CH.rate3, signed = CH.signed;
  var LS_SHARED = 'mlb-live-board:settings';
  var SHARED_KEYS = ['theme', 'layout', 'tvRotate', 'ticker', 'tickerSpeed', 'refresh', 'limit', 'league'];
  var SHARED_DEFAULTS = { theme: 'auto', layout: 'standard', tvRotate: 12, ticker: true, tickerSpeed: 'normal', refresh: true, limit: 5, league: 'nfl' };

  function make(LID) {
    var L = F.LEAGUES[LID], API = F.makeAPI(L), NFL = LID === 'nfl', LS_OWN = 'mlb-live-board:' + LID;
    var S = { settings: null, cs: null, scope: 'ALL', view: 'dash', data: null, ext: {}, pendingExt: {}, tickPaused: false,
      tv: { chart: 0, board: 0, timer: null }, timers: {}, nextDailyAt: 0, wake: null, loadError: null, resetArmed: false, crawl: null, stopped: true };
    var TK = { x: 0, last: null, raf: null, hover: false };

    /* ───────── utilities ───────── */
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
    function team(id) { return L.TEAM_BY_ID[id]; }
    function abbr(id, fb) { var t = team(id); return t ? t.abbr : (fb || '—'); }
    function nick(id) { var t = team(id); return t ? (NFL ? t.nick : t.school) : '—'; }
    function groupOf(id) { var t = team(id); return t ? t.group : null; }
    function group(gid) { return L.GROUP_BY_ID[gid]; }
    function groupTeams(gid) { return L.teams.filter(function (t) { return t.group === gid; }).map(function (t) { return t.id; }); }
    function allIds() { return L.teams.map(function (t) { return t.id; }); }
    function isAll() { return S.scope === 'ALL'; }
    function scopeGroupOnly() { return S.scope.indexOf('g:') === 0 ? S.scope.slice(2) : null; }
    function scopeTeam() { return !isAll() && !scopeGroupOnly() ? S.scope : null; }
    function scopeGroup() { return scopeGroupOnly() || (scopeTeam() ? groupOf(scopeTeam()) : null); }
    function entity() { return isAll() ? L.root : (scopeTeam() ? team(scopeTeam()) : group(scopeGroupOnly())); }
    function inScope(id) { if (isAll()) return true; if (scopeTeam()) return id === scopeTeam(); return groupOf(id) === scopeGroupOnly(); }
    function involves(g, id) { return g.away.id === id || g.home.id === id; }
    function involvesScope(g) { return isAll() || inScope(g.away.id) || inScope(g.home.id); }
    function confOf(id) { var t = team(id); return t ? (NFL ? t.conf : t.group) : null; }
    function nowDate() { return S.data && S.data.source === 'snapshot' ? new Date(S.data.now) : new Date(); }
    function dayKey(d) { return API.ymd(d); }
    function byDate(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); }
    function isLive() { return S.data && S.data.source === 'live'; }
    function isSnap() { return S.data && S.data.source === 'snapshot'; }
    function wl(w, l, t) { return w + '–' + l + (t ? '–' + t : ''); }
    function pctOf(w, l, t) { var n = w + l + (t || 0); return n ? (w + (t || 0) / 2) / n : null; }
    function shortName(n) { var p = String(n).split(' '); return p.length > 1 ? p[0].charAt(0) + '. ' + p.slice(1).join(' ') : n; }
    function whenLabel(g) {
      var dk = g.day, n = nowDate(), t = dayKey(n), tm = dayKey(new Date(n.getTime() + 86400000)), ys = dayKey(new Date(n.getTime() - 86400000));
      if (dk === t) return 'Today'; if (dk === tm) return 'Tomorrow'; if (dk === ys) return 'Yesterday';
      var d = new Date(g.date), diff = (d - n) / 86400000;
      if (diff > 0 && diff < 6) return d.toLocaleDateString([], { weekday: 'short' });
      return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    }
    function timeLabel(g) { return g.tbd ? 'Time TBA' : new Date(g.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
    function weekLabel(type, week) {
      var w = (S.data && S.data.weeks || []).filter(function (x) { return x.type === type && x.week === week; })[0];
      if (w) return w.label;
      return type === 3 ? 'Postseason' : 'Week ' + week;
    }
    function weekShort(type, week) {
      if (type === 2) return 'W' + week;
      var l = weekLabel(type, week);
      if (/wild/i.test(l)) return 'WC'; if (/divis/i.test(l)) return 'DIV'; if (/conf/i.test(l)) return 'CONF'; if (/super/i.test(l)) return 'SB';
      return /bowl/i.test(l) ? 'BOWL' : 'POST';
    }

    function msgLoading(what) { return '<div class="loading">Loading ' + esc(what) + '</div>'; }
    function msgSnapshot() { return '<div class="empty"><strong>Available with live data</strong>The saved snapshot doesn’t include this. It loads from ESPN on your hosted board.</div>'; }
    function msgNoData(what) { return '<div class="empty"><strong>No data came back</strong>ESPN returned nothing for ' + esc(what) + '. If this keeps happening, check the request in js/football/api.js.</div>'; }
    function missingShort() { return isLive() ? 'No data from ESPN' : 'Available with live data'; }
    function msgCrawl() {
      var c = S.crawl;
      if (c && c.failed) return msgNoData('the season’s scoreboards');
      return '<div class="loading">Loading the season’s results</div>';
    }

    /* ───────── settings ───────── */
    function readJSON(k) { try { var raw = window.localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
    function writeJSON(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
    function loadSettings() {
      var raw = readJSON(LS_SHARED) || {}, s = {};
      SHARED_KEYS.forEach(function (k) { s[k] = raw[k] !== undefined ? raw[k] : SHARED_DEFAULTS[k]; });
      var cs = clone(F.DEFAULT_SETTINGS[LID]), sc = readJSON(LS_OWN);
      if (sc && typeof sc === 'object') {
        Object.keys(cs).forEach(function (k) { if (k !== 'blocks' && sc[k] !== undefined) cs[k] = sc[k]; });
        if (sc.blocks) Object.keys(cs.blocks).forEach(function (k) { if (sc.blocks[k] !== undefined) cs.blocks[k] = sc.blocks[k]; });
      }
      var valid = { hide: true }; F.FEATURE_GROUPS[LID].forEach(function (g) { g.options.forEach(function (o) { valid[o[0]] = true; }); });
      if (!valid[cs.blocks.race]) cs.blocks.race = 'gap';
      S.settings = s; S.cs = cs;
    }
    function saveSettings() {
      var raw = readJSON(LS_SHARED) || {};
      SHARED_KEYS.forEach(function (k) { raw[k] = S.settings[k]; });
      writeJSON(LS_SHARED, raw); writeJSON(LS_OWN, S.cs);
    }
    function validScope(v) {
      if (v === 'ALL') return true;
      if (String(v).indexOf('g:') === 0) return !!group(String(v).slice(2));
      return !!team(v);
    }
    function isTV() { return S.settings.layout === 'tv' && S.view === 'dash'; }

    function applyChrome() {
      var root = document.documentElement;
      if (S.settings.theme === 'auto') root.removeAttribute('data-app-theme'); else root.setAttribute('data-app-theme', S.settings.theme);
      root.classList.toggle('tv', isTV());
      var t = entity() || L.root, st = root.style;
      st.setProperty('--team', t.primary); st.setProperty('--team-2', t.secondary); st.setProperty('--on-team-2', t.onSecondary);
      st.setProperty('--team-ink-l', t.inkLight); st.setProperty('--team-ink-d', t.inkDark); st.setProperty('--team-tick', t.tick || t.inkDark);
      var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t.primary);
      document.title = (isAll() ? '' : t.full + ' · ') + L.label + ' Live Board';
    }

    /* ───────── data ───────── */
    function phaseFor(d) {
      var now = nowDate().getTime(), ws = d.weeks;
      if (!ws.length) return 'regular';
      if (now < new Date(ws[0].start).getTime() || !d.games.some(function (g) { return g.state === 'final' || g.state === 'live'; })) return 'pre';
      if (now > new Date(ws[ws.length - 1].end).getTime()) return 'off';
      return d.cur && d.cur.type === 3 ? 'post' : 'regular';
    }
    function finishData(d) {
      d.recs = API.records(d.games);
      d.seeds = NFL ? computeSeeds(d.recs, d.espnSeeds) : null;
      d.phase = phaseFor(d);
      d._w = null;
    }
    function useSnapshot(err) {
      var sn = F.SNAPSHOT[LID];
      S.loadError = err ? String(err.message || err) : null;
      var games = sn.games.map(function (a) { var g = API.unpack(a.slice(2), a[0], a[1]); return g; }).sort(byDate);
      var d = { source: 'snapshot', asOf: sn.asOf, now: sn.now, season: sn.season, weeks: sn.weeks, cur: null, games: games, rankings: sn.rankings || null,
        teamStats: sn.teamStats || {}, espnSeeds: null, note: sn.note, partial: false };
      d.cur = API.currentWeek(d.weeks, new Date(sn.now));
      S.data = d; finishData(d);
    }
    function loadLive() {
      API.setRelay(S.cs.relay);
      var now = new Date();
      return API.calendar().then(function (cal) {
        var weeks = cal.weeks, cur = API.currentWeek(weeks, now);
        if (!cur) throw new Error('No season calendar returned');
        var upto = weeks.filter(function (w) { return new Date(w.start).getTime() <= now.getTime() || (w.type === cur.type && w.week === cur.week); });
        var nxt = weeks[weeks.indexOf(cur) + 1];
        return Promise.all([
          API.week(cal.season, cur.type, cur.week).then(function (gs) {
            return nxt ? API.week(cal.season, nxt.type, nxt.week).then(function (ng) { return gs.concat(ng.map(function (g) { g.nextWeek = true; return g; })); }, function () { return gs; }) : gs;
          }),
          API.season(cal.season, upto.filter(function (w) { return !(w.type === cur.type && w.week === cur.week); }), now),
          NFL ? API.standings(cal.season).catch(function () { return null; }) : Promise.resolve(null),
          NFL ? Promise.resolve(null) : API.rankings(cal.season, cur.type === 2 ? cur.week : 16).catch(function () { return null; })
        ]).then(function (r) {
          var byPk = {}; r[1].concat(r[0]).forEach(function (g) { byPk[g.pk] = g; });
          var d = { source: 'live', asOf: new Date().toISOString(), now: null, season: cal.season, weeks: weeks, cur: cur, curGames: r[0].filter(function (g) { return !g.nextWeek; }),
            games: Object.keys(byPk).map(function (k) { return byPk[k]; }).sort(byDate), rankings: r[3], teamStats: null, espnSeeds: r[2], partial: false };
          S.data = d; S.ext = {}; S.pendingExt = {}; finishData(d);
          API.teamStats(cal.season).then(function (ts) { if (S.data === d) { d.teamStats = ts; queueRefresh(); } }, function () { if (S.data === d) { d.teamStats = { error: true }; queueRefresh(); } });
        });
      });
    }
    function refreshScores() {
      if (!isLive()) return Promise.resolve();
      var d = S.data;
      return API.week(d.season, d.cur.type, d.cur.week).then(function (gs) {
        var byPk = {}; d.games.forEach(function (g) { byPk[g.pk] = g; }); gs.forEach(function (g) { byPk[g.pk] = g; });
        d.games = Object.keys(byPk).map(function (k) { return byPk[k]; }).sort(byDate); d.curGames = gs; d.asOf = new Date().toISOString();
        finishData(d); refreshTicker(); refreshMain(); refreshStatus();
      }).catch(function () { /* keep the last good scores */ });
    }
    function curGames() { var d = S.data; return d.curGames || d.games.filter(function (g) { return d.cur && g.type === d.cur.type && g.week === d.cur.week; }); }
    /* Scores every minute while a game is live; otherwise sleep until about a minute before the next kickoff. */
    function scheduleScores() {
      clearTimeout(S.timers.sched);
      if (!S.settings.refresh || !isLive()) return;
      var now = Date.now(), gs = curGames(), delay = null;
      if (gs.some(function (g) { return g.state === 'live'; })) delay = 60000;
      else {
        var starts = gs.filter(function (g) { return g.state === 'pre' && !g.tbd; }).map(function (g) { return new Date(g.date).getTime(); });
        if (starts.some(function (t) { return t <= now && now - t < 5 * 3600000; })) delay = 60000;
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
    function queueRefresh() { if (queued || S.stopped) return; queued = true; setTimeout(function () { queued = false; refreshStatus(); refreshMain(); }, 80); }

    /* ───────── standings and seeds ───────── */
    function rec(id) { return (S.data.recs || {})[id] || { w: 0, l: 0, t: 0, gw: 0, gl: 0, gt: 0, pf: 0, pa: 0, gp: 0, pct: null, gpct: null, streak: '', log: [] }; }
    function byRecord(a, b) {
      var A = rec(a), B = rec(b);
      return ((B.pct == null ? -1 : B.pct) - (A.pct == null ? -1 : A.pct)) || ((B.gpct || 0) - (A.gpct || 0)) || ((B.pf - B.pa) - (A.pf - A.pa)) || (B.w - A.w);
    }
    function groupStandings(gid) {
      var ids = groupTeams(gid);
      if (NFL) return ids.sort(byRecord);
      return ids.sort(function (a, b) {   // FBS: conference record first
        var A = rec(a), B = rec(b);
        return ((B.gpct == null ? -1 : B.gpct) - (A.gpct == null ? -1 : A.gpct)) || (B.gw - A.gw) || ((B.pct || 0) - (A.pct || 0)) || ((B.pf - B.pa) - (A.pf - A.pa));
      });
    }
    /* NFL seeds: ESPN's own playoff seeds when the standings feed has them; otherwise division
       winners by record (1–4), then the three best other records (5–7), ties broken by division
       record and point differential, which approximates but doesn't replicate the NFL's tiebreakers. */
    function computeSeeds(recs, espn) {
      var out = { AFC: [], NFC: [], approx: true };
      if (espn && Object.keys(espn).some(function (id) { return espn[id].seed; })) {
        ['AFC', 'NFC'].forEach(function (c) {
          out[c] = L.teams.filter(function (t) { return t.conf === c && espn[t.id] && espn[t.id].seed; }).map(function (t) { return { id: t.id, seed: espn[t.id].seed }; }).sort(function (a, b) { return a.seed - b.seed; });
        });
        if (out.AFC.length >= 7 && out.NFC.length >= 7) { out.approx = false; return out; }
      }
      ['AFC', 'NFC'].forEach(function (c) {
        var divs = L.groups.filter(function (g) { return g.conf === c; }).map(function (g) { return g.id; });
        var leaders = divs.map(function (g) { return groupStandings(g)[0]; }).sort(byRecord);
        var rest = L.teams.filter(function (t) { return t.conf === c && leaders.indexOf(t.id) < 0; }).map(function (t) { return t.id; }).sort(byRecord);
        out[c] = leaders.map(function (id, i) { return { id: id, seed: i + 1 }; }).concat(rest.map(function (id, i) { return { id: id, seed: i + 5 }; }));
      });
      return out;
    }
    function seedOf(id) { var d = S.data; if (!d.seeds) return null; var c = confOf(id), x = (d.seeds[c] || []).filter(function (s) { return s.id === id; })[0]; return x ? x.seed : null; }

    /* ───────── polls (FBS) ───────── */
    function rankOf(id) {
      var rk = S.data && S.data.rankings; if (!rk) return null;
      var r = rk.rows.filter(function (x) { return x.id === id; })[0]; return r ? r.rank : null;
    }
    function rankTag(id) { var r = NFL ? null : rankOf(id); return r ? '<span class="tk-rk">' + r + '</span>' : ''; }
    function topIds(n) {
      if (NFL) return allIds().filter(function (id) { return rec(id).gp; }).sort(byRecord).slice(0, n);
      var rk = S.data.rankings; return rk ? rk.rows.slice(0, n).map(function (r) { return r.id; }).filter(team) : allIds().sort(byRecord).slice(0, n);
    }
    function ranked(g) { return rankOf(g.away.id) || rankOf(g.home.id); }
    function rankFirst(a, b) { var ra = Math.min(rankOf(a.away.id) || 99, rankOf(a.home.id) || 99), rb = Math.min(rankOf(b.away.id) || 99, rankOf(b.home.id) || 99); return ra - rb || byDate(a, b); }

    /* ───────── leaders ───────── */
    function leaderList(stat, all) {
      if (isSnap()) {
        var s = F.SNAPSHOT[LID].leaders[stat.key];
        return s ? { rows: s.map(function (r) { return { name: r[0], teamId: r[1], value: r[2] }; }) } : { missing: true };
      }
      var v = need('L|' + stat.key + '|' + (all ? 1 : 0), function () { return API.leaders(stat, { season: S.data.season, all: all }); });
      if (v === undefined) return { loading: true };
      if (isErr(v)) return { error: true };
      return { rows: v };
    }
    function rankUp(rows) {
      var last = null, lastText = null;
      return rows.map(function (r, i) { var rk = r.value === lastText ? last : i + 1; last = rk; lastText = r.value; return { rank: rk, name: r.name, teamId: r.teamId, value: r.value }; });
    }
    function leaderState(key) {
      var s = F.STAT_BY_KEY[key]; if (!s || !S.data) return { loading: true };
      var Lst = leaderList(s, !isAll() && !s.rate);
      if (!Lst.rows) return Lst;
      var rows = isAll() ? Lst.rows : Lst.rows.filter(function (r) { return inScope(r.teamId); });
      return { rows: rankUp(rows).slice(0, S.settings.limit), scoped: !isAll(), rate: s.rate };
    }

    /* ───────── club metrics ───────── */
    function metric(id, key) {
      var m = F.METRIC_BY_KEY[key], d = S.data; if (!m || !d) return { loading: true };
      if (m.src === 'ts') {
        if (isSnap()) { var sr = (d.teamStats || {})[id]; return sr && sr[m.id] != null ? { v: sr[m.id], text: fmtMetric(m, sr[m.id]) } : { missing: true }; }
        if (!d.teamStats) return { loading: true };
        if (d.teamStats.error) return { none: true };
        var v = API.tsValue(d.teamStats[id], m.id);
        return v != null ? { v: v, text: fmtMetric(m, v) } : { none: true };
      }
      var r = rec(id);
      if (!r.gp && m.id !== 'record') return { none: true };
      switch (m.id) {
        case 'record': return { v: r.pct, text: wl(r.w, r.l, r.t) };
        case 'pct': return { v: r.pct, text: rate3(r.pct || 0) };
        case 'grp': return r.gw + r.gl + r.gt ? { v: r.gpct, text: wl(r.gw, r.gl, r.gt) } : { none: true };
        case 'ppg': return { v: r.pf / r.gp, text: (r.pf / r.gp).toFixed(1) };
        case 'oppg': return { v: r.pa / r.gp, text: (r.pa / r.gp).toFixed(1) };
        case 'diff': return { v: r.pf - r.pa, text: signed(r.pf - r.pa) };
        case 'streak': return { v: (r.streak.charAt(0) === 'W' ? 1 : -1) * parseInt(r.streak.slice(1) || '0', 10), text: r.streak || '—' };
        case 'home': return { v: pctOf(r.hw, r.hl, r.ht), text: wl(r.hw, r.hl, r.ht) };
        case 'away': return { v: pctOf(r.aw, r.al, r.at), text: wl(r.aw, r.al, r.at) };
        case 'close': return r.cw + r.cl + r.ct ? { v: pctOf(r.cw, r.cl, r.ct), text: wl(r.cw, r.cl, r.ct) } : { none: true };
      }
      return { none: true };
    }
    function fmtMetric(m, v) {
      if (m.fmt === 'int') return String(Math.round(v));
      if (m.fmt === 'pct1') return v.toFixed(1) + '%';
      if (m.fmt === 'signed') return signed(Math.round(v));
      return v.toFixed(1);
    }
    function metricBest(ids, key) {
      var m = F.METRIC_BY_KEY[key], best = null, state = null;
      ids.forEach(function (id) {
        var x = metric(id, key);
        if (x.loading || x.missing) { state = state || x; return; }
        if (x.v == null || isNaN(x.v)) return;
        if (!best || (m.low ? x.v < best.x.v : x.v > best.x.v)) best = { id: id, x: x };
      });
      return best || state || { none: true };
    }
    function metricRank(id, key, pool) {
      var m = F.METRIC_BY_KEY[key], me = metric(id, key);
      if (me.v == null || isNaN(me.v)) return null;
      var vals = pool.map(function (s) { return metric(s, key).v; }).filter(function (v) { return v != null && !isNaN(v); });
      var better = vals.filter(function (v) { return m.low ? v < me.v : v > me.v; }).length, ties = vals.filter(function (v) { return v === me.v; }).length;
      return { rank: better + 1, tie: ties > 1, of: vals.length };
    }

    /* ───────── header ───────── */
    function contextLine() {
      var d = S.data; if (!d) return 'Loading';
      if (d.phase === 'off') return d.season + ' season · Final';
      if (d.phase === 'pre') return d.season + ' season · Kickoff ahead';
      return d.season + ' ' + (d.cur ? weekLabel(d.cur.type, d.cur.week) : 'season');
    }
    function statusHTML() {
      var d = S.data;
      if (!d) return '<span class="pill"><span class="dot"></span>Loading</span>';
      if (d.source === 'snapshot') {
        var at = new Date(d.asOf).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        return '<span class="pill snap" title="' + esc(S.loadError ? 'Live data unavailable: ' + S.loadError : '') + '">Snapshot</span><span class="ctx">' + esc(contextLine()) + ' · Data as of ' + esc(at) + '</span>';
      }
      var anyLive = curGames().some(function (x) { return x.state === 'live'; });
      return '<span class="pill"><span class="dot"></span>' + (anyLive ? 'Live' : 'Live data') + '</span><span class="ctx">' + esc(contextLine()) + ' · Updated ' + esc(new Date(d.asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</span>';
    }
    var CHEV = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    function scopeSelectsHTML(prefix) {
      var gid = scopeGroup();
      var gopts = '<option value="ALL"' + (isAll() ? ' selected' : '') + '>' + esc(L.allLabel) + '</option>';
      if (NFL) ['AFC', 'NFC'].forEach(function (c) {
        gopts += '<optgroup label="' + c + '">' + L.groups.filter(function (g) { return g.conf === c; }).map(function (g) { return '<option value="g:' + g.id + '"' + (gid === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</optgroup>';
      });
      else gopts += L.groups.map(function (g) { return '<option value="g:' + g.id + '"' + (gid === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('');
      var h = '<div class="pick"><label for="' + prefix + '-grp">' + esc(L.groupLabel) + '</label><div class="select-wrap"><select id="' + prefix + '-grp" data-act="grp">' + gopts + '</select>' + CHEV + '</div></div>';
      if (gid) {
        var topts = '<option value="g:' + gid + '"' + (scopeGroupOnly() ? ' selected' : '') + '>All teams</option>' + L.teams.filter(function (t) { return t.group === gid; })
          .sort(function (a, b) { return a.full < b.full ? -1 : 1; }).map(function (t) { return '<option value="' + t.id + '"' + (scopeTeam() === t.id ? ' selected' : '') + '>' + esc(NFL ? t.full : t.school) + '</option>'; }).join('');
        h += '<div class="pick"><label for="' + prefix + '-team">Team</label><div class="select-wrap"><select id="' + prefix + '-team" data-act="team">' + topts + '</select>' + CHEV + '</div></div>';
      }
      return h;
    }
    function tileHTML(key) {
      var m = F.METRIC_BY_KEY[key]; if (!m || !S.data) return '';
      function tile(k, v, s) { return '<div class="tile"><span class="tile-k">' + esc(k) + '</span><span class="tile-v">' + esc(v) + '</span>' + (s ? '<span class="tile-s">' + esc(s) + '</span>' : '') + '</div>'; }
      function pending(x) { return x.loading ? 'Loading' : (x.missing ? 'Available with live data' : missingShort()); }
      var label = m.id === 'grp' ? (NFL ? 'Division record' : 'Conference record') : m.label;
      var recordish = ['record', 'grp', 'streak', 'home', 'away', 'close'].indexOf(m.fmt) >= 0;
      var id = scopeTeam();
      if (!id) {
        var pool = isAll() ? allIds() : groupTeams(scopeGroupOnly());
        if (recordish) {
          var lead = isAll() ? topIds(1)[0] : groupStandings(scopeGroupOnly())[0];
          if (!lead) return tile(label, '—', missingShort());
          var lx = metric(lead, key);
          if (lx.text == null) return tile(label, '—', pending(lx));
          var sub = isAll() ? (NFL ? 'Best record in the NFL' : 'No. 1 in the ' + ((S.data.rankings && S.data.rankings.short) || 'poll')) : 'Leads the ' + group(scopeGroupOnly()).name;
          return tile(m.fmt === 'record' && isAll() && NFL ? 'Best record' : label, abbr(lead) + ' · ' + lx.text, sub);
        }
        var b = metricBest(pool, key);
        if (!b.id) return tile(label, '—', pending(b));
        return tile(label, abbr(b.id) + ' · ' + b.x.text, isAll() ? 'Best in the ' + (NFL ? 'NFL' : 'FBS') : 'Best in the ' + group(scopeGroupOnly()).name);
      }
      var x = metric(id, key);
      if (x.text == null) return tile(label, '—', x.none ? 'Not available' : pending(x));
      var s2 = '';
      if (m.fmt === 'record') {
        var gs = groupStandings(groupOf(id)), pos = gs.indexOf(id) + 1, seed = NFL ? seedOf(id) : null, rk = NFL ? null : rankOf(id);
        s2 = [ord(pos) + ' in the ' + group(groupOf(id)).name, seed && seed <= 7 ? 'No. ' + seed + ' seed' + (S.data.seeds.approx ? ' (projected)' : '') : '', rk ? 'No. ' + rk + ' ' + ((S.data.rankings && S.data.rankings.short) || '') : ''].filter(Boolean).join(' · ');
      } else if (!recordish) { var rr = metricRank(id, key, allIds()); s2 = rr ? (rr.tie ? 'T-' : '') + ord(rr.rank) + ' of ' + rr.of + ' in the ' + (NFL ? 'NFL' : 'FBS') : ''; }
      return tile(label, x.text, s2);
    }
    function tilesHTML() { return ['tile1', 'tile2', 'tile3', 'tile4'].map(function (k) { var v = S.cs.blocks[k]; return v && v !== 'hide' ? tileHTML(v) : ''; }).join(''); }
    var PAUSE_SVG = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"><line x1="8" y1="5" x2="8" y2="19"></line><line x1="16" y1="5" x2="16" y2="19"></line></svg>';
    var PLAY_SVG = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>';
    var GEAR = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>';
    function tickLabel() { return isAll() ? L.root.abbr : entity().abbr; }
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

    /* ───────── ticker ───────── */
    function noteShort(n) {
      if (!n) return '';
      n = n.replace(/ Playoffs?$/i, '').replace(/^College Football Playoff/i, 'CFP').replace(/ Presented by.*$/i, '');
      return n.length > 34 ? n.slice(0, 32) + '…' : n;
    }
    function tickerItems() {
      var d = S.data, all = d.games, cw = curGames().slice().sort(byDate);
      var live = cw.filter(function (g) { return g.state === 'live'; }), pre = cw.filter(function (g) { return g.state === 'pre'; });
      var horizon = nowDate().getTime() + 9 * 86400000;
      var nextUp = pre.length ? pre : all.filter(function (g) { return g.state === 'pre' && new Date(g.date).getTime() <= horizon; }).sort(byDate);
      var nextName = pre.length || !nextUp.length ? null : weekLabel(nextUp[0].type, nextUp[0].week);
      var finalsWk = cw.filter(function (g) { return g.state === 'final'; }).reverse();
      var out = [];
      function sec(title, arr) { if (!arr.length) return; out.push({ k: 'head', text: title }); arr.forEach(function (i) { out.push(i); }); }
      function Lv(g) { return { k: 'live', g: g }; } function N(g) { return { k: 'next', g: g }; } function Fn(g) { return { k: 'final', g: g }; }
      var id = scopeTeam(), gid = scopeGroup();
      var wkName = d.cur ? weekLabel(d.cur.type, d.cur.week) : 'This week';
      if (isAll()) {
        sec('Live', (NFL ? live : live.slice().sort(rankFirst)).slice(0, 30).map(Lv));
        sec(nextName ? 'Up next · ' + nextName : wkName, (NFL ? nextUp : nextUp.filter(function (g) { return d.phase === 'post' || ranked(g); }).sort(rankFirst)).slice(0, NFL ? 16 : 14).map(N));
        var lastFinals = finalsWk.length ? finalsWk : all.filter(function (g) { return g.state === 'final' && d.cur && g.type === d.cur.type && g.week === d.cur.week - 1; }).reverse();
        sec('Final', (NFL ? lastFinals : lastFinals.filter(function (g) { return g.type === 3 || ranked(g); }).sort(rankFirst)).slice(0, NFL ? 16 : 20).map(Fn));
        if (NFL && d.cur && d.cur.type === 2) {
          var playing = {}; cw.forEach(function (g) { playing[g.away.id] = 1; playing[g.home.id] = 1; });
          var bye = L.teams.filter(function (t) { return !playing[t.id]; }).map(function (t) { return t.abbr; });
          if (bye.length && bye.length < 12) sec('On bye', [{ k: 'note', text: bye.join(' · ') }]);
        }
      } else {
        var mine;
        if (id) {
          var tf = all.filter(function (g) { return g.state === 'final' && involves(g, id); }).reverse().slice(0, 5);
          var next = all.filter(function (g) { return (g.state === 'pre' || g.state === 'live') && involves(g, id); }).sort(byDate).slice(0, 1);
          mine = next.map(function (g) { return g.state === 'live' ? Lv(g) : N(g); }).concat(tf.map(Fn));
          if (NFL && d.cur && d.cur.type === 2 && !cw.some(function (g) { return involves(g, id); })) mine.unshift({ k: 'note', text: 'Bye week' });
        } else {
          mine = live.filter(involvesScope).map(Lv).concat(nextUp.filter(involvesScope).map(N)).concat(finalsWk.filter(involvesScope).map(Fn));
          if (!finalsWk.filter(involvesScope).length) mine = mine.concat(all.filter(function (g) { return g.state === 'final' && involvesScope(g) && d.cur && g.week === d.cur.week - 1 && g.type === d.cur.type; }).reverse().map(Fn));
        }
        if (!mine.length) mine = [{ k: 'note', text: d.phase === 'off' ? 'Season complete' : 'No games this week' }];
        sec(id ? team(id).name : group(gid).name, mine);
        if (id) sec('Around the ' + group(gid).name, cw.filter(function (g) { return !involves(g, id) && (groupOf(g.away.id) === gid || groupOf(g.home.id) === gid); }).map(function (g) { return g.state === 'live' ? Lv(g) : (g.state === 'final' ? Fn(g) : N(g)); }));
        sec(NFL ? 'Around the NFL' : 'Around the FBS', live.filter(function (g) { return !involvesScope(g) && (NFL || ranked(g)); }).slice(0, 10).map(Lv)
          .concat(NFL ? [] : pre.filter(function (g) { return !involvesScope(g) && ranked(g); }).sort(rankFirst).slice(0, 6).map(N))
          .concat(finalsWk.filter(function (g) { return !involvesScope(g) && (NFL || ranked(g)); }).slice(0, NFL ? 8 : 6).map(Fn)));
      }
      if (!out.length) out.push({ k: 'note', text: d.phase === 'off' ? 'Season complete' : 'No games scheduled this week' });
      return out;
    }
    var BALL = '<span class="tk-ball" aria-label="has the ball">●</span>';
    function tname(side, g) { return rankTag(side.id) + esc(abbr(side.id, side.abbr)) + (g && g.sit && g.sit.poss === side.id ? BALL : ''); }
    function liveSub(g) {
      var parts = [g.detail || (g.period ? 'Q' + g.period + ' ' + g.clock : 'In progress')];
      if (g.sit && g.sit.text) parts.push(g.sit.text);
      if (g.tv) parts.push(g.tv);
      return parts.join(' · ');
    }
    function tickItemHTML(it) {
      if (it.k === 'head') return '<div class="tk-item head">' + esc(it.text) + '</div>';
      if (it.k === 'note') return '<div class="tk-item"><span class="tk-team win">' + esc(it.text) + '</span></div>';
      var g = it.g;
      if (it.k === 'live') {
        var aw = g.away.score > g.home.score, hw = g.home.score > g.away.score;
        return '<div class="tk-item' + (g.sit && g.sit.rz ? ' rz' : '') + '"><span class="tk-live">' + (g.sit && g.sit.rz ? 'Red zone' : 'Live') + '</span><span class="tk-team' + (aw ? ' win' : '') + '">' + tname(g.away, g) + ' ' + (g.away.score == null ? 0 : g.away.score) + '</span>' +
          '<span class="tk-team' + (hw ? ' win' : '') + '">' + tname(g.home, g) + ' ' + (g.home.score == null ? 0 : g.home.score) + '</span><span class="tk-sub">' + esc(liveSub(g)) + '</span></div>';
      }
      if (it.k === 'final') {
        var aW = g.away.score > g.home.score, tie = g.away.score === g.home.score;
        return '<div class="tk-item"><span class="tk-final">' + esc(/OT/.test(g.detail) ? 'Final/OT' : 'Final') + '</span><span class="tk-team ' + (aW || tie ? 'win' : 'lose') + '">' + tname(g.away) + ' ' + g.away.score + '</span><span class="tk-team ' + (aW && !tie ? 'lose' : 'win') + '">' + tname(g.home) + ' ' + g.home.score + '</span>' +
          '<span class="tk-sub">' + esc([noteShort(g.note), weekShort(g.type, g.week), whenLabel(g)].filter(Boolean).join(' · ')) + '</span></div>';
      }
      return '<div class="tk-item"><span class="tk-when">' + esc(whenLabel(g) + ' ' + timeLabel(g)) + '</span><span class="tk-team win">' + tname(g.away) + ' <span class="tk-at">' + (g.neutral ? 'vs' : 'at') + '</span> ' + tname(g.home) + '</span>' +
        '<span class="tk-sub">' + esc([noteShort(g.note), g.tv].filter(Boolean).join(' · ')) + '</span></div>';
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
    }

    /* ───────── feature chart (block R), plotted week by week ───────── */
    function lineSize(tv) { return tv ? { w: 560, h: 500 } : { w: 760, h: 330 }; }
    function legendHTML(hiText, restText, extra) {
      return '<div class="legend"><span><i class="sw"></i>' + esc(hiText) + '</span>' + (extra || '') + (restText ? '<span><i class="sw gray"></i>' + esc(restText) + '</span>' : '') + '</div>';
    }
    /* Regular-season weeks played so far → [{ type, week, label, tip }] */
    function playedWeeks() {
      var d = S.data; if (d._w) return d._w;
      var seen = {}, out = [];
      d.games.forEach(function (g) { if (g.state !== 'final') return; var k = g.type + ':' + g.week; if (!seen[k]) { seen[k] = 1; out.push({ type: g.type, week: g.week }); } });
      out.sort(function (a, b) { return a.type - b.type || a.week - b.week; });
      out.forEach(function (w) { w.label = weekShort(w.type, w.week); w.tip = weekLabel(w.type, w.week); });
      return (d._w = out);
    }
    function upTo(r, w) {
      var c = { w: 0, l: 0, t: 0, gw: 0, gl: 0, gt: 0, pf: 0, pa: 0, cw: 0, cl: 0 };
      r.log.forEach(function (x) {
        if (x.type > w.type || (x.type === w.type && x.wk > w.week) || x.post) return;
        c[x.res]++; c.pf += x.pf; c.pa += x.pa; if (x.grp) c['g' + x.res]++;
        if (Math.abs(x.margin) <= 8) { if (x.res === 'w') c.cw++; else if (x.res === 'l') c.cl++; }
      });
      return c;
    }
    function chartGuard() {
      var d = S.data;
      if (!d.recs) return msgCrawl();
      if (!playedWeeks().filter(function (w) { return w.type === 2; }).length) return '<div class="empty"><strong>No games yet</strong>Charts fill in once the season kicks off.</div>';
      return null;
    }
    function regWeeks() { return playedWeeks().filter(function (w) { return w.type === 2; }); }
    function focusIds() {
      var id = scopeTeam(), gid = scopeGroup();
      if (isAll()) { var t = topIds(6); return { ids: t, hi: t[0], hiText: nick(t[0]) + (NFL ? ' · best record' : ' · No. 1 in the poll'), rest: NFL ? 'Next five best records' : 'Next five in the poll' }; }
      var st = groupStandings(gid), ids = st.slice(0, NFL ? 4 : 6);
      if (id && ids.indexOf(id) < 0) ids = ids.slice(0, ids.length - 1).concat([id]);
      return { ids: ids, hi: id || ids[0], hiText: nick(id || ids[0]) + (id ? '' : ' · ' + L.groupWord + ' leader'), rest: group(gid).name + (NFL ? ' rivals' : ' contenders'), gid: gid };
    }
    function focusTeam() { var id = scopeTeam(); if (id) return id; return isAll() ? topIds(1)[0] : groupStandings(scopeGroupOnly())[0]; }
    function focusText(id) { return nick(id) + (scopeTeam() ? '' : (isAll() ? (NFL ? ' · best record' : ' · No. 1 in the poll') : ' · ' + L.groupWord + ' leader')); }
    function raceChart(mode, tv) {
      var g = chartGuard(); if (g) return g;
      var W = regWeeks(), size = lineSize(tv), labels = W.map(function (w) { return w.label; }), tips = W.map(function (w) { return w.tip; });
      if (mode === 'gb' || mode === 'grank') {
        var P = focusIds(), gid = P.gid || groupOf(P.hi), mates = groupTeams(gid);
        var snaps = W.map(function (w) {
          var rows = mates.map(function (id) {
            var c = upTo(rec(id), w), useG = !NFL;
            var W_ = useG ? c.gw : c.w, L_ = useG ? c.gl : c.l, T_ = useG ? c.gt : c.t;
            return { id: id, w: W_, l: L_, t: T_, p: W_ + L_ + T_ ? (W_ + T_ / 2) / (W_ + L_ + T_) : null, diff: c.pf - c.pa };
          });
          if (!rows.some(function (r) { return r.w + r.l + r.t; })) return null;
          rows.sort(function (a, b) { return ((b.p == null ? -1 : b.p) - (a.p == null ? -1 : a.p)) || b.w - a.w || b.diff - a.diff; });
          var Ld = rows[0], out = {};
          rows.forEach(function (r, i) { out[r.id] = { gb: ((Ld.w - r.w) + (r.l - Ld.l)) / 2, rank: i + 1, played: r.w + r.l + r.t }; });
          return out;
        });
        var start = snaps.findIndex(function (s) { return s; });
        if (start < 0) return '<div class="empty"><strong>No ' + (NFL ? 'division' : 'conference') + ' games yet</strong>This chart starts with the first ' + L.groupWord + ' game.</div>';
        var ids = isAll() ? mates : P.ids, hi = isAll() ? groupStandings(gid)[0] : P.hi;
        var ser = ids.map(function (id) { return { label: abbr(id), hi: id === hi, vals: snaps.slice(start).map(function (s) { return s && s[id] && (NFL || s[id].played) ? (mode === 'gb' ? s[id].gb : s[id].rank) : null; }) }; });
        var o = mode === 'gb' ? { fmt: function (v) { return v === 0 ? 'Lead' : (v % 1 ? v.toFixed(1) : String(v)); }, invert: true, min: 0, zero: 0 } : { fmt: function (v) { return ord(v); }, invert: true, min: 1, max: mates.length, step: Math.max(1, Math.ceil(mates.length / 6)) };
        o.labels = labels.slice(start); o.tipLabels = tips.slice(start); o.series = ser; o.w = size.w; o.h = size.h; o.aria = mode === 'gb' ? 'Games back by week' : 'Standing by week';
        return CH.lines(o) + (tv ? '' : legendHTML(nick(hi) + (scopeTeam() ? '' : ' · ' + L.groupWord + ' leader'), group(gid).name + (NFL ? '' : ' · conference games only')));
      }
      if (mode === 'line') return lineChart(tv);
      if (mode === 'poll') return pollChart(tv);
      var R = focusIds();
      if (!R.ids.length) return msgNoData('the standings');
      var series = R.ids.map(function (id) {
        var r = rec(id);
        return { label: abbr(id), hi: id === R.hi, vals: W.map(function (w) { var c = upTo(r, w); if (!c.w && !c.l && !c.t) return null; return mode === 'gap' ? (c.w - c.l) : (c.w + c.t / 2) / (c.w + c.l + c.t); }) };
      });
      var o2 = mode === 'gap' ? { fmt: function (v) { return v === 0 ? '.500' : signed(v); }, zero: 0, ints: true } : { fmt: rate3, zero: 0.5, min: 0, max: 1 };
      o2.labels = labels; o2.tipLabels = tips; o2.series = series; o2.w = size.w; o2.h = size.h; o2.aria = mode === 'gap' ? 'Games above .500 by week' : 'Winning percentage by week';
      return CH.lines(o2) + (tv ? '' : legendHTML(R.hiText, R.rest));
    }
    /* NFL: games above or below the 7th seed's record, week by week (seeds approximated from records). */
    function lineChart(tv) {
      var W = regWeeks(), size = lineSize(tv);
      function at(c, w) {
        var rows = L.teams.filter(function (t) { return t.conf === c; }).map(function (t) { var x = upTo(rec(t.id), w); return { id: t.id, g: t.group, w: x.w, l: x.l, t: x.t, p: x.w + x.l + x.t ? (x.w + x.t / 2) / (x.w + x.l + x.t) : 0, d: x.pf - x.pa }; });
        var cmp = function (a, b) { return b.p - a.p || b.d - a.d; }, leaders = {}, lead = [];
        rows.slice().sort(cmp).forEach(function (r) { if (!leaders[r.g]) { leaders[r.g] = 1; lead.push(r); } });
        var rest = rows.filter(function (r) { return lead.indexOf(r) < 0; }).sort(cmp), seventh = rest[2];
        var out = {}; rows.forEach(function (r) { out[r.id] = seventh ? ((r.w - r.l) - (seventh.w - seventh.l)) / 2 : 0; });
        return out;
      }
      function panel(c, focus) {
        var fin = at(c, W[W.length - 1]);
        var ids = L.teams.filter(function (t) { return t.conf === c; }).map(function (t) { return t.id; }).sort(function (a, b) { return Math.abs(fin[a]) - Math.abs(fin[b]); }).slice(0, 6);
        if (focus && ids.indexOf(focus) < 0) ids.push(focus);
        var snaps = W.map(function (w) { return at(c, w); }), hi = focus || ids.slice().sort(function (a, b) { return fin[b] - fin[a]; })[0];
        return CH.lines({ labels: W.map(function (w) { return w.label; }), tipLabels: W.map(function (w) { return w.tip; }), series: ids.map(function (id) { return { label: abbr(id), hi: id === hi, vals: snaps.map(function (s) { return s[id]; }) }; }),
          fmt: function (v) { return v === 0 ? '0' : signed(v); }, zero: 0, zeroLabel: '7th seed', w: tv ? 560 : (isAll() ? 600 : 760), h: tv ? (isAll() ? 260 : 500) : 360, aria: c + ' playoff line' });
      }
      var g = chartGuard(); if (g) return g;
      if (!isAll()) { var id = focusTeam(), c = confOf(id); return panel(c, scopeTeam()) + (tv ? '' : legendHTML(scopeTeam() ? nick(id) : c + ' contenders', 'Closest to the line · 0 = the 7th seed’s record (no tiebreakers)')); }
      return '<div class="dual"><div><h3 class="dual-h">AFC</h3>' + panel('AFC') + '</div><div><h3 class="dual-h">NFC</h3>' + panel('NFC') + '</div></div>' + (tv ? '' : legendHTML('Closest teams to the line', '0 = the 7th seed’s record (no tiebreakers)'));
    }
    function pollChart(tv) {
      if (isSnap()) return msgSnapshot();
      var d = S.data, wk = d.cur && d.cur.type === 2 ? d.cur.week : 16;
      var h = need('poll|' + wk, function () { return API.pollHistory(d.season, wk); });
      if (h === undefined) return msgLoading('each week’s AP poll');
      if (isErr(h) || !h.length) return msgNoData('the AP poll history');
      var ids;
      if (scopeTeam()) ids = [scopeTeam()];
      else if (scopeGroupOnly()) ids = groupTeams(scopeGroupOnly()).filter(function (id) { return h.some(function (p) { return p.ranks[id]; }); }).slice(0, 8);
      else ids = topIds(8);
      if (!ids.length) return '<div class="empty"><strong>Not ranked this season</strong>No ' + esc(group(scopeGroupOnly()).name) + ' team has appeared in the AP poll.</div>';
      var size = lineSize(tv), hi = ids[0];
      return CH.lines({ labels: h.map(function (p) { return p.label.replace(/^Week /, 'W'); }), tipLabels: h.map(function (p) { return p.label; }), series: ids.map(function (id) { return { label: abbr(id), hi: id === hi, vals: h.map(function (p) { return p.ranks[id] || null; }) }; }),
        fmt: function (v) { return '#' + Math.round(v); }, invert: true, min: 1, max: 25, step: 4, w: size.w, h: size.h, aria: 'AP poll rank by week' }) +
        (tv ? '' : legendHTML(nick(hi), scopeTeam() ? '' : 'Gaps = unranked that week'));
    }
    function pdiffChart(tv) {
      var g = chartGuard(); if (g) return g;
      var W = regWeeks(), P = focusIds(), size = lineSize(tv);
      var series = P.ids.map(function (id) { var r = rec(id); return { label: abbr(id), hi: id === P.hi, vals: W.map(function (w) { var c = upTo(r, w); return c.w + c.l + c.t ? c.pf - c.pa : null; }) }; });
      return CH.lines({ labels: W.map(function (w) { return w.label; }), tipLabels: W.map(function (w) { return w.tip; }), series: series, fmt: function (v) { return v === 0 ? '0' : signed(v); }, zero: 0, ints: true, w: size.w, h: size.h, aria: 'Point differential by week' }) + (tv ? '' : legendHTML(P.hiText, P.rest));
    }
    function scoringChart(tv) {
      var g = chartGuard(); if (g) return g;
      var id = focusTeam(); if (!id) return msgNoData('the standings');
      var W = regWeeks(), size = lineSize(tv), log = rec(id).log.filter(function (x) { return !x.post; });
      function wkGame(w) { return log.filter(function (x) { return x.type === w.type && x.wk === w.week; })[0]; }
      var avg = W.map(function (w) { var t = 0, n = 0; Object.keys(S.data.recs).forEach(function (k) { S.data.recs[k].log.forEach(function (x) { if (x.type === w.type && x.wk === w.week) { t += x.pf; n++; } }); }); return n ? t / n : null; });
      var series = [{ label: 'Scored', hi: true, vals: W.map(function (w) { var x = wkGame(w); return x ? x.pf : null; }) }, { label: 'Allowed', hi: true, dash: true, vals: W.map(function (w) { var x = wkGame(w); return x ? x.pa : null; }) }, { label: (NFL ? 'NFL' : 'FBS') + ' avg', ref: true, vals: avg }];
      return CH.lines({ labels: W.map(function (w) { return w.label; }), tipLabels: W.map(function (w) { return w.tip; }), series: series, fmt: function (v) { return String(Math.round(v)); }, min: 0, w: size.w, h: size.h, aria: 'Points scored and allowed each week' }) +
        (tv ? '' : legendHTML(focusText(id) + ' · points scored', '', '<span><i class="sw dash"></i>Points allowed</span><span><i class="sw ref"></i>' + (NFL ? 'NFL' : 'FBS') + ' average · gaps = bye weeks</span>'));
    }
    function seasonBars(tv) {
      var g = chartGuard(); if (g) return g;
      var id = focusTeam(); if (!id) return msgNoData('the standings');
      var log = rec(id).log, size = tv ? { w: 560, h: 480 } : { w: 760, h: 300 };
      var bars = log.map(function (x) { return { win: x.res === 'w', margin: x.res === 't' ? 0.5 : x.margin, tip: weekLabel(x.type, x.wk) + ' · ' + (x.home ? 'vs ' : (x.neutral ? 'vs ' : 'at ')) + abbr(x.opp, x.oppAbbr) + ' · ' + x.res.toUpperCase() + ' ' + Math.max(x.pf, x.pa) + '–' + Math.min(x.pf, x.pa) }; });
      var ticks = log.map(function (x, i) { return { i: i, label: weekShort(x.type, x.wk) }; }).filter(function (t, i) { return log.length <= 12 || i % 2 === 0; });
      var r = rec(id);
      return CH.gameBars({ games: bars, ticks: ticks, w: size.w, h: size.h, cap: 28, aria: nick(id) + ' game-by-game results' }) +
        (tv ? '' : '<div class="legend"><span><i class="sw sq"></i>' + esc(focusText(id) + ' · wins · ' + wl(r.w, r.l, r.t)) + '</span><span><i class="sw sq gray"></i>Losses · bar height = margin (capped at 28)</span></div>');
    }
    function closeChart(tv) {
      var g = chartGuard(); if (g) return g;
      var W = regWeeks(), P = focusIds(), size = lineSize(tv);
      var series = P.ids.map(function (id) {
        var r = rec(id), fin = upTo(r, W[W.length - 1]);
        return { label: abbr(id), endLabel: abbr(id) + ' ' + fin.cw + '–' + fin.cl, hi: id === P.hi, vals: W.map(function (w) { var c = upTo(r, w); return c.cw - c.cl; }) };
      });
      return CH.lines({ labels: W.map(function (w) { return w.label; }), tipLabels: W.map(function (w) { return w.tip; }), series: series, fmt: function (v) { return v === 0 ? '.500' : signed(v); }, zero: 0, ints: true, w: size.w, h: size.h, aria: 'One-score games' }) + (tv ? '' : legendHTML(P.hiText, P.rest + ' · games decided by 8 points or fewer'));
    }
    var FEATURE_META = {
      gap: [NFL ? 'Race to the playoffs' : 'Race to the Playoff', 'Games above .500 · after each week'],
      pct: [NFL ? 'Race to the playoffs' : 'Race to the Playoff', 'Winning percentage · after each week'],
      gb: [NFL ? 'Race to the playoffs' : 'Race to the Playoff', (NFL ? 'Games back in the division' : 'Conference games back') + ' · after each week'],
      grank: [NFL ? 'Race to the playoffs' : 'Race to the Playoff', (NFL ? 'Division' : 'Conference') + ' standing · after each week'],
      line: ['Race to the playoffs', 'Games above or below the 7th seed · after each week'],
      poll: ['Race to the Playoff', 'AP poll rank · each week'],
      pdiff: ['Point differential', 'Running total · after each week'],
      scoring: ['Points scored vs. allowed', 'Each game'],
      season: ['Season in one picture', 'Every game · bar height = margin'],
      close: ['One-score games', 'Games above .500 in games decided by 8 or fewer · running total']
    };
    var BUILDERS = { pdiff: pdiffChart, scoring: scoringChart, season: seasonBars, close: closeChart };
    function featureChart(tv) {
      var mode = S.cs.blocks.race; if (mode === 'hide' || !S.data) return null;
      var meta = FEATURE_META[mode] || FEATURE_META.gap;
      return { title: meta[0], sub: meta[1], body: (BUILDERS[mode] ? BUILDERS[mode](tv) : raceChart(mode, tv)) || msgNoData(meta[0]) };
    }

    /* ───────── standings block ───────── */
    function stRow(id, cols, me, extraCls) {
      var t = team(id) || { primary: '#888', name: id };
      return '<div class="st-row ' + (extraCls || 'cs') + (me ? ' me' : '') + '"><span class="st-name"><i style="background:' + t.primary + '"></i>' + esc(NFL ? t.nick : t.school) + '</span>' + cols.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>';
    }
    function standingsCardHTML(tv) {
      if (S.cs.blocks.standings === 'hide' || !S.data) return null;
      var d = S.data;
      if (isAll() && NFL) {
        var seeds = d.seeds; if (!seeds) return { title: 'Playoff picture', body: msgLoading('the standings') };
        var html = '<div class="st-scroll">';
        ['AFC', 'NFC'].forEach(function (c) {
          html += '<div class="st-row pp head"><span>' + c + '</span><span>W–L</span><span>Seed</span></div>';
          seeds[c].slice(0, tv ? 7 : 9).forEach(function (s) {
            var r = rec(s.id);
            html += stRow(s.id, [wl(r.w, r.l, r.t), s.seed <= 7 ? String(s.seed) : 'Out'], false, 'pp' + (s.seed === 7 ? ' cut' : '') + (s.seed > 7 ? ' out' : ''));
          });
        });
        return { title: 'Playoff picture', sub: seeds.approx ? 'Projected from records · no tiebreakers' : 'If the season ended today', body: html + '</div>' };
      }
      if (isAll()) {
        var rk = d.rankings;
        if (!rk || !rk.rows.length) return { title: 'AP Top 25', body: isLive() ? msgNoData('the poll') : msgSnapshot() };
        var rows = rk.rows.slice(0, tv ? 10 : 25).map(function (r) {
          var mv = r.prev == null || r.prev === 0 ? 'New' : (r.prev === r.rank ? '—' : (r.prev > r.rank ? '▲' + (r.prev - r.rank) : '▼' + (r.rank - r.prev)));
          var t = team(r.id), rr = rec(r.id);
          return '<div class="st-row rk-row"><span class="st-rk">' + r.rank + '</span><span class="st-name"><i style="background:' + (t ? t.primary : '#888') + '"></i>' + esc(t ? t.school : r.id) + '</span><span>' + esc(r.record || (rr.gp ? wl(rr.w, rr.l, rr.t) : '')) + '</span><span class="st-mv">' + esc(mv) + '</span></div>';
        }).join('');
        var title = rk.type === 'cfp' ? 'CFP Rankings' : 'AP Top 25';
        return { title: title, sub: [rk.label, rk.partial ? 'top ' + rk.rows.length + ' in the snapshot' : ''].filter(Boolean).join(' · '), body: '<div class="st-scroll"><div class="st-row rk-row head"><span>#</span><span>Team</span><span>W–L</span><span>Move</span></div>' + rows + '</div>' };
      }
      var gid = scopeGroup(), gs = groupStandings(gid);
      if (tv && gs.length > 8) { var mine = scopeTeam(), top = gs.slice(0, 8); if (mine && top.indexOf(mine) < 0) top = gs.slice(0, 7).concat([mine]); gs = top; }
      var list = gs.map(function (id) {
        var r = rec(id), grp = r.gw + r.gl + r.gt ? wl(r.gw, r.gl, r.gt) : '0–0';
        return NFL ? stRow(id, [wl(r.w, r.l, r.t), grp, signed(r.pf - r.pa)], id === scopeTeam(), 'f4') : stRow(id, [grp, wl(r.w, r.l, r.t)], id === scopeTeam());
      });
      var head = NFL ? '<div class="st-row f4 head"><span>Team</span><span>W–L</span><span>Div</span><span>Diff</span></div>' : '<div class="st-row cs head"><span>Team</span><span>Conf</span><span>Overall</span></div>';
      return { title: group(gid).full, body: '<div class="st-scroll">' + head + list.join('') + '</div>' };
    }

    /* ───────── leaders, clubs, upcoming ───────── */
    function leaderBodyHTML(key, kind, max) {
      var st = leaderState(key), s = F.STAT_BY_KEY[key];
      if (st.loading) return msgLoading('leaders');
      if (st.missing) return msgSnapshot();
      if (st.error) return msgNoData(s ? s.name + ' leaders' : 'this board');
      var rows = CH.orderRows(st.rows.slice(0, max || S.settings.limit));
      var who = scopeTeam() ? team(scopeTeam()).name : (scopeGroupOnly() ? group(scopeGroupOnly()).name : (NFL ? 'NFL' : 'FBS'));
      if (!rows.length) return '<div class="empty"><strong>No leaders yet</strong>No ' + esc(who) + ' players ' + (s.rate ? 'qualify for this stat yet.' : 'have recorded this stat.') + '</div>';
      var shares = CH.shares(rows), counts = {};
      rows.forEach(function (r) { counts[r.rank] = (counts[r.rank] || 0) + 1; });
      function rk(r) { return (counts[r.rank] > 1 ? 'T' : '') + r.rank; }
      var html;
      if (kind === 'feat') {
        html = '<div class="lb">' + rows.map(function (r, i) {
          return '<div class="lrow' + (i === 0 ? ' top' : '') + '"><span class="lrank">' + rk(r) + '</span><span class="lname"><span class="lbar" style="width:calc(var(--rk-off) + (100% - var(--rk-off) + var(--slant)) * ' + shares[i].toFixed(3) + ')"></span><b>' + esc(r.name) + '</b><em>' + esc(abbr(r.teamId)) + '</em></span><span class="lval">' + esc(r.value) + '</span></div>';
        }).join('') + '</div>';
      } else {
        html = '<div class="bd-list">' + rows.map(function (r, i) {
          return '<div class="brow' + (i === 0 ? ' top' : '') + '"><div class="brow-top"><span title="' + esc(r.name + ' · ' + nick(r.teamId)) + '">' + esc(rk(r) + ' ' + shortName(r.name)) + '</span><span>' + esc(r.value) + '</span></div><div class="btrack"><div class="bfill" style="width:' + Math.round(shares[i] * 100) + '%"></div></div></div>';
        }).join('') + '</div>';
      }
      return html + (st.scoped && st.rate ? '<div class="lb-note">Qualified players only</div>' : '');
    }
    function clubsCardHTML() {
      var key = S.cs.blocks.clubs; if (!key || key === 'hide' || !S.data) return null;
      var m = F.METRIC_BY_KEY[key]; if (!m) return null;
      var d = S.data, ids, on, legend, avgName, scopeName;
      if (NFL) {
        ids = allIds(); avgName = 'NFL avg'; scopeName = 'all 32 teams';
        if (scopeTeam()) { on = [scopeTeam()]; legend = team(scopeTeam()).name; }
        else if (scopeGroupOnly()) { on = groupTeams(scopeGroupOnly()); legend = group(scopeGroupOnly()).name; }
        else { on = d.seeds ? d.seeds.AFC.concat(d.seeds.NFC).filter(function (s) { return s.seed <= 7; }).map(function (s) { return s.id; }) : []; legend = 'In a playoff spot today'; }
      } else if (isAll()) {
        ids = topIds(25); on = ids.slice(0, 12); legend = 'Top 12 in the ' + ((d.rankings && d.rankings.short) || 'poll'); avgName = 'Top 25 avg'; scopeName = 'the Top 25';
      } else {
        var gid = scopeGroup(); ids = groupTeams(gid); avgName = group(gid).name + ' avg'; scopeName = group(gid).name + ' teams';
        if (scopeTeam()) { on = [scopeTeam()]; legend = team(scopeTeam()).school; } else { on = groupStandings(gid).slice(0, 1); legend = 'Conference leader'; }
      }
      var state = null;
      var items = ids.map(function (id) {
        var x = metric(id, key); if (x.loading || x.missing) state = state || x;
        return { id: id, abbr: abbr(id), name: nick(id), value: x.v != null && !isNaN(x.v) ? x.v : null, text: x.text || '—', on: on.indexOf(id) >= 0 };
      });
      var vals = items.filter(function (i) { return i.value != null; });
      var mean = vals.length ? vals.reduce(function (a, i) { return a + i.value; }, 0) / vals.length : 0;
      var avgText = ['rate3', 'record', 'grp', 'home', 'away', 'close'].indexOf(m.fmt) >= 0 ? rate3(mean) : (m.fmt === 'signed' ? signed(Math.round(mean)) : (m.fmt === 'pct1' ? mean.toFixed(1) + '%' : mean.toFixed(1)));
      var html = vals.length ? CH.clubs({ items: items, low: m.low, label: m.label, avgText: avgText, avgName: avgName, scopeName: scopeName }) : '';
      var body = html || (state && state.loading ? msgLoading(m.label) : (state && state.missing ? msgSnapshot() : msgNoData(m.label)));
      return { title: (m.id === 'grp' ? (NFL ? 'Division record' : 'Conference record') : m.label) + ' · ' + (NFL ? 'all 32 teams' : (isAll() ? 'Top 25' : group(scopeGroup()).name)), sub: m.low ? 'Above the line = better than average (lower is better)' : 'Above the line = better than average', legend: legend, body: body };
    }
    function upcoming(n) {
      var d = S.data, all = d.games.filter(function (g) { return (g.state === 'pre' || g.state === 'live') && involvesScope(g); }).sort(byDate);
      var live = all.filter(function (g) { return g.state === 'live'; }), pre = all.filter(function (g) { return g.state === 'pre'; });
      if (isAll() && !NFL) pre = pre.filter(ranked).concat(pre.filter(function (g) { return !ranked(g); }));
      return live.concat(pre).slice(0, n);
    }
    function gameCardHTML(g) {
      var cls = g.state === 'live' ? ' live' : (whenLabel(g) === 'Today' ? ' today' : '');
      var hd = g.state === 'live' ? 'Live · ' + esc(g.detail || 'In progress') : esc(whenLabel(g) + ' · ' + timeLabel(g));
      var match = g.state === 'live' ? tname(g.away, g) + ' ' + g.away.score + ' <span class="at">·</span> ' + tname(g.home, g) + ' ' + g.home.score : tname(g.away) + ' <span class="at">' + (g.neutral ? 'vs' : 'at') + '</span> ' + tname(g.home);
      var line = [noteShort(g.note) || weekLabel(g.type, g.week), g.state === 'live' && g.sit ? g.sit.text : ''].filter(Boolean).join(' · ');
      var ra = rec(g.away.id), rh = rec(g.home.id);
      var sub = (team(g.away.id) ? nick(g.away.id) + ' (' + wl(ra.w, ra.l, ra.t) + ')' : g.away.name || g.away.abbr) + (g.neutral ? ' vs ' : ' at ') + (team(g.home.id) ? nick(g.home.id) + ' (' + wl(rh.w, rh.l, rh.t) + ')' : g.home.name || g.home.abbr);
      return '<div class="game' + cls + '"><div class="game-hd"><span>' + hd + '</span><span>' + esc(g.tv) + '</span></div><div class="game-bd"><div class="game-m">' + match + '</div>' +
        '<div class="game-s">' + esc(line) + '</div><div class="game-p">' + esc(sub) + '</div></div></div>';
    }
    function noGamesHTML() {
      var d = S.data;
      if (d.phase === 'off') return '<div class="card empty"><strong>Season complete</strong>The schedule picks up again next season.</div>';
      if (scopeTeam() && NFL) return '<div class="card empty"><strong>No game scheduled</strong>' + esc(team(scopeTeam()).name) + ' are off this week.</div>';
      return '<div class="card empty"><strong>No upcoming games</strong>Check back when the next week’s schedule is set.</div>';
    }

    function dashMainHTML() {
      if (!S.data) return '<div class="card loading">Loading ESPN</div>';
      var b = S.cs.blocks, out = [];
      var fc = featureChart(false), std = standingsCardHTML(false);
      if (fc || std) {
        out.push('<div class="row">' +
          (fc ? '<section class="card race" aria-label="' + esc(fc.title) + '"><div class="card-hd"><h2>' + esc(fc.title) + '</h2><span class="sub">' + esc(fc.sub) + '</span></div><div class="chart-body">' + fc.body + '</div></section>' : '') +
          (std ? '<section class="card standings" aria-label="Standings"><div class="card-hd"><h2>' + esc(std.title) + '</h2>' + (std.sub ? '<span class="sub">' + esc(std.sub) + '</span>' : '') + '</div>' + std.body + '</section>' : '') + '</div>');
      }
      var feats = ['feat1', 'feat2'].filter(function (k) { return b[k] && b[k] !== 'hide' && F.STAT_BY_KEY[b[k]]; });
      if (feats.length) {
        out.push('<section class="feat" aria-label="Featured leaders">' + feats.map(function (k) {
          var s = F.STAT_BY_KEY[b[k]];
          return '<article class="card"><div class="card-hd"><h2>' + esc(s.name) + '</h2><span class="sub">' + esc(s.short) + ' leaders</span></div>' + leaderBodyHTML(b[k], 'feat') + '</article>';
        }).join('') + '</section>');
      }
      var boards = ['board1', 'board2', 'board3', 'board4', 'board5', 'board6'].filter(function (k) { return b[k] && b[k] !== 'hide' && F.STAT_BY_KEY[b[k]]; });
      if (boards.length) {
        out.push('<section class="boards" aria-label="Leaderboards">' + boards.map(function (k) {
          var s = F.STAT_BY_KEY[b[k]];
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
      var src = d && d.source === 'snapshot' ? 'Snapshot (' + (d.note || '') + ') · live data could not be reached here'
        : 'Data: ESPN · ' + (NFL ? '' : 'Poll: AP Top 25, then the CFP rankings once released · ') + 'stats refresh daily at 5 AM';
      return '<footer class="foot"><span>' + esc(src) + '</span><span>Times shown in your time zone</span></footer>';
    }

    /* ───────── TV layout ───────── */
    function tvBoards() { var b = S.cs.blocks; return ['feat1', 'feat2', 'board1', 'board2', 'board3', 'board4', 'board5', 'board6'].filter(function (k) { return b[k] && b[k] !== 'hide' && F.STAT_BY_KEY[b[k]]; }); }
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
      var k = list[S.tv.board % list.length], s = F.STAT_BY_KEY[S.cs.blocks[k]];
      return '<div class="card-hd"><h2>' + esc(s.name) + '</h2><span class="sub">' + esc(s.short) + ' leaders</span></div><div class="tv-fill fade-in" style="padding:0">' + leaderBodyHTML(s.key, 'feat', Math.min(8, S.settings.limit)) + '</div>' + progressHTML(list.length, S.tv.board % list.length);
    }
    function tvGamesHTML() {
      var up = upcoming(5);
      if (!up.length) return '<div class="empty"><strong>' + (S.data.phase === 'off' ? 'Season complete' : 'No upcoming games') + '</strong></div>';
      return '<div class="tv-games">' + up.map(function (g) {
        var when = g.state === 'live' ? '<b>Live</b>' + esc(g.detail) : '<b>' + esc(whenLabel(g)) + '</b>' + esc(timeLabel(g));
        var m = g.state === 'live' ? tname(g.away, g) + ' ' + g.away.score + ' · ' + tname(g.home, g) + ' ' + g.home.score : tname(g.away) + ' ' + (g.neutral ? 'vs' : 'at') + ' ' + tname(g.home);
        return '<div class="tv-game"><div class="when">' + when + '</div><div><div class="m">' + m + '</div><div class="s">' + esc([noteShort(g.note), g.state === 'live' && g.sit ? g.sit.text : '', g.tv].filter(Boolean).join(' · ')) + '</div></div></div>';
      }).join('') + '</div>';
    }
    function tvStackHTML() {
      var std = standingsCardHTML(true);
      return (std ? '<section class="tv-panel" aria-label="Standings"><div class="card-hd"><h2>' + esc(std.title) + '</h2></div>' + std.body + '</section>' : '') +
        (S.cs.blocks.upnext !== 'hide' ? '<section class="tv-panel" aria-label="Coming up"><div class="card-hd"><h2>Coming up</h2></div>' + tvGamesHTML() + '</section>' : '');
    }
    function tvMainHTML() {
      if (!S.data) return '<div class="tv-main"><div class="tv-panel loading">Loading ESPN</div></div>';
      return '<div class="tv-main"><section class="tv-panel" id="tv-chart" aria-label="Charts">' + tvChartPanelHTML() + '</section>' +
        '<section class="tv-panel" id="tv-board" aria-label="Leaders">' + tvBoardPanelHTML() + '</section><div class="tv-stack" id="tv-stack">' + tvStackHTML() + '</div></div>' +
        '<div class="tv-gear" id="tv-gear"><button type="button" data-act="fullscreen">Full screen</button><button type="button" data-act="open-settings">Settings</button><button type="button" data-act="exit-tv">Exit TV mode</button></div>';
    }
    function tvTick() {
      if (S.stopped) return;
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
      F.STAT_GROUPS.forEach(function (g) {
        h += '<optgroup label="' + g.label + '">' + F.STATS.filter(function (s) { return s.group === g.id; }).map(function (s) {
          return '<option value="' + s.key + '"' + (s.key === current ? ' selected' : '') + '>' + esc(s.name + ' (' + s.short + ')') + '</option>';
        }).join('') + '</optgroup>';
      });
      return h;
    }
    function metricOptions(current, chartable) {
      var h = '<option value="hide"' + (current === 'hide' ? ' selected' : '') + '>Hide this block</option>';
      F.METRIC_GROUPS.forEach(function (g) {
        var list = F.TEAM_METRICS.filter(function (m) { return (m.grp || m.src) === g.src && (!chartable || m.fmt !== 'streak'); });
        h += '<optgroup label="' + g.label + '">' + list.map(function (m) { return '<option value="' + m.key + '"' + (m.key === current ? ' selected' : '') + '>' + esc((m.id === 'grp' ? (NFL ? 'Division record' : 'Conference record') : m.label) + ' (' + m.short + ')') + '</option>'; }).join('') + '</optgroup>';
      });
      return h;
    }
    function featureOptions(current) {
      return F.FEATURE_GROUPS[LID].map(function (g) {
        return '<optgroup label="' + esc(g.label) + '">' + g.options.map(function (o) { return '<option value="' + o[0] + '"' + (current === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</optgroup>';
      }).join('') + '<option value="hide"' + (current === 'hide' ? ' selected' : '') + '>Hide this block</option>';
    }
    function pickerHTML(code, id, label, optionsHTML) {
      return '<div class="pkr"><label for="pk-' + id + '"><span class="code">' + code + '</span>' + esc(label) + '</label><select class="set-select" id="pk-' + id + '" data-set="blocks.' + id + '" data-code="' + code + '">' + optionsHTML + '</select></div>';
    }
    function showHide(v) { return [['show', 'Show'], ['hide', 'Hide this block']].map(function (o) { return '<option value="' + o[0] + '"' + (v === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
    function settingsHTML() {
      var s = S.settings, cs = S.cs, b = cs.blocks;
      function sel(id, key, opts) { return '<select class="set-select" id="' + id + '" data-set="' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(s[key]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
      var def = cs.defaultScope;
      var defOpts = '<option value="ALL"' + (def === 'ALL' ? ' selected' : '') + '>' + esc(L.allLabel) + '</option>' + L.groups.map(function (g) {
        return '<optgroup label="' + esc(g.name) + '"><option value="g:' + g.id + '"' + (def === 'g:' + g.id ? ' selected' : '') + '>' + esc(g.name) + ' (whole ' + L.groupWord + ')</option>' +
          L.teams.filter(function (t) { return t.group === g.id; }).sort(function (a, z) { return a.full < z.full ? -1 : 1; }).map(function (t) { return '<option value="' + t.id + '"' + (def === t.id ? ' selected' : '') + '>' + esc(NFL ? t.full : t.school) + '</option>'; }).join('') + '</optgroup>';
      }).join('');
      var relayNote = isSnap() && S.loadError
        ? '<span class="hint" style="color:var(--live)">Couldn’t reach ESPN (' + esc(S.loadError) + '). The board is showing the saved snapshot. If your host blocks ESPN, add your relay’s address here (worker/ncaa-relay.js also relays ESPN).</span>'
        : '<span class="hint">Leave empty to call ESPN directly. If ESPN ever blocks your site, enter the address of your relay (worker/ncaa-relay.js relays ESPN too).</span>';
      var map = '<div class="map" aria-hidden="true">' +
        '<div class="hdrblk span2">Header</div><div class="hdrblk span1" data-map="T1">T1</div><div class="hdrblk span1" data-map="T2">T2</div><div class="hdrblk span1" data-map="T3">T3</div><div class="hdrblk span1" data-map="T4">T4</div>' +
        '<div class="span4" data-map="R">R · Feature chart</div><div class="span2" data-map="S">S · Standings</div>' +
        '<div class="span3" data-map="F1">F1 · Featured</div><div class="span3" data-map="F2">F2 · Featured</div>' +
        '<div class="span1" data-map="B1">B1</div><div class="span1" data-map="B2">B2</div><div class="span1" data-map="B3">B3</div><div class="span1" data-map="B4">B4</div><div class="span1" data-map="B5">B5</div><div class="span1" data-map="B6">B6</div>' +
        '<div class="span6" data-map="C">C · Clubs chart</div><div class="span6" data-map="U">U · Coming up</div></div>';
      return '<div class="set-top"><div class="set-top-in"><h1>Settings</h1><div class="set-actions"><button type="button" class="btn-hdr" data-act="close-settings">Back to the board</button></div></div></div><div class="hdr-strip"></div>' +
        '<div class="set-wrap">' +
        '<section class="set-sec" aria-labelledby="sec-league"><div class="card-hd"><h2 id="sec-league">League</h2><span class="sub">Which board to show</span></div><div class="set-body">' +
        '<div class="field"><span class="flabel">League</span>' + segHTML('league', s.league, X.LEAGUE_OPTIONS) + '<span class="hint">' + (NFL ? 'The NFL board covers all 32 teams: the whole league, each division, and every team.' : 'College football covers the 138 FBS teams: all of FBS, each conference, and every team.') + ' Football data comes from ESPN.</span></div>' +
        '</div></section>' +
        '<section class="set-sec" aria-labelledby="sec-display"><div class="card-hd"><h2 id="sec-display">Display</h2><span class="sub">Saved in this browser · shared by all boards</span></div><div class="set-body">' +
        '<div class="field"><span class="flabel">Theme</span>' + segHTML('theme', s.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) + '<span class="hint">Auto follows your device setting.</span></div>' +
        '<div class="field"><span class="flabel">Layout</span>' + segHTML('layout', s.layout, [['standard', 'Standard'], ['tv', 'TV']]) + '<span class="hint">TV fits a 16:9 screen with no scrolling, uses larger type, rotates leader boards and charts, and keeps the screen awake where the browser allows it.</span></div>' +
        '<div class="field"><label for="set-tvRotate">TV rotation</label>' + sel('set-tvRotate', 'tvRotate', [[8, 'Every 8 seconds'], [12, 'Every 12 seconds'], [20, 'Every 20 seconds'], [30, 'Every 30 seconds']]) + '</div>' +
        '<div class="field"><span class="flabel">Ticker</span>' + segHTML('ticker', s.ticker, [[true, 'On'], [false, 'Off']]) + '</div>' +
        '<div class="field"><span class="flabel">Ticker speed</span>' + segHTML('tickerSpeed', s.tickerSpeed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]) + '</div>' +
        '</div></section>' +
        '<section class="set-sec" aria-labelledby="sec-data"><div class="card-hd"><h2 id="sec-data">Data</h2><span class="sub">ESPN</span></div><div class="set-body">' +
        '<div class="field"><label for="set-defaultScope">Default view</label><select class="set-select" id="set-defaultScope" data-cset="defaultScope">' + defOpts + '</select><span class="hint">The board opens on this view. Changing it also switches the board now.</span></div>' +
        '<div class="field"><label for="set-relay">Relay address (optional)</label><input class="set-input" id="set-relay" data-cset="relay" type="url" inputmode="url" spellcheck="false" placeholder="https://your-relay.workers.dev" value="' + esc(cs.relay) + '">' + relayNote + '</div>' +
        '<div class="field"><span class="flabel">Leaders per board</span>' + segHTML('limit', s.limit, [[3, '3'], [5, '5'], [10, '10']]) + '</div>' +
        '<div class="field"><span class="flabel">Auto-refresh</span>' + segHTML('refresh', s.refresh, [[true, 'On'], [false, 'Off']]) + '<span class="hint">Scores check every minute while a game is live and wake up around each kickoff. Stats, standings' + (NFL ? '' : ', the poll') + ' and charts refresh once a day at 5 AM.</span></div>' +
        (isLive() ? '<div class="field"><span class="flabel">Season results</span><div><button type="button" class="btn" data-act="recrawl">Download again</button></div><span class="hint">Records and charts come from every week’s scoreboard, kept on this device. Download them again if something looks off.</span></div>' : '') +
        '</div></section>' +
        '<section class="set-sec" aria-labelledby="sec-blocks"><div class="card-hd"><h2 id="sec-blocks">Blocks</h2><span class="sub">Choose what each block shows</span></div><div class="set-body">' + map +
        '<p class="set-note" style="margin:0">Leader boards can show any of the ' + F.STATS.length + ' player stats ESPN ranks, across passing, rushing, receiving, defense, scoring, kicking, punting and returns. ' +
        (NFL ? 'On the All NFL page the standings block shows the playoff picture.' : 'On the All FBS page the standings block shows the AP Top 25, then the CFP rankings once they’re released.') + '</p>' +
        '<h3 class="sec-title" style="font-size:22px">Header tiles</h3><div class="pickers">' + F.BLOCKS.tiles.map(function (k) { return pickerHTML(k.code, k.id, k.label, metricOptions(b[k.id], false)); }).join('') + '</div>' +
        '<h3 class="sec-title" style="font-size:22px">Charts and lists</h3><div class="pickers">' +
        pickerHTML('R', 'race', 'Feature chart', featureOptions(b.race)) + pickerHTML('S', 'standings', 'Standings', showHide(b.standings)) +
        pickerHTML('C', 'clubs', 'Clubs chart', metricOptions(b.clubs, true)) + pickerHTML('U', 'upnext', 'Coming up', showHide(b.upnext)) + '</div>' +
        '<h3 class="sec-title" style="font-size:22px">Leader boards</h3><div class="pickers">' + F.BLOCKS.featured.concat(F.BLOCKS.boards).map(function (k) { return pickerHTML(k.code, k.id, k.label, statOptions(b[k.id])); }).join('') + '</div>' +
        '</div></section>' +
        '<div class="set-actions"><button type="button" class="btn primary" data-act="close-settings">Done</button>' +
        '<button type="button" class="btn' + (S.resetArmed ? ' warn' : '') + '" data-act="reset">' + (S.resetArmed ? 'Select again to reset ' + L.label + ' settings' : 'Reset ' + L.label + ' settings') + '</button>' +
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
      if (S.stopped || S.view !== 'dash') return;
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

    /* ───────── events ───────── */
    function setScope(v) { if (!validScope(v)) v = 'ALL'; S.scope = v; S.tv.board = 0; S.tv.chart = 0; TK.x = 0; render(); }
    function setSetting(path, raw) {
      var val = raw;
      if (raw === 'true') val = true; else if (raw === 'false') val = false;
      else if (/^\d+$/.test(raw) && ['limit', 'tvRotate'].indexOf(path) >= 0) val = parseInt(raw, 10);
      if (path === 'league') { if (val !== LID) { S.settings.league = val; saveSettings(); X.switchLeague(val); } return; }
      if (path.indexOf('blocks.') === 0) S.cs.blocks[path.slice(7)] = val; else S.settings[path] = val;
      if (path === 'layout' && val === 'tv') S.tickPaused = false;
      saveSettings();
      if (path === 'refresh') { scheduleScores(); scheduleDaily(); }
      S.resetArmed = false;
      render();
    }
    function setOwn(path, val) {
      S.cs[path] = val; saveSettings();
      if (path === 'defaultScope') { S.scope = validScope(val) ? val : 'ALL'; render(); }
      if (path === 'relay') {
        API.setRelay(val); API.resetCache(); S.ext = {}; S.pendingExt = {}; S.data = null; render();
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
      else if (act === 'reset') { if (!S.resetArmed) { S.resetArmed = true; render(); return; } S.cs = clone(F.DEFAULT_SETTINGS[LID]); S.scope = 'ALL'; S.resetArmed = false; saveSettings(); render(); }
      else if (act === 'recrawl') {
        if (!isLive()) return;
        try { Object.keys(window.localStorage).forEach(function (k) { if (k.indexOf('mlb-live-board:' + LID + '-season:') === 0) window.localStorage.removeItem(k); }); } catch (er) { /* ignore */ }
        S.view = 'dash'; S.data = null; render(); dailyReload();
      }
      else if (act === 'exit-tv') setSetting('layout', 'standard');
      else if (act === 'fullscreen') { var r = document.documentElement; if (r.requestFullscreen) r.requestFullscreen().catch(function () {}); }
    }
    function onChange(e) {
      var t = e.target, act = t.getAttribute('data-act');
      if (act === 'grp' || act === 'team') { setScope(t.value); return; }
      var own = t.getAttribute('data-cset'); if (own) { setOwn(own, t.value.trim()); return; }
      var path = t.getAttribute('data-set'); if (path) setSetting(path, t.value);
    }
    function onFocus(e) {
      var code = e.target.getAttribute && e.target.getAttribute('data-code');
      document.querySelectorAll('.map [data-map]').forEach(function (n) { n.classList.toggle('lit', !!code && n.getAttribute('data-map') === code); });
    }

    /* ───────── boot ───────── */
    function stop() {
      S.stopped = true;
      clearTimeout(S.timers.sched); clearTimeout(S.timers.daily); clearTimeout(S.timers.fit); clearInterval(S.tv.timer);
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
      S.settings.league = LID;
      saveSettings();
      S.scope = validScope(S.cs.defaultScope) ? S.cs.defaultScope : 'ALL';
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
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('resize', function () { if (!S.stopped && isTV()) { clearTimeout(S.timers.fit); S.timers.fit = setTimeout(render, 150); } });
      }
      app.addEventListener('mouseover', function (e) { TK.hover = !!e.target.closest('#tk-view'); });
      app.addEventListener('mouseleave', function () { TK.hover = false; });
      render();
      TK.raf = window.requestAnimationFrame(tickStep);
      try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!S.stopped && isTV()) CH.fitTV(document.getElementById('app')); }); } catch (e) { /* ignore */ }
      loadLive().catch(function (err) { useSnapshot(err); }).then(function () { if (S.stopped) return; render(); scheduleScores(); scheduleDaily(); });
    }
    return { state: S, render: render, boot: boot, stop: stop, api: API };
  }

  F.Apps = { nfl: make('nfl'), cfb: make('cfb') };
  X.APPS = X.APPS || {}; X.APPS.nfl = F.Apps.nfl; X.APPS.cfb = F.Apps.cfb;
  var cur = X.currentLeague ? X.currentLeague() : 'mlb';
  if (F.Apps[cur]) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { F.Apps[cur].boot(); }); else F.Apps[cur].boot();
  }
})();
