#!/usr/bin/env node
// Beleg fuer die Abonnements der Startseiten-Billboard-Reihe ("Heute im Blick") im ECHTEN Chromium:
// die echte Discover-Startseite (discover/index.html mit allen Skripten) laeuft mit den Repo-Daten; Anfragen an
// http://vu.test werden im Prozess aus dem Dateisystem beantwortet (page.route), es gibt weder Server noch Attrappe.
// DOM, Layout und IntersectionObserver sind echt. Gemessen werden die Zaehler des Live-Hubs (LiveHub.stats()):
//   A geladen        fuenf Abonnenten, fuenf Tagesverlaeufe (jede Folie, auch die seitlich verdeckten)
//   B weggescrollt   die Reihe ist aus dem Bild: alle gekuendigt
//   C zurueck        die Reihe ist wieder im Bild: alle fuenf wieder abonniert
//   D Routenwechsel  #/maerkte: Startseite abgebaut, keine Abonnenten mehr
// Aufruf: node scripts/discover/home-billboard-abos.mjs [repo-wurzel]
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const ORIGIN='http://vu.test';
const TYPEN={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon','.txt':'text/plain'};

export async function messeStartseite(root,{chromium}={}){
 chromium=chromium||require('playwright').chromium;
 const wurzel=path.resolve(root);
 const browser=await chromium.launch();
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  const fehler=[];page.on('pageerror',e=>fehler.push(String(e).slice(0,160)));
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==ORIGIN)return route.abort();
   let f=path.join(wurzel,decodeURIComponent(u.pathname));
   if(!f.startsWith(wurzel))return route.fulfill({status:403,body:''});
   try{
    if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
    if(!fs.existsSync(f))return route.fulfill({status:404,body:'nicht da'});
    return route.fulfill({status:200,contentType:TYPEN[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)});
   }catch(e){return route.fulfill({status:500,body:String(e)});}
  });
  await page.goto(ORIGIN+'/discover/',{waitUntil:'networkidle',timeout:60000});
  await page.waitForTimeout(2500);
  const zaehler=()=>page.evaluate(()=>{const st=window.VUDiscover.LiveHub.stats();
   return {abonnenten:st.subscribers,abos:st.subscriptions,kuendigungen:st.unsubscriptions,
    verlaeufe:document.querySelectorAll('.dr-bb__slide [data-art="intraday"]').length,folien:document.querySelectorAll('.dr-bb__slide').length};});
  const out={};
  out.A_geladen=await zaehler();
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(1500);
  out.B_weggescrollt=await zaehler();
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(1500);
  out.C_zurueck=await zaehler();
  await page.evaluate(()=>{location.hash='#/maerkte';});await page.waitForTimeout(2000);
  out.D_routenwechsel=await zaehler();
  out.seitenfehler=fehler;
  return out;
 }finally{await browser.close();}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.argv[2]||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
 console.log(JSON.stringify(await messeStartseite(root),null,1));
}
