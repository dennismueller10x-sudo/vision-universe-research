// Supertrader 7.0 – Ausfuehrungs- und Validierungsarbeiten ohne Kapitalmassnahmen-Daten (docs/SUPERTRADER_7_EXECUTION_VALIDATION.md):
// unabhaengige Invarianten je Lauf, PIT durch Verfaelschen zukuenftiger Balken, Stabilitaetszaehlungen, Lesart
// EX7-WEIN-TRAIL-AT-OR-ABOVE. Synthetisch; der echte Lauf braucht den Snapshot (Workflow-Modus sf5-lifecycle).
// Simuliert nur Research-Trades; kein Kaufsignal, keine Order, keine Statusaufwertung.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchLifecycle, prepareAll, PLATFORM_RESEARCH_PORTFOLIO_POLICY as POLICY } from '../source-faithful/research/lifecycle-engine.mjs';
import { SF5_LIFECYCLES, sf5VariantRegistrySha256 } from '../source-faithful/research/sf5-lifecycles.mjs';
import { SF7_EXECUTION_VARIANTS, sf7ExecutionVariantsSha256 } from '../source-faithful/research/sf7-execution-variants.mjs';
import { buildGroupStrength } from '../source-faithful/research/industry-strength.mjs';
import { WEIN_GROUP_PROXY_ID, WEIN_GROUP_PROXY, WEINSTEIN_INVESTOR_ADAPTER, WEINSTEIN_TRADER_ADAPTER, WEIN_INVESTOR_REFERENCE_CONFIG, makeWeinsteinAdapter } from '../source-faithful/research/weinstein-lifecycle.mjs';
import * as V from '../source-faithful/research/sf7-execution-validation.mjs';

// pinned before any snapshot result of the Supertrader 7.0 validation run exists
const PINNED_SF7_VALIDATION = 'd112eab5d33ce0b521b08421cc878bc2f513889ff6872a9fcb65cf8c7f61806a';
const PINNED_SF5_VARIANT_REGISTRY = '0a1260e9d087b1cde8176b66134e19b32222f94653d46df31c495d02552940da';
const PINNED_SF7_VARIANTS = '310cb075a0021cce0feea0a47412de1112e307a2e50156de7c8127140f88033a';

const day = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
/** random walks with gaps, volume spikes, dividends and a few bars without high / low (as the sf5 runner test, plus data events) */
function dataset(n = 30, len = 700, { holes = true } = {}) {
  const secs = [];
  for (let s = 0; s < n; s++) {
    const r = rng(s + 11); let c = 20; const drift = (r() - 0.3) * 0.004, bars = [];
    for (let k = 0; k < len; k++) {
      const gap = r() < 0.01 ? (r() < 0.5 ? 0.08 : -0.08) : 0, o = c * (1 + gap + 0.01 * (r() - 0.5));
      c = o * (1 + drift + 0.03 * (r() - 0.5)); const h = Math.max(o, c) * (1 + 0.012 * r()), l = Math.min(o, c) * (1 - 0.012 * r());
      const v = 1e6 * (0.5 + r()) * (gap ? 3 : 1), hole = holes && r() < 0.002;
      if (holes && r() < 0.002) continue; // a missing session of this security
      bars.push({ date: day(k), open: o, high: hole ? NaN : h, low: hole ? NaN : l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1, ...(k % 97 === 50 ? { dividend: 0.1 } : {}) });
    }
    secs.push({ id: `S${String(s).padStart(3, '0')}`, bars, terminal: null });
  }
  return { calendar: [...new Set(secs.flatMap((x) => x.bars.map((b) => b.date)))].sort(), securities: secs };
}
const withGroups = (ds) => { ds.groupProxies = { [WEIN_GROUP_PROXY_ID]: buildGroupStrength(ds, { groupOf: (id) => `SIC3:${Number(id.slice(1)) % 3}` }, { minMembers: WEIN_GROUP_PROXY.minMembers }) }; return ds; };
const FROM = day(200);
/** every registered configuration of the shared engine: sf5 variants, SF7 execution variants, SF7 validation variants */
function allConfigs() {
  const out = [];
  for (const lc of SF5_LIFECYCLES) for (const v of lc.variants) out.push({ key: lc.key, id: v.id, adapter: lc.adapter, config: v.config });
  for (const x of [...SF7_EXECUTION_VARIANTS, ...V.SF7_VALIDATION_VARIANTS]) out.push({ key: x.key, id: x.id, adapter: x.adapter, config: x.config });
  return out;
}

test('SF7-VAL-INVARIANTS-ALL-VARIANTS: unabhaengige Pruefung jedes Laufs (Fills im Balken, Timing, Stops, Groesse, Buecher je Sitzung) ohne Verstoss', () => {
  const ds = withGroups(dataset());
  let trades = 0, sessions = 0;
  for (const c of allConfigs()) {
    const r = runResearchLifecycle(ds, { adapter: c.adapter, config: c.config, from: FROM });
    const v = V.checkLifecycleRun(ds, r, { config: c.config, adapter: c.adapter, policy: POLICY, from: FROM });
    assert.deepEqual(v.violations, {}, `${c.key} ${c.id}: ${JSON.stringify(v.examples.slice(0, 3))}`);
    assert.equal(v.checks.sessions, r.curve.length); trades += v.checks.trades; sessions += v.checks.heldSessions;
  }
  assert.ok(trades > 3000 && sessions > 10000, `${trades} trades, ${sessions} held sessions checked`);
});

