#!/usr/bin/env node
'use strict';
// V12 MCAP stage 3: apply rule 1.0.0 (docs/quant-recovery/v12/mcap/rule-1.0.0.json) to every share observation of the
// V10 factor panel and build (a) the research register quant/engines/research-pit-market-cap-register.cjs,
// (b) the private corrected observation file and (c) the compact repo summary.
// Usage: node classify.cjs --private <dir> [--register-out <file>] [--summary-out <file>] [--spinoff-sources <json>]
// Reads <private>/observations.json.gz and <private>/sharefacts.json.gz.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const M = require(ROOT + '/quant/engines/research-pit-market-cap.cjs');
const SCRATCH = '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad';
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const RULE_FILE = 'docs/quant-recovery/v12/mcap/rule-' + M.RULE.version + '.json';
const FACT_COLUMNS = ['accn', 'concept', 'v', 'status', 'class', 'D', 'vPrime', 'E', 'filed', 'scaleExponent', 'tier', 'evidence'];
const SPLIT_COLUMNS = ['date', 'factor', 'class', 'availableAt', 'ratio', 'before', 'after', 'source'];

function normFacts(issuer, columns) {
  const out = [];
  const add = facts => { for (const [c, rows] of Object.entries(facts)) for (const r of rows) { const o = Object.fromEntries(columns.map((k, i) => [k, r[i]])); out.push({ c, end: o.end, start: o.start, val: o.val, accn: o.accn, filed: o.filed, unit: o.unit, form: o.form }); } };
  add(issuer.facts); for (const p of Object.values(issuer.predecessors || {})) add(p);
  return out;
}

