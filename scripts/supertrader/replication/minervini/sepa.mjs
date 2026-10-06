// Minervini Canonical Replication – SEPA-Fundamentaldaten zum damaligen Stand
// (MR-SEPA-00..06, MR-SEPA-10, MR-PIT-01).
//
// Sichtbarkeit: Ein Wert mit Einreichungsdatum f gilt fuer eine Order am Handelstag d nur, wenn f < d.
// Massgeblich ist die Einreichung, nie das Periodenende. Je Periode zaehlt die Erstmeldung (sec-facts.mjs).
// EPS-Vorjahreswerte werden um Splits zwischen beiden Einreichungen bereinigt; die Split-Faktoren
// kommen aus quant/engines/return-series.js#splitFactors (ADR-002), nicht aus einer eigenen Ableitung.
import { createRequire } from 'node:module';
import { ROW } from './sec-facts.mjs';
import { requireP } from './trend-template.mjs';

const require = createRequire(import.meta.url);
const ReturnSeries = require('../../../../quant/engines/return-series.js');

const DAY = 864e5;
const YEAR_DAYS = 365.25, QUARTER_DAYS = YEAR_DAYS / 4; // Kalender, keine Strategiezahl
const FLOAT_TOLERANCE = 1e-12;
const dd = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const shift = (date, daysBack) => new Date(Date.parse(date) - daysBack * DAY).toISOString().slice(0, 10);

