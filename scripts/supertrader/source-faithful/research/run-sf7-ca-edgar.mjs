#!/usr/bin/env node
/**
 * Supertrader 7.0 – targeted EDGAR check of V4-D1, rule set 1.4.2 (owner decisions E7-1 and 25.10.2026 on exhibits;
 * integrity/ca-edgar.mjs; 1.4.1 frozen in ca-edgar-1.4.1.mjs and evaluated on the same documents for the before / after).
 *  1. exactly the run of run-sf7-ca-resolution.mjs#caResolutionPart: BASE (11 references, compared with 6.0), every DQ-K3
 *     candidate with exposure, classification with rule set 1.3.0 UNCHANGED (its EDGAR index lookups from the cache);
 *  2. refinement (this file), only the reference-exposed UNRESOLVED DQ-K5 sessions of 1.3.0 (authoritative: exactly 83,
 *     asserted before any request):
 *     a. PLAN from the private cache with a client that cannot send (budget 0): submissions, primary documents, filing
 *        indexes and the exhibit upper bound still needed; the run stops before any request when the bound exceeds the
 *        remaining cumulative budget (EDGAR_PLAN_EXCEEDS_BUDGET); --plan stops after the plan (0 requests);
 *     b. the 1.4.1 primary documents (cache), then for the document-path sessions only the filing index and the allowed
 *        exhibits (EXHIBIT_TYPES) of the same selected filings; text parsed locally and dropped;
 *     c. 1.4.2 classifies (primaries + exhibits), the frozen 1.4.1 classifies the primaries (before / after);
 *  3. back in caResolutionPart: census, generated overlay manifest (1.4.2), the overlay through the UNCHANGED production
 *     path, CA / CA-Q-K5 / CA-Q-K3 reference runs, reconciliation and trade comparison with BASE.
 *  Cumulative budget: at most EXHIBIT_BUDGET.cumulativeRequestsAllRuns (600) requests for ALL 1.4.2 runs together, kept in
 *  a private ledger (LEDGER_KEY); each run RESERVES its budget in the ledger before any request (fail closed: a ledger
 *  that cannot be read or written stops the run) and settles it to the requests actually sent afterwards.
 *  - public (log): counts only; sealed (owner key): per session classes, extracted ratio / dates / accession / hashes.
 * DIAGNOSTIC_NOT_CERTIFIED. No paid source, no live activation, no orders; quant/data and the snapshot stay unchanged.
 *
 *   node scripts/supertrader/source-faithful/research/run-sf7-ca-edgar.mjs --snapshot sts1-<id> --accounting research-v1 \
 *        --out <dir> [--plan] [--smoke-limit 400]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { codeSha256 as engineCodeSha256 } from '../runner/run-research.mjs';
import { FOUNDATION } from '../contract.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { caResolutionPart, compareWithSf6, caCodeSha256, SEC_SHARES_KEYS } from './run-sf7-ca-resolution.mjs';
import { CLASSES, CA_RESOLUTION_VERSION, filingEvidence, rulesetSha256 as rulesetSha256V130 } from '../integrity/ca-resolution.mjs';
import { CA_EDGAR_VERSION, EDGAR_BUDGET, SMOKE_BUDGET, DOC_TOLERANCES, DOC_PARSER_VERSION, PREVIOUS_RULESET, EXHIBIT_BUDGET, extractStatements, rulesetSha256, baseRulesetUnchanged, BASE_RULESET, selectDocuments, documentFactor, groundTruthLabel, classifyWithDocument, documentPath, addDays } from '../integrity/ca-edgar.mjs';
// frozen 1.4.1 (run 40190526062): evaluated on the same primary documents for the before / after, never for the result
import * as V141 from '../integrity/ca-edgar-1.4.1.mjs';
import { buildOverlayManifest } from '../integrity/ca-overlay.mjs';
import { createEdgarClient, migrateCache, EDGAR_CACHE_KEY, EDGAR_CLIENT_VERSION } from './sf7-edgar-client.mjs';
import { SF6_RUN_FACTS } from '../completion/sf6-run-facts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const SF7_CA_EDGAR_RUNNER_VERSION = 'sf7-ca-edgar-runner-1.2.0';
/** 1.4.1 and 1.4.2 use the same parser (1.1.0): one extraction per text. */
export const EXTRACTORS = Object.freeze([Object.freeze({ parser: DOC_PARSER_VERSION, extract: extractStatements })]);
/** E7-1: the reference-exposed UNRESOLVED DQ-K5 sessions of rule set 1.3.0 (run 40122736287). */
export const EXPECTED_SCOPE_SESSIONS = 83;
/** 1.3.0 overlay manifest hash of run 40122736287 (empty overlay); the 1.3.0 stage of this run must reproduce it. */
export const MANIFEST_SHA256_V130 = 'e0a31fea1f723faec9046e944c9500984809a62b3cc44262ad3e648f252522c1';
/** Private cumulative request ledger of all 1.4.2 runs (never committed). */
export const LEDGER_KEY = '_validation/edgar-ca-142-ledger.json.gz';
const FILES = ['../integrity/ca-edgar.mjs', '../integrity/ca-edgar-1.4.1.mjs', 'sf7-edgar-client.mjs', 'run-sf7-ca-edgar.mjs'];
export function edgarCodeSha256() {
  const h = crypto.createHash('sha256');
  for (const f of FILES) { h.update(f); h.update(fs.readFileSync(path.join(HERE, f))); }
  return h.digest('hex');
}
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});

