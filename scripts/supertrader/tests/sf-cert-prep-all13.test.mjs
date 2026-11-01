// Supertrader 9 – Zertifizierungsvorbereitung der übrigen acht Methoden (C07 Power Play, C06 Minervini SEPA, C13 Holy
// Grail, C11 Pocket Pivot, C05 Weinstein Trader, C04 Weinstein Investor, C09 Kullamägi Episodic Pivot, C10 Kullamägi
// Parabolic Short). Regeltreue-Prüfungen mit synthetischen Balken und Minuten an den Grenzen der Regeln, gegen das
// unveränderte Engine-Verhalten. Jeder CP-Test hat im Plan mindestens eine Gegenprobe (mutationProbes): eine bewusste
// Mutation im Engine-Code macht ihn rot (scripts/supertrader/source-faithful/certification/cert-prep-all13.mjs
// --mutation-probes). Kein Test ändert eine Regel oder einen Parameter; keine Marktdaten, kein Schreiben.
// Plan: scripts/supertrader/source-faithful/certification/CERT-PREP-ALL13-PLAN.json (erweitert CERT-PREP-TOP5-PLAN.json),
// Bericht: docs/SUPERTRADER_9_CERTIFICATION_PREP_ALL13.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { maGate, volumeAlternatives, investorScreen, lastSwingHigh, WEIN_PARAMS } from '../source-faithful/methods/weinstein.mjs';
import { WEINSTEIN_INVESTOR_ADAPTER, WEINSTEIN_TRADER_ADAPTER, WEIN_INVESTOR_REFERENCE_CONFIG, WEIN_TRADER_REFERENCE_CONFIG, weinsteinWeeklySetups } from '../source-faithful/research/weinstein-lifecycle.mjs';
import { trendTemplate, stopCheck, powerPlayPeak, powerPlayScreen, MIN_PARAMS } from '../source-faithful/methods/minervini.mjs';
import { entryEligibility, fillBuyOrder, validateConfig as validateMinConfig, REFERENCE_CONFIG as MIN_REFERENCE_CONFIG } from '../source-faithful/research/minervini-lifecycle.mjs';
import { epStopCheck, KK_PARAMS } from '../source-faithful/methods/kullamagi.mjs';
import { epChartCandidate, resolveEpDay, KK_EP_ADAPTER, EP_REFERENCE_CONFIG, EP_RUN_VARIANTS } from '../source-faithful/research/kk-ep-lifecycle.mjs';
import { psChartCandidate, psEntry, shortReturn, validatePsConfig, PS_REFERENCE_CONFIG, PS_RUN_VARIANTS, PS_COSTS, PS_EXECUTABLE_CLASS_ASSIGNABLE } from '../source-faithful/research/kk-ps-study.mjs';
import { pocketPivotAt, sellGuideEvidence, MOKA_PARAMS } from '../source-faithful/methods/morales-kacher.mjs';
import { POCKET_PIVOT_ADAPTER, PP_REFERENCE_CONFIG, PP_RUN_VARIANTS, pocketPivotSignal, sellGuideSeries } from '../source-faithful/research/moka-lifecycle.mjs';
import { protectiveHit } from '../source-faithful/research/lifecycle-engine.mjs';
import { adx, HG_PARAMS } from '../source-faithful/methods/holy-grail.mjs';
import { holyGrailSetupSeries, HOLY_GRAIL_RESEARCH_ADAPTER, HG_REFERENCE_CONFIG } from '../source-faithful/research/holy-grail-lifecycle.mjs';
import { emaSeries } from '../source-faithful/common/series.mjs';
import { loadPlan, validatePlan, PINNED_PLAN_CONTENT_SHA256, planContentSha256 } from '../source-faithful/certification/cert-prep-top5.mjs';
import { loadAll13, validateAll13, mergePlans, all13Report, all13OutTarget, ALL13_PLAN_FILE, PINNED_ALL13_CONTENT_SHA256, ALL13_CANDIDATES, all13ContentSha256, runMutationProbes } from '../source-faithful/certification/cert-prep-all13.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const day = (k) => new Date(Date.UTC(2021, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const bar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
const mm = (k, o, h, l, c, v = 10000) => ({ k, open: o, high: h, low: l, close: c, volume: v });
const apiLog = (log) => ({ raiseStop: (lvl, rule) => log.push(['RAISE', lvl, rule]), setTrigger: (t) => log.push(['TRIGGER', t]), scheduleExit: (f, r) => log.push(['EXIT', f, r]) });

// ---------------------------------------------------------------- Weinstein (C04 / C05)
const MON = Date.UTC(2018, 0, 1); // ein Montag
const dateOf = (w, d) => new Date(MON + (7 * w + d) * 864e5).toISOString().slice(0, 10);
/** Wochenspezifikation [open, high, low, close, volume] -> fünf Tagesbalken (Hoch am Mittwoch, Tief am Donnerstag). */
function daily(spec) {
  const out = [];
  spec.forEach(([o, h, l, c, v], w) => {
    const vd = v / 5, rows = [[o, o, o, o], [o, o, o, o], [o, h, o, o], [o, o, l, o], [o, Math.max(o, c), Math.min(o, c), c]];
    rows.forEach(([a, b, cL, d], k) => out.push({ date: dateOf(w, k), open: a, high: b, low: cL, close: d, volume: vd, splitAdj: 1 }));
  });
  return out;
}
const wk = (c, v = 1e5, r = 2) => [c, c + r, c - r, c, v];
/** Investor-Szenario (wie sf-weinstein): 30 Wochen 110, Abfall auf 100, Basis 101, dann 101,5; Ausbruchswoche 70. */
function investorSpec({ breakoutHigh = 106, preBaseHigh = null, baseStartHigh = null } = {}) {
  const s = [];
  for (let w = 0; w < 30; w++) s.push(wk(110));
  for (let k = 1; k <= 5; k++) s.push(wk(110 - (10 * k) / 5));
  for (let w = 35; w < 65; w++) s.push([101, 103, 99, 101, 1e5]);
  for (let w = 65; w < 70; w++) s.push([101.5, 103.5, 99.5, 101.5, 1e5]);
  if (preBaseHigh !== null) s[63] = [101, preBaseHigh, 99, 101, 1e5];
  if (baseStartHigh !== null) s[64] = [101, baseStartHigh, 99, 101, 1e5];
  s.push([101.5, breakoutHigh, 101, 101.5, 3e5]); // Woche 70 (Schluss 101,5: das Wochenhoch ist breakoutHigh)
  s.push(wk(101.5)); // Woche 71 schließt Woche 70 ab
  return s;
}
const wday = (k) => new Date(Date.UTC(2019, 0, 7) + k * 864e5).toISOString().slice(0, 10); // ein Montag
/** Wochentagsbalken aus [Hoch, Tief]-Zeilen je Woche (Hoch am Mittwoch, Tief am Freitag). */
function weekRows(rows) {
  const bars = []; let k = 0;
  for (const [h, l] of rows) for (let d = 0; d < 7; d++, k++) {
    if (d >= 5) continue;
    const mid = (h + l) / 2, hi = d === 2 ? h : Math.min(h, mid + 0.2), lo = d === 4 ? l : Math.max(l, mid - 0.2);
    bars.push({ date: wday(k), open: mid, high: hi, low: lo, close: mid, volume: 1e6, rawClose: mid, rawVolume: 1e6, splitAdj: 1 });
  }
  return bars;
}
function trailLog(adapter, kind, rows, cfg) {
  const bars = weekRows(rows), ctx = { ...weinsteinWeeklySetups(bars, kind), bars }, log = [], pos = { entryIndex: 0, state: {}, events: [], trade: {} };
  for (let i = 0; i < bars.length; i++) adapter.onClose(pos, ctx, i, apiLog(log), cfg);
  return log.filter((x) => x[0] === 'RAISE');
}

