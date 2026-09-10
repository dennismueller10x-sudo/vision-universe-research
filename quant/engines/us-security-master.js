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

  var VERSION = "us-security-master-1.0.0";

  /* Die Gattungen. Reihenfolge ist die Berichtsreihenfolge. */
  var CLASSES = [
    "EQUITY_COMMON", "ADR", "REIT", "SPAC", "PREFERRED", "TRUST",
    "ETF", "ETN", "ETP", "MUTUAL_FUND", "CEF", "INDEX",
    "WARRANT", "UNIT", "RIGHT", "OTHER", "UNKNOWN"
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
              "WARRANT", "UNIT", "RIGHT"]
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
    { type: "ADR",         re: /\b(ADR|ADS|AMERICAN DEPOSITAR(Y|IES)|DEPOSITARY (SHARE|RECEIPT))/i },
    { type: "REIT",        re: /\b(REIT|REAL ESTATE INVESTMENT TRUST)\b/i },
    { type: "SPAC",        re: /\b(SPAC|ACQUISITION CORP|ACQUISITION COMPANY|BLANK CHECK)\b/i },
    { type: "PREFERRED",   re: /\b(PREFERRED|PFD|PREF\.)/i },
    { type: "WARRANT",     re: /\bWARRANTS?\b/i },
    { type: "RIGHT",       re: /\bRIGHTS?\b/i },
    { type: "UNIT",        re: /\bUNITS?\b/i },
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
  var NAME_ONLY_CLASSES = ["ADR", "REIT", "SPAC", "TRUST", "ETN", "ETP", "CEF"];

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
    var byName = nameRule(name);

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

    /* 2. Indexsymbol. Ein fuehrendes $ oder ^ ist eindeutig und schlaegt
       jede Anbieterangabe - kein Emittent nennt eine Aktie so. */
    if (looksLikeIndex(ticker)) {
      cls = "INDEX"; confidence = "HIGH";
      reasons.push("Tickerpraefix '" + ticker.charAt(0) + "' weist das Symbol als Index aus.");
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
      if (byName.type !== cls && NAME_ONLY_CLASSES.indexOf(byName.type) >= 0) {
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
   * @returns {object} {rows, counts, duplicates, findings, invariants}
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

    /* --------------------------------------------- 1. Anbieterzeilen */
    var rows = [];
    var providerSeen = {};
    var tickerRowCount = {};

    providerRows.forEach(function (r) {
      var c = classifySecurity(r, { today: today, staleDays: input.staleDays });
      if (!c.ticker) return;
      providerSeen[c.ticker] = true;
      tickerRowCount[c.ticker] = (tickerRowCount[c.ticker] || 0) + 1;
      rows.push(makeRow(c, baselineByTicker[c.ticker] || null, "PROVIDER_SUPPORTED_TICKERS", stamp));
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
        }, { today: today, staleDays: input.staleDays });
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
      if (duplicateTickers[r.ticker]) {
        r.review_flags.push("DUPLICATE_TICKER_" + duplicateTickers[r.ticker]);
        /* Ein doppelter Ticker macht aus einer Neuaufnahme einen Fall
           fuer die Pruefung: welcher der beiden ist gemeint?

           Der Grund wird ANGEHAENGT und nicht ersetzt. Eine Zeile, die
           schon aus einem anderen Grund zur Pruefung steht, hat jetzt
           zwei - und wer nur den zuletzt geschriebenen liest, sucht
           spaeter den ersten. */
        if (r.reconciliation_status === "ADDED" || r.reconciliation_status === "EXISTING") {
          r.reconciliation_status = "REVIEW";
          r.reconciliation_reason = "AMBIGUOUS_DUPLICATE_TICKER";
        } else if (r.reconciliation_reason.indexOf("AMBIGUOUS_DUPLICATE_TICKER") < 0) {
          r.reconciliation_reason = r.reconciliation_reason + "+AMBIGUOUS_DUPLICATE_TICKER";
        }
      }
    });

    /* -------------------------------------------------- 4. Auszaehlung */
    var counts = tally(rows, baselineTickers.length, providerAvailable);
    var findings = collectFindings(rows, duplicates, providerAvailable);
    var invariants = assertNonDestructive(rows, baselineByTicker);

    return {
      version: VERSION,
      generatedFor: today,
      providerAvailable: providerAvailable,
      rows: rows,
      counts: counts,
      duplicates: duplicates,
      findings: findings,
      invariants: invariants
    };
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
    } else if (c.policyBucket === "EXCLUDE") {
      status = "EXCLUDED_CANDIDATE";
      reason = "NEW_NON_EQUITY:" + c.instrumentType;
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

    var activeCommon = 0, otcCommonDeferred = 0, baselinePreserved = 0;
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
      if (r.baseline_member) baselinePreserved++;
      if (!r.baseline_member) newByClass[r.instrument_type] = (newByClass[r.instrument_type] || 0) + 1;
      if (r.instrument_type === "EQUITY_COMMON" && r.active_status !== "INACTIVE" &&
          r.venue_tier === "PRIMARY" && r.country === "US") activeCommon++;
      if (r.eligibility_reason === "OTC_VENUE_OUT_OF_CURRENT_POLICY") otcCommonDeferred++;
    });

    return {
      rowsTotal: rows.length,
      baselineCount: baselineCount,
      baselinePreserved: baselinePreserved,
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

    var baselineReview = rows.filter(function (r) {
      return r.baseline_member && r.reconciliation_status === "REVIEW";
    });
    function ofFlag(flag) {
      return baselineReview.filter(function (r) { return r.review_flags.indexOf(flag) >= 0; });
    }

    var pref = baselineReview.filter(function (r) { return r.instrument_type === "PREFERRED"; });
    if (pref.length) {
      add("BASELINE_PREFERRED_CONTAMINATION", "HIGH", pref.length,
          "Bestandstitel, deren Ticker eine Vorzugsserie ausweist. Der Basis-Klassierer kennt " +
          "die dreiteilige Schreibweise (XXX-P-Y) nicht und hat sie als Stammaktie gefuehrt. " +
          "Sie bleiben im Bestand und werden NICHT entfernt.",
          pref.map(function (r) { return r.ticker; }));
    }
    ["ETF", "ETN", "ETP", "MUTUAL_FUND", "CEF", "INDEX", "WARRANT", "UNIT", "RIGHT",
     "TRUST", "ADR", "REIT", "SPAC"].forEach(function (cls) {
      var hits = baselineReview.filter(function (r) { return r.instrument_type === cls; });
      if (hits.length) {
        add("BASELINE_" + cls + "_CONTAMINATION", cls === "ETF" || cls === "MUTUAL_FUND" ? "HIGH" : "MEDIUM",
            hits.length, "Bestandstitel, die nach dieser Klassifikation " + cls + " sind. " +
            "Sie bleiben im Bestand; die Entscheidung ist eine eigene, ausdruecklich " +
            "freizugebende Migration.", hits.map(function (r) { return r.ticker; }));
      }
    });

    var inactive = ofFlag("LISTING_INACTIVE");
    if (inactive.length) {
      add("BASELINE_INACTIVE_LISTINGS", "MEDIUM", inactive.length,
          "Bestandstitel, deren Listing nach Anbieterangabe beendet ist. Ihre gelieferten " +
          "Daten bleiben erhalten.", inactive.map(function (r) { return r.ticker; }));
    }
    var venue = baselineReview.filter(function (r) { return r.venue_tier !== "PRIMARY"; });
    if (venue.length) {
      add("BASELINE_NON_PRIMARY_VENUE", "MEDIUM", venue.length,
          "Bestandstitel an einem Platz, der kein regulaerer US-Handelsplatz ist.",
          venue.map(function (r) { return r.ticker + "@" + r.exchange; }));
    }
    var notFound = rows.filter(function (r) {
      return r.baseline_member && r.review_flags.indexOf("NOT_IN_PROVIDER_UNIVERSE") >= 0;
    });
    if (notFound.length) {
      add("BASELINE_NOT_IN_PROVIDER_UNIVERSE", "HIGH", notFound.length,
          "Bestandstitel, die in der aktuellen Anbieterliste nicht mehr vorkommen. Nicht " +
          "loeschen: der Grund kann ein Symbolwechsel sein.",
          notFound.map(function (r) { return r.ticker; }));
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

  var api = {
    VERSION: VERSION,
    CLASSES: CLASSES,
    POLICY: POLICY,
    RECONCILIATION_STATUS: RECONCILIATION_STATUS,
    US_PRIMARY_EXCHANGES: US_PRIMARY_EXCHANGES,
    NAME_ONLY_CLASSES: NAME_ONLY_CLASSES,
    tickerMarker: tickerMarker,
    policyBucket: policyBucket,
    classifySecurity: classifySecurity,
    buildSecurityMaster: buildSecurityMaster,
    /* Ausdruecklich exportiert, damit ein Test die Zusage selbst
       angreifen kann und nicht nur ihr Ergebnis: eine Wache, die nie
       ausgeloest hat, ist keine bewiesene Wache. */
    assertNonDestructive: assertNonDestructive
  };

  if (isNode) module.exports = api;
  else global.VUUsSecurityMaster = api;
})(typeof window !== "undefined" ? window : globalThis);
