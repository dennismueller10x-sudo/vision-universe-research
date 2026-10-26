import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../engines/research-studies.cjs');
const Signal = require('../engines/signal-backtest.js');
const day = k => new Date(Date.UTC(2010, 0, 1) + k * 7 * 86400000).toISOString().slice(0, 10);
function listing(id, n = 180, phase = 0) {
  return { listingId: id, issuerId: 'issuer:' + id,
    identity: { mic: 'XNYS', instrumentClass: 'COMMON_STOCK', primary: true, validFrom: '1990-01-01', availableAt: '1990-01-01T00:00:00Z', sourceHash: 'synthetic-identity' },
    membership: [{ validFrom: '1990-01-01', availableAt: '1990-01-01T00:00:00Z', sourceHash: 'synthetic-membership' }],
    bars: Array.from({ length: n }, (_, k) => { const close = 100 + 0.1 * k + 15 * Math.sin(k / 8 + phase); return { date: day(k), close, returnLevel: close, availableAt: day(k) + 'T21:01:00Z', closeAt: day(k) + 'T21:00:00Z', sourceHash: 'synthetic-bar-' + k }; }) };
}
function options(listings = [listing('A'), listing('B', 180, 2)]) {
  return { asOf: day(179), sourceMode: 'SYNTHETIC_TEST', returnBasis: 'TOTAL_RETURN', currency: 'USD',
    registration: { id: 'fixture-rule', version: '1.0.0', frozenAt: '2009-01-01T00:00:00Z', analysisMode: 'EXPLORATORY' },
    horizonBars: 4, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: 10, slippageBps: 5 }, listings,
    benchmark: { currency: 'USD', returnBasis: 'TOTAL_RETURN', bars: listing('SPY').bars } };
}
const pattern = { id: 'FIXED_ABOVE_MA', version: '1', terms: [{ feature: 'aboveSma40w', operator: 'eq', value: true }] };

test('five frozen signal rules reused with deterministic hashes and exact per-side costs', () => {
  const o = options(), a = R.runSignalStudy(o), b = R.runSignalStudy(structuredClone(o));
  assert.deepEqual(a, b); assert.equal(a.rules.length, 5); assert.equal(a.productionApproved, false);
  for (const l of o.listings) for (const rule of Signal.RULES) {
    assert.deepEqual(a.events.filter(e => e.listingId === l.listingId && e.ruleId === rule.id).map(e => e.signalDate), Signal.detectEvents(l.bars.map(b => b.close), rule).map(k => l.bars[k].date));
  }
  const e = a.events.find(e => e.completed); assert.ok(e);
  const l = o.listings.find(l => l.listingId === e.listingId), entry = l.bars.find(b => b.date === e.entryDate), exit = l.bars.find(b => b.date === e.exitDate);
  assert.equal(e.netReturn, exit.returnLevel / entry.returnLevel * (1 - 0.0015) / (1 + 0.0015) - 1);
  assert.equal(a.certification, 'NOT_CERTIFIED'); assert.ok(a.baseRates.length);
});

test('as-of prefix invariance: appended extreme future prices do not change observed study events', () => {
  const a = options(); a.asOf = day(120);
  const b = structuredClone(a); for (const l of b.listings) for (let k = 121; k < l.bars.length; k++) { l.bars[k].close = 1e7 + k; l.bars[k].returnLevel = 1e7 + k; }
  assert.deepEqual(R.runSignalStudy(a).events, R.runSignalStudy(b).events);
});

test('identity, historical membership, benchmark basis and duplicate identifiers fail closed', () => {
  const o = options(); delete o.listings[0].membership;
  const a = R.runSignalStudy(o); assert.ok(a.events.filter(e => e.listingId === 'A').every(e => e.state === 'INELIGIBLE'));
  assert.equal(a.universeClaim, 'SUPPLIED_HISTORICAL_LISTING_COHORT_NOT_PROOF_OF_MARKET_COMPLETENESS');
  const p = options(); p.benchmark.returnBasis = 'PRICE_RETURN'; assert.throws(() => R.runSignalStudy(p), /BENCHMARK_BASIS/);
  p.benchmark.returnBasis = 'TOTAL_RETURN'; p.listings.push(p.listings[0]); assert.throws(() => R.runSignalStudy(p), /DUPLICATE_LISTING/);
});

