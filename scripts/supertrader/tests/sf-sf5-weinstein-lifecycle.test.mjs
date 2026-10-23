// Supertrader 5.0 – Weinstein Stage 2 Investor / Trader Trade Lifecycle (research/weinstein-lifecycle.mjs) auf der
// gemeinsamen Engine. Modellstudie MIT DATENAUSNAHME (Gruppe, Markt). Aequivalenz zu den abgenommenen Wochen-Screens,
// Golden Cases, WEIN-VOL5, Trailing, PIT. Simuliert nur Research-Trades; kein Kaufsignal, keine Order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchLifecycle } from '../source-faithful/research/lifecycle-engine.mjs';
import { WEINSTEIN_INVESTOR_ADAPTER, WEINSTEIN_TRADER_ADAPTER, WEIN_INVESTOR_REFERENCE_CONFIG, WEIN_TRADER_REFERENCE_CONFIG, WEIN_INVESTOR_RUN_VARIANTS, WEIN_TRADER_RUN_VARIANTS, validateWeinInvestorConfig, validateWeinTraderConfig, weinsteinWeeklySetups, weinVariantRegistrySha256 } from '../source-faithful/research/weinstein-lifecycle.mjs';
import { investorScreen, traderScreen } from '../source-faithful/methods/weinstein.mjs';
import { WEINSTEIN_INVESTOR } from '../source-faithful/contracts/weinstein.mjs';

const PINNED_WEIN_VARIANTS = '984733b4fb3669fa94b7fb6b9ff4e320abfb83b620b02bb09f0acf1cb79a80df';
const day = (k) => new Date(Date.UTC(2019, 0, 7) + k * 864e5).toISOString().slice(0, 10); // 2019-01-07 is a Monday
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const runW = (kind, d, changes = {}) => runResearchLifecycle(d, { adapter: kind === 'INVESTOR' ? WEINSTEIN_INVESTOR_ADAPTER : WEINSTEIN_TRADER_ADAPTER, config: { ...(kind === 'INVESTOR' ? WEIN_INVESTOR_REFERENCE_CONFIG : WEIN_TRADER_REFERENCE_CONFIG), ...changes } });

/** Stage 4 decline, Stage 1 base (oscillating), Stage 2 breakout with volume, 11 % correction, new high, decline */
function stageScenario({ breakoutVolume = 4e6 } = {}) {
  const px = (k) => (k < 210 ? 50 - (20 * k) / 210 : k < 420 ? 30 + 1.5 * Math.sin(k / 9) : k < 470 ? 30 + (k - 420) * 0.3 : k < 490 ? 45 - (k - 470) * 0.25 : k < 530 ? 40 + (k - 490) * 0.2 : 48 - (k - 530) * 0.4);
  const bars = []; for (let k = 0; k < 560; k++) { const c = px(k); bars.push(bar(k, c, c * 1.01, c * 0.99, c, k >= 420 && k < 430 ? breakoutVolume : 1e6)); }
  return { id: 'WEIN', bars };
}
function walk(seed, n = 900) {
  let x = seed >>> 0; const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; };
  const bars = []; let c = 30;
  for (let k = 0; k < n; k++) { const o = c * (1 + (rnd() - 0.5) * 0.01); c = Math.max(6, o * (1 + Math.sin(k / 90) * 0.003 + (rnd() - 0.5) * 0.03)); bars.push(bar(k, o, Math.max(o, c) * (1 + rnd() * 0.01), Math.min(o, c) * (1 - rnd() * 0.01), c, 1e6 * (0.5 + rnd() * (rnd() < 0.05 ? 6 : 1)))); }
  return { id: `W${seed}`, bars };
}

