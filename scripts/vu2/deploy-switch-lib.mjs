// Gemeinsame Bausteine der Deployment-Wechsel-QA (Quant: scripts/vu2/deploy-switch-qa.mjs, Discover: scripts/discover/deploy-switch-qa.mjs).
//
// Zwei kleine Releases (A, B) aus dem ECHTEN Code des Repositories - quant/ui/release-guard.js, quant/ui/shell.js, die Kennung der
// Pipeline (release-id.mjs) und die Passwortsperre (scripts/access-gate/build.mjs). Nur die Seite dazwischen ist ein Stand-in.
// Ein Tab von A bleibt offen, der Server liefert danach B aus (Symlink-Tausch wie das Deployment).
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {stampRelease} from './release-id.mjs';
import {protectRelease,accessStateFor,STORAGE_KEY} from '../access-gate/build.mjs';

export const repo=resolve(fileURLToPath(import.meta.url),'../../..');
export const PASSWORD='deploy-switch-qa';
export const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1];};
export const flag=k=>process.argv.includes('--'+k);
export const wait=ms=>new Promise(r=>setTimeout(r,ms));

/** Release aus Textdateien (files) und Dateien des Repositories (copy), gestempelt und hinter der Sperre. */
export async function buildRelease(name,{files,copy=[]}){
 const dir=await mkdtemp(join(tmpdir(),'deploy-switch-'+name+'-'));
 for(const [path,text] of Object.entries(files)){await mkdir(join(dir,path,'..'),{recursive:true});await writeFile(join(dir,path),text);}
 for(const f of copy){await mkdir(join(dir,f,'..'),{recursive:true});await cp(join(repo,f),join(dir,f));}
 const ids=await stampRelease(dir,{commit:name.repeat(40).slice(0,40)});
 await protectRelease({output:dir,password:PASSWORD});
 return {dir,ids};
}

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'};
/** Server wie GitHub Pages (max-age=600, ETag). state.root = ausgeliefertes Release; state.staleHtml = veralteter Rand fuer die Seiten. */
export function serve(state,pagePattern){
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://x');let path=decodeURIComponent(url.pathname);
   if(path.endsWith('/'))path+='index.html';
   let root=state.root;if(state.staleHtml&&pagePattern.test(path))root=state.staleHtml;
   const body=await readFile(join(root,path));
   const etag='W/"'+createHash('sha1').update(body).digest('hex').slice(0,16)+'"';
   const headers={'content-type':TYPES[extname(path)]||'application/octet-stream','cache-control':'max-age=600',etag};
   if(req.headers['if-none-match']===etag){res.writeHead(304,headers);return res.end();}
   res.writeHead(200,headers);res.end(body);
  }catch{res.writeHead(404,{'cache-control':'max-age=600'});res.end('404');}
 });
 return new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server)));
}

/** Neuer Browserkontext mit gueltigem Zugang; optional ohne sessionStorage. log.loads zaehlt Dokument-Ladungen (Neuladen). */
export async function openTab(browser,{storage=true}={}){
 const ctx=await browser.newContext({viewport:{width:1100,height:800}});
 const state=JSON.stringify(accessStateFor(PASSWORD));
 await ctx.addInitScript(([key,value,blockSession])=>{
  try{if(!localStorage.getItem(key))localStorage.setItem(key,value);}catch{}
  if(blockSession){try{Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('blocked','SecurityError');}});}catch{}}
 },[STORAGE_KEY,state,!storage]);
 const page=await ctx.newPage();
 const log={loads:0,errors:[]};
 page.on('load',()=>{log.loads++;});
 page.on('pageerror',e=>log.errors.push(e.message));
 return {ctx,page,log};
}

export function recorder(){
 const results=[];
 return {results,record(engine,name,ok,detail){results.push({engine,name,ok,detail});console.log((ok?'PASS ':'FAIL ')+engine.padEnd(8)+name+(detail?'  '+detail:''));}};
}

export async function launch(playwright,engine){
 return playwright[engine].launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[],...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
}

/** Abschluss: Ergebnis ausgeben, aufraeumen, Exit-Code. Gegenprobe (--without-guard): mindestens `minimum` Szenarien muessen scheitern. */
export async function finish({results,dirs,withoutGuard,minimum,controlPattern}){
 for(const d of dirs)await rm(d,{recursive:true,force:true});
 const failed=results.filter(r=>!r.ok);
 if(arg('out')){await mkdir(arg('out'),{recursive:true});await writeFile(join(arg('out'),'deploy-switch-qa.json'),JSON.stringify({results},null,1));}
 if(withoutGuard){
  const seen=results.filter(r=>!r.ok&&controlPattern.test(r.name)).length;
  console.log(seen>=minimum?`Gegenprobe bestanden: ohne Waechter scheitern ${seen} Szenarien`:'Gegenprobe FEHLGESCHLAGEN: der Test sieht den Fehler nicht');
  process.exit(seen>=minimum?0:1);
 }
 console.log(failed.length?`${failed.length} von ${results.length} Pruefungen fehlgeschlagen`:`alle ${results.length} Pruefungen bestanden`);
 process.exit(failed.length?1:0);
}
export const requirePlaywright=()=>createRequire(import.meta.url)('playwright');
