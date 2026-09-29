// Momentum Breakout Engine — Daily-Variante (research-basiert auf Kristjan
// Kullamägis "Common Breakout").
//
// Originalmethode (PRIMARY_EXPLICIT, Qullamaggie FAQ + Setup-Artikel):
// Top-1-2-%-Performer, 30-100 %+ Vorlauf in 1-3 Monaten, 2 Wochen bis
// 2 Monate enge Konsolidierung mit Higher Lows, steigende 10/20-Tage-Linien,
// Entry am Opening-Range-High (oder Daily Breakout), Stop Low of Day und
// nicht breiter als ADR, 1/3-1/2 Teilverkauf nach 3-5 Tagen, Rest ueber die
// 10-Tage-Linie.
//
// VU-Formalisierung (hier ausdruecklich markiert): Perzentilgrenze 98,
// Vorlauf-Messfenster, Basis-Algorithmus (Tiefe, Higher Lows, Kontraktion),
// Pivot = Hoch der letzten 5 Sitzungen, Gap-Politik, gekappter Stop.
// Die Intraday-ORH-Varianten sind NICHT Teil dieser Datei: historische
// Intraday-Balken fehlen (DATA_COVERAGE_PENDING).
import { maxIn, minIn, mean } from '../indicators.mjs';

export const PARAMS = Object.freeze({
  momentumPercentile: 98,     // KK-BO-MOM-01
  minPriorRun: 0.30,          // KK-BO-RUN-01
  runLookback: 63,            // 1-3 Monate
  baseMinBars: 10,            // KK-BO-BASE-01: 2 Wochen
  baseMaxBars: 40,            // ~2 Monate
  baseMaxDepth: 0.25,         // VU
  pivotBars: 5,               // VU: Hoch der engen Zone
  entryReadyDistance: 0.03,   // VU
  gapSkipAdrMultiple: 0.5,    // VU: Gap ueber Pivot + 0.5 ADR -> nicht verfolgt
  partialAfterSessions: 3,    // KK-BO-SCALE-01 (3-5 Tage, Variante 3)
  partialFraction: 1 / 3,     // KK-BO-SCALE-01 (Variante 1/3)
  trailSma: 'sma10',          // KK-BO-TRAIL-01 (Variante 10 Tage)
  minPrice: 5, minDollarVolume: 5e6, // VU Liquiditaet
  minAdr: 0.02,               // VU: gepinnte Titel (z. B. laufende Uebernahme) ausschliessen
  maxPendingSessions: 20,     // VU
});

function liquid(ctx, t, p) {
  const c = ctx.bars.close[t];
  const dv = ctx.ind.dollarVol20[t];
  const adr = ctx.ind.adr20[t];
  return Number.isFinite(c) && c >= p.minPrice && Number.isFinite(dv) && dv >= p.minDollarVolume && Number.isFinite(adr) && adr >= p.minAdr;
}

