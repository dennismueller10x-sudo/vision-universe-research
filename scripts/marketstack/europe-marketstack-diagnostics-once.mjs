/** One-off owner-approved Marketstack diagnostics (03.11.2026). At most 90
 * actual provider requests, hard-limited per section in code:
 *   a) PARIS   <= 40  symbol problem of 13 XPAR listings (metadata, route, overlap)
 *   b) ROUTES  <= 45  the committed #1285 probe plan, exactly as planned
 *   c) RESERVE <= 5   declared, never used automatically (no code path spends it)
 * Every attempt is journaled before it is sent. No retry, no cache, no
 * pagination beyond the explicit request. Licensed raw bodies and prices go
 * only to the private --out directory (sealed by europe-live-private-archive);
 * --publicOut receives counts, statuses, hashes and non-licensed metadata.
 * Production data, calendars, quarantine, identity and gates are only read. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { privateReplayRoot } from './europe-private-files.mjs';
const require = createRequire(import.meta.url);
const { createMarketstackClient } = require('../../providers/marketstack/client.js');
const { normalizeObservation } = require('../../providers/marketstack/audit-adapter.js');

export const VERSION = 'vu-europe-marketstack-diagnostics-once-1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const LIMITS = Object.freeze({ total: 90, PARIS: 40, ROUTES: 45, RESERVE: 5 });
export const PLAN_PATH = 'docs/reports/europe-marketstack-gap-analysis-20261103/europe_gap_route_probe_plan.json';
export const PLAN_SHA256 = 'e2d4194425949f06e0915c16844ead84944b42cfe3f1237b06c17567b39e117e';
// The 13 Paris listings that answer /eod?symbols=X.PA&exchange=XPAR with
// HTTP 422 no_valid_symbols_provided since 03.11.2026. Search terms are fixed
// here (short legal names), never derived from a provider answer.
export const PARIS = Object.freeze([
  ['AC.PA', 'Accor'], ['AI.PA', 'Air Liquide'], ['AIR.PA', 'Airbus'], ['CDI.PA', 'Dior'], ['CS.PA', 'AXA'],
  ['DG.PA', 'Vinci'], ['EL.PA', 'Essilor'], ['ERF.PA', 'Eurofins'], ['MC.PA', 'LVMH'], ['SOI.PA', 'Soitec'],
  ['SU.PA', 'Schneider'], ['TEP.PA', 'Teleperformance'], ['VIE.PA', 'Veolia']].map(([symbol, search]) => Object.freeze({ symbol, search })));
// Working .PA listings, requested together in ONE request: positive route
// control and the only multi-symbol request (billing per request vs symbol).
export const PARIS_CONTROL_SYMBOLS = Object.freeze(['BN.PA', 'OR.PA', 'SAN.PA']);
// Overlap window: last ten stored sessions up to the last verified close
// 2026-10-09, extended to 2026-11-02 to see whether later sessions exist.
// Independently documented actions used as positive references (#1285 plan).
export const EXPECTED_ACTIONS = Object.freeze({
  '/splits': { datePrefix: '2020-08-31', source: 'AAPL 4:1 split, ex-date 2020-08-31' },
  '/tickers/EUZ.DE/splits': { datePrefix: '2025-08', source: 'Eckert & Ziegler official 3:1 split, August 2025' },
  '/tickers/AI.PA/splits': { datePrefix: '2019-10', source: 'Air Liquide free-share attribution, October 2019' } });
export const PARIS_WINDOW = Object.freeze({ from: '2026-09-28', to: '2026-11-02', storedTo: '2026-10-09' });

const sha = x => createHash('sha256').update(x).digest('hex');
const check = (ok, code) => { if (!ok) throw new Error(code); };
const HEADER_PATTERN = /(limit|quota|remaining|usage|credit|count|retry|request|apilayer|x-rate|^date$|^cf-cache-status$)/i;

/** Hard request ledger. reserve() must succeed before the transport may send;
 * the client's sharedBudget hook consumes exactly one gate token per send, so
 * no hidden pagination, retry or extra request can pass. */
