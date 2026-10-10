import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,root} from '../scripts/build.mjs';
import {modules,presentationSymbols,timelessHero} from '../scripts/module-preview.mjs';

test('Geräteansichten und erneute Research-Übernahme bleiben ohne Finanzdaten',async()=>{
  const reference=await readFile(resolve(root,'reference/index.html'),'utf8');
  const hero=reference.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0];
  assert.match(hero,/NVIDIA/); // Original snapshot really contains the data to remove.
  const output=resolve(root,'tests/output/modules');
  await build({output});
  for(const html of [timelessHero(hero)+presentationSymbols(reference),await readFile(resolve(output,'index.html'),'utf8')]){
    assert.doesNotMatch(html,/NVIDIA|NVDA|chart-nvda|data-count|Jahreshoch|12 Geschäftsjahre/);
    assert.equal((html.match(/class="module-launch-grid"/g)||[]).length,2);
    assert.equal((html.match(/class="module-heading"/g)||[]).length,2);
    for(const [icon,label] of modules){
      assert.ok(html.includes(`href="#h-${icon}"`),`Original-Icon: ${icon}`);
      assert.ok(html.includes(`>${label}</span>`),`Modulname: ${label}`);
    }
  }
});
