/* =========================================================================
   VISION UNIVERSE — us-security-master.js

   Der US-Wertpapierstamm: Entdeckung, Klassifikation, Abgleich.

   WOZU ES DIESE DATEI GIBT, OBWOHL ES instrument-classification.js GIBT

   instrument-classification.js beantwortet eine Frage: "Ist das eine
   Aktie im Sinne des Screeners?" Sie hat neun Klassen und ist bewusst
   grob. Fuer die Auswahl eines Gate-Universums reicht das.

   Diese Datei beantwortet eine andere Frage: "Welche Papiere fuehrt der
   Anbieter fuer die USA, welche davon haben wir schon, und was ist das,
   was wir schon haben, eigentlich?" Dafuer braucht es die feinere
   Aufteilung - ein REIT und ein SPAC sind beide keine gewoehnliche
   Stammaktie, aber aus verschiedenen Gruenden, und wer sie in denselben
   Topf wirft, kann spaeter nicht mehr entscheiden, welchen er oeffnen
   will.

   DIE BEIDEN REGELN, DIE ALLES ANDERE UEBERSTIMMEN

   1. NICHTS WIRD GELOESCHT. Der Bestand ist geliefert. Ein Klassierer,
      der ihn fuer falsch haelt, ist ein Verdacht und keine Vollmacht.
      Jeder Bestandstitel bekommt eine Zeile, behaelt baseline_member
      und wird schlimmstenfalls REVIEW. buildSecurityMaster() prueft
      diese Zusage am Ergebnis und wirft, wenn sie verletzt ist - eine
      kaputte Regel soll den Lauf anhalten und nicht den Bestand
      verkleinern.

   2. UNKNOWN IST EIN ERGEBNIS. Wo die Beleglage nicht reicht, steht
      UNKNOWN oder REVIEW. Der bequeme Weg (im Zweifel Stammaktie) waere
      genau der Fehler, den dieser Abgleich aufdecken soll.

   WAS DIE ANBIETERDATEN NICHT HERGEBEN

   Tiingos supported_tickers traegt sechs Spalten: ticker, exchange,
   assetType, priceCurrency, startDate, endDate. KEINEN NAMEN.

   Ohne Namen sind ADR, REIT, SPAC, TRUST, ETN, ETP, CEF und INDEX aus
   einer Zeile dieser Liste nicht zu bestimmen. Diese Datei raet dann
   nicht, sondern traegt nameEvidence: "unavailable" ein und meldet die
   betreffenden Zahlen als UNTERGRENZE. Wer sie als Zaehlung liest, liest
   falsch - und der Bericht sagt das an jeder Stelle, an der es zaehlt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var Base = isNode
    ? require("./instrument-classification.js")
    : global.VUInstrumentClassification;

  /* Artifact schema follows the currently published main baseline.
     Classification rules retain separate provenance; the combined rule
     revision includes main's DEBT exclusions and the accepted Tiingo 2.0
     classification safeguards. Old artifact files remain readable. */
  var VERSION = "us-security-master-1.3.0";
  var CLASSIFICATION_RULE_VERSION = "us-security-master-rules-1.3.3";

  /* Die Gattungen. Reihenfolge ist die Berichtsreihenfolge. */
  var CLASSES = [
    "EQUITY_COMMON", "ADR", "REIT", "SPAC", "PREFERRED", "TRUST",
    "ETF", "ETN", "ETP", "MUTUAL_FUND", "CEF", "INDEX",
    "WARRANT", "UNIT", "RIGHT", "DEBT", "TEST_SECURITY", "OTHER", "UNKNOWN"
  ];

  /* Die Politik aus der Aufgabenstellung, als Daten und nicht als
     Verzweigung im Code: nur so laesst sie sich in einem Test lesen und
     spaeter aendern, ohne den Klassierer anzufassen. */
  var POLICY = {
    /* Zaehlt in die Primaerzahl "US Common Equity". */
    INCLUDE: ["EQUITY_COMMON"],
    /* Aktienartig, aber getrennt zu fuehren - nicht in der Primaerzahl. */
    SEPARATE: ["ADR", "REIT", "SPAC", "TRUST", "PREFERRED"],
    /* Keine Aktien. Bleiben im Stamm, zaehlen aber nirgends mit. */
    EXCLUDE: ["ETF", "ETN", "ETP", "MUTUAL_FUND", "CEF", "INDEX",
              "WARRANT", "UNIT", "RIGHT", "DEBT", "TEST_SECURITY"]
  };

  function policyBucket(cls) {
    if (POLICY.INCLUDE.indexOf(cls) >= 0) return "INCLUDE";
    if (POLICY.SEPARATE.indexOf(cls) >= 0) return "SEPARATE";
    if (POLICY.EXCLUDE.indexOf(cls) >= 0) return "EXCLUDE";
    return "UNDECIDED";
  }

  /* Handelsplaetze, an denen ein regulaeres US-Listing stattfindet.
     Getrennt von Base.US_EXCHANGES, weil dort auch die
     Ausserboersen-Kuerzel als "US" gefuehrt sind: fuer die Landfrage ist
     das richtig, fuer die Frage "regulaer gelistet?" nicht. */
  var US_PRIMARY_EXCHANGES = {
    "NASDAQ": true, "NYSE": true, "NYSE ARCA": true, "NYSE MKT": true,
    "NYSE AMERICAN": true, "AMEX": true, "BATS": true, "IEX": true,
    "NASDAQ GLOBAL SELECT": true, "NASDAQ CAPITAL MARKET": true,
    "NASDAQ GLOBAL MARKET": true
  };

  function norm(v) { return v === null || v === undefined ? "" : String(v).trim(); }
  function upper(v) { return norm(v).toUpperCase(); }

  /* ------------------------------------------------------------ TICKER

     Tiingo schreibt Sondergattungen als Suffix hinter einem Bindestrich.
     Der Basis-Klassierer kennt die ZWEITEILIGE Schreibweise (BAC-PB).
     Er kennt die DREITEILIGE nicht (BAC-P-E) - und genau die benutzt
     Tiingo fuer die Vorzugsserien der grossen Emittenten.

     Das ist keine Theorie: im gelieferten Bestand stehen 308 Ticker der
     Form XXX-P-Y als COMMON_STOCK. Sie sind Vorzuege.

     Diese Funktion ergaenzt die dreiteilige Form. Sie ersetzt den
     Basis-Klassierer nicht und aendert ihn nicht - der waehlt die
     bestehenden Gate-Universen aus, und eine Regelaenderung dort waere
     eine ruecklaufende Aenderung am Bestand. */
  function tickerMarker(ticker) {
    var t = upper(ticker);
    if (!t) return null;

    /* Dreiteilig: STAMM-MARKER-SERIE. */
    var three = /^(.+)-(P|PR|W|WS|WT|U|UN|R|RT)-([A-Z0-9]{1,3})$/.exec(t);
    if (three) {
      var m3 = three[2];
      if (m3 === "P" || m3 === "PR") {
        return { type: "PREFERRED", basis: "tickerSuffix3", marker: "-" + m3 + "-" + three[3],
                 root: three[1], series: three[3] };
      }
      if (m3 === "W" || m3 === "WS" || m3 === "WT") {
        return { type: "WARRANT", basis: "tickerSuffix3", marker: "-" + m3 + "-" + three[3],
                 root: three[1], series: three[3] };
      }
      if (m3 === "U" || m3 === "UN") {
        return { type: "UNIT", basis: "tickerSuffix3", marker: "-" + m3 + "-" + three[3],
                 root: three[1], series: three[3] };
      }
      return { type: "RIGHT", basis: "tickerSuffix3", marker: "-" + m3 + "-" + three[3],
               root: three[1], series: three[3] };
    }

    /* Zweiteilig: der Basis-Klassierer kennt diese Faelle bereits. Sein
       Befund wird uebernommen und nur auf die feinere Gattungsliste
       abgebildet - UNIT und RIGHT fuehrt er als OTHER mit subtype. */
    var base = Base.tickerPattern(t);
    if (!base) return null;
    if (base.type === "PREFERRED" || base.type === "WARRANT") {
      return { type: base.type, basis: base.basis, marker: base.marker,
               root: t.slice(0, t.lastIndexOf("-")), series: null };
    }
    if (base.subtype === "UNIT" || base.subtype === "RIGHT") {
      return { type: base.subtype, basis: base.basis, marker: base.marker,
               root: t.slice(0, t.lastIndexOf("-")), series: null };
    }
    if (base.basis === "shareClass") {
      return { type: null, basis: "shareClass", marker: base.marker,
               root: t.slice(0, t.lastIndexOf("-")), shareClass: base.shareClass };
    }
    return null;
  }

  /* ------------------------------- NASDAQ OHNE BINDESTRICH

     Die zweite Luecke, gefunden im Erweiterungslauf 34574226888: 583 der
     2.119 Neuzugaenge waren keine Stammaktien.

     Tiingo schreibt Sondergattungen mit Bindestrich. Die NASDAQ tut das
     NICHT: sie haengt einen fuenften Buchstaben an einen vierstelligen
     Stamm. AACB ist die Aktie, AACBU die Unit, AACBW der Optionsschein,
     AACBR das Bezugsrecht.

     DER SUFFIX ALLEIN REICHT NICHT, und das ist der Kern dieser Regel.
     Es gibt echte vierstellige Gesellschaften, deren Name zufaellig auf
     W, R oder U endet. Wer allein nach dem letzten Buchstaben geht,
     wirft sie mit hinaus.

     Der Beleg ist der STAMM: existiert der vierstellige Rumpf als
     eigenes Listing, dann ist der fuenfstellige Ticker mit hoher
     Wahrscheinlichkeit sein Derivat. 471 der 583 gefundenen Faelle
     tragen ihren Stamm - das SPAC-Muster.

     Ohne diesen Beleg bleibt es ein Verdacht: die Zeile wird als
     Verdachtsfall gefuehrt und landet in REVIEW, nicht im Ausschluss. */
  /* P/O/N/M: erstes bis viertes Vorzugspapier (NASDAQ-Suffixcode). Gefunden
     in der Screenshot-Pruefung der fundamentalen Sammlungen: FCNCP, FCNCO,
     FCNCN (First Citizens), AGNCN/AGNCM/AGNCO/AGNCP, CHSCP/CHSCO/CHSCN/CHSCM
     standen als Stammaktien in "Qualitaet zum vernuenftigen Preis" - 115
     Titel des Produktuniversums, ausnahmslos Vorzuege. */
  var FIFTH_LETTER = { W: "WARRANT", R: "RIGHT", U: "UNIT", P: "PREFERRED", O: "PREFERRED", N: "PREFERRED", M: "PREFERRED" };

  function nasdaqFifthLetter(ticker, listedRoots) {
    var t = upper(ticker);
    /* Genau fuenf Zeichen, keine Sonderzeichen, letzter Buchstabe W/R/U. */
    if (!/^[A-Z]{5}$/.test(t)) return null;
    var kind = FIFTH_LETTER[t.charAt(4)];
    if (!kind) return null;
    var root = t.slice(0, 4);
    var rootListed = !!(listedRoots && listedRoots[root]);
    return {
      type: kind, basis: rootListed ? "nasdaqFifthLetterWithListedRoot" : "nasdaqFifthLetterOnly",
      marker: t.charAt(4), root: root, rootListed: rootListed, series: null
    };
  }

  /* Testpapiere des Anbieters. Eng gefasst: ein Ticker, der TEST mit
     hoechstens einem fuehrenden Buchstaben und optionaler Klasse
     enthaelt. Weiter gefasst wuerde die Regel echte Gesellschaften
     treffen, und ein faelschlich ausgeschlossenes Unternehmen ist
     teurer als ein durchgerutschtes Testpapier. */
  function looksLikeTestSecurity(ticker, name) {
    var t = upper(ticker);
    if (/^[A-Z]?TEST[0-9]?(-[A-Z])?$/.test(t)) return true;
    /* Die Testsymbole der NASDAQ (ZAZZT ... ZZZZT, ZVZZT) und die
       Symbologie-Tests der Boersen: eine feste Form, kein Unternehmen. */
    if (/^Z[A-Z]ZZT$/.test(t) || /^ZXYZ(-[A-Z])?$/.test(t) || t === "ZTST" || t === "ZBZX" || t === "ZVV") return true;
    /* Der Name des Anbieters sagt es selbst ("NASDAQ TEST STOCK",
       "LISTED TEST SYMBOL", "NYSE LISTED TEST", "Bats Listed Test",
       "Super Montage IPO X Tst Security"). Eng gefasst auf TEST als
       eigenes Wort neben STOCK/SYMBOL/SECURITY/LISTED. */
    var n = norm(name);
    if (n && /\b(TEST (STOCK|SYMBOL|SECURITY|ISSUE)|LISTED TEST|SYMBOLOGY TEST|TST SECURITY)\b/i.test(n)) return true;
    return false;
  }

  /* Der Stammbeleg. Aus einer Menge von Zeilen (Anbieterliste UND
     gelieferter Bestand) wird die Menge der eigenstaendig gelisteten
     Kurzticker gebildet. Nur diese Menge kann den fuenften Buchstaben
     belegen; ohne sie ist jede Fuenfbuchstaben-Regel ein Suffixraten.

     Aufgenommen wird, was selbst ein Stamm sein kann: ein bis vier
     Grossbuchstaben ohne Sonderzeichen. Ein Vorzug (BAC-PB) ist kein
     Stamm, ein Index ($SPX) auch nicht. */
  function collectListedRoots() {
    var roots = {};
    for (var a = 0; a < arguments.length; a++) {
      var list = arguments[a];
      if (!list || !list.length) continue;
      for (var i = 0; i < list.length; i++) {
        var t = upper(list[i] && list[i].ticker);
        if (/^[A-Z]{1,4}$/.test(t)) roots[t] = true;
      }
    }
    return roots;
  }

  /* Indexsymbole. Tiingo fuehrt sie mit fuehrendem $ oder ^; beides ist
     an einem Ticker eindeutig und braucht keinen Namen. */
  function looksLikeIndex(ticker) {
    var t = upper(ticker);
    return t.charAt(0) === "$" || t.charAt(0) === "^";
  }

  /* ------------------------------------------------------------- NAME

     Nur anwendbar, wenn ein Name vorliegt. Die Reihenfolge ist die
     Entscheidungsreihenfolge: ETN vor ETF (eine Note nennt sich oft
     zugleich Exchange Traded), REIT vor TRUST (jeder REIT traegt TRUST
     im Namen, umgekehrt gilt das nicht), CEF vor FUND. */
  var NAME_RULES = [
    { type: "INDEX",       re: /\b(INDEX|IDX)\b/i },
    { type: "ETN",         re: /\b(ETN|EXCHANGE[- ]TRADED NOTES?)\b/i },
    { type: "ETP",         re: /\b(ETP|EXCHANGE[- ]TRADED (PRODUCT|COMMODIT(Y|IES))S?)\b/i },
    { type: "CEF",         re: /\b(CLOSED[- ]END|CEF)\b/i },
    /* Schuldverschreibungen ("Baby Bonds"), die der Anbieter als "Stock"
       fuehrt (02.10.2026): "T-Mobile US Inc 5.500 Senior Notes due 2070",
       "Presurance Holdings Inc Sr Nt", "Maiden Holdings ... 775 Nts 12012043".
       Eine Forderung gegen den Emittenten, kein Anteil - Eigenkapital-
       Kennzahlen gelten fuer sie nicht. Nur ausdrueckliche Formen: ein Rang
       (Senior/Sr/Subordinated/Junior) vor Notes/Nt/Debentures/Bonds, "Notes
       due", "Debentures", der Kupon vor "Notes" oder die Abkuerzung "Nts".
       Absichtlich NICHT "Bond" allein: "Columbia Core Bond ETF" ist ein
       Fonds (die ETF-Regel greift), "Our Bond, Inc." eine Firma. */
    { type: "DEBT",        re: /\b(?:(?:SENIOR|SR|SUBORDINATED|SUB|JUNIOR|JR)\.?\s+(?:SECURED\s+|UNSECURED\s+)?(?:NOTES?|NTS?|DEBENTURES?|BONDS?)|NOTES?\s+DUE|DEBENTURES?|BABY\s+BONDS?|NTS|\d+(?:\.\d+)?\s?%?\s+(?:FIXED[- ]RATE\s+)?(?:SENIOR\s+|SUBORDINATED\s+)?NOTES?)\b/i },
    /* Die Form des Papiers vor der Art des Emittenten: "Centurion
       Acquisition Corp - Units" ist eine Unit (eines SPAC), "US Bancorp
       Depositary Shares ... Pfd" ein Vorzugspapier (kein ADR). */
    { type: "PREFERRED",   re: /\b(PREFERRED(?!\s+BANK\b)|PFD|PREF\.)/i },
    { type: "WARRANT",     re: /\bWARRANTS?\b/i },
    { type: "RIGHT",       re: /\bRIGHTS?\b/i },
    { type: "UNIT",        re: /\bUNITS?\b/i },
    { type: "ADR",         re: /\b(ADR|ADS|AMERICAN DEPOSIT[AO]R(Y|IES)|DEPOSIT[AO]RY RECEIPTS?)\b/i },
    { type: "UNKNOWN",     re: /\bDEPOSIT[AO]RY SHARES?\b/i },
    { type: "REIT",        re: /\b(REIT|REAL ESTATE INVESTMENT TRUST)\b/i },
    { type: "SPAC",        re: /\b(SPAC|ACQUISITION CORP|ACQUISITION COMPANY|BLANK CHECK)\b/i },
    { type: "ETF",         re: /\b(ETF|INDEX FUND|SHARES? ETF)\b/i },
    { type: "MUTUAL_FUND", re: /\b(MUTUAL FUND|FUND|PORTFOLIO)\b/i },
    { type: "TRUST",       re: /\bTRUSTS?\b/i }
  ];

  function nameRule(name) {
    var n = norm(name);
    if (!n) return null;
    for (var i = 0; i < NAME_RULES.length; i++) {
      if (NAME_RULES[i].re.test(n)) return { type: NAME_RULES[i].type, basis: "name" };
    }
    return null;
  }

  /* Gattungen, die sich OHNE Namen grundsaetzlich nicht von einer
     Stammaktie trennen lassen. Ihre Zahlen sind Untergrenzen, solange
     der Anbieter keinen Namen liefert - das steht als Feld im Befund und
     nicht nur in dieser Bemerkung. */
  var NAME_ONLY_CLASSES = ["ADR", "REIT", "SPAC", "TRUST", "ETN", "ETP", "CEF", "DEBT"];

  /**
   * Klassifiziert eine Anbieterzeile in die feine Gattungsliste.
   *
   * @param {object} row  ticker (Pflicht), exchange, assetType, name,
   *                      currency|priceCurrency, startDate, endDate.
   * @param {object} [opts] {today, staleDays}
   * @returns {object} Befund.
   */
  function classifySecurity(row, opts) {
    opts = opts || {};
    row = row || {};
    var today = opts.today || new Date().toISOString().slice(0, 10);

    var base = Base.classify(row, { today: today, staleDays: opts.staleDays });

    /* Aktivitaet. Der Basis-Klassierer leitet sie aus endDate ab und
       meldet null, wo der Anbieter kein endDate fuehrt. Ein Aufrufer,
       der es besser weiss - der gelieferte Bestand traegt ein eigenes
       active-Feld -, darf das ausfuellen. Ausdruecklich NUR die Luecke:
       ein geliefertes true ueberschreibt kein abgeleitetes false, sonst
       koennte ein alter Bestandsstand ein beendetes Listing am Leben
       halten.

       Der Nachtrag muss VOR der Eignungspruefung stehen. Stuende er
       danach, traege ein beendetes Listing active_status INACTIVE und
       trotzdem eligible_us_equity true - genau das war der erste Lauf. */
    var active = base.active;
    var activeBasis = base.activeBasis;
    if (active === null && typeof row.active === "boolean") {
      active = row.active;
      activeBasis = "callerSupplied:active=" + row.active;
    }

    var ticker = upper(row.ticker);
    var exchange = upper(row.exchange);
    var name = norm(row.name);
    var reasons = [];
    var flags = [];

    var marker = tickerMarker(ticker);
    var fifth = nasdaqFifthLetter(ticker, opts.listedRoots);
    var byName = nameRule(name);
    var byDescription = Base.securityDescriptionRule(row.providerDescription || row.description, row.name);
    var bareDepositary = /\bDEPOSIT[AO]RY SHARES?\b/i.test(name) &&
      !/\b(ADR|ADS|AMERICAN DEPOSIT[AO]R(Y|IES)|DEPOSIT[AO]RY RECEIPTS?)\b/i.test(name);

    /* 1. Grobklasse aus dem Basis-Klassierer uebernehmen. */
    var cls, confidence;
    switch (base.instrumentType) {
      case "COMMON_STOCK": cls = "EQUITY_COMMON"; confidence = "HIGH"; break;
      case "ADR":          cls = "ADR";           confidence = "HIGH"; break;
      case "PREFERRED":    cls = "PREFERRED";     confidence = "MEDIUM"; break;
      case "ETF":          cls = "ETF";           confidence = "HIGH"; break;
      case "ETN":          cls = "ETN";           confidence = "HIGH"; break;
      case "FUND":         cls = "MUTUAL_FUND";   confidence = "HIGH"; break;
      case "WARRANT":      cls = "WARRANT";       confidence = "MEDIUM"; break;
      case "OTHER":
        cls = base.subtype === "UNIT" ? "UNIT" : base.subtype === "RIGHT" ? "RIGHT" : "OTHER";
        confidence = base.subtype ? "MEDIUM" : "LOW";
        break;
      default:             cls = "UNKNOWN";       confidence = "LOW"; break;
    }
    reasons.push("Basisklassifikation " + base.instrumentType + " (" + Base.VERSION + ").");

    /* 2. Testpapier des Anbieters. Es ist kein Wertpapier und gehoert in
       keine Zaehlung. */
    if (looksLikeTestSecurity(ticker, name)) {
      cls = "TEST_SECURITY"; confidence = "HIGH";
      reasons.push("Tickerform oder Anbietername weist das Papier als Testeintrag der Boerse aus.");
      flags.push("PROVIDER_TEST_SECURITY");
    } else if (looksLikeIndex(ticker)) {
      cls = "INDEX"; confidence = "HIGH";
      reasons.push("Tickerpraefix '" + ticker.charAt(0) + "' weist das Symbol als Index aus.");
    } else if (fifth && (cls === "EQUITY_COMMON" || cls === "UNKNOWN" && bareDepositary)) {
      /* Der fuenfte Buchstabe der NASDAQ. Mit Stammbeleg ist es ein
         Befund, ohne ihn ein Verdacht - und ein Verdacht wird als
         solcher gefuehrt, nicht als Ausschluss. */
      cls = fifth.type;
      var nasdaqVenue = exchange.indexOf("NASDAQ") === 0;
      var explicitCommonName = /\b(COMMON (STOCK|SHARES?)|ORDINARY SHARES?)\b/i.test(name);
      if (fifth.rootListed && nasdaqVenue && !explicitCommonName) {
        confidence = "HIGH";
        reasons.push("Fuenfstelliger NASDAQ-Ticker auf '" + fifth.marker + "'; der vierstellige " +
                     "Stamm " + fifth.root + " ist eigenstaendig gelistet - " + fifth.type + ".");
        flags.push("NASDAQ_FIFTH_LETTER_ROOT_LISTED");
      } else {
        confidence = "LOW";
        reasons.push("Fuenfstelliger Ticker auf '" + fifth.marker + "'; Stamm " + fifth.root +
                     (fifth.rootListed ? " ist gelistet, aber weiterer Beleg widerspricht der Suffixregel." : " ist NICHT gelistet.") +
                     " Der Suffix allein belegt die Gattung nicht.");
        flags.push("NASDAQ_FIFTH_LETTER_UNCONFIRMED");
        if (!nasdaqVenue) {
          flags.push("NASDAQ_FIFTH_LETTER_VENUE_UNCONFIRMED");
          reasons.push("NASDAQ suffix convention is unconfirmed on venue " + exchange + ".");
        }
        if (explicitCommonName) {
          flags.push("NASDAQ_FIFTH_LETTER_COMMON_NAME_CONFLICT");
          reasons.push("Provider name explicitly identifies common/ordinary shares; a shared ticker root alone cannot override it.");
        }
      }
    } else if (marker && marker.type && marker.basis === "tickerSuffix3") {
      /* 3. Die dreiteilige Schreibweise. Sie ist der Grund, warum es
         diese Datei gibt: der Basis-Klassierer sieht hier nur eine
         Aktienklasse und laesst einen Vorzug als Stammaktie durch. */
      if (cls !== marker.type) {
        flags.push("BASE_CLASSIFIER_MISSED_SUFFIX");
        reasons.push("Basisklassierer meldete " + cls + "; das dreiteilige Tickersuffix " +
                     marker.marker + " weist auf " + marker.type + " hin.");
      }
      cls = marker.type; confidence = "MEDIUM";
    } else if (marker && marker.type && cls === "EQUITY_COMMON") {
      cls = marker.type; confidence = "MEDIUM";
      reasons.push("Tickersuffix " + marker.marker + " weist auf " + marker.type + " hin.");
    }

    /* 4. Der Name, wo einer vorliegt. Er ist die genauere Angabe fuer
       genau die Gattungen, die aus Ticker und assetType nicht folgen. */
    if (byName) {
      /* Issuer metadata (a REIT, trust or depositary issuer) cannot
         change a separately evidenced preferred/warrant/unit/right into
         common equity or an ADR. The security form outranks its issuer. */
      var securityForm = ["PREFERRED", "WARRANT", "UNIT", "RIGHT", "DEBT"].indexOf(cls) >= 0;
      var issuerClass = NAME_ONLY_CLASSES.indexOf(byName.type) >= 0;
      if (byName.type === "DEBT" && cls !== "DEBT") {
        // Notes/debentures name the security itself, not its issuer.
        // Retain main's explicit debt evidence over a ticker-form guess.
        reasons.push("Name weist das Papier als DEBT aus (Basisbefund war " + cls + ").");
        cls = "DEBT"; confidence = "HIGH";
      } else if (securityForm && issuerClass && byName.type !== cls) {
        reasons.push("Security form " + cls + " retained over issuer name classification " + byName.type + ".");
      } else if (byName.type !== cls && issuerClass) {
        reasons.push("Name weist das Papier als " + byName.type + " aus (Basisbefund war " + cls + ").");
        cls = byName.type; confidence = "HIGH";
      } else if (byName.type === "CEF" && cls === "MUTUAL_FUND") {
        cls = "CEF"; confidence = "HIGH";
        reasons.push("Name weist den Fonds als geschlossen aus.");
      } else if (byName.type === cls) {
        confidence = "HIGH";
        reasons.push("Name bestaetigt die Gattung " + cls + ".");
      }
    }

    if (byDescription && ["PREFERRED", "WARRANT", "UNIT", "RIGHT", "DEBT", "TEST_SECURITY", "INDEX", "ETF", "ETN"].indexOf(cls) < 0) {
      cls = "CEF"; confidence = "HIGH";
      flags.push("PROVIDER_DESCRIPTION_CLOSED_END_FUND");
      reasons.push("Provider security description explicitly identifies a closed-end investment-company wrapper.");
    }
    if (/\bWHEN[- ]ISSUED\b/i.test(name)) {
      flags.push("WHEN_ISSUED_LISTING_METADATA_REVIEW");
      reasons.push("Provider security name carries When-Issued status; publication requires current trading-period evidence.");
    }

    /* 5. Beleglage fuer die Gattungen, die nur ein Name trennt. */
    var nameEvidence = name ? "name" : "unavailable";
    if (!name && cls === "EQUITY_COMMON") {
      flags.push("NAME_MISSING_ADR_REIT_SPAC_UNVERIFIED");
      reasons.push("Kein Firmenname vom Anbieter. ADR, REIT, SPAC und TRUST sind an dieser " +
                   "Zeile ausdruecklich UNGEPRUEFT; die Einstufung als EQUITY_COMMON ist " +
                   "insoweit eine Restklasse und keine Feststellung.");
    }

    /* ------------------------------------------------------ Land, Platz */
    var country = Base.US_EXCHANGES[exchange] || null;
    var otc = Base.OTC_EXCHANGES[exchange] === true;
    var venueTier = US_PRIMARY_EXCHANGES[exchange] ? "PRIMARY" : otc ? "OTC"
                  : exchange ? "NON_US_OR_UNKNOWN" : "UNKNOWN";
    if (venueTier === "NON_US_OR_UNKNOWN") {
      flags.push("EXCHANGE_NOT_RECOGNIZED");
      reasons.push("Handelsplatz '" + norm(row.exchange) + "' ist weder als regulaerer " +
                   "US-Platz noch als US-Ausserboerse gefuehrt.");
    }
    if (venueTier === "UNKNOWN") flags.push("EXCHANGE_MISSING");

    var currency = upper(row.currency || row.priceCurrency) || null;
    if (currency && currency !== "USD") flags.push("CURRENCY_NOT_USD");
    if (!currency) flags.push("CURRENCY_MISSING");

    /* ------------------------------------------------- Klassifikationsstand */
    var classificationStatus;
    if (cls === "UNKNOWN") classificationStatus = "UNKNOWN";
    else if (cls === "OTHER") classificationStatus = "REVIEW";
    else if (confidence === "LOW") classificationStatus = "REVIEW";
    else if (flags.indexOf("EXCHANGE_NOT_RECOGNIZED") >= 0) classificationStatus = "REVIEW";
    else if (flags.indexOf("EXCHANGE_MISSING") >= 0) classificationStatus = "REVIEW";
    else classificationStatus = "CLASSIFIED";

    /* ------------------------------------------------------ Eignung (§4) */
    var bucket = policyBucket(cls);
    var eligible = false, eligibilityReason;
    if (bucket !== "INCLUDE") {
      eligibilityReason = bucket === "SEPARATE"
        ? "CLASS_" + cls + "_SEPARATE_FROM_PRIMARY_COMMON_EQUITY"
        : bucket === "EXCLUDE"
          ? "CLASS_" + cls + "_NOT_AN_EQUITY"
          : "CLASS_" + cls + "_UNDECIDED";
    } else if (active === false) {
      eligibilityReason = "LISTING_INACTIVE";
    } else if (country !== "US") {
      eligibilityReason = "NOT_A_US_LISTING";
    } else if (venueTier === "OTC") {
      /* Ausserboerslich gehandelte Stammaktien sind Aktien und sie sind
         US-gelistet. Sie stehen trotzdem nicht in der Primaerzahl: der
         Bestand enthaelt keine, und sie nachtraeglich einzurechnen waere
         eine Politikentscheidung und kein Befund. Sie bekommen ihren
         eigenen Eintrag und werden gezaehlt, damit die Entscheidung mit
         einer Zahl getroffen werden kann. */
      eligibilityReason = "OTC_VENUE_OUT_OF_CURRENT_POLICY";
    } else if (venueTier !== "PRIMARY") {
      eligibilityReason = "VENUE_NOT_A_PRIMARY_US_EXCHANGE";
    } else if (currency && currency !== "USD") {
      eligibilityReason = "CURRENCY_NOT_USD";
    } else if (classificationStatus !== "CLASSIFIED") {
      eligibilityReason = "CLASSIFICATION_" + classificationStatus;
    } else {
      eligible = true;
      eligibilityReason = "ACTIVE_US_PRIMARY_LISTED_COMMON_EQUITY";
    }

    return {
      version: VERSION,
      classificationRuleVersion: CLASSIFICATION_RULE_VERSION,
      baseVersion: Base.VERSION,
      ticker: ticker || null,
      instrumentType: cls,
      classificationStatus: classificationStatus,
      classificationConfidence: confidence,
      policyBucket: bucket,
      eligibleUsEquity: eligible,
      eligibilityReason: eligibilityReason,
      exchange: norm(row.exchange) || null,
      country: country,
      currency: currency,
      venueTier: venueTier,
      otc: otc,
      assetType: norm(row.assetType) || null,
      securityName: name || null,
      nameEvidence: nameEvidence,
      shareClass: marker && marker.shareClass ? marker.shareClass : null,
      series: marker && marker.series ? marker.series : null,
      root: marker && marker.root ? marker.root : null,
      active: active,
      activeBasis: activeBasis,
      startDate: base.startDate,
      endDate: base.endDate,
      flags: flags,
      reasons: reasons
    };
  }

  /* ==================================================================
     ABGLEICH GEGEN DEN BESTAND

     Der Bestand ist geliefert und gilt. Der Abgleich sagt, was der
     Anbieter heute fuehrt und wie sich das dazu verhaelt - er entfernt
     nichts.
     ================================================================== */

  var RECONCILIATION_STATUS = ["EXISTING", "ADDED", "REVIEW", "EXCLUDED_CANDIDATE"];

  function canonicalId(entry) {
    return "tiingo:" + (entry.exchange || "NA") + ":" + (entry.ticker || "NA") +
           ":" + (entry.startDate || "NA");
  }

  /* ------------------------------------ BELEGTE DOPPELZEILEN (Register)

     Tiingo fuehrt nach einer Holding-Reorganisation oder einem
     Sitzwechsel gelegentlich ZWEI Zeilen mit identischer canonical_id
     (Boerse, Ticker, Beginn): die beendete Zeile der alten Aktie und die
     laufende Zeile der Nachfolgeaktie, die den Beginn uebernommen hat
     (ONEOK 2026: tiingo:NYSE:OKE:1985-07-01 bis 2026-09-14 und bis
     heute). Die Zuordnung unten haengt dann beide Zeilen an die
     securityId; die ID ist mehrdeutig und nicht backtestbar.

     Abhilfe nur mit Beleg, nie ueber den Ticker allein: ein committetes,
     quellengebundenes Register
     (quant/config/security-master-duplicate-resolution.json). Ein Eintrag
     traegt die exakte canonical_id, Gattung und Waehrung beider Zeilen,
     das Enddatum der wegfallenden Zeile, den SEC-Beleg derselben
     Emittentenlinie (Nachfolge-Emittent nach Rule 12g-3(a) mit 8-K12B
     und 1:1-Umtausch, oder dieselbe CIK auf beiden Seiten) und die
     Pruefung der eigenen Kursreihe ueber den Stichtag (keine Luecke ueber
     wenige Sitzungen, kein Sprung in Split-Groesse).

     Wirkung, nur wenn ALLES passt: genau zwei Anbieterzeilen mit dieser
     canonical_id, gleiche Gattung (assetType, instrumentType) und
     Waehrung wie im Register, eine endet exakt am registrierten
     Enddatum, die andere spaeter, und der Bestandstitel des Tickers ist
     die registrierte securityId. Dann bleibt genau die Zeile mit dem
     spaetesten Enddatum (die laufende Nachfolgezeile); die wegfallende
     Zeile und die Accession stehen an ihr (duplicate_resolution,
     listing_status). Passt etwas nicht, bleibt alles wie ohne Register
     und der Lauf meldet den Eintrag als nicht angewandt. Zeilen ohne
     Eintrag beruehrt das Register nie. Ein unlesbares oder in sich
     widerspruechliches Register bricht den Lauf ab (fail closed).

     Fortfuehrung nach Umfirmierung (optionales Feld keptCanonicalId):
     Tiingo beendet bei einer Umfirmierung desselben Emittenten
     gelegentlich die bisherige Zeile und beginnt am Umstellungstag eine
     neue mit anderer Boersenbezeichnung derselben Boerse (EDVA 2026:
     tiingo:NYSE MKT:EDVA:2019-02-05 bis 2026-08-21 und
     tiingo:AMEX:EDVA:2026-08-21 bis heute; NYSE MKT und AMEX sind beide
     die NYSE American). Die Zuordnung ueber Ticker UND Handelsplatz
     haengt die securityId dann an die beendete Zeile, die laufende wird
     ALTERNATE_LISTING. Ein Eintrag mit keptCanonicalId verlangt
     zusaetzlich: Regel SAME_CIK, derselbe Ticker in beiden canonical_ids,
     dieselbe Boerse (nur die Bezeichnung darf wechseln, VENUE_ALIASES),
     Beginn der Folgezeile hoechstens 7 Tage vom Wirksamkeitstag. Wirkung
     nur, wenn genau diese zwei Anbieterzeilen den Ticker tragen: die
     beendete Zeile entfaellt (dropped_row), die Folgezeile wird normal
     zugeordnet. Tickerwechsel, Boersenwechsel und Zusammenschluesse sind
     damit weiter ausgeschlossen. */
  var DUPLICATE_RESOLUTION_SCHEMA = "security-master-duplicate-resolution-1.0.0";
  var DUPLICATE_RESOLUTION_LIMITS = {
    /* Enddatum der Altzeile hoechstens so weit vom Wirksamkeitstag. */
    maxEndDateDistanceDays: 7,
    /* Groesste Luecke der eigenen Reihe im Pruefzeitraum. */
    maxGapDays: { daily: 5, weekly: 8 },
    /* Groesste Einzelbewegung; ab hier sieht eine Reihe aus wie ein
       nicht bereinigter Split (3:2 = 33 %, 2:1 = 50 %). */
    maxAbsMove: 0.25,
    minPoints: 5,
    /* 8-K12B hoechstens so viele Tage nach dem Wirksamkeitstag. */
    maxFilingLagDays: 4
  };
  var DUPLICATE_RESOLUTION_RULES = ["12g-3(a)", "SAME_CIK"];
  var DUPLICATE_RESOLUTION_KEYS = ["securityId", "ticker", "exchange", "startDate", "canonicalId",
    "assetType", "instrumentType", "currency", "droppedEndDate", "event", "sec", "series", "reviewedAt"];
  /* Optional: nur fuer die Fortfuehrung nach Umfirmierung (siehe oben). */
  var DUPLICATE_RESOLUTION_OPTIONAL_KEYS = ["keptCanonicalId"];
  /* Bezeichnungen DERSELBEN Boerse beim Anbieter. Keine Boersenfamilie:
     NYSE und NYSE American sind verschiedene Boersen. */
  var VENUE_ALIASES = { "NYSE MKT": "NYSE AMERICAN", "AMEX": "NYSE AMERICAN", "NYSE AMERICAN": "NYSE AMERICAN" };
  function sameVenue(a, b) {
    var x = upper(a), y = upper(b);
    return (VENUE_ALIASES[x] || x) === (VENUE_ALIASES[y] || y);
  }
  /* "tiingo:<Boerse>:<Ticker>:<Beginn>" -> Teile; die Boerse darf ein
     Leerzeichen tragen ("NYSE MKT"), aber keinen Doppelpunkt. */
  function parseCanonicalId(id) {
    var m = /^tiingo:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(typeof id === "string" ? id : "");
    return m ? { exchange: m[1], ticker: m[2], startDate: m[3] } : null;
  }
  var CIK_RE = /^\d{10}$/;
  var ACCESSION_RE = /^\d{10}-\d{2}-\d{6}$/;

  function isIsoDay(v) {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      !isNaN(Date.parse(v + "T00:00:00Z")) &&
      new Date(Date.parse(v + "T00:00:00Z")).toISOString().slice(0, 10) === v;
  }
  function dayDistance(a, b) {
    return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
  }
  function nonEmpty(v) { return typeof v === "string" && v.trim().length > 0; }

  /** Register -> Index je securityId. null/undefined -> null (kein
   *  Register). Wirft bei jedem Formfehler. */
  function indexDuplicateResolution(doc) {
    if (doc === null || doc === undefined) return null;
    function fail(msg) { throw new Error("DUPLICATE_RESOLUTION_INVALID: " + msg); }
    if (!doc || typeof doc !== "object" || doc.schemaVersion !== DUPLICATE_RESOLUTION_SCHEMA) {
      fail("schemaVersion " + DUPLICATE_RESOLUTION_SCHEMA + " erwartet");
    }
    if (!Array.isArray(doc.sources) || !doc.sources.length) fail("sources[] fehlt");
    doc.sources.forEach(function (s, i) {
      if (!s || !nonEmpty(s.id) || !nonEmpty(s.url)) fail("sources[" + i + "] braucht id und url");
    });
    if (!Array.isArray(doc.records)) fail("records[] fehlt");
    var by = {}, seenCanonical = {};
    doc.records.forEach(function (r, i) {
      function bad(msg) { fail("records[" + i + "] " + msg); }
      if (!r || typeof r !== "object" || Array.isArray(r)) bad("kein Objekt");
      Object.keys(r).forEach(function (k) {
        if (DUPLICATE_RESOLUTION_KEYS.indexOf(k) < 0 &&
            DUPLICATE_RESOLUTION_OPTIONAL_KEYS.indexOf(k) < 0) bad("unbekanntes Feld " + k);
      });
      DUPLICATE_RESOLUTION_KEYS.forEach(function (k) {
        if (r[k] === undefined || r[k] === null) bad("Pflichtfeld " + k + " fehlt");
      });
      if (!nonEmpty(r.ticker) || r.ticker !== upper(r.ticker)) bad("ticker");
      if (!nonEmpty(r.exchange) || r.exchange !== upper(r.exchange)) bad("exchange");
      if (!/^ref_[A-Z0-9_]+$/.test(r.securityId)) bad("securityId " + r.securityId);
      if (!isIsoDay(r.startDate) || !isIsoDay(r.droppedEndDate) || !isIsoDay(r.reviewedAt)) bad("Datum");
      if (r.canonicalId !== canonicalId({ exchange: r.exchange, ticker: r.ticker, startDate: r.startDate })) {
        bad("canonicalId " + r.canonicalId + " passt nicht zu Boerse/Ticker/Beginn");
      }
      if (!nonEmpty(r.assetType) || !nonEmpty(r.instrumentType) || CLASSES.indexOf(r.instrumentType) < 0) bad("Gattung");
      if (!/^[A-Z]{3}$/.test(r.currency)) bad("currency");
      if (r.droppedEndDate < r.startDate) bad("droppedEndDate vor startDate");
      if (by[r.securityId]) bad("securityId " + r.securityId + " doppelt");
      if (seenCanonical[r.canonicalId]) bad("canonicalId " + r.canonicalId + " doppelt");

      var ev = r.event;
      if (!ev || typeof ev !== "object" || !nonEmpty(ev.kind) || !isIsoDay(ev.effectiveDate)) bad("event");
      if (Math.abs(dayDistance(ev.effectiveDate, r.droppedEndDate)) > DUPLICATE_RESOLUTION_LIMITS.maxEndDateDistanceDays) {
        bad("droppedEndDate " + r.droppedEndDate + " liegt mehr als " +
            DUPLICATE_RESOLUTION_LIMITS.maxEndDateDistanceDays + " Tage vom Ereignis " + ev.effectiveDate);
      }
      var keptParts = null;
      if (r.keptCanonicalId !== undefined) {
        keptParts = parseCanonicalId(r.keptCanonicalId);
        if (!keptParts || !isIsoDay(keptParts.startDate)) bad("keptCanonicalId " + r.keptCanonicalId);
        if (r.keptCanonicalId === r.canonicalId) bad("keptCanonicalId gleich canonicalId");
        if (keptParts.ticker !== r.ticker) bad("keptCanonicalId mit anderem Ticker (Tickerwechsel sind ausgeschlossen)");
        if (!sameVenue(keptParts.exchange, r.exchange)) bad("keptCanonicalId an anderer Boerse (Boersenwechsel sind ausgeschlossen)");
        if (!(keptParts.startDate > r.startDate)) bad("Folgezeile beginnt nicht nach der Altzeile");
        if (Math.abs(dayDistance(ev.effectiveDate, keptParts.startDate)) > DUPLICATE_RESOLUTION_LIMITS.maxEndDateDistanceDays) {
          bad("Folgezeile beginnt " + keptParts.startDate + ", mehr als " +
              DUPLICATE_RESOLUTION_LIMITS.maxEndDateDistanceDays + " Tage vom Ereignis " + ev.effectiveDate);
        }
      }

      var sec = r.sec;
      if (!sec || typeof sec !== "object") bad("sec");
      if (!CIK_RE.test(sec.predecessorCik || "") || !CIK_RE.test(sec.successorCik || "")) bad("CIK");
      if (DUPLICATE_RESOLUTION_RULES.indexOf(sec.rule) < 0) bad("sec.rule " + sec.rule);
      if (sec.exchangeRatio !== "1:1") bad("sec.exchangeRatio " + sec.exchangeRatio + " (nur 1:1)");
      if (sec.rule === "SAME_CIK" && sec.predecessorCik !== sec.successorCik) bad("SAME_CIK mit verschiedenen CIK");
      if (keptParts && sec.rule !== "SAME_CIK") bad("keptCanonicalId nur mit sec.rule SAME_CIK (Umfirmierung derselben Emittentin)");
      if (!Array.isArray(sec.filings) || !sec.filings.length) bad("sec.filings[] fehlt");
      var successorFiling = null;
      sec.filings.forEach(function (f, j) {
        if (!f || !nonEmpty(f.form) || !ACCESSION_RE.test(f.accession || "") || !isIsoDay(f.filingDate) ||
            !CIK_RE.test(f.cik || "") || !nonEmpty(f.url)) {
          bad("sec.filings[" + j + "] braucht form, accession, filingDate, cik, url");
        }
        if (f.form === "8-K12B") successorFiling = successorFiling || f;
      });
      if (sec.rule === "12g-3(a)") {
        if (!successorFiling) bad("12g-3(a) ohne 8-K12B");
        if (successorFiling.cik !== sec.successorCik) bad("8-K12B nicht von der Nachfolgerin");
        var lag = dayDistance(ev.effectiveDate, successorFiling.filingDate);
        if (lag < 0 || lag > DUPLICATE_RESOLUTION_LIMITS.maxFilingLagDays) bad("8-K12B passt nicht zum Ereignisdatum");
        if (typeof successorFiling.quote !== "string" || successorFiling.quote.length < 20) bad("8-K12B ohne Zitat");
      } else if (!sec.filings.some(function (f) {
        return f.cik === sec.successorCik && typeof f.quote === "string" && f.quote.length >= 20;
      })) {
        bad("SAME_CIK ohne zitierte Meldung derselben CIK");
      }

      var s = r.series;
      if (!s || typeof s !== "object" || !nonEmpty(s.file) || !/^[0-9a-f]{64}$/.test(s.sha256 || "")) bad("series");
      if (s.securityId !== r.securityId) bad("series.securityId");
      if (!Object.prototype.hasOwnProperty.call(DUPLICATE_RESOLUTION_LIMITS.maxGapDays, s.grain)) bad("series.grain");
      if (!isIsoDay(s.windowFrom) || !isIsoDay(s.windowTo) ||
          !(s.windowFrom <= ev.effectiveDate && ev.effectiveDate <= s.windowTo)) {
        bad("series.window umschliesst das Ereignis nicht");
      }
      if (!(typeof s.points === "number" && s.points >= DUPLICATE_RESOLUTION_LIMITS.minPoints)) bad("series.points");
      if (!(typeof s.maxGapDays === "number" && s.maxGapDays <= DUPLICATE_RESOLUTION_LIMITS.maxGapDays[s.grain])) {
        bad("series: Luecke " + s.maxGapDays + " Tage");
      }
      if (!(typeof s.maxAbsMove === "number" && s.maxAbsMove < DUPLICATE_RESOLUTION_LIMITS.maxAbsMove)) {
        bad("series: Sprung " + s.maxAbsMove + " (Split-Groesse)");
      }

      if (keptParts && seenCanonical[r.keptCanonicalId]) bad("keptCanonicalId " + r.keptCanonicalId + " doppelt");
      seenCanonical[r.canonicalId] = true;
      if (keptParts) seenCanonical[r.keptCanonicalId] = true;
      by[r.securityId] = Object.freeze({
        securityId: r.securityId, ticker: r.ticker, exchange: r.exchange, startDate: r.startDate,
        canonicalId: r.canonicalId, keptCanonicalId: keptParts ? r.keptCanonicalId : null,
        cik: sec.successorCik,
        assetType: r.assetType, instrumentType: r.instrumentType,
        currency: r.currency, droppedEndDate: r.droppedEndDate, effectiveDate: ev.effectiveDate,
        eventKind: ev.kind, rule: sec.rule,
        accession: (successorFiling || sec.filings[0]).accession,
        form: (successorFiling || sec.filings[0]).form
      });
    });
    return by;
  }

  /** Wendet das Register auf die nach Ticker gruppierten, klassifizierten
   *  Anbieterzeilen an (veraendert providerByTicker/tickerRowCount nur
   *  bei vollstaendigem Treffer). -> {applied[], notApplied[]} */
  function applyDuplicateResolution(index, providerByTicker, tickerRowCount, baselineByTicker) {
    var applied = [], notApplied = [];
    if (!index) return { applied: applied, notApplied: notApplied };
    Object.keys(index).sort().forEach(function (id) {
      var e = index[id];
      function skip(reason) { notApplied.push({ securityId: id, canonicalId: e.canonicalId, reason: reason }); }
      var base = baselineByTicker[e.ticker];
      if (!base || base.length !== 1 || base[0].securityId !== id) return skip("BASELINE_SECURITY_ID_MISMATCH");
      var group = providerByTicker[e.ticker] || [];
      var same;
      if (e.keptCanonicalId) {
        /* Fortfuehrung: genau die Altzeile und genau die Folgezeile, sonst nichts unter dem Ticker. */
        var oldRows = group.filter(function (c) { return canonicalId(c) === e.canonicalId; });
        var newRows = group.filter(function (c) { return canonicalId(c) === e.keptCanonicalId; });
        if (oldRows.length !== 1) return skip("PROVIDER_ROWS_WITH_CANONICAL_ID:" + oldRows.length);
        if (newRows.length !== 1) return skip("PROVIDER_ROWS_WITH_KEPT_CANONICAL_ID:" + newRows.length);
        if (group.length !== 2) return skip("PROVIDER_ROWS_FOR_TICKER:" + group.length);
        same = [oldRows[0], newRows[0]];
      } else {
        same = group.filter(function (c) { return canonicalId(c) === e.canonicalId; });
        if (same.length !== 2) return skip("PROVIDER_ROWS_WITH_CANONICAL_ID:" + same.length);
      }
      for (var k = 0; k < same.length; k++) {
        var c = same[k];
        if (c.assetType !== e.assetType) return skip("ASSET_TYPE_MISMATCH");
        if (c.instrumentType !== e.instrumentType) return skip("INSTRUMENT_TYPE_MISMATCH");
        if (c.currency !== e.currency) return skip("CURRENCY_MISMATCH");
      }
      var dropped = e.keptCanonicalId
        ? (same[0].endDate === e.droppedEndDate ? [same[0]] : [])
        : same.filter(function (c) { return c.endDate === e.droppedEndDate; });
      if (dropped.length !== 1) return skip("DROPPED_END_DATE_NOT_FOUND");
      var kept = same[0] === dropped[0] ? same[1] : same[0];
      if (!isIsoDay(kept.endDate) || !(kept.endDate > e.droppedEndDate)) return skip("KEPT_ROW_NOT_LATEST");

      group.splice(group.indexOf(dropped[0]), 1);
      tickerRowCount[e.ticker] -= 1;
      var droppedInfo = {
        canonical_id: canonicalId(dropped[0]), start_date: dropped[0].startDate, end_date: dropped[0].endDate,
        active_status: dropped[0].active === null ? "UNKNOWN" : dropped[0].active ? "ACTIVE" : "INACTIVE"
      };
      kept.duplicateResolution = {
        schemaVersion: DUPLICATE_RESOLUTION_SCHEMA,
        rule: e.rule, form: e.form, accession: e.accession,
        event: e.eventKind, effectiveDate: e.effectiveDate,
        dropped_row: droppedInfo
      };
      if (e.keptCanonicalId) {
        /* Nur bei Fortfuehrung: Zeilen der Altfaelle bleiben Feld fuer Feld gleich. */
        kept.duplicateResolution.continuation = "SAME_ISSUER_RENAMED";
        kept.duplicateResolution.cik = e.cik;
        kept.activeBasis = kept.activeBasis + " (Folgezeile derselben Emittentin CIK " + e.cik + "; Altzeile " +
          droppedInfo.canonical_id + " bis " + droppedInfo.end_date + " belegt abgeloest: " + e.form + " " + e.accession + ")";
      } else {
        kept.activeBasis = kept.activeBasis + " (Doppelzeile " + droppedInfo.start_date + ".." +
          droppedInfo.end_date + " belegt aufgeloest: " + e.form + " " + e.accession + ")";
      }
      var appliedEntry = { securityId: id, canonicalId: e.canonicalId, keptEndDate: kept.endDate,
                           droppedEndDate: droppedInfo.end_date, accession: e.accession };
      if (e.keptCanonicalId) appliedEntry.keptCanonicalId = e.keptCanonicalId;
      applied.push(appliedEntry);
    });
    return { applied: applied, notApplied: notApplied };
  }

  /**
   * Baut den Wertpapierstamm und den Abgleich.
   *
   * @param {object} input
   *   providerRows  Anbieterzeilen (supported_tickers). Darf leer sein -
   *                 dann laeuft der Abgleich im Bestandsmodus und meldet
   *                 die Anbieterseite ausdruecklich als nicht erhoben.
   *   baseline      Der gelieferte Bestand (universe-FULL_UNIVERSE.json
   *                 -> securities). Pflicht.
   *   today         "YYYY-MM-DD".
   *   providerAvailable  false, wenn providerRows nicht erhoben werden
   *                 konnten. Trennt "der Anbieter fuehrt den Titel
   *                 nicht mehr" von "wir haben nicht nachgesehen".
   *   duplicateResolution  Optional: Register belegter Doppelzeilen
   *                 (DUPLICATE_RESOLUTION_SCHEMA). Fehlt es, bleibt alles
   *                 wie bisher; ist es fehlerhaft, wirft der Aufruf.
   * @returns {object} {rows, counts, duplicates, findings, invariants
   *                    [, duplicateResolution]}
   */
  function buildSecurityMaster(input) {
    input = input || {};
    var today = input.today || new Date().toISOString().slice(0, 10);
    var baseline = input.baseline || [];
    var providerRows = input.providerRows || [];
    var providerAvailable = input.providerAvailable !== false && providerRows.length > 0;
    var stamp = input.stamp || null;

    var baselineByTicker = {};
    baseline.forEach(function (b) {
      var t = upper(b.ticker);
      if (!t) return;
      if (!baselineByTicker[t]) baselineByTicker[t] = [];
      baselineByTicker[t].push(b);
    });
    var baselineTickers = Object.keys(baselineByTicker);

    /* --------------------------------------------- 1. Anbieterzeilen

       Zuerst nach Ticker gruppieren, dann zuordnen. Die Reihenfolge ist
       nicht Geschmack, sondern der Unterschied zwischen einer Zahl und
       einer falschen Zahl.

       Tiingo fuehrt denselben Ticker mehrfach: an zwei Handelsplaetzen,
       oder nacheinander fuer zwei verschiedene Emittenten
       (Symbolwiederverwendung). Der erste Lauf hat jede dieser Zeilen
       zum Bestandstitel erklaert, weil der Ticker passte - und meldete
       6.024 Bestandstitel, wo 5.684 stehen. Die 340 zu viel waren
       keine zusaetzlichen Titel; es waren zusaetzliche ZEILEN zu
       denselben Titeln. Aus derselben Verwechslung kamen 333 angeblich
       beendete Bestandslistings (es sind 16): die alte, delistete
       Zeile eines wiederverwendeten Symbols schlug auf den lebenden
       Titel durch.

       Die Zuordnung geht deshalb ueber Ticker UND Handelsplatz, und wo
       sie nicht eindeutig ist, sagt sie das (§5: "whether it maps
       cleanly to one provider security"). */
    var rows = [];
    var providerSeen = {};
    var tickerRowCount = {};
    var providerByTicker = {};
    var tickerOrder = [];

    /* Der Stammbeleg wird VOR der Klassifikation gebildet und aus
       beiden Quellen gespeist. Ein Stamm, den nur der Bestand fuehrt -
       weil der Anbieter ihn inzwischen delistet hat -, belegt sein
       Derivat genauso. */
    var listedRoots = input.listedRoots || collectListedRoots(providerRows, baseline);
    var classifyOpts = { today: today, staleDays: input.staleDays, listedRoots: listedRoots };

    providerRows.forEach(function (r) {
      var c = classifySecurity(r, classifyOpts);
      if (!c.ticker) return;
      if (!providerByTicker[c.ticker]) { providerByTicker[c.ticker] = []; tickerOrder.push(c.ticker); }
      providerByTicker[c.ticker].push(c);
      providerSeen[c.ticker] = true;
      tickerRowCount[c.ticker] = (tickerRowCount[c.ticker] || 0) + 1;
    });

    /* Belegte Doppelzeilen (Register oben): VOR der Bestandszuordnung,
       damit die verbleibende Zeile ganz normal ueber Ticker UND
       Handelsplatz zugeordnet wird. Ohne Register (null) kein Eingriff. */
    var resolutionIndex = indexDuplicateResolution(input.duplicateResolution);
    var resolution = applyDuplicateResolution(resolutionIndex, providerByTicker, tickerRowCount, baselineByTicker);

    tickerOrder.forEach(function (t) {
      var group = providerByTicker[t];
      var baseEntries = baselineByTicker[t] || null;

      /* Welche Anbieterzeile IST der Bestandstitel? */
      var matchIndex = -1, ambiguous = false;
      if (baseEntries) {
        var baseExchange = upper(baseEntries[0].exchange);
        var exact = [];
        group.forEach(function (c, i) { if (upper(c.exchange) === baseExchange) exact.push(i); });
        if (exact.length === 1) matchIndex = exact[0];
        else if (exact.length === 0 && group.length === 1) matchIndex = 0;
        else ambiguous = true;
      }

      group.forEach(function (c, i) {
        /* Bei Mehrdeutigkeit traegt JEDE Zeile der Gruppe den
           Bestandsbezug. Eine davon willkuerlich zu waehlen waere eine
           Entscheidung, und die trifft dieser Lauf nicht - aber den
           Bezug ganz fallen zu lassen hiesse, den Titel zu verlieren. */
        var isMatch = !!baseEntries && (ambiguous || i === matchIndex);
        var row = makeRow(c, isMatch ? baseEntries : null, "PROVIDER_SUPPORTED_TICKERS", stamp);
        if (c.duplicateResolution) {
          row.duplicate_resolution = c.duplicateResolution;
          row.review_flags.push("PROVIDER_DUPLICATE_ROW_RESOLVED");
        }
        row.baseline_match = !baseEntries ? "NOT_A_BASELINE_TICKER"
          : ambiguous ? "AMBIGUOUS"
          : isMatch ? "EXCHANGE_MATCH"
          : "ALTERNATE_LISTING";

        if (baseEntries && !isMatch) {
          /* Dieselbe Tickerschreibweise, ein anderes Listing. Es wird
             nicht als Neuaufnahme gefuehrt: ob das ein zweiter
             Handelsplatz desselben Unternehmens oder ein spaeterer
             Emittent desselben Symbols ist, entscheidet der Anbieter
             nicht - und dieser Lauf auch nicht. */
          row.review_flags.push("SHARES_TICKER_WITH_BASELINE");
          row.reconciliation_status = "REVIEW";
          row.reconciliation_reason = "ALTERNATE_LISTING_OF_BASELINE_TICKER";
        } else if (isMatch && ambiguous) {
          row.review_flags.push("BASELINE_MATCH_AMBIGUOUS");
          row.reconciliation_status = "REVIEW";
          row.reconciliation_reason = "BASELINE_MATCH_AMBIGUOUS";
        }
        rows.push(row);
      });
    });

    /* ------------------------------- 2. Bestand ohne Anbieterzeile

       Der wichtigste Teil dieser Funktion. Ein Bestandstitel, den der
       Anbieter nicht (mehr) fuehrt, verschwindet NICHT - er bekommt
       eine Zeile mit REVIEW und dem Grund. */
    baselineTickers.forEach(function (t) {
      if (providerSeen[t]) return;
      baselineByTicker[t].forEach(function (b) {
        /* active wird durchgereicht, nicht nachgetragen: der Bestand
           traegt es als geliefertes Feld, und die Eignungspruefung im
           Klassierer muss es sehen, bevor sie urteilt. */
        var c = classifySecurity({
          ticker: b.ticker, exchange: b.exchange, assetType: b.assetType,
          name: b.company, currency: b.currency, startDate: b.startDate,
          endDate: b.endDate || null,
          active: typeof b.active === "boolean" ? b.active : undefined
        }, classifyOpts);
        var row = makeRow(c, [b],
          providerAvailable ? "BASELINE_ONLY_NOT_IN_PROVIDER_LIST" : "BASELINE_ARTEFACT", stamp);
        if (providerAvailable) {
          row.review_flags.push("NOT_IN_PROVIDER_UNIVERSE");
          row.reconciliation_status = "REVIEW";
          row.reconciliation_reason = "PROVIDER_ROW_NOT_FOUND";
        }
        tickerRowCount[c.ticker] = (tickerRowCount[c.ticker] || 0) + 1;
        rows.push(row);
      });
    });

    /* ------------------------------------------- 3. Doppelte Ticker */
    var duplicates = [];
    Object.keys(tickerRowCount).forEach(function (t) {
      if (tickerRowCount[t] > 1) {
        var group = rows.filter(function (r) { return r.ticker === t; });
        duplicates.push({
          ticker: t,
          rows: group.length,
          exchanges: group.map(function (r) { return r.exchange; }),
          ranges: group.map(function (r) { return (r.start_date || "?") + ".." + (r.end_date || "open"); }),
          baselineMember: group.some(function (r) { return r.baseline_member; }),
          /* Zwei Zeilen mit demselben Ticker und sich NICHT
             ueberschneidenden Zeitraeumen sind Symbolwiederverwendung.
             Zwei Zeilen mit Ueberschneidung sind zwei Listings. */
          kind: overlaps(group) ? "MULTIPLE_LISTINGS" : "POSSIBLE_SYMBOL_REUSE"
        });
      }
    });
    var duplicateTickers = {};
    duplicates.forEach(function (d) { duplicateTickers[d.ticker] = d.kind; });
    rows.forEach(function (r) {
      if (!duplicateTickers[r.ticker]) return;
      r.review_flags.push("DUPLICATE_TICKER_" + duplicateTickers[r.ticker]);

      /* Der Ticker ist doppelt - aber nicht jede Zeile ist deshalb
         unklar. Eine Bestandszeile, die ueber den Handelsplatz sauber
         zugeordnet wurde, ist zugeordnet; sie wegen einer zweiten,
         delisteten Zeile desselben Symbols zur Pruefung zu stellen
         hiesse 340 gesunde Titel mit einem Verdacht zu belegen, den es
         nicht gibt. Das Kennzeichen steht trotzdem an ihr: wer die
         Symbolgeschichte braucht, findet sie.

         Zur Pruefung kommt, was WIRKLICH offen ist: eine Neuaufnahme,
         die sich einen Ticker mit einer anderen Neuaufnahme teilt. */
      if (r.reconciliation_status === "ADDED") {
        r.reconciliation_status = "REVIEW";
        r.reconciliation_reason = "AMBIGUOUS_DUPLICATE_TICKER";
      } else if (r.reconciliation_status === "REVIEW" &&
                 r.reconciliation_reason.indexOf("AMBIGUOUS_DUPLICATE_TICKER") < 0 &&
                 r.reconciliation_reason.indexOf("ALTERNATE_LISTING") < 0 &&
                 r.reconciliation_reason.indexOf("BASELINE_MATCH_AMBIGUOUS") < 0) {
        r.reconciliation_reason = r.reconciliation_reason + "+AMBIGUOUS_DUPLICATE_TICKER";
      }
    });

    /* -------------------------------------------------- 4. Auszaehlung */
    var counts = tally(rows, baselineTickers.length, providerAvailable);
    var findings = collectFindings(rows, duplicates, providerAvailable);
    var invariants = assertNonDestructive(rows, baselineByTicker);

    var result = {
      version: VERSION,
      classificationRuleVersion: CLASSIFICATION_RULE_VERSION,
      generatedFor: today,
      providerAvailable: providerAvailable,
      rows: rows,
      counts: counts,
      duplicates: duplicates,
      findings: findings,
      invariants: invariants
    };
    /* Nur mit Register: ohne bleibt das Ergebnis Feld fuer Feld wie vorher. */
    if (resolutionIndex !== null) {
      result.duplicateResolution = {
        schemaVersion: DUPLICATE_RESOLUTION_SCHEMA,
        records: Object.keys(resolutionIndex).length,
        applied: resolution.applied,
        notApplied: resolution.notApplied
      };
    }
    return result;
  }

  function overlaps(group) {
    for (var i = 0; i < group.length; i++) {
      for (var j = i + 1; j < group.length; j++) {
        var a = group[i], b = group[j];
        var aEnd = a.end_date || "9999-12-31", bEnd = b.end_date || "9999-12-31";
        var aStart = a.start_date || "0000-01-01", bStart = b.start_date || "0000-01-01";
        if (aStart <= bEnd && bStart <= aEnd) return true;
      }
    }
    return false;
  }

  /** Klassifikationsbefund + Bestandslage -> Stammzeile (§7). */
  function makeRow(c, baselineEntries, provenance, stamp) {
    var isBaseline = !!(baselineEntries && baselineEntries.length);
    var baselineEntry = isBaseline ? baselineEntries[0] : null;
    var reviewFlags = c.flags.slice();

    var status, reason;
    if (isBaseline) {
      /* Bestand. Er bleibt - die Frage ist nur, ob er so bleiben kann,
         wie er gefuehrt wird. */
      var mismatch = [];
      if (c.instrumentType !== "EQUITY_COMMON") {
        mismatch.push("CLASSIFIED_AS_" + c.instrumentType);
      }
      if (c.active === false) mismatch.push("LISTING_INACTIVE");
      if (c.venueTier !== "PRIMARY") mismatch.push("VENUE_" + c.venueTier);
      if (baselineEntry && baselineEntry.instrumentType &&
          baselineEntry.instrumentType !== "COMMON_STOCK" &&
          baselineEntry.instrumentType !== c.instrumentType) {
        mismatch.push("BASELINE_TYPE_" + baselineEntry.instrumentType);
      }
      if (c.classificationStatus === "UNKNOWN") mismatch.push("CLASSIFICATION_UNKNOWN");

      if (mismatch.length) {
        status = "REVIEW";
        reason = "BASELINE_CONTAMINATION_CANDIDATE:" + mismatch.join("+");
        mismatch.forEach(function (m) { reviewFlags.push(m); });
      } else {
        status = "EXISTING";
        reason = "BASELINE_MEMBER_CONFIRMED";
      }
    } else if (c.eligibleUsEquity) {
      status = "ADDED";
      reason = "NEW_ELIGIBLE_US_COMMON_EQUITY";
    } else if (c.policyBucket === "EXCLUDE" && c.classificationStatus === "CLASSIFIED") {
      status = "EXCLUDED_CANDIDATE";
      reason = "NEW_NON_EQUITY:" + c.instrumentType;
    } else if (c.policyBucket === "EXCLUDE") {
      /* Ausschlusskorb, aber die Klassifikation traegt ihn nicht: LOW,
         OTHER oder UNKNOWN. Ein Verdacht schliesst nicht aus. Der Titel
         bleibt als Verdachtsfall gefuehrt - sichtbar, nachpruefbar und
         nicht geloescht. Wer hier EXCLUDED_CANDIDATE schriebe, liesse
         den Klassierer ueber Titel entscheiden, die er selbst nicht
         erkannt hat. */
      status = "REVIEW";
      reason = "NEW_NON_EQUITY_UNCONFIRMED:" + c.instrumentType +
               ":" + c.classificationStatus;
      reviewFlags.push("EXCLUSION_CANDIDATE_UNCONFIRMED");
    } else {
      status = "REVIEW";
      reason = "NEW_AMBIGUOUS:" + c.eligibilityReason;
    }

    return {
      /* --- §7 Pflichtfelder --- */
      provider: "tiingo",
      ticker: c.ticker,
      canonical_id: canonicalId(c),
      exchange: c.exchange,
      country: c.country || "UNKNOWN",
      currency: c.currency || "UNKNOWN",
      instrument_type: c.instrumentType,
      classification_status: c.classificationStatus,
      classification_confidence: c.classificationConfidence,
      active_status: c.active === null ? "UNKNOWN" : c.active ? "ACTIVE" : "INACTIVE",
      start_date: c.startDate,
      end_date: c.endDate,
      eligible_us_equity: c.eligibleUsEquity,
      eligibility_reason: c.eligibilityReason,
      reconciliation_status: status,
      baseline_member: isBaseline,
      source_provenance: provenance,

      /* --- §7 optional, hier belegbar --- */
      provider_symbol_id: c.ticker,
      listing_status: c.activeBasis,
      primary_listing: c.venueTier === "PRIMARY",
      security_name: c.securityName,
      mic: null,                       /* Tiingo liefert keinen MIC. */
      first_seen_at: stamp,
      last_seen_at: stamp,

      /* --- Arbeitsfelder des Abgleichs --- */
      reconciliation_reason: reason,
      policy_bucket: c.policyBucket,
      venue_tier: c.venueTier,
      otc: c.otc,
      asset_type: c.assetType,
      name_evidence: c.nameEvidence,
      share_class: c.shareClass,
      series: c.series,
      baseline_security_id: baselineEntry ? (baselineEntry.securityId || null) : null,
      baseline_instrument_type: baselineEntry ? (baselineEntry.instrumentType || null) : null,
      baseline_selection: baselineEntry ? (baselineEntry.selection || null) : null,
      review_flags: reviewFlags,
      classification_reasons: c.reasons
    };
  }

  function tally(rows, baselineCount, providerAvailable) {
    var byClass = {};
    CLASSES.forEach(function (c) { byClass[c] = 0; });
    var byStatus = { EXISTING: 0, ADDED: 0, REVIEW: 0, EXCLUDED_CANDIDATE: 0 };
    var byExchange = {}, byVenue = {}, byActive = { ACTIVE: 0, INACTIVE: 0, UNKNOWN: 0 };
    var byClassificationStatus = { CLASSIFIED: 0, REVIEW: 0, UNKNOWN: 0 };

    var activeCommon = 0, otcCommonDeferred = 0;
    /* Erhalten wird ein TITEL, nicht eine Zeile. Der Unterschied ist
       genau der Fehler, den der erste Anbieterlauf gemeldet hat. */
    var baselineTickersSeen = {};
    var baselineMemberRows = 0;
    var baselineTickersWithMultipleRows = {};
    var newByClass = {};
    CLASSES.forEach(function (c) { newByClass[c] = 0; });

    rows.forEach(function (r) {
      byClass[r.instrument_type] = (byClass[r.instrument_type] || 0) + 1;
      byStatus[r.reconciliation_status] = (byStatus[r.reconciliation_status] || 0) + 1;
      byExchange[r.exchange || "UNKNOWN"] = (byExchange[r.exchange || "UNKNOWN"] || 0) + 1;
      byVenue[r.venue_tier] = (byVenue[r.venue_tier] || 0) + 1;
      byActive[r.active_status] = (byActive[r.active_status] || 0) + 1;
      byClassificationStatus[r.classification_status] =
        (byClassificationStatus[r.classification_status] || 0) + 1;
      if (r.baseline_member) {
        baselineMemberRows++;
        if (baselineTickersSeen[r.ticker]) baselineTickersWithMultipleRows[r.ticker] = true;
        baselineTickersSeen[r.ticker] = true;
      }
      if (!r.baseline_member) newByClass[r.instrument_type] = (newByClass[r.instrument_type] || 0) + 1;
      if (r.instrument_type === "EQUITY_COMMON" && r.active_status !== "INACTIVE" &&
          r.venue_tier === "PRIMARY" && r.country === "US") activeCommon++;
      if (r.eligibility_reason === "OTC_VENUE_OUT_OF_CURRENT_POLICY") otcCommonDeferred++;
    });

    return {
      rowsTotal: rows.length,
      baselineCount: baselineCount,
      /* Zahl der erhaltenen BESTANDSTITEL. Muss baselineCount sein. */
      baselinePreserved: Object.keys(baselineTickersSeen).length,
      /* Zahl der ZEILEN, die einen Bestandstitel tragen. Darf groesser
         sein - dann ist die Zuordnung mehrdeutig, und das ist ein
         Befund und kein Verlust. */
      baselineMemberRows: baselineMemberRows,
      baselineTickersWithAmbiguousMatch: Object.keys(baselineTickersWithMultipleRows).length,
      byInstrumentType: byClass,
      newByInstrumentType: newByClass,
      byReconciliationStatus: byStatus,
      byClassificationStatus: byClassificationStatus,
      byExchange: byExchange,
      byVenueTier: byVenue,
      byActiveStatus: byActive,
      activeUsPrimaryCommonEquities: activeCommon,
      otcCommonDeferred: otcCommonDeferred,
      providerAvailable: providerAvailable
    };
  }

  function collectFindings(rows, duplicates, providerAvailable) {
    var out = [];
    function add(id, severity, count, note, examples) {
      out.push({ id: id, severity: severity, count: count, note: note,
                 examples: (examples || []).slice(0, 10) });
    }

    /* Nur die SAUBER zugeordneten Bestandszeilen zaehlen als Befund
       ueber den Bestand.

       Eine mehrdeutig zugeordnete Gruppe traegt mehrere Zeilen zu EINEM
       Titel, darunter typischerweise die alte, delistete Zeile eines
       wiederverwendeten Symbols. Sie in die Kontaminationszahlen zu
       mischen hat im ersten Anbieterlauf 223 angeblich beendete
       Bestandslistings gemeldet, wo acht stehen. Die Mehrdeutigkeit ist
       ein eigener Befund mit eigener Aufteilung - sie wird nicht
       versteckt, sondern getrennt. */
    var baselineReview = rows.filter(function (r) {
      return r.baseline_member && r.reconciliation_status === "REVIEW" &&
             r.baseline_match !== "AMBIGUOUS";
    });
    /* Gezaehlt werden TITEL. Ein Titel mit zwei auffaelligen Zeilen ist
       ein Fall und nicht zwei. */
    function tickersOf(list) {
      var seen = {}, out = [];
      list.forEach(function (r) {
        if (!seen[r.ticker]) { seen[r.ticker] = true; out.push(r.ticker); }
      });
      return out;
    }
    function ofFlag(flag) {
      return baselineReview.filter(function (r) { return r.review_flags.indexOf(flag) >= 0; });
    }

    var pref = tickersOf(baselineReview.filter(function (r) {
      return r.instrument_type === "PREFERRED"; }));
    if (pref.length) {
      add("BASELINE_PREFERRED_CONTAMINATION", "HIGH", pref.length,
          "Bestandstitel, deren Ticker eine Vorzugsserie ausweist. Der Basis-Klassierer kennt " +
          "die dreiteilige Schreibweise (XXX-P-Y) nicht und hat sie als Stammaktie gefuehrt. " +
          "Sie bleiben im Bestand und werden NICHT entfernt.", pref);
    }
    ["ETF", "ETN", "ETP", "MUTUAL_FUND", "CEF", "INDEX", "WARRANT", "UNIT", "RIGHT",
     "TRUST", "ADR", "REIT", "SPAC"].forEach(function (cls) {
      var hits = tickersOf(baselineReview.filter(function (r) { return r.instrument_type === cls; }));
      if (hits.length) {
        add("BASELINE_" + cls + "_CONTAMINATION", cls === "ETF" || cls === "MUTUAL_FUND" ? "HIGH" : "MEDIUM",
            hits.length, "Bestandstitel, die nach dieser Klassifikation " + cls + " sind. " +
            "Sie bleiben im Bestand; die Entscheidung ist eine eigene, ausdruecklich " +
            "freizugebende Migration.", hits);
      }
    });

    var inactive = tickersOf(ofFlag("LISTING_INACTIVE"));
    if (inactive.length) {
      add("BASELINE_INACTIVE_LISTINGS", "MEDIUM", inactive.length,
          "Bestandstitel, deren Listing nach Anbieterangabe beendet ist. Ihre gelieferten " +
          "Daten bleiben erhalten.", inactive);
    }
    var venue = baselineReview.filter(function (r) { return r.venue_tier !== "PRIMARY"; });
    if (venue.length) {
      add("BASELINE_NON_PRIMARY_VENUE", "MEDIUM", tickersOf(venue).length,
          "Bestandstitel an einem Platz, der kein regulaerer US-Handelsplatz ist.",
          venue.map(function (r) { return r.ticker + "@" + r.exchange; }));
    }
    var ambiguousMatch = rows.filter(function (r) {
      return r.baseline_member && r.baseline_match === "AMBIGUOUS";
    });
    if (ambiguousMatch.length) {
      var ambTickers = {}, ambByClass = {}, ambInactiveRows = 0;
      ambiguousMatch.forEach(function (r) {
        ambTickers[r.ticker] = true;
        ambByClass[r.instrument_type] = (ambByClass[r.instrument_type] || 0) + 1;
        if (r.active_status === "INACTIVE") ambInactiveRows++;
      });
      out.push({
        id: "BASELINE_MATCH_AMBIGUOUS", severity: "HIGH",
        count: Object.keys(ambTickers).length,
        note: "Bestandstitel, die sich keiner einzelnen Anbieterzeile zuordnen lassen - der " +
              "Anbieter fuehrt den Ticker mehrfach und keine Zeile steht auf dem Handelsplatz " +
              "des Bestands. Alle betroffenen Zeilen behalten den Bestandsbezug; welche " +
              "gemeint ist, entscheidet dieser Lauf nicht. Die Aufteilung unten ist der " +
              "Grund, warum diese Zeilen NICHT in den Kontaminationszahlen mitlaufen: sie " +
              "enthalten typischerweise die alte, delistete Zeile eines wiederverwendeten " +
              "Symbols.",
        rows: ambiguousMatch.length,
        inactiveRows: ambInactiveRows,
        byInstrumentType: ambByClass,
        examples: Object.keys(ambTickers).slice(0, 10)
      });
    }
    var alternates = rows.filter(function (r) { return r.baseline_match === "ALTERNATE_LISTING"; });
    if (alternates.length) {
      var altTickers = {};
      alternates.forEach(function (r) { altTickers[r.ticker] = true; });
      add("ALTERNATE_LISTING_OF_BASELINE_TICKER", "MEDIUM", Object.keys(altTickers).length,
          alternates.length + " weitere Anbieterzeilen zu Tickern, die wir schon fuehren - " +
          "zweiter Handelsplatz oder ein spaeterer Emittent desselben Symbols. Sie werden " +
          "ausdruecklich NICHT als Neuaufnahme gezaehlt.",
          alternates.map(function (r) { return r.ticker + "@" + r.exchange; }));
    }
    var notFound = rows.filter(function (r) {
      return r.baseline_member && r.review_flags.indexOf("NOT_IN_PROVIDER_UNIVERSE") >= 0;
    });
    if (notFound.length) {
      add("BASELINE_NOT_IN_PROVIDER_UNIVERSE", "HIGH", tickersOf(notFound).length,
          "Bestandstitel, die in der aktuellen Anbieterliste nicht mehr vorkommen. Nicht " +
          "loeschen: der Grund kann ein Symbolwechsel sein.", tickersOf(notFound));
    }
    if (duplicates.length) {
      var reuse = duplicates.filter(function (d) { return d.kind === "POSSIBLE_SYMBOL_REUSE"; });
      add("DUPLICATE_TICKERS", "HIGH", duplicates.length,
          "Ticker mit mehr als einer Zeile im Stamm. " + reuse.length + " davon ohne " +
          "Zeitraumueberschneidung - das ist Symbolwiederverwendung und keine Doppelnotierung.",
          duplicates.map(function (d) { return d.ticker + " (" + d.kind + ")"; }));
    }
    var noName = rows.filter(function (r) { return r.name_evidence === "unavailable"; });
    if (noName.length) {
      add("NAME_EVIDENCE_UNAVAILABLE", "HIGH", noName.length,
          "Zeilen ohne Firmennamen. ADR, REIT, SPAC, TRUST, ETN, ETP und CEF sind an diesen " +
          "Zeilen NICHT geprueft; die Zahlen dieser Gattungen sind Untergrenzen.", []);
    }
    if (!providerAvailable) {
      add("PROVIDER_UNIVERSE_NOT_FETCHED", "HIGH", 0,
          "Die Anbieterliste wurde in diesem Lauf nicht erhoben. Der Abgleich beschreibt " +
          "ausschliesslich den gelieferten Bestand; jede Aussage ueber neue Titel bleibt offen.", []);
    }
    return out;
  }

  /**
   * Die Zusage aus §1, am Ergebnis geprueft.
   *
   * Sie steht hier und nicht nur im Test, weil ein Test einen Lauf in
   * der Werkstatt prueft und dieser Aufruf jeden Lauf prueft - auch den
   * naechsten, den jemand mit einem geaenderten Klassierer startet.
   */
  function assertNonDestructive(rows, baselineByTicker) {
    var baselineTickers = Object.keys(baselineByTicker);
    var present = {};
    var violations = [];

    rows.forEach(function (r) {
      if (r.baseline_member) present[r.ticker] = true;
    });
    baselineTickers.forEach(function (t) {
      if (!present[t]) violations.push("BASELINE_TICKER_DROPPED:" + t);
    });
    rows.forEach(function (r) {
      if (r.baseline_member && r.reconciliation_status === "ADDED") {
        violations.push("BASELINE_TICKER_MARKED_ADDED:" + r.ticker);
      }
      if (r.baseline_member && r.reconciliation_status === "EXCLUDED_CANDIDATE") {
        violations.push("BASELINE_TICKER_MARKED_EXCLUDED:" + r.ticker);
      }
      if (RECONCILIATION_STATUS.indexOf(r.reconciliation_status) < 0) {
        violations.push("UNKNOWN_RECONCILIATION_STATUS:" + r.reconciliation_status);
      }
    });

    if (violations.length) {
      throw new Error("Nicht-destruktive Zusage verletzt (" + violations.length + "): " +
                      violations.slice(0, 10).join(", "));
    }
    return {
      baselineTickers: baselineTickers.length,
      baselineTickersPresent: Object.keys(present).length,
      destructiveViolations: 0,
      checked: ["NO_BASELINE_TICKER_DROPPED", "NO_BASELINE_TICKER_ADDED",
                "NO_BASELINE_TICKER_EXCLUDED", "RECONCILIATION_STATUS_IN_ENUM"]
    };
  }

  /* ------------------------------------------------ PRODUKTEIGNUNG

     Vier Ausgaenge, und der vierte ist der Grund fuer diese Funktion.

     Nach dem Backfill standen 583 Warrants, Units und Rights im
     gelieferten Universum. Sie gehoeren nicht ins Produkt - aber die
     Entscheidung, einen Titel herauszunehmen, darf nur auf einem BELEG
     stehen, nicht auf einem Verdacht:

       ELIGIBLE        Stammaktie, aktiv, Primaerhandelsplatz.
       SEPARATE_CLASS  Belegt aktienartig, getrennt gefuehrt (Vorzuege).
                       Im Produkt, aber nicht in der Stammaktienzahl.
       EXCLUDED        BELEGTE Nicht-Aktie. Nur mit CLASSIFIED.
       REVIEW          Alles uebrige: unbelegter Verdacht, inaktiv,
                       unbekannt. Bleibt im Produkt, markiert.

     Die Bedingung "classificationStatus === CLASSIFIED" vor jedem
     Ausschluss ist die ganze Vorsicht dieser Funktion. Ohne sie
     entschiede der Klassierer ueber Titel, die er selbst nicht erkannt
     hat - und ein faelschlich ausgeschlossenes Unternehmen ist teurer
     als ein durchgerutschter Warrant.

     Die Ablage ist davon ausdruecklich NICHT betroffen. Eignung sagt,
     was im Produkt erscheint; sie sagt nichts darueber, was gespeichert
     bleibt. */
  var PRODUCT_ELIGIBILITY = ["ELIGIBLE", "SEPARATE_CLASS", "EXCLUDED", "REVIEW"];
  var IN_PRODUCT_UNIVERSE = ["ELIGIBLE", "SEPARATE_CLASS", "REVIEW"];

  function decideProductEligibility(j) {
    j = j || {};
    var cls = j.instrumentType || "UNKNOWN";
    var classified = j.classificationStatus === "CLASSIFIED";
    var bucket = j.policyBucket || policyBucket(cls);

    if (j.eligible === true) {
      return { status: "ELIGIBLE", reason: "US_COMMON_EQUITY_ON_PRIMARY_VENUE",
               inProductUniverse: true };
    }
    if (bucket === "EXCLUDE" && classified) {
      return { status: "EXCLUDED", reason: "CONFIRMED_NON_EQUITY:" + cls,
               inProductUniverse: false };
    }
    if (bucket === "SEPARATE" && classified) {
      return { status: "SEPARATE_CLASS", reason: "CONFIRMED_SEPARATE_CLASS:" + cls,
               inProductUniverse: true };
    }
    return { status: "REVIEW",
             reason: "UNCONFIRMED:" + (j.reason || j.classificationStatus || "UNKNOWN"),
             inProductUniverse: true };
  }

  var api = {
    VERSION: VERSION,
    CLASSIFICATION_RULE_VERSION: CLASSIFICATION_RULE_VERSION,
    CLASSES: CLASSES,
    POLICY: POLICY,
    RECONCILIATION_STATUS: RECONCILIATION_STATUS,
    US_PRIMARY_EXCHANGES: US_PRIMARY_EXCHANGES,
    NAME_ONLY_CLASSES: NAME_ONLY_CLASSES,
    tickerMarker: tickerMarker,
    nasdaqFifthLetter: nasdaqFifthLetter,
    looksLikeTestSecurity: looksLikeTestSecurity,
    collectListedRoots: collectListedRoots,
    policyBucket: policyBucket,
    PRODUCT_ELIGIBILITY: PRODUCT_ELIGIBILITY,
    IN_PRODUCT_UNIVERSE: IN_PRODUCT_UNIVERSE,
    decideProductEligibility: decideProductEligibility,
    classifySecurity: classifySecurity,
    buildSecurityMaster: buildSecurityMaster,
    DUPLICATE_RESOLUTION_SCHEMA: DUPLICATE_RESOLUTION_SCHEMA,
    DUPLICATE_RESOLUTION_LIMITS: DUPLICATE_RESOLUTION_LIMITS,
    indexDuplicateResolution: indexDuplicateResolution,
    canonicalId: canonicalId,
    parseCanonicalId: parseCanonicalId,
    sameVenue: sameVenue,
    /* Ausdruecklich exportiert, damit ein Test die Zusage selbst
       angreifen kann und nicht nur ihr Ergebnis: eine Wache, die nie
       ausgeloest hat, ist keine bewiesene Wache. */
    assertNonDestructive: assertNonDestructive
  };

  if (isNode) module.exports = api;
  else global.VUUsSecurityMaster = api;
})(typeof window !== "undefined" ? window : globalThis);
