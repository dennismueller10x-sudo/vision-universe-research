/**
 * Supertrader 7.0 – independent execution and validation checks of the research lifecycles WITHOUT corporate-action data
 * (docs/SUPERTRADER_7_EXECUTION_VALIDATION.md, tests sf-sf7-execution-validation). Diagnostics only: nothing here changes
 * a reference, a registry, a fill or a booking; it reads finished runs and re-runs pre-registered configurations.
 *
 *  1. checkLedgerAgainstBars / checkLifecycleRun: an INDEPENDENT replay of a finished run against the bars (it does not call
 *     the engine's fill, sizing or booking functions):
 *       - every fill inside the range of its bar; an entry by its basis (open, gap open, touched level, close);
 *       - timing: an entry fills on the session after its signal (a closing-auction entry on the signal bar), a next-open
 *         exit fills at the open of a session after it was scheduled, a dividend is never paid on the entry day;
 *       - stops: a protective stop fills at min(open, stop) (gap = the open, never the stop), a reached stop is never
 *         skipped, a raised stop is never lowered, a same-bar stop exits at the stop on the entry bar, an ignored
 *         same-bar stop exists only under OPTIMISTIC;
 *       - sizing: shares = min(floor(risk or weight), floor(weight cap), floor(cash / unit cost)) from the equity of the
 *         prior close and the cash at the moment of the fill; risk and weight never above their bound;
 *       - books: cash + positions at the last close = curve equity on EVERY session, cash never negative, no negative or
 *         oversold holding, never more open positions than the policy allows;
 *  2. corruptAfter: future bars replaced by unrelated values (same dates, same presence) for the point-in-time test:
 *     decisions up to the cut date must not change;
 *  3. stability: deterministic re-runs without one security / with the start one session later; counts only
 *     (unchanged / changed / dropped / added trades), no metric.
 * The registered SF7 validation variants and the snapshot protocol are in research/sf7-execution-validation.mjs; this
 * module has no strategy import (the KK runner uses it without depending on the sf5 lifecycles).
 * Public: counts only. Examples of violations (ids, dates) are sealed.
 */
import crypto from 'node:crypto';
import * as AC from '../../validation/accounting-contract.mjs';
import { fin } from '../common/series.mjs';

export const SF7_CHECKS_VERSION = 'sf7-execution-checks-1.0.0';
const EPS = 1e-9;
const near = (a, b) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');

/** id -> { bars, at: { get(date) -> index | undefined } } by binary search (no per-bar map: the snapshot has ~27 M bars) */
function barIndex(dataset) {
  const m = new Map();
  for (const s of dataset.securities) {
    const bars = s.bars;
    m.set(s.id, { bars, at: { get(date) { let lo = 0, hi = bars.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1, d = bars[mid].date; if (d === date) return mid; if (d < date) lo = mid + 1; else hi = mid - 1; } return undefined; } } });
  }
  return m;
}
/** last finite close of a security on or before date and on or after from (the engine's lastClose within the run window). */
function markAt(x, date, from) {
  let lo = 0, hi = x.bars.length - 1, k = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (x.bars[mid].date <= date) { k = mid; lo = mid + 1; } else hi = mid - 1; }
  for (; k >= 0 && (!from || x.bars[k].date >= from); k--) if (fin(x.bars[k].close)) return x.bars[k].close;
  return null;
}

function tally() {
  const v = {}, examples = [];
  return { v, examples, add(code, ex) { v[code] = (v[code] || 0) + 1; if (examples.length < 20) examples.push({ code, ...ex }); } };
}

/**
 * Ledger replay against the bars (shared by the sf5 engine and the Turtle engine). rows: { date, id, side BUY | SELL |
 * DIVIDEND, shares, price, gross, fee, reason }; price is the price after slippage. Holdings are kept per security
 * (one position per security in both engines). opts.dust(date) -> ids written off as dust on that date (sf5 engine).
 */
