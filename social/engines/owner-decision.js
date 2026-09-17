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

     ENTSCHIEDEN   APPROVED, REJECTED, HELD_FOR_ENRICHMENT
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
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  /* Zustaende, hinter denen ein Mensch steht. */
  var ENTSCHIEDEN = ["APPROVED", "REJECTED", "HELD_FOR_ENRICHMENT"];

  /* Zustaende, die der Lauf setzt und der Lauf aendern darf. */
  var MASCHINELL = ["AWAITING_APPROVAL", "SUPERSEDED"];

  var ZUSTAENDE = ENTSCHIEDEN.concat(MASCHINELL);

  /* Entschiedene Zustaende, die keine Aussage ueber die LEISTUNG des
     Beitrags treffen. Ein Beitrag, der nie erschienen ist, hat keine
     Leistung — weder eine gute noch eine schlechte. */
  var OHNE_LEISTUNGSAUSSAGE = ["REJECTED", "HELD_FOR_ENRICHMENT"];

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
