/* =========================================================================
   VISION UNIVERSE QUANT — api/technical-intelligence-workspace.js
   Lesezugriff auf die praekomputierte Technical-Intelligence-API (v2)

   Die Seite rechnet nicht. Sie liest, was scripts/technical/
   build-technical-intelligence.mjs geschrieben hat:

     /quant/data/technical-intelligence/v2/meta.json
     /quant/data/technical-intelligence/v2/index.json.gz
     /quant/data/technical-intelligence/v2/shards/<XX>.json.gz
     /quant/data/technical-intelligence/v2/discover-rows.json
     /quant/data/technical-intelligence/v2/rules-catalog.json

   Nur diese Pfade sind erlaubt (Whitelist), gzip wird im Browser entpackt
   (DecompressionStream) — dieselbe Technik wie product-services.js.
   ========================================================================= */
(function (global) {
  "use strict";
  var BASE = "/quant/data/technical-intelligence/v2/";
  var ALLOWED = /^\/quant\/data\/technical-intelligence\/v2\/(meta\.json|index\.json\.gz|discover-rows\.json|rules-catalog\.json|alerts\.json|evidence-summary\.json|shards\/[A-Z0-9._-]{2}\.json\.gz)$/;
  var cache = {};

  function shardKey(ticker) { return (String(ticker).toUpperCase() + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_"); }

  function fetchBytes(path) {
    if (!ALLOWED.test(path)) return Promise.reject(new Error("INVALID_PATH"));
    return fetch(path, { credentials: "omit" }).then(function (res) {
      if (!res.ok) { var e = new Error("SOURCE_MISSING"); e.status = res.status; throw e; }
      return res.arrayBuffer();
    });
  }
  function gunzip(buf) {
    var input = new Uint8Array(buf);
    if (input[0] !== 31 || input[1] !== 139) return Promise.resolve(JSON.parse(new TextDecoder().decode(input)));   // Server hat bereits entpackt
    if (typeof DecompressionStream !== "function") return Promise.reject(new Error("DECOMPRESSION_UNSUPPORTED"));
    return new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(JSON.parse);
  }
  function load(path) {
    if (cache[path]) return cache[path];
    var p = fetchBytes(path).then(function (buf) { return /\.gz$/.test(path) ? gunzip(buf) : JSON.parse(new TextDecoder().decode(new Uint8Array(buf))); });
    cache[path] = p.catch(function (e) { delete cache[path]; throw e; });
    return cache[path];
  }

  /** Analyse eines Titels: { state, analysis, meta } — state AVAILABLE | NOT_AVAILABLE | ERROR. */
  function getAnalysis(ticker) {
    var t = String(ticker || "").toUpperCase();
    if (!/^[A-Z0-9.-]{1,12}$/.test(t)) return Promise.resolve({ state: "NOT_AVAILABLE", reason: "INVALID_TICKER" });
    return Promise.all([load(BASE + "shards/" + shardKey(t) + ".json.gz"), load(BASE + "meta.json").catch(function () { return null; })])
      .then(function (r) {
        var a = r[0] && r[0].instruments ? r[0].instruments[t] : null;
        return a ? { state: "AVAILABLE", analysis: a, meta: r[1] } : { state: "NOT_AVAILABLE", reason: "NOT_COVERED", meta: r[1] };
      })
      .catch(function (e) { return { state: e && e.status === 404 ? "NOT_AVAILABLE" : "ERROR", reason: e && e.message }; });
  }
  function getIndex() { return load(BASE + "index.json.gz"); }
  function getDiscoverRows() { return load(BASE + "discover-rows.json"); }
  function getRulesCatalog() { return load(BASE + "rules-catalog.json").catch(function () { return { rules: {} }; }); }
  function getMeta() { return load(BASE + "meta.json"); }
  function getEvidenceSummary() { return load(BASE + "evidence-summary.json"); }
  function getAlerts() { return load(BASE + "alerts.json"); }

  global.VUTechnicalIntelligence = { BASE: BASE, shardKey: shardKey, getAnalysis: getAnalysis, getIndex: getIndex, getDiscoverRows: getDiscoverRows, getRulesCatalog: getRulesCatalog, getMeta: getMeta, getEvidenceSummary: getEvidenceSummary, getAlerts: getAlerts, ALLOWED: ALLOWED };
})(typeof window !== "undefined" ? window : globalThis);
