/**
 * Supertrader 8.0 – EOD-Datenadapter zwischen den bestehenden Source-faithful-Engines und den aktuellen Tagesreihen.
 *
 * Liest AUSSCHLIESSLICH bereits committete, kanonische Artefakte (keine Anbieterabrufe, keine Secrets, kein Schreiben):
 *   quant/data/product/technical-signals-v1/<SHARD>.json.gz   Tages-OHLCV, split-adjustiert (history-store, ADR-002)
 *   discover/data/stock-index/US_REAL.json                      Produktuniversum
 *   quant/data/market/security-master/company-names.json        Name, Börse, CIK
 *   quant/data/market/security-master/us-security-master.json   Instrumenttyp, aktiv / inaktiv
 *   quant/data/market/listing-continuity-v1.json                Reihenschnitte (Listing-Schutz)
 *   quant/data/market/discover-series-long/<securityId>.json    Wochenschlüsse (nur Quarantäne-Rückblick vor dem Tagesfenster)
 *   quant/config/market-calendar.json                           XNYS-Sitzungen
 *
 * Er erzeugt die Research-Form der Engines ({ id, bars[{date, open, high, low, close, volume}], terminal }) – dieselbe
 * Form, die runner/snapshot-input.mjs für den eingefrorenen Snapshot liefert. Es gibt keine zweite Normalisierung:
 * Kurse werden 1:1 übernommen, nichts wird aufgefüllt, nichts wird neu adjustiert.
 *
 * Bewusste Abweichungen gegenüber dem Research-Snapshot (docs/SUPERTRADER_8_PRODUCT_INTEGRATION.md §2):
 *  - Tagesfenster 270 Sitzungen (technical-signals-v1), nicht die volle Historie ab 2015;
 *  - kein rawClose / splitAdj: die Universumsgrenze (5 USD) und der Tick ("ein Cent") laufen auf der adjustierten Reihe;
 *  - keine Dividendenbeträge (nur Ereignis-Flags): die Sitzungsrelation der Quarantäne rechnet ohne Dividende;
 *  - terminal ist immer null (aktuelle Listings; ein veralteter letzter Balken ist ein DQ-Befund, kein Delisting).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { nonStockProduct } from '../../validation/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const require = createRequire(import.meta.url);
const Identity = require(path.join(ROOT, 'core/identity.js'));

export const EOD_ADAPTER_VERSION = 'sf8-eod-adapter-1.0.0';
export const SOURCES = Object.freeze({
  dailyBars: 'quant/data/product/technical-signals-v1',
  universe: 'discover/data/stock-index/US_REAL.json',
  names: 'quant/data/market/security-master/company-names.json',
  master: 'quant/data/market/security-master/us-security-master.json',
  continuity: 'quant/data/market/listing-continuity-v1.json',
  weeklyLong: 'quant/data/market/discover-series-long',
  calendar: 'quant/config/market-calendar.json',
});
export const IDENTITY_SCHEME = 'core/identity.js#securityIdForTicker';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readGz = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SHARD_FILE = /^[A-Z0-9_]+\.json\.gz$/;

/** Ticker -> securityId, ausschließlich über core/identity.js (ADR-001). */
export const securityIdOf = (ticker) => Identity.securityIdForTicker(ticker);

/** XNYS-Kalender: Sitzung, nächste Sitzung, Sitzungen in einem Intervall (nur Wochentag + belegte Feiertage). */
export function createCalendar({ root = ROOT, calendar = null } = {}) {
  const cfg = calendar ?? readJson(path.join(root, SOURCES.calendar));
  const x = cfg.exchanges.XNYS, holidays = new Set(x.holidays), weekdays = new Set(x.weekdays), special = new Set(Object.keys(cfg.coverage?.specialClosures || {}));
  const cov = cfg.coverage || {};
  const isSession = (d) => { const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); return weekdays.has(wd) && !holidays.has(d) && !special.has(d); };
  const add = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const inCoverage = (d) => (!cov.from || d >= cov.from) && (!cov.to || d <= cov.to);
  return {
    isSession, inCoverage,
    nextSession(d) { let x2 = add(d, 1); for (let k = 0; k < 10 && !isSession(x2); k++) x2 = add(x2, 1); return x2; },
    sessionsBetween(from, to) { const out = []; for (let d = from; d <= to; d = add(d, 1)) if (isSession(d)) out.push(d); return out; },
    addDays: add,
  };
}

/**
 * Produktuniversum: discover US_REAL ohne ETFs / ETNs / Fonds (dieselbe Regel wie scripts/supertrader/build.mjs,
 * validation/lib.mjs#nonStockProduct). Liefert symbols, excluded und die Stammdaten je Ticker.
 */
