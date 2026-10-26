// Supertrader 8.0 – EOD-Datenadapter und Datenqualitätsvertrag (Phase A). Synthetische Daten in einem Temp-Verzeichnis;
// kein Test liest oder schreibt Produktionsdaten.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createCalendar, loadUniverse, loadEodSecurities, loadContinuity, marketAsOf, inputsSha256, toResearchBars, corporateActionDates, securityIdOf } from '../source-faithful/product/eod-adapter.mjs';
import { assessSecurity, assessStrategyHistory, quarantinedSessions, weeklyLookbackCheck, STRATEGY_DATA_NEEDS, MAX_MISSING_SESSIONS } from '../source-faithful/product/data-quality.mjs';
import { CONTRACTS } from '../source-faithful/registry.mjs';

const CAL = createCalendar({ calendar: { coverage: { from: '2022-01-01', to: '2027-12-31', specialClosures: {} }, exchanges: { XNYS: { weekdays: [1, 2, 3, 4, 5], holidays: ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25', '2025-11-27', '2025-12-25'] } } } });

/** n XNYS-Sitzungen bis `to`, ruhiger Aufwärtstrend, hohes Volumen (im Forschungsuniversum). */
function makeBars(n, to = '2026-10-23', { start = 50, step = 0.05, volume = 1_000_000 } = {}) {
  const days = CAL.sessionsBetween('2024-01-01', to).slice(-n);
  return days.map((date, k) => { const c = start + k * step; return { date, open: c - 0.1, high: c + 0.3, low: c - 0.3, close: c, volume }; });
}
const meta = (x = {}) => ({ instrumentType: 'EQUITY_COMMON', activeStatus: 'ACTIVE', adjustmentStatus: 'adjusted', caReconciliation: 'PASS', splitEvents: 0, ...x });
const sec = (bars, m = {}) => ({ id: 'ref_TEST', ticker: 'TEST', bars, terminal: null, meta: meta(m) });
const weeklyCovering = (asOf) => { const out = []; for (let d = CAL.addDays(asOf, -460); d <= asOf; d = CAL.addDays(d, 7)) out.push({ date: d, close: 50 }); return out; };
const assess = (s, extra = {}) => assessSecurity(s, { asOf: '2026-10-23', calendar: CAL, weekly: weeklyCovering('2026-10-23'), continuity: { bySecurityId: new Map() }, ...extra });
const chk = (r, id) => r.checks.find((c) => c.id === id);

test('SF8-CAL: XNYS-Sitzungen, Folgesitzung über Wochenende und Feiertag', () => {
  assert.equal(CAL.nextSession('2026-10-23'), '2026-10-26');
  assert.equal(CAL.nextSession('2026-11-25'), '2026-11-27');
  assert.equal(CAL.isSession('2026-07-03'), false);
  assert.equal(CAL.sessionsBetween('2026-10-19', '2026-10-25').length, 5);
});

test('SF8-ADAPTER-LOAD: nur kanonische, split-adjustierte Echtdaten; Identität über core/identity.js; Doppelte abgelehnt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf8-adapter-'));
  const w = (rel, obj, gz = false) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, gz ? zlib.gzipSync(JSON.stringify(obj)) : JSON.stringify(obj)); };
  const bars = makeBars(30);
  const inst = (sym, x = {}) => ({ securityId: securityIdOf(sym), dataMode: 'real', isMock: false, priceSeriesType: 'SPLIT_ADJUSTED', provenance: { adjustmentStatus: 'adjusted', corporateActionReconciliation: { status: 'PASS' } }, bars: { timestamps: bars.map((b) => b.date), open: bars.map((b) => b.open), high: bars.map((b) => b.high), low: bars.map((b) => b.low), close: bars.map((b) => b.close), volume: bars.map((b) => b.volume), corporateActionFlags: bars.map((_, k) => (k === 3 ? ['DIVIDEND'] : null)) }, ...x });
  w('discover/data/stock-index/US_REAL.json', { universeId: 'US_REAL', symbols: ['AAA', 'BRK.B', 'MOCK', 'ADJ', 'ETFX', 'BAD'] });
  w('quant/data/market/security-master/company-names.json', { rows: [{ ticker: 'AAA', companyName: 'Alpha Inc', exchange: 'NYSE' }, { ticker: 'ETFX', companyName: 'Some Index ETF', exchange: 'NYSE ARCA' }] });
  w('quant/data/market/security-master/us-security-master.json', { rows: [{ ticker: 'AAA', instrument_type: 'EQUITY_COMMON', active_status: 'ACTIVE' }] });
  w('quant/data/product/technical-signals-v1/AA.json.gz', { generatedAt: '2026-10-24T00:00:00Z', instruments: { AAA: inst('AAA'), 'BRK.B': inst('BRK.B'), MOCK: inst('MOCK', { isMock: true }), ADJ: inst('ADJ', { priceSeriesType: 'RAW' }), BAD: inst('BAD', { securityId: 'ref_BAD.X' }), ETFX: inst('ETFX') } }, true);
  w('quant/data/product/technical-signals-v1/summary.json', {});
  const u = loadUniverse({ root });
  assert.deepEqual(u.excluded, [['ETFX', 'EXCHANGE_NYSE_ARCA']]);
  const r = loadEodSecurities({ root, universe: u });
  assert.deepEqual(r.securities.map((s) => [s.ticker, s.id]), [['AAA', 'ref_AAA'], ['BRK.B', 'ref_BRK_B']]);
  assert.deepEqual(Object.fromEntries(r.rejected.map((x) => [x.ticker, x.reasons])), { ADJ: ['NOT_SPLIT_ADJUSTED'], BAD: ['IDENTITY_MISMATCH'], MOCK: ['NOT_REAL_DATA'] });
  assert.equal(r.securities[0].bars.length, 30);
  assert.deepEqual(r.securities[0].bars[0], bars[0]);
  assert.deepEqual(r.securities[0].meta.corporateActions, [{ date: bars[3].date, flags: ['DIVIDEND'] }]);
  assert.equal(r.sourceFiles.length, 1);
  assert.equal(marketAsOf(r.securities), '2026-10-23');
  assert.equal(inputsSha256(r.securities[0]), inputsSha256(structuredClone(r.securities[0])), 'deterministisch');
  fs.rmSync(root, { recursive: true, force: true });
});

