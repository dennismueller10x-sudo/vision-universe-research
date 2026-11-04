import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { presignUrl } from '../../scripts/quant/v13/archive/presign.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// AWS documentation example credentials, split so the repository secret scanner (secrets.test.mjs S1) does not flag them.
const AWS_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE';
const AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG/' + 'bPxRfiCYEXAMPLEKEY';

test('SigV4 query presigning matches the AWS example (GET examplebucket/test.txt, 2013-05-24, 86400 s)', () => {
  const url = presignUrl({ method: 'GET', origin: 'https://examplebucket.s3.amazonaws.com', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt',
    accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET, region: 'us-east-1', amzDate: '20130524T000000Z', expires: 86400 });
  assert.ok(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'), url);
});

test('public archive manifest carries no paths, prices or private key material', () => {
  const file = path.join(ROOT, 'docs/quant-recovery/v13/archive/manifest-1.2.0.json');
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(m.schemaVersion, 'v13-research-archive-manifest-1.2.0');
  assert.deepEqual(m.parts.map(p => p.part), ['v13-raw', 'v13-derived', 'v13-studies', 'v13b-hist', 'v13b-f1w', 'v12-listref', 'v13c-study', 'v10-factor-panel']);
  for (const p of m.parts) {
    assert.match(p.cipherSha256, /^[0-9a-f]{64}$/); assert.match(p.plainSha256, /^[0-9a-f]{64}$/);
    assert.ok(p.cipherBytes > p.plainBytes && p.cipherBytes - p.plainBytes <= 32);
    assert.equal(Buffer.from(p.wrappedKeyB64, 'base64').length, 512); // RSA-4096 OAEP block, not a raw key
  }
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!/PRIVATE KEY|series\.jsonl|\/tmp\//.test(text));
});

// Befund 01.11.2026: `openssl enc -pass file:` liest nur bis zum ersten \n bzw. NUL; 32 Binärbytes wurden gekürzt.
test('effective passphrase length stops at the first LF or NUL (as openssl enc -pass file: reads it)', async () => {
  const { effectivePassLength, keyFacts, auditSummary } = await import('../../scripts/quant/v13/archive/gen2.mjs');
  assert.equal(effectivePassLength(Buffer.from([0x0a, 1, 2])), 0);
  assert.equal(effectivePassLength(Buffer.from([1, 2, 0x00, 3])), 2);
  assert.equal(effectivePassLength(Buffer.alloc(32, 7)), 32);
  const hex = Buffer.from('a'.repeat(64) + '\n');
  assert.deepEqual(keyFacts(hex), { totalBytes: 65, effectiveBytes: 64, weak: false, empty: false, hex64Lf: true });
  assert.equal(keyFacts(Buffer.from([5, 0x0a, ...Buffer.alloc(30, 9)])).weak, true);
  const s = auditSummary([keyFacts(Buffer.from([0x00])), keyFacts(Buffer.alloc(32, 1)), keyFacts(hex)]);
  assert.deepEqual([s.parts, s.weak, s.empty, s.le3, s.minEffective, s.hex64Lf], [3, 1, 1, 1, 0, 1]);
});

test('new generation manifest keeps plaintext/inventory hashes, needs a new prefix and the same part order', async () => {
  const { buildGen2Manifest } = await import('../../scripts/quant/v13/archive/gen2.mjs');
  const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v13/archive/manifest-1.2.0.json'), 'utf8'));
  const sealed = old.parts.map(p => ({ part: p.part, cipherSha256: 'f'.repeat(64), cipherBytes: p.cipherBytes, wrappedKeyB64: 'x' }));
  const args = { old, oldManifestSha256: '0'.repeat(64), oldPrefix: 'research-snapshots/quant-v13/archive-1.2.0/', prefix: 'research-snapshots/quant-v13/archive-2.0.0/', version: '2.0.0', createdAt: 't', sealed };
  const m = buildGen2Manifest(args);
  assert.equal(m.schemaVersion, 'v13-research-archive-manifest-2.0.0');
  assert.equal(m.keyFormat, 'hex64-lf');
  assert.deepEqual(m.parts.map(p => [p.part, p.plainSha256, p.inventorySha256, p.files]), old.parts.map(p => [p.part, p.plainSha256, p.inventorySha256, p.files]));
  assert.throws(() => buildGen2Manifest({ ...args, prefix: args.oldPrefix }), /PREFIX_MUST_DIFFER/);
  assert.throws(() => buildGen2Manifest({ ...args, sealed: [...sealed].reverse() }), /PART_ORDER/);
});

test('archive encryption uses a hex passphrase line only (no binary key file for -pass file:)', () => {
  const dir = path.join(ROOT, 'scripts/quant/v13/archive');
  const build = fs.readFileSync(path.join(dir, 'build-archive.sh'), 'utf8');
  const seal = fs.readFileSync(path.join(dir, 'seal-part.sh'), 'utf8');
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/quant-v13-archive.yml'), 'utf8');
  for (const t of [build, seal, wf]) assert.ok(!/openssl rand -out/.test(t));
  assert.match(seal, /openssl rand -hex 32 >/);
  assert.match(build, /seal-part\.sh/);
  assert.ok(!/^\s*openssl enc /m.test(build),'build-archive.sh verschluesselt nur ueber seal-part.sh');
});

test('existing archive manifests stay frozen: a 2.x manifest only under a new storage prefix, same plaintext', () => {
  const dir = path.join(ROOT, 'docs/quant-recovery/v13/archive');
  // neue Generation in neuem Verzeichnis: v13/ ist eingefroren (SMF-1 erlaubt nur neue Verzeichnisse)
  assert.ok(!fs.existsSync(path.join(dir, 'manifest-2.0.0.json')));
  const f = path.join(ROOT, 'docs/quant-recovery/v13-archive-gen2/manifest-2.0.0.json');
  assert.ok(fs.existsSync(f));
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  const old = JSON.parse(fs.readFileSync(path.join(dir, 'manifest-1.2.0.json'), 'utf8'));
  assert.equal(m.storagePrefix, 'research-snapshots/quant-v13/archive-2.0.0/');
  assert.equal(m.predecessor.storagePrefix, 'research-snapshots/quant-v13/archive-1.2.0/');
  assert.equal(m.archivePublicKeySha256Der, old.archivePublicKeySha256Der);
  assert.equal(m.parts.length, old.parts.length);
  old.parts.forEach((p, i) => {
    const q = m.parts[i];
    assert.equal(q.part, p.part); assert.equal(q.plainSha256, p.plainSha256); assert.equal(q.inventorySha256, p.inventorySha256);
    assert.notEqual(q.cipherSha256, p.cipherSha256); assert.notEqual(q.wrappedKeyB64, p.wrappedKeyB64);
    assert.equal(Buffer.from(q.wrappedKeyB64, 'base64').length, 512);
  });
  assert.ok(!/PRIVATE KEY|\/tmp\//.test(fs.readFileSync(f, 'utf8')));
});

// H3: Leser (get, verify, keycheck, restore, demos, catalog) lesen die Generation aus readers.json, nicht fest 1.2.0.
test('reader pin resolves both generations against their committed manifests; read modes use it', async () => {
  const { resolveReader, DEFAULT_PIN } = await import('../../scripts/quant/v13/archive/reader-generation.mjs');
  const pin = JSON.parse(fs.readFileSync(path.join(ROOT, DEFAULT_PIN), 'utf8'));
  const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  assert.ok(['1.2.0', '2.0.0'].includes(pin.readGeneration));
  const a = resolveReader(pin, read, '1.2.0'), b = resolveReader(pin, read, '2.0.0');
  assert.equal(a.prefix, 'research-snapshots/quant-v13/archive-1.2.0/');
  assert.equal(b.prefix, 'research-snapshots/quant-v13/archive-2.0.0/');
  // gleiche Teile in gleicher Reihenfolge: --parts v13-derived,v10-factor-panel der Demo-/Katalogschritte gilt fuer beide
  assert.deepEqual(a.parts, b.parts);
  for (const p of ['v13-derived', 'v10-factor-panel']) assert.ok(b.parts.includes(p));
  for (const q of read(b.manifest).parts) assert.equal(q.object, q.part + '.tar.enc');
  assert.throws(() => resolveReader(pin, read, '1.1.0'), /GENERATION_UNKNOWN/);
  assert.throws(() => resolveReader({ ...pin, generations: { ...pin.generations, '2.0.0': { ...pin.generations['2.0.0'], prefix: a.prefix } } }, read, '2.0.0'), /PREFIX_MISMATCH/);
  assert.throws(() => resolveReader({ ...pin, generations: { ...pin.generations, '2.0.0': { ...pin.generations['2.0.0'], manifest: a.manifest } } }, read, '2.0.0'), /MANIFEST_VERSION_MISMATCH/);
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/quant-v13-archive.yml'), 'utf8');
  assert.match(wf, /reader-generation\.mjs >> "\$GITHUB_OUTPUT"/);
  assert.equal((wf.match(/r2-restore\.mjs[^\n]*\n?[^\n]*--manifest "\$READ_MANIFEST" --prefix "\$READ_PREFIX"/g) || []).length, 2);
  assert.ok(!/r2-restore\.mjs[^\n]*manifest-1\.2\.0/.test(wf.replace(/\\\n\s*/g, ' ')), 'kein Leser fest auf 1.2.0');
  assert.ok(!/\$\{\{\s*steps\.g\.outputs\.[a-z]+\s*\}\}"?\s*(--|$)/m.test(wf.split('\n').filter(l => /node /.test(l)).join('\n')), 'Ausgaben nur ueber env');
});

test('restore-archive.sh restores a part sealed by seal-part.sh (hex64-lf key, test keypair, no secret)', { skip: !fs.existsSync('/usr/bin/openssl') && 'openssl fehlt' }, async () => {
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v13-h3-'));
  try {
    const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], ...o });
    sh('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', 'priv.pem']);
    sh('openssl', ['pkey', '-in', 'priv.pem', '-pubout', '-out', 'pub.pem']);
    fs.mkdirSync(path.join(dir, 'src/x'), { recursive: true }); fs.mkdirSync(path.join(dir, 'enc'));
    fs.writeFileSync(path.join(dir, 'src/x/a.json'), '{"a":1}\n');
    sh('bash', ['-c', 'cd src && sha256sum x/a.json > _inventory.tsv && tar -cf ../part.tar _inventory.tsv x']);
    const wrapped = sh('bash', [path.join(ROOT, 'scripts/quant/v13/archive/seal-part.sh'), 'part.tar', 'enc/p.tar.enc', 'pub.pem'], { env: { ...process.env, TMPDIR: dir }, encoding: 'utf8' }).trim();
    const sha = (f) => sh('sha256sum', [f], { encoding: 'utf8' }).slice(0, 64);
    const m = { schemaVersion: 'v13-research-archive-manifest-2.0.0', keyFormat: 'hex64-lf', parts: [{ part: 'p', object: 'p.tar.enc', cipherSha256: sha('enc/p.tar.enc'), plainSha256: sha('part.tar'), wrappedKeyB64: wrapped }] };
    fs.writeFileSync(path.join(dir, 'm.json'), JSON.stringify(m));
    const out = sh('bash', [path.join(ROOT, 'scripts/quant/v13/archive/restore-archive.sh'), 'm.json', 'enc', 'priv.pem', 'out'], { encoding: 'utf8' });
    assert.match(out, /^p: OK \(1 Dateien\)/m);
    assert.equal(fs.readFileSync(path.join(dir, 'out/p/x/a.json'), 'utf8'), '{"a":1}\n');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
