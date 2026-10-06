/* =========================================================================
   VISION UNIVERSE SOCIAL — fatigue.js
   SCHUTZ VOR CONTENT FATIGUE (§29)

   Content Fatigue ist der Zustand, in dem ein Publikum aufhoert
   hinzusehen, weil es den Beitrag schon kennt — nicht weil er schlecht
   ist, sondern weil er der vierte seiner Art in zwei Wochen ist.

   DAS TUECKISCHE DARAN

   Ein Lernsystem laeuft genau darauf zu. Was gestern gut lief, bekommt
   mehr Gewicht; was mehr Gewicht bekommt, wird oefter gewaehlt; was oefter
   gewaehlt wird, nutzt sich ab — und die Zahlen sagen erst dann etwas,
   wenn es zu spaet ist. Deshalb ist diese Pruefung eine SPERRE vor der
   Veroeffentlichung und keine Kennzahl im Bericht.

   FUENF ACHSEN

     Hook-Aehnlichkeit      dieselbe Formulierung
     Themenfrequenz         dasselbe Thema
     Entitaetsfrequenz      dasselbe Unternehmen
     Formatfolge            dasselbe Format hintereinander
     Visual-Wiederholung    dieselbe Bildform

   DIVERSITY SCORE

   0 bis 100. Er misst die Vielfalt des BESTANDS, nicht die Qualitaet
   eines einzelnen Beitrags — und beantwortet die Frage, die ein Blick
   auf ein Profil beantwortet: "sieht das hier abwechslungsreich aus?"
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Memory = isNode ? require("./memory.js") : global.VUSocialMemory;

  var DEFAULT_LIMITS = {
    /* Ab dieser Aehnlichkeit gilt eine Hook als Wiederholung. 0.55 ist
       erfahrungsgemaess die Grenze, ab der ein Mensch "hatten wir schon"
       denkt — darunter liest es sich als Variation. */
    hookSimilarity: 0.55,
    maxSameTopicPer14Days: 2,
    maxSameEntityPer7Days: 2,
    maxSameArchetypeInLast: 3,     /* von den letzten N Beitraegen */
    archetypeWindow: 5,
    maxSameVisualInLast: 3,
    visualWindow: 5,
    /* Fenster fuer den Diversity Score. */
    diversityWindowDays: 30,
    minimumDiversityScore: 45
  };

  /**
   * Shannon-Entropie einer Verteilung, normiert auf [0,1].
   * Sie beantwortet "wie gleichmaessig verteilt sich das" besser als eine
   * Zaehlung von Kategorien: fuenf Formate, von denen eines 90 % traegt,
   * sind keine fuenf Formate.
   */
  function normalizedEntropy(distribution) {
    var counts = Object.keys(distribution).map(function (k) { return distribution[k]; });
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    if (total === 0) return null;
    if (counts.length <= 1) return 0;
    var h = 0;
    counts.forEach(function (c) {
      if (c <= 0) return;
      var p = c / total;
      h -= p * Math.log2(p);
    });
    return h / Math.log2(counts.length);
  }

  /**
   * Die Sperre. Prueft einen Kandidaten gegen das Gedaechtnis.
   *
   * @returns { passed, blocking[], warnings[], similar[], explanation }
   */
  function check(candidate, memory, options) {
    options = options || {};
    var limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});
    var now = options.now || null;
    candidate = candidate || {};

    var blocking = [];
    var warnings = [];

    /* 1. Hook-Aehnlichkeit. */
    var similar = memory.mostSimilar(candidate, { limit: 5, windowDays: 60, now: now });
    var tooSimilar = similar.filter(function (s) { return s.hookSimilarity >= limits.hookSimilarity; });
    tooSimilar.forEach(function (s) {
      blocking.push({
        id: "hook-repeat",
        message: "Die Hook gleicht dem Beitrag vom " + String(s.publishedAt).slice(0, 10) +
                 " zu " + Math.round(s.hookSimilarity * 100) + " %: \"" + s.hook + "\".",
        publicationId: s.publicationId
      });
    });

    /* 2. Themenfrequenz. */
    if (candidate.topic) {
      var topicCount = memory.countTopic(candidate.topic, 14, now);
      if (topicCount >= limits.maxSameTopicPer14Days) {
        blocking.push({
          id: "topic-frequency",
          message: "Das Thema \"" + candidate.topic + "\" kam in den letzten 14 Tagen bereits " +
                   topicCount + "-mal vor (erlaubt: " + limits.maxSameTopicPer14Days + ")."
        });
      } else if (topicCount > 0) {
        warnings.push({ id: "topic-recent",
          message: "Das Thema kam in den letzten 14 Tagen " + topicCount + "-mal vor." });
      }
    }

    /* 3. Entitaetsfrequenz — "dieselben Aktien jeden Tag" (§18). */
    (candidate.entities || []).forEach(function (entity) {
      var n = memory.countEntity(entity, 7, now);
      if (n >= limits.maxSameEntityPer7Days) {
        blocking.push({
          id: "entity-frequency",
          message: entity + " kam in den letzten 7 Tagen bereits " + n + "-mal vor (erlaubt: " +
                   limits.maxSameEntityPer7Days + ")."
        });
      }
    });

    /* 4. Formatfolge. */
    var recent = memory.all()
      .filter(function (e) { return e.publishedAt; })
      .sort(function (a, b) { return Date.parse(b.publishedAt) - Date.parse(a.publishedAt); });

    if (candidate.archetype) {
      var window = recent.slice(0, limits.archetypeWindow);
      var same = window.filter(function (e) { return e.archetype === candidate.archetype; }).length;
      if (same >= limits.maxSameArchetypeInLast) {
        warnings.push({
          id: "archetype-run",
          message: "Von den letzten " + window.length + " Beitraegen waren " + same + " vom Typ " +
                   candidate.archetype + "."
        });
      }
    }

    /* 5. Visual-Wiederholung. */
    if (candidate.visualType) {
      var vwindow = recent.slice(0, limits.visualWindow);
      var vsame = vwindow.filter(function (e) { return e.visualType === candidate.visualType; }).length;
      if (vsame >= limits.maxSameVisualInLast) {
        warnings.push({
          id: "visual-run",
          message: "Von den letzten " + vwindow.length + " Beitraegen nutzten " + vsame +
                   " dieselbe Bildform (" + candidate.visualType + ")."
        });
      }
    }

    return {
      passed: blocking.length === 0,
      blocking: blocking,
      warnings: warnings,
      similar: similar,
      explanation: blocking.length === 0 && warnings.length === 0
        ? "Keine Wiederholung gegenueber dem bisherigen Bestand."
        : blocking.concat(warnings).map(function (x) { return x.message; }).join(" ")
    };
  }

  /**
   * Content Diversity Score ueber den Bestand.
   *
   * Vier Achsen, gleich gewichtet. Eine Achse ohne Daten wird
   * herausgenommen und nicht mit 0 eingesetzt — dieselbe Regel wie ueberall.
   */
  function diversityScore(memory, options) {
    options = options || {};
    var limits = Object.assign({}, DEFAULT_LIMITS, options.limits || {});
    var days = limits.diversityWindowDays;
    var now = options.now || null;

    var axes = [
      { id: "archetype",  label: "Formatvielfalt",     dist: memory.distribution("archetype", days, now) },
      { id: "visualType", label: "Bildvielfalt",       dist: memory.distribution("visualType", days, now) },
      { id: "topic",      label: "Themenvielfalt",     dist: memory.distribution("topic", days, now) },
      { id: "platform",   label: "Plattformverteilung",dist: memory.distribution("platform", days, now) }
    ];

    var scored = axes.map(function (axis) {
      var total = Object.keys(axis.dist).reduce(function (a, k) { return a + axis.dist[k]; }, 0);
      var entropy = normalizedEntropy(axis.dist);
      var dominant = Object.keys(axis.dist).sort(function (a, b) { return axis.dist[b] - axis.dist[a]; })[0] || null;
      return {
        id: axis.id, label: axis.label,
        available: total > 0 && entropy !== null,
        entropy: entropy,
        categories: Object.keys(axis.dist).length,
        total: total,
        dominant: dominant,
        dominantShare: total > 0 && dominant ? Math.round((axis.dist[dominant] / total) * 100) : null
      };
    });

    var usable = scored.filter(function (a) { return a.available; });
    if (usable.length === 0) {
      return {
        available: false, score: null, axes: scored,
        explanation: "Kein Diversity Score: im Fenster von " + days + " Tagen liegen keine Beitraege vor."
      };
    }

    var value = Math.round((usable.reduce(function (a, x) { return a + x.entropy; }, 0) / usable.length) * 100);
    var weakest = usable.slice().sort(function (a, b) { return a.entropy - b.entropy; })[0];

    return {
      available: true,
      score: value,
      passed: value >= limits.minimumDiversityScore,
      axes: scored,
      explanation: "Diversity Score " + value + " von 100 ueber " + days + " Tage. " +
        "Schwaechste Achse: " + weakest.label + " — " + weakest.categories + " Auspraegung(en), " +
        (weakest.dominant !== null
          ? "\"" + weakest.dominant + "\" traegt " + weakest.dominantShare + " %."
          : "keine Auspraegung erkennbar.")
    };
  }

  var api = {
    DEFAULT_LIMITS: DEFAULT_LIMITS,
    normalizedEntropy: normalizedEntropy,
    check: check,
    diversityScore: diversityScore
  };

  if (isNode) module.exports = api;
  else global.VUSocialFatigue = api;
})(typeof window !== "undefined" ? window : globalThis);
