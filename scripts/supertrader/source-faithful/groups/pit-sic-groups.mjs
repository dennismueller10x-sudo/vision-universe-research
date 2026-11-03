/**
 * PIT-Branchengruppen je Wertpapier (FP-ST-03): SIC-Historie aus SEC EDGAR -> Intervalle je Emittent -> Abfrage
 * `sicAt(securityId, date)` mit Fama-French-49-, SIC2- und SIC3-Gruppe. Reine Funktionen, kein Netz, keine Strategie.
 *
 * Quelle der SIC: die hash-gepinnte PIT-SIC-Basis `quant/data/sec/sic-history` (Filing-Header `ASSIGNED-SIC` und FSDS
 * `sub.txt`, Erzeuger `scripts/quant/cli.py sic-history`, docs/HISTORICAL_SIC_PIT_REPORT.md) oder eine Stichprobe aus
 * Filing-Headern im selben Zeilenformat (`edgar_sample.py`). Jede Zeile ist
 *   [knownAt (UTC), sic | null, accession, form, source F|H, precision S|M|D, flag]
 * und belegt nur: "die SEC fuehrte zum Einreichungszeitpunkt diese SIC". Mehr wird nicht behauptet.
 *
 * Point in time (dieselben Regeln wie core/industry-classification.js, auf das diese Datei getestet gleich antwortet):
 *  1. Ein Intervall gilt ab dem ersten knownAt seines Zustands (validFrom) bis ausschliesslich zum ersten knownAt eines
 *     anderen Zustands (validTo). validTo ist Rueckblick: `sicAt` gibt es nie heraus (die Abfrage kennt die Zukunft nicht).
 *  2. Vor der ersten Beobachtung ist die SIC UNBEKANNT (UNKNOWN_BEFORE_FIRST_OBSERVATION). Die heutige SIC
 *     (data.sec.gov/submissions) wird nie in die Vergangenheit kopiert; der wahre Wechselzeitpunkt liegt irgendwo im
 *     Wechselfenster (priorLastObservedAt, validFrom] und ist nicht oeffentlich belegt (trueStartKnown: false).
 *  3. asOf als Datum endet um 16:00 America/New_York (core/industry-classification.js#cutoffOf).
 *  4. Die Fortschreibung seit der letzten Beobachtung ist eine Annahme: `sicAt` meldet ihr Alter; ein Gruppenschluessel
 *     fuer eine Entscheidung (`groupKeyAt`) verlangt maxAgeDays UND assumptionRef (keine Voreinstellung).
 *  5. Identitaet: securityId nur aus core/identity.js#securityIdForTicker; securityId -> CIK ueber Kandidaten mit
 *     Gueltigkeitsfenster und Evidenzklasse, aufgeloest mit core/industry-classification.js#resolveIssuer (mehrdeutig ->
 *     IDENTITY_HOLD, nie geraten).
 */
import { createRequire } from 'node:module';
import { createFf49, FF49_STATUS } from './ff49.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../../../core/industry-classification.js');
const Identity = require('../../../../core/identity.js');

export const PIT_SIC_GROUPS_VERSION = 'sf-pit-sic-groups-1.0.0';
export const PIT_SIC_GROUPS_SCHEMA = 'supertrader-pit-sic-groups/1.0.0';
const DAY_MS = 86400000;

export const SIC_STATE = Object.freeze({ SIC: 'SIC', NO_SIC_ASSIGNED: 'NO_SIC_ASSIGNED', CONFLICT: 'CONFLICT' });
export const STATUS = Object.freeze({
  OBSERVED: 'OBSERVED',
  NO_SIC_ASSIGNED: 'NO_SIC_ASSIGNED',
  CONFLICT: 'CONFLICT',
  STALE: 'STALE',
  UNKNOWN_BEFORE_FIRST_OBSERVATION: 'UNKNOWN_BEFORE_FIRST_OBSERVATION',
  UNKNOWN_NO_OBSERVATIONS: 'UNKNOWN_NO_OBSERVATIONS',
  IDENTITY_HOLD: 'IDENTITY_HOLD',
});
export const SCHEMES = Object.freeze(['FF49', 'SIC2', 'SIC3', 'SIC4']);
export const IDENTITY_EVIDENCE = Object.freeze({
  /** heutige SEC-Tickerliste (quant/data/universe), angenommen ab firstTradeDate; keine historische Bestaetigung */
  CURRENT_TICKER_MAPPING_ASSUMED_SINCE_FIRST_TRADE: 'CURRENT_TICKER_MAPPING_ASSUMED_SINCE_FIRST_TRADE',
  /** Snapshot sec-pit `how = KNOWN` (heutige Zuordnung, ohne Fensterpruefung) */
  CURRENT_TICKER_MAPPING: 'CURRENT_TICKER_MAPPING',
  /** Snapshot sec-pit `how = NAME_MATCH` (exakter Name, genau ein Kandidat mit XBRL im Listing-Fenster) */
  NAME_EXACT_XBRL_IN_LISTING_WINDOW: 'NAME_EXACT_XBRL_IN_LISTING_WINDOW',
  UNSPECIFIED: 'UNSPECIFIED',
});