// Split-Verhaeltnis zwischen zwei Daten aus Rohbalken {date, splitFactor} (ADR-002):
// Produkt der Split-Faktoren mit Datum in (from, to]. null, wenn 'from' vor dem ersten Balken liegt.
export function makeSplitRatio(rawBars) {
  const bars = (rawBars || []).filter((b) => b && b.date);
  const F = ReturnSeries.splitFactors(bars);
  const dates = bars.map((b) => b.date);
  const idx = (d) => { let lo = 0, hi = dates.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
  return (from, to) => {
    if (!dates.length || !from || !to) return null;
    if (to < from) return null;
    const a = idx(from), b = idx(to);
    if (a < 0 || b < 0) return null;
    return F[a] / F[b];
  };
}

export function visibleRows(rows, execDate) {
  return (rows || []).filter((r) => r && r[ROW.FILED] < execDate).sort((a, b) => a[ROW.END].localeCompare(b[ROW.END]));
}

function byEnd(rows, target, tol) {
  let best = null, bd = Infinity;
  for (const r of rows) { const d = Math.abs(dd(r[ROW.END], target)); if (d <= tol && d < bd) { bd = d; best = r; } }
  return best;
}

// Wachstum gegen das Vorjahresquartal. kind 'eps' -> Split-Bereinigung und Pruefung abgeleiteter Q4-Werte.
function yoyGrowth(rows, q, kind, splitRatio, tol) {
  const prior = byEnd(rows, shift(q[ROW.END], YEAR_DAYS), tol);
  if (!prior || prior === q) return { growth: null, reason: 'NO_YEAR_AGO' };
  let base = prior[ROW.VALUE];
  if (kind === 'eps') {
    for (const r of [q, prior]) if (r[ROW.DERIVED] === 1) {
      const s = splitRatio(r[ROW.COMPONENTS_FROM], r[ROW.FILED]);
      if (s === null || Math.abs(s - 1) > 1e-9) return { growth: null, reason: 'DERIVED_EPS_ACROSS_SPLIT' };
    }
    const s = splitRatio(prior[ROW.FILED], q[ROW.FILED]);
    if (s === null) return { growth: null, reason: 'SPLIT_HISTORY_UNKNOWN' };
    base = base / s;
  }
  if (!(base > 0)) return { growth: null, reason: 'BASE_NOT_POSITIVE', prior: prior[ROW.VALUE] };
  return { growth: q[ROW.VALUE] / base - 1, priorEnd: prior[ROW.END], priorFiled: prior[ROW.FILED] };
}

const previousQuarter = (rows, q, tol) => { const r = byEnd(rows, shift(q[ROW.END], QUARTER_DAYS), tol); return r && r !== q ? r : null; };

// Margen (MR-SEPA-06, nur Protokoll) fuer das Quartal mit Periodenende 'end'.
export function marginsAt(fund, execDate, end, tol) {
  const rev = visibleRows(fund?.rev, execDate);
  const out = {};
  for (const [key, field] of [['gross', 'gp'], ['operating', 'opinc'], ['net', 'ni']]) {
    const num = visibleRows(fund?.[field], execDate);
    const m = (e) => { const n = byEnd(num, e, tol), r = byEnd(rev, e, tol); return n && r && r[ROW.VALUE] > 0 ? n[ROW.VALUE] / r[ROW.VALUE] : null; };
    const cur = m(end), prior = m(shift(end, YEAR_DAYS));
    out[key] = { margin: cur, priorYear: prior, changePp: cur !== null && prior !== null ? (cur - prior) * 100 : null };
  }
  return out;
}

export function evaluateSepa(fund, execDate, splitRatio, P) {
  requireP(P);
  const tol = P['pit.yoyToleranceDays'];
  if (!fund) return { ok: false, ruleId: 'MR-SEPA-00', reason: 'SEPA_DATA_MISSING', facts: null };
  const eps = visibleRows(fund.eps, execDate), rev = visibleRows(fund.rev, execDate);
  if (!eps.length) return { ok: false, ruleId: 'MR-SEPA-00', reason: 'SEPA_DATA_MISSING', facts: null };
  const q0 = eps[eps.length - 1];
  const facts = { quarterEnd: q0[ROW.END], filed: q0[ROW.FILED], accn: q0[ROW.ACCN], form: q0[ROW.FORM] };
  if (dd(q0[ROW.END], execDate) > P['pit.maxQuarterAgeDays']) return { ok: false, ruleId: 'MR-PIT-01', reason: 'SEPA_STALE', facts };
  const g0 = yoyGrowth(eps, q0, 'eps', splitRatio, tol);
  facts.epsGrowth = g0.growth;
  if (g0.growth === null) return g0.reason === 'BASE_NOT_POSITIVE'
    ? { ok: false, ruleId: 'MR-SEPA-10', reason: 'SEPA_BASE_NOT_POSITIVE', facts }
    : { ok: false, ruleId: 'MR-SEPA-00', reason: 'SEPA_EPS_' + g0.reason, facts };
  // FLOAT_TOLERANCE nur gegen Rundungsfehler (1,2/1,0-1 = 0,19999...), keine Strategiezahl.
  if (!(g0.growth + FLOAT_TOLERANCE >= P['sepa.minEpsGrowth'])) return { ok: false, ruleId: 'MR-SEPA-01', reason: 'SEPA_EPS_GROWTH_LOW', facts };
  const q1 = previousQuarter(eps, q0, tol);
  const g1 = q1 ? yoyGrowth(eps, q1, 'eps', splitRatio, tol) : { growth: null, reason: 'NO_PREVIOUS_QUARTER' };
  facts.epsGrowthPrev = g1.growth;
  if (g1.growth === null) return { ok: false, ruleId: 'MR-SEPA-02', reason: 'SEPA_ACCEL_NOT_DEMONSTRABLE', facts };
  if (!(g0.growth > g1.growth)) return { ok: false, ruleId: 'MR-SEPA-02', reason: 'SEPA_NO_ACCELERATION', facts };
  const r0 = byEnd(rev, q0[ROW.END], tol);
  const rg0 = r0 ? yoyGrowth(rev, r0, 'rev', splitRatio, tol) : { growth: null, reason: 'NO_REVENUE_FOR_QUARTER' };
  facts.revGrowth = rg0.growth;
  if (rg0.growth === null) return { ok: false, ruleId: 'MR-SEPA-00', reason: 'SEPA_REV_' + rg0.reason, facts };
  if (!(rg0.growth > P['sepa.minRevenueGrowth'])) return { ok: false, ruleId: 'MR-SEPA-04', reason: 'SEPA_REVENUE_NOT_GROWING', facts };
  // Nur Protokoll: Umsatzbeschleunigung, Margen, Code 33 (MR-SEPA-03/05/06).
  const r1 = previousQuarter(rev, r0, tol);
  const rg1 = r1 ? yoyGrowth(rev, r1, 'rev', splitRatio, tol) : { growth: null };
  facts.revGrowthPrev = rg1.growth;
  facts.revAccel = rg1.growth === null ? null : rg0.growth > rg1.growth;
  facts.margins = marginsAt(fund, execDate, q0[ROW.END], tol);
  facts.code33 = code33(fund, eps, rev, q0, execDate, splitRatio, tol);
  return { ok: true, ruleId: null, reason: null, facts };
}

// Code 33 (MR-SEPA-03): drei Quartale Beschleunigung bei EPS und Umsatz und steigende Nettomarge.
// null = nicht bewertbar (fehlende Daten).
export function code33(fund, eps, rev, q0, execDate, splitRatio, tol) {
  const chain = (rows, start) => { const out = [start]; while (out.length < 4) { const p = previousQuarter(rows, out[out.length - 1], tol); if (!p) return null; out.push(p); } return out; };
  const qe = chain(eps, q0);
  const r0 = byEnd(rev, q0[ROW.END], tol);
  const qr = r0 ? chain(rev, r0) : null;
  if (!qe || !qr) return null;
  const ge = qe.map((q) => yoyGrowth(eps, q, 'eps', splitRatio, tol).growth);
  const gr = qr.map((q) => yoyGrowth(rev, q, 'rev', splitRatio, tol).growth);
  if ([...ge, ...gr].some((x) => x === null)) return null;
  const accel = (g) => g[0] > g[1] && g[1] > g[2] && g[2] > g[3];
  const marg = qe.slice(0, 3).map((q) => marginsAt(fund, execDate, q[ROW.END], tol).net.changePp);
  if (marg.some((x) => x === null)) return null;
  return accel(ge) && accel(gr) && marg.every((x) => x > 0);
}
