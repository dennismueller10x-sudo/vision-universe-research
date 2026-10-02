// Donchian/Turtle 2.0.0 (Runde 8) - System 1 nach "The Original Turtle Trading
// Rules" (Curtis Faith u. a., OriginalTurtles.org, PDF 27 S., in Runde 8 im
// Volltext gelesen). Belegte Regeln:
//  * N = 20-Tage-EMA der True Range: N = (19 x PDN + TR) / 20, Start mit dem
//    20-Tage-Mittel der True Range (Kap. 3).
//  * Unit = 1 % des Kontos / (N x Dollar je Punkt); Stop 2N -> 2 % Risiko je Unit.
//  * System 1 Einstieg: Kurs ueberschreitet das 20-Tage-Hoch um einen Tick.
//    "Turtles always traded at the breakout when it was exceeded during the day,
//    and did not wait until the daily close or the open of the following day.
//    In the case of opening gaps, the Turtles would enter positions on the open."
//  * Filter: Ausbruch ignorieren, wenn der letzte Ausbruch ein Gewinner gewesen
//    waere (egal ob gehandelt); Verlierer = 2N gegen die Position vor einem
//    profitablen 10-Tage-Ausstieg. Wurde ausgelassen: Einstieg am 55-Tage-
//    Ausbruch ("Failsafe Breakout").
//  * Stop 2N unter dem Einstieg; Ausstieg System 1: 10-Tage-Tief, intraday
//    ("phone in exit orders as soon as the price traded through").
//  * Grenzen: 4 Units je Markt, 12 Units je Richtung.
//  * Kontogroesse: notionelles Konto, jaehrlich angepasst; je 10 % Verlust
//    gegenueber dem Jahresstart wird es um 20 % verkleinert.
// VU-Uebertragung (gekennzeichnet): US-Aktien statt Futures; eine Unit je Titel
// (Nachkaufen in 1/2-N-Schritten bis 4 Units ist NICHT umgesetzt, der Simulator
// fuehrt eine Position je Signal); hoechstens 12 Titel (= 12 Units je Richtung);
// keine Korrelationsgrenzen (6/10 Units); ohne Hebel (Gesamtexposition <= 100 %);
// Jahresanpassung des Kontos = tatsaechliches Kapital zum Jahresbeginn (bei den
// Turtles subjektiv durch Richard Dennis); offener hypothetischer Ausbruch gilt
// fuer den Filter wie ein Gewinner (neue Hochs sind dann kein neuer Ausbruch);
// Failsafe-Positionen verlassen den Markt nach System-1-Regeln; nur Long.
import { maxIn, minIn } from '../indicators.mjs';
import v1 from './donchian.mjs';

export const PARAMS = Object.freeze({
  entryBars: 20, failsafeBars: 55, exitBars: 10, stopN: 2,
  minPrice: 10, minDollarVolume: 20e6, minAdr: 0.01, minChannelWidth: 0.02, // DON-LIQ-VU wie 1.1.0
  readyDistance: 0.03, setupDistance: 0.06, maxPendingSessions: 10,
});

// N nach Kapitel 3 (EMA 19/20 der True Range).
export function turtleN(bars) {
  const n = bars.close.length, out = new Array(n).fill(null);
  let sum = 0, prev = null;
  for (let i = 0; i < n; i++) {
    const pc = i > 0 ? bars.close[i - 1] : null;
    const tr = Number.isFinite(pc) ? Math.max(bars.high[i] - bars.low[i], bars.high[i] - pc, pc - bars.low[i]) : bars.high[i] - bars.low[i];
    if (!Number.isFinite(tr)) { out[i] = prev; continue; }
    if (i < 20) { sum += tr; if (i === 19) { prev = sum / 20; out[i] = prev; } continue; }
    prev = (19 * prev + tr) / 20; out[i] = prev;
  }
  return out;
}

// Hypothetische System-1-Ausbrueche (ohne Filter) fuer die Filterregel.
// Ergebnis je Tag t: Zustand nach Schluss von t ('NONE' | 'OPEN' | 'WIN' | 'LOSS').
const CACHE = new WeakMap();
export function breakoutState(bars, p = PARAMS) {
  if (CACHE.has(bars)) return CACHE.get(bars);
  const n = bars.close.length, N = turtleN(bars), state = new Array(n).fill('NONE');
  let last = 'NONE', pos = null;
  for (let t = p.entryBars; t < n; t++) {
    if (!pos) {
      const hi = maxIn(bars.high, t - p.entryBars, t - 1);
      if (hi && bars.high[t] > hi.value && Number.isFinite(N[t - 1])) {
        const entry = Math.max(bars.open[t], hi.value);
        pos = { entry, stop: entry - p.stopN * N[t - 1] };
        if (bars.low[t] <= pos.stop) { last = 'LOSS'; pos = null; }
      }
    } else {
      const lo = minIn(bars.low, t - p.exitBars, t - 1);
      if (bars.low[t] <= pos.stop) { last = 'LOSS'; pos = null; }
      else if (lo && bars.low[t] < lo.value) { const px = Math.min(bars.open[t], lo.value); last = px > pos.entry ? 'WIN' : 'LOSS'; pos = null; }
    }
    state[t] = pos ? 'OPEN' : last;
  }
  const r = { N, state };
  CACHE.set(bars, r);
  return r;
}

