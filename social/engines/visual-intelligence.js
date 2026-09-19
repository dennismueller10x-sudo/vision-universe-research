/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/visual-intelligence.js

   EIN TECHNISCH EINWANDFREIES BILD KANN EIN SCHLECHTES BILD SEIN

   -------------------------------------------------------------------------
   DER BEFUND
   -------------------------------------------------------------------------

   Das XOM-Visual hat jede technische Pruefung bestanden: MIME, Masse,
   PNG-Kettenstruktur, Hash, Rueckleseprobe vom Datentraeger,
   Herkunftskette. Neun Pruefungen, alle gruen.

   Der Owner bewertet die Bildqualitaet trotzdem als nicht ausreichend.
   Das ist kein Widerspruch: die neun Pruefungen beantworten die Frage
   "ist die Datei heil angekommen?". Keine davon fragt "traegt dieses
   Bild die Geschichte?".

   Zwei verschiedene Fragen brauchen zwei verschiedene Tore. Sie
   zusammenzulegen hiesse, aus "die Bytes stimmen" ein Qualitaetsurteil
   zu machen.

   -------------------------------------------------------------------------
   CREATIVE DIRECTION VOR ERZEUGUNG
   -------------------------------------------------------------------------

   Generische KI-Bildsprache entsteht nicht, weil ein Modell schlecht
   waere, sondern weil niemand gesagt hat, was das Bild zeigen soll.
   Wer "Technologie" bestellt, bekommt Neonwuerfel.

   Deshalb steht die Creative Direction VOR der Erzeugung und macht die
   eine visuelle Idee explizit - samt dem, was ausdruecklich nicht
   entstehen soll.

   Ausdruecklich KEIN pauschales Verbot: wenn eine Glaskugel die
   Geschichte traegt, ist sie richtig. Die Story entscheidet, nicht
   eine Motivliste.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     DIE STUFEN — GETRENNT, WEIL SIE VERSCHIEDENES ENTSCHEIDEN
     ------------------------------------------------------------------- */
  var STAGES = ["VISUAL_STRATEGY", "CREATIVE_DIRECTION", "VISUAL_PROVIDER",
    "GENERATION", "TECHNICAL_INTEGRITY", "CREATIVE_QUALITY",
    "CANONICAL_SELECTION", "PERFORMANCE_ATTRIBUTION"];

  /* Motive, die erfahrungsgemaess ohne Story-Bezug bestellt werden.
     KEINE Verbotsliste: sie erhoeht nur die Begruendungslast. Wer eines
     davon will, muss sagen, warum es die Geschichte traegt. */
  var GENERISCHE_MOTIVE = [
    "neon", "glaskugel", "kristallkugel", "wuerfel", "würfel", "cyberpunk",
    "serverraum", "rechenzentrum", "matrix", "hologramm", "roboterhand",
    "leuchtende linien", "datenstrom", "futuristische stadt"
  ];

  /**
   * Die Creative Direction.
   *
   * Sie beantwortet die Fragen VOR der Erzeugung. Ein Feld leer zu
   * lassen ist erlaubt - dann meldet `ready()`, dass die Richtung noch
   * keine ist.
   */
  function direction(spec) {
    spec = spec || {};
    return {
      topicId: spec.topicId || null,
      visualStrategy: spec.visualStrategy || null,
      /* Die EINE Idee. Nicht drei. */
      coreIdea: spec.coreIdea || null,
      oneSecondMessage: spec.oneSecondMessage || null,
      mainSubject: spec.mainSubject || null,
      storyCarried: spec.storyCarried || null,
      composition: spec.composition || null,
      visualHierarchy: Array.isArray(spec.visualHierarchy)
        ? spec.visualHierarchy.slice() : [],
      imageLanguage: spec.imageLanguage || null,
      realism: spec.realism || null,
      colourWorld: spec.colourWorld || null,
      /* Mobile-first ist keine Zierde: der Bildausschnitt auf dem
         Telefon ist der einzige, den die meisten je sehen. */
      mobileFocalPoint: spec.mobileFocalPoint || null,
      mustNotContain: Array.isArray(spec.mustNotContain)
        ? spec.mustNotContain.slice() : [],
      justifiedGenericMotifs: Array.isArray(spec.justifiedGenericMotifs)
        ? spec.justifiedGenericMotifs.slice() : []
    };
  }

  function ready(d) {
    var fehlt = [];
    ["coreIdea", "oneSecondMessage", "mainSubject", "storyCarried",
     "mobileFocalPoint"].forEach(function (f) {
      if (!d || !d[f]) fehlt.push(f);
    });
    return {
      ok: fehlt.length === 0,
      missing: fehlt,
      explanation: fehlt.length === 0
        ? "Die Richtung traegt: eine Idee, eine Aussage, ein Motiv, ein Ausschnitt."
        : "Ohne " + fehlt.join(", ") + " ist das keine Richtung, sondern eine " +
          "Bestellung. Wer \"Technologie\" bestellt, bekommt Neonwuerfel."
    };
  }

  /* -------------------------------------------------------------------
     DAS KREATIVE TOR

     Bewusst getrennt von asset-integrity.js und asset-transport.js:
     die pruefen Bytes, dieses hier prueft Wirkung. Ein Ergebnis von
     hier heisst VISUAL_CREATIVE_QUALITY_FAILED - nie
     ASSET_TRANSPORT_INTEGRITY_FAILED und umgekehrt.
     ------------------------------------------------------------------- */
  var KRITERIEN = [
    "storyAlignment", "scrollStop", "composition", "visualHierarchy",
    "mobileImpact", "brandQuality", "editorialQuality", "originality",
    "comprehensibility", "hookComplementarity", "aiGenericRisk"
  ];

  /**
   * Die kreative Bewertung.
   *
   * `signals` sind Messungen oder Urteile, die von aussen kommen - aus
   * dem Renderer, aus einer Bildanalyse, aus einer Owner-Sichtung.
   * Diese Datei ERFINDET keine: was nicht uebergeben wird, gilt als
   * nicht geprueft und zaehlt nicht als bestanden.
   */
  function assessQuality(spec) {
    spec = spec || {};
    var signale = spec.signals || {};
    var d = spec.direction || null;
    var kriterien = [];

    KRITERIEN.forEach(function (id) {
      var wert = signale[id];
      if (wert === undefined || wert === null) {
        kriterien.push({ id: id, passed: null, blocking: true,
          finding: "Nicht geprueft: kein Signal fuer " + id + " uebergeben." });
        return;
      }
      var ok = typeof wert === "boolean" ? wert : Number(wert) >= 0.6;
      kriterien.push({ id: id, passed: ok, blocking: true,
        value: typeof wert === "number" ? wert : null,
        finding: ok ? null : id + " traegt nicht (" + wert + ")." });
    });

    /* Generische Motive ohne Begruendung: das ist messbar, ohne das
       Bild zu sehen - es steht in der Richtung. */
    var unbegruendet = [];
    if (d) {
      var text = [d.coreIdea, d.mainSubject, d.imageLanguage].join(" ").toLowerCase();
      GENERISCHE_MOTIVE.forEach(function (m) {
        if (text.indexOf(m) !== -1 &&
            (d.justifiedGenericMotifs || []).indexOf(m) === -1) {
          unbegruendet.push(m);
        }
      });
    }
    if (unbegruendet.length) {
      kriterien.push({ id: "aiGenericRisk", passed: false, blocking: true,
        finding: "Generische Motive ohne Begruendung: " + unbegruendet.join(", ") +
          ". Kein Verbot - aber wer eines davon will, muss sagen, warum es " +
          "die Geschichte traegt." });
    }

    var geprueft = kriterien.filter(function (k) { return k.passed !== null; });
    var offen = kriterien.filter(function (k) { return k.passed === false; });
    var ungeprueft = kriterien.filter(function (k) { return k.passed === null; });

    return {
      /* Ungeprueft ist nicht bestanden - dieselbe Regel wie ueberall. */
      passed: offen.length === 0 && ungeprueft.length === 0,
      failureType: offen.length ? "VISUAL_CREATIVE_QUALITY_FAILED" : null,
      /* Ausdruecklich: ein kreativer Befund sagt nichts ueber den
         Transport, und ein Transportfehler nichts ueber die Qualitaet. */
      technicalJudgement: false,
      predictsPerformance: false,
      criteria: kriterien,
      met: geprueft.filter(function (k) { return k.passed; }).length,
      assessed: geprueft.length,
      total: kriterien.length,
      unassessed: ungeprueft.map(function (k) { return k.id; }),
      explanation: offen.length
        ? "Kreativ nicht bestanden: " + offen.map(function (k) { return k.id; }).join(", ") + "."
        : ungeprueft.length
          ? "Technisch mag das Bild stimmen - kreativ ist es ungeprueft: " +
            ungeprueft.map(function (k) { return k.id; }).join(", ") + "."
          : "Alle " + kriterien.length + " kreativen Kriterien bestanden."
    };
  }

  var api = {
    STAGES: STAGES,
    KRITERIEN: KRITERIEN,
    GENERISCHE_MOTIVE: GENERISCHE_MOTIVE,
    direction: direction,
    ready: ready,
    assessQuality: assessQuality
  };

  if (isNode) module.exports = api;
  else global.VUSocialVisualIntelligence = api;
})(typeof window !== "undefined" ? window : globalThis);
