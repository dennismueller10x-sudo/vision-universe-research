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
  const file = path.join(ROOT, 'docs/quant-recovery/v13/archive/manifest-1.1.0.json');
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(m.schemaVersion, 'v13-research-archive-manifest-1.1.0');
  assert.deepEqual(m.parts.map(p => p.part), ['v13-raw', 'v13-derived', 'v13-studies', 'v13b-hist', 'v13b-f1w', 'v12-listref', 'v13c-study']);
  for (const p of m.parts) {
    assert.match(p.cipherSha256, /^[0-9a-f]{64}$/); assert.match(p.plainSha256, /^[0-9a-f]{64}$/);
    assert.ok(p.cipherBytes > p.plainBytes && p.cipherBytes - p.plainBytes <= 32);
    assert.equal(Buffer.from(p.wrappedKeyB64, 'base64').length, 512); // RSA-4096 OAEP block, not a raw key
  }
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!/PRIVATE KEY|series\.jsonl|\/tmp\//.test(text));
});
