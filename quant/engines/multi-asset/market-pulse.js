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
    var meth = "Schwankung: annualisierte Standardabweichung der täglichen Log-Renditen des Trackers über 20 Handelstage, verglichen mit seiner " +
      "Verteilung seit " + v.calibratedFrom + " (" + v.samples + " Beobachtungen). Erhöht ab dem " + v.elevatedPercentile + ". Perzentil (" + fmt(v.elevated, 1) +
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
      { key: "vol20", label: "Schwankung " + (name || "") + " (20 Tage, annualisiert)", text: fmt(sig.vol20, 1) + " %", value: rnd(sig.vol20, 2),
        context: "Median seit " + v.calibratedFrom + ": " + fmt(v.median, 1) + " %", asOf: sig.asOf },
      { key: "drawdown52w", label: "Abstand zum 52-Wochen-Hoch", text: signed(sig.drawdown52w, 1, " %"), value: rnd(sig.drawdown52w, 2), asOf: sig.asOf }
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
        tracker: c.tracker ? c.instrument.symbol : null,
        session: k.fresh === "LAST_SESSION" ? "LAST_SESSION" : "CURRENT",
        referenceDate: c.quote.changeReferenceDate || null, asOf: c.quote.asOf || null,
        evidence: "Tagesbewegung " + fmt(a, 1) + "-fach so groß wie eine typische Tagesbewegung der letzten " + k.samples + " Beobachtungen."
      };
    });
  }

  var api = {
    METHOD_VERSION: METHOD_VERSION, HORIZONS: H,
    seriesSignals: seriesSignals, moveRatio: moveRatio,
    trend: trend, momentum: momentum, risk: risk, breadth: breadth, crossAsset: crossAsset,
    headline: headline, marketNow: marketNow
  };
  if (isNode) module.exports = api;
  else global.VUMarketPulse = api;
})(typeof window !== "undefined" ? window : globalThis);
