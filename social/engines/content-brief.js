/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/content-brief.js

   DER CONTENT BRIEF — DAS EINZIGE, WAS EIN AUTOR SIEHT

   -------------------------------------------------------------------------
   DIE TRENNLINIE
   -------------------------------------------------------------------------

     FAKTEN / EVIDENZ      deterministisch, an Belege gebunden
     STRATEGIE / BRIEF     die bestehende Intelligence
     -------------------------------------------------- hier verlaeuft sie
     AUTHORING             generativ
     -------------------------------------------------- und hier zurueck
     CLAIM VALIDATION      deterministisch
     BRAND / QUALITY       deterministisch bzw. evidenzgebunden

   Der Brief ist die Uebergabe an der oberen Linie. Alles, was ein Autor
   ueber die Welt erfaehrt, steht hier drin — und nur das. Er bekommt
   keinen Zugriff auf Signale, keine Suche, keine Historie, kein
   Werkzeug.

   Das ist nicht Misstrauen gegen ein bestimmtes Modell. Es ist die
   einzige Bauweise, in der die Frage "woher stammt diese Zahl"
   ueberhaupt beantwortbar bleibt: eine Zahl im fertigen Text kann nur
   aus dem Brief stammen, sonst ist sie erfunden.

   -------------------------------------------------------------------------
   WAS AUSDRUECKLICH DRINSTEHT
   -------------------------------------------------------------------------

   `mustNotClaim` ist die wichtigste Liste. Sie sagt, was die Belege
   NICHT hergeben — keine Ursache, keine Prognose, kein Vergleich ohne
   Vergleichsgruppe. Ein Autor, der nur die Belege sieht, weiss nicht,
   was fehlt; er sieht eine Zahl und denkt sich den Rest dazu.

   -------------------------------------------------------------------------
   UNTRUSTED INPUT
   -------------------------------------------------------------------------

   Externer Text (Kommentare, fremde Beitraege) kommt NIE roh in den
   Brief. Wo er vorkommt, ist er durch `untrusted.js` gerahmt und als
   Datum markiert — nie als Anweisung.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  var PLATTFORM_GRENZEN = {
    instagram: { captionMax: 2200, hookMax: 120, hashtagMax: 12 },
    linkedin:  { captionMax: 3000, hookMax: 140, hashtagMax: 5 },
    x:         { captionMax: 280,  hookMax: 100, hashtagMax: 3 }
  };

  /**
   * Baut den Brief.
   *
   * @param spec.opportunity        { opportunityId, topic, premise, hasCause, timeSensitivity }
   * @param spec.strategyDecision   { archetype, mode, timingHour, strategyVersion }
   * @param spec.visual             { visualType }
   * @param spec.evidence           die Belege aus RESEARCH (sourceRefs mit Wert)
   * @param spec.learned            gelernte Vorlieben aus dem Gedaechtnis
   * @param spec.platform           "instagram" | ...
   */
  function build(spec) {
    spec = spec || {};
    var opportunity = spec.opportunity || {};
    var entscheidung = spec.strategyDecision || {};
    var platform = spec.platform || "instagram";
    var grenzen = PLATTFORM_GRENZEN[platform] || PLATTFORM_GRENZEN.instagram;

    /* Die Belege in der Form, in der ein Autor sie braucht: eine
       Kennung, damit eine Aussage spaeter auf genau diesen Beleg zeigen
       kann, und der Wert als Text UND als Zahl. */
    var evidence = (spec.evidence || [])
      .filter(function (e) { return e && e.value !== null && e.value !== undefined; })
      .map(function (e, i) {
        return {
          id: "ev" + (i + 1),
          entity: e.entity || null,
          metric: e.metric || null,
          value: e.value,
          unit: e.unit || null,
          source: (e.source && e.source.source) || e.source || null,
          observedAt: (e.source && e.source.observedAt) || e.observedAt || null,
          state: (e.source && e.source.state) || e.state || null
        };
      });

    /* ---------------------------------------------------------------
       WAS DIE BELEGE NICHT HERGEBEN

       Die Liste entsteht aus dem, was FEHLT — nicht aus einer
       Stilvorgabe. Sie ist der Grund, warum ein Autor, der nur Zahlen
       sieht, sich den Rest nicht dazudenken darf.
       --------------------------------------------------------------- */
    var mustNotClaim = [];

    if (!opportunity.hasCause) {
      mustNotClaim.push({
        id: "causality",
        text: "Keine Ursache behaupten. Die Belege beschreiben eine Lage; " +
          "eine Lage ist nicht ihr eigener Grund."
      });
    }
    mustNotClaim.push({
      id: "forecast",
      text: "Keine Prognose. Kein Beleg sagt etwas ueber die Zukunft."
    });
    mustNotClaim.push({
      id: "recommendation",
      text: "Keine Empfehlung, keine Handlungsaufforderung zum Kaufen oder Verkaufen."
    });

    var entitaeten = {};
    evidence.forEach(function (e) { if (e.entity) entitaeten[e.entity] = true; });
    if (Object.keys(entitaeten).length < 2) {
      mustNotClaim.push({
        id: "comparison",
        text: "Kein Vergleich mit anderen Titeln, Zeitraeumen oder Durchschnitten — " +
          "es liegt nur ein Beleg zu einem Gegenstand vor."
      });
    }

    var hatZeitreihe = evidence.some(function (e) { return Array.isArray(e.series); });
    if (!hatZeitreihe) {
      mustNotClaim.push({
        id: "trend",
        text: "Keine Entwicklung ueber Zeit behaupten ('steigt seit', 'faellt weiter') — " +
          "es liegt ein Stand vor, keine Reihe."
      });
    }

    /* Der Pflichthinweis. Er steht im Brief und nicht erst im Tor,
       damit ein Autor ihn einbaut statt daran zu scheitern. */
    var nenntEinzelwert = Object.keys(entitaeten).length > 0;

    return {
      briefId: Hash.prefixedHash("brief", {
        opportunityId: opportunity.opportunityId || null,
        archetype: entscheidung.archetype || null,
        evidence: evidence.map(function (e) { return e.id + ":" + e.value; })
      }),
      createdAt: spec.now || null,

      /* ------------------------------------------------ Was zu sagen ist */
      topic: opportunity.topic || null,
      archetype: entscheidung.archetype || null,
      premise: opportunity.premise || null,
      timeSensitivity: opportunity.timeSensitivity || null,
      mode: entscheidung.mode || null,
      strategyVersion: entscheidung.strategyVersion || null,
      visualType: (spec.visual && spec.visual.visualType) || null,
      platform: platform,

      /* --------------------------------------------- Woraus es zu sagen ist */
      evidence: evidence,
      mustNotClaim: mustNotClaim,
      allowCausality: opportunity.hasCause === true,

      /* ------------------------------------------------- Wie es zu sagen ist */
      constraints: {
        captionMax: grenzen.captionMax,
        hookMax: grenzen.hookMax,
        hashtagMax: grenzen.hashtagMax,
        language: "de",
        register: "sachlich, praezise, ohne Superlative und ohne Ausrufezeichen",
        requireDisclaimer: nenntEinzelwert,
        disclaimer: nenntEinzelwert ? "Keine Anlageberatung." : null
      },

      /* ------------------------------------------------ Was bisher wirkte */
      learned: spec.learned || { hookPatterns: [], note:
        "Noch keine gemessene Praeferenz. Erkundung ist hier die richtige Wahl." },

      /* Eingerahmter externer Text, falls vorhanden. NIE roh. */
      untrustedContext: spec.untrustedContext || null
    };
  }

  /** Die Belege als kompakte Zeilen — fuer Prompts und fuer Menschen. */
  function evidenceLines(brief) {
    return ((brief && brief.evidence) || []).map(function (e) {
      return e.id + ": " + (e.entity ? e.entity + " " : "") + e.metric + " = " +
        e.value + (e.unit ? " " + e.unit : "") +
        " (Quelle " + e.source + ", Stand " + (e.observedAt || "unbekannt") + ")";
    });
  }

  var api = {
    PLATTFORM_GRENZEN: PLATTFORM_GRENZEN,
    build: build,
    evidenceLines: evidenceLines
  };

  if (isNode) module.exports = api;
  else global.VUSocialContentBrief = api;
})(typeof window !== "undefined" ? window : globalThis);
