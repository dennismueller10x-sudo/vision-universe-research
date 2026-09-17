/* =========================================================================
   VISION UNIVERSE SOCIAL — memory.js
   CONTENT MEMORY (§18)

   Was wurde veroeffentlicht, worueber, wie, wann, mit welchem Ergebnis.

   WOZU

   Ein System ohne Gedaechtnis wiederholt sich. Nicht weil es dumm ist,
   sondern weil dieselben Signale dieselben Antworten erzeugen: dieselbe
   Aktie, dieselbe Hook-Form, dasselbe Diagramm — jeden Dienstag.

   Das Gedaechtnis ist die Voraussetzung fuer drei andere Engines:
   fatigue.js braucht es fuer Aehnlichkeit, opportunity.js fuer
   Neuheit und Content Gap, learning.js fuer Stichproben.

   DETERMINISTISCH (§40)

   Aehnlichkeit wird hier nicht semantisch bestimmt, sondern ueber
   Token-Ueberschneidung (Jaccard) und Shingles. Das ist nachrechenbar,
   laeuft offline und kostet nichts. Ein Sprachmodell wuerde hier nur
   Unsicherheit und Kosten hinzufuegen — den semantischen Fall
   ("anderes Wort, gleiche Aussage") faengt es besser, aber erst als
   zweite Stufe und nur bei Kandidaten, die diese Stufe passieren.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Woerter ohne Unterscheidungskraft. Sie bleiben bewusst kurz: eine
     lange Stoppwortliste macht aus verschiedenen Saetzen gleiche. */
  var STOPWORDS = ["der", "die", "das", "und", "oder", "aber", "ein", "eine", "einen", "einem", "eines",
                   "ist", "sind", "war", "waren", "wird", "werden", "hat", "haben", "im", "in", "an",
                   "auf", "fuer", "mit", "von", "zu", "zum", "zur", "bei", "als", "wie", "nicht", "auch",
                   "sich", "dem", "den", "des", "es", "am", "so", "nur", "mehr", "the", "and", "for",
                   "with", "this", "that", "from", "are", "was", "has", "have"];

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9aeousszz\s%+-]/gi, " ")
      .split(/\s+/)
      .filter(function (w) { return w.length > 2 && STOPWORDS.indexOf(w) === -1; });
  }

  /** Jaccard-Aehnlichkeit zweier Wortmengen. */
  function jaccard(aTokens, bTokens) {
    if (!aTokens.length || !bTokens.length) return 0;
    var setA = Object.create(null);
    aTokens.forEach(function (t) { setA[t] = true; });
    var intersect = 0;
    var setB = Object.create(null);
    bTokens.forEach(function (t) {
      if (setB[t]) return;
      setB[t] = true;
      if (setA[t]) intersect++;
    });
    var union = Object.keys(setA).length + Object.keys(setB).length - intersect;
    return union === 0 ? 0 : intersect / union;
  }

  /** Wort-Trigramme — faengt umgestellte Saetze, die Jaccard uebersieht. */
  function shingles(tokens, n) {
    n = n || 3;
    var out = [];
    for (var i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
    return out;
  }

  function shingleSimilarity(a, b) {
    var sa = shingles(a), sb = shingles(b);
    if (!sa.length || !sb.length) return 0;
    return jaccard(sa, sb);
  }

  /**
   * Ein Gedaechtniseintrag. Er speichert die ENTSCHEIDUNG und das
   * ERGEBNIS — die Verbindung, die §17 verlangt.
   */
  function entry(spec) {
    spec = spec || {};
    var hookTokens = tokenize(spec.hook);
    return {
      publicationId: spec.publicationId || null,
      packageId: spec.packageId || null,
      publishedAt: spec.publishedAt || null,
      platform: spec.platform || null,
      topic: spec.topic || null,
      entities: Array.isArray(spec.entities) ? spec.entities.slice() : [],
      archetype: spec.archetype || null,
      visualType: spec.visualType || null,

      /* Das PLATTFORMFORMAT — REEL, CAROUSEL, IMAGE. Es steht bewusst
         neben `visualType` und nicht darin.

         `visualType` ist unser Vokabular fuer die gestalterische
         Entscheidung (CHART, DATA_CARD, MOTION_GRAPHIC ...).
         `mediaFormat` ist das, was der Plattform-Container sagt. Ein
         Reel in `visualType` abzulegen hiesse, aus "Instagram meldet ein
         Video" die Behauptung "wir haben MOTION_GRAPHIC gewaehlt" oder
         "wir haben VIDEO gewaehlt" zu machen — eine Entscheidung, die
         bei fremden Beitraegen niemand getroffen hat und die wir nicht
         kennen.

         Getrennt zu halten kostet ein Feld. Zusammenzuwerfen kostet die
         Unterscheidbarkeit von Gemessenem und Angenommenem. */
      mediaFormat: spec.mediaFormat || null,

      /* WELCHES TEXTMUSTER diesen Beitrag geschrieben hat, und wer.

         Ohne diese zwei Felder laesst sich messen, DASS ein Beitrag
         getragen hat — aber nicht, WAS daran. Genau das ist die Frage,
         die die Autorenschicht beantworten koennen soll: welcher
         Einstieg, welcher Aufbau, welcher Schwerpunkt.

         Und sie gehoeren in diese Whitelist, nicht nur in den Eintrag:
         dieselbe Falle hat schon `performanceRegime` und die Freigabe
         erwischt. Eine Whitelist ist eine gute Verteidigung und ein
         schlechtes Gedaechtnis. */
      authoringPattern: spec.authoringPattern || null,
      authoringAuthorId: spec.authoringAuthorId || null,
      hook: spec.hook || null,
      hookTokens: hookTokens,
      captionTokens: tokenize(spec.caption),
      cta: spec.cta || null,
      dataSources: Array.isArray(spec.dataSources) ? spec.dataSources.slice() : [],
      trendContext: spec.trendContext || null,
      /* performance bleibt null, bis Analytics geliefert haben. Eine 0
         waere die Aussage "es lief schlecht" (§37). */
      performance: spec.performance === undefined ? null : spec.performance,
      audienceReaction: spec.audienceReaction === undefined ? null : spec.audienceReaction,

      /* ---------------------------------------------------------------
         DIE HERKUNFT DES BEITRAGS
         ---------------------------------------------------------------

         Ein Gedaechtnis, das nur weiss WAS veroeffentlicht wurde, kann
         spaeter nicht sagen WARUM. Genau das ist aber die Frage, die
         eine lernende Strategie beantworten koennen muss: welches Signal
         den Anlass gab, welche Gelegenheit daraus wurde, unter welcher
         Strategie-Version entschieden wurde und welche Hypothese geprueft
         werden sollte.

         Alle Felder duerfen `null` sein, und das ist keine Nachlaessigkeit:
         der bisher einzige reale Beitrag dieses Projekts war ein
         Verbindungstest. Er hatte kein Signal und keine Hypothese. Diese
         Vorgeschichte zu erfinden, damit das Feld gefuellt aussieht, waere
         genau die Art Zahl, die spaeter als Beleg zitiert wird. */
      lineage: {
        origin: (spec.lineage && spec.lineage.origin) || spec.origin || null,
        signalIds: Array.isArray(spec.lineage && spec.lineage.signalIds)
          ? spec.lineage.signalIds.slice() : [],
        opportunityId: (spec.lineage && spec.lineage.opportunityId) || null,
        experimentId: (spec.lineage && spec.lineage.experimentId) || null,
        hypothesis: (spec.lineage && spec.lineage.hypothesis) || null,
        strategyVersion: (spec.lineage && spec.lineage.strategyVersion) || null,
        decidedMode: (spec.lineage && spec.lineage.decidedMode) || null,

        /* DIE FREIGABE.

           "Wer wollte das" ist bei einem oeffentlichen Beitrag die erste
           Frage, und sie muss aus derselben Quelle beantwortbar sein wie
           alles andere — nicht aus einem zweiten Protokoll, das auch
           fehlen koennte.

           Diese vier Felder standen zuerst nicht in dieser Liste. Sie
           waren im Eintrag, sie waren im Test, und sie waeren beim
           Speichern verschwunden: dieselbe Falle, in die schon
           `performanceRegime` getappt ist. Eine Whitelist ist eine gute
           Verteidigung und ein schlechtes Gedaechtnis. */
        candidateId: (spec.lineage && spec.lineage.candidateId) || null,
        approvedBy: (spec.lineage && spec.lineage.approvedBy) || null,
        approvedAt: (spec.lineage && spec.lineage.approvedAt) || null,
        contentHash: (spec.lineage && spec.lineage.contentHash) || null
      },

      /* Die Kennung auf der Plattform. Ohne sie laesst sich gemessene
         Leistung keinem Beitrag zuordnen — das Gedaechtnis waere voll und
         trotzdem stumm. */
      externalPostId: spec.externalPostId || null,
      permalink: spec.permalink || null,

      /* Woher die Leistungszahlen stammen. Eine gemessene Zahl und eine
         simulierte duerfen nie gleich aussehen (§11). */
      performanceProvenance: spec.performanceProvenance || null,

      /* Unter welchem Massstab die Zahl entstand.
     
         Diese zwei Felder MUESSEN hier stehen. `entry()` ist eine
         Positivliste, und beim Laden von der Platte laeuft jeder
         Eintrag durch sie hindurch. Fehlten sie, waere das Etikett nach
         einem Neustart weg — und die Learning Engine wuerde
         BOOTSTRAP-Werte mit MATURE-Werten in einen Mittelwert werfen,
         also genau das tun, wogegen das Etikett existiert. Ein Test hat
         das gefunden; ohne ihn waere es erst in einer Strategie
         aufgefallen, die einer Umstellung des Massstabs hinterherlaeuft. */
      performanceRegime: spec.performanceRegime || null,
      performanceCohort: spec.performanceCohort || null
    };
  }

  function createMemory(existingEntries) {
    var entries = (existingEntries || []).map(function (e) {
      /* Wiederhergestellte Eintraege bringen ihre Tokens mit oder bekommen
         sie neu — ein Gedaechtnis, das je nach Ladeweg anders rechnet,
         waere schlimmer als keines. */
      return e.hookTokens ? e : entry(e);
    });

    function add(spec) {
      var e = entry(spec);
      entries.push(e);
      return e;
    }

    function all() { return entries.slice(); }

    function since(isoDate) {
      var cutoff = Date.parse(isoDate);
      return entries.filter(function (e) {
        return e.publishedAt && Date.parse(e.publishedAt) >= cutoff;
      });
    }

    function withinDays(days, nowIso) {
      var nowMs = nowIso ? Date.parse(nowIso) : Date.now();
      var cutoff = nowMs - days * 24 * 3600 * 1000;
      return entries.filter(function (e) {
        return e.publishedAt && Date.parse(e.publishedAt) >= cutoff;
      });
    }

    /** Tage seit der letzten Behandlung eines Themas — Eingabe fuer novelty. */
    function daysSinceTopic(topic, nowIso) {
      var nowMs = nowIso ? Date.parse(nowIso) : Date.now();
      var key = String(topic || "").toLowerCase().trim();
      var matches = entries.filter(function (e) {
        return String(e.topic || "").toLowerCase().trim() === key && e.publishedAt;
      });
      if (matches.length === 0) return null;   /* nie behandelt — nicht "vor 0 Tagen" */
      var latest = Math.max.apply(null, matches.map(function (e) { return Date.parse(e.publishedAt); }));
      return (nowMs - latest) / (24 * 3600 * 1000);
    }

    /** Wie oft ein Thema im Fenster vorkam — Eingabe fuer saturation. */
    function countTopic(topic, days, nowIso) {
      var key = String(topic || "").toLowerCase().trim();
      return withinDays(days || 14, nowIso).filter(function (e) {
        return String(e.topic || "").toLowerCase().trim() === key;
      }).length;
    }

    /** Wie oft ein Unternehmen im Fenster vorkam. */
    function countEntity(entity, days, nowIso) {
      var key = String(entity || "").toUpperCase().trim();
      return withinDays(days || 14, nowIso).filter(function (e) {
        return e.entities.some(function (x) { return String(x).toUpperCase().trim() === key; });
      }).length;
    }

    /** Verteilung ueber eine Dimension — Eingabe fuer Content Gap und Learning. */
    function distribution(dimension, days, nowIso) {
      var out = Object.create(null);
      withinDays(days || 30, nowIso).forEach(function (e) {
        var value = e[dimension];
        if (value === null || value === undefined) return;
        out[value] = (out[value] || 0) + 1;
      });
      return out;
    }

    /**
     * Die aehnlichsten frueheren Beitraege. Kombiniert Hook- und
     * Textaehnlichkeit; die Hook wiegt schwerer, weil sie das ist, was
     * ein Leser als Wiederholung erkennt.
     */
    function mostSimilar(candidate, options) {
      options = options || {};
      var limit = options.limit || 5;
      var windowDays = options.windowDays || 60;
      var pool = withinDays(windowDays, options.now);
      var hookTokens = tokenize(candidate.hook);
      var captionTokens = tokenize(candidate.caption);

      return pool.map(function (e) {
        var hookSim = Math.max(jaccard(hookTokens, e.hookTokens), shingleSimilarity(hookTokens, e.hookTokens));
        var textSim = Math.max(jaccard(captionTokens, e.captionTokens), shingleSimilarity(captionTokens, e.captionTokens));
        var topicSame = candidate.topic && e.topic &&
          String(candidate.topic).toLowerCase() === String(e.topic).toLowerCase();
        var entityOverlap = (candidate.entities || []).some(function (x) {
          return e.entities.some(function (y) { return String(x).toUpperCase() === String(y).toUpperCase(); });
        });
        var similarity = 0.55 * hookSim + 0.25 * textSim + (topicSame ? 0.12 : 0) + (entityOverlap ? 0.08 : 0);
        return {
          publicationId: e.publicationId, publishedAt: e.publishedAt,
          topic: e.topic, hook: e.hook, archetype: e.archetype, visualType: e.visualType,
          hookSimilarity: Math.round(hookSim * 1000) / 1000,
          textSimilarity: Math.round(textSim * 1000) / 1000,
          sameTopic: !!topicSame, sharedEntity: entityOverlap,
          similarity: Math.round(Math.min(1, similarity) * 1000) / 1000
        };
      })
      .sort(function (a, b) { return b.similarity - a.similarity; })
      .slice(0, limit);
    }

    /** Leistung vergleichbarer Beitraege — Eingabe fuer opportunity.js. */
    function comparablePerformance(filter) {
      filter = filter || {};
      var matches = entries.filter(function (e) {
        if (e.performance === null || e.performance === undefined) return false;
        if (filter.archetype && e.archetype !== filter.archetype) return false;
        if (filter.platform && e.platform !== filter.platform) return false;
        if (filter.visualType && e.visualType !== filter.visualType) return false;
        return true;
      });
      if (matches.length === 0) return { sampleSize: 0, mean: null, reason: "Keine vergleichbaren Beitraege mit Ergebnis." };
      var sum = matches.reduce(function (acc, e) { return acc + Number(e.performance); }, 0);
      return {
        sampleSize: matches.length,
        mean: sum / matches.length,
        reason: matches.length + " vergleichbare Beitraege."
      };
    }

    return {
      add: add, all: all, since: since, withinDays: withinDays,
      daysSinceTopic: daysSinceTopic, countTopic: countTopic, countEntity: countEntity,
      distribution: distribution, mostSimilar: mostSimilar,
      comparablePerformance: comparablePerformance,
      size: function () { return entries.length; }
    };
  }

  var api = {
    STOPWORDS: STOPWORDS,
    tokenize: tokenize,
    jaccard: jaccard,
    shingles: shingles,
    shingleSimilarity: shingleSimilarity,
    entry: entry,
    createMemory: createMemory
  };

  if (isNode) module.exports = api;
  else global.VUSocialMemory = api;
})(typeof window !== "undefined" ? window : globalThis);
