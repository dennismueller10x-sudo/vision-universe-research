/* =========================================================================
   VISION UNIVERSE — fx/currency-registry.js   (Currency Layer V1, §7, §16, §44)

   WELCHE WAEHRUNG GILT HIER EIGENTLICH - UND WOHER WISSEN WIR DAS?

   Ein Unternehmen hat nicht "eine Waehrung". Es hat mindestens drei, und
   sie fallen regelmaessig auseinander:

     tradingCurrency     Waehrung des kanonischen Handelsplatzes.
     reportingCurrency   Waehrung des Abschlusses.
     nativeCurrency      Waehrung des einzelnen Wertes, den wir gerade
                         in der Hand halten.
     displayCurrency     Waehrung, in der der Nutzer ihn sehen moechte.

   NVIDIA: tradingCurrency USD, reportingCurrency USD, displayCurrency EUR.
   Ein europaeisches Unternehmen kann in EUR handeln und in USD berichten,
   oder umgekehrt. Beides kommt vor, und beides faellt niemandem auf, weil
   die Zahl in beiden Faellen gleich aussieht.

   DIE REGEL, DIE DIESE DATEI DURCHSETZT: NICHT RATEN.

   Aus "notiert an der NASDAQ" folgt nicht USD. Aus "reicht bei der SEC
   ein" folgt erst recht nicht USD (§16) - ein SEC-Filer darf in einer
   anderen Waehrung berichten, und mehrere tun es. Die Versuchung ist
   gross, weil die Ableitung in 95 Prozent der Faelle stimmt. Die
   restlichen 5 Prozent sind dann Umsaetze, die um 10 bis 20 Prozent
   danebenliegen, ohne dass irgendetwas nach einem Fehler aussieht.

   Deshalb kennt jede Antwort dieser Datei ihre Herkunft:

     SOURCE_FIELD   die Quelle hat die Waehrung mitgeliefert
     CONTRACT       ein kanonischer VU-Vertrag legt sie fest
     UNKNOWN        niemand hat es gesagt

   UNKNOWN ist ein gueltiges Ergebnis, kein Ausfall. Ein Wert ohne belegte
   Waehrung wird in seiner Originalform angezeigt und nicht umgerechnet.
   Das kostet eine EUR-Anzeige. Die Alternative kostet Vertrauen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "currency-registry-1.0.0";

  var PROVENANCE = {
    SOURCE_FIELD: "SOURCE_FIELD",
    CONTRACT:     "CONTRACT",
    UNKNOWN:      "UNKNOWN"
  };

  /* Waehrungen, die der Layer formatieren und runden kann. Die Liste
     begrenzt NICHT, was umgerechnet werden darf - die Engine ist
     waehrungsagnostisch. Sie sagt nur, wo wir die Darstellungsregeln
     kennen (Nachkommastellen, Symbol, Stellung). */
  var KNOWN = {
    EUR: { code: "EUR", symbol: "€",  decimals: 2, minorUnit: "Cent" },
    USD: { code: "USD", symbol: "$",  decimals: 2, minorUnit: "Cent" },
    CHF: { code: "CHF", symbol: "CHF", decimals: 2, minorUnit: "Rappen" },
    GBP: { code: "GBP", symbol: "£",  decimals: 2, minorUnit: "Penny" },
    JPY: { code: "JPY", symbol: "¥",  decimals: 0, minorUnit: null },
    CAD: { code: "CAD", symbol: "CA$", decimals: 2, minorUnit: "Cent" },
    SEK: { code: "SEK", symbol: "kr", decimals: 2, minorUnit: "Öre" },
    DKK: { code: "DKK", symbol: "kr", decimals: 2, minorUnit: "Øre" },
    NOK: { code: "NOK", symbol: "kr", decimals: 2, minorUnit: "Øre" }
  };

  /* Die heute produktiv umschaltbaren Anzeigewaehrungen. Bewusst eine
     eigene, kleine Liste neben KNOWN: was die Engine kann und was das
     Produkt anbietet, sind zwei Entscheidungen. CHF, GBP und JPY
     kommen hier hinein, wenn ihre FX-Paare belegt sind - nicht vorher
     und ohne neue Architektur. */
  var DISPLAY_CURRENCIES = ["EUR", "USD"];
  var DEFAULT_DISPLAY_CURRENCY = "EUR";

  function normalize(code) {
    if (typeof code !== "string") return null;
    var c = code.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c) ? c : null;
  }

  function isKnown(code) { return !!KNOWN[normalize(code)]; }
  function meta(code) { return KNOWN[normalize(code)] || null; }

  function resolved(currency, provenance, sourceField, note) {
    return {
      currency: currency || null,
      provenance: currency ? provenance : PROVENANCE.UNKNOWN,
      sourceField: currency ? (sourceField || null) : null,
      known: currency ? isKnown(currency) : false,
      note: note || null
    };
  }

  function unknown(note) {
    return resolved(null, PROVENANCE.UNKNOWN, null, note);
  }

  /**
   * Die Handelswaehrung eines Papiers.
   *
   * Liest ausschliesslich mitgelieferte Felder. Kommt keines vor, ist die
   * Antwort UNKNOWN - und ausdruecklich nicht "USD, weil das Universum
   * ueberwiegend amerikanisch ist". Genau diese Ableitung erzeugt den
   * Fehler, der erst beim ersten europaeischen Titel sichtbar wird, und
   * dann in jeder Zahl steckt, die seither gerechnet wurde.
   */
  function tradingCurrency(security) {
    if (!security || typeof security !== "object") return unknown("Kein Wertpapierdatensatz uebergeben.");
    var candidates = [
      ["tradingCurrency", security.tradingCurrency],
      ["priceCurrency",   security.priceCurrency],
      ["quoteCurrency",   security.quoteCurrency],
      ["currency",        security.currency]
    ];
    for (var i = 0; i < candidates.length; i++) {
      var code = normalize(candidates[i][1]);
      if (code) return resolved(code, PROVENANCE.SOURCE_FIELD, candidates[i][0]);
    }
    return unknown(
      "Der Datensatz " + (security.securityId || security.ticker || "?") +
      " fuehrt keine Handelswaehrung. Aus Boerse oder Land wird keine abgeleitet (§7).");
  }

  /**
   * Die Berichtswaehrung eines Abschlusses.
   *
   * Sie kommt aus den Facts selbst, nicht aus dem Wertpapier. Ein
   * Wertpapier, das in USD gehandelt wird, sagt nichts darueber, in
   * welcher Waehrung sein Emittent bilanziert.
   *
   * Bei uneinheitlichen Facts ist die Antwort MIXED und nicht "die
   * haeufigste". Ein Abschluss mit zwei Waehrungen ist ein Befund, den
   * jemand ansehen muss - kein Fall fuer eine Mehrheitsentscheidung.
   */
  function reportingCurrency(facts, opts) {
    opts = opts || {};
    if (!Array.isArray(facts) || !facts.length) {
      return unknown("Keine Fundamentaldaten uebergeben; SEC bedeutet nicht automatisch USD (§16).");
    }
    var seen = Object.create(null), n = 0;
    facts.forEach(function (fact) {
      if (!fact) return;
      /* Nur monetaere Facts zaehlen. Ein Fact mit unit "ratio" oder
         "count_m" traegt keine Waehrung - sein leeres Waehrungsfeld ist
         richtig und darf nicht als Luecke gewertet werden. */
      var unit = fact.unit || "";
      if (unit === "ratio" || unit === "count" || unit === "count_m" || unit === "shares" || unit === "pct") return;
      var code = normalize(fact.currency || fact.unitCurrency);
      if (!code) return;
      seen[code] = (seen[code] || 0) + 1; n++;
    });
    var codes = Object.keys(seen);
    if (!codes.length) {
      return unknown("Keiner der " + facts.length + " Facts fuehrt eine Waehrung. Ohne Beleg wird keine angenommen.");
    }
    if (codes.length === 1) {
      return resolved(codes[0], PROVENANCE.SOURCE_FIELD, "fact.currency",
        n + " monetaere Facts, alle in " + codes[0] + ".");
    }
    var out = unknown("Uneinheitliche Berichtswaehrungen: " +
      codes.sort().map(function (c) { return c + " (" + seen[c] + ")"; }).join(", ") +
      ". Es wird keine Mehrheitswaehrung gewaehlt; jeder Fact rechnet mit seiner eigenen.");
    out.mixed = true;
    out.distribution = seen;
    return out;
  }

  /**
   * Die Waehrung eines EINZELNEN Wertes - die einzige, die fuer eine
   * Umrechnung wirklich zaehlt.
   *
   * Reihenfolge mit Absicht: der Wert selbst schlaegt seinen Kontext.
   * Ein Fact mit currency "SEK" in einem ansonsten USD-Abschluss wird in
   * SEK umgerechnet und nicht in USD, nur weil die Berichtswaehrung so
   * heisst.
   */
  function nativeCurrency(value, context) {
    context = context || {};
    if (value && typeof value === "object") {
      var own = normalize(value.currency || value.nativeCurrency || value.unitCurrency);
      if (own) return resolved(own, PROVENANCE.SOURCE_FIELD, "value.currency");
    }
    var ctxOrder = [
      ["reportingCurrency", context.reportingCurrency],
      ["tradingCurrency",   context.tradingCurrency]
    ];
    for (var i = 0; i < ctxOrder.length; i++) {
      var code = normalize(ctxOrder[i][1] && ctxOrder[i][1].currency ? ctxOrder[i][1].currency : ctxOrder[i][1]);
      if (code) return resolved(code, PROVENANCE.CONTRACT, ctxOrder[i][0],
        "Der Wert selbst fuehrt keine Waehrung; es gilt die " + ctxOrder[i][0] + " des Kontexts.");
    }
    return unknown("Weder der Wert noch sein Kontext belegen eine Waehrung. Es wird nicht umgerechnet.");
  }

  /**
   * Das vollstaendige Waehrungsprofil eines Titels - ein Objekt, das ein
   * Produkt einmal holt und dann fuer alle Werte dieses Titels benutzt.
   */
  function profile(security, facts, opts) {
    opts = opts || {};
    var trading = tradingCurrency(security);
    var reporting = reportingCurrency(facts, opts);
    var display = normalize(opts.displayCurrency) || DEFAULT_DISPLAY_CURRENCY;

    return {
      version: VERSION,
      securityId: (security && (security.securityId || security.ticker)) || null,
      tradingCurrency: trading,
      reportingCurrency: reporting,
      displayCurrency: resolved(display, PROVENANCE.CONTRACT, "userPreference"),
      /* Der interessante Fall fuer die Bewertung: handelt und berichtet
         das Unternehmen in verschiedenen Waehrungen, muss jede
         Bewertungskennzahl ihre Bestandteile vor der Division auf eine
         Waehrung bringen (§26, §35). */
      tradingEqualsReporting: !!(trading.currency && reporting.currency && trading.currency === reporting.currency),
      requiresConversionForDisplay: !!(
        (trading.currency && trading.currency !== display) ||
        (reporting.currency && reporting.currency !== display)
      ),
      unresolved: [
        trading.currency ? null : "tradingCurrency",
        reporting.currency ? null : "reportingCurrency"
      ].filter(Boolean)
    };
  }

  var api = {
    VERSION: VERSION,
    PROVENANCE: PROVENANCE,
    KNOWN: KNOWN,
    DISPLAY_CURRENCIES: DISPLAY_CURRENCIES,
    DEFAULT_DISPLAY_CURRENCY: DEFAULT_DISPLAY_CURRENCY,
    normalize: normalize, isKnown: isKnown, meta: meta,
    tradingCurrency: tradingCurrency,
    reportingCurrency: reportingCurrency,
    nativeCurrency: nativeCurrency,
    profile: profile
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Registry = api; }
})(typeof window !== "undefined" ? window : globalThis);
