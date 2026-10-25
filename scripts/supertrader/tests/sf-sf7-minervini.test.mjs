// Supertrader 7.0 – Minervini source completion (research/minervini-sf7.mjs). Synthetic golden and adversarial cases.
// The 4.0 reference stays untouched: variants only change the setup index, the configuration is REFERENCE_CONFIG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { staggeredStopRisk, flatBaseSetupAt, withFlatBaseSetups, withTrendTemplateLow25, withRsLineRising, rsLineRising, benchIndex, largestDeclineSignal, halfAverageGainStopCheck, sf7VariantRegistrySha256, SF7_VARIANTS, SF7_MODEL_ASSUMPTIONS, SF7_SOURCE_BOUNDS } from '../source-faithful/research/minervini-sf7.mjs';
import { buildSetupIndex, runMinerviniLifecycle } from '../source-faithful/research/minervini-execution.mjs';
import { REFERENCE_CONFIG, variantRegistrySha256, fillBuyOrder, sepaSetupAt } from '../source-faithful/research/minervini-lifecycle.mjs';

// pinned before the first 7.0 snapshot result was read; re-pinned for 1.3.0 (E7-2 review: diagnostics only, the REF
// and the three variants are unchanged), before the 1.3.0 run; re-pinned for runner 1.2.0 with the E7-7 exit files
// (minervini-sf7-exits.mjs, minervini-sf7-exit-execution.mjs; minervini-sf7.mjs unchanged), before the E7-7 run
const PINNED_SF7_CODE_SHA256 = '2a2b3c3be0fab82ce1ff43c3f3ceb0a24a604eff4fcc5bae78f5ef3dce1cce83'; // re-pinned for runner 1.6.0 / mechanical 1.1.0 (review #940, second round) before its run; 832223b9… was runner 1.5.0 (run 40226429160), 84caa463… runner 1.4.0
const PINNED_SF7_REGISTRY_SHA256 = '9b9a8a00406baa7a029f6179716e0f870869f77bedf62e394caf67552c3fe27c'; // 1.4.0: only the version string changed; sf7VariantRegistrySha256('sf7-minervini-1.3.0') = ce98c24f… (test SF7-MECH-REGISTRY)
const day = (k) => new Date(Date.UTC(2019, 0, 1) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const mk = (closes, range = 0.002) => closes.map((c, k) => bar(k, c, c * (1 + range), c * (1 - range), c));
const path = (knots) => { const out = []; for (let s = 1; s < knots.length; s++) { const [a, pa] = knots[s - 1], [b, pb] = knots[s]; for (let k = a; k < b; k++) out.push(pa + ((pb - pa) * (k - a)) / (b - a)); } out.push(knots.at(-1)[1]); return out; };
const ds = (...secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs });
const run = (d, strategy, setupIndex) => runMinerviniLifecycle(d, { strategy, setupIndex, config: REFERENCE_CONFIG });

// flat base: uptrend to 100, then 30 sessions between ~94.5 and ~100 (about 6 % deep), breakout gap to 104
const FB = path([[0, 40], [280, 100], [285, 95], [290, 99], [295, 94.5], [300, 98.5], [305, 95], [310, 99], [311, 104], [350, 115]]);
// same history, but the base corrects about 20 % (outside "no more than 10 or 15 percent")
const DEEP = path([[0, 40], [280, 100], [290, 82], [300, 96], [310, 99], [311, 104], [350, 115]]);
// textbook VCP of the 4.0 tests (20 / 10 / 5 %)
const VCP = path([[0, 40], [260, 100], [272, 80], [284, 98], [292, 88.2], [300, 96], [305, 91.2], [320, 95], [330, 97], [340, 120], [400, 130]]);
const VOL = VCP.map((_, k) => (k <= 260 ? 2e6 : k <= 284 ? 1.5e6 : k <= 300 ? 1e6 : k <= 330 ? 5e5 : 3e6));

