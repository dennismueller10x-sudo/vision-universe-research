import { resolve, sep } from 'node:path';
import { assertPrivateOutput, rejectSymlinkAncestors } from '../marketstack/private-output.mjs';

export function privateOutputFile(output, name) {
  const root = assertPrivateOutput(output), target = resolve(root, name);
  if (!target.startsWith(root + sep)) throw Error('PRIVATE_OUTPUT_CHILD_REQUIRED');
  rejectSymlinkAncestors(target);
  return assertPrivateOutput(target);
}