export function checkLedgerAgainstBars(dataset, { ledger, curve }, { slippageBps, commissionBps, initialCapital, maxOpenPositions = Infinity, from = null, dustWriteOffs = new Map(), skipBarReasons = ['TERMINAL_DELISTED', 'SECURITY_UNAVAILABLE'] }) {
  const slip = slippageBps / 1e4, fee = commissionBps / 1e4, idx = barIndex(dataset), t = tally();
  // IEX-priced EP fills (entry minute, same-day stop) may lie outside the consolidated daily range: counted, not a violation
  const checks = { buyFills: 0, sellFills: 0, dividendRows: 0, sessions: 0, intradayOutsideDailyRange: 0 }, intradayBuy = new Map();
  let cash = initialCapital, flows = 0, k = 0, maxHeld = 0;
  const held = new Map(), entryDate = new Map(), entryFill = new Map();
  for (const c of curve) {
    for (; k < ledger.length && ledger[k].date === c.date; k++) {
      const r = ledger[k], x = idx.get(r.id), b = x ? x.bars[x.at.get(r.date)] : null;
      flows += Math.abs(r.gross || 0) + Math.abs(r.fee || 0);
      if (!near(r.gross, r.shares * r.price)) t.add('GROSS_NOT_SHARES_TIMES_PRICE', { id: r.id, date: r.date });
      if (r.side === 'BUY') {
        checks.buyFills++;
        if (!near(r.fee, r.gross * fee)) t.add('BUY_FEE', { id: r.id, date: r.date });
        const fill = r.price / (1 + slip);
        if (!b) t.add('BUY_WITHOUT_BAR', { id: r.id, date: r.date });
        else if (fill < b.low - EPS * fill || fill > b.high + EPS * fill) { if (r.reason === 'ENTRY_INTRADAY_MINUTE') checks.intradayOutsideDailyRange++; else t.add('BUY_FILL_OUTSIDE_BAR', { id: r.id, date: r.date }); }
        if (!(r.shares > 0)) t.add('BUY_SHARES_NOT_POSITIVE', { id: r.id, date: r.date });
        cash -= r.gross + r.fee;
        if (!held.has(r.id)) { entryDate.set(r.id, r.date); entryFill.set(r.id, fill); }
        if (r.reason === 'ENTRY_INTRADAY_MINUTE') intradayBuy.set(r.id, r.date);
        held.set(r.id, (held.get(r.id) || 0) + r.shares);
        maxHeld = Math.max(maxHeld, held.size);
        if (held.size > maxOpenPositions) t.add('OPEN_POSITIONS_ABOVE_POLICY', { id: r.id, date: r.date });
      } else if (r.side === 'SELL') {
        checks.sellFills++;
        if (!near(r.fee, r.gross * fee)) t.add('SELL_FEE', { id: r.id, date: r.date });
        const h = held.get(r.id) || 0;
        if (r.shares > h * (1 + EPS) + EPS) t.add('SELL_MORE_THAN_HELD', { id: r.id, date: r.date });
        if (!skipBarReasons.includes(r.reason)) {
          const fill = r.price / (1 - slip);
          if (!b) t.add('SELL_WITHOUT_BAR', { id: r.id, date: r.date });
          else if (fill < b.low - EPS * fill || fill > b.high + EPS * fill) { if (/^STOP_SAME_BAR_/.test(r.reason) && intradayBuy.get(r.id) === r.date) checks.intradayOutsideDailyRange++; else t.add('SELL_FILL_OUTSIDE_BAR', { id: r.id, date: r.date }); }
        }
        cash += r.gross - r.fee;
        const rest = h - r.shares;
        if (rest < -EPS * Math.max(1, h)) t.add('NEGATIVE_HOLDING', { id: r.id, date: r.date });
        if (rest <= EPS * Math.max(1, h)) { held.delete(r.id); entryDate.delete(r.id); } else held.set(r.id, rest);
      } else if (r.side === 'DIVIDEND') {
        checks.dividendRows++;
        if (!held.has(r.id)) t.add('DIVIDEND_WITHOUT_POSITION', { id: r.id, date: r.date });
        else if (!(entryDate.get(r.id) < r.date)) t.add('DIVIDEND_ON_ENTRY_DAY', { id: r.id, date: r.date });
        if (!near(r.shares, held.get(r.id) || 0)) t.add('DIVIDEND_SHARES', { id: r.id, date: r.date });
        cash += r.gross;
      } else t.add('UNKNOWN_LEDGER_SIDE', { id: r.id, date: r.date });
    }
    for (const id of dustWriteOffs.get(c.date) ?? []) { held.delete(id); entryDate.delete(id); }
    checks.sessions++;
    let mv = 0;
    // mark = last close in the run window, else the entry fill (both engines: lastClose ?? fill)
    for (const [id, sh] of held) { const m = markAt(idx.get(id), c.date, from); mv += sh * (m ?? entryFill.get(id)); }
    const tol = AC.reconciliationTolerance(flows, initialCapital); // the engine's own reconciliation bound
    if (cash < -tol) t.add('NEGATIVE_CASH', { date: c.date });
    if (Math.abs(cash + mv - c.equity) > tol) t.add('EQUITY_NOT_CASH_PLUS_POSITIONS', { date: c.date });
  }
  if (k !== ledger.length) t.add('LEDGER_ROW_OUTSIDE_CURVE', { date: ledger[k]?.date ?? null });
  return { checks: { ...checks, ledgerRows: ledger.length, maxOpenPositions: maxHeld }, violations: t.v, examples: t.examples };
}

