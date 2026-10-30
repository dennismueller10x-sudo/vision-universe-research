// Internal backtest preview (backtest-preview-1.0.0): disabled by default, not wired, numbers only in internalPreview mode,
// numbers equal the committed runner envelopes, data-quality limits for every kind, no certification change, no alpha wording,
// renderer never writes into the repository. docs/quant/BACKTEST_PREVIEW.md
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(import.meta.dirname, '..', '..');
const S = require('../api/backtest-preview-service.cjs');
const Contract = require('../engines/backtest-result-contract.cjs');
const Build = require('../../scripts/quant/research/build-backtest-preview.cjs');
const Render = require('../../scripts/quant/research/render-backtest-preview.cjs');
const CERT_PATH = 'quant/data/product/backtest-certification-v1.json';
const DEMOS = path.join(ROOT, 'docs/quant/backtest-demos');
const COMMITTED = path.join(ROOT, 'docs/quant/backtest-preview/backtest-preview.json');
const readJson = p => JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));
const cert = readJson(CERT_PATH);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vu-backtest-preview-'));
const ON = { enabled: true, audience: 'INTERNAL_REVIEW' };
const fresh = Build.build({ demos: 'docs/quant/backtest-demos', certification: CERT_PATH, extra: [] });
const cases = doc => doc.kinds.flatMap(k => k.cases);
const result = id => readJson(path.join('docs/quant/backtest-demos/results', id + '.json'));

test('disabled by default: no config, wrong audience, non-boolean flags and the frozen default all answer DISABLED', () => {
  assert.deepEqual(S.DEFAULT_CONFIG, { enabled: false, audience: 'INTERNAL_REVIEW' });
  assert.ok(Object.isFrozen(S.DEFAULT_CONFIG));
  for (const options of [undefined, {}, { certification: cert, internalPreview: true }, { backtestPreview: S.DEFAULT_CONFIG, internalPreview: true },
    { backtestPreview: { enabled: true }, internalPreview: true }, { backtestPreview: { enabled: 'true', audience: 'INTERNAL_REVIEW' } },
    { backtestPreview: { enabled: true, audience: 'PUBLIC' }, internalPreview: true }, { backtestPreview: { enabled: true, audience: 'INTERNAL' } }]) {
    const v = S.getBacktestPreview(fresh, options);
    assert.equal(v.state, 'DISABLED'); assert.equal(v.reason, 'BACKTEST_PREVIEW_DISABLED');
    assert.equal(v.productionApproved, false); assert.equal(v.publiclyActivated, false); assert.equal('kinds' in v, false);
  }
});

test('enabled without internalPreview shows status and limits but no numbers; internalPreview adds the numbers, always RESEARCH', () => {
  const status = S.getBacktestPreview(fresh, { backtestPreview: ON, certification: cert });
  assert.equal(status.state, 'AVAILABLE'); assert.equal(status.mode, 'STATUS_ONLY'); assert.equal(status.internalPreview, false);
  const numbers = S.getBacktestPreview(fresh, { backtestPreview: ON, certification: cert, internalPreview: true });
  assert.equal(numbers.mode, 'INTERNAL_NUMBERS');
  for (const v of [status, numbers]) {
    assert.equal(v.label, 'RESEARCH'); assert.equal(v.trust, 'NOT_PRODUCT_TRUST'); assert.equal(v.certification, 'NOT_CERTIFIED');
    assert.equal(v.productionApproved, false); assert.equal(v.publiclyActivated, false); assert.equal(v.claim, 'NO_ALPHA_OR_CERTIFICATION_CLAIM');
    assert.deepEqual(v.kinds.map(k => k.kind), S.KINDS);
    for (const c of v.kinds.flatMap(k => k.cases)) {
      assert.equal(c.display.productAllowed, false); assert.equal(c.display.trust, 'NOT_PRODUCT_TRUST'); assert.equal(c.productionApproved, false);
      assert.ok(c.limitations.length && c.dataQuality.warnings.length, c.id);
    }
  }
  for (const c of status.kinds.flatMap(k => k.cases)) for (const f of S.NUMBER_FIELDS) assert.equal(c[f], null, c.id + '.' + f);
  for (const c of numbers.kinds.flatMap(k => k.cases)) assert.deepEqual(c.metrics, result(c.id).envelope.metrics);
  const one = S.getBacktestPreview(fresh, { backtestPreview: ON, certification: cert, kind: 'SETUP_BACKTEST' });
  assert.deepEqual(one.kinds.map(k => k.kind), ['SETUP_BACKTEST']);
  assert.equal(S.getBacktestPreview(fresh, { backtestPreview: ON, certification: cert, kind: 'MARKET_PATTERN_BACKTEST' }).reason, 'UNKNOWN_KIND');
});