test('single-listing replay uses frozen prefix-only selection and leaves descriptive engine intact', () => {
  const o = { ...options([listing('A')]), pattern, cooldownBars: 8 };
  const r = R.runReplayValidation(o); assert.ok(r.events.length); assert.equal(r.kind, 'SAME_STOCK_REPLAY_RULE');
  assert.equal(r.descriptiveViewPreserved, true); assert.ok(r.events.every(e => !e.completed || e.entryDate > e.signalDate));
  for (let k = 1; k < r.events.length; k++) assert.ok((Date.parse(r.events[k].signalDate) - Date.parse(r.events[k - 1].signalDate)) / (7 * 86400000) >= 8);
  assert.throws(() => R.runReplayValidation({ ...options(), pattern, cooldownBars: 8 }), /SINGLE_LISTING/);
});

test('fixed-pattern controls are contemporaneous, independently selected and missing cases stay in denominator', () => {
  const o = { ...options(), pattern, cooldownBars: 4 };
  const r = R.runPatternStudy(o); assert.ok(r.events.length); assert.ok(r.controls.length);
  for (const e of r.events.filter(e => e.matchedExcess !== null)) {
    const controls = r.controls.filter(c => c.signalDate === e.signalDate && c.completed);
    assert.equal(e.matchedControlN, controls.length);
    assert.equal(e.matchedExcess, e.netReturn - controls.reduce((s, c) => s + c.netReturn, 0) / controls.length);
  }
  assert.ok(r.controls.some(e => e.state === 'IMMATURE') || r.coverage.immature > 0);
});

test('ranking is assigned before future prices: missing exits stay in original buckets', () => {
  const ls = [listing('A'), listing('B'), listing('C'), listing('D')];
  ls[3].bars = ls[3].bars.slice(0, 71); ls[3].identity.validTo = day(70);
  const o = { ...options(ls), buckets: 2, factorId: 'VALUE', factorSnapshots: [{ date: day(70), availableAt: day(70) + 'T21:01:00Z', sourceHash: 'cross-section',
    rows: ls.map((l, k) => ({ listingId: l.listingId, value: k, availableAt: day(70) + 'T20:00:00Z', sourceHash: 'factor-' + k })) }] };
  const r = R.runFactorStudy(o); assert.equal(r.events.length, 4); assert.deepEqual(r.events.map(e => [e.listingId, e.bucket]), [['A', 0], ['B', 0], ['C', 1], ['D', 1]]);
  assert.equal(r.events[3].state, 'CENSORED'); assert.equal(r.periods[0].buckets[1].assigned, 2); assert.equal(r.periods[0].buckets[1].completeCohortMean, null); assert.equal(r.periods[0].topMinusBottom, null);
});

test('ranking forbids future factor vintages and reports missing eligible rows', () => {
  const o = { ...options(), buckets: 2, factorId: 'VALUE', factorSnapshots: [{ date: day(70), availableAt: day(70) + 'T21:01:00Z', sourceHash: 'cross-section', rows: [
    { listingId: 'A', value: 3, availableAt: day(71), sourceHash: 'future-vintage' }] }] };
  const r = R.runFactorStudy(o); assert.equal(r.events.length, 0);
  assert.ok(r.periods[0].excluded.some(e => e.reason === 'FACTOR_NOT_AVAILABLE_AT_DECISION'));
  assert.ok(r.periods[0].excluded.some(e => e.listingId === 'B' && e.reason === 'FACTOR_ROW_MISSING_AT_DECISION'));
});