test('SF7-MIN-STAGGER: staggered stops redistribute, never increase the planned risk (MIN-W18-1, English answer recorded by #709)', () => {
  const ok = staggeredStopRisk({ entry: 100, shares: 100, singleStop: 92, tranches: [{ shares: 50, stop: 95 }, { shares: 50, stop: 89 }] });
  assert.equal(ok.ok, true); assert.equal(ok.plannedRiskSingle, 800); assert.equal(ok.plannedRiskStaggered, 800);
  const wider = staggeredStopRisk({ entry: 100, shares: 100, singleStop: 92, tranches: [{ shares: 50, stop: 94 }, { shares: 50, stop: 86 }] });
  assert.deepEqual(wider.violations, ['STAGGERED_RISK_ABOVE_PLANNED_RISK']);
  assert.deepEqual(staggeredStopRisk({ entry: 100, shares: 100, singleStop: 92, tranches: [{ shares: 60, stop: 95 }] }).violations, ['TRANCHES_DO_NOT_COVER_POSITION']);
  assert.deepEqual(staggeredStopRisk({ entry: 100, shares: 100, singleStop: 101, tranches: [{ shares: 100, stop: 95 }] }).violations, ['INVALID_PLAN']);
  // a break-even tranche (stop = entry) carries zero risk and is valid
  assert.equal(staggeredStopRisk({ entry: 100, shares: 100, singleStop: 92, tranches: [{ shares: 50, stop: 100 }, { shares: 50, stop: 85 }] }).ok, true);
});

test('SF7-MIN-FLAT-BASE: flat base <= 15 % with pivot at the base high (B12 PDF 306); the 4.0 strict proxy does not trade it, the variant does', () => {
  const s = { id: 'FB', bars: mk(FB) }, d = ds(s);
  const f = flatBaseSetupAt(s.bars, 309);
  assert.equal(f.state, 'SETUP_DETECTED'); assert.equal(f.pivot, s.bars[280].high); assert.ok(f.flatBase.depth <= SF7_SOURCE_BOUNDS.flatBaseMaxCorrection.value);
  const ref = buildSetupIndex(d, 'SEPA');
  assert.equal(run(d, 'SEPA', ref).trades.length, 0);
  const alt = withFlatBaseSetups(d, ref), r = run(d, 'SEPA', alt);
  assert.equal(r.trades.length, 1); assert.equal(r.trades[0].entryDate, day(311));
  assert.ok(r.trades[0].plannedLoss <= 0.10 + 1e-12); assert.equal(r.reconciliation.pass, true);
  // the reference index is not mutated
  assert.equal(run(d, 'SEPA', ref).trades.length, 0);
});

test('ADV-SF7-MIN-FLAT-BASE-DEEP: a base deeper than 15 % is no flat base; a base shorter than 15 sessions neither', () => {
  const s = { id: 'D', bars: mk(DEEP) };
  for (let i = 290; i <= 310; i++) assert.equal(flatBaseSetupAt(s.bars, i), null);
  const f = { id: 'FB', bars: mk(FB) };
  assert.equal(flatBaseSetupAt(f.bars, 290), null); // 10 sessions after the base high
});

test('SF7-MIN-FLAT-BASE-KEEPS-REF: a strict 4.0 VCP setup is kept unchanged; the variant reproduces the reference trade', () => {
  const s = { id: 'VCP', bars: VCP.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c, VOL[k])) }, d = ds(s);
  const ref = buildSetupIndex(d, 'SEPA'), alt = withFlatBaseSetups(d, ref);
  const a = run(d, 'SEPA', ref), b = run(d, 'SEPA', alt);
  assert.equal(a.trades.length, 1);
  assert.deepEqual(b.trades.map((t) => [t.entryDate, t.entryFill, t.initialStop]), a.trades.map((t) => [t.entryDate, t.entryFill, t.initialStop]));
});

