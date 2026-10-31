// Supertrader 9 – isolated V13 delisted reuse study (A vs B). Synthetic fixtures only: no provider data, no private
// series, no network. Everything is written to os.tmpdir().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as S from '../source-faithful/research/st9-v13-delisted-study.mjs';
import { verifyRegistration, REGISTRATION_SHA256, REGISTRATION_FILE } from '../source-faithful/research/run-st9-v13-delisted-study.mjs';
import { securityFromSegment } from '../source-faithful/runner/snapshot-input.mjs';
import { REFERENCE_COSTS, SF6_REFERENCE_KEYS } from '../source-faithful/research/sf6-references.mjs';

const require = createRequire(import.meta.url);
const Delisted = require('../../../quant/engines/research-delisted-series.cjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WIN = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2017-06-30' });

// business days 2014-06-02 .. 2018-06-29 (the session calendar of the fixture)
const CAL = (() => { const out = []; for (let t = Date.UTC(2014, 5, 2); t <= Date.UTC(2018, 5, 29); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); } return out; })();
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
/** Daily provider rows (raw, unadjusted) between two dates; drift per day, optional split and one-day jump. */
function rows(from, to, { c0 = 20, drift = 0.001, seed = 1, split = null, jump = null, volume = 1e6, noise = 0.004 } = {}) {
  const r = rng(seed), out = []; let c = c0;
  for (const d of CAL) {
    if (d < from || d > to) continue;
    let sf = 1;
    if (split && d === split.date) { sf = split.factor; c = c / split.factor; }
    if (jump && d === jump.date) c = c * jump.factor;
    const o = c; c = c * (1 + drift + noise * (r() - 0.5));
    out.push([d, o, Math.max(o, c) * 1.003, Math.min(o, c) * 0.997, Number(c.toFixed(4)), volume, null, 0, sf]);
  }
  return out;
}
const COLS = ['date', 'open', 'high', 'low', 'close', 'volume', 'adjClose', 'divCash', 'splitFactor'];
const rawBars = (rs) => rs.map((x) => ({ date: x[0], open: x[1], high: x[2], low: x[3], close: x[4], volume: x[5], adjClose: x[6], dividend: x[7], splitFactor: x[8] }));
const round6 = (v) => Math.round(v * 1e6) / 1e6;

