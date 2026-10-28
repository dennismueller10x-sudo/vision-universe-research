// Supertrader 8.0 – zentraler Preisabgleich der Research-Kurse (V4, ADR-002): Golden Cases auf eingefrorenen echten
// Reihen (fixtures/sf8-price-parity-golden.json, Stand 2026-10-26) und adversariale Fälle. Keine Toleranz: nur die
// Rundungsregel der Veröffentlichung, und eine Abweichung kleiner als eine Rundungseinheit nur vor einem Split.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { priceParity, historyParity, roundingUnit, truncateReference, loadPriceReference, PRICE_PARITY, HISTORY_PARITY, PublishedClose } from '../source-faithful/product/price-parity.mjs';
import { assessSecurity, DQ_CONTRACT_VERSION } from '../source-faithful/product/data-quality.mjs';
import { runPipeline } from '../source-faithful/product/build-candidates.mjs';
import { createCalendar, SOURCES } from '../source-faithful/product/eod-adapter.mjs';
import { STAGE } from '../source-faithful/product/candidate-contract.mjs';
import { referenceFromBars } from './sf8-reference-fixture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CAL = createCalendar();
const G = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/sf8-price-parity-golden.json'), 'utf8'));
const golden = (t) => {
  const g = G.securities.find((s) => s.ticker === t);
  return { sec: { id: g.id, ticker: g.ticker, meta: { corporateActions: g.splits.map((date) => ({ date, flags: ['SPLIT'] })) }, bars: g.bars.map(([date, close]) => ({ date, close })) }, ref: g.reference };
};
const days = CAL.sessionsBetween('2026-01-01', '2026-10-23');
const synth = (closes, x = {}) => ({ id: 'ref_TEST', ticker: 'TEST', meta: { corporateActions: [] }, bars: closes.map((c, k) => ({ date: days[days.length - closes.length + k], close: c })), ...x });
const ASOF = '2026-10-23';

test('SF8-PX-GOLDEN: echte Reihen vom 26.10.2026 – Identität, Rundung nach Split, Sitzungsdifferenz, veraltete Referenz', () => {
  const aapl = golden('AAPL'), r1 = priceParity(aapl.sec, aapl.ref, G.asOf);
  assert.equal(r1.status, PRICE_PARITY.PASS);
  assert.equal(r1.close, 343.91, 'AAPL Schluss 26.10.2026 = veröffentlichter Schluss');
  assert.equal(r1.history.status, HISTORY_PARITY.PASS);
  assert.equal(r1.history.compared, 270);
  // ADIL: Split 06.02.2026; davor adjustierte Werte mit halbem Cent (7,465), die Veröffentlichung rundet auf 7,46
  const adil = golden('ADIL'), r2 = priceParity(adil.sec, adil.ref, G.asOf);
  assert.equal(r2.status, PRICE_PARITY.PASS);
  assert.equal(r2.history.status, HISTORY_PARITY.ADJUSTMENT_ROUNDING);
  assert.equal(r2.history.adjustmentRounding, 2);
  assert.equal(r2.history.unexplainedCount, 0);
  // AEMD: zwei Splits im Fenster, neun Rundungsfälle, alle vor dem letzten Split
  const aemd = golden('AEMD'), r3 = priceParity(aemd.sec, aemd.ref, G.asOf);
  assert.equal(r3.history.status, HISTORY_PARITY.ADJUSTMENT_ROUNDING);
  assert.equal(r3.history.adjustmentRounding, 9);
  // YPF: die Materialisierung hat den 18.11.2025, die veröffentlichte Reihe nicht -> Verlauf ungeklärt (CAP)
  const ypf = golden('YPF'), r4 = priceParity(ypf.sec, ypf.ref, G.asOf);
  assert.equal(r4.status, PRICE_PARITY.PASS, 'Stichtag stimmt');
  assert.equal(r4.history.status, HISTORY_PARITY.UNEXPLAINED);
  assert.deepEqual(r4.history.onlyBars, ['2025-11-18']);
  // GETY: veröffentlichte Reihe endet am 21.10.2026 -> veraltet, keine Bewertung
  const gety = golden('GETY'), r5 = priceParity(gety.sec, gety.ref, G.asOf);
  assert.equal(r5.status, PRICE_PARITY.REFERENCE_STALE);
  assert.equal(r5.referenceDate, '2026-10-21');
});

