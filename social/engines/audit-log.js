/* =========================================================================
   VISION UNIVERSE SOCIAL — audit-log.js
   AUDITPROTOKOLL AUTONOMER ENTSCHEIDUNGEN (§42)

   Jede Handlung, die das System ohne einen Menschen ausloest, hinterlaesst
   hier einen Eintrag. Nicht als Fehlerprotokoll — der Erfolgsfall ist der
   wichtigere: er beantwortet die Frage, warum am Dienstag um 07:12 dieser
   Beitrag erschienen ist.

   WAS EIN EINTRAG MINDESTENS TRAEGT

     decision        was entschieden wurde
     timestamp       wann
     strategyVersion auf welcher Grundlage
     inputs          worauf gestuetzt (Referenzen, keine Kopien)
     output          was herauskam
     provider        gegen welches System
     result          wie es ausging

   WAS NIEMALS DARIN STEHT

   Zugangsdaten. Die Sperre ist nicht Sorgfalt, sondern Code: `redact()`
   laeuft ueber jeden Eintrag, bevor er in die Liste geht. Die Lehre aus
   quant/tests/secrets.test.mjs S8 gilt hier doppelt — ein Anbieter, der
   sein eigenes Token in eine Fehlermeldung schreibt, darf es nicht ueber
   unser Protokoll in die Git-Historie tragen.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Hash = isNode ? require("../../quant/engines/hash.js") : global.VUHash;

  /* Schluesselnamen, deren WERT ersetzt wird. */
  var SECRET_KEYS = [
    "accesstoken", "access_token", "refreshtoken", "refresh_token",
    "token", "secret", "appsecret", "app_secret", "clientsecret", "client_secret",
    "password", "authorization", "apikey", "api_key", "code", "state"
  ];

  /* Zusaetzlich Werte, die wie ein Token AUSSEHEN, egal unter welchem
     Schluessel sie stehen. Ein Anbieter, der ein Token im Feld "message"
     spiegelt, umgeht die Schluesselliste sonst muehelos. */
  var TOKEN_SHAPES = [
    /\bEA[A-Za-z0-9]{40,}/g,                    /* Meta Graph Access Token */
    /\bIG[A-Za-z0-9]{30,}/g,                    /* Instagram Token */
    /\bBearer\s+[A-Za-z0-9._\-]{20,}/gi,
    /\bsk-[A-Za-z0-9]{20,}/g,
    /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g  /* JWT */
  ];

  var MASK = "[redacted]";

  function redactString(value) {
    var out = String(value);
    TOKEN_SHAPES.forEach(function (re) { out = out.replace(re, MASK); });
    return out;
  }

  /**
   * Tiefe Bereinigung. Arbeitet auf einer KOPIE — ein Audit-Log, das sein
   * Eingabeobjekt veraendert, waere ein Seiteneffekt an der falschen Stelle.
   */
  function redact(value, depth) {
    depth = depth || 0;
    if (depth > 12) return MASK;
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return redactString(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.map(function (v) { return redact(v, depth + 1); });
    if (typeof value !== "object") return MASK;

    var out = {};
    Object.keys(value).forEach(function (key) {
      if (SECRET_KEYS.indexOf(key.toLowerCase()) !== -1) { out[key] = MASK; return; }
      out[key] = redact(value[key], depth + 1);
    });
    return out;
  }

  var RESULTS = ["succeeded", "failed", "blocked", "skipped", "pending"];

  function fail(m) { throw new Error("VUSocialAuditLog: " + m); }

  /**
   * Ein Protokoll. Die Persistenz liegt eine Schicht hoeher (JSON-Artefakt
   * bzw. R2), damit die Engine im Browser identisch laeuft.
   */
  function createLog(existingEntries) {
    var entries = Array.isArray(existingEntries) ? existingEntries.slice() : [];

    function record(spec) {
      spec = spec || {};
      if (!spec.decision) fail("Eintrag ohne 'decision'");
      if (spec.result && RESULTS.indexOf(spec.result) === -1) fail("unbekanntes Ergebnis: " + spec.result);

      var entry = {
        decision: String(spec.decision),
        timestamp: spec.timestamp || new Date().toISOString(),
        actor: spec.actor || "system",
        autonomyLevel: spec.autonomyLevel === undefined ? null : spec.autonomyLevel,
        strategyVersion: spec.strategyVersion || null,
        /* Referenzen, keine Kopien: das Protokoll soll nicht zur zweiten
           Datenhaltung werden. Wer den Inhalt braucht, folgt der ID. */
        inputs: Array.isArray(spec.inputs) ? spec.inputs.slice() : [],
        output: spec.output === undefined ? null : redact(spec.output),
        provider: spec.provider || null,
        result: spec.result || "pending",
        reason: spec.reason ? redactString(spec.reason) : null,
        detail: spec.detail === undefined ? null : redact(spec.detail)
      };
      entry.entryId = Hash.prefixedHash("aud", {
        decision: entry.decision, timestamp: entry.timestamp,
        inputs: entry.inputs, provider: entry.provider
      });
      entries.push(entry);
      return entry;
    }

    return {
      record: record,
      entries: function () { return entries.slice(); },
      /* Fuer die Erklaerungsansicht (§32): alle Eintraege zu einer Sache. */
      forInput: function (ref) {
        return entries.filter(function (e) { return e.inputs.indexOf(ref) !== -1; });
      },
      failures: function () {
        return entries.filter(function (e) { return e.result === "failed"; });
      },
      size: function () { return entries.length; }
    };
  }

  var api = {
    RESULTS: RESULTS,
    SECRET_KEYS: SECRET_KEYS,
    redact: redact,
    createLog: createLog
  };

  if (isNode) module.exports = api;
  else global.VUSocialAuditLog = api;
})(typeof window !== "undefined" ? window : globalThis);
