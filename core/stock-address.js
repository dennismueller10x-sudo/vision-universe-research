/* =========================================================================
   VISION UNIVERSE — core/stock-address.js        Eine Aktienadresse (Z2)

   Redesign 2027 (Folien N4, N5, D09, Q07 ff.; Plan Neustart §7 Z2):
   Jede Aktie hat eine Adresse /aktie/<T>, die Perspektive steht in ?p=.
     /aktie/NVDA              -> Perspektive der Herkunftswelt, sonst Überblick
     /aktie/NVDA?p=faktoren   -> Quant
     /aktie/NVDA?p=zahlen     -> Fundamental
   Die Seiten selbst liegen weiter in ihren Welten (statische Seite, je Welt
   eine App); diese Adresse löst über core/stock-context.js#href auf die
   Welt-Adresse auf. Identität nur über core/identity.js (ADR-001).

   Braucht vorher /core/identity.js und /core/stock-context.js.
   Browser: globalThis.VUCore.StockAddress; Node: module.exports.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var SC = typeof module === "object" && module.exports ? require("./stock-context.js") : root.VUCore && root.VUCore.StockContext;
  var api = factory(SC);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.StockAddress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (SC) {
  "use strict";

  if (!SC || typeof SC.href !== "function") throw new Error("VUCore.StockContext fehlt (core/stock-context.js vor stock-address.js laden)");

  var VERSION = "core-stock-address-1.0.0";
  var BASE = "/aktie/";
  /* Perspektive (Wort im Mockup C05) -> Welt (StockContext.PRODUCTS). Reihenfolge wie die Leiste. */
  var PERSPECTIVES = Object.freeze({
    ueberblick: "discover",
    chart: "technical",
    zahlen: "fundamental",
    faktoren: "quant",
    methoden: "supertrader",
    wellen: "technik",
    investoren: "hedgefonds"
  });
  var DEFAULT = "ueberblick";
  /* Welt -> Perspektive; Elliott-Profi zeigt dieselbe Perspektive wie das Chartbild. */
  var BY_PRODUCT = { elliott: "wellen" };
  Object.keys(PERSPECTIVES).forEach(function (p) { BY_PRODUCT[PERSPECTIVES[p]] = p; });
  /* Erster Pfadteil -> Welt, aus der jemand kommt (Herkunftswelt bestimmt die Perspektive). */
  var WORLD_PATH = { discover: "discover", quant: "quant", technical: "technical", elliott: "technik", supertrader: "supertrader", fundamental: "fundamental", hedgefonds: "hedgefonds" };

  function perspectiveOf(product) { return BY_PRODUCT[product] || null; }

  /** Kanonische Adresse: /aktie/NVDA oder /aktie/NVDA?p=zahlen (Überblick ohne p). */
  function canonical(ctxOrTicker, perspective) {
    var ctx = typeof ctxOrTicker === "string" ? SC.fromUs(ctxOrTicker) : ctxOrTicker;
    if (!ctx || ctx.region !== "US") return null;
    var p = PERSPECTIVES[perspective] ? perspective : BY_PRODUCT[perspective] || DEFAULT;
    return BASE + encodeURIComponent(ctx.ticker) + (p === DEFAULT ? "" : "?p=" + p);
  }

  /** Kanonische Adresse einer Welt-Adresse (/quant/#/aktie/NVDA -> /aktie/NVDA?p=faktoren), sonst null. */
  function fromWorldUrl(url) {
    var r = SC.parse(url);
    return r && r.ctx.region === "US" ? canonical(r.ctx, perspectiveOf(r.product)) : null;
  }

  function worldFromReferrer(ref) {
    var m = /^(?:https?:\/\/[^/]+)?\/([a-z]+)\//.exec(String(ref || ""));
    return m && WORLD_PATH[m[1]] ? WORLD_PATH[m[1]] : null;
  }

  /**
   * Adresse auflösen. pathname: /aktie/NVDA oder /aktie/; search: ?p=..&t=..; referrer: Herkunft.
   * @returns {{state:"OK", ticker, perspective, href, canonical} | {state:"NOT_A_STOCK"|"INVALID"|"UNAVAILABLE", ...}}
   */
  function resolve(pathname, search, referrer) {
    var path = String(pathname || "").replace(/\/index\.html$/, "/");
    if (path.indexOf(BASE) !== 0) return { state: "NOT_A_STOCK" };
    var q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    var rest = path.slice(BASE.length).replace(/\/+$/, ""), raw;
    try { raw = rest ? decodeURIComponent(rest) : q.get("t") || ""; } catch (e) { return { state: "INVALID", input: rest }; }
    if (!raw) return { state: "NOT_A_STOCK" };
    if (raw.indexOf("/") >= 0) return { state: "INVALID", input: raw };
    var ctx;
    try { ctx = SC.fromUs(raw); } catch (e) { return { state: "INVALID", input: raw }; }
    var asked = q.get("p"), perspective = PERSPECTIVES[asked] ? asked : null;
    if (!perspective) perspective = perspectiveOf(worldFromReferrer(referrer)) || DEFAULT;
    var href = SC.href(ctx, PERSPECTIVES[perspective]);
    if (!href) return { state: "UNAVAILABLE", ticker: ctx.ticker, perspective: perspective };
    return { state: "OK", ticker: ctx.ticker, perspective: perspective, href: href, canonical: canonical(ctx, perspective) };
  }

  return Object.freeze({ VERSION: VERSION, BASE: BASE, PERSPECTIVES: PERSPECTIVES, DEFAULT: DEFAULT, perspectiveOf: perspectiveOf, canonical: canonical, fromWorldUrl: fromWorldUrl, resolve: resolve });
});
