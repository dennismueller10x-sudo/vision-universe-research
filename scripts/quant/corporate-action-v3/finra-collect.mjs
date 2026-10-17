#!/usr/bin/env node
/**
 * FINRA OTC Daily List collector (protocol 3.0.0, second independent corporate-action source).
 * Public FINRA Query API dataset otcMarket/otcDailyList (no credentials), complete download by half-year windows of
 * calendarDay with offset paging. Every window must deliver exactly the record-total the API reports; any shortfall,
 * HTTP error or truncated page is counted and makes complete = false (no silent gaps).
 *
 * Fields only (no prices). Output: {schema, fetchedAt, windows[], stats, rows[]} (rows as returned, selected fields).
 *
 * Usage: node finra-collect.mjs --out rows.json [--from 2016] [--to 2026]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = (() => { const o = {}, a = process.argv.slice(2); for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1]; return o; })();
const URL_ = 'https://api.finra.org/data/group/otcMarket/name/otcDailyList';
export const COLLECTOR_VERSION = 'finra-otc-daily-list-collector-1.0.0';
export const FIELDS = ['OTCDailyListID', 'calendarDay', 'dailyListDatetime', 'dailyListEventCode', 'dailyListReasonDescription', 'oldSymbolCode', 'newSymbolCode',
  'oldSecurityDescription', 'newSecurityDescription', 'forwardSplitRate', 'reverseSplitRate', 'stockPercentage', 'exDate', 'recordDate', 'paymentDate', 'declarationDate',
  'oldMarketCategoryCode', 'newMarketCategoryCode', 'changeSymbolFlag', 'securityDeleteFlag', 'securityAddFlag', 'bankruptcyFlag', 'subjectCorporateActionCode',
  'dividendTypeCode', 'dividendTypeDescription', 'oldADROrdinaryShareRate', 'newADROrdnyShareRate', 'oldClassText', 'newClassText'];
const PAGE = 2500;
const stats = { requests: 0, retries: 0, errors: 0, windows: 0, incompleteWindows: [], rows: 0 };

async function page(start, end, offset) {
  const body = JSON.stringify({ limit: PAGE, offset, fields: FIELDS, dateRangeFilters: [{ fieldName: 'calendarDay', startDate: start, endDate: end }] });
  for (let a = 0; a < 6; a++) {
    stats.requests++;
    try {
      const res = await fetch(URL_, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body });
      if (res.status === 204) return { rows: [], total: 0 };
      if (res.status === 429 || res.status >= 500) { stats.retries++; await new Promise((r) => setTimeout(r, 3000 * (a + 1))); continue; }
      if (!res.ok) { stats.errors++; return null; }
      const total = Number(res.headers.get('record-total'));
      const rows = await res.json();
      return { rows: Array.isArray(rows) ? rows : [], total: Number.isFinite(total) ? total : null };
    } catch { stats.retries++; await new Promise((r) => setTimeout(r, 2000 * (a + 1))); }
  }
  stats.errors++; return null;
}

async function main() {
  const from = Number(args.from || 2016), to = Number(args.to || new Date().getUTCFullYear());
  const rows = [], windows = [];
  for (let y = from; y <= to; y++) for (const [s, e] of [['01-01', '06-30'], ['07-01', '12-31']]) {
    const start = `${y}-${s}`, end = `${y}-${e}`;
    let got = 0, total = null, ok = true;
    for (let off = 0; ; off += PAGE) {
      const p = await page(start, end, off);
      if (!p) { ok = false; break; }
      if (total === null) total = p.total ?? 0;
      rows.push(...p.rows); got += p.rows.length;
      if (!p.rows.length || off + PAGE >= total) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    stats.windows++;
    if (!ok || got !== (total ?? 0)) { ok = false; stats.incompleteWindows.push({ start, end, got, total }); }
    windows.push({ start, end, rows: got, recordTotal: total, complete: ok });
  }
  const seen = new Set(), uniq = [];
  for (const r of rows) { const k = r.OTCDailyListID; if (seen.has(k)) continue; seen.add(k); uniq.push(r); }
  stats.rows = uniq.length; stats.duplicateRowsDropped = rows.length - uniq.length;
  stats.complete = stats.incompleteWindows.length === 0 && stats.errors === 0;
  const out = { schema: 'finra-otc-daily-list-rows-1.0.0', collector: COLLECTOR_VERSION, source: URL_, fetchedAt: new Date().toISOString(), from, to, fields: FIELDS, windows, stats, rows: uniq };
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(out));
  console.log('[finra]', JSON.stringify(stats), 'sha', crypto.createHash('sha256').update(JSON.stringify(uniq)).digest('hex').slice(0, 16));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