/** the trigger reasons of protective levels are not reconstructable from events (a cleared trigger leaves no event) */
const SAME_BAR = /^STOP_SAME_BAR_/;

/**
 * Full independent check of one lifecycle run of research/lifecycle-engine.mjs (sf5 adapters, SF7 variants, EP).
 * Returns { checks, violations, diagnostics, examples }: violations must be empty; diagnostics are declared counts
 * (e.g. an EP entry day whose consolidated daily low lies below the IEX stop without an IEX stop, SF7 open finding).
 */
export function checkLifecycleRun(dataset, run, { config, adapter, policy, from = null }) {
  const slip = policy.slippageBps / 1e4, fee = policy.commissionBps / 1e4, idx = barIndex(dataset), t = tally();
  const calendar = run.curve.map((c) => c.date), next = new Map(calendar.map((d, k) => [d, calendar[k + 1] ?? null]));
  const eqBefore = new Map(run.curve.map((c, k) => [c.date, k ? run.curve[k - 1].equity : policy.initialCapital]));
  const cap = Math.min(policy.maxPositionWeight, adapter.sourceMaxPositionWeight ?? Infinity);
  const diagnostics = { entryDayLowBelowStopKept: 0, intradayEntryOutsideDailyRange: 0, intradayExitOutsideDailyRange: 0, sameBarStopIgnoredOptimistic: 0, cappedByCash: 0, cappedByWeight: 0 };
  const checks = { trades: run.trades.length, entries: 0, heldSessions: 0, stopExits: 0, scheduledExits: 0, sameBarExits: 0, stopRaises: 0 };
  const dust = new Map();
  // cash at each BUY row: replay of the ledger in booking order (the engine books in its own order)
  let cash = policy.initialCapital; const cashAtBuy = new Map(), rowsOf = new Map();
  for (const r of run.ledger) {
    if (r.side === 'BUY') cashAtBuy.set(r.tradeId, cash);
    cash += r.side === 'BUY' ? -(r.gross + r.fee) : r.gross - r.fee;
    if (r.tradeId != null) { if (!rowsOf.has(r.tradeId)) rowsOf.set(r.tradeId, []); rowsOf.get(r.tradeId).push(r); }
  }
  for (const tr of run.trades) {
    const x = idx.get(tr.id), ex = { id: tr.id, date: tr.entryDate };
    const eb = x.bars[x.at.get(tr.entryDate)];
    checks.entries++;
    // timing: never a fill before the signal; a closing-auction entry on the signal bar, all others on the next session
    if (tr.entryBasis === 'CLOSE') { if (tr.entryDate !== tr.signalDate) t.add('CLOSE_ENTRY_NOT_ON_SIGNAL_BAR', ex); }
    else if (next.get(tr.signalDate) !== tr.entryDate) t.add(tr.entryDate <= tr.signalDate ? 'ENTRY_NOT_AFTER_SIGNAL' : 'ENTRY_NOT_NEXT_SESSION', ex);
    // fill by basis
    const f = tr.entryFill;
    if (tr.entryBasis === 'OPEN' && !near(f, eb.open)) t.add('OPEN_ENTRY_NOT_AT_OPEN', ex);
    if (tr.entryBasis === 'CLOSE' && !near(f, eb.close)) t.add('CLOSE_ENTRY_NOT_AT_CLOSE', ex);
    if (tr.entryBasis === 'OPEN_GAP_AT_OR_ABOVE_LEVEL' && !(near(f, eb.open) && eb.open >= tr.orderLevel - EPS)) t.add('GAP_ENTRY_NOT_AT_OPEN', ex);
    if (tr.entryBasis === 'INTRADAY_LEVEL_TOUCH' && !(near(f, tr.orderLevel) && eb.open < tr.orderLevel && eb.high >= tr.orderLevel - EPS)) t.add('TOUCH_ENTRY_NOT_AT_LEVEL', ex);
    if (tr.entryBasis === 'INTRADAY_MINUTE') { if (f < eb.low - EPS * f || f > eb.high + EPS * f) diagnostics.intradayEntryOutsideDailyRange++; }
    else if (f < eb.low - EPS * f || f > eb.high + EPS * f) t.add('ENTRY_FILL_OUTSIDE_BAR', ex);
    const stop0 = tr.initialStop;
    if (fin(stop0) && !(f > stop0)) t.add('ENTRY_AT_OR_BELOW_STOP', ex);
    // sizing, rebuilt from the prior close equity and the cash at the fill
    const eq = eqBefore.get(tr.entryDate), unit = f * (1 + slip) * (1 + fee), s = config.sizing;
    const planned = s.mode === 'RISK' ? Math.floor((eq * s.riskFraction) / (f - stop0) + 1e-9) : Math.floor((eq * s.weight) / f + 1e-9);
    const byCap = Math.floor((cap * eq) / f + 1e-9), byCash = Math.floor(Math.max(0, cashAtBuy.get(tr.tradeId)) / unit + 1e-9);
    if (tr.shares !== Math.min(planned, byCap, byCash)) t.add('SHARES_NOT_RULE', ex);
    if (byCash < Math.min(planned, byCap)) diagnostics.cappedByCash++; else if (byCap < planned) diagnostics.cappedByWeight++;
    if (!Number.isInteger(tr.shares) || !(tr.shares > 0)) t.add('ENTRY_SHARES_NOT_WHOLE', ex);
    if ((tr.shares * f) / eq > cap + 1e-9) t.add('WEIGHT_ABOVE_CAP', ex);
    if (s.mode === 'RISK' && (tr.shares * (f - stop0)) / eq > s.riskFraction + 1e-9) t.add('RISK_ABOVE_FRACTION', ex);
    // stop path from the events: initial stop, raises effective from the next session, never lower
    const ev = tr.events ?? [], raises = ev.filter((e) => e.type === 'STOP_RAISED');
    let last = stop0; for (const r of raises) { checks.stopRaises++; if (fin(last) && !(r.stop > last)) t.add('STOP_LOWERED_OR_EQUAL', { id: tr.id, date: r.date }); last = r.stop; }
    const stopOn = (d) => { let st = stop0; for (const r of raises) if (r.date < d) st = r.stop; return st; };
    const sells = ev.filter((e) => e.type === 'SELL'), exitDate = tr.exitDate ?? null;
    for (const e of ev) if (e.type === 'DUST_WRITE_OFF') { if (!dust.has(e.date)) dust.set(e.date, []); dust.get(e.date).push(tr.id); }
    const ignored = ev.some((e) => e.type === 'SAME_BAR_STOP_IGNORED');
    if (ignored) { diagnostics.sameBarStopIgnoredOptimistic++; if (config.intrabarOrder !== 'OPTIMISTIC') t.add('SAME_BAR_STOP_IGNORED_UNDER_PESSIMISTIC', ex); }
    // entry bar: a stop reached after an open / gap / touch fill must be acted on (exit) or be the declared optimistic case
    // EP: the stop IS the low of day before the fill (official open and IEX lows), so only a consolidated daily low
    // strictly below it is a print the IEX minutes did not show (before or after the fill: a daily bar cannot tell)
    if (fin(stop0) && tr.entryBasis === 'INTRADAY_MINUTE' && fin(eb.low) && eb.low < stop0 && !sells.some((e) => e.date === tr.entryDate)) diagnostics.entryDayLowBelowStopKept++;
    else if (fin(stop0) && tr.entryBasis !== 'CLOSE' && tr.entryBasis !== 'INTRADAY_MINUTE' && fin(eb.low) && eb.low <= stop0 && !sells.some((e) => e.date === tr.entryDate)) {
      if (!ignored || tr.entryBasis !== 'INTRADAY_LEVEL_TOUCH') t.add('ENTRY_BAR_STOP_MISSED', ex);
    }
    // held sessions: a reached stop is never skipped; every exit priced by its rule
    const k0 = x.at.get(tr.entryDate);
    for (let k = k0 + 1; k < x.bars.length; k++) {
      const b = x.bars[k];
      if (exitDate !== null && b.date > exitDate) break;
      if (exitDate === null && b.date > calendar.at(-1)) break;
      if (b.date === exitDate) break;
      checks.heldSessions++;
      const st = stopOn(b.date);
      // a partial sale at the open leaves the rest under the stop: a reached stop needs a STOP_ sale the same day
      if (fin(st) && AC.isExecutableBar(b, 'open') && fin(b.low) && b.low <= st && !sells.some((e) => e.date === b.date && e.reason.startsWith('STOP_'))) t.add('STOP_REACHED_NOT_EXECUTED', { id: tr.id, date: b.date });
    }
    for (const e of sells) {
      const b = x.bars[x.at.get(e.date)], px = e.price / (1 - slip), r = e.reason, se = { id: tr.id, date: e.date };
      if (e.date < tr.entryDate) t.add('EXIT_BEFORE_ENTRY', se);
      if (r === 'TERMINAL_DELISTED' || r === 'SECURITY_UNAVAILABLE') continue;
      if (!b || px < b.low - EPS * px || px > b.high + EPS * px) {
        // an EP same-day stop is priced from IEX minutes (one venue): outside the consolidated daily range it is a count
        if (b && SAME_BAR.test(r) && tr.entryBasis === 'INTRADAY_MINUTE') diagnostics.intradayExitOutsideDailyRange++;
        else { t.add('EXIT_FILL_OUTSIDE_BAR', se); continue; }
      }
      if (SAME_BAR.test(r)) {
        checks.sameBarExits++;
        if (e.date !== tr.entryDate) t.add('SAME_BAR_EXIT_NOT_ON_ENTRY_BAR', se);
        if (tr.entryBasis === 'INTRADAY_MINUTE' ? px > stop0 + EPS * px : !near(px, stop0)) t.add('SAME_BAR_EXIT_NOT_AT_STOP', se);
        continue;
      }
      const sched = ev.find((q) => q.type === 'EXIT_SCHEDULED_NEXT_OPEN' && q.reason === r && q.date < e.date);
      if (sched) { checks.scheduledExits++; if (!near(px, b.open)) t.add('SCHEDULED_EXIT_NOT_AT_OPEN', se); continue; }
      if (ev.some((q) => q.type === 'EXIT_SCHEDULED_NEXT_OPEN' && q.reason === r && q.date >= e.date)) { t.add('SCHEDULED_EXIT_SAME_BAR', se); continue; }
      if (r.startsWith('STOP_')) {
        checks.stopExits++;
        const st = stopOn(e.date), gap = r.endsWith('_GAP_OPEN');
        if (!(fin(st) && b.low <= st)) t.add('STOP_EXIT_NOT_REACHED', se);
        if (!near(px, Math.min(b.open, st))) t.add('STOP_EXIT_NOT_MIN_OPEN_STOP', se);
        if (gap !== (b.open < st)) t.add('STOP_GAP_LABEL', se);
      } else if (r.endsWith('_GAP_OPEN') && !near(px, b.open)) t.add('GAP_EXIT_NOT_AT_OPEN', se);
      else if (!(px <= b.open + EPS * px)) t.add('PROTECTIVE_EXIT_ABOVE_OPEN', se);
    }
    // the trade's own ledger rows carry the fill with slippage on both sides
    const rows = rowsOf.get(tr.tradeId) ?? [], buy = rows.find((q) => q.side === 'BUY');
    if (!buy || !near(buy.price, f * (1 + slip)) || buy.shares !== tr.shares || buy.date !== tr.entryDate) t.add('BUY_ROW_MISMATCH', ex);
  }
  const books = checkLedgerAgainstBars(dataset, run, { slippageBps: policy.slippageBps, commissionBps: policy.commissionBps, initialCapital: policy.initialCapital, maxOpenPositions: policy.maxOpenPositions, from, dustWriteOffs: dust });
  for (const [k, n] of Object.entries(books.violations)) t.v[k] = (t.v[k] || 0) + n;
  if (!run.reconciliation?.pass) t.add('RECONCILIATION_FAILED', {});
  return { version: SF7_CHECKS_VERSION, checks: { ...checks, ...books.checks }, violations: t.v, violationCount: Object.values(t.v).reduce((a, b) => a + b, 0), diagnostics, examples: [...t.examples, ...books.examples].slice(0, 20) };
}

