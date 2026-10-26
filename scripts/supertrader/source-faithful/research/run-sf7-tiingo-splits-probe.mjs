#!/usr/bin/env node
/**
 * Supertrader 7.0 – Tiingo corporate-actions splits probe (owner request 25.10.2026: use the EXISTING Tiingo access
 * before any vendor). A PROBE only: it changes no overlay, no quarantine, no CC-5 and no status.
 *
 * Stage A (access, at most PROBE_SPEC.stageA.maxRequests = 4, here 3 used): fixed public examples, no project data –
 *   AAPL per ticker from 2020-01-01 (4:1, exDate 2020-08-31), GE per ticker from 2021-01-01 (1:8 reverse, ~2021-08-02),
 *   the batch for exDate 2020-08-31. The optional delisted example is skipped (none named with certainty).
 *   Public: HTTP status, record count, field names, expected split found (ratio + date), permaTicker present. On a refusal
 *   (non-200) the message text (token removed, at most 300 characters); no other body content. Without access: STOP.
 * Stage B (coverage, at most PROBE_SPEC.stageB.maxRequests = 90, fail closed, sequential, >= 1 s apart): the 83
 *   reference-exposed UNRESOLVED DQ-K5 sessions recomputed exactly as run-sf7-ca-edgar.mjs (caResolutionPart, rule set
 *   1.3.0 unchanged; its EDGAR index lookups served from the private EDGAR cache with a client that cannot send), ONE
 *   per-ticker request per distinct ticker (startExDate = earliest session date - 60 days), per session one class of
 *   PROBE_SPEC.classes, the ratio against the grid value of the raw close and open relatives (snapFactor), splitStatus,
 *   permaTicker for the no-CIK sessions, per 1.3.0 reason group, and the comparison with the EOD splitFactor field of the
 *   same snapshot (is the endpoint an independent source?).
 * Public: counts only. Sealed (owner key): per session the ticker, records (exDate, from, to, factor, status,
 * permaTicker) and the class. No ticker in logs.
 *
 *   TIINGO_API_KEY=... node scripts/supertrader/source-faithful/research/run-sf7-tiingo-splits-probe.mjs \
 *        --snapshot sts1-<id> --accounting research-v1 --out <dir>
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { FOUNDATION } from '../contract.mjs';
import { attachSecPit } from './run-sf3-research.mjs';
import { caResolutionPart, SEC_SHARES_KEYS } from './run-sf7-ca-resolution.mjs';
import { CLASSES, snapFactor, FACTOR_GRID, rulesetSha256 as rulesetSha256V130 } from '../integrity/ca-resolution.mjs';
import { DOC_PATH_REASONS } from '../integrity/ca-edgar.mjs';
import { EXPECTED_SCOPE_SESSIONS } from './run-sf7-ca-edgar.mjs';
import { createEdgarClient, EDGAR_CACHE_KEY } from './sf7-edgar-client.mjs';
import { SF6_RUN_FACTS } from '../completion/sf6-run-facts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const PROBE_VERSION = 'sf7-tiingo-splits-probe-1.0.0';
const BASE_URL = 'https://api.tiingo.com/tiingo/corporate-actions';

/** Pre-registered probe (its SHA-256 is pinned in a test before the run). */
export const PROBE_SPEC = Object.freeze({
  version: PROBE_VERSION,
  stageA: Object.freeze({
    maxRequests: 4,
    requests: Object.freeze([
      Object.freeze({ id: 'A1-AAPL', kind: 'ticker', ticker: 'aapl', startExDate: '2020-01-01', expect: Object.freeze({ exDate: '2020-08-31', splitFrom: 1, splitTo: 4, dateToleranceDays: 0 }) }),
      Object.freeze({ id: 'A2-GE', kind: 'ticker', ticker: 'ge', startExDate: '2021-01-01', expect: Object.freeze({ exDate: '2021-08-02', splitFrom: 8, splitTo: 1, dateToleranceDays: 3 }) }),
      Object.freeze({ id: 'A3-BATCH', kind: 'batch', exDate: '2020-08-31', expect: Object.freeze({ ticker: 'aapl', exDate: '2020-08-31', splitFrom: 1, splitTo: 4, dateToleranceDays: 0 }) }),
    ]),
    optionalDelisted: 'SKIPPED: no delisted issuer named from public knowledge with certainty',
    accessRequires: Object.freeze(['A1-AAPL', 'A2-GE']),
  }),
  stageB: Object.freeze({ maxRequests: 90, startExDateOffsetDays: -60, oneRequestPerDistinctTicker: true, scope: 'REFERENCE_EXPOSED_UNRESOLVED_DQ_K5_OF_1_3_0', expectedSessions: EXPECTED_SCOPE_SESSIONS }),
  throttle: Object.freeze({ minIntervalMs: 1000, timeoutMs: 30000, sequential: true, retries: 0 }),
  windowSessions: 2,
  classes: Object.freeze(['SPLIT_EVENT_IN_WINDOW', 'SPLIT_EVENT_ELSEWHERE', 'NO_SPLIT_RECORDS', 'TICKER_NOT_FOUND']),
  // 1.3.0 reason groups as reported for the 83 (1.4.3 run 40214193643)
  reasonGroups: Object.freeze({
    NO_CIK: Object.freeze(['SEC_LISTING_NOT_MAPPED']),
    DECLARED_SPLIT_NEARBY: Object.freeze(['DECLARED_SPLIT_NEARBY', 'MULTIPLE_DECLARED_SPLITS_NEARBY', 'MISDATED_JUMP_AMBIGUOUS', 'DECLARED_SESSION_MOVES', 'MISDATED_NEEDS_ADJCLOSE_FACTOR', 'SEC_CONTRADICTS_DECLARED_FACTOR', 'MULTIPLE_JUMPS_NEAR_PAIR']),
    GENUINE_MOVE: Object.freeze(['VOLUME_CONSISTENT_WITH_SPLIT', 'PRICE_RATIO_AT_STANDARD_FACTOR', 'CA_FILING_IN_WINDOW', 'GENUINE_REQUIRES_KNOWN_CIK', 'VOLUME_EVIDENCE_MISSING', 'GENUINE_BEFORE_COUNT_FILED_AFTER_SESSION', 'UNIT_ERROR_SUSPECT', 'LARGE_DISTRIBUTION_NEARBY', 'NOT_A_DOMESTIC_FILER', '8K_ITEMS_UNKNOWN_IN_WINDOW']),
    SHARE_PRICE_CONTRADICTION: Object.freeze(['SHARE_RATIO_NO_MATCH', 'PRICE_RATIO_OFF_FACTOR', 'SHARE_AND_PRICE_DIRECTION_CONFLICT', 'MULTIPLE_JUMPS_IN_BRACKET', 'OPEN_RATIO_OFF_FACTOR', 'OPEN_SELECTS_OTHER_FACTOR', 'SHARE_RESIDUAL_TOO_LARGE', 'SHARE_RATIO_AMBIGUOUS_FACTOR']),
    ADR: Object.freeze(['ADR_OR_FOREIGN_FILER']),
    DOCUMENT_PATH: Object.freeze([...DOC_PATH_REASONS.SHARES_PASSED, ...DOC_PATH_REASONS.SHARES_UNUSABLE]),
  }),
  semantics: 'splitFactor = splitTo / splitFrom (new shares per old, Tiingo); price factor c = 1 / splitFactor; c is snapped with snapFactor on FACTOR_GRID of rule set 1.3.0',
  baseRulesetSha256: '08d8a6ec8e0565f0c674fa295d50745607b1c37cfc8411e609952f8224267af7',
  changesNothing: 'no overlay, no quarantine, no CC-5, no status change',
});
/**
 * Access gate (outside PROBE_SPEC, so the pinned spec hash is unchanged). Run 40221353332 got HTTP 403 for all three
 * stage-A requests; owner 25.10.2026: no further access attempts against the blocked endpoint. While FROZEN the fetch
 * run refuses before reading the key (PROBE_FROZEN); only the request-free plan (--plan, mode sf7-tiingo-splits-plan)
 * runs. Unlocking is a reviewed change of `state` to 'UNLOCKED' with the owner approval in `unlockedBy`, together with
 * removing the workflow step "Tiingo-Splits-Abruf gesperrt" (docs/SUPERTRADER_7_TIINGO_SPLITS_PROBE.md, Stufe B).
 */
