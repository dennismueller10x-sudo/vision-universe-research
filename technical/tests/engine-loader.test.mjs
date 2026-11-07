import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  var ENGINE_SCRIPTS ='),source.indexOf('  function store()'));
test('Technical starts every download before load events, preserves execution order and shares pending work',async()=>{
 const scripts=[],context={doc:{createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}},Promise};
 vm.runInNewContext(code+';this.load=loadEngines',context);
 const first=context.load();assert.equal(context.load(),first);assert.equal(scripts.length,15);
 assert(scripts.every(s=>s.async===false),'ordered classic-script queue');
 let done=false;first.then(()=>done=true);
 for(const s of scripts.slice(0,-1))s.onload();await Promise.resolve();assert.equal(done,false);
 scripts.at(-1).onload();await first;
});
