// Supertrader 7.0 – gemeinsame Ausfuehrung und Abrechnung (research/lifecycle-engine.mjs), adversarielle Pruefung.
// Defekte mit Testkennung (docs/SUPERTRADER_7_EXECUTION_AND_STRATEGIES.md):
//  SF7-D1  OPTIMISTIC ignorierte einen am Einstiegsbalken SICHEREN Stop (Fill per Beruehrung, Schluss <= Stop);
//          Behebung nur als deklarierte, versionierte Variante (EX7-SAME-BAR-CLOSE-CONFIRMS-STOP), Referenzen unveraendert;
//  SF7-D2  EP-Handelskennzahlen (versiegelt) lasen realizedPnl, das geschlossene Engine-Trades nicht tragen.
// Dazu Regressionstests fuer bisher duenne Abdeckung (Kostensymmetrie, Reihenfolgeunabhaengigkeit, Stueckbilanz je Trade,
// Dividende am Einstiegstag, Positionsgrenze mit gleichzeitigen Signalen, Drawdown). Simuliert nur Research-Trades.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { runResearchLifecycle, fillOrder, eligibilityResult, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from '../source-faithful/research/lifecycle-engine.mjs';
import { maxDrawdown } from '../source-faithful/runner/metrics.mjs';
import { epTradeSummary, epSealedTrade } from '../source-faithful/research/run-kk-intraday.mjs';
import { SF7_EXECUTION_VARIANTS, SF7_EXECUTION_REVISIONS, sf7ExecutionVariantsSha256, ledgerWithoutReasonsSha256 } from '../source-faithful/research/sf7-execution-variants.mjs';
import { SF5_LIFECYCLES, sf5VariantRegistrySha256 } from '../source-faithful/research/sf5-lifecycles.mjs';
import { DARVAS_ADAPTER } from '../source-faithful/research/darvas-lifecycle.mjs';

// pinned before any snapshot result of the Supertrader 7.0 variants exists
const PINNED_SF7_VARIANTS = '310cb075a0021cce0feea0a47412de1112e307a2e50156de7c8127140f88033a';
const PINNED_SF7_EP_VARIANTS = '1b48d3cd2a629da14ce8ee57c606ea9b06b51054b6333f075b5c846398489223';
const PINNED_SF5_VARIANT_REGISTRY = '0a1260e9d087b1cde8176b66134e19b32222f94653d46df31c495d02552940da';

const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, extra = {}) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1, ...extra });
const flat = (n, px = 10) => Array.from({ length: n }, (_, k) => bar(k, px, px + 0.1, px - 0.1, px));
const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const OPEN_UNIVERSE = Object.freeze({ id: 'TEST_OPEN', priceFloorRaw: 0, dollarVolumeFloor: 0, dollarVolumeSessions: 1 });
const ZERO_COST = { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, slippageBps: 0, commissionBps: 0 };

/** Test adapter: orders[id] = Map(signal index -> order); no management rule. */
function adapter(orders, extra = {}) {
  return {
    strategy: 'TEST', version: 'test-1', validateConfig: () => [],
    prepare: (s) => (orders[s.id] ? { bars: s.bars, o: orders[s.id] } : null),
    signalAt: (ctx, i) => (ctx.o.has(i) ? { date: ctx.bars[i].date, i } : null),
    eligibility: ({ ctx, bars, i }) => eligibilityResult({ strategy: 'TEST', bars, i, blockers: [], openManualDecisions: [], order: ctx.o.get(i) }),
    onClose: () => {},
    ...extra,
  };
}
const run = (d, a, cfg = {}, policy = ZERO_COST) => runResearchLifecycle(d, { adapter: a, config: { intrabarOrder: 'PESSIMISTIC', sizing: { mode: 'WEIGHT', weight: 0.1 }, ...cfg }, policy, universe: OPEN_UNIVERSE });

/** signal at bar 24: buy stop 10.5, stop 10.0; bar 25 touches the level, trades through the stop and closes below it */
function closeBelowStop(close = 9.95, next = [9.9, 10.0, 9.8, 9.9]) {
  const bars = flat(25);
  bars.push(bar(25, 10.2, 10.8, 9.9, close));
  bars.push(bar(26, ...next));
  for (let k = 27; k < 32; k++) bars.push(bar(k, 10, 10.1, 9.9, 10));
  return { id: 'A', bars };
}
const BUY = new Map([[24, { type: 'BUY_STOP', level: 10.5, stop: 10.0 }]]);

