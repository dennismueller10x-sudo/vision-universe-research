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
  nearHighPct: 0.90,         // DAR-MOM-01 (VU-Schwelle)
  lookback: 60,
  maxBoxHeight: 0.25,        // VU
  minBoxHeight: 0.03,        // VU: keine gepinnten Mini-Boxen
  topNearHigh: 0.95,         // VU: die Box bildet sich an den Hochs
  entryReadyDistance: 0.03,
  minPrice: 5, minDollarVolume: 5e6,
  maxPendingSessions: 30,
});

// Juengste Box, deren Oberkante bis einschliesslich t nicht ueberschritten
// wurde. Nutzt nur Balken <= t.
export function findBox(bars, t, p = PARAMS, fromIndex = 0) {
  const N = p.confirmBars;
  for (let i = t - N; i >= Math.max(fromIndex, t - p.lookback, N); i--) {
    const h = bars.high[i];
    if (!Number.isFinite(h)) continue;
    const before = maxIn(bars.high, i - N, i - 1);
    if (before && before.value >= h) continue;           // lokales Hoch
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

export function scan(ctx, t, p = PARAMS) {
  const { bars, ind } = ctx;
  if (t < 60) return null;
  const c = bars.close[t];
  if (!(c >= p.minPrice) || !(ind.dollarVol20[t] >= p.minDollarVolume)) return null;
  const hi = ind.high252[t];
  const rules = { 'DAR-MOM-01': Number.isFinite(hi) && c >= p.nearHighPct * hi };
  if (!rules['DAR-MOM-01']) return null;
  const facts = { distanceTo52wHigh: c / hi - 1 };
  const box = findBox(bars, t, p);
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
  return { stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP', rules, facts, levels };
}

export function entry(ctx, t, pending, p = PARAMS, fill) {
  const { bars } = ctx;
  const trig = pending.levels.trigger;
  if (!(bars.high[t] > trig)) return null;
  const f = fill.stopBuy(trig, bars.open[t]);
  const stop = pending.levels.boxBottom;
  return { fill: f.price, gapped: f.gapped, stop, ruleId: 'DAR-ENTRY-01', stopRuleId: 'DAR-STOP-01', sameBarStop: bars.low[t] <= stop };
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
  id: 'DARVAS_BOX', variant: 'DARVAS_BOX_N3_VU', version: '1.0.0', timeframe: 'daily',
  PARAMS, scan, entry, invalidate, manage,
};
