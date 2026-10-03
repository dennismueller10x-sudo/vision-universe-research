/* Vision Universe® — Supertrader Strategy Chart
   Liest dieselben kanonischen Artefakte wie Discovery/Quant (technische
   Materialisierung als gzip-Shard, lange Wochenreihe) mit demselben
   Lademechanismus (fetch + DecompressionStream). Es werden keine Kursdaten
   kopiert oder neu berechnet — nur Strategie-Overlays gezeichnet.
   Eine Preisachse, separates Volumen-Pane, Crosshair-Tooltip, abschaltbare
   Overlays mit Legende. */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var cache = {};

  function loadGz(path) {
    if (cache[path]) return cache[path];
    var p = fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
      return r.arrayBuffer();
    }).then(function (buf) {
      if (typeof DecompressionStream !== 'function') throw new Error('GZIP_DECOMPRESSION_UNSUPPORTED');
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }).then(JSON.parse).catch(function (e) { delete cache[path]; throw e; });
    cache[path] = p;
    return p;
  }

  function loadBars(shard, symbol) {
    return loadGz('/quant/data/product/technical-signals-v1/' + shard + '.json.gz').then(function (j) {
      var inst = j.instruments && j.instruments[symbol];
      if (!inst) throw new Error('NO_BARS');
      var b = inst.bars;
      return { date: b.timestamps.map(function (d) { return String(d).slice(0, 10); }), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, generatedAt: j.generatedAt, priceSeriesType: inst.priceSeriesType };
    });
  }

  function loadWeekly(path) {
    if (cache[path]) return cache[path];
    cache[path] = fetch(path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { return { date: j.points.map(function (p) { return String(p[0]).slice(0, 10); }), close: j.points.map(function (p) { return p[1]; }), to: j.to }; });
    return cache[path];
  }

  function sma(v, n) {
    var out = new Array(v.length).fill(null), s = 0, c = 0;
    for (var i = 0; i < v.length; i++) {
      if (!isFinite(v[i])) { s = 0; c = 0; continue; }
      s += v[i]; c++;
      if (c > n) { s -= v[i - n]; c = n; }
      if (c === n) out[i] = s / n;
    }
    return out;
  }

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function fmt(v) {
    if (!isFinite(v)) return '–';
    var a = Math.abs(v);
    return v.toLocaleString('de-DE', { minimumFractionDigits: a >= 1000 ? 0 : 2, maximumFractionDigits: a >= 1000 ? 0 : 2 });
  }
  function fmtVol(v) { if (!isFinite(v)) return '–'; if (v >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + ' Mrd.'; if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' Mio.'; if (v >= 1e3) return Math.round(v / 1e3) + ' Tsd.'; return String(Math.round(v)); }
  // Ohne Datum kein Absturz im Tooltip-Handler (vorher: d.split auf null).
  function fmtDate(d) { var p = String(d || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : (d ? String(d) : '–'); }

  /**
   * cfg: { bars, mode: 'candles'|'line', window, overlays:[{id,label,color,values,on}],
   *        levels:[{id,label,value,color,dash,on}], boxes:[{from,to,top,bottom,color,label}],
   *        markers:[{date,price,kind,label}], showVolume, title, status }
   */
  function render(host, cfg) {
    host.innerHTML = '';
    host.classList.add('st-chart');
    var state = { on: {} };
    (cfg.overlays || []).concat(cfg.levels || []).forEach(function (o) { state.on[o.id] = o.on !== false; });
    if (cfg.boxes && cfg.boxes.length) state.on.__boxes = true;
    if (cfg.markers && cfg.markers.length) state.on.__markers = true;

    var tools = document.createElement('div');
    tools.className = 'st-chart-tools';
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', 'Overlays ein- und ausblenden');
    function addToggle(id, label, color) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-pressed', String(!!state.on[id]));
      b.style.setProperty('--c', color);
      b.innerHTML = '<i></i>' + label;
      b.onclick = function () { state.on[id] = !state.on[id]; b.setAttribute('aria-pressed', String(state.on[id])); draw(); };
      tools.appendChild(b);
    }
    (cfg.overlays || []).forEach(function (o) { addToggle(o.id, o.label, o.color); });
    (cfg.levels || []).forEach(function (o) { addToggle(o.id, o.label, o.color); });
    if (cfg.boxes && cfg.boxes.length) addToggle('__boxes', cfg.boxes[0].label || 'Box', cfg.boxes[0].color || '#ff7a1a');
    if (cfg.markers && cfg.markers.length) addToggle('__markers', 'Bestätigung · Modell-Ein-/Ausstiege', '#ffffff');
    host.appendChild(tools);

    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    host.appendChild(wrap);
    var tip = document.createElement('div');
    tip.className = 'tip'; tip.setAttribute('aria-hidden', 'true');
    wrap.appendChild(tip);
    if (cfg.status) { var s = document.createElement('div'); s.className = 'st-chart-status'; s.textContent = cfg.status; host.appendChild(s); }

    var bars = cfg.bars;
    var n = bars.date.length;
    var from = Math.max(0, n - (cfg.window || 130));
    var svg;

    function draw() {
      if (svg) svg.remove();
      var W = Math.max(300, wrap.clientWidth || 600);
      var narrow = W < 560;
      var H = narrow ? 300 : 380;
      var volH = cfg.showVolume && bars.volume ? (narrow ? 50 : 64) : 0;
      var padL = 6, padR = narrow ? 58 : 70, padT = 10, padB = 22;
      var plotH = H - padT - padB - volH - (volH ? 8 : 0);
      svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.title || 'Kurschart mit Strategie-Overlays' });
      wrap.insertBefore(svg, tip);
      var cw = (W - padL - padR) / (n - from);
      var lo = Infinity, hi = -Infinity;
      for (var i = from; i < n; i++) {
        var h = cfg.mode === 'line' ? bars.close[i] : bars.high[i], l = cfg.mode === 'line' ? bars.close[i] : bars.low[i];
        if (isFinite(h)) hi = Math.max(hi, h); if (isFinite(l)) lo = Math.min(lo, l);
      }
      (cfg.levels || []).forEach(function (L) { if (state.on[L.id] && isFinite(L.value)) { hi = Math.max(hi, L.value); lo = Math.min(lo, L.value); } });
      if (state.on.__boxes) (cfg.boxes || []).forEach(function (b) { hi = Math.max(hi, b.top); lo = Math.min(lo, b.bottom); });
      var pad = (hi - lo) * 0.06 || 1; hi += pad; lo -= pad;
      var y = function (v) { return padT + (hi - v) / (hi - lo) * plotH; };
      var x = function (i) { return padL + (i - from + 0.5) * cw; };
      var idx = {}; for (var k = 0; k < n; k++) idx[bars.date[k]] = k;

      // Raster (zurückhaltend)
      var g = el('g', {}, svg);
      for (var t = 0; t <= 4; t++) {
        var v = lo + (hi - lo) * t / 4, yy = y(v);
        el('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, stroke: 'rgba(255,255,255,.06)' }, g);
        var tx = el('text', { x: W - padR + 6, y: yy + 4, fill: '#8a8fa0', 'font-size': 11 }, g); tx.textContent = fmt(v);
      }
      // Datumsachse
      var step = Math.max(1, Math.round((n - from) / (narrow ? 4 : 7)));
      for (var d = from; d < n; d += step) {
        var dt = el('text', { x: x(d), y: H - 6, fill: '#8a8fa0', 'font-size': 10.5, 'text-anchor': 'middle' }, g);
        var p = bars.date[d].split('-'); dt.textContent = p[2] + '.' + p[1] + (cfg.mode === 'line' ? '.' + p[0].slice(2) : '');
      }
      // Boxen
      if (state.on.__boxes) (cfg.boxes || []).forEach(function (b) {
        var i0 = idx[b.from] !== undefined ? Math.max(idx[b.from], from) : from, i1 = b.to && idx[b.to] !== undefined ? idx[b.to] : n - 1;
        if (i1 < from) return;
        el('rect', { x: x(i0) - cw / 2, y: y(b.top), width: Math.max(2, (i1 - i0 + 1) * cw), height: Math.max(1, y(b.bottom) - y(b.top)), fill: b.color || '#ff7a1a', 'fill-opacity': 0.12, stroke: b.color || '#ff7a1a', 'stroke-opacity': 0.7, 'stroke-width': 1.5, rx: 4 }, svg);
      });
      // Volumen
      if (volH) {
        var vmax = 0; for (var q = from; q < n; q++) if (isFinite(bars.volume[q])) vmax = Math.max(vmax, bars.volume[q]);
        var vy0 = H - padB;
        for (var q2 = from; q2 < n; q2++) {
          var vh = vmax ? bars.volume[q2] / vmax * volH : 0;
          el('rect', { x: x(q2) - Math.max(1, cw * 0.35), y: vy0 - vh, width: Math.max(1, cw * 0.7), height: Math.max(0, vh), fill: 'rgba(185,189,202,.28)' }, svg);
        }
      }
      // Kurs
      if (cfg.mode === 'line') {
        var dpath = '';
        for (var a = from; a < n; a++) if (isFinite(bars.close[a])) dpath += (dpath ? 'L' : 'M') + x(a).toFixed(1) + ' ' + y(bars.close[a]).toFixed(1);
        el('path', { d: dpath, fill: 'none', stroke: '#e5e7eb', 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
      } else {
        var bw = Math.max(1, Math.min(9, cw * 0.62));
        for (var c = from; c < n; c++) {
          var o = bars.open[c], cl = bars.close[c], up = cl >= o, col = up ? 'var(--candle-up)' : 'var(--candle-down)';
          el('line', { x1: x(c), x2: x(c), y1: y(bars.high[c]), y2: y(bars.low[c]), stroke: col, 'stroke-width': 1 }, svg);
          el('rect', { x: x(c) - bw / 2, y: y(Math.max(o, cl)), width: bw, height: Math.max(1, Math.abs(y(o) - y(cl))), fill: up ? 'var(--st-bg-2)' : col, stroke: col, 'stroke-width': 1 }, svg);
        }
      }
      // Overlays (Linien)
      (cfg.overlays || []).forEach(function (O) {
        if (!state.on[O.id]) return;
        var dd = '';
        for (var m = from; m < n; m++) { var vv = O.values[m]; if (isFinite(vv) && vv !== null) dd += (dd ? 'L' : 'M') + x(m).toFixed(1) + ' ' + y(vv).toFixed(1); else if (dd && dd.slice(-1) !== 'M') dd += ''; }
        if (dd) el('path', { d: dd, fill: 'none', stroke: O.color, 'stroke-width': 2, 'stroke-linejoin': 'round', opacity: 0.95 }, svg);
      });
      // Levels: Linie an der echten Hoehe, Preisschild bei Kollision verschoben
      // (Abstand >= 20 px), damit nahe Schwellen (z. B. Trigger und Stop) lesbar bleiben.
      var tags = [];
      (cfg.levels || []).forEach(function (L) {
        if (!state.on[L.id] || !isFinite(L.value)) return;
        var ly = y(L.value);
        el('line', { x1: padL, x2: W - padR, y1: ly, y2: ly, stroke: L.color, 'stroke-width': 1.5, 'stroke-dasharray': L.dash || '6 4' }, svg);
        tags.push({ L: L, y: ly });
      });
      tags.sort(function (a, b) { return a.y - b.y; });
      for (var ti = 1; ti < tags.length; ti++) if (tags[ti].y - tags[ti - 1].y < 20) tags[ti].y = tags[ti - 1].y + 20;
      tags.forEach(function (T) {
        var tagW = padR - 4;
        el('rect', { x: W - padR + 2, y: T.y - 9, width: tagW, height: 18, rx: 5, fill: T.L.color }, svg);
        var tt = el('text', { x: W - padR + 2 + tagW / 2, y: T.y + 4, fill: '#000', 'font-size': 10.5, 'font-weight': 700, 'text-anchor': 'middle' }, svg);
        tt.textContent = fmt(T.L.value);
      });
      // Marker
      if (state.on.__markers) (cfg.markers || []).forEach(function (M) {
        var mi = idx[M.date]; if (mi === undefined || mi < from) return;
        var my = y(M.price), mx = x(mi), entry = M.kind === 'entry';
        if (M.kind === 'confirm') { el('circle', { cx: mx, cy: my, r: 5, fill: 'none', stroke: '#fde047', 'stroke-width': 2 }, svg); return; }
        var path = entry ? 'M' + mx + ' ' + (my + 3) + 'l-6 10h12z' : 'M' + mx + ' ' + (my - 3) + 'l-6 -10h12z';
        el('path', { d: path, fill: entry ? '#4ade80' : (M.kind === 'partial' ? '#fde047' : '#f472b6'), stroke: '#07080c', 'stroke-width': 2 }, svg);
      });
      // Crosshair
      var cross = el('line', { y1: padT, y2: H - padB, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1, visibility: 'hidden' }, svg);
      var hit = el('rect', { x: padL, y: padT, width: W - padL - padR, height: H - padT - padB, fill: 'transparent' }, svg);
      function move(ev) {
        var r = svg.getBoundingClientRect();
        var px = (ev.clientX - r.left) * (W / r.width);
        var i = Math.max(from, Math.min(n - 1, Math.floor((px - padL) / cw) + from));
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
        var html = '<b>' + fmtDate(bars.date[i]) + '</b>';
        if (cfg.mode === 'line') html += 'Schluss ' + fmt(bars.close[i]);
        else html += 'Eröffnung ' + fmt(bars.open[i]) + '<br>Hoch ' + fmt(bars.high[i]) + '<br>Tief ' + fmt(bars.low[i]) + '<br>Schluss ' + fmt(bars.close[i]);
        if (volH && bars.volume) html += '<br>Volumen ' + fmtVol(bars.volume[i]);
        (cfg.overlays || []).forEach(function (O) { if (state.on[O.id] && isFinite(O.values[i]) && O.values[i] !== null) html += '<br><span style="color:' + O.color + '">■</span> ' + O.label + ' ' + fmt(O.values[i]); });
        tip.innerHTML = html;
        tip.classList.add('on');
        var left = (x(i) / W) * r.width;
        var tw = tip.offsetWidth || 160;
        tip.style.left = (left + 12 + tw > r.width ? left - tw - 12 : left + 12) + 'px';
        tip.style.top = '8px';
      }
      function leave() { cross.setAttribute('visibility', 'hidden'); tip.classList.remove('on'); }
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerdown', move);
      hit.addEventListener('pointerleave', leave);
    }
    draw();
    var rt; var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(draw, 80); }) : null;
    if (ro) ro.observe(wrap);
    return { redraw: draw };
  }

  global.STChart = { loadBars: loadBars, loadWeekly: loadWeekly, render: render, sma: sma, fmt: fmt, fmtDate: fmtDate };
})(window);
