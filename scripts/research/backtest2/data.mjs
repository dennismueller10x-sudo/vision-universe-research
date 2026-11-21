/**
 * Backtest 2.0 – Datenlader für den Workflow-Lauf (research.yml, Teil portfolio, Modus backtest2*). Forschung, nicht zertifiziert.
 *  - Kalender: Handelstage der SPY-Tagesreihe (quant/data/market/multi-asset/series/SPY.json) ab 2007 (Aufwärmphase).
 *  - Heutige Titel: Produktuniversum quant/data/market/discover-series-long/ref_*.json, Tagesbalken aus der R2-Historie
 *    (<work-dir>/tiingo/daily/<id>.json): adjusted* = Gesamtrendite, close/volume = roh.
 *  - Delistete Titel: qualifizierte V13-Ketten (quant/engines/research-delisted-series.cjs) mit Tagesbalken aus v13-raw;
 *    Split-Bereinigung datumsabhängig (quant/engines/return-series.js#splitFactors, ADR-002), Dividenden, falls die Spalte
 *    vorhanden ist; Abrechnung am letzten Handelstag mit der Endwertquote der Endklasse.
 *  - DQ-K5: Titel mit einem Sitzungssprung der Gesamtrendite ≥ ×5 oder ≤ ×1/5 werden ausgeschlossen und gezählt.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { allocate, setSecurity, setTerminal, finalize, RECOVERY } from './market.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const Returns = require(path.join(ROOT, 'quant/engines/return-series.js'));
export const DQ_K = 5, CALENDAR_FROM = '2007-01-01';

export function loadCalendar(root = ROOT, to = null) {
  const d = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/market/multi-asset/series/SPY.json'), 'utf8'));
  if (d.symbol !== 'SPY' || d.valueSemantics !== 'PRICE') throw new Error('SPY_DAILY_INVALID');
  const pts = d.points.filter(([dt]) => dt >= CALENDAR_FROM && (!to || dt <= to));
  return { dates: pts.map((p) => p[0]), spy: Float64Array.from(pts.map((p) => p[1])) };
}

/** Letzter Tag des letzten vollständigen Monats im Kalender (Protokoll §4: Ende = letzter vollständiger Monat). */
export function lastCompleteMonthEnd(dates) {
  const lastMonth = dates.at(-1).slice(0, 7);
  return dates.findLast((d) => d.slice(0, 7) < lastMonth);
}

function columns(T) { return { o: new Float64Array(T).fill(NaN), h: new Float64Array(T).fill(NaN), l: new Float64Array(T).fill(NaN), c: new Float64Array(T).fill(NaN), rc: new Float64Array(T).fill(NaN), v: new Float64Array(T).fill(NaN) }; }
function dqJump(cols) { let prev = NaN; for (let t = 0; t < cols.c.length; t++) { const c = cols.c[t]; if (!(c > 0)) continue; if (prev > 0) { const q = c / prev; if (q >= DQ_K || q <= 1 / DQ_K) return true; } prev = c; } return false; }

function loadRawByTicker(dir, wanted) {
  const out = new Map(), files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === 'series.jsonl.gz') files.push(f); } };
  walk(dir);
  for (const f of files.sort()) for (const line of zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    const m = /"ticker"\s*:\s*"([^"]+)"/.exec(line); if (m && !wanted.has(m[1])) continue;
    const r = JSON.parse(line), prev = out.get(r.ticker);
    if (!prev || (!(prev.rows || []).length && (r.rows || []).length)) out.set(r.ticker, r);
  }
  return out;
}