/** A synthetic V13 archive: register (in a temp root), weekly series dir and daily raw dir. */
function archive(chains, { tamper = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-root-')), priv = fs.mkdtempSync(path.join(os.tmpdir(), 'st9-priv-'));
  const series = path.join(priv, 'series'), raw = path.join(priv, 'raw', '40000000001');
  fs.mkdirSync(series, { recursive: true }); fs.mkdirSync(raw, { recursive: true });
  const regRows = [], lines = [];
  for (const c of chains) {
    const pts = S.weeklyFromDaily(rawBars(c.rows)).map(([d, v]) => [d, round6(v)]);
    const scen = S.V13_TERMINAL_SCENARIOS[c.cls];
    const doc = { ticker: c.ticker, cik: c.cik, status: 'QUALIFIED', points: pts, totalReturn: pts, lastTradeDate: pts.at(-1)[0], lastRawClose: c.rows.at(-1)[4], terminal: { class: c.cls, scenarios: [...scen], secEventDate: null, reason: null }, chain: { startDate: c.rows[0][0], endDate: pts.at(-1)[0] }, chainId: c.id, exchange: 'NASDAQ', pointsSha256: Delisted.pointsHash(pts) };
    if (tamper?.weekly === c.id) doc.points[3] = [doc.points[3][0], doc.points[3][1] * 1.01];
    if (tamper?.terminal === c.id) doc.terminal.scenarios = [0, -0.2, -1];
    if (tamper?.missingFile !== c.id) fs.writeFileSync(path.join(series, c.id + '.json'), JSON.stringify(doc));
    regRows.push([c.id, c.cik, '2015-2019', '2015-2019', 'QUALIFIED', true, c.cls, pts.length, false, doc.pointsSha256]);
    const daily = c.rows.map((x) => [...x]);
    if (tamper?.daily === c.id) { const k = daily.findIndex((x) => new Date(`${x[0]}T00:00:00Z`).getUTCDay() === 5 && x[0] > '2015-06-01'); daily[k][4] *= 1.02; }
    if (tamper?.noDaily !== c.id) lines.push(JSON.stringify({ ticker: c.ticker, control: false, metaHttp: 200, meta: null, pricesHttp: 200, cols: COLS, rows: daily }));
  }
  regRows.push(['ffffffffffffffff', null, '2000-2004', '2010-2014', 'EXCLUDED_NO_CIK_LINK', null, null, null, false, null]);
  const reg = { schemaVersion: 'v13-delisted-register-1.0.0', evidenceKind: 'SOURCE_EVIDENCE', certificationStatus: 'NOT_CERTIFIED', productionApproved: false, controls: { pass: true }, columns: ['chainId', 'cik', 'startYearBucket', 'endYearBucket', 'status', 'endSourced', 'terminalClass', 'weeks', 'gapCut', 'pointsSha256'], rows: regRows };
  const regFile = path.join(root, Delisted.REGISTER); fs.mkdirSync(path.dirname(regFile), { recursive: true });
  fs.writeFileSync(regFile, JSON.stringify(reg));
  fs.writeFileSync(path.join(raw, 'series.jsonl.gz'), zlib.gzipSync(lines.join('\n') + '\n'));
  const registerSha256 = crypto.createHash('sha256').update(fs.readFileSync(regFile)).digest('hex');
  return { root, series, raw: path.join(priv, 'raw'), registerSha256 };
}
const load = (a) => S.loadV13Additions({ root: a.root, seriesDir: a.series, rawDir: a.raw, expectedRegisterSha256: a.registerSha256 });

/** Universe A from provider-like raw rows through the production path. */
function secA(id, rs, endCause = 'ACTIVE') { return securityFromSegment({ id, raw: rawBars(rs), endCause, delisted: endCause !== 'ACTIVE', survivor: endCause === 'ACTIVE' }); }
function dsA(securities) { return { calendar: CAL.filter((d) => d >= WIN.from && d <= WIN.to), securities, spyTR: [], benchmark: CAL.map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1, splitAdj: 1 })) }; }
const A0 = () => dsA([secA('tiingo:NYSE:BASE:2010-01-04', rows('2014-06-02', '2018-06-29', { seed: 7, drift: 0.0002 })), secA('tiingo:NASDAQ:AAA:2014-06-02', rows('2014-06-02', '2016-03-31', { seed: 8 }), 'LISTING_INACTIVE')]);

test('registration is pinned, frozen parameters reference the unchanged REF configuration', () => {
  assert.equal(verifyRegistration(ROOT), REGISTRATION_SHA256);
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRATION_FILE), 'utf8'));
  assert.equal(reg.productionApproved, false);
  assert.deepEqual(reg.terminalScenarios.values, { MERGER: [0, -0.1, 0.1], DISTRESS: [0, -0.3, -1], UNKNOWN: [0, -0.3, -1] });
  assert.deepEqual(JSON.parse(JSON.stringify(S.V13_TERMINAL_SCENARIOS)), reg.terminalScenarios.values);
  assert.equal(reg.references.sha256['docs/quant-recovery/v13/delisted/register-1.0.0.json'], S.V13_REGISTER_SHA256);
  const p = S.studyParameters();
  assert.deepEqual(p.costs, { ...REFERENCE_COSTS });
  assert.deepEqual(S.STUDY_METHODS.slice(0, 3), ['MINERVINI_SEPA', 'MINERVINI_POWER_PLAY', 'KK_BREAKOUT']);
  assert.deepEqual([...S.STUDY_METHODS].sort(), [...SF6_REFERENCE_KEYS].sort());
  assert.throws(() => S.studyParameters({ methods: ['NEW_METHOD'] }), /UNKNOWN_METHOD/);
});

