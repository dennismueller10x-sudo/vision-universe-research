/* =========================================================================
   VISION UNIVERSE QUANT — market-quality.js
   QUALITAETSPRUEFUNG EINGEHENDER MARKTDATEN (Phase 2, §17)

   Kein Datensatz erreicht die Quant Engine ungeprueft.

   Der Grund ist asymmetrisch: eine falsche Bar faellt in der Kursanzeige
   kaum auf, kann aber in einem Momentum-Faktor oder einem Backtest einen
   Scheingewinn von 100 % erzeugen — und der sieht dann aus wie ein
   Ergebnis. Ein nicht angekuendigter Split ist der haeufigste Fall: der
   Kurs halbiert sich ueber Nacht, und ohne Bereinigung liest die Engine
   das als Kurssturz.

   Befunde sind nach Schwere getrennt:
     error    Bar bzw. Reihe darf nicht verwendet werden
     warning  verwendbar, aber kennzeichnungspflichtig
     info     Hinweis
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var DEFAULTS = {
    maxDailyMovePct: 35,        // darueber: Verdacht auf Corporate Action
    splitRatios: [2, 3, 4, 5, 6, 7, 8, 10, 20, 1.5],
    splitTolerance: 0.04,
    maxGapTradingDays: 5,       // fehlende Handelstage in Folge
    minBars: 2,

    /* Schwellen fuer die Gegenprobe zwischen roher und bereinigter Spalte
       (§24). Sie sind bewusst grosszuegig: der Test soll einen falsch
       deklarierten Datenbestand finden, nicht Rundungsrauschen melden. */
    adjustmentRatioTolerance: 0.001,  // ab wann gilt der Faktor als veraendert
    splitJumpPct: 30,                 // ab wann gilt ein Rohsprung als Split
    splitResidualPct: 15              // so viel darf die bereinigte Reihe dabei bewegen
  };

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function round(v, d) { var f = Math.pow(10, d || 2); return Math.round(v * f) / f; }

  function finding(severity, code, message, context) {
    return { severity: severity, code: code, message: message, context: context || null };
  }

  /** Sieht das Kursverhaeltnis nach einem gaengigen Split aus? */
  function looksLikeSplit(ratio, config) {
    var candidates = config.splitRatios;
    for (var i = 0; i < candidates.length; i++) {
      var r = candidates[i];
      if (Math.abs(ratio - r) / r <= config.splitTolerance) return { ratio: r, direction: "down" };
      if (Math.abs(ratio - 1 / r) * r <= config.splitTolerance) return { ratio: r, direction: "up" };
    }
    return null;
  }

  /**
   * Prueft eine Kursreihe.
   * @param {Array} bars aufsteigend nach Datum
   * @param {object} options {today, tradingDays, config, adjustmentStatus}
   */
  function validateBars(bars, options) {
    options = options || {};
    var config = Object.assign({}, DEFAULTS, options.config || {});
    var today = options.today || new Date().toISOString().slice(0, 10);
    var findings = [];
    var usable = [];

    if (!Array.isArray(bars) || bars.length < config.minBars) {
      findings.push(finding("error", "too_few_bars",
        "Zu wenige Bars (" + (bars ? bars.length : 0) + "). Eine Reihe unter " + config.minBars +
        " Punkten laesst keine Pruefung und keine Faktorberechnung zu."));
      return { ok: false, findings: findings, bars: [], stats: null };
    }

    var seenDates = Object.create(null);
    var previous = null;
    var suspectedSplits = [];
    var gaps = [];

    /* Auf welcher Spalte wird die Stetigkeit geprueft?
    
       Diese Frage stellte sich nicht, solange eine Reihe nur eine Spalte
       hatte. Tiingo liefert beide, und dann ist die Antwort entscheidend:
       die ROHE Spalte springt an einem Split - das ist ihre Aufgabe, nicht
       ihr Fehler. Wer sie auf Stetigkeit prueft, lehnt genau die Titel ab,
       die eine Kapitalmassnahme hatten.

       Das ist nicht hypothetisch: der erste Import gegen die echte API hat
       AAPL, NVDA, AMZN und TSLA verworfen - alle vier mit Split im
       Zeitraum, alle vier mit tadellos bereinigter Reihe daneben.

       Traegt die Reihe eine belastbare bereinigte Spalte, wird auf ihr
       geprueft. Sonst auf der rohen, und dann gilt der Verdacht wieder. */
    var stufe = String(options.adjustmentStatus || "").toUpperCase();
    var bereinigtBelastbar = stufe === "TOTAL_RETURN" || stufe === "SPLIT_ADJUSTED" ||
                             options.adjustmentStatus === "adjusted" ||
                             options.adjustmentStatus === "splitAdjusted";
    var pruefeBereinigt = bereinigtBelastbar && bars.some(function (b) {
      return b && isNum(b.adjustedClose) && b.adjustedClose > 0;
    });

    /** Der Wert, an dem die Stetigkeit gemessen wird. */
    function verlaufswert(bar) {
      if (pruefeBereinigt && isNum(bar.adjustedClose) && bar.adjustedClose > 0) {
        return bar.adjustedClose;
      }
      return bar.close;
    }

    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var where = { index: i, date: bar && bar.date };
      var barErrors = 0;

      if (!bar || !/^\d{4}-\d{2}-\d{2}$/.test(String(bar.date))) {
        findings.push(finding("error", "invalid_date", "Bar ohne gueltiges Datum.", where));
        continue;
      }
      /* Bars aus der Zukunft sind kein Randfall: sie entstehen durch
         Zeitzonenfehler und wuerden im Backtest als Look-Ahead wirken. */
      if (bar.date > today) {
        findings.push(finding("error", "future_bar",
          "Bar liegt in der Zukunft (" + bar.date + " > " + today + ").", where));
        continue;
      }
      if (seenDates[bar.date]) {
        findings.push(finding("error", "duplicate_bar", "Doppelte Bar fuer " + bar.date + ".", where));
        continue;
      }
      seenDates[bar.date] = true;

      if (previous && bar.date <= previous.date) {
        findings.push(finding("error", "non_monotonic",
          "Zeitstempel nicht aufsteigend: " + bar.date + " nach " + previous.date + ".", where));
        barErrors++;
      }

      var o = bar.open, h = bar.high, l = bar.low, c = bar.close;
      if (!isNum(c) || c <= 0) {
        findings.push(finding("error", "invalid_close", "Schlusskurs fehlt oder ist nicht positiv.", where));
        continue;
      }
      if (isNum(h) && isNum(l) && h < l) {
        findings.push(finding("error", "high_below_low", "High (" + h + ") unter Low (" + l + ").", where));
        barErrors++;
      }
      if (isNum(h) && ((isNum(o) && h < o) || h < c)) {
        findings.push(finding("error", "high_below_body",
          "High (" + h + ") unter Open/Close.", where));
        barErrors++;
      }
      if (isNum(l) && ((isNum(o) && l > o) || l > c)) {
        findings.push(finding("error", "low_above_body",
          "Low (" + l + ") ueber Open/Close.", where));
        barErrors++;
      }
      if (isNum(bar.volume) && bar.volume < 0) {
        findings.push(finding("error", "negative_volume", "Negatives Volumen.", where));
        barErrors++;
      }
      if (isNum(o) && o <= 0) {
        findings.push(finding("warning", "non_positive_open", "Eroeffnungskurs nicht positiv.", where));
      }

      var vorher = previous ? verlaufswert(previous) : null;
      var jetzt = verlaufswert(bar);
      if (previous && isNum(vorher) && vorher > 0 && isNum(jetzt) && jetzt > 0) {
        var change = jetzt / vorher - 1;
        var movePct = Math.abs(change) * 100;
        if (movePct > config.maxDailyMovePct) {
          var split = looksLikeSplit(vorher / jetzt, config);
          /* Ein Tag, den der Anbieter selbst als Splittag kennzeichnet,
             erklaert seinen eigenen Sprung. Das ist eine dokumentierte
             Kapitalmassnahme und kein Verdachtsfall - auch dann nicht, wenn
             nur die rohe Spalte vorliegt. */
          var angekuendigt = isNum(bar.splitFactor) && Math.abs(bar.splitFactor - 1) > 1e-9;
          if (angekuendigt) {
            findings.push(finding("info", "announced_split",
              "Kurssprung von " + round(movePct, 1) + " % am " + bar.date + " faellt mit einem " +
              "vom Anbieter gekennzeichneten Split zusammen (Faktor " + bar.splitFactor + ")." +
              (pruefeBereinigt ? "" : " Die Reihe traegt keine belastbare bereinigte Spalte; " +
               "fuer Kennzahlen ist sie damit nur eingeschraenkt brauchbar."), where));
          } else if (split) {
            suspectedSplits.push({ date: bar.date, ratio: split.ratio, direction: split.direction,
                                   from: vorher, to: jetzt });
            findings.push(finding("error", "suspected_unadjusted_split",
              "Kurssprung von " + round(movePct, 1) + " % am " + bar.date + " entspricht einem " +
              split.ratio + ":1-Verhaeltnis. Das ist mit hoher Wahrscheinlichkeit ein nicht bereinigter " +
              "Split. Unbereinigt gerechnet wuerde die Engine daraus einen echten Kursverlust ableiten.",
              where));
          } else {
            findings.push(finding("warning", "large_move",
              "Kurssprung von " + round(movePct, 1) + " % am " + bar.date + " ohne erkennbares Split-Verhaeltnis. " +
              "Pruefen, ob ein Unternehmensereignis oder ein Datenfehler vorliegt.", where));
          }
        }
      }

      /* Luecken: mehr als N fehlende Handelstage deuten auf einen
         unvollstaendigen Abruf hin, nicht auf Feiertage. */
      if (previous && options.tradingDays) {
        var missing = countMissingTradingDays(previous.date, bar.date, options.tradingDays);
        if (missing > config.maxGapTradingDays) {
          gaps.push({ from: previous.date, to: bar.date, missing: missing });
          findings.push(finding("warning", "missing_bars",
            missing + " fehlende Handelstage zwischen " + previous.date + " und " + bar.date + ".", where));
        }
      }

      if (barErrors === 0) usable.push(bar);
      previous = bar;
    }

    /* Unbereinigte Reihen sind fuer die Renditerechnung nicht geeignet.
       Das ist eine Eigenschaft der Reihe, kein Fehler einer Bar. */
    if (options.adjustmentStatus === "unadjusted") {
      findings.push(finding("warning", "unadjusted_series",
        "Die Reihe ist nicht um Splits und Dividenden bereinigt. Sie ist fuer die Anzeige geeignet, " +
        "aber nicht als Grundlage fuer Total-Return-Kennzahlen oder Backtests."));
    } else if (options.adjustmentStatus === "splitAdjusted") {
      /* Der unauffaelligere und darum gefaehrlichere Fall: die Reihe sieht
         sauber aus, weil die Splits herausgerechnet sind. Die Dividenden
         fehlen aber weiterhin. Wer darauf eine Total-Return-Kennzahl
         rechnet, unterschaetzt die Rendite systematisch - bei einem
         Dividendenwert ueber zehn Jahre um mehrere Prozentpunkte pro Jahr.
         Kein Fehler der Reihe, aber eine Grenze ihrer Verwendbarkeit. */
      findings.push(finding("warning", "split_adjusted_only",
        "Die Reihe ist splitbereinigt, aber nicht dividendenbereinigt. Fuer Charts und " +
        "Momentum-Kennzahlen geeignet, fuer Total-Return-Kennzahlen nicht."));
    }

    var errors = findings.filter(function (f) { return f.severity === "error"; });
    var stats = {
      bars: bars.length, usable: usable.length,
      /* Worauf die Stetigkeitspruefung lief. Ohne diese Angabe laesst sich
         ein Befund nicht einordnen: "kein Sprung gefunden" bedeutet auf der
         bereinigten Spalte etwas anderes als auf der rohen. */
      continuityBasis: pruefeBereinigt ? "adjustedClose" : "close",
      first: usable.length ? usable[0].date : null,
      last: usable.length ? usable[usable.length - 1].date : null,
      suspectedSplits: suspectedSplits.length,
      gaps: gaps.length,
      errors: errors.length,
      warnings: findings.length - errors.length
    };
    return { ok: errors.length === 0, findings: findings, bars: usable, stats: stats,
             suspectedSplits: suspectedSplits, gaps: gaps };
  }

  function countMissingTradingDays(fromDate, toDate, tradingDays) {
    var from = tradingDays.indexOf(fromDate);
    var to = tradingDays.indexOf(toDate);
    if (from < 0 || to < 0 || to <= from) return 0;
    return to - from - 1;
  }

  /** Prueft einen ganzen Abruf ueber mehrere Titel. */
  function validateBatch(seriesById, options) {
    var results = {};
    var summary = { securities: 0, ok: 0, rejected: 0, totalErrors: 0, totalWarnings: 0, rejectedIds: [] };
    Object.keys(seriesById).forEach(function (securityId) {
      var entry = seriesById[securityId];
      var res = validateBars(entry.bars || entry, Object.assign({}, options, {
        adjustmentStatus: entry.adjustmentStatus || (options && options.adjustmentStatus)
      }));
      results[securityId] = res;
      summary.securities++;
      summary.totalErrors += res.stats ? res.stats.errors : 1;
      summary.totalWarnings += res.stats ? res.stats.warnings : 0;
      if (res.ok) summary.ok++;
      else { summary.rejected++; summary.rejectedIds.push(securityId); }
    });
    return { results: results, summary: summary };
  }

  /* =====================================================================
     GEGENPROBE ZWISCHEN ROHER UND BEREINIGTER SPALTE (Phase 4A, §24)

     Bis hierher prueft die Datei eine Reihe gegen sich selbst. Tiingo
     liefert beide Spalten nebeneinander - und damit laesst sich etwas
     pruefen, was vorher nicht ging: ob die bereinigte Spalte wirklich
     bereinigt ist.

     Das ist kein akademischer Punkt. Der gefaehrliche Fall ist nicht die
     fehlende Bereinigung, sondern die behauptete: eine Reihe, die
     "adjClose" heisst und in Wahrheit nur die Rohwerte kopiert, sieht
     sauber aus und erzeugt trotzdem falsche Renditen.

     Die Pruefung leitet die Stufe AUS DEN DATEN ab und vergleicht sie mit
     der behaupteten. Sie hebt nie an - eine Reihe, die sich besser
     verhaelt als deklariert, bleibt deklariert. Sie widerspricht nur.
     ===================================================================== */

  /**
   * Der kumulierte Bereinigungsfaktor je Tag: bereinigt / roh.
   *
   * Er aendert sich genau an Split- und Ausschuettungstagen und ist
   * dazwischen konstant. Das macht ihn zum eigentlichen Messinstrument:
   * eine Spalte, die sich an einem Dividendenstichtag nicht ruehrt, hat
   * die Dividende nicht eingerechnet - egal wie sie heisst.
   */
  function adjustmentFactors(bars) {
    var out = [];
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i];
      var f = (isNum(b.close) && b.close > 0 && isNum(b.adjustedClose) && b.adjustedClose > 0)
        ? b.adjustedClose / b.close : null;
      out.push({ date: b.date, factor: f, close: b.close, adjustedClose: b.adjustedClose,
                 splitFactor: isNum(b.splitFactor) ? b.splitFactor : null,
                 dividend: isNum(b.dividend) ? b.dividend : null });
    }
    return out;
  }

  /**
   * Prueft die bereinigte Spalte gegen die rohe.
   *
   * @param {Array}  bars    aufsteigend, mit close und adjustedClose
   * @param {object} options {claimedStatus, config}
   * @returns {{ok, inferredStatus, claimedStatus, findings, observed}}
   *
   * inferredStatus ist bewusst zurueckhaltend: ohne ein Ereignis im
   * Zeitraum sind alle Stufen ununterscheidbar, und dann lautet die
   * Antwort UNKNOWN. Eine Reihe ohne Split und ohne Dividende beweist
   * nichts - auch nicht das Gegenteil.
   */
  function validateAdjustmentConsistency(bars, options) {
    options = options || {};
    var config = Object.assign({}, DEFAULTS, options.config || {});
    var claimed = options.claimedStatus || null;
    var findings = [];

    var factors = adjustmentFactors(bars || []);
    var withFactor = factors.filter(function (f) { return f.factor !== null; });

    var observed = {
      bars: factors.length,
      barsWithBothColumns: withFactor.length,
      splitEvents: [], dividendEvents: [],
      splitEvidence: [], dividendEvidence: [],
      factorFirst: null, factorLast: null, factorChanges: 0
    };

    if (withFactor.length < 2) {
      findings.push(finding("info", "no_adjusted_column",
        "Keine bereinigte Spalte vorhanden. Ohne sie ist die Bereinigungsstufe aus den " +
        "Daten nicht ableitbar - das ist kein Fehler, nur eine Grenze der Pruefung."));
      return { ok: true, inferredStatus: "UNKNOWN", claimedStatus: claimed,
               findings: findings, observed: observed };
    }

    observed.factorFirst = round(withFactor[0].factor, 6);
    observed.factorLast = round(withFactor[withFactor.length - 1].factor, 6);

    for (var i = 1; i < factors.length; i++) {
      var prev = factors[i - 1], cur = factors[i];

      var istSplittag = cur.splitFactor !== null && Math.abs(cur.splitFactor - 1) > 1e-9;
      var istDividendentag = cur.dividend !== null && cur.dividend > 0;
      if (istSplittag) observed.splitEvents.push({ date: cur.date, factor: cur.splitFactor });
      if (istDividendentag) observed.dividendEvents.push({ date: cur.date, amount: cur.dividend });

      if (prev.factor === null || cur.factor === null) continue;

      var faktorAenderung = Math.abs(cur.factor / prev.factor - 1);
      if (faktorAenderung > config.adjustmentRatioTolerance) observed.factorChanges++;

      /* Split: die rohe Reihe springt, die bereinigte nicht. Die Richtung
         der Konvention ist dabei gleichgueltig - geprueft wird der
         Unterschied zwischen den Spalten, nicht ihr Vorzeichen. */
      if (istSplittag && isNum(prev.close) && prev.close > 0) {
        var rohSprung = Math.abs(cur.close / prev.close - 1) * 100;
        var bereinigtSprung = Math.abs(cur.adjustedClose / prev.adjustedClose - 1) * 100;
        if (rohSprung >= config.splitJumpPct && bereinigtSprung <= config.splitResidualPct) {
          observed.splitEvidence.push({ date: cur.date, rawMovePct: round(rohSprung, 2),
                                        adjustedMovePct: round(bereinigtSprung, 2) });
        } else if (rohSprung >= config.splitJumpPct && bereinigtSprung > config.splitResidualPct) {
          /* Eine Beobachtung, kein Fehler. Dass die bereinigte Spalte den
             Split nicht mitmacht, ist bei einer ehrlich als RAW
             deklarierten Reihe genau das Erwartete. Zum Fehler wird es
             erst, wenn die Reihe etwas anderes von sich behauptet - und
             das entscheidet weiter unten der Widerspruch. */
          findings.push(finding("warning", "split_not_adjusted",
            "Am " + cur.date + " springen beide Spalten (roh " + round(rohSprung, 1) +
            " %, bereinigt " + round(bereinigtSprung, 1) + " %). Die bereinigte Spalte ist an " +
            "diesem Splittag nicht bereinigt.", { date: cur.date }));
        }
      }

      /* Ausschuettung: der Faktor muss sich bewegen. Tut er es nicht, ist
         die Dividende nicht eingerechnet - die Spalte ist dann hoechstens
         splitbereinigt, egal wie sie heisst. */
      if (istDividendentag && isNum(prev.close) && prev.close > 0) {
        var erwartet = cur.dividend / prev.close;
        if (faktorAenderung > config.adjustmentRatioTolerance) {
          observed.dividendEvidence.push({
            date: cur.date, amount: cur.dividend,
            expectedFactorStep: round(erwartet, 6),
            observedFactorStep: round(faktorAenderung, 6)
          });
        } else if (erwartet > config.adjustmentRatioTolerance) {
          findings.push(finding("warning", "dividend_not_in_adjusted",
            "Am Ex-Tag " + cur.date + " (" + cur.dividend + ") aendert sich das Verhaeltnis " +
            "zwischen bereinigter und roher Spalte nicht. Die Ausschuettung ist nicht " +
            "eingerechnet.", { date: cur.date }));
        }
      }
    }

    /* Die Ableitung. Reihenfolge zaehlt: eine Dividende belegt die hoehere
       Stufe, ein Split nur die mittlere. */
    var unbereinigtBeobachtet = findings.some(function (f) {
      return f.code === "split_not_adjusted" || f.code === "dividend_not_in_adjusted";
    });

    var inferred = "UNKNOWN";
    if (observed.dividendEvidence.length > 0) inferred = "TOTAL_RETURN";
    else if (observed.splitEvidence.length > 0) inferred = "SPLIT_ADJUSTED";
    else if (unbereinigtBeobachtet && observed.factorChanges === 0) {
      /* Ein Ereignis lag im Zeitraum, die Spalte hat es nicht mitgemacht,
         und der Faktor stand ueber die ganze Reihe still: die bereinigte
         Spalte bereinigt nichts. Das ist eine Aussage, kein fehlender
         Befund - und sie stuetzt sich auf eine Beobachtung, nicht auf die
         blosse Anwesenheit eines Ereignisses im Kalender. */
      inferred = "RAW";
    }
    observed.inferredFrom = observed.dividendEvidence.length ? "dividend"
      : (observed.splitEvidence.length ? "split"
        : (unbereinigtBeobachtet ? "absence" : "no_events"));

    /* Der Widerspruch.
    
       Er stuetzt sich auf WIDERLEGUNG, nicht auf die Hoehe des positiven
       Befunds. Der Unterschied ist nicht akademisch: AMZN und TSLA zahlen
       keine Dividende. An ihnen laesst sich eine Splitbereinigung zeigen
       und eine Dividendenbereinigung nicht - nicht weil sie fehlte,
       sondern weil es nichts zu bereinigen gibt. Bei einem Titel ohne
       Ausschuettung sind TOTAL_RETURN und SPLIT_ADJUSTED dieselbe Reihe.
       
       Ein Rangvergleich haette beide verworfen. Der erste Import gegen die
       echte API hat genau das getan, und der Fehler lag nicht in den Daten.
       
       Widerlegt ist eine Stufe nur, wenn ein Ereignis im Zeitraum lag und
       die Spalte es nicht mitgemacht hat. */
    var RANG = { UNKNOWN: -1, RAW: 0, SPLIT_ADJUSTED: 1, TOTAL_RETURN: 2 };
    var hoechsteMoegliche = null;   // null = nichts widerlegt
    if (findings.some(function (f) { return f.code === "split_not_adjusted"; })) {
      hoechsteMoegliche = "RAW";
    } else if (findings.some(function (f) { return f.code === "dividend_not_in_adjusted"; })) {
      hoechsteMoegliche = "SPLIT_ADJUSTED";
    }
    observed.refutedAbove = hoechsteMoegliche;

    if (claimed && hoechsteMoegliche && RANG[claimed] !== undefined
        && RANG[claimed] > RANG[hoechsteMoegliche]) {
      findings.push(finding("error", "adjustment_status_contradicted",
        "Die Reihe ist als " + claimed + " deklariert, hoechstens aber " + hoechsteMoegliche +
        " - ein Ereignis im Zeitraum ist in der bereinigten Spalte nicht angekommen. Auf dieser " +
        "Grundlage gerechnete Renditen waeren falsch, nicht nur ungenau."));
    }

    var errors = findings.filter(function (f) { return f.severity === "error"; });
    return { ok: errors.length === 0, inferredStatus: inferred, claimedStatus: claimed,
             findings: findings, observed: observed };
  }


  /* ======================================================================
     BEURTEILUNG EINER REIHE ALS GANZES   (Tiingo Commercial, §11, §30)

     validateBars() beantwortet "darf diese Bar in den Bestand?". Bei
     tausend Titeln ist das nicht die Frage, die jemand stellt. Die Frage
     lautet: ist dieser Titel brauchbar, eingeschraenkt brauchbar oder
     nicht da - und warum.

     assessSeries() beantwortet genau diese und nur diese. Es rechnet
     nichts neu, was validateBars() schon rechnet; es ergaenzt die
     Pruefungen, die eine einzelne Bar nicht sehen kann:

       - veraltete letzte Bar (der Titel wird nicht mehr geliefert)
       - zu kurze Historie (SMA200 und 12M-Momentum sind nicht rechenbar)
       - fehlende Provenienz (die Reihe weiss nicht, woher sie kommt)
       - widerspruechliche Kapitalmassnahmen

     Vier Ergebnisse, und kein fuenftes:

       PASS         verwendbar
       WARNING      verwendbar, mit benannter Einschraenkung
       FAIL         nicht verwendbar, Daten liegen vor
       UNAVAILABLE  keine Daten - und das ist kein FAIL, sondern ein
                    anderer Befund. Wer beides zusammenwirft, kann
                    einen Anbieterausfall nicht von einem Datenfehler
                    unterscheiden.
     ====================================================================== */

  var ASSESS_DEFAULTS = {
    /* Ab wann ist die letzte Bar veraltet? Fuenf Handelstage sind ein
       verlaengertes Wochenende plus Feiertag - alles darueber heisst,
       dass der Titel nicht mehr geliefert wird. */
    maxStaleTradingDays: 5,
    /* Was eine Reihe koennen muss, um im Screener zu zaehlen: SMA200
       braucht 200 Bars, 12M-Momentum 252. Darunter ist die Reihe nicht
       falsch, sondern zu kurz - ein eigener Befund. */
    minBarsForFactors: 252,
    minBarsUsable: 30,
    /* Ein Splitfaktor jenseits dieser Grenzen ist keine Kapitalmassnahme
       mehr, sondern ein Datenfehler. 1:1000 gibt es; 1:100000 nicht. */
    maxSplitRatio: 1000,
    minSplitRatio: 0.001
  };

  /**
   * Wie viele Handelstage liegen zwischen zwei Datumsangaben?
   *
   * Naeherung ueber Wochentage - ohne Feiertagskalender. Sie wird
   * ausschliesslich fuer die Frage "ist die letzte Bar veraltet?"
   * benutzt, und dort genuegt sie: der Unterschied zwischen fuenf und
   * sechs Handelstagen entscheidet nichts, der zwischen fuenf und
   * fuenfzig schon.
   */
  function weekdaysBetween(fromDate, toDate) {
    var from = Date.parse(fromDate + "T00:00:00Z");
    var to = Date.parse(toDate + "T00:00:00Z");
    if (!isFinite(from) || !isFinite(to) || to <= from) return 0;
    /* Geschlossene Formel statt Schleife: bei 2.000 Titeln und einer
       jahrealten Reihe waeren das Millionen Iterationen fuer eine Zahl,
       die sich in vier Zeilen ergibt (§32). */
    var days = Math.round((to - from) / 86400000);
    var startDow = new Date(from).getUTCDay();
    var fullWeeks = Math.floor(days / 7);
    var count = fullWeeks * 5;
    var rest = days - fullWeeks * 7;
    for (var i = 1; i <= rest; i++) {
      var d = (startDow + i) % 7;
      if (d !== 0 && d !== 6) count++;
    }
    return count;
  }

  /**
   * Beurteilt eine gespeicherte Kursreihe.
   *
   * @param {object} payload  {bars, adjustmentStatus, provenance, ticker, ...}
   * @param {object} [options] {today, config, tradingDays, expectFactors}
   * @returns {object} {status, statusReason, findings, metrics}
   */
  function assessSeries(payload, options) {
    options = options || {};
    var cfg = Object.assign({}, ASSESS_DEFAULTS, options.config || {});
    var today = options.today || new Date().toISOString().slice(0, 10);
    var findings = [];

    if (!payload || !Array.isArray(payload.bars) || payload.bars.length === 0) {
      return {
        status: "UNAVAILABLE",
        statusReason: !payload ? "noSeries" : "emptySeries",
        findings: [finding("error", "no_data",
          "Keine Kursreihe vorhanden. Das ist kein Datenfehler, sondern ein fehlender Abruf.")],
        metrics: { bars: 0, usable: 0, first: null, last: null,
                   staleTradingDays: null, historyYears: null }
      };
    }

    var bars = payload.bars;
    var base = validateBars(bars, {
      today: today,
      adjustmentStatus: payload.adjustmentStatus,
      tradingDays: options.tradingDays,
      config: options.barConfig
    });
    findings = findings.concat(base.findings);

    /* --- Veraltete letzte Bar ------------------------------------- */
    var last = bars[bars.length - 1] && bars[bars.length - 1].date;
    var stale = last ? weekdaysBetween(last, today) : null;
    if (stale !== null && stale > cfg.maxStaleTradingDays) {
      findings.push(finding("error", "stale_last_bar",
        "Die letzte Bar ist vom " + last + " - rund " + stale + " Handelstage alt " +
        "(Schwelle " + cfg.maxStaleTradingDays + "). Der Titel wird nicht mehr aktuell " +
        "geliefert; jede daraus abgeleitete Kennzahl beschreibt die Vergangenheit."));
    }

    /* --- Zu kurze Historie ---------------------------------------- */
    var usable = base.stats ? base.stats.usable : 0;
    if (usable < cfg.minBarsUsable) {
      findings.push(finding("error", "insufficient_history",
        "Nur " + usable + " verwertbare Bars. Unter " + cfg.minBarsUsable +
        " laesst sich nichts rechnen, was ein Ergebnis waere."));
    } else if (usable < cfg.minBarsForFactors) {
      findings.push(finding("warning", "insufficient_history_for_factors",
        usable + " verwertbare Bars. SMA200 und 12-Monats-Momentum brauchen mindestens " +
        cfg.minBarsForFactors + "; sie bleiben fuer diesen Titel leer - mit Grund, nicht mit Null."));
    }

    /* --- Provenienz ------------------------------------------------ */
    var prov = payload.provenance || null;
    var hasProvider = !!(payload.provider || (prov && (prov.provider || prov.source)) ||
                         payload.dataSourceId ||
                         (bars[0] && bars[0].dataSourceId));
    if (!hasProvider) {
      findings.push(finding("error", "missing_provenance",
        "Die Reihe nennt keine Quelle. Eine Kursreihe ohne Herkunft laesst sich weder " +
        "pruefen noch lizenzrechtlich einordnen."));
    }
    if (!payload.adjustmentStatus) {
      findings.push(finding("warning", "missing_adjustment_status",
        "Die Reihe nennt keine Bereinigungsstufe. Ob sie fuer Total-Return-Kennzahlen " +
        "taugt, ist damit offen."));
    }

    /* --- Kapitalmassnahmen ----------------------------------------- */
    var splits = 0, dividends = 0, absurdSplits = 0, negativeDividends = 0;
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i];
      if (isNum(b.splitFactor) && b.splitFactor !== 1) {
        splits++;
        if (b.splitFactor > cfg.maxSplitRatio || b.splitFactor < cfg.minSplitRatio) {
          absurdSplits++;
          findings.push(finding("error", "implausible_split",
            "Splitfaktor " + b.splitFactor + " am " + b.date + " liegt ausserhalb jeder " +
            "plausiblen Kapitalmassnahme.", { date: b.date }));
        }
      }
      if (isNum(b.dividend) && b.dividend !== 0) {
        if (b.dividend < 0) {
          negativeDividends++;
          findings.push(finding("error", "negative_dividend",
            "Negative Ausschuettung " + b.dividend + " am " + b.date + ".", { date: b.date }));
        } else dividends++;
      }
    }

    /* --- Bereinigungssemantik -------------------------------------- */
    var adjustment = null;
    if (options.checkAdjustment !== false && base.bars.length > 1) {
      adjustment = validateAdjustmentConsistency(base.bars, {
        claimedStatus: payload.adjustmentStatus
      });
      findings = findings.concat(adjustment.findings);
    }

    var errors = findings.filter(function (f) { return f.severity === "error"; });
    var warnings = findings.filter(function (f) { return f.severity === "warning"; });

    var status = errors.length ? "FAIL" : warnings.length ? "WARNING" : "PASS";
    var statusReason = errors.length
      ? errors[0].code
      : warnings.length ? warnings[0].code : "clean";

    var first = bars[0] && bars[0].date;
    var historyYears = first && last
      ? Math.round((Date.parse(last) - Date.parse(first)) / 31557600000 * 10) / 10
      : null;

    return {
      status: status,
      statusReason: statusReason,
      findings: findings,
      metrics: {
        bars: bars.length,
        usable: usable,
        first: first || null,
        last: last || null,
        staleTradingDays: stale,
        historyYears: historyYears,
        splits: splits,
        dividends: dividends,
        implausibleSplits: absurdSplits,
        negativeDividends: negativeDividends,
        errors: errors.length,
        warnings: warnings.length,
        continuityBasis: base.stats ? base.stats.continuityBasis : null,
        adjustmentClaimed: adjustment ? adjustment.claimedStatus : null,
        adjustmentInferred: adjustment ? adjustment.inferredStatus : null,
        factorReady: usable >= cfg.minBarsForFactors && !errors.length
      }
    };
  }

  /** Beurteilt viele Reihen und zaehlt die Ergebnisse aus. */
  function assessBatch(payloadsById, options) {
    var results = {}, summary = { PASS: 0, WARNING: 0, FAIL: 0, UNAVAILABLE: 0 };
    var reasons = {};
    Object.keys(payloadsById || {}).forEach(function (id) {
      var r = assessSeries(payloadsById[id], options);
      results[id] = r;
      summary[r.status]++;
      reasons[r.statusReason] = (reasons[r.statusReason] || 0) + 1;
    });
    summary.total = Object.keys(results).length;
    return { results: results, summary: summary, reasons: reasons };
  }

  var api = { DEFAULTS: DEFAULTS, ASSESS_DEFAULTS: ASSESS_DEFAULTS,
              validateBars: validateBars, validateBatch: validateBatch,
              looksLikeSplit: looksLikeSplit, adjustmentFactors: adjustmentFactors,
              validateAdjustmentConsistency: validateAdjustmentConsistency,
              weekdaysBetween: weekdaysBetween,
              assessSeries: assessSeries, assessBatch: assessBatch };

  if (isNode) module.exports = api;
  else global.VUMarketQuality = api;
})(typeof window !== "undefined" ? window : globalThis);
