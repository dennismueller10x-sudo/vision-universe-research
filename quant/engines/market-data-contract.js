/* =========================================================================
   VISION UNIVERSE — market-data-contract.js

   DER GEMEINSAME ZUSTANDSWORTSCHATZ DER MARKTDATEN-INFRASTRUKTUR.

   Historical, Intraday und Realtime sind eine Infrastruktur fuer ALLE
   kuenftigen Frontends. Damit sie eine bleiben, muss die Antwort auf
   "was ist hier gerade los?" ueberall dieselbe sein. Diese Datei ist
   diese Antwort - und der Grund, warum kein Frontend sie noch einmal
   erfinden muss.

   ZEHN ZUSTAENDE, DREI ACHSEN

     Berechtigung   NOT_ELIGIBLE · SYMBOL_NOT_SUPPORTED
     Daten          HISTORICAL_* · INTRADAY_* · REALTIME_*
     Anbieter       PROVIDER_UNAVAILABLE

   Sie sind KEINE Rangfolge. Ein Titel kann zugleich
   HISTORICAL_AVAILABLE und REALTIME_UNAVAILABLE sein; das ist der
   Normalfall ausserhalb der Handelszeiten.

   ZWEI UNTERSCHEIDUNGEN, DIE DIESE DATEI ERZWINGT

   1. MARKET_CLOSED ist NICHT REALTIME_UNAVAILABLE.

      Nachts kommen keine Kurse, und das ist kein Fehler. Wer beides
      zusammenzieht, schreibt dem Nutzer um 22 Uhr "Echtzeit nicht
      verfuegbar" - und laesst ihn morgen frueh, wenn der Relay
      wirklich ausgefallen ist, denselben Satz lesen. Eine Meldung, die
      den Normalfall und den Fehlerfall nicht trennt, sagt nichts.

      REALTIME_UNAVAILABLE heisst: der Weg ist gestoert, obwohl Handel
      laeuft. MARKET_CLOSED heisst: der Weg ist in Ordnung, es wird
      gerade nicht gehandelt.

   2. TECHNICAL_INSUFFICIENT_HISTORY ist NICHT HISTORICAL_UNAVAILABLE.

      Ein Listing von 2026 hat 57 Handelstage. Der Chart zeichnet sie
      (ab zwei Bars), die Technik rechnet nicht (ab 300). Beides ist
      wahr. Wer daraus "keine Historie" macht, verschweigt dem Nutzer
      genau die Daten, die dastehen.

      Deshalb ist die Technikeignung KEIN Zustand dieser Liste, sondern
      eine eigene Achse - abfragbar, aber nie als Datenzustand
      verkleidet.

   WAS HIER NICHT STEHT

   Keine Kurse, keine Schwellen fuer Anlageaussagen, keine Anbieter-
   logik. Diese Datei ordnet ein; sie misst nicht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "market-data-contract-1.0.1";

  /* Die zehn Zustaende des Vertrages. Geschlossen: was hier nicht
     steht, ist kein Zustand, sondern ein Tippfehler. */
  var STATES = [
    "MARKET_CLOSED",
    "REALTIME_AVAILABLE",
    "REALTIME_UNAVAILABLE",
    "INTRADAY_AVAILABLE",
    "INTRADAY_UNAVAILABLE",
    "HISTORICAL_AVAILABLE",
    "HISTORICAL_UNAVAILABLE",
    "SYMBOL_NOT_SUPPORTED",
    "NOT_ELIGIBLE",
    "PROVIDER_UNAVAILABLE"
  ];

  /* Die Technikeignung steht bewusst DANEBEN und nicht darin. */
  var TECHNICAL_STATES = ["TECHNICAL_SUFFICIENT_HISTORY", "TECHNICAL_INSUFFICIENT_HISTORY"];

  function validCount(n) { return Number.isSafeInteger(n) && n >= 0; }
  function validMinimum(n) { return Number.isSafeInteger(n) && n > 0; }

  function istZustand(s) { return STATES.indexOf(s) >= 0; }

  function ergebnis(state, reason, extra) {
    var o = { state: state, reason: reason || null };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    return o;
  }

  /* ------------------------------------------------------- HISTORICAL

     @param input
       eligible      false -> NOT_ELIGIBLE (Produktentscheidung)
       known         false -> SYMBOL_NOT_SUPPORTED (kein solcher Titel)
       storeReachable false -> PROVIDER_UNAVAILABLE (der Speicher, nicht der Titel)
       barCount      Anzahl gespeicherter Kerzen
       minBars       Mindestzahl fuer eine Zeichnung (chart-ranges: 2)
   */
  function resolveHistorical(input) {
    input = input || {};
    var minBars = input.minBars === undefined ? 2 : input.minBars;
    if (input.known === false) {
      return ergebnis("SYMBOL_NOT_SUPPORTED",
        "Dieser Ticker gehoert nicht zum gefuehrten Universum.");
    }
    if (input.eligible === false) {
      return ergebnis("NOT_ELIGIBLE",
        "Belegte Nicht-Aktie. Sie bleibt erreichbar, nimmt aber an " +
        "Produktlisten nicht teil.");
    }
    /* Der Speicher ist nicht erreichbar - das ist eine Aussage ueber den
       Weg, nicht ueber den Titel. Sie darf nie als "keine Historie"
       erscheinen: morgen ist der Weg wieder da, und die Historie war die
       ganze Zeit vorhanden. */
    if (input.storeReachable === false) {
      return ergebnis("PROVIDER_UNAVAILABLE",
        "Der Historienspeicher hat nicht geantwortet. Ueber die Reihe " +
        "dieses Titels sagt das nichts.");
    }
    var n = input.barCount === undefined ? 0 : input.barCount;
    if (!validCount(n) || !validMinimum(minBars)) return ergebnis("HISTORICAL_UNAVAILABLE",
      "Die Anzahl der Kerzen oder die Mindesthistorie ist nicht pruefbar.", { barCount: null, inputValid: false });
    if (n >= minBars) {
      return ergebnis("HISTORICAL_AVAILABLE", null, { barCount: n });
    }
    return ergebnis("HISTORICAL_UNAVAILABLE",
      n ? "Im Speicher liegen nur " + n + " Kerzen; gezeichnet wird ab " + minBars + "."
        : "Fuer diesen Titel liegt im Speicher keine Reihe.",
      { barCount: n });
  }

  /* --------------------------------------------------------- INTRADAY

       providerReachable false -> PROVIDER_UNAVAILABLE
       barCount          gelieferte Intraday-Bars
       session           Ergebnis von marketSession() - fuer die
                         BEGRUENDUNG, nicht fuer den Zustand
   */
  function resolveIntraday(input) {
    input = input || {};
    if (input.known === false) return ergebnis("SYMBOL_NOT_SUPPORTED", null);
    if (input.eligible === false) return ergebnis("NOT_ELIGIBLE", null);
    if (input.providerReachable === false) {
      return ergebnis("PROVIDER_UNAVAILABLE",
        "Der Anbieter hat nicht geantwortet oder den Abruf abgelehnt.");
    }
    var n = input.barCount === undefined ? 0 : input.barCount;
    if (!validCount(n)) return ergebnis("INTRADAY_UNAVAILABLE",
      "Die Anzahl der Intraday-Kerzen ist nicht pruefbar.", { barCount: null, inputValid: false });
    if (n > 0) return ergebnis("INTRADAY_AVAILABLE", null, { barCount: n });

    /* Keine Bars. Der GRUND unterscheidet sich, der Zustand nicht: es
       gibt keinen Tagesverlauf zu zeigen. Die Boersenlage steht daneben,
       damit die Oberflaeche den Normalfall nicht wie einen Ausfall
       beschriftet. */
    var geschlossen = input.session && input.session.state === "MARKET_CLOSED";
    return ergebnis("INTRADAY_UNAVAILABLE",
      geschlossen
        ? "Ausserhalb der Handelszeiten liefert der Anbieter keine Bars. Das ist der Normalfall."
        : "Der Anbieter hat fuer diesen Zeitraum keine Bars geliefert.",
      { marketClosed: !!geschlossen, barCount: 0 });
  }

  /* --------------------------------------------------------- REALTIME

     HIER LIEGT DIE ERSTE DER BEIDEN UNTERSCHEIDUNGEN.

       tradingOpen  laeuft gerade Handel? (aus marketSession)
       connection   "CONNECTED" | "CLOSED" | "ERROR" | "NOT_CONFIGURED" | ...
       updates      Zahl empfangener Kursereignisse
   */
  function resolveRealtime(input) {
    input = input || {};
    if (input.known === false) return ergebnis("SYMBOL_NOT_SUPPORTED", null);
    if (input.eligible === false) return ergebnis("NOT_ELIGIBLE", null);

    var verbunden = input.connection === "CONNECTED" || input.connection === "SUBSCRIBED";

    /* Kein Handel: der Zustand ist MARKET_CLOSED - unabhaengig davon,
       ob die Verbindung steht. Ein geschlossener Markt ist kein
       Ausfall, und ein Relay, das nachts schweigt, arbeitet richtig. */
    if (input.tradingOpen === false) {
      return ergebnis("MARKET_CLOSED",
        "Es wird gerade nicht gehandelt. Der Weg ist davon unberuehrt.",
        { connection: input.connection || null });
    }

    if (input.connection === "NOT_CONFIGURED") {
      return ergebnis("PROVIDER_UNAVAILABLE",
        "Der Zugang zum Anbieter ist in dieser Umgebung nicht eingerichtet.");
    }
    if (input.tradingOpen !== true) return ergebnis("REALTIME_UNAVAILABLE",
      "Die Handelsphase ist nicht bestaetigt.", { connection: input.connection || null, isLive: false });
    if (verbunden) {
      return ergebnis("REALTIME_AVAILABLE", null,
        { updates: validCount(input.updates) ? input.updates : null,
          availabilityScope: "TRANSPORT_ONLY", isLive: false, priceTypeConfirmed: false });
    }
    /* Handel laeuft, Verbindung steht nicht: JETZT ist es ein Ausfall. */
    return ergebnis("REALTIME_UNAVAILABLE",
      "Waehrend der Handelszeit kommt keine Verbindung zustande.",
      { connection: input.connection || null });
  }

  /* -------------------------------------------------- TECHNIK-ACHSE

     DIE ZWEITE UNTERSCHEIDUNG. Kein Datenzustand - eine eigene Frage.
   */
  function technicalHistory(barCount, minBars) {
    var n = barCount === undefined ? 0 : barCount;
    var min = minBars === undefined ? 300 : minBars;
    if (!validCount(n) || !validMinimum(min)) return {
      state: "TECHNICAL_INSUFFICIENT_HISTORY", barCount: null, minBars: validMinimum(min) ? min : null,
      inputValid: false, reason: "Die Historienlaenge ist nicht pruefbar; keine Technikeignung bestaetigt."
    };
    return {
      state: n >= min ? "TECHNICAL_SUFFICIENT_HISTORY" : "TECHNICAL_INSUFFICIENT_HISTORY",
      barCount: n, minBars: min,
      /* Der Satz, den die Oberflaeche NICHT selbst formulieren soll. */
      reason: n >= min ? null
        : "Fuer die technische Auswertung reichen " + n + " Kerzen nicht (noetig: " + min +
          "). Das ist KEINE Aussage ueber die Verfuegbarkeit der Historie - " +
          "der Chart zeichnet sie."
    };
  }

  /* -------------------------------------------------- BOERSENLAGE

     Duenne Huelle um realtime/market-hours.js. Sie existiert, damit ein
     Aufrufer die Handelsfrage stellen kann, ohne zwei Engines zu
     kennen - und damit es genau EINE Stelle gibt, die aus einer Phase
     einen Vertragszustand macht. */
  function marketSession(marketHours, at, opts) {
    if (!marketHours || typeof marketHours.sessionAt !== "function") {
      return { state: null, phase: null, tradingOpen: null,
               reason: "Kein Handelskalender zur Hand - die Lage ist unbekannt." };
    }
    var unknown = { state: null, phase: null, tradingOpen: null, calendarCoverage: false,
      reason: "Die Handelsphase ist nicht durch einen gueltigen Kalender bestaetigt." };
    var instant = at === undefined ? new Date() : at;
    var s;
    try {
      if (instant === null || !Number.isFinite(new Date(instant).getTime())) return unknown;
      s = marketHours.sessionAt(instant, opts || {});
    } catch (_) { return unknown; }
    if (!s || s.calendarCoverage !== true || ["REGULAR", "PRE", "AFTER", "CLOSED"].indexOf(s.phase) < 0) return unknown;
    var phase = s && s.phase ? s.phase : null;
    var offen = phase === "REGULAR" || phase === "PRE" || phase === "AFTER";
    return {
      state: offen ? null : "MARKET_CLOSED",
      phase: phase,
      tradingOpen: offen,
      calendarCoverage: s && s.calendarCoverage !== undefined ? s.calendarCoverage : null,
      reason: offen ? null : "Ausserhalb der Handelszeiten."
    };
  }

  /* ------------------------------------------------ ALLES AUF EINMAL

     Die Form, die ein Frontend anzeigt: drei Datenachsen, die
     Technikachse daneben, und die Boersenlage als Begruendung. */
  function describe(input) {
    input = input || {};
    var session = input.session || { tradingOpen: null, phase: null, state: null };
    return {
      version: VERSION,
      symbol: input.symbol || null,
      session: session,
      historical: resolveHistorical(input.historical || {}),
      intraday: resolveIntraday(Object.assign({ session: session }, input.intraday || {})),
      realtime: resolveRealtime(Object.assign({ tradingOpen: session.tradingOpen },
                                              input.realtime || {})),
      technical: technicalHistory(
        input.historical ? input.historical.barCount : undefined,
        input.technicalMinBars)
    };
  }

  var api = {
    VERSION: VERSION,
    STATES: STATES,
    TECHNICAL_STATES: TECHNICAL_STATES,
    istZustand: istZustand,
    isState: istZustand,
    resolveHistorical: resolveHistorical,
    resolveIntraday: resolveIntraday,
    resolveRealtime: resolveRealtime,
    technicalHistory: technicalHistory,
    marketSession: marketSession,
    describe: describe
  };

  if (isNode) module.exports = api;
  else global.VUMarketDataContract = api;
})(typeof window !== "undefined" ? window : globalThis);
