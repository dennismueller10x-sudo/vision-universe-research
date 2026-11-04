#!/usr/bin/env node
/**
 * SF6-PAPER-2027 – recording CLI (docs/SUPERTRADER_PAPER_2027_ACTIVATION.md).
 *
 *   guard   [--today YYYY-MM-DD]
 *           INACTIVE / ACTIVE / BLOCKED (activation-2027.mjs#activationState); writes state=<..> to $GITHUB_OUTPUT.
 *           Exit 0 for INACTIVE and ACTIVE, 1 for BLOCKED.
 *   session [--today YYYY-MM-DD] [--session YYYY-MM-DD|auto] [--log <jsonl>]
 *           the session a run records (auto = last XNYS session before today) and whether it is due (not before the
 *           first session, after the last recorded one); writes session=<..> and due=true|false to $GITHUB_OUTPUT.
 *           The recording process then runs with ST_WINDOW=PAPER_2027 ST_WINDOW_TO=<session> (1.2.0 forward window).
 *   record  --session YYYY-MM-DD|auto --log <jsonl> --sealed-out <dir> [--today YYYY-MM-DD]
 *           only when guard says ACTIVE: one entry per session, appended (never rewritten) after the chain of the
 *           existing log verified; the sealed part is encrypted for the owner (validation/results-public-key.pem) and
 *           its plaintext sha256 is in the public entry. Data: the forward data path (FORWARD_DATA_PATHS, 1.2.0
 *           paper/forward-source.mjs); fails closed outside the forward window or when a session is not in the data.
 *   forward-probe --session YYYY-MM-DD --out <dir>
 *           loads the forward source (ST_WINDOW=PAPER_2027 ST_WINDOW_TO=<session>) and writes counts and hashes only
 *           (no record, no log, no commit): readiness check of the forward namespace before the window.
 *   verify  --log <jsonl> --sealed-dir <dir> --base <jsonl>
 *           append-only check before every commit: the committed log (base) is a byte-identical prefix, the chain is
 *           valid, no dry-run entry, one encrypted sealed file per entry. Exit 1 on any finding.
 *   dry-run --out <dir> [--source synthetic|eod] [--sessions N] [--limit N] [--tickers A,B]
 *           simulates N sessions on existing data (synthetic research snapshot with raw bars, or the committed daily
 *           EOD bars of quant/data/product/technical-signals-v1, read only), writes the simulated log and the sealed
 *           parts to --out, runs the four integrity checks (both replay modes) and five tamper scenarios that each
 *           check must catch. Never touches the real log, the bucket or the network; every entry carries dryRun: true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../../validation/lib.mjs';
import { datasetFromPit } from '../runner/snapshot-input.mjs';
import { canonicalJson, sha256 } from '../../snapshot/contract.mjs';
import { SF6_PAPER_ACTIVATION, FORWARD_DATA_PATHS, activationState, activationSha256, pinCheck } from './activation-2027.mjs';
import { sessionRecord, nextEntry, verifyChain, verifyAppendOnly, sealedFileName, integrityChecks, datasetSource, datasetSha256, parseJsonl, toJsonlLine, entryHash, NEXT_OPEN_UTC } from './forward-log.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..', '..');

// ------------------------------------------------------------------------------------------------ synthetic snapshot

const weekdays = (from, n) => { const out = []; let d = Date.parse(from + 'T00:00:00Z'); while (out.length < n) { const w = new Date(d).getUTCDay(); if (w && w < 6) out.push(new Date(d).toISOString().slice(0, 10)); d += 864e5; } return out; };
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

/**
 * Raw research snapshot (loadPitData shape) with random walks, breakouts and gaps, so that the references open and close
 * positions; optional declared split { seg, at, ratio } (raw prices divided by ratio from `at`, splitFactor on the bar).
 */
