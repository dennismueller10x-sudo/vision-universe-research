// Supertrader — interner Datentest (Validierung). Gemeinsame Bausteine:
// Tickerliste, Listing-Tabelle, Split-/Gesamtrendite-Rechnung, Verschluesselung.
//
// Alles hier ist rein (ohne Netz), damit Tests es ohne Zugang pruefen koennen.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const PREREG_VERSION = 'supertrader-validation-prereg-1.0.0';
export const EXCHANGES = new Set(['NYSE', 'NASDAQ', 'AMEX', 'NYSE MKT', 'NYSE ARCA', 'BATS']);
export const WINDOW = Object.freeze({ warmupFrom: '2015-01-01', from: '2016-01-04', to: '2026-09-30' });
export const INCLUDED_CLASSES = new Set(['EQUITY_COMMON', 'ADR', 'REIT']);
export const LIST_URL = 'https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip';

export const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function unzipCsv(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP ohne Verzeichnis');
  let off = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(off + 10), size = buf.readUInt32LE(off + 20), nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32), lo = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nl);
    if (name.endsWith('.csv')) {
      const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(data).toString('utf8') : data.toString('utf8');
    }
    off += 46 + nl + el + cl;
  }
  throw new Error('keine CSV im ZIP');
}

export function parseTickerCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ''])); });
}

