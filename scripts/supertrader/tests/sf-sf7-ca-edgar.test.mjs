// Supertrader 7.0 – gezielte EDGAR-Pruefung von V4-D1 (E7-1, Regelsatz 1.4.0): integrity/ca-edgar.mjs,
// research/sf7-edgar-client.mjs, research/run-sf7-ca-edgar.mjs. Nur synthetische Texte, nie echte Einreichungen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from '../validation/lib.mjs';
import { datasetFromPit } from '../source-faithful/runner/snapshot-input.mjs';
import { flagDiscontinuities } from '../source-faithful/integrity/discontinuity.mjs';
import { CLASSES, classifyFlag, filingEvidence, rulesetSha256 as rulesetSha256V130 } from '../source-faithful/integrity/ca-resolution.mjs';
import { ratioMentions, documentText, parseNumber, extractStatements, documentFactor, selectDocuments, classifyWithDocument, groundTruthLabel, documentPath, rulesetSha256, baseRulesetUnchanged, RULESET, EDGAR_BUDGET, DOC_TOLERANCES, CA_EDGAR_VERSION } from '../source-faithful/integrity/ca-edgar.mjs';
import { createEdgarClient, emptyCache } from '../source-faithful/research/sf7-edgar-client.mjs';
import * as V140 from '../source-faithful/integrity/ca-edgar-1.4.0.mjs';
import { sentenceBounds } from '../source-faithful/integrity/ca-edgar.mjs';
import { edgarRefine, EXPECTED_SCOPE_SESSIONS, MANIFEST_SHA256_V130, EXTRACTORS } from '../source-faithful/research/run-sf7-ca-edgar.mjs';
import { caResolutionPart } from '../source-faithful/research/run-sf7-ca-resolution.mjs';
import { integrityPart, INTEGRITY_KEYS } from '../source-faithful/research/run-sf6-integrity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..', '..');
const day = (k) => new Date(Date.UTC(2016, 0, 4) + k * 864e5).toISOString().slice(0, 10);
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const spoken = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTH[m - 1]} ${d}, ${y}`; };
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
function series(len, seed, events = [], c0 = 20) {
  const r = rng(seed); let c = c0; const raw = [];
  for (let k = 0; k < len; k++) { const o = c * (1 + 0.01 * (r() - 0.5)); c = o * (1 + 0.0008 + 0.02 * (r() - 0.5)); raw.push({ date: day(k), open: o, high: Math.max(o, c) * (1 + 0.01 * r()), low: Math.min(o, c) * (1 - 0.01 * r()), close: c, volume: Math.round(1e6 * (0.7 + 0.6 * r())), adjClose: null, dividend: 0, splitFactor: 1 }); }
  for (const e of events) for (let k = e.at; k < len; k++) { for (const f of ['open', 'high', 'low', 'close']) raw[k][f] *= e.price; raw[k].volume = Math.round(raw[k].volume * (e.volume ?? 1)); }
  return raw;
}
const seg = (id, raw) => ({ id, raw, endCause: 'ACTIVE', delisted: false, survivor: true, cls: 'EQUITY_COMMON' });
const dsOf = (segs, cal = segs[0].raw) => { const spyAdj = L.adjustSeries(cal); let v = 1; const spyTR = spyAdj.date.map((d, i) => { if (i > 0) v *= 1 + spyAdj.tr[i]; return { date: d, value: v }; }); return datasetFromPit({ segs, calendar: cal.map((b) => b.date), spyAdj, spyTR }); };
const secOf = (raw) => dsOf([seg('X', raw)]).securities[0];
const dei = (pairs) => pairs.map(([k, v]) => [day(k), v, day(k + 20), 'dei']);
const SEC = (pairs, cik = '0000000001', how = 'KNOWN') => ({ cik, how, taxonomy: 'us-gaap', shares: dei(pairs) });
const INDEX = (rows) => ({ form: ['10-Q', ...rows.map((r) => r[0]), '10-K'], filingDate: [day(0), ...rows.map((r) => day(r[1])), day(650)], items: ['', ...rows.map((r) => r[2] ?? ''), ''], accessionNumber: ['0000000000-16-000001', ...rows.map((r, k) => r[3] ?? `0000000000-17-${String(k + 10).padStart(6, '0')}`), '0000000000-18-000099'], primaryDocument: ['q.htm', ...rows.map((_, k) => `d${k}.htm`), 'k.htm'] });
const doc = (form, k, html, acc = `acc-${form}-${k}`) => ({ accessionNumber: acc, form, filingDate: day(k), extraction: extractStatements(html) });
// 1.4.1 (R1): ratio and effective date in ONE sentence; the filing date of the certificate is not the effective date
const SPLIT_8K = (n, k, word = `1-for-${n}`) => `<html><body><p>Item 5.03 Amendments to Articles of Incorporation.</p><p>On ${spoken(day(k - 2))}, the Company filed a Certificate of Amendment to effect a ${word} reverse stock split of its common stock, which became effective at the market open on ${spoken(day(k))}.</p></body></html>`;

// ---------------------------------------------------------------------------------------------------- parser

test('SF7-EDGAR-PARSER: Verhaeltnisse aus Ziffern, Zahlwoertern, Doppelpunkt und "jede ... in eine"', () => {
  const one = (s) => { const m = ratioMentions(documentText(s)).filter((x) => x.splitContext); assert.equal(m.length, 1, s); return m[0]; };
  assert.equal(one('the company effected a 1-for-15 reverse stock split').priceFactor, 15);
  assert.equal(one('a one-for-twenty-five reverse split of the common stock').priceFactor, 25);
  assert.equal(one('a 1:50 reverse split effective at 12:01 a.m. eastern time').priceFactor, 50, 'die Uhrzeit ist kein Verhaeltnis');
  assert.equal(one('a 50:1 reverse split').priceFactor, 50, 'Richtung aus "reverse"');
  assert.equal(one('every ten (10) shares of common stock issued and outstanding were automatically combined into one (1) share of common stock (reverse split)').priceFactor, 10);
  assert.equal(one('a one (1)-for-twenty (20) reverse stock split').priceFactor, 20);
  assert.equal(one('a two-for-one forward stock split').priceFactor, 0.5);
  assert.equal(one('a 3-for-2 stock split').priceFactor, 2 / 3);
  assert.equal(one('each share of common stock was split into two shares (stock split)').priceFactor, 0.5);
  assert.equal(one('a one hundred and fifty-for-one forward split').priceFactor, 1 / 150);
  assert.equal(one('a 1&#8209;for&#8209;20 reverse stock split').priceFactor, 20, 'HTML-Entitaet und geschuetzter Bindestrich');
  for (const [w, n] of [['twenty-five', 25], ['one hundred fifty', 150], ['one hundred and fifty', 150], ['two thousand', 2000], ['1,000', 1000], ['ten', 10]]) assert.equal(parseNumber(w), n, w);
  for (const w of ['five and one', 'ten five', 'twenty thirty', 'and']) assert.equal(parseNumber(w), null, w);
  assert.equal(ratioMentions(documentText('we sold 1-for-15 units for cash')).filter((x) => x.splitContext).length, 0, 'ohne Split-Schluesselwort kein Beleg');
});

test('SF7-EDGAR-RANGE: eine genehmigte Spanne traegt keinen Faktor; nur Spanne -> UNRESOLVED', () => {
  for (const s of ['to approve a reverse stock split at a ratio between 1-for-5 and 1-for-30', 'a reverse split at a ratio ranging from one-for-five to one-for-thirty', 'a reverse stock split of not less than 1-for-5 and not more than 1-for-30', 'a reverse split at a ratio of up to 1-for-30']) {
    const st = extractStatements(s).statements;
    assert.ok(st.length >= 1 && st.every((x) => x.range), s);
  }
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]);
  const proxy = doc('DEF 14A', 370, `<p>Proposal 2: approve a reverse stock split at a ratio between 1-for-5 and 1-for-30, effective on ${spoken(day(400))}, as determined by the board.</p>`);
  const df = documentFactor({ docs: [proxy], raw, i: 400 });
  assert.equal(df.ok, false); assert.equal(df.reason, 'DOCUMENT_RANGE_ONLY'); assert.equal(groundTruthLabel(df), 'AMBIGUOUS');
  // a fixed ratio approved by proxy, without a post-event document, never confirms
  const fixed = doc('DEF 14C', 370, `<p>The reverse stock split at a ratio of 1-for-10 will become effective on ${spoken(day(400))}.</p>`);
  assert.equal(documentFactor({ docs: [fixed], raw, i: 400 }).reason, 'DOCUMENT_PROXY_ONLY');
});

test('SF7-EDGAR-CONFLICT: zwei verschiedene Verhaeltnisse im Fenster, Fusion, Faktor ausserhalb des Rasters -> UNRESOLVED', () => {
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]);
  const a = doc('8-K', 401, SPLIT_8K(10, 400)), b = doc('10-Q', 440, '<p>All share amounts were retroactively adjusted for the 1-for-12 reverse stock split.</p>');
  const df = documentFactor({ docs: [a, b], raw, i: 400 });
  assert.equal(df.reason, 'DOCUMENT_CONFLICTING_RATIOS'); assert.equal(groundTruthLabel(df), 'AMBIGUOUS');
  // a historical split dated more than 135 days away does not conflict; the same ratio again does not either
  const hist = doc('10-Q', 440, `<p>On ${spoken(day(100))} we effected a 1-for-12 reverse stock split. All share amounts reflect the 1-for-10 reverse stock split.</p>`);
  assert.equal(documentFactor({ docs: [a, hist], raw, i: 400 }).ok, true);
  const merger = doc('8-K', 401, `<p>In connection with the merger, the Company effected a 1-for-10 reverse stock split, effective ${spoken(day(400))}.</p>`);
  assert.equal(documentFactor({ docs: [merger], raw, i: 400 }).reason, 'DOCUMENT_MERGER_CONTEXT');
  const offGrid = doc('8-K', 401, `<p>A 5-for-4 stock split became effective on ${spoken(day(400))}.</p>`);
  assert.equal(documentFactor({ docs: [offGrid], raw, i: 400 }).reason, 'DOCUMENT_RATIO_NOT_ON_GRID');
  assert.equal(documentFactor({ docs: [a, offGrid], raw, i: 400 }).reason, 'DOCUMENT_CONFLICTING_RATIOS', '5-for-4 neben 1-for-10 ist ein zweites Verhaeltnis');
  assert.equal(documentFactor({ docs: [], raw, i: 400 }).reason, 'NO_SPLIT_DOCUMENT_FOUND');
  assert.equal(documentFactor({ docs: [doc('8-K', 401, '<p>The board discussed a possible reverse split.</p>')], raw, i: 400 }).reason, 'DOCUMENT_NO_RATIO');
});

test('SF7-EDGAR-DATE-WINDOW: Wirksamkeitsdatum innerhalb +-2 Sitzungen, Einreichung im Fenster [d-90, d+100]', () => {
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]);
  for (const k of [398, 399, 400, 401, 402]) assert.equal(documentFactor({ docs: [doc('8-K', 403, SPLIT_8K(10, k))], raw, i: 400 }).ok, true, `${k}`);
  for (const k of [397, 403]) assert.equal(documentFactor({ docs: [doc('8-K', 405, SPLIT_8K(10, k))], raw, i: 400 }).reason, 'DOCUMENT_EFFECTIVE_DATE_OUTSIDE_WINDOW', `${k}`);
  assert.equal(documentFactor({ docs: [doc('8-K', 501, SPLIT_8K(10, 400))], raw, i: 400 }).reason, 'NO_SPLIT_DOCUMENT_FOUND', 'Einreichung nach d+100 zaehlt nicht');
  assert.equal(documentFactor({ docs: [doc('8-K', 309, SPLIT_8K(10, 400))], raw, i: 400 }).reason, 'NO_SPLIT_DOCUMENT_FOUND', 'Einreichung vor d-90 zaehlt nicht');
  assert.equal(documentFactor({ docs: [doc('8-K', 401, '<p>The Company effected a 1-for-10 reverse stock split.</p>')], raw, i: 400 }).reason, 'DOCUMENT_NO_EFFECTIVE_DATE');
  // document selection: only pre-registered forms in the window, 8-K 5.03 first
  const ix = INDEX([['8-K', 401, '5.03,9.01'], ['4', 401], ['10-Q', 440], ['DEF 14A', 370], ['8-K', 402, '2.02'], ['10-Q', 300], ['424B4', 410]]);
  const sel = selectDocuments(ix, day(400));
  assert.deepEqual(sel.map((x) => x.form), ['8-K', '10-Q', '424B4', 'DEF 14A']);
  assert.ok(Object.isFrozen(DOC_TOLERANCES)); assert.equal(DOC_TOLERANCES.effectiveSessions, 2); assert.deepEqual([...DOC_TOLERANCES.filingWindowDays], [-90, 100]);
});

// ---------------------------------------------------------------------------------------------------- classification

const r13Of = (raw, i, sec, filings) => { const s = secOf(raw); return { r: classifyFlag({ raw, bars: s.bars, i, sec, otherFlagDates: flagDiscontinuities(s.bars, 3).map((j) => s.bars[j].date), filings }), bars: s.bars }; };
const CLEAN_IX = INDEX([['8-K', 401, '5.03,9.01']]);
const classify = (raw, sec, docs, { index = CLEAN_IX, i = 400 } = {}) => {
  const { r, bars } = r13Of(raw, i, sec, filingEvidence(index, day(i)));
  return { r13: r, r14: classifyWithDocument({ r13: r, raw, bars, i, sec, otherFlagDates: flagDiscontinuities(bars, 3).map((j) => bars[j].date), filings: filingEvidence(index, day(i)), index, df: documentFactor({ docs, raw, i }) }) };
};

test('SF7-EDGAR-CLASSIFY: Dokumentfaktor bestaetigt nur mit Eroeffnung, Volumen und (wo nutzbar) Aktienzahl auf demselben Rasterwert', () => {
  const raw = series(700, 3, [{ at: 400, price: 10, volume: 0.1 }]);
  // path A: 1.3.0 passed every share test, only the factor-bearing source was missing
  const a = classify(raw, SEC([[330, 50e6], [460, 5e6]]), [doc('8-K', 401, SPLIT_8K(10, 400))]);
  assert.equal(a.r13.reason, 'NO_FACTOR_BEARING_SOURCE'); assert.equal(documentPath(a.r13), 'A');
  assert.equal(a.r14.cls, CLASSES.SPLIT, a.r14.reason); assert.equal(a.r14.splitFactor, 0.1); assert.equal(a.r14.label, '1:10'); assert.equal(a.r14.evidence.secondSource, 'FILING_DOCUMENT');
  // path B: no usable share bracket
  const b = classify(raw, SEC([[330, 50e6]]), [doc('8-K', 401, SPLIT_8K(10, 400, 'one-for-ten'))]);
  assert.equal(b.r13.reason, 'SEC_SHARES_NOT_BRACKETING'); assert.equal(b.r14.cls, CLASSES.SPLIT, b.r14.reason);
  // the document states a neighbour factor: the open selects 10, not 9 / 11
  for (const n of [9, 11]) assert.equal(classify(raw, SEC([[330, 50e6]]), [doc('8-K', 401, SPLIT_8K(n, 400))]).r14.reason, 'OPEN_SELECTS_OTHER_FACTOR', `${n}`);
  // shares usable and selecting 10, document 12 -> price off / disagreement; never confirmed
  assert.notEqual(classify(raw, SEC([[330, 50e6], [460, 5e6]]), [doc('8-K', 401, SPLIT_8K(12, 400))]).r14.cls, CLASSES.SPLIT);
  // name-matched CIK, merger form in the window, 8-K item 2.01
  assert.equal(classify(raw, SEC([[330, 50e6]], '0000000001', 'NAME_MATCH'), [doc('8-K', 401, SPLIT_8K(10, 400))]).r14.reason, 'SPLIT_REQUIRES_KNOWN_CIK');
  assert.equal(classify(raw, SEC([[330, 50e6]]), [doc('8-K', 401, SPLIT_8K(10, 400))], { index: INDEX([['8-K', 401, '5.03'], ['SC TO-I', 430]]) }).r14.reason, 'MERGER_OR_EXCHANGE_OFFER_IN_DOCUMENT_WINDOW');
  assert.equal(classify(raw, SEC([[330, 50e6]]), [doc('8-K', 401, SPLIT_8K(10, 400))], { index: INDEX([['8-K', 401, '5.03,2.01']]) }).r14.reason, 'MERGER_OR_DISPOSITION_FILING_NEAR_SPLIT');
  // volume did not fall: not a consolidation
  const vol = series(700, 10, [{ at: 400, price: 10, volume: 1 }]);
  assert.equal(classify(vol, SEC([[330, 50e6]]), [doc('8-K', 401, SPLIT_8K(10, 400))]).r14.reason, 'VOLUME_INCONSISTENT_WITH_FACTOR');
  // a contradicting 1.3.0 reason is never overridden by a document
  const c = classify(raw, SEC([[330, 50e6], [460, 18e6]]), [doc('8-K', 401, SPLIT_8K(10, 400))]);
  assert.ok(['SHARE_RATIO_NO_MATCH', 'PRICE_RATIO_OFF_FACTOR'].includes(c.r13.reason), c.r13.reason); assert.equal(documentPath(c.r13), null); assert.equal(c.r14, c.r13);
  // forward split stated by a 10-Q
  const fwd = series(700, 11, [{ at: 400, price: 0.5, volume: 2 }]);
  const f = classify(fwd, SEC([[330, 10e6]]), [doc('10-Q', 440, `<p>On ${spoken(day(400))} a two-for-one forward stock split became effective.</p>`)]);
  assert.equal(f.r14.cls, CLASSES.SPLIT, f.r14.reason); assert.equal(f.r14.label, '2:1'); assert.equal(f.r14.splitFactor, 2);
});

test('SF7-EDGAR-GENUINE: echte Bewegung behaelt die 1.3.0-Regeln; ein Dokument kann sie nur zuruecknehmen', () => {
  const raw = series(700, 5, [{ at: 400, price: 0.15, volume: 1.2 }]), sec = SEC([[330, 20e6], [460, 20.6e6]]);
  const ix = { form: ['10-Q', '8-K', '10-K', '10-Q'], filingDate: [day(0), day(395), day(500), day(600)], items: ['', '2.02,9.01', '', ''], accessionNumber: ['a', 'b', 'c', 'd'], primaryDocument: ['a', 'b', 'c', 'd'] };
  const { r, bars } = r13Of(raw, 400, sec, filingEvidence(ix, day(400)));
  assert.equal(r.cls, CLASSES.GENUINE);
  const base = { r13: r, raw, bars, i: 400, sec, filings: filingEvidence(ix, day(400)), index: ix };
  assert.equal(classifyWithDocument({ ...base, df: documentFactor({ docs: [], raw, i: 400 }) }), r, 'keine schwaechere und keine neue Bestaetigung');
  assert.equal(classifyWithDocument({ ...base, df: documentFactor({ docs: [doc('8-K', 401, SPLIT_8K(7, 400))], raw, i: 400 }) }).reason, 'DOCUMENT_CONTRADICTS_GENUINE');
});

// ---------------------------------------------------------------------------------------------------- client, budget

function fakeSec({ docs = {}, subs = {}, fail = new Set() } = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push(url); assert.ok(opts.headers['User-Agent']); assert.ok(opts.signal instanceof AbortSignal);
    if (fail.has(url)) return { ok: false, status: 404 };
    const m = url.match(/submissions\/CIK(\d{10})\.json$/);
    if (m) return { ok: true, json: async () => ({ filings: { recent: subs[m[1]] ?? INDEX([]), files: [] } }) };
    const d = Object.entries(docs).find(([k]) => url.endsWith(k));
    return d ? { ok: true, text: async () => d[1] } : { ok: false, status: 404 };
  };
  return { impl, calls };
}

test('SF7-EDGAR-BUDGET: hartes Gesamtbudget (fail closed), hoechstens 2 Anfragen je Sekunde, Zeitlimit 30 s, Cache zuerst', async () => {
  assert.equal(EDGAR_BUDGET.totalRequests, 600); assert.equal(EDGAR_BUDGET.docRequestsPerSession, 6); assert.equal(EDGAR_BUDGET.minIntervalMs, 500); assert.equal(EDGAR_BUDGET.timeoutMs, 30000);
  let t = 0; const sleeps = [];
  const { impl, calls } = fakeSec();
  const client = createEdgarClient({ userAgent: 'test', fetchImpl: impl, budget: { ...EDGAR_BUDGET, totalRequests: 3 }, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
  for (const cik of ['1', '2', '3', '4', '5']) await client.submissions13(cik);
  assert.equal(calls.length, 3, 'nie mehr Anfragen als das Budget');
  const s = client.stats();
  assert.equal(s.requests, 3); assert.equal(s.refusedOverBudget, 2); assert.equal(client.exhausted(), true);
  const st = client.starts(); for (let k = 1; k < st.length; k++) assert.ok(st[k] - st[k - 1] >= 500, 'Abstand >= 500 ms');
  assert.equal(await client.submissions13('1') !== null, true, 'Cache-Treffer braucht keine Anfrage'); assert.equal(calls.length, 3);
  // timeout ends a hung request as a failure, never a wait
  const hang = (url, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(opts.signal.reason)));
  const keep = setInterval(() => {}, 5);
  try { const c2 = createEdgarClient({ userAgent: 'x', fetchImpl: hang, budget: { ...EDGAR_BUDGET, timeoutMs: 20 } }); assert.equal(await c2.submissions13('9'), null); assert.equal(c2.stats().failed, 1); } finally { clearInterval(keep); }
  // the cache holds extracted statements only, never text
  const marker = 'UNIQUE-SYNTHETIC-PASSAGE-7731';
  const f2 = fakeSec({ docs: { 'd0.htm': `<p>${marker}: the Company effected a 1-for-10 reverse stock split effective ${spoken(day(400))}.</p>` } });
  const c3 = createEdgarClient({ userAgent: 'x', fetchImpl: f2.impl, sleep: async () => {} });
  const x = await c3.document('0000000001', { accessionNumber: '0000000001-17-000010', form: '8-K', filingDate: day(401), primaryDocument: 'd0.htm' });
  assert.equal(x.extraction.statements[0].label, '1:10');
  assert.doesNotMatch(JSON.stringify(c3.exportCache()), new RegExp(marker, 'i'));
  assert.equal((await c3.document('0000000001', { accessionNumber: '0000000001-17-000010', form: '8-K', filingDate: day(401), primaryDocument: 'd0.htm' })).cached, true);
  assert.equal(f2.calls.length, 1);
  // older index pages only when the recent page does not reach back to the window, only overlapping pages; a page that
  // cannot be read leaves the window uncovered (fail closed)
  const recentOnly = { form: ['8-K'], filingDate: ['2019-06-01'], items: ['5.03'], accessionNumber: ['r1'], primaryDocument: ['r.htm'] };
  const pages = { 'p1.json': { form: ['10-Q', '8-K'], filingDate: ['2016-10-01', '2017-02-08'], items: ['', '5.03'], accessionNumber: ['o1', 'o2'], primaryDocument: ['a', 'b'] } };
  const mk = (failPage) => { const seen = []; return { seen, impl: async (url) => { seen.push(url); if (url.endsWith('CIK0000000007.json')) return { ok: true, json: async () => ({ filings: { recent: recentOnly, files: [{ name: 'p1.json', filingFrom: '2016-01-01', filingTo: '2017-12-31' }, { name: 'p0.json', filingFrom: '2010-01-01', filingTo: '2015-12-31' }] } }) }; if (url.endsWith('p1.json') && !failPage) return { ok: true, json: async () => pages['p1.json'] }; return { ok: false, status: 500 }; } }; };
  const okPages = mk(false), c5 = createEdgarClient({ userAgent: 'x', fetchImpl: okPages.impl, sleep: async () => {} });
  const ixOk = await c5.indexCovering('7', '2016-11-10', '2017-05-18');
  assert.equal(ixOk.covered, true); assert.deepEqual(ixOk.index.accessionNumber, ['r1', 'o1', 'o2']); assert.equal(okPages.seen.length, 2, 'p0 ueberlappt nicht und wird nicht gelesen');
  const badPages = mk(true), c6 = createEdgarClient({ userAgent: 'x', fetchImpl: badPages.impl, sleep: async () => {} });
  assert.equal((await c6.indexCovering('7', '2016-11-10', '2017-05-18')).covered, false);
  // a cache of another parser version is not reused for documents
  const c4 = createEdgarClient({ userAgent: 'x', fetchImpl: f2.impl, sleep: async () => {}, cache: { ...emptyCache(), parser: 'old', documents: { '0000000001-17-000010': { parser: 'old', statements: [] } } } });
  assert.equal((await c4.document('0000000001', { accessionNumber: '0000000001-17-000010', form: '8-K', filingDate: day(401), primaryDocument: 'd0.htm' })).cached, false);
});

// ---------------------------------------------------------------------------------------------------- run

const ids = (s) => `tiingo:NYSE:S${String(s).padStart(3, '0')}:2010-01-01`;
const EVENTS = { 2: [{ at: 400, price: 10, volume: 0.1 }], 5: [{ at: 300, price: 10, volume: 0.1 }], 9: [{ at: 500, price: 12, volume: 0.08 }], 11: [{ at: 450, price: 20, volume: 0.05 }] };
const SECRET = 'UNIQUE-SYNTHETIC-PASSAGE-4410';
function runFixture() {
  const segs = Array.from({ length: 16 }, (_, s) => seg(ids(s), series(700, s + 21, EVENTS[s] || [])));
  // S002 1:10 with a share bracket (path A), S005 1:10 and S009 1:12 without a usable bracket (path B), S011 unmapped
  const shares = new Map([[ids(2), SEC([[330, 50e6], [460, 5e6]], '0000000002')], [ids(5), SEC([[230, 50e6]], '0000000005')], [ids(9), SEC([[430, 50e6]], '0000000009')]]);
  const subs = { '0000000002': INDEX([['8-K', 401, '5.03,9.01', '0000000002-17-000001']]), '0000000005': INDEX([['DEF 14A', 270, '', '0000000005-16-000002']]), '0000000009': INDEX([['8-K', 501, '5.03', '0000000009-17-000003'], ...Array.from({ length: 8 }, (_, k) => ['10-Q', 510 + k * 5, '', `0000000009-17-1000${k}`])]) };
  const calls = [];
  const impl = async (url, opts) => {
    calls.push(url); assert.equal(opts.headers['User-Agent'], 'test');
    const m = url.match(/submissions\/CIK(\d{10})\.json$/);
    if (m) return { ok: true, json: async () => ({ filings: { recent: subs[m[1]], files: [] } }) };
    const body = url.includes('/data/2/') ? `<p>${SECRET}</p>${SPLIT_8K(10, 400)}` : url.includes('/data/5/') ? '<p>Proposal 3: approve a reverse stock split at a ratio between 1-for-5 and 1-for-30.</p>'
      : url.endsWith('/d0.htm') ? SPLIT_8K(12, 500) : '<p>Quarterly report. All share data reflect the 1-for-12 reverse stock split.</p>';
    return { ok: true, text: async () => body };
  };
  return { segs, shares, calls, impl };
}

test('SF7-EDGAR-RUN: 1.3.0 unveraendert zuerst, BASE unveraendert, nur Umfang geprueft, Dokumenttext nie oeffentlich, Overlay erzeugt', async () => {
  const { segs, shares, calls, impl } = runFixture(), ds = dsOf(segs), W = { from: day(0), to: day(699), dataEnd: day(699) };
  const client = createEdgarClient({ userAgent: 'test', fetchImpl: impl, sleep: async () => {}, extractors: EXTRACTORS });
  const r = await caResolutionPart(ds, segs, { sharesByListing: shares, fetchFilings: (cik) => client.submissions13(cik), secFetchMax: 150, classifierVersion: CA_EDGAR_VERSION, rulesetSha256Value: rulesetSha256(), refine: edgarRefine({ client }), ...W });
  const plain = await caResolutionPart(ds, segs, { sharesByListing: shares, ...W });
  const ref = integrityPart(ds, { ...W, policies: [] });
  for (const k of INTEGRITY_KEYS) { assert.equal(r.pub.lifecycles[k].BASE.ledgerSha256, ref.pub.lifecycles[k].BASE.ledgerSha256, k); assert.equal(r.pub.lifecycles[k].BASE.tradesSha256, plain.pub.lifecycles[k].BASE.tradesSha256, k); }
  assert.equal(plain.pub.version, 'sf7-ca-resolution-1.3.0', 'ohne Verfeinerung bleibt der 1.3.0-Lauf unveraendert');
  const e = r.pub.refine;
  assert.equal(e.sessionsInScope, 4); assert.equal(e.sessionsWithCik, 3); assert.equal(e.sessionsChecked, 3);
  assert.deepEqual(e.byDocumentPath, { A: 1, B: 2, NONE: 1 });
  // 1.4.1 (R5): S009 has 9 candidate documents (> 6): incomplete -> UNRESOLVED; the frozen 1.4.0 confirmed it
  assert.equal(e.byClass14[CLASSES.SPLIT], 1); assert.deepEqual(e.splitFactors14, { '1:10': 1 }); assert.equal(e.byReason14.DOCUMENT_CAP_EXCEEDED, 1);
  assert.equal(e.previous.byClass[CLASSES.SPLIT], 2); assert.equal(e.previous.pinned, true); assert.equal(e.incomplete.capExceeded, 1);
  assert.equal(e.transitions140to141['DOCUMENT_FACTOR -> DOCUMENT_CAP_EXCEEDED'], 1);
  assert.equal(e.byReason14.DOCUMENT_RANGE_ONLY, 1, 'S005: nur eine genehmigte Spanne');
  assert.equal(e.labels.AMBIGUOUS, 1); assert.equal(e.labels.REVERSE_SPLIT_DOCUMENTED, 2); assert.equal(e.labels.NOT_CHECKED, 1); assert.deepEqual(e.previous.labels, e.labels);
  assert.equal(e.byCheck.NO_CIK, 1);
  assert.equal(calls.filter((u) => u.includes('/data/9/')).length, EDGAR_BUDGET.docRequestsPerSession, 'hoechstens 6 Dokumente je Sitzung');
  assert.equal(e.requests.requests, calls.length); assert.equal(e.requests.byKind.submissions, 3);
  assert.equal(e.before.exposedK5Unresolved, 4); assert.equal(e.after.exposedK5Unresolved, 3); assert.equal(e.changedOutsideScope, 0);
  assert.equal(e.before.overlayEntries, 0); assert.equal(r.manifest.entries.length, 1); assert.equal(r.pub.overlay.entries, 1);
  assert.equal(r.pub.version, CA_EDGAR_VERSION); assert.equal(r.manifest.classifierVersion, CA_EDGAR_VERSION);
  assert.equal(r.pub.census['DQ-K5'].byClass[CLASSES.SPLIT], 1);
  for (const p of Object.values(e.perReference)) { assert.equal(p.unresolved14, p.dqK5Exposed - p.confirmedSplit14 - p.confirmedGenuine14); assert.ok(p.confirmedSplit140 >= p.confirmedSplit14); }
  assert.equal(r.pub.datasets['CA-Q-K5'].quarantine.cuts, 3, 'nur die ungeklaerten Sitzungen werden geschnitten');
  // public: counts only - no document text, no accession, no CIK, no security id
  const pubText = JSON.stringify(r.pub);
  assert.doesNotMatch(pubText, new RegExp(SECRET, 'i')); assert.doesNotMatch(pubText, /certificate of amendment/i); assert.doesNotMatch(pubText, /0000000002|0000000009-17/); assert.doesNotMatch(pubText, /tiingo:/);
  assert.doesNotMatch(pubText, /"(cagr|sharpe|sortino|winRate|profitFactor|expectancy|pnl|equity|returnPct|maxDrawdown|ratio)"/);
  // sealed: extracted values only, never the passage
  const sealedText = JSON.stringify(r.sealed);
  assert.doesNotMatch(sealedText, new RegExp(SECRET, 'i')); assert.doesNotMatch(sealedText, /certificate of amendment/i);
  assert.ok(r.sealed.refine.sessions.some((x) => x.document?.passageSha256 && x.document?.accessionNumber === '0000000002-17-000001'));
});

test('SF7-EDGAR-SCOPE: erwartete Anzahl (83) wird vor jeder Dokumentanfrage geprueft (fail closed)', async () => {
  assert.equal(EXPECTED_SCOPE_SESSIONS, 83); assert.equal(MANIFEST_SHA256_V130, 'e0a31fea1f723faec9046e944c9500984809a62b3cc44262ad3e648f252522c1');
  const { segs, shares, calls, impl } = runFixture(), ds = dsOf(segs), W = { from: day(0), to: day(699), dataEnd: day(699) };
  const client = createEdgarClient({ userAgent: 'test', fetchImpl: impl, sleep: async () => {} });
  await assert.rejects(caResolutionPart(ds, segs, { sharesByListing: shares, refine: edgarRefine({ client, expectedCount: 83 }), ...W }), /EDGAR_SCOPE_COUNT_MISMATCH: 4 != 83/);
  assert.equal(calls.length, 0, 'keine Anfrage vor der Pruefung');
  // budget exhausted mid-way: the rest stays UNRESOLVED and is reported, no request beyond the budget
  const tight = createEdgarClient({ userAgent: 'test', fetchImpl: impl, sleep: async () => {}, budget: { ...EDGAR_BUDGET, totalRequests: 2 }, extractors: EXTRACTORS });
  const r = await caResolutionPart(ds, segs, { sharesByListing: shares, refine: edgarRefine({ client: tight, budget: tight.stats().budget }), ...W });
  assert.equal(calls.length, 2); assert.equal(r.pub.refine.requests.requests, 2);
  assert.ok((r.pub.refine.byReason14.EDGAR_BUDGET_EXHAUSTED ?? 0) >= 1);
  assert.equal(r.pub.refine.byClass14[CLASSES.SPLIT] ?? 0, 1, 'nur die vollstaendig gepruefte Sitzung');
});

test('SF7-EDGAR-RULESET: Regelsatz 1.4.1 vorregistriert und festgeschrieben; 1.4.0 eingefroren; 1.3.0 unveraendert', () => {
  assert.equal(CA_EDGAR_VERSION, 'sf7-ca-resolution-1.4.1'); assert.equal(V140.CA_EDGAR_VERSION, 'sf7-ca-resolution-1.4.0');
  assert.equal(V140.rulesetSha256(), '8f9f5e69c90a49ec14654ab269b3de18a076cb336f2d1fe7583093bb144120dd', '1.4.0 (Lauf 40185801366) eingefroren');
  assert.equal(RULESET.previous.sha256, V140.rulesetSha256());
  assert.ok(Object.isFrozen(RULESET)); assert.ok(Object.isFrozen(RULESET.tolerances)); assert.ok(Object.isFrozen(RULESET.budget));
  assert.equal(rulesetSha256(), '21f78d694ecbd78f0530c2c66a9faf76a9271b9f455ab6c86607e3266c16116c', 'jede Regelaenderung ist ein neuer, versionierter Regelsatz (1.4.1 mit Vorher/Nachher)');
  assert.equal(rulesetSha256V130(), '08d8a6ec8e0565f0c674fa295d50745607b1c37cfc8411e609952f8224267af7'); assert.equal(baseRulesetUnchanged(), true);
});

test('SF7-EDGAR-FAIL-CLOSED: ohne Snapshot oder research-v1 kein Lauf; Workflow-Modi mit Snapshot-Vertrag', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sf7-edgar-')), script = path.join(ROOT, 'scripts/supertrader/source-faithful/research/run-sf7-ca-edgar.mjs');
  try {
    const a = spawnSync(process.execPath, [script, '--accounting', 'research-v1', '--out', out], { encoding: 'utf8' });
    assert.equal(a.status, 2); assert.match(a.stderr, /SNAPSHOT_REQUIRED/);
    const b = spawnSync(process.execPath, [script, '--snapshot', 'sts1-134d4d62eb88b6ff8d98fe6e56b12a6d', '--out', out], { encoding: 'utf8' });
    assert.equal(b.status, 2); assert.match(b.stderr, /RESEARCH_ACCOUNTING_REQUIRED/);
    assert.deepEqual(fs.readdirSync(out), [], 'nichts geschrieben');
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
  const y = fs.readFileSync(path.join(ROOT, '.github/workflows/supertrader-validation.yml'), 'utf8');
  assert.match(y, /options: \[[^\]]*sf7-ca-edgar, sf7-ca-edgar-smoke/);
  assert.match(y, /run-sf7-ca-edgar\.mjs --out "\$RUNNER_TEMP\/val" \$SNAP_ARGS \$extra/);
  for (const m of y.matchAll(/case "\$MODE" in (sf-research\|[^)]*|methods\|[^)]*)\)/g)) assert.match(m[1], /\|sf7-ca-edgar\|sf7-ca-edgar-smoke\|/, 'Snapshot- und research-v1-Pflicht');
  const r = fs.readFileSync(path.join(ROOT, 'scripts/supertrader/source-faithful/research/run-sf7-ca-edgar.mjs'), 'utf8');
  assert.match(r, /requireRestoreReceipt: true/); assert.match(r, /encryptForOwner\(pem, Buffer\.from\(JSON\.stringify\(r\.manifest\)\)\)/);
});

// ---------------------------------------------------------------------------------------------------- 1.4.1: review of #921

const D23 = Array.from({ length: 40 }, (_, k) => new Date(Date.UTC(2023, 1, 13) + k * 864e5).toISOString().slice(0, 10));
const raw23 = D23.map((date) => ({ date })), i23 = D23.indexOf('2023-03-03');
const docAt = (form, filingDate, html) => ({ accessionNumber: `x-${filingDate}`, form, filingDate, extraction: extractStatements(html) });

test('SF7-REVIEW141-R1: Datum nur aus dem Satz des Verhaeltnisses; andere Jahreszahl blockiert; ISO-Datum', () => {
  const review = '<p>In 2019 we effected a 1-for-10 reverse stock split. Effective March 3, 2023, our shares began trading on Nasdaq.</p>';
  assert.equal(V140.documentFactor({ docs: [{ ...docAt('8-K', '2023-03-06', review), extraction: V140.extractStatements(review) }], raw: raw23, i: i23 }).ok, true, '1.4.0 bestaetigte den alten Split (Befund)');
  assert.notEqual(documentFactor({ docs: [docAt('8-K', '2023-03-06', review)], raw: raw23, i: i23 }).ok, true, '1.4.1: kein Faktor');
  assert.equal(documentFactor({ docs: [docAt('8-K', '2023-03-06', '<p>Following the 2019 offering, we effected a 1-for-10 reverse stock split effective March 3, 2023.</p>')], raw: raw23, i: i23 }).reason, 'DOCUMENT_YEAR_CONFLICT');
  const iso = documentFactor({ docs: [docAt('8-K', '2023-03-06', '<p>We effected a 1-for-10 reverse stock split, effective 2023-03-03.</p>')], raw: raw23, i: i23 });
  assert.equal(iso.ok, true); assert.equal(iso.evidence.statedDate, '2023-03-03');
  const t = documentText('the split was approved by the board of xyz inc. on march 1. the reverse split took effect.');
  assert.equal(t.slice(...sentenceBounds(t, t.indexOf('board'))), 'the split was approved by the board of xyz inc. on march 1.', 'Abkuerzung beendet keinen Satz');
});

test('SF7-REVIEW141-R2: Doppelpunkt vor Satzzeichen, "one (1) share for every ten (10) shares", "10-to-1" / "1-to-10 ratio"', () => {
  const one = (x) => { const m = ratioMentions(documentText(x)).filter((y) => y.splitContext); assert.equal(m.length, 1, x); return m[0].priceFactor; };
  assert.equal(one('a reverse stock split at a ratio of 1:10.'), 10);
  assert.equal(one('the reverse split at 1:10, effective march 3, 2023'), 10);
  assert.equal(one('the reverse split at a ratio of 1:10; the shares'), 10);
  assert.equal(one('one (1) share for every ten (10) shares of common stock (reverse split)'), 10);
  assert.equal(one('1 share for every 10 shares held, the reverse split'), 10);
  assert.equal(one('a 10-to-1 reverse split'), 10);
  assert.equal(one('a 1-to-10 ratio reverse stock split'), 10);
  assert.equal(ratioMentions(documentText('the reverse split became effective at 12:01, on march 3')).filter((y) => y.splitContext).length, 0, 'Uhrzeit');
  // a second ratio in a new phrasing now defeats a confirmation (conflict check)
  const a = docAt('8-K', '2023-03-06', '<p>We effected a 1-for-10 reverse stock split effective March 3, 2023.</p>'), b = docAt('10-Q', '2023-04-20', '<p>Share data reflect the reverse stock split at a ratio of 1:12.</p>');
  assert.equal(documentFactor({ docs: [a, b], raw: raw23, i: i23 }).reason, 'DOCUMENT_CONFLICTING_RATIOS');
});

test('SF7-REVIEW141-R3: Auswahlliste "1-for-5, 1-for-10 or 1-for-15" ist eine Spanne', () => {
  const st = extractStatements('<p>to approve a reverse stock split at a ratio of 1-for-5, 1-for-10 or 1-for-15, effective March 3, 2023.</p>').statements;
  assert.equal(st.length, 3); assert.ok(st.every((x) => x.range));
  assert.equal(V140.extractStatements('<p>to approve a reverse stock split at a ratio of 1-for-5, 1-for-10 or 1-for-15.</p>').statements[0].range, false, '1.4.0: 1-for-5 galt als Verhaeltnis (Befund)');
  assert.equal(documentFactor({ docs: [docAt('8-K', '2023-03-06', '<p>The board approved a reverse stock split at a ratio of 1-for-5, 1-for-10 or 1-for-15, effective March 3, 2023.</p>')], raw: raw23, i: i23 }).reason, 'DOCUMENT_RANGE_ONLY');
});

test('SF7-REVIEW141-R4: +-2 Sitzungen auf dem Snapshot-Kalender, nicht auf den Balken des Listings', () => {
  // the listing lacks two calendar sessions (no trade) before d: on its own bars 2023-02-28 is 2 bars away, on the calendar 4
  const listing = raw23.filter((b) => b.date !== '2023-03-01' && b.date !== '2023-03-02'), il = listing.findIndex((b) => b.date === '2023-03-03');
  const docs = [docAt('8-K', '2023-03-06', '<p>We effected a 1-for-10 reverse stock split effective February 27, 2023.</p>')];
  assert.equal(V140.documentFactor({ docs: [{ ...docs[0], extraction: V140.extractStatements('<p>We effected a 1-for-10 reverse stock split effective February 27, 2023.</p>') }], raw: listing, i: il }).ok, true, '1.4.0 zaehlte Balken (Befund)');
  assert.equal(documentFactor({ docs, raw: listing, i: il, calendar: D23 }).reason, 'DOCUMENT_EFFECTIVE_DATE_OUTSIDE_WINDOW');
});

test('SF7-REVIEW141-R5: mehr Kandidaten als die Obergrenze oder ein gekuerztes Dokument -> unvollstaendig', () => {
  const ok = [docAt('8-K', '2023-03-06', '<p>We effected a 1-for-10 reverse stock split effective March 3, 2023.</p>')];
  assert.equal(documentFactor({ docs: ok, raw: raw23, i: i23 }).ok, true);
  assert.equal(documentFactor({ docs: ok, raw: raw23, i: i23, incompleteReason: 'DOCUMENT_CAP_EXCEEDED' }).reason, 'DOCUMENT_CAP_EXCEEDED');
  const long = extractStatements('<p>We effected a 1-for-10 reverse stock split effective March 3, 2023.</p>' + ' x'.repeat(40), { ...DOC_TOLERANCES, maxDocChars: 80 });
  assert.equal(long.truncated, true);
  const df = documentFactor({ docs: [{ ...ok[0], extraction: long }], raw: raw23, i: i23 });
  assert.equal(df.reason, 'DOCUMENT_TRUNCATED'); assert.equal(groundTruthLabel(df), 'INCOMPLETE');
});

test('SF7-REVIEW141-R6: Optionsschein-, Wandlungs-, Ausuebungs- und Umtauschverhaeltnisse sind kein Split-Verhaeltnis', () => {
  for (const x of ['the exercise price of the warrants was adjusted for the 1-for-10 reverse stock split effective march 3, 2023.', 'each share of convertible preferred stock is convertible into 1-for-10 shares after the reverse split effective march 3, 2023.', 'the conversion rate was adjusted to reflect the 1-for-10 reverse split effective march 3, 2023.', 'the exchangeable shares were adjusted for the 1-for-10 reverse split effective march 3, 2023.']) {
    const e = extractStatements(`<p>${x}</p>`); assert.equal(e.statements.length, 0, x); assert.ok(e.instrumentExcluded >= 1, x);
  }
});

test('SF7-REVIEW141-R7: gemeinsam eingereichte Dokumente (mehrere CIKs) sind als Grenze dokumentiert', () => {
  assert.ok(RULESET.review141.includes('R7-JOINT-FILER-LIMIT-DOCUMENTED'));
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/SUPERTRADER_7_EDGAR_CA_CHECK.md'), 'utf8'), /gemeinsam eingereicht/i);
});
