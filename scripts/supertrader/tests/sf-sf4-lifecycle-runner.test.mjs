// Supertrader 4.0 – Snapshot-Runner und Readiness des Minervini Trade Lifecycle (research/run-sf4-lifecycle.mjs,
// completion/build-minervini-lifecycle.mjs). Synthetisch; der echte Lauf braucht den Snapshot (Workflow-Modus sf4-lifecycle).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lifecyclePart, researchCodeSha256 } from '../source-faithful/research/run-sf4-lifecycle.mjs';
import { researchCodeSha256 as sf3CodeSha256 } from '../source-faithful/research/run-sf3-research.mjs';
import { RUN_VARIANTS } from '../source-faithful/research/minervini-lifecycle.mjs';
import { codeSha256 } from '../source-faithful/runner/run-research.mjs';
import { REFERENCE_RUNS } from '../source-faithful/completion/facts.mjs';
import { buildLifecycleArtifact, lifecycleMarkdown } from '../source-faithful/completion/build-minervini-lifecycle.mjs';

const day = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function dataset(n = 24, len = 700) {
  const secs = [];
  for (let s = 0; s < n; s++) {
    const r = rng(s + 7); let c = 20; const drift = (r() - 0.35) * 0.004, bars = [];
    for (let k = 0; k < len; k++) { c *= 1 + drift + 0.025 * (r() - 0.5) * 2 + (r() < 0.006 ? 0.3 : 0); const h = c * (1 + 0.02 * r()), l = c * (1 - 0.02 * r()); bars.push({ date: day(k), open: l + (h - l) * r(), high: h, low: l, close: c, volume: 1e6 * (0.5 + r()), rawClose: c, rawVolume: 1e6, splitAdj: 1 }); }
    secs.push({ id: `S${String(s).padStart(3, '0')}`, bars, terminal: null });
  }
  return { calendar: secs[0].bars.map((b) => b.date), securities: secs, spyTR: secs[0].bars.map((b) => ({ date: b.date, value: b.close })) };
}
const METRIC_KEYS = /"(cagr|sharpe|sortino|winRate|profitFactor|expectancy|expectancyR|pnl|unrealizedPnl|realizedPnl|equity|returnPct|averageWin|averageLoss|maxDrawdown|mark|costs|dividends)"/;