/**
 * Dataset whose bars AFTER calendar index cut are replaced by unrelated values (same dates, same presence of a bar and
 * of each field, same flags): only the prices, volumes and dividends change. Dataset-wide derived inputs (spyTR,
 * groupProxies, ...) are copied unchanged: a caller using them rebuilds them on the result. Optionally only the next `keep` sessions after the cut
 * are kept (memory bound on the snapshot); the decisions up to the cut must be identical either way.
 */
export function corruptAfter(dataset, cut, { seed = 1, keep = Infinity } = {}) {
  const cutDate = dataset.calendar[cut], lastKept = dataset.calendar[Math.min(dataset.calendar.length - 1, cut + keep)];
  let s = seed >>> 0; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  const securities = dataset.securities.map((sec) => {
    let k = sec.bars.length; while (k > 0 && sec.bars[k - 1].date > cutDate) k--;
    if (k === sec.bars.length) return sec;
    const bars = sec.bars.slice(0, k);
    for (let j = k; j < sec.bars.length && sec.bars[j].date <= lastKept; j++) {
      const b = sec.bars[j], base = fin(b.close) ? b.close : fin(b.open) ? b.open : 10, o = base * (0.4 + 1.2 * rnd()), c = o * (0.7 + 0.6 * rnd());
      const h = Math.max(o, c) * (1 + 0.1 * rnd()), l = Math.min(o, c) * (1 - 0.1 * rnd()), v = (fin(b.volume) ? b.volume : 1e6) * (0.1 + 5 * rnd());
      bars.push({ ...b, open: fin(b.open) ? o : b.open, high: fin(b.high) ? h : b.high, low: fin(b.low) ? l : b.low, close: fin(b.close) ? c : b.close, volume: fin(b.volume) ? v : b.volume, rawVolume: fin(b.rawVolume) ? v : b.rawVolume, ...(fin(b.rawClose) ? { rawClose: c * (b.rawClose / (b.close || 1)) } : {}), ...(b.dividend ? { dividend: b.dividend * 3 } : {}) });
    }
    return { ...sec, bars };
  });
  return { ...dataset, calendar: dataset.calendar.filter((d) => d <= lastKept), securities };
}

