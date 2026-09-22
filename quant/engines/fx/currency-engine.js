/* =========================================================================
   VISION UNIVERSE — fx/currency-engine.js   (Currency Layer V1, §45, §46)

   DIE EINE STELLE, AN DER EIN BETRAG SEINE WAEHRUNG WECHSELT.

   Es gibt in diesem System genau eine Funktion, die einen Wechselkurs auf
   eine Zahl anwendet, und sie steht hier. Kein Produkt, keine Oberflaeche
   und kein Report rechnet selbst - der Regression Guard
   (scripts/quality/assert-no-local-fx.mjs) haelt das fest (§29, §49).

   DER VERTRAG

     convertMoney(value, fromCurrency, toCurrency, dateOrPeriod, context)

   und NICHT usdToEur(). Der Unterschied ist nicht Geschmack: eine
   usdToEur-Funktion ist ein Versprechen, das beim ersten Schweizer Titel
   gebrochen wird, und dann steht neben ihr eine usdToChf und eine
   chfToEur, und drei Monate spaeter rechnen drei Funktionen mit drei
   Staenden. EUR ist der erste produktive Fall, nicht die Architektur.

   DER KONTEXT BESTIMMT DEN KURS

   Derselbe Betrag, derselbe Tag, zwei Kontexte, zwei Kurse:

     BALANCE_SHEET     Kassenbestand zum 30.09. -> Kurs vom 30.09.
     INCOME_STATEMENT  Umsatz FY bis 30.09.     -> Mittel ueber die Periode

   Das ist kein Detail. Bei einem Jahr mit 12 Prozent Kursbewegung
   entscheidet diese Wahl ueber einen zweistelligen Prozentbetrag am
   Umsatz - und beide Ergebnisse sehen gleich plausibel aus.

   WAS ZURUECKKOMMT

   Immer dieselbe Form: native, display, fx. Der Originalwert ueberlebt
   jede Umrechnung (§3). `display` ist additiv; wer nur `native` liest,
   bekommt exakt das, was die Quelle geliefert hat - auf die Nachkommastelle.

   WAS NICHT ZURUECKKOMMT

   Ein gerundeter Wert. Rundung ist Formatierung (money-format.js) und
   veraendert niemals den gespeicherten Wert (§22, §52).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Rates      = isNode ? require("./fx-rates.js")          : (global.VUFx && global.VUFx.Rates);
  var Freshness  = isNode ? require("./fx-freshness.js")       : (global.VUFx && global.VUFx.Freshness);
  var Registry   = isNode ? require("./currency-registry.js")  : (global.VUFx && global.VUFx.Registry);
  var Classifier = isNode ? require("./currency-class.js")     : (global.VUFx && global.VUFx.Class);

  var VERSION = "currency-engine-1.0.0";
  var CONTRACT_VERSION = "currency-fx-v1.0.0";

  var CONTEXTS = {
    MARKET_PRICE:     { fxMethod: "DAILY_AT_DATE",       needs: "date"   },
    CURRENT_VALUE:    { fxMethod: "LATEST_AVAILABLE",    needs: "none"   },
    BALANCE_SHEET:    { fxMethod: "DAILY_AT_PERIOD_END", needs: "date"   },
    INCOME_STATEMENT: { fxMethod: "PERIOD_AVERAGE",      needs: "period" },
    CASH_FLOW:        { fxMethod: "PERIOD_AVERAGE",      needs: "period" },
    PER_SHARE:        { fxMethod: "CONTEXT_OF_NUMERATOR", needs: "either" }
  };

  /* --------------------------------------------------------------------
     Periodengrenzen (§14, §31)
     -------------------------------------------------------------------- */

  /**
   * Der Anfang einer Berichtsperiode aus den tatsaechlichen Perioden des
   * Unternehmens - nicht aus dem Kalender.
   *
   * Die kanonischen Fundamentalreihen fuehren `end` je Periode, aber
   * keinen Anfang. Der Anfang ist das Ende der vorhergehenden Periode
   * derselben Kadenz plus ein Tag. Das ist eine Ableitung AUS DEN DATEN
   * und damit belegt - im Unterschied zu "Geschaeftsjahr = Kalenderjahr",
   * was bei Apple (Ende September), AAR Corp (Ende Mai) und jedem zweiten
   * Einzelhaendler (Ende Januar) schlicht falsch ist.
   *
   * Gibt es keinen Vorgaenger, ist die Antwort UNKNOWN. Kein
   * "vermutlich zwoelf Monate zuvor": eine Periode, deren Laenge wir
   * raten, ergibt einen Durchschnittskurs, dessen Fenster wir raten.
   */
  function resolvePeriod(periodEnd, priorPeriodEnd, opts) {
    opts = opts || {};
    if (opts.periodStart) {
      return { periodStart: opts.periodStart, periodEnd: periodEnd,
               provenance: "SOURCE_FIELD", note: "Die Quelle liefert periodStart." };
    }
    if (!periodEnd) {
      return { periodStart: null, periodEnd: null, provenance: "UNKNOWN",
               note: "Ohne Periodenende laesst sich keine Periode bestimmen." };
    }
    if (!priorPeriodEnd) {
      return { periodStart: null, periodEnd: periodEnd, provenance: "UNKNOWN",
               note: "Keine vorhergehende Periode vorhanden; der Periodenanfang wird nicht geschaetzt (§54)." };
    }
    if (priorPeriodEnd >= periodEnd) {
      return { periodStart: null, periodEnd: periodEnd, provenance: "UNKNOWN",
               note: "Die vorhergehende Periode endet nicht vor dieser (" + priorPeriodEnd + " >= " + periodEnd + ")." };
    }
    var start = new Date(Date.parse(priorPeriodEnd + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
    return {
      periodStart: start, periodEnd: periodEnd,
      provenance: "DERIVED_FROM_PRIOR_PERIOD",
      note: "Anfang abgeleitet aus dem Ende der vorhergehenden Periode (" + priorPeriodEnd + ") + 1 Tag."
    };
  }

  /**
   * Die Periodenkette einer ganzen Reihe auf einmal. Erwartet die Reihe
   * aufsteigend nach `end` und liefert je Eintrag periodStart/periodEnd.
   */
  function resolvePeriodChain(rows, opts) {
    opts = opts || {};
    var sorted = (rows || []).slice().sort(function (a, b) {
      return String(a.end || a.periodEnd || "").localeCompare(String(b.end || b.periodEnd || ""));
    });
    var prior = null;
    return sorted.map(function (row) {
      var end = row.end || row.periodEnd || null;
      var period = resolvePeriod(end, prior, { periodStart: row.periodStart || row.period_start || null });
      prior = end;
      return { row: row, periodStart: period.periodStart, periodEnd: period.periodEnd,
               provenance: period.provenance, note: period.note };
    });
  }

  /* --------------------------------------------------------------------
     Die Engine
     -------------------------------------------------------------------- */

  function createEngine(options) {
    options = options || {};
    var store = options.store;
    if (!store) throw new Error("currency-engine: ohne FX-Store kann nicht umgerechnet werden.");
    var nowProvider = typeof options.now === "function" ? options.now
                    : function () { return options.now !== undefined ? options.now : Date.now(); };

    function fxQuote(from, to, when, context, opts) {
      var spec = CONTEXTS[context];
      if (!spec) {
        return { available: false, reason: "unknownContext",
                 detail: "Kontext '" + context + "' ist nicht definiert. Bekannt: " + Object.keys(CONTEXTS).join(", ") + "." };
      }
      if (spec.fxMethod === "PERIOD_AVERAGE") {
        if (!when || !when.periodStart || !when.periodEnd) {
          return { available: false, reason: "periodRequired",
                   detail: "Kontext " + context + " verlangt periodStart und periodEnd aus dem kanonischen Fact. " +
                           "Ein Kalenderjahr wird nicht ersatzweise angenommen (§14)." };
        }
        return store.periodAverage(from, to, when.periodStart, when.periodEnd, opts);
      }
      if (spec.fxMethod === "LATEST_AVAILABLE") return store.latest(from, to);
      /* DAILY_AT_DATE und DAILY_AT_PERIOD_END sind dieselbe Abfrage mit
         verschiedenen Namen - der Name sagt, welcher Tag gemeint ist, die
         Abfrage tut in beiden Faellen dasselbe und faellt bei fehlendem
         Fixing auf PREVIOUS_AVAILABLE zurueck. */
      var date = typeof when === "string" ? when : (when && (when.date || when.periodEnd)) || null;
      if (!date) {
        return { available: false, reason: "dateRequired",
                 detail: "Kontext " + context + " verlangt einen Stichtag." };
      }
      return store.rateAt(from, to, date, opts);
    }

    /**
     * Der Kern. Gibt IMMER ein Money-Objekt zurueck - auch im Misserfolg,
     * dann mit display: null und einem Grund. Ein Aufrufer, der nur
     * `display.value` liest und dabei null bekommt, zeigt nichts an; ein
     * Aufrufer, der eine Exception bekommt, zeigt eine kaputte Seite.
     */
    function convertMoney(value, fromCurrency, toCurrency, when, context, opts) {
      opts = opts || {};
      var from = Registry.normalize(fromCurrency);
      var to   = Registry.normalize(toCurrency);
      var ctx  = context || "CURRENT_VALUE";

      var money = {
        contractVersion: CONTRACT_VERSION,
        engineVersion: VERSION,
        native:  { value: (typeof value === "number" && isFinite(value)) ? value : null, currency: from },
        display: { value: null, currency: to },
        fx: null,
        freshness: null,
        context: ctx,
        unit: opts.unit || null,
        available: false,
        reason: null,
        detail: null
      };

      if (money.native.value === null) {
        money.reason = "noNativeValue";
        money.detail = "Es liegt kein endlicher Zahlenwert vor. Ein fehlender Wert bleibt fehlend (§54).";
        return money;
      }
      if (!from) {
        money.reason = "unknownSourceCurrency";
        money.detail = "Die Originalwaehrung ist nicht belegt. Ohne sie wird nicht umgerechnet (§16).";
        return money;
      }
      if (!to) {
        money.reason = "unknownTargetCurrency";
        money.detail = "Die Zielwaehrung ist ungueltig.";
        return money;
      }

      var quote = fxQuote(from, to, when, ctx, opts);
      var fresh = Freshness.assess(quote, {
        now: opts.now !== undefined ? opts.now : nowProvider(),
        frequency: opts.frequency,
        staleAfterSeconds: opts.staleAfterSeconds
      });
      money.freshness = fresh;

      if (!quote || quote.available !== true) {
        money.reason = (quote && quote.reason) || "fxUnavailable";
        money.detail = (quote && quote.detail) ||
          "Kein verwendbarer Wechselkurs. Angezeigt wird der Originalwert in " + from + " - nicht derselbe Wert mit einem " + to + "-Zeichen (§23).";
        /* Der ehrliche Rueckfall: das Produkt bekommt eine gueltige
           Anzeige, aber in der Originalwaehrung. */
        money.fallback = { value: money.native.value, currency: from, mode: "NATIVE_CURRENCY" };
        return money;
      }

      money.fx = {
        rate: quote.rate,
        base: quote.base, quote: quote.quote,
        asOf: quote.asOf,
        source: quote.source,
        method: quote.method,
        derivation: quote.derivation,
        frequency: quote.frequency,
        periodStart: quote.periodStart || null,
        periodEnd: quote.periodEnd || null,
        observations: quote.observations !== undefined ? quote.observations : null,
        coverage: quote.coverage !== undefined ? quote.coverage : null,
        fallbackReason: quote.fallbackReason || null
      };
      money.display.value = money.native.value * quote.rate;
      money.available = true;
      return money;
    }

    /**
     * Eine ganze Kursreihe (§9, §40).
     *
     * Jeder Punkt bekommt den FX-Stand SEINES Tages. Die Reihe mit dem
     * heutigen Kurs zurueckzurechnen waere schneller, einfacher und
     * falsch: sie ergaebe eine EUR-Rendite, die mathematisch gleich der
     * USD-Rendite ist - und damit die Waehrungswirkung verschwinden
     * liesse, die sie eigentlich zeigen soll.
     *
     * Reihenfolge (§55): die Reihe kommt bereits adjustiert herein
     * (Splits, Dividenden), die Umrechnung ist der LETZTE Schritt. Ein
     * zweiter Adjustment-Pfad nach der Umrechnung existiert nicht.
     */
    function convertSeries(series, fromCurrency, toCurrency, opts) {
      opts = opts || {};
      var from = Registry.normalize(fromCurrency);
      var to   = Registry.normalize(toCurrency);

      var out = {
        contractVersion: CONTRACT_VERSION,
        engineVersion: VERSION,
        nativeCurrency: from, displayCurrency: to,
        fxMethod: "DAILY_AT_DATE",
        adjustmentStatus: opts.adjustmentStatus || null,
        transformationOrder: ["canonical_adjusted_native", "currency_conversion"],
        points: [], nativeSeries: [], displaySeries: [], dates: [],
        observations: 0, converted: 0, gaps: [],
        available: false, reason: null, detail: null, freshness: null
      };

      if (!from || !to) {
        out.reason = !from ? "unknownSourceCurrency" : "unknownTargetCurrency";
        out.detail = "Ohne belegte Waehrungen wird keine Reihe umgerechnet.";
        return out;
      }

      var rows = (series || []).map(function (p) {
        if (Array.isArray(p)) return { date: p[0], value: p[1] };
        return { date: p.date || p.d || p.t, value: (p.value !== undefined ? p.value : (p.close !== undefined ? p.close : p.v)) };
      }).filter(function (p) { return typeof p.date === "string" && typeof p.value === "number" && isFinite(p.value); });

      out.observations = rows.length;
      if (!rows.length) {
        out.reason = "emptySeries";
        out.detail = "Die uebergebene Reihe enthaelt keinen verwertbaren Punkt.";
        return out;
      }

      /* Der Fast Path fuer die Reihe (§17). Eine EUR-Reihe in EUR
         anzuzeigen darf keine einzige FX-Abfrage kosten und keine
         Rundungsdrift erzeugen - die Werte gehen unveraendert durch. */
      if (from === to) {
        rows.forEach(function (p) {
          out.dates.push(p.date);
          out.nativeSeries.push(p.value);
          out.displaySeries.push(p.value);
          out.points.push({ date: p.date, native: p.value, display: p.value, rate: 1, fxAsOf: null, fxMethod: "IDENTITY" });
        });
        out.fxMethod = "IDENTITY";
        out.converted = rows.length;
        out.available = true;
        out.freshness = Freshness.assess({ available: true, method: "IDENTITY", asOf: null }, { now: opts.now });
        return out;
      }

      var worstAssessments = [];
      rows.forEach(function (p) {
        var q = store.rateAt(from, to, p.date, opts);
        if (!q.available) {
          out.gaps.push({ date: p.date, reason: q.reason, detail: q.detail });
          return;
        }
        out.dates.push(p.date);
        out.nativeSeries.push(p.value);
        out.displaySeries.push(p.value * q.rate);
        out.points.push({ date: p.date, native: p.value, display: p.value * q.rate,
                          rate: q.rate, fxAsOf: q.asOf, fxMethod: q.method, fxDerivation: q.derivation });
        out.converted++;
      });

      out.freshness = out.points.length
        ? Freshness.assess({ available: true, method: out.points[out.points.length - 1].fxMethod,
                             asOf: out.points[out.points.length - 1].fxAsOf,
                             requestedDate: out.dates[out.dates.length - 1], frequency: "DAILY" },
                           { now: opts.now !== undefined ? opts.now : nowProvider() })
        : Freshness.assess(null, {});

      if (!out.converted) {
        out.reason = "noPointConvertible";
        out.detail = "Fuer keinen Tag der Reihe liegt ein Wechselkurs vor. Die Reihe bleibt in " + from + ".";
        return out;
      }

      /* Eine Reihe mit Loechern ist keine Reihe, aus der man eine Rendite
         rechnen darf. Sie wird geliefert, aber die Luecken stehen
         daneben, und coverage sagt, wie vollstaendig sie ist. */
      out.coverage = out.converted / out.observations;
      out.available = true;
      return out;
    }

    /**
     * §10/§41: Kursrendite in der Anzeigewaehrung - NEU BERECHNET, nicht
     * umgerechnet. Der Aufrufer bekommt beide Renditen und die Differenz,
     * damit gar nicht erst die Versuchung entsteht, eine USD-Rendite
     * neben einen EUR-Chart zu stellen.
     */
    function priceReturn(converted, opts) {
      opts = opts || {};
      var out = {
        contractVersion: CONTRACT_VERSION,
        nativeCurrency: converted && converted.nativeCurrency || null,
        displayCurrency: converted && converted.displayCurrency || null,
        nativeReturnPct: null, displayReturnPct: null, currencyEffectPp: null,
        from: null, to: null, observations: 0,
        method: "RECOMPUTED_FROM_DISPLAY_SERIES",
        available: false, reason: null, detail: null
      };
      if (!converted || !converted.available || converted.displaySeries.length < 2) {
        out.reason = "insufficientSeries";
        out.detail = "Eine Rendite braucht mindestens zwei Punkte derselben Reihe.";
        return out;
      }
      var n = converted.displaySeries.length;
      var nFirst = converted.nativeSeries[0], nLast = converted.nativeSeries[n - 1];
      var dFirst = converted.displaySeries[0], dLast = converted.displaySeries[n - 1];
      if (!(nFirst > 0) || !(dFirst > 0)) {
        out.reason = "nonPositiveBase";
        out.detail = "Der Startwert ist nicht positiv; eine prozentuale Veraenderung ist nicht definiert.";
        return out;
      }
      out.observations = n;
      out.from = converted.dates[0];
      out.to = converted.dates[n - 1];
      out.nativeReturnPct  = (nLast / nFirst - 1) * 100;
      out.displayReturnPct = (dLast / dFirst - 1) * 100;
      /* §42 Waehrungseffekt: die Differenz in Prozentpunkten. Der Vertrag
         traegt sie ab V1, auch wenn die Oberflaeche sie noch nicht zeigt -
         damit sie spaeter ohne Umbau des Data Core sichtbar wird. */
      out.currencyEffectPp = out.displayReturnPct - out.nativeReturnPct;
      out.available = true;
      return out;
    }

    /**
     * Der Weg, den Produkte tatsaechlich gehen: eine Kennzahl hinein, die
     * richtige FX-Regel wird aus ihrer Klasse abgeleitet.
     *
     * Kennzahlen, die nicht umgerechnet werden, kommen unveraendert und
     * ausdruecklich als solche markiert zurueck. Das ist wichtiger, als
     * es klingt: ein Produkt, das fuer eine Marge `null` bekaeme, wuerde
     * die Marge im EUR-Modus ausblenden.
     */
    function convertMetric(fact, toCurrency, opts) {
      opts = opts || {};
      var cls = Classifier.classify(fact && fact.metricId, { unit: fact && fact.unit, classOverride: opts.classOverride });

      if (!cls.converts) {
        return {
          contractVersion: CONTRACT_VERSION,
          metricId: fact && fact.metricId || null,
          currencyClass: cls.currencyClass,
          converts: false,
          recomputeFromDisplaySeries: cls.recomputeFromDisplaySeries,
          native: { value: fact ? fact.value : null, currency: Registry.normalize(fact && fact.currency) },
          display: { value: fact ? fact.value : null, currency: null },
          fx: null, freshness: null,
          unit: fact && fact.unit || null,
          available: true,
          reason: cls.recomputeFromDisplaySeries ? "recomputeRequired" : "currencyInvariant",
          detail: cls.recomputeFromDisplaySeries
            ? "Kursrenditen werden aus der Reihe der Anzeigewaehrung neu berechnet, nicht umgerechnet (§10)."
            : (cls.note || "Diese Kennzahl ist dimensionslos und vom Waehrungswechsel unberuehrt (§33).")
        };
      }

      var context = opts.context || cls.conversionContext;
      /* PER_SHARE erbt die Regel seines Zaehlers (§34). Ohne Angabe gilt
         die Periodenregel - EPS und FCF je Aktie entstehen ueber eine
         Periode. Ein Buchwert je Aktie muss seinen Kontext mitgeben. */
      if (context === "PER_SHARE") {
        context = opts.numeratorContext || (fact && fact.numeratorContext) || "INCOME_STATEMENT";
      }

      var when;
      if (context === "INCOME_STATEMENT" || context === "CASH_FLOW") {
        when = { periodStart: fact && (fact.periodStart || fact.period_start) || null,
                 periodEnd:   fact && (fact.periodEnd || fact.period_end || fact.end) || null };
      } else if (context === "CURRENT_VALUE") {
        when = null;
      } else {
        when = (fact && (fact.periodEnd || fact.period_end || fact.end || fact.date || fact.asOf)) || null;
      }

      var money = convertMoney(fact && fact.value, fact && fact.currency, toCurrency, when, context,
        { unit: fact && fact.unit, now: opts.now, frequency: opts.frequency, minCoverage: opts.minCoverage });
      money.metricId = fact && fact.metricId || null;
      money.currencyClass = cls.currencyClass;
      money.converts = true;
      money.recomputeFromDisplaySeries = false;
      return money;
    }

    return {
      VERSION: VERSION, CONTRACT_VERSION: CONTRACT_VERSION, CONTEXTS: CONTEXTS,
      store: store,
      convertMoney: convertMoney,
      convertSeries: convertSeries,
      convertMetric: convertMetric,
      priceReturn: priceReturn
    };
  }

  var api = {
    VERSION: VERSION, CONTRACT_VERSION: CONTRACT_VERSION, CONTEXTS: CONTEXTS,
    createEngine: createEngine,
    resolvePeriod: resolvePeriod,
    resolvePeriodChain: resolvePeriodChain
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Engine = api; }
})(typeof window !== "undefined" ? window : globalThis);
