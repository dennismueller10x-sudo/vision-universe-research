/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/series-loader.js

   EINE REIHE JE TITEL, EINMAL GELADEN

   Die Karten tragen ihre Kursreihe nicht mehr mit sich herum, sondern
   einen Verweis (priceSeries.path). Geladen wird, was sichtbar wird -
   und was als Naechstes kommt. Dieses Modul ist der Zwischenspeicher
   dazu: der Schluessel ist der Pfad, also Universum + Titel. Ein Titel,
   der in drei Sammlungen steht, laedt seine Reihe genau einmal; die
   Zeitraeume 1M/3M/6M/1J sind Fenster auf dieselbe Reihe, keine
   weiteren Abrufe.

   Kein WebSocket, kein Polling, kein Abo. Was hier liegt, ist ein Jahr
   Tagesschlusskurse aus discover/data/series/, statisch ausgeliefert und
   vom Build nachgerechnet. Sieben Karten sichtbar heisst sieben Abrufe,
   nicht 498 - und beim Zurueckwischen null.
   ========================================================================= */
(function (global) {
  "use strict";

  var MODULE_VERSION = "discover-series-loader-1.0.0";
  var laufend = Object.create(null);   // Pfad -> Promise
  var fertig = Object.create(null);    // Pfad -> Reihe
  var stats = { requests: 0, hits: 0, failures: 0 };

  function laden(path) {
    var S = global.QuantShell;
    if (S && S.loadJSON) return S.loadJSON(path, { attempts: 2 });
    return fetch(path, { cache: "default" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /**
   * Holt die Reihe hinter einem Verweis. Dedupliziert laufende und
   * erledigte Abrufe.
   * @param {string} path   z. B. /discover/data/series/US_REAL/NVDA.json
   * @returns {Promise<object>} die Reihe (status CALCULATED, points[])
   */
  function get(path) {
    if (!path) return Promise.reject(new Error("kein Pfad"));
    if (fertig[path]) { stats.hits++; return Promise.resolve(fertig[path]); }
    if (laufend[path]) { stats.hits++; return laufend[path]; }
    stats.requests++;
    laufend[path] = laden(path).then(function (reihe) {
      if (!reihe || reihe.status !== "CALCULATED" || !Array.isArray(reihe.points) || reihe.points.length < 5) {
        throw new Error("Reihe ohne Punkte: " + path);
      }
      fertig[path] = reihe;
      delete laufend[path];
      return reihe;
    }).catch(function (err) {
      stats.failures++;
      delete laufend[path];
      throw err;
    });
    return laufend[path];
  }

  /** Was schon da ist - ohne Abruf. */
  function peek(path) { return fertig[path] || null; }

  /** Vorladen, ohne dass jemand wartet. Fehler bleiben still. */
  function prefetch(path) {
    if (!path || fertig[path] || laufend[path]) return;
    get(path).catch(function () { /* Vorladen darf nie stoeren */ });
  }

  /** Verweis + Reihe = eine Karte, die zeichnen kann. */
  function merge(ref, reihe) {
    var out = {};
    Object.keys(ref || {}).forEach(function (k) { out[k] = ref[k]; });
    out.status = reihe.status; out.source = reihe.source;
    out.priceSeriesType = reihe.priceSeriesType; out.asOf = reihe.asOf;
    out.from = reihe.from; out.to = reihe.to; out.points = reihe.points;
    return out;
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.SeriesLoader = {
    MODULE_VERSION: MODULE_VERSION, get: get, peek: peek, prefetch: prefetch, merge: merge,
    stats: function () { return { requests: stats.requests, hits: stats.hits, failures: stats.failures,
                                  cached: Object.keys(fertig).length }; }
  };
})(window);
