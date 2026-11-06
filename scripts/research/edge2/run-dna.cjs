#!/usr/bin/env node
'use strict';
// Edge 2 Teil 4 – Gewinner-DNA (docs/research/edge2/dna/PROTOKOLL.json, SHA-256 gepinnt). Forschung, nicht zertifiziert.
//   node scripts/research/edge2/run-dna.cjs --phase learn --work-dir D --delisted-dir D --delisted-raw-dir D --fundamentals D --out O
//        -> O/RULE_FIXED.json (wird committet; nur Lifts und Zählungen)
//   node scripts/research/edge2/run-dna.cjs --phase test ... --out O   (verlangt gepinnte RULE_FIXED.json)
//        -> O/dna.public.json, O/dna.sealed.{owner,reviewer}.json
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const D = require('./dna.cjs');
const S = require('../edge/study.cjs');
const PIN = require('./protocol-pin.cjs');
const RULE_FILE = path.join(ROOT, 'docs/research/edge2/dna/RULE_FIXED.json');
const TEST = ['2021-01-01', '2026-10-02'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function args(argv) { const a = {}; for (let i = 2; i < argv.length; i++) { a[argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i++; } return a; }

async function main() {
  const a = args(process.argv), out = path.resolve(a.out || '');
  if (!a.out || out === ROOT || out.startsWith(ROOT + path.sep)) throw Error('OUT_OUTSIDE_REPOSITORY_REQUIRED');
  const pbytes = fs.readFileSync(path.join(ROOT, PIN.DNA_PROTOCOL_FILE));
  if (sha(pbytes) !== PIN.DNA_PROTOCOL_SHA256) throw Error('DNA_PROTOCOL_CHANGED');
  const MP = require(path.join(ROOT, 'scripts/quant/portfolio/model-portfolios.cjs')), E3 = require('../edge/run-e3.cjs');
  const panel = MP.buildPanel({ workDir: a.workDir, delistedDir: a.delistedDir, delistedRawDir: a.delistedRawDir, fundamentals: a.fundamentals, window: TEST, limit: Number(a.limit || 0) });
  if (!a.smoke && panel.basis !== 'TOTAL_RETURN') throw Error('TOTAL_RETURN_PANEL_REQUIRED');
  const testStart = panel.calendar.findIndex(d => d >= TEST[0]);
  const starts = D.quarterStarts(panel, '2016-01-01');
  fs.mkdirSync(out, { recursive: true });
  if (a.phase === 'learn') {
    const rule = D.learn(D.observations(panel, starts, testStart));
    const doc = { schema: 'vu-edge2-dna-rule-1.0.0', label: 'Forschung, nicht zertifiziert', variant: 'DNA-G1-FIXED', protocolSha256: PIN.DNA_PROTOCOL_SHA256, learnedFrom: [panel.calendar[starts[0]], panel.calendar[testStart]], data: panel.meta, runId: process.env.GITHUB_RUN_ID || 'local', ...rule };
    fs.writeFileSync(path.join(out, 'RULE_FIXED.json'), JSON.stringify(doc, null, 1) + '\n');
    console.log(JSON.stringify({ features: Object.keys(rule.features), rejected: Object.keys(rule.rejected).length, observations: rule.observations, ruleSha256: rule.ruleSha256 }));
    return;
  }
  if (a.phase !== 'test') throw Error('PHASE');
  const rb = fs.readFileSync(RULE_FILE);
  if (sha(rb) !== PIN.DNA_RULE_FIXED_SHA256) throw Error('RULE_FIXED_NOT_PINNED');
  const fixed = JSON.parse(rb);
  const bm = E3.benchmarks(MP), anchorDate = panel.calendar[testStart];
  const rollingCache = new Map();
  const rollingAt = t => {
    const y = panel.calendar[t].slice(0, 4);
    if (!rollingCache.has(y)) { const ty = panel.calendar.findIndex(d => d.slice(0, 4) === y); rollingCache.set(y, D.learn(D.observations(panel, starts, ty))); }
    return rollingCache.get(y);
  };
  const runAll = pan => {
    const res = [];
    for (const [id, ruleAt] of [['DNA-G1-FIXED', () => fixed], ['DNA-G2-ROLLING', rollingAt]]) {
      const r = D.runRule(pan, { window: TEST, anchorDate, ruleAt });
      const ev = r.state === 'RUN' ? E3.evaluate(r.equity, bm, MP) : null;
      let test = null; if (ev) { try { test = S.pairedTest(ev.returns, ev.spyReturns); } catch { test = null; } }
      res.push({ id, state: r.state, evaluation: ev ? { ...ev, returns: undefined, spyReturns: undefined } : null, test, weeklyReturns: ev ? ev.returns : null, equity: r.equity, costs: r.costs, turnover: r.turnover, terminalEvents: r.terminalEvents, rulesUsed: r.rulesUsed });
      console.log(JSON.stringify({ id, state: r.state }));
    }
    const hl = S.holm(res.map(x => (x.test ? x.test.pLog : 1))), hs = S.holm(res.map(x => (x.test ? x.test.pSharpe : 1)));
    res.forEach((x, i) => { x.pLogHolm = hl[i]; x.pSharpeHolm = hs[i]; x.verdict = x.test ? S.verdict(x.evaluation.strategy, x.evaluation.SPY, hl[i], hs[i]) : 'nicht bestimmbar (blockiert)'; });
    return res;
  };
  const primary = runAll(panel), { panel: dqp, census } = MP.applyDq(panel, 'DQ-K5-BOOK'), dq = runAll(dqp);
  const result = { schema: 'vu-edge2-dna-result-1.0.0', label: 'Forschung, nicht zertifiziert', protocolSha256: PIN.DNA_PROTOCOL_SHA256, ruleFixedSha256: PIN.DNA_RULE_FIXED_SHA256, primary, dqK5: { census, results: dq },
    rollingRules: Object.fromEntries([...rollingCache].map(([y, r]) => [y, { features: Object.keys(r.features), ruleSha256: r.ruleSha256, observations: r.observations }])), runId: process.env.GITHUB_RUN_ID || 'local' };
  const plain = Buffer.from(JSON.stringify(result)), L = await import(path.join(ROOT, 'scripts/supertrader/validation/lib.mjs'));
  fs.writeFileSync(path.join(out, 'dna.sealed.owner.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8'), plain));
  fs.writeFileSync(path.join(out, 'dna.sealed.reviewer.json'), L.encryptForOwner(fs.readFileSync(path.join(ROOT, 'docs/research/edge2/reviewer-public.pem'), 'utf8'), plain));
  const pub = { schema: 'vu-edge2-dna-public-1.0.0', label: result.label, protocolSha256: result.protocolSha256, ruleFixedSha256: result.ruleFixedSha256, tally: primary.reduce((o, x) => (o[x.verdict] = (o[x.verdict] || 0) + 1, o), {}), privateSha256: sha(plain), runId: result.runId };
  fs.writeFileSync(path.join(out, 'dna.public.json'), JSON.stringify(pub, null, 1) + '\n');
  console.log(JSON.stringify(pub));
}
if (require.main === module) main().catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
