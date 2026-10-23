// Kullamaegi Episodic Pivot (C09) und Parabolic Short (C10), chart-first: Tagesscreen, Intraday-Bestaetigung auf
// echten Minutenbalken (hier synthetisch), PIT im Tag, keine erfundenen Minuten, Klassen strikt getrennt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runResearchLifecycle } from '../source-faithful/research/lifecycle-engine.mjs';
import { KK_EP_ADAPTER, EP_REFERENCE_CONFIG, EP_RUN_VARIANTS, EP_CLASS, EP_ORIGINAL_CLASS_ASSIGNABLE, EP_LABEL, validateEpConfig, epChartCandidate, resolveEpDay, epVariantRegistrySha256 } from '../source-faithful/research/kk-ep-lifecycle.mjs';
import { PS_REFERENCE_CONFIG, PS_RUN_VARIANTS, PS_CLASS, PS_EXECUTABLE_CLASS_ASSIGNABLE, PS_LABEL, validatePsConfig, psChartCandidate, psEntry, runPsCandidate, shortReturn, psVariantRegistrySha256 } from '../source-faithful/research/kk-ps-study.mjs';
import { toSession, compactSession, expandSession, identityCheck, openIdentityCheck, openingRange, runningVwap, fiveMinuteCandles, sessionMinute } from '../source-faithful/research/kk-intraday.mjs';
import { KK_EPISODIC_PIVOT, KK_PARABOLIC_SHORT } from '../source-faithful/contracts/kullamagi.mjs';

const PINNED_EP = 'efa94377effb3f5afdf24ff5029699b9b69ab4a43fdbec329e0d33293450cb00';
const PINNED_PS = 'e7ddaa7ef0481df816136638461f65f36ba053d23cecdc18b5357c1adc5d596a';
const day = (k) => new Date(Date.UTC(2021, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const flat = (k, c) => bar(k, c, c * 1.015, c * 0.985, c);
const mm = (k, o, h, l, c, v = 10000) => ({ k, open: o, high: h, low: l, close: c, volume: v });
const ds = (secs, intraday) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs, kkIntraday: intraday });
const intradayOf = (map, base = 200000) => ({ minutes: (t, d) => map.get(`${t}|${d}`), iexBaseline: () => base });

// ---------------------------------------------------------------- Episodic Pivot
/** 80 quiet sessions at 20, gap day 80 (official open 23 = +15 %), then strength, then a close below the 20-day MA */
function epScenario({ gapOpen = 23, dayLow = 22.95, after = null } = {}) {
  const bars = []; for (let k = 0; k < 80; k++) bars.push(flat(k, 20));
  bars.push(bar(80, gapOpen, 25, dayLow, 24.5, 5e6));
  // 20 rising sessions (the 20-day MA climbs above the stop), then a close below the 20-day MA without touching the stop
  const rise = Array.from({ length: 20 }, (_, j) => { const c = 25 + j * 0.25; return [c - 0.1, c + 0.2, c - 0.2, c]; });
  (after ?? [...rise, [29.6, 29.7, 27, 27.2], [27.1, 27.3, 26.8, 27]]).forEach(([o, h, l, c], j) => bars.push(bar(81 + j, o, h, l, c)));
  for (let j = 0; j < 3; j++) bars.push(flat(bars.length, 27));
  return { id: 'US:X:EPX', bars };
}
function epMinutes({ volume = 50000, lowAfter = 23.3 } = {}) {
  const m = [mm(0, 23, 23.2, 22.95, 23.1, volume), mm(1, 23.1, 23.15, 23.05, 23.1, volume * 0.6), mm(2, 23.12, 23.4, 23.1, 23.35, volume * 0.8)];
  for (let k = 3; k < 390; k++) { const p = 23.4 + (k / 389) * 1.6; m.push(mm(k, p, k === 389 ? 25 : p + 0.02, k === 200 ? lowAfter : p - 0.02, p, 2000)); }
  return m;
}

