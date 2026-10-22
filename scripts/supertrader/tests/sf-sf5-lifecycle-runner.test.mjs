// Supertrader 5.0 – Snapshot-Runner und Readiness der Lifecycles auf der gemeinsamen Engine (research/run-sf5-lifecycle.mjs,
// completion/build-sf5-lifecycle.mjs). Synthetisch; der echte Lauf braucht den Snapshot (Workflow-Modus sf5-lifecycle).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lifecyclePart, sf5ResearchCodeSha256 } from '../source-faithful/research/run-sf5-lifecycle.mjs';
import { researchCodeSha256 as sf4CodeSha256 } from '../source-faithful/research/run-sf4-lifecycle.mjs';
import { variantRegistrySha256 as minerviniVariants } from '../source-faithful/research/minervini-lifecycle.mjs';
import { SF5_LIFECYCLES, sf5VariantRegistrySha256 } from '../source-faithful/research/sf5-lifecycles.mjs';
import { codeSha256 } from '../source-faithful/runner/run-research.mjs';
import { REFERENCE_RUNS } from '../source-faithful/completion/facts.mjs';
import { SNAPSHOT_RUNS as SF4_RUNS } from '../source-faithful/completion/build-minervini-lifecycle.mjs';
import { buildSf5Artifact, sf5Markdown, SF5_SNAPSHOT_RUNS } from '../source-faithful/completion/build-sf5-lifecycle.mjs';

