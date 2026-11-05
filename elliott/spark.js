/* VISION UNIVERSE ELLIOTT — spark.js: Mini-Chart (C06 klein, assets/vu-chart.js) je Lesart-Karte.
   Echte Schlusskurse des letzten Jahres aus quant/data/market/discover-series (Identitaet nur ueber core/identity.js),
   erst geladen, wenn die Karte sichtbar wird. Fehlt die Reihe, bleibt der Platz leer (kein erfundener Verlauf). */
(function (global) {
  "use strict";
  var cache = {};
  function series(t) {
    var Id = global.VUCore && global.VUCore.Identity, id;
    try { id = Id.securityIdForTicker(t); } catch (e) { return Promise.resolve([]); }
    return cache[t] || (cache[t] = fetch("/quant/data/market/discover-series/" + id + ".json", { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) { var v = (d.points || []).map(function (p) { return p[1]; }), step = Math.max(1, Math.round(v.length / 52)); return v.filter(function (x, i) { return i % step === 0 || i === v.length - 1; }); })
      .catch(function () { return []; }));
  }
  function paint(node) {
    series(node.dataset.t).then(function (v) {
      var C = global.VUChart, svg = C && v.length > 1 ? C.sparkline(v, { width: 64, height: 30 }) : "";
      if (svg) { var t = document.createElement("template"); t.innerHTML = svg; node.replaceChildren(t.content); }
    });
  }
  var io = global.IntersectionObserver ? new global.IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); paint(e.target); } });
  }, { rootMargin: "200px" }) : null;
  global.VUElliottSpark = { observe: function (node) { if (io) io.observe(node); else paint(node); }, series: series };
})(typeof globalThis !== "undefined" ? globalThis : this);