/** Register build. Pure over its inputs (observations, share facts, optional SEC spin-off sources). */
function build(obs, sf, spinoffSources) {
  const rows = obs.rows, listings = obs.listings;
  const byListing = new Map();
  for (const r of rows) { if (!byListing.has(r.id)) byListing.set(r.id, []); byListing.get(r.id).push(r); }
  const regFacts = {}, regSplits = {}, factLog = [], splitLog = [];
  const sources = new Map((spinoffSources?.records || []).map(x => [x.securityId + '|' + x.date, x]));
  for (const [id, lrows] of [...byListing].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const L = listings[id], cik = L.cik, issuer = sf.issuers[cik];
    if (!issuer) throw Error('NO_SHARE_FACTS:' + cik);
    const facts = normFacts(issuer, sf.columns);
    // S7 split register for the listing
    const splitRecs = [];
    for (const [d, f] of L.splits) {
      if (d < M.RULE.SPLIT_WINDOW[0] || d > M.RULE.SPLIT_WINDOW[1]) continue;
      let r = M.classifySplitEvent(d, f, facts);
      const src = sources.get(id + '|' + d);
      if (src) r = { ...r, class: src.class, availableAt: src.availableAt > d ? src.availableAt : d, source: src.sources.map(s => s.accession) };
      splitRecs.push(r);
      splitLog.push({ id, cik, ...r });
    }
    regSplits[id] = splitRecs.map(r => [r.date, r.factor, r.class, r.availableAt, r.ratio === null || r.ratio === undefined ? null : +r.ratio.toPrecision(8), r.before, r.after, r.source || null]);
    const notSplit = splitRecs.filter(r => r.class === 'NOT_A_SPLIT');
    const keptAt = asOf => L.splits.filter(([d, f]) => !notSplit.some(n => n.date === d && n.factor === f && n.availableAt && n.availableAt <= asOf));
    // facts by accession, accessions in filed order
    const byAccn = new Map();
    for (const f of facts) { if (!byAccn.has(f.accn)) byAccn.set(f.accn, []); byAccn.get(f.accn).push(f); }
    const accns = [...byAccn.keys()].map(a => ({ accn: a, filed: byAccn.get(a).reduce((m, f) => (f.filed < m ? f.filed : m), '9999') })).sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : a.accn < b.accn ? -1 : 1));
    // distinct observations in filed order
    const distinct = new Map();
    for (const r of lrows) {
      const code = M.CONCEPT_CODE[r.s.concept];
      if (!code) throw Error('UNEXPECTED_CONCEPT:' + r.s.concept);
      const key = r.s.accn + '|' + code + '|' + r.s.v;
      if (!distinct.has(key)) distinct.set(key, { key, code, v: r.s.v, E: r.s.end, filed: r.s.filed, accn: r.s.accn, uses: [] });
      distinct.get(key).uses.push(r);
    }
    const order = [...distinct.values()].sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : a.accn < b.accn ? -1 : a.accn > b.accn ? 1 : a.code < b.code ? -1 : 1));
    const sanitized = new Map(); // accn -> {code|val -> vPrime|null}
    const validated = []; // non-excluded observations in filed order (1.0.2 primary prior vintage)
    for (const o of order) {
      const events = keptAt(o.filed);
      const basis = (from, to) => M.basisFactor(events, from, to);
      const priorAccns = (filed, raw) => {
        const out = [];
        for (let i = accns.length - 1; i >= 0; i--) {
          const a = accns[i]; if (!(a.filed < filed)) continue;
          let fs_ = byAccn.get(a.accn);
          if (!raw && sanitized.has(a.accn)) {
            const m = sanitized.get(a.accn);
            fs_ = fs_.flatMap(f => { const k = f.c + '|' + f.val; if (!m.has(k)) return [f]; const nv = m.get(k); return nv === null ? [] : [{ ...f, val: nv }]; });
          }
          out.push({ accn: a.accn, filed: a.filed, facts: fs_ });
        }
        return out;
      };
      const maxPriceBasisD = D => Math.max(...o.uses.map(u => u.close * u.fI * M.basisFactor(events, D, u.t)));
      const minPriceBasisD = D => Math.min(...o.uses.map(u => u.close * u.fI * M.basisFactor(events, D, u.t)));
      const previousObservations = (filed, n) => { const out = []; for (let j = validated.length - 1; j >= 0 && out.length < n; j--) if (validated[j].filed < filed) out.push(validated[j]); return out; };
      const res = M.classifyFact({ code: o.code, v: o.v, E: o.E, filed: o.filed, accn: o.accn, maxPriceBasisD, minPriceBasisD }, { byAccn, priorAccns, basis, previousObservations });
      if (res.status !== 'EXCLUDED') validated.push({ c: o.code, accn: o.accn, end: res.D, val: res.vPrime, filed: o.filed });
      if (!sanitized.has(o.accn)) sanitized.set(o.accn, new Map());
      sanitized.get(o.accn).set(o.code + '|' + o.v, res.status === 'EXCLUDED' ? null : res.vPrime);
      // D is needed at runtime only when a provider split lies between E and D
      const lo = res.D < o.E ? res.D : o.E, hi = res.D < o.E ? o.E : res.D;
      const needD = res.D !== o.E && L.splits.some(([d]) => d > lo && d <= hi);
      const keep = res.status !== 'OK' || res.class !== 'OK' && res.class !== 'OK_NO_REFERENCE' || needD;
      if (keep) {
        (regFacts[cik] = regFacts[cik] || []).push([o.accn, o.code, o.v, res.status, res.class, needD || res.status !== 'OK' ? res.D : null,
          res.status === 'CORRECTED' ? res.vPrime : null, o.E, o.filed, res.scaleExponent ?? null, res.tier ?? null, res.evidence]);
      }
      factLog.push({ id, cik, key: o.key, code: o.code, v: o.v, E: o.E, D: res.D, filed: o.filed, accn: o.accn, status: res.status, class: res.class, vPrime: res.vPrime,
        scaleExponent: res.scaleExponent ?? null, tier: res.tier ?? null, flags: res.flags, evidence: res.evidence, uses: o.uses.length, maxMcBefore: Math.max(...o.uses.map(u => u.mc)) });
    }
  }
  return { regFacts, regSplits, factLog, splitLog };
}

function applyRows(obs, register) {
  const idx = M.indexRegister(register), out = [];
  for (const r of obs.rows) {
    const L = obs.listings[r.id];
    const res = M.marketCapAt({ securityId: r.id, cik: L.cik, splits: L.splits, doc: { ttm: { shares_outstanding: r.s } }, cutoff: dayBefore(r.t), dates: [r.t], closes: [r.close], factors: [r.fI], i: 0 }, { value: r.mc }, idx);
    out.push({ id: r.id, t: r.t, before: r.mc, after: res.value, status: res.status, classes: res.classes, reason: res.reason || null, accn: r.s.accn });
  }
  return out;
}
const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);

