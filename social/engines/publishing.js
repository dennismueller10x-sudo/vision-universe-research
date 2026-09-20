/* =========================================================================
   VISION UNIVERSE SOCIAL — publishing.js
   PUBLISHING ORCHESTRATOR (§15)

   Er entscheidet WAS, WOHIN, WANN, WARUM — und in welchem Zustand sich
   eine Veroeffentlichung befindet.

   DER TEUERSTE FEHLER DIESES SYSTEMS

   Derselbe Beitrag zweimal veroeffentlicht. Er ist teuer, weil er
   oeffentlich ist: ein doppelter Datensatz laesst sich loeschen, ein
   doppelter Instagram-Post haben tausend Menschen gesehen.

   Er entsteht nicht durch Nachlaessigkeit, sondern durch normale
   Betriebsvorgaenge: ein Workflow-Lauf bricht nach dem erfolgreichen
   API-Aufruf ab, bevor er den Zustand schreiben konnte. Der naechste Lauf
   sieht "SCHEDULED" und veroeffentlicht erneut.

   DREI SPERREN, UNABHAENGIG VONEINANDER

     1. IDEMPOTENCY-LEDGER   ein Schluessel aus dem INHALT, nicht aus dem
                             Zufall. Zweimal derselbe Schluessel = einmal
                             veroeffentlichen.
     2. ZUSTANDSAUTOMAT      nur erlaubte Uebergaenge. PUBLISHED ist
                             terminal (ausser ARCHIVED).
     3. IN-FLIGHT-MARKE      der Zustand wird VOR dem API-Aufruf auf
                             PUBLISHING gesetzt. Ein Lauf, der eine
                             fremde PUBLISHING-Marke findet, fasst sie
                             nicht an, sondern meldet sie.

   Die dritte Sperre ist die, an die man zuletzt denkt: ohne sie
   veroeffentlichen zwei gleichzeitige Laeufe beide, weil beide "READY"
   gesehen haben.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Schema = isNode ? require("./schema.js") : global.VUSocialSchema;
  var Events = isNode ? require("./events.js") : global.VUSocialEvents;
  var Hash   = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  function fail(m) { throw new Error("VUSocialPublishing: " + m); }

  /** Ist dieser Zustandsuebergang erlaubt? */
  function canTransition(from, to) {
    var allowed = Schema.PUBLICATION_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.indexOf(to) !== -1;
  }

  /* Wie lange eine PUBLISHING-Marke gueltig ist, bevor sie als
     verwaist gilt. Kuerzer waere gefaehrlich (ein langsamer Upload wird
     zum zweiten Post), laenger waere laestig (eine echte Panne blockiert
     den Kanal). */
  var IN_FLIGHT_TIMEOUT_SECONDS = 900;

  /* Backoff fuer Wiederholungen. Bewusst grosszuegig: die haeufigste
     Ursache ist eine Ratenbegrenzung, und die laeuft in Minuten ab. */
  var RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600];
  var MAX_ATTEMPTS = 4;

  /* Fehlergruende, bei denen ein Retry sinnlos ist. Ein abgelaufenes
     Token wird durch Warten nicht gueltig. */
  var TERMINAL_REASONS = ["tokenExpired", "permissionRevoked", "invalidMedia",
                          "notConfigured", "missingIdempotencyKey", "missingAccount",
                          "notImplemented", "stateMismatch"];

  /**
   * Der Orchestrator.
   *
   * @param deps.registry     Provider-Registry
   * @param deps.killSwitch   Ergebnis von kill-switch.fromConfig()
   * @param deps.auditLog     audit-log.createLog()
   * @param deps.now          Zeitquelle
   * @param deps.publications vorhandene Veroeffentlichungen (aus dem Artefakt)
   */
  function createOrchestrator(deps) {
    deps = deps || {};
    var now = deps.now || (function () { return new Date(); });
    var registry = deps.registry;
    var killSwitch = deps.killSwitch;
    var auditLog = deps.auditLog;

    /* publicationId -> publication */
    var byId = Object.create(null);
    /* idempotencyKey -> publicationId — die erste Sperre. */
    var byKey = Object.create(null);

    (deps.publications || []).forEach(function (p) {
      byId[p.publicationId] = p;
      if (p.idempotencyKey) byKey[p.idempotencyKey] = p.publicationId;
    });

    function record(decision, fields) {
      if (!auditLog) return null;
      return auditLog.record(Object.assign({ decision: decision, timestamp: now().toISOString() }, fields || {}));
    }

    /**
     * Legt eine Veroeffentlichung an oder gibt die vorhandene zurueck.
     *
     * DIE ERSTE SPERRE. Sie greift hier und nicht erst beim Senden: eine
     * doppelte Planung erzeugt sonst zwei Eintraege, die sich beide fuer
     * den einzigen halten.
     */
    function intend(spec) {
      spec = spec || {};
      ["packageId", "providerId", "accountId"].forEach(function (f) {
        if (!spec[f]) fail("intend() ohne " + f);
      });

      var key = Events.publicationIdempotencyKey({
        providerId: spec.providerId, accountId: spec.accountId,
        packageId: spec.packageId, scheduledFor: spec.scheduledFor || null
      });

      if (byKey[key]) {
        var existing = byId[byKey[key]];
        record("publication.intend", {
          inputs: [spec.packageId], provider: spec.providerId, result: "skipped",
          reason: "Bereits geplant unter " + existing.publicationId + "."
        });
        return { created: false, publication: existing,
                 reason: "Fuer diesen Inhalt, dieses Konto und diesen Zeitpunkt existiert bereits eine Veroeffentlichung." };
      }

      var publication = Schema.publication({
        publicationId: Hash.prefixedHash("pubid", { key: key, createdAt: now().toISOString() }),
        packageId: spec.packageId,
        providerId: spec.providerId,
        accountId: spec.accountId,
        state: "IDEA",
        idempotencyKey: key,
        scheduledFor: spec.scheduledFor || null,
        autonomyLevel: spec.autonomyLevel === undefined ? null : spec.autonomyLevel,
        strategyVersion: spec.strategyVersion || null
      });
      byId[publication.publicationId] = publication;
      byKey[key] = publication.publicationId;
      record("publication.intend", {
        inputs: [spec.packageId], provider: spec.providerId, result: "succeeded",
        output: { publicationId: publication.publicationId }
      });
      return { created: true, publication: publication, reason: null };
    }

    /** DIE ZWEITE SPERRE: nur erlaubte Uebergaenge. */
    function transition(publicationId, to, meta) {
      var pub = byId[publicationId];
      if (!pub) fail("unbekannte Veroeffentlichung: " + publicationId);
      if (!canTransition(pub.state, to)) {
        record("publication.transition", {
          inputs: [publicationId], result: "blocked",
          reason: "Uebergang " + pub.state + " -> " + to + " ist nicht vorgesehen."
        });
        return { ok: false, publication: pub,
                 reason: "Uebergang " + pub.state + " -> " + to + " ist nicht vorgesehen." };
      }
      var from = pub.state;
      pub.state = to;
      if (meta && meta.scheduledFor) pub.scheduledFor = meta.scheduledFor;
      record("publication.transition", {
        inputs: [publicationId], result: "succeeded",
        output: { from: from, to: to }
      });
      return { ok: true, publication: pub, reason: null, from: from, to: to };
    }

    /**
     * Ist eine PUBLISHING-Marke verwaist? Eine Marke, die aelter ist als
     * das Zeitfenster, gehoert zu einem Lauf, den es nicht mehr gibt.
     */
    function isStaleInFlight(pub) {
      if (pub.state !== "PUBLISHING") return false;
      var last = pub.attempts[pub.attempts.length - 1];
      if (!last || !last.startedAt) return true;
      return (now().getTime() - Date.parse(last.startedAt)) / 1000 > IN_FLIGHT_TIMEOUT_SECONDS;
    }

    /**
     * Veroeffentlichen.
     *
     * Der Ablauf, in dieser Reihenfolge und nicht in einer anderen:
     *
     *   1. Kill Switch fragen      (§33)
     *   2. Zustand pruefen
     *   3. In-Flight-Marke setzen  VOR dem Aufruf
     *   4. Adapter aufrufen
     *   5. Ergebnis verbuchen
     */
    function publish(publicationId, media, options) {
      options = options || {};
      var pub = byId[publicationId];
      if (!pub) return Promise.resolve({ ok: false, reason: "unknownPublication",
        message: "Unbekannte Veroeffentlichung." });

      /* 1. Kill Switch. Er wird IMMER gefragt, auch wenn der Aufrufer
            glaubt, das schon getan zu haben. */
      var gate = killSwitch.allows(pub.providerId, "publish");
      if (!gate.allowed) {
        record("publication.publish", {
          inputs: [publicationId], provider: pub.providerId, result: "blocked", reason: gate.reason
        });
        return Promise.resolve({ ok: false, reason: "killSwitch", blockedBy: gate.blockedBy,
          message: gate.reason, publication: pub });
      }

      /* 2. Zustand. */
      if (pub.state === "PUBLISHED") {
        return Promise.resolve({ ok: true, alreadyPublished: true, publication: pub,
          message: "Bereits veroeffentlicht. Es wird kein zweiter Beitrag erzeugt." });
      }
      if (pub.state === "PUBLISHING" && !isStaleInFlight(pub)) {
        /* DIE DRITTE SPERRE. Nicht anfassen — ein anderer Lauf ist dran. */
        record("publication.publish", {
          inputs: [publicationId], provider: pub.providerId, result: "skipped",
          reason: "Ein anderer Lauf veroeffentlicht diesen Beitrag gerade."
        });
        return Promise.resolve({ ok: false, reason: "inFlight", publication: pub,
          message: "Ein anderer Lauf hat diese Veroeffentlichung bereits begonnen. " +
                   "Dieser Lauf fasst sie nicht an." });
      }
      /* Die Versuchsgrenze steht VOR der Zustandspruefung. Sonst meldet
         eine ausgereizte Veroeffentlichung "falscher Zustand" — formal
         richtig und praktisch irrefuehrend, weil der Zustand nur die
         Folge der aufgebrauchten Versuche ist. */
      if (pub.attempts.length >= MAX_ATTEMPTS) {
        return Promise.resolve({ ok: false, reason: "attemptsExhausted", publication: pub,
          message: "Nach " + pub.attempts.length + " Versuchen wird nicht weiter versucht. " +
                   "Das ist eine Entscheidung fuer einen Menschen." });
      }
      if (["READY", "SCHEDULED", "RETRY", "PUBLISHING"].indexOf(pub.state) === -1) {
        return Promise.resolve({ ok: false, reason: "wrongState", publication: pub,
          message: "Zustand " + pub.state + " ist nicht veroeffentlichungsfaehig." +
            (pub.state === "FAILED" ? " Ein Wiederholungsversuch laeuft ueber scheduleRetry()." : "") });
      }

      /* 3. In-Flight-Marke VOR dem Aufruf. */
      var attempt = Schema.publicationAttempt({
        attemptId: Hash.prefixedHash("att", { publicationId: publicationId, n: pub.attempts.length }),
        startedAt: now().toISOString(),
        outcome: "pending"
      });
      pub.attempts.push(attempt);
      if (pub.state !== "PUBLISHING") pub.state = "PUBLISHING";

      var provider;
      try { provider = registry.get(pub.providerId); }
      catch (err) {
        attempt.outcome = "failed";
        attempt.finishedAt = now().toISOString();
        attempt.errorCode = "unknownProvider";
        pub.state = "FAILED";
        return Promise.resolve({ ok: false, reason: "unknownProvider", publication: pub,
          message: "Provider " + pub.providerId + " ist nicht registriert." });
      }

      /* 4. Adapter. */
      return Promise.resolve()
        .then(function () {
          return provider.publish({
            idempotencyKey: pub.idempotencyKey,
            accountId: pub.accountId,
            media: media
          });
        })
        .catch(function (err) {
          return { available: false, reason: "adapterThrew",
                   message: String(err && err.message).slice(0, 200), retryable: false };
        })
        .then(function (result) {
          attempt.finishedAt = now().toISOString();

          if (result.available) {
            attempt.outcome = "succeeded";
            pub.state = "PUBLISHED";
            pub.publishedAt = (result.data && result.data.publishedAt) || now().toISOString();
            pub.externalPostId = (result.data && result.data.externalPostId) || null;
            pub.permalink = (result.data && result.data.permalink) || null;
            var deduplicated = !!(result.data && result.data.deduplicated);
            record("publication.publish", {
              inputs: [publicationId, pub.packageId], provider: pub.providerId,
              result: "succeeded", autonomyLevel: pub.autonomyLevel,
              strategyVersion: pub.strategyVersion,
              output: { externalPostId: pub.externalPostId, deduplicated: deduplicated },
              reason: deduplicated
                ? "Die Plattform hat eine Wiederholung erkannt; es wurde kein zweiter Beitrag erzeugt."
                : null
            });
            return { ok: true, publication: pub, deduplicated: deduplicated,
                     event: Events.envelope("PUBLICATION_SUCCEEDED",
                       { publicationId: publicationId }, { producedBy: options.producedBy || "orchestrator" }),
                     message: deduplicated
                       ? "Bereits vorhanden — der Provider hat die Wiederholung abgefangen."
                       : "Veroeffentlicht." };
          }

          attempt.outcome = "failed";
          attempt.errorCode = result.reason || "unknown";
          attempt.errorMessage = result.message || null;
          attempt.retryable = result.retryable === true && TERMINAL_REASONS.indexOf(result.reason) === -1;

          /* Ein Container ohne Beitrag ist ein halber Zustand. Er wird
             notiert, damit ein Wiederholungsversuch ihn kennt. */
          if (result.data && result.data.pendingContainer) {
            pub.pendingContainer = result.data.pendingContainer;
          }

          pub.state = attempt.retryable ? "FAILED" : "FAILED";
          record("publication.publish", {
            inputs: [publicationId, pub.packageId], provider: pub.providerId,
            result: "failed", reason: result.message,
            output: { errorCode: attempt.errorCode, retryable: attempt.retryable }
          });
          return {
            ok: false, reason: result.reason, publication: pub,
            retryable: attempt.retryable,
            retryAfterSeconds: nextBackoff(pub.attempts.length),
            message: result.message,
            event: Events.envelope("PUBLICATION_FAILED",
              { publicationId: publicationId, attemptId: attempt.attemptId },
              { producedBy: options.producedBy || "orchestrator" })
          };
        });
    }

    function nextBackoff(attemptCount) {
      var i = Math.min(attemptCount - 1, RETRY_BACKOFF_SECONDS.length - 1);
      return RETRY_BACKOFF_SECONDS[Math.max(0, i)];
    }

    /**
     * Bereitet einen Wiederholungsversuch vor. Er aendert NICHTS am
     * Idempotenzschluessel — sonst waere er kein Retry.
     */
    function scheduleRetry(publicationId) {
      var pub = byId[publicationId];
      if (!pub) fail("unbekannte Veroeffentlichung: " + publicationId);
      if (pub.state !== "FAILED") {
        return { ok: false, reason: "Nur ein fehlgeschlagener Versuch wird wiederholt (Zustand: " + pub.state + ")." };
      }
      var last = pub.attempts[pub.attempts.length - 1];
      if (last && last.retryable !== true) {
        return { ok: false, reason: "Der Fehler '" + (last.errorCode || "unbekannt") +
                 "' wird durch Warten nicht besser. Hier entscheidet ein Mensch." };
      }
      if (pub.attempts.length >= MAX_ATTEMPTS) {
        return { ok: false, reason: "Versuchsgrenze erreicht." };
      }
      var t = transition(publicationId, "RETRY");
      return { ok: t.ok, reason: t.reason,
               retryAfterSeconds: nextBackoff(pub.attempts.length), publication: pub };
    }

    /** Welche Veroeffentlichungen sind jetzt faellig? */
    function due(nowIso) {
      var t = nowIso ? Date.parse(nowIso) : now().getTime();
      return Object.keys(byId).map(function (id) { return byId[id]; }).filter(function (p) {
        if (p.state === "READY") return true;
        if (p.state === "SCHEDULED") return p.scheduledFor && Date.parse(p.scheduledFor) <= t;
        if (p.state === "RETRY") return true;
        /* Verwaiste In-Flight-Marken sind faellig — aber erst nach dem
           Zeitfenster, und das prueft publish() noch einmal. */
        if (p.state === "PUBLISHING") return isStaleInFlight(p);
        return false;
      });
    }

    return {
      intend: intend,
      transition: transition,
      publish: publish,
      scheduleRetry: scheduleRetry,
      due: due,
      get: function (id) { return byId[id] || null; },
      all: function () { return Object.keys(byId).map(function (id) { return byId[id]; }); },
      byIdempotencyKey: function (key) { return byKey[key] ? byId[byKey[key]] : null; },
      isStaleInFlight: isStaleInFlight
    };
  }

  var api = {
    IN_FLIGHT_TIMEOUT_SECONDS: IN_FLIGHT_TIMEOUT_SECONDS,
    RETRY_BACKOFF_SECONDS: RETRY_BACKOFF_SECONDS,
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    TERMINAL_REASONS: TERMINAL_REASONS,
    canTransition: canTransition,
    createOrchestrator: createOrchestrator
  };

  if (isNode) module.exports = api;
  else global.VUSocialPublishing = api;
})(typeof window !== "undefined" ? window : globalThis);