test('CP-WEIN-MA-GATE-EQUALITY: Kaufpreis gleich MA30w ist kein Kauf, eine flache MA30w gilt nicht als fallend, eine um 1e-9 tiefere schon (WEIN-MA)', () => {
  const weeks = [{ close: 100 }, { close: 100 }], buy = (p, ma) => maGate(weeks, ma, 1, p);
  assert.equal(buy(100, [100, 100]).reason, 'BUY_PRICE_AT_OR_BELOW_MA30W', 'Preis gleich MA: "unter oder bei" (Lesart at = Gleichheit)');
  assert.equal(buy(100.01, [100, 100]).pass, true, 'flache MA ist nicht fallend');
  assert.equal(buy(100.01, [100 + 1e-9, 100]).reason, 'MA30W_FALLING');
  assert.equal(buy(100.01, [null, 100]).reason, 'MA_UNAVAILABLE');
  assert.equal(WEIN_PARAMS.maWeeks, 30);
});

test('CP-WEIN-VOL-THRESHOLDS: Alternative A und B verlangen mindestens das Doppelte, C mehr als das Doppelte (WEIN-VOL1, WEIN-VOL2, WEIN-VOL3)', () => {
  // Wochen 0..7 mit Volumen 100, Woche 8 = Ausbruchswoche; Tage: 5 Vortage mit 10, Ausbruchstag mit genau 20
  const weeks = Array.from({ length: 9 }, () => ({ volume: 100 }));
  const days = [...Array.from({ length: 5 }, () => ({ volume: 10 })), { volume: 20 }];
  const at = (wv, dv) => { weeks[8].volume = wv; days[5].volume = dv; return volumeAlternatives(weeks, 8, days, 5); };
  let r = at(200, 20);
  assert.equal(r.A.ratio, 2); assert.equal(r.A.holds, true, 'A: genau das Doppelte genügt ("mindestens")');
  assert.equal(r.C.ratio, 2); assert.equal(r.C.holds, false, 'C: genau das Doppelte genügt nicht ("mehr als")');
  r = at(199.99, 20.01);
  assert.equal(r.A.holds, false); assert.equal(r.C.holds, true);
  // B: 3 Wochen Aufbau mit genau dem doppelten Schnitt der 4 Wochen davor und steigendem Ausbruchswochen-Volumen
  const wb = [100, 100, 100, 100, 100, 200, 200, 200, 201].map((volume) => ({ volume }));
  const b = volumeAlternatives(wb, 8, days, 5).B.variants.find((x) => x.weeks === 3);
  assert.equal(b.ratio, 2); assert.equal(b.rising, true); assert.equal(b.holds, true);
  wb[8].volume = 200; // nicht steigend gegenüber der Vorwoche
  assert.equal(volumeAlternatives(wb, 8, days, 5).B.variants.find((x) => x.weeks === 3).holds, false);
  assert.equal(WEIN_PARAMS.volumeMultiple, 2); assert.equal(WEIN_PARAMS.volMonthWeeks, 4); assert.equal(WEIN_PARAMS.volDailyPriorSessions, 5); assert.deepEqual([...WEIN_PARAMS.volBuildWeeks], [3, 4]);
});

test('CP-WEIN-INV-BASE-RESISTANCE: Widerstand = höchstes Wochenhoch ab dem Wochenbeginn der Basis; Buy-Stop ein Roh-Cent darüber, ein Wochenhoch genau am Trigger löst aus (WEIN-BUY1, WEIN-BASE)', () => {
  const run = (o) => { const spec = investorSpec(o); return investorScreen({ id: 'X', bars: daily(spec) }, { week: 70 }); };
  const [r] = run({ breakoutHigh: 103.5 + 0.01 });
  assert.ok(r, 'Hoch genau am Trigger 103,51');
  assert.equal(r.buyStop.resistance, 103.5); assert.ok(near(r.buyStop.level, 103.51));
  assert.equal(run({ breakoutHigh: 103.505 }).length, 0, 'unter dem Trigger kein Kandidat');
  const [pre] = run({ preBaseHigh: 104 }); // Woche 63 liegt vor dem Basisbeginn (Woche 64)
  assert.equal(pre.buyStop.resistance, 103.5, 'ein Hoch vor dem Basisbeginn zählt nicht');
  const [inBase] = run({ baseStartHigh: 104 }); // Woche 64 ist der Basisbeginn (MA30w hört dort auf zu fallen)
  assert.equal(inBase.buyStop.resistance, 104, 'das Hoch der ersten Basiswoche zählt');
});

test('CP-WEIN-TR-SWING-HIGH: Trader-Widerstand = jüngstes Wochen-Swinghoch mit mindestens einer tieferen Woche danach; die Vorwoche selbst ist nie das Swinghoch (WEIN-TR-CONT)', () => {
  const W = (hs) => hs.map((high) => ({ high }));
  assert.equal(lastSwingHigh(W([10, 12, 11, 11.5, 11.2]), 5), 3);
  assert.equal(lastSwingHigh(W([10, 12, 11, 13]), 4), null, 'Woche w-1 mit neuem Hoch: keine Konsolidierungswoche danach');
  assert.equal(lastSwingHigh(W([10, 12, 11, 12, 11]), 5), 3, 'ein späteres gleich hohes Hoch ist das jüngere Swinghoch');
  assert.equal(lastSwingHigh(W([10, 12, 12.5, 11]), 4), 2);
});

test('CP-WEIN-TRAIL-THRESHOLDS: Korrektur genau 8 % (Investor) bzw. 7 % (Trader) und neues Wochenhoch heben den Stop einen Roh-Cent unter das Korrekturtief; knapp darunter nicht (WEIN-TRAIL1, WEIN-TR-TRAIL)', () => {
  const inv = (low) => trailLog(WEINSTEIN_INVESTOR_ADAPTER, 'INVESTOR', [[48, 46], [50, 48], [49, low], [49, 47], [50.5, 48], [49, 48.5]], { ...WEIN_INVESTOR_REFERENCE_CONFIG, vol5: false });
  const tr = (low, cfg = WEIN_TRADER_REFERENCE_CONFIG) => trailLog(WEINSTEIN_TRADER_ADAPTER, 'TRADER', [[48, 46], [50, 48], [49, low], [49, 47], [50.5, 48], [49, 48.5]], { ...cfg, vol5: false });
  const a = inv(46); // (50 - 46) / 50 = 0,08
  assert.equal(a.length, 1); assert.equal(a[0][2], 'WEIN-TRAIL1-2'); assert.ok(near(a[0][1], 46 - 0.01), String(a[0][1]));
  assert.equal(inv(46.01).length, 0, '7,98 % < 8 %');
  const t = tr(46.5); // (50 - 46,5) / 50 = 0,07
  assert.equal(t.length, 1); assert.equal(t[0][2], 'WEIN-TR-TRAIL'); assert.ok(near(t[0][1], 46.49));
  assert.equal(tr(46.51).length, 0, '6,98 % < 7 %');
  assert.equal(WEIN_INVESTOR_REFERENCE_CONFIG.trailThreshold, 0.08); assert.equal(WEIN_TRADER_REFERENCE_CONFIG.trailThreshold, 0.07);
});