test('SF7-D1-FILL: Fill per Beruehrung, Tief und Schluss am/unter dem Stop = sicherer Stop (nur mit Revision); sonst mehrdeutig', () => {
  const b = (c) => ({ date: '2020-02-03', open: 10.2, high: 10.8, low: 9.9, close: c, volume: 1 });
  const o = { type: 'BUY_STOP', level: 10.5, stop: 10.0 };
  assert.equal(fillOrder(b(9.95), o).sameBarStop, 'AMBIGUOUS'); // reference behaviour unchanged
  assert.equal(fillOrder(b(9.95), o, { closeConfirmsStop: true }).sameBarStop, 'CERTAIN_BY_CLOSE');
  assert.equal(fillOrder(b(10.0), o, { closeConfirmsStop: true }).sameBarStop, 'CERTAIN_BY_CLOSE'); // close at the stop: the stop traded
  assert.equal(fillOrder(b(10.1), o, { closeConfirmsStop: true }).sameBarStop, 'AMBIGUOUS'); // low may precede the touch
  // a gap fill at the open stays CERTAIN in both readings
  assert.equal(fillOrder({ ...b(9.95), open: 10.6 }, o, { closeConfirmsStop: true }).sameBarStop, 'CERTAIN');
  assert.equal(fillOrder({ ...b(9.95), close: NaN }, o, { closeConfirmsStop: true }).sameBarStop, 'AMBIGUOUS');
});

test('SF7-D1-LIFECYCLE: OPTIMISTIC haelt ohne Revision eine sicher gestoppte Position (Defekt); mit Revision Ausstieg am Stop desselben Balkens', () => {
  const d = ds(closeBelowStop());
  const before = run(d, adapter({ A: BUY }), { intrabarOrder: 'OPTIMISTIC' });
  assert.equal(before.trades.length, 1);
  assert.equal(before.trades[0].exitDate, day(26)); // held over the close below the stop, stopped next day at the gap open
  assert.equal(before.trades[0].exitReason, 'STOP_INITIAL_GAP_OPEN');
  const after = run(d, adapter({ A: BUY }, { sameBarCloseConfirmsStop: true }), { intrabarOrder: 'OPTIMISTIC' });
  assert.equal(after.trades[0].exitDate, day(25));
  assert.equal(after.trades[0].exitReason, 'STOP_SAME_BAR_CERTAIN_CLOSE_AT_OR_BELOW_STOP');
  assert.equal(after.ledger.at(-1).price, 10.0);
  assert.equal(after.counts.sameBarStopCertainByClose, 1);
  assert.equal(after.reconciliation.pass, true);
  // close above the stop: still ambiguous, OPTIMISTIC keeps the position in both readings
  const amb = ds(closeBelowStop(10.3, [10.3, 10.4, 10.2, 10.3]));
  assert.deepEqual(run(amb, adapter({ A: BUY }, { sameBarCloseConfirmsStop: true }), { intrabarOrder: 'OPTIMISTIC' }).ledger, run(amb, adapter({ A: BUY }), { intrabarOrder: 'OPTIMISTIC' }).ledger);
});

test('SF7-D1-PESSIMISTIC-PRICES: unter PESSIMISTIC aendert die Revision nur die Einordnung, nie Fill, Stueckzahl oder Preis', () => {
  const d = ds(closeBelowStop());
  const a = run(d, adapter({ A: BUY })), b = run(d, adapter({ A: BUY }, { sameBarCloseConfirmsStop: true }));
  assert.equal(a.trades[0].exitReason, 'STOP_SAME_BAR_ASSUMED');
  assert.equal(b.trades[0].exitReason, 'STOP_SAME_BAR_CERTAIN_CLOSE_AT_OR_BELOW_STOP');
  assert.equal(ledgerWithoutReasonsSha256(a.ledger), ledgerWithoutReasonsSha256(b.ledger));
  assert.notDeepEqual(a.ledger, b.ledger);
});

