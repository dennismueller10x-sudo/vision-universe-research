#!/usr/bin/env node
'use strict';
/* V12 INDEXPOP step 3b: map every member position key to our listings (securityId) and to an SEC CIK.
 * Rules: docs/quant-recovery/v12/indexpop/rules-1.0.0.json (matching, price check, tiers).
 *  - position key: N-PORT CUSIP (C:<cusip>); report schedules: normalized name + class (N:<key>|<cls>)
 *  - candidates: series files in quant/data/market/discover-series-long with names from company-names.json, the SEC
 *    company_tickers.json title of their ticker (ticker -> securityId only via core/identity.js#securityIdForTicker)
 *    and every historical EDGAR name of their CIK (cik-lookup-data.txt)
 *  - price check: p = value/shares vs weekly close of the ISO week x provider split factors after the date
 *    (quant/engines/return-series.js#splitFactors, ADR-002)
 * Usage: node map-members.cjs --private <dir> --out <mapping.json> */
const fs = require('node:fs');
const path = require('node:path');
const L = require('./lib.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const identity = require(path.join(ROOT, 'core/identity.js'));
const RS = require(path.join(ROOT, 'quant/engines/return-series.js'));
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PRIV = arg('--private'), OUT = arg('--out');
const SERIES_DIR = path.join(ROOT, 'quant/data/market/discover-series-long');

// ---------- candidates ----------
// rules 1.1.0: only listings classified as common equity in the security master are candidates (preferred, rights,
// warrants, units and ETFs share issuer names and, for preferreds, sometimes prices).
const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/security-master/us-security-master.json'), 'utf8'));
const typesOf = new Map();
for (const r of master.rows) if (r.baseline_security_id) { if (!typesOf.has(r.baseline_security_id)) typesOf.set(r.baseline_security_id, new Set()); typesOf.get(r.baseline_security_id).add(r.instrument_type); }
const isCommon = id => { const t = typesOf.get(id); return !!t && t.has('EQUITY_COMMON') && t.size === 1; };
const allSeries = fs.readdirSync(SERIES_DIR).filter(f => /^ref_.*\.json$/.test(f)).map(f => f.slice(0, -5));
const seriesIds = new Set(allSeries.filter(isCommon));
const excludedNonCommon = allSeries.length - seriesIds.size;
const cand = new Map(); // id -> { variants: [{key, cls, src}], cik, cls }
const addVariant = (id, raw, src) => { if (!raw || !seriesIds.has(id)) return; const n = L.normName(raw); if (!n.key) return; const c = cand.get(id) || { variants: [], cik: null, ciks: new Set() }; if (!c.variants.some(v => v.key === n.key && v.cls === n.cls)) c.variants.push({ key: n.key, cls: n.cls, src }); cand.set(id, c); };
const names = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/security-master/company-names.json'), 'utf8'));
for (const r of names.rows) {
  if (!seriesIds.has(r.securityId)) continue;
  addVariant(r.securityId, r.companyName, 'COMPANY_NAMES');
  for (const [k, v] of Object.entries(r.candidates || {})) addVariant(r.securityId, v.name, k);
  if (r.cik && cand.has(r.securityId)) { cand.get(r.securityId).cik = r.cik.replace(/^0+/, ''); cand.get(r.securityId).ciks.add(r.cik.replace(/^0+/, '')); }
}
const ct = JSON.parse(fs.readFileSync(path.join(PRIV, 'work/company_tickers.json'), 'utf8'));
for (const r of Object.values(ct)) {
  let id; try { id = identity.securityIdForTicker(r.ticker); } catch { continue; }
  if (!seriesIds.has(id)) continue;
  addVariant(id, r.title, 'SEC_COMPANY_TICKERS_CURRENT');
  const c = cand.get(id); if (c) { c.ciks.add(String(r.cik_str)); if (!c.cik) c.cik = String(r.cik_str); }
}
// historical EDGAR names per CIK
const cikNames = new Map(), nameCiks = new Map();
for (const line of fs.readFileSync(path.join(PRIV, 'work/cik-lookup-data.txt'), 'latin1').split('\n')) {
  const m = line.match(/^(.*):(\d{10}):\s*$/); if (!m) continue;
  const cik = String(+m[2]), n = L.normName(m[1]);
  if (!n.key) continue;
  if (!cikNames.has(cik)) cikNames.set(cik, []);
  cikNames.get(cik).push(m[1]);
  if (!nameCiks.has(n.key)) nameCiks.set(n.key, new Set());
  nameCiks.get(n.key).add(cik);
}
for (const [id, c] of cand) for (const cik of c.ciks) for (const nm of cikNames.get(cik) || []) addVariant(id, nm, 'EDGAR_CIK_NAME');
for (const c of cand.values()) { const cl = [...new Set(c.variants.filter(v => v.cls && v.src !== 'EDGAR_CIK_NAME').map(v => v.cls))]; c.cls = cl.length === 1 ? cl[0] : null; }
const byKey = new Map(), byToken = new Map();
for (const [id, c] of cand) for (const v of c.variants) {
  if (!byKey.has(v.key)) byKey.set(v.key, new Set()); byKey.get(v.key).add(id);
  for (const t of new Set(v.key.split(' '))) { if (!byToken.has(t)) byToken.set(t, new Set()); byToken.get(t).add(v.key); }
}

// ---------- series access with split factors ----------
const seriesCache = new Map();
function seriesOf(id) {
  if (seriesCache.has(id)) return seriesCache.get(id);
  const d = JSON.parse(fs.readFileSync(path.join(SERIES_DIR, id + '.json'), 'utf8'));
  const splits = (d.corporateActions && d.corporateActions.splits) || [];
  // bars = weekly points plus split days; splitFactors gives each bar the product of the splits strictly after it
  const bars = d.points.map(p => ({ date: p[0], close: p[1] })).concat(splits.map(s => ({ date: s[0], splitFactor: s[1], isSplit: true })));
  bars.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.isSplit ? -1 : 1));
  const f = RS.splitFactors(bars);
  const weeks = new Map();
  bars.forEach((b, i) => { if (!b.isSplit) weeks.set(isoWeek(b.date), { date: b.date, close: b.close, factor: f[i] }); });
  const s = { weeks, first: d.points[0][0], last: d.points.at(-1)[0] };
  seriesCache.set(id, s);
  return s;
}
function isoWeek(d) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); }
/** Bracket deviation (rules 1.1.0): the holding date usually falls inside a week; its close lies between the previous
 * weekly close and the close of its own ISO week. dev = 0 when p is inside [min, max] of both (as raw prices, i.e.
 * adjusted close x split factor after that bar), else the relative distance to the nearer bound. null without a bar. */
