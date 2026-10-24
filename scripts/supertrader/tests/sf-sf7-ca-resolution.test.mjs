// Supertrader 7.0 – V4-D1-Aufloesung (integrity/ca-resolution.mjs, integrity/ca-overlay.mjs, research/run-sf7-ca-resolution.mjs).
// Synthetisch; der echte Lauf braucht Snapshot und sec-pit-r13 (Workflow-Modus sf7-ca-resolution).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../validation/lib.mjs';
import { datasetFromPit } from '../source-faithful/runner/snapshot-input.mjs';
import { runResearchLifecycle, prepareAll } from '../source-faithful/research/lifecycle-engine.mjs';
import { SF5_LIFECYCLES } from '../source-faithful/research/sf5-lifecycles.mjs';
import { DQ_POLICIES, flagDiscontinuities, quarantineSecurity, sessionRatio } from '../source-faithful/integrity/discontinuity.mjs';
import { classifyFlag, filingEvidence, bracketShares, snapStandard, snapFactor, CLASSES, TOLERANCES, FACTOR_GRID, rulesetSha256 } from '../source-faithful/integrity/ca-resolution.mjs';
import { buildOverlayManifest, verifyOverlayManifest, applyOverlayToSegments, correctedDataset, quarantineAtSessions, quarantineUnresolved } from '../source-faithful/integrity/ca-overlay.mjs';
import { caResolutionPart } from '../source-faithful/research/run-sf7-ca-resolution.mjs';
import { integrityPart, INTEGRITY_KEYS } from '../source-faithful/research/run-sf6-integrity.mjs';

const day = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

/** Random-walk raw series; events { at, price, volume, declared } scale raw prices / volumes from `at` on. */
function series(len, seed, events = [], c0 = 20) {
  const r = rng(seed); let c = c0; const raw = [];
  for (let k = 0; k < len; k++) {
    const o = c * (1 + 0.01 * (r() - 0.5)); c = o * (1 + 0.0008 + 0.02 * (r() - 0.5));
    raw.push({ date: day(k), open: o, high: Math.max(o, c) * (1 + 0.01 * r()), low: Math.min(o, c) * (1 - 0.01 * r()), close: c, volume: Math.round(1e6 * (0.7 + 0.6 * r())), adjClose: null, dividend: 0, splitFactor: 1 });
  }
  for (const e of events) {
    for (let k = e.at; k < len; k++) { for (const f of ['open', 'high', 'low', 'close']) raw[k][f] *= e.price; raw[k].volume = Math.round(raw[k].volume * (e.volume ?? 1)); }
    if (e.declared) raw[e.at].splitFactor = 1 / e.price;
  }
  return raw;
}
const seg = (id, raw, extra = {}) => ({ id, raw, endCause: 'ACTIVE', delisted: false, survivor: true, cls: 'EQUITY_COMMON', ...extra });
const dsOf = (segs, cal = segs[0].raw) => { const spyAdj = L.adjustSeries(cal); let v = 1; const spyTR = spyAdj.date.map((d, i) => { if (i > 0) v *= 1 + spyAdj.tr[i]; return { date: d, value: v }; }); return datasetFromPit({ segs, calendar: cal.map((b) => b.date), spyAdj, spyTR }); };
const secOf = (raw) => dsOf([seg('X', raw)]).securities[0];
const dei = (pairs) => pairs.map(([k, v]) => [day(k), v, day(k + 20), 'dei']);
const SEC = (pairs, how = 'KNOWN', extra = {}) => ({ cik: '0000000001', how, taxonomy: 'us-gaap', shares: dei(pairs), ...extra });
const NO_CA_FILINGS = { form: ['10-Q', '8-K', '10-K', '10-Q'], filingDate: [day(0), day(395), day(500), day(600)], items: ['', '2.02,9.01', '', ''] };
/** Classifies with a clean domestic filing index unless { noFilings: true } (filing check not yet run). */
const classify = (raw, i, sec, more = {}) => { const s = secOf(raw), { noFilings, ...rest } = more; return classifyFlag({ raw, bars: s.bars, i, sec, otherFlagDates: flagDiscontinuities(s.bars, 3).map((j) => s.bars[j].date), filings: noFilings ? undefined : filingEvidence(NO_CA_FILINGS, s.bars[i].date), ...rest }); };

test('SF7-CA-SPLIT: echter nicht erklaerter 1:10-Reverse-Split wird bestaetigt (Faktor und Sitzung) und korrigiert wie ein erklaerter', () => {
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]);
  const s = secOf(raw);
  assert.deepEqual(flagDiscontinuities(s.bars, 5), [400]);
  const c = classify(raw, 400, SEC([[330, 50e6], [460, 5.04e6]]));
  assert.equal(c.cls, CLASSES.SPLIT, c.reason);
  assert.equal(c.factor, 10); assert.equal(c.splitFactor, 0.1); assert.equal(c.label, '1:10');
  // correction == the provider having declared the split (same production adjustment path, ADR-002)
  const truth = series(700, 3, [{ at: 400, price: 10, volume: 0.1, declared: true }]);
  const m = buildOverlayManifest([{ ...c, segmentId: 'X', date: day(400) }]);
  const fixed = correctedDataset(dsOf([seg('X', raw)]), [seg('X', raw)], m).ds.securities[0], want = secOf(truth);
  assert.equal(fixed.bars.length, want.bars.length);
  for (let k = 0; k < want.bars.length; k++) for (const f of ['open', 'high', 'low', 'close', 'volume', 'rawClose', 'rawVolume', 'dividend']) assert.ok(Math.abs(fixed.bars[k][f] - want.bars[k][f]) <= 1e-9 * Math.max(1, Math.abs(want.bars[k][f])), `${k} ${f}`);
  assert.deepEqual(flagDiscontinuities(fixed.bars, 3), [], 'nach der Korrektur kein Sprung mehr');
  assert.equal(raw[400].splitFactor, 1, 'die Snapshot-Rohdaten bleiben unveraendert');
});

