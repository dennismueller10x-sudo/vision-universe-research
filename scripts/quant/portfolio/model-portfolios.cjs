#!/usr/bin/env node
'use strict';
// Musterportfolios nach dem VU-Portfolio-Standard, historisch auf rekonstruierter PIT-Basis (Forschung, nicht zertifiziert).
//
//   node scripts/quant/portfolio/model-portfolios.cjs --out FILE
//        [--fundamentals DIR]   PIT-Bündel (Lesart ORIGINAL) aus build_pit_fundamentals.py; ohne: committete Consumer-Bündel
//                               (zuletzt eingereichte Fassung, stark verzögert; Kennzeichnung LAGGED_LATEST_FILING)
//        [--work-dir DIR]       kanonische Tagesbalken DIR/tiingo/daily/<securityId>.json (R2, nur im Workflow): Gesamtrendite,
//                               Rohschluss, Tagesumsatz. Ohne: committete Wochenreihen (nur Kurs, nur heutige Titel).
//        [--delisted-dir DIR]   private V13-Reihen delisteter Titel (R2-Archiv, nur im Workflow; verlangt --work-dir)
//        [--delisted-raw-dir DIR] V13-Archivteil v13-raw (raw/*/series.jsonl.gz): Tagesbalken mit splitFactor und Volumen;
//                               Rohschluss je Datum über return-series.js#splitFactors (ADR-002), Tagesumsatz
//        [--profiles a,b] [--weighting RISK_PARITY] [--window 2012-01-01,2026-10-31] [--limit N] [--sensitivity]
//
// Liest nur; schreibt ausschließlich --out. Kein Anbieterabruf.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const Returns = require(path.join(ROOT, 'quant/engines/return-series.js'));
const Codec = require(path.join(ROOT, 'vorsorge/engines/series-codec.js'));
const BT = require(path.join(ROOT, 'quant/engines/portfolio-backtest.cjs'));
const C = require(path.join(ROOT, 'quant/engines/portfolio-construction.cjs'));
const F = require(path.join(ROOT, 'quant/engines/portfolio-pit-factors.cjs'));
const Risk = require(path.join(ROOT, 'quant/engines/portfolio-risk.cjs'));
const VERSION = 'vu-model-portfolios-1.0.0';

const DEFAULT_PROFILES = ['quality-compounder', 'momentum-leader', 'garp', 'defensive-quality', 'value-momentum'];
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');

function args(argv) {
  const a = { profiles: DEFAULT_PROFILES, weighting: 'RISK_PARITY', window: ['2012-01-01', '2026-10-31'], limit: 0, sensitivity: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--out') { a.out = v; i++; } else if (k === '--fundamentals') { a.fundamentals = v; i++; } else if (k === '--work-dir') { a.workDir = v; i++; }
    else if (k === '--delisted-dir') { a.delistedDir = v; i++; } else if (k === '--delisted-raw-dir') { a.delistedRawDir = v; i++; } else if (k === '--profiles') { a.profiles = v.split(','); i++; } else if (k === '--weighting') { a.weighting = v; i++; }
    else if (k === '--window') { a.window = v.split(','); i++; } else if (k === '--limit') { a.limit = Number(v); i++; } else if (k === '--sensitivity') a.sensitivity = true; else if (k === '--pit-sector') a.pitSector = true; else if (k === '--listing') a.listing = true; else if (k === '--no-dq') a.noDq = true;
    else if (k === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 13).join('\n')); process.exit(0); }
    else throw Error('UNKNOWN_ARG ' + k);
  }
  if (!a.out) throw Error('--out required');
  if (path.resolve(a.out).startsWith(path.join(ROOT, 'quant/data'))) throw Error('--out darf nicht unter quant/data liegen');
  if (a.delistedDir && !a.workDir) throw Error('--delisted-dir verlangt --work-dir (Gesamtrendite-Basis)');
  if (a.delistedDir && !a.delistedRawDir) throw Error('--delisted-dir verlangt --delisted-raw-dir (Tagesbalken mit splitFactor, ADR-002)');
  return a;
}