test('SF8-PX-NO-TOLERANCE: ein Cent oder ein Bruchteil am Stichtag ist eine Abweichung, kein Pass', () => {
  const s = synth([10, 10.5, 11]);
  assert.equal(priceParity(s, referenceFromBars(s), ASOF).status, PRICE_PARITY.PASS);
  for (const pub of [11.01, 10.99, 11.004 + 0.001]) {
    const ref = referenceFromBars(s); ref.points[ref.points.length - 1] = [ASOF, pub];
    const r = priceParity(s, ref, ASOF);
    assert.equal(r.status, PRICE_PARITY.CLOSE_MISMATCH, String(pub));
  }
  // die Rundungsregel der Veröffentlichung selbst ist keine Toleranz: 11.004 wird 11.00
  const s2 = synth([10, 10.5, 11.004]);
  assert.equal(priceParity(s2, referenceFromBars(s2), ASOF).status, PRICE_PARITY.PASS);
  // unter einem Dollar vier signifikante Stellen
  const p = synth([0.5, 0.51234]); assert.equal(PublishedClose.roundClose(0.51234), 0.5123);
  assert.equal(priceParity(p, referenceFromBars(p), ASOF).status, PRICE_PARITY.PASS);
  const pr = referenceFromBars(p); pr.points[1] = [ASOF, 0.5124];
  assert.equal(priceParity(p, pr, ASOF).status, PRICE_PARITY.CLOSE_MISMATCH);
});

test('SF8-PX-IDENTITY: securityId, Ticker, Listing und Währung müssen zur core/identity.js-Bildung passen', () => {
  const s = synth([10, 11]);
  for (const over of [{ securityId: 'ref_OTHER' }, { ticker: 'OTHER' }, { instrumentId: 'TEST.L' }, { currency: 'EUR' }, { securityId: undefined }]) {
    assert.equal(priceParity(s, referenceFromBars(s, over), ASOF).status, PRICE_PARITY.IDENTITY_MISMATCH, JSON.stringify(over));
  }
  // eine selbstgebildete Kennung des Titels ("ref_" + ticker klein) ist keine core/identity.js-Bildung
  const wrong = { ...s, id: 'ref_test' };
  assert.equal(priceParity(wrong, referenceFromBars(wrong), ASOF).status, PRICE_PARITY.IDENTITY_MISMATCH);
});

test('SF8-PX-DATE: Datum und Zeitpunkt – veraltet, voraus und ohne Balken am Stichtag sind keine Aussage', () => {
  const s = synth([10, 11, 12]);
  const stale = referenceFromBars(s); stale.points = stale.points.slice(0, -1); stale.asOf = stale.points.at(-1)[0];
  assert.equal(priceParity(s, stale, ASOF).status, PRICE_PARITY.REFERENCE_STALE);
  const ahead = referenceFromBars(s, { asOf: '2026-10-26' }); ahead.points.push(['2026-10-26', 12.5]);
  assert.equal(priceParity(s, ahead, ASOF).status, PRICE_PARITY.REFERENCE_AHEAD, 'neuere Reihe kann nachadjustiert sein');
  // Titel selbst ohne Balken am Stichtag
  const old = { ...s, bars: s.bars.slice(0, -1) };
  assert.equal(priceParity(old, referenceFromBars(s), ASOF).status, PRICE_PARITY.REFERENCE_STALE);
  // Wiederholung (--as-of): die Referenz endet am Stichtag, gleiche Basis
  const full = referenceFromBars(s); full.points.push(['2026-10-26', 13]); full.asOf = '2026-10-26';
  const t = truncateReference(full, ASOF);
  assert.equal(t.asOf, ASOF); assert.equal(t.replayTruncatedTo, ASOF);
  assert.equal(priceParity(s, t, ASOF).status, PRICE_PARITY.PASS);
});

test('SF8-PX-CONTRACT: fehlende oder vertragswidrige Referenz (Mock, Rohkurs, nicht berechnet, falsches Schema)', () => {
  const s = synth([10, 11]);
  assert.equal(priceParity(s, null, ASOF).status, PRICE_PARITY.REFERENCE_MISSING);
  for (const over of [{ dataMode: 'mock' }, { priceSeriesType: 'RAW' }, { status: 'PENDING' }, { schemaVersion: 'discover-series-1.0.0' }, { grain: 'weekly' }, { source: 'yahoo' }, { publishBasis: '' }, { points: [] }]) {
    assert.equal(priceParity(s, referenceFromBars(s, over), ASOF).status, PRICE_PARITY.REFERENCE_INVALID, JSON.stringify(over));
  }
});

