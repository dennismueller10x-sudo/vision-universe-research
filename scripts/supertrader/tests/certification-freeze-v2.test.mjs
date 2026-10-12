import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CERT = 'scripts/supertrader/research/certification';
const OLD = 'scripts/supertrader/research/tournament';
const TEST = 'scripts/supertrader/tests/certification-freeze-v2.test.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const contracts = [
  'ANNUAL-DERIVATION-APPROVALS.json', 'CERTIFICATION-POLICIES.json', 'SUPERTRADER-DATA-CONTRACTS.json',
  'SUPERTRADER-EXECUTION-CONTRACTS.json', 'SUPERTRADER-METHOD-ELIGIBILITY.json',
  'SUPERTRADER-PIT-COVERAGE.json', 'ANNUAL-FACT-CERTIFICATION-CONTRACT.json',
  'EXECUTION-CERTIFICATION-CONTRACT.json', 'SUPERTRADER-INDUSTRY-RESIDUAL-CONTRACT-PROOF.json',
];
const original = JSON.parse(fs.readFileSync(path.join(ROOT, OLD, 'SUPERTRADER-METHOD-FREEZES.json')));
const originalBytes = fs.readFileSync(path.join(ROOT, OLD, 'SUPERTRADER-METHOD-FREEZES.json'));
const eligibility = {schema: 'ISOLATED_SYNTHETIC_TEST', methods: original.methods.map(m => ({
  id: m.id, eligibility: m.historicalAdmission === 'BLOCKED_DATA' ? 'BLOCKED' : m.id === 'LOW_VOLATILITY' ? 'PARTIAL' : 'ELIGIBLE',
}))};
const receipts = [{role: 'SYNTHETIC_TEST_INPUT', sha256: hash('synthetic fixture, not a provider dataset')}];
const review = {status: 'PASS', performanceInspected: false, scope: 'ISOLATED_SYNTHETIC_TEST_NOT_POPULATION_CERTIFICATION'};

