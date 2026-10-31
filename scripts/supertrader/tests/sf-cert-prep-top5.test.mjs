// Supertrader 9 – Zertifizierungsvorbereitung der fünf zuerst zu prüfenden Methoden (C02 Turtle S2, C01 Turtle S1,
// C08 Kullamägi Breakout, C12 Buyable Gap-Up, C03 Darvas). Regeltreue-Prüfungen mit synthetischen Balken, die die
// bestehenden Golden Cases an den Grenzen ergänzen (Fensterlänge, Gleichheit an der Schwelle, N der Vorsitzung,
// Gap durch den Stop, Messgrößen). Kein Test ändert eine Regel oder einen Parameter; keine Marktdaten, kein Schreiben.
// Plan und Abnahmekriterien: scripts/supertrader/source-faithful/certification/CERT-PREP-TOP5-PLAN.json,
// Bericht: docs/SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPlan, validatePlan, planSha256, planContentSha256, certPrepReport, isPerformanceTarget, outTarget, PLAN_FILE, PINNED_PLAN_CONTENT_SHA256 } from '../source-faithful/certification/cert-prep-top5.mjs';
import { SF6_PAPER_PROTOCOL, sf6PaperProtocolSha256 } from '../source-faithful/completion/sf6-paper-protocol-2027.mjs';
import { turtleN, entryTrigger, runTurtle, PARAMS } from '../source-faithful/methods/turtle.mjs';
import { darvasEvents, darvasPosition, DARVAS_PARAMS } from '../source-faithful/methods/darvas.mjs';
import { breakoutStopCheck, stopMarketFill, KK_PARAMS } from '../source-faithful/methods/kullamagi.mjs';
import { kkBreakoutSetupAt, KK_SETUP_PROXIES, KK_BREAKOUT_ADAPTER } from '../source-faithful/research/kk-breakout-lifecycle.mjs';
import { gapUpAt, atrBefore, MOKA_PARAMS } from '../source-faithful/methods/morales-kacher.mjs';
import { fillOrder, protectiveHit, plannedShares, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from '../source-faithful/research/lifecycle-engine.mjs';
import { REFERENCE_COSTS } from '../source-faithful/research/sf6-references.mjs';
import { SF6_VALIDATION_PROTOCOL } from '../source-faithful/research/run-sf6-validation.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const day = (k) => new Date(Date.UTC(2020, 0, 1) + k * 864e5).toISOString().slice(0, 10);

// ---------------------------------------------------------------- Turtle (C02 / C01)
const tbars = (rows, { volume = 1e6 } = {}) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume, rawClose: c, rawVolume: volume, splitAdj: 1, dividend: 0 }));
const flat = (n, p = 100, r = 5) => Array.from({ length: n }, () => [p, p + r, p - r, p]);
const dataOf = (secs) => ({ calendar: [...new Set(secs.flatMap((s) => s.bars.map((b) => b.date)))].sort(), securities: secs.map((s) => ({ terminal: null, ...s })) });
const runT = (b, opts = {}) => runTurtle(dataOf([{ id: 'A', bars: b }]), { system: 'S2', from: b[0].date, ...opts });

test('CP-TUR-S2-WINDOW-55: der 55-Tage-Kanal umfasst genau die 55 Sitzungen vor dem Balken (TUR-S2ENT)', () => {
  // Balken i = 60; Fenster i-55 .. i-1 = 5 .. 59. Ein Hoch 110 auf Index 4 liegt außerhalb, auf Index 5 innerhalb.
  for (const [k, want] of [[4, 105.01], [5, 110.01]]) {
    const rows = flat(60); rows[k] = [100, 110, 95, 100];
    const b = tbars([...rows, [100, 111, 99, 110]]);
    const e = entryTrigger(b, 60, 'S2', null);
    assert.ok(e && near(e.trigger, want), `Spitze auf Index ${k}: ${e?.trigger}`);
    assert.equal(e.path, 'S2');
  }
  assert.equal(PARAMS.S2.entry, 55);
});

test('CP-TUR-S2-TRIGGER-ONE-TICK: genau ein Tick über dem Kanalhoch löst aus, das Kanalhoch selbst nicht (TUR-S2ENT, TUR-INTRADAY)', () => {
  const at = tbars([...flat(60), [100, 105, 99, 104]]), above = tbars([...flat(60), [100, 105.01, 99, 104]]);
  assert.equal(entryTrigger(at, 60, 'S2', null), null);
  assert.ok(near(entryTrigger(above, 60, 'S2', null).trigger, 105.01));
});

test('CP-TUR-S2-NO-SKIP-NO-FAILSAFE: System 2 nimmt jeden 55-Tage-Ausbruch, auch nach einem Gewinner oder offenen Ausbruch; es gibt keinen Failsafe-Pfad (TUR-S2NOSKIP)', () => {
  const b = tbars([...flat(60), [100, 106, 99, 105]]);
  for (const before of [null, 'WINNER', 'OPEN', 'LOSER', 'NON_LOSER']) {
    const e = entryTrigger(b, 60, 'S2', before);
    assert.equal(e.path, 'S2', String(before)); assert.equal(e.skipped, false);
  }
  assert.equal(PARAMS.S2.filter, false); assert.equal(PARAMS.S2.failsafe, null);
  const r = runT(b);
  assert.equal(r.counts.skippedByFilter, 0); assert.equal(r.counts.failsafeEntries, 0);
  assert.deepEqual(r.filterCounts, {}, 'S2 führt keinen Filter-Tracker');
});