// ---------------------------------------------------------------------------------------------------- cumulative ledger

export const emptyLedger = () => ({ schema: 'supertrader-edgar-ca-142-ledger-1.0.0', cap: EXHIBIT_BUDGET.cumulativeRequestsAllRuns, runs: [] });
/** Requests counted so far: settled runs by their use, unsettled reservations by their full reservation (fail closed). */
export const ledgerUsed = (l) => l.runs.reduce((s, r) => s + (Number.isInteger(r.used) ? r.used : r.reserved), 0);
export const ledgerRemaining = (l) => Math.max(0, (l.cap ?? EXHIBIT_BUDGET.cumulativeRequestsAllRuns) - ledgerUsed(l));
/** Reserves `want` requests (at most the remaining budget) for a run; returns { ledger, reserved }. */
export function reserveLedger(l, { runId, mode, want }) {
  if (l.runs.some((r) => r.runId === runId)) throw new Error('EDGAR_LEDGER_RUN_EXISTS');
  const reserved = Math.min(want, ledgerRemaining(l));
  return { ledger: { ...l, runs: [...l.runs, { runId, mode, reserved, used: null }] }, reserved };
}
export function settleLedger(l, runId, used) {
  const runs = l.runs.map((r) => { if (r.runId !== runId) return r; if (!(Number.isInteger(used) && used >= 0 && used <= r.reserved)) throw new Error('EDGAR_LEDGER_SETTLE_INVALID'); return { ...r, used }; });
  return { ...l, runs };
}

// ---------------------------------------------------------------------------------------------------- plan

/**
 * Plan from the cache only (planClient sends nothing: budget 0): per in-scope session with a CIK the submissions index,
 * the selected primary documents and - for document-path sessions - the filing indexes and exhibits still needed.
 * exhibitUpperBound counts maxExhibitsPerFiling for every filing index not yet cached.
 */