test('SF7-MIN-FLAT-BASE-PIT: the flat-base setup on close i uses bars 0..i only', () => {
  const b = mk(FB);
  for (const i of [300, 305, 309, 320]) assert.deepEqual(flatBaseSetupAt(b.slice(0, i + 1), i), flatBaseSetupAt(b, i));
});

test('SF7-MIN-TT6-25: the 25 % reading of the 52-week-low criterion (B03 PDF 143) qualifies closes the 30 % reference rejects; superset of the reference', () => {
  // slow rise to ~100, then a run to ~129: some closes are 25-30 % above the 52-week low
  const c = [...path([[0, 80], [200, 100], [260, 100.5]]), ...path([[0, 100.5], [40, 129], [48, 121], [56, 128], [62, 124.5], [75, 127.2], [76, 131]]).slice(1)];
  const s = { id: 'L', bars: mk(c) }, d = ds(s);
  const ref = buildSetupIndex(d, 'SEPA'), alt = withTrendTemplateLow25(d);
  assert.equal(alt.counts.sf7.aboveLow, 0.25);
  assert.ok(alt.counts.NOT_QUALIFIED < ref.counts.NOT_QUALIFIED);
  for (const [i, st] of ref.index.get('L') ?? []) assert.deepEqual(alt.index.get('L').get(i), st);
});

test('SF7-MIN-RS-LINE: setups are kept only while the RS line rose over 6 weeks (B03 PDF 143); not measurable -> removed', () => {
  const s = { id: 'VCP', bars: VCP.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c, VOL[k])) };
  const flatBench = s.bars.map((b) => ({ date: b.date, close: 100 }));
  const hotBench = s.bars.map((b, k) => ({ date: b.date, close: 100 * (1 + k * 0.01) })); // market outruns the stock
  const d1 = { ...ds(s), benchmark: flatBench }, d2 = { ...ds(s), benchmark: hotBench }, d3 = { ...ds(s), benchmark: [] };
  const ref = buildSetupIndex(d1, 'SEPA');
  assert.equal(run(d1, 'SEPA', withRsLineRising(d1, ref)).trades.length, run(d1, 'SEPA', ref).trades.length);
  assert.equal(run(d2, 'SEPA', withRsLineRising(d2, ref)).trades.length, 0);
  assert.equal(withRsLineRising(d3, ref).index.size, 0);
  assert.equal(rsLineRising(s.bars, 10, benchIndex(flatBench)), null);
  // the lookback is 30 benchmark sessions: a security with a gap on that earlier date is not measurable (no longer window)
  const gappy = s.bars.filter((_, k) => k !== 294), b = benchIndex(flatBench);
  assert.equal(rsLineRising(gappy, gappy.findIndex((x) => x.date === s.bars[324].date), b), null);
  assert.equal(typeof rsLineRising(s.bars, 324, b), 'boolean');
});

test('SF7-MIN-LARGEST-DECLINE: the first post-entry decline larger than every decline since the Stage 2 start is reported (B12 PDF 130), diagnostic only', () => {
  const closes = path([[0, 40], [300, 100], [320, 110]]);
  closes[305] = closes[304] * 0.99; // -1 % before the entry: the worst decline since the Stage 2 start
  const tail = [111, 110.5, 105, 106]; // -0.45 %, then -4.98 % on the third session after the entry
  const b = mk([...closes, ...tail]);
  const t = { setupDate: b[315].date, entryDate: b[316].date, exitDate: b.at(-1).date };
  const r = largestDeclineSignal(b, t);
  assert.equal(r.status, 'SIGNAL'); assert.equal(r.signalDate, b[323].date); assert.ok(r.decline < r.priorWorst);
  // PIT: the signal does not change if later bars are removed
  assert.equal(largestDeclineSignal(b.slice(0, 324), { ...t, exitDate: b[323].date }).signalDate, b[323].date);
  // the scan stops at the exit, also when the exit date has no bar (review 7.0); open trades are reported apart
  const gap = b.filter((_, k) => k !== 322);
  assert.equal(largestDeclineSignal(gap, { ...t, exitDate: b[322].date }).status, 'NO_SIGNAL_BEFORE_EXIT');
  assert.equal(largestDeclineSignal(b, { ...t, exitDate: null }).status, 'SIGNAL_OPEN_TRADE');
});

