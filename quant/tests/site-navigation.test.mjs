/* Frontend-Rebuild (quant/app): Prüfintention erhalten – der Sync darf
   einer Seite, die ihre Navigation selbst traegt, keine zweite voranstellen,
   muss das Discover-Theme erhalten und idempotent sein. Seit dem Umbau ist
   vu2/index.html eine reine Weiterleitung nach /quant/ (sync-navigation.mjs
   ueberspringt sie weiterhin; sie muss Byte fuer Byte eine Ein-Sprung-Seite
   bleiben), und das kanonische Produkt quant/index.html bringt
   <vu-navigation theme="light"> und site-navigation.css selbst mit. Die
   Fixture nutzt deshalb die ECHTEN Dateien beider Seiten zusaetzlich zur
   alten synthetischen Shell. */
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
test('navigation sync preserves the VU2 shell and Discover theme while remaining idempotent',async()=>{const root=await mkdtemp(join(tmpdir(),'vu-nav-'));try{const script=await readFile(new URL('../../scripts/sync-navigation.mjs',import.meta.url),'utf8');await writeFile(join(root,'sync.mjs'),script);await mkdir(join(root,'vu2'));await mkdir(join(root,'discover'));const vu2='<!doctype html><html><head></head><body><div id="app"></div></body></html>',dark='<!doctype html><html><head></head><body><vu-navigation theme="dark"></vu-navigation></body></html>';await writeFile(join(root,'vu2/index.html'),vu2);await writeFile(join(root,'discover/index.html'),dark);await writeFile(join(root,'index.html'),vu2);
const redirect=await readFile(new URL('../../vu2/index.html',import.meta.url),'utf8'),quant=await readFile(new URL('../index.html',import.meta.url),'utf8');
assert.match(redirect,/location\.replace\("\/quant\/"\+location\.search\+location\.hash\)/,'vu2/index.html is the one-hop redirect');
assert.equal((quant.match(/<vu-navigation[\s>]/g)||[]).length,1,'quant/index.html carries exactly one platform navigation');
assert.ok(quant.includes('/assets/site-navigation.css')&&quant.includes('/assets/site-navigation.js'));
await writeFile(join(root,'vu2/index.html'),vu2);await mkdir(join(root,'quant'));await writeFile(join(root,'quant/index.html'),quant);
execFileSync(process.execPath,['sync.mjs'],{cwd:root});assert.equal(await readFile(join(root,'vu2/index.html'),'utf8'),vu2);
assert.equal(await readFile(join(root,'quant/index.html'),'utf8'),quant,'the canonical Quant page keeps its own light navigation, no second header');
await writeFile(join(root,'vu2/index.html'),redirect);execFileSync(process.execPath,['sync.mjs'],{cwd:root});assert.equal(await readFile(join(root,'vu2/index.html'),'utf8'),redirect,'the redirect stub stays byte-identical');const discover=await readFile(join(root,'discover/index.html'),'utf8'),home=await readFile(join(root,'index.html'),'utf8');assert.equal((discover.match(/<vu-navigation/g)||[]).length,1);assert.ok(discover.includes('theme="dark"'));assert.equal((home.match(/<vu-navigation/g)||[]).length,1);execFileSync(process.execPath,['sync.mjs'],{cwd:root});assert.equal(await readFile(join(root,'discover/index.html'),'utf8'),discover);assert.equal(await readFile(join(root,'index.html'),'utf8'),home);}finally{await rm(root,{recursive:true,force:true});}});
