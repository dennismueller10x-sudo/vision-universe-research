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
    /* DIE REIHE, DEREN BEREINIGTE SPALTE WIDERLEGT IST - siehe
       fallbackDeclaration() weiter unten.

       Sie steht auf SPLIT_ADJUSTED, weil das die Stufe ist, die sich aus
       ihr rechnen laesst: Rohschluss und Splitfaktor sind geprueft, und
       die splitbereinigte Reihe entsteht daraus. Sie steht NICHT auf
       TOTAL_RETURN, weil genau diese Stufe an den Daten gescheitert ist -
       der Rangvergleich sperrt damit jede Gesamtrenditekennzahl, ohne
       dass ein Aufrufer ein neues Feld kennen muss.

       Das ist keine Behauptung ueber die adjClose-Spalte des Anbieters.
       Wer die Reihe rechnet, konstruiert sie (market-factors.priceSeries);
       wer die Spalte lesen will, fragt return-semantics und bekommt
       RAW_PRICE - den einzigen Rohstoff, fuer den wir hier einstehen. */
    splitAdjustedReconstructible: "SPLIT_ADJUSTED",
    unadjusted: "RAW",
    raw: "RAW"
  };

  /* Das Vokabular fuer genau diesen Zustand, an einer Stelle. Wer es
     vergleicht, vergleicht nicht gegen ein Stringliteral in fuenf
     Dateien. */
  var RECONSTRUCTIBLE = "splitAdjustedReconstructible";

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

  /* =====================================================================
     WAS EINE REIHE NOCH SEIN DARF, WENN IHR ANSPRUCH WIDERLEGT IST
     (Owner-Frage vom 2026-09-25)

     Der Fall, der das ausgeloest hat: SPY war als TOTAL_RETURN deklariert,
     verhielt sich an einem Ex-Tag aber nicht so. Die Konsistenzpruefung
     hat das erkannt und die Reihe angehalten - richtig, denn eine falsch
     ausgezeichnete Reihe ist schlimmer als eine fehlende.

     Die Folge war jedoch weiter als der Befund: mit SPY fehlte die
     Vergleichsreihe, und damit die relative Staerke von 6.267 Titeln -
     obwohl die relative Staerke seit Option C ueberhaupt keine
     Gesamtrendite verlangt, sondern den splitbereinigten Kurs. Ein Fehler
     in der Dividendenbereinigung hat eine Kennzahl gesperrt, die von der
     Dividendenbereinigung nichts wissen will.

     Diese Funktion trennt das. Sie lockert die Pruefung nicht - sie liest
     deren Urteil genauer:

       - Der Befund bleibt der Befund. Die Reihe darf sich NICHT mehr
         TOTAL_RETURN nennen, und jede Gesamtrenditekennzahl bleibt
         gesperrt. Das ist die Datenart, die gescheitert ist.
       - Was NICHT gescheitert ist: Rohschluss und Splitfaktor. Aus ihnen
         entsteht die splitbereinigte Reihe, ohne Dividendenbetrag und
         ohne bereinigte Spalte.

     Drei Bedingungen, und alle drei muessen erfuellt sein:

       1. Der EINZIGE Fehler ist der Widerspruch der Bereinigungsstufe.
          Ein zweiter Fehler betrifft die Bars selbst; dann ist auch der
          Rohschluss nicht belastbar.
       2. Widerlegt ist hoechstens die DIVIDENDENbereinigung
          (refutedAbove === "SPLIT_ADJUSTED"). Ist die SPLITbereinigung
          widerlegt (refutedAbove === "RAW"), steht der Splitfaktor selbst
          in Frage - und damit die Rekonstruktion. Kein Rueckfall.
       3. Die Eingaben der Rekonstruktion sind vollstaendig. Gemessen von
          return-series.splitAdjustedInputs(), nicht angenommen.

     @param {object} verdict  Ergebnis von validateAdjustmentConsistency()
     @param {object} inputs   Ergebnis von Series.splitAdjustedInputs()
   */
  function fallbackDeclaration(verdict, inputs) {
    var nein = function (reason, detail) {
      return { allowed: false, declare: null, level: null, reason: reason,
               detail: detail || null, blocks: null };
    };
    if (!verdict) return nein("NO_VERDICT");
    if (verdict.ok) return nein("NOT_REFUTED");

    var errors = (verdict.findings || []).filter(function (f) { return f.severity === "error"; });
    var codes = errors.map(function (f) { return f.code; });
    if (!(codes.length === 1 && codes[0] === "adjustment_status_contradicted")) {
      return nein("OTHER_ERRORS_PRESENT", codes);
    }

    var ceiling = verdict.observed ? verdict.observed.refutedAbove : null;
    if (ceiling !== "SPLIT_ADJUSTED") return nein("SPLIT_ADJUSTMENT_ITSELF_REFUTED", ceiling);

    if (!inputs || inputs.constructible !== true) {
      return nein("SPLIT_ADJUSTED_INPUTS_INCOMPLETE", inputs ? inputs.missing : null);
    }

    return {
      allowed: true,
      declare: RECONSTRUCTIBLE,
      level: normalize(RECONSTRUCTIBLE),
      reason: "TOTAL_RETURN_COLUMN_REFUTED_SPLIT_ADJUSTED_RECONSTRUCTIBLE",
      /* Was ausdruecklich gesperrt bleibt. Steht hier als Wort und nicht
         nur als Rangfolge, damit ein Bericht es nennen kann. */
      blocks: ["TOTAL_RETURN"],
      refutedClaim: verdict.claimedStatus || null,
      ceiling: ceiling,
      bars: inputs.bars,
      first: inputs.first,
      last: inputs.last
    };
  }

  var api = {
    LEVELS: LEVELS, RANK: RANK, FROM_PROVIDER: FROM_PROVIDER,
    RECONSTRUCTIBLE: RECONSTRUCTIBLE,
    fallbackDeclaration: fallbackDeclaration,
    configure: configure, isConfigured: isConfigured,
    normalize: normalize, rank: rank, minimumFor: minimumFor,
    check: check, label: label, returnLabel: returnLabel, caveat: caveat,
    comparable: comparable, declareSeries: declareSeries,
    METHODOLOGY_FILE: "price-adjustment-v1.json"
  };

  if (isNode) module.exports = api;
  else global.VUPriceSemantics = api;
})(typeof window !== "undefined" ? window : globalThis);
