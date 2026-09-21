/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/learning-dimensions.js

   WAS EIN BEITRAG UEBER SICH SELBST MITSCHREIBT (§22–§25, §35)

   -------------------------------------------------------------------------
   DER BEFUND, AUS DEM DIESE DATEI ENTSTAND
   -------------------------------------------------------------------------

   own-performance.js nennt zwoelf Lerndimensionen. Der Ranker meldete
   ueber 53 Beitraege hinweg:

     topic              100 % Abdeckung
     format             100 %
     timing             100 %
     content_family       0 %   nicht mitgeschrieben
     entity_type          0 %   nicht mitgeschrieben
     audience_frame       0 %   nicht mitgeschrieben
     story_structure      0 %   nicht mitgeschrieben
     hook_strategy        0 %   nicht mitgeschrieben
     hook_variant_id      0 %   nicht mitgeschrieben
     visual_strategy      0 %   nicht mitgeschrieben
     visual_variant_id    0 %   nicht mitgeschrieben
     market_context       0 %   nicht mitgeschrieben

   Neun von zwoelf. Die FELDER gab es im Gedaechtnis; niemand hat sie je
   gefuellt. Die Werte waren auch nicht verloren - sie standen im
   Zyklus, im Paket, im Rahmen - und wurden auf dem Weg zum Kandidaten
   von einer handgeschriebenen Feldliste nicht mitgenommen. Dieselbe
   Falle wie bei der Bildrichtung und beim `performanceRegime`.

   Eine Liste ist eine gute Verteidigung und ein schlechtes Gedaechtnis.

   -------------------------------------------------------------------------
   DREI ZUSTAENDE, NICHT ZWEI (§35)
   -------------------------------------------------------------------------

   Ein Wert ist DA, oder er ist NICHT ERMITTELBAR, oder das Feld wurde
   NICHT MITGESCHRIEBEN. Die letzten beiden sehen im Gedaechtnis gleich
   aus - beide `null` - und bedeuten Verschiedenes:

     nicht ermittelbar   Die Maschine hat gefragt und keine Antwort
                         bekommen. Ein Befund ueber die Datenlage.
     nicht mitgeschrieben Niemand hat gefragt. Ein Befund ueber uns.

   Deshalb gibt diese Datei zu jedem Feld eine HERKUNFT aus: woher der
   Wert kam, oder warum keiner da ist. Ohne sie waere ein leeres Feld
   in einem Jahr nicht mehr zu deuten.

   RUECKWIRKEND WIRD NICHTS ERFUNDEN. Beitraege, die vor dieser Datei
   entstanden sind, behalten ihre Luecken. Ein nachtraeglich gesetzter
   Wert waere eine Messung, die nie stattgefunden hat - und er wuerde
   spaeter als Evidenz zitiert.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var OwnPerformance = isNode ? require("./own-performance.js")
                              : global.VUSocialOwnPerformance;

  /* -------------------------------------------------------------------
     DIE LISTE STEHT NICHT HIER

     Sie steht in own-performance.js, weil dort ausgewertet wird. Eine
     zweite Liste hier waere die naechste Gelegenheit, dass eine
     Dimension auf einer Seite fehlt - und genau daran ist es schon
     einmal gescheitert.

     `timing` und `topic` stehen dort ohne eigenes Feld bzw. werden
     anders abgeleitet; sie werden hier nicht gesetzt und sind
     deshalb ausdruecklich ausgenommen. Ein Test haelt fest, dass die
     Ausnahmen genau diese beiden sind.
     ------------------------------------------------------------------- */
  var NICHT_VON_HIER = ["topic", "format", "timing"];

  function zuSetzen() {
    return (OwnPerformance.DIMENSIONEN || [])
      .filter(function (d) { return NICHT_VON_HIER.indexOf(d.id) === -1; })
      .map(function (d) { return d.field; })
      .filter(Boolean);
  }

  var HERKUNFT = {
    NICHT_ERMITTELBAR:    "NICHT_ERMITTELBAR",
    NICHT_MITGESCHRIEBEN: "NICHT_MITGESCHRIEBEN"
  };

  function text(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    return s.length ? s : null;
  }

  /* Das Muster des Autors heisst "hook/caption" - zwei Entscheidungen
     in einer Zeichenkette. Getrennt sind sie zwei Dimensionen. */
  function musterTeile(pattern) {
    var p = text(pattern);
    if (!p) return { hook: null, story: null };
    var teile = p.split("/");
    return { hook: text(teile[0]), story: text(teile[1]) };
  }

  /**
   * Die Lerndimensionen eines fertigen Pakets.
   *
   * @param paket {
   *   audienceFrame, authoring, visualType, visual, thema, marketContext
   * }
   * @returns { werte: {...}, herkunft: {feld: "quelle" | Grund} }
   */
  function ausPaket(paket) {
    var p = paket || {};
    var frame = p.audienceFrame || {};
    var autor = p.authoring || {};
    var muster = musterTeile(autor.pattern);
    var thema = p.thema || {};
    var visual = p.visual || {};

    var werte = {};
    var herkunft = {};

    function setze(feld, wert, quelle, grundWennLeer) {
      var v = text(wert);
      werte[feld] = v;
      herkunft[feld] = v === null
        ? (grundWennLeer || HERKUNFT.NICHT_ERMITTELBAR)
        : quelle;
    }

    setze("contentFamily", frame.family, "audienceFrame.family",
      "Der Rahmen nennt keine Content Family.");
    setze("audienceFrameBasis", frame.familyBasis, "audienceFrame.familyBasis",
      "Der Rahmen sagt nicht, woher die Familie kam.");
    setze("entityType", thema.entityType, "thema.entityType",
      "Das Thema kam nicht aus der Platte und nennt keine Entitaetsart.");

    /* Was der Autor WIRKLICH benutzt hat - nicht, was der Rahmen
       vorgeschlagen hat. Eine Empfehlung ist keine Entscheidung, und
       aus einer Empfehlung zu lernen hiesse zu messen, was wir uns
       gedacht haben. */
    setze("hookStrategy", muster.hook, "authoring.pattern (Einstieg)",
      "Kein Autorenmuster vermerkt.");
    setze("storyStructure", muster.story, "authoring.pattern (Aufbau)",
      "Kein Autorenmuster vermerkt.");
    setze("hookVariantId", autor.variantId, "authoring.variantId",
      "Keine Variantenkennung vermerkt.");

    setze("visualStrategy", p.visualType, "visualType",
      "Keine Bildform vermerkt.");
    /* Nur ein erzeugtes Bild hat eine Variantenkennung. Ein
       gezeichnetes hat keine - das ist kein Mangel, sondern seine
       Bauart, und es steht als solches da. */
    setze("visualVariantId", visual.variantId, "visual.variantId",
      visual.origin === "rendered"
        ? "Gezeichnetes Bild: es entsteht aus Daten und hat keine Variante."
        : "Keine Bildvariante vermerkt.");

    /* -----------------------------------------------------------------
       DER MARKTKONTEXT WIRD HEUTE NICHT ERHOBEN

       Er waere: in welcher Marktlage der Beitrag erschien. Dafuer
       braeuchte es eine Quelle, die das sagt - und die ist nicht
       angebunden. Ihn aus dem Kursstand des einen Titels abzuleiten
       waere eine Erfindung mit dem Aussehen einer Messung.

       Er steht deshalb als NICHT ERMITTELBAR da und nicht als Luecke
       im Mitschreiben: gefragt wurde, es gibt nur keine Antwort. */
    setze("marketContext", p.marketContext, "paket.marketContext",
      "Keine Quelle beschreibt die Marktlage; sie wird nicht geschaetzt.");

    /* Was own-performance.js nennt und hier nicht gesetzt wurde, faellt
       auf - statt stillschweigend zu fehlen. */
    zuSetzen().forEach(function (feld) {
      if (!(feld in werte)) {
        werte[feld] = null;
        herkunft[feld] = HERKUNFT.NICHT_MITGESCHRIEBEN;
      }
    });

    return { werte: werte, herkunft: herkunft };
  }

  /** Wie vollstaendig ist ein Satz Dimensionen? Gezaehlt, nicht geraten. */
  function abdeckung(ergebnis) {
    var e = ergebnis || { werte: {}, herkunft: {} };
    var felder = Object.keys(e.werte);
    var gesetzt = felder.filter(function (f) { return e.werte[f] !== null; });
    var nichtMitgeschrieben = felder.filter(function (f) {
      return e.herkunft[f] === HERKUNFT.NICHT_MITGESCHRIEBEN; });
    return {
      felder: felder.length,
      gesetzt: gesetzt.length,
      /* Die beiden Luecken getrennt: die eine ist ein Befund ueber die
         Datenlage, die andere einer ueber uns. */
      nichtErmittelbar: felder.length - gesetzt.length - nichtMitgeschrieben.length,
      nichtMitgeschrieben: nichtMitgeschrieben.length,
      vollstaendig: nichtMitgeschrieben.length === 0
    };
  }

  var api = {
    HERKUNFT: HERKUNFT,
    NICHT_VON_HIER: NICHT_VON_HIER,
    zuSetzen: zuSetzen,
    musterTeile: musterTeile,
    ausPaket: ausPaket,
    abdeckung: abdeckung
  };

  if (isNode) module.exports = api;
  else global.VUSocialLearningDimensions = api;
})(typeof window !== "undefined" ? window : globalThis);