test('SF7-CA-GENUINE: echter -85-%-Absturz mit unveraenderter Aktienzahl wird NICHT korrigiert; ohne Meldungspruefung bleibt er UNRESOLVED', () => {
  const raw = series(700, 5, [{ at: 400, price: 0.15, volume: 1.2 }]);
  assert.deepEqual(flagDiscontinuities(secOf(raw).bars, 5), [400]);
  const sec = SEC([[330, 20e6], [460, 20.6e6]]);
  const pending = classify(raw, 400, sec, { noFilings: true });
  assert.equal(pending.cls, CLASSES.UNRESOLVED); assert.equal(pending.stage, 'NEEDS_FILING_CHECK');
  const g = classify(raw, 400, sec, { filings: filingEvidence(NO_CA_FILINGS, day(400)) });
  assert.equal(g.cls, CLASSES.GENUINE, g.reason);
  assert.equal(buildOverlayManifest([{ ...g, segmentId: 'X', date: day(400) }]).entries.length, 0, 'kein Overlay-Eintrag');
  const withCa = { ...NO_CA_FILINGS, items: ['', '5.03,9.01', '', ''] };
  assert.equal(classify(raw, 400, sec, { filings: filingEvidence(withCa, day(400)) }).reason, 'CA_FILING_IN_WINDOW');
  assert.equal(classify(raw, 400, { ...sec, how: 'NAME_MATCH' }, { filings: filingEvidence(NO_CA_FILINGS, day(400)) }).reason, 'GENUINE_REQUIRES_KNOWN_CIK');
  const notCovered = { form: ['8-K'], filingDate: [day(398)], items: ['8.01'] };
  assert.equal(classify(raw, 400, sec, { filings: filingEvidence(notCovered, day(400)) }).reason, 'SEC_FILINGS_NOT_COVERED');
});

test('SF7-CA-DILUTION: Kapitalerhoehung mit Absturz wird nicht als Split (oder echte Bewegung) eingestuft', () => {
  // 5x more shares and price / 5: mimics a 5:1 forward split -> needs a second source, stays UNRESOLVED
  const raw = series(700, 7, [{ at: 400, price: 0.2, volume: 8 }]);
  const c = classify(raw, 400, SEC([[330, 10e6], [460, 50e6]]));
  assert.equal(c.cls, CLASSES.UNRESOLVED); assert.equal(c.reason, 'FORWARD_SPLIT_NEEDS_SECOND_SOURCE');
  // 1.8x more shares and -80 %: neither a grid factor nor unchanged
  const raw2 = series(700, 8, [{ at: 400, price: 0.2, volume: 3 }]);
  assert.equal(classify(raw2, 400, SEC([[330, 10e6], [460, 18e6]])).reason, 'SHARE_RATIO_NO_MATCH');
  // 1.6x more shares snaps to the 3:2 grid value, the -80 % price does not agree
  assert.equal(classify(raw2, 400, SEC([[330, 10e6], [460, 16e6]])).reason, 'PRICE_RATIO_OFF_FACTOR');
  // a reverse merger after a consolidation: shares / 10 then new issuance -> ratio off any factor
  const raw3 = series(700, 9, [{ at: 400, price: 10, volume: 0.1 }]);
  assert.equal(classify(raw3, 400, SEC([[330, 50e6], [460, 3.7e6]])).reason, 'SHARE_RATIO_NO_MATCH');
  // price says 1:10, shares say 1:5
  assert.equal(classify(raw3, 400, SEC([[330, 50e6], [460, 10e6]])).reason, 'PRICE_RATIO_OFF_FACTOR');
  // volume did not fall: not a consolidation of the traded share count
  const raw4 = series(700, 10, [{ at: 400, price: 10, volume: 1 }]);
  assert.equal(classify(raw4, 400, SEC([[330, 50e6], [460, 5e6]])).reason, 'VOLUME_INCONSISTENT_WITH_FACTOR');
  // forward split WITH the provider's adjClose knowing the factor is confirmed
  const raw5 = series(700, 11, [{ at: 400, price: 0.2, volume: 5 }]);
  raw5.forEach((b, k) => { b.adjClose = k < 400 ? b.close / 5 : b.close; });
  const f = classify(raw5, 400, SEC([[330, 10e6], [460, 50e6]]));
  assert.equal(f.cls, CLASSES.SPLIT, f.reason); assert.equal(f.label, '5:1'); assert.equal(f.splitFactor, 5);
});

test('SF7-CA-MISSING: fehlende oder unklare SEC-Daten, Identitaetszweifel und Ausreisser bleiben UNRESOLVED', () => {
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]);
  assert.equal(classify(raw, 400, null).reason, 'SEC_LISTING_NOT_MAPPED');
  assert.equal(classify(raw, 400, SEC([[330, 50e6], [460, 5e6]], 'KNOWN', { shares: [[day(330), 50e6, day(340), 'wadso'], [day(460), 5e6, day(470), 'wadso']] })).reason, 'SEC_SHARES_NOT_DEI');
  assert.equal(classify(raw, 400, SEC([[200, 50e6], [460, 5e6]])).reason, 'SEC_BRACKET_TOO_WIDE');
  assert.equal(classify(raw, 400, SEC([[330, 50e6]])).reason, 'SEC_SHARES_NOT_BRACKETING');
  assert.equal(classify(raw, 400, SEC([[330, 50e6], [460, 5e6]]), { identity: { cikSharedAtSession: true } }).reason, 'CIK_SHARED_BY_LIVE_LISTINGS');
  assert.equal(classify(raw, 400, SEC([[330, 50e6], [460, 5e6]]), { identity: { instrumentClass: 'ADR' } }).reason, 'ADR_OR_FOREIGN_FILER');
  assert.equal(classify(raw, 400, SEC([[330, 50e6], [460, 5e6]], 'KNOWN', { taxonomy: 'ifrs-full' })).reason, 'ADR_OR_FOREIGN_FILER');
  const spike = series(700, 4); for (const f of ['open', 'high', 'low', 'close']) spike[400][f] *= 10;
  assert.equal(classify(spike, 400, SEC([[330, 50e6], [460, 50e6]])).reason, 'SPIKE_REVERSAL');
  const declaredNear = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }, { at: 450, price: 0.5, declared: true }]);
  assert.equal(classify(declaredNear, 400, SEC([[330, 50e6], [460, 10e6]])).reason, 'DECLARED_SPLIT_NEARBY');
  const two = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }, { at: 430, price: 4, volume: 0.25 }]);
  assert.equal(classify(two, 400, SEC([[330, 50e6], [460, 1.25e6]])).reason, 'MULTIPLE_JUMPS_IN_BRACKET');
  assert.equal(bracketShares(dei([[400, 5e6]]), day(400)).reason, 'SEC_SHARES_NOT_BRACKETING', 'ein Stichtag am Sprungtag ist mehrdeutig');
  assert.equal(snapStandard(8.5, 1.1).length, 2, '8 und 9 liegen beide in der Toleranz um 8,5 (mehrdeutig)');
  assert.equal(classify(raw, 400, SEC([[330, 50e6], [460, 50e6 / 8.5]])).reason, 'SHARE_RATIO_NO_MATCH', '8,5 liegt zwischen den Rasterfenstern von 8 und 9');
});

