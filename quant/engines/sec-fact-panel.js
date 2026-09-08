/* =========================================================================
   VISION UNIVERSE QUANT — sec-fact-panel.js

   Bruecke zwischen providers/sec/adapter.js (liefert flache, PIT-aufgeloeste
   FundamentalFact[] je Security) und quant/engines/factors.js#fundamentalMetrics
   (erwartet FundamentalPeriod[] mit .values-Map je Periode — dieselbe Form,
   die mock-provider.js fuer das synthetische Modelluniversum bereits liefert).

   Reine Umformung, keine neue Berechnung und keine neue Point-in-Time-Regel:
   der SEC-Adapter hat availableAt <= asOf bereits durchgesetzt (resolveAsOf),
   und je (metricId, periodEnd) genau einen Fact ausgewaehlt. Diese Datei
   gruppiert diese bereits aufgeloesten Fakten nur noch nach periodEnd.
   ========================================================================= */
(function (global) {
  "use strict";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }

  /**
   * @param {Array} facts  flache FundamentalFact[] einer Security, wie von
   *                        providers/sec/adapter.js#getFactPanel je Security
   *                        zurueckgegeben (bereits PIT-/Revisions-aufgeloest).
   * @returns {Array} FundamentalPeriod[], absteigend nach periodEnd sortiert.
   */
  function factsToPeriods(facts) {
    var byPeriod = Object.create(null);
    (facts || []).forEach(function (f) {
      var p = byPeriod[f.periodEnd];
      if (!p) {
        p = byPeriod[f.periodEnd] = {
          periodEnd: f.periodEnd,
          fiscalYear: f.fiscalYear,
          fiscalPeriod: f.fiscalPeriod,
          reportedAt: f.reportedAt,
          filedAt: f.filedAt,
          availableAt: f.availableAt,
          revisionId: f.revisionId,
          restatementStatus: f.restatementStatus,
          values: {}
        };
      }
      var v = f.value;
      p.values[f.metricId] = isNum(v) ? v : null;
      /* Eine Periode gilt erst als bekannt, wenn ihre zuletzt eingetroffene
         Kennzahl bekannt ist — dasselbe Prinzip wie bei latestKnownPeriods
         in schema.js, nur ueber alle Kennzahlen derselben Periode hinweg. */
      if (f.availableAt > p.availableAt) {
        p.availableAt = f.availableAt;
        p.revisionId = Math.max(p.revisionId, f.revisionId);
      }
    });
    return Object.keys(byPeriod)
      .map(function (k) { return byPeriod[k]; })
      .sort(function (a, b) { return a.periodEnd < b.periodEnd ? 1 : a.periodEnd > b.periodEnd ? -1 : 0; });
  }

  var api = { factsToPeriods: factsToPeriods };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUSecFactPanel = api;
})(typeof window !== "undefined" ? window : globalThis);
