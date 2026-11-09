'use strict';
// V10 FACTOR (Pfad A, RECONSTRUCTION): shared, outcome-free frame construction.
// Reuses the research loader, the weekly benchmark and the product's identity/peer tables;
// no product data are written.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const Loader = require(ROOT + '/quant/engines/research-weekly-loader.cjs');
const B = require(ROOT + '/quant/engines/weekly-benchmark.cjs');
const C = require(ROOT + '/quant/engines/research-contract.cjs');

const SERIES_DIR = 'quant/data/market/discover-series-long';
const MIC = { NASDAQ: 'XNAS', NYSE: 'XNYS', AMEX: 'XASE', 'NYSE MKT': 'XASE' };
const DEFAULT_LOADER_OPTIONS = Object.freeze({ identityEvidence: true, corporateActionEvidence: true });
const RANK_WINDOW = ['2010-01', '2025-12'];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const weekOf = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); };
const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);

function parseLoaderOptions(text) {
  if (!text) return { ...DEFAULT_LOADER_OPTIONS };
  const o = JSON.parse(text);
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw Error('INVALID_LOADER_OPTIONS');
  return o;
}

// Proven non-equity instruments, same rule as scripts/quant/build-factor-evidence.mjs.
function nonEquitySymbols(root = ROOT) {
  const dir = path.join(root, 'quant/data/universe/instruments'), out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    for (const i of (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).instruments || [])) {
      if (['COMMON_STOCK', 'ADR'].includes(i.securityType) || i.securityTypeConfidence !== 'HIGH' || !['SECURITY_NAME', 'PROVIDER_ASSET_TYPE'].includes(i.securityTypeBasis)) continue;
      out.set(i.symbol, i.securityType);
    }
  }
  return out;
}

function peerTable(root = ROOT) {
  const t = JSON.parse(fs.readFileSync(path.join(root, 'quant/data/product/sic-peer-taxonomy-v1.json'), 'utf8'));
  const col = Object.fromEntries(t.rowColumns.map((n, i) => [n, i])), out = new Map();
  for (const r of t.rows) out.set(r[col.securityId], { cik: r[col.cik] || null, sic4: Number.parseInt(r[col.sic4], 10), ticker: r[col.ticker] });
  return out;
}

/** Outcome-free frame: qualified listings, modal weekly calendar, rank dates, issuer mapping. */
function buildFrame(loaderOptions = DEFAULT_LOADER_OPTIONS, root = ROOT) {
  const loader = Loader.createResearchLoader(root, loaderOptions);
  const files = fs.readdirSync(path.join(root, SERIES_DIR)).filter(f => /^ref_.*\.json$/.test(f)).sort();
  const reasons = {}, docs = new Map();
  for (const f of files) {
    const id = f.slice(0, -5);
    try { docs.set(id, loader(id)); reasons.QUALIFIED = (reasons.QUALIFIED || 0) + 1; }
    catch (e) { const r = String(e.message).split(':')[0]; reasons[r] = (reasons[r] || 0) + 1; }
  }
  const qualified = [...docs.keys()];
  const labels = new Map();
  for (const id of qualified) for (const [d] of docs.get(id).points) { const k = weekOf(d); if (!labels.has(k)) labels.set(k, new Map()); const m = labels.get(k); m.set(d, (m.get(d) || 0) + 1); }
  const modal = new Map([...labels].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0]]));
  const calendar = [...modal.values()].sort();
  const nonEquity = nonEquitySymbols(root), peers = peerTable(root);
  const excluded = { NON_MODAL_WEEK_LABEL: [], EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET: [], NOT_AN_EQUITY_LISTING: [] };
  const listings = [];
  for (const id of qualified) {
    const d = docs.get(id), exch = String(d.listingId).split(':')[1];
    if (d.points.some(([x]) => modal.get(weekOf(x)) !== x)) { excluded.NON_MODAL_WEEK_LABEL.push(id); continue; }
    if (!MIC[exch]) { excluded.EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET.push(id); continue; }
    if (nonEquity.has(d.ticker)) { excluded.NOT_AN_EQUITY_LISTING.push(id); continue; }
    const peer = peers.get(id) || null;
    const cik = d.identityEvidenceBinding?.cik || peer?.cik || null;
    listings.push({ securityId: id, ticker: d.ticker, listingId: d.listingId, mic: MIC[exch], listingStart: d.listingStart, identityHash: d.identityHash,
      masterGeneratedAt: d.masterGeneratedAt, cik, sic4: peer && Number.isFinite(peer.sic4) ? peer.sic4 : null,
      identitySource: d.identityEvidenceBinding ? 'IDENTITY_EVIDENCE_BINDING' : peer?.cik ? 'SIC_PEER_TAXONOMY' : 'NONE',
      points: d.points, splits: (d.corporateActions?.splits || []).map(s => [s[0], s[1]]),
      sourceBytesHash: d.sourceBytesHash, listingLifecycle: d.listingLifecycle ?? null, returnBasis: d.returnBasis });
  }
  // Rank dates: last modal calendar date of each month in the window.
  const lastOfMonth = new Map();
  for (const d of calendar) lastOfMonth.set(d.slice(0, 7), d);
  const rankDates = [...lastOfMonth].filter(([m]) => m >= RANK_WINDOW[0] && m <= RANK_WINDOW[1]).map(([, d]) => d).sort();
  const ciks = new Map();
  for (const l of listings) if (l.cik) { if (!ciks.has(l.cik)) ciks.set(l.cik, []); ciks.get(l.cik).push(l.securityId); }
  return { loaderOptions, masterHash: loader.masterHash, reasons, qualifiedCount: qualified.length, calendar, rankDates, excluded, listings, ciks };
}

function spyWeekly(calendar, root = ROOT) {
  const bench = B.load(root);
  const bars = calendar.filter(d => bench.byDate.has(d)).map(d => ({ date: d, close: bench.byDate.get(d) }));
  return { bars, missing: calendar.filter(d => !bench.byDate.has(d) && d >= bench.provenance.from), provenance: bench.provenance };
}

function privateDir(directory) {
  if (!directory) throw Error('PRIVATE_OUTPUT_REQUIRED');
  const out = path.resolve(directory); fs.mkdirSync(out, { recursive: true });
  const real = fs.realpathSync(out); if (real === ROOT || real.startsWith(ROOT + path.sep)) throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  return out;
}

module.exports = { ROOT, SERIES_DIR, MIC, DEFAULT_LOADER_OPTIONS, RANK_WINDOW, sha, weekOf, dayBefore, parseLoaderOptions, nonEquitySymbols, peerTable, buildFrame, spyWeekly, privateDir, C };
