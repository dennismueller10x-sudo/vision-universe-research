/* =========================================================================
   VISION UNIVERSE — plain-verdict.js          (plain-verdict-1.0.0)

   EIN SATZ, DEN JEMAND VERSTEHT, DER 25 EURO IM MONAT SPART.

   Gemessen am 28.09.2026 verlangte die Aktienseite 1.046 Woerter und 17
   Karten, bevor die Frage "ist das gut?" beantwortet war. Fuenf
   Faktorbalken sind fuer jemanden, der einen Sparplan hat, keine Antwort,
   sondern eine Pruefung.

   WARUM KEINE GESAMTNOTE

   Der Entwurf wollte "Quant Score 91/100". Diese Datei liefert sie
   bewusst nicht, und zwar aus zwei Gruenden, die beide keine Vorsicht
   sind, sondern Rechenfehler:

     Erstens taeuscht 91 gegen 90 eine Genauigkeit vor, die in den Daten
     nicht steckt. Die Baender der Methodik sind Fuenftel des Universums -
     der Unterschied zwischen 90 und 91 liegt innerhalb eines Bandes und
     bedeutet nichts.

     Zweitens verrechnet eine Zahl Guenstigkeit mit Kursdynamik. Ein
     teurer Titel mit starkem Lauf und ein guenstiger ohne Lauf koennen
     dieselbe Zahl tragen - und das ist genau die Information, die
     jemand braucht.

   Stattdessen: eine grobe Stufe, die man in einer Sekunde liest, und
   darunter die Gruende im Klartext. Die Stufe ist kein neues Urteil. Sie
   zaehlt nur, wie viele der bereits gemessenen Faktoren ueber und wie
   viele unter dem Mittelfeld liegen. Rechnet wird nichts dazu.

   DER NENNER IST EHRLICH

   Gezaehlt wird gegen die Zahl der BEWERTETEN Faktoren, nicht gegen
   sieben. Wo nur drei Faktoren einen Wert haben, steht "stark in 2 von
   3 geprueften Punkten" - und die fehlenden vier stehen als Luecke
   daneben. Ein Nenner, der Faktoren mitzaehlt, die es nicht gibt, waere
   eine stille Abwertung.
   ========================================================================= */

