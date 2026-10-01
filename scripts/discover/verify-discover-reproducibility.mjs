// Compare two isolated builds from the same canonical input. Never rewrites
// committed stock details or expand an identity rollout into a full publication.
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const scratch = await mkdtemp(join(tmpdir(), 'vu-discover-repro-'));
async function inventory(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await inventory(dir, path));
    else if (entry.isFile()) result.push(path);
    else throw Error('UNSUPPORTED_BUILD_ENTRY');
  }
  return result.sort();
}
try {
  for (const name of ['first', 'second']) {
    execFileSync(process.execPath, ['scripts/discover/build-discover-data.mjs', '--out=' + join(scratch, name)],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  }
  const first = await inventory(join(scratch, 'first')), second = await inventory(join(scratch, 'second'));
  if (JSON.stringify(first) !== JSON.stringify(second)) throw Error('BUILD_FILE_SET_DRIFT');
  let checked = 0;
  for (const path of first) {
    const values = await Promise.all(['first', 'second'].map(name => readFile(join(scratch, name, path))));
    // Only the explicit publication timestamp is nondeterministic. Compare
    // every other meta field, rather than excluding the entire meta document.
    if (path === 'meta.json') {
      const normalized = values.map(value => { const meta = JSON.parse(value); delete meta.generatedAt; return JSON.stringify(meta); });
      if (normalized[0] !== normalized[1]) throw Error('BUILD_META_DRIFT');
    } else if (createHash('sha256').update(values[0]).digest('hex') !== createHash('sha256').update(values[1]).digest('hex')) {
      throw Error('BUILD_CONTENT_DRIFT: ' + path);
    }
    checked++;
  }
  console.log(JSON.stringify({ state: 'PASS', files: checked, committedDataModified: false }));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