test('SF8-PX-HISTORY: legitime Differenz nur als Rundung vor einem Split; alles andere ungeklärt', () => {
  const s = synth([7.465, 7.5, 15, 15.2]);
  const ref = referenceFromBars(s); ref.points[0] = [ref.points[0][0], 7.46];
  // ohne Split nach dem Datum ist dieselbe Abweichung ein Datenfehler
  assert.equal(historyParity(s.bars, ref, []).status, HISTORY_PARITY.UNEXPLAINED);
  const split = [s.bars[2].date];
  assert.equal(historyParity(s.bars, ref, split).status, HISTORY_PARITY.ADJUSTMENT_ROUNDING);
  // ein Split VOR dem Datum erklärt nichts
  assert.equal(historyParity(s.bars, ref, [s.bars[0].date]).status, HISTORY_PARITY.UNEXPLAINED);
  // weniger oder mehr als genau eine halbe Einheit ist keine Rundung eines Gleichstands (Review LOW 7)
  for (const pub of [7.461, 7.469, 7.456]) { const q = referenceFromBars(s); q.points[0] = [q.points[0][0], pub]; assert.equal(historyParity(s.bars, q, split).status, HISTORY_PARITY.UNEXPLAINED, String(pub)); }
  // eine volle Rundungseinheit (ein Cent) ist mehr als Rundung
  const big = referenceFromBars(s); big.points[0] = [big.points[0][0], 7.455];
  assert.equal(historyParity(s.bars, big, split).status, HISTORY_PARITY.UNEXPLAINED);
  // nicht adjustierte Reihe vor dem Split (Faktor 2) ist kein Rundungsfall
  const raw = referenceFromBars(s); raw.points[0] = [raw.points[0][0], 14.93];
  assert.equal(historyParity(s.bars, raw, split).status, HISTORY_PARITY.UNEXPLAINED);
  // Sitzung nur in einer der beiden Reihen
  const gap = referenceFromBars(s); gap.points.splice(1, 1);
  const h = historyParity(s.bars, gap, []);
  assert.equal(h.status, HISTORY_PARITY.UNEXPLAINED); assert.deepEqual(h.onlyBars, [s.bars[1].date]);
  assert.equal(roundingUnit(7.465), 0.01); assert.equal(roundingUnit(0.5), 0.0001); assert.equal(roundingUnit(0), null);
});

test('SF8-PX-DQ: Preisabgleich im Datenqualitätsvertrag 1.1.0 – FAIL ohne Preisidentität, CAP bei ungeklärtem Verlauf', () => {
  assert.equal(DQ_CONTRACT_VERSION, 'sf8-data-quality-1.1.0');
  assert.equal(SOURCES.priceReference, 'quant/data/market/discover-series');
  const bars = CAL.sessionsBetween('2024-01-01', ASOF).slice(-260).map((date, k) => { const c = 50 + k * 0.05; return { date, open: c - 0.1, high: c + 0.3, low: c - 0.3, close: c, volume: 1e6 }; });
  const s = { id: 'ref_TEST', ticker: 'TEST', bars, terminal: null, meta: { instrumentType: 'EQUITY_COMMON', activeStatus: 'ACTIVE', adjustmentStatus: 'adjusted', caReconciliation: 'PASS', splitEvents: 0, corporateActions: [] } };
  const weekly = []; for (let d = CAL.addDays(ASOF, -460); d <= ASOF; d = CAL.addDays(d, 7)) weekly.push({ date: d, close: 50 });
  const opts = { asOf: ASOF, calendar: CAL, weekly, continuity: { bySecurityId: new Map() } };
  assert.throws(() => assessSecurity(s, opts), /SF8_DQ_PRICE_REFERENCE_REQUIRED/, 'kein stiller Pass ohne Referenz');
  const ok = assessSecurity(s, { ...opts, priceReference: referenceFromBars(s) });
  assert.equal(ok.status, 'PASS'); assert.equal(ok.maxStage, STAGE.MODELED_TRADE_PLAN);
  const none = assessSecurity(s, { ...opts, priceReference: null });
  assert.equal(none.status, 'FAIL'); assert.equal(none.maxStage, null);
  assert.equal(none.checks.find((c) => c.id === 'PRICE_PARITY').detail.status, PRICE_PARITY.REFERENCE_MISSING);
  const off = referenceFromBars(s); off.points[off.points.length - 1] = [ASOF, off.points.at(-1)[1] + 0.01];
  assert.equal(assessSecurity(s, { ...opts, priceReference: off }).status, 'FAIL');
  const hist = referenceFromBars(s); hist.points[100] = [hist.points[100][0], hist.points[100][1] * 1.5];
  const capped = assessSecurity(s, { ...opts, priceReference: hist });
  assert.equal(capped.status, 'CAP'); assert.equal(capped.maxStage, STAGE.CHART_CANDIDATE);
});

