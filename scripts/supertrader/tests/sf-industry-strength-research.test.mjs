// Weinstein-Branchenstaerke aus PIT-SIC (research/industry-strength.mjs) und Universums-Breite (research/market-breadth.mjs).
// Synthetisch, keine Marktdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeWeinsteinGroupMembership, cikCandidatesFromSegments } from '../source-faithful/adapters/industry-groups.mjs';
import { GROUP_VARIANTS, GROUP_STATE, buildGroupIndices, buildGroupStrength, groupEvidence, groupRanking, maRelation, withIndustryEvidence } from '../source-faithful/research/industry-strength.mjs';
import { buildMarketBreadth } from '../source-faithful/research/market-breadth.mjs';
import { benchmarkWeekly, WEINSTEIN_VERSION } from '../source-faithful/methods/weinstein.mjs';
import { isoWeekKey } from '../engine/indicators.mjs';

const require = createRequire(import.meta.url);
const IC = require('../../../core/industry-classification.js');

const weekdays = (n, start = '2019-01-02') => { const out = []; let d = new Date(start + 'T00:00:00Z'); while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; };
const CAL = weekdays(420);
const series = (fn, from = 0) => CAL.map((date, t) => (t < from ? null : (() => { const c = fn(t); return { date, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 2e5 * (1 + (t % 7) / 10), rawClose: c, rawVolume: 2e5, splitAdj: 1, dividend: 0 }; })())).filter(Boolean);
const obs = (knownAt, sic) => [knownAt, sic, 'x', '10-K', 'H', 'S', ''];

// 6 members SIC 3571 (rising), 6 members SIC 2834 (falling), 2 members SIC 7372 (too few), M1 switches 2834 -> 3571 in 2019-10
const spec = [];
for (let k = 0; k < 6; k++) spec.push({ id: `UP${k}`, cik: 100 + k, sic: '3571', fn: (t) => 20 * (1 + 0.002 * (k + 1)) ** t });
for (let k = 0; k < 6; k++) spec.push({ id: `DN${k}`, cik: 200 + k, sic: '2834', fn: (t) => 80 * (1 - 0.0015 * (k + 1)) ** t });
for (let k = 0; k < 2; k++) spec.push({ id: `SM${k}`, cik: 300 + k, sic: '7372', fn: (t) => 30 + k + Math.sin(t / 9) });
const SWITCH_KNOWN = '2019-10-01T21:00:00Z'; // 17:00 ET after the close -> usable from 2019-10-02
spec.push({ id: 'M1', cik: 400, sic: null, fn: (t) => 50 + t / 10 });
const issuers = {};
for (const s of spec) issuers[String(s.cik).padStart(10, '0')] = { observations: s.id === 'M1' ? [obs('2018-03-01T15:00:00Z', '2834'), obs(SWITCH_KNOWN, '3571')] : [obs('2018-03-01T15:00:00Z', s.sic)] };
const classification = IC.create({ issuers });
const securities = spec.map((s) => ({ id: s.id, bars: series(s.fn), terminal: null }));
const segs = spec.map((s) => ({ id: s.id, raw: series(s.fn) }));
const secPit = Object.fromEntries(spec.map((s) => [s.id, { cik: String(s.cik).padStart(10, '0'), how: 'NAME_MATCH' }]));
const spy = series((t) => 100 * 1.0003 ** t);
const data = { calendar: CAL, securities, benchmark: spy };
const V0 = GROUP_VARIANTS.find((v) => v.role === 'BASELINE_FOR_COMPARISON');
const membershipFor = (v, cls = classification) => makeWeinsteinGroupMembership({ classification: cls, cikCandidates: cikCandidatesFromSegments(segs, secPit), decision: { ref: v.ref, level: v.level, maxAgeDays: 1000, acceptedIdentityEvidence: v.acceptedIdentityEvidence } });

test('SF3-WEIN-GROUP-VARIANTS: Varianten sind deklarierte VU-Stellvertreter, keine Originalregel; Kapitalgewichtung ohne PIT-Aktienzahl DATA_BLOCKED', () => {
  assert.ok(GROUP_VARIANTS.length >= 6);
  for (const v of GROUP_VARIANTS) { assert.equal(v.sourceStatus, 'VU_PROXY_OF_WEINSTEIN_GROUP_CHART'); assert.match(v.ref, /^SF3-RESEARCH-VARIANT:/); }
  const cap = GROUP_VARIANTS.find((v) => v.weighting === 'CAP');
  const r = buildGroupIndices(data, membershipFor(cap), { minMembers: cap.minMembers, weighting: 'CAP' });
  assert.equal(r.status, GROUP_STATE.DATA_BLOCKED);
  assert.equal(r.reason, 'NO_PIT_SHARES_OUTSTANDING_IN_SNAPSHOT');
  assert.equal(r.groups.size, 0);
  assert.throws(() => buildGroupIndices(data, membershipFor(V0), {}), /MIN_MEMBERS_REQUIRED/);
});