test('CP-WEIN-STOP-BELOW-TRIGGER: der Stop liegt einen Roh-Cent unter dem Maschinenvorschlag und muss unter dem Trigger liegen; Gleichheit sperrt (WEIN-STOP1, MA-WEIN-INITIAL-STOP)', () => {
  const bars = [bar(0, 10, 10.5, 9.5, 10)];
  for (const A of [WEINSTEIN_INVESTOR_ADAPTER, WEINSTEIN_TRADER_ADAPTER]) {
    const cfg = A === WEINSTEIN_INVESTOR_ADAPTER ? WEIN_INVESTOR_REFERENCE_CONFIG : WEIN_TRADER_REFERENCE_CONFIG;
    const ok = A.eligibility({ setup: { stopProposal: 10, trigger: 10.5 }, bars, i: 0, cfg });
    assert.equal(ok.order.type, 'BUY_STOP'); assert.equal(ok.order.level, 10.5); assert.ok(near(ok.order.stop, 9.99));
    assert.equal(ok.order.maxPlannedLoss, undefined, 'Referenz ohne 15-%-Grenze (WEIN-STOP4 nur Variante)');
    const eq = A.eligibility({ setup: { stopProposal: 10.51, trigger: 10.5 }, bars, i: 0, cfg }); // Stop 10,50 = Trigger
    assert.equal(eq.order, null); assert.equal(eq.blockers[0].code, 'NO_STOP_BELOW_TRIGGER');
  }
});

// ---------------------------------------------------------------- Minervini (C06 / C07)
/** 300 Balken: 0..47 steigen von 80 auf ~100, 48..298 von 101 auf 125 (Tief = Schluss - 1, Hoch = Schluss + 0,5), 299 = Stichtag. */
function ttBars({ close = 130, low48 = 100, maxHigh = null } = {}) {
  const b = [];
  for (let k = 0; k < 48; k++) { const c = 80 + k * 0.4; b.push(bar(k, c, c + 0.5, c - 1, c)); }
  for (let k = 48; k < 299; k++) { const c = 101 + ((k - 48) * 24) / 250; b.push(bar(k, c, c + 0.5, c - 1, c)); }
  b[48] = { ...b[48], low: low48 };
  if (maxHigh !== null) b[200] = { ...b[200], high: maxHigh };
  b.push(bar(299, close, close + 0.5, close - 1, close));
  return b;
}

test('CP-MIN-TT-BOUNDS: genau 30 % über dem 52-Wochen-Tief und genau 25 % unter dem 52-Wochen-Hoch genügen, knapp daneben nicht (MIN-TT-06, MIN-TT-07)', () => {
  const tt = (o) => trendTemplate(ttBars(o), 299);
  const a = tt({ close: 130, low48: 100 }); // 100 x 1,3 = 130 (double-exakt)
  assert.equal(a.values.low52w, 100); assert.equal(a.criteria['MIN-SF-TT-6'], true); assert.equal(a.pass, true, JSON.stringify(a.criteria));
  assert.equal(tt({ close: 130, low48: 100.00000000000001 }).criteria['MIN-SF-TT-6'], false);
  const b = tt({ close: 150, maxHigh: 200 }); // 200 x 0,75 = 150
  assert.equal(b.values.high52w, 200); assert.equal(b.criteria['MIN-SF-TT-7'], true);
  assert.equal(tt({ close: 150, maxHigh: 200.00000000000003 }).criteria['MIN-SF-TT-7'], false);
  assert.equal(MIN_PARAMS.aboveLow, 0.30); assert.equal(MIN_PARAMS.belowHigh, 0.25); assert.equal(MIN_PARAMS.yearSessions, 252);
});

test('CP-MIN-STOP-FLAG-10: ein geplanter Verlust von genau 10 % ist nicht über der Grenze, 10,01 % schon (MIN-MM-STOP-02)', () => {
  assert.equal(stopCheck(100, 90).exceedsMaxPlannedLoss, false);
  assert.equal(stopCheck(100, 89.99).exceedsMaxPlannedLoss, true);
  assert.equal(stopCheck(100, null).flag, 'STOP_REQUIRED_BEFORE_ENTRY');
  assert.equal(MIN_PARAMS.maxStopPct, 0.10);
});

const liquid = (n = 25) => Array.from({ length: n }, (_, k) => bar(k, 50, 51, 49, 50, 1e6));
test('CP-MIN-ENTRY-PLANNED-LOSS-LIMIT: Einstieg nur bei geplantem Verlust <= 10 % am Pivot; Limit = Stop / 0,9; Eröffnung über dem Limit ohne Rücklauf wird nicht ausgeführt (MIN-MM-STOP-02, MA-MIN-ORDER-TYPE)', () => {
  const bars = liquid();
  const el = (stopStructure, strategy = 'SEPA') => entryEligibility({ strategy, setup: strategy === 'SEPA' ? { state: 'SETUP_DETECTED', vcpProxyStrict: true, pivot: 100, stopStructure } : { state: 'CONFIRMED_MECHANICAL_SETUP', pivot: 100, stopStructure }, bars, k: bars.length, cfg: MIN_REFERENCE_CONFIG });
  for (const s of ['SEPA', 'POWER_PLAY']) {
    const ok = el(90, s);
    assert.equal(ok.state, 'ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW', `${s}: ${JSON.stringify(ok.blockers)}`);
    assert.equal(ok.order.type, 'BUY_STOP_LIMIT'); assert.equal(ok.order.limit, 100); assert.equal(ok.order.validFor, 'NEXT_SESSION_ONLY');
    assert.deepEqual(el(89.99, s).blockers.map((b) => b.code), ['PLANNED_LOSS_ABOVE_10PCT']);
  }
  const order = { type: 'BUY_STOP_LIMIT', level: 100, stop: 95, limit: 95 / 0.9 };
  assert.equal(fillBuyOrder({ open: 106, high: 107, low: 105.6, close: 106 }, order).status, 'NOT_EXECUTED_ABOVE_LIMIT');
  const lim = fillBuyOrder({ open: 106, high: 107, low: 105, close: 106 }, order);
  assert.equal(lim.basis, 'LIMIT_FILL_AFTER_OPEN'); assert.ok(near(lim.fill, 95 / 0.9));
  const touch = fillBuyOrder({ open: 99, high: 101, low: 94, close: 100 }, order);
  assert.equal(touch.fill, 100); assert.equal(touch.basis, 'INTRADAY_PIVOT_TOUCH'); assert.equal(touch.sameBarStop, 'AMBIGUOUS');
});

