/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/visual-provider.js

   VISUAL STRATEGY IST NICHT VISUAL PROVIDER

   -------------------------------------------------------------------------
   DER DENKFEHLER, DEN DIESE DATEI AUFLOEST
   -------------------------------------------------------------------------

   Im Zyklus standen bisher zwei Dinge unter einem Namen:

     "Was soll das Bild ZEIGEN?"   — eine inhaltliche Entscheidung
     "Wer soll es ZEICHNEN?"       — eine technische

   Solange beide `visualType` hiessen, fielen sie zusammen. Das hatte eine
   teure Folge: weil der Binaertransport eines generativen Bildes unsicher
   war, geriet die ganze Bildfrage unter Verdacht — und der naheliegende
   Ausweg waere gewesen, alles auf DATA_CARD zu beschraenken. Das haette
   eine Transportfrage mit einem inhaltlichen Verzicht beantwortet.

   Getrennt betrachtet loest sich das auf. Die allermeisten Strategien
   sind aus VU-eigenen Daten ZEICHENBAR: ein Score, eine Entwicklung, ein
   Vergleich, eine Kursreihe. Dafuer braucht es keinen externen Agenten
   und keinen Binaertransport — und das Ergebnis ist trotzdem fuer jedes
   Content Object ein ANDERES Bild, weil es aus dessen eigenen Daten
   entsteht.

   Der externe Agent bleibt fuer das, was er wirklich allein kann: eine
   Szene, die es in keinem Datensatz gibt.

   -------------------------------------------------------------------------
   WAS "INDIVIDUELL" HEISST
   -------------------------------------------------------------------------

   Nicht "aus einer Bibliothek gewaehlt". Jedes deterministisch erzeugte
   Bild wird aus den Daten GENAU DIESES Content Objects gerechnet: andere
   Zahlen, andere Achsen, andere Balken, anderer Kurvenverlauf. Zwei
   Beitraege ueber zwei Titel teilen sich kein Bild, auch wenn sie
   dieselbe Strategie haben.

   -------------------------------------------------------------------------
   EINE STRATEGIE OHNE DATEN IST KEINE STRATEGIE
   -------------------------------------------------------------------------

   Jede deterministische Strategie nennt, was sie BRAUCHT. Fehlt es, wird
   sie nicht gewaehlt — und zwar bevor irgendetwas gezeichnet wird. Die
   Alternative waere ein leeres Chart mit beschrifteten Achsen, und das
   ist schlimmer als kein Chart: es sieht nach Information aus.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var DETERMINISTISCH = "VU_RENDERER";
  var GENERATIV = "CHATGPT_WORK";

  /* -------------------------------------------------------------------
     DIE STRATEGIEN

     `needs` nennt die Datenlage, ohne die die Strategie nicht gewaehlt
     werden darf. `perObject` sagt, WORAUS das Bild jedes Mal neu
     entsteht - der Satz steht da, damit niemand spaeter auf die Idee
     kommt, ein Bild wiederzuverwenden.
     ------------------------------------------------------------------- */
  var STRATEGIEN = {
    /* --- deterministisch: aus VU-Daten gerechnet -------------------- */
    DATA_CARD: {
      provider: DETERMINISTISCH, needs: ["keyNumber", "source"],
      perObject: "Zahl, Bezeichnung und Aussage dieses Objekts."
    },
    NUMBER_VISUAL: {
      provider: DETERMINISTISCH, needs: ["keyNumber", "source"],
      perObject: "Die Leitzahl dieses Objekts."
    },
    MINIMAL_TYPOGRAPHY: {
      provider: DETERMINISTISCH, needs: ["statement"],
      perObject: "Die Aussage dieses Objekts."
    },
    CHART: {
      provider: DETERMINISTISCH, needs: ["timeSeries"],
      perObject: "Der Kursverlauf dieses Instruments ueber den Zeitraum " +
        "des Anlasses."
    },
    SCORE: {
      provider: DETERMINISTISCH, needs: ["scoreContributions"],
      perObject: "Die Beitraege, aus denen sich der Score dieses " +
        "Instruments zusammensetzt."
    },
    PERFORMANCE: {
      provider: DETERMINISTISCH, needs: ["returns"],
      perObject: "Die Entwicklungen dieses Instruments ueber die " +
        "gemessenen Horizonte."
    },
    COMPARISON: {
      provider: DETERMINISTISCH, needs: ["peerValues"],
      perObject: "Dieses Instrument gegen die Vergleichsgruppe des Laufs."
    },
    RANKING: {
      provider: DETERMINISTISCH, needs: ["peerValues"],
      perObject: "Die Rangfolge des Laufs, in dem dieses Objekt steht."
    },
    TECHNICAL: {
      provider: DETERMINISTISCH, needs: ["trendState"],
      perObject: "Trend, Momentum und Volatilitaet dieses Instruments."
    },
    FUNDAMENTAL: {
      provider: DETERMINISTISCH, needs: ["fundamentals"],
      perObject: "Die Fundamentalkennzahlen dieses Emittenten."
    },

    /* --- generativ: eine Szene, die in keinem Datensatz steht -------- */

    /* Der Sammelname, den der Zyklus einem uebernommenen Agentenbild
       gibt. Er fehlte hier - und damit zaehlte budget() ausgerechnet
       den EINEN Fall, der wirklich eine Work-Ausfuehrung gekostet hat,
       als kostenlos. Ein Budget, das die teure Zeile nicht sieht, ist
       kein Budget. */
    GENERATIVE: {
      provider: GENERATIV, needs: [],
      perObject: "Ein vom Agenten fuer dieses Objekt erzeugtes Bild."
    },
    FUTURE_TECH: {
      provider: GENERATIV, needs: ["visualBrief"],
      perObject: "Eine eigene Szene zum Thema dieses Objekts."
    },
    ATLAS_SCENE: {
      provider: GENERATIV, needs: ["visualBrief"],
      perObject: "Eine eigene Szene zum Thema dieses Objekts."
    },
    ROBOTICS: {
      provider: GENERATIV, needs: ["visualBrief"],
      perObject: "Eine eigene Szene zum Thema dieses Objekts."
    },
    AI_INFRASTRUCTURE: {
      provider: GENERATIV, needs: ["visualBrief"],
      perObject: "Eine eigene Szene zum Thema dieses Objekts."
    },
    SEMICONDUCTOR_WORLD: {
      provider: GENERATIV, needs: ["visualBrief"],
      perObject: "Eine eigene Szene zum Thema dieses Objekts."
    },
    CINEMATIC_MARKET_STORY: {
      provider: GENERATIV, needs: ["visualBrief"],
      perObject: "Eine eigene Szene zum Thema dieses Objekts."
    }
  };

  function provider(strategy) {
    var s = STRATEGIEN[String(strategy || "")];
    return s ? s.provider : null;
  }

  function istGenerativ(strategy) { return provider(strategy) === GENERATIV; }
  function istDeterministisch(strategy) { return provider(strategy) === DETERMINISTISCH; }

  /**
   * Welche Strategien traegt die Datenlage dieses Content Objects?
   *
   * `availability` ist ein Objekt aus Faehigkeitsnamen auf true/false -
   * dieselbe Form, die visual.js schon benutzt.
   */
  function available(availability) {
    var vorhanden = availability || {};
    var moeglich = [], fehlend = [];
    Object.keys(STRATEGIEN).forEach(function (name) {
      var s = STRATEGIEN[name];
      var fehlt = s.needs.filter(function (n) { return !vorhanden[n]; });
      if (fehlt.length) fehlend.push({ strategy: name, missing: fehlt });
      else moeglich.push(name);
    });
    return { possible: moeglich, unavailable: fehlend };
  }

  /**
   * Die Routing-Entscheidung fuer EIN Content Object.
   *
   * Sie waehlt die Strategie nicht - das tut visual.js aus inhaltlichen
   * Gruenden. Sie beantwortet, WER sie ausfuehrt und ob das ueberhaupt
   * geht.
   */
  function route(strategy, availability, options) {
    options = options || {};
    var name = String(strategy || "");
    var s = STRATEGIEN[name];

    if (!s) {
      return { ok: false, strategy: name, provider: null, reason: "unknownStrategy",
        explanation: "Unbekannte Visual Strategy: " + name + ". Sie wird nicht " +
          "geraten - ein falsch geratener Provider erzeugt entweder ein " +
          "leeres Bild oder einen unnoetigen externen Lauf." };
    }

    var fehlt = s.needs.filter(function (n) { return !(availability || {})[n]; });
    if (fehlt.length) {
      return { ok: false, strategy: name, provider: s.provider, reason: "missingData",
        missing: fehlt,
        explanation: name + " braucht " + fehlt.join(", ") + ". Ohne diese " +
          "Daten entstuende ein Bild, das nach Information aussieht und " +
          "keine traegt." };
    }

    /* -----------------------------------------------------------------
       DIE KOSTENSEITE DER ENTSCHEIDUNG

       Ein generativer Lauf kostet eine begrenzte externe Ressource und
       haengt an einem Binaertransport, der nachweislich scheitern kann.
       Ein deterministischer kostet nichts und kann nicht scheitern.

       Das ist KEIN Grund, generative Strategien abzuschalten - der
       Owner hat das ausdruecklich ausgeschlossen. Es ist ein Grund, die
       Entscheidung sichtbar zu machen: wer eine generative Strategie
       waehlt, obwohl eine deterministische dasselbe zeigen koennte,
       soll das gewollt haben.
       ----------------------------------------------------------------- */
    var alternativen = s.provider === GENERATIV
      ? available(availability).possible.filter(istDeterministisch) : [];

    return {
      ok: true,
      strategy: name,
      provider: s.provider,
      /* Zaehlt dieser Weg gegen das Work-Budget? */
      costsInvocation: s.provider === GENERATIV,
      /* Woraus das Bild bei DIESEM Objekt entsteht. */
      perObject: s.perObject,
      deterministicAlternatives: alternativen,
      explanation: name + " laeuft ueber " + s.provider + ". " + s.perObject +
        (s.provider === GENERATIV
          ? " Das kostet eine Work-Ausfuehrung" +
            (alternativen.length
              ? "; deterministisch moeglich waeren: " + alternativen.join(", ") + "."
              : "; eine deterministische Alternative gibt es bei dieser " +
                "Datenlage nicht.")
          : " Kein externer Lauf, kein Binaertransport.")
    };
  }

  /**
   * Wieviele Work-Ausfuehrungen kostet ein ganzer Zyklus?
   *
   * Beantwortet die Frage, die der Owner gestellt hat: wie erhalten
   * KUENFTIGE Content Objects ihre Bilder, ohne dass die Chatliste
   * volllaeuft.
   */
  function budget(entscheidungen) {
    var liste = Array.isArray(entscheidungen) ? entscheidungen : [];
    var generativ = liste.filter(function (e) {
      return istGenerativ(e && e.strategy);
    });
    return {
      total: liste.length,
      deterministic: liste.length - generativ.length,
      generative: generativ.length,
      invocations: generativ.length,
      explanation: liste.length + " Content Object(s): " +
        (liste.length - generativ.length) + " deterministisch gezeichnet, " +
        generativ.length + " ueber den externen Agenten. " +
        "Work-Ausfuehrungen: " + generativ.length + "."
    };
  }

  var api = {
    DETERMINISTISCH: DETERMINISTISCH,
    GENERATIV: GENERATIV,
    STRATEGIEN: STRATEGIEN,
    provider: provider,
    istGenerativ: istGenerativ,
    istDeterministisch: istDeterministisch,
    available: available,
    route: route,
    budget: budget
  };

  if (isNode) module.exports = api;
  else global.VUSocialVisualProvider = api;
})(typeof window !== "undefined" ? window : globalThis);
