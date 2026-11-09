#!/usr/bin/env node
'use strict';
// V12 MCAP: correction note after the independent V12 review (findings MCAP MAJOR 1, m3). Reads only committed evidence files
// (SEC samples, adjudication, rule 1.0.8, impact-1.0.0) and - for the value-score breakdown - the private before/after panels.
// No rule, register or study result is changed; the rule files stay as frozen (their wrong statements are named here).
// Usage: node review-correction.cjs --panels <v12-private>/mcap [--out docs/quant-recovery/v12/mcap/review-correction-1.0.0.json]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../../..');
const D = path.join(ROOT, 'docs/quant-recovery/v12/mcap');
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const read = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(D, f))).digest('hex');
const r4 = x => +x.toFixed(4);

/** Wilson score interval (two-sided 95 %). */
function wilson(k, n, z = 1.959964) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { k, n, share: r4(p), lower95: r4((c - h) / d), upper95: r4((c + h) / d) };
}

function freshValidation() {
  const adj = read('sec-adjudication-validation.json').cases, sample = read('sec-sample-validation.json').results;
  const dev = ['sec-sample-development.json', 'sec-sample-development-2.json'].flatMap(f => read(f).results);
  const devAcc = new Set(dev.map(r => r.accession)), devSid = new Set(dev.map(r => r.securityId));
  const sel = new Map(sample.map(r => [r.accession, r]));
  const count = cs => {
    const c = { sampledCorrections_1_0_7: cs.length, correct: 0, wrong: 0, unconfirmed: 0, stillCorrected_1_0_8: 0, stillCorrectedCorrect: 0, stillCorrectedWrong: 0, stillCorrectedUnconfirmed: 0 };
    for (const x of cs) {
      c[x.adjudication.toLowerCase()]++;
      if (x.statusUnderRule1_0_8 === 'CORRECTED') { c.stillCorrected_1_0_8++; c['stillCorrected' + x.adjudication[0] + x.adjudication.slice(1).toLowerCase()]++; }
    }
    c.wilson_1_0_7_correctOfSampled = wilson(c.correct, c.sampledCorrections_1_0_7);
    c.wilson_1_0_8_correctOfStillCorrected = wilson(c.stillCorrectedCorrect, c.stillCorrected_1_0_8);
    return c;
  };
  const named = x => sel.get(x.accession).selection === 'NAMED';
  const obsFresh = adj.filter(x => !named(x) && !devAcc.has(x.accession));
  const issuerFresh = obsFresh.filter(x => !devSid.has(x.securityId));
  return {
    definition: 'Validation sample of rule 1.0.7 (56 observations, 34 sampled corrections) without overlap with the development samples: (a) observation level - drop the 6 named cases (inspected before rule 1.0.0 and present in every sample) and every accession that is also in sec-sample-development.json or sec-sample-development-2.json; (b) issuer level (stricter) - additionally drop every issuer (securityId) that appears in a development sample. Unconfirmed counts as not confirmed.',
    all: count(adj), observationLevelFresh: count(obsFresh), issuerLevelFresh: count(issuerFresh),
    reading: 'Only the observation-level fresh subset is an out-of-sample check of rule 1.0.7; for 1.0.8 (decided after this sample, exclusions only) the still-corrected share is in-sample. 18 of 19 fresh corrections that 1.0.8 keeps are confirmed (the 19th is unconfirmed, none wrong); the Wilson lower bound is the honest summary, not the point share.'
  };
}

function valueScoreBreakdown(panels) {
  if (!panels) return { state: 'NOT_COMPUTED (no --panels)' };
  const P = require(path.join(ROOT, 'scripts/quant/v10/factor/panel.cjs'));
  const pb = P.readPanel(path.join(panels, 'before/panel.jsonl.gz'), { withRaws: true }), pa = P.readPanel(path.join(panels, 'after/panel.jsonl.gz'), { withRaws: true });
  const c = { rowsCompared: 0, withValueScoreBefore: 0, becameUnavailable: 0, becameAvailable: 0, scoreDiffers: 0, absDiffGt1Point: 0, absDiffGt5Points: 0, absDiffGt10Points: 0, marketCapChangedRowsWithScoreChange: 0, marketCapUnchangedRowsWithScoreChange: 0, scoreScale: [Infinity, -Infinity] };
  const fin = Number.isFinite;
  for (let i = 0; i < pb.dates.length; i++) {
    if (pb.dates[i].date !== pa.dates[i].date) throw Error('PANEL_DATE_MISMATCH');
    const ma = new Map(pa.dates[i].rows.map(r => [r.id, r]));
    for (const r of pb.dates[i].rows) {
      const q = ma.get(r.id); if (!q) continue; c.rowsCompared++;
      const a = r.scores?.value, b = q.scores?.value;
      if (fin(a)) { c.withValueScoreBefore++; c.scoreScale[0] = Math.min(c.scoreScale[0], a); c.scoreScale[1] = Math.max(c.scoreScale[1], a); }
      if (fin(a) && !fin(b)) { c.becameUnavailable++; continue; }
      if (!fin(a) && fin(b)) { c.becameAvailable++; continue; }
      if (!fin(a) || a === b) continue;
      c.scoreDiffers++; const d = Math.abs(a - b);
      if (d > 1) c.absDiffGt1Point++; if (d > 5) c.absDiffGt5Points++; if (d > 10) c.absDiffGt10Points++;
      if (r.marketCap !== q.marketCap) c.marketCapChangedRowsWithScoreChange++; else c.marketCapUnchangedRowsWithScoreChange++;
    }
  }
  c.scoreScale = c.scoreScale.map(r4);
  return c;
}

