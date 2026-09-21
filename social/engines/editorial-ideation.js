/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/editorial-ideation.js

   DIE LETZTE LEITERSTUFE: EINE FRAGE, KEINE FUNDSTELLE

   -------------------------------------------------------------------------
   WARUM ES DIESE STUFE GIBT
   -------------------------------------------------------------------------

   Ein leerer Content-Tag wurde bisher am Ende mit "keine Familie trug
   ein Thema" begruendet. Das ist ein Satz ueber das ANGEBOT - und das
   Angebot von Vision Universe ist fuenfzehn Familien breit. Wenn ein
   Haus mit fuenfzehn Familien sagt, ihm falle nichts ein, hat nicht
   das Angebot aufgehoert, sondern die Suche.

   Diese Stufe macht diesen Satz unaussprechbar. Sie hat IMMER eine
   Frage. Sie hat sie unabhaengig von Kursen, Nachrichten, Quartals-
   zahlen und Stimmung, weil eine redaktionelle Frage nicht von einem
   Marktereignis abhaengt.

   -------------------------------------------------------------------------
   WAS SIE AUSDRUECKLICH NICHT TUT - UND WARUM SIE ES NICHT KANN
   -------------------------------------------------------------------------

   Sie erfindet kein Ereignis, keine Zahl und keine Aussage ueber ein
   Unternehmen. Das ist hier keine Selbstverpflichtung, sondern eine
   Eigenschaft der Bauform:

     * Der Katalog unten ist eine FESTE Liste in dieser Datei. Jede
       zurueckgegebene Frage ist zeichengleich mit ihrem Katalog-
       eintrag - es gibt keine Platzhalter, keine Einsetzung, keine
       Textbildung aus Eingaben.

     * `ideen()` nimmt keinen Kanal entgegen, durch den eine Tatsache
       hereinkaeme. Sie erfaehrt, was schon abgedeckt ist und was
       ausgeschlossen wurde - mehr nicht. Was sie nie bekommt, kann
       sie nicht weitergeben.

   Eine Behauptung, die man nicht aufstellen kann, braucht keinen
   Waechter, der sie verbietet. Ein Test misst das, statt es zu
   glauben: eine Eingabe voller erfundener Tatsachen darf in der
   Antwort nicht vorkommen.

   -------------------------------------------------------------------------
   EINE IDEE IST KEIN KANDIDAT
   -------------------------------------------------------------------------

   Jede Idee traegt `zustand: "IDEE_UNBELEGT"`. Sie ist der ANFANG
   einer Recherche, nicht ihr Ergebnis. Der Weg zur Veroeffentlichung
   fuehrt unveraendert ueber Evidenz, Claim Binding, Qualitaetstore und
   Owner-Freigabe - diese Datei verkuerzt ihn um keinen Schritt.

   Deshalb legt die Leiter Ideen NIE unter `gefunden` ab. Sie zaehlt
   sie getrennt und vermerkt sie als IDEAS_WITHOUT_EVIDENCE. Der
   ehrliche leere Tag heisst danach "es gab Fragen, keine war heute
   belegt" - und nicht mehr "es gab nichts".

   Reichliches Angebot senkt keine Schwelle. Es verschiebt nur, was
   ein leerer Tag ueber sich sagen darf.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;

  /* -------------------------------------------------------------------
     DER KATALOG

     Zwanzig redaktionelle Zugaenge. Jeder ist eine FRAGE, kein Befund.
     Jeder landet in einer Familie, die es schon gibt - hier entsteht
     keine zweite Taxonomie neben dem Content Universe.

     `belegBedarf` sagt, was eine Antwort tragen muesste. Es ist die
     Rechnung, die mit der Frage mitgeliefert wird, damit niemand sie
     spaeter fuer bezahlt haelt.
     ------------------------------------------------------------------- */
  var KATALOG = [
    { id: "BEGRIFF_ERKLAEREN", familie: "EDUCATION",
      frage: "Welcher Fachbegriff aus unserer eigenen Berichterstattung " +
        "wird von Einsteigern regelmaessig falsch verstanden?",
      belegBedarf: "Eine nachpruefbare Definition und mindestens ein reales " +
        "Beispiel aus belegten Daten." },
    { id: "KENNZAHL_EINORDNEN", familie: "EDUCATION",
      frage: "Welche Kennzahl wird haeufiger zitiert als verstanden, und " +
        "was misst sie wirklich?",
      belegBedarf: "Die Formel der Kennzahl und belegte Werte, an denen sich " +
        "ihre Grenzen zeigen." },
    { id: "MYTHOS_PRUEFEN", familie: "EDUCATION",
      frage: "Welche verbreitete Annahme ueber Geldanlage haelt einer " +
        "Ueberpruefung an den Daten nicht stand?",
      belegBedarf: "Die Annahme in ihrer verbreiteten Form und eine Messung, " +
        "die ihr widerspricht." },
    { id: "TYPISCHER_FEHLER", familie: "EDUCATION",
      frage: "Welcher Fehler kostet Privatanleger unbemerkt am meisten?",
      belegBedarf: "Eine belegte Groessenordnung des Schadens, keine " +
        "geschaetzte." },
    { id: "EINSTEIGERFRAGE", familie: "EDUCATION",
      frage: "Welche Frage stellt sich jeder am Anfang und traut sich " +
        "niemand laut zu stellen?",
      belegBedarf: "Eine Antwort, die ohne Empfehlung auskommt und auf " +
        "belegte Mechanik zurueckgeht." },

    { id: "ZWEI_WEGE_VERGLEICHEN", familie: "COMPARISON",
      frage: "Welche zwei gaengigen Wege zum selben Ziel unterscheiden sich " +
        "staerker, als die meisten annehmen?",
      belegBedarf: "Fuer beide Wege belegte Kosten, Risiken und Ergebnisse " +
        "ueber denselben Zeitraum." },
    { id: "RANGLISTE_NACH_KRITERIUM", familie: "RANKING",
      frage: "Welches Kriterium ergibt eine Rangliste, die niemand erwartet " +
        "haette?",
      belegBedarf: "Eine vollstaendige, belegte Datenreihe fuer alle " +
        "gelisteten Werte - keine Auswahl nach Ergebnis." },

    { id: "HISTORISCHER_VERGLEICH", familie: "DATA_STORY",
      frage: "Welche heutige Lage hatte schon einmal eine Entsprechung, und " +
        "worin unterscheidet sie sich davon?",
      belegBedarf: "Belegte historische Daten und die benannten Unterschiede " +
        "- Aehnlichkeit ist kein Beleg." },
    { id: "ZAHL_IM_KONTEXT", familie: "DATA_STORY",
      frage: "Welche viel zitierte Zahl aendert ihre Bedeutung vollstaendig, " +
        "sobald man sie in Beziehung setzt?",
      belegBedarf: "Die Zahl und die Bezugsgroesse, beide aus belegten " +
        "Quellen." },

    { id: "GESCHAEFTSMODELL_ZERLEGEN", familie: "REPORT_STORY",
      frage: "Womit verdient ein bekanntes Unternehmen tatsaechlich sein " +
        "Geld - und womit nicht?",
      belegBedarf: "Segmentzahlen aus einem Geschaeftsbericht, nicht aus " +
        "der Wahrnehmung." },

    { id: "BRANCHENKARTE", familie: "MARKET_EXPLAINER",
      frage: "Wie haengen die Teile einer Branche zusammen, ueber die alle " +
        "einzeln reden?",
      belegBedarf: "Belegte Lieferbeziehungen oder Umsatzanteile zwischen " +
        "den Teilen." },
    { id: "MARKTMECHANIK", familie: "MARKET_EXPLAINER",
      frage: "Welcher Mechanismus hinter den Kursen wird oeffentlich fast " +
        "nie erklaert?",
      belegBedarf: "Eine nachvollziehbare Beschreibung des Mechanismus und " +
        "ein belegter Fall, an dem er sichtbar wurde." },
    { id: "WIDERSPRUCH_AUFLOESEN", familie: "MARKET_EXPLAINER",
      frage: "Welche zwei zutreffenden Aussagen ueber den Markt scheinen " +
        "sich zu widersprechen?",
      belegBedarf: "Belege fuer beide Aussagen und die Bedingung, unter der " +
        "sich der Widerspruch aufloest." },

    { id: "MEGATREND_ETAPPE", familie: "MEGATREND",
      frage: "An welcher Stelle ihrer Entwicklung steht eine viel " +
        "besprochene Veraenderung wirklich?",
      belegBedarf: "Messbare Groessen zur Verbreitung, nicht Ankuendigungen." },
    { id: "TECHNOLOGIE_REIFEGRAD", familie: "MEGATREND",
      frage: "Welche Technologie gilt als kurz vor dem Durchbruch und ist es " +
        "nach den Zahlen nicht?",
      belegBedarf: "Belegte Stueckzahlen, Kosten oder Kapazitaeten ueber " +
        "mehrere Perioden." },

    { id: "RISIKO_BENENNEN", familie: "EVERGREEN",
      frage: "Welches Risiko wird routinemaessig unterschaetzt, weil es " +
        "selten eintritt?",
      belegBedarf: "Eine belegte Haeufigkeit und eine belegte Schadenshoehe." },
    { id: "ANLEGERPSYCHOLOGIE", familie: "EVERGREEN",
      frage: "Welches Verhaltensmuster kostet in ruhigen Phasen nichts und " +
        "in unruhigen alles?",
      belegBedarf: "Belegte Daten zu tatsaechlichem Verhalten, keine " +
        "Anekdote." },

    { id: "KOSTEN_UND_GEBUEHREN", familie: "ETF_PRODUCT",
      frage: "Welche Kosten fallen an, ohne dass sie als Kosten auftreten?",
      belegBedarf: "Belegte Gebuehren- oder Spreadangaben aus " +
        "Produktunterlagen." },
    { id: "PORTFOLIO_BAUSTEIN", familie: "ETF_PRODUCT",
      frage: "Welche Rolle soll ein bestimmter Baustein im Portfolio " +
        "erfuellen, und erfuellt er sie?",
      belegBedarf: "Belegte Korrelations- oder Wertentwicklungsdaten ueber " +
        "einen benannten Zeitraum." },
    { id: "AUSSCHUETTUNG_VERSTEHEN", familie: "DIVIDEND",
      frage: "Woher kommt eine Ausschuettung, und was sagt ihre Hoehe " +
        "nicht aus?",
      belegBedarf: "Belegte Ausschuettungs- und Ergebniszahlen desselben " +
        "Zeitraums." }
  ];

  /* Der Zustand, den jede Idee traegt. Er steht als Konstante und
     nicht als Zeichenkette an zwanzig Stellen, damit ein Aufrufer ihn
     pruefen kann, ohne ihn abzuschreiben. */
  var ZUSTAND_UNBELEGT = "IDEE_UNBELEGT";

  /* Der Ablehnungsgrund, den die Leiter fuer diese Stufe vermerkt.
     Er heisst nicht "kein Thema": es gab Themen, sie waren nur noch
     nicht belegt. Der Unterschied ist der ganze Punkt dieser Datei. */
  var ABLEHNUNG_UNBELEGT = "IDEAS_WITHOUT_EVIDENCE";

  /* Die Kennung, unter der eine Idee im Abdeckungsgedaechtnis steht.
     Mit Praefix, damit sie nie mit einem realen Thema verwechselt
     wird. */
  function themenId(kategorieId) {
    return "ideation:" + String(kategorieId);
  }

  function liste(v) { return Array.isArray(v) ? v : []; }

  /* -------------------------------------------------------------------
     DIE REIHENFOLGE DREHT SICH, DIE MENGE BLEIBT

     Ohne Drehung fuehrt jeden Tag dieselbe Frage die Liste an, und die
     hinteren kaemen nie dran. Die Drehung ist deterministisch aus dem
     Kalendertag - derselbe Tag ergibt dieselbe Reihenfolge, damit ein
     Lauf reproduzierbar bleibt.

     Sie laesst KEINE Kategorie weg. Wer eine Auswahl braucht, nimmt
     die ersten n und weiss dann, dass er ausgewaehlt hat.
     ------------------------------------------------------------------- */
  function versatz(now) {
    var s = String(now || "");
    if (s.length < 10) return 0;
    var summe = 0;
    for (var i = 0; i < 10; i += 1) summe += s.charCodeAt(i);
    return summe % KATALOG.length;
  }

  /**
   * Die redaktionellen Fragen dieser Stufe.
   *
   * @param eingabe {
   *   now                       ISO-Zeitpunkt, nur fuer die Reihenfolge
   *   abgedeckt                 [topicId] was das Gedaechtnis schon kennt
   *   ausgeschlosseneFamilien   [family] was der Aufrufer gesperrt hat
   * }
   *
   * Mehr Felder liest diese Funktion NICHT. Das ist der Grund, warum
   * sie nichts erfinden kann.
   */
  function ideen(eingabe) {
    var e = eingabe || {};
    var abgedeckt = liste(e.abgedeckt).map(String);
    var gesperrt = liste(e.ausgeschlosseneFamilien).map(String);

    var v = versatz(e.now);
    var gedreht = KATALOG.slice(v).concat(KATALOG.slice(0, v));

    var offen = [];
    var unterdrueckt = [];

    gedreht.forEach(function (k) {
      var id = themenId(k.id);
      if (abgedeckt.indexOf(id) !== -1) {
        unterdrueckt.push({ kategorie: k.id, grund: "ALREADY_COVERED" });
        return;
      }
      if (gesperrt.indexOf(k.familie) !== -1) {
        unterdrueckt.push({ kategorie: k.id, grund: "EXCLUDED_BY_CALLER" });
        return;
      }
      offen.push({
        kategorie: k.id,
        /* Zeichengleich mit dem Katalog. Keine Einsetzung, kein
           Zusammenbauen, keine Uebernahme aus der Eingabe. */
        frage: k.frage,
        familie: k.familie,
        belegBedarf: k.belegBedarf,
        topicId: id,
        zustand: ZUSTAND_UNBELEGT
      });
    });

    return {
      ideen: offen,
      anzahl: offen.length,
      kategorienGesamt: KATALOG.length,
      unterdrueckt: unterdrueckt,
      /* Der Satz, der den leeren Tag neu benennt. */
      erklaerung: offen.length
        ? offen.length + " redaktionelle Frage" + (offen.length === 1 ? "" : "n") +
          " stehen offen. Keine davon ist ein Beitrag: jede braucht zuerst " +
          "Evidenz. Ein leerer Tag heisst hier 'noch nicht belegt', nicht " +
          "'nichts da'."
        : "Alle " + KATALOG.length + " redaktionellen Zugaenge sind heute " +
          "abgedeckt oder ausgeschlossen. Das ist eine Aussage ueber die " +
          "Abdeckung, nicht ueber das Angebot."
    };
  }

  var api = {
    KATALOG: KATALOG,
    ZUSTAND_UNBELEGT: ZUSTAND_UNBELEGT,
    ABLEHNUNG_UNBELEGT: ABLEHNUNG_UNBELEGT,
    themenId: themenId,
    ideen: ideen
  };

  if (isNode) module.exports = api;
  else global.VUSocialEditorialIdeation = api;
})(typeof window !== "undefined" ? window : globalThis);