test('SF7-CA-TOLERANCES: vorregistrierte Toleranzen sind eng und eingefroren', () => {
  assert.ok(Object.isFrozen(TOLERANCES));
  assert.equal(TOLERANCES.shareRatioTol, 1.10); assert.equal(TOLERANCES.priceRatioTol, 1.35); assert.equal(TOLERANCES.volumeRatioTol, 4);
  assert.equal(TOLERANCES.maxBracketDays, 135); assert.equal(TOLERANCES.standardFactorNear, 1.02);
});

test('SF7-CA-PIT: die Korrektur aendert vor der Sitzung nur eine Konstante (Rueckwaertsbereinigung), ab der Sitzung nichts; Rohfelder bleiben', () => {
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]), base = secOf(raw);
  const c = classify(raw, 400, SEC([[330, 50e6], [460, 5e6]]));
  const fixed = correctedDataset(dsOf([seg('X', raw)]), [seg('X', raw)], buildOverlayManifest([{ ...c, segmentId: 'X', date: day(400) }])).ds.securities[0];
  for (let k = 0; k < 700; k++) {
    const a = base.bars[k], b = fixed.bars[k];
    assert.equal(b.rawClose, a.rawClose); assert.equal(b.rawVolume, a.rawVolume);
    if (k >= 400) for (const f of ['open', 'high', 'low', 'close', 'volume']) assert.equal(b[f], a[f], `${k} ${f}`);
    else { for (const f of ['open', 'high', 'low', 'close']) assert.ok(Math.abs(b[f] / a[f] * 0.1 - 0.1 * 10 * 0.1) < 1e-12 || Math.abs(b[f] - a[f] * 10) < 1e-9 * a[f] * 10, `${k} ${f}`); assert.ok(Math.abs(b.volume - a.volume / 10) < 1e-6); }
  }
  // every relative before the session (what a causal decision sees) is unchanged
  for (let k = 1; k < 400; k++) assert.ok(Math.abs(sessionRatio(fixed.bars, k) - sessionRatio(base.bars, k)) < 1e-12);
  for (const m of [100, 399, 400]) assert.deepEqual(flagDiscontinuities(fixed.bars.slice(0, m), 3), flagDiscontinuities(base.bars.slice(0, m), 3));
});

test('SF7-CA-INVARIANT: Einstieg, Stop, Positionsgroesse und Abrechnung sind unter der Korrektur unveraendert (Trade nach der Sitzung exakt, davor bis auf Stueckrundung)', () => {
  const lc = SF5_LIFECYCLES.find((l) => l.key === 'BUYABLE_GAP_UP'), cfg = { ...lc.variants.find((v) => v.id === 'REF').config, contextProxy: 'NONE' };
  const run = (d) => runResearchLifecycle(d, { adapter: lc.adapter, config: cfg, prepared: prepareAll(d, lc.adapter, cfg), from: day(0), to: day(599) });
  const mk = (declared) => {
    const raw = []; for (let k = 0; k < 600; k++) { const c = k < 260 ? 20 + (k % 7) * 0.05 : 26 + (k - 260) * 0.03; raw.push({ date: day(k), open: k === 260 ? 24 : c, high: c * 1.01, low: k === 260 ? 23.5 : c * 0.99, close: c, volume: k === 260 ? 5e6 : 1e6, adjClose: null, dividend: 0, splitFactor: 1 }); }
    // the BGU pattern again after the session (k = 460), then the undeclared 1:10 at 400
    for (let k = 455; k < 600; k++) { const c = 40 + (k - 455) * 0.02 + (k >= 460 ? 6 : 0); Object.assign(raw[k], { open: k === 460 ? c - 1.5 : c, high: c * 1.01, low: k === 460 ? c - 2 : c * 0.99, close: c, volume: k === 460 ? 5e6 : 1e6 }); }
    for (let k = 400; k < 600; k++) { for (const f of ['open', 'high', 'low', 'close']) raw[k][f] *= 10; raw[k].volume /= 10; }
    if (declared) raw[400].splitFactor = 0.1;
    return raw;
  };
  const raw = mk(false), truth = mk(true);
  const c = classify(raw, 400, SEC([[330, 50e6], [460, 5e6]]));
  assert.equal(c.cls, CLASSES.SPLIT, c.reason);
  const m = buildOverlayManifest([{ ...c, segmentId: 'G', date: day(400) }]);
  const spy = series(600, 99);
  const fixed = correctedDataset(dsOf([seg('G', raw)], spy), [seg('G', raw)], m).ds, want = dsOf([seg('G', truth)], spy);
  const a = run(fixed), b = run(want), base = run(dsOf([seg('G', raw)], spy));
  assert.ok(b.trades.length >= 1, 'die Synthese erzeugt Trades');
  assert.deepEqual(a.trades.map((t) => [t.entryDate, t.exitDate, t.exitReason, t.shares, t.status]), b.trades.map((t) => [t.entryDate, t.exitDate, t.exitReason, t.shares, t.status]), 'korrigiert == wie vom Anbieter erklaert');
  const money = (t) => [t.entryFill, t.initialStop, t.shares, t.costTotal, t.realizedPnl ?? null, t.unrealizedPnl ?? null, t.pnl ?? null];
  for (let k = 0; k < a.trades.length; k++) assert.deepEqual(money(a.trades[k]), money(b.trades[k]), 'Einstieg, Stop, Stueckzahl, Kosten und Ergebnis identisch');
  assert.ok(a.reconciliation.pass && b.reconciliation.pass && base.reconciliation.pass);
  // the trade entered before the session and held across it: same dollars at stake, shares scale by the factor
  // (integer rounding only); BASE books the fake 10x jump, the correction removes it
  const x = base.trades.find((t) => t.entryDate < day(400)), y = a.trades.find((t) => t.entryDate < day(400));
  assert.ok(x && y, 'ein Trade vor der Sitzung');
  assert.equal(x.entryDate, y.entryDate);
  assert.ok(Math.abs(x.shares - 10 * y.shares) <= 10, 'Stueckzahl skaliert mit dem Faktor (bis auf eine Stueckrundung)');
  assert.ok(Math.abs(x.costTotal - y.costTotal) <= y.entryFill * 1.01, 'gleicher Einsatz in Dollar (bis auf eine Stueckrundung)');
  assert.ok(Math.abs(x.initialStop / y.initialStop - 0.1) < 1e-9, 'Stop auf derselben Kursstufe');
  const gain = (t) => (t.realizedPnl ?? 0) + (t.unrealizedPnl ?? 0);
  assert.ok(gain(x) > 5 * Math.abs(gain(y)), 'BASE verbucht den Scheinsprung, die Korrektur nicht');
});

