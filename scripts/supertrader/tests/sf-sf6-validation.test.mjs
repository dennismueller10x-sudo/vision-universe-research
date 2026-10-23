// Supertrader 6.0 – Validierungslauf (Kosten, Perioden, Regime, Liquiditaet, Konzentration) und Modellvarianten fuer die
// fehlende Phase von Pocket Pivot (Stop) und Holy Grail (Trailing). Synthetisch; der echte Lauf braucht den Snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validationPart, SF6_VALIDATION_PROTOCOL, sf6ValidationProtocolSha256, tradeStats, concentration, makeClassifiers } from '../source-faithful/research/run-sf6-validation.mjs';
import { SF6_REFERENCE_KEYS } from '../source-faithful/research/sf6-references.mjs';
import { SF6_MODEL_VARIANTS, SF6_MODEL_ASSUMPTIONS, sf6ModelVariantsSha256, hgTrailOnClose, PP_MODEL_STOP_ADAPTER } from '../source-faithful/research/sf6-model-variants.mjs';
import { lifecyclePart } from '../source-faithful/research/run-sf5-lifecycle.mjs';
import { runResearchLifecycle, prepareAll } from '../source-faithful/research/lifecycle-engine.mjs';
import { PP_REFERENCE_CONFIG } from '../source-faithful/research/moka-lifecycle.mjs';
import { sf5VariantRegistrySha256 } from '../source-faithful/research/sf5-lifecycles.mjs';

// pinned before the first snapshot result of Supertrader 6.0 was read
const PINNED_PROTOCOL = '5baf98a188e2ab88fd0876f12ccb6b8630813005639b01b52f735750f243d6f8';
const PINNED_MODEL_VARIANTS = '9244826ebc4cdc5212d91b88f40412f11686cf8ba3960edefa266e329ff0b5c4';
const PINNED_SF5_VARIANT_REGISTRY = '0a1260e9d087b1cde8176b66134e19b32222f94653d46df31c495d02552940da';

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
      bars.push({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1, dividend: 0 });
    }
    secs.push({ id: `S${String(s).padStart(3, '0')}`, bars, terminal: null });
  }
  return { calendar: secs[0].bars.map((b) => b.date), securities: secs, spyTR: secs[0].bars.map((b) => ({ date: b.date, value: b.close })), benchmark: secs[0].bars };
}
const W = { from: day(0), to: day(699) };
const METRIC_KEYS = /"(cagr|sharpe|sortino|winRate|profitFactor|expectancyPct|pnl|sumPnl|netPnl|equity|returnPct|avgWinPct|avgLossPct|maxDrawdown)"/;

test('SF6-VALIDATION-PREREGISTERED: Protokoll und Modellvarianten festgeschrieben; sf5-Register unveraendert', () => {
  assert.equal(sf6ValidationProtocolSha256(), PINNED_PROTOCOL);
  assert.equal(sf6ModelVariantsSha256(), PINNED_MODEL_VARIANTS);
  assert.equal(sf5VariantRegistrySha256(), PINNED_SF5_VARIANT_REGISTRY, 'die Modellvarianten aendern das sf5-Register nicht');
  assert.deepEqual(SF6_VALIDATION_PROTOCOL.costLevels.map((c) => c.id), ['COST-0', 'REF', 'COST-20', 'COST-50']);
  assert.ok(SF6_MODEL_ASSUMPTIONS.every((m) => m.notASourceRule === true && /SOURCE_BLOCKED/.test(m.sourceStatus)), 'Modellannahmen sind nie Quellenregeln');
  assert.ok(SF6_MODEL_VARIANTS.every((v) => v.adapter.label === 'MODEL_LIFECYCLE_STUDY_SF6_MODEL_VARIANT'));
});

test('SF6-VALIDATION-REF-EQUALS-SF5: REF-Kostenstufe ist trade-genau die sf5-Referenz; oeffentlich nur Zaehlungen', () => {
  const ds = dataset();
  const keys = SF6_REFERENCE_KEYS.filter((k) => !k.startsWith('WEINSTEIN')); // Weinstein needs ~2 years of weekly warm-up; covered by the snapshot run
  const r = validationPart(ds, { ...W, keys });
  const sf5 = lifecyclePart(ds, { ...W, keys: ['DARVAS', 'KK_BREAKOUT', 'POCKET_PIVOT', 'BUYABLE_GAP_UP', 'HOLY_GRAIL_W_RAS97'] }).pub;
  for (const k of Object.keys(sf5.strategies)) assert.equal(r.pub.references[k].costLevels.REF.tradesSha256, sf5.strategies[k].variants.REF.tradesSha256, k);
  for (const k of keys) {
    assert.deepEqual(Object.keys(r.pub.references[k].costLevels), ['COST-0', 'REF', 'COST-20', 'COST-50']);
    for (const c of Object.values(r.pub.references[k].costLevels)) assert.ok(c.reconciliation, k);
    assert.ok(r.pub.references[k].splits.byRegime, k);
  }
  assert.ok(Object.values(r.pub.references).some((x) => x.costLevels.REF.trades > 0));
  assert.doesNotMatch(JSON.stringify(r.pub), METRIC_KEYS);
  assert.ok(r.sealed.references.TURTLE_S1.splits.concentration, 'Konzentration nur versiegelt');
  assert.deepEqual(Object.keys(r.pub.models).sort(), SF6_MODEL_VARIANTS.map((v) => v.id).sort());
});

