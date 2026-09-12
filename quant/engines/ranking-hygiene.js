/* =========================================================================
   VISION UNIVERSE — ranking-hygiene.js

   WAS OBEN IN EINER RANGLISTE STEHEN DARF.

   Auf Platz eins der Zwoelfmonatsrendite stand MINE mit 314.999.900 %.
   Das ist kein Kursverlauf, das ist eine Bereinigungsluecke. Daneben
   SPCL mit 1.806.567 % und ADAC mit 720.614 %. Ein Eigentuemer, der auf
   diese Liste sieht, liest sie als die staerksten Titel des Universums.

   WARUM dataQuality DAS NICHT ALLEIN LOEST

   Naheliegend waere: die Qualitaetsstufe fragen und FAIL herauswerfen.
   Das ist richtig und reicht nicht. Gemessen am ausgelieferten
   Gate-Bericht:

     MINE   WARNING · large_move_matching_split_ratio
     AAPL   WARNING · large_move_matching_split_ratio

   DIESELBE Stufe, DERSELBE Grund. WARNING traegt 4.927 der 7.803 Titel -
   zwei Drittel des Universums. Wer WARNING unterdrueckt, loescht das
   Produkt; wer nur FAIL unterdrueckt, laesst MINE oben stehen. Die
   Qualitaetsstufe trennt diese beiden Faelle nicht, weil ein grosser
   Kurssprung an sich nichts Falsches ist.

   Was sie trennt, ist die GROESSE DES WERTES SELBST. Die gemessene
   Verteilung ueber 5.620 Titel mit Faktorzeile:

     Median        1,2 %
     p90          75,9 %
     p99         341,3 %
     p99,5       683,1 %
     Maximum   314.999.900 %

   Oberhalb von +1.000 % liegen 18 Titel - 0,32 Prozent. Dort mischen
   sich echte Vervielfacher und Rechenluecken, und darueber hoert das
   Mischen auf: eine Jahresrendite von 100.000 % ist keine Kursbewegung.

   QUARANTAENE, NICHT KORREKTUR

   Nichts wird veraendert und nichts geloescht. Der Wert bleibt in der
   Zeile, in der Ablage und im Artefakt; er wird lediglich nicht als
   Anlageergebnis nach oben gereicht. Wer ihn sucht, findet ihn in der
   Quarantaeneliste mit seinem Grund - das ist der Unterschied zwischen
   "aufgeraeumt" und "geschoent".

   DIE GRENZE IST EINE ANZEIGEENTSCHEIDUNG, KEINE MESSUNG. Sie steht
   deshalb hier, mit ihrer Herleitung, und nicht verstreut in drei
   Oberflaechen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var VERSION = "ranking-hygiene-1.0.0";

  /* Qualitaetsstufen, die in keiner Anlegerliste oben stehen duerfen.
     WARNING steht bewusst NICHT dabei - siehe Kopf. */
  var GESPERRTE_QUALITAET = ["FAIL", "UNAVAILABLE"];

  /* Plausibilitaetsgrenzen je Kennzahl, als ANTEIL (0,1 = 10 %).

     Sie sind absichtlich weit oberhalb der gemessenen Verteilung
     gewaehlt: p99,5 der Zwoelfmonatsrendite liegt bei 6,8, die Grenze
     bei 10. Ein echter Verzehnfacher faellt damit in die Quarantaene -
     sichtbar, mit Grund, nicht geloescht. Das ist die richtige
     Richtung: ein zurueckgehaltener echter Ausreisser ist eine
     Nachfrage, ein durchgereichter falscher eine Fehlinformation. */
  var GRENZEN = {
    "returns.1M": 5,
    "returns.3M": 8,
    "returns.6M": 10,
    "returns.12M": 10,
    "return12M1M": 10,
    momentum1m: 5,
    momentum3m: 8,
    momentum6m: 10,
    momentum12m: 10,
    /* Ein Rueckgang kann hoechstens -100 % sein; alles darunter ist ein
       Rechenfehler. Die Grenze fasst beide Vorzeichen. */
    maxDrawdown252d: 1.01,
    maxDrawdown: 1.01,
    /* Relative Staerke ist ein Verhaeltnis zum Vergleichsindex. Das
       Zehnfache ist bereits aussergewoehnlich; das Vierzehnfache von
       MINE stammt aus derselben Luecke wie seine Rendite. */
    "relativeStrength.1M": 5,
    "relativeStrength.3M": 8,
    "relativeStrength.6M": 10,
    "relativeStrength.12M": 10,
    momentumAcceleration: 10,
    /* Annualisierte Volatilitaet ueber 100 % kommt vor; das
       Neunundzwanzigfache ist keine Schwankung mehr. */
    volatility252d: 5,
    volatility60d: 5,
    volatility20d: 5,
    volatility: 5
  };

  /* Die Rangfragen des Screeners heissen anders als die Faktorfelder -
     "strongestMomentum12M" statt "returns.12M". Die Zuordnung steht
     hier und nicht in der Oberflaeche: sonst kennte jede Ansicht eine
     eigene Teilmenge, und eine Frage ohne Grenze faellt niemandem auf.

     Die Reihenfolge zaehlt: "Momentum12M1M" muss VOR "Momentum12M"
     stehen, sonst gewinnt das kuerzere Muster. */
  var FRAGE_ALIASE = [
    ["Momentum12M1M", "return12M1M"],
    ["Momentum12M", "returns.12M"],
    ["Momentum6M", "returns.6M"],
    ["Momentum3M", "returns.3M"],
    ["Momentum1M", "returns.1M"],
    ["RelativeStrength12M", "relativeStrength.12M"],
    ["RelativeStrength6M", "relativeStrength.6M"],
    ["RelativeStrength3M", "relativeStrength.3M"],
    ["RelativeStrength1M", "relativeStrength.1M"],
    ["trendAcceleration", "momentumAcceleration"],
    ["Drawdown", "maxDrawdown252d"],
    ["Volatility", "volatility252d"]
  ];

  function metrikFuerFrage(id) {
    var s = String(id || "");
    for (var i = 0; i < FRAGE_ALIASE.length; i++) {
      if (s.indexOf(FRAGE_ALIASE[i][0]) >= 0) return FRAGE_ALIASE[i][1];
    }
    return s;
  }

  function grenzeFuer(metrik) {
    if (Object.prototype.hasOwnProperty.call(GRENZEN, metrik)) return GRENZEN[metrik];
    var ueber = metrikFuerFrage(metrik);
    return Object.prototype.hasOwnProperty.call(GRENZEN, ueber) ? GRENZEN[ueber] : null;
  }

  /**
   * Warum ein Eintrag nicht als Anlageergebnis nach oben gehoert -
   * oder null, wenn nichts dagegen spricht.
   *
   * @param {object} eintrag  {value, dataQuality}
   * @param {string} metrik   Feld-Id, z. B. "returns.12M"
   * @param {object} opts     {skala: 1 = Anteil, 100 = Prozentpunkte}
   */
  function quarantaeneGrund(eintrag, metrik, opts) {
    opts = opts || {};
    var skala = opts.skala || 1;
    if (!eintrag) return null;

    if (GESPERRTE_QUALITAET.indexOf(eintrag.dataQuality) >= 0) {
      return { reason: "DATA_QUALITY_" + eintrag.dataQuality,
               message: "Die Kursreihe dieses Titels hat den Qualitaetstest des Laufs " +
                        "nicht bestanden (" + eintrag.dataQuality + ")." };
    }

    var grenze = grenzeFuer(metrik);
    if (grenze === null) return null;
    var wert = eintrag.value;
    if (!Number.isFinite(wert)) return null;
    var anteil = Math.abs(wert) / skala;
    if (anteil <= grenze) return null;

    return {
      reason: "IMPLAUSIBLE_VALUE",
      message: "Der Wert liegt bei " + Math.round(anteil * 100) + " % und damit jenseits " +
               "der Plausibilitaetsgrenze von " + Math.round(grenze * 100) + " % fuer " +
               metrik + ". Solche Werte entstehen an Bereinigungsluecken, nicht an " +
               "Kursbewegungen. Der Wert bleibt unveraendert erhalten.",
      bound: grenze, value: wert
    };
  }

  /**
   * Eine Rangliste trennen: was angezeigt wird, und was mit Grund
   * danebensteht.
   *
   * Beides kommt zurueck. Eine Funktion, die nur das Saubere liefert,
   * macht die Quarantaene unsichtbar - und damit ununterscheidbar von
   * stillem Loeschen.
   */
  function trenne(eintraege, metrik, opts) {
    var gezeigt = [], quarantaene = [];
    (eintraege || []).forEach(function (e) {
      var grund = quarantaeneGrund(e, metrik, opts);
      if (grund) {
        var kopie = {};
        for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) kopie[k] = e[k];
        kopie.quarantineReason = grund.reason;
        kopie.quarantineMessage = grund.message;
        quarantaene.push(kopie);
      } else {
        gezeigt.push(e);
      }
    });
    return {
      shown: gezeigt, quarantined: quarantaene,
      quarantinedCount: quarantaene.length,
      metric: metrik, bound: grenzeFuer(metrik),
      note: quarantaene.length
        ? "Zurueckgehalten, nicht veraendert: die Werte stehen unveraendert in den " +
          "Zeilen und im Artefakt."
        : null
    };
  }

  var api = {
    VERSION: VERSION,
    GESPERRTE_QUALITAET: GESPERRTE_QUALITAET,
    GRENZEN: GRENZEN,
    grenzeFuer: grenzeFuer,
    metrikFuerFrage: metrikFuerFrage,
    quarantaeneGrund: quarantaeneGrund,
    trenne: trenne
  };

  if (isNode) module.exports = api;
  else global.VURankingHygiene = api;
})(typeof window !== "undefined" ? window : globalThis);
