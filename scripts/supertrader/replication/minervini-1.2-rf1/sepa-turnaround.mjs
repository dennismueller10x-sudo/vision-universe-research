// Minervini Rule Fidelity RF1 (Forschungsversion minervini-adaptation-1.2.0-rf1, nie live).
// MR-SEPA-10: Turnaround-Klausel nach dem Buch statt pauschalem Ausschluss.
//
// Quellen (MINERVINI-RULE-FIDELITY-SOURCES.json): Q-TURN-A, Q-TURN-B. Praeregistrierung:
// MINERVINI-RULE-FIDELITY-PREREG.json (H1, Nachtrag A1). Die eingefrorene Engine 1.1.0 bleibt
// unveraendert; diese Datei umhuellt evaluateSepa und greift nur, wenn die eingefrorene Pruefung
// mit MR-SEPA-10 (Vorjahres-EPS nicht positiv) endet. Jeder andere Pfad ist bitgleich 1.1.0.
//
// Klausel (Vorjahresquartals-EPS <= 0, q0-EPS vorhanden):
//   T-A (Wende):    Vorjahres-EPS <= 0 und q0-EPS > 0. Die Verbesserung gegen |Basis| ist dann > 100 %
//                   („+100 percent or better in the most recent one or two quarters“, Q-TURN-B).
//   T-B (Altgipfel): q0-EPS > Vorjahres-EPS und TTM-EPS(q0) >= hoechster frueherer TTM-EPS, der > 0 ist
//                   („one quarter that is up enough to move the trailing 12-month EPS to near or above its
//                   old peak“, Q-TURN-A). „near“ wird nicht formalisiert, nur „at or above“.
// Beschleunigung (MR-SEPA-02) im Turnaround-Zweig:
//   'WAIVED' (primaer, V1): entfaellt, weil g0 auf nichtpositiver Basis nicht definiert ist und die
//                   Turnaround-Kriterien des Buchs keine Beschleunigung nennen.
//   'SWING'  (Sensitivitaet, V2): g = (e - Basis)/|Basis|, g0 > g1 bleibt Pflicht.
// Unveraendert danach: MR-SEPA-04 (Umsatz > Vorjahresquartal), nur Protokoll: Margen, Code 33.
// Loss -> Loss (q0 <= 0) bleibt SEPA_BASE_NOT_POSITIVE. Es entsteht kein neuer Parameter.
import { ROW } from '../minervini/sec-facts.mjs';
import { requireP } from '../minervini/trend-template.mjs';
import { evaluateSepa, visibleRows, marginsAt, code33 } from '../minervini/sepa.mjs';

export const VERSION = 'minervini-adaptation-1.2.0-rf1';
const DAY = 864e5;
const YEAR_DAYS = 365.25, QUARTER_DAYS = YEAR_DAYS / 4; // Kalender, wie in sepa.mjs
const dd = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const shift = (date, daysBack) => new Date(Date.parse(date) - daysBack * DAY).toISOString().slice(0, 10);

function byEnd(rows, target, tol) {
  let best = null, bd = Infinity;
  for (const r of rows) { const d = Math.abs(dd(r[ROW.END], target)); if (d <= tol && d < bd) { bd = d; best = r; } }
  return best;
}
const previousQuarter = (rows, q, tol) => { const r = byEnd(rows, shift(q[ROW.END], QUARTER_DAYS), tol); return r && r !== q ? r : null; };

// EPS-Wert eines Quartals auf die Aktienbasis von q0 gebracht (Split zwischen der Einreichung von row und q0).
// null = nicht bestimmbar (Split-Historie unbekannt oder abgeleitetes Q4 ueber einen Split).
function adjusted(row, q0, splitRatio) {
  if (row[ROW.DERIVED] === 1) {
    const s = splitRatio(row[ROW.COMPONENTS_FROM], row[ROW.FILED]);
    if (s === null || Math.abs(s - 1) > 1e-9) return null;
  }
  if (row === q0) return row[ROW.VALUE];
  const s = splitRatio(row[ROW.FILED], q0[ROW.FILED]);
  return s === null ? null : row[ROW.VALUE] / s;
}

// TTM-EPS je Quartal mit vier lueckenlosen Quartalen, auf die Aktienbasis von q0 gebracht.
export function ttmSeries(eps, q0, splitRatio, tol) {
  const out = new Map();
  for (const r of eps) {
    if (r[ROW.END] > q0[ROW.END]) continue;
    const chain = [r];
    while (chain.length < 4) { const p = previousQuarter(eps, chain[chain.length - 1], tol); if (!p) break; chain.push(p); }
    if (chain.length < 4) continue;
    const vals = chain.map((c) => adjusted(c, q0, splitRatio));
    if (vals.some((v) => v === null)) continue;
    out.set(r[ROW.END], vals.reduce((s, v) => s + v, 0));
  }
  return out;
}