test('setup repeated states are deduplicated; immature M6 outcomes never become completed', () => {
  const o = { ...options([listing('A')]), horizonBars: 26, entryStates: ['CONFIRMED'], setups: [
    { listingId: 'A', date: day(60), availableAt: day(60) + 'T21:02:00Z', sourceHash: 's60', sourceMode: 'SYNTHETIC_TEST', state: 'CONFIRMED' },
    { listingId: 'A', date: day(61), availableAt: day(61) + 'T21:02:00Z', sourceHash: 's61', sourceMode: 'SYNTHETIC_TEST', state: 'CONFIRMED' },
    { listingId: 'A', date: day(160), availableAt: day(160) + 'T21:02:00Z', sourceHash: 's160', sourceMode: 'SYNTHETIC_TEST', state: 'FORMING' },
    { listingId: 'A', date: day(170), availableAt: day(170) + 'T21:02:00Z', sourceHash: 's170', sourceMode: 'SYNTHETIC_TEST', state: 'CONFIRMED' }] };
  const r = R.runSetupStudy(o); assert.equal(r.events.length, 2); assert.equal(r.suppressed.length, 1); assert.equal(r.events[0].completed, true); assert.equal(r.events[1].state, 'IMMATURE');
  o.sourceMode = 'AS_PUBLISHED_PIT'; o.expectedCalendar = o.listings[0].bars.map(b => b.date); assert.throws(() => R.runSetupStudy(o), /RECONSTRUCTED_SETUP/);
});

test('event publication before/after session close selects first executable later close', () => {
  const o = { ...options([listing('A')]), events: [
    { eventId: 'pre', eventType: 'SEC_FILING', listingId: 'A', occurredAt: day(60), publishedAt: day(60) + 'T12:00:00Z', availableAt: day(60) + 'T12:01:00Z', sourceHash: 'filing1' },
    { eventId: 'post', eventType: 'SEC_FILING', listingId: 'A', occurredAt: day(60), publishedAt: day(60) + 'T22:00:00Z', availableAt: day(60) + 'T22:01:00Z', sourceHash: 'filing2' }] };
  const r = R.runEventStudy(o); assert.equal(r.events[0].entryDate, day(60)); assert.equal(r.events[1].entryDate, day(61));
  assert.equal(r.events[0].signalDate, day(60)); assert.equal(r.events[0].completed, true);
  o.events[0].revisionOf = 'earlier'; assert.throws(() => R.runEventStudy(o), /REVISED_EVENT/);
});

test('event timing/identity failures produce no fabricated valid outcome', () => {
  const o = { ...options([listing('A')]), events: [{ eventId: 'e', eventType: 'REPORT', listingId: 'A', occurredAt: day(60), publishedAt: day(60) + 'T22:00:00Z', availableAt: day(60) + 'T12:00:00Z', sourceHash: 'e' }] };
  assert.throws(() => R.runEventStudy(o), /BEFORE_PUBLICATION/);
  o.events[0].availableAt = day(60) + 'T22:00:00Z'; o.listings[0].identity.validFrom = day(80);
  const r = R.runEventStudy(o); assert.equal(r.events[0].state, 'INELIGIBLE'); assert.equal(r.events[0].completed, false);
});

test('supplemental regimes require explicit thresholds and preserve PIT/ex-post separation', () => {
  const bars = listing('A').bars;
  const o = { asOf: day(179), mode: 'PIT_AVAILABLE', bars, lookbackBars: 26, volatilityLookbackBars: 13, trendBand: 0.05, volatilityThreshold: 0.1, annualization: 52 };
  const r = R.classifyRegimes(o); assert.equal(r.regimes.length, 154); assert.ok(r.regimes.every(x => x.availableAt && x.sourceHash));
  assert.equal(r.replacesActiveMarketRegimeHistory, false);
  const a = { ...o, asOf: day(100) }, b = structuredClone(a); b.bars[170].close = 1e9;
  assert.deepEqual(R.classifyRegimes(a).regimes, R.classifyRegimes(b).regimes);
  delete o.bars[30].sourceHash; assert.throws(() => R.classifyRegimes(o), /VINTAGE/);
});

