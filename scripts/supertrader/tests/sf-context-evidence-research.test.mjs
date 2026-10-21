// Kontext-Evidenz fuer Darvas / Kullamaegi / Morales-Kacher (research/context-evidence.mjs). Synthetisch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeWeinsteinGroupMembership, cikCandidatesFromSegments } from '../source-faithful/adapters/industry-groups.mjs';
import { buildGroupStrength, GROUP_VARIANTS } from '../source-faithful/research/industry-strength.mjs';
import { buildMarketBreadth } from '../source-faithful/research/market-breadth.mjs';
import { industryLeadership, withContextEvidence, CONTEXT_RULES, DATA_FRONTIER, SOURCE_FRONTIER } from '../source-faithful/research/context-evidence.mjs';
import { CONTRACTS } from '../source-faithful/registry.mjs';
import { isoWeekKey } from '../engine/indicators.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../../core/industry-classification.js');
const weekdays = (n) => { const out = []; let d = new Date('2019-01-02T00:00:00Z'); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; };
const CAL = weekdays(360);
const mk = (fn) => CAL.map((date, t) => { const c = fn(t); return { date, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 3e5, rawClose: c, rawVolume: 3e5, splitAdj: 1 }; });
const spec = Array.from({ length: 6 }, (_, k) => ({ id: `L${k}`, cik: 10 + k, fn: (t) => 20 * (1 + 0.001 * (k + 1)) ** t }));
const issuers = Object.fromEntries(spec.map((s) => [String(s.cik).padStart(10, '0'), { observations: [['2018-01-01T15:00:00Z', '3674', 'x', '10-K', 'H', 'S', '']] }]));
const securities = spec.map((s) => ({ id: s.id, bars: mk(s.fn) }));
const data = { calendar: CAL, securities };
const segs = spec.map((s) => ({ id: s.id, raw: mk(s.fn) }));
const secPit = Object.fromEntries(spec.map((s) => [s.id, { cik: String(s.cik).padStart(10, '0'), how: 'NAME_MATCH' }]));
const V0 = GROUP_VARIANTS[0];
const membership = makeWeinsteinGroupMembership({ classification: IC.create({ issuers }), cikCandidates: cikCandidatesFromSegments(segs, secPit), decision: { ref: V0.ref, level: 'industry', maxAgeDays: 1000, acceptedIdentityEvidence: V0.acceptedIdentityEvidence } });
const built = buildGroupStrength(data, membership, { minMembers: 5 });

test('SF3-CTX-LEADERSHIP: Rang in der PIT-Gruppe ("strongest stock of the industry"), kausal ohne Schlusskurs des Tages', () => {
  const d = CAL[300];
  const top = industryLeadership(built, 'L5', d), low = industryLeadership(built, 'L0', d);
  assert.equal(top.status, 'EVIDENCE_ONLY'); assert.equal(top.rank, 1); assert.equal(top.strongestInGroup, true); assert.equal(top.group, 'SIC4:3674');
  assert.equal(low.rank, 6); assert.equal(low.percentileInGroup, 0);
  assert.equal(top.session, CAL[299]);
  // a jump on the decision day itself changes nothing
  const jumped = { calendar: CAL, securities: securities.map((s) => (s.id === 'L0' ? { ...s, bars: s.bars.map((b, t) => (t === 300 ? { ...b, close: b.close * 10 } : b)) } : s)) };
  assert.equal(industryLeadership(buildGroupStrength(jumped, membership, { minMembers: 5 }), 'L0', d).rank, 6);
  assert.equal(industryLeadership(built, 'NOPE', d).status, 'UNKNOWN_MEMBERSHIP');
  assert.equal(industryLeadership(built, 'L5', CAL[100]).status, 'INSUFFICIENT_HISTORY');
  assert.equal(industryLeadership({ status: 'DATA_BLOCKED', reason: 'X' }, 'L5', d).status, 'DATA_BLOCKED');
});

