// Minervini Canonical Replication – Signal-Engine je Titel.
//
// Fuer jeden Schluss t: Messrahmen (MR-UNI-01) -> Trend Template (MR-TT-*) -> VCP (MR-VCP-*, MR-RSK-01)
// -> SEPA zum Stand des Ausfuehrungstags t+1 (MR-SEPA-*, MR-PIT-01). Ergebnis ist ein Setup, aus dem am
// Handelstag t+1 eine Kauf-Stop-Order am Pivot wird. Kein Lebenszyklus mit Verfall oder Sperre: Das Setup
// wird an jedem Schluss neu bewertet (die 2.0.0-Regeln Verfall 20, Sperre 5, ENTRY_READY 3 % entfallen).
//
// ctx: {bars:{date,open,high,low,close,volume}, rawClose[], rsPct[] (Querschnitts-Perzentil, Datenschicht),
//       fund (sec-facts-Record oder null), splitRatio(from,to) (sepa.makeSplitRatio)}
import { dollarVolume } from '../../engine/indicators.mjs';
import { requireP, prepareIndicators, trendTemplate, rsScore } from './trend-template.mjs';
import { detectVcp } from './vcp.mjs';
import { evaluateSepa } from './sepa.mjs';

export function scanSegment(ctx, P, { fromIndex = 0 } = {}) {
  requireP(P);
  const { bars } = ctx;
  const n = bars.date.length;
  const ind = prepareIndicators(bars, P);
  const dv = dollarVolume(bars.close, bars.volume, P['uni.dollarVolumeSessions']);
  const setups = new Map();
  const stats = { evaluated: 0, universe: 0, trend: 0, vcp: 0, setups: 0, rejected: {} };
  const rej = (k) => { stats.rejected[k] = (k in stats.rejected ? stats.rejected[k] : 0) + 1; };
  for (let t = Math.max(0, fromIndex - 1); t < n - 1; t++) {
    stats.evaluated++;
    const rc = ctx.rawClose[t];
    if (!(rc >= P['uni.minRawClose']) || !(dv[t] >= P['uni.minDollarVolume20'])) { rej('MR-UNI-01'); continue; }
    stats.universe++;
    const tt = trendTemplate(bars, ind, ctx.rsPct?.[t], t, P);
    if (!tt.ok) { rej('TREND_TEMPLATE'); continue; }
    stats.trend++;
    const vcp = detectVcp(bars, ind.volAvg, t, P);
    if (!vcp.ok) { rej('VCP_' + vcp.reason); continue; }
    stats.vcp++;
    const execDate = bars.date[t + 1];
    const sepa = evaluateSepa(ctx.fund, execDate, ctx.splitRatio, P);
    if (!sepa.ok) { rej(sepa.reason); continue; }
    stats.setups++;
    setups.set(t, {
      pivot: vcp.pivot, stop: vcp.stop, stopPct: vcp.stopPct, baseStart: vcp.baseStart,
      rsPct: tt.facts.rsPercentile, rsScore: rsScore(bars.close, t, P),
      vcp: { contractions: vcp.contractions.map((c) => ({ depth: c.depth, highIndex: c.highIndex, lowIndex: c.lowIndex })), baseLength: vcp.baseLength, baseDepthClass: vcp.baseDepthClass, volumeRatio: vcp.volumeRatio },
      trend: tt.facts,
      sepa: sepa.facts,
    });
  }
  return { setups, stats, volAvg: ind.volAvg };
}
