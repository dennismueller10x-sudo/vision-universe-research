/**
 * Supertrader 9 – historical backtest infrastructure, execution side (exits, stops, delisting settlement,
 * reproducible A/B, per-trade uncertainty). Diagnostics only around the isolated V13 study: nothing here changes a
 * fill, a stop, a booking, a strategy, a parameter or the registration; it reads finished runs.
 *
 *  1. classifyExits: an independent replay of every SELL row against its bar (no engine function is called):
 *     - protective stop: a stop never fills above the open or below the low; with a known level (finalStop of the
 *       engine trade) a gap through the stop must fill AT THE OPEN (GAP_THROUGH_STOP_AT_OPEN), an intraday touch at the
 *       level (INTRADAY_AT_STOP); a stop booked at its level although the open was below it is the optimistic error
 *       STOP_GAP_NOT_FILLED_AT_OPEN; same-bar stops without intraday data are flagged INTRADAY_ORDER_ASSUMED;
 *     - delisting: TERMINAL_DELISTED only on the security's last bar = terminal date, at that close minus slippage
 *       (S0_LAST_PRICE); SECURITY_UNAVAILABLE is a data event (censored); no row after the last bar except the stale
 *       settlement of the accounting contract; no entry on or after the terminal date.
 *  2. auditRun: classifyExits + research/sf7-execution-checks.mjs#checkLedgerAgainstBars for every method and, for the
 *     sf5 lifecycles, #checkLifecycleRun (reused, not rebuilt).
 *  3. tradeCoverageByYear: trades per entry year and origin with uncertainty flags (censored exits, assumed intraday
 *     order, open at data end, identity flags, the method's data flag).
 *  4. abDiff: trade-level B vs A per method (compareTradeSets of sf7-execution-checks), split by origin.
 *  5. verifyRegisteredReferences / inputFingerprint / resultSha256: every code file the registration pins is re-hashed
 *     (fail closed), one fingerprint over all inputs, and a deterministic result hash for repeat runs. The study path
 *     uses no random numbers (seeds: NONE_USED); a repeat run must give the same hash.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkLedgerAgainstBars, checkLifecycleRun, compareTradeSets } from './sf7-execution-checks.mjs';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';
import { PLATFORM_RESEARCH_PORTFOLIO_POLICY } from './lifecycle-engine.mjs';
import { EQUITY_RESEARCH_PORTFOLIO_POLICY } from './minervini-execution.mjs';
import { requirementsOf } from './st9-hist-universe.mjs';

export const ST9_HIST_EXECUTION_VERSION = 'st9-hist-execution-1.0.0';
export const SEEDS = 'NONE_USED';
const EPS = 1e-9;
const near = (a, b) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
const baseId = (id) => String(id).split('#')[0];
const inc = (o, k, by = 1) => { o[k] = (o[k] || 0) + by; };
const fin = Number.isFinite;
const canon = (x) => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x);
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(canon(x))).digest('hex');

export class ExecError extends Error { constructor(code, detail = null) { super(detail ? `${code}:${detail}` : code); this.code = code; this.detail = detail; } }
const fail = (code, detail) => { throw new ExecError(code, detail); };

const SAME_BAR_ASSUMED = /^STOP_SAME_BAR_ASSUMED/;
const SAME_BAR_CERTAIN = /^STOP_SAME_BAR_CERTAIN/;
const isStop = (r) => /^STOP_/.test(String(r ?? ''));
export const EXIT_CLASSES = Object.freeze(['GAP_THROUGH_STOP_AT_OPEN', 'INTRADAY_AT_STOP', 'GAP_AT_OPEN_LEVEL_UNKNOWN', 'INTRADAY_LEVEL_UNKNOWN', 'SAME_BAR_CERTAIN', 'INTRADAY_ORDER_ASSUMED', 'TERMINAL_AT_LAST_TRADED_CLOSE', 'DATA_EVENT_CENSORED', 'OTHER_RULE_EXIT']);

function index(ds) {
  const m = new Map();
  for (const s of ds.securities) m.set(s.id, { s, at: new Map(s.bars.map((b, i) => [b.date, i])) });
  return m;
}

/**
 * Classifies every SELL row of a run. trades: the engine's own trades (finalStop, exitDate, id) where available
 * (lifecycle engine, Minervini); Turtle unit stops have no single level and are checked against open and low only.
 */