test('SF3-CTX-APPEND: Evidenz an jede Momentum-Methode, Status und Kaufsperre unveraendert, Regel-IDs existieren im Vertrag', () => {
  const breadth = buildMarketBreadth(data);
  for (const [methodId, rules] of Object.entries(CONTEXT_RULES)) {
    const c = CONTRACTS.find((x) => x.strategyId === methodId);
    for (const id of Object.values(rules)) assert.ok(c.rules.some((r) => r.id === id), `${methodId}:${id}`);
    const rec = Object.freeze({ status: 'MANUAL_REVIEW_REQUIRED', methodId, securityId: 'L3', asOf: CAL[320], buyDeclarationAllowed: false, machineScreenEvidence: Object.freeze([{ ruleId: 'X', value: 1 }]) });
    const out = withContextEvidence(rec, { built, breadth });
    assert.equal(out.status, 'MANUAL_REVIEW_REQUIRED'); assert.equal(out.buyDeclarationAllowed, false);
    assert.equal(out.machineScreenEvidence.length, 3); assert.equal(rec.machineScreenEvidence.length, 1);
    assert.equal(out.machineScreenEvidence[1].value.rank, 3);
    assert.equal(out.machineScreenEvidence[2].value.sourceStatus, 'VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE');
  }
  assert.throws(() => withContextEvidence({ methodId: 'SF_RASCHKE_HOLY_GRAIL' }, {}), /NO_CONTEXT_RULES/);
  // review M2: a decision date that is not a session never reads a later week
  const weekend = new Date(Date.parse(CAL[200] + 'T00:00:00Z') + 864e5 * (6 - new Date(CAL[200] + 'T00:00:00Z').getUTCDay())).toISOString().slice(0, 10);
  const w = withContextEvidence({ status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_DARVAS_BOX', securityId: 'L3', asOf: weekend, buyDeclarationAllowed: false, machineScreenEvidence: [] }, { built, breadth });
  const chart = w.machineScreenEvidence[0].value.groupChart;
  // strictly before the week of the decision date (re-review L-d)
  assert.ok(chart.week, JSON.stringify(chart));
  assert.ok(chart.week < isoWeekKey(weekend), `${chart.week} vs ${isoWeekKey(weekend)}`);
});

test('SF3-CTX-FRONTIER: jede verbleibende Daten- und Quellensperre ist konkret benannt; kein kostenpflichtiger Pfad ohne Freigabe', () => {
  for (const f of DATA_FRONTIER) for (const k of ['rule', 'methods', 'missing', 'inSnapshot', 'inRepository', 'compliantPath', 'unblocks']) assert.ok(f[k] !== undefined, `${f.rule}:${k}`);
  assert.ok(DATA_FRONTIER.every((f) => f.inSnapshot === false));
  assert.ok(DATA_FRONTIER.filter((f) => /paid/i.test(f.compliantPath)).every((f) => /owner approval|none free|paid product/i.test(f.compliantPath)));
  for (const r of ['KK-SF-EP-CATALYST', 'KK-SF-PS-BORROW', 'KK-SF-BO-ORH']) assert.ok(DATA_FRONTIER.some((f) => f.rule === r));
  for (const r of ['RAS-SF-ENTRY', 'RAS-SF-STOP']) assert.ok(SOURCE_FRONTIER.some((f) => f.rule === r));
  // the contracts still mark them blocked / ambiguous (nothing was unblocked by declaration)
  const rule = (m, id) => CONTRACTS.find((c) => c.strategyId === m).rules.find((r) => r.id === id).status;
  assert.equal(rule('SF_KK_EPISODIC_PIVOT', 'KK-SF-EP-CATALYST'), 'DATA_BLOCKED');
  assert.equal(rule('SF_KK_PARABOLIC_SHORT', 'KK-SF-PS-BORROW'), 'DATA_BLOCKED');
  assert.equal(rule('SF_RASCHKE_HOLY_GRAIL', 'RAS-SF-ENTRY'), 'SOURCE_AMBIGUOUS');
});
