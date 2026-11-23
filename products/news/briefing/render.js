/* =========================================================================
   MARKTBRIEFING – DARSTELLUNG

   Jede Karte ist ein eigenständiges SVG (viewBox 1080×1350, Instagram 4:5):
   dieselbe Datei skaliert scharf auf der Seite und wird für Karussell und
   Video als PNG exportiert (export-png.mjs). Kein JavaScript im Browser nötig.
   Marke: #08080a, #f4f5f1, Lime #c8f531, Inter (docs/studio/README.md).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var W = 1080, H = 1350, PAD = 72, IN = W - 2 * PAD;
  var C = { bg: "#08080a", fg: "#f4f5f1", mut: "#8b8d86", dim: "#5b5d57", lime: "#c8f531", line: "#25262a", card: "#111114", soft: "#c9cbc4" };
  var TYPE_TAG = { MARKET: null, OWN: "Eigene Auswertung", THIRD: "Angabe Dritter", AGENDA: "Termine" };
  /* Linien-Icons (24er Raster, Strich): Ausblick-Arten und Szenen der Website (www.js nutzt dieselben). */
  var ICONS = {
    zahlen: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 17v-3M12 17v-7M15 17v-5"/>',
    daten: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    notenbank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    dividende: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2.1 0 2.8 6 1.4 6 4.3 0 1.2-1.3 2.1-3 2.1-1.4 0-2.6-.6-3-1.6M12 5.5v2.5M12 16v2.5"/>',
    markt: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    news: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h6"/>',
    down: '<path d="M3 7l6 6 4-4 8 8"/><path d="M21 11v6h-6"/>',
    up: '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 13V7h-6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    heavy: '<rect x="4" y="10" width="4" height="10" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><rect x="16" y="13" width="4" height="7" rx="1"/>',
    scale: '<path d="M12 4v16M5 8h14M7 8l-3 7h6zM17 8l-3 7h6z"/>',
    dots: '<circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    rate: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    movers: '<path d="M7 20V5M3 9l4-4 4 4M17 4v15M13 15l4 4 4-4"/>',
    gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>',
    bank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'
  };
  function icon(name, x, y, size, col) {
    return '<g transform="translate(' + x + " " + y + ") scale(" + (size / 24) + ')" fill="none" stroke="' + col + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</g>";
  }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function num(x, d) { return Math.abs(x).toFixed(d == null ? 1 : d).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function sign(x) { return x > 0 ? "+" : x < 0 ? "−" : ""; }
  function pct(x, d) { return sign(x) + num(x, d) + " %"; }
  function fmt(v, unit, d) { if (unit === "x") return num(v, 1) + "×"; return unit === "bp" ? sign(v) + num(v, 0) + " bp" : unit === "%" ? pct(v, d) : num(v, d == null ? 0 : d) + (unit || ""); }
  function tone(v) { return v > 0 ? C.lime : C.fg; }  /* Hausregel: Plus neongrün, Minus in der Schriftfarbe, kein Rot */
  function deDate(iso) { return iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4); }

  /* Zeilenumbruch nach geschätzter Laufweite (Inter). */
  function wrap(text, maxW, size, bold) {
    var cw = size * (bold ? 0.56 : 0.52), words = String(text || "").split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (t.length * cw > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  function textBlock(x, y, text, o) {
    var lines = wrap(text, o.w || IN, o.size, o.bold), lh = o.lh || o.size * 1.18;
    var svg = lines.map(function (l, i) {
      return '<text x="' + x + '" y="' + (y + i * lh) + '" font-size="' + o.size + '" font-weight="' + (o.weight || (o.bold ? 800 : 400)) + '" fill="' + (o.fill || C.fg) + '"' + (o.ls ? ' letter-spacing="' + o.ls + '"' : "") + '>' + esc(l) + "</text>";
    }).join("");
    return { svg: svg, h: lines.length * lh };
  }

  function frame(card, i, n, session) {
    var s = '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>';
    s += '<text x="' + PAD + '" y="96" font-size="24" font-weight="700" letter-spacing="3" fill="' + C.lime + '">VISION UNIVERSE <tspan fill="' + C.mut + '" font-weight="600">· MARKTBRIEFING</tspan></text>';
    s += '<text x="' + (W - PAD) + '" y="96" font-size="24" font-weight="600" letter-spacing="3" fill="' + C.mut + '" text-anchor="end">' + esc(deDate(session)) + " · " + (i + 1) + "/" + n + "</text>";
    s += '<line x1="' + PAD + '" x2="' + (W - PAD) + '" y1="' + (H - 78) + '" y2="' + (H - 78) + '" stroke="' + C.line + '"/>';
    s += '<text x="' + PAD + '" y="' + (H - 40) + '" font-size="19" font-weight="700" fill="' + C.fg + '">Vision Universe <tspan fill="' + C.mut + '" font-weight="500">· Marktbriefing</tspan></text>';
    s += '<text x="' + (W - PAD) + '" y="' + (H - 40) + '" font-size="19" font-weight="700" fill="' + C.lime + '" text-anchor="end">www.visionuniverse.de</text>';
    return s;
  }

  function header(card) {
    var y = 180, s = "";
    var kick = String(card.kicker || "").toUpperCase();
    s += '<text x="' + PAD + '" y="' + y + '" font-size="26" font-weight="800" letter-spacing="3" fill="' + C.lime + '">' + esc(kick) + "</text>";
    var tag = card.type === "THIRD" && card.publisher ? "Angabe Dritter · " + card.publisher : TYPE_TAG[card.type];
    if (tag) {
      var x = PAD + kick.length * 26 * 0.8 + 24, w = tag.length * 19 * 0.55 + 32;
      var own = card.type === "OWN";
      s += '<rect x="' + x + '" y="' + (y - 26) + '" width="' + w + '" height="34" rx="17" fill="none" stroke="' + (own ? C.lime : C.line) + '"/>';
      s += '<text x="' + (x + w / 2) + '" y="' + (y - 3) + '" font-size="19" font-weight="600" fill="' + (own ? C.lime : C.mut) + '" text-anchor="middle">' + esc(tag) + "</text>";
    }
    y += 28;
    var big = !card.sub && String(card.title).length < 34;
    var t = textBlock(PAD, y + (big ? 76 : 64), card.title, { size: big ? 84 : 64, bold: true, lh: big ? 88 : 68 });
    s += t.svg; y += (big ? 76 : 64) + t.h - (big ? 88 : 68) + 20;
    if (card.sub) { var sb = textBlock(PAD, y + 40, card.sub, { size: 30, fill: C.soft, lh: 40, w: 920 }); s += sb.svg; y += 40 + sb.h - 40 + 16; }
    return { svg: s, y: y + 24 };
  }

  function statBoxes(stats, y, h) {
    var n = stats.length, gap = 20, bw = (IN - gap * (n - 1)) / n, s = "";
    stats.forEach(function (st, i) {
      var x = PAD + i * (bw + gap);
      s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="22" fill="' + C.card + '" stroke="' + C.line + '"/>';
      s += '<text x="' + (x + 26) + '" y="' + (y + 44) + '" font-size="22" font-weight="600" fill="' + C.mut + '">' + esc(st.label) + "</text>";
      var val = st.text != null ? st.text : st.plain ? num(st.value, 0) + (st.unit || "") : fmt(st.value, st.unit, n >= 3 ? 1 : 1);
      var size = st.text != null ? 34 : n >= 3 ? 58 : 62;
      if (st.text != null) { var tb = textBlock(x + 26, y + 96, val, { size: size, bold: true, w: bw - 52, lh: 40 }); s += tb.svg; }
      else s += '<text x="' + (x + 26) + '" y="' + (y + 112) + '" font-size="' + size + '" font-weight="800" fill="' + (st.plain ? C.fg : tone(st.value)) + '">' + esc(val) + "</text>";
      if (st.sub) { var sb = textBlock(x + 26, y + h - 28 - (wrap(st.sub, bw - 52, 19).length - 1) * 23, st.sub, { size: 19, fill: C.mut, w: bw - 52, lh: 23 }); s += sb.svg; }
    });
    return s;
  }

  function barRows(rows, y, o) {
    var rh = o.rowH || 80, s = "", max = o.max || Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); })) || 1;
    var bx = PAD + 300, bw = IN - 300 - 170;
    rows.forEach(function (r, i) {
      var yy = y + i * rh, w = Math.min(1, Math.abs(r.value) / max) * bw;
      s += '<text x="' + PAD + '" y="' + (yy + 34) + '" font-size="30" font-weight="700" fill="' + C.fg + '">' + esc(r.label) + "</text>";
      if (r.sub) s += '<text x="' + PAD + '" y="' + (yy + 60) + '" font-size="19" fill="' + C.mut + '">' + esc(String(r.sub).slice(0, 34)) + "</text>";
      var col = o.neutral ? C.mut : tone(r.value);
      s += '<rect x="' + (bx + bw - w) + '" y="' + (yy + 20) + '" width="' + Math.max(w, 2) + '" height="32" rx="6" fill="' + col + '"/>';
      s += '<text x="' + (W - PAD) + '" y="' + (yy + 48) + '" font-size="36" font-weight="800" fill="' + (o.neutral ? C.fg : tone(r.value)) + '" text-anchor="end">' + esc(fmt(r.value, o.unit)) + "</text>";
      s += '<line x1="' + PAD + '" x2="' + (W - PAD) + '" y1="' + (yy + rh - 4) + '" y2="' + (yy + rh - 4) + '" stroke="' + C.line + '"/>';
    });
    return { svg: s, h: rows.length * rh };
  }

  function lineChart(points, x, y, w, h, o) {
    var vals = points.map(function (p) { return p[1]; });
    var lo = o.y0 != null ? o.y0 : Math.floor(Math.min.apply(null, vals)), hi = o.y1 != null ? o.y1 : Math.ceil(Math.max.apply(null, vals));
    if (hi === lo) hi = lo + 1;
    var xs = function (i) { return x + i / Math.max(1, points.length - 1) * w; }, ys = function (v) { return y + h - (v - lo) / (hi - lo) * h; };
    var s = "", steps = (hi - lo) <= 8 && (hi - lo) === Math.round(hi - lo) ? (hi - lo) : 4;
    for (var k = 0; k <= steps; k++) { var v = lo + (hi - lo) * k / steps; s += '<line x1="' + x + '" x2="' + (x + w) + '" y1="' + ys(v) + '" y2="' + ys(v) + '" stroke="' + C.line + '"/><text x="' + (x + w + 12) + '" y="' + (ys(v) + 7) + '" font-size="20" fill="' + C.mut + '">' + esc(o.yfmt(v)) + "</text>"; }
    if (lo < 0 && hi > 0) s += '<line x1="' + x + '" x2="' + (x + w) + '" y1="' + ys(0) + '" y2="' + ys(0) + '" stroke="' + C.mut + '" stroke-dasharray="6 6"/>';
    var d = points.map(function (p, i) { return (i ? "L" : "M") + xs(i).toFixed(1) + "," + ys(p[1]).toFixed(1); }).join("");
    s += '<path d="' + d + "L" + (x + w) + "," + (y + h) + "L" + x + "," + (y + h) + 'Z" fill="' + o.col + '" opacity=".12"/>';
    s += '<path d="' + d + '" fill="none" stroke="' + o.col + '" stroke-width="5" stroke-linejoin="round"/>';
    (o.xl || []).forEach(function (t) { s += '<text x="' + xs(t[0]) + '" y="' + (y + h + 36) + '" font-size="20" fill="' + C.mut + '" text-anchor="middle">' + esc(t[1]) + "</text>"; });
    return s;
  }

  function columnChart(rows, y, h, o) {
    var n = rows.length, slot = IN / n, k = rows[0].values.length, s = "";
    var max = o.max || Math.max.apply(null, rows.map(function (r) { return Math.max.apply(null, r.values); })) * 1.1;
    var cols = o.colors || (k === 1 ? [C.dim] : [C.dim, C.lime]);
    rows.forEach(function (r, i) {
      var bw = (slot - 14) / k;
      r.values.forEach(function (v, j) {
        var bh = Math.max(2, v / max * h), x = PAD + i * slot + j * bw, col = r.highlight ? C.lime : cols[j];
        s += '<rect x="' + x + '" y="' + (y + h - bh) + '" width="' + (bw - 6) + '" height="' + bh + '" rx="5" fill="' + col + '"/>';
        s += '<text x="' + (x + (bw - 6) / 2) + '" y="' + (y + h - bh - 12) + '" font-size="' + (n > 8 ? 18 : 21) + '" font-weight="700" fill="' + C.fg + '" text-anchor="middle">' + esc(num(v, v % 1 ? 1 : 0) + (o.unit === "%" ? "%" : "")) + "</text>";
      });
      s += '<text x="' + (PAD + i * slot + (slot - 14) / 2) + '" y="' + (y + h + 34) + '" font-size="20" fill="' + C.mut + '" text-anchor="middle">' + esc(r.label) + "</text>";
    });
    s += '<line x1="' + PAD + '" x2="' + (W - PAD) + '" y1="' + (y + h) + '" y2="' + (y + h) + '" stroke="' + C.line + '"/>';
    if (o.legend) o.legend.forEach(function (l, j) { s += '<rect x="' + (PAD + j * 260) + '" y="' + (y + h + 62) + '" width="16" height="16" rx="4" fill="' + cols[j] + '"/><text x="' + (PAD + 26 + j * 260) + '" y="' + (y + h + 77) + '" font-size="21" fill="' + C.soft + '">' + esc(l) + "</text>"; });
    return s;
  }

  /* Einordnung: jede Phase eine Zeile, jeder Tag ein Punkt (keine überlappenden Säulen). */
  var MS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
  function timeline(tl, y, h) {
    var eps = tl.episodes || [], s = "", n = Math.max(1, eps.length), rh = Math.min(64, h / n), r = Math.min(13, rh * 0.32);
    eps.forEach(function (e, i) {
      var yy = y + i * rh + rh / 2, lab = MS[+e.from.slice(5, 7) - 1] + " " + e.from.slice(0, 4);
      s += '<text x="' + PAD + '" y="' + (yy + 9) + '" font-size="26" font-weight="800" fill="' + (e.current ? C.lime : C.fg) + '">' + esc(lab) + "</text>";
      e.days.forEach(function (d, k) { s += '<circle cx="' + (PAD + 200 + r + k * (r * 2 + 10)) + '" cy="' + yy + '" r="' + r + '" fill="' + (e.current ? C.lime : C.fg) + '"/>'; });
      s += '<text x="' + (W - PAD) + '" y="' + (yy + 9) + '" font-size="26" font-weight="800" fill="' + (e.current ? C.lime : C.mut) + '" text-anchor="end">' + esc(pct(e.extreme, 1)) + "</text>";
      s += '<line x1="' + PAD + '" x2="' + (W - PAD) + '" y1="' + (y + (i + 1) * rh) + '" y2="' + (y + (i + 1) * rh) + '" stroke="' + C.line + '"/>';
    });
    return s;
  }

  function body(card, y) {
    var s = "", bottom = H - 110;
    if (card.id === "overview") {
      s += statBoxes(card.stats, y + 10, 230); y += 290;
      if (card.chart) {
        s += '<text x="' + PAD + '" y="' + (y + 10) + '" font-size="24" fill="' + C.mut + '">' + esc(card.chart.label) + "</text>";
        var pts = card.chart.points, vals = pts.map(function (p) { return p[1]; });
        var lo = Math.floor(Math.min.apply(null, vals.concat([0]))), hi = Math.ceil(Math.max.apply(null, vals.concat([0])));
        var xl = []; pts.forEach(function (p, i) { var t = new Date(p[0]); if (t.getUTCMinutes() === 30) xl.push([i, t.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })]); });
        s += lineChart(pts, PAD, y + 40, 860, bottom - y - 100, { y0: lo, y1: hi, col: vals[vals.length - 1] < 0 ? C.fg : C.lime, yfmt: function (v) { return sign(v) + num(v, 0) + " %"; }, xl: xl.filter(function (_, k) { return k % 1 === 0; }) });
      }
    } else if (card.bars && card.bars2) {
      var a = barRows(card.bars.rows, y, { unit: card.bars.unit, neutral: card.bars.neutral, rowH: 76 }); s += a.svg; y += a.h + 16;
      s += barRows(card.bars2.rows, y, { unit: card.bars2.unit, rowH: 76 }).svg;
    } else if (card.bars) {
      s += barRows(card.bars.rows, y, { unit: card.bars.unit, neutral: card.bars.neutral }).svg;
    } else if (card.groups) {
      card.groups.forEach(function (g, gi) {
        s += '<text x="' + PAD + '" y="' + (y + 10) + '" font-size="24" font-weight="700" fill="' + (gi ? C.fg : C.lime) + '">' + esc(g.label) + "</text>";
        var r = barRows(g.rows, y + 24, { unit: "%", max: 20, rowH: 76 }); s += r.svg; y += r.h + 54;
      });
    } else if (card.timeline) {
      s += timeline(card.timeline, y + 20, bottom - y - 330); y = bottom - 250;
      s += statBoxes(card.stats, y, 200);
    } else if (card.pairs) {
      var gap = 20, bw = (IN - gap) / 2;
      card.pairs.forEach(function (p, i) {
        var x = PAD + i * (bw + gap);
        s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="200" rx="22" fill="' + C.card + '" stroke="' + C.line + '"/>';
        s += '<text x="' + (x + 26) + '" y="' + (y + 44) + '" font-size="22" font-weight="600" fill="' + C.mut + '">' + esc(p.label) + "</text>";
        s += '<text x="' + (x + 26) + '" y="' + (y + 116) + '" font-size="58" font-weight="800"><tspan fill="' + C.lime + '">' + num(p.a, 0) + '</tspan><tspan fill="' + C.dim + '"> / </tspan><tspan fill="' + C.fg + '">' + num(p.b, 0) + "</tspan></text>";
        s += textBlock(x + 26, y + 160, p.sub, { size: 19, fill: C.mut, w: bw - 52, lh: 23 }).svg;
      });
      y += 260;
      s += '<text x="' + PAD + '" y="' + y + '" font-size="24" fill="' + C.mut + '">' + esc(card.line.label) + "</text>";
      var lp = card.line.points;
      s += lineChart(lp, PAD, y + 30, 860, bottom - y - 90, { col: C.lime, yfmt: function (v) { return num(v, 0) + " %"; },
        xl: [[0, lp[0][0].slice(8, 10) + "." + lp[0][0].slice(5, 7) + "."], [lp.length - 1, lp[lp.length - 1][0].slice(8, 10) + "." + lp[lp.length - 1][0].slice(5, 7) + ".: " + num(lp[lp.length - 1][1], 1) + " %"]] });
    } else if (card.columns) {
      var ch = card.stats ? bottom - y - 330 : bottom - y - 150;
      s += columnChart(card.columns.rows, y + 40, ch, { unit: card.columns.unit, legend: card.columns.legend });
      if (card.stats) s += statBoxes(card.stats, bottom - 210, 180);
    } else if (card.textStats) {
      var half = Math.ceil(card.textStats.length / 2);
      s += statBoxes(card.textStats.slice(0, half), y + 10, 220);
      if (card.textStats.length > half) s += statBoxes(card.textStats.slice(half), y + 250, 220);
      if (card.note) s += textBlock(PAD, y + 540, card.note, { size: 26, fill: C.soft, lh: 36 }).svg;
    }
    if (card.agenda) {
      var WS = { Montag: "MO", Dienstag: "DI", Mittwoch: "MI", Donnerstag: "DO", Freitag: "FR" };
      var LW = IN - 240, days = card.agenda.days.map(function (d) {
        var its = d.items.map(function (x) { var l = wrap(x.label, LW, 30, true).slice(0, 2); return { x: x, lines: l, h: 34 + l.length * 36 + (x.sub ? 30 : 0) + 18 }; });
        return { d: d, its: its, h: Math.max(118, its.reduce(function (a, t) { return a + t.h; }, 0)) };
      });
      var need = days.reduce(function (a, d) { return a + d.h + 18; }, 0), avail = bottom - y - 10, k = Math.min(1, avail / need), yy = y + 6;
      s += '<g transform="translate(0 ' + yy + ')">';
      var off = 0;
      days.forEach(function (D) {
        var dh = D.h * k, d = D.d;
        s += '<rect x="' + PAD + '" y="' + off + '" width="128" height="' + (dh - 6) + '" rx="22" fill="' + C.lime + '"/>';
        s += '<text x="' + (PAD + 64) + '" y="' + (off + 52) + '" font-size="34" font-weight="900" fill="' + C.bg + '" text-anchor="middle">' + (WS[d.weekday] || d.weekday.slice(0, 2).toUpperCase()) + "</text>";
        s += '<text x="' + (PAD + 64) + '" y="' + (off + 84) + '" font-size="22" font-weight="700" fill="' + C.bg + '" text-anchor="middle">' + d.date.slice(8, 10) + "." + d.date.slice(5, 7) + ".</text>";
        var iy = off;
        D.its.forEach(function (t) {
          var x = t.x, ix = PAD + 152;
          s += '<circle cx="' + (ix + 30) + '" cy="' + (iy + 36) + '" r="30" fill="' + C.card + '" stroke="' + C.line + '"/>' + icon(x.kind, ix + 14, iy + 20, 32, x.kind === "dividende" ? C.lime : C.fg);
          s += '<text x="' + (ix + 80) + '" y="' + (iy + 22) + '" font-size="19" font-weight="700" letter-spacing="2" fill="' + C.mut + '">' + esc(x.kindLabel.toUpperCase() + (x.time ? " · " + x.time : "")) + "</text>";
          t.lines.forEach(function (l, j) { s += '<text x="' + (ix + 80) + '" y="' + (iy + 58 + j * 36) + '" font-size="30" font-weight="800" fill="' + C.fg + '">' + esc(l) + "</text>"; });
          if (x.sub) s += '<text x="' + (ix + 80) + '" y="' + (iy + 58 + t.lines.length * 36 - 4) + '" font-size="22" fill="' + C.soft + '">' + esc(x.sub) + "</text>";
          iy += t.h * k;
        });
        off += dh + 18 * k;
      });
      s += "</g>";
    }
    if (card.quote) {
      var bare = !card.bars && !card.columns && !card.groups && !card.pairs && !card.timeline && !card.textStats && card.id !== "overview";
      if (bare) {
        var qb = textBlock(PAD + 40, y + 120, "„" + card.quote + "“", { size: 44, bold: true, lh: 58, w: IN - 60 });
        s += '<rect x="' + PAD + '" y="' + (y + 72) + '" width="8" height="' + (qb.h + 20) + '" rx="4" fill="' + C.lime + '"/>' + qb.svg;
      } else s += textBlock(PAD + 30, bottom - 120, card.quote, { size: 26, lh: 36, w: IN - 60 }).svg;
    }
    return s;
  }

  function cardSvg(card, i, n, session) {
    var h = header(card);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" font-family="Inter, system-ui, sans-serif" role="img" aria-label="' + esc(card.title) + '">' +
      frame(card, i, n, session) + h.svg + body(card, h.y) + "</svg>";
  }

  var LEGAL_TEXT = "Redaktionelle Einordnung, keine Anlageberatung und keine Kauf- oder Verkaufsempfehlung.";

  function page(b, o) {
    o = o || {};
    var n = b.cards.length;
    var cards = b.cards.map(function (c, i) {
      return '<figure class="mb-card" id="karte-' + (i + 1) + '">' + cardSvg(c, i, n, b.session) +
        "</figure>";
    }).join("\n");
    var arch = (o.archive || []).slice(0, 20).map(function (d) { return '<a href="/news/marktbriefing/' + d + '/"' + (d === b.session ? ' aria-current="page"' : "") + ">" + deDate(d) + "</a>"; }).join(" ");
    return '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
      '<meta name="robots" content="noindex,follow">\n<title>Marktbriefing ' + deDate(b.session) + ' · Vision Universe</title>\n' +
      '<meta name="description" content="' + esc(b.cards[0] ? b.cards[0].title : "Marktbriefing") + ' – das Marktbriefing von Vision Universe zum US-Handelstag ' + deDate(b.session) + '.">\n' +
      '<link rel="canonical" href="https://research.visionuniverse.de' + esc(o.canonical || "/news/marktbriefing/") + '">\n' +
      '<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="stylesheet" href="/assets/site-navigation.css">\n' +
      "<style>@font-face{font-family:Inter;src:url(/assets/fonts/inter-latin.woff2) format(\"woff2\");font-weight:100 900;font-display:swap}" +
      "body{margin:0;background:#08080a;color:#f4f5f1;font-family:Inter,system-ui,sans-serif}.mb{max-width:720px;margin:0 auto;padding:24px 16px 64px}" +
      ".mb h1{font-size:28px;letter-spacing:-.02em;margin:8px 0 4px}.mb p{color:#c9cbc4;line-height:1.5}.mb-card{margin:0 0 28px}.mb-card svg{width:100%;height:auto;display:block;border-radius:18px}" +
      ".mb-card figcaption{font-size:13px;color:#8b8d86;margin-top:8px;line-height:1.4}.mb a{color:#c8f531}.mb-arch{display:flex;flex-wrap:wrap;gap:8px;font-size:14px}" +
      ".mb-arch a{padding:4px 10px;border:1px solid #25262a;border-radius:999px;text-decoration:none}.mb-arch a[aria-current]{border-color:#c8f531}.mb-legal{font-size:13px;color:#8b8d86;border-top:1px solid #25262a;padding-top:16px}</style>\n" +
      '</head>\n<body data-view="news"><vu-navigation></vu-navigation><script src="/assets/site-navigation.js"><\/script>\n<main class="mb">\n' +
      '<p style="margin:0;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#c8f531;font-weight:700">Marktbriefing</p>\n' +
      "<h1>US-Handelstag " + deDate(b.session) + "</h1>\n" +
      "<p>" + n + " Karten: " + b.counts.MARKET + " Marktdaten, " + b.counts.OWN + " eigene Auswertungen, " + b.counts.THIRD + " Angaben Dritter. Indizes über ETF-Proxies.</p>\n" +
      cards + "\n" +
      (arch ? '<h2 style="font-size:18px">Frühere Ausgaben</h2><nav class="mb-arch">' + arch + "</nav>\n" : "") +
      '<details class="mb-legal"><summary>Quellen und Hinweise</summary><ul>' + b.cards.map(function (c) { return "<li>" + esc(c.title) + ": " + esc(c.source) + (c.url ? ' · <a href="' + esc(c.url) + '" rel="noopener">Quelle</a>' : "") + "</li>"; }).join("") + "</ul></details>\n" +
      '<p class="mb-legal">' + esc(LEGAL_TEXT) + " " + esc(b.notes.forecast) + ' <a href="https://konto.visionuniverse.de/rechtliches/methodik">Methodik, Quellen und Interessen</a>.</p>\n' +
      "</main>\n</body>\n</html>\n";
  }

  var api = { W: W, H: H, cardSvg: cardSvg, page: page, wrap: wrap, ICONS: ICONS };
  if (isNode) module.exports = api;
  else global.VUMarketBriefingRender = api;
})(typeof window !== "undefined" ? window : globalThis);