export function createLedger({ limits = LIMITS, journal = () => {} } = {}) {
  const used = { PARIS: 0, ROUTES: 0, RESERVE: 0 };
  let total = 0, token = null;
  return {
    gate(section) {
      check(Object.hasOwn(used, section), 'UNKNOWN_SECTION');
      check(section !== 'RESERVE', 'RESERVE_REQUIRES_SEPARATE_OWNER_DECISION');
      check(token === null, 'GATE_ALREADY_OPEN');
      if (used[section] + 1 > limits[section]) return false;
      if (total + 1 > limits.total) return false;
      token = section; return true;
    },
    // Called by the client immediately before fetch (sharedBudget.reserve).
    async reserve() {
      if (token === null) { const e = new Error('UNGATED_REQUEST_REFUSED'); e.code = 'ungatedRequest'; throw e; }
      const section = token; token = null;
      used[section]++; total++;
      check(used[section] <= limits[section] && total <= limits.total, 'HARD_LIMIT_BREACHED');
      journal({ seq: total, section, sectionSeq: used[section], reservedAt: new Date().toISOString() });
    },
    close() { token = null; },
    used: () => ({ ...used, total })
  };
}

function rowsOf(body) {
  if (!body || typeof body !== 'object') return [];
  const d = body.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.eod)) return d.eod;
  if (d && Array.isArray(d.tickers)) return d.tickers;
  if (d && typeof d === 'object' && ('close' in d || 'symbol' in d || 'ticker' in d)) return [d];
  if ('close' in body || 'split_factor' in body) return [body];
  return [];
}
const day = r => typeof r?.date === 'string' ? r.date.slice(0, 10) : null;
const decimals = v => { const s = String(v); return s.includes('.') ? s.split('.')[1].length : 0; };
/** Exact equality, or equality at the stored value's own printed precision. */
export function compareClose(row, stored) {
  if (stored === undefined || stored === null) return 'NO_STORED_BAR';
  const tol = 0.5 * 10 ** -decimals(stored) + 1e-12;
  const c = Number(row?.close), a = Number(row?.adj_close);
  if (c === stored) return 'CLOSE_EXACT';
  if (Number.isFinite(c) && Math.abs(c - stored) <= tol) return 'CLOSE_AT_STORED_PRECISION';
  if (Number.isFinite(a) && Math.abs(a - stored) <= tol) return 'ADJ_CLOSE_AT_STORED_PRECISION_ONLY';
  return 'MISMATCH';
}
export function ohlcPlausible(r) {
  const [o, h, l, c] = ['open', 'high', 'low', 'close'].map(k => Number(r?.[k]));
  return [o, h, l, c].every(x => Number.isFinite(x) && x > 0) && l <= Math.min(o, c) && h >= Math.max(o, c) && l <= h;
}
export function actionFields(r) {
  const s = r?.split_factor, d = r?.dividend;
  const split = s === undefined || s === null ? 'NOT_REPORTED' : Number(s) === 1 ? 'NONE' : 'SPLIT_FACTOR_' + Number(s);
  const div = d === undefined || d === null ? 'NOT_REPORTED' : Number(d) === 0 ? 'NONE' : 'DIVIDEND_REPORTED';
  return { split, dividend: div, unresolved: split.startsWith('SPLIT_FACTOR_') || div === 'DIVIDEND_REPORTED' };
}
const micOfRow = r => normalizeObservation(r, { kind: 'EOD' }).normalized.providerExchange;

/** Stored, already verified history (published display artifacts; read only). */
export function loadStored(root = ROOT) {
  const catalog = JSON.parse(readFileSync(join(root, 'discover/data/europe/catalog.json'), 'utf8'));
  const bySymbol = new Map();
  for (const s of catalog.securities) {
    const l = s.listings?.find(x => x.listingId === s.primaryListingId) ?? {};
    bySymbol.set(l.providerSymbol ?? s.ticker, { securityId: s.securityId, isin: s.isin, mic: l.mic, name: s.name,
      identityStatus: s.identity?.status ?? null, acceptance: s.acceptance ?? null, lastDate: l.latest?.date ?? null });
  }
  const seriesCache = new Map();
  const closes = securityId => {
    if (!seriesCache.has(securityId)) {
      const p = join(root, 'discover/data/europe/series-long', securityId + '.json');
      seriesCache.set(securityId, existsSync(p) ? new Map(JSON.parse(readFileSync(p, 'utf8')).points) : new Map());
    }
    return seriesCache.get(securityId);
  };
  return { bySymbol, closes, catalogSha256: sha(readFileSync(join(root, 'discover/data/europe/catalog.json'))) };
}

