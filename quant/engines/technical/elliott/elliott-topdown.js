/* =========================================================================
   VISION UNIVERSE TECHNICAL — elliott/elliott-topdown.js
   ELLIOTT VON OBEN (Owner 23.11.2026): Zaehlung des grossen Grades ueber die ganze Historie, dann der laufenden Welle,
   und der Pfad der Methode (Korrekturzone → naechste Impulszone → Ende der grossen Welle).

   Warum ein eigenes Modul: elliott-v3.js sucht von unten in einem Fenster von 3 Jahren das rechnerisch beste Muster, das JETZT
   endet. Menschliche Analysten (Frost & Prechter, Elliott Wave Principle, Kap. 1–4; Praxis z. B. HKCM) zaehlen von oben:
   zuerst die grossen Wendepunkte seit Beginn der Kursreihe, dann die Unterteilung der laufenden Welle. Dieses Modul macht genau
   das, auf Wochenschlusskursen seit Handelsbeginn (quant/data/market/discover-series-long).

   1. WENDEPUNKTE. ZigZag auf log-Schlusskursen mit Schwelle θ (prozentual, preisinvariant). Mehrere Schwellen; jede ergibt
      eine Folge grosser Wendepunkte, der letzte ist das laufende Extrem.
   2. ZAEHLUNG. Fuer jeden moeglichen Ursprung (ein Wendepunkt) werden die Wendepunkte bis heute als Elliott-Folge gelesen:
      Impuls 1-2-3-4-5 (Motivwelle = 1 Abschnitt, Korrekturwelle = 1 oder 3 Abschnitte), danach Korrektur A-B-C, oder eine
      Korrektur A-B-C ab einem Extrem. Harte Regeln (EWP Kap. 1): Welle 2 nicht jenseits des Ursprungs von Welle 1, Welle 3 nie die
      kuerzeste, Welle 4 nicht im Gebiet von Welle 1, Welle 3 uebersteigt das Ende von Welle 1; eine laufende Welle verletzt eine Regel
      schon dann, wenn ihr bisheriges Extrem sie bricht. Richtlinien (EWP Kap. 4) bewerten: Ruecklauf Welle 2 (50–78,6 %), Welle 3
      mindestens 1,618 × Welle 1, Ruecklauf Welle 4 (23,6–50 %), Welle B und C einer Korrektur.
   3. GRAD. Bevorzugt wird ein Ursprung, der das Extrem der ganzen Reihe ist (Allzeittief bzw. -hoch), und die groessere
      Abdeckung. Ein Ursprung vor Handelsbeginn ist nicht pruefbar und wird nicht angenommen.
   4. UNTERTEILUNG. Dieselbe Lesung auf der laufenden grossen Welle mit feineren Schwellen.
   5. PFAD. Zonen aus den Verhaeltnissen der Literatur (elliott-projection.js#LADDERS und die Ruecklaeufe unten), je Schritt eine
      Zone; Anker eines kuenftigen Schritts ist die Mitte der Zone davor (vorlaeufig). Keine Zeitangabe, keine Wahrscheinlichkeit.
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "elliott-topdown-1.0.0";
  var EWP = "Frost & Prechter, Elliott Wave Principle";
  var THRESHOLDS = [1.0, 0.8, 0.65, 0.5];          // grosser Grad: log-Schwellen (≈ +172 %/−63 %, +123 %/−55 %, +92 %/−48 %, +65 %/−39 %)
  var SUB_THRESHOLDS = [0.4, 0.3, 0.22, 0.16, 0.11];

  /* Ruecklaeufe der Korrekturwellen und Projektionen der Motivwellen: [Stufe, von, bis, Beziehung] (Verhaeltnis × Referenzlaenge). */
  var RELATIONS = {
    W2_RETRACE: { source: EWP, locator: "Kap. 4, Retracements; Kap. 2, Depth of Corrective Waves", text: "Welle 2 läuft 50–78,6 % von Welle 1 zurück, selten bis 88,6 %" },
    W3_PROJECT: { source: EWP, locator: "Kap. 4, Ratio Analysis (Multiples)", text: "Welle 3 = 1,618–2,618 × Welle 1 ab Ende Welle 2, mindestens 1,0 ×" },
    W4_RETRACE: { source: EWP, locator: "Kap. 4, Retracements; Kap. 2, Depth of Corrective Waves", text: "Welle 4 läuft 23,6–38,2 % von Welle 3 zurück, selten bis 50 %" },
    W5_PROJECT: { source: EWP, locator: "Kap. 4, Ratio Analysis; Kap. 2, Wave Equality", text: "Welle 5 = 0,618–1,0 × Welle 1 ab Ende Welle 4, verlängert bis 1,618 ×" },
    A_RETRACE: { source: EWP, locator: "Kap. 4, Retracements", text: "Die Korrektur nach einem Impuls läuft 38,2–61,8 % des Impulses zurück" },
    B_RETRACE: { source: EWP, locator: "Kap. 1, Zigzags and Flats; Kap. 4", text: "Welle B läuft 38,2–78,6 % von Welle A zurück (Zickzack), in einer Flat 90–100 %" },
    C_PROJECT: { source: EWP, locator: "Kap. 4, Ratio Analysis (Zigzags)", text: "Welle C = 0,618–1,618 × Welle A ab Ende Welle B" },
    NEXT_IMPULSE: { source: EWP, locator: "Kap. 1 (nach der Korrektur setzt der Trend des höheren Grades fort); Kap. 4", text: "Nach beendeter Korrektur läuft der Kurs 0,618–1,0 × ihrer Länge zurück, verlängert bis 1,618 ×" }
  };
  var LADDER = {
    "2": { ref: "prev", dir: -1, rel: "W2_RETRACE", tiers: [["BASE", 0.5, 0.618], ["EXTENDED", 0.618, 0.786], ["EXTREME", 0.786, 0.886]] },
    "3": { ref: "w1", dir: 1, rel: "W3_PROJECT", tiers: [["BASE", 1.0, 1.618], ["EXTENDED", 1.618, 2.618]] },
    "4": { ref: "prev", dir: -1, rel: "W4_RETRACE", tiers: [["BASE", 0.236, 0.382], ["EXTENDED", 0.382, 0.5]] },
    "5": { ref: "w1", dir: 1, rel: "W5_PROJECT", tiers: [["BASE", 0.618, 1.0], ["EXTENDED", 1.0, 1.618]] },
    "A": { ref: "impulse", dir: -1, rel: "A_RETRACE", tiers: [["BASE", 0.382, 0.5], ["EXTENDED", 0.5, 0.618]] },
    "B": { ref: "prev", dir: -1, rel: "B_RETRACE", tiers: [["BASE", 0.382, 0.618], ["EXTENDED", 0.618, 0.786]] },
    "C": { ref: "a", dir: 1, rel: "C_PROJECT", tiers: [["BASE", 0.618, 1.0], ["EXTENDED", 1.0, 1.618]] },
    "1": { ref: "corr", dir: 1, rel: "NEXT_IMPULSE", tiers: [["BASE", 0.618, 1.0], ["EXTENDED", 1.0, 1.618]] }
  };
  var MOTIVE_SEQ = ["1", "2", "3", "4", "5", "A", "B", "C"];
  var CORR_SEQ = ["A", "B", "C"];

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function round(v, d) { var m = Math.pow(10, d === undefined ? 4 : d); return Math.round(v * m) / m; }
  function band(x, ideal, ok) { return x >= ideal[0] && x <= ideal[1] ? 1 : x >= ok[0] && x <= ok[1] ? 0.6 : 0.25; }

  /* ---------------------------------------------------------- 1. Wendepunkte (log-ZigZag, kausal bis asOf) */
  function zigzag(close, th, asOf) {
    var n = isNum(asOf) ? asOf + 1 : close.length, L = [], i;
    for (i = 0; i < n; i++) L.push(Math.log(close[i]));
    var piv = [{ i: 0 }], dir = 0, ext = 0;
    for (i = 1; i < n; i++) {
      if (dir === 0) { if (L[i] - L[0] >= th) { dir = 1; ext = i; } else if (L[0] - L[i] >= th) { dir = -1; ext = i; } continue; }
      if (dir > 0) { if (L[i] > L[ext]) ext = i; else if (L[ext] - L[i] >= th) { piv.push({ i: ext }); dir = -1; ext = i; } }
      else { if (L[i] < L[ext]) ext = i; else if (L[i] - L[ext] >= th) { piv.push({ i: ext }); dir = 1; ext = i; } }
    }
    if (ext > 0) piv.push({ i: ext, dev: true });
    /* Ursprung = Extrem des ersten Abschnitts (Tief vor dem ersten Hoch bzw. Hoch vor dem ersten Tief), nicht der erste Kurs. */
    if (piv.length >= 2) {
      var up = close[piv[1].i] > close[0], o = 0;
      for (i = 0; i < piv[1].i; i++) if (up ? close[i] < close[o] : close[i] > close[o]) o = i;
      piv[0] = { i: o };
    }
    return piv;
  }

  /* ---------------------------------------------------------- 2. Zaehlung auf einer Wendepunktfolge */
  /* waves: [{ label, a, b }] mit a/b = Indizes in pts; pts[k] = { i, p, dev }. Prueft Regeln und Richtlinien eines Impulses. */
  function len(w, pts) { return Math.abs(pts[w.b].p - pts[w.a].p); }
  function checkImpulse(ws, pts, s, done) {
    var P = function (k) { return pts[k].p; }, rules = [], g = [], dev = pts[ws[ws.length - 1].b].dev;
    function R(id, ok, text) { rules.push({ id: id, passed: ok, text: text }); return ok; }
    var w = {}; ws.forEach(function (x) { w[x.label] = x; });
    if (w["2"]) {
      if (!R("W2_NOT_BEYOND_W1_ORIGIN", s * (P(w["2"].b) - P(w["1"].a)) > 0, "Welle 2 läuft nie über den Ursprung von Welle 1 hinaus")) return null;
      g.push(band(len(w["2"], pts) / len(w["1"], pts), [0.5, 0.786], [0.382, 0.886]));
    }
    if (w["3"]) {
      var l3 = len(w["3"], pts), l1 = len(w["1"], pts);
      var c3 = !(pts[w["3"].b].dev && !done);
      if (c3 && !R("W3_BEYOND_W1_END", s * (P(w["3"].b) - P(w["1"].b)) > 0, "Welle 3 übersteigt das Ende von Welle 1")) return null;
      if (c3) g.push(l3 / l1 >= 1.618 ? 1 : l3 / l1 >= 1 ? 0.7 : 0.35);
    }
    if (w["4"]) {
      if (!R("W4_NOT_IN_W1_TERRITORY", s * (P(w["4"].b) - P(w["1"].b)) > 0, "Welle 4 fällt nicht in das Kursgebiet von Welle 1")) return null;
      g.push(band(len(w["4"], pts) / len(w["3"], pts), [0.236, 0.5], [0.14, 0.618]));
    }
    if (w["5"]) {
      var l5 = len(w["5"], pts), five = !(pts[w["5"].b].dev && !done);
      if (five && !R("W3_NEVER_SHORTEST", !(len(w["3"], pts) < len(w["1"], pts) && len(w["3"], pts) < l5), "Welle 3 ist nie die kürzeste der Wellen 1, 3, 5")) return null;
      if (five) g.push(band(l5 / len(w["1"], pts), [0.618, 1.618], [0.382, 2.618]));
    }
    if (w["A"]) {
      var imp = Math.abs(P(w["5"].b) - P(w["1"].a));
      g.push(band(len(w["A"], pts) / imp, [0.236, 0.618], [0.14, 0.786]));
    }
    if (w["B"]) {
      var rb = len(w["B"], pts) / len(w["A"], pts);
      if (!R("B_NOT_BEYOND_138", rb < 1.382 || pts[w["B"].b].dev, "Welle B läuft höchstens 138,2 % von Welle A zurück (erweiterte Flat)")) return null;
      g.push(band(rb, [0.382, 1.0], [0.236, 1.382]));
    }
    if (w["C"] && !pts[w["C"].b].dev) g.push(band(len(w["C"], pts) / len(w["A"], pts), [0.618, 1.618], [0.382, 2.618]));
    return { rules: rules, guide: g.length ? g.reduce(function (a, b) { return a + b; }, 0) / g.length : ws.length < 2 ? 0.4 : 0.6 };
  }
  function checkCorrection(ws, pts, s) {
    var rules = [], g = [], w = {}; ws.forEach(function (x) { w[x.label] = x; });
    if (w["B"]) {
      var rb = len(w["B"], pts) / len(w["A"], pts);
      if (!(rb < 1.382 || pts[w["B"].b].dev)) return null;
      rules.push({ id: "B_NOT_BEYOND_138", passed: true, text: "Welle B läuft höchstens 138,2 % von Welle A zurück (erweiterte Flat)" });
      g.push(band(rb, [0.382, 1.0], [0.236, 1.382]));
    }
    if (w["C"] && !pts[w["C"].b].dev) g.push(band(len(w["C"], pts) / len(w["A"], pts), [0.618, 1.618], [0.382, 2.618]));
    return { rules: rules, guide: g.length ? g.reduce(function (a, b) { return a + b; }, 0) / g.length : ws.length < 2 ? 0.4 : 0.6 };
  }
  /* Eine Welle von a nach b ist zulaessig, wenn a und b die Extreme des Abschnitts sind (EWP Kap. 1: Wellen zwischen Extremen). */
  function extremal(pts, a, b) {
    var lo = Math.min(pts[a].p, pts[b].p), hi = Math.max(pts[a].p, pts[b].p);
    for (var k = a + 1; k < b; k++) if (pts[k].p < lo - 1e-12 || pts[k].p > hi + 1e-12) return false;
    return true;
  }
  /* Alle Lesarten ab Ursprung s bis zum letzten Punkt: Motivwellen 1 Abschnitt, Korrekturwellen 1 oder 3 Abschnitte. */
  function parse(pts, s, seq, out) {
    var last = pts.length - 1;
    var sdir = pts[s + 1].p > pts[s].p ? 1 : -1;
    (function step(k, li, ws) {
      if (k === last) { out.push({ s: s, dir: sdir, labels: seq, waves: ws.slice() }); return; }
      if (li >= seq.length) return;
      var lab = seq[li];
      var spans = /^[135]$/.test(lab) ? [1, 5] : lab === "C" ? [1, 5] : [1, 3];
      spans.forEach(function (n) {
        var b = k + n; if (b > last) return;
        if (!extremal(pts, k, b)) return;
        ws.push({ label: lab, a: k, b: b, legs: n });
        step(b, li + 1, ws);
        ws.pop();
      });
    })(s, 0, []);
  }

  function readCounts(close, times, th, asOf, origin) {
    var piv = zigzag(close, th, asOf);
    if (piv.length < 2) return [];
    var n = isNum(asOf) ? asOf + 1 : close.length, gmin = Infinity, gmax = -Infinity;
    for (var i = 0; i < n; i++) { gmin = Math.min(gmin, close[i]); gmax = Math.max(gmax, close[i]); }
    var base = piv.map(function (q) { return { i: q.i, t: times[q.i], p: close[q.i], dev: !!q.dev }; });
    var res = [];
    /* Ist der Kurs seit dem letzten Extrem schon spuerbar zurueckgelaufen (mindestens ein Viertel der Schwelle), gilt die Welle am
       Extrem als beendet und die naechste als laufend (sonst bliebe ein Ruecklauf unter der Schwelle unsichtbar). */
    var lastP = base[base.length - 1];
    if (lastP.i < n - 1 && Math.abs(Math.log(close[n - 1] / lastP.p)) >= 0.25 * th) {
      var alt = base.map(function (q) { return { i: q.i, t: q.t, p: q.p, dev: false }; });
      alt.push({ i: n - 1, t: times[n - 1], p: close[n - 1], dev: true, now: true });
      readOn(alt);
    } else readOn(base);
    return res;
    function readOn(pts) {
    var starts = [];
    for (var s = 0; s < pts.length - 1; s++) if (!isNum(origin) || pts[s].i === origin) starts.push(s);
    starts.forEach(function (s) {
      var cand = [];
      parse(pts, s, MOTIVE_SEQ, cand);
      parse(pts, s, CORR_SEQ, cand);
      cand.forEach(function (c) {
        var corr = c.labels === CORR_SEQ;
        /* Ursprung = Handelsbeginn: nur, wenn er das Extrem bis zum Ende der ersten Welle ist (sonst lag der Ursprung vor dem Handelsbeginn) */
        if (s === 0 && pts[0].i === 0) {
          var w1 = c.waves[0];
          for (var q = 0; q <= pts[w1.b].i; q++) if (c.dir * (close[q] - pts[0].p) < 0) return;
        }
        var chk = corr ? checkCorrection(c.waves, pts, c.dir) : checkImpulse(c.waves, pts, c.dir, false);
        if (!chk) return;
        var o = pts[s].p;
        /* Ursprung: Extrem der ganzen Reihe in Gegenrichtung zur ersten Welle (Allzeittief fuer einen Aufwaertsimpuls, Allzeithoch
           fuer eine Korrektur abwaerts) – so verankern Analysten den grossen Grad. */
        var anchor = c.dir > 0 ? (o <= gmin * 1.0001 ? 1 : 0.35) : (o >= gmax * 0.9999 ? 1 : 0.35);
        if (corr && c.dir > 0) anchor *= 0.6;   // Korrektur aufwaerts ab Allzeittief ist selten die grosse Lesart
        var cover = (pts[pts.length - 1].i - pts[s].i) / Math.max(1, n - 1);
        var nw = c.waves.length, cur = c.waves[nw - 1];
        var prior = corr ? 0.75 : 1;
        var score = 0.45 * anchor + 0.3 * chk.guide + 0.15 * cover + 0.1 * prior;
        res.push({ th: th, pts: pts, s: s, dir: c.dir, kind: corr ? "CORRECTION" : "IMPULSE", waves: c.waves, current: cur.label, rules: chk.rules, guide: round(chk.guide, 3), anchor: anchor, cover: round(cover, 3), score: round(score, 4) });
      });
    });
    }
  }

  function waveOut(c) {
    return c.waves.map(function (w) {
      var a = c.pts[w.a], b = c.pts[w.b];
      return { label: w.label, fromTime: a.t, fromPrice: a.p, toTime: b.t, toPrice: b.p, legs: w.legs, status: b.dev ? "DEVELOPING" : "CONFIRMED" };
    });
  }
  function countOut(c, degree) {
    if (!c) return null;
    var ws = waveOut(c), cur = ws[ws.length - 1];
    var s = c.dir, w1 = ws[0];
    /* Ungueltig-Marke (harte Regel) fuer die laufende Welle */
    var inv = null, byLabel = {}; ws.forEach(function (w) { byLabel[w.label] = w; });
    if (c.kind === "IMPULSE") {
      if (cur.label === "1" || cur.label === "2") inv = { price: w1.fromPrice, direction: s > 0 ? "below" : "above", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", text: "Welle 2 läuft nie über den Ursprung von Welle 1 hinaus" };
      else if (cur.label === "3") inv = { price: byLabel["2"].toPrice, direction: s > 0 ? "below" : "above", ruleId: "W3_START", text: "Unter dem Ende von Welle 2 wäre Welle 3 nicht im Gange" };
      else if (cur.label === "4") inv = { price: w1.toPrice, direction: s > 0 ? "below" : "above", ruleId: "W4_NOT_IN_W1_TERRITORY", text: "Welle 4 fällt nicht in das Kursgebiet von Welle 1" };
      else if (cur.label === "5") inv = { price: byLabel["4"].toPrice, direction: s > 0 ? "below" : "above", ruleId: "W5_START", text: "Unter dem Ende von Welle 4 wäre Welle 5 nicht im Gange" };
      else if (cur.label === "A" || cur.label === "B") inv = { price: byLabel["5"].toPrice, direction: s > 0 ? "above" : "below", ruleId: "IMPULSE_END", text: "Über dem Ende von Welle 5 wäre der Impuls nicht abgeschlossen" };
      else if (cur.label === "C") inv = { price: byLabel["B"].toPrice, direction: s > 0 ? "above" : "below", ruleId: "C_START", text: "Über dem Ende von Welle B wäre Welle C nicht im Gange" };
    } else {
      if (cur.label === "A" || cur.label === "B") inv = { price: w1.fromPrice, direction: s > 0 ? "below" : "above", ruleId: "CORRECTION_ORIGIN", text: "Jenseits des Ursprungs der Korrektur wäre sie keine Korrektur" };
      else inv = { price: byLabel["B"].toPrice, direction: s > 0 ? "below" : "above", ruleId: "C_START", text: "Jenseits des Endes von Welle B wäre Welle C nicht im Gange" };
    }
    var waveDir = function (lab) { return c.kind === "IMPULSE" ? (/^[135B]$/.test(lab) ? s : -s) : (lab === "B" ? -s : s); };
    return { degree: degree, kind: c.kind, direction: s > 0 ? "UP" : "DOWN", threshold: c.th, waves: ws, current: { label: cur.label, status: cur.status, direction: waveDir(cur.label) > 0 ? "UP" : "DOWN" },
             invalidation: inv, rules: c.rules, guidelineFit: c.guide, anchor: c.anchor, coverage: c.cover, score: c.score };
  }

  function best(list) { return list.slice().sort(function (a, b) { return b.score - a.score || b.cover - a.cover; })[0] || null; }
  function sameReading(a, b) { return a && b && a.kind === b.kind && a.dir === b.dir && a.current === b.current && a.pts[a.s].i === b.pts[b.s].i; }

  /* ---------------------------------------------------------- 5. Pfad */
  /* Kernverhaeltnis je Schritt (Punkt des Pfads): die Grenze zwischen Basis- und erweiterter Stufe. */
  var KEY = { "2": 0.618, "3": 1.618, "4": 0.382, "5": 1.0, A: 0.5, B: 0.618, C: 1.0, "1": 1.0, "5N": 0.618 };
  /* Welle 5 uebersteigt in der Regel das Ende von Welle 3 (sonst „Truncation“, EWP Kap. 1, selten). Reicht 1,618 × Welle 1 nicht
     darueber, misst die Methode Welle 5 an der Strecke Anfang Welle 1 bis Ende Welle 3 (elliott-projection.js W5_EXTREME, NET13). */
  LADDER["5N"] = { ref: "net13", dir: 1, rel: "W5_NET13", tiers: [["BASE", 0.382, 0.618], ["EXTENDED", 0.618, 1.0]] };
  RELATIONS.W5_NET13 = { source: EWP, locator: "Kap. 1, Truncation; Kap. 4, Ratio Analysis (Multiples)", text: "Welle 5 über das Ende von Welle 3 hinaus: 0,382–1,0 × Strecke Anfang Welle 1 bis Ende Welle 3 ab Ende Welle 4" };
  /* Skala (VU-Festlegung): Verhaeltnisse linear wie in der Literatur. Fuehrt ein Abwaertsschritt linear bis unter ein Zehntel des
     Ankers (lange Reihen mit vielfachem Kursanstieg), rechnet die Methode diesen Schritt auf der logarithmischen Skala (gleiche Prozent
     statt gleicher Dollar). */
  var LOG_FLOOR = 0.1;
  function nextLabels(kind, label, max, own) {
    var seq = kind === "IMPULSE" ? MOTIVE_SEQ : CORR_SEQ, i = seq.indexOf(label), out = [];
    var endAt = own ? (kind === "IMPULSE" ? seq.indexOf("5") : seq.length - 1) : seq.length - 1;
    for (var k = i + 1; k <= endAt && out.length < max; k++) out.push(seq[k]);
    if (!own && kind === "CORRECTION" && out.length < max && i + 1 + out.length >= seq.length) out.push("1");   // nach der Korrektur neuer Impuls
    return out;
  }
  function stepDir(kind, label, s) { return kind === "IMPULSE" ? (/^[135B]$/.test(label) ? s : -s) : (label === "1" ? -s : label === "B" ? -s : s); }
  function buildPath(big, sub, close) {
    if (!big) return [];
    var steps = [], halt = false, SP = { linear: [function (v) { return v; }, function (v) { return v; }], log: [Math.log, Math.exp] };
    function refOf(L, lens, lab) { return !L ? null : lab === "1" && L.ref === "corr" ? lens.corr : L.ref === "prev" ? lens.prev : L.ref === "w1" ? lens["1"] : L.ref === "a" ? lens.A : L.ref === "impulse" ? lens.impulse : L.ref === "net13" ? lens.net13 : null; }
    function tiersOf(LL, sp, a, dir, ref, ext) {
      var T = SP[sp][0], F = SP[sp][1], A0 = T(a);
      return LL.tiers.map(function (t) {
        var p1 = F(A0 + dir * t[1] * ref), p2 = F(A0 + dir * t[2] * ref), lo = Math.min(p1, p2), hi = Math.max(p1, p2);
        return { tier: t[0], low: round(lo, 4), high: round(hi, 4), ratios: [t[1], t[2]], passed: isNum(ext) && (dir > 0 ? ext >= hi : ext <= lo) };
      });
    }
    function run(count, labels, degree, firstIsCurrent, startAnchor, L2) {
      var s = count.direction === "UP" ? 1 : -1, anchor = startAnchor;
      for (var q = 0; q < labels.length && !halt; q++) {
        var lab = labels[q], w = q === 0 && firstIsCurrent ? count.waves[count.waves.length - 1] : null, dev = !!(w && w.status === "DEVELOPING");
        var a = w ? w.fromPrice : anchor, dir = stepDir(count.kind, lab, s), ext = dev ? w.toPrice : null, sp = "linear", key = lab, tiers = null, ref = null;
        if (!isNum(a) || !(a > 0)) { halt = true; break; }
        for (var pass = 0; pass < 2; pass++) {
          sp = pass ? "log" : "linear"; key = lab;
          var lens = L2[sp], T = SP[sp][0];
          ref = refOf(LADDER[lab], lens, lab);
          if (lab === "5" && isNum(ref) && isNum(lens.end3) && isNum(lens.net13) && dir * (T(a) + dir * 1.618 * ref - lens.end3) <= 0) { key = "5N"; ref = lens.net13; }
          if (!LADDER[key] || !isNum(ref) || !(ref > 0)) { tiers = null; continue; }
          tiers = tiersOf(LADDER[key], sp, a, dir, ref, ext);
          if (dir > 0 || tiers.every(function (z) { return z.low > LOG_FLOOR * a; })) break;
        }
        if (!tiers) { halt = true; break; }
        tiers = tiers.filter(function (z) { return z.low > 0 && z.high > z.low; });
        if (!tiers.length) { halt = true; break; }
        var LL = LADDER[key], T0 = SP[sp][0], F0 = SP[sp][1], A0 = T0(a);
        var open = tiers.filter(function (z) { return !z.passed; }), kp = F0(A0 + dir * KEY[key] * ref);
        var point = !open.length ? ext : isNum(ext) && (dir > 0 ? ext >= kp : ext <= kp) ? (open[0].low + open[0].high) / 2 : kp;
        steps.push({ label: lab, display: degree === "SUB" ? "(" + lab + ")" : "[" + lab + "]", degree: degree, direction: dir > 0 ? "UP" : "DOWN", developing: dev, anchor: round(a, 4), scale: sp,
                     zone: { relation: LL.rel, statement: RELATIONS[LL.rel].text, source: RELATIONS[LL.rel].source + ", " + RELATIONS[LL.rel].locator, tiers: tiers }, point: round(point, 4), exhausted: !open.length });
        ["linear", "log"].forEach(function (k) { advance(L2[k], SP[k][0], lab, a, point); });
        anchor = point;
      }
      return anchor;
    }
    function advance(lens, T, lab, a, end) {
      var l = Math.abs(T(end) - T(a));
      lens.prev = l; lens[lab] = l;
      if (lab === "3") { lens.end3 = T(end); if (isNum(lens.start)) lens.net13 = Math.abs(T(end) - lens.start); }
      if (lab === "5" && isNum(lens.start)) lens.impulse = Math.abs(T(end) - lens.start);
      if (lab === "C" && isNum(lens.corrStart)) lens.corr = Math.abs(T(end) - lens.corrStart);
    }
    function lensOf(count) {
      var out = {};
      ["linear", "log"].forEach(function (k) {
        var T = SP[k][0], o = { prev: null }, ws = count.waves, by = {};
        ws.forEach(function (w) { by[w.label] = w; if (w.status !== "DEVELOPING") { var l = Math.abs(T(w.toPrice) - T(w.fromPrice)); o[w.label] = l; o.prev = l; } });
        o.start = T(ws[0].fromPrice);
        if (by["3"] && by["3"].status !== "DEVELOPING") { o.end3 = T(by["3"].toPrice); o.net13 = Math.abs(o.end3 - o.start); }
        if (by["5"] && by["5"].status !== "DEVELOPING") o.impulse = Math.abs(T(by["5"].toPrice) - o.start);
        if (count.kind === "CORRECTION") o.corrStart = T(ws[0].fromPrice); else if (by["A"]) o.corrStart = T(by["A"].fromPrice);
        out[k] = o;
      });
      return out;
    }
    var cur = big.current.label, lb = lensOf(big), end = null;
    if (sub && sub.waves.length) {
      end = run(sub, [sub.current.label].concat(nextLabels(sub.kind, sub.current.label, 4, true)), "SUB", true, null, lensOf(sub));
      if (!steps.length) halt = false;   // Unterteilung ohne Zone (z. B. laufende Unterwelle 1): Pfad aus dem grossen Grad
    }
    if (steps.length && !halt) {
      /* Unterwellen beendet = grosse Welle beendet; ihre Laenge geht in die Referenzen der naechsten grossen Wellen ein. */
      var cw = big.waves[big.waves.length - 1];
      ["linear", "log"].forEach(function (k) { advance(lb[k], SP[k][0], cur, cw.fromPrice, end); });
      run(big, nextLabels(big.kind, cur, 2), "BIG", false, end, lb);
    } else if (!steps.length) {
      halt = false;
      end = run(big, [cur], "BIG", true, null, lb);
      if (!halt) run(big, nextLabels(big.kind, cur, 2), "BIG", false, end, lb);
    }
    return steps;
  }

  /* ---------------------------------------------------------- Einstieg */
  function analyzeTopDown(input) {
    var close = input.close, times = input.times, asOf = isNum(input.asOfIndex) ? input.asOfIndex : close.length - 1;
    if (!close || close.length < 104) return { version: VERSION, status: "INSUFFICIENT_HISTORY", primary: null };
    var all = [];
    (input.thresholds || THRESHOLDS).forEach(function (th) { all = all.concat(readCounts(close, times, th, asOf)); });
    var top = best(all);
    if (!top) return { version: VERSION, status: "NO_COUNT", primary: null };
    var alt = best(all.filter(function (c) { return !sameReading(c, top) && (c.current !== top.current || c.dir !== top.dir || c.kind !== top.kind); }));
    var primary = countOut(top, "BIG"), alternative = countOut(alt, "BIG");
    /* Unterteilung der laufenden grossen Welle */
    var curW = primary.waves[primary.waves.length - 1], i0 = top.pts[top.waves[top.waves.length - 1].a].i;
    var subAll = [], seg = close.slice(i0, asOf + 1), segT = times.slice(i0, asOf + 1);
    if (seg.length >= 8) (input.subThresholds || SUB_THRESHOLDS).forEach(function (th) {
      readCounts(seg, segT, th, seg.length - 1, 0).forEach(function (c) {
        var want = /^[135]$/.test(curW.label) || (curW.label === "C" || curW.label === "A" && primary.kind === "CORRECTION") ? "IMPULSE" : "CORRECTION";
        var wantDir = primary.current.direction === "UP" ? 1 : -1;
        if (c.dir !== wantDir) return;
        if (want === "CORRECTION" && c.kind !== "CORRECTION" && !(c.kind === "IMPULSE" && /^[12]$/.test(c.current))) return;
        if (c.kind === "IMPULSE" && c.waves.some(function (w) { return /^[ABC]$/.test(w.label); })) return;   // Unterwelle endet mit der grossen Welle
        subAll.push(c);
      });
    });
    var subTop = best(subAll.map(function (c) { c.score = round(0.6 * c.guide + 0.25 * c.cover + 0.15 * (c.waves.length >= 2 ? 1 : 0.5), 4); return c; }));
    var sub = countOut(subTop, "SUB");
    var path = buildPath(primary, sub, close[asOf]);
    return { version: VERSION, status: "OK", asOf: times[asOf], close: close[asOf], primary: primary, alternative: alternative, sub: sub, path: path,
             relations: RELATIONS, note: "Zählung von oben auf Wochenschlusskursen seit Handelsbeginn. Zonen ohne Zeitangabe; keine Wahrscheinlichkeit." };
  }

  var api = { VERSION: VERSION, THRESHOLDS: THRESHOLDS, RELATIONS: RELATIONS, LADDER: LADDER, zigzag: zigzag, analyzeTopDown: analyzeTopDown };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.ElliottTopDown = api; }
})(typeof globalThis !== "undefined" ? globalThis : this);
