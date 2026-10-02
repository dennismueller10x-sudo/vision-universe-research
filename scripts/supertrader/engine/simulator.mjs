// Supertrader — deterministischer Balken-fuer-Balken-Simulator (Version 2).
//
// DERSELBE Code erzeugt die Live-Signalhistorie (ein Tag pro Lauf) und die
// Trades eines Backtests (alle Tage in Folge). Damit kann ein Backtest
// keine Regel verwenden, die live nicht galt, und umgekehrt.
//
// DATEN- UND ZEITREGEL (LC-CONFIRM-CLOSE, LC-MODEL-ENTRY)
// Es liegen nur Tagesbalken vor. Ob und zu welchem Preis innerhalb eines Tages
// ueber den Trigger gehandelt wurde, ist damit nicht belegbar. Deshalb:
//   * Ein Einstieg ist BESTAETIGT, wenn der Schlusskurs (Tagesstrategien) bzw.
//     der Wochenschluss (Weinstein) den Trigger ueberschreitet.
//   * Der MODELLEINSTIEG wird zur Eroeffnung des naechsten Handelstags erfasst -
//     einem tatsaechlich beobachteten Kurs, nie zum idealen Triggerkurs.
//
// Reihenfolge je Balken t:
//   0. fehlender Balken -> Datenluecke protokollieren, keine Entscheidung
//   1. offene Order zur Eroeffnung: Modelleinstieg (mit Gap- und Stop-Pruefung)
//      oder Teil-/Vollverkauf
//   2. Stop (ruhende Stop-Order-Annahme; bei Gap zur Eroeffnung)
//   3. Positionsfuehrung auf Schlusskursbasis -> Order fuer t+1
//   4. vorbereitetes Setup: erst Invalidation, dann Bestaetigung (LC-CONFLICT-01),
//      dann Neubewertung
//   5. ohne Signal: Scan; ab SETUP wird ein Signal eroeffnet
import { assertTransition, PENDING } from './lifecycle.mjs';
import * as X from './execution.mjs';

export const SIMULATOR_VERSION = 'supertrader-simulator-2.0.0';
export const COOLDOWN_SESSIONS = 5; // LC-COOLDOWN-01 (VU)
const PRICE_KEYS = ['trigger', 'invalidation', 'pivot', 'resistance', 'baseSupport', 'baseHigh', 'baseLow', 'boxTop', 'boxBottom', 'contractionLow', 'ma30w'];

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
    basis: 'LIVE_MODEL_LEDGER',
  };
}

export function newState() { return { signal: null, cooldownUntil: -1, closed: [] }; }

// Skaliert gespeicherte Preislevels, wenn sich die adjustierte Reihe seit dem
// letzten Lauf durch einen Split verschoben hat. Protokolleintraege
// (transitions) bleiben unveraendert; der Faktor wird dokumentiert.
export function rescaleSignal(sig, factor, date) {
  const f = (v) => (Number.isFinite(v) ? v * factor : v);
  for (const k of PRICE_KEYS) if (sig.levels && k in sig.levels) sig.levels[k] = f(sig.levels[k]);
  if (sig.entry) sig.entry.price = f(sig.entry.price);
  if (Number.isFinite(sig.stop)) sig.stop = f(sig.stop);
  if (Number.isFinite(sig.initialStop)) sig.initialStop = f(sig.initialStop);
  for (const x of sig.exits || []) x.price = f(x.price);
  (sig.adjustments ||= []).push({ date, factor: round(factor, 6), reason: 'PRICE_ADJUSTMENT', note: 'Gespeicherte Levels auf die neu adjustierte Reihe umgerechnet; Protokolleinträge bleiben im damaligen Kursmaßstab.' });
}