test('SF3-WEIN-GROUP-INDEX: gleichgewichteter Kettenindex = Mittel der Mitgliedsrenditen; zu kleine Gruppe bleibt unbekannt', () => {
  const b = buildGroupStrength(data, membershipFor({ ...V0, level: 'industry' }), { minMembers: 5 });
  const up = b.groups.get('SIC4:3571');
  const t = 100, row = up.daily.find((d) => d.t === t);
  const members = ['UP0', 'UP1', 'UP2', 'UP3', 'UP4', 'UP5', ...(CAL[t] > '2019-10-06' ? ['M1'] : [])];
  const want = members.reduce((a, id) => { const s = spec.find((x) => x.id === id); return a + s.fn(t) / s.fn(t - 1) - 1; }, 0) / members.length;
  assert.ok(Math.abs(row.ret - want) < 1e-12);
  const sm = b.groups.get('SIC4:7372');
  assert.ok(sm.daily.every((d) => !d.valid && d.value === null));
  const ev = groupEvidence(b, 'SIC4:7372', isoWeekKey(CAL[400]));
  assert.equal(ev.status, GROUP_STATE.TOO_FEW_MEMBERS);
  assert.equal(groupEvidence(b, 'SIC4:9999', isoWeekKey(CAL[400])).status, GROUP_STATE.UNKNOWN_MEMBERSHIP);
});

test('SF3-WEIN-GROUP-PIT: SIC-Wechsel nach Handelsschluss gilt erst ab der Folgewoche; Zukunftsdaten aendern fruehere Werte nicht', () => {
  const b = buildGroupStrength(data, membershipFor({ ...V0, level: 'industry' }), { minMembers: 5 });
  const wkOfSwitch = isoWeekKey('2019-10-01'), next = isoWeekKey('2019-10-07');
  assert.equal(b.groupOfAt('M1', wkOfSwitch), 'SIC4:2834');
  assert.equal(b.groupOfAt('M1', next), 'SIC4:3571');
  // truncation: a dataset cut after t gives identical index values up to t
  const cut = 300, short = { calendar: CAL.slice(0, cut + 1), securities: securities.map((s) => ({ ...s, bars: s.bars.filter((x) => x.date <= CAL[cut]) })) };
  const bs = buildGroupStrength(short, membershipFor({ ...V0, level: 'industry' }), { minMembers: 5 });
  for (const k of ['SIC4:3571', 'SIC4:2834']) {
    const a = b.groups.get(k).daily.filter((d) => d.t <= cut).map((d) => d.value), c = bs.groups.get(k).daily.map((d) => d.value);
    assert.deepEqual(c, a);
  }
});

test('SF3-WEIN-GROUP-EVIDENCE: Stage-Evidenz, RS, Breite, Volumen und Rotation der Gruppen', () => {
  const b = buildGroupStrength(data, membershipFor(V0), { minMembers: 5 });
  const bench = benchmarkWeekly(spy), wk = isoWeekKey(CAL[410]);
  const up = groupEvidence(b, 'SIC3:357', wk, { bench }), dn = groupEvidence(b, 'SIC3:283', wk, { bench });
  assert.equal(up.maRelation.label, 'ABOVE_RISING_MA30W');
  assert.equal(dn.maRelation.label, 'BELOW_FALLING_MA30W');
  assert.ok(up.relativeStrength.normalisedLevel > 0 && dn.relativeStrength.normalisedLevel < 0);
  assert.ok(up.breadth.shareAboveRisingMa30w > 0.8 && dn.breadth.shareAboveRisingMa30w === 0);
  assert.ok(up.volume.members >= 5);
  assert.ok(up.week < wk, 'evidence uses the last complete week before the breakout week');
  const rank = groupRanking(b, up.week, bench);
  assert.equal(rank.ranked[0].group, 'SIC3:357');
  assert.ok(rank.unranked.includes('SIC3:737'));
  assert.equal(maRelation([{ close: 1 }], 0).status, GROUP_STATE.INSUFFICIENT_HISTORY);
});

test('SF3-WEIN-GROUP-CAP: Kapitalgewichtung nur mit PIT-Aktienzahl; fehlende Gewichte werden gezaehlt, nicht ersetzt', () => {
  const sharesAt = (id) => (id === 'UP0' ? 9e6 : id.startsWith('UP') ? 1e6 : null);
  const b = buildGroupIndices(data, membershipFor({ ...V0, level: 'industry' }), { minMembers: 5, weighting: 'CAP', sharesAt });
  const t = 50, row = b.groups.get('SIC4:3571').daily.find((d) => d.t === t);
  const w = (k) => (k === 0 ? 9e6 : 1e6) * spec[k].fn(t - 1);
  let num = 0, den = 0; for (let k = 0; k < 6; k++) { num += w(k) * (spec[k].fn(t) / spec[k].fn(t - 1) - 1); den += w(k); }
  assert.ok(Math.abs(row.ret - num / den) < 1e-12);
  assert.ok(b.coverage.capWeightMissing > 0);
  assert.ok(b.groups.get('SIC4:2834').daily.every((d) => !d.valid));
});