test('the real register hash matches the pinned value (public file, no private data)', () => {
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, Delisted.REGISTER))).digest('hex');
  assert.equal(h, S.V13_REGISTER_SHA256);
});

test('ISO week keys match Python isocalendar at year boundaries', () => {
  assert.equal(S.isoWeek('2021-01-03'), '2020-W53');
  assert.equal(S.isoWeek('2021-01-04'), '2021-W1');
  assert.equal(S.isoWeek('2018-12-31'), '2019-W1');
  assert.equal(S.isoWeek('2016-01-01'), '2015-W53');
});

test('daily bars bind to the hash-bound weekly series (incl. a declared split); every chain is loaded', () => {
  const a = archive([{ id: 'aaaa000000000001', ticker: 'OLDA', cik: '101', cls: 'MERGER', rows: rows('2014-06-02', '2016-06-30', { seed: 2, split: { date: '2015-09-01', factor: 2 } }) }]);
  const v = load(a);
  assert.equal(v.chains.length, 1);
  assert.equal(v.chains[0].lastTradeDate, '2016-06-30');
  assert.equal(v.provenance.registerSha256, a.registerSha256);
});

test('fail closed: register hash, weekly hash, daily mismatch, missing series, missing daily, terminal mapping', () => {
  const c = { id: 'bbbb000000000001', ticker: 'OLDB', cik: '102', cls: 'UNKNOWN', rows: rows('2014-06-02', '2016-06-30', { seed: 3 }) };
  const ok = archive([c]);
  assert.throws(() => S.loadV13Additions({ root: ok.root, seriesDir: ok.series, rawDir: ok.raw }), /V13_REGISTER_HASH_MISMATCH/); // pinned real hash
  assert.throws(() => load(archive([c], { tamper: { weekly: c.id } })), /V13_WEEKLY_BINDING_FAILED.*DELISTED_POINTS_HASH_MISMATCH/);
  assert.throws(() => load(archive([c], { tamper: { daily: c.id } })), /V13_DAILY_WEEKLY_BINDING_MISMATCH/);
  assert.throws(() => load(archive([c], { tamper: { missingFile: c.id } })), /V13_SERIES_MISSING/);
  assert.throws(() => load(archive([c], { tamper: { noDaily: c.id } })), /V13_DAILY_MISSING/);
  assert.throws(() => load(archive([c], { tamper: { terminal: c.id } })), /V13_TERMINAL_SCENARIO_MISMATCH/);
  assert.throws(() => S.loadV13Additions({ root: ok.root, seriesDir: ok.series, rawDir: path.join(ok.raw, 'nope'), expectedRegisterSha256: ok.registerSha256 }), /V13_DAILY_DIR_MISSING/);
  assert.throws(() => S.loadV13Additions({ root: ok.root, seriesDir: '/nonexistent/st9', rawDir: ok.raw, expectedRegisterSha256: ok.registerSha256 }), /V13_SERIES_DIR_MISSING/);
});

