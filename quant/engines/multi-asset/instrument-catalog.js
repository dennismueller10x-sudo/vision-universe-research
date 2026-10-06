/* =========================================================================
   VISION UNIVERSE — multi-asset/instrument-catalog.js   (Multi-Asset Core §14)

   DAS NICHT-AKTIENARTIGE SEGMENT DES KANONISCHEN INSTRUMENT MASTERS.

   Kein zweiter Master. Die instrumentId kommt aus derselben Funktion wie
   jede Aktien-ID (company-master.js#mintInstrumentId) und liegt damit im
   selben ID-Raum `vu_<hash>`. Der Unterschied ist nur die Herkunft der
   Zeile: Aktien kommen aus der Tickerliste des Anbieters, Indizes,
   Rohstoffe, Renditen und Leitzinsen aus quant/config/
   multi-asset-instruments.json - weil keine Anbieterliste sie vollstaendig
   und eindeutig fuehrt.

   JEDER EINTRAG IST ZUERST EIN KANDIDAT

   Der Katalog sagt, WAS gemeint ist (S&P 500, Kursindex, Punkte). Er sagt
   nicht, WOHER der Wert kommt. Das entscheidet die gemessene Faehigkeit
   (quant/config/multi-asset.json#sources, belegt durch
   quant/data/market/capabilities/multi-asset-probe.json). resolve() fuegt
   beides zusammen und setzt den Status:

     ACTIVE           Quelle gemessen und angebunden
     CAPABILITY_GAP   keine Quelle liefert es belastbar - benannt, nicht
                      durch einen Proxy ersetzt
     LICENSE_PENDING  technisch vorhanden, oeffentliche Anzeige nicht
                      freigegeben (Owner-Entscheidung)
     CANDIDATE        noch nicht entschieden

   Nicht jedes Feld ist fuer jede Klasse befuellt. Ein fehlendes Feld ist
   null, nie ein erfundener Wert.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Taxonomy = isNode ? require("./asset-taxonomy.js") : (global.VUMultiAsset && global.VUMultiAsset.Taxonomy);
  var CompanyMaster = null;
  var CATALOG = null;
  var SOURCES = null;

  if (isNode) {
    var path = require("path");
    CompanyMaster = require("../company-master.js");
    CATALOG = require(path.join(__dirname, "..", "..", "config", "multi-asset-instruments.json"));
    SOURCES = require(path.join(__dirname, "..", "..", "config", "multi-asset.json"));
  }

  var VERSION = "multi-asset-instrument-catalog-1.0.0";
  var STATUSES = ["ACTIVE", "CAPABILITY_GAP", "LICENSE_PENDING", "CANDIDATE"];

  var cache = null;

  function mint(entry, catalog) {
    var ns = (catalog && catalog.idNamespace) || { provider: "vu-core" };
    if (entry.instrumentId) return entry.instrumentId;
    if (!CompanyMaster) return null;
    return CompanyMaster.mintInstrumentId({ provider: ns.provider, exchange: entry.assetClass, symbol: entry.symbol }, 0);
  }

  function build(catalog) {
    var list = ((catalog || CATALOG || {}).instruments || []).map(function (e) {
      var out = {};
      Object.keys(e).forEach(function (k) { out[k] = e[k]; });
      out.instrumentId = mint(e, catalog || CATALOG);
      out.assetType = out.assetClass;                     /* §14 nennt es assetType, §49 assetClass - dieselbe Aufzaehlung */
      out.segment = "MULTI_ASSET";
      out.status = "CANDIDATE";
      out.findings = Taxonomy.validateInstrument(e);
      return out;
    });
    return list;
  }

  function all(catalog) {
    if (catalog) return build(catalog);
    if (!cache) cache = build(null);
    return cache;
  }

  function byAssetClass(cls, catalog) { return all(catalog).filter(function (i) { return i.assetClass === cls; }); }
  function bySymbol(sym, catalog) {
    var s = String(sym || "").toUpperCase();
    return all(catalog).filter(function (i) { return i.symbol === s; })[0] || null;
  }
  function byId(id, catalog) { return all(catalog).filter(function (i) { return i.instrumentId === id; })[0] || null; }

  /**
   * Fuegt Katalogeintrag und Quellenentscheidung zusammen.
   *
   * @param {object} instrument  Katalogeintrag
   * @param {object} decision    Eintrag aus multi-asset.json#sources[symbol]
   * @returns {object} aufgeloestes Instrument (kanonische Master-Zeile)
   */
  function resolve(instrument, decision) {
    var i = {};
    Object.keys(instrument).forEach(function (k) { i[k] = instrument[k]; });
    delete i.expectedRange;                               /* nur fuer die Identitaetspruefung der Sondierung */
    delete i.providerCandidates;
    if (!decision) {
      i.status = "CANDIDATE";
      i.source = null;
      i.providerIdentifiers = {};
      return i;
    }
    i.status = STATUSES.indexOf(decision.status) !== -1 ? decision.status : "CANDIDATE";
    i.source = decision.sourceId || null;
    i.sourceRole = decision.role || null;
    i.providerIdentifiers = decision.providerIdentifiers || {};
    /* Wo die Quelle die Semantik festlegt (Rohstoffe), gewinnt sie. */
    ["subType", "exchangeOrVenue", "sessionProfile", "publisherProfile", "unit", "quantity", "timezone", "name", "nameDe"].forEach(function (k) {
      if (decision[k] !== undefined && decision[k] !== null) i[k] = decision[k];
    });
    i.priceSemantics = decision.priceSemantics || null;   /* z. B. SPOT_REFERENCE, MID, CLOSE */
    i.frequency = decision.frequency || null;
    i.gap = decision.gap || null;
    i.measured = decision.measured || decision.alsoMeasured || null;
    i.findings = Taxonomy.validateInstrument(i);
    i.unitId = Taxonomy.unitId(i.unit, i.currency, i.quantity);
    i.changeSemantics = Taxonomy.changeSemantics(i.valueSemantics);
    i.conversion = Taxonomy.conversionFor(i.assetClass, i.unit);
    i.yieldKind = Taxonomy.YIELD_KIND[i.subType] || null;
    return i;
  }

  /** Alle Instrumente aufgeloest gegen die Quellenentscheidungen. */
  function resolved(sources, catalog) {
    var src = (sources || SOURCES || {}).sources || {};
    return all(catalog).map(function (inst) { return resolve(inst, src[inst.symbol] || null); });
  }

  var api = { VERSION: VERSION, STATUSES: STATUSES, all: all, byAssetClass: byAssetClass,
              bySymbol: bySymbol, byId: byId, resolve: resolve, resolved: resolved };

  if (isNode) module.exports = api;
  else { global.VUMultiAsset = global.VUMultiAsset || {}; global.VUMultiAsset.Catalog = api; }
})(typeof window !== "undefined" ? window : globalThis);