export function loadUniverse({ root = ROOT } = {}) {
  const idx = readJson(path.join(root, SOURCES.universe));
  const names = fs.existsSync(path.join(root, SOURCES.names)) ? readJson(path.join(root, SOURCES.names)).rows || [] : [];
  const master = fs.existsSync(path.join(root, SOURCES.master)) ? readJson(path.join(root, SOURCES.master)).rows || [] : [];
  const byName = new Map(names.map((r) => [r.ticker, r]));
  const byMaster = new Map(); for (const r of master) if (!byMaster.has(r.ticker) || r.active_status === 'ACTIVE') byMaster.set(r.ticker, r);
  const symbols = new Set(), excluded = [], meta = new Map();
  for (const sym of idx.symbols) {
    const n = byName.get(sym), m = byMaster.get(sym);
    const why = n ? nonStockProduct({ ticker: sym, exchange: n.exchange, name: n.companyName }) : null;
    if (why) { excluded.push([sym, why]); continue; }
    symbols.add(sym);
    meta.set(sym, {
      companyName: n?.displayName || n?.companyName || null, exchange: n?.exchange || m?.exchange || null, cik: n?.cik || null,
      instrumentType: m?.instrument_type || null, activeStatus: m?.active_status || null,
      adrHint: /\b(ADR|ADS|American Depositary)\b/i.test(n?.companyName || ''),
      // Mantelgesellschaft (SPAC): Kurs hängt am Treuhandwert; nur Namenshinweis, im Security Master nicht klassifiziert
      spacHint: /\b(Acquisition|Capital Acquisition|Merger)\s+(Corp|Corporation|Company|Co|Ltd|Limited|Inc|Holdings|I{1,3}|IV|V)\b|\bAcquisition Corp\b|\bSPAC\b|\bAcquisition$|\bAcquisition (Class|Unit)/i.test(n?.companyName || ''),
    });
  }
  return { universeId: idx.universeId ?? 'US_REAL', symbols, excluded, meta };
}

/** Listing-Schutz: securityId -> { gapDays, firstCutAt } aus listing-continuity-v1 (Reihen mit Unterbrechung). */
export function loadContinuity({ root = ROOT } = {}) {
  const p = path.join(root, SOURCES.continuity);
  if (!fs.existsSync(p)) return { status: 'MISSING', bySecurityId: new Map() };
  const j = readJson(p), pu = j.productUniverse || {}, cols = pu.columns || null, out = new Map();
  for (const r of pu.rows || []) {
    // Spalten laut Erzeuger (scripts/market/guard-listing-continuity.mjs): securityId, ticker, gapDays, droppedBars,
    // droppedTo, keptFrom, firstCutAt; ältere Berichte ohne `columns` haben dieselbe Reihenfolge
    const names = cols || ['securityId', 'ticker', 'gapDays', 'droppedBars', 'droppedTo', 'keptFrom', 'firstCutAt'];
    const at = Object.fromEntries(names.map((c, k) => [c, r[k]]));
    out.set(at.securityId ?? r[0], at);
  }
  return { status: 'LOADED', engine: j.engine ?? null, maxGapDays: j.maxGapDays ?? null, generatedAt: j.generatedAt ?? null, bySecurityId: out };
}

/** Rohform eines Instruments der kanonischen Materialisierung -> Research-Balken (unverändert, aufsteigend). */
export function toResearchBars(raw) {
  const b = raw.bars, out = [];
  for (let k = 0; k < b.timestamps.length; k++) {
    out.push({ date: String(b.timestamps[k]).slice(0, 10), open: b.open[k], high: b.high[k], low: b.low[k], close: b.close[k], volume: b.volume[k] });
  }
  return out;
}

/** Ereignis-Flags (SPLIT, DIVIDEND, ...) je Datum, wie die Materialisierung sie trägt. */
export function corporateActionDates(raw) {
  const f = raw.bars?.corporateActionFlags, out = [];
  if (Array.isArray(f)) f.forEach((x, k) => { if (Array.isArray(x) && x.length) out.push({ date: String(raw.bars.timestamps[k]).slice(0, 10), flags: [...x].sort() }); });
  return out;
}

/** Kanonische Eingabe eines Titels (sortierte Schlüssel), Basis von inputsSha256. */
export const canonicalBars = (bars) => JSON.stringify(bars.map((b) => [b.date, b.open, b.high, b.low, b.close, b.volume]));
export const inputsSha256 = (security) => sha256(`${security.ticker}|${security.id}|${canonicalBars(security.bars)}`);

/**
 * Lädt die aktuellen Tagesreihen des Universums. Fail closed auf Titelebene: ein Instrument ohne echte Daten, mit
 * Mock-Kennung, nicht split-adjustierter Reihe oder abweichender Identität wird nicht still übernommen, sondern mit
 * Grund in `rejected` geführt (Datenqualitätsbefund, kein Kandidat).
 * Optional `tickers`: nur diese Titel (Tests, Einzelanalyse).
 */