test('dedupe: overlap with an A listing (securityId, series, CIK) and inside B is excluded and counted; a reused ticker is kept', () => {
  const ds = A0();
  const lastA = ds.securities[1].bars.at(-1); // AAA, A-listing 2014-06 .. 2016-03
  const dupSeries = rows('2014-06-02', '2016-03-31', { seed: 8 }); // byte-identical history under another ticker
  assert.equal(dupSeries.at(-1)[4], lastA.rawClose);
  const v = load(archive([
    { id: 'c000000000000001', ticker: 'BASE', cik: '201', cls: 'MERGER', rows: rows('2015-03-02', '2016-02-26', { seed: 9 }) }, // same securityId as A's (open-ended) BASE listing, overlapping
    { id: 'c000000000000002', ticker: 'AAA', cik: '202', cls: 'MERGER', rows: rows('2016-06-01', '2017-03-31', { seed: 10 }) }, // reused ticker after A's listing ended -> kept
    { id: 'c000000000000003', ticker: 'ZZZ', cik: '203', cls: 'UNKNOWN', rows: dupSeries }, // same series as A's AAA
    { id: 'c000000000000004', ticker: 'CIKA', cik: '777', cls: 'UNKNOWN', rows: rows('2015-01-02', '2016-05-31', { seed: 11 }) }, // same CIK as A's BASE
    { id: 'c000000000000005', ticker: 'DUPB1', cik: '300', cls: 'DISTRESS', rows: rows('2015-01-02', '2016-05-31', { seed: 12 }) },
    { id: 'c000000000000006', ticker: 'DUPB2', cik: '300', cls: 'DISTRESS', rows: rows('2015-06-01', '2016-08-31', { seed: 13 }) }, // same CIK inside B, later
    { id: 'c000000000000007', ticker: 'OLD', cik: '400', cls: 'MERGER', rows: rows('2014-06-02', '2014-12-15', { seed: 14 }) }, // ends before the warm-up
  ]));
  const r = S.buildUniverseB(ds, v.chains, { window: WIN, aCikByListing: new Map([['tiingo:NYSE:BASE:2010-01-04', '777']]) });
  assert.deepEqual(r.census.excluded, { DUPLICATE_A_SECURITY_ID_INTERVAL: 1, DUPLICATE_A_SERIES: 1, DUPLICATE_A_CIK_INTERVAL: 1, DUPLICATE_WITHIN_B: 1, OUTSIDE_WINDOW: 1 });
  assert.equal(r.census.added, 2);
  assert.deepEqual([...r.addedIds].sort(), ['v13dl:NASDAQ:c000000000000002', 'v13dl:NASDAQ:c000000000000005']);
  assert.equal(r.dsB.securities.length, ds.securities.length + 2);
  assert.ok(ds.securities.every((s, i) => r.dsB.securities[i] === s), 'A is unchanged inside B');
});

test('point in time: bars only inside the chain interval and the window; delisting at the actual last traded day', () => {
  const v = load(archive([
    { id: 'd000000000000001', ticker: 'PITA', cik: '501', cls: 'DISTRESS', rows: rows('2014-06-02', '2016-06-30', { seed: 21 }) },
    { id: 'd000000000000002', ticker: 'PITB', cik: '502', cls: 'MERGER', rows: rows('2016-02-01', '2017-12-29', { seed: 22 }) },
  ]));
  const r = S.buildUniverseB(dsA([]), v.chains, { window: WIN });
  const a = r.dsB.securities.find((s) => s.id === 'v13dl:NASDAQ:d000000000000001'), b = r.dsB.securities.find((s) => s.id === 'v13dl:NASDAQ:d000000000000002');
  assert.ok(a.bars[0].date >= WIN.warmupFrom, 'nothing before the warm-up');
  assert.equal(a.bars.at(-1).date, '2016-06-30');
  assert.deepEqual({ cause: a.terminal.cause, date: a.terminal.date }, { cause: 'LISTING_INACTIVE', date: '2016-06-30' });
  assert.equal(a.v13.terminalClass, 'DISTRESS');
  assert.equal(b.bars[0].date, '2016-02-01');
  assert.equal(b.bars.at(-1).date, WIN.to, 'cut at the window end, nothing after it');
  assert.equal(b.terminal, null, 'a chain listed beyond the window end has no economic terminal (WINDOW_END)');
  assert.equal(r.census.addedLastTradeInWindow, 1);
  assert.equal(r.census.addedWindowEnd, 1);
});

