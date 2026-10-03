// Weinstein Stage Analysis 4.0.0 (Runde 11, PREREGISTRATION-R11). Neue Regel: Fortsetzungsausbrueche
// in Stufe 2 (stageanalysis.net, Breakout Quality Checklist mit Buchzitaten). Stufe-1-Ausbrueche wie 3.0.0.
//  WEIN-CONT-01  Stufe 2; H = hoechster Wochenschluss der letzten 52 Wochen (Woche j0); seit j0 mindestens
//                8 Wochen ohne Schluss ueber H, jeder Wochenschluss ueber der 30-Wochen-Linie, Tiefe <= 25 %;
//                10-Wochen-Linie steigt (heute ueber vor vier Wochen). Trigger = hoechstes Tageshoch seit j0
//                (Kauf-Stop), Stop = tiefster Wochenschluss seit j0 minus 2 %. Markt, RS, Volumen, Ausstieg wie 3.0.0.
import v3, { scan as scan3 } from './weinstein-v3.mjs';
import { classifyStage } from './weinstein.mjs';

export const PARAMS = Object.freeze({ ...v3.PARAMS, contMinWeeks: 8, contMaxDepth: 0.25, contLookback: 52 });

function ma10(w, k) { if (k < 9) return null; let s = 0; for (let i = k - 9; i <= k; i++) { if (!Number.isFinite(w.close[i])) return null; s += w.close[i]; } return s / 10; }

export function continuationBase(w, k, p = PARAMS) {
  const st = classifyStage(w, k, p);
  if (!st || st.stage !== 2) return { ok: false, reason: 'NOT_STAGE_2' };
  let j0 = -1, H = -Infinity;
  for (let j = Math.max(0, k - p.contLookback + 1); j <= k; j++) if (Number.isFinite(w.close[j]) && w.close[j] >= H) { H = w.close[j]; j0 = j; }
  if (j0 < 0) return { ok: false, reason: 'NO_HIGH' };
  const weeks = k - j0;
  if (weeks < p.contMinWeeks) return { ok: false, reason: 'BASE_TOO_SHORT', weeks };
  let low = Infinity;
  for (let j = j0 + 1; j <= k; j++) {
    const ma = w.ma30[j];
    if (!Number.isFinite(ma) || !(w.close[j] > ma)) return { ok: false, reason: 'BELOW_MA30', weeks };
    low = Math.min(low, w.close[j]);
  }
  const depth = 1 - low / H;
  if (depth > p.contMaxDepth) return { ok: false, reason: 'TOO_DEEP', weeks, depth };
  const a = ma10(w, k), b = ma10(w, k - 4);
  if (!(Number.isFinite(a) && Number.isFinite(b) && a > b)) return { ok: false, reason: 'MA10_NOT_RISING', weeks, depth };
  return { ok: true, j0, H, low, weeks, depth, startDate: w.date[j0] };
}

export function scan(ctx, t, p = PARAMS, opts = {}) {
  const r = scan3(ctx, t, p, opts);
  if (r === undefined || opts.pending) return r;
  // Stufe-1-Setup (3.0.0) hat Vorrang; sonst Fortsetzung in Stufe 2 pruefen.
  if (r && r.levels?.trigger) return r;
  const k = ctx.weekAt?.[t];
  const { bars, ind, weekly: w } = ctx;
  if (!(bars.close[t] >= p.minPrice) || !(ind.dollarVol20[t] >= p.minDollarVolume)) return r;
  const cb = continuationBase(w, k, p);
  const rules = { ...(r?.rules || {}), 'WEIN-CONT-01': cb.ok };
  const facts = { ...(r?.facts || {}), continuation: { weeks: cb.weeks ?? null, depth: cb.depth ?? null, reason: cb.ok ? null : cb.reason } };
  if (!cb.ok) return r ? { ...r, rules, facts } : r;
  let j = bars.date.indexOf(cb.startDate), hi = -Infinity;
  if (j < 0) j = Math.max(0, t - (k - cb.j0) * 5);
  for (let i = j; i <= t; i++) hi = Math.max(hi, bars.high[i]);
  const trigger = Math.max(hi, cb.H);
  const levels = { trigger, resistance: cb.H, invalidation: cb.low * (1 - p.stopBuffer), baseSupport: cb.low, baseStartDate: cb.startDate, ma30w: w.ma30[k],
    triggerBasis: 'INTRADAY_BUY_STOP', setupKind: 'STAGE2_CONTINUATION',
    stopPlan: '2 % unter dem tiefsten Wochenschluss der Fortsetzungsbasis; Ausstieg bei Wochenschluss unter der 30-Wochen-Linie; bei schwachem Ausbruchsvolumen Verkauf beim ersten Gewinn' };
  const distance = trigger / bars.close[t] - 1;
  return { stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP', rules, facts: { ...facts, distanceToTrigger: distance, stage: 2 }, levels, weekly: true };
}

export default { ...v3, variant: 'WEINSTEIN_STAGE2_CONT_R11', version: '4.0.0', manageCompatible: ['3.0.0', '4.0.0'], signalCompatible: ['3.0.0'], PARAMS, scan };