/** What a run has decided up to and including date (bookings, curve, entries and their events, rejections, counts of armed orders are not exposed). */
export function decisionsThrough(run, date) {
  return {
    ledger: run.ledger.filter((r) => r.date <= date),
    curve: run.curve.filter((c) => c.date <= date),
    trades: run.trades.filter((t) => t.entryDate <= date).map((t) => ({ tradeId: t.tradeId, id: t.id, signalDate: t.signalDate, entryDate: t.entryDate, entryFill: t.entryFill, entryBasis: t.entryBasis, initialStop: t.initialStop, shares: t.shares, events: (t.events ?? []).filter((e) => e.date <= date) })),
    rejections: run.rejections.filter((r) => r.date <= date),
  };
}
export const decisionsSha256 = (run, date) => sha(decisionsThrough(run, date));

/**
 * Every setup and order an adapter knows at the closes up to and including cutDate (signalAt + eligibility per bar),
 * hashed incrementally: the orders armed AT the cut close are decisions of the cut session, even though they fill later.
 */
export function signalsThrough(dataset, { adapter, config, prepared }, cutDate) {
  const h = crypto.createHash('sha256'); let count = 0;
  for (const s of [...dataset.securities].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const ctx = prepared.get(s.id); if (!ctx) continue;
    for (let i = 0; i < s.bars.length && s.bars[i].date <= cutDate; i++) {
      const setup = adapter.signalAt(ctx, i, config); if (!setup) continue;
      const el = adapter.eligibility({ ctx, setup, bars: s.bars, i, cfg: config });
      h.update(JSON.stringify([s.id, i, setup, el])); count++;
    }
  }
  return { count, sha256: h.digest('hex') };
}

