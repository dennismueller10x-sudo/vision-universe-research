/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/score-decomposition.js

   WER DIE LUECKE WIRKLICH VERURSACHT

   -------------------------------------------------------------------------
   DER BEFUND, AUS DEM DIESE DATEI ENTSTAND
   -------------------------------------------------------------------------

   Eine Caption schrieb: "die Schwankungsbreite traegt nur 5 von 10 bei
   und BEGRENZT DAMIT den Gesamtwert auf 76 von 100."

   Jede Zahl darin ist belegt. Der Satz ist trotzdem falsch, und zwar
   an der Stelle, an der keine Zahl steht: bei "damit". VOLATILITY
   verliert 5,00 der 24,01 fehlenden Punkte - rund ein Fuenftel. SETUP
   verliert mit 6,56 MEHR. Der Satz macht aus einem von sechs Beitraegen
   die Ursache des Ganzen.

   Das ist kein Rechenfehler und keine erfundene Zahl. Es ist eine
   URSACHENBEHAUPTUNG, die die Evidenz nicht traegt - und genau die
   verbietet der Brief seit dem ersten Auftrag.

   -------------------------------------------------------------------------
   WARUM EINE EIGENE DATEI
   -------------------------------------------------------------------------

   Die Faktenpruefung fragt: steht diese Zahl in der Evidenz? Darauf
   antwortet sie hier mit ja, sechsmal. Die Frage "erklaert dieser
   Beitrag, was der Satz ihm zuschreibt?" hat bisher niemand gestellt,
   weil es keine Stelle gab, die die Luecke ueberhaupt ausrechnet.

   Ein Pruefer kann nur finden, was er berechnen kann.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* Aus "TREND_STRUCTURE traegt 27.35 von 30 Punkten bei." Die Evidenz
     schreibt die Zahlen mit Punkt; die Copy spaeter mit Komma. */
  var BEITRAG = /^([A-Z_]+)\s+traegt\s+(-?\d+(?:[.,]\d+)?)\s+von\s+(\d+(?:[.,]\d+)?)\s+Punkten\s+bei/i;

  /* Der Name, unter dem ein Beitrag im oeffentlichen Text auftaucht.
     Ohne diese Bruecke kann keine Pruefung sehen, WOVON eine Caption
     gerade spricht - sie nennt den Bezeichner ja gerade nicht. */
  var LESERNAME = {
    TREND_STRUCTURE: ["trendstruktur", "trend"],
    /* NICHT "entwicklung". Der erste Entwurf fuehrte das Wort hier -
       und "Die 12M-Entwicklung von 47,6 %" zaehlte daraufhin als
       Nennung des MOMENTUM-BEITRAGS. Das sind zwei verschiedene
       Dinge: eine Kursveraenderung ueber zwoelf Monate und ein
       Punktebeitrag von 15,54 von 20. Mit diesem Synonym kam der
       fehlerhafte Satz auf 50,4 % Deckung und bestand knapp. Eine zu
       weite Bruecke ist hier schlimmer als gar keine: sie laesst
       genau den Fall durch, fuer den das Tor gebaut wurde. */
    MOMENTUM: ["momentum"],
    VOLUME: ["volumen", "handelsvolumen"],
    VOLATILITY: ["schwankungsbreite", "volatilitaet", "volatilität"],
    SETUP: ["setup", "aufbau"],
    PROJECTION_AUXILIARY: ["projektion"]
  };

  function zahl(s) { return parseFloat(String(s).replace(",", ".")); }

  /**
   * Die Zerlegung aus den Belegen - nicht aus einer zweiten Tabelle.
   * Wer die Beitraege hier noch einmal auffuehrte, haette zwei
   * Wahrheiten, und die zweite faellt erst auf, wenn sie auseinander
   * laufen.
   */
  function zerlege(evidence) {
    var teile = [];
    (evidence || []).forEach(function (e) {
      var t = BEITRAG.exec(String((e && e.statement) || ""));
      if (!t) return;
      var wert = zahl(t[2]), max = zahl(t[3]);
      if (!isFinite(wert) || !isFinite(max) || max <= 0) return;
      teile.push({ component: t[1].toUpperCase(), evidenceId: e.id,
        value: wert, max: max, lost: max - wert, ratio: wert / max });
    });

    var summe = teile.reduce(function (a, t) { return a + t.value; }, 0);
    var maxSumme = teile.reduce(function (a, t) { return a + t.max; }, 0);
    var luecke = maxSumme - summe;

    teile.forEach(function (t) {
      t.shareOfGap = luecke > 0 ? t.lost / luecke : 0;
    });

    var nachVerlust = teile.slice().sort(function (a, b) { return b.lost - a.lost; });
    var nachAusschoepfung = teile.slice().sort(function (a, b) { return a.ratio - b.ratio; });

    return {
      /* Vollstaendig heisst: die Teile ergeben zusammen das Maximum.
         Fehlt eine Komponente, ist jede Aussage ueber "die Luecke"
         eine Aussage ueber einen Ausschnitt - und darf nicht so
         klingen, als waere sie eine ueber das Ganze. */
      complete: teile.length > 0 && Math.abs(maxSumme - 100) < 0.001,
      parts: teile, total: summe, max: maxSumme, gap: luecke,
      largestLoss: nachVerlust[0] || null,
      lowestRatio: nachAusschoepfung[0] || null,
      byLoss: nachVerlust, byRatio: nachAusschoepfung
    };
  }

  /** Welche Beitraege nennt dieser Text - in Lesersprache? */
  function genannt(text, zerlegung) {
    var klein = String(text || "").toLowerCase();
    return (zerlegung.parts || []).filter(function (t) {
      return (LESERNAME[t.component] || []).some(function (w) {
        return klein.indexOf(w) !== -1;
      });
    });
  }

  /* Ein Satz, der einen Beitrag zur URSACHE des Gesamtwerts macht.
     "begrenzt damit", "drueckt den Wert auf", "haelt den Score bei". */
  /* STAEMME, keine Vollformen. Der erste Entwurf listete "begrenzt"
     und uebersah "begrenzen" - ein Plural genuegte, und die Pruefung
     hielt den Satz fuer eine blosse Aufzaehlung. Dieselbe Sorte
     Luecke wie ein Verbot, das am Verb haengt statt an der Formel. */
  var URSACHE = /\b(?:begrenz|drueck|drück|haelt|hält|halten|verhinder|brems|kostet|kosten|reiss|reiß|zieh)\w*/i;
  var BEZUG = /\b(?:damit|dadurch|deshalb|so)\b/i;

  /**
   * Traegt die Evidenz, was der Text behauptet?
   *
   * Geprueft wird NICHT, ob der Text eine Ursache nennen darf - das
   * entscheidet der Brief. Geprueft wird, ob die genannten Beitraege
   * die Luecke MEHRHEITLICH erklaeren. Wer ein Fuenftel nennt und
   * "damit" sagt, behauptet vier Fuenftel mit.
   */
  /** Der erste Satz, der eine Ursachenbehauptung traegt. */
  function satzMitUrsache(text) {
    var saetze = String(text || "").split(/(?<=[.!?])\s+/);
    for (var i = 0; i < saetze.length; i++) {
      if (URSACHE.test(saetze[i]) && BEZUG.test(saetze[i])) return saetze[i];
    }
    return null;
  }

  function pruefeZuschreibung(text, zerlegung, options) {
    options = options || {};
    var schwelle = options.mindestAnteil === undefined ? 0.5 : options.mindestAnteil;
    var t = String(text || "");
    var behauptet = URSACHE.test(t) && BEZUG.test(t);
    if (!behauptet) {
      return { applicable: false, ok: true, named: [], coverage: null,
        explanation: "Der Text macht keinen einzelnen Beitrag zur Ursache " +
          "des Gesamtwerts." };
    }
    /* NUR DER SATZ, DER DIE URSACHE BEHAUPTET

       Gezaehlt wurde zuerst die ganze Caption. Damit half jede
       Komponente mit, die irgendwo spaeter vorkam - drei Saetze
       weiter, in voellig anderem Zusammenhang. Eine Zuschreibung
       findet aber in EINEM Satz statt, und nur dessen Nennungen
       traegt sie. */
    var satz = satzMitUrsache(t) || t;
    var teile = genannt(satz, zerlegung);
    var deckung = teile.reduce(function (a, x) { return a + x.shareOfGap; }, 0);
    var ok = deckung >= schwelle;
    return {
      applicable: true, ok: ok, named: teile.map(function (x) { return x.component; }),
      coverage: deckung, threshold: schwelle,
      explanation: ok
        ? "Die genannten Beitraege erklaeren " + Math.round(deckung * 100) +
          " % der Luecke."
        : "Der Text macht " +
          (teile.length ? teile.map(function (x) { return x.component; }).join(", ")
                        : "keinen benennbaren Beitrag") +
          " zur Ursache des Gesamtwerts, erklaert damit aber nur " +
          Math.round(deckung * 100) + " % der fehlenden " +
          zerlegung.gap.toFixed(2) + " Punkte. Den groessten Einzelverlust " +
          "traegt " + (zerlegung.largestLoss ? zerlegung.largestLoss.component +
          " mit " + zerlegung.largestLoss.lost.toFixed(2) : "keiner") + "."
    };
  }

  var api = {
    LESERNAME: LESERNAME,
    zerlege: zerlege,
    genannt: genannt,
    satzMitUrsache: satzMitUrsache,
    pruefeZuschreibung: pruefeZuschreibung
  };

  if (isNode) module.exports = api;
  else global.VUSocialScoreDecomposition = api;
})(typeof window !== "undefined" ? window : globalThis);