test('SF8-ADAPTER-CONTINUITY: Spalten des Listing-Schutzes nach dem Erzeuger', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf8-cont-'));
  fs.mkdirSync(path.join(root, 'quant/data/market'), { recursive: true });
  fs.writeFileSync(path.join(root, 'quant/data/market/listing-continuity-v1.json'), JSON.stringify({ engine: 'x', productUniverse: { rows: [['ref_ZZ', 'ZZ', 400, 12, '2024-01-02', '2026-06-01', '2026-10-03']] } }));
  const c = loadContinuity({ root });
  assert.equal(c.bySecurityId.get('ref_ZZ').keptFrom, '2026-06-01');
  assert.equal(c.bySecurityId.get('ref_ZZ').gapDays, 400);
  fs.rmSync(root, { recursive: true, force: true });
});

test('SF8-ADAPTER-RAW: toResearchBars übernimmt Kurse unverändert, Flags je Datum', () => {
  const raw = { bars: { timestamps: ['2026-10-22T00:00:00Z', '2026-10-23'], open: [1, 2], high: [3, 4], low: [0.5, 1.5], close: [2, 3], volume: [10, 20], corporateActionFlags: [null, ['SPLIT', 'DIVIDEND']] } };
  assert.deepEqual(toResearchBars(raw), [{ date: '2026-10-22', open: 1, high: 3, low: 0.5, close: 2, volume: 10 }, { date: '2026-10-23', open: 2, high: 4, low: 1.5, close: 3, volume: 20 }]);
  assert.deepEqual(corporateActionDates(raw), [{ date: '2026-10-23', flags: ['DIVIDEND', 'SPLIT'] }]);
});

test('SF8-DQ-PASS: sauberer, liquider, aktueller Titel ohne Quarantäne erlaubt jede Stufe bis MODELED', () => {
  const r = assess(sec(makeBars(270)));
  assert.equal(r.status, 'PASS'); assert.equal(r.maxStage, 'MODELED_TRADE_PLAN');
  assert.deepEqual(r.quarantinedSessions, []);
});