/** Power-Play-Balken: Grundniveau Tief 11 / Hoch 12, Bewegungstief 10 auf j, Hoch 20 auf p = 120, danach Konsolidierung. */
function ppBars({ j = 81, runLow = 10, consLow = 18 } = {}) {
  const b = Array.from({ length: 121 }, (_, k) => bar(k, 11.5, 12, 11, 11.5));
  b[j] = { ...b[j], low: runLow };
  b[120] = bar(120, 18, 20, 17.5, 19.5);
  for (let k = 121; k <= 124; k++) b.push(bar(k, 19, 19.5, k === 123 ? consLow : 18.5, 19));
  return b;
}

test('CP-MIN-PP-RUNUP-40: +100 % zählt, wenn das Tief höchstens 39 Sitzungen vor dem Hoch liegt (weniger als acht Wochen = 40 Sitzungen), Gleichheit 2,0 genügt (MIN-PP-02)', () => {
  assert.deepEqual(powerPlayPeak(ppBars({ j: 81 }), 124), { p: 120, j: 81 }, '120 - 81 = 39 Sitzungen');
  assert.equal(powerPlayPeak(ppBars({ j: 80 }), 124), null, '40 Sitzungen sind nicht weniger als acht Wochen');
  assert.equal(powerPlayPeak(ppBars({ runLow: 10.000001 }), 124), null, 'knapp unter +100 %');
  assert.equal(MIN_PARAMS.ppMultiple, 2); assert.equal(MIN_PARAMS.ppMaxSessions, 40);
});

test('CP-MIN-PP-CORRECTION-BOUNDS: Korrektur genau 25 % bleibt ein Datensatz (Prüfbereich 20–25 %), darüber keiner; <= 10 % ist eng (MIN-PP-04, MIN-PP-05)', () => {
  const ev = (consLow) => { const [r] = powerPlayScreen({ id: 'P', bars: ppBars({ consLow }) }, { asOfIndex: 124 }); return r ? Object.fromEntries(r.machineScreenEvidence.map((e) => [e.ruleId, e.value])) : null; };
  const at25 = ev(15);
  assert.equal(at25['MIN-SF-PP-CORRECTION'].correction, 0.25); assert.equal(at25['MIN-SF-PP-CORRECTION'].inPrintedRange20to25, true);
  assert.equal(ev(14.99), null);
  // 1 - 16/20 = 0,19999999999999996 (double): die gedruckte 20-%-Grenze ist in double nicht exakt; der Prüfbereich beginnt darüber
  assert.equal(ev(16)['MIN-SF-PP-CORRECTION'].inPrintedRange20to25, false);
  assert.equal(ev(15.99)['MIN-SF-PP-CORRECTION'].inPrintedRange20to25, true);
  assert.equal(ev(18)['MIN-SF-PP-TIGHT'].status, 'TIGHT');
  assert.equal(ev(17.99)['MIN-SF-PP-TIGHT'].status, 'VCP_CHARACTERISTICS_REVIEW');
  assert.equal(MIN_PARAMS.ppMaxCorrection, 0.25); assert.equal(MIN_PARAMS.ppReviewCorrection, 0.20); assert.equal(MIN_PARAMS.ppTight, 0.10);
});

test('CP-MIN-PP-CONFIRMED-ONLY: nur CONFIRMED_MECHANICAL_SETUP wird simuliert; Prüf- und Datenfälle bleiben gesperrt, die Konfiguration kann das nicht öffnen (MA-MIN-PP-ELIGIBLE-CLASSES)', () => {
  const bars = liquid(), el = (state) => entryEligibility({ strategy: 'POWER_PLAY', setup: { state, pivot: 100, stopStructure: 92 }, bars, k: bars.length, cfg: MIN_REFERENCE_CONFIG });
  assert.equal(el('CONFIRMED_MECHANICAL_SETUP').state, 'ENTRY_POSSIBLE_PENDING_MANUAL_REVIEW');
  assert.deepEqual(el('MANUAL_REVIEW_SETUP').blockers.map((b) => b.code), ['MANUAL_REVIEW_SETUP']);
  assert.deepEqual(el('DATA_BLOCKED_SETUP').blockers.map((b) => b.code), ['DATA_BLOCKED_SETUP']);
  assert.ok(validateMinConfig({ ...MIN_REFERENCE_CONFIG, ppClasses: ['CONFIRMED_MECHANICAL_SETUP', 'MANUAL_REVIEW_SETUP'] }).includes('PP_CLASSES_CONFIRMED_ONLY'));
  assert.equal(MIN_REFERENCE_CONFIG.riskFraction, 0.0125);
});

// ---------------------------------------------------------------- Kullamägi Episodic Pivot (C09)
const flat = (k, c) => bar(k, c, c * 1.015, c * 0.985, c);
function epBars(gapOpen = 22) { const b = []; for (let k = 0; k < 80; k++) b.push(flat(k, 20)); b.push(bar(80, gapOpen, 25, gapOpen - 0.1, 24.5, 5e6)); return b; }

test('CP-EP-STOP-1-5-ADR: Abstand zum Tagestief genau 1,5 ADR wird angenommen, darüber abgelehnt und nie enger ersetzt (KK-034)', () => {
  const eq = epStopCheck({ entry: 100, lowOfDay: 92.5, adrPct: 5 });
  assert.equal(eq.status, 'ACCEPT'); assert.equal(eq.distancePct, 7.5); assert.equal(eq.limitPct, 7.5);
  const wide = epStopCheck({ entry: 100, lowOfDay: 92.49, adrPct: 5 });
  assert.equal(wide.status, 'REJECT_WIDE_STOP'); assert.equal(wide.stop, 92.49);
  assert.equal(KK_PARAMS.epMaxAdr, 1.5);
});

test('CP-EP-GAP-SCREEN-10: Gap = Eröffnung / Vorschluss - 1 >= 10 % (gedruckte Größe als Screen-Konvention); Gleichheit mit der Grenze genügt, Daten des Gap-Tags nach der Eröffnung zählen nicht (KK-015, MA-EP-GAP-SCREEN)', () => {
  const g = 22 / 20 - 1; // 0,10000000000000009: 10 % exakt ist als Quotient nicht darstellbar
  const c = epChartCandidate(epBars(22), 80);
  assert.ok(c); assert.equal(c.gap, g);
  assert.ok(epChartCandidate(epBars(22), 80, { ...EP_REFERENCE_CONFIG, gapMin: g }), 'Grenze bitgenau gleich der Messgröße: >=');
  assert.equal(epChartCandidate(epBars(21.99), 80), null);
  assert.equal(epChartCandidate(epBars(22).slice(0, 64).concat([]), 63), null, 'weniger als 64 Vorsitzungen');
  assert.equal(EP_REFERENCE_CONFIG.gapMin, 0.10); assert.equal(KK_PARAMS.epGapReference, 0.10);
});