(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var Evidence = isNode ? require("./factor-evidence.js") : global.VUFactorEvidence;

  var VERSION = "plain-verdict-1.0.0";

  /* Kuechentisch-Saetze je Faktor. Beschreibend, nie auffordernd: das
     Produkt sagt, wie etwas ist, nicht was jemand tun soll. */
  var KLARTEXT = {
    quality:       { hoch: "Solide Bilanz, Gewinne gedeckt",       tief: "Schwächen bei Bilanz oder Gewinnqualität" },
    growth:        { hoch: "Wächst kräftig",                       tief: "Wächst kaum" },
    momentum:      { hoch: "Kurs läuft besser als der Markt",      tief: "Kurs läuft schlechter als der Markt" },
    value:         { hoch: "Günstig bewertet",                     tief: "Teuer bezahlt" },
    profitability: { hoch: "Verdient gut an jedem Euro Umsatz",    tief: "Verdient wenig an jedem Euro Umsatz" },
    revisions:     { hoch: "Fachleute heben ihre Erwartungen an",  tief: "Fachleute senken ihre Erwartungen" },
    risk:          { hoch: "Schwankt vergleichsweise wenig",       tief: "Schwankt stark" }
  };

  /* Die Stufen. Fuenf, grob, ohne Nachkommastelle - und jede mit dem
     Satz, der sie traegt. Die Reihenfolge ist die Pruefreihenfolge. */
  var STUFEN = [
    { id: "KEINE_DATEN",         text: "Zu wenig Daten für ein Urteil",   ton: "unbekannt" },
    { id: "UEBERWIEGEND_STARK",  text: "Überwiegend stark",               ton: "gut" },
    { id: "MEHR_STAERKEN",       text: "Mehr Stärken als Schwächen",      ton: "gut" },
    { id: "GEMISCHT",            text: "Gemischtes Bild",                 ton: "neutral" },
    { id: "MEHR_SCHWAECHEN",     text: "Mehr Schwächen als Stärken",      ton: "schwach" },
    { id: "UEBERWIEGEND_SCHWACH",text: "Überwiegend schwach",             ton: "schwach" }
  ];
  var STUFE = {};
  STUFEN.forEach(function (s) { STUFE[s.id] = s; });

  function bewertet(faktor) {
    return faktor && faktor.state === "AVAILABLE" && typeof faktor.score === "number" && isFinite(faktor.score);
  }

  /**
   * Die Klartext-Stufe fuer einen Titel.
   *
   * @param {object} record Faktor-Datensatz, wie ihn factor-evidence liefert
   * @returns {{version:string, stufe:string, stufeId:string, ton:string,
   *            zaehlsatz:string, stark:number, schwach:number, mittel:number,
   *            bewertet:number, gesamt:number, luecke:number, luecketext:string,
   *            gruende:Array<{art:string,text:string,factorId:string,band:string}>}}
   */
  function urteil(record) {
    /* ZWEI FORMEN DESSELBEN DINGES.
       Die Engine-Seite reicht den Rohdatensatz herein (factors als
       Objekt), die Produktschnittstelle gibt ihn bereits sortiert als
       Array heraus (getFactorEvidence -> factors: ordered(record)).
       Wer nur die erste Form annimmt, liefert auf der Aktienseite
       stumm "keine Daten" - und das waere kein Fehler, den man sieht,
       sondern einer, der wie eine Aussage aussieht. */
    var alle;
    if (Array.isArray(record)) alle = record;
    else if (record && Array.isArray(record.factors)) alle = record.factors;
    else if (Evidence && typeof Evidence.ordered === "function") alle = Evidence.ordered(record);
    else alle = [];
    var stark = [], schwach = [], mittel = [], da = [];

    alle.forEach(function (f) {
      if (!bewertet(f)) return;
      da.push(f);
      if (Evidence.STRENGTH_BANDS.indexOf(f.band) >= 0) stark.push(f);
      else if (Evidence.WEAKNESS_BANDS.indexOf(f.band) >= 0) schwach.push(f);
      else mittel.push(f);
    });

    var luecke = alle.length - da.length;
    var stufe;
    if (!da.length) stufe = STUFE.KEINE_DATEN;
    /* "Ueberwiegend" verlangt eine Mehrheit UND doppeltes Uebergewicht.
       Drei Staerken bei drei Schwaechen sind kein klares Bild. */
    else if (stark.length >= 3 && stark.length >= 2 * schwach.length) stufe = STUFE.UEBERWIEGEND_STARK;
    else if (schwach.length >= 3 && schwach.length >= 2 * stark.length) stufe = STUFE.UEBERWIEGEND_SCHWACH;
    else if (stark.length > schwach.length) stufe = STUFE.MEHR_STAERKEN;
    else if (schwach.length > stark.length) stufe = STUFE.MEHR_SCHWAECHEN;
    else stufe = STUFE.GEMISCHT;

    /* DIE ZAEHLZEILE MUSS DIE STUFE TRAGEN, NICHT IHR WIDERSPRECHEN.
       Gemessen an AAME: die Stufe stand auf "ueberwiegend schwach", die
       Zeile darunter las "Stark in 1 von 6 geprueften Punkten" - beide
       Zahlen richtig, zusammen ein Raetsel. Die Zeile nennt deshalb die
       Seite, die das Urteil traegt, und im gemischten Fall beide. */
    var zaehlsatz;
    if (!da.length) zaehlsatz = "Kein Faktor dieses Titels erfüllt die Anforderungen der Methodik.";
    else if (stufe.ton === "gut") zaehlsatz = "Stark in " + stark.length + " von " + da.length + " geprüften Punkten";
    else if (stufe.ton === "schwach") zaehlsatz = "Schwach in " + schwach.length + " von " + da.length + " geprüften Punkten";
    else if (stark.length || schwach.length) zaehlsatz = stark.length + " stark, " + schwach.length + " schwach von " + da.length + " geprüften Punkten";
    else zaehlsatz = "Alle " + da.length + " geprüften Punkte liegen im Mittelfeld";

    /* Die Gruende: erst die staerkste Staerke, dann die klarste Schwaeche,
       dann weiter im Wechsel. Wer nur drei Zeilen liest, soll beide
       Seiten gesehen haben - eine Liste aus drei Staerken waere Werbung. */
    var s = stark.slice().sort(function (a, b) { return b.score - a.score; });
    var w = schwach.slice().sort(function (a, b) { return a.score - b.score; });
    var gruende = [], i = 0;
    while (gruende.length < 4 && (i < s.length || i < w.length)) {
      if (i < s.length) gruende.push(zeile(s[i], "plus"));
      if (gruende.length < 4 && i < w.length) gruende.push(zeile(w[i], "minus"));
      i++;
    }
    /* Sticht nichts heraus, ist das selbst die Aussage. */
    if (!gruende.length && da.length) {
      gruende.push({ art: "neutral", factorId: null, band: "NEUTRAL",
        text: "Nichts sticht heraus – alles liegt im Mittelfeld" });
    }

    return {
      version: VERSION,
      stufe: stufe.text, stufeId: stufe.id, ton: stufe.ton,
      zaehlsatz: zaehlsatz,
      stark: stark.length, schwach: schwach.length, mittel: mittel.length,
      bewertet: da.length, gesamt: alle.length,
      luecke: luecke,
      luecketext: luecke
        ? (luecke === 1 ? "Ein Punkt lässt sich nicht prüfen" : luecke + " Punkte lassen sich nicht prüfen")
        : "",
      gruende: gruende
    };
  }

  function zeile(faktor, art) {
    var k = KLARTEXT[faktor.id];
    var text = k ? (art === "plus" ? k.hoch : k.tief) : faktor.label;
    return { art: art, factorId: faktor.id, band: faktor.band, text: text };
  }

  var api = {
    VERSION: VERSION,
    STUFEN: STUFEN.map(function (s) { return Object.assign({}, s); }),
    KLARTEXT: JSON.parse(JSON.stringify(KLARTEXT)),
    urteil: urteil
  };

  if (isNode) module.exports = api;
  else global.VUPlainVerdict = api;
})(typeof window !== "undefined" ? window : globalThis);
