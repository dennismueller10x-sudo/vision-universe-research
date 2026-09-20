/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/content-universe.js

   WORUEBER VISION UNIVERSE SPRECHEN KANN

   -------------------------------------------------------------------------
   DER BEFUND, AUS DEM DIESE DATEI ENTSTAND
   -------------------------------------------------------------------------

   In signals.js stand:

     var topic = definition.label + " — " + event.entity;

   Daraus wurde "Technisches Setup — XOM". Das ist kein Content-Konzept,
   das ist ein Datenbankereignis mit einem Bindestrich.

   Gemessen: 12 Signaltypen, 10 davon an ein einzelnes Instrument
   gebunden, 0 thematisch. Das Content Universe WAR das Ticker-Universum.
   Die Opportunity Engine waegt acht Dimensionen ab - und bekam nur
   Instrument-Ereignisse vorgelegt. Eine Auswahl kann nichts waehlen,
   was ihr nie vorgelegt wurde.

   -------------------------------------------------------------------------
   DREI TRENNUNGEN, DIE VORHER EINE WAREN
   -------------------------------------------------------------------------

   QUELLE      woher die Belege kommen (VU Quant, Magazin, Report, Markt)
   FAMILY      welche oeffentliche Form daraus wird (Education, Ranking, ...)
   ENTITAET    worueber gesprochen wird - und wie viele davon

   Die Quelle bestimmt NICHT die Form. Ein Aktienreport kann eine
   Stock Story tragen, eine Education oder einen Vergleich. Wer beides
   gleichsetzt, kann aus einer Quelle nur eine Sorte Inhalt machen -
   und produziert jeden Tag dasselbe.

   -------------------------------------------------------------------------
   ENTITAETEN: KEINE, EINE, ODER MEHRERE
   -------------------------------------------------------------------------

   "Was bedeutet eine Zinssenkung fuer Aktien?"   keine Entitaet
   "Exxon Mobil nach den Zahlen"                  eine
   "S&P 500 gegen Nasdaq"                         mehrere

   Die Datenstruktur darf keine Einzelaktie voraussetzen. Genau diese
   Annahme hat das bisherige System eng gemacht.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     WORUEBER GESPROCHEN WIRD
     ------------------------------------------------------------------- */
  var ENTITY_TYPES = [
    "STOCK", "ETF", "FUND", "INDEX", "SECTOR", "INDUSTRY",
    "COMMODITY", "MACRO", "RATES", "CURRENCY",
    /* Ausdruecklich: ein Thema ohne Entitaet ist kein unvollstaendiges
       Thema. "Was bedeutet eine Zinssenkung fuer Aktien?" braucht
       keinen Ticker und ist trotzdem ein vollwertiger Inhalt. */
    "NONE"
  ];

  /* -------------------------------------------------------------------
     WELCHE OEFFENTLICHE FORM DARAUS WIRD
     ------------------------------------------------------------------- */
  var CONTENT_FAMILIES = [
    "NEWS_NOW", "STOCK_STORY", "ETF_PRODUCT", "MARKET_EXPLAINER",
    "EDUCATION", "DATA_STORY", "RANKING", "COMPARISON", "MEGATREND",
    "DIVIDEND", "EARNINGS", "EVERGREEN",
    "VU_ORIGINAL_RESEARCH", "MAGAZINE_STORY", "REPORT_STORY"
  ];

  /* -------------------------------------------------------------------
     WOHER DIE BELEGE KOMMEN
     ------------------------------------------------------------------- */
  var CONTENT_SOURCES = [
    "VU_QUANT", "VU_DISCOVER", "VU_RESEARCH", "VU_MAGAZINE",
    "VU_STOCK_REPORT", "MARKET_DATA", "COMPANY_FILING",
    "NEWS_FEED", "EXTERNAL_SOCIAL", "EDITORIAL"
  ];

  /* -------------------------------------------------------------------
     WAS EINE QUELLE TRAGEN KANN — UND WAS NICHT

     Das ist eine FAEHIGKEITSAUSSAGE, keine Zuordnung. Eine Quelle
     kann mehrere Familien tragen; eine Familie kann aus mehreren
     Quellen entstehen. Ohne diese Tabelle faellt man in die alte
     Gleichsetzung zurueck: Quant-Signal, also Stock Story.

     Leer heisst nicht "alles erlaubt", sondern "diese Quelle ist fuer
     diese Familie nicht belegt". Fail closed, wie ueberall hier.
     ------------------------------------------------------------------- */
  var SOURCE_CAPABILITIES = {
    VU_QUANT:        ["STOCK_STORY", "DATA_STORY", "RANKING", "COMPARISON",
                      "MARKET_EXPLAINER", "VU_ORIGINAL_RESEARCH"],
    VU_DISCOVER:     ["RANKING", "COMPARISON", "DATA_STORY", "MEGATREND",
                      "ETF_PRODUCT"],
    VU_RESEARCH:     ["VU_ORIGINAL_RESEARCH", "DATA_STORY", "MARKET_EXPLAINER",
                      "MEGATREND"],
    VU_MAGAZINE:     ["MAGAZINE_STORY", "EDUCATION", "EVERGREEN",
                      "MARKET_EXPLAINER", "MEGATREND"],
    VU_STOCK_REPORT: ["REPORT_STORY", "STOCK_STORY", "EDUCATION", "COMPARISON"],
    MARKET_DATA:     ["NEWS_NOW", "DATA_STORY", "MARKET_EXPLAINER", "EARNINGS"],
    COMPANY_FILING:  ["EARNINGS", "STOCK_STORY", "DIVIDEND"],
    NEWS_FEED:       ["NEWS_NOW", "MARKET_EXPLAINER"],
    EXTERNAL_SOCIAL: ["MEGATREND", "EDUCATION", "EVERGREEN"],
    EDITORIAL:       ["EDUCATION", "EVERGREEN", "COMPARISON", "RANKING"]
  };

  /* -------------------------------------------------------------------
     WELCHE FAMILIE EIN ARCHETYP OEFFENTLICH IST

     Die Tabelle stand in audience-frame.js, weil sie dort gebraucht
     wurde. Sie ist aber eine Aussage ueber FAMILIEN, und Familien
     wohnen hier. Sie steht jetzt an einer Stelle und wird von dort
     gelesen - audience-frame.js reicht sie weiter, damit niemand
     zwei Tabellen pflegen muss, die auseinanderlaufen.

     Sie ist eine redaktionelle Zuordnung, keine Messung.
     ------------------------------------------------------------------- */
  var FAMILY_FOR_ARCHETYPE = {
    BREAKING_MARKET_INSIGHT: "NEWS_NOW",
    EXPLAIN_THE_MOVE:        "STOCK_STORY",
    FUTURE_TECHNOLOGY:       "MEGATREND",
    STOCK_STORY:             "STOCK_STORY",
    DATA_STORY:              "DATA_STORY",
    MYTH_VS_REALITY:         "EDUCATION",
    OPPORTUNITY_RISK:        "MARKET_EXPLAINER",
    EDUCATIONAL:             "EDUCATION",
    MARKET_CONTEXT:          "MARKET_EXPLAINER",
    CONTRARIAN_INSIGHT:      "EDUCATION",
    VISUAL_DATA_STORY:       "DATA_STORY",
    COMPANY_DEEP_DIVE:       "REPORT_STORY",
    WEEKLY_THEME:            "MAGAZINE_STORY",
    TREND_EXPLAINER:         "MEGATREND"
  };

  /* Wie viele Entitaeten eine Familie ueblicherweise traegt. Das ist
     eine Plausibilitaetsgrenze, keine Vorschrift: ein Vergleich mit
     einer einzigen Entitaet ist keiner. */
  var FAMILY_ENTITY_SHAPE = {
    COMPARISON: { min: 2, max: null },
    RANKING:    { min: 0, max: null },
    EDUCATION:  { min: 0, max: null },
    EVERGREEN:  { min: 0, max: null },
    MARKET_EXPLAINER: { min: 0, max: null },
    MEGATREND:  { min: 0, max: null },
    STOCK_STORY: { min: 1, max: 1 },
    ETF_PRODUCT: { min: 1, max: null },
    EARNINGS:   { min: 1, max: 1 },
    DIVIDEND:   { min: 1, max: null }
  };

  /* -------------------------------------------------------------------
     PASST DIESER ARCHETYP ZU EINEM THEMA MIT n ENTITAETEN?

     Der erste Lauf ueber die Content Ladder baute aus einer Rangliste
     ueber ZEHN Unternehmen einen Beitrag mit dem Archetyp STOCK_STORY
     und dem Einstieg "412,53 USD - Valero Energy, Kurs." Der Text war
     nicht falsch; das ETIKETT war es. Gemessen worden waere spaeter
     "STOCK_STORY erreicht n Reichweite" - fuer eine Rangliste.

     Die noetige Information lag schon da: FAMILY_ENTITY_SHAPE sagt,
     wie viele Entitaeten eine Familie traegt, und FAMILY_FOR_ARCHETYPE
     sagt, welche Familie ein Archetyp oeffentlich ist. Sie waren nur
     nie verbunden.

     UNBEKANNT IST NICHT "PASST": ist die Anzahl nicht bekannt, gibt
     diese Funktion `null` zurueck - "nicht entscheidbar" - und der
     Aufrufer sagt, was er damit macht. Ein `true` waere hier die
     bequeme Unwahrheit.
     ------------------------------------------------------------------- */
  function archetypePassesEntityShape(archetype, entityCount) {
    /* `Number(null)` ist 0, und 0 ist eine endliche Zahl. Der erste
       Entwurf las damit "keine Angabe" als "null Entitaeten" und wies
       STOCK_STORY ab, weil es mindestens eine braucht - eine
       Ablehnung aus Unwissen, genau das, was diese Funktion nicht tun
       soll. Unbekannt wird deshalb VOR der Umrechnung abgefangen. */
    if (entityCount === null || entityCount === undefined || entityCount === "") return null;
    var n = Number(entityCount);
    if (!Number.isFinite(n) || n < 0) return null;
    var fam = FAMILY_FOR_ARCHETYPE[archetype];
    if (!fam) return null;
    var shape = FAMILY_ENTITY_SHAPE[fam];
    if (!shape) return null;
    if (typeof shape.min === "number" && n < shape.min) return false;
    if (typeof shape.max === "number" && shape.max !== null && n > shape.max) return false;
    return true;
  }

  /* Aus einem Titel eine stabile, lesbare Kennung. */
  function slugify(t) {
    return String(t || "").toLowerCase()
      .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function idVon(spec) {
    /* -----------------------------------------------------------------
       DIE ENTITY-LOSE FORM DARF NICHT ZWEITER KLASSE SEIN

       Der erste Entwurf haengte die Kennung an Family, Art und
       Entitaeten. Bei einem Thema OHNE Entitaet blieb davon nur die
       Family uebrig - und damit haetten ALLE entity-losen Themen
       derselben Family dieselbe Kennung getragen. "Was bedeutet eine
       Zinssenkung?" und "Was ist ein ETF?" waeren dasselbe Thema
       gewesen.

       Genau die Annahme, die hier abgeschafft werden soll, waere durch
       die Hintertuer zurueckgekommen: ohne Ticker keine Identitaet.

       Deshalb traegt ein Thema ohne Entitaeten seine Kennung aus dem
       Titel. Fehlt auch der, gibt es keine stabile Identitaet - und
       die Struktur sagt das, statt eine zu erfinden.
       ------------------------------------------------------------------- */
    var entities = (spec.entities || []).slice().sort();
    var kennzeichen = spec.slug || (entities.length ? "" : slugify(spec.title));
    if (!entities.length && !kennzeichen) return null;

    var teile = [spec.family, spec.entityType || "NONE"]
      .concat(entities)
      .concat(kennzeichen ? [kennzeichen] : []);
    return "topic_" + teile.join(":").toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, "-").replace(/-+/g, "-");
  }

  /**
   * Ein Thema des Content Universe.
   *
   * Absichtlich OHNE Bewertung: ob darueber jetzt gesprochen werden
   * sollte, entscheidet die Opportunity Engine. Diese Datei sagt nur,
   * WORUEBER gesprochen werden KANN.
   */
  function topic(spec) {
    spec = spec || {};
    var family = String(spec.family || "").toUpperCase();
    var entityType = String(spec.entityType || "NONE").toUpperCase();
    var entities = Array.isArray(spec.entities) ? spec.entities.slice() : [];
    var sources = Array.isArray(spec.sources) ? spec.sources.slice()
      : (spec.source ? [spec.source] : []);

    return {
      topicId: spec.topicId || idVon({ family: family, entityType: entityType,
        entities: entities, slug: spec.slug, title: spec.title }),
      family: family,
      entityType: entityType,
      entities: entities,
      sources: sources,
      title: spec.title || null,
      /* Die Leitfrage in Lesersprache. Sie ist der Grund, warum das
         Thema existiert - nicht das Signal, aus dem es entstand. */
      question: spec.question || null,
      evidenceRefs: Array.isArray(spec.evidenceRefs) ? spec.evidenceRefs.slice() : [],
      /* Die Belege selbst, nicht nur ein Zeiger darauf. Ein Thema, das
         nur auf eine Datei zeigt, laesst die Story-Auswahl im Dunkeln. */
      evidence: Array.isArray(spec.evidence) ? spec.evidence.slice() : [],
      evidenceSufficient: spec.evidenceSufficient === true,
      evidenceRejected: spec.evidenceRejected === undefined ? null : spec.evidenceRejected,
      /* -----------------------------------------------------------------
         WOVON DER ANLASS HANDELT — UND OB ES EINEN GIBT

         Die Strategiestufe fragt beides, und bisher konnte nur ein
         Signal antworten: `premise` und `hasCause` entstanden in
         signals.js und existierten nur dort. Ein Thema aus der Platte
         kam ohne beides an und fiel damit aus der Archetyp-Eignung -
         nicht, weil es unpassend war, sondern weil es nicht gefragt
         werden konnte.

         ZWEI VERSCHIEDENE FRAGEN, DIE LEICHT VERWECHSELT WERDEN:

           premise  WOVON der Anlass handelt (SECURITY_METRIC, EVENT,
                    MARKET_STATE, CONCEPT). Die Vokabel stammt aus
                    signals.js; jede Quelle kann sie beantworten.

           cause    Der Satz, der einen ANLASS nennt - ein Wechsel,
                    ein Ereignis mit Datum. NICHT die Auswahlregel
                    einer Reihe: die ist ein Kriterium, kein Anlass.
                    Waere sie hier eingetragen, waere EXPLAIN_THE_MOVE
                    fuer eine Rangliste zulaessig, und das Etikett
                    wuerde spaeter als Evidenz zitiert ("EXPLAIN_THE_MOVE
                    erreicht n Reichweite"), obwohl etwas anderes
                    gemessen wurde.

         Beide stehen auf null, wenn die Quelle sie nicht beantwortet.
         Fail closed: kein Anlass ist nicht dasselbe wie "wird schon
         einer sein". */
      premise: spec.premise || null,
      cause: spec.cause || null,
      timeSensitivity: spec.timeSensitivity || "EVERGREEN",
      /* Der Stand der Quelldatei. Ohne ihn ist die Aktualitaet des
         Anlasses nicht messbar - und faellt als Luecke ins Gewicht,
         obwohl das Datum real vorliegt. */
      asOf: spec.asOf || null,
      /* Die Staerke des Anlasses, wo es einen gemessenen gibt. */
      signalStrength: spec.signalStrength === undefined ? null : spec.signalStrength,
      availability: spec.availability || "AVAILABLE",
      note: spec.note || null
    };
  }

  /**
   * Traegt dieses Thema, was es behauptet?
   *
   * Geprueft wird die STRUKTUR, nicht die Qualitaet: bekannte Familie,
   * bekannte Entitaetsart, plausible Anzahl, und eine Quelle, die diese
   * Familie ueberhaupt tragen kann.
   */
  function validate(t) {
    t = t || {};
    var befunde = [];

    if (!t.topicId) {
      befunde.push({ id: "noStableIdentity",
        message: "Ein Thema ohne Entitaet braucht einen Titel oder einen " +
          "Slug. Ohne beides traegt es keine eigene Kennung - und alle " +
          "entity-losen Themen derselben Family waeren dasselbe Thema." });
    }

    if (CONTENT_FAMILIES.indexOf(t.family) === -1) {
      befunde.push({ id: "unknownFamily",
        message: "Unbekannte Content Family: " + t.family + "." });
    }
    if (ENTITY_TYPES.indexOf(t.entityType) === -1) {
      befunde.push({ id: "unknownEntityType",
        message: "Unbekannte Entitaetsart: " + t.entityType + "." });
    }

    var n = (t.entities || []).length;
    if (t.entityType === "NONE" && n > 0) {
      befunde.push({ id: "entityTypeMismatch",
        message: "entityType NONE, aber " + n + " Entitaet(en) genannt." });
    }
    if (t.entityType !== "NONE" && n === 0) {
      befunde.push({ id: "entityTypeMismatch",
        message: "entityType " + t.entityType + " ohne Entitaet. Wer eine " +
          "Art nennt, muss auch sagen, wovon." });
    }

    var form = FAMILY_ENTITY_SHAPE[t.family];
    if (form) {
      if (form.min !== null && form.min !== undefined && n < form.min) {
        befunde.push({ id: "tooFewEntities",
          message: t.family + " braucht mindestens " + form.min +
            " Entitaet(en), genannt sind " + n + ". Ein Vergleich mit " +
            "einer Seite ist keiner." });
      }
      if (form.max !== null && form.max !== undefined && n > form.max) {
        befunde.push({ id: "tooManyEntities",
          message: t.family + " traegt hoechstens " + form.max +
            " Entitaet(en), genannt sind " + n + "." });
      }
    }

    /* Die Quelle muss die Familie tragen koennen. Ohne diese Pruefung
       faellt man in die alte Gleichsetzung zurueck. */
    var quellen = t.sources || [];
    if (!quellen.length) {
      befunde.push({ id: "noSource",
        message: "Kein Content Source genannt. Ein Thema ohne Quelle hat " +
          "keine Belege - und ohne Belege gibt es keinen Inhalt." });
    } else {
      var traegt = quellen.some(function (q) {
        return (SOURCE_CAPABILITIES[q] || []).indexOf(t.family) !== -1;
      });
      if (!traegt) {
        befunde.push({ id: "sourceCannotCarryFamily",
          message: "Keine der Quellen (" + quellen.join(", ") + ") ist fuer " +
            t.family + " belegt. Leer heisst hier nicht \"alles erlaubt\"." });
      }
    }

    return { ok: befunde.length === 0, findings: befunde,
      explanation: befunde.length === 0
        ? "Thema strukturell tragfaehig."
        : befunde.map(function (b) { return b.message; }).join(" ") };
  }

  /** Welche Familien kann diese Quelle tragen? */
  function familiesFor(source) {
    return (SOURCE_CAPABILITIES[source] || []).slice();
  }

  /** Aus welchen Quellen kann diese Familie entstehen? */
  function sourcesFor(family) {
    return CONTENT_SOURCES.filter(function (q) {
      return (SOURCE_CAPABILITIES[q] || []).indexOf(family) !== -1;
    });
  }

  var api = {
    ENTITY_TYPES: ENTITY_TYPES,
    CONTENT_FAMILIES: CONTENT_FAMILIES,
    CONTENT_SOURCES: CONTENT_SOURCES,
    SOURCE_CAPABILITIES: SOURCE_CAPABILITIES,
    FAMILY_ENTITY_SHAPE: FAMILY_ENTITY_SHAPE,
    FAMILY_FOR_ARCHETYPE: FAMILY_FOR_ARCHETYPE,
    archetypePassesEntityShape: archetypePassesEntityShape,
    slugify: slugify,
    topic: topic,
    validate: validate,
    familiesFor: familiesFor,
    sourcesFor: sourcesFor
  };

  if (isNode) module.exports = api;
  else global.VUSocialContentUniverse = api;
})(typeof window !== "undefined" ? window : globalThis);