test('SF7-D1-REFERENCES-UNTOUCHED: Revision nur ueber eigene Wrapper; sf5-Register und Referenzadapter unveraendert', () => {
  assert.equal(sf5VariantRegistrySha256(), PINNED_SF5_VARIANT_REGISTRY);
  for (const lc of SF5_LIFECYCLES) assert.equal(lc.adapter.sameBarCloseConfirmsStop, undefined, lc.key);
  assert.equal(DARVAS_ADAPTER.sameBarCloseConfirmsStop, undefined);
  assert.equal(sf7ExecutionVariantsSha256(), PINNED_SF7_VARIANTS);
  assert.deepEqual(SF7_EXECUTION_REVISIONS.map((r) => r.id), ['EX7-SAME-BAR-CLOSE-CONFIRMS-STOP']);
  for (const v of SF7_EXECUTION_VARIANTS) {
    const lc = SF5_LIFECYCLES.find((l) => l.key === v.key), base = lc.variants.find((x) => x.id === v.compareTo);
    assert.ok(base, v.id);
    assert.deepEqual(v.config, base.config, 'gleiche Konfiguration wie die Vergleichsvariante');
    assert.equal(v.adapter.sameBarCloseConfirmsStop, true);
    assert.equal(v.adapter.prepareKey(v.config), lc.adapter.prepareKey(v.config), 'gleiche Vorbereitung');
    assert.match(v.adapter.version, /\+sf7-execution-variants-/);
  }
  // only lifecycles with a BUY_STOP touch fill can be affected (ON_OPEN / ON_CLOSE orders have no entry-bar ambiguity)
  assert.deepEqual([...new Set(SF7_EXECUTION_VARIANTS.map((v) => v.key))].sort(), ['DARVAS', 'HOLY_GRAIL_W_RAS97', 'WEINSTEIN_INVESTOR', 'WEINSTEIN_TRADER']);
});

test('SF7-D2-EP-TRADE-SUMMARY: versiegelte EP-Handelskennzahlen nutzen das Ergebnis geschlossener Trades (pnl)', () => {
  const closed = { id: 'X', status: 'CLOSED', shares: 10, entryFill: 100, pnl: 50 }, open = { id: 'Y', status: 'OPEN_AT_DATA_END', shares: 10, entryFill: 100, realizedPnl: 0, unrealizedPnl: 5 };
  const s = epTradeSummary([closed, open]);
  assert.equal(s.closed, 1); assert.equal(s.openAtDataEnd, 1);
  assert.equal(s.meanReturn, 0.05); assert.equal(s.medianReturn, 0.05); assert.equal(s.hitRate, 1);
  assert.equal(epSealedTrade(closed).realizedPnl, 50);
  assert.equal(epSealedTrade(open).realizedPnl, 0); assert.equal(epSealedTrade(open).unrealizedPnl, 5);
});

test('SF7-EX-COST-SYMMETRY: Slippage und Gebuehr symmetrisch je Seite; Kosten = Summe beider Seiten', () => {
  const bars = flat(30); const d = ds({ id: 'A', bars });
  const a = adapter({ A: new Map([[10, { type: 'ON_OPEN', stop: 9 }]]) }, { onClose: (pos, ctx, i, api) => { if (i === 15) api.scheduleExit(1, 'TEST_EXIT'); } });
  const r = run(d, a, {}, PLATFORM_RESEARCH_PORTFOLIO_POLICY), [buy, sell] = r.ledger;
  const slip = 10 / 1e4, fee = 1 / 1e4;
  assert.equal(buy.price, 10 * (1 + slip)); assert.equal(sell.price, 10 * (1 - slip));
  assert.ok(Math.abs(buy.fee - buy.gross * fee) < 1e-12 && Math.abs(sell.fee - sell.gross * fee) < 1e-12);
  const expected = buy.shares * 10 * slip * 2 + buy.fee + sell.fee;
  assert.ok(Math.abs(r.counts.costs - expected) < 1e-9);
  assert.ok(Math.abs(r.trades[0].pnl + expected) < 1e-9, 'Rundlauf zum gleichen Preis verliert genau die Kosten');
});

