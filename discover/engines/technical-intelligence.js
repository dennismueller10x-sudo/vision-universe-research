/* =========================================================================
   VISION UNIVERSE DISCOVER — technical-intelligence.js

   Die Erweiterungsschnittstelle fuer den Technical Intelligence Layer
   (§7 des Auftrags), insbesondere Elliott Wave.

   DIE REGEL, UM DIE ES HIER GEHT

   Elliott Wave wird NICHT als einfache technische Kennzahl behandelt und
   erst recht nicht erfunden. Dieses Modul erzeugt keine einzige
   Wellenzaehlung. Es liest ausschliesslich, was die bestehende
   Elliott-Engine (quant/engines/technical/elliott, Beta) in ihren
   vorberechneten Bundles hinterlegt hat, und uebersetzt deren Befund in
   vier Zustaende, die eine Oberflaeche darstellen kann:

     unavailable    keine Zaehlung - und der Grund dafuer
     calculating    die Engine ist zustaendig, das Ergebnis liegt noch nicht vor
     available      eine Zaehlung mit ausreichender Methodengeguete
     lowConfidence  eine Zaehlung, die als schwach gekennzeichnet ist

   `calculating` ist bewusst Teil des Vertrags, obwohl heute nichts
   asynchron rechnet: der Zustand ist der Platz, an dem eine spaetere
   Laufzeit-Engine andockt, ohne dass die Oberflaeche neu entworfen werden
   muss. Er wird nur gesetzt, wenn ein Aufrufer ausdruecklich einen Lauf
   angemeldet hat - nie geraten.

   Die bestehende Engine wird gelesen, nicht veraendert. Ihre Confidence
   ist ein Method Fit und keine Wahrscheinlichkeit; dieses Modul reicht
   diesen Unterschied unveraendert weiter, statt daraus eine Prozentzahl
   zu machen, die nach Trefferquote aussieht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "discover-ti-1.0.0";

  var STATUS = { UNAVAILABLE: "unavailable", CALCULATING: "calculating",
                 AVAILABLE: "available", LOW_CONFIDENCE: "lowConfidence" };

  /* Wie die Zustaende der bestehenden Engine auf die vier Produktzustaende
     fallen. Alles, was hier nicht steht, ist `unavailable` - ein
     unbekannter Zustand darf nie als Ergebnis durchgehen. */
  var FROM_ENGINE = {
    OK: STATUS.AVAILABLE,
    PROJECTABLE: STATUS.AVAILABLE,
    LOW_CONFIDENCE: STATUS.LOW_CONFIDENCE,
    AMBIGUOUS: STATUS.UNAVAILABLE,
    ABORTED: STATUS.UNAVAILABLE,
    INSUFFICIENT_DATA: STATUS.UNAVAILABLE,
    UNAVAILABLE: STATUS.UNAVAILABLE
  };

  var REASON_TEXT = {
    AMBIGUOUS: "Die Zählung ist nicht eindeutig: mehrere Varianten erfüllen die Regeln gleich gut.",
    ABORTED: "Die Engine hat die Zählung abgebrochen.",
    INSUFFICIENT_DATA: "Zu wenige bestätigte Pivots für eine Zählung.",
    NO_BUNDLE: "Für diesen Titel liegt keine vorberechnete Technical-Intelligence-Analyse vor.",
    NO_SERIES: "Ohne ausgelieferte Kursreihe kann keine Struktur bestimmt werden.",
    NOT_REQUESTED: "Für diesen Titel wurde keine Analyse angefordert."
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * Uebersetzt den Elliott-Block eines bestehenden Technical-Bundles.
   *
   * @param {object|null} elliott  bundle.elliott oder null
   * @param {object} [opts] {requested: boolean, seriesAvailable: boolean}
   * @returns {object} {status, reason, message, confidence, ...}
   */
  function elliottWave(elliott, opts) {
    opts = opts || {};
    var base = {
      layer: "elliottWave", engineVersion: ENGINE_VERSION,
      status: STATUS.UNAVAILABLE, reason: null, message: null,
      sourceEngine: null, methodologyVersion: null, repaintingPolicy: null,
      confidence: null, confidenceType: null, isProbability: false,
      currentWave: null, patternType: null, degreeScale: null,
      asOf: null, disclaimer: null
    };

    if (!elliott) {
      if (opts.calculating === true) {
        base.status = STATUS.CALCULATING;
        base.reason = "PENDING";
        base.message = "Die Analyse läuft. Es wird kein Zwischenstand als Ergebnis gezeigt.";
        return base;
      }
      base.reason = opts.seriesAvailable === false ? "NO_SERIES" : "NO_BUNDLE";
      base.message = REASON_TEXT[base.reason];
      return base;
    }

    base.sourceEngine = elliott.engineVersion || null;
    base.methodologyVersion = elliott.methodologyVersion || null;
    base.repaintingPolicy = elliott.repaintingPolicy || null;
    base.asOf = elliott.asOf || null;
    base.disclaimer = elliott.disclaimer || null;
    base.isProbability = elliott.isProbability === true;

    var mapped = FROM_ENGINE[elliott.status];
    base.status = mapped || STATUS.UNAVAILABLE;
    if (base.status === STATUS.UNAVAILABLE) {
      base.reason = elliott.reason || elliott.status || "UNAVAILABLE";
      base.message = REASON_TEXT[base.reason] ||
        "Die Elliott-Engine liefert für diesen Titel keinen verwertbaren Befund (" +
        String(elliott.status) + ").";
      return base;
    }

    base.confidence = isNum(elliott.confidence) ? elliott.confidence : null;
    base.confidenceType = elliott.confidenceType || null;

    var degree = elliott.degrees && elliott.degreeScale ? elliott.degrees[elliott.degreeScale] : null;
    if (degree) {
      base.currentWave = degree.currentWave || null;
      base.patternType = degree.patternType || null;
    }
    base.degreeScale = elliott.degreeScale || null;
    /* Eine niedrige Methodengeguete wird herabgestuft, auch wenn die
       Engine "OK" sagt: die Oberflaeche soll eine schwache Zaehlung nicht
       wie eine belastbare zeigen. */
    if (base.status === STATUS.AVAILABLE && isNum(base.confidence) && base.confidence < 50) {
      base.status = STATUS.LOW_CONFIDENCE;
    }
    return base;
  }

  /**
   * Der gesamte Technical-Intelligence-Block eines Titels. Heute mit
   * genau einer Ebene; weitere Ebenen (Wyckoff, Harmonics, Regime) tragen
   * denselben Vertrag und erscheinen hier, ohne dass die Oberflaeche
   * geaendert werden muss.
   */
  function fromBundle(bundle, opts) {
    opts = opts || {};
    var out = {
      engineVersion: ENGINE_VERSION,
      available: !!bundle,
      source: bundle ? (bundle.methodologyVersion || null) : null,
      asOf: bundle ? (bundle.dataCutoff || null) : null,
      layers: {}
    };
    out.layers.elliottWave = elliottWave(bundle ? bundle.elliott : null, opts);
    /* Die weiteren Familien der bestehenden Engine werden unveraendert
       durchgereicht - sie sind deterministisch gerechnet, im Gegensatz zur
       Wellenzaehlung. */
    out.layers.marketStructure = bundle && bundle.structure
      ? { status: STATUS.AVAILABLE, state: bundle.structure.state || null,
          engineVersion: bundle.structure.engineVersion || null,
          repaintingPolicy: bundle.structure.repaintingPolicy || null }
      : { status: STATUS.UNAVAILABLE, reason: "NO_BUNDLE" };
    out.layers.supportResistance = bundle && bundle.supportResistance
      ? { status: STATUS.AVAILABLE,
          zones: (bundle.supportResistance.zones || []).length,
          nearestSupport: bundle.supportResistance.nearestSupport || null,
          nearestResistance: bundle.supportResistance.nearestResistance || null,
          engineVersion: bundle.supportResistance.engineVersion || null }
      : { status: STATUS.UNAVAILABLE, reason: "NO_BUNDLE" };
    return out;
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, STATUS: STATUS, FROM_ENGINE: FROM_ENGINE,
    REASON_TEXT: REASON_TEXT, elliottWave: elliottWave, fromBundle: fromBundle
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.TechnicalIntelligence = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
