#!/usr/bin/env node
'use strict';
/* V12 INDEXPOP step 4: register (a), coverage (b), exits (c, without SEC fate), quarter prices and plausibility (d),
 * qualified-subpopulation assessment (5). Inputs are the private snapshots, mapping and qualified-series files.
 * Writes compact repository evidence (--out-dir) and a private exits list for the fate lookup (--private-exits).
 * Usage: node build-outputs.cjs --private <dir> --out-dir <docs/quant-recovery/v12/indexpop> */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const L = require('./lib.cjs');
const ROOT = path.resolve(__dirname, '../../../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const PRIV = arg('--private'), OUTDIR = arg('--out-dir'), V = arg('--rules') || '1.2.0';
const W = f => path.join(PRIV, 'work', f);
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v12/indexpop/rules-' + V + '.json'), 'utf8'));
const MAPFILE = arg('--mapping') || 'mapping.json';
const snaps = JSON.parse(fs.readFileSync(W('snapshots.json'), 'utf8')).snapshots.filter(s => s.validation.valid);
const MAP = JSON.parse(fs.readFileSync(W(MAPFILE), 'utf8'));
if (MAP.rulesVersion !== V) throw Error('MAPPING_RULES_VERSION_MISMATCH');
const Q = JSON.parse(fs.readFileSync(W('qualified.json'), 'utf8'));
const M = MAP.mapping;
const RS = require(path.join(ROOT, 'quant/engines/return-series.js'));
const SERIES_DIR = path.join(ROOT, 'quant/data/market/discover-series-long');
const sha = s => L.sha256(Buffer.from(s)).slice(0, 16);
const day = d => Date.parse(d + 'T00:00:00Z') / 864e5;
const STATUS = ['T1', 'T2', 'T3_AMBIGUOUS', 'T3_PRICE_NOT_CONFIRMED', 'T3_NO_BAR_AT_DATE', 'T3_ISOLATED_CONFIRMATION', 'T3_CLASS_CONFLICT', 'UNMATCHED'];
const statusCode = (e, v) => v.startsWith('ref_') ? (e.tier === 'T1_CUSIP_NAME_EXACT' ? 0 : 1) : STATUS.indexOf(v);
function covered(id, date) {
  const q = id && Q.series[id];
  if (!q || !q.q) return false;
  return day(q.first) <= day(date) + 7 && day(q.last) >= day(date) - 7;
}

// ---------- register + coverage ----------
const keyIdx = new Map(), keyRows = [], idIdx = new Map(), ids = [];
const kIndex = k => { if (!keyIdx.has(k)) { const e = M[k]; keyIdx.set(k, keyRows.length); keyRows.push([sha(k), e.cik ? +e.cik : null, k.startsWith('C:') ? sha('CUSIP:' + k.slice(2, 11)) : null, k[0]]); } return keyIdx.get(k); };
const iIndex = id => { if (!idIdx.has(id)) { idIdx.set(id, ids.length); ids.push(id); } return idIdx.get(id); };
const register = [], coverage = [], blockers = new Map();
const perKeyDates = new Map(); // fund -> Map(identity -> [dates])
for (const s of snaps) {
  const total = s.members.reduce((a, m) => a + m.value, 0);
  const rows = [], c = { n: 0, w: 0, mappedN: 0, mappedW: 0, coveredN: 0, coveredW: 0, mappedNotQualifiedN: 0, mappedNotQualifiedW: 0, t3N: 0, t3W: 0, unmatchedN: 0, unmatchedW: 0, t1N: 0, t2N: 0 };
  const pkeys = L.positionKeys(s);
  for (const [i, m] of s.members.entries()) {
    const k = pkeys[i], e = M[k], v = e.dateMap[s.date], w = m.value / total, code = statusCode(e, v);
    const id = v.startsWith('ref_') ? v : null, cov = covered(id, s.date);
    rows.push([kIndex(k), Math.round(m.shares), Math.round(m.value), Math.round(w * 1e6), id ? iIndex(id) : -1, code, cov ? 1 : 0]);
    c.n++; c.w += w;
    if (id) { c.mappedN++; c.mappedW += w; code === 0 ? c.t1N++ : c.t2N++; if (cov) { c.coveredN++; c.coveredW += w; } else { c.mappedNotQualifiedN++; c.mappedNotQualifiedW += w; } }
    else if (code === 7) { c.unmatchedN++; c.unmatchedW += w; }
    else { c.t3N++; c.t3W += w; }
    if (!cov && s.date >= '2019-07-01') { // blockers of the N-PORT era: which uncovered members carry the weight
      const bk = s.fund + '|' + (id || (e.mappedIds[0] || k)); const b = blockers.get(bk) || { fund: s.fund, securityId: id || e.mappedIds[0] || null, cik: e.cik ? +e.cik : null, name: m.name, w: 0, dates: 0, reasons: {} };
      const why = id ? 'NOT_QUALIFIED:' + ((Q.series[id] && Q.series[id].reason) || (Q.series[id] && Q.series[id].q ? 'OUTSIDE_SERIES_RANGE' : 'NO_SERIES')) : STATUS[code];
      b.w += w; b.dates++; b.reasons[why] = (b.reasons[why] || 0) + 1; blockers.set(bk, b);
    }
    const ident = id || (e.mappedIds.length === 1 ? e.mappedIds[0] : e.cik && e.cikSource ? 'cik:' + e.cik : k);
    if (!perKeyDates.has(s.fund)) perKeyDates.set(s.fund, new Map());
    const pk = perKeyDates.get(s.fund); if (!pk.has(ident)) pk.set(ident, { dates: [], keys: new Set(), lastValue: 0, lastShares: 0, lastWeight: 0, id: null });
    const r = pk.get(ident); r.dates.push(s.date); r.keys.add(k); r.lastValue = m.value; r.lastShares = m.shares; r.lastWeight = w; if (id) r.id = id; r.cik = e.cik || r.cik; r.name = m.name;
  }
  register.push({ fund: s.fund, index: RULES.funds[s.fund].index, date: s.date, form: s.src.form, accession: s.src.accession, url: s.src.url, sha256: s.src.sha256, members: rows.length, rows });
  const pct = x => +(100 * x).toFixed(3);
  const cov = { fund: s.fund, index: RULES.funds[s.fund].index, date: s.date, form: s.src.form, members: c.n,
    mappedPctN: pct(c.mappedN / c.n), mappedPctW: pct(c.mappedW), coveredPctN: pct(c.coveredN / c.n), coveredPctW: pct(c.coveredW),
    mappedNotQualifiedPctN: pct(c.mappedNotQualifiedN / c.n), mappedNotQualifiedPctW: pct(c.mappedNotQualifiedW), t3PctN: pct(c.t3N / c.n), t3PctW: pct(c.t3W),
    unmatchedPctN: pct(c.unmatchedN / c.n), unmatchedPctW: pct(c.unmatchedW), t1: c.t1N, t2: c.t2N };
  cov.qualifies = cov.coveredPctN >= 95 && cov.coveredPctW >= 99;
  coverage.push(cov);
}

// ---------- qualified periods and yearly gap ----------
const funds = [...new Set(coverage.map(c => c.fund))];
const assessment = {};
for (const f of funds) {
  const l = coverage.filter(c => c.fund === f).sort((a, b) => a.date < b.date ? -1 : 1);
  // longest run of consecutive qualifying dates ending at the last date
  let start = null; for (let i = l.length - 1; i >= 0 && l[i].qualifies; i--) start = l[i].date;
  const years = {};
  for (const c of l) { const y = c.date.slice(0, 4); (years[y] = years[y] || []).push(c); }
  const byYear = Object.fromEntries(Object.entries(years).map(([y, cs]) => [y, { dates: cs.length, members: Math.round(cs.reduce((a, c) => a + c.members, 0) / cs.length),
    coveredPctN: +(cs.reduce((a, c) => a + c.coveredPctN, 0) / cs.length).toFixed(2), coveredPctW: +(cs.reduce((a, c) => a + c.coveredPctW, 0) / cs.length).toFixed(2),
    gapPctN: +(100 - cs.reduce((a, c) => a + c.coveredPctN, 0) / cs.length).toFixed(2), gapPctW: +(100 - cs.reduce((a, c) => a + c.coveredPctW, 0) / cs.length).toFixed(2),
    unmatchedPctN: +(cs.reduce((a, c) => a + c.unmatchedPctN, 0) / cs.length).toFixed(2), t3PctN: +(cs.reduce((a, c) => a + c.t3PctN, 0) / cs.length).toFixed(2),
    mappedNotQualifiedPctN: +(cs.reduce((a, c) => a + c.mappedNotQualifiedPctN, 0) / cs.length).toFixed(2),
    mappedAnySeriesPctN: +(cs.reduce((a, c) => a + c.mappedPctN, 0) / cs.length).toFixed(2), mappedAnySeriesPctW: +(cs.reduce((a, c) => a + c.mappedPctW, 0) / cs.length).toFixed(2), qualifyingDates: cs.filter(c => c.qualifies).length }]));
  const thresholds = {};
  for (const [tn, tw] of [[95, 99], [90, 97], [80, 95]]) {
    let st = null; for (let i = l.length - 1; i >= 0 && l[i].coveredPctN >= tn && l[i].coveredPctW >= tw; i--) st = l[i].date;
    thresholds['n' + tn + '_w' + tw] = { qualifyingDates: l.filter(c => c.coveredPctN >= tn && c.coveredPctW >= tw).length, contiguousToLastDateFrom: st };
  }
  // sensitivity: the same thresholds if every mapped listing (T1/T2) counted, i.e. if the loader qualified all mapped series
  const thresholdsIfAllMappedQualified = {};
  for (const [tn, tw] of [[95, 99], [90, 97], [80, 95]]) {
    let st = null; for (let i = l.length - 1; i >= 0 && l[i].mappedPctN >= tn && l[i].mappedPctW >= tw; i--) st = l[i].date;
    thresholdsIfAllMappedQualified['n' + tn + '_w' + tw] = { qualifyingDates: l.filter(c => c.mappedPctN >= tn && c.mappedPctW >= tw).length, contiguousToLastDateFrom: st };
  }
  assessment[f] = { thresholdsIfAllMappedQualified, index: RULES.funds[f].index, dates: l.length, first: l[0].date, last: l.at(-1).date, qualifyingDates: l.filter(c => c.qualifies).length,
    contiguousQualifiedFrom: start, thresholds, byYear,
    topUncoveredSince2019H2: [...blockers.values()].filter(b => b.fund === f).map(b => ({ securityId: b.securityId, cik: b.cik, name: b.name, meanWeightPct: +(100 * b.w / l.filter(c => c.date >= '2019-07-01').length).toFixed(3), dates: b.dates, reasons: b.reasons }))
      .sort((a, b) => b.meanWeightPct - a.meanWeightPct).slice(0, 25) };
}

// ---------- exits ----------
const exits = [];
for (const [f, pk] of perKeyDates) {
  const fdates = [...new Set(snaps.filter(s => s.fund === f).map(s => s.date))].sort();
  for (const [ident, r] of pk) {
    const last = r.dates.sort().at(-1), li = fdates.indexOf(last);
    if (li === fdates.length - 1) continue;
    // a member key that reappears later is not an exit; absent at every later date = exit
    exits.push({ fund: f, index: RULES.funds[f].index, identity: ident.startsWith('ref_') ? ident : ident.startsWith('cik:') ? ident : 'key:' + sha(ident), securityId: r.id,
      cik: r.cik ? +r.cik : null, name: r.name, firstHoldingDate: r.dates[0], lastHoldingDate: last, nextFundDate: fdates[li + 1], datesHeld: r.dates.length,
      lastWeightPct: +(100 * r.lastWeight).toFixed(5), lastPrice: +(r.lastValue / r.lastShares).toFixed(4), hasQualifiedSeriesAtExit: covered(r.id, last),
      seriesStatus: r.id ? (Q.series[r.id] && Q.series[r.id].q ? 'QUALIFIED' : 'NOT_QUALIFIED:' + (Q.series[r.id] ? Q.series[r.id].reason : 'NONE')) : 'NO_SERIES' });
  }
}
exits.sort((a, b) => a.fund.localeCompare(b.fund) || a.lastHoldingDate.localeCompare(b.lastHoldingDate) || String(a.identity).localeCompare(String(b.identity)));

// ---------- quarter prices for members without a covered series + plausibility where both exist ----------
const seriesCache = new Map();
function weeksOf(id) {
  if (seriesCache.has(id)) return seriesCache.get(id);
  const d = JSON.parse(fs.readFileSync(path.join(SERIES_DIR, id + '.json'), 'utf8'));
  const bars = d.points.map(p => ({ date: p[0], close: p[1] })).concat(((d.corporateActions && d.corporateActions.splits) || []).map(s => ({ date: s[0], splitFactor: s[1], isSplit: true })));
  bars.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.isSplit ? -1 : 1));
  const f = RS.splitFactors(bars), byDate = new Map();
  bars.forEach((b, i) => { if (!b.isSplit) byDate.set(b.date, b.close * f[i]); });
  seriesCache.set(id, byDate); return byDate;
}
const qp = new Map(); // key -> {cik, name, prices: Map(date->price)}
const plaus = { exactDateMatches: [], splitLike: 0, splitLikeSamples: [] };
const SPLITS = [2, 3, 4, 5, 10, 1.5, 20, 7, 8];
for (const s of snaps) { const pks = L.positionKeys(s); for (const [i, m] of s.members.entries()) {
  const k = pks[i], e = M[k], v = e.dateMap[s.date], id = v.startsWith('ref_') ? v : null, price = m.value / m.shares;
  if (!covered(id, s.date)) {
    if (!qp.has(k)) qp.set(k, { cik: e.cik ? +e.cik : null, name: m.name, status: STATUS[statusCode(e, v)] || 'T?', prices: new Map() });
    qp.get(k).prices.set(s.date, +price.toFixed(4));
  }
  const cid = id || (e.mappedIds.length === 1 ? e.mappedIds[0] : null);
  if (cid) {
    const raw = weeksOf(cid).get(s.date); // only holding dates that are themselves a weekly bar date (week's last trading day)
    if (raw > 0) {
      const r = price / raw;
      if (id) plaus.exactDateMatches.push({ fund: s.fund, date: s.date, dev: Math.abs(r - 1) });
      else for (const k2 of SPLITS) for (const x of [k2, 1 / k2]) if (Math.abs(r / x - 1) < 0.02) { plaus.splitLike++; if (plaus.splitLikeSamples.length < 40) plaus.splitLikeSamples.push({ fund: s.fund, date: s.date, securityId: cid, ratio: +r.toFixed(4) }); }
    }
  }
}
}
const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null;
const devs = plaus.exactDateMatches.map(x => x.dev).sort((a, b) => a - b);
const devByEra = {};
for (const x of plaus.exactDateMatches) { const era = x.date < '2019-07-01' ? 'REPORT_ERA' : 'NPORT_ERA'; (devByEra[era] = devByEra[era] || []).push(x.dev); }
const summ = a => { a.sort((x, y) => x - y); return { n: a.length, median: q(a, 0.5), p90: q(a, 0.9), p99: q(a, 0.99), max: a.at(-1), shareAbove1pct: a.filter(x => x > 0.01).length / (a.length || 1), shareAbove0_1pct: a.filter(x => x > 0.001).length / (a.length || 1) }; };

