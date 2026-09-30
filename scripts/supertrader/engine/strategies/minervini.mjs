// Minervini SEPA / VCP — HYBRID_MODEL.
//
// Trend Template (MIN-TREND-01/02, MIN-HIGH-01, MIN-LOW-01, MIN-RS-01) ist
// breit belegt, einzelne Grenzwerte sind DISPUTED (25 vs. 30 % ueber dem
// 52-Wochen-Tief: hier Variante A = 25 %, Variante B ist eine eigene
// Strategy-Version). Die automatische VCP-Erkennung (MIN-VCP-01/02) ist eine
// VU-Formalisierung und NICHT identisch mit Minervinis diskretionaerer
// Chartbeurteilung. Die "Relative Staerke" ist ein VU-Faktor, kein IBD-RS.
// Fundamentale Wachstumsfilter sind Teil von SEPA, ihre Schwellen aber nicht
// primaer belegt: sie werden angezeigt, nicht gefiltert (HYBRID).
import { maxIn } from '../indicators.mjs';

export const PARAMS = Object.freeze({
  lowDistance: 1.25,          // MIN-LOW-01 Variante A
  highDistance: 0.75,         // MIN-HIGH-01
  rsPercentile: 70,           // MIN-RS-01 (VU-Faktor; 70/80/90 als Varianten)
  sma200SlopeBars: 21,        // MIN-TREND-02 (VU-Lookback)
  vcpWindow: 65,
  zigzagPct: 0.04,            // VU
  minContractions: 2,         // MIN-VCP-01
  maxFirstDepth: 0.35,
  maxLastDepth: 0.10,
  volumeDryUp: 0.8,           // MIN-VCP-02 (vol10/vol50 < x)
  entryReadyDistance: 0.03,
  maxRisk: 0.10,              // VU-Kappung, KEINE Minervini-Originalzahl
  minPrice: 5, minDollarVolume: 5e6,
  maxPendingSessions: 20,
});

// Prozent-Zigzag auf High/Low. Nur Balken from..t.
export function zigzag(bars, from, t, pct) {
  const pts = [];
  let dir = 0, extIdx = from, extVal = bars.high[from], lowIdx = from, lowVal = bars.low[from];
  for (let i = from + 1; i <= t; i++) {
    const h = bars.high[i], l = bars.low[i];
    if (dir >= 0) {
      if (h > extVal) { extVal = h; extIdx = i; }
      if (dir === 0 && l < lowVal) { lowVal = l; lowIdx = i; }
      if (l <= extVal * (1 - pct) && (dir === 1 || extIdx > lowIdx)) {
        if (dir === 0 && lowIdx < extIdx) pts.push({ type: 'L', index: lowIdx, value: lowVal });
        pts.push({ type: 'H', index: extIdx, value: extVal });
        dir = -1; extVal = l; extIdx = i;
        continue;
      }
    }
    if (dir === -1) {
      if (l < extVal) { extVal = l; extIdx = i; }
      if (h >= extVal * (1 + pct)) {
        pts.push({ type: 'L', index: extIdx, value: extVal });
        dir = 1; extVal = h; extIdx = i;
      }
    }
  }
  return { points: pts, open: { dir, index: extIdx, value: extVal } };
}

export function detectVcp(ctx, t, p = PARAMS) {
  const { bars, ind } = ctx;
  const from = Math.max(0, t - p.vcpWindow);
  const zz = zigzag(bars, from, t, p.zigzagPct);
  const pts = zz.points.slice();
  if (zz.open.dir === -1) pts.push({ type: 'L', index: zz.open.index, value: zz.open.value, tentative: true });
  // Ab dem hoechsten Swing-Hoch im Fenster.
  let startAt = -1, best = -Infinity;
  pts.forEach((q, k) => { if (q.type === 'H' && q.value > best) { best = q.value; startAt = k; } });
  if (startAt < 0) return null;
  // Laeuft das offene Bein bereits ueber das hoechste Swing-Hoch, ist der
  // Ausbruch schon passiert: keine Basis mehr.
  if (zz.open.dir === 1 && zz.open.value > best) return { contractions: [], ok: false, reason: 'BROKEN_OUT' };
  const contractions = [];
  for (let k = startAt; k + 1 < pts.length; k++) {
    if (pts[k].type === 'H' && pts[k + 1].type === 'L') {
      contractions.push({ high: pts[k].value, highIndex: pts[k].index, low: pts[k + 1].value, lowIndex: pts[k + 1].index, depth: 1 - pts[k + 1].value / pts[k].value });
    }
  }
  if (contractions.length < p.minContractions) return { contractions, ok: false };
  const decreasing = contractions.every((c, k) => k === 0 || c.depth < contractions[k - 1].depth);
  const last = contractions[contractions.length - 1];
  const dry = (ind.vol50[t] > 0) ? (mean10(bars.volume, t) / ind.vol50[t]) : null;
  return {
    contractions, decreasing, last,
    pivot: last.high, pivotDate: bars.date[last.highIndex],
    lastLow: last.low, lastLowDate: bars.date[last.lowIndex],
    firstDepth: contractions[0].depth, lastDepth: last.depth, volumeRatio: dry,
    ok: decreasing && contractions[0].depth <= p.maxFirstDepth && last.depth <= p.maxLastDepth && bars.close[t] <= last.high,
  };
}