test('PIT regime grouping withholds labels unavailable at decision; ex-post never becomes trading evidence', () => {
  const o = { mode: 'PIT_AVAILABLE', regimes: [{ date: day(60), state: 'UP', availableAt: day(61), sourceHash: 'r' }], observations: [{ signalDate: day(60), listingId: 'A', issuerId: 'I', netReturn: 0.1, decisionAt: day(60) + 'T22:00:00Z' }] };
  assert.equal(R.analyzeRegimes(o).unmatched.length, 1);
  const r = R.analyzeRegimes({ ...o, mode: 'EX_POST_DESCRIPTIVE' }); assert.equal(r.states.length, 1); assert.match(r.scope, /POST_HOC/); assert.equal(r.productionApproved, false);
});

test('two-way cluster inference has no interval with one issuer and rank correlation handles ties', () => {
  assert.equal(R.inference([{ issuerId: 'I', timeCluster: 'T', netReturn: 0.1 }]).interval95, null);
  assert.equal(R.rankCorrelation([{ factor: 1, netReturn: 1 }, { factor: 2, netReturn: 2 }, { factor: 2, netReturn: 2 }]), 1);
  assert.equal(R.rankCorrelation([{ factor: 1, netReturn: 2 }, { factor: 1, netReturn: 3 }]), null);
});

export { options, listing, day, pattern };


test('causal timestamps reject absent fill times, delayed price revisions and unavailable outcomes', () => {
  const o = { ...options([listing('A')]), pattern, cooldownBars: 8 };
  for (const b of o.listings[0].bars) delete b.closeAt;
  assert.ok(R.runReplayValidation(o).events.every(e => e.state === 'INELIGIBLE' || e.state === 'IMMATURE'));
  const p = { ...options([listing('A')]), pattern, cooldownBars: 8, sourceMode: 'AS_PUBLISHED_PIT', expectedCalendar: listing('A').bars.map(b => b.date) };
  p.listings[0].bars[0].availableAt = day(179) + 'T22:00:00Z';
  assert.ok(R.runReplayValidation(p).events.filter(e => e.entryDate && e.exitDate).every(e => e.reasons.includes('FEATURE_VINTAGE_NOT_AVAILABLE_AT_SIGNAL')));
  const q = { ...options([listing('A')]), pattern, cooldownBars: 8 };
  const first = R.runReplayValidation(q).events.find(e => e.completed);
  q.listings[0].bars.find(b => b.date === first.exitDate).availableAt = day(190);
  assert.ok(R.runReplayValidation(q).events.some(e => e.state === 'IMMATURE' || e.state === 'INELIGIBLE'));
});

test('in-universe missing price data prevents complete-cohort base-rate claims', () => {
  const o = options();
  const first = R.runSignalStudy(o).events.find(e => e.listingId === 'A' && e.completed);
  assert.ok(first);
  o.listings[1].bars = o.listings[1].bars.filter(b => b.date !== first.signalDate);
  const r = R.runSignalStudy(o), b = r.baseRates.find(b => b.signalDate === first.signalDate);
  assert.equal(b.completeCohortMean, null);
  assert.ok(b.population.some(e => e.listingId === 'B' && e.state === 'CENSORED'));
});

test('actual historical input needs observed calendar and confirmatory candidates need prior rule freeze', () => {
  const o = options(); o.sourceMode = 'HISTORICAL_SIMULATION'; assert.throws(() => R.runSignalStudy(o), /OBSERVED_CALENDAR_REQUIRED/);
  const p = options(); p.registration.analysisMode = 'CONFIRMATORY_CANDIDATE'; p.registration.frozenAt = day(200);
  assert.ok(R.runSignalStudy(p).events.every(e => e.state === 'INELIGIBLE'));
});


