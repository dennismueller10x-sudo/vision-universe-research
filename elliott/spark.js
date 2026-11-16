/* VISION UNIVERSE ELLIOTT — spark.js: Mini-Chart (C06 klein, assets/vu-chart.js) und Tagesbewegung je Karte.
   Echte Schlusskurse des letzten Jahres aus quant/data/market/discover-series (Identitaet nur ueber core/identity.js),
   erst geladen, wenn die Karte sichtbar wird. Fehlt die Reihe, bleibt der Platz leer (kein erfundener Verlauf).
   Tagesbewegung (App-Konzept 2, Pille): nur ueber quant/engines/published-close.js#dayChange aus derselben Reihe (ADR-002);
   ohne nachweisbaren Vortag keine Pille. */
(function (global) {
  "use strict";
  var cache = {}, pcP = null;
  function raw(t) {
    var Id = global.VUCore && global.VUCore.Identity, id;
    try { id = Id.securityIdForTicker(t); } catch (e) { return Promise.resolve(null); }
    return cache[t] || (cache[t] = fetch("/quant/data/market/discover-series/" + id + ".json", { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(function () { return null; }));
  }
  function series(t) {
    return raw(t).then(function (d) { var v = ((d && d.points) || []).map(function (p) { return p[1]; }), step = Math.max(1, Math.round(v.length / 52)); return v.filter(function (x, i) { return i % step === 0 || i === v.length - 1; }); });
  }
  function closeLib() {
    if (global.VUPublishedClose) return Promise.resolve(global.VUPublishedClose);
    return pcP || (pcP = new Promise(function (ok) {
      var sc = document.createElement("script"); sc.src = "/quant/engines/published-close.js";
      sc.onload = function () { ok(global.VUPublishedClose || null); }; sc.onerror = function () { pcP = null; ok(null); };
      document.head.appendChild(sc);
    }));
  }
  function paint(node) {
    if (node.classList.contains("ek-chg")) return Promise.all([raw(node.dataset.t), closeLib()]).then(function (r) {
      var U = global.VUUI, d = r[0] && r[1] ? r[1].dayChange(r[0], new Date().toISOString().slice(0, 10)) : null;
      if (d && U && U.chg) node.innerHTML = U.chg(d.change * 100);
    });
    series(node.dataset.t).then(function (v) {
      var C = global.VUChart, svg = C && v.length > 1 ? C.sparkline(v, { width: +node.dataset.w || 64, height: +node.dataset.h || 30 }) : "";
      if (svg) { var t = document.createElement("template"); t.innerHTML = svg; node.replaceChildren(t.content); }
    });
  }
  var io = global.IntersectionObserver ? new global.IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); paint(e.target); } });
  }, { rootMargin: "200px" }) : null;
  function observe(node) { if (io) io.observe(node); else paint(node); }
  global.VUElliottSpark = { observe: observe, move: observe, series: series };
})(typeof globalThis !== "undefined" ? globalThis : this);
