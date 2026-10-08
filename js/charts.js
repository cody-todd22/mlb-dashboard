/* MLB Live Board — chart renderers. Each returns an HTML/SVG string drawn to one scale. */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});
  var C = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rate3(v) { var s = v.toFixed(3); return Math.abs(v) < 1 ? s.replace(/^(-?)0/, '$1') : s; }
  function signed(v) { return v > 0 ? '+' + v : (v < 0 ? '−' + Math.abs(v) : '0'); }

  /* A "nice" tick step for a range, aiming for about five gridlines. */
  function niceStep(range, target) {
    var raw = range / (target || 5), mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  /*
   * General line chart.
   * opts: {
   *   labels: [x label per point ('' to skip)], series: [{ label, vals: [number|null], hi, dash, ref }],
   *   fmt: value → text (axis and end labels), invert: bool (smaller values drawn higher),
   *   min, max, step: optional axis overrides, zero: value of the emphasized baseline (optional),
   *   ints: bool (integer ticks only), w, h, aria
   * }
   */
  C.lines = function (opts) {
    var W = opts.w || 760, H = opts.h || 330;
    var m = { l: 56, r: 118, t: 14, b: 34 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var fmt = opts.fmt || function (v) { return String(v); };
    var all = [];
    opts.series.forEach(function (s) { s.vals.forEach(function (v) { if (v != null && isFinite(v)) all.push(v); }); });
    if (!all.length) return '';
    var lo = opts.min != null ? opts.min : Math.min.apply(null, all);
    var hi = opts.max != null ? opts.max : Math.max.apply(null, all);
    if (opts.zero != null) { lo = Math.min(lo, opts.zero); hi = Math.max(hi, opts.zero); }
    if (hi === lo) { hi += 1; lo -= 1; }
    var step = opts.step || niceStep(hi - lo, 5);
    if (opts.ints) step = Math.max(1, Math.round(step));
    if (opts.min == null) lo = Math.floor(lo / step + 1e-9) * step;
    if (opts.max == null) hi = Math.ceil(hi / step - 1e-9) * step;
    var n = opts.labels.length;
    function x(i) { return m.l + (n <= 1 ? 0 : i / (n - 1) * pw); }
    function y(v) { var f = (hi - v) / (hi - lo); if (opts.invert) f = 1 - f; return m.t + f * ph; }
    var out = ['<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Line chart') + '">'];
    var ticks = Math.round((hi - lo) / step);
    for (var k = 0; k <= ticks; k++) {
      var gv = Math.round((lo + k * step) * 1e6) / 1e6, gy = y(gv).toFixed(1);
      var isZero = opts.zero != null && Math.abs(gv - opts.zero) < 1e-9;
      out.push('<line class="gl' + (isZero ? ' zero' : '') + '" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + gy + '" y2="' + gy + '"></line>');
      out.push('<text class="ax" x="' + (m.l - 8) + '" y="' + gy + '" dy="0.35em" text-anchor="end">' + esc(isZero && opts.zeroLabel ? opts.zeroLabel : fmt(gv)) + '</text>');
    }
    opts.labels.forEach(function (l, i) {
      if (!l) return;
      var anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      out.push('<text class="ax" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' + esc(l) + '</text>');
    });
    var ordered = opts.series.slice().sort(function (a, b) { return (a.hi ? 2 : a.ref ? 0 : 1) - (b.hi ? 2 : b.ref ? 0 : 1); });
    var ends = [];
    ordered.forEach(function (s) {
      var d = '', pen = false, last = null;
      s.vals.forEach(function (v, i) {
        if (v == null || !isFinite(v)) { pen = false; return; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        pen = true; last = { i: i, v: v };
      });
      if (!d) return;
      var cls = 'ln' + (s.hi ? ' hi' : '') + (s.dash ? ' dash' : '') + (s.ref ? ' ref' : '');
      out.push('<path class="' + cls + '" d="' + d.trim() + '"><title>' + esc(s.label) + '</title></path>');
      if (s.hi && !s.noDots && n <= 14) {
        s.vals.forEach(function (v, i) {
          if (v == null || !isFinite(v)) return;
          out.push('<circle class="pt' + (s.dash ? ' dash' : '') + '" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="4.5"><title>' + esc(s.label + ' · ' + ((opts.tipLabels || opts.labels)[i] || '') + ': ' + fmt(v)) + '</title></circle>');
        });
      }
      if (last) ends.push({ text: (s.endLabel || s.label) + ' ' + fmt(last.v), y: y(last.v), hi: s.hi, ref: s.ref });
    });
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var e = 1; e < ends.length; e++) if (ends[e].y - ends[e - 1].y < 18) ends[e].y = ends[e - 1].y + 18;
    var overflow = ends.length ? ends[ends.length - 1].y - (m.t + ph + 6) : 0;
    if (overflow > 0) ends.forEach(function (en) { en.y -= overflow; });
    ends.forEach(function (en) {
      out.push('<text class="end' + (en.hi ? ' hi' : '') + '" x="' + (m.l + pw + 10) + '" y="' + en.y.toFixed(1) + '" dy="0.35em">' + esc(en.text) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  };

  /*
   * Season in one picture: one bar per game, up for wins and down for losses, height = run margin (capped at 10).
   * opts: { games: [{ margin, win, tip }], ticks: [{ i, label }], aria }
   */
  C.gameBars = function (opts) {
    var W = opts.w || 760, H = opts.h || 300;
    var m = { l: 40, r: 12, t: 12, b: 30 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b, mid = m.t + ph / 2, cap = 10;
    var n = Math.max(opts.games.length, 1), bw = pw / n;
    var out = ['<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Game results') + '">'];
    [cap, 5, 0, -5, -cap].forEach(function (v) {
      var yy = (mid - v / cap * ph / 2).toFixed(1);
      out.push('<line class="gl' + (v === 0 ? ' zero' : '') + '" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + yy + '" y2="' + yy + '"></line>');
      out.push('<text class="ax" x="' + (m.l - 6) + '" y="' + yy + '" dy="0.35em" text-anchor="end">' + (v === 0 ? '0' : signed(v)) + '</text>');
    });
    opts.games.forEach(function (g, i) {
      var h = Math.min(Math.abs(g.margin), cap) / cap * ph / 2;
      var x0 = (m.l + i * bw + bw * 0.12).toFixed(2), w = Math.max(0.6, bw * 0.76).toFixed(2);
      var y0 = g.win ? mid - h : mid;
      out.push('<rect class="' + (g.win ? 'gbw' : 'gbl') + '" x="' + x0 + '" y="' + y0.toFixed(1) + '" width="' + w + '" height="' + Math.max(1, h).toFixed(1) + '"><title>' + esc(g.tip) + '</title></rect>');
    });
    (opts.ticks || []).forEach(function (t) {
      out.push('<text class="ax" x="' + (m.l + t.i * bw).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="start">' + esc(t.label) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  };

  /*
   * All-clubs chart: every club's distance from the MLB average for one metric,
   * oriented so up is always better. opts: { items: [{ id, abbr, name, value, text, on }], low, label, avgText }
   */
  C.clubs = function (opts) {
    var items = opts.items.filter(function (it) { return it.value != null; });
    if (!items.length) return '';
    var mean = items.reduce(function (a, it) { return a + it.value; }, 0) / items.length;
    items.forEach(function (it) { it.diff = (it.value - mean) * (opts.low ? -1 : 1); });
    var max = Math.max.apply(null, items.map(function (it) { return Math.abs(it.diff); })) || 1;
    items.sort(function (a, b) { return b.diff - a.diff; });
    var cols = items.map(function (it) {
      var h = (Math.abs(it.diff) / max * 100).toFixed(1) + '%';
      var tip = it.name + ': ' + it.text + ' (' + opts.label + ')';
      var lab = it.on ? '<span class="col-val">' + esc(it.text) + '</span>' : '';
      return '<div class="col' + (it.on ? ' on' : '') + (it.diff >= 0 ? ' good' : '') + '" title="' + esc(tip) + '">' +
        '<div class="col-half up">' + (it.diff >= 0 ? lab + '<div class="col-bar" style="height:' + h + '"></div>' : '') + '</div>' +
        '<div class="col-half">' + (it.diff < 0 ? '<div class="col-bar" style="height:' + h + '"></div>' + lab : '') + '</div></div>';
    }).join('');
    var labs = items.map(function (it) { return '<span class="' + (it.on ? 'on' : '') + '">' + esc(it.abbr) + '</span>'; }).join('');
    return '<div class="clubs-in"><div class="cols" role="img" aria-label="' + esc(opts.label + ' for ' + (opts.scopeName || 'all 30 clubs') + ', compared with the average') + '">' +
      '<div class="mid"><span>' + esc(opts.avgName || 'MLB avg') + ' ' + esc(opts.avgText) + '</span></div>' + cols + '</div><div class="col-labs">' + labs + '</div></div>';
  };

  /* Leader values arrive as display strings: ".311", "1.033", "3,412", "205.1", "-1.2", "-.--". */
  function statNum(v) {
    var t = String(v == null ? '' : v).replace(/,/g, '').replace(/[^\d.\-+eE]/g, '').trim();
    if (!t || !/\d/.test(t)) return NaN;
    var n = parseFloat(t);
    return isFinite(n) ? n : NaN;
  }
  C.statNum = statNum;
  /* Which way a board is ranked: most steps between neighbouring values decide (a single odd row can't flip it). */
  function ascending(vals) {
    var up = 0, down = 0, prev = null;
    vals.forEach(function (v) { if (!isFinite(v)) return; if (prev != null) { if (v > prev) up++; else if (v < prev) down++; } prev = v; });
    return up > down;
  }
  /* Rows in true rank order. If a feed ever lists rows out of order, they are re-sorted by value and
     re-ranked (equal values share a rank), so rank, value and bar always agree. */
  C.orderRows = function (rows) {
    var vals = rows.map(function (r) { return statNum(r.value); }), asc = ascending(vals), ok = true;
    var seenBlank = false;
    for (var i = 0; i < vals.length; i++) {
      if (!isFinite(vals[i])) { seenBlank = true; continue; }
      if (seenBlank) { ok = false; break; }   // a blank value ("-.--") sorts to the bottom
      if (i > 0 && (asc ? vals[i] < vals[i - 1] : vals[i] > vals[i - 1])) { ok = false; break; }
    }
    if (ok) return rows;
    var idx = rows.map(function (r, i) { return i; }).sort(function (a, b) {
      var va = vals[a], vb = vals[b];
      if (!isFinite(va) && !isFinite(vb)) return a - b;
      if (!isFinite(va)) return 1; if (!isFinite(vb)) return -1;
      return (asc ? va - vb : vb - va) || a - b;
    });
    var out = [], firstRank = rows[0] && rows[0].rank != null ? rows[0].rank : 1, lastVal = null, lastRank = firstRank;
    idx.forEach(function (j, k) {
      var r = {}; for (var key in rows[j]) r[key] = rows[j][key];
      if (k > 0 && String(r.value) !== lastVal) lastRank = firstRank + k;
      r.rank = lastRank; lastVal = String(r.value);
      out.push(r);
    });
    return out;
  };
  /*
   * Bar length for each leader row, 0.06–1. Higher-is-better boards: share of the #1 value.
   * Lower-is-better boards (ERA, WHIP…): #1 value ÷ this value. Boards with zero or negative
   * values (a 0.00 ERA, negative WAR or run values) use the spread between the best and worst row.
   * Bars never grow down the list: equal values get equal bars, and a worse value is always at least 2% shorter.
   */
  C.shares = function (rows) {
    var vals = rows.map(function (r) { return statNum(r.value); });
    var fin = vals.filter(function (v) { return isFinite(v); });
    if (!fin.length) return vals.map(function () { return 0.06; });
    var asc = ascending(vals), best = asc ? Math.min.apply(null, fin) : Math.max.apply(null, fin), worst = asc ? Math.max.apply(null, fin) : Math.min.apply(null, fin);
    var ratio = asc ? best > 0 : worst >= 0 && best > 0;
    var out = vals.map(function (v) {
      if (!isFinite(v)) return 0.06;
      var p;
      if (ratio) p = asc ? best / v : v / best;
      else p = best === worst ? 1 : 0.06 + 0.94 * (asc ? (worst - v) : (v - worst)) / Math.abs(best - worst);
      return Math.max(0.06, Math.min(1, p));
    });
    var prev = -1;
    for (var i = 0; i < out.length; i++) {
      if (!isFinite(vals[i])) continue;
      /* a worse value always gets a visibly shorter bar (at least 2% of the width), so close races still read in order */
      if (prev >= 0) { if (vals[i] === vals[prev]) out[i] = out[prev]; else out[i] = Math.max(0.06, Math.min(out[i], out[prev] - 0.02)); }
      prev = i;
    }
    return out;
  };

  /* TV layout: hide trailing rows (games, standings, leaders) that don't fit their panel, so nothing is cut in half. */
  C.fitTV = function (root) {
    if (!root || !document.documentElement.classList.contains('tv')) return;
    root.querySelectorAll('.tv-panel').forEach(function (panel) {
      var lists = [];
      panel.querySelectorAll('.tv-games, .lb, .st-scroll').forEach(function (l) { lists.push([].slice.call(l.children).filter(function (c) { return !c.classList.contains('head'); })); });
      var direct = [].slice.call(panel.children).filter(function (c) { return c.classList.contains('st-row') && !c.classList.contains('head'); });
      if (direct.length) lists.push(direct);
      lists.forEach(function (items) { items.forEach(function (c) { c.hidden = false; }); });   // measure with everything showing
      var limit = panel.getBoundingClientRect().bottom - 2;
      lists.forEach(function (items) {
        for (var i = items.length - 1; i > 0; i--) {
          if (items[i].getBoundingClientRect().bottom <= limit) break;
          items[i].hidden = true;
        }
      });
    });
  };

  C.rate3 = rate3;
  C.signed = signed;
  C.esc = esc;
  X.Charts = C;
})();