test('GC-SF5-WEIN-SCREEN-EQUIV: Wochen-Setups und Ausbruchswochen identisch mit investorScreen / traderScreen', () => {
  let compared = 0;
  for (const s of [stageScenario(), walk(3), walk(17), walk(23)]) {
    for (const kind of ['INVESTOR', 'TRADER']) {
      const r = weinsteinWeeklySetups(s.bars, kind), screen = kind === 'INVESTOR' ? investorScreen : traderScreen;
      for (let w = 2; w < r.weeks.length; w++) {
        const rec = screen(s, { week: w }), st = r.setupFor.get(w), hit = Boolean(st) && r.weeks[w].high >= st.trigger;
        assert.equal(hit, rec.length === 1, `${s.id} ${kind} week ${w}`);
        if (rec.length) { compared++; assert.equal(rec[0].buyStop.level, st.trigger); assert.equal(rec[0].proposedStop.level, st.stopProposal); }
      }
    }
  }
  assert.ok(compared >= 10, `compared ${compared}`);
});

test('GC-SF5-WEIN-INVESTOR-LIFECYCLE: Buy-Stop aus der abgeschlossenen Woche, Stop unter dem Basistief, Anhebung nach 8-%-Korrektur und neuem Hoch unter min(Tief, MA30w)', () => {
  const s = stageScenario(), r = runW('INVESTOR', ds(s));
  assert.equal(r.trades.length, 1);
  const t = r.trades[0], set = weinsteinWeeklySetups(s.bars, 'INVESTOR');
  const st = [...set.setupFor.values()].find((x) => x.weekKey === set.weeks[set.weekOf[s.bars.findIndex((b) => b.date === t.entryDate)]].key);
  assert.ok(st, 'entry inside an armed week'); assert.ok(Math.abs(t.orderLevel - st.trigger) < 1e-12);
  assert.ok(Math.abs(t.initialStop - (st.stopProposal - 0.01)) < 1e-9);
  assert.ok(Math.abs(t.weight - 0.05) < 0.002); // half of the planned 10 % (WEIN-BUY2), no add
  const raise = t.events.find((e) => e.type === 'STOP_RAISED');
  assert.ok(raise && raise.rule === 'WEIN-TRAIL1-2');
  const wk = set.weeks[set.weekOf[s.bars.findIndex((b) => b.date === raise.date)]]; assert.equal(s.bars[wk.lastIndex].date, raise.date); // weekly decision at the week's last close
  assert.equal(r.label, 'MODEL_LIFECYCLE_STUDY_WITH_DATA_EXCEPTION_NOT_A_STRATEGY_BACKTEST'); assert.equal(r.reconciliation.pass, true);
  assert.equal(t.status, 'OPEN_AT_DATA_END'); // the raised stop sits under the MA30w and is not reached
});

test('GC-SF5-WEIN-TRADER-LIFECYCLE: volle Position, Anhebung unter das Reaktionstief auch ueber der MA (WEIN-TR-TRAIL), Stopp-Ausstieg', () => {
  const r = runW('TRADER', ds(stageScenario()));
  const t = r.trades[0];
  assert.ok(Math.abs(t.weight - 0.10) < 0.002);
  const raise = t.events.find((e) => e.type === 'STOP_RAISED');
  assert.equal(raise.rule, 'WEIN-TR-TRAIL');
  // the reaction low = lowest weekly low after the peak week before the recovery week, minus one raw cent
  const set = weinsteinWeeklySetups(stageScenario().bars, 'TRADER'), k = stageScenario().bars.findIndex((b) => b.date === raise.date), W = set.weekOf[k];
  let peakW = -1, peak = -Infinity; for (let w = set.weekOf[stageScenario().bars.findIndex((b) => b.date === t.entryDate)]; w < W; w++) if (set.weeks[w].high > peak) { peak = set.weeks[w].high; peakW = w; }
  const low = Math.min(...set.weeks.slice(peakW + 1, W).map((w) => w.low));
  assert.ok(Math.abs(raise.stop - (low - 0.01)) < 1e-9, `${raise.stop} vs ${low - 0.01}`);
  assert.equal(t.exitReason, 'STOP_WEIN-TR-TRAIL');
});

