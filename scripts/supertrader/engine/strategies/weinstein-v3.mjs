// Weinstein Stage Analysis 3.0.0 (Runde 8). 1.1.0 und 2.0.0 bleiben mit Ergebnis bestehen.
//
// Quelle in Runde 8: Weinsteins Buch (1988) ist nicht zugaenglich; woertliche
// Buchzitate liegen ueber Bulkowski (thepatternsite.com "Trading Weinstein",
// "Weinstein Stops", im Volltext gelesen) vor:
//  * "If there is no significant increase in volume when the breakout occurs,
//    then avoid that stock. If you have purchased it with a buy-stop order,
//    then sell it for a fast profit when it advances after the breakout."
//  * Bulkowski setzt "a buy stop a penny above the base"; Volumen mindestens
//    das Doppelte der vier Vorwochen.
// Aenderung gegenueber 2.0.0:
//  WEIN-ENTRY-BS  Kauf-Stop knapp ueber dem Widerstand im Tagesverlauf der
//                 Folgewoche(n) statt Wochenschluss-Bestaetigung + Kauf zur
//                 Eroeffnung der naechsten Woche. Marktfilter (WEIN-MKT-01) und
//                 relative Staerke (WEIN-RS-02) muessen zum letzten Wochenschluss
//                 vor dem Kauf erfuellt sein.
//  WEIN-VOL-04    Volumen der Ausbruchswoche ist erst am Wochenende bekannt:
//                 bleibt es unter dem Doppelten der vier Vorwochen, wird beim
//                 ersten Schluss ueber dem Einstieg verkauft ("fast profit").
// Unveraendert: Stufen, Basis, Trigger, Anfangsstop 2 % unter der Basis,
// Ausstieg bei Wochenschluss unter der 30-Wochen-Linie.
import v1, { invalidate } from './weinstein.mjs';
import v2, { PARAMS as P2, scan as scan2, marketOk, manage as manage2 } from './weinstein-v2.mjs';

export const PARAMS = P2;

// Kauf-Stop "a penny above the base": ueber dem hoechsten TAGES-Hoch der Basis
// (der Widerstand der Version 2.0.0 ist der hoechste Wochenschluss - ein
// Kauf-Stop dort wuerde schon innerhalb der Basis ausgeloest). Ohne Tagesbalken
// fuer die ganze Basis bleibt der Wochenschluss-Widerstand (triggerFallback).
export function scan(ctx, t, p = PARAMS, opts = {}) {
  const r = scan2(ctx, t, p, opts);
  if (!r || opts.pending || !r.levels?.resistance) return r;
  const d = ctx.bars.date;
  let j = d.indexOf(r.levels.baseStartDate);
  if (j > 0) while (j - 1 >= 0 && (ctx.weekAt?.[j - 1] === null || ctx.weekAt?.[j - 1] === undefined)) j--;
  let hi = -Infinity;
  if (j >= 0) for (let i = j; i <= t; i++) hi = Math.max(hi, ctx.bars.high[i]);
  const levels = { ...r.levels, triggerBasis: 'INTRADAY_BUY_STOP', stopPlan: '2 % unter der Basis; Ausstieg bei Wochenschluss unter der 30-Wochen-Linie; bei schwachem Ausbruchsvolumen Verkauf beim ersten Gewinn' };
  if (Number.isFinite(hi) && hi >= r.levels.resistance) levels.trigger = hi; else levels.triggerFallback = 'WEEKLY_CLOSE_RESISTANCE';
  const distance = levels.trigger / ctx.bars.close[t] - 1;
  return { ...r, levels, facts: { ...r.facts, distanceToTrigger: distance }, stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP' };
}

const lastWeek = (ctx, t) => { for (let i = t - 1; i >= 0 && i >= t - 10; i--) { const k = ctx.weekAt?.[i]; if (k !== null && k !== undefined) return k; } return null; };

export function intradayEntry(ctx, t, pending, p = PARAMS) {
  const { bars } = ctx;
  const trig = pending.levels.trigger;
  if (!(bars.high[t] > trig)) return null;
  const k = lastWeek(ctx, t), w = ctx.weekly;
  if (k !== null) {
    if (marketOk(w, k, p) === false) return { notTaken: true, ruleId: 'WEIN-MKT-01', note: 'Kauf-Stop ausgelöst, aber der Gesamtmarkt lag zum letzten Wochenschluss unter seiner fallenden oder unter der 30-Wochen-Linie — kein Einstieg.' };
    const rs = w.mansfield?.[k];
    if (Number.isFinite(rs) && rs <= 0) return { notTaken: true, ruleId: 'WEIN-RS-02', note: 'Kauf-Stop ausgelöst, aber die relative Stärke war zum letzten Wochenschluss negativ — kein Einstieg.' };
  }
  const fill = Math.max(bars.open[t], trig);
  const stop = pending.levels.invalidation;
  return { ruleId: 'WEIN-ENTRY-BS', price: fill, stop, stopRuleId: 'WEIN-STOP-01', pessimisticSameDayExit: bars.low[t] <= stop };
}

// Index der Woche, die den Tag i enthaelt (naechster Wochenschluss ab i).
const weekOfDay = (ctx, i) => { for (let j = i; j < ctx.bars.date.length && j <= i + 10; j++) { const k = ctx.weekAt?.[j]; if (k !== null && k !== undefined) return { k, end: j }; } return null; };

export function manage(ctx, t, pos, p = PARAMS) {
  const out = manage2(ctx, t, pos, p) || {};
  if (out.exitNextOpen) return out;
  const wk = weekOfDay(ctx, pos.entryIndex);
  if (wk && t >= wk.end) {
    const w = ctx.weekly, vol = w.volume[wk.k], avg = w.volAvg4?.[wk.k];
    const low = Number.isFinite(vol) && Number.isFinite(avg) && avg > 0 && vol / avg < p.volumeMultiple;
    if (low && ctx.bars.close[t] > pos.entry) out.exitNextOpen = 'WEIN-VOL-04';
  }
  return out;
}

export default {
  id: 'WEINSTEIN_STAGE', variant: 'WEINSTEIN_STAGE2_BUYSTOP_R8', version: '3.0.0', timeframe: 'weekly',
  entryMode: 'BUY_STOP_INTRADAY',
  manageCompatible: ['3.0.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1, '2.0.0': v2 },
  PARAMS, scan, intradayEntry, invalidate, manage,
  confirm: () => null, planEntry: () => ({ notTaken: true, ruleId: 'WEIN-ENTRY-BS', note: 'Einstieg nur per Kauf-Stop' }),
  portfolio: null,
};