export function syntheticPit({ start = '2025-09-01', sessions = 420, securities = 40, seed = 11, splits = [] } = {}) {
  const cal = weekdays(start, sessions), segs = [];
  for (let s = 0; s < securities; s++) {
    const r = rng(seed * 1000 + s); let c = 15 + 60 * r(); const drift = (r() - 0.35) * 0.003, raw = [];
    for (let k = 0; k < cal.length; k++) {
      const gap = r() < 0.012 ? 0.07 * (r() < 0.75 ? 1 : -1) : 0, o = c * (1 + gap + 0.008 * (r() - 0.5));
      c = o * (1 + drift + 0.032 * (r() - 0.5));
      raw.push({ date: cal[k], open: o, high: Math.max(o, c) * (1 + 0.012 * r()), low: Math.min(o, c) * (1 - 0.012 * r()), close: c, volume: Math.round(2e6 * (0.5 + r()) * (gap ? 3 : 1)), adjClose: null, dividend: 0, splitFactor: 1 });
    }
    for (const sp of splits.filter((x) => x.seg === s)) { for (let k = sp.at; k < raw.length; k++) for (const f of ['open', 'high', 'low', 'close']) raw[k][f] /= sp.ratio; raw[sp.at].splitFactor = sp.ratio; }
    segs.push({ id: `tiingo:NYSE:SYN${String(s).padStart(3, '0')}:2010-01-01`, raw, delisted: false, endCause: 'ACTIVE', survivor: true, cls: 'EQUITY_COMMON' });
  }
  const spyRaw = segs[0].raw.map((b) => ({ ...b, splitFactor: 1 }));
  const spyAdj = L.adjustSeries(spyRaw);
  let v = 1; const spyTR = spyAdj.date.map((d, i) => { if (i > 0) v *= 1 + spyAdj.tr[i]; return { date: d, value: v }; });
  return { segs, calendar: cal, spyAdj, spyTR };
}

