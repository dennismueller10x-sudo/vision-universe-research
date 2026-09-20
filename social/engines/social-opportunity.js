/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/social-opportunity.js

   WORUEBER SOLLTE VISION UNIVERSE JETZT SPRECHEN?

   -------------------------------------------------------------------------
   EIN SIGNAL IST NICHT DIE GELEGENHEIT
   -------------------------------------------------------------------------

   Bisher galt: Signal vorhanden, also Beitrag. Das Signal war Anlass,
   Thema und Auswahl in einem. Es trat gegen nichts an, weil es nichts
   anderes gab.

   Ein Signal KANN eine Gelegenheit erzeugen. Es IST keine. Zwischen
   beiden liegt eine Auswahl - und eine Auswahl braucht mehr als einen
   Kandidaten.

   Diese Datei rechnet nicht selbst. Sie reicht jedes Thema durch
   opportunity.js, die dieselben acht Dimensionen kennt wie bisher, und
   fuegt hinzu, was erst beim VERGLEICH mehrerer Themen entsteht:

     Portfolio   Was haben wir zuletzt gesagt? Eine Liste von zwanzig
                 Einzelaktien ist kein Programm, auch wenn jede
                 einzelne Gelegenheit fuer sich genommen taugt.

   Zwei Rechenwege waeren zwei Wahrheiten. Es gibt nur einen.

   -------------------------------------------------------------------------
   WAS HIER NICHT PASSIERT
   -------------------------------------------------------------------------

   Keine Leistungsprognose. Die Rangfolge sagt, worueber zu sprechen
   sich LOHNEN KOENNTE - nicht, was funktionieren wird. Dafuer gibt es
   n=0, und n=0 sagt nichts.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     ZWEI DINGE, DIE VORHER EINS WAREN
     ------------------------------------------------------------------- */
  var KIND = {
    /* Etwas ist am Markt passiert. Ein Anlass, kein Inhalt. */
    MARKET_SIGNAL: "MARKET_SIGNAL",
    /* Ein Thema, ueber das gesprochen werden koennte. Kann aus einem
       Signal entstehen - oder aus einem Magazinstueck, einem Report,
       einer redaktionellen Reihe, einer Wissensfrage. */
    CONTENT_OPPORTUNITY: "CONTENT_OPPORTUNITY"
  };

  /**
   * Welche Anlassdimensionen kann dieses Thema ueberhaupt tragen?
   *
   * Ein Erklaerstueck HAT keinen Trend Score - nicht, weil die Messung
   * fehlt, sondern weil die Frage sich nicht stellt. Das muss gesagt
   * werden, sonst zaehlt es als Luecke.
   */
  function nichtAnwendbar(topic) {
    var t = topic || {};
    var raus = [];
    var ausSignal = (t.sources || []).indexOf("VU_QUANT") !== -1 ||
                    (t.sources || []).indexOf("MARKET_DATA") !== -1;
    var redaktionell = (t.sources || []).some(function (q) {
      return ["VU_MAGAZINE", "VU_STOCK_REPORT", "VU_RESEARCH",
              "EDITORIAL", "VU_DISCOVER"].indexOf(q) !== -1;
    });
    if (!ausSignal) { raus.push("trend"); raus.push("vuSignal"); }
    if (!redaktionell) raus.push("editorialBasis");
    return raus;
  }

  /* -------------------------------------------------------------------
     DAS PORTFOLIO

     Diese Dimension entsteht erst im VERGLEICH und kann deshalb nicht
     in opportunity.js stehen: sie ist keine Eigenschaft eines Themas,
     sondern eine des Programms.

     Keine starren Quoten. Gemessen wird SAETTIGUNG: wie oft eine
     Familie in der juengeren Vergangenheit schon dran war. Wer
     zwanzigmal hintereinander dieselbe Form sendet, hat kein Programm,
     sondern eine Schleife.
     ------------------------------------------------------------------- */
  function saettigung(family, historie) {
    var h = historie || [];
    if (!h.length) return { value: 0, measured: false,
      explanation: "Keine Veroeffentlichungshistorie - Saettigung nicht messbar." };

    /* -----------------------------------------------------------------
       EINE HISTORIE OHNE FAMILIE SAGT NICHTS UEBER FAMILIEN

       Der erste Entwurf zaehlte einfach ab und meldete "0 von 25
       Beitraegen waren MAGAZINE_STORY". Das klang nach einer Messung
       und war keine: die 25 Eintraege tragen gar kein Familienfeld -
       es existiert erst seit heute. Gezaehlt wurde also nicht "keine
       Magazingeschichten", sondern "wir wissen es bei keinem".

       Unbekannt als Null zu melden ist dieselbe Verwechslung wie eine
       fehlende Plattformmetrik als 0 zu lesen. Wer sie macht, bekommt
       eine Saettigung von 0 fuer JEDE Familie - und damit eine
       Portfolio-Dimension, die nie etwas bewirkt, aber gemessen
       aussieht.
       ------------------------------------------------------------------- */
    var mitFamilie = h.filter(function (x) { return !!x.family; });
    if (!mitFamilie.length) {
      return { value: 0, measured: false,
        explanation: "Keiner der " + h.length + " Eintraege in der Historie " +
          "traegt eine Content Family - Saettigung ist nicht messbar, nicht null." };
    }
    var gleiche = mitFamilie.filter(function (x) { return x.family === family; }).length;
    return { value: gleiche / mitFamilie.length, measured: true,
      explanation: gleiche + " von " + mitFamilie.length + " Beitraegen mit " +
        "bekannter Familie waren " + family +
        (mitFamilie.length < h.length
          ? " (" + (h.length - mitFamilie.length) + " ohne Familienangabe)" : "") + "." };
  }

  /**
   * Die Rangfolge ueber mehrere Themen.
   *
   * `scorer` ist opportunity.js - hineingereicht, damit diese Datei
   * keine zweite Rechnung fuehrt und in Tests gegen einen Doppelgaenger
   * laufen kann.
   */
  /* -------------------------------------------------------------------
     EXTERNES INTERESSE IST EIN FAKTOR, KEIN VEROEFFENTLICHUNGSRECHT

     Die Versuchung ist gross, externe Haeufigkeit direkt in die
     Rangfolge zu geben: was draussen laeuft, muss doch auch bei uns
     laufen. Zwei Gruende dagegen, und beide sind keine Vorsicht,
     sondern Logik.

     ERSTENS ist fremde Wirkung nicht unsere. Ein Archetyp, der auf
     einem Kanal mit anderer Zielgruppe traegt, sagt ueber unsere
     nichts - dafuer gibt es die EIGENE Performance, und die ist eine
     andere Evidenzklasse.

     ZWEITENS ist Haeufigkeit nicht Wirkung. Dass ein Thema oft
     vorkommt, kann auch heissen, dass es uebersaettigt ist.

     Deshalb: externes Interesse geht als eigene, klar benannte
     Dimension ein - und wird nie mit `audienceInterest` vermischt,
     das die EIGENE Zielgruppe meint.
     ------------------------------------------------------------------- */
  function externesInteresse(topic, beobachtungen, options) {
    options = options || {};
    var min = options.minimumSample === undefined ? 10 : options.minimumSample;
    var b = beobachtungen || [];

    /* -----------------------------------------------------------------
       ABGESCHALTET IST NICHT UNBEOBACHTET

       Ohne Sensor gibt es keine Beobachtungen - aber der Grund ist ein
       anderer als "noch nichts gefunden". Wer beides gleich meldet,
       laesst den Bericht aussehen, als haette jemand gesucht.

       Der Zustand kommt aus der Registry und wird hier nicht noch
       einmal hergeleitet. */
    if (options.sourceState && options.sourceState.state === "NOT_ACTIVE") {
      return { available: false, value: null,
        state: "NOT_ACTIVE",
        activationRequired: true,
        carriesWeight: false,
        explanation: options.sourceState.explanation };
    }

    if (!b.length) {
      return { available: false, value: null,
        state: "NO_OBSERVATIONS",
        explanation: "Keine externen Beobachtungen - das ist die Abwesenheit " +
          "einer Messung, kein Befund ueber externes Interesse." };
    }
    /* Zugeordnet wird ueber die Hashtags, die zu diesem Thema gehoeren -
       nicht ueber Textaehnlichkeit. Eine erfundene Zuordnung waere
       schlimmer als keine. */
    var tags = (topic && topic.observedHashtags) || [];
    if (!tags.length) {
      return { available: false, value: null,
        explanation: "Zu diesem Thema wurde extern nichts beobachtet." };
    }
    var treffer = b.filter(function (o) {
      return tags.indexOf(o.topicCategory) !== -1;
    });
    if (treffer.length < min) {
      return { available: false, value: null, sample: treffer.length,
        explanation: "Nur " + treffer.length + " externe Beobachtungen; ab " +
          min + " wird daraus eine Aussage." };
    }
    /* Der Anteil an allen Beobachtungen - eine RELATIVE Groesse. Eine
       absolute Zahl fremder Kanaele sagt ueber unseren nichts. */
    return { available: true, value: Math.min(1, treffer.length / b.length),
      sample: treffer.length,
      explanation: treffer.length + " von " + b.length + " externen " +
        "Beobachtungen betreffen dieses Thema. Haeufigkeit ist keine " +
        "Wirkung und keine Prognose." };
  }

  function rank(topics, spec) {
    spec = spec || {};
    var scorer = spec.scorer;
    if (typeof scorer !== "function") {
      return { ok: false, ranked: [],
        explanation: "Kein Scorer uebergeben. Diese Datei rechnet nicht " +
          "selbst - zwei Rechenwege waeren zwei Wahrheiten." };
    }
    var historie = spec.history || [];
    var signale = spec.signals || {};      /* topicId -> Messwerte */
    var maxFamilyAnteil = spec.maxFamilyShare === undefined ? 0.4 : spec.maxFamilyShare;

    var bewertet = (topics || []).map(function (t) {
      var eingang = Object.assign({}, signale[t.topicId] || {});
      /* Eine vorhandene redaktionelle Grundlage IST der Anlass eines
         redaktionellen Themas. Sie wird aus den Belegen gelesen, nicht
         geschaetzt: kein Beleg, kein Anlass. */
      if (eingang.editorialBasis === undefined) {
        eingang.editorialBasis = (t.evidenceRefs || []).length ? 0.8 : null;
      }
      /* Externes Interesse als eigene Dimension - nie in
         audienceInterest hineingerechnet. */
      var extern = externesInteresse(t, spec.externalObservations, spec);
      var externAbgeschaltet = extern.state === "NOT_ACTIVE";
      if (extern.available) eingang.externalInterest = extern.value;

      var raus = nichtAnwendbar(t);
      /* -------------------------------------------------------------
         NICHT GEMESSEN IST NICHT UNANWENDBAR

         Erst stand `externalInterest` hier bei `notApplicable`. Das
         haette behauptet, die Frage nach fremder Aufmerksamkeit stelle
         sich fuer dieses Thema nicht. Sie stellt sich sehr wohl - wir
         koennen sie nur noch nicht beantworten, weil keine externe
         Quelle angebunden ist, weil zu diesem Thema nichts beobachtet
         wurde oder weil die Stichprobe zu klein ist.

         Das ist genau der Unterschied, fuer den es
         `systemicallyUnavailable` gibt: die Luecke bleibt in der
         berichteten Abdeckung sichtbar, druckt aber nicht das Thema. */
      /* Drei Gruende, drei Listen. Abgeschaltet gehoert nicht unter
         "systemisch unmessbar": das System KANN, es DARF nur nicht. */
      var systemisch = (extern.available || externAbgeschaltet) ? [] : ["externalInterest"];
      var abgeschaltet = externAbgeschaltet ? ["externalInterest"] : [];
      var befund = scorer(eingang, {
        notApplicable: raus, systemicallyUnavailable: systemisch,
        notActivated: abgeschaltet });
      var sat = saettigung(t.family, historie);

      /* Saettigung bestraft, sie belohnt nicht: ein Thema wird nicht
         besser, weil seine Familie selten war - aber eine Familie, die
         das Programm dominiert, wird zurueckgestellt. */
      var abschlag = sat.measured && sat.value > maxFamilyAnteil
        ? (sat.value - maxFamilyAnteil) : 0;
      var roh = befund.score === null || befund.score === undefined ? null : befund.score;
      var angepasst = roh === null ? null : Math.max(0, Math.round(roh * (1 - abschlag)));

      return {
        topic: t,
        kind: KIND.CONTENT_OPPORTUNITY,
        /* Woraus die Gelegenheit ENTSTAND - nicht, was sie IST. */
        derivedFrom: (t.sources || []).indexOf("VU_QUANT") !== -1
          ? KIND.MARKET_SIGNAL : null,
        score: angepasst,
        rawScore: roh,
        available: befund.available === true,
        state: befund.state,
        coverage: befund.coverage,
        notApplicable: befund.notApplicable || nichtAnwendbar(t),
        missing: befund.missing || [],
        drivers: befund.drivers || [],
        saturation: sat,
        externalInterest: extern,
        externalIntelligenceState: externAbgeschaltet ? "NOT_ACTIVE"
          : extern.available ? "ACTIVE" : "NO_OBSERVATIONS",
        saturationPenalty: abschlag,
        explanation: befund.explanation,
        /* Woertlich, weil die Verwechslung teuer waere. */
        predictsPerformance: false
      };
    });

    var brauchbar = bewertet.filter(function (b) { return b.available && b.score !== null; });
    brauchbar.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      /* Bei Gleichstand die seltenere Familie - das ist eine Regel zur
         Aufloesung von Gleichstaenden, keine Leistungsaussage. */
      return a.saturation.value - b.saturation.value;
    });

    var familien = {};
    brauchbar.forEach(function (b) {
      familien[b.topic.family] = (familien[b.topic.family] || 0) + 1;
    });

    return {
      ok: brauchbar.length > 0,
      ranked: brauchbar,
      rejected: bewertet.filter(function (b) { return !b.available || b.score === null; }),
      families: familien,
      familyCount: Object.keys(familien).length,
      predictsPerformance: false,
      /* Der Zustand des Ganzen, einmal und nicht je Thema. */
      externalIntelligence: spec.sourceState
        ? (spec.sourceState.state === "NOT_ACTIVE"
            ? "NO_ACTIVE_EXTERNAL_SOURCE" : "ACTIVE")
        : null,
      explanation: brauchbar.length === 0
        ? "Keine bewertbare Gelegenheit unter " + bewertet.length + " Themen."
        : brauchbar.length + " Gelegenheiten aus " + Object.keys(familien).length +
          " Content Families treten gegeneinander an."
    };
  }

  var api = {
    KIND: KIND,
    nichtAnwendbar: nichtAnwendbar,
    saettigung: saettigung,
    externesInteresse: externesInteresse,
    rank: rank
  };

  if (isNode) module.exports = api;
  else global.VUSocialSocialOpportunity = api;
})(typeof window !== "undefined" ? window : globalThis);
