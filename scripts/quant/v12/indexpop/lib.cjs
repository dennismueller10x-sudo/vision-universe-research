'use strict';
/* V12 INDEXPOP shared library: private-cache access, N-PORT parser, report-schedule parser, name normalization.
 * Raw SEC documents are read from the private HTTP cache written by secfetch.py (http_client.DiskCache layout:
 * <cache>/<sha256(url)[0:2]>/<sha256(url)>.gz). Nothing here writes into the repository. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
function cachePath(cacheDir, url) { const h = sha256(url); return path.join(cacheDir, h.slice(0, 2), h + '.gz'); }
function readCached(cacheDir, url) {
  const p = cachePath(cacheDir, url);
  if (!fs.existsSync(p)) return null;
  return zlib.gunzipSync(fs.readFileSync(p));
}

// ---------- N-PORT ----------
const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
function tagOf(block, t) { const m = block.match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>')); return m ? decodeXml(m[1].trim()) : null; }
function parseNport(xml) {
  const s = xml.toString('utf8');
  const head = s.slice(0, s.indexOf('<invstOrSecs>') > 0 ? s.indexOf('<invstOrSecs>') : 20000);
  const doc = {
    submissionType: tagOf(head, 'submissionType'), regCik: tagOf(head, 'regCik'), seriesId: tagOf(head, 'seriesId'), seriesName: tagOf(head, 'seriesName'),
    repPdEnd: tagOf(head, 'repPdEnd'), repPdDate: tagOf(head, 'repPdDate'),
    totAssets: Number(tagOf(head, 'totAssets')), totLiabs: Number(tagOf(head, 'totLiabs')), netAssets: Number(tagOf(head, 'netAssets')), positions: [],
  };
  const re = /<invstOrSec>([\s\S]*?)<\/invstOrSec>/g;
  let m;
  while ((m = re.exec(s))) {
    const b = m[1];
    const isin = b.match(/<isin value="([^"]*)"/);
    const tick = b.match(/<ticker value="([^"]*)"/);
    doc.positions.push({ name: tagOf(b, 'name'), title: tagOf(b, 'title'), cusip: tagOf(b, 'cusip'), isin: isin ? isin[1] : null, ticker: tick ? tick[1] : null,
      balance: Number(tagOf(b, 'balance')), units: tagOf(b, 'units'), cur: tagOf(b, 'curCd'), valUSD: Number(tagOf(b, 'valUSD')), pctVal: Number(tagOf(b, 'pctVal')),
      payoff: tagOf(b, 'payoffProfile'), assetCat: tagOf(b, 'assetCat'), issuerCat: tagOf(b, 'issuerCat'), country: tagOf(b, 'invCountry') });
  }
  return doc;
}
const isNportMember = p => p.assetCat === 'EC' && p.payoff === 'Long' && p.units === 'NS' && p.valUSD > 0 && p.balance > 0;
function validateNport(doc, expected) {
  const members = doc.positions.filter(isNportMember);
  const sum = members.reduce((a, p) => a + p.valUSD, 0);
  const ratio = doc.netAssets > 0 ? sum / doc.netAssets : null;
  const reasons = [];
  if (!(ratio >= 0.98 && ratio <= 1.01)) reasons.push('MEMBER_SUM_VS_NET_ASSETS_OUT_OF_RANGE');
  if (!(members.length >= expected[0] && members.length <= expected[1])) reasons.push('MEMBER_COUNT_OUT_OF_RANGE');
  return { valid: reasons.length === 0, reasons, memberCount: members.length, positionCount: doc.positions.length, memberSum: sum, netAssets: doc.netAssets, totAssets: doc.totAssets, ratio };
}

// ---------- names ----------
const LEGAL = new Set(['INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'PLC', 'LLC', 'LP', 'NV', 'SA', 'AG', 'SE']);
const FILLER = new Set(['COM', 'COMMON', 'STOCK', 'SHS', 'SHARES', 'ORD', 'NEW', 'ADR']);
function normName(raw) {
  if (!raw) return { key: '', cls: null };
  let s = String(raw).toUpperCase().replace(/&AMP;/g, '&').replace(/&/g, ' AND ');
  s = s.replace(/\/THE\b/g, ' ').replace(/\/[A-Z]{2}\/?$/g, ' ').replace(/\/[A-Z]{2}\s/g, ' ');
  let cls = null;
  const cm = s.match(/\b(?:CLASS|CL)\s*[- .]?\s*([A-C])\b/);
  if (cm) { cls = cm[1]; s = s.replace(cm[0], ' '); }
  s = s.replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  let t = s.split(' ').filter(Boolean);
  if (t[0] === 'THE') t = t.slice(1);
  t = t.filter(x => !FILLER.has(x));
  while (t.length > 1 && LEGAL.has(t[t.length - 1])) t.pop();
  return { key: t.join(' '), cls };
}
function tokenSim(a, b) { // token-set Jaccard on normalized keys
  const A = new Set(a.split(' ').filter(Boolean)), B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}

// ---------- report schedules (N-30D, N-30B-2, N-Q; HTML or text) ----------
const ENT = { nbsp: ' ', amp: '&', reg: '', trade: '', copy: '', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '-', ndash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', middot: ' ', bull: ' ', eacute: 'e' };
function decodeEntities(s) {
  return s.replace(/&#x([0-9a-f]+);/gi, (_, h) => cp(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => cp(+n)).replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : ' '));
}
function cp(n) { if (n === 160) return ' '; if (n === 174 || n === 8482 || n === 169) return ''; if (n === 8212 || n === 8211 || n === 151 || n === 150) return '-'; if (n === 8217 || n === 8216 || n === 146) return "'"; return n < 0x10000 ? String.fromCharCode(n) : ' '; }
const clean = s => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** Logical rows: arrays of cell strings. HTML: one row per <tr> (cells <td>/<th>); text: one row per line,
 * cells split at dot leaders or runs of >= 2 spaces. Non-table HTML text between tables becomes single-cell rows. */
