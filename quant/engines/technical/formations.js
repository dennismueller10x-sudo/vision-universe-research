/* =========================================================================
   VISION UNIVERSE TECHNICAL — formations.js
   FORMATIONSERKENNUNG DER PRODUKTWELT TECHNICAL (as-of, ohne Look-ahead)

   Baut auf der bestehenden, kausalen Kette auf und schreibt sie nicht neu:
     ti/context.js         Features + Pivots einmal je Serie, Stand Bar t
     ti/chart-patterns.js  Doppeltop/-boden, SKS (+ invers), Dreiecke,
                           Rechteck, Flagge, Tasse mit Henkel
     ti/levels.js          Unterstuetzungs-/Widerstandszonen
   Neu hier (bisher nicht im Bestand):
     Trendlinien, Trendkanaele, Keile, Wimpel, Range-Ausbruch,
     Widerstands-Ausbruch, Volatilitaetskontraktion; seit 1.1.0
     Kursluecken nach oben/unten (Gap Up / Gap Down).

   EIN ZUSTANDSMODELL fuer alle Formationen (Produktsprache):
     DETECTED     Formation erkannt (in Bildung, noch ohne Ausloeser)
     CONFIRMED    Formation bestaetigt (Ausbruch/Bestaetigungsregel erfuellt)
     INVALIDATED  Formation invalidiert (Invalidierungsregel ausgeloest)

   KAUSALITAET: Jede Funktion bekommt einen Kontext "Stand Bar t" und liest
   nur Bars <= t sowie Pivots mit confirmedIndex <= t. detectedAt ist der
   erste Bar, an dem die Formation mit dem damaligen Wissen erkennbar war —
   nie der Zeitpunkt des ersten Formationspunkts. Der Test
   technical-formations.test.mjs vergiftet die Zukunft und verlangt
   identische Ergebnisse.

   LEBENSZYKLUS (seit 1.2.0, docs/technical/FORMATIONS_LIFECYCLE.md):
     • Bestandsformationen werden nicht nur Stand t, sondern auch Stand der
       Bars unmittelbar vor den juengsten Pivot-Bestaetigungen (Anker)
       abgeleitet und bis t verfolgt. Eine Formation, deren Fenster ein
       neuer Pivot abgeloest hat, endet so als bestaetigt oder invalidiert,
       statt still zu verschwinden. Aufgeloeste bleiben LEGACY_KEEP Bars
       gelistet, unaufgeloeste hoechstens einen Monat nach dem Anker.
     • Kanaele und Keile werden aus vier Swing-Punkten erkannt und mit
       ihrem Erkennungsbar verankert; der fuenfte Swing-Punkt bestaetigt
       den Kanal (bzw. bricht ihn). Vorher fielen Erkennung und
       Bestaetigung zusammen, weil die Erkennung schon fuenf Punkte nahm.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Ctx = isNode ? require("./ti/context.js") : global.VUTechnical.TIContext;
  var Pat = isNode ? require("./ti/chart-patterns.js") : global.VUTechnical.TIChartPatterns;
  var Lv = isNode ? require("./ti/levels.js") : global.VUTechnical.TILevels;

  var ENGINE_VERSION = "technical-formations-1.3.0";

  /* Lebenszyklus der Bestandsformationen (Bars): aufgeloeste Formationen bleiben LEGACY_KEEP Bars gelistet
     (wie Ausbrueche der neuen Regeln), unaufgeloeste abgeloeste hoechstens einen Monat (barsPerYear / 12) nach dem Anker. */
  var LEGACY_KEEP = 10;
  /* Kanaele/Keile: so viele Swing-Punkte nach den vier erkennenden Punkten wird eine Struktur weitergefuehrt. */
  var CW_EXTRA = 6;

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  /* Zahlen ab Betrag 1 auf 4 Nachkommastellen, darunter 4 signifikante Stellen (wie published-close.js): Bei Kursen unter
     einem Cent machte die feste Rundung aus 0,000001 eine 0 (CPTAF, FORMATION_VALIDATION.md §4). 0 bleibt 0. */
  function r4(v) { return isNum(v) ? (Math.abs(v) >= 1 || v === 0 ? Math.round(v * 1e4) / 1e4 : Number(v.toPrecision(4))) : null; }

  var STATES = { DETECTED: "Erkannt", CONFIRMED: "Bestätigt", INVALIDATED: "Invalidiert" };

  /* Regeltexte je Typ: Erkennung, Bestaetigung, Invalidierung (Methodikseite + Detailkarte). */
  var RULES = {
    SUPPORT_TRENDLINE: { name: "Steigende Unterstützungslinie", direction: "BULLISH", family: "TRENDLINE",
      detect: "Linie durch die letzten zwei bestätigten, steigenden Swing-Tiefs (Pivot-Skala 2).",
      confirm: "Dritter Kontakt: ein späteres Tief berührt die Linie (±0,5 ATR) und der Schluss bleibt darüber.",
      invalidate: "Schlusskurs mehr als 0,5 ATR unter der Linie." },
    RESISTANCE_TRENDLINE: { name: "Fallende Widerstandslinie", direction: "BEARISH", family: "TRENDLINE",
      detect: "Linie durch die letzten zwei bestätigten, fallenden Swing-Hochs (Pivot-Skala 2).",
      confirm: "Dritter Kontakt: ein späteres Hoch berührt die Linie (±0,5 ATR) und der Schluss bleibt darunter.",
      invalidate: "Schlusskurs mehr als 0,5 ATR über der Linie (Ausbruch nach oben)." },
    ASCENDING_CHANNEL: { name: "Aufwärtskanal", direction: "BULLISH", family: "CHANNEL",
      detect: "Vier aufeinanderfolgende Swing-Punkte (2 Hochs, 2 Tiefs, Pivot-Skala 2) steigen mit annähernd gleicher Steigung (Abweichung ≤ 35 %), Breite ≥ 2 ATR. Erkannt mit der Bestätigung des vierten Punkts.",
      confirm: "Der fünfte Swing-Punkt liegt im Kanal (±0,5 ATR); bestätigt mit seiner Pivot-Bestätigung.",
      invalidate: "Schlusskurs mehr als 0,5 ATR unter der unteren Kanallinie oder ein späterer Swing-Punkt außerhalb des Kanals (±0,5 ATR)." },
    DESCENDING_CHANNEL: { name: "Abwärtskanal", direction: "BEARISH", family: "CHANNEL",
      detect: "Vier aufeinanderfolgende Swing-Punkte (2 Hochs, 2 Tiefs, Pivot-Skala 2) fallen mit annähernd gleicher Steigung (Abweichung ≤ 35 %), Breite ≥ 2 ATR. Erkannt mit der Bestätigung des vierten Punkts.",
      confirm: "Der fünfte Swing-Punkt liegt im Kanal (±0,5 ATR); bestätigt mit seiner Pivot-Bestätigung.",
      invalidate: "Schlusskurs mehr als 0,5 ATR über der oberen Kanallinie oder ein späterer Swing-Punkt außerhalb des Kanals (±0,5 ATR)." },
    RISING_WEDGE: { name: "Steigender Keil", direction: "BEARISH", family: "WEDGE",
      detect: "Vier aufeinanderfolgende Swing-Punkte (2 Hochs, 2 Tiefs, Pivot-Skala 2) steigen, die untere Linie steiler als die obere: die Spanne verengt sich um mindestens 25 %. Erkannt mit der Bestätigung des vierten Punkts.",
      confirm: "Schlusskurs unter der unteren Keillinie nach dem letzten Formationspunkt.",
      invalidate: "Schlusskurs oder ein späteres Swing-Hoch mehr als 0,5 ATR über der oberen Keillinie." },
    FALLING_WEDGE: { name: "Fallender Keil", direction: "BULLISH", family: "WEDGE",
      detect: "Vier aufeinanderfolgende Swing-Punkte (2 Hochs, 2 Tiefs, Pivot-Skala 2) fallen, die obere Linie steiler als die untere: die Spanne verengt sich um mindestens 25 %. Erkannt mit der Bestätigung des vierten Punkts.",
      confirm: "Schlusskurs über der oberen Keillinie nach dem letzten Formationspunkt.",
      invalidate: "Schlusskurs oder ein späteres Swing-Tief mehr als 0,5 ATR unter der unteren Keillinie." },
    BULL_PENNANT: { name: "Bullischer Wimpel", direction: "BULLISH", family: "PENNANT",
      detect: "Steiler Anstieg (≥ 5 ATR), danach mindestens 5 Bars Konsolidierung mit fallenden Hochs und steigenden Tiefs, Rücklauf ≤ 50 % des Masts.",
      confirm: "Schlusskurs über der oberen Wimpellinie und über dem jüngsten Konsolidierungshoch.",
      invalidate: "Schlusskurs unter dem tiefsten Tief der Konsolidierung." },
    BEAR_PENNANT: { name: "Bärischer Wimpel", direction: "BEARISH", family: "PENNANT",
      detect: "Steiler Abfall (≥ 5 ATR), danach mindestens 5 Bars Konsolidierung mit fallenden Hochs und steigenden Tiefs, Rücklauf ≤ 50 % des Masts.",
      confirm: "Schlusskurs unter der unteren Wimpellinie und unter dem jüngsten Konsolidierungstief.",
      invalidate: "Schlusskurs über dem höchsten Hoch der Konsolidierung." },
    RANGE_BREAKOUT: { name: "Range-Ausbruch", direction: "BULLISH", family: "BREAKOUT",
      detect: "Schluss über dem höchsten Hoch der vorherigen 30 Bars, deren Spanne höchstens 6 ATR und 15 % betrug.",
      confirm: "Zweiter Schluss in Folge über der Range-Oberkante.",
      invalidate: "Schlusskurs zurück unter der Range-Mitte." },
    RESISTANCE_BREAKOUT: { name: "Ausbruch über Widerstand", direction: "BULLISH", family: "BREAKOUT",
      detect: "Schluss über der Oberkante der nächsten Widerstandszone mit mindestens zwei Swing-Kontakten (Zone so, wie sie am Vortag bekannt war).",
      confirm: "Zweiter Schluss in Folge über der Zonenoberkante.",
      invalidate: "Schlusskurs zurück unter der Zonenunterkante." },
    VOLATILITY_CONTRACTION: { name: "Volatilitätskontraktion", direction: "BULLISH", family: "CONTRACTION",
      detect: "Mindestens drei aufeinanderfolgende Rücksetzer (Pivot-Skala 1) mit je mindestens 20 % geringerer Tiefe, letzter Rücksetzer ≤ 12 %, Kurs über der SMA 50.",
      confirm: "Schluss über dem letzten Kontraktionshoch (Pivot).",
      invalidate: "Schlusskurs unter dem Tief der letzten Kontraktion." },
    GAP_UP: { name: "Kurslücke nach oben", direction: "BULLISH", family: "GAP",
      detect: "Tagestief über dem Vortageshoch, Lücke mindestens 0,5 ATR; mit Volumendaten zusätzlich mindestens 1,5-faches relatives Volumen. Jüngste Lücke der letzten 20 Bars. Kein Datenverdacht: Schlussfaktor nicht nahe 2, 3, … bzw. 1/2, 1/3, … (±2 %) und zwischen 0,2 und 5.",
      confirm: "Die Lücke hält: drei Schlusskurse in Folge über dem Vortageshoch (Unterkante der Lücke).",
      invalidate: "Schlusskurs unter dem Vortageshoch – die Lücke ist per Schluss geschlossen." },
    GAP_DOWN: { name: "Kurslücke nach unten", direction: "BEARISH", family: "GAP",
      detect: "Tageshoch unter dem Vortagestief, Lücke mindestens 0,5 ATR; mit Volumendaten zusätzlich mindestens 1,5-faches relatives Volumen. Jüngste Lücke der letzten 20 Bars. Kein Datenverdacht: Schlussfaktor nicht nahe 2, 3, … bzw. 1/2, 1/3, … (±2 %) und zwischen 0,2 und 5.",
      confirm: "Die Lücke hält: drei Schlusskurse in Folge unter dem Vortagestief (Oberkante der Lücke).",
      invalidate: "Schlusskurs über dem Vortagestief – die Lücke ist per Schluss geschlossen." }
  };

  /* Bestandsformationen aus ti/chart-patterns.js: Zustandsabbildung + Regeltexte. */
  var LEGACY = {
    DOUBLE_TOP: { family: "REVERSAL", confirm: "Schluss unter dem Zwischentief (Nackenlinie).", invalidate: "Schluss über dem höheren der beiden Hochs." },
    DOUBLE_BOTTOM: { family: "REVERSAL", confirm: "Schluss über dem Zwischenhoch (Nackenlinie).", invalidate: "Schluss unter dem tieferen der beiden Tiefs." },
    HEAD_AND_SHOULDERS: { family: "REVERSAL", confirm: "Schluss unter der Nackenlinie.", invalidate: "Schluss über der rechten Schulter." },
    INVERSE_HEAD_AND_SHOULDERS: { family: "REVERSAL", confirm: "Schluss über der Nackenlinie.", invalidate: "Schluss unter der rechten Schulter." },
    ASCENDING_TRIANGLE: { family: "TRIANGLE", confirm: "Schluss über der flachen Oberkante.", invalidate: "Schluss unter der steigenden Unterkante." },
    DESCENDING_TRIANGLE: { family: "TRIANGLE", confirm: "Schluss unter der flachen Unterkante.", invalidate: "Schluss über der fallenden Oberkante." },
    SYMMETRICAL_TRIANGLE: { family: "TRIANGLE", confirm: "Schluss jenseits einer der beiden Dreieckslinien (Richtung = Ausbruchsseite).", invalidate: "Schluss jenseits der Gegenlinie nach dem Ausbruch." },
    RECTANGLE: { family: "RANGE", confirm: "Schluss jenseits der Rechteckkante.", invalidate: "Schluss jenseits der Gegenkante." },
    BULL_FLAG: { family: "FLAG", confirm: "Schluss über dem Mast-Hoch.", invalidate: "Schluss mehr als 50 % des Masts unter dem Mast-Hoch, oder kein Ausbruch bis 1,5 × Mastdauer (mind. 6 Bars) nach dem Mast-Hoch." },
    BEAR_FLAG: { family: "FLAG", confirm: "Schluss unter dem Mast-Tief.", invalidate: "Schluss mehr als 50 % des Masts über dem Mast-Tief, oder kein Ausbruch bis 1,5 × Mastdauer (mind. 6 Bars) nach dem Mast-Tief." },
    CUP_WITH_HANDLE: { family: "CONTINUATION", confirm: "Schluss über dem rechten Tassenrand.", invalidate: "Schluss unter der zulässigen Henkeltiefe: rechter Tassenrand minus min(15 %, halbe Tassentiefe)." }
  };
  /* resolve() in ti/chart-patterns.js: nach einem Ausbruch invalidiert auch der Rueckfall hinter die Ausbruchslinie. */
  Object.keys(LEGACY).forEach(function (k) { LEGACY[k].invalidate += " Nach dem Ausbruch: Schluss mehr als 0,5 ATR zurück hinter die Ausbruchslinie (Fehlausbruch)."; });
  var LEGACY_STATE = { FORMING: "DETECTED", BREAKOUT: "CONFIRMED", BREAKOUT_RETEST: "CONFIRMED", FAILED: "INVALIDATED", FAILED_BREAKOUT: "INVALIDATED" };

  /* -------------------------------------------------------------- Helfer */
  function lineThrough(a, b) {
    var m = (b.price - a.price) / Math.max(1, b.index - a.index);
    return { slope: m, at: function (k) { return a.price + m * (k - a.index); } };
  }
  function pt(p) { return { index: p.pivotIndex, price: p.pivotPrice, time: p.pivotTime, confirmedIndex: p.confirmedIndex }; }
  function seg(s, line, from, to) {
    return { from: { time: s.timestamps[from], price: r4(line.at(from)) }, to: { time: s.timestamps[to], price: r4(line.at(to)) } };
  }
  function quality(ctx) {
    return { bars: ctx.t + 1, hasVolume: !!ctx.hasVolume, closeOnly: !!ctx.closeOnly, atr: r4(ctx.atr), timeframe: ctx.series.timeframe || "1D" };
  }
  function base(ctx, type, state, detectedIdx, extra) {
    var r = RULES[type], s = ctx.series;
    return Object.assign({
      id: type + "@" + s.timestamps[detectedIdx], type: type, name: r.name, family: r.family, direction: r.direction,
      state: state, stateLabel: STATES[state], timeframe: s.timeframe || "1D", asOf: ctx.time,
      detectedAt: s.timestamps[detectedIdx], detectedIndex: detectedIdx,
      rules: { detect: r.detect, confirm: r.confirm, invalidate: r.invalidate }, dataQuality: quality(ctx), source: "vu-technical"
    }, extra || {});
  }

  /* Verfolgt eine Linie ab Bar `from` bis t: Kontakte, Bruch. dir = +1 Stuetzlinie (unten), −1 Widerstand (oben).
     tol: Toleranz (Standard 0,5 ATR Stand t; verankerte Strukturen geben die Toleranz ihres Erkennungsbars mit). */
  function followLine(ctx, line, from, dir, tol) {
    var s = ctx.series, touches = [], broken = -1;
    tol = isNum(tol) ? tol : 0.5 * ctx.atr;
    for (var k = from + 1; k <= ctx.t; k++) {
      var lv = line.at(k);
      if (dir > 0 ? s.close[k] < lv - tol : s.close[k] > lv + tol) { broken = k; break; }
      var probe = dir > 0 ? s.low[k] : s.high[k];
      if (Math.abs(probe - lv) <= tol && (touches.length === 0 || k - touches[touches.length - 1] >= 3)) touches.push(k);
    }
    return { touches: touches, broken: broken };
  }

  /* ------------------------------------------------------ Trendlinien */
  function trendlines(ctx) {
    var v = ctx.view("scale-2"), out = [];
    if (!v) return out;
    var lows = v.confirmed.filter(function (p) { return p.side === "LOW"; }).map(pt);
    var highs = v.confirmed.filter(function (p) { return p.side === "HIGH"; }).map(pt);
    var s = ctx.series, atrCol = ctx.prep.features.columns.atr;
    function make(list, dir, type) {
      if (list.length < 2) return;
      var a = list[list.length - 2], b = list[list.length - 1];
      /* 1.2.2: Toleranz aus der ATR am Erkennungsbar (Bestaetigung von b), nicht am Stand t. Mit der ATR von t
         konnte eine Linie nachtraeglich gueltig werden und trug dann ein Erkennungsdatum, an dem sie nicht sichtbar war. */
      var detectIdx = b.confirmedIndex, atrD = atrCol && atrCol[detectIdx], tol = 0.5 * (isNum(atrD) && atrD > 0 ? atrD : ctx.atr);
      if (dir > 0 ? !(b.price > a.price + tol * 0.5) : !(b.price < a.price - tol * 0.5)) return;
      var line = lineThrough(a, b);
      /* Zwischen a und der Bestaetigung von b darf kein Schluss die Linie gebrochen haben. */
      for (var k = a.index + 1; k <= detectIdx; k++) if (dir > 0 ? s.close[k] < line.at(k) - tol : s.close[k] > line.at(k) + tol) return;
      var f = followLine(ctx, line, detectIdx, dir, tol);
      var confirmIdx = f.touches.length && (f.broken < 0 || f.touches[0] < f.broken) ? f.touches[0] : -1;
      var state = f.broken >= 0 ? "INVALIDATED" : confirmIdx >= 0 ? "CONFIRMED" : "DETECTED";
      out.push(base(ctx, type, state, detectIdx, {
        points: [a, b].map(function (p) { return { time: p.time, price: r4(p.price) }; }),
        lines: [Object.assign({ role: dir > 0 ? "support" : "resistance" }, seg(s, line, a.index, f.broken >= 0 ? f.broken : ctx.t))],
        levels: { lineNow: r4(line.at(ctx.t)), slopePerBar: r4(line.slope) },
        confirmedAt: confirmIdx >= 0 ? s.timestamps[confirmIdx] : null,
        invalidatedAt: f.broken >= 0 ? s.timestamps[f.broken] : null,
        touches: 2 + f.touches.filter(function (k) { return f.broken < 0 || k < f.broken; }).length
      }));
    }
    make(lows, 1, "SUPPORT_TRENDLINE");
    make(highs, -1, "RESISTANCE_TRENDLINE");
    return out;
  }

  /* ------------------------------------------- Kanaele und Keile (Swings) */
  /* Struktur aus vier aufeinanderfolgenden Swing-Punkten c[i..i+3] (Pivot-Skala 2), erkannt mit der Bestaetigung
     des vierten Punkts und an diesem Bar verankert: spaetere Swing-Punkte bestaetigen den Kanal (im Kanal) oder
     brechen die Struktur (ausserhalb). Toleranzen mit der ATR des Erkennungsbars, damit der Zustand einer
     verankerten Struktur nicht von der heutigen Volatilitaet abhaengt. Liefert null, wenn c[i..i+3] keine Struktur
     ist; sonst { f: Formation, endIdx: Bar der Aufloesung (Invalidierung, beim Keil auch Ausbruch) oder -1 }. */
  function structureFrom(ctx, c, i) {
    var win = c.slice(i, i + 4).map(function (p) { return Object.assign(pt(p), { side: p.side }); });
    var hs = win.filter(function (p) { return p.side === "HIGH"; }), ls = win.filter(function (p) { return p.side === "LOW"; });
    if (hs.length !== 2 || ls.length !== 2) return null;
    var s = ctx.series, last = win[3], detectIdx = last.confirmedIndex;
    var atrD = ctx.prep.features.columns.atr[detectIdx], atr = isNum(atrD) && atrD > 0 ? atrD : ctx.atr, tol = 0.5 * atr;
    var up = lineThrough(hs[0], hs[1]), lo = lineThrough(ls[0], ls[1]);
    var start = win[0].index;
    var w0 = up.at(start) - lo.at(start), w1 = up.at(last.index) - lo.at(last.index);
    if (!(w0 > 0 && w1 > 0)) return null;
    var flat = 0.05 * atr;          // Steigung je Bar, unter der eine Linie als flach gilt (Dreieck/Rechteck: chart-patterns.js)
    var bothUp = up.slope > flat && lo.slope > flat, bothDown = up.slope < -flat && lo.slope < -flat;
    if (!bothUp && !bothDown) return null;
    var rel = Math.abs(up.slope - lo.slope) / Math.max(Math.abs(up.slope), Math.abs(lo.slope));
    var later = c.slice(i + 4).map(function (p) { return Object.assign(pt(p), { side: p.side }); });
    function inside(p) { return p.price >= lo.at(p.index) - tol && p.price <= up.at(p.index) + tol; }
    function result(type, state, extraPts, endIdx, extra) {
      var pts = win.concat(extraPts).map(function (p) { return { time: p.time, price: r4(p.price), side: p.side }; });
      var lines = [Object.assign({ role: "upper" }, seg(s, up, start, endIdx)), Object.assign({ role: "lower" }, seg(s, lo, start, endIdx))];
      return base(ctx, type, state, detectIdx, Object.assign({ points: pts, lines: lines }, extra));
    }
    if (rel <= 0.35 && w1 >= 2 * atr) {
      var dirC = bothUp ? 1 : -1, guard = dirC > 0 ? lo : up;
      var f = followLine(ctx, guard, detectIdx, dirC, tol), conf = -1, exit = -1, used = [];
      /* Spaetere Swing-Punkte in der Reihenfolge ihrer Bestaetigung, solange der Kanal per Schluss nicht gebrochen ist. */
      for (var j = 0; j < later.length; j++) {
        var q = later[j];
        if (f.broken >= 0 && q.confirmedIndex >= f.broken) break;
        if (!inside(q)) { exit = q.confirmedIndex; break; }
        used.push(q);
        if (conf < 0) conf = q.confirmedIndex;
      }
      var inv = f.broken >= 0 && (exit < 0 || f.broken < exit) ? f.broken : exit;
      var stateC = inv >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
      return { endIdx: inv, f: result(bothUp ? "ASCENDING_CHANNEL" : "DESCENDING_CHANNEL", stateC, used, inv >= 0 ? inv : ctx.t, {
        levels: { upperNow: r4(up.at(ctx.t)), lowerNow: r4(lo.at(ctx.t)), widthAtr: r4(w1 / atr) },
        confirmedAt: conf >= 0 ? s.timestamps[conf] : null,
        invalidatedAt: inv >= 0 ? s.timestamps[inv] : null
      }) };
    }
    /* Keil: gleiche Richtung, Spanne verengt sich um >= 25 %, die "fuehrende" Linie steiler. */
    if (!(w1 <= 0.75 * w0)) return null;
    var rising = bothUp && lo.slope > up.slope, falling = bothDown && up.slope < lo.slope;
    if (!rising && !falling) return null;
    /* Invalidierung an der Trendseite: Schluss mehr als 0,5 ATR jenseits der oberen (steigender Keil) bzw. unteren
       Keillinie. Das hoechste Formationshoch taugt bei vier Punkten nicht: im steigenden Keil uebertrifft das naechste
       Hoch das letzte planmaessig. */
    var dirW = rising ? -1 : 1, breakLine = rising ? lo : up, trendLine = rising ? up : lo;
    function invalidAt(k) { return trendLine.at(k) - dirW * tol; }
    var bIdx = -1, iIdx = -1;
    for (var k = last.index + 1; k <= ctx.t; k++) {
      if (dirW > 0 ? s.close[k] > breakLine.at(k) + 0.1 * atr : s.close[k] < breakLine.at(k) - 0.1 * atr) { bIdx = k; break; }
      if (dirW > 0 ? s.close[k] < invalidAt(k) : s.close[k] > invalidAt(k)) { iIdx = k; break; }
    }
    /* Spaeterer Swing-Punkt jenseits der Trendseite (steigender Keil: Hoch ueber der oberen Linie) bricht den Keil. */
    var firstEv = iIdx >= 0 ? iIdx : bIdx >= 0 ? bIdx : Infinity, usedW = [];
    for (var j2 = 0; j2 < later.length; j2++) {
      var r = later[j2];
      if (r.confirmedIndex >= firstEv) break;
      var outTrend = rising ? r.side === "HIGH" && r.price > up.at(r.index) + tol : r.side === "LOW" && r.price < lo.at(r.index) - tol;
      if (outTrend) { iIdx = r.confirmedIndex; bIdx = -1; break; }
      usedW.push(r);
    }
    var state = iIdx >= 0 ? "INVALIDATED" : bIdx >= 0 ? "CONFIRMED" : "DETECTED";
    /* Erkennung frueher als die Bestaetigung des letzten Punkts ist unmoeglich. */
    var cIdx = bIdx >= 0 ? Math.max(bIdx, detectIdx) : -1;
    return { endIdx: state === "INVALIDATED" ? iIdx : cIdx, f: result(rising ? "RISING_WEDGE" : "FALLING_WEDGE", state, usedW, ctx.t, {
      levels: { breakoutLineNow: r4(breakLine.at(ctx.t)), invalidation: r4(invalidAt(ctx.t)), narrowing: r4(1 - w1 / w0) },
      confirmedAt: state === "CONFIRMED" ? s.timestamps[cIdx] : null, invalidatedAt: state === "INVALIDATED" ? s.timestamps[iIdx] : null
    }) };
  }

  /* Kanal-/Keilstrukturen der letzten Swing-Punkte. Eine Struktur ab c[i] gilt nur als eigene Erkennung, wenn die
     gleichartige Struktur ab c[i-1] bei ihrer Erkennung schon aufgeloest war (sonst ist sie deren Fortsetzung mit
     einem Punkt mehr, keine neue Formation). Aufgeloeste (invalidiert, Keil auch bestaetigt) bleiben LEGACY_KEEP
     Bars gelistet; meist ist es eine Struktur, nach einem Bruch kurz auch die alte neben der neuen. */
  function channelsAndWedges(ctx) {
    var v = ctx.view("scale-2"), out = [];
    if (!v || v.confirmed.length < 4) return out;
    var c = v.confirmed, n = c.length, from = Math.max(0, n - 4 - CW_EXTRA), cache = {};
    function at(i) { if (!(i in cache)) cache[i] = i >= 0 ? structureFrom(ctx, c, i) : null; return cache[i]; }
    for (var i = from; i <= n - 4; i++) {
      var S = at(i);
      if (!S) continue;
      var prev = at(i - 1);
      if (prev && prev.f.type === S.f.type && !(prev.endIdx >= 0 && prev.endIdx <= S.f.detectedIndex)) continue;
      if (S.endIdx >= 0 && ctx.t - S.endIdx > LEGACY_KEEP) continue;
      out.push(S.f);
    }
    return out;
  }

  /* -------------------------------------------------------------- Wimpel */
  /* Mast = eines der letzten beiden bestaetigten Legs: der erste Ruecksetzer im Wimpel kann selbst schon
     als Pivot bestaetigt sein, dann ist das vorletzte Leg der Mast. Der juengere Kandidat hat Vorrang. */
  function pennants(ctx) {
    var v = ctx.view("scale-2"), out = [];
    if (!v || v.confirmed.length < 2) return out;
    var c = v.confirmed;
    for (var q = c.length - 1; q >= Math.max(1, c.length - 2); q--) {
      var found = pennantFrom(ctx, c[q - 1], c[q]);
      if (found) { out.push(found); break; }
    }
    return out;
  }

  /* 1.2.2: Erkennungstag = erster Bar, an dem der Wimpel mit dem damaligen Wissen sichtbar ist (Konsolidierung
     verengt sich an diesem Bar, Mast-Pivot bestaetigt, mindestens 5 Konsolidierungsbars), nicht der fruehestmoegliche
     Bar. Mast und Tempo werden an der ATR dieses fruehestmoeglichen Bars gemessen, nicht an der ATR des Stands t. */
  function pennantFrom(ctx, p0, p1) {
    var s = ctx.series;
    var pole = p1.pivotPrice - p0.pivotPrice, poleBars = Math.max(1, p1.pivotIndex - p0.pivotIndex), dir = pole > 0 ? 1 : -1;
    var from = p1.pivotIndex + 1, maxLen = Math.max(8, Math.round(1.5 * poleBars));
    var earliest = Math.max(from + 5, p1.confirmedIndex), atrCol = ctx.prep.features.columns.atr;
    var atrE = atrCol && atrCol[earliest], atr = isNum(atrE) && atrE > 0 ? atrE : ctx.atr;
    if (earliest > ctx.t) return null;
    if (Math.abs(pole) < 5 * atr || Math.abs(pole) / poleBars < 0.35 * atr) return null;
    var seen = -1;
    /* Scan Bar fuer Bar: Linien nur aus Bars VOR k, Ausbruch an k. */
    for (var k = from + 5; k <= Math.min(ctx.t, from + maxLen); k++) {
      var hiA = -Infinity, hiAi = -1, hiB = -Infinity, hiBi = -1, loA = Infinity, loAi = -1, loB = Infinity, loBi = -1, lowest = Infinity, highest = -Infinity;
      var mid = from + Math.floor((k - from) / 2);
      for (var j = from; j < k; j++) {
        if (j < mid) { if (s.high[j] > hiA) { hiA = s.high[j]; hiAi = j; } if (s.low[j] < loA) { loA = s.low[j]; loAi = j; } }
        else { if (s.high[j] > hiB) { hiB = s.high[j]; hiBi = j; } if (s.low[j] < loB) { loB = s.low[j]; loBi = j; } }
        lowest = Math.min(lowest, s.low[j]); highest = Math.max(highest, s.high[j]);
      }
      var retr = dir > 0 ? p1.pivotPrice - lowest : highest - p1.pivotPrice;
      var converging = hiB < hiA && loB > loA;
      if (retr > 0.5 * Math.abs(pole) || retr < 0) return null;
      if (!converging) continue;          // Konsolidierung noch nicht verengt: weiter beobachten
      var up = lineThrough({ index: hiAi, price: hiA }, { index: hiBi, price: hiB });
      var lo = lineThrough({ index: loAi, price: loA }, { index: loBi, price: loB });
      var invalid = dir > 0 ? lowest : highest;
      var extra = {
        points: [{ time: p0.pivotTime, price: r4(p0.pivotPrice) }, { time: p1.pivotTime, price: r4(p1.pivotPrice) }],
        lines: [Object.assign({ role: "upper" }, seg(s, up, from, k)), Object.assign({ role: "lower" }, seg(s, lo, from, k)),
                { role: "pole", from: { time: p0.pivotTime, price: r4(p0.pivotPrice) }, to: { time: p1.pivotTime, price: r4(p1.pivotPrice) } }],
        levels: { pole: r4(Math.abs(pole)), invalidation: r4(invalid), upperNow: r4(up.at(k)), lowerNow: r4(lo.at(k)) }, confirmedAt: null, invalidatedAt: null
      };
      var type = dir > 0 ? "BULL_PENNANT" : "BEAR_PENNANT";
      /* 1.2.1: Invalidierung vor der Erkennung = zum Erkennungszeitpunkt nie sichtbar (wie beim Ausbruch). */
      /* Bruch vor dem fruehestmoeglichen Erkennungsbar: nie sichtbar gewesen. Bruch danach, aber vor der ersten
         Sichtbarkeit: sichtbar erst am Bruchtag (erkannt und bestaetigt bzw. invalidiert am selben Tag). */
      if (dir > 0 ? s.close[k] < invalid : s.close[k] > invalid) {
        if (k < earliest) return null;
        extra.invalidatedAt = s.timestamps[k]; return base(ctx, type, "INVALIDATED", seen >= 0 ? seen : k, extra);
      }
      if (dir > 0 ? s.close[k] > Math.max(up.at(k), hiB) : s.close[k] < Math.min(lo.at(k), loB)) {
        if (k < earliest) return null;
        extra.confirmedAt = s.timestamps[k]; return base(ctx, type, "CONFIRMED", seen >= 0 ? seen : k, extra);
      }
      if (k >= earliest && seen < 0) seen = k;
      if (k === ctx.t && seen >= 0) return base(ctx, type, "DETECTED", seen, extra);
    }
    return null;
  }

  /* ------------------------------------------------- Range-Ausbruch */
  function rangeBreakout(ctx, lookback) {
    lookback = lookback || 30;
    var s = ctx.series, out = [], atrCol = ctx.prep.features.columns.atr;
    /* Juengster Ausbruchsbar in den letzten 10 Bars (Ausbruch an k: Range = Bars k-lookback .. k-1). */
    for (var k = ctx.t; k >= Math.max(lookback, ctx.t - 9); k--) {
      var hi = -Infinity, lo = Infinity;
      for (var j = k - lookback; j < k; j++) { hi = Math.max(hi, s.high[j]); lo = Math.min(lo, s.low[j]); }
      var a = atrCol[k - 1];
      if (!isNum(a) || hi - lo > 6 * a || (hi - lo) / hi > 0.15) continue;
      if (!(s.close[k] > hi && s.close[k - 1] <= hi)) continue;
      var midR = (hi + lo) / 2, inv = -1, conf = -1;
      for (var m = k + 1; m <= ctx.t; m++) { if (s.close[m] < midR) { inv = m; break; } if (conf < 0 && s.close[m] > hi) conf = m; }
      var state = inv >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
      out.push(base(ctx, "RANGE_BREAKOUT", state, k, {
        points: [], lines: [{ role: "range-top", from: { time: s.timestamps[k - lookback], price: r4(hi) }, to: { time: s.timestamps[ctx.t], price: r4(hi) } },
                            { role: "range-bottom", from: { time: s.timestamps[k - lookback], price: r4(lo) }, to: { time: s.timestamps[k], price: r4(lo) } }],
        zone: { from: s.timestamps[k - lookback], to: s.timestamps[k - 1], low: r4(lo), high: r4(hi) },
        levels: { rangeHigh: r4(hi), rangeLow: r4(lo), invalidation: r4(midR), breakoutClose: r4(s.close[k]) },
        confirmedAt: state === "CONFIRMED" ? s.timestamps[conf] : null, invalidatedAt: inv >= 0 ? s.timestamps[inv] : null
      }));
      break;
    }
    return out;
  }

  /* ------------------------------------------ Widerstands-Ausbruch */
  function resistanceBreakout(ctx, atFn) {
    var s = ctx.series, out = [];
    for (var k = ctx.t; k >= Math.max(1, ctx.t - 9); k--) {
      var prev = atFn(k - 1), lv = Lv.supportResistance(prev);
      /* Widerstand = naechste Zone ueber dem Vortagesschluss mit mindestens zwei Swing-Kontakten. */
      var z = (lv.resistances || []).filter(function (x) { return x.touches >= 2; })[0];
      if (!z || !(s.close[k] > z.zoneHigh && s.close[k - 1] <= z.zoneHigh)) continue;
      var inv = -1, conf = -1;
      for (var m = k + 1; m <= ctx.t; m++) { if (s.close[m] < z.zoneLow) { inv = m; break; } if (conf < 0 && s.close[m] > z.zoneHigh) conf = m; }
      var state = inv >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
      out.push(base(ctx, "RESISTANCE_BREAKOUT", state, k, {
        points: [], lines: [],
        zone: { from: s.timestamps[Math.max(0, k - 60)], to: s.timestamps[ctx.t], low: r4(z.zoneLow), high: r4(z.zoneHigh) },
        levels: { zoneLow: r4(z.zoneLow), zoneHigh: r4(z.zoneHigh), touches: z.touches, invalidation: r4(z.zoneLow), breakoutClose: r4(s.close[k]) },
        confirmedAt: state === "CONFIRMED" ? s.timestamps[conf] : null, invalidatedAt: inv >= 0 ? s.timestamps[inv] : null
      }));
      break;
    }
    return out;
  }

  /* ------------------------------------------------- Kursluecken */
  /* Datenverdacht statt Luecke: Schlussfaktor mit Split-Signatur (n oder 1/n, n = 2..50, ±2 %) oder
     ausserhalb 0,2..5. So sehen nicht nachgezogene Splits, Abspaltungen und Datenfehler aus (DQ-PX-3). */
  function suspectJump(ratio) {
    if (!isNum(ratio) || ratio <= 0) return true;
    if (ratio < 0.2 || ratio > 5) return true;
    var r = ratio >= 1 ? ratio : 1 / ratio, n = Math.round(r);
    return n >= 2 && Math.abs(r / n - 1) <= 0.02;
  }
  /* Je Richtung die juengste Luecke der letzten 20 Bars; Volumenbedingung nur, wenn die Reihe Volumen hat. */
  function gaps(ctx) {
    var s = ctx.series, out = [], atrCol = ctx.prep.features.columns.atr, rv = ctx.prep.features.columns.relativeVolume;
    [1, -1].forEach(function (dir) {
      for (var k = ctx.t; k >= Math.max(1, ctx.t - 19); k--) {
        var a = atrCol[k - 1], edge = dir > 0 ? s.high[k - 1] : s.low[k - 1];
        var size = dir > 0 ? s.low[k] - s.high[k - 1] : s.low[k - 1] - s.high[k];
        /* 1.2.1: ATR 0 (ruhender Titel) macht jede Null-"Luecke" gross genug; ohne Bewegung keine Luecke. */
        if (!isNum(a) || !(a > 0) || !isNum(size) || !(size > 0) || size < 0.5 * a) continue;
        if (ctx.hasVolume && !(isNum(rv[k]) && rv[k] >= 1.5)) continue;
        if (suspectJump(s.close[k] / s.close[k - 1])) continue;
        var inv = -1, conf = -1, held = 0;
        for (var m = k; m <= ctx.t; m++) {
          if (dir > 0 ? s.close[m] < edge : s.close[m] > edge) { inv = m; break; }
          if (m > k && ++held === 3 && conf < 0) conf = m;
        }
        var state = inv >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
        var far = dir > 0 ? s.low[k] : s.high[k];
        out.push(base(ctx, dir > 0 ? "GAP_UP" : "GAP_DOWN", state, k, {
          points: [], lines: [],
          zone: { from: s.timestamps[k - 1], to: s.timestamps[ctx.t], low: r4(Math.min(edge, far)), high: r4(Math.max(edge, far)) },
          levels: { gapLow: r4(Math.min(edge, far)), gapHigh: r4(Math.max(edge, far)), gapAtr: r4(size / a), relativeVolume: ctx.hasVolume ? r4(rv[k]) : null, invalidation: r4(edge) },
          confirmedAt: conf >= 0 ? s.timestamps[conf] : null, invalidatedAt: inv >= 0 ? s.timestamps[inv] : null
        }));
        break;
      }
    });
    return out;
  }

  /* -------------------------------------- Volatilitaetskontraktion */
  function contraction(ctx) {
    var v = ctx.view("scale-1"), out = [], s = ctx.series;
    if (!v || v.confirmed.length < 6) return out;
    var c = v.confirmed, horizon = ctx.t - 2 * ctx.profile.barsPerYear / 4;   // ~6 Monate
    var legs = [];
    for (var i = 1; i < c.length; i++) if (c[i - 1].side === "HIGH" && c[i].side === "LOW" && c[i - 1].pivotIndex >= horizon)
      legs.push({ high: c[i - 1], low: c[i], depth: 1 - c[i].pivotPrice / c[i - 1].pivotPrice });
    if (legs.length < 3) return out;
    /* laengste Folge streng kleiner werdender Ruecksetzer am Ende */
    var seq = [legs[legs.length - 1]];
    for (var q = legs.length - 2; q >= 0; q--) { if (legs[q].depth * 0.8 >= seq[0].depth) seq.unshift(legs[q]); else break; }
    if (seq.length < 3) return out;
    var lastLeg = seq[seq.length - 1];
    if (lastLeg.depth > 0.12) return out;
    var detectIdx = lastLeg.low.confirmedIndex, sma50 = ctx.prep.features.columns.sma50;
    if (!isNum(sma50 && sma50[detectIdx]) || s.close[detectIdx] <= sma50[detectIdx]) return out;
    /* Pivot = Hoch nach dem letzten Tief, bekannt bis t; sonst das Hoch des letzten Rücksetzers. */
    var pivot = lastLeg.high.pivotPrice, inv = lastLeg.low.pivotPrice, conf = -1, broken = -1;
    for (var k = detectIdx + 1; k <= ctx.t; k++) {
      if (s.close[k] < inv) { broken = k; break; }
      if (s.close[k] > pivot) { conf = k; break; }
    }
    var state = broken >= 0 ? "INVALIDATED" : conf >= 0 ? "CONFIRMED" : "DETECTED";
    out.push(base(ctx, "VOLATILITY_CONTRACTION", state, detectIdx, {
      points: seq.reduce(function (a, l) { return a.concat([{ time: l.high.pivotTime, price: r4(l.high.pivotPrice), side: "HIGH" }, { time: l.low.pivotTime, price: r4(l.low.pivotPrice), side: "LOW" }]); }, []),
      lines: [{ role: "pivot", from: { time: lastLeg.high.pivotTime, price: r4(pivot) }, to: { time: s.timestamps[ctx.t], price: r4(pivot) } }],
      levels: { pivot: r4(pivot), invalidation: r4(inv), depths: seq.map(function (l) { return r4(l.depth); }) },
      confirmedAt: conf >= 0 ? s.timestamps[conf] : null, invalidatedAt: broken >= 0 ? s.timestamps[broken] : null
    }));
    return out;
  }

  /* -------------------------------- Bestandsformationen uebersetzen */
  function legacyFormation(ctx, p) {
    var s = ctx.series, L = LEGACY[p.type] || { family: "OTHER", confirm: "", invalidate: "" };
    var state = LEGACY_STATE[p.status] || "DETECTED";
    var detIdx = isNum(p.detectionIndex) ? p.detectionIndex : ctx.t;
    /* Erkannt wird eine Formation, sobald ihr letzter Punkt bestaetigt war — nicht erst beim Ausbruch.
       Flaggen werden erst erkennbar, wenn auch Ruecklauf und Mindestdauer erfuellt sind (knownIndex). */
    var lastConfirmed = p.points.length ? s.timestamps.indexOf(p.points[p.points.length - 1].confirmedAt) : -1;
    var firstKnown = Math.max(lastConfirmed >= 0 ? lastConfirmed : detIdx, isNum(p.knownIndex) ? p.knownIndex : -1);
    var lines = [];
    if (p.neckline) lines.push({ role: "neckline", from: p.neckline.from, to: { time: s.timestamps[ctx.t], price: p.neckline.atNow } });
    /* Ober-/Unterkante beginnen am ersten Hoch bzw. Tief der Formation (nicht am ersten Punkt schlechthin). */
    var firstHigh = p.points.filter(function (q) { return q.side === "HIGH"; })[0], firstLow = p.points.filter(function (q) { return q.side === "LOW"; })[0];
    var endT = s.timestamps[ctx.t];
    if (isNum(p.upperNow) && firstHigh) lines.push({ role: "upper", from: { time: firstHigh.time, price: firstHigh.price }, to: { time: endT, price: p.upperNow } });
    if (isNum(p.lowerNow) && firstLow) lines.push({ role: "lower", from: { time: firstLow.time, price: firstLow.price }, to: { time: endT, price: p.lowerNow } });
    /* Ein Fehlausbruch war erst bestaetigt, dann invalidiert: beide Zeitpunkte bleiben sichtbar. */
    var confirmedAt = (state === "CONFIRMED" || p.status === "FAILED_BREAKOUT") && p.detectionTime ? p.detectionTime : null;
    return {
      id: p.type + "@" + s.timestamps[firstKnown], type: p.type, name: p.name, family: L.family, direction: p.direction,
      /* Symmetrisches Dreieck/Rechteck ohne Ausbruch: Richtung noch offen (direction ist dann nur ein Platzhalter). */
      directionOpen: p.bias === "OPEN" && state === "DETECTED",
      state: state, stateLabel: STATES[state], timeframe: s.timeframe || "1D", asOf: ctx.time,
      detectedAt: s.timestamps[firstKnown], detectedIndex: firstKnown,
      confirmedAt: confirmedAt,
      invalidatedAt: state === "INVALIDATED" && isNum(p.failedIndex) ? s.timestamps[p.failedIndex] : null,
      points: p.points.map(function (q) { return { time: q.time, price: q.price, side: q.side }; }), lines: lines,
      levels: { breakout: p.breakoutLevel, invalidation: p.invalidation && p.invalidation.price, targetLow: p.target && p.target.zoneLow, targetHigh: p.target && p.target.zoneHigh, height: p.height },
      rules: { detect: "Regelwerk " + Pat.ENGINE_VERSION + " (bestätigte Pivots, Skala 2; Lebenszyklus über Anker).", confirm: L.confirm, invalidate: L.invalidate },
      dataQuality: quality(ctx), source: Pat.ENGINE_VERSION
    };
  }
  /* Bar der Aufloesung einer Bestandsformation (Bestaetigung bzw. Invalidierung), sonst -1. */
  function legacyResolvedIdx(p) {
    var st = LEGACY_STATE[p.status];
    if (st === "INVALIDATED") return isNum(p.failedIndex) ? p.failedIndex : -1;
    if (st === "CONFIRMED") return isNum(p.detectionIndex) ? p.detectionIndex : -1;
    return -1;
  }

  /**
   * Bestandsformationen mit Lebenszyklus. Anker = t und die Bars unmittelbar vor jeder Pivot-Bestaetigung
   * (Skala 2 und 3) in den letzten `open` + LEGACY_KEEP Bars: am Anker a war das vorherige Pivot-Fenster der
   * letzte Stand, an dem diese Formationen sichtbar waren. Ihre Geometrie bleibt Stand a, Ausbruch und
   * Invalidierung werden mit Schlusskursen bis t verfolgt (Pat.analyze mit lifecycle/until). Kausal: Pivots mit
   * confirmedIndex <= a <= t, Kurse <= t. Gleiche ID an mehreren Ankern: der juengste Anker gewinnt.
   */
  function legacy(ctx) {
    var prep = ctx.prep, t = ctx.t, open = Math.max(4, Math.round(ctx.profile.barsPerYear / 12));
    var anchors = [t];
    ["scale-2", "scale-3"].forEach(function (sid) {
      var sc = prep.pivots.scales[sid];
      if (!sc) return;
      for (var q = sc.pivots.length - 1; q >= 0; q--) {
        var ci = sc.pivots[q].confirmedIndex;
        if (ci > t) continue;
        if (ci <= t - open - LEGACY_KEEP) break;
        if (ci >= 1 && anchors.indexOf(ci - 1) < 0) anchors.push(ci - 1);
      }
    });
    anchors.sort(function (a, b) { return b - a; });
    var out = [], seen = {};
    anchors.forEach(function (a) {
      var actx = a === t ? ctx : Ctx.at(prep, a);
      var r = Pat.analyze(actx, { lifecycle: true, until: t });
      (r.patterns || []).forEach(function (p) {
        var f = legacyFormation(ctx, p), e = legacyResolvedIdx(p);
        if (seen[f.id]) return;
        /* Vor der eigenen Erkennung invalidiert: war nie eine gueltige Formation. */
        if (f.state === "INVALIDATED" && e >= 0 && e < f.detectedIndex) return;
        /* Invalidierte bleiben LEGACY_KEEP Bars gelistet (wie bei den neuen Regeln). */
        if (f.state === "INVALIDATED" && t - e > LEGACY_KEEP) return;
        if (a < t) {
          /* Abgeloest: unaufgeloest hoechstens `open` Bars nach dem Anker; aufgeloest LEGACY_KEEP Bars, sofern die
             Aufloesung hoechstens `open` Bars nach dem Anker lag (sonst war die Formation vorher schon verfallen). */
          if (f.state === "DETECTED" ? t - a > open : !(t - e <= LEGACY_KEEP && e - a <= open)) return;
        }
        seen[f.id] = true;
        out.push(f);
      });
    });
    return out;
  }

  /**
   * Alle Formationen Stand Bar t.
   * @param prep  Ergebnis von TIContext.prepare(series)
   * @param t     Stand-Bar (Standard: letzte Bar)
   */
  function analyzeAt(prep, t) {
    var ctx = Ctx.at(prep, t);
    var memo = {};
    function atFn(k) { if (!memo[k]) memo[k] = Ctx.at(prep, k); return memo[k]; }
    var all = [].concat(legacy(ctx), trendlines(ctx), channelsAndWedges(ctx), pennants(ctx), rangeBreakout(ctx), resistanceBreakout(ctx, atFn), contraction(ctx), gaps(ctx));
    all.forEach(function (f) { if (f.detectedIndex > ctx.t) throw new Error("LOOKAHEAD:" + f.id); });
    all.forEach(annotate);
    var order = { CONFIRMED: 0, DETECTED: 1, INVALIDATED: 2 };
    all.sort(function (a, b) { return order[a.state] - order[b.state] || b.detectedIndex - a.detectedIndex || (a.type < b.type ? -1 : 1); });
    return { engineVersion: ENGINE_VERSION, asOf: ctx.time, asOfIndex: ctx.t, timeframe: prep.series.timeframe || "1D", formations: all, dataQuality: quality(ctx) };
  }

  /**
   * Ehrliche Statusangaben (Owner-Entscheidung zu #938):
   *  confirmedAtDetection  Ausbruch spaetestens am Tag der ersten zuverlaessigen Erkennung - die Formation war
   *                        vorher NICHT erkannt (z. B. Keile, deren 4. Punkt erst mit dem Ausbruch bestaetigt ist).
   *  breakout              Zeitpunkt und Richtung des Ausbruchs, sobald einer festgehalten ist (auch bei Fehlausbruch).
   *  provisional           Kanal aus vier bestaetigten Swing-Punkten, noch ohne fuenften Punkt im Kanal.
   */
  function annotate(f) {
    f.confirmedAtDetection = !!(f.confirmedAt && f.detectedAt && f.confirmedAt <= f.detectedAt);
    f.breakout = f.confirmedAt ? { at: f.confirmedAt, direction: f.direction === "BEARISH" ? "DOWN" : "UP" } : null;
    f.provisional = f.family === "CHANNEL" && f.state === "DETECTED";
    if (f.directionOpen === undefined) f.directionOpen = false;
  }

  function analyze(series, opts) {
    var prep = Ctx.prepare(series, opts);
    return analyzeAt(prep, series.length - 1);
  }

  /**
   * Historische Erkennungen im Fenster [fromIndex, t]: an jedem Bar, an dem ein neuer Pivot bestaetigt wurde,
   * plus am letzten Bar. Jede Formation erscheint mit dem Zustand, den sie AM ERKENNUNGSZEITPUNKT hatte,
   * und dem heutigen Zustand (`stateNow`). Damit ist nachvollziehbar, was damals bekannt war.
   */
  function history(prep, fromIndex, t) {
    t = isNum(t) ? t : prep.series.length - 1;
    var marks = {};
    Object.keys(prep.pivots.scales).forEach(function (sid) {
      prep.pivots.scales[sid].pivots.forEach(function (p) { if (p.confirmedIndex >= fromIndex && p.confirmedIndex <= t) marks[p.confirmedIndex] = true; });
    });
    var seen = {}, list = [];
    Object.keys(marks).map(Number).sort(function (a, b) { return a - b; }).concat([t]).forEach(function (k) {
      analyzeAt(prep, k).formations.forEach(function (f) {
        if (seen[f.id] || f.detectedIndex < fromIndex) return;
        seen[f.id] = true;
        list.push({ id: f.id, type: f.type, name: f.name, direction: f.direction, detectedAt: f.detectedAt, stateAtDetection: f.state, knownAt: prep.series.timestamps[k] });
      });
    });
    var now = analyzeAt(prep, t).formations, byId = {};
    now.forEach(function (f) { byId[f.id] = f.state; });
    list.forEach(function (h) { h.stateNow = byId[h.id] || null; });
    return list;
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, LEGACY_KEEP: LEGACY_KEEP, STATES: STATES, RULES: RULES, LEGACY: LEGACY, LEGACY_STATE: LEGACY_STATE,
              analyze: analyze, analyzeAt: analyzeAt, history: history, suspectJump: suspectJump };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Formations = api; }
})(typeof window !== "undefined" ? window : globalThis);
