// Supertrader — deterministischer Balken-fuer-Balken-Simulator.
//
// DERSELBE Code erzeugt die Live-Signalhistorie (ein Tag pro Lauf) und die
// Trades eines Backtests (alle Tage in Folge). Damit kann ein Backtest
// keine Regel verwenden, die live nicht galt, und umgekehrt.
//
// Reihenfolge je Balken t (Long):
//   1. offene Order zur Eroeffnung ausfuehren (Teil-/Vollverkauf, Wochen-Entry)
//   2. Stop pruefen (Gap -> Eroeffnung, sonst Stopkurs)
//   3. Positionsfuehrung auf Schlusskursbasis -> Order fuer t+1
//   4. wartendes Setup: Trigger (Levels von t-1) -> Invalidierung -> Rescan
//   5. ohne Signal: Scan; ab SETUP wird ein Signal eroeffnet
import { assertTransition, PENDING } from './lifecycle.mjs';
import * as X from './execution.mjs';

export const COOLDOWN_SESSIONS = 5; // LC-COOLDOWN-01 (VU)
const PRICE_KEYS = ['trigger', 'invalidation', 'pivot', 'resistance', 'baseSupport', 'baseHigh', 'baseLow', 'boxTop', 'boxBottom', 'contractionLow', 'ma30w'];

function transition(sig, to, date, ruleId, extra = {}) {
  assertTransition(sig.state, to);
  sig.state = to;
  sig.transitions.push({ state: to, date, ruleId, ...extra });
}

function round(v, d = 4) { return Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v; }

function closeTrade(sig) {
  const e = sig.entry.price;
  let proceeds = 0, frac = 0;
  for (const x of sig.exits) { proceeds += x.fraction * x.price; frac += x.fraction; }
  const ret = frac > 0 ? proceeds / (e * frac) - 1 : null;
  const costs = X.DEFAULT_EXECUTION.commissionBps / 10000 * 2;
  const risk = e - sig.initialStop;
  sig.result = {
    returnPct: round(ret - costs, 6),
    rMultiple: risk > 0 ? round((proceeds / frac - e) / risk, 3) : null,
    sessionsHeld: sig.heldSessions || 0,
  };
}

export function newState() { return { signal: null, cooldownUntil: -1, closed: [] }; }

// Skaliert gespeicherte Preislevels, wenn sich die adjustierte Reihe seit dem
// letzten Lauf durch einen Split verschoben hat.
export function rescaleSignal(sig, factor, date) {
  const f = (v) => (Number.isFinite(v) ? v * factor : v);
  for (const k of PRICE_KEYS) if (sig.levels && k in sig.levels) sig.levels[k] = f(sig.levels[k]);
  if (sig.entry) sig.entry.price = f(sig.entry.price);
  if (Number.isFinite(sig.stop)) sig.stop = f(sig.stop);
  if (Number.isFinite(sig.initialStop)) sig.initialStop = f(sig.initialStop);
  for (const x of sig.exits || []) x.price = f(x.price);
  (sig.adjustments ||= []).push({ date, factor: round(factor, 6), reason: 'PRICE_ADJUSTMENT' });
}

