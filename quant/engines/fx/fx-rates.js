/* =========================================================================
   VISION UNIVERSE — fx/fx-rates.js   (Currency Layer V1, §8, §14, §15, §54)

   DER ZENTRALE HISTORISCHE FX-STORE.

   Eine Waehrungspaar-Zeitreihe liegt genau einmal im System. Nicht je
   Aktie, nicht je Produkt, nicht je Oberflaeche. Der Grund ist nicht
   Speicherplatz, sondern Reproduzierbarkeit: ein Wert aus 2021 muss
   morgen mit demselben historischen FX-Stand wieder herauskommen wie
   heute. Das geht nur, wenn es einen Stand gibt und nicht sechs Kopien,
   von denen fuenf irgendwann nicht mitgezogen sind.

   DIE DREI REGELN, DIE DIESE DATEI DURCHSETZT

   1. KEIN LOOK-AHEAD. Fuer einen Stichtag t kommt nur ein Kurs mit Datum
      <= t in Frage. Ein Kurs von morgen, der einen Bilanzwert von gestern
      umrechnet, erzeugt eine Zahl, die zum Stichtag niemand haette
      berechnen koennen. In einem Backtest ist das ein Betrug am eigenen
      Ergebnis; in einer Anzeige ist es eine Falschaussage.

   2. KEINE ERFUNDENEN KURSE. Fehlt ein Fixing, gilt die deterministische
      PREVIOUS_AVAILABLE-Regel - der juengste vorhandene Kurs <= t. Das ist
      der Normalfall an jedem Wochenende und Feiertag und deshalb kein
      Fehler, sondern ein benannter Zustand. Was es NICHT gibt: lineare
      Interpolation, Mittelwerte ueber die Luecke, ein Kurs "ungefaehr wie
      der von vorgestern". Eine Naeherung, die sich nicht als solche
      meldet, ist schlimmer als eine Luecke.

   3. KEINE STILLE ABLEITUNG. Ein Kurs, der nicht direkt vorliegt, kann
      aus der Gegenrichtung (1/rate) oder ueber ein Pivot (USD) entstehen.
      Beides ist erlaubt und beides traegt seinen Weg im Feld `derivation`.
      Bei der Triangulation muessen beide Beine auf DEMSELBEN asOf-Datum
      stehen - zwei Kurse von verschiedenen Tagen ergeben ein Kreuz, das
      es an keinem Tag gab.

   WAS DIESE DATEI NICHT TUT

   Sie kennt keinen Anbieter. Sie bekommt Reihen und beantwortet Fragen
   dazu. Ob die Reihen von Tiingo, aus einer Referenzquelle oder aus einem
   Testfixture stammen, entscheidet der Aufrufer und haelt das Feld
   `source` fest. Damit ist der Quellenwechsel eine Zeile im Ingest und
   kein Umbau.

   Sie entscheidet auch nicht ueber Freshness. Sie liefert `asOf`;
   fx-freshness.js sagt, was dieses Datum in diesem Moment bedeutet.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "fx-rates-1.0.0";

  /* Die Waehrung, ueber die gekreuzt wird, wenn ein Paar nicht direkt
     vorliegt. USD, weil praktisch jede Anbieterreihe gegen USD notiert -
     nicht, weil USD eine besondere Rolle im Produkt haette. */
  var PIVOT = "USD";

  var FREQUENCIES = ["DAILY", "INTRADAY", "REALTIME"];

  var METHODS = {
    IDENTITY:           "IDENTITY",
    DAILY_AT_DATE:      "DAILY_AT_DATE",
    PREVIOUS_AVAILABLE: "PREVIOUS_AVAILABLE",
    LATEST_AVAILABLE:   "LATEST_AVAILABLE",
    PERIOD_AVERAGE:     "PERIOD_AVERAGE"
  };

  var DERIVATIONS = {
    DIRECT:        "DIRECT",         // das Paar liegt so vor, wie gefragt
    INVERSE:       "INVERSE",        // 1 / Gegenrichtung - exakte Identitaet
    TRIANGULATED:  "TRIANGULATED"    // ueber PIVOT, beide Beine auf demselben Tag
  };

  function isIsoDate(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  function normCode(v) {
    return (typeof v === "string" && /^[A-Za-z]{3}$/.test(v)) ? v.toUpperCase() : null;
  }

  function pairKey(base, quote) { return base + "/" + quote; }

  /** Ein sauberer, immer gleich geformter Misserfolg. */
  function unavailable(base, quote, date, reason, detail) {
    return {
      available: false, rate: null, base: base, quote: quote,
      asOf: null, requestedDate: date || null,
      method: null, derivation: null, source: null, frequency: null,
      reason: reason, detail: detail || null
    };
  }

  /* --------------------------------------------------------------------
     Die Reihe eines einzelnen Paares
     -------------------------------------------------------------------- */

  /**
   * Nimmt Rohzeilen an und macht daraus eine sortierte, duplikatfreie
   * Reihe. Zeilen ohne gueltiges Datum oder ohne endliche positive Rate
   * werden verworfen und gezaehlt - nicht stillschweigend uebergangen und
   * erst recht nicht auf 0 gesetzt. Ein Wechselkurs von 0 ist kein
   * niedriger Kurs, sondern ein kaputter Datensatz.
   *
   * Mehrere Zeilen zum selben Tag: die zuletzt eingespielte gewinnt, und
   * der Fall wird gezaehlt. Ein Paar, das taeglich Dubletten liefert, hat
   * ein Ingest-Problem, das sichtbar bleiben soll.
   */
  function buildSeries(rows, meta) {
    meta = meta || {};
    var byDate = Object.create(null);
    var rejected = 0, duplicates = 0;

    (rows || []).forEach(function (row) {
      var date, rate;
      if (Array.isArray(row)) { date = row[0]; rate = row[1]; }
      else if (row && typeof row === "object") { date = row.date || row.asOf; rate = row.rate; }
      else { rejected++; return; }

      if (typeof date === "string" && date.length > 10) date = date.slice(0, 10);
      if (!isIsoDate(date)) { rejected++; return; }
      if (typeof rate !== "number" || !isFinite(rate) || rate <= 0) { rejected++; return; }

      if (byDate[date] !== undefined) duplicates++;
      byDate[date] = rate;
    });

    var dates = Object.keys(byDate).sort();
    return {
      dates: dates,
      rates: dates.map(function (d) { return byDate[d]; }),
      source: meta.source || null,
      frequency: FREQUENCIES.indexOf(meta.frequency) >= 0 ? meta.frequency : "DAILY",
      ingestedAt: meta.ingestedAt || null,
      rejectedRows: rejected,
      duplicateDates: duplicates
    };
  }

  /** Groesster Index mit dates[i] <= date, oder -1. Binaere Suche. */
  function floorIndex(dates, date) {
    var lo = 0, hi = dates.length - 1, out = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (dates[mid] <= date) { out = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return out;
  }

  /* --------------------------------------------------------------------
     Der Store
     -------------------------------------------------------------------- */

  function createStore(options) {
    options = options || {};
    var series = Object.create(null);
    /* Wie weit PREVIOUS_AVAILABLE zurueckgreifen darf. Ohne Grenze wuerde
       ein Paar, dessen Reihe vor drei Jahren abgerissen ist, heute noch
       einen Kurs liefern - formal "der letzte verfuegbare", fachlich
       Unsinn. Zehn Kalendertage decken jedes Wochenende und jede
       Feiertagsbruecke ab und fangen einen echten Abriss. */
    var maxCarryDays = typeof options.maxCarryDays === "number" ? options.maxCarryDays : 10;
    var pivot = normCode(options.pivot) || PIVOT;

    function ingest(base, quote, rows, meta) {
      var b = normCode(base), q = normCode(quote);
      if (!b || !q) throw new Error("fx-rates: ungueltiger Waehrungscode " + base + "/" + quote);
      var built = buildSeries(rows, meta);
      series[pairKey(b, q)] = built;
      return {
        pair: pairKey(b, q), observations: built.dates.length,
        first: built.dates[0] || null, last: built.dates[built.dates.length - 1] || null,
        rejectedRows: built.rejectedRows, duplicateDates: built.duplicateDates,
        source: built.source, frequency: built.frequency
      };
    }

    function has(base, quote) { return !!series[pairKey(normCode(base), normCode(quote))]; }
    function pairs() { return Object.keys(series).sort(); }
    function seriesFor(base, quote) { return series[pairKey(normCode(base), normCode(quote))] || null; }

    function daysBetween(a, b) {
      return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
    }

    /** Ein Direktabruf auf genau einer gespeicherten Reihe. */
    function lookupDirect(b, q, date) {
      var s = series[pairKey(b, q)];
      if (!s || !s.dates.length) return null;

      if (date === null || date === undefined) {
        var lastIdx = s.dates.length - 1;
        return { rate: s.rates[lastIdx], asOf: s.dates[lastIdx], method: METHODS.LATEST_AVAILABLE,
                 source: s.source, frequency: s.frequency, fallbackReason: null };
      }

      var i = floorIndex(s.dates, date);
      if (i < 0) {
        /* Vor dem Beginn der Reihe. Der einzige Fall, in dem es keinen
           Ausweg gibt: der naechste Kurs liegt in der Zukunft des
           angefragten Tages, und den zu nehmen waere Look-Ahead. */
        return { unavailable: "beforeSeriesStart", seriesStart: s.dates[0] };
      }
      var exact = s.dates[i] === date;
      if (!exact) {
        var gap = daysBetween(s.dates[i], date);
        if (gap > maxCarryDays) {
          return { unavailable: "carryLimitExceeded", asOf: s.dates[i], gapDays: gap, maxCarryDays: maxCarryDays };
        }
      }
      return {
        rate: s.rates[i], asOf: s.dates[i],
        method: exact ? METHODS.DAILY_AT_DATE : METHODS.PREVIOUS_AVAILABLE,
        source: s.source, frequency: s.frequency,
        fallbackReason: exact ? null : "Kein Fixing am " + date + "; verwendet wird der letzte vorherige Stand vom " + s.dates[i] + "."
      };
    }

    /**
     * Der eine Einstiegspunkt fuer "was war der Kurs am Tag t".
     *
     * `date` null bedeutet "der juengste Stand" (LATEST_AVAILABLE) und ist
     * bewusst ein anderer Aufruf als ein Datum von heute: "heute" kann
     * Wochenende sein, "juengster Stand" nie.
     */
    function rateAt(base, quote, date, opts) {
      opts = opts || {};
      var b = normCode(base), q = normCode(quote);
      if (!b || !q) return unavailable(base, quote, date, "invalidCurrencyCode");
      if (date !== null && date !== undefined && !isIsoDate(date)) {
        return unavailable(b, q, date, "invalidDate");
      }

      /* §17 SAME-CURRENCY FAST PATH. Rate exakt 1, keine Datenquelle,
         keine Rundungsdrift, kein Freshness-Problem. Eine EUR-Zahl in
         EUR anzuzeigen darf nie an einem fehlenden Wechselkurs scheitern. */
      if (b === q) {
        return {
          available: true, rate: 1, base: b, quote: q,
          asOf: date || null, requestedDate: date || null,
          method: METHODS.IDENTITY, derivation: DERIVATIONS.DIRECT,
          source: "identity", frequency: null, fallbackReason: null, reason: null
        };
      }

      function pack(hit, derivation, extra) {
        var out = {
          available: true, rate: hit.rate, base: b, quote: q,
          asOf: hit.asOf, requestedDate: date || null,
          method: hit.method, derivation: derivation,
          source: hit.source, frequency: hit.frequency,
          fallbackReason: hit.fallbackReason, reason: null
        };
        if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
        return out;
      }

      var direct = lookupDirect(b, q, date);
      if (direct && !direct.unavailable) return pack(direct, DERIVATIONS.DIRECT);

      /* Gegenrichtung. 1/rate ist keine Schaetzung, sondern dieselbe
         Information anders herum - deshalb ohne Vorbehalt erlaubt, aber
         mit Kennzeichnung, damit eine spaetere Abweichung zwischen
         direkt gefuehrtem und invertiertem Paar auffaellt. */
      if (opts.allowInverse !== false) {
        var inv = lookupDirect(q, b, date);
        if (inv && !inv.unavailable) {
          return pack({ rate: 1 / inv.rate, asOf: inv.asOf, method: inv.method,
                        source: inv.source, frequency: inv.frequency, fallbackReason: inv.fallbackReason },
                      DERIVATIONS.INVERSE, { derivedFrom: pairKey(q, b) });
        }
      }

      /* Triangulation ueber das Pivot. Nur, wenn beide Beine auf
         demselben asOf stehen: ein USD/EUR von Freitag mit einem
         USD/CHF von Montag ergibt ein EUR/CHF-Kreuz, das an keinem der
         beiden Tage gegolten hat. */
      if (opts.allowTriangulation !== false && b !== pivot && q !== pivot) {
        var legA = resolveLeg(pivot, b, date, opts);
        var legB = resolveLeg(pivot, q, date, opts);
        if (legA && legB && legA.asOf === legB.asOf) {
          var method = (legA.method === METHODS.DAILY_AT_DATE && legB.method === METHODS.DAILY_AT_DATE)
            ? METHODS.DAILY_AT_DATE : METHODS.PREVIOUS_AVAILABLE;
          return pack({
            rate: legB.rate / legA.rate, asOf: legA.asOf, method: method,
            source: legA.source === legB.source ? legA.source : (legA.source + "+" + legB.source),
            frequency: legA.frequency,
            fallbackReason: method === METHODS.PREVIOUS_AVAILABLE
              ? "Kreuzkurs aus dem letzten gemeinsamen Stand beider Beine vom " + legA.asOf + "."
              : null
          }, DERIVATIONS.TRIANGULATED, { pivot: pivot, legs: [pairKey(pivot, b), pairKey(pivot, q)] });
        }
        if (legA && legB) {
          return unavailable(b, q, date, "triangulationDateMismatch",
            "Beine stehen auf verschiedenen Staenden (" + legA.asOf + " / " + legB.asOf + "). Ein Kreuz aus zwei Tagen wird nicht gebildet.");
        }
      }

      var detail = direct && direct.unavailable
        ? (direct.unavailable === "beforeSeriesStart"
            ? "Der angefragte Tag liegt vor dem Beginn der Reihe (" + direct.seriesStart + "). Ein spaeterer Kurs waere Look-Ahead."
            : "Letzter Stand vom " + direct.asOf + " ist " + direct.gapDays + " Tage alt; die Uebertragsgrenze liegt bei " + direct.maxCarryDays + " Tagen.")
        : "Kein Paar " + pairKey(b, q) + " im Store, weder direkt noch ueber " + pivot + ".";
      return unavailable(b, q, date, direct && direct.unavailable ? direct.unavailable : "pairNotStored", detail);
    }

    /** Ein Bein der Triangulation, direkt oder invertiert. */
    function resolveLeg(from, to, date, opts) {
      var hit = lookupDirect(from, to, date);
      if (hit && !hit.unavailable) return hit;
      if (opts.allowInverse === false) return null;
      var inv = lookupDirect(to, from, date);
      if (inv && !inv.unavailable) {
        return { rate: 1 / inv.rate, asOf: inv.asOf, method: inv.method,
                 source: inv.source, frequency: inv.frequency, fallbackReason: inv.fallbackReason };
      }
      return null;
    }

    function latest(base, quote) { return rateAt(base, quote, null); }

    /**
     * §14 PERIOD AVERAGE - der Kurs fuer Flussgroessen.
     *
     * Arithmetisches Mittel aller vorhandenen taeglichen Kurse zwischen
     * periodStart und periodEnd, jeweils einschliesslich. Bewusst nur ueber
     * die VORHANDENEN Tage: die fehlenden Tage sind Wochenenden, und ein
     * Wochenende in einen Durchschnitt aufzunehmen hiesse, den Freitagskurs
     * dreifach zu zaehlen.
     *
     * Die Abdeckung wird gemeldet, nicht verschwiegen. Ein Jahr mit 40
     * Beobachtungen ergibt einen Durchschnitt, der aussieht wie einer -
     * deshalb `coverage` und die Schwelle `minCoverage`: darunter gibt es
     * kein Ergebnis, statt einer stillen Naeherung (§54).
     */
    function periodAverage(base, quote, periodStart, periodEnd, opts) {
      opts = opts || {};
      var b = normCode(base), q = normCode(quote);
      if (!b || !q) return unavailable(base, quote, periodEnd, "invalidCurrencyCode");
      if (!isIsoDate(periodStart) || !isIsoDate(periodEnd)) {
        return unavailable(b, q, periodEnd, "invalidPeriod",
          "Periodengrenzen fehlen oder sind unvollstaendig. Ein Kalenderjahr wird NICHT ersatzweise angenommen - das Geschaeftsjahr vieler Unternehmen ist keines.");
      }
      if (periodStart > periodEnd) return unavailable(b, q, periodEnd, "invalidPeriod", "periodStart liegt nach periodEnd.");

      if (b === q) {
        return {
          available: true, rate: 1, base: b, quote: q,
          asOf: periodEnd, periodStart: periodStart, periodEnd: periodEnd,
          method: METHODS.IDENTITY, derivation: DERIVATIONS.DIRECT,
          source: "identity", frequency: null,
          observations: 0, expectedObservations: 0, coverage: 1,
          fallbackReason: null, reason: null
        };
      }

      /* Der Durchschnitt wird aus derselben Abfrage gebildet, die auch ein
         einzelner Tag nehmen wuerde - inklusive Inversion und
         Triangulation. Nur so ist garantiert, dass Tages- und
         Periodenkurs desselben Paares aus derselben Quelle stammen. */
      var sum = 0, n = 0, sources = Object.create(null), derivations = Object.create(null);
      var cursor = Date.parse(periodStart + "T00:00:00Z");
      var end = Date.parse(periodEnd + "T00:00:00Z");
      var calendarDays = Math.round((end - cursor) / 86400000) + 1;

      for (var t = cursor; t <= end; t += 86400000) {
        var day = new Date(t).toISOString().slice(0, 10);
        var hit = rateAt(b, q, day, { allowInverse: opts.allowInverse, allowTriangulation: opts.allowTriangulation });
        /* Nur echte Fixings des Tages zaehlen. Ein uebertragener
           Freitagskurs wuerde am Samstag und Sonntag erneut einfliessen
           und das Wochenende dreifach gewichten. */
        if (hit.available && hit.method === METHODS.DAILY_AT_DATE) {
          sum += hit.rate; n++;
          sources[hit.source] = true;
          derivations[hit.derivation] = true;
        }
      }

      /* Erwartete Beobachtungen: Handelstage, grob als 5/7 der
         Kalendertage. Grob genug fuer eine Abdeckungsquote und bewusst
         ohne Feiertagskalender - ein Feiertagskalender je Waehrungsraum
         waere eine eigene Datenquelle mit eigener Pflege. */
      var expected = Math.max(1, Math.round(calendarDays * 5 / 7));
      var coverage = n / expected;
      var minCoverage = typeof opts.minCoverage === "number" ? opts.minCoverage : 0.6;

      if (n === 0) {
        return unavailable(b, q, periodEnd, "noObservationsInPeriod",
          "Zwischen " + periodStart + " und " + periodEnd + " liegt kein einziges Fixing vor.");
      }
      if (coverage < minCoverage) {
        var out = unavailable(b, q, periodEnd, "insufficientPeriodCoverage",
          n + " von rund " + expected + " erwarteten Handelstagen (" + Math.round(coverage * 100) + " %). " +
          "Unter " + Math.round(minCoverage * 100) + " % wird kein Periodendurchschnitt gebildet: eine Luecke, die sich als Durchschnitt ausgibt, ist gefaehrlicher als eine Luecke.");
        out.periodStart = periodStart; out.periodEnd = periodEnd;
        out.observations = n; out.expectedObservations = expected; out.coverage = coverage;
        return out;
      }

      var srcList = Object.keys(sources);
      var derList = Object.keys(derivations);
      return {
        available: true, rate: sum / n, base: b, quote: q,
        asOf: periodEnd, periodStart: periodStart, periodEnd: periodEnd,
        method: METHODS.PERIOD_AVERAGE,
        derivation: derList.length === 1 ? derList[0] : DERIVATIONS.DIRECT,
        source: srcList.length === 1 ? srcList[0] : srcList.sort().join("+"),
        frequency: "DAILY",
        observations: n, expectedObservations: expected, coverage: coverage,
        fallbackReason: null, reason: null
      };
    }

    /** Ein Bestandsbericht fuer Health-Checks und Tests. */
    function inventory() {
      return pairs().map(function (key) {
        var s = series[key];
        return {
          pair: key, observations: s.dates.length,
          first: s.dates[0] || null, last: s.dates[s.dates.length - 1] || null,
          source: s.source, frequency: s.frequency,
          rejectedRows: s.rejectedRows, duplicateDates: s.duplicateDates
        };
      });
    }

    return {
      VERSION: VERSION,
      ingest: ingest, has: has, pairs: pairs, seriesFor: seriesFor,
      rateAt: rateAt, latest: latest, periodAverage: periodAverage,
      inventory: inventory, pivot: pivot, maxCarryDays: maxCarryDays
    };
  }

  var api = {
    VERSION: VERSION, PIVOT: PIVOT, FREQUENCIES: FREQUENCIES,
    METHODS: METHODS, DERIVATIONS: DERIVATIONS,
    createStore: createStore, buildSeries: buildSeries, floorIndex: floorIndex
  };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.Rates = api; }
})(typeof window !== "undefined" ? window : globalThis);
