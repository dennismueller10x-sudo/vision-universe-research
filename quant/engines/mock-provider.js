/* =========================================================================
   VISION UNIVERSE QUANT — mock-provider.js
   MOCK ADAPTER (§7, §8, §12, §93)

   Der einzige Ort im System, an dem die interne Speicherform des
   Mock-Datensatzes bekannt ist. Nach aussen liefert dieser Adapter
   ausschliesslich kanonische Objekte aus schema.js — exakt so, wie es
   spaeter ein TwelveDataAdapter oder IntrinioAdapter tun wird.

   Die gesamte V1 laeuft auf diesem Adapter: kein API-Key, kein Netz, kein
   Vertrag. Wer einen echten Provider anschliesst, ersetzt diese Datei —
   und keine Zeile in Quant Engine, Screener, Backtester oder UI.

   POINT-IN-TIME: getFacts()/getFactPanel() geben ohne asOf den heutigen
   Stand zurueck, mit asOf ausschliesslich das, was zu diesem Zeitpunkt
   verfuegbar war. Es gibt keinen Weg, an dieser Regel vorbei an Daten zu
   kommen — auch nicht versehentlich.

   NICHT VERFUEGBARE DATEN (Estimates, Macro, News) werden als
   `unavailable` mit Begruendung zurueckgegeben, niemals als erfundener
   Wert (§54, §76, §93).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSchema;
  var Provider = isNode ? require("./provider.js") : global.VUProvider;
  var Generator = isNode ? require("./mock-generator.js") : global.VUMockGenerator;

  var PROVIDER_NAME = "VisionUniverseMock";

  function createMockProvider(options) {
    options = options || {};
    var dataset = options.dataset || Generator.generateDataset(options.generator || {});
    var sourceId = Generator.DATA_SOURCE_ID;

    function provenanceFor(asOf) {
      return Schema.makeProvenance({
        provider: PROVIDER_NAME,
        source: "synthetic-us-equities",
        asOf: asOf || dataset.meta.end,
        ingestedAt: dataset.meta.end + "T06:00:00Z",
        dataSnapshotId: dataset.meta.dataSnapshotId,
        isMock: true
      });
    }

    function requireSecurity(securityId) {
      var s = dataset.securityById[securityId];
      if (!s) throw new Error("Unknown securityId: " + securityId);
      return s;
    }

    function indexAtOrBefore(date) {
      var days = dataset.tradingDays;
      var idx = dataset.dayIndex[date];
      if (idx !== undefined) return idx;
      var lo = 0, hi = days.length - 1, best = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (days[mid] <= date) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      return best;
    }

    var api = {
      /* ---------------- ReferenceDataProvider ---------------- */
      getSecurities: function (filter) {
        filter = filter || {};
        var out = dataset.securities;
        if (filter.status) out = out.filter(function (s) { return s.status === filter.status; });
        if (filter.sector) out = out.filter(function (s) { return s.sector === filter.sector; });
        /* Ohne asOf liefert der Security Master den heutigen Stand. Mit asOf
           genau die Titel, die an diesem Tag gelistet waren — die Grundlage
           gegen Survivorship Bias (§39). */
        if (filter.asOf) out = out.filter(function (s) { return Schema.wasListed(s, filter.asOf); });
        return Provider.ok(out, provenanceFor(filter.asOf));
      },

      getSecurity: function (securityId) {
        var s = dataset.securityById[securityId];
        if (!s) return Provider.unavailable("Unknown securityId: " + securityId);
        return Provider.ok(s, provenanceFor());
      },

      getExchanges: function () { return Provider.ok(dataset.exchanges, provenanceFor()); },

      getUniverse: function (universeId) {
        if (universeId !== "US_EQUITIES") {
          return Provider.unavailable("Universe '" + universeId + "' is not part of the mock dataset. V1 covers US_EQUITIES only.");
        }
        return Provider.ok({
          universeId: "US_EQUITIES", name: "US Equities (Mock)", region: "US", assetType: "equity",
          rules: { country: "US", assetType: "equity", includeDelisted: true }
        }, provenanceFor());
      },

      getUniverseMembership: function (universeId, asOf) {
        if (universeId !== "US_EQUITIES") return Provider.unavailable("Unknown universe: " + universeId);
        var rows = dataset.universeMembership;
        if (asOf) {
          rows = rows.filter(function (m) {
            return m.validFrom <= asOf && (!m.validTo || m.validTo >= asOf);
          });
        }
        return Provider.ok(rows, provenanceFor(asOf));
      },

      /* ---------------- MarketDataProvider ---------------- */
      getPriceBars: function (securityId, opts) {
        opts = opts || {};
        requireSecurity(securityId);
        var series = dataset.prices[securityId];
        if (!series) return Provider.unavailable("No price series generated for " + securityId);
        var days = dataset.tradingDays;
        var from = opts.from ? Math.max(series.startIndex, indexAtOrBefore(opts.from)) : series.startIndex;
        var to = opts.to ? Math.min(series.endIndex, indexAtOrBefore(opts.to)) : series.endIndex;
        var bars = [];
        for (var t = Math.max(0, from); t <= to; t++) {
          var c = series.close[t];
          if (!c) continue;
          var prev = t > series.startIndex ? series.close[t - 1] : c;
          /* Intraday-Spanne deterministisch aus der Tagesbewegung abgeleitet.
             Der Mock-Datensatz modelliert keinen echten Intraday-Verlauf;
             das ist im Datenmodell dokumentiert und fuer daily-Strategien
             ohne Bedeutung. */
          var move = Math.abs(c / prev - 1);
          bars.push({
            securityId: securityId, date: days[t],
            open: round4(prev + (c - prev) * 0.35),
            high: round4(Math.max(prev, c) * (1 + move * 0.35)),
            low: round4(Math.min(prev, c) * (1 - move * 0.35)),
            close: round4(c),
            adjustedClose: round4(series.adjustedClose[t]),
            volume: Math.round(volumeAt(securityId, t)),
            currency: "USD", dataSourceId: sourceId
          });
        }
        return Provider.ok(bars, provenanceFor(opts.to));
      },

      getLatestPrice: function (securityId, asOf) {
        var series = dataset.prices[securityId];
        if (!series) return Provider.unavailable("No price series for " + securityId);
        var idx = asOf ? indexAtOrBefore(asOf) : series.endIndex;
        idx = Math.min(idx, series.endIndex);
        if (idx < series.startIndex) {
          return Provider.unavailable(securityId + " was not listed on " + (asOf || dataset.meta.end));
        }
        return Provider.ok({
          securityId: securityId, date: dataset.tradingDays[idx],
          close: round4(series.close[idx]), adjustedClose: round4(series.adjustedClose[idx]),
          currency: "USD", dataSourceId: sourceId
        }, provenanceFor(asOf));
      },

      getBenchmarkBars: function (benchmarkId, opts) {
        opts = opts || {};
        if (benchmarkId !== Generator.BENCHMARK_ID) {
          return Provider.unavailable("Unknown benchmark: " + benchmarkId);
        }
        if (!dataset.benchmark) return Provider.unavailable("Benchmark series not generated");
        var days = dataset.tradingDays;
        var from = opts.from ? indexAtOrBefore(opts.from) : 0;
        var to = opts.to ? indexAtOrBefore(opts.to) : days.length - 1;
        var out = [];
        for (var t = Math.max(0, from); t <= to; t++) {
          out.push({ date: days[t], level: round4(dataset.benchmark.level[t]) });
        }
        return Provider.ok({ benchmarkId: benchmarkId, bars: out }, provenanceFor(opts.to));
      },

      /** Bulk-Panel fuer Cross-Sectional-Quant und Backtests. */
      getPricePanel: function (opts) {
        opts = opts || {};
        return Provider.ok({
          tradingDays: dataset.tradingDays,
          dayIndex: dataset.dayIndex,
          series: dataset.prices,
          benchmark: dataset.benchmark,
          volumeAt: volumeAt
        }, provenanceFor(opts.to));
      },

      /* ---------------- FundamentalDataProvider ---------------- */
      getFacts: function (securityId, opts) {
        opts = opts || {};
        requireSecurity(securityId);
        var periods = dataset.financials[securityId] || [];
        var asOf = opts.asOf || dataset.meta.end;
        /* pointInTime: false ist bewusst NICHT erlaubt. Es gibt keinen
           legitimen Grund, im Produkt an der availableAt-Regel vorbei zu
           lesen — der einzige Effekt waere Look-Ahead Bias. */
        var visible = periods.filter(function (p) { return p.availableAt <= asOf; });
        if (opts.periodEnd) visible = visible.filter(function (p) { return p.periodEnd === opts.periodEnd; });
        if (opts.latestOnly !== false) {
          visible = Schema.latestKnownPeriods(visible, asOf, opts.quarters || 0);
        }
        var facts = [];
        visible.forEach(function (p) {
          facts = facts.concat(Schema.expandPeriodToFacts(p, securityId, sourceId));
        });
        if (opts.metricId) facts = facts.filter(function (f) { return f.metricId === opts.metricId; });
        return Provider.ok(facts, provenanceFor(asOf));
      },

      getFilings: function (securityId, from, to) {
        requireSecurity(securityId);
        var rows = dataset.filings[securityId] || [];
        if (from) rows = rows.filter(function (f) { return f.filedAt >= from; });
        if (to) rows = rows.filter(function (f) { return f.filedAt <= to; });
        return Provider.ok(rows, provenanceFor(to));
      },

      /** Bulk-Panel der zum Stichtag bekannten Perioden je Security. */
      getFactPanel: function (opts) {
        opts = opts || {};
        var asOf = opts.asOf || dataset.meta.end;
        var quarters = opts.quarters || 9;
        var out = Object.create(null);
        var ids = opts.securityIds || Object.keys(dataset.financials);
        for (var i = 0; i < ids.length; i++) {
          out[ids[i]] = Schema.latestKnownPeriods(dataset.financials[ids[i]] || [], asOf, quarters);
        }
        return Provider.ok({ asOf: asOf, periods: out }, provenanceFor(asOf));
      },

      /* ---------------- CorporateActionsProvider ---------------- */
      getCorporateActions: function (securityId, opts) {
        opts = opts || {};
        var rows = dataset.corporateActions;
        if (securityId) rows = rows.filter(function (a) { return a.securityId === securityId; });
        if (opts.from) rows = rows.filter(function (a) { return a.exDate >= opts.from; });
        if (opts.to) rows = rows.filter(function (a) { return a.exDate <= opts.to; });
        /* Auch Corporate Actions unterliegen Point-in-Time: eine erst 2020
           angekuendigte Massnahme war 2019 nicht bekannt. */
        if (opts.asOf) rows = rows.filter(function (a) { return a.announcedAt <= opts.asOf; });
        return Provider.ok(rows, provenanceFor(opts.asOf));
      },

      /* ---------------- EstimateDataProvider ---------------- */
      getEstimates: function () {
        return Provider.unavailable(
          "Analystenschaetzungen sind in V1 nicht verfuegbar. Historische Point-in-Time-Konsensdaten " +
          "sind nicht lizenziert und werden bewusst nicht synthetisch erzeugt (§16)."
        );
      },
      getRevisionHistory: function () {
        return Provider.unavailable(
          "Revisionshistorie ist in V1 nicht verfuegbar. Ein Revisions-Faktor aus erfundenen Konsensdaten " +
          "waere kein Faktor, sondern Rauschen mit einem Namen."
        );
      },

      /* ---------------- MacroDataProvider ---------------- */
      getIndicator: function (indicatorId) {
        return Provider.unavailable(
          "Makrodaten sind kein Bestandteil des Quant-Mock-Datensatzes. Das bestehende Vision-Universe-Produkt " +
          "/macro/ arbeitet mit eigenen, recherchierten Daten und bleibt unberuehrt. (angefragt: " + indicatorId + ")"
        );
      },
      getIndicators: function () {
        return Provider.unavailable("Makrodaten sind kein Bestandteil des Quant-Mock-Datensatzes.");
      },

      /* ---------------- NewsDataProvider ---------------- */
      getNews: function () {
        return Provider.unavailable(
          "News sind kein Bestandteil des Quant-Mock-Datensatzes. Extension Point fuer einen spaeteren NewsProvider."
        );
      },

      /* ---------------- Health ---------------- */
      healthCheck: function () {
        return Provider.makeHealth("ok", {
          provider: PROVIDER_NAME,
          message: "Synthetischer Datensatz, " + dataset.securities.length + " Securities, " +
                   dataset.tradingDays.length + " Handelstage. Keine echten Marktdaten.",
          capabilities: ["reference", "market", "fundamentals:pit", "corporate-actions"]
        });
      },

      /* Direktzugriff auf den Datensatz — ausdruecklich NUR fuer das
         Precomputation-Skript und Tests. Produktcode geht ueber die
         Interfaces oben. */
      _dataset: dataset
    };

    /* Deterministisches Volumen aus Kurs und Turnover-Rate statt einer
       weiteren 21-MB-Zeitreihe. */
    function volumeAt(securityId, t) {
      var profile = dataset.profileById[securityId];
      var series = dataset.prices[securityId];
      if (!profile || !series) return 0;
      var price = series.close[t] || 1;
      var shares = sharesAt(securityId, dataset.tradingDays[t]);
      var wobble = 0.7 + 0.6 * ((Math.sin(t * 0.37 + profile.index) + 1) / 2);
      return Math.max(1000, shares * 1e6 * profile.turnoverRate * wobble);
      function sharesAt(id, date) {
        var periods = dataset.financials[id] || [];
        var latest = null;
        for (var i = 0; i < periods.length; i++) {
          var p = periods[i];
          if (p.availableAt <= date && p.values.sharesOutstanding &&
             (!latest || p.periodEnd > latest.periodEnd)) latest = p;
        }
        return latest ? latest.values.sharesOutstanding : 100;
      }
    }

    return api;
  }

  function round4(v) { return Math.round(v * 10000) / 10000; }

  var api = { PROVIDER_NAME: PROVIDER_NAME, createMockProvider: createMockProvider };

  if (isNode) module.exports = api;
  else global.VUMockProvider = api;
})(typeof window !== "undefined" ? window : globalThis);