test('SF7-MIN-HALF-AVG-GAIN: planned loss compared with half the PIT average gain and with 10 % (B12 PDF 398-399), counts only', () => {
  const won = Array.from({ length: 10 }, (_, k) => ({ status: 'CLOSED', entryDate: `2020-01-${String(k + 1).padStart(2, '0')}`, exitDate: `2020-02-${String(k + 1).padStart(2, '0')}`, returnPct: 0.16, entryFill: 100, initialStop: 95 }));
  const later = [{ status: 'OPEN_AT_DATA_END', entryDate: '2020-03-01', entryFill: 100, initialStop: 93 }, { status: 'OPEN_AT_DATA_END', entryDate: '2020-03-02', entryFill: 100, initialStop: 89 }];
  const r = halfAverageGainStopCheck([...won, ...later]);
  assert.equal(r.notEvaluated, 10); assert.equal(r.evaluated, 2);
  assert.equal(r.plannedLossWithinHalfAvgGain, 1); assert.equal(r.plannedLossAboveHalfAvgGain, 1); assert.equal(r.plannedLossAbove10pct, 1);
});

test('SF7-MIN-PRICE-CONFIRM: no fill without the price crossing the pivot, whatever the fundamentals (MIN-W18-5, MIN-PRICE-01)', () => {
  const order = { type: 'BUY_STOP_LIMIT', level: 100, stop: 92, limit: 102.2 };
  assert.equal(fillBuyOrder({ date: day(1), open: 98, high: 99.9, low: 97, close: 99, volume: 1e6 }, order).status, 'NOT_TRIGGERED');
  assert.equal(fillBuyOrder({ date: day(1), open: 98, high: 100.5, low: 97, close: 100.2, volume: 1e6 }, order).status, 'FILLED');
});

test('SF7-MIN-REGISTRY: 7.0 additions pre-registered and pinned; the 4.0 reference registry is unchanged', () => {
  assert.equal(variantRegistrySha256(), 'f13ea35016c5e7e71f7ee3b266cb60812cf24b7efa13eae190983c4fe44cbe75');
  assert.equal(sf7VariantRegistrySha256(), PINNED_SF7_REGISTRY_SHA256);
  assert.deepEqual(SF7_VARIANTS.map((v) => v.id), ['ALT-SEPA-FLAT-BASE', 'ALT-SEPA-TT6-25', 'ALT-SEPA-RS-LINE']);
  for (const v of SF7_VARIANTS) assert.deepEqual(v.config, REFERENCE_CONFIG);
  assert.ok(SF7_MODEL_ASSUMPTIONS.every((m) => m.id.startsWith('MA-MIN7-') && m.why));
});