/** many securities with simultaneous signals on the same sessions */
function crowd(n = 30) {
  const secs = [], orders = {};
  for (let k = 0; k < n; k++) {
    const id = `S${String(k).padStart(2, '0')}`, bars = flat(60, 10 + k * 0.01);
    secs.push({ id, bars });
    orders[id] = new Map([[20, { type: 'ON_OPEN', stop: 5 }], [40, { type: 'ON_OPEN', stop: 5 }]]);
  }
  return { secs, orders };
}

test('SF7-EX-POSITION-CAP-TIEBREAK: gleichzeitige Signale, Positionsgrenze und Bargeld binden; Auswahl nur ueber die datumsbasierte neutrale Reihenfolge', () => {
  const { secs, orders } = crowd();
  const r = run(ds(...secs), adapter(orders), { sizing: { mode: 'WEIGHT', weight: 0.04 } });
  assert.equal(Math.max(...r.curve.map((p) => p.positions)), PLATFORM_RESEARCH_PORTFOLIO_POLICY.maxOpenPositions);
  // 30 signals, 20 slots on each signal session; on the second the 20 held ones are duplicates, the other 10 rejected again
  assert.equal(r.counts.rejectMaxPositions, 20); assert.equal(r.counts.duplicateSignalsIgnored, 20);
  for (const p of r.curve) assert.ok(p.equity * (1 - p.exposure) > -1e-9, 'Bargeld nie negativ');
  // the selection is the same for every input order of the securities (no dependence on file / id order beyond the rank)
  const rev = run(ds(...[...secs].reverse()), adapter(orders), { sizing: { mode: 'WEIGHT', weight: 0.04 } });
  assert.deepEqual(rev.ledger, r.ledger);
  // and a cash bound: 10 % weight, 20 slots -> cash binds before the slot cap
  const c = run(ds(...secs), adapter(orders), { sizing: { mode: 'WEIGHT', weight: 0.1 } });
  assert.ok(c.counts.rejectInsufficientCapital + c.counts.cappedByCash > 0);
  assert.ok(Math.min(...c.curve.map((p) => p.equity * (1 - p.exposure))) > -1e-9);
});

test('SF7-EX-SHARE-BALANCE: unabhaengige Abstimmung - Stueckbilanz je Trade, Ledger-Cash und Kurve aus Ledger + Marken', () => {
  const { secs, orders } = crowd(12);
  const a = adapter(orders, { onClose: (pos, ctx, i, api) => { if (i - pos.entryIndex === 3) api.scheduleExit(1 / 3, 'TEST_PARTIAL'); if (i - pos.entryIndex === 8) api.scheduleExit(1, 'TEST_EXIT'); } });
  const r = run(ds(...secs), a, {}, PLATFORM_RESEARCH_PORTFOLIO_POLICY);
  const bal = new Map();
  for (const x of r.ledger) if (x.side !== 'DIVIDEND') bal.set(x.tradeId, (bal.get(x.tradeId) || 0) + (x.side === 'BUY' ? x.shares : -x.shares));
  for (const t of r.trades) assert.ok(Math.abs(bal.get(t.tradeId)) < 1e-9 || t.status === 'OPEN_AT_DATA_END', `trade ${t.tradeId}`);
  assert.ok(r.counts.partialExits > 0);
  // final equity = ledger cash + marks of the open positions
  const lastEq = r.curve.at(-1).equity, openMv = r.trades.filter((t) => t.status === 'OPEN_AT_DATA_END').reduce((s, t) => s + bal.get(t.tradeId) * t.mark, 0);
  assert.ok(Math.abs(lastEq - (r.reconciliation.ledgerCash + openMv)) < 1e-6);
});

test('SF7-EX-DIVIDEND-ENTRY-DAY: Dividende nicht am Kauftag zur Eroeffnung, aber am Folgetag eines Schlusskurs-Kaufs', () => {
  const mk = (divAt) => { const bars = flat(30); bars[divAt] = { ...bars[divAt], dividend: 0.5 }; return { id: 'A', bars }; };
  const onOpen = run(ds(mk(11)), adapter({ A: new Map([[10, { type: 'ON_OPEN', stop: 9 }]]) }));
  assert.equal(onOpen.counts.dividends, 0); // bought at the open of the ex-date: no dividend
  const held = run(ds(mk(12)), adapter({ A: new Map([[10, { type: 'ON_OPEN', stop: 9 }]]) }));
  assert.equal(held.counts.dividends, held.trades[0].shares * 0.5);
  const close = run(ds(mk(11)), adapter({ A: new Map([[10, { type: 'ON_CLOSE', stop: 9 }]]) }));
  assert.equal(close.counts.dividends, close.trades[0].shares * 0.5); // held at the close before the ex-date
});