export async function planRequests({ inScope, identityOf, planClient, budget = EDGAR_BUDGET, tol = DOC_TOLERANCES }) {
  const p = { sessions: inScope.length, sessionsWithCik: 0, exhibitSessions: 0, submissionsNeeded: 0, primaryDocumentsNeeded: 0, filingsForExhibits: 0, filingIndexesNeeded: 0, exhibitsNeededKnown: 0, exhibitUpperBound: 0 };
  const seenCik = new Set(), seenDoc = new Set(), seenIdx = new Set(), seenEx = new Set();
  for (const c of inScope) {
    const { sec } = identityOf(c); if (!sec?.cik) continue;
    p.sessionsWithCik++;
    const ix = await planClient.indexCovering(sec.cik, addDays(c.date, Math.min(tol.filingWindowDays[0], -45)), addDays(c.date, tol.filingWindowDays[1]));
    if (!ix || ix.refused) { if (!seenCik.has(sec.cik)) { seenCik.add(sec.cik); p.submissionsNeeded += budget.indexPagesPerCik; } continue; }
    const picks = selectDocuments(ix.index, c.date, tol).slice(0, budget.docRequestsPerSession), path = documentPath(c.result13 ?? c.result);
    for (const d of picks) if (!seenDoc.has(d.accessionNumber)) { seenDoc.add(d.accessionNumber); if (!(await planClient.cachedDocument(d.accessionNumber))) p.primaryDocumentsNeeded++; }
    if (!path) continue;
    p.exhibitSessions++;
    for (const d of picks) {
      if (seenIdx.has(d.accessionNumber)) continue; seenIdx.add(d.accessionNumber); p.filingsForExhibits++;
      const fi = planClient.cachedFilingIndex(d.accessionNumber);
      if (!fi) { p.filingIndexesNeeded++; p.exhibitUpperBound += EXHIBIT_BUDGET.maxExhibitsPerFiling; continue; }
      for (const e of fi.allowed.slice(0, EXHIBIT_BUDGET.maxExhibitsPerFiling)) { const k = `${d.accessionNumber}/${e.name}`; if (!seenEx.has(k)) { seenEx.add(k); if (!planClient.cached(d.accessionNumber, e.name)) { p.exhibitsNeededKnown++; p.exhibitUpperBound++; } } }
    }
  }
  p.totalUpperBound = p.submissionsNeeded + p.primaryDocumentsNeeded + p.filingIndexesNeeded + p.exhibitUpperBound;
  p.planRequests = planClient.stats().requests; // always 0 (the plan client cannot send)
  return p;
}

// ---------------------------------------------------------------------------------------------------- refinement

export class PlanOnly extends Error { constructor(plan) { super('EDGAR_PLAN_ONLY'); this.plan = plan; } }
export class PlanExceedsBudget extends Error { constructor(plan, remaining) { super(`EDGAR_PLAN_EXCEEDS_BUDGET: ${plan.totalUpperBound} > ${remaining}`); this.plan = plan; this.remaining = remaining; } }

/**
 * Refinement of caResolutionPart (rule set 1.4.2). scope 'K5' (the 83) or 'K3' (smoke only). planClient: a client on the
 * same cache that cannot send. planOnly: stop after the plan. The plan's upper bound must fit budget.totalRequests.
 */
