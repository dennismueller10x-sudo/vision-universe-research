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
  REVENUE: { tags: ['Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax'], unitRe: /^[A-Z]{3}$/, additive: true },
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
  // Dasselbe Geschaeftsquartal wird mitunter mit leicht abweichendem Periodenende gemeldet (52/53-Wochen-Rundung,
  // spaetere Vergleichsspalten): Enden innerhalb von 7 Tagen bilden EIN Quartal (fruehestes Ende als Schluessel).
  const ends = [...byEnd.keys()].sort();
  for (let i = 1; i < ends.length; i++) {
    const prev = ends.slice(0, i).reverse().find((e) => byEnd.has(e));
    if (prev && dur(prev, ends[i]) <= 7) { byEnd.get(prev).push(...byEnd.get(ends[i]).map((f) => ({ ...f, endAlias: ends[i] }))); byEnd.delete(ends[i]); }
  }
  const out = new Map();
  for (const [end, arr] of byEnd) {
    // Erstmeldung = frueheste Einreichung; innerhalb DIESER Einreichung entscheidet die Konzeptrangfolge
    // (REVENUE: Revenues = Gesamtumsatz laut US-GAAP-Taxonomie vor dem Teilbetrag aus Kundenvertraegen ASC 606).
    const order = CONCEPTS[conceptId].tags;
    const rank = (x) => { const i = order.indexOf(x.tag); return i < 0 ? 99 : i; };
    const firstFiling = first(arr).accn;
    const sameFiling = arr.filter((x) => x.accn === firstFiling).sort((a, b) => rank(a) - rank(b));
    const f0 = sameFiling[0], fl = last(arr);
    const byTag = new Map(sameFiling.map((x) => [x.tag, x.val]));
    const ambiguous = [...byTag.values()].length > 1 && new Set([...byTag.values()]).size > 1 && new Set(sameFiling.filter((x) => x.tag === f0.tag).map((x) => x.val)).size > 1;
    const multiTag = new Set([...byTag.values()]).size > 1 ? Object.fromEntries(byTag) : null;
    const tagsFirst = {};
    for (const x of arr) if (!tagsFirst[x.tag] || x.filed < tagsFirst[x.tag]) tagsFirst[x.tag] = x.filed;
    const aliases = [...new Set(arr.map((x) => x.endAlias).filter(Boolean))];
    out.set(end, { end, endAliases: aliases, start: f0.start, value: f0.val, known_from: f0.filed, accn: f0.accn, form: f0.form, tag: f0.tag, fy: f0.fy ?? null, fp: f0.fp ?? null, latest_value: fl.val, latest_filed: fl.filed, quality: ambiguous ? 'AMBIGUOUS_VALUES' : 'VERIFIED', multiTagValues: multiTag, tagsFirstFiled: tagsFirst, ns, unit });
  }
  if (CONCEPTS[conceptId].additive) {
    // Q4 = FY - Q1..Q3 (Erstmeldungen), nur wenn kein Einzelquartal gemeldet.
    // Q4-Ableitung nur innerhalb DESSELBEN Tags (kein Mischen von Gesamt- und Teilumsatz ueber Perioden):
    // bevorzugt FY - YTD9M (gleicher Beginn), sonst FY - Q1..Q3, wenn alle drei unter demselben Tag gemeldet sind.
    for (const [k, arr] of fyBy) {
      const [s, e] = k.split('|');
      if (out.has(e)) continue;
      const tagOrder = CONCEPTS[conceptId].tags;
      let best = null;
      for (const tag of tagOrder) {
        const fys = arr.filter((x) => x.tag === tag);
        if (!fys.length) continue;
        const f0 = first(fys);
        const y9 = (ytd.get(s + '|' + [...ytd.keys()].map((kk) => kk.split('|')[1]).filter((ee) => ee < e && dur(ee, e) >= 80 && dur(ee, e) <= 100 && ytd.has(s + '|' + ee))[0]) || []).filter((x) => x.tag === tag);
        if (y9.length) { const y0 = first(y9); best = { value: f0.val - y0.val, known_from: [f0.filed, y0.filed].sort().at(-1), f0 }; break; }
        const qs = facts.filter((x) => x.tag === tag && isQ(x) && x.start >= s && x.end < e);
        const qByEnd = new Map(); for (const x of qs) { const c = qByEnd.get(x.end); if (!c || firstOf(x, c)) qByEnd.set(x.end, x); }
        if (qByEnd.size === 3) { const q3 = [...qByEnd.values()]; best = { value: f0.val - q3.reduce((a, x) => a + x.val, 0), known_from: [f0.filed, ...q3.map((x) => x.filed)].sort().at(-1), f0 }; break; }
      }
      if (!best) continue;
      out.set(e, { end: e, start: null, value: best.value, known_from: best.known_from, accn: best.f0.accn, form: best.f0.form, tag: best.f0.tag, fy: best.f0.fy ?? null, fp: 'Q4', latest_value: null, latest_filed: null, quality: 'DERIVED_Q4', tagsFirstFiled: {}, ns, unit });
    }
    // Quartal nur aus YTD: YTD(n) - YTD(n-1) mit gleichem Beginn.
    const ytdList = [...ytd.entries()].map(([k, arr]) => ({ s: k.split('|')[0], e: k.split('|')[1], f0: first(arr) }));
    for (const a of ytdList) for (const b of ytdList) {
      if (a.s !== b.s || !(b.e < a.e)) continue;
      const d = dur(b.e, a.e); if (d < 80 || d > 100 || out.has(a.e)) continue;
      out.set(a.e, { end: a.e, start: b.e, value: a.f0.val - b.f0.val, known_from: [a.f0.filed, b.f0.filed].sort().at(-1), accn: a.f0.accn, form: a.f0.form, tag: a.f0.tag, fy: a.f0.fy ?? null, fp: a.f0.fp ?? null, latest_value: null, latest_filed: null, quality: 'DERIVED_YTD', tagsFirstFiled: {}, ns, unit });
    }
  }
  // Fruehester Zeitpunkt, zu dem der Quartalswert aus oeffentlichen periodischen Berichten ABLEITBAR war
  // (additive Groessen): YTD(S,e) - YTD(S,s-1) mit gleichem Beginn, oder FY - YTD9M, oder FY - Q1 - Q2 - Q3.
  // Ein Wert, den eine Pipeline vor known_from, aber nicht vor derivable_from zeigt, ist KEIN Lookahead.
  if (CONCEPTS[conceptId].additive) {
    const cum = new Map(); // start -> [{end, filed, val}]
    for (const f of facts) if (f.start && !isQ(f)) { const a = cum.get(f.start) || cum.set(f.start, []).get(f.start); a.push(f); }
    for (const [s0, arr] of byEnd) void s0;
    for (const q of out.values()) {
      if (!q.start && q.quality !== 'DERIVED_Q4') continue;
      let best = q.known_from;
      for (const [S, arr] of cum) {
        const atEnd = arr.filter((f) => Math.abs(dur(f.end, q.end)) <= 7);
        if (!atEnd.length) continue;
        const qStart = q.start || null;
        // Vorperiode endet am Tag vor dem Quartalsbeginn (+-7 Tage); bei Q1 ist YTD(S,e) selbst das Quartal.
        const prev = qStart ? arr.filter((f) => Math.abs(dur(f.end, qStart) + 1) <= 7) : [];
        const e1 = atEnd.reduce((a, b) => (b.filed < a.filed ? b : a));
        if (qStart && Math.abs(dur(S, qStart)) <= 7) { if (e1.filed < best) best = e1.filed; continue; }
        if (!qStart) {
          // Abgeleitetes Q4 ohne Beginn: FY(S,e) - YTD(S, e - 80..100 Tage).
          const ytd9 = arr.filter((f) => { const d = dur(f.end, q.end); return d >= 80 && d <= 100; });
          if (!ytd9.length) continue;
          const y1 = ytd9.reduce((a, b) => (b.filed < a.filed ? b : a));
          const when = e1.filed > y1.filed ? e1.filed : y1.filed;
          if (when < best) best = when;
          continue;
        }
        if (!prev.length) continue;
        const p1 = prev.reduce((a, b) => (b.filed < a.filed ? b : a));
        const when = e1.filed > p1.filed ? e1.filed : p1.filed;
        if (when < best) best = when;
      }
      q.derivable_from = best;
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
