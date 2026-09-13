/* =========================================================================
   VISION UNIVERSE DISCOVER — analytics.js

   DER EREIGNIS-VERTRAG

   Was Discover später personalisieren soll ("Weil du NVIDIA angesehen
   hast", "Mehr aus Technologie"), braucht heute nur eines: dass die
   Ereignisse sauber benannt sind und an EINER Stelle vorbeikommen. Mehr
   ist dieses Modul nicht. Es sendet nichts, es speichert nichts, es
   kennt keinen Anbieter. Es prüft, dass ein Ereignis einen der zehn
   vereinbarten Namen trägt, versieht es mit einem Zeitstempel und reicht
   es an eine Senke weiter - wenn jemand eine gesetzt hat.

   WAS GEMESSEN WIRD, UND WAS NICHT

   Gezählt wird, was nützt: welche Sammlung geöffnet wird, welche Karte
   zur Aktienseite führt, welcher Zeitraum am Chart gewählt wird. Nicht
   gemessen wird, wie lange jemand wischt. Eine Kennzahl "Zeit im Feed"
   hätte nur einen Zweck - sie zu maximieren -, und genau das soll
   dieses Produkt nicht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var CONTRACT_VERSION = "discover-events-1.0.0";

  /* Die zehn Ereignisse. Ein Name, der hier nicht steht, wird verworfen -
     lieber ein fehlendes Ereignis als ein Wildwuchs an Namen, den in
     einem Jahr niemand mehr zuordnen kann. */
  var EVENTS = {
    discover_impression: ["universeId"],
    collection_view:     ["universeId", "rowId", "surface"],
    card_view:           ["universeId", "rowId", "symbol", "position"],
    card_open:           ["universeId", "rowId", "symbol", "position"],
    chart_range_change:  ["universeId", "symbol", "range"],
    swipe:               ["universeId", "rowId", "method"],
    theme_open:          ["universeId", "themeId"],
    stock_open:          ["universeId", "symbol", "from"],
    immersive_start:     ["universeId", "count"],
    immersive_complete:  ["universeId", "count"]
  };

  var senken = [];
  var puffer = [];
  var PUFFER_MAX = 50;

  /**
   * Meldet ein Ereignis.
   * @returns {object|null}  das Ereignis, wie es weitergereicht wurde - oder null
   */
  function track(name, props) {
    if (!EVENTS[name]) return null;
    var ereignis = { name: name, at: new Date().toISOString(), props: {} };
    var erlaubt = EVENTS[name];
    Object.keys(props || {}).forEach(function (k) {
      if (erlaubt.indexOf(k) !== -1) ereignis.props[k] = props[k];
    });
    puffer.push(ereignis);
    if (puffer.length > PUFFER_MAX) puffer.shift();
    senken.forEach(function (s) {
      try { s(ereignis); } catch (err) { /* Analytics darf nie stoeren */ }
    });
    return ereignis;
  }

  function addSink(fn) { if (typeof fn === "function") senken.push(fn); }
  function clearSinks() { senken = []; }
  function recent() { return puffer.slice(); }

  var api = { CONTRACT_VERSION: CONTRACT_VERSION, EVENTS: EVENTS,
              track: track, addSink: addSink, clearSinks: clearSinks, recent: recent };
  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Analytics = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
