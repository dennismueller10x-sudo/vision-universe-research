#!/usr/bin/env node
// Visual Parity Gate der Discover-Konsolidierung.
// Nimmt dieselben Ansichten an zwei Adressen auf (vorher: /discover-v2/,
// nachher: /discover/) und vergleicht sie pixelweise im Browser.
// Aufnahme:  node scripts/discover/visual-parity.mjs capture --url http://127.0.0.1:8765 --path /discover/ --out /tmp/after
// Vergleich: node scripts/discover/visual-parity.mjs compare --before /tmp/before --after /tmp/after
import {createRequire} from 'node:module';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const playwright=require('playwright');
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1];};
const mode=process.argv[2];
const ROUTES=[
  ['home','#/'],['welten','#/welten'],['thema','#/thema/kuenstliche-intelligenz'],['thema-ohne-reihe','#/thema/quantencomputing'],
  ['sammlung','#/c/US_REAL/market-leaders'],['feed','#/einzeln/US_REAL'],['aktie','#/s/US_REAL/NVDA'],['daten','#/daten'],
  ['thema-farbig','#/thema/elektromobilitaet'],
  ['fundamentals','#/s/US_REAL/NVDA',async page=>{await page.locator('#journey').scrollIntoViewIfNeeded();await page.waitForTimeout(900);}],
  // Zuletzt: die Suche bleibt als Overlay offen.
  ['suche','#/',async page=>{await page.keyboard.press('/');await page.waitForSelector('.dx-search.on input');await page.fill('.dx-search.on input','NVIDIA');await page.waitForTimeout(900);}]
];
const VIEWPORTS=[['320',320,720],['390',390,844],['1440',1440,900]];
const THEMES=['dark','light'];
if(mode==='capture'){
  const base=arg('url','http://127.0.0.1:8765').replace(/\/$/,''),path=arg('path','/discover/'),out=arg('out','/tmp/discover-parity');
  const engine=arg('engine','chromium');
  await mkdir(out,{recursive:true});
  const browser=await playwright[engine].launch({headless:true});
  const errors=[];
  for(const [vk,w,h] of VIEWPORTS)for(const theme of THEMES){
    const context=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,locale:'de-DE',timezoneId:'Europe/Berlin',reducedMotion:'reduce'});
    await context.addInitScript(t=>{try{localStorage.setItem('vu-discover-theme-v1',t);}catch(e){}},theme);
    // Echtzeit und externe Hosts ausblenden: der Vergleich prueft das
    // Frontend, nicht den Markt. Beide Seiten sehen dieselbe Sperre.
    await context.route(u=>!u.href.startsWith(base),r=>r.abort());
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push({vk,theme,error:e.message}));
    for(const [rk,hash,action] of ROUTES){
      await page.goto(base+path+hash,{waitUntil:'networkidle',timeout:60000});
      await page.waitForFunction(()=>document.querySelector('[aria-busy="false"]'),{},{timeout:30000}).catch(()=>{});
      if(action)await action(page);
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForTimeout(600);
      await page.screenshot({path:`${out}/${rk}-${vk}-${theme}.png`,fullPage:false,animations:'disabled'});
    }
    await context.close();
  }
  await browser.close();
  await writeFile(out+'/errors.json',JSON.stringify(errors,null,1));
  console.log(JSON.stringify({captured:ROUTES.length*VIEWPORTS.length*THEMES.length,errors:errors.length,out}));
}else if(mode==='compare'){
  const before=arg('before'),after=arg('after'),report=arg('report',after+'/parity.json');
  const browser=await playwright.chromium.launch({headless:true});const page=await browser.newPage();
  const rows=[];
  for(const name of (await readdir(before)).filter(n=>n.endsWith('.png')).sort()){
    let b,a;try{b=await readFile(before+'/'+name);a=await readFile(after+'/'+name);}catch{rows.push({name,missing:true});continue;}
    const r=await page.evaluate(async([b,a])=>{
      const load=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src='data:image/png;base64,'+src;});
      const [ib,ia]=await Promise.all([load(b),load(a)]);
      if(ib.width!==ia.width||ib.height!==ia.height)return {sizeMismatch:true};
      const px=img=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);return x.getImageData(0,0,c.width,c.height).data;};
      const db=px(ib),da=px(ia);let diff=0,minY=1e9,maxY=-1;
      for(let i=0;i<db.length;i+=4){if(Math.abs(db[i]-da[i])+Math.abs(db[i+1]-da[i+1])+Math.abs(db[i+2]-da[i+2])>24){diff++;const y=Math.floor(i/4/ib.width);if(y<minY)minY=y;if(y>maxY)maxY=y;}}
      return {diffPixels:diff,ratio:diff/(ib.width*ib.height),rows:diff?[minY,maxY]:null};
    },[b.toString('base64'),a.toString('base64')]);
    rows.push({name,...r});
  }
  await browser.close();
  await writeFile(report,JSON.stringify(rows,null,1));
  const identical=rows.filter(r=>r.diffPixels===0).length;
  console.log(JSON.stringify({compared:rows.length,identical,different:rows.filter(r=>r.diffPixels>0).map(r=>r.name+' '+(r.ratio*100).toFixed(2)+'% rows '+r.rows),missing:rows.filter(r=>r.missing||r.sizeMismatch).map(r=>r.name)},null,1));
}else{console.error('capture | compare');process.exit(2);}
