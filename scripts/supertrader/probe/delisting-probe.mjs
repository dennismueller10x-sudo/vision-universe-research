#!/usr/bin/env node
// Supertrader — Probeabruf delisteter Titel (Machbarkeit fuer einen
// validierbaren Backtest). EINMALIG, KLEIN, OHNE VEROEFFENTLICHUNG VON KURSEN.
//
// Frage: Liefert der vorhandene Tiingo-Zugang fuer tatsaechlich delistete
// US-Aktien vollstaendige Tageskurse bis zum letzten Handelstag - und was
// passiert bei spaeter neu vergebenen Kuerzeln?
//
// Rechtsgrundlage (dokumentiert, nicht behauptet): Owner-Erklaerung
// quant/config/provider-profiles.json -> tiingo.licensing
// (OWNER_DECLARED_LICENSED, 2026-09-13). Interne Messung; ausgegeben werden
// nur Anzahlen, Daten und Verhaeltnisse - keine Kursniveaus. Kosten: im
// bestehenden Abonnement, ~90 Anfragen (Tagesbudget des Marktlaufs: 7.500).
//
// Stichprobe VOR dem Abruf festgelegt (deterministisch, ohne Blick auf Kurse):
//   A  30 delistete Stammaktien (NYSE/NASDAQ/AMEX, USD), Ende 2001-2025,
//      Kuerzel nicht neu vergeben, >= 2 Jahre gelistet; je 10 aus den
//      Ende-Zeitraeumen 2001-2008, 2009-2016, 2017-2025; Auswahl nach
//      SHA-1 des Kuerzels (kleinste zuerst).
//   B  6 neu vergebene Kuerzel (inaktive Zeile mit Ende < 2020 UND aktive
//      Zeile): liefert der Abruf die alte, die neue oder beide Historien?
//   C  Ankerfaelle mit oeffentlich bekanntem Ende: LEH (Insolvenz 2008),
//      WM (2008), TWX (Uebernahme 2018), MON (Uebernahme 2018), CELG (2019).
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const KEY = process.env.TIINGO_API_KEY;
if (!KEY) { console.error('TIINGO_API_KEY fehlt - kein Abruf.'); process.exit(2); }
const H = { Authorization: 'Token ' + KEY, 'Content-Type': 'application/json' };
const LIST_URL = 'https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip';
const EXCH = new Set(['NYSE', 'NASDAQ', 'AMEX', 'NYSE MKT', 'NYSE ARCA']);
const ANCHORS = ['LEH', 'WM', 'TWX', 'MON', 'CELG'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;

function unzipCsv(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  let off = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(off + 10), size = buf.readUInt32LE(off + 20), nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32), lo = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nl);
    if (name.endsWith('.csv')) {
      const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data).toString('utf8') : data.toString('utf8');
    }
    off += 46 + nl + el + cl;
  }
  throw new Error('keine CSV');
}
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

async function getJson(url) {
  requests++;
  const r = await fetch(url, { headers: H });
  const status = r.status;
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  await sleep(process.env.PROBE_NO_SLEEP ? 0 : 250);
  return { status, body };
}

function summarize(bars, listStart, listEnd) {
  if (!Array.isArray(bars) || !bars.length) return { bars: 0 };
  const first = bars[0].date.slice(0, 10), last = bars[bars.length - 1].date.slice(0, 10);
  let maxGap = 0, gapAt = null;
  for (let i = 1; i < bars.length; i++) { const g = days(bars[i - 1].date.slice(0, 10), bars[i].date.slice(0, 10)); if (g > maxGap) { maxGap = g; gapAt = bars[i].date.slice(0, 10); } }
  const tail = bars.slice(-250).map((b) => b.adjClose).filter((v) => Number.isFinite(v) && v > 0);
  const lastAdj = bars[bars.length - 1].adjClose;
  return {
    bars: bars.length, first, last,
    firstVsListStartDays: listStart ? days(listStart, first) : null,
    lastVsListEndDays: listEnd ? days(last, listEnd) : null,
    maxGapDays: maxGap, maxGapAt: gapAt,
    hasDivCash: bars.some((b) => 'divCash' in b), dividendEvents: bars.filter((b) => b.divCash > 0).length,
    hasSplitFactor: bars.some((b) => 'splitFactor' in b), splitEvents: bars.filter((b) => b.splitFactor && b.splitFactor !== 1).length,
    // Verhaeltnis, kein Kursniveau: letzter Schluss relativ zum Hoch der letzten 250 Sitzungen
    lastVs250dHigh: tail.length && Number.isFinite(lastAdj) ? Math.round((lastAdj / Math.max(...tail) - 1) * 1000) / 1000 : null,
    lastBarVolumePositive: (bars[bars.length - 1].volume || 0) > 0,
  };
}

