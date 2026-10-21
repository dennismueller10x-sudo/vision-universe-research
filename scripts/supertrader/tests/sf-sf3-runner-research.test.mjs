// Supertrader-3.0-Research-Runner (research/run-sf3-research.mjs): Teile laufen auf einem synthetischen Datensatz,
// ohne Snapshot und ohne Netz; Engine-Fingerabdruck (AG-3) bleibt unveraendert.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { turtlePart, weinsteinPart, minerviniPart, contextPart, attachSecPit, researchCodeSha256 } from '../source-faithful/research/run-sf3-research.mjs';
import { CORRELATION_VARIANTS } from '../source-faithful/research/turtle-correlation.mjs';
import { buildMarketBreadth } from '../source-faithful/research/market-breadth.mjs';
import { buildGroupStrength, GROUP_VARIANTS } from '../source-faithful/research/industry-strength.mjs';
import { makeWeinsteinGroupMembership, cikCandidatesFromSegments } from '../source-faithful/adapters/industry-groups.mjs';
import { codeSha256 } from '../source-faithful/runner/run-research.mjs';
import { REFERENCE_RUNS } from '../source-faithful/completion/facts.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../../core/industry-classification.js');
const weekdays = (n) => { const out = []; let d = new Date('2016-01-04T00:00:00Z'); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; };
const CAL = weekdays(560);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function dataset() {
  const r = rng(4), f = { A: [], B: [], M: [] };
  for (let t = 0; t < CAL.length; t++) for (const k of Object.keys(f)) f[k].push((r() - 0.47) * 0.03);
  const securities = Array.from({ length: 12 }, (_, k) => {
    let c = 30 + k; const fac = k < 6 ? 'A' : 'B';
    const bars = CAL.map((date, t) => { if (t) c *= 1 + f.M[t] * 0.5 + f[fac][t] + (r() - 0.5) * 0.01; return { date, open: c, high: c * 1.04, low: c * 0.96, close: c, volume: 4e5, rawClose: c, rawVolume: 4e5, splitAdj: 1, dividend: 0 }; });
    return { id: `S${String(k).padStart(2, '0')}`, bars, terminal: null };
  });
  let s = 100;
  const benchmark = CAL.map((date, t) => { if (t) s *= 1 + f.M[t] * 0.5; return { date, open: s, high: s, low: s, close: s, volume: 1 }; });
  return { calendar: CAL, securities, benchmark, spyTR: benchmark.map((b) => ({ date: b.date, value: b.close })) };
}
const segs = (ds) => ds.securities.map((s) => ({ id: s.id, raw: s.bars }));
const secPit = (ds) => Object.fromEntries(ds.securities.map((s, k) => [s.id, { cik: String(500 + k).padStart(10, '0'), how: 'NAME_MATCH', eps: [['2016-12-31', 1, '2017-02-01', 0], ['2017-12-31', 1.4, '2018-02-01', 0]], rev: [] }]));
const classification = IC.create({ issuers: Object.fromEntries(Array.from({ length: 12 }, (_, k) => [String(500 + k).padStart(10, '0'), { observations: [2015, 2016, 2017, 2018].map((y) => [`${y}-06-01T15:00:00Z`, k < 6 ? '3571' : '2834', 'x', '10-K', 'H', 'S', '']) }])) });

test('SF3-RUNNER-PARTS: alle Teile laufen; Referenzlauf ohne Gruppen, Varianten abgestimmt; Zahlen statt Renditen oeffentlich', () => {
  const ds = dataset();
  assert.deepEqual(attachSecPit(ds, secPit(ds)), { securities: 12, withFund: 12 });
  const t = turtlePart(ds, { from: CAL[260], to: CAL.at(-1), variants: CORRELATION_VARIANTS.filter((v) => v.role === 'BASELINE_FOR_COMPARISON' || v.basis === 'MARKET_RESIDUAL').slice(0, 2) });
  assert.equal(t.pub.reference.S1.correlationLimits, 'NOT_EVALUATED_NO_PIT_GROUPS');
  assert.equal(t.pub.reference.S1.reconciliation, true);
  assert.ok(Object.keys(t.pub.variants).includes('RAW-126-COMPLETE-70-50|POOLED_UNKNOWN'));
  for (const v of Object.values(t.pub.variants)) for (const s of Object.values(v.systems)) { assert.equal(s.reconciliation, true); assert.equal(s.conformance.ruleConformance, 'NOT_ESTABLISHED'); }
  assert.doesNotMatch(JSON.stringify(t.pub), /"cagr"|"sharpe"/i);
  assert.ok(t.sealed.reference.S1.metrics);
  const breadth = buildMarketBreadth(ds);
  const w = weinsteinPart(ds, { classification, cikCandidates: cikCandidatesFromSegments(segs(ds), secPit(ds)), bench: ds.benchmark, breadth, weekStride: 8 });
  const base = w.pub.variants['SIC3-EW-MIN5-400D-WIDE'];
  assert.ok(base.coverage.membershipResolvedShare > 0.9, JSON.stringify(base.coverage));
  // 120-day carry-forward with yearly filings: stale observations are UNKNOWN, not carried silently
  assert.ok(w.pub.variants['SIC3-EW-MIN5-120D-WIDE'].coverage.membershipResolvedShare < base.coverage.membershipResolvedShare);
  assert.equal(w.pub.variants['SIC3-CAP-MIN5-400D-WIDE'].status, 'DATA_BLOCKED');
  assert.ok(Object.keys(base.groupLabelsByYear).length > 0);
  const m = minerviniPart(ds, { forward: 21 });
  assert.equal(m.pub.label, 'SCREEN_STATISTICS_NOT_A_STRATEGY');
  assert.ok(Object.keys(m.pub.sepaByYear).length > 0);
  assert.equal(m.sealed.label, 'SCREEN_STATISTIC_FORWARD_PRICE_CHANGE_NOT_A_STRATEGY_RETURN');
  const v0 = GROUP_VARIANTS[0];
  const built = buildGroupStrength(ds, makeWeinsteinGroupMembership({ classification, cikCandidates: cikCandidatesFromSegments(segs(ds), secPit(ds)), decision: { ref: v0.ref, level: v0.level, maxAgeDays: v0.maxAgeDays, acceptedIdentityEvidence: v0.acceptedIdentityEvidence } }), { minMembers: v0.minMembers });
  const c = contextPart(ds, { built, breadth });
  assert.ok(Object.values(c.pub.leadershipStatusByYear).some((y) => y.EVIDENCE_ONLY > 0));
});

test('SF3-RUNNER-FINGERPRINT: Research-Code hat eigenen Fingerabdruck; der Engine-Fingerabdruck des Acceptance Gates ist unveraendert', () => {
  assert.match(researchCodeSha256(), /^[0-9a-f]{64}$/);
  const current = REFERENCE_RUNS.filter((r) => r.role === 'CURRENT_ENGINE' && r.method.startsWith('SF_TURTLE'));
  assert.ok(current.length === 2 && current.every((r) => r.codeSha256 === codeSha256()));
});