export function classifyExits(ds, run, { slippageBps, trades = [] }) {
  const slip = slippageBps / 1e4, idx = index(ds), byExit = new Map();
  for (const t of trades) if (t.exitDate && fin(t.finalStop)) byExit.set(`${t.id}|${t.exitDate}`, t.finalStop);
  const classes = {}, violations = {}, examples = [], byReason = {};
  const bad = (code, r) => { inc(violations, code); if (examples.length < 20) examples.push({ code, id: r.id, date: r.date }); };
  const perTrade = new Map(); // `${id}|${date}` -> class (for the uncertainty flags of the trade)
  for (const r of run.ledger) {
    const x = idx.get(r.id);
    if (r.side === 'BUY') {
      if (x?.s.terminal && r.date >= x.s.terminal.date) bad('ENTRY_ON_OR_AFTER_TERMINAL', r);
      continue;
    }
    if (r.side !== 'SELL') continue;
    inc(byReason, r.reason);
    const last = x?.s.bars.at(-1), i = x?.at.get(r.date), b = i !== undefined ? x.s.bars[i] : null, px = r.price / (1 - slip);
    let cls;
    if (r.reason === 'SECURITY_UNAVAILABLE') cls = 'DATA_EVENT_CENSORED';
    else if (r.reason === 'TERMINAL_DELISTED') {
      cls = 'TERMINAL_AT_LAST_TRADED_CLOSE';
      if (!x?.s.terminal || x.s.terminal.cause !== 'LISTING_INACTIVE') bad('TERMINAL_WITHOUT_ECONOMIC_END', r);
      else if (r.date !== x.s.terminal.date || r.date !== last.date) bad('TERMINAL_NOT_ON_LAST_TRADED_BAR', r);
      else if (!near(r.price, last.close * (1 - slip))) bad('TERMINAL_NOT_AT_LAST_TRADED_CLOSE', r);
    } else {
      if (!b) { bad(last && r.date > last.date ? 'EXIT_AFTER_LAST_BAR' : 'EXIT_WITHOUT_BAR', r); continue; }
      if (SAME_BAR_ASSUMED.test(r.reason)) cls = 'INTRADAY_ORDER_ASSUMED';
      else if (SAME_BAR_CERTAIN.test(r.reason)) cls = 'SAME_BAR_CERTAIN';
      else if (isStop(r.reason)) {
        if (px > b.open + EPS * px) bad('STOP_FILL_ABOVE_OPEN', r);
        if (px < b.low - EPS * px) bad('STOP_FILL_BELOW_LOW', r);
        const level = byExit.get(`${r.id}|${r.date}`);
        if (fin(level)) {
          if (!(b.low <= level + EPS * level)) bad('STOP_NOT_REACHED', r);
          if (b.open < level) { cls = 'GAP_THROUGH_STOP_AT_OPEN'; if (!near(px, b.open)) bad(near(px, level) ? 'STOP_GAP_NOT_FILLED_AT_OPEN' : 'STOP_GAP_FILL_NOT_OPEN', r); }
          else { cls = 'INTRADAY_AT_STOP'; if (!near(px, level)) bad('STOP_NOT_AT_LEVEL', r); }
        } else cls = near(px, b.open) ? 'GAP_AT_OPEN_LEVEL_UNKNOWN' : 'INTRADAY_LEVEL_UNKNOWN';
      } else {
        cls = 'OTHER_RULE_EXIT';
        if (/_GAP_OPEN$/.test(r.reason) && !near(px, b.open)) bad('GAP_EXIT_NOT_AT_OPEN', r);
        if (px > b.high + EPS * px || px < b.low - EPS * px) bad('EXIT_FILL_OUTSIDE_BAR', r);
      }
    }
    inc(classes, cls);
    const k = `${r.id}|${r.date}`, prev = perTrade.get(k);
    if (!prev || cls === 'INTRADAY_ORDER_ASSUMED' || cls === 'DATA_EVENT_CENSORED') perTrade.set(k, cls);
  }
  return { version: ST9_HIST_EXECUTION_VERSION, classes, byReason, violations, violationCount: Object.values(violations).reduce((a, b) => a + b, 0), examples, perTrade };
}