test('CP-TUR-S2-EXIT-WINDOW-20: der Ausstieg nutzt das Tief der 20 Sitzungen vor dem Balken, ein Tief davor zählt nicht (TUR-S2EX)', () => {
  // Einstieg auf Index 60 (105,01). Ausstiegsbalken auf Index 66 mit Tief 94,99 = 20-Tage-Tief 95 minus 1 Tick.
  // Ein Tief 90 auf Index 45 liegt im Fenster 46..65 nicht mehr: Ausstieg. Auf Index 46 liegt es darin: kein Ausstieg.
  const build = (dipAt) => {
    const rows = flat(60); rows[dipAt] = [100, 105, 90, 100];
    for (let k = 0; k < 5; k++) rows.push(k === 0 ? [100, 106, 99, 105] : [100, 104, 96, 100]);
    rows.push([100, 101, 99, 100]); // Index 65
    rows.push([96, 97, 94.99, 95]); // Index 66: Ausstiegsbalken
    return tbars(rows);
  };
  const out = runT(build(45)), held = runT(build(46));
  assert.equal(out.positionTrades.length, 1);
  assert.equal(out.positionTrades[0].reason, 'EXIT_20D'); assert.equal(out.positionTrades[0].exitDate, day(66));
  const sell = out.ledger.find((x) => x.side === 'SELL');
  assert.ok(near(sell.price, 94.99 * (1 - REFERENCE_COSTS.slippageBps / 1e4), 1e-9), String(sell.price));
  assert.equal(held.positionTrades.length, 0, 'Tief 90 im Fenster: Ausstiegsniveau 89,99 nicht erreicht');
  assert.equal(PARAMS.S2.exit, 20);
});

test('CP-TUR-STOP-2N-PRIOR-CLOSE-N: der Stop liegt 2 N der Vorsitzung unter dem Fill, nicht 2 N des Einstiegsbalkens; ein Gap durch den Stop füllt zur Eröffnung (TUR-STOP, TUR-SF-UNIT)', () => {
  // Ein frühes Tief 70 (Index 45) hebt N an und hält das 20-Tage-Tief tief, damit der Kanal nicht vor dem Stop greift.
  const rows = flat(60); rows[45] = [100, 105, 70, 100];
  rows.push([100, 106, 99, 105.5]); // Index 60: Einstieg 105,01, TR 7 < N, also N[60] < N[59]
  const N = turtleN(tbars(rows));
  const right = 105.01 - PARAMS.stopN * N[59], wrong = 105.01 - PARAMS.stopN * N[60];
  assert.ok(wrong - right > 0.2, `Unterscheidbarkeit ${right} / ${wrong}`);
  const mid = (right + wrong) / 2;
  // Index 61: Tief zwischen den beiden Lesarten -> mit N der Vorsitzung kein Stop
  const r1 = runT(tbars([...rows, [100, 101, mid, 100]]));
  assert.equal(r1.unitTrades.length, 0, `Stop ${right} darf bei Tief ${mid} nicht greifen`);
  // Index 62: Gap-Eröffnung 80 unter den Stop -> Ausstieg zur Eröffnung, nicht zum Stop (min(open, stop))
  const r2 = runT(tbars([...rows, [100, 101, mid, 100], [80, 82, 79, 81]]));
  assert.equal(r2.unitTrades.length, 1);
  assert.equal(r2.unitTrades[0].reason, 'STOP_2N_UNIT');
  assert.ok(near(r2.unitTrades[0].exitPrice, 80 * (1 - REFERENCE_COSTS.slippageBps / 1e4), 1e-9), String(r2.unitTrades[0].exitPrice));
  // Index 62 ohne Gap: Tief genau am Stop -> Ausstieg am Stop
  const r3 = runT(tbars([...rows, [100, 101, mid, 100], [95, 96, right, 90]]));
  assert.ok(near(r3.unitTrades[0].exitPrice, right * (1 - REFERENCE_COSTS.slippageBps / 1e4), 1e-9));
});

test('CP-TUR-S1-WINDOWS: System 1 nutzt 20 Tage Einstieg, 10 Tage Ausstieg und 55 Tage Failsafe (TUR-S1ENT, TUR-S1EX, TUR-FAILSAFE)', () => {
  assert.deepEqual({ ...PARAMS.S1 }, { entry: 20, exit: 10, filter: true, failsafe: 55 });
  // 20-Tage-Fenster: eine Spitze auf i-21 zählt nicht, auf i-20 zählt sie
  for (const [k, want] of [[39, 105.01], [40, 110.01]]) {
    const rows = flat(60); rows[k] = [100, 110, 95, 100];
    const e = entryTrigger(tbars([...rows, [100, 111, 99, 110]]), 60, 'S1', null);
    assert.ok(near(e.trigger, want), `Index ${k}: ${e.trigger}`);
  }
});

test('CP-TUR-COSTS-REFERENCE: die Referenz bucht 10 bps Slippage je Seite und 1 bp Kommission (research-v1; MA nicht aus der Quelle)', () => {
  const r = runT(tbars([...flat(60), [100, 106, 99, 105]]));
  const buy = r.ledger.find((x) => x.side === 'BUY');
  assert.ok(near(buy.price, 105.01 * 1.001, 1e-9));
  assert.ok(near(buy.fee, buy.gross * 1e-4, 1e-9));
  assert.deepEqual({ ...REFERENCE_COSTS }, { slippageBps: 10, commissionBps: 1 });
});

// ---------------------------------------------------------------- Kullamägi Breakout (C08)
const kbar = (k, o, h, l, c, v = 1e6) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: v, rawClose: c, rawVolume: v, splitAdj: 1 });
/** 0..69 Basis (Tief 100), 70 Konsolidierungsbeginn mit Schluss `base`, 70..79 Hoch `top`, 80 Ausbruchsbalken mit Schluss `breakClose`. */
function kkSetupBars({ base = 130, top = 131, breakClose = 132, spike = null } = {}) {
  const b = [];
  for (let k = 0; k < 70; k++) b.push(kbar(k, 101, 102, 100, 101));
  for (let k = 70; k < 80; k++) b.push(kbar(k, 129.5, top, 128, k === 70 ? base : 129.8));
  b.push(kbar(80, 130, breakClose + 0.5, 129.5, breakClose));
  if (spike) b[spike.at] = { ...b[spike.at], high: spike.high };
  return b;
}