test('GC-KK-EP-CHART-CANDIDATE: Gap der offiziellen Eroeffnung >= 10 % (KK-015, gedruckte Groesse); nur Daten bis zur Eroeffnung', () => {
  const s = epScenario();
  const c = epChartCandidate(s.bars, 80);
  assert.equal(c.class, EP_CLASS.CHART); assert.ok(Math.abs(c.gap - 0.15) < 1e-12); assert.equal(c.catalyst, 'NOT_VERIFIED');
  assert.equal(epChartCandidate(epScenario({ gapOpen: 21.98 }).bars, 80), null); // 9.9 %
  // the candidate does not depend on the gap day's high, low, close or volume (known only later)
  const alt = epScenario(); alt.bars[80] = { ...alt.bars[80], high: 40, low: 10, close: 11, volume: 1 };
  assert.deepEqual(epChartCandidate(alt.bars, 80), c);
});

test('GC-KK-EP-INTRADAY-ENTRY: ORH-1-Bruch mit Volumen-Tempo, Stop = Tagestief vor der Kaufminute (KK-034), Engine-Lifecycle bis MA20', () => {
  const s = epScenario(), map = new Map([[`EPX|${day(80)}`, epMinutes()]]);
  const r = runResearchLifecycle(ds([s], intradayOf(map)), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.entryDate, day(80)); assert.equal(t.entryBasis, 'INTRADAY_MINUTE');
  assert.ok(Math.abs(t.entryFill - 23.21) < 1e-9); assert.equal(t.initialStop, 22.95);
  assert.equal(t.intradayEvidence.entryMinute, 2); assert.equal(t.intradayEvidence.class, EP_CLASS.INTRADAY_CONFIRMED); assert.equal(t.intradayEvidence.catalyst, 'NOT_VERIFIED');
  assert.equal(t.exitReason, 'EP_CLOSE_BELOW_MA20'); assert.equal(t.exitDate, day(102)); // close below MA20 on day 101, exit at the next open
  assert.equal(r.label, EP_LABEL); assert.equal(r.reconciliation.pass, true);
  assert.ok(t.riskOfEquity <= EP_REFERENCE_CONFIG.sizing.riskFraction + 1e-12);
});

test('GC-KK-EP-VOLUME-PACE: zu wenig IEX-Eroeffnungsvolumen -> kein Einstieg; ohne Volumenregel Einstieg (Variante)', () => {
  const s = epScenario(), base = { minutes: epMinutes({ volume: 500 }), bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000 };
  assert.equal(resolveEpDay({ ...base, cfg: EP_REFERENCE_CONFIG }).status, 'NOT_TRIGGERED');
  const alt = resolveEpDay({ ...base, cfg: EP_RUN_VARIANTS.find((v) => v.id === 'ALT-NO-VOLUME-RULE').config });
  assert.equal(alt.status, 'FILLED');
  assert.equal(resolveEpDay({ ...base, iexBaseline: null, cfg: EP_REFERENCE_CONFIG }).status, 'NOT_EXECUTED_NO_IEX_VOLUME_BASELINE');
});

test('GC-KK-EP-KK034-REJECT: Tagestief weiter als 1,5 ADR20 unter dem Einstieg lehnt ab, kein engerer Ersatzstop', () => {
  const s = epScenario({ dayLow: 21 });
  const m = epMinutes(); m[0] = mm(0, 23, 23.2, 21, 23.1, 50000); // low before the entry: 21 -> 9.5 % > 1.5 x 3 %
  const r = resolveEpDay({ minutes: m, bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG });
  assert.equal(r.status, 'NOT_EXECUTED_KK034_WIDE_STOP'); assert.ok(r.evidence.stopDistancePct > r.evidence.limitPct);
});