test('SF7-CA-QUARANTINE: Schnitt an Sitzungen entspricht discontinuity.mjs; nur UNRESOLVED wird geschnitten', () => {
  const raw = series(700, 12, [{ at: 200, price: 8, volume: 0.125 }, { at: 500, price: 0.1, volume: 3 }]);
  const s = secOf(raw), K5 = DQ_POLICIES['DQ-K5-BOOK'];
  const a = quarantineSecurity(s, K5).pieces, b = quarantineAtSessions(s, flagDiscontinuities(s.bars, 5), K5).pieces;
  assert.equal(a.length, b.length);
  for (let k = 0; k < a.length; k++) { assert.equal(a[k].id, b[k].id); assert.deepEqual(a[k].bars, b[k].bars); assert.deepEqual(a[k].terminal, b[k].terminal); }
  const ds = dsOf([seg('X', raw)]);
  const q = quarantineUnresolved(ds, new Map([['X', [day(500)]]]), K5);
  assert.equal(q.cuts, 1); assert.equal(q.ds.securities.length, 2);
  assert.equal(q.ds.securities[0].bars.at(-1).date, day(500));
  assert.throws(() => quarantineUnresolved(ds, new Map([['X', [day(300)]]]), K5), /NOT_FLAGGED/);
});

test('SF7-CA-MANIFEST: Overlay-Manifest ist erzeugt, sortiert, gehasht; Handaenderung und Doppel-Erklaerung scheitern', () => {
  const rows = [{ cls: CLASSES.SPLIT, segmentId: 'B', date: day(9), splitFactor: 0.1, label: '1:10', evidence: { q: 10 } }, { cls: CLASSES.SPLIT, segmentId: 'A', date: day(5), splitFactor: 0.05, label: '1:20', evidence: {} }, { cls: CLASSES.GENUINE, segmentId: 'C', date: day(3), evidence: {} }, { cls: CLASSES.UNRESOLVED, segmentId: 'D', date: day(3), evidence: {} }];
  const m = buildOverlayManifest(rows, { snapshotId: 'sts1-x' });
  assert.deepEqual(m.entries.map((e) => e.segmentId), ['A', 'B']);
  assert.ok(verifyOverlayManifest(m));
  assert.equal(buildOverlayManifest([...rows].reverse(), { snapshotId: 'sts1-x' }).manifestSha256, m.manifestSha256, 'reihenfolgeunabhaengig');
  const tampered = { ...m, entries: m.entries.map((e) => ({ ...e, splitFactor: 0.2 })) };
  assert.equal(verifyOverlayManifest(tampered), false);
  assert.throws(() => applyOverlayToSegments([], tampered), /HASH_MISMATCH/);
  const declared = series(40, 1, [{ at: 10, price: 10, declared: true }]);
  assert.throws(() => applyOverlayToSegments([seg('A', declared)], buildOverlayManifest([{ ...rows[1], date: day(10) }])), /ALREADY_DECLARED/);
});

const METRIC_KEYS = /"(cagr|sharpe|sortino|winRate|profitFactor|expectancy|pnl|equity|returnPct|maxDrawdown|ratio)"/;

test('SF7-CA-RUN: BASE gleich 6.0-Pfad; Split korrigiert, echte Bewegung ungeschnitten, UNRESOLVED in Quarantaene; oeffentlich nur Zaehlungen', async () => {
  const ids = (s) => `tiingo:NYSE:S${String(s).padStart(3, '0')}:2010-01-01`;
  const segs = Array.from({ length: 16 }, (_, s) => seg(ids(s), series(700, s + 21, s === 2 ? [{ at: 400, price: 10, volume: 0.1 }] : s === 5 ? [{ at: 300, price: 0.15, volume: 1.2 }] : s === 9 ? [{ at: 500, price: 12, volume: 0.08 }] : [])));
  const ds = dsOf(segs);
  const shares = new Map([[ids(2), SEC([[330, 50e6], [460, 5e6]])], [ids(5), { ...SEC([[230, 20e6], [360, 20.2e6]]), cik: '0000000005' }]]);
  let calls = 0;
  const W = { from: day(0), to: day(699), dataEnd: day(699) };
  const r = await caResolutionPart(ds, segs, { sharesByListing: shares, fetchFilings: async () => { calls++; return NO_CA_FILINGS; }, secFetchMax: 10, ...W });
  const ref = integrityPart(ds, { ...W, policies: [] });
  for (const k of INTEGRITY_KEYS) { assert.equal(r.pub.lifecycles[k].BASE.ledgerSha256, ref.pub.lifecycles[k].BASE.ledgerSha256, k); assert.equal(r.pub.lifecycles[k].BASE.tradesSha256, ref.pub.lifecycles[k].BASE.tradesSha256, k); }
  const byDate = Object.fromEntries(r.sealed.classified.map((c) => [`${c.segmentId}|${c.date}`, c]));
  assert.equal(byDate[`${ids(2)}|${day(400)}`].cls, CLASSES.SPLIT);
  assert.equal(byDate[`${ids(9)}|${day(500)}`].cls, CLASSES.UNRESOLVED);
  const g = byDate[`${ids(5)}|${day(300)}`];
  assert.ok(g.exposedRefs.length > 0, 'die Synthese exponiert Referenztrades');
  assert.equal(g.cls, CLASSES.GENUINE, g.reason);
  assert.equal(calls, 2, 'je eine Indexabfrage: der Split-Kandidat und der exponierte Kandidat einer echten Bewegung');
  assert.equal(r.pub.secEvidence.filingLookups, 2);
  assert.deepEqual(Object.keys(r.sealed.filingIndex).sort(), ['0000000001', '0000000005'], 'gelesene Indexeintraege versiegelt (MEDIUM-3)');
  for (const k of INTEGRITY_KEYS) assert.equal(r.pub.lifecycles[k].exposure['DQ-K5'].allConfirmed, (r.pub.lifecycles[k].exposure['DQ-K5'].byClass.UNRESOLVED ?? 0) === 0);
  assert.equal(r.manifest.entries.length, 1); assert.equal(r.pub.overlay.patchedSegments, 1); assert.equal(r.pub.overlay.unchangedSecurities, 15);
  assert.equal(r.pub.datasets['CA-Q-K5'].quarantine.cuts, 1, 'nur die ungeklaerte Sitzung wird geschnitten');
  for (const k of INTEGRITY_KEYS) for (const t of ['CA', 'CA-Q-K5', 'CA-Q-K3']) {
    const c = r.pub.lifecycles[k][t].comparisonWithBase;
    assert.ok(r.pub.lifecycles[k][t].reconciliation, `${k} ${t}`);
    assert.equal(c.unchanged + c.changed + c.removed, c.baseTrades, `${k} ${t}`);
  }
  assert.equal(r.pub.census['DQ-K5'].flags, 3);
  assert.deepEqual(r.pub.census['DQ-K5'].splitFactors, { '1:10': 1 });
  assert.deepEqual(r.pub.v100SplitsNow, { '1:10 -> CONFIRMED_UNDECLARED_SPLIT 1:10 (SHARES_PRICE_VOLUME_SAME_FACTOR)': 1 }, 'Vorher/Nachher der 1.0.0-Bestaetigungen');
  assert.doesNotMatch(JSON.stringify(r.pub), METRIC_KEYS);
  assert.doesNotMatch(JSON.stringify(r.pub), /tiingo:/, 'keine Wertpapier-IDs oeffentlich');
});