test('SF7-VAL-CHECKER-DETECTS: jeder eingebaute Defekt wird gefunden (Gegenprobe der Pruefung)', () => {
  const ds = dataset(), lc = SF5_LIFECYCLES.find((l) => l.key === 'BUYABLE_GAP_UP');
  const base = runResearchLifecycle(ds, { adapter: lc.adapter, config: lc.reference, from: FROM });
  const check = (r) => V.checkLifecycleRun(ds, r, { config: lc.reference, adapter: lc.adapter, policy: POLICY, from: FROM }).violations;
  assert.deepEqual(check(base), {});
  const clone = () => structuredClone(base);
  const tr = (r, pred) => r.trades.find(pred);
  const cases = [
    ['ENTRY_NOT_AFTER_SIGNAL', (r) => { const t = tr(r, (x) => x.entryBasis === 'OPEN'); t.signalDate = t.entryDate; }],
    ['OPEN_ENTRY_NOT_AT_OPEN', (r) => { tr(r, (x) => x.entryBasis === 'OPEN').entryFill *= 1.001; }],
    ['SHARES_NOT_RULE', (r) => { const t = tr(r, (x) => x.status === 'CLOSED'); t.shares += 1; }],
    ['STOP_EXIT_NOT_MIN_OPEN_STOP', (r) => { const t = tr(r, (x) => x.exitReason === 'STOP_INITIAL_GAP_OPEN'); t.events.find((e) => e.type === 'SELL').price *= 1.0005; }],
    ['STOP_REACHED_NOT_EXECUTED', (r) => { const t = tr(r, (x) => x.exitReason === 'STOP_INITIAL' && x.exitDate > x.entryDate); t.initialStop *= 1.5; }],
    ['EQUITY_NOT_CASH_PLUS_POSITIONS', (r) => { r.curve[300].equity += 1; }],
    ['SELL_FILL_OUTSIDE_BAR', (r) => { const row = r.ledger.find((x) => x.side === 'SELL' && x.reason === 'STOP_INITIAL'); row.price *= 0.8; row.gross = row.shares * row.price; row.fee = row.gross * 1e-4; }],
    ['DIVIDEND_ON_ENTRY_DAY', (r) => { const b = r.ledger.find((x) => x.side === 'BUY'); r.ledger.splice(r.ledger.indexOf(b) + 1, 0, { date: b.date, id: b.id, side: 'DIVIDEND', shares: b.shares, price: 0, gross: 0, fee: 0, reason: 'X', tradeId: b.tradeId }); }],
    ['ENTRY_BAR_STOP_MISSED', (r) => { const t = tr(r, (x) => x.exitReason === 'STOP_SAME_BAR_CERTAIN'); t.events = t.events.filter((e) => e.type !== 'SELL'); t.exitDate = null; }],
  ];
  for (const [code, mutate] of cases) { const r = clone(); mutate(r); assert.ok(check(r)[code] > 0, `${code} not detected: ${JSON.stringify(check(r))}`); }
  // a lowered stop and an ignored same-bar stop under PESSIMISTIC
  const dar = SF5_LIFECYCLES.find((l) => l.key === 'DARVAS'), d = runResearchLifecycle(ds, { adapter: dar.adapter, config: dar.reference, from: FROM });
  const raised = d.trades.find((t) => t.events.some((e) => e.type === 'STOP_RAISED'));
  if (raised) { const r = structuredClone(d), t = r.trades.find((x) => x.tradeId === raised.tradeId); t.events.find((e) => e.type === 'STOP_RAISED').stop = t.initialStop - 1; assert.ok(V.checkLifecycleRun(ds, r, { config: dar.reference, adapter: dar.adapter, policy: POLICY, from: FROM }).violations.STOP_LOWERED_OR_EQUAL > 0); }
  const r = structuredClone(d), t = r.trades.find((x) => x.entryBasis === 'INTRADAY_LEVEL_TOUCH'); t.events.push({ date: t.entryDate, type: 'SAME_BAR_STOP_IGNORED' });
  assert.ok(V.checkLifecycleRun(ds, r, { config: dar.reference, adapter: dar.adapter, policy: POLICY, from: FROM }).violations.SAME_BAR_STOP_IGNORED_UNDER_PESSIMISTIC > 0);
});