// ISO-Woche als Schlüssel (Wochenreihen verschiedener Quellen datieren den letzten Handelstag der Woche).
function isoWeek(d) {
  const t = new Date(d + 'T00:00:00Z'), day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const y = t.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  return y + '-W' + String(1 + Math.round(((t - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0');
}

// Fama/French-12-Branchen aus SIC (Definition: Kenneth R. French Data Library, "12 Industry Portfolios").
const FF12 = [
  ['NoDur', [[100, 999], [2000, 2399], [2700, 2749], [2770, 2799], [3100, 3199], [3940, 3989]]],
  ['Durbl', [[2500, 2519], [2590, 2599], [3630, 3659], [3710, 3711], [3714, 3714], [3716, 3716], [3750, 3751], [3792, 3792], [3900, 3939], [3990, 3999]]],
  ['Manuf', [[2520, 2589], [2600, 2699], [2750, 2769], [3000, 3099], [3200, 3569], [3580, 3629], [3700, 3709], [3712, 3713], [3715, 3715], [3717, 3749], [3752, 3791], [3793, 3799], [3830, 3839], [3860, 3899]]],
  ['Enrgy', [[1200, 1399], [2900, 2999]]],
  ['Chems', [[2800, 2829], [2840, 2899]]],
  ['BusEq', [[3570, 3579], [3660, 3692], [3694, 3699], [3810, 3829], [7370, 7379]]],
  ['Telcm', [[4800, 4899]]],
  ['Utils', [[4900, 4949]]],
  ['Shops', [[5000, 5999], [7200, 7299], [7600, 7699]]],
  ['Hlth', [[2830, 2839], [3693, 3693], [3840, 3859], [8000, 8099]]],
  ['Money', [[6000, 6999]]],
];
function ff12(sic) {
  const n = Number(sic);
  if (!Number.isInteger(n) || n <= 0) return null;
  for (const [name, ranges] of FF12) if (ranges.some(([a, b]) => n >= a && n <= b)) return name;
  return 'Other';
}

function loadBenchmark(basis) {
  const file = path.join(ROOT, 'vorsorge/data/series/SPY.json'), bytes = fs.readFileSync(file);
  const doc = JSON.parse(bytes), part = basis === 'TOTAL_RETURN' ? doc.total : doc.price;
  if (doc.symbol !== 'SPY' || !part || !part.weekly) throw Error('BENCHMARK_SOURCE_INVALID');
  if (basis === 'TOTAL_RETURN' && doc.totalReturn.state !== 'TOTAL_RETURN_RECONSTRUCTED') throw Error('BENCHMARK_TR_UNAVAILABLE');
  return { points: Codec.decode(part.weekly), label: basis === 'TOTAL_RETURN' ? 'SPY_TOTAL_RETURN_DIVIDENDS_REINVESTED' : 'SPY_PRICE_RETURN', sourceHash: sha(bytes), file: 'vorsorge/data/series/SPY.json' };
}

function sicIndex(fundIndex) {
  const bySecurity = new Map();
  const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/product/sic-peer-taxonomy-v1.json'), 'utf8'));
  const c = Object.fromEntries(tax.rowColumns.map((k, i) => [k, i]));
  for (const r of tax.rows) if (r[c.sic4]) bySecurity.set(r[c.securityId], r[c.sic4]);
  if (fundIndex) for (const e of Object.values(fundIndex.issuers)) if (e.sic) for (const id of e.securityIds) if (!bySecurity.has(id)) bySecurity.set(id, e.sic);
  return bySecurity;
}

function loadBundles(dir) {
  const bySecurity = new Map();
  const files = fs.readdirSync(dir).filter(f => /^CIK\d{10}\.json$/.test(f));
  for (const f of files) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const id of b.securityIds || []) bySecurity.set(id, b);
  }
  return { bySecurity, files: files.length };
}

// V13-Rohzeilen (v13-raw/raw/*/series.jsonl.gz): je Ticker {ticker, cols, rows}; wie qualify.py#load_series die erste
// nicht leere Fassung je Ticker.
function loadRawByTicker(dir, wanted = null) {
  const zlib = require('node:zlib'), out = new Map(), files = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name === 'series.jsonl.gz') files.push(f); } };
  walk(dir);
  for (const f of files.sort()) for (const line of zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    if (wanted) { const m = /"ticker"\s*:\s*"([^"]+)"/.exec(line); if (m && !wanted.has(m[1])) continue; }
    const r = JSON.parse(line), prev = out.get(r.ticker);
    if (!prev || (!(prev.rows || []).length && (r.rows || []).length)) out.set(r.ticker, r);
  }
  return { byTicker: out, files: files.length };
}