function main() {
  const out = arg('--out', path.join(D, 'review-correction-1.0.0.json'));
  const impact = read('impact-1.0.0.json');
  const fresh = freshValidation();
  const doc = {
    schemaVersion: 'v12-mcap-review-correction-1.0.0', strand: 'MCAP', kind: 'CORRECTION_AFTER_INDEPENDENT_REVIEW', evidenceKind: 'SOURCE_EVIDENCE', certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    inputs: Object.fromEntries(['sec-sample-validation.json', 'sec-adjudication-validation.json', 'sec-sample-development.json', 'sec-sample-development-2.json', 'rule-1.0.8.json', 'impact-1.0.0.json'].map(f => [f, sha(f)])),
    corrections: [
      { finding: 'MAJOR 1', subject: 'validation without overlap with the development samples', result: fresh },
      { finding: 'MAJOR 1', subject: 'wrong statement in rule-1.0.8.json (amendments[1.0.8].validation)', wrong: 'For 1.0.8 the sampled corrections that remain are 32/32 confirmed', correct: 'Of the 34 corrections sampled from register 1.0.7, 30 remain corrected under 1.0.8: 29 confirmed, 1 unconfirmed (LOCO 10-Q 2022), 0 wrong (sec-adjudication-validation.json summary.underRule1_0_8); in-sample. The rule file is frozen (sha256 sidecar) and is not edited; this note supersedes the sentence.',
        check: (() => { const s = read('sec-adjudication-validation.json').summary.underRule1_0_8; return { stillCorrected: s.stillCorrected, stillCorrectedAndCorrect: s.stillCorrectedAndCorrect }; })() },
      { finding: 'm3', subject: 'file names cited in the rule files that do not exist under that name', map: [
        { cited: 'docs/quant-recovery/v12/mcap/sec-sample-1.0.0.json (rule-1.0.6/1.0.7/1.0.8, first SEC sample, tag development, register 1.0.5)', file: 'docs/quant-recovery/v12/mcap/sec-sample-development.json' },
        { cited: 'docs/quant-recovery/v12/mcap/sec-sample-final.json (rule-1.0.7/1.0.8, second sample, tag final, register 1.0.6)', file: 'docs/quant-recovery/v12/mcap/sec-sample-development-2.json' },
        { cited: 'panel.jsonl.gz (README reproduction)', file: 'private, <scratchpad>/v12-private/mcap/{before,after}/panel.jsonl.gz and <scratchpad>/v10-private/factor/panel.jsonl.gz (sha256 in impact-1.0.0.json inputs) - not in the repository' }] },
      { finding: 'm3', subject: 'label rowsValueScoreChanged in impact-1.0.0.json', published: { rowsValueScoreChanged: impact.panel.rowsValueScoreChanged },
        correct: 'The counter counts every row whose value score differs by any amount. The value score is a cross-sectional percentile (scale in valueScoreBreakdown.scoreScale): removing or correcting a few market caps shifts the ranks of all rows of the date, so every row with a value score differs (identical to availability.value.before). It is not the number of rows changed by the correction; see valueScoreBreakdown.',
        valueScoreBreakdown: valueScoreBreakdown(arg('--panels')) }
    ],
    unchanged: 'Register 1.0.8, rule files 1.0.0-1.0.8, impact-1.0.0.json and every study result stay as published.'
  };
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ out: path.relative(ROOT, out), fresh: { obs: fresh.observationLevelFresh.wilson_1_0_8_correctOfStillCorrected, issuer: fresh.issuerLevelFresh.wilson_1_0_8_correctOfStillCorrected } }));
}
if (require.main === module) main();
module.exports = { wilson };
