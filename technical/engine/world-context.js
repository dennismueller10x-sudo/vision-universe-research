/* =========================================================================
   VISION UNIVERSE TECHNICAL — engine/world-context.js
   DIESE AKTIE IN QUANT UND SUPERTRADER (ohne DOM; Browser und Node)

   Chart Studio zeigt neben dem Chart, was die anderen Welten zur selben
   Aktie veroeffentlicht haben. Nur Lesen, keine eigene Rechnung:

     Quant        quant/data/product/factor-evidence-v1/<Scherbe>.json.gz
                  ueber die Quant-Engine quant/engines/factor-evidence.js
                  (validShard, publicationViolations, hydrate, ordered,
                  summarySentence) - dieselbe Kette wie
                  quant/api/product-services.js#getFactorEvidence. Stufen
                  (stark, durchschnittlich ...) und Satz kommen aus der
                  Engine; Technical zeigt keine Zahl und keine Gesamtnote.
     Supertrader  supertrader/data/stock/<T>.json (Modellsignale je
                  Strategie), Zustandsnamen, Strategienamen und Evidenz-
                  stufe aus supertrader/data/registry-core.json.
     Research     supertrader/data/sf-candidates/ (summary.json und
                  ticker/<Scherbe>.json): Stufe der quellentreuen
                  Methoden, Stufennamen aus summary.stageLabels, Status
                  (Zertifizierung, Live-Freigabe) aus summary.status.
                  "Nicht aktuell" nach derselben Regel wie
                  supertrader/assets/sf-research.js#stale.

   Fehlt ein Artefakt oder passt es nicht zum Vertrag, heisst das "keine
   Angabe", nie "nichts gefunden".

   Browser: globalThis.VUTechnical.WorldContext; Node: module.exports.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "technical-world-context-1.0.0";
  var QUANT_DIR = "/quant/data/product/factor-evidence-v1/";
  var ST_STOCK_DIR = "/supertrader/data/stock/";
  var ST_REGISTRY = "/supertrader/data/registry-core.json";
  var SF_DIR = "/supertrader/data/sf-candidates/";
  var ST_SLICE_SCHEMA = "supertrader-signals-1.0.0";
  var ST_REGISTRY_SCHEMA = "supertrader-registry-1.0.0";
  var SF_SCHEMA = "supertrader-sf8-candidates-1.0.0";
  /* Abgeschlossene Zustaende (Protokoll), alle anderen sind aktuell. */
  var FINAL = ["CLOSED", "INVALIDATED", "RETIRED", "REASSESSED"];
  /* Wortlaut der Statuscodes aus summary.status. LIVE_NOT_APPROVED wie supertrader/assets/sf-research.js (BLOCK_TXT);
     DIAGNOSTIC_NOT_CERTIFIED woertlich: diagnostisch, nicht zertifiziert. Unbekannte Codes erscheinen unveraendert,
     nie still als "freigegeben". */
  var STATUS_TXT = {
    DIAGNOSTIC_NOT_CERTIFIED: "diagnostisch, nicht zertifiziert",
    LIVE_NOT_APPROVED: "nicht für den Live-Betrieb freigegeben",
    NONE: "keine Orders"
  };

  function str(x) { return x == null ? "" : String(x); }
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }

  function paths(ticker, shards) {
    var T = encodeURIComponent(str(ticker).toUpperCase()), s = shards || {};
    return {
      quant: s.quant ? QUANT_DIR + s.quant + ".json.gz" : null,
      supertrader: ST_STOCK_DIR + T + ".json",
      registry: ST_REGISTRY,
      sfSummary: SF_DIR + "summary.json",
      sfShard: s.sf ? SF_DIR + "ticker/" + s.sf + ".json" : null
    };
  }

  /* ------------------------------------------------------------- Quant */
  /**
   * shard: factor-evidence-v1-Scherbe, key: ihr Schluessel, FE: quant/engines/factor-evidence.js.
   * -> {state:"AVAILABLE", asOf, dataQuality, sentence, factors:[{id,label,band,bandLabel}], missing, publication}
   *  | {state:"UNAVAILABLE", reason}
   */
  function quant(shard, key, ticker, FE) {
    var T = str(ticker).toUpperCase();
    if (!FE || typeof FE.validShard !== "function") return { state: "UNAVAILABLE", reason: "ENGINE_MISSING" };
    if (!shard) return { state: "UNAVAILABLE", reason: "SOURCE_MISSING" };
    if (!FE.validShard(shard, key)) return { state: "UNAVAILABLE", reason: "INVALID_ARTIFACT" };
    var src = shard.securities[T];
    if (!src) return { state: "UNAVAILABLE", reason: "NOT_COVERED" };
    if (FE.publicationViolations(src).length) return { state: "UNAVAILABLE", reason: "PUBLICATION_GATE_VIOLATED" };
    var rec = FE.hydrate(src, shard), list = FE.ordered(rec);
    /* Eine Stufe nur mit gezaehlter Position (factor-band-2.0.0); ohne sie nennt die Engine keine - Technical auch nicht. */
    var shown = list.filter(function (f) { return f.state === "AVAILABLE" && f.band; });
    return {
      state: "AVAILABLE",
      asOf: rec.asOf || shard.asOf || null,
      dataQuality: rec.dataQuality || null,
      sentence: FE.summarySentence(rec),
      factors: shown.map(function (f) { return { id: f.id, label: f.label, band: f.band, bandLabel: f.bandLabel }; }),
      missing: list.filter(function (f) { return f.state !== "AVAILABLE"; }).length,
      total: list.length,
      publication: { compositeAllowed: shard.publication.compositeAllowed, rankingAllowed: shard.publication.rankingAllowed, explanation: shard.publication.explanation || null }
    };
  }

  /* ------------------------------------------------- Supertrader-Modelle */
  function registryIndex(registry) {
    if (!isObj(registry) || registry.schema !== ST_REGISTRY_SCHEMA || !Array.isArray(registry.strategies)) return null;
    var by = {};
    registry.strategies.forEach(function (s) { if (s && s.strategy_id) by[s.strategy_id] = s; });
    return { labels: (registry.lifecycle && registry.lifecycle.labels) || {}, by: by };
  }

  /* Dieselbe Abstufung wie supertrader/assets/supertrader.js#badgeFor: Ein wartendes Setup (SETUP, ENTRY_READY) ohne
     Einstieg heisst bei einer Forschungsstrategie (evidence.presentation RESEARCH) "Modellbeobachtung" und bei einer
     Beobachtungsliste (pending_semantics WATCHLIST) wie ihr watchlist_label - nie "Einstieg vorbereitet". Sonst gilt
     der Zustandsname aus registry.lifecycle.labels. PARTIAL_CHECK (CAN SLIM, Piotroski: Kandidat einer Teilpruefung,
     kein Signal) traegt den Darstellungsnamen der Strategie (evidence.presentationLabel, "Teilprüfung"). */
  function stateLabel(labels, s, state, rec) {
    if (state === "PARTIAL_CHECK") return (s && s.evidence && s.evidence.presentationLabel) || "Teilprüfung";
    var waiting = (state === "SETUP" || state === "ENTRY_READY") && !(rec && rec.entry);
    if (waiting && s && s.evidence && s.evidence.presentation === "RESEARCH") return "Modellbeobachtung";
    if (waiting && s && s.pending_semantics === "WATCHLIST") return s.watchlist_label || "Beobachtung";
    return labels[state] || state;
  }

  function findRecord(slice, strategyId, id) {
    var s = slice.strategies && slice.strategies[strategyId];
    if (!s || !id) return null;
    var lists = [s.open, s.closed, s.invalidated, s.retired];
    for (var i = 0; i < lists.length; i++) {
      var hit = (lists[i] || []).filter(function (r) { return r && r.id === id; })[0];
      if (hit) return hit;
    }
    return null;
  }

  /**
   * slice: supertrader/data/stock/<T>.json, registry: registry-core.json.
   * -> {state:"AVAILABLE", current:[...], history:n, lastProcessed} | {state:"UNAVAILABLE", reason}
   */
  function supertrader(slice, registry, ticker) {
    var T = str(ticker).toUpperCase();
    if (!slice) return { state: "UNAVAILABLE", reason: "NOT_COVERED" };
    if (!isObj(slice) || slice.schema !== ST_SLICE_SCHEMA || slice.symbol !== T || !isObj(slice.bySymbol)) return { state: "UNAVAILABLE", reason: "INVALID_ARTIFACT" };
    var R = registryIndex(registry);
    if (!R) return { state: "UNAVAILABLE", reason: "REGISTRY_MISSING" };
    var rows = slice.bySymbol[T] || [], current = [], history = 0, last = null;
    Object.keys(slice.strategies || {}).forEach(function (k) { var lp = slice.strategies[k] && slice.strategies[k].lastProcessed; if (lp && (!last || lp > last)) last = lp; });
    rows.forEach(function (r) {
      if (!r || !r.state) return;
      if (FINAL.indexOf(r.state) >= 0) { history++; return; }
      var s = R.by[r.strategyId] || null, rec = findRecord(slice, r.strategyId, r.id), tr = rec && rec.transitions;
      var ev = s && s.evidence;
      current.push({
        strategyId: r.strategyId,
        /* Name wie auf der Supertrader-Aktienseite (world_name). */
        name: s ? s.world_name || s.strategy_name || r.strategyId : r.strategyId,
        state: r.state,
        stateLabel: stateLabel(R.labels, s, r.state, rec),
        since: tr && tr.length ? tr[tr.length - 1].date || null : null,
        evidenceLabel: ev && ev.levelLabel || null,
        presentationLabel: ev && ev.presentationLabel || null
      });
    });
    return { state: "AVAILABLE", current: current, history: history, lastProcessed: last };
  }

  /* --------------------------------------- Supertrader quellentreue Research */
  function stale(summary, today) {
    return !!(summary && summary.nextSession && str(today).slice(0, 10) > str(summary.nextSession).slice(0, 10));
  }

  function statusText(code) { return code ? (STATUS_TXT[code] || code) : null; }

  /**
   * summary: sf-candidates/summary.json, shard: ticker/<Scherbe>.json (null, wenn die Scherbe nicht gelistet ist).
   * -> {state:"AVAILABLE", asOf, stale, views:[{strategyId,name,stage,stageLabel,dataQuality}], status:[Text], locked}
   */
  function research(summary, shard, ticker, today) {
    var T = str(ticker).toUpperCase();
    if (!isObj(summary) || summary.schema !== SF_SCHEMA) return { state: "UNAVAILABLE", reason: "SOURCE_MISSING" };
    if (shard && (shard.schema !== SF_SCHEMA || !Array.isArray(shard.views))) return { state: "UNAVAILABLE", reason: "INVALID_ARTIFACT" };
    var L = summary.stageLabels || {}, byId = {};
    (summary.strategies || []).forEach(function (s) { if (s && s.strategyId) byId[s.strategyId] = s; });
    var views = ((shard && shard.views) || []).filter(function (v) { return v && v.ticker === T; }).map(function (v) {
      var s = byId[v.strategyId];
      return {
        strategyId: v.strategyId,
        name: s && s.name || v.strategyId,
        stage: v.stage,
        stageLabel: L[v.stage] && L[v.stage].name || v.stage,
        dataQuality: v.dataQuality && v.dataQuality.status || null
      };
    });
    var st = summary.status || {};
    return {
      state: "AVAILABLE",
      asOf: summary.asOf || null,
      stale: stale(summary, today),
      views: views,
      status: [statusText(st.certification), statusText(st.liveReadiness)].filter(Boolean),
      locked: /^LOCKED/.test(str(st.validatedTradeSignal)) ? (L.VALIDATED_TRADE_SIGNAL && L.VALIDATED_TRADE_SIGNAL.name || "VALIDATED_TRADE_SIGNAL") : null
    };
  }

  var api = { VERSION: VERSION, FINAL: FINAL.slice(), STATUS_TXT: STATUS_TXT, paths: paths, quant: quant, supertrader: supertrader, research: research, stale: stale };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.WorldContext = api; }
})(typeof window !== "undefined" ? window : globalThis);