test('coverage diagnostic: a dropped short last segment is counted (terminalSegmentTooShort); behaviour unchanged', () => {
  const v = load(archive([
    // 2015-01 .. 2016-03, gap > 30 days, then 13 sessions before the last traded day 2016-06-17 (inside the window)
    { id: 'g000000000000001', ticker: 'SHRT', cik: '801', cls: 'DISTRESS', rows: [...rows('2015-01-02', '2016-03-31', { seed: 41 }), ...rows('2016-06-01', '2016-06-17', { seed: 42 })] },
    { id: 'g000000000000002', ticker: 'FULL', cik: '802', cls: 'MERGER', rows: rows('2015-01-02', '2016-06-30', { seed: 43 }) },
    // listed beyond the window end, short last segment inside the window (2017-06-12 .. 2017-06-30)
    { id: 'g000000000000003', ticker: 'OPEN', cik: '803', cls: 'UNKNOWN', rows: [...rows('2015-01-02', '2017-04-28', { seed: 44 }), ...rows('2017-06-12', '2017-12-29', { seed: 45 })] },
  ]));
  const r = S.buildUniverseB(dsA([]), v.chains, { window: WIN });
  const shrt = r.dsB.securities.filter((s) => s.id.startsWith('v13dl:NASDAQ:g000000000000001'));
  assert.equal(shrt.length, 1, 'the short last segment is dropped (registered rule, unchanged)');
  assert.equal(shrt[0].bars.at(-1).date, '2016-03-31');
  assert.equal(shrt[0].terminal.cause, 'DATA_GAP', 'the delisting is censored, not booked as LISTING_INACTIVE');
  const open = r.dsB.securities.filter((s) => s.id.startsWith('v13dl:NASDAQ:g000000000000003'));
  assert.equal(open.length, 1); assert.equal(open[0].terminal.cause, 'DATA_GAP');
  assert.equal(r.census.added, 3);
  assert.equal(r.census.addedLastTradeInWindow, 2, 'SHRT still counts as a delisting inside the window');
  assert.deepEqual(r.census.addedByTerminalClass, { DISTRESS: 1, MERGER: 1, UNKNOWN: 1 });
  assert.equal(r.census.terminalSegmentTooShort, 1);
  assert.deepEqual(r.census.terminalSegmentTooShortByClass, { DISTRESS: 1 });
  assert.equal(r.census.windowEndSegmentTooShort, 1);
  assert.equal(r.census.addedTerminalBooked, 1, 'only FULL is settled as LISTING_INACTIVE');
  assert.equal(r.dsB.securities.filter((s) => s.terminal?.cause === 'LISTING_INACTIVE').length, r.census.addedTerminalBooked);
});

/** A rising chain that is held by Turtle S1 when it delists. */
function heldIntoDelisting(cls) {
  const v = load(archive([{ id: 'e000000000000001', ticker: 'RISE', cik: '601', cls, rows: rows('2015-01-02', '2016-09-30', { seed: 31, drift: 0.004, noise: 0.02, c0: 15 }) }]));
  const A = A0(), B = S.buildUniverseB(A, v.chains, { window: WIN });
  const params = S.studyParameters({ methods: ['TURTLE_S1'], window: WIN });
  return { A, B, params, res: S.runStudy({ dsA: A, dsB: B.dsB, addedIds: B.addedIds, params }) };
}

test('forced exit at delisting: settled at the last traded close (T0), V13 terminal scenarios as a band', () => {
  const { res } = heldIntoDelisting('DISTRESS');
  const m = res.methods.TURTLE_S1;
  assert.equal(m.B.delisting.byOrigin.B_ADDED, 1, 'the added chain is held into its delisting');
  assert.equal(m.B.delisting.addedByTerminalClass.DISTRESS, 1);
  assert.equal(m.A.delisting.byOrigin.B_ADDED, undefined);
  const t0 = m.B.scenarios.V13_T0, t1 = m.B.scenarios.V13_T1, t2 = m.B.scenarios.V13_T2;
  assert.equal(t0.terminalShockTotal, 0);
  assert.ok(t2.terminalShockTotal < 0 && t1.terminalShockTotal < 0);
  assert.ok(Math.abs(t1.terminalShockTotal / t2.terminalShockTotal - 0.3) < 1e-9, '-30 % vs -100 % of the same proceeds');
  assert.ok(Math.abs(t2.endingEquity - (t0.endingEquity + t2.terminalShockTotal)) < 1e-6);
  assert.ok(m.survivorshipSensitivity.cagrBBand[0] <= m.survivorshipSensitivity.cagrBBand[1]);
  assert.ok(m.survivorshipSensitivity.terminalScenarioSpread > 0);
  // A's own delisting (AAA ends 2016-03-31) stays at scenario 0
  assert.equal(m.A.scenarios.V13_T2.terminalShockTotal, 0);
  assert.equal(m.A.reconciliation.pass, true); assert.equal(m.B.reconciliation.pass, true);
  assert.ok(['HOLDS', 'DOES_NOT_HOLD', 'NOT_EVALUABLE'].includes(Object.values(res.hypotheses)[0]?.H1 ?? 'NOT_EVALUABLE'));
  const merger = heldIntoDelisting('MERGER').res.methods.TURTLE_S1.B.scenarios;
  assert.ok(merger.V13_T1.terminalShockTotal < 0 && merger.V13_T2.terminalShockTotal > 0, 'MERGER -10 % / +10 %');
});