// ---------- write ----------
fs.mkdirSync(OUTDIR, { recursive: true });
const common = { rulesVersion: RULES.ruleVersion, rulesFile: 'docs/quant-recovery/v12/indexpop/rules-' + V + '.json', evidenceKind: 'RECONSTRUCTION', certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
// Columnar, rows sorted by key index, key index delta-coded: the register has ~360,000 position rows. Weight = v / sum(v).
const columnar = register.map(({ rows, ...meta }) => {
  const r = rows.slice().sort((a, b) => a[0] - b[0]);
  return { ...meta, cols: { dk: r.map((x, i) => i ? x[0] - r[i - 1][0] : x[0]), sh: r.map(x => x[1]), v: r.map(x => x[2]), id: r.map(x => x[4]), st: r.map(x => x[5]), cov: r.map(x => x[6]) } };
});
const regDoc = { schemaVersion: 'v12-indexpop-register-' + V, ...common,
  columns: { keys: ['keyHash(sha256(positionKey)[0:16])', 'cik', 'cusipHash(sha256("CUSIP:"+cusip)[0:16])|null', 'keyKind C=CUSIP N=normalized name'],
    cols: { dk: 'key index, delta to the previous row (rows sorted by key index)', sh: 'shares (rounded)', v: 'value USD (rounded); weight = v / sum(v)', id: 'securityIds index or -1', st: 'status index into status[]', cov: 'covered by a qualified series 0/1' } },
  status: STATUS, securityIds: ids, keys: keyRows, snapshots: columnar };
if (!process.argv.includes('--no-register')) fs.writeFileSync(path.join(OUTDIR, 'register-' + V + '.json.gz'), zlib.gzipSync(JSON.stringify(regDoc), { level: 9 }));
fs.writeFileSync(path.join(OUTDIR, 'coverage-' + V + '.json'), JSON.stringify({ schemaVersion: 'v12-indexpop-coverage-' + V, ...common, loaderOptions: Q.loaderOptions, qualifiedSeries: Q.reasons,
  mapping: { candidates: MAP.candidates, excludedNonCommonListings: MAP.excludedNonCommon, positionKeys: MAP.keys, keyTiers: MAP.tierCounts, keyDateStatus: MAP.dateStatusCounts },
  assessment, dates: coverage }, null, 1) + '\n');
const exitCounts = {};
for (const x of exits) { const c = exitCounts[x.fund] = exitCounts[x.fund] || { exits: 0, withSecurityId: 0, qualifiedAtExit: 0, withCik: 0 }; c.exits++; if (x.securityId) c.withSecurityId++; if (x.hasQualifiedSeriesAtExit) c.qualifiedAtExit++; if (x.cik) c.withCik++; }
fs.writeFileSync(path.join(PRIV, 'work/exits-' + V + '.json'), JSON.stringify({ exits }));
const qpRows = [...qp].map(([k, v]) => [sha(k), v.cik, v.name, v.status, [...v.prices].sort()]);
fs.writeFileSync(path.join(OUTDIR, 'quarter-prices-' + V + '.json.gz'), zlib.gzipSync(JSON.stringify({ schemaVersion: 'v12-indexpop-quarter-prices-' + V, ...common,
  note: 'Raw (unadjusted) price = reported value / reported shares at the holding date, for member position keys without a covered qualified series at that date. Not a traded close; funds value at the official close of the holding date.',
  columns: ['keyHash', 'cik', 'name (as filed)', 'mappingStatus', '[[date, price]]'], rows: qpRows }), { level: 9 }));
const plausDoc = { schemaVersion: 'v12-indexpop-price-plausibility-' + V, ...common,
  method: 'Members mapped (T1/T2) at a holding date that is itself the date of a weekly bar: |value/shares / (close x split factors after the bar) - 1|. The mapping used a 5 % bracket tolerance, so this distribution is truncated at about 5 %; it measures agreement of fund valuation with the provider close, not identity.',
  all: summ(devs.slice()), byEra: Object.fromEntries(Object.entries(devByEra).map(([k, a]) => [k, summ(a)])),
  splitConsistency: { method: 'Positions whose key maps to exactly one listing elsewhere but are NOT mapped at this date, on exact bar dates: ratio within 2 % of a common split ratio k or 1/k (k in ' + SPLITS.join(',') + ') indicates a split not reflected in the provider factors or a different share basis.', count: plaus.splitLike, samples: plaus.splitLikeSamples } };
fs.writeFileSync(path.join(OUTDIR, 'price-plausibility-' + V + '.json'), JSON.stringify(plausDoc, null, 1) + '\n');
console.log(JSON.stringify({ snapshots: register.length, keys: keyRows.length, exitCounts, quarterPriceKeys: qpRows.length, plausibility: plausDoc.all, splitLike: plaus.splitLike }, null, 1));
for (const f of funds) console.log(f, JSON.stringify({ q: assessment[f].qualifyingDates, of: assessment[f].dates, th: assessment[f].thresholds, ifAllMapped: assessment[f].thresholdsIfAllMappedQualified }));