test('CP-KK-SETUP-PRIOR-MOVE-BOUND: die Vorbewegung von genau 30 % genügt dem Modell-Proxy, knapp darunter nicht (MA-KK-SETUP-PROXY, untere Druckgrenze von KK-006)', () => {
  const P = KK_SETUP_PROXIES.NO_MA_CONDITION; // isoliert die Vorbewegung
  // Die Engine rechnet priorMove = Schluss[Konsolidierungsbeginn] / Tief - 1 und verlangt priorMove >= proxy.priorMove.
  // Gleichheit mit der Modellgrenze 0,30 ist in double unerreichbar: für Schluss/Tief in [1, 2) ist Schluss/Tief - 1
  // ein Vielfaches von 2^-52, 0,30 (= 0,29999999999999998890) nicht. Der kleinste erreichbare Wert darüber ist
  // 1,3 - 1 = 0,30000000000000004 (130 / 100), der größte darunter 0,2999999999999998 (nächstkleinerer double von 130).
  const ok = kkBreakoutSetupAt(kkSetupBars({ base: 130 }), 80, P);
  assert.ok(ok, 'Schluss 130 / Tief 100 = +30 %');
  assert.equal(ok.priorMove, 130 / 100 - 1);
  assert.equal(kkBreakoutSetupAt(kkSetupBars({ base: 129.99999999999997 }), 80, P), null, 'nächstkleinerer double: 0,2999999999999998');
  assert.equal(kkBreakoutSetupAt(kkSetupBars({ base: 129.99 }), 80, P), null);
  // Vergleichsoperator an exakter Gleichheit: eine Grenze, die bitgenau der berechneten Größe entspricht, wird
  // angenommen (>=); eine strikte Lesart (>) lehnt sie ab. Zwei Fälle: die berechnete Größe von 130 / 100 und die
  // binär exakte Grenze 0,25 (125 / 100 - 1 === 0,25). Die Modellgrenze selbst bleibt 0,30 (unverändert).
  for (const [base, bound, below] of [[130, 130 / 100 - 1, 129.99999999999997], [125, 0.25, 124.99999999999999]]) {
    const proxy = { ...P, priorMove: bound };
    const hit = kkBreakoutSetupAt(kkSetupBars({ base }), 80, proxy);
    assert.ok(hit, `Gleichheit priorMove === ${bound} muss genügen`);
    assert.equal(hit.priorMove, bound, 'berechnete Größe gleich der Grenze');
    assert.equal(kkBreakoutSetupAt(kkSetupBars({ base: below }), 80, proxy), null, `knapp unter ${bound}`);
  }
  assert.equal(KK_SETUP_PROXIES.CONSOLIDATION_10.priorMove, 0.30);
  assert.equal(KK_SETUP_PROXIES.CONSOLIDATION_10.priorMoveSessions, 63);
});

test('CP-KK-SETUP-LEVEL: Ausbruch = Schluss strikt über dem Hoch der 10 Sitzungen vor dem Balken; ein Hoch auf i-11 zählt nicht (MA-KK-SETUP-PROXY CONSOLIDATION_10)', () => {
  const P = KK_SETUP_PROXIES.NO_MA_CONDITION;
  assert.equal(kkBreakoutSetupAt(kkSetupBars({ breakClose: 131 }), 80, P), null, 'Schluss gleich dem Niveau ist kein Ausbruch');
  assert.ok(kkBreakoutSetupAt(kkSetupBars({ breakClose: 131.01 }), 80, P));
  const outside = kkBreakoutSetupAt(kkSetupBars({ spike: { at: 69, high: 140 } }), 80, P);
  assert.ok(outside && outside.level === 131, 'Index 69 liegt vor dem Fenster 70..79');
  assert.equal(kkBreakoutSetupAt(kkSetupBars({ spike: { at: 70, high: 140 } }), 80, P), null, 'Index 70 liegt im Fenster: Niveau 140');
  assert.equal(KK_SETUP_PROXIES.CONSOLIDATION_10.window, 10);
});

test('CP-KK-SETUP-MA-RISING: der Referenz-Proxy verlangt steigende MA10 und MA20 zum Vortagesschluss (KK-009, Steigungsfenster 5 Sitzungen = VU-Konvention)', () => {
  // flache Konsolidierung über einer flachen Basis: MA10 steigt (Sprung auf 130), MA20 ebenfalls; mit fallender Konsolidierung nicht
  const rising = kkSetupBars();
  assert.ok(kkBreakoutSetupAt(rising, 80, KK_SETUP_PROXIES.CONSOLIDATION_10));
  const falling = kkSetupBars();
  for (let k = 70; k < 80; k++) falling[k] = { ...falling[k], close: 130 - (k - 70) * 0.2, low: 127 };
  for (let k = 50; k < 70; k++) falling[k] = { ...falling[k], close: 140, high: 141, low: 100 };
  assert.equal(kkBreakoutSetupAt(falling, 80, KK_SETUP_PROXIES.CONSOLIDATION_10), null);
  assert.ok(kkBreakoutSetupAt(falling, 80, KK_SETUP_PROXIES.NO_MA_CONDITION), 'ohne MA-Bedingung bleibt der Ausbruch');
});

test('CP-KK-STOP-ADR-BOUNDARY: Abstand gleich ADR wird angenommen, größer abgelehnt und nie enger ersetzt (KK-012)', () => {
  const eq = breakoutStopCheck({ entry: 100, lowOfDay: 95, adrPct: 5 });
  assert.equal(eq.status, 'ACCEPT'); assert.equal(eq.stop, 95);
  const wide = breakoutStopCheck({ entry: 100, lowOfDay: 94.99, adrPct: 5 });
  assert.equal(wide.status, 'REJECT_WIDE_STOP'); assert.equal(wide.stop, 94.99, 'kein Ersatzstop');
  assert.equal(breakoutStopCheck({ entry: 100, lowOfDay: 100, adrPct: 5 }).status, 'STOP_NOT_BELOW_ENTRY');
  assert.equal(breakoutStopCheck({ entry: 100, lowOfDay: 95, adrPct: null }).status, 'INSUFFICIENT_DATA');
});

