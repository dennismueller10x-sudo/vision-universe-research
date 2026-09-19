/* =========================================================================
   VISION UNIVERSE SOCIAL — Die Owner-Entscheidung ist unantastbar

   -------------------------------------------------------------------------
   DER VORFALL, DER DIESE DATEI AUSGELOEST HAT
   -------------------------------------------------------------------------

   Ein Testartefakt hatte den echten Kandidaten cand_20260917_0363e680
   als SUPERSEDED markiert. Bei der Reparatur habe ich ihn auf
   AWAITING_APPROVAL zurueckgesetzt — und damit eine bereits getroffene
   Owner-Entscheidung ueberschrieben.

   Die Entscheidung lautete: nicht veroeffentlichen, wegen
   unzureichender Evidenz zurueckhalten, und ausdruecklich NICHT als
   Leistungs-Ablehnung behandeln.

   -------------------------------------------------------------------------
   WARUM DAS PASSIEREN KONNTE
   -------------------------------------------------------------------------

   Es gab fuer diese Entscheidung keinen Zustand.

   Das Vokabular kannte AWAITING_APPROVAL, APPROVED, REJECTED und
   SUPERSEDED. "Zurueckgehalten, weil die Evidenz nicht reicht" ist
   keines davon: es ist keine Freigabe, keine Ablehnung, kein Warten
   und keine Ersetzung. Die Entscheidung war damit nirgends
   persistiert, und was nirgends steht, kann jede Reparatur
   ueberschreiben, ohne etwas zu bemerken.

   Der Fehler war also nicht die Reparatur. Der Fehler war ein
   Zustandsraum, in dem sich eine reale Owner-Entscheidung nicht
   ausdruecken liess.

   -------------------------------------------------------------------------
   DIE GRENZE
   -------------------------------------------------------------------------

   Zwei Arten von Zustaenden, und dazwischen laeuft die Linie:

     ENTSCHIEDEN   APPROVED, REJECTED, HELD_FOR_ENRICHMENT,
                   HELD_FOR_CREATIVE_REFINEMENT
                   Ein Mensch hat entschieden. Nur ein Mensch aendert
                   das wieder.

     MASCHINELL    AWAITING_APPROVAL, SUPERSEDED
                   Der Lauf hat sie gesetzt, der Lauf darf sie aendern.

   Recovery, Tests und Kettenreparaturen bewegen sich ausschliesslich
   im maschinellen Teil. Beruehren sie einen entschiedenen Zustand,
   wird der Schreibvorgang ABGELEHNT und nicht etwa protokolliert und
   trotzdem ausgefuehrt.

   HELD_FOR_ENRICHMENT ist dabei kein Leistungsurteil. Der Beitrag
   wurde nie veroeffentlicht, hat deshalb keine Leistung, und er darf in
   keinen Leistungsvergleich eingehen — genau wie REJECTED, und aus
   demselben Grund.

   -------------------------------------------------------------------------
   DER ZWEITE ZUSTAND, DER GEFEHLT HAT
   -------------------------------------------------------------------------

   Derselbe Befund ein zweites Mal, an anderer Stelle:
   cand_20260918_ca4ea408 war technisch einwandfrei, evidenzgebunden,
   faktengeprueft — und redaktionell noch nicht gut genug. Der Owner
   wollte ihn weder freigeben noch ablehnen noch wegen fehlender
   Evidenz zurueckhalten. Die Evidenz REICHTE; die Auswahl daraus war
   das Problem.

   HELD_FOR_ENRICHMENT haette das Gegenteil behauptet ("zu wenig
   Belege"), REJECTED haette das Thema verworfen, AWAITING_APPROVAL
   haette die Entscheidung geleugnet. Wieder war die Lage real und der
   Zustandsraum zu klein.

   HELD_FOR_CREATIVE_REFINEMENT sagt genau das, was zutrifft:

     * kein Leistungsurteil  — der Beitrag ist nie erschienen
     * kein Evidence Failure — die Belege reichen, sie sind gebunden
     * kein Themen-Reject    — das Thema bleibt richtig
     * kein Transportfehler, kein Compliance-Befund

   Erwogen und verworfen wurde REVISION_REQUESTED: ein Zustand sagt,
   WORIN der Kandidat sich befindet, nicht welche Nachricht jemand
   verschickt hat. "Zurueckgehalten fuer redaktionelle Ueberarbeitung"
   bleibt wahr, auch wenn niemand mehr eine Revision anfordert. Das
   strukturierte Feedback haengt am Zustand, es IST nicht der Zustand.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Zustaende, hinter denen ein Mensch steht. */
  var ENTSCHIEDEN = ["APPROVED", "REJECTED", "HELD_FOR_ENRICHMENT",
    "HELD_FOR_CREATIVE_REFINEMENT", "HELD_FOR_AUDIENCE_FIT"];

  /* Zustaende, die der Lauf setzt und der Lauf aendern darf. */
  var MASCHINELL = ["AWAITING_APPROVAL", "SUPERSEDED"];

  var ZUSTAENDE = ENTSCHIEDEN.concat(MASCHINELL);

  /* Entschiedene Zustaende, die keine Aussage ueber die LEISTUNG des
     Beitrags treffen. Ein Beitrag, der nie erschienen ist, hat keine
     Leistung — weder eine gute noch eine schlechte. */
  var OHNE_LEISTUNGSAUSSAGE = ["REJECTED", "HELD_FOR_ENRICHMENT",
    "HELD_FOR_CREATIVE_REFINEMENT", "HELD_FOR_AUDIENCE_FIT"];

  /* Woran ein zurueckgehaltener Kandidat haengt. Die Unterscheidung
     ist keine Formsache: sie sagt, WELCHE Stufe nacharbeiten muss, und
     sie darf nicht verwechselt werden. */
  var HALTEGRUND = {
    HELD_FOR_ENRICHMENT: {
      stage: "EVIDENCE",
      summary: "Die Belege hinter dem Beitrag reichen nicht.",
      evidenceFailure: true,
      creativeFailure: false
    },
    HELD_FOR_CREATIVE_REFINEMENT: {
      stage: "CREATIVE",
      summary: "Die Belege reichen; die redaktionelle Auswahl daraus " +
        "noch nicht.",
      evidenceFailure: false,
      creativeFailure: true
    },
    /* -----------------------------------------------------------------
       DER DRITTE HALTEGRUND LIEGT EINE EBENE HOEHER

       Die beiden anderen fragen: reichen die Belege? taugt die
       redaktionelle Umsetzung? Beides kann mit Ja beantwortet sein -
       und der Beitrag trotzdem nicht veroeffentlichungsfaehig, weil
       das CONTENT-KONZEPT selbst ein Publikum voraussetzt, das es
       nicht gibt.

       Genau dieser Fall ist eingetreten: ein Hook mit gebundener
       Evidenz, Markenwert 100, Rubrik 10 von 10 - und drei
       Voraussetzungen, die ein breites Publikum nicht mitbringt.

       Ein Zustandsraum, der das nicht ausdruecken kann, zwingt zu
       einer falschen Einordnung. "Creative Refinement" hiesse: schreib
       es besser. Der Befund lautet aber: waehle etwas anderes aus.
       ------------------------------------------------------------------- */
    HELD_FOR_AUDIENCE_FIT: {
      stage: "OPPORTUNITY",
      summary: "Belege und Umsetzung tragen; das Content-Konzept setzt " +
        "Vorwissen voraus, das ein breites Publikum nicht hat.",
      evidenceFailure: false,
      creativeFailure: false,
      /* Ausdruecklich: dieser Zustand ist KEIN Urteil ueber die
         Wortwahl. Eine weitere Textrevision waere die falsche
         Nacharbeit - die Auswahl muss frueher ansetzen. */
      audienceFailure: true,
      reworkStage: "SOCIAL_OPPORTUNITY"
    }
  };

  /** Der Haltegrund zu einem Zustand, oder null. */
  function haltegrund(state) {
    return HALTEGRUND[String(state || "")] || null;
  }

  function istEntschieden(state) {
    return ENTSCHIEDEN.indexOf(String(state || "")) !== -1;
  }

  function istMaschinell(state) {
    return MASCHINELL.indexOf(String(state || "")) !== -1;
  }

  function traegtLeistungsaussage(state) {
    return istEntschieden(state) && OHNE_LEISTUNGSAUSSAGE.indexOf(String(state)) === -1;
  }

  /**
   * Darf ein maschineller Vorgang diesen Kandidaten in diesen Zustand
   * bringen?
   *
   * `actor` sagt, wer schreibt: "machine" ist alles, was ohne Mensch
   * laeuft — Zyklus, Recovery, Test, Kettenreparatur. "owner" ist die
   * ausdrueckliche Entscheidung eines Menschen.
   */
  function mayTransition(vorher, nachher, options) {
    options = options || {};
    var akteur = options.actor || "machine";

    if (ZUSTAENDE.indexOf(String(nachher)) === -1) {
      return { ok: false, reason: "unknownState",
        explanation: "Unbekannter Zielzustand: " + nachher + "." };
    }

    /* Ein Mensch darf alles — das ist der Sinn des Owner-Gates. */
    if (akteur === "owner") return { ok: true, reason: null, explanation: null };

    if (istEntschieden(vorher)) {
      return { ok: false, reason: "ownerDecided",
        explanation: "Ueber diesen Kandidaten hat der Owner entschieden (" + vorher +
          "). Ein maschineller Vorgang - Lauf, Recovery, Test oder " +
          "Kettenreparatur - aendert das nicht. Wer den Zustand " +
          "wirklich aendern will, entscheidet neu." };
    }

    if (istEntschieden(nachher)) {
      return { ok: false, reason: "machineCannotDecide",
        explanation: "Der Zustand " + nachher + " ist eine Entscheidung. Eine " +
          "Maschine trifft sie nicht." };
    }

    return { ok: true, reason: null, explanation: null };
  }

  /**
   * Der Schutz beim Schreiben: gibt den zu schreibenden Kandidaten
   * zurueck oder wirft.
   *
   * Absichtlich ein Wurf und kein stiller Rueckfall: ein Vorgang, der
   * eine Owner-Entscheidung anfassen wollte, hat eine falsche Annahme
   * ueber die Welt. Die soll auffallen.
   */
  function guardWrite(vorhanden, neu, options) {
    var vorher = vorhanden && vorhanden.state;
    var nachher = neu && neu.state;

    /* Kein Vorgaenger: es gibt nichts zu ueberschreiben. */
    if (!vorhanden) return neu;

    /* Kein Zustandswechsel: der Kandidat wird ergaenzt, nicht bewegt.
       Auch das ist bei einer Owner-Entscheidung nicht erlaubt, wenn es
       von einer Maschine kommt — der Inhalt gehoert zur Entscheidung. */
    var befund = mayTransition(vorher, nachher, options);
    if (!befund.ok) {
      var fehler = new Error("VUSocialOwnerDecision: " + befund.explanation);
      fehler.code = befund.reason;
      fehler.candidateId = (vorhanden && vorhanden.candidateId) || null;
      fehler.fromState = vorher;
      fehler.toState = nachher;
      throw fehler;
    }
    return neu;
  }

  /** Trennt eine Liste Kandidaten in die, die eine Maschine anfassen darf, und den Rest. */
  function partition(kandidaten) {
    var frei = [], geschuetzt = [];
    (kandidaten || []).forEach(function (k) {
      if (istEntschieden(k && k.state)) geschuetzt.push(k);
      else frei.push(k);
    });
    return { machineWritable: frei, ownerDecided: geschuetzt };
  }

  var api = {
    ZUSTAENDE: ZUSTAENDE,
    ENTSCHIEDEN: ENTSCHIEDEN,
    MASCHINELL: MASCHINELL,
    OHNE_LEISTUNGSAUSSAGE: OHNE_LEISTUNGSAUSSAGE,
    HALTEGRUND: HALTEGRUND,
    haltegrund: haltegrund,
    istEntschieden: istEntschieden,
    istMaschinell: istMaschinell,
    traegtLeistungsaussage: traegtLeistungsaussage,
    mayTransition: mayTransition,
    guardWrite: guardWrite,
    partition: partition
  };

  if (isNode) module.exports = api;
  else global.VUSocialOwnerDecision = api;
})(typeof window !== "undefined" ? window : globalThis);
