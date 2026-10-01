// Interner Datentest (Validierung): reine Bausteine ohne Netz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as L from '../validation/lib.mjs';
import { runPortfolioTR, reconcile } from '../validation/portfolio.mjs';
import { rawToCtx, tradesFor, verifyTrade, rawGateStrategy } from '../validation/analyze.mjs';
import { pickSubset } from '../validation/fetch.mjs';
import { runPortfolio, PORTFOLIO_DEFAULTS } from '../engine/backtest.mjs';
import donchian from '../engine/strategies/donchian.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

function tradingDays(from, n) {
  const out = []; const d = new Date(from + 'T00:00:00Z');
  while (out.length < n) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
// Seitwaerts, dann Ausbruch nach oben, dann Abschwung; optional Split und Dividende.
function synth(from, n, { base = 50, split = null, div = null, crash = false } = {}) {
  const dates = tradingDays(from, n);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  let p = base; const bars = [];
  for (let i = 0; i < n; i++) {
    const drift = i > 120 && i < 170 ? 0.012 : i >= 170 && i < 200 ? -0.015 : 0;
    p *= 1 + drift + rnd() * 0.01;
    if (crash && i > n - 60) p *= 0.97;
    let sf = 1; if (split && dates[i] === split.date) { sf = split.factor; }
    const k = split && dates[i] >= split.date ? split.factor : 1;
    const c = p / k;
    bars.push({ date: dates[i], open: c * (1 + rnd() * 0.004), high: c * 1.012, low: c * 0.988, close: c, volume: 1e6 * k, adjClose: null, dividend: div && dates[i] === div.date ? div.amount : 0, splitFactor: sf });
  }
  return bars;
}

test('V-L1 Listing-Tabelle: Boersenwechsel ist EIN Listing, Neuvergabe trennt alt/neu, nur das neueste ist abrufbar', () => {
  const rows = [
    { ticker: 'ABC', exchange: 'NYSE', assetType: 'Stock', priceCurrency: 'USD', startDate: '2005-01-03', endDate: '2017-06-30' },
    { ticker: 'ABC', exchange: 'NASDAQ', assetType: 'Stock', priceCurrency: 'USD', startDate: '2021-03-01', endDate: '2026-09-30' },
    { ticker: 'XYZ', exchange: 'NYSE', assetType: 'Stock', priceCurrency: 'USD', startDate: '2001-01-02', endDate: '2016-05-02' },
    { ticker: 'XYZ', exchange: 'NASDAQ', assetType: 'Stock', priceCurrency: 'USD', startDate: '2016-05-05', endDate: '2019-02-01' },
    { ticker: 'OLD', exchange: 'NYSE', assetType: 'Stock', priceCurrency: 'USD', startDate: '1990-01-02', endDate: '2010-01-01' },
    { ticker: 'ETFX', exchange: 'NYSE ARCA', assetType: 'ETF', priceCurrency: 'USD', startDate: '2010-01-04', endDate: '2026-09-30' },
  ];
  const t = L.buildListingTable(rows, new Map([['ABC', { startDate: '2021-03-01', instrumentType: 'EQUITY_COMMON' }]]));
  const by = Object.fromEntries(t.map((l) => [l.id, l]));
  assert.equal(t.length, 3, JSON.stringify(t.map((l) => l.id)));
  assert.equal(by['tiingo:NYSE:ABC:2005-01-03'].source, 'UNFETCHABLE_REUSED');
  assert.equal(by['tiingo:NASDAQ:ABC:2021-03-01'].source, 'STORE_ACTIVE');
  const xyz = by['tiingo:NASDAQ:XYZ:2001-01-02'];
  assert.ok(xyz, 'Boersenwechsel mit 3 Tagen Abstand = ein Listing');
  assert.equal(xyz.source, 'FETCH'); assert.equal(xyz.endDate, '2019-02-01'); assert.equal(xyz.mergedRows, 2);
});

test('V-L2 Abrufklassifikation: Balken ausserhalb des Listings werden verworfen; nur neue Firma = MISMATCH', () => {
  const l = { id: 'x', startDate: '2010-01-04', listEnd: '2018-06-15', active: false };
  const bars = tradingDays('2015-01-02', 900).filter((d) => d <= '2018-06-14').map((d) => ({ date: d, close: 1 }));
  assert.equal(L.classifyFetch(l, bars, { startDate: '2010-01-04', endDate: '2018-06-15' }).status, 'OK');
  const late = tradingDays('2021-01-04', 200).map((d) => ({ date: d, close: 1 }));
  const r = L.classifyFetch(l, late, { startDate: '2021-01-04' });
  assert.equal(r.status, 'MISMATCH'); assert.equal(r.outsideWindow, 200);
  const early = bars.filter((d) => d.date <= '2017-01-01');
  assert.equal(L.classifyFetch(l, early, null).status, 'PARTIAL');
});

test('V-L3 Split-Rueckrechnung und Gesamtrendite aus Rohkursen', () => {
  const raw = [
    { date: '2020-01-02', open: 100, high: 101, low: 99, close: 100, volume: 10, dividend: 0, splitFactor: 1 },
    { date: '2020-01-03', open: 50, high: 51, low: 49, close: 51, volume: 20, dividend: 0, splitFactor: 2 },
    { date: '2020-01-06', open: 51, high: 52, low: 50, close: 50, volume: 20, dividend: 1, splitFactor: 1 },
  ];
  const a = L.adjustSeries(raw);
  assert.deepEqual(a.close, [50, 51, 50]);
  assert.deepEqual(a.volume, [20, 20, 20]);
  assert.ok(Math.abs(a.tr[1] - 0.02) < 1e-12);
  assert.ok(Math.abs(a.tr[2] - 0) < 1e-12);
  assert.deepEqual(a.rawClose, [100, 51, 50]);
  const sc = L.splitChecks(raw.map((b, i) => ({ ...b, adjClose: [50, 51, 50][i] })));
  assert.equal(sc.length, 1); assert.equal(sc[0].ok, true);
});

test('V-L4 Distress-Signatur und Verschluesselung (nur Eigentuemer kann lesen)', () => {
  assert.equal(L.distressSignature([5, 4, 0.8]), true);
  assert.equal(L.distressSignature(Array.from({ length: 70 }, (_, i) => 20 - i * 0.2)), true);
  assert.equal(L.distressSignature(Array.from({ length: 70 }, () => 20)), false);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const sealed = L.encryptForOwner(pem, Buffer.from('{"cagr":0.123}'));
  assert.ok(!sealed.includes('cagr'));
  assert.equal(L.decryptSealed(privateKey.export({ type: 'pkcs8', format: 'pem' }), sealed).toString(), '{"cagr":0.123}');
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), /BEGIN PUBLIC KEY/);
});

