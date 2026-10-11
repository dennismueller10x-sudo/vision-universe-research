/** Filesystem-only private artifact guard; no Core/provider imports or requests. */
import { lstatSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const repositoryRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
export function privateReplayRoot(path) {
  if (!isAbsolute(path || '')) throw Error('ABSOLUTE_PRIVATE_OUTPUT_REQUIRED');
  const root = resolve(path), distance = relative(repositoryRoot, root);
  if (!(distance === '..' || distance.startsWith('..' + sep) || isAbsolute(distance))) throw Error('PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED');
  for (let cursor = root; ; cursor = dirname(cursor)) {
    try { if (lstatSync(cursor).isSymbolicLink()) throw Error('PRIVATE_OUTPUT_SYMLINK_REFUSED'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(cursor) === cursor) break;
  }
  return root;
}