// Delisteter Titel: Rohschluss je Woche aus den Tagesbalken mit datumsabhängigen Split-Faktoren
// (return-series.js#splitFactors, ADR-002), geprüft gegen die registergebundenen split-bereinigten Wochenpunkte.
// Ergebnis: {raw: Map(Woche -> Rohschluss), dv: Map(Woche -> Ø Tagesumsatz 20 Tage)} oder {error}.
function delistedRawWeekly(doc, rawSeries, weekOf) {
  if (!rawSeries || !Array.isArray(rawSeries.rows) || !rawSeries.rows.length) return { error: 'RAW_SERIES_MISSING' };
  const ix = Object.fromEntries(rawSeries.cols.map((c, i) => [c, i]));
  const from = doc.points[0][0], to = doc.listingLifecycle?.lastTradeDate || doc.points.at(-1)[0];
  const lo = new Date(Date.parse(from) - 7 * 86400000).toISOString().slice(0, 10);
  const rows = rawSeries.rows.filter(r => r[ix.close] !== null && r[0].slice(0, 10) >= lo && r[0].slice(0, 10) <= to)
    .map(r => ({ date: r[0].slice(0, 10), close: Number(r[ix.close]), volume: Number(r[ix.volume]) || 0, splitFactor: Number(r[ix.splitFactor]) || 1 }));
  if (!rows.length) return { error: 'RAW_ROWS_OUTSIDE_LISTING' };
  const fac = Returns.splitFactors(rows), want = new Map(doc.points.map(p => [weekOf(p[0]), p[1]]));
  const raw = new Map(), dv = new Map(), tv = [];
  let checked = 0, bad = 0;
  rows.forEach((b, k) => {
    tv.push(b.close * b.volume);
    const w = weekOf(b.date), next = rows[k + 1];
    if (next && weekOf(next.date) === w) return;
    raw.set(w, b.close);
    const win = tv.slice(-20);
    if (win.length >= 10) dv.set(w, win.reduce((s, x) => s + x, 0) / win.length);
    if (want.has(w)) { checked++; if (Math.abs((b.close / fac[k]) / want.get(w) - 1) > 0.01) bad++; }
  });
  if (checked < 0.9 * want.size || bad > 0.02 * checked) return { error: 'RAW_SPLIT_ADJUSTED_MISMATCH', checked, bad };
  return { raw, dv, checked, bad };
}

// PIT-F3 (ADR-001 A1): Listing-Intervall je Panel-Titel aus dem Company Master. Opt-in (`a.listing`), eingefrorene Läufe bleiben unverändert.
// Setzt `listing {cik, from, to}` nur, wenn Master-CIK und Bündel-CIK übereinstimmen (oder das Bündel fehlt); bei Widerspruch bleibt
// `listing` leer (unbekannt bleibt unbekannt). Verbindet KEINE Renditen über einen Tickerwechsel: chainCandidates ist nur ein Schattenbericht
// (gleiche CIK, Intervall der einen Zeile endet höchstens 14 Tage vor dem Beginn der nächsten).
function loadListingIndex() {
  const dir = path.join(ROOT, 'quant/data/universe/instruments'), byId = new Map();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort())
    for (const i of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).instruments || []) {
      if (!i.cik) continue;
      const to = i.active === false ? (i.lastTradeDate || i.delistedAt || null) : null;
      for (const id of new Set([...(i.legacyIds || []), i.masterMemberId].filter(Boolean))) byId.set(id, { cik: i.cik, from: i.firstTradeDate || null, to });
    }
  return byId;
}
function attachListing(securities, index) {
  const c = { withListing: 0, noMasterEntry: 0, cikConflict: 0 }, byCik = new Map();
  for (const s of securities) {
    const m = index.get(s.id);
    if (!m) { c.noMasterEntry++; continue; }
    if (s.bundle && s.bundle.cik && Number(s.bundle.cik) !== Number(m.cik)) { c.cikConflict++; continue; }
    s.listing = { cik: m.cik, from: m.from, to: m.to };
    c.withListing++;
    if (!byCik.has(m.cik)) byCik.set(m.cik, []);
    byCik.get(m.cik).push(s);
  }
  let chainCandidates = 0;
  for (const list of byCik.values()) for (const a of list) for (const b of list) {
    if (a === b || !a.listing.to || !b.listing.from) continue;
    const gap = (Date.parse(b.listing.from) - Date.parse(a.listing.to)) / 86400000;
    if (gap >= 0 && gap <= 14) chainCandidates++;
  }
  return { ...c, chainCandidates };
}

