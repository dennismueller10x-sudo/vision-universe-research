/* =========================================================================
   VISION UNIVERSE SOCIAL — opportunity.js
   VU CONTENT OPPORTUNITY SCORE (§6)

   Nicht jeder Trend wird Content.

   Der Trend Score beantwortet: "passiert da gerade etwas?"
   Dieser Score beantwortet: "sollen WIR etwas dazu sagen, jetzt, hier?"

   Das sind verschiedene Fragen. Ein Thema kann heiss sein und trotzdem
   nichts fuer uns: kein eigener Blickwinkel, kein Bezug zum Publikum,
   gestern schon gesagt, oder auf dieser Plattform am falschen Ort.

   WAS HIER ZUSAETZLICH ZAEHLT

     Trend Score              das Aussen
     VU-Signal                das Innen — haben wir eigene Daten dazu
     Publikumsinteresse       fragt unser Publikum danach
     Historische Leistung     wie liefen vergleichbare Beitraege
     Plattformpassung         Format und Ort
     Content Gap              was fehlt im eigenen Bestand
     Brand Fit                koennen wir es in unserem Register sagen

   DIESELBE WEIGERUNG WIE BEIM TREND SCORE

   Ohne Trend Score und ohne VU-Signal gibt es keine Gelegenheit. Ein
   Beitrag, dem beides fehlt, waere ein Beitrag ohne Anlass und ohne
   eigenen Beitrag — genau das, was §57 ausschliesst.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var DIMENSIONS = [
    "trend", "vuSignal", "editorialBasis", "audienceInterest", "externalInterest",
    "historicalPerformance", "platformFit", "freshness", "contentGap", "brandFit"
  ];

  var DIMENSION_LABELS = {
    trend:                 "externer Trend",
    vuSignal:              "eigenes Vision-Universe-Signal",
    editorialBasis:        "vorhandene redaktionelle Grundlage",
    audienceInterest:      "Interesse des eigenen Publikums",
    externalInterest:      "externe Aufmerksamkeit fuer das Thema",
    historicalPerformance: "Leistung vergleichbarer Beitraege",
    platformFit:           "Passung zur Plattform",
    freshness:             "Aktualitaet des Anlasses",
    contentGap:            "Luecke im eigenen Bestand",
    brandFit:              "Passung zum Markenregister"
  };

  var DEFAULT_METHODOLOGY = {
    version: "1.0.0",
    weights: {
        trend: 0.18, vuSignal: 0.22, editorialBasis: 0.12, audienceInterest: 0.14,
      /* EXTERN ist nicht EIGEN. Zwei Dimensionen, zwei Evidenzklassen -
         und die externe wiegt bewusst leichter: fremde Wirkung ist
         nicht unsere, und Haeufigkeit ist keine Wirkung. */
      externalInterest: 0.08,
      historicalPerformance: 0.12, platformFit: 0.10,
      freshness: 0.10, contentGap: 0.08, brandFit: 0.06
    },
    /* Die Mindestabdeckung.
       Sie ist auf 0.55 gesetzt und nicht auf 0.6, und das ist eine
       bewusste Entscheidung mit einem Grund, der sich aendern wird:

       Ein System ohne Publikumssignale und ohne eigene Historie kann
       audienceInterest (0.14) und historicalPerformance (0.12) nicht
       messen — nicht aus Nachlaessigkeit, sondern weil es noch nichts
       veroeffentlicht hat. Erreichbar sind im Kaltstart hoechstens
       vuSignal + freshness + contentGap + platformFit + brandFit = 0.56.

       Eine Schwelle von 0.6 waere damit nicht streng, sondern
       unerfuellbar: sie wuerde JEDE Gelegenheit ablehnen, unabhaengig von
       ihrer Guete, und die Ablehnung saehe aus wie ein Urteil ueber das
       Thema. 0.55 verlangt dagegen alles, was ein Kaltstart-System
       tatsaechlich wissen kann — und lehnt eine Gelegenheit ab, der auch
       nur eine dieser Dimensionen fehlt.

       SOBALD Analytics und Publikumssignale laufen, gehoert diese
       Schwelle hinauf. Sie steht deshalb in der Methodik und nicht im
       Code-Fluss: die Aenderung ist dann eine Zeile mit Begruendung. */
    minimumCoverage: 0.55,
    /* Ohne eine dieser beiden Dimensionen entsteht keine Gelegenheit.
       "trend" allein waere Nachplappern, "vuSignal" allein waere ein
       Beitrag ohne Anlass. Verlangt ist MINDESTENS eine von beiden — und
       das ist eine ODER-Bedingung, kein UND. */
    /* -----------------------------------------------------------------
       DREI MOEGLICHE ANLAESSE, NICHT ZWEI

       Hier standen nur `trend` und `vuSignal`. Fuer ein MARKTSIGNAL ist
       das richtig: ohne Anlass von aussen und ohne eigenen Messwert
       gibt es keinen Grund, ueber einen Kurs zu sprechen.

       Fuer ein INHALTLICHES Thema ist es falsch. "Was bedeutet eine
       Zinssenkung fuer Aktien?" hat keinen Trend Score und kein
       VU-Signal - und ist trotzdem ein vollwertiges Thema. Eine
       Magazingeschichte auch, ein Erklaerstueck auch.

       Die Folge war messbar: jedes Thema ohne Kursbezug wurde mit
       "Ohne Anlass und ohne eigenen Beitrag entsteht keine Gelegenheit"
       abgewiesen. Die ticker-zentrierte Annahme steckte nicht nur in
       der Signalquelle, sondern auch in der BEWERTUNG.

       `editorialBasis` ist der dritte Anlass: es existiert bereits ein
       kuratiertes Vision-Universe-Artefakt dazu - ein Magazinstueck,
       ein Report, eine redaktionelle Reihe. Das ist ein Anlass mit
       eigenem Beitrag, nur eben kein kursgetriebener.
       ------------------------------------------------------------------- */
    requiresAnyOf: ["trend", "vuSignal", "editorialBasis"],
    /* Unterhalb dieser Schwelle wird nicht vorgeschlagen. Die Schwelle ist
       Konfiguration, damit die Learning Engine sie bewegen darf (§21). */
    proposalThreshold: 55,
    /* Unterhalb dieser Schwelle wird auch auf Stufe 4 nicht ohne Mensch
       veroeffentlicht. Sie liegt hoeher: autonom handeln darf man nur bei
       klaren Faellen. */
    autonomousThreshold: 72
  };

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  function measured(value, reason) { return { available: true, value: clamp01(value), reason: reason }; }
  function unmeasured(reason) { return { available: false, value: null, reason: reason }; }

  function fromInput(input, key, label, transform) {
    if (!input || input[key] === null || input[key] === undefined) {
      return unmeasured("Keine Messung fuer " + label + ".");
    }
    var raw = Number(input[key]);
    if (!Number.isFinite(raw)) return unmeasured(label + " ist keine Zahl.");
    var value = transform ? transform(raw) : raw;
    return measured(value, label + ": " + (transform ? Math.round(value * 100) + " %" : Math.round(raw * 100) + " %"));
  }

  /**
   * @param input {
   *   trendScore            0..100 oder null (Ergebnis von trend-score.js)
   *   vuSignalStrength      0..1   Staerke des internen Signals
   *   audienceInterest      0..1
   *   historicalPerformance 0..1
   *   historicalSampleSize  Anzahl vergleichbarer Beitraege
   *   platformFit           0..1
   *   hoursSinceTrigger     Stunden seit dem ausloesenden Ereignis
   *   contentGap            0..1
   *   brandFit              0..1
   * }
   */
  function score(input, options) {
    options = options || {};
    var methodology = Object.assign({}, DEFAULT_METHODOLOGY, options.methodology || {});
    input = input || {};

    var components = {};

    components.trend = (input.trendScore === null || input.trendScore === undefined)
      ? unmeasured("Kein Trend Score vorhanden — die Trend-Engine hat sich enthalten.")
      : measured(Number(input.trendScore) / 100, "Trend Score " + Math.round(Number(input.trendScore)) + ".");

    components.vuSignal = fromInput(input, "vuSignalStrength", "internes VU-Signal");
    components.editorialBasis = fromInput(input, "editorialBasis",
      "vorhandene redaktionelle Grundlage");
    components.audienceInterest = fromInput(input, "audienceInterest", "Publikumsinteresse");
    components.externalInterest = fromInput(input, "externalInterest",
      "externe Aufmerksamkeit");

    /* Historische Leistung OHNE Stichprobengroesse ist eine Anekdote.
       §19: Korrelation ist nicht Kausalitaet, und n=2 ist nicht einmal
       Korrelation. Unter der Mindestzahl gilt sie als nicht gemessen —
       nicht als schlecht. */
    var minSample = options.minimumSample || 5;
    var n = Number(input.historicalSampleSize);
    if (input.historicalPerformance === null || input.historicalPerformance === undefined) {
      components.historicalPerformance = unmeasured("Keine Leistungsdaten vergleichbarer Beitraege.");
    } else if (!Number.isFinite(n) || n < minSample) {
      components.historicalPerformance = unmeasured(
        "Nur " + (Number.isFinite(n) ? n : 0) + " vergleichbare Beitraege; ab " + minSample +
        " wird daraus eine Aussage.");
    } else {
      components.historicalPerformance = measured(Number(input.historicalPerformance),
        "Vergleichbare Beitraege (n=" + n + ") liegen bei " +
        Math.round(Number(input.historicalPerformance) * 100) + " % der Zielleistung.");
    }

    components.platformFit = fromInput(input, "platformFit", "Plattformpassung");

    /* Aktualitaet des ANLASSES — nicht des Signals. Ein 52-Wochen-Hoch von
       vor drei Tagen ist kein Anlass mehr. */
    if (input.hoursSinceTrigger === null || input.hoursSinceTrigger === undefined) {
      components.freshness = unmeasured("Zeitpunkt des Anlasses unbekannt.");
    } else {
      var hours = Math.max(0, Number(input.hoursSinceTrigger));
      var v = Math.pow(0.5, hours / 24);
      components.freshness = measured(v, "Der Anlass liegt " + Math.round(hours) + " h zurueck.");
    }

    components.contentGap = fromInput(input, "contentGap", "Luecke im eigenen Bestand");
    components.brandFit = fromInput(input, "brandFit", "Markenpassung");

    /* Gewichtete Abdeckung. */
    var totalWeight = 0, availableWeight = 0, weighted = 0;
    /* -------------------------------------------------------------------
       NICHT ANWENDBAR IST NICHT FEHLEND

       Die Abdeckung zaehlte jede unverfuegbare Dimension als Luecke.
       Fuer ein Marktsignal stimmt das: wer keinen Trend Score hat,
       weiss etwas nicht.

       Fuer ein inhaltliches Thema ist es falsch. Ein Erklaerstueck HAT
       keinen Trend Score - nicht, weil die Messung fehlt, sondern weil
       die Frage sich nicht stellt. Beides gleich zu behandeln druecke
       die Abdeckung unter die Mindestgrenze, und das Thema waere
       UNAVAILABLE aus einem Grund, der keiner ist.

       Dieselbe Verwechslung wie ueberall hier: Abwesenheit als Mangel
       gewertet. Wer eine Dimension als nicht anwendbar erklaert, nimmt
       sie ganz aus der Rechnung - und das steht im Ergebnis, damit
       niemand sie spaeter fuer beantwortet haelt.
       ------------------------------------------------------------------- */
    var nichtAnwendbar = (options.notApplicable || []).filter(function (d) {
      return DIMENSIONS.indexOf(d) !== -1;
    });
    /* Die Anlassdimensionen darf niemand wegerklaeren: sonst entstuende
       eine Gelegenheit voellig ohne Anlass. */
    nichtAnwendbar = nichtAnwendbar.filter(function (d) {
      return (methodology.requiresAnyOf || []).indexOf(d) === -1 ||
        (methodology.requiresAnyOf || []).some(function (r) {
          return r !== d && components[r] && components[r].available;
        });
    });

    /* -------------------------------------------------------------------
       ZWEI GRUENDE, WARUM ETWAS FEHLT — UND NUR EINER GEHOERT DEM THEMA

       "Wir wissen nichts ueber das Publikumsinteresse" ist keine
       Aussage ueber DIESES Thema. Es ist eine Aussage darueber, dass
       das System noch nie etwas veroeffentlicht hat. Dasselbe gilt fuer
       die Leistung vergleichbarer Beitraege und fuer die
       Plattformpassung ohne angebundenen Provider.

       Diese drei als Luecke des Themas zu zaehlen erzeugt einen
       Stillstand: bewerten kann man erst mit Publikumsdaten,
       Publikumsdaten bekommt man erst durchs Veroeffentlichen, und
       veroeffentlicht wird nur, was bewertet wurde.

       Genau diesen Stillstand hat die Mindestabdeckung von 0,55 schon
       einmal aufgeloest - fuer Signalthemen, bei denen Trend und
       VU-Signal 0,40 der Gewichtung tragen. Bei einem redaktionellen
       Thema fehlen diese beiden, und derselbe Stillstand trifft
       haerter: erreichbar sind dort hoechstens 50 %.

       Die Schwelle wird deshalb nicht gesenkt. Sie wird auf das
       bezogen, was ERREICHBAR ist - dieselbe Ueberlegung, die schon
       in der 0,55 steckt, nur konsequent angewendet. Beide Zahlen
       stehen im Ergebnis, damit niemand die eine fuer die andere haelt.
       ------------------------------------------------------------------- */
    var systemischFehlend = (options.systemicallyUnavailable || []).filter(function (d) {
      return DIMENSIONS.indexOf(d) !== -1 && nichtAnwendbar.indexOf(d) === -1 &&
        components[d] && !components[d].available;
    });

    /* -------------------------------------------------------------------
       DREI GRUENDE, WARUM EINE DIMENSION FEHLT — UND SIE SIND VERSCHIEDEN

       Bisher gab es zwei: NICHT ANWENDBAR (die Frage stellt sich nicht)
       und SYSTEMISCH UNMESSBAR (das System ist zu jung).

       Der dritte ist neu und hat mit Technik nichts zu tun: NICHT
       AKTIVIERT. Die Quelle ist gebaut, geprueft und bereit - und der
       Owner hat entschieden, sie nicht einzuschalten.

       Ihn unter "systemisch unmessbar" zu fuehren waere bequem und
       falsch. Es hiesse, das System koenne nicht, wo es darf nicht.
       Spaeter liest jemand den Bericht und sucht einen Fehler, den es
       nicht gibt.

       Fuer die RECHNUNG verhalten sich beide gleich - die Dimension
       faellt aus dem Erreichbaren und zieht nichts ab. Fuer die
       ERKLAERUNG nicht, und die Erklaerung ist der Grund, warum es
       dieses Feld gibt. */
    var nichtAktiviert = (options.notActivated || []).filter(function (d) {
      return DIMENSIONS.indexOf(d) !== -1 && nichtAnwendbar.indexOf(d) === -1 &&
        components[d] && !components[d].available;
    });
    /* Was nicht aktiviert ist, wird nicht zusaetzlich als systemisch
       unmessbar gefuehrt - ein Grund je Dimension, sonst stehen zwei
       verschiedene Erklaerungen fuer dieselbe Luecke im Bericht. */
    systemischFehlend = systemischFehlend.filter(function (d) {
      return nichtAktiviert.indexOf(d) === -1;
    });
    var ausDemErreichbaren = systemischFehlend.concat(nichtAktiviert);
    var erreichbaresGewicht = 0;

    DIMENSIONS.forEach(function (dim) {
      if (nichtAnwendbar.indexOf(dim) !== -1) return;
      var w = methodology.weights[dim] || 0;
      totalWeight += w;
      if (ausDemErreichbaren.indexOf(dim) === -1) erreichbaresGewicht += w;
      if (!components[dim].available) return;
      availableWeight += w;
      weighted += w * components[dim].value;
    });
    var coverage = totalWeight === 0 ? 0 : availableWeight / totalWeight;
    /* Die Abdeckung des Themas bleibt unveraendert berichtet. Geprueft
       wird gegen das Erreichbare. */
    var reachableCoverage = erreichbaresGewicht === 0 ? 0
      : Math.min(1, availableWeight / erreichbaresGewicht);
    /* -------------------------------------------------------------------
       DIE ZAHL, DIE ENTSCHEIDET, IST DIE ZAHL, DIE DASTEHT

       Die Ablehnung lautete woertlich: "Nur 55 % der ERREICHBAREN
       Gewichtung sind belegt; verlangt sind 55 %." Eine Ablehnung, deren
       eigener Text die Bedingung als erfuellt ausweist.

       Der Grund ist Binaerarithmetik: 0.66 / 1.20 ergibt
       0.5499999999999999. Berichtet wurde gerundet, verglichen wurde
       ungerundet — und damit entschieden Stellen, die niemand sieht.

       Gerundet wird jetzt VOR dem Vergleich, auf dieselbe Genauigkeit,
       die auch im Ergebnis steht. Das ist keine Aufweichung der
       Schwelle: 0.549 wird weiterhin abgelehnt. Es ist die Zusage, dass
       Anzeige und Entscheidung dieselbe Zahl benutzen. */
    reachableCoverage = Math.round(reachableCoverage * 1000) / 1000;

    var anyOf = (methodology.requiresAnyOf || []).some(function (dim) {
      return components[dim].available;
    });
    if (!anyOf) {
      return refuse(components, coverage, methodology,
        "Weder ein externer Trend noch ein internes VU-Signal noch eine " +
        "vorhandene redaktionelle Grundlage liegt vor. Ohne Anlass und ohne " +
        "eigenen Beitrag entsteht keine Gelegenheit.", { reachableCoverage: reachableCoverage,
          notApplicable: nichtAnwendbar, systemicallyUnavailable: systemischFehlend,
          notActivated: nichtAktiviert });
    }
    if (reachableCoverage < methodology.minimumCoverage) {
      return refuse(components, coverage, methodology,
        "Nur " + Math.round(reachableCoverage * 100) + " % der ERREICHBAREN Gewichtung " +
        "sind belegt; verlangt sind " + Math.round(methodology.minimumCoverage * 100) +
        " %." + (systemischFehlend.length
          ? " (Systemisch nicht messbar und daher nicht eingerechnet: " +
            systemischFehlend.join(", ") + ".)"
          : "") + (nichtAktiviert.length
          ? " (Nicht aktiviert und daher nicht eingerechnet: " +
            nichtAktiviert.join(", ") + ".)"
          : ""), { reachableCoverage: reachableCoverage,
          notApplicable: nichtAnwendbar, systemicallyUnavailable: systemischFehlend,
          notActivated: nichtAktiviert });
    }

    var value = Math.round((weighted / availableWeight) * 100);

    var ranked = DIMENSIONS
      .filter(function (d) { return components[d].available; })
      .map(function (d) {
        return { dimension: d, label: DIMENSION_LABELS[d],
                 contribution: (methodology.weights[d] || 0) * components[d].value,
                 value: components[d].value, reason: components[d].reason };
      })
      .sort(function (a, b) { return b.contribution - a.contribution; });

    /* Was NICHT ANWENDBAR ist, blieb nicht "ungemessen" - die Frage
       stellte sich nicht. Beides in einen Satz zu werfen hiesse, dem
       Leser eine Luecke zu melden, die keine ist. */
    var missing = DIMENSIONS.filter(function (d) {
      return !components[d].available && nichtAnwendbar.indexOf(d) === -1; });

    return {
      available: true,
      state: "VERIFIED",
      notApplicable: nichtAnwendbar,
      /* Beide Zahlen, damit niemand die eine fuer die andere haelt. */
      reachableCoverage: reachableCoverage,
      systemicallyUnavailable: systemischFehlend,
      /* Abgeschaltet, nicht unvermoegend. */
      notActivated: nichtAktiviert,
      score: value,
      coverage: Math.round(coverage * 1000) / 1000,
      methodologyVersion: methodology.version,
      components: components,
      drivers: ranked.slice(0, 3),
      missing: missing.map(function (d) {
        return { dimension: d, label: DIMENSION_LABELS[d],
          reason: components[d].reason,
          /* Warum sie fehlt - die Frage, die ein Bericht ohne dieses
             Feld offen laesst. */
          cause: nichtAktiviert.indexOf(d) !== -1 ? "NOT_ACTIVATED"
            : systemischFehlend.indexOf(d) !== -1 ? "SYSTEMICALLY_UNAVAILABLE"
            : "UNMEASURED" };
      }),
      /* Die drei Schwellen, an denen sich die Handlung entscheidet. */
      proposable: value >= methodology.proposalThreshold,
      autonomous: value >= methodology.autonomousThreshold,
      explanation: buildExplanation(value, ranked, missing, components, methodology)
    };
  }

  /**
   * Die Erklaerung in Prosa (§32). Sie nennt Grund, Beleg und Vorbehalt —
   * keine Score-Wueste.
   */
  function buildExplanation(value, ranked, missing, components, methodology) {
    var parts = [];
    parts.push("Opportunity Score " + value + " von 100.");
    if (ranked[0]) parts.push("Wichtigster Grund: " + ranked[0].reason);
    if (ranked[1]) parts.push("Dazu: " + ranked[1].reason);
    if (value < methodology.proposalThreshold) {
      parts.push("Das liegt unter der Vorschlagsschwelle von " + methodology.proposalThreshold +
                 "; die Gelegenheit wird nicht vorgeschlagen.");
    } else if (value < methodology.autonomousThreshold) {
      parts.push("Das reicht fuer einen Vorschlag, aber nicht fuer eine Veroeffentlichung ohne Freigabe " +
                 "(Schwelle " + methodology.autonomousThreshold + ").");
    } else {
      parts.push("Das liegt ueber der Schwelle fuer autonomes Handeln.");
    }
    if (missing.length) {
      /* `missing` traegt Dimensionsnamen, keine Objekte. `m.label` war
         auf jedem davon undefined, und die Erklaerung las sich
         woertlich "Ungemessen blieb: , , , ." - vier Luecken ohne
         Namen. Aufgefallen ist es erst, als eine Gelegenheit vier
         ungemessene Dimensionen hatte; bei einer sah es nach einem
         Satzzeichenfehler aus. */
      parts.push("Ungemessen blieb: " + missing.map(function (m) {
        return DIMENSION_LABELS[m] || m; }).join(", ") + ".");
    }
    return parts.join(" ");
  }

  function refuse(components, coverage, methodology, reason, diagnose) {
    diagnose = diagnose || {};
    return {
      available: false,
      state: "UNAVAILABLE",
      score: null,
      coverage: Math.round(coverage * 1000) / 1000,
      /* Eine Ablehnung braucht dieselbe Diagnose wie eine Annahme.
         Ohne sie liest sich "zu wenig Abdeckung" wie ein Urteil ueber
         das Thema, obwohl daneben stehen koennte, dass die Haelfte der
         Dimensionen systemisch gar nicht messbar ist. */
      reachableCoverage: diagnose.reachableCoverage === undefined
        ? null : diagnose.reachableCoverage,
      notApplicable: diagnose.notApplicable || [],
      systemicallyUnavailable: diagnose.systemicallyUnavailable || [],
      notActivated: diagnose.notActivated || [],
      methodologyVersion: methodology.version,
      components: components,
      drivers: [],
      missing: DIMENSIONS.filter(function (d) { return !components[d].available; })
        .map(function (d) { return { dimension: d, label: DIMENSION_LABELS[d], reason: components[d].reason }; }),
      proposable: false,
      autonomous: false,
      explanation: "Keine Gelegenheit: " + reason
    };
  }

  /**
   * Priorisierung mehrerer Gelegenheiten. Sortiert nach Score, aber mit
   * einer Regel dazu: zwei Gelegenheiten zum selben Thema sind eine.
   * Ohne diese Regel fuellt ein einziges Ereignis die ganze Tagesplanung.
   */
  function prioritize(opportunities, options) {
    options = options || {};
    var limit = options.limit || 10;
    var perTopic = options.maxPerTopic || 1;

    var seen = Object.create(null);
    return (opportunities || [])
      .filter(function (o) { return o && o.score !== null && o.proposable !== false; })
      .slice()
      .sort(function (a, b) { return (b.score || 0) - (a.score || 0); })
      .filter(function (o) {
        var key = String(o.topic || "").toLowerCase().trim();
        seen[key] = (seen[key] || 0) + 1;
        return seen[key] <= perTopic;
      })
      .slice(0, limit);
  }

  var api = {
    DIMENSIONS: DIMENSIONS,
    DIMENSION_LABELS: DIMENSION_LABELS,
    DEFAULT_METHODOLOGY: DEFAULT_METHODOLOGY,
    score: score,
    prioritize: prioritize
  };

  if (isNode) module.exports = api;
  else global.VUSocialOpportunity = api;
})(typeof window !== "undefined" ? window : globalThis);
