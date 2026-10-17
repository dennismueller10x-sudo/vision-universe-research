/* =========================================================================
   VISION UNIVERSE — discontinuity-semantics.js   (discontinuity-semantics-1.0.0)

   EREIGNIS-SEMANTIK GROSSER KURSSPRUENGE (aufwaerts UND abwaerts)

   Ein Sprung ist kein Befund, sondern eine Frage: WAS ist an diesem Tag
   geschehen? Diese Engine ordnet jeden grossen Tagessprung ohne
   Anbieterereignis einer Ursache zu - aus Kanaelen, die eine
   Kapitalmassnahme von einer Marktbewegung unterscheiden, nicht aus der
   Groesse der Rendite:

     FORWARD_SPLIT / REVERSE_SPLIT   mechanische Umskalierung: der
         Dollarumsatz (Stueck x Kurs) bleibt im normalen Band, das
         Stueckvolumen bewegt sich gegenlaeufig zum Kurs, das Verhaeltnis
         liegt an einem ueblichen Split-Verhaeltnis. Ein Split aendert den
         Wert des Unternehmens nicht - eine Nachricht schon.
     SPECIAL_DISTRIBUTION            Abwaertssprung, den eine gemeldete
         Ausschuettung am Tag erklaert
     CURRENCY_OR_UNIT                Faktor 100 oder 1000 (Cent/Dollar,
         Einheit), Stueckvolumen nicht gegenlaeufig; oder ein
         ADR-Verhaeltniswechsel (FINRA) am Tag
     LISTING_CHANGE                  Kalenderluecke > 7 Tage vor dem Sprung
         oder ein Marktplatz-/Symbolwechsel (FINRA) +-3 Sitzungen
     BAD_TICK                        der Kurs faellt binnen zwei Sitzungen
         auf 25 % an den Vortag zurueck
     DATA_STALENESS                  vor dem Sprung >= 5 Sitzungen mit
         identischem Schluss oder ohne Umsatz (aufgestauter Kurs)
     GENUINE_MOVE                    Informationsereignis: Stueck- UND
         Dollarumsatz je mindestens das Dreifache des Medians (abnormaler
         Handel; ein Split vervielfacht nur eines von beiden), keine
         Split-Signatur
     UNRESOLVED                      keine dieser Erklaerungen

   Alle Schwellen sind hier vor jeder Messung festgelegt
   (CORPORATE-ACTION-PROTOCOL-V3.json) und aus der Mechanik abgeleitet,
   nicht aus bekannten Faellen.

   POINT IN TIME
     classify(bars, i) liest nur Kerzen bis i + 2 (Ruecklauf eines
     Fehlkurses). Ohne Kerzen danach ist BAD_TICK nicht entscheidbar; die
     Klassifikation traegt observedAt = Datum der letzten gelesenen Kerze.
     Die Gueltigkeitssicht zum Stichtag (canonical-price-validity.js) ruft
     sie nur mit Kerzen bis zum Stichtag auf.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "discontinuity-semantics-1.0.0";
  var CONFIG = {
    candidateRatio: 3,            /* Kandidat: Tagessprung mindestens 3:1 (Zensus wie #721) */
    extremeRatio: 10,             /* extrem: mindestens 10:1 - ohne positive Erklaerung keine kanonische Rendite */
    conventional: [1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 75, 80, 90, 100, 120, 125, 150, 175, 200, 250, 300, 350, 400, 450, 500, 600, 700, 750, 800, 1000, 1500, 2000, 2500, 3000, 5000, 10000],
    conventionalTolerance: 1.25,  /* Verhaeltnis auf 25 % an einem ueblichen Split-Verhaeltnis (wie der Kern, undeclaredSplitTolerance: die Tagesbewegung liegt darauf) */
    unitRatios: [100, 1000],
    unitTolerance: 1.10,
    volumeBase: 20, volumeMinBase: 5,
    mechanicalDollarBand: 3,      /* Dollarumsatz im Band [1/3, 3] des Medians: mechanisch */
    informationDollarRatio: 3,    /* Informationsereignis: Dollarumsatz >= 3x UND Stueckumsatz >= 3x des Medians */
    informationShareRatio: 3,
    revertSessions: 2, revertTolerance: 1.25,
    staleRun: 5,
    listingGapDays: 7,
    listingEventSessions: 3
  };
  var CAUSES = ["FORWARD_SPLIT", "REVERSE_SPLIT", "SPECIAL_DISTRIBUTION", "CURRENCY_OR_UNIT", "LISTING_CHANGE", "BAD_TICK", "DATA_STALENESS", "GENUINE_MOVE", "UNRESOLVED"];

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function day(d) { return String(d).slice(0, 10); }
  function round(v, k) { if (!isNum(v)) return null; var f = Math.pow(10, k == null ? 4 : k); return Math.round(v * f) / f; }
  function hasSplit(b) { return isNum(b.splitFactor) && Math.abs(b.splitFactor - 1) > 1e-9; }
  function median(xs) { if (!xs.length) return null; var s = xs.slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length / 2)]; }

  /**
   * Bewegung des Tages i, bereinigt um einen gemeldeten Faktor: g = f * close_i / close_{i-1}.
   * Ohne Faktor ist g die Rohbewegung; mit Faktor der Rest, den der Faktor nicht erklaert.
   */
  function residual(bars, i) {
    var b = bars[i], p = bars[i - 1];
    if (!b || !p || !(b.close > 0) || !(p.close > 0)) return null;
    return (hasSplit(b) ? b.splitFactor : 1) * b.close / p.close;
  }
  function nearest(R, list, tol) {
    var best = null, dev = Infinity;
    for (var j = 0; j < list.length; j++) { var x = Math.abs(Math.log(R / list[j])); if (x < dev) { dev = x; best = list[j]; } }
    return dev <= Math.log(tol) ? best : null;
  }
  function volumes(bars, i) {
    var sv = [], dv = [];
    for (var m = i - 1; m >= 0 && sv.length < CONFIG.volumeBase; m--) {
      var x = bars[m];
      if (isNum(x.volume) && x.volume > 0 && x.close > 0) { sv.push(x.volume); dv.push(x.volume * x.close); }
    }
    if (sv.length < CONFIG.volumeMinBase) return null;
    var b = bars[i];
    if (!isNum(b.volume) || b.volume < 0) return null;
    return { share: b.volume / median(sv), dollar: (b.volume * b.close) / median(dv) };
  }

  /**
   * Ursache des Sprungs an Kerze i.
   *
   * @param {Array} bars  aufsteigend {date, open, close, volume, splitFactor, dividend}
   * @param {number} i
   * @param {object} ctx  {listingEvents: [{date, kind, visibleAt}], asOf}
   * @returns {null | {date, cause, ratio, direction, extreme, channels, observedAt, outcome}}
   */
  function classify(bars, i, ctx) {
    ctx = ctx || {};
    var g = residual(bars, i);
    if (!isNum(g) || g <= 0 || Math.abs(Math.log(g)) < Math.log(CONFIG.candidateRatio)) return null;
    var b = bars[i], p = bars[i - 1], up = g > 1, R = up ? g : 1 / g;
    var ch = { ratio: round(g, 6), declaredFactor: hasSplit(b) ? b.splitFactor : null, gap: b.open > 0 ? round(b.open / p.close, 6) : null };
    var lastRead = i;
    /* Ruecklauf (Fehlkurs): binnen zwei Sitzungen zurueck an den Vortag */
    for (var k = 1; k <= CONFIG.revertSessions && i + k < bars.length; k++) {
      var c = bars[i + k]; lastRead = i + k;
      if (hasSplit(c)) break;
      if (c.close > 0 && Math.abs(Math.log(c.close / p.close)) <= Math.log(CONFIG.revertTolerance)) { ch.revertedAfter = k; break; }
    }
    var revertKnown = i + CONFIG.revertSessions < bars.length || ch.revertedAfter;
    if (!ch.revertedAfter) lastRead = Math.min(bars.length - 1, i + CONFIG.revertSessions);
    var gapDays = (Date.parse(day(b.date)) - Date.parse(day(p.date))) / 864e5;
    ch.calendarGapDays = gapDays;
    var stale = 0;
    for (var s = i - 1; s >= 1 && stale < 50; s--) {
      var x = bars[s], y = bars[s - 1];
      if ((x.close === y.close) || !(x.volume > 0)) stale++; else break;
    }
    ch.staleRunBefore = stale;
    var v = volumes(bars, i);
    ch.shareVolumeRatio = v ? round(v.share) : null; ch.dollarVolumeRatio = v ? round(v.dollar) : null;
    var k0 = nearest(R, CONFIG.conventional, CONFIG.conventionalTolerance);
    ch.conventionalRatio = k0;
    var unit = nearest(R, CONFIG.unitRatios, CONFIG.unitTolerance);
    var dateI = day(b.date), idxOf = function (d) { for (var q = 0; q < bars.length; q++) if (day(bars[q].date) >= d) return q; return bars.length; };
    var near = (ctx.listingEvents || []).filter(function (e) {
      if (!e || !e.date || (ctx.asOf && !(e.visibleAt && e.visibleAt < ctx.asOf))) return false;
      return Math.abs(idxOf(e.date) - i) <= CONFIG.listingEventSessions;
    });
    ch.listingEvents = near.map(function (e) { return e.kind; });
    var dividendExplains = !up && isNum(b.dividend) && b.dividend > 0 && b.dividend / p.close >= (1 - 1 / R) * 0.5;
    var mechanical = v && v.dollar >= 1 / CONFIG.mechanicalDollarBand && v.dollar <= CONFIG.mechanicalDollarBand;
    var inverseVolume = v && (up ? Math.log(v.share) <= -0.5 * Math.log(R) : Math.log(v.share) >= 0.5 * Math.log(R));
    ch.mechanical = !!mechanical; ch.inverseVolume = !!inverseVolume;

    var cause;
    if (ch.revertedAfter) cause = "BAD_TICK";
    else if (gapDays > CONFIG.listingGapDays || near.some(function (e) { return e.kind !== "ADR_RATIO_CHANGE"; })) cause = "LISTING_CHANGE";
    else if (near.some(function (e) { return e.kind === "ADR_RATIO_CHANGE"; })) cause = "CURRENCY_OR_UNIT";
    else if (stale >= CONFIG.staleRun) cause = "DATA_STALENESS";
    else if (dividendExplains) cause = "SPECIAL_DISTRIBUTION";
    else if (unit && !inverseVolume) cause = "CURRENCY_OR_UNIT";
    else if (k0 && mechanical && inverseVolume) cause = up ? "REVERSE_SPLIT" : "FORWARD_SPLIT";
    else if (v && v.dollar >= CONFIG.informationDollarRatio && v.share >= CONFIG.informationShareRatio) cause = "GENUINE_MOVE";
    else cause = "UNRESOLVED";
    /* Ohne die Kerzen danach ist ein Ruecklauf nicht ausgeschlossen: die Ursache steht erst mit ihnen fest. */
    var extreme = R >= CONFIG.extremeRatio;
    return { date: dateI, index: i, cause: cause, ratio: round(g, 6), direction: up ? "UP" : "DOWN", extreme: extreme, onDeclaredSplit: hasSplit(b),
      channels: ch, observedAt: day(bars[lastRead].date), revertDecided: !!revertKnown, outcome: outcomeOf(cause, extreme, hasSplit(b)) };
  }

  /**
   * Ausgang (vor der Messung festgelegt):
   *   GENUINE_MOVE, SPECIAL_DISTRIBUTION      ACCEPT
   *   BAD_TICK                                INVALID_RANGE (nur die Kerzen bis zum Ruecklauf; nur extrem, sonst Kern)
   *   LISTING_CHANGE                          TERMINAL (nur extrem)
   *   FORWARD_SPLIT, REVERSE_SPLIT            HOLD_FROM ab 3:1 (mechanische Signatur ohne Quelle:
   *                                           wahrscheinliche Kapitalmassnahme, nie zurueckgerechnet)
   *   CURRENCY_OR_UNIT, DATA_STALENESS,
   *   UNRESOLVED                              HOLD_FROM nur extrem; darunter ACCEPT (gezaehlt)
   *   Rest eines gemeldeten Faktors           wie oben, Grund CORPORATE_ACTION_RESIDUAL
   */
  function outcomeOf(cause, extreme, declared) {
    if (cause === "GENUINE_MOVE" || cause === "SPECIAL_DISTRIBUTION") return "ACCEPT";
    if (cause === "FORWARD_SPLIT" || cause === "REVERSE_SPLIT") return "HOLD_FROM";
    if (!extreme) return "ACCEPT";
    if (cause === "BAD_TICK") return "INVALID_RANGE";
    if (cause === "LISTING_CHANGE") return "TERMINAL";
    return "HOLD_FROM";
  }

  /** Alle Kandidaten einer Reihe (Kerzen bis zum Ende der Liste). */
  function scan(bars, ctx) {
    var out = [];
    for (var i = 1; i < bars.length; i++) { var c = classify(bars, i, ctx); if (c) out.push(c); }
    return out;
  }

  var api = { VERSION: VERSION, CONFIG: CONFIG, CAUSES: CAUSES, classify: classify, scan: scan, residual: residual, outcomeOf: outcomeOf };
  if (isNode) module.exports = api;
  else global.VUDiscontinuitySemantics = api;
})(typeof window !== "undefined" ? window : globalThis);
