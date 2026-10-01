// Donchian/Turtle Engine — Tagesvariante fuer US-Aktien.
//
// Original (PRIMARY_EXPLICIT, Curtis Faith, "The Original Turtle Trading
// Rules", 2003): System 1 kauft den Ausbruch ueber das 20-Tage-Hoch, Stop 2N
// (N = 20-Tage-ATR), Ausstieg beim Bruch des 10-Tage-Tiefs. Die Turtles
// handelten Futures mit Stop-Orders intraday.
//
// VU-Uebertragung (ausdruecklich markiert): Anwendung auf liquide US-Aktien,
// Bestaetigung per Tagesschluss (LC-CONFIRM-CLOSE) statt Intraday-Stop-Order,
// Ausstieg per Tagesschluss unter dem 10-Tage-Tief zur naechsten Eroeffnung,
// Liquiditaetsgrenze, "vorbereitet" = Kurs hoechstens 3 % unter dem Kanal-Hoch.
// Nicht simuliert: Unit-Sizing (1 % Konto je N), Pyramiding bis 4 Units,
// System-1-Filter (Ausbruch nach Gewinner-Ausbruch auslassen).
import { maxIn, minIn } from '../indicators.mjs';

export const PARAMS = Object.freeze({
  entryBars: 20,             // DON-ENTRY-01 (System 1)
  exitBars: 10,              // DON-EXIT-01
  stopN: 2,                  // DON-STOP-01
  minPrice: 10,              // DON-LIQ-VU
  minDollarVolume: 20e6,     // DON-LIQ-VU
  minAdr: 0.01,              // DON-LIQ-VU: schliesst z. B. Titel in laufender Uebernahme aus (Kurs am Angebotspreis)
  readyDistance: 0.03,       // VU: vorbereitet, wenn <= 3 % unter dem Kanal-Hoch
  setupDistance: 0.06,       // VU: Beobachtung bis 6 %
  maxPendingSessions: 10,    // DON-INV-02 (VU)
});

function liquid(ctx, t, p) {
  const c = ctx.bars.close[t], dv = ctx.ind.dollarVol20[t], adr = ctx.ind.adr20[t];
  return Number.isFinite(c) && c >= p.minPrice && Number.isFinite(dv) && dv >= p.minDollarVolume && Number.isFinite(adr) && adr >= p.minAdr;
}

// Kanal am Ende von t: hoechstes Hoch / tiefstes Tief der letzten n Sitzungen
// einschliesslich t - der Trigger fuer t+1.
function channel(ctx, t, p) {
  const hi = maxIn(ctx.bars.high, t - p.entryBars + 1, t);
  const lo = minIn(ctx.bars.low, t - p.exitBars + 1, t);
  return hi && lo ? { high: hi.value, highDate: ctx.bars.date[hi.index], low: lo.value } : null;
}

export function scan(ctx, t, p = PARAMS) {
  if (t < p.entryBars + 2 || !liquid(ctx, t, p)) return null;
  const ch = channel(ctx, t, p);
  const n = ctx.ind.atr20[t];
  if (!ch || !Number.isFinite(n)) return null;
  const c = ctx.bars.close[t];
  const distance = ch.high / c - 1;
  const rules = { 'DON-LIQ-VU': true, 'DON-NEAR-VU': distance <= p.setupDistance };
  const facts = { distanceToTrigger: distance, atr20Pct: n / c, channelWidth: ch.high / ch.low - 1 };
  const levels = { trigger: ch.high, triggerDate: ch.highDate, invalidation: ch.low, channelHigh: ch.high, channelLow: ch.low, n, stopPlan: '2N unter dem Einstieg (N = 20-Tage-ATR); Ausstieg bei Schluss unter dem 10-Tage-Tief' };
  if (distance > p.setupDistance) return null;
  // Persistiert wird nur "vorbereitet" (<= 3 %); 3-6 % ist Beobachtung (Momentaufnahme).
  return { stage: distance <= p.readyDistance ? 'ENTRY_READY' : 'WATCH', rules, facts, levels };
}

// DON-ENTRY-D1: Tagesschluss ueber dem 20-Tage-Hoch (bekannt seit t-1).
export function confirm(ctx, t, pending) {
  const c = ctx.bars.close[t];
  if (!(c > pending.levels.trigger)) return null;
  return { ruleId: 'DON-ENTRY-D1', basis: 'DAILY_CLOSE', close: c };
}

// DON-STOP-01: 2N unter der Eroeffnung des Einstiegstags (N am Vortag bekannt).
export function planEntry(ctx, t, sig, p = PARAMS) {
  const n = ctx.ind.atr20[t - 1] ?? sig.levels.n;
  return { stop: ctx.bars.open[t] - p.stopN * n, stopRuleId: 'DON-STOP-01' };
}

export function invalidate(ctx, t, pending, p = PARAMS) {
  if (ctx.bars.close[t] < pending.levels.invalidation) return 'DON-INV-01';
  if (pending.sessions > p.maxPendingSessions) return 'DON-INV-02';
  return null;
}

// DON-EXIT-01: Schluss unter dem Tief der 10 Vortage -> Ausstieg zur naechsten Eroeffnung.
export function manage(ctx, t, pos, p = PARAMS) {
  const lo = minIn(ctx.bars.low, t - p.exitBars, t - 1);
  const out = {};
  if (lo && ctx.bars.close[t] < lo.value) out.exitNextOpen = 'DON-EXIT-01';
  out.warning = !out.exitNextOpen && ctx.bars.close[t] < pos.entry;
  out.warningRuleId = 'DON-WARN-01';
  return out;
}

export default {
  id: 'DONCHIAN_TURTLE', variant: 'DONCHIAN_TURTLE_S1_DAILY', version: '1.0.0', timeframe: 'daily',
  manageCompatible: ['1.0.0'],
  PARAMS, scan, confirm, planEntry, invalidate, manage,
};