class ModelAssumptionRequired extends Error {
  constructor(message) { super(message); this.code = 'MODEL_ASSUMPTION_REQUIRED'; }
}

/**
 * Beobachtungen eines Emittenten (sortiert nach knownAt, Format sic-history/1.0.0) -> PIT-Intervalle.
 * Je knownAt zaehlt die letzte Zeile (wie core/industry-classification.js#lastVisible); ein CONFLICT-Flag oder
 * verschiedene SIC am selben knownAt ergeben den Zustand CONFLICT.
 */
export function deriveIntervals(observations) {
  const rows = [...(observations || [])];
  for (let i = 1; i < rows.length; i++) if (rows[i][0] < rows[i - 1][0]) throw new Error('OBSERVATIONS_NOT_SORTED');
  const points = [];
  for (let i = 0; i < rows.length; i++) {
    const at = rows[i][0];
    if (i + 1 < rows.length && rows[i + 1][0] === at) continue; // erst die letzte Zeile je knownAt
    let j = i;
    const sics = new Set();
    while (j >= 0 && rows[j][0] === at) { sics.add(rows[j][1] ?? null); j--; }
    const last = rows[i];
    const conflict = last[6] === 'CONFLICT' || sics.size > 1;
    const state = conflict ? SIC_STATE.CONFLICT : last[1] ? SIC_STATE.SIC : SIC_STATE.NO_SIC_ASSIGNED;
    points.push({ at, state, sic: conflict ? null : last[1] || null, accession: last[2], form: last[3], source: last[4], precision: last[5], flag: last[6] || null, conflicting: conflict ? [...sics] : null });
  }
  const intervals = [];
  for (const p of points) {
    const prev = intervals.at(-1);
    if (prev && prev.state === p.state && prev.sic === p.sic) { prev.observedAt.push(p.at); prev.lastAccession = p.accession; continue; }
    if (prev) prev.validTo = p.at;
    intervals.push({
      state: p.state, sic: p.sic, validFrom: p.at, validTo: null,
      trueStartKnown: false,
      start: prev ? 'OBSERVED_CHANGE' : 'FIRST_OBSERVATION',
      priorLastObservedAt: prev ? prev.observedAt.at(-1) : null,
      firstAccession: p.accession, firstForm: p.form, firstSource: p.source, firstPrecision: p.precision,
      lastAccession: p.accession,
      ...(p.conflicting ? { conflictingSics: p.conflicting } : {}),
      observedAt: [p.at],
    });
  }
  return intervals;
}

/** Wertpapierstamm-Instrumente -> CIK-Kandidaten je securityId (Identitaet nur ueber core/identity.js). */
export function identityFromInstruments(instruments) {
  const bySecurity = new Map();
  const rejected = { NO_CIK: 0, INVALID_TICKER: 0, LEGACY_ID_MISMATCH: 0 };
  for (const x of instruments || []) {
    const cik = IC.normalizeCik(x?.cik);
    if (!cik) { rejected.NO_CIK++; continue; }
    let securityId;
    try { securityId = Identity.securityIdForTicker(x.symbol); } catch { rejected.INVALID_TICKER++; continue; }
    // Der Wertpapierstamm fuehrt die alte Bildung als legacyIds; eine Abweichung waere eine zweite Identitaet (ADR-001).
    if (Array.isArray(x.legacyIds) && x.legacyIds.length && !x.legacyIds.includes(securityId)) { rejected.LEGACY_ID_MISMATCH++; continue; }
    const list = bySecurity.get(securityId) || [];
    list.push({
      cik, evidence: IDENTITY_EVIDENCE.CURRENT_TICKER_MAPPING_ASSUMED_SINCE_FIRST_TRADE,
      validFrom: x.firstTradeDate || null, validTo: x.delistedAt || x.lastTradeDate || null,
      source: 'quant/data/universe/instruments', instrumentId: x.instrumentId || null, exchange: x.exchange || null, securityType: x.securityType || null,
    });
    bySecurity.set(securityId, list);
  }
  for (const list of bySecurity.values()) list.sort((a, b) => (a.cik < b.cik ? -1 : a.cik > b.cik ? 1 : String(a.validFrom).localeCompare(String(b.validFrom))));
  return { bySecurity, rejected };
}

