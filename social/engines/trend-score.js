/* =========================================================================
   VISION UNIVERSE SOCIAL — trend-score.js
   VU TREND SCORE (§5)

   Kein "Trending Keywords"-Balken. Der Score beantwortet zwoelf getrennte
   Fragen und sagt zu jeder, ob er sie beantworten kann.

   DIE WICHTIGSTE EIGENSCHAFT: ER DARF SICH WEIGERN

   Wenn zu wenige Dimensionen belegt sind, gibt es KEINE Zahl. Ein Score
   von 62, der aus Velocity und sonst nichts entstanden ist, sieht aus wie
   eine Messung und ist eine Behauptung. §45 verbietet Fake-Trends; das
   hier ist die technische Form dieses Verbots.

   ZWEI DINGE, DIE NICHT VERWECHSELT WERDEN DUERFEN

     null   die Dimension wurde nicht gemessen
     0      die Dimension wurde gemessen und ist null

   Eine nicht gemessene Dimension wird aus der Gewichtung ENTFERNT und die
   uebrigen Gewichte werden neu normiert. Sie mit 0 einzusetzen waere die
   Aussage "dieses Thema hat keinerlei Engagement" — und das hat niemand
   gemessen.

   DETERMINISTISCH (§40)

   Hier rechnet kein Sprachmodell. Velocity ist ein Quotient, Acceleration
   eine zweite Differenz, Frische ein exponentieller Zerfall. Die
   Interpretation ("was bedeutet das fuer uns?") kommt spaeter und
   anderswo.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Untrusted = isNode ? require("./untrusted.js") : global.VUSocialUntrusted;

  var DIMENSIONS = [
    "velocity", "acceleration", "engagement", "freshness", "crossPlatform",
    "marketRelevance", "vuRelevance", "audienceFit", "novelty",
    "saturation", "credibility", "risk"
  ];

  var DIMENSION_LABELS = {
    velocity:        "Geschwindigkeit — wie schnell waechst die Erwaehnung",
    acceleration:    "Beschleunigung — wird das Wachstum staerker oder schwaecher",
    engagement:      "Interaktion je Erwaehnung",
    freshness:       "Frische der Beobachtung",
    crossPlatform:   "Bestaetigung auf mehreren Plattformen",
    marketRelevance: "Bezug zum aktuellen Marktumfeld",
    vuRelevance:     "Bezug zu Vision-Universe-Themen",
    audienceFit:     "Passung zum eigenen Publikum",
    novelty:         "Neuheit gegenueber dem eigenen Bestand",
    saturation:      "Saettigung — wie oft es schon gesagt wurde",
    credibility:     "Glaubwuerdigkeit der Quellenlage",
    risk:            "Risiko, dass das Thema der Marke schadet"
  };

  var DEFAULT_METHODOLOGY = {
    version: "1.0.0",
    minimumCoverage: 0.5,
    requiredDimensions: ["velocity", "freshness"],
    weights: {
      velocity: 0.14, acceleration: 0.12, engagement: 0.10, freshness: 0.09,
      crossPlatform: 0.08, marketRelevance: 0.11, vuRelevance: 0.11,
      audienceFit: 0.08, novelty: 0.06, saturation: 0.05,
      credibility: 0.04, risk: 0.02
    },
    inverted: ["saturation", "risk"],
    halfLifeHours: 18,
    saturationThreshold: 3
  };

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  /** Ein gemessener Wert mit Begruendung. */
  function measured(value, reason) {
    return { available: true, value: clamp01(value), reason: reason };
  }

  /** Eine nicht gemessene Dimension. Sie hat KEINEN Wert. */
  function unmeasured(reason) {
    return { available: false, value: null, reason: reason };
  }

  /* ------------------------------------------------------------------ */
  /* Die zwoelf Dimensionen                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Geschwindigkeit: Wachstum gegenueber der Vorperiode, gestaucht.
   * Die Stauchung ueber log ist Absicht — eine Verdopplung ist ein
   * Ereignis, eine Verzwanzigfachung meist ein Messfehler oder ein Bot.
   */
  function velocity(signal) {
    var m = signal.measures || {};
    if (m.volume === null || m.volume === undefined) return unmeasured("Kein Erwaehnungsvolumen gemessen.");
    if (m.volumePrior === null || m.volumePrior === undefined) return unmeasured("Keine Vorperiode zum Vergleich.");
    if (m.volumePrior <= 0) {
      /* Von 0 auf irgendetwas ist ein unendlicher Faktor. Das ist keine
         Geschwindigkeit, das ist ein Beginn — und wird als solcher
         bewertet, nicht als Rekord. */
      return m.volume > 0
        ? measured(0.6, "Das Thema beginnt aus dem Nichts (Vorperiode 0).")
        : measured(0, "Kein Volumen in beiden Perioden.");
    }
    var ratio = m.volume / m.volumePrior;
    /* log2(ratio) auf [-2, +3] abgebildet: Halbierung -> 0, Verachtfachung -> 1. */
    var v = (Math.log2(ratio) + 2) / 5;
    return measured(v, "Volumen " + m.volume + " gegenueber " + m.volumePrior +
      " in der Vorperiode (Faktor " + (Math.round(ratio * 100) / 100) + ").");
  }

  /** Beschleunigung: zweite Differenz. Braucht drei Perioden. */
  function acceleration(signal) {
    var m = signal.measures || {};
    if ([m.volume, m.volumePrior, m.volumePriorPrior].some(function (x) { return x === null || x === undefined; })) {
      return unmeasured("Drei Perioden noetig, es liegen nicht alle vor.");
    }
    var d1 = m.volume - m.volumePrior;
    var d0 = m.volumePrior - m.volumePriorPrior;
    var base = Math.max(1, Math.abs(m.volumePrior));
    var accel = (d1 - d0) / base;
    /* [-1, +1] auf [0, 1]. */
    var v = clamp01((accel + 1) / 2);
    return measured(v, accel > 0
      ? "Das Wachstum nimmt zu (Beschleunigung " + (Math.round(accel * 100) / 100) + ")."
      : "Das Wachstum laesst nach (Beschleunigung " + (Math.round(accel * 100) / 100) + ").");
  }

  /** Interaktion je Erwaehnung. */
  function engagement(signal) {
    var m = signal.measures || {};
    if (m.engagement === null || m.engagement === undefined) return unmeasured("Keine Interaktionsdaten.");
    if (!m.volume) return unmeasured("Ohne Volumen ist Interaktion je Erwaehnung nicht bestimmbar.");
    var per = m.engagement / m.volume;
    /* 0 bis 50 Interaktionen je Erwaehnung, log-gestaucht. */
    var v = clamp01(Math.log10(1 + per) / Math.log10(51));
    return measured(v, Math.round(per * 10) / 10 + " Interaktionen je Erwaehnung.");
  }

  /** Frische: exponentieller Zerfall seit der Beobachtung. */
  function freshness(signal, methodology, nowMs) {
    if (!signal.observedAt) return unmeasured("Kein Beobachtungszeitpunkt.");
    var ageHours = (nowMs - Date.parse(signal.observedAt)) / 3600000;
    if (!Number.isFinite(ageHours)) return unmeasured("Beobachtungszeitpunkt nicht lesbar.");
    if (ageHours < 0) ageHours = 0;
    var halfLife = methodology.halfLifeHours || 18;
    var v = Math.pow(0.5, ageHours / halfLife);
    return measured(v, "Beobachtung ist " + Math.round(ageHours * 10) / 10 + " h alt (Halbwertszeit " + halfLife + " h).");
  }

  /** Bestaetigung auf mehreren Plattformen. */
  function crossPlatform(signal) {
    var platforms = (signal.measures && signal.measures.platforms) || [];
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return unmeasured("Keine Plattformzuordnung im Signal.");
    }
    var n = platforms.length;
    /* Eine Plattform = 0.25, zwei = 0.6, drei = 0.85, vier+ = 1. Ein
       Thema auf einer einzigen Plattform kann eine Eigenheit dieser
       Plattform sein. */
    var v = n >= 4 ? 1 : (n === 3 ? 0.85 : (n === 2 ? 0.6 : 0.25));
    return measured(v, n + " Plattform(en): " + platforms.join(", ") + ".");
  }

  /**
   * Marktrelevanz und VU-Relevanz kommen von aussen: sie werden vom
   * Aufrufer gemessen (Abgleich mit dem Produktuniversum, mit laufenden
   * VU-Signalen) und hier nur eingesetzt. Diese Datei erfindet sie nicht.
   */
  function fromContext(context, key, label) {
    if (!context || context[key] === null || context[key] === undefined) {
      return unmeasured("Keine Messung fuer " + label + " uebergeben.");
    }
    var value = Number(context[key]);
    if (!Number.isFinite(value)) return unmeasured(label + " ist keine Zahl.");
    return measured(value, label + " = " + Math.round(value * 100) + " %.");
  }

  /** Neuheit gegenueber dem eigenen Bestand. */
  function novelty(signal, context) {
    if (!context || context.daysSinceOwnCoverage === null || context.daysSinceOwnCoverage === undefined) {
      return unmeasured("Es ist nicht bekannt, wann dieses Thema zuletzt behandelt wurde.");
    }
    var days = Number(context.daysSinceOwnCoverage);
    if (!Number.isFinite(days)) return unmeasured("Abstand zur letzten eigenen Behandlung nicht lesbar.");
    /* 0 Tage = 0, 30 Tage = 1, linear dazwischen. */
    var v = clamp01(days / 30);
    return measured(v, days >= 30
      ? "Seit mindestens 30 Tagen nicht behandelt."
      : "Zuletzt vor " + Math.round(days) + " Tagen behandelt.");
  }

  /** Saettigung: wie oft wurde das Thema im Fenster schon bespielt. */
  function saturation(context, methodology) {
    if (!context || context.ownPostsOnTopic === null || context.ownPostsOnTopic === undefined) {
      return unmeasured("Anzahl eigener Beitraege zum Thema unbekannt.");
    }
    var n = Number(context.ownPostsOnTopic);
    var threshold = methodology.saturationThreshold || 3;
    var v = clamp01(n / (threshold * 2));
    return measured(v, n + " eigene Beitraege zum Thema im Fenster (Schwelle " + threshold + ").");
  }

  /**
   * Glaubwuerdigkeit: Provenance plus Injection-Befunde. Ein Signal,
   * dessen Belegtexte Uebernahmeversuche enthalten, ist eine Kampagne
   * und kein Trend (§50).
   */
  function credibility(signal) {
    var provenance = Array.isArray(signal.provenance) ? signal.provenance : [];
    if (provenance.length === 0) return unmeasured("Keine Herkunftsangaben am Signal.");
    var verified = provenance.filter(function (p) { return p.state === "VERIFIED"; }).length;
    var base = verified / provenance.length;
    var findings = signal.untrustedText ? Untrusted.detect(signal.untrustedText) : [];
    var penalty = Untrusted.credibilityPenalty(findings);
    var v = clamp01(base - penalty);
    return measured(v, verified + " von " + provenance.length + " Quellen bestaetigt" +
      (findings.length ? ("; " + findings.length + " Auffaelligkeit(en) im Belegtext: " + findings.join(", ")) : "") + ".");
  }

  /** Markenrisiko — vom Aufrufer gemessen, hier nur eingesetzt. */
  function risk(context) {
    return fromContext(context, "brandRisk", "Markenrisiko");
  }

  /* ------------------------------------------------------------------ */
  /* Der Score                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * @param signal   ein Schema.trendSignal
   * @param context  externe Messungen:
   *                 { marketRelevance, vuRelevance, audienceFit, brandRisk,
   *                   daysSinceOwnCoverage, ownPostsOnTopic }
   * @param options  { methodology, now }
   */
  function score(signal, context, options) {
    options = options || {};
    var methodology = Object.assign({}, DEFAULT_METHODOLOGY, options.methodology || {});
    var nowMs = options.now ? new Date(options.now).getTime() : Date.now();
    signal = signal || {};
    context = context || {};

    var components = {
      velocity:        velocity(signal),
      acceleration:    acceleration(signal),
      engagement:      engagement(signal),
      freshness:       freshness(signal, methodology, nowMs),
      crossPlatform:   crossPlatform(signal),
      marketRelevance: fromContext(context, "marketRelevance", "Marktrelevanz"),
      vuRelevance:     fromContext(context, "vuRelevance", "VU-Relevanz"),
      audienceFit:     fromContext(context, "audienceFit", "Publikumspassung"),
      novelty:         novelty(signal, context),
      saturation:      saturation(context, methodology),
      credibility:     credibility(signal),
      risk:            risk(context)
    };

    /* Abdeckung nach GEWICHT, nicht nach Anzahl: zwei fehlende
       Leichtgewichte sind etwas anderes als eine fehlende Hauptdimension. */
    var totalWeight = 0, availableWeight = 0, weighted = 0;
    DIMENSIONS.forEach(function (dim) {
      var w = methodology.weights[dim] || 0;
      totalWeight += w;
      var c = components[dim];
      if (!c.available) return;
      availableWeight += w;
      var value = methodology.inverted.indexOf(dim) !== -1 ? (1 - c.value) : c.value;
      weighted += w * value;
    });

    var coverage = totalWeight === 0 ? 0 : availableWeight / totalWeight;
    var missingRequired = (methodology.requiredDimensions || []).filter(function (dim) {
      return !components[dim].available;
    });

    if (missingRequired.length > 0) {
      return unavailableResult(components, coverage, methodology,
        "Pflichtdimension(en) fehlen: " + missingRequired.map(function (d) {
          return DIMENSION_LABELS[d] || d;
        }).join(", ") + ".");
    }
    if (coverage < methodology.minimumCoverage) {
      return unavailableResult(components, coverage, methodology,
        "Nur " + Math.round(coverage * 100) + " % der Gewichtung sind belegt; verlangt sind " +
        Math.round(methodology.minimumCoverage * 100) + " %.");
    }

    var value = Math.round((weighted / availableWeight) * 100);

    /* Die drei staerksten Treiber — das ist die Erklaerung, die im
       Command Center steht (§32). */
    var drivers = DIMENSIONS
      .filter(function (d) { return components[d].available; })
      .map(function (d) {
        var c = components[d];
        var v = methodology.inverted.indexOf(d) !== -1 ? (1 - c.value) : c.value;
        return { dimension: d, label: DIMENSION_LABELS[d], contribution: (methodology.weights[d] || 0) * v,
                 value: c.value, reason: c.reason };
      })
      .sort(function (a, b) { return b.contribution - a.contribution; });

    return {
      available: true,
      state: "VERIFIED",
      score: value,
      coverage: Math.round(coverage * 1000) / 1000,
      methodologyVersion: methodology.version,
      components: components,
      drivers: drivers.slice(0, 3),
      dampeners: drivers.slice(-2).reverse(),
      explanation: "Trend Score " + value + " von 100 bei " + Math.round(coverage * 100) +
        " % Belegabdeckung. Staerkster Treiber: " + (drivers[0] ? drivers[0].reason : "keiner") +
        (drivers.length > 1 ? " Danach: " + drivers[1].reason : "")
    };
  }

  function unavailableResult(components, coverage, methodology, reason) {
    return {
      available: false,
      state: "UNAVAILABLE",
      /* KEINE Zahl. Das ist der ganze Punkt. */
      score: null,
      coverage: Math.round(coverage * 1000) / 1000,
      methodologyVersion: methodology.version,
      components: components,
      drivers: [],
      dampeners: [],
      explanation: "Kein Trend Score: " + reason + " Es wird keine Zahl ausgegeben, " +
                   "weil eine Zahl hier eine Messung behaupten wuerde, die nicht stattgefunden hat."
    };
  }

  var api = {
    DIMENSIONS: DIMENSIONS,
    DIMENSION_LABELS: DIMENSION_LABELS,
    DEFAULT_METHODOLOGY: DEFAULT_METHODOLOGY,
    score: score,
    components: {
      velocity: velocity, acceleration: acceleration, engagement: engagement,
      freshness: freshness, crossPlatform: crossPlatform, novelty: novelty,
      saturation: saturation, credibility: credibility
    }
  };

  if (isNode) module.exports = api;
  else global.VUSocialTrendScore = api;
})(typeof window !== "undefined" ? window : globalThis);
