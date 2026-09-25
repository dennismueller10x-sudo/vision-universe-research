#!/usr/bin/env node
// ONE DISCOVER. Nachfolger des Preview-Isolations-Gates (scripts/discover-v2/
// regression-gate.mjs), das bis zur Konsolidierung die parallele Vorschau
// gegen Discover 1.0 abschirmte. Seit /discover/ das fruehere Discover 2.1
// ausliefert, gibt es nichts mehr abzuschirmen - geschuetzt wird jetzt,
// dass es genau EINE Implementierung gibt und keine zweite nachwaechst.
// Rechnet nichts neu und baut keine Daten.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024}).toString();
const tracked=git('ls-files','discover-v2','discover').split('\n').filter(Boolean);

// 1. /discover-v2/ ist nur noch ein Weiterleitungs-Alias.
assert.deepEqual(tracked.filter(p=>p.startsWith('discover-v2/')),['discover-v2/index.html'],'discover-v2/ darf nur den Alias enthalten');

// 2. Die kanonische Seite laedt nichts von der Legacy-Adresse und traegt
//    keine Versionsbezeichnung.
const page=readFileSync('discover/index.html','utf8');
const scripts=[...page.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
for(const src of scripts){
  assert(!src.startsWith('/discover-v2/'),'discover/index.html laedt '+src);
  const file=src.replace(/^\//,'');
  assert(tracked.includes(file)||git('ls-files',file).trim(),'Skript fehlt im Repository: '+src);
}
for(const f of ['app.js','home.js','detail.js','themes.js'])assert(scripts.includes('/discover/'+f),'kanonisches Frontend fehlt: /discover/'+f);
const visible=['discover/index.html','discover/app.js','discover/home.js','discover/detail.js','discover/themes.js'];
for(const f of visible){
  const src=readFileSync(f,'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$|<!--[\s\S]*?-->/gm,'');
  assert.doesNotMatch(src,/Discover\s+(1\.0|2\.0|2\.1)|Discover Preview/,f+' nennt eine Discover-Version');
  assert.doesNotMatch(src,/['"]\/discover-v2\//,f+' verweist auf /discover-v2/');
}

// 3. Die Consumer-Navigation kennt genau einen Discover-Eintrag.
const nav=readFileSync('assets/site-navigation.js','utf8');
const entries=[...nav.matchAll(/\['(Discover[^']*)',\s*'([^']+)'\]/g)].map(m=>m[1]+' '+m[2]);
assert.deepEqual(entries,['Discover /discover/'],'Navigation: '+JSON.stringify(entries));

// 4. Der Frontend-Vertrag (Freshness, Source State, Eligibility, Zero Cost).
const contract=JSON.parse(execFileSync(process.execPath,['scripts/discover/contract-qa.mjs'],{maxBuffer:4*1024*1024}).toString());
assert.match(contract.status,/^PASS/,'Discover contract gate failed');

console.log(JSON.stringify({status:'PASS',canonical:'/discover/',legacyAlias:'/discover-v2/ -> /discover/',scripts:scripts.length,navigation:entries,contractGate:contract.status},null,2));
