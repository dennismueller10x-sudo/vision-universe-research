/* Pakete je Ansicht (scripts/vu2/build-release.mjs, QUANT_PACKS): Code, den nur die Aktienseite, die Methodik oder die
   Werkzeuge ausfuehren, steht im Release nicht im Buendel jeder Ansicht. Diese Tests halten fest, dass dabei nichts
   verloren geht: jede Paketdatei steht in der Seite, keine andere Ansicht, kein Nachlade-Skript und kein Gast (Elliott)
   braucht ihren Code, der Router wartet auf das Paket, und der Build schreibt Pakete und Versionsmarke richtig. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import '../../scripts/ci/scrub-git-env.mjs';import {isolatedGitEnv} from '../../scripts/ci/isolated-git-env.mjs';
import {QUANT_PACKS} from '../../scripts/vu2/build-release.mjs';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const html=read('quant/index.html');
const linked=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1].startsWith('/')?m[1].slice(1):'quant/'+m[1]);
const packed=Object.values(QUANT_PACKS).flat();
/* Was die Paketdateien global bereitstellen. */
const PROVIDES={stock:['QXStock','VUQuantChart','VUChart','MicroChart','LiveHub','VULiveRelayClient','VUJourneyShape','SeriesSampling'],tools:['QuantCharts','QXTools'],method:['QXMethod']};
/* Nachlade-Skripte und Gaeste, die das Buendel voraussetzen (app.js: loadChartbild, loadBacktest; elliott/app.js). */
const LAZY=['quant/app/page-chartbild.js','quant/ui/ti-chart.js','quant/app/page-evidence.js','quant/app/page-backtest.js','quant/engines/signal-backtest.js','quant/engines/backtest-certification.js','elliott/app.js'];

test('every packed script is linked by the Quant page, in page order, in exactly one pack',()=>{
 assert.equal(new Set(packed).size,packed.length,'a script belongs to one pack');
 for(const [name,list] of Object.entries(QUANT_PACKS)){
  for(const p of list)assert.ok(linked.includes(p),name+': '+p+' is not linked by quant/index.html');
  assert.deepEqual(list,linked.filter(p=>list.includes(p)),name+' keeps the document order');
 }
});

test('no other view, lazy script or guest needs code that moved into a pack',()=>{
 const remaining=linked.filter(p=>!packed.includes(p)&&p!=='quant/app/app.js');
 for(const [name,globals] of Object.entries(PROVIDES)){
  const own=new Set(QUANT_PACKS[name]);
  for(const file of remaining.concat(LAZY)){
   const src=read(file);
   for(const g of globals)assert.doesNotMatch(src,new RegExp('\\b'+g+'\\b'),file+' uses '+g+' from the '+name+' pack');
  }
  /* Ein Paket greift nicht in ein anderes: Aktienseite, Werkzeuge und Methodik sind getrennte Routen. */
  for(const [other,list] of Object.entries(QUANT_PACKS))if(other!==name)for(const file of list){
   const src=read(file);for(const g of globals)if(!own.has(file))assert.doesNotMatch(src,new RegExp('\\b'+g+'\\b'),file+' ('+other+') uses '+g+' from the '+name+' pack');
  }
 }
 /* Die Strategien-Seite traegt ihre Bildwelt selbst. */
 assert.match(read('quant/app/pages.js'),/function strategyArt\(id\)/);
});

