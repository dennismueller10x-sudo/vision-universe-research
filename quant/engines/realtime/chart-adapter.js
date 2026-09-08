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
    var seenRevision = null;
    var seenStructural = null;
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
    /**
     * `quelle` ist entweder die Reihe oder eine Funktion, die sie
     * liefert.
     *
     * Der Unterschied ist gemessen und nicht kosmetisch: eine Kopie von
     * 600 Bars kostet je Aufruf ein Vielfaches dessen, was der Vergleich
     * kostet, den sie ermoeglichen soll. Bei hundert Ticks in der Sekunde
     * ist das der gesamte Aufwand - fuer die Feststellung, dass sich
     * nichts geaendert hat. Mit einer Funktion wird die Reihe erst
     * angefasst, wenn feststeht, dass es etwas zu vergleichen gibt.
     */
    function diff(quelle, ctx) {
      ctx = ctx || {};
      stats.syncs++;
      var lazy = typeof quelle === "function";

      /* Der billigste Vergleich zuerst: hat sich ueberhaupt etwas
         geaendert? Die Reihe fuehrt dafuer einen Zaehler, und ein Tick,
         der nichts bewegt hat, kostet hier nichts weiter als diesen
         einen Vergleich. Ohne Zaehler faellt die Auswertung auf den
         vollstaendigen Abgleich zurueck - der bleibt richtig, er ist nur
         teurer. */
      if (ctx.force !== true && typeof ctx.revision === "number" &&
          ctx.revision === seenRevision) {
        stats.skipped++;
        stats.lastOp = "none";
        return { op: "none", from: rendered.length, count: 0,
                 bars: lazy ? null : quelle, changed: [],
                 reason: "unchanged", shouldRender: false, version: ADAPTER_VERSION };
      }

      var bars = lazy ? (quelle() || []) : quelle;
      var window_ = bars.length > maxPoints ? bars.slice(bars.length - maxPoints) : bars;
      var revision = typeof ctx.revision === "number" ? ctx.revision : null;
      var structural = typeof ctx.structuralRevision === "number" ? ctx.structuralRevision : null;

      if (ctx.force === true) return commit("reset", window_, 0, "forced", revision, structural);
      if (!rendered.length) {
        return window_.length ? commit("reset", window_, 0, "firstRender", revision, structural)
                              : commit("none", window_, 0, "empty", revision, structural);
      }

      /* Nichts Strukturelles: dann kann sich nur die letzte Bar bewegt
         haben oder eine neue dazugekommen sein. Beides laesst sich am
         Ende der Reihe entscheiden, ohne die 600 Bars davor anzufassen. */
      if (structural !== null && structural === seenStructural &&
          window_.length >= rendered.length &&
          window_[0].bucket === rendered[0].bucket) {
        if (window_.length > rendered.length) {
          return commit("append", window_, rendered.length, "newBars", revision, structural);
        }
        var letzte = rendered.length - 1;
        if (fingerprint(window_[letzte]) !== rendered[letzte].fp) {
          return commit("update", window_, letzte, "lastBarChanged", revision, structural);
        }
        seenRevision = revision;
        stats.skipped++;
        stats.lastOp = "none";
        return { op: "none", from: window_.length, count: 0, bars: window_, changed: [],
                 reason: "unchanged", shouldRender: false, version: ADAPTER_VERSION };
      }
      /* Ein Fenster, das vorne abgeschnitten wurde, oder eine kuerzere
         Reihe: die Zuordnung Position -> Bar stimmt nicht mehr. Ein
         Patchen waere hier eine Wette, und eine falsche Wette zeigt die
         Kurse des Vortags mit den Zeiten von heute. */
      if (window_.length < rendered.length ||
          window_[0].bucket !== rendered[0].bucket) {
        return commit("reset", window_, 0, "structuralChange", revision, structural);
      }

      /* Der gemeinsame Praefix. Weicht darin etwas ab, das nicht die
         letzte gezeichnete Bar ist, hat sich die Vergangenheit geaendert -
         Nachladen, Split, verspaetete Bar. Auch das ist ein Neuaufbau. */
      var changedIndex = -1;
      for (var i = 0; i < rendered.length; i++) {
        if (window_[i].bucket !== rendered[i].bucket) {
          return commit("reset", window_, 0, "bucketMismatch", revision, structural);
        }
        if (fingerprint(window_[i]) !== rendered[i].fp) {
          if (changedIndex !== -1 || i < rendered.length - 1) {
            return commit("reset", window_, 0, "historyChanged", revision, structural);
          }
          changedIndex = i;
        }
      }

      var added = window_.length - rendered.length;
      if (added > 0) return commit("append", window_, rendered.length, "newBars", revision, structural);
      if (changedIndex !== -1) return commit("update", window_, changedIndex, "lastBarChanged", revision, structural);

      seenRevision = revision;
      seenStructural = structural;
      stats.skipped++;
      stats.lastOp = "none";
      return { op: "none", from: window_.length, count: 0, bars: window_,
               reason: "unchanged", shouldRender: false, version: ADAPTER_VERSION };
    }

    function commit(op, window_, from, reason, revision, structural) {
      /* Das Gedaechtnis wird fortgeschrieben, nicht neu gebaut.
         Ein Neuaufbau kostet 600 Fingerabdruecke - und bei einem Tick,
         der nur den Schlusskurs der laufenden Kerze bewegt hat, waeren
         599 davon unveraendert. Genau das war in der Messung der
         gesamte Aufwand des Live-Betriebs.

         Fortgeschrieben wird nur, wenn das Fenster nicht gewandert ist;
         sonst stimmte die Zuordnung Position -> Bar nicht mehr, und ein
         falsch fortgeschriebenes Gedaechtnis liesse eine Aenderung
         unbemerkt. */
      var fortschreibbar = rendered.length > 0 && window_.length > 0 &&
                           rendered[0].bucket === window_[0].bucket &&
                           (op === "update" || op === "append");
      if (fortschreibbar && op === "update") {
        for (var u = from; u < window_.length; u++) {
          rendered[u] = { bucket: window_[u].bucket, fp: fingerprint(window_[u]) };
        }
      } else if (fortschreibbar && op === "append") {
        /* Eine Bar zurueck, nicht bei `from`: in dem Moment, in dem eine
           neue Kerze aufmacht, wechselt die vorherige von "laufend" auf
           "abgeschlossen". Bliebe ihr Fingerabdruck stehen, faende der
           naechste vollstaendige Abgleich einen Unterschied in der
           Vergangenheit und baute die Flaeche grundlos neu auf. */
        rendered.length = Math.max(0, from - 1);
        for (var p = rendered.length; p < window_.length; p++) {
          rendered.push({ bucket: window_[p].bucket, fp: fingerprint(window_[p]) });
        }
      } else {
        rendered = window_.map(function (b) { return { bucket: b.bucket, fp: fingerprint(b) }; });
      }
      seenRevision = revision === undefined ? null : revision;
      seenStructural = structural === undefined ? null : structural;
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

      /**
       * Der uebliche Weg: Reihe hinein, Anweisung heraus. Statt der
       * Reihe darf auch eine Funktion uebergeben werden, die sie
       * liefert - siehe diff().
       */
      sync: function (bars, ctx) {
        return diff(typeof bars === "function" ? bars : (bars || []), ctx);
      },

      /**
       * Wie sync, aber mit Zusammenfassung: mehrere Ticks innerhalb von
       * coalesceMs ergeben eine Zeichnung, nicht fuenf. Der Aufrufer
       * bekommt entweder eine Anweisung oder die Wartezeit, nach der sie
       * faellig wird.
       */
      syncCoalesced: function (bars, ctx) {
        ctx = ctx || {};
        var quelle = typeof bars === "function" ? bars : (bars || []);
        var t = now();
        var since = t - lastRenderAt;

        /* Nichts geaendert - der billigste Fall, und der haeufigste. */
        if (ctx.force !== true && typeof ctx.revision === "number" &&
            ctx.revision === seenRevision) {
          return diff(quelle, ctx);
        }

        /* Mit Zaehlern laesst sich VOR dem Abgleich entscheiden, ob
           gewartet werden darf - und dann wird die Reihe in dieser Runde
           gar nicht erst angefasst. Ohne Zaehler bleibt nur der alte Weg:
           erst vergleichen, dann entscheiden. Er ist richtig, aber er
           bezahlt den Vergleich auch dann, wenn das Ergebnis liegen
           bleibt. */
        var kannVorabWarten = ctx.force !== true &&
                              typeof ctx.structuralRevision === "number" &&
                              ctx.structuralRevision === seenStructural &&
                              rendered.length > 0;

        if (kannVorabWarten && since < coalesceMs) {
          stats.coalesced++;
          pending = { quelle: quelle, ctx: ctx };
          return { op: "none", from: rendered.length, count: 0, bars: null, changed: [],
                   reason: "coalesced", shouldRender: false,
                   dueInMs: coalesceMs - since, version: ADAPTER_VERSION };
        }

        var d = diff(quelle, ctx);
        if (!d.shouldRender) return d;
        /* Ein Neuaufbau wartet nicht: er entsteht aus einer
           Strukturaenderung, und die darf nicht eine Viertelsekunde
           lang falsch dastehen. */
        if (d.op === "reset" || since >= coalesceMs) {
          lastRenderAt = t;
          pending = null;
          return d;
        }
        stats.coalesced++;
        pending = { fertig: d };
        return { op: "none", from: d.from, count: 0, bars: d.bars, changed: [],
                 reason: "coalesced", shouldRender: false,
                 dueInMs: coalesceMs - since, version: ADAPTER_VERSION };
      },

      /** Die zurueckgehaltene Anweisung, wenn die Wartezeit um ist. */
      flush: function () {
        if (!pending) return null;
        var p = pending;
        pending = null;
        lastRenderAt = now();
        return p.fertig ? p.fertig : diff(p.quelle, p.ctx);
      },

      /** Nach einem Wechsel des Titels oder des Zeitraums. */
      invalidate: function () {
        rendered = []; pending = null; lastRenderAt = 0;
        seenRevision = null; seenStructural = null;
      },

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