test('SF7-VAL-PIT-CORRUPTION-ALL-VARIANTS: verfaelschte zukuenftige Balken aendern weder Signale noch Orders noch Buchungen bis zum Stichtag (alle Varianten)', () => {
  const ds = withGroups(dataset(24, 620));
  let compared = 0;
  for (const cut of [330, 470]) {
    const cd = ds.calendar[cut], bad = withGroups(V.corruptAfter(ds, cut, { seed: cut }));
    assert.ok(bad.securities.some((s, k) => s.bars.at(-1).close !== ds.securities[k].bars.at(-1).close), 'future bars really changed');
    for (const c of allConfigs()) {
      const a = runResearchLifecycle(ds, { adapter: c.adapter, config: c.config, from: FROM }), b = runResearchLifecycle(bad, { adapter: c.adapter, config: c.config, from: FROM });
      assert.deepEqual(V.decisionsThrough(b, cd), V.decisionsThrough(a, cd), `${c.key} ${c.id} cut ${cut}`);
      // signals and orders known at each close through the cut (the cut close included)
      const pa = prepareAll(ds, c.adapter, c.config), pb = prepareAll(bad, c.adapter, c.config);
      for (const [k, s] of ds.securities.entries()) {
        const sb = bad.securities[k], xa = pa.get(s.id), xb = pb.get(s.id);
        for (let i = 0; i < s.bars.length && s.bars[i].date <= cd; i++) {
          const A = xa ? c.adapter.signalAt(xa, i, c.config) : null, B = xb ? c.adapter.signalAt(xb, i, c.config) : null;
          const ea = A && c.adapter.eligibility({ ctx: xa, setup: A, bars: s.bars, i, cfg: c.config }), eb = B && c.adapter.eligibility({ ctx: xb, setup: B, bars: sb.bars, i, cfg: c.config });
          assert.deepEqual([B, eb], [A, ea], `${c.key} ${c.id} ${s.id} bar ${i} cut ${cut}`);
          if (A) compared++;
        }
      }
    }
  }
  assert.ok(compared > 5000, `${compared} signals compared`);
  // negative control: an adapter that peeks 40 sessions ahead is caught by the signal comparison
  const dar = SF5_LIFECYCLES.find((l) => l.key === 'DARVAS'), peek = { ...dar.adapter, signalAt: (ctx, i, cfg) => { const s = dar.adapter.signalAt(ctx, i, cfg), nx = ctx.bars[i + 40]; return s && nx && nx.close > ctx.bars[i].close ? s : null; } };
  const cut = 330, cd = ds.calendar[cut], bad = V.corruptAfter(ds, cut, { seed: 5 });
  const sig = (d) => V.signalsThrough(d, { adapter: peek, config: dar.reference, prepared: prepareAll(d, peek, dar.reference) }, cd);
  assert.notEqual(sig(bad).sha256, sig(ds).sha256);
  const ref = (d) => V.signalsThrough(d, { adapter: dar.adapter, config: dar.reference, prepared: prepareAll(d, dar.adapter, dar.reference) }, cd);
  assert.equal(ref(bad).sha256, ref(ds).sha256); assert.ok(ref(ds).count > 50);
});

test('SF7-VAL-STABILITY: Weglassen eines Titels und Start eine Sitzung spaeter - deterministische Auswahl, nur Zaehlungen, konsistent', () => {
  const ds = dataset(), lc = SF5_LIFECYCLES.find((l) => l.key === 'POCKET_PIVOT');
  const prepared = prepareAll(ds, lc.adapter, lc.reference);
  const run = (d, from) => runResearchLifecycle(d, { adapter: lc.adapter, config: lc.reference, prepared, from });
  const base = run(ds, FROM), s = V.stabilityPart(ds, base, { run, from: FROM });
  assert.deepEqual(V.stabilityPart(ds, base, { run, from: FROM }), s); // deterministic
  assert.equal(s.leaveOneOut.length, 3); assert.equal(s.leaveOneOut[0].rule, 'MOST_TRADES');
  const by = new Map(); for (const t of base.trades) by.set(t.id, (by.get(t.id) || 0) + 1);
  assert.equal(s.leaveOneOut[0].ownTrades, Math.max(...by.values()));
  for (const x of [...s.leaveOneOut, s.startShift]) {
    assert.equal(x.unchanged + x.sharesOnly + x.changed + x.dropped, x.base); assert.equal(x.other - x.added, x.unchanged + x.sharesOnly + x.changed);
  }
  // the input order of the securities does not matter (the dropped ids come from the trades, sorted)
  assert.deepEqual(V.stabilityDropIds([...base.trades].reverse()), V.stabilityDropIds(base.trades));
  // the comparison sees a changed exit
  const alt = structuredClone(base.trades); alt[0].exitDate = '2099-01-01';
  assert.deepEqual(V.compareTradeSets(base.trades, alt), { base: base.trades.length, other: base.trades.length, unchanged: base.trades.length - 1, sharesOnly: 0, changed: 1, dropped: 0, added: 0 });
  const sh = structuredClone(base.trades); sh[1].shares += 1;
  assert.equal(V.compareTradeSets(base.trades, sh).sharesOnly, 1);
  assert.doesNotMatch(JSON.stringify(V.stabilityPublic(s)), /"id"|S0\d\d/);
});

// ---------------------------------------------------------------- EX7-WEIN-TRAIL-AT-OR-ABOVE (SF7-V1)
const wday = (k) => new Date(Date.UTC(2019, 0, 7) + k * 864e5).toISOString().slice(0, 10); // a Monday
/** weekday bars from weekly [high, low] rows (5 sessions each; the week's high on Wednesday, low on Friday) */
function weeks(rows) {
  const bars = []; let k = 0;
  for (const [h, l] of rows) for (let d = 0; d < 7; d++, k++) {
    if (d >= 5) continue;
    const mid = (h + l) / 2, hi = d === 2 ? h : Math.min(h, mid + 0.2), lo = d === 4 ? l : Math.max(l, mid - 0.2);
    bars.push({ date: wday(k), open: mid, high: hi, low: lo, close: mid, volume: 1e6, rawClose: mid, rawVolume: 1e6, splitAdj: 1 });
  }
  return bars;
}

