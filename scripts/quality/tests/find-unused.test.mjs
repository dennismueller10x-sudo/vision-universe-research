import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph, protectedReason, renderReport} from '../find-unused.mjs';

test('HTML, modules, browser fetch, CSS, shell, package scripts and registries supply edges', () => {
  const files = ['web/index.html', 'web/main.js', 'web/style.css', 'web/icon.svg', 'lib/a.mjs', 'lib/b.js', 'lib/c.cjs', 'web/data.json', 'scripts/build.mjs', '.github/workflows/ci.yml', 'package.json', 'core/registry/domains.json'];
  const sources = new Map([
    ['web/index.html', '<script src="main.js?v=1"></script><link href="/web/style.css#x">'],
    ['web/main.js', 'import "../lib/a.mjs"; export {x} from "../lib/b.js"; require("../lib/c.cjs"); fetch("data.json");'],
    ['web/style.css', 'body{background:url(icon.svg)}'],
    ['.github/workflows/ci.yml', 'run: |\n  node scripts/build.mjs\n  node --test "lib/*.js"'],
    ['package.json', '{"scripts":{"build":"node scripts/build.mjs"}}'],
    ['core/registry/domains.json', '{"producer":"scripts/build.mjs"}']
  ]);
  const g = buildGraph(files, sources);
  for (const p of ['web/main.js', 'web/style.css', 'web/icon.svg', 'lib/a.mjs', 'lib/b.js', 'lib/c.cjs', 'web/data.json', 'scripts/build.mjs']) assert.ok(g.incoming.get(p).size, p);
  assert.equal(g.incoming.get('scripts/build.mjs').size, 3);
  assert.ok(g.namedByWorkflow.has('scripts/build.mjs'));
  assert.ok(!g.namedByWorkflow.has('lib/b.js'), 'path globs do not masquerade as named calls');
});

test('directory routes, globs, cwd basename and ambiguous browser paths are retained', () => {
  const files = ['index.html', 'legacy/index.html', 'x/main.js', 'x/data/info.json', 'scripts/job.py', '.github/workflows/ci.yaml', 'tests/one.test.mjs', 'tests/deep/two.test.mjs'];
  const g = buildGraph(files, new Map([
    ['index.html', '<a href="/legacy/">legacy</a>'],
    ['x/main.js', 'fetch("data/info.json");'],
    ['.github/workflows/ci.yaml', 'working-directory: scripts\nrun: |\n  python job.py\n  node --test "tests/**/*.test.mjs"']
  ]));
  for (const p of ['legacy/index.html', 'x/data/info.json', 'scripts/job.py', 'tests/one.test.mjs', 'tests/deep/two.test.mjs']) assert.ok(g.incoming.get(p).size, p);
});

test('self mentions, generated report and external URLs do not create usage; cycles retain edges', () => {
  const files = ['a.js', 'b.js', 'alone.js', 'docs/quality/UNUSED_REPORT.md'];
  const g = buildGraph(files, new Map([
    ['a.js', 'import "./b.js"'], ['b.js', 'require("./a.js")'],
    ['alone.js', 'const self="alone.js";'], ['web-qa.mjs', 'page.route("**/*", handler);'],
    ['docs/quality/UNUSED_REPORT.md', 'alone.js']
  ]));
  assert.equal(g.incoming.get('alone.js').size, 0);
  assert.equal(g.incoming.get('a.js').size, 1);
  assert.equal(buildGraph(['alone.js', 'index.html'], new Map([['index.html', '<script src="https://remote.invalid/alone.js">']])).incoming.get('alone.js').size, 0);
});

test('taboo trees stay protected regardless of graph degree', () => {
  for (const p of ['quant/data/a.js', 'discover/data/a.js', 'supertrader/data/a.js', 'social/data/a.js', 'assets/a.js', 'app/a.js', 'workers/vu-account/a.js', 'docs/research/a.js', 'datenschutz/index.html', 'docs/legal/a.md', 'landing/legal-source/shopify-impressum.txt', 'landing/legal-drafts/index.html', 'landing/deployment/privacy-cloudflare.draft.html']) assert.ok(protectedReason(p), p);
  assert.equal(protectedReason('scripts/tool.mjs'), null);
});

test('dynamic paths are disclosed, never converted into deletion approval', () => {
  const files = ['scripts/tool.mjs', 'scripts/unlinked.mjs', 'assets/keep.js'];
  const input = {files, sources: new Map([['scripts/tool.mjs', 'fetch(base + name); import(`./${name}.mjs`);']]), sizes: new Map(files.map(p => [p, 5])), commit: 'fixture'};
  const result = renderReport(input);
  assert.equal(result.graph.dynamic.length, 2);
  assert.deepEqual(result.zero, ['scripts/tool.mjs', 'scripts/unlinked.mjs']);
  assert.match(result.markdown, /Unsicher/);
  assert.match(result.markdown, /Entfernte Dateien: keine/);
  assert.doesNotMatch(result.markdown, /\| assets\/keep.js/);
  assert.equal(renderReport(input).markdown, result.markdown);
  const compared = renderReport({...input, beforeSizes: new Map(), comparisonCommit: 'baseline'}).markdown;
  assert.match(compared, /\| scripts\/ \| 2 \| 0 \| 10 \|/);
});