export function loadEodSecurities({ root = ROOT, universe = loadUniverse({ root }), tickers = null } = {}) {
  const dir = path.join(root, SOURCES.dailyBars), want = tickers ? new Set(tickers) : null;
  const securities = [], rejected = [], sourceFiles = [];
  let generatedAt = null;
  for (const file of fs.readdirSync(dir).filter((f) => SHARD_FILE.test(f)).sort()) {
    const buf = fs.readFileSync(path.join(dir, file));
    const shard = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
    let used = false;
    for (const [sym, inst] of Object.entries(shard.instruments || {})) {
      if (!universe.symbols.has(sym) || (want && !want.has(sym))) continue;
      used = true;
      const why = [];
      if (inst.isMock || inst.dataMode !== 'real') why.push('NOT_REAL_DATA');
      if (inst.priceSeriesType !== 'SPLIT_ADJUSTED') why.push('NOT_SPLIT_ADJUSTED');
      const b = inst.bars;
      if (!b || !Array.isArray(b.timestamps) || !b.timestamps.length) why.push('NO_BARS');
      let id = null;
      try { id = securityIdOf(sym); } catch { why.push('IDENTITY_TICKER_INVALID'); }
      // die Materialisierung trägt die securityId des Erzeugers; sie muss der core/identity.js-Bildung entsprechen
      if (id && inst.securityId && inst.securityId !== id) why.push('IDENTITY_MISMATCH');
      if (why.length) { rejected.push({ ticker: sym, securityId: id, reasons: why }); continue; }
      const prov = inst.provenance || {};
      securities.push({
        id, ticker: sym, bars: toResearchBars(inst), terminal: null,
        meta: {
          shard: file.replace('.json.gz', ''), ...(universe.meta.get(sym) || {}),
          priceSeriesType: inst.priceSeriesType, adjustmentStatus: prov.adjustmentStatus ?? null,
          caReconciliation: prov.corporateActionReconciliation?.status ?? null, splitEvents: prov.splitEvents ?? null,
          calendarValidation: prov.calendarValidation?.status ?? null, sourceBars: prov.sourceBars ?? null, historyFirst: prov.first ?? null,
          corporateActions: corporateActionDates(inst),
        },
      });
    }
    if (used) sourceFiles.push({ file: `${SOURCES.dailyBars}/${file}`, sha256: sha256(buf) });
    if (shard.generatedAt && (!generatedAt || shard.generatedAt > generatedAt)) generatedAt = shard.generatedAt;
  }
  securities.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  // ADR-001: eine securityId genau einmal; Doppelte werden beide abgelehnt (keine Wahl einer Reihe)
  const seen = new Map(); for (const s of securities) seen.set(s.id, (seen.get(s.id) || 0) + 1);
  const dup = new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  const kept = securities.filter((s) => { if (!dup.has(s.id)) return true; rejected.push({ ticker: s.ticker, securityId: s.id, reasons: ['DUPLICATE_SECURITY_ID'] }); return false; });
  rejected.sort((a, b) => (a.ticker < b.ticker ? -1 : 1));
  return { securities: kept, rejected, generatedAt, sourceFiles };
}

/**
 * Marktstichtag = häufigster letzter Balken des Universums (der Stand der täglichen Materialisierung). Titel mit einem
 * älteren letzten Balken sind veraltet (DQ), nie ein Grund, den Stichtag zurückzusetzen.
 */
export function marketAsOf(securities) {
  const c = new Map(); for (const s of securities) { const d = s.bars.at(-1)?.date; if (d) c.set(d, (c.get(d) || 0) + 1); }
  let best = null; for (const [d, n] of c) if (!best || n > best[1] || (n === best[1] && d > best[0])) best = [d, n];
  return best ? best[0] : null;
}

/** Wochenschlüsse aus discover-series-long (nur für den Quarantäne-Rückblick vor dem Tagesfenster). */
export function loadWeeklyCloses(securityId, { root = ROOT } = {}) {
  const p = path.join(root, SOURCES.weeklyLong, `${securityId}.json`);
  if (!fs.existsSync(p)) return null;
  const j = readJson(p);
  // nur echte, split-adjustierte Reihen (dieselbe Preisbasis wie die Tagesbalken); sonst gilt der Rückblick als ungeprüft
  if (j.dataMode !== 'real' || j.priceSeriesType !== 'SPLIT_ADJUSTED') return null;
  return Array.isArray(j.points) ? j.points.map(([d, c]) => ({ date: String(d).slice(0, 10), close: c })) : null;
}

/** Fingerprint der Adapterdateien (für provenance.codeSha256 zusammen mit den Engine-Dateien). */
export function fileSha256(rel, root = ROOT) { return sha256(fs.readFileSync(path.join(root, rel))); }