/**
 * Trade-level comparison by (security, entry date): unchanged = same fill, shares, exit date, reason and status;
 * sharesOnly = same timing and prices, other share count (knock-on through equity-based sizing); changed = other exit.
 */
export function compareTradeSets(base, other, { excludeIds = [] } = {}) {
  const ex = new Set(excludeIds), key = (t) => `${t.id}|${t.entryDate}`, timing = (t) => JSON.stringify([t.entryFill, t.exitDate ?? null, t.exitReason ?? null, t.status]);
  const a = new Map(base.filter((t) => !ex.has(t.id)).map((t) => [key(t), t])), b = new Map(other.filter((t) => !ex.has(t.id)).map((t) => [key(t), t]));
  let unchanged = 0, sharesOnly = 0, changed = 0, dropped = 0;
  for (const [k, t] of a) { const u = b.get(k); if (!u) dropped++; else if (timing(u) !== timing(t)) changed++; else if (u.shares !== t.shares) sharesOnly++; else unchanged++; }
  let added = 0; for (const k of b.keys()) if (!a.has(k)) added++;
  return { base: a.size, other: b.size, unchanged, sharesOnly, changed, dropped, added };
}

/** Deterministic choice of the securities left out: the one with the most trades, then two by sha256 order of the id (ties by id). */
export function stabilityDropIds(baseTrades, n = 3) {
  const by = new Map(); for (const t of baseTrades) by.set(t.id, (by.get(t.id) || 0) + 1);
  const ids = [...by.keys()].sort();
  if (!ids.length) return [];
  const most = [...ids].sort((a, b) => by.get(b) - by.get(a) || (a < b ? -1 : 1))[0];
  const rest = ids.filter((x) => x !== most).sort((a, b) => (sha(a) < sha(b) ? -1 : sha(a) > sha(b) ? 1 : 0));
  return [{ id: most, rule: 'MOST_TRADES' }, ...rest.slice(0, n - 1).map((id) => ({ id, rule: 'SHA256_ORDER' }))];
}