test('missing next session and warmup bar never silently lengthen signal windows', () => {
  const o = options(); o.expectedCalendar = o.listings[0].bars.map(b => b.date);
  o.listings[0].bars.splice(30, 1);
  const r = R.runSignalStudy(o);
  assert.ok(r.dataIssues.some(x => x.listingId === 'A'));
  assert.ok(r.events.filter(e => e.listingId === 'A' && e.signalDate <= day(95)).every(e => e.state === 'INELIGIBLE'));
  assert.ok(r.events.some(e => e.listingId === 'A' && e.signalDate > day(100) && e.completed));
  const p = { ...options([listing('A')]), pattern, cooldownBars: 8 }; p.expectedCalendar = p.listings[0].bars.map(b => b.date);
  const first = R.runReplayValidation(p).events.find(e => e.completed);
  p.listings[0].bars = p.listings[0].bars.filter(b => b.date !== first.entryDate);
  const after = R.runReplayValidation(p).events.find(e => e.signalDate === first.signalDate); assert.equal(after.state, 'CENSORED');
});


test('availability timestamps reject local strings and overflow dates; source dependencies and runtime are pinned', () => {
  const o = options(); o.registration.frozenAt = '10/01/2009'; assert.throws(() => R.runSignalStudy(o), /INVALID_TIME/);
  o.registration.frozenAt = '2009-02-30'; assert.throws(() => R.runSignalStudy(o), /INVALID_TIME/);
  const r = R.runSignalStudy(options()); assert.equal(r.calculationProvenance.runtime.node, process.version);
  assert.ok(r.calculationProvenance.sourceHashes['signal-backtest.js']);
  assert.ok(r.calculationProvenance.runtime.binarySha256);
});


test('missing mature active-listing data is censored using the full observed calendar', () => {
  const ls = [listing('A'), listing('B')]; ls[1].bars = ls[1].bars.slice(0, 71);
  const o = { ...options(ls), expectedCalendar: ls[0].bars.map(b => b.date), buckets: 2, factorId: 'VALUE', factorSnapshots: [{ date: day(70), availableAt: day(70) + 'T21:01:00Z', sourceHash: 'cross-section', rows: ls.map((l,k) => ({listingId:l.listingId,value:k,availableAt:day(69),sourceHash:'factor'})) }] };
  const r = R.runFactorStudy(o); assert.equal(r.events[1].state, 'CENSORED'); assert.equal(r.coverage.immature, 0); assert.equal(r.coverage.censored, 1);
});

test('setup predeclared entry/exit variants delay executions beyond close triggers', () => {
  const o = { ...options([listing('A')]), entryStates:['CONFIRMED'], entryVariants:[{id:'NEXT',delayBars:1},{id:'DELAY',delayBars:2}], exitVariants:[{id:'TIME',type:'TIME_EXIT',horizonBars:26},{id:'TARGET',type:'TARGET_CLOSE',horizonBars:26}], setups:[{listingId:'A',date:day(60),availableAt:day(60)+'T21:02:00Z',sourceHash:'setup',sourceMode:'SYNTHETIC_TEST',state:'CONFIRMED',targetLevel:1,levelBasis:'SIGNAL_SERIES'}] };
  const r=R.runSetupStudy(o); assert.equal(r.events.length,4);
  const target=r.events.find(e=>e.entryVariant==='NEXT'&&e.exitVariant==='TARGET'); assert.equal(target.entryDate,day(61)); assert.equal(target.exitDate,day(63)); assert.equal(target.exitReason,'TARGET_CLOSE');
  const delayed=r.events.find(e=>e.entryVariant==='DELAY'&&e.exitVariant==='TIME'); assert.equal(delayed.entryDate,day(62)); assert.equal(delayed.exitDate,day(88));
});

test('predeclared factor dependence is computed from PIT values without forward outcomes', () => {
  const ls=[listing('A'),listing('B'),listing('C')];
  const o={...options(ls),buckets:2,factorId:'VALUE',interactionFactorIds:['VALUE','MOMENTUM'],factorSnapshots:[{date:day(70),availableAt:day(70)+'T21:01:00Z',sourceHash:'cross',rows:ls.map((l,k)=>({listingId:l.listingId,value:k,availableAt:day(69),sourceHash:'factor',factors:{VALUE:k,MOMENTUM:3-k}}))}]};
  const r=R.runFactorStudy(o);assert.equal(r.periods[0].factorDependence[0].spearman,-1);assert.equal(r.periods[0].factorDependence[0].n,3);
});


