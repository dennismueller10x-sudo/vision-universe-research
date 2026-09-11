/* =========================================================================
   VISION UNIVERSE DISCOVER — narrative.js

   "Warum sehe ich diese Aktie?"

   Die Antwort auf der Detailseite soll ein Satz sein, kein Kennzahlenblock.
   Sie entsteht hier - und zwar ausschliesslich aus den bereits gerechneten
   Kennzahlen, ueber feste Schwellen, in fester Reihenfolge.

   WAS DIESES MODUL AUSDRUECKLICH NICHT IST

   Es ist kein Textgenerator und kein Sprachmodell. Es gibt keinen Satz, der
   nicht aus einer Zahl folgt, und keine Zahl, die nicht ausgeliefert wurde.
   Eine erfundene Begruendung waere in einem Investment-Produkt der
   teuerste Fehler von allen: sie liest sich wie eine Analyse.

   Jeder Befund traegt deshalb die Kennzahl mit, aus der er entsteht -
   die Oberflaeche kann beides zeigen, und wer nachrechnen will, findet
   den Wert daneben.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var ENGINE_VERSION = "discover-narrative-1.0.0";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function pct(v, digits) {
    if (!isNum(v)) return "–";
    var scaled = v * 100;
    var d = digits === undefined ? (Math.abs(scaled) < 1 ? 2 : 1) : digits;
    return (scaled >= 0 ? "+" : "") + scaled.toFixed(d) + " %";
  }

  /* Die Befunde in der Reihenfolge, in der sie geprueft werden. Der erste
     zutreffende traegt die Ueberschrift, die uebrigen die Belegliste. */
  var RULES = [
    {
      id: "new52WeekHigh",
      when: function (s) { return s.signals.new52WeekHigh === true; },
      title: "Neues 52-Wochen-Hoch",
      text: function (s) {
        return s.high52w && s.high52w.closeAtHigh
          ? "Der Schlusskurs liegt auf dem höchsten Stand der vergangenen 52 Wochen."
          : "Das Tageshoch hat das Jahresmaximum erreicht; der Schlusskurs liegt " +
            pct(s.metrics.distanceTo52wHigh) + " darunter.";
      },
      metric: "distanceTo52wHigh"
    },
    {
      id: "marketLeader",
      when: function (s) { return s.signals.marketLeader === true; },
      title: "Marktführerschaft",
      text: function (s) {
        return "Der Leadership Score von " + Math.round(s.metrics.leadershipScore) +
               " liegt im Perzentil " + Math.round(s.metrics.leadershipPercentile) +
               " des Universums.";
      },
      metric: "leadershipScore"
    },
    {
      id: "breakout",
      when: function (s) { return s.signals.breakout === true; },
      title: "Ausbruch mit Volumen",
      text: function (s) {
        var spike = s.rawValues && s.rawValues.volumeSpikeRatio;
        return "Das Handelsvolumen liegt bei " + (isNum(spike) ? spike.toFixed(1) + "x" : "über dem") +
               " des 20-Tage-Schnitts, der Kurs über SMA 20 und SMA 50.";
      },
      metric: "volumeSpikeRatio"
    },
    {
      id: "relativeStrengthLeader",
      when: function (s) { return s.signals.relativeStrengthLeader === true; },
      title: "Relative Stärke",
      text: function (s) {
        return "Über zwölf Monate liegt der Titel " + pct(s.metrics.relativeStrength12M) +
               " vor der Benchmark.";
      },
      metric: "relativeStrength12M"
    },
    {
      id: "momentumLeader",
      when: function (s) { return s.signals.momentumLeader === true; },
      title: "Momentum",
      text: function (s) {
        return "Über drei, sechs und zwölf Monate gehört die Kursdynamik zu den " +
               "stärksten des Universums (Score " + Math.round(s.metrics.momentumScore) + ").";
      },
      metric: "momentumScore"
    },
    {
      id: "trendIntact",
      when: function (s) { return s.signals.trendIntact === true; },
      title: "Trendstruktur",
      text: function () {
        return "Der Kurs liegt über allen vier gleitenden Durchschnitten (20, 50, 100, 200).";
      },
      metric: "trendAlignment"
    },
    {
      id: "sectorLeader",
      when: function (s) { return s.signals.sectorLeader === true && s.sectorRank; },
      title: "Sektorführer",
      text: function (s) {
        return "Rang " + s.sectorRank.rank + " von " + s.sectorRank.of + " in " +
               s.sectorRank.sector + ".";
      },
      metric: "leadershipScore"
    }
  ];

  /* Was gegen den Titel spricht. Ohne diesen Teil waere die Seite eine
     Werbeflaeche: jede Kennzahl, die das Bild stoert, gehoert daneben. */
  var COUNTER_RULES = [
    {
      id: "deepDrawdown",
      when: function (s) { return isNum(s.metrics.maxDrawdown252d) && s.metrics.maxDrawdown252d <= -0.25; },
      title: "Rückschlagstiefe",
      text: function (s) {
        return "Der größte Rückgang der letzten 252 Handelstage betrug " +
               pct(s.metrics.maxDrawdown252d) + ".";
      },
      metric: "maxDrawdown252d"
    },
    {
      id: "highVolatility",
      when: function (s) { return isNum(s.metrics.volatility252d) && s.metrics.volatility252d >= 0.45; },
      title: "Schwankungsbreite",
      text: function (s) {
        return "Die Jahresvolatilität liegt bei " + pct(s.metrics.volatility252d, 0) + ".";
      },
      metric: "volatility252d"
    },
    {
      id: "farFromHigh",
      when: function (s) { return isNum(s.metrics.distanceTo52wHigh) && s.metrics.distanceTo52wHigh <= -0.20; },
      title: "Abstand zum Jahreshoch",
      text: function (s) {
        return "Der Kurs steht " + pct(s.metrics.distanceTo52wHigh) + " unter dem 52-Wochen-Hoch.";
      },
      metric: "distanceTo52wHigh"
    },
    {
      id: "fadingMomentum",
      when: function (s) {
        return isNum(s.metrics.momentumAcceleration) && s.metrics.momentumAcceleration <= -0.05;
      },
      title: "Nachlassende Dynamik",
      text: function (s) {
        return "Die Kursdynamik hat zuletzt nachgelassen (Beschleunigung " +
               pct(s.metrics.momentumAcceleration) + ").";
      },
      metric: "momentumAcceleration"
    },
    {
      id: "dataQuality",
      when: function (s) { return s.dataQuality === "WARNING"; },
      title: "Datenqualität",
      text: function (s) {
        return "Die Kursreihe trägt einen Qualitätshinweis der Faktorenengine" +
               (s.dataQualityReason ? " (" + String(s.dataQualityReason).replace(/_/g, " ") + ")" : "") + ".";
      },
      metric: null
    }
  ];

  /**
   * @param {object} stock Discover-Detail oder -Card (mit metrics, signals)
   * @returns {object} {engineVersion, headline, reasons[], counterpoints[], empty}
   */
  function explain(stock) {
    stock = stock || {};
    stock.metrics = stock.metrics || {};
    stock.signals = stock.signals || {};

    var reasons = [];
    RULES.forEach(function (rule) {
      var trifft;
      try { trifft = rule.when(stock); } catch (err) { trifft = false; }
      if (!trifft) return;
      /* Ein Befund ohne seine Kennzahl waere eine Behauptung. */
      if (rule.metric && !isNum(stock.metrics[rule.metric]) &&
          !(stock.rawValues && isNum(stock.rawValues[rule.metric]))) return;
      reasons.push({
        id: rule.id, title: rule.title, text: rule.text(stock),
        metric: rule.metric,
        value: rule.metric ? (isNum(stock.metrics[rule.metric]) ? stock.metrics[rule.metric]
                              : (stock.rawValues ? stock.rawValues[rule.metric] : null)) : null
      });
    });

    var counterpoints = [];
    COUNTER_RULES.forEach(function (rule) {
      var trifft;
      try { trifft = rule.when(stock); } catch (err) { trifft = false; }
      if (!trifft) return;
      counterpoints.push({ id: rule.id, title: rule.title, text: rule.text(stock),
                           metric: rule.metric,
                           value: rule.metric ? stock.metrics[rule.metric] : null });
    });

    return {
      engineVersion: ENGINE_VERSION,
      headline: reasons.length ? reasons[0] : null,
      reasons: reasons,
      counterpoints: counterpoints,
      empty: reasons.length === 0,
      emptyMessage: reasons.length === 0
        ? "Für diesen Titel liegt derzeit kein Discovery-Signal vor. Die Kennzahlen " +
          "darunter gelten trotzdem - sie sind der Grund, warum er suchbar ist, und nicht, " +
          "warum er auf der Startseite stünde."
        : null
    };
  }

  /** Eine Zeile fuer die Karte: das staerkste Signal in wenigen Worten. */
  function shortReason(stock) {
    var result = explain(stock);
    return result.headline ? result.headline.title : null;
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION, RULES: RULES, COUNTER_RULES: COUNTER_RULES,
    explain: explain, shortReason: shortReason
  };

  if (isNode) module.exports = api;
  else {
    global.VUDiscover = global.VUDiscover || {};
    global.VUDiscover.Narrative = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
