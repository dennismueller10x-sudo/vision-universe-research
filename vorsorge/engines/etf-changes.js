/* =========================================================================
   VISION UNIVERSE VORSORGE — etf-changes.js   (UMD: Node + Browser)

   CHANGE INTELLIGENCE (ETF_CHANGE_EVENT_VERSION 1.0.0)

   Vergleicht zwei Holdings-Snapshots desselben Fonds aus derselben Quelle
   (T0 -> T1) und zwei Fondsdaten-Staende. Nur vergleichbare Staende: gleiche
   fundId, gleiche Quelle, asOf(T1) > asOf(T0). Der erste Snapshot ist die
   BASELINE und erzeugt keine Ereignisse.

   Ereignisse: HOLDING_ADDED, HOLDING_REMOVED, WEIGHT_INCREASED,
   WEIGHT_DECREASED, ENTERED_TOP_10, LEFT_TOP_10, ENTERED_TOP_20, LEFT_TOP_20,
   SECTOR_WEIGHT_CHANGED, COUNTRY_WEIGHT_CHANGED, HOLDINGS_COUNT_CHANGED,
   CASH_CHANGED, TER_CHANGED, ONGOING_CHARGES_CHANGED, EXPENSE_RATIO_CHANGED,
   AUM_CHANGED, BENCHMARK_CHANGED, REPLICATION_CHANGED, DISTRIBUTION_CHANGED,
   NAME_CHANGED, UCITS_CHANGED, DOMICILE_CHANGED, LISTING_ADDED,
   LISTING_REMOVED, FUND_STATUS_CHANGED.

   Ereignis-IDs sind deterministisch: fund + fromAsOf + toAsOf + Typ + Entitaet.
   Identitaet einer Position ueber ISIN/CUSIP (holdingId): ein Tickerwechsel
   oder Aktiensplit ist keine Gewichtsveraenderung.
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "1.0.0";
  var IMPORTANCE = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  var DEFAULTS = {
    weightNoisePP: 0.001,      // < 0,10 Prozentpunkte: Rauschen
    weightLowPP: 0.0025,       // ab 0,25 PP: LOW
    weightMediumPP: 0.005,     // ab 0,50 PP: MEDIUM
    weightHighPP: 0.01,        // ab 1,00 PP: HIGH
    addRemoveMinWeight: 0.0005, // Zu-/Abgaenge unter 0,05 % nur bei kleinen Fonds
    smallFundPositions: 60,
    groupShiftPP: 0.005,       // Sektor/Land ab 0,5 PP
    countChangeMin: 5, countChangeRel: 0.02,
    cashShiftPP: 0.005,
    aumRel: 0.10               // AUM ab 10 %
  };
  var DERIV = { FUTURE: 1, OPTION: 1, SWAP: 1, FORWARD: 1, DERIVATIVE: 1 };

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  function r(x, d) { if (x === null || x === undefined || !Number.isFinite(x)) return null; var f = Math.pow(10, d === undefined ? 6 : d); return Math.round(x * f) / f; }
  function pp(x) { return (x >= 0 ? "+" : "−") + (Math.round(Math.abs(x) * 1000) / 10).toLocaleString("de-DE", { minimumFractionDigits: 1 }) + " Prozentpunkte"; }
  function pc(x) { return (Math.round(x * 1000) / 10).toLocaleString("de-DE", { minimumFractionDigits: 1 }) + " %"; }

  function eventId(fundId, from, to, type, entity) { return fnv([fundId, from, to, type, entity].join("|")) + fnv([entity, type, to, from, fundId].join("|")); }
  function mk(ctx, type, entityId, entityName, oldV, newV, importance, explanation) {
    var abs = Number.isFinite(oldV) && Number.isFinite(newV) ? r(newV - oldV) : null;
    var rel = Number.isFinite(oldV) && Number.isFinite(newV) && oldV !== 0 ? r((newV - oldV) / Math.abs(oldV), 4) : null;
    return { version: VERSION, eventId: eventId(ctx.fundId, ctx.from, ctx.to, type, entityId), fundId: ctx.fundId, shareClassId: ctx.shareClassId || null,
      fromSnapshot: ctx.fromSnapshot || null, toSnapshot: ctx.toSnapshot || null, eventType: type, entityId: entityId, entityName: entityName || null,
      oldValue: oldV === undefined ? null : oldV, newValue: newV === undefined ? null : newV, absoluteChange: abs, relativeChange: rel,
      importance: importance, source: ctx.source || null, detectedAt: ctx.detectedAt || null, asOf: ctx.to, explanation: explanation };
  }
  function weightImportance(d, cfg) {
    var a = Math.abs(d);
    return a >= cfg.weightHighPP ? "HIGH" : a >= cfg.weightMediumPP ? "MEDIUM" : a >= cfg.weightLowPP ? "LOW" : null;
  }

  /** Sind zwei Snapshots vergleichbar? */
  function comparable(a, b) {
    if (!a || !b) return { ok: false, reason: "MISSING" };
    if ((a.fundId || a.symbol) !== (b.fundId || b.symbol)) return { ok: false, reason: "DIFFERENT_FUND" };
    if (a.source !== b.source) return { ok: false, reason: "DIFFERENT_SOURCE" };
    if (!a.asOf || !b.asOf || b.asOf <= a.asOf) return { ok: false, reason: "NOT_LATER" };
    return { ok: true };
  }

  function longs(s) { return s.holdings.filter(function (h) { return h.weight !== null && h.weight > 0 && !DERIV[h.assetType]; }); }
  function rankMap(s) {
    var m = {}; longs(s).filter(function (h) { return h.assetType !== "CASH"; }).forEach(function (h, i) { if (!(h.holdingId in m)) m[h.holdingId] = i + 1; });
    return m;
  }
  function groupWeights(s, key) {
    var m = {}; longs(s).forEach(function (h) { if (h.assetType === "CASH" && key === "country") return; var k = h[key] || "UNASSIGNED"; m[k] = (m[k] || 0) + h.weight; });
    return m;
  }
  function byId(s) { var m = {}; s.holdings.forEach(function (h) { if (DERIV[h.assetType]) return; if (m[h.holdingId]) m[h.holdingId].weight += h.weight || 0; else m[h.holdingId] = { holdingId: h.holdingId, name: h.holdingName, ticker: h.holdingTicker, weight: h.weight || 0, assetType: h.assetType }; }); return m; }

  /**
   * Holdings-Vergleich. prev = null -> BASELINE (keine Ereignisse).
   * Liefert { status, events, summary }.
   */
  function diffHoldings(prev, next, opts) {
    var cfg = Object.assign({}, DEFAULTS, opts || {});
    if (!prev) return { status: "BASELINE", events: [], summary: null };
    var c = comparable(prev, next);
    if (!c.ok) return { status: "NOT_COMPARABLE", reason: c.reason, events: [], summary: null };
    if (prev.contentHash === next.contentHash) return { status: "UNCHANGED", events: [], summary: emptySummary() };
    var ctx = { fundId: next.fundId || next.symbol, shareClassId: next.shareClassId, from: prev.asOf, to: next.asOf,
      fromSnapshot: prev.snapshotId, toSnapshot: next.snapshotId, source: next.source, detectedAt: cfg.detectedAt || null };
    var A = byId(prev), B = byId(next), ev = [];
    var small = longs(next).length <= cfg.smallFundPositions;
    var rankA = rankMap(prev), rankB = rankMap(next);
    Object.keys(B).forEach(function (k) {
      var b = B[k], a = A[k];
      if (b.assetType === "CASH") return;
      var label = b.name || b.ticker || k;
      if (!a) {
        if (b.weight >= cfg.addRemoveMinWeight || small) {
          var imp = b.weight >= 0.01 ? "HIGH" : b.weight >= 0.0025 ? "MEDIUM" : "LOW";
          ev.push(mk(ctx, "HOLDING_ADDED", k, label, null, r(b.weight), imp, label + " ist neu im ETF (" + pc(b.weight) + ")."));
        }
        return;
      }
      var d = b.weight - a.weight;
      if (Math.abs(d) >= cfg.weightNoisePP) {
        var wi = weightImportance(d, cfg);
        if (wi) ev.push(mk(ctx, d > 0 ? "WEIGHT_INCREASED" : "WEIGHT_DECREASED", k, label, r(a.weight), r(b.weight), wi,
          label + ": " + pc(a.weight) + " → " + pc(b.weight) + " (" + pp(d) + ")."));
      }
    });
    Object.keys(A).forEach(function (k) {
      var a = A[k];
      if (B[k] || a.assetType === "CASH") return;
      if (a.weight >= cfg.addRemoveMinWeight || small) {
        var imp = a.weight >= 0.01 ? "HIGH" : a.weight >= 0.0025 ? "MEDIUM" : "LOW";
        ev.push(mk(ctx, "HOLDING_REMOVED", k, a.name || a.ticker || k, r(a.weight), null, imp, (a.name || k) + " ist nicht mehr im ETF (zuvor " + pc(a.weight) + ")."));
      }
    });
    var top10Moved = {};
    [10, 20].forEach(function (n) {
      Object.keys(rankB).forEach(function (k) {
        if (!(rankB[k] <= n && !(rankA[k] <= n))) return;
        if (n === 20 && top10Moved[k]) return;
        if (n === 10) top10Moved[k] = 1;
        var w = (B[k] || {}).weight || 0, nm = (B[k] || {}).name || k;
        ev.push(mk(ctx, "ENTERED_TOP_" + n, k, nm, rankA[k] || null, rankB[k], n === 10 && w >= 0.01 ? "HIGH" : n === 10 || w >= 0.01 ? "MEDIUM" : "LOW",
          nm + " ist neu unter den " + (n === 10 ? "zehn" : "zwanzig") + " größten Positionen (Rang " + rankB[k] + ")."));
      });
      Object.keys(rankA).forEach(function (k) {
        if (!(rankA[k] <= n && !(rankB[k] <= n))) return;
        if (n === 20 && top10Moved[k]) return;
        if (n === 10) top10Moved[k] = 1;
        var w = (A[k] || {}).weight || 0, nm = (A[k] || {}).name || k;
        ev.push(mk(ctx, "LEFT_TOP_" + n, k, nm, rankA[k], rankB[k] || null, n === 10 && w >= 0.01 ? "HIGH" : n === 10 || w >= 0.01 ? "MEDIUM" : "LOW",
          nm + " ist aus den " + (n === 10 ? "zehn" : "zwanzig") + " größten Positionen gefallen."));
      });
    });
    [["sector", "SECTOR_WEIGHT_CHANGED"], ["country", "COUNTRY_WEIGHT_CHANGED"]].forEach(function (g) {
      var ga = groupWeights(prev, g[0]), gb = groupWeights(next, g[0]);
      var keys = {}; Object.keys(ga).concat(Object.keys(gb)).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        if (k === "UNASSIGNED") return;
        var d = (gb[k] || 0) - (ga[k] || 0);
        if (Math.abs(d) >= cfg.groupShiftPP) ev.push(mk(ctx, g[1], g[0] + ":" + k, k, r(ga[k] || 0), r(gb[k] || 0), Math.abs(d) >= 0.02 ? "HIGH" : Math.abs(d) >= 0.01 ? "MEDIUM" : "LOW",
          k + ": " + pc(ga[k] || 0) + " → " + pc(gb[k] || 0) + " (" + pp(d) + ")."));
      });
    });
    var na = longs(prev).filter(function (h) { return h.assetType !== "CASH"; }).length, nb = longs(next).filter(function (h) { return h.assetType !== "CASH"; }).length;
    if (Math.abs(nb - na) >= Math.max(cfg.countChangeMin, Math.round(na * cfg.countChangeRel))) ev.push(mk(ctx, "HOLDINGS_COUNT_CHANGED", "count", "Positionen", na, nb,
      Math.abs(nb - na) >= Math.max(20, na * 0.1) ? "MEDIUM" : "LOW", "Positionen: " + na.toLocaleString("de-DE") + " → " + nb.toLocaleString("de-DE") + "."));
    var cashA = prev.holdings.filter(function (h) { return h.assetType === "CASH"; }).reduce(function (s, h) { return s + (h.weight || 0); }, 0);
    var cashB = next.holdings.filter(function (h) { return h.assetType === "CASH"; }).reduce(function (s, h) { return s + (h.weight || 0); }, 0);
    if (Math.abs(cashB - cashA) >= cfg.cashShiftPP) ev.push(mk(ctx, "CASH_CHANGED", "cash", "Liquidität", r(cashA), r(cashB), Math.abs(cashB - cashA) >= 0.02 ? "MEDIUM" : "LOW",
      "Liquidität: " + pc(cashA) + " → " + pc(cashB) + "."));
    ev.sort(order);
    return { status: "CHANGED", events: ev, summary: summarize(ev) };
  }

  var IMP_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  function order(a, b) {
    return (IMP_RANK[b.importance] - IMP_RANK[a.importance]) || (Math.abs(b.absoluteChange || b.newValue || 0) - Math.abs(a.absoluteChange || a.newValue || 0)) ||
      (a.eventId < b.eventId ? -1 : 1);
  }
  function emptySummary() { return { largestIncrease: null, largestDecrease: null, newHoldings: 0, removedHoldings: 0, top10Entries: [], top10Exits: [], sectorShift: null, countryShift: null, holdingsCountDelta: 0 }; }
  function summarize(ev) {
    var s = emptySummary();
    ev.forEach(function (e) {
      if (e.eventType === "WEIGHT_INCREASED" && (!s.largestIncrease || e.absoluteChange > s.largestIncrease.absoluteChange)) s.largestIncrease = pick(e);
      if (e.eventType === "WEIGHT_DECREASED" && (!s.largestDecrease || e.absoluteChange < s.largestDecrease.absoluteChange)) s.largestDecrease = pick(e);
      if (e.eventType === "HOLDING_ADDED") s.newHoldings++;
      if (e.eventType === "HOLDING_REMOVED") s.removedHoldings++;
      if (e.eventType === "ENTERED_TOP_10") s.top10Entries.push(e.entityName);
      if (e.eventType === "LEFT_TOP_10") s.top10Exits.push(e.entityName);
      if (e.eventType === "SECTOR_WEIGHT_CHANGED" && (!s.sectorShift || Math.abs(e.absoluteChange) > Math.abs(s.sectorShift.absoluteChange))) s.sectorShift = pick(e);
      if (e.eventType === "COUNTRY_WEIGHT_CHANGED" && (!s.countryShift || Math.abs(e.absoluteChange) > Math.abs(s.countryShift.absoluteChange))) s.countryShift = pick(e);
      if (e.eventType === "HOLDINGS_COUNT_CHANGED") s.holdingsCountDelta = e.newValue - e.oldValue;
    });
    return s;
  }
  function pick(e) { return { entityName: e.entityName, oldValue: e.oldValue, newValue: e.newValue, absoluteChange: e.absoluteChange }; }

  /* ---------------------------------------------------- Fondsdaten */
  function v(f) { return f && typeof f === "object" && "value" in f ? f.value : f === undefined ? null : f; }
  var FUND_FIELDS = [
    ["ter", "TER_CHANGED", "TER", "cost"], ["ongoingCharges", "ONGOING_CHARGES_CHANGED", "Laufende Kosten", "cost"],
    ["expenseRatio", "EXPENSE_RATIO_CHANGED", "Kostenquote", "cost"], ["benchmarkName", "BENCHMARK_CHANGED", "Index", "text"],
    ["replicationMethod", "REPLICATION_CHANGED", "Replikation", "text"], ["distributionPolicy", "DISTRIBUTION_CHANGED", "Ertragsverwendung", "text"],
    ["name", "NAME_CHANGED", "Name", "text"], ["ucits", "UCITS_CHANGED", "UCITS", "text"], ["domicile", "DOMICILE_CHANGED", "Domizil", "text"],
    ["fundStatus", "FUND_STATUS_CHANGED", "Status", "status"]
  ];
  /** prev/next: kanonische Fondsdaten (Fundamentals 2.0). opts: { from, to, aumRel }. */
  function diffFundamentals(prev, next, opts) {
    var cfg = Object.assign({}, DEFAULTS, opts || {});
    if (!prev) return { status: "BASELINE", events: [] };
    var ctx = { fundId: next.fundId || next.shareClassId, shareClassId: next.shareClassId, from: cfg.from || "prev", to: cfg.to || "next", source: cfg.source || null, detectedAt: cfg.detectedAt || null };
    var ev = [];
    FUND_FIELDS.forEach(function (f) {
      var a = v(prev[f[0]]), b = v(next[f[0]]);
      if (a === null || b === null || a === undefined || b === undefined) return;   // fehlend ist keine Aenderung
      var same = f[3] === "cost" ? Math.abs(a - b) < 0.00005 : String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
      if (same) return;
      var imp = f[3] === "status" ? (/LIQUID|MERGED|CLOSED/.test(String(b)) ? "HIGH" : "MEDIUM") : f[3] === "cost" ? "MEDIUM" : f[0] === "name" ? "LOW" : "MEDIUM";
      var txt = f[3] === "cost" ? f[2] + ": " + pc2(a) + " → " + pc2(b) + "." : f[2] + ": " + a + " → " + b + ".";
      ev.push(mk(ctx, f[1], f[0], f[2], a, b, imp, txt));
    });
    var aa = v(prev.aum), ab = v(next.aum), ca = v(prev.aumCurrency), cb = v(next.aumCurrency);
    if (Number.isFinite(aa) && Number.isFinite(ab) && aa > 0 && ca === cb && Math.abs(ab - aa) / aa >= cfg.aumRel) {
      ev.push(mk(ctx, "AUM_CHANGED", "aum", "Fondsvolumen", aa, ab, Math.abs(ab - aa) / aa >= 0.3 ? "MEDIUM" : "LOW",
        "Fondsvolumen: " + money(aa, ca) + " → " + money(ab, cb) + "."));
    }
    var la = (prev.listings || []).map(String), lb = (next.listings || []).map(String);
    lb.filter(function (x) { return la.indexOf(x) < 0; }).forEach(function (x) { ev.push(mk(ctx, "LISTING_ADDED", "listing:" + x, x, null, x, "LOW", "Neues Börsenlisting: " + x + ".")); });
    la.filter(function (x) { return lb.indexOf(x) < 0; }).forEach(function (x) { ev.push(mk(ctx, "LISTING_REMOVED", "listing:" + x, x, x, null, "MEDIUM", "Börsenlisting entfällt: " + x + ".")); });
    ev.sort(order);
    return { status: ev.length ? "CHANGED" : "UNCHANGED", events: ev };
  }
  function pc2(x) { return (Math.round(x * 100000) / 1000).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " %"; }
  function money(x, c) {
    var abs = Math.abs(x), s = abs >= 1e9 ? (Math.round(x / 1e8) / 10).toLocaleString("de-DE") + " Mrd." : abs >= 1e6 ? (Math.round(x / 1e5) / 10).toLocaleString("de-DE") + " Mio." : Math.round(x).toLocaleString("de-DE");
    return s + " " + (c || "");
  }

  /** Relevante Ereignisse fuer Oberflaechen (ohne LOW, ausser es gibt sonst nichts). */
  function relevant(events, max) {
    var hi = (events || []).filter(function (e) { return e.importance !== "LOW"; });
    return (hi.length ? hi : (events || [])).slice(0, max || 10);
  }
  /** Ein Satz aus echten Ereignissen. */
  function changeSentence(events) {
    var ev = events || [], parts = [];
    function first(t) { return ev.filter(function (e) { return e.eventType === t && e.importance !== "LOW"; })[0] || null; }
    function ppTxt(x) { return (Math.round(Math.abs(x) * 1000) / 10).toLocaleString("de-DE") + " Prozentpunkte"; }
    var inc = first("WEIGHT_INCREASED"), dec = first("WEIGHT_DECREASED"), out = first("LEFT_TOP_10"), inn = first("ENTERED_TOP_10");
    if (inc) parts.push(inc.entityName + " um " + ppTxt(inc.absoluteChange) + " gestiegen");
    if (dec) parts.push(dec.entityName + " um " + ppTxt(dec.absoluteChange) + " gesunken");
    if (out) parts.push(out.entityName + " aus den zehn größten Positionen gefallen");
    if (inn) parts.push(inn.entityName + " neu unter den zehn größten Positionen");
    if (!parts.length) return null;
    return "Seit dem letzten Holdings-Update: " + parts.join("; ") + ".";
  }

  var api = { VERSION: VERSION, ETF_CHANGE_EVENT_VERSION: VERSION, IMPORTANCE: IMPORTANCE, DEFAULTS: DEFAULTS, eventId: eventId, comparable: comparable,
    diffHoldings: diffHoldings, diffFundamentals: diffFundamentals, summarize: summarize, relevant: relevant, changeSentence: changeSentence };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Changes = api; }
})(typeof window !== "undefined" ? window : globalThis);
