import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiagnostics, createLedger, compareClose, ohlcPlausible, actionFields, LIMITS, PARIS, loadStored } from '../europe-marketstack-diagnostics-once.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const KEY = 'TEST-KEY-must-never-appear';
const stored = loadStored(ROOT);
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '99', 'x-secret-other': 'x', ...headers } });
const bar = (symbol, mic, date, close) => ({ symbol, exchange: mic, date: date + 'T00:00:00+0000', open: close, high: close * 1.01, low: close * 0.99, close, volume: 1, split_factor: 1, dividend: 0 });
const micOf = symbol => stored.bySymbol.get(symbol)?.mic;
const storedBars = (symbol, from, to) => { const id = stored.bySymbol.get(symbol); return [...stored.closes(id.securityId)].filter(([d]) => d >= from && d <= to).map(([d, c]) => bar(symbol, id.mic, d, c)); };

/** Fake v2 provider. The 13 Paris symbols are unknown; their successor is
 * "<root>.XP" (same ISIN, XPAR) with identical closes, except AC.PA. */
function provider({ fail500 = false } = {}) {
  const calls = [];
  const fetchImpl = async url => {
    const u = new URL(url); calls.push(u.pathname + u.search.replace(/access_key=[^&]*/, ''));
    assert.equal(u.searchParams.get('access_key'), KEY);
    const path = u.pathname.replace(/^\/v2/, ''), q = Object.fromEntries(u.searchParams);
    if (fail500 && calls.length === 1) return json(500, { error: { code: 'internal_error' } });
    let m;
    if (path === '/eod') {
      const syms = q.symbols.split(',');
      if (syms.some(s => PARIS.some(p => p.symbol === s))) return json(422, { error: { code: 'no_valid_symbols_provided', message: 'x' } });
      return json(200, { pagination: { offset: 0, count: 1, total: 1, limit: 100 }, data: syms.flatMap(s => storedBars(s, q.date_from, q.date_to)) });
    }
    if ((m = path.match(/^\/eod\/(\d{4}-\d{2}-\d{2})$/)) || (m = path.match(/^\/exchanges\/[A-Z]{4}\/eod\/(\d{4}-\d{2}-\d{2})$/))) {
      const rows = storedBars(q.symbols, m[1], m[1]);
      const recovered = rows.length ? rows : q.symbols === '1U1.DE' ? [bar('1U1.DE', 'XETR', m[1], 20)] : [];
      return json(200, path.startsWith('/exchanges') ? { data: { mic: 'XETR', eod: recovered } } : { pagination: { offset: 0, count: recovered.length, total: recovered.length }, data: recovered });
    }
    if ((m = path.match(/^\/tickers\/([A-Z0-9.]+)\/eod\/(\d{4}-\d{2}-\d{2})$/))) { const r = storedBars(m[1], m[2], m[2]); return r.length ? json(200, r[0]) : json(404, { error: { code: 'not_found_error' } }); }
    if (path.endsWith('/splits')) return json(200, { pagination: { offset: 0, count: 0, total: 0 }, data: path === '/splits' ? [{ symbol: 'AAPL', date: '2020-08-31', split_factor: 4 }] : [] });
    if (path === '/exchanges/XPAR/tickers') return json(200, { pagination: { offset: 0, count: 13, total: 13, limit: 1000 }, data: { mic: 'XPAR', tickers: PARIS.map(p => ({ symbol: p.symbol.replace('.PA', '.XP'), name: p.search + ' SA', has_eod: true })) } });
    if ((m = path.match(/^\/tickers\/([A-Z0-9.]+)\/eod$/))) {
      const old = m[1].replace('.XP', '.PA'); if (old === 'AC.PA') return json(200, { data: { symbol: m[1], eod: [bar(m[1], 'XPAR', '2026-10-09', 1)] } });
      return json(200, { pagination: { offset: 0, count: 1, total: 1 }, data: { symbol: m[1], eod: storedBars(old, q.date_from, q.date_to).map(b => ({ ...b, symbol: m[1] })) } });
    }
    if ((m = path.match(/^\/tickers\/([A-Z0-9.]+)$/))) {
      if (m[1].endsWith('.PA')) return json(404, { error: { code: 'not_found_error' } });
      const old = m[1].replace('.XP', '.PA');
      return json(200, { data: { symbol: m[1], isin: stored.bySymbol.get(old).isin, has_eod: true, stock_exchange: { mic: 'XPAR' } } });
    }
    return json(404, { error: { code: 'not_found_error' } });
  };
  return { fetchImpl, calls };
}

function dirs() { const root = mkdtempSync(join(tmpdir(), 'ms-diag-')); return { root, out: join(root, 'private'), publicOut: join(root, 'public', 'summary.json') }; }

