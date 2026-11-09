#!/usr/bin/env node
/* V13b LARGECAP-STRICT: intervals under protocol amendment 1.1.0 (STRICT_INTERVAL_BOUNDARY).
 * node scripts/quant/v13b/largecap-strict/evaluate-1.1.0.cjs --facts <private facts-1.0.0.jsonl> --out <cases-1.1.0.json>
 * Step 1 runs the UNCHANGED V13 evaluate.cjs (version 1.0.1) and requires its case objects to equal the committed
 * cases-1.0.0.json exactly. Step 2 re-forms the runs with membership (same rules, checked against the 1.0.1 runs).
 * Step 3 clips the 1.0.1-selected run (amendment 1.1.0). Reads committed series/master only, writes only --out. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../../..');
const E = require(path.join(ROOT, 'scripts/quant/v13/largecap/evaluate.cjs'));
const { hash } = require(path.join(ROOT, 'quant/engines/weekly-real-adapter.cjs'));
const V13 = 'docs/quant-recovery/v13/largecap', V13B = 'docs/quant-recovery/v13b/largecap-strict';
const AMEND = path.join(ROOT, V13B, 'protocol-amendment-1.1.0.json');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const DAY = 86400000, t = d => Date.parse(d + 'T00:00:00Z'), iso = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => iso(t(d) + n * DAY), days = (a, b) => Math.round((t(b) - t(a)) / DAY);
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };

const BUFFER = { A: 10, B: 0 };

// Run formation of protocol 1.0.0 (intervalRule) with membership as indexes into the sorted period list.
function formRuns(periods, events, opt) {
  const raw = []; let cur = [];
  const close = () => { if (cur.length) raw.push(cur); cur = []; };
  for (let k = 0; k < periods.length; k++) {
    const p = periods[k];
    if (!p.pass && p.deviation > opt.bigDev) { close(); continue; }
    if (!p.pass && periods[k + 1] && !periods[k + 1].pass) { close(); k++; while (periods[k + 1] && !periods[k + 1].pass) k++; continue; }
    const lastPass = [...cur].reverse().map(i => periods[i]).find(x => x.pass);
    if (p.pass && lastPass && days(lastPass.end, p.start) > opt.gap) close();
    cur.push(k);
  }
  close();
  const split = run => {
    const pass = run.map(i => periods[i]).filter(p => p.pass);
    if (!pass.length) return [run];
    const lo = pass.reduce((m, p) => p.start < m ? p.start : m, pass[0].start), hi = pass.reduce((m, p) => p.end > m ? p.end : m, pass[0].end);
    for (const ev of events) {
      if (ev.date <= lo || ev.date > hi) continue;
      const bef = pass.some(p => (p.start <= ev.date && ev.date <= p.end) || (ev.date > p.end && days(p.end, ev.date) <= opt.eventWin));
      const aft = pass.some(p => (p.start <= ev.date && ev.date <= p.end) || (p.start > ev.date && days(ev.date, p.start) <= opt.eventWin));
      if (!(bef && aft)) {
        const a = run.filter(i => periods[i].end < ev.date), b = run.filter(i => periods[i].start > ev.date);
        return [...(a.length ? split(a) : []), ...(b.length ? split(b) : [])];
      }
    }
    return [run];
  };
  return raw.flatMap(split);
}

function strictCase(base, opt, pts) {
  const periods = base.periods, runs = formRuns(periods, base.events, opt);
  // the re-formed runs must be exactly the 1.0.1 runs
  assert.equal(runs.length, base.runs.length, base.securityId + ' run count');
  runs.forEach((run, j) => {
    const ps = run.map(i => periods[i]), pass = ps.filter(p => p.pass), b = base.runs[j];
    assert.equal(ps.length, b.periods); assert.equal(pass.length, b.pass);
    if (pass.length) {
      assert.equal(pass.reduce((m, p) => p.start < m ? p.start : m, pass[0].start), b.anchoredStart);
      assert.equal(pass.reduce((m, p) => p.end > m ? p.end : m, pass[0].end), b.anchoredEnd);
    }
  });
  const out = { securityId: base.securityId, ticker: base.ticker, cik: base.cik, protocolVersion: '1.1.0', status: 'LOCKED', reasons: [],
    series: base.series, master: base.master,
    identity: { validSymbols: base.identity.validSymbols, firstIdentityFiling: base.identity.firstIdentityFiling, lastIdentityFiling: base.identity.lastIdentityFiling, bound: base.identity.bound,
      firstIdentityQuote: base.identity.firstIdentityQuote, lastIdentityQuote: base.identity.lastIdentityQuote },
    v101: base.interval ? { status: base.status, validFrom: base.interval.validFrom, validTo: base.interval.validTo, bars: base.interval.bars,
      anchoredStart: base.interval.anchoredStart, anchoredEnd: base.interval.anchoredEnd, bandConfirmedMoves: base.bandConfirmedMoves.map(m => m.week) } : { status: base.status } };
  if (base.status !== 'UNLOCKED') { out.reasons.push('LOCKED_UNDER_1.0.1'); return out; }
  // the 1.0.1-selected run: accepted, latest end (same order as evaluate.cjs), identified by its validFrom/validTo
  const jSel = base.runs.findIndex(r => r.accepted && r.validFrom === base.interval.validFrom && r.validTo === base.interval.validTo);
  assert.ok(jSel >= 0, base.securityId + ' selected run');
  const sel = runs[jSel], members = new Set(sel), i0 = Math.min(...sel), i1 = Math.max(...sel), rb = base.runs[jSel];
  out.selectedRun = { index: jSel, memberIndexes: [i0, i1], members: sel.length, gaps: sel.length !== i1 - i0 + 1 ? (i1 - i0 + 1 - sel.length) : 0, start: rb.start, end: rb.end };
  const pub = (p, i) => ({ index: i, type: p.type, start: p.start, end: p.end, pass: p.pass, deviation: p.deviation, ...(p.type === 'A' ? { fy: p.fy, q: p.q, high: p.high, low: p.low } : { avgPrice: p.avgPrice }),
    accession: p.accession, filingDate: p.filingDate, url: p.url, sha256: base.documents.find(d => d.url === p.url).sha256, quote: p.quote });
  const inside = periods.map((p, i) => [p, i]).filter(([p, i]) => !p.pass && !members.has(i) && i > i0 && i < i1);
  if (inside.length) { out.reasons.push('NON_MEMBER_FAILURE_INSIDE_RUN'); out.nonMemberFailuresInside = inside.map(([p, i]) => pub(p, i)); return out; }
  let S = rb.start, Ee = rb.end;
  const clipStart = [], clipEnd = [];
  // iterate (a moved boundary can bring another failing period into reach)
  for (let changed = true; changed;) {
    changed = false;
    periods.forEach((p, i) => {
      if (p.pass || members.has(i)) return;
      const buf = BUFFER[p.type];
      if (i < i0 && addDays(p.end, buf) >= S) { S = addDays(p.end, buf + 1); changed = true; }
      if (i > i1 && addDays(p.start, -buf) <= Ee) { Ee = addDays(p.start, -buf - 1); changed = true; }
    });
  }
  // every non-member failing period whose excluded days reach into the 1.0.1 interval of the run
  periods.forEach((p, i) => {
    if (p.pass || members.has(i)) return;
    if (i < i0 && addDays(p.end, BUFFER[p.type]) >= rb.start) clipStart.push(pub(p, i));
    if (i > i1 && addDays(p.start, -BUFFER[p.type]) <= rb.end) clipEnd.push(pub(p, i));
  });
  const memberPass = sel.map(i => [periods[i], i]).filter(([p]) => p.pass);
  // evidencedStart / evidencedEnd
  // finest evidence: the containing passing member period with the latest start (then the earliest end)
  let startEvidence = memberPass.filter(([p]) => p.start <= S && S <= p.end).sort((a, b) => a[0].start > b[0].start ? -1 : a[0].start < b[0].start ? 1 : a[0].end < b[0].end ? -1 : a[0].end > b[0].end ? 1 : 0)[0];
  if (!startEvidence) { const nx = memberPass.filter(([p]) => p.start > S).sort((a, b) => a[0].start < b[0].start ? -1 : 1)[0]; if (nx) { S = nx[0].start; startEvidence = nx; out.reasons.push('START_MOVED_TO_NEXT_PASSING_PERIOD'); } }
  let endEvidence = memberPass.filter(([p]) => p.start <= Ee && Ee <= p.end).sort((a, b) => a[0].end < b[0].end ? -1 : a[0].end > b[0].end ? 1 : a[0].start > b[0].start ? -1 : a[0].start < b[0].start ? 1 : 0)[0];
  if (!endEvidence) { const pv = memberPass.filter(([p]) => p.end < Ee).sort((a, b) => a[0].end < b[0].end ? -1 : 1).at(-1); if (pv) { Ee = pv[0].end; endEvidence = pv; out.reasons.push('END_MOVED_TO_PREVIOUS_PASSING_PERIOD'); } }
  const bars = pts.filter(p => p[0] >= S && p[0] <= Ee);
  out.strict = { start: S, end: Ee, clipStart, clipEnd,
    startEvidence: startEvidence ? pub(...startEvidence) : null, endEvidence: endEvidence ? pub(...endEvidence) : null };
  if (!startEvidence || !endEvidence || !bars.length || bars.length < opt.minBars) { out.reasons.push('STRICT_INTERVAL_TOO_SHORT'); out.strict.bars = bars.length; return out; }
  const vf = bars[0][0], vt = bars.at(-1)[0];
  assert.ok(vf >= base.interval.validFrom && vt <= base.interval.validTo, 'monotonicity');
  out.status = 'UNLOCKED';
  out.interval = { validFrom: vf, validTo: vt, bars: bars.length, anchoredStart: S, anchoredEnd: Ee,
    changedFrom101: vf !== base.interval.validFrom || vt !== base.interval.validTo, barsRemovedBefore: base.interval.bars && pts.filter(p => p[0] >= base.interval.validFrom && p[0] < vf).length,
    barsRemovedAfter: pts.filter(p => p[0] > vt && p[0] <= base.interval.validTo).length };
  out.historyGuard = { checkedFrom: vf, checkedTo: vt, pointsSha256: hash(bars), bars: bars.length };
  out.bandConfirmedMoves = base.bandConfirmedMoves.filter(m => m.prevWeek >= vf && m.week <= vt);
  out.bandConfirmedMovesExcluded = base.bandConfirmedMoves.filter(m => !(m.prevWeek >= vf && m.week <= vt)).map(m => m.week);
  out.factorsInside = base.factorsInside.filter(f => f.date > vf && f.date <= vt);
  const inIv = memberPass.filter(([p]) => p.start <= vt && p.end >= vf);
  const memIv = sel.map(i => periods[i]).filter(p => p.start <= vt && p.end >= vf);
  out.anchorsInside = { A: memIv.filter(p => p.type === 'A').length, B: memIv.filter(p => p.type === 'B').length, pass: memIv.filter(p => p.pass).length, fail: memIv.filter(p => !p.pass).length };
  out.firstPassInside = pub(...inIv[0]); out.lastPassInside = pub(...inIv.at(-1));
  return out;
}

function main() {
  const opt = E.params('1.0.1');
  const factsPath = arg('facts'), facts = fs.readFileSync(factsPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const committedBytes = fs.readFileSync(path.join(ROOT, V13, 'cases-1.0.0.json')), committed = JSON.parse(committedBytes);
  if (committed.factsSha256 !== sha(fs.readFileSync(factsPath))) throw Error('FACTS_SHA256_DIFFERS_FROM_1.0.1');
  const cases = opt.P.scope.listings.map(sid => {
    const base = JSON.parse(JSON.stringify(E.evaluate(sid, facts.filter(d => d.sid === sid), opt)));
    assert.deepEqual(base, committed.cases.find(c => c.securityId === sid), sid + ': 1.0.1 re-evaluation differs from committed cases-1.0.0.json');
    const pts = JSON.parse(fs.readFileSync(path.join(ROOT, 'quant/data/market/discover-series-long', sid + '.json'), 'utf8')).points;
    return strictCase(base, opt, pts);
  });
  const doc = { schemaVersion: 'v13b-largecap-strict-cases-1.1.0', protocolVersion: '1.1.0', ruleId: 'STRICT_INTERVAL_BOUNDARY',
    protocolSha256: committed.protocolSha256, amendmentSha256: committed.amendmentSha256, amendment110Sha256: sha(fs.readFileSync(AMEND)),
    resultStatus: 'REGISTERED_AMENDMENT_1.1.0_OWNER_APPROVED_RESTRICTION_ONLY', basedOn: { cases: V13 + '/cases-1.0.0.json', casesSha256: sha(committedBytes), reEvaluatedIdentical: true },
    codeSha256: { 'evaluate-1.1.0.cjs': sha(fs.readFileSync(__filename)), 'evaluate.cjs': sha(fs.readFileSync(path.join(ROOT, 'scripts/quant/v13/largecap/evaluate.cjs'))) },
    factsSha256: committed.factsSha256, certificationStatus: 'NOT_CERTIFIED', productionApproved: false, evidenceKind: 'SOURCE_EVIDENCE',
    summary: cases.map(c => ({ securityId: c.securityId, status: c.status, validFrom: c.interval?.validFrom || null, validTo: c.interval?.validTo || null, bars: c.interval?.bars || 0,
      v101: { validFrom: c.v101.validFrom || null, validTo: c.v101.validTo || null, bars: c.v101.bars || 0 }, changed: c.interval ? c.interval.changedFrom101 : c.v101.status === 'UNLOCKED', reasons: c.reasons })),
    cases };
  fs.writeFileSync(arg('out'), JSON.stringify(doc, null, 1) + '\n');
  for (const s of doc.summary) console.log(JSON.stringify(s));
}
if (require.main === module) main();
module.exports = { formRuns, strictCase, BUFFER };
