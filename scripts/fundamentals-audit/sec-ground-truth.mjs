// SEC-Ground-Truth fuer Fundamentaldaten (Audit, unabhaengig vom VU-Code: importiert keinen VU-Parser).
//
// Quelle: SEC companyfacts (data.sec.gov/api/xbrl/companyfacts), je Fakt mit accn, form, filed, fy, fp, start, end.
// Wirtschaftliche Konzepte statt Tags:
//   EPS_DILUTED  = EarningsPerShareDiluted | EarningsPerShareBasicAndDiluted   (beide berichten verwaesserten EPS)
//   EPS_BASIC    = EarningsPerShareBasic   | EarningsPerShareBasicAndDiluted
//   NET_INCOME   = NetIncomeLoss (Anteil der Aktionaere; ProfitLoss enthaelt Minderheiten -> anderes Konzept)
//   REVENUE      = Revenues | RevenueFromContractWithCustomerExcludingAssessedTax | ...IncludingAssessedTax | SalesRevenueNet
//                  (Gesamtumsatz; Finanz-/Spezialtags werden NICHT gemischt, sondern getrennt ausgewiesen)
// Point-in-time je Quartal (Periodenende, 3-Monats-Dauer 80-100 Tage):
//   known_from  = fruehestes Einreichungsdatum eines periodischen Berichts, der den Wert fuer genau diese Periode
//                 unter IRGENDEINEM Tag des Konzepts meldet (Erstmeldung ueber Tags hinweg)
//   as_reported = Wert dieser Erstmeldung; latest = Wert der juengsten Einreichung (restated-Sicht)
//   Q4 ohne Einzelmeldung: FY (Dauer 350-380 Tage) - Q1..Q3 derselben Erstmeldungen, known_from = spaeteste der vier
//   Einreichungen, nur wenn alle drei Quartale vorliegen (Kennzeichen DERIVED_Q4). EPS-Q4 wird NICHT abgeleitet
//   (nicht additiv bei wechselnder Aktienzahl) -> fehlt, wenn nicht gemeldet.
//   Ein Quartal nur aus YTD (6M/9M) ableitbar: Kennzeichen DERIVED_YTD (nur fuer additive Groessen).
// Ausgabe je Fakt: cik, concept, end, start, value_as_reported, known_from, accn, form, tag, fy, fp, latest_value,
// latest_filed, quality (VERIFIED | DERIVED_Q4 | DERIVED_YTD | AMBIGUOUS_VALUES), alle Tags mit Erstmeldung.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONCEPTS = Object.freeze({
  EPS_DILUTED: { tags: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'], unitRe: /\/shares$/i, additive: false },
  EPS_BASIC: { tags: ['EarningsPerShareBasic', 'EarningsPerShareBasicAndDiluted'], unitRe: /\/shares$/i, additive: false },
  NET_INCOME: { tags: ['NetIncomeLoss'], unitRe: /^[A-Z]{3}$/, additive: true },
  REVENUE: { tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'], unitRe: /^[A-Z]{3}$/, additive: true },
});
export const PERIODIC = new Set(['10-Q', '10-Q/A', '10-K', '10-K/A', '10-KT', '10-KT/A', '10-QT', '10-QT/A', '20-F', '20-F/A', '40-F', '40-F/A', '6-K', '6-K/A', '10-KSB', '10-QSB', '10-KSB/A', '10-QSB/A']);
const DAY = 864e5;
const dur = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const isQ = (f) => f.start && dur(f.start, f.end) >= 80 && dur(f.start, f.end) <= 100;
const isFY = (f) => f.start && dur(f.start, f.end) >= 350 && dur(f.start, f.end) <= 380;
const firstOf = (a, b) => (a.filed !== b.filed ? a.filed < b.filed : (/\/A$/.test(a.form) !== /\/A$/.test(b.form) ? !/\/A$/.test(a.form) : a.accn < b.accn));

