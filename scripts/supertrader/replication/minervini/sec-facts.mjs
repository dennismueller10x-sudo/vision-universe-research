// Minervini Canonical Replication – SEC-Erstmeldungen point-in-time (MR-PIT-01).
//
// Erweiterung der bestehenden companyfacts-Extraktion (validation/sec-pit.mjs#quarterly), ohne
// neue Datenquelle. Gegenueber sec-pit-r11/r12 (Worker-A-Audit):
//  - nur periodische Formulare (10-Q/10-K/20-F/40-F/6-K, auch /A und Uebergangsberichte) (P3)
//  - je Zeile Accession, Formular, Tag und Einheit (P13, P15)
//  - eine Einheit je Reihe, keine Mischung von Waehrungen (P13)
//  - Tag-Fallback je Periode auch beim EPS (P12)
//  - Q4 aus Jahr minus drei Quartalen nur abgeleitet und markiert; beim EPS zusaetzlich das frueheste
//    Einreichungsdatum der Quartale, damit die Engine abgeleitete Q4-EPS ueber einen Split verwirft (P4)
//  - neue Reihen: Bruttogewinn (auch Umsatz - Kosten), operatives Ergebnis, Nettoergebnis (Margen)
// Je Periode zaehlt nur die ERSTE Einreichung; spaetere Aenderungen (10-Q/A, Vergleichsspalten)
// koennen keine fruehere Entscheidung veraendern.
//
// Zeile: [periodEnd, value, filed, accn, form, derived(0|1), tag, componentsFiledFrom|null]
export const ROW = Object.freeze({ END: 0, VALUE: 1, FILED: 2, ACCN: 3, FORM: 4, DERIVED: 5, TAG: 6, COMPONENTS_FROM: 7 });
export const SCHEMA = 'vu-sec-pit-mrepl-1.0.0';
export const PERIODIC_FORMS = new Set(['10-Q', '10-Q/A', '10-K', '10-K/A', '10-QT', '10-QT/A', '10-KT', '10-KT/A', '20-F', '20-F/A', '40-F', '40-F/A', '6-K', '6-K/A']);
// Periodenlaengen aus dem Regelbuch (MR-PIT-01), wie validation/sec-pit.mjs#quarterly.
import { P } from './params.mjs';
const QUARTER_DAYS = P['pit.quarterDays'], YEAR_DAYS = P['pit.yearDays'];

export const TAGS = Object.freeze({
  'us-gaap': {
    eps: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'],
    rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'RevenuesNetOfInterestExpense', 'InterestAndDividendIncomeOperating', 'RegulatedAndUnregulatedOperatingRevenue'],
    gp: ['GrossProfit'],
    cost: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfServices'],
    opinc: ['OperatingIncomeLoss'],
    ni: ['NetIncomeLoss', 'ProfitLoss'],
  },
  'ifrs-full': {
    eps: ['DilutedEarningsLossPerShare', 'BasicAndDilutedEarningsLossPerShare', 'BasicEarningsLossPerShare'],
    rev: ['Revenue', 'RevenueFromContractsWithCustomers'],
    gp: ['GrossProfit'],
    cost: ['CostOfSales'],
    opinc: ['ProfitLossFromOperatingActivities'],
    ni: ['ProfitLossAttributableToOwnersOfParent', 'ProfitLoss'],
  },
});

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const isPerShare = (u) => /\/shares$/i.test(u);
const isCurrency = (u) => /^[A-Z]{3}$/.test(u);

// Erstmeldung schlaegt spaetere; bei gleichem Datum Original vor Aenderung, dann kleinere Accession.
function earlier(a, b) {
  if (a.filed !== b.filed) return a.filed < b.filed;
  const aa = /\/A$/.test(a.form || ''), ba = /\/A$/.test(b.form || '');
  if (aa !== ba) return !aa;
  return String(a.accn || '') < String(b.accn || '');
}

// Quartalsreihe einer Kennzahl (eine Einheit) als Erstmeldungen.
export function quarterlyFirst(entries, tag) {
  const q = new Map(), fy = new Map();
  for (const e of entries || []) {
    if (!e || !e.start || !e.end || !Number.isFinite(e.val) || !e.filed || !PERIODIC_FORMS.has(e.form)) continue;
    const d = days(e.start, e.end);
    if (d >= QUARTER_DAYS[0] && d <= QUARTER_DAYS[1]) { const cur = q.get(e.end); if (!cur || earlier(e, cur)) q.set(e.end, e); }
    else if (d >= YEAR_DAYS[0] && d <= YEAR_DAYS[1]) { const k = e.start + '|' + e.end; const cur = fy.get(k); if (!cur || earlier(e, cur)) fy.set(k, e); }
  }
  const rows = new Map();
  for (const e of q.values()) rows.set(e.end, [e.end, e.val, e.filed, e.accn || null, e.form, 0, tag, null, e.start]);
  {
    for (const e of fy.values()) {
      if (rows.has(e.end)) continue;
      const inYear = [...q.values()].filter((x) => x.start >= e.start && x.end < e.end);
      if (inYear.length !== 3) continue;
      const compFrom = inYear.map((x) => x.filed).sort()[0];
      const filed = [e.filed, ...inYear.map((x) => x.filed)].sort().at(-1);
      rows.set(e.end, [e.end, e.val - inYear.reduce((s, x) => s + x.val, 0), filed, e.accn || null, e.form, 1, tag, compFrom, null]);
    }
  }
  return [...rows.values()].map((r) => r.slice(0, 8)).sort((a, b) => a[0].localeCompare(b[0]));
}

