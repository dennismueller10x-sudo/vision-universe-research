// VISION UNIVERSE SCREENER — Universums-Artefakt
//
// Baut aus den bereits vorhandenen, echten Produktdaten eine kompakte,
// spaltenbasierte Tabelle fuer den Screener:
//
//   discover/data/stocks/US_REAL/*.json        Kurs, Technik, Momentum, SEC-Fundamentaldaten
//   quant/data/market/discover-series/*.json   1 Jahr Tagesschluss -> RSI, MACD, SMA50/200, 1W, YTD
//   quant/data/universe/instruments/*.json     Wertpapierstamm (Typ, Boerse, erster Handelstag)
//   quant/data/product/sic-peer-taxonomy-v1    SIC-Code je Emittent
//   quant/data/product/factor-evidence-v1      Quant-V2-Faktorevidenz je Faktor (0-100)
//   discover/config/company-recognition.json   redaktionelle Einzeiler (Was macht das Unternehmen)
//   quant/data/technical-intelligence/v3       Chartbild-Index (Ausblick, Kursstruktur, Elliott-Klarheit)
//
// Es werden KEINE Werte erfunden. Fehlt eine Eingabe, steht in der Spalte null.
// Abgeleitete Kennzahlen (ROIC, EV/EBITDA, RSI ...) folgen den Formeln in
// FORMULAS; das Artefakt traegt sie mit, damit die Oberflaeche sie zeigt.
//
// Aufruf:  node scripts/screener/build-universe.mjs [--root=.] [--out=screener/data]
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { MAJOR_GROUPS, DIVISIONS, SECTORS, SIC_SECTOR_VERSION, sectorFromSic } from './sic.mjs';

export const SCHEMA = 'vu-screener-universe-1.0.0';
const UNIVERSE = 'US_REAL';

