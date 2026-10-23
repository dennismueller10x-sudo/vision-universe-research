// Supertrader 5.0 – Weinstein-Variante ALT-SIC3-GROUP-PROXY (research/weinstein-lifecycle.mjs): die vom Owner am
// 21.10.2026 freigegebene Research-Referenz SIC3-EW-MIN5-400D-WIDE als klar gekennzeichnete Variante, nie als Regel.
// Referenz unveraendert, fail closed ohne Gruppenindex, PIT der Gruppenevidenz, UNKNOWN blockiert nie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchLifecycle } from '../source-faithful/research/lifecycle-engine.mjs';
import { WEINSTEIN_INVESTOR_ADAPTER, WEINSTEIN_TRADER_ADAPTER, WEIN_INVESTOR_REFERENCE_CONFIG, WEIN_TRADER_REFERENCE_CONFIG, WEIN_INVESTOR_RUN_VARIANTS, WEIN_TRADER_RUN_VARIANTS, WEIN_GROUP_PROXY_ID, WEIN_GROUP_PROXY, WEIN_DATA_EXCEPTION, validateWeinInvestorConfig, validateWeinTraderConfig, groupProxyEvidence } from '../source-faithful/research/weinstein-lifecycle.mjs';
import { buildGroupStrength, GROUP_VARIANTS } from '../source-faithful/research/industry-strength.mjs';
import { isoWeekKey } from '../engine/indicators.mjs';
import { requiredGroupProxies, groupProxyCoverage } from '../source-faithful/research/run-sf5-lifecycle.mjs';
import { prepareAll } from '../source-faithful/research/lifecycle-engine.mjs';
import { WEINSTEIN_INVESTOR } from '../source-faithful/contracts/weinstein.mjs';