function summarize(obs, b, applied, meta) {
  const cnt = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  const factByClass = {}, factByStatus = {}, factByYearClass = {}, issuersByClass = {}, scaleK = {}, tierCount = {};
  for (const f of b.factLog) {
    cnt(factByClass, f.class); cnt(factByStatus, f.status);
    const y = f.filed.slice(0, 4); factByYearClass[y] = factByYearClass[y] || {}; cnt(factByYearClass[y], f.class);
    if (f.class !== 'OK' && f.class !== 'OK_NO_REFERENCE') { issuersByClass[f.class] = issuersByClass[f.class] || new Set(); issuersByClass[f.class].add(obs.listings[f.id].ticker); }
    if (f.scaleExponent !== null) cnt(scaleK, String(f.scaleExponent));
    if (f.tier) cnt(tierCount, f.tier);
  }
  const rowByStatus = {}, rowByClass = {}, rowByYearStatus = {};
  let over5e12Before = 0, over5e12After = 0;
  for (const r of applied) {
    cnt(rowByStatus, r.status); for (const c of r.classes.length ? r.classes : ['NONE']) cnt(rowByClass, c);
    const y = r.t.slice(0, 4); rowByYearStatus[y] = rowByYearStatus[y] || {}; cnt(rowByYearStatus[y], r.status);
    if (r.before > 5e12) over5e12Before++; if (r.after !== null && r.after > 5e12) over5e12After++;
  }
  // implied share counts vs listing median (descriptive, uses the whole listing history = look-ahead, diagnostic only)
  const implied = (useAfter) => {
    const by = new Map();
    for (const r of applied) { const v = useAfter ? r.after : r.before; if (v === null) continue; const row = r; if (!by.has(r.id)) by.set(r.id, []); by.get(r.id).push(v / row.px); }
    let n = 0, bad = 0;
    for (const xs of by.values()) { const s = xs.slice().sort((a, b) => a - b), med = s[s.length >> 1]; for (const x of xs) { n++; if (x / med > 5 || x / med < 0.2) bad++; } }
    return { rows: n, outside5x: bad, share: n ? +(bad / n).toFixed(5) : null };
  };
  const splitByClass = {}; const spinoffs = [];
  for (const s of b.splitLog) { cnt(splitByClass, s.class); if (s.class === 'NOT_A_SPLIT') spinoffs.push({ securityId: s.id, ticker: obs.listings[s.id].ticker, date: s.date, factor: s.factor, ratio: s.ratio === null ? null : +s.ratio.toFixed(4), availableAt: s.availableAt, source: s.source || null }); }
  const topBefore = applied.filter(r => r.before > 5e12).reduce((m, r) => { const k = obs.listings[r.id].ticker; m[k] = Math.max(m[k] || 0, r.before); return m; }, {});
  return {
    schemaVersion: 'v12-mcap-summary-' + M.RULE.version, ...meta,
    observations: { panelRowsWithMarketCap: applied.length, distinctShareObservations: b.factLog.length, listings: new Set(applied.map(r => r.id)).size, issuers: new Set(b.factLog.map(f => f.cik)).size },
    factsByStatus: factByStatus, factsByClass: factByClass, scaleExponents: scaleK, scaleEvidenceTier: tierCount, factsByFiledYearAndClass: factByYearClass,
    issuersByClass: Object.fromEntries(Object.entries(issuersByClass).map(([k, s]) => [k, { count: s.size, tickers: [...s].sort().slice(0, 400) }])),
    rowsByStatus: rowByStatus, rowsByClass: rowByClass, rowsByYearAndStatus: rowByYearStatus,
    rowsOver5e12: { before: over5e12Before, after: over5e12After, maxBeforeByTicker: Object.fromEntries(Object.entries(topBefore).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toPrecision(3)])) },
    impliedSharesOutside5xListingMedian: { note: 'descriptive diagnostic, median over the whole listing history (look-ahead), not used by the rule', before: implied(false), after: implied(true) },
    splitEvents: { window: M.RULE.SPLIT_WINDOW, byClass: splitByClass, notASplit: spinoffs }
  };
}

