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
  var Ideation = isNode ? require("./editorial-ideation.js")
                        : global.VUSocialEditorialIdeation;

  /* -------------------------------------------------------------------
     DIE ZEHN STUFEN

     Die Reihenfolge ist eine Owner-Entscheidung. Die Zuordnung der
     Familien ist es nicht: sie folgt den fuenfzehn Familien, die es
     gibt, und erfindet keine neue Taxonomie. Jede bestehende Familie
     kommt genau einmal vor - ein Test haelt das fest, weil eine
     Familie ohne Stufe nie gefragt wuerde.

     DIE ZEHNTE STUFE FRAGT KEINE FAMILIE.

     Neun Stufen fragen die Platte: welches THEMA traegt heute? Wenn
     keine von ihnen etwas hat, war die Antwort bisher "keine Familie
     trug ein Thema" - ein Satz ueber das ANGEBOT, ausgesprochen von
     einem Haus mit fuenfzehn Familien.

     Stufe 10 fragt nicht die Platte, sondern die Redaktion, und sie
     hat immer eine Frage. Ihre `familien` sind absichtlich leer: sie
     bringt keine sechzehnte Familie, sie bringt Fragen, die in den
     bestehenden fuenfzehn landen wuerden.

     Was sie liefert, zaehlt NICHT als Fund. Eine Frage ohne Beleg ist
     kein Beitrag, und diese Stufe verkuerzt den Weg zur
     Veroeffentlichung um keinen Schritt.
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
      familien: ["DATA_STORY", "ETF_PRODUCT", "DIVIDEND"] },
    { stufe: 10, id: "EDITORIAL_IDEATION",
      titel: "Redaktionelle Fragen",
      familien: [], ideation: true }
  ];

  /* Warum ein Thema nicht zaehlt. Jeder Grund ist eine eigene Aussage;
     sie zu "passt nicht" zusammenzuziehen macht den Nachweis wertlos. */
  var ABLEHNUNG = {
    EVIDENCE_INSUFFICIENT: "EVIDENCE_INSUFFICIENT",
    FAMILY_UNAVAILABLE:    "FAMILY_UNAVAILABLE",
    NO_TOPICS_IN_FAMILY:   "NO_TOPICS_IN_FAMILY",
    ALREADY_COVERED:       "ALREADY_COVERED",
    PORTFOLIO_SATURATED:   "PORTFOLIO_SATURATED",
    EXCLUDED_BY_CALLER:    "EXCLUDED_BY_CALLER",
    /* Stufe 10: es GAB etwas, es war nur noch nicht belegt. Diesen
       Grund mit NO_TOPICS_IN_FAMILY zusammenzuziehen hiesse, den
       Unterschied zwischen "nichts da" und "noch nicht recherchiert"
       wieder einzuebnen - und genau der traegt die Tagesentscheidung. */
    IDEAS_WITHOUT_EVIDENCE: "IDEAS_WITHOUT_EVIDENCE"
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

    /* -----------------------------------------------------------------
       WELCHES EVIDENZTOR GILT — EINE OWNER-ENTSCHEIDUNG

       Es gibt zwei produktive Tore, und sie urteilten ueber dieselben
       vier Aktienthemen gegensaetzlich:

         Brief-Evidenztor der Platte   evidenceSufficient: false
                                       (je ein Beleg)
         Opportunity-Schwelle          proposable: true
         des Zyklus                    (Score 61–66)

       Beide sind legitim; sie beantworten verschiedene Fragen. Welches
       die Leiter anwendet, entscheidet aber ihr ganzes Verhalten: mit
       dem einen steigt sie bis zu den belegten Ranglisten, mit dem
       anderen bricht sie bei den Aktienthemen ab.

       DER OWNER HAT DAS BRIEF-EVIDENZTOR GEWAEHLT. Das setzt §12 um -
       ein internes Signal ist eine Opportunity Source und hat kein
       automatisches Veroeffentlichungsrecht - und es hat einen Preis,
       der hier stehen soll: die heute laufende STOCK_STORY-Produktion
       qualifiziert damit nicht mehr, solange ihre Themen einen Beleg
       tragen.

       `qualifiziert` bleibt austauschbar, damit ein Aufrufer STRENGER
       pruefen kann. Milder nicht: ohne eigene Angabe gilt das
       Evidenztor, nicht "alles zaehlt". */
    var qualifiziert = typeof o.qualifiziert === "function"
      ? o.qualifiziert
      : function (t) { return t && t.evidenceSufficient === true; };

    var gefundene = [];
    var stufenBericht = [];
    var familienGefragt = [];
    var themenGeprueft = 0;
    var ablehnungen = {};
    var tiefe = 0;
    var redaktionelleFragen = [];

    function ablehnen(code) {
      ablehnungen[code] = (ablehnungen[code] || 0) + 1;
    }

    for (var i = 0; i < LEITER.length; i++) {
      var stufe = LEITER[i];
      tiefe = stufe.stufe;

      /* ---------------------------------------------------------------
         DIE STUFE, DIE NICHT DIE PLATTE FRAGT

         Sie laeuft nur, wenn die neun davor nicht genug gefunden
         haben - die Abbruchbedingung unten sorgt dafuer. Was sie
         liefert, geht NICHT in `stufenFund` und damit nie in
         `gefundene`: eine Frage ohne Beleg ist kein Fund, und eine
         Stufe, die Funde erfindet, waere die teuerste Zeile dieser
         Datei.

         Bemerkt wird sie trotzdem, und zwar unter eigenem Namen. Erst
         dadurch kann der leere Tag sagen, dass es Fragen gab. */
      if (stufe.ideation) {
        var redaktion = Ideation && typeof Ideation.ideen === "function"
          ? Ideation.ideen({ now: o.now, abgedeckt: abgedeckt,
              ausgeschlosseneFamilien: ausgeschlossen })
          : null;
        var fragen = (redaktion && redaktion.ideen) || [];
        redaktionelleFragen = fragen;

        /* Je Frage eine Ablehnung: der Nachweis soll die ANZAHL
           tragen, nicht nur die Tatsache. Eine einzige Zaehlung fuer
           zwanzig offene Fragen liesse sich spaeter nicht von einer
           fuer eine unterscheiden. */
        for (var q = 0; q < fragen.length; q += 1) {
          ablehnen(ABLEHNUNG.IDEAS_WITHOUT_EVIDENCE);
        }

        stufenBericht.push({
          stufe: stufe.stufe, id: stufe.id, titel: stufe.titel,
          familien: [],
          qualifiziert: 0,
          ideation: true,
          ideen: fragen.length,
          hinweis: (redaktion && redaktion.erklaerung) ||
            "Die redaktionelle Stufe war nicht erreichbar."
        });
        continue;
      }

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

      /* Die offenen redaktionellen Fragen. Sie stehen NEBEN `gefunden`
         und nie darin: getrennt gezaehlt, getrennt gemeldet. */
      redaktionelleFragen: redaktionelleFragen,
      redaktionelleFragenAnzahl: redaktionelleFragen.length,

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

  /**
   * Ein Platte-Thema in der Form, die der Zyklus fuer eine Gelegenheit
   * benutzt.
   *
   * -------------------------------------------------------------------
   * WAS HIER NICHT PASSIERT
   * -------------------------------------------------------------------
   *
   * Es wird nichts erfunden. Was das Thema nicht traegt, bleibt leer:
   *
   *   signalIds   Ein Platte-Thema entsteht NICHT aus einem Signal.
   *               Eine leere Liste ist hier die Wahrheit und kein
   *               Mangel - sie unterscheidet die beiden Herkuenfte,
   *               und genau diese Unterscheidung braucht das Lernen
   *               spaeter.
   *
   *   archetype   Nicht jede Familie hat einen. RANKING zum Beispiel
   *               kommt in der Archetyp-Zuordnung gar nicht vor. Einen
   *               zu waehlen, damit das Feld gefuellt ist, hiesse dem
   *               Lernen eine Erzaehlform beizubringen, die niemand
   *               benutzt hat.
   *
   *   score       Kommt von aussen, wenn es eine Bewertung gibt. Diese
   *               Funktion bewertet nicht - sie formt um.
   */
  /* -------------------------------------------------------------------
     EINE KENNUNG, DIE IN EINE ZEILE PASST

     Die Themenkennung der Platte ist aus den Entitaetsnamen gebaut und
     wurde bei einer Rangliste mit zehn Titeln 154 Zeichen lang. Als
     Gelegenheitskennung waere sie in jedem Protokoll, jedem Dateinamen
     und jeder Fehlermeldung im Weg.

     Gekuerzt wird nicht: eine abgeschnittene Kennung kollidiert
     irgendwann mit einer anderen, und die Kollision faellt genau dann
     auf, wenn zwei Themen verschmelzen. Stattdessen ein kurzer,
     stabiler Abdruck ueber die VOLLE Kennung - und die volle bleibt
     unter `ausDerPlatte.topicId` lesbar.

     FNV-1a, weil eine Engine ohne Abhaengigkeiten auskommen muss. Das
     ist keine kryptographische Aufgabe: gefragt ist Eindeutigkeit bei
     einer Handvoll Themen, nicht Faelschungssicherheit. */
  function abdruck(text) {
    var h = 0x811c9dc5;
    var s = String(text);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function alsGelegenheit(thema, options) {
    if (!thema || !thema.topicId) return null;
    var o = options || {};

    return {
      opportunityId: "opp_" + String(thema.family || "topic").toLowerCase() +
        "_" + abdruck(thema.topicId),
      createdAt: o.now || null,
      topic: thema.title || thema.topicId,
      entities: Array.isArray(thema.entities) ? thema.entities.slice() : [],

      /* Leer, und das ist die Wahrheit: dieses Thema kam nicht aus
         einem Signal, sondern aus der Platte. */
      signalIds: [],

      score: o.score === undefined ? null : o.score,
      components: {},
      archetype: null,
      platform: o.platform || null,
      timeSensitivity: thema.timeSensitivity || null,

      /* -----------------------------------------------------------------
         DIE HERKUNFT KOMMT AUS DEN BELEGEN, NICHT AUS `sources`

         `thema.sources` ist eine Liste blanker Namen - ["VU_DISCOVER"].
         Das Schema verlangt Quellverweise mit einem `source`-Feld, und
         die Belege tragen genau das: jeder Eintrag in `evidence` nennt
         seine Quelle.

         Der erste Anlauf reichte `sources` durch, und das Schema wies
         es zurueck ("sourceRef.source fehlt"). Das war die richtige
         Zurueckweisung: eine Liste von Namen ist keine Herkunft, sie
         ist eine Aufzaehlung von Systemen. */
      provenance: (Array.isArray(thema.evidence) ? thema.evidence : [])
        .filter(function (e) { return e && e.source; })
        .map(function (e) {
          return {
            source: String(e.source),
            entity: e.entity || null,
            metric: e.metric || null,
            value: e.value === undefined ? null : e.value,
            unit: e.unit || null,
            observedAt: e.observedAt || null
          };
        }),
      explanation: thema.question || null,

      /* Was die Platte zusaetzlich weiss und der Zyklus braucht. Es
         steht unter einem eigenen Schluessel, damit niemand es fuer
         ein Feld des Opportunity-Schemas haelt. */
      ausDerPlatte: {
        topicId: thema.topicId,
        family: thema.family,
        entityType: thema.entityType || null,
        question: thema.question || null,
        evidence: Array.isArray(thema.evidence) ? thema.evidence.slice() : [],
        evidenceRefs: Array.isArray(thema.evidenceRefs)
          ? thema.evidenceRefs.slice() : [],
        evidenceSufficient: thema.evidenceSufficient === true,
        /* Wovon der Anlass handelt, und ob es einen gibt. Beides
           entscheidet weiter unten die Archetyp-Eignung; stuende es
           hier nicht, muesste der Zyklus es erraten. */
        premise: thema.premise || null,
        cause: thema.cause || null,
        asOf: thema.asOf || null,
        /* Die blanken Systemnamen bleiben lesbar - sie sind keine
           Herkunft, aber sie sagen, welche Systeme beteiligt waren. */
        systeme: Array.isArray(thema.sources) ? thema.sources.slice() : [],
        stufe: stufeVon(thema.family)
      }
    };
  }

  var api = {
    LEITER: LEITER,
    alsGelegenheit: alsGelegenheit,
    ABLEHNUNG: ABLEHNUNG,
    alleFamilien: alleFamilien,
    stufeVon: stufeVon,
    suche: suche,
    erklaerung: erklaerung
  };

  if (isNode) module.exports = api;
  else global.VUSocialContentLadder = api;
})(typeof window !== "undefined" ? window : globalThis);