export function loadMarket({ workDir, delistedDir = null, delistedRawDir = null, to = null, limit = 0, log = console.log }) {
  const cal = loadCalendar(ROOT, to), T = cal.dates.length, dayIdx = new Map(cal.dates.map((d, i) => [d, i]));
  const counts = { current: 0, currentNoBars: 0, delisted: 0, delistedNoRaw: 0, dqExcluded: 0, loaded: 0 };
  const prepared = []; // [id, cols, terminal|null]
  let ids = fs.readdirSync(path.join(ROOT, 'quant/data/market/discover-series-long')).filter((f) => /^ref_.+\.json$/.test(f)).map((f) => f.slice(0, -5)).sort();
  if (limit) ids = ids.slice(0, limit);
  for (const id of ids) {
    counts.current++;
    const file = path.join(workDir, 'tiingo/daily', id + '.json');
    if (!fs.existsSync(file)) { counts.currentNoBars++; continue; }
    const cols = columns(T);
    for (const b of JSON.parse(fs.readFileSync(file, 'utf8')).bars || []) {
      const t = dayIdx.get(String(b.date).slice(0, 10)); if (t === undefined) continue;
      cols.o[t] = +b.adjustedOpen; cols.h[t] = +b.adjustedHigh; cols.l[t] = +b.adjustedLow; cols.c[t] = +b.adjustedClose; cols.rc[t] = +b.close; cols.v[t] = +b.volume;
    }
    if (dqJump(cols)) { counts.dqExcluded++; continue; }
    prepared.push([id, cols, null]);
  }
  if (delistedDir) {
    const D = require(path.join(ROOT, 'quant/engines/research-delisted-series.cjs'));
    const { docs } = D.loadDelisted(ROOT, { dir: delistedDir });
    const raw = loadRawByTicker(delistedRawDir, new Set([...docs.values()].map((d) => d.ticker)));
    for (const doc of docs.values()) {
      counts.delisted++;
      const r = raw.get(doc.ticker);
      if (!r || !(r.rows || []).length) { counts.delistedNoRaw++; continue; }
      const ix = Object.fromEntries(r.cols.map((c, i) => [c, i]));
      const last = doc.listingLifecycle.lastTradeDate, first = doc.points[0][0];
      const rows = r.rows.filter((x) => x[ix.close] !== null && String(x[0]).slice(0, 10) >= first && String(x[0]).slice(0, 10) <= last)
        .map((x) => ({ date: String(x[0]).slice(0, 10), open: +x[ix.open], high: +x[ix.high], low: +x[ix.low], close: +x[ix.close], volume: +x[ix.volume] || 0, splitFactor: +x[ix.splitFactor] || 1, div: ix.divCash !== undefined ? +x[ix.divCash] || 0 : ix.dividend !== undefined ? +x[ix.dividend] || 0 : 0 }));
      if (!rows.length) { counts.delistedNoRaw++; continue; }
      const fac = Returns.splitFactors(rows), cols = columns(T);
      let tr = 1, lastT = -1;
      rows.forEach((b, k) => {
        const adj = (x) => x / fac[k];
        // Dividende am Ex-Tag relativ zum Vortagesschluss, beide split-bereinigt (Wiederanlage zum Schluss)
        if (k > 0 && b.div > 0) tr *= 1 + (b.div / fac[k]) / (rows[k - 1].close / fac[k - 1]);
        const t = dayIdx.get(b.date); if (t === undefined) return;
        cols.o[t] = adj(b.open) * tr; cols.h[t] = adj(b.high) * tr; cols.l[t] = adj(b.low) * tr; cols.c[t] = adj(b.close) * tr; cols.rc[t] = b.close; cols.v[t] = b.volume;
        lastT = t;
      });
      if (dqJump(cols)) { counts.dqExcluded++; continue; }
      const kind = String(doc.listingLifecycle.terminal?.kind || 'UNKNOWN').toUpperCase();
      prepared.push([doc.securityId, cols, lastT >= 0 ? { t: lastT, recovery: RECOVERY[kind] ?? RECOVERY.UNKNOWN, kind } : null]);
    }
  }
  const m = allocate(cal.dates, prepared.map((p) => p[0]));
  prepared.forEach(([, cols, term], s) => { setSecurity(m, s, cols); if (term) setTerminal(m, s, term.t, term.recovery); });
  counts.loaded = prepared.length;
  log(`Markt: ${counts.loaded} Titel, ${T} Tage (${cal.dates[0]} … ${cal.dates.at(-1)}), ${JSON.stringify(counts)}`);
  return { market: finalize(m, cal.spy), counts };
}

/** Benchmarks (Gesamtrendite, Wochenpunkte) aus vorsorge/data/series/<SYM>.json. */
export function loadBenchmarks(root = ROOT, syms = ['SPY', 'QQQ', 'RSP']) {
  const Codec = require(path.join(root, 'vorsorge/engines/series-codec.js'));
  const out = {};
  for (const s of syms) {
    const d = JSON.parse(fs.readFileSync(path.join(root, 'vorsorge/data/series', s + '.json'), 'utf8'));
    if (d.symbol !== s || d.totalReturn?.state !== 'TOTAL_RETURN_RECONSTRUCTED') throw new Error('BENCHMARK_TR_UNAVAILABLE ' + s);
    out[s] = Codec.decode(d.total.weekly);
  }
  return out;
}