test('SF6-MODEL-PP-STOP: Stop am Tief des Signaltags, Einstieg und Groesse unveraendert, jede andere Phase gleich', () => {
  const ds = dataset();
  const ref = runResearchLifecycle(ds, { adapter: PP_MODEL_STOP_ADAPTER, config: PP_REFERENCE_CONFIG, prepared: prepareAll(ds, PP_MODEL_STOP_ADAPTER, PP_REFERENCE_CONFIG), ...W });
  assert.ok(ref.trades.length > 0);
  const byId = new Map(ds.securities.map((s) => [s.id, s.bars]));
  for (const t of ref.trades) {
    const bars = byId.get(t.id), i = bars.findIndex((b) => b.date === t.signalDate);
    assert.equal(t.initialStop, bars[i].low, 'Stop = Tief des Pocket-Pivot-Tages');
    assert.equal(t.entryBasis, 'OPEN');
    assert.ok(Math.abs(t.weight - 0.10) < 0.02 || t.weight < 0.10, 'Gewicht 10 % (Bargeld kann kuerzen)');
  }
  assert.ok(ref.trades.some((t) => /STOP/.test(t.exitReason ?? '')), 'der Modellstop greift');
});

test('SF6-MODEL-HG-TRAIL: Swing-Tief wird erst nach einem Schluss ueber dem bisherigen Hoch zum Stop; nur anheben, nie am selben Balken', () => {
  const raised = [];
  const pos = { state: {}, trade: { setupEvidence: { impulseHigh: 110, swingLow: 95 } } };
  const api = { raiseStop: (lvl, rule) => raised.push([lvl, rule]) };
  const bars = [
    { close: 105, high: 106, low: 100 }, // below impulse high: pullback low stays 95 (min)
    { close: 112, high: 113, low: 108 }, // close above 110 -> raise to 95; new high 113 -> new swing begins
    { close: 109, high: 111, low: 104 }, // pullback, low 104
    { close: 108, high: 109, low: 103 }, // pullback low 103
    { close: 114, high: 115, low: 107 }, // close above 113 -> raise to 103
  ];
  bars.forEach((b, i) => hgTrailOnClose(pos, { bars }, i, api));
  assert.deepEqual(raised.map((r) => r[0]), [95, 103]);
  assert.ok(raised.every((r) => r[1] === 'MA6_HG_TRAIL_SWING_LOW'));
});

test('SF6-VALIDATION-STATS: Trefferquote, Erwartungswert, Profitfaktor, Konzentration und Klassen vor dem Einstieg', () => {
  const t = (pnl, r, h = 5) => ({ status: 'CLOSED', pnl, returnPct: r, heldSessions: h });
  const s = tradeStats([t(100, 0.1), t(-50, -0.05), t(200, 0.2), { status: 'OPEN_AT_DATA_END', pnl: null }]);
  assert.equal(s.closed, 3); assert.ok(Math.abs(s.winRate - 2 / 3) < 1e-12); assert.equal(s.profitFactor, 6); assert.ok(Math.abs(s.expectancyPct - 0.25 / 3) < 1e-12); assert.equal(s.sumPnl, 250);
  const c = concentration([t(100, 0), t(-50, 0), t(200, 0)], 1);
  assert.ok(Math.abs(c.topShareOfPositivePnl - 200 / 300) < 1e-12); assert.equal(c.netPnlWithoutTopN, 50);
  const ds = dataset(2, 260); ds.benchmark = ds.securities[0].bars;
  const cls = makeClassifiers(ds);
  assert.equal(cls.regime(day(100)), 'UNKNOWN', 'vor 200 Sitzungen keine SMA200');
  assert.match(cls.regime(day(230)), /^SPY_(ABOVE|AT_OR_BELOW)_SMA200$/);
  assert.equal(cls.liquidity('S001', day(10)), 'UNKNOWN');
  assert.match(cls.liquidity('S001', day(50)), /^(LT_1M|1M_TO_5M|5M_TO_25M|GE_25M)$/);
  // known at the decision: the regime of an entry day does not change when the entry-day bar changes
  const before = cls.regime(day(230)); ds.benchmark[230] = { ...ds.benchmark[230], close: 1e9 };
  assert.equal(makeClassifiers(ds).regime(day(230)), before);
});