// Listing-Tabelle (vorab registrierte Regeln, PREREGISTRATION.json "listings").
// storeActive: Map ticker -> {startDate, instrumentType} aus dem bestehenden Speicher.
// Zeilen desselben Kuerzels, die sich ueberlappen oder hoechstens 10 Tage
// auseinanderliegen, sind EIN Listing (z. B. Boersenwechsel). Liegt eine
// Luecke > 10 Tage dazwischen, ist das Kuerzel neu vergeben.
export function buildListingTable(rows, storeActive, opts = {}) {
  const today = opts.today || '2026-10-01';
  const eligible = (r) => r.assetType === 'Stock' && r.priceCurrency === 'USD' && EXCHANGES.has(r.exchange) && r.startDate;
  const byTicker = new Map();
  for (const r of rows) if (r.ticker && eligible(r)) (byTicker.get(r.ticker) || byTicker.set(r.ticker, []).get(r.ticker)).push(r);
  const out = [];
  for (const [ticker, rs] of byTicker) {
    rs.sort((a, b) => a.startDate.localeCompare(b.startDate));
    const chains = [];
    for (const r of rs) {
      const c = chains[chains.length - 1];
      const end = r.endDate || '9999-12-31';
      if (c && r.startDate <= addDays(c.end, 10)) { if (end > c.end) { c.end = end; c.exchange = r.exchange; } c.rows++; }
      else chains.push({ start: r.startDate, end, exchange: r.exchange, rows: 1 });
    }
    chains.forEach((c, i) => {
      if (!(c.start <= WINDOW.to && c.end >= WINDOW.warmupFrom)) return;
      const active = c.end === '9999-12-31' || c.end >= addDays(today, -10);
      const isNewest = i === chains.length - 1;
      const store = storeActive.get(ticker);
      const source = !isNewest ? 'UNFETCHABLE_REUSED' : active && store ? 'STORE_ACTIVE' : 'FETCH';
      out.push({
        id: `tiingo:${c.exchange}:${ticker}:${c.start}`, ticker, exchange: c.exchange, startDate: c.start,
        endDate: active ? null : c.end, listEnd: c.end === '9999-12-31' ? null : c.end, active, source,
        reusedLater: !isNewest, listingsOfTicker: chains.length, mergedRows: c.rows,
        plainTicker: /^[A-Z]{1,5}$/.test(ticker), storeClass: store?.instrumentType || null,
      });
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

export function tableHash(listings) {
  return sha256(listings.map((l) => [l.id, l.endDate || '', l.source].join('|')).join('\n'));
}

// Tiingo-Rohzeile -> kompakte Rohkerze (keine bereinigten Kurse gespeichert
// ausser adjClose fuer den Split-Abgleich AT4).
export function toRawBar(row) {
  return {
    date: String(row.date).slice(0, 10), open: num(row.open), high: num(row.high), low: num(row.low), close: num(row.close),
    volume: num(row.volume) ?? 0, adjClose: num(row.adjClose), dividend: num(row.divCash) ?? 0, splitFactor: num(row.splitFactor) ?? 1,
  };
}
function num(v) { const x = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(x) ? null : x; }

// Fetch-Klassifikation einer Reihe gegen ihre Listenzeile (ID1/ID2/okDefinition).
export function classifyFetch(listing, bars, meta) {
  const res = { status: 'EMPTY', bars: 0, outsideWindow: 0, flags: [] };
  if (meta) {
    if (meta.startDate && Math.abs(days(meta.startDate, listing.startDate)) > 7) res.flags.push('META_START_MISMATCH');
    if (!listing.active && meta.endDate && listing.listEnd && Math.abs(days(meta.endDate, listing.listEnd)) > 7) res.flags.push('META_END_MISMATCH');
  }
  if (!Array.isArray(bars) || !bars.length) return res;
  const lo = listing.startDate, hi = listing.listEnd || '9999-12-31';
  const inside = bars.filter((b) => b.date >= lo && b.date <= hi);
  res.outsideWindow = bars.length - inside.length;
  res.bars = inside.length;
  if (!inside.length) { res.status = 'MISMATCH'; return res; }
  res.first = inside[0].date; res.last = inside[inside.length - 1].date;
  const wantFirst = lo > WINDOW.warmupFrom ? lo : WINDOW.warmupFrom;
  const wantLast = listing.active ? WINDOW.to : listing.listEnd;
  const startOk = days(wantFirst, res.first) <= 7;
  const endOk = listing.active ? days(res.last, wantLast) <= 7 : Math.abs(days(res.last, wantLast)) <= 7;
  if (res.flags.includes('META_START_MISMATCH') && res.outsideWindow > inside.length) res.status = 'MISMATCH';
  else res.status = startOk && endOk ? 'OK' : 'PARTIAL';
  if (!startOk) res.flags.push('LATE_START');
  if (!endOk) res.flags.push('EARLY_END');
  return res;
}

// Split-Rueckrechnung und Gesamtrendite aus Rohkerzen (PREREGISTRATION "prices").
// Eingabe: aufsteigend sortierte Rohkerzen. Ausgabe: Spaltenarrays.
export function adjustSeries(raw) {
  const n = raw.length;
  const f = new Float64Array(n); // Divisor: Produkt der splitFactor NACH t
  let acc = 1;
  for (let i = n - 1; i >= 0; i--) { f[i] = acc; const s = raw[i].splitFactor; if (Number.isFinite(s) && s > 0) acc *= s; }
  const out = { date: [], open: [], high: [], low: [], close: [], volume: [], rawClose: [], rawVolume: [], divAdj: [], tr: [], split: [] };
  for (let i = 0; i < n; i++) {
    const b = raw[i], k = f[i];
    out.date.push(b.date);
    out.open.push(b.open == null ? NaN : b.open / k);
    out.high.push(b.high == null ? NaN : b.high / k);
    out.low.push(b.low == null ? NaN : b.low / k);
    out.close.push(b.close == null ? NaN : b.close / k);
    out.volume.push((b.volume || 0) * k);
    out.rawClose.push(b.close);
    out.rawVolume.push(b.volume || 0);
    out.divAdj.push((b.dividend || 0) / k);
    out.split.push(b.splitFactor || 1);
    const p = i > 0 ? raw[i - 1].close : null;
    out.tr.push(i > 0 && p > 0 && b.close != null ? ((b.close + (b.dividend || 0)) * (b.splitFactor || 1)) / p - 1 : null);
  }
  return out;
}

// AT4: an jedem Split-Tag Verhaeltnis der Tiingo-adjClose gegen eigene Rueckrechnung.
export function splitChecks(raw) {
  const res = [];
  for (let i = 1; i < raw.length; i++) {
    const s = raw[i].splitFactor;
    if (!(Number.isFinite(s) && s > 0 && s !== 1)) continue;
    const a0 = raw[i - 1].adjClose, a1 = raw[i].adjClose, c0 = raw[i - 1].close, c1 = raw[i].close;
    if (!(a0 > 0 && a1 > 0 && c0 > 0 && c1 > 0)) { res.push({ date: raw[i].date, factor: s, ok: null }); continue; }
    // Tiingo adjClose ist split- und dividendenbereinigt; am Split-Tag muss das
    // Verhaeltnis adj1/adj0 dem eigenen (c1*s + d*s)/c0 entsprechen.
    const own = ((c1 + (raw[i].dividend || 0)) * s) / c0;
    const prov = a1 / a0;
    res.push({ date: raw[i].date, factor: s, ok: Math.abs(own / prov - 1) <= 0.01 });
  }
  return res;
}

// Distress-Signatur (PREREGISTRATION delistingReturns).
export function distressSignature(rawCloses) {
  const n = rawCloses.length;
  if (!n) return false;
  const last = rawCloses[n - 1];
  if (last < 1) return true;
  if (n > 60 && rawCloses[n - 61] > 0 && last / rawCloses[n - 61] - 1 <= -0.5) return true;
  return false;
}

// ----------------------------------------------------------- Verschluesselung
// Hybrid: zufaelliger AES-256-GCM-Schluessel, mit RSA-OAEP-SHA256 verpackt.
export function encryptForOwner(publicKeyPem, plaintextBuf) {
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(plaintextBuf)), c.final()]);
  const wrapped = crypto.publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  return JSON.stringify({ schema: 'supertrader-sealed-1.0.0', alg: 'RSA-OAEP-256+A256GCM+gzip', wrappedKey: wrapped.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), body: body.toString('base64') });
}

