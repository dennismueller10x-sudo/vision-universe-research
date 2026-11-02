// C09-Neulauf: unabhaengiger Vorher/Nachher-Vergleich der oeffentlichen Bloecke (nur Aggregate, synthetische Eingaben).
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, comparePublic, countDelta, diffPaths, publicFromLog } from '../validation/compare-public-runs.mjs';

const variant = (trades, sha, extra = {}) => ({ changes: {}, trades, closed: trades - 1, openAtDataEnd: 1, exitReasons: { STOP_INITIAL: trades }, rejections: { REJECT_MAX_OPEN_POSITIONS: 2 }, reconciliation: true, ledgerSha256: `l${sha}`, tradesSha256: `t${sha}`, ...extra });
const kk = (refTrades, refSha, code = 'c1', runId = '1') => ({
  schema: 'supertrader-kk-intraday-public-1.0.0',
  receipt: { snapshotId: 'sts1-x', datasetSha256: 'd', minuteCacheSha256: 'm', researchCodeSha256: code, runId, commit: `g${runId}` },
  candidates: { ep: { total: 3 } }, intradayCoverage: { ep: 2 }, sampling: { ep: 1 },
  ep: { sets: { CLEAN: { variants: { REF: variant(refTrades, refSha), ALT: variant(5, 'a') } } }, sf7Execution: { variants: { SF7: variant(4, 's') } }, sf7Validation: { trades: { REF: refTrades } } },
  extE7_6: { id: 'X', ep: { variants: { REF: variant(7, 'e') }, sf7Execution: {} }, ps: { O: { variants: { REF: { closedTrades: 3 } } } } },
  ps: { sets: { CLEAN: { O: { variants: { REF: { closedTrades: 9, tradesSha256: 'p' } } } } } },
});

test('C09-CMP-KK: gleiche Eingaben, nur der Laufcode wandert; EP-Abweichung je Variante, PS hashgleich', () => {
  const before = kk(611, 'r'), after = kk(612, 'r2', 'c2', '2');
  after.ep.sets.CLEAN.variants.REF.rejections = { REJECT_MAX_OPEN_POSITIONS: 1 };
  const r = comparePublic(before, after);
  assert.equal(r.inputsEqual, true, 'runId, commit und researchCodeSha256 sind keine Eingaben');
  assert.deepEqual(r.code, { before: 'c1', after: 'c2' });
  assert.deepEqual(r.ep.CLEAN.REF.trades, [611, 612]);
  assert.equal(r.ep.CLEAN.REF.tradesSha256Equal, false);
  assert.deepEqual(r.ep.CLEAN.REF.rejectionsDelta, { REJECT_MAX_OPEN_POSITIONS: -1 });
  assert.equal(r.ep.CLEAN.ALT.blockEqual, true);
  assert.equal(r.ps.ps.equal, true);
  assert.equal(r.summary.psEqual, true);
  assert.deepEqual(r.summary, { epVariantBlocks: 4, epBlocksEqual: 3, epBlocksEqualWithoutAllocationCounter: 3, epTradesShaEqual: 3, psEqual: true });
  assert.deepEqual(r.intradayAllocationByMinute, { published: 'NOT_PUBLISHED', daysByVariant: {} });
  assert.deepEqual(r.ep.CLEAN.REF.intradayAllocationByMinute, [null, null]);
  assert.equal(r.sf7Validation.equal, false);
});

test('C09-CMP-KK-INPUT: eine geaenderte Eingabe (Cache-Hash, Stichprobe) macht den Vergleich ungueltig; PS-Abweichung ist ein Befund', () => {
  const before = kk(611, 'r'), after = kk(611, 'r');
  after.receipt.minuteCacheSha256 = 'm2'; after.sampling = { ep: 2 }; after.ps.sets.CLEAN.O.variants.REF.closedTrades = 8;
  const r = comparePublic(before, after);
  assert.equal(r.inputsEqual, false);
  assert.deepEqual(r.inputs.receipt, ['minuteCacheSha256']);
  assert.equal(r.inputs.sampling, false);
  assert.equal(r.ps.ps.equal, false);
  assert.equal(r.summary.psEqual, false);
});