test('numbers equal the committed runner envelopes (metrics, uncertainty, events, methods, hashes); nothing is recomputed', () => {
  const summary = readJson('docs/quant/backtest-demos/summary.json');
  const meta = readJson('docs/quant/backtest-demos/cases.json');
  assert.deepEqual(cases(fresh).map(c => c.id).sort(), meta.cases.map(c => c.id).sort());
  for (const c of cases(fresh)) {
    const r = result(c.id), e = r.envelope;
    assert.deepEqual(c.metrics, e.metrics, c.id); assert.deepEqual(c.uncertainty, e.uncertainty, c.id);
    for (const f of ['occurrences', 'completed', 'immature', 'censored', 'ineligible', 'titles']) assert.equal(c.events[f], e.events[f], c.id + '.' + f);
    assert.deepEqual(c.methods, e.methods.map(m => ({ method: m.method, state: m.state, result: m.result })), c.id);
    assert.deepEqual(c.limitations, e.limitations); assert.deepEqual(c.dataQuality.warnings, e.dataQuality.warnings);
    assert.deepEqual(c.benchmark.definition, e.metrics.benchmark); assert.equal(c.benchmark.requested, r.spec.benchmark);
    assert.deepEqual(c.hashes, { specHash: r.specHash, inputHash: r.inputHash, envelopeHash: r.envelopeHash, resultHash: r.resultHash });
    assert.deepEqual(c.pit, r.pit); assert.equal(c.state, r.state);
    assert.deepEqual(c.funded, summary.cases.find(s => s.id === c.id).funded);
  }
});

test('every kind carries data-quality limits, certification status and its case states; A never becomes C', () => {
  assert.deepEqual(fresh.kinds.map(k => k.kind), S.KINDS);
  for (const k of fresh.kinds) {
    assert.ok(k.cases.length > 0, k.kind); assert.ok(k.dataQualityLimits.length > 0, k.kind); assert.ok(k.limitations.includes('NO_ALPHA_OR_CERTIFICATION_CLAIM'), k.kind);
    assert.equal(k.certification.status, cert.kinds.find(x => x.id === k.kind).status);
    assert.notEqual(k.state, 'PRODUCT_CERTIFIED'); assert.equal(k.states.C, 0);
    for (const c of k.cases) {
      assert.ok(['A', 'B'].includes(c.stateCode), c.id);
      if (c.stateCode === 'A') assert.notEqual(c.metrics.basis, 'NONE', c.id);
      if (c.stateCode === 'B') { assert.equal(c.metrics.basis, 'NONE', c.id); assert.ok(c.missingInputs.length > 0, c.id); }
    }
  }
  assert.deepEqual(fresh.certification.certifiedKinds, []);
  assert.equal(fresh.kinds.find(k => k.kind === 'STRATEGY_BACKTEST').states.B, 1);
});

test('PRODUCT_CERTIFIED needs the certification artifact: refused without it, with a spoofed or non-certifying artifact', () => {
  const promoted = structuredClone(fresh);
  const c = promoted.kinds[2].cases[0]; c.state = 'PRODUCT_CERTIFIED'; c.stateCode = 'C';
  promoted.previewHash = S.sha((({ previewHash, ...rest }) => rest)(promoted));
  assert.equal(S.getBacktestPreview(promoted, { backtestPreview: ON, certification: cert }).reason, 'PRODUCT_CERTIFICATION_NOT_PROVEN');
  assert.equal(S.getBacktestPreview(promoted, { backtestPreview: ON }).state, 'UNAVAILABLE');
  const spoof = structuredClone(cert); spoof.kinds.find(k => k.id === 'SIGNAL_BACKTEST').status = 'CERTIFIED';
  assert.equal(S.getBacktestPreview(promoted, { backtestPreview: ON, certification: spoof }).state, 'UNAVAILABLE');
  assert.throws(() => S.buildPreview({ cases: [], results: {}, certification: spoof }), /CERTIFICATION_ARTIFACT_VIOLATES_ITS_CONTRACT/);
  /* A runner envelope promoted to C without a certifying artifact is refused by the existing research adapter during the build. */
  const r = result('signal-2008-crash'); const e = structuredClone(r.envelope);
  e.status.state = 'PRODUCT_CERTIFIED'; e.status.certificationStatus = 'CERTIFIED'; const sealed = Contract.seal(e);
  const forged = { ...r, state: 'PRODUCT_CERTIFIED', envelope: sealed, envelopeHash: sealed.envelopeHash };
  assert.throws(() => S.buildPreview({ cases: [{ id: r.spec.id, kind: r.kind }], results: { [r.spec.id]: forged }, certification: cert }), /ENVELOPE_REFUSED_BY_RESEARCH_ADAPTER/);
});