// Alle Fakten eines Konzepts (us-gaap; ifrs-full nur, wenn keine us-gaap-Fakten) in einer Einheit.
export function conceptFacts(cf, conceptId) {
  const c = CONCEPTS[conceptId];
  for (const ns of ['us-gaap', 'ifrs-full']) {
    const tax = cf.facts?.[ns]; if (!tax) continue;
    const tags = ns === 'us-gaap' ? c.tags : IFRS_MAP[conceptId] || [];
    const byUnit = new Map();
    for (const t of tags) for (const [u, arr] of Object.entries(tax[t]?.units || {})) {
      if (!c.unitRe.test(u)) continue;
      for (const f of arr) if (f && f.end && Number.isFinite(f.val) && f.filed && PERIODIC.has(f.form)) (byUnit.get(u) || byUnit.set(u, []).get(u)).push({ ...f, tag: t, ns, unit: u });
    }
    if (byUnit.size) {
      const [unit, facts] = [...byUnit.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      return { ns, unit, facts, otherUnits: [...byUnit.keys()].filter((u) => u !== unit) };
    }
  }
  return { ns: null, unit: null, facts: [], otherUnits: [] };
}
const IFRS_MAP = { EPS_DILUTED: ['DilutedEarningsLossPerShare', 'BasicAndDilutedEarningsLossPerShare'], EPS_BASIC: ['BasicEarningsLossPerShare', 'BasicAndDilutedEarningsLossPerShare'], NET_INCOME: ['ProfitLossAttributableToOwnersOfParent'], REVENUE: ['Revenue', 'RevenueFromContractsWithCustomers'] };

// Quartalsreihe (Ground Truth) eines Konzepts.
export function groundTruthQuarters(cf, conceptId) {
  const { ns, unit, facts } = conceptFacts(cf, conceptId);
  const byEnd = new Map(), fyBy = new Map(), ytd = new Map();
  for (const f of facts) {
    if (isQ(f)) { const k = f.end; (byEnd.get(k) || byEnd.set(k, []).get(k)).push(f); }
    else if (isFY(f)) { const k = f.start + '|' + f.end; (fyBy.get(k) || fyBy.set(k, []).get(k)).push(f); }
    else if (f.start) { const k = f.start + '|' + f.end; (ytd.get(k) || ytd.set(k, []).get(k)).push(f); }
  }
  const first = (arr) => arr.reduce((a, b) => (firstOf(b, a) ? b : a));
  const last = (arr) => arr.reduce((a, b) => (b.filed > a.filed || (b.filed === a.filed && b.accn > a.accn) ? b : a));
  const out = new Map();
  for (const [end, arr] of byEnd) {
    const f0 = first(arr), fl = last(arr);
    const sameFiling = arr.filter((x) => x.accn === f0.accn);
    const ambiguous = new Set(sameFiling.map((x) => x.val)).size > 1;
    const tagsFirst = {};
    for (const x of arr) if (!tagsFirst[x.tag] || x.filed < tagsFirst[x.tag]) tagsFirst[x.tag] = x.filed;
    out.set(end, { end, start: f0.start, value: f0.val, known_from: f0.filed, accn: f0.accn, form: f0.form, tag: f0.tag, fy: f0.fy ?? null, fp: f0.fp ?? null, latest_value: fl.val, latest_filed: fl.filed, quality: ambiguous ? 'AMBIGUOUS_VALUES' : 'VERIFIED', tagsFirstFiled: tagsFirst, ns, unit });
  }
  if (CONCEPTS[conceptId].additive) {
    // Q4 = FY - Q1..Q3 (Erstmeldungen), nur wenn kein Einzelquartal gemeldet.
    for (const [k, arr] of fyBy) {
      const [s, e] = k.split('|');
      if (out.has(e)) continue;
      const qs = [...out.values()].filter((q) => q.start >= s && q.end < e && q.quality !== 'DERIVED_Q4');
      if (qs.length !== 3) continue;
      const f0 = first(arr);
      const kf = [f0.filed, ...qs.map((q) => q.known_from)].sort().at(-1);
      out.set(e, { end: e, start: null, value: f0.val - qs.reduce((a, q) => a + q.value, 0), known_from: kf, accn: f0.accn, form: f0.form, tag: f0.tag, fy: f0.fy ?? null, fp: 'Q4', latest_value: null, latest_filed: null, quality: 'DERIVED_Q4', tagsFirstFiled: {}, ns, unit });
    }
    // Quartal nur aus YTD: YTD(n) - YTD(n-1) mit gleichem Beginn.
    const ytdList = [...ytd.entries()].map(([k, arr]) => ({ s: k.split('|')[0], e: k.split('|')[1], f0: first(arr) }));
    for (const a of ytdList) for (const b of ytdList) {
      if (a.s !== b.s || !(b.e < a.e)) continue;
      const d = dur(b.e, a.e); if (d < 80 || d > 100 || out.has(a.e)) continue;
      out.set(a.e, { end: a.e, start: b.e, value: a.f0.val - b.f0.val, known_from: [a.f0.filed, b.f0.filed].sort().at(-1), accn: a.f0.accn, form: a.f0.form, tag: a.f0.tag, fy: a.f0.fy ?? null, fp: a.f0.fp ?? null, latest_value: null, latest_filed: null, quality: 'DERIVED_YTD', tagsFirstFiled: {}, ns, unit });
    }
  }
  return [...out.values()].sort((a, b) => a.end.localeCompare(b.end));
}

export function loadCompanyFacts(file) {
  const buf = fs.readFileSync(file);
  return JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [file, concept] = process.argv.slice(2);
  const cf = loadCompanyFacts(file);
  for (const q of groundTruthQuarters(cf, concept || 'EPS_DILUTED')) console.log(JSON.stringify(q));
}
