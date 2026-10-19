// Synthetische Quellen fuer die Snapshot-Tests: Tiingo-Tickerliste (ZIP), Repository-Dateien und
// R2-Reihen in einem Dateisystem-Treiber. Kein Netz, keine Produktionsdaten.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createFsDriver } from '../../market/storage/fs-driver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const Store = require(path.join(root, 'quant/engines/history-store.js'));

export function zipOne(name, text) {
  const data = Buffer.from(text), nm = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nm.length, 28); central.writeUInt32LE(0, 42);
  const cdOff = 30 + nm.length + data.length, cd = Buffer.concat([central, nm]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(cdOff, 16);
  return Buffer.concat([local, nm, data, cd, eocd]);
}

function weekdays(from, to) {
  const out = []; const d = new Date(from + 'T00:00:00Z');
  while (d.toISOString().slice(0, 10) <= to) { const w = d.getUTCDay(); if (w && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function walk(dates, seed, start, opts = {}) {
  let s = seed, px = start; const rnd = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  return dates.filter((d) => !(opts.gap && d > opts.gap[0] && d < opts.gap[1])).map((date, i) => {
    px *= 1 + (rnd() - 0.47) * 0.04 + (opts.trend || 0);
    const o = px * (1 + (rnd() - 0.5) * 0.01), c = px, h = Math.max(o, c) * 1.01, l = Math.min(o, c) * 0.99;
    const split = opts.split && date === opts.split ? 2 : 1;
    if (split !== 1) px /= 2;
    return { date, open: +o.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4), close: +(split !== 1 ? c / 2 : c).toFixed(4), volume: 100000 + Math.floor(rnd() * 50000), dividend: i % 63 === 0 && i ? 0.1 : 0, splitFactor: split };
  });
}

export const TICKERS_CSV = ['ticker,exchange,assetType,priceCurrency,startDate,endDate', 'AAA,NASDAQ,Stock,USD,2014-01-02,2026-10-16', 'BBB,NYSE,Stock,USD,2014-01-02,2026-10-16', 'CCC,NASDAQ,Stock,USD,2014-01-02,2026-10-16', 'ZZZ,NYSE,Stock,USD,2015-03-02,2020-06-30', 'SPY,NYSE ARCA,ETF,USD,1993-01-29,2026-10-16'];

export async function buildSources() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-snapshot-'));
  const driver = createFsDriver(dir);
  const mine = Store.createHistoryStore({ driver, provider: 'tiingo-delisted', market: 'US' });
  const main = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US' });
  const all = weekdays('2015-01-02', '2026-09-30');
  await mine.putSeries({ ticker: 'SPY@1993-01-29', bars: walk(all, 7, 200, { trend: 0.0004 }) });
  await main.putSeries({ ticker: 'AAA', bars: walk(all, 11, 20, { trend: 0.0012, split: '2019-06-03' }) });
  await main.putSeries({ ticker: 'BBB', bars: walk(all, 13, 40, { gap: ['2018-02-01', '2018-04-15'] }) });
  await main.putSeries({ ticker: 'CCC', bars: walk(all, 17, 15, { trend: 0.0008 }) });
  await mine.putSeries({ ticker: 'ZZZ@2015-03-02', bars: walk(all.filter((d) => d >= '2015-03-02' && d <= '2020-06-30'), 19, 8) });
  await driver.put(mine.seriesPrefix + '_validation/manifest.json.gz', zlib.gzipSync(JSON.stringify({ entries: { 'tiingo:NYSE:ZZZ:2015-03-02': { status: 'OK', name: 'Zeta Holdings Inc' } } })));
  await driver.put(mine.seriesPrefix + '_validation/sec-pit-r11.json.gz', zlib.gzipSync(JSON.stringify({ 'tiingo:NASDAQ:AAA:2014-01-02': { eps: [], rev: [] } })));
  const repo = new Map([
    ['quant/data/market/scale/universe-FULL_UNIVERSE.json', Buffer.from(JSON.stringify({ securities: ['AAA', 'BBB', 'CCC'].map((t) => ({ ticker: t, startDate: '2014-01-02', active: true })) }))],
    ['quant/data/market/security-master/eligibility.json', Buffer.from(JSON.stringify({ decisions: ['AAA', 'BBB', 'CCC'].map((t) => ({ ticker: t, instrument_type: 'EQUITY_COMMON' })) }))],
    ['quant/data/market/security-master/company-names.json', Buffer.from(JSON.stringify({ rows: [] }))],
  ]);
  const state = { zip: zipOne('supported_tickers.csv', TICKERS_CSV.join('\n')), zipFetches: 0 };
  const live = {
    kind: 'TEST_LIVE',
    async fetchTickerZip() { state.zipFetches++; return state.zip; },
    readRepoFile: (rel) => repo.get(rel) ?? null,
    async createDriver() { return driver; },
  };
  return { dir, driver, mine, main, repo, live, state };
}