test('ledger refuses ungated, reserve and over-cap requests', async () => {
  const l = createLedger({ limits: { total: 3, PARIS: 2, ROUTES: 2, RESERVE: 5 } });
  await assert.rejects(l.reserve(), /UNGATED/);
  assert.throws(() => l.gate('RESERVE'), /RESERVE_REQUIRES/);
  for (let i = 0; i < 2; i++) { assert.equal(l.gate('PARIS'), true); await l.reserve(); }
  assert.equal(l.gate('PARIS'), false);
  assert.equal(l.gate('ROUTES'), true); await l.reserve();
  assert.equal(l.gate('ROUTES'), false, 'total cap');
  assert.deepEqual(l.used(), { PARIS: 2, ROUTES: 1, RESERVE: 0, total: 3 });
});

test('close, OHLC and action classification', () => {
  assert.equal(compareClose({ close: 44.79 }, 44.79), 'CLOSE_EXACT');
  assert.equal(compareClose({ close: 27.40681 }, 27.4068), 'CLOSE_AT_STORED_PRECISION');
  assert.equal(compareClose({ close: 30, adj_close: 27.4068 }, 27.4068), 'ADJ_CLOSE_AT_STORED_PRECISION_ONLY');
  assert.equal(compareClose({ close: 1 }, 2), 'MISMATCH');
  assert.equal(ohlcPlausible({ open: 2, high: 3, low: 1, close: 2.5 }), true);
  assert.equal(ohlcPlausible({ open: 2, high: 1, low: 1, close: 2.5 }), false);
  assert.equal(actionFields({ split_factor: 3, dividend: 0 }).unresolved, true);
});

test('one run: hard caps, one fetch per gated request, private/public separation, proven mapping', async () => {
  const d = dirs(), p = provider();
  try {
    const s = await runDiagnostics({ out: d.out, publicOut: d.publicOut, apiKey: KEY, fetchImpl: p.fetchImpl, root: ROOT, sleep: async () => {}, minIntervalMs: 0 });
    assert.equal(s.providerRequests.ROUTES, 45);
    assert.ok(s.providerRequests.PARIS <= LIMITS.PARIS);
    assert.equal(s.providerRequests.RESERVE, 0);
    assert.equal(s.providerRequests.total, p.calls.length, 'every fetch was gated and counted once');
    assert.ok(p.calls.length <= 90);
    assert.equal(s.paris.repro.http, 422);
    assert.ok(s.paris.control.symbols.every(x => x.allOverlapIdentical));
    assert.equal(s.paris.symbols.find(x => x.symbol === 'AC.PA').outcome !== 'NEW_SYMBOL_PROVEN', true, 'mismatching closes never prove a mapping');
    assert.ok(s.paris.provenMappings.length >= 1);
    for (const m of s.paris.provenMappings) assert.equal(m.evidence, 'AUTHENTICATED_METADATA_ISIN_AND_MIC_PLUS_IDENTICAL_OVERLAP_CLOSES');
    const xetr = s.routes.clusters.find(c => c.mic === 'XETR');
    assert.ok(xetr.routes.some(r => r.verdict === 'RECOVERED_CANDIDATE'));
    assert.equal(s.routes.actions[0].expectedEventReturned, true);
    const pub = readFileSync(d.publicOut, 'utf8');
    assert.equal(pub.includes(KEY), false);
    assert.equal(/"(open|high|low|close|adj_close|rawText|_private)"/.test(pub), false, 'no prices or raw bodies in public output');
    assert.equal(pub.includes('x-secret-other'), false, 'only rate/credit headers are kept');
    assert.ok(pub.includes('x-ratelimit-remaining'));
    const priv = readFileSync(join(d.out, 'responses.jsonl'), 'utf8');
    assert.equal(priv.includes(KEY), false);
    assert.equal(priv.split('\n').filter(Boolean).length, p.calls.length);
    assert.equal(readFileSync(join(d.out, 'journal.jsonl'), 'utf8').split('\n').filter(Boolean).length, p.calls.length);
    await assert.rejects(runDiagnostics({ out: d.out, publicOut: d.publicOut, apiKey: KEY, fetchImpl: p.fetchImpl, root: ROOT }), /REENTRY/);
  } finally { rmSync(d.root, { recursive: true, force: true }); }
});

test('a failed request counts and is never repeated', async () => {
  const d = dirs(), p = provider({ fail500: true });
  try {
    const s = await runDiagnostics({ out: d.out, publicOut: d.publicOut, apiKey: KEY, fetchImpl: p.fetchImpl, root: ROOT, sleep: async () => {}, minIntervalMs: 0 });
    assert.equal(s.requests[0].httpStatus, 500);
    assert.equal(new Set(p.calls).size === p.calls.length || p.calls.filter(c => c === p.calls[0]).length === 1, true);
    assert.equal(s.providerRequests.total, p.calls.length);
  } finally { rmSync(d.root, { recursive: true, force: true }); }
});

test('private output inside the repository is refused before any request', async () => {
  const p = provider();
  await assert.rejects(runDiagnostics({ out: join(ROOT, 'tmp-private'), apiKey: KEY, fetchImpl: p.fetchImpl, root: ROOT }), /OUTSIDE_REPOSITORY/);
  assert.equal(p.calls.length, 0);
  assert.equal(existsSync(join(ROOT, 'tmp-private')), false);
});