function mean10(v, t) { let s = 0; for (let i = t - 9; i <= t; i++) s += v[i]; return s / 10; }

export function trendTemplate(ctx, t, p = PARAMS) {
  const { bars, ind, cross } = ctx;
  const c = bars.close[t];
  const s50 = ind.sma50[t], s150 = ind.sma150[t], s200 = ind.sma200[t], s200p = ind.sma200[t - p.sma200SlopeBars];
  const hi = ind.high252[t], lo = ind.low252[t];
  const rs = cross.rs?.[t];
  const rules = {
    'MIN-TREND-01': [s50, s150, s200].every(Number.isFinite) && c > s50 && c > s150 && c > s200,
    'MIN-TREND-02': [s50, s150, s200, s200p].every(Number.isFinite) && s50 > s150 && s150 > s200 && s200 > s200p,
    'MIN-HIGH-01': Number.isFinite(hi) && c >= p.highDistance * hi,
    'MIN-LOW-01': Number.isFinite(lo) && c >= p.lowDistance * lo,
    'MIN-RS-01': Number.isFinite(rs) && rs >= p.rsPercentile,
  };
  return { rules, ok: Object.values(rules).every(Boolean), facts: { rsPercentile: rs ?? null, distanceTo52wHigh: hi ? c / hi - 1 : null, distanceFrom52wLow: lo ? c / lo - 1 : null } };
}

export function scan(ctx, t, p = PARAMS, opts = {}) {
  const { bars, ind } = ctx;
  if (t < 252) return null;
  if (!(bars.close[t] >= p.minPrice) || !(ind.dollarVol20[t] >= p.minDollarVolume)) return null;
  const tt = trendTemplate(ctx, t, p);
  if (!tt.rules['MIN-RS-01'] && opts.pending?.rules?.['MIN-RS-01']) { tt.rules['MIN-RS-01'] = true; tt.ok = Object.values(tt.rules).every(Boolean); } // LC-RANK-AT-DISCOVERY
  if (!tt.ok) return null;
  const rules = { ...tt.rules };
  const facts = { ...tt.facts };
  const vcp = detectVcp(ctx, t, p);
  rules['MIN-VCP-01'] = !!(vcp && vcp.ok);
  if (!rules['MIN-VCP-01']) return { stage: 'DISCOVERED', rules, facts, levels: {} };
  rules['MIN-VCP-02'] = Number.isFinite(vcp.volumeRatio) && vcp.volumeRatio < p.volumeDryUp;
  facts.contractions = vcp.contractions.map((c) => Math.round(c.depth * 1000) / 10);
  facts.volumeRatio = vcp.volumeRatio;
  if (!rules['MIN-VCP-02']) return { stage: 'WATCH', rules, facts, levels: { pivot: vcp.pivot } };
  const risk = 1 - vcp.lastLow / vcp.pivot;
  rules['MIN-RISK-VU'] = risk <= p.maxRisk;
  const levels = {
    trigger: vcp.pivot, pivot: vcp.pivot, pivotDate: vcp.pivotDate,
    invalidation: vcp.lastLow, contractionLow: vcp.lastLow, contractionLowDate: vcp.lastLowDate,
    stopPlan: 'Tief der letzten Kontraktion, höchstens 10 % unter dem Einstieg (VU-Kappung)',
  };
  if (!rules['MIN-RISK-VU']) return { stage: 'WATCH', rules, facts, levels };
  const distance = vcp.pivot / bars.close[t] - 1;
  facts.distanceToTrigger = distance;
  return { stage: distance <= p.entryReadyDistance ? 'ENTRY_READY' : 'SETUP', rules, facts, levels };
}

export function entry(ctx, t, pending, p = PARAMS, fill) {
  const { bars } = ctx;
  const trig = pending.levels.trigger;
  if (!(bars.high[t] > trig)) return null;
  const f = fill.stopBuy(trig, bars.open[t]);
  const stop = Math.max(pending.levels.contractionLow, f.price * (1 - p.maxRisk));
  return { fill: f.price, gapped: f.gapped, stop, ruleId: 'MIN-ENTRY-01', stopRuleId: 'MIN-STOP-VU', sameBarStop: bars.low[t] <= stop };
}

export function invalidate(ctx, t, pending, p = PARAMS) {
  if (ctx.bars.close[t] < pending.levels.invalidation) return 'MIN-INV-01';
  if (pending.sessions > p.maxPendingSessions) return 'MIN-INV-02';
  return null;
}

export function manage(ctx, t, pos) {
  const { bars, ind } = ctx;
  const out = {};
  if (Number.isFinite(ind.sma50[t]) && bars.close[t] < ind.sma50[t]) out.exitNextOpen = 'MIN-EXIT-VU-01';
  out.warning = !out.exitNextOpen && bars.close[t] < pos.levels.trigger;
  out.warningRuleId = 'MIN-WARN-01';
  return out;
}

export default {
  id: 'MINERVINI_VCP', variant: 'MINERVINI_TT_VCP_A', version: '1.0.0', timeframe: 'daily',
  PARAMS, scan, entry, invalidate, manage,
};
