/* =========================================================================
   VISION UNIVERSE — fx/fx-realtime-state.js   (Currency Layer V1, §11, §12, §37, §58)

   DER REALTIME-KURS IN DER ANZEIGEWAEHRUNG - OHNE ZWEITEN STREAM.

   Der bestehende Pfad bleibt unberuehrt:

     Tiingo -> Cloudflare Realtime -> VU Realtime State -> Browser

   Diese Datei haengt sich NICHT in diesen Transport. Sie ist eine
   Multiplikation am Ende: ein Tick kommt in seiner nativen Waehrung an
   und geht mit einem zusaetzlichen display-Feld weiter. Kein zweiter
   Aktien-Stream, kein Umbau der Verbindung, keine Aenderung am
   Zero-Cost-Vertrag.

   WARUM NICHT JEDER TICK EINEN EIGENEN FX-TICK BEKOMMT

   Weil das Verhaeltnis der Bewegungen es nicht hergibt. Eine liquide
   Aktie bewegt sich innerhalb einer Minute um Zehntelprozente; ein
   Hauptwaehrungspaar bewegt sich in derselben Minute um Hundertstel.
   Ein zweiter Push-Transport fuer FX wuerde die Anzeige um eine Stelle
   genauer machen, die der Nutzer nicht sieht - und dafuer einen zweiten
   Betriebszustand, ein zweites Kontingent und einen zweiten Ausfallpfad
   einfuehren.

   Deshalb Stufe A (fx-capability.js): EIN FX-Stand bedient viele Ticks,
   solange er gemaess Freshness-Vertrag gilt. Stufe B und C sind
   vorgesehen, aber nicht gebaut - sie brauchen einen belegten Nutzen,
   keinen Wunsch.

   DIE GRENZE, DIE NICHT VERHANDELBAR IST

   Ist der FX-Stand nicht CURRENT, darf das Ergebnis nicht "Realtime EUR"
   heissen. Der Aktienkurs bleibt realtime; die Umrechnung ist es dann
   nicht, und `realtimeClaimAllowed` sagt das. Ein Produkt, das diese
   Unterscheidung ignoriert, behauptet eine Aktualitaet, die es nicht hat.

   KEINE DOPPELTE UMRECHNUNG

   Ein Tick, der bereits ein display-Feld traegt, wird nicht erneut
   umgerechnet. Der Fall tritt auf, sobald zwei Schichten denselben
   Hilfsdienst aufrufen, und das Ergebnis - Kurs mal Kurs - sieht aus wie
   ein Kurssturz.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Freshness = isNode ? require("./fx-freshness.js")      : (global.VUFx && global.VUFx.Freshness);
  var Registry  = isNode ? require("./currency-registry.js") : (global.VUFx && global.VUFx.Registry);

  var VERSION = "fx-realtime-state-1.0.0";
  var MARKER = "vu-fx-converted";

  /**
   * Haelt den aktuellen FX-Stand je Paar und beantwortet damit beliebig
   * viele Ticks.
   *
   * @param {object} options
   *   store          FX-Store (fx-rates.js) als Quelle des letzten Standes
   *   refreshSeconds wie oft der Stand aus dem Store neu gelesen wird.
   *                  60 Sekunden, nicht 1: der Store selbst wird im Takt
   *                  seines Ingest aktualisiert, und haeufiger zu lesen
   *                  erzeugt Arbeit ohne neue Information.
   */
  function createState(options) {
    options = options || {};
    var store = options.store;
    if (!store) throw new Error("fx-realtime-state: ohne FX-Store gibt es keinen Stand.");
    var refreshMs = (typeof options.refreshSeconds === "number" ? options.refreshSeconds : 60) * 1000;
    var nowFn = typeof options.now === "function" ? options.now : function () { return Date.now(); };

    var cache = Object.create(null);
    var stats = { ticks: 0, converted: 0, skippedAlreadyConverted: 0, fallbackNative: 0, fxReads: 0 };

    /* Der Ausfallzustand je Paar. Getrennt vom Cache, weil er eine andere
       Frage beantwortet: der Cache sagt "wann haben wir zuletzt gelesen",
       dieser Zaehler sagt "seit wann kommt nichts mehr".

       Ohne ihn sieht ein Anbieterausfall aus wie ein ruhiger Markt. Der
       letzte Kurs bleibt im Cache, die Freshness altert langsam, und
       irgendwann steht STALE da - ohne dass jemand sagen koennte, ob die
       Quelle schweigt oder der Markt. */
    var outage = Object.create(null);

    function key(from, to) { return from + "/" + to; }

    function outageFor(k) {
      if (!outage[k]) {
        outage[k] = { consecutiveFailures: 0, firstFailureAt: null, lastSuccessAt: null, state: "OK" };
      }
      return outage[k];
    }

    function currentQuote(from, to) {
      var k = key(from, to);
      var now = nowFn();
      var hit = cache[k];
      if (hit && (now - hit.readAt) < refreshMs) return hit.quote;

      var quote = store.latest(from, to);
      stats.fxReads++;
      var o = outageFor(k);

      if (quote && quote.available) {
        o.consecutiveFailures = 0;
        o.firstFailureAt = null;
        o.lastSuccessAt = now;
        o.state = "OK";
        cache[k] = { quote: quote, readAt: now };
        return quote;
      }

      /* Ein Fehlschlag. Der ZULETZT erfolgreiche Stand bleibt gueltig -
         ihn wegzuwerfen, weil eine Abfrage scheiterte, waere der
         schlechtere Ausgang: die Anzeige verlöre eine Zahl, die noch
         richtig ist. Er altert dafuer weiter, und der Freshness-Vertrag
         entscheidet, wann er nicht mehr gezeigt werden darf. */
      o.consecutiveFailures++;
      if (o.firstFailureAt === null) o.firstFailureAt = now;
      o.state = o.consecutiveFailures >= 3 ? "PROVIDER_OUTAGE" : "DEGRADED";

      if (hit && hit.quote && hit.quote.available) {
        /* Nicht den readAt erneuern: der Stand ist alt, und er soll alt
           AUSSEHEN. Ein aufgefrischter Zeitstempel auf einem alten Kurs
           ist genau die stille Behauptung, die §23 verbietet. */
        cache[k] = { quote: hit.quote, readAt: hit.readAt, servedDuringOutage: true };
        return hit.quote;
      }
      cache[k] = { quote: quote, readAt: now };
      return quote;
    }

    /** Der Ausfallzustand, wie ihn ein Health-Check liest. */
    function outageState(from, to) {
      var k = key(Registry.normalize(from), Registry.normalize(to));
      var o = outage[k];
      if (!o) return { pair: k, state: "UNKNOWN", consecutiveFailures: 0,
                       detail: "Dieses Paar wurde noch nicht abgefragt." };
      return {
        pair: k, state: o.state,
        consecutiveFailures: o.consecutiveFailures,
        firstFailureAt: o.firstFailureAt,
        lastSuccessAt: o.lastSuccessAt,
        outageSeconds: o.firstFailureAt ? Math.round((nowFn() - o.firstFailureAt) / 1000) : 0,
        detail: o.state === "PROVIDER_OUTAGE"
          ? "Drei aufeinanderfolgende Fehlschlaege. Der letzte gueltige Stand wird weiter ausgeliefert und altert; der Freshness-Vertrag entscheidet, wann er nicht mehr gezeigt werden darf."
          : o.state === "DEGRADED"
            ? "Einzelner Fehlschlag. Noch kein Ausfall - ein Aussetzer ist kein Zustand."
            : "Die Quelle antwortet."
      };
    }

    /**
     * Ein Tick hinein, derselbe Tick mit display-Feld heraus.
     *
     * Der Tick wird nicht kopiert und nicht umgebaut - alle bestehenden
     * Felder bleiben, wo sie sind. Ein Consumer, der den Currency Layer
     * nicht kennt, sieht denselben Tick wie vorher.
     */
    function decorate(tick, displayCurrency, opts) {
      opts = opts || {};
      stats.ticks++;
      if (!tick || typeof tick !== "object") return tick;

      /* Doppelte Umrechnung verhindern. */
      if (tick[MARKER] === true) { stats.skippedAlreadyConverted++; return tick; }

      var to = Registry.normalize(displayCurrency);
      var from = Registry.normalize(tick.currency || tick.nativeCurrency ||
        (opts.security && (opts.security.tradingCurrency || opts.security.currency)));
      var price = typeof tick.price === "number" ? tick.price
                : (typeof tick.last === "number" ? tick.last
                : (typeof tick.close === "number" ? tick.close : null));

      tick.nativeCurrency = from || null;
      tick[MARKER] = true;

      if (price === null || !from || !to) {
        tick.display = null;
        tick.fx = null;
        tick.fxFreshness = Freshness.assess(null, {});
        tick.realtimeClaimAllowed = false;
        stats.fallbackNative++;
        return tick;
      }

      if (from === to) {
        /* §17: kein Kurs, keine Drift. Der Tick ist bereits in der
           Anzeigewaehrung und geht unveraendert durch. */
        tick.display = { value: price, currency: to };
        tick.fx = { rate: 1, method: "IDENTITY", asOf: null, source: "identity", base: from, quote: to };
        tick.fxFreshness = Freshness.assess({ available: true, method: "IDENTITY", asOf: null }, { now: nowFn() });
        tick.realtimeClaimAllowed = true;
        stats.converted++;
        return tick;
      }

      var quote = currentQuote(from, to);
      /* Die Frequenz kommt aus dem Stand selbst, nicht aus einer
         Annahme dieser Datei. Ein Tagesschluss bleibt ein Tagesschluss,
         auch wenn er einen Realtime-Tick bedient - und genau daran
         entscheidet sich, ob das Ergebnis "Realtime EUR" heissen darf. */
      var fresh = Freshness.assess(quote, { now: nowFn(), frequency: opts.frequency });
      tick.fxFreshness = fresh;
      /* Der Ausfallzustand reist mit dem Tick. Ein Consumer, der nur die
         Freshness sieht, kann "Markt ruht" nicht von "Quelle schweigt"
         unterscheiden - und das sind zwei verschiedene Nachrichten. */
      tick.fxOutage = outageState(from, to);

      if (!quote.available) {
        /* Kein Kurs: der Tick behaelt seine native Waehrung. Er wird NICHT
           1:1 uebernommen und mit dem Symbol der Anzeigewaehrung
           versehen (§23). */
        tick.display = null;
        tick.fx = null;
        tick.realtimeClaimAllowed = false;
        stats.fallbackNative++;
        return tick;
      }

      tick.display = { value: price * quote.rate, currency: to };
      tick.fx = { rate: quote.rate, method: quote.method, asOf: quote.asOf,
                  source: quote.source, base: quote.base, quote: quote.quote,
                  derivation: quote.derivation };
      /* Der Aktienkurs ist realtime. Ob das Ergebnis so heissen darf,
         entscheidet der FX-Stand (§53). */
      tick.realtimeClaimAllowed = fresh.realtimeClaimAllowed === true;
      stats.converted++;
      return tick;
    }

    function snapshot() {
      return {
        version: VERSION,
        refreshSeconds: refreshMs / 1000,
        marketPhase: Freshness.marketPhase(nowFn()),
        pairs: Object.keys(cache).map(function (k) {
          var c = cache[k];
          var o = outage[k] || {};
          return { pair: k, available: c.quote.available, rate: c.quote.rate,
                   asOf: c.quote.asOf, source: c.quote.source, readAt: c.readAt,
                   servedDuringOutage: c.servedDuringOutage === true,
                   outageState: o.state || "OK", consecutiveFailures: o.consecutiveFailures || 0 };
        }),
        stats: {
          ticks: stats.ticks, converted: stats.converted,
          skippedAlreadyConverted: stats.skippedAlreadyConverted,
          fallbackNative: stats.fallbackNative,
          fxReads: stats.fxReads,
          /* Die Zahl, die Stufe A rechtfertigt oder widerlegt: wie viele
             Ticks bedient ein FX-Abruf? Liegt sie bei 1, ist der Cache
             wirkungslos; liegt sie hoch, waere ein FX-Push-Transport
             Aufwand ohne Gegenwert. */
          ticksPerFxRead: stats.fxReads ? stats.ticks / stats.fxReads : null
        }
      };
    }

    return { VERSION: VERSION, MARKER: MARKER, decorate: decorate, snapshot: snapshot,
             currentQuote: currentQuote, outageState: outageState };
  }

  var api = { VERSION: VERSION, MARKER: MARKER, createState: createState };

  if (isNode) module.exports = api;
  else { global.VUFx = global.VUFx || {}; global.VUFx.RealtimeState = api; }
})(typeof window !== "undefined" ? window : globalThis);