test('registered execution delays affect prices without changing frozen signal dates', () => {
  const o=options(), a=R.runSignalStudy(o), b=R.runSignalStudy({...o,entryDelayBars:2});
  assert.deepEqual(a.events.map(e=>e.signalDate),b.events.map(e=>e.signalDate));
  const first=a.events.find(e=>e.completed), delayed=b.events.find(e=>e.listingId===first.listingId&&e.ruleId===first.ruleId&&e.signalDate===first.signalDate);
  assert.equal(Date.parse(delayed.entryDate)-Date.parse(first.entryDate),7*86400000);
  assert.notEqual(first.netReturn,delayed.netReturn);
  assert.throws(()=>R.runSignalStudy({...o,entryDelayBars:0}),/ENTRY_DELAY/);
});

test('a later source gap does not change earlier completed events', () => {
  const o=options();o.expectedCalendar=o.listings[0].bars.map(b=>b.date);
  const before=R.runSignalStudy(o).events.filter(e=>e.completed&&e.exitDate<day(150));
  o.listings[0].bars=o.listings[0].bars.filter(b=>b.date!==day(170));
  const after=R.runSignalStudy(o).events.filter(e=>e.completed&&e.exitDate<day(150));
  assert.deepEqual(before,after);
});


test('pattern controls never treat missing contemporaneous listings as observed non-cases', () => {
  const o={...options(),pattern,cooldownBars:4}, before=R.runPatternStudy(o);
  const first=before.events.find(e=>e.listingId==='A'&&e.matchedExcess!==null);assert.ok(first);
  o.listings[1].bars=o.listings[1].bars.filter(b=>b.date!==first.signalDate);
  const r=R.runPatternStudy(o), after=r.events.find(e=>e.listingId==='A'&&e.signalDate===first.signalDate);
  assert.equal(after.matchedExcess,null);assert.ok(r.controlCoverage.find(x=>x.signalDate===first.signalDate).unknownListingIds.includes('B'));
});

test('historical setup state calculation delegates the approved mapping and preserves reconstruction labels', () => {
  const setupMethodology=require('../methodology/setup-state-v1.json');
  const row={status:'active',technicalTrend:'BULLISH',technicalConfirmedStructure:'BULLISH',technicalStructure:'BULLISH',technicalSetupStatus:'COMPLETE',technicalPrimaryDirection:'BULLISH',technicalEntryStatus:'AWAITING_TRIGGER',technicalVolumeState:'EXPANSION',technicalMomentumState:'POSITIVE',technicalVolatilityRegime:'NORMAL',technicalDistanceTo52wHigh:-0.02};
  const input={setupMethodology,technicalSnapshots:[{listingId:'A',date:day(60),dataCutoff:day(60),availableAt:day(60)+'T21:02:00Z',sourceHash:'snapshot',rowSourceMode:'HISTORICAL_SIMULATION',close:100,row}]};
  const states=R.buildSetupStates(input);assert.equal(states[0].state,'CONFIRMED');assert.equal(states[0].sourceMode,'HISTORICAL_SIMULATION');
  input.technicalSnapshots[0].dataCutoff=day(61);assert.throws(()=>R.buildSetupStates(input),/CUTOFF/);
});


test('bounded work rejects oversized horizon/grid estimates before costly loops', () => {
  const o={...options([listing('A')]),pattern,cooldownBars:8,horizonBars:100000000};
  assert.throws(()=>R.runReplayValidation(o),/REPLAY_WORK_BUDGET/);
  assert.throws(()=>R.runPatternStudy(o),/PATTERN_WORK_BUDGET/);
  assert.throws(()=>R.runEventStudy({...o,events:[{}]}),/EVENT_WORK_BUDGET/);
  const r=R.runReplayValidation({...o,horizonBars:4});assert.ok(r.events.length);
});
