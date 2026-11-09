#!/usr/bin/env node
'use strict';
/* V12 INDEXPOP step 2: parse and validate every fetched holdings document into fund-date snapshots.
 * Input: inventory.json + fetch manifest (private), raw documents from the private HTTP cache.
 * Output (private, contains full names/positions): snapshots.json; (repo) a compact validation table via --summary.
 * Rules: docs/quant-recovery/v12/indexpop/rules-1.0.0.json (validation, member definition, one date per fund).
 * Usage: node build-snapshots.cjs --private <dir> --out <snapshots.json> [--summary <validation.json>] */
const fs = require('node:fs');
const path = require('node:path');
const L = require('./lib.cjs');

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PRIV = arg('--private'), OUT = arg('--out'), SUMMARY = arg('--summary');
if (!PRIV || !OUT) throw Error('usage: --private <dir> --out <file> [--summary <file>]');
const ROOT = path.resolve(__dirname, '../../../..');
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/indexpop/rules-1.0.0.json'), 'utf8'));
const CACHE = path.join(PRIV, 'http-cache');
const inv = JSON.parse(fs.readFileSync(path.join(PRIV, 'work/inventory.json'), 'utf8'));
const man = JSON.parse(fs.readFileSync(path.join(PRIV, 'work/manifest.json'), 'utf8'));

const FUND_RE = { IWB: /\biSHARES\s+RUSSELL 1000 (ETF|INDEX FUND)\b/i, IWM: /\biSHARES\s+RUSSELL 2000 (ETF|INDEX FUND)\b/i, IWV: /\biSHARES\s+RUSSELL 3000 (ETF|INDEX FUND)\b/i };
const ANY_FUND_RE = /\biSHARES\s[^|]{0,70}?\b(ETF|INDEX FUND)\b/i;
const reportDateOf = new Map();
for (const f of inv.funds) for (const r of f.holdingsFilings) reportDateOf.set(f.fund + '|' + r.accession, r.reportDate || null);

function parseDoc(d, fund) {
  const exp = RULES.funds[fund].expectedPositions, buf = L.readCached(CACHE, d.url);
  if (!buf) return { state: 'NOT_CACHED' };
  const src = { form: d.form, accession: d.accession, filingDate: d.filingDate, url: d.url, sha256: L.sha256(buf), bytes: buf.length };
  if (src.sha256 !== d.sha256) throw Error('CACHE_SHA_MISMATCH ' + d.url);
  if (d.kind === 'NPORT_XML') {
    const doc = L.parseNport(buf), v = L.validateNport(doc, exp);
    const expectedSeries = RULES.funds[fund].series;
    if (expectedSeries && doc.seriesId !== expectedSeries) v.valid = false, v.reasons.push('SERIES_MISMATCH');
    const members = doc.positions.filter(L.isNportMember).map(p => ({ name: p.name, title: p.title, cusip: p.cusip, isin: p.isin, shares: p.balance, value: p.valUSD, country: p.country }));
    return { state: 'PARSED', date: doc.repPdDate, dateSource: 'NPORT_REPPDDATE', kind: 'NPORT', src, validation: v, members, nonMemberPositions: doc.positions.length - members.length };
  }
  const rep = L.parseReport(buf, /\.htm/i.test(d.url), FUND_RE[fund] ? { fundRe: FUND_RE[fund], anyFundRe: ANY_FUND_RE } : {});
  const meta = reportDateOf.get(fund + '|' + d.accession);
  let date = rep.date, dateSource = 'DOCUMENT_HEADING';
  if (!date && meta) { date = meta; dateSource = 'FILING_PERIOD_OF_REPORT'; rep.date = meta; }
  const v = L.validateReport(rep, exp);
  if (rep.date && meta && meta !== rep.date) v.periodOfReportDiffers = meta;
  return { state: 'PARSED', date, dateSource, kind: 'REPORT', src, validation: v, members: rep.positions.map(p => ({ name: p.name, shares: p.shares, value: p.value })),
    parserNotes: { oddRows: rep.notes.oddRows, duplicateRowsDropped: rep.notes.duplicateRowsDropped || 0, totalLabel: rep.totalLabel } };
}

const all = [];
for (const d of man.documents) {
  if (d.state !== 'FETCHED') { for (const f of d.funds) all.push({ fund: f, state: d.state, src: { form: d.form, accession: d.accession } }); continue; }
  for (const fund of d.funds) all.push({ fund, ...parseDoc(d, fund) });
}
// One snapshot per fund and date: N-PORT first (it carries CUSIPs), then the original filing, an amendment only when
// the original fails validation and the amendment passes.
const rank = s => (s.kind === 'NPORT' ? 0 : 1) * 10 + (/\/A$/.test(s.src.form) ? 1 : 0);
const byKey = new Map();
for (const s of all.filter(x => x.state === 'PARSED' && x.date)) {
  const k = s.fund + '|' + s.date;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(s);
}
const snapshots = [], superseded = [];
for (const [, list] of byKey) {
  list.sort((a, b) => rank(a) - rank(b));
  const valid = list.filter(s => s.validation.valid);
  const chosen = valid.length ? valid[0] : list[0];
  for (const s of list) if (s !== chosen) superseded.push({ fund: s.fund, date: s.date, form: s.src.form, accession: s.src.accession, valid: s.validation.valid, chosen: chosen.src.accession });
  snapshots.push(chosen);
}
snapshots.sort((a, b) => a.fund.localeCompare(b.fund) || a.date.localeCompare(b.date));
fs.writeFileSync(OUT, JSON.stringify({ schemaVersion: 'v12-indexpop-snapshots-1.0.0', rulesVersion: RULES.ruleVersion, snapshots, superseded,
  unparsed: all.filter(x => x.state !== 'PARSED' || !x.date).map(x => ({ fund: x.fund, state: x.state, form: x.src && x.src.form, accession: x.src && x.src.accession })) }));
const table = snapshots.map(s => ({ fund: s.fund, date: s.date, dateSource: s.dateSource, form: s.src.form, accession: s.src.accession, url: s.src.url, sha256: s.src.sha256,
  valid: s.validation.valid, reasons: s.validation.reasons, memberCount: s.validation.memberCount, memberSum: Math.round(s.validation.memberSum),
  check: s.kind === 'NPORT' ? { netAssets: s.validation.netAssets, ratio: +s.validation.ratio.toFixed(6) } : { reportedTotal: s.validation.reportedTotal, ratio: s.validation.ratio == null ? null : +s.validation.ratio.toFixed(6), totalLabel: (s.parserNotes.totalLabel || '').slice(0, 100) } }));
const counts = {};
for (const s of table) { const c = counts[s.fund] = counts[s.fund] || { dates: 0, valid: 0, notValidated: 0, first: null, last: null, byKind: {} }; c.dates++; s.valid ? c.valid++ : c.notValidated++; if (s.valid) { c.first = c.first && c.first < s.date ? c.first : s.date; c.last = c.last && c.last > s.date ? c.last : s.date; } c.byKind[s.form] = (c.byKind[s.form] || 0) + 1; }
if (SUMMARY) fs.writeFileSync(SUMMARY, JSON.stringify({ schemaVersion: 'v12-indexpop-validation-1.0.0', rulesVersion: RULES.ruleVersion, evidenceKind: 'SOURCE_EVIDENCE', counts, superseded, dates: table }, null, 1) + '\n');
console.log(JSON.stringify(counts, null, 1));
