/* =========================================================================
   VISION UNIVERSE DISCOVER — theme.js

   FARBSCHEMA: HELL · DUNKEL

   Discover startet hell. Eine ausdrueckliche Wahl bleibt auf diesem
   Geraet gespeichert; ohne Speicher gilt ebenfalls Hell.

   Der Zustand hat zwei Seiten:
     mode      light | dark               (was gewaehlt wurde)
     resolved  light | dark               (was gerade gezeichnet wird)

   Angewendet wird er an EINER Stelle: <html data-theme="light|dark"
   data-theme-mode="light|dark">. Alle Farben in discover.css
   haengen an Tokens, die dort umschalten; die Site-Navigation bekommt
   dasselbe Wort als Attribut, die Adressleiste ihre Farbe ueber
   <meta name="theme-color">.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "discover-theme-1.0.0";
  var KEY = "vu-discover-theme-v1";
  var MODES = ["light", "dark"];
  var BAR = { light: "#f7f7f4", dark: "#08080a" };

  function label(mode) {
    return mode === "dark" ? "Dunkel" : "Hell";
  }

  /**
   * @param {object} opts {storage, document}
   */
  function create(opts) {
    opts = opts || {};
    var store = opts.storage || null;
    var doc = opts.document || null;
    var listeners = [];
    var mode = lesen();

    function lesen() {
      try {
        var v = store ? store.getItem(KEY) : null;
        return v === "dark" ? "dark" : "light";
      } catch (err) { return "light"; }
    }
    function resolved() {
      return mode;
    }
    function anwenden() {
      var r = resolved();
      if (doc && doc.documentElement) {
        doc.documentElement.setAttribute("data-theme", r);
        doc.documentElement.setAttribute("data-theme-mode", mode);
        var meta = doc.querySelector ? doc.querySelector('meta[name="theme-color"]') : null;
        if (meta) meta.setAttribute("content", BAR[r]);
        var nav = doc.querySelector ? doc.querySelector("vu-navigation") : null;
        if (nav) nav.setAttribute("theme", r);
      }
      listeners.forEach(function (fn) { try { fn({ mode: mode, resolved: r }); } catch (err) { /* Zuhoerer */ } });
    }
    function set(m) {
      if (MODES.indexOf(m) === -1) return false;
      mode = m;
      try {
        if (store) store.setItem(KEY, m);
      } catch (err) { /* kein Speicher: die Wahl gilt fuer diese Sitzung */ }
      anwenden();
      return true;
    }
    function cycle() {
      set(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
      return mode;
    }

    anwenden();

    return {
      mode: function () { return mode; },
      resolved: resolved,
      set: set,
      cycle: cycle,
      modes: MODES.slice(),
      label: label,
      onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); }
    };
  }

  var api = { VERSION: VERSION, KEY: KEY, MODES: MODES.slice(), BAR: BAR, label: label, create: create };
  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Theme = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