test('CP-EP-ORH-FILL-AND-LOD: Buy-Stop ein Roh-Cent über dem 1-Minuten-ORH; Fill max(Level, Minuteneröffnung); Stop = Tagestief vor der Kaufminute (KK-032, KK-034, MA-EP-ORH, MA-EP-FILL, MA-EP-LOD-AT-ENTRY)', () => {
  const cfg = EP_RUN_VARIANTS.find((v) => v.id === 'ALT-NO-VOLUME-RULE').config; // isoliert Einstieg und Stop
  const b = epBars(23), level = 23.2 + 0.01;
  const day1 = (m1) => [mm(0, 23, 23.2, 22.9, 23.1, 50000), m1, ...Array.from({ length: 10 }, (_, j) => mm(2 + j, 23.5, 23.6, 23.4, 23.5))];
  const t = resolveEpDay({ minutes: day1(mm(1, 23.1, level, 23.0, 23.15)), bar: b[80], rawFactor: 1, adrPct: 3, iexBaseline: null, cfg });
  assert.equal(t.status, 'FILLED'); assert.equal(t.fill, level); assert.equal(t.stop, 22.9); assert.equal(t.evidence.entryMinute, 1);
  assert.equal(t.sameDayStop, null);
  const gap = resolveEpDay({ minutes: day1(mm(1, 23.4, 23.5, 23.3, 23.45)), bar: b[80], rawFactor: 1, adrPct: 3, iexBaseline: null, cfg });
  assert.equal(gap.fill, 23.4, 'Minuteneröffnung über dem Level');
  const below = resolveEpDay({ minutes: day1(mm(1, 23.1, level - 1e-9, 23.0, 23.15)), bar: b[80], rawFactor: 1, adrPct: 3, iexBaseline: null, cfg });
  assert.equal(below.evidence.entryMinute, 2, 'Minute 1 erreicht das Level nicht');
  // das Tief der Kaufminute selbst ist kein Stop-Bestandteil; liegt es am Stop, gilt der Stop pessimistisch als getroffen
  const own = resolveEpDay({ minutes: day1(mm(1, 23.1, level, 22.5, 23.15)), bar: b[80], rawFactor: 1, adrPct: 3, iexBaseline: null, cfg });
  assert.equal(own.stop, 22.9); assert.equal(own.sameDayStop, 'CERTAIN'); assert.equal(own.evidence.fillMinuteStop, 'ASSUMED');
});

test('CP-EP-EXIT-MA20: Referenz verlässt die Position zur nächsten Eröffnung nach dem ersten Schluss unter der MA20; Schluss gleich MA20 nicht (KK-017, MA-EP-EXIT)', () => {
  // steigende Schlüsse 10, 11, …, 33 und Handelstag 24: MA20 und MA10 fallen auseinander (Schluss 24 = MA20 < MA10 28,5)
  const bars = Array.from({ length: 25 }, (_, k) => flat(k, 10 + k)), ctx = { bars };
  const run = (c) => { bars[24] = { ...bars[24], close: c }; const log = []; KK_EP_ADAPTER.onClose({}, ctx, 24, apiLog(log), EP_REFERENCE_CONFIG); return log; };
  assert.deepEqual(run(24), [], 'Schluss gleich MA20 (456 + 24) / 20 = 24, unter der MA10');
  assert.deepEqual(run(23.99), [['EXIT', 1, 'EP_CLOSE_BELOW_MA20']]);
  assert.deepEqual(run(30), [], 'über MA20 und MA10');
  assert.equal(EP_REFERENCE_CONFIG.exitMa, 20);
});

// ---------------------------------------------------------------- Kullamägi Parabolic Short (C10)
/** 60 ruhige Sitzungen bei 16, dann Schlüsse 20 / 25 / 31,25 (je +25 %, double-exakt), Handelstag 63. */
function psBars(closes = [20, 25, 31.25]) {
  const b = []; for (let k = 0; k < 60; k++) b.push(flat(k, 16));
  let p = 16; for (const c of closes) { b.push(bar(b.length, p, c * 1.005, p * 0.995, c)); p = c; }
  b.push(bar(b.length, 31, 31.5, 30, 30.2));
  return b;
}

test('CP-PS-STREAK-ACCEL: mindestens drei höhere Schlüsse, jede Rendite >= der vorigen (Gleichheit genügt), Summe >= 3 ADR20, Schluss über MA10; zwei Tage genügen nicht (KK-018, MA-PS-ACCELERATION)', () => {
  const c = psChartCandidate(psBars(), 63);
  assert.ok(c, 'drei gleiche Renditen von 25 %'); assert.equal(c.accelerating, true); assert.equal(c.upStreak, 3); assert.equal(c.streakReturnSum, 0.75);
  assert.equal(psChartCandidate(psBars([16, 20, 25]), 63), null, 'nur zwei höhere Schlüsse');
  const decel = psBars([20, 24, 30]); // +25 %, +20 %, +25 %
  assert.equal(psChartCandidate(decel, 63), null);
  assert.ok(psChartCandidate(decel, 63, PS_RUN_VARIANTS.find((v) => v.id === 'ALT-NO-ACCEL').config));
  assert.equal(PS_REFERENCE_CONFIG.streak, 3);
});

test('CP-PS-ORL5-FILL-HOD-STOP: Short ein Roh-Cent unter dem 5-Minuten-ORL ab Minute 5; Fill min(Level, Minuteneröffnung); Stop über dem Tageshoch vor der Kaufminute (KK-020, KK-022, MA-PS-ENTRY, MA-PS-FILL, MA-PS-STOP)', () => {
  const b = psBars()[63], cfg = PS_REFERENCE_CONFIG;
  const m0 = [mm(0, 31, 31.4, 30.8, 31.2), mm(1, 31.2, 31.3, 30.9, 31), mm(2, 31, 31.1, 30.85, 30.9), mm(3, 30.9, 31, 30.8, 30.95), mm(4, 30.95, 31.05, 30.9, 31)];
  const level = 30.8 - 0.01;
  const at = psEntry([...m0, mm(5, 30.85, 31.6, level, 30.8)], b, cfg, 1);
  assert.equal(at.status, 'FILLED'); assert.equal(at.fill, level); assert.equal(at.minuteIndex, 5); assert.equal(at.hodBefore, 31.4, 'Hoch der Kaufminute (31,6) zählt nicht');
  const gap = psEntry([...m0, mm(5, 30.5, 30.6, 30.4, 30.45)], b, cfg, 1);
  assert.equal(gap.fill, 30.5, 'Minuteneröffnung unter dem Level');
  assert.equal(psEntry([...m0, mm(5, 30.85, 30.9, level + 1e-9, 30.85)], b, cfg, 1).status, 'NOT_TRIGGERED');
});

