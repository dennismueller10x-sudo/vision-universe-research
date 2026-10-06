// Minervini Canonical Replication Engine (Phase 2A) – isolierte Regeltests mit synthetischen Faellen.
// Keine historischen Gewinner als Fixture (keine Regel wird auf bekannte Ergebnisse zugeschnitten).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { P, PARAM_TABLE, RULEBOOK, buildParamTable, paramAccessor, MissingProvenanceError } from '../replication/minervini/params.mjs';
import { trendTemplate, prepareIndicators } from '../replication/minervini/trend-template.mjs';
import { detectVcp, decomposeBase } from '../replication/minervini/vcp.mjs';
import { quarterlyFirst, extractCompanyFacts, ROW } from '../replication/minervini/sec-facts.mjs';
import { evaluateSepa, makeSplitRatio, marginsAt, visibleRows } from '../replication/minervini/sepa.mjs';
import { openPosition, stepBar, endOfDay } from '../replication/minervini/exit-policy.mjs';
import { exposureCeiling, sizeOrder, rankOrders, reserveOrders } from '../replication/minervini/portfolio-policy.mjs';
import { simulatePortfolio, simulateSignals } from '../replication/minervini/portfolio-sim.mjs';
import { scanSegment } from '../replication/minervini/signal-engine.mjs';
import { classify, fidelityByArea } from '../replication/minervini/engine.mjs';
import { tradeStats, curveStats } from '../replication/minervini/metrics.mjs';
import { build as buildSourceToCode, OUT_PATH as S2C_PATH } from '../replication/minervini/artifacts.mjs';
import { verifyFreeze, FREEZE_PATH } from '../replication/minervini/freeze.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const ENGINE_DIR = path.join(root, 'scripts/supertrader/replication/minervini');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ---------------------------------------------------------------- Hilfen fuer synthetische Reihen
function dates(n, start = '2020-01-01') {
  const out = []; const d = new Date(start + 'T00:00:00Z');
  while (out.length < n) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
// Pfad aus Stuetzpunkten [[Tage, Zielkurs], ...] ab Startkurs; Hoch/Tief +-0,2 %.
function pathBars(start, legs, { vol = 1e6, volFrom = null, volTo = null, volLevel = null } = {}) {
  const close = [start];
  for (const [n, to] of legs) { const from = close[close.length - 1]; for (let k = 1; k <= n; k++) close.push(from + (to - from) * k / n); }
  const n = close.length, date = dates(n);
  const bars = { date, open: close.slice(), high: close.map((c) => c * 1.002), low: close.map((c) => c * 0.998), close, volume: close.map(() => vol) };
  if (volFrom !== null) for (let i = volFrom; i <= (volTo ?? n - 1); i++) bars.volume[i] = volLevel;
  return bars;
}
const q = (end, val, filed, extra = {}) => [end, val, filed, extra.accn || 'a-' + end, extra.form || '10-Q', extra.derived || 0, extra.tag || 'EarningsPerShareDiluted', extra.from || null];
const noSplit = () => 1;

// ---------------------------------------------------------------- Hard Gate: keine versteckten Defaults
test('MR-T-PARAMS-PROVENANCE: jeder Parameter hat Rule-ID, zulaessige Herkunft und Begruendung', () => {
  for (const [name, e] of Object.entries(PARAM_TABLE)) {
    assert.ok(e.ruleId && RULEBOOK.rules.some((r) => r.id === e.ruleId), name);
    assert.ok(['ORIGINAL', 'ORIGINAL_INTERPRETATION', 'VU_FORMALIZATION', 'VU_OWN'].includes(e.provenance), name);
    if (e.provenance === 'VU_OWN') assert.equal(e.layer, 'C_PORTFOLIO_EXECUTION', `${name}: VU_OWN nur im Messrahmen`);
  }
});

test('MR-T-PARAMS-MISSING: fehlende Herkunft, Fremdregel oder unbekannter Name bricht hart ab', () => {
  const clone = () => JSON.parse(JSON.stringify(RULEBOOK));
  const a = clone(); delete a.rules.find((r) => r.id === 'MR-SIZ-01').formalization.parameters['size.riskPerTrade'].provenance;
  assert.throws(() => buildParamTable(a), MissingProvenanceError);
  const b = clone(); b.rules.find((r) => r.id === 'MR-PF-01').formalization.parameters['pf.maxPositions'].provenance = 'FOREIGN_RULE';
  assert.throws(() => buildParamTable(b), MissingProvenanceError);
  const c = clone(); c.rules.find((r) => r.id === 'MR-TT-03').formalization.parameters['tt.ma200RisingSessions'].provenance = 'VU_OWN';
  assert.throws(() => buildParamTable(c), MissingProvenanceError, 'VU_OWN ausserhalb des Messrahmens');
  const d = clone(); delete d.rules.find((r) => r.id === 'MR-SIZ-01').formalization.parameters['size.riskPerTrade'];
  const Pd = paramAccessor(buildParamTable(d));
  assert.throws(() => Pd['size.riskPerTrade'], MissingProvenanceError, 'kein stiller Default');
  assert.throws(() => sizeOrder({ equity: 1e5, pivot: 100, stop: 95, unit: 1 }, Pd), MissingProvenanceError);
  assert.throws(() => P['size.riskPerTrade.typo'], MissingProvenanceError);
  assert.throws(() => sizeOrder({ equity: 1e5, pivot: 100, stop: 95, unit: 1 }, undefined), MissingProvenanceError);
  const e = clone(); delete e.rules.find((r) => r.id === 'MR-SIZ-01').formalization.parameters['size.riskPerTrade'].rationale;
  assert.throws(() => buildParamTable(e), MissingProvenanceError);
});

test('MR-T-NO-HIDDEN-DEFAULTS: Engine-Code ohne numerische Ersatzwerte und ohne generische VU-Portfolio-Logik', () => {
  for (const f of fs.readdirSync(ENGINE_DIR).filter((x) => x.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /(\?\?|\|\|)\s*-?\d*\.?\d+(?![\w.'"])/, `${f}: numerischer Ersatzwert per ?? oder ||`);
    assert.doesNotMatch(src, /\(\s*[^)]*\b\w+\s*=\s*-?\d*\.?\d+\s*[,)]/, `${f}: numerischer Default-Parameter`);
    assert.doesNotMatch(src, /PORTFOLIO_DEFAULTS|engine\/simulator\.mjs|validation\/portfolio\.mjs|strategies\/minervini|earnings\.mjs|backtest\.mjs/, `${f}: Legacy-/generische Portfolio-Logik importiert`);
  }
});

test('MR-T-PARAMS-USED: jeder Code-Parameter steht im Regelbuch, jeder Regelbuch-Parameter wird genutzt', () => {
  const used = new Set();
  for (const f of fs.readdirSync(ENGINE_DIR).filter((x) => x.endsWith('.mjs'))) for (const m of fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8').matchAll(/P\['([\w.]+)'\]/g)) used.add(m[1]);
  for (const u of used) assert.ok(PARAM_TABLE[u], `${u} fehlt im Regelbuch`);
  const external = new Set(['rs.definitionId', 'rs.weights', 'rs.horizons']); // Datenschicht/Rangwert: siehe measure.mjs und rsScore
  for (const name of Object.keys(PARAM_TABLE)) if (!external.has(name)) assert.ok(used.has(name), `${name} wird im Code nicht verwendet`);
  const measure = read('scripts/supertrader/replication/minervini/measure.mjs');
  assert.match(measure, /P\['rs\.definitionId'\]/, 'measure.mjs prueft die RS-Definition der Datenschicht');
});

// ---------------------------------------------------------------- Trend Template
function ttFixture() {
  const bars = pathBars(50, [[300, 120]]);
  const ind = prepareIndicators(bars, P);
  return { bars, ind, t: bars.close.length - 1 };
}
test('MR-T-TT-ALL: steigender Trend erfuellt alle acht Kriterien', () => {
  const { bars, ind, t } = ttFixture();
  const r = trendTemplate(bars, ind, 85, t, P);
  assert.equal(r.ok, true, JSON.stringify(r.rules));
});
test('MR-T-TT-FAIL-EACH: jedes Kriterium kann allein scheitern', () => {
  const { bars, ind, t } = ttFixture();
  const base = { ...ind };
  const mk = (patch) => { const i2 = {}; for (const k of Object.keys(base)) i2[k] = base[k].slice(); patch(i2); return i2; };
  const c = bars.close[t];
  const cases = {
    'MR-TT-01': mk((i) => { i.sma150[t] = c * 1.01; }),
    'MR-TT-02': mk((i) => { i.sma150[t] = i.sma200[t] * 0.99; }),
    'MR-TT-03': mk((i) => { i.sma200[t - P['tt.ma200RisingSessions']] = i.sma200[t] * 1.001; }),
    'MR-TT-04': mk((i) => { i.sma50[t] = i.sma150[t] * 0.99; }),
    'MR-TT-05': mk((i) => { i.sma50[t] = c * 1.001; i.sma150[t] = c * 0.9; i.sma200[t] = c * 0.8; }),
    'MR-TT-06': mk((i) => { i.low52[t] = c / 1.29; }),
    'MR-TT-07': mk((i) => { i.high52[t] = c / 0.74; }),
  };
  for (const [rule, ind2] of Object.entries(cases)) {
    const r = trendTemplate(bars, ind2, 85, t, P);
    assert.equal(r.rules[rule], false, rule);
    assert.equal(r.ok, false, rule);
  }
  const rs = trendTemplate(bars, ind, 69.9, t, P);
  assert.equal(rs.rules['MR-TT-08'], false);
});
test('MR-T-RS-EVERY-DAY: RS >= 70 gilt an jedem Bewertungstag (keine Ausnahme nach Entdeckung)', () => {
  const { bars, ind, t } = ttFixture();
  assert.equal(trendTemplate(bars, ind, 70, t, P).ok, true);
  assert.equal(trendTemplate(bars, ind, null, t, P).ok, false, 'unbekannter RS ist nicht erfuellt');
  assert.doesNotMatch(read('scripts/supertrader/replication/minervini/signal-engine.mjs'), /pending|DISCOVERY/);
});

// ---------------------------------------------------------------- VCP
// Stufe-2-Anstieg, dann Basis 100 -> 75 -> 97 -> 82,5 -> 96 -> 88,5 -> 94 (drei kleiner werdende Kontraktionen).
function vcpBars(opts = {}) {
  const legs = [[200, 100], [12, 75], [12, 97], [8, 82.5], [8, 96], [5, 88.5], [4, 94]];
  const b = pathBars(40, legs);
  const n = b.close.length, lastHigh = n - 1 - 4 - 5; // Beginn der letzten Kontraktion
  for (let i = lastHigh + 1; i < n; i++) b.volume[i] = opts.lastVol ?? 4e5;
  return b;
}
const volAvgOf = (b) => prepareIndicators(b, P).volAvg;
test('MR-T-VCP-CLASSIC: drei kleiner werdende Kontraktionen, Volumen trocknet aus, Pivot und Stop', () => {
  const b = vcpBars();
  const t = b.close.length - 1;
  const v = detectVcp(b, volAvgOf(b), t, P);
  assert.equal(v.ok, true, v.reason);
  assert.equal(v.contractions.length, 3);
  assert.ok(Math.abs(v.contractions[0].depth - 0.2516) < 0.01);
  assert.equal(v.pivot, 96 * 1.002);
  assert.equal(v.stop, 88.5 * 0.998);
  assert.ok(v.volumeRatio < 1);
  assert.equal(v.baseDepthClass, 'CONSTRUCTIVE');
});
test('MR-T-VCP-DECOMPOSE: Zerlegung liefert tiefer werdende Hochs und hoeher werdende Tiefs', () => {
  const b = vcpBars();
  const t = b.close.length - 1;
  const c = decomposeBase(b.high, b.low, 200, t);
  for (let k = 1; k < c.length; k++) { assert.ok(c[k].high <= c[k - 1].high); assert.ok(c[k].low >= c[k - 1].low); }
});
test('MR-T-VCP-NO-LOOKAHEAD: Ergebnis an t haengt nicht von Balken nach t ab', () => {
  const b = vcpBars();
  const t = b.close.length - 3;
  const v1 = detectVcp(b, volAvgOf(b), t, P);
  const b2 = { ...b, high: b.high.slice(), low: b.low.slice(), volume: b.volume.slice() };
  for (let i = t + 1; i < b2.high.length; i++) { b2.high[i] = 1e6; b2.low[i] = 0.01; b2.volume[i] = 1e12; }
  const v2 = detectVcp(b2, volAvgOf(b), t, P);
  assert.deepEqual(v1, v2);
});
test('MR-T-VCP-ONE-CONTRACTION / MR-T-VCP-SEVEN: weniger als 2 oder mehr als 6 Kontraktionen -> kein VCP', () => {
  const one = pathBars(40, [[200, 100], [20, 92], [20, 97]]);
  assert.equal(detectVcp(one, volAvgOf(one), one.close.length - 1, P).reason, 'CONTRACTION_COUNT');
  const H = [100, 99, 98, 97, 96, 95, 94], D = [0.30, 0.22, 0.16, 0.12, 0.09, 0.06, 0.04];
  const legs = [[200, 100]]; H.forEach((h, k) => { if (k > 0) legs.push([6, h]); legs.push([6, h * (1 - D[k])]); }); legs.push([6, 93.5]);
  const seven = pathBars(40, legs);
  const r = detectVcp(seven, volAvgOf(seven), seven.close.length - 1, P);
  assert.equal(r.reason, 'CONTRACTION_COUNT');
  assert.ok(r.contractions.length > 6);
});
test('MR-T-VCP-EXPANDING: groesser werdende Ruecksetzer gelten nie als kleiner werdende Kontraktionen', () => {
  // 100 -> 90 (10 %) -> 99 -> 80 (19 %): das tiefere Tief verschmilzt mit H1 zu EINER Kontraktion (100 -> 80).
  const b = pathBars(40, [[200, 100], [10, 90], [10, 99], [10, 80], [5, 95]]);
  const r = detectVcp(b, volAvgOf(b), b.close.length - 1, P);
  assert.equal(r.reason, 'CONTRACTION_COUNT');
  assert.equal(r.contractions.length, 1);
  // Eigenschaft der Zerlegung (MR-VCP-08): tiefere Hochs + hoehere Tiefs => streng fallende Tiefen (MR-VCP-03).
  const c = decomposeBase(b.high, b.low, 200, b.close.length - 1);
  for (let k = 1; k < c.length; k++) assert.ok(c[k].depth < c[k - 1].depth);
});
test('MR-T-VCP-NO-DRYUP: Volumen der letzten Kontraktion nicht unter dem 50-Tage-Schnitt -> kein VCP', () => {
  const b = vcpBars({ lastVol: 1.5e6 });
  assert.equal(detectVcp(b, volAvgOf(b), b.close.length - 1, P).reason, 'NO_VOLUME_DRYUP');
});
test('MR-T-VCP-BASE-TOO-SHORT: Basis kuerzer als 3 Wochen -> kein VCP', () => {
  const b = pathBars(40, [[200, 100], [4, 95], [4, 99], [3, 97], [2, 98.5]]);
  assert.equal(detectVcp(b, volAvgOf(b), b.close.length - 1, P).reason, 'BASE_TOO_SHORT');
});
test('MR-T-STOP-TECHNICAL / MR-T-STOP-TOO-WIDE: Stop am Kontraktionstief; ueber 10 % -> kein Setup', () => {
  const b = pathBars(40, [[200, 100], [12, 70], [12, 97], [8, 80], [5, 95]]);
  const v = detectVcp(b, volAvgOf(b), b.close.length - 1, P);
  assert.equal(v.reason === 'STOP_TOO_WIDE' || v.reason === 'NO_VOLUME_DRYUP', true);
  const b2 = vcpBars(); const v2 = detectVcp(b2, volAvgOf(b2), b2.close.length - 1, P);
  assert.ok(v2.stopPct <= P['risk.maxStopPct']);
  const wide = { ...b, volume: b.volume.map((x, i) => (i > 230 ? 1e5 : x)) };
  const v3 = detectVcp(wide, volAvgOf(wide), wide.close.length - 1, P);
  assert.equal(v3.reason, 'STOP_TOO_WIDE');
  assert.ok(v3.stopPct > P['risk.maxStopPct']);
});

// ---------------------------------------------------------------- SEC point-in-time (sec-facts)
const e = (start, end, val, filed, form = '10-Q', accn = null) => ({ start, end, val, filed, form, accn: accn || `${filed}-${end}` });
test('MR-T-PIT-AMENDMENT: Erstmeldung zaehlt; 10-Q/A und spaetere Vergleichsspalten aendern sie nicht', () => {
  const rows = quarterlyFirst([
    e('2023-01-01', '2023-03-31', 1.0, '2023-05-01'),
    e('2023-01-01', '2023-03-31', 0.8, '2023-06-15', '10-Q/A'),
    e('2023-01-01', '2023-03-31', 0.9, '2024-05-01'),
  ], 'EarningsPerShareDiluted');
  assert.equal(rows.length, 1);
  assert.equal(rows[0][ROW.VALUE], 1.0);
  assert.equal(rows[0][ROW.FILED], '2023-05-01');
  assert.equal(rows[0][ROW.FORM], '10-Q');
});
test('MR-T-PIT-DUP: gleiche Einreichung von Original und Aenderung -> Original', () => {
  const rows = quarterlyFirst([e('2023-01-01', '2023-03-31', 0.7, '2023-05-01', '10-Q/A', 'z'), e('2023-01-01', '2023-03-31', 1.0, '2023-05-01', '10-Q', 'y')], 'X');
  assert.equal(rows[0][ROW.VALUE], 1.0);
});
test('MR-T-PIT-YTD: 6- und 9-Monatswerte werden nie als Quartal gelesen; 8-K ohne periodisches Formular ignoriert', () => {
  const rows = quarterlyFirst([
    e('2023-01-01', '2023-06-30', 2.0, '2023-08-01'),
    e('2023-01-01', '2023-09-30', 3.0, '2023-11-01'),
    e('2023-04-01', '2023-06-30', 1.1, '2023-07-20', '8-K'),
    e('2023-04-01', '2023-06-30', 1.0, '2023-08-01'),
  ], 'X');
  assert.deepEqual(rows.map((r) => [r[0], r[1], r[2]]), [['2023-06-30', 1.0, '2023-08-01']]);
});
test('MR-T-PIT-Q4: Q4 = Jahr minus drei Quartale, als abgeleitet markiert und erst ab dem 10-K sichtbar', () => {
  const rows = quarterlyFirst([
    e('2023-01-01', '2023-03-31', 1, '2023-05-01'), e('2023-04-01', '2023-06-30', 1, '2023-08-01'), e('2023-07-01', '2023-09-30', 1, '2023-11-01'),
    e('2023-01-01', '2023-12-31', 4.5, '2024-02-20', '10-K'),
  ], 'Revenues');
  const q4 = rows.find((r) => r[0] === '2023-12-31');
  assert.equal(q4[ROW.VALUE], 1.5); assert.equal(q4[ROW.DERIVED], 1); assert.equal(q4[ROW.FILED], '2024-02-20'); assert.equal(q4[ROW.COMPONENTS_FROM], '2023-05-01');
  assert.equal(visibleRows(rows, '2024-02-20').some((r) => r[0] === '2023-12-31'), false);
  assert.equal(visibleRows(rows, '2024-02-21').some((r) => r[0] === '2023-12-31'), true);
});
test('MR-T-PIT-UNIT: eine Einheit je Reihe, USD bevorzugt; Margen-Reihen werden extrahiert', () => {
  const cf = { facts: { 'us-gaap': {
    EarningsPerShareDiluted: { units: { 'USD/shares': [e('2023-01-01', '2023-03-31', 1, '2023-05-01')], 'EUR/shares': [e('2023-04-01', '2023-06-30', 9, '2023-08-01')] } },
    Revenues: { units: { USD: [e('2023-01-01', '2023-03-31', 100, '2023-05-01')], EUR: [e('2023-04-01', '2023-06-30', 999, '2023-08-01')] } },
    CostOfRevenue: { units: { USD: [e('2023-01-01', '2023-03-31', 60, '2023-05-03')] } },
    OperatingIncomeLoss: { units: { USD: [e('2023-01-01', '2023-03-31', 20, '2023-05-01')] } },
    NetIncomeLoss: { units: { USD: [e('2023-01-01', '2023-03-31', 15, '2023-05-01')] } },
  } } };
  const f = extractCompanyFacts(cf);
  assert.equal(f.units.eps, 'USD/shares'); assert.equal(f.units.money, 'USD');
  assert.deepEqual(f.eps.map((r) => r[1]), [1]); assert.deepEqual(f.rev.map((r) => r[1]), [100]);
  assert.equal(f.gp[0][ROW.VALUE], 40); assert.equal(f.gp[0][ROW.FILED], '2023-05-03', 'abgeleiteter Bruttogewinn sichtbar ab der spaeteren Einreichung');
  assert.equal(f.opinc[0][ROW.VALUE], 20); assert.equal(f.ni[0][ROW.VALUE], 15);
});
test('MR-T-MARGIN-PIT: Marge erst sichtbar, wenn Zaehler UND Umsatz eingereicht sind', () => {
  const fund = { rev: [q('2023-03-31', 100, '2023-05-01'), q('2022-03-31', 100, '2022-05-01')], gp: [q('2023-03-31', 45, '2023-05-10'), q('2022-03-31', 40, '2022-05-01')], opinc: [], ni: [] };
  assert.equal(marginsAt(fund, '2023-05-05', '2023-03-31', 14).gross.margin, null);
  const m = marginsAt(fund, '2023-05-11', '2023-03-31', 14).gross;
  assert.equal(m.margin, 0.45); assert.ok(Math.abs(m.changePp - 5) < 1e-9);
});

// ---------------------------------------------------------------- SEPA
function fundFixture({ g0 = 0.5, g1 = 0.3, rev0 = 1.2 } = {}) {
  // Quartale 2021-Q4 .. 2023-Q1; Einreichung 40 Tage nach Periodenende.
  const ends = ['2021-12-31', '2022-03-31', '2022-06-30', '2022-09-30', '2022-12-31', '2023-03-31'];
  const filed = (end) => new Date(Date.parse(end) + 40 * 864e5).toISOString().slice(0, 10);
  const epsV = { '2021-12-31': 1.0, '2022-03-31': 1.0, '2022-06-30': 1.0, '2022-09-30': 1.0, '2022-12-31': 1.0 * (1 + g1), '2023-03-31': 1.0 * (1 + g0) };
  return {
    eps: ends.map((x) => q(x, epsV[x], filed(x))),
    rev: ends.map((x) => q(x, x === '2023-03-31' ? 100 * rev0 : 100, filed(x), { tag: 'Revenues' })),
    gp: [], opinc: [], ni: [],
  };
}
test('MR-T-SEPA-PASS: EPS +50 % beschleunigt gegen +30 %, Umsatz waechst', () => {
  const r = evaluateSepa(fundFixture(), '2023-06-01', noSplit, P);
  assert.equal(r.ok, true, r.reason);
  assert.ok(Math.abs(r.facts.epsGrowth - 0.5) < 1e-9); assert.ok(Math.abs(r.facts.epsGrowthPrev - 0.3) < 1e-9);
});
test('MR-T-PIT-FILED-DAY: am Einreichungstag nicht sichtbar, am Folgetag sichtbar (available_date < signal_date)', () => {
  const f = fundFixture();
  const filed = f.eps.at(-1)[ROW.FILED];
  assert.equal(evaluateSepa(f, filed, noSplit, P).facts.quarterEnd, '2022-12-31');
  const next = new Date(Date.parse(filed) + 864e5).toISOString().slice(0, 10);
  assert.equal(evaluateSepa(f, next, noSplit, P).facts.quarterEnd, '2023-03-31');
});
test('MR-T-SEPA-EPS-LOW: EPS-Wachstum unter 20 % -> kein Einstieg', () => {
  const r = evaluateSepa(fundFixture({ g0: 0.19, g1: 0.1 }), '2023-06-01', noSplit, P);
  assert.equal(r.ok, false); assert.equal(r.ruleId, 'MR-SEPA-01');
  assert.equal(evaluateSepa(fundFixture({ g0: 0.2, g1: 0.1 }), '2023-06-01', noSplit, P).ok, true, '20 % genau erfuellt');
});
test('MR-T-SEPA-NO-ACCEL: keine Beschleunigung -> kein Einstieg', () => {
  const r = evaluateSepa(fundFixture({ g0: 0.3, g1: 0.5 }), '2023-06-01', noSplit, P);
  assert.equal(r.ruleId, 'MR-SEPA-02'); assert.equal(r.reason, 'SEPA_NO_ACCELERATION');
});
test('MR-T-SEPA-GAP-QUARTER: fehlendes Vorquartal -> Beschleunigung nicht nachweisbar (kein Vergleich mit aelterem Quartal)', () => {
  const f = fundFixture(); f.eps = f.eps.filter((r) => r[0] !== '2022-12-31');
  const r = evaluateSepa(f, '2023-06-01', noSplit, P);
  assert.equal(r.reason, 'SEPA_ACCEL_NOT_DEMONSTRABLE');
});
test('MR-T-SEPA-REV-DOWN: Umsatz desselben Quartals nicht ueber Vorjahr -> kein Einstieg', () => {
  assert.equal(evaluateSepa(fundFixture({ rev0: 1.0 }), '2023-06-01', noSplit, P).ruleId, 'MR-SEPA-04');
});
test('MR-T-SEPA-NEG-BASE: Vorjahres-EPS <= 0 -> nicht bewertbar, kein Einstieg', () => {
  const f = fundFixture(); f.eps = f.eps.map((r) => (r[0] === '2022-03-31' ? q(r[0], -0.2, r[2]) : r));
  assert.equal(evaluateSepa(f, '2023-06-01', noSplit, P).ruleId, 'MR-SEPA-10');
});
test('MR-T-SEPA-MISSING / MR-T-PIT-STALE: keine Daten oder veraltetes Quartal -> kein Einstieg', () => {
  assert.equal(evaluateSepa(null, '2023-06-01', noSplit, P).reason, 'SEPA_DATA_MISSING');
  assert.equal(evaluateSepa({ eps: [], rev: [] }, '2023-06-01', noSplit, P).reason, 'SEPA_DATA_MISSING');
  assert.equal(evaluateSepa(fundFixture(), '2024-03-01', noSplit, P).reason, 'SEPA_STALE');
});
test('MR-T-SEPA-SPLIT: Vorjahres-EPS wird um einen Split zwischen den Einreichungen bereinigt (ADR-002 splitFactors)', () => {
  const f = fundFixture({ g0: 0.3, g1: 0.1 });
  // 2:1-Split am 2023-01-10: alle nach dem Split eingereichten EPS sind halb so gross.
  f.eps = f.eps.map((r) => (r[ROW.FILED] > '2023-01-10' ? q(r[0], r[1] / 2, r[2]) : r));
  const raw = dates(900, '2020-06-01').map((d) => ({ date: d, splitFactor: d === '2023-01-10' ? 2 : 1 }));
  const r = evaluateSepa(f, '2023-06-01', makeSplitRatio(raw), P);
  assert.equal(r.ok, true, r.reason);
  assert.ok(Math.abs(r.facts.epsGrowth - 0.3) < 1e-9, 'ohne Bereinigung waere das Wachstum -35 %');
  const unadjusted = evaluateSepa(f, '2023-06-01', noSplit, P);
  assert.equal(unadjusted.ok, false);
});
test('MR-T-PIT-Q4-SPLIT: abgeleitetes Q4-EPS ueber einen Split wird verworfen', () => {
  const f = fundFixture();
  f.eps = f.eps.map((r) => (r[0] === '2023-03-31' ? q(r[0], r[1], r[2], { derived: 1, from: '2022-05-10' }) : r));
  const raw = dates(900, '2020-06-01').map((d) => ({ date: d, splitFactor: d === '2022-08-01' ? 2 : 1 }));
  assert.equal(evaluateSepa(f, '2023-06-01', makeSplitRatio(raw), P).reason, 'SEPA_EPS_DERIVED_EPS_ACROSS_SPLIT');
});
test('MR-T-SEPA-CODE33: Code 33 wird berechnet und nur protokolliert (filtert nicht)', () => {
  const ends = ['2021-03-31', '2021-06-30', '2021-09-30', '2021-12-31', '2022-03-31', '2022-06-30', '2022-09-30', '2022-12-31'];
  const filed = (end) => new Date(Date.parse(end) + 40 * 864e5).toISOString().slice(0, 10);
  const eps = [1, 1, 1, 1, 1.1, 1.2, 1.4, 1.7], rev = [100, 100, 100, 100, 105, 112, 125, 140], ni = [10, 10, 10, 10, 12, 14, 17, 22];
  const fund = { eps: ends.map((x, i) => q(x, eps[i], filed(x))), rev: ends.map((x, i) => q(x, rev[i], filed(x))), ni: ends.map((x, i) => q(x, ni[i], filed(x))), gp: [], opinc: [] };
  const r = evaluateSepa(fund, '2023-03-01', noSplit, P);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.facts.code33, true);
  assert.equal(r.facts.revAccel, true);
  const src = read('scripts/supertrader/replication/minervini/sepa.mjs');
  assert.doesNotMatch(src, /code33[^\n]*return \{ ok: false/);
});

// ---------------------------------------------------------------- Ausstieg
const pos0 = () => openPosition({ fillBase: 100, technicalStop: 95, shares: 100, entryIndex: 0, shareUnit: 1 }, P);
test('MR-T-STOP-TECHNICAL (Exit): Anfangsstop am technischen Punkt', () => {
  const p = pos0(); assert.equal(p.stop, 95); assert.equal(p.stopRuleId, 'MR-RSK-01'); assert.equal(p.target, 115);
});
test('MR-T-ENTRY-GAP: Gap ueber den Pivot -> Stop hoechstens 10 % unter dem Fuellkurs (MR-RSK-02)', () => {
  const p = openPosition({ fillBase: 110, technicalStop: 95, shares: 10, entryIndex: 0, shareUnit: 1 }, P);
  assert.ok(Math.abs(p.stop - 99) < 1e-9); assert.equal(p.stopRuleId, 'MR-RSK-02');
});
test('MR-T-EXIT-PARTIAL: Haelfte bei 3R verkauft (in die Staerke)', () => {
  const p = pos0();
  const f = stepBar(p, { open: 104, high: 116, low: 103 }, P);
  assert.deepEqual(f, [{ price: 115, shares: 50, ruleId: 'MR-EXIT-02', basis: 'LIMIT' }]);
  assert.equal(p.shares, 50);
  assert.deepEqual(stepBar(p, { open: 117, high: 125, low: 116 }, P), [], 'Teilverkauf nur einmal');
});
test('MR-T-EXIT-GAP-PARTIAL: Eroeffnung ueber dem Ziel -> Teilverkauf zur Eroeffnung', () => {
  const p = pos0();
  assert.equal(stepBar(p, { open: 118, high: 120, low: 117 }, P)[0].price, 118);
});
test('MR-T-EXIT-BREAKEVEN: nach 3R Stop mindestens auf Einstand (ab dem Folgetag)', () => {
  const p = pos0();
  stepBar(p, { open: 104, high: 116, low: 103 }, P);
  assert.equal(p.stop, 95, 'gilt erst ab dem Folgetag');
  endOfDay(p, 99, P);
  assert.equal(p.stop, 100); assert.equal(p.stopRuleId, 'MR-EXIT-01');
  const f = stepBar(p, { open: 100.5, high: 101, low: 99.5 }, P);
  assert.equal(f[0].ruleId, 'MR-EXIT-01'); assert.equal(f[0].price, 100);
});
test('MR-T-EXIT-TRAIL: danach mindestens die Haelfte des hoechsten Schlussgewinns gesichert', () => {
  const p = pos0();
  stepBar(p, { open: 104, high: 116, low: 103 }, P); endOfDay(p, 115, P);
  stepBar(p, { open: 120, high: 131, low: 119 }, P); endOfDay(p, 130, P);
  assert.equal(p.stop, 115); assert.equal(p.stopRuleId, 'MR-EXIT-03');
  endOfDay(p, 120, P);
  assert.equal(p.stop, 115, 'Stop nur aufwaerts');
});
test('MR-T-EXIT-SAME-BAR: Stop und Ziel im selben Balken -> Stop zuerst (konservativ)', () => {
  const p = pos0();
  const f = stepBar(p, { open: 100, high: 116, low: 94 }, P);
  assert.deepEqual(f, [{ price: 95, shares: 100, ruleId: 'MR-RSK-01', basis: 'STOP' }]);
  const p2 = pos0();
  assert.equal(stepBar(p2, { open: 90, high: 92, low: 89 }, P)[0].price, 90, 'Gap unter den Stop fuellt zur Eroeffnung');
});
test('MR-T-NO-FOREIGN-RULES: keine Fremdregel und keine ungeklaerte Regel wirkt; 1,4x-Volumen und SMA50-Ausstieg fehlen im Code', () => {
  for (const r of RULEBOOK.rules) if (r.implementation.status === 'IMPLEMENTED') assert.ok(!['FOREIGN_RULE', 'UNRESOLVED'].includes(r.provenanceClass), r.id);
  for (const f of fs.readdirSync(ENGINE_DIR).filter((x) => x.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(ENGINE_DIR, f), 'utf8');
    assert.doesNotMatch(src, /1\.4\b|sma50\[[^\]]*\][^\n]*exit|marketFilter|SPY[^\n]*200/i, f);
  }
});

// ---------------------------------------------------------------- Groesse und Portfolio
test('MR-T-SIZE-RISK / MR-T-SIZE-CAP: 1,25 % Risiko, hoechstens 25 % Gewicht', () => {
  const a = sizeOrder({ equity: 100000, pivot: 100, stop: 92, unit: 1 }, P);
  assert.equal(a.shares, Math.floor(1250 / (100.1 - 92))); assert.equal(a.byRisk, true);
  const b = sizeOrder({ equity: 100000, pivot: 100, stop: 97, unit: 1 }, P);
  // Reverse-Split spaeter: bereinigter Kurs 40.000 USD, echte Aktie 400 USD -> Stueckelung in echten Aktien, nicht 0 Stueck.
  const c = sizeOrder({ equity: 100000, pivot: 40000, stop: 38800, unit: 0.01 }, P);
  assert.ok(c.shares > 0); assert.ok(Math.abs(c.shares / 0.01 - Math.round(c.shares / 0.01)) < 1e-6);
  assert.throws(() => sizeOrder({ equity: 1e5, pivot: 100, stop: 95 }, P), /unit/);
  assert.equal(b.shares, Math.floor(25000 / 100.1)); assert.equal(b.byRisk, false);
});
test('MR-T-PF-PROGRESSIVE: Startquote 50 %, nach Gewinn 100 %, nach Verlust zurueck auf 50 %', () => {
  assert.equal(exposureCeiling(null, P), 0.5); assert.equal(exposureCeiling(10, P), 1.0); assert.equal(exposureCeiling(-5, P), 0.5); assert.equal(exposureCeiling(0, P), 0.5);
});
test('MR-T-RANK-RS / MR-T-RANK-NOT-ALPHA: Fuehrer zuerst, dann engere Basis; nicht alphabetisch', () => {
  const g = rankOrders([{ segId: 'AAA', rsScore: 0.2, stopPct: 0.05 }, { segId: 'ZZZ', rsScore: 0.9, stopPct: 0.08 }, { segId: 'MMM', rsScore: 0.9, stopPct: 0.04 }]);
  assert.deepEqual(g.map((x) => x.map((o) => o.segId)), [['MMM'], ['ZZZ'], ['AAA']]);
  const src = read('scripts/supertrader/replication/minervini/portfolio-policy.mjs');
  assert.doesNotMatch(src, /localeCompare|segId\s*</);
});
test('MR-T-RANK-TIE: exakter Gleichstand wird nur ganz reserviert', () => {
  const groups = rankOrders([{ segId: 'A', rsScore: 0.5, stopPct: 0.05, pivot: 100, stop: 95, unit: 1 }, { segId: 'B', rsScore: 0.5, stopPct: 0.05, pivot: 100, stop: 95, unit: 1 }]);
  assert.equal(groups.length, 1);
  const r = reserveOrders(groups, { equity: 100000, openValue: 0, openCount: 11, cash: 100000, ceiling: 1 }, P);
  assert.equal(r.length, 0, 'nur ein Platz frei -> keiner der Gleichstaende');
  assert.equal(reserveOrders(groups, { equity: 100000, openValue: 0, openCount: 0, cash: 100000, ceiling: 1 }, P).length, 2);
});
test('MR-T-PF-MAXPOS: hoechstens 12 Positionen; Exposure-Obergrenze begrenzt die Reservierung', () => {
  const g = rankOrders([{ segId: 'A', rsScore: 1, stopPct: 0.05, pivot: 100, stop: 95, unit: 1 }]);
  assert.equal(reserveOrders(g, { equity: 1e5, openValue: 0, openCount: 12, cash: 1e5, ceiling: 1 }, P).length, 0);
  const r = reserveOrders(g, { equity: 1e5, openValue: 45000, openCount: 2, cash: 55000, ceiling: 0.5 }, P);
  assert.ok(r[0].cost <= 5000 + 1e-6, 'nur 5 % Restplatz unter der 50-%-Startquote');
});

// Kleine Welt fuer Portfolio-Tests: Segmente mit festen Setups.
function seg(id, closes, setups = {}, extra = {}) {
  const n = closes.length, date = dates(n, '2021-01-04');
  return { id, date, rawClose: closes.slice(), open: extra.open || closes.slice(), high: extra.high || closes.map((c) => c * 1.01), low: extra.low || closes.map((c) => c * 0.99), close: closes.slice(),
    volume: closes.map(() => 1e6), volAvg: closes.map(() => 1e6), divAdj: extra.divAdj || closes.map(() => 0), delisted: !!extra.delisted,
    setups: new Map(Object.entries(setups).map(([k, v]) => [Number(k), { stopPct: 1 - v.stop / v.pivot, rsScore: 0.5, rsPct: 80, ...v }])) };
}
test('MR-T-ENTRY-BUYSTOP: Kauf-Stop loest nur aus, wenn das Tageshoch den Pivot ueberschreitet; Fuellung am Pivot plus Slippage', () => {
  const s = seg('X', [100, 100, 100, 104, 104], { 1: { pivot: 102, stop: 97, baseStart: 0 }, 2: { pivot: 103, stop: 98, baseStart: 0 } });
  s.high[2] = 101.9; // Order vom Setup 1 loest an Tag 2 nicht aus
  s.open[3] = 101; s.high[3] = 105;
  const r = simulatePortfolio([s], s.date, P);
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].entryDate, s.date[3]);
  assert.ok(Math.abs(r.trades[0].entryPrice - 103 * 1.001) < 1e-9);
});
test('MR-T-ENTRY-GAP (Portfolio): Eroeffnung ueber dem Pivot fuellt zur Eroeffnung', () => {
  const s = seg('X', [100, 100, 108, 108], { 1: { pivot: 102, stop: 97, baseStart: 0 } });
  s.open[2] = 107;
  const r = simulatePortfolio([s], s.date, P);
  assert.ok(Math.abs(r.trades[0].entryPrice - 107 * 1.001) < 1e-9);
});
test('MR-T-NO-SAME-DAY-FUNDING: Erloese eines Ausstiegs am Tag d finanzieren keinen Kauf am Tag d', () => {
  // A wird am Tag 1 gekauft (fast das ganze Kapital ueber die Startquote hinaus nicht moeglich -> zwei Schritte)
  const a = seg('A', [100, 103, 103, 90, 90], { 0: { pivot: 101, stop: 97, baseStart: 0 } });
  const b = seg('B', [50, 50, 50, 50, 55], { 2: { pivot: 51, stop: 49, baseStart: 0 }, 3: { pivot: 51, stop: 49, baseStart: 0 } });
  b.high[3] = 52; b.open[4] = 50; b.high[4] = 56;
  const r = simulatePortfolio([a, b], a.date, P);
  const ta = r.trades.find((t) => t.segId === 'A'), tb = r.trades.find((t) => t.segId === 'B');
  assert.ok(ta && ta.exitDate === a.date[3]);
  assert.ok(tb, 'B wird gekauft');
  // Am Tag 3 (Ausstieg A) war B reserviert: Budget = Bargeld zum Vortagesschluss.
  const day3 = r.curve.find((p) => p.date === a.date[3]);
  assert.ok(day3.cash >= 0);
});
test('MR-T-RESERVE-NO-LOOKAHEAD: reserviert wird vor dem Tag; eine hoeher gerangte, nicht ausgeloeste Order haelt ihren Platz', () => {
  const hi = seg('HI', [100, 100, 100], { 0: { pivot: 105, stop: 95.5, baseStart: 0, rsScore: 0.9 } });
  const lo = seg('LO', [100, 100, 106], { 0: { pivot: 101, stop: 96, baseStart: 0, rsScore: 0.1 } });
  lo.high[1] = 103; hi.high[1] = 101; // nur LO loest aus
  // Kapazitaet nur fuer eine Order: Startquote 50 % und Gewicht 25 % ... mit 11 offenen Plaetzen simuliert ueber maxPositions
  const P2 = paramAccessor(buildParamTable({ ...RULEBOOK, rules: RULEBOOK.rules.map((r) => (r.id === 'MR-PF-01' ? { ...r, formalization: { ...r.formalization, parameters: { 'pf.maxPositions': { ...r.formalization.parameters['pf.maxPositions'], value: 1 } } } } : r)) }));
  const r = simulatePortfolio([hi, lo], hi.date, P2);
  assert.equal(r.trades.length, 0, 'LO wurde nicht reserviert, HI loeste nicht aus');
});
test('MR-T-REENTRY-NEW-BASE: Wiedereinstieg nur mit einer Basis, die nach dem Ausstieg beginnt; keine feste Sperre', () => {
  const closes = [100, 100, 90, 90, 90, 90, 100, 100];
  const s = seg('X', closes, { 0: { pivot: 99, stop: 95, baseStart: 0 }, 3: { pivot: 91, stop: 88, baseStart: 1 }, 4: { pivot: 91, stop: 88, baseStart: 3 } });
  s.high[1] = 101; s.open[2] = 90; s.low[2] = 89; s.high[4] = 90.5; s.high[5] = 92;
  const r = simulatePortfolio([s], s.date, P);
  assert.equal(r.trades.length, 2);
  assert.equal(r.trades[1].entryDate, s.date[5], 'Setup 3 (Basis vor dem Ausstieg) ignoriert, Setup 4 genommen');
  assert.equal(r.trades[1].entryDate > r.trades[0].exitDate, true);
});
test('MR-T-DELIST / MR-T-DIVIDEND / MR-T-COSTS: Delisting zum letzten Schluss, Dividende gutgeschrieben, Kosten je Seite', () => {
  const s = seg('X', [100, 103, 104, 104], { 0: { pivot: 101, stop: 97, baseStart: 0 } }, { delisted: true, divAdj: [0, 0, 1, 0] });
  const r = simulatePortfolio([s], s.date, P);
  const t = r.trades[0];
  assert.equal(t.kind, 'DELISTED');
  assert.ok(r.book.dividends > 0);
  const buy = t.entryPrice * t.shares0, sellPx = 104 * (1 - 0.001);
  const expected = sellPx * t.shares0 * (1 - 0.0001) - buy * 1.0001 + t.shares0 * 1;
  assert.ok(Math.abs(t.pnl - expected) < 1e-6, `${t.pnl} vs ${expected}`);
});
test('MR-T-UNIVERSE: Messrahmen (Rohkurs >= 5 USD, Dollarumsatz) als VU_OWN und nicht als Minervini-Regel', () => {
  const r = RULEBOOK.rules.find((x) => x.id === 'MR-UNI-01');
  assert.equal(r.provenanceClass, 'VU_OWN'); assert.equal(r.reproducibility, 'MEASUREMENT_SCOPE'); assert.equal(r.layer, 'C_PORTFOLIO_EXECUTION');
  const b = pathBars(2, [[300, 4]]);
  const ctx = { bars: b, rawClose: b.close, rsPct: b.close.map(() => 90), fund: null, splitRatio: noSplit };
  const out = scanSegment(ctx, P);
  assert.equal(out.stats.universe, 0);
});
test('MR-T-SIGNALS: Signalqualitaet laeuft ohne Portfolio mit denselben Ausstiegsregeln', () => {
  const s = seg('X', [100, 103, 116, 120, 112, 110], { 0: { pivot: 101, stop: 97, baseStart: 0 } });
  const out = simulateSignals(s, P);
  assert.equal(out.length, 1);
  assert.ok(out[0].exits.includes('MR-EXIT-02'));
});

// ---------------------------------------------------------------- Integration Signal-Engine
test('MR-T-SCAN-INTEGRATION: Trend Template + VCP + SEPA ergeben ein Setup mit Pivot/Stop aus dem VCP', () => {
  // Sanftere Basis nach laengerem Anstieg, damit auch das Trend Template (50 > 150 > 200) erfuellt ist.
  const b = pathBars(40, [[300, 100], [10, 88], [10, 98], [6, 92], [6, 97], [4, 94.5], [3, 96]]);
  const n = b.close.length;
  for (let i = n - 7; i < n; i++) b.volume[i] = 4e5;
  // Rohbalken (Split-Historie) reichen vor die aelteste Vorjahres-Einreichung zurueck; sonst ist das Split-Verhaeltnis unbekannt.
  const raw = dates(1400, '2018-01-01').map((d) => ({ date: d, splitFactor: 1 }));
  const lastDate = b.date[n - 1];
  const filedLast = new Date(Date.parse(lastDate) - 30 * 864e5).toISOString().slice(0, 10);
  const end0 = new Date(Date.parse(lastDate) - 70 * 864e5).toISOString().slice(0, 10);
  const shiftQ = (d, k) => new Date(Date.parse(d) - k * 91.3125 * 864e5).toISOString().slice(0, 10);
  const ends = [5, 4, 3, 2, 1, 0].map((k) => shiftQ(end0, k));
  const epsV = [1, 1, 1, 1, 1.3, 1.5];
  const fund = { eps: ends.map((x, i) => q(x, epsV[i], i === 5 ? filedLast : new Date(Date.parse(x) + 40 * 864e5).toISOString().slice(0, 10))),
    rev: ends.map((x, i) => q(x, i === 5 ? 130 : 100, i === 5 ? filedLast : new Date(Date.parse(x) + 40 * 864e5).toISOString().slice(0, 10))), gp: [], opinc: [], ni: [] };
  // Ein zusaetzlicher Balken, damit am letzten Basistag eine Order fuer den Folgetag entstehen kann.
  for (const k of ['open', 'high', 'low', 'close', 'volume']) b[k].push(b[k][n - 1]);
  b.date.push(dates(n + 1)[n]);
  const ctx = { bars: b, rawClose: b.close, rsPct: b.close.map(() => 85), fund, splitRatio: makeSplitRatio(raw) };
  const out = scanSegment(ctx, P);
  const s = out.setups.get(n - 1);
  assert.ok(s, JSON.stringify(out.stats));
  assert.equal(s.pivot, 97 * 1.002); assert.ok(Math.abs(s.stop - 94.5 * 0.998) < 1e-9);
  assert.equal(s.sepa.quarterEnd, end0);
  assert.equal(s.vcp.contractions.length, 3);
  // Split-Historie beginnt erst nach der Vorjahres-Einreichung -> nicht bewertbar (keine Annahme 'kein Split').
  const short = scanSegment({ ...ctx, splitRatio: makeSplitRatio(b.date.map((d) => ({ date: d, splitFactor: 1 }))) }, P);
  assert.equal(short.setups.has(n - 1), false);
});

// ---------------------------------------------------------------- Klassifikation, Isolation, Freeze
test('MR-T-CLASSIFICATION: Name ist Ergebnis des Audits; Hard Gate verbietet den Replication-Claim', () => {
  const c = classify();
  assert.deepEqual(fidelityByArea(), RULEBOOK.fidelityAssessment.areas);
  assert.equal(c.replicationClaimAllowed, false);
  assert.equal(c.productClass, 'VU_ADAPTATION');
  assert.equal(c.canonicalName, 'minervini-adaptation-1.0.0');
  assert.doesNotMatch(c.displayName, /^Minervini Replication$/);
  // Gegenprobe: alle Kernbereiche HIGH und keine Fremdregel -> REPLICATION waere erlaubt.
  const hi = JSON.parse(JSON.stringify(RULEBOOK));
  for (const r of hi.rules) { r.fidelity = 'HIGH'; r.implementation.status = 'IMPLEMENTED'; if (['FOREIGN_RULE', 'UNRESOLVED'].includes(r.provenanceClass)) r.provenanceClass = 'ORIGINAL'; }
  assert.equal(classify(hi).replicationClaimAllowed, true);
});
test('MR-T-ISOLATION: Live-Build kennt die Engine nicht; Legacy-Minervini unveraendert importfrei', () => {
  const build = read('scripts/supertrader/build.mjs');
  assert.doesNotMatch(build, /replication\/minervini|MINERVINI_CANONICAL/);
  for (const f of ['minervini.mjs', 'minervini-v2.mjs', 'minervini-v3.mjs']) assert.doesNotMatch(read('scripts/supertrader/engine/strategies/' + f), /replication/);
  assert.equal(RULEBOOK.engine.status, 'RESEARCH_ONLY_NOT_LIVE');
  assert.ok(!fs.existsSync(path.join(root, 'supertrader/data/ledger/MINERVINI_CANONICAL.json')));
});

test('MR-T-METRICS: Durchschnittsverlust und Trefferquote werden gemessen, nicht erzwungen (MR-RSK-03)', () => {
  const st = tradeStats([{ returnPct: 0.2, rMultiple: 3, exits: [{ ruleId: 'MR-EXIT-02' }] }, { returnPct: -0.05, rMultiple: -1, exits: [{ ruleId: 'MR-RSK-01' }] }]);
  assert.equal(st.winRate, 0.5); assert.equal(st.avgLoss, -0.05); assert.deepEqual(st.exitRuleCounts, { 'MR-EXIT-02': 1, 'MR-RSK-01': 1 });
  const c = curveStats([{ date: '2020-01-01', equity: 100, exposure: 0, positions: 0, ceiling: 0.5 }, { date: '2021-01-01', equity: 110, exposure: 0.5, positions: 1, ceiling: 1 }]);
  assert.ok(Math.abs(c.totalReturn - 0.1) < 1e-12);
});

// ---------------------------------------------------------------- Golden Source-to-Code
test('MR-T-SOURCE-TO-CODE: Artefakt aktuell; jede umgesetzte Regel -> exportierte Funktion -> vorhandener Test', async () => {
  const built = await buildSourceToCode();
  assert.equal(fs.readFileSync(S2C_PATH, 'utf8'), JSON.stringify(built, null, 2) + '\n', 'node scripts/supertrader/replication/minervini/artifacts.mjs --write');
  for (const c of built.chains) {
    if (c.code.status === 'NOT_IMPLEMENTED') continue;
    assert.equal(c.code.exported, true, `${c.ruleId}: ${c.code.module}#${c.code.function}`);
    assert.ok(c.tests.length > 0, `${c.ruleId}: kein Test`);
    for (const t of c.tests) assert.equal(t.present, true, `${c.ruleId}: Test ${t.id} fehlt`);
  }
  for (const r of RULEBOOK.rules) {
    for (const k of ['id', 'category', 'canonicalDescription', 'sources', 'sourceConfidence', 'provenanceClass', 'reproducibility', 'requiredData', 'availableData', 'formalization', 'implementation', 'test', 'fidelity']) assert.ok(k in r, `${r.id}: ${k}`);
    for (const s of r.sources) assert.ok(RULEBOOK.sources.some((x) => x.id === s), `${r.id}: Quelle ${s}`);
    if (r.provenanceClass === 'VU_FORMALIZATION' || /VU-Formalisierung einer diskretionaeren/.test(r.formalization.text)) assert.ok(r.formalization.text.length > 40, r.id);
  }
});
test('MR-T-DATA-MAPPING: jede Fundamental-Regel hat eine Datenzeile; fehlende Daten sind nicht durch Proxys ersetzt', () => {
  const m = JSON.parse(read('scripts/supertrader/fidelity/MINERVINI-DATA-MAPPING.json'));
  const ids = new Set(m.mapping.map((x) => x.ruleId));
  for (const r of RULEBOOK.rules.filter((x) => x.category === 'FUNDAMENTAL')) assert.ok(ids.has(r.id), r.id);
  for (const x of m.mapping) if (x.implementable === 'NO') assert.equal(x.proxyUsed, false, x.ruleId);
});
test('MR-T-FREEZE: ein vorhandener Freeze passt zu Regelbuch und Engine-Code (sonst neue Version + neuer Freeze)', () => {
  if (!fs.existsSync(FREEZE_PATH)) return;
  const f = JSON.parse(fs.readFileSync(FREEZE_PATH, 'utf8'));
  if (f.status !== 'FROZEN') return;
  const v = verifyFreeze();
  assert.equal(v.ok, true, v.reason);
  assert.equal(f.engine.version, RULEBOOK.engine.version);
});

// ---------------------------------------------------------------- Regressionen aus dem Code-Red-Team
test('MR-T-RT-UNIT: Stueckelung in echten Aktien (unit = rawClose/close); spaeterer Reverse-Split verwirft den Trade nicht', () => {
  const s = seg('X', [10000, 10300, 10300, 10300], { 0: { pivot: 10100, stop: 9700, baseStart: 0 } });
  s.rawClose = s.close.map((c) => c / 100); // spaeterer 1:100-Reverse-Split: bereinigter Kurs 100x Rohkurs
  const r = simulatePortfolio([s], s.date, P);
  assert.equal(r.trades.length, 1);
  const raw = r.trades[0].shares0 * 100; // unit 0,01 bereinigte Stueck je Roh-Aktie
  assert.ok(Math.abs(raw - Math.round(raw)) < 1e-6, 'ganze Roh-Aktien');
  const t = seg('Y', [50, 52, 52, 52], { 0: { pivot: 51, stop: 49, baseStart: 0 } });
  t.rawClose = t.close.map((c) => c * 2); // spaeterer 2:1-Split
  const r2 = simulatePortfolio([t], t.date, P);
  const raw2 = r2.trades[0].shares0 / 2;
  assert.ok(Math.abs(raw2 - Math.round(raw2)) < 1e-6);
});
test('MR-T-RT-DIVIDEND-ENTRY-DAY: Kauf am Ex-Tag erhaelt keine Dividende', () => {
  const s = seg('X', [100, 103, 103, 103], { 0: { pivot: 101, stop: 97, baseStart: 0 } }, { divAdj: [0, 2, 0, 0] });
  assert.equal(simulatePortfolio([s], s.date, P).trades.length, 1);
  const r = simulatePortfolio([s], s.date, P);
  assert.equal(r.book.dividends, 0);
});
test('MR-T-RT-NAN-OPEN: fehlende Eroeffnung am Ausbruchstag -> Fuellung am Pivot statt Abbruch', () => {
  const s = seg('X', [100, 103, 103, 103], { 0: { pivot: 101, stop: 97, baseStart: 0 } });
  s.open[1] = NaN;
  const r = simulatePortfolio([s], s.date, P);
  assert.ok(Math.abs(r.trades[0].entryPrice - 101 * 1.001) < 1e-9);
  assert.equal(simulateSignals(s, P).length, 1);
});
test('MR-T-RT-ORDER-GAP: Order verfaellt, wenn der naechste Balken nicht der naechste Kalendertag ist', () => {
  const s = seg('X', [100, 103, 103, 103], { 0: { pivot: 101, stop: 97, baseStart: 0 } });
  const cal = dates(5, '2021-01-04');
  const gap = { ...s, date: [cal[0], cal[2], cal[3], cal[4]] };
  assert.equal(simulatePortfolio([gap], cal, P).trades.length, 0);
});
test('MR-T-RT-UNIT-MAJORITY: Waehrung der Reihe = haeufigste Einheit (USD nur bei Gleichstand bevorzugt)', () => {
  const eur = Array.from({ length: 6 }, (_, k) => e(`202${k}-01-01`, `202${k}-03-31`, 10 + k, `202${k}-05-01`, '20-F'));
  const cf = { facts: { 'us-gaap': { Revenues: { units: { USD: [e('2023-01-01', '2023-03-31', 1, '2023-05-01')], EUR: eur } }, EarningsPerShareBasic: { units: { 'EUR/shares': eur } } } } };
  assert.equal(extractCompanyFacts(cf).units.money, 'EUR');
});
test('MR-T-RT-SIGNAL-DELIST: Signal am letzten Tag eines delisteten Titels wird als Delisting gebucht', () => {
  const s = seg('X', [100, 100, 103], { 1: { pivot: 101, stop: 97, baseStart: 0 } }, { delisted: true });
  const out = simulateSignals(s, P);
  assert.equal(out[0].open, false);
  assert.ok(out[0].exits.includes('MR-EXE-04-DELIST'));
});
test('MR-T-RT-SPLIT-HISTORY: fehlende Kurshistorie vor der Vorjahres-Einreichung ist ein Datengrund (MR-PIT-01), kein Fundamentalurteil', () => {
  const f = fundFixture();
  const raw = dates(300, '2022-09-01').map((d) => ({ date: d, splitFactor: 1 }));
  const r = evaluateSepa(f, '2023-06-01', makeSplitRatio(raw), P);
  assert.equal(r.ruleId, 'MR-PIT-01'); assert.match(r.reason, /^PIT_SPLIT_HISTORY_UNKNOWN/);
});
