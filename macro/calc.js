/* =========================================================================
   VISION UNIVERSE MACRO INTELLIGENCE — Berechnungslogik (calc.js)

   Reine Berechnungsschicht, komplett getrennt von UI (app.js) und Daten
   (data/*.json). Nimmt Rohwerte (currentValue, previousValue,
   threeMonthsAgo, sixMonthsAgo, oneYearAgo) je Indikator entgegen und
   leitet daraus ab: direction, momentum, acceleration, signal, score.

   Leitprinzip (siehe PLAYBOOK): nicht nur der Level eines Indikators
   zaehlt, sondern Trend, Veraenderungsrate und Beschleunigung.
   ========================================================================= */
(function (global) {
  "use strict";

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

  // Relative Toleranz, ab wann eine Bewegung ueberhaupt als "up"/"down"
  // statt "flat" gilt. Ein Floor von 1 verhindert Division-Artefakte bei
  // Spreads/Indizes, die nahe 0 oszillieren (z.B. 10Y-2Y-Spread).
  function epsilon(reference, cfg) {
    var base = Math.max(Math.abs(reference || 0), 1);
    return (cfg.flatEpsilonPct != null ? cfg.flatEpsilonPct : 0.02) * base;
  }

  function directionOf(current, reference, cfg) {
    if (!isNum(current) || !isNum(reference)) return "unknown";
    var diff = current - reference;
    var eps = epsilon(reference, cfg);
    if (diff > eps) return "up";
    if (diff < -eps) return "down";
    return "flat";
  }

  function momentumFromDirection(direction, higherIsBetter) {
    if (direction === "unknown") return "unknown";
    if (direction === "flat") return "neutral";
    var isUp = direction === "up";
    var favorable = higherIsBetter ? isUp : !isUp;
    return favorable ? "positive" : "negative";
  }

  // acceleration: vergleicht das juengste Veraenderungstempo mit dem
  // vorherigen Tempo. "reversing" hat Vorrang, weil ein Vorzeichenwechsel
  // der eigentliche Wendepunkt ist (siehe detectInflections).
  function accelerationOf(ind) {
    var recentPace = null, priorPace = null;
    if (isNum(ind.currentValue) && isNum(ind.previousValue)) {
      recentPace = ind.currentValue - ind.previousValue;
    } else if (isNum(ind.currentValue) && isNum(ind.threeMonthsAgo)) {
      recentPace = ind.currentValue - ind.threeMonthsAgo;
    }
    if (isNum(ind.previousValue) && isNum(ind.threeMonthsAgo)) {
      priorPace = ind.previousValue - ind.threeMonthsAgo;
    } else if (isNum(ind.threeMonthsAgo) && isNum(ind.sixMonthsAgo)) {
      priorPace = ind.threeMonthsAgo - ind.sixMonthsAgo;
    }
    if (recentPace == null || priorPace == null) return "unknown";
    // Wenn zwei Referenzpunkte aus Datenluecken heraus denselben Wert
    // tragen (z.B. "previousValue" und "threeMonthsAgo" verweisen mangels
    // besserer Quelle auf dieselbe Meldung), ist priorPace ~0 rein durch
    // Datenlage bedingt, nicht durch echten Stillstand. Ein winziges
    // recentPace dagegen faelschlich als "Beschleunigung" zu werten, waere
    // ein Artefakt. Floor = 0.5% der Groessenordnung des aktuellen Werts.
    var scale = Math.max(Math.abs(ind.currentValue) || 0, 1);
    var paceFloor = scale * 0.005;
    if (Math.abs(recentPace) < paceFloor && Math.abs(priorPace) < paceFloor) return "stable";
    if (Math.abs(priorPace) < paceFloor) return "unknown";
    if (sign(recentPace) !== sign(priorPace) && recentPace !== 0 && priorPace !== 0) return "reversing";
    var a = Math.abs(recentPace), b = Math.abs(priorPace);
    if (a > b * 1.05) return "accelerating";
    if (a < b * 0.95) return "decelerating";
    return "stable";
  }

  // Score 0-100: 50 = neutral. Verschiebungen kommen aus drei Quellen:
  // aktuelle Richtung (Level-Momentum), Beschleunigung, und der 1-Jahres-
  // Vergleich (laenger laufender Trend). Bewusst additiv & nachvollziehbar
  // statt einer Blackbox-Formel.
  function scoreIndicator(ind, higherIsBetter, cfg) {
    var reference = isNum(ind.threeMonthsAgo) ? ind.threeMonthsAgo : ind.previousValue;
    var direction = directionOf(ind.currentValue, reference, cfg);
    var momentum = momentumFromDirection(direction, higherIsBetter);
    var acceleration = accelerationOf(ind);

    var score = 50;
    if (momentum === "positive") score += 20;
    else if (momentum === "negative") score -= 20;

    if (acceleration === "accelerating") {
      score += momentum === "positive" ? 15 : momentum === "negative" ? -15 : 0;
    } else if (acceleration === "decelerating") {
      score += momentum === "negative" ? 10 : momentum === "positive" ? -8 : 0;
    } else if (acceleration === "reversing") {
      score += momentum === "positive" ? 12 : momentum === "negative" ? -12 : 0;
    }

    if (isNum(ind.oneYearAgo)) {
      var yoyDirection = directionOf(ind.currentValue, ind.oneYearAgo, cfg);
      var yoyMomentum = momentumFromDirection(yoyDirection, higherIsBetter);
      score += yoyMomentum === "positive" ? 8 : yoyMomentum === "negative" ? -8 : 0;
    }

    return {
      direction: direction,
      momentum: momentum,
      acceleration: acceleration,
      signal: momentum,
      score: clamp(Math.round(score), 0, 100)
    };
  }

  function bandLookup(bands, value) {
    if (!isNum(value)) return null;
    for (var i = 0; i < bands.length; i++) {
      if (value >= bands[i].min && value <= bands[i].max) return bands[i];
    }
    return bands[bands.length - 1] || null;
  }

  function aggregateCategory(scoredById, memberIds) {
    var scores = memberIds.map(function (id) { return scoredById[id]; }).filter(function (s) { return s && isNum(s.score); });
    if (!scores.length) return { score: null, coverage: 0, memberCount: memberIds.length };
    var sum = scores.reduce(function (a, s) { return a + s.score; }, 0);
    return {
      score: Math.round(sum / scores.length),
      coverage: scores.length,
      memberCount: memberIds.length
    };
  }

  function computeRegime(categoryScores, weights, bands) {
    var total = 0, weightUsed = 0;
    Object.keys(weights).forEach(function (key) {
      var cat = categoryScores[key];
      if (cat && isNum(cat.score)) {
        total += cat.score * weights[key];
        weightUsed += weights[key];
      }
    });
    if (weightUsed === 0) return { score: null, label: "N/V", tone: "neutral" };
    var score = Math.round(total / weightUsed);
    var band = bandLookup(bands, score);
    return { score: score, label: band ? band.label : "N/V", tone: band ? band.tone : "neutral" };
  }

  function statusLabel(bands, score) {
    var band = bandLookup(bands, score);
    return band ? band.label : "N/V";
  }

  // ---- Zinsstrukturkurve: differenzierte Regime-Klassifikation ---------
  function yieldCurveRegime(spread10y2y, t2y, t10y, cfg) {
    if (!spread10y2y || !isNum(spread10y2y.currentValue)) {
      return { regime: "UNBEKANNT", isReSteepeningAfterInversion: false };
    }
    var cur = spread10y2y.currentValue;
    var ref3 = spread10y2y.threeMonthsAgo;
    var wasInvertedRecently = [spread10y2y.threeMonthsAgo, spread10y2y.sixMonthsAgo, spread10y2y.oneYearAgo]
      .some(function (v) { return isNum(v) && v < 0; });
    var changeVs3m = (isNum(cur) && isNum(ref3)) ? cur - ref3 : null;
    var steepThreshold = (cfg.curveSteepeningBp || 25) / 100;
    var regime;

    if (cur < -0.10) {
      regime = (changeVs3m != null && changeVs3m < -0.05) ? "DEEP INVERSION (VERTIEFEND)" : "DEEP INVERSION";
    } else if (cur < 0) {
      regime = (changeVs3m != null && changeVs3m > 0.05) ? "INVERSION (FLACHT AB)" : "INVERSION";
    } else if (wasInvertedRecently) {
      regime = "RE-STEEPENING NACH INVERSION";
    } else if (changeVs3m != null && changeVs3m > steepThreshold) {
      var d2 = (t2y && isNum(t2y.currentValue) && isNum(t2y.threeMonthsAgo)) ? t2y.currentValue - t2y.threeMonthsAgo : null;
      var d10 = (t10y && isNum(t10y.currentValue) && isNum(t10y.threeMonthsAgo)) ? t10y.currentValue - t10y.threeMonthsAgo : null;
      if (d2 != null && d2 < 0) regime = "BULL STEEPENING";
      else if (d10 != null && d10 > 0) regime = "BEAR STEEPENING";
      else regime = "STEEPENING";
    } else if (changeVs3m != null && changeVs3m < -steepThreshold) {
      regime = "FLATTENING";
    } else {
      regime = "NORMALISIERUNG";
    }
    return { regime: regime, isReSteepeningAfterInversion: regime === "RE-STEEPENING NACH INVERSION" };
  }

  // ---- Fed Flexibility: abgeleitet aus Inflationsniveau + Richtung ------
  function fedFlexibility(inflationScore, cfg) {
    var band = bandLookup(cfg.fedFlexibilityBands, inflationScore);
    return band ? band.label : "N/V";
  }

  // ---- Macro Inflection Points: regelbasierte Wendepunkt-Erkennung ------
  function fmt1(v) { return isNum(v) ? v.toFixed(1) : "n/v"; }
  function bp(v) { return isNum(v) ? Math.round(v * 100) : null; }

  // Eigenstaendige Vorzeichen-Wende-Erkennung fuer "war fallend, dreht auf
  // steigend" (und umgekehrt) — bewusst getrennt von accelerationOf(), weil
  // dort recentPace/priorPace je nach Datenlage aus unterschiedlich langen
  // Teilstuecken bestehen koennen. Hier vergleichen wir gezielt die
  // laengerfristige Vorbewegung (3M ggue. 6M/1J) mit der juengsten Bewegung
  // (aktuell ggue. Vormonat/3M), damit ein einzelner Ausreisser nicht als
  // "Trendwende" fehlinterpretiert wird.
  function paceFlip(ind) {
    var recentPace = null, pastPace = null;
    if (isNum(ind.currentValue) && isNum(ind.previousValue)) recentPace = ind.currentValue - ind.previousValue;
    else if (isNum(ind.currentValue) && isNum(ind.threeMonthsAgo)) recentPace = ind.currentValue - ind.threeMonthsAgo;

    if (isNum(ind.threeMonthsAgo) && isNum(ind.sixMonthsAgo)) pastPace = ind.threeMonthsAgo - ind.sixMonthsAgo;
    else if (isNum(ind.threeMonthsAgo) && isNum(ind.oneYearAgo)) pastPace = ind.threeMonthsAgo - ind.oneYearAgo;
    else if (isNum(ind.sixMonthsAgo) && isNum(ind.oneYearAgo)) pastPace = ind.sixMonthsAgo - ind.oneYearAgo;

    if (recentPace == null || pastPace == null || recentPace === 0 || pastPace === 0) {
      return { flipped: false, recentPace: recentPace, pastPace: pastPace };
    }
    return { flipped: sign(recentPace) !== sign(pastPace), recentPace: recentPace, pastPace: pastPace };
  }

  function detectInflections(raw, scoredById, cfg) {
    var out = [];
    var rules = cfg.inflectionRules || {};

    function push(id, category, title, description, severity, direction) {
      out.push({ id: id, category: category, title: title, description: description, severity: severity, direction: direction });
    }

    // 1. M2-Wachstum dreht von fallend auf steigend (oder umgekehrt)
    var m2 = raw.m2_yoy;
    if (m2) {
      var m2Flip = paceFlip(m2);
      if (m2Flip.flipped) {
        var m2ToRising = m2Flip.recentPace > 0;
        push("m2_yoy", "liquidity", m2ToRising ? "LIQUIDITÄT DREHT NACH OBEN" : "LIQUIDITÄT DREHT NACH UNTEN",
          "M2-Wachstum wechselt die Richtung: " + [m2.oneYearAgo, m2.sixMonthsAgo, m2.threeMonthsAgo, m2.previousValue, m2.currentValue].filter(isNum).map(fmt1).join("% → ") + "%.",
          "high", m2ToRising ? "positive" : "negative");
      }
    }

    // 2. Inflation faellt mehrere Perioden in Folge (jüngste 3 verfügbare
    // Messpunkte bis heute — bewusst NICHT die vollen 12 Monate, da ein
    // aelterer Ausschlag sonst eine aktuelle Abkuehlung verdecken wuerde).
    ["core_pce_yoy", "cpi_yoy"].some(function (candId) {
      var candInd = raw[candId];
      if (!candInd) return false;
      var seq = [candInd.threeMonthsAgo, candInd.previousValue, candInd.currentValue];
      if (!seq.every(isNum)) return false;
      var strictlyDecreasing = seq[0] > seq[1] && seq[1] > seq[2];
      var strictlyIncreasing = seq[0] < seq[1] && seq[1] < seq[2];
      if (strictlyDecreasing) {
        push(candId, "inflation", "INFLATION KÜHLT AB",
          (candId === "core_pce_yoy" ? "Kern-PCE" : "CPI") + " fällt über die letzten drei verfügbaren Messzeiträume: " + seq.map(fmt1).join("% → ") + "%. Das erweitert tendenziell den Handlungsspielraum der Fed.",
          "medium", "positive");
        return true;
      }
      if (strictlyIncreasing) {
        push(candId, "inflation", "INFLATION BESCHLEUNIGT",
          (candId === "core_pce_yoy" ? "Kern-PCE" : "CPI") + " steigt über die letzten drei verfügbaren Messzeiträume: " + seq.map(fmt1).join("% → ") + "%. Das schränkt den Handlungsspielraum der Fed tendenziell ein.",
          "medium", "negative");
        return true;
      }
      return false;
    });

    // 3. Arbeitslosenquote steigt beschleunigt
    var ur = raw.unemployment_rate, urs = scoredById.unemployment_rate;
    if (ur && urs && urs.acceleration === "accelerating" && urs.momentum === "negative") {
      push("unemployment_rate", "labor", "ARBEITSMARKT KIPPT",
        "Arbeitslosenquote steigt beschleunigt: " + fmt1(ur.sixMonthsAgo) + "% (vor 6M) → " + fmt1(ur.previousValue) + "% (Vormonat) → " + fmt1(ur.currentValue) + "% (aktuell).",
        "high", "negative");
    }

    // 4. Jobless Claims drehen
    var ic = raw.initial_claims;
    if (ic) {
      var icFlip = paceFlip(ic);
      if (icFlip.flipped) {
        var icRising = icFlip.recentPace > 0;
        push("initial_claims", "labor", "JOBLESS CLAIMS DREHEN",
          "Erstanträge auf Arbeitslosenhilfe drehen die Richtung: " + [ic.threeMonthsAgo, ic.previousValue, ic.currentValue].filter(isNum).map(fmt1).join("K → ") + "K. Claims drehen oft frueher als die Arbeitslosenquote.",
          icRising ? "high" : "medium", icRising ? "negative" : "positive");
      }
    }

    // 5. High-Yield-Spreads brechen aus
    var hy = raw.hy_oas;
    if (hy && isNum(hy.currentValue) && isNum(hy.threeMonthsAgo)) {
      var hyMoveBp = bp(hy.currentValue - hy.threeMonthsAgo);
      if (hyMoveBp >= (rules.hySpreadBreakoutBp || 75)) {
        push("hy_oas", "credit", "CREDIT-SPREADS BRECHEN AUS",
          "High-Yield-OAS weitet sich um " + hyMoveBp + " Bp gegenüber vor 3 Monaten (" + fmt1(hy.threeMonthsAgo) + "% → " + fmt1(hy.currentValue) + "%). Der Kreditmarkt beginnt, Stress einzupreisen.",
          "high", "negative");
      }
    }

    // 6. Real Yields steigen stark
    var ry = raw.real_yield_10y;
    if (ry && isNum(ry.currentValue) && isNum(ry.threeMonthsAgo)) {
      var ryMoveBp = bp(ry.currentValue - ry.threeMonthsAgo);
      if (ryMoveBp >= (rules.realYieldSurgeBp || 40)) {
        push("real_yield_10y", "rates", "REAL YIELDS SPRINGEN AN",
          "10J-Realrendite steigt um " + ryMoveBp + " Bp gegenüber vor 3 Monaten (" + fmt1(ry.threeMonthsAgo) + "% → " + fmt1(ry.currentValue) + "%). Steigt der Diskontsatz, geraten Long-Duration-Assets unter Druck.",
          "medium", "negative");
      }
    }

    // 7. Yield Curve re-steepened nach Inversion
    var curve = yieldCurveRegime(raw.spread_10y2y, raw.treasury_2y, raw.treasury_10y, rules);
    if (curve.isReSteepeningAfterInversion) {
      push("spread_10y2y", "rates", "ZINSKURVE RE-STEEPENED NACH INVERSION",
        "Die 10J-2J-Spread ist nach vorheriger Inversion wieder positiv (" + fmt1(raw.spread_10y2y.currentValue) + " Pp). Historisch markiert ein Re-Steepening nach langer Inversion häufig die Naehe zu einem Konjunkturwendepunkt.",
        "high", "neutral");
    }

    // 8. Financial Conditions verschärfen sich ploetzlich
    var fc = raw.nfci, fcs = scoredById.nfci;
    if (fc && fcs && fcs.acceleration === "accelerating" && fcs.momentum === "negative") {
      push("nfci", "financialConditions", "FINANCIAL CONDITIONS VERSCHÄRFEN SICH",
        "Der Chicago Fed NFCI verschlechtert sich beschleunigt: " + fmt1(fc.threeMonthsAgo) + " (vor 3M) → " + fmt1(fc.previousValue) + " (Vormonat) → " + fmt1(fc.currentValue) + " (aktuell). Positive Werte = straffer als im Durchschnitt.",
        "high", "negative");
    }

    // 9. Industrieproduktion dreht von Kontraktion zu Expansion (oder umgekehrt)
    var ip = raw.industrial_production_yoy;
    if (ip && isNum(ip.currentValue) && isNum(ip.threeMonthsAgo)) {
      if (sign(ip.currentValue) !== sign(ip.threeMonthsAgo) && ip.currentValue !== 0) {
        var toExpansion = ip.currentValue > 0;
        push("industrial_production_yoy", "growth", toExpansion ? "INDUSTRIEPRODUKTION DREHT IN EXPANSION" : "INDUSTRIEPRODUKTION DREHT IN KONTRAKTION",
          "Industrieproduktion (YoY) wechselt das Vorzeichen: " + fmt1(ip.threeMonthsAgo) + "% (vor 3M) → " + fmt1(ip.currentValue) + "% (aktuell).",
          "medium", toExpansion ? "positive" : "negative");
      }
    }

    // 10. Sahm-Regel naehert sich Ausloeser
    var sahm = raw.sahm_rule;
    if (sahm && isNum(sahm.currentValue) && sahm.currentValue >= (rules.sahmTriggerLevel || 0.5)) {
      push("sahm_rule", "labor", "SAHM-REGEL AUSGELÖST",
        "Die Echtzeit-Sahm-Regel steht bei " + fmt1(sahm.currentValue) + " Pp und hat damit die historische Rezessions-Schwelle von " + (rules.sahmTriggerLevel || 0.5) + " Pp erreicht/überschritten. Als Recession Monitor zu lesen, nicht als alleiniger Fruehindikator.",
        "high", "negative");
    }

    return out;
  }

  global.MacroCalc = {
    isNum: isNum,
    clamp: clamp,
    directionOf: directionOf,
    momentumFromDirection: momentumFromDirection,
    accelerationOf: accelerationOf,
    scoreIndicator: scoreIndicator,
    bandLookup: bandLookup,
    aggregateCategory: aggregateCategory,
    computeRegime: computeRegime,
    statusLabel: statusLabel,
    yieldCurveRegime: yieldCurveRegime,
    fedFlexibility: fedFlexibility,
    detectInflections: detectInflections
  };
})(window);
