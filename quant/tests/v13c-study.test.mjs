import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const D = require('../engines/research-delisted-series.cjs');
const C = require(ROOT + '/scripts/quant/v13c/lib.cjs');
const S3 = require(ROOT + '/scripts/quant/v13c/run-s3.cjs');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const loadHash = r => sha(JSON.stringify({ docs: [...r.docs], counts: r.counts, registerHash: r.registerHash, include: r.include, keys: Object.keys(r) }));
const HAVE_PRIVATE = fs.existsSync(C.SERIES_100) && fs.existsSync(C.SERIES_110);

// Fixture identical to the one used to pin the pre-V13c module output (hash computed with the 1.0.0-only module before the change).
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v13cdl-')), dir = path.join(root, 'series'); fs.mkdirSync(dir);
  fs.mkdirSync(path.join(root, path.dirname(D.REGISTER)), { recursive: true });
  const points = []; let t = Date.UTC(2010, 0, 8);
  for (let k = 0; k < 60; k++, t += 7 * 864e5) points.push([new Date(t).toISOString().slice(0, 10), 10 + k * 0.125]);
  const h = D.pointsHash(points);
  const series = { chainId: 'abc', ticker: 'OLDX', cik: '123', status: 'QUALIFIED', exchange: 'NYSE', points, totalReturn: points, lastTradeDate: points.at(-1)[0], lastRawClose: 17.4,
    terminal: { class: 'MERGER', scenarios: [0, -0.1, 0.1], secEventDate: '2011-03-01', reason: 'MERGER_ACQUISITION_COMPLETED' }, pointsSha256: h };
  fs.writeFileSync(path.join(dir, 'abc.json'), JSON.stringify(series));
  const reg = { schemaVersion: 'v13-delisted-register-1.0.0', certificationStatus: 'NOT_CERTIFIED', productionApproved: false, controls: { pass: true },
    columns: ['chainId', 'cik', 'startYearBucket', 'endYearBucket', 'status', 'endSourced', 'terminalClass', 'weeks', 'gapCut', 'pointsSha256'],
    rows: [['abc', '123', '2010-2014', '2010-2014', 'QUALIFIED', true, 'MERGER', 60, false, h]] };
  fs.writeFileSync(path.join(root, D.REGISTER), JSON.stringify(reg));
  return { root, dir, reg };
}

test('default loader output is byte-identical to the pre-V13c module (fixture, pinned hash)', () => {
  const f = fixture();
  assert.equal(loadHash(D.loadDelisted(f.root, { dir: f.dir })), 'a31a2e697bd7e34d85ef78a758e0ba4640e528ac48adf978e16eca25580a9d55');
  assert.equal(loadHash(D.loadDelisted(f.root, { dir: f.dir, registerVersion: '1.0.0' })), 'a31a2e697bd7e34d85ef78a758e0ba4640e528ac48adf978e16eca25580a9d55');
});

test('register options fail closed', () => {
  const f = fixture();
  assert.throws(() => D.loadDelisted(f.root, { dir: f.dir, registerVersion: '2.0.0' }), /DELISTED_REGISTER_VERSION_INVALID/);
  assert.throws(() => D.loadDelisted(f.root, { dir: f.dir, extraDirs: [f.dir] }), /DELISTED_EXTRA_DIRS_INVALID/);
  assert.throws(() => D.loadDelisted(f.root, { dir: f.dir, registerVersion: '1.1.0', extraDirs: 'x' }), /DELISTED_EXTRA_DIRS_INVALID/);
  fs.mkdirSync(path.join(f.root, path.dirname(D.REGISTER_110.file)), { recursive: true });
  fs.writeFileSync(path.join(f.root, D.REGISTER_110.file), JSON.stringify({ ...f.reg, schemaVersion: 'v13-delisted-register-1.1.0' }));
  assert.throws(() => D.loadDelisted(f.root, { dir: f.dir, registerVersion: '1.1.0' }), /DELISTED_REGISTER_110_HASH_MISMATCH/);
});