test('SF7-CA-CLEAN: ohne Markierung ist jede Lesart trade-genau BASE und das Overlay leer', async () => {
  const segs = Array.from({ length: 10 }, (_, s) => seg(`tiingo:NYSE:C${s}:2010-01-01`, series(600, s + 40)));
  const r = await caResolutionPart(dsOf(segs), segs, { from: day(0), to: day(599), dataEnd: day(599) });
  assert.equal(r.manifest.entries.length, 0); assert.equal(r.pub.census['DQ-K3'].flags, 0);
  for (const k of INTEGRITY_KEYS) for (const t of ['CA', 'CA-Q-K5', 'CA-Q-K3']) assert.equal(r.pub.lifecycles[k][t].ledgerSha256, r.pub.lifecycles[k].BASE.ledgerSha256);
  assert.ok(Object.values(r.pub.lifecycles).some((x) => x.BASE.trades > 0), 'die Synthese erzeugt Trades');
});

test('SF7-CA-REGRESSION: fuer jede Referenz liegen die 6.0-Hashes vor; der Abgleich erkennt Gleichheit und Abweichung', async () => {
  const { compareWithSf6 } = await import('../source-faithful/research/run-sf7-ca-resolution.mjs');
  const { SF6_RUN_FACTS } = await import('../source-faithful/completion/sf6-run-facts.mjs');
  const same = Object.fromEntries(INTEGRITY_KEYS.map((k) => [k, { BASE: { ledgerSha256: SF6_RUN_FACTS.integrity.baseMatchesAuthoritative[k].ledgerSha256Value, tradesSha256: SF6_RUN_FACTS.integrity.lifecycles[k].BASE.tradesSha256, trades: SF6_RUN_FACTS.integrity.lifecycles[k].BASE.trades } }]));
  const c = compareWithSf6(same);
  assert.equal(c.allEqual, true);
  for (const k of INTEGRITY_KEYS) assert.deepEqual(c[k], { ledgerSha256: 'EQUAL', tradesSha256: 'EQUAL', trades: 'EQUAL' }, k);
  const off = structuredClone(same); off.DARVAS.BASE.ledgerSha256 = '0'.repeat(64);
  assert.equal(compareWithSf6(off).allEqual, false);
  assert.equal(compareWithSf6(off).DARVAS.ledgerSha256, 'DIFFERENT');
});

// ---- 1.1.0: declared split on the wrong session, balance-sheet share counts (registered before the 1.1.0 run)
const misdated = (seed, { jumpAt = 400, declAt = 402, price = 10, decl = 0.1, volume = 0.1 } = {}) => {
  const raw = series(700, seed, [{ at: jumpAt, price, volume }]);
  raw[declAt].splitFactor = decl;
  return raw;
};

test('SF7-CA-MISDATED: erklaerter Faktor am falschen Tag wird fuer beide Markierungen gleich bestaetigt und verschoben, nie erfunden', () => {
  const raw = misdated(31), s = secOf(raw);
  assert.deepEqual(flagDiscontinuities(s.bars, 5), [400, 402], 'Sprungpaar: der Sprung und der Faktor ohne Sprung');
  const a = classify(raw, 400, null), b = classify(raw, 402, null);
  for (const c of [a, b]) { assert.equal(c.cls, CLASSES.MISDATED, c.reason); assert.equal(c.splitFactor, 0.1); assert.deepEqual(c.overlay, { date: day(400), splitFactor: 0.1, moveFromDate: day(402) }); }
  assert.equal(a.evidence.secCorroborates, false, 'ohne SEC-Daten zulaessig, aber als nicht durch SEC bestaetigt vermerkt');
  const m = buildOverlayManifest([{ ...a, segmentId: 'X', date: day(400) }, { ...b, segmentId: 'X', date: day(402) }]);
  assert.equal(m.entries.length, 1, 'ein Eintrag je Paar'); assert.equal(m.entries[0].kind, 'MOVE_DECLARED');
  const fixed = correctedDataset(dsOf([seg('X', raw)]), [seg('X', raw)], m).ds.securities[0];
  const truth = series(700, 31, [{ at: 400, price: 10, volume: 0.1, declared: true }]), want = secOf(truth);
  for (let k = 0; k < 700; k++) for (const f of ['open', 'close', 'volume', 'rawClose']) assert.ok(Math.abs(fixed.bars[k][f] - want.bars[k][f]) <= 1e-9 * Math.max(1, Math.abs(want.bars[k][f])), `${k} ${f}`);
  assert.deepEqual(flagDiscontinuities(fixed.bars, 3), []);
  assert.equal(raw[402].splitFactor, 0.1, 'Snapshot-Rohdaten unveraendert');
  // SEC, where usable, must show the same factor
  assert.equal(classify(raw, 400, SEC([[330, 50e6], [460, 5e6]])).evidence.secCorroborates, true);
  assert.equal(classify(raw, 400, SEC([[330, 50e6], [460, 50e6]])).reason, 'SEC_CONTRADICTS_DECLARED_FACTOR');
  assert.equal(classify(raw, 402, SEC([[330, 50e6], [460, 50e6]])).reason, 'SEC_CONTRADICTS_DECLARED_FACTOR', 'beide Markierungen gleich');
  // the moved factor is the provider's: a manifest claiming another factor fails closed
  const bad = buildOverlayManifest([{ ...a, splitFactor: 0.05, overlay: { ...a.overlay, splitFactor: 0.05 }, segmentId: 'X', date: day(400) }]);
  assert.throws(() => applyOverlayToSegments([seg('X', raw)], bad), /DECLARED_FACTOR_MISMATCH/);
});

