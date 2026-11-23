import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {median,rowsFromRaw,baselineFrom,evaluate,loadHistory,reportMarkdown,assertNoSecret,SITES,CPUS} from '../live-ladezeit.mjs';
const targets=JSON.parse(readFileSync(new URL('../ladezeit-targets.json',import.meta.url),'utf8'));
const row=(key,cpu,o={})=>({key,site:key.split('/')[0],route:'/'+key.split('/').slice(1).join('/'),cpu,lcp:2000,cls:0,requests:60,bytes:800000,runs:3,incompleteRuns:0,failedRuns:0,lcpRuns:[2000,2000,2000],errors:[],...o});
const rep=(at,rows)=>({schema:'vu-ladezeit-1',measuredAt:at,rows});
test('Median und Zeilen aus der Rohdatei von measure.mjs',()=>{
 assert.equal(median([3,1,2]),2);assert.equal(median([1,2,3,4]),2.5);assert.equal(median([null,undefined,5]),5);assert.equal(median([]),null);
 const raw={rows:[{route:'/quant/',lcp:1500,cls:0,requests:31,bytes:860000,incompleteRuns:0,failedRuns:0}],samples:[{route:'/quant/',lcp:1400.4,errors:[]},{route:'/quant/',lcp:1500,errors:['x']},{route:'/quant/',lcp:null,errors:[]}]};
 const [r]=rowsFromRaw(raw,'app',4);assert.equal(r.key,'app/quant/');assert.deepEqual(r.lcpRuns,[1400,1500,null]);assert.deepEqual(r.errors,['x']);assert.equal(r.runs,3);
});
test('Alarm: LCP über dem Ziel der Route, nur wo ein Ziel steht',()=>{
 const a=evaluate([row('app/quant/',4,{lcp:2600}),row('app/technical/',4,{lcp:9000})],targets,[]);
 assert.deepEqual(a.map(x=>x.art+':'+x.key),['lcp-ziel:app/quant/']);
 assert.deepEqual(evaluate([row('app/quant/',4,{lcp:2500})],targets,[]),[]);
});
test('Alarm: Verschlechterung gegen den Median der letzten Läufe (mehr als 30 % und 300 ms), erst ab drei Berichten',()=>{
 const h=n=>Array.from({length:n},(_,i)=>rep('2026-11-1'+i,[row('app/technical/',4,{lcp:2000,requests:60})]));
 assert.deepEqual(evaluate([row('app/technical/',4,{lcp:2700})],targets,h(2)),[],'zu wenig Verlauf');
 assert.equal(evaluate([row('app/technical/',4,{lcp:2700})],targets,h(5))[0].art,'lcp-verlauf');
 assert.deepEqual(evaluate([row('app/technical/',4,{lcp:2500})],targets,h(5)),[],'+25 % ist kein Alarm');
 assert.deepEqual(evaluate([row('app/technical/',4,{lcp:2290})],targets,h(5)),[],'unter 300 ms Abstand kein Alarm');
 assert.equal(evaluate([row('app/technical/',4,{requests:95})],targets,h(5))[0].art,'requests');
 assert.deepEqual(evaluate([row('app/technical/',2,{lcp:5000})],targets,h(5)),[],'Profile werden getrennt verglichen (kein CPU-2x-Verlauf)');
});
test('Alarm: CLS, fehlende oder unvollständige Messung',()=>{
 assert.equal(evaluate([row('www/zz/',4,{cls:0.2})],targets,[])[0].art,'cls');
 assert.equal(evaluate([row('www/zz/',4,{lcp:null})],targets,[])[0].art,'keine-messung');
 assert.equal(evaluate([row('www/zz/',4,{lcpRuns:[null,null,2000]})],targets,[])[0].art,'keine-messung');
 assert.deepEqual(evaluate([row('www/zz/',4,{incompleteRuns:3})],targets,[]),[],'offene Verbindungen nach dem Fenster sind keine fehlende Messung');
});
test('Verlauf: Berichte der Vortage, neueste zuerst, Fremdes und Defektes wird ignoriert',()=>{
 const d=mkdtempSync(join(tmpdir(),'ladezeit-'));
 for(const [n,at] of [['a','2026-11-20T04:00:00Z'],['b','2026-11-22T04:00:00Z'],['c','2026-11-21T04:00:00Z']]){mkdirSync(join(d,n));writeFileSync(join(d,n,'report.json'),JSON.stringify(rep(at,[])));}
 mkdirSync(join(d,'x'));writeFileSync(join(d,'x','report.json'),'{kaputt');mkdirSync(join(d,'y'));writeFileSync(join(d,'y','report.json'),JSON.stringify({schema:'anders',rows:[]}));
 assert.deepEqual(loadHistory(d).map(r=>r.measuredAt.slice(0,10)),['2026-11-22','2026-11-21','2026-11-20']);
 assert.deepEqual(loadHistory(join(d,'gibt-es-nicht')),[]);
 assert.deepEqual(baselineFrom([rep('x',[row('www/',4,{lcp:1000})]),rep('y',[row('www/',4,{lcp:3000})])],'www/',4,7),{n:2,lcp:2000,requests:60});
});
test('Bericht nennt Routen und Alarme; ein Geheimnis in der Ausgabe bricht ab',()=>{
 const report={measuredAt:'2026-11-23T04:17:00Z',commit:'abcdef0123',runs:3,historyRuns:0,rows:[row('app/quant/',4,{lcp:1464.2,cls:0.0002})],alarms:[]};
 const md=reportMarkdown(report);assert.match(md,/app\/quant\/ \| 4x \| 1464 \| 0\.000 \| 60/);assert.match(md,/Keine Alarme/);
 assert.throws(()=>assertNoSecret('Passwort hunter2hunter2 hier',['hunter2hunter2']),/SECRET_IN_OUTPUT/);
 assert.doesNotThrow(()=>assertNoSecret('nichts',['hunter2hunter2',undefined,'']));
});
test('Seiten, Routen und Profile: App hinter der Maske, www offen, CPU 4x und 2x',()=>{
 assert.equal(SITES.app.gate,true);assert.equal(SITES.www.gate,false);assert.deepEqual(CPUS,[4,2]);
 assert.deepEqual(SITES.app.routes,['/','/discover/','/quant/','/technical/','/technical/#/screener','/technical/#/chart/NVDA','/mein-dashboard/','/quant/#/aktie/NVDA']);assert.deepEqual(SITES.www.routes,['/','/magazin/','/news/']);
 for(const s of Object.values(SITES))assert.match(s.base,/^https:\/\//);
});
test('measure.mjs: Zugangsmaske nur mit --gate und Umgebung, nur im Ursprung der Seite, kein Trace, Screenshot oder HAR; Standard unverändert',()=>{
 const m=readFileSync(new URL('../measure.mjs',import.meta.url),'utf8');
 assert.match(m,/process\.argv\.includes\('--gate'\)/);assert.match(m,/GATE_PASSWORD_MISSING/);assert.match(m,/location\.origin === o/);
 assert.doesNotMatch(m,/tracing|screenshot|recordHar|\.trace/i);assert.match(m,/arg\('--cpu',4\)/);
 assert.match(m,/const defaultRoutes = \['\/', '\/quant\/'/);
 const w=readFileSync(new URL('../live-ladezeit.mjs',import.meta.url),'utf8');assert.doesNotMatch(w,/screenshot|recordHar|tracing/i);
 assert.doesNotMatch(w,/args\.push\([^)]*PASSWORD/);
});

test('Ungültige Läufe (Zugangsmaske oder Inhaltsmerkmal fehlt) sind ein Alarm, kein Messwert',()=>{
 const row={key:'app/technical/',site:'app',route:'/technical/',cpu:4,lcp:236,cls:0.06,requests:46,bytes:1,runs:3,invalidRuns:3,incompleteRuns:0,failedRuns:0,lcpRuns:[236,232,244],errors:[]};
 const a=evaluate([row],targets,[]);
 assert.deepEqual(a.map(x=>x.art),['ungueltig']);
 assert.match(a[0].text,/#tc-main/);
 assert.match(reportMarkdown({measuredAt:'2026-11-23',commit:'x',runs:3,historyRuns:0,rows:[row],alarms:a}),/\| ungueltig \|/);
 assert.deepEqual(evaluate([{...row,invalidRuns:1}],targets,[]),[]);
 assert.ok(targets.routes['app/technical/'].marker&&targets.routes['app/mein-dashboard/'].marker);
});

test('Bericht nennt LCP-Element, größte Verschiebung und Zugangshülle (nur Struktur, keine Inhalte)',async()=>{
 const {topShiftOf,lcpElementOf,gateOf}=await import('../live-ladezeit.mjs');
 const ss=[{lcp:1300,lcpElement:{tag:'H1',id:'hero',url:'https://x.example/img/a.jpg?v=1'},shifts:[{value:0.1,at:900,sources:[{node:'DIV#a.x'}]},{value:0.2,at:1500,sources:[{node:'SECTION#b.y'},{node:'P#.z'}]}],navigation:{responseEnd:400},resourceTimings:[{name:'https://h/__research/content/index.html?v=1',end:900}]}];
 assert.deepEqual(topShiftOf(ss),{value:0.2,atMs:1500,nodes:['SECTION#b.y','P#.z'],moves:[{from:null,to:null},{from:null,to:null}]});
 assert.deepEqual(lcpElementOf(ss),{tag:'H1',id:'hero',url:'/img/a.jpg'});
 assert.deepEqual(gateOf(ss),{shellMs:400,contentMs:900,extraMs:500});
 assert.equal(gateOf([{navigation:{responseEnd:1},resourceTimings:[]}]),null);
 const md=reportMarkdown({measuredAt:'t',commit:'c',runs:3,historyRuns:0,alarms:[],rows:[{key:'app/',cpu:4,lcp:1,cls:0.3,requests:1,bytes:1024,runs:3,lcpRuns:[1],lcpElement:lcpElementOf(ss),topShift:topShiftOf(ss),gate:gateOf(ss)}]});
 assert.match(md,/groesste Verschiebung: 0.2 bei 1500 ms/);assert.match(md,/Zugangshuelle: Huelle bis 400 ms, Inhalt bis 900 ms \(\+500 ms\)/);
});

test('Inhaltsmerkmal: irgendein sichtbares Element des Selektors genügt (nicht nur das erste)',()=>{
 const m=readFileSync(new URL('../measure.mjs',import.meta.url),'utf8');
 assert.match(m,/\[\.\.\.document\.querySelectorAll\(sel\)\]\.some\(/);
 assert.doesNotMatch(m,/document\.querySelector\(sel\)/);
 assert.equal(targets.routes['www/news/'].lcpMs,1550);
});

test('Dashboard wird abgemeldet gemessen: Merkmal Anmeldemaske, im Bericht beschriftet',()=>{
 const r=targets.routes['app/mein-dashboard/'];
 assert.equal(r.marker,'#password');assert.equal(r.label,'abgemeldet');
 const md=reportMarkdown({measuredAt:'t',commit:'c',runs:3,historyRuns:0,alarms:[],rows:[{key:'app/mein-dashboard/',label:'abgemeldet',cpu:4,lcp:200,cls:0,requests:1,bytes:1024,runs:3,invalidRuns:0,lcpRuns:[200]}]});
 assert.match(md,/\| app\/mein-dashboard\/ \(abgemeldet\) \| 4x \| 200 /);
 assert.match(readFileSync(new URL('../../../konto/anmelden/index.html',import.meta.url),'utf8'),/id="password"/,'Merkmal steht auf der Anmeldeseite');
});

test('Verschiebung mit Lage: von/nach (y) und Höhe je Knoten im Bericht, nur Zahlen',async()=>{
 const {topShiftOf}=await import('../live-ladezeit.mjs');
 const ss=[{shifts:[{value:0.18,at:1353,sources:[{node:'SECTION#.hm-blick',previous:{y:900.4,height:300},current:{y:1020.6,height:300}}]}]}];
 const t=topShiftOf(ss);assert.deepEqual(t.moves,[{from:{y:900,h:300},to:{y:1021,h:300}}]);
 const md=reportMarkdown({measuredAt:'t',commit:'c',runs:3,historyRuns:0,alarms:[],rows:[{key:'app/',cpu:4,lcp:1,cls:0.18,requests:1,bytes:1024,runs:3,invalidRuns:0,lcpRuns:[1],topShift:t}]});
 assert.match(md,/SECTION#\.hm-blick \(y 900→1021, h 300→300\)/);
});

test('Technical-Unterseiten (Screener, Chart NVDA) mit Inhaltsmerkmal, ohne Ziel (Anfrage Technical K3)',()=>{
 for(const k of ['app/technical/#/screener','app/technical/#/chart/NVDA']){
  assert.ok(SITES.app.routes.includes(k.replace('app','')),k+' wird gemessen');
  assert.ok(targets.routes[k].marker,k+' hat ein Inhaltsmerkmal');assert.equal(targets.routes[k].lcpMs,undefined,'kein Ziel vor dem ersten gültigen Lauf');
 }
});
