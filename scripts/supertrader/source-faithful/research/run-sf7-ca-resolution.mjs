#!/usr/bin/env node
/**
 * Supertrader 7.0 – V4-D1 resolution run (owner decision E1) on the frozen research snapshot with research-v1.
 *  1. BASE: the 11 measurable references (run-sf6-integrity.mjs INTEGRITY_LIFECYCLES, unchanged) on the research dataset
 *     exactly as 6.0 read it; on the authoritative snapshot their ledger / trade hashes are compared with 6.0
 *     (completion/sf6-run-facts.mjs) – the regression proof;
 *  2. candidates: every DQ-K3 flag (superset of DQ-K5) of integrity/discontinuity.mjs, with research-universe membership
 *     and reference exposure (a BASE trade whose 400-day look-back or holding period contains the session);
 *  3. classification (integrity/ca-resolution.mjs) from the snapshot Tiingo fields and the SEC share counts of the
 *     existing private artifact _validation/sec-pit-r13.json.gz (read once, SHA-256 recorded). Only reference-exposed
 *     candidates that pass every share test of a genuine move get ONE request of the public EDGAR submissions index of
 *     the issuer (budget --sec-fetch-max, default 0 = none); everything else stays UNRESOLVED. --sec-shares r14 reads
 *     _validation/sec-pit-r14.json.gz instead (adds balance-sheet share counts; r12 / r13 unchanged);
 *  4. a generated, hashed overlay manifest (integrity/ca-overlay.mjs) of the CONFIRMED_UNDECLARED_SPLIT sessions and
 *     (1.1.0) the CONFIRMED_MISDATED_DECLARED_SPLIT pairs (the provider's factor moved to the jump session);
 *  5. the references again on CA (overlay), CA-Q-K5 (overlay + quarantine of the UNRESOLVED DQ-K5 sessions, BOOK) and
 *     CA-Q-K3 (UNRESOLVED DQ-K3 sessions), each reconciled (ledger replay) and compared trade by trade with BASE.
 *  - public (repository log): counts per class and reason, exposure counts, trade counts and comparisons, hashes;
 *  - sealed (owner key): the classified sessions (segment ids, dates, evidence), the overlay manifest, metrics.
 * DIAGNOSTIC_NOT_CERTIFIED. The overlay is a research-dataset transform; quant/data and the snapshot stay unchanged.
 *
 *   node scripts/supertrader/source-faithful/research/run-sf7-ca-resolution.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--sec-fetch-max 150] [--lifecycles TURTLE_S1,...] [--limit 400 --smoke-snapshot]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { computeDiagnosticMetrics } from '../runner/metrics.mjs';
import { FOUNDATION } from '../contract.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { INTEGRITY_LIFECYCLES, INTEGRITY_KEYS, SPLIT_PERIODS } from './run-sf6-integrity.mjs';
import { flagDiscontinuities, describeFlag, compareTrades, EXPOSURE_LOOKBACK_DAYS, DQ_POLICIES } from '../integrity/discontinuity.mjs';
import { classifyFlag, filingEvidence, CLASSES, CA_RESOLUTION_VERSION, TOLERANCES, STANDARD_RATIOS, rulesetSha256 } from '../integrity/ca-resolution.mjs';
import { classifyFlag as classifyFlagV100, CLASSES as CLASSES_V100 } from '../integrity/ca-resolution-1.0.0.mjs';
import { buildOverlayManifest, correctedDataset, quarantineUnresolved, CA_OVERLAY_VERSION } from '../integrity/ca-overlay.mjs';
import { SF6_RUN_FACTS } from '../completion/sf6-run-facts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF7_CA_RUNNER_VERSION = 'sf7-ca-resolution-runner-1.1.0';
const SEC_PIT_KEY = '_validation/sec-pit-r12.json.gz'; // Minervini fundamentals exactly as 6.0 (BASE identity)
// share counts (evidence only, never attached to a security): r13 (dei, fallback weighted diluted) or r14 (+ balance sheet)
export const SEC_SHARES_KEYS = Object.freeze({ r13: '_validation/sec-pit-r13.json.gz', r14: '_validation/sec-pit-r14.json.gz' });
const FILES = ['../integrity/discontinuity.mjs', '../integrity/ca-resolution.mjs', '../integrity/ca-resolution-1.0.0.mjs', '../integrity/ca-overlay.mjs', 'run-sf7-ca-resolution.mjs'];
export function caCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});
const inc = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };
const addDaysIso = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const listingOf = (id) => String(id).split('#')[0];
export const DATASETS = Object.freeze(['CA', 'CA-Q-K5', 'CA-Q-K3']);
const K5 = 5, K3 = 3;

function runAll(ds, tag, lcs, { from, to, log }) {
  const out = {};
  for (const lc of lcs) {
    const x = lc.run(ds, { from, to });
    if (!x.run.reconciliation.pass) throw new Error(`RECONCILIATION_FAILED:${lc.key}:${tag}`);
    const metrics = computeDiagnosticMetrics({ curve: x.run.curve, trades: x.metricTrades, ledger: x.run.ledger, costs: x.run.counts.costs, spyTR: ds.spyTR, splitPeriods: SPLIT_PERIODS, initialCapital: 100000 });
    out[lc.key] = { trades: x.trades, metrics, pub: { trades: x.trades.length, closed: x.trades.filter((t) => t.status === 'CLOSED').length, exitReasons: tally(x.trades, (t) => t.exitReason), reconciliation: x.run.reconciliation.pass, ledgerSha256: sha(x.run.ledger), tradesSha256: sha(x.trades.map((t) => [t.id, t.entryDate, t.exitDate, t.exitReason, t.shares])) } };
    log(`${tag} ${lc.key}: trades ${x.trades.length}`);
  }
  return out;
}

/** Reference keys whose BASE trades are directly exposed to (listing, date), and those holding across it. */
function exposureIndex(base, keys, dataEnd) {
  const idx = new Map();
  for (const k of keys) for (const t of base[k].trades) {
    const id = listingOf(t.id); if (!idx.has(id)) idx.set(id, []);
    idx.get(id).push({ k, lo: addDaysIso(t.entryDate, -EXPOSURE_LOOKBACK_DAYS), entry: t.entryDate, hi: t.exitDate ?? dataEnd });
  }
  return (listing, d) => {
    const ex = new Set(), held = new Set();
    for (const w of idx.get(listing) || []) { if (d >= w.lo && d <= w.hi) ex.add(w.k); if (d > w.entry && d <= w.hi) held.add(w.k); }
    return { exposedRefs: [...ex].sort(), heldRefs: [...held].sort() };
  };
}

