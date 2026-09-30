// Darvas Box Engine — VU-Formalisierung.
//
// Gesichert (MULTI_SOURCE_CONFIRMED): Momentumtitel nahe neuer Hochs,
// Konsolidierungsbox, Kauf beim Ausbruch ueber die Boxoberkante, Stop an der
// Box, Stop mit steigenden Boxen nachziehen, Pyramiding in steigende Boxen.
//
// NICHT gesichert: die exakte Boxbildung. Die hier verwendete "N-Sitzungen-
// Bestaetigung" (N = 3) ist eine verbreitete Sekundaer-Rekonstruktion und
// wird deshalb als VU_FORMALIZATION gefuehrt - nie als "die originale
// Darvas-Formel". Pyramiding (DAR-PYR-01) wird in Version 1 nicht simuliert.
import { maxIn, minIn } from '../indicators.mjs';

export const PARAMS = Object.freeze({
  confirmBars: 3,            // DAR-BOX-01 / DAR-BOX-02, Variante N = 3
  topLookback: 20,           // DAR-BOX-01: Oberkante ist ein neues 20-Tage-Hoch (VU)
  nearHighPct: 0.90,         // DAR-MOM-01 (VU-Schwelle)
  momentumPercentile: 80,    // DAR-MOM-02 (VU_EXTENSION: "momentumstarke Aktie" als 6-Monats-Perzentil)
  lookback: 60,
  maxBoxHeight: 0.25,        // VU
  minBoxHeight: 0.03,        // VU: keine gepinnten Mini-Boxen
  topNearHigh: 0.95,         // VU: die Box bildet sich an den Hochs
  entryReadyDistance: 0.03,
  minPrice: 5, minDollarVolume: 5e6,
  maxPendingSessions: 30,
  // Qualitaetsstufe (VU_FORMALIZATION, Version 1.1.0). Die Setup-Regeln oben
  // bleiben unveraendert; A/B klassifiziert nur, wie sauber ein Setup ist.
  qualityRsPercentile: 90,   // DAR-Q-RS
  qualityMaxHeight: 0.12,    // DAR-Q-TIGHT: enge Box
  qualityMinStop: 0.04,      // DAR-Q-STOP: Stop mindestens 4 % ...
  qualityMinStopAdr: 1.0,    // ... und mindestens 1 ADR unter dem Trigger
  qualityTriggerVolume: 1.5, // DAR-Q-VOL: Ausbruchsvolumen >= 1,5x 50-Tage-Schnitt
});

// A/B-Qualitaet (VU_FORMALIZATION, Version 1.2.0) - in ZWEI Phasen:
//
//   PRE_BREAKOUT (vor dem Ausbruch): Das Ausbruchsvolumen existiert noch nicht.
//     A_CANDIDATE = alle vier vorab pruefbaren Kriterien erfuellt
//                   (Regime, Staerke, enge Box, Stopabstand); Volumen offen.
//     B_SETUP     = mindestens eines davon nicht erfuellt.
//   CONFIRMED (am Bestaetigungstag, Schluss ueber der Oberkante):
//     A_ENTRY     = A-Kandidat UND Volumen des Bestaetigungstags >= 1,5x.
//     B_ENTRY     = sonst - auch wenn Volumendaten fehlen (nicht pruefbar).
//
// Kriterien mit null sind nicht pruefbar. "blockedOnlyByRegime" markiert
// Setups, die ausschliesslich an der Regime-Sperre scheitern.
export const PRE_CRITERIA = ['DAR-Q-REGIME', 'DAR-Q-RS', 'DAR-Q-TIGHT', 'DAR-Q-STOP'];