test('SF3-WEIN-GROUP-INTEGRATION: Evidenz wird angehaengt, nie als Gate; Screen und Original-Record bleiben unveraendert', () => {
  const b = buildGroupStrength(data, membershipFor(V0), { minMembers: 5 });
  const breadth = buildMarketBreadth(data);
  const rec = Object.freeze({ status: 'MANUAL_REVIEW_REQUIRED', methodId: 'SF_WEINSTEIN_INVESTOR', securityId: 'UP2', asOfWeek: isoWeekKey(CAL[405]), asOf: CAL[405], buyDeclarationAllowed: false, machineScreenEvidence: Object.freeze([]) });
  const out = withIndustryEvidence(rec, { built: b, bench: benchmarkWeekly(spy), breadth, variant: V0 });
  assert.equal(rec.machineScreenEvidence.length, 0);
  assert.equal(out.buyDeclarationAllowed, false);
  assert.equal(out.status, 'MANUAL_REVIEW_REQUIRED');
  const g = out.machineScreenEvidence.find((e) => e.ruleId === 'WEIN-SF-GROUP').value;
  assert.equal(g.group, 'SIC3:357'); assert.equal(g.sourceStatus, 'VU_PROXY_OF_WEINSTEIN_GROUP_CHART');
  assert.equal(out.machineScreenEvidence.find((e) => e.ruleId === 'WEIN-SF-MARKET').value.sourceStatus, 'VU_UNIVERSE_BREADTH_PROXY_NOT_NYSE');
  assert.ok(out.reviewGates.some((r) => r.id === 'WEIN-RG-GROUP' && r.blocksAutomation));
  const unknown = withIndustryEvidence({ ...rec, securityId: 'NOPE' }, { built: b });
  assert.equal(unknown.machineScreenEvidence[0].value.status, GROUP_STATE.UNKNOWN_MEMBERSHIP);
  const blocked = withIndustryEvidence(rec, { built: { status: 'DATA_BLOCKED', reason: 'NO_PIT_SHARES_OUTSTANDING_IN_SNAPSHOT' } });
  assert.equal(blocked.machineScreenEvidence[0].value.status, GROUP_STATE.DATA_BLOCKED);
  assert.equal(WEINSTEIN_VERSION, 'sf-weinstein-1.0.0');
});

test('SF3-MARKET-BREADTH: Universums-Breite kausal; NYSE bleibt DATA_BLOCKED', () => {
  const br = buildMarketBreadth(data);
  const d = CAL[300], prev = CAL[299];
  const now = br.at(d), raw = br.at(d, { causal: false });
  assert.equal(now.session, prev);
  assert.equal(raw.session, d);
  assert.equal(now.nyseBreadth, 'DATA_BLOCKED (not in the snapshot)');
  assert.ok(now.population > 0 && now.advances + now.declines + now.unchanged === now.population);
  assert.ok(now.newHighs52w >= 6); // the rising group makes new highs
  assert.ok(now.momentumIndexProxy !== null);
  assert.equal(br.at('2018-01-01').status, 'UNAVAILABLE');
});

test('SF3-WEIN-GROUP-GAP (Review M1/M2): Luecke in der Mitgliedschaft wird UNKNOWN; nie eine alte Woche als aktuell, nie eine spaetere Woche', () => {
  const gapFrom = '2019-06-01', gapTo = '2019-11-30';
  const membership = { groupOf: (id, date) => (id.startsWith('UP') && !(date >= gapFrom && date <= gapTo) ? 'G:UP' : null) };
  const b = buildGroupStrength(data, membership, { minMembers: 5 });
  const g = b.groups.get('G:UP');
  // contiguous calendar weeks; weeks of the gap have no close
  const keys = g.weeks.map((w) => w.key);
  assert.deepEqual(keys, [...new Set(b.weekOf.slice(b.weekOf.indexOf(keys[0])))]);
  assert.ok(g.weeks.filter((w) => w.date > '2019-06-10' && w.date < '2019-11-25').every((w) => w.close === null));
  // inside the gap and shortly after: no evidence (stale weeks are not shown as KNOWN)
  const inGap = groupEvidence(b, 'G:UP', isoWeekKey('2019-09-16'));
  assert.notEqual(inGap.status, GROUP_STATE.KNOWN);
  const after = groupEvidence(b, 'G:UP', isoWeekKey('2019-12-16'));
  assert.equal(after.status, GROUP_STATE.INSUFFICIENT_HISTORY); // MA30w needs 30 complete weeks after the gap
  // the evidence week is always the calendar week right before the decision week
  assert.equal(groupEvidence(b, 'G:UP', isoWeekKey(CAL[300])).week, b.weekOf.filter((k) => k < isoWeekKey(CAL[300])).at(-1));
  assert.equal(groupEvidence(b, 'G:UP', '2099-W01').week, b.weekOf.at(-1));
  // a group absent from the roster in the prior week gets no stale evidence
  const gapWeek = groupEvidence(b, 'G:UP', isoWeekKey('2019-07-15'));
  assert.equal(gapWeek.status, GROUP_STATE.TOO_FEW_MEMBERS); assert.equal(gapWeek.members, 0);
  const early = groupEvidence(b, 'G:UP', '2018-W01');
  assert.equal(early.reason, 'NO_CALENDAR_WEEK_BEFORE');
});
