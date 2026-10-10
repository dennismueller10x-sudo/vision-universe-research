// Minervini Rule Fidelity RF1 – Validierung der SEPA-Schicht gegen die eingefrorenen Ground-Truth-Faelle.
// NUR Validierung: nichts wird angepasst. Oeffentliche SEC-companyfacts; Trend und VCP an t* stammen unveraendert aus dem
// eingefrorenen Replay (private Kurse). Vorhersagen werden aus MINERVINI-RULE-FIDELITY-PREREG.json gelesen und
// programmatisch geprueft.
// node rf1-validate.mjs <cf-dir mit CIK<10-stellig>.json.gz> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { P } from '../replication/minervini-1.1/params.mjs';
import { extractCompanyFacts } from '../replication/minervini/sec-facts.mjs';
import { evaluateSepa } from '../replication/minervini/sepa.mjs';
import { evaluateSepaRf1 } from '../replication/minervini-1.2-rf1/sepa-turnaround.mjs';
import { loadCompanyFacts } from '../../fundamentals-audit/sec-ground-truth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const FID = path.join(root, 'scripts/supertrader/fidelity');
const [CF_DIR, OUT] = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-CASES.json'), 'utf8')).cases;
const results = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-RESULTS.json'), 'utf8')).cases.map((x) => [x.case_id, x]));
const prereg = JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-RULE-FIDELITY-PREREG.json'), 'utf8'));
const one = () => 1; // Split-Verhaeltnis 1: In keinem Fall liegt ein Split zwischen den verglichenen Einreichungen (Ground-Truth-Bericht, Frage 9)
const nextDay = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const GROUPS = ['MAIN', 'SENSITIVITY', 'WATCHLIST', 'ENTRY_TYPE_NOT_MODELLED'];
const brief = (r) => (r ? { ok: !!r.ok, reason: r.reason || null, rule: r.ruleId || null, branch: r.facts?.turnaround?.branch ?? null, quarterEnd: r.facts?.quarterEnd ?? null } : null);

const rows = [];
for (const c of cases.filter((x) => GROUPS.includes(x.evaluation_group))) {
  const rp = results[c.case_id]?.replay;
  if (!rp || !rp.evaluatedClose) { rows.push({ id: c.case_id, ticker: c.ticker, group: c.evaluation_group, skipped: rp?.reason || rp?.decision || 'NO_REPLAY' }); continue; }
  const exec = rp.anchorDate || nextDay(rp.evaluatedClose);
  const file = path.join(CF_DIR, `CIK${String(c.identity.expected_cik).padStart(10, '0')}.json.gz`);
  const fund = fs.existsSync(file) ? extractCompanyFacts(loadCompanyFacts(file)) : null;
  const s11 = evaluateSepa(fund, exec, one, P);
  const v1 = evaluateSepaRf1(fund, exec, one, P, { acceleration: 'WAIVED' });
  const v2 = evaluateSepaRf1(fund, exec, one, P, { acceleration: 'SWING' });
  const upstream = !!(rp.universe?.ok) && !!(rp.trend?.ok) && !!(rp.vcp?.ok); // frozen: Universum, Trend, VCP an t*
  rows.push({
    id: c.case_id, ticker: c.ticker, group: c.evaluation_group, exec, frozenDecision: rp.decision, frozenSetupAtTStar: rp.setupAtTStar,
    upstreamLayersPass: upstream, vcpReason: rp.vcp?.reason ?? null, vcpBaseLength: rp.vcp?.baseLength ?? null,
    sepa11: brief(s11), rf1V1: brief(v1), rf1V2: brief(v2),
    sepaFlippedV1: !s11.ok && v1.ok, sepaFlippedV2: !s11.ok && v2.ok, resultChangedV1: JSON.stringify(brief(s11)) !== JSON.stringify(brief(v1)),
    setupProxy11: upstream && s11.ok, setupProxyV1: upstream && v1.ok,
  });
}

// Pruefung der vorab registrierten Vorhersagen (H1)
const ev = prereg.hypotheses.find((h) => h.id === 'H1').expectedEffects;
const idOf = (s) => s.match(/GT-\d+/)[0];
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });
for (const s of ev.MAIN_loss_to_loss_no_change) { const r = byId[idOf(s)]; check(`${idOf(s)} bleibt abgelehnt (Loss->Loss)`, !!r && !r.sepaFlippedV1 && !r.sepaFlippedV2 && !r.resultChangedV1, r ? { sepa11: r.sepa11?.reason, v1: r.rf1V1?.reason } : 'FEHLT'); }
for (const s of ev.SEPA_layer_flips_reject_to_pass) { const r = byId[idOf(s)]; check(`${idOf(s)} SEPA wechselt von Ablehnung auf Pass (V1 und V2)`, !!r && r.sepaFlippedV1 && r.sepaFlippedV2, r ? { sepa11: r.sepa11?.reason, v1: r.rf1V1, v2: r.rf1V2 } : 'FEHLT'); }
for (const s of ev.no_decision_change_despite_SEPA_flip) { const r = byId[idOf(s)]; check(`${idOf(s)} bleibt trotz SEPA-Wechsel wegen VCP abgelehnt`, !!r && r.sepaFlippedV1 && !r.upstreamLayersPass, r ? { vcp: r.vcpReason } : 'FEHLT'); }
for (const s of ev.unchanged_other_reasons) { const r = byId[idOf(s)]; check(`${idOf(s)} unveraendert`, !!r && !r.sepaFlippedV1 && !r.resultChangedV1, r ? { sepa11: r.sepa11?.reason, v1: r.rf1V1?.reason } : 'FEHLT'); }
const positiveBase = rows.filter((r) => r.sepa11 && r.sepa11.rule !== 'MR-SEPA-10');
check('alle Faelle ohne MR-SEPA-10-Ergebnis haben ein bitgleiches Ergebnis', positiveBase.every((r) => !r.resultChangedV1), { n: positiveBase.length });
const main = rows.filter((r) => r.group === 'MAIN' && !r.skipped);
check('MAIN-Faelle mit setupProxy: 1.1.0 und RF1 gleich', main.every((r) => r.setupProxy11 === r.setupProxyV1), { mainN: main.length, withSetup11: main.filter((r) => r.setupProxy11).length, withSetupV1: main.filter((r) => r.setupProxyV1).length });

const summary = {
  schema: 'vu-minervini-rule-fidelity-rf1-validation-1.0.0', version: 'minervini-adaptation-1.2.0-rf1', preregistered: path.relative(root, path.join(FID, 'MINERVINI-RULE-FIDELITY-PREREG.json')),
  cases: rows.length, evaluated: rows.filter((r) => !r.skipped).length,
  sepaFlippedV1: rows.filter((r) => r.sepaFlippedV1).map((r) => r.id), sepaFlippedV2: rows.filter((r) => r.sepaFlippedV2).map((r) => r.id),
  predictionChecks: { total: checks.length, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).map((c) => c.name) }, checks,
  note: 'Entscheidung/Recall der MAIN-Faelle setzt private Kurse voraus (Signal im Zeitfenster); hier gilt: SEPA-Schicht neu, Universum/Trend/VCP an t* aus dem eingefrorenen Replay.', rows,
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
console.log(`evaluated ${summary.evaluated}/${summary.cases}; SEPA flipped V1: ${summary.sepaFlippedV1.join(',') || '-'} | V2: ${summary.sepaFlippedV2.join(',') || '-'}`);
console.log(`predictions: ${summary.predictionChecks.passed}/${summary.predictionChecks.total} passed`);
for (const c of checks) if (!c.ok) console.log('  FAIL:', c.name, JSON.stringify(c.detail));