test('identical parameters in A and B; B without additions reproduces A exactly', () => {
  const { res } = heldIntoDelisting('UNKNOWN');
  const m = res.methods.TURTLE_S1;
  assert.equal(m.parametersSha256.A, m.parametersSha256.B);
  const A = A0(), params = S.studyParameters({ methods: ['TURTLE_S1', 'KK_BREAKOUT'], window: WIN });
  const same = S.runStudy({ dsA: A, dsB: { ...A, securities: [...A.securities] }, addedIds: new Set(), params });
  for (const k of ['TURTLE_S1', 'KK_BREAKOUT']) { assert.deepEqual(same.methods[k].A, same.methods[k].B); assert.equal(same.methods[k].deltaBminusA.cagrT0 ?? 0, 0); }
});

test('quarantine: the same sessions are cut in A and in the A part of B; added chains are cut at their DQ-K5 flags', () => {
  const jumpA = secA('tiingo:NYSE:JMP:2012-01-03', rows('2014-06-02', '2018-06-29', { seed: 41, jump: { date: '2016-03-01', factor: 6 } }));
  const A = dsA([...A0().securities, jumpA]);
  const v = load(archive([{ id: 'f000000000000001', ticker: 'JMPB', cik: '701', cls: 'UNKNOWN', rows: rows('2015-01-02', '2017-02-28', { seed: 42, jump: { date: '2016-05-02', factor: 0.15 } }) }]));
  const B = S.buildUniverseB(A, v.chains, { window: WIN });
  const qa = S.applyQuarantine(A), qb = S.applyQuarantine(B.dsB, { addedIds: B.addedIds });
  const ids = (d) => d.securities.map((s) => s.id).sort();
  assert.ok(ids(qa.ds).includes('tiingo:NYSE:JMP:2012-01-03#dq1'));
  assert.deepEqual(ids(qb.ds).filter((i) => !i.startsWith(S.ADDED_ID_PREFIX)), ids(qa.ds));
  assert.ok(ids(qb.ds).includes('v13dl:NASDAQ:f000000000000001#dq1'), 'an added chain is quarantined like A');
  // sealed-list mode: A cut at the given sessions only, the added chain at its DQ-K5 flags
  const dates = new Map([['tiingo:NYSE:JMP:2012-01-03', ['2016-03-01']]]);
  const ca = S.applyQuarantine(B.dsB, { mode: 'CA-Q-K5-DATES', datesBySegment: dates, addedIds: B.addedIds });
  assert.equal(ca.census.cuts, 1); assert.equal(ca.census.addedDqK5Flags, 1);
  assert.throws(() => S.applyQuarantine(B.dsB, { mode: 'CA-Q-K5-DATES' }), /QUARANTINE_DATES_REQUIRED/);
  const params = S.studyParameters({ methods: ['TURTLE_S2'], window: WIN });
  const res = S.runStudy({ dsA: A, dsB: B.dsB, addedIds: B.addedIds, params });
  assert.ok(res.quarantine.A.flags >= 1 && res.quarantine.B.flags === res.quarantine.A.flags + 1);
});