test('SF7-MIN-SOURCE-INVENTORY: artifact = fresh build, every contract rule and model assumption classified with a recorded page, all 132 #709 rows used, no book text', async () => {
  const fs = await import('node:fs');
  const { buildInventory, ARTIFACT, ARTIFACT_DIR } = await import('../source-faithful/completion/build-minervini-source-inventory.mjs');
  const fresh = buildInventory();
  assert.deepEqual(fresh.validation, { ok: true, errors: [] });
  assert.deepEqual(JSON.parse(fs.readFileSync(`${ARTIFACT_DIR}/${ARTIFACT}`, 'utf8')), JSON.parse(JSON.stringify(fresh)), 'inventory is stale: run completion/build-minervini-source-inventory.mjs');
  assert.equal(fresh.extraction.rows709, 132); assert.equal(fresh.extraction.rowUse.unused, 0);
  assert.equal(fresh.extraction.droppedBefore7.count, 9);
  assert.ok(fresh.sources.filter((s) => /^B/.test(s.sourceId)).every((s) => s.availableToday === 'PDF_SHA256_MATCHED_AT_FINDINGS_BUILD'));
  // no Minervini rule is SOURCE_EXACT; no book text in the findings
  const { MINERVINI_SEPA, MINERVINI_POWER_PLAY } = await import('../source-faithful/contracts/minervini.mjs');
  assert.deepEqual([...MINERVINI_SEPA.rules, ...MINERVINI_POWER_PLAY.rules].filter((r) => r.status === 'SOURCE_EXACT'), []);
  const findings = JSON.parse(fs.readFileSync(new URL('../source-faithful/evidence/MINERVINI-SF7-FINDINGS.json', import.meta.url), 'utf8'));
  assert.equal(findings.contentExportedToRepo, false);
  for (const r of findings.findings) { assert.match(r.quoteSha256, /^[0-9a-f]{64}$/); assert.equal(r.quote_original, undefined); }
  // E7-2: all 154 findings without #709 coverage classified; every NEW_IMPLEMENTABLE / REFINES has a disposition
  assert.equal(Object.values(fresh.findings154.counts).reduce((a, b) => a + b, 0), 154);
  assert.equal(Object.keys(fresh.findings154.disposition).length, fresh.findings154.counts.NEW_IMPLEMENTABLE + fresh.findings154.counts.REFINES);
});

test('SF7-MIN-RUNNER: REF of the 7.0 runner equals the 4.0 lifecyclePart REF on the same dataset; public part has counts and hashes only; code pinned', async () => {
  const { sf7Part, diffTrades, sf7CodeSha256 } = await import('../source-faithful/research/run-sf7-minervini.mjs');
  const { lifecyclePart } = await import('../source-faithful/research/run-sf4-lifecycle.mjs');
  const { RUN_VARIANTS } = await import('../source-faithful/research/minervini-lifecycle.mjs');
  const fb = { id: 'FB', bars: mk(FB) }, v = { id: 'VCP', bars: VCP.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c, VOL[k])) };
  const d = { ...ds(fb, v), benchmark: fb.bars.map((x) => ({ date: x.date, close: 100 })), spyTR: null };
  const r7 = sf7Part(d, { from: null, to: null }), r4 = lifecyclePart(d, { variants: RUN_VARIANTS.filter((x) => x.id === 'REF'), sf7Variants: [], from: null, to: null }); // REF only, no 7.0 execution variants (SF7-D4)
  for (const st of ['SEPA', 'POWER_PLAY']) assert.equal(r7.pub.strategies[st].ref.ledgerSha256, r4.pub.strategies[st].variants.REF.ledgerSha256);
  assert.deepEqual(Object.keys(r7.pub.strategies.SEPA.variants), ['ALT-SEPA-FLAT-BASE', 'ALT-SEPA-TT6-25', 'ALT-SEPA-RS-LINE']);
  assert.equal(r7.pub.strategies.SEPA.variants['ALT-SEPA-FLAT-BASE'].vsRef.addedVsRef, 1);
  const txt = JSON.stringify(r7.pub);
  for (const k of ['"pnl"', '"returnPct"', '"equity"', '"cagr"', '"sharpe"', '"metrics"']) assert.ok(!txt.includes(k), k);
  assert.deepEqual(diffTrades([{ id: 'A', entryDate: 'x', exitDate: 'y', shares: 1, exitReason: 'S' }], [{ id: 'A', entryDate: 'x', exitDate: 'z', shares: 1, exitReason: 'S' }, { id: 'B', entryDate: 'x' }]), { unchanged: 0, changed: 1, removedVsRef: 0, addedVsRef: 1 });
  assert.equal(sf7CodeSha256(), PINNED_SF7_CODE_SHA256);
});

