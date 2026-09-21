/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/manual-mode.js

   DREI KNOEPFE, DIE NICHT DASSELBE TUN (§28, §29, §30, §51)

   -------------------------------------------------------------------------
   WAS ES HEUTE GIBT UND WAS FEHLT
   -------------------------------------------------------------------------

   Das System kennt genau einen manuellen Anstoss: JETZT PRUEFEN. Er
   ueberspringt die Uhr und laesst den Orchestrator sagen, was dran
   waere. §28 sagt ausdruecklich, dass das KEIN Produktionsauftrag ist -
   und genau deshalb fehlen zwei:

     JETZT POST ERSTELLEN (§29)  Ein Auftrag. Es soll ein Beitrag
                                 entstehen, jetzt, durch alle Tore.
     POST ZU THEMA (§30)         Derselbe Auftrag, aber der Owner
                                 nennt das Thema.

   -------------------------------------------------------------------------
   WAS EIN AUFTRAG AUFHEBEN DARF UND WAS NIEMALS
   -------------------------------------------------------------------------

   Das ist die ganze Frage, und sie hat eine klare Antwort: ein
   manueller Auftrag hebt die UHR auf, nie ein Tor.

   Der Owner darf seinen eigenen Rhythmus ueberstimmen - die
   Tagesobergrenze und den Mindestabstand hat er selbst gesetzt. Er
   darf NICHT die Obergrenze von einem Creative Job aufheben (§3,
   harte Invariante), keine Qualitaetsschwelle senken (§4), keinen
   Haltezustand nebenbei aufloesen und keine unbekannte Lage in eine
   erlaubte verwandeln.

   -------------------------------------------------------------------------
   WARUM DAFUER EINE EIGENE TABELLE STEHT
   -------------------------------------------------------------------------

   content-cadence.js klassifiziert seine Gruende bereits - nach
   PUBLISHING_CAPACITY, CONTENT_QUALITY, CONTENT_SUPPLY. Diese
   Einteilung beantwortet aber eine ANDERE Frage: welche Art von
   Knappheit vorliegt.

   DAILY_CONTENT_CAP_REACHED und CREATIVE_JOB_IN_FLIGHT stehen dort
   beide unter PUBLISHING_CAPACITY, und nur der erste darf von einem
   Auftrag ueberstimmt werden. Die vorhandene Einteilung
   weiterzubenutzen waere ein Tor an der falschen Grenze - und dann
   haette "JETZT POST ERSTELLEN" die harte Invariante aus §3
   aufgehoben, ohne dass es jemand beschlossen haette.

   Deshalb eine zweite, ausdrueckliche Tabelle mit genau einer Frage:
   darf ein Owner-Auftrag diesen Grund aufheben?

   -------------------------------------------------------------------------
   WAS SICH NICHT AENDERT
   -------------------------------------------------------------------------

   OWNER_PUBLISHING_GATE bleibt true. Ein manueller Auftrag erzeugt
   einen Kandidaten und veroeffentlicht nichts. Der Weg endet wie
   jeder andere vor der Freigabe des Owners.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Kadenz = isNode ? require("./content-cadence.js")
    : global.VUSocialContentCadence;
  var Untrusted = isNode ? require("./untrusted.js") : global.VUSocialUntrusted;

  var MODI = {
    /* §28 - der Knopf, den es gibt. */
    JETZT_PRUEFEN: {
      id: "JETZT_PRUEFEN",
      label: "JETZT PRUEFEN",
      zweck: "Sagen, was dran waere. Ueberspringt die Uhr des Zeitplans, " +
        "erzeugt aber nichts.",
      istProduktionsauftrag: false,
      hebtUhrAuf: false,
      brauchtThema: false
    },
    /* §29 */
    MANUAL_NOW: {
      id: "MANUAL_NOW",
      label: "JETZT POST ERSTELLEN",
      zweck: "Ein Auftrag: es soll jetzt ein Beitrag entstehen. Durch " +
        "dieselben Tore, bis zur Freigabe.",
      istProduktionsauftrag: true,
      hebtUhrAuf: true,
      brauchtThema: false
    },
    /* §30 */
    MANUAL_TOPIC: {
      id: "MANUAL_TOPIC",
      label: "POST ZU THEMA",
      zweck: "Derselbe Auftrag, aber der Owner nennt das Thema statt der " +
        "Gelegenheitsbewertung.",
      istProduktionsauftrag: true,
      hebtUhrAuf: true,
      brauchtThema: true
    }
  };

  var MODUS_IDS = Object.keys(MODI);

  /* -------------------------------------------------------------------
     DIE EINE FRAGE: DARF EIN AUFTRAG DAS AUFHEBEN?

     Jeder Grund steht hier, und jeder mit einer Begruendung. Ein
     Grund, der hier FEHLT, gilt als nicht aufhebbar - Unbekanntes ist
     kein Freibrief.
     ------------------------------------------------------------------- */
  var AUFHEBBAR = {
    DAILY_CONTENT_CAP_REACHED: {
      aufhebbar: true,
      warum: "Die Tagesobergrenze ist der Rhythmus des Owners. Wer sie " +
        "gesetzt hat, darf sie einmal ueberstimmen."
    },
    MINIMUM_SPACING_NOT_REACHED: {
      aufhebbar: true,
      warum: "Der Mindestabstand ist dieselbe Uhr, nur feiner."
    },
    ACTIVE_APPROVAL_QUEUE_NOT_EMPTY: {
      aufhebbar: true,
      warum: "Die Warteschlange schuetzt den Owner vor einem Stapel. Wer " +
        "ausdruecklich einen weiteren Beitrag bestellt, nimmt den Stapel " +
        "in Kauf - und es ist sein eigener."
    },
    CREATIVE_JOB_IN_FLIGHT: {
      aufhebbar: false,
      warum: "MAX_OPEN_CREATIVE_JOBS = 1 ist eine harte Invariante (§3). " +
        "Sie gilt systemweit und kennt keinen Knopf."
    },
    CREATIVE_JOB_COUNT_UNKNOWN: {
      aufhebbar: false,
      warum: "Eine unbekannte Lage wird nicht durch einen Auftrag zu einer " +
        "erlaubten. Genau dann waere die Obergrenze aufgehoben, wenn " +
        "niemand nachzaehlen kann."
    },
    OWNER_HELD_STATE: {
      aufhebbar: false,
      warum: "Ein Haltezustand ist eine eigene Entscheidung. Ihn nebenbei " +
        "aufzuloesen, weil jemand einen anderen Knopf drueckt, waere kein " +
        "Halt gewesen."
    },
    OPERATIONAL_BLOCKER: {
      aufhebbar: false,
      warum: "Ein Betriebsproblem verschwindet nicht dadurch, dass man " +
        "trotzdem loslaeuft."
    },
    NO_OPPORTUNITY_PASSED_QUALITY: {
      aufhebbar: false,
      warum: "Qualitaetsschwellen werden nicht gesenkt (§4). Ein Auftrag " +
        "beschleunigt die Arbeit, er ersetzt sie nicht."
    },
    INSUFFICIENT_EVIDENCE: {
      aufhebbar: false,
      warum: "Ohne Beleg entsteht kein Beitrag. Das gilt auf Knopfdruck " +
        "genauso."
    },
    CONTENT_REPETITION: { aufhebbar: false,
      warum: "Eine Wiederholung wird durch Eile nicht neu." },
    PORTFOLIO_SATURATION: { aufhebbar: false,
      warum: "Ein saturiertes Portfolio ist ein inhaltlicher Befund." },
    NO_TOPIC_IN_ANY_FAMILY: { aufhebbar: false,
      warum: "Wenn keine Familie ein Thema traegt, fehlt der Gegenstand - " +
        "und einen Gegenstand erfindet kein Knopf." }
  };

  /* Die harten Invarianten aus §3, ausgeschrieben. Sie stehen hier, um
     eine Behauptung pruefbar zu machen: KEINE von ihnen darf in der
     Liste der aufhebbaren Gruende auftauchen. */
  var NIEMALS_AUFHEBBAR = [
    "CREATIVE_JOB_IN_FLIGHT",
    "CREATIVE_JOB_COUNT_UNKNOWN",
    "OWNER_HELD_STATE",
    "OPERATIONAL_BLOCKER",
    "NO_OPPORTUNITY_PASSED_QUALITY",
    "INSUFFICIENT_EVIDENCE",
    "CONTENT_REPETITION",
    "PORTFOLIO_SATURATION",
    "NO_TOPIC_IN_ANY_FAMILY"
  ];

  function text(v) { return String(v === null || v === undefined ? "" : v); }
  function gefuellt(v) { return !!text(v).trim(); }

  function istAufhebbar(grund) {
    if (!grund) return false;
    /* Ein Grund, den diese Tabelle nicht kennt, ist NICHT aufhebbar.
       Unbekanntes als Erlaubnis zu lesen ist die Fehlerfamilie, die in
       diesem Projekt schon mehrfach zugeschlagen hat. */
    var e = AUFHEBBAR[grund];
    return !!(e && e.aufhebbar === true);
  }

  /**
   * Was ein Auftrag mit einer Kadenzentscheidung macht.
   *
   * Er hebt die Uhr auf und sonst nichts. `befund` ist genau das, was
   * content-cadence.entscheide() zurueckgibt - diese Engine rechnet
   * die Kadenz NICHT nach, sie liest ihr Urteil.
   */
  function anwenden(modusId, befund) {
    var m = MODI[modusId];
    var b = befund || {};

    if (!m) {
      return { darfErzeugen: false, modus: null, aufgehoben: null,
        grund: "UNBEKANNTER_MODUS",
        erklaerung: "'" + text(modusId) + "' ist keiner der drei Modi (" +
          MODUS_IDS.join(", ") + ")." };
    }

    /* JETZT PRUEFEN erzeugt nie etwas - unabhaengig davon, was die
       Kadenz sagt. §28 ist da eindeutig. */
    if (!m.istProduktionsauftrag) {
      return { darfErzeugen: false, modus: m.id, aufgehoben: null,
        grund: b.grund || null,
        erklaerung: m.label + " ist kein Produktionsauftrag (§28). Der Lauf " +
          "sagt, was dran waere: " + (b.erklaerung || "keine Lage uebergeben.") };
    }

    if (b.darfErzeugen === true) {
      return { darfErzeugen: true, modus: m.id, aufgehoben: null, grund: null,
        erklaerung: m.label + ": die Uhr stand ohnehin nicht im Weg." };
    }

    if (istAufhebbar(b.grund)) {
      return { darfErzeugen: true, modus: m.id, aufgehoben: b.grund,
        grund: null,
        erklaerung: m.label + " hebt " + b.grund + " auf: " +
          AUFHEBBAR[b.grund].warum + " Alle Qualitaetstore gelten " +
          "unveraendert, und der Beitrag endet vor der Freigabe." };
    }

    return { darfErzeugen: false, modus: m.id, aufgehoben: null,
      grund: b.grund || "UNBEKANNT",
      erklaerung: m.label + " hebt " + (b.grund || "diesen Grund") + " NICHT " +
        "auf: " + (AUFHEBBAR[b.grund] ? AUFHEBBAR[b.grund].warum
          : "dieser Grund steht nicht in der Liste der aufhebbaren - und was " +
            "nicht darin steht, bleibt stehen.") };
  }

  /**
   * Einen Auftrag annehmen - oder begruendet nicht.
   *
   * Das Thema kommt aus einem Formular und ist damit fremder Text. Es
   * geht durch dieselbe Reinigung wie jede andere Eingabe von aussen;
   * eine eigene hier waere eine zweite Antwort auf dieselbe Frage.
   */
  var THEMA_MAX = 120;

  function auftrag(spec) {
    spec = spec || {};
    var m = MODI[spec.modus];
    if (!m) {
      return { ok: false, grund: "UNBEKANNTER_MODUS",
        erklaerung: "'" + text(spec.modus) + "' ist keiner der drei Modi." };
    }

    var thema = null;
    if (m.brauchtThema) {
      if (!gefuellt(spec.thema)) {
        return { ok: false, modus: m.id, grund: "THEMA_FEHLT",
          erklaerung: m.label + " ohne Thema ist " + MODI.MANUAL_NOW.label +
            " mit einem leeren Feld. Entweder steht ein Thema da, oder es " +
            "ist der andere Knopf." };
      }
      /* -----------------------------------------------------------------
         EIN UEBERNAHMEVERSUCH WIRD NICHT GEREINIGT, SONDERN ABGELEHNT

         Das Thema geht in einen Brief, den ein Autor liest. Ein Satz
         wie "ignoriere alle vorherigen Anweisungen" darin
         stillschweigend zu saeubern hiesse, den Versuch zu verbergen.
         Er wird gemeldet - mit den Muster-IDs und NIE mit dem Text,
         das ist die Regel von untrusted.js seit jeher.
         ----------------------------------------------------------------- */
      var funde = Untrusted.detect(text(spec.thema));
      if (funde.length) {
        return { ok: false, modus: m.id, grund: "THEMA_ABGELEHNT",
          muster: funde,
          erklaerung: "Im Thema stehen Muster, die wie eine Anweisung an " +
            "das System aussehen (" + funde.join(", ") + "). Ein Thema ist " +
            "ein Gegenstand, keine Anweisung." };
      }
      thema = Untrusted.sanitize(text(spec.thema), { maxLength: THEMA_MAX })
        .trim();
      if (!gefuellt(thema)) {
        return { ok: false, modus: m.id, grund: "THEMA_LEER_NACH_REINIGUNG",
          erklaerung: "Vom eingegebenen Thema blieb nach der Reinigung " +
            "nichts uebrig." };
      }
    } else if (gefuellt(spec.thema)) {
      return { ok: false, modus: m.id, grund: "THEMA_UNERWARTET",
        erklaerung: m.label + " nimmt kein Thema entgegen. Ein Feld, das " +
          "stillschweigend ignoriert wird, ist schlimmer als eine " +
          "Fehlermeldung." };
    }

    return {
      ok: true,
      modus: m.id,
      label: m.label,
      thema: thema,
      istProduktionsauftrag: m.istProduktionsauftrag,
      /* Woertlich, damit niemand es aus dem Modus ableiten muss: ein
         Auftrag veroeffentlicht nichts. */
      veroeffentlicht: false,
      erklaerung: m.label + ": " + m.zweck +
        (thema ? " Thema: " + thema : "")
    };
  }

  var api = {
    MODI: MODI,
    MODUS_IDS: MODUS_IDS,
    AUFHEBBAR: AUFHEBBAR,
    NIEMALS_AUFHEBBAR: NIEMALS_AUFHEBBAR,
    THEMA_MAX: THEMA_MAX,
    GRUND: Kadenz.GRUND,
    istAufhebbar: istAufhebbar,
    anwenden: anwenden,
    auftrag: auftrag
  };

  if (isNode) module.exports = api;
  else global.VUSocialManualMode = api;
})(typeof window !== "undefined" ? window : globalThis);
