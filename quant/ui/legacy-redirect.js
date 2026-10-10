/* =========================================================================
   VISION UNIVERSE QUANT — ui/legacy-redirect.js

   Die alten Mehrseiten-Adressen unter /quant/ (Ranking, Screener,
   Strategien, Strategy Lab, Backtests, Watchlist, Aktie, Technical, AI,
   Radar) liefen ausnahmslos auf dem synthetischen Modelluniversum
   (511 erfundene Wertpapiere). Eigentuemerentscheidung: keine sichtbare
   Seite rechnet mehr auf diesem Datensatz. Die Adressen bleiben trotzdem
   erreichbar - als Weiterleitung auf die kanonische App unter /quant/
   (Hash-Routen, siehe quant/app/app.js), die nur echte Daten zeigt.

   legacyPathRoute(pathname, search) ist eine reine Funktion und in Node
   testbar (quant/tests/no-mock-in-product.test.mjs prueft jedes Ziel gegen
   QXApp.parse). Im Browser wird sie beim Laden einmal ausgewertet und per
   location.replace angewendet - ohne zusaetzlichen Eintrag im Verlauf.

   Bewusst NICHT abgebildet: eine Gesamt-Rangliste. quant-v2.json
   (publication.allowed:false) und die Faktorevidenz (rankingAllowed:false)
   verbieten einen veroeffentlichten Composite-Score; die alte Ranking-
   Adresse fuehrt deshalb auf den Screener, bei einer Einzelfaktor-Sicht
   auf die passende Frage.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (root) {
    root.VULegacyRedirect = api;
    if (root.location && typeof root.location.replace === "function") api.run(root);
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var APP = "/quant/";
  var TICKER = /^[A-Z0-9.-]{1,12}$/;
  /* Synthetische Kennungen des Modelluniversums (VU0001 ..., VUF011 ...). */
  var MOCK_TICKER = /^VUF?\d+$/;

  /* Alte Ranking-Sichten -> Screener-Frage. Nur Einzelfaktor-Sichten mit
     einer echten Entsprechung; Gesamt-Score und Score-Velocity haben keine. */
  var RANKING_VIEW = {
    qualityScore: "qualitaet",
    momentumScore: "momentum",
    growthScore: "wachstum-qualitaet",
    valueScore: "guenstig",
    riskScore: "ruhig"
  };

  /* Alte Bibliotheksstrategien (quant/data/strategies.json) -> Profile aus
     quant/methodology/strategy-profiles-v1.json. Nur eindeutige Paare. */
  var STRATEGY = {
    "vu-quality-compounders": "quality-compounder",
    "vu-momentum-leaders": "momentum-leader",
    "vu-quality-momentum": "quality-momentum",
    "vu-garp": "garp",
    "vu-future-leaders": "future-leader"
  };

  /* Lokale Speicherstaende der alten Seiten. Sie verweisen auf synthetische
     Kennungen (sec_VU0001 ...) und haben in der App keine Bedeutung. */
  var MOCK_STORAGE_KEYS = ["vu.quant.backtests.v1", "vu.quant.strategies.v1"];
  var WATCHLIST_KEY = "vu.quant.watchlist.v1";

  function normalizePath(pathname) {
    var p = String(pathname || "/").replace(/\/index\.html?$/i, "/").toLowerCase();
    if (p.charAt(p.length - 1) !== "/") p += "/";
    return p.replace(/\/{2,}/g, "/");
  }

  function params(search) {
    try { return new URLSearchParams(search || ""); } catch (e) { return new URLSearchParams(""); }
  }

  function stockTarget(raw, suffix) {
    var t = String(raw || "").trim().toUpperCase();
    if (!TICKER.test(t) || MOCK_TICKER.test(t)) return APP + "#/aktien";
    return APP + "#/aktie/" + t + (suffix || "");
  }

  /**
   * Bildet eine alte Quant-Adresse auf ihr Ziel ab.
   * @returns {string|null} Ziel (Pfad + Hash) oder null, wenn der Pfad keine
   *   alte Quant-Seite ist.
   */
  function legacyPathRoute(pathname, search) {
    var path = normalizePath(pathname);
    var p = params(search);
    switch (path) {
      case "/quant/ranking/": {
        var frage = RANKING_VIEW[p.get("view") || ""];
        return APP + "#/screener" + (frage ? "?frage=" + frage : "");
      }
      case "/quant/screener/":
        return APP + "#/screener/profi";
      case "/quant/strategies/": {
        var profile = STRATEGY[String(p.get("id") || "").toLowerCase()];
        return APP + "#/strategien" + (profile ? "/" + profile : "");
      }
      case "/quant/strategies/builder/":
        return APP + "#/screener/profi?hinweis=strategy-lab";
      case "/quant/backtests/":
        return APP + "#/backtest";
      case "/quant/watchlist/":
        return APP + "#/aktien";
      case "/quant/stock/":
        return stockTarget(p.get("ticker"));
      case "/quant/technical/":
        return stockTarget(p.get("symbol") || p.get("ticker"), "/technik");
      case "/quant/ai/":
        return "/ask/";
      case "/quant/radar/":
        return APP + "#/radar";
      default:
        return null;
    }
  }

  /**
   * Entfernt die Speicherstaende der alten Seiten. Die Merkliste wird nur
   * geloescht, wenn sie in der alten Objektform vorliegt - die App speichert
   * unter demselben Schluessel eine Liste von Tickern, und die bleibt.
   */
  function clearMockStorage(storage) {
    if (!storage) return;
    try {
      MOCK_STORAGE_KEYS.forEach(function (k) { storage.removeItem(k); });
      var raw = storage.getItem(WATCHLIST_KEY);
      if (raw !== null) {
        var v = null;
        try { v = JSON.parse(raw); } catch (e) { v = null; }
        if (!Array.isArray(v)) storage.removeItem(WATCHLIST_KEY);
      }
    } catch (e) { /* Speicher gesperrt (privates Fenster) - nichts zu tun */ }
  }

  function run(win) {
    var target = legacyPathRoute(win.location.pathname, win.location.search);
    var storage = null;
    try { storage = win.localStorage; } catch (e) { storage = null; }
    clearMockStorage(storage);
    win.location.replace(target || APP + "#/");
  }

  return {
    legacyPathRoute: legacyPathRoute,
    clearMockStorage: clearMockStorage,
    run: run,
    RANKING_VIEW: RANKING_VIEW,
    STRATEGY: STRATEGY,
    MOCK_STORAGE_KEYS: MOCK_STORAGE_KEYS
  };
});