export function decryptSealed(privateKeyPem, sealedJson) {
  const s = JSON.parse(sealedJson);
  const key = crypto.privateDecrypt({ key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(s.wrappedKey, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'base64'));
  d.setAuthTag(Buffer.from(s.tag, 'base64'));
  return zlib.gunzipSync(Buffer.concat([d.update(Buffer.from(s.body, 'base64')), d.final()]));
}

// Gattung eines Listings: us-security-master.classifySecurity plus die
// Namensebene des Live-Universums (company-names: Name weist WARRANT, UNIT,
// RIGHT, PREFERRED aus -> diese Gattung).
const NAME_FORM = [
  ['ETF', /(\b\d+(\.\d+)?X\b.*\b(LONG|SHORT|DAILY|BULL|BEAR)\b|\b(DAILY|BULL|BEAR|LONG|SHORT)\b.*\b\d+(\.\d+)?X\b|\bLEVERAGED\b|\bINVERSE\b|\bDAILY TARGET\b|\bULTRA ?(PRO|SHORT)\b|\bETF\b|\bETN\b)/i],
  ['PREFERRED', /\b(PREFERRED|PFD|PREF\.)/i], ['WARRANT', /\bWARRANTS?\b/i],
  ['RIGHT', /\bRIGHTS?\b/i], ['UNIT', /\bUNITS?\b/i],
];
// Runde 10: Namensmuster fuer Nicht-Aktien, auch im Plural ("ETNs", "ETFs") und mit Faktor
// ("3X", "-2X"). Nur Diagnose/Universumspruefung; die Klassifikation oben bleibt unveraendert.
export const NON_EQUITY_NAME = /(\bETNs?\b|\bETFs?\b|\bETPs?\b|\bEXCHANGE[- ]TRADED\b|\bINDEX[- ]LINKED\b|\bLEVERAGED\b|\bINVERSE\b|[-\s]\d+(\.\d+)?X\b|\bULTRA ?(PRO|SHORT)\b|\bDAILY TARGET\b)/i;
export function nonEquityName(name) { return NON_EQUITY_NAME.test(String(name || '')); }

export function classifyListing(Master, listing, name, listedRoots, today = '2026-10-01') {
  const r = Master.classifySecurity({ ticker: listing.ticker, exchange: listing.exchange, assetType: 'Stock', priceCurrency: 'USD', name: name || '', startDate: listing.startDate, endDate: listing.listEnd || '' }, { today, listedRoots });
  let cls = r.instrumentType, basis = 'classifySecurity';
  if (name) for (const [k, re] of NAME_FORM) if (re.test(name) && cls !== k) { cls = k; basis = 'nameForm'; break; }
  return { cls, confidence: r.classificationConfidence, basis, included: INCLUDED_CLASSES.has(cls) };
}

// Reihenbruch (Amendment A2): Luecke > 30 Kalendertage zwischen zwei Balken
// trennt die Reihe in Abschnitte. Ein Abschnitt vor einem Bruch endet wie ein
// Delisting (Szenarioabrechnung); der naechste beginnt neu (eigene Vorlaufzeit).
export const MAX_GAP_DAYS = 30;
export function splitSegments(raw) {
  const segs = [];
  let cur = [];
  for (const b of raw) {
    if (cur.length && days(cur[cur.length - 1].date, b.date) > MAX_GAP_DAYS) { segs.push(cur); cur = []; }
    cur.push(b);
  }
  if (cur.length) segs.push(cur);
  return segs;
}