test('SF8-DQ-FRESHNESS: veralteter letzter Balken -> FAIL (keine normale Bewertung)', () => {
  const r = assess(sec(makeBars(270, '2026-10-20')));
  assert.equal(r.status, 'FAIL'); assert.equal(r.maxStage, null);
  assert.deepEqual(chk(r, 'FRESHNESS').detail, { lastBar: '2026-10-20', asOf: '2026-10-23', sessionsBehind: 3 });
});

test('SF8-DQ-OHLCV: unplausible Balken -> FAIL, nichts wird repariert', () => {
  const b = makeBars(270); b[100] = { ...b[100], high: b[100].low - 1 };
  assert.equal(assess(sec(b)).status, 'FAIL');
  const n = makeBars(270); n[50] = { ...n[50], close: NaN };
  assert.equal(chk(assess(sec(n)), 'OHLCV_INTEGRITY').status, 'FAIL');
});

test('SF8-DQ-SESSIONS: fehlende Handelstage -> CAP CHART; mehr als MAX_MISSING_SESSIONS -> FAIL; Balken am Feiertag -> FAIL', () => {
  const b = makeBars(270); b.splice(200, 2);
  const r = assess(sec(b));
  assert.equal(chk(r, 'SESSIONS').status, 'CAP'); assert.equal(r.maxStage, 'CHART_CANDIDATE');
  const many = makeBars(270); many.splice(100, MAX_MISSING_SESSIONS + 1);
  assert.equal(chk(assess(sec(many)), 'SESSIONS').status, 'FAIL');
  const hol = makeBars(270); hol.splice(150, 0, { ...hol[150], date: '2026-07-03' }); hol.sort((a, c) => (a.date < c.date ? -1 : 1));
  assert.equal(chk(assess(sec(hol)), 'SESSIONS').status, 'FAIL');
});

test('SF8-DQ-QUARANTINE: DQ-K5 / DQ-K3 im 400-Tage-Rückblick sperren über CHART (V4-D1); außerhalb nicht', () => {
  const b = makeBars(270); for (let k = 200; k < b.length; k++) b[k] = { ...b[k], open: b[k].open * 6, high: b[k].high * 6, low: b[k].low * 6, close: b[k].close * 6 };
  const r = assess(sec(b));
  assert.deepEqual(r.quarantinedSessions, [{ date: b[200].date, flag: 'DQ-K5' }]);
  assert.equal(r.maxStage, 'CHART_CANDIDATE');
  const k3 = makeBars(270); for (let k = 200; k < k3.length; k++) k3[k] = { ...k3[k], open: k3[k].open / 3.5, high: k3[k].high / 3.5, low: k3[k].low / 3.5, close: k3[k].close / 3.5 };
  assert.deepEqual(assess(sec(k3)).quarantinedSessions.map((q) => q.flag), ['DQ-K3']);
  // eine Sitzung vor dem Rückblick zählt nicht
  assert.deepEqual(quarantinedSessions(b, CAL.addDays(b[200].date, 401), CAL), []);
});

test('SF8-DQ-LOOKBACK: Rest des Rückblicks über Wochenschlüsse; fehlt die Reihe, bleibt der Titel CHART (fail closed)', () => {
  const b = makeBars(270), asOf = '2026-10-23';
  assert.equal(weeklyLookbackCheck(weeklyCovering(asOf), b[0].date, asOf, CAL).status, 'COVERED');
  assert.equal(weeklyLookbackCheck(null, b[0].date, asOf, CAL).status, 'INCOMPLETE');
  const jump = weeklyCovering(asOf).map((p) => (p.date > CAL.addDays(asOf, -395) ? { ...p, close: 200 } : p));
  assert.equal(weeklyLookbackCheck(jump, b[0].date, asOf, CAL).status, 'WEEKLY_DISCONTINUITY');
  assert.equal(assess(sec(b), { weekly: null }).maxStage, 'CHART_CANDIDATE');
  // deckt das Tagesfenster den Rückblick ab, braucht es keine Wochenreihe
  assert.equal(weeklyLookbackCheck(null, CAL.addDays(asOf, -401), asOf, CAL).status, 'NOT_NEEDED');
});

