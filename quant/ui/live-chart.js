/* =========================================================================
   VISION UNIVERSE — ui/live-chart.js

   Die Oberflaechenseite des Live-Charts: eine Statusanzeige und eine
   Anbindung an das bestehende Chart-Modul.

   Bewusst duenn. Die Entscheidungen sind alle schon gefallen - welche
   Datenklasse (fallback-engine), wie alt (staleness), wie heisst das
   (data-status), muss ueberhaupt gezeichnet werden (chart-adapter). Was
   hier passiert, ist Anzeige.

   Zwei Dinge, die diese Datei einhaelt:

   1. Sie ruft nichts beim Anbieter ab. Vision Universe wird statisch
      ausgeliefert; ein Schluessel im Browser waere eine Veroeffentlichung
      (siehe docs/TIINGO_LIVE_ARCHITECTURE.md). Der Feed bekommt seine
      Transporte von aussen - im heutigen Betrieb sind das ausgelieferte
      Dateien, spaeter ein eigener Endpunkt. Nie der Anbieter direkt.

   2. Sie schreibt das Etikett nicht selbst. `status.text` kommt aus
      data-status.js. Ein zweiter Ort, an dem "LIVE" entstehen kann, waere
      genau der Ort, an dem es irgendwann faelschlich entsteht.
   ========================================================================= */