/** Committed daily EOD bars (read only) in the research shape; adjustments as of the materialization (not PIT). */
export async function eodDataset({ tickers = null, limit = 0 } = {}) {
  const E = await import('../product/eod-adapter.mjs');
  const loaded = E.loadEodSecurities({ tickers });
  let secs = loaded.securities; if (limit) secs = secs.slice(0, limit);
  const spy = loaded.securities.find((s) => s.ticker === 'SPY') ?? E.loadEodSecurities({ tickers: ['SPY'] }).securities[0] ?? null;
  const calendar = [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort();
  const benchmark = spy ? spy.bars.map((b) => ({ ...b, splitAdj: 1 })) : [];
  let v = 1; const spyTR = benchmark.map((b, i) => { if (i > 0) v *= b.close / benchmark[i - 1].close; return { date: b.date, value: v }; });
  return { calendar, securities: secs.map((s) => ({ id: s.id, bars: s.bars, terminal: null, survivor: true, cls: null })), spyTR, benchmark };
}

// ------------------------------------------------------------------------------------------------ simulation

/** Records `sessions` (ascending) into a fresh log; recordedAt = the session close (dry run). */
export function simulateLog(source, sessions, { from, refs, activationSha = null } = {}) {
  let log = []; const sealed = new Map();
  for (const t of sessions) {
    const ds = source.at(t);
    const rec = sessionRecord(ds, t, { from, refs });
    const e = nextEntry(log, { session: t, record: rec, inputs: { source: source.kind, datasetSha256: datasetSha256(ds), pitCorporateActions: source.pitCorporateActions }, recordedAt: `${t}T21:00:00Z`, activationSha256: activationSha, dryRun: true });
    log = [...log, e];
    for (const [k, s] of Object.entries(rec.sealed)) sealed.set(`${t}|${k}`, s);
  }
  return { log, sealed };
}

const summary = (r) => Object.fromEntries(Object.entries(r.checks).map(([k, v]) => [k, v.pass]));

/** The four checks on the untouched log plus five tamper scenarios, each of which must flip the expected check. */
export function dryRun(source, sessions, { refs } = {}) {
  const from = sessions[0], to = sessions.at(-1);
  const { log, sealed } = simulateLog(source, sessions, { from, refs });
  const sealedOf = (t, k) => sealed.get(`${t}|${k}`) ?? null;
  const clean = integrityChecks(log, source, { from, to, refs, mode: 'PIT_PER_SESSION', sealedOf });
  const fast = integrityChecks(log, source, { from, to, refs, mode: 'SINGLE_RUN_PREFIX' });
  const mid = Math.floor(log.length / 2);
  const reseal = (entries, i, mutate) => { const out = entries.map((e) => ({ ...e, references: JSON.parse(JSON.stringify(e.references)) })); mutate(out[i]); for (let j = i; j < out.length; j++) { out[j].prevHash = j ? out[j - 1].hash : out[j].prevHash; out[j].hash = entryHash(out[j]); } return out; };
  const busiest = Object.keys(log.at(-1).references).sort((a, b) => log.at(-1).references[b].ledgerRows - log.at(-1).references[a].ledgerRows)[0];
  const scenarios = [];
  // T1 an entry edited in place (hash not recomputed): chain broken -> check 1 and 2 fail
  { const t = log.map((e) => ({ ...e })); t[mid] = { ...t[mid], recordedAt: t[mid].recordedAt.replace('21:', '20:') }; const r = integrityChecks(t, source, { from, to, refs, mode: 'SINGLE_RUN_PREFIX' }); scenarios.push({ id: 'T1_EDIT_IN_PLACE', expect: 'FORWARD_LOG_EQUALS_BATCH_REPLAY=false, NO_MISSING_SESSIONS=false', checks: summary(r), caught: !r.checks.FORWARD_LOG_EQUALS_BATCH_REPLAY.pass && !r.checks.NO_MISSING_SESSIONS.pass }); }
  // T2 a forged record with a consistent re-computed chain (open position count changed): the batch replay disagrees
  { const t = reseal(log, mid, (e) => { e.references[busiest].openPositions += 1; }); const r = integrityChecks(t, source, { from, to, refs, mode: 'SINGLE_RUN_PREFIX' }); scenarios.push({ id: 'T2_FORGED_RECHAINED', expect: 'FORWARD_LOG_EQUALS_BATCH_REPLAY=false', chainValid: verifyChain(t).pass, checks: summary(r), caught: !r.checks.FORWARD_LOG_EQUALS_BATCH_REPLAY.pass }); }
  // T3 one session never recorded: NO_MISSING_SESSIONS fails
  { const kept = log.filter((_, i) => i !== mid); let t = []; for (const e of kept) { const { hash, seq, prevHash, ...rest } = e; void hash; void seq; void prevHash; const n = { ...rest, seq: t.length, prevHash: t.length ? t.at(-1).hash : '0'.repeat(64) }; n.hash = entryHash(n); t = [...t, n]; } const r = integrityChecks(t, source, { from, to, refs, mode: 'SINGLE_RUN_PREFIX' }); scenarios.push({ id: 'T3_SESSION_MISSING', expect: 'NO_MISSING_SESSIONS=false', checks: summary(r), caught: !r.checks.NO_MISSING_SESSIONS.pass }); }
  // T4 silent data revision of a past bar in the frozen data (after the record was written): the replay disagrees
  { const rev = { ...source, at: (d) => { const ds = source.at(d); const sec = ds.securities.find((s) => s.bars.some((b) => b.date === sessions[mid])); if (!sec) return ds; return { ...ds, securities: ds.securities.map((s) => (s === sec ? { ...s, bars: s.bars.map((b) => (b.date === sessions[mid] ? { ...b, close: b.close * 1.5, high: Math.max(b.high, b.close * 1.5) } : b)) } : s)) }; } };
    const r = integrityChecks(log, rev, { from, to, refs, mode: 'PIT_PER_SESSION' }); scenarios.push({ id: 'T4_SILENT_DATA_REVISION', expect: 'FORWARD_LOG_EQUALS_BATCH_REPLAY: inputsRevisedSessions > 0', checks: summary(r), inputsRevisedSessions: r.checks.FORWARD_LOG_EQUALS_BATCH_REPLAY.inputsRevisedSessions, caught: r.checks.FORWARD_LOG_EQUALS_BATCH_REPLAY.inputsRevisedSessions > 0 }); }
  // T5 a record claiming an unreconciled ledger: RESEARCH_V1_RECONCILED fails
  { const t = reseal(log, mid, (e) => { e.references[busiest].reconciliation = false; }); const r = integrityChecks(t, source, { from, to, refs, mode: 'SINGLE_RUN_PREFIX' }); scenarios.push({ id: 'T5_UNRECONCILED_RECORD', expect: 'RESEARCH_V1_RECONCILED=false', checks: summary(r), caught: !r.checks.RESEARCH_V1_RECONCILED.pass }); }
  const totals = Object.fromEntries(Object.entries(log.at(-1).references).map(([k, v]) => [k, { openPositions: v.openPositions, closedTrades: v.closedTrades, ledgerRows: v.ledgerRows }]));
  return { log, sealed, report: { schema: 'sf6-paper-dry-run-1.0.0', dryRun: true, source: source.kind, pitCorporateActions: source.pitCorporateActions, window: { from, to }, sessions: sessions.length, references: refs?.length ?? 11, chainHead: log.at(-1).hash, countsAtLastSession: totals, clean: { PIT_PER_SESSION: clean, SINGLE_RUN_PREFIX: fast }, tamper: scenarios, allCleanPass: clean.allPass && fast.allPass, allTamperCaught: scenarios.every((s) => s.caught) } };
}

// ------------------------------------------------------------------------------------------------ CLI

async function main() {
  const argv = process.argv.slice(2), cmd = argv[0], arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (cmd === 'guard') {
    const today = arg('--today', new Date().toISOString().slice(0, 10));
    const s = await activationState({ today });
    const pins = await pinCheck();
    console.log(JSON.stringify({ today, ...s, pins: pins.rows.map((r) => `${r.pin} ${r.equal ? 'EQUAL' : 'MISMATCH'} ${r.current.slice(0, 12)}`) }, null, 1));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `state=${s.state}\n`);
    process.exit(s.state === 'BLOCKED' ? 1 : 0);
  }
  if (cmd === 'session') {
    const today = arg('--today', new Date().toISOString().slice(0, 10)), logPath = arg('--log');
    const { createCalendar } = await import('../product/eod-adapter.mjs');
    const cal = createCalendar(), R = SF6_PAPER_ACTIVATION.recording;
    let session = arg('--session', 'auto') || 'auto';
    if (session === 'auto') { session = cal.addDays(today, -1); while (!cal.isSession(session)) session = cal.addDays(session, -1); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session) || !cal.isSession(session)) { console.error(`PAPER_SESSION_INVALID: ${session}`); process.exit(2); }
    const log = logPath && fs.existsSync(logPath) ? parseJsonl(fs.readFileSync(logPath, 'utf8')) : [];
    const last = log.filter((e) => e.type === 'SESSION').map((e) => e.session).at(-1) ?? null;
    const due = session >= R.firstSession && !(last && last >= session);
    console.log(JSON.stringify({ today, session, lastRecorded: last, due }));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `session=${session}\ndue=${due}\n`);
    return;
  }
  if (cmd === 'forward-probe') {
    const session = arg('--session'), OUT = arg('--out');
    if (!session || !OUT) { console.error('usage: forward-probe --session YYYY-MM-DD --out <dir> (ST_WINDOW=PAPER_2027 ST_WINDOW_TO=<session>)'); process.exit(2); }
    let source;
    try { source = await FORWARD_DATA_PATHS.RESEARCH_FORWARD_WINDOW.load(session, { log: (m) => console.log(`[forward-probe] ${m}`) }); } catch (e) { console.error(String(e?.message || e).split('\n')[0]); process.exit(3); }
    const t = source.sessions.at(-1) ?? null, ds = t ? source.at(t) : null;
    const report = { schema: 'sf6-paper-forward-probe-1.0.0', session, window: source.window, kind: source.kind, version: source.version, sessions: source.sessions.length, firstSession: source.sessions[0] ?? null, lastSession: t, listingTableHash: source.listingTableHash, dataFingerprint: source.dataFingerprint, securitiesAtLast: ds ? ds.securities.length : 0, terminalsAtLast: ds ? ds.securities.filter((x) => x.terminal).length : 0, withFundamentalsAtLast: ds ? ds.securities.filter((x) => x.fund).length : 0, datasetSha256AtLast: ds ? datasetSha256(ds) : null, record: 'NONE' };
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'forward-probe.json'), JSON.stringify(report, null, 1) + '\n');
    console.log(JSON.stringify(report, null, 1));
    return;
  }
  if (cmd === 'record') {
    const logPath = arg('--log'), sealedOut = arg('--sealed-out'), today = arg('--today', new Date().toISOString().slice(0, 10));
    if (!logPath || !sealedOut) { console.error('usage: record --session YYYY-MM-DD|auto --log <jsonl> --sealed-out <dir> [--today YYYY-MM-DD]'); process.exit(2); }
    const s = await activationState({ today });
    if (s.state !== 'ACTIVE') { console.error(`PAPER_NOT_ACTIVE: ${s.state} ${s.reasons.join(',')}`); process.exit(s.state === 'BLOCKED' ? 3 : 0); }
    // session: explicit, or `auto` = the last XNYS session before today (the run is after the close, before the next open)
    const { createCalendar } = await import('../product/eod-adapter.mjs');
    const cal = createCalendar(), R = SF6_PAPER_ACTIVATION.recording;
    let session = arg('--session', 'auto');
    if (session === 'auto') { session = cal.addDays(today, -1); while (!cal.isSession(session)) session = cal.addDays(session, -1); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session) || !cal.isSession(session)) { console.error(`PAPER_SESSION_INVALID: ${session}`); process.exit(2); }
    if (session < R.firstSession) { console.log(`BEFORE_FIRST_SESSION: ${session} < ${R.firstSession}; nothing recorded`); return; }
    const log = fs.existsSync(logPath) ? parseJsonl(fs.readFileSync(logPath, 'utf8')) : [];
    const v = verifyChain(log); if (!v.pass) { console.error(`PAPER_CHAIN_BROKEN: ${v.errors.join(',')}`); process.exit(3); }
    const last = log.filter((e) => e.type === 'SESSION').map((e) => e.session).at(-1) ?? null;
    if (last && last >= session) { console.log(`ALREADY_RECORDED: ${session} (last ${last}); nothing to do`); return; }
    const pathDef = FORWARD_DATA_PATHS[SF6_PAPER_ACTIVATION.decisions.dataSource];
    if (!pathDef || pathDef.status !== 'IMPLEMENTED') { console.error(`${pathDef?.reason ?? 'FORWARD_DATA_PATH_UNKNOWN'}: ${pathDef?.needs ?? ''}`); process.exit(3); }
    // the forward data path (1.2.0, paper/forward-source.mjs): FORWARD_DATA_PATHS[..].load(session) returns a
    // datasetSource whose at(t) is the dataset as known at the close of t. A missed session is recorded late, in
    // order (never skipped); NO_MISSING_SESSIONS counts it as written after the next open.
    let source;
    try { source = await pathDef.load(session); } catch (e) { console.error(String(e?.message || e).split('\n')[0]); process.exit(3); }
    const due = cal.sessionsBetween(last ? cal.nextSession(last) : R.firstSession, session).filter((t) => !source.sessions.includes(t));
    if (due.length) { console.error(`FORWARD_SESSION_NOT_IN_DATA: ${due.join(',')}`); process.exit(3); }
    const pem = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
    let cur = log;
    for (const t of cal.sessionsBetween(last ? cal.nextSession(last) : R.firstSession, session)) {
      const ds = source.at(t), rec = sessionRecord(ds, t);
      const e = nextEntry(cur, { session: t, record: rec, inputs: { source: source.kind, sourceVersion: source.version ?? null, datasetSha256: datasetSha256(ds), listingTableHash: source.listingTableHash ?? null, pitCorporateActions: source.pitCorporateActions, commit: process.env.GITHUB_SHA || null, runId: process.env.GITHUB_RUN_ID || null }, recordedAt: new Date().toISOString(), activationSha256: activationSha256() });
      fs.mkdirSync(sealedOut, { recursive: true });
      fs.writeFileSync(path.join(sealedOut, sealedFileName(e)), L.encryptForOwner(pem, Buffer.from(canonicalJson({ session: t, entryHash: e.hash, sealed: rec.sealed }))));
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, toJsonlLine(e));
      cur = [...cur, e];
      console.log(`recorded ${t} seq ${e.seq} head ${e.hash.slice(0, 16)} (before the next open: ${cal.nextSession(t)}${NEXT_OPEN_UTC})`);
    }
    return;
  }
  if (cmd === 'verify') {
    // before every commit of the real log: append-only against the committed base, valid chain, one sealed file per
    // entry, each one encrypted (never plaintext ids in the repository)
    const logPath = arg('--log'), sealedDir = arg('--sealed-dir'), basePath = arg('--base');
    if (!logPath || !sealedDir || !basePath) { console.error('usage: verify --log <jsonl> --sealed-dir <dir> --base <committed jsonl, empty file if none>'); process.exit(2); }
    const r = verifyAppendOnly(fs.readFileSync(basePath, 'utf8'), fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '');
    const log = fs.existsSync(logPath) ? parseJsonl(fs.readFileSync(logPath, 'utf8')) : [];
    for (const e of log) {
      const f = path.join(sealedDir, sealedFileName(e));
      if (!fs.existsSync(f)) { r.errors.push(`SEALED_MISSING:${e.seq}`); continue; }
      if (!/"schema":\s*"supertrader-sealed-1\.0\.0"/.test(fs.readFileSync(f, 'utf8'))) r.errors.push(`SEALED_NOT_ENCRYPTED:${e.seq}`);
    }
    r.pass = r.errors.length === 0;
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.pass ? 0 : 1);
  }
  if (cmd === 'dry-run') {
    const OUT = arg('--out'); if (!OUT) { console.error('--out required'); process.exit(2); }
    const kind = arg('--source', 'synthetic'), n = Number(arg('--sessions', '20'));
    const t0 = Date.now();
    let source;
    if (kind === 'synthetic') source = datasetSource(syntheticPit(), { kind: 'SYNTHETIC_RESEARCH_SNAPSHOT', pit: true });
    else if (kind === 'eod') source = datasetSource(await eodDataset({ tickers: arg('--tickers') ? arg('--tickers').split(',') : null, limit: Number(arg('--limit', '0')) }), { kind: 'COMMITTED_EOD_BARS_READ_ONLY' });
    else { console.error('--source synthetic|eod'); process.exit(2); }
    // synthetic: the first N sessions from the protocol's first session (2027-01-04); eod: the last N committed sessions
    const sessions = kind === 'synthetic' ? source.sessions.filter((d) => d >= SF6_PAPER_ACTIVATION.recording.firstSession).slice(0, n) : source.sessions.slice(-n);
    const { log, sealed, report } = dryRun(source, sessions);
    report.seconds = Math.round((Date.now() - t0) / 1000);
    fs.mkdirSync(path.join(OUT, 'sealed'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'SF6-PAPER-2027.dry-run.jsonl'), log.map(toJsonlLine).join(''));
    for (const [k, s] of sealed) fs.writeFileSync(path.join(OUT, 'sealed', `${k.replace('|', '_')}.json`), canonicalJson(s));
    fs.writeFileSync(path.join(OUT, 'dry-run-report.json'), JSON.stringify(report, null, 1) + '\n');
    console.log(JSON.stringify({ source: report.source, sessions: report.sessions, window: report.window, chainHead: report.chainHead.slice(0, 16), clean: Object.fromEntries(Object.entries(report.clean).map(([m, r]) => [m, summary(r)])), tamper: report.tamper.map((s) => `${s.id}: ${s.caught ? 'CAUGHT' : 'NOT CAUGHT'}`), allCleanPass: report.allCleanPass, allTamperCaught: report.allTamperCaught, seconds: report.seconds, sha256: sha256(JSON.stringify(report.clean)) }, null, 1));
    process.exit(report.allCleanPass && report.allTamperCaught ? 0 : 1);
  }
  console.error('usage: run-paper-2027.mjs guard|session|record|verify|forward-probe|dry-run (see header)'); process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
