/* =========================================================================
   VISION UNIVERSE — panel-builder.js   (Phase 4A, §18, §19, §21, §23)

   Die Bruecke zwischen echten Kursdaten und den bestehenden Engines.

   Der Quant-Bereich rechnet auf einem Panel: typisierte Arrays je Titel,
   ein gemeinsamer Handelstagskalender, ein Index von Datum auf Position.
   Diese Form ist nicht willkuerlich - Cross-Sectional-Auswertungen ueber
   hunderte Titel und zwanzig Jahre lassen sich anders nicht sinnvoll
   rechnen.

   Das Entscheidende an diesem Modul ist, was es NICHT tut: es rechnet
   keine Kennzahl. Momentum, Volatilitaet, gleitende Durchschnitte und
   Drawdowns entstehen weiterhin in factors.js, unveraendert, aus demselben
   Code wie fuer das Modelluniversum. Hier wird nur die Form angeglichen.

   Damit beantwortet sich §19: Tiingo wird keine neue technische Dateninsel.
   Es wird eine zweite Quelle fuer dieselbe Form - und jede Engine, die
   heute mit dem Modelluniversum laeuft, laeuft morgen mit echten Kursen,
   ohne dass jemand sie anfasst.

   Die Bereinigungsstufe wandert mit. Eine Reihe, deren Stufe nicht
   ausreicht, wird nicht stillschweigend in adjustedClose geschrieben -
   sie wird abgelehnt, und der Aufrufer erfaehrt warum.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Semantics = isNode ? require("./price-semantics.js") : global.VUPriceSemantics;

  /**
   * Baut ein Panel aus gespeicherten Kursreihen.
   *
   * @param {Array} serieses  [{securityId, bars, adjustmentStatus, ...}]
   * @param {object} options  {benchmarkId, requireLevel, metric}
   *
   * `requireLevel` ist der Kern: welche Bereinigungsstufe braucht die
   * Auswertung, fuer die das Panel gedacht ist? Reihen darunter kommen
   * nicht hinein, und der Bericht sagt, welche und warum.
   */
  function buildPanel(serieses, options) {
    options = options || {};
    var metric = options.metric || "momentum";
    var requireLevel = options.requireLevel || null;

    var accepted = [];
    var rejected = [];

    (serieses || []).forEach(function (s) {
      if (!s || !Array.isArray(s.bars) || !s.bars.length) {
        rejected.push({ securityId: s && s.securityId, reason: "noBars",
                        message: "Keine Kursdaten." });
        return;
      }
      var level = Semantics.normalize(s.adjustmentStatus);
      var check = requireLevel
        ? { allowed: Semantics.rank(level) >= Semantics.rank(requireLevel),
            message: "Die Reihe ist " + Semantics.label(level) + "; verlangt ist mindestens " +
                     Semantics.label(requireLevel) + "." }
        : Semantics.check(metric, level);

      if (!check.allowed) {
        rejected.push({ securityId: s.securityId, reason: "insufficientAdjustment",
                        level: level, message: check.message });
        return;
      }
      accepted.push({ series: s, level: level });
    });

    if (!accepted.length) {
      return { ok: false, reason: "noUsableSeries", panel: null, accepted: [], rejected: rejected,
               message: "Keine der " + (serieses || []).length + " Reihen erfuellt die " +
                        "Anforderungen. Ein Panel aus Reihen unbekannter Bereinigung waere " +
                        "kein unvollstaendiges Ergebnis, sondern ein falsches." };
    }

    /* Der gemeinsame Handelstagskalender: die Vereinigung aller Datumswerte.
       Eine Schnittmenge waere falsch - ein Titel, der spaeter an die Boerse
       kam, wuerde alle anderen verkuerzen. */
    var dayset = Object.create(null);
    accepted.forEach(function (a) {
      a.series.bars.forEach(function (b) { dayset[b.date] = true; });
    });
    var tradingDays = Object.keys(dayset).sort();
    var dayIndex = Object.create(null);
    tradingDays.forEach(function (d, i) { dayIndex[d] = i; });

    var n = tradingDays.length;
    var series = Object.create(null);
    var volumes = Object.create(null);

    accepted.forEach(function (a) {
      var bars = a.series.bars;
      var close = new Float32Array(n);
      var adjusted = new Float32Array(n);
      var volume = new Float64Array(n);

      var startIndex = dayIndex[bars[0].date];
      var endIndex = dayIndex[bars[bars.length - 1].date];

      /* Luecken werden mit dem letzten bekannten Kurs gefuellt - ein Titel,
         der an einem Tag nicht gehandelt wurde, hat an dem Tag keinen neuen
         Kurs, aber sehr wohl einen Wert. Eine Null waere ein Kurssturz auf
         null und wuerde jede Kennzahl zerstoeren. */
      var lastClose = 0, lastAdj = 0;
      var byDate = Object.create(null);
      bars.forEach(function (b) { byDate[b.date] = b; });

      for (var i = startIndex; i <= endIndex; i++) {
        var bar = byDate[tradingDays[i]];
        if (bar) {
          lastClose = bar.close;
          /* Welcher Wert traegt die bereinigte Reihe? Bei bestaetigter
             Total-Return-Bereinigung adjustedClose, sonst der beste
             verfuegbare - und die Stufe faehrt im Panel mit, damit niemand
             hinterher raten muss. */
          lastAdj = (bar.adjustedClose !== null && bar.adjustedClose !== undefined)
            ? bar.adjustedClose : bar.close;
          volume[i] = bar.volume || 0;
        }
        close[i] = lastClose;
        adjusted[i] = lastAdj;
      }

      series[a.series.securityId] = {
        close: close, adjustedClose: adjusted,
        startIndex: startIndex, endIndex: endIndex
      };
      volumes[a.series.securityId] = volume;
    });

    /* Die Vergleichsgroesse. Ohne sie laesst sich keine relative Staerke und
       kein Beta rechnen; die Engine erwartet sie, also muss sie da sein. */
    var benchmarkId = options.benchmarkId || null;
    var benchmark = { benchmarkId: benchmarkId, level: new Float32Array(n) };
    if (benchmarkId && series[benchmarkId]) {
      benchmark.level = series[benchmarkId].adjustedClose;
    } else {
      /* Gleichgewichteter Durchschnitt der vorhandenen Reihen. Kein echter
         Index, aber eine ehrliche Naeherung - und sie ist als solche
         gekennzeichnet. */
      var ids = Object.keys(series);
      for (var t = 0; t < n; t++) {
        var sum = 0, count = 0;
        for (var k = 0; k < ids.length; k++) {
          var sr = series[ids[k]];
          if (t >= sr.startIndex && t <= sr.endIndex && sr.adjustedClose[t] > 0) {
            sum += sr.adjustedClose[t] / sr.adjustedClose[sr.startIndex];
            count++;
          }
        }
        benchmark.level[t] = count ? (sum / count) * 100 : (t > 0 ? benchmark.level[t - 1] : 100);
      }
      benchmark.benchmarkId = "EQUAL_WEIGHTED_SYNTHETIC";
      benchmark.synthetic = true;
      benchmark.note = "Gleichgewichteter Durchschnitt der geladenen Titel. Kein Index - " +
                       "eine Naeherung, damit relative Kennzahlen ueberhaupt rechenbar sind.";
    }

    var levels = accepted.map(function (a) { return a.level; });
    var lowest = levels.reduce(function (lo, l) {
      return Semantics.rank(l) < Semantics.rank(lo) ? l : lo;
    }, levels[0]);

    return {
      ok: true,
      panel: {
        tradingDays: tradingDays,
        dayIndex: dayIndex,
        series: series,
        benchmark: benchmark,
        volumeAt: function (securityId, t) {
          var v = volumes[securityId];
          return v && t >= 0 && t < v.length ? v[t] : 0;
        },
        /* Die Engine fragt danach fuer Liquiditaetsgrenzen. Ohne echte
           Aktienzahl gibt es keine ehrliche Antwort - null ist besser als
           eine erfundene Zahl, und die Engine kommt damit zurecht. */
        sharesAtIndex: function () { return null; }
      },
      accepted: accepted.map(function (a) {
        return { securityId: a.series.securityId, level: a.level,
                 bars: a.series.bars.length,
                 first: a.series.bars[0].date,
                 last: a.series.bars[a.series.bars.length - 1].date };
      }),
      rejected: rejected,
      adjustmentStatus: lowest,
      /* Die Stufe des Panels ist die NIEDRIGSTE seiner Reihen. Ein Panel
         ist nur so belastbar wie sein schwaechstes Glied - eine Auswertung
         ueber alle Titel kann nicht besser sein als die schlechteste Reihe,
         die eingeht. */
      note: "Panelstufe ist die niedrigste enthaltene Reihe (" + lowest + ").",
      tradingDayCount: n
    };
  }

  var api = { buildPanel: buildPanel };

  if (isNode) module.exports = api;
  else global.VUPanelBuilder = api;
})(typeof window !== "undefined" ? window : globalThis);
