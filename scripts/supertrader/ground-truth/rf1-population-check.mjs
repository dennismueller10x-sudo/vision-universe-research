// Eigenschaftstest fuer RF1 auf einer Population oeffentlicher SEC-Daten (keine Kurse, kein Ground-Truth-Fall).
// Eigenschaften: (1) keine Ausnahme, (2) jeder Unterschied zu 1.1.0 liegt im Fall 1.1.0 == MR-SEPA-10, (3) RF1-Pass im Turnaround-Zweig
// bedeutet q0 > 0 und Vorjahres-EPS <= 0 (T-A; Nachtrag A2 ohne T-B), (4) 1.1.0-Pass bleibt Pass.
// Hinweis (Review F7): (2) und (4) gelten per Konstruktion des Wrappers; (3) ist der inhaltliche Test.
// node rf1-population-check.mjs <cf-dir> <out.json>
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
import { P } from '../replication/minervini-1.1/params.mjs';
import { extractCompanyFacts, ROW } from '../replication/minervini/sec-facts.mjs';
import { evaluateSepa } from '../replication/minervini/sepa.mjs';
import { evaluateSepaRf1 } from '../replication/minervini-1.2-rf1/sepa-turnaround.mjs';
const [DIR, OUT] = process.argv.slice(2);
const one = () => 1;
const next = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const stat = { issuers: 0, evaluations: 0, errors: [], violations: [], sepa11Ok: 0, sepa10Reject: 0, rf1Admits: { 'T-A': 0, 'T-B': 0 }, rf1AdmitStillRejectedByRevenue: 0, rf1Stay: 0, byYear: {}, taEps: [], taMarginPct: [] };
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json.gz'))) {
  let fund;
  try { fund = extractCompanyFacts(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))).toString('utf8'))); } catch (e) { stat.errors.push({ f, e: String(e).slice(0, 120) }); continue; }
  if (!fund || !fund.eps?.length) continue;
  stat.issuers++;
  const days = [...new Set(fund.eps.map((r) => next(r[ROW.FILED])))].sort();
  for (const day of days) {
    let a, b;
    try { a = evaluateSepa(fund, day, one, P); b = evaluateSepaRf1(fund, day, one, P); } catch (e) { stat.errors.push({ f, day, e: String(e).slice(0, 160) }); continue; }
    stat.evaluations++;
    if (a.ok) { stat.sepa11Ok++; if (!b.ok || JSON.stringify(a) !== JSON.stringify(b)) stat.violations.push({ f, day, why: '1.1.0-Pass veraendert' }); continue; }
    if (a.ruleId !== 'MR-SEPA-10') { if (JSON.stringify(a) !== JSON.stringify(b)) stat.violations.push({ f, day, why: 'Unterschied ausserhalb MR-SEPA-10', a: a.reason, b: b.reason }); continue; }
    stat.sepa10Reject++;
    const t = b.facts?.turnaround;
    if (b.ok) {
      const br = t?.branch; if (br === 'T-A') { stat.taEps.push(b.facts.epsCurrent); const m = b.facts.margins?.net?.margin; if (Number.isFinite(m)) stat.taMarginPct.push(m * 100); } stat.rf1Admits[br] = (stat.rf1Admits[br] || 0) + 1; const y = day.slice(0, 4); stat.byYear[y] = (stat.byYear[y] || 0) + 1;
      if (br === 'T-A' && !(b.facts.epsCurrent > 0 && b.facts.epsBase <= 0)) stat.violations.push({ f, day, why: 'T-A ohne Wende', facts: b.facts });
      if (br !== 'T-A') stat.violations.push({ f, day, why: 'unbekannter Zweig', br });
    } else if (b.ruleId === 'MR-SEPA-04' || b.ruleId === 'MR-SEPA-00') { stat.rf1AdmitStillRejectedByRevenue++; }
    else stat.rf1Stay++;
  }
}
const q = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
stat.taDistribution = { n: stat.taEps.length, epsQuantiles: { p10: q(stat.taEps, 0.1), p25: q(stat.taEps, 0.25), p50: q(stat.taEps, 0.5), p75: q(stat.taEps, 0.75), p90: q(stat.taEps, 0.9) }, shareEpsBelow005: stat.taEps.length ? stat.taEps.filter((x) => x < 0.05).length / stat.taEps.length : null, netMarginPctQuantiles: { n: stat.taMarginPct.length, p10: q(stat.taMarginPct, 0.1), p50: q(stat.taMarginPct, 0.5), p90: q(stat.taMarginPct, 0.9) }, shareNetMarginBelow2Pct: stat.taMarginPct.length ? stat.taMarginPct.filter((x) => x < 2).length / stat.taMarginPct.length : null };
delete stat.taEps; delete stat.taMarginPct;
stat.violationCount = stat.violations.length; stat.violations = stat.violations.slice(0, 20); stat.errorCount = stat.errors.length; stat.errors = stat.errors.slice(0, 10);
fs.writeFileSync(OUT, JSON.stringify(stat, null, 1));
console.log(JSON.stringify({ issuers: stat.issuers, evaluations: stat.evaluations, sepa11Ok: stat.sepa11Ok, sepa10Reject: stat.sepa10Reject, rf1Admits: stat.rf1Admits, rf1RevenueBlocked: stat.rf1AdmitStillRejectedByRevenue, rf1StayRejected: stat.rf1Stay, violations: stat.violationCount, errors: stat.errorCount, ta: stat.taDistribution }));
