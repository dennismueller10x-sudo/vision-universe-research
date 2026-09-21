/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/evidence-shape.js

   WELCHE GESTALT DIE BELEGE HABEN

   -------------------------------------------------------------------------
   WARUM DAS EINE EIGENE DATEI IST
   -------------------------------------------------------------------------

   Zwei Stellen stellen dieselbe Frage an dieselben Belege:

     hook.js   Traegt die Evidenz einen KONTRAST - zwei Groessen, die
               man gegeneinanderstellen kann?
     visual    Traegt sie einen VERGLEICH - mehrere Werte auf einer
               Achse, die sich als Balken nebeneinander zeichnen
               lassen?

   Das ist eine Frage, nicht zwei. Sie stand bisher einmal, inline in
   `hook.ableiten()`, und die Bildseite kannte sie gar nicht - weshalb
   eine Evidenz mit zwei Werten auf einer Achse als Datenkarte mit
   EINER Zahl endete.

   Ein zweites Mal ausgeschrieben waeren es zwei Antworten, die
   auseinanderlaufen. Also steht sie hier, und beide fragen hier.

   -------------------------------------------------------------------------
   EINE ACHSE HEISST: DIESELBE KENNZAHL
   -------------------------------------------------------------------------

   13,4 und 21,6 sind vergleichbar, weil beide ein KGV sind. 13,4 und
   184,20 sind es nicht, auch wenn beide Zahlen sind. Genau diese
   Unterscheidung verbietet visual-composition.js an der Grafik
   ("ungleiche Achsen machen aus einem Vergleich eine Behauptung") -
   und sie muss schon gelten, BEVOR gezeichnet wird.

   -------------------------------------------------------------------------
   JEDER WERT TRAEGT SEINE EIGENE ENTITAET
   -------------------------------------------------------------------------

   Das ist der Kern. Ein Vergleich besteht aus Paaren: dieser Wert
   gehoert zu diesem Gegenstand. Wer die Werte ohne ihre Gegenstaende
   weiterreicht, kann sie spaeter nur noch raten - und der Versuch,
   eine zweite Zahl in eine Karte zu setzen, die nur EINEN Namen
   zeigt, haette den S&P-Wert unter dem Namen Russell 2000 gezeigt.

   Deshalb gibt diese Datei niemals eine nackte Zahlenliste zurueck,
   sondern immer Paare.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  function zahl(x) {
    if (typeof x === "number" && isFinite(x)) return x;
    if (typeof x !== "string") return null;
    var n = parseFloat(x.replace(/\s/g, "").replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function text(v) { return String(v === null || v === undefined ? "" : v); }
  function gefuellt(v) { return text(v).trim() !== ""; }

  /* Ein Vergleich braucht mindestens zwei Gegenstaende. Die Zahl steht
     in visual-composition.js als MINDEST.vergleichswerte und gilt dort
     fuer die Zeichnung; hier gilt dieselbe Untergrenze fuer die Frage,
     ob es ueberhaupt einen Vergleich gibt. Sie hier zu unterbieten
     hiesse, etwas einen Vergleich zu nennen, das die Grafik danach
     ablehnt. */
  var MINDEST_GEGENSTAENDE = 2;

  /**
   * Liegen mehrere Belege auf EINER Achse?
   *
   * @param facts  wie die Research-Stufe sie liefert:
   *               [{ metric, value, unit, entity, source }]
   * @returns { metrik, einheit, werte: [{ entitaet, wert, quelle }] }
   *          oder null. `werte` traegt immer Paare - nie nackte Zahlen.
   */
  function aufEinerAchse(facts) {
    var liste = Array.isArray(facts) ? facts : [];

    /* Nach Kennzahl gruppieren. Die Reihenfolge der ersten Nennung
       bleibt erhalten: die Evidenz hat eine Reihenfolge, und sie ist
       nicht zufaellig. */
    var achsen = [];
    var nachMetrik = Object.create(null);

    liste.forEach(function (f) {
      if (!f) return;
      var wert = zahl(f.value);
      if (wert === null) return;
      if (!gefuellt(f.metric) || !gefuellt(f.entity)) return;
      var schluessel = text(f.metric).trim();
      if (!nachMetrik[schluessel]) {
        nachMetrik[schluessel] = {
          metrik: schluessel,
          einheit: gefuellt(f.unit) ? text(f.unit).trim() : "",
          werte: []
        };
        achsen.push(nachMetrik[schluessel]);
      }
      var achse = nachMetrik[schluessel];
      /* Derselbe Gegenstand zweimal ist kein Vergleich, sondern eine
         Wiederholung - und die erste Nennung gilt. */
      var schon = achse.werte.some(function (w) {
        return w.entitaet.toLowerCase() === text(f.entity).trim().toLowerCase();
      });
      if (schon) return;
      achse.werte.push({
        entitaet: text(f.entity).trim(),
        wert: wert,
        /* Die Anzeige in der Schreibweise der Quelle, wenn sie eine
           hat - "184,20" ist nicht "184,2". */
        anzeige: typeof f.value === "string" ? f.value.trim() : null,
        quelle: f.source || null
      });
    });

    var traegt = achsen.filter(function (a) {
      return a.werte.length >= MINDEST_GEGENSTAENDE;
    });
    if (!traegt.length) return null;

    /* Die Achse mit den meisten Gegenstaenden; bei Gleichstand die
       zuerst genannte. Nicht die "beste" - diese Datei bewertet
       nicht, sie stellt fest. */
    return traegt.reduce(function (a, b) {
      return b.werte.length > a.werte.length ? b : a;
    });
  }

  /**
   * Dieselbe Achse in der Form, die visual-composition.comparison()
   * erwartet: peers mit `label` und `value`.
   *
   * `hervorheben` nennt den Gegenstand, um den es im Beitrag geht -
   * er bekommt die Signalfarbe. Steht er nicht in der Reihe, wird
   * NICHTS hervorgehoben; einen falschen Balken zu faerben waere
   * schlimmer als keinen.
   */
  function alsPeers(achse, hervorheben) {
    if (!achse || !Array.isArray(achse.werte)) return null;
    var ziel = gefuellt(hervorheben) ? text(hervorheben).trim().toLowerCase() : null;
    return achse.werte.map(function (w) {
      return {
        label: w.entitaet,
        value: w.wert,
        /* Die Schreibweise der Quelle reist mit. Ohne sie muesste die
           Zeichnung die Stellen raten - und sie hat geraten: aus 21,6
           und 13,4 wurden auf dem fertigen Bild "22" und "13". Eine
           gerundete Zahl ist eine andere Zahl, und unter einem
           Gegenstand steht sie als dessen Wert. */
        anzeige: w.anzeige !== null && w.anzeige !== undefined ? w.anzeige : null,
        highlight: ziel !== null && w.entitaet.toLowerCase() === ziel
      };
    });
  }

  /**
   * Dieselbe Achse in der Form, die hook.js fuer KONTRAST braucht.
   * Genau zwei Gegenstaende - der Satz stellt zwei gegeneinander, und
   * drei waeren eine Aufzaehlung.
   */
  function alsKontrast(achse) {
    if (!achse || achse.werte.length < 2) return null;
    var a = achse.werte[0], b = achse.werte[1];
    return {
      eines: a.entitaet, wertEines: a.anzeige !== null ? a.anzeige : a.wert,
      anderes: b.entitaet, wertAnderes: b.anzeige !== null ? b.anzeige : b.wert,
      einheit: achse.einheit || achse.metrik,
      belege: [a.quelle, b.quelle].filter(Boolean)
    };
  }

  var api = {
    MINDEST_GEGENSTAENDE: MINDEST_GEGENSTAENDE,
    aufEinerAchse: aufEinerAchse,
    alsPeers: alsPeers,
    alsKontrast: alsKontrast
  };

  if (isNode) module.exports = api;
  else global.VUSocialEvidenceShape = api;
})(typeof window !== "undefined" ? window : globalThis);