export const FORMULAS = {
  perf1w: 'Schlusskurs / Schlusskurs vor 5 Handelstagen - 1',
  perfYtd: 'Schlusskurs / letzter Schlusskurs des Vorjahres - 1',
  rsi14: 'RSI nach Wilder, 14 Tage, Tagesschluss',
  macdHist: '(MACD 12/26 - Signal 9) / Kurs',
  sma50vs200: 'SMA50 / SMA200 - 1 (Tagesschluss)',
  distEma21: 'Kurs / EMA21 - 1',
  bollB: '%B der Bollinger-Baender (20 Tage, 2 Standardabweichungen)',
  roa: 'Jahresueberschuss / Bilanzsumme (letztes Geschaeftsjahr)',
  roic: 'Operatives Ergebnis x (1 - Steuerquote) / (Eigenkapital + Finanzschulden - Kasse)',
  cashConversion: 'Operativer Cashflow / Jahresueberschuss (nur bei Gewinn)',
  debtToEquity: 'Finanzschulden / Eigenkapital',
  netDebtEbitda: '(Finanzschulden - Kasse) / EBITDA',
  pb: 'Marktkapitalisierung / Eigenkapital',
  ev: 'Marktkapitalisierung + Finanzschulden - Kasse',
  evSales: 'Unternehmenswert / Umsatz (TTM)',
  evEbitda: 'Unternehmenswert / EBITDA (TTM, sonst Geschaeftsjahr)',
  pFcf: 'Marktkapitalisierung / Free Cashflow (TTM)',
  peg: 'KGV / (EPS-Wachstum p. a. ueber 3 Jahre in %) - historisch, keine Schaetzung',
  epsGrowth: 'Verwaesserter Gewinn je Aktie, letztes Geschaeftsjahr ggü. Vorjahr (nur bei positivem Vorjahr)',
  epsCagr3: 'CAGR des verwaesserten EPS ueber 3 Geschaeftsjahre (nur bei positiven Endpunkten)',
  fcfGrowth: 'Free Cashflow, letztes Geschaeftsjahr ggü. Vorjahr (nur bei positivem Vorjahr)',
  niGrowthTtm: 'Jahresueberschuss TTM ggü. Vorjahreszeitraum'
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function round(v, digits = 5) {
  if (!Number.isFinite(v)) return null;
  return Number(v.toPrecision(digits));
}
const ratio = (a, b) => (num(a) !== null && num(b) !== null && b !== 0 ? a / b : null);
const growth = (now, then) => (num(now) !== null && num(then) !== null && then > 0 ? now / then - 1 : null);

function annual(fund, key) { return num(fund?.latest?.annual?.[key]?.v); }
function ttm(fund, key) { return num(fund?.latest?.ttm?.[key]?.v); }
function track(fund, key) { const t = fund?.journey?.tracks?.[key]; return Array.isArray(t) ? t.filter((p) => num(p.v) !== null) : []; }

// ---- Indikatoren aus der Tagesreihe -------------------------------------
function sma(values, n) { if (values.length < n) return null; let s = 0; for (let i = values.length - n; i < values.length; i++) s += values[i]; return s / n; }
function emaSeries(values, n) { if (values.length < n) return null; const k = 2 / (n + 1); let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n; const out = new Array(n - 1).fill(null); out.push(e); for (let i = n; i < values.length; i++) { e = values[i] * k + e * (1 - k); out.push(e); } return out; }
function rsi(values, n = 14) {
  if (values.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = values[i] - values[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < values.length; i++) { const d = values[i] - values[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
  if (l === 0) return g === 0 ? 50 : 100;
  return 100 - 100 / (1 + g / l);
}
export function indicators(points) {
  const out = { perf1w: null, perfYtd: null, rsi14: null, macdHist: null, sma50vs200: null, distEma21: null, bollB: null };
  if (!Array.isArray(points) || points.length < 6) return out;
  const closes = points.map((p) => p[1]).filter((v) => num(v) !== null && v > 0);
  if (closes.length !== points.length) return out;
  const last = closes[closes.length - 1];
  out.perf1w = closes.length > 5 ? last / closes[closes.length - 6] - 1 : null;
  const lastDate = points[points.length - 1][0];
  const year = lastDate.slice(0, 4);
  let prevYearClose = null;
  for (let i = points.length - 1; i >= 0; i--) if (points[i][0].slice(0, 4) < year) { prevYearClose = points[i][1]; break; }
  out.perfYtd = prevYearClose ? last / prevYearClose - 1 : null;
  out.rsi14 = rsi(closes, 14);
  const e12 = emaSeries(closes, 12), e26 = emaSeries(closes, 26);
  if (e12 && e26 && closes.length >= 35) {
    const macd = e26.map((v, i) => (v === null ? null : e12[i] - v)).filter((v) => v !== null);
    const sig = emaSeries(macd, 9);
    if (sig) out.macdHist = (macd[macd.length - 1] - sig[sig.length - 1]) / last;
  }
  const s50 = sma(closes, 50), s200 = sma(closes, 200);
  out.sma50vs200 = s50 && s200 ? s50 / s200 - 1 : null;
  const e21 = emaSeries(closes, 21);
  out.distEma21 = e21 ? last / e21[e21.length - 1] - 1 : null;
  if (closes.length >= 20) {
    const w = closes.slice(-20), m = w.reduce((a, b) => a + b, 0) / 20;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) * (b - m), 0) / 20);
    out.bollB = sd > 0 ? (last - (m - 2 * sd)) / (4 * sd) : null;
  }
  return out;
}

// ---- Spalten --------------------------------------------------------------
// Reihenfolge = Reihenfolge im Artefakt. Text- und Listen-Spalten stehen vorn.
export const COLUMNS = [
  's', 'n', 'ex', 'co', 'cls', 'sec', 'sic2', 'div', 'ipo', 'idx', 'was',
  'price', 'chg1d', 'mcap', 'ev', 'avgVol', 'dollarVol', 'beta', 'relVol',
  'revGrowth', 'revCagr3', 'revCagr10', 'epsGrowth', 'epsCagr3', 'niGrowthTtm', 'fcfGrowth', 'marginExp3y',
  'grossMargin', 'opMargin', 'netMargin', 'fcfMargin', 'roe', 'roa', 'roic', 'cashConversion',
  'debtToEquity', 'netDebtEbitda', 'cash', 'totalDebt', 'netCash', 'revenue', 'fcf', 'eps',
  'pe', 'peg', 'ps', 'pb', 'evSales', 'evEbitda', 'pFcf', 'fcfYield',
  'perf1w', 'perf1m', 'perf3m', 'perf6m', 'perfYtd', 'perf1y', 'rs6m', 'rs12m', 'rsPct', 'momPct',
  'distSma20', 'distSma50', 'distSma100', 'distSma200', 'sma50vs200', 'distEma21', 'dist52wH', 'dist52wL', 'newHigh',
  'rsi14', 'macdHist', 'bollB', 'vol252', 'maxDd',
  'fQuality', 'fGrowth', 'fMomentum', 'fValue', 'fProfitability', 'fRevisions', 'fRisk', 'vq',
  'tiOut', 'tiStr', 'tiEw'
];
const TEXT = new Set(['s', 'n', 'ex', 'co', 'cls', 'sec', 'sic2', 'div', 'ipo', 'was', 'vq', 'tiOut', 'tiStr', 'tiEw']);

// CHARTBILD (Technical Intelligence)
// Nur Zustaende aus dem veroeffentlichten Index, keine eigene Berechnung. Ein
// Titel, dessen Chartbild mehr als TI_MAX_AGE_DAYS hinter dem juengsten Stand
// des Index liegt, bekommt null statt eines veralteten Zustands.
export const TI_MAX_AGE_DAYS = 28;
const TI_ENUMS = {
  outlook: ['BULLISH', 'BEARISH', 'NEUTRAL', 'MIXED'],
  structure: ['UPTREND_ADVANCING', 'CORRECTION_IN_UPTREND', 'DOWNTREND_ADVANCING', 'RALLY_IN_DOWNTREND', 'SIDEWAYS_RANGE', 'NO_CLEAR_TREND'],
  elliottApplicable: ['HIGH', 'MODERATE', 'LOW']
};
/** index.json.gz (vu-ti-api-3) -> Map(ticker -> { tiOut, tiStr, tiEw }) und Metadaten. */
export function technicalIntelligenceColumns(index, opts = {}) {
  const byTicker = new Map();
  const rows = Array.isArray(index?.rows) ? index.rows : [];
  const latest = rows.reduce((m, r) => (typeof r.asOf === 'string' && r.asOf > m ? r.asOf : m), '');
  /* Bezug: Baudatum (opts.now), sonst juengster Stand – ein insgesamt veralteter Index gilt sonst als frisch (Code-Review M3). */
  const ref = opts.now || latest;
  const cutoff = ref ? new Date(Date.parse(ref) - TI_MAX_AGE_DAYS * 864e5).toISOString().slice(0, 10) : '';
  let stale = 0;
  const pick = (k, v) => (TI_ENUMS[k].includes(v) ? v : null);
  for (const r of rows) {
    if (!r || typeof r.t !== 'string') continue;
    if (!r.asOf || r.asOf < cutoff || r.stale) { stale++; continue; }   // r.stale: unveraenderter Schlusskurs (tote Reihe)
    byTicker.set(r.t, { tiOut: pick('outlook', r.outlook), tiStr: pick('structure', r.structure), tiEw: pick('elliottApplicable', r.elliottApplicable) });
  }
  return { byTicker, meta: rows.length ? { schemaVersion: index.schemaVersion || null, generatedAt: index.generatedAt || null, asOf: latest || null, maxAgeDays: TI_MAX_AGE_DAYS, stale } : null };
}

// VALUATION_POLICY
// Marktkapitalisierung und alle Kennzahlen, die den Kurs mit einer SEC-Aktienzahl
// oder einem Pro-Aktie-Wert verbinden, sind nur belastbar, wenn die Aktienzahl
// dieselbe Gattung beschreibt, die an der US-Boerse gehandelt wird.
//  - FOREIGN_FILER: keine Quartalsberichte in XBRL (kein TTM-Stand) - typisch fuer
//    20-F-Einreicher - UND ein US-Tagesumsatz unter 0,1 % der rechnerischen
//    Marktkapitalisierung: das Muster eines ADR mit unbekanntem Verhaeltnis
//    (gemessen: BHP 0,047 %, LATAM 0,0001 %; ADP, ARM, WPM liegen darueber).
//  - NON_USD_REPORTING: Berichtswaehrung ist nicht USD; Kurs (USD) und Gewinn je
//    Aktie (Landeswaehrung) waeren gemischt.
//  - IMPLAUSIBLE_SHARE_BASIS: Tagesumsatz / Marktkapitalisierung unter 0,002 %
//    oder ueber 100 %, Marktkapitalisierung <= 0 oder ueber 7 Bio. USD - die Aktienbasis
//    passt nicht zum Papier (gemessen: Chewy 1.827 $, Tempus AI 15 Mio. $, Hinge Health 0 $).
// Betroffene Werte werden NICHT gezeigt (null), statt falsch zu sein. Waehrungs-
// neutrale Verhaeltnisse (Margen, Wachstum, Renditen, Verschuldungsgrad) bleiben.
export const MIN_TURNOVER = 2e-5;
export const FOREIGN_MIN_TURNOVER = 1e-3;
export const MAX_MARKET_CAP = 7e12;
export const MAX_TURNOVER = 1;
export const SHARE_BASIS_COLUMNS = ['mcap', 'ev', 'pe', 'peg', 'ps', 'pb', 'evSales', 'evEbitda', 'pFcf', 'fcfYield', 'eps'];
export const CURRENCY_COLUMNS = ['revenue', 'fcf', 'cash', 'totalDebt', 'netCash', 'eps'];

async function loadJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

export async function buildUniverse({ root = process.cwd(), log = () => {} } = {}) {
  root = resolve(root);
  const stocksDir = join(root, 'discover/data/stocks', UNIVERSE);
  const files = (await readdir(stocksDir)).filter((f) => f.endsWith('.json')).sort();

  // Wertpapierstamm
  const instruments = new Map();
  for (const f of (await readdir(join(root, 'quant/data/universe/instruments'))).filter((x) => x.endsWith('.json'))) {
    for (const i of (await loadJson(join(root, 'quant/data/universe/instruments', f))).instruments || []) if (!instruments.has(i.symbol)) instruments.set(i.symbol, i);
  }
  // SIC
  const sicByTicker = new Map();
  try {
    const tax = await loadJson(join(root, 'quant/data/product/sic-peer-taxonomy-v1.json'));
    const c = tax.rowColumns;
    for (const r of tax.rows) sicByTicker.set(r[c.indexOf('ticker')], { sic4: r[c.indexOf('sic4')], div: r[c.indexOf('sicDivision')] });
  } catch (err) { log('SIC-Taxonomie fehlt: ' + err.message); }
  // Faktorevidenz
  const factors = new Map();
  let factorMeta = null;
  try {
    const dir = join(root, 'quant/data/product/factor-evidence-v1');
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json.gz'))) {
      const shard = JSON.parse(gunzipSync(await readFile(join(dir, f))).toString('utf8'));
      if (!factorMeta) factorMeta = { methodologyVersion: shard.methodologyVersion, asOf: shard.asOf, publication: shard.publication };
      for (const [t, sec] of Object.entries(shard.securities || {})) factors.set(t, sec);
    }
  } catch (err) { log('Faktorevidenz fehlt: ' + err.message); }
  // Chartbild
  let ti = { byTicker: new Map(), meta: null };
  try { ti = technicalIntelligenceColumns(JSON.parse(gunzipSync(await readFile(join(root, 'quant/data/technical-intelligence/v3/index.json.gz'))).toString('utf8')), { now: new Date().toISOString().slice(0, 10) }); }
  catch (err) { log('Chartbild-Index fehlt: ' + err.message); }
  // Redaktionelle Einzeiler
  let recognition = { companies: {}, businessDescriptions: {} };
  try { recognition = await loadJson(join(root, 'discover/config/company-recognition.json')); } catch { /* optional */ }

  const cols = Object.fromEntries(COLUMNS.map((c) => [c, []]));
  // Offensichtlich unmoegliche Quellwerte werden nicht gezeigt, sondern gezaehlt.
  const sanitized = { grossMarginAbove100: 0, FOREIGN_FILER: 0, NON_USD_REPORTING: 0, IMPLAUSIBLE_SHARE_BASIS: 0 };
  const plausibleGross = (v) => { if (v !== null && v > 1) { sanitized.grossMarginAbove100++; return null; } return v; };
  const excluded = {};
  let asOf = null, fundamentalsAsOf = null, withSeries = 0;
  for (const file of files) {
    const d = await loadJson(join(stocksDir, file));
    const inst = instruments.get(d.symbol);
    if (!inst || inst.screenerEligible !== true) { const r = !inst ? 'NO_MASTER_RECORD' : (inst.securityType + ':' + inst.productEligibility); excluded[r] = (excluded[r] || 0) + 1; continue; }
    const f = d.fundamentals && d.fundamentals.available ? d.fundamentals : null;
    const m = d.metrics || {}, rv = d.rawValues || {};
    if (d.asOf && (!asOf || d.asOf > asOf)) asOf = d.asOf;
    if (f?.asOf && (!fundamentalsAsOf || f.asOf > fundamentalsAsOf)) fundamentalsAsOf = f.asOf;

    let series = null;
    const sp = d.priceSeries && d.priceSeries.path;
    if (sp && /^\/quant\/data\/market\/discover-series\/[A-Za-z0-9_.-]+\.json$/.test(sp)) {
      try { series = (await loadJson(join(root, sp.slice(1)))).points; withSeries++; } catch { series = null; }
    }
    const ind = indicators(series);

    const sic = sicByTicker.get(d.symbol);
    const sic4 = sic?.sic4 ? String(sic.sic4).padStart(4, '0') : null;
    const fe = factors.get(d.symbol);
    const fac = (id) => { const x = fe?.factors?.[id]; return x && x.state === 'AVAILABLE' ? num(x.score) : null; };

    const price = num(d.price?.value);
    // PLAUSIBILITAET DER AKTIENBASIS (siehe VALUATION_POLICY)
    const currency = f ? (f.units?.revenue || f.units?.net_income || f.units?.stockholders_equity || f.units?.total_assets || null) : null;
    const foreignFiler = !!f && !f.ttmThrough;
    const currencyOk = !f || currency === 'USD';
    // Nur die geprueft berechnete Discover-Bewertung. Kein Rueckgriff auf andere
    // Quellen: dort standen u. a. 0 $ (Hinge Health) und veraltete Aktienzahlen.
    let mcap = num(f?.valuation?.marketCap?.value);
    const dollarVolRaw = num(d.qualification?.avgDollarVolume20d);
    let vq = 'OK';
    const turnover = mcap && dollarVolRaw !== null ? dollarVolRaw / mcap : null;
    if (!currencyOk) vq = 'NON_USD_REPORTING';
    else if (foreignFiler && (turnover === null || turnover < FOREIGN_MIN_TURNOVER)) vq = 'FOREIGN_FILER';
    else if (mcap !== null && (mcap <= 0 || (dollarVolRaw !== null && (dollarVolRaw / mcap < MIN_TURNOVER || dollarVolRaw / mcap > MAX_TURNOVER)))) vq = 'IMPLAUSIBLE_SHARE_BASIS';
    else if (mcap && mcap > MAX_MARKET_CAP) vq = 'IMPLAUSIBLE_SHARE_BASIS';
    if (vq !== 'OK') { sanitized[vq] = (sanitized[vq] || 0) + 1; mcap = null; }
    const cash = annual(f, 'cash_and_equivalents');
    const totalDebt = annual(f, 'total_debt');
    const equity = annual(f, 'stockholders_equity');
    const ev = mcap !== null && totalDebt !== null && cash !== null ? mcap + totalDebt - cash : null;
    const revTtm = ttm(f, 'revenue') ?? annual(f, 'revenue');
    const ebitda = ttm(f, 'ebitda') ?? annual(f, 'ebitda');
    const fcfTtm = ttm(f, 'free_cash_flow');
    const opInc = annual(f, 'operating_income'), pretax = annual(f, 'pretax_income'), tax = annual(f, 'income_tax_expense');
    const taxRate = pretax && pretax > 0 && tax !== null ? Math.min(Math.max(tax / pretax, 0), 0.5) : 0.21;
    const invested = equity !== null && totalDebt !== null && cash !== null ? equity + totalDebt - cash : null;
    const ni = annual(f, 'net_income'), ocf = annual(f, 'operating_cash_flow'), assets = annual(f, 'total_assets');
    const eps = track(f, 'eps_diluted'), fcf = track(f, 'free_cash_flow');
    const epsGrowth = eps.length >= 2 ? growth(eps.at(-1).v, eps.at(-2).v) : null;
    let epsCagr3 = null;
    if (eps.length >= 4) { const a = eps.at(-4).v, b = eps.at(-1).v; if (a > 0 && b > 0) epsCagr3 = Math.pow(b / a, 1 / 3) - 1; }
    const pe = num(m.f_pe);
    const row = {
      s: d.symbol, n: d.companyName || d.symbol, ex: d.exchange || inst.exchange || null, co: inst.country || null,
      cls: inst.securityClass || null, sec: sic4 ? sectorFromSic(sic4) : null, sic2: sic4 ? sic4.slice(0, 2) : null, div: sic?.div || null,
      ipo: inst.firstTradeDate || null,
      idx: Array.isArray(d.indexMemberships) && d.indexMemberships.length ? d.indexMemberships.map((x) => x.indexId).filter(Boolean) : null,
      was: recognition.businessDescriptions?.[d.symbol] || recognition.companies?.[d.symbol]?.was || null,
      price, chg1d: num(d.changePercent?.value) !== null ? d.changePercent.value / 100 : null,
      mcap, ev, avgVol: num(rv.avgVolume20d), dollarVol: num(d.qualification?.avgDollarVolume20d), beta: num(rv.beta252d), relVol: num(rv.volumeRatio20over60),
      revGrowth: num(m.f_revenueGrowthTTM), revCagr3: num(m.f_revenueGrowth3y), revCagr10: num(m.f_revenueGrowth10y),
      epsGrowth, epsCagr3, niGrowthTtm: num(d.geschaeftszahlen?.gewinnWachstum),
      fcfGrowth: fcf.length >= 2 ? growth(fcf.at(-1).v, fcf.at(-2).v) : null,
      marginExp3y: num(m.f_marginExpansion3y),
      grossMargin: plausibleGross(num(f?.latest?.derived?.grossMargin)), opMargin: num(f?.latest?.derived?.operatingMargin), netMargin: num(f?.latest?.derived?.netMargin),
      fcfMargin: num(f?.latest?.derived?.fcfMargin), roe: num(f?.latest?.derived?.roe),
      roa: assets && assets > 0 ? ratio(ni, assets) : null,
      roic: invested && invested > 0 && opInc !== null ? (opInc * (1 - taxRate)) / invested : null,
      cashConversion: ni && ni > 0 ? ratio(ocf, ni) : null,
      debtToEquity: equity && equity > 0 ? ratio(totalDebt, equity) : null,
      netDebtEbitda: ebitda && ebitda > 0 && totalDebt !== null && cash !== null ? (totalDebt - cash) / ebitda : null,
      cash, totalDebt, netCash: cash !== null && totalDebt !== null ? cash - totalDebt : null, revenue: revTtm,
      fcf: fcfTtm ?? annual(f, 'free_cash_flow'), eps: ttm(f, 'eps_diluted') ?? annual(f, 'eps_diluted'),
      pe, peg: pe && pe > 0 && epsCagr3 && epsCagr3 > 0 ? pe / (epsCagr3 * 100) : null,
      ps: num(m.f_ps), pb: mcap && equity && equity > 0 ? mcap / equity : null,
      evSales: ev !== null && revTtm && revTtm > 0 ? ev / revTtm : null,
      evEbitda: ev !== null && ebitda && ebitda > 0 ? ev / ebitda : null,
      pFcf: mcap && fcfTtm && fcfTtm > 0 ? mcap / fcfTtm : null, fcfYield: num(m.f_fcfYield),
      perf1w: ind.perf1w, perf1m: num(m.return1M), perf3m: num(m.return3M), perf6m: num(m.return6M), perfYtd: ind.perfYtd, perf1y: num(m.return12M),
      rs6m: num(m.relativeStrength6M), rs12m: num(m.relativeStrength12M), rsPct: num(m.relativeStrengthPercentile), momPct: num(m.momentumPercentile),
      distSma20: num(rv.distanceToSMA20), distSma50: num(rv.distanceToSMA50), distSma100: num(rv.distanceToSMA100), distSma200: num(rv.distanceToSMA200),
      sma50vs200: ind.sma50vs200, distEma21: ind.distEma21, dist52wH: num(m.distanceTo52wHigh), dist52wL: num(m.distanceTo52wLow),
      newHigh: typeof rv.newHigh52w === 'boolean' ? (rv.newHigh52w ? 1 : 0) : null,
      rsi14: ind.rsi14, macdHist: ind.macdHist, bollB: ind.bollB, vol252: num(m.volatility252d), maxDd: num(m.maxDrawdown252d),
      fQuality: fac('quality'), fGrowth: fac('growth'), fMomentum: fac('momentum'), fValue: fac('value'), fProfitability: fac('profitability'), fRevisions: fac('revisions'), fRisk: fac('risk')
    };
    if (vq !== 'OK') for (const c of SHARE_BASIS_COLUMNS) row[c] = null;
    if (!currencyOk) for (const c of CURRENCY_COLUMNS) row[c] = null;
    row.vq = vq;
    Object.assign(row, ti.byTicker.get(d.symbol) || { tiOut: null, tiStr: null, tiEw: null });
    for (const c of COLUMNS) {
      const v = row[c];
      cols[c].push(TEXT.has(c) || c === 'idx' ? (v ?? null) : (typeof v === 'number' ? round(v) : null));
    }
  }
  const count = cols.s.length;
  const coverage = Object.fromEntries(COLUMNS.map((c) => [c, cols[c].filter((v) => v !== null).length]));
  log(`${count} Titel, ${withSeries} mit Tagesreihe`);
  return {
    schema: SCHEMA, universeId: UNIVERSE, universeLabel: 'US-Aktien', asOf, fundamentalsAsOf,
    generatedAt: new Date().toISOString(), count, excluded, sanitized,
    universeRule: 'Wertpapierstamm: screenerEligible (US-Stammaktien an der Primaerboerse); ETFs, separate Aktiengattungen und Titel in Pruefung sind ausgeschlossen.',
    sources: {
      prices: 'Tiingo Tagesschluss (discover/data/stocks, quant/data/market/discover-series)',
      fundamentals: 'SEC EDGAR companyfacts (fundamentals-1.2.0)',
      classification: 'SEC SIC-Code (sic-peer-taxonomy-1.0.0) + ' + SIC_SECTOR_VERSION,
      factors: factorMeta ? factorMeta.methodologyVersion : null,
      technicalIntelligence: ti.meta ? ti.meta.schemaVersion + ' (meist Wochenchart; Elliott experimentell, nicht in den Ausblick gewichtet)' : null
    },
    technicalIntelligence: ti.meta,
    factorPublication: factorMeta ? { ...factorMeta.publication, asOf: factorMeta.asOf } : { compositeAllowed: false, rankingAllowed: false, reason: 'SOURCE_MISSING' },
    valuationPolicy: { minTurnover: MIN_TURNOVER, maxTurnover: MAX_TURNOVER, foreignMinTurnover: FOREIGN_MIN_TURNOVER, maxMarketCap: MAX_MARKET_CAP, withheld: SHARE_BASIS_COLUMNS },
    formulas: FORMULAS,
    dict: { sectors: SECTORS, majorGroups: MAJOR_GROUPS, divisions: DIVISIONS },
    coverage, columns: COLUMNS, cols
  };
}

export async function writeUniverse({ root = process.cwd(), out, log = console.log } = {}) {
  const data = await buildUniverse({ root, log });
  const target = resolve(out || join(root, 'screener/data'));
  await mkdir(target, { recursive: true });
  const bytes = Buffer.from(JSON.stringify(data));
  await writeFile(join(target, 'universe-' + UNIVERSE + '.json'), bytes);
  log(`geschrieben: ${join(target, 'universe-' + UNIVERSE + '.json')} (${(bytes.length / 1048576).toFixed(2)} MiB)`);
  return { count: data.count, bytes: bytes.length, asOf: data.asOf };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => process.argv.find((a) => a.startsWith('--' + k + '='))?.slice(k.length + 3);
  await writeUniverse({ root: arg('root') || process.cwd(), out: arg('out') });
}