test('SF7-EX-GAP-THROUGH-STOP-AND-OVER-BUY-STOP: Kauf-Gap zur Eroeffnung, Stop-Gap zur Eroeffnung, nie besser als der Balken', () => {
  const bars = flat(25); bars.push(bar(25, 11, 11.2, 10.9, 11.1)); bars.push(bar(26, 9.5, 9.7, 9.4, 9.6));
  for (let k = 27; k < 30; k++) bars.push(bar(k, 9.6, 9.7, 9.5, 9.6));
  const r = run(ds({ id: 'A', bars }), adapter({ A: BUY }));
  assert.equal(r.trades[0].entryFill, 11); assert.equal(r.trades[0].entryBasis, 'OPEN_GAP_AT_OR_ABOVE_LEVEL');
  assert.equal(r.trades[0].exitReason, 'STOP_INITIAL_GAP_OPEN'); assert.equal(r.ledger.at(-1).price, 9.5);
});

test('SF7-EX-MAXDD: Drawdown ueber die Kurve inklusive Startkapital, Spitze vor dem Tief', () => {
  const c = [100, 120, 90, 130, 104].map((equity, k) => ({ date: day(k), equity }));
  assert.equal(maxDrawdown(c), 90 / 120 - 1);
  assert.equal(maxDrawdown([{ date: day(0), equity: 100 }]), 0);
});

test('SF7-D3-TURTLE-OPTIMISTIC-CHARACTERIZED: Turtle-Alternative OPTIMISTIC uebergeht auch nach einem Eroeffnungs-Fill den Stop desselben Balkens (offen, Engine gepinnt); Referenz PESSIMISTIC stoppt', async () => {
  const { runTurtle } = await import('../source-faithful/methods/turtle.mjs');
  const bars = flat(70);
  bars.push(bar(70, 11, 11.1, 9.0, 9.5)); // gap above the 55-day high: entry at the open, then the low runs through every stop
  for (let k = 71; k < 80; k++) bars.push(bar(k, 9.5, 9.6, 9.4, 9.5));
  const d = ds({ id: 'A', bars });
  const ref = runTurtle(d, { system: 'S2', universe: OPEN_UNIVERSE, slippageBps: 0, commissionBps: 0 });
  const opt = runTurtle(d, { system: 'S2', universe: OPEN_UNIVERSE, slippageBps: 0, commissionBps: 0, entryBarOrder: 'OPTIMISTIC' });
  assert.equal(ref.positionTrades[0].entryDate, day(70)); assert.equal(ref.positionTrades[0].exitDate, day(70));
  // known and listed (docs SUPERTRADER_7 SF7-D3): the open fill came first, the stop is certain, OPTIMISTIC still holds it
  assert.equal(opt.positionTrades[0].exitDate > day(70), true);
});