test('SF7-MIN-POST-BREAKOUT: up-day counts, lower lows on volume, close below MA20, base depth and RS-line high (E7-2 findings), evidence only', async () => {
  const { postBreakoutEvidence, postBreakoutTally, benchIndex: bi } = await import('../source-faithful/research/minervini-sf7.mjs');
  const base = path([[0, 40], [300, 100]]);
  // healthy: 8 rising closes after the entry
  const good = mk([...base, ...Array.from({ length: 12 }, (_, k) => 101 + k)]);
  const g = postBreakoutEvidence(good, { setupDate: good[300].date, entryDate: good[301].date, exitDate: good.at(-1).date, entryFill: 101 });
  assert.equal(g.status, 'EVIDENCE'); assert.equal(g.healthy3of4, true); assert.equal(g.healthy6of8, true); assert.equal(g.lowerLowsOnVolume, false); assert.equal(g.closeBelowMa20InWindow, false);
  // weak: three lower lows on rising volume and a close below MA20 right after the entry
  const weak = [...base.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c, 1e6)), ...[100.5, 97, 94, 91, 90, 92].map((c, j) => bar(301 + j, c, c * 1.002, c * 0.99, c, 3e6))];
  const w = postBreakoutEvidence(weak, { setupDate: weak[300].date, entryDate: weak[301].date, exitDate: weak.at(-1).date, entryFill: 100.5 });
  assert.equal(w.healthy3of4, false); assert.equal(w.lowerLowsOnVolume, true); assert.equal(w.closeBelowMa20InWindow, true);
  // base depth and RS-line high on the VCP case; flat benchmark: the RS line follows the price
  const v = VCP.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c, VOL[k]));
  const e = postBreakoutEvidence(v, { setupDate: v[324].date, entryDate: v[325].date, exitDate: v.at(-1).date, entryFill: 96.192 }, { bench: bi(v.map((b) => ({ date: b.date, close: 100 }))) });
  assert.equal(e.baseDepthAbove50, false); assert.equal(typeof e.rsLineHighBeforePrice, 'boolean');
  // the third lower-low day closes in the upper half of its range on heavy volume: cleared (B03 PDF 47)
  assert.equal(g.longestUpRun, 10); assert.equal(w.lowerLowsCleared, true);
  const weak2 = [...base.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c, 1e6)), ...[100.5, 97, 94, 91, 90, 92].map((c, j) => bar(301 + j, c * 1.01, c * 1.01, c * 0.999, c, 3e6))];
  const w2 = postBreakoutEvidence(weak2, { setupDate: weak2[300].date, entryDate: weak2[301].date, exitDate: null, entryFill: 100.5 });
  assert.equal(w2.lowerLowsOnVolume, true); assert.equal(w2.lowerLowsCleared, false);
  const t = postBreakoutTally([g, w, { status: 'NOT_EVALUABLE' }]);
  assert.equal(t.evaluated, 2); assert.equal(t.notEvaluable, 1); assert.equal(t.healthy3of4.true, 1); assert.equal(t.lowerLowsOnVolume.true, 1);
});

test('ADV-SF7-MIN-POST-BREAKOUT-EXIT-BOUND: a closed trade never reads the exit session or later (E7-2 review HIGH)', async () => {
  const { postBreakoutEvidence, postBreakoutTally } = await import('../source-faithful/research/minervini-sf7.mjs');
  const base = path([[0, 40], [300, 100]]);
  // entry 301 up, exit (intraday stop) on 302; from 302 on the closes collapse below MA20 on heavy volume
  const b = [...base.map((c, k) => bar(k, c, c * 1.002, c * 0.998, c)), bar(301, 100.5, 101, 100.2, 100.8), ...[95, 90, 85, 80, 75, 70, 65, 60, 55].map((c, j) => bar(302 + j, c, c * 1.002, c * 0.99, c, 5e6))];
  const closed = postBreakoutEvidence(b, { setupDate: b[300].date, entryDate: b[301].date, exitDate: b[302].date, entryFill: 100.5 });
  assert.equal(closed.closeBelowMa20InWindow, false); assert.equal(closed.lowerLowsOnVolume, false);
  assert.equal(closed.healthy3of4, null); assert.equal(closed.healthy6of8, null); assert.deepEqual(closed.upDays4, { up: 1, sessions: 1 });
  // the same bars as an open trade see the collapse
  const open = postBreakoutEvidence(b, { setupDate: b[300].date, entryDate: b[301].date, exitDate: null, entryFill: 100.5 });
  assert.equal(open.closeBelowMa20InWindow, true); assert.equal(open.lowerLowsOnVolume, true); assert.equal(open.healthy3of4, false);
  const t = postBreakoutTally([closed, open]);
  assert.equal(t.healthy3of4.null, 1); assert.equal(t.healthy3of4.false, 1);
});

