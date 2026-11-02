/* Local, read-only browser gate. Output must be outside production data. */
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('../../../',import.meta.url)), out=resolve(process.argv[process.argv.indexOf('--out')+1]||'/tmp/academy-qa');
if(!process.argv.includes('--out'))throw Error('Pass --out DIR');
const content=JSON.parse(await readFile(root+'technical/academy/content.json','utf8'));
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.gz':'application/gzip','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';const f=resolve(root,'.'+p);if(!f.startsWith(root))throw Error('path');res.setHeader('content-type',types[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));await mkdir(out,{recursive:true});
const base='http://127.0.0.1:'+server.address().port+'/technical/',browser=await chromium.launch(),results=[];
const assert=(x,msg)=>{if(!x)throw Error(msg);};
async function check(name,fn){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
try{
for(const width of [360,390,1280])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:width<500,hasTouch:width<500});
 await context.addInitScript(t=>localStorage.setItem('vu-discover-theme-v1',t),theme);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const prefix=width+'-'+theme;
 async function overflow(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');}
 await check(prefix+' catalog/navigation',async()=>{await page.goto(base+'#/akademie');await page.getByRole('heading',{name:'Strategie-Akademie',exact:true}).waitFor();assert(await page.locator('.ta-paths section').count()===8,'8 paths');assert(await page.locator('.ta-paths li').count()===32,'32 lessons');await overflow();await page.screenshot({path:out+'/'+prefix+'-katalog.png',fullPage:true});});
 await check(prefix+' all 32 lessons',async()=>{
  for(const l of content.lessons){await page.goto(base+'#/akademie/'+l.id);await page.getByRole('heading',{name:l.title,exact:true}).waitFor();assert(await page.locator('.ta h2').count()===8,'complete sections '+l.id);assert(await page.locator('figure').count()===1,'visual');assert(await page.locator('input[type=radio]').count()===2,'answers');await overflow();}
 });
 await check(prefix+' quiz/progress/keyboard/practice',async()=>{
  await page.goto(base+'#/akademie/struktur-1');await page.locator('fieldset').waitFor();await page.locator('input[value=b]').check();await page.getByRole('button',{name:'Antwort prüfen'}).click();await page.getByRole('status').filter({hasText:'Noch nicht richtig'}).waitFor();
  await page.locator('input[value=a]').check();await page.getByRole('button',{name:'Antwort prüfen'}).click();await page.getByRole('status').filter({hasText:'Richtig.'}).waitFor();
  const mark=page.getByRole('button',{name:'Lektion als abgeschlossen markieren'});await mark.focus();await page.keyboard.press('Enter');assert(await page.getByRole('button',{name:'Abschluss aufheben'}).getAttribute('aria-pressed')==='true','keyboard mark');
  await page.reload();await page.getByRole('button',{name:'Abschluss aufheben'}).waitFor();await page.screenshot({path:out+'/'+prefix+'-lektion.png',fullPage:true});
  await page.getByRole('link',{name:'Chart Studio öffnen und Titel wählen'}).click();await page.getByRole('heading',{name:'Chart Studio',exact:true}).waitFor();
  await page.goto(base+'#/akademie/trend-4');await page.getByRole('link',{name:'Etablierte Trendvorlage öffnen'}).click();await page.getByRole('heading',{name:'Etablierter Aufwärtstrend',exact:true}).waitFor();
  await page.goto(base+'#/akademie/routine-1');await page.getByRole('link',{name:'Im Analyse-Assistenten anwenden'}).click();await page.getByRole('heading',{name:'Kriterien kombinieren',exact:true}).waitFor();
 });
 await check(prefix+' glossary/not-found/errors',async()=>{
  await page.goto(base+'#/akademie/glossar');await page.getByRole('heading',{name:'Glossar',exact:true}).waitFor();assert(await page.locator('.ta section').count()===content.glossary.length,'glossary');await overflow();
  await page.goto(base+'#/akademie/missing');await page.getByRole('heading',{name:'Lektion nicht gefunden'}).waitFor();assert(!errors.length,errors.join('\n').slice(0,600));
 });
 await context.close();
}
await check('blocked storage / safe text / load retry',async()=>{
 const context=await browser.newContext();await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}});});const page=await context.newPage();
 await page.route('**/technical/academy/content.json',r=>r.abort());await page.goto(base+'#/akademie/struktur-1');await page.getByRole('button',{name:'Erneut versuchen'}).waitFor();
 await page.unroute('**/technical/academy/content.json');await page.route('**/technical/academy/content.json',r=>{const c=structuredClone(content);c.lessons[0].foundations[0]='<img src=x onerror="window.academyInjection=true">';return r.fulfill({json:c});});await page.getByRole('button',{name:'Erneut versuchen'}).click();await page.getByRole('button',{name:'Lektion als abgeschlossen markieren'}).click();await page.getByRole('status').filter({hasText:'Speichern ist gesperrt'}).waitFor();assert(await page.locator('.ta img').count()===0,'injected image');assert(await page.evaluate(()=>!window.academyInjection),'injected execution');await context.close();
});
}finally{await browser.close();server.close();}
await writeFile(out+'/report.json',JSON.stringify({results},null,2));console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,failures:results.filter(r=>!r.pass)},null,2));if(results.some(r=>!r.pass))process.exitCode=1;