test('SF7-VAL-WEIN-TRAIL-GOLDEN: Wochenhoch gleich dem Hoch nach >= 8 % Korrektur hebt den Stop nur in der deklarierten Lesart; Referenz unveraendert', () => {
  const adapter = makeWeinsteinAdapter('INVESTOR', { trailAtOrAbove: true }), api = (log) => ({ raiseStop: (lvl, rule) => log.push(['RAISE', lvl, rule]), setTrigger() {}, scheduleExit() {} });
  // weeks: 0 entry week (high 50), 1 high 52 (peak), 2-3 correction lows 47 (9.6 % below 52), 4 high exactly 52 again
  const bars = weeks([[50, 48], [52, 50], [51, 47], [50, 47.5], [52, 50], [51, 50.5]]);
  const { weinsteinWeeklySetups } = WEIN;
  const prep = weinsteinWeeklySetups(bars, 'INVESTOR'), c = { ...prep, bars };
  const runOn = (a) => {
    const log = [], pos = { entryIndex: 0, state: {}, events: [], trade: {} };
    for (let i = 0; i < bars.length; i++) a.onClose(pos, c, i, api(log), WEIN_INVESTOR_REFERENCE_CONFIG);
    return log;
  };
  const ref = runOn(WEINSTEIN_INVESTOR_ADAPTER), alt = runOn(adapter);
  assert.deepEqual(ref, []); // ">": the equal high continues the correction, no raise
  assert.equal(alt.length, 1); assert.equal(alt[0][2], 'WEIN-TRAIL1-2');
  // stop one raw cent under min(correction low 47, MA30w); the MA is not yet defined (6 weeks), so the low decides
  assert.ok(Math.abs(alt[0][1] - (47 - 0.01)) < 1e-9, `${alt[0][1]}`);
  // a higher high raises in both readings (no change outside the equality case)
  const up = weeks([[50, 48], [52, 50], [51, 47], [50, 47.5], [52.5, 50], [51, 50.5]]), cu = { ...weinsteinWeeklySetups(up, 'INVESTOR'), bars: up };
  for (const a of [WEINSTEIN_INVESTOR_ADAPTER, adapter]) { const log = [], pos = { entryIndex: 0, state: {}, events: [], trade: {} }; for (let i = 0; i < up.length; i++) a.onClose(pos, cu, i, api(log), WEIN_INVESTOR_REFERENCE_CONFIG); assert.equal(log.length, 1); }
});

test('SF7-VAL-REGISTRY: Validierungsvarianten nur als Wrapper; Referenzen, sf5-Register und SF7-Register unveraendert; Protokoll gepinnt', () => {
  assert.equal(sf5VariantRegistrySha256(), PINNED_SF5_VARIANT_REGISTRY);
  assert.equal(sf7ExecutionVariantsSha256(), PINNED_SF7_VARIANTS);
  assert.equal(V.sf7ValidationSha256(), PINNED_SF7_VALIDATION);
  for (const lc of SF5_LIFECYCLES) assert.ok(!/sf7-execution-validation/.test(lc.adapter.version), lc.key);
  for (const x of V.SF7_VALIDATION_VARIANTS) {
    const lc = SF5_LIFECYCLES.find((l) => l.key === x.key);
    assert.deepEqual(x.config, lc.variants.find((v) => v.id === x.compareTo).config);
    assert.equal(x.adapter.prepareKey(x.config), lc.adapter.prepareKey(x.config)); // shares the reference preparation
    assert.match(x.adapter.version, /\+sf7-execution-validation-1\.0\.0$/);
  }
  assert.equal(WEINSTEIN_TRADER_ADAPTER.version, WEINSTEIN_INVESTOR_ADAPTER.version);
});
import * as WEIN from '../source-faithful/research/weinstein-lifecycle.mjs';

// ---------------------------------------------------------------- Turtle S1 / S2 (eigene Engine methods/turtle.mjs, unveraendert)
import { runTurtle, ENTRY_BAR_ORDERS } from '../source-faithful/methods/turtle.mjs';
const TURTLE_RUNS = [];
for (const system of ['S1', 'S2']) for (const entryBarOrder of ENTRY_BAR_ORDERS) for (const failsafeExit of ['10D', '20D']) if (system === 'S1' || failsafeExit === '10D') TURTLE_RUNS.push({ system, entryBarOrder, failsafeExit });

test('SF7-VAL-TURTLE-LEDGER: Fills im Balken, Einstieg = max(Eroeffnung, Trigger), Buecher je Sitzung = Kasse + Positionen, keine Dividende am Kauftag (alle Lesarten)', () => {
  const ds = dataset();
  let fills = 0;
  for (const o of TURTLE_RUNS) {
    const r = runTurtle(ds, { ...o, from: FROM });
    assert.equal(r.reconciliation.pass, true);
    const v = V.checkLedgerAgainstBars(ds, r, { slippageBps: 10, commissionBps: 1, initialCapital: 100000, from: FROM });
    assert.deepEqual(v.violations, {}, `${JSON.stringify(o)} ${JSON.stringify(v.examples.slice(0, 3))}`);
    fills += v.checks.buyFills + v.checks.sellFills;
    const bars = new Map(ds.securities.map((s) => [s.id, new Map(s.bars.map((b) => [b.date, b]))]));
    for (const s of r.signals) {
      const b = bars.get(s.id).get(s.date);
      assert.ok(Math.abs(s.fill - Math.max(s.trigger, b.open)) <= 1e-9 * s.fill, `${s.id} ${s.date} fill ${s.fill} trigger ${s.trigger} open ${b.open}`);
      assert.ok(b.high >= s.trigger - 1e-9, 'a fill needs the trigger to trade');
    }
  }
  assert.ok(fills > 500, `${fills} fills`);
});

