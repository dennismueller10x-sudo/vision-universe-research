import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildPublicArtifacts, buildPublicMarkdown, buildPrivateMarkdown} from '../research/tournament/publish-report.mjs';

function fixture() {
  const id = 'cross_sectional_momentum';
  const freeze = {protocolHash: 'same_protocol', files: {'data.mjs': 'original_code'},
    methods: [{id, historicalAdmission: 'ADMITTED_RESEARCH_ADAPTATION', rulebookHash: 'original_rules'}], dataBlocked: []};
  const metadata = {freeze, universe: {counts: {serious_external_candidates: 1}, candidates: [
    {id, type: 'SYSTEMATIC_STRATEGY', source_coverage: 'HIGH', reproducibility: 'HIGH', group: 'A'},
  ]}, sourceMap: {legendary_candidate_ids: []}};
  const payload = {freeze: structuredClone(freeze), results: [{id, signalMetrics: {totalSignals: 1},
    portfolioMetrics: {cagr: 0.123456789, trades: {n: 2, winRate: 0.5}},
    run: {signals: [{ticker: 'PRIVATE_SYMBOL', id: 'private_security_identity', price: 9876.54321}]} }],
    currentScans: [{id, status: 'READY', numberMatches: 1, candidates: [
      {ticker: 'PRIVATE_SYMBOL', id: 'private_security_identity', price: 9876.54321},
    ]}], consensus: {strongMethods: [{ticker: 'PRIVATE_SYMBOL', id: 'private_security_identity'}]}};
  return {payload, metadata};
}

test('publication binds the whole freeze, including code and rulebooks sharing a protocol', () => {
  for (const change of [p => {p.freeze.files['data.mjs'] = 'different_code';},
    p => {p.freeze.methods[0].rulebookHash = 'different_rules';}, p => {delete p.freeze;}]) {
    const {payload, metadata} = fixture(); change(payload);
    assert.throws(() => buildPublicArtifacts(payload, {}, metadata), /PAYLOAD_FREEZE_(MISMATCH|REQUIRED)/);
  }
  const {payload, metadata} = fixture();
  payload.freeze = {dataBlocked: [], methods: payload.freeze.methods, files: payload.freeze.files, protocolHash: payload.freeze.protocolHash};
  assert.doesNotThrow(() => buildPublicArtifacts(payload, {}, metadata));
  assert.doesNotThrow(() => buildPublicArtifacts({}, {}, metadata));
});

test('public projections and Markdown exclude supplied private identities and numerical metrics', () => {
  const {payload, metadata} = fixture();
  const publicText = JSON.stringify(buildPublicArtifacts(payload, {}, metadata)) + buildPublicMarkdown(payload, {}, metadata);
  for (const privateValue of ['PRIVATE_SYMBOL', 'private_security_identity', '0.123456789', '9876.54321']) {
    assert.equal(publicText.includes(privateValue), false);
  }
  const scan = buildPublicArtifacts(payload, {}, metadata)['SUPERTRADER-CURRENT-CANDIDATES.json'].methods[0];
  assert.equal(scan.match_count, 1);
  payload.currentScans[0].status = 'BLOCKED_DATA';
  assert.equal(buildPublicArtifacts(payload, {}, metadata)['SUPERTRADER-CURRENT-CANDIDATES.json'].methods[0].match_count, null);
});

test('private report explains partial exit records without treating them as independent trades', () => {
  const {payload} = fixture();
  const markdown = buildPrivateMarkdown(payload);
  assert.match(markdown, /Counts and win rates include partial exits/);
  assert.match(markdown, /Realized exit records/);
  assert.doesNotMatch(markdown, /Closed trades|Closed-trade comparison/);
});

test('malformed private input produces only a generic CLI failure', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-review-'));
  try {
    const input = path.join(directory, 'private.json');
    fs.writeFileSync(input, '{"PRIVATE_LEAK_SENTINEL": invalid}', {mode: 0o600});
    const script = fileURLToPath(new URL('../research/tournament/publish-report.mjs', import.meta.url));
    const run = spawnSync(process.execPath, [script, '--inputPath', input, '--reviewPath', input, '--outRoot', directory], {encoding: 'utf8'});
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    assert.equal(run.stderr, 'PUBLICATION_FAILED\n');
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});