test('SF7-RUNNER-BLOCK: der sf5-Runner misst jede SF7-Variante neben ihrer unveraenderten Vergleichsvariante; oeffentlich nur Zaehlungen', async () => {
  const { lifecyclePart } = await import('../source-faithful/research/run-sf5-lifecycle.mjs');
  const r0 = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const secs = [];
  for (let s = 0; s < 20; s++) {
    const r = r0(s + 101); let c = 20; const bars = [];
    for (let k = 0; k < 500; k++) {
      const o = c * (1 + 0.012 * (r() - 0.5)); c = o * (1 + 0.0015 + 0.035 * (r() - 0.5));
      bars.push({ date: day(k), open: o, high: Math.max(o, c) * (1 + 0.015 * r()), low: Math.min(o, c) * (1 - 0.015 * r()), close: c, volume: 1e6, rawClose: c, rawVolume: 1e6, splitAdj: 1 });
    }
    secs.push({ id: `R${s}`, bars, terminal: null });
  }
  const d = { ...ds(...secs), spyTR: secs[0].bars.map((b) => ({ date: b.date, value: b.close })) };
  const out = lifecyclePart(d, { from: day(150), to: day(499), keys: ['DARVAS', 'HOLY_GRAIL_W_RAS97'] });
  for (const k of ['DARVAS', 'HOLY_GRAIL_W_RAS97']) {
    const p = out.pub.strategies[k], x = p.sf7Execution.variants, ref = x['SF7-REF-CLOSE-RULE'];
    assert.deepEqual(Object.keys(x), ['SF7-REF-CLOSE-RULE', 'SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE']);
    assert.equal(ref.comparison.ledgerWithoutReasonsEqual, true, `${k}: PESSIMISTIC prices unchanged`);
    assert.equal(ref.comparison.tradesDelta, 0);
    assert.equal(ref.comparison.ledgerRowsWithChangedReason, ref.comparison.sameBarStopCertainByClose);
    assert.ok(Object.values(x).every((v) => v.reconciliation === true));
    assert.equal(p.variants.REF.ledgerSha256 === ref.ledgerSha256, ref.comparison.sameBarStopCertainByClose === 0);
    // OPTIMISTIC: a certain stop changes the path (exits move, prices change), never only the labels
    const opt = x['SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE'], optBase = p.variants['ALT-INTRABAR-OPTIMISTIC'];
    assert.equal(opt.comparison.tradesDelta, opt.trades - optBase.trades);
    if (opt.comparison.sameBarStopCertainByClose > 0) { assert.equal(opt.comparison.ledgerWithoutReasonsEqual, false); assert.notEqual(opt.ledgerSha256, optBase.ledgerSha256); }
    else assert.equal(opt.ledgerSha256, optBase.ledgerSha256);
    for (const v of Object.values(x)) assert.equal(v.comparison.tradesDelta, v.trades - p.variants[v.compareTo].trades);
    assert.ok(out.sealed.strategies[k].sf7Execution['SF7-REF-CLOSE-RULE'].metrics);
  }
  assert.ok(out.pub.strategies.DARVAS.sf7Execution.variants['SF7-REF-CLOSE-RULE'].comparison.sameBarStopCertainByClose > 0, 'the synthetic universe must show the reclassification');
  assert.ok(out.pub.strategies.DARVAS.sf7Execution.variants['SF7-ALT-INTRABAR-OPTIMISTIC-CLOSE-RULE'].comparison.sameBarStopCertainByClose > 0, 'and the optimistic path change');
  assert.doesNotMatch(JSON.stringify(out.pub), /"(cagr|sharpe|pnl|equity|maxDrawdown|realizedPnl|unrealizedPnl)"/);
});

test('SF7-RUN-TRANSCRIPTION: eingetragene SF7-Registerhashes der Laeufe = aktueller Code', async () => {
  const { SF5_SNAPSHOT_RUNS } = await import('../source-faithful/completion/build-sf5-lifecycle.mjs');
  const auth = SF5_SNAPSHOT_RUNS.find((r) => r.role === 'AUTHORITATIVE');
  assert.equal(auth.sf7Execution.variantsSha256, sf7ExecutionVariantsSha256());
  for (const [k, vs] of Object.entries(auth.sf7Execution.variants)) for (const id of Object.keys(vs)) assert.ok(SF7_EXECUTION_VARIANTS.some((v) => v.key === k && v.id === id), `${k}/${id}`);
});

test('SF7-D4-MINERVINI-CHARACTERIZED: Minervini-Pivot-Beruehrung mit Schluss unter dem Stop gilt als mehrdeutig (offen, Code gepinnt b1d81fb8)', async () => {
  const { fillBuyOrder } = await import('../source-faithful/research/minervini-lifecycle.mjs');
  const f = fillBuyOrder({ date: '2020-02-03', open: 10.2, high: 10.8, low: 9.9, close: 9.95, volume: 1 }, { type: 'BUY_STOP', level: 10.5, stop: 10.0 });
  assert.equal(f.status, 'FILLED'); assert.equal(f.basis, 'INTRADAY_PIVOT_TOUCH');
  // known and listed (SF7-D4): the close below the stop proves the stop traded after the fill; OPTIMISTIC ignores it
  assert.equal(f.sameBarStop, 'AMBIGUOUS');
});

