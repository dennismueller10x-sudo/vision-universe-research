// Minervini SEPA / VCP 3.0.0 (Runde 11, PREREGISTRATION-R11). Neue Regel aus der Primaeraussage
// „all you need to look at are earnings, sales and margins – and the chart“ (Stockopedia 2018):
//  MIN-EPS-01  Am Bestaetigungstag, nur mit Werten, deren erste SEC-Einreichung vorher lag: EPS des
//              zuletzt gemeldeten Quartals >= +25 % zum Vorjahresquartal (Vorjahr > 0), Wachstum hoeher
//              als im Vorquartal (Beschleunigung, ein Vorquartal mit Verlust im Vorjahr zaehlt als
//              Beschleunigung), Umsatz ueber dem Vorjahresquartal. Ohne Daten kein Einstieg (MIN-EPS-NA).
// Alle uebrigen Regeln wie 2.0.0. Margen sind nicht formalisiert (keine belegte Zahl).
import v2, { PARAMS as P2, scan, confirm as confirm2, planEntry, manage, PORTFOLIO } from './minervini-v2.mjs';
import { invalidate } from './minervini.mjs';
import { earningsAt } from '../earnings.mjs';

export const PARAMS = Object.freeze({ ...P2, epsMinGrowth: 0.25, allowMissingEps: false });

export function confirm(ctx, t, pending, p = PARAMS) {
  const c = confirm2(ctx, t, pending, p);
  if (!c || c.notTaken) return c;
  const e = earningsAt(ctx.fund, ctx.bars.date[t], { minGrowth: p.epsMinGrowth });
  if (e.ok === true) return { ...c, earnings: e.facts };
  if (e.ok === null && p.allowMissingEps) return { ...c, earnings: { ...(e.facts || {}), missing: true } };
  const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)} %` : '–');
  const note = e.reason === 'MIN-EPS-NA' ? 'Ausbruch bestätigt, aber keine Gewinndaten zum damaligen Stand — kein Einstieg.'
    : e.reason === 'MIN-EPS-ACC' ? `Ausbruch bestätigt, Gewinnwachstum ${pct(e.facts.epsGrowth)} beschleunigt sich nicht (Vorquartal ${pct(e.facts.epsGrowthPrev)}) — kein Einstieg.`
    : e.reason === 'MIN-REV-01' ? 'Ausbruch bestätigt, aber der Umsatz liegt nicht über dem Vorjahresquartal — kein Einstieg.'
    : `Ausbruch bestätigt, Gewinnwachstum ${pct(e.facts?.epsGrowth)} unter 25 % zum Vorjahresquartal — kein Einstieg.`;
  return { notTaken: true, ruleId: e.reason, note };
}

export default { ...v2, variant: 'MINERVINI_TT_VCP_EPS_R11', version: '3.0.0', manageCompatible: ['2.0.0', '3.0.0'], signalCompatible: ['2.0.0'],
  PARAMS, scan, confirm, planEntry, invalidate, manage, portfolio: PORTFOLIO };
