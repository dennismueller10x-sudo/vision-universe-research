/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/external-intelligence.js

   WAS AUSSERHALB VON VISION UNIVERSE FUNKTIONIERT

   -------------------------------------------------------------------------
   DIESE SCHICHT IST GEBAUT UND NICHT ANGESCHLOSSEN
   -------------------------------------------------------------------------

   Der Zustand ist AWAITING_OWNER_SOURCE, und das ist kein Mangel,
   sondern die korrekte Antwort: jede reale Quelle verlangt entweder
   eine kostenpflichtige API, einen Plattformzugang mit eigenen Regeln
   oder Scraping. Alle drei sind Owner-Entscheidungen.

   Gebaut wird trotzdem jetzt. Eine Schnittstelle, die erst entsteht,
   wenn die Daten da sind, entsteht nach den Daten - und wird dann von
   ihnen geformt statt von der Frage, die sie beantworten soll.

   -------------------------------------------------------------------------
   MUSTER, NICHT INHALTE
   -------------------------------------------------------------------------

   Vision Universe lernt, WARUM etwas funktionieren koennte. Es kopiert
   keine fremden Texte, keine fremden Bilder, keine fremden Hooks.

   Deshalb speichert diese Schicht ausdruecklich KEINE Inhalte. Sie
   speichert Abstraktionen: Archetyp, Aufbau, Format, Bildmuster,
   Engagement-Verlauf. Ein Feld fuer den Originaltext existiert nicht -
   nicht, weil man es nicht fuellen duerfte, sondern damit es niemand
   fuellen KANN.

   -------------------------------------------------------------------------
   KORRELATION IST KEINE URSACHE
   -------------------------------------------------------------------------

   Dass ein Muster bei anderen Reichweite hatte, sagt nicht, dass es
   sie verursacht hat - und schon gar nicht, dass es das bei uns taete.
   Jede Beobachtung traegt deshalb `causalClaim: false` und wird erst
   durch ein eigenes Experiment zur Aussage.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  var STATE = {
    AVAILABLE: "AVAILABLE",
    AWAITING_OWNER_SOURCE: "AWAITING_OWNER_SOURCE",
    UNAVAILABLE: "UNAVAILABLE"
  };

  /* Was eine Beobachtung an sich tragen darf. Bewusst ohne Textfeld. */
  var HOOK_ARCHETYPES = [
    "QUESTION", "CONTRAST", "NUMBER_FIRST", "MISCONCEPTION", "LIST",
    "STORY_OPEN", "WARNING", "HOW_TO", "REVEAL", "COMPARISON"
  ];
  var FORMAT_PATTERNS = ["SINGLE_IMAGE", "CAROUSEL", "SHORT_VIDEO", "LONG_VIDEO", "TEXT"];
  var VISUAL_PATTERNS = ["DATA_HEAVY", "PORTRAIT", "TEXT_OVERLAY", "ILLUSTRATION",
    "SCREENSHOT", "CHART", "GENERATIVE", "PLAIN"];

  /**
   * Eine Quelle - beschrieben, nicht angebunden.
   *
   * Die Felder sind genau die, nach denen der Owner entscheiden muss.
   * "Wir brauchen eine API" ist keine Entscheidungsgrundlage.
   */
  function source(spec) {
    spec = spec || {};
    return {
      sourceId: spec.sourceId || null,
      label: spec.label || null,
      state: spec.state || STATE.AWAITING_OWNER_SOURCE,
      availableData: spec.availableData || null,
      accessMethod: spec.accessMethod || null,
      legalConstraints: spec.legalConstraints || null,
      rateLimit: spec.rateLimit || null,
      cost: spec.cost === undefined ? null : spec.cost,
      historicalDepth: spec.historicalDepth || null,
      metrics: Array.isArray(spec.metrics) ? spec.metrics.slice() : [],
      expectedValue: spec.expectedValue || null,
      alternatives: Array.isArray(spec.alternatives) ? spec.alternatives.slice() : [],
      requiresOwnerDecision: spec.requiresOwnerDecision !== false
    };
  }

  /**
   * Eine Beobachtung ueber fremden Inhalt.
   *
   * Was hier NICHT hineinpasst, ist Absicht: kein `text`, kein
   * `caption`, kein `imageUrl`, kein `hookText`. Ein Feld, das es nicht
   * gibt, kann niemand versehentlich fuellen.
   */
  function observation(spec) {
    spec = spec || {};
    var erlaubt = {
      observationId: spec.observationId || null,
      sourceId: spec.sourceId || null,
      observedAt: spec.observedAt || null,
      topicCategory: spec.topicCategory || null,
      hookArchetype: HOOK_ARCHETYPES.indexOf(spec.hookArchetype) !== -1
        ? spec.hookArchetype : null,
      formatPattern: FORMAT_PATTERNS.indexOf(spec.formatPattern) !== -1
        ? spec.formatPattern : null,
      visualPattern: VISUAL_PATTERNS.indexOf(spec.visualPattern) !== -1
        ? spec.visualPattern : null,
      storyPattern: spec.storyPattern || null,
      /* Relativ, nicht absolut: absolute Zahlen fremder Kanaele sagen
         ueber unseren nichts. */
      engagementRelative: spec.engagementRelative === undefined
        ? null : spec.engagementRelative,
      trendVelocity: spec.trendVelocity === undefined ? null : spec.trendVelocity,
      /* Woertlich mitgeschrieben. */
      causalClaim: false,
      copiedContent: false,
      provenance: spec.provenance || null
    };
    return erlaubt;
  }

  /* Felder, die eine Beobachtung NIEMALS tragen darf. Geprueft, nicht
     nur dokumentiert: eine Regel ohne Pruefung ist eine Bitte. */
  var VERBOTEN = ["text", "hookText", "caption", "body", "imageUrl",
    "imageData", "transcript", "quote", "screenshot"];

  function validateObservation(o) {
    var befunde = [];
    VERBOTEN.forEach(function (f) {
      if (o && Object.prototype.hasOwnProperty.call(o, f) &&
          o[f] !== null && o[f] !== undefined) {
        befunde.push({ id: "copiedContent",
          message: "Feld \"" + f + "\" enthaelt fremden Inhalt. Vision " +
            "Universe lernt Muster und kopiert keine Creatives." });
      }
    });
    if (o && o.causalClaim === true) {
      befunde.push({ id: "causalClaim",
        message: "Eine Beobachtung behauptet Ursaechlichkeit. Beobachtet " +
          "wurde Korrelation; eine Aussage wird daraus erst durch ein " +
          "eigenes Experiment." });
    }
    return { ok: befunde.length === 0, findings: befunde };
  }

  /**
   * Der Zustand der Schicht insgesamt.
   *
   * Solange keine Quelle angebunden ist, meldet sie das - statt eine
   * leere Musterdatenbank als "keine Muster gefunden" auszugeben.
   */
  function capability(sources) {
    var s = sources || [];
    var aktiv = s.filter(function (x) { return x.state === STATE.AVAILABLE; });
    return {
      state: aktiv.length ? STATE.AVAILABLE : STATE.AWAITING_OWNER_SOURCE,
      activeSources: aktiv.length,
      describedSources: s.length,
      ownerDecisionRequired: s.filter(function (x) { return x.requiresOwnerDecision; })
        .map(function (x) { return x.sourceId; }),
      explanation: aktiv.length
        ? aktiv.length + " externe Quelle(n) angebunden."
        : "Keine externe Quelle angebunden. Das ist kein Messergebnis " +
          "ueber fremde Muster, sondern die Abwesenheit einer Messung - " +
          "jede reale Quelle verlangt eine Owner-Entscheidung."
    };
  }

  var api = {
    STATE: STATE,
    HOOK_ARCHETYPES: HOOK_ARCHETYPES,
    FORMAT_PATTERNS: FORMAT_PATTERNS,
    VISUAL_PATTERNS: VISUAL_PATTERNS,
    VERBOTENE_FELDER: VERBOTEN,
    source: source,
    observation: observation,
    validateObservation: validateObservation,
    capability: capability
  };

  if (isNode) module.exports = api;
  else global.VUSocialExternalIntelligence = api;
})(typeof window !== "undefined" ? window : globalThis);