test('ADV-SF7-MIN-POST-BREAKOUT-BASE-RS-WEEKLY: base depth from the base start, RS line against the own high, weekly reading needs prior weeks (E7-2 review MEDIUM)', async () => {
  const { postBreakoutEvidence, benchIndex: bi } = await import('../source-faithful/research/minervini-sf7.mjs');
  // base: high 100 at 100, low 60, swing high 70, low 45 (base depth 55 %, deepest single contraction 40 %); setup at 330
  const c = path([[0, 50], [100, 100], [130, 60], [160, 70], [190, 45], [330, 80], [340, 82]]);
  const b = c.map((x, k) => bar(k, x, x * 1.002, x * 0.998, x));
  const r = postBreakoutEvidence(b, { setupDate: b[330].date, entryDate: b[331].date, exitDate: b.at(-1).date, entryFill: 80.3 });
  assert.ok(r.baseDepth > 0.55 && r.baseDepth < 0.56, String(r.baseDepth)); assert.equal(r.baseDepthAbove50, true); assert.equal(r.baseDepthAbove60, false);
  // no Stage 2 at this setup (price below its 200-day mean area after the decline): weekly reading not evaluable
  assert.equal(r.weeklyDeclineSignalBeforeExit, null);
  // RS line: a falling benchmark lifts the RS line to a new high while the price stays below its own 252-session high -> true;
  // a flat benchmark keeps RS = price, below its high -> false
  const falling = bi(b.map((x, k) => ({ date: x.date, close: 200 - 0.5 * k })));
  const flat = bi(b.map((x) => ({ date: x.date, close: 100 })));
  assert.equal(postBreakoutEvidence(b, { setupDate: b[330].date, entryDate: b[331].date, exitDate: b.at(-1).date, entryFill: 80.3 }, { bench: falling }).rsLineHighBeforePrice, true);
  assert.equal(postBreakoutEvidence(b, { setupDate: b[330].date, entryDate: b[331].date, exitDate: b.at(-1).date, entryFill: 80.3 }, { bench: flat }).rsLineHighBeforePrice, false);
  // Stage 2 uptrend with a long prior run: weekly signal when a post-entry week falls more than every prior week
  const up = path([[0, 30], [320, 100]]);
  const u = [...up.map((x, k) => bar(k, x, x * 1.002, x * 0.998, x)), ...[101, 102, 103, 104, 105, 104, 98, 90, 85, 84, 83, 82].map((x, j) => bar(321 + j, x, x * 1.002, x * 0.998, x))];
  const wk = postBreakoutEvidence(u, { setupDate: u[320].date, entryDate: u[321].date, exitDate: null, entryFill: 101 });
  assert.equal(wk.weeklyDeclineSignalBeforeExit, true);
  // the largest-decline diagnostic has no Stage 2 start without a passing Trend Template at the setup
  const { largestDeclineSignal: lds } = await import('../source-faithful/research/minervini-sf7.mjs');
  assert.equal(lds(b, { setupDate: b[330].date, entryDate: b[331].date, exitDate: b.at(-1).date }).status, 'NOT_IN_STAGE2_AT_SETUP');
  const calm = postBreakoutEvidence(up.map((x, k) => bar(k, x, x * 1.002, x * 0.998, x)), { setupDate: day(300), entryDate: day(301), exitDate: null, entryFill: 98 });
  assert.equal(calm.weeklyDeclineSignalBeforeExit, false);
});
