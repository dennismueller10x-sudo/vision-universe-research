/* =========================================================================
   VISION UNIVERSE CORE — industry-classification.js

   HISTORISCHE BRANCHENKLASSIFIKATION (SEC-SIC) ZUM ZEITPUNKT.

   Datenbasis: quant/data/sec/sic-history (Erzeuger: scripts/quant/cli.py
   sic-history). Jede Beobachtung ist die SIC, die die SEC dem Registranten
   zum Einreichungszeitpunkt eines Filings zugewiesen hatte, mit knownAt =
   fruehester belegter Zeitpunkt der oeffentlichen Verfuegbarkeit (UTC).
   Siehe docs/HISTORICAL_SIC_PIT_REPORT.md.

   Regeln, die diese Datei durchsetzt:
     1. Eine Abfrage sieht nur Beobachtungen mit knownAt <= cutoff. Spaetere
        Filings sind unsichtbar, auch wenn sie im Datensatz stehen.
     2. asOf als Datum (YYYY-MM-DD) endet um 16:00 America/New_York
        (Handelsschluss). Ein Filing nach Handelsschluss zaehlt erst ab dem
        naechsten Datum. asOf mit Uhrzeit wird exakt genommen.
     3. Die heutige SIC (data.sec.gov/submissions) kennt diese Datei nicht.
        Fehlt eine Beobachtung, ist das Ergebnis UNKNOWN - nie ein Ersatz.
     4. Die Fortschreibung der letzten Beobachtung ist eine Annahme
        (INFERRED_INTERVAL) und wird mit Alter ausgewiesen. Fuer eine
        Entscheidung muss sie deklariert sein: carryForward.declared ist nur
        true, wenn der Aufrufer maxAgeDays UND assumptionRef nennt. Eine belegte
        Gueltigkeit (validFrom/validTo) gibt es nicht: die SEC kann eine SIC
        zwischen zwei Filings aendern, ohne dass es oeffentlich sichtbar wird.
     5. Identitaet nur ueber CIK / issuerId. Ein Ticker ist kein Schluessel.

   UMD: Browser (globalThis.VUCore.IndustryClassification), Node (require).
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.IndustryClassification = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "core-industry-classification-1.0.0";
  var SCHEMA = "sic-history/1.0.0";
  var DAY_MS = 86400000;

  var STATUS = {
    OBSERVED: "OBSERVED",                                   // letzte Beobachtung <= cutoff traegt eine SIC
    NO_SIC_ASSIGNED: "NO_SIC_ASSIGNED",                     // letzte Beobachtung: SEC hatte keine SIC zugewiesen
    UNKNOWN_BEFORE_FIRST_OBSERVATION: "UNKNOWN_BEFORE_FIRST_OBSERVATION",
    UNKNOWN_NO_OBSERVATIONS: "UNKNOWN_NO_OBSERVATIONS",     // CIK ohne Beobachtung im Datensatz
    CONFLICT: "CONFLICT",                                   // widerspruechliche SIC am selben knownAt
    STALE: "STALE",                                         // letzte Beobachtung aelter als die vom Aufrufer gesetzte Grenze
    IDENTITY_HOLD: "IDENTITY_HOLD"                          // keine eindeutige CIK zum Zeitpunkt
  };

  var SOURCES = { F: "FSDS_SUB", H: "FILING_HEADER" };
  var PRECISIONS = { S: "SECOND", M: "MINUTE", D: "DAY" };

  /* ---- Zeit: America/New_York ohne Zeitzonen-Bibliothek ---------------
     US-Sommerzeit: ab 2007 zweiter Sonntag im Maerz bis erster Sonntag im
     November, 1987-2006 erster Sonntag im April bis letzter Sonntag im
     Oktober, jeweils 02:00 Ortszeit. EDGAR beginnt 1993. */
  function nthSunday(year, month, n) {          // month 0-based; n=-1: letzter
    if (n > 0) {
      var first = new Date(Date.UTC(year, month, 1)).getUTCDay();
      return 1 + ((7 - first) % 7) + 7 * (n - 1);
    }
    var lastDay = new Date(Date.UTC(year, month + 1, 0));
    return lastDay.getUTCDate() - lastDay.getUTCDay();
  }
  function isEasternDst(y, mo, d, h) {          // Ortszeit; mo 0-based
    var start, end;
    if (y >= 2007) { start = [2, nthSunday(y, 2, 2)]; end = [10, nthSunday(y, 10, 1)]; }
    else if (y >= 1987) { start = [3, nthSunday(y, 3, 1)]; end = [9, nthSunday(y, 9, -1)]; }
    else throw new RangeError("Eastern-Time-Regel vor 1987 nicht hinterlegt");
    var k = ((mo * 32 + d) * 24) + h;
    return k >= ((start[0] * 32 + start[1]) * 24 + 2) && k < ((end[0] * 32 + end[1]) * 24 + 1);
  }
  /** 'YYYY-MM-DD' + Ortszeit Eastern -> UTC-Millisekunden. */
  function easternToUtcMs(date, hh, mm, ss) {
    var y = +date.slice(0, 4), mo = +date.slice(5, 7) - 1, d = +date.slice(8, 10);
    var offset = isEasternDst(y, mo, d, hh) ? 4 : 5;
    return Date.UTC(y, mo, d, hh + offset, mm, ss);
  }

  /** asOf -> { cutoffMs, cutoff, basis }. */
  function cutoffOf(asOf) {
    if (typeof asOf !== "string") throw new TypeError("asOf muss ein ISO-String sein");
    if (/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      var ms = easternToUtcMs(asOf, 16, 0, 0);
      return { cutoffMs: ms, cutoff: new Date(ms).toISOString().replace(".000Z", "Z"), basis: "DATE_AT_MARKET_CLOSE_16_00_ET" };
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(asOf)) {
      throw new TypeError("asOf braucht eine Zeitzone (Z oder +hh:mm): " + asOf);
    }
    var t = Date.parse(asOf);
    return { cutoffMs: t, cutoff: new Date(t).toISOString().replace(".000Z", "Z"), basis: "EXACT_TIMESTAMP" };
  }

  function normalizeCik(value) {
    if (typeof value === "string" && /^iss_cik_\d{10}$/.test(value)) return value.slice(8);
    var s = String(value == null ? "" : value).trim();
    if (!/^\d{1,10}$/.test(s) || +s === 0) return null;
    return ("0000000000" + s).slice(-10);
  }
  function shardOf(cik) { return normalizeCik(cik).slice(-3); }

  function sicLevels(sic) {
    // Struktur des SIC-Codes selbst (Major Group = 2, Industry Group = 3 Stellen). Keine Korrelationsaussage.
    return sic ? { industry: sic, industryGroup: sic.slice(0, 3), majorGroup: sic.slice(0, 2) } : null;
  }

  /** Letzter Index mit knownAt <= cutoff (Beobachtungen sind nach knownAt sortiert). */
  function lastVisible(obs, cutoffMs) {
    var lo = 0, hi = obs.length - 1, at = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (Date.parse(obs[mid][0]) <= cutoffMs) { at = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return at;
  }

  function observation(row) {
    return {
      knownAt: row[0], sic: row[1], accession: row[2], form: row[3],
      source: SOURCES[row[4]] || row[4], precision: PRECISIONS[row[5]] || row[5], flag: row[6] || null
    };
  }

  /**
   * data: { issuers: { cik: record }, codes?: { code: { description } }, index?: index.json }
   * Die Datensaetze muessen dem Schema sic-history/1.0.0 entsprechen.
   */
  function create(data) {
    if (!data || typeof data.issuers !== "object") throw new TypeError("issuers fehlen");
    if (data.index && data.index.schemaVersion !== SCHEMA) throw new Error("Schema " + data.index.schemaVersion + " != " + SCHEMA);
    var issuers = data.issuers, codes = data.codes || {};
    var coverageEnd = data.index ? data.index.observedThrough || null : null;

    function describe(sic) { return sic && codes[sic] ? codes[sic].description : null; }

    /**
     * getIndustryClassification(cikOrIssuerId, asOf, { maxAgeDays, assumptionRef }) -> Ergebnis.
     * maxAgeDays ist eine Entscheidung des Aufrufers (keine Voreinstellung); ohne sie
     * wird nie STALE gemeldet, das Alter steht aber immer im Ergebnis. Ohne maxAgeDays
     * und assumptionRef ist carryForward.declared false: das Ergebnis ist dann eine
     * Messung (Coverage), keine Grundlage fuer eine historische Entscheidung.
     */
    function getIndustryClassification(cikOrIssuerId, asOf, opts) {
      opts = opts || {};
      var c = cutoffOf(asOf);
      var cik = normalizeCik(cikOrIssuerId);
      var declared = Number.isFinite(opts.maxAgeDays) && typeof opts.assumptionRef === "string" && opts.assumptionRef.trim() !== "";
      var base = { cik: cik, asOf: asOf, cutoff: c.cutoff, cutoffBasis: c.basis, datasetObservedThrough: coverageEnd,
        sic: null, sicDescription: null, levels: null, knownAt: null, ageDays: null, observation: null, interval: null,
        carryForward: { declared: declared, maxAgeDays: Number.isFinite(opts.maxAgeDays) ? opts.maxAgeDays : null, assumptionRef: declared ? opts.assumptionRef : null } };
      if (!cik) return Object.assign(base, { status: STATUS.IDENTITY_HOLD, reason: "INVALID_CIK" });
      var rec = issuers[cik];
      if (!rec || !rec.observations || !rec.observations.length) return Object.assign(base, { status: STATUS.UNKNOWN_NO_OBSERVATIONS });
      var obs = rec.observations, at = lastVisible(obs, c.cutoffMs);
      if (at < 0) {
        return Object.assign(base, { status: STATUS.UNKNOWN_BEFORE_FIRST_OBSERVATION, firstKnownAt: null });
      }
      var last = observation(obs[at]);
      // alle Beobachtungen am selben knownAt: ein Widerspruch macht das Ergebnis unbrauchbar
      var sameTime = [];
      for (var j = at; j >= 0 && obs[j][0] === last.knownAt; j--) sameTime.push(obs[j][1]);
      var conflict = last.flag === "CONFLICT" || sameTime.some(function (s) { return s !== last.sic; });
      // Beginn des sichtbaren Laufs gleicher SIC (nur Beobachtungen <= cutoff)
      var runStart = at;
      while (runStart > 0 && obs[runStart - 1][1] === last.sic) runStart--;
      var ageDays = (c.cutoffMs - Date.parse(last.knownAt)) / DAY_MS;
      var out = Object.assign(base, {
        sic: last.sic,
        sicDescription: describe(last.sic),
        levels: sicLevels(last.sic),
        knownAt: last.knownAt,
        ageDays: Math.round(ageDays * 1000) / 1000,
        evidence: "OBSERVED_AT_FILING",
        observation: last,
        provenance: { source: last.source, accession: last.accession, form: last.form, precision: last.precision, cik: cik },
        interval: {
          kind: "INFERRED_INTERVAL",
          observedFrom: obs[runStart][0],
          lastObservedAt: last.knownAt,
          observationsInRun: at - runStart + 1,
          validFrom: null,
          validTo: null,
          assumption: "SIC seit der letzten Beobachtung unveraendert; nicht belegt"
        },
        confidence: last.flag === "SUSPECT_WINDOW_CONSISTENT_WITH_PRIOR" ? "FSDS_SUSPECT_WINDOW_CONSISTENT" : last.source
      });
      if (conflict) return Object.assign(out, { status: STATUS.CONFLICT, sic: null, levels: null, sicDescription: null, conflictingSics: sameTime });
      if (Number.isFinite(opts.maxAgeDays) && ageDays > opts.maxAgeDays) return Object.assign(out, { status: STATUS.STALE, maxAgeDays: opts.maxAgeDays });
      return Object.assign(out, { status: last.sic ? STATUS.OBSERVED : STATUS.NO_SIC_ASSIGNED });
    }

    /**
     * Rueckblick (NICHT point-in-time): Laeufe gleicher SIC mit erster und letzter
     * Beobachtung und dem Wechselfenster dazwischen. Fuer Audit und Coverage,
     * nie fuer eine historische Entscheidung.
     */
    function history(cikOrIssuerId) {
      var cik = normalizeCik(cikOrIssuerId), rec = cik && issuers[cik];
      if (!rec) return null;
      return {
        cik: cik, view: "HINDSIGHT_AUDIT_ONLY", names: rec.names || [],
        runs: (rec.runs || []).map(function (r, i, all) {
          return { sic: r.sic, sicDescription: describe(r.sic), firstKnownAt: r.firstKnownAt, lastKnownAt: r.lastKnownAt,
            observations: r.n, firstAccession: r.firstAccession, lastAccession: r.lastAccession,
            changeWindowAfter: i < all.length - 1 ? { from: r.lastKnownAt, to: all[i + 1].firstKnownAt, kind: "UNKNOWN_CHANGE_TIME" } : null };
        })
      };
    }

    return { getIndustryClassification: getIndustryClassification, history: history, has: function (c) { return !!issuers[normalizeCik(c)]; } };
  }

  /**
   * Identitaet zum Zeitpunkt: aus Kandidaten eine CIK oder IDENTITY_HOLD.
   * candidates: [{ cik, evidence, validFrom?, validTo? }] - validFrom/validTo begrenzen,
   * wofuer die Zuordnung belegt ist (z. B. Listing-Fenster). Ohne Kandidat: NO_CIK.
   * Es wird nie ueber Namen oder Ticker geraten.
   */
  function resolveIssuer(candidates, asOf) {
    var list = (candidates || []).filter(function (x) { return x && normalizeCik(x.cik); });
    if (!list.length) return { status: STATUS.IDENTITY_HOLD, reason: "NO_CIK", cik: null };
    var day = asOf.slice(0, 10);
    var inWindow = list.filter(function (x) {
      return (!x.validFrom || day >= x.validFrom) && (!x.validTo || day <= x.validTo);
    });
    var ciks = Array.from(new Set(inWindow.map(function (x) { return normalizeCik(x.cik); })));
    if (!ciks.length) return { status: STATUS.IDENTITY_HOLD, reason: "OUTSIDE_EVIDENCED_WINDOW", cik: null };
    if (ciks.length > 1) return { status: STATUS.IDENTITY_HOLD, reason: "AMBIGUOUS_CIK", cik: null, candidates: ciks };
    var hit = inWindow.filter(function (x) { return normalizeCik(x.cik) === ciks[0]; })[0];
    return { status: "RESOLVED", cik: ciks[0], issuerId: "iss_cik_" + ciks[0], evidence: hit.evidence || null };
  }

  return {
    VERSION: VERSION,
    SCHEMA: SCHEMA,
    STATUS: STATUS,
    create: create,
    resolveIssuer: resolveIssuer,
    cutoffOf: cutoffOf,
    easternToUtcMs: easternToUtcMs,
    normalizeCik: normalizeCik,
    shardOf: shardOf,
    sicLevels: sicLevels
  };
});
