/* MLB Live Board — pieces shared by all four boards: favorite teams, score alerts, the game-detail
 * dialog, headlines (ESPN news feed), the live-game spotlight card, and rotating between sports in TV layout.
 * Each board registers itself with X.Extras.attach(league, hooks) when it boots. */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});
  var E = (X.Extras = {});
  var esc = X.Charts.esc;
  var LEAGUES = ['mlb', 'college', 'nfl', 'cfb'];
  var NAMES = { mlb: 'MLB', college: 'College baseball', nfl: 'NFL', cfb: 'College football' };

  function readJSON(k) { try { var raw = window.localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function writeJSON(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

  /* ───────── the board that's running ───────── */
  var cur = null;
  /* hooks: { render, refresh, settings(): shared settings object, save(), isTV(), detail(pk) → { title, html, more? }, setBlock(key, val) } */
  E.attach = function (league, hooks) { cur = { league: league, hooks: hooks, since: Date.now() }; bind(); E.closeModal(); };
  E.league = function () { return cur && cur.league; };

  /* ───────── favorite teams ───────── */
  var LS_FAVS = 'mlb-live-board:favs', MAX_FAVS = 12, favCache = null;
  function loadFavs() {
    if (favCache) return favCache;
    var raw = readJSON(LS_FAVS), out = {};
    LEAGUES.forEach(function (lg) {
      var list = raw && Array.isArray(raw[lg]) ? raw[lg] : [];
      out[lg] = list.filter(function (v) { return (typeof v === 'string' || typeof v === 'number') && String(v).length <= 60; }).map(String).slice(0, MAX_FAVS);
    });
    return (favCache = out);
  }
  E.favs = function (league) { return loadFavs()[league] || []; };
  E.isFav = function (league, id) { return id != null && E.favs(league).indexOf(String(id)) >= 0; };
  E.favGame = function (league, a, b) { return E.isFav(league, a) || E.isFav(league, b); };
  E.setFav = function (league, id, on) {
    var f = loadFavs(), list = f[league] || (f[league] = []), i = list.indexOf(String(id));
    if (on && i < 0 && list.length < MAX_FAVS) list.push(String(id));
    if (!on && i >= 0) list.splice(i, 1);
    writeJSON(LS_FAVS, f);
  };
  /* Favorites' games first, everything else in its existing order. ids(g) → [awayId, homeId]. */
  E.favFirst = function (league, games, ids) {
    if (!E.favs(league).length) return games;
    var a = [], b = [];
    games.forEach(function (g) { var p = ids(g); (E.favGame(league, p[0], p[1]) ? a : b).push(g); });
    return a.concat(b);
  };

  /* ───────── in season? (used to skip sports when rotating) ───────── */
  var SEASONS = { mlb: ['03-15', '11-05'], college: ['02-10', '06-30'], nfl: ['08-01', '02-15'], cfb: ['08-20', '01-25'] };
  E.inSeason = function (league, d) {
    var s = SEASONS[league]; if (!s) return true;
    d = d || new Date();
    var k = ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    return s[0] <= s[1] ? (k >= s[0] && k <= s[1]) : (k >= s[0] || k <= s[1]);
  };

  /* ───────── rotating between sports in TV layout ───────── */
  E.sportList = function (v) { return String(v || '').split(',').filter(function (x, i, a) { return LEAGUES.indexOf(x) >= 0 && a.indexOf(x) === i; }); };
  /* The sports the TV should cycle through right now: the picked ones that are in season (all picked ones if none are). */
  E.rotation = function (settings, now) {
    var picked = E.sportList(settings.tvSports);
    if (picked.length < 2) return [];
    var live = picked.filter(function (lg) { return E.inSeason(lg, now); });
    return live.length ? live : picked;
  };
  function rotateTick() {
    if (!cur || !X.switchLeague || modalOpen()) return;
    var h = cur.hooks;
    if (!h.isTV || !h.isTV()) { cur.since = Date.now(); return; }   // the clock only runs while the TV board is showing
    var s = h.settings(), list = E.rotation(s, new Date());
    if (!list.length) return;
    var i = list.indexOf(cur.league), mins = Math.max(1, Number(s.tvSportMins) || 5);
    if (i >= 0 && (list.length < 2 || Date.now() - cur.since < mins * 60000)) return;
    var next = list[(i + 1) % list.length];
    if (next !== cur.league) X.switchLeague(next, { view: 'dash' });
  }
  E.rotateTick = rotateTick;   // exposed for tests

  /* ───────── toasts (score alerts for favorites) ───────── */
  function toastRoot() {
    var r = document.getElementById('toasts');
    if (!r) { r = document.createElement('div'); r.id = 'toasts'; r.setAttribute('role', 'status'); r.setAttribute('aria-live', 'polite'); document.body.appendChild(r); }
    return r;
  }
  E.toast = function (label, text) {
    var r = toastRoot(), t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<strong>' + esc(label) + '</strong><span>' + esc(text) + '</span>';
    r.appendChild(t);
    while (r.children.length > 4) r.removeChild(r.firstChild);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }, 9000);
  };
  /* Each board hands over its current games after every refresh: [{ pk, state: pre|live|final|off, a: { id, label, score }, h: {…} }].
   * The first hand-over is only a baseline; after that a favorite's game starting, scoring or ending raises a toast. */
  var seen = {};
  E.watch = function (league, list) {
    var prev = seen[league], now = {};
    list.forEach(function (g) { now[g.pk] = { st: g.state, a: g.a.score, h: g.h.score }; });
    seen[league] = now;
    if (!prev || !E.favs(league).length) return;
    list.forEach(function (g) {
      if (!E.favGame(league, g.a.id, g.h.id)) return;
      var p = prev[g.pk]; if (!p) return;
      var score = g.a.label + ' ' + (g.a.score == null ? 0 : g.a.score) + ', ' + g.h.label + ' ' + (g.h.score == null ? 0 : g.h.score);
      if (g.state === 'final' && p.st !== 'final') E.toast('Final', score);
      else if (g.state === 'live' && p.st === 'pre') E.toast('Underway', g.a.label + ' at ' + g.h.label);
      else if (g.state === 'live' && (p.a !== g.a.score || p.h !== g.h.score)) E.toast('Score', score);
    });
  };

  /* ───────── dialog (game detail) ───────── */
  var modalToken = 0, lastFocus = null;
  function modalRoot() { return document.getElementById('modal-root'); }
  function modalOpen() { return !!modalRoot(); }
  E.openModal = function (title, html) {
    E.closeModal();
    lastFocus = document.activeElement;
    var r = document.createElement('div');
    r.id = 'modal-root'; r.className = 'modal-back'; r.setAttribute('data-modal-close', '');
    r.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="modal-hd"><h2>' + esc(title) + '</h2>' +
      '<button type="button" class="modal-x" data-modal-close aria-label="Close">×</button></div><div class="modal-bd" id="modal-bd">' + html + '</div></div>';
    document.body.appendChild(r);
    var x = r.querySelector('.modal-x'); if (x) x.focus();
    return ++modalToken;
  };
  E.setModal = function (token, html) { var b = document.getElementById('modal-bd'); if (b && token === modalToken) b.innerHTML = html; };
  E.closeModal = function () {
    var r = modalRoot(); if (!r) return;
    r.parentNode.removeChild(r); modalToken++;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    lastFocus = null;
  };
  function openGame(pk) {
    if (!cur || !cur.hooks.detail) return;
    var d = cur.hooks.detail(pk); if (!d) return;
    var token = E.openModal(d.title, d.html + (d.more ? '<div class="loading" id="modal-more">Loading game detail</div>' : ''));
    if (d.more) d.more.then(function (html) { E.setModal(token, d.html + html); }, function () {
      E.setModal(token, d.html + '<div class="empty"><strong>More detail isn’t available</strong>The game feed didn’t answer. Close this and try again in a minute.</div>');
    });
  }
  /* Small builders the boards share for the dialog body. */
  E.detailHead = function (o) {   // o: { away: { name, score, sub, win }, home: {…}, status, lines: [..] }
    function side(s) { return '<div class="gd-team' + (s.win ? ' win' : '') + '"><i style="background:' + esc(s.color || '#888') + '"></i><span class="gd-n">' + esc(s.name) + (s.sub ? '<small>' + esc(s.sub) + '</small>' : '') + '</span><span class="gd-s">' + esc(s.score == null ? '' : s.score) + '</span></div>'; }
    return '<div class="gd-head"><div class="gd-status">' + esc(o.status) + '</div>' + side(o.away) + side(o.home) +
      (o.lines || []).filter(Boolean).map(function (l) { return '<div class="gd-line">' + esc(l) + '</div>'; }).join('') + '</div>';
  };
  E.detailTable = function (title, head, rows) {   // head: ['', '1', '2', …]; rows: [[label, v, v, …]]
    if (!rows.length) return '';
    return '<h3 class="gd-h">' + esc(title) + '</h3><div class="gd-scroll"><table class="gd-table"><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return (i ? '<td>' : '<th scope="row">') + esc(c == null ? '' : c) + (i ? '</td>' : '</th>'); }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  };
  E.detailList = function (title, items) {   // items: [[label, text]]
    items = items.filter(function (i) { return i && i[1]; });
    if (!items.length) return '';
    return '<h3 class="gd-h">' + esc(title) + '</h3><dl class="gd-list">' + items.map(function (i) { return '<div><dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd></div>'; }).join('') + '</dl>';
  };

  /* ───────── headlines (ESPN news feed) ───────── */
  var NEWS_PATH = { mlb: 'baseball/mlb', college: 'baseball/college-baseball', nfl: 'football/nfl', cfb: 'football/college-football' };
  /* ESPN's own MLB team numbers, by abbreviation (MLB's Stats API uses different ones). */
  var ESPN_MLB = { BAL: 1, BOS: 2, LAA: 3, CWS: 4, CHW: 4, CLE: 5, DET: 6, KC: 7, MIL: 8, MIN: 9, NYY: 10, ATH: 11, OAK: 11, SEA: 12, TEX: 13, TOR: 14, ATL: 15, CHC: 16, CIN: 17, HOU: 18,
    LAD: 19, WSH: 20, NYM: 21, PHI: 22, PIT: 23, STL: 24, SD: 25, SF: 26, COL: 27, MIA: 28, ARI: 29, AZ: 29, TB: 30 };
  E.espnMlbId = function (abbr) { return ESPN_MLB[abbr] || null; };
  var news = {}, NEWS_TTL = 10 * 60000, NEWS_RETRY = 2 * 60000;
  function safeLink(u) { return typeof u === 'string' && /^https:\/\/([a-z0-9-]+\.)*espn\.com\//i.test(u) && u.length < 400 ? u : ''; }
  function fetchNews(league, team, get) {
    var path = '/apis/site/v2/sports/' + NEWS_PATH[league] + '/news?limit=14' + (team ? '&team=' + encodeURIComponent(team) : '');
    var p = get ? get(path) : fetch('https://site.api.espn.com' + path).then(function (r) { if (!r.ok) throw new Error('ESPN returned ' + r.status); return r.json(); });
    return p.then(function (j) {
      return ((j && j.articles) || []).filter(function (a) { return a && a.headline && a.type !== 'Media' && !a.premium; }).slice(0, 8).map(function (a) {
        return { title: String(a.headline).slice(0, 200), at: a.published || a.lastModified || '', href: safeLink(a.links && a.links.web && a.links.web.href) };
      });
    });
  }
  /* → { rows } | { loading } | { error }. Kept 10 minutes; a failure is retried after 2. `get(path)` lets a board send the call through its relay. */
  E.newsState = function (league, team, get) {
    var k = league + '|' + (team || ''), v = news[k], now = Date.now();
    var fresh = v && !v.busy && now - v.at < (v.error ? NEWS_RETRY : NEWS_TTL);
    if (v && (fresh || v.busy)) return v.rows ? { rows: v.rows } : (v.error ? { error: true } : { loading: true });
    var n = news[k] = { busy: true, at: now, rows: v && v.rows, error: false };
    fetchNews(league, team, get).then(function (rows) { n.rows = rows; n.error = false; }, function () { n.error = !n.rows; })
      .then(function () { n.busy = false; n.at = Date.now(); if (cur && cur.league === league && cur.hooks.refresh) cur.hooks.refresh(); });
    return n.rows ? { rows: n.rows } : { loading: true };
  };
  function ago(iso) {
    var t = new Date(iso).getTime(); if (!isFinite(t)) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 60) return m <= 1 ? 'Just now' : m + ' min ago';
    if (m < 48 * 60) return Math.round(m / 60) + ' hr ago';
    return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  /* → { title, sub, body } for a card, or null when there's nothing to show. tv = no links, fewer rows. */
  E.newsCard = function (league, team, teamName, get, tv) {
    var st = E.newsState(league, team, get), body;
    if (st.loading) body = '<div class="loading">Loading headlines</div>';
    else if (st.error) body = '<div class="empty"><strong>Headlines aren’t available</strong>ESPN’s news feed didn’t answer. The board tries again in a couple of minutes.</div>';
    else if (!st.rows.length) body = '<div class="empty"><strong>No headlines right now</strong>ESPN has no recent stories for this view.</div>';
    else body = '<div class="news">' + st.rows.slice(0, tv ? 5 : 6).map(function (r) {
      var inner = '<span class="news-t">' + esc(r.title) + '</span><span class="news-w">' + esc(ago(r.at)) + '</span>';
      return r.href && !tv ? '<a class="news-row" href="' + esc(r.href) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>' : '<div class="news-row">' + inner + '</div>';
    }).join('') + '</div>';
    return { title: 'Headlines', sub: (teamName || NAMES[league]) + ' · ESPN', body: body, empty: !st.rows || !st.rows.length };
  };

  /* ───────── live-game spotlight (TV) ───────── */
  /* o: { away: { name, color, score, rank, has }, home: {…}, status, note, tv, fav } */
  E.spotlight = function (o) {
    var as = o.away.score == null ? 0 : o.away.score, hs = o.home.score == null ? 0 : o.home.score;
    function side(s, lead) {
      return '<div class="spot-row' + (lead ? ' lead' : '') + '"><i style="background:' + esc(s.color || '#888') + '"></i><span class="spot-n">' + (s.rank ? '<small>' + esc(s.rank) + '</small>' : '') + esc(s.name) +
        (s.has ? '<b class="spot-has" aria-label="has the ball">●</b>' : '') + '</span><span class="spot-s">' + esc(s.score == null ? 0 : s.score) + '</span></div>';
    }
    return '<div class="spot' + (o.fav ? ' fav' : '') + '"><div class="spot-st"><span class="tk-live">Live</span><span>' + esc(o.status || 'In progress') + '</span></div>' +
      side(o.away, as > hs) + side(o.home, hs > as) +
      '<div class="spot-note">' + esc([o.note, o.tv].filter(Boolean).join(' · ')) + '</div></div>';
  };
  /* Slot live cards into a TV chart rotation: one after every two charts, cycling through the live games. */
  E.weave = function (charts, lives) {
    if (!lives.length) return charts;
    if (!charts.length) return lives;
    var out = [], k = 0;
    charts.forEach(function (c, i) { if (i % 2 === 0) out.push(lives[k++ % lives.length]); out.push(c); });
    return out;
  };

  /* ───────── settings: one section shared by every board ───────── */
  /* teams: [[id, label]] sorted for the picker; newsVal: 'show' | 'hide' */
  E.settingsHTML = function (league, teams, newsVal, settings) {
    var favs = E.favs(league), byId = {};
    teams.forEach(function (t) { byId[String(t[0])] = t[1]; });
    var chips = favs.filter(function (id) { return byId[id]; }).map(function (id) {
      return '<button type="button" class="chip" data-fav-del="' + esc(id) + '" aria-label="Remove ' + esc(byId[id]) + ' from favorites">' + esc(byId[id]) + ' <span aria-hidden="true">×</span></button>';
    }).join('');
    var picked = E.sportList(settings.tvSports), mins = Number(settings.tvSportMins) || 5;
    return '<section class="set-sec" aria-labelledby="sec-extras"><div class="card-hd"><h2 id="sec-extras">Favorites, headlines and sports</h2><span class="sub">Saved in this browser</span></div><div class="set-body">' +
      '<div class="field"><label for="fav-add">Favorite teams</label><div><select class="set-select" id="fav-add" data-fav-add><option value="">Add a team…</option>' +
      teams.filter(function (t) { return favs.indexOf(String(t[0])) < 0; }).map(function (t) { return '<option value="' + esc(t[0]) + '">' + esc(t[1]) + '</option>'; }).join('') + '</select>' +
      (chips ? '<div class="chips">' + chips + '</div>' : '') + '</div>' +
      '<span class="hint">Favorites’ games come first in the ticker, Coming up and the live spotlight, and are marked with a star. While the board is open, a short alert appears when one of their games starts, scores or ends. Favorites are kept per sport.</span></div>' +
      '<div class="field"><label for="x-news">Headlines</label><select class="set-select" id="x-news" data-xblock="news">' +
      [['show', 'Show'], ['hide', 'Hide this block']].map(function (o) { return '<option value="' + o[0] + '"' + (newsVal === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span class="hint">The latest ESPN headlines for the league, or for the team on a team page. In TV layout they join the chart rotation.</span></div>' +
      '<div class="field"><span class="flabel">Rotate sports on TV</span><div class="checks">' + LEAGUES.map(function (lg) {
        return '<label class="check"><input type="checkbox" data-xsport="' + lg + '"' + (picked.indexOf(lg) >= 0 ? ' checked' : '') + '> ' + esc(NAMES[lg]) + '</label>';
      }).join('') + '</div><span class="hint">Pick two or more and TV layout moves from one sport’s board to the next. Sports that are out of season are skipped. Leave them all clear to stay on one board.</span></div>' +
      '<div class="field"><label for="x-mins">Time on each sport</label><select class="set-select" id="x-mins" data-xset="tvSportMins">' +
      [[2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes']].map(function (o) { return '<option value="' + o[0] + '"' + (mins === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '</div></section>';
  };

  /* ───────── one set of document listeners for all of the above ───────── */
  var bound = false;
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('change', function (e) {
      if (!cur) return;
      var t = e.target, h = cur.hooks;
      if (t.hasAttribute && t.hasAttribute('data-fav-add')) { if (t.value) { E.setFav(cur.league, t.value, true); h.render(); } return; }
      if (t.hasAttribute && t.hasAttribute('data-xblock')) { h.setBlock(t.getAttribute('data-xblock'), t.value === 'hide' ? 'hide' : 'show'); return; }
      if (t.hasAttribute && t.hasAttribute('data-xsport')) {
        var s = h.settings(), list = E.sportList(s.tvSports), lg = t.getAttribute('data-xsport'), i = list.indexOf(lg);
        if (t.checked && i < 0) list.push(lg); if (!t.checked && i >= 0) list.splice(i, 1);
        s.tvSports = LEAGUES.filter(function (x) { return list.indexOf(x) >= 0; }).join(','); h.save(); return;
      }
      if (t.getAttribute && t.getAttribute('data-xset') === 'tvSportMins') { h.settings().tvSportMins = parseInt(t.value, 10) || 5; h.save(); }
    });
    document.addEventListener('click', function (e) {
      var t = e.target; if (!t.closest) return;
      if (t.closest('[data-modal-close]') && (t.hasAttribute('data-modal-close'))) { E.closeModal(); return; }
      var del = t.closest('[data-fav-del]');
      if (del && cur) { E.setFav(cur.league, del.getAttribute('data-fav-del'), false); cur.hooks.render(); return; }
      var g = t.closest('[data-game]');
      if (g && !t.closest('a')) openGame(g.getAttribute('data-game'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOpen()) { E.closeModal(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.hasAttribute && e.target.hasAttribute('data-game')) { e.preventDefault(); openGame(e.target.getAttribute('data-game')); }
    });
    setInterval(rotateTick, 15000);
  }
})();