test('tampering and a changed certification status fail closed', () => {
  const t = structuredClone(fresh); t.kinds[0].cases[0].metrics.hitRate = 1;
  assert.ok(S.getBacktestPreview(t, { backtestPreview: ON, certification: cert }).errors.includes('PREVIEW_HASH_MISMATCH'));
  const activated = structuredClone(fresh); activated.productionApproved = true;
  assert.equal(S.getBacktestPreview(activated, { backtestPreview: ON, certification: cert }).reason, 'PREVIEW_CONTRACT_VIOLATED');
  const changed = structuredClone(cert); const k = changed.kinds.find(x => x.id === 'SETUP_BACKTEST'); k.blockers = k.blockers.slice(1);
  assert.ok(S.getBacktestPreview(fresh, { backtestPreview: ON, certification: changed }).errors.includes('CERTIFICATION_STATUS_CHANGED_REBUILD_PREVIEW'));
  /* A regenerated artifact with unchanged statuses (new timestamps) keeps the preview valid. */
  const regenerated = { ...structuredClone(cert), generatedAt: '2099-01-01T00:00:00.000Z', asOf: '2099-01-01' };
  assert.equal(S.getBacktestPreview(fresh, { backtestPreview: ON, certification: regenerated }).state, 'AVAILABLE');
});