/** Datensatz zusammensetzen (vom Erzeuger geschrieben, von createPitSicSource gelesen). */
export function buildDataset({ issuers, identity, sources, generatedFrom }) {
  const outIssuers = {};
  for (const cik of Object.keys(issuers).sort()) {
    const rec = issuers[cik];
    outIssuers[cik] = { names: rec.names || [], intervals: deriveIntervals(rec.observations) };
  }
  const securities = {};
  for (const id of [...identity.keys()].sort()) securities[id] = identity.get(id);
  return { schema: PIT_SIC_GROUPS_SCHEMA, version: PIT_SIC_GROUPS_VERSION, generatedFrom: generatedFrom ?? null, sources: sources ?? {}, securities, issuers: outIssuers };
}

/**
 * Abfrage auf einem Datensatz. ff49Table: Inhalt von ff49-siccodes.json.
 * sicAt(securityId, date, { maxAgeDays?, assumptionRef?, acceptedIdentityEvidence? }) -> Ergebnis (nie validTo).
 */
export function createPitSicSource(dataset, ff49Table) {
  if (!dataset || dataset.schema !== PIT_SIC_GROUPS_SCHEMA) throw new Error('PIT_SIC_GROUPS_SCHEMA_MISMATCH');
  const ff49 = createFf49(ff49Table);
  const issuers = dataset.issuers || {}, securities = dataset.securities || {};

  function lastIntervalAtOrBefore(list, cutoffMs) {
    let lo = 0, hi = list.length - 1, at = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (Date.parse(list[mid].validFrom) <= cutoffMs) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    return at;
  }
  function lastObservedAtOrBefore(obs, cutoffMs) {
    let lo = 0, hi = obs.length - 1, at = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (Date.parse(obs[mid]) <= cutoffMs) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    return obs[at];
  }

  function sicAt(securityId, date, opts = {}) {
    const c = IC.cutoffOf(date);
    const declared = Number.isFinite(opts.maxAgeDays) && typeof opts.assumptionRef === 'string' && opts.assumptionRef.trim() !== '';
    const base = {
      securityId, asOf: date, cutoff: c.cutoff, cutoffBasis: c.basis, cik: null, identityEvidence: null,
      sic: null, sic2: null, sic3: null, ff49: null, ff49Status: null, knownAt: null, ageDays: null, interval: null,
      carryForward: { declared, maxAgeDays: Number.isFinite(opts.maxAgeDays) ? opts.maxAgeDays : null, assumptionRef: declared ? opts.assumptionRef : null },
    };
    if (!Identity.isSecurityId(securityId)) return { ...base, status: STATUS.IDENTITY_HOLD, reason: 'INVALID_SECURITY_ID' };
    const all = securities[securityId] || [];
    const accepted = Array.isArray(opts.acceptedIdentityEvidence) ? new Set(opts.acceptedIdentityEvidence) : null;
    const usable = accepted ? all.filter((x) => accepted.has(x.evidence)) : all;
    if (all.length && !usable.length) return { ...base, status: STATUS.IDENTITY_HOLD, reason: 'IDENTITY_EVIDENCE_NOT_ACCEPTED' };
    const who = IC.resolveIssuer(usable, date);
    if (who.status !== 'RESOLVED') return { ...base, status: STATUS.IDENTITY_HOLD, reason: who.reason, ...(who.candidates ? { candidates: who.candidates } : {}) };
    const out = { ...base, cik: who.cik, identityEvidence: who.evidence };
    const rec = issuers[who.cik];
    if (!rec || !rec.intervals?.length) return { ...out, status: STATUS.UNKNOWN_NO_OBSERVATIONS };
    const k = lastIntervalAtOrBefore(rec.intervals, c.cutoffMs);
    if (k < 0) return { ...out, status: STATUS.UNKNOWN_BEFORE_FIRST_OBSERVATION };
    const iv = rec.intervals[k];
    const knownAt = lastObservedAtOrBefore(iv.observedAt, c.cutoffMs);
    const ageDays = Math.round(((c.cutoffMs - Date.parse(knownAt)) / DAY_MS) * 1000) / 1000;
    const f = ff49.of(iv.sic);
    const res = {
      ...out,
      sic: iv.sic, sic2: iv.sic ? iv.sic.slice(0, 2) : null, sic3: iv.sic ? iv.sic.slice(0, 3) : null,
      ff49: f.industry, ff49Status: f.status, knownAt, ageDays,
      interval: { validFrom: iv.validFrom, lastObservedAt: knownAt, validTo: null, openAsOf: true, start: iv.start, trueStartKnown: false, priorLastObservedAt: iv.priorLastObservedAt },
    };
    if (iv.state === SIC_STATE.CONFLICT) return { ...res, status: STATUS.CONFLICT, sic: null, sic2: null, sic3: null, ff49: null, ff49Status: FF49_STATUS.NO_SIC, conflictingSics: iv.conflictingSics || null };
    if (Number.isFinite(opts.maxAgeDays) && ageDays > opts.maxAgeDays) return { ...res, status: STATUS.STALE };
    return { ...res, status: iv.state === SIC_STATE.SIC ? STATUS.OBSERVED : STATUS.NO_SIC_ASSIGNED };
  }

  /**
   * Gruppenschluessel fuer eine (spaetere, vom Owner freigegebene) Verwendung: 'FF49:13', 'SIC3:283' ... oder null mit
   * Grund. Verlangt die deklarierte Fortschreibung; unbekannt heisst unbekannt, nie unabhaengig.
   */
  function groupKeyAt(securityId, date, scheme, opts = {}) {
    if (!SCHEMES.includes(scheme)) throw new ModelAssumptionRequired('unbekanntes Gruppenschema: ' + scheme);
    if (!Number.isFinite(opts.maxAgeDays) || !(typeof opts.assumptionRef === 'string' && opts.assumptionRef.trim())) {
      throw new ModelAssumptionRequired('groupKeyAt verlangt maxAgeDays und assumptionRef (deklarierte Fortschreibung)');
    }
    const r = sicAt(securityId, date, opts);
    if (r.status !== STATUS.OBSERVED) return { key: null, reason: r.reason ? `${r.status}:${r.reason}` : r.status, result: r };
    if (scheme === 'FF49') return r.ff49 ? { key: `FF49:${r.ff49.id}`, result: r } : { key: null, reason: 'FF49_' + r.ff49Status, result: r };
    const key = scheme === 'SIC2' ? r.sic2 : scheme === 'SIC3' ? r.sic3 : r.sic;
    return { key: `${scheme}:${key}`, result: r };
  }

  /** Rueckblick (NICHT point-in-time) fuer Audit und Coverage. */
  function history(securityId) {
    const ids = (securities[securityId] || []).map((x) => x.cik);
    return { securityId, view: 'HINDSIGHT_AUDIT_ONLY', issuers: [...new Set(ids)].map((cik) => ({ cik, intervals: (issuers[cik]?.intervals || []).map(({ observedAt, ...iv }) => ({ ...iv, observations: observedAt.length, ff49: ff49.of(iv.sic).industry })) })) };
  }

  /** Zaehlung je Status ueber Wertpapiere x Stichtage (nur Tage im Identitaetsfenster). */
  function coverage(ids, dates, opts = {}) {
    const byStatus = {}, byFf49Status = {}, byYear = {};
    let points = 0;
    for (const id of ids) {
      const windows = securities[id] || [];
      for (const d of dates) {
        if (windows.length && !windows.some((w) => (!w.validFrom || d >= w.validFrom) && (!w.validTo || d <= w.validTo))) continue;
        const r = sicAt(id, d, opts);
        points++;
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        if (r.status === STATUS.OBSERVED) byFf49Status[r.ff49Status] = (byFf49Status[r.ff49Status] || 0) + 1;
        const y = d.slice(0, 4), b = (byYear[y] ||= { points: 0, observed: 0 });
        b.points++; if (r.status === STATUS.OBSERVED) b.observed++;
      }
    }
    return { points, byStatus, observedByFf49Status: byFf49Status, byYear };
  }

  return { sicAt, groupKeyAt, history, coverage, securityIds: () => Object.keys(securities), version: PIT_SIC_GROUPS_VERSION };
}
