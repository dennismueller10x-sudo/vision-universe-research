import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLoader, jsonLinesArtifact } from '../../scripts/core/lib.mjs';
test('JSONL loader projects the last correction without rewriting or claiming integrity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vu-jsonl-'));
  const text = [{ type: 'SESSION', session: '2027-01-04', recordedAt: '2027-01-05T02:00:00Z' },
    { type: 'CORRECTION', session: '2027-01-04', recordedAt: '2027-01-05T03:00:00Z' }].map(JSON.stringify).join('\n') + '\n';
  try {
    writeFileSync(join(dir, 'paper.jsonl'), text);
    const result = await makeLoader({ root: dir })('/paper.jsonl');
    assert.equal(result.asOf, '2027-01-04');
    assert.equal(result.generatedAt, '2027-01-05T03:00:00Z');
    assert.equal(result.records, 2);
    assert.equal(result.head.type, 'CORRECTION');
    assert.match(result.integrity, /NOT_ASSESSED/);
    assert.deepEqual(result, jsonLinesArtifact(text));
    assert.throws(() => jsonLinesArtifact(''), /EMPTY_JSONL/);
    assert.throws(() => jsonLinesArtifact('{}\n{broken'), SyntaxError);
    assert.throws(() => jsonLinesArtifact('null'), /INVALID_JSONL/);
    writeFileSync(join(dir, 'normal.json'), '{"ok":true}');
    assert.deepEqual(await makeLoader({ root: dir })('/normal.json'), { ok: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
