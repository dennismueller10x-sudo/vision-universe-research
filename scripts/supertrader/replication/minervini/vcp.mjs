// Minervini Canonical Replication – VCP (MR-VCP-01..08, MR-RSK-01).
//
// MR-VCP-08 ist eine VU-Formalisierung einer diskretionaeren Minervini-Regel: Die Basis wird in
// aufeinanderfolgende Extremwerte zerlegt (H1 -> tiefstes Tief danach -> hoechstes Hoch danach ...).
// Daraus folgen tiefer werdende Hochs und hoeher werdende Tiefs ohne Zickzack-Schwelle.
// Rein und kausal: nur Balken bis einschliesslich t.
import { requireP } from './trend-template.mjs';

const fin = Number.isFinite;

// Zerlegung ab dem Basisbeginn hi0 bis t. Gleichstand: jeweils der juengere Balken.
export function decomposeBase(high, low, hi0, t) {
  const out = [];
  let hi = hi0;
  while (hi < t) {
    let lo = -1, lv = Infinity;
    for (let i = hi + 1; i <= t; i++) if (low[i] <= lv) { lv = low[i]; lo = i; }
    if (lo < 0) break;
    const depth = 1 - lv / high[hi];
    if (!(depth > 0)) break;
    out.push({ highIndex: hi, high: high[hi], lowIndex: lo, low: lv, depth });
    if (lo === t) break;
    let nh = -1, hv = -Infinity;
    for (let i = lo + 1; i <= t; i++) if (high[i] >= hv) { hv = high[i]; nh = i; }
    if (nh < 0) break;
    hi = nh;
  }
  return out;
}

export function classifyBaseDepth(depth, P) {
  if (!fin(depth)) return null;
  if (depth <= P['vcp.constructiveMaxDepth']) return 'CONSTRUCTIVE';
  if (depth <= P['vcp.failureProneMinDepth']) return 'DEEP';
  return 'FAILURE_PRONE';
}

// bars: {high, low, close, volume}; volAvg: SMA(Volumen, vcp.volumeAvgSessions).
export function detectVcp(bars, volAvg, t, P) {
  requireP(P);
  const { high, low, volume } = bars;
  const ws = Math.max(0, t - P['vcp.maxBaseSessions']);
  let h1 = -1, hv = -Infinity;
  for (let i = ws; i <= t; i++) {
    if (!fin(high[i]) || !fin(low[i]) || !(low[i] > 0)) return { ok: false, reason: 'DATA_GAP' };
    if (high[i] >= hv) { hv = high[i]; h1 = i; }
  }
  const baseLength = t - h1;
  if (baseLength < P['vcp.minBaseSessions']) return { ok: false, reason: 'BASE_TOO_SHORT', baseStart: h1, baseLength };
  const contractions = decomposeBase(high, low, h1, t);
  const n = contractions.length;
  const base = { baseStart: h1, baseLength, contractions, firstDepth: n ? contractions[0].depth : null, baseDepthClass: n ? classifyBaseDepth(contractions[0].depth, P) : null };
  if (n < P['vcp.minContractions'] || n > P['vcp.maxContractions']) return { ok: false, reason: 'CONTRACTION_COUNT', ...base };
  for (let k = 1; k < n; k++) if (!(contractions[k].depth < contractions[k - 1].depth)) return { ok: false, reason: 'NOT_CONTRACTING', ...base };
  const last = contractions[n - 1];
  let vs = 0, vc = 0;
  for (let i = last.highIndex + 1; i <= t; i++) { if (!fin(volume[i])) return { ok: false, reason: 'DATA_GAP', ...base }; vs += volume[i]; vc++; }
  const va = volAvg[t];
  const volumeRatio = vc && fin(va) && va > 0 ? (vs / vc) / va : null;
  const pivot = last.high, stop = last.low;
  const stopPct = 1 - stop / pivot;
  const out = { ...base, pivot, pivotIndex: last.highIndex, stop, stopIndex: last.lowIndex, stopPct, lastDepth: last.depth, volumeRatio };
  if (!(volumeRatio !== null && volumeRatio < P['vcp.dryUpMaxRatio'])) return { ok: false, reason: 'NO_VOLUME_DRYUP', ...out };
  if (!(stopPct <= P['risk.maxStopPct'])) return { ok: false, reason: 'STOP_TOO_WIDE', ...out };
  return { ok: true, reason: null, ...out };
}