function swingGrowth(e, base) { return base === 0 ? null : (e - base) / Math.abs(base); }

export function evaluateSepaRf1(fund, execDate, splitRatio, P, opts = {}) {
  const acceleration = opts.acceleration || 'WAIVED';
  const frozen = evaluateSepa(fund, execDate, splitRatio, P);
  if (frozen.ruleId !== 'MR-SEPA-10') return frozen; // jeder andere Pfad ist 1.1.0
  requireP(P);
  const tol = P['pit.yoyToleranceDays'];
  const eps = visibleRows(fund.eps, execDate), rev = visibleRows(fund.rev, execDate);
  const q0 = eps[eps.length - 1];
  const prior = byEnd(eps, shift(q0[ROW.END], YEAR_DAYS), tol);
  if (!prior || prior === q0) return frozen;
  const base = prior[ROW.VALUE], cur = q0[ROW.VALUE];
  if (!(base <= 0)) return frozen; // Basis positiv: der Fall gehoert nicht zu dieser Klausel (zB Basis des Vorquartals)

  const facts = { ...frozen.facts, epsBase: base, epsCurrent: cur };
  const tA = cur > 0;
  let tB = false, peak = null, ttm = null;
  if (!tA && cur > base) {
    const series = ttmSeries(eps, q0, splitRatio, tol);
    ttm = series.get(q0[ROW.END]) ?? null;
    const earlier = [...series.entries()].filter(([end]) => end < q0[ROW.END]).map(([, v]) => v);
    peak = earlier.length ? Math.max(...earlier) : null;
    tB = ttm !== null && peak !== null && peak > 0 && ttm >= peak;
  }
  if (!tA && !tB) return { ok: false, ruleId: 'MR-SEPA-10', reason: 'SEPA_BASE_NOT_POSITIVE', facts: { ...facts, turnaround: { branch: null, ttm, peak } } };
  const branch = tA ? 'T-A' : 'T-B';
  facts.turnaround = { branch, ttm, peak };

  if (acceleration === 'SWING') {
    const g0 = swingGrowth(cur, base);
    const q1 = previousQuarter(eps, q0, tol);
    const p1 = q1 && byEnd(eps, shift(q1[ROW.END], YEAR_DAYS), tol);
    const b1 = p1 && p1 !== q1 ? p1[ROW.VALUE] : null;
    const g1 = b1 === null ? null : (b1 > 0 ? q1[ROW.VALUE] / (b1 / (splitRatio(p1[ROW.FILED], q1[ROW.FILED]) ?? NaN)) - 1 : swingGrowth(q1[ROW.VALUE], b1));
    facts.epsGrowth = g0; facts.epsGrowthPrev = g1 !== null && Number.isFinite(g1) ? g1 : null;
    if (facts.epsGrowthPrev === null) return { ok: false, ruleId: 'MR-SEPA-02', reason: 'SEPA_ACCEL_NOT_DEMONSTRABLE', facts };
    if (!(g0 > g1)) return { ok: false, ruleId: 'MR-SEPA-02', reason: 'SEPA_NO_ACCELERATION', facts };
  }

  // MR-SEPA-04 unveraendert: Umsatz desselben Quartals ueber dem Vorjahresquartal.
  const r0 = byEnd(rev, q0[ROW.END], tol);
  const rp = r0 && byEnd(rev, shift(r0[ROW.END], YEAR_DAYS), tol);
  if (!r0 || !rp || rp === r0) return { ok: false, ruleId: 'MR-SEPA-00', reason: 'SEPA_REV_NO_YEAR_AGO', facts };
  if (!(rp[ROW.VALUE] > 0)) return { ok: false, ruleId: 'MR-SEPA-00', reason: 'SEPA_REV_BASE_NOT_POSITIVE', facts };
  facts.revGrowth = r0[ROW.VALUE] / rp[ROW.VALUE] - 1;
  if (!(facts.revGrowth > P['sepa.minRevenueGrowth'])) return { ok: false, ruleId: 'MR-SEPA-04', reason: 'SEPA_REVENUE_NOT_GROWING', facts };
  const r1 = previousQuarter(rev, r0, tol);
  const rp1 = r1 && byEnd(rev, shift(r1[ROW.END], YEAR_DAYS), tol);
  facts.revGrowthPrev = r1 && rp1 && rp1 !== r1 && rp1[ROW.VALUE] > 0 ? r1[ROW.VALUE] / rp1[ROW.VALUE] - 1 : null;
  facts.revAccel = facts.revGrowthPrev === null ? null : facts.revGrowth > facts.revGrowthPrev;
  facts.margins = marginsAt(fund, execDate, q0[ROW.END], tol);
  facts.code33 = code33(fund, eps, rev, q0, execDate, splitRatio, tol);
  return { ok: true, ruleId: null, reason: null, facts };
}
