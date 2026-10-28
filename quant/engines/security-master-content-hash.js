/* =========================================================================
   VISION UNIVERSE — security-master-content-hash.js

   VORSCHLAG (Entwurf, nirgends verdrahtet). Inhalts-Fingerabdruck des
   US-Wertpapierstamms für Backtests, NEBEN dem bestehenden masterHash.

   masterHash (quant/engines/weekly-real-adapter.cjs) ist der SHA-256 der
   ganzen Datei, einschließlich generatedAt, Zeitstempeln je Zeile und
   Zählern. Er bleibt unverändert der Vertrag für Herkunft, calculationKey
   und Reproduzierbarkeit. Jede Übernahme ändert ihn, auch ohne fachliche
   Änderung.

   Dieser Fingerabdruck nimmt nur die Felder, aus denen die Backtest-
   Identität einer Aktie entsteht (Auswahl der Listung, Klasse, Eignung,
   Aktivstatus, Herkunft). Er ist gleich, wenn nur Zeitstempel, Zähler,
   Zeilenreihenfolge oder flüchtige Felder wechseln; er ändert sich bei
   jedem Klassen-, Eignungs-, Aktiv- oder Listungswechsel, bei einer
   zusätzlichen (doppelten) Zeile und bei einem Versionswechsel.

   Fail closed: fehlt ein Feld oder hat es den falschen Typ, wirft er;
   ein Verbraucher behandelt das wie einen geänderten Stamm.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var crypto = isNode ? require("node:crypto") : null;

  var ALGORITHM = "us-security-master-backtest-content-1";
  var FIELDS = Object.freeze(["baseline_security_id", "canonical_id", "ticker", "provider", "currency", "start_date", "active_status", "eligible_us_equity", "instrument_type", "source_provenance"]);
  var TYPES = Object.freeze({ eligible_us_equity: "boolean" });

  function canonicalRows(master) {
    if (!master || typeof master.version !== "string" || !Array.isArray(master.rows)) throw new Error("MASTER_CONTENT_UNHASHABLE");
    var enc = master.rows.map(function (r) {
      if (!r || typeof r !== "object") throw new Error("MASTER_CONTENT_ROW_INVALID");
      return JSON.stringify(FIELDS.map(function (f) {
        if (!(f in r)) throw new Error("MASTER_CONTENT_FIELD_MISSING:" + f);
        var v = r[f], t = TYPES[f] || "string";
        if (!(typeof v === t || (f === "baseline_security_id" && v === null))) throw new Error("MASTER_CONTENT_FIELD_TYPE:" + f);
        return v;
      }));
    });
    /* Reihenfolge nach Code-Einheiten, unabhängig von Locale und Zeilenfolge der Datei; Doppelungen bleiben erhalten */
    enc.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    return enc;
  }

  function payload(master) {
    var rows = canonicalRows(master);
    return JSON.stringify({ algorithm: ALGORITHM, masterVersion: master.version, fields: FIELDS, rows: rows });
  }

  /** SHA-256 (hex) des Inhalts; nur in Node (Backtests laufen lokal bzw. in CI). */
  function contentHash(master) {
    if (!crypto) throw new Error("MASTER_CONTENT_HASH_NODE_ONLY");
    return crypto.createHash("sha256").update(payload(master)).digest("hex");
  }

  var api = { ALGORITHM: ALGORITHM, FIELDS: FIELDS, canonicalRows: canonicalRows, payload: payload, contentHash: contentHash };
  if (isNode) module.exports = api;
  else global.VUSecurityMasterContentHash = api;
})(typeof window !== "undefined" ? window : globalThis);
