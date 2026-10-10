// Fehlerquoten je Pipeline x Kennzahl x Jahr x Emittententyp aus compare.mjs-Ergebnis (nicht nur eine Gesamtzahl).
// Kennzahlen: factAccuracy (Wert UND Erstmeldedatum korrekt), valueAccuracy, pitAccuracy (wenn Wert vorhanden: Datum korrekt),
// falseMissingRate (MISSING + LATE), falseAvailableRate (EARLY = Lookahead), wrongValueRate; Basis = GT-Fakten.
// node scripts/fundamentals-audit/error-rates.mjs <cmp.json> <issuer-types.json> <out.json>
import fs from 'node:fs';

const OK = new Set(['MATCH']);
export function rates(rows) {
  const n = rows.length;
  const c = (f) => rows.filter(f).length;
  const covered = rows.filter((r) => r.status !== 'NOT_COVERED' && r.status !== 'NOT_RUN');
  const m = covered.length;
  const cc = (f) => covered.filter(f).length;
  const withValue = covered.filter((r) => ['MATCH', 'LATE', 'EARLY'].includes(r.status));
  const r3 = (x, d) => (d ? Math.round((x / d) * 10000) / 10000 : null);
  return {
    facts: n, covered: m,
    factAccuracy: r3(cc((r) => OK.has(r.status)), m),
    valueAccuracy: r3(cc((r) => ['MATCH', 'LATE', 'EARLY'].includes(r.status)), m),
    pitAccuracy: r3(withValue.filter((r) => r.status === 'MATCH').length, withValue.length),
    falseMissingRate: r3(cc((r) => r.status === 'MISSING' || r.status === 'LATE'), m),
    missingRate: r3(cc((r) => r.status === 'MISSING'), m),
    lateRate: r3(cc((r) => r.status === 'LATE'), m),
    falseAvailableRate: r3(cc((r) => r.status === 'EARLY'), m),
    wrongValueRate: r3(cc((r) => r.status === 'WRONG_VALUE'), m),
    byCategory: Object.fromEntries(Object.entries(covered.reduce((a, r) => { if (r.category) a[r.category] = (a[r.category] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])),
    issuersAffected: new Set(covered.filter((r) => !OK.has(r.status)).map((r) => r.ticker)).size,
  };
}

if (process.argv[1] && process.argv[1].endsWith('error-rates.mjs')) {
  const [cmpF, typesF, outF] = process.argv.slice(2);
  const cmp = JSON.parse(fs.readFileSync(cmpF, 'utf8'));
  const types = fs.existsSync(typesF) ? JSON.parse(fs.readFileSync(typesF, 'utf8')) : {};
  const flat = [];
  for (const r of cmp) for (const [pipe, v] of Object.entries(r.pipes)) flat.push({ pipe, ticker: r.ticker, concept: r.concept, year: r.year, form: r.gt.form, quality: r.gt.quality, type: types[r.ticker] || 'OTHER', status: v.status, category: v.category || null });
  const group = (keyFn) => { const g = {}; for (const x of flat) { const k = keyFn(x); (g[k] ||= []).push(x); } return Object.fromEntries(Object.entries(g).sort().map(([k, v]) => [k, rates(v)])); };
  const out = {
    byPipelineMetric: group((x) => `${x.pipe}|${x.concept}`),
    byPipelineYearBucket: group((x) => `${x.pipe}|${x.year < '2011' ? '2009-2010' : x.year < '2015' ? '2011-2014' : x.year < '2020' ? '2015-2019' : '2020-2026'}`),
    byPipelineYear: group((x) => `${x.pipe}|${x.year}`),
    byPipelineIssuerType: group((x) => `${x.pipe}|${x.type}`),
    byPipelineForm: group((x) => `${x.pipe}|${x.form}`),
  };
  fs.writeFileSync(outF, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out.byPipelineMetric)) if (v.covered) console.log(k.padEnd(22), JSON.stringify({ n: v.covered, fact: v.factAccuracy, value: v.valueAccuracy, pit: v.pitAccuracy, falseMissing: v.falseMissingRate, falseAvail: v.falseAvailableRate, wrong: v.wrongValueRate, issuers: v.issuersAffected }));
}
