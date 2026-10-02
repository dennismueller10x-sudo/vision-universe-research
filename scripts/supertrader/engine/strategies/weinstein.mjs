// Weinstein Stage Analysis — Stage-2-Long, Wochenbasis.
//
// Kern (MULTI_SOURCE_CONFIRMED): vier Phasen, 30-Wochen-Durchschnitt und
// dessen Steigung, Ausbruch aus einer Stage-1-Basis, Relative Staerke und
// Volumen als Qualitaetsdimensionen, Stage 3/4 als Ausstiegsrahmen.
// VU-Formalisierung: Steigungs-Schwelle, Basisdefinition, Volumenfaktor
// (1.5x, Varianten 1.25/2/3), RS-Formel (Preis / SPY), Stopabstand.
//
// Datenhinweis: Die lange Wochenhistorie liegt kanonisch nur als
// Wochenschlusskurs vor. Widerstand und Basis werden deshalb auf
// Wochenschlusskursen bestimmt; Wochenvolumen existiert nur, soweit
// Tages-OHLCV vorliegt. Fehlt es, bleibt WEIN-VOL-01 "nicht pruefbar" und
// das Signal wird entsprechend gekennzeichnet - nicht still bestanden.

export const PARAMS = Object.freeze({
  maWeeks: 30,
  slopeWeeks: 4,
  flatSlope: 0.005,           // |Steigung| <= 0.5 % ueber 4 Wochen = flach (VU)
  baseMinWeeks: 10,
  baseBand: 0.15,             // Kurs innerhalb +-15 % um die MA (VU)
  rsWeeks: 13,
  volumeMultiple: 1.5,        // WEIN-VOL-01 Variante 1.5x
  volumeAvgWeeks: 10,
  entryReadyDistance: 0.03,
  stopBuffer: 0.02,           // VU
  minPrice: 5, minDollarVolume: 5e6,
  maxPendingSessions: 60,
});

export function classifyStage(w, k, p = PARAMS) {
  const ma = w.ma30[k], maPrev = w.ma30[k - p.slopeWeeks], c = w.close[k];
  if (![ma, maPrev, c].every(Number.isFinite)) return null;
  const slope = ma / maPrev - 1;
  if (slope > p.flatSlope && c > ma) return { stage: 2, slope };
  if (slope < -p.flatSlope && c < ma) return { stage: 4, slope };
  if (Math.abs(slope) <= p.flatSlope) {
    // Flach: Stage 1 nach einem Abwaertstrend, Stage 3 nach einem Aufwaertstrend.
    for (let j = k - 1; j >= Math.max(p.maWeeks, k - 104); j--) {
      const m = w.ma30[j], mp = w.ma30[j - p.slopeWeeks];
      if (!Number.isFinite(m) || !Number.isFinite(mp)) break;
      const s = m / mp - 1;
      if (s > p.flatSlope) return { stage: 3, slope };
      if (s < -p.flatSlope) return { stage: 1, slope };
    }
    return { stage: 1, slope };
  }
  return { stage: c > ma ? 2 : 4, slope, transitional: true };
}

export function baseInfo(w, k, p) {
  // Wochen in Folge (bis k) mit flacher MA und Kurs im Band um die MA.
  let len = 0;
  for (let j = k; j >= p.maWeeks + p.slopeWeeks; j--) {
    const ma = w.ma30[j], mp = w.ma30[j - p.slopeWeeks];
    if (!Number.isFinite(ma) || !Number.isFinite(mp)) break;
    const flat = Math.abs(ma / mp - 1) <= p.flatSlope * 2;
    const inBand = Math.abs(w.close[j] / ma - 1) <= p.baseBand;
    if (!flat || !inBand) break;
    len++;
  }
  if (len === 0) return { len: 0 };
  let res = -Infinity, sup = Infinity;
  for (let j = k - len + 1; j <= k; j++) { res = Math.max(res, w.close[j]); sup = Math.min(sup, w.close[j]); }
  return { len, resistance: res, support: sup, startDate: w.date[k - len + 1] };
}

function rsSlope(w, k, p) {
  const a = w.rs[k], b = w.rs[k - p.rsWeeks];
  return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b - 1 : null;
}

