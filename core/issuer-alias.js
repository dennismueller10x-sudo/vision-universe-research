/* =========================================================================
   VISION UNIVERSE CORE — issuer-alias.js

   HOLDING-UMGRUENDUNGEN: DIE ALTE issuerId BLEIBT AUFLOESBAR.

   Nach einer Umgruendung (Nachfolge-Emittent nach Rule 12g-3, Meldung 8-K12B)
   fuehrt die SEC die neue Gesellschaft unter einer neuen CIK. Der Company
   Master fuehrt den Emittenten dann unter der CIK der Nachfolgerin; die alte
   issuerId (iss_cik_<alte CIK>) bleibt als Vorgaenger aufloesbar.

   Quelle ist ausschliesslich das Register quant/config/sec-successor-issuers.json.
   Die Kennungen selbst bleiben in core/identity.js (isIssuerId); diese Datei
   fuegt nichts zur Identitaetsregel hinzu und steht bewusst daneben: Supertrader
   pinnt den Hash von core/identity.js in seinen Registrierungen.

   UMD: Browser (globalThis.VUCore.IssuerAlias), Node (require), Worker.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.IssuerAlias = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "core-issuer-alias-1.0.0";

  function isIssuerId(id) { return typeof id === "string" && /^iss_cik_\d{10}$/.test(id); }

  /** Alias-Karte {Vorgaenger-issuerId: Nachfolger-issuerId} aus dem Successor-Register.
   *  Fail closed bei Formfehlern, Ketten und Zyklen: ein Vorgaenger darf nicht selbst
   *  Nachfolger sein, und eine CIK hat hoechstens einen Nachfolger. */
  function issuerAliases(doc) {
    var out = {};
    var successors = (doc && doc.successors) || {};
    var heads = {};
    Object.keys(successors).forEach(function (succCik) {
      var succ = "iss_cik_" + succCik;
      if (!isIssuerId(succ)) throw new Error("Successor-Register: ungueltige CIK " + succCik);
      heads[succ] = true;
      (successors[succCik].predecessors || []).forEach(function (predCik) {
        var pred = "iss_cik_" + predCik;
        if (!isIssuerId(pred) || pred === succ) throw new Error("Successor-Register: ungueltiger Vorgaenger " + predCik);
        if (out[pred] && out[pred] !== succ) throw new Error("Successor-Register: zwei Nachfolger fuer " + pred);
        out[pred] = succ;
      });
    });
    Object.keys(out).forEach(function (pred) {
      if (heads[pred]) throw new Error("Successor-Register: Kette oder Zyklus bei " + pred);
    });
    return out;
  }

  /** Die gueltige issuerId: ein Vorgaenger loest auf seine Nachfolgerin auf, jede andere ID bleibt. */
  function resolveIssuerId(id, aliases) {
    return (aliases && Object.prototype.hasOwnProperty.call(aliases, id)) ? aliases[id] : id;
  }

  /** Sortierte Vorgaenger-issuerIds einer Nachfolgerin. */
  function predecessorIssuerIds(id, aliases) {
    return Object.keys(aliases || {}).filter(function (p) { return aliases[p] === id; }).sort();
  }

  return {
    VERSION: VERSION,
    issuerAliases: issuerAliases,
    resolveIssuerId: resolveIssuerId,
    predecessorIssuerIds: predecessorIssuerIds
  };
});
