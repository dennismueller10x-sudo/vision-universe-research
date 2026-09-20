/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/audience-fit.js

   DAS AUDIENCE COMPREHENSION GATE

   -------------------------------------------------------------------------
   DER BEFUND, AUS DEM DIESE DATEI ENTSTAND
   -------------------------------------------------------------------------

   "47,6 % in 12 Monaten, aber nur 76 von 100: XOMs Staerke hat ein
   Gegengewicht."

   Dieser Hook hat jedes bestehende Tor bestanden: Evidenz gebunden,
   Marke 100, Komposition 96, Rubrik 10 von 10. Er ist faktisch richtig
   und redaktionell sauber gebaut.

   Und er setzt drei Dinge voraus, die ein breites Publikum nicht hat:
   dass XOM als Exxon Mobil erkannt wird, dass "76 von 100" eine
   bekannte Skala ist, und dass "Staerke" hier eine gemessene Groesse
   meint und kein Urteil.

   Die bestehenden Tore konnten das nicht finden. Sie pruefen, ob der
   Text zur EVIDENZ passt und ob er handwerklich taugt. Keines fragt,
   ob er zum PUBLIKUM passt. Ein System, das nur seine eigene
   Fragestellung optimiert, wird darin immer besser - und merkt nicht,
   dass die Frage selbst die falsche war.

   -------------------------------------------------------------------------
   WAS DIESES TOR NICHT IST
   -------------------------------------------------------------------------

   Es verbietet keine Fachbegriffe. Tiefe bleibt erwuenscht - sie
   gehoert nur nicht in den EINSTIEG. Geprueft wird die Flaeche, ueber
   die jemand stolpert, bevor er sich entschieden hat zu lesen.

   Es ist auch keine Leistungsprognose. Ein verstaendlicher Hook ist
   nicht automatisch ein erfolgreicher. Er ist nur einer, bei dem
   Erfolg ueberhaupt moeglich ist.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Was aussieht wie ein Kuerzel: zwei bis fuenf Grossbuchstaben,
     alleinstehend oder mit Genitiv-s ("XOMs"). */
  var KUERZEL = /\b([A-Z]{2,5})(?:s\b|\b)/g;

  /* Woerter, die zufaellig wie ein Kuerzel aussehen. Ohne diese Liste
     meldete das Tor "KI" oder "ETF" als unerklaertes Tickersymbol -
     und wiese damit genau die Sprache zurueck, die es fordern soll. */
  var KEIN_KUERZEL = ["KI", "ETF", "DAX", "EZB", "FED", "BIP", "USA", "EU",
    "IT", "AG", "SE", "NA", "OK", "ABER", "UND", "DER", "DIE", "DAS"];

  /* Eine Skala im Text: "76 von 100", "5 von 10". */
  var SKALA = /(-?\d+(?:[.,]\d+)?)\s*von\s*(\d+(?:[.,]\d+)?)/i;

  /* Woerter, die eine Skala BENENNEN. Steht keines davon dabei, ist
     "76 von 100" eine Zahl ohne Bezugssystem. */
  var SKALA_BENANNT =
    /\b(?:punkte?n?|score|bewertung|skala|note|rang|platz|index|prozent)\b/i;

  /* Begriffe, die ein interessierter Anleger nicht ohne Weiteres
     aufloest. Nicht verboten - nur nicht im Einstieg. */
  var FACHJARGON = [
    "volatilitaet", "volatilität", "perzentil", "z-score", "drawdown",
    "sharpe", "beta", "alpha", "momentum", "setup", "trendstruktur",
    "schwankungsbreite", "bewertungsextrem", "regime", "rotation",
    "atr", "sma", "rsi", "quantil", "faktorprämie", "faktorpraemie"
  ];

  function woerter(t) {
    return String(t || "").toLowerCase().match(/[a-zäöüß]{3,}/g) || [];
  }

  /**
   * Die Kuerzel im Text, zu denen ein Klarname bekannt ist.
   *
   * `namen` wird HINEINGEREICHT: diese Datei fuehrt keine eigene
   * Tickerliste. Eine zweite Liste ginge irgendwann gegen die
   * kuratierte auseinander, und dann meldete das Tor Namen, die es
   * gar nicht gibt.
   */
  function unerklaerteKuerzel(text, namen) {
    namen = namen || {};
    var t = String(text || "");
    var treffer = [];
    var m;
    KUERZEL.lastIndex = 0;
    while ((m = KUERZEL.exec(t)) !== null) {
      var k = m[1];
      if (KEIN_KUERZEL.indexOf(k) !== -1) continue;
      var klar = namen[k];
      if (!klar) continue;
      /* Steht der Klarname ohnehin im Text, ist das Kuerzel erklaert. */
      var ersterTeil = String(klar).split(/\s+/)[0];
      if (t.toLowerCase().indexOf(ersterTeil.toLowerCase()) !== -1) continue;
      treffer.push({ ticker: k, plainName: klar });
    }
    return treffer;
  }

  /**
   * Das Tor.
   *
   * `surface` ist der EINSTIEG - in aller Regel der Hook. Die Caption
   * darf tiefer gehen; sie wird hier nur als Kontext gelesen, um zu
   * sehen, ob ein Begriff spaeter aufgeloest wird.
   */
  function check(spec) {
    spec = spec || {};
    var einstieg = String(spec.hook || "");
    var tiefe = String(spec.caption || "");
    var namen = spec.names || {};
    var jargon = spec.jargon || FACHJARGON;

    var befunde = [];
    var kriterien = [];
    function pruefe(id, ok, blocking, befund, extra) {
      kriterien.push({ id: id, passed: ok === true, blocking: blocking === true,
        finding: ok === true ? null : befund, detail: extra || null });
      if (ok !== true && blocking === true) befunde.push({ id: id, message: befund });
    }

    /* --- Klarname statt Kuerzel ------------------------------------ */
    var kuerzel = unerklaerteKuerzel(einstieg, namen);
    pruefe("plainEntityName", kuerzel.length === 0, true,
      kuerzel.length
        ? "Der Einstieg nennt " + kuerzel.map(function (k) { return k.ticker; }).join(", ") +
          ", ohne den Namen zu nennen. Wer das Kuerzel nicht kennt, weiss " +
          "nicht, wovon die Rede ist - und liest nicht weiter, um es " +
          "herauszufinden. Bekannt waere: " +
          kuerzel.map(function (k) { return k.ticker + " = " + k.plainName; }).join("; ") + "."
        : null,
      kuerzel);

    /* --- eine Skala, die sich selbst erklaert ---------------------- */
    var hatSkala = SKALA.test(einstieg);
    var benannt = SKALA_BENANNT.test(einstieg);
    pruefe("scaleSelfExplaining", !hatSkala || benannt, true,
      "Der Einstieg nennt \"" + (SKALA.exec(einstieg) || [])[0] +
      "\", ohne zu sagen, WAS gemessen wurde. Eine Zahl ohne " +
      "Bezugssystem ist fuer jemanden, der die Skala nicht kennt, " +
      "keine Information - sie sieht nur nach einer aus.");

    /* --- kein Fachjargon im Einstieg ------------------------------- */
    var drin = woerter(einstieg).filter(function (w) {
      return jargon.indexOf(w) !== -1;
    });
    pruefe("entryWithoutJargon", drin.length === 0, true,
      "Fachjargon im Einstieg: " + drin.join(", ") + ". Diese Begriffe " +
      "duerfen in der Story vorkommen und dort erklaert werden - nur " +
      "nicht auf der Flaeche, ueber die jemand stolpert, bevor er sich " +
      "entschieden hat zu lesen.", drin);

    /* --- wird die Tiefe spaeter aufgeloest? ------------------------ */
    /* Kein blockierendes Kriterium: ein Begriff, der erst in der
       Caption faellt, ist kein Einstiegsproblem. Der Befund ist
       trotzdem nuetzlich - er zeigt, wo Erklaerarbeit fehlt. */
    var tiefeJargon = woerter(tiefe).filter(function (w) {
      return jargon.indexOf(w) !== -1;
    });
    pruefe("depthExplained", true, false, null, tiefeJargon);

    var blockierend = kriterien.filter(function (k) { return k.blocking; });
    var offen = blockierend.filter(function (k) { return !k.passed; });

    return {
      passed: offen.length === 0,
      /* Ausdruecklich: ein verstaendlicher Hook ist nicht automatisch
         ein erfolgreicher. Er ist einer, bei dem Erfolg moeglich ist. */
      predictsPerformance: false,
      criteria: kriterien,
      findings: befunde,
      met: blockierend.length - offen.length,
      total: blockierend.length,
      explanation: offen.length === 0
        ? "Der Einstieg kommt ohne Vorwissen ueber Vision Universe aus."
        : offen.map(function (k) { return k.finding; }).join(" ")
    };
  }

  var api = {
    FACHJARGON: FACHJARGON,
    KEIN_KUERZEL: KEIN_KUERZEL,
    unerklaerteKuerzel: unerklaerteKuerzel,
    check: check
  };

  if (isNode) module.exports = api;
  else global.VUSocialAudienceFit = api;
})(typeof window !== "undefined" ? window : globalThis);
