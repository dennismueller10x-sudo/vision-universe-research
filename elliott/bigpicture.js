/* VISION UNIVERSE ELLIOTT — bigpicture.js. „Großes Bild“ im Aktienbild (Owner 23.11.2026): Zählung von oben seit Handelsbeginn
   (Chartbild-Produkt v3, Feld elliottTopDown aus quant/engines/technical/elliott/elliott-topdown.js), Pfad der Methode mit Pfeilen und
   Zonen, darunter der Plan in Worten. Rechnet nichts: alle Preise, Zonen und Marken stehen so im Produkt; hier entstehen nur Bild,
   Worte und Prozentabstände (Zonengrenze ÷ Kurs − 1).
   Wortwahl über elliott/config/kursmarken.json: modus „kursziele“ (Owner-Entscheidung 23.11.2026, docs/legal/EINORDNUNG.md §0)
   oder „zonen“ (neutrale Worte nach docs/legal/WORTWAHL.md). Ohne geladene Einstellung gelten die neutralen Worte. */
(function (global) {
  "use strict";
  var CONFIG = "/elliott/config/kursmarken.json";
  /* KURSMARKEN-BEGIN (Owner-Entscheidung 23.11.2026: Kursziele und Einstiege im Elliott-Bild; Restrisiko docs/legal/EINORDNUNG.md §0) */
  var WORDS = {
    kursziele: { target: "Kursziel", entry: "Einstiegszone laut Methode", guard: "Absicherung laut Methode", guardText: "1 % jenseits der Einstiegszone", invalid: "Ungültig laut Methode", tag: "Kursziele und Einstieg nach der Elliott-Methode" },
    zonen: { target: "Zielzone der Methode", entry: "Zone laut Methode", guard: null, guardText: null, invalid: "Ungültig-Marke laut Methode", tag: "Zonen nach der Elliott-Methode" }
  };
  /* KURSMARKEN-END */
  var mode = "zonen", ready = null;
  function load() {
    if (ready) return ready;
    ready = (global.fetch ? fetch(CONFIG, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }) : Promise.resolve(null))
      .then(function (c) { if (c && WORDS[c.modus]) mode = c.modus; return mode; }).catch(function () { return mode; });
    return ready;
  }
  var REL = {
    W2_RETRACE: "Welle 2 läuft 50–78,6 % von Welle 1 zurück", W3_PROJECT: "Welle 3 = 1,0–2,618 × Welle 1", W4_RETRACE: "Welle 4 läuft 23,6–50 % von Welle 3 zurück",
    W5_PROJECT: "Welle 5 = 0,618–1,618 × Welle 1", W5_NET13: "Welle 5 über das Ende von Welle 3 hinaus (0,382–1,0 × Strecke 1 bis 3)", A_RETRACE: "Korrektur 38,2–61,8 % des Impulses",
    B_RETRACE: "Welle B läuft 38,2–78,6 % von Welle A zurück", C_PROJECT: "Welle C = 0,618–1,618 × Welle A", NEXT_IMPULSE: "nach der Korrektur 0,618–1,618 × ihrer Länge zurück"
  };
  var KIND = { IMPULSE: "Impuls", CORRECTION: "Korrektur" };
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function num(v) { if (typeof v !== "number" || !isFinite(v)) return "–"; var d = v >= 1000 ? 0 : v >= 100 ? 0 : v >= 10 ? 2 : 2; return v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pct(v, base) { var p = (v / base - 1) * 100; return (p > 0 ? "+" : p < 0 ? "−" : "±") + Math.abs(Math.round(p)).toLocaleString("de-DE") + " %"; }
  /* Kernzone = erste noch offene Stufe; die naechste Stufe steht als „erweitert“ daneben. */
  function core(step) { var t = step.tiers.filter(function (z) { return !z.done; }); if (!t.length) t = step.tiers.slice(-1); return { lo: t[0].lo, hi: t[0].hi, ext: t[1] || null }; }
  function year(t) { return String(t || "").slice(0, 4); }

  /* Rolle eines Schritts (wie in der Praxis gelesen): dreht der Pfad nach dem ersten Schritt, ist dessen Zone die Einstiegszone und die
     folgenden Schritte in der neuen Richtung sind Kursziele; Schritte dagegen sind Zwischenschritte. Laeuft der erste Schritt schon in
     Richtung des zweiten, ist er selbst Kursziel. */
  function plan(td) {
    var P = td.path || [], out = [], nT = 0, entry = null;
    var turn = P.length > 1 && P[0].dir !== P[1].dir, dirT = turn ? P[1].dir : P[0] && P[0].dir;
    P.forEach(function (s, k) {
      var c = core(s);
      var role = k === 0 && turn ? "entry" : s.dir === dirT ? "target" : "step";
      if (role === "target") nT++;
      var row = { step: s, role: role, n: role === "target" ? nT : null, lo: c.lo, hi: c.hi, ext: c.ext };
      if (role === "entry") entry = row;
      out.push(row);
    });
    return out;
  }

  /* ---------------------------------------------------------- Bild (SVG als Text, Log-Skala, Zukunft rechts) */
  function svgOf(td, rows, W) {
    var H = W < 520 ? 330 : 380, padL = 6, padR = W < 520 ? 46 : 58, padT = 14, padB = 22, M = td.monthly || [];
    if (M.length < 6) return "";
    var fut = W < 520 ? 0.36 : 0.32, plotW = W - padL - padR, histW = plotW * (1 - fut), x0 = padL, xNow = x0 + histW;
    var vals = M.map(function (m) { return m[1]; }).filter(function (v) { return v > 0; });
    rows.forEach(function (r) { vals.push(r.lo, r.hi); });
    if (td.primary.inv && td.primary.inv.p > 0) vals.push(td.primary.inv.p);
    var lo = Math.min.apply(null, vals) * 0.85, hi = Math.max.apply(null, vals) * 1.12, L = Math.log;
    function y(v) { return padT + (L(hi) - L(Math.max(v, lo))) / (L(hi) - L(lo)) * (H - padT - padB); }
    function xm(k) { return x0 + histW * (k / Math.max(1, M.length - 1)); }
    var idx = {}; M.forEach(function (m, k) { idx[m[0].slice(0, 7)] = k; });
    function xAt(t) { var k = idx[String(t).slice(0, 7)]; return k === undefined ? null : xm(k); }
    var g = [];
    /* Gitter: Zehnerpotenzen und Halbe (log) */
    var ticks = [];
    for (var e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) [1, 2, 5].forEach(function (m) { var t = m * Math.pow(10, e); if (t >= lo && t <= hi) ticks.push(t); });
    while (ticks.length > 6) ticks = ticks.filter(function (_, i) { return i % 2 === 0; });
    ticks.forEach(function (t) { g.push('<line class="bp-grid" x1="' + x0 + '" x2="' + (W - padR) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text class="bp-axis" x="' + (W - padR + 6) + '" y="' + (y(t) + 4).toFixed(1) + '">' + esc(num(t)) + "</text>"); });
    var lastYear = "", lastX = -1e9, years = Math.max(1, M.length / 12), every = [1, 2, 4, 5, 10].filter(function (e) { return histW / (years / e) >= 44; })[0] || 10;
    M.forEach(function (m, k) { var yr = year(m[0]); if (yr !== lastYear && k > 0 && +yr % every === 0 && xm(k) - lastX >= 40) { lastX = xm(k); g.push('<text class="bp-axis" x="' + xm(k).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + yr + "</text>"); } lastYear = yr; });
    g.push('<rect class="bp-future" x="' + xNow.toFixed(1) + '" y="' + padT + '" width="' + (W - padR - xNow).toFixed(1) + '" height="' + (H - padT - padB) + '"/>');
    /* Ungültig-Marke */
    var inv = td.primary.inv;
    if (inv && inv.p > lo) g.push('<line class="bp-inv" x1="' + x0 + '" x2="' + (W - padR) + '" y1="' + y(inv.p).toFixed(1) + '" y2="' + y(inv.p).toFixed(1) + '"/><text class="bp-inv-t" x="' + (W - padR - 4) + '" text-anchor="end" y="' + (y(inv.p) + (inv.d === "below" ? 14 : -6)).toFixed(1) + '">' + esc(WORDS[mode].invalid + (inv.d === "below" ? " unter " : " über ") + num(inv.p)) + "</text>");
    /* Kurs */
    g.push('<path class="bp-line" d="' + M.map(function (m, k) { return (k ? "L" : "M") + xm(k).toFixed(1) + " " + y(m[1]).toFixed(1); }).join("") + '"/>');
    /* Wellenmarken: grosser Grad [x], Unterteilung (x) */
    var taken = {};
    function marks(c, big) {
      if (!c) return;
      c.waves.forEach(function (w, k) {
        var x = xAt(w.tt); if (x === null) return;
        /* Grosser Grad weicht einer Untermarke am selben Monat aus (eine Stufe weiter vom Kurs weg) */
        var key = String(w.tt).slice(0, 7), upEnd = w.tp >= w.fp, off = (upEnd ? -14 : 22) + (taken[key] ? (upEnd ? -28 : 28) : 0);
        taken[key] = 1;
        var yy = y(w.tp) + off, r = big ? 13 : 10, lab = big ? "[" + w.l + "]" : "(" + w.l + ")";
        g.push('<g class="bp-wave' + (big ? " is-big" : "") + (w.dev ? " is-dev" : "") + '"><circle cx="' + x.toFixed(1) + '" cy="' + (yy - 4).toFixed(1) + '" r="' + r + '"/><text x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" text-anchor="middle">' + esc(lab) + "</text></g>");
      });
    }
    marks(td.sub, false); marks(td.primary, true);
    /* Pfad: Pfeile von heute zu den Punkten der Schritte, Zonen als Kästen */
    var n = rows.length, px = xNow, py = y(td.close), fw = W - padR - xNow;
    rows.forEach(function (r, k) {
      var x = xNow + fw * ((k + 1) / (n + 0.4)), yp = y(r.step.point), up = r.step.dir === "UP";
      var bw = Math.min(46, fw / (n + 1) * 0.8);
      g.push('<rect class="bp-zone bp-zone-' + r.role + '" x="' + (x - bw / 2).toFixed(1) + '" y="' + y(r.hi).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(3, y(r.lo) - y(r.hi)).toFixed(1) + '" rx="4"/>');
      g.push('<line class="bp-arrow ' + (up ? "is-up" : "is-down") + '" x1="' + px.toFixed(1) + '" y1="' + py.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + yp.toFixed(1) + '" marker-end="url(#bp-head-' + (up ? "up" : "down") + ')"/>');
      g.push('<text class="bp-step" x="' + x.toFixed(1) + '" y="' + (up ? y(r.hi) - 6 : y(r.lo) + 14).toFixed(1) + '" text-anchor="middle">' + esc(r.step.disp) + "</text>");
      px = x; py = yp;
    });
    g.push('<circle class="bp-now" cx="' + xNow.toFixed(1) + '" cy="' + y(td.close).toFixed(1) + '" r="4"/>');
    var defs = '<defs><marker id="bp-head-up" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="bp-head-up"/></marker><marker id="bp-head-down" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="bp-head-down"/></marker></defs>';
    return '<svg class="bp-svg" viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="Großes Bild seit ' + esc(year(M[0][0])) + ' mit Wellen und Pfad der Methode">' + defs + g.join("") + "</svg>";
  }

  /* ---------------------------------------------------------- Abschnitt */
  function titleOf(td) {
    var p = td.primary, cur = p.cur, w = p.waves[p.waves.length - 1];
    var sub = td.sub ? " · darin Welle (" + td.sub.cur + ")" + (td.sub.waves[td.sub.waves.length - 1].dev ? " läuft" : "") : "";
    return KIND[p.kind] + " " + (p.dir === "UP" ? "aufwärts" : "abwärts") + " seit " + year(p.waves[0].ft) + ": Welle [" + cur + "]" + (w.dev ? " läuft" : "") + sub;
  }
  function rowsHtml(td, rows) {
    var W0 = WORDS[mode], c = td.close, h = [];
    rows.forEach(function (r) {
      var s = r.step, range = num(r.lo) + "–" + num(r.hi) + " $", inside = c >= r.lo && c <= r.hi;
      var dist = inside ? "Kurs liegt in der Zone" : pct(s.dir === "UP" ? r.lo : r.hi, c) + " bis " + pct(s.dir === "UP" ? r.hi : r.lo, c);
      var k = r.role === "entry" ? W0.entry : r.role === "target" ? (mode === "kursziele" ? W0.target + " " + r.n : W0.target) : "Zwischenschritt";
      var extra = r.role === "entry" && W0.guard ? '<span class="bp-sub">' + esc(W0.guard + ": " + W0.guardText + " (" + num(s.dir === "UP" ? r.hi * 1.01 : r.lo * 0.99) + " $)") + "</span>" : "";
      h.push('<li class="bp-row bp-row-' + r.role + '"><span class="bp-k">' + esc(k) + ' <b>' + esc(s.disp) + "</b></span><span class=\"bp-v num\">" + esc(range) + '</span><span class="bp-d num">' + esc(dist) + '</span><span class="bp-sub">' + esc((REL[s.rel] || "") + (s.dev ? " · Welle läuft" : "") + (r.ext ? " · erweitert " + num(r.ext.lo) + "–" + num(r.ext.hi) + " $" : "")) + "</span>" + extra + "</li>");
    });
    var inv = td.primary.inv;
    if (inv) h.push('<li class="bp-row bp-row-inv"><span class="bp-k">' + esc(W0.invalid) + '</span><span class="bp-v num">' + esc((inv.d === "below" ? "unter " : "über ") + num(inv.p) + " $") + '</span><span class="bp-d num">' + esc(pct(inv.p, c)) + '</span><span class="bp-sub">' + esc(inv.text || "") + "</span></li>");
    return h.join("");
  }
  function render(host, a) {
    var td = a.elliottTopDown, rows = plan(td), W = Math.max(320, Math.min(1000, host.clientWidth || (global.innerWidth || 390) - 32));
    var alt = td.alternative ? "Alternative: " + KIND[td.alternative.kind] + " " + (td.alternative.dir === "UP" ? "aufwärts" : "abwärts") + " seit " + year(td.alternative.waves[0].ft) + ", Welle [" + td.alternative.cur + "]" + (td.alternative.inv ? " · ungültig " + (td.alternative.inv.d === "below" ? "unter " : "über ") + num(td.alternative.inv.p) + " $" : "") : "";
    host.innerHTML = '<p class="vu-ltag">' + esc("Großes Bild · " + WORDS[mode].tag) + '</p><h2 class="vu-mt bp-title">' + esc(titleOf(td)) + "</h2>" +
      '<div class="bp-chart">' + svgOf(td, rows, W) + "</div>" +
      '<ol class="bp-plan">' + rowsHtml(td, rows) + "</ol>" +
      (alt ? '<p class="bp-alt">' + esc(alt) + "</p>" : "") +
      '<p class="bp-note">' + esc("Zählung von oben auf Wochenschlusskursen seit " + year((td.monthly[0] || [])[0]) + " (Frost & Prechter, Elliott Wave Principle). Zonen ohne Zeitangabe, keine Wahrscheinlichkeit. Analyse nach einer Methode, keine Anlageberatung.") + "</p>";
  }
  /** Abschnitt fuer das Aktienbild; null ohne Zaehlung von oben. */
  function section(a) {
    var td = a && a.elliottTopDown;
    if (!td || td.status !== "OK" || !td.primary || !(td.path && td.path.length) || !(td.monthly && td.monthly.length >= 6)) return null;
    var host = document.createElement("section");
    host.className = "bp"; host.setAttribute("aria-label", "Großes Bild");
    render(host, a);
    load().then(function () { render(host, a); });
    var t = null; global.addEventListener && global.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { if (host.isConnected) render(host, a); }, 200); });
    return host;
  }
  var api = { section: section, plan: plan, titleOf: titleOf, WORDS: WORDS, load: load, _setMode: function (m) { if (WORDS[m]) mode = m; } };
  global.VUElliottBig = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
