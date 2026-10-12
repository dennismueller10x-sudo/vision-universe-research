/* =========================================================================
   VISION UNIVERSE DISCOVER — im-blick.js

   WAS STEHT HEUTE "IM BLICK"?

   Bis Discover 4.0 bestimmte das 12-Monats-Leadership-Perzentil die
   Eingangsflaeche, dazu feste Zuschlaege fuer Kurschart (+12), bekannten
   Namen (+10) und Firmennamen (+6). Ein neues Jahreshoch zaehlte +4.
   Gemessen 11.09.-09.10.2026: Valero stand an allen geprueften Tagen in
   der Auswahl, meist auf Platz 1 - auch an Tagen mit -2,3 %. Das
   Perzentil einer Aktie, die sich in zwoelf Monaten verdoppelt hat,
   steht wochenlang auf 100; die Eingangsflaeche war damit eine Rangliste
   der Vergangenheit.

   Diese Engine dreht das Verhaeltnis um. Gewertet wird, was am letzten
   Handelstag BELEGBAR passiert ist; die langfristige Fuehrerschaft
   ergaenzt, sie fuehrt nicht.

     EREIGNIS (0..100, Summe gekappt)          Gewicht 0,70
       Jahreshoch      neues 52W-Schlusshoch 30, nur im Tagesverlauf 12
       Ausbruch        bestaetigt (Volumen >= 2x, ueber SMA20/50, <= 10 %
                       unter dem Hoch) 20
       Volumen         Tagesvolumen / 20-Tage-Schnitt, 1,5x..4x -> 0..15,
                       nur an einem Tag ohne Kursverlust im Trend
       Tagesbewegung   Tagesrendite in Einheiten der eigenen 20-Tage-
                       Schwankung, 1..3 sigma -> 0..10, nur aufwaerts und
                       nur ueber SMA50/SMA200
       Kurzfrist-RS    Perzentil der relativen Staerke 1M, 75..95 -> 0..10
       Beschleunigung  1M-Rendite minus 3M/3, 0..15 %-Punkte -> 0..10
       Emerging        RS-1M-Perzentil >= 90 bei Leadership < 80:
                       90..100 -> 0..5
     FUEHRERSCHAFT (0..100)                    Gewicht 0,30
       Leadership-Perzentil (12 Monate, wie bisher)

   Gegen Wiederholung ohne Neuigkeit gibt es KEINE starre Rotation und
   KEINE Hoechstverweildauer: wer heute KEIN frisches Ereignis hat
   (Schlusshoch, Ausbruch, Volumen >= 2x aufwaerts, Bewegung >= 2 sigma),
   verliert 4 Punkte je Sitzung seit seinem letzten Ereignis, hoechstens
   20. Das Ereignisalter kommt aus der Tagesreihe bis asOf - nicht aus
   einer Liste frueherer Anzeigen; der Build bleibt aus seinen Eingaben
   nachrechenbar. Wer jeden Tag ein neues Hoch macht, bleibt.

   Ein Bekanntheitszuschlag bleibt nur als Gleichstandsbrecher (<= 2).
   Kurschart und Firmenname sind keine Zuschlaege mehr, sondern
   Voraussetzung der Darstellung (sonst kann die Flaeche den Titel nicht
   zeigen). Liquiditaet, Kurs, Historie: die Qualifikation "staerkste".

   Auswahl: absteigend nach Gesamtwert, hoechstens zwei je Sektor, je
   bereits gewaehltem Titel desselben Signalprofils 6 Punkte Abschlag
   (Vielfalt ohne Pflichtkategorien). Unter der Mindestschwelle wird
   nichts aufgefuellt - lieber vier starke Titel als fuenf.

   Deterministisch, ohne Zufall, ohne Uhrzeit: dieselbe Eingabe ergibt
   dieselbe Auswahl (der Build ist reproduzierbar, die Nachrechnung
   rechnet nach).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "discover-im-blick-1.0.0";

  /* Kalibriert im Replay 11.09.-09.10.2026 (17 Sitzungen, 43.889
     Titeltage; docs/DISCOVER_IM_BLICK.md). Reine Tagesspitzen (>= 3 sigma)
     liefen in den Folgetagen im Mittel unter den Median, deshalb ist die
     Tagesbewegung bei 3 sigma gedeckelt und nur im intakten Trend
     gewertet; das Schlusshoch und der Ausbruch mit Volumen tragen. */
  var DEFAULTS = {
    weights: { event: 0.7, persistent: 0.3 },
    points: {
      closeAtHigh: 30, touchedHigh: 12, breakout: 20, volume: 15, dayMove: 10,
      shortRs: 10, acceleration: 10, emerging: 5
    },
    ranges: {
      volume: [1.5, 4], dayMoveSigma: [1, 3], shortRsPct: [75, 95],
      acceleration: [0, 0.15], emergingRsPct: [90, 100]
    },
    emergingMaxLeadership: 80,
    fresh: { volume: 2, dayMoveSigma: 2 },
    damping: { perSession: 4, max: 20, window: 20 },
    recognitionTieBreak: { 1: 2, 2: 1 },
    profileRepeatPenalty: 6,
    minProfilePoints: 10,
    requireTrendForMoves: true,
    minAvgDollarVolume: 0,
    instrumentTypes: ["EQUITY_COMMON", "ADR", "REIT"],
    maxPerSector: 2,
    count: 5,
    minScore: 40,
    rowLimit: 30
  };

  var LABELS = {
    closeAtHigh: "Neues 52-Wochen-Schlusshoch", touchedHigh: "52-Wochen-Hoch im Tagesverlauf",
    breakout: "Bestätigter Ausbruch", volume: "Ungewöhnliches Volumen", dayMove: "Starke Tagesbewegung",
    shortRs: "Kurzfristig stärker als der Markt", acceleration: "Anstieg beschleunigt", emerging: "Neu unter den Starken",
    persistent: "Langfristige Führerschaft", damping: "Letztes Ereignis liegt zurück", recognition: "Bekannter Name (Gleichstand)"
  };

  /* Signalprofile: welche Art von Ereignis traegt den Titel? */
  var PROFILES = {
    highs: ["closeAtHigh", "touchedHigh"],
    breakout: ["breakout", "volume"],
    momentum: ["dayMove", "acceleration"],
    strength: ["shortRs", "emerging"],
    leadership: ["persistent"]
  };
  var HEADLINES = {
    highs: "NEUES JAHRESHOCH", breakout: "AUSBRUCH MIT VOLUMEN", momentum: "STARKE BEWEGUNG",
    strength: "KURZFRISTIG UNTER DEN STÄRKSTEN", leadership: "UNTER DEN STÄRKSTEN AKTIEN"
  };

  /* Fonds sind keine Unternehmen. Der Wertpapierstamm fuehrt (10/2026)
     167 Fonds/ETFs als EQUITY_COMMON ("GQG US Equity ETF"); bis das an der
     Quelle behoben ist, haelt der Name sie von der Eingangsflaeche fern. */
  var FONDS = /\b(ETF|ETN)\b|\bFund\b/i;

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function lin(v, range) {
    if (!isNum(v)) return 0;
    var a = range[0], b = range[1];
    return v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);
  }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function merge(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) {
      out[k] = (b && b[k] !== undefined)
        ? (a[k] && typeof a[k] === "object" && !Array.isArray(a[k]) ? merge(a[k], b[k]) : b[k])
        : a[k];
    });
    return out;
  }
  function config(c) { return merge(DEFAULTS, c || {}); }

  /**
   * Die Ereigniseingaben eines Titels - alles aus Feldern, die der Build
   * ohnehin ausliefert (Faktorzeile des letzten Handelstags, Tagesreihe).
   * Kein Feld kommt aus der Zukunft: jedes gilt zum Schluss von asOf.
   */
  function inputs(stock) {
    var v = stock.rawValues || {};
    var m = stock.metrics || {};
    var cp = stock.changePercent && isNum(stock.changePercent.value) ? stock.changePercent.value / 100
           : isNum(stock.return1D) ? stock.return1D : null;
    var vol20 = isNum(v.volatility20d) ? v.volatility20d : null;
    return {
      symbol: stock.symbol,
      sector: stock.sector || null,
      return1D: cp,
      dailyVol: isNum(vol20) && vol20 > 0 ? vol20 / Math.sqrt(252) : null,
      volumeSpike: isNum(v.volumeSpikeRatio) ? v.volumeSpikeRatio : (isNum(m.volumeSpikeRatio) ? m.volumeSpikeRatio : null),
      closeAtHigh: stock.closingHigh52w === true,
      eventAge: isNum(stock.eventAge) ? stock.eventAge : null,
      touchedHigh: v.newHigh52w === true || (stock.signals && stock.signals.new52WeekHigh === true),
      breakout: !!(stock.signals && stock.signals.breakout === true),
      relativeStrength1M: isNum(m.relativeStrength1M) ? m.relativeStrength1M : null,
      trendSupport: v.priceAboveSMA50 === true && v.priceAboveSMA200 !== false,
      avgDollarVolume: stock.qualification && isNum(stock.qualification.avgDollarVolume20d) ? stock.qualification.avgDollarVolume20d : null,
      acceleration: isNum(m.momentumAcceleration) ? m.momentumAcceleration : null,
      leadershipPercentile: isNum(m.leadershipPercentile) ? m.leadershipPercentile : null,
      recognitionTier: stock.recognitionTier || null,
      eligible: stock.discoveryEligible !== false,
      qualified: !!(stock.qualification && stock.qualification.strongest === true),
      displayable: stock.hasPriceSeries === true && !!stock.companyName,
      instrumentType: stock.instrumentType || null,
      fundLike: FONDS.test(String(stock.companyName || ""))
    };
  }

  /**
   * Perzentil (0..100) der relativen Staerke 1M im Universum. Bindungen
   * bekommen den Mittelrang - dieselbe Regel wie scoring.js.
   */
  function percentileScale(values) {
    var sorted = values.filter(isNum).slice().sort(function (a, b) { return a - b; });
    var n = sorted.length;
    return function (x) {
      if (!isNum(x) || !n) return null;
      var lo = 0, hi = n;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid] < x) lo = mid + 1; else hi = mid; }
      var a = lo; lo = a; hi = n;
      while (lo < hi) { var m2 = (lo + hi) >> 1; if (sorted[m2] <= x) lo = m2 + 1; else hi = m2; }
      return r6(((a + lo) / 2 / n) * 100);
    };
  }

  /**
   * Neues 52-Wochen-SCHLUSSHOCH: der Schluss von asOf liegt ueber jedem
   * Schluss der vorherigen 251 Sitzungen (mindestens 200 vorhanden).
   * Die Faktorzeile kennt nur "Schluss >= hoechstes Tageshoch"
   * (closeAtHigh52w) - das trifft an 2,6 Mio. Titeltagen fast nie zu
   * (Replay 09-10/2026: 9 von 43.889) und ist als Ereignis wertlos.
   * points: [[datum, schluss], ...] aufsteigend.
   */
  function closingHigh(points, asOf, opts) {
    var o = Object.assign({ lookback: 251, minPrior: 200 }, opts || {});
    if (!Array.isArray(points) || !points.length) return null;
    var i = points.length - 1;
    while (i >= 0 && points[i][0] > asOf) i--;
    if (i < 0 || points[i][0] !== asOf || !isNum(points[i][1])) return null;
    var von = Math.max(0, i - o.lookback);
    if (i - von < o.minPrior) return null;
    var max = -Infinity;
    for (var k = von; k < i; k++) if (isNum(points[k][1]) && points[k][1] > max) max = points[k][1];
    return points[i][1] > max;
  }

  /**
   * Sitzungen seit dem letzten belegten Ereignis bis einschliesslich asOf:
   * neues 52-Wochen-Schlusshoch oder Aufwaertstag >= 2 sigma der eigenen
   * 20-Tage-Schwankung. 0 = heute, k = vor k Sitzungen, window = keines
   * im Fenster (oder zu wenig Historie). Nur Schluesse bis asOf - die
   * Antwort haengt weder an spaeteren Daten noch daran, was frueher
   * angezeigt wurde (zustandslos, aus den Eingaben nachrechenbar).
   */
  function eventAge(points, asOf, opts) {
    var o = Object.assign({ window: 20, sigma: 2, lookback: 251, minPrior: 200 }, opts || {});
    if (!Array.isArray(points) || !points.length) return o.window;
    var i = points.length - 1;
    while (i >= 0 && points[i][0] > asOf) i--;
    if (i < 0 || points[i][0] !== asOf) return o.window;
    for (var k = 0; k < o.window && i - k > 0; k++) {
      var t = i - k;
      var c = points[t][1], p = points[t - 1][1];
      if (!isNum(c) || !isNum(p) || p <= 0) continue;
      var von = Math.max(0, t - o.lookback);
      if (t - von >= o.minPrior) {
        var max = -Infinity;
        for (var j = von; j < t; j++) if (isNum(points[j][1]) && points[j][1] > max) max = points[j][1];
        if (c > max) return k;
      }
      var r = [];
      for (var q = Math.max(1, t - 20); q < t; q++) {
        if (isNum(points[q][1]) && isNum(points[q - 1][1]) && points[q - 1][1] > 0) r.push(points[q][1] / points[q - 1][1] - 1);
      }
      if (r.length >= 10) {
        var mean = r.reduce(function (a2, b2) { return a2 + b2; }, 0) / r.length;
        var sd = Math.sqrt(r.reduce(function (a2, b2) { return a2 + (b2 - mean) * (b2 - mean); }, 0) / (r.length - 1));
        if (sd > 0 && (c / p - 1) / sd >= o.sigma) return k;
      }
    }
    return o.window;
  }

  /**
   * Wert eines Titels. ctx: {rsPct(x), config}; das Ereignisalter steht
   * in inp.eventAge (Sitzungen seit dem letzten Ereignis).
   * Rueckgabe traegt jede Komponente mit Punkten - die Begruendung ist
   * die Rechnung.
   */
  function score(inp, ctx) {
    var c = config(ctx && ctx.config);
    var P = c.points, R = c.ranges;
    var comp = [];
    function add(id, points, value) {
      if (points > 0) comp.push({ id: id, label: LABELS[id], value: isNum(value) ? r6(value) : value === undefined ? null : value, points: r6(points) });
    }
    if (inp.closeAtHigh) add("closeAtHigh", P.closeAtHigh, true);
    else if (inp.touchedHigh) add("touchedHigh", P.touchedHigh, true);
    if (inp.breakout) add("breakout", P.breakout, true);
    /* Volumen und Tagesbewegung zaehlen nur im intakten Trend (ueber SMA50
       und SMA200): ein Kurssprung im Abwaertstrend ist eine Nachricht,
       kein Signal. Replay 09-10/2026: ohne diese Bedingung lag die
       Auswahl am Folgetag im Mittel unter dem Median. */
    var trendOk = !c.requireTrendForMoves || inp.trendSupport === true;
    var up = isNum(inp.return1D) && inp.return1D >= 0 && trendOk;
    if (up) add("volume", P.volume * lin(inp.volumeSpike, R.volume), inp.volumeSpike);
    var sigma = isNum(inp.return1D) && isNum(inp.dailyVol) && inp.dailyVol > 0 ? inp.return1D / inp.dailyVol : null;
    if (trendOk && isNum(sigma) && sigma > 0) add("dayMove", P.dayMove * lin(sigma, R.dayMoveSigma), inp.return1D);
    var rsPct = ctx && ctx.rsPct ? ctx.rsPct(inp.relativeStrength1M) : null;
    add("shortRs", P.shortRs * lin(rsPct, R.shortRsPct), rsPct);
    add("acceleration", P.acceleration * lin(inp.acceleration, R.acceleration), inp.acceleration);
    if (isNum(inp.leadershipPercentile) && inp.leadershipPercentile < c.emergingMaxLeadership) {
      add("emerging", P.emerging * lin(rsPct, R.emergingRsPct), rsPct);
    }
    var event = Math.min(100, comp.reduce(function (s, x) { return s + x.points; }, 0));
    var persistent = isNum(inp.leadershipPercentile) ? inp.leadershipPercentile : 0;

    var fresh = inp.closeAtHigh || inp.breakout ||
                (up && isNum(inp.volumeSpike) && inp.volumeSpike >= c.fresh.volume) ||
                (trendOk && isNum(sigma) && sigma >= c.fresh.dayMoveSigma);
    /* Ohne frisches Ereignis zaehlt, wie lange das letzte zurueckliegt:
       perSession Punkte je Sitzung, hoechstens max. Wer heute ein Ereignis
       hat, verliert nichts - egal wie oft er schon im Blick war. */
    var alter = isNum(inp.eventAge) ? inp.eventAge : c.damping.window;
    var damping = fresh ? 0 : Math.min(c.damping.max, c.damping.perSession * Math.max(1, alter));
    var tie = c.recognitionTieBreak[inp.recognitionTier] || 0;

    var total = c.weights.event * event + c.weights.persistent * persistent - damping + tie;

    /* Profil: die Ereignisgruppe mit den meisten Punkten - Fuehrerschaft
       nur, wenn kein Ereignis mindestens minProfilePoints traegt. */
    var gruppen = {};
    Object.keys(PROFILES).forEach(function (p) { if (p !== "leadership") gruppen[p] = 0; });
    comp.forEach(function (x) {
      Object.keys(gruppen).forEach(function (p) { if (PROFILES[p].indexOf(x.id) >= 0) gruppen[p] += x.points; });
    });
    var profil = "leadership", bestPunkte = c.minProfilePoints - 1e-9;
    ["highs", "breakout", "momentum", "strength"].forEach(function (p) { if (gruppen[p] > bestPunkte) { bestPunkte = gruppen[p]; profil = p; } });

    var components = comp.slice().sort(function (a, b) { return b.points - a.points; });
    components.push({ id: "persistent", label: LABELS.persistent, value: r6(persistent), points: r6(persistent * c.weights.persistent / c.weights.event) });
    if (damping) components.push({ id: "damping", label: LABELS.damping, value: alter, points: -r6(damping / c.weights.event) });

    return {
      engineVersion: ENGINE_VERSION,
      score: r6(Math.max(0, Math.min(100, total))),
      event: r6(event), persistent: r6(persistent),
      weights: c.weights, components: components,
      profile: profil, freshEvent: !!fresh, eventAge: fresh ? 0 : alter, damping: r6(damping),
      tieBreak: tie, relativeStrength1MPercentile: rsPct,
      sigma: isNum(sigma) ? r6(sigma) : null
    };
  }

  /* ------------------------------------------------------ Intraday

     Waehrend der Sitzung wird die Auswahl aus den 5-Minuten-Kursen neu
     gerechnet (scripts/discover/build-im-blick-live.mjs). Getrennt von den
     bestaetigten Schlusskurs-Signalen:
       - ein Schlusshoch gibt es intraday nicht (closeAtHigh = false);
         "ueber dem bisherigen 52W-Schlusshoch" zaehlt wie ein Hoch im
         Tagesverlauf und heisst auch so
       - Ausbruch und Volumen entfallen: die Intraday-Quelle fuehrt nur
         IEX-Volumen, das nicht mit dem Tagesvolumen vergleichbar ist
       - Fuehrerschaft, RS-Perzentil, Beschleunigung, Trend und
         Schwankung stammen vom letzten Schluss (basis), nie aus der Sitzung
     Kein Look-ahead: die Basis gilt zum Schluss der Vorsitzung, der Kurs
     zum Zeitpunkt asOf des Snapshots. */

  /** Die EOD-Basis eines zulaessigen Titels fuer die naechste Sitzung. */
  function basis(entry, closes) {
    var inp = entry.inputs, res = entry.result;
    var hi = null, close = null;
    if (Array.isArray(closes) && closes.length) {
      var von = Math.max(0, closes.length - 252);
      for (var i = von; i < closes.length; i++) if (isNum(closes[i][1]) && (hi === null || closes[i][1] > hi)) hi = closes[i][1];
      close = closes[closes.length - 1][1];
    }
    return {
      s: inp.symbol, sec: inp.sector, tier: inp.recognitionTier || null,
      lp: inp.leadershipPercentile, rs: res.relativeStrength1MPercentile, acc: inp.acceleration,
      vol: isNum(inp.dailyVol) ? r6(inp.dailyVol) : null, trend: inp.trendSupport === true,
      age: isNum(inp.eventAge) ? inp.eventAge : null, hi: hi, close: close, eod: res.score
    };
  }

  /** Eingaben aus Basis + Intraday-Stand {price, previousClose, dayHigh}. */
  function liveInputs(b, live) {
    var prev = live && isNum(live.previousClose) && live.previousClose > 0 ? live.previousClose : null;
    var price = live && isNum(live.price) ? live.price : null;
    return {
      symbol: b.s, sector: b.sec || null, live: true,
      return1D: prev && price ? price / prev - 1 : null,
      dailyVol: isNum(b.vol) ? b.vol : null,
      volumeSpike: null, closeAtHigh: false, breakout: false,
      touchedHigh: !!(live && isNum(live.dayHigh) && isNum(b.hi) && live.dayHigh > b.hi),
      relativeStrength1M: null, rsPctFixed: isNum(b.rs) ? b.rs : null,
      trendSupport: b.trend === true, avgDollarVolume: null,
      acceleration: isNum(b.acc) ? b.acc : null,
      leadershipPercentile: isNum(b.lp) ? b.lp : null,
      recognitionTier: b.tier || null,
      eventAge: isNum(b.age) ? b.age + 1 : null,
      eligible: true, qualified: true, displayable: true, instrumentType: null, fundLike: false
    };
  }

  function scoreLive(b, live, cfg) {
    var inp = liveInputs(b, live);
    var res = score(inp, { rsPct: function () { return inp.rsPctFixed; }, config: cfg });
    return { inputs: inp, result: res, admissible: isNum(inp.return1D) };
  }

  /** Wer darf ueberhaupt auf die Eingangsflaeche? */
  function admissible(inp, cfg) {
    var c = config(cfg);
    return inp.eligible && inp.qualified && inp.displayable && !inp.fundLike &&
           (!c.minAvgDollarVolume || (isNum(inp.avgDollarVolume) && inp.avgDollarVolume >= c.minAvgDollarVolume)) &&
           (!inp.instrumentType || c.instrumentTypes.indexOf(inp.instrumentType) >= 0);
  }

  /**
   * Bewertet das ganze Universum. stocks: Build-Titel (mit eventAge und
   * closingHigh52w aus der Tagesreihe).
   * Rueckgabe: Map symbol -> {inputs, result} fuer zulaessige Titel.
   */
  function rate(stocks, opts) {
    opts = opts || {};
    var c = config(opts.config);
    var alle = stocks.map(inputs);
    var rsPct = percentileScale(alle.filter(function (i) { return i.eligible; }).map(function (i) { return i.relativeStrength1M; }));
    var out = new Map();
    alle.forEach(function (inp) {
      var res = score(inp, { rsPct: rsPct, config: c });
      out.set(inp.symbol, { inputs: inp, result: res, admissible: admissible(inp, c) });
    });
    return out;
  }

  /**
   * Auswahl der Eingangsflaeche aus bewerteten Titeln.
   * rated: Array {inputs, result}; Rueckgabe: Array derselben Eintraege.
   */
  function select(rated, opts) {
    var c = config(opts && opts.config);
    var rest = rated.filter(function (r) { return r.admissible !== false && r.result.score >= c.minScore; })
      .sort(function (a, b) { return b.result.score - a.result.score || (a.inputs.symbol < b.inputs.symbol ? -1 : 1); });
    var auswahl = [], proSektor = Object.create(null), proProfil = Object.create(null);
    while (auswahl.length < c.count && rest.length) {
      var best = -1, bestWert = -Infinity;
      for (var i = 0; i < rest.length; i++) {
        var r = rest[i], sek = r.inputs.sector || "?";
        if ((proSektor[sek] || 0) >= c.maxPerSector) continue;
        var wert = r.result.score - c.profileRepeatPenalty * (proProfil[r.result.profile] || 0);
        if (wert > bestWert + 1e-9) { bestWert = wert; best = i; }
      }
      if (best < 0) break;
      var pick = rest.splice(best, 1)[0];
      proSektor[pick.inputs.sector || "?"] = (proSektor[pick.inputs.sector || "?"] || 0) + 1;
      proProfil[pick.result.profile] = (proProfil[pick.result.profile] || 0) + 1;
      auswahl.push(pick);
    }
    return auswahl;
  }

  function pct(v, digits) {
    var s = (Math.abs(v) * 100).toFixed(digits === undefined ? 1 : digits).replace(".", ",");
    return (v >= 0 ? "+" : "−") + s + " %";
  }

  /** Bis zu drei belegte Gruende, staerkster zuerst - jede Zahl aus der Rechnung. */
  function reasons(entry) {
    var inp = entry.inputs, res = entry.result, out = [];
    res.components.forEach(function (x) {
      if (out.length >= 3) return;
      if (x.id === "closeAtHigh") out.push({ id: x.id, label: "Schlusskurs", value: "höchster seit 52 Wochen" });
      else if (x.id === "touchedHigh") out.push({ id: x.id, label: "im Tagesverlauf", value: inp.live ? "über dem 52-Wochen-Schlusshoch" : "52-Wochen-Hoch erreicht" });
      else if (x.id === "breakout") out.push({ id: x.id, label: "Ausbruch", value: "über den Durchschnitten, mit Volumen" });
      else if (x.id === "volume" && isNum(inp.volumeSpike)) out.push({ id: x.id, label: "Volumen", value: inp.volumeSpike.toFixed(1).replace(".", ",") + "× Ø 20 Tage" });
      else if (x.id === "dayMove" && isNum(inp.return1D)) out.push({ id: x.id, label: inp.live ? "heute bisher" : "am letzten Handelstag", value: pct(inp.return1D) });
      else if ((x.id === "shortRs" || x.id === "emerging") && isNum(res.relativeStrength1MPercentile) && !out.some(function (o) { return o.id === "shortRs" || o.id === "emerging"; })) {
        out.push({ id: x.id, label: "1 Monat gegen den Markt", value: "stärker als " + Math.min(99, Math.round(res.relativeStrength1MPercentile)) + " %" });
      } else if (x.id === "acceleration" && isNum(inp.acceleration)) out.push({ id: x.id, label: "letzter Monat", value: "Anstieg beschleunigt" });
      else if (x.id === "persistent" && isNum(inp.leadershipPercentile)) out.push({ id: x.id, label: "12 Monate", value: "stärker als " + Math.min(99, Math.round(inp.leadershipPercentile)) + " %" });
    });
    return out;
  }

  function headline(entry) {
    var res = entry.result;
    var k = HEADLINES[res.profile] || HEADLINES.leadership;
    if (res.profile === "highs" && !entry.inputs.closeAtHigh) k = "JAHRESHOCH IM TAGESVERLAUF";
    return { kicker: k, line: "" };
  }

  /** Der kompakte Beleg, den eine Karte traegt (Nachrechnung, Anzeige). */
  function evidence(entry, basis) {
    var res = entry.result;
    return {
      engineVersion: ENGINE_VERSION, basis: basis || "EOD_CLOSE",
      score: res.score, event: res.event, persistent: res.persistent, profile: res.profile,
      freshEvent: res.freshEvent, eventAge: res.eventAge, damping: res.damping,
      components: res.components.map(function (x) { return { id: x.id, points: x.points }; }),
      reasons: reasons(entry)
    };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, LABELS: LABELS, PROFILES: PROFILES, HEADLINES: HEADLINES,
    config: config, inputs: inputs, closingHigh: closingHigh, percentileScale: percentileScale, eventAge: eventAge,
    score: score, admissible: admissible, rate: rate, select: select,
    reasons: reasons, headline: headline, evidence: evidence,
    basis: basis, liveInputs: liveInputs, scoreLive: scoreLive
  };
  if (isNode) module.exports = api;
  else { global.VUDiscover = global.VUDiscover || {}; global.VUDiscover.ImBlick = api; }
})(typeof window !== "undefined" ? window : globalThis);