function logicalRows(buf, isHtml) {
  let s = buf.toString('latin1');
  const rows = [];
  if (isHtml) {
    s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
    const gap = g => { for (const part of g.split(/<\/p>|<br\s*\/?>|<\/div>|<\/h\d>|<\/table>|<\/center>/i)) { const x = clean(part); if (x) rows.push([x]); } };
    const re = /<tr[\s>][\s\S]*?<\/tr>/gi;
    let m, last = 0;
    while ((m = re.exec(s))) {
      gap(s.slice(last, m.index)); last = m.index + m[0].length;
      const cells = [];
      const cre = /<t[dh](?:\s[^>]*)?>([\s\S]*?)(?=<t[dh][\s>]|<\/tr>)/gi;
      let c;
      while ((c = cre.exec(m[0]))) { const x = clean(c[1].replace(/<\/t[dh]>[\s\S]*$/i, '')); if (x) cells.push(x); }
      if (cells.length) rows.push(cells);
    }
    gap(s.slice(last));
  } else {
    s = s.replace(/<\/?(TABLE|CAPTION|S|C|PAGE|FN)>/gi, '\n');
    for (const line of s.split(/\r?\n/)) {
      const t = line.replace(/\t/g, '    ');
      if (!t.trim()) continue;
      const cells = t.replace(/\.{3,}/g, '  ').split(/\s{2,}/).map(x => x.trim()).filter(Boolean);
      if (cells.length) rows.push(cells);
    }
  }
  return rows;
}
const NUMCELL = /^\(?\$?\s*\d{1,3}(,\d{3})*(\.\d+)?\)?$|^\(?\$?\s*\d+(\.\d+)?\)?$/;
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_RE = new RegExp('(' + MONTHS + ')\\s+(\\d{1,2}),?\\s+(\\d{4})', 'i');
function isoDate(m) { const mi = MONTHS.toUpperCase().split('|').indexOf(m[1].toUpperCase()) + 1; return m[3] + '-' + String(mi).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0'); }
function stripFootnotes(name) {
  return name.replace(/\s*\(\s*(?:[a-z]|\d)\s*\)/g, ' ').replace(/\*+/g, ' ').replace(/(\s+[a-z](\s*,\s*[a-z])*)+\s*$/g, '').replace(/\s+/g, ' ').trim();
}
/** Parse one fund's common-stock schedule. fundRe (optional) selects the fund in a multi-fund document by its page
 * heading (e.g. /iSHARES\s*RUSSELL 3000 (ETF|INDEX FUND)/i); headings of other funds switch the scope off. */
function parseReport(buf, isHtml, opts = {}) {
  const rows = logicalRows(buf, isHtml);
  const fundHeading = opts.anyFundRe || null, fundRe = opts.fundRe || null;
  let inScope = !fundRe, seenSchedule = false, collecting = false, pending = '', date = null, total = null, totalLabel = null;
  const positions = [], notes = { rowsSeen: rows.length, oddRows: 0 };
  for (let i = 0; i < rows.length && total === null; i++) {
    // a value glued to the end of a long name ("American International Group, Inc. 1,926,637") is its own cell
    const cells = rows[i].flatMap(c => { const g = c.match(/^(.*[A-Za-z.)*])\s+\$?\s*(\d{1,3}(?:,\d{3})+)$/); return g && !/Cost/i.test(c) ? [g[1], g[2]] : [c]; }), joined = cells.join(' ');
    if (fundHeading && fundHeading.test(joined) && joined.length < 220) {
      const now = fundRe.test(joined);
      if (now !== inScope) pending = '';
      inScope = now;
      if (inScope) seenSchedule = true; // fund page headings appear on schedule pages only
      if (inScope && !date) for (let k = i; k < Math.min(i + 4, rows.length); k++) { const d = rows[k].join(' ').match(DATE_RE); if (d) { date = isoDate(d); break; } }
      continue;
    }
    if (!inScope) continue;
    if (/SCH?EDULE OF (INVESTMENTS|PORTFOLIO INVESTMENTS)/i.test(joined) && joined.length < 200) {
      seenSchedule = true; pending = '';
      if (!date) for (let k = i; k < Math.min(i + 4, rows.length); k++) { const d = rows[k].join(' ').match(DATE_RE); if (d) { date = isoDate(d); break; } }
      continue;
    }
    if (/^See accompanying/i.test(joined)) { pending = ''; continue; }
    const text = cells.filter(c => /[A-Za-z]/.test(c));
    const nums = cells.map(c => c.replace(/[\s$]/g, '')).filter(c => c && !/[A-Za-z]/.test(c) && NUMCELL.test(c));
    const pct = cells.filter(c => /^\(?-?[\d.,]+\s*%\)?$/.test(c.replace(/\s/g, '')));
    const textJoined = text.join(' ');
    if (!collecting) {
      if (seenSchedule && /COMMON STOCK|^SECURITY$|^NAME OF ISSUER/i.test(textJoined) && !/TOTAL/i.test(textJoined)) collecting = true;
      continue;
    }
    const label = (pending + ' ' + textJoined).trim();
    if (/TOTAL (COMMON STOCKS?|INVESTMENTS)/i.test(label)) {
      const inline = label.match(/\)\s*\$?\s*(\d{1,3}(,\d{3})+)\s*$/);
      if (nums.length) { total = Number(nums[nums.length - 1].replace(/[$,()\s]/g, '')); totalLabel = label.slice(0, 120); }
      else if (inline) { total = Number(inline[1].replace(/,/g, '')); totalLabel = label.slice(0, 120); }
      else pending = label; // value on the next row
      continue;
    }
    if (!nums.length) {
      if (pct.length || (textJoined && !/[a-z]/.test(textJoined) && textJoined.length > 3)) { pending = ''; continue; } // industry heading
      if (/^(Shares|Value|Security|Common Stocks?)$/i.test(textJoined)) continue;
      pending = (pending + ' ' + textJoined).trim();
      if (pending.length > 200) pending = textJoined;
      continue;
    }
    if (nums.length >= 2 && label) {
      const sh = Number(nums[nums.length - 2].replace(/[$,()\s]/g, '')), val = Number(nums[nums.length - 1].replace(/[$,()\s]/g, ''));
      if (sh > 0 && val >= 0 && Number.isFinite(sh) && Number.isFinite(val)) positions.push({ name: stripFootnotes(label), shares: sh, value: val });
      else { notes.oddRows++; (notes.oddSamples = notes.oddSamples || []).length < 20 && notes.oddSamples.push(cells.join(' | ').slice(0, 160)); }
    } else { notes.oddRows++; (notes.oddSamples = notes.oddSamples || []).length < 20 && notes.oddSamples.push(cells.join(' | ').slice(0, 160)); }
    pending = '';
  }
  // exact repeats of a row (same name, shares and value; page repeats in a few documents) are kept once
  const seen = new Set(), unique = [];
  for (const p of positions) { const k = p.name + '|' + p.shares + '|' + p.value; if (seen.has(k)) { notes.duplicateRowsDropped = (notes.duplicateRowsDropped || 0) + 1; continue; } seen.add(k); unique.push(p); }
  return { date, positions: unique, total, totalLabel, notes };
}
function validateReport(rep, expected) {
  const sum = rep.positions.reduce((a, p) => a + p.value, 0), reasons = [];
  const ratio = rep.total ? sum / rep.total : null;
  if (rep.total == null) reasons.push('TOTAL_NOT_FOUND');
  else if (!(ratio >= 0.99 && ratio <= 1.01)) reasons.push('MEMBER_SUM_VS_REPORTED_TOTAL_OUT_OF_RANGE');
  if (!(rep.positions.length >= expected[0] && rep.positions.length <= expected[1])) reasons.push('MEMBER_COUNT_OUT_OF_RANGE');
  if (!rep.date) reasons.push('DATE_NOT_FOUND');
  return { valid: reasons.length === 0, reasons, memberCount: rep.positions.length, memberSum: sum, reportedTotal: rep.total, ratio };
}

module.exports = { logicalRows, parseReport, validateReport, stripFootnotes, sha256, cachePath, readCached, parseNport, isNportMember, validateNport, normName, tokenSim, decodeXml };