/** Engine trades with finalStop (lifecycle / Minervini); Turtle has positionTrades without a single stop. */
const engineTrades = (run) => (Array.isArray(run.trades) ? run.trades : []);
const dustOf = (run) => { const m = new Map(); for (const t of engineTrades(run)) for (const e of t.events ?? []) if (e.type === 'DUST_WRITE_OFF') (m.get(e.date) || m.set(e.date, []).get(e.date)).push(t.id); return m; };
export function policyOf(key) {
  if (key.startsWith('MINERVINI_')) return EQUITY_RESEARCH_PORTFOLIO_POLICY;
  if (key.startsWith('TURTLE_')) return { initialCapital: PLATFORM_RESEARCH_PORTFOLIO_POLICY.initialCapital, maxOpenPositions: Infinity };
  return PLATFORM_RESEARCH_PORTFOLIO_POLICY;
}

/** Every independent check of one finished study run (one method, one universe). */
export function auditRun(ds, r, { key, costs, from = null }) {
  const run = r.run, pol = policyOf(key);
  const exits = classifyExits(ds, run, { slippageBps: costs.slippageBps, trades: engineTrades(run) });
  const books = checkLedgerAgainstBars(ds, run, { slippageBps: costs.slippageBps, commissionBps: costs.commissionBps, initialCapital: pol.initialCapital, maxOpenPositions: pol.maxOpenPositions ?? Infinity, from, dustWriteOffs: dustOf(run) });
  const lc = SF5_LIFECYCLES.find((l) => l.key === key);
  const lifecycle = lc ? checkLifecycleRun(ds, run, { config: lc.variants.find((v) => v.id === 'REF').config, adapter: lc.adapter, policy: { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, ...costs }, from }) : null;
  const violations = { ...Object.fromEntries(Object.entries(exits.violations).map(([k, n]) => [`EXIT:${k}`, n])), ...Object.fromEntries(Object.entries(books.violations).map(([k, n]) => [`BOOKS:${k}`, n])), ...(lifecycle ? Object.fromEntries(Object.entries(lifecycle.violations).map(([k, n]) => [`LIFECYCLE:${k}`, n])) : {}) };
  const violationCount = Object.values(violations).reduce((a, b) => a + b, 0);
  return { version: ST9_HIST_EXECUTION_VERSION, key, pass: violationCount === 0, violationCount, violations, exitClasses: exits.classes, exitReasons: exits.byReason, booksChecks: books.checks, lifecycleChecks: lifecycle ? lifecycle.checks : null, lifecycleDiagnostics: lifecycle ? lifecycle.diagnostics : null, _examples: [...exits.examples, ...books.examples, ...(lifecycle?.examples ?? [])].slice(0, 20), _perTrade: exits.perTrade };
}

/**
 * Trades per entry year and origin with their uncertainty flags. outcomeOfId(baseId) -> st9-hist-universe OUTCOMES
 * (the listing's end), identityFlags: Map baseId -> flags, perTrade: classifyExits().perTrade.
 */
