// SF6-PAPER-2027 1.2.0 – synthetische Quellen je Fenster (DEV, HOLDOUT, PAPER_2027) im Format der Research-Snapshots:
// Tiingo-Tickerliste (ZIP), Repository-Dateien und Reihen in einem Dateisystem-Treiber unter os.tmpdir().
// Kein Netz, keine Produktionsdaten. Genutzt von paper-forward-probe.mjs (Kindprozess je ST_WINDOW).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createFsDriver } from '../../market/storage/fs-driver.mjs';
import { zipOne } from './snapshot-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const Store = require(path.join(root, 'quant/engines/history-store.js'));

function weekdays(from, to) {
  const out = []; const d = new Date(from + 'T00:00:00Z');
  while (d.toISOString().slice(0, 10) <= to) { const w = d.getUTCDay(); if (w && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
// Zufallspfad mit Ausbruechen und Luecken; deterministisch je seed. split: ein 2:1-Split an diesem Datum (Rohkurs halbiert).
function walk(dates, seed, start, opts = {}) {
  let s = seed, px = start; const rnd = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  return dates.map((date, i) => {
    const gap = rnd() < 0.015 ? 0.06 * (rnd() < 0.75 ? 1 : -1) : 0;
    px *= 1 + gap + (rnd() - 0.47) * 0.035 + (opts.trend || 0);
    const split = opts.split && date === opts.split ? 2 : 1;
    if (split !== 1) px /= 2;
    const o = px * (1 + (rnd() - 0.5) * 0.01), c = px, h = Math.max(o, c) * (1 + 0.01 * rnd()), l = Math.min(o, c) * (1 - 0.01 * rnd());
    return { date, open: +o.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4), close: +c.toFixed(4), volume: Math.round(600000 * (0.6 + rnd()) * (gap ? 3 : 1)), dividend: i % 63 === 0 && i ? 0.08 : 0, splitFactor: split };
  });
}

/**
 * Fenster-Profile. DEV und HOLDOUT bilden die bestehenden Fenster nach (dieselben Daten vor und nach der Aenderung von
 * validation/lib.mjs); PAPER_2027 das Forward-Fenster mit rollendem Ende `to` (Sitzung t).
 *   store   aktive Titel im Hauptspeicher 'tiingo' (STORE_ACTIVE; nicht im HOLDOUT)
 *   own     Reihen im fenstereigenen Namensraum (mit Manifest-Eintrag), u. a. ein im Fenster delisteter Titel
 */
export const PROFILES = Object.freeze({
  DEV: Object.freeze({ provider: 'tiingo-delisted', first: '2015-01-02', last: '2026-09-30', listEnd: '2026-10-16', delisted: Object.freeze({ ticker: 'ZZZ', start: '2015-03-02', end: '2020-06-30' }), late: Object.freeze({ ticker: 'NEWC', start: '2021-03-01' }), store: true, split: '2019-06-03' }),
  HOLDOUT: Object.freeze({ provider: 'tiingo-holdout', first: '2007-01-02', last: '2015-12-31', listEnd: '2026-10-16', delisted: Object.freeze({ ticker: 'ZZZ', start: '2007-03-01', end: '2011-06-30' }), late: Object.freeze({ ticker: 'NEWC', start: '2010-03-01' }), store: false, split: '2012-06-04' }),
  PAPER_2027: Object.freeze({ provider: 'tiingo-paper-2027', first: '2026-01-02', last: null, listEnd: null, delisted: Object.freeze({ ticker: 'ZZZ', start: '2016-05-02', end: '2027-02-05' }), late: Object.freeze({ ticker: 'NEWC', start: '2026-11-02' }), store: true, split: '2027-01-19' }),
});

/** Quellen eines Fensters; `to` = letzte Sitzung der Reihen (PAPER_2027: das rollende Ende). */
export async function buildWindowSources(name, { to = null } = {}) {
  const P = PROFILES[name]; if (!P) throw new Error('PROFILE ' + name);
  const last = P.last ?? to; if (!last) throw new Error('TO_REQUIRED');
  const listEnd = P.listEnd ?? last; // Tiingo endDate aktiver Titel = letzter Datentag
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `st-paper-fwd-${name.toLowerCase()}-`));
  const driver = createFsDriver(dir);
  const mine = Store.createHistoryStore({ driver, provider: P.provider, market: 'US' });
  const main = Store.createHistoryStore({ driver, provider: 'tiingo', market: 'US' });
  const all = weekdays(P.first, last);
  const D = P.delisted, N = P.late;
  const actives = [['AAA', 11, 20, { trend: 0.0012, split: P.split }], ['BBB', 13, 40, { trend: 0.0006 }], ['CCC', 17, 15, { trend: 0.0009 }], ['DDD', 23, 30, { trend: 0.0004 }], ['EEE', 29, 55, { trend: 0.0011 }]];
  await mine.putSeries({ ticker: 'SPY@1993-01-29', bars: walk(all, 7, 200, { trend: 0.0004 }) });
  const manifest = {};
  for (const [t, seed, px, o] of actives) {
    const bars = walk(all, seed, px, o);
    if (P.store) await main.putSeries({ ticker: t, bars });
    else { await mine.putSeries({ ticker: `${t}@2000-01-03`, bars }); manifest[`tiingo:NASDAQ:${t}:2000-01-03`] = { status: 'OK', name: `${t} Holdings Inc` }; }
  }
  await mine.putSeries({ ticker: `${D.ticker}@${D.start}`, bars: walk(all.filter((d) => d >= D.start && d <= D.end), 19, 8, { trend: 0.001 }) });
  manifest[`tiingo:NYSE:${D.ticker}:${D.start}`] = { status: 'OK', name: 'Zeta Holdings Inc' };
  await mine.putSeries({ ticker: `${N.ticker}@${N.start}`, bars: walk(all.filter((d) => d >= N.start), 31, 12, { trend: 0.0015 }) });
  manifest[`tiingo:NASDAQ:${N.ticker}:${N.start}`] = { status: 'OK', name: 'Newco Industries Inc' };
  await driver.put(mine.seriesPrefix + '_validation/manifest.json.gz', zlib.gzipSync(JSON.stringify({ entries: manifest })));
  await driver.put(mine.seriesPrefix + '_validation/sec-pit-r11.json.gz', zlib.gzipSync(JSON.stringify({})));
  await driver.put(mine.seriesPrefix + '_validation/sec-pit-r12.json.gz', zlib.gzipSync(JSON.stringify({ 'tiingo:NASDAQ:AAA:2000-01-03': { eps: [], rev: [] } })));
  const csv = ['ticker,exchange,assetType,priceCurrency,startDate,endDate',
    ...actives.map(([t]) => `${t},NASDAQ,Stock,USD,2000-01-03,${listEnd}`),
    `${D.ticker},NYSE,Stock,USD,${D.start},${D.end}`, `${N.ticker},NASDAQ,Stock,USD,${N.start},${listEnd}`, `SPY,NYSE ARCA,ETF,USD,1993-01-29,${listEnd}`];
  const names = actives.map(([t]) => t);
  const repo = new Map([
    ['quant/data/market/scale/universe-FULL_UNIVERSE.json', Buffer.from(JSON.stringify({ securities: names.map((t) => ({ ticker: t, startDate: '2000-01-03', active: true })) }))],
    ['quant/data/market/security-master/eligibility.json', Buffer.from(JSON.stringify({ decisions: names.map((t) => ({ ticker: t, instrument_type: 'EQUITY_COMMON' })) }))],
    ['quant/data/market/security-master/company-names.json', Buffer.from(JSON.stringify({ rows: [] }))],
  ]);
  const zip = zipOne('supported_tickers.csv', csv.join('\n'));
  const live = { kind: 'TEST_LIVE', async fetchTickerZip() { return zip; }, readRepoFile: (rel) => repo.get(rel) ?? null, async createDriver() { return driver; } };
  return { dir, driver, mine, main, live, rows: csv };
}
