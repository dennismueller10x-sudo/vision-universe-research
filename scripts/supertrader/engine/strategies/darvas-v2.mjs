// Darvas Box 2.0.0 (Runde 7). Neue Hypothese; 1.2.0 bleibt mit Ergebnis bestehen.
//
//  DAR-STOP-02  Anfangsstop knapp unter der Ausbruchsmarke (Boxoberkante), nicht
//               an der Boxunterkante. Primaerbeleg: TIME, Mai 1959 ("Business:
//               Pas de Dough") - Darvas legte die Stop-Loss-Order "just below his
//               buy order". Abstand 1 % ist VU-Formalisierung von "knapp".
//               Nachziehen an jede hoehere, bestaetigte Boxunterkante (DAR-STOP-01).
// Unveraendert: Boxbildung (VU, N = 3), Auswahl, Bestaetigung per Schlusskurs.
// Nicht abgebildet: Fundamentalfilter ("techno-fundamentalist": steigende
// Ertragskraft, Zukunftsbranchen), Volumenbestaetigung (keine Zahl belegt),
// Pyramiding.
import v1, { PARAMS as P1, scan, confirm, invalidate, quality } from './darvas.mjs';
import { findBox } from './darvas.mjs';

export const PARAMS = Object.freeze({ ...P1, stopBelowTop: 0.01 });

export function planEntry(ctx, t, sig, p = PARAMS) {
  return { stop: sig.levels.boxTop * (1 - p.stopBelowTop), stopRuleId: 'DAR-STOP-02' };
}

export function manage(ctx, t, pos, p = PARAMS) {
  const out = {};
  const box = findBox(ctx.bars, t, p, Math.max(0, pos.entryIndex + 1));
  if (box && box.bottom && box.top.value > pos.entry && box.bottom.value > pos.stop) { out.stop = box.bottom.value; out.stopRuleId = 'DAR-STOP-01'; }
  out.warning = ctx.bars.close[t] < pos.levels.trigger;
  out.warningRuleId = 'DAR-WARN-01';
  return out;
}

export default {
  id: 'DARVAS_BOX', variant: 'DARVAS_BOX_N3_R7', version: '2.0.0', timeframe: 'daily',
  manageCompatible: ['2.0.0'],
  legacy: { '1.0.0': v1, '1.1.0': v1, '1.2.0': v1 },
  PARAMS, scan, confirm, planEntry, invalidate, manage, quality,
  classify: (ctx, t, sig) => quality(ctx, t, sig.levels),
  portfolio: null,
};