test('SF7-CA-MISDATED-ADVERSARIAL: echter Absturz neben korrektem Split, zwei Splits, falsches Verhaeltnis, zu weit entfernt', () => {
  // a correct 5:1 forward split at 400 and a genuine -80 % crash at 402 (same factor): the declared session moves -> UNRESOLVED
  const crash = series(700, 32, [{ at: 400, price: 0.2, volume: 5, declared: true }, { at: 402, price: 0.2, volume: 3 }]);
  assert.deepEqual(flagDiscontinuities(secOf(crash).bars, 3), [402]);
  assert.equal(classify(crash, 402, null).reason, 'DECLARED_SESSION_MOVES');
  // a correct 1:10 reverse split and a fake +900 % move two sessions later
  const up = series(700, 33, [{ at: 400, price: 10, volume: 0.1, declared: true }, { at: 402, price: 10, volume: 0.1 }]);
  assert.equal(classify(up, 402, null).reason, 'DECLARED_SESSION_MOVES');
  // two declared splits within the bracket window
  const two = misdated(34); two[450].splitFactor = 0.5;
  assert.equal(classify(two, 400, null).reason, 'MULTIPLE_DECLARED_SPLITS_NEARBY');
  // ratio mismatch: the price moved 5x, the provider declared 1:10
  const mis = misdated(35, { price: 5, volume: 0.2 });
  assert.equal(classify(mis, 400, null).reason, 'DECLARED_SPLIT_NEARBY');
  assert.equal(classify(mis, 402, null).reason, 'DECLARED_SPLIT_NEARBY');
  // farther than misdatedMaxSessions
  assert.equal(TOLERANCES.misdatedMaxSessions, 5);
  assert.equal(classify(misdated(36, { declAt: 406 }), 400, null).reason, 'DECLARED_SPLIT_NEARBY');
  // the volume did not fall with the consolidation
  assert.equal(classify(misdated(37, { volume: 1 }), 400, null).reason, 'VOLUME_INCONSISTENT_WITH_FACTOR');
  // another jump next to the pair
  const extra = misdated(38); for (let k = 404; k < 700; k++) for (const f of ['open', 'high', 'low', 'close']) extra[k][f] *= 4;
  assert.equal(classify(extra, 400, null).reason, 'MULTIPLE_JUMPS_NEAR_PAIR');
});

test('SF7-SEC-PIT-R14: Aktienzahl je Stichtag dei vor Bilanz vor gewichteter Zahl, jede Zeile mit Quelle; r13-Reihe unveraendert', async () => {
  const { sharesSeries, sharesSeriesR14, extractFactsR12, PIT_KEY_R13, PIT_KEY_R14 } = await import('../validation/sec-pit.mjs');
  assert.notEqual(PIT_KEY_R14, PIT_KEY_R13);
  const cf = { facts: {
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2018-05-01', val: 50e6, filed: '2018-05-10', accn: 'a1' }] } } },
    'us-gaap': {
      CommonStockSharesOutstanding: { units: { shares: [{ end: '2018-03-31', val: 49e6, filed: '2018-05-10' }, { end: '2018-03-31', val: 4.9e6, filed: '2019-03-01' }, { end: '2018-05-01', val: 1, filed: '2018-05-10' }, { end: '2018-09-30', val: 5e6, filed: '2018-11-05' }] } },
      WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [{ start: '2018-01-01', end: '2018-03-31', val: 48e6, filed: '2018-05-10' }] } },
    } } };
  assert.deepEqual(sharesSeriesR14(cf), [['2018-03-31', 49e6, '2018-05-10', 'bs'], ['2018-05-01', 50e6, '2018-05-10', 'dei'], ['2018-09-30', 5e6, '2018-11-05', 'bs']], 'erste Einreichung je Bilanzstichtag, dei hat Vorrang');
  assert.deepEqual(sharesSeries(cf), [['2018-05-01', 50e6, '2018-05-10', 'dei']], 'r13-Logik unveraendert');
  assert.deepEqual(extractFactsR12(cf).shares, sharesSeries(cf));
  assert.deepEqual(extractFactsR12(cf, { r14: true }).shares, sharesSeriesR14(cf));
  const onlyW = { facts: { 'us-gaap': { WeightedAverageNumberOfDilutedSharesOutstanding: cf.facts['us-gaap'].WeightedAverageNumberOfDilutedSharesOutstanding } } };
  assert.deepEqual(sharesSeriesR14(onlyW), sharesSeries(onlyW), 'gewichtete Zahl nur als letzter Rueckfall');
  assert.equal(sharesSeriesR14(onlyW)[0][3], 'wadso');
});

test('SF7-CA-MISDATED-RUN: der Lauf verschiebt den Faktor im Overlay, beide Sitzungen verschwinden, kein Schnitt', async () => {
  const segs = Array.from({ length: 6 }, (_, s) => seg(`tiingo:NYSE:M${s}:2010-01-01`, s === 1 ? misdated(41) : series(700, s + 50)));
  const r = await caResolutionPart(dsOf(segs), segs, { keys: ['TURTLE_S1'], from: day(0), to: day(699), dataEnd: day(699) });
  assert.deepEqual(r.pub.census['DQ-K5'].byClass, { CONFIRMED_MISDATED_DECLARED_SPLIT: 2 });
  assert.deepEqual(r.pub.overlay.byKind, { MOVE_DECLARED: 1 });
  assert.equal(r.manifest.entries[0].moveFromDate, day(402));
  assert.equal(r.pub.datasets['CA-Q-K3'].quarantine.cuts, 0);
  assert.ok(r.pub.lifecycles.TURTLE_S1['CA-Q-K3'].reconciliation);
});

test('SF7-CA-BS-SHARES: Bilanz-Aktienzahl zaehlt vor der Sitzung nur, wenn vor ihr eingereicht (moegliche Split-Rueckrechnung)', () => {
  const bs = (k, v, filedK) => [day(k), v, day(filedK), 'bs'];
  assert.equal(bracketShares([bs(330, 50e6, 360), bs(460, 5e6, 480)], day(400)).q, 10, 'vor der Sitzung eingereicht: gueltig');
  assert.equal(bracketShares([bs(330, 5e6, 420), bs(460, 5e6, 480)], day(400)).reason, 'SEC_SHARES_NOT_BRACKETING', 'nach der Sitzung eingereicht: kein Vorher-Wert');
  const mixed = bracketShares([[day(300), 50e6, day(310), 'dei'], bs(380, 50e6, 395), bs(460, 5e6, 480), [day(470), 5e6, day(480), 'wadso']], day(400));
  assert.equal(mixed.before[3], 'bs'); assert.equal(mixed.after[3], 'bs');
  assert.equal(bracketShares([[day(330), 50e6, day(340), 'wadso'], [day(460), 5e6, day(470), 'wadso']], day(400)).reason, 'SEC_SHARES_NOT_DEI');
  // balance-sheet counts (r14) let an undeclared split be confirmed where the cover page is missing
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]);
  assert.equal(classify(raw, 400, { cik: '1', how: 'KNOWN', taxonomy: 'us-gaap', shares: [bs(330, 50e6, 360), bs(460, 5e6, 480)] }).cls, CLASSES.SPLIT);
});