// pinned before the first snapshot result of the Supertrader 5.0 lifecycles was read
const PINNED_SF5_VARIANT_REGISTRY = '00c94bb68ed2ac3fc744619271550465944ed8bf6a8ab1a29d8acbb85cffcefd';
const day = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function dataset(n = 30, len = 700) {
  const secs = [];
  for (let s = 0; s < n; s++) {
    const r = rng(s + 11); let c = 20; const drift = (r() - 0.3) * 0.004, bars = [];
    for (let k = 0; k < len; k++) {
      const gap = r() < 0.01 ? 0.08 : 0, o = c * (1 + gap + 0.01 * (r() - 0.5));
      c = o * (1 + drift + 0.03 * (r() - 0.5)); const h = Math.max(o, c) * (1 + 0.012 * r()), l = Math.min(o, c) * (1 - 0.012 * r());
      const v = 1e6 * (0.5 + r()) * (gap ? 3 : 1);
      bars.push({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
    }
    secs.push({ id: `S${String(s).padStart(3, '0')}`, bars, terminal: null });
  }
  return { calendar: secs[0].bars.map((b) => b.date), securities: secs, spyTR: secs[0].bars.map((b) => ({ date: b.date, value: b.close })) };
}
const METRIC_KEYS = /"(cagr|sharpe|sortino|winRate|profitFactor|expectancy|expectancyR|pnl|unrealizedPnl|realizedPnl|equity|returnPct|averageWin|averageLoss|maxDrawdown|mark|costs|dividends)"/;

test('SF5-RUNNER-PUBLIC-COUNTS-ONLY: oeffentlich nur Zaehlungen und Hashes, Kennzahlen versiegelt; alle Varianten gemessen, Referenz deterministisch', () => {
  const ds = dataset();
  const r = lifecyclePart(ds, { from: day(200), to: day(699) });
  assert.doesNotMatch(JSON.stringify(r.pub), METRIC_KEYS);
  assert.equal(r.pub.label, 'MODEL_LIFECYCLE_STUDY_NOT_A_STRATEGY_BACKTEST');
  for (const lc of SF5_LIFECYCLES) {
    const p = r.pub.strategies[lc.key];
    assert.equal(p.determinism.referenceRunTwice, true, lc.key);
    assert.deepEqual(Object.keys(p.variants), lc.variants.map((v) => v.id));
    assert.ok(Object.values(p.variants).every((v) => v.reconciliation === true && v.endingPositionCheck === 'PASS'), lc.key);
    assert.equal(r.sealed.strategies[lc.key].variants.REF.metrics.diagnostic.certification, 'DIAGNOSTIC_NOT_CERTIFIED');
  }
  for (const k of ['DARVAS', 'KK_BREAKOUT', 'POCKET_PIVOT', 'BUYABLE_GAP_UP', 'WEINSTEIN_INVESTOR', 'WEINSTEIN_TRADER']) assert.ok(r.pub.strategies[k].variants.REF.trades > 0, `${k}: the synthetic universe must produce trades`);
  assert.equal(r.pub.strategies.HOLY_GRAIL_W_RAS97.sourceStatus, 'RESEARCH_VARIANT_SOURCE_PENDING_OWNER_DECISION');
  assert.equal(r.sealed.label, 'MODEL_LIFECYCLE_STUDY_METRICS_NOT_A_STRATEGY_RETURN');
});

test('SF5-RUNNER-FINGERPRINT: eigener Research-Fingerabdruck; AG-3-Engine, sf4-Lifecycle und Minervini-Varianten unveraendert', () => {
  assert.match(sf5ResearchCodeSha256(), /^[0-9a-f]{64}$/);
  assert.notEqual(sf5ResearchCodeSha256(), sf4CodeSha256());
  assert.equal(sf4CodeSha256(), SF4_RUNS.find((r) => r.role === 'AUTHORITATIVE').researchCodeSha256); // the Minervini lifecycle code is untouched
  assert.equal(minerviniVariants(), 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75');
  const current = REFERENCE_RUNS.filter((r) => r.role === 'CURRENT_ENGINE' && r.method.startsWith('SF_TURTLE'));
  assert.ok(current.length === 2 && current.every((r) => r.codeSha256 === codeSha256()));
  assert.equal(sf5VariantRegistrySha256(), PINNED_SF5_VARIANT_REGISTRY);
});

test('SF5-LIFECYCLE-MATRIX: Matrix valide, Artefakt und Dokument = frischer Build, keine Statusaufwertung, getrennte Readiness', async () => {
  const fresh = await buildSf5Artifact();
  assert.deepEqual(fresh.validation, { ok: true, errors: [] });
  const committed = JSON.parse(fs.readFileSync(new URL('../source-faithful/artifacts/STRATEGY-SF5-LIFECYCLE.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(fresh)));
  assert.equal(fs.readFileSync(new URL('../../../docs/SUPERTRADER_5_LIFECYCLE_MATRIX.md', import.meta.url), 'utf8'), sf5Markdown(fresh));
  for (const [k, s] of Object.entries(fresh.strategies)) {
    const rd = s.readiness;
    for (const d of ['sourceFidelity', 'mechanicalCompleteness', 'dataCoverage', 'backtestReadiness', 'manualReview', 'liveReadiness']) assert.ok(rd[d], `${k}:${d}`);
    assert.equal(rd.backtestReadiness.strategyBacktest, false); assert.match(rd.backtestReadiness.measurement, /^MODEL_LIFECYCLE_STUDY/);
    assert.equal(rd.liveReadiness.status, 'LIVE_NOT_APPROVED'); assert.equal(rd.liveReadiness.performanceClaim, 'NONE'); assert.equal(rd.liveReadiness.orders, false);
    assert.ok(rd.manualReview.required);
  }
  assert.equal(fresh.strategies.HOLY_GRAIL_W_RAS97.readiness.backtestReadiness.measurement, 'MODEL_LIFECYCLE_STUDY_RESEARCH_VARIANT');
});

test('SF5-SNAPSHOT-RUN-CURRENT-CODE: ein eingetragener Snapshot-Lauf gilt nur fuer den aktuellen Research-Code', () => {
  for (const r of SF5_SNAPSHOT_RUNS.filter((x) => x.role === 'AUTHORITATIVE')) {
    assert.equal(r.researchCodeSha256, sf5ResearchCodeSha256());
    assert.equal(r.variantRegistrySha256, sf5VariantRegistrySha256());
    assert.equal(r.allVariantsReconciled, true); assert.equal(r.referenceDeterministic, true);
  }
});