test('SF8-PX-PIPELINE: ohne Preisquelle kein Lauf; ein Titel ohne Preisidentität fällt mit Grund heraus', () => {
  const F = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/sf8-golden-bars.json'), 'utf8'));
  const secs = F.securities.map((s) => ({ id: s.id, ticker: s.ticker, terminal: null, meta: structuredClone(s.meta), bars: s.cols.d.map((d, k) => ({ date: d, open: s.cols.o[k], high: s.cols.h[k], low: s.cols.l[k], close: s.cols.c[k], volume: s.cols.v[k] })) }));
  const WEEKLY = new Map(F.securities.map((s) => [s.id, s.weekly.map(([date, close]) => ({ date, close }))]));
  const base = { securities: secs, asOf: F.asOf, calendar: CAL, continuity: { bySecurityId: new Map() }, weeklyOf: (id) => WEEKLY.get(id) ?? null };
  assert.throws(() => runPipeline(base), /SF8_PRICE_REFERENCE_SOURCE_REQUIRED/);
  const REF = new Map(secs.map((s) => [s.id, referenceFromBars(s)]));
  const all = runPipeline({ ...base, priceReferenceOf: (id) => REF.get(id) });
  assert.ok(all.index.candidates.some((c) => c.t === 'BOLT'));
  const bad = new Map(REF); const b = structuredClone(REF.get('ref_BOLT')); b.points[b.points.length - 1][1] += 0.01; bad.set('ref_BOLT', b);
  const res = runPipeline({ ...base, priceReferenceOf: (id) => bad.get(id) });
  assert.ok(!res.index.candidates.some((c) => c.t === 'BOLT'), 'BOLT ohne Preisidentität nicht bewertet');
  assert.equal(res.index.dataQuality.failReasons.PRICE_PARITY, (all.index.dataQuality.failReasons.PRICE_PARITY ?? 0) + 1);
  assert.equal(res.index.candidates.length, all.index.candidates.length - all.index.candidates.filter((c) => c.t === 'BOLT').length);
  // ungeklärter Verlauf: nur Chart-Kandidat, kein Plan
  const h = new Map(REF); const j = structuredClone(REF.get('ref_JAKK')); j.points[10][1] *= 2; h.set('ref_JAKK', j);
  const capped = runPipeline({ ...base, priceReferenceOf: (id) => h.get(id) });
  const jakk = capped.strategies.flatMap((s) => s.detail.views).filter((v) => v.ticker === 'JAKK');
  assert.ok(jakk.length > 0 && jakk.every((v) => v.stage === STAGE.CHART_CANDIDATE && !v.plan));
  assert.ok(jakk.every((v) => v.dataQuality.notPass.some((n) => n.id === 'PRICE_HISTORY_PARITY')));
});

test('SF8-PX-UNREADABLE: eine vorhandene, unlesbare Referenz ist vertragswidrig, nicht fehlend (Review LOW 8)', () => {
  const s = synth([10, 11]);
  const r = priceParity(s, { unreadable: true, source: 'x' }, ASOF);
  assert.equal(r.status, PRICE_PARITY.REFERENCE_INVALID); assert.equal(r.reason, 'UNREADABLE');
});

test('SF8-PX-REPO: im Repository hat jeder Titel mit Tagesbalken am Stichtag seine Referenzreihe (Lesen, kein Schreiben)', () => {
  const r = loadPriceReference('ref_AAPL');
  assert.ok(r && r.securityId === 'ref_AAPL' && r.priceSeriesType === 'SPLIT_ADJUSTED');
  assert.equal(loadPriceReference('ref_DOES_NOT_EXIST_X'), null);
});
