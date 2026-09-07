/* =========================================================================
   VISION UNIVERSE — price-semantics.js   (Phase 3, §2)

   Eine Stelle, an der festgelegt ist, was eine Kursreihe bedeutet.

   Der Anlass war ein Auditbefund: der Quant-Bereich rechnet auf
   total-return-bereinigten Kursen und nennt das Ergebnis "Rendite"; das
   Dashboard rechnet auf splitbereinigten Kursen und nennt das Ergebnis
   ebenfalls "Rendite". Beide Zahlen sind fuer sich genommen richtig. Sie
   bedeuten nur nicht dasselbe, und nichts im System sagte das.

   Ein solcher Unterschied faellt nicht auf. Er erzeugt keinen Fehler, keine
   Warnung und keine auffaellige Zahl - er erzeugt zwei Werte, die nebeneinander
   stehen und nicht nebeneinander gehoeren. Das ist der Grund fuer dieses
   Modul: nicht Genauigkeit, sondern Vergleichbarkeit.

   Die inhaltliche Festlegung steht in
   quant/methodology/price-adjustment-v1.json und wird auch von der
   Python-Seite gelesen (scripts/dashboard/price_semantics.py). Beide Stacks
   lesen dieselbe Datei; eine gemeinsame Bibliothek gibt es nicht, eine
   gemeinsame Definition schon.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Die vier Stufen. Der Rang macht sie vergleichbar; UNKNOWN liegt
     ausdruecklich UNTER RAW, weil "wir wissen nicht, was das ist" strenger
     behandelt werden muss als "wir wissen, dass die Bereinigung fehlt". */
  var LEVELS = ["UNKNOWN", "RAW", "SPLIT_ADJUSTED", "TOTAL_RETURN"];
  var RANK = { UNKNOWN: -1, RAW: 0, SPLIT_ADJUSTED: 1, TOTAL_RETURN: 2 };

  /* Vokabular der Providerschicht -> Stufe. Im Zweifel die niedrigere:
     eine zu niedrig eingestufte Reihe kostet eine Kennzahl, eine zu hoch
     eingestufte erzeugt eine falsche Zahl. */
  var FROM_PROVIDER = {
    adjusted: "TOTAL_RETURN",
    total_return: "TOTAL_RETURN",
    splitAdjusted: "SPLIT_ADJUSTED",
    split_adjusted: "SPLIT_ADJUSTED",
    unadjusted: "RAW",
    raw: "RAW"
  };

  var config = null;

  /** Laedt die Methodikdatei. Ohne sie arbeitet das Modul mit den
      eingebauten Mindestanforderungen weiter - es soll nie der Grund sein,
      warum etwas gar nicht laeuft. */
  function configure(json) { config = json || null; return api; }
  function isConfigured() { return !!config; }

  /* Eingebaute Mindestanforderungen. Deckungsgleich mit der Methodikdatei;
     sie sind der Rueckfall, nicht die Quelle der Wahrheit. */
  var FALLBACK_MINIMUM = {
    price_return: "SPLIT_ADJUSTED",
    total_return: "TOTAL_RETURN",
    momentum: "SPLIT_ADJUSTED",
    volatility: "SPLIT_ADJUSTED",
    drawdown: "SPLIT_ADJUSTED",
    moving_average: "SPLIT_ADJUSTED",
    breakout: "SPLIT_ADJUSTED",
    relative_strength: "SPLIT_ADJUSTED",
    cagr: "TOTAL_RETURN",
    backtest_evidence: "TOTAL_RETURN",
    order_sizing: "RAW",
    volume_analysis: "RAW"
  };

  function normalize(value) {
    if (!value) return "UNKNOWN";
    var upper = String(value).toUpperCase();
    if (RANK[upper] !== undefined) return upper;
    var mapped = FROM_PROVIDER[String(value)];
    return mapped || "UNKNOWN";
  }

  function rank(level) {
    var r = RANK[normalize(level)];
    return r === undefined ? -1 : r;
  }

  function minimumFor(metric) {
    if (config && config.metrics && config.metrics[metric]) {
      return config.metrics[metric].minimumLevel;
    }
    return FALLBACK_MINIMUM[metric] || null;
  }

  /**
   * Darf `metric` aus einer Reihe der Stufe `level` berechnet werden?
   *
   * Gibt bewusst ein Objekt zurueck, kein boolean: der Aufrufer braucht im
   * Ablehnungsfall den Grund, um ihn anzuzeigen. Eine Kennzahl wegzulassen
   * und nicht zu sagen warum, ist nur die halbe Ehrlichkeit.
   */
  function check(metric, level) {
    var actual = normalize(level);
    var minimum = minimumFor(metric);

    if (!minimum) {
      return { allowed: false, level: actual, required: null, reason: "unknownMetric",
               message: "Unbekannte Kennzahl '" + metric + "'. Ohne Mindestanforderung wird nicht gerechnet." };
    }
    if (actual === "UNKNOWN") {
      return { allowed: false, level: actual, required: minimum, reason: "unknownAdjustment",
               message: "Die Bereinigungsstufe der Reihe ist nicht bekannt. " +
                        "'" + metric + "' setzt mindestens " + label(minimum) + " voraus." };
    }
    if (rank(actual) < rank(minimum)) {
      return { allowed: false, level: actual, required: minimum, reason: "insufficientAdjustment",
               message: "Die Reihe ist " + label(actual) + "; '" + metric + "' setzt mindestens " +
                        label(minimum) + " voraus." };
    }
    return { allowed: true, level: actual, required: minimum, reason: null, message: null };
  }

  /** Wie eine Kennzahl dieser Stufe heissen darf. */
  function label(level) {
    var l = normalize(level);
    if (config && config.levels && config.levels[l]) return config.levels[l].label;
    return { UNKNOWN: "Unbekannt", RAW: "Unbereinigt",
             SPLIT_ADJUSTED: "Splitbereinigt", TOTAL_RETURN: "Total Return" }[l];
  }

  /**
   * Die Bezeichnung fuer eine Renditezahl auf der gegebenen Stufe.
   *
   * Der Kern der Regel: "Rendite" ohne Zusatz ist ausschliesslich fuer
   * TOTAL_RETURN zulaessig. Wer auf einer niedrigeren Stufe rechnet, muss
   * es im Namen sagen - der Leser kann den Unterschied sonst nicht sehen.
   */
  function returnLabel(level) {
    var l = normalize(level);
    if (l === "TOTAL_RETURN") return "Gesamtrendite";
    if (l === "SPLIT_ADJUSTED") return "Kursrendite";
    if (l === "RAW") return "Kursveraenderung (unbereinigt)";
    return "Kursveraenderung (Bereinigung unbekannt)";
  }

  /** Was an einer Kennzahl dieser Stufe fehlt - fuer die Anzeige. */
  function caveat(level) {
    var l = normalize(level);
    if (l === "TOTAL_RETURN") return null;
    if (l === "SPLIT_ADJUSTED") {
      return "Ohne Dividenden gerechnet. Bei einem Ausschuetter liegt die tatsaechliche " +
             "Gesamtrendite darueber.";
    }
    if (l === "RAW") {
      return "Weder Splits noch Dividenden beruecksichtigt. Ein Split im Zeitraum " +
             "erscheint als Kurssturz, obwohl kein Wert verloren ging.";
    }
    return "Die Bereinigungsstufe dieser Reihe ist nicht dokumentiert. Die Zahl ist " +
           "nicht interpretierbar.";
  }

  /**
   * Prueft, ob zwei Kennzahlen nebeneinandergestellt werden duerfen.
   *
   * Genau der Fall aus dem Auditbefund: eine Gesamtrendite aus dem
   * Quant-Bereich und eine Kursrendite aus dem Dashboard sehen in einer
   * Tabelle gleich aus und sind es nicht.
   */
  function comparable(levelA, levelB) {
    var a = normalize(levelA), b = normalize(levelB);
    if (a === b && a !== "UNKNOWN") {
      return { comparable: true, level: a, message: null };
    }
    if (a === "UNKNOWN" || b === "UNKNOWN") {
      return { comparable: false, level: null,
               message: "Mindestens eine der beiden Reihen hat keine dokumentierte Bereinigungsstufe. " +
                        "Ein Vergleich waere eine Behauptung ueber Daten, die niemand geprueft hat." };
    }
    return { comparable: false, level: null,
             message: "Die Reihen sind unterschiedlich bereinigt (" + label(a) + " gegen " + label(b) +
                      "). Die Differenz zwischen beiden Zahlen enthaelt die fehlende Bereinigung " +
                      "und nicht nur den Unterschied zwischen den Titeln." };
  }

  /**
   * Bringt eine Kursreihe auf eine bekannte Stufe.
   *
   * Kein Rechenschritt - eine Kennzeichnung. Hochstufen kann man nur mit
   * Daten (Split- und Dividendenereignissen), nicht mit einer Zusicherung.
   */
  function declareSeries(series, level, source) {
    var l = normalize(level);
    return {
      adjustment: l,
      adjustmentLabel: label(l),
      adjustmentSource: source || "declared",
      adjustmentCaveat: caveat(l),
      series: series
    };
  }

  var api = {
    LEVELS: LEVELS, RANK: RANK, FROM_PROVIDER: FROM_PROVIDER,
    configure: configure, isConfigured: isConfigured,
    normalize: normalize, rank: rank, minimumFor: minimumFor,
    check: check, label: label, returnLabel: returnLabel, caveat: caveat,
    comparable: comparable, declareSeries: declareSeries,
    METHODOLOGY_FILE: "price-adjustment-v1.json"
  };

  if (isNode) module.exports = api;
  else global.VUPriceSemantics = api;
})(typeof window !== "undefined" ? window : globalThis);
