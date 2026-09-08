/* =========================================================================
   VISION UNIVERSE QUANT — capabilities.js
   PROVIDER CAPABILITY MATRIX (Phase 2, §5)

   Das Produkt darf niemals davon ausgehen, dass ein Provider alles kann.

   Ein Free Plan liefert oft keine Intraday-Daten, kein WebSocket, keine
   Corporate Actions und nur ein begrenztes Symboluniversum. Ohne
   deklarierte Faehigkeiten fuehrt das zu genau dem Fehler, den dieses
   System vermeiden soll: eine fehlende Faehigkeit sieht aus wie ein
   fehlender Wert, und ein fehlender Wert sieht aus wie eine Aussage.

   Deshalb deklariert jeder Adapter, was er kann. Was er nicht kann, wird
   als `providerCapabilityMissing` gemeldet — nicht als leeres Ergebnis und
   erst recht nicht durch stillen Rueckfall auf Mock-Daten.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Alle bekannten Faehigkeiten je Datenklasse. Ein Adapter setzt sie auf
     true/false — `null` bedeutet ausdruecklich "ungeprueft", nicht "nein". */
  var MARKET_DATA_CAPABILITIES = [
    "realtime",            // Kurse ohne Verzoegerung
    "delayed",             // verzoegerte Kurse (typisch 15 Minuten)
    "daily",               // aktueller Tagesschluss
    "intraday",            // Intraday-Bars
    "websocket",           // Push-Verbindung
    "historicalDaily",     // Tageshistorie
    "historicalIntraday",  // Intraday-Historie
    "splits",              // Split-Ereignisse
    "dividends",           // Dividendenereignisse
    "adjustedPrices",      // total-return-adjustiert (Splits UND Dividenden)
    "splitAdjustedPrices", // nur splitbereinigt - reicht fuer Charts, nicht fuer Total Return
    "symbolSearch",        // Symbolsuche
    "marketStatus",        // Boersenstatus
    "bulkQuotes"           // mehrere Symbole je Anfrage
  ];

  var FUNDAMENTAL_CAPABILITIES = [
    "annual", "quarterly", "asReported", "standardized",
    "pointInTime",         // availableAt je Kennzahl
    "restatements",        // Original und Korrektur getrennt
    "filingDates",         // filedAt verfuegbar
    "delistedSecurities",  // historischer Security Master
    "historicalUniverse"
  ];

  var REFERENCE_CAPABILITIES = ["securityMaster", "exchanges", "isin", "figi", "delisted", "historicalMembership"];
  var ESTIMATE_CAPABILITIES = ["consensus", "historicalConsensus", "pointInTime", "revisionHistory"];

  var CAPABILITY_SETS = {
    market: MARKET_DATA_CAPABILITIES,
    fundamental: FUNDAMENTAL_CAPABILITIES,
    reference: REFERENCE_CAPABILITIES,
    estimate: ESTIMATE_CAPABILITIES
  };

  /**
   * Erzeugt eine vollstaendige Capability-Deklaration. Nicht genannte
   * Faehigkeiten sind `null` (= ungeprueft), nicht `false`. Der Unterschied
   * ist wichtig: "wir wissen es nicht" ist keine Zusage und kein Ausschluss.
   */
  function declare(providerId, spec) {
    spec = spec || {};
    var out = {
      providerId: providerId,
      plan: spec.plan || "unknown",
      declaredAt: spec.declaredAt || null,
      verifiedAt: spec.verifiedAt || null,
      notes: spec.notes || {},
      limits: spec.limits || {},
      /* Woher eine Faehigkeit ihren Wert hat. Leer, solange niemand
         nachgesehen hat. Der Eintrag je Faehigkeit ist ein Objekt mit
         mindestens `verificationLevel` - er beantwortet die Frage, die auf
         eine Zusage folgt: woher wisst ihr das? */
      evidence: spec.evidence || {},
      sets: {}
    };
    Object.keys(CAPABILITY_SETS).forEach(function (setName) {
      var declared = spec[setName] || {};
      var set = {};
      CAPABILITY_SETS[setName].forEach(function (cap) {
        /* Drei Zustaende, und sie muessen alle drei ueberleben:
             true  = zugesichert vorhanden
             false = ausdruecklich nicht vorhanden
             null  = ungeprueft
           Ein ausdrueckliches null darf NICHT zu false werden. "Wir haben es
           nicht geprueft" als "der Anbieter kann das nicht" auszugeben waere
           genau die Sorte stiller Behauptung, die diese Datei verhindern soll.
           Alles andere (Zahlen, Strings, Objekte) ist eine Fehleingabe und
           wird als ungeprueft behandelt statt stillschweigend zu false. */
        var value = declared[cap];
        set[cap] = value === true ? true : (value === false ? false : null);
      });
      out.sets[setName] = set;
    });
    return out;
  }

  function supports(capabilities, setName, capability) {
    if (!capabilities || !capabilities.sets || !capabilities.sets[setName]) return false;
    return capabilities.sets[setName][capability] === true;
  }

  /** Ausdruecklich als nicht verfuegbar deklariert (im Unterschied zu ungeprueft). */
  function explicitlyMissing(capabilities, setName, capability) {
    if (!capabilities || !capabilities.sets || !capabilities.sets[setName]) return false;
    return capabilities.sets[setName][capability] === false;
  }

  /**
   * Standardisierte Antwort, wenn eine Faehigkeit fehlt. Bewusst eine
   * eigene Fehlerform neben `dataUnavailable`: "der Provider kann das
   * grundsaetzlich nicht" ist etwas anderes als "der Wert fehlt gerade".
   * Die UI formuliert beides unterschiedlich, und nur das erste laesst sich
   * durch einen Plan- oder Anbieterwechsel loesen.
   */
  function capabilityMissing(providerId, setName, capability, hint) {
    return {
      available: false,
      data: null,
      reason: "providerCapabilityMissing",
      capability: setName + "." + capability,
      provider: providerId,
      message: "Der Provider " + providerId + " stellt '" + capability + "' (" + setName + ") nicht bereit." +
               (hint ? " " + hint : "")
    };
  }

  /** Vergleichsmatrix mehrerer Provider — speist die Doku und die Dev-Ansicht. */
  function matrix(declarations, setName) {
    var caps = CAPABILITY_SETS[setName] || [];
    return caps.map(function (cap) {
      var row = { capability: cap };
      declarations.forEach(function (d) {
        row[d.providerId] = d.sets[setName] ? d.sets[setName][cap] : null;
      });
      return row;
    });
  }

  var api = {
    CAPABILITY_SETS: CAPABILITY_SETS,
    MARKET_DATA_CAPABILITIES: MARKET_DATA_CAPABILITIES,
    FUNDAMENTAL_CAPABILITIES: FUNDAMENTAL_CAPABILITIES,
    REFERENCE_CAPABILITIES: REFERENCE_CAPABILITIES,
    ESTIMATE_CAPABILITIES: ESTIMATE_CAPABILITIES,
    declare: declare,
    supports: supports,
    explicitlyMissing: explicitlyMissing,
    capabilityMissing: capabilityMissing,
    matrix: matrix
  };

  if (isNode) module.exports = api;
  else global.VUCapabilities = api;
})(typeof window !== "undefined" ? window : globalThis);