// ---- independent review of #902 (head bba505a): every finding has a test that fails on the 1.0.0 behaviour
const reverse = (seed, n, extra = {}) => series(700, seed, [{ at: 400, price: n, volume: 1 / n, ...extra }]);
const withForms = (forms) => ({ form: ['10-Q', ...forms.map((f) => f[0]), '10-K'], filingDate: [day(0), ...forms.map((f) => day(f[1])), day(600)], items: ['', ...forms.map((f) => f[2] ?? ''), ''] });

test('SF7-REVIEW-L2: der vollstaendige Regelsatz ist versioniert und sein Hash festgeschrieben', () => {
  assert.equal(rulesetSha256(), '4233cea8b64f5eae9d87df0271cca044ef3da2351a33461624c2ba8d54e9cd47', 'jede Regelaenderung ist ein neuer, versionierter Regelsatz');
});

test('SF7-REVIEW-HIGH-1: Faktor aus dem Aktienverhaeltnis auf dem Raster 2..1000; 1:24 bleibt 1:24, N und N+1 ueberlappen nie', () => {
  for (let q = 1.3; q < 1100; q *= 1.0007) { assert.ok(snapFactor(q).length <= 1, `q=${q}`); assert.ok(snapFactor(1 / q).length <= 1); }
  assert.ok(FACTOR_GRID.includes(24) && FACTOR_GRID.includes(1.5) && FACTOR_GRID.includes(2.5) && FACTOR_GRID.at(-1) === 1000);
  const c = classify(reverse(61, 24), 400, SEC([[330, 48e6], [460, 2e6]]));
  assert.equal(c.cls, CLASSES.SPLIT, c.reason); assert.equal(c.factor, 24); assert.equal(c.splitFactor, 1 / 24); assert.equal(c.label, '1:24');
  assert.equal(classify(reverse(61, 24), 400, SEC([[330, 50e6], [460, 2e6]])).factor, 25, 'ein echtes 1:25 bleibt 1:25');
  for (const n of [15, 16, 70, 75, 80, 120, 125]) { const x = classify(reverse(62, n), 400, SEC([[330, n * 1e6], [460, 1e6]])); assert.equal(x.cls, CLASSES.SPLIT, `${n} ${x.reason}`); assert.equal(x.factor, n); }
  assert.equal(classify(reverse(61, 24), 400, SEC([[330, 48e6], [460, 48e6 / 23.5]])).reason, 'SHARE_RATIO_NO_MATCH', 'zwischen 1:23 und 1:24: kein Faktor');
});

test('SF7-REVIEW-HIGH-2: echte Bewegung nur mit Vorher-Zahl vor d eingereicht, ohne split-artiges Volumen, ohne Proxy / 5.07 / 8.01', () => {
  const raw = series(700, 5, [{ at: 400, price: 0.15, volume: 1.2 }]), sec = SEC([[330, 20e6], [460, 20.6e6]]);
  assert.equal(classify(raw, 400, sec).cls, CLASSES.GENUINE);
  const late = { ...sec, shares: [[day(330), 20e6, day(410), 'dei'], [day(460), 20.6e6, day(480), 'dei']] };
  assert.equal(classify(raw, 400, late).reason, 'GENUINE_BEFORE_COUNT_FILED_AFTER_SESSION', 'eine nach d eingereichte Zahl kann schon nach dem Split stehen');
  const vol = series(700, 5, [{ at: 400, price: 0.15, volume: 6 }]);
  assert.equal(classify(vol, 400, sec).reason, 'VOLUME_CONSISTENT_WITH_SPLIT');
  for (const f of [['DEF 14A', 380], ['PRE 14C', 390], ['8-K', 398, '5.07'], ['8-K', 401, '8.01,9.01'], ['8-K', 399, '2.01'], ['S-4', 370]]) assert.equal(classify(raw, 400, sec, { filings: filingEvidence(withForms([f]), day(400)) }).reason, 'CA_FILING_IN_WINDOW', f.join(' '));
  assert.equal(classify(raw, 400, sec, { filings: filingEvidence(withForms([['8-K', 398, '']]), day(400)) }).reason, '8K_ITEMS_UNKNOWN_IN_WINDOW');
  assert.equal(classify(raw, 400, sec, { filings: filingEvidence(withForms([['8-K', 300, '5.03']]), day(400)) }).cls, CLASSES.GENUINE, 'ausserhalb des Fensters zaehlt nicht');
});

test('SF7-REVIEW-MEDIUM-1/2: Split nur mit KNOWN-CIK und gepruefter Meldungslage; Fusion / Abgang blockiert, 5.03 und Proxy nicht', () => {
  const raw = reverse(3, 10), sec = SEC([[330, 50e6], [460, 5e6]]);
  assert.equal(classify(raw, 400, sec, { noFilings: true }).stage, 'NEEDS_FILING_CHECK');
  assert.equal(classify(raw, 400, sec, { noFilings: true }).pendingClass, CLASSES.SPLIT);
  assert.equal(classify(raw, 400, { ...sec, how: 'NAME_MATCH' }).reason, 'SPLIT_REQUIRES_KNOWN_CIK');
  for (const f of [['8-K', 399, '2.01,9.01'], ['S-4', 380], ['DEFM14A', 390], ['425', 401]]) assert.equal(classify(raw, 400, sec, { filings: filingEvidence(withForms([f]), day(400)) }).reason, 'MERGER_OR_DISPOSITION_FILING_NEAR_SPLIT', f.join(' '));
  for (const f of [['8-K', 399, '5.03'], ['DEF 14A', 380], ['8-K', 401, '3.03,8.01']]) assert.equal(classify(raw, 400, sec, { filings: filingEvidence(withForms([f]), day(400)) }).cls, CLASSES.SPLIT, f.join(' '));
  assert.equal(classify(raw, 400, sec, { filings: filingEvidence({ form: ['8-K'], filingDate: [day(398)], items: ['5.03'] }, day(400)) }).reason, 'SEC_FILINGS_NOT_COVERED');
  assert.equal(classify(raw, 400, sec, { filings: filingEvidence(null, day(400)) }).reason, 'SEC_FILINGS_UNAVAILABLE');
});

test('SF7-REVIEW-MEDIUM-4: auslaendischer Emittent (6-K, kein 10-Q/10-K) besteht die Meldungspruefung nie', () => {
  const raw = series(700, 5, [{ at: 400, price: 0.15, volume: 1.2 }]), sec = SEC([[330, 20e6], [460, 20.6e6]]);
  assert.equal(classify(raw, 400, sec, { filings: filingEvidence({ form: ['6-K', '6-K', '20-F'], filingDate: [day(0), day(395), day(500)], items: ['', '', ''] }, day(400)) }).reason, 'NOT_A_DOMESTIC_FILER');
  assert.equal(classify(raw, 400, sec, { filings: filingEvidence({ form: ['10-Q', '6-K'], filingDate: [day(0), day(500)], items: ['', ''] }, day(400)) }).reason, 'NOT_A_DOMESTIC_FILER');
});

