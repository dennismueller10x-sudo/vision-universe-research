/* =========================================================================
   VISION UNIVERSE — instrument-classification.js   (Tiingo Commercial, §7)

   Aus einer Zeile Anbieter-Stammdaten wird eine Instrumentenklasse.

   Warum das eine eigene Datei ist und keine Zeile im Importskript: die
   Frage "ist das eine Aktie?" entscheidet, was spaeter im Aktien-Screener
   auftaucht. Ein Vorzugspapier, ein Optionsschein oder ein Fonds, der als
   Aktie durchrutscht, erzeugt keine Fehlermeldung - er erzeugt eine
   Kennzahl, die niemand nachpruefen kann. Die Regel gehoert deshalb an
   eine Stelle, an der sie einzeln getestet wird.

   DIE WICHTIGSTE REGEL: UNKNOWN IST EIN ERGEBNIS.

   Wo die Beleglage fuer COMMON_STOCK nicht reicht, steht UNKNOWN - und
   UNKNOWN ist nicht screenerfaehig. Der umgekehrte Weg (im Zweifel Aktie)
   waere bequemer und waere genau der Fehler, den §7 verbietet.

   WAS DIESE DATEI NICHT KANN

   Tiingos Tickerliste (supported_tickers) traegt drei Felder, die etwas
   ueber die Gattung sagen: assetType ("Stock", "ETF", "Mutual Fund"),
   exchange und den Ticker selbst. Sie traegt KEINEN Namen und keinen
   Hinweis auf eine Hinterlegung (ADR).

   ADR laesst sich daraus nicht ableiten. Wer es trotzdem tut, raet. Diese
   Datei klassifiziert ADR deshalb ausschliesslich, wenn ein Name
   vorliegt und ihn ausspricht - und meldet sonst offen, dass die
   ADR-Trennung an dieser Zeile nicht geprueft wurde
   (adrEvidence: "unavailable"). Ein so eingestufter COMMON_STOCK kann ein
   ADR sein; das steht dann im Befund und nicht nur im Kommentar.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "instrument-classification-1.0.0";

  /* Die Klassen aus §7. OTHER ist die Sammelklasse fuer Gattungen, die
     erkannt, aber nicht einzeln gefuehrt werden (Units, Bezugsrechte);
     UNKNOWN ist das Eingestaendnis, nichts zu wissen. Die beiden zu
     verwechseln waere folgenreich: OTHER heisst "erkannt und nicht
     gewollt", UNKNOWN heisst "nicht erkannt". */
  var TYPES = ["COMMON_STOCK", "ADR", "PREFERRED", "ETF", "ETN", "FUND",
               "WARRANT", "OTHER", "UNKNOWN"];

  /* Nur COMMON_STOCK und ADR sind Aktien im Sinne des Screeners. ADR ist
     eine Aktie eines auslaendischen Emittenten in US-Hinterlegung - fuer
     Trend, Momentum und SMA verhaelt sie sich wie eine Aktie. Sie wird
     getrennt gefuehrt, weil Kapitalmassnahmen und Waehrung anders
     laufen, nicht weil sie aus dem Screener gehoert. */
  var SCREENER_ELIGIBLE = { COMMON_STOCK: true, ADR: true };

  /* Boersen, an denen ein US-Listing plausibel ist. Die Liste entscheidet
     nicht ueber die Gattung, sondern ueber das Land - und darueber, ob
     eine Zeile ohne weitere Angabe ueberhaupt als US-Aktie gelten darf. */
  var US_EXCHANGES = {
    "NASDAQ": "US", "NYSE": "US", "NYSE ARCA": "US", "NYSE MKT": "US",
    "AMEX": "US", "NYSE AMERICAN": "US", "BATS": "US", "IEX": "US",
    "OTC": "US", "PINK": "US", "OTCMKTS": "US", "NMFQS": "US",
    "NASDAQ GLOBAL SELECT": "US", "NASDAQ CAPITAL MARKET": "US",
    "NASDAQ GLOBAL MARKET": "US"
  };

  /* Ausserboerslich gehandelte Titel sind Aktien - aber sie sind nicht
     dieselbe Datenlage. Der Screener soll sie nicht stillschweigend
     mitzaehlen; er soll sie sehen koennen und ausschliessen duerfen. */
  /* Die Liste stammt aus der echten Tickerliste des Anbieters, nicht aus
     einer Vermutung: der erste Lauf ueber 108.572 Zeilen hat neben PINK
     und OTCMKTS auch OTCQB, OTCQX, OTCGREY, OTCBB, OTCCE, OTCD und EXPM
     gezeigt. Ohne sie galten rund 440 ausserboerslich gehandelte Titel
     als regulaer gelistet - kein Fehler mit lauter Wirkung, aber genau
     die Art Unschaerfe, die einen Screener unbrauchbar macht. */
  var OTC_EXCHANGES = {
    "OTC": true, "PINK": true, "OTCMKTS": true, "NMFQS": true,
    "OTCQB": true, "OTCQX": true, "OTCBB": true, "OTCGREY": true,
    "OTCCE": true, "OTCD": true, "EXPM": true
  };

  function norm(v) {
    return v === null || v === undefined ? "" : String(v).trim();
  }
  function upper(v) { return norm(v).toUpperCase(); }

  /**
   * Tickermuster, die eine Gattung ausdruecklich benennen.
   *
   * Tiingo schreibt Klassen und Sondergattungen mit Bindestrich:
   * BRK-B (Klasse B, eine gewoehnliche Aktie), BAC-PB (Vorzug),
   * XYZ-WT (Optionsschein), ABC-U (Unit), DEF-RT (Bezugsrecht).
   *
   * Ein einzelner Buchstabe nach dem Bindestrich ist eine AKTIENKLASSE
   * und keine andere Gattung - BRK-B ist eine Stammaktie. Genau daran
   * scheitert die naheliegende Regel "Bindestrich = Sonderfall".
   */
  function tickerPattern(ticker) {
    var t = upper(ticker);
    if (!t) return null;
    /* Vorzugsaktien: -P, -PA .. -PZ, -PRA. Nicht -P allein verwechseln
       mit einer Klasse "P": Tiingo nutzt P als Vorzugsmarker, und ein
       einzelner Klassenbuchstabe P kommt praktisch nicht vor. */
    if (/-P[A-Z]?$/.test(t) || /-PR[A-Z]?$/.test(t)) {
      return { type: "PREFERRED", basis: "tickerSuffix", marker: t.slice(t.lastIndexOf("-")) };
    }
    if (/-(WT|WS|W)$/.test(t)) {
      return { type: "WARRANT", basis: "tickerSuffix", marker: t.slice(t.lastIndexOf("-")) };
    }
    if (/-(U|UN)$/.test(t)) {
      return { type: "OTHER", basis: "tickerSuffix", marker: t.slice(t.lastIndexOf("-")),
               subtype: "UNIT" };
    }
    if (/-(R|RT)$/.test(t)) {
      return { type: "OTHER", basis: "tickerSuffix", marker: t.slice(t.lastIndexOf("-")),
               subtype: "RIGHT" };
    }
    /* Genau ein Buchstabe nach dem Bindestrich, der kein Marker von oben
       ist: Aktienklasse. Das ist ein positiver Befund, kein Restfall. */
    if (/-[A-Z]$/.test(t)) {
      return { type: null, basis: "shareClass", marker: t.slice(-2),
               shareClass: t.slice(-1) };
    }
    return null;
  }

  /* Namensmuster. Nur anwendbar, wenn ein Name vorliegt - und das ist bei
     der Tickerliste des Anbieters nicht der Fall. */
  var NAME_RULES = [
    { type: "ETN",       re: /\b(ETN|EXCHANGE[- ]TRADED NOTE)S?\b/i },
    { type: "ADR",       re: /\b(ADR|ADS|AMERICAN DEPOSITAR(Y|IES)|DEPOSITARY (SHARE|RECEIPT))/i },
    { type: "PREFERRED", re: /\b(PREFERRED|PFD|PREF\.)/i },
    { type: "WARRANT",   re: /\bWARRANTS?\b/i },
    { type: "FUND",      re: /\b(FUND|TRUST FUND|CLOSED[- ]END)\b/i },
    { type: "ETF",       re: /\b(ETF|INDEX FUND|SHARES? ETF)\b/i }
  ];

  function nameRule(name) {
    var n = norm(name);
    if (!n) return null;
    for (var i = 0; i < NAME_RULES.length; i++) {
      if (NAME_RULES[i].re.test(n)) {
        return { type: NAME_RULES[i].type, basis: "name" };
      }
    }
    return null;
  }

  /**
   * Klassifiziert eine Stammdatenzeile.
   *
   * @param {object} row
   *   ticker      Pflicht.
   *   assetType   Anbieterangabe ("Stock", "ETF", "Mutual Fund", ...).
   *   exchange    Boersenkuerzel des Anbieters.
   *   name        Optional. Ohne ihn bleibt die ADR-Trennung ungeprueft.
   *   currency    Optional (Tiingo: priceCurrency).
   *   startDate   Optional. Erster Handelstag laut Anbieter.
   *   endDate     Optional. Letzter Handelstag laut Anbieter.
   * @param {object} [opts] {today: "YYYY-MM-DD", staleDays: number}
   * @returns {object} Klassifikationsbefund.
   */
  function classify(row, opts) {
    opts = opts || {};
    row = row || {};
    var today = opts.today || new Date().toISOString().slice(0, 10);
    /* Wann gilt ein Titel als nicht mehr aktiv? Tiingo fuehrt delistete
       Titel mit einem endDate in der Vergangenheit weiter. 30 Kalendertage
       sind grosszuegig - ein Titel, der einen Monat nicht gehandelt hat,
       ist kein laufendes Listing mehr. */
    var staleDays = opts.staleDays === undefined ? 30 : opts.staleDays;

    var ticker = upper(row.ticker);
    var exchange = upper(row.exchange);
    var assetType = norm(row.assetType);
    var reasons = [];

    if (!ticker) {
      return finding("UNKNOWN", "LOW", ["Keine Tickerangabe."], row, null, today, staleDays, opts);
    }

    var pattern = tickerPattern(ticker);
    var byName = nameRule(row.name);
    var at = upper(assetType);

    var type = null, confidence = null;

    /* 1. Der Anbieter selbst, wo er eindeutig ist. */
    if (at === "ETF") {
      type = "ETF"; confidence = "HIGH";
      reasons.push("Anbieter meldet assetType=ETF.");
      /* ETN wird von Tiingo als ETF gefuehrt. Nur der Name trennt sie. */
      if (byName && byName.type === "ETN") {
        type = "ETN";
        reasons.push("Name weist das Papier als Exchange Traded Note aus.");
      }
    } else if (at === "MUTUAL FUND" || at === "FUND") {
      type = "FUND"; confidence = "HIGH";
      reasons.push("Anbieter meldet assetType=" + assetType + ".");
    } else if (at === "STOCK") {
      /* 2. Sondergattungen schlagen "Stock". Der Anbieter fuehrt
         Vorzuege und Optionsscheine unter demselben assetType wie
         Stammaktien - das Tickermuster ist hier die genauere Angabe. */
      if (pattern && pattern.type) {
        type = pattern.type; confidence = "MEDIUM";
        reasons.push("Tickermuster " + pattern.marker + " weist auf " + pattern.type + " hin " +
                     "(Anbieter meldet unspezifisch assetType=Stock).");
        if (pattern.subtype) reasons.push("Untergattung: " + pattern.subtype + ".");
      } else if (byName && byName.type !== "ETF" && byName.type !== "FUND") {
        type = byName.type; confidence = "HIGH";
        reasons.push("Name weist das Papier als " + byName.type + " aus.");
      } else {
        type = "COMMON_STOCK"; confidence = "HIGH";
        reasons.push("Anbieter meldet assetType=Stock, kein Sondergattungsmuster im Ticker.");
        if (pattern && pattern.basis === "shareClass") {
          reasons.push("Aktienklasse " + pattern.shareClass + " (Klassenbuchstabe, keine eigene Gattung).");
        }
      }
    } else if (at === "") {
      /* 3. Ohne Anbieterangabe: nur der Name kann noch etwas belegen.
         Sonst UNKNOWN - und ausdruecklich nicht COMMON_STOCK. */
      if (byName) {
        type = byName.type; confidence = "MEDIUM";
        reasons.push("Keine assetType-Angabe des Anbieters; der Name weist auf " + byName.type + " hin.");
      } else {
        type = "UNKNOWN"; confidence = "LOW";
        reasons.push("Weder assetType noch Name. Die Gattung ist nicht bestimmbar; " +
                     "als Aktie gilt der Titel damit ausdruecklich NICHT.");
      }
    } else {
      type = "OTHER"; confidence = "MEDIUM";
      reasons.push("Anbieter meldet assetType=" + assetType + " - keine der gefuehrten Gattungen.");
    }

    /* Boerse und Land. Ohne bekannte Boerse bleibt das Land offen; eine
       Zeile ohne Land wird nicht stillschweigend zu einer US-Aktie. */
    var country = US_EXCHANGES[exchange] || null;
    if (!country && exchange) {
      reasons.push("Boerse '" + row.exchange + "' ist nicht als US-Handelsplatz gefuehrt; " +
                   "das Land bleibt offen.");
    }

    /* ADR-Beleglage. Ohne Namen ist sie schlicht nicht vorhanden, und das
       steht im Befund - nicht als Warnung, sondern als Feld. */
    var adrEvidence = norm(row.name)
      ? (type === "ADR" ? "name" : "nameChecked")
      : "unavailable";

    return finding(type, confidence, reasons, row, pattern, today, staleDays,
                   Object.assign({}, opts, { country: country, exchange: exchange,
                                             adrEvidence: adrEvidence }));
  }

  function finding(type, confidence, reasons, row, pattern, today, staleDays, ctx) {
    ctx = ctx || {};
    var exchange = ctx.exchange !== undefined ? ctx.exchange : upper(row.exchange);
    var endDate = norm(row.endDate).slice(0, 10);
    var startDate = norm(row.startDate).slice(0, 10);

    /* Aktiv oder nicht. Die Angabe ist eine Ableitung aus endDate und
       traegt ihre Grundlage mit - "active: false" ohne Begruendung waere
       im Screener nicht nachpruefbar. */
    var active = null, activeBasis = "unknown";
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      var diff = Math.round(
        (Date.parse(today + "T00:00:00Z") - Date.parse(endDate + "T00:00:00Z")) / 86400000);
      active = diff <= staleDays;
      activeBasis = "endDate:" + endDate + " (" + diff + " Tage alt, Schwelle " + staleDays + ")";
    } else {
      activeBasis = "kein endDate vom Anbieter";
    }

    var screenerEligible = SCREENER_ELIGIBLE[type] === true && active !== false;
    var screenerReason;
    if (SCREENER_ELIGIBLE[type] !== true) {
      screenerReason = "Gattung " + type + " ist keine Aktie im Sinne des Aktien-Screeners.";
    } else if (active === false) {
      screenerEligible = false;
      screenerReason = "Listing gilt als beendet (" + activeBasis + ").";
    } else if (active === null) {
      /* Kein endDate heisst nicht "inaktiv" - Tiingo fuehrt laufende
         Titel oft ohne. Der Titel bleibt screenerfaehig, und die Luecke
         steht im Befund. */
      screenerReason = "Gattung ist screenerfaehig; Aktivitaet nicht aus Anbieterdaten belegbar.";
    } else {
      screenerReason = "Gattung ist screenerfaehig und das Listing gilt als laufend.";
    }

    return {
      version: VERSION,
      ticker: upper(row.ticker) || null,
      instrumentType: type,
      confidence: confidence,
      screenerEligible: screenerEligible,
      screenerReason: screenerReason,
      shareClass: pattern && pattern.shareClass ? pattern.shareClass : null,
      subtype: pattern && pattern.subtype ? pattern.subtype : null,
      exchange: norm(row.exchange) || null,
      country: ctx.country !== undefined ? ctx.country : null,
      otc: OTC_EXCHANGES[exchange] === true,
      currency: upper(row.currency || row.priceCurrency) || null,
      assetType: norm(row.assetType) || null,
      active: active,
      activeBasis: activeBasis,
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null,
      endDate: /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null,
      adrEvidence: ctx.adrEvidence || "unavailable",
      reasons: reasons
    };
  }

  /**
   * Klassifiziert eine ganze Liste und zaehlt aus.
   *
   * Die Bilanz ist der eigentliche Zweck: bei 30.000 Zeilen liest niemand
   * die Einzelbefunde, und ohne Auszaehlung merkt auch niemand, wenn eine
   * Regel die Haelfte des Universums in UNKNOWN kippt.
   */
  function classifyAll(rows, opts) {
    var out = [], counts = {}, eligible = 0, byExchange = {};
    TYPES.forEach(function (t) { counts[t] = 0; });
    (rows || []).forEach(function (row) {
      var c = classify(row, opts);
      out.push(c);
      counts[c.instrumentType] = (counts[c.instrumentType] || 0) + 1;
      if (c.screenerEligible) {
        eligible++;
        byExchange[c.exchange || "UNKNOWN"] = (byExchange[c.exchange || "UNKNOWN"] || 0) + 1;
      }
    });
    return {
      version: VERSION,
      total: out.length,
      counts: counts,
      screenerEligible: eligible,
      screenerEligibleByExchange: byExchange,
      classifications: out
    };
  }

  var api = {
    VERSION: VERSION,
    TYPES: TYPES,
    US_EXCHANGES: US_EXCHANGES,
    OTC_EXCHANGES: OTC_EXCHANGES,
    tickerPattern: tickerPattern,
    classify: classify,
    classifyAll: classifyAll
  };

  if (isNode) module.exports = api;
  else { global.VUInstrumentClassification = api; }
})(typeof window !== "undefined" ? window : globalThis);
