// Diagnose fuer die eingefrorenen Minervini-Faelle: SEPA (eingefrorenes Modul, unveraendert) unter drei Datenstaenden
// am selben Ausfuehrungstag: P9 (Research-Parser, oeffentliche companyfacts), Kern vor dem Fix, Kern nach dem Fix;
// dazu SEC-GAAP-EPS des juengsten sichtbaren Quartals und des Vorjahresquartals aus der Ground Truth.
// node minervini-sepa-diagnosis.mjs <gt-branch-worktree> <work-dir> <out.json> [--window <tage>]
// --window: SEPA zusaetzlich an jedem Kalendertag exec +- tage unter P9 und Kern-nachher vergleichen (Timing-Toleranz der
// eingefrorenen Bewertung: 12 Tage). Abweichende Tage werden je Fall ausgegeben.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCompanyFacts, groundTruthQuarters } from './sec-ground-truth.mjs';

const [WT, W, OUT] = process.argv.slice(2);
const WINDOW = process.argv.includes('--window') ? Number(process.argv[process.argv.indexOf('--window') + 1]) : 0;
const shiftDay = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const imp = (p) => import(pathToFileURL(path.join(WT, p)).href);
const { extractCompanyFacts } = await imp('scripts/supertrader/replication/minervini/sec-facts.mjs');
const { evaluateSepa } = await imp('scripts/supertrader/replication/minervini/sepa.mjs');
const { P } = await imp('scripts/supertrader/replication/minervini-1.1/params.mjs');
const cases = JSON.parse(fs.readFileSync(path.join(W, 'gt-cases.json'), 'utf8')).cases;
const res = JSON.parse(fs.readFileSync(path.join(W, 'gt-results.json'), 'utf8')).cases;
const before = JSON.parse(fs.readFileSync(path.join(W, 'sepa-fund-before.json'), 'utf8')).byCik;
const after = JSON.parse(fs.readFileSync(path.join(W, 'sepa-fund-after.json'), 'utf8')).byCik;
const one = () => 1; // Split-Verhaeltnis 1 (kein Split zwischen den verglichenen Einreichungen dieser Faelle; siehe Bericht)
const nextDay = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const asFund = (r) => r && { eps: r.eps, rev: r.rev, gp: r.gp, opinc: r.opinc, ni: r.ni };
const out = [];
for (const c of cases.filter((x) => ['MAIN', 'SENSITIVITY', 'WATCHLIST', 'ENTRY_TYPE_NOT_MODELLED'].includes(x.evaluation_group))) {
  const r = res.find((x) => x.case_id === c.case_id);
  const rp = r?.replay;
  if (!rp || !rp.evaluatedClose) { out.push({ case_id: c.case_id, ticker: c.ticker, group: c.evaluation_group, frozenDecision: rp?.decision || null, reason: rp?.reason || null }); continue; }
  const exec = rp.anchorDate || nextDay(rp.evaluatedClose);
  const cik = Number(c.identity.expected_cik);
  const file = path.join(W, 'cf', `CIK${String(cik).padStart(10, '0')}.json.gz`);
  const cf = fs.existsSync(file) ? loadCompanyFacts(file) : null;
  const p9 = cf ? evaluateSepa(extractCompanyFacts(cf), exec, one, P) : null;
  const b = evaluateSepa(asFund(before[String(cik)]) || null, exec, one, P);
  const a = evaluateSepa(asFund(after[String(cik)]) || null, exec, one, P);
  // SEC-GAAP: juengstes bis exec sichtbares Quartal (known_from < exec) und Vorjahresquartal
  let gaap = null;
  if (cf) {
    const q = groundTruthQuarters(cf, 'EPS_DILUTED').filter((x) => x.known_from < exec);
    const q0 = q.at(-1);
    if (q0) {
      const py = q.find((x) => Math.abs((Date.parse(q0.end) - Date.parse(x.end)) / 864e5 - 365) <= 20);
      gaap = { quarterEnd: q0.end, eps: q0.value, knownFrom: q0.known_from, priorYearEnd: py?.end || null, priorYearEps: py?.value ?? null };
    }
  }
  const windowDiffs = [];
  if (WINDOW && cf) {
    const p9f = extractCompanyFacts(cf); const af = asFund(after[String(cik)]) || null;
    for (let n = -WINDOW; n <= WINDOW; n += 1) {
      const day = shiftDay(exec, n);
      const x = evaluateSepa(p9f, day, one, P); const y = evaluateSepa(af, day, one, P);
      if (Boolean(x?.ok) !== Boolean(y?.ok)) windowDiffs.push({ day, p9: x?.ok ? 'ok' : x?.reason, coreAfter: y?.ok ? 'ok' : y?.reason });
    }
  }
  const s = (x) => x && { ok: x.ok, reason: x.reason, q: x.facts?.quarterEnd || null, eps: x.facts?.epsGrowth ?? null, epsPrev: x.facts?.epsGrowthPrev ?? null, rev: x.facts?.revGrowth ?? null };
  out.push({ case_id: c.case_id, ticker: c.ticker, group: c.evaluation_group, stratum: c.stratum, exec, frozenDecision: rp.decision, frozenSepa: rp.sepa?.reason || (rp.sepa?.ok ? 'ok' : null), trendOk: rp.trend?.ok, vcpOk: rp.vcp?.ok, universeOk: rp.universe?.ok, setupAtTStar: rp.setupAtTStar, p9Public: s(p9), coreBefore: s(b), coreAfter: s(a), secGaap: gaap, window: WINDOW ? { days: 2 * WINDOW + 1, passFailDiffersFromP9: windowDiffs } : undefined });
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const o of out) console.log([o.case_id, o.ticker, o.group, o.frozenDecision, 'frozen=' + o.frozenSepa, 'p9=' + (o.p9Public?.reason || (o.p9Public?.ok ? 'ok' : '-')), 'before=' + (o.coreBefore?.reason || (o.coreBefore?.ok ? 'ok' : '-')), 'after=' + (o.coreAfter?.reason || (o.coreAfter?.ok ? 'ok' : '-')), 'TT=' + o.trendOk, 'VCP=' + o.vcpOk, 'gaap=' + JSON.stringify(o.secGaap)].join(' | '));