export function quality(ctx, t, levels, p = PARAMS, confirmationVolumeRatio, phase = 'PRE_BREAKOUT') {
  const adr = ctx.ind.adr20[t];
  const mom = ctx.cross?.mom126?.[t];
  const height = Number.isFinite(levels.boxTop) && Number.isFinite(levels.boxBottom) ? 1 - levels.boxBottom / levels.boxTop : null;
  const regime = ctx.regime || null;
  const criteria = {
    'DAR-Q-REGIME': regime ? regime !== 'BROAD_WEAKNESS' : null,
    'DAR-Q-RS': Number.isFinite(mom) ? mom >= p.qualityRsPercentile : null,
    'DAR-Q-TIGHT': height !== null ? height <= p.qualityMaxHeight : null,
    'DAR-Q-STOP': height !== null && Number.isFinite(adr) ? height >= Math.max(p.qualityMinStop, p.qualityMinStopAdr * adr) : null,
    'DAR-Q-VOL': phase === 'CONFIRMED' && Number.isFinite(confirmationVolumeRatio) ? confirmationVolumeRatio >= p.qualityTriggerVolume : null,
  };
  const preOk = PRE_CRITERIA.every((k) => criteria[k] === true);
  const othersOk = PRE_CRITERIA.filter((k) => k !== 'DAR-Q-REGIME').every((k) => criteria[k] === true);
  let label;
  if (phase === 'CONFIRMED') label = preOk && criteria['DAR-Q-VOL'] === true ? 'A_ENTRY' : 'B_ENTRY';
  else label = preOk ? 'A_CANDIDATE' : 'B_SETUP';
  const failed = PRE_CRITERIA.filter((k) => criteria[k] === false).concat(phase === 'CONFIRMED' && criteria['DAR-Q-VOL'] !== true ? ['DAR-Q-VOL'] : []);
  return {
    phase, label, tier: label.startsWith('A') ? 'A' : 'B', criteria, regime, failed,
    blockedOnlyByRegime: phase === 'PRE_BREAKOUT' && criteria['DAR-Q-REGIME'] === false && othersOk,
    volumeStatus: phase === 'PRE_BREAKOUT' ? 'PENDING_UNTIL_BREAKOUT' : (Number.isFinite(confirmationVolumeRatio) ? 'MEASURED' : 'MISSING'),
    measures: { rsPercentile: Number.isFinite(mom) ? Math.round(mom * 10) / 10 : null, boxHeight: height, adr20: adr, confirmationVolumeRatio: Number.isFinite(confirmationVolumeRatio) ? confirmationVolumeRatio : null },
  };
}

// Juengste Box, deren Oberkante bis einschliesslich t nicht ueberschritten
// wurde. Nutzt nur Balken <= t.
export function findBox(bars, t, p = PARAMS, fromIndex = 0) {
  const N = p.confirmBars;
  for (let i = t - N; i >= Math.max(fromIndex, t - p.lookback, N); i--) {
    const h = bars.high[i];
    if (!Number.isFinite(h)) continue;
    const before = maxIn(bars.high, i - p.topLookback, i - 1);
    if (before && before.value >= h) continue;           // neues 20-Tage-Hoch, kein Zwischenhoch in der Box
    const after = maxIn(bars.high, i + 1, t);
    if (!after || after.value >= h) continue;            // seither nicht ueberschritten
    // Oberkante bestaetigt (N Sitzungen ohne hoeheres Hoch).
    const top = { value: h, index: i, confirmedAt: i + N };
    // Unterkante: tiefstes Tief nach dem Top, das N Sitzungen haelt und bis t
    // nicht unterschritten wurde.
    const floor = minIn(bars.low, i + 1, t);
    let bottom = null;
    if (floor && floor.index + N <= t) bottom = { value: floor.value, index: floor.index, confirmedAt: floor.index + N };
    return { top, bottom };
  }
  return null;
}

