/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/creative-quality.js

   RICHTIG IST NICHT DASSELBE WIE GUT

   -------------------------------------------------------------------------
   WAS DIESE DATEI IST — UND WAS SIE AUSDRUECKLICH NICHT IST
   -------------------------------------------------------------------------

   Sie ist eine RUBRIK, keine Messung.

   Der Unterschied ist wichtig genug, um ihn an den Anfang zu stellen.
   asset-transport.js MISST: ein SHA-256 stimmt oder nicht, und wer
   widerspricht, hat unrecht. Diese Datei misst nichts dergleichen. Sie
   prueft nachvollziehbare EIGENSCHAFTEN eines Textes und wendet sie
   gleichmaessig an.

   Sie sagt NICHT voraus, welcher Hook besser laufen wird. Dafuer gibt
   es im Bestand n=0 — kein einziger dieser Beitraege ist je erschienen.
   Eine Zahl, die Leistung verspricht, waere hier dieselbe erfundene
   Prognose, die der Publish Candidate im Feld "Zielmetrik" ausdruecklich
   verweigert. `predictsPerformance: false` steht deshalb im Ergebnis.

   Was die Rubrik leistet: sie macht eine redaktionelle Entscheidung
   NACHVOLLZIEHBAR und WIEDERHOLBAR, statt sie dem Geschmack des
   jeweiligen Laufs zu ueberlassen. Wo ein Kriterium eine Setzung ist
   und keine Messung, steht das an ihm dran (`kind: "policy"`).

   -------------------------------------------------------------------------
   DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Vier Hooks, alle belegt, alle faktisch korrekt, alle durch Brand
   Gate und Fact Check. Und trotzdem keiner, der jemanden zum Anhalten
   bringt:

     "27,35 von 30 Punkten aus der Trendstruktur: So setzt sich der
      XOM-Score zusammen."

   Das ist die Innenansicht unseres Rechenwegs. Fuer den Leser ist
   "27,35 von 30 Punkten" keine Information, sondern eine Zumutung: er
   kennt die Skala nicht, er kennt die Gewichtung nicht, und er hat
   keinen Grund, beides lernen zu wollen.

   Die Gates davor konnten das nicht sehen, weil sie die richtigen
   Fragen stellten: Ist die Zahl belegt? Ja. Steht eine Prognose drin?
   Nein. Passt die Marke? Ja. Keine dieser Fragen lautet: WUERDE DAS
   JEMAND LESEN WOLLEN?

   -------------------------------------------------------------------------
   DIE KRITERIEN
   -------------------------------------------------------------------------

     scrollStop        Steht vorn etwas Konkretes - eine Zahl, ein
                       Gegenstand - oder erst eine Einleitung?
     curiosityGap      Oeffnet der Hook eine Frage, die die Caption
                       beantwortet? Beides noetig: eine Frage ohne
                       Antwort ist ein Koeder, eine Antwort ohne Frage
                       ist ein Datenblatt.
     plainLanguage     Kommt der Text ohne unsere Innensprache aus?
     informationDensity  Zahlen pro 100 Woerter, in einem Band. Zu
                       wenig ist leer, zu viel ist ein Report.
     concreteTension   Stehen zwei GEMESSENE Werte im Text, die
                       gegeneinander stehen?
     storyValue        Wird eine BEZIEHUNG behauptet - oder nur
                       aufgezaehlt?
     complementarity   Sagen Hook und Caption Verschiedenes?
     evidenceBinding   Ist jede Zahl im Text an einen Beleg gebunden?

   Brand Fit und Fact Binding pruefen weiterhin brand.js und
   fact-check.js. Diese Datei wiederholt sie nicht — sie kaeme dabei
   nur auf andere Ergebnisse als die Stelle, die zustaendig ist.

   -------------------------------------------------------------------------
   JEDES KRITERIUM GEHOERT ZU EINER FLAECHE
   -------------------------------------------------------------------------

   Der erste Entwurf dieser Rubrik prueft Hook und Caption als einen
   Text. Das Ergebnis war unbrauchbar: alle vier Varianten fielen an
   denselben zwei Kriterien durch, weil beide die GEMEINSAME Caption
   trafen. Eine Rubrik, die vier Varianten gleich bewertet, obwohl sie
   verschieden sind, vergleicht nicht — sie misst etwas anderes.

   Deshalb traegt jedes Kriterium jetzt die Flaeche, zu der es gehoert:

     hook      was der Hook allein leisten muss
     caption   was die Caption allein leisten muss
     both      was nur im Zusammenspiel entsteht

   Erst damit sagt ein Befund, WO nachgearbeitet werden muss — und
   `best()` vergleicht Hooks an dem, was Hooks unterscheidet.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* -----------------------------------------------------------------
     UNSERE INNENSPRACHE

     Nicht "schwierige Woerter" - die duerfen vorkommen. Sondern
     Bezeichner aus dem Rechenweg, die ausserhalb des Repositories
     nichts bedeuten. Wer sie liest, liest unser Datenmodell.
     ----------------------------------------------------------------- */
  var INNENSPRACHE = [
    { muster: /\bTREND_STRUCTURE\b/i, id: "enum-trend-structure" },
    { muster: /\bPROJECTION_AUXILIARY\b/i, id: "enum-projection" },
    { muster: /\bRELATIVE_STRENGTH\b/i, id: "enum-relative-strength" },
    { muster: /\bSTRONG_POSITIVE\b/i, id: "enum-momentum-state" },
    { muster: /\b(?:MOMENTUM|VOLATILITY|VOLUME|SETUP)\b/, id: "enum-component" },
    { muster: /\bmethodolog\w*|methodische[rnm]?\s+(?:Setup-)?Rang\b/i, id: "methodology-rank" },
    { muster: /\bPerzentil\b/i, id: "percentile" },
    { muster: /\bz\s*=\s*-?\d/i, id: "z-score" },
    { muster: /\bATR\b/, id: "atr" },
    { muster: /\bSMA\d+\b/i, id: "sma" },
    /* Innensprache ist hier die FORMEL, nicht das Verb. Der Brief
       verbot "traegt X von Y Punkten bei"; zurueck kam "steuert 27,35
       von 30 Punkten bei" - und lief glatt durch. Dieselbe
       Defektklasse wie ein Pruefer, der `byte_size` liest, waehrend
       `asset_byte_size` dasteht: das Muster war enger als die Sache.

       Das Partikel muss am Satzglied-ENDE stehen. Sonst faengt sich
       "im Vergleich zu 30 Punkten bei XOM" mit ein, wo "bei" eine
       Praeposition ist und keine Verbklammer schliesst. */
    { muster: /\b\w+\s+[\d.,]+\s+von\s+[\d.,]+\s+Punkten\s+(?:bei|hinzu)(?=\s*[,.;:!?]|$)/i,
      id: "contribution-formula" },
    { muster: /\bTrendwert\b/i, id: "trend-value" },
    { muster: /\bMomentum-Messwert\b/i, id: "momentum-measure" },
    { muster: /\bHandelstage?\b/i, id: "trading-days" }
  ];

  /* Woerter, die eine BEZIEHUNG stiften statt eine Liste fortzusetzen.
     Ohne mindestens eines davon ist ein Text eine Aufzaehlung. */
  var BEZIEHUNG = /\b(?:aber|doch|dennoch|trotz|trotzdem|obwohl|waehrend|dagegen|hingegen|dabei|weil|denn|deshalb|dadurch|sodass|nur|erst|schon|allerdings)\b/i;

  /* Woerter und Zeichen, die eine FRAGE oeffnen. */
  var FRAGE = /\?|\b(?:warum|wieso|weshalb|was|welche[rsnm]?|wie(?:viel|so)?|wo(?:her|rin|ran)?|wann)\b/i;

  /* Eine Zahl im Fliesstext. Deutsche Dezimalkomma-Schreibweise
     eingeschlossen, weil der Text deutsch ist. */
  var ZAHL = /-?\d+(?:[.,]\d+)?\s*(?:%|Prozent|USD|EUR|x|×)?/g;

  /* -----------------------------------------------------------------
     DIE BAENDER

     Beide aus dem Bestand abgeleitet und nicht gesetzt: die Obergrenze
     aus dem Text, den der Owner als zu dicht beanstandet hat, die
     Untergrenze aus dem Text, den visual-quality.js als "inhaltlich
     leer" gefunden hat. Zwei reale Befunde, ein Band dazwischen.
     ----------------------------------------------------------------- */
  var DICHTE = {
    /* Obergrenze: die vom Owner beanstandete Caption von
       cand_20260918_ca4ea408 misst nach der Zaehlweise dieser Datei
       (ohne Datumsangaben, Skalen einfach gezaehlt) 12,7 Zahlen je 100
       Woerter. Die Grenze liegt bei 12 - knapp darunter, damit genau
       dieser Text sie reisst und ein etwas knapperer sie haelt.

       Die Zahl bewegt sich, wenn sich die Zaehlweise aendert. Das ist
       kein Makel: sie ist aus einem Befund abgeleitet und nicht
       gesetzt, und wer die Zaehlung aendert, muss die Ableitung
       nachziehen. CQ11 haelt fest, dass sie zusammenpassen. */
    zuDicht: 12,
    /* Untergrenze: die erste gerenderte Karte, die visual-quality.js
       als inhaltlich leer gefunden hat - 1 Zahl auf 14 Woerter,
       dreimal dieselbe Aussage. */
    zuDuenn: 1.5
  };

  /* Wieviel Text vorn liegt, bevor jemand weiterscrollt. Aus der
     Darstellung: die erste Zeile eines Feed-Beitrags, nicht aus einer
     Annahme ueber Aufmerksamkeitsspannen. */
  var VORNE_ZEICHEN = 45;

  function text(x) { return String(x === null || x === undefined ? "" : x); }

  function woerter(s) {
    return text(s).split(/\s+/).filter(function (w) { return w.length > 0; });
  }

  /* Ein Datum ist keine Informationsdichte.

     "Quelle: Tiingo, Stand 11.09.2026" ist eine Pflichtangabe. Sie
     zaehlte in der ersten Fassung als drei Zahlen und trieb kurze,
     saubere Captions ueber das Band - die Messung bestrafte genau die
     Sorgfalt, die sie belohnen soll. Dasselbe gilt fuer die Jahreszahl
     in einer Datengrundlage. */
  var DATUM = /\b\d{1,2}\.\d{1,2}\.\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:19|20)\d{2}\b/g;

  /* "76 von 100" ist EINE Angabe, nicht zwei.

     Die Skala gehoert zum Wert; sie getrennt zu zaehlen bestrafte
     gerade die Schreibweise, die dem Leser hilft - "76 von 100" ist
     verstaendlicher als ein nacktes "76". Die Messung darf nicht
     gegen die Verstaendlichkeit arbeiten, die sie sichern soll. */
  var SKALA = /(-?\d+(?:[.,]\d+)?)\s*von\s*(\d+(?:[.,]\d+)?)/gi;

  function zahlen(s) {
    var bereinigt = text(s).replace(DATUM, " ").replace(SKALA, "$1");
    return (bereinigt.match(ZAHL) || []).filter(function (t) {
      return /\d/.test(t);
    });
  }

  function innensprache(s) {
    var gefunden = [];
    INNENSPRACHE.forEach(function (m) {
      var t = m.muster.exec(text(s));
      if (t) gefunden.push({ id: m.id, match: t[0] });
    });
    return gefunden;
  }

  /**
   * Die Rubrik auf einen Hook samt Caption.
   *
   * `story`  das Ergebnis aus story-selection.js, falls vorhanden. Ohne
   *          Story kann `concreteTension` nicht geprueft werden - dann
   *          steht das da, statt dass es als bestanden gilt.
   */
  function assess(spec) {
    spec = spec || {};
    var hook = text(spec.hook);
    var caption = text(spec.caption);
    var zusammen = hook + "\n" + caption;
    var kriterien = [];
    /* Welche Flaechen wurden ueberhaupt uebergeben? Ein Kriterium ueber
       eine fehlende Flaeche wird nicht geprueft - und gilt damit auch
       nicht als bestanden. */
    var hat = { hook: hook.length > 0, caption: caption.length > 0 };

    function pruefe(id, surface, kind, ok, blocking, befund) {
      var vorhanden = surface === "both"
        ? (hat.hook && hat.caption) : hat[surface];
      kriterien.push({ id: id, surface: surface, kind: kind,
        passed: vorhanden ? (ok === true) : null,
        blocking: blocking === true,
        finding: !vorhanden
          ? "Nicht geprueft: die Flaeche \"" + surface + "\" liegt nicht vor."
          : (ok === true ? null : befund) });
      return vorhanden && ok === true;
    }

    /* --- scrollStop ------------------------------------------------ */
    var vorne = hook.slice(0, VORNE_ZEICHEN);
    pruefe("scrollStop", "hook", "measurable",
      zahlen(vorne).length > 0 || /[A-Z]{2,}/.test(vorne),
      true,
      "In den ersten " + VORNE_ZEICHEN + " Zeichen steht nichts Konkretes - " +
      "keine Zahl, kein Gegenstand. Wer hier nicht anhaelt, liest den Rest nicht.");

    /* --- curiosityGap ---------------------------------------------- */
    var oeffnet = FRAGE.test(hook) || BEZIEHUNG.test(hook);
    var beantwortet = caption.length > 0 && BEZIEHUNG.test(caption);
    pruefe("curiosityGap", "both", "policy", oeffnet && beantwortet, true,
      !oeffnet
        ? "Der Hook stellt nichts in Frage und stellt nichts gegeneinander - " +
          "er kuendigt an. Eine Ankuendigung erzeugt keine Neugier."
        : "Der Hook oeffnet etwas, das die Caption nicht aufloest.");

    /* --- plainLanguage --------------------------------------------- */
    /* Zwei Befunde, nicht einer. Ein Hook in Klartext neben einer
       Caption voller Innensprache ist ein anderer Fall als beides
       falsch - und verlangt eine andere Nacharbeit. */
    var innenHook = innensprache(hook);
    pruefe("plainLanguageHook", "hook", "measurable", innenHook.length === 0, true,
      "Innensprache im Hook: " + liste(innenHook) +
      ". Das ist die Ansicht unseres Rechenwegs, nicht die des Lesers.");

    var innenCap = innensprache(caption);
    pruefe("plainLanguageCaption", "caption", "measurable", innenCap.length === 0, true,
      "Innensprache in der Caption: " + liste(innenCap) +
      ". Das ist die Ansicht unseres Rechenwegs, nicht die des Lesers.");

    /* --- informationDensity ---------------------------------------- */
    var w = woerter(caption).length;
    var z = zahlen(caption).length;
    var dichte = w > 0 ? (z * 100) / w : 0;
    pruefe("informationDensity", "caption", "measurable",
      dichte <= DICHTE.zuDicht && dichte >= DICHTE.zuDuenn, true,
      dichte > DICHTE.zuDicht
        ? "Zahlendichte " + dichte.toFixed(1) + " je 100 Woerter (Band " +
          DICHTE.zuDuenn + "-" + DICHTE.zuDicht + "). Das ist ein Auszug " +
          "aus dem Report, keine Auswahl daraus."
        : "Zahlendichte " + dichte.toFixed(1) + " je 100 Woerter - unter " +
          DICHTE.zuDuenn + ". Ein Beitrag ohne Zahl behauptet nur.");

    /* --- concreteTension ------------------------------------------- */
    var story = spec.story || null;
    if (!story) {
      kriterien.push({ id: "concreteTension", surface: "hook",
        kind: "measurable", passed: null, blocking: true,
        finding: "Ohne Story-Auswahl laesst sich nicht pruefen, ob zwei " +
          "gemessene Werte gegeneinander stehen. Nicht geprueft ist nicht " +
          "bestanden." });
    } else if (!story.hasTension) {
      pruefe("concreteTension", "hook", "measurable", false, true,
        "Die Evidenz traegt keinen gemessenen Bogen: " + story.explanation);
    } else {
      var st = story.tension.strength, dr = story.tension.drag;
      /* Im HOOK, nicht irgendwo im Text. Der Bogen muss dort stehen, wo
         die Entscheidung faellt weiterzulesen - eine Aufloesung in
         Absatz vier erreicht niemanden, der bei Zeile eins weitergeht.
         Die Staerke darf auch die Stuetze sein: "+47,6 % in 12 Monaten"
         ist dieselbe Staerke, nur in der Sprache des Lesers. */
      var staerkeDa = enthaelt(hook, st.value) ||
        (story.tension.support && zahlAus(story.tension.support) !== null &&
         enthaelt(hook, zahlAus(story.tension.support)));
      var bremseDa = enthaelt(hook, dr.value) ||
        enthaelt(hook, story.lead && zahlAus(story.lead));
      pruefe("concreteTension", "hook", "measurable",
        staerkeDa && bremseDa && BEZIEHUNG.test(hook), true,
        "Der Hook traegt den gemessenen Bogen nicht (" +
        (st.component || st.evidence.id) + " gegen " +
        (dr.component || dr.evidence.id) + "). " +
        (staerkeDa && bremseDa
          ? "Beide Werte kommen vor, aber nichts stellt sie gegeneinander."
          : "Er nennt " + (staerkeDa ? "nur die Staerke" :
             bremseDa ? "nur die Bremse" : "keine der beiden Seiten") + ".") +
        " Belegt heisst nicht erzaehlt.");
    }

    /* --- storyValue ------------------------------------------------ */
    pruefe("storyValue", "caption", "policy", BEZIEHUNG.test(caption), true,
      "Die Caption stellt keine Beziehung her - sie zaehlt auf. " +
      "Eine Liste belegter Zahlen ist noch keine Aussage.");

    /* --- causalAttribution ----------------------------------------- */
    /* storyValue verlangt eine BEZIEHUNG. Dieses Kriterium fragt, ob
       die behauptete Beziehung auch stimmt.

       Der Anlass: "die Schwankungsbreite traegt nur 5 von 10 bei und
       BEGRENZT DAMIT den Gesamtwert auf 76 von 100." Jede Zahl belegt,
       die Faktenpruefung zufrieden - und der Satz trotzdem falsch, an
       der Stelle ohne Zahl. VOLATILITY verliert rund ein Fuenftel der
       fehlenden Punkte; SETUP verliert mehr.

       Ein Kriterium, das eine Beziehung FORDERT, ohne sie zu pruefen,
       belohnt die gut klingende Ursachenbehauptung. Die Zerlegung wird
       hineingereicht wie `story`: diese Datei rechnet nicht selbst und
       bekommt keine zweite Wahrheit. */
    var zerlegung = spec.decomposition || null;
    var zuPruefer = typeof spec.attributionCheck === "function"
      ? spec.attributionCheck : null;
    /* NICHT ANWENDBAR IST ETWAS ANDERES ALS FLAECHE FEHLT

       Eine fehlende Flaeche laesst die Rubrik durchfallen (CQ9), und
       das ist richtig: Hook und Caption MUESSEN da sein. Eine
       Score-Zerlegung muss es nicht - die meisten Inhalte haben gar
       keinen zusammengesetzten Kennwert. Ein blockierendes Kriterium
       machte die Rubrik ueberall dort unerfuellbar, wo die Frage sich
       nicht stellt.

       Also entsteht das Kriterium nur, wo die Frage beantwortbar ist.
       Damit das nicht STILL geschieht - der eigentliche Vorwurf an
       ein uebersprungenes Tor - traegt jeder Befund `attributionChecked`
       und sagt, ob gefragt wurde. */
    var zuGeprueft = false;
    if (zerlegung && zuPruefer) {
      var zu = zuPruefer(caption, zerlegung);
      zuGeprueft = true;
      pruefe("causalAttribution", "caption", "measurable",
        !!zu && zu.ok === true, true,
        (zu && zu.explanation) || "Die Zuschreibung konnte nicht geprueft werden.");
    }

    /* --- complementarity ------------------------------------------- */
    var hookZahlen = zahlen(hook);
    var capAnfang = caption.split(/(?<=[.!?])\s/)[0] || "";
    var doppelt = hookZahlen.length > 0 &&
      hookZahlen.every(function (t) { return capAnfang.indexOf(t) !== -1; });
    pruefe("complementarity", "both", "policy", !doppelt, false,
      "Der erste Satz der Caption wiederholt die Zahlen des Hooks. " +
      "Zwei Gelegenheiten, eine Aussage.");

    /* --- evidenceBinding ------------------------------------------- */
    /* Nur die Frage, ob eine Bindung VORLIEGT. Ob sie stimmt, prueft
       fact-check.js - eine zweite Meinung dazu waere eine zweite
       Wahrheit. */
    var refs = spec.evidenceRefs;
    pruefe("evidenceBinding", "hook", "measurable",
      Array.isArray(refs) && refs.length > 0, true,
      "Der Hook nennt keine Belegbindung.");

    var blockierend = kriterien.filter(function (k) {
      return k.blocking && k.passed !== true;
    });
    var hinweise = kriterien.filter(function (k) {
      return !k.blocking && k.passed !== true;
    });

    return {
      passed: blockierend.length === 0,
      /* Ausdruecklich: keine Leistungsprognose. */
      predictsPerformance: false,
      criteria: kriterien,
      blocking: blockierend,
      warnings: hinweise,
      /* Wieviele Kriterien bestanden - als ZAEHLUNG, nicht als Note.
         Eine Note suggeriert eine Skala, die es nicht gibt. */
      attributionChecked: zuGeprueft,
      met: kriterien.filter(function (k) { return k.passed === true; }).length,
      total: kriterien.length,
      explanation: blockierend.length === 0
        ? kriterien.filter(function (k) { return k.passed === true; }).length +
          " von " + kriterien.length + " Kriterien erfuellt" +
          (hinweise.length ? ", " + hinweise.length + " Hinweis(e)." : ".")
        : blockierend.map(function (b) { return b.id + ": " + b.finding; }).join(" ")
    };
  }

  function liste(befunde) {
    return befunde.map(function (f) { return "\"" + f.match + "\""; }).join(", ");
  }

  /** Die Zahl eines Belegs - aus `value`, sonst aus seiner Aussage. */
  function zahlAus(beleg) {
    if (!beleg) return null;
    if (beleg.value !== null && beleg.value !== undefined && beleg.value !== "") {
      return beleg.value;
    }
    var t = /(-?\d+(?:[.,]\d+)?)/.exec(String(beleg.statement || ""));
    return t ? t[1] : null;
  }

  /** Steht diese gemessene Zahl im Text - in deutscher oder ASCII-Schreibweise? */
  function enthaelt(s, wert) {
    if (wert === null || wert === undefined) return false;
    var roh = String(wert);
    var kandidaten = [roh, roh.replace(".", ",")];
    /* 27.35 erscheint als "27,35"; 5 auch als "5". Gerundete Formen
       zaehlen nicht: eine andere Zahl ist eine andere Zahl. */
    for (var i = 0; i < kandidaten.length; i++) {
      var k = kandidaten[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp("(?<![\\d.,])" + k + "(?![\\d])").test(s)) return true;
    }
    return false;
  }

  /**
   * Die beste aus mehreren Varianten.
   *
   * Sortiert wird nach erfuellten Kriterien, und bei Gleichstand
   * entscheidet die Reihenfolge der Varianten - NICHT ein Zufall und
   * nicht die Empfehlung des Agenten. Gibt es keine bestandene, sagt
   * das Ergebnis das; es waehlt dann keine "am wenigsten schlechte".
   */
  function best(varianten, spec) {
    spec = spec || {};
    var bewertet = (varianten || []).map(function (v, i) {
      return { index: i, variant: v,
        /* DURCHREICHEN, NICHT ABSCHREIBEN

           Hier standen vier von Hand kopierte Felder. Als die Rubrik
           ein fuenftes bekam - die Score-Zerlegung - blieb es
           lautlos liegen: `assess` sah keine Zerlegung, meldete "nicht
           geprueft", und der gespeicherte Befund trug neun Kriterien
           statt zehn. Der Aufrufer hatte alles richtig uebergeben.

           Eine Abschrift laesst irgendwann genau das Feld aus, das
           neu ist. Was diese Funktion selbst bestimmt, steht danach -
           alles andere reist durch. */
        assessment: assess(Object.assign({}, spec, {
          hook: v.hook, evidenceRefs: v.evidenceRefs })) };
    });

    /* Verglichen wird an dem, was die Varianten UNTERSCHEIDET. Die
       Caption ist bei allen dieselbe; ihre Befunde wuerden jede
       Variante gleich belasten und die Rangfolge verschlucken. Sie
       bleiben im Bericht - sie gehen nur nicht in den Vergleich ein. */
    bewertet.forEach(function (b) {
      b.hookMet = b.assessment.criteria.filter(function (k) {
        return k.surface !== "caption" && k.passed === true;
      }).length;
      b.hookTotal = b.assessment.criteria.filter(function (k) {
        return k.surface !== "caption";
      }).length;
      b.hookBlocking = b.assessment.criteria.filter(function (k) {
        return k.surface !== "caption" && k.blocking && k.passed !== true;
      });
    });

    var bestanden = bewertet.filter(function (b) { return b.assessment.passed; });
    bestanden.sort(function (a, b) {
      if (b.hookMet !== a.hookMet) return b.hookMet - a.hookMet;
      return a.index - b.index;
    });

    /* Die Rangfolge unter den Hooks - auch wenn keiner besteht. Sie
       sagt, welcher am wenigsten weit weg ist, und sie sagt NICHT,
       dass einer davon reicht. */
    var rangfolge = bewertet.slice().sort(function (a, b) {
      if (b.hookMet !== a.hookMet) return b.hookMet - a.hookMet;
      return a.index - b.index;
    });

    return {
      ok: bestanden.length > 0,
      chosen: bestanden.length ? bestanden[0] : null,
      assessed: bewertet,
      ranking: rangfolge,
      /* Wer vorne laege, WENN die Huerde faellt. Ausdruecklich keine
         Auswahl: ein Vorschlag fuer den Menschen, der entscheidet. */
      closest: rangfolge.length ? rangfolge[0] : null,
      explanation: bestanden.length
        ? "Variante " + (bestanden[0].index + 1) + " erfuellt " +
          bestanded(bestanden[0]) + "."
        : "Keine der " + bewertet.length + " Varianten besteht die Rubrik. " +
          "Eine \"am wenigsten schlechte\" zu waehlen hiesse, die Grenze " +
          "an das anzupassen, was gerade vorliegt."
    };
  }

  function bestanded(b) {
    return b.assessment.met + " von " + b.assessment.total + " Kriterien";
  }

  var api = {
    INNENSPRACHE: INNENSPRACHE,
    /* Hinausgereicht, damit die ANWEISUNG an den Agenten und die
       PRUEFUNG danach dieselbe Liste meinen. Eine abgeschriebene
       zweite Liste geht irgendwann auseinander, und der Unterschied
       faellt erst auf, wenn ein Lauf daran scheitert - und der kostet
       eine Work-Ausfuehrung. */
    BEZIEHUNG: BEZIEHUNG,
    DICHTE: DICHTE,
    VORNE_ZEICHEN: VORNE_ZEICHEN,
    innensprache: innensprache,
    assess: assess,
    best: best
  };

  if (isNode) module.exports = api;
  else global.VUSocialCreativeQuality = api;
})(typeof window !== "undefined" ? window : globalThis);
