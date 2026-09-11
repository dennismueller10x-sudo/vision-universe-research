/* =========================================================================
   VISION UNIVERSE DISCOVER — realtime-source.js

   Die Live-Schicht von Discover (§11, §18 des Auftrags).

   WAS DIESE DATEI NICHT IST

   Sie ist keine zweite Realtime-Engine. Das Repository hat eine
   (quant/engines/realtime/**: Sitzungskalender, Datenklassen-Leiter,
   Staleness, Verbindungszustand, Fallback), und die bleibt unveraendert.
   Diese Datei ist ein Adapter: sie fragt die bestehenden Module, was
   gerade gilt, und uebersetzt die Antwort in genau die vier Auskuenfte,
   die eine Discovery Card braucht:

     darf ueberhaupt live gezeigt werden?     (Gates + Anzeigerichtlinie)
     welche Sitzung laeuft?                   (Kalender)
     wie aktuell ist der Wert?                (Zeitstempel)
     wie heisst der Zustand fuer den Nutzer?  (Label)

   DIE REGEL AUS §18

   Ein LIVE-Punkt erscheint nur, wenn tatsaechlich Echtzeitdaten fliessen.
   In diesem Repository ist das heute nicht der Fall: ENABLE_LIVE_MARKET_DATA
   und ENABLE_PUBLIC_LIVE_MARKET_DATA stehen auf false, und die
   Anzeigerichtlinie gibt fuer Realtime nichts frei. Die ehrliche Anzeige
   ist deshalb "LETZTER SCHLUSSKURS" mit Datum - nicht ein gruener Punkt,
   der eine Aktualitaet behauptet, die es nicht gibt.

   Die Trennung aus §11 (Realtime-Signale vs. periodisch abgeleitete
   Signale) steht in REALTIME_FIELDS und DERIVED_FIELDS: nur was dort oben
   steht, wird bei einem Tick ueberhaupt neu gerechnet.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var MarketHours = isNode ? require("../../quant/engines/realtime/market-hours.js")
                           : (global.VURealtime && global.VURealtime.MarketHours);
  var High52w = isNode ? require("./high52w.js")
                       : (global.VUDiscover && global.VUDiscover.High52w);

  var ENGINE_VERSION = "discover-realtime-1.0.0";

  /* Was ein Tick anfassen darf (§11). Alles andere ist abgeleitet und
     wird im Build gerechnet - ein Leadership Score, der sich im Sekunden-
     takt aendert, waere kein Score, sondern ein Flackern. */
  var REALTIME_FIELDS = ["price", "changePercent", "new52WeekHigh", "intradayBreakout"];
  var DERIVED_FIELDS = ["leadershipScore", "momentumScore", "relativeStrengthScore",
                        "breakoutScore", "trendAlignment", "percentiles",
                        "movingAverages", "relativeStrength"];

  var MODES = ["live", "delayed", "eod", "unavailable"];

  /**
   * Der Zustand der Live-Schicht - ohne eine einzige Netzwerkverbindung.
   *
   * @param {object} input
   *   gates            {ENABLE_LIVE_MARKET_DATA, ENABLE_PUBLIC_LIVE_MARKET_DATA, ...}
   *   audience         "public" | "development_preview" | "internal"
   *   policyCheck      Ergebnis von VUDisplayPolicy.check (optional)
   *   quoteSource      null oder {kind, connected, lastTickAt}
   *   asOf             Datum des ausgelieferten Standes (EOD)
   *   now              Zeitpunkt der Beurteilung
   *   calendar         Handelskalender (quant/config/market-calendar.json)
   * @returns {object} {mode, label, live, session, reason, message, asOf}
   */
  function assess(input) {
    input = input || {};
    var now = input.now ? new Date(input.now) : new Date();
    var session = MarketHours
      ? MarketHours.sessionAt(now, { calendar: input.calendar, exchange: input.exchange || "XNYS" })
      : { phase: "CLOSED", isOpen: false, calendarCoverage: false };

    var gates = input.gates || {};
    var audience = input.audience || "public";
    var gateName = audience === "public" ? "ENABLE_PUBLIC_LIVE_MARKET_DATA" : "ENABLE_LIVE_MARKET_DATA";
    var out = {
      engineVersion: ENGINE_VERSION,
      mode: "eod", live: false, session: session.phase,
      sessionLabel: sessionLabel(session), isTradingDay: session.isTradingDay !== false,
      calendarCoverage: session.calendarCoverage !== false,
      asOf: input.asOf || null, reason: null, message: null,
      realtimeFields: REALTIME_FIELDS, derivedFields: DERIVED_FIELDS
    };

    if (gates[gateName] !== true) {
      out.mode = "eod";
      out.reason = "gateDisabled";
      out.message = gateName + " ist nicht gesetzt. Discover zeigt den letzten ausgelieferten " +
                    "Stand und kennzeichnet ihn als solchen.";
      return out;
    }
    if (input.policyCheck && input.policyCheck.allowed !== true) {
      out.mode = "eod";
      out.reason = input.policyCheck.reason || "notLicensed";
      out.message = input.policyCheck.message ||
                    "Fuer Echtzeitkurse liegt keine Anzeigeerlaubnis vor.";
      return out;
    }
    if (!input.quoteSource || input.quoteSource.connected !== true) {
      out.mode = "unavailable";
      out.reason = "noQuoteSource";
      out.message = "Es ist keine Kursquelle verbunden.";
      return out;
    }
    if (!session.isOpen) {
      out.mode = "eod";
      out.reason = session.phase === "PRE" || session.phase === "AFTER"
        ? "extendedSession" : "marketClosed";
      out.message = session.phase === "CLOSED"
        ? "Die Boerse ist geschlossen. Angezeigt wird der letzte Schlusskurs."
        : "Ausserhalb der regulaeren Sitzung. Angezeigt wird der letzte bestaetigte Stand.";
      return out;
    }

    var age = input.quoteSource.lastTickAt
      ? now.getTime() - new Date(input.quoteSource.lastTickAt).getTime() : null;
    var maxAge = input.maxTickAgeMs || 60000;
    if (age === null || age > maxAge) {
      out.mode = "delayed";
      out.reason = "staleTick";
      out.message = "Der letzte Tick ist zu alt fuer eine Live-Kennzeichnung.";
      return out;
    }
    out.mode = "live";
    out.live = true;
    return out;
  }

  function sessionLabel(session) {
    switch (session.phase) {
      case "REGULAR": return "MARKET OPEN";
      case "PRE": return "PRE-MARKET";
      case "AFTER": return "AFTER HOURS";
      default: return "MARKET CLOSED";
    }
  }

  /**
   * Wendet einen Tick auf einen Discover-Datensatz an - und zwar nur auf
   * die Felder aus REALTIME_FIELDS.
   *
   * Der Rueckgabewert ist ein NEUER Datensatz; die abgeleiteten Felder
   * werden unveraendert uebernommen und ausdruecklich nicht nachgerechnet.
   *
   * @param {object} card   Discover-Card (Contract)
   * @param {object} tick   {price, previousClose, at}
   * @param {object} [ctx]  {previous52WeekHigh, previous52WeekLow, now, maxQuoteAgeMs}
   */
  function applyTick(card, tick, ctx) {
    ctx = ctx || {};
    if (!card || !tick || typeof tick.price !== "number" || !Number.isFinite(tick.price)) return card;
    var next = Object.assign({}, card);
    next.price = { value: tick.price, status: "CALCULATED" };
    next.metrics = Object.assign({}, card.metrics);
    next.metricStatus = Object.assign({}, card.metricStatus);
    next.signals = Object.assign({}, card.signals);

    if (typeof tick.previousClose === "number" && tick.previousClose > 0) {
      next.changePercent = { value: (tick.price / tick.previousClose - 1) * 100, status: "CALCULATED" };
    }

    var reference = ctx.previous52WeekHigh;
    if (High52w && typeof reference === "number") {
      var verdict = High52w.evaluate({
        previous52WeekHigh: reference,
        previous52WeekLow: ctx.previous52WeekLow,
        currentPrice: tick.price, quoteAt: tick.at, now: ctx.now,
        priceSeriesType: ctx.priceSeriesType,
        referencePriceSeriesType: ctx.referencePriceSeriesType
      }, { maxQuoteAgeMs: ctx.maxQuoteAgeMs });
      if (verdict.state !== "unknown" && verdict.state !== "stale") {
        next.signals.new52WeekHigh = verdict.isNew52WeekHigh;
        next.signals.nearHigh = verdict.state === "nearHigh" || verdict.state === "watch";
        next.metrics.distanceTo52wHigh = verdict.distanceTo52WeekHigh;
        next.metricStatus.distanceTo52wHigh = "CALCULATED";
      }
      next.realtime = { state: verdict.state, reason: verdict.reason, at: tick.at || null };
    } else {
      /* Ohne Referenzniveau bleibt das Signal, wie es war. Es aus einem
         Kurs allein zu setzen hiesse, das Hoch zu raten. */
      next.realtime = { state: "referenceUnavailable", reason: "referenceLevelWithheld", at: tick.at || null };
    }
    return next;
  }

  /**
   * Erzeugt die Live-Schicht. `quoteFn` wird nur aufgerufen, wenn assess()
   * live oder delayed meldet - ohne Erlaubnis entsteht kein einziger
   * Abruf, nicht einmal ein fehlschlagender.
   */
  function createRealtimeSource(options) {
    options = options || {};
    var subscribers = [];
    var timer = null;
    var state = assess(options);

    function notify() {
      subscribers.forEach(function (fn) { try { fn(state); } catch (err) { /* ein Abonnent darf die anderen nicht mitreissen */ } });
    }

    return {
      state: function () { return state; },
      refresh: function (now) {
        state = assess(Object.assign({}, options, { now: now || new Date() }));
        notify();
        return state;
      },
      subscribe: function (fn) {
        subscribers.push(fn);
        fn(state);
        return function () {
          var i = subscribers.indexOf(fn);
          if (i !== -1) subscribers.splice(i, 1);
        };
      },
      start: function (intervalMs) {
        if (timer || !options.quoteFn) return false;
        if (state.mode !== "live" && state.mode !== "delayed") return false;
        timer = setInterval(function () { options.quoteFn(); }, intervalMs || 15000);
        return true;
      },
      stop: function () { if (timer) { clearInterval(timer); timer = null; } },
      applyTick: applyTick
    };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, MODES: MODES,
    REALTIME_FIELDS: REALTIME_FIELDS, DERIVED_FIELDS: DERIVED_FIELDS,
    assess: assess, applyTick: applyTick, sessionLabel: sessionLabel,
    createRealtimeSource: createRealtimeSource
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.RealtimeSource = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
