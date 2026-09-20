/* =========================================================================
   VISION UNIVERSE DISCOVER — theme.js

   FARBSCHEMA: SYSTEM · HELL · DUNKEL (V4.1 §12)

   Discover folgt dem Geraet, solange niemand etwas anderes sagt. Wer
   waehlt, bekommt seine Wahl beim naechsten Besuch wieder - auf diesem
   Geraet, ohne Konto. Die Wahl ist ein Wort im Browser-Speicher; fehlt
   der Speicher (privates Fenster), gilt das System.

   Der Zustand hat zwei Seiten:
     mode      system | light | dark      (was gewaehlt wurde)
     resolved  light | dark               (was gerade gezeichnet wird)

   Angewendet wird er an EINER Stelle: <html data-theme="light|dark"
   data-theme-mode="system|light|dark">. Alle Farben in discover.css
   haengen an Tokens, die dort umschalten; die Site-Navigation bekommt
   dasselbe Wort als Attribut, die Adressleiste ihre Farbe ueber
   <meta name="theme-color">.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "discover-theme-1.0.0";
  var KEY = "vu-discover-theme-v1";
  var MODES = ["system", "light", "dark"];
  var QUERY = "(prefers-color-scheme: light)";
  var BAR = { light: "#f7f7f4", dark: "#08080a" };

  function label(mode) {
    return mode === "light" ? "Hell" : mode === "dark" ? "Dunkel" : "System";
  }

  /**
   * @param {object} opts {storage, matchMedia, document}
   */
  function create(opts) {
    opts = opts || {};
    var store = opts.storage || null;
    var mm = typeof opts.matchMedia === "function" ? opts.matchMedia : null;
    var doc = opts.document || null;
    var listeners = [];
    var mode = lesen();

    function lesen() {
      try {
        var v = store ? store.getItem(KEY) : null;
        return v === "light" || v === "dark" ? v : "system";
      } catch (err) { return "system"; }
    }
    function systemHell() {
      try { return !!(mm && mm(QUERY) && mm(QUERY).matches); } catch (err) { return false; }
    }
    function resolved() {
      return mode === "system" ? (systemHell() ? "light" : "dark") : mode;
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
        if (store) { if (m === "system") store.removeItem(KEY); else store.setItem(KEY, m); }
      } catch (err) { /* kein Speicher: die Wahl gilt fuer diese Sitzung */ }
      anwenden();
      return true;
    }
    function cycle() {
      set(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
      return mode;
    }

    /* Wechselt das Geraet sein Schema, folgt Discover - aber nur im Modus
       "System". Eine ausdrueckliche Wahl bleibt stehen. */
    if (mm) {
      try {
        var q = mm(QUERY);
        var h = function () { if (mode === "system") anwenden(); };
        if (q && q.addEventListener) q.addEventListener("change", h);
        else if (q && q.addListener) q.addListener(h);
      } catch (err) { /* keine Medienabfrage */ }
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

  var api = { VERSION: VERSION, KEY: KEY, MODES: MODES.slice(), QUERY: QUERY, BAR: BAR, label: label, create: create };
  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Theme = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
