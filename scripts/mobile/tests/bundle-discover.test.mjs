import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {bundleDiscover} from '../bundle-discover.mjs';
test('Discover delivery preserves dependency order, lazy boundaries, view budgets and inline code',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'e5-bundle-')),root=join(dir,'root'),output=join(dir,'out');
 try{
  await mkdir(join(root,'core'),{recursive:true});await mkdir(join(output,'discover'),{recursive:true});
  for(const n of ['a','b','c','d'])await writeFile(join(root,'core',n+'.js'),'window.order.push("'+n+'");');
  const tag=n=>'<script src="'+n+'"></script>';
  await writeFile(join(output,'discover/index.html'),'<script>window.order=[]</script><template id="dx-start">'+tag('/core/a.js')+tag('/core/b.js')+tag('/discover/home.js')+tag('/core/c.js')+'</template><template id="dx-lazy-detail">'+tag('/core/c.js')+tag('/core/d.js')+tag('/discover/detail.js')+'</template>');
  const chunks=await bundleDiscover({root,output}),html=await readFile(join(output,'discover/index.html'),'utf8');
  assert.deepEqual(chunks.map(c=>c.inputs),[['core/a.js','core/b.js'],['core/c.js','core/d.js']]);
  assert(html.includes(tag('/discover/home.js')));assert(html.includes(tag('/discover/detail.js')));assert(html.includes(tag('/core/c.js')));assert(html.includes('<script>window.order=[]</script>'));
  for(const c of chunks){const code=await readFile(join(output,c.path),'utf8');assert(code.indexOf(c.inputs[0])<code.indexOf(c.inputs[1]));}
 }finally{await rm(dir,{recursive:true});}
});

test('Discover dependency chunks stay bounded as source modules grow',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'e5-chunk-'));
 try{
  await mkdir(join(dir,'discover'),{recursive:true});
  await writeFile(join(dir,'discover/index.html'),'<template id="dx-start">'+Array.from({length:6},(_,i)=>'<script src="/core/m'+i+'.js"></script>').join('')+'</template>');
  const chunks=await bundleDiscover({root:dir,output:dir,readSource:async()=> '/*'+'x'.repeat(100000)+'*/'});
  assert.equal(chunks.length,3);assert(chunks.every(c=>c.bytes<262144));assert.equal(chunks.flatMap(c=>c.inputs).length,6);
 }finally{await rm(dir,{recursive:true});}
});

test('Discover start bundles are preloaded in the head, lazy groups are not',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'e5-preload-'));
 try{
  await mkdir(join(dir,'discover'),{recursive:true});
  const tags=(p,n)=>Array.from({length:n},(_,i)=>'<script src="/core/'+p+i+'.js"></script>').join('');
  await writeFile(join(dir,'discover/index.html'),'<head><link rel="stylesheet" href="/a.css"></head><template id="dx-start">'+tags('s',2)+'</template><template id="dx-lazy-x">'+tags('l',2)+'</template>');
  const chunks=await bundleDiscover({root:dir,output:dir,readSource:async()=>'x'}),html=await readFile(join(dir,'discover/index.html'),'utf8');
  const pre=[...html.matchAll(/<link rel="preload" href="([^"]+)" as="script">/g)].map(m=>m[1]);
  assert.equal(pre.length,1);assert(/^\/discover\/delivery\/dx-start-1\.js\?v=[0-9a-f]{16}$/.test(pre[0]));
  assert(html.indexOf(pre[0])<html.indexOf('rel="stylesheet"'));
  assert(html.includes('<script src="'+pre[0]+'"></script>'),'derselbe Pfad wird als Skript genutzt');
  assert.equal(chunks.length,2);
 }finally{await rm(dir,{recursive:true});}
});