function main() {
  const priv = arg('--private', path.join(SCRATCH, 'v12-private/mcap'));
  const t0 = Date.now();
  const obs = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(priv, 'observations.json.gz'))));
  const sfText = zlib.gunzipSync(fs.readFileSync(path.join(priv, 'sharefacts.json.gz'))).toString('utf8');
  const sf = JSON.parse(sfText);
  const spinFile = arg('--spinoff-sources', path.join(ROOT, 'docs/quant-recovery/v12/mcap/spinoff-sources-1.0.0.json'));
  const spin = fs.existsSync(spinFile) ? JSON.parse(fs.readFileSync(spinFile, 'utf8')) : null;
  const ruleText = fs.readFileSync(path.join(ROOT, RULE_FILE), 'utf8');
  const b = build(obs, sf, spin);
  const register = { schemaVersion: M.REGISTER_SCHEMA, ruleId: M.RULE.id, ruleVersion: M.RULE.version, ruleSha256: sha(ruleText), rule: RULE_FILE,
    scope: 'Research-only corrections of the PIT share count entering the V10 factor-panel market cap (createResearch... not used; opt-in via quant/engines/research-pit-market-cap.cjs#marketCapAt). Valid for the observation set with observationsHash; a fact absent here was classified OK.',
    builder: 'scripts/quant/v12/mcap/classify.cjs', observationsHash: sha(JSON.stringify(obs.rows.map(r => [r.id, r.t, r.s.accn, r.s.concept, r.s.v]))),
    shareFactsSource: sf.source, shareFactsSha256: sha(sfText), spinoffSourcesSha256: spin ? sha(fs.readFileSync(spinFile, 'utf8')) : null,
    factColumns: FACT_COLUMNS, splitColumns: SPLIT_COLUMNS, facts: b.regFacts, splits: b.regSplits };
  const applied = applyRows(obs, register);
  const pxBy = new Map(obs.rows.map(r => [r.id + '@' + r.t, r.close]));
  for (const r of applied) r.px = pxBy.get(r.id + '@' + r.t);
  const meta = { ruleVersion: M.RULE.version, ruleSha256: register.ruleSha256, observationsHash: register.observationsHash, shareFactsSha256: register.shareFactsSha256, masterHash: obs.masterHash, evidenceKind: 'SOURCE_EVIDENCE', certificationStatus: 'NOT_CERTIFIED', productionApproved: false };
  const summary = summarize(obs, b, applied, meta);
  const regOut = arg('--register-out', path.join(priv, 'research-pit-market-cap-register.cjs'));
  fs.writeFileSync(regOut, "'use strict';\n// Research-only PIT market-cap correction register (V12 MCAP). Data only; read exclusively by quant/engines/research-pit-market-cap.cjs.\n// Regenerate with scripts/quant/v12/mcap/classify.cjs; never hand-edit a record.\nmodule.exports = " + JSON.stringify(register) + ';\n');
  const sumOut = arg('--summary-out', path.join(priv, 'summary-' + M.RULE.version + '.json'));
  fs.writeFileSync(sumOut, JSON.stringify(summary, null, 1) + '\n');
  fs.writeFileSync(path.join(priv, 'fact-log.json.gz'), zlib.gzipSync(JSON.stringify({ meta, facts: b.factLog, splits: b.splitLog })));
  fs.writeFileSync(path.join(priv, 'rows-corrected.json.gz'), zlib.gzipSync(JSON.stringify({ meta, rows: applied })));
  console.log(JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000), factsByStatus: summary.factsByStatus, factsByClass: summary.factsByClass, rowsByStatus: summary.rowsByStatus, rowsOver5e12: { before: summary.rowsOver5e12.before, after: summary.rowsOver5e12.after }, implied: summary.impliedSharesOutside5xListingMedian, splits: summary.splitEvents.byClass }, null, 1));
}
if (require.main === module) main();
module.exports = { build, applyRows, normFacts, FACT_COLUMNS, SPLIT_COLUMNS };
