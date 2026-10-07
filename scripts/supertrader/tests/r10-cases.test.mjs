import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, blockingRules, tally } from '../validation/case-report.mjs';
import { forwardMax, sicDivision, explainNull } from '../validation/case-study.mjs';

const tr = (days, extra = {}) => ({ window: ['2023-01-01', '2023-12-31'], episode: ['2023-03-01', '2023-12-31'], days, signals: [], gaps: 0, segEnd: '2024-06-30', ...extra });

test('R10-C1 Ursachenreihenfolge: Datenlücke vor Kandidat', () => {
  assert.equal(classify(null, [], 3).cause, 'DATA_NOT_IN_UNIVERSE');
  assert.equal(classify(tr([], { segEnd: '2023-06-01' }), [], 3).cause, 'DATA_GAP');
  assert.equal(classify(tr([['2023-03-02', 'RAW_GATE', []], ['2023-03-03', null, ['LIQ_DOLLAR_VOLUME']]]), [], 3).cause, 'PRICE_LIQUIDITY');
  const nc = classify(tr([['2023-03-02', null, ['MIN-TREND-02']], ['2023-03-03', 'DISCOVERED', ['MIN-VCP-01']]]), [], 3);
  assert.equal(nc.cause, 'NOT_CANDIDATE');
  assert.deepEqual(nc.blocking.map((x) => x[0]).sort(), ['MIN-TREND-02', 'MIN-VCP-01']);
});

test('R10-C2 Kandidat ohne Einstieg, Einstieg ohne Platz, zu früh verkauft, erfasst', () => {
  const days = [['2023-03-02', 'SETUP', []]];
  const sig = [{ transitions: [['2023-03-02', 'SETUP', 'X'], ['2023-03-05', 'INVALIDATED', 'MIN-ENTRY-D2']] }];
  const ne = classify(tr(days, { signals: sig }), [], 3);
  assert.equal(ne.cause, 'NO_ENTRY'); assert.equal(ne.invalidations[0][0], 'MIN-ENTRY-D2');
  const t = (o) => ({ entry: { date: '2023-03-10', price: 10 }, exits: [{ date: '2023-04-01', ruleId: 'S' }], taken: true, weightAtEntry: 0.04, returnPct: 0.1, ...o });
  assert.equal(classify(tr(days), [t({ taken: false, skipReason: 'MAX_POSITIONS' })], 3).cause, 'NOT_IN_PORTFOLIO');
  const ee = classify(tr(days), [t()], 3);
  assert.equal(ee.cause, 'EARLY_EXIT'); assert.equal(ee.smallWeight, true);
  assert.equal(classify(tr(days), [t({ returnPct: 1.0 })], 3).cause, 'CAPTURED');
  assert.equal(tally([{ engine: 'A', role: 'WINNER', cause: 'CAPTURED' }])['A|WINNER'].CAPTURED, 1);
  assert.equal(blockingRules([['d', 'SETUP', ['x']]]).length, 0);
});

test('R10-C3 Auswahlhilfen: Vorwärtsmaximum ohne Starttag, SIC-Division', () => {
  const r = forwardMax([1, 2, 3, 2, 5, 1]);
  assert.deepEqual(Array.from(r.max).slice(0, 5), [5, 5, 5, 5, 1]);
  assert.ok(Number.isNaN(r.max[5]));
  assert.equal(sicDivision('3572'), 'D'); assert.equal(sicDivision('7372'), 'I'); assert.equal(sicDivision(null), null);
});

test('R10-C4 explainNull nennt Preis- und Liquiditätsgrenzen', () => {
  const e = { id: 'DONCHIAN_TURTLE', PARAMS: { minPrice: 10, minDollarVolume: 20e6, minAdr: 0.01 } };
  const ctx = { raw: { close: [5] }, ind: { dollarVol20: [1e6], adr20: [0.02] }, bars: {}, cross: {} };
  assert.deepEqual(explainNull(e, ctx, 0), ['RAW_PRICE', 'LIQ_DOLLAR_VOLUME', 'DON-NOT-NEAR-CHANNEL']);
});

