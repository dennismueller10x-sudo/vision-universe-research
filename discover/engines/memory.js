/* =========================================================================
   VISION UNIVERSE DISCOVER — memory.js

   SITZUNGSGEDÄCHTNIS OHNE KONTO

   Discover soll beim zweiten Besuch nicht so tun, als wäre es der erste.
   Dafür braucht es kein Konto und keinen Server: der Browser merkt sich,
   was angesehen wurde. Das bleibt auf dem Gerät, geht nirgendwohin und
   lässt sich mit einem Klick löschen.

   Gemerkt wird wenig, und nur, was eine Anzeige tragen kann:

     zuletzt angesehene Aktien     → die Reihe "Zuletzt angesehen"
     geöffnete Karten              → eine Karte, die man schon kennt,
                                     wird nicht als neu behandelt
     zuletzt besuchte Sammlungen   → später: "Mehr aus …"
     die Position auf der Startseite

   Speicher kann fehlen (privates Fenster, gesperrte Website-Daten). Jede
   Funktion hier funktioniert dann trotzdem - nur ohne Gedächtnis.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var VERSION = "discover-memory-1.0.0";
  var KEY = "vu-discover-memory-v1";
  var MAX_RECENT = 12;
  var MAX_OPENED = 200;

  function leer() { return { v: 1, recent: [], opened: [], collections: {}, position: {} }; }

  /**
   * Erzeugt ein Gedächtnis über einem Speicher (localStorage oder ein
   * Objekt mit getItem/setItem/removeItem - so lässt es sich in Node
   * prüfen).
   */
  function create(storage) {
    var store = storage;
    if (!store) {
      try { store = global.localStorage; } catch (err) { store = null; }
    }
    var zustand = lesen();

    function lesen() {
      try {
        var roh = store && store.getItem(KEY);
        if (!roh) return leer();
        var s = JSON.parse(roh);
        if (!s || s.v !== 1) return leer();
        s.recent = Array.isArray(s.recent) ? s.recent : [];
        s.opened = Array.isArray(s.opened) ? s.opened : [];
        s.collections = s.collections && typeof s.collections === "object" ? s.collections : {};
        s.position = s.position && typeof s.position === "object" ? s.position : {};
        return s;
      } catch (err) { return leer(); }
    }
    function schreiben() {
      try { if (store) store.setItem(KEY, JSON.stringify(zustand)); } catch (err) { /* kein Speicher */ }
    }

    /** Eine Aktie wurde angesehen. Jüngste zuerst, keine Doppelten. */
    function recordView(symbol, info) {
      if (!symbol) return;
      info = info || {};
      zustand.recent = zustand.recent.filter(function (e) {
        return !(e.symbol === symbol && e.universeId === (info.universeId || "US_REAL"));
      });
      zustand.recent.unshift({ symbol: symbol, universeId: info.universeId || "US_REAL",
                               companyName: info.companyName || null, world: info.world || null,
                               at: Date.now() });
      if (zustand.recent.length > MAX_RECENT) zustand.recent.length = MAX_RECENT;
      if (zustand.opened.indexOf(symbol) === -1) {
        zustand.opened.push(symbol);
        if (zustand.opened.length > MAX_OPENED) zustand.opened.shift();
      }
      schreiben();
    }
    function recent(universeId) {
      return zustand.recent.filter(function (e) { return !universeId || e.universeId === universeId; });
    }
    function opened(symbol) { return zustand.opened.indexOf(symbol) !== -1; }

    function recordCollection(rowId) {
      if (!rowId) return;
      zustand.collections[rowId] = (zustand.collections[rowId] || 0) + 1;
      schreiben();
    }
    function preferredCollections(n) {
      return Object.keys(zustand.collections)
        .sort(function (a, b) { return zustand.collections[b] - zustand.collections[a] || (a < b ? -1 : 1); })
        .slice(0, n || 3);
    }
    function setPosition(universeId, index) {
      zustand.position[universeId || "US_REAL"] = index;
      schreiben();
    }
    function position(universeId) {
      var p = zustand.position[universeId || "US_REAL"];
      return typeof p === "number" ? p : 0;
    }
    function clear() {
      zustand = leer();
      try { if (store) store.removeItem(KEY); } catch (err) { /* kein Speicher */ }
    }
    function available() { return !!store; }

    return { recordView: recordView, recent: recent, opened: opened,
             recordCollection: recordCollection, preferredCollections: preferredCollections,
             setPosition: setPosition, position: position, clear: clear, available: available };
  }

  var api = { VERSION: VERSION, KEY: KEY, MAX_RECENT: MAX_RECENT, create: create };
  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Memory = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
