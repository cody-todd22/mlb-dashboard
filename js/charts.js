/* MLB Live Board — chart renderers. Each returns an HTML/SVG string drawn to one scale. */
(function () {
  'use strict';
  var X = (window.MLBX = window.MLBX || {});
  var C = {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rate3(v) { var s = v.toFixed(3); return v < 1 ? s.replace(/^0/, '') : s; }
  function signed(v) { return v > 0 ? '+' + v : (v < 0 ? '−' + Math.abs(v) : '0'); }

  /*
   * Season race line chart.
   * opts: { labels: [...], series: [{ id, abbr, vals: [number|null], hi }], metric: 'gap' | 'pct' }
   */
  C.race = function (opts) {
    var W = opts.w || 760, H = opts.h || 330;
    var m = { l: 52, r: 104, t: 14, b: 34 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var all = [];
    opts.series.forEach(function (s) { s.vals.forEach(function (v) { if (v != null) all.push(v); }); });
    if (!all.length) return '';
    var isPct = opts.metric === 'pct';
    var step, lo, hi;
    if (isPct) {
      step = 0.05;
      lo = Math.min(0.5, Math.floor(Math.min.apply(null, all) / step) * step);
      hi = Math.max(0.5, Math.ceil(Math.max.apply(null, all) / step) * step);
    } else {
      var range = Math.max.apply(null, all) - Math.min.apply(null, all);
      step = range > 100 ? 25 : (range > 60 ? 20 : 10);
      lo = Math.min(0, Math.floor(Math.min.apply(null, all) / step) * step);
      hi = Math.max(0, Math.ceil(Math.max.apply(null, all) / step) * step);
    }
    if (hi === lo) hi = lo + step;
    var n = opts.labels.length;
    function x(i) { return m.l + (n === 1 ? 0 : i / (n - 1) * pw); }
    function y(v) { return m.t + (hi - v) / (hi - lo) * ph; }
    function fmt(v) { return isPct ? rate3(v) : (v === 0 ? '.500' : signed(v)); }
    var zero = isPct ? 0.5 : 0;
    var out = ['<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Season race chart') + '">'];
    for (var g = hi; g >= lo - 1e-9; g -= step) {
      var gv = Math.round(g * 1000) / 1000;
      var gy = y(gv).toFixed(1);
      out.push('<line class="gl' + (Math.abs(gv - zero) < 1e-9 ? ' zero' : '') + '" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + gy + '" y2="' + gy + '"></line>');
      out.push('<text class="ax" x="' + (m.l - 8) + '" y="' + gy + '" dy="0.35em" text-anchor="end">' + esc(isPct ? rate3(gv) : (gv === 0 ? '.500' : signed(gv))) + '</text>');
    }
    opts.labels.forEach(function (l, i) {
      var anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
      out.push('<text class="ax" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' + esc(l) + '</text>');
    });
    var ordered = opts.series.slice().sort(function (a, b) { return (a.hi ? 1 : 0) - (b.hi ? 1 : 0); });
    var ends = [];
    ordered.forEach(function (s) {
      var d = '', pen = false, last = null;
      s.vals.forEach(function (v, i) {
        if (v == null) { pen = false; return; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        pen = true; last = { i: i, v: v };
      });
      out.push('<path class="ln' + (s.hi ? ' hi' : '') + '" d="' + d.trim() + '"><title>' + esc(s.abbr) + '</title></path>');
      if (s.hi) {
        s.vals.forEach(function (v, i) {
          if (v == null) return;
          out.push('<circle class="pt" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="5"><title>' + esc(s.abbr + ' · ' + opts.labels[i] + ': ' + fmt(v)) + '</title></circle>');
        });
      }
      if (last) ends.push({ abbr: s.abbr, v: last.v, y: y(last.v), x: x(last.i), hi: s.hi });
    });
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var e = 1; e < ends.length; e++) if (ends[e].y - ends[e - 1].y < 18) ends[e].y = ends[e - 1].y + 18;
    var overflow = ends.length ? ends[ends.length - 1].y - (m.t + ph) : 0;
    if (overflow > 0) ends.forEach(function (en) { en.y -= overflow; });
    ends.forEach(function (en) {
      out.push('<text class="end' + (en.hi ? ' hi' : '') + '" x="' + (m.l + pw + 10) + '" y="' + en.y.toFixed(1) + '" dy="0.35em">' + esc(en.abbr + ' ' + fmt(en.v)) + '</text>');
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
    return '<div class="clubs-in"><div class="cols" role="img" aria-label="' + esc(opts.label + ' for all 30 clubs, compared with the MLB average') + '">' +
      '<div class="mid"><span>MLB avg ' + esc(opts.avgText) + '</span></div>' + cols + '</div><div class="col-labs">' + labs + '</div></div>';
  };

  /* Share of the #1 value for leader bars; detects boards ranked low-to-high (ERA, WHIP…). */
  C.shares = function (rows) {
    var vals = rows.map(function (r) { return parseFloat(r.value); });
    var first = vals[0], lastV = vals[vals.length - 1];
    var asc = vals.length > 1 && first < lastV;
    return vals.map(function (v) {
      if (!isFinite(v) || !isFinite(first) || v === 0 || first === 0) return 0.06;
      var p = asc ? first / v : v / first;
      return Math.max(0.06, Math.min(1, p));
    });
  };

  C.rate3 = rate3;
  C.signed = signed;
  C.esc = esc;
  X.Charts = C;
})();
