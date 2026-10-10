// Minervini Rule Fidelity RF1 (Forschungsversion minervini-adaptation-1.2.0-rf1, nie live).
// MR-SEPA-10: Turnaround-Klausel nach dem Buch statt pauschalem Ausschluss.
//
// Quellen (MINERVINI-RULE-FIDELITY-SOURCES.json): Q-TURN-A, Q-TURN-B. Praeregistrierung:
// MINERVINI-RULE-FIDELITY-PREREG.json (H1, Nachtrag A1). Die eingefrorene Engine 1.1.0 bleibt
// unveraendert; diese Datei umhuellt evaluateSepa und greift nur, wenn die eingefrorene Pruefung
// mit MR-SEPA-10 (Vorjahres-EPS nicht positiv) endet. Jeder andere Pfad ist bitgleich 1.1.0.
//
// Klausel (Vorjahresquartals-EPS <= 0, q0-EPS vorhanden), nach Nachtrag A2 nur noch T-A:
//   T-A (Wende):    Vorjahres-EPS <= 0 und q0-EPS > 0. Die Verbesserung gegen |Basis| ist dann > 100 %
//                   („+100 percent or better in the most recent one or two quarters“, Q-TURN-B).
//   Der „Altgipfel“-Zweig (Q-TURN-A, TTM-EPS auf/ueber dem frueheren Gipfel) entfaellt: Mit q0 > 0 ist er neben T-A
//   redundant; ohne q0 > 0 liesse er Verlustquartale zu und widerspraeche „very strong“ (Review F2).
// Beschleunigung (MR-SEPA-02) im Turnaround-Zweig:
//   'WAIVED' (primaer, V1): entfaellt, weil g0 auf nichtpositiver Basis nicht definiert ist. VU-Entscheidung: Die Notizen
//                   nennen im Turnaround-Abschnitt durchaus Beschleunigung (Review F6).
//   'SWING'  (Sensitivitaet, V2): g = (e - Basis)/|Basis|, g0 > g1 bleibt Pflicht (Basis des Vorquartals splitbereinigt).
// Bekannte Luecke (Review F3): Im zweiten Turnaround-Quartal (Basis von q0 > 0, Basis des Vorquartals <= 0) scheitert
// MR-SEPA-02 weiter mit SEPA_ACCEL_NOT_DEMONSTRABLE. RF1 ist eine Teilkorrektur.
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

function swingGrowth(e, base) { return base === 0 ? null : (e - base) / Math.abs(base); }
const safeRatio = (f, a, b) => { const r = f(a, b); return r === null || !Number.isFinite(r) ? null : r; };

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
  if (!tA) return { ok: false, ruleId: 'MR-SEPA-10', reason: 'SEPA_BASE_NOT_POSITIVE', facts: { ...facts, turnaround: { branch: null } } };
  facts.turnaround = { branch: 'T-A' };

  if (acceleration === 'SWING') {
    // Basen werden auf die Aktienbasis des jeweiligen Quartals gebracht (Split zwischen den Einreichungen); unbestimmbar -> nicht nachweisbar.
    const sr0 = safeRatio(splitRatio, prior[ROW.FILED], q0[ROW.FILED]);
    const g0 = sr0 === null ? null : swingGrowth(cur, base / sr0);
    const q1 = previousQuarter(eps, q0, tol);
    const p1 = q1 && byEnd(eps, shift(q1[ROW.END], YEAR_DAYS), tol);
    let g1 = null;
    if (q1 && p1 && p1 !== q1 && q1[ROW.DERIVED] !== 1 && p1[ROW.DERIVED] !== 1) {
      const sr1 = safeRatio(splitRatio, p1[ROW.FILED], q1[ROW.FILED]);
      if (sr1 !== null) g1 = swingGrowth(q1[ROW.VALUE], p1[ROW.VALUE] / sr1);
    }
    facts.epsGrowth = g0; facts.epsGrowthPrev = g1;
    if (g0 === null || g1 === null) return { ok: false, ruleId: 'MR-SEPA-02', reason: 'SEPA_ACCEL_NOT_DEMONSTRABLE', facts };
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