test('SF7-REVIEW-L1: jede Schutzbedingung ist wirksam (Mutanten der Klassifikator-Waechter)', () => {
  const sec10 = SEC([[330, 50e6], [460, 5e6]]), same = SEC([[330, 20e6], [460, 20.2e6]]);
  // split guards
  const intraday = reverse(3, 10); intraday[400].open = intraday[399].close; // opened at the old level: not an overnight split
  assert.equal(classify(intraday, 400, sec10).reason, 'OPEN_RATIO_OFF_FACTOR');
  const adj3 = reverse(3, 10); adj3.forEach((b, k) => { b.adjClose = k < 400 ? b.close * 10 / 3 : b.close; });
  assert.equal(classify(adj3, 400, sec10).reason, 'TIINGO_ADJCLOSE_CONFLICT');
  const adjKnows = reverse(3, 10); adjKnows.forEach((b, k) => { b.adjClose = k < 400 ? b.close * 10 : b.close; });
  const k = classify(adjKnows, 400, sec10); assert.equal(k.cls, CLASSES.SPLIT); assert.equal(k.evidence.tiingoAdjCloseCorroborates, true);
  const noVol = reverse(3, 10); for (let j = 380; j < 700; j++) noVol[j].volume = 0;
  assert.equal(classify(noVol, 400, sec10).reason, 'VOLUME_EVIDENCE_MISSING');
  assert.equal(classify(reverse(3, 10), 400, SEC([[330, 5e6], [460, 50e6]])).reason, 'SHARE_AND_PRICE_DIRECTION_CONFLICT');
  // genuine guards
  const g = (seed, ev) => series(700, seed, [{ at: 400, volume: 1.2, ...ev }]);
  const adjG = g(71, { price: 0.15 }); adjG.forEach((b, j) => { b.adjClose = j < 400 ? b.close * 0.5 : b.close; });
  assert.equal(classify(adjG, 400, same).reason, 'TIINGO_ADJCLOSE_CONFLICT');
  assert.equal(classify(g(72, { price: 0.01 }), 400, same).reason, 'UNIT_ERROR_SUSPECT');
  assert.equal(classify(g(73, { price: 0.2 }), 400, same).reason, 'PRICE_RATIO_AT_STANDARD_FACTOR');
  const div = g(74, { price: 0.15 }); div[402].dividend = 0.3 * div[401].close;
  assert.equal(classify(div, 400, same).reason, 'LARGE_DISTRIBUTION_NEARBY');
  assert.equal(classify(g(75, { price: 0.15 }), 400, SEC([[330, 20e6], [460, 23e6]])).reason, 'SHARE_RATIO_NO_MATCH', '15 % mehr Aktien ist nicht unveraendert');
  // a count dated exactly on d is neither before nor after (strict < d and > d)
  assert.equal(bracketShares(dei([[400, 5e6], [460, 5e6]]), day(400)).reason, 'SEC_SHARES_NOT_BRACKETING');
  assert.equal(bracketShares(dei([[340, 5e6], [400, 5e6]]), day(400)).reason, 'SEC_SHARES_NOT_BRACKETING');
  assert.equal(bracketShares(dei([[265, 5e6], [460, 5e6]]), day(400)).ok, true, '135 Tage sind zulaessig');
  assert.equal(bracketShares(dei([[264, 5e6], [460, 5e6]]), day(400)).reason, 'SEC_BRACKET_TOO_WIDE');
});

test('SF7-REVIEW-L1-IDENTITY / L3: geteilte CIK, ADR-Segment und Markierungen aller Segmente eines Listings', async () => {
  const W = { keys: ['TURTLE_S1'], from: day(0), to: day(699), dataEnd: day(699) };
  const ids = (s) => `tiingo:NYSE:I${s}:2010-01-01`;
  const segs = [seg(ids(0), reverse(3, 10)), seg(ids(1), series(700, 81)), seg(ids(2), reverse(82, 10), { cls: 'ADR' }), seg(ids(3), series(700, 83))];
  const filings = async () => NO_CA_FILINGS;
  const base = new Map([[ids(0), SEC([[330, 50e6], [460, 5e6]])], [ids(2), { ...SEC([[330, 50e6], [460, 5e6]]), cik: '0000000002' }]]);
  const run = async (shares, periods) => { const r = await caResolutionPart(dsOf(segs), segs, { ...W, sharesByListing: shares, listingPeriods: periods, fetchFilings: filings, secFetchMax: 10 }); return Object.fromEntries(r.sealed.classified.map((c) => [c.segmentId, c.reason])); };
  const live = new Map([[ids(3), { startDate: '2010-01-01', listEnd: null }]]), ended = new Map([[ids(3), { startDate: '2010-01-01', listEnd: day(100) }]]);
  const shared = new Map([...base, [ids(3), { ...SEC([[330, 1e6], [460, 1e6]]), cik: '0000000001' }]]);
  assert.equal((await run(shared, live))[ids(0)], 'CIK_SHARED_BY_LIVE_LISTINGS');
  assert.equal((await run(shared, ended))[ids(0)], 'SHARES_PRICE_VOLUME_SAME_FACTOR', 'ein vor d beendetes Listing teilt die CIK nicht');
  assert.equal((await run(shared, new Map()))[ids(0)], 'CIK_SHARED_BY_LIVE_LISTINGS', 'unbekannte Laufzeit gilt als geteilt');
  assert.equal((await run(base, live))[ids(2)], 'ADR_OR_FOREIGN_FILER');
  // L3: a flag in the sibling segment '#1' of the same listing lies inside the share bracket
  const s0 = reverse(3, 10).slice(0, 421), s1 = series(300, 84, [{ at: 10, price: 4, volume: 0.25 }]).map((b, j) => ({ ...b, date: day(430 + j) }));
  const segs2 = [seg(ids(5), s0), seg(`${ids(5)}#1`, s1), seg(ids(6), series(700, 85))];
  const r2 = await caResolutionPart(dsOf(segs2, segs2[2].raw), segs2, { ...W, sharesByListing: new Map([[ids(5), SEC([[330, 50e6], [460, 5e6]])]]), fetchFilings: filings, secFetchMax: 10 });
  assert.equal(r2.sealed.classified.find((c) => c.segmentId === ids(5)).reason, 'MULTIPLE_JUMPS_IN_BRACKET');
});
