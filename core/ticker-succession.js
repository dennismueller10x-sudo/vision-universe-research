/* =========================================================================
   VISION UNIVERSE CORE — ticker-succession.js

   TICKERWECHSEL: DIE ALTE securityId BLEIBT DIE ID DER HISTORIE.

   core/identity.js bindet die securityId an den Ticker (ref_<TICKER>, ADR-001).
   Wechselt ein Emittent das Kuerzel derselben Aktie (gleiche CIK, gleiche
   Gattung), entsteht eine neue securityId; die alte bleibt die ID der Kurse bis
   zum Stichtag. Dieses Modul verbindet beide (ADR-009):
     - resolveSecurityId: alte ID -> neue ID (Weiterleitung, Universum)
     - joinBars: Vorgaenger-Bars vor dem Stichtag + Nachfolger-Bars ab dem Stichtag

   Quelle ist ausschliesslich das Register quant/config/ticker-successions.json.
   Regel: gleiche CIK in beiden Zeilen und ein zitierter Beleg (SEC-8-K, bei
   Auslandsemittenten SEC-6-K, oder Boersenmeldung) - ohne beides kein Eintrag. Die Datei steht bewusst neben
   identity.js und fuegt der Identitaetsregel nichts hinzu: Supertrader pinnt den
   Hash von core/identity.js (wie bei core/issuer-alias.js).

   UMD: Browser (globalThis.VUCore.TickerSuccession), Node (require), Worker.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.TickerSuccession = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "core-ticker-succession-1.0.0";
  var SOURCE_TYPES = { SEC_8K: true, SEC_6K: true, EXCHANGE_NOTICE: true };

  function isSecurityId(id) { return typeof id === "string" && /^ref_[A-Z0-9_]{1,24}$/.test(id); }
  function isDate(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d); }
  function fail(msg) { throw new Error("Tickernachfolge-Register: " + msg); }

  /** Karte {alte securityId: Eintrag} aus dem Register. Fail closed bei Formfehlern,
   *  fehlendem Beleg, Ketten und Zyklen: eine alte ID hat hoechstens eine Nachfolgerin,
   *  eine neue ID hoechstens einen Vorgaenger, und keine Nachfolgerin ist selbst Vorgaenger. */
  function tickerSuccessions(doc) {
    var out = {}, heads = {};
    ((doc && doc.successions) || []).forEach(function (e) {
      if (!e || !isSecurityId(e.from) || !isSecurityId(e.to) || e.from === e.to) fail("ungueltiges Paar " + JSON.stringify(e && [e.from, e.to]));
      if (!isDate(e.effective)) fail("Stichtag fehlt bei " + e.from);
      if (typeof e.cik !== "string" || !/^\d{10}$/.test(e.cik)) fail("CIK fehlt bei " + e.from);
      var s = e.source || {};
      if (!SOURCE_TYPES[s.type]) fail("Belegart fehlt bei " + e.from);
      if ((s.type === "SEC_8K" || s.type === "SEC_6K") && !/^\d{10}-\d{2}-\d{6}$/.test(s.accession || "")) fail((s.type === "SEC_6K" ? "6-K" : "8-K") + " ohne Accession bei " + e.from);
      if (!isDate(s.filed) || s.filed > e.effective) fail("Beleg muss vor dem Stichtag eingereicht sein: " + e.from);
      if (out[e.from]) fail("zwei Nachfolger fuer " + e.from);
      if (heads[e.to]) fail("zwei Vorgaenger fuer " + e.to);
      out[e.from] = e; heads[e.to] = true;
    });
    Object.keys(out).forEach(function (from) { if (heads[from]) fail("Kette oder Zyklus bei " + from); });
    return out;
  }

  /** Die gueltige securityId: eine alte ID loest auf ihre Nachfolgerin auf, jede andere bleibt. */
  function resolveSecurityId(id, map) {
    return (map && Object.prototype.hasOwnProperty.call(map, id)) ? map[id].to : id;
  }

  /** Eintrag, dessen Nachfolgerin id ist (oder null). */
  function predecessorOf(id, map) {
    var keys = Object.keys(map || {});
    for (var i = 0; i < keys.length; i++) if (map[keys[i]].to === id) return map[keys[i]];
    return null;
  }

  /** Verbindet zwei Bar-Reihen am Stichtag: Vorgaenger strikt davor, Nachfolger ab dem Stichtag.
   *  Bars brauchen ein Feld date (ISO, mindestens JJJJ-MM-TT). Ergebnis aufsteigend, ohne doppelte Tage. */
  function joinBars(predecessorBars, successorBars, effective) {
    if (!isDate(effective)) throw new Error("joinBars: Stichtag fehlt");
    var day = function (b) { return String(b && b.date).slice(0, 10); };
    var before = (predecessorBars || []).filter(function (b) { return day(b) < effective; });
    var after = (successorBars || []).filter(function (b) { return day(b) >= effective; });
    var bars = before.concat(after).sort(function (a, b) { return day(a) < day(b) ? -1 : day(a) > day(b) ? 1 : 0; });
    return { bars: bars, predecessorBars: before.length, successorBars: after.length,
             lastPredecessor: before.length ? day(before[before.length - 1]) : null,
             firstSuccessor: after.length ? day(after[0]) : null };
  }

  return {
    VERSION: VERSION,
    tickerSuccessions: tickerSuccessions,
    resolveSecurityId: resolveSecurityId,
    predecessorOf: predecessorOf,
    joinBars: joinBars
  };
});