export function scan(ctx, t, p = PARAMS, opts = {}) {
  const { bars, ind } = ctx;
  if (t < 60) return null;
  const c = bars.close[t];
  if (!(c >= p.minPrice) || !(ind.dollarVol20[t] >= p.minDollarVolume)) return null;
  const hi = ind.high252[t];
  if (!Number.isFinite(hi)) return null;
  // Nahe am Hoch: der Kurs, oder - sobald eine Box existiert - deren
  // Oberkante. Ein Rueckgang INNERHALB einer intakten Box beendet sie nicht.
  const box = findBox(bars, t, p);
  const rules = { 'DAR-MOM-01': c >= p.nearHighPct * hi || !!(box && box.top.value >= p.topNearHigh * hi) };
  if (!rules['DAR-MOM-01']) return null;
  const mom = ctx.cross?.mom126?.[t];
  rules['DAR-MOM-02'] = (Number.isFinite(mom) && mom >= p.momentumPercentile) || !!opts.pending?.rules?.['DAR-MOM-02']; // LC-RANK-AT-DISCOVERY
  if (!rules['DAR-MOM-02']) return null;
  const facts = { distanceTo52wHigh: c / hi - 1, momentumPercentile: mom };
  rules['DAR-BOX-01'] = !!box;
  if (!box) return { stage: 'DISCOVERED', rules, facts, levels: {} };
  rules['DAR-BOX-02'] = !!box.bottom;
  const levels = { boxTop: box.top.value, boxTopDate: bars.date[box.top.index] };
  if (!box.bottom) return { stage: 'WATCH', rules, facts, levels };
  const height = 1 - box.bottom.value / box.top.value;
  facts.boxHeight = height;
  rules['DAR-BOX-03'] = height <= p.maxBoxHeight && height >= p.minBoxHeight;
  rules['DAR-BOX-04'] = box.top.value >= p.topNearHigh * hi;
  if (!rules['DAR-BOX-04']) return { stage: 'WATCH', rules, facts, levels };
  if (!rules['DAR-BOX-03']) return { stage: 'WATCH', rules, facts, levels };
  Object.assign(levels, {
    trigger: box.top.value, invalidation: box.bottom.value,
    boxBottom: box.bottom.value, boxBottomDate: bars.date[box.bottom.index],
    stopPlan: 'Boxunterkante; wird mit jeder höheren, bestätigten Box nachgezogen',
  });
  const distance = box.top.value / c - 1;
  facts.distanceToTrigger = distance;
  return { stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP', rules, facts, levels, quality: quality(ctx, t, levels, p) };
}

// DAR-ENTRY-D1: Tagesschluss ueber der Oberkante bestaetigt den Ausbruch
// (Original DAR-ENTRY-01: Kauf beim Ausbruch - intraday, mit Tagesdaten nicht
// belegbar). Am Bestaetigungstag wird die Qualitaet endgueltig: Volumen des
// Bestaetigungstags gegen den 50-Tage-Schnitt bis zum Vortag.
export function confirm(ctx, t, pending, p = PARAMS) {
  const { bars, ind } = ctx;
  if (!(bars.close[t] > pending.levels.trigger)) return null;
  const v50 = ind.vol50[t - 1];
  const volumeRatio = Number.isFinite(v50) && v50 > 0 && Number.isFinite(bars.volume[t]) ? bars.volume[t] / v50 : null;
  const q = quality(ctx, t - 1, pending.levels, p, volumeRatio, 'CONFIRMED');
  return { ruleId: 'DAR-ENTRY-D1', basis: 'DAILY_CLOSE', close: bars.close[t], volumeRatio, quality: q };
}

// Modelleinstieg zur Eroeffnung; DAR-STOP-01: Stop an der Boxunterkante.
// Keine Gap-Sperre (im Original nicht belegt); ein Gap wird protokolliert.
export function planEntry(ctx, t, sig) {
  return { stop: sig.levels.boxBottom, stopRuleId: 'DAR-STOP-01' };
}

export function invalidate(ctx, t, pending, p = PARAMS) {
  if (ctx.bars.low[t] < pending.levels.invalidation) return 'DAR-INV-01';
  if (pending.sessions > p.maxPendingSessions) return 'DAR-INV-02';
  return null;
}

export function manage(ctx, t, pos, p = PARAMS) {
  const out = {};
  // Hoehere Box nach dem Einstieg: Oberkante ueber dem Einstieg, Unterkante
  // bestaetigt -> Stop auf die neue Unterkante (DAR-STOP-01).
  const box = findBox(ctx.bars, t, p, Math.max(0, pos.entryIndex + 1));
  if (box && box.bottom && box.top.value > pos.entry && box.bottom.value > pos.stop) {
    out.stop = box.bottom.value; out.stopRuleId = 'DAR-STOP-01';
  }
  out.warning = ctx.bars.close[t] < pos.levels.trigger;
  out.warningRuleId = 'DAR-WARN-01';
  return out;
}

export default {
  id: 'DARVAS_BOX', variant: 'DARVAS_BOX_N3_VU', version: '1.2.0', timeframe: 'daily',
  manageCompatible: ['1.0.0', '1.1.0', '1.2.0'],
  PARAMS, scan, confirm, planEntry, invalidate, manage, quality,
  // Taegliche Neuklassifikation wartender Setups (vor dem Ausbruch).
  classify: (ctx, t, sig) => quality(ctx, t, sig.levels),
};