/** Copy public frozen code only; never copy prices, stock lists or the live .git. */
async function isolatedFixture(body) {
  const privateRoot = '/workspace/private/certification';
  fs.mkdirSync(privateRoot, {recursive: true});
  const root = fs.mkdtempSync(path.join(privateRoot, 'freeze-v2-test-'));
  try {
    const safePaths = new Set([
      ...Object.keys(original.files).map(file => `${OLD}/${file}`),
      ...Object.keys(original.dependencies), `${OLD}/SUPERTRADER-METHOD-FREEZES.json`, `${OLD}/SUPERTRADER-LEGENDARY-SOURCE-MAP.json`, TEST,
      ...fs.readdirSync(path.join(ROOT, CERT)).filter(file => /\.(?:mjs|py)$/.test(file)).map(file => `${CERT}/${file}`),
    ]);
    for (const relative of safePaths) {
      const destination = path.join(root, relative);
      fs.mkdirSync(path.dirname(destination), {recursive: true});
      fs.copyFileSync(path.join(ROOT, relative), destination);
    }
    // These contracts deliberately contain no real certification or measurement.
    for (const name of contracts) {
      const payload = name === 'SUPERTRADER-METHOD-ELIGIBILITY.json' ? eligibility : {
        schema: 'ISOLATED_SYNTHETIC_TEST', certificationState: 'PARTIAL',
        fees: {slippageBpsPerSide: 10, commissionBpsPerSide: 1},
        fixtureOnly: true,
      };
      fs.writeFileSync(path.join(root, CERT, name), JSON.stringify(payload));
    }
    fs.mkdirSync(path.join(root, CERT, 'reviews'), {recursive: true});
    fs.writeFileSync(path.join(root, CERT, 'reviews', 'SYNTHETIC-PREMEASUREMENT.json'), JSON.stringify(review));
    execFileSync('git', ['init', '--quiet'], {cwd: root, stdio: 'pipe'});
    execFileSync('git', ['add', '--all'], {cwd: root, stdio: 'pipe'});
    execFileSync('git', ['-c', 'user.name=Isolated certification test', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic freeze fixture'], {cwd: root, stdio: 'pipe'});
    const api = await import(pathToFileURL(path.join(root, CERT, 'freeze-v2.mjs')).href);
    await body({root, api, eligibility: structuredClone(eligibility), inputReceipts: structuredClone(receipts), premeasurementReview: structuredClone(review)});
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}
const create = ({api, eligibility, inputReceipts, premeasurementReview}) => api.createFreezeV2({eligibility, inputReceipts, premeasurementReview});

test('v2 keeps the exact #589 original freeze and all ten original rulebook hashes', async () => {
  await isolatedFixture(ctx => {
    const f = create(ctx);
    assert.equal(ctx.api.assertFreezeV2(f), true);
    assert.equal(f.originalFreeze.sha256, hash(originalBytes));
    assert.equal(f.protocolHash, original.protocolHash);
    assert.equal(f.strategyDefinitionsChanged, false);
    assert.equal(f.frozenBeforeRerunPerformance, true);
    assert.equal(f.methods.length, 10);
    for (const m of original.methods) {
      const v2 = f.methods.find(row => row.id === m.id);
      assert.equal(v2.rulebookHash, m.rulebookHash);
      assert.equal(v2.originalRulebookHash, m.rulebookHash);
    }
    assert.equal(fs.readFileSync(path.join(ctx.root, OLD, 'SUPERTRADER-METHOD-FREEZES.json')).equals(originalBytes), true);
  });
});

test('blocked models stay out of participants; partial admitted models stay visible', async () => {
  await isolatedFixture(ctx => {
    const f = create(ctx);
    const blocked = ctx.eligibility.methods.filter(row => row.eligibility === 'BLOCKED').map(row => row.id);
    for (const id of blocked) assert.equal(f.participants.includes(id), false);
    assert.equal(f.participants.includes('LOW_VOLATILITY'), true);
    assert.equal(f.participants.length, 6);
    const bad = structuredClone(ctx.eligibility);
    bad.methods.push({id: 'industry_momentum', eligibility: 'ELIGIBLE'});
    assert.throws(() => ctx.api.createFreezeV2({...ctx, eligibility: bad}), /UNDEFINED_METHOD_CANNOT_MEASURE/);
  });
});

test('actual isolated data, execution, cost and universe contract mutations invalidate the freeze', async () => {
  await isolatedFixture(ctx => {
    const f = create(ctx);
    const changes = [
      [`${CERT}/SUPERTRADER-DATA-CONTRACTS.json`, x => { x.certificationState = 'VERIFIED'; }],
      [`${CERT}/SUPERTRADER-EXECUTION-CONTRACTS.json`, x => { x.executionTiming = 'SAME_BAR_OPEN'; }],
      [`${CERT}/CERTIFICATION-POLICIES.json`, x => { x.fees.slippageBpsPerSide = 0; }],
      [`${CERT}/SUPERTRADER-PIT-COVERAGE.json`, x => { x.completeRepresentativeDenominator = true; }],
    ];
    for (const [relative, mutate] of changes) {
      assert.ok(f.files[relative], `${relative} must be bound`);
      const target = path.join(ctx.root, relative), saved = fs.readFileSync(target);
      try {
        const value = JSON.parse(saved); mutate(value); fs.writeFileSync(target, JSON.stringify(value));
        assert.throws(() => ctx.api.assertFreezeV2(f), /CERTIFICATION_FROZEN_COMPONENT_CHANGED/);
      } finally { fs.writeFileSync(target, saved); }
      assert.equal(ctx.api.assertFreezeV2(f), true);
    }
    const module = path.join(ctx.root, CERT, 'market-equity.mjs'), saved = fs.readFileSync(module);
    try {
      fs.appendFileSync(module, '\n// isolated source-contract mutation\n');
      assert.throws(() => ctx.api.assertFreezeV2(f), /CERTIFICATION_FROZEN_COMPONENT_CHANGED/);
    } finally { fs.writeFileSync(module, saved); }
  });
});

test('original freeze manifest and original protocol mutations remain detectable', async () => {
  await isolatedFixture(ctx => {
    const f = create(ctx);
    const manifest = path.join(ctx.root, OLD, 'SUPERTRADER-METHOD-FREEZES.json'), saved = fs.readFileSync(manifest);
    try {
      const value = JSON.parse(saved); value.protocolHash = '0'.repeat(64); fs.writeFileSync(manifest, JSON.stringify(value));
      assert.throws(() => ctx.api.assertFreezeV2(f), /ORIGINAL_FREEZE_CHANGED/);
    } finally { fs.writeFileSync(manifest, saved); }
    const protocol = path.join(ctx.root, OLD, 'protocol.json'), bytes = fs.readFileSync(protocol);
    try {
      const value = JSON.parse(bytes); value.execution.commissionBpsPerSide = 0; fs.writeFileSync(protocol, JSON.stringify(value));
      assert.throws(() => ctx.api.assertFreezeV2(f), /FROZEN_CODE_CHANGED/);
    } finally { fs.writeFileSync(protocol, bytes); }
  });
});

test('creation refuses missing source receipts and absent, failed or post-performance reviews', async () => {
  await isolatedFixture(ctx => {
    for (const inputReceipts of [undefined, []]) assert.throws(() => ctx.api.createFreezeV2({...ctx, inputReceipts}), /CERTIFICATION_AND_INPUT_RECEIPTS_REQUIRED/);
    for (const inputReceipts of [[{role: 'SYNTHETIC_TEST_INPUT'}], [{sha256: 'a'.repeat(64)}], [{role: 'SYNTHETIC_TEST_INPUT', sha256: 'not-a-digest'}]]) assert.throws(() => ctx.api.createFreezeV2({...ctx, inputReceipts}), /SOURCE_RECEIPT_HASH_REQUIRED/);
    for (const premeasurementReview of [undefined, {status: 'FAILED', performanceInspected: false}, {status: 'PASS', performanceInspected: true}, {status: 'PASS'}]) assert.throws(() => ctx.api.createFreezeV2({...ctx, premeasurementReview}), /INDEPENDENT_PREMEASUREMENT_REVIEW_REQUIRED/);
  });
});

test('loaded manifests cannot shed receipts/review or substitute a protocol hash', async () => {
  await isolatedFixture(ctx => {
    const f = create(ctx);
    const noReceipts = structuredClone(f); delete noReceipts.inputReceipts;
    assert.throws(() => ctx.api.assertFreezeV2(noReceipts), /CERTIFICATION_AND_INPUT_RECEIPTS_REQUIRED|SOURCE_RECEIPT_HASH_REQUIRED/);
    const noReview = structuredClone(f); delete noReview.premeasurementReview;
    assert.throws(() => ctx.api.assertFreezeV2(noReview), /INDEPENDENT_PREMEASUREMENT_REVIEW_REQUIRED/);
    const protocol = structuredClone(f); protocol.protocolHash = '0'.repeat(64);
    assert.throws(() => ctx.api.assertFreezeV2(protocol), /PROTOCOL_CHANGED|PROTOCOL_HASH_CHANGED|ORIGINAL_PROTOCOL_HASH_CHANGED/);
  });
});

test('loaded manifest cannot promote a blocked model or change a method definition hash', async () => {
  await isolatedFixture(ctx => {
    const f = create(ctx);
    const blocked = f.methods.find(row => row.eligibility === 'BLOCKED'); assert.ok(blocked);
    const changedParticipants = structuredClone(f); changedParticipants.participants.push(blocked.id);
    assert.throws(() => ctx.api.assertFreezeV2(changedParticipants), /PARTICIPANT|ELIGIBILITY/);
    for (const key of ['rulebookHash', 'originalRulebookHash']) {
      const changed = structuredClone(f); changed.methods[0][key] = '0'.repeat(64);
      assert.throws(() => ctx.api.assertFreezeV2(changed), /STRATEGY_DEFINITION_CHANGED/);
    }
  });
});

test('all ten engine eligibility rows are required and duplicated identities are rejected', async () => {
  await isolatedFixture(ctx => {
    const incomplete = structuredClone(ctx.eligibility); incomplete.methods.pop();
    assert.throws(() => ctx.api.createFreezeV2({...ctx, eligibility: incomplete}), /ALL_ENGINE_ELIGIBILITY_ROWS_REQUIRED/);
    const duplicate = structuredClone(ctx.eligibility); duplicate.methods.push({...duplicate.methods[0]});
    assert.throws(() => ctx.api.createFreezeV2({...ctx, eligibility: duplicate}), /ALL_ENGINE_ELIGIBILITY_ROWS_REQUIRED/);
    const f = create(ctx); f.eligibility.methods.pop();
    assert.throws(() => ctx.api.assertFreezeV2(f), /ALL_ENGINE_ELIGIBILITY_ROWS_REQUIRED/);
  });
});

test('loaded manifest cannot omit a cost binding or add duplicate rulebook identities', async () => {
  await isolatedFixture(ctx => {
    const f = create(ctx), noCostBinding = structuredClone(f);
    delete noCostBinding.files[`${CERT}/CERTIFICATION-POLICIES.json`];
    assert.throws(() => ctx.api.assertFreezeV2(noCostBinding), /FROZEN_COMPONENT|COMPONENT_BINDING|CERTIFICATION_FILE|FROZEN_FILE|COMPONENT_FILES/);
    const duplicated = structuredClone(f); duplicated.methods.push({...duplicated.methods[0]});
    assert.throws(() => ctx.api.assertFreezeV2(duplicated), /METHOD|ENGINE|STRATEGY/);
  });
});

test('coherent embedded participant promotion cannot override the hashed eligibility contract', async () => {
  await isolatedFixture(ctx => {
    const f = create(ctx);
    const blocked = f.eligibility.methods.find(row => row.eligibility === 'BLOCKED'); assert.ok(blocked);
    blocked.eligibility = 'PARTIAL';
    f.methods.find(row => row.id === blocked.id).eligibility = 'PARTIAL';
    f.participants = f.eligibility.methods.filter(row => ['ELIGIBLE', 'PARTIAL'].includes(row.eligibility)).map(row => row.id);
    assert.throws(() => ctx.api.assertFreezeV2(f), /ELIGIBILITY/);
  });
});