test('SF7-VAL-TURTLE-PIT-CORRUPTION: verfaelschte zukuenftige Balken aendern Buchungen, Kurve und Signale bis zum Stichtag nicht (S1 / S2, alle Lesarten)', () => {
  const ds = dataset(24, 620);
  for (const cut of [330, 470]) {
    const cd = ds.calendar[cut], bad = V.corruptAfter(ds, cut, { seed: cut + 1 });
    for (const o of TURTLE_RUNS) {
      const a = runTurtle(ds, { ...o, from: FROM }), b = runTurtle(bad, { ...o, from: FROM });
      const upTo = (r) => ({ ledger: r.ledger.filter((x) => x.date <= cd), curve: r.curve.filter((x) => x.date <= cd), signals: r.signals.filter((x) => x.date <= cd), units: r.unitTrades.filter((x) => x.exitDate <= cd) });
      assert.ok(upTo(a).ledger.length > 0);
      assert.deepEqual(upTo(b), upTo(a), `${JSON.stringify(o)} cut ${cut}`);
    }
  }
});

// ---------------------------------------------------------------- Golden Cases mit handgerechnetem Ergebnis (Kosten 10 bps / 1 bp je Seite)
import * as G from './fixtures/sf7-golden-scenarios.mjs';
import { KK_EP_ADAPTER, EP_REFERENCE_CONFIG } from '../source-faithful/research/kk-ep-lifecycle.mjs';
import { runPsCandidate, psChartCandidate, PS_REFERENCE_CONFIG } from '../source-faithful/research/kk-ps-study.mjs';
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const BUY = (shares, fill) => shares * fill * 1.001 * 1.0001; // fill + 10 bps slippage, then 1 bp commission
const SELL = (shares, fill) => shares * fill * 0.999 * (1 - 0.0001);
const lcRef = (key) => SF5_LIFECYCLES.find((l) => l.key === key);
function golden(key, scenario, exp) {
  const lc = lcRef(key), r = runResearchLifecycle(G.ds(scenario), { adapter: lc.adapter, config: lc.reference });
  assert.equal(r.trades.length, 1, key);
  const t = r.trades[0];
  for (const [k, v] of Object.entries(exp.trade)) assert.ok(typeof v === 'number' ? near(t[k], v, 1e-9) : t[k] === v, `${key} ${k}: ${t[k]} vs ${v}`);
  const sells = t.events.filter((e) => e.type === 'SELL');
  assert.deepEqual(sells.map((e) => [e.date, e.reason]), exp.sells.map((x) => [x.date, x.reason]), key);
  exp.sells.forEach((x, k) => { assert.ok(near(sells[k].shares, x.shares, 1e-9), `${key} sell ${k} shares`); assert.ok(near(sells[k].price, x.fill * 0.999, 1e-9), `${key} sell ${k} price`); });
  assert.ok(near(t.pnl, exp.pnl), `${key} pnl ${t.pnl} vs ${exp.pnl}`);
  assert.ok(near(r.curve.at(-1).equity, 100000 + exp.pnl), `${key} equity`);
  assert.deepEqual(V.checkLifecycleRun(G.ds(scenario), r, { config: lc.reference, adapter: lc.adapter, policy: POLICY }).violations, {});
  return t;
}

test('SF7-GC-DARVAS: Beruehrung 72,01, Stop 71,99 -> 72,29 angehoben, Ausstieg am Stop; 138 Stueck = floor(10 000 / 72,01)', () => {
  golden('DARVAS', G.darvasTextbook(), {
    trade: { signalDate: G.day(35), entryDate: G.day(36), entryBasis: 'INTRADAY_LEVEL_TOUCH', entryFill: 72.01, initialStop: 71.99, shares: 138 }, // WEIGHT 0.10 x 100 000 / 72.01 = 138.9
    sells: [{ date: G.day(43), reason: 'STOP_DAR-SF-STOP-RAISE', shares: 138, fill: 72.29 }], // open 72.35 >= 72.29 >= low 72: fill at the stop
    pnl: SELL(138, 72.29) - BUY(138, 72.01), // 9 965.0474 - 9 948.3121 = 16.7353
  });
});

test('SF7-GC-KK-BREAKOUT: Eroeffnung 31 (Stop 30,4), 806 Stueck (25-%-Deckel vor 0,5 % Risiko = 833), 1/3 zur Eroeffnung, Rest am Break-even', () => {
  golden('KK_BREAKOUT', G.kkScenario(), {
    trade: { entryDate: G.day(121), entryBasis: 'OPEN', entryFill: 31, initialStop: 30.4, shares: 806 }, // min(floor(500 / 0.6) = 833, floor(25 000 / 31) = 806)
    sells: [{ date: G.day(125), reason: 'KK_PARTIAL_AFTER_DAYS', shares: 806 / 3, fill: 32.8 }, { date: G.day(126), reason: 'STOP_KK-013-BREAKEVEN', shares: (806 * 2) / 3, fill: 31 }],
    pnl: SELL(806 / 3, 32.8) + SELL((806 * 2) / 3, 31) - BUY(806, 31), // 8 802.5741 + 16 639.0119 - 25 013.4871 = 428.0989
  });
});

test('SF7-GC-BGU: Eroeffnung 38,5, Stop 37,6 (Gap-Tagestief), 649 Stueck; Gap unter den Stop -> Ausstieg zur Eroeffnung 37,2, nicht zum Stop', () => {
  golden('BUYABLE_GAP_UP', G.bguScenario(), {
    trade: { signalDate: G.day(130), entryDate: G.day(131), entryBasis: 'OPEN', entryFill: 38.5, initialStop: 37.6, shares: 649 }, // min(floor(1 000 / 0.9) = 1 111, floor(25 000 / 38.5) = 649)
    sells: [{ date: G.day(133), reason: 'STOP_INITIAL_GAP_OPEN', shares: 649, fill: 37.2 }],
    pnl: SELL(649, 37.2) - BUY(649, 38.5), // 24 116.2453 - 25 013.9876 = -897.7423
  });
});