test('default loader on the full private 1.0.0 set is byte-identical (pinned hashes; skipped without private data)', { skip: !HAVE_PRIVATE && 'private series absent' }, () => {
  assert.equal(loadHash(D.loadDelisted(ROOT, { dir: C.SERIES_100, include: 'QUALIFIED' })), 'ccb1b585ec752f7a268ee62c5a9a37b99cfb4b4fdf107c75ebc962aaaef51bf8');
  assert.equal(loadHash(D.loadDelisted(ROOT, { dir: C.SERIES_100, include: 'ALL_LOADABLE' })), '36b20ca4223f37ec105a2cb57febc698421ae418c15f1ab6fec0e61c3cc17c07');
});

test('register 1.1.0 loads hash-bound, keeps the lifecycle record schema and rejects ambiguous files (skipped without private data)', { skip: !HAVE_PRIVATE && 'private series absent' }, () => {
  const q = C.loadDelisted110();
  assert.deepEqual(q.counts, { requested: 1688, loaded: 1688, missingFile: 0 });
  assert.equal(q.registerVersion, '1.1.0'); assert.equal(q.registerHash, D.REGISTER_110.sha256);
  const doc = q.docs.get(C.newQualifiedChains()[0]);
  assert.equal(doc.listingLifecycle.schemaVersion, 'v13-delisted-register-1.0.0');
  assert.equal(doc.listingLifecycle.registerVersion, '1.1.0'); assert.ok(doc.warnings.includes('V13B_REGISTER_1_1_0'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v13camb-')), id = C.newQualifiedChains()[0].slice(3);
  fs.copyFileSync(path.join(C.SERIES_110, id + '.json'), path.join(tmp, id + '.json'));
  assert.throws(() => D.loadDelisted(ROOT, { dir: C.SERIES_110, registerVersion: '1.1.0', extraDirs: [tmp] }), /DELISTED_SERIES_AMBIGUOUS/);
});

test('registration and amendment are hash-bound; cited V13 results unchanged', () => {
  assert.equal(C.registrationSha(), 'bbe15b1920bcee83222b72547b336b608e60f474a84d8ea2c178c6f08ad14c1b');
  const am = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v13c/study-amendment-3.0.1.json'), 'utf8'));
  assert.equal(am.amends.sha256, C.registrationSha()); assert.equal(C.amendmentSha(), fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v13c/study-amendment-3.0.1.sha256'), 'utf8').split(/\s+/)[0]);
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, C.REG_FILE), 'utf8'));
  assert.equal(reg.productionApproved, false); assert.equal(reg.confirmatory, false);
  for (const s of reg.knownPriorInformation.seen) { const [f, , h] = s.split(' '); assert.equal(C.W.shaFile(f), h, f); }
  for (const b of Object.values(reg.basedOn)) assert.equal(C.W.shaFile(b.file), b.sha256, b.file);
});

test('exactly 13 new QUALIFIED chains between register 1.0.0 and 1.1.0', () => {
  const ids = C.newQualifiedChains();
  assert.equal(ids.length, 13); assert.ok(ids.every(id => /^dl_[0-9a-f]{16}$/.test(id)));
});

test('usable SPX terminal values: 28, First Data 2006 excluded', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v13b/hist/spx-terminal-register-1.0.0.json'), 'utf8'));
  const rev = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v13b/hist/spx-terminal-review-1.0.0.json'), 'utf8'));
  const u = S3.usableTerminalRows(reg, rev);
  assert.equal(u.accepted, 29); assert.equal(u.usable.length, 28);
  assert.deepEqual(u.excluded.map(x => x.keyHash16), [C.FIRST_DATA_KEY]);
  assert.ok(u.usable.every(r => /^TERMINAL_/.test(r.status)));
});

