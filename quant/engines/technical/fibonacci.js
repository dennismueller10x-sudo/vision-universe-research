/* =========================================================================
   VISION UNIVERSE TECHNICAL — fibonacci.js
   FIBONACCI ENGINE — AUXILIARY

   Fibonacci ist geometrische Heuristik, kein Prognosemodell (Evidenz D/E).
   Vertretbar nur mit VORAB definierten, objektiv gewaehlten Ankern:
   bestaetigte Pivot-Paare der Anker-Skalen. Kein nachtraegliches
   Ausprobieren von Swing-Paaren, keine Auswahl "schoener" Treffer.

   Retracements 23.6 / 38.2 / 50 (Half-Retracement, keine Fibonacci-Zahl) /
   61.8 / 78.6. Extensions 100 / 127.2 / 161.8 / 261.8, projiziert vom
   Ende der Korrektur (naechster Pivot, bestaetigt oder developing).
   Cluster nur, wenn Level verschiedener Anker innerhalb einer ATR-Toleranz
   zusammentreffen. Fib darf Projektionszonen verstaerken, nie allein einen
   bullischen Score erzeugen (Familie PROJECTION_AUXILIARY, gekappt).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../hash.js") : global.VUHash;
  var C = isNode ? require("./engine-common.js") : global.VUTechnical.Common;

  var ENGINE_VERSION = "fib-1.0.0";
  var DEFAULTS = { retracements: [0.236, 0.382, 0.5, 0.618, 0.786], extensions: [1.0, 1.272, 1.618, 2.618], clusterToleranceAtr: 0.5, anchorScales: ["scale-2", "scale-3"] };

  /** Anker: letzter abgeschlossener Swing je Skala + laufender Swing. */
  function selectAnchors(pivots, cfg) {
    var anchors = [];
    cfg.anchorScales.forEach(function (sid) {
      var sc = pivots.scales[sid]; if (!sc) return;
      var pv = sc.pivots;
      if (pv.length >= 2) {
        var a = pv[pv.length - 2], b = pv[pv.length - 1];
        anchors.push({ anchorId: "fib_" + sid + "_" + a.pivotTime + "_" + b.pivotTime, scaleId: sid, status: "CONFIRMED",
                       from: { pivotId: a.pivotId, price: a.pivotPrice, time: a.pivotTime, index: a.pivotIndex },
                       to: { pivotId: b.pivotId, price: b.pivotPrice, time: b.pivotTime, index: b.pivotIndex },
                       next: sc.developing ? { pivotId: sc.developing.pivotId, price: sc.developing.pivotPrice, time: sc.developing.pivotTime, status: "DEVELOPING" } : null,
                       direction: b.pivotPrice > a.pivotPrice ? "UP" : "DOWN" });
      }
      if (pv.length >= 3) {
        /* Der vorherige abgeschlossene Swing mit bestaetigter Korrektur — fuer Extensions. */
        var a2 = pv[pv.length - 3], b2 = pv[pv.length - 2], c2 = pv[pv.length - 1];
        anchors.push({ anchorId: "fib_" + sid + "_" + a2.pivotTime + "_" + b2.pivotTime, scaleId: sid, status: "CONFIRMED",
                       from: { pivotId: a2.pivotId, price: a2.pivotPrice, time: a2.pivotTime, index: a2.pivotIndex },
                       to: { pivotId: b2.pivotId, price: b2.pivotPrice, time: b2.pivotTime, index: b2.pivotIndex },
                       next: { pivotId: c2.pivotId, price: c2.pivotPrice, time: c2.pivotTime, status: "CONFIRMED" },
                       direction: b2.pivotPrice > a2.pivotPrice ? "UP" : "DOWN" });
      }
    });
    return anchors;
  }

  function levelsFor(anchor, cfg) {
    var A = anchor.from.price, B = anchor.to.price, len = B - A, out = [];
    cfg.retracements.forEach(function (r) {
      out.push({ levelId: anchor.anchorId + "_r" + r, anchorId: anchor.anchorId, kind: "RETRACEMENT", ratio: r, price: C.round(B - len * r, 4),
                 scaleId: anchor.scaleId, status: anchor.status, direction: anchor.direction, label: (r * 100).toFixed(1).replace(/\.0$/, "") + " %" + (r === 0.5 ? " (half)" : "") });
    });
    if (anchor.next) {
      var origin = anchor.next.price;
      cfg.extensions.forEach(function (e) {
        out.push({ levelId: anchor.anchorId + "_x" + e, anchorId: anchor.anchorId, kind: "EXTENSION", ratio: e, price: C.round(origin + len * e, 4),
                   scaleId: anchor.scaleId, status: anchor.next.status === "CONFIRMED" ? anchor.status : "DEVELOPING", direction: anchor.direction, label: (e * 100).toFixed(1).replace(/\.0$/, "") + " %" });
      });
    }
    return out;
  }

  function clusterLevels(levels, atr, cfg) {
    var sorted = levels.slice().sort(function (a, b) { return a.price - b.price; });
    var tol = cfg.clusterToleranceAtr * atr, clusters = [], cur = null;
    sorted.forEach(function (l) {
      if (cur && l.price - cur.center <= tol) { cur.levels.push(l); cur.center = cur.levels.reduce(function (s, x) { return s + x.price; }, 0) / cur.levels.length; }
      else { cur = { levels: [l], center: l.price }; clusters.push(cur); }
    });
    return clusters.filter(function (cl) {
      var anchors = cl.levels.map(function (l) { return l.anchorId; }).filter(function (v, k, a) { return a.indexOf(v) === k; });
      return anchors.length >= 2;
    }).map(function (cl) {
      var prices = cl.levels.map(function (l) { return l.price; });
      return { clusterId: "fibc_" + Hash.hashValue(cl.levels.map(function (l) { return l.levelId; })).slice(0, 10),
               zoneLow: C.round(Math.min.apply(null, prices) - 0.25 * atr, 4), zoneHigh: C.round(Math.max.apply(null, prices) + 0.25 * atr, 4), center: C.round(cl.center, 4),
               sources: cl.levels.map(function (l) { return l.levelId; }), anchorCount: cl.levels.map(function (l) { return l.anchorId; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).length,
               status: cl.levels.every(function (l) { return l.status === "CONFIRMED"; }) ? "CONFIRMED" : "DEVELOPING", methodologyVersion: ENGINE_VERSION };
    });
  }

  function analyzeFibonacci(series, features, pivots, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    var i = series.length - 1, close = series.close[i], f = features.columns;
    var atr = C.isNum(f.atr[i]) ? f.atr[i] : close * 0.02;
    var anchors = selectAnchors(pivots, cfg);
    var levels = [];
    anchors.forEach(function (a) { levels = levels.concat(levelsFor(a, cfg)); });
    var clusters = clusterLevels(levels, atr, cfg);
    var ev = [];
    /* Hilfsaussage: liegt der Kurs im 38.2–61.8-Retracement des letzten Setup-Swings? */
    var primary = anchors.filter(function (a) { return a.scaleId === cfg.anchorScales[0] && !a.next || (a.next && a.next.status === "DEVELOPING"); })[0] || anchors[0] || null;
    var inPocket = false, retraceNow = null;
    if (primary) {
      var A = primary.from.price, B = primary.to.price;
      retraceNow = C.round((B - close) / (B - A), 3);
      inPocket = retraceNow >= 0.382 && retraceNow <= 0.618;
      /* AUDIT-FIX: Polaritaet folgt der Swing-Richtung — ein Retracement eines Abwaertsswings ist bearische Kontinuationslage. */
      ev.push(C.evidence(ENGINE_VERSION, "PROJECTION_AUXILIARY", "retracement", "Aktuelles Retracement des letzten " + primary.scaleId + "-Swings (" + primary.direction + "): " + C.round(retraceNow * 100, 1) + " %" + (inPocket ? " (38.2–61.8-Bereich)" : ""), retraceNow, inPocket ? (primary.direction === "UP" ? 1 : -1) : 0, 0.5));
    }
    clusters.slice(0, 3).forEach(function (cl) {
      ev.push(C.evidence(ENGINE_VERSION, "PROJECTION_AUXILIARY", cl.clusterId, "Fib-Cluster " + C.round(cl.zoneLow, 2) + "–" + C.round(cl.zoneHigh, 2) + " aus " + cl.anchorCount + " Ankern", cl.anchorCount, 0, 0.25));
    });
    return {
      engineVersion: ENGINE_VERSION, repaintingPolicy: "CONFIRMS_WITH_DELAY", family: "PROJECTION_AUXILIARY", role: "AUXILIARY",
      parametersHash: Hash.hashValue({ v: ENGINE_VERSION, cfg: cfg }),
      anchors: anchors, levels: levels, clusters: clusters, currentRetracement: retraceNow, inRetracementPocket: inPocket,
      value: inPocket ? (primary.direction === "UP" ? 0.3 : -0.3) : 0, evidence: ev, asOfIndex: i, asOf: series.timestamps[i]
    };
  }

  var api = { ENGINE_VERSION: ENGINE_VERSION, DEFAULTS: DEFAULTS, selectAnchors: selectAnchors, levelsFor: levelsFor, clusterLevels: clusterLevels, analyzeFibonacci: analyzeFibonacci };
  if (isNode) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.Fibonacci = api; }
})(typeof window !== "undefined" ? window : globalThis);