test('the router waits for the pack of its view before it renders',()=>{
 const app=read('quant/app/app.js');
 assert.match(app,/function pack\(name\)[\s\S]*?global\.VUQuantPacks[\s\S]*?loadScript\(p\.src\)/);
 assert.match(app,/var viewPack = r\.view === "aktie" \? pack\("stock"\) : r\.view === "methodik" \? pack\("method"\) : r\.view === "zahlen" \|\| r\.view === "vergleich" \? pack\("tools"\) : null;/);
 assert.match(app,/case "aktie": await Promise\.all\(\[ctx\.loadBacktestView\(\), viewPack\]\); dispose = await global\.QXStock\.render/);
 for(const v of ['zahlen','vergleich','methodik'])assert.match(app,new RegExp('case "'+v+'": await viewPack; await global\\.QX(Tools|Method)\\.'));
 /* Der Echtzeit-Hub liegt im Paket der Aktienseite: hubReady wartet darauf. */
 assert.match(app,/hubReady: function \(\) \{\s*if \(!hubPromise\) hubPromise = Promise\.all\(\[[^\]]*pack\("stock"\)/);
});

test('the build writes each pack, keeps it out of the bundle and ties the bundle version to it',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join,dirname}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const {buildRelease}=await import('../../scripts/vu2/build-release.mjs');
 const tmp=await mkdtemp(join(tmpdir(),'release-packs-')),src=join(tmp,'source');
 try{
  const files=['quant/app/ui.js',...packed.slice(0,4),'quant/app/pages.js',...packed.slice(4),'quant/app/app.js'];
  await mkdir(join(src,'quant/data/sec'),{recursive:true});
  await writeFile(join(src,'quant/data/sec/inspector_index.json'),JSON.stringify({companies:[]}));
  for(const name of ['quant-factor-inputs.json','coverage_matrix.json','pit_gates.json'])await writeFile(join(src,'quant/data/sec/'+name),'{}');
  for(const f of files){await mkdir(join(src,dirname(f)),{recursive:true});await writeFile(join(src,f),'void "'+f+'";');}
  await writeFile(join(src,'quant/index.html'),'<head></head><body>'+files.map(f=>'<script src="/'+f+'"></script>').join('')+'</body>');
  const git=args=>execFileSync('git',args,{cwd:src,env:isolatedGitEnv()});
  git(['init','-q']);git(['add','.']);git(['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture']);
  const out=join(tmp,'site');await buildRelease({root:src,output:out});
  const bundle=await readFile(join(out,'quant/release-bundle.js'),'utf8'),page=await readFile(join(out,'quant/index.html'),'utf8');
  assert.equal((page.match(/<script src=/g)||[]).length,1,'only the bundle is linked');
  const {runInNewContext}=await import('node:vm');
  const warm=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('l.rel="preload"'))[1];
  const bundleId=page.match(/release-bundle\.js\?v=([a-f0-9]+)/)[1];
  for(const hash of ['#/aktie/NVDA','#/aktien'])for(const id of [null,'abcdef1234567890','invalid']){
   const css={media:'not all'},links=[],document={querySelector:sel=>sel.includes('vu-stock-style')?css:(id?{getAttribute:k=>k==='content'?id:'quant'}:null),createElement:()=>({}),head:{appendChild:l=>links.push(l)}};
   runInNewContext(warm,{location:{hash},document});
   if(hash==='#/aktien'){assert.equal(links.length,0);assert.equal(css.media,'not all');continue;}
   assert.equal(css.media,'all');const valid=id==='abcdef1234567890';assert.deepEqual(links.map(l=>[l.rel,l.as,l.href]),[['preload','script','/quant/app/pack-stock.js?v='+(valid?id:bundleId)]]);
  }

  await writeFile(join(out,'quant/app/stock.css'),'/* final delivered CSS */');
  const {stampAssets}=await import('../../scripts/vu2/release-id.mjs');
  const stamped=await stampAssets(page,out);
  assert.match(stamped, /href="\/quant\/app\/stock\.css\?v=[0-9a-f]{16}" media="not all" data-vu-stock-style/);

  for(const f of packed)assert.ok(!bundle.includes('void "'+f+'";'),f+' is not in the bundle');
  for(const f of ['quant/app/ui.js','quant/app/pages.js','quant/app/app.js'])assert.ok(bundle.includes('void "'+f+'";'),f+' stays in the bundle');
  const packs=JSON.parse(bundle.match(/globalThis\.VUQuantPacks=(\{.*?\});/)[1]);
  assert.deepEqual(Object.keys(packs).sort(),Object.keys(QUANT_PACKS).sort());
  for(const [name,list] of Object.entries(QUANT_PACKS)){
   assert.equal(packs[name].src,'/quant/app/pack-'+name+'.js');assert.match(packs[name].v,/^[a-f0-9]{16}$/);
   const text=await readFile(join(out,'quant/app/pack-'+name+'.js'),'utf8');
   assert.deepEqual(list.map(f=>text.indexOf('void "'+f+'";')),list.map(f=>text.indexOf('void "'+f+'";')).slice().sort((a,b)=>a-b),name+' keeps the order');
   for(const f of list)assert.ok(text.includes('void "'+f+'";'),f+' is in pack '+name);
  }
  /* Aendert sich nur ein Paket, aendert sich die Versionsmarke des Buendels mit (Cache-Schluessel). */
  await writeFile(join(src,'quant/app/page-method.js'),'void "changed";');git(['commit','-qam','method']);
  const out2=join(tmp,'site2');await buildRelease({root:src,output:out2});
  assert.notEqual(page.match(/\?v=([a-f0-9]+)/)[1],(await readFile(join(out2,'quant/index.html'),'utf8')).match(/\?v=([a-f0-9]+)/)[1]);
 }finally{await rm(tmp,{recursive:true,force:true});}
});

test('the thin stock head and site navigation keep document order without duplicate code',async()=>{
 const {writeQuantCode,QUANT_HEAD}=await import('../../scripts/vu2/build-release.mjs');
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,dirname}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'e5-head-code-')),root=join(dir,'source'),output=join(dir,'site');
 try{
  const files=['assets/site-navigation.js',QUANT_HEAD[0],'quant/app/ui.js',...QUANT_HEAD.slice(1),'quant/app/app.js'];
  for(const p of files){await mkdir(dirname(join(root,p)),{recursive:true});await writeFile(join(root,p),'void "'+p+'";');}
  await writeFile(join(root,'quant/index.html'),'<head></head><body>'+files.map(p=>'<script src="/'+p+'"></script>').join('')+'</body>');await mkdir(join(output,'quant'),{recursive:true});
  await writeQuantCode({root,output,paths:files.concat('quant/index.html')});
  const head=await readFile(join(output,'quant/head-bundle.js'),'utf8'),main=await readFile(join(output,'quant/release-bundle.js'),'utf8'),html=await readFile(join(output,'quant/index.html'),'utf8');
  for(const p of QUANT_HEAD){assert(head.includes('void "'+p+'";'));assert(!main.includes('void "'+p+'";'));}
  assert(!head.includes('void "assets/site-navigation.js";'));assert(!main.includes('void "assets/site-navigation.js";'));
  assert.deepEqual(QUANT_HEAD.map(p=>head.indexOf('void "'+p+'";')),QUANT_HEAD.map(p=>head.indexOf('void "'+p+'";')).sort((a,b)=>a-b));
  assert.match(html,/<head>[\s\S]*rel="preload" as="script"[\s\S]*void "assets\/site-navigation.js"[\s\S]*VUQuantHeadDeliveryEnabled[\s\S]*<\/head>/);
  assert.doesNotMatch(html,/<script src="\/(?:quant\/head-bundle|assets\/site-navigation)\.js/);
  assert.match(main,/void "quant\/app\/ui.js"/);assert.match(main,/void "quant\/app\/app.js"/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