async function probe(ticker, row, kind) {
  const meta = await getJson(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker)}`);
  const px = await getJson(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker)}/prices?startDate=1990-01-01&format=json`);
  return {
    kind, ticker, exchange: row?.exchange || null, listStart: row?.startDate || null, listEnd: row?.endDate || null,
    metaStatus: meta.status, metaStart: meta.body?.startDate || null, metaEnd: meta.body?.endDate || null,
    pricesStatus: px.status, ...summarize(Array.isArray(px.body) ? px.body : null, row?.startDate, row?.endDate),
  };
}

async function main() {
  requests++;
  const zip = Buffer.from(await (await fetch(LIST_URL, { headers: H })).arrayBuffer());
  const lines = unzipCsv(zip).split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  const rows = lines.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
  const byTicker = new Map();
  for (const r of rows) (byTicker.get(r.ticker) || byTicker.set(r.ticker, []).get(r.ticker)).push(r);
  if (process.argv.includes('--list-stats')) {
    // Nur die Tickerliste (keine Kursanfragen): Abdeckung delisteter Listings je Endjahr.
    const isStockL = (r) => r.assetType === 'Stock' && r.priceCurrency === 'USD' && EXCH.has(r.exchange);
    const byYear = {};
    for (const r of rows) {
      if (!isStockL(r) || !r.endDate || r.endDate >= '2026-01-01') continue;
      const y = r.endDate.slice(0, 4);
      const e = byYear[y] ||= { ended: 0, withStart: 0, plainTicker: 0, tickerReusedLater: 0 };
      e.ended++;
      if (r.startDate) e.withStart++;
      if (/^[A-Z]{1,5}$/.test(r.ticker)) e.plainTicker++;
      if (byTicker.get(r.ticker).some((x) => x !== r && x.startDate && x.startDate > r.endDate)) e.tickerReusedLater++;
    }
    const activeNow = rows.filter((r) => isStockL(r) && (!r.endDate || r.endDate >= '2026-01-01')).length;
    // Lebende Listings zu Jahresbeginn (nur Kuerzel ohne Zusatz, Beginn bekannt) -> Delisting-Quote je Jahr.
    const plain = rows.filter((r) => isStockL(r) && /^[A-Z]{1,5}$/.test(r.ticker) && r.startDate);
    const aliveAt = {};
    for (let y = 2005; y <= 2026; y++) { const d = `${y}-01-01`; aliveAt[y] = plain.filter((r) => r.startDate <= d && (!r.endDate || r.endDate >= d)).length; }
    console.log('PROBE_RESULT_BEGIN');
    console.log(JSON.stringify({ schema: 'supertrader-delisting-list-stats-1.0.0', ranAt: new Date().toISOString(), requests, rows: rows.length, activeNowMajorUsdStock: activeNow, aliveAtYearStartPlain: aliveAt, endedByYear: byYear }));
    console.log('PROBE_RESULT_END');
    return;
  }
  const isStock = (r) => r.assetType === 'Stock' && r.priceCurrency === 'USD' && EXCH.has(r.exchange);
  const ended = (r) => r.endDate && r.endDate < '2026-01-01';
  const A = [];
  for (const [from, to] of [['2001-01-01', '2008-12-31'], ['2009-01-01', '2016-12-31'], ['2017-01-01', '2025-12-31']]) {
    const pool = rows.filter((r) => isStock(r) && ended(r) && r.endDate >= from && r.endDate <= to && r.startDate && days(r.startDate, r.endDate) >= 730 && byTicker.get(r.ticker).length === 1 && /^[A-Z]{1,5}$/.test(r.ticker));
    pool.sort((a, b) => sha(a.ticker).localeCompare(sha(b.ticker)));
    A.push(...pool.slice(0, 10).map((r) => ({ r, period: `${from.slice(0, 4)}-${to.slice(0, 4)}`, poolSize: pool.length })));
  }
  const reusePool = [...byTicker.entries()].filter(([t, rs]) => /^[A-Z]{1,5}$/.test(t) && rs.some((r) => isStock(r) && r.endDate && r.endDate < '2020-01-01') && rs.some((r) => !ended(r) && isStock(r)));
  reusePool.sort((a, b) => sha(a[0]).localeCompare(sha(b[0])));
  const B = reusePool.slice(0, 6);

  const results = [];
  for (const { r, period, poolSize } of A) results.push({ ...(await probe(r.ticker, r, 'A_DELISTED')), period, poolSize });
  for (const [t, rs] of B) {
    const old = rs.filter((r) => r.endDate && r.endDate < '2020-01-01').sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    const cur = rs.find((r) => !ended(r));
    const res = await probe(t, old, 'B_REUSED');
    res.currentListingStart = cur?.startDate || null;
    res.returnsOldHistory = res.first ? res.first <= (old.endDate || '') : null;
    res.returnsCurrentListing = res.last ? res.last >= (cur?.startDate || '9999') : null;
    results.push(res);
  }
  for (const t of ANCHORS) { const rs = byTicker.get(t) || []; results.push(await probe(t, rs.find((r) => ended(r)) || rs[0] || null, 'C_ANCHOR')); }

  const a = results.filter((x) => x.kind === 'A_DELISTED');
  const ok = (x) => x.pricesStatus === 200 && x.bars > 0;
  const nearEnd = (x) => ok(x) && x.lastVsListEndDays !== null && Math.abs(x.lastVsListEndDays) <= 7;
  const summary = {
    schema: 'supertrader-delisting-probe-1.0.0', ranAt: new Date().toISOString(), requests,
    list: { rows: rows.length, inactive: rows.filter(ended).length, poolSizes: [...new Set(A.map((x) => x.period + ':' + x.poolSize))] },
    A: { probed: a.length, withPrices: a.filter(ok).length, lastBarWithin7DaysOfListEnd: a.filter(nearEnd).length, withDividendField: a.filter((x) => x.hasDivCash).length, withSplitField: a.filter((x) => x.hasSplitFactor).length, medianBars: a.filter(ok).map((x) => x.bars).sort((p, q) => p - q)[Math.floor(a.filter(ok).length / 2)] || 0, declineBelowMinus50pct: a.filter((x) => x.lastVs250dHigh !== null && x.lastVs250dHigh <= -0.5).length },
    B: results.filter((x) => x.kind === 'B_REUSED').map((x) => ({ ticker: x.ticker, oldListing: `${x.listStart}..${x.listEnd}`, currentListingStart: x.currentListingStart, pricesStatus: x.pricesStatus, first: x.first, last: x.last, maxGapDays: x.maxGapDays, returnsOldHistory: x.returnsOldHistory, returnsCurrentListing: x.returnsCurrentListing })),
    C: results.filter((x) => x.kind === 'C_ANCHOR').map((x) => ({ ticker: x.ticker, listEnd: x.listEnd, pricesStatus: x.pricesStatus, bars: x.bars, first: x.first, last: x.last, lastVsListEndDays: x.lastVsListEndDays, lastVs250dHigh: x.lastVs250dHigh })),
    rows: results,
    note: 'Nur Anzahlen, Daten und Verhältnisse; keine Kursniveaus. Keine Daten wurden gespeichert oder veröffentlicht.',
  };
  const out = JSON.stringify(summary);
  if (out.includes(KEY)) { console.error('Schluessel im Ergebnis - Abbruch.'); process.exit(3); }
  console.log('PROBE_RESULT_BEGIN');
  console.log(out);
  console.log('PROBE_RESULT_END');
}
main().catch((e) => { console.error(String(e && e.message || e).replaceAll(KEY, '***')); process.exit(1); });