test('CP-KK-NEXT-OPEN-PLANNED-LOSS: Referenz NEXT_OPEN füllt zur Eröffnung, wenn 1 - Stop/Eröffnung <= ADR20; darüber und an/unter dem Stop wird nicht ausgeführt (MA-KK-ENTRY-TIMING)', () => {
  const order = (open) => fillOrder({ date: day(1), open, high: open + 1, low: open - 0.5, close: open, volume: 1e6 }, { type: 'ON_OPEN', stop: 95, maxPlannedLoss: 0.05 });
  const at = order(100); // 1 - 95/100 = 0,05
  assert.equal(at.status, 'FILLED'); assert.equal(at.fill, 100); assert.equal(at.basis, 'OPEN');
  assert.equal(order(100.1).status, 'NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX');
  assert.equal(order(95).status, 'NOT_EXECUTED_PRICE_AT_OR_BELOW_STOP');
  assert.equal(fillOrder({ date: day(1), open: 100, high: 101, low: 99, close: 100, synthetic: true }, { type: 'ON_OPEN', stop: 95 }).status, 'NOT_EXECUTED_NO_SOURCE_BAR');
});

test('CP-KK-STOP-MARKET-AND-CAP: Stop-Market füllt nach Gap zur Eröffnung (KK-027); Größe <= 30 % Quelle und <= 25 % Plattform (KK-001)', () => {
  assert.deepEqual(stopMarketFill(95, 93), { fill: 93, gapped: true });
  assert.deepEqual(stopMarketFill(95, 96), { fill: 95, gapped: false });
  assert.equal(KK_PARAMS.overnightCap, 0.30); assert.equal(KK_BREAKOUT_ADAPTER.sourceMaxPositionWeight, 0.30);
  const p = plannedShares({ sizing: { mode: 'RISK', riskFraction: 0.005 }, fill: 100, stop: 99.9, equity: 100000, policy: PLATFORM_RESEARCH_PORTFOLIO_POLICY, sourceMaxPositionWeight: 0.30 });
  assert.equal(p.cap, 0.25); assert.equal(p.shares, 250); assert.equal(p.cappedByMaxWeight, true);
});

// ---------------------------------------------------------------- Buyable Gap-Up (C12)
/** 60 Sitzungen mit TR 4 (Hoch 102, Tief 98, Schluss 100, Volumen 1e6), dann der Gap-Tag. */
function bguBars({ open = 103, low = 102.5, high = 106, close = 105, volume = 1.5e6, prep = null } = {}) {
  const b = Array.from({ length: 60 }, (_, k) => kbar(k, 100, 102, 98, 100));
  if (prep) prep(b);
  b.push(kbar(60, open, high, low, close, volume));
  return b;
}

test('CP-BGU-GAP-EXACT: Gap gleich 0,75 x ATR40 ist ein Kandidat, knapp darunter nicht (MOKA12-004, >=)', () => {
  const at = gapUpAt(bguBars({ open: 103 }), 60);
  assert.equal(at.atr40, 4); assert.equal(at.gap, 3); assert.equal(at.gapInAtr, 0.75);
  assert.equal(at.status, 'GAP_AND_STANDARD_VOLUME');
  assert.equal(gapUpAt(bguBars({ open: 102.99 }), 60).status, 'GAP_BELOW_0_75_ATR40');
  assert.equal(MOKA_PARAMS.gapAtr, 0.75); assert.equal(MOKA_PARAMS.atrSessions, 40);
});

test('CP-BGU-GAP-MEASURE: Gap = Eröffnung minus Vortagesschluss, auch ohne vollständige Kurslücke; die volle Lücke wird nur berichtet (MOKA-SF-BGU-GAP-MEASURE, Ableitung)', () => {
  const r = gapUpAt(bguBars({ open: 103, low: 101 }), 60); // Tief 101 unter dem Vortageshoch 102
  assert.equal(r.status, 'GAP_AND_STANDARD_VOLUME');
  assert.equal(r.fullGap, -1);
});

test('CP-BGU-ATR-SIMPLE-MEAN: ATR40 ist der einfache Mittelwert der True Range der 40 Sitzungen vor dem Gap-Tag (keine Wilder-Glättung, kein Gap-Tag)', () => {
  const b = bguBars({ prep: (x) => { x[30] = { ...x[30], high: 122 }; } }); // TR 24 auf Index 30 (im Fenster 20..59)
  let s = 0; for (let k = 20; k < 60; k++) { const pc = b[k - 1].close; s += Math.max(b[k].high - b[k].low, b[k].high - pc, pc - b[k].low); }
  assert.ok(near(atrBefore(b, 60), s / 40));
  assert.ok(near(atrBefore(b, 60), (39 * 4 + 24) / 40));
  const outside = bguBars({ prep: (x) => { x[19] = { ...x[19], high: 122 }; } });
  assert.equal(atrBefore(outside, 60), 4, 'Index 19 liegt vor dem Fenster');
});