/**
 * Stability diagnostic of one configuration: runs without each chosen security and with the start one session later,
 * compared trade by trade with the base run. run(datasetOrNull, from) executes the configuration (prepared inputs shared).
 */
export function stabilityPart(dataset, base, { run, from, n = 3 }) {
  const drops = stabilityDropIds(base.trades, n), out = { leaveOneOut: [], startShift: null };
  for (const d of drops) {
    const r = run({ ...dataset, securities: dataset.securities.filter((s) => s.id !== d.id) }, from);
    out.leaveOneOut.push({ rule: d.rule, ownTrades: base.trades.filter((t) => t.id === d.id).length, id: d.id, ...compareTradeSets(base.trades, r.trades, { excludeIds: [d.id] }) });
  }
  const cal = dataset.calendar.filter((x) => !from || x >= from);
  if (cal.length > 1) { const r = run(dataset, cal[1]); out.startShift = { from: cal[1], ...compareTradeSets(base.trades.filter((t) => t.entryDate >= cal[1]), r.trades) , baseTradesBeforeShift: base.trades.filter((t) => t.entryDate < cal[1]).length }; }
  return out;
}
/** public form of a stability result: counts only (the security ids stay sealed). */
export const stabilityPublic = (s) => ({ leaveOneOut: s.leaveOneOut.map(({ id, ...c }) => c), startShift: s.startShift ? (({ from, ...c }) => c)(s.startShift) : null }); // eslint-disable-line no-unused-vars