export function scan(ctx, t, p = PARAMS) {
  const { bars, ind, cross } = ctx;
  if (t < 70 || !liquid(ctx, t, p)) return null;
  const pcts = [cross.mom21?.[t], cross.mom63?.[t], cross.mom126?.[t]].filter(Number.isFinite);
  const bestPct = pcts.length ? Math.max(...pcts) : null;
  const rules = { 'KK-BO-MOM-01': bestPct !== null && bestPct >= p.momentumPercentile };
  if (!rules['KK-BO-MOM-01']) return null;
  const facts = { momentumPercentile: bestPct, adr20: ind.adr20[t] };

  // Vorlauf: vom tiefsten Tief im Messfenster vor dem Hoch bis zum Hoch.
  const peak = maxIn(bars.high, t - p.baseMaxBars, t);
  const runLow = peak ? minIn(bars.low, peak.index - p.runLookback, peak.index) : null;
  const run = peak && runLow ? peak.value / runLow.value - 1 : null;
  facts.priorRun = run;
  rules['KK-BO-RUN-01'] = run !== null && run >= p.minPriorRun;
  if (!rules['KK-BO-RUN-01']) return { stage: 'DISCOVERED', rules, facts, levels: {} };

  // Basis: seit dem Hoch mindestens 10 Sitzungen, Tiefe begrenzt,
  // Higher Lows (zweite Haelfte haelt ueber der ersten), Spanne zieht sich
  // zusammen, Kurs ueber steigenden 10/20-Tage-Linien.
  const baseLen = t - peak.index;
  const baseStart = peak.index;
  const baseLow = minIn(bars.low, baseStart, t);
  const depth = baseLow ? 1 - baseLow.value / peak.value : null;
  const mid = baseStart + Math.floor(baseLen / 2);
  const lowFirst = minIn(bars.low, baseStart, mid);
  const lowSecond = minIn(bars.low, mid + 1, t);
  const rangeOf = (from, to) => mean(ind.range1d, from, to);
  const recentRange = rangeOf(t - 4, t);
  const earlyRange = rangeOf(baseStart, mid);
  const s10 = ind.sma10[t], s20 = ind.sma20[t], s20prev = ind.sma20[t - 5];
  facts.baseLength = baseLen; facts.baseDepth = depth;
  facts.recentRange = recentRange; facts.earlyRange = earlyRange;
  rules['KK-BO-BASE-01'] = baseLen >= p.baseMinBars && baseLen <= p.baseMaxBars
    && depth !== null && depth <= p.baseMaxDepth
    && lowFirst && lowSecond && lowSecond.value >= lowFirst.value
    && recentRange !== null && earlyRange !== null && recentRange < earlyRange;
  rules['KK-BO-TREND-01'] = [s10, s20, s20prev].every(Number.isFinite)
    && bars.close[t] > s10 && bars.close[t] > s20 && s20 > s20prev;
  if (!rules['KK-BO-BASE-01'] || !rules['KK-BO-TREND-01']) return { stage: 'WATCH', rules, facts, levels: {} };

  const pivot = maxIn(bars.high, t - p.pivotBars + 1, t).value;
  const levels = {
    trigger: pivot,
    invalidation: baseLow.value,
    stopPlan: 'Tagestief des Ausbruchstags, höchstens 1 ADR unter dem Einstieg',
    adr20: ind.adr20[t],
    baseHigh: peak.value, baseLow: baseLow.value, baseStartDate: bars.date[baseStart],
  };
  const distance = pivot / bars.close[t] - 1;
  facts.distanceToTrigger = distance;
  return { stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP', rules, facts, levels };
}

// Einstieg an Balken t fuer ein Setup, das bis t-1 bekannt war.
export function entry(ctx, t, pending, p = PARAMS, fill) {
  const { bars } = ctx;
  const trig = pending.levels.trigger;
  if (!(bars.high[t] > trig)) return null;
  const adr = pending.levels.adr20;
  if (Number.isFinite(adr) && bars.open[t] > trig * (1 + p.gapSkipAdrMultiple * adr)) {
    return { notTaken: true, ruleId: 'KK-BO-GAP-01', note: 'Eröffnung zu weit über dem Trigger — Gap-Politik: nicht verfolgt.' };
  }
  const f = fill.stopBuy(trig, bars.open[t]);
  // KK-BO-STOP-01: Stop = Tagestief, aber nicht breiter als 1 ADR.
  const capped = Number.isFinite(adr) ? f.price * (1 - adr) : -Infinity;
  const stop = Math.max(bars.low[t], capped);
  // Same-Bar: lag das Tagestief unter dem gekappten Stop, ist nicht
  // entscheidbar, ob der Stop nach dem Einstieg erreicht wurde -> ungünstig.
  const sameBarStop = bars.low[t] < capped;
  return { fill: f.price, gapped: f.gapped, stop, ruleId: 'KK-BO-ENTRY-D1', sameBarStop, stopRuleId: 'KK-BO-STOP-01' };
}

export function invalidate(ctx, t, pending, p = PARAMS) {
  if (ctx.bars.close[t] < pending.levels.invalidation) return 'KK-BO-INV-01';
  if (pending.sessions > p.maxPendingSessions) return 'KK-BO-INV-02';
  return null;
}

export function manage(ctx, t, pos, p = PARAMS) {
  const { bars, ind } = ctx;
  const out = {};
  const held = pos.heldSessions || 0;
  if (!pos.partialDone && held >= p.partialAfterSessions) {
    out.partialNextOpen = { fraction: p.partialFraction, ruleId: 'KK-BO-SCALE-01' };
    out.stop = Math.max(pos.stop, pos.entry); // Rest auf Breakeven
    out.stopRuleId = 'KK-BO-SCALE-01';
  }
  const ma = ind[p.trailSma][t];
  if (Number.isFinite(ma) && bars.close[t] < ma && held >= 1) out.exitNextOpen = 'KK-BO-TRAIL-01';
  out.warning = !out.exitNextOpen && (bars.close[t] < pos.entry || (Number.isFinite(ma) && bars.close[t] < ma * 1.01));
  out.warningRuleId = 'KK-BO-WARN-01';
  return out;
}

export default {
  id: 'MOMENTUM_BREAKOUT', variant: 'KK_COMMON_BREAKOUT_DAILY', version: '1.0.0', timeframe: 'daily',
  PARAMS, scan, entry, invalidate, manage,
};
