// Vergleich Ground Truth (SEC, Erstmeldung ueber alle Tags eines Konzepts) gegen VU-Pipelines je Fakt.
// Status je Pipeline: MATCH | MATCH_ACCEPTANCE_DAY (Annahme abends, Einreichungsdatum Folgetag) | LATE | EARLY | MISSING |
// WRONG_VALUE | NOT_COVERED (Pipeline liefert das Konzept nicht). Fehlerkategorie (Taxonomie des Auftrags) je Abweichung.
// node scripts/fundamentals-audit/compare.mjs <gt.jsonl> <js.jsonl> <quant.jsonl> <out.json> [<registry.json>]
import fs from 'node:fs';

const readJsonl = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const key = (r) => `${r.cik}|${r.concept}|${r.end}`;
const DAY = 864e5;
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

export function valuesEqual(concept, a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (concept.startsWith('EPS')) return Math.abs(a - b) <= 0.005 + 1e-9;
  return Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 1e-6);
}

// Registrierte Konzepte je Pipeline (fuer die Ursachenzuordnung).
export const PIPELINE_TAGS = {
  P7: { EPS_DILUTED: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic', 'IncomeLossFromContinuingOperationsPerDilutedShare', 'IncomeLossFromContinuingOperationsPerBasicShare'], REVENUE: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'RevenuesNetOfInterestExpense', 'InterestAndDividendIncomeOperating', 'RegulatedAndUnregulatedOperatingRevenue'] },
  P9: { EPS_DILUTED: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'], REVENUE: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'RevenuesNetOfInterestExpense', 'InterestAndDividendIncomeOperating', 'RegulatedAndUnregulatedOperatingRevenue'], NET_INCOME: ['NetIncomeLoss', 'ProfitLoss'] },
  QUANT: { EPS_DILUTED: ['EarningsPerShareDiluted', 'IncomeLossFromContinuingOperationsPerDilutedShare'], EPS_BASIC: ['EarningsPerShareBasic', 'IncomeLossFromContinuingOperationsPerBasicShare'], REVENUE: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet'], NET_INCOME: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'] },
};

// Ursache einer Abweichung (Taxonomie: TAG_SELECTION, CUSTOM_TAG, PERIOD_MAPPING, YTD_QUARTER, Q4_DERIVATION,
// FILING_VISIBILITY, AMENDMENT, RESTATEMENT, UNIT, CURRENCY, SPLIT, SECURITY_MAPPING, FOREIGN_ISSUER, MISSING_FACT,
// WRONG_CONCEPT, DUPLICATE, OTHER).
export function classify(pipe, gt, got, extra = {}) {
  const accepted = PIPELINE_TAGS[pipe]?.[gt.concept];
  if (!accepted) return { status: 'NOT_COVERED' };
  const gtTags = Object.keys(gt.tagsFirstFiled || {});
  const firstTag = gt.tag;
  if (!got || !Number.isFinite(got.value)) {
    if (gt.quality === 'DERIVED_Q4' || gt.quality === 'DERIVED_YTD') return { status: 'MISSING', category: gt.quality === 'DERIVED_Q4' ? 'Q4_DERIVATION' : 'YTD_QUARTER' };
    if (gtTags.length && gtTags.every((t) => !accepted.includes(t))) return { status: 'MISSING', category: 'WRONG_CONCEPT', detail: 'CONCEPT_NOT_REGISTERED:' + gtTags.join('+') };
    if (pipe === 'P7' && gt.concept === 'EPS_DILUTED' && extra.p7tag && !gtTags.includes(extra.p7tag)) return { status: 'MISSING', category: 'TAG_SELECTION', detail: 'SINGLE_TAG_PER_COMPANY:' + extra.p7tag };
    if (gt.ns === 'ifrs-full') return { status: 'MISSING', category: 'FOREIGN_ISSUER' };
    return { status: 'MISSING', category: 'MISSING_FACT' };
  }
  const known = got.known_from;
  // Periodenzuordnung: die gelieferte Beobachtung gehoert zu einem anderen Periodenende (Kalenderfehler).
  if (got.period_end && Math.abs(dayDiff(gt.end, got.period_end)) > 7 && !(gt.endAliases || []).includes(got.period_end)) return { status: 'WRONG_VALUE', category: 'PERIOD_MAPPING', detail: `period_end ${got.period_end} for ${gt.end}` };
  const sameValue = valuesEqual(gt.concept, got.value, gt.value);
  if (!sameValue) {
    if (Number.isFinite(gt.latest_value) && valuesEqual(gt.concept, got.value, gt.latest_value)) {
      if (known && known >= (gt.latest_filed || '')) return { status: 'WRONG_VALUE', category: 'RESTATEMENT', detail: 'LATEST_VALUE_DATED_LATEST' };
      return { status: 'WRONG_VALUE', category: 'RESTATEMENT', detail: 'LATEST_VALUE_EARLY_DATE_LOOKAHEAD' };
    }
    // Beide abgeleitet (Q4 = FY - Quartale bzw. FY - YTD3): Rundungsdifferenz bis 0,1 % ist kein Fehler.
    if (gt.quality === 'DERIVED_Q4' && got.transformation && got.transformation !== 'AS_REPORTED' && Math.abs(got.value - gt.value) <= Math.max(1, Math.abs(gt.value) * 1e-3)) return { status: 'MATCH', detail: 'DERIVED_ROUNDING' };
    // Anderes Konzept derselben Einreichung (z. B. Umsatz aus Kundenvertraegen statt Gesamtumsatz).
    const usedTag0 = got.concept || got.tag;
    if (gt.multiTagValues && usedTag0 && usedTag0 in gt.multiTagValues && valuesEqual(gt.concept, got.value, gt.multiTagValues[usedTag0])) return { status: 'WRONG_VALUE', category: 'WRONG_CONCEPT', detail: `${usedTag0} instead of ${gt.tag}`, relDiff: gt.value ? (got.value - gt.value) / Math.abs(gt.value) : null };
    if (got.transformation && got.transformation !== 'AS_REPORTED') return { status: 'WRONG_VALUE', category: got.transformation.includes('FY') ? 'Q4_DERIVATION' : 'YTD_QUARTER', detail: got.transformation };
    if (got.concept && !gtTags.includes(got.concept)) return { status: 'WRONG_VALUE', category: 'WRONG_CONCEPT', detail: got.concept };
    if (got.tag && !gtTags.includes(got.tag)) return { status: 'WRONG_VALUE', category: 'WRONG_CONCEPT', detail: got.tag };
    if (gt.quality === 'AMBIGUOUS_VALUES') return { status: 'WRONG_VALUE', category: 'DUPLICATE', detail: 'GT_AMBIGUOUS' };
    if (got.derived || gt.quality !== 'VERIFIED') return { status: 'WRONG_VALUE', category: 'Q4_DERIVATION' };
    return { status: 'WRONG_VALUE', category: 'OTHER' };
  }
  if (!known) return { status: 'MATCH_VALUE_NO_DATE' };
  const d = dayDiff(gt.known_from, known);
  if (d === 0) return { status: 'MATCH' };
  // Annahmezeitpunkt (SEC acceptanceDateTime, ET) gespeichert als UTC-Instant: gleiches Einreichungsdatum -> sichtbar am selben Tag.
  if (Math.abs(d) === 1 && extra.filed === gt.known_from) return { status: 'MATCH', detail: 'ACCEPTANCE_INSTANT_UTC' };
  // Annahme nach Handelsschluss (Freitagabend) -> amtliches Einreichungsdatum ist der naechste Geschaeftstag; veroeffentlicht mit der Annahme.
  if (d < 0 && d >= -4 && extra.filed === gt.known_from) return { status: 'MATCH', detail: 'ACCEPTED_BEFORE_OFFICIAL_FILING_DATE', earlierDays: -d };
  if (d < 0 && gt.derivable_from && known >= gt.derivable_from) return { status: 'MATCH', detail: 'DERIVABLE_FROM_PUBLIC_YTD', earlierDays: -d };
  if (d < 0) {
    // Frueher als die Ground Truth: nur dann ein Lookahead, wenn der Wert in keiner damals veroeffentlichten Einreichung stand.
    // Pipeline nutzte einen Tag ausserhalb des GT-Konzepts (oeffentlich in derselben Einreichung) -> kein Lookahead.
    const usedTag = got.concept || got.tag;
    if (usedTag && !Object.keys(gt.tagsFirstFiled || {}).includes(usedTag)) return { status: 'MATCH', detail: 'EARLIER_VIA_OTHER_PUBLIC_TAG:' + usedTag, earlierDays: -d };
    return { status: 'EARLY', category: 'FILING_VISIBILITY', detail: `${-d}d before SEC first filing` };
  }
  // Spaet: Ursache Tag-Wahl (anderer Tag frueher gemeldet) oder nicht registriertes Konzept.
  const earlyTags = gtTags.filter((t) => gt.tagsFirstFiled[t] === gt.known_from);
  if (earlyTags.length && earlyTags.every((t) => !accepted.includes(t))) return { status: 'LATE', category: 'WRONG_CONCEPT', detail: 'EARLY_TAG_NOT_REGISTERED:' + earlyTags.join('+'), lateDays: d };
  if (earlyTags.length && (got.tag || got.concept) && !earlyTags.includes(got.tag || got.concept)) return { status: 'LATE', category: 'TAG_SELECTION', detail: `${got.tag || got.concept} preferred over ${earlyTags.join('+')}`, lateDays: d };
  if (gt.quality === 'DERIVED_Q4' || got.derived) return { status: 'LATE', category: 'Q4_DERIVATION', lateDays: d };
  return { status: 'LATE', category: 'FILING_VISIBILITY', lateDays: d };
}

export function compareAll(gtRows, jsRows, quantRows) {
  const js = new Map(jsRows.map((r) => [key(r), r]));
  const qt = new Map(quantRows.map((r) => [key(r), r]));
  const seen = new Set(), out = [];
  for (const g of gtRows) {
    const k = key(g); if (seen.has(k)) continue; seen.add(k);
    const j = js.get(k) || {}, q = qt.get(k);
    const gt0 = g; const res = { ticker: g.ticker, cik: g.cik, concept: g.concept, end: g.end, year: g.end.slice(0, 4), gt: { value: g.value, known_from: g.known_from, derivable_from: g.derivable_from || null, form: g.form, tag: g.tag, quality: g.quality, ns: g.ns, accn: g.accn, multiTagValues: g.multiTagValues || null }, pipes: {} };
    if ('P7' in j) res.pipes.P7 = { got: j.P7 && { value: j.P7.value, known_from: j.P7.filed, derived: j.P7.derived }, ...classify('P7', g, j.P7 && { value: j.P7.value, known_from: j.P7.filed, derived: j.P7.derived }, { p7tag: j.P7tag }) };
    else res.pipes.P7 = { status: 'NOT_COVERED' };
    if ('P9' in j) res.pipes.P9 = { got: j.P9 && { value: j.P9.value, known_from: j.P9.filed, tag: j.P9.tag, derived: j.P9.derived }, ...classify('P9', g, j.P9 && { value: j.P9.value, known_from: j.P9.filed, tag: j.P9.tag, derived: j.P9.derived }) };
    else res.pipes.P9 = { status: 'NOT_COVERED' };
    if (q && q.original) {
      const o = q.original;
      const got = { value: o.value, known_from: o.available_from ? o.available_from.slice(0, 10) : null, concept: o.concept, transformation: o.transformation, period_end: o.period_end };
      const c = classify('QUANT', g, got, { filed: o.filed });
      // Sichtbarkeit am Stichtag: Vortag darf nichts zeigen (FALSE_AVAILABLE), Stichtag soll zeigen.
      res.pipes.QUANT = { got, ...c, visibleBefore: !!q.before, visibleAtKnown: !!q.at_known };
      if (q.before && valuesEqual(g.concept, q.before.value, g.value) && c.status !== 'MATCH_ACCEPTANCE_DAY') res.pipes.QUANT.falseAvailable = true;
    } else res.pipes.QUANT = q ? { status: q.status === 'UNPLACEABLE' ? 'MISSING' : 'MISSING', ...classify('QUANT', g, null) , detail2: q.status || null } : { status: 'NOT_RUN' };
    out.push(res);
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('compare.mjs')) {
  const [gtF, jsF, qF, outF] = process.argv.slice(2);
  const rows = compareAll(readJsonl(gtF), readJsonl(jsF), readJsonl(qF));
  fs.writeFileSync(outF, JSON.stringify(rows));
  const tally = {};
  for (const r of rows) for (const [p, v] of Object.entries(r.pipes)) { const k = `${p}|${r.concept}|${v.status}${v.category ? ':' + v.category : ''}`; tally[k] = (tally[k] || 0) + 1; }
  for (const k of Object.keys(tally).sort()) console.log(k.padEnd(70), tally[k]);
}
