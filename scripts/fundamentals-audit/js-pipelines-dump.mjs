// Audit-Harness: fuehrt die JS-Parser (unveraendert) auf denselben lokalen SEC-companyfacts aus.
//   P7 = scripts/supertrader/validation/sec-pit.mjs#extractFactsR12 (main, Validierungsstore sec-pit-r12)
//   P9 = scripts/supertrader/replication/minervini/sec-facts.mjs#extractCompanyFacts (Branch PR #471/#475, per --branch)
// Je Ground-Truth-Quartal: Wert und Erstmeldedatum, die der Parser fuer genau dieses Periodenende liefert.
// node scripts/fundamentals-audit/js-pipelines-dump.mjs <issuers.json> <cf-dir> <gt.jsonl> <out.jsonl> [--branch <worktree>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCompanyFacts } from './sec-ground-truth.mjs';
import { extractFactsR12 } from '../supertrader/validation/sec-pit.mjs';

const argv = process.argv.slice(2);
const [issuersPath, cfDir, gtPath, outPath] = argv;
const bi = argv.indexOf('--branch');
const branch = bi >= 0 ? await import(pathToFileURL(path.join(argv[bi + 1], 'scripts/supertrader/replication/minervini/sec-facts.mjs')).href) : null;

const gtBy = new Map();
for (const line of fs.readFileSync(gtPath, 'utf8').split('\n')) { if (!line) continue; const r = JSON.parse(line); (gtBy.get(r.cik) || gtBy.set(r.cik, []).get(r.cik)).push(r); }
const out = fs.createWriteStream(outPath);
for (const [ticker, cik] of JSON.parse(fs.readFileSync(issuersPath, 'utf8'))) {
  const p = path.join(cfDir, `CIK${String(cik).padStart(10, '0')}.json.gz`);
  if (!fs.existsSync(p)) continue;
  const cf = loadCompanyFacts(p);
  const p7 = extractFactsR12(cf);
  const p9 = branch ? branch.extractCompanyFacts(cf) : null;
  const idx = (rows, filedAt, valAt) => new Map((rows || []).map((r) => [r[0], { value: r[valAt === undefined ? 1 : valAt], filed: r[filedAt], derived: r[3] }]));
  const P7 = { EPS_DILUTED: idx(p7.eps, 2), REVENUE: idx(p7.rev, 2) };
  const P9 = p9 ? { EPS_DILUTED: new Map(p9.eps.map((r) => [r[0], { value: r[1], filed: r[2], tag: r[6], derived: r[5] }])), REVENUE: new Map(p9.rev.map((r) => [r[0], { value: r[1], filed: r[2], tag: r[6], derived: r[5] }])), NET_INCOME: new Map(p9.ni.map((r) => [r[0], { value: r[1], filed: r[2], tag: r[6], derived: r[5] }])) } : {};
  for (const g of gtBy.get(cik) || []) {
    const rec = { ticker, cik, concept: g.concept, end: g.end };
    const pick = (m) => [g.end, ...(g.endAliases || [])].map((e) => m.get(e)).find(Boolean) || null;
    if (P7[g.concept]) rec.P7 = pick(P7[g.concept]);
    if (P7[g.concept] && g.concept === 'EPS_DILUTED') rec.P7tag = p7.epsTag;
    if (P9[g.concept]) rec.P9 = pick(P9[g.concept]);
    out.write(JSON.stringify(rec) + '\n');
  }
}
out.end();
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) console.log('done');