test('CP-PS-COSTS-NO-BORROW: Short-Rendite mit 10 bps je Seite und 1 bp, ohne Leihgebühr; Borrow bleibt DATA_BLOCKED und kein Short ist ausführbar (KK-030, MA-PS-BORROW, MA-PS-COSTS)', () => {
  assert.ok(near(shortReturn(100, 90), (100 * 0.999 - 90 * 1.001 - 190 * 0.0001) / 100, 1e-15));
  assert.deepEqual({ ...PS_COSTS }, { slippageBps: 10, commissionBps: 1, borrowFee: 'DATA_BLOCKED_NOT_INCLUDED' });
  assert.deepEqual(validatePsConfig({ ...PS_REFERENCE_CONFIG, borrow: 'MODELLED' }), ['BORROW_IS_DATA_BLOCKED']);
  assert.equal(PS_EXECUTABLE_CLASS_ASSIGNABLE, false);
});

// ---------------------------------------------------------------- Pocket Pivot (C11)
/** 60 Sitzungen bei 101, Vortag 52 (Abwärtstag mit Volumen 1e6), Signaltag mit Schluss c und Volumen 2e6. */
function ppSignalBars(c = 100, { flatDayVolume = null, signalVolume = 2e6 } = {}) {
  const b = Array.from({ length: 60 }, (_, k) => bar(k, 101, 101.5, 100.5, 101));
  if (flatDayVolume !== null) b[55] = { ...b[55], volume: flatDayVolume }; // Schluss gleich dem Vortag: kein Abwärtstag
  b.push(bar(60, 101, 101.5, 51.5, 52));
  b.push(bar(61, 52, c + 0.5, 51.8, c, signalVolume));
  return b;
}

test('CP-PP-UP-DAY-STRICT: Signal- und Abwärtstage sind strikt (Schluss gleich Vortag ist keins von beiden); ein gleich schließender Tag mit hohem Volumen zählt nicht als Abwärtsvolumen (MOKAPP-003)', () => {
  assert.equal(pocketPivotAt(ppSignalBars(), 61).status, 'VOLUME_SIGNATURE');
  const flatDay = pocketPivotAt(ppSignalBars(100, { flatDayVolume: 9e6 }), 61);
  assert.equal(flatDay.status, 'VOLUME_SIGNATURE'); assert.equal(flatDay.maxDownVolume, 1e6); assert.equal(flatDay.downDays, 1);
  assert.equal(pocketPivotAt(ppSignalBars(52), 61).status, 'NOT_UP_DAY');
  // Volumen strikt über dem höchsten Abwärtsvolumen: Gleichheit wird abgelehnt
  const eqVol = pocketPivotAt(ppSignalBars(100, { signalVolume: 1e6 }), 61);
  assert.equal(eqVol.status, 'VOLUME_NOT_ABOVE_DOWN_VOLUME'); assert.equal(eqVol.volume, eqVol.maxDownVolume);
  assert.equal(pocketPivotAt(ppSignalBars(100, { signalVolume: 1e6 + 1 }), 61).status, 'VOLUME_SIGNATURE');
  assert.equal(MOKA_PARAMS.ppWindow, 10);
});

test('CP-PP-CONTEXT-MA50-STRICT: der Referenz-Proxy verlangt den Signalschluss strikt über der MA50; Gleichheit sperrt, ohne Proxy (Variante) nicht (MA-MOKA-CONTEXT-PROXY)', () => {
  // 48 x 101 + 52 + 100 = 5000 -> MA50 = 100 = Schluss
  const b = ppSignalBars(100);
  assert.equal(pocketPivotSignal(b, 61, PP_REFERENCE_CONFIG), null);
  assert.ok(pocketPivotSignal(b, 61, PP_RUN_VARIANTS.find((v) => v.id === 'ALT-CONTEXT-NONE').config));
  assert.ok(pocketPivotSignal(ppSignalBars(101), 61, PP_REFERENCE_CONFIG), 'Schluss 101 > MA50 100,02');
});

test('CP-PP-SELL-GUIDE-35: der 10DMA-Leitfaden gilt ab 35 respektierten Sitzungen (7 Wochen x 5), davor die 50DMA; Serie und Evidenz stimmen überein (MOKA12-008, MOKASTOP-001)', () => {
  const bars = Array.from({ length: 60 }, (_, k) => bar(k, 10 + k * 0.1, 10.2 + k * 0.1, 9.95 + k * 0.1, 10.1 + k * 0.1));
  const g = sellGuideSeries(bars, 'LATER_DAYS');
  assert.equal(g[42], 50, 'Sitzung 42: 34 Sitzungen seit der ersten MA10 (Index 9)'); assert.equal(g[43], 10);
  for (const k of [42, 43]) assert.equal(sellGuideEvidence(bars, k).readings.LATER_DAYS.proposedGuide, g[k] === 10 ? '10DMA' : '50DMA');
  assert.equal(MOKA_PARAMS.respectWeeks * MOKA_PARAMS.sessionsPerWeek, 35);
});

test('CP-PP-VIOLATION-STRICT-NO-STOP: kein Preisstop (Quelle ohne Stop); der Verletzungsauslöser ist das Tief des Verletzungstags und greift nur strikt darunter (MOKA12-009, MOKASTOP-002, MA-MOKA-VIOLATION-READING)', () => {
  const bars = Array.from({ length: 16 }, (_, k) => bar(k, 10 + k, 10.5 + k, 9.5 + k, 10 + k)); // Schlüsse 10..25
  bars[15] = bar(15, 21, 21.5, 18.5, 19); // MA10 = 19,9: Schluss 19 darunter
  const el = POCKET_PIVOT_ADAPTER.eligibility({ bars, i: 14 });
  assert.equal(el.order.type, 'ON_OPEN'); assert.equal(el.order.stop, null);
  const log = [], pos = { state: {}, trigger: null };
  POCKET_PIVOT_ADAPTER.onClose(pos, { bars, guide: new Array(16).fill(10) }, 15, apiLog(log), PP_REFERENCE_CONFIG);
  const t = log.find((x) => x[0] === 'TRIGGER')[1];
  assert.equal(t.level, 18.5); assert.equal(t.strict, true);
  assert.equal(protectiveHit({ stop: null, trigger: t }, { open: 19, high: 19.5, low: 18.5, close: 19 }), null, 'Tief gleich dem Auslöser');
  assert.deepEqual(protectiveHit({ stop: null, trigger: t }, { open: 19, high: 19.5, low: 18.49, close: 19 }), { fill: 18.5, reason: 'MOKA_MA10_VIOLATION' });
  assert.equal(PP_REFERENCE_CONFIG.violationReading, 'LATER_DAYS');
});

// ---------------------------------------------------------------- Holy Grail (C13)
/** 45 Sitzungen starker Aufwärtstrend (+1 je Sitzung), dann Rücklauf zur EMA20; liefert den ersten Berührungsbalken. */
function hgBars() {
  const b = [];
  for (let k = 0; k < 45; k++) { const c = 20 + k; b.push(bar(k, c - 0.5, c + 0.5, c - 0.8, c)); }
  for (let k = 45; k < 60; k++) { const c = 64 - (k - 44) * 1.2; b.push(bar(k, c + 0.6, c + 0.8, c - 0.6, c)); }
  return b;
}
const firstTouch = (b, P = HG_PARAMS) => [...holyGrailSetupSeries(b, HG_REFERENCE_CONFIG, P).keys()][0];