export function simulate(strategy, ctx, opts = {}) {
  const { bars } = ctx;
  const exec = opts.exec || X.DEFAULT_EXECUTION;
  const params = opts.params || strategy.PARAMS;
  const state = opts.state || newState();
  const from = opts.from ?? 0;
  const to = opts.to ?? bars.date.length - 1;
  const fill = { stopBuy: (lvl, open) => X.stopBuyFill(lvl, open, exec) };
  let lastScan = null;
  const finished = [];
  const finish = (sig) => { finished.push(sig); state.signal = null; };

  for (let t = from; t <= to; t++) {
    const date = bars.date[t];
    const sig = state.signal;
    if (!Number.isFinite(bars.open[t]) || !Number.isFinite(bars.close[t])) continue;

    if (sig && !PENDING.has(sig.state)) {
      if (sig.entry && date > sig.entry.date) sig.heldSessions = (sig.heldSessions || 0) + 1;
      // 1. Order zur Eroeffnung
      if (sig.order) {
        const o = sig.order; sig.order = null;
        if (o.kind === 'BUY') {
          const f = X.marketBuyAtOpen(bars.open[t], exec);
          sig.entry = { date, index: t, price: f.price, gapped: bars.open[t] > sig.levels.trigger };
          sig.initialStop = sig.stop;
        } else {
          const f = X.marketSellAtOpen(bars.open[t], exec);
          sig.exits.push({ date, index: t, price: f.price, fraction: o.fraction, ruleId: o.ruleId });
          sig.remaining = round(sig.remaining - o.fraction, 6);
          if (o.partial) sig.partialDone = true;
          if (sig.remaining <= 1e-9) {
            if (sig.state !== 'EXIT') transition(sig, 'EXIT', date, o.ruleId);
            transition(sig, 'CLOSED', date, o.ruleId, { price: round(f.price) });
            closeTrade(sig); finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
          }
        }
      }
      // 2. Stop
      if (sig.entry && bars.low[t] <= sig.stop) {
        const f = X.stopSellFill(sig.stop, bars.open[t], exec);
        sig.exits.push({ date, index: t, price: f.price, fraction: sig.remaining, ruleId: sig.stopRuleId, gapped: f.gapped });
        sig.remaining = 0;
        if (sig.state !== 'EXIT') transition(sig, 'EXIT', date, sig.stopRuleId, { price: round(f.price), gapped: f.gapped });
        transition(sig, 'CLOSED', date, sig.stopRuleId, { price: round(f.price) });
        closeTrade(sig); finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
      }
      // 3. Positionsfuehrung (nur mit ausgefuehrtem Einstieg)
      if (sig.entry && sig.state !== 'EXIT' && date > sig.entry.date) {
        const pos = { ...sig, entry: sig.entry.price, entryIndex: sig.entry.index, entryDate: sig.entry.date };
        const m = strategy.manage(ctx, t, pos, params) || {};
        if (Number.isFinite(m.stop) && m.stop > sig.stop) { sig.stop = m.stop; sig.stopRuleId = m.stopRuleId || sig.stopRuleId; sig.stopHistory.push({ date, stop: round(m.stop), ruleId: m.stopRuleId }); }
        if (m.exitNextOpen) {
          transition(sig, 'EXIT', date, m.exitNextOpen, { price: round(bars.close[t]) });
          sig.order = { kind: 'SELL', fraction: sig.remaining, ruleId: m.exitNextOpen };
        } else {
          if (m.partialNextOpen && !sig.partialDone && !sig.order) sig.order = { kind: 'SELL', fraction: round(sig.remaining * m.partialNextOpen.fraction, 6), ruleId: m.partialNextOpen.ruleId, partial: true };
          const want = m.warning ? 'WARNING' : 'ACTIVE';
          if (sig.state !== want) transition(sig, want, date, m.warning ? (m.warningRuleId || 'LC-WARN') : 'LC-ACTIVE');
        }
      }
      continue;
    }

    if (sig && PENDING.has(sig.state)) {
      sig.sessions++;
      const e = strategy.entry(ctx, t, { ...sig }, params, fill);
      if (e && e.notTaken) {
        transition(sig, 'INVALIDATED', date, e.ruleId, { note: e.note });
        finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
      }
      if (e) {
        sig.stop = e.stop; sig.stopRuleId = e.stopRuleId; sig.remaining = 1; sig.exits = []; sig.stopHistory = [{ date, stop: round(e.stop), ruleId: e.stopRuleId }];
        if (e.volumeRatio !== undefined) sig.facts.breakoutVolumeRatio = e.volumeRatio;
        if (e.volumeVerified !== undefined) sig.facts.volumeVerified = e.volumeVerified;
        if (e.quality) sig.quality = e.quality; // Qualitaet wird am Trigger endgueltig
        if (e.nextOpen) {
          transition(sig, 'TRIGGERED', date, e.ruleId, { price: round(bars.close[t]), note: 'Ausführung zur nächsten Eröffnung' });
          sig.order = { kind: 'BUY' };
          continue;
        }
        sig.entry = { date, index: t, price: e.fill, gapped: e.gapped };
        sig.initialStop = e.stop;
        transition(sig, 'TRIGGERED', date, e.ruleId, { price: round(e.fill), gapped: e.gapped });
        if (e.sameBarStop) {
          const px = Math.min(e.stop, e.fill) * (1 - exec.slippageBps / 10000);
          sig.exits.push({ date, index: t, price: px, fraction: 1, ruleId: e.stopRuleId, sameBar: true });
          sig.remaining = 0;
          transition(sig, 'EXIT', date, e.stopRuleId, { price: round(px), note: 'Same-Bar-Ambiguität: ungünstige Reihenfolge angenommen' });
          transition(sig, 'CLOSED', date, e.stopRuleId, { price: round(px) });
          closeTrade(sig); finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS;
        }
        continue;
      }
      const inv = strategy.invalidate(ctx, t, sig, params);
      if (inv) { transition(sig, 'INVALIDATED', date, inv, { price: round(bars.close[t]) }); finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue; }
      // LC-RANK-AT-DISCOVERY: Rangfilter gelten bei Entdeckung; ein laufendes
      // Setup wird nur durch seine Strukturregeln ungueltig.
      const r = strategy.scan(ctx, t, params, { pending: sig });
      if (r === undefined) continue;
      lastScan = r;
      if (!r || !PENDING.has(r.stage)) {
        transition(sig, 'INVALIDATED', date, 'LC-SETUP-LOST', { price: round(bars.close[t]), failed: r ? Object.keys(r.rules).filter((k) => !r.rules[k]) : [] });
        finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
      }
      sig.levels = r.levels; sig.facts = r.facts; sig.rules = r.rules;
      if (r.quality) sig.quality = r.quality;
      if (r.stage !== sig.state) transition(sig, r.stage, date, r.stage === 'ENTRY_READY' ? 'LC-NEAR-TRIGGER' : 'LC-AWAY-FROM-TRIGGER', { price: round(bars.close[t]) });
      continue;
    }

    // 5. kein offenes Signal
    const r = strategy.scan(ctx, t, params);
    if (r === undefined) continue;
    lastScan = r;
    if (t <= state.cooldownUntil) continue;
    if (r && PENDING.has(r.stage)) {
      const s = {
        id: `${strategy.id}:${ctx.symbol}:${date}`, strategyId: strategy.id, variant: strategy.variant, version: strategy.version,
        symbol: ctx.symbol, createdAt: date, state: null, sessions: 0,
        levels: r.levels, facts: r.facts, rules: r.rules, transitions: [], exits: [],
      };
      if (r.quality) s.quality = r.quality;
      transition(s, r.stage, date, r.stage === 'ENTRY_READY' ? 'LC-NEAR-TRIGGER' : 'LC-SETUP', { price: round(bars.close[t]) });
      state.signal = s;
    }
  }
  return { state, finished, lastScan, lastIndex: to };
}
