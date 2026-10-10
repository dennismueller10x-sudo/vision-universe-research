// Schreibt FUNDAMENTAL-GROUND-TRUTH.json (Datensatz, Methode, Raten) und FUNDAMENTAL-ERRORS.json (bestaetigte Fehler mit
// SEC-Belegen) aus den Audit-Zwischenergebnissen. node build-artifacts.mjs <work-dir> <out-dir> <phase-label>
import fs from 'node:fs';
import path from 'node:path';

const [W, OUT, label] = process.argv.slice(2);
const cmp = JSON.parse(fs.readFileSync(path.join(W, 'cmp.json'), 'utf8'));
const rates = JSON.parse(fs.readFileSync(path.join(W, 'rates.json'), 'utf8'));
const issuers = JSON.parse(fs.readFileSync(path.join(W, 'issuers.json'), 'utf8'));
const types = JSON.parse(fs.readFileSync(path.join(W, 'issuer-types.json'), 'utf8'));
const mism = [];
for (const r of cmp) for (const [pipe, v] of Object.entries(r.pipes)) if (!['MATCH', 'NOT_COVERED', 'NOT_RUN'].includes(v.status)) mism.push({ pipe, ticker: r.ticker, cik: r.cik, concept: r.concept, end: r.end, status: v.status, category: v.category || null, detail: v.detail || null, sec: { value: r.gt.value, known_from: r.gt.known_from, derivable_from: r.gt.derivable_from, form: r.gt.form, accn: r.gt.accn, tag: r.gt.tag, quality: r.gt.quality }, vu: v.got || null });
const gtOut = {
  schema: 'vu-fundamental-ground-truth-1.0.0', label,
  source: 'SEC data.sec.gov companyfacts + submissions (Primaerquelle), abgerufen 2026-10-07; Filing-XBRL nur fuer den GDDY-Dimensionsbefund',
  method: {
    extractor: 'scripts/fundamentals-audit/sec-ground-truth.mjs (importiert keinen VU-Parser)',
    concepts: { EPS_DILUTED: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'], EPS_BASIC: ['EarningsPerShareBasic', 'EarningsPerShareBasicAndDiluted'], NET_INCOME: ['NetIncomeLoss'], REVENUE: ['Revenues (Gesamtumsatz, Vorrang in derselben Einreichung)', 'SalesRevenueNet', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax'] },
    knownFrom: 'frueheste periodische Einreichung (10-K/10-Q/20-F/40-F/6-K, /A), die den Wert fuer genau dieses Quartal unter irgendeinem Tag des Konzepts meldet; Quartalsenden innerhalb 7 Tagen = ein Quartal',
    derivableFrom: 'fruehester Zeitpunkt, zu dem der Wert aus oeffentlichen kumulierten Werten ableitbar war (YTD-Differenz, FY - 9M); fruehere Sichtbarkeit nur dann Lookahead, wenn vor derivable_from',
    q4: 'additive Groessen: FY - Q1..Q3 bzw. FY - 9M; EPS wird nicht abgeleitet (nicht additiv)',
    limitations: ['companyfacts enthaelt nur Fakten ohne Dimension (z. B. GDDY-EPS je Aktiengattung fehlt fuer ALLE Pipelines)', 'Konzeptdefinition ist eine Audit-Festlegung; abweichende, wirtschaftlich gleichwertige Tags werden als EARLIER_VIA_OTHER_PUBLIC_TAG gewertet, nicht als Fehler', 'FRC (First Republic) companyfacts nicht abrufbar'],
  },
  sample: { issuers: issuers.length - 1, issuersWithData: new Set(cmp.map((r) => r.cik)).size, facts: cmp.length, byConcept: cmp.reduce((a, r) => { a[r.concept] = (a[r.concept] || 0) + 1; return a; }, {}), issuerTypes: types, selection: 'Pflichtfaelle (TNDM, RVNC, REPL, RICK, GDDY), Kontrollen (AAPL, NVDA, MSFT, AMZN, META, PLTR), Tagwechsel, Geschaeftsjahr != Kalenderjahr, Verlust<->Gewinn, Splits/Reverse Splits, Restatements, Auslandsemittenten, Delistings/M&A, Tickerwechsel, Small Caps, Banken/Versicherer/REIT/BDC/Partnerships/SPAC, Aktiengattungen' },
  pipelines: { QUANT: 'P1 Quant-SEC-Kern (normalize/PeriodResolver, POLICY_ORIGINAL fuer Erstmeldung, AS_OF_LATEST am Stichtag)', P7: 'sec-pit.mjs extractFactsR12 (main, Supertrader-Validierung)', P9: 'sec-facts.mjs extractCompanyFacts (Branch PR #471/#475)' },
  rates,
};
fs.writeFileSync(path.join(OUT, 'FUNDAMENTAL-GROUND-TRUTH.json'), JSON.stringify(gtOut, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'FUNDAMENTAL-GROUND-TRUTH-MISMATCHES.json'), JSON.stringify({ schema: 'vu-fundamental-mismatches-1.0.0', label, count: mism.length, mismatches: mism }) + '\n');
console.log('mismatches', mism.length);
