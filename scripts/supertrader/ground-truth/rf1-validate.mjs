// Minervini Rule Fidelity RF1 – Validierung der SEPA-Schicht gegen die eingefrorenen Ground-Truth-Faelle.
// NUR Validierung: nichts wird angepasst. Oeffentliche SEC-companyfacts; Trend und VCP an t* stammen unveraendert aus dem
// eingefrorenen Replay (private Kurse). Vorhersagen werden aus MINERVINI-RULE-FIDELITY-PREREG.json gelesen und
// programmatisch geprueft.
// node rf1-validate.mjs <cf-dir mit CIK<10-stellig>.json.gz> <out.json> [<core-sepa-fund.json>]
// Zweite Datenbasis (optional): Export der Quant-SEC-Kernschicht (Erstmeldung ueber alle EPS-Tags, export_sepa_fund.py); sie
// vermeidet den Tag-Prioritaet-Fehler des P9-Parsers, der TNDM, RVNC, REPL, RICK vor SEPA-10 mit SEPA_STALE abbrechen laesst.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { P } from '../replication/minervini-1.1/params.mjs';
import { extractCompanyFacts } from '../replication/minervini/sec-facts.mjs';
import { evaluateSepa } from '../replication/minervini/sepa.mjs';
import { evaluateSepaRf1 } from '../replication/minervini-1.2-rf1/sepa-turnaround.mjs';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const FID = path.join(root, 'scripts/supertrader/fidelity');
const [CF_DIR, OUT, CORE_FILE] = process.argv.slice(2);
const CORE = CORE_FILE ? JSON.parse(fs.readFileSync(CORE_FILE, 'utf8')).byCik : null;
const cases = JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-CASES.json'), 'utf8')).cases;
const results = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-GROUND-TRUTH-RESULTS.json'), 'utf8')).cases.map((x) => [x.case_id, x]));
const prereg = JSON.parse(fs.readFileSync(path.join(FID, 'MINERVINI-RULE-FIDELITY-PREREG.json'), 'utf8'));
const loadCompanyFacts = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
const one = () => 1; // Split-Verhaeltnis 1: In keinem Fall liegt ein Split zwischen den verglichenen Einreichungen (Ground-Truth-Bericht, Frage 9)
const nextDay = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const WINDOW = 12; // Tage: Timing-Toleranz der eingefrorenen Bewertung
const shiftDay = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
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
  const coreFund = CORE ? (CORE[String(Number(c.identity.expected_cik))] || null) : undefined;
  const core = coreFund === undefined ? null : {
    sepa11: brief(evaluateSepa(coreFund, exec, one, P)), rf1V1: brief(evaluateSepaRf1(coreFund, exec, one, P, { acceleration: 'WAIVED' })), rf1V2: brief(evaluateSepaRf1(coreFund, exec, one, P, { acceleration: 'SWING' })),
  };
  if (core) { core.flippedV1 = !core.sepa11.ok && core.rf1V1.ok; core.flippedV2 = !core.sepa11.ok && core.rf1V2.ok; core.changedV1 = JSON.stringify(core.sepa11) !== JSON.stringify(core.rf1V1); }
  // Jeder Kalendertag im Fenster exec +- 12: unterscheidet sich das SEPA-Ergebnis 1.1.0 gegen RF1 an irgendeinem Tag?
  const winDiff = (f) => { const out = []; if (f === null || f === undefined) return out; for (let n = -WINDOW; n <= WINDOW; n++) { const day = shiftDay(exec, n); const a = evaluateSepa(f, day, one, P), b = evaluateSepaRf1(f, day, one, P, { acceleration: 'WAIVED' }); if (Boolean(a.ok) !== Boolean(b.ok) || (a.reason || null) !== (b.reason || null)) out.push({ day, sepa11: a.reason || 'OK', rf1: b.reason || 'OK' }); } return out; };
  const windowDiffs = { p9: winDiff(fund), core: winDiff(coreFund) };
  rows.push({
    id: c.case_id, ticker: c.ticker, group: c.evaluation_group, exec, frozenDecision: rp.decision, frozenSetupAtTStar: rp.setupAtTStar,
    upstreamLayersPass: upstream, vcpReason: rp.vcp?.reason ?? null, vcpBaseLength: rp.vcp?.baseLength ?? null,
    sepa11: brief(s11), rf1V1: brief(v1), rf1V2: brief(v2),
    sepaFlippedV1: !s11.ok && v1.ok, sepaFlippedV2: !s11.ok && v2.ok, resultChangedV1: JSON.stringify(brief(s11)) !== JSON.stringify(brief(v1)),
    setupProxy11: upstream && s11.ok, setupProxyV1: upstream && v1.ok, core, windowDiffs,
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

if (CORE) {
  const cr = rows.filter((r) => r.core);
  const coreBy = Object.fromEntries(cr.map((r) => [r.id, r.core]));
  for (const sx of ev.MAIN_loss_to_loss_no_change) { const id = idOf(sx); const k = coreBy[id]; check(`[Kern 1.23.0] ${id} bleibt SEPA_BASE_NOT_POSITIVE (Loss->Loss, Erstmeldung ueber alle Tags)`, !!k && k.sepa11.reason === 'SEPA_BASE_NOT_POSITIVE' && k.rf1V1.reason === 'SEPA_BASE_NOT_POSITIVE' && k.rf1V2.reason === 'SEPA_BASE_NOT_POSITIVE', k ? { sepa11: k.sepa11.reason, v1: k.rf1V1.reason, v2: k.rf1V2.reason } : 'FEHLT'); }
  for (const sx of ev.SEPA_layer_flips_reject_to_pass) { const id = idOf(sx); const k = coreBy[id]; check(`[Kern 1.23.0] ${id} SEPA wechselt auf Pass (V1 und V2)`, !!k && k.flippedV1 && k.flippedV2, k ? { sepa11: k.sepa11.reason, v1: k.rf1V1.branch } : 'FEHLT'); }
  check('[Kern 1.23.0] kein Fall ausserhalb von MR-SEPA-10 aendert sich', cr.filter((r) => r.core.sepa11.rule !== 'MR-SEPA-10').every((r) => !r.core.changedV1), { n: cr.filter((r) => r.core.sepa11.rule !== 'MR-SEPA-10').length });
  check('[Kern 1.23.0] genau MU, DXCM, AVGO wechseln', JSON.stringify(cr.filter((r) => r.core.flippedV1).map((r) => r.id).sort()) === JSON.stringify(['GT-006', 'GT-020', 'GT-031']), cr.filter((r) => r.core.flippedV1).map((r) => r.id));
}
const winCases = (key) => rows.filter((r) => r.windowDiffs && r.windowDiffs[key].length).map((r) => ({ id: r.id, ticker: r.ticker, days: r.windowDiffs[key].length }));
check('MAIN: kein Tag im +-12-Tage-Fenster mit anderem SEPA-Ergebnis (P9-Daten)', main.every((r) => r.windowDiffs.p9.length === 0), winCases('p9').filter((x) => rows.find((r) => r.id === x.id).group === 'MAIN'));
if (CORE) check('MAIN: kein Tag im +-12-Tage-Fenster mit anderem SEPA-Ergebnis (Kern 1.23.0)', main.every((r) => r.windowDiffs.core.length === 0), winCases('core').filter((x) => rows.find((r) => r.id === x.id).group === 'MAIN'));
const summary = {
  schema: 'vu-minervini-rule-fidelity-rf1-validation-1.0.0', version: 'minervini-adaptation-1.2.0-rf1', preregistered: path.relative(root, path.join(FID, 'MINERVINI-RULE-FIDELITY-PREREG.json')),
  cases: rows.length, evaluated: rows.filter((r) => !r.skipped).length,
  sepaFlippedV1: rows.filter((r) => r.sepaFlippedV1).map((r) => r.id), sepaFlippedV2: rows.filter((r) => r.sepaFlippedV2).map((r) => r.id),
  coreSepaFlippedV1: CORE ? rows.filter((r) => r.core?.flippedV1).map((r) => r.id) : null, coreSepaFlippedV2: CORE ? rows.filter((r) => r.core?.flippedV2).map((r) => r.id) : null,
  windowTolerance: WINDOW, windowDifferingCasesP9: winCases('p9'), windowDifferingCasesCore: CORE ? winCases('core') : null,
  predictionChecks: { total: checks.length, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).map((c) => c.name) }, checks,
  note: 'Entscheidung/Recall der MAIN-Faelle setzt private Kurse voraus (Signal im Zeitfenster); hier gilt: SEPA-Schicht neu, Universum/Trend/VCP an t* aus dem eingefrorenen Replay.', rows,
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
console.log(`evaluated ${summary.evaluated}/${summary.cases}; SEPA flipped V1: ${summary.sepaFlippedV1.join(',') || '-'} | V2: ${summary.sepaFlippedV2.join(',') || '-'}`);
console.log(`consistency checks (derived from the rule definition and known case values, Review F7): ${summary.predictionChecks.passed}/${summary.predictionChecks.total} passed`);
for (const c of checks) if (!c.ok) console.log('  FAIL:', c.name, JSON.stringify(c.detail));
