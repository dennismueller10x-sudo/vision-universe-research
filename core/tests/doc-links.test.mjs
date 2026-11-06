import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkDocLinks, linksIn, resolveLink} from '../../scripts/quality/check-doc-links.mjs';

test('relative links include references, images, HTML, escaped paths and titles; examples are ignored', () => {
 const text='[ok](a.md "title") ![image](pic.png)\n[id]: <with%20space.md>\n<a href="b.md#part">B</a>\n`[example](missing.md)`\n```md\n[example](missing.md)\n```\n<!-- [hidden](missing.md) -->';
 assert.deepEqual(linksIn(text).map(x=>x.target), ['a.md','pic.png','with%20space.md','b.md#part']);
 assert.equal(resolveLink('docs/a.md','../b%20c.md?q=1#part'),'b c.md');
 assert.equal(resolveLink('docs/a.md','/README.md'),'README.md');
 for(const x of ['https://example.org','mailto:a@b.de','#part','//example.org'])assert.equal(resolveLink('a.md',x),null);
});

test('reports missing targets, including archived documents, with source line', () => {
 const root=mkdtempSync(path.join(tmpdir(),'doc-links-'));
 try {
  mkdirSync(path.join(root,'docs/archiv/2026'),{recursive:true});
  writeFileSync(path.join(root,'docs/archiv/2026/a.md'),'[root](../../../README.md)\n[missing](gone.md)');
  writeFileSync(path.join(root,'README.md'),'# Root');
  assert.deepEqual(checkDocLinks(root,['README.md','docs/archiv/2026/a.md']),[{source:'docs/archiv/2026/a.md',line:2,target:'gone.md',resolved:'docs/archiv/2026/gone.md'}]);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('all repository Markdown file links resolve', () => {
 const root=fileURLToPath(new URL('../../',import.meta.url));
 assert.deepEqual(checkDocLinks(root),[]);
});
