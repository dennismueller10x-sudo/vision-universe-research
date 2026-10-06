// Minervini Canonical Replication – Trend Template (MR-TT-01..08).
// Rein und kausal: Werte an Index t haengen nur von Balken 0..t ab.
import { sma, rollingMax, rollingMin } from '../../engine/indicators.mjs';
import { MissingProvenanceError } from './params.mjs';

export function requireP(P) { if (!P) throw new MissingProvenanceError('Parametertabelle P fehlt (kein Default)'); return P; }

// Indikatoren mit den Fensterlaengen aus dem Regelbuch (nicht die festen Fenster von computeIndicators).
export function prepareIndicators(bars, P) {
  requireP(P);
  const n52 = P['tt.lookback52wSessions'];
  return {
    sma50: sma(bars.close, P['tt.ma50Len']),
    sma150: sma(bars.close, P['tt.ma150Len']),
    sma200: sma(bars.close, P['tt.ma200Len']),
    high52: rollingMax(bars.high, n52),
    low52: rollingMin(bars.low, n52),
    volAvg: sma(bars.volume, P['vcp.volumeAvgSessions']),
  };
}

// RS-Rangwert (nur fuer die Reihenfolge gleichzeitiger Orders, MR-PF-06): gewichtete Renditen.
export function rsScore(close, t, P) {
  requireP(P);
  const w = P['rs.weights'], h = P['rs.horizons'];
  if (w.length !== h.length) throw new MissingProvenanceError('rs.weights und rs.horizons ungleich lang');
  let s = 0;
  for (let k = 0; k < h.length; k++) {
    const i = t - h[k];
    if (i < 0 || !(close[i] > 0) || !Number.isFinite(close[t])) return null;
    s += w[k] * (close[t] / close[i] - 1);
  }
  return s;
}

// Laenge des aktuellen Anstiegs der 200-Tage-Linie in Sitzungen (nur protokolliert: Praeferenz 4-5 Monate).
function risingRun(s200, t) {
  let k = 0;
  while (t - k - 1 >= 0 && Number.isFinite(s200[t - k]) && Number.isFinite(s200[t - k - 1]) && s200[t - k] > s200[t - k - 1]) k++;
  return k;
}

// rsPct = RS-Perzentil (0-100) des Tages t aus der Datenschicht (MR-TT-08); null = unbekannt -> nicht erfuellt.
export function trendTemplate(bars, ind, rsPct, t, P) {
  requireP(P);
  const c = bars.close[t];
  const s50 = ind.sma50[t], s150 = ind.sma150[t], s200 = ind.sma200[t];
  const lag = P['tt.ma200RisingSessions'];
  const s200p = t - lag >= 0 ? ind.sma200[t - lag] : null;
  const hi = ind.high52[t], lo = ind.low52[t];
  const fin = (...x) => x.every(Number.isFinite);
  const rules = {
    'MR-TT-01': fin(c, s150, s200) && c > s150 && c > s200,
    'MR-TT-02': fin(s150, s200) && s150 > s200,
    'MR-TT-03': fin(s200, s200p) && s200 > s200p,
    'MR-TT-04': fin(s50, s150, s200) && s50 > s150 && s50 > s200,
    'MR-TT-05': fin(c, s50) && c > s50,
    'MR-TT-06': fin(c, lo) && lo > 0 && c >= (1 + P['tt.minAbove52wLow']) * lo,
    'MR-TT-07': fin(c, hi) && c >= (1 - P['tt.maxBelow52wHigh']) * hi,
    'MR-TT-08': Number.isFinite(rsPct) && rsPct >= P['tt.rsMinPercentile'],
  };
  const ok = Object.values(rules).every(Boolean);
  return {
    ok, rules,
    facts: {
      rsPercentile: Number.isFinite(rsPct) ? rsPct : null,
      above52wLow: fin(c, lo) && lo > 0 ? c / lo - 1 : null,
      below52wHigh: fin(c, hi) && hi > 0 ? 1 - c / hi : null,
      sma200RisingSessions: fin(s200) ? risingRun(ind.sma200, t) : null,
    },
  };
}
