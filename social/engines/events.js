/* =========================================================================
   VISION UNIVERSE SOCIAL — events.js
   EREIGNISARCHITEKTUR (§38)

   Ereignisse verbinden die Stufen des Kreislaufs. Sie sind nicht der
   Transport — der ist ein Workflow-Lauf — sondern der VERTRAG: was ein
   Ereignis mindestens traegt, und unter welcher Bedingung es ein zweites
   Mal verarbeitet werden darf.

   IDEMPOTENZ IST HIER KEINE EIGENSCHAFT, SONDERN DIE AUFGABE

   Ein Workflow-Lauf kann abbrechen und neu starten. Ein Retry kann ein
   bereits verarbeitetes Ereignis erneut vorlegen. Wenn die Verarbeitung
   dann ein zweites Mal wirkt, steht derselbe Beitrag zweimal auf
   Instagram — und das ist kein Datenfehler, sondern ein oeffentlicher.

   Deshalb traegt jedes Ereignis einen aus seinem INHALT abgeleiteten
   Schluessel. Zwei Laeufe, die dasselbe meinen, erzeugen denselben
   Schluessel; der Log erkennt die Wiederholung und laesst sie fallen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  var EVENT_TYPES = [
    "TREND_DETECTED",
    "CONTENT_OPPORTUNITY_CREATED",
    "CONTENT_DRAFTED",
    "CONTENT_VALIDATED",
    "CONTENT_APPROVED",
    "CONTENT_SCHEDULED",
    "PUBLICATION_STARTED",
    "PUBLICATION_SUCCEEDED",
    "PUBLICATION_FAILED",
    "METRICS_UPDATED",
    "LEARNING_OBSERVATION_CREATED",
    "STRATEGY_UPDATED"
  ];

  /* Welches Feld die Identitaet eines Ereignisses traegt. Ohne diese
     Tabelle waere der Idempotency-Key der Hash des ganzen Payloads — und
     ein zusaetzliches Diagnosefeld wuerde aus einer Wiederholung ein
     "neues" Ereignis machen. Genau so entstehen Doppel-Posts. */
  var IDENTITY_FIELDS = {
    TREND_DETECTED:              ["signalId"],
    CONTENT_OPPORTUNITY_CREATED: ["opportunityId"],
    CONTENT_DRAFTED:             ["packageId"],
    CONTENT_VALIDATED:           ["packageId", "validationHash"],
    CONTENT_APPROVED:            ["packageId", "approvedBy"],
    CONTENT_SCHEDULED:           ["publicationId", "scheduledFor"],
    PUBLICATION_STARTED:         ["publicationId", "attemptId"],
    PUBLICATION_SUCCEEDED:       ["publicationId"],
    PUBLICATION_FAILED:          ["publicationId", "attemptId"],
    METRICS_UPDATED:             ["publicationId", "capturedAt"],
    LEARNING_OBSERVATION_CREATED:["observationId"],
    STRATEGY_UPDATED:            ["versionId"]
  };

  function fail(m) { throw new Error("VUSocialEvents: " + m); }

  /**
   * Baut einen Ereignis-Umschlag. `occurredAt` gehoert in den Payload der
   * Identitaet nur dort, wo die Zeit die Sache unterscheidet (Metriken,
   * Terminierung) — sonst waere jeder Wiederholungslauf ein neues Ereignis.
   */
  function envelope(type, payload, meta) {
    if (EVENT_TYPES.indexOf(type) === -1) fail("unbekannter Ereignistyp: " + type);
    payload = payload || {};
    meta = meta || {};

    var fields = IDENTITY_FIELDS[type];
    var identity = {};
    fields.forEach(function (f) {
      if (payload[f] === undefined || payload[f] === null || payload[f] === "") {
        fail(type + " ohne Identitaetsfeld '" + f + "'");
      }
      identity[f] = payload[f];
    });

    return {
      eventId: Hash.prefixedHash("evt", { type: type, identity: identity }),
      type: type,
      occurredAt: meta.occurredAt || new Date().toISOString(),
      /* Die Quelle ist der Lauf, nicht der Mensch. Sie steht im Audit-Log
         und beantwortet spaeter die Frage "welcher Lauf war das". */
      producedBy: meta.producedBy || "unknown",
      strategyVersion: meta.strategyVersion || null,
      payload: payload
    };
  }

  /**
   * Ein Verarbeitungsprotokoll. Bewusst ein einfaches Set: die Persistenz
   * liegt eine Schicht hoeher (JSON-Artefakt oder R2), weil die Engine in
   * Browser und Node identisch laufen muss.
   */
  function createLedger(knownEventIds) {
    var seen = Object.create(null);
    (knownEventIds || []).forEach(function (id) { seen[id] = true; });

    return {
      /** true, wenn das Ereignis neu ist UND damit verarbeitet werden soll. */
      accept: function (event) {
        if (!event || !event.eventId) fail("Ereignis ohne eventId");
        if (seen[event.eventId]) return false;
        seen[event.eventId] = true;
        return true;
      },
      has: function (eventId) { return seen[eventId] === true; },
      size: function () { return Object.keys(seen).length; },
      ids: function () { return Object.keys(seen); }
    };
  }

  /**
   * Der Idempotency-Key einer Veroeffentlichung (§15). Er leitet sich aus
   * dem ab, was eine Veroeffentlichung IST — Konto, Inhalt, geplanter
   * Zeitpunkt — und nicht aus einer Zufallszahl.
   *
   * Absichtlich NICHT enthalten: der Versuchszaehler. Ein Retry muss
   * denselben Schluessel erzeugen, sonst ist er kein Retry, sondern ein
   * zweiter Beitrag.
   */
  function publicationIdempotencyKey(spec) {
    spec = spec || {};
    ["providerId", "accountId", "packageId"].forEach(function (f) {
      if (!spec[f]) fail("Idempotency-Key ohne " + f);
    });
    return Hash.prefixedHash("pub", {
      providerId: spec.providerId,
      accountId: spec.accountId,
      packageId: spec.packageId,
      /* Der geplante Zeitpunkt gehoert dazu: derselbe Inhalt zweimal zu
         verschiedenen Zeiten ist eine Absicht, zweimal zur selben Zeit
         ein Unfall. */
      scheduledFor: spec.scheduledFor || null
    });
  }

  var api = {
    EVENT_TYPES: EVENT_TYPES,
    IDENTITY_FIELDS: IDENTITY_FIELDS,
    envelope: envelope,
    createLedger: createLedger,
    publicationIdempotencyKey: publicationIdempotencyKey
  };

  if (isNode) module.exports = api;
  else global.VUSocialEvents = api;
})(typeof window !== "undefined" ? window : globalThis);
