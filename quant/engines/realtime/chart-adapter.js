/* =========================================================================
   VISION UNIVERSE — realtime/chart-adapter.js

   Zwischen der Datenreihe und dem Zeichnen.

   Der Chart dieser Anwendung ist handgeschriebenes SVG (ui/charts.js) und
   zeichnet bei jedem Aufruf die ganze Flaeche neu. Fuer einen Jahreschart
   ist das richtig: er entsteht einmal. Fuer einen Live-Chart waere es der
   sichere Weg in eine Oberflaeche, die bei jedem Tick flackert und den
   Rechner beschaeftigt.

   Diese Datei loest das nicht dadurch, dass sie eine Chart-Library
   einfuehrt - das waere ein eigener Umbau mit eigener Begruendung.

   Sie loest es, indem sie die Frage beantwortet, die vor dem Zeichnen
   kommt: WAS hat sich seit dem letzten Bild geaendert?

     nichts          -> nicht zeichnen
     die letzte Bar  -> nur sie aktualisieren
     eine neue Bar   -> anhaengen
     die Struktur    -> neu aufbauen

   Ein Tick, der nur den Schlusskurs der laufenden Kerze bewegt, erzeugt
   damit eine Aktualisierung und keinen Neuaufbau. Der Renderer darf
   trotzdem neu zeichnen - dann weiss er wenigstens, dass es noetig war.

   Ausdruecklich KEIN Zustand ueber den Chart hinaus: der Adapter kennt
   kein DOM, kein Fenster und keine Zeichenfunktion. Er laesst sich damit
   in Node vollstaendig pruefen, und das ist bei einer Komponente, die
   ueber Zeichnen oder Nichtzeichnen entscheidet, keine Nebensache.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var ADAPTER_VERSION = "chart-adapter-1.0.0";

  /* Die Anweisungen, die der Adapter ausgibt. */
  var OPS = ["reset", "append", "update", "none"];

  function isNum(v) { return typeof v === "number" && isFinite(v); }

  function fingerprint(bar) {
    return [bar.open, bar.high, bar.low, bar.close, bar.volume,
            bar.confirmed ? 1 : 0].join("|");
  }

  /**
   * @param {object} opts
   *   maxPoints     wie viele Bars der Chart hoechstens zeichnet
   *   coalesceMs    Mindestabstand zwischen zwei Neuzeichnungen
   *   now
   */
  function createChartAdapter(opts) {
    opts = opts || {};
    var maxPoints = opts.maxPoints || 1500;
    var coalesceMs = opts.coalesceMs === undefined ? 250 : opts.coalesceMs;
    var now = opts.now || function () { return Date.now(); };

    var rendered = [];        // [{bucket, fp}]
    var lastRenderAt = 0;
    var pending = null;
    var stats = {
      syncs: 0, resets: 0, appends: 0, updates: 0, skipped: 0,
      coalesced: 0, barsRendered: 0, lastOp: null
    };

    /**
     * Vergleicht die neue Reihe mit dem letzten Bild.
     *
     * @param {Array} bars  Bars aus bar-merge.js (aufsteigend)
     * @param {object} ctx  {force: bool, status}
     * @returns {object} {op, from, count, bars, reason, shouldRender}
     */
    function diff(bars, ctx) {
      ctx = ctx || {};
      stats.syncs++;
      var window_ = bars.length > maxPoints ? bars.slice(bars.length - maxPoints) : bars;

      if (ctx.force === true) return commit("reset", window_, 0, "forced");
      if (!rendered.length) {
        return window_.length ? commit("reset", window_, 0, "firstRender")
                              : commit("none", window_, 0, "empty");
      }
      /* Ein Fenster, das vorne abgeschnitten wurde, oder eine kuerzere
         Reihe: die Zuordnung Position -> Bar stimmt nicht mehr. Ein
         Patchen waere hier eine Wette, und eine falsche Wette zeigt die
         Kurse des Vortags mit den Zeiten von heute. */
      if (window_.length < rendered.length ||
          window_[0].bucket !== rendered[0].bucket) {
        return commit("reset", window_, 0, "structuralChange");
      }

      /* Der gemeinsame Praefix. Weicht darin etwas ab, das nicht die
         letzte gezeichnete Bar ist, hat sich die Vergangenheit geaendert -
         Nachladen, Split, verspaetete Bar. Auch das ist ein Neuaufbau. */
      var changedIndex = -1;
      for (var i = 0; i < rendered.length; i++) {
        if (window_[i].bucket !== rendered[i].bucket) {
          return commit("reset", window_, 0, "bucketMismatch");
        }
        if (fingerprint(window_[i]) !== rendered[i].fp) {
          if (changedIndex !== -1 || i < rendered.length - 1) {
            return commit("reset", window_, 0, "historyChanged");
          }
          changedIndex = i;
        }
      }

      var added = window_.length - rendered.length;
      if (added > 0) return commit("append", window_, rendered.length, "newBars");
      if (changedIndex !== -1) return commit("update", window_, changedIndex, "lastBarChanged");

      stats.skipped++;
      stats.lastOp = "none";
      return { op: "none", from: window_.length, count: 0, bars: window_,
               reason: "unchanged", shouldRender: false, version: ADAPTER_VERSION };
    }

    function commit(op, window_, from, reason) {
      rendered = window_.map(function (b) { return { bucket: b.bucket, fp: fingerprint(b) }; });
      if (op === "reset") stats.resets++;
      else if (op === "append") stats.appends++;
      else if (op === "update") stats.updates++;
      stats.lastOp = op;
      stats.barsRendered = window_.length;
      return {
        op: op, from: from, count: window_.length - from,
        bars: window_,
        changed: window_.slice(from),
        reason: reason,
        shouldRender: op !== "none",
        version: ADAPTER_VERSION
      };
    }

    var api = {
      version: ADAPTER_VERSION,
      OPS: OPS,

      /** Der uebliche Weg: Reihe hinein, Anweisung heraus. */
      sync: function (bars, ctx) { return diff(bars || [], ctx); },

      /**
       * Wie sync, aber mit Zusammenfassung: mehrere Ticks innerhalb von
       * coalesceMs ergeben eine Zeichnung, nicht fuenf. Der Aufrufer
       * bekommt entweder eine Anweisung oder die Wartezeit, nach der sie
       * faellig wird.
       */
      syncCoalesced: function (bars, ctx) {
        var d = diff(bars || [], ctx);
        if (!d.shouldRender) return d;
        var t = now();
        var since = t - lastRenderAt;
        /* Ein Neuaufbau wartet nicht: er entsteht aus einer
           Strukturaenderung, und die darf nicht eine Viertelsekunde
           lang falsch dastehen. */
        if (d.op === "reset" || since >= coalesceMs) {
          lastRenderAt = t;
          pending = null;
          return d;
        }
        stats.coalesced++;
        pending = d;
        return { op: "none", from: d.from, count: 0, bars: d.bars, changed: [],
                 reason: "coalesced", shouldRender: false,
                 dueInMs: coalesceMs - since, version: ADAPTER_VERSION };
      },

      /** Die zurueckgehaltene Anweisung, wenn die Wartezeit um ist. */
      flush: function () {
        if (!pending) return null;
        var d = pending;
        pending = null;
        lastRenderAt = now();
        return d;
      },

      /** Nach einem Wechsel des Titels oder des Zeitraums. */
      invalidate: function () { rendered = []; pending = null; lastRenderAt = 0; },

      renderedCount: function () { return rendered.length; },
      stats: function () { return JSON.parse(JSON.stringify(stats)); }
    };

    return api;
  }

  var api = {
    ADAPTER_VERSION: ADAPTER_VERSION,
    OPS: OPS,
    createChartAdapter: createChartAdapter
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.ChartAdapter = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