// Einheit einer Reihe: bevorzugt USD bzw. USD/shares, sonst die haeufigste passende Einheit.
export function pickUnit(tax, tags, perShare) {
  const count = new Map();
  for (const t of tags) for (const [u, arr] of Object.entries(tax[t]?.units || {})) {
    if (perShare ? !isPerShare(u) : !isCurrency(u)) continue;
    count.set(u, (count.has(u) ? count.get(u) : 0) + (Array.isArray(arr) ? arr.length : 0));
  }
  // Haeufigste Einheit; USD nur bei Gleichstand bevorzugt (Auslandsemittenten berichten mitunter einzelne USD-Werte).
  const pref = perShare ? 'USD/shares' : 'USD';
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] === pref ? -1 : b[0] === pref ? 1 : a[0].localeCompare(b[0])));
  return ranked.length ? ranked[0][0] : null;
}

// Reihe mit Tag-Fallback je Periode (Prioritaetsreihenfolge der Tags).
export function seriesWithFallback(tax, tags, unit) {
  const byEnd = new Map();
  if (!unit) return [];
  for (const t of tags) {
    const arr = tax[t]?.units?.[unit];
    if (!arr) continue;
    for (const r of quarterlyFirst(arr, t)) if (!byEnd.has(r[0])) byEnd.set(r[0], r);
  }
  return [...byEnd.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

// Bruttogewinn: Tag GrossProfit, sonst Umsatz - Kosten bei gleichem Periodenende (sichtbar ab der spaeteren Einreichung).
export function grossProfitSeries(tax, tagset, unit, rev) {
  const direct = seriesWithFallback(tax, tagset.gp, unit);
  const byEnd = new Map(direct.map((r) => [r[0], r]));
  const cost = seriesWithFallback(tax, tagset.cost, unit);
  const revBy = new Map(rev.map((r) => [r[0], r]));
  for (const c of cost) {
    if (byEnd.has(c[0])) continue;
    const r = revBy.get(c[0]);
    if (!r) continue;
    const filed = r[2] > c[2] ? r[2] : c[2];
    byEnd.set(c[0], [c[0], r[1] - c[1], filed, (filed === c[2] ? c[3] : r[3]), (filed === c[2] ? c[4] : r[4]), 1, `${r[6]}-${c[6]}`, null]);
  }
  return [...byEnd.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function extractCompanyFacts(cf) {
  const g = cf?.facts?.['us-gaap'] || {}, ifrs = cf?.facts?.['ifrs-full'] || {};
  const hasAny = (tax, tagset) => [...tagset.eps, ...tagset.rev].some((t) => tax[t]);
  const taxonomy = hasAny(g, TAGS['us-gaap']) ? 'us-gaap' : hasAny(ifrs, TAGS['ifrs-full']) ? 'ifrs-full' : null;
  if (!taxonomy) return { schema: SCHEMA, taxonomy: null, cause: 'NO_EPS_OR_REVENUE_TAG', eps: [], rev: [], gp: [], opinc: [], ni: [], units: {} };
  const tax = taxonomy === 'us-gaap' ? g : ifrs, ts = TAGS[taxonomy];
  const epsUnit = pickUnit(tax, ts.eps, true);
  const curUnit = pickUnit(tax, [...ts.rev, ...ts.gp, ...ts.cost, ...ts.opinc, ...ts.ni], false);
  const eps = seriesWithFallback(tax, ts.eps, epsUnit);
  const rev = seriesWithFallback(tax, ts.rev, curUnit);
  const gp = grossProfitSeries(tax, ts, curUnit, rev);
  const opinc = seriesWithFallback(tax, ts.opinc, curUnit);
  const ni = seriesWithFallback(tax, ts.ni, curUnit);
  return { schema: SCHEMA, taxonomy, cause: eps.length ? null : 'NO_QUARTERLY_EPS', units: { eps: epsUnit, money: curUnit }, eps, rev, gp, opinc, ni };
}