test('step B replaces only matched still-bounded members, series first, fail closed otherwise', () => {
  const m = (chainId, cik, weight, status) => ({ chainId, cik, weight, status, group: /^BOUNDED/.test(status) ? 'bounded' : 'observed', fate: 'ACQUIRED_OR_MERGED', fateClass: 'TAKEOVER', ret: { ZERO: 0, LOWER: -1, FATE: 0.2, UPPER: 0.3 } });
  const pop = { periods: [{ t0: 'T0', t1: 'T1' }], members: () => ({ t0: 'T0', t1: 'T1', members: [m(1, 11, 0.001, 'BOUNDED_EXIT'), m(2, 22, 0.002, 'V13_DELISTED_OBSERVED'), m(3, 33, 0.003, 'OBS_CHAIN')] }) };
  const keyOf = id => ({ 1: 'aaaaaaaaaaaaaaaa', 2: 'bbbbbbbbbbbbbbbb', 3: 'cccccccccccccccc' })[id];
  const row = (k, cik, w, r) => ({ t0: 'T0', keyHash16: k, cik, weight: w, status: 'TERMINAL_CASH', return: r, name: 'x' });
  const log = [], out = S3.wrapTerminal(pop, new Map([['T0', [row('aaaaaaaaaaaaaaaa', 11, 0.001, 0.25), row('bbbbbbbbbbbbbbbb', 22, 0.002, 0.5)]]]), keyOf, log).members('T0');
  assert.deepEqual(out.members[0].ret, { ZERO: 0.25, LOWER: 0.25, FATE: 0.25, UPPER: 0.25 }); assert.equal(out.members[0].status, 'V13C_SPX_TERMINAL_DOCUMENTED');
  assert.equal(out.members[1].status, 'V13_DELISTED_OBSERVED'); assert.deepEqual(log.map(x => x.state), ['REPLACED', 'CONFLICT_SERIES_FIRST']);
  assert.throws(() => S3.wrapTerminal(pop, new Map([['T0', [row('aaaaaaaaaaaaaaaa', 11, 0.0011, 0.25)]]]), keyOf, []).members('T0'), /V13C_SPX_MATCH/);
  assert.throws(() => S3.wrapTerminal(pop, new Map([['T0', [row('cccccccccccccccc', 33, 0.003, 0.25)]]]), keyOf, []).members('T0'), /V13C_SPX_NOT_BOUNDED/);
});

test('published V13c outputs carry the evidence envelope and no series (when present)', () => {
  const dir = path.join(ROOT, C.OUT_DIR);
  for (const f of ['s1-signal-3.0.0.json', 's2-population-3.0.0.json', 's3-spx-3.0.0.json'].filter(f => fs.existsSync(path.join(dir, f)))) {
    const x = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(x.registrationSha256, C.registrationSha(), f); assert.equal(x.amendmentSha256, C.amendmentSha(), f);
    assert.equal(x.certificationStatus, 'NOT_CERTIFIED', f); assert.equal(x.productionApproved, false, f); assert.equal(x.confirmatory, false, f);
    assert.ok(!JSON.stringify(x).includes('"points"'), f);
  }
  const s3 = path.join(dir, 's3-spx-3.0.0.json');
  if (fs.existsSync(s3)) {
    const x = JSON.parse(fs.readFileSync(s3, 'utf8'));
    assert.equal(x.basedOn.r3.pass, true); assert.equal(x.EARLY.memberLogicIdenticalOnP5A, true); assert.equal(x.data.quantDataEqualsSnapshot, true);
    assert.equal(x.terminalValues.usable, 28); assert.equal(x.terminalValues.inP5ASpan + x.terminalValues.inEarly, 28);
  }
  const s1 = path.join(dir, 's1-signal-3.0.0.json');
  if (fs.existsSync(s1)) {
    const x = JSON.parse(fs.readFileSync(s1, 'utf8'));
    for (const f of ['F1p', 'F1wp', 'F1dp']) { assert.equal(x.populations[f].r2.manifestReproduced, true, f); assert.equal(x.populations[f].data.quantDataEqualsSnapshot, true, f); }
    assert.equal(x.cells.length, 60);
  }
});