test('SF4-RUNNER-PUBLIC-COUNTS-ONLY: oeffentlich nur Zaehlungen und Hashes, Kennzahlen versiegelt; alle Varianten gemessen, Referenz deterministisch', () => {
  const ds = dataset();
  const r = lifecyclePart(ds, { from: day(260), to: day(699) });
  assert.doesNotMatch(JSON.stringify(r.pub), METRIC_KEYS);
  assert.equal(r.pub.label, 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST');
  for (const s of ['SEPA', 'POWER_PLAY']) {
    const p = r.pub.strategies[s];
    assert.equal(p.determinism.referenceRunTwice, true);
    const expected = RUN_VARIANTS.filter((v) => !v.strategies || v.strategies.includes(s)).map((v) => v.id);
    assert.deepEqual(Object.keys(p.variants), expected);
    assert.ok(Object.values(p.variants).every((v) => v.reconciliation === true && v.endingPositionCheck === 'PASS'));
    assert.ok(r.sealed.strategies[s].variants.REF.metrics.diagnostic.certification === 'DIAGNOSTIC_NOT_CERTIFIED');
  }
  assert.ok(r.pub.strategies.SEPA.variants.REF.trades > 0, 'the synthetic universe must produce SEPA trades');
  assert.equal(r.sealed.label, 'MODEL_LIFECYCLE_STUDY_METRICS_NOT_A_STRATEGY_RETURN');
});

test('SF4-RUNNER-FINGERPRINT: eigener Research-Fingerabdruck; AG-3-Engine-Fingerabdruck und sf3-Research-Code unveraendert', () => {
  assert.match(researchCodeSha256(), /^[0-9a-f]{64}$/);
  assert.notEqual(researchCodeSha256(), sf3CodeSha256());
  const current = REFERENCE_RUNS.filter((r) => r.role === 'CURRENT_ENGINE' && r.method.startsWith('SF_TURTLE'));
  assert.ok(current.length === 2 && current.every((r) => r.codeSha256 === codeSha256()));
});

test('SF4-LIFECYCLE-MATRIX: Matrix valide, Artefakt und Dokument = frischer Build, keine Statusaufwertung, getrennte Readiness', async () => {
  const fresh = await buildLifecycleArtifact();
  assert.deepEqual(fresh.validation, { ok: true, errors: [] });
  const committed = JSON.parse(fs.readFileSync(new URL('../source-faithful/artifacts/STRATEGY-MINERVINI-LIFECYCLE.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(fresh)));
  assert.equal(fs.readFileSync(new URL('../../../docs/SUPERTRADER_4_MINERVINI_LIFECYCLE_MATRIX.md', import.meta.url), 'utf8'), lifecycleMarkdown(fresh));
  for (const s of ['SEPA', 'POWER_PLAY']) {
    const rd = fresh.strategies[s].readiness;
    for (const k of ['sourceFidelity', 'mechanicalCompleteness', 'dataCoverage', 'backtestReadiness', 'manualReview', 'liveReadiness']) assert.ok(rd[k], `${s}:${k}`);
    assert.equal(rd.sourceFidelity.sourceExact, 0);
    assert.equal(rd.backtestReadiness.strategyBacktest, false); assert.equal(rd.backtestReadiness.measurement, 'MODEL_LIFECYCLE_STUDY');
    assert.equal(rd.liveReadiness.status, 'LIVE_NOT_APPROVED'); assert.equal(rd.liveReadiness.tradability, 'NOT_A_TRADABLE_STRATEGY'); assert.equal(rd.liveReadiness.performanceClaim, 'NONE'); assert.equal(rd.liveReadiness.orders, false);
    assert.equal(rd.manualReview.required, true);
    assert.equal(rd.mechanicalCompleteness.lifecycle, 'MECHANICAL_LIFECYCLE_UNDER_MODEL_ASSUMPTIONS');
  }
  // the contracts keep every rule status (no upgrade by the lifecycle)
  assert.equal(fresh.strategies.SEPA.readiness.sourceFidelity.contractRuleStatuses.SOURCE_EXACT, undefined);
  assert.equal(fresh.strategies.SEPA.readiness.sourceFidelity.contractRuleStatuses.DATA_BLOCKED, 1);
});

test('ADV-SF4-MATRIX-NO-UPGRADE: Validator lehnt SOURCE_EXACT, undeklarierte Annahmen, fehlende Tests und Mechanik ohne Code ab', async () => {
  const { MATRIX, validateLifecycleMatrix } = await import('../source-faithful/research/minervini-lifecycle-matrix.mjs');
  const { MINERVINI_SEPA, MINERVINI_POWER_PLAY } = await import('../source-faithful/contracts/minervini.mjs');
  const extract = JSON.parse(fs.readFileSync(new URL('../source-faithful/evidence/PSR709-EVIDENCE-EXTRACT.json', import.meta.url), 'utf8'));
  const C = { SEPA: MINERVINI_SEPA, POWER_PLAY: MINERVINI_POWER_PLAY };
  const tamper = (fn) => ({ SEPA: MATRIX.SEPA.map((r, k) => (k === 0 ? fn({ ...r }) : r)), POWER_PLAY: MATRIX.POWER_PLAY });
  const errs = async (m) => (await validateLifecycleMatrix(m, extract, C)).errors.join(' ');
  assert.match(await errs(tamper((r) => ({ ...r, class: 'SOURCE_EXACT' }))), /EXACT_ON_NON_HARDENABLE_RULE:SQ-TREND-TEMPLATE/);
  assert.match(await errs(tamper((r) => ({ ...r, modelAssumptions: ['MA-INVENTED'] }))), /UNDECLARED_MODEL_ASSUMPTION/);
  assert.match(await errs(tamper((r) => ({ ...r, implemented: { code: r.implemented.code, tests: ['sf-minervini: GC-DOES-NOT-EXIST'] } }))), /TEST_NOT_FOUND/);
  assert.match(await errs(tamper((r) => ({ ...r, implemented: null }))), /MECHANICAL_WITHOUT_CODE/);
  assert.match(await errs(tamper((r) => ({ ...r, contractRules: ['MIN-SF-INVENTED'] }))), /UNKNOWN_CONTRACT_RULE/);
});

test('SF4-SNAPSHOT-RUN-CURRENT-CODE: der eingetragene maßgebliche Snapshot-Lauf gehoert zum aktuellen Code und zur vorregistrierten Konfiguration', async () => {
  const { SNAPSHOT_RUNS } = await import('../source-faithful/completion/build-minervini-lifecycle.mjs');
  const { variantRegistrySha256 } = await import('../source-faithful/research/minervini-lifecycle.mjs');
  const auth = SNAPSHOT_RUNS.filter((r) => r.role === 'AUTHORITATIVE');
  assert.equal(auth.length, 1);
  assert.equal(auth[0].researchCodeSha256, researchCodeSha256());
  assert.equal(auth[0].engineCodeSha256, codeSha256());
  assert.equal(auth[0].variantRegistrySha256, variantRegistrySha256());
  assert.equal(auth[0].datasetVerified, 'EXACT'); assert.equal(auth[0].allVariantsReconciled, true);
  assert.doesNotMatch(JSON.stringify(auth[0]), METRIC_KEYS);
});