/** EP day: official open 23, 1-minute opening range high 23.2 (level 23.21), stop = low before the fill minute (22.95) */
function epDay(fill) {
  const mm = (k, o, h, l, c) => ({ k, open: o, high: h, low: l, close: c, volume: 1000 });
  const m = [mm(0, 23, 23.2, 22.95, 23.1), mm(1, ...fill)];
  for (let k = 2; k < 390; k++) m.push(mm(k, 23.5, 23.6, 23.4, 23.5));
  return m;
}
test('SF7-D5-EP-FILL-MINUTE: OPTIMISTIC uebergeht ohne Revision einen sicheren Stop in der Fill-Minute; mit Revision sicher (Eroeffnungs-Fill oder Schluss <= Stop)', async () => {
  const { resolveEpDay, EP_RUN_VARIANTS: EPV, EP_REFERENCE_CONFIG: REF } = await import('../source-faithful/research/kk-ep-lifecycle.mjs');
  const opt = EPV.find((v) => v.id === 'ALT-FILL-MINUTE-OPTIMISTIC').config, cfg = { ...opt, volumeRule: 'NONE' };
  const go = (fill, c, rule) => resolveEpDay({ minutes: epDay(fill), bar: { date: '2021-03-01', open: 23, high: 23.6, low: 22.9, close: 23.5, splitAdj: 1 }, rawFactor: 1, adrPct: 10, iexBaseline: null, cfg: c, fillMinuteRule: rule });
  const atOpen = [23.3, 23.4, 22.9, 23.0], closeBelow = [23.1, 23.3, 22.9, 22.94], ambiguous = [23.1, 23.3, 22.9, 23.1];
  for (const f of [atOpen, closeBelow]) {
    const before = go(f, cfg, false), after = go(f, cfg, true);
    assert.equal(before.status, 'FILLED'); assert.equal(before.sameDayStop, null); // defect: the certain stop is ignored
    assert.equal(after.sameDayStop, 'CERTAIN'); assert.equal(after.sameDayExitFill, 22.95);
  }
  assert.equal(go(atOpen, cfg, true).evidence.fillMinuteStop, 'CERTAIN_FILL_AT_MINUTE_OPEN');
  assert.equal(go(closeBelow, cfg, true).evidence.fillMinuteStop, 'CERTAIN_MINUTE_CLOSE_AT_OR_BELOW_STOP');
  assert.equal(go(ambiguous, cfg, true).sameDayStop, null); // the low may precede the fill: still ignored under OPTIMISTIC
  // REF (PESSIMISTIC) identical with and without the flag
  const ref = { ...REF, volumeRule: 'NONE' };
  for (const f of [atOpen, closeBelow, ambiguous]) assert.deepEqual(go(f, ref, true), go(f, ref, false));
});

test('SF7-D5-EP-VARIANT: Variante nur als Wrapper; EP-Register, Referenzadapter und Konfiguration unveraendert; gepinnt', async () => {
  const { KK_EP_ADAPTER, EP_RUN_VARIANTS: EPV, epVariantRegistrySha256 } = await import('../source-faithful/research/kk-ep-lifecycle.mjs');
  const { SF7_EP_VARIANTS, sf7EpExecutionVariantsSha256 } = await import('../source-faithful/research/sf7-ep-execution-variants.mjs');
  assert.equal(epVariantRegistrySha256(), 'e8d25282f42a98234dd8782a35960dca3776ff0a4657a84e7eff5aab41a3b22f');
  assert.equal(KK_EP_ADAPTER.fillMinuteRule, undefined); assert.equal(KK_EP_ADAPTER.version, 'kk-ep-chart-lifecycle-1.2.0');
  assert.equal(sf7EpExecutionVariantsSha256(), PINNED_SF7_EP_VARIANTS);
  for (const v of SF7_EP_VARIANTS) { assert.deepEqual(v.config, EPV.find((x) => x.id === v.compareTo).config); assert.equal(v.adapter.fillMinuteRule, true); assert.equal(v.adapter.prepareKey(v.config), KK_EP_ADAPTER.prepareKey(v.config)); }
});