export function edgarRefine({ client, planClient, scope = 'K5', expectedCount = null, budget = EDGAR_BUDGET, planOnly = false, tol = DOC_TOLERANCES }) {
  return async ({ cands, identityOf, segs, baseDs, snapshotId, evidenceInputs, log = () => {} }) => {
    for (const c of cands) c.result13 = c.result;
    const inScope = cands.filter((c) => c.result.cls === CLASSES.UNRESOLVED && c.exposedRefs.length && (scope === 'K3' || c.level === 'K5'));
    if (expectedCount !== null && inScope.length !== expectedCount) throw new Error(`EDGAR_SCOPE_COUNT_MISMATCH: ${inScope.length} != ${expectedCount}`);
    const plan = await planRequests({ inScope, identityOf, planClient, budget, tol });
    log(`EDGAR plan: ${JSON.stringify(plan)}`);
    if (planOnly) throw new PlanOnly(plan);
    const remaining = budget.totalRequests - client.stats().requests; // the 1.3.0 lookups of this run count too
    if (plan.totalUpperBound > remaining) throw new PlanExceedsBudget(plan, remaining);
    const rank = (c) => ({ A: 0, B: 1 }[documentPath(c.result13)] ?? 2);
    const order = [...inScope].sort((a, b) => rank(a) - rank(b) || b.exposedRefs.length - a.exposedRefs.length || (a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : a.date.localeCompare(b.date)));
    const sealedRows = [];
    for (const c of order) {
      const { sec, identity } = identityOf(c), raw = segs[c.j].raw, bars = baseDs.securities[c.j].bars, path = documentPath(c.result13);
      const row = { segmentId: c.segmentId, date: c.date, level: c.level, exposedRefs: c.exposedRefs, cik: sec?.cik ?? null, cls13: c.result13.cls, reason13: c.result13.reason, path };
      if (!sec?.cik) { c.edgar = { label: 'NOT_CHECKED', label141: 'NOT_CHECKED', check: 'NO_CIK' }; sealedRows.push({ ...row, ...c.edgar }); continue; }
      const ix = await client.indexCovering(sec.cik, addDays(c.date, Math.min(tol.filingWindowDays[0], -45)), addDays(c.date, tol.filingWindowDays[1]));
      if (!ix || ix.refused) { c.edgar = { label: 'NOT_CHECKED', label141: 'NOT_CHECKED', check: ix?.refused ? 'EDGAR_BUDGET_EXHAUSTED' : 'EDGAR_INDEX_UNAVAILABLE' }; if (path) c.result = c.result141 = { cls: CLASSES.UNRESOLVED, reason: c.edgar.check, evidence: c.result13.evidence }; sealedRows.push({ ...row, ...c.edgar }); continue; }
      const candidates = selectDocuments(ix.index, c.date, tol), picks = candidates.slice(0, budget.docRequestsPerSession);
      const capExceeded = candidates.length > budget.docRequestsPerSession;
      const docs = [], exhibits = []; let complete = true, failed = 0, exIncomplete = null;
      for (const p of picks) {
        const x = await client.document(sec.cik, p);
        if (x.refused) { complete = false; break; }
        if (!x.ok) { failed++; continue; }
        docs.push({ accessionNumber: p.accessionNumber, form: p.form, filingDate: p.filingDate, extraction: x.extraction });
      }
      // 1.4.2: exhibits of the same selected filings, only where a document can confirm (document path)
      if (path && complete) for (const p of picks) {
        const fi = await client.filingIndex(sec.cik, p);
        if (fi.refused) { complete = false; break; }
        if (!fi.ok) { exIncomplete = 'EXHIBIT_FETCH_FAILED'; continue; }
        if (fi.allowed.length > EXHIBIT_BUDGET.maxExhibitsPerFiling) { exIncomplete = exIncomplete ?? 'EXHIBIT_CAP_EXCEEDED'; continue; }
        for (const e of fi.allowed) {
          const x = await client.exhibit(sec.cik, p, e);
          if (x.refused) { complete = false; break; }
          if (!x.ok) { exIncomplete = 'EXHIBIT_FETCH_FAILED'; continue; }
          exhibits.push({ accessionNumber: p.accessionNumber, exhibit: e.name, exhibitType: e.type, form: p.form, filingDate: p.filingDate, extraction: x.extraction });
        }
        if (!complete) break;
      }
      const filings = ix.covered ? filingEvidence(ix.index, c.date) : { covered: false, reason: 'SEC_FILINGS_NOT_COVERED' };
      const args = { r13: c.result13, raw, bars, i: c.i, sec, identity, otherFlagDates: c.otherFlagDates, filings, index: ix.index };
      const fetchFailed = complete && failed > 0;
      const finish = (df) => { if (df.ok === false && fetchFailed) df.reason = 'DOCUMENT_FETCH_FAILED'; return df; };
      // 1.4.1 (frozen) on the primaries; 1.4.2 on primaries + exhibits
      const df141 = finish(V141.documentFactor({ docs, raw, i: c.i, calendar: baseDs.calendar, complete: complete && !fetchFailed, incompleteReason: capExceeded ? 'DOCUMENT_CAP_EXCEEDED' : null }));
      const all = [...docs, ...exhibits];
      const df = finish(documentFactor({ docs: all, raw, i: c.i, calendar: baseDs.calendar, complete: complete && !fetchFailed, incompleteReason: capExceeded ? 'DOCUMENT_CAP_EXCEEDED' : exIncomplete, tol }));
      c.result141 = V141.classifyWithDocument({ ...args, df: df141 });
      c.result = classifyWithDocument({ ...args, df });
      const label141 = V141.groundTruthLabel(V141.documentFactor({ docs, raw, i: c.i, calendar: baseDs.calendar, complete: true }));
      const label = groundTruthLabel(documentFactor({ docs: all, raw, i: c.i, calendar: baseDs.calendar, complete: true, tol }));
      c.edgar = { label, label141, check: 'CHECKED', exhibitScope: !!path, capExceeded, exhibitIncomplete: exIncomplete, filingIndexesRead: path ? picks.length : 0, exhibitsRead: exhibits.length, exhibitTypes: exhibits.map((x) => x.exhibitType), exhibitStatements: exhibits.reduce((a, x) => a + (x.extraction?.statements?.length || 0), 0), documentsRead: docs.length, documentsFailed: failed, documentReason: df.ok ? 'DOCUMENT_FACTOR' : df.reason, documentReason141: df141.ok ? 'DOCUMENT_FACTOR' : df141.reason };
      sealedRows.push({ ...row, ...c.edgar, cls142: c.result.cls, reason142: c.result.reason, label142: c.result.label ?? null, cls141: c.result141.cls, reason141: c.result141.reason, document: df.evidence, document141: df141.evidence, documents: all.map((x) => ({ accessionNumber: x.accessionNumber, exhibit: x.exhibit ?? null, exhibitType: x.exhibitType ?? null, form: x.form, filingDate: x.filingDate, chars: x.extraction.chars, truncated: x.extraction.truncated, textSha256: x.extraction.textSha256, instrumentExcluded: x.extraction.instrumentExcluded, statements: x.extraction.statements })) });
    }
    // public, counts only
    const k5 = (c) => c.level === 'K5', r141 = (c) => c.result141 ?? c.result;
    const perReference = {};
    for (const k of [...new Set(cands.flatMap((c) => c.exposedRefs))].sort()) {
      const rows = cands.filter((c) => k5(c) && c.exposedRefs.includes(k));
      perReference[k] = { dqK5Exposed: rows.length, unresolved13: rows.filter((c) => c.result13.cls === CLASSES.UNRESOLVED).length, confirmedSplit141: rows.filter((c) => r141(c).cls === CLASSES.SPLIT).length, unresolved141: rows.filter((c) => r141(c).cls === CLASSES.UNRESOLVED).length, confirmedSplit142: rows.filter((c) => c.result.cls === CLASSES.SPLIT).length, confirmedGenuine142: rows.filter((c) => c.result.cls === CLASSES.GENUINE).length, unresolved142: rows.filter((c) => c.result.cls === CLASSES.UNRESOLVED).length, splitFactors142: tally(rows.filter((c) => c.result.cls === CLASSES.SPLIT), (c) => c.result.label) };
    }
    const m13 = buildOverlayManifest(cands.map((c) => ({ ...c.result13, segmentId: c.segmentId, date: c.date })), { snapshotId, classifierVersion: CA_RESOLUTION_VERSION, evidenceInputs });
    const ex = inScope.filter((c) => c.edgar?.exhibitScope);
    const pub = {
      version: CA_EDGAR_VERSION, rulesetSha256: rulesetSha256(), baseRuleset: { version: BASE_RULESET.version, sha256: rulesetSha256V130(), unchanged: baseRulesetUnchanged() }, client: EDGAR_CLIENT_VERSION, scope, expectedSessions: expectedCount,
      plan, sessionsInScope: inScope.length, sessionsWithCik: inScope.filter((c) => identityOf(c).sec?.cik).length, sessionsChecked: inScope.filter((c) => c.edgar?.check === 'CHECKED').length,
      byCheck: tally(inScope, (c) => c.edgar?.check ?? 'NOT_REACHED'), byDocumentPath: tally(inScope, (c) => documentPath(c.result13) ?? 'NONE'),
      exhibits: { sessions: ex.length, filingIndexesRead: ex.reduce((a, c) => a + c.edgar.filingIndexesRead, 0), exhibitsRead: ex.reduce((a, c) => a + c.edgar.exhibitsRead, 0), byType: tally(ex.flatMap((c) => c.edgar.exhibitTypes), (t) => t), statements: ex.reduce((a, c) => a + c.edgar.exhibitStatements, 0), incomplete: tally(ex.filter((c) => c.edgar.exhibitIncomplete), (c) => c.edgar.exhibitIncomplete) },
      requests: client.stats(), labels: tally(inScope, (c) => c.edgar?.label ?? 'NOT_CHECKED'), documentReasons: tally(inScope, (c) => c.edgar?.documentReason ?? null),
      byClass142: tally(inScope, (c) => c.result.cls), byReason142: tally(inScope, (c) => c.result.reason), splitFactors142: tally(inScope.filter((c) => c.result.cls === CLASSES.SPLIT), (c) => c.result.label),
      transitions: tally(inScope, (c) => `${c.result13.reason} -> ${c.result.cls === CLASSES.UNRESOLVED ? c.result.reason : c.result.cls}`),
      before: { 'DQ-K5': tally(cands.filter(k5), (c) => c.result13.cls), 'DQ-K3': tally(cands, (c) => c.result13.cls), exposedK5Unresolved: cands.filter((c) => k5(c) && c.exposedRefs.length && c.result13.cls === CLASSES.UNRESOLVED).length, overlayManifestSha256: m13.manifestSha256, overlayEntries: m13.entries.length },
      after: { 'DQ-K5': tally(cands.filter(k5), (c) => c.result.cls), 'DQ-K3': tally(cands, (c) => c.result.cls), exposedK5Unresolved: cands.filter((c) => k5(c) && c.exposedRefs.length && c.result.cls === CLASSES.UNRESOLVED).length },
      changedOutsideScope: cands.filter((c) => !inScope.includes(c) && c.result !== c.result13).length,
      genuineCandidatesChanged: inScope.filter((c) => !documentPath(c.result13) && c.result !== c.result13).length,
      perReference,
      // 1.4.2 vs the frozen 1.4.1 on the same primary documents (counts only)
      previous: { version: PREVIOUS_RULESET.version, rulesetSha256: V141.rulesetSha256(), pinned: V141.rulesetSha256() === PREVIOUS_RULESET.sha256, labels: tally(inScope, (c) => c.edgar?.label141 ?? 'NOT_CHECKED'), documentReasons: tally(inScope, (c) => c.edgar?.documentReason141 ?? null), byClass: tally(inScope, (c) => r141(c).cls), byReason: tally(inScope, (c) => r141(c).reason) },
      transitions141to142: tally(inScope.filter((c) => c.edgar?.check === 'CHECKED'), (c) => `${c.edgar.documentReason141} -> ${c.edgar.documentReason}`),
    };
    if (pub.changedOutsideScope) throw new Error('EDGAR_CHANGED_OUTSIDE_SCOPE');
    if (pub.genuineCandidatesChanged) throw new Error('EDGAR_GENUINE_CANDIDATE_CHANGED');
    log(`EDGAR: ${pub.sessionsChecked}/${inScope.length} checked, requests ${pub.requests.requests}/${budget.totalRequests}, exhibits ${pub.exhibits.exhibitsRead}, confirmed splits ${pub.byClass142[CLASSES.SPLIT] ?? 0}`);
    return { pub, sealed: { sessions: sealedRows } };
  };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (arg('--accounting') !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const LIMIT = Number(arg('--smoke-limit', '0'));
  if (!(Number.isInteger(LIMIT) && LIMIT >= 0)) { console.error('SMOKE_LIMIT_INTEGER'); process.exit(2); }
  const planOnly = argv.includes('--plan'), smoke = LIMIT > 0, scope = smoke ? 'K3' : 'K5';
  const mode = planOnly ? 'plan' : smoke ? 'smoke' : 'full';
  if (!baseRulesetUnchanged()) { console.error('BASE_RULESET_1_3_0_CHANGED'); process.exit(2); }
  const t0 = Date.now(), log = (m) => console.log(`[sf7-ca-edgar +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  const K = await import('../../snapshot/contract.mjs');
  let pit, datasetSha256, verification, secPit, shares, sharesSha256, live, cache = null, cacheLoaded = false, cacheSha256 = null, ledger;
  const SEC_SHARES_KEY = SEC_SHARES_KEYS.r14;
  try {
    const { LIVE_IO, loadPitData } = await import('../../validation/analyze-methods.mjs');
    const { createSnapshotStore } = await import('../../snapshot/store.mjs');
    const { openSnapshot, verifyAgainstManifest, CANONICAL_LOAD } = await import('../../snapshot/snapshot.mjs');
    live = await LIVE_IO.createDriver();
    const opened = await openSnapshot({ store: createSnapshotStore({ driver: live, smoke: false }), snapshotId, requireRestoreReceipt: true });
    pit = await loadPitData({ LIMIT: opened.manifest.capture.limit || 0, ...CANONICAL_LOAD, io: opened.io, log });
    const v = verifyAgainstManifest(opened.manifest, pit, { replay: false });
    if (v.codeVersionChanged) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'CODE_VERSION_CHANGED');
    datasetSha256 = K.sha256(K.canonicalJson(v.dataset));
    verification = { datasetVerified: v.datasetVerified, codeVersionChanged: v.codeVersionChanged, bytesVerified: opened.verified.bytes };
    const driver = await opened.io.createDriver();
    const buf = await driver.get(pit.mine.seriesPrefix + '_validation/sec-pit-r12.json.gz');
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    const sbuf = await live.get(pit.mine.seriesPrefix + SEC_SHARES_KEY);
    if (!sbuf) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'SEC_PIT_R14_MISSING');
    sharesSha256 = crypto.createHash('sha256').update(sbuf).digest('hex');
    const r14 = JSON.parse(zlib.gunzipSync(sbuf).toString('utf8'));
    shares = new Map(Object.entries(r14).filter(([, x]) => Array.isArray(x?.shares) && x.shares.length).map(([id, x]) => [id, { cik: x.cik, how: x.how, taxonomy: x.taxonomy ?? null, shares: x.shares }]));
    // caches first: the private EDGAR cache of the 1.4.0 / 1.4.1 runs (extracted values only)
    const cbuf = await live.get(pit.mine.seriesPrefix + EDGAR_CACHE_KEY);
    if (cbuf) { cache = JSON.parse(zlib.gunzipSync(cbuf).toString('utf8')); cacheLoaded = true; cacheSha256 = crypto.createHash('sha256').update(cbuf).digest('hex'); }
    // cumulative ledger (fail closed: a read error stops the run; a missing ledger starts at 0)
    const lbuf = await live.get(pit.mine.seriesPrefix + LEDGER_KEY);
    ledger = lbuf ? JSON.parse(zlib.gunzipSync(lbuf).toString('utf8')) : emptyLedger();
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}; EDGAR cache ${cacheLoaded ? 'loaded' : 'none'}; ledger used ${ledgerUsed(ledger)} of ${ledger.cap}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  cache = migrateCache(cache);
  const cacheCount = (c) => ({ submissions: Object.keys(c.submissions).length, documents: Object.keys(c.documents).length, filingIndexes: Object.keys(c.filingIndexes).length, exhibits: Object.keys(c.exhibits).length });
  const cacheBefore = cacheCount(cache);
  if (LIMIT) pit.segs = pit.segs.slice(0, LIMIT);
  const ds = datasetFromPit(pit); attachSecPit(ds, secPit);
  const listingPeriods = new Map(pit.listings.map((l) => [l.id, { startDate: l.startDate, listEnd: l.listEnd || null }]));
  const { UA } = await import('../../validation/sec-pit.mjs');
  const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
  // reserve the run's budget in the ledger BEFORE any request (plan: 0)
  const want = planOnly ? 0 : smoke ? SMOKE_BUDGET.totalRequests : EDGAR_BUDGET.totalRequests;
  const res = reserveLedger(ledger, { runId, mode, want });
  try { await live.put(pit.mine.seriesPrefix + LEDGER_KEY, zlib.gzipSync(Buffer.from(JSON.stringify(res.ledger))), { contentType: 'application/gzip' }); } catch { console.error('EDGAR_LEDGER_WRITE_FAILED'); process.exit(3); }
  ledger = res.ledger;
  const budget = { ...(smoke ? SMOKE_BUDGET : EDGAR_BUDGET), totalRequests: res.reserved };
  log(`ledger: reserved ${res.reserved} for ${mode}; remaining after reservation ${ledgerRemaining(ledger)}`);
  const client = createEdgarClient({ userAgent: UA, budget, cache, extractors: EXTRACTORS });
  const planClient = createEdgarClient({ userAgent: UA, budget: { ...budget, totalRequests: 0 }, cache: client.exportCache(), extractors: EXTRACTORS, fetchImpl: async () => { throw new Error('PLAN_CLIENT_NEVER_SENDS'); } });
  const evidenceInputs = { secShares: 'r14', secSharesKey: SEC_SHARES_KEY, secSharesSha256: sharesSha256, datasetSha256, snapshotId };
  const authoritative = snapshotId === SF6_RUN_FACTS.integrity.snapshotId && !LIMIT;
  const receipt = { schema: 'supertrader-sf7-ca-edgar-receipt-1.1.0', certification: FOUNDATION.certification, snapshotId, datasetSha256, accounting: FOUNDATION.accounting.mode, engineCodeSha256: engineCodeSha256(), caCodeSha256: caCodeSha256(), edgarCodeSha256: edgarCodeSha256(), runner: SF7_CA_EDGAR_RUNNER_VERSION, classifier: CA_EDGAR_VERSION, rulesetSha256: rulesetSha256(), baseRulesetSha256: rulesetSha256V130(), secShares: 'r14', secSharesSha256: sharesSha256, edgarCache: { key: EDGAR_CACHE_KEY, loaded: cacheLoaded, sha256: cacheSha256, ...cacheBefore }, budget, mode, scope, limit: LIMIT || null, ...verification, runId, commit: process.env.GITHUB_SHA || null };
  const fetchFilings = (cik) => client.submissions13(cik);
  fs.mkdirSync(OUT, { recursive: true });
  const tag = `sf7-ca-edgar${planOnly ? '-plan' : smoke ? '-smoke' : ''}`;
  const settle = async () => {
    const used = client.stats().requests;
    ledger = settleLedger(ledger, runId, used);
    try { await live.put(pit.mine.seriesPrefix + LEDGER_KEY, zlib.gzipSync(Buffer.from(JSON.stringify(ledger))), { contentType: 'application/gzip' }); } catch { console.error('EDGAR_LEDGER_SETTLE_WRITE_FAILED (reservation stays counted)'); }
    return { used, ledgerUsed: ledgerUsed(ledger), ledgerRemaining: ledgerRemaining(ledger), runs: ledger.runs.map((r) => ({ mode: r.mode, reserved: r.reserved, used: r.used })) };
  };
  let r;
  try {
    r = await caResolutionPart(ds, pit.segs, { sharesByListing: shares, listingPeriods, fetchFilings, secFetchMax: smoke ? 5 : 150, snapshotId, evidenceInputs, classifierVersion: CA_EDGAR_VERSION, rulesetSha256Value: rulesetSha256(), refine: edgarRefine({ client, planClient, scope, expectedCount: authoritative ? EXPECTED_SCOPE_SESSIONS : null, budget, planOnly }), log });
  } catch (e) {
    const ledgerState = await settle();
    if (e instanceof PlanOnly || e instanceof PlanExceedsBudget) {
      const pub = { schema: 'supertrader-sf7-ca-edgar-plan-public-1.0.0', receipt, plan: e.plan, requestsThisRun: client.stats(), ledger: ledgerState, exceeds: e instanceof PlanExceedsBudget ? { upperBound: e.plan.totalUpperBound, budget: e.remaining } : null };
      fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
      log(`plan written; ${e.message}`);
      process.exit(e instanceof PlanOnly ? 0 : 8);
    }
    console.error(String(e?.message || e).startsWith('EDGAR_') ? String(e.message) : String(e?.stack || e));
    process.exit(6);
  }
  const ledgerState = await settle();
  r.pub.baseVsSf6 = authoritative ? compareWithSf6(r.pub.lifecycles) : { skipped: 'NOT_THE_AUTHORITATIVE_FULL_RUN' };
  r.pub.refine.before.overlayMatchesRun40122736287 = authoritative ? r.pub.refine.before.overlayManifestSha256 === MANIFEST_SHA256_V130 : null;
  r.pub.refine.ledger = ledgerState;
  const stats = client.stats();
  if (stats.requests > budget.totalRequests) { console.error('EDGAR_BUDGET_BREACH'); process.exit(7); }
  const out = client.exportCache();
  try { await live.put(pit.mine.seriesPrefix + EDGAR_CACHE_KEY, zlib.gzipSync(Buffer.from(JSON.stringify(out))), { contentType: 'application/gzip' }); r.pub.refine.cache = { loaded: cacheLoaded, before: cacheBefore, after: cacheCount(out), written: true }; }
  catch { r.pub.refine.cache = { loaded: cacheLoaded, before: cacheBefore, after: cacheCount(out), written: false }; }
  const pub = { schema: 'supertrader-sf7-ca-edgar-public-1.1.0', receipt, resolution: r.pub };
  const sealed = { receipt, public: pub, resolution: r.sealed };
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, `${tag}.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(sealed))));
  fs.writeFileSync(path.join(OUT, `${tag}-overlay.sealed.json`), L.encryptForOwner(pem, Buffer.from(JSON.stringify(r.manifest))));
  fs.writeFileSync(path.join(OUT, `${tag}.public.json`), JSON.stringify(pub, null, 1) + '\n');
  log(`done; public ${tag}.public.json`);
  if (authoritative && !r.pub.baseVsSf6.allEqual) { console.error('BASE_REGRESSION: BASE differs from the 6.0 facts'); process.exit(5); }
  if (authoritative && !r.pub.refine.before.overlayMatchesRun40122736287) { console.error('V130_OVERLAY_NOT_REPRODUCED'); process.exit(5); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