test('GC-SF5-WEIN-VOL5: Ausbruch ohne Volumenbestaetigung -> Verkauf zur Eroeffnung nach der ersten kleinen Staerke; Variante ohne VOL5 haelt', () => {
  const s = stageScenario({ breakoutVolume: 1e6 });
  const r = runW('INVESTOR', ds(s)), t = r.trades[0];
  assert.ok(t.events.some((e) => e.type === 'WEIN_VOL5_UNCONFIRMED'));
  assert.equal(t.exitReason, 'WEIN_VOL5_FIRST_STRENGTH');
  assert.equal(runW('TRADER', ds(s)).trades[0].exitReason, 'WEIN_VOL5_FIRST_STRENGTH'); // shared rule, Trader too
  const n = runW('INVESTOR', ds(s), { vol5: false });
  assert.notEqual(n.trades[0].exitReason, 'WEIN_VOL5_FIRST_STRENGTH');
  // confirmed volume: no VOL5 exit
  assert.ok(!runW('INVESTOR', ds(stageScenario())).trades[0].events.some((e) => e.type === 'WEIN_VOL5_UNCONFIRMED'));
});

test('GC-SF5-WEIN-PIT-PREFIX: Entscheidungen vor dem letzten Balken eines Ausschnitts haengen nicht von spaeteren Balken ab', () => {
  for (const kind of ['INVESTOR', 'TRADER']) {
    const full = walk(29, 900), a = runW(kind, ds(full));
    for (const m of [500, 700]) {
      const b = runW(kind, ds({ id: full.id, bars: full.bars.slice(0, m) })), last = day(m - 1);
      const before = (r) => r.trades.filter((t) => t.entryDate < last).map((t) => [t.entryDate, t.entryFill, t.events.filter((e) => e.date < last).map((e) => [e.date, e.type, e.stop ?? e.price ?? null])]);
      assert.deepEqual(before(b), before(a), `${kind} cut ${m}`);
    }
  }
});

test('GC-SF5-WEIN-DATA-EXCEPTION: Gruppe und Markt bleiben DATA_BLOCKED; Varianten gueltig und festgeschrieben', () => {
  for (const id of ['WEIN-SF-GROUP', 'WEIN-SF-MARKET']) assert.equal(WEINSTEIN_INVESTOR.rules.find((r) => r.id === id).status, 'DATA_BLOCKED');
  assert.deepEqual(WEINSTEIN_INVESTOR_ADAPTER.dataException.length, 2);
  for (const v of WEIN_INVESTOR_RUN_VARIANTS) assert.deepEqual(validateWeinInvestorConfig(v.config), [], v.id);
  for (const v of WEIN_TRADER_RUN_VARIANTS) assert.deepEqual(validateWeinTraderConfig(v.config), [], v.id);
  assert.equal(WEIN_TRADER_REFERENCE_CONFIG.vol5, true); // WEIN-VOL5 is the shared exit rule of C04 / C05 (Trader contract exclusion)
  assert.deepEqual(validateWeinTraderConfig({ ...WEIN_TRADER_REFERENCE_CONFIG, trailThreshold: 0.08 }), ['TRAIL_THRESHOLD_NOT_PRINTED']);
  assert.deepEqual(validateWeinInvestorConfig({ ...WEIN_INVESTOR_REFERENCE_CONFIG, trailThreshold: 0.05 }), ['TRAIL_THRESHOLD_NOT_PRINTED']);
  assert.deepEqual(validateWeinInvestorConfig({ ...WEIN_INVESTOR_REFERENCE_CONFIG, dataException: 'NONE' }), ['DATA_EXCEPTION_MUST_BE_DECLARED']);
  assert.equal(weinVariantRegistrySha256(), PINNED_WEIN_VARIANTS);
});