test('CP-HG-ADX-STRICT-30: ADX(14) muss strikt über der Grenze liegen; eine Grenze gleich dem ADX der Vorsitzung verhindert das Setup (RAS04-002)', () => {
  const b = hgBars(), i = firstTouch(b), { ADX } = adx(b);
  assert.ok(Number.isInteger(i) && ADX[i - 1] > 30, `Setup ${i}, ADX ${ADX[i - 1]}`);
  assert.equal(holyGrailSetupSeries(b, HG_REFERENCE_CONFIG, { ...HG_PARAMS, adxThreshold: ADX[i - 1] }).has(i), false, 'Gleichheit');
  assert.equal(holyGrailSetupSeries(b, HG_REFERENCE_CONFIG, { ...HG_PARAMS, adxThreshold: ADX[i - 1] - 1e-9 }).has(i), true);
  assert.deepEqual({ ...HG_PARAMS, osc: [...HG_PARAMS.osc] }, { adxPeriod: 14, adxThreshold: 30, ema: 20, osc: [3, 10], signal: 16 });
});

test('CP-HG-TOUCH-ORDER-STOP: ein Tief genau an der EMA20 ist eine Berührung; Buy-Stop ein Roh-Cent über dem Hoch des Berührungsbalkens, Stop = tiefstes Tief ab dem Impulshoch (RAS04-001, MA-RAS-PREVIOUS-BAR, MA-RAS-SWING-LOW)', () => {
  const b = hgBars(), i = firstTouch(b), ema = emaSeries(b.map((x) => x.close), 20);
  // Berührung genau an der EMA: das Tief des Balkens vor der ersten Berührung auf die EMA setzen
  const j = i - 1, eq = b.map((x, k) => (k === j ? { ...x, low: ema[j] } : x));
  assert.ok(b[j].low > ema[j]);
  const s = holyGrailSetupSeries(eq, HG_REFERENCE_CONFIG).get(j);
  assert.ok(s, 'Tief = EMA20 ist eine Berührung (<=)');
  const set = holyGrailSetupSeries(b, HG_REFERENCE_CONFIG).get(i);
  const el = HOLY_GRAIL_RESEARCH_ADAPTER.eligibility({ setup: set, bars: b, i, cfg: HG_REFERENCE_CONFIG });
  assert.equal(el.order.type, 'BUY_STOP'); assert.ok(near(el.order.level, b[i].high + 0.01)); assert.equal(el.order.stop, set.swingLow);
  const hiK = b.findIndex((x) => x.date === set.impulseHighDate);
  assert.equal(set.swingLow, Math.min(...b.slice(hiK, i + 1).map((x) => x.low)));
  // das Tief des Impulshoch-Balkens selbst ist das tiefste: es gehört zum Stop (ab dem Impulshoch einschließlich)
  const own = b.map((x, k) => (k === hiK ? { ...x, low: Math.min(...b.slice(hiK + 1, i + 1).map((y) => y.low)) - 0.2 } : x));
  const so = holyGrailSetupSeries(own, HG_REFERENCE_CONFIG).get(i);
  assert.ok(so && so.impulseHighDate === b[hiK].date, 'gleiches Setup und Impulshoch');
  assert.equal(so.swingLow, own[hiK].low);
  assert.ok(so.swingLow < Math.min(...own.slice(hiK + 1, i + 1).map((x) => x.low)));
});

test('CP-HG-EXIT-NEW-HIGH-STRICT: Ausstieg zur nächsten Eröffnung nach dem ersten Schluss strikt über dem Impulshoch; Schluss gleich dem Impulshoch nicht (RAS04-003, MA-RAS-EXIT)', () => {
  const bars = [bar(0, 60, 61, 59, 64.5)], pos = { trade: { setupEvidence: { impulseHigh: 64.5 } } };
  const run = (c) => { bars[0] = { ...bars[0], close: c }; const log = []; HOLY_GRAIL_RESEARCH_ADAPTER.onClose(pos, { bars }, 0, apiLog(log)); return log; };
  assert.deepEqual(run(64.5), []);
  assert.deepEqual(run(64.51), [['EXIT', 1, 'RAS_NEW_HIGH_EXIT']]);
});

// ---------------------------------------------------------------- Prüfplan ALL13 (vorregistriert) und Prüfprotokoll
// Vorregistrierung: eine Änderung am ALL13-Plan ändert diesen Wert und braucht einen eigenen, begründeten Commit.
const PINNED_ALL13_SHA256 = '69a2447dfcfb12dd7310cbcb255cba9987d535d8bfc5704c5bc7a23ef05f2626';
const CHECKER = path.join(path.dirname(ALL13_PLAN_FILE), 'cert-prep-all13.mjs');
const fileSha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('CP-PLAN-ALL13-VALID: der ALL13-Plan erweitert den unveränderten TOP5-Plan zu allen 13 Methoden und stimmt mit Verträgen, Parametern, #709-Wortlaut und Tests überein', async () => {
  const { issues, checks } = await validateAll13();
  assert.deepEqual(issues, []);
  assert.ok(checks.rules >= 130 && checks.params >= 70 && checks.psr709WordingUnchecked >= 50 && checks.mutationProbes >= 35, JSON.stringify(checks));
  assert.deepEqual((await validatePlan()).issues, [], 'TOP5 bleibt gültig');
  assert.equal(planContentSha256(loadPlan()), PINNED_PLAN_CONTENT_SHA256);
});

