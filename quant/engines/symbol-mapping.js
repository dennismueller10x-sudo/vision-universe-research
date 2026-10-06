/* =========================================================================
   VISION UNIVERSE QUANT — symbol-mapping.js
   SECURITY <-> PROVIDER SYMBOL MAPPING (Phase 2, §8)

   Ein Ticker allein ist nicht eindeutig.

   "BMW" ist an der XETRA ein Automobilhersteller und anderswo etwas voellig
   anderes. "SAN" bezeichnet je nach Boerse Sanofi oder Banco Santander.
   Provider schreiben dasselbe Papier ausserdem unterschiedlich: "BMW.DE",
   "BMW:GR", "BMW.XETRA".

   Wer nur auf den Ticker abbildet, holt sich frueher oder spaeter die
   Kurshistorie eines fremden Unternehmens in seinen Backtest — und merkt es
   nicht, weil die Zahlen plausibel aussehen.

   Deshalb ist der Mapping-Schluessel hier immer die VU-securityId, und ein
   Eintrag traegt Boerse, MIC, Waehrung, Land und optional ISIN. Eine
   Aufloesung ohne diese Angaben ist mehrdeutig und wird als solche gemeldet.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSchema;

  /**
   * Ein Mapping-Eintrag.
   *   securityId      kanonische VU-Kennung
   *   providerId      z. B. "twelve-data"
   *   providerSymbol  exakt so, wie der Provider es erwartet
   *   exchange / mic / currency / country  Disambiguierung
   *   isin            optional, stabiler als jeder Ticker
   *   confidence      "verified" | "inferred" | "unverified"
   *
   * Nur "verified" gilt als geprueft, und geprueft heisst: jemand hat das
   * Symbol beim Anbieter abgefragt und Name, Boerse und Waehrung mit dem
   * Security Master verglichen. Alles andere ist eine Annahme. Der Default
   * ist deshalb "unverified" und nicht etwa "inferred" — wer nichts angibt,
   * hat nichts geprueft.
   */
  function createEntry(fields) {
    if (!fields.securityId) throw new Error("symbol mapping requires securityId");
    if (!fields.providerId) throw new Error("symbol mapping requires providerId");
    if (!fields.providerSymbol) throw new Error("symbol mapping requires providerSymbol");
    return {
      securityId: fields.securityId,
      providerId: fields.providerId,
      providerSymbol: fields.providerSymbol,
      ticker: fields.ticker || null,
      exchange: fields.exchange || null,
      mic: fields.mic || null,
      currency: fields.currency || null,
      country: fields.country || null,
      isin: fields.isin || null,
      confidence: fields.confidence || "unverified",
      verifiedAt: fields.verifiedAt || null,
      note: fields.note || null
    };
  }

  function createRegistry(entries) {
    var byKey = Object.create(null);        // providerId|securityId
    var bySymbol = Object.create(null);     // providerId|providerSymbol -> [entry]
    var conflicts = [];

    function key(providerId, securityId) { return providerId + "|" + securityId; }
    function symbolKey(providerId, symbol) { return providerId + "|" + String(symbol).toUpperCase(); }

    function add(entry) {
      var e = createEntry(entry);
      var k = key(e.providerId, e.securityId);
      if (byKey[k] && byKey[k].providerSymbol !== e.providerSymbol) {
        conflicts.push({
          type: "duplicate_security",
          securityId: e.securityId, providerId: e.providerId,
          symbols: [byKey[k].providerSymbol, e.providerSymbol]
        });
      }
      byKey[k] = e;
      var sk = symbolKey(e.providerId, e.providerSymbol);
      (bySymbol[sk] || (bySymbol[sk] = [])).push(e);
      return e;
    }

    (entries || []).forEach(add);

    return {
      add: add,

      /** VU-Security -> Providersymbol. Fehlt der Eintrag, wird das gemeldet. */
      toProvider: function (providerId, securityId) {
        var e = byKey[key(providerId, securityId)];
        if (!e) {
          return {
            resolved: false,
            reason: "Kein Symbol-Mapping fuer " + securityId + " bei Provider " + providerId + ". " +
                    "Ohne verifiziertes Mapping wird keine Anfrage gestellt — ein geratener Ticker koennte " +
                    "die Daten eines anderen Unternehmens liefern."
          };
        }
        return { resolved: true, entry: e, symbol: e.providerSymbol };
      },

      /** Providersymbol -> VU-Security. Mehrdeutigkeit wird nicht aufgeloest, sondern gemeldet. */
      toSecurity: function (providerId, providerSymbol, hints) {
        var candidates = bySymbol[symbolKey(providerId, providerSymbol)] || [];
        if (!candidates.length) return { resolved: false, reason: "Unbekanntes Providersymbol: " + providerSymbol };
        if (candidates.length === 1) return { resolved: true, entry: candidates[0], securityId: candidates[0].securityId };

        hints = hints || {};
        var narrowed = candidates.filter(function (c) {
          if (hints.mic && c.mic !== hints.mic) return false;
          if (hints.currency && c.currency !== hints.currency) return false;
          if (hints.country && c.country !== hints.country) return false;
          return true;
        });
        if (narrowed.length === 1) return { resolved: true, entry: narrowed[0], securityId: narrowed[0].securityId };
        return {
          resolved: false,
          reason: "Mehrdeutiges Symbol '" + providerSymbol + "' bei " + providerId + ": " +
                  candidates.length + " Kandidaten. Boerse, MIC oder Waehrung noetig.",
          candidates: candidates.map(function (c) { return c.securityId; })
        };
      },

      list: function (providerId) {
        return Object.keys(byKey).map(function (k) { return byKey[k]; })
          .filter(function (e) { return !providerId || e.providerId === providerId; });
      },
      conflicts: function () { return conflicts.slice(); },
      size: function () { return Object.keys(byKey).length; }
    };
  }

  /**
   * Pruefung eines Mappings gegen den Security Master. Findet die Fehler,
   * die spaeter am teuersten sind: falsche Waehrung, falsches Land, ein
   * Eintrag fuer eine Security, die es gar nicht gibt.
   */
  function validateAgainstSecurities(registry, securities) {
    var byId = Object.create(null);
    securities.forEach(function (s) { byId[s.securityId] = s; });
    var problems = [];

    registry.list().forEach(function (e) {
      var sec = byId[e.securityId];
      if (!sec) {
        problems.push({ severity: "error", securityId: e.securityId,
          message: "Mapping verweist auf eine unbekannte Security." });
        return;
      }
      if (e.currency && sec.currency && e.currency !== sec.currency) {
        problems.push({ severity: "error", securityId: e.securityId,
          message: "Waehrung im Mapping (" + e.currency + ") weicht vom Security Master (" + sec.currency + ") ab." });
      }
      if (e.mic && sec.mic && e.mic !== sec.mic) {
        problems.push({ severity: "error", securityId: e.securityId,
          message: "Handelsplatz im Mapping (" + e.mic + ") weicht vom Security Master (" + sec.mic + ") ab." });
      }
      if (e.country && sec.country && e.country !== sec.country) {
        problems.push({ severity: "error", securityId: e.securityId,
          message: "Land im Mapping (" + e.country + ") weicht vom Security Master (" + sec.country + ") ab." });
      }
      /* Alles ausser "verified" ist ungeprueft. Vorher stand hier nur
         `=== "unverified"`, womit ein abgeleitetes Mapping ("inferred")
         durchrutschte — also genau die Sorte Mapping, die das
         Referenzuniversum aus einer Konfigurationsdatei erzeugt. Eine
         Pruefung, die den haeufigsten Fall auslaesst, ist keine. */
      if (e.confidence !== "verified") {
        problems.push({ severity: "warning", securityId: e.securityId,
          message: "Mapping ist nicht verifiziert (confidence: " + e.confidence + "). " +
                   "Vor produktiver Nutzung gegen den Anbieter pruefen: liefert das Symbol " +
                   "wirklich dieses Unternehmen an dieser Boerse in dieser Waehrung?" });
      }
    });

    registry.conflicts().forEach(function (c) {
      problems.push({ severity: "error", securityId: c.securityId,
        message: "Widerspruechliche Symbole: " + c.symbols.join(" vs ") });
    });
    return problems;
  }

  var api = {
    createEntry: createEntry,
    createRegistry: createRegistry,
    validateAgainstSecurities: validateAgainstSecurities
  };

  if (isNode) module.exports = api;
  else global.VUSymbolMapping = api;
})(typeof window !== "undefined" ? window : globalThis);