// PIT-F2: Branche zum Entscheidungstag statt heutiger SIC. Opt-in (`a.pitSector`), damit eingefrorene Läufe unverändert bleiben.
// `ic` = core/industry-classification.js#create(...). Je Woche die zeitgenaue SIC (knownAt <= Wochenschluss, 16:00 ET); die
// Fortschreibung ist deklariert (PIT_SECTOR_MAX_AGE_DAYS, Annahme PIT_SECTOR_ASSUMPTION). Alles außer OBSERVED bleibt null (unbekannt).
const PIT_SECTOR_MAX_AGE_DAYS = 1100, PIT_SECTOR_ASSUMPTION = 'PIT-F2: SIC bleibt bis zur nächsten Beobachtung gültig, höchstens 1100 Tage (Entscheidung 11.11.2026)';
function pitSectorSeries(ic, cik, calendar) {
  const out = new Array(calendar.length).fill(null);
  if (!cik) return out;
  calendar.forEach((d, i) => {
    const r = ic.getIndustryClassification(cik, d, { maxAgeDays: PIT_SECTOR_MAX_AGE_DAYS, assumptionRef: PIT_SECTOR_ASSUMPTION });
    out[i] = r.status === 'OBSERVED' ? ff12(r.sic) : null;
  });
  return out;
}
function loadSicHistoryIC(ciks) {
  const IC = require(path.join(ROOT, 'core/industry-classification.js')), zlib = require('node:zlib'), dir = path.join(ROOT, 'quant/data/sec/sic-history');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')), codesFile = path.join(dir, 'sic-codes.json');
  const codes = fs.existsSync(codesFile) ? JSON.parse(fs.readFileSync(codesFile, 'utf8')).codes : {};
  const wanted = new Set([...ciks].map(IC.normalizeCik).filter(Boolean)), issuers = {};
  for (const sh of [...new Set([...wanted].map(IC.shardOf))].sort()) {
    const f = path.join(dir, 'issuers', sh + '.json.gz');
    if (!fs.existsSync(f)) continue;
    for (const [c, rec] of Object.entries(JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')).issuers)) if (wanted.has(c)) issuers[c] = rec;
  }
  return IC.create({ issuers, codes, index });
}
function attachPitSector(securities, calendar, ic) {
  let changed = 0;
  for (const s of securities) {
    s.sectorAt = pitSectorSeries(ic, s.bundle && s.bundle.cik, calendar);
    if (s.sectorAt.some(x => x && x !== s.sector)) changed++;
  }
  return { securities: securities.length, withDifferentSectorAtSomeDate: changed, maxAgeDays: PIT_SECTOR_MAX_AGE_DAYS };
}

function buildPanel(a) {
  const basis = a.workDir ? 'TOTAL_RETURN' : 'PRICE_RETURN';
  // a.benchmark: eigener Wochenkalender (Musterdepots vorwärts: SPY-Tagesreihe, weil die Vorsorge-Reihe früher endet).
  const bench = a.benchmark || loadBenchmark(basis);
  const calendar = bench.points.map(p => p[0]), T = calendar.length;
  const weekIdx = new Map(calendar.map((d, i) => [isoWeek(d), i]));
  const levels = bench.points.map(p => p[1]);
  const fundDir = a.fundamentals || path.join(ROOT, 'quant/data/sec/consumer');
  const fundIndex = a.fundamentals && fs.existsSync(path.join(a.fundamentals, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(a.fundamentals, 'index.json'), 'utf8')) : null;
  const bundles = loadBundles(fundDir), sics = sicIndex(fundIndex);
  const securities = [], counts = { candidates: 0, noSector: 0, notReal: 0, noBars: 0, notInFinalWeek: 0, delisted: 0, delistedNoSector: 0, delistedExcludedNoTotalReturn: 0, delistedExcludedRawMissing: 0, delistedExcludedRawMismatch: 0 }, sourceHashes = [];
  const lastIdx = calendar.findLastIndex(d => d <= a.window[1]);
  const seriesDir = path.join(ROOT, 'quant/data/market/discover-series-long');
  let files = fs.readdirSync(seriesDir).filter(f => /^ref_.+\.json$/.test(f)).sort();
  if (a.limit) files = files.slice(0, a.limit);
  for (const f of files) {
    const id = f.slice(0, -5);
    counts.candidates++;
    const sector = ff12(sics.get(id));
    if (!sector) { counts.noSector++; continue; }
    const adj = new Float64Array(T).fill(NaN), raw = new Float64Array(T).fill(NaN);
    let dv = null, srcHash;
    const dqFlags = new Set();
    if (a.workDir) {
      const file = path.join(a.workDir, 'tiingo/daily', id + '.json');
      if (!fs.existsSync(file)) { counts.noBars++; continue; }
      const bytes = fs.readFileSync(file), bars = (JSON.parse(bytes).bars || []).filter(b => b && typeof b.date === 'string').sort((x, y) => x.date < y.date ? -1 : 1);
      srcHash = sha(bytes); dv = new Float64Array(T).fill(NaN);
      const tv = [];
      for (let k = 0; k < bars.length; k++) {
        const b = bars[k], d = b.date.slice(0, 10), w = weekIdx.get(isoWeek(d));
        tv.push(Number(b.close) * Number(b.volume));
        // DQ-K5: Sitzungsrelativ der Gesamtrendite (adjustedClose zum Vortag) >= 5 oder <= 1/5, markiert in der Woche der Sitzung.
        if (k > 0 && w !== undefined) { const q = Number(b.adjustedClose) / Number(bars[k - 1].adjustedClose); if (q >= DQ_K || q <= 1 / DQ_K) dqFlags.add(w); }
        if (w === undefined) continue;
        const next = bars[k + 1];
        if (next && isoWeek(next.date.slice(0, 10)) === isoWeek(d)) continue; // nur der letzte Tag der Woche
        if (Number(b.adjustedClose) > 0 && Number(b.close) > 0) { adj[w] = Number(b.adjustedClose); raw[w] = Number(b.close); }
        const win = tv.slice(-20).filter(Number.isFinite);
        if (win.length >= 10) dv[w] = win.reduce((s, x) => s + x, 0) / win.length;
      }
    } else {
      const bytes = fs.readFileSync(path.join(seriesDir, f)), doc = JSON.parse(bytes);
      if (doc.dataMode !== 'real' || doc.priceSeriesType !== 'SPLIT_ADJUSTED') { counts.notReal++; continue; }
      srcHash = sha(bytes);
      // Rohschluss = split-bereinigt × Faktor der späteren Splits (return-series.js#splitFactors, ADR-002).
      const pts = doc.points, splits = (doc.corporateActions && doc.corporateActions.splits) || [];
      const pseudo = pts.map(p => ({ date: p[0], splitFactor: 1 }));
      for (const [d, ratio] of splits) { const k = pts.findIndex(p => p[0] >= d); if (k >= 0) pseudo[k].splitFactor *= ratio; }
      const fac = Returns.splitFactors(pseudo);
      pts.forEach((p, k) => { const w = weekIdx.get(isoWeek(p[0])); if (w !== undefined && p[1] > 0) { adj[w] = p[1]; raw[w] = p[1] * fac[k]; } });
      // Nur-Kurs-Panel: heutige Kohorte; Titel ohne Kurs in der letzten Fensterwoche fallen heraus (Kennzeichnung).
      if (!(adj[lastIdx] > 0)) { counts.notInFinalWeek++; continue; }
    }
    if (!adj.some(x => x > 0)) { counts.noBars++; continue; }
    securities.push({ id, sector, mic: 'XNYS', adj, raw, dv, bundle: bundles.bySecurity.get(id) || null, terminal: null, dqFlags: [...dqFlags].sort((x, y) => x - y) });
    sourceHashes.push([id, srcHash]);
  }
  if (a.delistedDir) {
    const D = require(path.join(ROOT, 'quant/engines/research-delisted-series.cjs'));
    const { docs } = D.loadDelisted(ROOT, { dir: a.delistedDir });
    const rawIndex = loadRawByTicker(a.delistedRawDir, new Set([...docs.values()].map(d => d.ticker)));
    counts.delistedRawFiles = rawIndex.files;
    for (const doc of docs.values()) {
      counts.delisted++;
      const sector = ff12(sics.get(doc.securityId));
      if (!sector) { counts.delistedNoSector++; continue; }
      // Gesamtrendite-Panel: ohne vollständige Gesamtrendite-Reihe kein Titel (keine Kursrendite gegen Gesamtrendite).
      const tr = Array.isArray(doc.totalReturnPoints) && doc.totalReturnPoints.length === doc.points.length ? doc.totalReturnPoints : null;
      if (!tr) { counts.delistedExcludedNoTotalReturn++; continue; }
      const rw = delistedRawWeekly(doc, rawIndex.byTicker.get(doc.ticker), isoWeek);
      if (rw.error) { if (rw.error === 'RAW_SPLIT_ADJUSTED_MISMATCH') counts.delistedExcludedRawMismatch++; else counts.delistedExcludedRawMissing++; continue; }
      const adj = new Float64Array(T).fill(NaN), raw = new Float64Array(T).fill(NaN), dv = new Float64Array(T).fill(NaN);
      const lc = doc.listingLifecycle || {};
      let li = -1;
      doc.points.forEach((p, k) => {
        const key = isoWeek(p[0]), w = weekIdx.get(key); if (w === undefined) return;
        adj[w] = tr[k][1];
        if (rw.raw.has(key)) raw[w] = rw.raw.get(key);
        if (rw.dv.has(key)) dv[w] = rw.dv.get(key);
        li = Math.max(li, w);
      });
      if (li < 0) continue;
      // DQ-K5 für V13-Ketten: nur Wochenpunkte vorhanden, daher Wochenrelativ der Gesamtrendite (Näherung, offengelegt).
      const dqFlags = [];
      for (let w = 1; w <= li; w++) if (adj[w] > 0 && adj[w - 1] > 0) { const q = adj[w] / adj[w - 1]; if (q >= DQ_K || q <= 1 / DQ_K) dqFlags.push(w); }
      const kind = lc.terminal && ['MERGER', 'DISTRESS', 'UNKNOWN'].includes(lc.terminal.kind) ? lc.terminal.kind : 'UNKNOWN';
      securities.push({ id: doc.securityId, sector, mic: doc.mic || 'XNYS', adj, raw, dv, bundle: bundles.bySecurity.get(doc.securityId) || null, terminal: { lastIdx: li, kind }, dqFlags });
      sourceHashes.push([doc.securityId, doc.identityHash]);
    }
  }
  const prov = {
    datasetHash: sha({ series: sourceHashes, benchmark: bench.sourceHash }), identityEvidence: sha(sourceHashes.map(x => x[0])),
    populationEvidence: sha({ rule: 'ALL_LISTED_US_COMMON_WITH_SIC_AND_PRICE_AT_DECISION', ids: sourceHashes.length }), corporateActionEvidence: sha({ basis, splitFactors: 'return-series.js#splitFactors' }),
    lifecycleEvidence: sha({ delisted: a.delistedDir ? 'V13_REGISTER_1.0.0' : 'NONE' }), licenseEvidence: sha('TIINGO_COMMERCIAL_LICENSE_DERIVED_RESULTS_ONLY'),
  };
  const pitSector = a.pitSector ? attachPitSector(securities, calendar, loadSicHistoryIC(securities.map(s => s.bundle && s.bundle.cik).filter(Boolean))) : null;
  const listing = a.listing ? attachListing(securities, loadListingIndex()) : null;
  return {
    calendar, basis, benchmark: { label: bench.label, levels, sourceHash: bench.sourceHash, file: bench.file, lastDate: calendar.at(-1) }, securities, provenance: prov,
    population: { label: 'CUSTOM_STRATEGY_UNIVERSE', description: 'Heute vorhandene Kursdateien (' + (a.workDir ? 'R2-Tagesbalken' : 'committete Wochenreihen') + ') mit heutigem SIC-Code' + (a.delistedDir ? ' plus qualifizierte V13-Ketten delisteter Titel (Register 1.0.0)' : '') + '; keine vollständige damalige Population, keine historische Indexmitgliedschaft.' },
    meta: { counts, ...(pitSector ? { pitSector } : {}), ...(listing ? { listing } : {}), securities: securities.length, withFundamentals: securities.filter(s => s.bundle).length, fundamentalsSource: a.fundamentals ? 'PIT_ORIGINAL_FILING' : 'LAGGED_LATEST_FILING_COMMITTED_CONSUMER', fundamentalsFiles: bundles.files },
  };
}

// DQ-K5-Quarantäne wie Supertrader (scripts/supertrader/source-faithful/integrity/discontinuity.mjs): keine Korrektur,
// sondern Schnitt an jeder markierten Woche f. Kein Faktor des späteren Stücks reicht über f zurück (eigene Historie).
//   BOOK:  das frühere Stück endet mit f (gehaltene Position zum Kurs von f abgerechnet), das spätere beginnt bei f;
//   PRIOR: das frühere Stück endet mit f − 1 (Abrechnung vor dem Sprung), das spätere beginnt bei f.
// Stücke mit weniger als DQ_MIN_WEEKS Kurswochen entfallen. Frühere Stücke enden als SERIES_END (Endwert 100 %),
// das letzte behält den ursprünglichen Endwert (eine wirtschaftliche Delistung wird nie zur Datenlücke).
const DQ_K = 5, DQ_MIN_WEEKS = 6, DQ_POLICIES = ['DQ-K5-BOOK', 'DQ-K5-PRIOR'];
function applyDq(panel, policy) {
  if (!DQ_POLICIES.includes(policy)) throw Error('DQ_POLICY_INVALID');
  const T = panel.calendar.length, out = [], census = { flaggedSecurities: 0, flags: 0, pieces: 0, droppedPieces: 0 };
  for (const s of panel.securities) {
    const flags = s.dqFlags || [];
    if (!flags.length) { out.push(s); continue; }
    census.flaggedSecurities++; census.flags += flags.length;
    const cuts = [];
    let start = 0;
    for (const f of flags) { cuts.push([start, policy === 'DQ-K5-BOOK' ? f : f - 1]); start = f; }
    cuts.push([start, T - 1]);
    cuts.forEach(([lo, hi], n) => {
      const last = n === cuts.length - 1, pick = arr => { if (!arr) return arr; const x = new Float64Array(T).fill(NaN); for (let t = lo; t <= hi; t++) x[t] = arr[t]; return x; };
      const adj = pick(s.adj), priced = adj.filter(v => v > 0).length;
      if (priced < DQ_MIN_WEEKS) { census.droppedPieces++; return; }
      let li = -1; for (let t = hi; t >= lo; t--) if (adj[t] > 0) { li = t; break; }
      const terminal = last ? s.terminal : { lastIdx: li, kind: 'SERIES_END' };
      census.pieces++;
      out.push({ ...s, id: n === 0 ? s.id : s.id + ':dq' + n, adj, raw: pick(s.raw), dv: pick(s.dv), terminal, dqFlags: [] });
    });
  }
  return { panel: { ...panel, securities: out }, census: { policy, k: DQ_K, minWeeks: DQ_MIN_WEEKS, ...census } };
}

// Größte Wochenrendite der Portfoliokurve (Kontrolle auf Sprungartefakte).
function maxWeekly(r) { let m = -Infinity; const e = r.equity || []; for (let i = 1; i < e.length; i++) if (e[i - 1][1] > 0) m = Math.max(m, e[i][1] / e[i - 1][1] - 1); return Number.isFinite(m) ? m : null; }

function coverageByYear(panel, years) {
  return years.map(y => {
    const d = y + '-06-30', t = panel.calendar.findIndex(x => x >= d);
    if (t < 0) return { year: y };
    let priced = 0, fund = 0, delisted = 0;
    for (const s of panel.securities) {
      if (!(s.adj[t] > 0)) continue; priced++;
      if (s.terminal) delisted++;
      if (s.bundle && F.fundamentalFactors(s.bundle, panel.calendar[t], s.raw[t]).fundamentalsAsOfEnd) fund++;
    }
    return { year: y, priced, withFreshFundamentals: fund, laterDelisted: delisted };
  });
}

function main() {
  const a = args(process.argv);
  const t0 = Date.now();
  const panel = buildPanel(a);
  const y0 = Number(a.window[0].slice(0, 4)), y1 = Number(a.window[1].slice(0, 4));
  const coverage = coverageByYear(panel, Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i));
  const results = [];
  for (const profileId of a.profiles) {
    const r = BT.runModelPortfolio(panel, { profileId, weighting: a.weighting, window: a.window });
    results.push(r);
    console.log(JSON.stringify({ profileId, cagr: r.metrics.cagr, bench: r.metrics.benchmarkCagr, vol: r.metrics.annualizedVolatility, mdd: r.metrics.maxDrawdown, beta: r.metrics.beta, positions: r.construction.averagePositions }));
  }
  // Angefragter gegen realisierten Zeitraum: der Benchmark-Kalender kann früher enden. Fehlende Wochen werden alarmiert.
  const ran = results.filter(r => r.state === 'RUN');
  const realized = ran.length ? [ran[0].window[0], ran[0].window[1]] : null;
  const missingWeeks = realized ? Math.max(0, Math.round((Date.parse(a.window[1]) - Date.parse(realized[1])) / (7 * 86400000))) : null;
  const windowAlarm = missingWeeks > 1 ? { state: 'WINDOW_TRUNCATED', benchmarkLastDate: panel.benchmark.lastDate, missingWeeks } : null;
  if (windowAlarm) console.log('::warning::Musterportfolios: Zeitraum endet am ' + realized[1] + ' statt ' + a.window[1] + ' (' + missingWeeks + ' Wochen fehlen, Benchmark endet ' + panel.benchmark.lastDate + ')');
  const sensitivity = [];
  if (a.sensitivity) for (const profileId of a.profiles) {
    for (const v of [{ weighting: 'EQUAL' }, { bufferRank: 50, label: 'TURNOVER_BUFFER_50' }, { rebalanceWeeks: 13, label: 'TURNOVER_QUARTERLY' }, { bufferRank: 50, rebalanceWeeks: 13, label: 'TURNOVER_BUFFER_50_QUARTERLY' }, ...(a.delistedDir ? [{ terminalRecovery: { MERGER: 1, UNKNOWN: 1, DISTRESS: 1 }, label: 'TERMINAL_LAST_CLOSE' }, { terminalRecovery: { MERGER: 1, UNKNOWN: 0.3, DISTRESS: 0 }, label: 'TERMINAL_HARSH' }] : [])]) {
      const r = BT.runModelPortfolio(panel, { profileId, weighting: v.weighting || a.weighting, window: a.window, terminalRecovery: v.terminalRecovery,
        ...(v.bufferRank ? { bufferRank: v.bufferRank } : {}), ...(v.rebalanceWeeks ? { rebalanceWeeks: v.rebalanceWeeks } : {}) });
      if (r.state !== 'RUN') { sensitivity.push({ profileId, variant: v.label || ('WEIGHTING_' + v.weighting), state: r.state }); continue; }
      sensitivity.push({ profileId, variant: v.label || ('WEIGHTING_' + v.weighting), cagr: r.metrics.cagr, benchmarkCagr: r.metrics.benchmarkCagr, vol: r.metrics.annualizedVolatility, maxDrawdown: r.metrics.maxDrawdown, beta: r.metrics.beta,
        turnover: r.metrics.annualizedOneWayTurnover, costsShareOfInitialCapital: r.metrics.costsShareOfInitialCapital });
    }
  }
  // Vorher/Nachher DQ-K5 (nur Gesamtrendite-Panel): Hauptlauf ohne Filter (BASE), dazu BOOK und PRIOR je Profil.
  const dq = [];
  if (a.workDir && !a.noDq) for (const policy of DQ_POLICIES) {
    const { panel: qp, census } = applyDq(panel, policy);
    const rows = a.profiles.map(profileId => {
      const r = BT.runModelPortfolio(qp, { profileId, weighting: a.weighting, window: a.window });
      if (r.state !== 'RUN') return { profileId, state: r.state };
      console.log(JSON.stringify({ policy, profileId, cagr: r.metrics.cagr, bench: r.metrics.benchmarkCagr }));
      return { profileId, cagr: r.metrics.cagr, benchmarkCagr: r.metrics.benchmarkCagr, vol: r.metrics.annualizedVolatility, maxDrawdown: r.metrics.maxDrawdown, beta: r.metrics.beta,
        turnover: r.metrics.annualizedOneWayTurnover, maxWeeklyReturn: maxWeekly(r) };
    });
    dq.push({ ...census, results: rows });
  }
  const doc = {
    schemaVersion: VERSION, certification: 'NOT_CERTIFIED', label: 'Forschung, nicht zertifiziert', productionApproved: false, publiclyActivated: false,
    engines: { backtest: BT.VERSION, construction: C.VERSION, factors: F.VERSION, risk: Risk.VERSION },
    standard: C.STANDARD, spreadModel: { byAdv: C.SPREAD_BY_ADV, byMarketCap: C.SPREAD_BY_MCAP, lowPriceSurchargeBps: C.LOW_PRICE_SURCHARGE_BPS }, defaults: BT.DEFAULTS,
    data: { basis: panel.basis, benchmark: panel.benchmark.label, benchmarkFile: panel.benchmark.file, ...panel.meta, provenance: panel.provenance, coverageByYear: coverage,
      delistedSource: a.delistedDir ? 'V13_PRIVATE_ARCHIVE_REGISTER_1.0.0_QUALIFIED' : 'NONE_SURVIVOR_COHORT', priceSource: a.workDir ? 'R2_CANONICAL_DAILY_TIINGO' : 'COMMITTED_WEEKLY_SPLIT_ADJUSTED' },
    window: a.window, requestedWindow: a.window, realizedWindow: realized, windowAlarm, weighting: a.weighting, results, sensitivity, dqQuarantine: dq.length ? { rule: 'DQ-K5 wie Supertrader (Schnitt, keine Korrektur)', base: results.filter(r => r.state === 'RUN').map(r => ({ profileId: r.profileId, cagr: r.metrics.cagr, maxWeeklyReturn: maxWeekly(r) })), policies: dq } : null,
    population: panel.population,
    openLimits: ['KEINE_HISTORISCHE_INDEXMITGLIEDSCHAFT', 'POPULATION_HEUTIGE_DATEIEN_PLUS_V13_KETTEN', 'MITGLIEDSCHAFT_AUS_AUSFUEHRBARKEIT', 'WALK_FORWARD_OHNE_HOLDOUT_UND_MEHRFACHTEST', ...(windowAlarm ? ['ZEITRAUM_VERKUERZT'] : []), 'SIC_HEUTIGER_STAND', 'SPREAD_MODELLIERT_NICHT_BEOBACHTET', 'ENDWERT_DELISTETER_TITEL_ANNAHME_JE_KLASSE',
      ...(a.workDir ? [] : ['NUR_KURSRENDITE_KEINE_DIVIDENDEN', 'NUR_HEUTIGE_TITEL_SURVIVORSHIP']), ...(a.fundamentals ? [] : ['FUNDAMENTALDATEN_VERZOEGERT_ZULETZT_EINGEREICHT']),
      ...(a.delistedDir ? ['DELISTETE_TITEL_NUR_QUALIFIZIERTE_KETTEN_MIT_GESAMTRENDITE_UND_ROHBALKEN'] : [])],
    runtimeSeconds: Math.round((Date.now() - t0) / 1000),
  };
  fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify(doc));
  console.log(JSON.stringify({ out: a.out, securities: panel.meta.securities, runtimeSeconds: doc.runtimeSeconds }));
}

if (require.main === module) main();
module.exports = { isoWeek, ff12, buildPanel, attachListing, loadListingIndex, pitSectorSeries, attachPitSector, loadSicHistoryIC, PIT_SECTOR_MAX_AGE_DAYS, applyDq, DQ_POLICIES, coverageByYear, delistedRawWeekly, loadRawByTicker, DEFAULT_PROFILES, VERSION };