function bracketDev(id, date, price) {
  const s = seriesOf(id), wk = isoWeek(date);
  const cur = s.weeks.get(wk);
  if (!cur || !(price > 0)) return null;
  const prevKey = new Date(Date.parse(wk + 'T00:00:00Z') - 7 * 864e5).toISOString().slice(0, 10);
  const prev = s.weeks.get(prevKey);
  const vals = [cur.close * cur.factor].concat(prev ? [prev.close * prev.factor] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (price >= lo && price <= hi) return 0;
  return price < lo ? (lo - price) / lo : (price - hi) / hi;
}
const DATE_TOL = 0.05;

// ---------- position keys ----------
const snaps = JSON.parse(fs.readFileSync(path.join(PRIV, 'work/snapshots.json'), 'utf8')).snapshots;
const keys = new Map();
const validCusip = c => typeof c === 'string' && /^[0-9A-Z]{8}[0-9]$/.test(c) && !/^0+$/.test(c);
function keyOf(s, m) {
  if (s.kind === 'NPORT' && validCusip(m.cusip)) return 'C:' + m.cusip;
  const n = L.normName(m.title && L.normName(m.title).cls ? m.title : m.name);
  return 'N:' + n.key + '|' + (n.cls || '');
}
for (const s of snaps) {
  if (!s.validation.valid) continue;
  for (const m of s.members) {
    const k = keyOf(s, m); m.key = k;
    if (!keys.has(k)) keys.set(k, { key: k, cusip: k.startsWith('C:') ? k.slice(2) : null, names: new Set(), obs: [], funds: new Set() });
    const e = keys.get(k);
    e.names.add(m.name); if (m.title) e.names.add(m.title);
    e.obs.push({ date: s.date, price: m.value / m.shares });
    e.funds.add(s.fund);
  }
}

// ---------- matching (rules 1.1.0: per holding date) ----------
// A position key is mapped at date d to candidate c when c is the ONLY name candidate whose bracket deviation at d is
// <= DATE_TOL, and c is also confirmed at an adjacent key date where c has a bar (or c has a bar at only this key
// date). One isolated coincidence is not an identity.
const tierCounts = {}, dateStatusCounts = {};
const result = {};
for (const e of keys.values()) {
  const norms = [...e.names].map(L.normName).filter(n => n.key);
  const cls = norms.map(n => n.cls).find(Boolean) || null;
  const exact = new Set();
  for (const n of norms) for (const id of byKey.get(n.key) || []) exact.add(id);
  const fuzzy = new Set();
  if (!exact.size) {
    for (const n of norms) {
      const toks = n.key.split(' ').filter(t => byToken.has(t)).sort((a, b) => byToken.get(a).size - byToken.get(b).size);
      if (!toks.length) continue;
      for (const vk of byToken.get(toks[0])) if (L.tokenSim(n.key, vk) >= 0.9) for (const id of byKey.get(vk)) fuzzy.add(id);
    }
  }
  const named = exact.size ? exact : fuzzy;
  const pool = [...named].filter(id => !(cls && cand.get(id).cls && cand.get(id).cls !== cls));
  const dates = [...new Map(e.obs.map(o => [o.date, o.price])).entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  const dev = new Map(pool.map(id => [id, dates.map(([d, p]) => bracketDev(id, d, p))]));
  const ok = (id, i) => { const v = dev.get(id)[i]; return v !== null && v <= DATE_TOL; };
  const dateMap = {};
  dates.forEach(([d], i) => {
    if (!named.size) { dateMap[d] = 'UNMATCHED'; return; }
    if (!pool.length) { dateMap[d] = 'T3_CLASS_CONFLICT'; return; }
    const conf = pool.filter(id => ok(id, i));
    if (conf.length > 1) { dateMap[d] = 'T3_AMBIGUOUS'; return; }
    if (!conf.length) { dateMap[d] = pool.some(id => dev.get(id)[i] !== null) ? 'T3_PRICE_NOT_CONFIRMED' : 'T3_NO_BAR_AT_DATE'; return; }
    const id = conf[0], withBar = dates.map((_, k) => k).filter(k => dev.get(id)[k] !== null), pos = withBar.indexOf(i);
    const adjacent = withBar.length === 1 || (pos > 0 && ok(id, withBar[pos - 1])) || (pos < withBar.length - 1 && ok(id, withBar[pos + 1]));
    dateMap[d] = adjacent ? id : 'T3_ISOLATED_CONFIRMATION';
  });
  const tier = exact.size && e.cusip ? 'T1_CUSIP_NAME_EXACT' : 'T2_NAME_UNIQUE';
  const mappedIds = [...new Set(Object.values(dateMap).filter(v => v.startsWith('ref_')))];
  for (const v of Object.values(dateMap)) { const k = v.startsWith('ref_') ? tier : v; dateStatusCounts[k] = (dateStatusCounts[k] || 0) + 1; }
  const keyTier = mappedIds.length ? tier : (named.size ? 'T3_UNCERTAIN' : 'UNMATCHED');
  tierCounts[keyTier] = (tierCounts[keyTier] || 0) + 1;
  // CIK: the mapped listing's CIK when unique, else a unique EDGAR name match
  const mc = [...new Set(mappedIds.map(id => cand.get(id).cik).filter(Boolean))];
  let cik = mc.length === 1 ? mc[0] : null, cikSource = cik ? 'LISTING' : null;
  if (!cik) { const s2 = new Set(); for (const n of norms) for (const c of nameCiks.get(n.key) || []) s2.add(c); if (s2.size === 1) { cik = [...s2][0]; cikSource = 'EDGAR_NAME_UNIQUE'; } else if (s2.size > 1) cikSource = 'EDGAR_NAME_AMBIGUOUS'; }
  result[e.key] = { names: [...e.names].slice(0, 4), cusip: e.cusip, funds: [...e.funds], keyTier, tier: mappedIds.length ? tier : null, nameMatch: exact.size ? 'EXACT' : fuzzy.size ? 'FUZZY' : 'NONE',
    pool: pool.slice(0, 8), mappedIds, cik, cikSource, dateMap };
}
fs.writeFileSync(OUT, JSON.stringify({ schemaVersion: 'v12-indexpop-mapping-1.1.0', rulesVersion: '1.1.0', candidates: cand.size, excludedNonCommon, keys: keys.size, tierCounts, dateStatusCounts, mapping: result }));
console.log(JSON.stringify({ candidates: cand.size, excludedNonCommon, keys: keys.size, tierCounts, dateStatusCounts }));