test('CP-PLAN-ALL13-PREREGISTERED: Plan gepinnt (Datei und Inhalt), alle 13 Methoden genau einmal, Reihenfolge der Matrix, VALIDATED_TRADE_SIGNAL gesperrt', () => {
  assert.equal(fileSha(ALL13_PLAN_FILE), PINNED_ALL13_SHA256);
  assert.equal(all13ContentSha256(loadAll13()), PINNED_ALL13_CONTENT_SHA256);
  const { plan } = mergePlans(loadPlan(), loadAll13());
  assert.deepEqual(plan.methods.map((m) => m.candidateId), ['C02', 'C01', 'C08', 'C12', 'C03', 'C07', 'C06', 'C13', 'C11', 'C05', 'C04', 'C09', 'C10']);
  assert.deepEqual([...ALL13_CANDIDATES].sort(), plan.methods.map((m) => m.candidateId).sort());
  assert.deepEqual(plan.methods.map((m) => m.priority), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(plan.guards.validatedTradeSignal, 'LOCKED_FOR_ALL_13');
  assert.equal(loadAll13().status, 'PREREGISTERED_NOT_ACTIVE');
});

const all13Has = async (fn, prefix, { base = null } = {}) => {
  const ext = loadAll13(); const b = loadPlan(); fn(ext, b);
  const { issues } = await validateAll13({ ext, base: base ?? b });
  assert.ok(issues.some((x) => x.startsWith(prefix)), `${prefix}: ${issues.join(' | ')}`);
  return issues;
};
const m13 = (p, id) => p.methods.find((m) => m.candidateId === id);

test('CP-PLAN-ALL13-DETECTS: Pin, geänderte TOP5-Basis, Parameter, Statuswechsel, Klassen, Renditeziele, Gegenproben und Lücken werden erkannt', async () => {
  await all13Has((e) => { e.methods[0].blockers[0].text += ' '; }, 'ALL13_PLAN_NOT_PINNED');
  await all13Has((e, b) => { b.methods[0].blockers[0].text += ' '; }, 'BASE_NOT_PINNED');
  await all13Has((e) => { m13(e, 'C04').params.find((p) => p.code.path === 'maWeeks').value = 31; }, 'PARAM_VALUE:C04');
  await all13Has((e) => { m13(e, 'C13').rules.find((r) => r.id === 'RAS-SF-ENTRY').status = 'SOURCE_EXACT'; }, 'RULE_STATUS:C13:RAS-SF-ENTRY');
  await all13Has((e) => { m13(e, 'C10').blockers.find((b) => b.id === 'C10-BORROW').class = 'a'; }, 'BLOCKER_CLASS');
  await all13Has((e) => { m13(e, 'C07').studies[0].acceptance.push({ metricKind: 'COUNT', criterion: 'Trefferquote mindestens 40 %' }); }, 'STUDY_PERFORMANCE_TARGET');
  await all13Has((e) => { e.mutationProbes = e.mutationProbes.filter((p) => p.test !== 'CP-HG-EXIT-NEW-HIGH-STRICT'); }, 'MUTATION_PROBE_MISSING:CP-HG-EXIT-NEW-HIGH-STRICT');
  await all13Has((e) => { e.mutationProbes[0].find = 'DIES STEHT NICHT IM CODE'; }, 'MUTATION_PROBE_FIND');
  await all13Has((e) => { e.methods = e.methods.filter((m) => m.candidateId !== 'C10'); }, 'ALL13_COVERAGE');
  await all13Has((e) => { m13(e, 'C06').psr709WordingUnchecked = []; }, 'PSR709_WORDING_UNCHECKED:MIN-TT-01');
  await all13Has((e) => { m13(e, 'C06').params.find((p) => p.code.path === 'aboveLow').kind = 'SOURCE_NUMBER'; }, 'PARAM_SOURCE_WORDING_UNCHECKED:C06:MIN-TT-06');
  // Review: ein Forschungsproxy ist auch als nur übersetzte Quellenzahl unzulässig
  await all13Has((e) => { m13(e, 'C07').params.find((p) => p.code.module === 'research/minervini-lifecycle.mjs' && p.code.path === 'riskFraction').kind = 'SOURCE_NUMBER_TRANSLATION_ONLY'; }, 'PARAM_KIND_MODEL_AS_SOURCE:C07:REFERENCE_CONFIG.riskFraction');
  await all13Has((e) => { e.paramsOutOfScopeSuperseded = []; }, 'PARAM_OOS_METHOD_IN_PLAN');
  await all13Has((e) => { m13(e, 'C11').conformanceTests = m13(e, 'C11').conformanceTests.filter((t) => !t.endsWith('CP-PP-SELL-GUIDE-35')); }, 'CONFORMANCE_MINIMUM:C11:CP-PP-SELL-GUIDE-35');
  await all13Has((e) => { m13(e, 'C05').rulesOutOfScope.find((r) => r.id === 'WEIN-SF-STAGE').reason = 'COVERED_IN:C08'; }, 'RULE_OOS_NOT_COVERED_THERE:C05:WEIN-SF-STAGE');
  // Review: übersetzter Wortlaut nur mit offenem CC-1 und einem echten CC-1-Blocker der Klasse d
  await all13Has((e) => { const m = m13(e, 'C06'); m.ccOpen = m.ccOpen.filter((x) => x !== 'CC-1'); m.ccMet.push('CC-1'); }, 'PSR709_WORDING_UNCHECKED:MIN-TT-01');
  await all13Has((e) => { m13(e, 'C07').wordingUncheckedBlocker = 'C07-TYPO'; }, 'PARAM_TRANSLATION_KIND:C07:MIN-PP-02');
  await all13Has((e) => { e.findings.push({ ...e.findings[0], id: 'F-TUR-ADD-UNIT-N' }); }, 'MERGE_DUPLICATE_FINDING:F-TUR-ADD-UNIT-N');
  await all13Has((e) => { e.mutationProbes[0].file = '../certification/cert-prep-top5.mjs'; }, 'MUTATION_PROBE_SCOPE');
});

test('CP-PLAN-ALL13-PROBE-REFUSAL: Gegenproben schreiben nie, wenn eine Probe statisch fehlerhaft ist (Bereich, Fundstelle)', () => {
  for (const change of [(e) => { e.mutationProbes[0].file = '../certification/cert-prep-top5.mjs'; }, (e) => { e.mutationProbes[0].find = 'return'; }]) {
    const ext = loadAll13(); change(ext);
    const before = fs.readFileSync(path.join(path.dirname(ALL13_PLAN_FILE), 'cert-prep-top5.mjs'), 'utf8');
    assert.throws(() => runMutationProbes(ext), /MUTATION_PROBES_REFUSED_STATIC/);
    assert.equal(fs.readFileSync(path.join(path.dirname(ALL13_PLAN_FILE), 'cert-prep-top5.mjs'), 'utf8'), before);
  }
});

test('CP-PLAN-ALL13-REPORT: das Prüfprotokoll ist deterministisch, ohne Zeitstempel und schreibt nur mit --out', async () => {
  const a = await all13Report(), b = await all13Report();
  assert.deepEqual(a, b); assert.equal(a.valid, true, a.issues.join(' | '));
  assert.doesNotMatch(JSON.stringify(a), /"(generatedAt|timestamp|date)"/);
  assert.equal(a.methods.length, 13); assert.equal(a.mutationProbes, 'NOT_RUN (--mutation-probes)');
  const byId = Object.fromEntries(a.methods.map((m) => [m.candidateId, m]));
  assert.deepEqual(byId.C09.ccOpen, ['CC-1', 'CC-2', 'CC-3', 'CC-4', 'CC-5', 'CC-6', 'CC-7', 'CC-8']);
  assert.equal(a.referenceCode.C06.state, 'HEAD_EQUALS_PINNED_REFERENCE_FINGERPRINT');
  assert.equal(a.referenceCode.C04.state, 'REFERENCE_FINGERPRINT_NOT_PINNED_REFERENCE_COMMIT_OPEN');
  assert.equal(a.referenceCode.C09.state, 'NOT_IN_SF6_PAPER_2027_NO_PINNED_REFERENCE');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-prep-all13-'));
  try {
    const r = spawnSync(process.execPath, [CHECKER, '--out', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fs.readdirSync(tmp), ['CERT-PREP-ALL13-CHECK.json']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'CERT-PREP-ALL13-CHECK.json'), 'utf8')), JSON.parse(JSON.stringify(a)));
    assert.equal(all13OutTarget(path.join(tmp, 'x.json')), path.join(tmp, 'x.json'));
    assert.equal(spawnSync(process.execPath, [CHECKER, '--out'], { encoding: 'utf8' }).status, 1);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