/**
 * Pure part (async only for the optional filing lookup). segs are the raw snapshot segments in dataset order
 * (datasetFromPit), sharesByListing maps a listing id to { cik, how, taxonomy, shares } of sec-pit-r13,
 * listingPeriods a listing id to { startDate, listEnd }. fetchFilings(cik) returns an EDGAR submissions index or null.
 */
export async function caResolutionPart(baseDs, segs, { sharesByListing = new Map(), listingPeriods = new Map(), fetchFilings = null, secFetchMax = 0, keys = INTEGRITY_KEYS, from = L.WINDOW.from, to = L.WINDOW.to, dataEnd = L.WINDOW.to, snapshotId = null, evidenceInputs = {}, refine = null, classifierVersion = CA_RESOLUTION_VERSION, rulesetSha256Value = null, log = () => {} } = {}) {
  if (segs.length !== baseDs.securities.length || segs.some((s, j) => s.id !== baseDs.securities[j].id)) throw new Error('SEGMENT_ORDER_MISMATCH');
  const lcs = INTEGRITY_LIFECYCLES.filter((l) => keys.includes(l.key));
  const pub = { version: classifierVersion, overlayVersion: CA_OVERLAY_VERSION, runner: SF7_CA_RUNNER_VERSION, certification: 'DIAGNOSTIC_NOT_CERTIFIED', tolerances: TOLERANCES, standardRatios: STANDARD_RATIOS, rulesetSha256: rulesetSha256Value ?? rulesetSha256(), exposureLookbackDays: EXPOSURE_LOOKBACK_DAYS, window: { from, to }, lifecycles: {} };
  const sealed = { label: 'DIAGNOSTIC_METRICS_NOT_A_STRATEGY_RETURN', classified: [], lifecycles: {} };

  // 1. BASE
  const base = runAll(baseDs, 'BASE', lcs, { from, to, log });
  for (const lc of lcs) { pub.lifecycles[lc.key] = { candidateId: lc.candidateId, BASE: base[lc.key].pub }; sealed.lifecycles[lc.key] = { BASE: { metrics: base[lc.key].metrics } }; }

  // 2. candidates (every DQ-K3 flag) with exposure and universe membership
  const exposure = exposureIndex(base, lcs.map((l) => l.key), dataEnd);
  const cikListings = new Map();
  for (const [id, v] of sharesByListing) if (v?.cik) { if (!cikListings.has(v.cik)) cikListings.set(v.cik, []); cikListings.get(v.cik).push(id); }
  const cands = [], flagsBySec = baseDs.securities.map((s) => flagDiscontinuities(s.bars, K3));
  // review L3: the other flags of a session are those of its LISTING (all '#n' segments), not only of its segment
  const datesByListing = new Map();
  baseDs.securities.forEach((s, j) => { if (!flagsBySec[j].length) return; const l = listingOf(s.id); if (!datesByListing.has(l)) datesByListing.set(l, []); datesByListing.get(l).push(...flagsBySec[j].map((i) => s.bars[i].date)); });
  baseDs.securities.forEach((s, j) => {
    const flags = flagsBySec[j]; if (!flags.length) return;
    const listing = listingOf(s.id), dates = [...new Set(datesByListing.get(listing))].sort();
    for (const i of flags) {
      const f = describeFlag(s.bars, i, K3), r = f.ratio, level = r >= K5 || r <= 1 / K5 ? 'K5' : 'K3';
      cands.push({ j, i, segmentId: s.id, listing, date: f.date, ratio: r, level, direction: f.direction, kind: f.kind, priorRawCloseBand: f.priorRawCloseBand, universe: f.researchUniverseAtPriorSession, otherFlagDates: dates, ...exposure(listing, f.date) });
    }
  });
  log(`candidates: ${cands.length} DQ-K3 flags (${cands.filter((c) => c.level === 'K5').length} DQ-K5)`);

  // 3. classification; the filing check (one EDGAR index request per issuer, budget secFetchMax) for every split
  //    candidate that passed all share tests and for reference-exposed genuine candidates (K5 first)
  const identityOf = (c) => {
    const sec = sharesByListing.get(c.listing);
    const shared = !!sec?.cik && (cikListings.get(sec.cik) || []).some((other) => {
      if (other === c.listing) return false;
      const p = listingPeriods.get(other); if (!p) return true; // unknown period of a co-mapped listing: ambiguous
      return p.startDate <= c.date && (!p.listEnd || p.listEnd >= c.date);
    });
    return { sec, identity: { cikSharedAtSession: shared, instrumentClass: segs[c.j].cls || null } };
  };
  const filingCache = new Map(); let requests = 0, requestsOk = 0;
  const classify = (c, filings) => { const { sec, identity } = identityOf(c); return classifyFlag({ raw: segs[c.j].raw, bars: baseDs.securities[c.j].bars, i: c.i, sec, identity, otherFlagDates: c.otherFlagDates, filings }); };
  const pending = [];
  for (const c of cands) { c.result = classify(c); if (c.result.stage === 'NEEDS_FILING_CHECK') pending.push(c); }
  const rank = (c) => (c.result.pendingClass === CLASSES.SPLIT ? 0 : c.level === 'K5' ? 1 : 2);
  const order = pending.filter((c) => c.result.pendingClass === CLASSES.SPLIT || c.exposedRefs.length).sort((a, b) => rank(a) - rank(b) || b.exposedRefs.length - a.exposedRefs.length || (a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : a.date.localeCompare(b.date)));
  for (const c of order) {
    const cik = sharesByListing.get(c.listing).cik;
    if (!filingCache.has(cik)) {
      if (!fetchFilings || requests >= secFetchMax) continue;
      requests++; let sub = null;
      try { sub = await fetchFilings(cik); } catch { sub = null; }
      if (sub) requestsOk++;
      filingCache.set(cik, sub);
    }
    c.result = classify(c, filingEvidence(filingCache.get(cik), c.date));
  }
  for (const c of pending) if (c.result.stage === 'NEEDS_FILING_CHECK') c.result = { cls: CLASSES.UNRESOLVED, reason: c.result.pendingClass === CLASSES.SPLIT || c.exposedRefs.length ? 'FILING_CHECK_BUDGET_EXHAUSTED' : 'FILING_CHECK_NOT_RUN_NO_REFERENCE_EXPOSURE', evidence: c.result.evidence };
  log(`classified; filing lookups ${requests} (${requestsOk} ok)`);
  // review HIGH-1 before/after: the 1.0.0 split rule on the same inputs (only its dei rows), against the 1.1.0 class
  for (const c of cands) { const { sec, identity } = identityOf(c); const o = classifyFlagV100({ raw: segs[c.j].raw, bars: baseDs.securities[c.j].bars, i: c.i, sec: sec ? { ...sec, shares: (sec.shares || []).filter((r) => r[3] !== 'bs') } : null, identity, otherFlagDates: c.otherFlagDates.filter((x) => baseDs.securities[c.j].bars.some((b) => b.date === x)) }); c.v100 = o.cls === CLASSES_V100.SPLIT ? o.label : null; }

  // optional refinement after the unchanged classification (run-sf7-ca-edgar.mjs, rule set 1.4.0): it may replace
  // c.result of candidates; census, overlay, quarantine and the reference runs below then use the refined results.
  // Without it (the sf7-ca-resolution mode) nothing changes.
  if (refine) { const x = await refine({ cands, identityOf, segs, baseDs, sharesByListing, snapshotId, evidenceInputs, log }); pub.refine = x.pub; sealed.refine = x.sealed; }

  // public census (counts only)
  const census = {};
  for (const level of ['K5', 'K3']) {
    const rows = cands.filter((c) => level === 'K3' || c.level === 'K5');
    const block = (xs) => ({ flags: xs.length, byClass: tally(xs, (c) => c.result.cls), byReason: tally(xs, (c) => c.result.reason), securities: new Set(xs.map((c) => c.segmentId)).size });
    census[`DQ-${level}`] = { ...block(rows), byClassDirection: tally(rows, (c) => `${c.result.cls}|${c.direction}`), byClassPriorRawCloseBand: tally(rows, (c) => `${c.result.cls}|${c.priorRawCloseBand}`), byKind: tally(rows, (c) => c.kind), splitFactors: tally(rows.filter((c) => c.result.cls === CLASSES.SPLIT), (c) => c.result.label), misdatedFactors: tally(rows.filter((c) => c.result.cls === CLASSES.MISDATED), (c) => c.result.label), misdatedSecCorroborated: rows.filter((c) => c.result.cls === CLASSES.MISDATED && c.result.evidence?.secCorroborates).length, shareSourcesUsed: tally(rows.filter((c) => c.result.evidence?.sharesBeforeAsOf), (c) => `${c.result.evidence.sharesBeforeSource ?? '?'}>${c.result.evidence.sharesAfterSource ?? '?'}`), secMapping: tally(rows, (c) => sharesByListing.get(c.listing)?.how ?? 'NONE'),
      researchUniverseAtPriorSession: block(rows.filter((c) => c.universe)), referenceExposed: block(rows.filter((c) => c.exposedRefs.length)), heldAcrossByReference: block(rows.filter((c) => c.heldRefs.length)),
      e1Candidates: block(rows.filter((c) => c.universe || c.exposedRefs.length)) };
  }
  pub.census = census;
  pub.v100SplitsNow = tally(cands.filter((c) => c.v100), (c) => `${c.v100} -> ${c.result.cls}${c.result.label ? ' ' + c.result.label : ''} (${c.result.reason})`);
  // review MEDIUM-3: the EDGAR index is live and not reproducible: the entries that were read are sealed (owner only)
  sealed.filingIndex = Object.fromEntries([...filingCache].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  pub.secEvidence = { listingsWithShares: sharesByListing.size, filingLookups: requests, filingLookupsOk: requestsOk, filingLookupBudget: secFetchMax, filingIndexSha256: sha([...filingCache].sort((a, b) => (a[0] < b[0] ? -1 : 1))) };
  sealed.classified = cands.map((c) => ({ segmentId: c.segmentId, date: c.date, ratio: c.ratio, level: c.level, direction: c.direction, kind: c.kind, universe: c.universe, exposedRefs: c.exposedRefs, heldRefs: c.heldRefs, cik: sharesByListing.get(c.listing)?.cik ?? null, cls: c.result.cls, reason: c.result.reason, factor: c.result.factor ?? null, label: c.result.label ?? null, evidence: c.result.evidence }));

  // 4. overlay manifest (generated) and corrected dataset
  const manifest = buildOverlayManifest(cands.map((c) => ({ ...c.result, segmentId: c.segmentId, date: c.date })), { snapshotId, classifierVersion, evidenceInputs });
  const ca = correctedDataset(baseDs, segs, manifest);
  for (const e of manifest.entries) {
    const s = ca.ds.securities.find((x) => x.id === e.segmentId), fl = new Set(flagDiscontinuities(s.bars, K3));
    for (const d of [e.date, e.moveFromDate].filter(Boolean)) if (fl.has(s.bars.findIndex((b) => b.date === d))) throw new Error('CA_OVERLAY_SESSION_STILL_FLAGGED');
  }
  pub.overlay = { entries: manifest.entries.length, byKind: tally(manifest.entries, (e) => e.kind), patchedSegments: ca.patchedSegments, manifestSha256: manifest.manifestSha256, unchangedSecurities: ca.ds.securities.filter((s, j) => s === baseDs.securities[j]).length, securities: ca.ds.securities.length };
  log(`overlay: ${manifest.entries.length} sessions in ${ca.patchedSegments} segments, manifest ${manifest.manifestSha256.slice(0, 12)}`);

  // 5. CA, CA-Q-K5, CA-Q-K3
  const unresolvedDates = (level) => { const m = new Map(); for (const c of cands) if (c.result.cls === CLASSES.UNRESOLVED && (level === 'K3' || c.level === 'K5')) { if (!m.has(c.segmentId)) m.set(c.segmentId, []); m.get(c.segmentId).push(c.date); } return m; };
  const datasets = {
    CA: { ds: ca.ds, events: cands.filter((c) => c.result.cls === CLASSES.SPLIT || c.result.cls === CLASSES.MISDATED), quarantine: null },
    'CA-Q-K5': { ...(() => { const q = quarantineUnresolved(ca.ds, unresolvedDates('K5'), { ...DQ_POLICIES['DQ-K5-BOOK'], id: 'CA-Q-K5' }); return { ds: q.ds, quarantine: { cuts: q.cuts, droppedBars: q.droppedBars, pieces: q.ds.securities.length } }; })(), events: cands.filter((c) => c.level === 'K5' && c.result.cls !== CLASSES.GENUINE) },
    'CA-Q-K3': { ...(() => { const q = quarantineUnresolved(ca.ds, unresolvedDates('K3'), { ...DQ_POLICIES['DQ-K3-BOOK'], id: 'CA-Q-K3' }); return { ds: q.ds, quarantine: { cuts: q.cuts, droppedBars: q.droppedBars, pieces: q.ds.securities.length } }; })(), events: cands.filter((c) => c.result.cls !== CLASSES.GENUINE) },
  };
  pub.datasets = Object.fromEntries(Object.entries(datasets).map(([k, v]) => [k, { quarantine: v.quarantine, comparisonEvents: v.events.length }]));
  for (const [tag, x] of Object.entries(datasets)) {
    const res = runAll(x.ds, tag, lcs, { from, to, log });
    const events = x.events.map((c) => ({ securityId: c.segmentId, date: c.date }));
    for (const lc of lcs) {
      const cmp = compareTrades(base[lc.key].trades, res[lc.key].trades, events, { dataEnd });
      pub.lifecycles[lc.key][tag] = { ...res[lc.key].pub, comparisonWithBase: cmp.public };
      sealed.lifecycles[lc.key][tag] = { metrics: res[lc.key].metrics, exposedBaseTradeKeys: cmp.sealedExposedKeys };
    }
  }

  // CC-5 view per reference: every flagged session behind a BASE trade must be CONFIRMED_* (E1)
  for (const lc of lcs) {
    const v = {};
    for (const level of ['K5', 'K3']) {
      const rows = cands.filter((c) => c.exposedRefs.includes(lc.key) && (level === 'K3' || c.level === 'K5'));
      v[`DQ-${level}`] = { exposedFlags: rows.length, byClass: tally(rows, (c) => c.result.cls), heldAcross: rows.filter((c) => c.heldRefs.includes(lc.key)).length, allConfirmed: rows.every((c) => c.result.cls !== CLASSES.UNRESOLVED) };
    }
    pub.lifecycles[lc.key].exposure = v;
  }
  return { pub, sealed, manifest };
}

/** FETCH_TIMEOUT_MS: one EDGAR index request; a hung connection ends as a missing index (UNRESOLVED), never a wait. */
export const FETCH_TIMEOUT_MS = 30000;
/** One request of the EDGAR submissions index (recent page only), polite delay, timeout; null on any failure. */
export async function fetchSubmissions(cik, { userAgent, fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, delayMs = 150 } = {}) {
  if (delayMs) await new Promise((res) => setTimeout(res, delayMs));
  try {
    const r = await fetchImpl(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const j = await r.json(), rec = j?.filings?.recent || {};
    return { form: [...(rec.form || [])], filingDate: [...(rec.filingDate || [])], items: [...(rec.items || [])] };
  } catch { return null; }
}

/** BASE vs the authoritative 6.0 facts (hash by hash). */
export function compareWithSf6(pubLifecycles) {
  const out = {};
  for (const [k, v] of Object.entries(pubLifecycles)) {
    const ledger = SF6_RUN_FACTS.integrity?.baseMatchesAuthoritative?.[k]?.ledgerSha256Value ?? null, trades = SF6_RUN_FACTS.integrity?.lifecycles?.[k]?.BASE?.tradesSha256 ?? null, n = SF6_RUN_FACTS.integrity?.lifecycles?.[k]?.BASE?.trades ?? null;
    out[k] = { ledgerSha256: ledger === null ? 'NOT_RECORDED' : ledger === v.BASE.ledgerSha256 ? 'EQUAL' : 'DIFFERENT', tradesSha256: trades === null ? 'NOT_RECORDED' : trades === v.BASE.tradesSha256 ? 'EQUAL' : 'DIFFERENT', trades: n === null ? 'NOT_RECORDED' : n === v.BASE.trades ? 'EQUAL' : 'DIFFERENT' };
  }
  out.allEqual = Object.values(out).every((x) => x.ledgerSha256 === 'EQUAL' && x.tradesSha256 === 'EQUAL' && x.trades === 'EQUAL');
  return out;
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (arg('--accounting') !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const LIMIT = Number(arg('--limit', '0')), keys = arg('--lifecycles', INTEGRITY_KEYS.join(',')).split(','), secFetchMax = Number(arg('--sec-fetch-max', '0')), sharesVersion = arg('--sec-shares', 'r13');
  if (!SEC_SHARES_KEYS[sharesVersion]) { console.error('SEC_SHARES_R13_OR_R14'); process.exit(2); }
  const SEC_SHARES_KEY = SEC_SHARES_KEYS[sharesVersion];
  if (!keys.every((k) => INTEGRITY_KEYS.includes(k))) { console.error('UNKNOWN_LIFECYCLE'); process.exit(2); }
  if (!(Number.isInteger(secFetchMax) && secFetchMax >= 0 && secFetchMax <= 300)) { console.error('SEC_FETCH_MAX_0_TO_300'); process.exit(2); }
  const smoke = argv.includes('--smoke-snapshot');
  const t0 = Date.now(), log = (m) => console.log(`[sf7-ca +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, verification, secPit, shares, sharesSha256;
  try {
    const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
    const { createSnapshotStore } = await import('../../snapshot/store.mjs');
    const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
    const live = await LIVE_IO.createDriver();
    const opened = await openSnapshot({ store: createSnapshotStore({ driver: live, smoke }), snapshotId, requireRestoreReceipt: true });
    pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
    const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
    if (v.codeVersionChanged && !argv.includes('--allow-code-version-change')) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'CODE_VERSION_CHANGED');
    datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, bytesVerified: opened.verified.bytes, smokeStore: smoke };
    const driver = await opened.io.createDriver();
    const buf = await driver.get(pit.mine.seriesPrefix + SEC_PIT_KEY);
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    // sec-pit-r13 is not part of the frozen snapshot: read once from the private store, identified by its hash
    const sbuf = await live.get(pit.mine.seriesPrefix + SEC_SHARES_KEY);
    if (!sbuf) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, `SEC_PIT_${sharesVersion.toUpperCase()}_MISSING`);
    sharesSha256 = crypto.createHash('sha256').update(sbuf).digest('hex');
    const r13 = JSON.parse(zlib.gunzipSync(sbuf).toString('utf8'));
    shares = new Map(Object.entries(r13).filter(([, x]) => Array.isArray(x?.shares) && x.shares.length).map(([id, x]) => [id, { cik: x.cik, how: x.how, taxonomy: x.taxonomy ?? null, shares: x.shares }]));
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}; sec-pit r12 listings ${Object.keys(secPit).length}; ${sharesVersion} listings with shares ${shares.size} (sha ${sharesSha256.slice(0, 12)})`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const ds = datasetFromPit(pit); attachSecPit(ds, secPit);
  const listingPeriods = new Map(pit.listings.map((l) => [l.id, { startDate: l.startDate, listEnd: l.listEnd || null }]));
  const { UA } = await import('../../validation/sec-pit.mjs');
  const fetchFilings = (cik) => fetchSubmissions(cik, { userAgent: UA });
  const evidenceInputs = { secShares: sharesVersion, secSharesKey: SEC_SHARES_KEY, secSharesSha256: sharesSha256, datasetSha256, snapshotId };
  const receipt = { schema: 'supertrader-sf7-ca-resolution-receipt-1.0.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), caCodeSha256: caCodeSha256(), runner: SF7_CA_RUNNER_VERSION, classifier: CA_RESOLUTION_VERSION, rulesetSha256: rulesetSha256(), overlay: CA_OVERLAY_VERSION, secShares: sharesVersion, secSharesKey: SEC_SHARES_KEY, secSharesSha256: sharesSha256, secFetchMax, lifecycles: keys, limit: LIMIT || null, ...verification, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  const r = await caResolutionPart(ds, pit.segs, { sharesByListing: shares, listingPeriods, fetchFilings: secFetchMax ? fetchFilings : null, secFetchMax, keys, snapshotId, evidenceInputs, log });
  const authoritative = snapshotId === SF6_RUN_FACTS.integrity.snapshotId && !LIMIT && !smoke && keys.length === INTEGRITY_KEYS.length;
  r.pub.baseVsSf6 = authoritative ? compareWithSf6(r.pub.lifecycles) : { skipped: 'NOT_THE_AUTHORITATIVE_FULL_RUN' };
  if (authoritative) for (const [k, v] of Object.entries(r.pub.baseVsSf6)) if (k !== 'allEqual') log(`BASE vs 6.0 ${k}: ledger ${v.ledgerSha256}, trades ${v.tradesSha256}, count ${v.trades}`);
  const pub = { schema: 'supertrader-sf7-ca-resolution-public-1.0.0', receipt, resolution: r.pub };
  const sealed = { receipt, public: pub, resolution: r.sealed };
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf7-ca-resolution${LIMIT || smoke ? '-smoke' : ''}`;
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  fs.writeFileSync(path.join(OUT, `${tag}-overlay.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(r.manifest))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
  if (authoritative && !r.pub.baseVsSf6.allEqual) { console.error('BASE_REGRESSION: BASE differs from the 6.0 facts'); process.exit(5); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
