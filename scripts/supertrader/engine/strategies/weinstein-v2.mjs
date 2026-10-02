// Weinstein Stage Analysis 2.0.0 (Runde 7) — naeher an der Buchbeschreibung
// (Weinstein 1988; in Runde 7 nur ueber Sekundaerquellen pruefbar, siehe
// Methodentreue-Matrix). Aenderungen gegenueber 1.1.0, je mit Quelle:
//
//  WEIN-MKT-01  "Forest to the trees": nur kaufen, wenn der Gesamtmarkt nicht
//               in Stage 4 ist. Formalisierung (VU): SPY-Wochenschluss ueber
//               seiner 30-Wochen-Linie und diese nicht fallend (4 Wochen).
//               Sektor-/Gruppenstufe fehlt (keine PIT-Gruppendaten).
//  WEIN-RS-02   Nie mit negativer relativer Staerke kaufen: Mansfield-RS
//               (Kurs/SPY gegen den 52-Wochen-Schnitt dieses Verhaeltnisses)
//               > 0 in der Ausbruchswoche. Ersetzt die 13-Wochen-Aenderung (VU).
//  WEIN-VOL-03  Ausbruchsvolumen mindestens das Doppelte des Schnitts der vier
//               Vorwochen (mehrere Sekundaerquellen; Wortlaut unbestaetigt).
//               Ersetzt 1,5x Zehn-Wochen-Schnitt (VU).
//  WEIN-BASE-02 Ein vorbereitetes Basis-Setup bleibt bis zum Ausbruch, Bruch
//               der Basis oder Zeitablauf bestehen. 1.1.0 verwarf es, sobald
//               die 30-Wochen-Linie vor dem Ausbruch zu steigen begann (Stufe
//               "2" statt "1") - bei Weinstein dreht die Linie typischerweise
//               genau um den Ausbruch nach oben.
//  WEIN-EXIT-01 Ausstieg nur bei Wochenschluss unter der 30-Wochen-Linie. Der
//               VU-Stop 2 % unter der Linie innerhalb der Woche (WEIN-TRAIL-VU)
//               entfaellt; Anfangsstop unter der Basis bleibt.
// Unveraendert: Stufenklassifikation, Basisdefinition, Trigger, Anfangsstop.
// Nicht abgebildet: Gruppenstaerke, Halbposition beim Ausbruch + Rest beim
// Ruecksetzer, Rundungsregel fuer Stops, Leerverkauf.
import v1, { PARAMS as P1, classifyStage, baseInfo, invalidate } from './weinstein.mjs';

export const PARAMS = Object.freeze({ ...P1, volumeMultiple: 2, mktSlopeWeeks: 4 });

export function marketOk(w, k, p = PARAMS) {
  const m = w.mkt?.[k], ma = w.mktMa30?.[k], maPrev = w.mktMa30?.[k - p.mktSlopeWeeks];
  if (![m, ma, maPrev].every(Number.isFinite)) return null;
  return m > ma && ma >= maPrev * (1 - p.flatSlope);
}