export const PROBE_GATE = Object.freeze({
  state: 'FROZEN',
  since: '2026-10-25',
  reason: 'HTTP 403 for the corporate-actions splits endpoint (run 40221353332); owner: no further access attempts until Tiingo enables it',
  unlockedBy: null,
  unlockRequires: Object.freeze(['written Tiingo confirmation that the endpoint is enabled within the existing subscription at no extra cost', 'owner approval for one stage-B run (<= 4 + 90 requests)', 'plan run with 0 requests showing distinct tickers <= 90']),
});
export const probeSpecSha256 = () => crypto.createHash('sha256').update(JSON.stringify(PROBE_SPEC)).digest('hex');
const tally = (rows, key) => rows.reduce((o, r) => { const k = key(r); if (k != null) o[k] = (o[k] || 0) + 1; return o; }, {});
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const days = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const groupOf = (reason) => Object.entries(PROBE_SPEC.reasonGroups).find(([, v]) => v.includes(reason))?.[0] ?? 'OTHER';

/** Throttled, capped Tiingo client: never more than `cap` requests (fail closed), >= minIntervalMs apart, no retries. */
export function createTiingoClient({ key, cap, fetchImpl = null, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), throttle = PROBE_SPEC.throttle }) {
  if (!key) throw new Error('TIINGO_KEY_MISSING');
  // third lock: the real network (no injected fetchImpl) only when the gate is UNLOCKED
  if (!fetchImpl && PROBE_GATE.state !== 'UNLOCKED') throw new Error('PROBE_FROZEN');
  fetchImpl = fetchImpl || fetch;
  let used = 0, last = -Infinity, refused = 0;
  const strip = (t) => String(t ?? '').split(key).join('<token>').replace(/\s+/g, ' ').slice(0, 300);
  return {
    used: () => used, refused: () => refused,
    async get(url) {
      if (used >= cap) { refused++; return { refused: true }; }
      const wait = last + throttle.minIntervalMs - now(); if (wait > 0) await sleep(wait);
      last = now(); used++;
      try {
        const r = await fetchImpl(url, { headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(throttle.timeoutMs) });
        const text = await r.text();
        let body = null; try { body = JSON.parse(text); } catch { body = null; }
        return { status: r.status, ok: r.ok, body, message: r.ok && Array.isArray(body) ? null : strip(body?.detail ?? body?.message ?? text) };
      } catch (e) { return { status: 'ERROR', ok: false, body: null, message: strip(e?.name || 'ERROR') }; }
    },
  };
}
const exDateOf = (x) => String(x?.exDate ?? '').slice(0, 10);
const recordsOf = (body) => (Array.isArray(body) ? body.filter((x) => x && typeof x === 'object') : []);
const matches = (rec, e) => !!rec && Number(rec.splitFrom) === e.splitFrom && Number(rec.splitTo) === e.splitTo && days(exDateOf(rec), e.exDate) <= e.dateToleranceDays;