const day = (k) => new Date(Date.UTC(2019, 0, 7) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, c, v = 1e6) => ({ date: day(k), open: c, high: c * 1.01, low: c * 0.99, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const N = 560;
/** Stage 4 decline, Stage 1 base, Stage 2 breakout with volume, correction, new high, decline (as the lifecycle test) */
const stockPx = (k) => (k < 210 ? 50 - (20 * k) / 210 : k < 420 ? 30 + 1.5 * Math.sin(k / 9) : k < 470 ? 30 + (k - 420) * 0.3 : k < 490 ? 45 - (k - 470) * 0.25 : k < 530 ? 40 + (k - 490) * 0.2 : 48 - (k - 530) * 0.4);
const stock = () => ({ id: 'WEIN', bars: Array.from({ length: N }, (_, k) => bar(k, stockPx(k), k >= 420 && k < 430 ? 4e6 : 1e6)) });
const peer = (i, drift) => ({ id: `P${i}`, bars: Array.from({ length: N }, (_, k) => bar(k, 40 * Math.exp(drift * k) * (1 + 0.002 * Math.sin(k / 5 + i)))) });
const dsOf = (secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const membershipAll = (unknownIds = []) => ({ groupOf: (id) => (unknownIds.includes(id) ? null : 'SIC3:100') });
const withProxy = (d, membership) => { d.groupProxies = { [WEIN_GROUP_PROXY_ID]: buildGroupStrength(d, membership, { minMembers: WEIN_GROUP_PROXY.minMembers }) }; return d; };
const run = (kind, d, cfg) => runResearchLifecycle(d, { adapter: kind === 'INVESTOR' ? WEINSTEIN_INVESTOR_ADAPTER : WEINSTEIN_TRADER_ADAPTER, config: cfg });
const refOf = (kind) => (kind === 'INVESTOR' ? WEIN_INVESTOR_REFERENCE_CONFIG : WEIN_TRADER_REFERENCE_CONFIG);
const varOf = (kind) => (kind === 'INVESTOR' ? WEIN_INVESTOR_RUN_VARIANTS : WEIN_TRADER_RUN_VARIANTS).find((v) => v.id === 'ALT-SIC3-GROUP-PROXY').config;
const tradeKey = (r) => r.trades.map((t) => [t.id, t.entryDate, t.entryFill, t.exitDate, t.exitReason, t.shares]);

test('SF5-WEIN-GROUP-PROXY-DECLARED: Variante nennt nur die freigegebene Research-Referenz; Referenz und Datenausnahme unveraendert', () => {
  assert.equal(WEIN_GROUP_PROXY.id, 'SIC3-EW-MIN5-400D-WIDE');
  assert.equal(WEIN_GROUP_PROXY.role, 'BASELINE_FOR_COMPARISON');
  assert.equal(WEIN_GROUP_PROXY.sourceStatus, 'VU_PROXY_OF_WEINSTEIN_GROUP_CHART');
  for (const kind of ['INVESTOR', 'TRADER']) {
    assert.equal('groupProxy' in refOf(kind), false, `${kind}: Referenz ohne Gruppenfilter`);
    assert.equal(varOf(kind).groupProxy, WEIN_GROUP_PROXY_ID);
    assert.equal(varOf(kind).dataException, 'GROUP_AND_MARKET_NOT_APPLIED', 'die Variante hebt die Datenausnahme nicht auf');
  }
  assert.deepEqual(validateWeinInvestorConfig(varOf('INVESTOR')), []);
  assert.deepEqual(validateWeinTraderConfig(varOf('TRADER')), []);
  for (const other of GROUP_VARIANTS.filter((v) => v.id !== WEIN_GROUP_PROXY_ID)) assert.deepEqual(validateWeinInvestorConfig({ ...WEIN_INVESTOR_REFERENCE_CONFIG, groupProxy: other.id }), ['GROUP_PROXY_NOT_APPROVED'], other.id);
  // the contract keeps the rule blocked, the adapter keeps both exceptions and its label
  assert.equal(WEINSTEIN_INVESTOR.rules.find((r) => r.id === 'WEIN-SF-GROUP').status, 'DATA_BLOCKED');
  assert.equal(WEIN_DATA_EXCEPTION.length, 2);
  assert.equal(WEINSTEIN_INVESTOR_ADAPTER.label, 'MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION_NOT_A_STRATEGY_BACKTEST');
  assert.equal(WEINSTEIN_INVESTOR_ADAPTER.prepareKey(refOf('INVESTOR')), 'INVESTOR', 'Referenz teilt ihre Vorbereitung wie bisher');
  assert.deepEqual(requiredGroupProxies(), [WEIN_GROUP_PROXY_ID]);
  assert.deepEqual(requiredGroupProxies(['DARVAS', 'KK_BREAKOUT']), []);
});

test('SF5-WEIN-GROUP-PROXY-FAIL-CLOSED: ohne Gruppenindex laeuft die Variante nicht', () => {
  const d = dsOf([stock(), ...[1, 2, 3, 4, 5].map((i) => peer(i, -0.002))]);
  for (const kind of ['INVESTOR', 'TRADER']) assert.throws(() => run(kind, d, varOf(kind)), /GROUP_PROXY_NOT_BUILT/);
});

test('GC-SF5-WEIN-GROUP-PROXY-NEGATIVE: Gruppe unter fallender MA30w -> Buy-Stop entfaellt; Referenz unberuehrt', () => {
  for (const kind of ['INVESTOR', 'TRADER']) {
    const d = withProxy(dsOf([stock(), ...[1, 2, 3, 4, 5].map((i) => peer(i, -0.002))]), membershipAll());
    const ref = run(kind, d, refOf(kind)), alt = run(kind, d, varOf(kind));
    const plain = run(kind, dsOf([stock(), ...[1, 2, 3, 4, 5].map((i) => peer(i, -0.002))]), refOf(kind));
    assert.deepEqual(tradeKey(ref), tradeKey(plain), `${kind}: Gruppenindex aendert die Referenz nicht`);
    assert.ok(ref.trades.some((t) => t.id === 'WEIN'), `${kind}: Referenz handelt den Ausbruch`);
    assert.equal(alt.trades.filter((t) => t.id === 'WEIN').length, 0, `${kind}: Variante kauft nicht in negativer Proxy-Gruppe`);
    assert.ok(alt.counts.eligibilityBlockers.GROUP_PROXY_BELOW_FALLING_MA30W > 0);
    assert.equal(ref.counts.eligibilityBlockers.GROUP_PROXY_BELOW_FALLING_MA30W, undefined);
  }
});

test('GC-SF5-WEIN-GROUP-PROXY-HEALTHY-AND-UNKNOWN: steigende Gruppe oder unbekannte Mitgliedschaft blockieren nie', () => {
  for (const kind of ['INVESTOR', 'TRADER']) {
    const up = withProxy(dsOf([stock(), ...[1, 2, 3, 4, 5].map((i) => peer(i, 0.002))]), membershipAll());
    assert.deepEqual(tradeKey(run(kind, up, varOf(kind))), tradeKey(run(kind, up, refOf(kind))), `${kind}: gesunde Gruppe`);
    const unknown = withProxy(dsOf([stock(), ...[1, 2, 3, 4, 5].map((i) => peer(i, -0.002))]), membershipAll(['WEIN']));
    const r = run(kind, unknown, varOf(kind));
    assert.deepEqual(tradeKey(r), tradeKey(run(kind, unknown, refOf(kind))), `${kind}: UNKNOWN ist weder negativ noch gesund`);
    const cov = groupProxyCoverage(prepareAll(unknown, kind === 'INVESTOR' ? WEINSTEIN_INVESTOR_ADAPTER : WEINSTEIN_TRADER_ADAPTER, varOf(kind)));
    assert.ok(cov.byStatus.UNKNOWN_MEMBERSHIP > 0);
  }
});

test('SF5-WEIN-GROUP-PROXY-PIT: Gruppenevidenz eines Setups haengt nur von Daten bis zum Entscheidungsschluss ab', () => {
  const secs = [stock(), ...[1, 2, 3, 4, 5].map((i) => peer(i, -0.0015))];
  const full = withProxy(dsOf(secs), membershipAll());
  const prepared = prepareAll(full, WEINSTEIN_INVESTOR_ADAPTER, varOf('INVESTOR')).get('WEIN');
  let checked = 0;
  for (const s of [...prepared.setupFor.values()].filter((_, n) => n % 3 === 0)) {
    // decision close: the last calendar session of the week before the order week
    const decision = full.calendar.filter((d) => isoWeekKey(d) < s.weekKey).at(-1);
    // every bar after the decision close is replaced by a different path: the evidence must not move
    const alter = (x, i) => ({ ...x, bars: x.bars.map((b, k) => (b.date <= decision ? b : bar(k, b.close * (0.5 + ((k * 7 + i) % 11) / 10), 9e6))) });
    const cut = dsOf(secs.map(alter));
    const builtCut = buildGroupStrength(cut, membershipAll(), { minMembers: WEIN_GROUP_PROXY.minMembers });
    assert.deepEqual(groupProxyEvidence(builtCut, 'WEIN', s.weekKey), s.groupProxy, `week ${s.weekKey}`);
    if (s.groupProxy.label) checked++;
  }
  assert.ok(checked > 3, `known labels compared: ${checked}`);
});

test('SF5-WEIN-GROUP-PROXY-PIT-MEMBERSHIP: eine SIC-Aenderung nach dem Entscheidungsschluss aendert die Evidenz nicht', () => {
  // WEIN moves from a falling group (P1-P5) to a rising group (Q1-Q5) in the middle of its Stage 2
  const secs = [stock(), ...[1, 2, 3, 4, 5].map((i) => peer(i, -0.0015)), ...[1, 2, 3, 4, 5].map((i) => ({ ...peer(i, 0.002), id: `Q${i}` }))];
  const switchDate = day(450);
  const member = (sw) => ({ groupOf: (id, date) => (id.startsWith('Q') ? 'SIC3:200' : id.startsWith('P') ? 'SIC3:100' : date < sw ? 'SIC3:100' : 'SIC3:200') });
  const full = withProxy(dsOf(secs), member(switchDate));
  const setups = [...prepareAll(full, WEINSTEIN_INVESTOR_ADAPTER, varOf('INVESTOR')).get('WEIN').setupFor.values()];
  const groups = new Set(setups.map((s) => s.groupProxy.group));
  assert.ok(groups.has('SIC3:100') && groups.has('SIC3:200'), 'membership change is visible in the full run');
  let checked = 0;
  for (const s of setups.filter((_, n) => n % 2 === 0)) {
    const decision = full.calendar.filter((d) => isoWeekKey(d) < s.weekKey).at(-1);
    // a membership that differs only after the decision close (an earlier switch must not leak into the order week)
    const late = { groupOf: (id, date) => (date <= decision ? member(switchDate).groupOf(id, date) : id === 'WEIN' ? 'SIC3:777' : member(switchDate).groupOf(id, date)) };
    const builtLate = buildGroupStrength(dsOf(secs), late, { minMembers: WEIN_GROUP_PROXY.minMembers });
    assert.deepEqual(groupProxyEvidence(builtLate, 'WEIN', s.weekKey), s.groupProxy, `week ${s.weekKey}`);
    checked++;
  }
  assert.ok(checked > 5);
});
