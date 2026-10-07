/** Preserve Discover isolation while allowing the exact gated stock UI hooks. */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const additions = new Map([
  ['quant/app/page-stock.js', new Set(['if (global.VUCompanyIntelligenceStock) disposers.push(global.VUCompanyIntelligenceStock.mount(bodyHost, ticker));'])],
  ['quant/index.html', new Set([
    '<link rel="stylesheet" href="/company-intelligence/ui/stock-section.css">',
    '<script src="/company-intelligence/api/contract.js"></script>',
    '<script src="/company-intelligence/config/rollout.js"></script>',
    '<script src="/company-intelligence/ui/stock-section.js"></script>'
  ])]
]);
export function permittedStockHook(path, patch, changedPaths) {
  const allowed = additions.get(path);
  if (!allowed || !changedPaths.includes('company-intelligence/config/rollout.js') ||
      !changedPaths.includes('company-intelligence/ui/stock-section.js')) return false;
  const added = [];
  for (const line of patch.split(/\r?\n/)) {
    if (/^(?:old mode|new mode|rename |copy |similarity index|new file mode|deleted file mode)/.test(line)) return false;
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('-')) return false;
    if (line.startsWith('+')) added.push(line.slice(1).trim());
  }
  return added.length > 0 && new Set(added).size === added.length && added.every(line => allowed.has(line));
}
export function unexpectedProtectedChanges(base, head, paths, run = spawnSync) {
  const git = args => {
    const result = run('git', args, { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error('INTEGRATION_SCOPE_GIT_FAILED');
    return result.stdout;
  };
  const changed = git(['diff', '--name-only', base, head, '--']).trim().split('\n');
  return paths.filter(path => !permittedStockHook(path,
    git(['diff', '--no-ext-diff', '--unified=0', base, head, '--', path]), changed));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [base, head, ...paths] = process.argv.slice(2);
    if (!base || !head) throw new Error('INTEGRATION_SCOPE_REQUIRES_REVISIONS');
    const remaining = unexpectedProtectedChanges(base, head, paths);
    if (remaining.length) process.stdout.write(remaining.join('\n') + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