export function scan(ctx, t, p = PARAMS, opts = {}) {
  const k = ctx.weekAt?.[t];
  if (k === null || k === undefined) return undefined;
  const pend = opts.pending;
  if (pend && pend.levels?.trigger) {
    // WEIN-BASE-02: Struktur bleibt, nur der Abstand zum Trigger wird neu bewertet.
    const w = ctx.weekly;
    const distance = pend.levels.trigger / w.close[k] - 1;
    const facts = { ...pend.facts, distanceToTrigger: distance, stageNow: classifyStage(w, k, p)?.stage ?? null, mansfieldRs: w.mansfield?.[k] ?? null };
    return { stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP', rules: pend.rules, facts, levels: pend.levels, weekly: true };
  }
  // Entdeckung wie 1.1.0 (Stage 1, Basis >= 10 Wochen), die relative Staerke
  // wird erst in der Ausbruchswoche geprueft (WEIN-RS-02).
  const { bars, ind, weekly: w } = ctx;
  if (!(bars.close[t] >= p.minPrice) || !(ind.dollarVol20[t] >= p.minDollarVolume)) return null;
  const st = classifyStage(w, k, p);
  if (!st) return null;
  const facts = { stage: st.stage, maSlope4w: st.slope, ma30w: w.ma30[k], mansfieldRs: w.mansfield?.[k] ?? null };
  const rules = { 'WEIN-ST1-01': st.stage === 1 };
  if (st.stage !== 1) return { stage: null, rules, facts, levels: {}, weekly: true };
  const base = baseInfo(w, k, p);
  facts.baseWeeks = base.len;
  rules['WEIN-BASE-01'] = base.len >= p.baseMinWeeks;
  if (!rules['WEIN-BASE-01']) return { stage: 'WATCH', rules, facts, levels: {}, weekly: true };
  const levels = {
    trigger: base.resistance, resistance: base.resistance, invalidation: base.support * (1 - p.stopBuffer),
    baseSupport: base.support, baseStartDate: base.startDate, ma30w: w.ma30[k],
    triggerBasis: 'Wochenschluss über dem Widerstand (Wochenschlusskurse)',
    stopPlan: '2 % unter der Basis; Ausstieg bei Wochenschluss unter der 30-Wochen-Linie',
  };
  const distance = base.resistance / w.close[k] - 1;
  facts.distanceToTrigger = distance;
  return { stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP', rules, facts, levels, weekly: true };
}

export function confirm(ctx, t, pending, p = PARAMS) {
  const k = ctx.weekAt?.[t];
  if (k === null || k === undefined) return null;
  const w = ctx.weekly;
  if (!(w.close[k] > pending.levels.trigger)) return null;
  const mkt = marketOk(w, k, p);
  if (mkt === false) return { notTaken: true, ruleId: 'WEIN-MKT-01', note: 'Wochenschluss über dem Widerstand, aber der Gesamtmarkt (SPY) liegt unter seiner 30-Wochen-Linie oder diese fällt — kein Einstieg.' };
  const rs = w.mansfield?.[k];
  if (Number.isFinite(rs) && rs <= 0) return { notTaken: true, ruleId: 'WEIN-RS-02', note: 'Wochenschluss über dem Widerstand, aber relative Stärke gegenüber dem Markt negativ — kein Einstieg.' };
  const vol = w.volume[k], avg = w.volAvg4?.[k];
  const ratio = Number.isFinite(vol) && Number.isFinite(avg) && avg > 0 ? vol / avg : null;
  if (ratio !== null && ratio < p.volumeMultiple) return { notTaken: true, ruleId: 'WEIN-VOL-03', note: `Wochenschluss über dem Widerstand, aber nur ${ratio.toFixed(2)}× Volumen der vier Vorwochen — kein Einstieg.` };
  return { ruleId: ratio === null || mkt === null || !Number.isFinite(rs) ? 'WEIN-ST2-02U' : 'WEIN-ST2-02', basis: 'WEEKLY_CLOSE', close: w.close[k], volumeRatio: ratio, volumeVerified: ratio === null ? null : true, marketOk: mkt, mansfieldRs: Number.isFinite(rs) ? rs : null };
}

export function planEntry(ctx, t, sig) {
  return { stop: sig.levels.invalidation, stopRuleId: 'WEIN-STOP-01' };
}

export function manage(ctx, t, pos, p = PARAMS) {
  const k = ctx.weekAt?.[t];
  const out = {};
  if (k === null || k === undefined) return out;
  const w = ctx.weekly;
  const ma = w.ma30[k];
  if (Number.isFinite(ma) && w.close[k] < ma) out.exitNextOpen = 'WEIN-EXIT-01';
  const st = classifyStage(w, k, p);
  out.warning = !out.exitNextOpen && (st?.stage === 3 || (w.mansfield?.[k] ?? 0) < 0);
  out.warningRuleId = 'WEIN-ST3-01';
  return out;
}

export default {
  id: 'WEINSTEIN_STAGE', variant: 'WEINSTEIN_STAGE2_WEEKLY_R7', version: '2.0.0', timeframe: 'weekly',
  manageCompatible: ['2.0.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1 },
  PARAMS, scan, confirm, planEntry, invalidate, manage,
  portfolio: null, // keine belegte Positionsgroessenregel: VU-Standard
};