export function simulate(strategy, ctx, opts = {}) {
  const { bars } = ctx;
  const exec = opts.exec || X.DEFAULT_EXECUTION;
  const params = opts.params || strategy.PARAMS;
  const state = opts.state || newState();
  const from = opts.from ?? 0;
  const to = opts.to ?? bars.date.length - 1;
  const meta = { ruleVersion: strategy.version, recordedAt: opts.recordedAt ?? null };
  let lastScan = null;
  const finished = [];
  const finish = (sig) => { finished.push(sig); state.signal = null; };
  const slip = exec.slippageBps / 10000;

  // Jeder Protokolleintrag: Zustand, Datum (= Datenstand des Balkens), Regel,
  // Regelversion und Zeitpunkt der zugrunde liegenden Datenmaterialisierung.
  const transition = (sig, to, date, ruleId, extra = {}) => {
    assertTransition(sig.state, to);
    sig.state = to;
    sig.transitions.push({ state: to, date, dataAsOf: date, ruleId, ruleVersion: meta.ruleVersion, recordedAt: meta.recordedAt, ...extra });
  };

  for (let t = from; t <= to; t++) {
    const date = bars.date[t];
    const sig = state.signal;
    // manageOnly (Runde 7): Fuehrung einer Modellposition nach ihrer alten
    // Regelversion. Ohne offene Position wird nichts gesucht und nichts eroeffnet.
    if (opts.manageOnly && !(sig && sig.entry)) break;
    // 0. Datenluecke: keine Entscheidung, nichts wird erfunden.
    if (!Number.isFinite(bars.open[t]) || !Number.isFinite(bars.close[t]) || !Number.isFinite(bars.high[t]) || !Number.isFinite(bars.low[t])) {
      if (sig) (sig.dataGaps ||= []).push({ date, reason: 'MISSING_BAR', ruleId: 'LC-DATA-GAP' });
      continue;
    }

    // 1a. Modelleinstieg zur Eroeffnung nach bestaetigtem Trigger
    if (sig && sig.state === 'TRIGGERED' && sig.order && sig.order.kind === 'BUY') {
      sig.order = null;
      const open = bars.open[t];
      const plan = strategy.planEntry(ctx, t, sig, params);
      if (plan.notTaken) {
        transition(sig, 'INVALIDATED', date, plan.ruleId, { price: round(open), priceBasis: 'OPEN', note: plan.note });
        finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
      }
      const f = X.marketBuyAtOpen(open, exec);
      if (!(open > plan.stop)) {
        transition(sig, 'INVALIDATED', date, 'LC-OPEN-BELOW-STOP', { price: round(open), priceBasis: 'OPEN', note: 'Eröffnung auf oder unter dem Stop — kein Modelleinstieg.' });
        finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
      }
      sig.entry = { date, index: t, price: f.price, priceBasis: 'NEXT_OPEN', rawOpen: round(open), gappedAboveTrigger: open > sig.levels.trigger, slippageBps: exec.slippageBps };
      sig.stop = plan.stop; sig.initialStop = plan.stop; sig.stopRuleId = plan.stopRuleId;
      sig.stopHistory = [{ date, stop: round(plan.stop), ruleId: plan.stopRuleId, ruleVersion: meta.ruleVersion }];
      sig.remaining = 1; sig.exits = [];
      transition(sig, 'ACTIVE', date, 'LC-MODEL-ENTRY', { price: round(f.price), priceBasis: 'NEXT_OPEN', stop: round(plan.stop), note: 'Modelleinstieg zur Eröffnung (keine reale Order).' });
      // Stop am Einstiegstag: Eroeffnung liegt ueber dem Stop, Reihenfolge ist
      // eindeutig (erst Einstieg zur Eroeffnung, spaeter das Tagestief).
      if (bars.low[t] <= sig.stop) {
        const px = X.stopSellFill(sig.stop, open, exec);
        sig.exits.push({ date, index: t, price: px.price, fraction: 1, ruleId: sig.stopRuleId, priceBasis: 'STOP_ORDER_ASSUMPTION' });
        sig.remaining = 0;
        transition(sig, 'EXIT', date, sig.stopRuleId, { price: round(px.price), priceBasis: 'STOP_ORDER_ASSUMPTION' });
        transition(sig, 'CLOSED', date, sig.stopRuleId, { price: round(px.price), priceBasis: 'STOP_ORDER_ASSUMPTION' });
        closeTrade(sig); finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS;
      }
      continue;
    }

    if (sig && sig.entry) {
      if (date > sig.entry.date) sig.heldSessions = (sig.heldSessions || 0) + 1;
      const afterGap = (sig.dataGaps || []).some((g) => g.date > (sig.lastDecisionDate || sig.entry.date));
      // 1b. Verkaufsorder zur Eroeffnung
      if (sig.order) {
        const o = sig.order; sig.order = null;
        const f = X.marketSellAtOpen(bars.open[t], exec);
        sig.exits.push({ date, index: t, price: f.price, fraction: o.fraction, ruleId: o.ruleId, priceBasis: 'NEXT_OPEN', afterDataGap: afterGap || undefined });
        sig.remaining = round(sig.remaining - o.fraction, 6);
        if (o.partial) sig.partialDone = true;
        if (sig.remaining <= 1e-9) {
          if (sig.state !== 'EXIT') transition(sig, 'EXIT', date, o.ruleId);
          transition(sig, 'CLOSED', date, o.ruleId, { price: round(f.price), priceBasis: 'NEXT_OPEN' });
          closeTrade(sig); finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
        }
      }
      // 2. Stop (ruhende Stop-Order-Annahme)
      if (bars.low[t] <= sig.stop) {
        const f = X.stopSellFill(sig.stop, bars.open[t], exec);
        const basis = f.gapped ? 'OPEN_BELOW_STOP' : 'STOP_ORDER_ASSUMPTION';
        sig.exits.push({ date, index: t, price: f.price, fraction: sig.remaining, ruleId: sig.stopRuleId, priceBasis: basis, afterDataGap: afterGap || undefined });
        sig.remaining = 0;
        if (sig.state !== 'EXIT') transition(sig, 'EXIT', date, sig.stopRuleId, { price: round(f.price), priceBasis: basis });
        transition(sig, 'CLOSED', date, sig.stopRuleId, { price: round(f.price), priceBasis: basis });
        closeTrade(sig); finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
      }
      // 3. Positionsfuehrung auf Schlusskursbasis (ab dem Tag nach dem Einstieg)
      if (sig.state !== 'EXIT' && date > sig.entry.date) {
        const pos = { ...sig, entry: sig.entry.price, entryIndex: sig.entry.index, entryDate: sig.entry.date };
        const m = strategy.manage(ctx, t, pos, params) || {};
        sig.lastDecisionDate = date;
        if (Number.isFinite(m.stop) && m.stop > sig.stop) { sig.stop = m.stop; sig.stopRuleId = m.stopRuleId || sig.stopRuleId; sig.stopHistory.push({ date, stop: round(m.stop), ruleId: m.stopRuleId, ruleVersion: meta.ruleVersion }); }
        if (m.exitNextOpen) {
          // LC-CONFLICT-02: Ausstieg geht vor Warnung.
          transition(sig, 'EXIT', date, m.exitNextOpen, { price: round(bars.close[t]), priceBasis: 'CLOSE', note: 'Ausführung zur nächsten Eröffnung' });
          sig.order = { kind: 'SELL', fraction: sig.remaining, ruleId: m.exitNextOpen };
        } else {
          if (m.partialNextOpen && !sig.partialDone && !sig.order) sig.order = { kind: 'SELL', fraction: round(sig.remaining * m.partialNextOpen.fraction, 6), ruleId: m.partialNextOpen.ruleId, partial: true };
          const want = m.warning ? 'WARNING' : 'ACTIVE';
          if (sig.state !== want) transition(sig, want, date, m.warning ? (m.warningRuleId || 'LC-WARN') : 'LC-ACTIVE', { price: round(bars.close[t]), priceBasis: 'CLOSE' });
        }
      }
      continue;
    }

    if (sig && PENDING.has(sig.state)) {
      sig.sessions++;
      // 4a. Invalidation zuerst (LC-CONFLICT-01): bricht ein Balken die
      // Invalidation, zaehlt eine gleichzeitige Bestaetigung nicht.
      const inv = strategy.invalidate(ctx, t, sig, params);
      if (inv) { transition(sig, 'INVALIDATED', date, inv, { price: round(bars.close[t]), priceBasis: 'CLOSE' }); finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue; }
      // 4b. Bestaetigung auf Schlusskursbasis
      const c = strategy.confirm(ctx, t, { ...sig }, params);
      if (c && c.notTaken) {
        transition(sig, 'INVALIDATED', date, c.ruleId, { price: round(bars.close[t]), priceBasis: 'CLOSE', note: c.note });
        finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
      }
      if (c) {
        sig.confirmation = { date, index: t, basis: c.basis, close: round(c.close), high: round(bars.high[t]), low: round(bars.low[t]), volume: bars.volume[t] ?? null, volumeRatio: c.volumeRatio ?? null, volumeVerified: c.volumeVerified ?? null };
        if (c.quality) sig.quality = c.quality; // Qualitaet wird am Bestaetigungstag endgueltig
        transition(sig, 'TRIGGERED', date, c.ruleId, { price: round(c.close), priceBasis: c.basis, trigger: round(sig.levels.trigger), note: 'Modelleinstieg zur nächsten Eröffnung' });
        sig.order = { kind: 'BUY' };
        continue;
      }
      // 4c. Neubewertung. LC-RANK-AT-DISCOVERY: Rangfilter gelten bei
      // Entdeckung; ein laufendes Setup wird nur durch Strukturregeln ungueltig.
      const r = strategy.scan(ctx, t, params, { pending: sig });
      if (r === undefined) continue;
      lastScan = r;
      if (!r || !PENDING.has(r.stage)) {
        transition(sig, 'INVALIDATED', date, 'LC-SETUP-LOST', { price: round(bars.close[t]), priceBasis: 'CLOSE', failed: r ? Object.keys(r.rules).filter((k) => !r.rules[k]) : [] });
        finish(sig); state.cooldownUntil = t + COOLDOWN_SESSIONS; continue;
      }
      const prevTrigger = sig.levels.trigger, prevInv = sig.levels.invalidation;
      sig.levels = r.levels; sig.facts = r.facts; sig.rules = r.rules;
      if (r.quality) sig.quality = r.quality;
      if (round(prevTrigger) !== round(r.levels.trigger) || round(prevInv) !== round(r.levels.invalidation)) {
        (sig.levelHistory ||= []).push({ date, trigger: round(r.levels.trigger), invalidation: round(r.levels.invalidation), ruleVersion: meta.ruleVersion });
      }
      if (r.stage !== sig.state) transition(sig, r.stage, date, r.stage === 'ENTRY_READY' ? 'LC-NEAR-TRIGGER' : 'LC-AWAY-FROM-TRIGGER', { price: round(bars.close[t]), priceBasis: 'CLOSE' });
      continue;
    }

    // 5. kein offenes Signal
    const r = strategy.scan(ctx, t, params);
    if (r === undefined) continue;
    lastScan = r;
    if (t <= state.cooldownUntil) continue;
    if (r && PENDING.has(r.stage)) {
      const s = {
        id: `${strategy.id}:${ctx.symbol}:${date}:v${strategy.version}`, strategyId: strategy.id, variant: strategy.variant, version: strategy.version,
        symbol: ctx.symbol, createdAt: date, state: null, sessions: 0,
        discovery: { date, dataAsOf: date, kind: 'NEW_SETUP', ruleVersion: strategy.version, recordedAt: meta.recordedAt, simulator: SIMULATOR_VERSION },
        levels: r.levels, facts: r.facts, rules: r.rules, transitions: [], exits: [],
        levelHistory: [{ date, trigger: round(r.levels.trigger), invalidation: round(r.levels.invalidation), ruleVersion: meta.ruleVersion }],
      };
      if (r.quality) s.quality = r.quality;
      transition(s, r.stage, date, r.stage === 'ENTRY_READY' ? 'LC-NEAR-TRIGGER' : 'LC-SETUP', { price: round(bars.close[t]), priceBasis: 'CLOSE', trigger: round(r.levels.trigger), invalidation: round(r.levels.invalidation) });
      state.signal = s;
    }
  }
  void slip;
  return { state, finished, lastScan, lastIndex: to };
}