/** Stage A: the fixed public access probe. */
export async function stageA(client) {
  const out = [];
  for (const q of PROBE_SPEC.stageA.requests) {
    const url = q.kind === 'ticker' ? `${BASE_URL}/${q.ticker}/splits?startExDate=${q.startExDate}` : `${BASE_URL}/splits?exDate=${q.exDate}`;
    const r = await client.get(url);
    if (r.refused) { out.push({ id: q.id, status: 'NOT_SENT_CAP' }); continue; }
    const recs = recordsOf(r.body), fields = [...new Set(recs.flatMap((x) => Object.keys(x)))].sort();
    const cand = q.kind === 'batch' ? recs.filter((x) => String(x.ticker ?? '').toLowerCase() === q.expect.ticker) : recs;
    out.push({ id: q.id, status: r.status, isArray: Array.isArray(r.body), records: recs.length, fields, expectedSplitFound: cand.some((x) => matches(x, q.expect)), permaTickerPresent: recs.some((x) => x.permaTicker != null && x.permaTicker !== ''), message: r.ok && Array.isArray(r.body) ? null : r.message });
  }
  const access = PROBE_SPEC.stageA.accessRequires.every((id) => { const x = out.find((y) => y.id === id); return x && x.status === 200 && x.isArray; });
  return { requests: out, access, used: client.used() };
}

/**
 * Stage B classification of one session (pure). records: the ticker's split records (or null when not found), raw /
 * calendar of the snapshot, i the session index in raw, d its date.
 */