test('V-E1 Engine unveraendert; Rohkursgrenze statt bereinigter Grenze (AT5)', () => {
  const s = rawGateStrategy();
  assert.equal(s.version, donchian.version);
  assert.equal(s.confirm, donchian.confirm); assert.equal(s.manage, donchian.manage); assert.equal(s.planEntry, donchian.planEntry);
  // Reverse-Split 1:20 spaeter: bereinigte Altkurse > 10, Rohkurse ~2,5 -> keine Trades vor dem Split
  const raw = synth('2015-01-02', 420, { base: 2.5 });
  const ctx = rawToCtx('L:PENNY', raw.map((b) => ({ ...b })));
  const { trades } = tradesFor({ id: 'L:PENNY', active: true }, ctx, undefined, false);
  assert.equal(trades.length, 0);
});

test('V-E2 Trades aus der Engine; offene Position am Reihenende eines delisteten Listings wird nicht verschwiegen', () => {
  const raw = synth('2015-06-01', 320, { crash: false });
  const full = rawToCtx('L:A', raw);
  const res = tradesFor({ id: 'L:A', active: true }, full, undefined, false);
  assert.ok(res.trades.length >= 1, 'mindestens ein Trade im Ausbruch');
  for (const t of res.trades.filter((x) => !x.terminal)) { const v = verifyTrade(t, raw); assert.ok(v.ok, JSON.stringify(v)); }
  // Reihe endet mitten im Trend -> offene Position
  const cut = raw.slice(0, 160);
  const del = tradesFor({ id: 'L:D', active: false }, rawToCtx('L:D', cut), undefined, true);
  const term = del.trades.filter((t) => t.terminal);
  assert.equal(term.length, 1); assert.equal(term[0].terminal.kind, 'DELISTED'); assert.equal(term[0].terminal.date, cut[cut.length - 1].date);
});

test('V-P1 Portfolio: Szenarien S0 > S1 >= S2 bei Delisting, Abstimmung C1, Gleichheit mit runPortfolio (C2)', () => {
  const rawA = synth('2015-08-03', 320); const rawD = synth('2015-08-03', 160);
  const A = tradesFor({ id: 'L:A', active: true }, rawToCtx('L:A', rawA), undefined, false).trades;
  const D = tradesFor({ id: 'L:D', active: false }, rawToCtx('L:D', rawD), undefined, true).trades;
  const all = [...A, ...D];
  const cal = [...new Set(rawA.map((b) => b.date))].filter((d) => d >= '2016-01-04').sort();
  const cfg = PORTFOLIO_DEFAULTS;
  const e = {};
  for (const sc of ['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO']) {
    const r = runPortfolioTR(all, cal, cfg, { scenario: sc });
    e[sc] = r.equity[r.equity.length - 1].equity;
    assert.ok(reconcile(r, cfg).relDiff < 1e-9, sc);
  }
  assert.ok(D.some((t) => t.terminal?.kind === 'DELISTED'), 'offene Position am Delisting');
  assert.ok(e.S0_LAST_PRICE > e.S1_MINUS_30 && e.S1_MINUS_30 >= e.S2_DISTRESS_ZERO, JSON.stringify(e));
  // C2
  const plain = all.filter((t) => !t.terminal || t.terminal.kind === 'OPEN_AT_END');
  const sigs = plain.map((t) => ({ symbol: t.listingId, signal: { id: t.id, entry: { ...t.entry }, initialStop: t.initialStop, exits: t.exits.map((x) => ({ ...x })) } }));
  const priceOf = (sym, date) => { for (const t of plain) if (t.listingId === sym && t.marks.has(date)) return t.marks.get(date); return undefined; };
  const eng = runPortfolio(sigs, priceOf, cal, cfg);
  const mine = runPortfolioTR(plain, cal, cfg, { commissionBps: 0, dividends: false, sizingSameDay: true, engineCompat: true });
  for (let i = 0; i < cal.length; i++) assert.ok(Math.abs(eng.equity[i].equity - mine.equity[i].equity) < 1e-6, cal[i]);
});