function calendarState(mic, date) {
  try {
    const cal = require('../../core/europe-exchange-calendar.js');
    if (!cal.RULES?.[mic]) return 'MIC_OUTSIDE_RULE_CALENDAR';
    return cal.sessions(mic, date, date).some(s => s.date === date) ? 'RULE_SESSION' : 'RULE_CLOSED';
  } catch { return 'CALENDAR_UNAVAILABLE'; }
}

export async function runDiagnostics({ out, publicOut, apiKey = process.env.MARKETSTACK_API_KEY, fetchImpl = globalThis.fetch,
  root = ROOT, now = Date.now, sleep, minIntervalMs = 400 } = {}) {
  const privateDir = privateReplayRoot(out);
  check(!existsSync(privateDir), 'PRIVATE_OUTPUT_REENTRY_REFUSED');
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const planBytes = readFileSync(join(root, PLAN_PATH));
  check(sha(planBytes) === PLAN_SHA256, 'PROBE_PLAN_HASH_MISMATCH');
  const plan = JSON.parse(planBytes);
  const planned = [...plan.actionProbes.map(r => ({ ...r, group: 'ACTION' })),
    ...plan.clusterProbes.flatMap(c => c.requests.map(r => ({ ...r, group: c.mic + ':' + c.date })))];
  check(planned.length === 45 && planned.length <= LIMITS.ROUTES, 'PROBE_PLAN_SIZE_UNEXPECTED');
  const stored = loadStored(root);
  const journalPath = join(privateDir, 'journal.jsonl'), bodiesPath = join(privateDir, 'responses.jsonl');
  const publicLedger = [];
  const ledger = createLedger({ journal: entry => appendFileSync(journalPath, JSON.stringify({ phase: 'RESERVED', ...entry }) + '\n', { mode: 0o600 }) });
  let pendingHeaders = null, lastResponse = null;
  // Record every response header that may describe credits or rate limits.
  // The URL (which carries the key) is never stored.
  const wrappedFetch = async (url, init) => {
    pendingHeaders = null;
    const response = await fetchImpl(url, init);
    const h = {};
    if (response.headers && typeof response.headers.forEach === 'function') response.headers.forEach((v, k) => { if (HEADER_PATTERN.test(k)) h[k.toLowerCase()] = String(v); });
    pendingHeaders = h;
    return response;
  };
  if (!apiKey) throw new Error('MARKETSTACK_API_KEY_NOT_CONFIGURED');
  const client = createMarketstackClient({ apiKey, fetchImpl: wrappedFetch, now, sleep, maxRequests: LIMITS.total, maxCredits: 1000,
    maxRetries: 0, cacheTtlMs: 0, minIntervalMs, timeoutMs: 45000, sharedBudget: { reserve: () => ledger.reserve() },
    onResponse: r => { lastResponse = r; } });
  const redact = s => String(s).split(apiKey).join('[REDACTED]');

  async function call(section, endpoint, params = {}, purpose = '') {
    if (!ledger.gate(section)) return { sent: false, reason: 'SECTION_OR_TOTAL_LIMIT_REACHED', section, endpoint };
    lastResponse = null; pendingHeaders = null;
    const sentAt = new Date(now()).toISOString();
    let res;
    try { res = await client.request(endpoint, params, { cacheTtlMs: 0 }); } finally { ledger.close(); }
    const seq = ledger.used().total;
    const raw = lastResponse?.rawText ?? null;
    const body = lastResponse?.body ?? null;
    const status = lastResponse?.status ?? res.status ?? null;
    const rows = rowsOf(body);
    const headers = Object.fromEntries(Object.entries(pendingHeaders ?? {}).map(([k, v]) => [k, redact(v)]));
    const entry = { seq, section, purpose, endpoint, params: { ...params }, sentAt, receivedAt: lastResponse?.retrievedAt ?? null,
      httpStatus: status, ok: res.ok === true, failure: res.ok ? null : (res.providerErrorType ?? res.reason ?? null),
      providerErrorCode: body?.error?.code ?? null, rows: rows.length, bodySha256: raw === null ? null : sha(raw),
      bodyBytes: raw === null ? 0 : Buffer.byteLength(raw), rateAndCreditHeaders: headers, pagination: body?.pagination ?? null };
    publicLedger.push(entry);
    appendFileSync(bodiesPath, JSON.stringify({ ...entry, rawText: raw === null ? null : redact(raw) }) + '\n', { mode: 0o600 });
    return { sent: true, entry, rows, body, ok: res.ok === true, status };
  }

  try { return await evaluate(); } catch (error) {
    // Failed run: the request ledger (no bodies, no prices) still goes public.
    const partial = { schema: VERSION, failed: true, error: String(error?.message ?? error).slice(0, 300).split(apiKey).join('[REDACTED]'),
      providerRequests: ledger.used(), limits: LIMITS, requests: publicLedger };
    writeFileSync(join(privateDir, 'evaluation-private.json'), JSON.stringify(partial, null, 1) + '\n', { mode: 0o600 });
    if (publicOut) { mkdirSync(dirname(resolve(publicOut)), { recursive: true }); writeFileSync(resolve(publicOut), JSON.stringify(partial, null, 1) + '\n'); }
    throw error;
  }
  async function evaluate() {
  // ---------------- b) ROUTES: the committed plan, exactly once each ----------------
  const routeResults = [];
  for (const r of planned) routeResults.push({ planned: r, result: await call('ROUTES', r.endpoint, r.params, r.purpose) });
  const findRoute = (group, route, purpose) => routeResults.find(x => x.planned.group === group && x.planned.route === route && x.planned.purpose === purpose);
  const clusters = plan.clusterProbes.map(c => {
    const id = stored.bySymbol.get(c.symbol) ?? {};
    const closes = stored.closes(c.securityId);
    const storedDates = [...closes.keys()];
    const prev = storedDates.filter(d => d < c.date).at(-1), next = storedDates.find(d => d > c.date);
    const routes = ['EOD_DATE', 'EXCHANGE_EOD_DATE', 'TICKER_EOD_DATE'].map(route => {
      const t = findRoute(c.mic + ':' + c.date, route, 'GAP_ROUTE_TARGET'), k = findRoute(c.mic + ':' + c.date, route, 'GAP_ROUTE_POSITIVE_CONTROL');
      const scopeMic = route === 'EXCHANGE_EOD_DATE' ? c.mic : null;
      // Venue: the row's own MIC; only the exchange-scoped route may supply it from the request scope.
      const same = (res, date) => (res?.result?.rows ?? []).filter(r => (r.symbol ?? r.ticker ?? c.symbol) === c.symbol && day(r) === date);
      const pick = (res, date) => same(res, date).filter(r => (micOfRow(r) ?? scopeMic) === c.mic);
      const ctrlRows = pick(k, c.controlDate), tgtRows = pick(t, c.date);
      const venueUnverified = same(t, c.date).length > tgtRows.length || same(k, c.controlDate).length > ctrlRows.length;
      const controlState = !k?.result?.sent ? 'NOT_SENT' : !k.result.ok ? 'HTTP_' + k.result.status : ctrlRows.length !== 1 ? (ctrlRows.length ? 'AMBIGUOUS' : 'EMPTY')
        : compareClose(ctrlRows[0], closes.get(c.controlDate));
      const controlOk = controlState === 'CLOSE_EXACT' || controlState === 'CLOSE_AT_STORED_PRECISION';
      const tr = tgtRows[0];
      const targetState = !t?.result?.sent ? 'NOT_SENT' : !t.result.ok ? 'HTTP_' + t.result.status : tgtRows.length > 1 ? 'AMBIGUOUS' : tgtRows.length ? 'ROW_RETURNED' : 'EMPTY';
      const actions = tr ? actionFields(tr) : null;
      const neighbour = tr && prev && next ? { prevRatio: Number(tr.close) / closes.get(prev), nextRatio: closes.get(next) / Number(tr.close) } : null;
      const jump = neighbour ? Math.max(...[neighbour.prevRatio, neighbour.nextRatio].map(x => Math.abs(Math.log(x)))) : null;
      const verdict = targetState !== 'ROW_RETURNED' ? (targetState === 'EMPTY' ? 'STILL_MISSING' : targetState === 'HTTP_404' ? 'STILL_MISSING_HTTP_404' : 'NOT_DETERMINED_' + targetState)
        : !controlOk ? 'ROW_BUT_CONTROL_FAILED' : !ohlcPlausible(tr) ? 'ROW_BUT_OHLC_IMPLAUSIBLE' : actions.unresolved ? 'ROW_BUT_CORPORATE_ACTION_UNRESOLVED'
          : id.identityStatus !== 'VERIFIED' ? 'ROW_BUT_IDENTITY_UNVERIFIED' : 'RECOVERED_CANDIDATE';
      return { route, venueUnverifiedRows: venueUnverified, targetHttp: t?.result?.status ?? null, controlHttp: k?.result?.status ?? null, targetState, controlState, controlOk,
        ohlcPlausible: tr ? ohlcPlausible(tr) : null, actions, maxNeighbourLogJump: jump === null ? null : Math.round(jump * 10000) / 10000, verdict,
        targetBodySha256: t?.result?.entry?.bodySha256 ?? null, controlBodySha256: k?.result?.entry?.bodySha256 ?? null,
        _private: { target: tr ?? null, control: ctrlRows[0] ?? null, storedControlClose: closes.get(c.controlDate) ?? null } };
    });
    return { mic: c.mic, date: c.date, symbol: c.symbol, securityId: c.securityId, controlDate: c.controlDate, clusterSessions: c.clusterSessions,
      eligible: c.eligible, calendarRecheck: c.calendarRecheck, ruleCalendar: calendarState(c.mic, c.date), identityStatus: id.identityStatus ?? 'NOT_IN_CATALOG',
      targetAlreadyStored: closes.has(c.date), routes,
      recovered: routes.some(r => r.verdict === 'RECOVERED_CANDIDATE'),
      routesAgree: (() => { const v = routes.map(r => r._private.target).filter(Boolean).map(r => [r.open, r.high, r.low, r.close].join('|')); return v.length < 2 ? null : new Set(v).size === 1; })() };
  });
  const actionResults = routeResults.filter(x => x.planned.group === 'ACTION').map(({ planned: p, result: r }) => {
    const rows = r.rows ?? [];
    // Public: counts and whether the independently known event date was returned.
    const expected = EXPECTED_ACTIONS[p.endpoint];
    return { endpoint: p.endpoint, params: p.params, purpose: p.purpose, http: r.status ?? null, sent: r.sent, rows: rows.length,
      expectedEvent: expected ?? null, expectedEventReturned: expected ? rows.some(e => (day(e) ?? '').startsWith(expected.datePrefix)) : null,
      _private: rows };
  });

  // ---------------- a) PARIS: adaptive, hard-capped at 40 ----------------
  const paris = { repro: null, control: null, symbols: [] };
  const win = { date_from: PARIS_WINDOW.from, date_to: PARIS_WINDOW.to, limit: 100 };
  const overlap = (rows, symbol, securityId, mic) => {
    const closes = stored.closes(securityId);
    const own = rows.filter(r => (r.symbol ?? symbol) === symbol && (micOfRow(r) ?? mic) === mic);
    const inStored = own.filter(r => day(r) <= PARIS_WINDOW.storedTo && closes.has(day(r)));
    const states = inStored.map(r => compareClose(r, closes.get(day(r))));
    return { rows: own.length, overlapDays: inStored.length, identicalCloses: states.filter(s => s === 'CLOSE_EXACT' || s === 'CLOSE_AT_STORED_PRECISION').length,
      mismatches: states.filter(s => s === 'MISMATCH' || s === 'ADJ_CLOSE_AT_STORED_PRECISION_ONLY').length,
      afterStored: own.filter(r => day(r) > PARIS_WINDOW.storedTo).length, lastProviderDate: own.map(day).sort().at(-1) ?? null,
      allOverlapIdentical: inStored.length > 0 && states.every(s => s === 'CLOSE_EXACT' || s === 'CLOSE_AT_STORED_PRECISION'),
      storedOverlapDaysInWindow: [...closes.keys()].filter(d => d >= PARIS_WINDOW.from && d <= PARIS_WINDOW.storedTo).length };
  };
  const repro = await call('PARIS', '/eod', { symbols: 'AC.PA', exchange: 'XPAR', ...win }, 'PARIS_422_REPRODUCTION');
  paris.repro = { http: repro.status ?? null, failure: repro.entry?.failure ?? null, rows: repro.rows?.length ?? 0 };
  const ctl = await call('PARIS', '/eod', { symbols: PARIS_CONTROL_SYMBOLS.join(','), exchange: 'XPAR', ...win }, 'PARIS_POSITIVE_CONTROL_MULTI_SYMBOL');
  paris.control = { http: ctl.status ?? null, symbols: PARIS_CONTROL_SYMBOLS.map(s => { const id = stored.bySymbol.get(s); return { symbol: s, ...overlap(ctl.rows ?? [], s, id.securityId, 'XPAR') }; }) };
  // Stage B: current provider metadata for each old symbol.
  for (const p of PARIS) {
    const id = stored.bySymbol.get(p.symbol);
    const m = await call('PARIS', '/tickers/' + p.symbol, {}, 'PARIS_OLD_SYMBOL_METADATA');
    const row = (m.rows ?? [])[0] ?? null;
    const exchanges = row ? [row.stock_exchange?.mic, ...(row.stock_exchanges ?? []).map(e => e.mic ?? e.exchange_mic)].filter(Boolean) : [];
    paris.symbols.push({ symbol: p.symbol, securityId: id.securityId, storedIsin: id.isin, metadataHttp: m.status ?? null, metadataSent: m.sent,
      providerSymbol: row?.symbol ?? null, providerIsin: row?.isin ?? null, providerMics: [...new Set(exchanges)], hasEod: row?.has_eod ?? null,
      isinMatches: !!row && row.isin === id.isin, micMatches: exchanges.includes('XPAR'), previousNames: Array.isArray(row?.previous_names) ? row.previous_names.length : null,
      oldSymbolRoute: null, candidates: [], provenMapping: null, outcome: null });
  }
  // Stage C/D per symbol, in fixed order, until the section cap is reached.
  let directory = null;
  for (const s of paris.symbols) {
    if (s.isinMatches && s.micMatches) {
      const r = await call('PARIS', '/tickers/' + s.symbol + '/eod', win, 'PARIS_OLD_SYMBOL_TICKER_ROUTE_OVERLAP');
      if (!r.sent) { s.outcome = 'BUDGET_EXHAUSTED'; continue; }
      s.oldSymbolRoute = { http: r.status, ...overlap(r.rows, s.symbol, s.securityId, 'XPAR') };
      s.outcome = s.oldSymbolRoute.allOverlapIdentical ? (s.oldSymbolRoute.afterStored ? 'SAME_SYMBOL_SERVED_ON_TICKER_ROUTE_EOD_FILTER_REJECTS' : 'SAME_SYMBOL_OVERLAP_ONLY_NO_NEW_SESSIONS')
        : r.ok ? 'SAME_SYMBOL_TICKER_ROUTE_NOT_MATCHING_STORED' : 'SAME_SYMBOL_METADATA_ONLY_ROUTE_FAILED';
      continue;
    }
    // Symbol unknown or identity moved: one XPAR directory read (<= 2 pages) shared by all.
    if (directory === null) {
      directory = [];
      for (let offset = 0; offset < 2000; offset += 1000) {
        const d = await call('PARIS', '/exchanges/XPAR/tickers', { limit: 1000, offset }, 'PARIS_XPAR_DIRECTORY');
        if (!d.sent || !d.ok) break;
        directory.push(...d.rows);
        const pg = d.body?.pagination;
        if (!pg || Number(pg.offset) + Number(pg.count) >= Number(pg.total)) break;
      }
      paris.directoryRows = directory.length;
    }
    const term = PARIS.find(p => p.symbol === s.symbol).search.toUpperCase();
    const norm = x => String(x ?? '').normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, ' ').toUpperCase();
    const cands = directory.filter(r => (r.symbol ?? r.ticker) && (r.symbol ?? r.ticker) !== s.symbol && norm(r.name).split(/\s+/).join(' ').includes(term))
      .sort((a, b) => Number(b.has_eod === true) - Number(a.has_eod === true) || String(a.name).length - String(b.name).length || String(a.symbol ?? a.ticker).localeCompare(String(b.symbol ?? b.ticker)))
      .slice(0, 2);
    s.candidateCount = cands.length;
    for (const c of cands) {
      const sym = c.symbol ?? c.ticker;
      const m = await call('PARIS', '/tickers/' + sym, {}, 'PARIS_CANDIDATE_METADATA');
      if (!m.sent) { s.outcome = 'BUDGET_EXHAUSTED'; break; }
      const row = (m.rows ?? [])[0] ?? null;
      const mics = row ? [row.stock_exchange?.mic, ...(row.stock_exchanges ?? []).map(e => e.mic ?? e.exchange_mic)].filter(Boolean) : [];
      const cand = { symbol: sym, http: m.status, isinMatches: row?.isin === s.storedIsin, micMatches: mics.includes('XPAR'), overlap: null };
      s.candidates.push(cand);
      if (!(cand.isinMatches && cand.micMatches)) continue;
      const r = await call('PARIS', '/tickers/' + sym + '/eod', win, 'PARIS_CANDIDATE_OVERLAP');
      if (!r.sent) { s.outcome = 'BUDGET_EXHAUSTED'; break; }
      cand.overlap = { http: r.status, ...overlap(r.rows.map(x => ({ ...x, symbol: x.symbol ?? sym })), sym, s.securityId, 'XPAR') };
      if (cand.overlap.allOverlapIdentical && cand.overlap.overlapDays >= 3) {
        s.provenMapping = { from: s.symbol, to: sym, mic: 'XPAR', isin: s.storedIsin, evidence: 'AUTHENTICATED_METADATA_ISIN_AND_MIC_PLUS_IDENTICAL_OVERLAP_CLOSES',
          overlapDays: cand.overlap.overlapDays, metadataBodySha256: m.entry.bodySha256, overlapBodySha256: r.entry.bodySha256 };
        break;
      }
    }
    if (!s.outcome) s.outcome = s.provenMapping ? 'NEW_SYMBOL_PROVEN' : s.candidates.length ? 'CANDIDATES_NOT_PROVEN' : s.metadataHttp && s.metadataHttp >= 400 ? 'SYMBOL_UNKNOWN_NO_CANDIDATE' : 'IDENTITY_MISMATCH_NO_CANDIDATE';
  }

  // ---------------- outputs ----------------
  const used = ledger.used();
  check(used.total <= LIMITS.total && used.PARIS <= LIMITS.PARIS && used.ROUTES <= LIMITS.ROUTES && used.RESERVE === 0, 'HARD_LIMIT_BREACHED');
  const strip = x => JSON.parse(JSON.stringify(x, (k, v) => k === '_private' ? undefined : v));
  const headerNames = [...new Set(publicLedger.flatMap(e => Object.keys(e.rateAndCreditHeaders)))].sort();
  const verdicts = clusters.flatMap(c => c.routes.map(r => r.verdict));
  const count = (xs, f) => xs.filter(f).length;
  const summary = {
    schema: VERSION, providerRequests: used, limits: LIMITS, planSha256: PLAN_SHA256, catalogSha256: stored.catalogSha256,
    httpStatusCounts: publicLedger.reduce((a, e) => (a[e.httpStatus ?? 'NONE'] = (a[e.httpStatus ?? 'NONE'] || 0) + 1, a), {}),
    observedRateAndCreditHeaderNames: headerNames,
    usageEndpoint: 'NOT_IN_V2_OPENAPI_NOT_REQUESTED',
    routes: { clusters: strip(clusters), actions: strip(actionResults),
      totals: { recoveredCandidates: count(verdicts, v => v === 'RECOVERED_CANDIDATE'), stillMissing: count(verdicts, v => v.startsWith('STILL_MISSING')),
        controlOk: count(clusters.flatMap(c => c.routes), r => r.controlOk), clustersRecovered: count(clusters, c => c.recovered) } },
    paris: { ...paris, provenMappings: paris.symbols.filter(s => s.provenMapping).map(s => s.provenMapping),
      outcomes: paris.symbols.reduce((a, s) => (a[s.outcome] = (a[s.outcome] || 0) + 1, a), {}) },
    requests: publicLedger,
    productionDataChanged: false, pricesInterpolated: 0, historicalAnalysesReleased: false
  };
  writeFileSync(join(privateDir, 'evaluation-private.json'), JSON.stringify({ summary, clustersPrivate: clusters, actionsPrivate: actionResults }, null, 1) + '\n', { mode: 0o600 });
  if (publicOut) { mkdirSync(dirname(resolve(publicOut)), { recursive: true }); writeFileSync(resolve(publicOut), JSON.stringify(summary, null, 1) + '\n'); }
  return summary;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
  check(args.out && args.publicOut, 'USAGE: --out=<absolute private dir outside repo> --publicOut=<file>');
  const s = await runDiagnostics({ out: args.out, publicOut: args.publicOut });
  console.log(JSON.stringify({ providerRequests: s.providerRequests, httpStatusCounts: s.httpStatusCounts, headers: s.observedRateAndCreditHeaderNames,
    routes: s.routes.totals, paris: s.paris.outcomes, provenMappings: s.paris.provenMappings.length }, null, 1));
}
