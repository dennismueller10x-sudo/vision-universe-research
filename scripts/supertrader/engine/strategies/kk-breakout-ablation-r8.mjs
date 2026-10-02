// Gegenprobe Runde 8 (nur interne Pruefung, nie live): Regeln und Portfolio wie
// Momentum 3.0.0, aber Einstieg wie 1.1.0/2.0.0 - Bestaetigung per Tagesschluss
// ueber dem Trigger, Kauf zur Eroeffnung des Folgetags, Stop am Tief des
// Bestaetigungstags (hoechstens 1 ADR). Ohne Gap-Sperre wie 3.0.0.
// Zweck: isoliert die Wirkung von Einstiegszeitpunkt und Stop-Bezug.
import v1, { scan, confirm, invalidate } from './kk-breakout.mjs';
import { manage } from './kk-breakout-v2.mjs';
import { PORTFOLIO, PARAMS } from './kk-breakout-v3.mjs';

export function planEntry(ctx, t, sig) {
  const open = ctx.bars.open[t];
  const adr = sig.levels.adr20;
  const capped = Number.isFinite(adr) ? open * (1 - adr) : -Infinity;
  return { stop: Math.max(sig.confirmation.low, capped), stopRuleId: 'KK-BO-STOP-D1' };
}

export default {
  id: 'MOMENTUM_BREAKOUT', variant: 'KK_BREAKOUT_ABLATION_CLOSE_NEXTOPEN_R8', version: '3.0.0-A', timeframe: 'daily',
  PARAMS, scan, confirm, planEntry, invalidate, manage, portfolio: PORTFOLIO, internalOnly: true,
};
void v1;
