/* =========================================================================
   VISION UNIVERSE — fx/currency-preference.js   (Currency Layer V1, §21, §43)

   EINE PRAEFERENZ FUER ALLE PRODUKTE.

   Das Problem, das es zu vermeiden gilt, ist konkret: Discover merkt sich
   EUR, der Screener merkt sich USD, Quant faellt auf EUR zurueck. Der
   Nutzer hat dann nicht eine Einstellung, sondern drei - und bemerkt es
   erst, wenn zwei Seiten verschiedene Zahlen fuer denselben Titel zeigen.

   Der Schluessel heisst deshalb NICHT vu-discover-currency. Er heisst
   vu-currency-preference-v1 und gehoert keinem Produkt.

   KEINE NEUE KONTO-INFRASTRUKTUR

   Vision Universe wird statisch ausgeliefert und hat kein Konto
   (discover/engines/memory.js haelt das fuer das Sitzungsgedaechtnis
   ebenso). Diese Datei baut deshalb keine, sondern legt sich auf den
   vorhandenen Speicher: localStorage im Browser, ein beliebiges Objekt
   mit getItem/setItem in Node und im Test. Kommt spaeter ein Konto, wird
   derselbe Vertrag serverseitig hinterlegt - der Aufrufcode aendert sich
   nicht.

   Speicher kann fehlen: privates Fenster, gesperrte Website-Daten, ein
   Browser mit vollem Kontingent. Dann funktioniert alles weiter, nur ohne
   Gedaechtnis. Die Vorgabe greift, und die Seite bleibt bedienbar.

   DIE VORGABE IST EUR

   Weil der primaere Consumer-Markt Deutschland ist. Sie ist eine
   Produktentscheidung und kein Naturgesetz: `defaultCurrency` ist ein
   Parameter, und eine spaetere Experience fuer einen anderen Markt setzt
   ihn anders, ohne dass hier etwas umgebaut wird.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Registry = isNode ? require("./currency-registry.js") : (global.VUFx && global.VUFx.Registry);

  var VERSION = "currency-preference-1.0.0";

  /* Bewusst produktneutral und versioniert. Der Suffix erlaubt einen
     spaeteren Formatwechsel, ohne die Einstellung der Bestandsnutzer
     falsch zu interpretieren. */
  var STORAGE_KEY = "vu-currency-preference-v1";

  function create(options) {
    options = options || {};
    var allowed = (options.allowed || Registry.DISPLAY_CURRENCIES).map(Registry.normalize).filter(Boolean);
    var fallback = Registry.normalize(options.defaultCurrency) || Registry.DEFAULT_DISPLAY_CURRENCY;
    if (allowed.indexOf(fallback) < 0) allowed = [fallback].concat(allowed);

    var store = options.storage;
    if (store === undefined) {
      try { store = global.localStorage; } catch (err) { store = null; }
    }

    var listeners = [];
    var current = read();

    function read() {
      if (!store) return { currency: fallback, source: "DEFAULT", note: "Kein Speicher verfuegbar." };
      var raw;
      try { raw = store.getItem(STORAGE_KEY); } catch (err) { raw = null; }
      if (!raw) return { currency: fallback, source: "DEFAULT", note: "Noch keine Auswahl getroffen." };
      var parsed;
      try { parsed = JSON.parse(raw); } catch (err) {
        return { currency: fallback, source: "DEFAULT", note: "Gespeicherte Einstellung war unlesbar und wurde uebergangen." };
      }
      var code = Registry.normalize(parsed && parsed.currency);
      if (!code || allowed.indexOf(code) < 0) {
        /* Eine gespeicherte Waehrung, die das Produkt nicht mehr
           anbietet, wird nicht stillschweigend weiterverwendet. Der
           Nutzer bekommt die Vorgabe und einen nachvollziehbaren Grund -
           eine Anzeige in einer Waehrung, fuer die keine Kurse mehr
           geholt werden, waere der schlechtere Ausgang. */
        return { currency: fallback, source: "DEFAULT",
                 note: "Gespeicherte Waehrung " + (code || "?") + " wird nicht mehr angeboten." };
      }
      return { currency: code, source: "USER", note: null, changedAt: parsed.changedAt || null };
    }

    function get() { return current.currency; }
    function state() {
      return {
        version: VERSION, currency: current.currency, source: current.source,
        note: current.note || null, changedAt: current.changedAt || null,
        allowed: allowed.slice(), defaultCurrency: fallback,
        persisted: !!store
      };
    }

    function set(code) {
      var next = Registry.normalize(code);
      if (!next || allowed.indexOf(next) < 0) {
        return { ok: false, currency: current.currency,
                 reason: "unsupportedCurrency",
                 detail: "Angeboten werden derzeit " + allowed.join(", ") + "." };
      }
      var previous = current.currency;
      current = { currency: next, source: "USER", note: null, changedAt: new Date().toISOString() };
      if (store) {
        try { store.setItem(STORAGE_KEY, JSON.stringify({ currency: next, changedAt: current.changedAt })); }
        catch (err) {
          current.note = "Die Auswahl gilt fuer diese Sitzung; sie konnte nicht gespeichert werden.";
        }
      } else {
        current.note = "Die Auswahl gilt fuer diese Sitzung; es ist kein Speicher verfuegbar.";
      }
      if (next !== previous) notify(previous, next);
      return { ok: true, currency: next, previous: previous, note: current.note || null };
    }

    /** Der Umschalter EUR | USD als ein Aufruf. */
    function toggle() {
      var i = allowed.indexOf(current.currency);
      return set(allowed[(i + 1) % allowed.length]);
    }

    function reset() {
      if (store) { try { store.removeItem(STORAGE_KEY); } catch (err) {} }
      var previous = current.currency;
      current = read();
      if (previous !== current.currency) notify(previous, current.currency);
      return state();
    }

    /* Damit ein Wechsel alle Oberflaechen derselben Seite erreicht und
       nicht nur die Komponente, die den Schalter traegt. */
    function subscribe(fn) {
      if (typeof fn !== "function") return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    function notify(previous, next) {
      listeners.slice().forEach(function (fn) {
        try { fn({ currency: next, previous: previous, source: current.source }); }
        catch (err) { /* Ein fehlerhafter Zuhoerer darf den Wechsel nicht verhindern. */ }
      });
    }

    return {
      VERSION: VERSION, STORAGE_KEY: STORAGE_KEY,
      get: get, set: set, toggle: toggle, reset: reset,
      state: state, subscribe: subscribe, allowed: allowed.slice(), defaultCurrency: fallback
    };
  }

  var api = { VERSION: VERSION, STORAGE_KEY: STORAGE_KEY, create: create };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Preference = api; }
})(typeof window !== "undefined" ? window : globalThis);