// Wird taeglich aufgerufen; entscheidet nur an vollstaendigen Wochenenden.
export function scan(ctx, t, p = PARAMS) {
  const k = ctx.weekAt?.[t];
  if (k === null || k === undefined) return undefined; // keine Wochenentscheidung an diesem Tag
  const { bars, ind, weekly: w } = ctx;
  if (!(bars.close[t] >= p.minPrice) || !(ind.dollarVol20[t] >= p.minDollarVolume)) return null;
  const st = classifyStage(w, k, p);
  if (!st) return null;
  const facts = { stage: st.stage, maSlope4w: st.slope, ma30w: w.ma30[k], rsChange13w: rsSlope(w, k, p) };
  const rules = { 'WEIN-ST1-01': st.stage === 1 };
  if (st.stage !== 1) return { stage: null, rules, facts, levels: {}, weekly: true };
  const base = baseInfo(w, k, p);
  facts.baseWeeks = base.len;
  rules['WEIN-RS-01'] = Number.isFinite(facts.rsChange13w) && facts.rsChange13w > 0;
  if (!rules['WEIN-RS-01']) return { stage: 'DISCOVERED', rules, facts, levels: {}, weekly: true };
  rules['WEIN-BASE-01'] = base.len >= p.baseMinWeeks;
  if (!rules['WEIN-BASE-01']) return { stage: 'WATCH', rules, facts, levels: {}, weekly: true };
  const levels = {
    trigger: base.resistance, resistance: base.resistance, invalidation: base.support * (1 - p.stopBuffer),
    baseSupport: base.support, baseStartDate: base.startDate, ma30w: w.ma30[k],
    triggerBasis: 'Wochenschluss über dem Widerstand (Wochenschlusskurse)',
    stopPlan: '2 % unter der Basis; danach unter der 30-Wochen-Linie nachgezogen',
  };
  const distance = base.resistance / w.close[k] - 1;
  facts.distanceToTrigger = distance;
  return { stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP', rules, facts, levels, weekly: true };
}

// Ausloesung: Wochenschluss ueber dem Widerstand; Ausfuehrung zur naechsten
// Eroeffnung der Folgewoche (planEntry).
// WEIN-ST2-01: Bestaetigung nur am vollstaendigen Wochenende, wenn der
// Wochenschluss den Widerstand ueberschreitet. WEIN-VOL-01: Wochenvolumen
// >= 1,5x Schnitt; zu wenig Volumen -> kein Einstieg. Fehlen Volumendaten,
// wird bestaetigt, aber als "Volumen nicht pruefbar" protokolliert (WEIN-VOL-02).
export function confirm(ctx, t, pending, p = PARAMS) {
  const k = ctx.weekAt?.[t];
  if (k === null || k === undefined) return null;
  const w = ctx.weekly;
  if (!(w.close[k] > pending.levels.trigger)) return null;
  const vol = w.volume[k], avg = w.volAvg[k];
  const volumeCheck = Number.isFinite(vol) && Number.isFinite(avg) && avg > 0 ? vol / avg : null;
  const volOk = volumeCheck === null ? null : volumeCheck >= p.volumeMultiple;
  if (volOk === false) return { notTaken: true, ruleId: 'WEIN-VOL-01', note: `Wochenschluss über dem Widerstand, aber nur ${volumeCheck.toFixed(2)}× Durchschnittsvolumen — kein Einstieg.` };
  return { ruleId: volOk === null ? 'WEIN-VOL-02' : 'WEIN-ST2-01', basis: 'WEEKLY_CLOSE', close: w.close[k], volumeRatio: volumeCheck, volumeVerified: volOk };
}

// Modelleinstieg zur Eroeffnung der Folgewoche; Stop 2 % unter der Basis.
export function planEntry(ctx, t, sig) {
  return { stop: sig.levels.invalidation, stopRuleId: 'WEIN-STOP-VU' };
}

export function invalidate(ctx, t, pending, p = PARAMS) {
  if (ctx.bars.close[t] < pending.levels.invalidation) return 'WEIN-INV-01';
  if (pending.sessions > p.maxPendingSessions) return 'WEIN-INV-02';
  return null;
}

export function manage(ctx, t, pos, p = PARAMS) {
  const k = ctx.weekAt?.[t];
  const out = {};
  if (k === null || k === undefined) return out;
  const w = ctx.weekly;
  const ma = w.ma30[k];
  if (Number.isFinite(ma)) {
    const trail = ma * (1 - p.stopBuffer);
    if (trail > pos.stop) { out.stop = trail; out.stopRuleId = 'WEIN-TRAIL-VU'; }
    if (w.close[k] < ma) out.exitNextOpen = 'WEIN-EXIT-01';
  }
  const st = classifyStage(w, k, p);
  out.warning = !out.exitNextOpen && (st?.stage === 3 || (rsSlope(w, k, p) ?? 0) < 0);
  out.warningRuleId = 'WEIN-ST3-01';
  return out;
}

export default {
  id: 'WEINSTEIN_STAGE', variant: 'WEINSTEIN_STAGE2_WEEKLY', version: '1.1.0', timeframe: 'weekly',
  manageCompatible: ['1.0.0', '1.1.0'],
  PARAMS, scan, confirm, planEntry, invalidate, manage,
};
