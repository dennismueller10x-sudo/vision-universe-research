/* =========================================================================
   DER TAKTGEBER — WER ENTSCHEIDET, WANN DER NAECHSTE ZYKLUS LAEUFT

   Am 21.09.2026 stand die Seite von 09:09 bis 10:13 New Yorker Zeit auf
   dem Stand vom Freitag. Nicht, weil ein Lauf scheiterte - es entstand
   ueber eine Stunde lang KEIN Lauf. GitHub legt Zeitplan-Ereignisse unter
   hoher Actions-Last nicht an; in derselben Zeit erzeugten andere
   Arbeitsstraenge des Repositories 100 Push-Laeufe in 92 Minuten.

   Der alte Entwurf brauchte 78 fehleranfaellige Ereignisse je Sitzung -
   eines alle fuenf Minuten. Jedes einzelne war eine Gelegenheit zu
   scheitern, und das Scheitern war unsichtbar: kein failed, kein
   cancelled, sondern gar nichts.

   Der Taktgeber dreht das um. EIN Lauf haelt den Takt fuer einen ganzen
   Block und entscheidet selbst, wann der naechste Zyklus faellig ist. Aus
   78 Gelegenheiten zu scheitern werden zwei.

   WARUM DIE REGEL HIER STEHT UND NICHT IM SKRIPT

   Eine Schleife in einer YAML-Datei ist nicht pruefbar. Was hier steht,
   ist eine reine Funktion: dieselbe Lage ergibt dieselbe Entscheidung,
   und ein Test kann jede Lage herstellen, ohne auf eine Boerse zu warten.

   WAS DER TAKTGEBER NICHT IST

   Er ist keine zweite Datenpipeline. Er holt nichts, rechnet nichts und
   kennt keine Kurse. Er sagt ausschliesslich: jetzt, spaeter, oder
   Schluss. Das Holen bleibt bei ingest-intraday.mjs, dem einzigen Weg,
   auf dem Intraday-Daten in dieses Repository kommen.
   ========================================================================= */
(function (global) {
  "use strict";

  /* Ein Lauf auf einem GitHub-Runner darf hoechstens sechs Stunden
     dauern. Ein Block endet frueher, damit der letzte Zyklus noch
     vollstaendig committen und pushen kann - ein Lauf, den die Plattform
     mitten im Push abschneidet, hinterlaesst einen halben Zustand. */
  var BLOCK_MAX_MS = 5 * 3600000 + 45 * 60000;   /* 5 h 45 min */

  /* Nach wie vielen Fehlversuchen in Folge der Block aufgibt. Ein
     Taktgeber, der im Fehlerfall weiterdreht, ist ein Trigger-Sturm mit
     Extraschritten: er fragt den Anbieter alle fuenf Minuten dasselbe und
     bekommt alle fuenf Minuten dieselbe Absage. */
  var MAX_FEHLER_IN_FOLGE = 3;

  function zahl(wert, ersatz) {
    return typeof wert === "number" && isFinite(wert) ? wert : ersatz;
  }

  /**
   * Der naechste Zeitpunkt auf dem Raster, nicht "jetzt plus fuenf".
   *
   * Der Unterschied ist nicht kosmetisch. Bei "jetzt plus fuenf" wandert
   * der Takt mit jeder Laufzeitschwankung: ein Zyklus, der 5:20 braucht,
   * verschiebt alle folgenden um zwanzig Sekunden, und nach einer Stunde
   * liegt der Takt irgendwo. Auf dem Raster bleibt er dort, wo ein Mensch
   * ihn erwartet - und die Bars des Anbieters liegen selbst auf einem
   * Fuenf-Minuten-Raster.
   */
  function naechsterTakt(jetztMs, intervalMs) {
    var i = zahl(intervalMs, 300000);
    if (i <= 0) return jetztMs;
    return Math.ceil((jetztMs + 1) / i) * i;
  }

  /**
   * @param {object} lage
   *   nowMs            jetzt
   *   marketState      "OPEN" | "PRE" | "AFTER" | "CLOSED" | ...
   *   blockStartMs     Beginn dieses Blocks
   *   blockMaxMs       Hoechstdauer des Blocks (Vorgabe: 5 h 45 min)
   *   nextOpenMs       naechste Eroeffnung, falls bekannt
   *   intervalMs       Zieltakt
   *   fehlerInFolge    Fehlversuche seit dem letzten Erfolg
   *   maxFehler        Grenze dafuer
   * @returns {{action: "tick"|"wait"|"stop", reason: string, waitMs?: number}}
   */
  function entscheide(lage) {
    var l = lage || {};
    var jetzt = zahl(l.nowMs, Date.now());
    var interval = zahl(l.intervalMs, 300000);
    var blockStart = zahl(l.blockStartMs, jetzt);
    var blockMax = zahl(l.blockMaxMs, BLOCK_MAX_MS);
    var blockEnde = blockStart + blockMax;
    var maxFehler = zahl(l.maxFehler, MAX_FEHLER_IN_FOLGE);
    var fehler = zahl(l.fehlerInFolge, 0);

    /* Zuerst die Abbruchgruende - ein Taktgeber, der im Fehlerfall
       weiterlaeuft, richtet mehr Schaden an als einer, der aufhoert. */
    if (fehler >= maxFehler) {
      return { action: "stop", reason: "zuVieleFehlerInFolge" };
    }

    /* Ein Zyklus braucht Zeit. Wer ihn beginnt, obwohl der Block vor
       seinem Ende ablaeuft, erzeugt einen abgeschnittenen Lauf. */
    if (jetzt + interval >= blockEnde) {
      return { action: "stop", reason: "blockEnde" };
    }

    if (l.marketState === "OPEN") {
      return { action: "tick", reason: "marktOffen" };
    }

    /* Vor der Eroeffnung warten, aber nur, wenn die Eroeffnung noch in
       diesen Block faellt. Sonst uebernimmt der naechste Block - oder der
       Waechter, wenn dessen Ereignis ebenfalls ausfaellt. */
    var naechsteOeffnung = typeof l.nextOpenMs === "number" ? l.nextOpenMs : null;
    if (naechsteOeffnung !== null && naechsteOeffnung > jetzt) {
      if (naechsteOeffnung + interval >= blockEnde) {
        return { action: "stop", reason: "eroeffnungNachBlockEnde" };
      }
      return { action: "wait", reason: "vorEroeffnung",
               waitMs: naechsteOeffnung - jetzt };
    }

    return { action: "stop", reason: "sitzungGeschlossen" };
  }

  /**
   * Wie lange nach einem Zyklus zu warten ist.
   *
   * Dauerte der Zyklus laenger als der Takt, ist der naechste Rasterpunkt
   * schon vorbei. Dann wird NICHT nachgeholt: zwei Zyklen hintereinander
   * fragen denselben Anbieter zweimal nach fast denselben Bars. Es wird
   * auf den naechsten freien Rasterpunkt gewartet - der Takt ist dann
   * ehrlich laenger, statt heimlich zu driften.
   */
  function wartezeit(fertigMs, intervalMs) {
    return Math.max(0, naechsterTakt(fertigMs, intervalMs) - fertigMs);
  }

  var API = {
    BLOCK_MAX_MS: BLOCK_MAX_MS,
    MAX_FEHLER_IN_FOLGE: MAX_FEHLER_IN_FOLGE,
    naechsterTakt: naechsterTakt,
    entscheide: entscheide,
    wartezeit: wartezeit
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (global) { global.VURealtime = global.VURealtime || {}; global.VURealtime.Pacemaker = API; }
})(typeof globalThis !== "undefined" ? globalThis : this);