export function tradeCoverageByYear(trades, { key, addedIds = new Set(), outcomeOfId = () => null, identityFlags = new Map(), perTrade = new Map() }) {
  const methodFlag = requirementsOf(key).flag, years = {}, total = { trades: 0, withAnyFlag: 0, flags: {} };
  for (const t of trades) {
    const y = String(t.entryDate).slice(0, 4), lid = baseId(t.id), origin = addedIds.has(lid) ? 'B_ADDED' : 'A_OWN', f = new Set();
    const r = (years[y] ||= { trades: 0, A_OWN: 0, B_ADDED: 0, closed: 0, withAnyFlag: 0, flags: {} });
    r.trades++; r[origin]++; total.trades++;
    if (t.status === 'CLOSED') r.closed++; else f.add('OPEN_AT_DATA_END_RIGHT_CENSORED');
    const cls = t.exitDate ? perTrade.get(`${t.id}|${t.exitDate}`) : null;
    if (cls === 'INTRADAY_ORDER_ASSUMED') f.add('INTRADAY_ORDER_ASSUMED');
    if (cls === 'DATA_EVENT_CENSORED') f.add('DATA_EVENT_CENSORED');
    if (t.exitReason === 'TERMINAL_DELISTED') { const o = outcomeOfId(lid); if (o === 'DELISTED_UNKNOWN_CENSORED') f.add('DELISTING_OUTCOME_UNKNOWN_CENSORED'); else if (o) f.add(`DELISTING_${o.replace(/^DELISTED_/, '')}_BAND`); }
    for (const x of identityFlags.get(lid) ?? []) f.add(x.split(':')[0]);
    if (methodFlag) f.add(methodFlag);
    if (origin === 'B_ADDED' && key.startsWith('MINERVINI_')) f.add('ADDED_CHAIN_WITHOUT_FUNDAMENTALS');
    if (f.size) { r.withAnyFlag++; total.withAnyFlag++; }
    for (const x of f) { inc(r.flags, x); inc(total.flags, x); }
  }
  total.flaggedShare = total.trades ? total.withAnyFlag / total.trades : null;
  return { version: ST9_HIST_EXECUTION_VERSION, key, byYear: years, total };
}

/** B vs A per method: A-own trades unchanged / shares only / changed / dropped / new, and the added-chain trades. */
export function abDiff(tradesA, tradesB, { addedIds = new Set() } = {}) {
  const own = (t) => !addedIds.has(baseId(t.id));
  const cmp = compareTradeSets(tradesA, tradesB.filter(own));
  return { version: ST9_HIST_EXECUTION_VERSION, aOwn: cmp, bAdded: tradesB.length - tradesB.filter(own).length, identical: cmp.unchanged === cmp.base && cmp.base === cmp.other && tradesB.length === tradesA.length };
}

/** Re-hash every file the registration pins (fail closed): a changed engine needs a new registration, not a run. */
export function verifyRegisteredReferences(root, registration) {
  const pins = registration?.references?.sha256;
  if (!pins || !Object.keys(pins).length) fail('REGISTRATION_REFERENCES_MISSING');
  const out = {};
  for (const [f, h] of Object.entries(pins).sort(([a], [b]) => a.localeCompare(b))) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) fail('REGISTERED_REFERENCE_MISSING', f);
    const got = sha(fs.readFileSync(p));
    if (got !== h) fail('REGISTERED_REFERENCE_CHANGED', f);
    out[f] = got;
  }
  return { files: Object.keys(out).length, sha256: sha(out) };
}

/** One fingerprint over every input of a run; each part must be a non-empty hash or an explicit null. */
export function inputFingerprint(parts) {
  for (const [k, v] of Object.entries(parts)) if (v !== null && !(typeof v === 'string' && v.length)) fail('FINGERPRINT_PART_INVALID', k);
  const p = { ...canon(parts), seeds: SEEDS, executionVersion: ST9_HIST_EXECUTION_VERSION };
  return { parts: p, sha256: sha(p) };
}

/** Deterministic hash of a study result (key order canonical); two runs with the same fingerprint must agree. */
export const resultSha256 = (result) => sha(result);
export function assertSameResult(a, b) { const ha = resultSha256(a), hb = resultSha256(b); if (ha !== hb) fail('DETERMINISM_FAILED', `${ha.slice(0, 12)}!=${hb.slice(0, 12)}`); return ha; }

/** Public form of an audit: counts only (examples and per-trade classes carry ids). */
export const publicAudit = ({ _examples, _perTrade, ...rest }) => rest; // eslint-disable-line no-unused-vars
