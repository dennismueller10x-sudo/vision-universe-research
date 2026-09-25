/* =========================================================================
   VISION UNIVERSE — quant/engines/multi-asset/market-pulse.js

   MARKET PULSE — DESKRIPTIV, DETERMINISTISCH, OHNE SCORE

   Beschreibt den beobachtbaren Zustand der Maerkte in fuenf getrennten
   Dimensionen: TREND, BREADTH, MOMENTUM, RISK, CROSS_ASSET. Jede
   Dimension liefert STATE, EVIDENCE (Messwerte mit Nenner und Stand),
   EXPLANATION (was es fuer Anleger bedeutet) und METHODOLOGY (die Regel).

   WAS DAS NICHT IST

   - Kein Quant Market Regime. Der zertifizierte Regime-Vertrag ist
     FAIL_CLOSED (docs/VU_QUANT_2_ORCHESTRATOR_STATE.md) und wird hier
     weder imitiert noch umgangen. Der Name ist bewusst ein anderer.
   - Kein Macro Regime (MACRO_REGIME = NOT_CERTIFIED).
   - Keine Prognose, kein Gesamtscore, keine Kaufampel. Gleiche Daten
     ergeben immer dieselbe Aussage; kein Modell entscheidet.

   Schwellen stehen in quant/config/market-pulse.json, versioniert; die
   Kalibrierung (historische Verteilung, Phasenpruefung) schreibt
   scripts/market/build-market-pulse.mjs --calibrate.

   Node und Browser (global.VUMarketPulse).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var METHOD_VERSION = "market-pulse-1.0.0";
  /* Handelstage je Horizont (Boersenkalender, keine Kalendertage). */
  var H = { "1M": 21, "3M": 63, "6M": 126, "1Y": 252 };

  /* ------------------------------------------------------------ Helfer */

  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function rnd(x, d) { if (!isNum(x)) return null; var f = Math.pow(10, d); return Math.round(x * f) / f; }
  function median(a) {
    var s = a.filter(isNum).slice().sort(function (x, y) { return x - y; });
    if (!s.length) return null;
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function sd(a) {
    if (a.length < 2) return null;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }
  function fmt(x, d) {
    if (!isNum(x)) return "–";
    try { return new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(x); }
    catch (_) { return x.toFixed(d); }
  }
  function signed(x, d, unit) {
    if (!isNum(x)) return "–";
    return (x > 0 ? "+" : x < 0 ? "−" : "±") + fmt(Math.abs(x), d) + (unit || "");
  }
  function pct(part, whole) { return whole > 0 ? (100 * part / whole) : null; }

  /* ------------------------------------------------ Signale je Reihe */

  /**
   * Kennzahlen einer Tagesreihe [[datum, wert]] (aufsteigend, Werte > 0).
   * Nur, was die Reihe traegt: ohne 200 Beobachtungen keine 200-Tage-Linie.
   */
  function seriesSignals(points) {
    var p = (points || []).filter(function (x) { return x && isNum(x[1]) && x[1] > 0; });
    var n = p.length;
    if (!n) return null;
    var c = p.map(function (x) { return x[1]; });
    var last = c[n - 1];
    function sma(k) { if (n < k) return null; var s = 0; for (var i = n - k; i < n; i++) s += c[i]; return s / k; }
    function ret(k) { return n > k ? 100 * (last / c[n - 1 - k] - 1) : null; }
    var sma50 = sma(50), sma200 = sma(200);
    var vol20 = null;
    if (n > 20) {
      var r = [];
      for (var i = n - 20; i < n; i++) r.push(Math.log(c[i] / c[i - 1]));
      vol20 = sd(r) * Math.sqrt(252) * 100;
    }
    var hi = null;
    if (n >= 2) { hi = 0; for (var j = Math.max(0, n - H["1Y"]); j < n; j++) if (c[j] > hi) hi = c[j]; }
    return {
      asOf: p[n - 1][0], observations: n, last: last,
      sma50: sma50, sma200: sma200,
      above50: sma50 === null ? null : last > sma50,
      above200: sma200 === null ? null : last > sma200,
      dist50: sma50 === null ? null : 100 * (last / sma50 - 1),
      dist200: sma200 === null ? null : 100 * (last / sma200 - 1),
      ret: { "1M": ret(H["1M"]), "3M": ret(H["3M"]), "6M": ret(H["6M"]) },
      vol20: vol20,
      drawdown52w: hi ? 100 * (last / hi - 1) : null
    };
  }

  /**
   * Wie ungewoehnlich ist die juengste Veraenderung ueber k Beobachtungen,
   * gemessen an der eigenen Historie? Verhaeltnis zur Standardabweichung
   * aller ueberlappenden k-Veraenderungen im Fenster (kein Mittelwertabzug:
   * "x-fach eine typische Bewegung").
   * kind: "PERCENT" (relative Veraenderung) | "BP" (Differenz * 100).
   */
  function moveRatio(points, k, kind, windowObs) {
    var p = (points || []).filter(function (x) { return x && isNum(x[1]); });
    var n = p.length;
    if (n <= k + 20) return null;
    var from = Math.max(k, n - (windowObs || n));
    var ch = [];
    function change(i) {
      var a = p[i - k][1], b = p[i][1];
      return kind === "BP" ? (b - a) * 100 : (a > 0 ? 100 * (b / a - 1) : null);
    }
    for (var i = from; i < n; i++) { var v = change(i); if (isNum(v)) ch.push(v); }
    var typ = Math.sqrt(ch.reduce(function (s, x) { return s + x * x; }, 0) / Math.max(1, ch.length - 1));
    var cur = change(n - 1);
    if (!isNum(cur) || !(typ > 0)) return null;
    return { change: cur, typical: typ, ratio: cur / typ, samples: ch.length, from: p[from][0], to: p[n - 1][0], kind: kind, horizon: k };
  }

  /* ------------------------------------------------------ Dimensionen */

  function dim(id, state, label, summary, evidence, explanation, methodology, extra) {
    var d = { id: id, state: state, label: label, summary: summary, evidence: evidence || [],
              explanation: explanation, methodology: methodology };
    if (extra) Object.keys(extra).forEach(function (k) { d[k] = extra[k]; });
    return d;
  }

  /**
   * TREND: Lage der grossen US-Markt-Tracker zu ihrer 50- und 200-Tage-Linie.
   * @param {object} sigs {SYM: seriesSignals} @param {object} names {SYM: "S&P 500"}
   * @param {object} cfg config.trend
   */
  function trend(sigs, names, cfg) {
    var syms = Object.keys(sigs).filter(function (s) { return sigs[s] && sigs[s].above50 !== null && sigs[s].above200 !== null; });
    var meth = "Je Markt-Tracker (" + Object.keys(sigs).join(", ") + "): Schlusskurs über bzw. unter seinem 50- und " +
      "200-Tage-Durchschnitt. Positiv, wenn mindestens " + cfg.majority + " der Tracker über beiden Linien liegen; " +
      "negativ, wenn mindestens " + cfg.majority + " unter beiden liegen; sonst gemischt. Die Tracker sind ETF-Kurse, keine Indexstände.";
    if (syms.length < cfg.minTrackers) {
      return dim("TREND", "UNAVAILABLE", "Nicht bestimmbar", "Zu wenige Tracker mit ausreichender Historie.", [], null, meth);
    }
    var up = syms.filter(function (s) { return sigs[s].above50 && sigs[s].above200; });
    var down = syms.filter(function (s) { return !sigs[s].above50 && !sigs[s].above200; });
    var need = Math.min(cfg.majority, syms.length);
    var state = up.length >= need ? "POSITIVE" : down.length >= need ? "NEGATIVE" : "MIXED";
    var label = { POSITIVE: "Aufwärtstrend", NEGATIVE: "Abwärtstrend", MIXED: "Kein klarer Trend" }[state];
    var summary = state === "POSITIVE" ? up.length + " von " + syms.length + " großen US-Markt-Trackern liegen über ihrem mittel- und langfristigen Trend."
      : state === "NEGATIVE" ? down.length + " von " + syms.length + " großen US-Markt-Trackern liegen unter ihrem mittel- und langfristigen Trend."
      : "Die großen US-Markt-Tracker liegen teils über, teils unter ihrem mittel- und langfristigen Trend.";
    var ev = syms.map(function (s) {
      var g = sigs[s];
      return { key: s, label: (names[s] || s) + " (Tracker " + s + ")",
               text: (g.above50 ? "über" : "unter") + " 50-Tage-Linie (" + signed(g.dist50, 1, " %") + "), " +
                     (g.above200 ? "über" : "unter") + " 200-Tage-Linie (" + signed(g.dist200, 1, " %") + ")",
               above50: g.above50, above200: g.above200, dist50: rnd(g.dist50, 2), dist200: rnd(g.dist200, 2), asOf: g.asOf };
    });
    return dim("TREND", state, label, summary, ev,
      "Liegen die Kurse über ihren gleitenden Durchschnitten, ist der Markt über Wochen und Monate gestiegen. Das beschreibt die Vergangenheit, keine Vorhersage.",
      meth, { counts: { above: up.length, below: down.length, of: syms.length } });
  }

  /**
   * MOMENTUM: Richtung und Tempo der Tracker ueber 1, 3 und 6 Monate.
   * Ueberschneidung mit TREND (6M-Rendite und Lage zur 200-Tage-Linie
   * sind korreliert) ist dokumentiert; die Schlagzeile nutzt MOMENTUM nicht.
   */
  function momentum(sigs, names) {
    var syms = Object.keys(sigs).filter(function (s) { return sigs[s] && isNum(sigs[s].ret["3M"]) && isNum(sigs[s].ret["6M"]); });
    var meth = "Median der Kursveränderung der Tracker über 3 und 6 Monate (63/126 Handelstage). Steigend, wenn beide Mediane positiv sind; " +
      "fallend, wenn beide negativ sind; sonst uneinheitlich. Tempo: Vergleich des 1-Monats-Medians mit dem durchschnittlichen Monat der letzten 3 Monate.";
    if (syms.length < 2) return dim("MOMENTUM", "UNAVAILABLE", "Nicht bestimmbar", "Zu wenig Historie.", [], null, meth);
    var m1 = median(syms.map(function (s) { return sigs[s].ret["1M"]; }));
    var m3 = median(syms.map(function (s) { return sigs[s].ret["3M"]; }));
    var m6 = median(syms.map(function (s) { return sigs[s].ret["6M"]; }));
    var state = m3 > 0 && m6 > 0 ? "RISING" : m3 < 0 && m6 < 0 ? "FALLING" : "MIXED";
    var pace = isNum(m1) ? (m1 > m3 / 3 ? "ACCELERATING" : "SLOWING") : null;
    var label = { RISING: "Aufwärtsdynamik", FALLING: "Abwärtsdynamik", MIXED: "Uneinheitliche Dynamik" }[state];
    var tempo = pace === null ? "" : state === "RISING"
      ? (pace === "ACCELERATING" ? " Der letzte Monat war stärker als der Schnitt." : " Der letzte Monat war schwächer als der Schnitt – das Tempo lässt nach.")
      : state === "FALLING"
      ? (pace === "ACCELERATING" ? " Der letzte Monat war besser als der Schnitt – der Abwärtsdruck lässt nach." : " Der letzte Monat war schwächer als der Schnitt.")
      : "";
    var ev = [
      { key: "median1M", label: "Median 1 Monat", text: signed(m1, 1, " %"), value: rnd(m1, 2) },
      { key: "median3M", label: "Median 3 Monate", text: signed(m3, 1, " %"), value: rnd(m3, 2) },
      { key: "median6M", label: "Median 6 Monate", text: signed(m6, 1, " %"), value: rnd(m6, 2) }
    ].concat(syms.map(function (s) {
      var r = sigs[s].ret;
      return { key: s, label: (names[s] || s) + " (Tracker " + s + ")",
               text: "1M " + signed(r["1M"], 1, " %") + " · 3M " + signed(r["3M"], 1, " %") + " · 6M " + signed(r["6M"], 1, " %") };
    }));
    return dim("MOMENTUM", state, label, label + " über 3 und 6 Monate." + tempo, ev,
      "Momentum beschreibt, wie kräftig sich die Märkte zuletzt bewegt haben. Es ist eng mit dem Trend verwandt und zählt deshalb nicht doppelt.",
      meth, { pace: pace });
  }

  /**
   * RISK: realisierte Schwankung des S&P-500-Trackers (20 Tage, annualisiert)
   * gegen die eigene Historie, dazu der Abstand zum 52-Wochen-Hoch.
   */
  function risk(sig, cfg, name) {
    var v = cfg.vol20, dd = cfg.drawdown;
    var wer = cfg.benchmarkLabel || name || "des Trackers";
    var reihe = cfg.series && cfg.series.source === "tiingo-equity" ? " – Tiingo, split-bereinigter Schlusskurs ohne Ausschüttungen; ETF-Kurs, kein Indexstand" : "";
    var meth = "Schwankung: annualisierte Standardabweichung der täglichen Log-Renditen von " + wer + reihe + " – über 20 Handelstage, verglichen mit " +
      "der Verteilung desselben Trackers seit " + v.calibratedFrom + " (" + v.samples + " Beobachtungen). Erhöht ab dem " + v.elevatedPercentile + ". Perzentil (" + fmt(v.elevated, 1) +
      " %), hoch ab dem " + v.highPercentile + ". Perzentil (" + fmt(v.high, 1) + " %). Rückgang vom 52-Wochen-Hoch: erhöht ab " + fmt(dd.elevated, 0) +
      " % (Korrektur), hoch ab " + fmt(dd.high, 0) + " % (Bärenmarkt-Konvention). Es gilt die höhere der beiden Stufen.";
    if (!sig || !isNum(sig.vol20) || !isNum(sig.drawdown52w)) return dim("RISK", "UNAVAILABLE", "Nicht bestimmbar", "Zu wenig Historie.", [], null, meth);
    var sv = sig.vol20 >= v.high ? 2 : sig.vol20 >= v.elevated ? 1 : 0;
    var sd2 = sig.drawdown52w <= dd.high ? 2 : sig.drawdown52w <= dd.elevated ? 1 : 0;
    var lvl = Math.max(sv, sd2);
    var state = ["NORMAL", "ELEVATED", "HIGH"][lvl];
    var label = ["Normal", "Erhöht", "Hoch"][lvl];
    var summary = lvl === 0 ? "Die Kursschwankungen liegen im üblichen Rahmen."
      : (sv >= sd2 ? "Die Kursschwankungen sind " + (lvl === 2 ? "sehr hoch" : "höher als üblich") + "."
                   : "Der Markt liegt " + fmt(Math.abs(sig.drawdown52w), 1) + " % unter seinem 52-Wochen-Hoch.");
    return dim("RISK", state, label, summary, [
      { key: "vol20", label: "Schwankung von " + (cfg.benchmarkLabel || name || "dem Tracker") + ", 20 Tage annualisiert", text: fmt(sig.vol20, 1) + " %", value: rnd(sig.vol20, 2),
        context: "Median von " + (cfg.benchmarkLabel || "dem Tracker") + " seit " + v.calibratedFrom + ": " + fmt(v.median, 1) + " %", asOf: sig.asOf },
      
        { key: "drawdown52w", label: "Abstand von " + (cfg.benchmarkLabel || "dem Tracker") + " zum 52-Wochen-Hoch", text: signed(sig.drawdown52w, 1, " %"), value: rnd(sig.drawdown52w, 2), asOf: sig.asOf }
    ], "Starke Schwankungen bedeuten größere Tagesbewegungen in beide Richtungen. Das ist kein Signal zum Kaufen oder Verkaufen.", meth,
    { levels: { volatility: ["NORMAL", "ELEVATED", "HIGH"][sv], drawdown: ["NORMAL", "ELEVATED", "HIGH"][sd2] } });
  }

  /**
   * BREADTH: wie viele Aktien des Discover-Universums den Markt tragen.
   * Schwelle 50 % ist definitorisch (Mehrheit), nicht kalibriert.
   * @param {object} b {universe, asOf, expectedAsOf, above50:{matched,evaluated}, above200, newHighs:{count,evaluated},
   *                    newLows, advDecl:{advancers,decliners,unchanged,evaluated,session,previousSession,complete,asOf}}
   */
  function breadth(b) {
    var meth = "Grundlage: " + (b && b.universe ? b.universe.label : "Aktienuniversum") + ". Anteil der Titel mit Schlusskurs über dem 50- bzw. " +
      "200-Tage-Durchschnitt (Nenner: Titel mit ausreichender Historie). Breit, wenn jeweils mehr als die Hälfte darüber liegt; schmal, wenn " +
      "jeweils weniger als die Hälfte; sonst gemischt. Die 50-%-Schwelle ist die Mehrheit, keine optimierte Zahl. Neue 52-Wochen-Hochs/-Tiefs " +
      "und steigende/fallende Titel werden gezeigt, fließen aber nicht in den Zustand ein. Veraltete Daten ergeben keinen Zustand.";
    if (!b || !b.above50 || !b.above200 || !(b.above50.evaluated > 0) || !(b.above200.evaluated > 0)) {
      return dim("BREADTH", "UNAVAILABLE", "Nicht bestimmbar", "Keine Breitendaten.", [], null, meth);
    }
    var p50 = pct(b.above50.matched, b.above50.evaluated), p200 = pct(b.above200.matched, b.above200.evaluated);
    var current = !b.expectedAsOf || (b.asOf && b.asOf >= b.expectedAsOf);
    var raw = p50 > 50 && p200 > 50 ? "BROAD" : p50 < 50 && p200 < 50 ? "NARROW" : "MIXED";
    var state = current ? raw : "NOT_CURRENT";
    var label = { BROAD: "Breit", NARROW: "Schmal", MIXED: "Gemischt", NOT_CURRENT: "Nicht aktuell" }[state];
    var summary = state === "NOT_CURRENT"
      ? "Die Breitendaten stammen vom " + b.asOf + " und sind älter als der letzte Handelstag (" + b.expectedAsOf + "). Keine Einordnung."
      : fmt(p50, 0) + " % der beobachteten Aktien liegen über ihrem 50-Tage-Trend, " + fmt(p200, 0) + " % über dem 200-Tage-Trend.";
    var ev = [
      { key: "above50", label: "Über 50-Tage-Linie", text: fmt(p50, 1) + " % (" + b.above50.matched + " von " + b.above50.evaluated + ")",
        value: rnd(p50, 2), matched: b.above50.matched, evaluated: b.above50.evaluated, asOf: b.asOf, current: current },
      { key: "above200", label: "Über 200-Tage-Linie", text: fmt(p200, 1) + " % (" + b.above200.matched + " von " + b.above200.evaluated + ")",
        value: rnd(p200, 2), matched: b.above200.matched, evaluated: b.above200.evaluated, asOf: b.asOf, current: current }
    ];
    if (b.newHighs) ev.push({ key: "newHighs", label: "Neue 52-Wochen-Hochs", text: b.newHighs.count + " von " + b.newHighs.evaluated,
                              value: b.newHighs.count, evaluated: b.newHighs.evaluated, asOf: b.asOf, current: current });
    if (b.newLows) ev.push({ key: "newLows", label: "Neue 52-Wochen-Tiefs", text: b.newLows.count + " von " + b.newLows.evaluated,
                             value: b.newLows.count, evaluated: b.newLows.evaluated, asOf: b.asOf, current: current });
    var ad = b.advDecl;
    if (ad && ad.evaluated > 0) {
      ev.push({ key: "advDecl", label: "Gestiegen / gefallen" + (ad.complete ? "" : " (Sitzung läuft)"),
                text: ad.advancers + " / " + ad.decliners + " von " + ad.evaluated + " (" + fmt(pct(ad.advancers, ad.evaluated), 0) + " % gestiegen)",
                advancers: ad.advancers, decliners: ad.decliners, unchanged: ad.unchanged, evaluated: ad.evaluated,
                session: ad.session, previousSession: ad.previousSession, complete: !!ad.complete, asOf: ad.asOf, current: true });
    }
    return dim("BREADTH", state, label, summary, ev,
      "Eine Bewegung ist breiter getragen, wenn viele Aktien gleichzeitig mitziehen. Steigen die großen Indizes, während nur wenige Aktien zulegen, hängt der Anstieg an wenigen Titeln.",
      meth, { raw: { above50Pct: rnd(p50, 2), above200Pct: rnd(p200, 2), state: raw }, asOf: b.asOf, expectedAsOf: b.expectedAsOf || null });
  }

  /**
   * CROSS_ASSET: gleichzeitige Bewegungen ueber einen Monat, beschrieben -
   * nicht bewertet. "Deutlich" heisst: mindestens cfg.notable-fach eine
   * typische Monatsbewegung der eigenen Historie. Keine Kausalitaet.
   * @param {object} a {EQUITY, US10Y, GOLD, OIL, BTC, EURUSD: moveRatio|null}
   */
  function crossAsset(a, cfg) {
    var t = cfg.notable;
    var meth = "Veränderung über " + cfg.horizonLabel + " (" + cfg.horizon + " Beobachtungen) je Anlageklasse, verglichen mit der typischen " +
      "Veränderung desselben Zeitraums in den letzten " + cfg.windowYears + " Jahren (Standardabweichung). Deutlich ab " + fmt(t, 1) +
      "-fach typisch. Beschrieben werden nur gleichzeitige deutliche Bewegungen – keine Ursache, keine Bewertung. Steigende Renditen, " +
      "steigendes Gold oder Bitcoin gelten nicht automatisch als gut oder schlecht.";
    function big(x) { return x && Math.abs(x.ratio) >= t; }
    function dir(x) { return x.change > 0 ? 1 : -1; }
    var obs = [];
    var eq = a.EQUITY, y = a.US10Y, g = a.GOLD, o = a.OIL, bt = a.BTC, fx = a.EURUSD;
    if (big(eq) && big(y)) {
      obs.push(dir(eq) === dir(y)
        ? { id: dir(eq) > 0 ? "EQUITIES_AND_YIELDS_UP" : "EQUITIES_AND_YIELDS_DOWN",
            text: dir(eq) > 0 ? "Aktien und langfristige US-Renditen steigen gleichzeitig." : "Aktien und langfristige US-Renditen fallen gleichzeitig." }
        : { id: dir(eq) > 0 ? "EQUITIES_UP_YIELDS_DOWN" : "EQUITIES_DOWN_YIELDS_UP",
            text: dir(eq) > 0 ? "Aktien steigen, während die langfristigen US-Renditen fallen." : "Aktien fallen, während die langfristigen US-Renditen steigen." });
    } else if (big(y)) {
      obs.push({ id: dir(y) > 0 ? "YIELDS_UP" : "YIELDS_DOWN", text: dir(y) > 0 ? "Die langfristigen US-Renditen sind deutlich gestiegen." : "Die langfristigen US-Renditen sind deutlich gefallen." });
    }
    if (big(g) && big(eq)) {
      obs.push(dir(g) === dir(eq)
        ? { id: dir(g) > 0 ? "GOLD_AND_EQUITIES_UP" : "GOLD_AND_EQUITIES_DOWN", text: dir(g) > 0 ? "Gold und Aktien steigen gleichzeitig." : "Gold und Aktien fallen gleichzeitig." }
        : { id: dir(g) > 0 ? "GOLD_UP_EQUITIES_DOWN" : "GOLD_DOWN_EQUITIES_UP", text: dir(g) > 0 ? "Gold steigt, während Aktien fallen." : "Gold fällt, während Aktien steigen." });
    } else if (big(g)) {
      obs.push({ id: dir(g) > 0 ? "GOLD_UP" : "GOLD_DOWN", text: dir(g) > 0 ? "Gold ist deutlich gestiegen." : "Gold ist deutlich gefallen." });
    }
    if (big(bt) && big(eq) && dir(bt) !== dir(eq)) obs.push({ id: "BTC_EQUITIES_DIVERGE", text: "Bitcoin und Aktien bewegen sich gegenläufig." });
    else if (big(bt)) obs.push({ id: dir(bt) > 0 ? "BTC_UP" : "BTC_DOWN", text: dir(bt) > 0 ? "Bitcoin ist deutlich gestiegen." : "Bitcoin ist deutlich gefallen." });
    if (big(o)) obs.push({ id: dir(o) > 0 ? "OIL_UP" : "OIL_DOWN", text: dir(o) > 0 ? "Der Ölpreis ist deutlich gestiegen." : "Der Ölpreis ist deutlich gefallen." });
    if (big(fx)) obs.push({ id: dir(fx) > 0 ? "EUR_UP" : "EUR_DOWN", text: dir(fx) > 0 ? "Der Euro ist zum Dollar deutlich fester." : "Der Euro ist zum Dollar deutlich schwächer." });

    var names = { EQUITY: "Aktien (S&P-500-Tracker SPY)", US10Y: "US-Rendite 10 Jahre", GOLD: "Gold", OIL: "Öl (WTI)", BTC: "Bitcoin", EURUSD: "EUR/USD" };
    var ev = Object.keys(names).filter(function (k) { return a[k]; }).map(function (k) {
      var x = a[k];
      return { key: k, label: names[k], text: (x.kind === "BP" ? signed(x.change, 0, " bp") : signed(x.change, 1, " %")) +
               " · " + fmt(Math.abs(x.ratio), 1) + "-fach typisch" + (big(x) ? " (deutlich)" : ""),
               change: rnd(x.change, 3), ratio: rnd(x.ratio, 2), notable: big(x), asOf: x.to, kind: x.kind };
    });
    if (ev.length < 3) return dim("CROSS_ASSET", "UNAVAILABLE", "Nicht bestimmbar", "Zu wenige Anlageklassen mit Daten.", ev, null, meth);
    /* Wohin der Nutzer fuer den Beleg gehen kann (Marktdetail). */
    obs.forEach(function (o) {
      var s = [];
      if (/EQUIT/.test(o.id)) s.push("SPY");
      if (CA_LINK[o.id] && s.indexOf(CA_LINK[o.id]) === -1) s.push(CA_LINK[o.id]);
      o.symbols = s;
    });
    var state = obs.length ? "OBSERVED" : "CALM";
    return dim("CROSS_ASSET", state, obs.length ? "Auffällige Bewegungen" : "Ruhiges Gesamtbild",
      obs.length ? obs.map(function (x) { return x.text; }).join(" ") : "Im letzten Monat gab es keine ungewöhnlich großen Bewegungen über die Anlageklassen hinweg.",
      ev, "Anlageklassen hängen oft zusammen, aber nicht immer gleich. Hier steht, was sich gleichzeitig bewegt hat – nicht, warum.",
      meth, { observations: obs });
  }

  /**
   * Die Schlagzeile: fest aus TREND und BREADTH (plus RISK, wenn erhoeht).
   * MOMENTUM fliesst nicht ein (Ueberschneidung mit TREND).
   */
  function headline(d) {
    var t = d.TREND && d.TREND.state, b = d.BREADTH && d.BREADTH.state, r = d.RISK && d.RISK.state;
    var basis = [];
    var text;
    if (t === "POSITIVE" || t === "NEGATIVE") {
      basis.push("TREND");
      var head = t === "POSITIVE" ? "Aufwärtstrend" : "Abwärtstrend";
      if (b === "BROAD") { basis.push("BREADTH"); text = head + (t === "POSITIVE" ? " auf breiter Basis" : " – die Schwäche ist breit"); }
      else if (b === "NARROW") { basis.push("BREADTH"); text = head + (t === "POSITIVE" ? " – aber nur wenige Aktien tragen ihn" : " – die Mehrheit der Aktien ist schwach"); }
      else if (b === "MIXED") { basis.push("BREADTH"); text = head + " – Marktbreite gemischt"; }
      else text = head + " bei den großen US-Markt-Trackern";
    } else if (t === "MIXED") { basis.push("TREND"); text = "Kein klarer Trend bei den großen US-Markt-Trackern"; }
    else return { text: null, basis: [], state: "UNAVAILABLE" };
    if (r === "ELEVATED" || r === "HIGH") { basis.push("RISK"); text += r === "HIGH" ? " · Schwankungen hoch" : " · Schwankungen erhöht"; }
    return { text: text, basis: basis, state: "AVAILABLE" };
  }

  /* ------------------------------------------------------- Markt jetzt */

  var GRUPPE = { ETF: "aktien", INDEX: "aktien", COMMODITY: "energie", PRECIOUS_METAL: "edelmetalle", CRYPTO: "krypto",
                 YIELD: "renditen", FX: "devisen" };
  var AKTUELL = { LIVE: true, CURRENT: true, LAST_SESSION: true };

  /**
   * Die auffaelligsten Tagesbewegungen, deterministisch: Verhaeltnis der
   * juengsten Tagesveraenderung zur typischen Tagesveraenderung der
   * letzten ~3 Monate (history.recent). Nur aktuelle Werte (Frische zur
   * Anzeigezeit), hoechstens cfg.maxPerGroup je Gruppe, hoechstens cfg.max.
   * @param {Array} contracts bereits mit VUMultiAssetContract.refresh bewertet
   */
  function marketNow(contracts, cfg, now) {
    cfg = cfg || {};
    /* Eine Tagesbewegung, deren Beobachtung aelter als maxAgeDays ist, ist
       keine Bewegung von "jetzt" - auch wenn der Wert laut Veroeffentlichungs-
       plan noch aktuell ist (z. B. ein Referenzkurs vom Wochenanfang). */
    var nowMs = now ? new Date(now).getTime() : Date.now();
    var maxAge = isNum(cfg.maxAgeDays) ? cfg.maxAgeDays : 3;
    var max = cfg.max || 5, minItems = cfg.min || 3, notable = cfg.notable || 1, strong = cfg.strong || 2, perGroup = cfg.maxPerGroup || 2;
    var cands = [];
    (contracts || []).forEach(function (c) {
      var q = c && c.quote;
      if (!q || q.state !== "AVAILABLE" || !q.change) return;
      var grp = GRUPPE[c.instrument.assetClass];
      if (!grp || c.history.representation === "STEPS") return;
      var fresh = c.data && c.data.freshness && c.data.freshness.state;
      if (!AKTUELL[fresh]) return;
      var obs = String(q.observationDate || q.asOf || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(obs) || (nowMs - Date.parse(obs + "T00:00:00Z")) / 86400000 > maxAge + 1) return;
      var bp = q.change.semantics === "BASIS_POINTS";
      var cur = bp ? q.change.basisPoints : q.change.percent;
      if (!isNum(cur)) return;
      var rec = (c.history.recent || []).filter(function (x) { return isNum(x[1]); });
      var ch = [];
      for (var i = 1; i < rec.length; i++) {
        var v = bp ? (rec[i][1] - rec[i - 1][1]) * 100 : (rec[i - 1][1] > 0 ? 100 * (rec[i][1] / rec[i - 1][1] - 1) : null);
        if (isNum(v)) ch.push(v);
      }
      if (ch.length < 20) return;
      var typ = Math.sqrt(ch.reduce(function (s, x) { return s + x * x; }, 0) / (ch.length - 1));
      if (!(typ > 0)) return;
      cands.push({ c: c, grp: grp, cur: cur, bp: bp, typ: typ, ratio: cur / typ, fresh: fresh, samples: ch.length });
    });
    cands.sort(function (x, y) { return Math.abs(y.ratio) - Math.abs(x.ratio) || (x.c.instrument.symbol < y.c.instrument.symbol ? -1 : 1); });
    var picked = [], perG = {};
    function take(k) { if (picked.length >= max || (perG[k.grp] || 0) >= perGroup) return; perG[k.grp] = (perG[k.grp] || 0) + 1; picked.push(k); }
    cands.filter(function (k) { return Math.abs(k.ratio) >= notable; }).forEach(take);
    if (picked.length < minItems) cands.filter(function (k) { return picked.indexOf(k) === -1; }).forEach(function (k) { if (picked.length < minItems) take(k); });
    return picked.map(function (k) {
      var c = k.c, a = Math.abs(k.ratio);
      var staerke = a >= strong ? "stark" : a >= notable ? "deutlich" : "leicht";
      var name = c.tracker ? c.tracker.displayMarketName : (c.instrument.nameDe || c.instrument.name);
      var auf = k.cur > 0, titel;
      if (c.instrument.assetClass === "YIELD") titel = name + ": Rendite " + (auf ? "steigt" : k.cur < 0 ? "fällt" : "unverändert") + (k.cur ? " " + staerke : "");
      else if (c.instrument.symbol === "EURUSD") titel = "Euro " + staerke + " " + (auf ? "fester" : "schwächer");
      else titel = name + " " + staerke + " " + (auf ? "höher" : k.cur < 0 ? "schwächer" : "unverändert");
      return {
        symbol: c.instrument.symbol, group: k.grp, title: titel,
        value: k.bp ? signed(k.cur, Math.abs(k.cur) % 1 ? 1 : 0, " bp") : signed(k.cur, 2, " %"),
        direction: k.bp ? "neutral" : (auf ? "up" : k.cur < 0 ? "down" : "flat"),
        intensity: staerke, ratio: rnd(k.ratio, 2), notable: a >= notable,
        change: rnd(k.cur, 3), unit: k.bp ? "BP" : "PERCENT", freshness: k.fresh,
        tracker: c.tracker ? c.instrument.symbol : null,
        session: k.fresh === "LAST_SESSION" ? "LAST_SESSION" : "CURRENT",
        referenceDate: c.quote.changeReferenceDate || null, asOf: c.quote.asOf || null,
        evidence: "Tagesbewegung " + fmt(a, 1) + "-fach so groß wie eine typische Tagesbewegung der letzten " + k.samples + " Beobachtungen."
      };
    });
  }

  /* ================================================================
     MARKETS 3.0 — MARKTUMFELD, WAS WUERDE ES AENDERN, VORHER/JETZT
     ================================================================
     Alles hier ist eine feste Regel ueber die bereits bestimmten
     Dimensionszustaende. Kein Modell, keine Gewichte, kein Score: die
     Entscheidungstabelle steht versioniert in quant/config/market-pulse.json
     (environment) und wird in der Kalibrierung gegen bekannte Phasen
     geprueft. Ein LLM darf diese Zustaende hoechstens erklaeren. */

  var ENVIRONMENT_VERSION = "market-environment-1.0.0";
  /* Rangfolge je Dimension, schlechtester Zustand zuerst. */
  var ORD = {
    TREND: ["NEGATIVE", "MIXED", "POSITIVE"],
    MOMENTUM: ["FALLING", "MIXED", "RISING"],
    RISK: ["HIGH", "ELEVATED", "NORMAL"],
    BREADTH: ["NARROW", "MIXED", "BROAD"]
  };
  var ROLLE = {
    TREND: { POSITIVE: "support", MIXED: "neutral", NEGATIVE: "headwind" },
    MOMENTUM: { RISING: "support", MIXED: "neutral", FALLING: "headwind" },
    RISK: { NORMAL: "support", ELEVATED: "headwind", HIGH: "headwind" },
    BREADTH: { BROAD: "support", MIXED: "neutral", NARROW: "headwind" }
  };
  var DIM_WORT = { TREND: "Trend", BREADTH: "Marktbreite", MOMENTUM: "Momentum", RISK: "Risiko", CROSS_ASSET: "Cross-Asset-Kontext" };
  /* Kurzform (Satzanfang) und Nebensatz (nach "aber") je Zustand. */
  var KURZ = {
    TREND: { POSITIVE: "Aufwärtstrend", MIXED: "Trend noch nicht bestätigt", NEGATIVE: "Abwärtstrend" },
    MOMENTUM: { RISING: "Positive Dynamik", MIXED: "Uneinheitliche Dynamik", FALLING: "Negative Dynamik" },
    RISK: { NORMAL: "Normale Schwankungen", ELEVATED: "Erhöhtes Risiko", HIGH: "Hohes Risiko" },
    BREADTH: { BROAD: "Breite Beteiligung", MIXED: "Gemischte Marktbreite", NARROW: "Schmale Beteiligung" }
  };
  var SATZ = {
    TREND: { POSITIVE: "die großen US-Märkte liegen im Aufwärtstrend", MIXED: "der Trend ist noch nicht breit bestätigt",
             NEGATIVE: "die großen US-Märkte liegen im Abwärtstrend" },
    MOMENTUM: { RISING: "die Dynamik ist positiv", MIXED: "die Dynamik ist uneinheitlich", FALLING: "die Dynamik ist negativ" },
    RISK: { NORMAL: "die Schwankungen sind normal", ELEVATED: "das Risiko ist erhöht", HIGH: "das Risiko ist hoch" },
    BREADTH: { BROAD: "viele Aktien tragen die Bewegung mit", MIXED: "die Marktbreite ist gemischt", NARROW: "nur wenige Aktien tragen die Bewegung" }
  };
  /* Konsumentensprache je Zustand fuer "Warum?" (Fachbegriff sekundaer). */
  var GRUND = {
    TREND: { POSITIVE: "Die großen US-Markt-Tracker liegen über ihrem mittel- und langfristigen Trend.",
             MIXED: "Der Trend ist noch nicht breit bestätigt – die großen US-Markt-Tracker liegen teils darüber, teils darunter.",
             NEGATIVE: "Die großen US-Markt-Tracker liegen unter ihrem mittel- und langfristigen Trend." },
    MOMENTUM: { RISING: "Die Märkte sind über drei und sechs Monate gestiegen.", MIXED: "Die Kursentwicklung über drei und sechs Monate ist uneinheitlich.",
                FALLING: "Die Märkte sind über drei und sechs Monate gefallen." },
    RISK: { NORMAL: "Die Kursschwankungen liegen im üblichen Rahmen.", ELEVATED: "Die Kursschwankungen oder der Rückgang vom Hoch sind erhöht.",
            HIGH: "Die Kursschwankungen oder der Rückgang vom Hoch sind hoch." },
    BREADTH: { BROAD: "Die Mehrheit der Aktien liegt über ihrem Trend – die Bewegung ist breit getragen.",
               MIXED: "Die Marktbreite ist gemischt.",
               NARROW: "Nur eine Minderheit der Aktien liegt über ihrem Trend – die Bewegung hängt an wenigen Titeln." }
  };

  function istBekannt(dimId, st) { return ORD[dimId] && ORD[dimId].indexOf(st) !== -1; }

  /**
   * Stufe 0..4 aus den Zustaenden. null, wenn TREND, MOMENTUM oder RISK
   * fehlen (fail closed). Eine fehlende Marktbreite zaehlt weder positiv
   * noch negativ: sie verhindert nur die Stufe "breit" (Deckel UNKNOWN).
   * CROSS_ASSET beschreibt Beziehungen und stimmt nicht mit ab.
   */
  function environmentLevel(st, E) {
    if (!istBekannt("TREND", st.TREND) || !istBekannt("MOMENTUM", st.MOMENTUM) || !istBekannt("RISK", st.RISK)) return null;
    var base = E.base[st.TREND + "|" + st.MOMENTUM];
    if (!isNum(base)) return null;
    var b = istBekannt("BREADTH", st.BREADTH) ? st.BREADTH : "UNKNOWN";
    var roh = base + (base === E.broadFrom && b === "BROAD" ? 1 : 0);
    return Math.min(roh, E.riskCap[st.RISK], E.breadthCap[b]);
  }

  function klein(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function gross(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /**
   * MARKTUMFELD: Einordnung, Hauptaussage, Bedeutung fuer Anleger, Warum.
   * @param {object} dims die fuenf Dimensionen (mit state)
   * @param {object} E    config.environment
   */
  function environment(dims, E) {
    var st = {};
    ["TREND", "MOMENTUM", "RISK", "BREADTH", "CROSS_ASSET"].forEach(function (k) { st[k] = dims[k] ? dims[k].state : "UNAVAILABLE"; });
    var lvl = environmentLevel(st, E);
    var why = { support: [], headwind: [], neutral: [], open: [], context: [] };
    ["TREND", "MOMENTUM", "BREADTH", "RISK"].forEach(function (k) {
      var rolle = ROLLE[k][st[k]] || "open";
      var text = rolle === "open"
        ? (k === "BREADTH" && st[k] === "NOT_CURRENT" ? "Die Marktbreite ist nicht aktuell – sie zählt deshalb weder dafür noch dagegen."
                                                     : DIM_WORT[k] + " ist gerade nicht bestimmbar.")
        : GRUND[k][st[k]];
      if (k === "MOMENTUM" && st[k] === "RISING" && dims.MOMENTUM && dims.MOMENTUM.pace === "SLOWING") text += " Zuletzt hat das Tempo nachgelassen.";
      why[rolle].push({ dimension: k, state: st[k], label: dims[k] ? dims[k].label : null, text: text });
    });
    var ca = dims.CROSS_ASSET;
    if (ca && ca.state !== "UNAVAILABLE") {
      why.context.push({ dimension: "CROSS_ASSET", state: ca.state, label: ca.label, text: ca.summary });
    }
    var methode = "Feste Entscheidungstabelle (" + ENVIRONMENT_VERSION + "): Trend und Momentum bilden gemeinsam die Basisstufe " +
      "(sie überschneiden sich und zählen deshalb nicht doppelt). Das Risiko begrenzt nach oben (erhöht: höchstens „" + E.levels[E.riskCap.ELEVATED].label +
      "“, hoch: höchstens „" + E.levels[E.riskCap.HIGH].label + "“). Die Marktbreite bestätigt: „" + E.levels[4].label + "“ nur mit aktueller breiter " +
      "Beteiligung; schmale Breite begrenzt auf „" + E.levels[E.breadthCap.NARROW].label + "“. Fehlt die Marktbreite, zählt sie weder dafür noch dagegen. " +
      "Der Cross-Asset-Kontext beschreibt Beziehungen und stimmt nicht mit ab. Kein Score, keine Gewichte, keine Prognose.";
    if (lvl === null) {
      return { version: ENVIRONMENT_VERSION, state: "UNAVAILABLE", level: null, label: "Nicht bestimmbar",
               statement: "Das Marktumfeld ist gerade nicht bestimmbar – es fehlen Trend, Momentum oder Risiko.",
               investor: null, why: why, counts: { support: why.support.length, neutral: why.neutral.length, headwind: why.headwind.length, open: why.open.length },
               states: st, methodology: methode, disclaimer: E.disclaimer };
    }
    var L = E.levels[lvl];
    var reihenfolge = function (a) { return a.slice().sort(function (x, y) { return ["TREND", "MOMENTUM", "BREADTH", "RISK"].indexOf(x.dimension) - ["TREND", "MOMENTUM", "BREADTH", "RISK"].indexOf(y.dimension); }); };
    var sup = reihenfolge(why.support), gegen = reihenfolge(why.headwind.concat(why.neutral));
    /* Hauptaussage: staerkster Rueckhalt, dann der wichtigste Vorbehalt. */
    var statement;
    if (sup.length && gegen.length) statement = KURZ[sup[0].dimension][sup[0].state] + " – aber " + SATZ[gegen[0].dimension][gegen[0].state] + ".";
    else if (sup.length) statement = sup.map(function (x, i) { return i ? klein(KURZ[x.dimension][x.state]) : KURZ[x.dimension][x.state]; }).join(", ") + ".";
    else statement = gegen.map(function (x, i) { return i ? klein(KURZ[x.dimension][x.state]) : KURZ[x.dimension][x.state]; }).join(", ") + ".";
    var erklaerung = gross([sup.length ? sup.map(function (x) { return SATZ[x.dimension][x.state]; }).join(" und ") : null,
                            gegen.length ? (sup.length ? "aber " : "") + gegen.map(function (x) { return SATZ[x.dimension][x.state]; }).join(" und ") : null]
                           .filter(Boolean).join(", ")) + "." +
      (why.open.length ? " " + why.open.map(function (x) { return x.text; }).join(" ") : "");
    return {
      version: ENVIRONMENT_VERSION, state: L.id, level: lvl, label: L.label, scale: E.levels.map(function (x) { return { id: x.id, label: x.label }; }),
      statement: statement, explanation: erklaerung, investor: L.investor,
      why: why, counts: { support: why.support.length, neutral: why.neutral.length, headwind: why.headwind.length, open: why.open.length },
      states: st, methodology: methode, disclaimer: E.disclaimer
    };
  }

  /* --------------------------------------- Was wuerde das Bild veraendern */

  function nah(liste) { return liste.slice().sort(function (a, b) { return a.abstand - b.abstand || (a.key < b.key ? -1 : 1); }); }

  /**
   * Konkrete Bedingung fuer einen Zustandswechsel einer Dimension - nur
   * aus den dokumentierten Schwellen und den aktuellen Messwerten.
   * @returns {{text, symbols:Array, distance:number|null}|null}
   */
  function bedingung(dimId, ziel, dims, cfg) {
    var d = dims[dimId];
    if (dimId === "TREND") {
      var ev = (d && d.evidence) || [], n = cfg.trend.majority, of = ev.length;
      var oben = ev.filter(function (e) { return e.above50 && e.above200; });
      var unten = ev.filter(function (e) { return !e.above50 && !e.above200; });
      if (ziel === "POSITIVE") {
        var kand = nah(ev.filter(function (e) { return !(e.above50 && e.above200); }).map(function (e) {
          return { key: e.key, abstand: Math.max(e.above50 ? 0 : -e.dist50, e.above200 ? 0 : -e.dist200), e: e };
        })).slice(0, Math.max(0, n - oben.length));
        return { text: "wenn mindestens " + n + " der " + of + " großen US-Markt-Tracker über ihrer 50- und 200-Tage-Linie liegen (derzeit " + oben.length + ")" +
                 (kand.length ? ". Am nächsten dran: " + kand.map(function (k) { return k.key + " (" + fmt(k.abstand, 1) + " % bis über beide Linien)"; }).join(", ") : ""),
                 symbols: kand.map(function (k) { return k.key; }), distance: kand.length ? rnd(kand[kand.length - 1].abstand, 2) : null };
      }
      if (ziel === "NEGATIVE") {
        var kn = nah(ev.filter(function (e) { return e.above50 || e.above200; }).map(function (e) {
          return { key: e.key, abstand: Math.max(e.above50 ? e.dist50 : 0, e.above200 ? e.dist200 : 0), e: e };
        })).slice(0, Math.max(0, n - unten.length));
        return { text: "wenn mindestens " + n + " der " + of + " großen US-Markt-Tracker unter ihre 50- und 200-Tage-Linie fallen (derzeit " + unten.length + ")" +
                 (kn.length ? ". Am knappsten: " + kn.map(function (k) { return k.key + " (" + fmt(k.abstand, 1) + " % darüber)"; }).join(", ") : ""),
                 symbols: kn.map(function (k) { return k.key; }), distance: kn.length ? rnd(kn[kn.length - 1].abstand, 2) : null };
      }
      /* MIXED: aus POSITIVE (einer faellt heraus) oder aus NEGATIVE (einer steigt heraus). */
      if (d.state === "POSITIVE") {
        var kp = nah(oben.map(function (e) { return { key: e.key, abstand: Math.min(e.dist50, e.dist200) }; })).slice(0, oben.length - n + 1);
        return { text: "wenn weniger als " + n + " der " + of + " Tracker über beiden Linien liegen (derzeit " + oben.length + ")" +
                 (kp.length ? ". Am knappsten: " + kp.map(function (k) { return k.key + " (" + fmt(k.abstand, 1) + " % über der näheren Linie)"; }).join(", ") : ""),
                 symbols: kp.map(function (k) { return k.key; }), distance: kp.length ? rnd(kp[kp.length - 1].abstand, 2) : null };
      }
      var km = nah(unten.map(function (e) { return { key: e.key, abstand: Math.min(-e.dist50, -e.dist200) }; })).slice(0, unten.length - n + 1);
      return { text: "wenn weniger als " + n + " der " + of + " Tracker unter beiden Linien liegen (derzeit " + unten.length + ")" +
               (km.length ? ". Am knappsten: " + km.map(function (k) { return k.key + " (" + fmt(k.abstand, 1) + " % unter der näheren Linie)"; }).join(", ") : ""),
               symbols: km.map(function (k) { return k.key; }), distance: km.length ? rnd(km[km.length - 1].abstand, 2) : null };
    }
    if (dimId === "MOMENTUM") {
      var e3 = (d.evidence || []).filter(function (e) { return e.key === "median3M"; })[0];
      var e6 = (d.evidence || []).filter(function (e) { return e.key === "median6M"; })[0];
      if (!e3 || !e6) return null;
      var jetzt = " (derzeit " + signed(e3.value, 1, " %") + " über 3 und " + signed(e6.value, 1, " %") + " über 6 Monate)";
      if (ziel === "RISING") return { text: "wenn die Tracker über 3 und 6 Monate im Mittel (Median) beide im Plus liegen" + jetzt, symbols: [], distance: rnd(Math.max(0, -Math.min(e3.value, e6.value)), 2) };
      if (ziel === "FALLING") return { text: "wenn die Tracker über 3 und 6 Monate im Mittel (Median) beide im Minus liegen" + jetzt, symbols: [], distance: rnd(Math.max(0, Math.max(e3.value, e6.value)), 2) };
      return d.state === "RISING"
        ? { text: "wenn die Tracker über 3 oder 6 Monate im Mittel (Median) ins Minus drehen" + jetzt, symbols: [], distance: rnd(Math.min(e3.value, e6.value), 2) }
        : { text: "wenn die Tracker über 3 oder 6 Monate im Mittel (Median) ins Plus drehen" + jetzt, symbols: [], distance: rnd(-Math.max(e3.value, e6.value), 2) };
    }
    if (dimId === "RISK") {
      var v = cfg.risk.vol20, dd = cfg.risk.drawdown, wer = cfg.risk.benchmark;
      var ev20 = (d.evidence || []).filter(function (e) { return e.key === "vol20"; })[0];
      var edd = (d.evidence || []).filter(function (e) { return e.key === "drawdown52w"; })[0];
      if (!ev20 || !edd) return null;
      var jetzt2 = " (derzeit " + fmt(ev20.value, 1) + " % bzw. " + signed(edd.value, 1, " %") + ")";
      if (ziel === "NORMAL") return { text: "wenn die Schwankung von " + wer + " unter " + fmt(v.elevated, 1) + " % sinkt und " + wer + " weniger als " +
                                      fmt(Math.abs(dd.elevated), 0) + " % unter seinem 52-Wochen-Hoch liegt" + jetzt2, symbols: [wer], distance: null };
      var sv = ziel === "HIGH" ? v.high : v.elevated, sd3 = ziel === "HIGH" ? dd.high : dd.elevated;
      if (ziel === "ELEVATED" && d.state === "HIGH") return { text: "wenn die Schwankung von " + wer + " unter " + fmt(v.high, 1) + " % sinkt und der Rückgang vom Hoch kleiner als " +
                                      fmt(Math.abs(dd.high), 0) + " % wird" + jetzt2, symbols: [wer], distance: null };
      return { text: "wenn die Schwankung von " + wer + " auf " + fmt(sv, 1) + " % steigt oder " + wer + " " + fmt(Math.abs(sd3), 0) +
               " % unter sein 52-Wochen-Hoch fällt" + jetzt2, symbols: [wer],
               distance: rnd(Math.min(100 * (sv - ev20.value) / sv, 100 * (edd.value - sd3) / Math.abs(sd3)), 1) };
    }
    if (dimId === "BREADTH") {
      var raw = d && d.raw, stand = raw ? " (" + (d.state === "NOT_CURRENT" ? "letzter, nicht aktueller Stand " + d.asOf + ": " : "derzeit ") +
                fmt(raw.above50Pct, 0) + " % bzw. " + fmt(raw.above200Pct, 0) + " %)" : "";
      var vor = d && d.state === "NOT_CURRENT" ? "wenn aktuelle Breitendaten zeigen, dass " : "wenn ";
      if (ziel === "BROAD") return { text: vor + "mehr als die Hälfte der Aktien über ihrer 50- und 200-Tage-Linie liegt" + stand, symbols: [], distance: null };
      if (ziel === "NARROW") return { text: vor + "weniger als die Hälfte der Aktien über ihrer 50- und 200-Tage-Linie liegt" + stand, symbols: [], distance: null };
      return { text: vor + "die Aktien über der 50- und der 200-Tage-Linie nicht mehr einheitlich mehrheitlich " + (raw && raw.state === "BROAD" ? "darüber" : "darunter") + " liegen" + stand, symbols: [], distance: null };
    }
    return null;
  }

  /**
   * POSITIVER / NEGATIVER WUERDE DAS BILD, WENN ...
   * Kontrafaktisch: je Dimension der naechstgelegene Zustand, der die
   * Einordnung tatsaechlich aendert (mit derselben Tabelle gerechnet).
   * Nur Einzelwechsel - keine erfundenen Kombinationen, keine Prognose.
   */
  function pictureChanges(dims, cfg) {
    var E = cfg.environment;
    var st = {};
    ["TREND", "MOMENTUM", "RISK", "BREADTH"].forEach(function (k) { st[k] = dims[k] ? dims[k].state : "UNAVAILABLE"; });
    var jetzt = environmentLevel(st, E);
    var out = { better: [], worse: [], level: jetzt };
    if (jetzt === null) return out;
    ["TREND", "MOMENTUM", "BREADTH", "RISK"].forEach(function (k) {
      var ord = ORD[k], i = ord.indexOf(st[k]);
      var kandidaten = ord.map(function (z, j) { return { z: z, abstand: i === -1 ? 1 : Math.abs(j - i) }; })
        .filter(function (x) { return x.z !== st[k]; })
        .sort(function (a, b) { return a.abstand - b.abstand; });
      var gefunden = { better: null, worse: null };
      kandidaten.forEach(function (x) {
        var alt = {}; Object.keys(st).forEach(function (q) { alt[q] = st[q]; }); alt[k] = x.z;
        var l = environmentLevel(alt, E);
        if (l === null || l === jetzt) return;
        var r = l > jetzt ? "better" : "worse";
        if (gefunden[r]) return;
        var b = bedingung(k, x.z, dims, cfg);
        if (!b) return;
        gefunden[r] = { dimension: k, from: st[k], to: x.z, toLabel: KURZ[k][x.z], level: l, levelLabel: E.levels[l].label,
                        text: b.text, symbols: b.symbols, distance: b.distance };
      });
      if (gefunden.better) out.better.push(gefunden.better);
      if (gefunden.worse) out.worse.push(gefunden.worse);
    });
    return out;
  }

  /* ----------------------------------------------- Worauf es jetzt ankommt */

  var BEOBACHTEN = {
    TREND: { titel: "Trend der großen US-Märkte", warum: "Der Trend ist die Basis der Einordnung. Eine Bestätigung würde das Marktbild verbessern, ein Bruch es verschlechtern." },
    MOMENTUM: { titel: "Dynamik über 3 und 6 Monate", warum: "Die Dynamik zeigt, ob der Markt weiter Kraft hat. Dreht sie, ändert sich die Einordnung." },
    BREADTH: { titel: "Marktbreite", warum: "Die Marktbreite zeigt, ob viele Aktien die Bewegung mittragen. Eine breitere Beteiligung würde die Bewegung stärker bestätigen." },
    RISK: { titel: "Schwankungen und Abstand zum Hoch", warum: "Steigende Schwankungen oder ein tieferer Rückgang begrenzen die Einordnung nach oben." }
  };
  var CA_LINK = { YIELDS_UP: "US10Y", YIELDS_DOWN: "US10Y", EQUITIES_AND_YIELDS_UP: "US10Y", EQUITIES_AND_YIELDS_DOWN: "US10Y",
                  EQUITIES_UP_YIELDS_DOWN: "US10Y", EQUITIES_DOWN_YIELDS_UP: "US10Y", GOLD_UP: "XAUUSD", GOLD_DOWN: "XAUUSD",
                  GOLD_AND_EQUITIES_UP: "XAUUSD", GOLD_AND_EQUITIES_DOWN: "XAUUSD", GOLD_UP_EQUITIES_DOWN: "XAUUSD", GOLD_DOWN_EQUITIES_UP: "XAUUSD",
                  BTC_UP: "BTCUSD", BTC_DOWN: "BTCUSD", BTC_EQUITIES_DIVERGE: "BTCUSD", OIL_UP: "WTI", OIL_DOWN: "WTI", EUR_UP: "EURUSD", EUR_DOWN: "EURUSD" };
  var CA_WARUM = {
    US10Y: "Renditen bestimmen, was sichere Anlagen abwerfen. Das verändert die relative Attraktivität von Aktien und Anleihen – besonders bei zinssensitiven Wachstumswerten.",
    XAUUSD: "Gold wird oft als defensiver Baustein beobachtet. Ob es in dieser Phase so wirkt, zeigt erst der Verlauf.",
    BTCUSD: "Bitcoin schwankt deutlich stärker als Aktien und handelt rund um die Uhr.",
    WTI: "Energiepreise wirken auf Kosten von Unternehmen und Verbrauchern und werden mit Blick auf die Inflation beobachtet.",
    EURUSD: "Der Euro-Dollar-Kurs bestimmt, was US-Anlagen in Euro wert sind."
  };

  /**
   * Hoechstens cfg.whatMatters.max Punkte, deterministisch:
   * 1. Dimensionen, deren naechster Wechsel die Einordnung aendert UND die
   *    nah an ihrer Schwelle liegen (cfg.whatMatters.near je Dimension),
   * 2. eine fehlende (nicht aktuelle) Marktbreite,
   * 3. die erste deutliche Cross-Asset-Beobachtung (Kontext),
   * 4. uebrige einordnungsrelevante Dimensionen.
   * Nicht die groessten Kursbewegungen - die Faktoren, die das Bild tragen.
   */
  function whatMatters(dims, changes, cfg) {
    var W = cfg.whatMatters, near = W.near;
    var beide = changes.better.concat(changes.worse);
    function eintrag(k) {
      var xs = beide.filter(function (c) { return c.dimension === k; });
      if (!xs.length) return null;
      var syms = [];
      xs.forEach(function (c) { (c.symbols || []).forEach(function (s) { if (syms.indexOf(s) === -1) syms.push(s); }); });
      var d = dims[k];
      var nahe = xs.some(function (c) { return isNum(c.distance) && isNum(near[k]) && c.distance <= near[k]; });
      return { dimension: k, title: BEOBACHTEN[k].titel, state: d.state, stateLabel: d.label, why: BEOBACHTEN[k].warum,
               watch: xs.map(function (c) { return (c.level > changes.level ? "Besser: " : "Schlechter: ") + c.text + "."; }),
               symbols: syms, near: nahe, anchor: "puls-" + k.toLowerCase() };
    }
    var dimsListe = ["TREND", "MOMENTUM", "BREADTH", "RISK"].map(eintrag).filter(Boolean);
    var out = dimsListe.filter(function (x) { return x.near; });
    var b = dims.BREADTH;
    if (b && (b.state === "NOT_CURRENT" || b.state === "UNAVAILABLE") && !out.some(function (x) { return x.dimension === "BREADTH"; })) {
      out.push({ dimension: "BREADTH", title: BEOBACHTEN.BREADTH.titel, state: b.state, stateLabel: b.label,
                 why: "Aktuelle Breitendaten fehlen. Sie würden zeigen, ob viele Aktien die Bewegung mittragen – erst dann ist „" + cfg.environment.levels[4].label + "“ möglich.",
                 watch: [b.summary], symbols: [], near: false, anchor: "maerkte-breite" });
    }
    var ca = dims.CROSS_ASSET;
    var obs = ca && ca.observations && ca.observations[0];
    if (obs && CA_LINK[obs.id]) {
      out.push({ dimension: "CROSS_ASSET", title: "Kontext: " + obs.text.replace(/\.$/, ""), state: ca.state, stateLabel: ca.label,
                 why: CA_WARUM[CA_LINK[obs.id]], watch: [], symbols: [CA_LINK[obs.id]], near: false, anchor: "maerkte-crossasset" });
    }
    dimsListe.filter(function (x) { return !x.near; }).forEach(function (x) { if (!out.some(function (y) { return y.dimension === x.dimension; })) out.push(x); });
    return out.slice(0, W.max);
  }

  /* ---------------------------------------------------- Messskalen (Visual) */

  /**
   * Je Dimension eine ehrliche Skala: der gemessene Wert, die echten
   * Schwellen der Methodik, nichts dazwischen erfunden.
   */
  function gauges(dims, cfg) {
    var g = {};
    var t = dims.TREND;
    if (t && t.counts) g.TREND = { value: t.counts.above, min: 0, max: t.counts.of, unit: "COUNT",
      marks: [{ at: cfg.trend.majority, label: cfg.trend.majority + " von " + t.counts.of }], valueText: t.counts.above + " von " + t.counts.of + " über beiden Linien",
      zones: [{ from: 0, to: cfg.trend.majority - 0.5, tone: "neutral" }, { from: cfg.trend.majority - 0.5, to: t.counts.of, tone: "support" }] };
    var b = dims.BREADTH;
    if (b && b.raw) g.BREADTH = { value: b.raw.above50Pct, min: 0, max: 100, unit: "PERCENT", current: b.state !== "NOT_CURRENT",
      marks: [{ at: cfg.breadth.majorityPercent, label: "Mehrheit" }], valueText: fmt(b.raw.above50Pct, 0) + " % über der 50-Tage-Linie" + (b.state === "NOT_CURRENT" ? " (Stand " + b.asOf + ", nicht aktuell)" : ""),
      zones: [{ from: 0, to: 50, tone: "headwind" }, { from: 50, to: 100, tone: "support" }] };
    var m = dims.MOMENTUM, m3 = m && (m.evidence || []).filter(function (e) { return e.key === "median3M"; })[0];
    if (m3 && isNum(m3.value)) {
      var span = Math.max(10, Math.ceil(Math.abs(m3.value) / 5) * 5);
      g.MOMENTUM = { value: m3.value, min: -span, max: span, unit: "PERCENT", marks: [{ at: 0, label: "0 %" }],
        valueText: signed(m3.value, 1, " %") + " über 3 Monate (Median)", zones: [{ from: -span, to: 0, tone: "headwind" }, { from: 0, to: span, tone: "support" }] };
    }
    var r = dims.RISK, v20 = r && (r.evidence || []).filter(function (e) { return e.key === "vol20"; })[0];
    if (v20 && isNum(v20.value)) {
      var v = cfg.risk.vol20, top = Math.max(40, Math.ceil(v20.value / 10) * 10);
      g.RISK = { value: v20.value, min: 0, max: top, unit: "PERCENT", invert: true,
        marks: [{ at: v.median, label: "Median" }, { at: v.elevated, label: "erhöht" }, { at: v.high, label: "hoch" }],
        valueText: fmt(v20.value, 1) + " % Schwankung (" + cfg.risk.benchmark + ", 20 Tage)",
        zones: [{ from: 0, to: v.elevated, tone: "support" }, { from: v.elevated, to: v.high, tone: "headwind" }, { from: v.high, to: top, tone: "strong-headwind" }] };
    }
    var ca = dims.CROSS_ASSET;
    if (ca && ca.evidence && ca.evidence.length) {
      var dl = ca.evidence.filter(function (e) { return e.notable; }).length;
      g.CROSS_ASSET = { value: dl, min: 0, max: ca.evidence.length, unit: "COUNT", context: true, marks: [],
        valueText: dl + " von " + ca.evidence.length + " Anlageklassen deutlich bewegt", zones: [{ from: 0, to: ca.evidence.length, tone: "context" }] };
    }
    return g;
  }

  /* ------------------------------------------------------- Vorher -> Jetzt */

  var BESSER_SCHLECHTER = function (k, a, b) {
    var o = ORD[k]; if (!o || o.indexOf(a) === -1 || o.indexOf(b) === -1 || a === b) return a === b ? "UNCHANGED" : "CHANGED";
    return o.indexOf(b) > o.indexOf(a) ? "BETTER" : "WORSE";
  };

  /**
   * Vergleich zweier Bewertungsstaende (gleiche Methode). Groesste
   * Veraenderung: zuerst ein Zustandswechsel (Marktumfeld, Trend,
   * Marktbreite, Momentum, Risiko), sonst "unveraendert". Numerische
   * Bewegung ohne Zustandswechsel wird gezeigt, aber nie zur Schlagzeile.
   * @param {object} prev {date, env, TREND, MOMENTUM, RISK, BREADTH, metrics}
   * @param {object} now  dieselbe Form
   */
  function compare(prev, now, E) {
    if (!prev || !now) return { state: "UNAVAILABLE", reason: "Noch keine vorherige Bewertung." };
    var rows = [];
    var envP = isNum(prev.env) ? E.levels[prev.env].label : "–", envN = isNum(now.env) ? E.levels[now.env].label : "–";
    rows.push({ key: "ENVIRONMENT", label: "Marktumfeld", from: envP, to: envN,
                change: prev.env === now.env ? "UNCHANGED" : (isNum(prev.env) && isNum(now.env) ? (now.env > prev.env ? "BETTER" : "WORSE") : "CHANGED") });
    var M = { TREND: "trendAbove", MOMENTUM: "median3M", RISK: "vol20", BREADTH: "above50Pct" };
    var MT = {
      TREND: function (x) { return isNum(x) ? x + " von 4 über beiden Linien" : null; },
      MOMENTUM: function (x) { return isNum(x) ? signed(x, 1, " %") + " (3 Monate)" : null; },
      RISK: function (x) { return isNum(x) ? fmt(x, 1) + " % Schwankung" : null; },
      BREADTH: function (x) { return isNum(x) ? fmt(x, 0) + " % über 50 Tage" : null; }
    };
    ["TREND", "BREADTH", "MOMENTUM", "RISK"].forEach(function (k) {
      var a = prev[k], b = now[k];
      var pm = prev.metrics ? prev.metrics[M[k]] : null, nm = now.metrics ? now.metrics[M[k]] : null;
      var bekannt = istBekannt(k, a) && istBekannt(k, b);
      rows.push({ key: k, label: DIM_WORT[k],
                  from: istBekannt(k, a) ? KURZ[k][a] : (a === "NOT_CURRENT" ? "Nicht aktuell" : "–"),
                  to: istBekannt(k, b) ? KURZ[k][b] : (b === "NOT_CURRENT" ? "Nicht aktuell" : "–"),
                  change: bekannt ? BESSER_SCHLECHTER(k, a, b) : (a === b ? "UNCHANGED" : "UNKNOWN"),
                  fromValue: MT[k](pm), toValue: MT[k](nm),
                  delta: isNum(pm) && isNum(nm) ? rnd(nm - pm, 2) : null });
    });
    if (prev.metrics && now.metrics && isNum(prev.metrics.us10y) && isNum(now.metrics.us10y)) {
      rows.push({ key: "US10Y", label: "US-Rendite 10 Jahre", from: fmt(prev.metrics.us10y, 2) + " %", to: fmt(now.metrics.us10y, 2) + " %",
                  change: "CONTEXT", delta: rnd((now.metrics.us10y - prev.metrics.us10y) * 100, 0), deltaText: signed((now.metrics.us10y - prev.metrics.us10y) * 100, 0, " bp"),
                  symbol: "US10Y" });
    }
    var reihenfolge = ["ENVIRONMENT", "TREND", "BREADTH", "MOMENTUM", "RISK"];
    var wechsel = rows.filter(function (r) { return r.change === "BETTER" || r.change === "WORSE"; })
      .sort(function (a, b) { return reihenfolge.indexOf(a.key) - reihenfolge.indexOf(b.key); });
    var top = wechsel[0] || null;
    var text;
    if (!top) text = "Marktbild seit der letzten Bewertung weitgehend unverändert.";
    else if (top.key === "ENVIRONMENT") text = "Das Marktumfeld hat sich " + (top.change === "BETTER" ? "verbessert" : "verschlechtert") + ": " + top.from + " → " + top.to + ".";
    else text = DIM_WORT[top.key] + " hat sich " + (top.change === "BETTER" ? "verbessert" : "verschlechtert") + ": " + top.from + " → " + top.to + ".";
    var zusatz = top && top.key === "ENVIRONMENT" && wechsel[1] ? " Auslöser: " + DIM_WORT[wechsel[1].key] + " (" + wechsel[1].from + " → " + wechsel[1].to + ")." : "";
    return { state: "AVAILABLE", previousDate: prev.date, currentDate: now.date, rows: rows,
             biggest: top ? { key: top.key, change: top.change, text: text + zusatz } : { key: null, change: "UNCHANGED", text: text },
             stateChanges: wechsel.length };
  }

  /** Zustandswechsel zwischen aufeinanderfolgenden Bewertungen - nur echte Wechsel, keine Zahlenbewegung. */
  function stateEvents(days, E) {
    var ev = [];
    for (var i = 1; i < days.length; i++) {
      var a = days[i - 1], b = days[i];
      if (isNum(a.env) && isNum(b.env) && a.env !== b.env) ev.push({ date: b.date, dimension: "ENVIRONMENT", from: E.levels[a.env].label, to: E.levels[b.env].label, change: b.env > a.env ? "BETTER" : "WORSE" });
      ["TREND", "MOMENTUM", "RISK", "BREADTH"].forEach(function (k) {
        if (istBekannt(k, a[k]) && istBekannt(k, b[k]) && a[k] !== b[k]) ev.push({ date: b.date, dimension: k, from: KURZ[k][a[k]], to: KURZ[k][b[k]], change: BESSER_SCHLECHTER(k, a[k], b[k]) });
      });
    }
    return ev;
  }

  /* --------------------------------------------------- Markt jetzt: Stories */

  var STORY = {
    aktien: { up: "Aktienmärkte legen zu", down: "Aktienmärkte geben nach", lead: "Mehrere große Aktienmärkte bewegen sich ungewöhnlich stark in dieselbe Richtung.",
              warum: "Die großen Aktienmärkte sind der Maßstab für das Gesamtumfeld. Ungewöhnlich große Tagesbewegungen verändern den Blick auf Trend und Risiko." },
    energie: { up: "Energiepreise steigen", down: "Energiepreise fallen", lead: "Mehrere Energiepreise bewegen sich ungewöhnlich stark in dieselbe Richtung.",
               warum: "Energiepreise wirken auf Kosten von Unternehmen und Verbrauchern und werden mit Blick auf die Inflation beobachtet." },
    edelmetalle: { up: "Edelmetalle zeigen Stärke", down: "Edelmetalle geben nach", lead: "Mehrere Edelmetalle bewegen sich ungewöhnlich stark in dieselbe Richtung.",
                   warum: "Edelmetalle werden als Wertanlage und in der Industrie nachgefragt; Gold wird oft als defensiver Baustein beobachtet." },
    krypto: { up: "Krypto legt zu", down: "Krypto gibt nach", lead: "Mehrere Kryptowährungen bewegen sich ungewöhnlich stark in dieselbe Richtung.",
              warum: "Kryptowährungen handeln rund um die Uhr und schwanken deutlich stärker als Aktien." },
    renditen: { up: "Renditedruck nimmt zu", down: "Renditen geben nach", lead: { up: "Die Renditen steigen über mehrere Laufzeiten.", down: "Die Renditen fallen über mehrere Laufzeiten." },
                warum: "Renditen bestimmen, was sichere Anlagen abwerfen. Das verändert die relative Attraktivität von Aktien und Anleihen." },
    devisen: { up: "Euro wird fester", down: "Euro wird schwächer", lead: "Der Euro bewegt sich ungewöhnlich stark gegenüber dem Dollar.",
               warum: "Der Euro-Dollar-Kurs bestimmt, was US-Anlagen in Euro wert sind." }
  };

  /**
   * Bewegungen aus marketNow zu Geschichten buendeln: gleiche Gruppe und
   * gleiche Richtung = eine Geschichte. Keine Ursache, nur Gleichlauf;
   * "warum relevant" ist allgemeine Einordnung der Anlageklasse.
   */
  function marketNowStories(items) {
    var buendel = {}, reihe = [];
    (items || []).forEach(function (it) {
      var r = isNum(it.change) ? (it.change > 0 ? "up" : it.change < 0 ? "down" : "flat") : "flat";
      var k = it.group + "|" + r;
      if (!buendel[k]) { buendel[k] = { group: it.group, dir: r, items: [] }; reihe.push(k); }
      buendel[k].items.push(it);
    });
    return reihe.map(function (k) {
      var b = buendel[k], S = STORY[b.group] || {}, mehrere = b.items.length > 1;
      var titel = mehrere && S[b.dir] ? S[b.dir] : b.items[0].title;
      var lead = mehrere ? (typeof S.lead === "object" ? S.lead[b.dir] : S.lead) : b.items[0].evidence;
      var staerke = Math.max.apply(null, b.items.map(function (x) { return Math.abs(x.ratio || 0); }));
      var asOf = b.items.map(function (x) { return x.asOf; }).filter(Boolean).sort().pop() || null;
      return { id: b.group + "-" + b.dir, group: b.group, direction: b.group === "renditen" ? "neutral" : b.dir, title: titel, lead: lead,
               why: S.warum || null, items: b.items, strength: rnd(staerke, 2), asOf: asOf,
               session: b.items.some(function (x) { return x.session === "LAST_SESSION"; }) ? "LAST_SESSION" : "CURRENT" };
    }).sort(function (a, b) { return b.strength - a.strength || (a.id < b.id ? -1 : 1); });
  }

  /* -------------------------------------------- Einordnung je Instrument */

  function tageZurueck(iso, tage) { var d = new Date(String(iso).slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - tage); return d.toISOString().slice(0, 10); }

  /**
   * Kennzahlen fuer die Detailseite eines Markts aus seiner kanonischen
   * Tagesreihe. kind "PRICE" (Kurs, Prozent) oder "YIELD" (Satz, bp).
   * Horizonte in Kalendertagen (Krypto handelt auch am Wochenende),
   * Linien in Beobachtungen. Nur, was die Reihe traegt.
   */
  function instrumentSignals(points, kind, perYear) {
    var p = (points || []).filter(function (x) { return x && isNum(x[1]) && (kind === "YIELD" || x[1] > 0); });
    var n = p.length;
    if (n < 30) return null;
    var c = p.map(function (x) { return x[1]; }), last = c[n - 1], asOf = p[n - 1][0];
    function sma(k) { if (n < k) return null; var s = 0; for (var i = n - k; i < n; i++) s += c[i]; return s / k; }
    function wertVor(tage) { var ab = tageZurueck(asOf, tage), v = null; for (var i = n - 1; i >= 0; i--) { if (p[i][0].slice(0, 10) <= ab) { v = p[i]; break; } } return v; }
    function aend(tage) { var v = wertVor(tage); if (!v) return null; return kind === "YIELD" ? rnd((last - v[1]) * 100, 1) : rnd(100 * (last / v[1] - 1), 2); }
    var s50 = sma(50), s200 = sma(200);
    var ab52 = tageZurueck(asOf, 365), hi = null, lo = null;
    for (var i = 0; i < n; i++) if (p[i][0].slice(0, 10) > ab52) {
      if (!hi || c[i] >= hi[1]) hi = [p[i][0], c[i]];
      if (!lo || c[i] <= lo[1]) lo = [p[i][0], c[i]];
    }
    var out = {
      kind: kind, asOf: asOf, last: rnd(last, 6), observations: n,
      changes: { "1M": aend(30), "3M": aend(91), "1Y": aend(365) },
      high52w: hi ? { date: hi[0], value: rnd(hi[1], 6) } : null, low52w: lo ? { date: lo[0], value: rnd(lo[1], 6) } : null,
      rangePosition: hi && lo && hi[1] > lo[1] ? rnd(100 * (last - lo[1]) / (hi[1] - lo[1]), 1) : null
    };
    if (kind === "YIELD") {
      out.vs200 = s200 === null ? null : rnd((last - s200) * 100, 1);
      out.vs50 = s50 === null ? null : rnd((last - s50) * 100, 1);
      return out;
    }
    out.dist50 = s50 === null ? null : rnd(100 * (last / s50 - 1), 2);
    out.dist200 = s200 === null ? null : rnd(100 * (last / s200 - 1), 2);
    out.trend = s50 === null || s200 === null ? "UNAVAILABLE" : last > s50 && last > s200 ? "POSITIVE" : last < s50 && last < s200 ? "NEGATIVE" : "MIXED";
    out.drawdown52w = hi ? rnd(100 * (last / hi[1] - 1), 2) : null;
    /* Schwankung 20 Beobachtungen, annualisiert; Einordnung gegen die eigene
       5-Jahres-Verteilung (Median, 25./75. Perzentil) - wie beim Pulse. */
    function vol(bis) { if (bis < 21) return null; var r = []; for (var j = bis - 19; j <= bis; j++) r.push(Math.log(c[j] / c[j - 1])); return sd(r) * Math.sqrt(perYear || 252) * 100; }
    out.vol20 = rnd(vol(n - 1), 2);
    var ab5 = tageZurueck(asOf, 5 * 365), vs = [];
    for (var k = 21; k < n; k++) if (p[k][0].slice(0, 10) > ab5) vs.push(vol(k));
    if (vs.length >= 250 && isNum(out.vol20)) {
      vs.sort(function (a, b) { return a - b; });
      var q = function (x) { return vs[Math.floor(x * (vs.length - 1))]; };
      out.volContext = { median: rnd(q(0.5), 1), p25: rnd(q(0.25), 1), p75: rnd(q(0.75), 1), samples: vs.length, from: ab5,
                         state: out.vol20 >= q(0.75) ? "HIGHER" : out.vol20 <= q(0.25) ? "LOWER" : "USUAL" };
    }
    return out;
  }

  var api = {
    METHOD_VERSION: METHOD_VERSION, HORIZONS: H,
    seriesSignals: seriesSignals, moveRatio: moveRatio,
    trend: trend, momentum: momentum, risk: risk, breadth: breadth, crossAsset: crossAsset,
    headline: headline, marketNow: marketNow,
    ENVIRONMENT_VERSION: ENVIRONMENT_VERSION, STATE_ORDER: ORD,
    environmentLevel: environmentLevel, environment: environment, pictureChanges: pictureChanges,
    whatMatters: whatMatters, gauges: gauges, compare: compare, stateEvents: stateEvents,
    marketNowStories: marketNowStories, instrumentSignals: instrumentSignals
  };
  if (isNode) module.exports = api;
  else global.VUMarketPulse = api;
})(typeof window !== "undefined" ? window : globalThis);