test('R10-V1 iPhone: Minutenbeleg nennt IEX als einzelnen Handelsplatz, kein „Minuten geprüft“ ohne Quelle', async () => {
  const fs = await import('node:fs');
  const js = fs.readFileSync(new URL('../../../supertrader/assets/supertrader.js', import.meta.url), 'utf8');
  assert.ok(js.includes("' · IEX-Minuten geprüft'"));
  assert.ok(!js.includes("' · Minuten geprüft'"));
  assert.ok(js.includes('IEX ist ein einzelner Handelsplatz ohne Eröffnungsauktion'));
});

test('R10-K3 Portfolio: Rang nach relativer Stärke (Vortag) statt Alphabet, Gleichstand alphabetisch', async () => {
  const { runPortfolioTR } = await import('../validation/portfolio.mjs');
  const mk = (id, rs) => ({ id, listingId: id, rsAtEntry: rs, entry: { date: '2024-01-02', price: 10 }, initialStop: 9, exits: [{ date: '2024-01-05', price: 11, fraction: 1, ruleId: 'X' }], terminal: null, marks: new Map([['2024-01-02', 10], ['2024-01-03', 10], ['2024-01-05', 11]]), divs: new Map() });
  const trades = [mk('AAA', 50), mk('ZZZ', 99), mk('MMM', 99)];
  const cfg = { initialEquity: 100000, riskPerTrade: 0.01, maxPositionPct: 0.2, maxPositions: 1, maxExposure: 1 };
  const cal = ['2024-01-02', '2024-01-03', '2024-01-05'];
  assert.equal(runPortfolioTR(trades, cal, cfg).taken[0].tr.id, 'AAA');
  assert.equal(runPortfolioTR(trades, cal, cfg, { priority: 'RS' }).taken[0].tr.id, 'MMM');
  assert.equal(runPortfolioTR(trades, cal, { ...cfg, priority: 'RS' }).taken[0].tr.id, 'MMM');
});

test('R10-U1 Universum: ETNs der Emittentenbank, Fonds, Produkte und NYSE Arca raus; echte Aktien und BDCs bleiben', async () => {
  const { nonStockProduct } = await import('../validation/lib.mjs');
  assert.equal(nonStockProduct({ ticker: 'NRGU', exchange: 'NYSE ARCA', name: 'Bank of Montreal' }), 'EXCHANGE_NYSE_ARCA');
  assert.equal(nonStockProduct({ ticker: 'FNGU', exchange: 'NYSE', name: 'BANK OF MONTREAL /CAN/' }), 'ETN_ISSUER');
  assert.equal(nonStockProduct({ ticker: 'BMO', exchange: 'NYSE', name: 'Bank of Montreal' }), null);
  assert.equal(nonStockProduct({ ticker: 'VOLT', exchange: 'NASDAQ', name: 'Tema Electrification ETF' }), 'PRODUCT_NAME');
  assert.equal(nonStockProduct({ ticker: 'RMI', exchange: 'NYSE', name: 'RiverNorth Opportunistic Municipal Income Fund Inc' }), 'FUND_NAME');
  assert.equal(nonStockProduct({ ticker: 'BXSL', exchange: 'NYSE', name: 'Blackstone Secured Lending Fund.' }), null);
  for (const [t, n] of [['SMCI', 'Super Micro Computer Inc'], ['O', 'Realty Income Corp'], ['NFLX', 'Netflix Inc'], ['DB', 'Deutsche Bank AG']]) assert.equal(nonStockProduct({ ticker: t, exchange: 'NASDAQ', name: n }), null, t);
});

test('R10-U2 Live-Universum enthält keine ETNs/Fonds mehr (Stammdaten-Fehlklassifikation abgefangen)', async () => {
  const m = await import('../build.mjs');
  const u = m.loadUniverse();
  for (const s of ['NRGU', 'FNGU', 'BULZ', 'ZCSH', 'VOLT']) assert.ok(!u.has(s), s);
  assert.ok(u.has('SMCI'));
  assert.ok(m.UNIVERSE_EXCLUDED.length > 100 && m.UNIVERSE_EXCLUDED.length < 600);
});