export function classifySession({ records, found, raw, i, calendar, windowSessions = PROBE_SPEC.windowSessions }) {
  const calIdx = new Map(calendar.map((x, k) => [x, k])), d = raw[i].date, di = calIdx.get(d) ?? -1;
  if (!found) return { cls: 'TICKER_NOT_FOUND' };
  if (!records.length) return { cls: 'NO_SPLIT_RECORDS' };
  const sessIdx = (e) => { const k = calendar.findIndex((x) => x >= e); return k < 0 ? null : k; };
  const inWin = records.filter((x) => { const k = sessIdx(exDateOf(x)); return k !== null && di >= 0 && Math.abs(k - di) <= windowSessions; });
  // the EOD field of the same snapshot within +-windowSessions of d
  const eodNear = di < 0 ? [] : raw.filter((b) => { const k = calIdx.get(b.date); return k !== undefined && Math.abs(k - di) <= windowSessions && fin(b.splitFactor) && b.splitFactor !== 1 && b.splitFactor > 0; });
  if (!inWin.length) return { cls: 'SPLIT_EVENT_ELSEWHERE', eodSplitNearSession: eodNear.length > 0 };
  const rec = inWin[0], f = Number(rec.splitFactor) || (Number(rec.splitTo) / Number(rec.splitFrom)), c = fin(f) && f > 0 ? 1 / f : null;
  const g = c ? snapFactor(c) : [], p = raw[i - 1], b = raw[i];
  const closeRel = p && fin(p.close) && p.close > 0 && fin(b.close) ? b.close / p.close : null, openRel = p && fin(p.close) && p.close > 0 && fin(b.open) ? b.open / p.close : null;
  const same = (x) => { const s = x ? snapFactor(x) : []; return g.length === 1 && s.length === 1 && Math.abs(Math.log(s[0] / g[0])) < 1e-9; };
  const ek = raw.findIndex((x) => x.date >= exDateOf(rec));
  const eodAtEx = ek >= 0 && fin(raw[ek].splitFactor) && raw[ek].splitFactor !== 1 ? raw[ek].splitFactor : null;
  return {
    cls: 'SPLIT_EVENT_IN_WINDOW', eventsInWindow: inWin.length, status: String(rec.splitStatus ?? '?').toLowerCase(), onGrid: g.length === 1,
    ratioMatchesOpen: same(openRel), ratioMatchesClose: same(closeRel),
    eodCarriesSameFactor: eodAtEx !== null && fin(f) && Math.abs(Math.log(eodAtEx / f)) < 1e-6, eodCarriesOtherFactor: eodAtEx !== null && !(fin(f) && Math.abs(Math.log(eodAtEx / f)) < 1e-6), eodSplitNearSession: eodNear.length > 0,
    exDate: exDateOf(rec), splitFrom: rec.splitFrom, splitTo: rec.splitTo, splitFactor: f,
  };
}

/** The request-free plan of stage B: scope, distinct tickers (= requests), cap check, per reason group. Counts only. */
export function planSummary({ inScope, byTicker, tickers, identityOf }) {
  const grp = tally(inScope, (c) => groupOf(c.result.reason));
  return {
    plan: true, requests: 0, sessions: inScope.length, distinctTickers: tickers.length, plannedRequests: tickers.length,
    cap: PROBE_SPEC.stageB.maxRequests, fitsCap: tickers.length <= PROBE_SPEC.stageB.maxRequests,
    sessionsWithoutTicker: inScope.length - [...byTicker.values()].reduce((n, xs) => n + xs.length, 0),
    noCikSessions: inScope.filter((c) => !identityOf(c).sec?.cik).length,
    byReasonGroup: grp,
    earliestStartYear: tickers.length ? Number(addDays([...byTicker.values()].flat().map((c) => c.date).sort()[0], PROBE_SPEC.stageB.startExDateOffsetDays).slice(0, 4)) : null,
  };
}

