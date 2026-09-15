/* =========================================================================
   VISION UNIVERSE SOCIAL — visual.js
   VISUAL STRATEGY LAYER (§13) UND VIDEO READINESS (§14)

   Social Content ist nicht Text mit Bild daneben. Die Bildform entscheidet
   mit, ob eine Information ankommt — ein Chart erklaert eine Entwicklung,
   Atlas traegt die Marke, eine Data Card traegt eine einzelne Zahl.

   DIE REGEL, DIE ALLES ANDERE BINDET

   Ein Visual darf nichts suggerieren, was die Daten nicht hergeben.

   Ein Chart ohne Datenreihe ist kein Chart, sondern eine Illustration in
   Chartform — und die ist im Investmentkontext eine Falschaussage. Diese
   Datei laesst deshalb kein Chart zu, dem die Reihe fehlt, und keinen
   Zahlenvisual ohne belegte Zahl (§27).

   VIDEO: DIE BESTEHENDE VU-REGEL

   Generierte Videos enthalten standardmaessig KEINE automatisch ins Bild
   gerenderten Texte. Text und Untertitel sind getrennte, kontrollierte
   Ebenen. Die Regel steht hier als Code, weil sie sonst beim ersten
   Video-Experiment verloren geht.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSocialSchema;
  var Brand = isNode ? require("./brand.js") : global.VUSocialBrand;

  /* Was jede Bildform VORAUSSETZT. Ohne die Voraussetzung wird sie nicht
     gewaehlt — und auf keinen Fall mit Platzhaltern gefuellt. */
  var VISUAL_REQUIREMENTS = {
    CHART:              { needs: ["timeSeries"],      strength: "Entwicklung ueber Zeit" },
    NUMBER_VISUAL:      { needs: ["keyNumber"],       strength: "eine einzelne, harte Zahl" },
    DATA_CARD:          { needs: ["keyNumber"],       strength: "Zahl mit Kontext" },
    ATLAS:              { needs: ["atlasAsset"],      strength: "Markenpraesenz, Wiedererkennung" },
    COMPANY_VISUAL:     { needs: ["companyAsset"],    strength: "konkretes Unternehmen oder Produkt" },
    CAROUSEL:           { needs: ["multiplePoints"],  strength: "mehrere Schritte oder Vergleiche" },
    MOTION_GRAPHIC:     { needs: ["timeSeries"],      strength: "Bewegung in Daten" },
    VIDEO:              { needs: ["narrative"],       strength: "Erklaerung mit Verlauf" },
    MINIMAL_TYPOGRAPHY: { needs: [],                  strength: "starke Aussage ohne Datenbedarf" },
    MIXED:              { needs: ["timeSeries", "keyNumber"], strength: "Daten und Marke zusammen" }
  };

  /* Welche Bildform zu welchem Archetyp passt, absteigend. Startwissen —
     die Learning Engine darf die Reihenfolge aendern (§21). */
  var ARCHETYPE_PREFERENCE = {
    BREAKING_MARKET_INSIGHT: ["NUMBER_VISUAL", "DATA_CARD", "MINIMAL_TYPOGRAPHY"],
    EXPLAIN_THE_MOVE:        ["CHART", "DATA_CARD", "MIXED"],
    FUTURE_TECHNOLOGY:       ["ATLAS", "COMPANY_VISUAL", "MINIMAL_TYPOGRAPHY"],
    STOCK_STORY:             ["CHART", "CAROUSEL", "DATA_CARD"],
    DATA_STORY:              ["CHART", "MIXED", "DATA_CARD"],
    MYTH_VS_REALITY:         ["CAROUSEL", "MINIMAL_TYPOGRAPHY", "DATA_CARD"],
    OPPORTUNITY_RISK:        ["CAROUSEL", "CHART", "DATA_CARD"],
    EDUCATIONAL:             ["CAROUSEL", "ATLAS", "MINIMAL_TYPOGRAPHY"],
    MARKET_CONTEXT:          ["CHART", "MIXED", "DATA_CARD"],
    CONTRARIAN_INSIGHT:      ["MINIMAL_TYPOGRAPHY", "CHART", "CAROUSEL"],
    VISUAL_DATA_STORY:       ["CHART", "MOTION_GRAPHIC", "MIXED"],
    COMPANY_DEEP_DIVE:       ["CAROUSEL", "COMPANY_VISUAL", "CHART"],
    WEEKLY_THEME:            ["ATLAS", "CAROUSEL", "MINIMAL_TYPOGRAPHY"],
    TREND_EXPLAINER:         ["CAROUSEL", "CHART", "ATLAS"]
  };

  /**
   * Waehlt eine Bildform.
   *
   * @param spec.archetype
   * @param spec.available  { timeSeries, keyNumber, atlasAsset, companyAsset,
   *                          multiplePoints, narrative }  — je true/false
   * @param spec.recentVisuals  zuletzt genutzte Bildformen (gegen Monotonie)
   */
  function selectVisual(spec) {
    spec = spec || {};
    var available = spec.available || {};
    var recent = Array.isArray(spec.recentVisuals) ? spec.recentVisuals : [];
    var preference = ARCHETYPE_PREFERENCE[spec.archetype] || Schema.VISUAL_TYPES;

    var evaluated = preference.map(function (type) {
      var req = VISUAL_REQUIREMENTS[type] || { needs: [] };
      var missing = req.needs.filter(function (n) { return available[n] !== true; });
      return {
        visualType: type,
        possible: missing.length === 0,
        missing: missing,
        strength: req.strength,
        recentUses: recent.filter(function (r) { return r === type; }).length
      };
    });

    var possible = evaluated.filter(function (e) { return e.possible; });
    if (possible.length === 0) {
      return {
        visualType: null,
        possible: evaluated,
        /* KEIN Rueckfall auf "dann halt Typografie". Wenn nichts geht,
           fehlt Material — und das ist eine Information, kein Problem,
           das man mit einem Platzhalter zudeckt. */
        reason: "Keine Bildform moeglich. Es fehlt: " +
          Array.from(new Set(evaluated.reduce(function (acc, e) { return acc.concat(e.missing); }, []))).join(", ") + ".",
        explanation: "Kein Visual: das noetige Material liegt nicht vor. Ein Chart ohne Datenreihe " +
                     "waere eine Illustration, die wie eine Messung aussieht."
      };
    }

    /* Unter den moeglichen: die bevorzugte, aber mit Abschlag fuer
       kuerzliche Nutzung — sonst sieht das Profil nach Schablone aus (§29). */
    var chosen = possible.slice().sort(function (a, b) {
      if (a.recentUses !== b.recentUses) return a.recentUses - b.recentUses;
      return preference.indexOf(a.visualType) - preference.indexOf(b.visualType);
    })[0];

    return {
      visualType: chosen.visualType,
      possible: evaluated,
      reason: chosen.visualType + " — " + chosen.strength +
        (chosen.recentUses ? " (zuletzt " + chosen.recentUses + "-mal genutzt)" : ""),
      explanation: "Gewaehlt: " + chosen.visualType + ", weil " + chosen.strength +
        " zu " + (spec.archetype || "diesem Beitrag") + " passt und das noetige Material vorliegt."
    };
  }

  /**
   * Erzeugt einen Visual Brief. Er beschreibt, WAS gezeigt wird — nicht,
   * wie es gerendert wird. Die Umsetzung liegt beim Bildgenerator oder
   * beim Chart-Modul.
   */
  function buildBrief(spec) {
    spec = spec || {};
    var brief = {
      visualType: spec.visualType || null,
      title: spec.title || null,
      /* Daten kommen als REFERENZ, nicht als Kopie: ein Brief, der Zahlen
         enthaelt, wird zur zweiten Wahrheitsquelle. */
      dataReferences: Array.isArray(spec.dataReferences) ? spec.dataReferences.slice() : [],
      annotations: Array.isArray(spec.annotations) ? spec.annotations.slice() : [],
      atlas: null,
      textLayers: [],
      constraints: []
    };

    if (spec.visualType === "ATLAS" || spec.includeAtlas) {
      var atlasCheck = Brand.checkAtlasUsage(spec.atlas || {});
      brief.atlas = {
        referenceAsset: (spec.atlas && spec.atlas.referenceAsset) || Brand.ATLAS_ASSET_PATH,
        transforms: (spec.atlas && spec.atlas.transforms) || ["reframe"],
        approved: atlasCheck.passed,
        note: atlasCheck.explanation
      };
      if (!atlasCheck.passed) brief.constraints.push("Atlas-Regel verletzt: " + atlasCheck.explanation);
    }

    if (spec.visualType === "CHART" || spec.visualType === "MIXED" || spec.visualType === "MOTION_GRAPHIC") {
      if (brief.dataReferences.length === 0) {
        brief.constraints.push("Ein Chart ohne Datenreferenz wird nicht erzeugt.");
      }
      brief.constraints.push("Achsen beschriftet, Zeitraum genannt, Quelle genannt.");
      brief.constraints.push("Keine geglaetteten oder extrapolierten Verlaeufe ohne Kennzeichnung.");
    }

    return brief;
  }

  /* ------------------------------------------------------------------ */
  /* VIDEO (§14)                                                          */
  /* ------------------------------------------------------------------ */

  var VIDEO_STAGES = ["CONCEPT", "STORYBOARD", "SCENE_PLAN", "GENERATION",
                      "ASSEMBLY", "AUDIO", "VALIDATION", "PUBLISHING"];

  /**
   * Ein Videoplan. Die Engine ist VORBEREITET, nicht gebaut — und sagt
   * das (§45). Wer hier eine fertige Videogenerierung erwartet, bekommt
   * NOT_IMPLEMENTED und keine leere Datei.
   */
  function planVideo(spec) {
    spec = spec || {};
    var scenes = Array.isArray(spec.scenes) ? spec.scenes : [];

    /* DIE VU-REGEL (§14): keine automatisch ins Bild gerenderten Texte,
       sofern das Format sie nicht ausdruecklich verlangt. Text bleibt eine
       eigene Ebene, die jemand kontrolliert. */
    var burnInAllowed = spec.formatRequiresBurnedInText === true;

    var problems = [];
    scenes.forEach(function (scene, i) {
      if (scene.burnInText && !burnInAllowed) {
        problems.push("Szene " + (i + 1) + ": eingebrannter Text ist nicht zugelassen. " +
                      "Text gehoert in eine separate Ebene.");
      }
    });

    return {
      implemented: false,
      status: "NOT_IMPLEMENTED",
      stages: VIDEO_STAGES,
      scenes: scenes.map(function (scene, i) {
        return {
          index: i,
          description: scene.description || null,
          durationSeconds: Schema.numberOrNull(scene.durationSeconds),
          /* Getrennte Ebenen, nicht eingebrannt. */
          textLayer: scene.burnInText && !burnInAllowed ? null : (scene.textLayer || null),
          burnInText: burnInAllowed ? (scene.burnInText || null) : null
        };
      }),
      textPolicy: burnInAllowed
        ? "Das Format verlangt Text im Bild; er ist ausdruecklich freigegeben."
        : "Keine automatisch eingebrannten Texte. Untertitel und Bauchbinden sind getrennte Ebenen.",
      problems: problems,
      explanation: "Die Video-Pipeline ist als Ablauf definiert, aber nicht implementiert. " +
                   "Sie meldet NOT_IMPLEMENTED statt ein leeres Ergebnis zu liefern."
    };
  }

  var api = {
    VISUAL_REQUIREMENTS: VISUAL_REQUIREMENTS,
    ARCHETYPE_PREFERENCE: ARCHETYPE_PREFERENCE,
    VIDEO_STAGES: VIDEO_STAGES,
    selectVisual: selectVisual,
    buildBrief: buildBrief,
    planVideo: planVideo
  };

  if (isNode) module.exports = api;
  else global.VUSocialVisual = api;
})(typeof window !== "undefined" ? window : globalThis);
