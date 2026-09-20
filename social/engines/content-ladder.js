/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/content-ladder.js

   DIE SUCHREIHENFOLGE UEBER DAS CONTENT UNIVERSE

   -------------------------------------------------------------------------
   WOGEGEN DIESE DATEI GEBAUT IST
   -------------------------------------------------------------------------

   Gegen den leeren Tag aus dem falschen Grund.

   Der Ablauf, den es zu verhindern gilt: die Opportunity Engine findet
   heute keine Kursbewegung, meldet NO_MARKET_SIGNAL - und der Tag ist
   vorbei. Vierzehn weitere Content Families wurden nie gefragt.

   Vision Universe hat bewusst ein breites Content Universe. Ein
   fehlendes Marktsignal ist eine Aufforderung weiterzusuchen und kein
   Ergebnis.

   -------------------------------------------------------------------------
   WAS GEMESSEN WURDE, BEVOR DIESE DATEI ENTSTAND
   -------------------------------------------------------------------------

   Die Platte (opportunity-slate.json) fuehrt 32 Themen aus fuenf
   Familien. 22 davon bestehen das Evidenztor - und alle 22 sind
   RANKING, mit 345 Belegen.

   Der produktive Zyklus erzeugte zur selben Zeit drei Pakete, alle
   STOCK_STORY, alle "Technisches Setup — <Ticker>". Die vier
   STOCK_STORY-Themen der Platte bestehen das Evidenztor NICHT; sie
   tragen je einen Beleg.

   Der Grund: run-social-cycle.mjs liest die Platte nicht. Kein
   einziges Vorkommen. Und build-opportunity-slate.mjs laeuft in keinem
   Workflow - die Datei auf der Platte war vom Vortag.

   Die belegstaerkste Familie des Systems hat damit noch nie einen
   Beitrag erzeugt. Das ist kein fehlendes Feature, sondern eine
   Verbindung, die nie gelegt wurde.

   -------------------------------------------------------------------------
   DIE LEITER IST EINE SUCHREIHENFOLGE, KEINE RANGLISTE DER QUALITAET
   -------------------------------------------------------------------------

   Eine Familie auf Stufe 1 hat KEIN Veroeffentlichungsrecht, nur weil
   sie oben steht. Sie wird zuerst GEFRAGT.

   Und eine Stufe, die Themen hat, beendet die Suche nicht automatisch:
   gezaehlt wird, was das Evidenztor besteht. Genau daran haengt der
   Unterschied zwischen "Ticker zuerst" und "Ticker zuerst gefragt" -
   heute traegt Stufe 4 vier Themen, von denen keines besteht, und die
   Suche geht weiter zu Stufe 5.

   Wer das umdreht und eine belegte Stufe wegen einer unbelegten
   hoeheren ueberspringt, hat die Rangliste gebaut, die diese Datei
   nicht ist.

   -------------------------------------------------------------------------
   WAS DIESE ENGINE NIE TUT
   -------------------------------------------------------------------------

   Sie erfindet keine Gelegenheit. Eine Familie ohne Themen ist eine
   Familie ohne Themen; sie wird als GEPRUEFT UND LEER vermerkt, mit
   dem Grund, den die Platte nennt. Ein Fixture waere hier der
   teuerste Fehler: er saehe wie Breite aus und waere Erfindung.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     DIE NEUN STUFEN

     Die Reihenfolge ist eine Owner-Entscheidung. Die Zuordnung der
     Familien ist es nicht: sie folgt den fuenfzehn Familien, die es
     gibt, und erfindet keine neue Taxonomie. Jede bestehende Familie
     kommt genau einmal vor - ein Test haelt das fest, weil eine
     Familie ohne Stufe nie gefragt wuerde.
     ------------------------------------------------------------------- */
  var LEITER = [
    { stufe: 1, id: "CURRENT_MARKET",
      titel: "Aktuelle Marktgelegenheiten",
      familien: ["NEWS_NOW", "EARNINGS", "MARKET_EXPLAINER"] },
    { stufe: 2, id: "VU_ORIGINAL_RESEARCH",
      titel: "Eigene Recherche",
      familien: ["VU_ORIGINAL_RESEARCH"] },
    { stufe: 3, id: "MAGAZINE",
      titel: "Magazin-Geschichten",
      familien: ["MAGAZINE_STORY"] },
    { stufe: 4, id: "STOCK_REPORT",
      titel: "Aktien- und Reportgeschichten",
      familien: ["REPORT_STORY", "STOCK_STORY"] },
    { stufe: 5, id: "RANKING_COMPARISON",
      titel: "Ranglisten und Vergleiche",
      familien: ["RANKING", "COMPARISON"] },
    { stufe: 6, id: "MEGATREND",
      titel: "Megatrends",
      familien: ["MEGATREND"] },
    { stufe: 7, id: "EDUCATION",
      titel: "Erklaerstuecke",
      familien: ["EDUCATION"] },
    { stufe: 8, id: "EVERGREEN",
      titel: "Zeitlose Stuecke",
      familien: ["EVERGREEN"] },
    { stufe: 9, id: "PORTFOLIO_EXPLORE",
      titel: "Portfolio-Vielfalt und Erkundung",
      familien: ["DATA_STORY", "ETF_PRODUCT", "DIVIDEND"] }
  ];

  /* Warum ein Thema nicht zaehlt. Jeder Grund ist eine eigene Aussage;
     sie zu "passt nicht" zusammenzuziehen macht den Nachweis wertlos. */
  var ABLEHNUNG = {
    EVIDENCE_INSUFFICIENT: "EVIDENCE_INSUFFICIENT",
    FAMILY_UNAVAILABLE:    "FAMILY_UNAVAILABLE",
    NO_TOPICS_IN_FAMILY:   "NO_TOPICS_IN_FAMILY",
    ALREADY_COVERED:       "ALREADY_COVERED",
    PORTFOLIO_SATURATED:   "PORTFOLIO_SATURATED",
    EXCLUDED_BY_CALLER:    "EXCLUDED_BY_CALLER"
  };

  /** Alle Familien, die die Leiter kennt. */
  function alleFamilien() {
    var out = [];
    LEITER.forEach(function (s) {
      s.familien.forEach(function (f) { if (out.indexOf(f) === -1) out.push(f); });
    });
    return out;
  }

  /** Auf welcher Stufe eine Familie gefragt wird. */
  function stufeVon(familie) {
    for (var i = 0; i < LEITER.length; i++) {
      if (LEITER[i].familien.indexOf(familie) !== -1) return LEITER[i].stufe;
    }
    return null;
  }

  /**
   * Geht die Leiter ab.
   *
   * @param themen   die Themen der Platte (opportunity-slate.topics)
   * @param options {
   *   unavailableFamilies  [{family, reason}] aus der Platte
   *   benoetigt            wie viele qualifizierte Gelegenheiten gesucht
   *                        werden (aus der Tagesabsicht; Vorgabe 1)
   *   bereitsAbgedeckt     [topicId] heute schon verwendete Themen
   *   ausgeschlossen       [family] vom Aufrufer ausgeschlossene Familien
   *   qualifiziert         Funktion(thema) -> bool; Vorgabe: das
   *                        Evidenztor der Platte
   * }
   *
   * Der Rueckgabewert ist ein NACHWEIS und nicht nur ein Ergebnis: er
   * traegt jede gefragte Familie, jedes gepruefte Thema und jeden
   * Ablehnungsgrund. §15 verlangt das, und zwar zu Recht - ohne ihn
   * liesse sich "wir haben gesucht" nicht von "wir haben aufgegeben"
   * unterscheiden.
   */
  function suche(themen, options) {
    var o = options || {};
    var alle = themen || [];
    var benoetigt = Number.isFinite(Number(o.benoetigt)) ? Number(o.benoetigt) : 1;
    var abgedeckt = o.bereitsAbgedeckt || [];
    var ausgeschlossen = o.ausgeschlossen || [];

    var unavailable = {};
    (o.unavailableFamilies || []).forEach(function (u) {
      if (u && u.family) unavailable[u.family] = u.reason || "ohne Grund vermerkt";
    });

    var qualifiziert = typeof o.qualifiziert === "function"
      ? o.qualifiziert
      : function (t) { return t && t.evidenceSufficient === true; };

    var gefundene = [];
    var stufenBericht = [];
    var familienGefragt = [];
    var themenGeprueft = 0;
    var ablehnungen = {};
    var tiefe = 0;

    function ablehnen(code) {
      ablehnungen[code] = (ablehnungen[code] || 0) + 1;
    }

    for (var i = 0; i < LEITER.length; i++) {
      var stufe = LEITER[i];
      tiefe = stufe.stufe;

      var stufenFund = [];
      var familienHier = [];

      for (var j = 0; j < stufe.familien.length; j++) {
        var fam = stufe.familien[j];
        familienGefragt.push(fam);

        if (ausgeschlossen.indexOf(fam) !== -1) {
          ablehnen(ABLEHNUNG.EXCLUDED_BY_CALLER);
          familienHier.push({ family: fam, themen: 0, qualifiziert: 0,
            grund: ABLEHNUNG.EXCLUDED_BY_CALLER, hinweis: "Vom Aufrufer ausgeschlossen." });
          continue;
        }

        var inFamilie = alle.filter(function (t) { return t && t.family === fam; });

        if (!inFamilie.length) {
          /* Leer ist nicht gleich leer: eine Familie ohne angebundene
             Quelle ist etwas anderes als eine mit Quelle und ohne
             Thema. Die Platte kennt den Unterschied, also wird er
             uebernommen statt eingeebnet. */
          var code = Object.prototype.hasOwnProperty.call(unavailable, fam)
            ? ABLEHNUNG.FAMILY_UNAVAILABLE : ABLEHNUNG.NO_TOPICS_IN_FAMILY;
          ablehnen(code);
          familienHier.push({ family: fam, themen: 0, qualifiziert: 0, grund: code,
            hinweis: unavailable[fam] || "Quelle angebunden, aber heute ohne Thema." });
          continue;
        }

        var qualHier = [];
        for (var k = 0; k < inFamilie.length; k++) {
          var t = inFamilie[k];
          themenGeprueft += 1;

          if (abgedeckt.indexOf(t.topicId) !== -1) {
            ablehnen(ABLEHNUNG.ALREADY_COVERED); continue;
          }
          if (!qualifiziert(t)) {
            ablehnen(ABLEHNUNG.EVIDENCE_INSUFFICIENT); continue;
          }
          qualHier.push(t);
        }

        familienHier.push({ family: fam, themen: inFamilie.length,
          qualifiziert: qualHier.length,
          grund: qualHier.length ? null : ABLEHNUNG.EVIDENCE_INSUFFICIENT,
          hinweis: qualHier.length ? null
            : inFamilie.length + " Thema/Themen, keines mit hinreichender Evidenz." });

        stufenFund = stufenFund.concat(qualHier);
      }

      stufenBericht.push({
        stufe: stufe.stufe, id: stufe.id, titel: stufe.titel,
        familien: familienHier,
        qualifiziert: stufenFund.length
      });

      gefundene = gefundene.concat(stufenFund);

      /* -----------------------------------------------------------------
         ABBRUCH ERST, WENN GENUG DA IST

         Nicht: "diese Stufe hatte Themen, also fertig". Eine Stufe mit
         vier Themen, von denen keines belegt ist, hat nichts gefunden -
         und genau so sah der reale Zustand aus, als diese Datei
         entstand. Wer auf "hatte Themen" abbricht, baut den
         Ticker-first-Rueckfall nach, nur mit mehr Schritten. */
      if (gefundene.length >= benoetigt) break;
    }

    return {
      gefunden: gefundene,
      genug: gefundene.length >= benoetigt,
      benoetigt: benoetigt,

      /* Der Nachweis (§15). */
      familiesConsidered: familienGefragt,
      familiesConsideredCount: familienGefragt.length,
      opportunitiesConsidered: themenGeprueft,
      fallbackDepthReached: tiefe,
      rejectionReasons: ablehnungen,
      stufen: stufenBericht,

      /* Was NICHT gefragt wurde, weil die Suche vorher genug fand.
         Es als "geprueft" zu fuehren waere die bequemste Unwahrheit
         dieses Nachweises. */
      nichtGefragt: LEITER.filter(function (s) { return s.stufe > tiefe; })
        .map(function (s) { return { stufe: s.stufe, id: s.id, familien: s.familien }; })
    };
  }

  /**
   * Der Satz, den der Owner liest.
   *
   * Keine technische Innensprache: keine Codes, keine Feldnamen, keine
   * Stufennummern ohne Titel.
   */
  function erklaerung(befund) {
    var b = befund || {};
    if (b.genug) {
      return b.gefunden.length + " Gelegenheit" +
        (b.gefunden.length === 1 ? "" : "en") + " aus " +
        b.familiesConsideredCount + " geprueften Content Families.";
    }
    return b.opportunitiesConsidered + " Gelegenheit" +
      (b.opportunitiesConsidered === 1 ? "" : "en") + " aus " +
      b.familiesConsideredCount + " Content Families geprueft. Keine erfuellte " +
      "die Evidenz- und Vielfaltsanforderungen.";
  }

  var api = {
    LEITER: LEITER,
    ABLEHNUNG: ABLEHNUNG,
    alleFamilien: alleFamilien,
    stufeVon: stufeVon,
    suche: suche,
    erklaerung: erklaerung
  };

  if (isNode) module.exports = api;
  else global.VUSocialContentLadder = api;
})(typeof window !== "undefined" ? window : globalThis);