test('CP-BGU-VOLUME-WINDOW-50: das Volumenverhältnis nutzt die 50 Sitzungen vor dem Gap-Tag; 1,5x genügt (MOKA24-VOL; Fenster = Owner-Konvention D-BGU-VOLWINDOW)', () => {
  const big = (at) => bguBars({ prep: (x) => { x[at] = { ...x[at], volume: 51e6 }; } });
  assert.equal(gapUpAt(big(9), 60).volumeRatio, 1.5, 'Index 9 liegt vor dem Fenster 10..59');
  assert.ok(gapUpAt(big(10), 60).volumeRatio < 1.5);
  assert.equal(gapUpAt(big(10), 60).status, 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW', 'unter dem Standard geht der Fall in die Prüfung, keine Ablehnung (MOKA24-MEGA)');
  assert.equal(gapUpAt(bguBars({ volume: 1.4999e6 }), 60).status, 'VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW');
  assert.equal(MOKA_PARAMS.volumeWindow, 50); assert.equal(MOKA_PARAMS.volumeRatio, 1.5);
});

test('CP-BGU-STOP-AT-GAP-DAY-LOW: der Stop-Market am Gap-Tagestief füllt am Niveau oder nach Gap zur Eröffnung (MA-MOKA-BGU-STOP, MOKA12-007)', () => {
  const pos = { stop: 102.5, stopReason: 'INITIAL_STOP', trigger: null };
  assert.deepEqual(protectiveHit(pos, { open: 104, high: 104.5, low: 102.5, close: 103 }), { fill: 102.5, reason: 'INITIAL_STOP' });
  assert.deepEqual(protectiveHit(pos, { open: 101, high: 101.5, low: 100, close: 101 }), { fill: 101, reason: 'INITIAL_STOP_GAP_OPEN' });
  assert.equal(protectiveHit(pos, { open: 104, high: 105, low: 102.51, close: 104 }), null);
});

// ---------------------------------------------------------------- Darvas (C03)
const hl = (h, l, o = (h + l) / 2, c = (h + l) / 2) => [o, h, l, c];
const dbars = (rows) => rows.map(([o, h, l, c], k) => ({ date: day(k), open: o, high: h, low: l, close: c, volume: 1000 + k, splitAdj: 1 }));
const boxAfterTop = (x) => [hl(x + 0.9, x + 0.5), hl(x + 0.9, x + 0.6), hl(x + 0.9, x + 0.6), hl(x + 0.9, x + 0.6)];
const breakout = (x) => [x + 1.05, x + 1.6, x + 1.05, x + 1.5];
const STAIR = [hl(9, 8.5), hl(11, 10.6), ...boxAfterTop(10), breakout(10), ...boxAfterTop(10.6), breakout(10.6), ...boxAfterTop(11.2)];

test('CP-DAR-STOP-NEVER-INSIDE-NEW-BOX: Initialstop unter dem durchbrochenen Deckel, jede Anhebung unter dem Boden der neuen Box, nie gesenkt (DAR-Q5, DAR-Q6, DAR-Q7, Lesart: Box = die neue Box)', () => {
  const b = dbars([...STAIR, hl(12.3, 12.0)]);
  const { events, boxes } = darvasEvents(b);
  const p = darvasPosition(b, events.find((e) => e.type === 'BREAKOUT'));
  const init = p.path[0];
  assert.equal(init.ruleId, 'DAR-SF-STOP-INIT');
  assert.ok(init.stop < boxes[0].top && near(init.stop, boxes[0].top - 0.01));
  let prev = init.stop;
  for (const x of p.path.filter((q) => q.ruleId === 'DAR-SF-STOP-RAISE')) {
    assert.ok(x.stop < x.boxBottom, `Stop ${x.stop} liegt unter dem Boden ${x.boxBottom}`);
    assert.ok(near(x.stop, x.boxBottom - 0.01));
    assert.ok(x.stop > prev, 'nur Anhebungen'); prev = x.stop;
  }
  assert.ok(p.path.length >= 3);
});

test('CP-DAR-THREE-DAYS-CONSECUTIVE: der Deckel steht erst nach drei aufeinanderfolgenden Sitzungen ohne Berührung (DAR-Q1, drei Tage)', () => {
  assert.equal(DARVAS_PARAMS.confirmDays, 3);
  const two = darvasEvents(dbars([hl(10, 9), hl(12, 11), hl(11.5, 11), hl(11.6, 11)])).events.map((e) => e.type);
  assert.ok(!two.includes('TOP_CONFIRMED'), 'nach zwei Sitzungen noch nicht');
  const three = darvasEvents(dbars([hl(10, 9), hl(12, 11), hl(11.5, 11), hl(11.6, 11), hl(11.7, 11)])).events;
  assert.equal(three.find((e) => e.type === 'TOP_CONFIRMED').i, 4);
  const touched = darvasEvents(dbars([hl(10, 9), hl(12, 11), hl(11.5, 11), hl(12, 11), hl(11.6, 11), hl(11.7, 11)])).events;
  assert.ok(!touched.some((e) => e.type === 'TOP_CONFIRMED'), 'Berührung auf Index 3 startet die Zählung neu');
});

test('CP-DAR-SAME-BAR-BREAKOUT-AND-FAIL: ein Balken über dem Trigger und unter dem Boden gilt als Ausbruch und wird am Einstiegsbalken pessimistisch ausgestoppt (Konvention, gezählt)', () => {
  const rows = [hl(9, 8.5), hl(11, 10.6), ...boxAfterTop(10), [10.8, 11.2, 10.4, 10.5]]; // Box 11 / 10,5; Hoch 11,2 > 11,01, Tief 10,4 < 10,5
  const b = dbars(rows), ev = darvasEvents(b).events, last = ev.filter((e) => e.i === b.length - 1).map((e) => e.type);
  assert.ok(last.includes('BREAKOUT') && !last.includes('BOX_FAILED'), last.join(','));
  const p = darvasPosition(b, ev.find((e) => e.type === 'BREAKOUT'));
  assert.equal(p.entryBarStop, true); assert.equal(p.exit.reason, 'STOP_ENTRY_BAR_PESSIMISTIC');
});

// ---------------------------------------------------------------- gemeinsame Ausführungsannahmen
test('CP-EXEC-COSTS-AND-POLICY: Referenzkosten, Kostenstufen und Plattformgrenzen sind die vorregistrierten Werte (keine Quellenregel)', () => {
  assert.deepEqual(SF6_VALIDATION_PROTOCOL.costLevels.map((c) => [c.id, c.slippageBps, c.commissionBps]), [['COST-0', 0, 0], ['REF', 10, 1], ['COST-20', 20, 2], ['COST-50', 50, 5]]);
  const P = PLATFORM_RESEARCH_PORTFOLIO_POLICY;
  assert.deepEqual([P.slippageBps, P.commissionBps, P.maxPositionWeight, P.maxOpenPositions, P.cashOnly], [10, 1, 0.25, 20, true]);
});

test('CP-EXEC-BUY-STOP-FILL: Buy-Stop füllt nach Gap zur Eröffnung, sonst am Niveau; ein Balken ohne Erreichen löst nichts aus (Darvas, Lifecycle-Engine)', () => {
  const o = { type: 'BUY_STOP', level: 11.01, stop: 10.99 };
  assert.equal(fillOrder({ open: 11.2, high: 11.5, low: 11.1, close: 11.4 }, o).fill, 11.2);
  const t = fillOrder({ open: 10.9, high: 11.5, low: 10.95, close: 11.4 }, o);
  assert.equal(t.fill, 11.01); assert.equal(t.basis, 'INTRADAY_LEVEL_TOUCH'); assert.equal(t.sameBarStop, 'AMBIGUOUS');
  assert.equal(fillOrder({ open: 10.9, high: 11.0, low: 10.95, close: 11 }, o).status, 'NOT_TRIGGERED');
});

// ---------------------------------------------------------------- Prüfplan (vorregistriert) und Prüfprotokoll
// Vorregistrierung: eine Änderung am Plan (Blocker, Klassen, Abnahmekriterien) ändert diesen Wert und braucht einen
// eigenen, begründeten Commit; Abnahmekriterien werden nie nach einem Ergebnis angepasst.
// 1.1.0 (Review #1196): neuer Pin nach der begründeten Planrevision (siehe plan.revision); der Prüfer pinnt zusätzlich
// den Planinhalt (PINNED_PLAN_CONTENT_SHA256, Test CP-PLAN-PIN-IN-CHECKER).
const PINNED_PLAN_SHA256 = 'a22412be02c02f840bcd609ed48b5ac6a87dd4e7cef2736c80dcf1169a6dcce7';
const CHECKER = path.join(path.dirname(PLAN_FILE), 'cert-prep-top5.mjs');

test('CP-PLAN-VALID: der Prüfplan stimmt mit Verträgen, Parametern, #709-Wortlaut und Testnamen überein', async () => {
  const { issues, checks } = await validatePlan();
  assert.deepEqual(issues, []);
  assert.ok(checks.rules >= 50 && checks.params >= 35 && checks.tests >= 75, JSON.stringify(checks));
});

test('CP-PLAN-PREREGISTERED: Plan gepinnt, fünf Methoden in der Reihenfolge der Matrix, VALIDATED_TRADE_SIGNAL gesperrt, SF6-PAPER-2027 unverändert', () => {
  assert.equal(planSha256(), PINNED_PLAN_SHA256);
  const plan = loadPlan();
  assert.deepEqual(plan.methods.map((m) => m.candidateId), ['C02', 'C01', 'C08', 'C12', 'C03']);
  assert.equal(plan.status, 'PREREGISTERED_NOT_ACTIVE');
  assert.equal(plan.guards.validatedTradeSignal, 'LOCKED_FOR_ALL_13');
  assert.equal(SF6_PAPER_PROTOCOL.status, 'PREPARED_NOT_ACTIVE');
  assert.equal(sf6PaperProtocolSha256().slice(0, 12), 'e623b336cd24');
});

test('CP-PLAN-NO-PERFORMANCE-TARGET: kein Abnahmekriterium ist eine Rendite- oder Performanceschwelle', () => {
  const plan = loadPlan();
  for (const s of plan.methods.flatMap((m) => m.studies)) for (const a of s.acceptance) {
    assert.ok(plan.guards.acceptanceMetricKinds.includes(a.metricKind), `${s.id}: ${a.metricKind}`);
    assert.notEqual(a.metricKind, 'PERFORMANCE');
  }
  assert.ok(plan.findings.every((f) => f.modelChange === false), 'Befunde ohne Fachmodelländerung');
});

const planHas = async (fn, prefix) => {
  const p = loadPlan(); fn(p);
  const { issues } = await validatePlan(p);
  assert.ok(issues.some((x) => x.startsWith(prefix)), `${prefix}: ${issues.join(' | ')}`);
  return issues;
};
const method = (p, id) => p.methods.find((m) => m.candidateId === id);
const dropTest = (list, id) => { const i = list.findIndex((x) => x.endsWith(`: ${id}`)); assert.ok(i >= 0, id); list.splice(i, 1); };

test('CP-PLAN-DETECTS: die Plan-Prüfung findet geänderte Parameter, falsche Tokens, fehlende Tests, Statuswechsel und Renditeziele', async () => {
  const has = planHas;
  await has((p) => { p.methods[0].params[0].value = 60; }, 'PARAM_VALUE');
  await has((p) => { p.methods[0].params[0].token = '60-Tage'; }, 'PARAM_TOKEN');
  await has((p) => { p.methods[0].conformanceTests.push('scripts/supertrader/tests/sf-turtle.test.mjs: GC-TUR-DOES-NOT-EXIST'); }, 'TEST_MISSING');
  await has((p) => { p.methods[0].rules[0].status = 'SOURCE_EXACT'; }, 'RULE_STATUS');
  await has((p) => { p.methods[0].studies[0].acceptance.push({ metricKind: 'PERFORMANCE', criterion: 'x' }); }, 'STUDY_METRIC_KIND');
  await has((p) => { p.methods[0].studies[0].acceptance.push({ metricKind: 'COUNT', criterion: 'Sharpe >= 1' }); }, 'STUDY_PERFORMANCE_TARGET');
  await has((p) => { p.methods[0].blockers[0].class = 'e'; }, 'BLOCKER_CLASS');
  await has((p) => { p.guards.validatedTradeSignal = 'ACTIVE'; }, 'GUARD_VALIDATED_TRADE_SIGNAL');
});

test('CP-PLAN-PERFORMANCE-WORDING: Rendite-, Risiko- und Trefferkennzahlen mit Vergleich und Zahl werden erkannt, Zählungen nicht', async () => {
  const targets = ['Sharpe-Ratio ≥ 1,0', 'Rendite von mindestens 10 % p.a.', 'CAGR größer 8 %', 'Max-Drawdown unter 20 %', 'Alpha > 0', 'Sortino mindestens 1,5',
    'Gewinn über 5 % je Trade', 'Return above 12%', 'Trefferquote >= 40 %', 'Profit Factor höchstens 2', 'Calmar = 1', 'Erwartungswert größer 0,2 R', '8 % p.a.', 'Win-Rate besser als 50 %'];
  for (const t of targets) {
    assert.ok(isPerformanceTarget(t), t);
    await planHas((p) => { p.methods[2].studies[0].acceptance.push({ metricKind: 'COUNT', criterion: t }); }, 'STUDY_PERFORMANCE_TARGET');
  }
  for (const t of ['Trades vorher/nachher je Sitzung berichtet', 'Anzahl berichtet; keine Mindestzahl als Kriterium (würde SF6-PAPER-2027 ändern; Entscheidung d)', '0 ungeklärte K5-Sitzungen (14 heute)', 'alle gelisteten Tests PASS, 0 FAIL, 0 übersprungen', 'Rendite nur als Verteilung berichtet, keine Schwelle'])
    assert.equal(isPerformanceTarget(t), false, t);
  for (const s of loadPlan().methods.flatMap((m) => m.studies)) for (const a of s.acceptance) assert.equal(isPerformanceTarget(a.criterion), false, `${s.id}: ${a.criterion}`);
});

test('CP-PLAN-PIN-IN-CHECKER: der Prüfer selbst verlangt den gepinnten Planinhalt; jede Änderung macht den Plan ungültig', async () => {
  assert.equal(planContentSha256(loadPlan()), PINNED_PLAN_CONTENT_SHA256);
  await planHas((p) => { p.methods[1].blockers[0].text += ' '; }, 'PLAN_NOT_PINNED');
  await planHas((p) => { p.methods[0].studies[0].acceptance[0].criterion = 'mindestens 90 % der Tests PASS'; }, 'PLAN_NOT_PINNED');
});

test('CP-PLAN-STRUCTURE: gelöschte Regeln und Parameter, Klassenwechsel ohne Begründung, Proxy als Quellenzahl und gekürzte Regeltreue-Tests werden erkannt', async () => {
  // Regel-Soll aus dem Vertrag
  await planHas((p) => { method(p, 'C02').rules = method(p, 'C02').rules.filter((r) => r.id !== 'TUR-SF-STOP'); }, 'RULE_NOT_COVERED:C02:TUR-SF-STOP');
  await planHas((p) => { method(p, 'C08').rulesOutOfScope = []; }, 'RULE_NOT_COVERED:C08:KK-SF-PRIORITY');
  await planHas((p) => { method(p, 'C02').rulesOutOfScope.find((r) => r.id === 'TUR-SF-TR').reason = 'MANUAL_REVIEW_LAYER'; }, 'RULE_OOS_STATUS:C02:TUR-SF-TR');
  await planHas((p) => { method(p, 'C01').rulesOutOfScope.find((r) => r.id === 'TUR-SF-N').reason = 'COVERED_IN:C08'; }, 'RULE_OOS_NOT_COVERED_THERE:C01:TUR-SF-N');
  // Parameter-Soll aus dem Code (alle Blätter von PARAMS / KK_PARAMS / MOKA_PARAMS / DARVAS_PARAMS)
  await planHas((p) => { method(p, 'C02').params = method(p, 'C02').params.filter((x) => x.code.path !== 'S2.entry'); }, 'PARAM_NOT_COVERED:methods/turtle.mjs#PARAMS.S2.entry');
  await planHas((p) => { method(p, 'C03').params = method(p, 'C03').params.filter((x) => x.code.path !== 'confirmDays'); }, 'PARAM_NOT_COVERED:methods/darvas.mjs#DARVAS_PARAMS.confirmDays');
  await planHas((p) => { p.paramsOutOfScope.pop(); }, 'PARAM_NOT_COVERED:methods/morales-kacher.mjs#MOKA_PARAMS.sessionsPerWeek');
  // Klasse d -> a ohne Begründung
  const dToA = await planHas((p) => { method(p, 'C02').blockers.find((b) => b.id === 'C02-CC4').class = 'a'; }, 'BLOCKER_CLASS_A_STATUS:C02-CC4');
  assert.ok(dToA.includes('BLOCKER_CLASS_OWNER:C02-CC4') && dToA.some((x) => x.startsWith('DATA_CLASS:D-TUR-GROUPS')), dToA.join(' | '));
  await planHas((p) => { method(p, 'C08').blockers.find((b) => b.id === 'C08-CC5').class = 'a'; }, 'BLOCKER_CLASS_INHERIT:C08-CC5:X-CC5');
  await planHas((p) => { method(p, 'C03').blockers.find((b) => b.id === 'C03-CC8').class = 'b'; }, 'BLOCKER_CLASS_CRITERION:C03-CC8:CC-8');
  // Modellgrenze als Quellenzahl
  await planHas((p) => { method(p, 'C08').params.find((x) => x.code.path === 'CONSOLIDATION_10.priorMove').kind = 'SOURCE_NUMBER'; }, 'PARAM_KIND_MODEL_AS_SOURCE:C08:KK_SETUP_PROXIES.CONSOLIDATION_10.priorMove');
  // gekürzte conformanceTests (Mindestumfang aus der Testdatei)
  await planHas((p) => dropTest(method(p, 'C08').conformanceTests, 'CP-KK-SETUP-LEVEL'), 'CONFORMANCE_FAMILY:KK:CP-KK-SETUP-LEVEL');
  await planHas((p) => dropTest(method(p, 'C01').conformanceTests, 'CP-TUR-STOP-2N-PRIOR-CLOSE-N'), 'CONFORMANCE_MINIMUM:C01:CP-TUR-STOP-2N-PRIOR-CLOSE-N');
  await planHas((p) => dropTest(method(p, 'C02').conformanceTests, 'CP-TUR-COSTS-REFERENCE'), 'CONFORMANCE_FAMILY:TUR:CP-TUR-COSTS-REFERENCE');
  await planHas((p) => dropTest(p.sharedExecution.tests, 'CP-EXEC-BUY-STOP-FILL'), 'CONFORMANCE_SHARED:CP-EXEC-BUY-STOP-FILL');
  // Abhängigkeit von PR #1148
  await planHas((p) => { delete p.dependsOn; }, 'DEPENDENCY_UNDECLARED');
  await planHas((p) => { p.dependsOn.file = 'docs/SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md'; }, 'DEPENDENCY_SHA256');
});

test('CP-PLAN-NOT-MET-INVALID: --run-tests mit NOT_MET macht das Protokoll ungültig (valid: false, Exit 1)', async () => {
  const plan = loadPlan(), met = Object.fromEntries(plan.methods.map((m) => [m.candidateId, { pass: m.conformanceTests.length, other: [], acceptance: 'MET' }]));
  const good = await certPrepReport({ runTests: true, runner: () => met });
  assert.equal(good.valid, true, good.issues.join(' | '));
  const bad = await certPrepReport({ runTests: true, runner: () => ({ ...met, C02: { pass: 16, other: [{ ref: 'x', result: 'FAIL' }], acceptance: 'NOT_MET' } }) });
  assert.equal(bad.valid, false);
  assert.deepEqual(bad.issues, ['CONFORMANCE_NOT_MET:C02']);
});

// Läuft nicht innerhalb von --run-tests (runPlanTests setzt CERT_PREP_NESTED), sonst riefe der Prüfer sich selbst auf.
test('CP-PLAN-NOT-MET-EXIT: der Prüfer endet mit --run-tests und einem roten Regeltreue-Test mit Exit 1', { skip: process.env.CERT_PREP_NESTED === '1' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-prep-notmet-'));
  try {
    const failing = path.join(tmp, 'fail.test.mjs');
    fs.writeFileSync(failing, "import test from 'node:test';\ntest('CP-FAIL-X: rot', () => { throw new Error('rot'); });\n");
    const plan = loadPlan(); plan.methods[0].conformanceTests.push(`${failing}: CP-FAIL-X`);
    const planFile = path.join(tmp, 'plan.json'); fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
    const r = spawnSync(process.execPath, [CHECKER, '--plan', planFile, '--run-tests', '--out', path.join(tmp, 'check.json')], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(tmp, 'check.json'), 'utf8'));
    assert.equal(report.valid, false);
    assert.equal(report.conformance.C02.acceptance, 'NOT_MET');
    assert.deepEqual(report.conformance.C02.other, [{ ref: `${failing}: CP-FAIL-X`, result: 'FAIL' }]);
    assert.ok(report.issues.includes('CONFORMANCE_NOT_MET:C02'), report.issues.join(' | '));
    assert.equal(report.conformance.C08.acceptance, 'MET');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CP-PLAN-REPORT: das Prüfprotokoll ist deterministisch, ohne Zeitstempel und schreibt nur mit --out (nie in ein Artefakt)', async () => {
  const a = await certPrepReport(), b = await certPrepReport();
  assert.deepEqual(a, b);
  assert.equal(a.valid, true); assert.equal(a.conformance, 'NOT_RUN (--run-tests)');
  assert.doesNotMatch(JSON.stringify(a), /"(generatedAt|timestamp|date)"/);
  const byId = Object.fromEntries(a.methods.map((m) => [m.candidateId, m]));
  assert.deepEqual(byId.C02.ccOpen, ['CC-4', 'CC-5', 'CC-8']);
  assert.ok(byId.C02.blockersByClass.d.includes('C02-CC4') && byId.C02.blockersByClass.a.includes('C02-RULE-CONFORMANCE'));
  assert.equal(a.dependency.pr, 1148); assert.equal(a.dependency.state, fs.existsSync(path.resolve(path.dirname(PLAN_FILE), '../../../../', a.dependency.file)) ? 'PRESENT_MATCHING_PR_1148' : 'PENDING_PR_1148');
  assert.equal(a.referenceCode.C02.state, 'HEAD_EQUALS_PINNED_REFERENCE_FINGERPRINT');
  assert.equal(a.referenceCode.C08.state, 'REFERENCE_FINGERPRINT_NOT_PINNED_REFERENCE_COMMIT_OPEN');
  assert.ok(a.methods.flatMap((m) => m.studies).filter((s) => s.id.endsWith('-CONFORMANCE')).every((s) => s.evidenceState === 'PR_HEAD_ONLY_REFERENCE_COMMIT_OPEN'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-prep-'));
  try {
    const before = fs.readFileSync(PLAN_FILE, 'utf8');
    // --out <dir>
    const r = spawnSync(process.execPath, [CHECKER, '--out', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fs.readdirSync(tmp), ['CERT-PREP-TOP5-CHECK.json']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'CERT-PREP-TOP5-CHECK.json'), 'utf8')), JSON.parse(JSON.stringify(a)));
    // --out <datei.json>
    const file = path.join(tmp, 'sub', 'protokoll.json');
    assert.equal(outTarget(file), file); assert.equal(outTarget(tmp), path.join(tmp, 'CERT-PREP-TOP5-CHECK.json'));
    const r2 = spawnSync(process.execPath, [CHECKER, '--out', file], { encoding: 'utf8' });
    assert.equal(r2.status, 0, r2.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(JSON.stringify(a)));
    assert.equal(spawnSync(process.execPath, [CHECKER, '--out'], { encoding: 'utf8' }).status, 1, '--out ohne Wert');
    assert.equal(fs.readFileSync(PLAN_FILE, 'utf8'), before);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
