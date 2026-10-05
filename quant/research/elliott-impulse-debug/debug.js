/* Elliott · Impuls-Debug (INTERN · Forschung · keine Produktaussage).
   Lädt ./impulse-debug-data.json (erzeugt von scripts/technical/elliott-forensics/debug-view-data.mjs) und zeigt je Fall
   Schlusskurse, VU-Hauptzählung, beste Impulslesart, Rangabstand je Komponente, Unterteilungen und Forensik-Zähler.
   Kein Build, keine externen Ressourcen, Diagramme als Inline-SVG. */
(function () {
  "use strict";

  var DATA_URL = "./impulse-debug-data.json";

  /* Wellenbeschriftung je Mustertyp; Index 0 ist der Ursprung ("0"). */
  var WAVE_LABELS = {
    IMPULSE: ["0", "1", "2", "3", "4", "5"],
    LEADING_DIAGONAL: ["0", "1", "2", "3", "4", "5"],
    ENDING_DIAGONAL: ["0", "1", "2", "3", "4", "5"],
    ZIGZAG: ["0", "A", "B", "C"],
    FLAT: ["0", "A", "B", "C"],
    TRIANGLE: ["0", "A", "B", "C", "D", "E"],
    WXY: ["0", "W", "X", "Y"],
    DOUBLE_ZIGZAG: ["0", "W·a", "W·b", "W·c", "X", "Y·a", "Y·b", "Y·c"],
    TRIPLE_ZIGZAG: ["0", "W", "X", "Y", "X₂", "Z"],
    WXYXZ: ["0", "W", "X", "Y", "X₂", "Z"]
  };

  var COMPONENT_LABEL = {
    subdivision: "Unterteilung", coverage: "Vollständigkeit", dominance: "Dominanz des Ursprungs", anchor: "Signifikanz des Ursprungs",
    guidelines: "EWP-Richtlinien", prior: "Musterprior", tail: "Restbewegung", separation: "Gradtrennung"
  };

  var STATE_LABEL = { DEVELOPING: "laufende", CONFIRMED_COMPLETE: "abgeschlossene", COMPLETE: "abgeschlossene", UNKNOWN: "Status unklar," };

  var DATA = null, SEL = null;
  var VIEW = { alts: false, log: false };

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtNum(v, d) { if (v == null || !isFinite(v)) return "–"; var a = Math.abs(v); var dd = d != null ? d : a >= 1000 ? 0 : a >= 10 ? 2 : 3; return Number(v).toLocaleString("de-DE", { minimumFractionDigits: dd, maximumFractionDigits: dd }); }
  function signed(v) { return (v > 0 ? "+" : "") + fmtNum(v, 3); }

  /* ------------------------------------------------------------ Beschriftung */
  function labelsFor(cand) {
    var set = WAVE_LABELS[cand.type] || null, n = (cand.points || []).length;
    if (!set) { var g = ["0"]; for (var k = 1; k < Math.max(n, 2); k++) g.push(String(k)); set = g; }
    /* Punkte vor dem Fenster sind bereits entfernt (i<0) — daher vom Ende her ausrichten. */
    var last;
    if (cand.complete) last = set.length - 1;
    else { last = cand.currentLabel != null ? set.indexOf(String(cand.currentLabel)) : -1; if (last < 0) last = Math.min(n, set.length) - 1; }
    var out = [];
    for (var j = 0; j < n; j++) { var idx = last - (n - 1 - j); out.push(idx >= 0 && idx < set.length ? set[idx] : "?"); }
    return out;
  }

  /* Wellenbezeichnung der k-ten Unterteilung (k=0 → erste Welle). */
  function subLabel(type, k) { var s = WAVE_LABELS[type]; return s && s[k + 1] ? s[k + 1] : String(k + 1); }

  function practitionerText(p) {
    if (!p) return "Praktiker: –";
    var st = STATE_LABEL[p.state] || (p.state ? String(p.state).toLowerCase() : "");
    var s = "Praktiker: " + (p.pattern || "?");
    if (p.currentWave != null) s += ", " + (st ? st + " " : "") + "Welle " + p.currentWave;
    else if (p.state) s += ", " + p.state;
    if (p.direction) s += ", Richtung " + p.direction;
    return s;
  }

  /* ------------------------------------------------------------ Begründungssatz */
  function reasonSentence(c) {
    var imp = c.impulse;
    if (!imp) return "Unter den bewerteten Kandidaten gibt es keine Impulslesart.";
    if (imp.pos === 0) return "Die Impulslesart ist hier selbst die VU-Hauptzählung.";
    var gaps = sortedGaps(imp);
    var top = gaps[0];
    if (!top || top[1] <= 0) return "Kein Komponenten-Rangabstand ist positiv — die Impulslesart verliert über Gleichstand/Rangfolge (Position " + imp.pos + ").";
    var k = top[0], t;
    if (k === "subdivision") {
      var weak = [];
      (imp.subdivisions || []).forEach(function (s, i) { if (i % 2 === 0 && !isMotive(s.pattern)) weak.push(i + 1); });
      t = "Die Wellen 1/3/5 zerlegen sich auf den Schlusskursen nicht sichtbar in fünf Unterwellen" + (weak.length ? " (Welle " + weak.join(", ") + " wird als " + uniq((imp.subdivisions || []).filter(function (s, i) { return weak.indexOf(i + 1) >= 0; }).map(function (s) { return s.pattern || "?"; })).join("/") + " gelesen)" : "") + ".";
    } else if (k === "coverage") t = imp.complete ? "Die Impulszählung deckt die Bewegung bis zum Stichtag weniger vollständig ab als die VU-Hauptzählung." : "Eine laufende Zählung gilt als weniger vollständig als die abgeschlossene Korrektur" + (c.top && c.top[0] && !c.top[0].complete ? " bzw. die führende laufende Lesart" : "") + ".";
    else if (k === "dominance") t = "Der Ursprung ist im Umfeld weniger dominant: ein anderer Extrempunkt in der Nähe überragt den Startpunkt der Impulszählung.";
    else if (k === "anchor") t = "Der Ursprung der Impulszählung ist als Pivot weniger signifikant (kleinerer Ausschlag relativ zur Volatilität).";
    else if (k === "guidelines") t = "Die Impulszählung erfüllt die EWP-Richtlinien (Proportionen, Alternation, Kanal) schlechter.";
    else if (k === "prior") t = "Der Musterprior bevorzugt die Lesart der VU-Hauptzählung.";
    else if (k === "tail") t = "Nach dem letzten Wellenende bleibt eine größere, nicht erklärte Restbewegung.";
    else if (k === "separation") t = "Die Wellen der Impulszählung sind gradmäßig schlechter getrennt.";
    else t = "Größter Abstand bei Komponente „" + k + "“.";
    return "Hauptgrund (" + (COMPONENT_LABEL[k] || k) + ", " + signed(top[1]) + "): " + t;
  }
  function isMotive(p) { return p === "IMPULSE" || p === "LEADING_DIAGONAL" || p === "ENDING_DIAGONAL"; }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function sortedGaps(cand) { return Object.keys(cand.gapToTop || {}).map(function (k) { return [k, cand.gapToTop[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }

  /* ------------------------------------------------------------ Diagramm */
  function chartSvg(c, width) {
    var W = Math.max(320, Math.round(width)), H = W < 560 ? 300 : 380;
    var m = { l: 8, r: W < 560 ? 50 : 64, t: 18, b: 26 };
    var s = c.series || [], n = s.length;
    if (!n) return '<p class="note">Keine Kursreihe.</p>';
    var lo = Infinity, hi = -Infinity;
    s.forEach(function (r) { if (r[1] < lo) lo = r[1]; if (r[1] > hi) hi = r[1]; });
    var inv = c.practitioner && c.practitioner.invalidation && isFinite(c.practitioner.invalidation.price) ? +c.practitioner.invalidation.price : null;
    var range = hi - lo || hi || 1, invOut = null;
    if (inv != null) {
      if (inv >= lo - 0.5 * range && inv <= hi + 0.5 * range) { lo = Math.min(lo, inv); hi = Math.max(hi, inv); }
      else invOut = inv < lo ? "below" : "above";
    }
    var log = VIEW.log && lo > 0;
    var tf = function (v) { return log ? Math.log(v) : v; };
    var a = tf(lo), b = tf(hi), pad = (b - a) * 0.06 || 1; a -= pad; b += pad;
    var X = function (i) { return m.l + (n === 1 ? 0 : (i / (n - 1)) * (W - m.l - m.r)); };
    var Y = function (v) { return m.t + (1 - (tf(v) - a) / (b - a)) * (H - m.t - m.b); };
    var out = [];
    out.push('<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Schlusskurse mit VU-Hauptzählung und Impulslesart">');
    // Raster + Preisachse
    for (var g = 0; g <= 4; g++) {
      var vv = log ? Math.exp(a + (b - a) * g / 4) : a + (b - a) * g / 4, yy = Y(vv);
      out.push('<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="var(--grid)"/>');
      out.push('<text x="' + (W - m.r + 4) + '" y="' + (yy + 4).toFixed(1) + '" font-size="11" fill="var(--dim)">' + esc(fmtNum(vv, vv >= 1000 ? 0 : 2)) + "</text>");
    }
    // Datumsachse
    [0, Math.floor((n - 1) / 2), n - 1].forEach(function (i, k) {
      out.push('<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="11" fill="var(--dim)" text-anchor="' + (k === 0 ? "start" : k === 2 ? "end" : "middle") + '">' + esc(s[i][0]) + "</text>");
    });
    // Invalidierung
    if (inv != null) {
      var yi = invOut === "below" ? H - m.b : invOut === "above" ? m.t : Y(inv);
      out.push('<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yi.toFixed(1) + '" y2="' + yi.toFixed(1) + '" stroke="var(--red)" stroke-width="1.5" stroke-dasharray="6 4"/>');
      out.push('<text class="lbl" x="' + (m.l + 4) + '" y="' + (invOut === "above" ? yi + 13 : yi - 5).toFixed(1) + '" font-size="11" fill="var(--red)">Invalidierung Praktiker ' + esc(fmtNum(inv)) + (invOut ? " (außerhalb, " + (invOut === "below" ? "darunter" : "darüber") + ")" : "") + "</text>");
    }
    // Kurs
    var dpath = s.map(function (r, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(r[1]).toFixed(1); }).join("");
    out.push('<path d="' + dpath + '" fill="none" stroke="var(--price)" stroke-width="1.2" opacity=".85"/>');
    // Wellenstart Praktiker
    var ws = c.practitioner && c.practitioner.waveStart;
    if (ws && ws.date) {
      var wi = -1; for (var q = 0; q < n; q++) if (s[q][0] >= ws.date) { wi = q; break; }
      if (wi >= 0 && !(wi === 0 && s[0][0] > ws.date)) {
        var xw = X(wi);
        out.push('<line x1="' + xw.toFixed(1) + '" x2="' + xw.toFixed(1) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--amber)" stroke-dasharray="3 3"/>');
        if (ws.price != null && isFinite(ws.price) && isFinite(Y(+ws.price))) out.push('<circle cx="' + xw.toFixed(1) + '" cy="' + Y(+ws.price).toFixed(1) + '" r="5" fill="none" stroke="var(--amber)" stroke-width="2"/>');
        var rightSide = xw > (W - m.r) * 0.7;
        out.push('<text class="lbl" x="' + (rightSide ? xw - 4 : xw + 4).toFixed(1) + '" y="' + (m.t + 24) + '" font-size="11" fill="var(--amber)" text-anchor="' + (rightSide ? "end" : "start") + '">Wellenstart Praktiker</text>');
      }
    }
    // Stichtag
    var xc = X(n - 1);
    out.push('<line x1="' + xc.toFixed(1) + '" x2="' + xc.toFixed(1) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--muted)" stroke-dasharray="2 3"/>');
    out.push('<text class="lbl" x="' + (xc - 4).toFixed(1) + '" y="' + (m.t - 5) + '" font-size="11" fill="var(--muted)" text-anchor="end">Stichtag ' + esc(c.analysisCutoff || s[n - 1][0]) + "</text>");
    // Zählungen
    function poly(cand, color, width, dash, labelled, op) {
      var pts = (cand.points || []).filter(function (p) { return p && p.i >= 0 && p.i < n && isFinite(p.price); });
      if (!pts.length) return;
      var labs = labelsFor({ type: cand.type, complete: cand.complete, currentLabel: cand.currentLabel, points: pts });
      out.push('<polyline points="' + pts.map(function (p) { return X(p.i).toFixed(1) + "," + Y(p.price).toFixed(1); }).join(" ") + '" fill="none" stroke="' + color + '" stroke-width="' + width + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") + ' opacity="' + (op || 1) + '" stroke-linejoin="round"/>');
      pts.forEach(function (p, j) {
        var x = X(p.i), y = Y(p.price), prev = pts[j - 1], next = pts[j + 1];
        var isHigh = (prev ? p.price >= prev.price : true) && (next ? p.price >= next.price : true);
        if (!prev && next) isHigh = p.price > next.price;
        if (!next && prev) isHigh = p.price > prev.price;
        out.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (labelled ? 3 : 2) + '" fill="' + color + '" opacity="' + (op || 1) + '"/>');
        if (labelled) out.push('<text class="lbl" x="' + x.toFixed(1) + '" y="' + (isHigh ? y - 8 : y + 16).toFixed(1) + '" font-size="12" fill="' + color + '" text-anchor="middle">' + esc(labs[j]) + "</text>");
      });
    }
    if (VIEW.alts) (c.top || []).slice(1).forEach(function (t) { poly(t, "var(--violet)", 1.2, "4 3", false, 0.65); });
    if (c.impulse && c.impulse.pos !== 0) poly(c.impulse, "var(--lime)", 2, "7 4", true);
    if (c.top && c.top[0]) poly(c.top[0], "var(--blue)", 2.2, null, true);
    out.push("</svg>");
    return out.join("");
  }

  /* ------------------------------------------------------------ Tabellen */
  function gapTable(c) {
    var imp = c.impulse;
    if (!imp) return '<p class="note">Keine Impulslesart vorhanden.</p>';
    var gaps = sortedGaps(imp), max = Math.max.apply(null, gaps.map(function (g) { return Math.abs(g[1]); }).concat([1e-9]));
    var cls = (DATA && DATA.componentClass) || {}, top0 = (c.top && c.top[0]) || { components: {} };
    var rows = gaps.map(function (g) {
      var k = g[0], v = g[1], w = DATA.weights ? DATA.weights[k] : null;
      return "<tr><td>" + esc(COMPONENT_LABEL[k] || k) + " <small class=\"note\"><code>" + esc(k) + "</code></small><br><small class=\"note\">" + esc(cls[k] || "–") + "</small></td>" +
        '<td class="num">' + fmtNum(w, 2) + '</td><td class="num">' + fmtNum(imp.components ? imp.components[k] : null, 3) + '</td><td class="num">' + fmtNum(top0.components ? top0.components[k] : null, 3) + "</td>" +
        '<td class="num ' + (v > 0 ? "pos" : v < 0 ? "neg" : "zero") + '">' + signed(v) + (v > 0 ? ' <span class="bar" style="width:' + Math.max(2, Math.round(40 * v / max)) + 'px"></span>' : "") + "</td></tr>";
    }).join("");
    var sum = gaps.reduce(function (acc, g) { return acc + g[1]; }, 0);
    return '<div class="tablewrap"><table><thead><tr><th>Komponente · Klasse</th><th class="num">Gewicht</th><th class="num">Impuls</th><th class="num">VU-Haupt</th><th class="num">Rangabstand</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><th colspan="4">Summe gewichteter Abstand</th><th class="num">' + signed(sum) + "</th></tr></tfoot></table></div>" +
      '<p class="note">Rangabstand = Gewicht × (Komponente VU-Hauptzählung − Komponente Impulslesart); positiv heißt: hier verliert die Impulslesart.</p>';
  }

  function subTable(cand, title) {
    if (!cand) return "<h4>" + esc(title) + '</h4><p class="note">–</p>';
    var subs = cand.subdivisions || [];
    var motive = isMotive(cand.type);
    var rows = subs.map(function (s, k) {
      var miss = motive && k % 2 === 0 && !isMotive(s.pattern);
      return '<tr class="' + (miss ? "miss" : "") + '"><td>' + esc(subLabel(cand.type, k)) + '</td><td class="num">' + esc(s.bars) + "</td><td>" + esc(s.status || "–") + "</td><td>" + esc(s.pattern || "–") + (miss ? " · keine 5er-Struktur" : "") + "</td></tr>";
    }).join("");
    return "<h4>" + esc(title) + " · " + esc(cand.type) + (cand.complete ? " (abgeschlossen)" : " (laufend" + (cand.currentLabel ? ", Welle " + esc(cand.currentLabel) : "") + ")") + "</h4>" +
      (subs.length ? '<div class="tablewrap"><table><thead><tr><th>Welle</th><th class="num">Bars</th><th>Status</th><th>Muster</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="note">Keine Unterteilungen.</p>');
  }

  function kvTable(obj, keyHead, valHead, limit) {
    if (!obj) return '<p class="note">–</p>';
    var e = Object.keys(obj).map(function (k) { return [k, obj[k]]; });
    if (limit) e = e.sort(function (a, b) { return b[1] - a[1]; }).slice(0, limit);
    if (!e.length) return '<p class="note">keine</p>';
    return '<div class="tablewrap"><table><thead><tr><th>' + esc(keyHead) + '</th><th class="num">' + esc(valHead) + "</th></tr></thead><tbody>" +
      e.map(function (r) { return "<tr><td><code>" + esc(r[0]) + '</code></td><td class="num">' + esc(typeof r[1] === "object" ? JSON.stringify(r[1]) : r[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }

  function forensicsCard(c) {
    var F = c.forensics || {}, I = F.impulse || {}, vu = c.vu || {};
    var h = '<div class="card"><h3>Forensik · Impulssuche</h3>';
    h += "<dl><dt>VU-Status</dt><dd>" + esc(vu.status || "–") + "</dd><dt>Anwendbarkeit</dt><dd>" + esc(vu.applicability || "–") + "</dd>" +
      "<dt>VU-Muster</dt><dd>" + esc(vu.pattern || "–") + (vu.complete ? " (abgeschlossen)" : " (laufend)") + "</dd>" +
      "<dt>Alternativen</dt><dd>" + esc((vu.alternatives || []).join(", ") || "–") + "</dd>" +
      "<dt>Impuls-Position</dt><dd>" + (c.impulse ? esc(c.impulse.pos) + " aller Kandidaten" + (F.impulsePrerank && F.impulsePrerank.found != null ? " · " + esc(F.impulsePrerank.found) + " Impulse gefunden" : "") : "–") + (F.impulseFinal ? " · bestPos " + esc(F.impulseFinal.bestPos) : "") + "</dd>" +
      "<dt>Abgeschnitten</dt><dd>" + (F.truncated ? '<span class="tag bad">ja</span>' : '<span class="tag good">nein</span>') + "</dd>" +
      "<dt>Pool-Pivots</dt><dd>" + esc(F.poolPivots != null ? F.poolPivots : "–") + "</dd></dl>";
    h += "<h4>Enthaltungsgründe</h4>" + ((vu.abstainReasons || []).length ? '<ul class="reasons">' + vu.abstainReasons.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" : '<p class="note">keine</p>');
    h += "<h4>Reichweite (Wellen erreicht)</h4>" + kvTable(I.reach, "Welle", "Pfade");
    h += "<h4>Prune-Gründe (Top 8)</h4>" + kvTable(I.prune, "Stufe:Grund", "Anzahl", 8);
    if (I.found) h += "<h4>Gefunden</h4>" + kvTable(I.found, "Art", "Anzahl");
    if (I.endTouched != null) h += '<p class="note">Stichtag berührt: ' + esc(I.endTouched) + "</p>";
    h += "<h4>Vorrang (prerank)</h4>" + kvTable(F.impulsePrerank, "Feld", "Wert");
    h += "<h4>Score-Abzüge</h4>" + kvTable(F.impulseScoreDrops, "Grund", "Anzahl");
    if (F.anchors) h += "<h4>Anker</h4>" + kvTable(F.anchors, "Feld", "Wert");
    return h + "</div>";
  }

  /* ------------------------------------------------------------ Detail */
  function renderDetail() {
    var root = $("#detail"), c = SEL;
    if (!c) { root.innerHTML = '<div class="card empty"><p class="note">Kein Fall ausgewählt.</p></div>'; return; }
    if (c.status && !c.series) {
      root.innerHTML = '<div class="card"><h2>' + esc(c.referenceId) + '</h2><p class="err">Keine Daten: ' + esc(c.status) + "</p></div>"; return;
    }
    var p = c.practitioner || {}, top0 = (c.top || [])[0] || {}, imp = c.impulse;
    var h = '<div class="card"><h2>' + esc(c.referenceId) + "</h2>";
    h += '<div><span class="tag">' + esc(c.vuSymbol || "?") + '</span><span class="tag">' + esc(c.timeframe) + '</span><span class="tag">' + esc(c.split) + '</span><span class="tag">' + esc(c.sourceFamily) + '</span><span class="tag">Konfidenz ' + esc(c.confidence || "–") + "</span>" +
      (c.sourceUrl && /^https?:\/\//.test(c.sourceUrl) ? '<a href="' + esc(c.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Primärquelle</a>' : "") + "</div>";
    h += '<p class="prline">' + esc(practitionerText(p)) + (p.invalidation && p.invalidation.price != null ? " · Invalidierung " + esc(p.invalidation.direction === "above" ? "über" : "unter") + " " + esc(fmtNum(+p.invalidation.price)) : "") + (p.waveStart ? " · Wellenstart " + esc(p.waveStart.date) : "") + "</p>";
    h += '<p class="note">VU: ' + esc(top0.type || "–") + (top0.complete ? " (abgeschlossen)" : top0.currentLabel ? " (laufend, Welle " + esc(top0.currentLabel) + ")" : "") + " · Impulslesart: " + (imp ? esc(imp.why) + ", Position " + esc(imp.pos) + (imp.complete ? ", abgeschlossen" : imp.currentLabel ? ", laufende Welle " + esc(imp.currentLabel) + " " + esc(imp.currentDir || "") : "") : "keine") + "</p>";
    h += '<div class="controls"><label><input type="checkbox" id="v-alts"' + (VIEW.alts ? " checked" : "") + "> Ränge 2–5 zeigen</label>" +
      '<label><input type="checkbox" id="v-log"' + (VIEW.log ? " checked" : "") + "> Log-Skala</label></div>";
    h += '<div class="legend"><span><i class="sw" style="background:var(--blue)"></i>VU-Hauptzählung (' + esc(top0.type || "–") + ')</span><span style="color:var(--lime)"><i class="sw dash"></i><span style="color:var(--muted)">Impulslesart 1–5</span></span>' +
      (VIEW.alts ? '<span style="color:var(--violet)"><i class="sw dash"></i><span style="color:var(--muted)">Ränge 2–5</span></span>' : "") +
      '<span style="color:var(--red)"><i class="sw dash"></i><span style="color:var(--muted)">Invalidierung Praktiker</span></span><span style="color:var(--amber)"><i class="sw dash"></i><span style="color:var(--muted)">Wellenstart Praktiker</span></span></div>';
    h += '<div class="chartwrap" id="chart"></div>';
    var hidden = [];
    if (top0.points && !top0.points.length) hidden.push("VU-Hauptzählung");
    if (imp && imp.points && !imp.points.length) hidden.push("Impulslesart");
    if (hidden.length) h += '<p class="note">' + esc(hidden.join(" und ")) + " liegt vollständig vor dem sichtbaren Fenster (260 Bars) und ist nicht eingezeichnet.</p>";
    if (imp && imp.pos === 0) h += '<p class="note">Die Impulslesart ist die VU-Hauptzählung selbst.</p>';
    h += "</div>";

    h += '<div class="grid"><div class="card why"><h3>Warum verliert die Impulslesart?</h3>';
    h += '<p class="sentence">' + esc(reasonSentence(c)) + "</p>";
    if (imp) h += '<p class="note">Position ' + esc(imp.pos) + " unter allen bewerteten Kandidaten (0 = VU-Hauptzählung)" + (c.forensics && c.forensics.impulsePrerank && c.forensics.impulsePrerank.found != null ? " (" + esc(c.forensics.impulsePrerank.found) + " Impulse gefunden, " + esc(c.forensics.impulsePrerank.withinMaxScored) + " im Bewertungsfenster)" : "") + " · " + esc(imp.why) + "</p>";
    h += gapTable(c) + "</div>";
    h += '<div class="card"><h3>Unterteilungen</h3>' + subTable(imp, "Impulslesart") + subTable(top0, "VU-Hauptzählung") + "</div>";
    h += forensicsCard(c) + "</div>";
    root.innerHTML = h;
    drawChart();
    $("#v-alts").addEventListener("change", function (e) { VIEW.alts = e.target.checked; renderDetail(); });
    $("#v-log").addEventListener("change", function (e) { VIEW.log = e.target.checked; drawChart(); });
  }

  function drawChart() {
    var box = $("#chart");
    if (!box || !SEL) return;
    box.innerHTML = chartSvg(SEL, box.clientWidth || 600);
  }

  /* ------------------------------------------------------------ Liste & Filter */
  function filtered() {
    var fam = $("#f-family").value, sp = $("#f-split").value, pf = $("#f-pfam").value;
    return DATA.cases.filter(function (c) {
      return (!fam || c.sourceFamily === fam) && (!sp || c.split === sp) && (!pf || (c.practitioner && c.practitioner.family) === pf);
    });
  }

  function renderNav() {
    var nav = $("#case-nav"), list = filtered();
    $("#f-count").textContent = list.length + " von " + DATA.cases.length + " Fällen";
    nav.innerHTML = "";
    list.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "case" + (c.series ? "" : " na");
      if (SEL === c) b.setAttribute("aria-current", "true");
      var p = c.practitioner, top0 = c.top && c.top[0];
      b.innerHTML = '<span class="rid">' + esc(c.referenceId) + "</span><small>" +
        (c.series ? esc(c.timeframe) + " · Praktiker " + esc(p ? p.pattern + (p.currentWave != null ? "/" + p.currentWave : "") : "–") + " · VU " + esc(top0 ? top0.type : "–") + (c.impulse ? " · Impuls Pos. " + esc(c.impulse.pos) : "") : esc(c.status || "keine Daten")) + "</small>";
      b.addEventListener("click", function () { select(c); });
      nav.appendChild(b);
    });
  }

  function select(c) {
    SEL = c;
    try { history.replaceState(null, "", "#case=" + encodeURIComponent(c.referenceId)); } catch (e) { /* egal */ }
    renderNav(); renderDetail();
  }

  function fillSelect(id, values) {
    var s = $(id);
    uniq(values.filter(Boolean)).sort().forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v; s.appendChild(o); });
    s.addEventListener("change", function () { renderNav(); });
  }

  function init(data) {
    DATA = data;
    $("#data-label").textContent = data.label || "–";
    $("#engine").textContent = "Engine " + (data.engine || "–") + " · Schema " + (data.schemaVersion || "–");
    $("#data-status").textContent = data.cases.length + " Fälle geladen · erzeugt " + (data.generatedAt || "–").slice(0, 16).replace("T", " ") + " UTC";
    fillSelect("#f-family", data.cases.map(function (c) { return c.sourceFamily; }));
    fillSelect("#f-split", data.cases.map(function (c) { return c.split; }));
    fillSelect("#f-pfam", data.cases.map(function (c) { return c.practitioner && c.practitioner.family; }));
    var m = /case=([^&]+)/.exec(location.hash || ""), want = m ? decodeURIComponent(m[1]) : null;
    var first = data.cases.filter(function (c) { return c.referenceId === want; })[0] || data.cases.filter(function (c) { return c.series; })[0];
    if (first) select(first); else renderNav();
    var t = null;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(drawChart, 120); });
    document.body.setAttribute("data-ready", "1");
  }

  window.__impulseDebug = { WAVE_LABELS: WAVE_LABELS, labelsFor: labelsFor, reasonSentence: reasonSentence };

  fetch(DATA_URL, { cache: "no-cache" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(init).catch(function (e) {
    var s = $("#data-status"); s.className = "err";
    s.textContent = "Daten konnten nicht geladen werden (" + e.message + "). Erzeugen mit: node scripts/technical/elliott-forensics/debug-view-data.mjs";
    document.body.setAttribute("data-ready", "1");
  });
})();