test('committed preview artifact is reproducible from the committed demos and passes the independent Python check (python3 -I)', () => {
  const dir = tmp();
  try {
    const out = path.join(dir, 'preview.json');
    const certBefore = fs.readFileSync(path.join(ROOT, CERT_PATH));
    execFileSync(process.execPath, ['scripts/quant/research/build-backtest-preview.cjs', '--out', out], { cwd: ROOT, encoding: 'utf8' });
    assert.ok(fs.readFileSync(path.join(ROOT, CERT_PATH)).equals(certBefore), 'certification artifact bytes unchanged');
    assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(COMMITTED, 'utf8'), 'rebuild docs/quant/backtest-preview/backtest-preview.json with build-backtest-preview.cjs');
    const report = path.join(dir, 'report.json');
    execFileSync('python3', ['-I', path.join(ROOT, 'scripts/quant/verify-backtest-preview.py'), '--preview', out, '--demos', DEMOS, '--certification', path.join(ROOT, CERT_PATH), '--out', report], { encoding: 'utf8' });
    const r = JSON.parse(fs.readFileSync(report, 'utf8')); assert.equal(r.ok, true, r.findings.join(',')); assert.equal(r.checkedCases, 16);
    assert.throws(() => execFileSync(process.execPath, ['scripts/quant/research/build-backtest-preview.cjs', '--out', 'quant/data/product/x.json'], { cwd: ROOT, stdio: 'pipe' }), /OUT_INSIDE_GENERATED_DATA/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('no alpha or outperformance wording in the preview, its views or the renderings', () => {
  const dir = tmp();
  try {
    const texts = [JSON.stringify(fresh), JSON.stringify(S.getBacktestPreview(fresh, { backtestPreview: ON, certification: cert, internalPreview: true }))];
    for (const f of ['a.md', 'b.html']) {
      const out = path.join(dir, f);
      Render.main(['--enable', '--internal-preview', '--out', out]);
      texts.push(fs.readFileSync(out, 'utf8'));
    }
    for (const t of texts) for (const re of Contract.ALPHA_CLAIM_PATTERNS) assert.equal(re.test(t.replace(/NO_ALPHA_OR_CERTIFICATION_CLAIM/g, '')), false, String(re));
    for (const f of ['quant/api/backtest-preview-service.cjs', 'scripts/quant/research/render-backtest-preview.cjs', 'docs/quant/BACKTEST_PREVIEW.md']) {
      const t = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/NO_ALPHA_OR_CERTIFICATION_CLAIM/g, '').replace(/ALPHA_CLAIM_PATTERNS/g, '');
      for (const re of Contract.ALPHA_CLAIM_PATTERNS.slice(1)) assert.equal(re.test(t), false, f + ' ' + re);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('renderer: DISABLED without --enable, numbers only with --internal-preview, refuses any output inside the repository', () => {
  const dir = tmp();
  const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  try {
    const off = path.join(dir, 'off.md'), status = path.join(dir, 'status.md'), nums = path.join(dir, 'nums.html');
    Render.main(['--out', off]); Render.main(['--enable', '--out', status]); Render.main(['--enable', '--internal-preview', '--out', nums]);
    assert.match(fs.readFileSync(off, 'utf8'), /DISABLED · BACKTEST_PREVIEW_DISABLED/);
    const s = fs.readFileSync(status, 'utf8'); assert.match(s, /Modus STATUS_ONLY/); assert.equal(s.includes('86,5 %'), false);
    const h = fs.readFileSync(nums, 'utf8'); assert.match(h, /Modus INTERNAL_NUMBERS/); assert.ok(h.includes('86,5 %')); assert.ok(h.startsWith('<!doctype html>'));
    for (const bad of ['x.md', 'docs/quant/backtest-preview/x.html', 'quant/data/x.md', path.join(ROOT, 'y.md')])
      assert.throws(() => Render.parse(['--out', bad]), /OUT_INSIDE_REPOSITORY/);
    assert.throws(() => Render.parse(['--out', path.join(dir, 'x.json')]), /OUT_MUST_END_IN_MD_OR_HTML/);
    assert.throws(() => execFileSync(process.execPath, ['scripts/quant/research/render-backtest-preview.cjs', '--enable', '--out', 'z.md'], { cwd: ROOT, stdio: 'pipe' }), /OUT_INSIDE_REPOSITORY/);
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('isolation: the preview service is reached only by its two offline tools; no product path, view, endpoint or workflow', () => {
  const grep = needle => { try { return execFileSync('git', ['grep', '--untracked', '-l', '-F', needle, '--', '.', ':!quant/data', ':!discover/data', ':!supertrader/data', ':!social/data'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch (e) { if (e.status === 1) return []; throw e; } };
  const outside = files => files.filter(f => !f.startsWith('quant/tests/') && !f.startsWith('docs/'));
  assert.deepEqual(outside(grep('backtest-preview-service')).sort(), ['scripts/quant/research/build-backtest-preview.cjs', 'scripts/quant/research/render-backtest-preview.cjs']);
  assert.deepEqual(outside(grep('build-backtest-preview')).sort(), ['scripts/quant/research/build-backtest-preview.cjs']);
  assert.deepEqual(outside(grep('render-backtest-preview')).sort(), ['scripts/quant/research/render-backtest-preview.cjs']);
  assert.deepEqual(outside(grep('backtest-preview/backtest-preview.json')).sort(), ['scripts/quant/research/render-backtest-preview.cjs']);
  for (const f of ['quant/api/product-services.js', 'quant/index.html', 'quant/app/page-backtest.js', 'quant/api/real-backtest-service.cjs'])
    for (const needle of ['backtest-preview', 'backtestPreview', 'getBacktestPreview']) assert.equal(fs.readFileSync(path.join(ROOT, f), 'utf8').includes(needle), false, f + ' mentions ' + needle);
  for (const dir of ['quant/app', 'api', '.github/workflows', 'server'])
    if (fs.existsSync(path.join(ROOT, dir))) for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(f => /\.(c?js|mjs|html|ya?ml)$/.test(f)))
      assert.equal(fs.readFileSync(path.join(ROOT, dir, f), 'utf8').includes('backtest-preview'), false, dir + '/' + f);
  /* Not under quant/data and not under a config path read by the product. */
  assert.equal(fs.existsSync(path.join(ROOT, 'quant/config/backtest-preview.json')), false);
  assert.ok(fs.existsSync(COMMITTED));
});
