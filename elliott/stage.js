/* VISION UNIVERSE ELLIOTT — stage.js. „Wellenbühne“ (Entwurf 24.11.2026, Owner: „rauszoomen, nicht gepresst, sich abheben“).
   Ein Chart über die ganze Breite und fast die ganze Höhe des Telefons: Kurs seit Börsengang (Monatsschluss, die letzten fünf Jahre
   Wochenschluss), darüber das Gerüst der Zählung von oben (großer Grad als Kreise wie bei Frost & Prechter, Unterwellen in Klammern),
   rechts der Pfad der Methode mit Zonen als Felder am Zielpunkt. Finger auf dem Chart zeigt Datum, Kurs und Welle; „Erklären“ spielt
   die Zählung in fünf Sätzen ab. Rechnet nichts Neues: Zählung, Pfad, Zonen und Ungültig-Marke kommen aus elliottTopDown
   (scripts/technical/lib/ti-topdown.mjs), Rollen und Worte aus elliott/bigpicture.js (VUElliottBig.plan, WORDS). */
(function (global) {
  "use strict";
  var DAY = 864e5, YEAR = 365.25 * DAY, MON = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
  function Big() { return global.VUElliottBig || null; }
  function words() { var b = Big(), W = b && b.WORDS ? b.WORDS[b.mode ? b.mode() : "zonen"] : null; return W || { tShort: "Ziel", eShort: "Zone" }; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v) { if (!isNum(v)) return "–"; var d = v < 10 ? 2 : v < 100 ? 1 : 0; return v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pct(to, from) { var p = Math.round((to / from - 1) * 100); return (p > 0 ? "+" : p < 0 ? "−" : "±") + Math.abs(p).toLocaleString("de-DE") + " %"; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function T(s) { return Date.parse(String(s).slice(0, 10) + "T00:00:00Z"); }
  function md(t) { var d = new Date(t); return MON[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function f(v) { return v.toFixed(1); }
  function waveName(l, deg) { return deg === "SUB" ? "Welle (" + l + ")" : "Welle " + l; }

  /** Kurs seit Börsengang: Monatsschluss bis zum Beginn der Wochenreihe, danach Wochenschluss. */
  function seriesOf(a, td) {
    var ch = a.chart || {}, out = [], w0 = Infinity;
    if (ch.timeframe === "1W" && ch.timestamps && ch.timestamps.length) w0 = T(ch.timestamps[0]);
    (td.monthly || []).forEach(function (m) { var t = T(m[0]); if (t < w0 && isNum(m[1]) && m[1] > 0) out.push({ t: t, c: m[1] }); });
    if (w0 < Infinity) ch.timestamps.forEach(function (s, i) { var c = ch.close[i]; if (isNum(c) && c > 0) out.push({ t: T(s), c: c }); });
    return out;
  }
  function pivots(c, close, tEnd, deg) {
    if (!c || !c.waves || !c.waves.length) return [];
    var w = c.waves, P = [{ t: T(w[0].ft), p: w[0].fp, l: null, deg: deg }];
    w.forEach(function (x) { P.push(x.dev ? { t: tEnd, p: close, l: x.l, dev: 1, deg: deg, w: x } : { t: T(x.tt), p: x.tp, l: x.l, deg: deg, w: x }); });
    return P;
  }

  function mount(host, a, opt) {
    opt = opt || {};
    var td0 = a.elliottTopDown, b = Big();
    if (!td0 || !td0.primary || !(td0.path && td0.path.length) || !b) return null;
    var S0 = null, SW = null, SN = opt.history || a.elliottHistory || null, st = { farK: 0, range: opt.range || "focus", which: "main", focus: null, t0: null, intro: true, story: -1, tm: null, reveal: false };
    var root = document.createElement("div"); root.className = "st-wrap";
    host.appendChild(root);

    function view() {
      /* Zeitreise: Stand der Zählung an einem früheren Wochenschluss (kausal gerechnet), Kurs auf der ganzen Wochenreihe */
      if (st.tm != null && SN) {
        var sn = SN.snaps[st.tm], tdS = { primary: sn.p, sub: sn.s, path: sn.path, close: sn.c, asOf: sn.a };
        return { td: tdS, rows: b.plan(tdS), S: SW || (SW = SN.weekly.map(function (q) { return { t: T(q[0]), c: q[1] }; })), tm: sn };
      }
      var td = b.viewOf ? b.viewOf(td0, st.which) : td0, rows = b.plan(td), S = S0 || (S0 = seriesOf(a, td0));
      return { td: td, rows: rows, S: S };
    }
    /* Fernziel (elliott/engine/far-target.js): nur in der Gegenwart, nicht in der Zeitreise */
    function farOf(V) { var F = global.VUElliottFar || (typeof require === "function" ? null : null); var r = !V.tm && F ? F.far(V.td) : null; return r && !r.none && r.hi > 0 ? r : null; }
    /* „Aktuell“: ab dem Beginn der großen Welle vor der laufenden (z. B. ab Welle 3, wenn Welle 4 läuft), mindestens 3, höchstens 12 Jahre */
    st.farK = farOf(view()) ? 1 : 0;   // Fernziel ist von Anfang an eingezeichnet
    function startFor(r, S) {
      var tEnd = S[S.length - 1].t, t;
      if (r === "all") t = S[0].t;
      else { var w = td0.primary.waves, k = w.length; w.forEach(function (x, i) { if (x.dev) k = i; }); var base = w[Math.max(0, k - 1)];
        t = base ? T(base.ft) - 0.7 * YEAR : tEnd - 4 * YEAR; t = Math.max(tEnd - 12 * YEAR, Math.min(t, tEnd - 3 * YEAR)); }
      return Math.max(S[0].t, t);
    }

    function svgOf(V, W, H) {
      var td = V.td, rows = V.rows, S = V.S, close = td.close || S[S.length - 1].c, tm = V.tm || null;
      /* Ausschnitt t0 … t1v; „live“ = rechter Rand ist heute (dann mit Plan der Methode), sonst ein gezoomtes Stück Geschichte */
      var tEnd = S[S.length - 1].t, t0 = st.t0, t1v = tm || st.t1 == null ? tEnd : Math.min(st.t1, tEnd), live = !!tm || t1v >= tEnd - DAY;
      var vis = S.filter(function (p) { return p.t >= t0 && p.t <= t1v + 8 * DAY; });
      if (vis.length < 4) vis = S.slice(-4);
      var FT = live ? farOf(V) : null, narrow = W < 560, OV = 62, CT = 66, padT = (narrow ? 162 : 150) + (FT ? 40 : 0),   // eigene Zeile für den Fernziel-Knopf
         padB = 26 + OV + CT, padR = narrow ? 54 : 64, plotR = W - padR, oy0 = H - CT - OV;
      var fk = FT ? st.farK : 0;
      var tC = tm ? T(tm.a) : tEnd, xR = tm || !live ? plotR - 6 : Math.round(plotR * ((narrow ? 0.62 : 0.7) - 0.15 * fk)), xEnd = tm ? plotR - 6 : plotR - 10;
      function x(t) { return 2 + (t - t0) / Math.max(DAY, t1v - t0) * (xR - 2); }
      var xNow = tm ? x(tC) : xR;
      if (!live) rows = [];   // gezoomte Geschichte: ohne Plan
      /* mit Fernziel rückt der Plan zusammen: rechts bleibt Platz für Welle II und III des übergeordneten Grads */
      var farII = FT && FT.kind === "III" && FT.twoFrom !== "Zone C im Pfad", shrink = 1 - fk * (farII ? 0.5 : 0.3);
      var nS = rows.length; function px(k) { return xNow + (xEnd - xNow) * shrink * ((k + 1) / (nS + 0.15)); }
      var big = pivots(td.primary, close, tC, "BIG"), sub = pivots(td.sub, close, tC, "SUB");
      /* Wertebereich: sichtbarer Kurs, sichtbare Wendepunkte, Kernzonen der Schritte, Ungültig-Marke in Reichweite */
      var vals = vis.map(function (p) { return p.c; });
      big.concat(sub).forEach(function (q) { if (q.t >= t0 && q.t <= t1v) vals.push(q.p); });
      rows.forEach(function (r) { vals.push(r.lo, r.hi, r.step.point); });
      if (!vals.length) vals = [close];
      var vMin = Math.min.apply(null, vals), vMax = Math.max.apply(null, vals), inv = td.primary.inv, invIn = inv && inv.p > vMin / 2.5 && inv.p < vMax * 2.5;
      if (invIn) vals.push(inv.p);
      var lo = Math.min.apply(null, vals) / 1.1, hi = Math.max.apply(null, vals) * 1.1;
      if (fk > 0) { var hiF = FT.ext.hi * 1.08; if (hiF > hi) hi = Math.exp(Math.log(hi) + fk * (Math.log(hiF) - Math.log(hi)));
        var loF = farII ? FT.two / 1.12 : lo; if (loF < lo) lo = Math.exp(Math.log(lo) + fk * (Math.log(loF) - Math.log(lo))); }
      function y(v) { return padT + 16 + (Math.log(hi) - Math.log(Math.max(v, lo))) / (Math.log(hi) - Math.log(lo)) * (H - padT - padB - 44); }   // Luft für Kreise über Hochs und unter Tiefs
      var g = [];
      g.push('<defs><linearGradient id="st-area" x1="0" y1="0" x2="0" y2="1"><stop class="st-a0" offset="0"/><stop class="st-a1" offset="1"/></linearGradient>' +
        '<radialGradient id="st-glow"><stop class="st-g0" offset="0"/><stop class="st-g1" offset="1"/></radialGradient>' +
        '<clipPath id="st-clip"><rect x="0" y="0" width="' + xNow + '" height="' + H + '"/></clipPath>' +
        '<marker id="st-ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path class="st-hd-t" d="M0 0L10 5L0 10z"/></marker>' +
        '<marker id="st-aw" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="st-hd-w" d="M0 0L10 5L0 10z"/></marker></defs>');
      /* Raster: wenige Preislinien (log 1-2-5), Jahre unten */
      var ticks = [], e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
      for (var e = e0; e <= e1; e++) [1, 2, 5].forEach(function (m) { var v = m * Math.pow(10, e); if (v > lo && v < hi) ticks.push(v); });
      var tk = []; ticks.forEach(function (v) { if (!tk.length || y(tk[tk.length - 1]) - y(v) > 44) tk.push(v); });
      var dim = function (k) { return st.focus && st.focus.indexOf(k) < 0 ? ' opacity=".16"' : ""; };
      g.push('<g class="st-grid">' + tk.map(function (v) { return '<line x1="0" x2="' + plotR + '" y1="' + f(y(v)) + '" y2="' + f(y(v)) + '"/>'; }).join("") + "</g>");
      var yrs = [], span = (tEnd - t0) / YEAR, every = span > 24 ? 5 : span > 10 ? 2 : 1, y0 = new Date(t0).getUTCFullYear() + 1, lastX = -99;
      for (var yr = y0; yr <= new Date(tEnd).getUTCFullYear(); yr++) if (yr % every === 0) { var xt = x(Date.UTC(yr, 0, 1)); if (xt > 14 && xt < (tm ? xR - 20 : xNow - 46) && xt - lastX > 44 && (!tm || Math.abs(xt - Math.min(xNow, plotR - 50)) > 66)) { lastX = xt; yrs.push('<text class="st-ax" x="' + f(xt) + '" y="' + (H - padB + 17) + '" text-anchor="middle">' + yr + "</text>"); } }
      g.push(yrs.join(""));
      /* Zukunft: eigener Raum ohne Zeitachse */
      if (live) g.push('<line class="st-now" x1="' + xNow + '" x2="' + xNow + '" y1="' + (padT - 22) + '" y2="' + (H - padB + 4) + '"/>' +
        (tm ? '<text class="st-ax st-ax-tm" x="' + f(Math.min(xNow, plotR - 50)) + '" y="' + (H - padB + 17) + '" text-anchor="middle">' + esc("Stand " + md(tC)) + "</text>"
            : '<text class="st-ax st-ax-r" x="' + (xNow + 7) + '" y="' + (H - padB + 17) + '">Plan der Methode →</text>' +
              '<text class="st-ax" x="' + (xNow - 5) + '" y="' + (H - padB + 17) + '" text-anchor="end">heute</text>'));
      /* Ungültig-Marke */
      if (invIn) g.push('<g class="st-inv"' + dim("inv") + '><line x1="0" x2="' + plotR + '" y1="' + f(y(inv.p)) + '" y2="' + f(y(inv.p)) + '"/></g>');
      /* Kurs als Linie mit Fläche */
      var pre = tm ? vis.filter(function (p) { return p.t <= tC; }) : vis, post = tm ? vis.filter(function (p) { return p.t >= tC; }) : [];
      if (!pre.length) pre = vis.slice(0, 1);
      var line = function (L) { return L.map(function (p, i) { return (i ? "L" : "M") + f(x(p.t)) + " " + f(y(p.c)); }).join(""); }, d = line(pre);
      g.push('<g class="st-pg"' + dim("price") + '><path class="st-area" d="' + d + "L" + f(x(pre[pre.length - 1].t)) + " " + (H - padB) + "L" + f(x(pre[0].t)) + " " + (H - padB) + 'Z" fill="url(#st-area)"/>' +
        '<path class="st-price" pathLength="1" d="' + d + '"/>' + (post.length > 1 ? '<path class="st-after" pathLength="1" d="' + line(post) + '"/>' : "") + "</g>");
      /* Gerüst der Zählung: Unterwellen fein, großer Grad kräftig */
      function skel(P, cls, key) {
        if (P.length < 2) return "";
        return '<g clip-path="url(#st-clip)" class="' + cls + '"' + dim(key) + '><path d="' + P.map(function (q, i) { return (i ? "L" : "M") + f(x(q.t)) + " " + f(y(q.p)); }).join("") + '"/></g>';
      }
      g.push('<g class="st-g2">' + skel(sub, "st-sk-sub", "sub") + skel(big, "st-sk-big", "big"));
      /* hervorgehobene Welle (Erklären): dicker Strich über ihr Stück */
      var wf = st.focus ? st.focus.filter(function (z) { return z.indexOf("wave:") === 0; })[0] : null;
      if (wf) {
        var wl = wf.slice(5), k = -1; big.forEach(function (q, i) { if (q.l === wl) k = i; });
        if (k > 0) g.push('<path class="st-hl" clip-path="url(#st-clip)" d="M' + f(x(big[k - 1].t)) + " " + f(y(big[k - 1].p)) + "L" + f(x(big[k].t)) + " " + f(y(big[k].p)) + '"/>');
      }
      var used = [], nodes = [];
      function place(cx, cy, up, h) { for (var i = 0; i < 6 && used.some(function (u) { return Math.abs(u[0] - cx) < 26 && Math.abs(u[1] - cy) < h; }); i++) cy += up ? -h : h; used.push([cx, cy]); return cy; }
      function labels(P, isBig) {
        var out = [];
        P.forEach(function (q, i) {
          if (!q.l || q.dev || q.t < t0 || q.t > t1v) return;
          var cx = x(q.t); if (cx < 16 || cx > xNow - 4) return;
          var prev = P[i - 1], up = !prev || q.p >= prev.p, off = isBig ? 19 : 14, cy = place(cx, y(q.p) + (up ? -off : off + (isBig ? 0 : 4)), up, isBig ? 26 : 16);
          if (isBig) { out.push('<g class="st-node"' + dim(st.focus && st.focus.indexOf("wave:" + q.l) >= 0 ? "wave:" + q.l : "big") + '><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="11.5"/><text x="' + f(cx) + '" y="' + f(cy + 4.2) + '" text-anchor="middle">' + esc(q.l) + "</text></g>"); nodes.push({ x: cx, y: cy, q: q, P: P, i: i }); }
          else out.push('<text class="st-sl"' + dim("sub") + ' x="' + f(cx) + '" y="' + f(cy) + '" text-anchor="middle">' + esc("(" + q.l + ")") + "</text>");
        });
        return out.join("");
      }
      g.push(labels(sub, false) + labels(big, true) + "</g>");
      /* Pfad der Methode: Zonen als Felder am Zielpunkt, Pfeile vom heutigen Kurs */
      var W0 = words(), P0 = [xNow, y(close)], pts = rows.map(function (r, k) { return [px(k), y(r.step.point)]; }), proj = [], pads = [], tags = [];
      var firstT = rows.filter(function (r) { return r.role === "target"; })[0];
      if (firstT && !tm) { var gk = rows.indexOf(firstT); pads.push('<circle' + dim("target") + ' cx="' + f(pts[gk][0]) + '" cy="' + f((y(firstT.lo) + y(firstT.hi)) / 2) + '" r="96" fill="url(#st-glow)"/>'); }
      rows.forEach(function (r, k) {
        var role = r.role, key = role === "target" ? "target" : role === "entry" ? "entry" : "step", cx = pts[k][0], hw = narrow ? 22 : 28;
        (r.zones || [{ lo: r.lo, hi: r.hi }]).slice(0, tm ? (key === "step" ? 0 : 1) : 2).forEach(function (z, q) {   // Zeitreise: nur Einstieg und Kursziel als Bänder
          pads.push('<rect class="st-pad st-pad-' + key + " st-z" + (q + 1) + (tm ? " st-band" : "") + '"' + dim(key) + ' x="' + f(tm ? xNow : cx - hw) + '" y="' + f(y(z.hi)) + '" width="' + f(tm ? Math.max(4, xEnd - xNow) : 2 * hw) + '" height="' + f(Math.max(4, y(z.lo) - y(z.hi))) + '" rx="7"/>');
        });
        var A = k ? pts[k - 1] : P0, Bp = pts[k], tgt = role === "target";
        proj.push('<path class="st-arrow ' + (tgt ? "st-a-t" : "st-a-w") + '"' + dim(key) + ' pathLength="1" d="M' + f(A[0]) + " " + f(A[1]) + "L" + f(Bp[0]) + " " + f(Bp[1]) + '" marker-end="url(#' + (tgt ? "st-ah" : "st-aw") + ')"/>');
        var up = r.step.dir === "UP", ly = up ? Math.min(Bp[1], y(r.hi)) - 10 : Math.max(Bp[1], y(r.lo)) + 20;
        if (r.step.deg === "BIG") proj.push('<g class="st-node st-ghost"' + dim(key) + '><circle cx="' + f(cx) + '" cy="' + f(ly - 5) + '" r="11.5"/><text x="' + f(cx) + '" y="' + f(ly - 0.8) + '" text-anchor="middle">' + esc(r.step.l) + "</text></g>");
        else {
          /* Schließt die Unterwelle zugleich die laufende große Welle ab, steht deren Kreis daneben (z. B. (C) beendet Welle 4) */
          var ends = td.primary.waves.filter(function (w) { return w.dev; })[0], nextBig = rows[k + 1] && rows[k + 1].step.deg === "BIG";
          proj.push('<text class="st-sl"' + dim(key) + ' x="' + f(cx) + '" y="' + f(ly) + '" text-anchor="middle">' + esc(r.step.disp) + "</text>");
          if (ends && nextBig && k === 0) proj.push('<g class="st-node st-ghost"' + dim(key) + '><circle cx="' + f(cx + 24) + '" cy="' + f(ly - 5) + '" r="11.5"/><text x="' + f(cx + 24) + '" y="' + f(ly - 0.8) + '" text-anchor="middle">' + esc(ends.l) + "</text></g>");
        }
        if (role !== "step") {
          var lab = num(r.lo) + "–" + num(r.hi), lx = Math.min(cx, W - padR - 4 - lab.length * 3.4), lyy = up ? ly - 22 : ly + 16;
          proj.push('<text class="st-zl ' + (tgt ? "st-zl-t" : "") + '"' + dim(key) + ' x="' + f(lx) + '" y="' + f(lyy) + '" text-anchor="middle">' + esc(lab) + "</text>");
        }
        nodes.push({ x: cx, y: Bp[1], row: r });
      });
      /* Geisterpfad der Alternative (nur in der Hauptzählung): dünn, damit man sieht, wohin die zweite regelkonforme Lesart führt */
      var ghost = "";
      if (!tm && live && st.which === "main" && fk < 0.5 && td0.alternative && td0.altPath && td0.altPath.length && b.viewOf) {
        var rA = b.plan(b.viewOf(td0, "alt")), nA = rA.length, GP = [P0].concat(rA.map(function (r, k) { return [xNow + (xEnd - xNow) * ((k + 1) / (nA + 0.15)), y(r.step.point)]; }));
        ghost = '<g class="st-ghostpath"' + dim("alt") + '><path d="' + GP.map(function (q, i) { return (i ? "L" : "M") + f(q[0]) + " " + f(q[1]); }).join("") + '"/>' +
          '<text x="' + f(GP[GP.length - 1][0]) + '" y="' + f(GP[GP.length - 1][1] + 16) + '" text-anchor="middle">Alternative</text></g>';
      }
      g.push('<g class="st-g3">' + ghost + pads.join("") + proj.join("") + "</g>");
      /* Fernziel als gezeichneter Weg des übergeordneten Grads (römisch, eckig): die Wellen 1–5 bilden zusammen Welle I,
         danach Korrektur II (ohne Zone C im Pfad: Ende bei 50 % von I) und Welle III ins Fernziel; bei jungem Impuls nur das Ende von Welle 5 */
      if (fk > 0 && rows.length) {
        var lastK = rows.length - 1, A1 = pts[lastK] || P0, fx = xEnd - 2, fw = narrow ? 40 : 52, fc = fx - fw / 2, fyB = (y(FT.lo) + y(FT.hi)) / 2, ft = num(FT.lo) + "–" + num(FT.hi) + " $";
        var deg = function (cx, cy, t) { var w = 14 + t.length * 7; return '<g class="st-deg"><rect x="' + f(cx - w / 2) + '" y="' + f(cy - 12) + '" width="' + f(w) + '" height="24" rx="6"/><text x="' + f(cx) + '" y="' + f(cy + 4.5) + '" text-anchor="middle">' + esc(t) + "</text></g>"; };
        var fg = ['<circle cx="' + f(fc) + '" cy="' + f(fyB) + '" r="110" fill="url(#st-glow)"/>',
          '<rect class="st-pad st-pad-target st-z2" x="' + f(fx - fw) + '" y="' + f(y(FT.ext.hi)) + '" width="' + fw + '" height="' + f(Math.max(4, y(FT.ext.lo) - y(FT.ext.hi))) + '" rx="8"/>',
          '<rect class="st-pad st-pad-target st-far-z" x="' + f(fx - fw) + '" y="' + f(y(FT.hi)) + '" width="' + fw + '" height="' + f(Math.max(6, y(FT.lo) - y(FT.hi))) + '" rx="8"/>'];
        if (FT.kind === "III") {
          /* Ende von Welle I: projiziertes Ende von Welle 5 im Pfad oder abgeschlossenes Hoch von Welle 5 in der Geschichte */
          var k5 = -1; rows.forEach(function (r, k) { if (String(r.step.l) === "5") k5 = k; });
          var h5 = big.filter(function (q) { return q.l === "5" && !q.dev; })[0], I = k5 >= 0 ? [pts[k5][0] + 26, Math.min(pts[k5][1], y(rows[k5].hi)) - 15] : h5 && x(h5.t) > 16 ? [x(h5.t) + 26, y(h5.p) - 19] : null;
          if (I) fg.push(deg(I[0], I[1], "I"));
          if (farII) {
            var P2 = [A1[0] + (fx - fw - A1[0]) * 0.45, y(FT.two)];
            fg.push('<path class="st-arrow st-a-w st-far-w" d="M' + f(A1[0]) + " " + f(A1[1]) + "L" + f(P2[0]) + " " + f(P2[1]) + '" marker-end="url(#st-aw)"/>',
              deg(P2[0], P2[1] + 22, "II"), '<text class="st-zl" x="' + f(P2[0]) + '" y="' + f(P2[1] + 50) + '" text-anchor="middle">' + esc("≈ " + num(FT.two)) + "</text>");
            A1 = P2;
          } else fg.push(deg(A1[0] + (narrow ? 22 : 28) + 20, A1[1], "II"));   // neben dem Feld der Zone C, nicht über ihrer Beschriftung
        }
        fg.push('<path class="st-arrow st-far-a" d="M' + f(A1[0]) + " " + f(A1[1]) + "L" + f(fc) + " " + f(fyB + 8) + '" marker-end="url(#st-ah)"/>',
          FT.kind === "III" ? deg(fc, y(FT.ext.hi) - 18, "III") : '<g class="st-node st-ghost"><circle cx="' + f(fc) + '" cy="' + f(y(FT.ext.hi) - 17) + '" r="13"/><text x="' + f(fc) + '" y="' + f(y(FT.ext.hi) - 12.5) + '" text-anchor="middle" class="st-far-l">5</text></g>',
          '<text class="st-zl st-zl-t" x="' + f(fc - 24) + '" y="' + f(y(FT.ext.hi) - 13) + '" text-anchor="end">' + esc("Fernziel " + ft) + "</text>");
        g.push('<g class="st-far"' + dim("far") + ' opacity="' + fk.toFixed(2) + '">' + fg.join("") + "</g>");
      }
      /* Zeitreise: was danach geschah – Zone erreicht, Kursziel erreicht oder Zählung ungültig, am Kurs markiert */
      if (tm) {
        var at = function (dt) { var tt = T(dt), best = S[0]; S.forEach(function (q) { if (Math.abs(q.t - tt) < Math.abs(best.t - tt)) best = q; }); return best; };
        [["e", "st-mk-e", "Zone"], ["t", "st-mk-t", "Ziel erreicht"], ["x", "st-mk-x", "ungültig"]].forEach(function (m) {
          var dt = tm.o[m[0]]; if (!dt) return; if (m[0] === "x" && tm.o.t && tm.o.t <= dt) return; if (m[0] === "t" && tm.o.x && tm.o.x < dt) return;
          var q = at(dt), X = x(q.t), Y = y(q.c), up = m[0] !== "x" ? Y < y(close) : Y > y(close);
          g.push('<g class="st-mk ' + m[1] + '"><circle class="st-mk-r" cx="' + f(X) + '" cy="' + f(Y) + '" r="9"/><circle cx="' + f(X) + '" cy="' + f(Y) + '" r="4.5"/>' +
            '<text x="' + f(Math.min(X, plotR - 40)) + '" y="' + f(up ? Y - 16 : Y + 24) + '" text-anchor="middle">' + esc(m[2] + " · " + md(q.t)) + "</text></g>");
        });
      }
      /* Beschriftung der Ungültig-Linie dort, wo kein Kreis und kein Zielpunkt steht */
      if (invIn) {
        var iy = y(inv.p), itx = "ungültig " + (inv.d === "below" ? "unter " : "über ") + num(inv.p) + " $", iw = itx.length * 5.6;
        var free = function (x1, yy) { return !used.concat(nodes.map(function (n) { return [n.x, n.y]; })).some(function (u) { return u[0] > x1 - 14 && u[0] < x1 + iw + 14 && Math.abs(u[1] - yy) < 18; }); };
        var cand = [[8, iy - 6], [8, iy + 15], [Math.max(8, xNow * 0.45), iy - 6], [Math.max(8, xNow * 0.45), iy + 15], [xNow - iw - 8, iy - 6], [xNow - iw - 8, iy + 15]], pick = cand[0];
        for (var ci = 0; ci < cand.length; ci++) if (free(cand[ci][0], cand[ci][1])) { pick = cand[ci]; break; }
        g.push('<text class="st-inv-t"' + dim("inv") + ' x="' + f(pick[0]) + '" y="' + f(pick[1]) + '">' + esc(itx) + "</text>");
      }
      /* heute: Punkt mit Puls */
      if (live) g.push('<circle class="st-pulse" cx="' + xNow + '" cy="' + f(P0[1]) + '" r="5"/><circle class="st-dot" cx="' + xNow + '" cy="' + f(P0[1]) + '" r="4.5"/>');
      /* Achse rechts: Rasterzahlen, Kurs-Etikett, Ungültig-Etikett, ohne Überlappung */
      if (live) tags.push({ y: P0[1], t: num(close), c: "st-tag-p" });
      if (invIn) tags.push({ y: y(inv.p), t: num(inv.p), c: "st-tag-i" });
      tags.sort(function (p, q) { return p.y - q.y; }); for (var i2 = 1; i2 < tags.length; i2++) if (tags[i2].y - tags[i2 - 1].y < 22) tags[i2].y = tags[i2 - 1].y + 22;
      tk.forEach(function (v) { if (tags.every(function (t1) { return Math.abs(t1.y - y(v)) > 16; })) g.push('<text class="st-ax" x="' + (plotR + 6) + '" y="' + f(y(v) + 4) + '">' + esc(num(v)) + "</text>"); });
      tags.forEach(function (t1) { g.push('<g class="st-tag ' + t1.c + '"><rect x="' + (plotR + 2) + '" y="' + f(t1.y - 11) + '" width="' + (padR - 6) + '" height="22" rx="11"/><text x="' + f(plotR + 2 + (padR - 6) / 2) + '" y="' + f(t1.y + 4) + '" text-anchor="middle">' + esc(t1.t) + "</text></g>"); });
      /* Übersicht: ganze Historie seit Börsengang mit großem Gerüst; das helle Fenster ist der Ausschnitt oben, ziehen verschiebt seinen Beginn */
      var tA = S[0].t, oLo = Infinity, oHi = 0; S.forEach(function (p) { if (p.c < oLo) oLo = p.c; if (p.c > oHi) oHi = p.c; });
      function ox(t) { return 4 + (t - tA) / Math.max(DAY, tEnd - tA) * (plotR - 8); }
      function oy(v) { return oy0 + 10 + (Math.log(oHi) - Math.log(Math.max(v, oLo))) / Math.max(1e-9, Math.log(oHi) - Math.log(oLo)) * (OV - 20); }
      var ostep = Math.max(1, Math.floor(S.length / 360)), od = "";
      for (var oi = 0; oi < S.length; oi += ostep) od += (od ? "L" : "M") + f(ox(S[oi].t)) + " " + f(oy(S[oi].c));
      od += "L" + f(ox(tEnd)) + " " + f(oy(S[S.length - 1].c));
      var wx = ox(t0), wx2 = ox(t1v), bigO = pivots(td.primary, close, tC, "BIG");
      /* Zeitreise: jeder Stand ein Punkt (grün: Kursziel zuerst, grau: ungültig zuerst, weiß: offen), die grüne Linie ist der gewählte */
      var snapMarks = tm ? SN.snaps.map(function (q, i) { var v = verdict(q); return '<circle class="st-ov-s st-ov-' + v + '" cx="' + f(ox(T(q.a))) + '" cy="' + (oy0 + OV - 7) + '" r="' + (i === st.tm ? 4 : 2.4) + '"/>'; }).join("") +
        '<line class="st-ov-at" x1="' + f(ox(tC)) + '" x2="' + f(ox(tC)) + '" y1="' + (oy0 + 2) + '" y2="' + (oy0 + OV - 2) + '"/>' : "";
      g.push('<g class="st-ov"><rect class="st-ov-bg" x="0" y="' + oy0 + '" width="' + W + '" height="' + OV + '"/>' +
        '<path class="st-ov-p" d="' + od + '"/>' + (bigO.length > 1 ? '<path class="st-ov-sk" d="' + bigO.map(function (q, i) { return (i ? "L" : "M") + f(ox(q.t)) + " " + f(oy(q.p)); }).join("") + '"/>' : "") +
        bigO.filter(function (q) { return q.l && !q.dev; }).map(function (q) { return '<circle class="st-ov-n" cx="' + f(ox(q.t)) + '" cy="' + f(oy(q.p)) + '" r="2.6"/>'; }).join("") +
        '<rect class="st-ov-sh" x="0" y="' + oy0 + '" width="' + f(Math.max(0, wx)) + '" height="' + OV + '"/>' +
        (live ? "" : '<rect class="st-ov-sh" x="' + f(wx2) + '" y="' + oy0 + '" width="' + f(Math.max(0, plotR - wx2)) + '" height="' + OV + '"/>') +
        '<rect class="st-ov-w" x="' + f(wx) + '" y="' + (oy0 + 1) + '" width="' + f(Math.max(4, (live ? plotR - 3 : wx2) - wx)) + '" height="' + (OV - 2) + '" rx="8"/>' +
        '<rect class="st-ov-grip" x="' + f(wx - 3) + '" y="' + (oy0 + OV / 2 - 12) + '" width="6" height="24" rx="3"/>' +
        (live ? "" : '<rect class="st-ov-grip" x="' + f(wx2 - 3) + '" y="' + (oy0 + OV / 2 - 12) + '" width="6" height="24" rx="3"/>') +
        snapMarks + '<text class="st-ax" x="' + (plotR + 6) + '" y="' + (oy0 + OV / 2 - 2) + '">' + new Date(tA).getUTCFullYear() + '</text><text class="st-ax" x="' + (plotR + 6) + '" y="' + (oy0 + OV / 2 + 12) + '">bis heute</text></g>');
      g.push('<g class="st-scrub"></g>');
      return { svg: '<svg class="st-svg' + (st.intro ? " st-intro" : "") + (st.reveal ? " st-reveal" : "") + '" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Elliott-Wellen seit Börsengang mit Plan der Methode">' + g.join("") + "</svg>",
               geo: { far: FT, tV: t1v, live: live, plotR: plotR, tm: tm, tC: tC, xR: xR, P: { big: big, sub: sub }, oy0: oy0, OV: OV, tA: tA, ox0: 4, ow: plotR - 8, x: x, y: y, xNow: xNow, vis: vis, t0: t0, tEnd: tEnd, big: big, sub: sub, nodes: nodes, H: H, padT: padT, padB: padB, close: close } };
    }

    function verdict(q) { var o = q.o || {}; return o.t && (!o.x || o.t <= o.x) ? "t" : o.x ? "x" : "o"; }
    function tally() { var n = { t: 0, x: 0, o: 0 }; SN.snaps.forEach(function (q) { n[verdict(q)]++; }); return n; }
    function months(a0, b0) { var m = Math.max(1, Math.round((T(b0) - T(a0)) / (YEAR / 12))); return m === 1 ? "1 Monat" : m.toLocaleString("de-DE") + " Monaten"; }
    function head(V) {
      if (V.tm) {
        var q = V.tm, rT = V.rows.filter(function (r) { return r.role === "target"; })[0], v = verdict(q), W1 = words(), n = tally();
        var line = v === "t" ? "✓ " + W1.tShort + " erreicht im " + md(T(q.o.t)) + " (nach " + months(q.a, q.o.t) + ")" : v === "x" ? "✗ Zählung ungültig im " + md(T(q.o.x)) + " (nach " + months(q.a, q.o.x) + ")" : "○ offen: bisher weder " + W1.tShort + " noch ungültig";
        return '<div class="st-head"><div class="st-f1"><div class="st-kick">' + esc("Zeitreise · Stand " + md(T(q.a)) + " · Kurs damals " + num(q.c) + " $") + '</div><div class="st-big">' +
          esc(rT ? num(rT.lo) + "–" + num(rT.hi) + " $" : waveName(q.p.cur, "BIG") + " lief") + '</div><div class="st-sub st-v-' + v + '"><b>' + esc(line) + "</b></div></div>" +
          '<div class="st-tally" title="Alle Stände dieser Aktie, Forschung"><b>' + n.t + "</b><small>" + esc(W1.tShort) + "</small><b>" + n.x + "</b><small>ungültig</small><b>" + n.o + "</b><small>offen</small></div></div>";
      }
      var td = V.td, rows = V.rows, W0 = words(), e = rows.filter(function (r) { return r.role === "entry"; })[0], t = rows.filter(function (r) { return r.role === "target"; })[0], c = td.close;
      var sc = td0.score, scH = sc && isNum(sc.v) ? '<div class="st-score' + (sc.v >= 65 ? " st-score-up" : sc.v <= 35 ? " st-score-dn" : "") + '" title="Setup-Score"><b>' + sc.v + "</b><small>Score</small></div>" : "";
      var asOf = td0.asOf ? String(td0.asOf).slice(0, 10).split("-").reverse().join(".") : "", kick = esc((a.name ? a.name + " · Wellen seit " : "Elliott-Wellen seit ") + new Date(V.S[0].t).getUTCFullYear() + (asOf ? " · Wochenschluss " + asOf : ""));
      if (!t) return '<div class="st-head"><div class="st-f1"><div class="st-kick">' + kick + '</div><div class="st-big">' + esc(waveName(td.primary.cur, "BIG") + " läuft") + "</div></div>" + scH + "</div>";
      var sub = e ? '<span>' + esc("nach " + (e.step.dir === "DOWN" ? "Rücksetzer" : "Anstieg") + " bis " + num(e.lo) + "–" + num(e.hi) + " $") + "</span>" : "";
      return '<div class="st-head"><div class="st-f1"><div class="st-kick">' + kick + '</div><div class="st-big">' + esc(num(t.lo) + "–" + num(t.hi) + " $") + '</div><div class="st-sub"><b>' +
        esc(W0.tShort + " " + waveName(t.step.l, t.step.deg) + " · " + pct(t.step.dir === "UP" ? t.lo : t.hi, c)) + "</b>" + sub + "</div></div>" + scH + "</div>";
    }
    function story(V) {
      var td = V.td, rows = V.rows, p = td.primary, W0 = words(), c = td.close, y0 = new Date(V.S[0].t).getUTCFullYear(), out = [];
      var done = p.waves.filter(function (w) { return !w.dev; });
      var kind = p.kind === "IMPULSE" ? (p.dir === "UP" ? "einen Aufwärtsimpuls in fünf großen Wellen" : "einen Abwärtsimpuls in fünf großen Wellen") : "eine große Korrektur in drei Wellen A, B, C";
      out.push({ r: "all", f: "big,price", s: "Seit " + y0 + " zählt die Methode " + kind + ". Die Kreise markieren die Wendepunkte." });
      var best = done.slice().sort(function (u, v) { return Math.abs(Math.log(v.tp / v.fp)) - Math.abs(Math.log(u.tp / u.fp)); })[0];
      if (best) out.push({ r: "all", f: "wave:" + best.l + ",price", s: "Welle " + best.l + " war die stärkste: von " + num(best.fp) + " $ auf " + num(best.tp) + " $ (" + pct(best.tp, best.fp) + ")." });
      var e = rows.filter(function (r) { return r.role === "entry"; })[0], t = rows.filter(function (r) { return r.role === "target"; })[0];
      out.push({ r: "focus", f: "sub,price,entry,big", s: "Jetzt läuft " + waveName(p.cur, "BIG") + "." + (e ? " Laut Methode endet " + (e.step.dir === "DOWN" ? "der Rücksetzer" : "der Anstieg") + " bei " + num(e.lo) + "–" + num(e.hi) + " $ (" + pct(e.step.dir === "DOWN" ? e.hi : e.lo, c) + ")." : "") });
      var FT = farOf(V), yrs = FT ? Math.max(1, Math.round((V.S[V.S.length - 1].t - T(FT.since + "-06-30")) / YEAR)) : 0;
      if (t) out.push({ r: "focus", f: "target,entry,price", s: "Danach " + waveName(t.step.l, t.step.deg) + ": " + W0.tShort + " " + num(t.lo) + "–" + num(t.hi) + " $ (" + pct(t.step.dir === "UP" ? t.lo : t.hi, c) + "). Eine Zeit nennt die Methode nicht." });
      if (FT) out.push({ r: "focus", f: "far,target,price", far: 1, s: FT.kind === "III" ? "Das große Bild: Die Wellen 1 bis 5 seit " + FT.since + " bilden zusammen Welle I. Danach kommt die Korrektur II, meist in drei Schritten A-B-C" + (FT.twoFrom === "Zone C im Pfad" ? "; sie läuft gerade" : ", laut Methode bis etwa " + num(FT.two) + " $") + ". Dann folgt Welle III, oft der stärkste Anstieg: Fernziel " + num(FT.lo) + "–" + num(FT.hi) + " $ (" + pct(FT.lo, c) + "), erweitert bis " + num(FT.ext.hi) + " $. Welle I dauerte rund " + yrs + " Jahre."
        : "Das große Bild: Der Impuls seit " + FT.since + " läuft noch. Welle 5 schließt ihn ab, laut Methode bei " + num(FT.lo) + "–" + num(FT.hi) + " $ (" + pct(FT.lo, c) + "), erweitert bis " + num(FT.ext.hi) + " $. Danach wären die Wellen 1 bis 5 zusammen Welle I des nächsthöheren Grads." });
      if (p.inv) out.push({ r: "all", f: "inv,price,big", s: "Falsch ist die Zählung, wenn ein Wochenschluss " + (p.inv.d === "below" ? "unter " : "über ") + num(p.inv.p) + " $ liegt. Dann zählt die Methode neu." });
      return out;
    }

    var tween = null;
    function setRange(r, V, done) {
      var to = startFor(r, V.S), from = st.t0 == null ? to : st.t0, t1 = null; st.range = r; st.t1 = null; if (stage) stage.classList.remove("st-past");
      if (tween) cancelAnimationFrame(tween);
      var reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || from === to) { st.t0 = to; paint(true); if (done) done(); return; }
      function step(ts) { if (t1 == null) t1 = ts; var u = Math.min(1, (ts - t1) / 520), k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; st.t0 = from + (to - from) * k; paint(true); if (u < 1) tween = requestAnimationFrame(step); else { tween = null; if (done) done(); } }
      tween = requestAnimationFrame(step);
    }

    var geo = null, stage = null, svgBox = null, bub = null, timer = null;
    function paint(fast) {
      var V = view(), W = Math.max(320, Math.round(root.clientWidth || 390)), H = Math.round(Math.max(540, Math.min(780, (global.innerHeight || 844) - (opt.chrome || 64))));   // chrome: Höhe von Kopf- und Fußleiste der Seite
      if (st.t0 == null) st.t0 = startFor(st.range, V.S);
      var R = svgOf(V, W, H); geo = R.geo;
      if (!stage || !fast) build(V, W, H);
      svgBox.innerHTML = R.svg; st.intro = false;
    }
    function build(V, W, H) {
      var S = V.S, hasAlt = !!(td0.alternative && td0.altPath && td0.altPath.length);
      var seg = [["focus", "Aktuell"]].concat(startFor("focus", S) > S[0].t + YEAR ? [["all", "Seit " + new Date(S[0].t).getUTCFullYear()]] : []);
      var stories = story(V), on = st.story >= 0 ? stories[st.story] : null;
      root.innerHTML = '<div class="st' + (st.t1 != null ? " st-past" : "") + '" style="height:' + H + 'px">' + head(V) + '<div class="st-svgbox"></div><div class="st-bub" hidden></div><button type="button" class="st-back">Zurück zu heute →</button>' +
        (farOf(V) && !V.tm && st.story < 0 ? '<button type="button" class="st-farbtn" style="top:' + ((W < 560 ? 162 : 150) - 2) + 'px" aria-pressed="' + (st.farK > 0) + '">' + (st.farK > 0 ? "Nur kurzfristig" : "↑ Fernziel " + num(farOf(V).lo) + "–" + num(farOf(V).hi) + " $") + "</button>" : "") +
        (on ? '<div class="st-story" role="button" tabindex="0" aria-label="Weiter"><div class="st-bars">' + stories.map(function (_, i) { return '<i class="' + (i < st.story ? "done" : i === st.story ? "on" : "") + '"><b></b></i>'; }).join("") +
          '</div><p class="st-cap">' + esc(on.s) + '</p><p class="st-tap">Tippen für weiter · <button type="button" class="st-x">Beenden</button></p></div>'
          : '<div class="st-ctl"><div class="st-seg" role="group" aria-label="Zeitraum">' + seg.map(function (s) { return '<button type="button" data-r="' + s[0] + '" aria-pressed="' + (st.range === s[0]) + '">' + s[1] + "</button>"; }).join("") +
          '</div>' + (SN ? '<button type="button" class="st-tmb" aria-label="Zeitreise">⟲</button>' : "") + '<button type="button" class="st-play">▶ Erklären</button></div>') + "</div>" + facts(V, hasAlt);
      if (V.tm) root.innerHTML = '<div class="st" style="height:' + H + 'px">' + head(V) + '<div class="st-svgbox"></div><div class="st-bub" hidden></div>' +
        '<div class="st-ctl"><button type="button" class="st-nav" data-d="-1" aria-label="früherer Stand">‹</button><button type="button" class="st-nav st-run" aria-label="abspielen">' + (runT ? "❚❚" : "▶") + '</button><button type="button" class="st-nav" data-d="1" aria-label="späterer Stand">›</button>' +
        '<button type="button" class="st-play st-exit">Zurück zu heute</button></div></div>' +
        '<p class="st-note st-tmnote">Zeitreise: Jeder Punkt unten ist ein Quartalsstand. Die Zählung ist nur mit den Kursen bis zu diesem Tag gerechnet; die blasse Linie danach zeigt, was wirklich geschah. Ziehen Sie unten über die Punkte. Forschung, nicht zertifiziert; Einzelwerte ohne Vergleich mit dem Zufall.</p>';
      stage = root.querySelector(".st"); svgBox = root.querySelector(".st-svgbox"); bub = root.querySelector(".st-bub");
      var tmb = root.querySelector(".st-tmb"); if (tmb) tmb.addEventListener("click", function () { var Wk = SN.snaps, k = Wk.length - 1, lim = T(Wk[Wk.length - 1].a) - 2 * YEAR; while (k > 0 && T(Wk[k].a) > lim) k--; enterTm(k); });
      root.querySelectorAll(".st-nav[data-d]").forEach(function (bt) { bt.addEventListener("click", function () { halt(); snap(st.tm + Number(bt.getAttribute("data-d"))); }); });
      var run = root.querySelector(".st-run"); if (run) run.addEventListener("click", function () { if (runT) halt(); else { if (st.tm >= SN.snaps.length - 1) snap(0); runT = setInterval(function () { if (st.tm >= SN.snaps.length - 1) halt(); else snap(st.tm + 1); }, 1150); run.textContent = "❚❚"; } });
      var ex = root.querySelector(".st-exit"); if (ex) ex.addEventListener("click", function () { halt(); st.tm = null; st.t0 = null; st.reveal = false; st.intro = true; stage = null; paint(); });
      root.querySelectorAll(".st-seg button").forEach(function (bt) { bt.addEventListener("click", function () { root.querySelectorAll(".st-seg button").forEach(function (o) { o.setAttribute("aria-pressed", String(o === bt)); }); setRange(bt.getAttribute("data-r"), view()); }); });
      var play = root.querySelector(".st-play"); if (play) play.addEventListener("click", function () { go(0); });
      var sb = root.querySelector(".st-story"); if (sb) {
        sb.addEventListener("click", function (ev) { if (ev.target.classList.contains("st-x")) { stop(); return; } go(st.story + 1); });
        sb.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(st.story + 1); } if (ev.key === "Escape") stop(); });
      }
      root.querySelectorAll(".st-which button").forEach(function (bt) { bt.addEventListener("click", function () { st.which = bt.getAttribute("data-w"); st.intro = true; paint(); }); });
      /* Gesten: ein Finger = Lupe (Datum, Kurs, Welle), zwei Finger = Zoom, Doppeltipp = hinein bzw. zurück, Mausrad = Zoom */
      var ptr = {}, pinch = null, lastTap = 0;
      var pts2 = function () { return Object.keys(ptr).map(function (k) { return ptr[k]; }); };
      svgBox.addEventListener("pointerdown", function (ev) {
        ptr[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
        if (inOv(ev)) { drag = true; try { svgBox.setPointerCapture(ev.pointerId); } catch (e) { } ov(ev, true); return; }
        var P2 = pts2();
        if (P2.length === 2 && geo && st.story < 0) { var r0 = svgBox.getBoundingClientRect(); pinch = { d: Math.abs(P2[0].x - P2[1].x) + 1, c: (P2[0].x + P2[1].x) / 2 - r0.left, a0: st.t0, a1: geo.tV }; unscrub(); return; }
        var now0 = Date.now(); if (ev.pointerType !== "mouse" && now0 - lastTap < 300) { dbl(ev); lastTap = 0; return; } lastTap = now0;
        scrub(ev);
      });
      svgBox.addEventListener("pointermove", function (ev) {
        if (ptr[ev.pointerId]) ptr[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
        if (drag) { ov(ev); return; }
        if (pinch) { var P2 = pts2(); if (P2.length < 2) return; var d = Math.abs(P2[0].x - P2[1].x) + 1, k = pinch.d / d, G = geo, f0 = Math.max(0, Math.min(1, (pinch.c - 2) / (G.xR - 2))), sp = (pinch.a1 - pinch.a0) * k, tc = pinch.a0 + f0 * (pinch.a1 - pinch.a0); zoomTo(tc - f0 * sp, tc - f0 * sp + sp); return; }
        if (inOv(ev)) { unscrub(); return; } if (ev.buttons || ev.pointerType === "mouse") scrub(ev);
      });
      var lift = function (ev) { delete ptr[ev.pointerId]; if (pts2().length < 2) pinch = null; };
      svgBox.addEventListener("pointercancel", function (ev) { drag = false; lift(ev); }); svgBox.addEventListener("lostpointercapture", function () { drag = false; });
      svgBox.addEventListener("wheel", function (ev) { if (!geo || st.story >= 0) return; ev.preventDefault(); var r0 = svgBox.getBoundingClientRect(); zoomAt(ev.clientX - r0.left, Math.exp(ev.deltaY * 0.0015)); }, { passive: false });
      svgBox.addEventListener("dblclick", function (ev) { dbl(ev); });
      function dbl(ev) { if (!geo || st.story >= 0) return; var r0 = svgBox.getBoundingClientRect(), S = view().S, full = S[S.length - 1].t - S[0].t; if (st.t1 != null || geo.tV - st.t0 < 1.2 * YEAR) setRange("focus", view()); else zoomAt(ev.clientX - r0.left, 0.4); }
      var fb = root.querySelector(".st-farbtn"); if (fb) fb.addEventListener("click", function () {
        var to = st.farK > 0 ? 0 : 1, from = st.farK, t1 = null, reduce = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (st.t1 != null) { st.t1 = null; st.t0 = startFor("focus", view().S); stage.classList.remove("st-past"); }
        fb.setAttribute("aria-pressed", String(to > 0)); fb.textContent = to > 0 ? "Nur kurzfristig" : "↑ Fernziel " + num(farOf(view()).lo) + "–" + num(farOf(view()).hi) + " $";
        if (reduce) { st.farK = to; paint(true); return; }
        var stp = function (ts) { if (t1 == null) t1 = ts; var u = Math.min(1, (ts - t1) / 700), k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; st.farK = from + (to - from) * k; paint(true); if (u < 1) requestAnimationFrame(stp); };
        requestAnimationFrame(stp);
      });
      var back = root.querySelector(".st-back"); if (back) back.addEventListener("click", function () { setRange("focus", view()); });
      svgBox.addEventListener("pointerleave", unscrub); svgBox.addEventListener("pointerup", function (ev) { lift(ev); if (drag) { drag = false; return; } if (ev.pointerType !== "mouse") setTimeout(unscrub, 1600); });
    }
    var runT = null;
    function halt() { if (runT) { clearInterval(runT); runT = null; var r0 = root.querySelector(".st-run"); if (r0) r0.textContent = "▶"; } }
    function enterTm(k) { st.tm = null; st.story = -1; st.focus = null; snap(k, true); }
    /* Stand wechseln: Ausschnitt 4 Jahre vor dem Stand bis heute, Kopf neu, die Linie danach zeichnet sich neu */
    function snap(k, rebuild) {
      k = Math.max(0, Math.min(SN.snaps.length - 1, k)); var was = st.tm; st.tm = k; st.reveal = true;
      var V = view(); st.t0 = Math.max(V.S[0].t, T(V.tm.a) - 4 * YEAR);
      if (rebuild || was == null || !stage) { stage = null; paint(); } else { paint(true); var h0 = root.querySelector(".st-head"); if (h0) h0.outerHTML = head(V); }
      st.reveal = false;
    }
    function go(i) {
      var V = view(), stories = story(V); clearTimeout(timer);
      if (i >= stories.length) { stop(); return; }
      st.story = i; var s = stories[i]; st.focus = s.f.split(","); st.farK = s.far ? 1 : 0;
      stage = null; setRange(s.r, V);
      timer = setTimeout(function () { go(st.story + 1); }, 5200);
    }
    function stop() { clearTimeout(timer); st.story = -1; st.focus = null; st.farK = farOf(view()) ? 1 : 0; stage = null; setRange("all", view()); }
    var drag = false;
    function inOv(ev) { if (!geo || st.story >= 0) return false; var r = svgBox.getBoundingClientRect(), my = ev.clientY - r.top; return my >= geo.oy0 - 6 && my <= geo.oy0 + geo.OV + 6; }
    /* Übersicht ziehen: der Finger setzt den Beginn des Ausschnitts (rechts bleibt immer heute) */
    /* Übersicht: linke oder rechte Kante zieht den Ausschnitt auf, das Fenster selbst verschiebt ihn, ein Tipp daneben springt dorthin */
    var ovMode = null, ovOff = 0;
    function ov(ev, start) {
      var r = svgBox.getBoundingClientRect(), G = geo, mx = ev.clientX - r.left, S = view().S, tEnd = S[S.length - 1].t;
      var tAt = function (px0) { return G.tA + Math.max(0, Math.min(1, (px0 - G.ox0) / G.ow)) * (tEnd - G.tA); }, oxOf = function (t) { return G.ox0 + (t - G.tA) / (tEnd - G.tA) * G.ow; };
      if (G.tm) { var tt = tAt(mx), kb = 0; SN.snaps.forEach(function (q, i) { if (Math.abs(T(q.a) - tt) < Math.abs(T(SN.snaps[kb].a) - tt)) kb = i; }); halt(); if (kb !== st.tm) snap(kb); return; }
      var a0 = st.t0, a1 = st.t1 == null ? tEnd : st.t1, span = a1 - a0;
      if (start) {
        var xl = oxOf(a0), xr = oxOf(a1);
        ovMode = Math.abs(mx - xl) < 16 ? "l" : st.t1 != null && Math.abs(mx - xr) < 16 ? "r" : mx > xl && mx < xr ? "pan" : "jump";
        ovOff = tAt(mx) - a0;
        if (ovMode === "jump") { ovMode = "pan"; ovOff = span / 2; }
      }
      if (ovMode === "l") zoomTo(Math.min(tAt(mx), a1 - 0.6 * YEAR), a1);
      else if (ovMode === "r") zoomTo(a0, Math.max(tAt(mx), a0 + 0.6 * YEAR));
      else { var n0 = Math.max(G.tA, Math.min(tEnd - span, tAt(mx) - ovOff)); zoomTo(n0, n0 + span); }
    }
    /* Zoom: Ausschnitt setzen; reicht er bis heute, gilt er als „live“ (mit Plan), sonst Geschichte mit „→ heute“ */
    function zoomTo(n0, n1) {
      var S = view().S, tA = S[0].t, tEnd = S[S.length - 1].t, span = Math.max(0.6 * YEAR, Math.min(tEnd - tA, n1 - n0));
      if (n1 > tEnd - 0.04 * span) { n1 = tEnd; n0 = tEnd - span; }
      n0 = Math.max(tA, n0); n1 = Math.min(tEnd, Math.max(n0 + 0.6 * YEAR, n1));
      st.t0 = n0; st.t1 = n1 >= tEnd ? null : n1; st.range = "custom"; unscrub();
      root.querySelectorAll(".st-seg button").forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
      if (stage) stage.classList.toggle("st-past", st.t1 != null);
      paint(true);
    }
    function zoomAt(px0, k) {
      var G = geo, a0 = st.t0, a1 = G.tV, f0 = Math.max(0, Math.min(1, (px0 - 2) / (G.xR - 2))), tc = a0 + f0 * (a1 - a0), sp = (a1 - a0) * k;
      zoomTo(tc - f0 * sp, tc - f0 * sp + sp);
    }
    function unscrub() { if (!geo) return; var g = svgBox.querySelector(".st-scrub"); if (g) g.innerHTML = ""; bub.hidden = true; }
    var lastWave = null, lastPad = null;
    /* Rechenweg: welches Wellenstück die Methode misst (Bezugsstrecke) und welche Fibonacci-Verhältnisse die Zonenkanten ergeben */
    var REF = { W2_RETRACE: [0, "1"], W3_PROJECT: [0, "1"], W5_PROJECT: [0, "1"], W4_RETRACE: ["2", "3"], W5_NET13: [0, "3"], A_RETRACE: [0, "5"], B_RETRACE: [0, "A"], C_PROJECT: [0, "A"] };
    function measure(G, R0, cx) {
      var out = "", z = (R0.zones || [])[0], up = R0.step.dir === "UP", fr = function (v) { return String(v).replace(".", ","); };
      var hw = (svgBox.clientWidth || 390) < 560 ? 22 : 28, ym = (G.y(R0.lo) + G.y(R0.hi)) / 2;
      var tier = R0.step.tiers.filter(function (q) { return !q.done; })[0] || R0.step.tiers[0];
      if (tier && tier.r && tier.r.length === 2) {
        var rLo = up ? tier.r[0] : tier.r[1], rHi = up ? tier.r[1] : tier.r[0];
        out += '<g class="st-ms-r"><text x="' + f(cx - hw - 5) + '" y="' + f(G.y(R0.hi) + 4) + '" text-anchor="end">' + esc(fr(rHi)) + '</text><text x="' + f(cx - hw - 5) + '" y="' + f(G.y(R0.lo) + 4) + '" text-anchor="end">' + esc(fr(rLo)) + "</text></g>";
      }
      var m = REF[R0.step.rel], P = R0.step.deg === "SUB" || R0.step.rel === "C_PROJECT" ? G.P.sub : G.P.big;
      if (m && P.length) {
        var find = function (l) { for (var i = 0; i < P.length; i++) if (P[i].l === l && !P[i].dev) return P[i]; return null; };
        var A0 = m[0] === 0 ? P[0] : find(m[0]), B0 = find(m[1]);
        if (A0 && B0 && B0.t >= G.t0) {
          var cl = function (v) { return Math.max(G.padT, Math.min(G.H - G.padB, v)); }, xa = Math.max(2, G.x(A0.t)), xb = G.x(B0.t), ya = cl(G.y(A0.p)), yb = cl(G.y(B0.p)), bx = Math.min(G.xNow - 6, xb + 12);
          out += '<g class="st-ms"><path class="st-ms-leg" d="M' + f(xa) + " " + f(ya) + "L" + f(xb) + " " + f(yb) + '"/>' +
            '<line class="st-ms-b" x1="' + f(bx) + '" x2="' + f(bx) + '" y1="' + f(ya) + '" y2="' + f(yb) + '"/><line class="st-ms-b" x1="' + f(bx - 5) + '" x2="' + f(bx + 5) + '" y1="' + f(ya) + '" y2="' + f(ya) + '"/><line class="st-ms-b" x1="' + f(bx - 5) + '" x2="' + f(bx + 5) + '" y1="' + f(yb) + '" y2="' + f(yb) + '"/>' +
            '<path class="st-ms-c" d="M' + f(bx) + " " + f(yb) + "L" + f(cx - hw) + " " + f(ym) + '"/>' +
            '<text x="' + f(bx - 8) + '" y="' + f((ya + yb) / 2) + '" text-anchor="end">' + esc("Bezug " + (m[0] === 0 ? "Start" : m[0]) + "–" + m[1]) + "</text></g>";
        }
      }
      return out;
    }
    function scrub(ev) {
      if (!geo || st.story >= 0) return;
      var r = svgBox.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, G = geo, txt = "", lx = mx, ly = G.padT - 4, gl = "";
      var nb = null, dmin = 26; G.nodes.forEach(function (n) { var dd = Math.hypot(n.x - mx, n.y - my); if (dd < dmin) { dmin = dd; nb = n; } });
      if (nb && nb.q) { var w = nb.q.w; txt = "<b>Welle " + esc(w.l) + "</b> · " + esc(md(T(w.ft)) + " – " + md(T(w.tt))) + "<br>" + esc(num(w.fp) + " → " + num(w.tp) + " $ (" + pct(w.tp, w.fp) + ")"); lx = nb.x; ly = nb.y - 20; }
      else if (mx > G.xNow + 6 && !G.tm) {
        var best = null; G.nodes.forEach(function (n) { if (n.row && (!best || Math.abs(n.x - mx) < Math.abs(best.x - mx))) best = n; });
        if (best) { var R0 = best.row, W0 = words(), nm = R0.role === "target" ? W0.tShort : R0.role === "entry" ? W0.eShort : "Zwischenschritt", rel = R0.step.rel, RL = (b.REL || {})[rel];
          txt = "<b>" + esc(waveName(R0.step.l, R0.step.deg)) + "</b> · " + esc(nm) + "<br>" + esc(num(R0.lo) + "–" + num(R0.hi) + " $ (" + pct(R0.step.dir === "UP" ? R0.lo : R0.hi, G.close) + ")") + (RL ? '<br><small>' + esc(RL) + "</small>" : "");
          lx = best.x; ly = Math.min(best.y, G.y(R0.hi)) - 30; gl = measure(G, R0, best.x);
          if (best !== lastPad && global.navigator && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { } } lastPad = best; }
      } else {
        var t = G.t0 + (mx - 2) / (G.xR - 2) * (G.tV - G.t0), p = G.vis[0];
        G.vis.forEach(function (q) { if (Math.abs(q.t - t) < Math.abs(p.t - t)) p = q; });
        var inW = function (P) { for (var i = 1; i < P.length; i++) if (p.t > P[i - 1].t && p.t <= P[i].t && P[i].l) return P[i]; return null; };
        var wb = inW(G.big), ws = inW(G.sub);
        if (p.t > G.tC) wb = ws = null;
        txt = "<b>" + esc(num(p.c) + " $") + "</b> · " + esc(md(p.t)) + (wb ? "<br>" + esc("in Welle " + wb.l + (ws ? " · darin (" + ws.l + ")" : "")) : p.t > G.tC ? "<br>danach" : "");
        var wk = (wb ? wb.l : "") + "/" + (ws ? ws.l : ""); if (wk !== lastWave && lastWave !== null && global.navigator && navigator.vibrate) { try { navigator.vibrate(6); } catch (e) { } } lastWave = wk;
        var X = G.x(p.t), Y = G.y(p.c); gl = '<line x1="' + f(X) + '" x2="' + f(X) + '" y1="' + G.padT + '" y2="' + (G.H - G.padB) + '"/><circle cx="' + f(X) + '" cy="' + f(Y) + '" r="5"/>'; lx = X; ly = Math.min(Y, G.padT + 40) - 30;
      }
      var sg = svgBox.querySelector(".st-scrub"); if (sg) sg.innerHTML = gl;
      if (!txt) { bub.hidden = true; return; }
      bub.innerHTML = txt; bub.hidden = false;
      var bw = bub.offsetWidth || 180; bub.style.left = Math.max(bw / 2 + 6, Math.min(r.width - bw / 2 - 6, lx)) + "px"; bub.style.top = Math.max(6, ly - (bub.offsetHeight || 44)) + "px";
    }
    function facts(V, hasAlt) {
      var td = V.td, rows = V.rows, W0 = words(), e = rows.filter(function (r) { return r.role === "entry"; })[0], t = rows.filter(function (r) { return r.role === "target"; })[0], inv = td.primary.inv, c = td.close;
      var cell = function (k, v, s, cls) { return '<div class="st-c ' + (cls || "") + '"><span>' + esc(k) + "</span><b>" + esc(v) + "</b>" + (s ? "<small>" + esc(s) + "</small>" : "") + "</div>"; };
      var cur = td.primary.waves.filter(function (w) { return w.dev; })[0];
      return '<div class="st-facts">' + cell("Jetzt", num(c) + " $", cur ? "Welle " + cur.l + " läuft" : "") +
        (t ? cell(W0.tShort, num(t.lo) + "–" + num(t.hi) + " $", pct(t.step.dir === "UP" ? t.lo : t.hi, c) + " · " + waveName(t.step.l, t.step.deg), "st-c-t") : "") +
        (e ? cell(W0.eShort, num(e.lo) + "–" + num(e.hi) + " $", pct(e.step.dir === "DOWN" ? e.hi : e.lo, c) + " · " + waveName(e.step.l, e.step.deg)) : "") +
        (inv ? cell("Ungültig", (inv.d === "below" ? "unter " : "über ") + num(inv.p) + " $", "Wochenschluss") : "") +
        (function () { var FT = farOf(V); return FT ? '<div class="st-c st-c-far"><span>Fernziel der Methode · ' + esc(FT.kind === "III" ? "Welle III" : "Ende Welle 5") + "</span><b>" + esc(num(FT.lo) + "–" + num(FT.hi) + " $") + "</b><small>" +
          esc(pct(FT.lo, c) + " bis " + pct(FT.hi, c) + " · erweitert bis " + num(FT.ext.hi) + " $ (" + pct(FT.ext.hi, c) + ") · ohne Zeitangabe") + "</small><small>" + esc(FT.assume + ". " + FT.rule + ".") + "</small></div>" : ""; })() + "</div>" +
        (hasAlt ? '<div class="st-which" role="group" aria-label="Zählung"><button type="button" data-w="main" aria-pressed="' + (st.which === "main") + '">Hauptzählung</button><button type="button" data-w="alt" aria-pressed="' + (st.which === "alt") + '">Alternative</button></div>' : "") +
        '<div class="st-key"><span><i class="st-k-n">3</i>große Welle</span><span><i class="st-k-s">(c)</i>Unterwelle</span><span><i class="st-k-t"></i>' + esc(W0.tShort) + '</span><span><i class="st-k-e"></i>' + esc(W0.eShort) + '</span><span><i class="st-k-i"></i>ungültig</span></div>' +
        '<p class="st-note">Zählung von oben auf Wochen- und Monatsschlusskursen nach Frost &amp; Prechter, Elliott Wave Principle. Zonen ohne Zeitangabe, keine Wahrscheinlichkeit. Analyse nach einer Methode, keine Anlageberatung.</p>';
    }
    paint();
    var rt = null; global.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (root.isConnected) { stage = null; paint(); } }, 180); });
    return root;
  }
  var api = { mount: mount, seriesOf: seriesOf };
  global.VUElliottStage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
