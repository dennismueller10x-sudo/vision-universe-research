// EXPLORATIV, NACH dem Ground-Truth-Freeze (nicht praeregistriert, keine Rueckwirkung auf Engine oder Daten):
// Vergleicht die eingefrorene SEC-Extraktion (Tag-Prioritaet je Periode) mit einer Erstmeldung ueber alle EPS-Tags
// hinweg und wertet SEPA fuer die Faelle des Replays auf oeffentlichen SEC-companyfacts aus.
// node scripts/supertrader/ground-truth/explore-sec-tags.mjs --results <results.json> --facts <dir mit cik_<CIK>.json> [--out <f>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCompanyFacts, TAGS, quarterlyFirst, pickUnit } from '../replication/minervini/sec-facts.mjs';
import { evaluateSepa } from '../replication/minervini/sepa.mjs';
import { P } from '../replication/minervini-1.1/params.mjs';

// Erstmeldung je Periodenende ueber alle Tags (fruehestes Einreichungsdatum gewinnt), sonst wie quarterlyFirst.
export function earliestAcrossTags(tax, tags, unit) {
  const byEnd = new Map();
  for (const t of tags) { const arr = tax[t]?.units?.[unit]; if (!arr) continue; for (const r of quarterlyFirst(arr, t)) { const c = byEnd.get(r[0]); if (!c || r[2] < c[2]) byEnd.set(r[0], r); } }
  return [...byEnd.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function compareCase(cf, execDate) {
  const f = extractCompanyFacts(cf);
  const g = cf.facts?.['us-gaap'] || {};
  const unit = pickUnit(g, TAGS['us-gaap'].eps, true);
  const f2 = { ...f, eps: earliestAcrossTags(g, TAGS['us-gaap'].eps, unit), rev: earliestAcrossTags(g, TAGS['us-gaap'].rev, 'USD') };
  const a = evaluateSepa(f, execDate, () => 1, P), b = evaluateSepa(f2, execDate, () => 1, P);
  return { frozen: a.reason || 'ok', earliestAcrossTags: b.reason || 'ok', quarterEnd: b.facts?.quarterEnd ?? null, epsGrowth: b.facts?.epsGrowth ?? null, epsGrowthPrev: b.facts?.epsGrowthPrev ?? null, revGrowth: b.facts?.revGrowth ?? null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2); const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const here = path.dirname(fileURLToPath(import.meta.url));
  const res = JSON.parse(fs.readFileSync(arg('--results'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.resolve(here, '../fidelity/MINERVINI-GROUND-TRUTH-CASES.json'), 'utf8')).cases;
  const nextDay = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
  const out = [];
  for (const c of res.cases) {
    const cik = meta.find((x) => x.case_id === c.case_id)?.identity?.expected_cik, p = c.replay || {};
    const file = cik && path.join(arg('--facts'), `cik_${cik}.json`);
    if (!p.evaluatedClose || !file || !fs.existsSync(file)) continue;
    const exec = p.anchorDate || nextDay(p.evaluatedClose);
    out.push({ case_id: c.case_id, ticker: c.ticker, group: c.group, exec, replay: p.sepa?.reason || 'ok', ...compareCase(JSON.parse(fs.readFileSync(file, 'utf8')), exec) });
  }
  const s = JSON.stringify({ label: 'EXPLORATIV nach dem Freeze; oeffentliche SEC-companyfacts; Split-Verhaeltnis 1 angenommen (keine Splits zwischen den Einreichungen der betroffenen Faelle)', cases: out }, null, 1);
  if (arg('--out')) fs.writeFileSync(arg('--out'), s + '\n'); else console.log(s);
}
