// Supertrader 7.0 – V4-D1-Aufloesung (integrity/ca-resolution.mjs, integrity/ca-overlay.mjs, research/run-sf7-ca-resolution.mjs).
// Synthetisch; der echte Lauf braucht Snapshot und sec-pit-r13 (Workflow-Modus sf7-ca-resolution).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../validation/lib.mjs';
import { datasetFromPit } from '../source-faithful/runner/snapshot-input.mjs';
import { runResearchLifecycle, prepareAll } from '../source-faithful/research/lifecycle-engine.mjs';
import { SF5_LIFECYCLES } from '../source-faithful/research/sf5-lifecycles.mjs';
import { DQ_POLICIES, flagDiscontinuities, quarantineSecurity, sessionRatio } from '../source-faithful/integrity/discontinuity.mjs';
import { classifyFlag, filingEvidence, bracketShares, snapStandard, CLASSES, TOLERANCES } from '../source-faithful/integrity/ca-resolution.mjs';
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
const classify = (raw, i, sec, more = {}) => { const s = secOf(raw); return classifyFlag({ raw, bars: s.bars, i, sec, otherFlagDates: flagDiscontinuities(s.bars, 3).map((j) => s.bars[j].date), ...more }); };

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
  const raw = series(700, 5, [{ at: 400, price: 0.15, volume: 4 }]);
  assert.deepEqual(flagDiscontinuities(secOf(raw).bars, 5), [400]);
  const sec = SEC([[330, 20e6], [460, 20.6e6]]);
  const pending = classify(raw, 400, sec);
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
  // 1.6x more shares and -80 %: neither a factor nor unchanged
  const raw2 = series(700, 8, [{ at: 400, price: 0.2, volume: 3 }]);
  assert.equal(classify(raw2, 400, SEC([[330, 10e6], [460, 16e6]])).reason, 'SHARE_RATIO_NO_MATCH');
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
  assert.equal(classify(raw, 400, SEC([[330, 50e6], [460, 50e6 / 8.5]])).reason, 'SHARE_RATIO_AMBIGUOUS_FACTOR');
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
  const segs = Array.from({ length: 16 }, (_, s) => seg(ids(s), series(700, s + 21, s === 2 ? [{ at: 400, price: 10, volume: 0.1 }] : s === 5 ? [{ at: 300, price: 0.15, volume: 4 }] : s === 9 ? [{ at: 500, price: 12, volume: 0.08 }] : [])));
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
  assert.equal(calls, 1, 'genau eine Meldungsabfrage (nur der exponierte Kandidat mit bestandenen Aktienzahl-Tests)');
  assert.equal(r.pub.secEvidence.filingLookups, 1);
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
