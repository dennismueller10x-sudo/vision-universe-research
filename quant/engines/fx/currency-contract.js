/* =========================================================================
   VISION UNIVERSE — fx/currency-contract.js   (Currency Layer V1, §18, §46, §47)

   DER EINE VERTRAG, DEN ALLE PRODUKTE KONSUMIEREN.

   Discover 1.0, Discover 2.1, Stock Detail, Fundamental Journey, Screener,
   Quant-Consumer-Flaechen, Reports und spaetere Produkte lesen dieselbe
   Fassade. Nicht, weil Einheitlichkeit huebsch ist, sondern weil der
   Alternativzustand bekannt ist: fuenf Produkte, fuenf Umrechnungen, fuenf
   Staende - und ein Nutzer, der auf zwei Seiten zwei Marktkapitalisierungen
   desselben Unternehmens sieht.

   ONE DATA CORE - MANY EXPERIENCES. Die Experience unterscheidet sich.
   Die Source of Truth nicht.

   WAS DIESE DATEI IST

   Eine Fassade, keine zweite Engine. Sie rechnet nichts selbst; sie
   bringt Store, Engine, Registry, Freshness, Klassifikation, Praeferenz
   und Formatierung zu einem Aufruf zusammen, damit ein Produkt sieben
   Module nicht einzeln verdrahten muss - und damit es gar nicht erst in
   die Lage kommt, eines davon zu ersetzen.

   WAS SIE NICHT IST

   Ein Ort fuer Produktlogik. Wie eine Zahl aussieht, entscheidet das
   Produkt. Was sie bedeutet, entscheidet der Core.

   DIE FORM, DIE HERAUSKOMMT

     { native:  { value, currency },
       display: { value, currency },
       fx:      { rate, source, asOf, method, ... },
       freshness: { state, ... },
       formatted: "154,73 €" }

   Fuer Reihen zusaetzlich nativeSeries, displaySeries, fxMethod und die
   neu berechnete Performance. native und display werden nie vermischt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Engine     = isNode ? require("./currency-engine.js")     : (global.VUFx && global.VUFx.Engine);
  var Registry   = isNode ? require("./currency-registry.js")   : (global.VUFx && global.VUFx.Registry);
  var Classifier = isNode ? require("./currency-class.js")      : (global.VUFx && global.VUFx.Class);
  var Format     = isNode ? require("./money-format.js")        : (global.VUFx && global.VUFx.Format);
  var Preference = isNode ? require("./currency-preference.js") : (global.VUFx && global.VUFx.Preference);

  var VERSION = "currency-contract-1.0.0";
  var CONTRACT_VERSION = "currency-fx-v1.0.0";

  function createLayer(options) {
    options = options || {};
    var engine = options.engine || Engine.createEngine({ store: options.store, now: options.now });
    var preference = options.preference || Preference.create({
      storage: options.storage,
      defaultCurrency: options.defaultCurrency,
      allowed: options.allowed
    });

    function target(explicit) {
      return Registry.normalize(explicit) || preference.get();
    }

    /**
     * Ein einzelner Betrag, fertig fuer die Anzeige.
     *
     * `formatted` ist ein String und darf in keine Rechnung zurueck -
     * die Zahl dafuer steht in display.value, ungerundet (§22).
     */
    function money(value, nativeCurrency, when, context, opts) {
      opts = opts || {};
      var to = target(opts.displayCurrency);
      var m = engine.convertMoney(value, nativeCurrency, to, when, context || "CURRENT_VALUE", opts);
      return decorate(m, opts);
    }

    /** Der aktuelle Kurs - der haeufigste Aufruf des ganzen Layers. */
    function price(value, nativeCurrency, opts) {
      opts = opts || {};
      var m = money(value, nativeCurrency, null, "CURRENT_VALUE", opts);
      /* §36: die EUR-Anzeige eines US-Kurses ist der umgerechnete
         US-Marktkurs - nicht der Kurs einer deutschen Boerse. Die
         Semantik reist mit dem Wert, damit sie auf der
         Daten-und-Quellen-Seite nicht vergessen werden kann. */
      if (m.available && m.native.currency !== m.display.currency) {
        m.semantics = {
          kind: "CONVERTED_HOME_MARKET_QUOTE",
          de: "Umgerechneter Kurs des Heimatmarktes in " + m.display.currency +
              ". Dies ist kein an einer " + m.display.currency + "-Boerse gehandelter Kurs.",
          tradingVenueClaim: false
        };
      }
      return m;
    }

    /** Eine historische Reihe samt neu berechneter Performance (§40, §41). */
    function series(points, nativeCurrency, opts) {
      opts = opts || {};
      var to = target(opts.displayCurrency);
      var converted = engine.convertSeries(points, nativeCurrency, to, opts);
      var perf = engine.priceReturn(converted, opts);

      return {
        contractVersion: CONTRACT_VERSION,
        available: converted.available,
        nativeCurrency: converted.nativeCurrency,
        displayCurrency: converted.displayCurrency,
        dates: converted.dates,
        nativeSeries: converted.nativeSeries,
        displaySeries: converted.displaySeries,
        points: converted.points,
        fxMethod: converted.fxMethod,
        adjustmentStatus: converted.adjustmentStatus,
        transformationOrder: converted.transformationOrder,
        coverage: converted.coverage !== undefined ? converted.coverage : null,
        gaps: converted.gaps,
        freshness: converted.freshness,
        /* Die Performance gehoert in denselben Vertrag wie die Reihe.
           Getrennt geliefert waere sie eine Einladung, die EUR-Reihe mit
           der USD-Performance zu paaren (§41). */
        performance: perf,
        reason: converted.reason, detail: converted.detail
      };
    }

    /**
     * Eine Kennzahl - die Klasse entscheidet, ob und wie.
     *
     * Nicht umzurechnende Kennzahlen kommen unveraendert zurueck, nicht
     * als null: eine Marge darf im EUR-Modus nicht verschwinden.
     */
    function metric(fact, opts) {
      opts = opts || {};
      var to = target(opts.displayCurrency);
      var m = engine.convertMetric(fact, to, opts);
      if (m.converts === false) {
        var cls = Classifier.classify(fact && fact.metricId, { unit: fact && fact.unit });
        m.formatted = cls.currencyClass === "MULTIPLE"
          ? Format.formatMultiple(fact && fact.value, to, opts)
          : (cls.currencyClass === "RATIO_METRIC"
              ? Format.formatPercent(fact && fact.value, to, opts)
              : (typeof (fact && fact.value) === "number" ? String(fact.value) : "–"));
        return m;
      }
      return decorate(m, opts);
    }

    function decorate(m, opts) {
      var f = Format.formatMoney(m, opts);
      m.formatted = f.text;
      m.formattedIsFallback = f.isFallback;
      m.freshnessNote = f.freshnessNote;
      m.formattedTitle = f.title;
      return m;
    }

    /**
     * Der Zustand, den eine Oberflaeche fuer den Umschalter braucht.
     * Ein Produkt, das diesen Zustand liest, muss nichts ueber
     * localStorage, Vorgaben oder erlaubte Waehrungen wissen.
     */
    function state() {
      var p = preference.state();
      return {
        contractVersion: CONTRACT_VERSION,
        engineVersion: VERSION,
        displayCurrency: p.currency,
        source: p.source,
        allowed: p.allowed,
        defaultCurrency: p.defaultCurrency,
        persisted: p.persisted,
        note: p.note
      };
    }

    return {
      VERSION: VERSION, CONTRACT_VERSION: CONTRACT_VERSION,
      engine: engine, preference: preference,
      money: money, price: price, series: series, metric: metric,
      format: Format, registry: Registry, classify: Classifier.classify,
      state: state,
      setDisplayCurrency: function (code) { return preference.set(code); },
      toggleDisplayCurrency: function () { return preference.toggle(); },
      onDisplayCurrencyChange: function (fn) { return preference.subscribe(fn); }
    };
  }

  var api = { VERSION: VERSION, CONTRACT_VERSION: CONTRACT_VERSION, createLayer: createLayer };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Contract = api; }
})(typeof window !== "undefined" ? window : globalThis);