test('terminal scenario adjustment shifts only added terminal settlements and carries forward', () => {
  const curve = [{ date: '2016-01-04', equity: 100 }, { date: '2016-01-05', equity: 110 }, { date: '2016-01-06', equity: 120 }];
  const ledger = [{ side: 'SELL', reason: 'TERMINAL_DELISTED', id: 'v13dl:X:1', date: '2016-01-05', gross: 50, fee: 0 }, { side: 'SELL', reason: 'TERMINAL_DELISTED', id: 'tiingo:N:A:1', date: '2016-01-05', gross: 50, fee: 0 }];
  const sc = (id) => (id.startsWith('v13dl:') ? S.V13_TERMINAL_SCENARIOS.DISTRESS : null);
  const r = S.terminalScenarioAdjust(curve, ledger, sc, 2);
  assert.deepEqual(r.curve.map((p) => p.equity), [100, 60, 70]);
  assert.equal(r.total, -50); assert.equal(r.shocks, 1);
  assert.deepEqual(S.terminalScenarioAdjust(curve, ledger, sc, 0).curve.map((p) => p.equity), [100, 110, 120]);
});

test('output only outside the repository; public part carries no metric, ticker or chain id', () => {
  assert.throws(() => S.assertOutsideRepo(path.join(ROOT, 'supertrader', 'data', 'x'), ROOT), /OUT_INSIDE_REPOSITORY/);
  assert.throws(() => S.assertOutsideRepo(ROOT, ROOT), /OUT_INSIDE_REPOSITORY/);
  assert.throws(() => S.assertOutsideRepo('', ROOT), /OUT_REQUIRED/);
  assert.ok(S.assertOutsideRepo(path.join(os.tmpdir(), 'st9-out'), ROOT));
  const { res, B } = heldIntoDelisting('MERGER');
  const pub = S.publicPart(res, { census: B.census, provenance: { registerSha256: 'x', requested: 1, loaded: 1, dailyBoundChains: 1, chainsSha256: 'y' }, receipt: {} });
  const s = JSON.stringify(pub);
  assert.ok(!/RISE|e000000000000001|cagr|maxDrawdown|hitRate/.test(s));
  assert.equal(pub.publication, 'OWNER_DECISION_REQUIRED');
});

test('cross-check with qualify.py: its weekly points and pointsSha256 are reproduced from the same daily rows', async (t) => {
  const { spawnSync } = await import('node:child_process');
  if (spawnSync('python3', ['--version']).status !== 0) { t.skip('python3 not available'); return; }
  const daily = rows('2014-06-02', '2016-06-30', { seed: 51, split: { date: '2015-09-01', factor: 3 }, noise: 0.02 });
  const py = [
    'import json, sys, hashlib',
    `sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'scripts/quant/v13/delisted'))})`,
    'import qualify as q',
    'rows = json.loads(sys.stdin.read())',
    "ch = {'link': {'grade': 'HIGH_CURRENT_MAP', 'cik': '9'}, 'startDate': rows[0][0], 'endDate': rows[-1][0], 'providerEnd': rows[-1][0], 'endSource': 'DERIVED_FROM_SEC_DELISTING_FORM'}",
    `s = {'ticker': 'PY', 'cols': ${JSON.stringify(COLS)}, 'rows': rows, 'meta': {'startDate': rows[0][0]}}`,
    'res, ser = q.qualify_chain(ch, s, {}, {})',
    "print(json.dumps({'status': res['status'], 'points': ser['points'], 'sha': hashlib.sha256(json.dumps(ser['points'], separators=(',', ':')).encode()).hexdigest()}))",
  ].join('\n');
  const r = spawnSync('python3', ['-I', '-c', py], { input: JSON.stringify(daily), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.status, 'QUALIFIED');
  assert.equal(Delisted.pointsHash(out.points), out.sha, 'the JS register hash equals the Python hash');
  assert.ok(S.bindDailyToWeekly('PY', S.tradedRawBars({ cols: COLS, rows: daily }), out.points));
});