test('SF7-GC-POCKET-PIVOT: Eroeffnung 42,55, 235 Stueck, kein Preisstop; Schluss unter MA10 setzt 43,6, Eroeffnung 43,4 darunter -> Ausstieg zur Eroeffnung', () => {
  golden('POCKET_PIVOT', G.ppScenario(), {
    trade: { signalDate: G.day(120), entryDate: G.day(121), entryBasis: 'OPEN', entryFill: 42.55, initialStop: null, shares: 235 }, // floor(10 000 / 42.55) = 235
    sells: [{ date: G.day(161), reason: 'MOKA_MA10_VIOLATION_GAP_OPEN', shares: 235, fill: 43.4 }], // close 43.9 < MA10 44.215 on bar 160, its low 43.6
    pnl: SELL(235, 43.4) - BUY(235, 42.55), // 10 187.7821 - 10 010.2502 = 177.5319
  });
});

test('SF7-GC-HOLY-GRAIL: Buy-Stop 33,11 ueber dem Beruehrungsbalken, Gap-Eroeffnung 33,3, Stop 32,2 (Swing-Tief), 750 Stueck; neues Hoch -> naechste Eroeffnung 38,8', () => {
  golden('HOLY_GRAIL_W_RAS97', G.hgScenario(), {
    trade: { signalDate: G.day(75), entryDate: G.day(76), entryBasis: 'OPEN_GAP_AT_OR_ABOVE_LEVEL', entryFill: 33.3, orderLevel: 33.11, initialStop: 32.2, shares: 750 }, // min(floor(1 000 / 1.1) = 909, floor(25 000 / 33.3) = 750)
    sells: [{ date: G.day(87), reason: 'RAS_NEW_HIGH_EXIT', shares: 750, fill: 38.8 }], // close 38.5 > impulse high 38.4 on bar 86
    pnl: SELL(750, 38.8) - BUY(750, 33.3), // 29 067.9929 - 25 002.4750 = 4 065.5179
  });
});

/** Weinstein Trader: 32 rising weeks, swing high 25 in week 32, two weeks below it (lows 23), breakout week 35 with volume, gap below the stop in week 36 */
const WMON = Date.UTC(2019, 0, 7);
function weinGolden() {
  const rows = [];
  for (let j = 0; j < 32; j++) { const c = 20 + 0.1 * j; rows.push({ c, H: c + 0.5, L: c - 0.5 }); }
  rows.push({ c: 23.5, H: 25, L: 23.2 }, { c: 23.5, H: 24, L: 23 }, { c: 23.5, H: 24, L: 23 });
  const bars = [], push = (k, [o, h, l, c], v) => bars.push(G.bar(k, o, h, l, c, v, WMON));
  rows.forEach((r, w) => { for (let d = 0; d < 5; d++) push(w * 7 + d, [r.c, d === 2 ? r.H : r.c + 0.1, d === 4 ? r.L : r.c - 0.1, r.c], 1e6); });
  [[24.5, 25.5, 24.4, 25.3], [25.3, 25.6, 25.1, 25.4], [25.4, 25.5, 25.2, 25.4], [25.4, 25.5, 25.2, 25.4], [25.4, 25.5, 25.2, 25.4]].forEach((row, d) => push(35 * 7 + d, row, 3e6));
  push(36 * 7, [22.5, 22.8, 22.3, 22.6], 1e6);
  for (let d = 1; d < 5; d++) push(36 * 7 + d, [22.6, 22.7, 22.5, 22.6], 1e6);
  return { id: 'WEIN', bars };
}

test('SF7-GC-WEINSTEIN-TRADER: Buy-Stop 25,01 ueber dem Swing-Hoch, Stop 22,99 unter dem Tief, 399 Stueck; Gap unter den Stop -> Eroeffnung 22,5', () => {
  golden('WEINSTEIN_TRADER', weinGolden(), {
    trade: { entryDate: G.day(245, WMON), entryBasis: 'INTRADAY_LEVEL_TOUCH', entryFill: 25.01, orderLevel: 25.01, initialStop: 22.99, shares: 399 }, // floor(10 000 / 25.01) = 399
    sells: [{ date: G.day(252, WMON), reason: 'STOP_INITIAL_GAP_OPEN', shares: 399, fill: 22.5 }],
    pnl: SELL(399, 22.5) - BUY(399, 25.01), // 8 967.6256 - 9 989.9679 = -1 022.3422
  });
});

