/* =========================================================================
   VISION UNIVERSE — realtime/staleness.js

   Ein Kurs, der einmal live war, bleibt es nicht.

   Das ist der Fehler, der einem Live-Chart am haeufigsten passiert und am
   schwersten auffaellt: die Verbindung reisst, das letzte Bild bleibt
   stehen, und darueber steht weiterhin "LIVE". Nichts blinkt, nichts
   meldet sich - der Chart sieht genauso aus wie vorher. Nur ist der Kurs
   jetzt zwanzig Minuten alt, und jemand trifft eine Entscheidung darauf.

   Deshalb hat jeder Datenstand hier ein Verfallsdatum. Drei Stufen:

     FRESH      der Wert ist so aktuell, wie diese Klasse sein kann
     DEGRADED   er ist aelter als erwartet, aber noch brauchbar
     STALE      er ist nicht mehr das, wofuer er sich ausgibt

   ZWEI ZEITEN, NICHT EINE

   `timestamp` sagt, wann der Kurs entstand. `receivedAt` sagt, wann wir
   ihn bekamen. Die Luecke dazwischen ist die Anbieterverzoegerung, die
   Luecke danach unsere. Wer nur eine der beiden misst, verwechselt
   regelmaessig einen langsamen Anbieter mit einer toten Verbindung -
   und behebt dann das falsche Problem.

   MARKTZEITEN

   Bei geschlossener Boerse gibt es keine Staleness. Ein Kurs von Freitag
   17:00 ist am Sonntag nicht verdorben, er ist der letzte, den es gibt.
   Er wird deshalb nicht STALE genannt, sondern MARKET_CLOSED - und er
   heisst trotzdem nicht mehr LIVE.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var MarketHours = isNode ? require("./market-hours.js") : global.VURealtime.MarketHours;
  var DataClass = isNode ? require("./data-class.js") : global.VURealtime.DataClass;

  var LEVELS = ["FRESH", "DEGRADED", "STALE", "MARKET_CLOSED", "UNKNOWN"];

  /* Der eingebaute Schwellensatz. Er ist eine Kopie der ausgelieferten
     Konfiguration und existiert, damit das Modul auch ohne geladene Datei
     funktioniert - nicht als zweite Quelle. Wer die Datei uebergibt,
     ueberschreibt ihn vollstaendig. */
  var BUILTIN = {
    thresholdSetId: "realtime-thresholds-builtin",
    classes: {
      REALTIME_STREAM: { freshMs: 15000, degradedMs: 60000, fallbackMs: 180000 },
      REALTIME_QUOTE:  { freshMs: 30000, degradedMs: 120000, fallbackMs: 300000 },
      INTRADAY: {
        freshMsPerIntervalFactor: 2, degradedMsPerIntervalFactor: 4,
        fallbackMsPerIntervalFactor: 8, minFreshMs: 120000
      },
      EOD: { freshTradingDays: 1, degradedTradingDays: 3,
             freshMsAfterCloseHours: 30, degradedMsAfterCloseHours: 96 }
    },
    sessions: {
      REGULAR: { applies: true, factor: 1 },
      PRE: { applies: false, factor: 4 },
      AFTER: { applies: false, factor: 4 },
      CLOSED: { applies: false, factor: null }
    }
  };

  var HOUR_MS = 3600000;

  /** Bar-Intervall in Millisekunden. "5min", "5m", 300000 - alles erlaubt. */
  function intervalMs(interval) {
    if (typeof interval === "number" && isFinite(interval) && interval > 0) return interval;
    var m = String(interval || "").match(/^(\d+)\s*(min|m|h|hour|s|sec)?$/i);
    if (!m) return 300000;                                   // 5 Minuten als Vorgabe
    var n = parseInt(m[1], 10);
    var unit = (m[2] || "min").toLowerCase();
    if (unit === "s" || unit === "sec") return n * 1000;
    if (unit === "h" || unit === "hour") return n * 3600000;
    return n * 60000;
  }

  /**
   * Die Schwellen fuer eine Klasse, in Millisekunden.
   * Intraday rechnet relativ zum Intervall, EOD in Stunden nach Schluss.
   */
  function thresholdsFor(dataClass, opts) {
    opts = opts || {};
    var cfg = (opts.thresholds || BUILTIN);
    var spec = (cfg.classes && cfg.classes[dataClass]) || null;
    if (!spec) return null;

    if (dataClass === "INTRADAY") {
      var iv = intervalMs(opts.interval);
      var fresh = Math.max(spec.minFreshMs || 0, iv * (spec.freshMsPerIntervalFactor || 2));
      return {
        freshMs: fresh,
        degradedMs: Math.max(fresh, iv * (spec.degradedMsPerIntervalFactor || 4)),
        fallbackMs: Math.max(fresh, iv * (spec.fallbackMsPerIntervalFactor || 8))
      };
    }
    if (dataClass === "EOD") {
      return {
        freshMs: (spec.freshMsAfterCloseHours || 30) * HOUR_MS,
        degradedMs: (spec.degradedMsAfterCloseHours || 96) * HOUR_MS,
        fallbackMs: Infinity
      };
    }
    return {
      freshMs: spec.freshMs, degradedMs: spec.degradedMs,
      fallbackMs: spec.fallbackMs === undefined ? Infinity : spec.fallbackMs
    };
  }

  /**
   * Bewertet einen Datenstand.
   *
   * @param {object} input
   *   dataClass   Pflicht
   *   timestamp   Entstehungszeit des Werts (ISO oder ms)
   *   receivedAt  Empfangszeit bei uns (ISO oder ms), optional
   *   now         Bezugszeit (ISO oder ms), Standard: jetzt
   *   interval    Bar-Intervall fuer INTRADAY
   *   session     Sitzungsbefund aus market-hours.js, optional
   *   calendar    Kalender, falls session nicht uebergeben wird
   *   thresholds  Schwellensatz aus realtime-thresholds.json
   *   includeExtended  zaehlen PRE/AFTER als erwartete Aktualisierung?
   *
   * @returns {object} {level, ageMs, providerLagMs, transportLagMs,
   *                    thresholds, session, reason, allowsLive}
   */
  function evaluate(input) {
    input = input || {};
    var dataClass = input.dataClass || "UNAVAILABLE";
    var now = toMs(input.now, Date.now());
    var ts = toMs(input.timestamp, null);
    var recv = toMs(input.receivedAt, null);

    var session = input.session || MarketHours.sessionAt(now, {
      calendar: input.calendar, exchange: input.exchange
    });

    var base = {
      dataClass: dataClass, session: session,
      ageMs: null, providerLagMs: null, transportLagMs: null,
      thresholds: null, reason: null, allowsLive: false,
      evaluatedAt: new Date(now).toISOString()
    };

    if (dataClass === "UNAVAILABLE") {
      return assign(base, { level: "UNKNOWN", reason: "noDataClass" });
    }
    if (ts === null) {
      /* Kein Zeitstempel ist kein frischer Wert. Ein Datenstand ohne
         Entstehungszeit laesst sich nicht bewerten, und was sich nicht
         bewerten laesst, darf nicht LIVE heissen. */
      return assign(base, { level: "UNKNOWN", reason: "missingTimestamp" });
    }

    var ageMs = now - ts;
    var providerLagMs = recv !== null ? recv - ts : null;
    var transportLagMs = recv !== null ? now - recv : null;
    var th = thresholdsFor(dataClass, input);

    base = assign(base, {
      ageMs: ageMs, providerLagMs: providerLagMs, transportLagMs: transportLagMs,
      thresholds: th
    });

    /* Ein Zeitstempel aus der Zukunft ist ein Uhrenproblem oder eine
       falsche Zeitzone - beides kein frischer Kurs. Eine kleine Toleranz
       fuer Uhrendrift bleibt, alles darueber wird benannt. */
    var skew = input.futureToleranceMs === undefined ? 5000 : input.futureToleranceMs;
    if (ageMs < -skew) {
      return assign(base, { level: "UNKNOWN", reason: "timestampInFuture" });
    }

    /* Geschlossene Boerse: kein Verfall, aber auch kein LIVE. */
    var sessionCfg = ((input.thresholds || BUILTIN).sessions || BUILTIN.sessions)[session.phase] ||
                     { applies: false, factor: null };
    var expects = MarketHours.expectsUpdates(session, input.includeExtended === true);

    if (!expects) {
      /* EOD ist die Ausnahme: ein Tagesschluss veraltet auch bei
         geschlossener Boerse, nur eben in Tagen statt Sekunden. Sonst
         waere ein drei Wochen alter Schlusskurs am Sonntag "in Ordnung". */
      var eod = eodAlter(input, dataClass, ts, now);
      if (eod) {
        base = assign(base, { tradingDaysBehind: eod.tradingDays });
        if (eod.level !== "FRESH") return assign(base, { level: eod.level, reason: eod.reason });
      }
      return assign(base, {
        level: "MARKET_CLOSED",
        reason: session.closedReason || "outsideExpectedUpdateWindow"
      });
    }

    if (!th) return assign(base, { level: "UNKNOWN", reason: "noThresholds" });

    var factor = sessionCfg.factor || 1;
    var fresh = th.freshMs * factor;
    var degraded = th.degradedMs * factor;

    if (ageMs <= fresh) {
      return assign(base, {
        level: "FRESH", reason: null,
        allowsLive: DataClass.isRealtimeClass(dataClass)
      });
    }
    if (ageMs <= degraded) return assign(base, { level: "DEGRADED", reason: "aging" });
    return assign(base, { level: "STALE", reason: "exceededDegradedThreshold" });
  }

  /**
   * Soll auf eine schlechtere Datenklasse zurueckgefallen werden?
   * Getrennt von der Bewertung, weil "alt" und "aufgeben" zwei
   * Entscheidungen sind - die erste trifft die Anzeige, die zweite die
   * Verbindung.
   */
  function shouldFallback(evaluation) {
    if (!evaluation || !evaluation.thresholds) return false;
    if (evaluation.level === "MARKET_CLOSED") return false;
    var limit = evaluation.thresholds.fallbackMs;
    if (limit === undefined || limit === null || limit === Infinity) return false;
    return typeof evaluation.ageMs === "number" && evaluation.ageMs > limit;
  }

  /**
   * Wie alt ist ein Tagesschluss?
   *
   * In Handelstagen, wenn ein Kalender vorliegt - sonst in Stunden.
   *
   * Der Unterschied ist im Betrieb aufgefallen und nicht theoretisch: ein
   * Schluss vom Freitag ist am Dienstag nach Wochenende und Labor Day 108
   * Kalenderstunden alt und lag damit ueber jeder Stundenschwelle. Es
   * fehlte aber kein einziger Handelstag. Eine Warnung, die nach jedem
   * langen Wochenende erscheint, ist keine Warnung mehr.
   *
   * `tradingDay` ist der Handelstag als Datum. Er wird bevorzugt, weil
   * ein Tagesschluss ein Tag ist und kein Zeitpunkt: als UTC-Mitternacht
   * gelesen und in Boersenzeit zurueckgerechnet wird aus dem 4. der 3.
   */
  function eodAlter(input, dataClass, ts, now) {
    if (dataClass !== "EOD") return null;
    var cfg = (input.thresholds || BUILTIN);
    var spec = (cfg.classes && cfg.classes.EOD) || BUILTIN.classes.EOD;

    var kalender = input.calendar;
    var bezug = input.tradingDay || ts;
    if (kalender && spec.degradedTradingDays !== undefined) {
      var tage = MarketHours.tradingDaysBetween(bezug, now, {
        calendar: kalender, exchange: input.exchange
      });
      if (tage !== null) {
        if (tage > spec.degradedTradingDays) {
          return { level: "STALE", reason: "eodTooOld", tradingDays: tage };
        }
        if (tage > (spec.freshTradingDays === undefined ? 1 : spec.freshTradingDays)) {
          return { level: "DEGRADED", reason: "eodAging", tradingDays: tage };
        }
        return { level: "FRESH", reason: null, tradingDays: tage };
      }
    }

    /* Ohne Kalender bleibt die Stundenrechnung. Sie ist gröber, aber sie
       ist besser als gar keine Alterung. */
    var ageMs = now - ts;
    if (ageMs > (spec.degradedMsAfterCloseHours || 96) * HOUR_MS) {
      return { level: "STALE", reason: "eodTooOld", tradingDays: null };
    }
    if (ageMs > (spec.freshMsAfterCloseHours || 30) * HOUR_MS) {
      return { level: "DEGRADED", reason: "eodAging", tradingDays: null };
    }
    return { level: "FRESH", reason: null, tradingDays: null };
  }

  function toMs(v, fallback) {
    if (v === undefined || v === null) return fallback;
    if (typeof v === "number" && isFinite(v)) return v;
    if (v instanceof Date) return v.getTime();
    var t = new Date(v).getTime();
    return isNaN(t) ? fallback : t;
  }

  function assign(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k]; });
    Object.keys(b).forEach(function (k) { out[k] = b[k]; });
    return out;
  }

  var api = {
    LEVELS: LEVELS,
    BUILTIN_THRESHOLDS: BUILTIN,
    intervalMs: intervalMs,
    thresholdsFor: thresholdsFor,
    evaluate: evaluate,
    shouldFallback: shouldFallback
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.Staleness = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