test('SF8-DQ-IDENTITY: Nicht-Stammaktie FAIL, inaktiv FAIL, unbekannt CAP, SPAC-Hinweis CAP, Neustart der Reihe im Rückblick CAP, ADR nur INFO', () => {
  assert.equal(assess(sec(makeBars(270), { instrumentType: 'WARRANT' })).status, 'FAIL');
  assert.equal(assess(sec(makeBars(270), { activeStatus: 'INACTIVE' })).status, 'FAIL');
  assert.equal(assess(sec(makeBars(270), { instrumentType: null })).maxStage, 'CHART_CANDIDATE');
  assert.equal(assess(sec(makeBars(270), { spacHint: true })).maxStage, 'CHART_CANDIDATE');
  const adr = assess(sec(makeBars(270), { adrHint: true }));
  assert.equal(adr.maxStage, 'MODELED_TRADE_PLAN'); assert.equal(chk(adr, 'IDENTITY_ADR_LISTING').status, 'INFO');
  const cont = { bySecurityId: new Map([['ref_TEST', { keptFrom: '2026-03-02', gapDays: 500 }]]) };
  assert.equal(assess(sec(makeBars(270)), { continuity: cont }).maxStage, 'CHART_CANDIDATE');
  const old = { bySecurityId: new Map([['ref_TEST', { keptFrom: '2019-03-01', gapDays: 500 }]]) };
  assert.equal(assess(sec(makeBars(270)), { continuity: old }).maxStage, 'MODELED_TRADE_PLAN');
});

test('SF8-DQ-ADJUSTMENT: nicht abgeglichene Corporate Actions FAIL, unbekannter Abgleich CAP', () => {
  assert.equal(assess(sec(makeBars(270), { caReconciliation: 'FAIL' })).status, 'FAIL');
  assert.equal(assess(sec(makeBars(270), { adjustmentStatus: 'raw' })).status, 'FAIL');
  assert.equal(assess(sec(makeBars(270), { caReconciliation: null })).maxStage, 'CHART_CANDIDATE');
});

test('SF8-DQ-LIQUIDITY: unter dem Forschungsuniversum kein Plan (CAP CONFIRMED), aber Chart und Setup bleiben möglich', () => {
  const r = assess(sec(makeBars(270, '2026-10-23', { volume: 1000 })));
  assert.equal(chk(r, 'LIQUIDITY_RESEARCH_UNIVERSE').status, 'CAP');
  assert.equal(r.maxStage, 'CONFIRMED_RESEARCH_SETUP');
  const penny = assess(sec(makeBars(270, '2026-10-23', { start: 2, step: 0 })));
  assert.equal(penny.maxStage, 'CONFIRMED_RESEARCH_SETUP');
});

test('SF8-DQ-HISTORY: Datenbedarf für alle 13 Strategien deklariert; zu kurze Historie -> keine Erkennung', () => {
  assert.deepEqual(Object.keys(STRATEGY_DATA_NEEDS).sort(), CONTRACTS.map((c) => c.strategyId).sort());
  assert.equal(assessStrategyHistory('SF_MINERVINI_SEPA_VCP', makeBars(251)).status, 'FAIL');
  assert.equal(assessStrategyHistory('SF_MINERVINI_SEPA_VCP', makeBars(252)).status, 'PASS');
  for (const [id, n] of Object.entries(STRATEGY_DATA_NEEDS)) { assert.ok(n.minBars <= 270, `${id} braucht mehr als das Tagesfenster`); assert.ok(['DAILY', 'WEEKLY_FROM_DAILY'].includes(n.interval)); }
  assert.equal(STRATEGY_DATA_NEEDS.SF_KK_EPISODIC_PIVOT.intraday, 'DATA_BLOCKED');
  assert.equal(STRATEGY_DATA_NEEDS.SF_KK_PARABOLIC_SHORT.intraday, 'DATA_BLOCKED');
});

test('SF8-ADAPTER-READ-ONLY: Adapter und DQ schreiben nichts und rufen nichts aus dem Netz', () => {
  for (const f of ['eod-adapter.mjs', 'data-quality.mjs']) {
    const src = fs.readFileSync(new URL(`../source-faithful/product/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /writeFileSync|appendFileSync|mkdirSync|createWriteStream|fetch\(|https?:\/\/|child_process/, f);
  }
});