/** Stage B as a caResolutionPart refinement; throws ProbeDone so the CA datasets are never built (a probe changes nothing). */
export class ProbeDone extends Error { constructor(result) { super('PROBE_DONE'); this.result = result; } }
export function stageBRefine({ client = null, expectedCount = null, plan = false }) {
  return async ({ cands, identityOf, segs, baseDs, log = () => {} }) => {
    const inScope = cands.filter((c) => c.result.cls === CLASSES.UNRESOLVED && c.exposedRefs.length && c.level === 'K5');
    if (expectedCount !== null && inScope.length !== expectedCount) throw new Error(`PROBE_SCOPE_COUNT_MISMATCH: ${inScope.length} != ${expectedCount}`);
    const tickerOf = (c) => String(c.listing).split(':')[2]?.toLowerCase() ?? null;
    const byTicker = new Map();
    for (const c of inScope) { const t = tickerOf(c); if (!t) continue; if (!byTicker.has(t)) byTicker.set(t, []); byTicker.get(t).push(c); }
    const tickers = [...byTicker.keys()].sort();
    log(`stage B: ${inScope.length} sessions, ${tickers.length} distinct tickers`);
    if (plan) throw new ProbeDone({ pub: planSummary({ inScope, byTicker, tickers, identityOf }), sealed: [] });
    if (tickers.length > PROBE_SPEC.stageB.maxRequests) throw new Error(`PROBE_STAGE_B_OVER_CAP: ${tickers.length}`);
    if (!client) throw new Error('PROBE_CLIENT_MISSING');
    const resp = new Map();
    for (const t of tickers) {
      const start = addDays(byTicker.get(t).map((c) => c.date).sort()[0], PROBE_SPEC.stageB.startExDateOffsetDays);
      const r = await client.get(`${BASE_URL}/${encodeURIComponent(t)}/splits?startExDate=${start}`);
      resp.set(t, r.refused ? { found: false, refused: true, records: [] } : { status: r.status, found: r.status === 200 && Array.isArray(r.body), records: recordsOf(r.body) });
    }
    const rows = inScope.map((c) => {
      const t = tickerOf(c), r = resp.get(t) ?? { found: false, records: [] }, sec = identityOf(c).sec;
      const x = classifySession({ records: r.records, found: r.found, raw: segs[c.j].raw, i: c.i, calendar: baseDs.calendar });
      const perma = [...new Set(r.records.map((y) => y.permaTicker).filter(Boolean))];
      return { c, t, x, group: groupOf(c.result.reason), noCik: !sec?.cik, permaTickers: perma.length, status: r.status ?? null, refused: !!r.refused };
    });
    const grp = {};
    for (const g of [...Object.keys(PROBE_SPEC.reasonGroups), 'OTHER']) {
      const xs = rows.filter((r) => r.group === g); if (!xs.length && g === 'OTHER') continue;
      grp[g] = { sessions: xs.length, eventInWindow: xs.filter((r) => r.x.cls === 'SPLIT_EVENT_IN_WINDOW').length, ratioMatchesOpen: xs.filter((r) => r.x.ratioMatchesOpen).length, ratioMatchesClose: xs.filter((r) => r.x.ratioMatchesClose).length, eventElsewhere: xs.filter((r) => r.x.cls === 'SPLIT_EVENT_ELSEWHERE').length, noRecords: xs.filter((r) => r.x.cls === 'NO_SPLIT_RECORDS').length, tickerNotFound: xs.filter((r) => r.x.cls === 'TICKER_NOT_FOUND').length };
    }
    const win = rows.filter((r) => r.x.cls === 'SPLIT_EVENT_IN_WINDOW');
    const pub = {
      sessions: inScope.length, distinctTickers: tickers.length, requests: client.used(), refusedOverCap: client.refused(),
      httpStatus: tally([...resp.values()], (r) => String(r.refused ? 'NOT_SENT_CAP' : r.status)),
      byClass: tally(rows, (r) => r.x.cls),
      inWindow: { sessions: win.length, onGrid: win.filter((r) => r.x.onGrid).length, ratioMatchesOpen: win.filter((r) => r.x.ratioMatchesOpen).length, ratioMatchesClose: win.filter((r) => r.x.ratioMatchesClose).length, splitStatus: tally(win, (r) => r.x.status) },
      byReasonGroup: grp,
      independence: {
        // same Tiingo source if the EOD splitFactor already carries the endpoint event on its exDate
        eventInWindowEodCarriesSameFactor: win.filter((r) => r.x.eodCarriesSameFactor).length,
        eventInWindowEodCarriesOtherFactor: win.filter((r) => r.x.eodCarriesOtherFactor).length,
        endpointOnly: win.filter((r) => !r.x.eodCarriesSameFactor && !r.x.eodCarriesOtherFactor && !r.x.eodSplitNearSession).length,
        eodOnly: rows.filter((r) => r.x.cls !== 'SPLIT_EVENT_IN_WINDOW' && r.x.eodSplitNearSession).length,
      },
      permaTicker: { sessionsWithPermaTicker: rows.filter((r) => r.permaTickers > 0).length, noCikSessions: rows.filter((r) => r.noCik).length, noCikWithPermaTicker: rows.filter((r) => r.noCik && r.permaTickers > 0).length, tickersWithSeveralPermaTickers: [...new Set(rows.filter((r) => r.permaTickers > 1).map((r) => r.t))].length },
    };
    const sealed = rows.map((r) => ({ segmentId: r.c.segmentId, date: r.c.date, ticker: r.t, reason13: r.c.result.reason, group: r.group, noCik: r.noCik, status: r.status, class: r.x, records: (resp.get(r.t)?.records || []).map((y) => ({ exDate: exDateOf(y), splitFrom: y.splitFrom, splitTo: y.splitTo, splitFactor: y.splitFactor, splitStatus: y.splitStatus, permaTicker: y.permaTicker ?? null, ticker: y.ticker ?? null })) }));
    log(`stage B: requests ${client.used()}, in window ${win.length}`);
    throw new ProbeDone({ pub, sealed });
  };
}