test('V-P2 Dividende als Barmittel nur bei gehaltener Position; Zufallsreihenfolge deterministisch', () => {
  const t = { id: 'T', listingId: 'L', entry: { date: '2020-01-02', price: 100 }, initialStop: 90, exits: [{ date: '2020-01-07', price: 100, fraction: 1 }], terminal: null,
    marks: new Map([['2020-01-02', 100], ['2020-01-03', 100], ['2020-01-06', 100], ['2020-01-07', 100]]), divs: new Map([['2020-01-02', 5], ['2020-01-06', 1]]) };
  const cal = ['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'];
  const r = runPortfolioTR([t], cal, PORTFOLIO_DEFAULTS, { commissionBps: 0 });
  const shares = r.taken[0].entryShares;
  assert.ok(Math.abs(r.book.dividends - shares * 1) < 1e-9, 'nur die Dividende nach dem Einstiegstag');
  const a = runPortfolioTR([t], cal, PORTFOLIO_DEFAULTS, { seed: 3 }), b = runPortfolioTR([t], cal, PORTFOLIO_DEFAULTS, { seed: 3 });
  assert.deepEqual(a.equity, b.equity);
});

test('V-R1 Praeregistrierung: eingefroren, Szenarien und Akzeptanz vollstaendig, keine oeffentliche Ausgabe', () => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/PREREGISTRATION.json'), 'utf8'));
  assert.equal(p.schema, L.PREREG_VERSION);
  assert.deepEqual(Object.keys(p.delistingReturns.scenarios), ['S0_LAST_PRICE', 'S1_MINUS_30', 'S2_DISTRESS_ZERO']);
  assert.equal(p.strategyAcceptance.robustPositiveRequires.length, 5);
  assert.deepEqual(p.universe.window, { warmupFrom: L.WINDOW.warmupFrom, from: L.WINDOW.from, to: L.WINDOW.to });
  const pub = fs.readdirSync(path.join(ROOT, 'supertrader/data'));
  assert.ok(!pub.some((f) => /validation/i.test(f)), 'keine Validierungsdaten im oeffentlichen Verzeichnis');
  for (const f of ['fetch.mjs', 'analyze.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation', f), 'utf8');
    assert.ok(!/console\.log\([^)]*(cagr|excess|hitRate|returnPct)/i.test(src), f + ' loggt keine Kennzahlen');
  }
});

test('V-S1 Teilmenge: deterministisch, enthaelt fruehe, spaete, neu vergebene und Ankerfaelle', () => {
  const ls = [];
  for (let i = 0; i < 40; i++) ls.push({ id: `tiingo:NYSE:E${i}:2001-01-02`, ticker: 'E' + String.fromCharCode(65 + (i % 26)), source: 'FETCH', active: false, plainTicker: true, endDate: '2016-0' + (1 + (i % 9)) + '-15' });
  for (let i = 0; i < 40; i++) ls.push({ id: `tiingo:NYSE:L${i}:2001-01-02`, ticker: 'L' + String.fromCharCode(65 + (i % 26)), source: 'FETCH', active: false, plainTicker: true, endDate: '2025-0' + (1 + (i % 9)) + '-15' });
  ls.push({ id: 'tiingo:NYSE:TWX:1992-03-19', ticker: 'TWX', source: 'FETCH', active: false, plainTicker: true, endDate: '2018-06-15' });
  for (let i = 0; i < 10; i++) ls.push({ id: `tiingo:NYSE:R${i}:1999-01-04`, ticker: 'R' + i, source: 'UNFETCHABLE_REUSED', active: false, plainTicker: true, endDate: '2012-01-01' });
  const a = pickSubset(ls), b = pickSubset([...ls].reverse());
  assert.deepEqual(a.map((l) => l.id), b.map((l) => l.id));
  assert.equal(a.filter((l) => l.endDate < '2018').length >= 12, true);
  assert.ok(a.some((l) => l.ticker === 'TWX')); assert.equal(a.filter((l) => l.source === 'UNFETCHABLE_REUSED').length, 8);
});
