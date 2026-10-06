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
  var Providers  = isNode ? require("./fx-provider-registry.js") : (global.VUFx && global.VUFx.Providers);
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
        /* O-13: die Frage, die ein Produkt stellt, ist nicht "ist ein
           Fehler aufgetreten", sondern "kann ich diesen Wert in der
           Anzeigewaehrung zeigen". Sie hat drei Antworten, und `false`
           ist eine davon - kein Ausfall, sondern eine Eigenschaft dieses
           Wertes. Der Titel bleibt im Produkt, der Wert bleibt lesbar,
           nur die Umrechnung entfaellt. */
        conversionAvailable: false,
        conversionUnavailableReason: null,
        /* O-11: darf dieser konkrete Wert oeffentlich gezeigt werden?
           Haengt an der Quelle des Wechselkurses, nicht am Produkt -
           deshalb je Wert und nicht global. */
        publicDisplayAllowed: null,
        attribution: null,
        reason: null,
        detail: null
      };

      if (money.native.value === null) {
        money.reason = "noNativeValue";
        money.conversionUnavailableReason = "noNativeValue";
        money.detail = "Es liegt kein endlicher Zahlenwert vor. Ein fehlender Wert bleibt fehlend (§54).";
        return money;
      }
      if (!from) {
        money.reason = "unknownSourceCurrency";
        money.conversionUnavailableReason = "unknownNativeCurrency";
        money.detail = "Die Originalwaehrung ist nicht belegt. Ohne sie wird nicht umgerechnet (§16).";
        return money;
      }
      if (!to) {
        money.reason = "unknownTargetCurrency";
        money.conversionUnavailableReason = "unknownTargetCurrency";
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
        /* O-13: der maschinenlesbare Zustand, den ein Frontend abfragt.
           "conversionUnavailable" ist eine Aussage ueber die Daten, kein
           Fehlerzustand - die Aktie bleibt im Produkt. */
        money.conversionUnavailableReason = "conversionUnavailable";
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
      /* O-7: die Herkunft reist mit dem Wert. Ein EUR-Betrag, dessen
         Quelle, Stand, Methode und Frische man nicht ablesen kann, ist
         eine Behauptung - und bei zwei Quellen ist zusaetzlich die Frage
         berechtigt, WELCHE ihn geliefert hat. */
      money.fxProvenance = quote.provenance || {
        source: quote.source || null, role: null, priority: null,
        derivation: quote.derivation || null, consideredSources: []
      };

      /* O-11: die Lizenzfrage je Wert. Sie haengt an der Quelle des
         Kurses, nicht am Produkt: derselbe Aktienkurs ergibt einen
         oeffentlich zeigbaren EUR-Wert, wenn der Kurs von der EZB kommt,
         und einen gesperrten, wenn er vom Anbieter kommt, dessen
         FX-Vertragslage offen ist. Ein Produkt, das diese Unterscheidung
         nicht bekommt, kann sie auch nicht treffen. */
      if (Providers && typeof Providers.displayPermission === "function") {
        var perm = Providers.displayPermission(money.fxProvenance.source);
        money.publicDisplayAllowed = perm.publicDerivedDisplayAllowed;
        money.attribution = perm.attributionText || null;
        money.licenseBasis = perm.basis || null;
      }

      money.display.value = money.native.value * quote.rate;
      money.available = true;
      money.conversionAvailable = true;
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

    /**
     * §O-15 AB WANN IST DIESE REIHE IN DIESER WAEHRUNG ZEIGBAR?
     *
     * Zwei Anfaenge treffen aufeinander: der der Kursreihe und der der
     * FX-Historie. Der spaetere gewinnt, und welcher das war, gehoert in
     * die Antwort - eine Oberflaeche, die nur ein Datum bekommt, kann
     * dem Nutzer nicht sagen, WARUM der EUR-Chart spaeter beginnt als
     * der in Originalwaehrung.
     *
     * Die Originalwaehrung selbst ist nie begrenzt: dort wird nicht
     * umgerechnet, also fehlt auch nichts.
     */
    function availableFrom(nativeCurrency, displayCurrency, nativeAvailableFrom, opts) {
      opts = opts || {};
      var from = Registry.normalize(nativeCurrency);
      var to = Registry.normalize(displayCurrency);
      var out = {
        nativeCurrency: from, displayCurrency: to,
        nativeAvailableFrom: nativeAvailableFrom || null,
        availableFrom: nativeAvailableFrom || null,
        availableTo: null,
        fxAvailableFrom: null,
        fxAvailableTo: null,
        limitedBy: "NATIVE_SERIES",
        conversionAvailable: true,
        currentConversionAvailable: true,
        currentUnavailableReason: null,
        note: null
      };
      if (!from || !to) {
        out.conversionAvailable = false;
        out.currentConversionAvailable = false;
        out.currentUnavailableReason = "unknownCurrency";
        out.limitedBy = "UNKNOWN_CURRENCY";
        out.availableFrom = null;
        out.note = "Waehrung unbekannt; es wird nicht geraten.";
        return out;
      }
      if (from === to) {
        out.note = "Keine Umrechnung - die Reihe beginnt, wo sie beginnt.";
        return out;
      }

      var win = store.coverageWindow(from, to, opts);
      out.fxAvailableFrom = win.from;
      out.fxAvailableTo = win.to;

      if (win.from === null) {
        out.conversionAvailable = false;
        out.currentConversionAvailable = false;
        out.currentUnavailableReason = "pairNotStored";
        out.availableFrom = null;
        out.limitedBy = "NO_FX_SERIES";
        out.note = "Fuer " + from + "/" + to + " liegt keine Kurshistorie vor. " +
                   "Die Reihe bleibt in " + from + " verfuegbar.";
        return out;
      }

      if (!nativeAvailableFrom || win.from > nativeAvailableFrom) {
        out.availableFrom = win.from;
        out.limitedBy = "FX_HISTORY";
        out.note = "Die Kursreihe reicht weiter zurueck als jede FX-Quelle. " +
                   "In " + to + " beginnt sie am " + win.from + "; davor wird nichts genaehert.";
      }

      /* §O-13 VERFUEGBARKEIT IST EIN ZEITPUNKT, KEINE EIGENSCHAFT.
         Der Rubel ist der gemessene Fall: bis 2022 umrechenbar, seither
         nicht - die EZB hat die Veroeffentlichung eingestellt. Wer
         Verfuegbarkeit je WAEHRUNG fuehrt, muss sich hier fuer eine
         Luege entscheiden. Gefragt wird deshalb der aktuelle Stand
         selbst, nicht die Reihe. */
      /* §O-13 VERFUEGBARKEIT IST EIN ZEITPUNKT, KEINE EIGENSCHAFT.

         latest() gibt den letzten Punkt der Reihe zurueck, auch wenn er
         vier Jahre alt ist - richtig fuer einen Rueckblick, falsch fuer
         eine Aussage ueber HEUTE. Gefragt wird deshalb nach dem KURS VON
         HEUTE, und damit gilt dieselbe Grenze wie ueberall sonst
         (maxCarryDays): ein Kurs, der ueber sie hinaus fortgeschrieben
         werden muesste, ist keiner mehr.

         Der Rubel ist der gemessene Fall: bis 2022 umrechenbar, seither
         nicht - die EZB hat die Veroeffentlichung eingestellt. Wer
         Verfuegbarkeit je WAEHRUNG fuehrt statt je Zeitpunkt, muss sich
         hier fuer eine Luege entscheiden. */
      var nowValue = opts.now !== undefined ? opts.now : nowProvider();
      var today = new Date(typeof nowValue === "number" ? nowValue : Date.parse(nowValue))
                    .toISOString().slice(0, 10);
      var current = store.rateAt(from, to, today, { resolutionClass: "CURRENT" });
      var fresh = (current && current.available)
        ? Freshness.assess(current, { now: nowValue })
        : null;
      out.currentFreshness = fresh ? fresh.state : "UNAVAILABLE";
      out.currentConversionAvailable = !!(current && current.available);
      if (!out.currentConversionAvailable) {
        out.currentUnavailableReason = (current && (current.reason || current.fallbackReason)) || "noCurrentRate";
        out.availableTo = win.to;
        out.note = (out.note ? out.note + " " : "") +
                   "Aktuell gibt es fuer " + from + "/" + to + " keinen belastbaren Kurs; " +
                   "die Reihe endet am " + win.to + " und wird nicht fortgeschrieben.";
      }
      return out;
    }

    return {
      VERSION: VERSION, CONTRACT_VERSION: CONTRACT_VERSION, CONTEXTS: CONTEXTS,
      store: store,
      availableFrom: availableFrom,
      convertMoney: convertMoney,
      convertSeries: convertSeries,
      convertMetric: convertMetric,
      priceReturn: priceReturn
    };
  }

  /**
   * Ende -> Anfang, als Nachschlagewerk.
   *
   * Eine Oberflaeche hat oft nur zwei Zeilen vor sich (damals/heute),
   * aber die ganze Jahresreihe daneben. Aus der Reihe laesst sich der
   * Periodenanfang exakt ableiten; aus den zwei Zeilen nicht. Damit
   * niemand versucht ist, dafuer ein Kalenderjahr anzunehmen (§14),
   * steht die Umkehrung hier neben der Regel selbst.
   */
  function periodIndex(rows, opts) {
    opts = opts || {};
    var kette = resolvePeriodChain(rows);
    var out = {};
    kette.forEach(function (e) {
      if (e.periodEnd && e.periodStart) out[e.periodEnd] = e.periodStart;
    });

    /* DIE ERSTE PERIODE HAT KEINE VORGAENGERIN.

       Streng genommen ist ihr Anfang unbekannt, und genau das sagt
       resolvePeriod. Fuer eine Reihe, die gezeichnet wird, hat das eine
       haessliche Folge: der erste Balken bliebe in Originalwaehrung,
       alle anderen stuenden in Euro. Ein Diagramm mit zwei Waehrungen
       ist schlechter als eines mit einer.

       `inferFirstFromChain` schliesst diese eine Luecke - NICHT aus dem
       Kalender, sondern aus den Perioden DESSELBEN Unternehmens: die
       erste Periode ist so lang wie der Median der folgenden. Fuer eine
       Jahresreihe heisst das 365 oder 364 Tage, je nachdem, was die
       Firma selbst meldet.

       Es bleibt eine Ableitung und keine Quelle. Sie ist deshalb
       ausdruecklich zu verlangen, und periodAverage meldet weiterhin
       seine Abdeckung - ein daneben liegender Anfang faellt dort auf. */
    if (opts.inferFirstFromChain && kette.length >= 2) {
      var erste = kette[0];
      if (erste.periodEnd && !erste.periodStart) {
        var laengen = [];
        for (var i = 1; i < kette.length; i++) {
          var e = kette[i];
          if (e.periodStart && e.periodEnd) {
            laengen.push(Math.round((Date.parse(e.periodEnd) - Date.parse(e.periodStart)) / 86400000));
          }
        }
        if (laengen.length) {
          laengen.sort(function (a, b) { return a - b; });
          var median = laengen[Math.floor(laengen.length / 2)];
          if (median > 0) {
            out[erste.periodEnd] = new Date(Date.parse(erste.periodEnd + "T00:00:00Z") - median * 86400000)
              .toISOString().slice(0, 10);
          }
        }
      }
    }
    return out;
  }

  var api = {
    VERSION: VERSION, CONTRACT_VERSION: CONTRACT_VERSION, CONTEXTS: CONTEXTS,
    createEngine: createEngine,
    resolvePeriod: resolvePeriod,
    resolvePeriodChain: resolvePeriodChain,
    periodIndex: periodIndex
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Engine = api; }
})(typeof window !== "undefined" ? window : globalThis);