test('C09-CMP-KK-COUNTER: Engpasstage je EP-Variante aus dem oeffentlichen Block; Vergleich gegen einen Lauf ohne Zaehler', () => {
  const before = kk(611, 'r'), after = kk(611, 'r', 'c2', '2');
  // nachher: jeder EP-Block traegt den Zaehler (0 = kein Engpasstag), sonst unveraendert
  after.ep.sets.CLEAN.variants.REF.intradayAllocationByMinute = 3; after.ep.sets.CLEAN.variants.ALT.intradayAllocationByMinute = 0;
  after.ep.sf7Execution.variants.SF7.intradayAllocationByMinute = 2; after.extE7_6.ep.variants.REF.intradayAllocationByMinute = 1;
  const r = comparePublic(before, after);
  assert.equal(r.inputsEqual, true);
  assert.deepEqual(r.intradayAllocationByMinute, { published: 'ALL_EP_BLOCKS', daysByVariant: { 'CLEAN/REF': 3, 'sf7:SF7': 2, 'extE7_6/REF': 1 } });
  assert.deepEqual(r.ep.CLEAN.REF.intradayAllocationByMinute, [null, 3]);
  // der neue Schluessel allein ist eine Abweichung des Blocks, ohne ihn sind die Bloecke gleich
  assert.equal(r.ep.CLEAN.ALT.blockEqual, false); assert.equal(r.ep.CLEAN.ALT.blockEqualWithoutAllocationCounter, true);
  assert.deepEqual(r.summary, { epVariantBlocks: 4, epBlocksEqual: 0, epBlocksEqualWithoutAllocationCounter: 4, epTradesShaEqual: 4, psEqual: true });
  // nur ein Teil der Bloecke mit Zaehler: als PARTIAL gemeldet
  delete after.extE7_6.ep.variants.REF.intradayAllocationByMinute;
  assert.equal(comparePublic(before, after).intradayAllocationByMinute.published, 'PARTIAL');
});

test('C09-CMP-SF5: bytegleiche Variantenbloecke trotz neuem Code; Engpasszaehler wuerde je Variante gemeldet', () => {
  const sf5 = (code, alloc) => ({ schema: 'supertrader-sf5-lifecycle-public-1.0.0', receipt: { datasetSha256: 'd', researchCodeSha256: code, runId: code }, lifecycle: { window: {}, strategies: { DARVAS: { strategyId: 'S', variants: { REF: { trades: 3, counts: { entries: 3, ...(alloc ? { intradayAllocationByMinute: alloc } : {}) } } }, sf7Execution: { variants: { X: { trades: 2 } } } } } } });
  const same = comparePublic(sf5('a'), sf5('b'));
  assert.equal(same.inputsEqual, true);
  assert.deepEqual(same.summary.variantBlocks, 2);
  assert.equal(same.summary.allEqual, true);
  assert.equal(same.summary.publicSha256[0], same.summary.publicSha256[1]);
  const diff = comparePublic(sf5('a'), sf5('b', 2));
  assert.equal(diff.summary.allEqual, false);
  assert.deepEqual(diff.strategies.DARVAS.differing, ['REF']);
  assert.deepEqual(diff.intradayAllocationByMinute, { 'DARVAS/REF': 2 });
  assert.throws(() => comparePublic(sf5('a'), kk(1, 'x')), /SCHEMA_MISMATCH/);
});

test('C09-CMP-LOG: der oeffentliche Block wird aus dem Actions-Log gelesen (Zeitstempel und Schritt-Praefix entfernt)', () => {
  const log = [
    'run\tUNKNOWN STEP\t2026-11-02T19:00:00.1Z [kk +1s] done; public kk-intraday-cache.public.json',
    'run\tUNKNOWN STEP\t2026-11-02T19:00:00.2Z {',
    'run\tUNKNOWN STEP\t2026-11-02T19:00:00.3Z  "schema": "s",',
    'run\tUNKNOWN STEP\t2026-11-02T19:00:00.4Z  "n": 1',
    'run\tUNKNOWN STEP\t2026-11-02T19:00:00.5Z }',
    'run\tUNKNOWN STEP\t2026-11-02T19:00:00.6Z ##[group]Run set -e',
  ].join('\n');
  assert.deepEqual(publicFromLog(log), { schema: 's', n: 1 });
  assert.throws(() => publicFromLog('nichts'), /PUBLIC_BLOCK_NOT_FOUND/);
});

test('C09-CMP-HELPERS: kanonisch, Pfaddifferenz, Zaehlerdelta', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 0 }] }), '{"a":[2,{"c":0,"d":1}],"b":1}');
  assert.deepEqual(diffPaths({ a: { x: 1, y: 2 } }, { a: { x: 1, y: 3, z: 0 } }), ['a.y', 'a.z']);
  assert.deepEqual(countDelta({ A: 2, B: 1 }, { A: 2, C: 4 }), { B: -1, C: 4 });
});