(function (global) {
  "use strict";

  var R = global.VURealtime || {};
  var Charts = global.QuantCharts;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined) return;
      if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else node.setAttribute(k, String(attrs[k]));
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  /* ------------------------------------------------------ Statusanzeige */

  /**
   * Die Datenstatus-Komponente (§3).
   *
   * Sie zeigt genau das, was data-status.js ermittelt hat, und traegt den
   * Ton als Klasse - die Farbe entscheidet die CSS-Ebene, nicht diese
   * Datei. Der Titel-Text nennt den Grund eines Abstiegs, damit ein
   * "VERZÖGERT" beantwortbar bleibt, ohne die Flaeche zuzustellen.
   */
  function dataStatusBadge(status, opts) {
    opts = opts || {};
    status = status || { code: "UNAVAILABLE", label: "MARKTDATEN DERZEIT NICHT VERFÜGBAR",
                         text: "MARKTDATEN DERZEIT NICHT VERFÜGBAR", tone: "muted" };
    var node = el("span", {
      class: "vu-datastatus vu-datastatus--" + (status.tone || "muted"),
      "data-status": status.code,
      role: "status",
      "aria-live": status.code === "LIVE" ? "off" : "polite",
      title: hint(status)
    }, [
      el("span", { class: "vu-datastatus__dot", "aria-hidden": "true" }),
      el("span", { class: "vu-datastatus__label", text: status.label }),
      /* Die Sitzung steht zwischen Etikett und Zeitstempel, weil sie in
         dieser Reihenfolge gelesen wird: was sehe ich, aus welchem
         Handel, von wann. Ohne sie beantwortet "LIVE" um 23:00 deutscher
         Zeit die Frage nicht, die der Nutzer hat. */
      status.sessionLabel
        ? el("span", { class: "vu-datastatus__session", text: status.sessionLabel })
        : null,
      status.detail ? el("span", { class: "vu-datastatus__detail", text: status.detail }) : null
    ]);
    if (opts.className) node.className += " " + opts.className;
    return node;
  }

  /* Setzt, aendert oder entfernt einen Teil der Anzeige, ohne sie neu
     aufzubauen. `vor` haelt die Reihenfolge: die Sitzung gehoert vor den
     Zeitstempel, auch wenn sie erst spaeter dazukommt. */
  function setzeTeil(node, klasse, text, vor) {
    var vorhanden = node.querySelector("." + klasse);
    if (!text) {
      if (vorhanden) vorhanden.parentNode.removeChild(vorhanden);
      return;
    }
    if (vorhanden) { vorhanden.textContent = text; return; }
    var neu = el("span", { class: klasse, text: text });
    if (vor) node.insertBefore(neu, vor); else node.appendChild(neu);
  }

  function hint(status) {
    if (status.code === "LIVE" && status.sessionIsExtended) {
      return "Echtzeitkurse aus dem erweiterten Handel (" + status.sessionLabel + "). " +
             "Ausserhalb der regulaeren Boersenzeit ist der Handel duenner.";
    }
    if (status.code === "LIVE") return "Echtzeitkurse. Der Zeitpunkt ist der letzte Datenstand.";
    if (status.downgraded && status.downgradedFrom) {
      return "Diese Ansicht zeigt " + status.dataClass + " statt " +
             status.downgradedFrom + ". Grund: " + (status.reason || "unbekannt") + ".";
    }
    if (status.reason) return "Grund: " + status.reason + ".";
    return "";
  }

  /** Aktualisiert eine bestehende Anzeige, ohne sie neu zu bauen. */
  function updateBadge(node, status) {
    if (!node || !status) return node;
    node.className = "vu-datastatus vu-datastatus--" + (status.tone || "muted");
    node.setAttribute("data-status", status.code);
    node.setAttribute("title", hint(status));
    var label = node.querySelector(".vu-datastatus__label");
    if (label) label.textContent = status.label;
    setzeTeil(node, "vu-datastatus__session", status.sessionLabel,
              node.querySelector(".vu-datastatus__detail"));
    var detail = node.querySelector(".vu-datastatus__detail");
    if (status.detail) {
      if (detail) detail.textContent = status.detail;
      else node.appendChild(el("span", { class: "vu-datastatus__detail", text: status.detail }));
    } else if (detail) {
      detail.parentNode.removeChild(detail);
    }
    return node;
  }

  /* --------------------------------------------------------- Live-Chart */

  /**
   * Verbindet einen Feed mit einer Zeichenflaeche.
   *
   * @param {object} opts
   *   mount       Element, in das gezeichnet wird
   *   feed        Feed aus realtime/feed.js
   *   render(bars, op)  eigene Zeichenfunktion; ohne sie wird
   *                     QuantCharts.candlestickChart benutzt
   *   maxPoints, coalesceMs
   */
  function attachLiveChart(opts) {
    opts = opts || {};
    var mount = opts.mount;
    var feed = opts.feed;
    if (!mount || !feed) throw new Error("attachLiveChart: mount und feed sind Pflicht.");

    var adapter = R.ChartAdapter.createChartAdapter({
      maxPoints: opts.maxPoints || 600,
      coalesceMs: opts.coalesceMs === undefined ? 250 : opts.coalesceMs
    });

    var badge = dataStatusBadge(feed.status());
    var canvas = el("div", { class: "vu-livechart__canvas" });
    var root = el("div", { class: "vu-livechart" }, [
      el("div", { class: "vu-livechart__head" }, [badge]),
      canvas
    ]);
    mount.appendChild(root);

    var flushTimer = null;

    function draw(op) {
      if (!op || !op.shouldRender) return;
      if (typeof opts.render === "function") { opts.render(op.bars, op, canvas); return; }
      if (!Charts) return;
      /* Das bestehende Chart-Modul zeichnet die ganze Flaeche. Der
         Adapter hat immerhin entschieden, dass es noetig ist - und ein
         unveraenderter Tick loest hier gar nichts mehr aus. Eine
         inkrementelle Zeichenfunktion kann spaeter ueber `render`
         hineingereicht werden, ohne dass sich sonst etwas aendert. */
      var svg = Charts.candlestickChart({
        bars: op.bars.map(toChartBar),
        width: opts.width || 720, height: opts.height || 320,
        title: opts.title || "Kursverlauf",
        description: opts.description || null
      });
      canvas.textContent = "";
      canvas.appendChild(svg);
    }

    function toChartBar(b) {
      return { date: b.date, timestamp: b.timestamp, open: b.open, high: b.high,
               low: b.low, close: b.close, volume: b.volume };
    }

    function sync(force) {
      /* Nur das Fenster, das gezeichnet wird - und die Zaehler, mit
         denen der Adapter einen unveraenderten Stand erkennt, ohne die
         Bars ueberhaupt anzusehen. */
      var ctx = typeof feed.renderContext === "function" ? feed.renderContext() : {};
      ctx.force = force === true;
      var fenster = function () {
        return typeof feed.tail === "function"
          ? feed.tail(opts.maxPoints || 600) : feed.bars();
      };
      var op = adapter.syncCoalesced(fenster, ctx);
      if (op.shouldRender) { draw(op); return op; }
      if (op.dueInMs && flushTimer === null) {
        flushTimer = global.setTimeout(function () {
          flushTimer = null;
          draw(adapter.flush());
        }, op.dueInMs);
      }
      return op;
    }

    var handle = {
      element: root,
      badge: badge,
      adapter: adapter,
      /** Vom Feed aufzurufen (onStatus) oder von Hand. */
      onStatus: function (status) {
        updateBadge(badge, status || feed.status());
        sync();
      },
      sync: sync,
      redraw: function () { adapter.invalidate(); sync(true); },
      destroy: function () {
        if (flushTimer !== null) { global.clearTimeout(flushTimer); flushTimer = null; }
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };

    sync(true);
    return handle;
  }

  global.VULiveChart = {
    dataStatusBadge: dataStatusBadge,
    updateBadge: updateBadge,
    attachLiveChart: attachLiveChart
  };
})(typeof window !== "undefined" ? window : globalThis);
