import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildPublicArtifacts, buildPublicMarkdown, buildPrivateMarkdown, publishReport, publishPayload,
  PUBLIC_OUTPUT_NAMES} from '../research/tournament/publish-report.mjs';

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

test('reference dossiers remain in the universe but cannot enter source-confidence shortlists', () => {
  const {payload, metadata} = fixture();
  const excludedIds = ['robb_reinhold', 'richard_dennis', 'excluded_systematic_reference'];
  metadata.universe.candidates.push(
    ...excludedIds.slice(0, 2).map(id => ({id, type: 'REAL_TRADER_METHOD', reproducibility: 'LOW',
      source_coverage: 'HIGH', count_as_serious_dossier: false})),
    {id: excludedIds[2], type: 'SYSTEMATIC_STRATEGY', source_coverage: 'HIGH', reproducibility: 'HIGH'},
    {id: 'serious_educational_trader', type: 'REAL_TRADER_METHOD', reproducibility: 'LOW', source_coverage: 'HIGH'},
  );
  metadata.universe.counts.reference_or_excluded_ids = [excludedIds[2]];
  const artifacts = buildPublicArtifacts(payload, {}, metadata);
  const dossiers = artifacts['SUPERTRADER-IMPLEMENTED-CANDIDATES.json'].dossier_rows;
  assert.equal(dossiers.length, metadata.universe.candidates.length);
  for (const id of excludedIds) assert.equal(dossiers.find(d => d.dossier_id === id).disposition, 'REFERENCE_OR_EXCLUDED');
  const legendary = artifacts['SUPERTRADER-LEGENDARY-NONREPRODUCIBLE.json'];
  const systematic = artifacts['SUPERTRADER-SYSTEMATIC-HIGH-CONFIDENCE.json'];
  assert.deepEqual(legendary.methods.map(d => d.method_id), ['serious_educational_trader']);
  assert.deepEqual(systematic.methods.map(d => d.method_id), ['cross_sectional_momentum']);
  assert.equal(legendary.method_count, legendary.methods.length);
  assert.equal(systematic.method_count, systematic.methods.length);
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

test('assembled objects and file inputs publish identical projections and preserve every publication gate', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-object-'));
  try {
    const {payload, metadata} = fixture();
    const review = {status: 'PASSED', finalized: true, finalRankings: [{id: payload.results[0].id}]};
    const inputPath = path.join(directory, 'private-input.json'), reviewPath = path.join(directory, 'private-review.json');
    const ownersealedPath = path.join(directory, 'synthetic.owner.sealed.json');
    const seal = {schema: 'supertrader-sealed-1.0.0', alg: 'RSA-OAEP-256+A256GCM+gzip',
      wrappedKey: 'YQ==', iv: 'YQ==', tag: 'YQ==', body: 'YQ=='};
    const roots = ['file', 'object'].map(name => path.join(directory, name));
    for (const root of roots) {
      const metadataDir = path.join(root, 'scripts/supertrader/research/tournament');
      fs.mkdirSync(metadataDir, {recursive: true});
      for (const [name, value] of Object.entries({'SUPERTRADER-FULL-METHOD-UNIVERSE.json': metadata.universe,
        'SUPERTRADER-METHOD-FREEZES.json': metadata.freeze, 'SUPERTRADER-LEGENDARY-SOURCE-MAP.json': metadata.sourceMap})) {
        fs.writeFileSync(path.join(metadataDir, name), JSON.stringify(value));
      }
    }
    const calls = (value, assessment, extra = {}) => {
      fs.writeFileSync(inputPath, JSON.stringify(value), {mode: 0o600});
      fs.writeFileSync(reviewPath, JSON.stringify(assessment), {mode: 0o600});
      return [
        () => publishReport({inputPath, reviewPath, outRoot: roots[0], ownersealedPath, publish: true, ...extra}),
        () => publishPayload({payload: value, review: assessment, outRoot: roots[1], ownersealedPath,
          inputReference: inputPath, reviewReference: reviewPath, publish: true, ...extra}),
      ];
    };
    fs.writeFileSync(ownersealedPath, JSON.stringify(seal));
    const dryRuns = calls(payload, review, {publish: false}).map(call => call());
    assert.deepEqual(dryRuns[0], dryRuns[1]);
    assert.equal(fs.existsSync(path.join(roots[0], 'docs')), false);
    const written = calls(payload, review).map(call => call());
    assert.deepEqual(written[0], written[1]);
    assert.equal(written[0].artifact_count, 14);
    for (const name of PUBLIC_OUTPUT_NAMES) {
      const relative = path.join('scripts/supertrader/research/tournament', name);
      assert.equal(fs.readFileSync(path.join(roots[0], relative), 'utf8'), fs.readFileSync(path.join(roots[1], relative), 'utf8'), name);
    }
    const report = 'docs/SUPERTRADER_FULL_TOURNAMENT.md';
    assert.equal(fs.readFileSync(path.join(roots[0], report), 'utf8'), fs.readFileSync(path.join(roots[1], report), 'utf8'));
    const gates = [
      [payload, {...review, finalized: false}, {}, /FINAL_REVIEW_REQUIRED_BEFORE_PUBLICATION/],
      [payload, review, {ownersealedPath: null}, /OWNER_SEALED_ARTIFACT_REQUIRED/],
      [{...payload, results: []}, review, {}, /MEASUREMENT_RESULTS_REQUIRED/],
      [{...payload, freeze: {...payload.freeze, protocolHash: 'changed'}}, review, {}, /PAYLOAD_FREEZE_MISMATCH/],
      [payload, {...review, finalRankings: []}, {}, /FINAL_REVIEW_INCOMPLETE/],
      [payload, review, {privateReportPath: path.join(roots[0], 'private.md')}, /PRIVATE_REPORT_MUST_STAY_OUTSIDE_REPO/],
    ];
    // The private destination must be inside each call's own output root.
    for (const [value, assessment, extra, error] of gates) {
      const attempts = calls(value, assessment, extra);
      if (extra.privateReportPath) attempts[1] = () => publishPayload({payload: value, review: assessment,
        outRoot: roots[1], ownersealedPath, publish: true, privateReportPath: path.join(roots[1], 'private.md')});
      for (const attempt of attempts) assert.throws(attempt, error);
    }
    fs.writeFileSync(ownersealedPath, JSON.stringify({...seal, body: 'invalid private envelope'}));
    for (const attempt of calls(payload, review)) assert.throws(attempt, /VALID_OWNER_SEALED_ENVELOPE_REQUIRED/);
  } finally {fs.rmSync(directory, {recursive: true, force: true});}
});