test('SF7-GC-EP: IEX-ORH-1-Fill 23,21, Stop 22,95, 1 077 Stueck (Deckel vor 0,5 % Risiko = 1 923); Schluss unter MA20 -> Eroeffnung 27,1; Tagestief unter dem Stop ohne IEX-Stop wird gezaehlt', () => {
  const run = (dayLow) => {
    const s = G.epScenario({ dayLow }), map = new Map([[`EPX|${G.epDay(80)}`, G.epMinutes()]]), d = G.ds(s);
    d.kkIntraday = { minutes: (t, x) => map.get(`${t}|${x}`), iexBaseline: () => 200000 };
    const r = runResearchLifecycle(d, { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
    return { r, c: V.checkLifecycleRun(d, r, { config: EP_REFERENCE_CONFIG, adapter: KK_EP_ADAPTER, policy: POLICY }) };
  };
  const { r, c } = run(22.95), t = r.trades[0];
  assert.equal(r.trades.length, 1); assert.equal(t.entryDate, G.epDay(80)); assert.equal(t.entryFill, 23.21); assert.equal(t.initialStop, 22.95);
  assert.equal(t.shares, 1077); // min(floor(500 / 0.26) = 1 923, floor(25 000 / 23.21) = 1 077)
  assert.equal(t.exitDate, G.epDay(102)); assert.equal(t.exitReason, 'EP_CLOSE_BELOW_MA20');
  assert.ok(near(t.pnl, SELL(1077, 27.1) - BUY(1077, 23.21)), `${t.pnl}`); // 29 154.5975 - 25 024.6694 = 4 129.9282
  assert.deepEqual(c.violations, {}); assert.equal(c.diagnostics.entryDayLowBelowStopKept, 0);
  // consolidated daily low 22.5 below the IEX stop, IEX minutes after the fill never reach it: same trade, counted
  const low = run(22.5);
  assert.equal(low.r.trades[0].exitReason, 'EP_CLOSE_BELOW_MA20'); assert.ok(near(low.r.trades[0].pnl, t.pnl));
  assert.deepEqual(low.c.violations, {}); assert.equal(low.c.diagnostics.entryDayLowBelowStopKept, 1);
});

test('SF7-GC-PS: Short 26,79 unter dem 5-Minuten-ORL, Stop 27,51 (HOD + 1 Cent), Ziel MA10 der Vortage 21,9187; Gap ueber den Stop -> Eindeckung zur Eroeffnung 27,8', () => {
  const ret = (e, x) => (e * 0.999 - x * 1.001 - (e + x) * 0.0001) / e;
  const a = G.psScenario(), ra = runPsCandidate({ bars: a.bars, cand: psChartCandidate(a.bars, 63), minutes: G.psMinutes(), cfg: PS_REFERENCE_CONFIG });
  assert.equal(ra.status, 'CLOSED'); assert.equal(ra.trade.entryAdj, 26.79); assert.ok(near(ra.trade.stopAdj, 27.51, 1e-9));
  // MA10 of the closes of bars 55..64 = (5 x 20 + 21 + 22.47 + 24.717 + 26.2 + 24.8) / 10 = 21.9187; low 21 on bar 65 reaches it, open 24.8 above it
  assert.deepEqual(ra.trade.fills.map((x) => [x.date, x.reason]), [[G.epDay(65), 'PS_TARGET_MA10']]); assert.ok(near(ra.trade.fills[0].priceAdj, 21.9187, 1e-9));
  assert.ok(near(ra.trade.netReturn, ret(26.79, 21.9187), 1e-12)); // 0.17983
  const b = G.psScenario([[27.8, 28.2, 27.6, 28]]), rb = runPsCandidate({ bars: b.bars, cand: psChartCandidate(b.bars, 63), minutes: G.psMinutes(), cfg: PS_REFERENCE_CONFIG });
  assert.deepEqual(rb.trade.fills.map((x) => [x.date, x.reason, x.priceAdj]), [[G.epDay(64), 'PS_STOP_HOD_GAP_OPEN', 27.8]]);
  assert.ok(near(rb.trade.netReturn, ret(26.79, 27.8), 1e-12)); // -0.03994
});

test('SF7-VAL-PS-PIT: Einstieg, Stop und Ziele eines PS-Trades haengen nicht von Minuten nach dem Einstieg oder spaeteren Tagesbalken ab', () => {
  const s = G.psScenario(), m = G.psMinutes(), a = runPsCandidate({ bars: s.bars, cand: psChartCandidate(s.bars, 63), minutes: m, cfg: PS_REFERENCE_CONFIG });
  const bars = s.bars.map((b, i) => (i > 63 ? { ...b, open: b.open * 0.5, high: b.high * 0.6, low: b.low * 0.4, close: b.close * 0.5 } : b));
  const mins = m.map((x) => (x.k > 7 ? { ...x, open: x.open + 3, high: x.high + 5, low: x.low - 5, close: x.close + 1 } : x));
  const b = runPsCandidate({ bars, cand: psChartCandidate(bars, 63), minutes: mins, cfg: PS_REFERENCE_CONFIG });
  assert.deepEqual([b.trade.entryMinute, b.trade.entryAdj, b.trade.stopAdj], [a.trade.entryMinute, a.trade.entryAdj, a.trade.stopAdj]);
  assert.deepEqual(psChartCandidate(bars, 63), psChartCandidate(s.bars, 63));
});

test('SF7-VAL-EP-PIT-CORRUPTION: EP-Entscheidungen bis zum Stichtag unabhaengig von spaeteren Tagesbalken', () => {
  const s = G.epScenario(), cut = 90, cd = G.epDay(cut);
  const mk = (bars) => { const d = G.ds({ ...s, bars }); d.kkIntraday = { minutes: (t, x) => (x === G.epDay(80) ? G.epMinutes() : undefined), iexBaseline: () => 200000 }; return d; };
  const a = runResearchLifecycle(mk(s.bars), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  const b = runResearchLifecycle(mk(V.corruptAfter(G.ds(s), cut, { seed: 3 }).securities[0].bars), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  assert.ok(a.trades.length === 1 && a.trades[0].entryDate <= cd);
  assert.deepEqual(V.decisionsThrough(b, cd), V.decisionsThrough(a, cd));
});

// ---------------------------------------------------------------- Code-Fingerabdruecke (LOW aus §6: 6.0-Listen ohne lifecycle-engine.mjs)
import * as COV from '../source-faithful/research/sf7-code-coverage.mjs';
import { integrityCodeSha256 } from '../source-faithful/research/run-sf6-integrity.mjs';
import { SF6_RUN_FACTS } from '../source-faithful/completion/sf6-run-facts.mjs';
import { sf6PaperProtocolSha256 } from '../source-faithful/completion/sf6-paper-protocol-2027.mjs';
// lifecycle-engine.mjs (last change d1ea0179, the commit of sf5 run 40099831813) and minervini-execution.mjs (7bd28f69,
// before Minervini run 40170832007): the code every 7.0 identity run executed
const PINNED_SF6_ENGINE_FILES = '7edb24de208af62d12f68f19c1a25b5d1cfe25493266a060c75328fcec762def';

test('SF7-VAL-CODE-COVERAGE: jede ausgefuehrte Abhaengigkeit der Runner liegt in einem eingetragenen Fingerabdruck; Zusatz-Fingerabdruck der Engine gepinnt; 6.0-Fingerabdruecke unveraendert', () => {
  const runners = [...COV.SF6_RUNNERS, { runner: 'run-sf5-lifecycle.mjs', own: ['AG3_ENGINE', 'SF5_RESEARCH'] }, { runner: 'run-sf4-lifecycle.mjs', own: ['AG3_ENGINE', 'SF4_RESEARCH'] }, { runner: 'run-kk-intraday.mjs', own: ['AG3_ENGINE', 'KK_RESEARCH'] }];
  for (const r of runners) {
    const c = COV.coverageOf(r.runner, r.own);
    assert.ok(c.closure > 10, r.runner);
    assert.deepEqual(c.uncovered, [], `${r.runner}: executed code in no recorded fingerprint`);
  }
  // the finding itself: the 6.0 receipts do not carry the engine files; other recorded fingerprints do
  for (const r of COV.SF6_RUNNERS) {
    const c = COV.coverageOf(r.runner, r.own);
    for (const f of COV.SF6_ENGINE_FILES) {
      const row = c.rows.find((x) => x.file.endsWith(`research/${f}`));
      assert.ok(row && c.notInOwnReceipt.includes(row.file), `${r.runner} ${f}`);
      assert.ok(row.coveredBy.includes(f === 'lifecycle-engine.mjs' ? 'SF5_RESEARCH' : 'SF4_RESEARCH'), `${f} ${row.coveredBy}`);
    }
  }
  assert.equal(COV.sf6EngineFilesSha256(), PINNED_SF6_ENGINE_FILES);
  // additive: no recorded or pinned 6.0 fingerprint moves
  assert.equal(integrityCodeSha256(), SF6_RUN_FACTS.integrity.integrityCodeSha256);
  assert.equal(sf6PaperProtocolSha256(), 'e623b336cd24a49e04b4588ab5b06c06d6226a323b368d4c659f2d7ce4b64f66');
});

// ---------------------------------------------------------------- Runner-Block (sf5-lifecycle-runner-1.2.0)
import { lifecyclePart } from '../source-faithful/research/run-sf5-lifecycle.mjs';
const METRIC_KEYS = /"(cagr|sharpe|sortino|winRate|profitFactor|expectancy|expectancyR|pnl|unrealizedPnl|realizedPnl|equity|returnPct|averageWin|averageLoss|maxDrawdown|mark|costs|dividends)"/;

test('SF7-VAL-RUNNER-BLOCK: der sf5-Runner fuehrt je Lifecycle Invarianten, PIT-Verfaelschung, Stabilitaet und die Weinstein-Lesart; oeffentlich nur Zaehlungen, ohne Verstoss', () => {
  const ds = withGroups(dataset());
  const r = lifecyclePart(ds, { from: day(200), to: day(699) });
  assert.doesNotMatch(JSON.stringify(r.pub), METRIC_KEYS);
  let signals = 0;
  for (const lc of SF5_LIFECYCLES) {
    const v = r.pub.strategies[lc.key].sf7Validation;
    assert.equal(v.registrySha256, V.sf7ValidationSha256());
    const ids = [...lc.variants.map((x) => x.id), ...SF7_EXECUTION_VARIANTS.filter((x) => x.key === lc.key).map((x) => x.id), ...V.SF7_VALIDATION_VARIANTS.filter((x) => x.key === lc.key).map((x) => x.id)];
    assert.deepEqual(Object.keys(v.invariants).sort(), [...ids].sort(), lc.key);
    for (const [id, x] of Object.entries(v.invariants)) assert.equal(x.violationCount, 0, `${lc.key} ${id} ${JSON.stringify(x.violations)}`);
    assert.equal(v.pitCorruption.decisionsIdentical, true); assert.equal(v.pitCorruption.signalsIdentical, true); signals += v.pitCorruption.signalsCompared;
    assert.ok(v.stability.leaveOneOut.length >= 1 && v.stability.leaveOneOut.length <= 3, lc.key); assert.ok(v.stability.startShift); // at most 3, fewer when fewer securities traded
    assert.doesNotMatch(JSON.stringify(v.stability), /S0\d\d/); // security ids stay sealed
    assert.ok(r.sealed.strategies[lc.key].sf7Validation.stability.leaveOneOut.every((x) => /^S0\d\d$/.test(x.id)));
  }
  assert.ok(signals > 1000, `${signals}`);
  for (const k of ['WEINSTEIN_INVESTOR', 'WEINSTEIN_TRADER']) {
    const x = r.pub.strategies[k].sf7Validation.variants['SF7-WEIN-TRAIL-AT-OR-ABOVE'];
    assert.equal(x.compareTo, 'REF'); assert.equal(x.reconciliation, true);
    const c = x.comparison; assert.equal(c.unchanged + c.sharesOnly + c.changed + c.dropped, c.base);
  }
});
