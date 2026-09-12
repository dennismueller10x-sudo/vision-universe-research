/* =========================================================================
   VISION UNIVERSE — company-master.js

   DER KANONISCHE COMPANY MASTER.

   Eine Instrumentenliste fuer das ganze Haus: Discover, Suche, Aktienseite,
   Markets, Watchlist, Quant. Nicht drei Universen mit drei Wahrheiten.

   WARUM DIESE DATEI EXISTIERT

   Bis hierher hat jede Oberflaeche ihr Universum aus dem Artefakt gezogen,
   das gerade greifbar war - Discover aus `factors-GATE_500.json`, die
   SEC-Pipeline aus einer handgepflegten Fuenferliste, die Suche aus dem
   Suchindex genau dieser 498 Titel. Jede dieser Quellen war fuer sich
   richtig und zusammen waren es drei Universen. Der Company Master ist die
   eine Liste, gegen die alle anderen aufloesen.

   DER SCHLUESSEL IST NICHT DER TICKER

   Ticker werden wiederverwendet, wechseln die Boerse, verschwinden nach
   einer Uebernahme und kollidieren international. Ein Datensatz, dessen
   Primaerschluessel der Ticker ist, verliert seine Historie in dem Moment,
   in dem genau das passiert - und merkt es nicht. Deshalb traegt jedes
   Instrument eine `instrumentId`, die aus den stabilen Anbieterkoordinaten
   abgeleitet und danach im Master fortgeschrieben wird: einmal vergeben,
   nie neu gewuerfelt.

   Der Ticker bleibt trotzdem sichtbar und adressierbar. URLs, Lesezeichen
   und bestehende Verweise arbeiten weiter mit ihm (§42); der Master haelt
   nur die Zuordnung stabil, wenn der Ticker es nicht mehr ist.

   KEINE OBERGRENZE

   In dieser Datei steht keine Zielzahl. Nicht 500, nicht 7.000, nicht
   50.000. Wie gross das Universum ist, entscheidet die Eingabe.

   Laeuft in Node und im Browser, bitgleich.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var Hash = isNode ? require("./hash.js") : global.VUHash;
  var Classification = isNode
    ? require("./instrument-classification.js")
    : global.VUInstrumentClassification;

  var VERSION = "company-master-1.0.0";

  /* Die Felder, die eine Aenderung ausmachen. Bewusst OHNE Zeitstempel:
     ein `lastSeenAt` in der Zeile wuerde bei jedem Lauf jede Zeile
     veraendern, und ein Sync, in dem alles UPDATED ist, sagt nichts.
     §14 verlangt, dass ein zweiter Lauf nichts kaputtmacht - er darf
     auch nichts erfinden. */
  var TRACKED_FIELDS = [
    "symbol", "companyName", "companyNameStatus", "exchange", "mic", "country",
    "currency", "securityType", "securityTypeConfidence", "shareClass", "subtype",
    "otc", "primaryListing", "primaryListingBasis", "active", "activeBasis",
    "delistedAt", "firstTradeDate", "lastTradeDate", "screenerEligible",
    "assetTypeRaw", "adrEvidence", "isin", "cusip", "figi", "cik", "cikSource", "lei"
  ];

  /* Die Faehigkeiten aus §30. Der Sinn ist nicht Vollstaendigkeit, sondern
     Ehrlichkeit: die Oberflaeche soll wissen, was sie zeigen darf, bevor
     sie es versucht. */
  var CAPABILITIES = [
    "HAS_PROFILE", "HAS_PRICE_SNAPSHOT", "HAS_PRICE_HISTORY", "HAS_INTRADAY",
    "HAS_LIVE", "HAS_SEC", "HAS_FUNDAMENTALS", "HAS_VALUATION", "HAS_ANALYSTS",
    "HAS_THEMES"
  ];

  /* Handelsplaetze, an denen ein Listing als Primaerlisting gelten darf.
     Die Anbieter-Tickerliste sagt nicht, ob ein Listing primaer ist - sie
     sagt nur, wo gehandelt wird. Diese Liste ist deshalb eine Ableitung
     mit benannter Grundlage und keine Anbieterangabe. */
  var PRIMARY_EXCHANGES = {
    "NASDAQ": "XNAS", "NYSE": "XNYS", "NYSE ARCA": "ARCX", "NYSE MKT": "XASE",
    "NYSE AMERICAN": "XASE", "AMEX": "XASE", "BATS": "BATS", "IEX": "IEXG"
  };

  /* Die Schreibweise der bestehenden securityIds. Sie stammt aus
     scripts/market/select-gate-universe.mjs und muss hier Zeichen fuer
     Zeichen dieselbe sein: BRK-A liegt im Bestand als "ref_BRK_A", und
     ein hier gebildetes "ref_BRK-A" waere ein zweiter Alias fuer
     dasselbe Papier - also kein Alias. */
  function legacySecurityId(symbol) {
    return "ref_" + String(symbol).replace(/[^A-Z0-9]/gi, "_");
  }

  function norm(v) { return v === null || v === undefined ? "" : String(v).trim(); }
  function upper(v) { return norm(v).toUpperCase(); }
  function nullable(v) { var s = norm(v); return s === "" ? null : s; }
  function isDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(norm(v)); }

  /* ------------------------------------------------------------- Identitaet

     Der Schluessel eines Instruments beim Anbieter. Boerse gehoert dazu:
     derselbe Ticker an NASDAQ und an PINK sind zwei Listings, und sie
     als eines zu fuehren waere genau die Vermischung, die §8 ausschliesst. */
  function providerKey(row) {
    return [
      upper(row.provider || "unknown"),
      upper(row.exchange || "UNKNOWN"),
      upper(row.symbol || row.ticker || row.providerSymbol)
    ].join("|");
  }

  /**
   * Vergibt eine Instrument-ID.
   *
   * Abgeleitet aus den Anbieterkoordinaten plus `generation`. Die
   * Generation ist normalerweise 0 und zaehlt hoch, wenn derselbe Ticker
   * an derselben Boerse ein zweites Mal vergeben wird - was bei
   * wiederverwendeten Kuerzeln real vorkommt. Ohne sie haetten zwei
   * verschiedene Unternehmen dieselbe ID.
   *
   * Das Startdatum geht NICHT in die ID ein: Anbieter korrigieren
   * Startdaten nachtraeglich, und eine ID, die sich bei einer
   * Datenkorrektur aendert, ist keine ID.
   */
  function mintInstrumentId(row, generation) {
    var g = generation === undefined || generation === null ? 0 : generation;
    return "vu_" + Hash.hashValue({ k: providerKey(row), g: g }).slice(0, 14);
  }

  /* ------------------------------------------------------- Normalisierung */

  /**
   * Aus einer Zeile Anbieter-Stammdaten wird ein kanonisches Instrument.
   *
   * @param {object} row  { ticker|symbol, exchange, assetType, currency,
   *                        startDate, endDate, name?, provider? }
   * @param {object} [opts] { today, staleDays, provider, classification }
   */
  function toInstrument(row, opts) {
    opts = opts || {};
    row = row || {};
    var provider = norm(opts.provider || row.provider) || "tiingo";
    var symbol = upper(row.symbol || row.ticker || row.providerSymbol);

    /* Die Gattung kommt aus der bestehenden Klassifikation. Eine zweite
       Implementierung derselben Frage waere eine zweite Antwort. */
    var c = opts.classification || Classification.classify({
      ticker: symbol,
      assetType: row.assetType,
      exchange: row.exchange,
      name: row.name || row.company || row.companyName,
      currency: row.currency || row.priceCurrency,
      startDate: row.startDate,
      endDate: row.endDate
    }, { today: opts.today, staleDays: opts.staleDays });

    var exchange = upper(row.exchange);
    var primary = PRIMARY_EXCHANGES[exchange];
    var companyName = nullable(row.name || row.company || row.companyName);

    var inst = {
      instrumentId: null,          /* wird beim Sync gesetzt oder gepraegt */
      symbol: symbol || null,
      companyName: companyName,
      companyNameStatus: companyName ? "PROVIDED" : "SOURCE_MISSING",
      exchange: nullable(row.exchange),
      mic: primary || null,
      country: c.country,
      currency: c.currency,
      securityType: c.instrumentType,
      securityTypeConfidence: c.confidence,
      shareClass: c.shareClass,
      subtype: c.subtype,
      otc: c.otc === true,
      primaryListing: primary ? true : (c.otc ? false : null),
      primaryListingBasis: primary
        ? "exchange:" + exchange
        : (c.otc ? "otcVenue:" + exchange
                 : "UNVERIFIED - der Anbieter nennt kein Primaerlisting."),
      active: c.active,
      activeBasis: c.activeBasis,
      delistedAt: c.active === false ? c.endDate : null,
      firstTradeDate: c.startDate,
      lastTradeDate: c.endDate,
      screenerEligible: c.screenerEligible,
      assetTypeRaw: c.assetType,
      adrEvidence: c.adrEvidence,

      /* §7, optionale Kennungen. Sie stehen hier als Feld und nicht als
         Kommentar: ein fehlendes Feld liest sich wie "nicht vorgesehen",
         ein null liest sich wie "nicht vorhanden". Nur das zweite
         stimmt. */
      isin: nullable(row.isin),
      cusip: nullable(row.cusip),
      figi: nullable(row.figi),
      cik: nullable(row.cik),
      cikSource: row.cik ? nullable(row.cikSource) || "input" : null,
      lei: nullable(row.lei),

      providerIds: {},
      legacyIds: [],
      firstSeen: null,
      generation: 0
    };

    inst.providerIds[provider] = {
      symbol: symbol || null,
      exchange: nullable(row.exchange),
      assetType: c.assetType
    };

    /* Bestehende Referenzen mitnehmen (§41). `ref_AAPL` ist der
       Schluessel, unter dem die Faktoren, die Gate-Universen und die
       Discover-Payloads dieses Titels heute liegen. Er verschwindet
       nicht, er wird zum Alias. */
    var legacy = nullable(row.securityId);
    if (legacy) inst.legacyIds.push(legacy);
    else if (symbol) inst.legacyIds.push(legacySecurityId(symbol));

    return inst;
  }

  /* ------------------------------------------------------------------ Sync

     NEW / UPDATED / UNCHANGED / DELISTED / REACTIVATED (§15).

     Der Sync ist idempotent (§14): derselbe Eingang auf denselben Bestand
     ergibt denselben Bestand, Zeile fuer Zeile, ID fuer ID. Getestet wird
     genau das - zweimal laufen lassen und vergleichen. */

  function changedFields(before, after) {
    var out = [];
    for (var i = 0; i < TRACKED_FIELDS.length; i++) {
      var f = TRACKED_FIELDS[i];
      var a = before[f] === undefined ? null : before[f];
      var b = after[f] === undefined ? null : after[f];
      if (a !== b) out.push(f);
    }
    return out;
  }

  /**
   * Fuehrt einen Eingang gegen einen Bestand zusammen.
   *
   * @param {object} args
   *   previous  Array bestehender Instrumente (oder []).
   *   incoming  Array kanonischer Instrumente aus toInstrument().
   *   today     "YYYY-MM-DD".
   *   provider  Anbieterkennung fuer den Schluessel.
   * @returns {object} { asOf, instruments, changes, counts }
   */
  function syncUniverse(args) {
    args = args || {};
    var previous = args.previous || [];
    var incoming = args.incoming || [];
    var today = args.today || new Date().toISOString().slice(0, 10);
    var provider = norm(args.provider) || "tiingo";

    /* Bestand nach Anbieterschluessel. Mehrere Generationen desselben
       Kuerzels landen in einer Liste, juengste zuletzt. */
    var byKey = Object.create(null);
    var byId = Object.create(null);
    previous.forEach(function (p) {
      var key = providerKey({
        provider: provider,
        exchange: (p.providerIds && p.providerIds[provider] && p.providerIds[provider].exchange) || p.exchange,
        symbol: (p.providerIds && p.providerIds[provider] && p.providerIds[provider].symbol) || p.symbol
      });
      (byKey[key] || (byKey[key] = [])).push(p);
      byId[p.instrumentId] = p;
    });

    var seenIds = Object.create(null);
    var out = [];
    var changes = { new: [], updated: [], unchanged: [], delisted: [], reactivated: [] };

    incoming.forEach(function (inc) {
      var key = providerKey({ provider: provider, exchange: inc.exchange, symbol: inc.symbol });
      var candidates = byKey[key] || [];

      /* Ein wiederverwendeter Ticker: der Bestand fuehrt das Kuerzel als
         beendet, und der Eingang beginnt NACH diesem Ende. Dann ist das
         nicht dasselbe Papier, sondern dasselbe Kuerzel. */
      var match = null;
      for (var i = candidates.length - 1; i >= 0; i--) {
        var cand = candidates[i];
        /* Ein wiederverwendetes Kuerzel erkennt man an drei Dingen
           zugleich: der Bestand ist beendet, der Eingang beginnt NACH
           diesem Ende, und er beginnt an einem ANDEREN Tag als der
           Bestand.
           Die dritte Bedingung ist die wichtige. Ohne sie loest eine
           einzige widerspruechliche Anbieterzeile - Startdatum nach
           Enddatum, das kommt vor - bei JEDEM Lauf eine neue Generation
           aus: derselbe Titel bekaeme bei jedem Sync eine neue ID, und
           der Master waere nach zehn Laeufen zehnmal so gross. Gefunden
           hat das der Scale Test, nicht die Ueberlegung. */
        var reused = cand.active === false && isDate(cand.lastTradeDate) &&
                     isDate(inc.firstTradeDate) && inc.firstTradeDate > cand.lastTradeDate &&
                     inc.firstTradeDate !== cand.firstTradeDate;
        if (!reused) { match = cand; break; }
      }

      var merged;
      if (match) {
        merged = mergeInto(match, inc, provider);
        var diff = changedFields(match, merged);
        if (diff.length === 0) {
          changes.unchanged.push(merged.instrumentId);
        } else if (match.active === false && merged.active !== false) {
          /* Nicht `=== true`. Ein Anbieter, der das Enddatum
             zurueckzieht, laesst `active` auf null stehen ("kein
             Enddatum") - und das ist genau der Fall, in dem ein Listing
             wieder laeuft. Auf `true` zu bestehen hiesse, die haeufigste
             Form der Wiederaufnahme als gewoehnliche Aenderung zu
             fuehren. */
          changes.reactivated.push({ instrumentId: merged.instrumentId, symbol: merged.symbol, fields: diff });
        } else {
          changes.updated.push({ instrumentId: merged.instrumentId, symbol: merged.symbol, fields: diff });
        }
      } else {
        var generation = candidates.length;
        merged = Object.assign({}, inc);
        merged.generation = generation;
        merged.instrumentId = mintInstrumentId(
          { provider: provider, exchange: inc.exchange, symbol: inc.symbol }, generation);
        merged.firstSeen = today;
        changes.new.push({ instrumentId: merged.instrumentId, symbol: merged.symbol });
      }

      seenIds[merged.instrumentId] = true;
      out.push(merged);
    });

    /* Was der Anbieter nicht mehr fuehrt, verschwindet nicht (§11). Es
       wird beendet - mit Datum, wo eines bekannt ist, und sonst mit dem
       Vermerk, dass nur das Verschwinden aus dem Verzeichnis belegt ist. */
    previous.forEach(function (p) {
      if (seenIds[p.instrumentId]) return;
      var row = Object.assign({}, p);
      if (row.active !== false) {
        row.active = false;
        row.delistedAt = isDate(row.lastTradeDate) ? row.lastTradeDate : today;
        row.activeBasis = isDate(row.lastTradeDate)
          ? "nicht mehr im Anbieterverzeichnis; letzter Handelstag " + row.lastTradeDate
          : "nicht mehr im Anbieterverzeichnis (seit " + today + "); kein Enddatum vom Anbieter";
        row.screenerEligible = false;
        changes.delisted.push({ instrumentId: row.instrumentId, symbol: row.symbol,
                                delistedAt: row.delistedAt });
      }
      out.push(row);
    });

    out.sort(function (a, b) {
      if (a.symbol === b.symbol) return a.instrumentId < b.instrumentId ? -1 : 1;
      return (a.symbol || "") < (b.symbol || "") ? -1 : 1;
    });

    return {
      version: VERSION,
      asOf: today,
      provider: provider,
      instruments: out,
      changes: changes,
      counts: {
        total: out.length,
        new: changes.new.length,
        updated: changes.updated.length,
        unchanged: changes.unchanged.length,
        delisted: changes.delisted.length,
        reactivated: changes.reactivated.length
      }
    };
  }

  /** Eingang auf Bestand legen: ID, Erstsichtung und Aliase bleiben. */
  function mergeInto(previous, incoming, provider) {
    var merged = Object.assign({}, previous);
    TRACKED_FIELDS.forEach(function (f) {
      /* Kennungen aus dem Bestand nicht mit einem leeren Eingang
         ueberschreiben. Eine einmal aufgeloeste CIK geht nicht dadurch
         verloren, dass die Tickerliste sie nicht kennt. */
      if ((f === "cik" || f === "isin" || f === "cusip" || f === "figi" || f === "lei" ||
           f === "cikSource" || f === "companyName") &&
          (incoming[f] === null || incoming[f] === undefined)) return;
      if (f === "companyNameStatus" && incoming.companyName === null && previous.companyName) return;
      merged[f] = incoming[f] === undefined ? null : incoming[f];
    });
    merged.instrumentId = previous.instrumentId;
    merged.generation = previous.generation || 0;
    merged.firstSeen = previous.firstSeen;
    merged.providerIds = Object.assign({}, previous.providerIds || {}, incoming.providerIds || {});
    var aliases = (previous.legacyIds || []).slice();
    (incoming.legacyIds || []).forEach(function (a) {
      if (aliases.indexOf(a) === -1) aliases.push(a);
    });
    merged.legacyIds = aliases;
    /* Wiederbelebt: das Enddatum aus dem Bestand faellt weg, sonst traegt
       ein laufendes Listing ein Delisting-Datum. */
    if (merged.active !== false) merged.delistedAt = null;
    return merged;
  }

  /* --------------------------------------------------- Data Capabilities

     §30. Was hier steht, ist keine Absicht, sondern eine Beobachtung:
     jede Faehigkeit wird aus einem vorliegenden Beleg gesetzt und sonst
     nicht. Eine Oberflaeche, die HAS_FUNDAMENTALS glaubt und nichts
     findet, zeigt eine leere Seite mit einer Ueberschrift. */
  function capabilityMatrix(instrument, evidence) {
    evidence = evidence || {};
    var caps = {};
    caps.HAS_PROFILE = !!(instrument && instrument.symbol);
    caps.HAS_PRICE_SNAPSHOT = evidence.priceSnapshot === true;
    /* Entweder eine gezaehlte Barzahl oder ein belegtes Ja ohne Zahl.
       Der zweite Fall ist real: der Gate-Bericht liefert Einzelzeilen nur
       fuer Befunde - ein Titel, der sauber durchgelaufen ist, steht dort
       gerade NICHT. Ihn deshalb als "kein Kursverlauf" zu fuehren waere
       die Umkehrung des Befundes. */
    caps.HAS_PRICE_HISTORY = evidence.priceHistoryBars > 0 ||
                             evidence.priceHistoryVerified === true;
    caps.HAS_INTRADAY = evidence.intraday === true;
    caps.HAS_LIVE = evidence.live === true;
    caps.HAS_SEC = !!(instrument && instrument.cik);
    caps.HAS_FUNDAMENTALS = evidence.fundamentalPeriods > 0;
    caps.HAS_VALUATION = evidence.valuation === true;
    caps.HAS_ANALYSTS = evidence.analysts === true;
    caps.HAS_THEMES = Array.isArray(evidence.themes) && evidence.themes.length > 0;
    return caps;
  }

  /** Kompakte Fassung fuer die Auslieferung: nur die gesetzten Flags. */
  function capabilityFlags(caps) {
    return CAPABILITIES.filter(function (c) { return caps[c] === true; });
  }

  /* ------------------------------------------------------------ Suchindex

     §18. Der Index traegt so wenig wie moeglich: Kuerzel, Name, Boerse,
     Land, Gattung. Alles andere kostet Bytes im Browser und beantwortet
     keine Suchanfrage. Themen und Branche kommen spaeter dazu - als Feld,
     nicht als neuer Index. */
  function searchEntry(instrument, extra) {
    var e = {
      i: instrument.instrumentId,
      s: instrument.symbol,
      n: instrument.companyName || null,
      x: instrument.exchange || null,
      c: instrument.country || null,
      t: instrument.securityType,
      a: instrument.active === false ? 0 : 1
    };
    if (extra && extra.aliases && extra.aliases.length) e.al = extra.aliases;
    if (extra && extra.capabilities && extra.capabilities.length) e.cap = extra.capabilities;
    return e;
  }

  /**
   * Der Scherbenschluessel eines Kuerzels.
   *
   * Zwei Zeichen. Bei 7.000 Titeln sind das im Schnitt rund 20 Zeilen je
   * Scherbe, bei 70.000 rund 200 - beides laedt der Browser einzeln, ohne
   * dass jemand die Aufteilung neu erfinden muss (§6, §19).
   */
  function shardKey(symbol) {
    var s = upper(symbol).replace(/[^A-Z0-9]/g, "");
    if (!s) return "_";
    /* Einbuchstabige Kuerzel gibt es wirklich - F, T, C, A sind
       Grossunternehmen. Sie mit dem Rest in eine Sammelscherbe "_" zu
       werfen macht sie unauffindbar: wer "F" tippt, laedt die Scherbe
       "F_", und dort steht dann nichts. Sie bekommen deshalb ihre eigene
       Scherbe mit Fuellzeichen. */
    return (s + "_").slice(0, 2);
  }

  /* Prefix-Suche ueber einen bereits geladenen Index. Dieselbe Rangfolge
     wie bisher in der Oberflaeche: exakter Treffer, dann Praefix, dann
     enthalten - wer "NVDA" tippt, meint nicht "NVR". */
  function rankMatches(entries, query, limit) {
    var q = upper(query);
    if (!q) return [];
    var exact = [], starts = [], nameStarts = [], contains = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var s = upper(e.s);
      var n = upper(e.n || "");
      if (s === q) exact.push(e);
      else if (s.indexOf(q) === 0) starts.push(e);
      else if (n.indexOf(q) === 0) nameStarts.push(e);
      else if (n.indexOf(q) !== -1 || s.indexOf(q) !== -1) contains.push(e);
    }
    var byActiveThenSymbol = function (a, b) {
      if ((b.a === 0 ? 0 : 1) !== (a.a === 0 ? 0 : 1)) return (b.a === 0 ? 0 : 1) - (a.a === 0 ? 0 : 1);
      return a.s < b.s ? -1 : a.s > b.s ? 1 : 0;
    };
    starts.sort(byActiveThenSymbol);
    nameStarts.sort(byActiveThenSymbol);
    contains.sort(byActiveThenSymbol);
    var all = exact.concat(starts, nameStarts, contains);
    return limit ? all.slice(0, limit) : all;
  }

  /* ---------------------------------------------------------- Datenqualitaet

     §45. Der Bericht zaehlt Befunde, er repariert nichts. Ein Sync, der
     stillschweigend Duplikate zusammenfasst, verliert genau die Zeile,
     die jemand haette sehen muessen. */
  function qualityReport(instruments) {
    var bySymbol = Object.create(null);
    var byProviderId = Object.create(null);
    var byCik = Object.create(null);
    var byId = Object.create(null);

    var findings = {
      duplicateInstrumentIds: [], duplicateSymbols: [], duplicateProviderIds: [],
      duplicateCiks: [], missingName: 0, missingExchange: 0, missingCurrency: 0,
      missingCountry: 0, invalidCik: [], unknownSecurityType: 0, inactive: 0,
      noFirstTradeDate: 0, symbolWithWhitespace: []
    };

    instruments.forEach(function (r) {
      if (byId[r.instrumentId]) findings.duplicateInstrumentIds.push(r.instrumentId);
      byId[r.instrumentId] = true;

      var sk = upper(r.symbol) + "@" + upper(r.exchange);
      if (bySymbol[sk]) {
        /* Zwei aktive Listings unter demselben Kuerzel an derselben
           Boerse sind ein Befund. Ein aktives neben einem beendeten ist
           ein wiederverwendetes Kuerzel und damit erwartet. */
        if (r.active !== false && bySymbol[sk].active !== false) {
          findings.duplicateSymbols.push({ symbol: r.symbol, exchange: r.exchange,
                                           ids: [bySymbol[sk].instrumentId, r.instrumentId] });
        }
      } else bySymbol[sk] = r;

      Object.keys(r.providerIds || {}).forEach(function (p) {
        var pid = r.providerIds[p];
        var pk = p + "|" + upper(pid && pid.exchange) + "|" + upper(pid && pid.symbol);
        if (byProviderId[pk] && r.active !== false && byProviderId[pk].active !== false) {
          findings.duplicateProviderIds.push({ provider: p, key: pk,
                                               ids: [byProviderId[pk].instrumentId, r.instrumentId] });
        } else if (!byProviderId[pk]) byProviderId[pk] = r;
      });

      if (!r.companyName) findings.missingName++;
      if (!r.exchange) findings.missingExchange++;
      if (!r.currency) findings.missingCurrency++;
      if (!r.country) findings.missingCountry++;
      if (r.securityType === "UNKNOWN") findings.unknownSecurityType++;
      if (r.active === false) findings.inactive++;
      if (!r.firstTradeDate) findings.noFirstTradeDate++;
      if (upper(r.symbol) !== norm(r.symbol)) findings.symbolWithWhitespace.push(r.instrumentId);

      if (r.cik) {
        if (!/^\d{10}$/.test(String(r.cik))) findings.invalidCik.push({ id: r.instrumentId, cik: r.cik });
        else if (byCik[r.cik]) {
          /* Eine CIK auf mehreren Instrumenten ist NICHT automatisch ein
             Fehler: Vorzuege und Aktienklassen desselben Emittenten
             teilen sich eine CIK. Gemeldet wird nur, was sich derselbe
             Emittent UND dasselbe Kuerzel teilen. */
          if (upper(byCik[r.cik].symbol) === upper(r.symbol)) {
            findings.duplicateCiks.push({ cik: r.cik,
                                          ids: [byCik[r.cik].instrumentId, r.instrumentId] });
          }
        } else byCik[r.cik] = r;
      }
    });

    return {
      version: VERSION,
      total: instruments.length,
      findings: findings,
      blocking: findings.duplicateInstrumentIds.length > 0 ||
                findings.duplicateSymbols.length > 0 ||
                findings.duplicateProviderIds.length > 0 ||
                findings.invalidCik.length > 0
    };
  }

  /* ------------------------------------------------------- Coverage Report

     §43. Maschinenlesbar, und jede Zahl gezaehlt statt behauptet (§44). */
  function coverageReport(instruments, opts) {
    opts = opts || {};
    var evidence = opts.evidence || {};
    var providerTotal = opts.providerInstruments;

    var t = {
      TOTAL_PROVIDER_INSTRUMENTS: providerTotal === undefined ? null : providerTotal,
      TOTAL_IN_COMPANY_MASTER: instruments.length,
      TOTAL_EQUITIES: 0, TOTAL_COMMON_STOCKS: 0, TOTAL_ADRS: 0, TOTAL_ETFS: 0,
      TOTAL_ETNS: 0, TOTAL_FUNDS: 0, TOTAL_PREFERRED: 0, TOTAL_WARRANTS: 0,
      TOTAL_OTHER: 0, TOTAL_UNKNOWN_TYPE: 0,
      TOTAL_ACTIVE: 0, TOTAL_INACTIVE: 0, TOTAL_ACTIVE_UNKNOWN: 0,
      TOTAL_US: 0, TOTAL_NON_US: 0, TOTAL_COUNTRY_UNKNOWN: 0,
      TOTAL_OTC: 0, TOTAL_PRIMARY_LISTING: 0,
      TOTAL_WITH_NAME: 0, TOTAL_WITH_CIK: 0,
      TOTAL_WITH_PRICE_SNAPSHOT: 0, TOTAL_WITH_PRICE_HISTORY: 0,
      TOTAL_WITH_FUNDAMENTALS: 0, TOTAL_SCREENER_ELIGIBLE: 0
    };
    var byType = { COMMON_STOCK: "TOTAL_COMMON_STOCKS", ADR: "TOTAL_ADRS",
                   ETF: "TOTAL_ETFS", ETN: "TOTAL_ETNS", FUND: "TOTAL_FUNDS",
                   PREFERRED: "TOTAL_PREFERRED", WARRANT: "TOTAL_WARRANTS",
                   OTHER: "TOTAL_OTHER", UNKNOWN: "TOTAL_UNKNOWN_TYPE" };

    instruments.forEach(function (r) {
      var bucket = byType[r.securityType];
      if (bucket) t[bucket]++;
      if (r.securityType === "COMMON_STOCK" || r.securityType === "ADR" ||
          r.securityType === "PREFERRED") t.TOTAL_EQUITIES++;
      if (r.active === true) t.TOTAL_ACTIVE++;
      else if (r.active === false) t.TOTAL_INACTIVE++;
      else t.TOTAL_ACTIVE_UNKNOWN++;
      if (r.country === "US") t.TOTAL_US++;
      else if (r.country) t.TOTAL_NON_US++;
      else t.TOTAL_COUNTRY_UNKNOWN++;
      if (r.otc) t.TOTAL_OTC++;
      if (r.primaryListing === true) t.TOTAL_PRIMARY_LISTING++;
      if (r.companyName) t.TOTAL_WITH_NAME++;
      if (r.cik) t.TOTAL_WITH_CIK++;
      if (r.screenerEligible) t.TOTAL_SCREENER_ELIGIBLE++;
      var ev = evidence[r.instrumentId] || evidence[r.symbol] || null;
      if (ev) {
        if (ev.priceSnapshot === true) t.TOTAL_WITH_PRICE_SNAPSHOT++;
        if (ev.priceHistoryBars > 0 || ev.priceHistoryVerified === true) t.TOTAL_WITH_PRICE_HISTORY++;
        if (ev.fundamentalPeriods > 0) t.TOTAL_WITH_FUNDAMENTALS++;
      }
    });
    return t;
  }

  var api = {
    VERSION: VERSION,
    CAPABILITIES: CAPABILITIES,
    TRACKED_FIELDS: TRACKED_FIELDS,
    PRIMARY_EXCHANGES: PRIMARY_EXCHANGES,
    legacySecurityId: legacySecurityId,
    providerKey: providerKey,
    mintInstrumentId: mintInstrumentId,
    toInstrument: toInstrument,
    syncUniverse: syncUniverse,
    changedFields: changedFields,
    capabilityMatrix: capabilityMatrix,
    capabilityFlags: capabilityFlags,
    searchEntry: searchEntry,
    shardKey: shardKey,
    rankMatches: rankMatches,
    qualityReport: qualityReport,
    coverageReport: coverageReport
  };

  if (isNode) module.exports = api;
  else global.VUCompanyMaster = api;
})(typeof window !== "undefined" ? window : globalThis);