async function main() {
  const argv = process.argv.slice(2), arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (arg('--accounting') !== 'research-v1') { console.error('RESEARCH_ACCOUNTING_REQUIRED'); process.exit(2); }
  const snapshotId = arg('--snapshot');
  if (!/^sts1-[0-9a-f]{32}$/.test(snapshotId || '')) { console.error('SNAPSHOT_REQUIRED'); process.exit(2); }
  const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
  const PLAN = argv.includes('--plan');
  if (!PLAN && PROBE_GATE.state !== 'UNLOCKED') { console.error(`PROBE_FROZEN: ${PROBE_GATE.reason}`); process.exit(2); }
  const KEY = PLAN ? null : process.env.TIINGO_API_KEY; if (!PLAN && !KEY) { console.error('TIINGO_KEY_MISSING'); process.exit(2); }
  if (rulesetSha256V130() !== PROBE_SPEC.baseRulesetSha256) { console.error('BASE_RULESET_1_3_0_CHANGED'); process.exit(2); }
  const t0 = Date.now(), log = (m) => console.log(`[sf7-tiingo-probe +${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
  fs.mkdirSync(OUT, { recursive: true });
  const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  const receipt = { schema: 'supertrader-sf7-tiingo-splits-probe-receipt-1.0.0', certification: FOUNDATION.certification, probe: PROBE_VERSION, probeSpecSha256: probeSpecSha256(), snapshotId, accounting: FOUNDATION.accounting.mode, runId: process.env.GITHUB_RUN_ID || 'local', commit: process.env.GITHUB_SHA || null };
  receipt.plan = PLAN; receipt.gate = PROBE_GATE.state;
  // ---- Stage A (never in the plan: the plan sends nothing to Tiingo)
  const A = PLAN ? { skipped: 'PLAN_NO_REQUESTS', used: 0, access: null } : await stageA(createTiingoClient({ key: KEY, cap: PROBE_SPEC.stageA.maxRequests }));
  log(`stage A: ${A.used} requests, access ${A.access}`);
  const write = (pub, sealed) => {
    fs.writeFileSync(path.join(OUT, 'sf7-tiingo-splits-probe.public.json'), JSON.stringify(pub, null, 1) + '\n');
    fs.writeFileSync(path.join(OUT, 'sf7-tiingo-splits-probe.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify({ receipt, public: pub, sessions: sealed }))));
  };
  if (!PLAN && !A.access) { write({ schema: 'supertrader-sf7-tiingo-splits-probe-public-1.0.0', receipt, stageA: A, stageB: { skipped: 'NO_ACCESS_STOP_AFTER_STAGE_A' } }, []); log('stop after stage A (no access)'); return; }
  // ---- Stage B: recompute the 83 exactly as run-sf7-ca-edgar.mjs (1.3.0 unchanged; EDGAR lookups from the cache only)
  const K = await import('../../snapshot/contract.mjs');
  let pit, secPit, shares, live, cache = null, datasetSha256;
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
    const driver = await opened.io.createDriver();
    const buf = await driver.get(pit.mine.seriesPrefix + '_validation/sec-pit-r12.json.gz');
    secPit = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : {};
    const sbuf = await live.get(pit.mine.seriesPrefix + SEC_SHARES_KEYS.r14);
    if (!sbuf) K.fail(K.REASON.INPUT_INTEGRITY_FAILURE, 'SEC_PIT_R14_MISSING');
    const r14 = JSON.parse(zlib.gunzipSync(sbuf).toString('utf8'));
    shares = new Map(Object.entries(r14).filter(([, x]) => Array.isArray(x?.shares) && x.shares.length).map(([id, x]) => [id, { cik: x.cik, how: x.how, taxonomy: x.taxonomy ?? null, shares: x.shares }]));
    const cbuf = await live.get(pit.mine.seriesPrefix + EDGAR_CACHE_KEY);
    if (cbuf) cache = JSON.parse(zlib.gunzipSync(cbuf).toString('utf8'));
    log(`snapshot ${snapshotId}: dataset ${v.datasetVerified}; EDGAR cache ${cache ? 'loaded' : 'none'}`);
  } catch (e) {
    console.error(e instanceof K.SnapshotError ? `${K.REASON.INPUT_INTEGRITY_FAILURE}: ${e.code}${e.detail ? ' ' + e.detail : ''}` : `INPUT_INTEGRITY_FAILURE: UNEXPECTED_ERROR ${e?.code ?? ''}`);
    process.exit(3);
  }
  const ds = datasetFromPit(pit); attachSecPit(ds, secPit);
  const listingPeriods = new Map(pit.listings.map((l) => [l.id, { startDate: l.startDate, listEnd: l.listEnd || null }]));
  // the 1.3.0 EDGAR index lookups only from the cache: a client that cannot send (budget 0)
  const { UA } = await import('../../validation/sec-pit.mjs');
  const { EDGAR_BUDGET } = await import('../integrity/ca-edgar.mjs');
  const edgar = createEdgarClient({ userAgent: UA, budget: { ...EDGAR_BUDGET, totalRequests: 0 }, cache, fetchImpl: async () => { throw new Error('NEVER'); } });
  const evidenceInputs = { secShares: 'r14', secSharesKey: SEC_SHARES_KEYS.r14, datasetSha256, snapshotId };
  const authoritative = snapshotId === SF6_RUN_FACTS.integrity.snapshotId;
  const clientB = PLAN ? null : createTiingoClient({ key: KEY, cap: PROBE_SPEC.stageB.maxRequests });
  let B = null;
  try {
    await caResolutionPart(ds, pit.segs, { sharesByListing: shares, listingPeriods, fetchFilings: (cik) => edgar.submissions13(cik), secFetchMax: 150, snapshotId, evidenceInputs, refine: stageBRefine({ client: clientB, plan: PLAN, expectedCount: authoritative ? EXPECTED_SCOPE_SESSIONS : null }), log });
    console.error('PROBE_DID_NOT_RUN'); process.exit(6);
  } catch (e) {
    if (!(e instanceof ProbeDone)) { console.error(String(e?.message || e).startsWith('PROBE_') ? e.message : String(e?.stack || e)); process.exit(6); }
    B = e.result;
  }
  if (edgar.stats().requests !== 0) { console.error('EDGAR_REQUESTS_NOT_ZERO'); process.exit(7); }
  if (clientB && clientB.used() > PROBE_SPEC.stageB.maxRequests) { console.error('PROBE_CAP_BREACH'); process.exit(7); }
  if (PLAN && !B.pub.fitsCap) { write({ schema: 'supertrader-sf7-tiingo-splits-probe-public-1.0.0', receipt, stageA: A, stageB: { ...B.pub, edgarRequests: edgar.stats().requests } }, []); console.error(`PROBE_STAGE_B_OVER_CAP: ${B.pub.distinctTickers}`); process.exit(5); }
  write({ schema: 'supertrader-sf7-tiingo-splits-probe-public-1.0.0', receipt, stageA: A, stageB: { ...B.pub, edgarRequests: edgar.stats().requests } }, B.sealed);
  log('done; public sf7-tiingo-splits-probe.public.json');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