test('GC-KK-EP-SAME-DAY-STOP: ein spaeteres Minutentief am Stop beendet den Trade am selben Tag, aus Minuten entschieden', () => {
  const s = epScenario(), r = resolveEpDay({ minutes: epMinutes({ lowAfter: 22.9 }), bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG });
  assert.equal(r.status, 'FILLED'); assert.equal(r.sameDayStop, 'CERTAIN'); assert.equal(r.evidence.stopMinute, 200); assert.equal(r.sameDayExitFill, 22.95);
  const map = new Map([[`EPX|${day(80)}`, epMinutes({ lowAfter: 22.9 })]]);
  const e = runResearchLifecycle(ds([epScenario({ dayLow: 22.9 })], intradayOf(map)), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  assert.equal(e.trades[0].exitReason, 'STOP_SAME_BAR_CERTAIN'); assert.equal(e.trades[0].exitDate, day(80));
});

test('GC-KK-EP-NO-INVENTED-MINUTES: ohne Minuten, vor 2017 oder bei fremder Identitaet kein Trade (kein Tagesbalken-Ersatz)', () => {
  const s = epScenario();
  for (const [map, want] of [[new Map(), 'NOT_EXECUTED_INTRADAY_NOT_FETCHED'], [new Map([[`EPX|${day(80)}`, []]]), 'NOT_EXECUTED_NO_INTRADAY_DATA']]) {
    const r = runResearchLifecycle(ds([s], intradayOf(map)), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
    assert.equal(r.trades.length, 0); assert.equal(r.counts.notExecutedResolved[want], 1);
  }
  const other = epMinutes().map((x) => ({ ...x, high: x.high * 2, low: x.low * 2, open: x.open * 2, close: x.close * 2 }));
  assert.equal(resolveEpDay({ minutes: other, bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG }).status, 'NOT_EXECUTED_IDENTITY_MISMATCH');
  const early = { ...s, bars: s.bars.map((b) => ({ ...b, date: b.date.replace('2021', '2016') })) };
  const r = runResearchLifecycle(ds([early], intradayOf(new Map())), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  assert.equal(r.counts.notExecutedResolved.NOT_EXECUTED_BEFORE_IEX_HISTORY, 1);
});

test('SF-KK-EP-PIT-INTRADAY: Einstieg und Stop haengen nicht von Minuten nach der Kaufminute ab', () => {
  const s = epScenario(), a = resolveEpDay({ minutes: epMinutes(), bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG });
  const later = epMinutes().map((x) => (x.k > 2 ? { ...x, high: x.high + 0.5, close: x.close + 0.3, volume: 1 } : x));
  const b = resolveEpDay({ minutes: later, bar: { ...s.bars[80], high: 25.5 }, rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG });
  assert.equal(b.fill, a.fill); assert.equal(b.stop, a.stop); assert.equal(b.evidence.entryMinute, a.evidence.entryMinute);
  // the opening range of 5 minutes is not known before minute 5
  const or5 = resolveEpDay({ minutes: epMinutes(), bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_RUN_VARIANTS.find((v) => v.id === 'ALT-ORH-5').config });
  assert.ok(or5.status !== 'FILLED' || or5.evidence.entryMinute >= 5);
});

test('SF-KK-EP-CLASSES: originaler EP nie vergeben; Katalysator bleibt DATA_BLOCKED; Varianten festgeschrieben', () => {
  assert.equal(EP_ORIGINAL_CLASS_ASSIGNABLE, false);
  assert.deepEqual(validateEpConfig({ ...EP_REFERENCE_CONFIG, catalyst: 'VERIFIED' }), ['CATALYST_CANNOT_BE_VERIFIED']);
  for (const v of EP_RUN_VARIANTS) assert.deepEqual(validateEpConfig(v.config), [], v.id);
  assert.deepEqual(validateEpConfig({ ...EP_REFERENCE_CONFIG, exitMa: 30 }), ['EXIT_MA_NOT_NAMED_IN_SOURCE']);
  assert.equal(KK_EPISODIC_PIVOT.rules.find((r) => r.id === 'KK-SF-EP-CATALYST').status, 'DATA_BLOCKED');
  assert.equal(KK_EPISODIC_PIVOT.rules.find((r) => r.id === 'KK-SF-EP-STOP').status, 'SOURCE_EXACT');
  assert.match(EP_LABEL, /NOT_AN_ORIGINAL_EPISODIC_PIVOT/);
  assert.equal(epVariantRegistrySha256(), PINNED_EP);
});

// ---------------------------------------------------------------- Parabolic Short
/** 60 quiet sessions at 20, three accelerating up days (+5 / +7 / +10 %), trade day 63, then a slide to the 10-day MA */
function psScenario() {
  const bars = []; for (let k = 0; k < 60; k++) bars.push(flat(k, 20));
  let c = 20; for (const r of [0.05, 0.07, 0.10]) { const o = c; c = c * (1 + r); bars.push(bar(bars.length, o, c * 1.005, o * 0.995, c)); }
  bars.push(bar(63, 27, 27.5, 26, 26.2)); // trade day
  bars.push(bar(64, 26.2, 26.4, 24.5, 24.8)); bars.push(bar(65, 24.8, 25, 21, 21.5));
  for (let j = 0; j < 3; j++) bars.push(flat(bars.length, 21.5));
  return { id: 'US:X:PSX', bars };
}
function psMinutes() {
  const m = [mm(0, 27, 27.5, 26.9, 27.3), mm(1, 27.3, 27.4, 27.1, 27.2), mm(2, 27.2, 27.25, 26.8, 26.9), mm(3, 26.9, 27, 26.85, 26.95), mm(4, 26.95, 27.05, 26.9, 27)];
  m.push(mm(5, 27, 27.02, 26.9, 26.92)); m.push(mm(6, 26.92, 26.95, 26.85, 26.88)); m.push(mm(7, 26.85, 26.86, 26.7, 26.72));
  for (let k = 8; k < 390; k++) { const p = 26.7 - ((k - 8) / 381) * 0.5; m.push(mm(k, p, p + 0.03, k === 389 ? 26 : p - 0.03, p)); }
  return m;
}

test('GC-KK-PS-CHART-CANDIDATE: beschleunigte Aufwaertstage bis zum Vortag (KK-018), Summe >= 3 ADR20, Schluss ueber MA10; nur Daten bis t-1', () => {
  const s = psScenario(), c = psChartCandidate(s.bars, 63);
  assert.equal(c.class, PS_CLASS.CHART); assert.equal(c.upStreak, 3); assert.equal(c.accelerating, true); assert.equal(c.borrow, 'DATA_BLOCKED');
  const alt = psScenario(); alt.bars[63] = { ...alt.bars[63], open: 50, high: 60, low: 1, close: 2 };
  assert.deepEqual(psChartCandidate(alt.bars, 63), c);
  assert.equal(psChartCandidate(s.bars, 63, PS_RUN_VARIANTS.find((v) => v.id === 'ALT-STREAK4').config), null);
});

test('GC-KK-PS-ORL5-SHORT: Short unter dem 5-Minuten-ORL, Stop ueber dem Tageshoch vor dem Einstieg, Eindeckung am MA10 (KK-020/-022/-023)', () => {
  const s = psScenario(), r = runPsCandidate({ bars: s.bars, cand: psChartCandidate(s.bars, 63), minutes: psMinutes(), cfg: PS_REFERENCE_CONFIG });
  assert.equal(r.status, 'CLOSED');
  const t = r.trade;
  assert.equal(t.entryMinute, 7); assert.ok(Math.abs(t.entryAdj - 26.79) < 1e-9); assert.ok(Math.abs(t.stopAdj - 27.51) < 1e-9);
  assert.deepEqual(t.exitReasons, ['PS_TARGET_MA10']); assert.equal(t.fills[0].date, day(65));
  assert.ok(t.netReturn > 0 && t.rMultiple > 0); assert.equal(t.borrow, 'DATA_BLOCKED'); assert.equal(t.class, PS_CLASS.INTRADAY_CONFIRMED);
  assert.ok(Math.abs(shortReturn(100, 90) - (100 * 0.999 - 90 * 1.001 - 190 * 0.0001) / 100) < 1e-12);
});

test('GC-KK-PS-STOP-FIRST: erreicht eine Minute nach dem Einstieg das Tageshoch, ist es ein Stop (vor jedem Ziel)', () => {
  const s = psScenario(), m = psMinutes(); m[20] = mm(20, 26.6, 27.6, 20, 27.4); // stop and an absurd low in one minute
  const r = runPsCandidate({ bars: s.bars, cand: psChartCandidate(s.bars, 63), minutes: m, cfg: PS_REFERENCE_CONFIG });
  // the absurd low after the entry disagrees with the daily bar: evidence only, never a reason to drop the day (PIT)
  assert.equal(r.status, 'CLOSED'); assert.deepEqual(r.trade.exitReasons, ['PS_STOP_HOD']); assert.equal(r.trade.dayRangeAgreement, 'IDENTITY_MISMATCH');
  const m2 = psMinutes(); m2[20] = mm(20, 26.6, 27.6, 26.5, 27.4);
  const d = { ...s, bars: s.bars.map((b, k) => (k === 63 ? { ...b, high: 27.6 } : b)) };
  const r2 = runPsCandidate({ bars: d.bars, cand: psChartCandidate(d.bars, 63), minutes: m2, cfg: PS_REFERENCE_CONFIG });
  assert.deepEqual(r2.trade.exitReasons, ['PS_STOP_HOD']); assert.ok(r2.trade.netReturn < 0);
});

test('GC-KK-PS-ENTRY-READINGS: erste rote 5-Minuten-Kerze und gescheiterter VWAP-Retest sind vorregistrierte Lesarten', () => {
  const s = psScenario(), b = s.bars[63];
  const red = psEntry(psMinutes(), b, PS_RUN_VARIANTS.find((v) => v.id === 'ALT-ENTRY-FIRST-RED-5MIN').config, 1);
  assert.equal(red.status, 'FILLED'); assert.ok(psMinutes()[red.minuteIndex].k >= 5);
  const vw = psEntry(psMinutes(), b, PS_RUN_VARIANTS.find((v) => v.id === 'ALT-ENTRY-FAILED-VWAP-RETEST').config, 1);
  assert.ok(['FILLED', 'NOT_TRIGGERED'].includes(vw.status));
  if (vw.status === 'FILLED') assert.equal(vw.fillAtClose, true);
});

test('GC-KK-PS-NO-INVENTED-MINUTES / SF-KK-PS-CLASSES: ohne Minuten kein Trade; ausfuehrbarer Short nie vergeben (Borrow DATA_BLOCKED)', () => {
  const s = psScenario(), c = psChartCandidate(s.bars, 63);
  assert.equal(runPsCandidate({ bars: s.bars, cand: c, minutes: undefined, cfg: PS_REFERENCE_CONFIG }).status, 'NOT_EXECUTED_INTRADAY_NOT_FETCHED');
  assert.equal(runPsCandidate({ bars: s.bars, cand: c, minutes: [], cfg: PS_REFERENCE_CONFIG }).status, 'NOT_EXECUTED_NO_INTRADAY_DATA');
  assert.equal(PS_EXECUTABLE_CLASS_ASSIGNABLE, false); assert.match(PS_LABEL, /NO_BORROW_DATA_NOT_EXECUTABLE/);
  assert.deepEqual(validatePsConfig({ ...PS_REFERENCE_CONFIG, borrow: 'ASSUMED_FREE' }), ['BORROW_IS_DATA_BLOCKED']);
  for (const v of PS_RUN_VARIANTS) assert.deepEqual(validatePsConfig(v.config), [], v.id);
  assert.equal(KK_PARABOLIC_SHORT.rules.find((r) => r.id === 'KK-SF-PS-BORROW').status, 'DATA_BLOCKED');
  assert.equal(psVariantRegistrySha256(), PINNED_PS);
});

// ---------------------------------------------------------------- intraday building blocks
test('SF-KK-INTRADAY-BLOCKS: Sitzungsminuten, Kompaktformat, Identitaet, Opening Range, VWAP, 5-Minuten-Kerzen', () => {
  const iso = (k) => new Date(Date.UTC(2021, 0, 4, 14, 30) + k * 60000).toISOString(); // EST: 09:30 ET = 14:30 UTC
  assert.equal(sessionMinute(iso(0)), 0); assert.equal(sessionMinute(iso(389)), 389);
  const raw = [{ date: iso(-1), open: 1, high: 1, low: 1, close: 1, volume: 5 }, { date: iso(0), open: 10, high: 11, low: 9, close: 10.5, volume: 100 }, { date: iso(1), open: 10.5, high: 12, low: 10, close: 11, volume: 300 }];
  const m = toSession(raw);
  assert.equal(m.length, 2);
  assert.deepEqual(expandSession(compactSession(m)), m);
  assert.equal(identityCheck(m, { high: 12, low: 9 }, 1).status, 'IDENTITY_OK');
  assert.equal(openIdentityCheck(m, { open: 10.2 }, 1).status, 'IDENTITY_OK');
  assert.equal(openIdentityCheck(m, { open: 10.6 }, 1).status, 'IDENTITY_MISMATCH'); // 5.7 % off the official open
  assert.equal(openIdentityCheck(m.map((x) => ({ ...x, k: x.k + 5 })), { open: 10 }, 1).status, 'IDENTITY_NO_OPENING_PRINT');
  assert.deepEqual(openingRange(m, 1, 11.5), { high: 11.5, low: 9, bars: 1, minutes: 1 }); // the official open is part of the range
  assert.equal(identityCheck(m, { high: 12, low: 9 }, 2).status, 'IDENTITY_MISMATCH');
  assert.deepEqual(openingRange(m, 1), { high: 11, low: 9, bars: 1, minutes: 1 });
  const { vwap, cum } = runningVwap(m);
  assert.ok(Math.abs(vwap[0] - (11 + 9 + 10.5) / 3) < 1e-12); assert.equal(cum[1], 400);
  assert.equal(fiveMinuteCandles(m)[0].completeAt, 5);
});

// ---------------------------------------------------------------- runner (pure parts)
import { screenCandidates, candidateCounts, fetchOrder, iexBaselineFromRange, kkResearchCodeSha256, DEFAULT_MAX_REQUESTS } from '../source-faithful/research/run-kk-intraday.mjs';

test('SF-KK-RUNNER-SCREEN-AND-ORDER: Kandidaten beider Methoden im Universum; Abrufreihenfolge deterministisch, ergebnisunabhaengig', () => {
  const big = (s) => ({ ...s, bars: s.bars.map((b) => ({ ...b, volume: 1e6, rawVolume: 1e6 })) });
  const c = screenCandidates({ securities: [big(epScenario()), big(psScenario())] });
  assert.ok(c.ep.some((x) => x.ticker === 'EPX' && x.date === day(80)));
  assert.ok(c.ps.some((x) => x.ticker === 'PSX' && x.date === day(63)));
  assert.deepEqual(candidateCounts(c.ep, '2017-01-03').inIexHistory, c.ep.length);
  const keys = ['B|2021-01-01', 'A|2021-01-02', 'C|2021-01-03', 'A|2021-01-02'];
  assert.deepEqual(fetchOrder(keys), fetchOrder([...keys].reverse())); assert.equal(fetchOrder(keys).length, 3);
  assert.ok(DEFAULT_MAX_REQUESTS <= 6000); assert.match(kkResearchCodeSha256(), /^[0-9a-f]{64}$/);
});

test('SF-KK-RUNNER-IEX-BASELINE: IEX-Tagesvolumen nur aus IEX-Balken je ET-Datum; unter 15 Tagen mit Volumen keine Basis', () => {
  const dates = Array.from({ length: 20 }, (_, k) => day(k));
  const bars = dates.flatMap((d) => [{ date: `${d}T15:00:00.000Z`, volume: 100 }, { date: `${d}T19:00:00.000Z`, volume: 300 }]);
  assert.deepEqual(iexBaselineFromRange(bars, dates), { mean: 400, days: 20, daysWithVolume: 20 });
  assert.equal(iexBaselineFromRange(bars.slice(0, 20), dates).mean, null); // 10 days only
});

// ---------------------------------------------------------------- readiness artifact
import fs from 'node:fs';
import { buildKkEpPs, KK_SNAPSHOT_RUNS } from '../source-faithful/completion/build-kk-ep-ps.mjs';
import { kkResearchCodeSha256 as kkCode } from '../source-faithful/research/run-kk-intraday.mjs';

test('SF-KK-READINESS: Artefakt = frischer Build; Original-EP und ausfuehrbarer Short nie vergebbar; Vertragsstatus unveraendert; nichts live', () => {
  const a = buildKkEpPs();
  assert.deepEqual(JSON.parse(fs.readFileSync('scripts/supertrader/source-faithful/artifacts/STRATEGY-KK-EP-PS-CHART.json', 'utf8')), JSON.parse(JSON.stringify(a)));
  assert.equal(a.strategies.C09.classes.find((c) => c.id === EP_CLASS.ORIGINAL).assignable, false);
  assert.equal(a.strategies.C10.classes.find((c) => c.id === PS_CLASS.EXECUTABLE).assignable, false);
  for (const id of ['KK-SF-EP-CATALYST', 'KK-SF-EP-VOLUME', 'KK-SF-EP-ENTRY']) assert.equal(a.strategies.C09.contract.ruleStatuses[id], 'DATA_BLOCKED');
  for (const id of ['KK-SF-PS-ENTRY', 'KK-SF-PS-STOP', 'KK-SF-PS-BORROW']) assert.equal(a.strategies.C10.contract.ruleStatuses[id], 'DATA_BLOCKED');
  for (const c of ['C09', 'C10']) { assert.equal(a.strategies[c].liveReadiness, 'LIVE_NOT_APPROVED'); assert.match(a.strategies[c].contract.measurementClassOfTheOriginalMethod, /^NOT_MEASURABLE/); }
  for (const r of KK_SNAPSHOT_RUNS.filter((x) => x.role === 'AUTHORITATIVE')) assert.equal(r.researchCodeSha256, kkCode());
});

test('SF-KK-PIT-IDENTITY: die Identitaetspruefung kennt nur die Eroeffnung; spaetere Minuten waehlen keinen Tag ab', () => {
  const s = epScenario(), a = resolveEpDay({ minutes: epMinutes(), bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG });
  assert.equal(a.status, 'FILLED'); assert.equal(a.evidence.dayRangeAgreement, 'IDENTITY_OK');
  // a bad print late in the day (after the entry and above the stop) leaves the decision unchanged and is reported
  const bad = epMinutes().map((x) => (x.k === 300 ? { ...x, high: 60 } : x));
  const b = resolveEpDay({ minutes: bad, bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG });
  assert.equal(b.status, 'FILLED'); assert.equal(b.fill, a.fill); assert.equal(b.stop, a.stop); assert.equal(b.evidence.dayRangeAgreement, 'IDENTITY_MISMATCH');
  // a first print far from the official open (another security under the ticker) is not executed
  const late = epMinutes().map((x) => ({ ...x, open: x.open * 1.2 }));
  assert.equal(resolveEpDay({ minutes: late, bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG }).status, 'NOT_EXECUTED_IDENTITY_MISMATCH');
});

test('SF-KK-EP-OR-OFFICIAL-OPEN: die offizielle Eroeffnung gehoert zur Opening Range (Auktion ist kein IEX-Print)', () => {
  const s = epScenario(), m = epMinutes();
  const hi = { ...s.bars[80], open: 23.25, low: 22.95 }; // official open above the first IEX minute high (23.2)
  const r = resolveEpDay({ minutes: m, bar: hi, rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg: EP_REFERENCE_CONFIG });
  assert.equal(r.status, 'FILLED'); assert.ok(r.fill >= 23.26 - 1e-9); assert.equal(r.evidence.entryMinute, 2);
});

test('SF-KK-EP-VOLUME-BY-20: nach Minute 20 zaehlt das IEX-Volumen der Minuten 0-19, auch wenn Minuten fehlen', () => {
  const s = epScenario(), cfg = EP_REFERENCE_CONFIG;
  // no break before minute 25; minutes 0-19 carry 210 000 IEX shares, minute 19 is the last one before 20
  const m = [mm(0, 23, 23.2, 22.95, 23.1, 100000)];
  for (let k = 1; k < 20; k++) m.push(mm(k, 23.1, 23.15, 23.05, 23.1, k === 19 ? 101000 : 500));
  m.push(mm(25, 23.2, 23.5, 23.15, 23.4, 1000));
  for (let k = 26; k < 390; k++) m.push(mm(k, 23.4, 23.45, 23.35, 23.4, 1000));
  assert.equal(resolveEpDay({ minutes: m, bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 200000, cfg }).status, 'FILLED');
  assert.equal(resolveEpDay({ minutes: m, bar: s.bars[80], rawFactor: 1, adrPct: 3, iexBaseline: 250000, cfg }).status, 'NOT_TRIGGERED');
});

import { getJson, hasRoom, definitive, intArg, shardOf, CACHE_SHARDS, MAX_REQUESTS_CAP, EP_BUDGET_SHARE, BASELINE_FREQS } from '../source-faithful/research/run-kk-intraday.mjs';
test('SF-KK-RUNNER-BUDGET: jeder HTTP-Versuch zaehlt (auch Wiederholungen), nie ueber die Grenze; nur 200/404 werden gespeichert', async () => {
  let calls = 0;
  const f429 = async () => { calls++; return { status: 429, text: async () => '' }; };
  const run = { used: 0, max: 4 }, ep = { used: 0, max: 2 };
  const r = await getJson('u', 'k', [run, ep], f429, async () => {});
  assert.equal(r.status, 'BUDGET_EXHAUSTED'); assert.equal(calls, 2); assert.equal(run.used, 2); assert.equal(ep.used, 2);
  assert.equal(hasRoom([run]), true); assert.equal(hasRoom([run, ep]), false); assert.equal(hasRoom([run], 3), false);
  const fThrow = async () => { calls++; throw new Error('net'); };
  calls = 0; const b = { used: 0, max: 10 };
  assert.equal((await getJson('u', 'k', [b], fThrow, async () => {})).status, 0); assert.equal(calls, 3); assert.equal(b.used, 3);
  for (const [st, body, want] of [[200, [], true], [200, null, false], [200, {}, false], [404, null, true], [0, null, false], [429, null, false], [500, null, false], [400, null, false], ['BUDGET_EXHAUSTED', null, false]]) assert.equal(definitive(st, body), want, String(st));
  assert.equal(intArg('6000', 1, MAX_REQUESTS_CAP), 6000); assert.equal(intArg('6001', 1, MAX_REQUESTS_CAP), null);
  assert.equal(intArg('abc', 1, MAX_REQUESTS_CAP), null); assert.equal(intArg('12.5', 1, MAX_REQUESTS_CAP), null); assert.equal(intArg('', 1, MAX_REQUESTS_CAP), null);
  assert.equal(MAX_REQUESTS_CAP, 6000); assert.ok(EP_BUDGET_SHARE > 0 && EP_BUDGET_SHARE < 1);
  assert.deepEqual([...BASELINE_FREQS], ['4hour', '1hour']); // 1day is rejected by the IEX endpoint (Phase 1b)
  const shards = new Set(Array.from({ length: 400 }, (_, n) => shardOf(`T${n}|2021-01-04`)));
  assert.equal(shards.size, CACHE_SHARDS); assert.equal(shardOf('NVDA|2023-05-25'), shardOf('NVDA|2023-05-25'));
});

test('SF-KK-RUN-REGISTERED: eingetragener Lauf passt zum Code; unvollstaendige Abdeckung heisst Stichprobe, nie mehr', () => {
  const a = buildKkEpPs(), run = KK_SNAPSHOT_RUNS.find((x) => x.role === 'AUTHORITATIVE');
  assert.ok(run); assert.equal(run.epVariantRegistrySha256, epVariantRegistrySha256()); assert.equal(run.psVariantRegistrySha256, psVariantRegistrySha256());
  assert.ok(run.coverage.requestsThisRun <= 6000);
  for (const v of Object.values(run.ep)) assert.equal(v.reconciliation, true);
  for (const k of ['C09', 'C10']) {
    const s = a.strategies[k];
    if (!run.coverage.complete) assert.match(s.researchStage, /_HASH_ORDER_SAMPLE$/);
    assert.doesNotMatch(s.researchStage, /ORIGINAL|EXECUTABLE|CERTIFIED/); assert.equal(s.liveReadiness, 'LIVE_NOT_APPROVED');
  }
});

test('SF-KK-STATEMENTS: nicht zertifiziert, keine repraesentative Gesamtaussage, IEX-Volumen, hypothetische Shorts, Lizenz', () => {
  const a = buildKkEpPs(), s = a.statements;
  assert.match(s.certification, /DIAGNOSTIC_NOT_CERTIFIED/); assert.match(s.sample, /NOT a representative/);
  assert.match(s.iexVolume, /never treated as market volume/); assert.match(s.shorts, /never a historically executable short/);
  assert.match(s.license, /never minute values/);
  // public run records carry counts and hashes only: no price or minute arrays
  const pub = JSON.stringify(KK_SNAPSHOT_RUNS);
  assert.doesNotMatch(pub, /"(open|high|low|close|o|h|l|c|v|k)":\[/);
});
