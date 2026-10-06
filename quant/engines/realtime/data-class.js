/* =========================================================================
   VISION UNIVERSE — realtime/data-class.js

   Welche Datenklasse liegt vor, und was wissen wir ueber sie?

   Zwei Begriffe, die sonst durcheinandergehen:

     DATENKLASSE   Was fuer Daten sind das? Ein Stream, eine Kursabfrage,
                   eine Intraday-Bar, ein Tagesschluss.
     ZUSTAND       Was wissen wir ueber die Verfuegbarkeit dieser Klasse?
                   Vorhanden, nicht vorhanden, ungeprueft, gesperrt.

   Die Trennung ist der Kern dieses Workstreams. Phase 2 hat die
   Faehigkeitsmatrix mit drei Zustaenden eingefuehrt (true/false/null), und
   das war richtig - aber sie beantwortet nur die Anbieterfrage. Fuer einen
   Live-Chart fehlen zwei weitere Gruende, aus denen eine Klasse nicht
   benutzt werden darf: der Tarif gibt sie nicht her, und die Lizenz
   erlaubt die Anzeige nicht. Beides ist etwas anderes als "der Anbieter
   kann das nicht", und beides muss sichtbar bleiben.

   DIE REGEL, DIE DIESE DATEI DURCHSETZT:

     UNKNOWN wird niemals zu AVAILABLE.

   Eine ungeprueft Faehigkeit ist keine Faehigkeit. Sie darf einen
   Pruefpfad ausloesen, aber nie eine Anzeige. Wer "LIVE" schreibt, weil
   die Doku des Anbieters Realtime nennt, hat den Nutzer belogen, und der
   Kurs, den er dabei zeigt, ist womoeglich zwanzig Minuten alt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Die Leiter, absteigend. Index 0 ist die beste Klasse. UNAVAILABLE
     steht bewusst mit drin: "nichts verfuegbar" ist ein Ergebnis der
     Auswahl, kein Ausfall der Auswahl. */
  var DATA_CLASSES = [
    "REALTIME_STREAM",   // Push-Verbindung, Tick fuer Tick
    "REALTIME_QUOTE",    // Kursabfrage ohne Verzoegerung, wiederholt geholt
    "INTRADAY",          // Intraday-Bars, typisch 1-5 Minuten
    "EOD",               // Tagesschlusskurse
    "UNAVAILABLE"        // kein belastbarer Datenstand
  ];

  var TERMINAL_CLASS = "UNAVAILABLE";

  /* Zustaende einer Klasse. Sechs, weil fuenf davon verschiedene
     Handlungen nach sich ziehen und der sechste (ERROR) verhindert, dass
     ein voruebergehender Ausfall als dauerhafte Absage in die Matrix
     wandert. */
  var CAPABILITY_STATES = [
    "AVAILABLE",           // an echten Daten belegt
    "UNAVAILABLE",         // ausdruecklich nicht vorhanden
    "UNKNOWN",             // niemand hat nachgesehen
    "BLOCKED_BY_PLAN",     // technisch da, im Tarif/Gate nicht freigegeben
    "BLOCKED_BY_LICENSE",  // technisch da, Anzeige nicht erlaubt
    "ERROR"                // Pruefung selbst ist gescheitert
  ];

  /* Nur dieser eine Zustand erlaubt eine Anzeige. Die Aufzaehlung steht
     hier als Liste und nicht als Vergleich im Code, damit ein spaeterer
     Zusatzzustand nicht stillschweigend nutzbar wird. */
  var USABLE_STATES = ["AVAILABLE"];

  /* Welche Anbieterfaehigkeit traegt welche Datenklasse. Die Namen sind
     die aus capabilities.js - diese Datei erfindet keine zweite
     Faehigkeitswelt. */
  var CLASS_CAPABILITY = {
    REALTIME_STREAM: { set: "market", capability: "websocket" },
    REALTIME_QUOTE:  { set: "market", capability: "realtime" },
    INTRADAY:        { set: "market", capability: "intraday" },
    EOD:             { set: "market", capability: "historicalDaily" }
  };

  /* Welche Lizenz-Datenklasse (display-policy.js) gehoert zu welcher
     Datenklasse. Realtime und Intraday sind lizenzrechtlich nicht
     dasselbe wie ein Tagesschluss, und die Richtlinie kennt sie getrennt. */
  var CLASS_LICENSE_CLASS = {
    REALTIME_STREAM: "realtime",
    REALTIME_QUOTE:  "realtime",
    INTRADAY:        "intraday",
    EOD:             "marketData"
  };

  /* Welches Gate deckt welche Klasse ab. EOD steht unter keinem Gate: ein
     Tagesschluss ist der Normalbetrieb dieser Anwendung, kein Live-Feature. */
  var CLASS_GATE = {
    REALTIME_STREAM: "ENABLE_LIVE_MARKET_DATA",
    REALTIME_QUOTE:  "ENABLE_LIVE_MARKET_DATA",
    INTRADAY:        "ENABLE_LIVE_MARKET_DATA",
    EOD:             null
  };

  function isDataClass(c) { return DATA_CLASSES.indexOf(c) !== -1; }
  function isState(s) { return CAPABILITY_STATES.indexOf(s) !== -1; }

  /** Position auf der Leiter. Unbekannte Klassen landen ganz unten. */
  function rank(dataClass) {
    var i = DATA_CLASSES.indexOf(dataClass);
    return i === -1 ? DATA_CLASSES.length : i;
  }

  /** Ist a besser als b? "Besser" heisst: weiter oben auf der Leiter. */
  function isBetter(a, b) { return rank(a) < rank(b); }

  /** Die bessere der beiden Klassen. */
  function best(a, b) { return isBetter(a, b) ? a : b; }

  /** Ist diese Klasse eine Echtzeitklasse? Entscheidet ueber "LIVE". */
  function isRealtimeClass(c) {
    return c === "REALTIME_STREAM" || c === "REALTIME_QUOTE";
  }

  /**
   * Uebersetzt den Dreizustand aus capabilities.js in einen
   * Faehigkeitszustand.
   *
   * `null` wird UNKNOWN, nicht UNAVAILABLE. Der Unterschied ist der
   * ganze Sinn der Uebung: aus UNAVAILABLE folgt "such dir einen anderen
   * Anbieter", aus UNKNOWN folgt "sieh nach".
   */
  function fromTriState(value) {
    if (value === true) return "AVAILABLE";
    if (value === false) return "UNAVAILABLE";
    return "UNKNOWN";
  }

  /** Darf mit diesem Zustand angezeigt werden? */
  function usable(state) { return USABLE_STATES.indexOf(state) !== -1; }

  /**
   * Ein Befund je Datenklasse. Traegt immer einen Grund - ein Zustand
   * ohne Grund ist in einem Fehlerbericht wertlos.
   */
  function finding(dataClass, state, reason, extra) {
    var out = {
      dataClass: dataClass,
      state: isState(state) ? state : "ERROR",
      reason: reason || null,
      capability: CLASS_CAPABILITY[dataClass]
        ? CLASS_CAPABILITY[dataClass].set + "." + CLASS_CAPABILITY[dataClass].capability
        : null,
      usable: false
    };
    out.usable = usable(out.state);
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  var api = {
    DATA_CLASSES: DATA_CLASSES,
    TERMINAL_CLASS: TERMINAL_CLASS,
    CAPABILITY_STATES: CAPABILITY_STATES,
    USABLE_STATES: USABLE_STATES,
    CLASS_CAPABILITY: CLASS_CAPABILITY,
    CLASS_LICENSE_CLASS: CLASS_LICENSE_CLASS,
    CLASS_GATE: CLASS_GATE,
    isDataClass: isDataClass,
    isState: isState,
    rank: rank,
    isBetter: isBetter,
    best: best,
    isRealtimeClass: isRealtimeClass,
    fromTriState: fromTriState,
    usable: usable,
    finding: finding
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.DataClass = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