function liquid(ctx, t, p) {
  const c = ctx.bars.close[t], dv = ctx.ind.dollarVol20[t], adr = ctx.ind.adr20[t];
  return Number.isFinite(c) && c >= p.minPrice && Number.isFinite(dv) && dv >= p.minDollarVolume && Number.isFinite(adr) && adr >= p.minAdr;
}

export function scan(ctx, t, p = PARAMS) {
  if (t < p.failsafeBars + 2 || !liquid(ctx, t, p)) return null;
  const { N, state } = breakoutState(ctx.bars, p);
  const n = N[t];
  const hi20 = maxIn(ctx.bars.high, t - p.entryBars + 1, t), hi55 = maxIn(ctx.bars.high, t - p.failsafeBars + 1, t);
  const lo = minIn(ctx.bars.low, t - p.exitBars + 1, t);
  if (!hi20 || !hi55 || !lo || !Number.isFinite(n)) return null;
  const last = state[t];
  const skip = last === 'WIN' || last === 'OPEN';
  const trig = skip ? hi55.value : hi20.value;
  const c = ctx.bars.close[t];
  const distance = trig / c - 1;
  const channelWidth = hi20.value / lo.value - 1;
  if (channelWidth < p.minChannelWidth || distance > p.setupDistance) return null;
  const rules = { 'DON-LIQ-VU': true, 'DON-NEAR-VU': true, 'TUR-S1-FILTER': !skip, 'TUR-FAILSAFE-55': skip };
  const facts = { distanceToTrigger: distance, nPct: n / c, channelWidth, lastBreakout: last };
  const levels = {
    trigger: trig, triggerBasis: 'INTRADAY_BUY_STOP', triggerRule: skip ? 'TUR-FAILSAFE-55' : 'TUR-ENTRY-S1-20',
    triggerDate: ctx.bars.date[(skip ? hi55 : hi20).index], invalidation: lo.value, channelHigh: hi20.value, channelLow: lo.value, n,
    stopPlan: '2N unter dem Einstieg (N = 20-Tage-EMA der True Range); Ausstieg sobald das 10-Tage-Tief unterschritten wird',
  };
  return { stage: distance <= p.readyDistance ? 'ENTRY_READY' : 'WATCH', rules, facts, levels };
}

export function intradayEntry(ctx, t, pending, p = PARAMS) {
  const { bars } = ctx;
  const trig = pending.levels.trigger;
  if (!(bars.high[t] > trig)) return null;
  const { N } = breakoutState(bars, p);
  const n = N[t - 1] ?? pending.levels.n;
  const fill = Math.max(bars.open[t], trig);
  const stop = fill - p.stopN * n;
  return { ruleId: pending.levels.triggerRule || 'TUR-ENTRY-S1-20', price: fill, stop, stopRuleId: 'TUR-STOP-2N', pessimisticSameDayExit: bars.low[t] <= stop };
}

export function invalidate(ctx, t, pending, p = PARAMS) {
  if (ctx.bars.close[t] < pending.levels.invalidation) return 'DON-INV-01';
  if (pending.sessions > p.maxPendingSessions) return 'DON-INV-02';
  return null;
}

// TUR-EXIT-S1-10D: Ausstiegsmarke = 10-Tage-Tief bis einschliesslich t, wirkt ab t+1
// wie eine Stop-Order (die Turtles handelten, sobald der Kurs sie durchschritt).
export function manage(ctx, t, pos, p = PARAMS) {
  const lo = minIn(ctx.bars.low, t - p.exitBars + 1, t);
  const out = {};
  if (lo && lo.value > pos.stop) { out.stop = lo.value; out.stopRuleId = 'TUR-EXIT-S1-10D'; }
  out.warning = ctx.bars.close[t] < pos.entry;
  out.warningRuleId = 'DON-WARN-01';
  return out;
}

export const PORTFOLIO = Object.freeze({ initialEquity: 100000, riskPerTrade: 0.02, maxPositionPct: 1.0, maxPositions: 12, maxExposure: 1.0, riskFreeRate: 0.02,
  turtleNotional: { stepLoss: 0.10, cut: 0.20 },
  source: 'Turtle Rules: Unit = 1 % des Kontos je N, Stop 2N (= 2 % Risiko), höchstens 12 Units je Richtung, notionelles Konto −20 % je 10 % Verlust. VU: eine Unit je Aktie, ohne Hebel.' });

export default {
  id: 'DONCHIAN_TURTLE', variant: 'TURTLE_S1_BUYSTOP_DAILY_R8', version: '2.0.0', timeframe: 'daily',
  entryMode: 'BUY_STOP_INTRADAY',
  manageCompatible: ['2.0.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1 },
  PARAMS, scan, intradayEntry, invalidate, manage,
  confirm: () => null, planEntry: () => ({ notTaken: true, ruleId: 'TUR-ENTRY-S1-20', note: 'Einstieg nur per Kauf-Stop' }),
  portfolio: PORTFOLIO,
};
