/* =========================================================================
   VISION UNIVERSE — quant/api/multi-asset-contract.js   (Multi-Asset Core §34-37, §49, §52)

   DER EINE PRODUCT CONTRACT FUER INDEX, ROHSTOFF, METALL, KRYPTO, FX,
   RENDITE UND LEITZINS.

   Discover, Screener, Reports, ein Macro-Dashboard und eine spaetere App
   lesen dieselbe Struktur. Keine Oberflaeche baut sich ihre eigene
   Index-, Rohstoff- oder Zinslogik; keine liest einen Anbieter.

   DREI SCHRITTE, DREI ORTE

     build()    im Ingest (Node): aus Master-Zeile + Beobachtungen wird
                der Vertrag. Native Werte, native Einheit, keine Anzeige.
     refresh()  im Browser: die Freshness haengt an der Uhr - sie wird zum
                Anzeigezeitpunkt neu bewertet, nicht beim Bauen eingefroren.
     present()  im Browser: Anzeigewaehrung ueber den Currency Core
                (VUFx.layer), NUR fuer umrechenbare Einheiten.

   DIE DATENWAHRHEIT BLEIBT TYPISIERT

   Es gibt kein gemeinsames Feld `price`. Es gibt `quote.value` MIT
   `valueSemantics` (INDEX_LEVEL, PRICE, YIELD, POLICY_RATE, FX_RATE) und
   `unit`. Eine Rendite-Veraenderung heisst `basisPoints`; ihre relative
   Veraenderung heisst `relativePercent` und ist nie die Hauptgroesse.

   Laeuft in Node und im Browser.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Taxonomy = isNode ? require("../engines/multi-asset/asset-taxonomy.js") : (global.VUMultiAsset && global.VUMultiAsset.Taxonomy);
  var AssetFreshness = isNode ? require("../engines/realtime/asset-freshness.js") : (global.VURealtime && global.VURealtime.AssetFreshness);

  var CONTRACT_VERSION = "multi-asset-contract-1.1.0";
  /* 1.1.0 (Owner-Entscheidung 2026-09-25, Tiingo-first): Index-Tracker als
     eigene Instrumente (assetClass ETF, instrumentSubtype INDEX_TRACKER,
     isProxy true, Kennzeichnung fuer den Consumer) und die Lizenz jedes
     Wertes in einem festen Vokabular. Nichts Bestehendes entfaellt. */
  var LICENSE_STATES = ["LICENSE_CONFIRMED", "OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT",
                        "PRE_COMMERCIAL_LICENSE_CONFIRMATION_REQUIRED", "UNAVAILABLE"];
  var QUOTE_STATES = ["AVAILABLE", "WITHHELD_LICENSE", "CAPABILITY_GAP", "SOURCE_MISSING"];
  var HORIZONS = { "1W": 7, "1M": 30, "3M": 91, "1Y": 365, "5Y": 1826, "10Y": 3652 };
  var DAY_MS = 86400000;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function round(v, d) { if (!isNum(v)) return null; var f = Math.pow(10, d); return Math.round(v * f) / f; }
  function dayMs(iso) { return Date.parse(String(iso).slice(0, 10) + "T00:00:00Z"); }
  function isoOf(t) { return new Date(t).toISOString().slice(0, 10); }

  /* Der letzte Punkt am oder vor einem Tag. Die Reihe ist aufsteigend. */
  function atOrBefore(points, iso) {
    for (var i = points.length - 1; i >= 0; i--) if (points[i][0] <= iso) return points[i];
    return null;
  }

  /**
   * Die Veraenderung zwischen zwei Werten nach der Semantik der Klasse.
   *
   *   PERCENT_OF_VALUE  {absolute, percent}
   *   BASIS_POINTS      {absolute (Prozentpunkte), basisPoints, relativePercent}
   */
  function change(current, reference, semantics) {
    if (!isNum(current) || !isNum(reference)) return null;
    var abs = current - reference;
    if (semantics === "BASIS_POINTS") {
      return {
        semantics: "BASIS_POINTS",
        absolutePercentagePoints: round(abs, 4),
        basisPoints: round(abs * 100, 1),
        relativePercent: reference !== 0 ? round(abs / Math.abs(reference) * 100, 2) : null,
        relativePercentNote: "Relative Veraenderung des Zinsniveaus - nicht die Zinsbewegung. Die Bewegung sind die Basispunkte."
      };
    }
    return { semantics: "PERCENT_OF_VALUE", absolute: round(abs, 6),
             percent: reference !== 0 ? round(abs / reference * 100, 2) : null };
  }

  /** Verfuegbare Zeitraeume - nur, wo die Reihe sie wirklich traegt (§35, §50). */
  function horizons(points, hasIntraday, representation, now) {
    var out = { "1D": !!hasIntraday };
    /* Eine Stufenserie ist an jedem Tag definiert, auch wenn sie nur an
       Beschlusstagen einen Punkt hat. */
    if (representation === "STEPS" && points && points.length) {
      var f0 = dayMs(points[0][0]), now0 = now !== undefined ? new Date(now).getTime() : Date.now();
      Object.keys(HORIZONS).forEach(function (h) { out[h] = f0 <= now0 - HORIZONS[h] * DAY_MS; });
      out.MAX = true;
      return out;
    }
    if (!points || points.length < 2) {
      Object.keys(HORIZONS).forEach(function (h) { out[h] = false; });
      out.MAX = false;
      return out;
    }
    var first = dayMs(points[0][0]), last = dayMs(points[points.length - 1][0]);
    Object.keys(HORIZONS).forEach(function (h) {
      var start = last - HORIZONS[h] * DAY_MS;
      /* Der Zeitraum ist nur da, wenn die Reihe vor seinem Beginn anfaengt
         UND in ihm mindestens zwei Punkte liegen. */
      var inside = 0;
      for (var i = points.length - 1; i >= 0 && dayMs(points[i][0]) >= start; i--) inside++;
      out[h] = first <= start && inside >= 2;
    });
    out.MAX = true;
    return out;
  }

  /** Veraenderung je Zeitraum, gegen den letzten Punkt am oder vor dem Start. */
  function performance(points, semantics, avail) {
    var out = {};
    if (!points || points.length < 2) return out;
    var last = points[points.length - 1];
    Object.keys(HORIZONS).forEach(function (h) {
      if (!avail[h]) return;
      var ref = atOrBefore(points, isoOf(dayMs(last[0]) - HORIZONS[h] * DAY_MS));
      if (ref) { var c = change(last[1], ref[1], semantics); if (c) { c.fromDate = ref[0]; out[h] = c; } }
    });
    var first = points[0];
    var m = change(last[1], first[1], semantics);
    if (m) { m.fromDate = first[0]; out.MAX = m; }
    return out;
  }

  /**
   * Baut den Vertrag fuer ein Instrument.
   *
   * @param {object} input
   *   instrument   aufgeloeste Master-Zeile (instrument-catalog.js#resolve)
   *   series       {points: [[date, value]], frequency, source, ...} oder null
   *   latest       {value, lower, upper, asOf, observationDate, frequency,
   *                 checkedAt, effectiveSince} oder null (Standard: letzter
   *                 Punkt der Reihe)
   *   source       Eintrag aus multi-asset.json#sourceRegistry
   *   capabilities gemessene Faehigkeiten {eod, intraday, realtime, websocket}
   *   historyPath  veroeffentlichter Pfad der Reihe oder null
   *   now, calendar, config
   */
  function build(input) {
    var i = input.instrument;
    var src = input.source || null;
    var points = input.series && Array.isArray(input.series.points) ? input.series.points : [];
    var semantics = Taxonomy.changeSemantics(i.valueSemantics);
    var unit = Taxonomy.UNITS[i.unit] || Taxonomy.UNITS.UNRESOLVED;
    var withheld = i.status === "LICENSE_PENDING" || (src && src.publicDisplay === false && i.status === "ACTIVE");

    var latest = input.latest || (points.length ? { value: points[points.length - 1][1], asOf: points[points.length - 1][0],
                                                    observationDate: points[points.length - 1][0],
                                                    frequency: (input.series && input.series.frequency) || "DAILY" } : null);
    var previous = points.length >= 2 ? points[points.length - 2] : null;
    /* Kommt der juengste Wert aus einem juengeren Tag als die Tagesreihe
       (Intraday-Stand), ist die Referenz der letzte Tagesschluss. */
    if (input.latest && points.length && input.latest.observationDate && input.latest.observationDate > points[points.length - 1][0]) {
      previous = points[points.length - 1];
    }
    /* Stufenserie: die Veraenderung ist die zum vorherigen Beschluss,
       nicht zum Vortag (der ist derselbe Wert). */
    if (i.sessionProfile === "POLICY_EVENT" && points.length >= 2) {
      for (var k = points.length - 2; k >= 0; k--) if (points[k][1] !== points[points.length - 1][1]) { previous = points[k]; break; }
    }

    var quoteState = i.status === "CAPABILITY_GAP" ? "CAPABILITY_GAP"
      : withheld ? "WITHHELD_LICENSE"
      : (!latest || (!isNum(latest.value) && !isNum(latest.upper))) ? "SOURCE_MISSING" : "AVAILABLE";
    var show = quoteState === "AVAILABLE";

    var representation = input.series ? input.series.representation || "OBSERVATIONS" : null;
    var avail = horizons(points, !!(input.capabilities && input.capabilities.intradayPublished), representation, input.now);
    var observation = latest ? { asOf: latest.asOf, observationDate: latest.observationDate || null,
                                 frequency: latest.frequency || "DAILY", checkedAt: latest.checkedAt || null,
                                 effectiveSince: latest.effectiveSince || null } : null;
    var fresh = AssetFreshness.assess({ instrument: i, observation: observation, now: input.now,
                                        calendar: input.calendar, config: input.config });

    var tr = i.subType === "INDEX_TRACKER" ? (i.tracker || {}) : null;
    var displayLicense = src ? (LICENSE_STATES.indexOf(src.displayLicense) !== -1 ? src.displayLicense : "UNAVAILABLE") : "UNAVAILABLE";
    var quoteChange = show && previous && latest ? change(latest.value, previous[1], semantics) : null;

    var contract = {
      contractVersion: CONTRACT_VERSION,
      instrument: {
        instrumentId: i.instrumentId, symbol: i.symbol, name: i.name, nameDe: i.nameDe || i.name,
        assetClass: i.assetClass, assetType: i.assetClass, subType: i.subType, instrumentSubtype: i.subType, subTypeNote: i.subTypeNote || null,
        yieldKind: i.yieldKind || null, family: i.family || null, exchangeOrVenue: i.exchangeOrVenue || null,
        country: i.country || null, timezone: i.timezone || null, tenorYears: i.tenorYears || null,
        status: i.status
      },
      quote: {
        state: quoteState,
        valueSemantics: i.valueSemantics,
        valueKind: i.valueKind || "SCALAR",
        value: show && latest && isNum(latest.value) ? latest.value : null,
        range: show && latest && isNum(latest.lower) && isNum(latest.upper) ? { lower: latest.lower, upper: latest.upper } : null,
        unit: i.unit, unitId: i.unitId || Taxonomy.unitId(i.unit, i.currency, i.quantity),
        unitDisplay: unit.display, decimals: unit.decimals,
        nativeCurrency: i.currency || null,
        currencyContext: i.currencyContext || null,
        asOf: latest ? latest.asOf : null,
        observationDate: latest ? latest.observationDate || null : null,
        change: quoteChange,
        changeReferenceDate: show && previous ? previous[0] : null
      },
      market: {
        state: fresh.session ? fresh.session.marketState : null,
        sessionProfile: i.sessionProfile,
        sessionExchange: i.sessionExchange || null,
        publisherProfile: i.publisherProfile || null,
        timezone: fresh.session ? fresh.session.timezone : i.timezone || null,
        calendarCoverage: fresh.session ? !!fresh.session.calendarCoverage : false,
        /* Ein Tracker handelt in der US-ETF-Sitzung - nicht in der
           Berechnungszeit seines Index (§14 der Owner-Entscheidung). */
        displayMarket: tr ? tr.tracksIndex || null : null,
        underlyingType: tr ? tr.underlyingType || "INDEX" : null,
        trackedBy: tr ? i.symbol : null,
        tradingSession: tr ? "US_EQUITY_ETF" : null
      },
      data: {
        source: i.source || null,
        sourceKind: src ? src.kind : null,
        sourceInstrument: i.providerIdentifiers || {},
        freshness: { state: fresh.state, reason: fresh.reason, checkedAt: fresh.checkedAt },
        sourceState: fresh.state,
        frequency: latest ? latest.frequency || "DAILY" : null,
        /* Wann die Quelle zuletzt abgefragt wurde - fuer Stufenserien der
           Massstab der Frische, nicht das Datum des Beschlusses. */
        checkedAt: (latest && latest.checkedAt) || (input.series && input.series.fetchedAt) || null,
        realtime: fresh.state === "LIVE",
        delayed: !!(latest && latest.frequency === "INTRADAY"),
        eod: !!(latest && (latest.frequency === "DAILY" || latest.frequency === "EVENT")),
        provenance: {
          sourceId: i.source || null, provider: src ? src.provider : null, product: src ? src.product : null,
          licenseState: src ? src.licenseState : null, publicDisplay: src ? !!src.publicDisplay : false,
          attribution: src ? src.attribution : null,
          priceSemantics: i.priceSemantics || null,
          fetchedAt: input.series ? input.series.fetchedAt || null : null
        }
      },
      history: {
        available: show && points.length > 0,
        availableFrom: show && points.length ? points[0][0] : null,
        availableTo: show && points.length ? points[points.length - 1][0] : null,
        observations: show ? points.length : 0,
        frequency: input.series ? input.series.frequency || null : null,
        representation: representation,
        observedThrough: input.series ? input.series.observedThrough || null : null,
        scheduledChange: input.series ? input.series.scheduledChange || null : null,
        intervals: show ? avail : {},
        recent: show ? points.slice(-66) : [],
        path: show ? input.historyPath || null : null,
        intradayPath: show && input.capabilities && input.capabilities.intradayPublished ? input.intradayPath || null : null
      },
      performance: show ? performance(points, semantics, avail) : {},
      capabilities: {
        eod: !!(input.capabilities && input.capabilities.eod),
        intraday: !!(input.capabilities && input.capabilities.intraday),
        realtime: !!(input.capabilities && input.capabilities.realtime),
        websocket: !!(input.capabilities && input.capabilities.websocket),
        /* Welcher bestehende Pfad Echtzeit tragen kann - eine Faehigkeit,
           keine Behauptung. LIVE sagt nur data.freshness. */
        realtimeCapability: (input.capabilities && input.capabilities.realtimePath) || null,
        currencyConversion: Taxonomy.conversionFor(i.assetClass, i.unit)
      },
      displaySemantics: {
        changeSemantics: semantics,
        primaryChange: semantics === "BASIS_POINTS" ? "basisPoints" : "percent",
        comparableAcrossClasses: false,
        note: semantics === "BASIS_POINTS"
          ? "Zinsniveau in Prozent; Bewegungen in Basispunkten. Nicht mit Kursrenditen vergleichbar."
          : i.assetClass === "INDEX" ? "Indexstand in Punkten - keine Geldsumme, wird nicht umgerechnet."
          : tr ? "Kurs des Trackers je Anteil in " + (i.currency || "?") + " - kein Indexstand, keine Indexpunkte. Die Veraenderung ist die Bewegung des Trackers." : null
      },
      proxy: tr ? {
        isProxy: true, relation: "INDEX_TRACKER_ETF", represents: tr.tracksIndex || null, representsName: tr.tracksIndexName || null,
        representsInstrument: tr.tracksIndexInstrument || null, isIndexLevel: false,
        disclosure: tr.trackerDisclosure || null, differences: tr.differences || [], currencyNote: tr.currencyNote || null,
        knownProxiesNotUsed: []
      } : { isProxy: false, represents: null, knownProxiesNotUsed: i.knownProxies || [] },
      /* Consumer-Sicht eines Trackers: die Felder, die eine Marktuebersicht
         braucht - aus demselben Vertrag, nicht daneben berechnet. */
      tracker: tr ? {
        symbol: i.symbol, name: i.name, tracksIndex: tr.tracksIndex || null, tracksIndexName: tr.tracksIndexName || null,
        isProxy: true, provider: src ? src.provider : null, nativeCurrency: i.currency || null,
        price: show && latest && isNum(latest.value) ? latest.value : null,
        change: quoteChange ? quoteChange.absolute : null,
        changePercent: quoteChange ? quoteChange.percent : null,
        asOf: latest ? latest.asOf : null,
        freshness: fresh.state,
        history: show && points.length ? { from: points[0][0], to: points[points.length - 1][0], path: input.historyPath || null } : null,
        realtimeCapability: (input.capabilities && input.capabilities.realtimePath) || null,
        displayMarketName: tr.displayMarketName || null,
        trackerDisclosure: tr.trackerDisclosure || null,
        performanceSemantics: tr.performanceSemantics || null
      } : null,
      gap: i.status === "CAPABILITY_GAP" ? i.gap || null : null,
      /* Lizenz jedes Wertes im festen Vokabular (LICENSE_STATES). Eine
         Development-Risikoakzeptanz ist KEINE kommerzielle Freigabe. */
      license: {
        state: displayLicense,
        commercialDisplayApproved: !!(src && src.commercialDisplayApproved === true && displayLicense === "LICENSE_CONFIRMED"),
        preCommercialLicenseConfirmationRequired: !!(src && src.preCommercialLicenseConfirmationRequired),
        withheld: withheld,
        sourceLicenseState: src ? src.licenseState : null,
        note: src ? src.licenseNote || null : null
      }
    };
    return contract;
  }

  /** Freshness zum Anzeigezeitpunkt neu bewerten (die Uhr laeuft weiter). */
  function refresh(contract, opts) {
    opts = opts || {};
    var c = contract;
    if (!c || !c.quote || !c.quote.asOf) return c;
    var inst = { sessionProfile: c.market.sessionProfile, sessionExchange: c.market.sessionExchange,
                 publisherProfile: c.market.publisherProfile || null };
    var f = AssetFreshness.assess({
      instrument: inst,
      observation: { asOf: c.quote.asOf, observationDate: c.quote.observationDate, frequency: c.data.frequency,
                     checkedAt: c.data.checkedAt || null },
      now: opts.now, calendar: opts.calendar, config: opts.config
    });
    var out = JSON.parse(JSON.stringify(c));
    out.data.freshness = { state: f.state, reason: f.reason, checkedAt: c.data.freshness.checkedAt, assessedAt: f.checkedAt };
    out.data.sourceState = f.state;
    out.data.realtime = f.state === "LIVE";
    out.market.state = f.session ? f.session.marketState : out.market.state;
    return out;
  }

  /**
   * Anzeige: native Einheit bleibt erhalten, die Anzeigewaehrung kommt nur
   * fuer umrechenbare Einheiten aus dem Currency Core (§32, §33, §48).
   *
   * @param {object} contract
   * @param {object} opts {layer: VUFx.layer, displayCurrency}
   */
  function present(contract, opts) {
    opts = opts || {};
    var q = contract.quote;
    var policy = contract.capabilities.currencyConversion;
    var out = { native: { value: q.value, range: q.range, unit: q.unit, unitId: q.unitId, currency: q.nativeCurrency },
                display: { value: q.value, range: q.range, currency: q.nativeCurrency, unitDisplay: q.unitDisplay },
                conversion: { policy: policy, applied: false, reason: null } };
    if (q.state !== "AVAILABLE") { out.conversion.reason = "noValue"; return out; }
    if (policy !== "CONVERTIBLE") {
      out.conversion.reason = policy === "SELF" ? "fxPairIsNotConverted" : "notMonetary";
      return out;
    }
    var layer = opts.layer;
    var target = opts.displayCurrency || (layer && layer.preference && layer.preference.get && layer.preference.get()) || q.nativeCurrency;
    if (!layer || !target || target === q.nativeCurrency) { out.conversion.reason = !layer ? "noCurrencyLayer" : "sameCurrency"; return out; }
    var m = layer.price(q.value, q.nativeCurrency, { displayCurrency: target });
    if (m && m.available && m.display && isNum(m.display.value)) {
      out.display.value = m.display.value;
      out.display.currency = m.display.currency;
      out.conversion = { policy: policy, applied: true, reason: null, fx: m.fx || null, freshness: m.freshness || null,
                         attribution: m.attribution || null,
                         note: "Umgerechnet ueber den Currency Core; die Einheit (" + q.unitId + ") bleibt " + (q.unitDisplay || "") + "." };
    } else {
      out.conversion.reason = m ? (m.conversionUnavailableReason || m.reason || "conversionUnavailable") : "conversionUnavailable";
    }
    return out;
  }

  var api = { CONTRACT_VERSION: CONTRACT_VERSION, QUOTE_STATES: QUOTE_STATES, HORIZONS: HORIZONS, LICENSE_STATES: LICENSE_STATES,
              build: build, refresh: refresh, present: present, change: change, horizons: horizons, performance: performance };
  if (isNode) module.exports = api;
  else global.VUMultiAssetContract = api;
})(typeof window !== "undefined" ? window : globalThis);
