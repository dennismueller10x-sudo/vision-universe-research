/* Gemeinsame Freigabe des Live-Stroms je Ticker (Quant und Technical).
 *
 * Vorher steckte die Entscheidung "darf dieser Titel einen Live-Strom bekommen?" in quant/api/product-services.js
 * (getRealtimeCapability) und war nur fuer Quant erreichbar. Technical (und jede weitere Welt) bekam dadurch entweder
 * keinen Live-Strom oder - bei einem Eigenbau aus meta.json - einen ohne Identitaets- und Freigabepruefung.
 *
 * Diese Datei ist die EINE Stelle. Sie prueft in dieser Reihenfolge, nichts wird uebersprungen:
 *   1. Kuerzel ist wohlgeformt,
 *   2. kanonische Identitaet im Produktuniversum (vu_-ID, masterMemberId, legacyIds),
 *   3. Strom ist in der Konfiguration eingeschaltet und die Adresse ist die des Vision-Universe-Relays,
 *   4. die Freigabe-Politik (display-policy, Gate "realtime") erlaubt ihn oeffentlich fuer diesen Ticker.
 * Antwort: { state: "AVAILABLE", identity, transport, url, onDemand, connectionState, priceSemantics, chartMovement }
 * oder { state: "UNAVAILABLE", reason, stocks: [] }. Der Relay-Client (quant/api/live-relay-client.js) prueft sie
 * ein zweites Mal und verbindet nur bei einer vollstaendigen Antwort.
 *
 * Quant reicht seine eigenen identity/config/publicPermission durch (eine Konfiguration, ein Cache); eine andere Welt
 * uebergibt nur loadJSON und die Engines (Directory, Master, displayPolicy) und bekommt dieselbe Pruefung.
 *
 * Browser: globalThis.VURealtimeCapability; Node (Tests): module.exports.
 */
(function (g) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  function unavailable(reason) { return { state: "UNAVAILABLE", reason: reason, stocks: [] }; }
  function identityModel(i) {
    return { securityId: i.instrumentId, instrumentId: i.instrumentId, masterMemberId: i.masterMemberId, issuerId: i.issuerId || null,
      ticker: i.symbol, name: i.companyName || i.symbol, productEligibility: i.productEligibility };
  }

  /**
   * @param {object} d  {loadJSON, displayPolicy, directory, master}  oder die fertigen Teile {identity, config, publicPermission}
   */
  function create(d) {
    d = d || {};
    var configP = null;
    var policy = d.displayPolicy, load = d.loadJSON;
    var Master = d.master || (isNode ? require("../engines/company-master.js") : g.VUCompanyMaster);
    var Directory = d.directory || (isNode ? require("../engines/instrument-directory.js") : g.VUInstrumentDirectory);
    var directory = null;

    function ownConfig() {
      if (!configP) {
        configP = Promise.all([load("/quant/config/development-preview.json"), load("/quant/config/feature-gates.json")])
          .then(function (v) { policy.declareFromConfig(v[0]); return { preview: v[0], gates: policy.gatesFromConfig(v[1]) }; })
          .catch(function (e) { configP = null; throw e; });
      }
      return configP;
    }
    async function ownIdentity(ticker) {
      if (!directory) directory = Directory.create({ loadJSON: load });
      var result = await directory.getInstrument(ticker), i = result.instrument;
      if (result.status !== "OK" || !i || i.symbol !== ticker || !Master.inProductUniverse(i) || !/^vu_[a-f0-9]+$/.test(i.instrumentId) ||
        !i.masterMemberId || !(i.legacyIds || []).includes(i.masterMemberId)) return null;
      return i;
    }
    async function ownPublicPermission(ticker, dataClass, form) {
      var c = await config();
      return policy.check({ providerId: "tiingo", dataClass: dataClass || "marketData", audience: "public", form: form || "raw", ticker: ticker, gates: c.gates }).allowed;
    }
    var config = d.config || ownConfig, identity = d.identity || ownIdentity, publicPermission = d.publicPermission || ownPublicPermission;

    async function getRealtimeCapability(ticker) {
      ticker = String(ticker || "").toUpperCase();
      if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return unavailable("INVALID_IDENTITY");
      try {
        var instrument = await identity(ticker);
        if (!instrument) return unavailable("INVALID_IDENTITY");
        var c = await config(), stream = c.preview.stream;
        if (!stream || !stream.enabled || !(await publicPermission(ticker, "realtime", "realtime"))) return unavailable("DISPLAY_NOT_PERMITTED");
        if (stream.url !== "wss://live.visionuniverse.de/live") return unavailable("UNSUPPORTED_RELAY");
        return { state: "AVAILABLE", identity: identityModel(instrument), transport: "VISION_UNIVERSE_RELAY", url: stream.url, onDemand: true,
          connectionState: "NOT_CONNECTED", priceSemantics: "UNSPECIFIED", chartMovement: "TRADE_EVENTS_ONLY" };
      } catch (e) { return unavailable("SOURCE_MISSING"); }
    }
    return { getRealtimeCapability: getRealtimeCapability, config: config, identity: identity, publicPermission: publicPermission };
  }

  var api = { VERSION: "realtime-capability-1.0.0", create: create, unavailable: unavailable, identityModel: identityModel };
  if (isNode) module.exports = api; else g.VURealtimeCapability = api;
})(typeof window !== "undefined" ? window : globalThis);
