/* =========================================================================
   VISION UNIVERSE VORSORGE — series-codec.js   (vorsorge-series-codec-1.0.0)

   Kompakte Kursreihen fuer die Auslieferung. Eine Reihe
     [["2024-01-02", 101.25], ["2024-01-03", 101.9], ...]
   wird zu
     { t0: "2024-01-02", dt: [0, 1, ...], v: [101.25, 101.9, ...] }
   dt = Tage seit dem vorherigen Punkt (erster Wert 0), v = Werte mit
   sechs signifikanten Stellen. Verlustfrei fuer Datum, Rundung nur in der
   7. Stelle. Rund die Haelfte der Bytes einer Paarliste.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var DAY = 864e5;
  function round(v) { return Number(Number(v).toPrecision(6)); }
  function encode(points) {
    if (!Array.isArray(points) || !points.length) return null;
    var t0 = points[0][0], prev = Date.parse(t0 + "T00:00:00Z"), dt = [], v = [];
    points.forEach(function (p) { var t = Date.parse(p[0] + "T00:00:00Z"); dt.push(Math.round((t - prev) / DAY)); prev = t; v.push(round(p[1])); });
    return { t0: t0, dt: dt, v: v };
  }
  function decode(s) {
    if (!s) return [];
    if (Array.isArray(s)) return s;
    var t = Date.parse(s.t0 + "T00:00:00Z"), out = [];
    for (var i = 0; i < s.v.length; i++) { t += (s.dt[i] || 0) * DAY; out.push([new Date(t).toISOString().slice(0, 10), s.v[i]]); }
    return out;
  }
  var api = { VERSION: "vorsorge-series-codec-1.0.0", encode: encode, decode: decode, round: round };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Codec = api; }
})(typeof window !== "undefined" ? window : globalThis);
